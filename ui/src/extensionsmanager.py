import pydbus

BREEZY_DESKTOP_UUID = "breezydesktop@xronlinux.com"

class ExtensionsManager:
    _instance = None

    @staticmethod
    def get_instance():
        if ExtensionsManager._instance is None:
            ExtensionsManager._instance = ExtensionsManager()
        return ExtensionsManager._instance

    def __init__(self):
        self.bus = pydbus.SessionBus()
        self.gnome_shell_extensions = self.bus.get("org.gnome.Shell.Extensions")

    def is_installed(self):
        return self._is_installed(BREEZY_DESKTOP_UUID)

    def enable(self):
        self._enable_extension(BREEZY_DESKTOP_UUID)

    def disable(self):
        self._disable_extension(BREEZY_DESKTOP_UUID)

    def _is_installed(self, extension_uuid):
        # type a{sa{sv}}
        extensions_result = self.gnome_shell_extensions.ListExtensions()
        for extension in extensions_result:
            if extension == extension_uuid:
                return True
        
        return False

    def _enable_extension(self, extension_uuid):
        self.gnome_shell_extensions.EnableExtension(extension_uuid)

    def _disable_extension(self, extension_uuid):
        self.gnome_shell_extensions.DisableExtension(extension_uuid)
