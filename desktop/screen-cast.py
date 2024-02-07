#!/usr/bin/python3

from pydbus import SessionBus
from dbus.mainloop.glib import DBusGMainLoop

from evdev import InputDevice, list_devices, ecodes
import gi

gi.require_version('Gst', '1.0')
from gi.repository import GLib, GObject, Gst

# TODO - the run-as user needs to be in the input group
# Create an input device for your mouse (replace 'event3' with your actual mouse device)
devices = [InputDevice(path) for path in list_devices()]

mice = [dev for dev in devices if ecodes.BTN_MOUSE in dev.capabilities().get(ecodes.EV_KEY, [])]
mice += [dev for dev in devices if ecodes.BTN_TOUCH in dev.capabilities().get(ecodes.EV_KEY, [])]

keyboards = [dev for dev in devices if ecodes.KEY_F1 in dev.capabilities().get(ecodes.EV_KEY, [])]

for mouse in mice:
    print(f"Mouse: {mouse}")

for keyboard in keyboards:
    print(f"Keyboard: {keyboard}")

# mapping of mouse ecodes to remotedesktop keycodes
mouse_event_code_to_gnome_keycode_map = {
    ecodes.BTN_MOUSE: 272,
    ecodes.BTN_LEFT: 272,
    ecodes.BTN_RIGHT: 273,
    ecodes.BTN_MIDDLE: 274,
    ecodes.BTN_TOUCH: 272,
    ecodes.BTN_TL: 272,
    ecodes.BTN_TR: 273,
}

# Function to handle mouse events
last_touchpad_x = None
last_touchpad_y = None
def handle_mouse_event(fd, condition, device):
    for event in device.read():
        if event.type == ecodes.EV_KEY:
            if event.code in mouse_event_code_to_gnome_keycode_map:
                remote_desktop_session.NotifyPointerButton(mouse_event_code_to_gnome_keycode_map[event.code], event.value)
            else:
                print(f"Unknown mouse button: {event.code}")
        elif event.type == ecodes.EV_REL:
            if event.code == ecodes.REL_X:
                remote_desktop_session.NotifyPointerMotionRelative(event.value, 0)
            elif event.code == ecodes.REL_Y:
                remote_desktop_session.NotifyPointerMotionRelative(0, event.value)
        elif event.type == ecodes.EV_ABS and stream_path is not None:
            global last_touchpad_x, last_touchpad_y
            if event.code in {ecodes.ABS_X, ecodes.ABS_MT_POSITION_X}:
                last_touchpad_x = event.value
            elif event.code in {ecodes.ABS_Y, ecodes.ABS_MT_POSITION_Y}:
                last_touchpad_y = event.value

            # TODO - translate to relative movements so lifting your finger doesn't change the abs position of the cursor
            if last_touchpad_x is not None and last_touchpad_y is not None:
                remote_desktop_session.NotifyPointerMotionAbsolute(stream_path, last_touchpad_x, last_touchpad_y)
    return True


# Function to handle keyboard events
def handle_keyboard_event(fd,condition, device):
    for event in device.read():
        if event.type == ecodes.EV_KEY:
            remote_desktop_session.NotifyKeyboardKeycode(event.code, event.value)
    return True

# Add the devices to the GLib main loop
for mouse in mice:
    GLib.io_add_watch(mouse.fd, GLib.IO_IN, handle_mouse_event, mouse)

for keyboard in keyboards:
    GLib.io_add_watch(keyboard.fd, GLib.IO_IN, handle_keyboard_event, keyboard)

DBusGMainLoop(set_as_default=True)
Gst.init(None)

loop = GLib.MainLoop()

bus = SessionBus()
screen_cast_iface = 'org.gnome.Mutter.ScreenCast'
screen_cast_session_iface = 'org.gnome.Mutter.ScreenCast.Session'

remote_desktop_iface = 'org.gnome.Mutter.RemoteDesktop'
remote_desktop_session_iface = 'org.gnome.Mutter.RemoteDesktop.Session'

remote_desktop = bus.get(remote_desktop_iface, '/org/gnome/Mutter/RemoteDesktop')
remote_desktop_session_path = remote_desktop.CreateSession()
remote_desktop_session = bus.get(remote_desktop_iface, remote_desktop_session_path)

print("remote desktop session id: %s" % remote_desktop_session.SessionId)

screen_cast = bus.get(screen_cast_iface, '/org/gnome/Mutter/ScreenCast')
screen_case_session_path = screen_cast.CreateSession(
    {'remote-desktop-session-id': GLib.Variant('s', remote_desktop_session.SessionId)})
print("session path: %s" % screen_case_session_path)
screen_cast_session = bus.get(screen_cast_iface, screen_case_session_path)

stream_path = screen_cast_session.RecordVirtual({'cursor-mode': GLib.Variant('u', 1)})
format_element = "video/x-raw,max-framerate=60/1,width=%d,height=%d !" % (1920, 1080)

print("format_element: %s" % format_element)
print("stream path: %s" % stream_path)
stream = bus.get(screen_cast_iface, stream_path)

pipeline = None


def terminate():
    global pipeline
    print("pipeline: " + str(pipeline))
    if pipeline is not None:
        print("draining pipeline")
        pipeline.send_event(Gst.Event.new_eos())
        pipeline.set_state(Gst.State.NULL)
    print("stopping")
    remote_desktop_session.Stop()
    loop.quit()


def on_message(bus, message):
    type = message.type
    if type == Gst.MessageType.EOS or type == Gst.MessageType.ERROR:
        terminate()

def on_pipewire_stream_added(node_id):
    global pipeline

    pipeline_str = (
            'pipewiresrc path=%u ! videoconvert ! videoscale ! %s videoconvert ! videobox border-alpha=0 left=-1 ! mix. '
            'videotestsrc pattern="black" ! video/x-raw,width=1,height=1,framerate=1/1 ! videobox border-alpha=0 right=-1 ! mix. '
            'compositor name=mix ! videoconvert ! vulkanupload ! vulkansink ' % (node_id, format_element)
    )
    print(pipeline_str)
    pipeline = Gst.parse_launch(pipeline_str)

    pipeline.set_state(Gst.State.PLAYING)
    pipeline.get_bus().connect('message', on_message)


stream.onPipeWireStreamAdded = on_pipewire_stream_added

remote_desktop_session.Start()

try:
    loop.run()
except KeyboardInterrupt:
    print("interrupted")
    terminate()
