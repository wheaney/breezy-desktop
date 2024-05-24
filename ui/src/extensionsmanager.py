import pydbus
from gi.repository import GObject

BREEZY_DESKTOP_UUID = "breezydesktop@xronlinux.com"
EXTENSION_STATE_ENABLED = 1

class ExtensionsManager(GObject.GObject):
    __gproperties__ = {
        'breezy-enabled': (bool, 'Breezy Enabled', 'Whether the Breezy Desktop GNOME extension is enabled', False, GObject.ParamFlags.READWRITE)
    }

    _instance = None

    @staticmethod
    def get_instance():
        if ExtensionsManager._instance is None:
            ExtensionsManager._instance = ExtensionsManager()
        return ExtensionsManager._instance

    def __init__(self):
        GObject.GObject.__init__(self)

        self.bus = pydbus.SessionBus()
        self.gnome_shell_extensions = self.bus.get("org.gnome.Shell.Extensions")
        self.gnome_shell_extensions.ExtensionStateChanged.connect(self._handle_extension_state_change)

        self.remote_extension_state = None

    def _handle_extension_state_change(self, extension_uuid, state):
        if extension_uuid == BREEZY_DESKTOP_UUID:
            self.remote_extension_state = state.get('state') == EXTENSION_STATE_ENABLED
            self.set_property('breezy-enabled', self.remote_extension_state)

    def is_installed(self):
        return self._is_installed(BREEZY_DESKTOP_UUID)

    def enable(self):
        self._enable_extension(BREEZY_DESKTOP_UUID)

    def disable(self):
        self._disable_extension(BREEZY_DESKTOP_UUID)

    def is_enabled(self):
        return self._is_enabled(BREEZY_DESKTOP_UUID)

    def _is_installed(self, extension_uuid):
        extensions_result = self.gnome_shell_extensions.ListExtensions()
        for extension in extensions_result:
            if extension == extension_uuid:
                return True
        
        return False

    def _enable_extension(self, extension_uuid):
        if not self.gnome_shell_extensions.UserExtensionsEnabled:
            self.gnome_shell_extensions.UserExtensionsEnabled = True

        self.gnome_shell_extensions.EnableExtension(extension_uuid)

    def _disable_extension(self, extension_uuid):
        self.gnome_shell_extensions.DisableExtension(extension_uuid)

    def _is_enabled(self, extension_uuid):
        return self.gnome_shell_extensions.GetExtensionInfo(extension_uuid).get('state') == EXTENSION_STATE_ENABLED

    def do_set_property(self, prop, value):
        if prop.name == 'breezy-enabled' and value != self.remote_extension_state:
            self.enable() if value == True else self.disable()

    def do_get_property(self, prop):
        if prop.name == 'breezy-enabled':
            return self.remote_extension_state
