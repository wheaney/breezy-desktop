#include <gst/gst.h>
#include <gst/video/videooverlay.h>
#include <glib.h>
#include <device3.h>
#include <stdio.h>
#include <iostream>
#include <thread>
#include <math.h>
#include <mutex>
#include <X11/X.h>
#include <X11/Xatom.h>
#include <GLFW/glfw3.h>
#include <X11/Xlib.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <unistd.h>
#include <string.h>
#include <dirent.h>
#include <fcntl.h>

#define GLFW_EXPOSE_NATIVE_X11
#include <GLFW/glfw3native.h>

static const char *GamescopeOverlayProperty = "GAMESCOPE_EXTERNAL_OVERLAY";

std::mutex imu_data_mutex;

device3_type glasses_imu;
bool glasses_ready=false;
bool force_reset_threads=false;
bool debug_threads=false;
bool captured_starting_euler=false;
device3_vec3_type starting_euler;
device3_vec3_type last_euler;

// TODO - pull this from the video
int ximage_width = 2560 * 2;
int ximage_height = 1440;

// higher number zooms in (shows less), lower zooms out (shows more)
float zoom = 0.8;

// FPS is for capturing video, higher value makes for smoother visuals for things that change on screen (e.g. mouse movements),
// head movement FPS is how often we update placement of the screen, we probably want to cap this at a lower value;
// higher values are probably less valuable and also caused segfaults from gstreamer (might be due to underpowered hardware)
int frames_per_sec = 30;
int head_movement_fps = 20;
int sensitivity = 40;

int display_width = 1920;
int display_height = 1080;

static gboolean bus_call (GstBus *bus, GstMessage *msg, gpointer data) {
    GMainLoop *loop = (GMainLoop *) data;

    switch (GST_MESSAGE_TYPE (msg)) {
        case GST_MESSAGE_EOS:
            g_main_loop_quit (loop);
            break;
        case GST_MESSAGE_INFO: {
            gchar  *debug;
            GError *error;

            gst_message_parse_info (msg, &error, &debug);
            g_free (debug);

            printf("Info: %s\n", error->message);
            g_error_free (error);

//            g_main_loop_quit (loop);
            break;
        }
        case GST_MESSAGE_WARNING: {
            gchar  *debug;
            GError *error;

            gst_message_parse_warning (msg, &error, &debug);
            g_free (debug);

            printf("Warning: %s\n", error->message);
            g_error_free (error);

//            g_main_loop_quit (loop);
            break;
        }
        case GST_MESSAGE_ERROR: {
            gchar  *debug;
            GError *error;

            gst_message_parse_error (msg, &error, &debug);
            g_free (debug);

            printf("Error: %s\n", error->message);
            g_error_free (error);

            g_main_loop_quit (loop);
            break;
        }
        default:
            break;
    }
    return TRUE;
}

// Starting from degree 0, 180 and -180 are the same. If the previous value was 179 and the new value is -179,
// the diff is 2 (-179 is equivalent to 181). This function takes the diff and then adjusts it if it detects
// that we've crossed the +/-180 threshold.
float degree_delta(float prev, float next) {
    float delta = fmod(prev - next, 360);
    if (isnan(delta)) {
        printf("nan value\n");
        exit(1);
    }

    if (delta > 180) {
        return delta - 360;
    } else if (delta < -180) {
        return delta + 360;
    }

    return delta;
}

static float degrees_to_radians(float degrees) {
    return degrees * M_PI / 180;
}

// we still want to rotate and re-crop the image within this box, so crop it as small as possible while still leaving
// room for the final crop after rotation
float min_box_length_for_angle(float angle_degrees, float length, float adj_length) {
    float radians = degrees_to_radians(angle_degrees);
    return abs(length * cos(radians)) + abs(adj_length * sin(radians));
}

gboolean update_crop (gpointer data) {
    imu_data_mutex.lock();
    if (captured_starting_euler) {
        float yaw_offset = degree_delta(starting_euler.z, last_euler.z); // left/right
        float pitch_offset = degree_delta(starting_euler.y, last_euler.y); // up/down
        float roll_offset = degree_delta(starting_euler.x, last_euler.x); // rotate

        // e.g. if the virtual monitor is further away (zoomed-out) then moving is more sensitive
        float effective_sensitivity = sensitivity / zoom;

        // e.g. if we're zoomed out, our field of view is larger, we should crop a larger visible area that will get
        // scaled down to our actual display size by the videoscale plugin
        float effective_display_w = display_width / zoom;
        float effective_display_h = display_height / zoom;
        float box_width = min_box_length_for_angle(roll_offset, effective_display_w, effective_display_h);
        float box_height = min_box_length_for_angle(roll_offset, effective_display_h, effective_display_w);

        float width_delta = box_width - display_width;
        float height_delta = box_height - display_height;

        int top = round(pitch_offset * effective_sensitivity + height_delta / 2);
        int left = round(yaw_offset * effective_sensitivity + width_delta / 2);
        int bottom = round(ximage_height-box_height-top);
        int right = round(ximage_width-box_width-left);

        // TODO - use dynamic controllable parameters: https://gstreamer.freedesktop.org/documentation/application-development/advanced/dparams.html?gi-language=c
        GstElement *pipeline = GST_ELEMENT(data);
        GstElement *videobox = gst_bin_get_by_name(GST_BIN(pipeline), "crop");
//        printf("%d %d %d %d %f\n", top, left, bottom, right, roll_offset);
        g_object_set (videobox, "top", (gint)top, NULL);
        g_object_set (videobox, "left", (gint)left, NULL);
        g_object_set (videobox, "bottom", (gint)bottom, NULL);
        g_object_set (videobox, "right", (gint)right, NULL);
        gst_object_unref(videobox);

//        GstElement *transform = gst_bin_get_by_name(GST_BIN(pipeline), "transform");
//        g_object_set (transform, "rotation-z", (gfloat)roll_offset, NULL);
//        gst_object_unref(transform);
    }
    imu_data_mutex.unlock();
    return TRUE;
}

void handle_device_3(uint64_t timestamp,
                     device3_event_type event,
                     const device3_ahrs_type* ahrs) {
    if (event == DEVICE3_EVENT_UPDATE) {
        static device3_vec3_type prev_tracked;
        device3_quat_type q = device3_get_orientation(ahrs);
        imu_data_mutex.lock();
        last_euler = device3_get_euler(q);
        if (!captured_starting_euler) {
            starting_euler = last_euler;
            captured_starting_euler=true;
        }
        imu_data_mutex.unlock();
    }
}

void poll_glasses_imu() {
    printf("\tConnected, rendering virtual desktop\n");
    device3_clear(&glasses_imu);
    while (!force_reset_threads) {
        if (device3_read(&glasses_imu, 1) != DEVICE3_ERROR_NO_ERROR) {
            break;
        }
    }

    if (debug_threads)
        printf("\tdebug: Exiting glasses_imu thread\n");

    device3_close(&glasses_imu);
    glasses_ready=false;
}

GstPadProbeReturn pad_cb(GstPad *pad, GstPadProbeInfo *info, gpointer user_data) {
    GstEvent *event = GST_PAD_PROBE_INFO_EVENT(info);
    if (GST_EVENT_CAPS == GST_EVENT_TYPE(event)) {
        GstCaps * caps = gst_caps_new_any();
        gst_event_parse_caps(event, &caps);

        GstStructure *s = gst_caps_get_structure(caps, 0);

        gboolean res;
        res = gst_structure_get_int (s, "width", &ximage_width);
        res |= gst_structure_get_int (s, "height", &ximage_height);
        if (!res) {
            printf("no dimenions");
        } else {
            printf("found width: %d, height: %d\n", ximage_width, ximage_height);
        }
   }
   return GST_PAD_PROBE_OK;
}

static Window create_overlay_window() {
    printf("create_overlay_window 1\n");
    glfwInit();

    printf("create_overlay_window 2\n");
    GLFWwindow *window = glfwCreateWindow(1280, 800, "Gamescope overlay window", nullptr, nullptr);
    Display *x11_display = glfwGetX11Display();
    Window x11_window = glfwGetX11Window(window);
    printf("create_overlay_window 3\n");
    if (x11_window && x11_display) {
        printf("create_overlay_window 4\n");
        // Set atom for gamescope to render as an overlay.
        Atom overlay_atom = XInternAtom (x11_display, NULL, False);
        uint32_t value = 1;
        XChangeProperty(x11_display, x11_window, overlay_atom, XA_CARDINAL, 32, PropertyNewValue, (unsigned char *)&value, 1);
    }
    printf("create_overlay_window 5\n");

    glfwMakeContextCurrent(window);
    glfwSwapInterval(1); // Enable vsync
    printf("create_overlay_window 6\n");

    int windowX, windowY, windowHeight, windowWidth;
    GLFWmonitor *monitor = glfwGetPrimaryMonitor();
    glfwGetMonitorWorkarea(monitor, &windowX, &windowY, &windowWidth, &windowHeight);
    glfwSetWindowSize(window, windowWidth, windowHeight);
//    glEnable(GL_DEPTH_TEST);
//    glEnable(GL_BLEND);
//    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
//    glClearColor(0, 0, 0, 0);
//    glClear(GL_COLOR_BUFFER_BIT);
    glfwSwapBuffers(window);
    printf("create_overlay_window 7\n");

    return x11_window;
}

//static GstBusSyncReply create_window (GstBus * bus, GstMessage * message, GstPipeline * pipeline) {
//    // ignore anything but 'prepare-window-handle' element messages
//    printf("create_window 1\n");
//    if (!gst_is_video_overlay_prepare_window_handle_message (message))
//        return GST_BUS_PASS;
//
//    printf("create_window 2 %d\n", &window);
//    gst_video_overlay_set_window_handle (GST_VIDEO_OVERLAY (GST_MESSAGE_SRC (message)), (guintptr)&window);
//    gst_message_unref (message);
//    printf("create_window 3\n");
//
//    return GST_BUS_DROP;
// }

void stream_video() {
    Window win = create_overlay_window();

    printf("stream_video 1\n");
    GMainLoop *loop;
    GstCaps *video_caps;
    GstBus *bus;

    gst_init (NULL, NULL);

    loop = g_main_loop_new (NULL, FALSE);

    GError *error = NULL;
    // ximagesrc use-damage=0 ! videobox name=videobox ! glupload ! queue ! gltransformation name=transform ! gldownload ! videobox autocrop=true ! video/x-raw, width=1280, height=800 ! ximagesink
    //
    // in gamescope, set env var before wayland client commands: WAYLAND_DISPLAY=gamescope-0
    //
    // working gamescope pipeline from decky-recorder:
    //     GST_VAAPI_ALL_DRIVERS=1 GST_PLUGIN_PATH=/home/deck/homebrew/plugins/decky-recorder/bin/gstreamer-1.0/ LD_LIBRARY_PATH=/home/deck/homebrew/plugins/decky-recorder/bin GST_DEBUG=4 gst-launch-1.0 -vvv pipewiresrc do-timestamp=true ! vaapipostproc ! queue ! vaapih264enc ! h264parse ! mp4mux name=sink ! filesink location=/home/deck/test.mp4
    GstElement *pipeline = gst_parse_launch("pipewiresrc do-timestamp=true ! queue ! videoconvert ! glupload ! queue ! glimagesink sync=true name=sink", &error);
    printf("stream_video 2\n");

    if (error) {
      printf("Failed to parse pipeline: %s\n", error->message);
      g_clear_error(&error);
      exit(1);
    }

//    GstPad *pad = gst_element_get_static_pad(source, "srcpad");
//    gst_pad_add_probe(pad, GST_PAD_PROBE_TYPE_EVENT_BOTH, pad_cb, NULL, NULL);
//    gst_object_unref(pad);
    printf("stream_video 3\n");

    GstElement *sink = gst_bin_get_by_name(GST_BIN(pipeline), "sink");
    gst_video_overlay_set_window_handle (GST_VIDEO_OVERLAY (sink), win);

    bus = gst_pipeline_get_bus (GST_PIPELINE (pipeline));
    gst_bus_add_watch (bus, bus_call, loop);
//    gst_bus_set_sync_handler (bus, (GstBusSyncHandler) create_window, pipeline, NULL);
    gst_object_unref (bus);
    printf("stream_video 4\n");

    gst_element_set_state (pipeline, GST_STATE_PLAYING);
//    g_timeout_add(1000 / head_movement_fps, update_crop, pipeline);
    g_main_loop_run (loop);

    printf("Ending\n");
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(GST_OBJECT(pipeline));
}

// creates a file, if it doesn't already exist, in the user home directory with home directory permissions and ownership.
// this is helpful since the driver may be run with sudo, so we don't create files owned by root:root
static FILE* get_or_create_home_file(char *filename, char *mode, char *full_path, bool *created) {
    char *home_directory = getenv("HOME");
    snprintf(full_path, 1024, "%s/%s", home_directory, filename);
    FILE *fp = fopen(full_path, mode ? mode : "r");
    if (fp == NULL) {
        // Retrieve the permissions of the parent directory
        struct stat st;
        if (stat(home_directory, &st) == -1) {
            perror("stat");
            return NULL;
        }

        fp = fopen(full_path, "w");
        if (fp == NULL) {
            perror("Error creating config file");
            return NULL;
        }
        if (created != NULL)
            *created = true;

        // Set the permissions and ownership of the new file to be the same as the parent directory
        if (chmod(full_path, st.st_mode & 0777) == -1) {
            perror("Error setting file permissions");
            return NULL;
        }
        if (chown(full_path, st.st_uid, st.st_gid) == -1) {
            perror("Error setting file ownership");
            return NULL;
        }
    } else if (created != NULL) {
        *created = false;
    }

    return fp;
}

int main (int argc, char *argv[]) {
    // ensure the log file exists, reroute stdout and stderr there
    char log_file_path[1024];
    FILE *log_file = get_or_create_home_file(".xreal_driver_log", NULL, &log_file_path[0], NULL);
    fclose(log_file);
    freopen(log_file_path, "a", stdout);
    freopen(log_file_path, "a", stderr);

    // when redirecting stdout/stderr to a file, it becomes fully buffered, requiring lots of manual flushing of the
    // stream, this makes them unbuffered, which is fine since we log so little
    setbuf(stdout, NULL);
    setbuf(stderr, NULL);

    printf("testing\n");

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_RESIZABLE, 1);
    glfwWindowHint(GLFW_TRANSPARENT_FRAMEBUFFER, 1);
//    glfwWindowHintString(GLFW_X11_INSTANCE_NAME, "gamescope-0");
//    glfwWindowHintString(GLFW_X11_CLASS_NAME, "gamescope-0");
//    glfwWindowHintString(GLFW_WAYLAND_APP_ID, "gamescope-0");


    while (1) {
//        bool first_pass=true;
//        while (device3_open(&glasses_imu, handle_device_3) != DEVICE3_ERROR_NO_ERROR) {
//            if (first_pass) printf("Waiting for glasses\n");
//
//            // TODO - move to a blocking check, rather than polling for device availability
//            // retry every 5 seconds until the device becomes available
//            device3_close(&glasses_imu);
//            std::this_thread::sleep_for(std::chrono::seconds(5));
//
//            first_pass=false;
//        }
//        glasses_ready=true;

        // kick off threads to monitor glasses and config file, wait for both to finish (glasses disconnected)
//        std::thread glasses_imu_thread(poll_glasses_imu);
//        std::this_thread::sleep_for(std::chrono::seconds(10));
        std::thread stream_video_thread(stream_video);
//        glasses_imu_thread.join();
        stream_video_thread.join();

        if (debug_threads)
            printf("\tdebug: All threads have exited, starting over\n");

        device3_close(&glasses_imu);

        force_reset_threads = false;
    }

    return 0;
}