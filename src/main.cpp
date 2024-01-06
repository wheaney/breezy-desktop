#include <gst/gst.h>
#include <gst/video/videooverlay.h>
#include <GL/glew.h>
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

static void glfw_error_callback(int error, const char* description)
{
    fprintf(stderr, "Glfw Error %d: %s\n", error, description);
}

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

static void create_overlay_window(const char *glsl_version, GLFWwindow **captureWindow, GLFWwindow **renderWindow) {
    printf("create_overlay_window 1\n");

    GLFWmonitor *monitor = glfwGetPrimaryMonitor();
//    const GLFWvidmode* mode = glfwGetVideoMode(monitor);
//
//    glfwWindowHint(GLFW_RED_BITS, mode->redBits);
//    glfwWindowHint(GLFW_GREEN_BITS, mode->greenBits);
//    glfwWindowHint(GLFW_BLUE_BITS, mode->blueBits);
//    glfwWindowHint(GLFW_REFRESH_RATE, mode->refreshRate);

    glfwWindowHint(GLFW_TRANSPARENT_FRAMEBUFFER, GLFW_FALSE);
    glfwWindowHint(GLFW_VISIBLE, GLFW_FALSE); // Make the window initially invisible
    *captureWindow = glfwCreateWindow(1280, 800, "breezy capture Layer", monitor, NULL);
    if (!*captureWindow) {
        glfwTerminate();
        exit(-1);
    }
    glfwSetWindowPos(*captureWindow, 100, 100); // Set the window position
    glfwShowWindow(*captureWindow);

    glfwMakeContextCurrent(*captureWindow);
    glClear(GL_COLOR_BUFFER_BIT);
    glfwSwapInterval(1); // Enable vsync

//    glfwWindowHint(GLFW_TRANSPARENT_FRAMEBUFFER, GLFW_FALSE);
//    *renderWindow = glfwCreateWindow(mode->width, mode->height, "breezy rendering Layer", monitor, NULL);
//    if (!renderWindow) {
//        glfwTerminate();
//        exit(-1);
//    }
//
//    glfwMakeContextCurrent(*renderWindow);
    glClear(GL_COLOR_BUFFER_BIT);
    glfwSwapInterval(1); // Enable vsync

    printf("create_overlay_window 7\n");
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
        // Setup window
        glfwSetErrorCallback(glfw_error_callback);
        if (!glfwInit())
            exit(1);

        const char* glsl_version = "#version 130";
        glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
        glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 0);

        // Create window with graphics context
        GLFWwindow *captureWindow;
        GLFWwindow *renderWindow;
        create_overlay_window(glsl_version, &captureWindow, &renderWindow);
        printf("here1\n");

//        Display *x11_display = glfwGetX11Display();
        Window x11_capture_window = glfwGetX11Window(captureWindow);
//        Window x11_render_window = glfwGetX11Window(renderWindow);
        printf("here2\n");
//        Atom overlay_atom = XInternAtom (x11_display, GamescopeOverlayProperty, False);
        // Initialize OpenGL loader

        bool err = glewInit() != GLEW_OK;

        if (err)
        {
            fprintf(stderr, "Failed to initialize OpenGL loader!\n");
            exit(1);
        }

    printf("stream_video 1\n");
    GMainLoop *loop;
    GstCaps *video_caps;
    GstBus *bus;

    gst_init (NULL, NULL);

    loop = g_main_loop_new (NULL, FALSE);

    GError *error = NULL;
    // ximagesrc use-damage=0 ! videobox name=videobox ! glupload ! queue ! gltransformation name=transform ! gldownload ! videobox autocrop=true ! video/x-raw, width=1280, height=800 ! ximagesink
    //
    // worked in gamescope: DISPLAY=:0 SteamDeck=1 GST_PLUGIN_PATH=/home/deck/homebrew/plugins/decky-recorder/bin/gstreamer-1.0/ LD_LIBRARY_PATH=/home/deck/homebrew/plugins/decky-recorder/bin GST_DEBUG=4 ~/Downloads/breezyDesktop
    // another interesting one: WAYLAND_DISPLAY=gamescope-1 DISPLAY=:0 SteamDeck=1 GST_PLUGIN_PATH=/home/deck/homebrew/plugins/decky-recorder/bin/gstreamer-1.0/ LD_LIBRARY_PATH=/home/deck/homebrew/plugins/decky-recorder/bin GST_DEBUG=4 ~/Downloads/breezyDesktop
    //
    // working gamescope pipeline from decky-recorder:
    //     GST_VAAPI_ALL_DRIVERS=1 GST_PLUGIN_PATH=/home/deck/homebrew/plugins/decky-recorder/bin/gstreamer-1.0/ LD_LIBRARY_PATH=/home/deck/homebrew/plugins/decky-recorder/bin GST_DEBUG=4 gst-launch-1.0 -vvv pipewiresrc do-timestamp=true ! vaapipostproc ! queue ! vaapih264enc ! h264parse ! mp4mux name=sink ! filesink location=/home/deck/test.mp4
    char gst_pipeline_def[1024];
    snprintf(gst_pipeline_def, 1024, "ximagesrc use-damage=0 xid=%lu ! vaapipostproc ! queue ! vaapih264enc ! h264parse ! matroskamux name=sink ! filesink location=\"/home/deck/Videos/test_0105.mp4\" pulsesrc device=\"Recording_alsa_output.pci-0000_04_00.5-platform-acp5x_mach.0.HiFi__hw_acp5x_1__sink.monitor\" ! audio/x-raw, channels=2 ! audioconvert ! lamemp3enc target=bitrate bitrate=192000 cbr=true ! sink.audio_0", x11_capture_window);
    GstElement *pipeline = gst_parse_launch(gst_pipeline_def, &error);
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

//    GstElement *sink = gst_bin_get_by_name(GST_BIN(pipeline), "sink");
//    gst_video_overlay_set_window_handle (GST_VIDEO_OVERLAY (sink), x11_render_window);

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