from gi.repository import Gio, Gtk, GObject
from .extensionsmanager import ExtensionsManager
from .license import BREEZY_GNOME_FEATURES
from .settingsmanager import SettingsManager
from .shortcutdialog import bind_shortcut_settings
from .statemanager import StateManager
from .xrdriveripc import XRDriverIPC
import gettext
import threading

_ = gettext.gettext

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/connected-device.ui')
class ConnectedDevice(Gtk.Box):
    __gtype_name__ = "ConnectedDevice"

    widescreen_mode_subtitle = _("Switches your glasses into side-by-side mode and doubles the width of the display.")
    widescreen_mode_not_supported_subtitle = _("This feature is not currently supported for your device.")

    device_label = Gtk.Template.Child()
    effect_enable_switch = Gtk.Template.Child()
    display_distance_scale = Gtk.Template.Child()
    display_distance_adjustment = Gtk.Template.Child()
    display_size_scale = Gtk.Template.Child()
    display_size_adjustment = Gtk.Template.Child()
    follow_threshold_scale = Gtk.Template.Child()
    follow_threshold_adjustment = Gtk.Template.Child()
    follow_mode_switch = Gtk.Template.Child()
    widescreen_mode_switch = Gtk.Template.Child()
    widescreen_mode_row = Gtk.Template.Child()
    curved_display_switch = Gtk.Template.Child()
    set_toggle_display_distance_start_button = Gtk.Template.Child()
    set_toggle_display_distance_end_button = Gtk.Template.Child()
    reassign_toggle_xr_effect_shortcut_button = Gtk.Template.Child()
    toggle_xr_effect_shortcut_label = Gtk.Template.Child()
    reassign_recenter_display_shortcut_button = Gtk.Template.Child()
    recenter_display_shortcut_label = Gtk.Template.Child()
    reassign_toggle_display_distance_shortcut_button = Gtk.Template.Child()
    toggle_display_distance_shortcut_label = Gtk.Template.Child()
    reassign_toggle_follow_shortcut_button = Gtk.Template.Child()
    toggle_follow_shortcut_label = Gtk.Template.Child()
    headset_as_primary_switch = Gtk.Template.Child()
    use_optimal_monitor_config_switch = Gtk.Template.Child()
    use_highest_refresh_rate_switch = Gtk.Template.Child()
    fast_sbs_mode_switch = Gtk.Template.Child()
    movement_look_ahead_scale = Gtk.Template.Child()
    movement_look_ahead_adjustment = Gtk.Template.Child()
    text_scaling_scale = Gtk.Template.Child()
    text_scaling_adjustment = Gtk.Template.Child()


    def __init__(self):
        super(Gtk.Box, self).__init__()
        self.init_template()
        self.active = True
        self.all_enabled_state_inputs = [
            self.display_distance_scale,
            self.display_size_scale,
            self.follow_mode_switch,
            self.follow_threshold_scale,
            self.curved_display_switch,
            self.set_toggle_display_distance_start_button,
            self.set_toggle_display_distance_end_button,
            self.movement_look_ahead_scale
        ]

        self.settings = SettingsManager.get_instance().settings
        self.desktop_settings = SettingsManager.get_instance().desktop_settings
        self.ipc = XRDriverIPC.get_instance()
        self.extensions_manager = ExtensionsManager.get_instance()

        self.settings.bind('display-distance', self.display_distance_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('display-size', self.display_size_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('follow-threshold', self.follow_threshold_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('widescreen-mode', self.widescreen_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('curved-display', self.curved_display_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('headset-as-primary', self.headset_as_primary_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('use-optimal-monitor-config', self.use_optimal_monitor_config_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('use-highest-refresh-rate', self.use_highest_refresh_rate_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('fast-sbs-mode-switching', self.fast_sbs_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('look-ahead-override', self.movement_look_ahead_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.desktop_settings.bind('text-scaling-factor', self.text_scaling_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)

        bind_shortcut_settings(self.get_parent(), [
            [self.reassign_toggle_xr_effect_shortcut_button, self.toggle_xr_effect_shortcut_label],
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
        self.state_manager.connect('notify::enabled-features-list', self._handle_enabled_features)
        self.state_manager.connect('notify::device-supports-sbs', self._handle_device_supports_sbs)

        self.follow_mode_switch.set_active(self.state_manager.get_property('follow-mode'))
        self.follow_mode_switch.connect('notify::active', self._refresh_follow_mode)

        self._refresh_enabled_state();
        self.effect_enable_switch.connect('notify::active', self._handle_enabled_state)

        self.use_optimal_monitor_config_switch.connect('notify::active', self._refresh_use_optimal_monitor_config)

        self._handle_enabled_features(self.state_manager, None)
        self._handle_device_supports_sbs(self.state_manager, None)
        self._handle_enabled_state(self.effect_enable_switch, None)
        self._refresh_use_optimal_monitor_config(self.use_optimal_monitor_config_switch, None)

        self.connect("destroy", self._on_widget_destroy)

    def _handle_enabled_features(self, state_manager, val):
        enabled_breezy_features = [feature for feature in state_manager.get_property('enabled-features-list') if feature in BREEZY_GNOME_FEATURES]
        breezy_features_granted = len(enabled_breezy_features) > 0
        if not breezy_features_granted:
            self.effect_enable_switch.set_active(False)
        self.effect_enable_switch.set_sensitive(breezy_features_granted)

    def _handle_device_supports_sbs(self, state_manager, val):
        if not state_manager.get_property('device-supports-sbs'):
            self.settings.set_boolean('widescreen-mode', False)
        self.widescreen_mode_switch.set_sensitive(state_manager.get_property('device-supports-sbs'))
        subtitle = self.widescreen_mode_subtitle if state_manager.get_property('device-supports-sbs') else self.widescreen_mode_not_supported_subtitle
        self.widescreen_mode_row.set_subtitle(subtitle)
        
    def _refresh_enabled_state(self):
        enabled = self._is_config_enabled(self.ipc.retrieve_config()) and self.extensions_manager.is_enabled()
        if enabled != self.effect_enable_switch.get_active():
            self.effect_enable_switch.set_active(enabled)

        if self.active: threading.Timer(1.0, self._refresh_enabled_state).start()

    def _is_config_enabled(self, config):
        return config.get('disabled') == False and 'breezy_desktop' in config.get('external_mode', [])
    
    def _handle_enabled_state(self, switch, param):
        requesting_enabled = switch.get_active()
        config = self.ipc.retrieve_config(False)
        if requesting_enabled:
            self.extensions_manager.set_property('breezy-enabled', True)
            if not self._is_config_enabled(config):
                config['disabled'] = False
                config['output_mode'] = 'external_only'
                config['external_mode'] = ['breezy_desktop']
                self.ipc.write_config(config)
        else:
            config['external_mode'] = []
            self.ipc.write_config(config)

        for widget in self.all_enabled_state_inputs:
            widget.set_sensitive(requesting_enabled)
        
        if requesting_enabled: 
            self._refresh_follow_mode(self.follow_mode_switch, None)

    def _refresh_follow_mode(self, switch, param):
        self.follow_threshold_scale.set_sensitive(switch.get_active())
        if (self.state_manager.get_property('follow-mode') == switch.get_active()):
            return
        
        self.ipc.write_control_flags({
            'enable_breezy_desktop_smooth_follow': switch.get_active()
        })

    def _refresh_use_optimal_monitor_config(self, switch, param):
        self.headset_as_primary_switch.set_sensitive(switch.get_active())
        self.use_highest_refresh_rate_switch.set_sensitive(switch.get_active())
        if not switch.get_active():
            self.headset_as_primary_switch.set_active(False)
            self.use_highest_refresh_rate_switch.set_active(False)

    def set_device_name(self, name):
        self.device_label.set_markup(f"<b>{name}</b>")
            
    def bind_set_distance_toggle(self, widgets):
        for widget in widgets:
            widget.connect('clicked', lambda *args, widget=widget: on_set_display_distance_toggle(widget))
            reload_display_distance_toggle_button(widget)
    
    def _on_widget_destroy(self, widget):
        self.active = False
        self.state_manager.unbind_property('follow-mode', self.follow_mode_switch, 'active')
        self.settings.unbind('display-distance', self.display_distance_adjustment, 'value')
        self.settings.unbind('display-size', self.display_size_adjustment, 'value')
        self.settings.unbind('follow-threshold', self.follow_threshold_adjustment, 'value')
        self.settings.unbind('widescreen-mode', self.widescreen_mode_switch, 'active')

def reload_display_distance_toggle_button(widget):
    distance = SettingsManager.get_instance().settings.get_double(widget.get_name())
    if distance: widget.set_label(str(distance))

def on_set_display_distance_toggle(widget):
    settings = SettingsManager.get_instance().settings
    distance = settings.get_double('display-distance')
    settings.set_double(widget.get_name(), distance)
    reload_display_distance_toggle_button(widget)
