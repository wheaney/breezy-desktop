import sys
import threading
from gi.repository import GObject
from .xrdriveripc import XRDriverIPC

class ConfigManager(GObject.GObject):
    __gproperties__ = {
        'breezy-desktop-enabled': (bool, 'Breezy Desktop Enabled', 'Whether Breezy Desktop is enabled', False, GObject.ParamFlags.READWRITE),
        'multi-tap-enabled': (bool, 'Multi-Tap Enabled', 'Whether Multi-Tap is enabled', False, GObject.ParamFlags.READWRITE),
        'follow-track-roll': (bool, 'Follow Track Roll', 'Whether to follow on the roll axis', False, GObject.ParamFlags.READWRITE),
        'follow-track-pitch': (bool, 'Follow Track Pitch', 'Whether to follow on the pitch axis', True, GObject.ParamFlags.READWRITE),
        'follow-track-yaw': (bool, 'Follow Track Yaw', 'Whether to follow on the yaw axis', True, GObject.ParamFlags.READWRITE)
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
        self._running = True
        self._refresh_config()

    def stop(self):
        self._running = False

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

        if self._running: threading.Timer(1.0, self._refresh_config).start()

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