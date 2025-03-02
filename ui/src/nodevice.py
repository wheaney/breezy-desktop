from gi.repository import Gio, Gtk
from .configmanager import ConfigManager
from .extensionsmanager import ExtensionsManager
from .settingsmanager import SettingsManager
from .statemanager import StateManager
from .xrdriveripc import XRDriverIPC

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/no-device.ui')
class NoDevice(Gtk.Box):
    __gtype_name__ = "NoDevice"

    effect_enable_switch = Gtk.Template.Child()
    disable_physical_displays_switch = Gtk.Template.Child()
    # widescreen_mode_switch = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.ipc = XRDriverIPC.get_instance()
        self.extensions_manager = ExtensionsManager.get_instance()
        self.settings = SettingsManager.get_instance().settings
        self.config_manager = ConfigManager.get_instance()
        self.config_manager.connect('notify::breezy-desktop-enabled', self._handle_enabled_config)

        self.effect_enable_switch.connect('notify::active', self._handle_switch_enabled_state)
        # self.settings.bind('widescreen-mode', self.widescreen_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('disable-physical-displays', self.disable_physical_displays_switch, 'active', Gio.SettingsBindFlags.DEFAULT)

        self._handle_enabled_config(self.config_manager, None)

    def _handle_enabled_config(self, config_manager, val):
        enabled = config_manager.get_property('breezy-desktop-enabled') and self.extensions_manager.get_property('breezy-enabled')
        if enabled != self.effect_enable_switch.get_active():
            self.effect_enable_switch.set_active(enabled)
    
    def _handle_switch_enabled_state(self, switch, param):
        requesting_enabled = switch.get_active()

        # never turn off the extension, disabling the effect is done via configs only
        if requesting_enabled:
            self.extensions_manager.set_property('breezy-enabled', True)

        self.config_manager.set_property('breezy-desktop-enabled', requesting_enabled)
    
    # def _on_widget_destroy(self, widget):
        # self.settings.unbind('widescreen-mode', self.widescreen_mode_switch, 'active')
