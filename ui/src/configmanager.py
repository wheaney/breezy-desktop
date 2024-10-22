import sys
import threading
from gi.repository import GObject
from .xrdriveripc import XRDriverIPC

class ConfigManager(GObject.GObject):
    __gproperties__ = {
        'breezy-desktop-enabled': (bool, 'Breezy Desktop Enabled', 'Whether Breezy Desktop is enabled', False, GObject.ParamFlags.READWRITE),
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
        self._running = True
        self._refresh_config()

    def stop(self):
        self._running = False

    def _refresh_config(self):
        self.config = self.ipc.retrieve_config(False)
        if self._is_breezy_desktop_enabled() != self.breezy_desktop_enabled:
            self.set_property('breezy-desktop-enabled', self._is_breezy_desktop_enabled())

        if self._running: threading.Timer(1.0, self._refresh_config).start()

    def _is_breezy_desktop_enabled(self):
        return self.config.get('disabled') == False and 'breezy_desktop' in self.config.get('external_mode', [])

    def _set_breezy_desktop_enabled(self, value):
        if value:
            self.config['disabled'] = False
            self.config['output_mode'] = 'external_only'
            self.config['external_mode'] = ['breezy_desktop']
            self.ipc.write_config(self.config)
        else:
            self.config['external_mode'] = []
            self.ipc.write_config(self.config)

        self.breezy_desktop_enabled = value

    def do_set_property(self, prop, value):
        if prop.name == 'breezy-desktop-enabled':
            self._set_breezy_desktop_enabled(value)

    def do_get_property(self, prop):
        if prop.name == 'breezy-desktop-enabled':
            return self.breezy_desktop_enabled