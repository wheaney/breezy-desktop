
from evdev import InputDevice, list_devices, ecodes
import gi
from gi.repository import GLib

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


class RemoteDesktopHandler:
    def __init__(self, remote_desktop_session, stream_path):
        self.remote_desktop_session = remote_desktop_session
        self.stream_path = stream_path
        self.last_touchpad_x = None
        self.last_touchpad_y = None

        # TODO - the run-as user needs to be in the input group
        # Create an input device for your mouse (replace 'event3' with your actual mouse device)
        devices = [InputDevice(path) for path in list_devices()]

        mice = [dev for dev in devices if ecodes.BTN_MOUSE in dev.capabilities().get(ecodes.EV_KEY, [])]
        mice += [dev for dev in devices if ecodes.BTN_TOUCH in dev.capabilities().get(ecodes.EV_KEY, [])]

        keyboards = [dev for dev in devices if ecodes.KEY_F1 in dev.capabilities().get(ecodes.EV_KEY, [])]

        for mouse in mice:
            GLib.io_add_watch(mouse.fd, GLib.IO_IN, self.handle_mouse_event, mouse)

        for keyboard in keyboards:
            GLib.io_add_watch(keyboard.fd, GLib.IO_IN, self.handle_keyboard_event, keyboard)

    def handle_mouse_event(self, fd, condition, device):
        for event in device.read():
            if event.type == ecodes.EV_KEY:
                if event.code in mouse_event_code_to_gnome_keycode_map:
                    self.remote_desktop_session.NotifyPointerButton(mouse_event_code_to_gnome_keycode_map[event.code], event.value)
                else:
                    print(f"Unknown mouse button: {event.code}")
            elif event.type == ecodes.EV_REL:
                if event.code == ecodes.REL_X:
                    self.remote_desktop_session.NotifyPointerMotionRelative(event.value, 0)
                elif event.code == ecodes.REL_Y:
                    self.remote_desktop_session.NotifyPointerMotionRelative(0, event.value)
            elif event.type == ecodes.EV_ABS:
                if event.code in {ecodes.ABS_X, ecodes.ABS_MT_POSITION_X}:
                    self.last_touchpad_x = event.value
                elif event.code in {ecodes.ABS_Y, ecodes.ABS_MT_POSITION_Y}:
                    self.last_touchpad_y = event.value

                if self.last_touchpad_x is not None and self.last_touchpad_y is not None:
                    self.remote_desktop_session.NotifyPointerMotionAbsolute(self.stream_path, self.last_touchpad_x, self.last_touchpad_y)
        return True

    def handle_keyboard_event(self, fd, condition, device):
        for event in device.read():
            if event.type == ecodes.EV_KEY:
                self.remote_desktop_session.NotifyKeyboardKeycode(event.code, event.value)
        return True