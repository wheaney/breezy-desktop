import sys
import threading
from gi.repository import GObject
from .time import LICENSE_WARN_SECONDS
from .xrdriveripc import XRDriverIPC

# shouldn't need a number larger than a year
LICENSE_ACTION_NEEDED_MAX = 60 * 60 * 24 * 366

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class StateManager(GObject.GObject):
    __gsignals__ = {
        'device-update': (GObject.SIGNAL_RUN_FIRST, None, (str,)),
        'license-action-needed': (GObject.SIGNAL_RUN_FIRST, None, (bool,)),
    }

    __gproperties__ = {
        'follow-mode': (bool, 'Follow Mode', 'Whether the follow mode is enabled', False, GObject.ParamFlags.READWRITE),
        'license-action-needed-seconds': (int, 'License Action Needed Seconds', 'The remaining time until the license action is needed', 0, LICENSE_ACTION_NEEDED_MAX, 0, GObject.ParamFlags.READWRITE),
    }

    _instance = None

    @staticmethod
    def get_instance():
        if not StateManager._instance:
            StateManager._instance = StateManager()

        return StateManager._instance
        
    @staticmethod
    def destroy_instance():
        if StateManager._instance:
            StateManager._instance.stop()
            StateManager._instance = None

    @staticmethod
    def device_name(state):
        if state.get('connected_device_brand') and state.get('connected_device_model'):
            return f"{state['connected_device_brand']} {state['connected_device_model']}"

        return None

    def __init__(self):
        GObject.GObject.__init__(self)
        self.ipc = XRDriverIPC.get_instance()
        self.connected_device_name = None
        self.license_action_needed = False
        self.license_action_needed_seconds = 0
        self.confirmed_token = False

        self.start()

    def start(self):
        self.running = True
        self._refresh_state()

    def stop(self):
        self.running = False

    def _refresh_state(self):
        self.state = self.ipc.retrieve_driver_state()
        new_device_name = StateManager.device_name(self.state)
        if self.connected_device_name != new_device_name:
            self.connected_device_name = new_device_name
            self.emit('device-update', self.connected_device_name)

        license_view = self.state['ui_view'].get('license')
        if license_view:
            confirmed_token = license_view.get('confirmed_token') == True
            action_needed_details = license_view.get('action_needed')
            action_needed_seconds = action_needed_details.get('seconds') if action_needed_details else None

            action_needed = action_needed_seconds is not None and action_needed_seconds < LICENSE_WARN_SECONDS
            if (action_needed != self.license_action_needed or self.confirmed_token != confirmed_token):
                self.license_action_needed = action_needed
                self.license_action_needed_seconds = action_needed_seconds
                self.confirmed_token = confirmed_token
                self.emit('license-action-needed', action_needed or not confirmed_token)

        self.set_property('follow-mode', self.state.get('breezy_desktop_smooth_follow_enabled'))
        self.set_property('license-action-needed-seconds', self.license_action_needed_seconds)

        if self.running: threading.Timer(1.0, self._refresh_state).start()

    def do_set_property(self, prop, value):
        if prop.name == 'follow-mode':
            self.follow_mode = value
        if prop.name == 'license-action-needed-seconds':
            self.license_action_needed_seconds = value

    def do_get_property(self, prop):
        if prop.name == 'follow-mode':
            return self.follow_mode
        if prop.name == 'license-action-needed-seconds':
            return self.license_action_needed_seconds