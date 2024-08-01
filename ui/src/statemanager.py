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
        'device-update': (GObject.SIGNAL_RUN_FIRST, None, (str,))
    }

    __gproperties__ = {
        'driver-running': (bool, 'Driver Running', 'Whether the driver is running', False, GObject.ParamFlags.READWRITE),
        'follow-mode': (bool, 'Follow Mode', 'Whether the follow mode is enabled', False, GObject.ParamFlags.READWRITE),
        'follow-threshold': (float, 'Follow Threshold', 'The follow threshold', 1.0, 45.0, 15.0, GObject.ParamFlags.READWRITE),
        'widescreen-mode': (bool, 'Widescreen Mode', 'Whether widescreen mode is enabled', False, GObject.ParamFlags.READWRITE),
        'license-action-needed': (bool, 'License Action Needed', 'Whether the license needs attention', False, GObject.ParamFlags.READWRITE),
        'license-present': (bool, 'License Present', 'Whether a license is present', False, GObject.ParamFlags.READWRITE),
        'enabled-features-list': (object, 'Enabled Features List', 'A list of the enabled features', GObject.ParamFlags.READWRITE),
        'device-supports-sbs': (bool, 'Device Supports SBS', 'Whether the connected device supports SBS', False, GObject.ParamFlags.READWRITE),
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
        self.driver_running = False
        self.connected_device_name = None
        self.license_action_needed = False
        self.license_action_needed_seconds = 0
        self.confirmed_token = False
        self.license_present = False
        self.enabled_features = []

        self.start()

    def start(self):
        self.running = True
        self._refresh_state()

    def stop(self):
        self.running = False

    def _refresh_state(self):
        self.state = self.ipc.retrieve_driver_state()
        self.set_property('driver-running', self.state['ui_view'].get('driver_running'))

        new_device_name = StateManager.device_name(self.state)
        if self.connected_device_name != new_device_name:
            self.connected_device_name = new_device_name
            self.emit('device-update', self.connected_device_name)

        license_view = self.state['ui_view'].get('license')
        if license_view:
            if not self.license_present:
                self.set_property('license-present', True)
            self.confirmed_token = license_view.get('confirmed_token') == True
            action_needed_details = license_view.get('action_needed')
            action_needed_seconds = action_needed_details.get('seconds') if action_needed_details else None

            action_needed = action_needed_seconds is not None and action_needed_seconds < LICENSE_WARN_SECONDS
            if (action_needed != self.license_action_needed):
                self.license_action_needed_seconds = action_needed_seconds
                self.set_property('license-action-needed', action_needed)
            enabled_features = license_view.get('enabled_features', [])
            if self.enabled_features != enabled_features:
                self.set_property('enabled-features-list', enabled_features)
        elif self.license_present:
            self.set_property('license-present', False)

        self.set_property('follow-mode', self.state.get('breezy_desktop_smooth_follow_enabled', False))
        self.set_property('device-supports-sbs', self.state.get('sbs_mode_supported', False))
        self.set_property('widescreen-mode', self.state.get('sbs_mode_enabled', False))

        if self.running: threading.Timer(1.0, self._refresh_state).start()

    def do_set_property(self, prop, value):
        if prop.name == 'driver-running':
            self.driver_running = value
        if prop.name == 'follow-mode':
            self.follow_mode = value
        if prop.name == 'widescreen-mode':
            self.widescreen_mode = value
        if prop.name == 'license-action-needed':
            self.license_action_needed = value
        if prop.name == 'license-present':
            self.license_present = value
        if prop.name == 'enabled-features-list':
            self.enabled_features = value
        if prop.name == 'device-supports-sbs':
            self.device_supports_sbs = value

    def do_get_property(self, prop):
        if prop.name == 'driver-running':
            return self.driver_running
        if prop.name == 'follow-mode':
            return self.follow_mode
        if prop.name == 'widescreen-mode':
            return self.widescreen_mode
        if prop.name == 'license-action-needed':
            return self.license_action_needed
        if prop.name == 'license-present':
            return self.license_present
        if prop.name == 'enabled-features-list':
            return self.enabled_features
        if prop.name == 'device-supports-sbs':
            return self.device_supports_sbs