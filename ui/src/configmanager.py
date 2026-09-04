import sys
from gi.repository import GObject, GLib
from .xrdriveripc import XRDriverIPC

class ConfigManager(GObject.GObject):
    __gproperties__ = {
        'breezy-desktop-enabled': (bool, 'Breezy Desktop Enabled', 'Whether Breezy Desktop is enabled', False, GObject.ParamFlags.READWRITE),
        'multi-tap-enabled': (bool, 'Multi-Tap Enabled', 'Whether Multi-Tap is enabled', False, GObject.ParamFlags.READWRITE),
        'follow-track-roll': (bool, 'Follow Track Roll', 'Whether to follow on the roll axis', False, GObject.ParamFlags.READWRITE),
        'follow-track-pitch': (bool, 'Follow Track Pitch', 'Whether to follow on the pitch axis', True, GObject.ParamFlags.READWRITE),
        'follow-track-yaw': (bool, 'Follow Track Yaw', 'Whether to follow on the yaw axis', True, GObject.ParamFlags.READWRITE),
        'invert-x': (bool, 'Invert IMU X-axis', 'Whether to invert the IMU X axis', False, GObject.ParamFlags.READWRITE),
        'invert-y': (bool, 'Invert IMU Y-axis', 'Whether to invert the IMU Y axis', False, GObject.ParamFlags.READWRITE),
        'invert-z': (bool, 'Invert IMU Z-axis', 'Whether to invert the IMU Z axis', False, GObject.ParamFlags.READWRITE),
        'use-pitch-adjustment-override': (bool, 'Use Pitch Adjustment Override', 'Whether to override the automatic IMU pitch adjustment', False, GObject.ParamFlags.READWRITE),
        'pitch-adjustment-degrees': (float, 'Pitch Adjustment (degrees)', 'Manual IMU pitch adjustment in degrees', -20.0, 20.0, 0.0, GObject.ParamFlags.READWRITE),
        'dead-zone-threshold-deg': (
            float,
            'Dead Zone Threshold (deg)',
            'IMU dead-zone threshold in degrees (0.0 disables)',
            0.0, 5.0, 0.0,
            GObject.ParamFlags.READWRITE,
        ),
        'neck-saver-horizontal-multiplier': (
            float,
            'Neck Saver Horizontal Multiplier',
            'Multiplier to reduce horizontal head movement',
            1.0, 2.5, 1.0,
            GObject.ParamFlags.READWRITE,
        ),
        'neck-saver-vertical-multiplier': (
            float,
            'Neck Saver Vertical Multiplier',
            'Multiplier to reduce vertical head movement',
            1.0, 2.5, 1.0,
            GObject.ParamFlags.READWRITE,
        )
    }

    _instance = None

    @staticmethod
    def get_instance():
        if not ConfigManager._instance:
            ConfigManager._instance = ConfigManager()

        return ConfigManager._instance
        
    @staticmethod
    def destroy_instance():
        if ConfigManager._instance:
            ConfigManager._instance.stop()
            ConfigManager._instance = None

    def __init__(self):
        GObject.GObject.__init__(self)
        self.ipc = XRDriverIPC.get_instance()
        self.breezy_desktop_enabled = None
        self.multi_tap_enabled = None
        self.follow_track_roll = None
        self.follow_track_pitch = None
        self.follow_track_yaw = None
        self.invert_x = None
        self.invert_y = None
        self.invert_z = None
        self.use_pitch_adjustment_override = None
        self.pitch_adjustment_degrees = None
        self.dead_zone_threshold_deg = None
        self.neck_saver_horizontal_multiplier = None
        self.neck_saver_vertical_multiplier = None
        self._running = True
        self._refresh_source_id = None
        self._refresh_config()
        self._refresh_source_id = GLib.timeout_add_seconds(1, self._refresh_config)

    def stop(self):
        self._running = False
        if self._refresh_source_id is not None:
            GLib.source_remove(self._refresh_source_id)
            self._refresh_source_id = None

    def _refresh_config(self):
        self.config = self.ipc.retrieve_config(False)
        if self._is_breezy_desktop_enabled() != self.breezy_desktop_enabled:
            self.set_property('breezy-desktop-enabled', self._is_breezy_desktop_enabled())

        if self.config['multi_tap_enabled'] != self.multi_tap_enabled:
            self.set_property('multi-tap-enabled', self.config['multi_tap_enabled'])

        if self.config['smooth_follow_track_roll'] != self.follow_track_roll:
            self.set_property('follow-track-roll', self.config['smooth_follow_track_roll'])

        if self.config['smooth_follow_track_pitch'] != self.follow_track_pitch:
            self.set_property('follow-track-pitch', self.config['smooth_follow_track_pitch'])

        if self.config['smooth_follow_track_yaw'] != self.follow_track_yaw:
            self.set_property('follow-track-yaw', self.config['smooth_follow_track_yaw'])

        if self.config['invert_x'] != self.invert_x:
            self.set_property('invert-x', self.config['invert_x'])

        if self.config['invert_y'] != self.invert_y:
            self.set_property('invert-y', self.config['invert_y'])

        if self.config['invert_z'] != self.invert_z:
            self.set_property('invert-z', self.config['invert_z'])

        if self.config['use_pitch_adjustment_override'] != self.use_pitch_adjustment_override:
            self.set_property('use-pitch-adjustment-override', self.config['use_pitch_adjustment_override'])

        if self.config['pitch_adjustment_degrees'] != self.pitch_adjustment_degrees:
            self.set_property('pitch-adjustment-degrees', self.config['pitch_adjustment_degrees'])

        if self.config['dead_zone_threshold_deg'] != self.dead_zone_threshold_deg:
            self.set_property('dead-zone-threshold-deg', self.config['dead_zone_threshold_deg'])

        if self.config['neck_saver_horizontal_multiplier'] != self.neck_saver_horizontal_multiplier:
            self.set_property('neck-saver-horizontal-multiplier', self.config['neck_saver_horizontal_multiplier'])
            
        if self.config['neck_saver_vertical_multiplier'] != self.neck_saver_vertical_multiplier:
            self.set_property('neck-saver-vertical-multiplier', self.config['neck_saver_vertical_multiplier'])

        return self._running

    def _is_breezy_desktop_enabled(self):
        return self.config.get('disabled') == False and 'breezy_desktop' in self.config.get('external_mode', [])

    def _set_breezy_desktop_enabled(self, value):
        if value:
            self.config['disabled'] = False
            self.config['output_mode'] = 'external_only'
            self.config['external_mode'] = ['breezy_desktop']
        else:
            self.config['external_mode'] = []

        self.ipc.write_config(self.config)
        self.breezy_desktop_enabled = value

    def _set_multi_tap_enabled(self, value):
        if self.multi_tap_enabled != value:
            self.config['multi_tap_enabled'] = value
            self.ipc.write_config(self.config)
            self.multi_tap_enabled = value

    def _set_follow_track_roll(self, value):
        if self.follow_track_roll != value:
            self.config['smooth_follow_track_roll'] = value
            self.ipc.write_config(self.config)
            self.follow_track_roll = value

    def _set_follow_track_pitch(self, value):
        if self.follow_track_pitch != value:
            self.config['smooth_follow_track_pitch'] = value
            self.ipc.write_config(self.config)
            self.follow_track_pitch = value

    def _set_follow_track_yaw(self, value):
        if self.follow_track_yaw != value:
            self.config['smooth_follow_track_yaw'] = value
            self.ipc.write_config(self.config)
            self.follow_track_yaw = value

    def _set_invert_x(self, value):
        if self.invert_x != value:
            self.config['invert_x'] = value
            self.ipc.write_config(self.config)
            self.invert_x = value

    def _set_invert_y(self, value):
        if self.invert_y != value:
            self.config['invert_y'] = value
            self.ipc.write_config(self.config)
            self.invert_y = value

    def _set_invert_z(self, value):
        if self.invert_z != value:
            self.config['invert_z'] = value
            self.ipc.write_config(self.config)
            self.invert_z = value

    def _set_use_pitch_adjustment_override(self, value):
        if self.use_pitch_adjustment_override != value:
            self.config['use_pitch_adjustment_override'] = value
            self.ipc.write_config(self.config)
            self.use_pitch_adjustment_override = value

    def _set_pitch_adjustment_degrees(self, value):
        value = round(min(20.0, max(-20.0, float(value))), 1)
        if self.pitch_adjustment_degrees != value:
            self.config['pitch_adjustment_degrees'] = value
            self.ipc.write_config(self.config)
            self.pitch_adjustment_degrees = value

    def _set_dead_zone_threshold_deg(self, value):
        value = round(min(5.0, max(0.0, float(value))), 2)
        if self.dead_zone_threshold_deg != value:
            self.config['dead_zone_threshold_deg'] = value
            self.ipc.write_config(self.config)
            self.dead_zone_threshold_deg = value

    def _set_neck_saver_horizontal_multiplier(self, value):
        value = round(min(2.5, max(1.0, float(value))), 2)
        if self.neck_saver_horizontal_multiplier != value:
            self.config['neck_saver_horizontal_multiplier'] = value
            self.ipc.write_config(self.config)
            self.neck_saver_horizontal_multiplier = value

    def _set_neck_saver_vertical_multiplier(self, value):
        value = round(min(2.5, max(1.0, float(value))), 2)
        if self.neck_saver_vertical_multiplier != value:
            self.config['neck_saver_vertical_multiplier'] = value
            self.ipc.write_config(self.config)
            self.neck_saver_vertical_multiplier = value

    def do_set_property(self, prop, value):
        if prop.name == 'breezy-desktop-enabled':
            self._set_breezy_desktop_enabled(value)
        elif prop.name == 'multi-tap-enabled':
            self._set_multi_tap_enabled(value)
        elif prop.name == 'follow-track-roll':
            self._set_follow_track_roll(value)
        elif prop.name == 'follow-track-pitch':
            self._set_follow_track_pitch(value)
        elif prop.name == 'follow-track-yaw':
            self._set_follow_track_yaw(value)
        elif prop.name == 'invert-x':
            self._set_invert_x(value)
        elif prop.name == 'invert-y':
            self._set_invert_y(value)
        elif prop.name == 'invert-z':
            self._set_invert_z(value)
        elif prop.name == 'use-pitch-adjustment-override':
            self._set_use_pitch_adjustment_override(value)
        elif prop.name == 'pitch-adjustment-degrees':
            self._set_pitch_adjustment_degrees(value)
        elif prop.name == 'dead-zone-threshold-deg':
            self._set_dead_zone_threshold_deg(value)
        elif prop.name == 'neck-saver-horizontal-multiplier':
            self._set_neck_saver_horizontal_multiplier(value)
        elif prop.name == 'neck-saver-vertical-multiplier':
            self._set_neck_saver_vertical_multiplier(value)

    def do_get_property(self, prop):
        if prop.name == 'breezy-desktop-enabled':
            return self.breezy_desktop_enabled
        elif prop.name == 'multi-tap-enabled':
            return self.multi_tap_enabled
        elif prop.name == 'follow-track-roll':
            return self.follow_track_roll
        elif prop.name == 'follow-track-pitch':
            return self.follow_track_pitch
        elif prop.name == 'follow-track-yaw':
            return self.follow_track_yaw
        elif prop.name == 'invert-x':
            return self.invert_x
        elif prop.name == 'invert-y':
            return self.invert_y
        elif prop.name == 'invert-z':
            return self.invert_z
        elif prop.name == 'use-pitch-adjustment-override':
            return self.use_pitch_adjustment_override
        elif prop.name == 'pitch-adjustment-degrees':
            return self.pitch_adjustment_degrees
        elif prop.name == 'dead-zone-threshold-deg':
            return self.dead_zone_threshold_deg
        elif prop.name == 'neck-saver-horizontal-multiplier':
            return self.neck_saver_horizontal_multiplier
        elif prop.name == 'neck-saver-vertical-multiplier':
            return self.neck_saver_vertical_multiplier