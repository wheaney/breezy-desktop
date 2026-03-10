import sys
from gi.repository import GObject, GLib
from .time import LICENSE_WARN_SECONDS
from .xrdriveripc import XRDriverIPC

# shouldn't need a number larger than a year
LICENSE_ACTION_NEEDED_MAX = 60 * 60 * 24 * 366

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
        'connected-device-pose-has-position': (bool, 'Pose Has Position', 'Whether the connected device provides position tracking (6DoF)', False, GObject.ParamFlags.READWRITE),
        'connected-device-full-distance-cm': (float, 'Full Distance (cm)', 'Device full distance in cm', 0.0, 10000.0, 0.0, GObject.ParamFlags.READWRITE),
        'connected-device-full-size-cm': (float, 'Full Size (cm)', 'Device full display size in cm', 0.0, 10000.0, 0.0, GObject.ParamFlags.READWRITE),
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
        self.follow_mode = False
        self.follow_threshold = 15.0
        self.widescreen_mode = False
        self.connected_device_name = None
        self.license_action_needed = False
        self.license_action_needed_seconds = 0
        self.confirmed_token = False
        self.license_present = False
        self.enabled_features = []
        self.device_supports_sbs = False
        self.connected_device_pose_has_position = False
        self.connected_device_full_distance_cm = 0.0
        self.connected_device_full_size_cm = 0.0
        self._running = True
        self._refresh_source_id = None
        self._refresh_state()
        self._refresh_source_id = GLib.timeout_add_seconds(1, self._refresh_state)

    def stop(self):
        self._running = False
        if self._refresh_source_id is not None:
            GLib.source_remove(self._refresh_source_id)
            self._refresh_source_id = None

    def _refresh_state(self):
        self.state = self.ipc.retrieve_driver_state()
        driver_running = self.state['ui_view'].get('driver_running')
        if driver_running != self.driver_running:
            self.set_property('driver-running', driver_running)

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

        # only update these properties if a device is still connected
        if (self.connected_device_name):
            follow_mode = self.state.get('breezy_desktop_smooth_follow_enabled', False)
            if follow_mode != self.follow_mode:
                self.set_property('follow-mode', follow_mode)

            device_supports_sbs = self.state.get('sbs_mode_supported', False)
            if device_supports_sbs != self.device_supports_sbs:
                self.set_property('device-supports-sbs', device_supports_sbs)

            widescreen_mode = self.state.get('sbs_mode_enabled', False)
            if widescreen_mode != self.widescreen_mode:
                self.set_property('widescreen-mode', widescreen_mode)

            pose_has_position = (self.state.get('connected_device_pose_has_position', False) == True)
            if pose_has_position != self.connected_device_pose_has_position:
                self.set_property('connected-device-pose-has-position', pose_has_position)

            full_distance = self.state.get('connected_device_full_distance_cm') or 0.0
            if full_distance != self.connected_device_full_distance_cm:
                self.set_property('connected-device-full-distance-cm', full_distance)

            full_size = self.state.get('connected_device_full_size_cm') or 0.0
            if full_size != self.connected_device_full_size_cm:
                self.set_property('connected-device-full-size-cm', full_size)

        return self._running

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
        if prop.name == 'connected-device-pose-has-position':
            self.connected_device_pose_has_position = value
        if prop.name == 'connected-device-full-distance-cm':
            self.connected_device_full_distance_cm = value
        if prop.name == 'connected-device-full-size-cm':
            self.connected_device_full_size_cm = value

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
        if prop.name == 'connected-device-pose-has-position':
            return self.connected_device_pose_has_position
        if prop.name == 'connected-device-full-distance-cm':
            return self.connected_device_full_distance_cm
        if prop.name == 'connected-device-full-size-cm':
            return self.connected_device_full_size_cm