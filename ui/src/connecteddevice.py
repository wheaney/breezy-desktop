from gi.repository import Gio, Gtk, GObject
from .extensionsmanager import ExtensionsManager
from .settingsmanager import SettingsManager
from .shortcutdialog import bind_shortcut_settings
from .statemanager import StateManager
from .xrdriveripc import XRDriverIPC

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/connected-device.ui')
class ConnectedDevice(Gtk.Box):
    __gtype_name__ = "ConnectedDevice"

    effect_enable_switch = Gtk.Template.Child()
    display_distance_scale = Gtk.Template.Child()
    display_distance_adjustment = Gtk.Template.Child()
    follow_mode_switch = Gtk.Template.Child()
    device_label = Gtk.Template.Child()
    set_toggle_display_distance_start_button = Gtk.Template.Child()
    set_toggle_display_distance_end_button = Gtk.Template.Child()
    reassign_recenter_display_shortcut_button = Gtk.Template.Child()
    recenter_display_shortcut_label = Gtk.Template.Child()
    reassign_toggle_display_distance_shortcut_button = Gtk.Template.Child()
    toggle_display_distance_shortcut_label = Gtk.Template.Child()
    reassign_toggle_follow_shortcut_button = Gtk.Template.Child()
    toggle_follow_shortcut_label = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Box, self).__init__()
        self.init_template()
        self.all_enabled_state_inputs = [
            self.display_distance_scale,
            self.follow_mode_switch,
            self.set_toggle_display_distance_start_button,
            self.set_toggle_display_distance_end_button,
            self.reassign_recenter_display_shortcut_button,
            self.reassign_toggle_display_distance_shortcut_button,
            self.reassign_toggle_follow_shortcut_button
        ]

        self.settings = SettingsManager.get_instance().settings
        self.ipc = XRDriverIPC.get_instance()
        self.extensions_manager = ExtensionsManager.get_instance()

        self.settings.bind('display-distance', self.display_distance_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)

        bind_shortcut_settings(self.get_parent(), [
            [self.reassign_recenter_display_shortcut_button, self.recenter_display_shortcut_label],
            [self.reassign_toggle_display_distance_shortcut_button, self.toggle_display_distance_shortcut_label],
            [self.reassign_toggle_follow_shortcut_button, self.toggle_follow_shortcut_label]
        ])

        self.bind_set_distance_toggle([
            self.set_toggle_display_distance_start_button, 
            self.set_toggle_display_distance_end_button
        ])

        self.state_manager = StateManager.get_instance()
        self.state_manager.bind_property('follow-mode', self.follow_mode_switch, 'active', GObject.BindingFlags.DEFAULT)

        self.follow_mode_switch.set_active(self.state_manager.follow_mode)
        self.follow_mode_switch.connect('notify::active', self._request_follow_mode)

        self.effect_enable_switch.set_active(self._is_config_enabled(self.ipc.retrieve_config()) and self.extensions_manager.is_enabled())
        self.effect_enable_switch.connect('notify::active', self._refresh_inputs_for_enabled_state)

        self._refresh_inputs_for_enabled_state(self.effect_enable_switch, None)
        self.extensions_manager.bind_property('breezy-enabled', self.effect_enable_switch, 'active', GObject.BindingFlags.BIDIRECTIONAL)

        self.connect("destroy", self._on_widget_destroy)

    def _is_config_enabled(self, config):
        return config.get('disabled') == False and 'breezy_desktop' in config.get('external_mode', [])
    
    def _refresh_inputs_for_enabled_state(self, switch, param):
        requesting_enabled = switch.get_active()
        self.extensions_manager.set_property('breezy-enabled', requesting_enabled)
        if requesting_enabled:
            config = self.ipc.retrieve_config(False)
            if not self._is_config_enabled(config):
                config['disabled'] = False
                config['output_mode'] = 'external_only'
                config['external_mode'] = ['breezy_desktop']
                self.ipc.write_config(config)

        for widget in self.all_enabled_state_inputs:
            widget.set_sensitive(requesting_enabled)

    def _request_follow_mode(self, switch, param):
        if (self.state_manager.follow_mode == switch.get_active()):
            return
        
        self.ipc.write_control_flags({
            'enable_breezy_desktop_smooth_follow': switch.get_active()
        })

    def set_device_name(self, name):
        self.device_label.set_markup(f"<b>{name}</b>")
            
    def bind_set_distance_toggle(self, widgets):
        for widget in widgets:
            widget.connect('clicked', lambda *args, widget=widget: on_set_display_distance_toggle(widget))
            reload_display_distance_toggle_button(widget)
    
    def _on_widget_destroy(self, widget):
        self.state_manager.unbind_property('follow-mode', self.follow_mode_switch, 'active')
        self.settings.unbind('display-distance', self.display_distance_adjustment, 'value')
        self.extensions_manager.unbind_property('breezy-enabled', self.effect_enable_switch, 'active')

def reload_display_distance_toggle_button(widget):
    distance = SettingsManager.get_instance().settings.get_double(widget.get_name())
    if distance: widget.set_label(str(distance))

def on_set_display_distance_toggle(widget):
    settings = SettingsManager.get_instance().settings
    distance = settings.get_double('display-distance')
    settings.set_double(widget.get_name(), distance)
    reload_display_distance_toggle_button(widget)