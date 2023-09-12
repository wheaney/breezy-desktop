#include <gst/gst.h>
#include <glib.h>
#include <device3.h>
#include <stdio.h>
#include <iostream>
#include <thread>
#include <math.h>
#include <mutex>

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
        case GST_MESSAGE_ERROR: {
            gchar  *debug;
            GError *error;

            gst_message_parse_error (msg, &error, &debug);
            g_free (debug);

            g_printerr ("Error: %s\n", error->message);
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
float min_box_width_for_angle(float angle_degrees, float width, float height) {
    float radians = degrees_to_radians(angle_degrees);
    return abs(width * cos(radians)) + abs(height * sin(radians));
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
//        float min_box_width = min_box_width_for_angle(roll_offset, effective_display_w, effective_display_h);
//        float min_box_height = min_box_width / effective_display_w * effective_display_h;

        float top = pitch_offset * effective_sensitivity;
        float left = yaw_offset * effective_sensitivity;
        GstElement *pipeline = GST_ELEMENT(data);
        GstElement *videobox = gst_bin_get_by_name(GST_BIN(pipeline), "videobox");
        g_object_set (videobox, "top", (gint)round(top), NULL);
        g_object_set (videobox, "left", (gint)round(left), NULL);
        g_object_set (videobox, "bottom", (gint)round(ximage_height-effective_display_h-top), NULL);
        g_object_set (videobox, "right", (gint)round(ximage_width-effective_display_w-left), NULL);
        gst_object_unref(videobox);
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
    std::cout << "\tConnected, rendering virtual desktop\n";
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
            std::cout << "no dimenions";
        } else {
            printf("found width: %d, height: %d\n", ximage_width, ximage_height);
        }
   }
   return GST_PAD_PROBE_OK;
}

void stream_video() {
    GMainLoop *loop;
    GstCaps *video_caps;
    GstBus *bus;

    gst_init (NULL, NULL);

    loop = g_main_loop_new (NULL, FALSE);

    GError *error = NULL;
    char *pipeline_desc = g_strdup_printf(
        "ximagesrc use-damage=0 ! videobox name=videobox ! videoscale ! video/x-raw, framerate=%d/1, width=%d, height=%d ! ximagesink",
        frames_per_sec, display_width, display_height
    );
    GstElement *pipeline = gst_parse_launch(pipeline_desc, &error);

    if (error) {
      g_printerr("Failed to parse pipeline: %s\n", error->message);
      g_clear_error(&error);
      exit(1);
    }

//    GstPad *pad = gst_element_get_static_pad(source, "srcpad");
//    gst_pad_add_probe(pad, GST_PAD_PROBE_TYPE_EVENT_BOTH, pad_cb, NULL, NULL);
//    gst_object_unref(pad);

    bus = gst_pipeline_get_bus (GST_PIPELINE (pipeline));
    gst_bus_add_watch (bus, bus_call, loop);
    gst_object_unref (bus);

    gst_element_set_state (pipeline, GST_STATE_PLAYING);
    g_timeout_add(1000 / head_movement_fps, update_crop, pipeline);
    g_main_loop_run (loop);

    std::cout << "Ending\n";
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(GST_OBJECT(pipeline));
}

int main (int argc, char *argv[]) {
    while (1) {
        bool first_pass=true;
        while (device3_open(&glasses_imu, handle_device_3) != DEVICE3_ERROR_NO_ERROR) {
            if (first_pass) std::cout << "Waiting for glasses\n";

            // TODO - move to a blocking check, rather than polling for device availability
            // retry every 5 seconds until the device becomes available
            device3_close(&glasses_imu);
            std::this_thread::sleep_for(std::chrono::seconds(5));

            first_pass=false;
        }
        glasses_ready=true;

        // kick off threads to monitor glasses and config file, wait for both to finish (glasses disconnected)
        std::thread glasses_imu_thread(poll_glasses_imu);
        std::this_thread::sleep_for(std::chrono::seconds(10));
        std::thread stream_video_thread(stream_video);
        glasses_imu_thread.join();
        stream_video_thread.join();

        if (debug_threads)
            std::cout << "\tdebug: All threads have exited, starting over\n";

        device3_close(&glasses_imu);

        force_reset_threads = false;
    }

    return 0;
}