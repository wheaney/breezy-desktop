from gi.repository import Gio, GLib, Gtk, GObject
from .configmanager import ConfigManager
from .extensionsmanager import ExtensionsManager
from .displaydistancedialog import DisplayDistanceDialog
from .license import BREEZY_GNOME_FEATURES
from .settingsmanager import SettingsManager
from .shortcutdialog import bind_shortcut_settings
from .statemanager import StateManager
from .virtualdisplaymanager import VirtualDisplayManager
from .virtualdisplayrow import VirtualDisplayRow
from .xrdriveripc import XRDriverIPC
import gettext
import logging

_ = gettext.gettext
logger = logging.getLogger('breezy_ui')

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/connected-device.ui')
class ConnectedDevice(Gtk.Box):
    __gtype_name__ = "ConnectedDevice"

    widescreen_mode_subtitle = _("Switches your glasses into side-by-side mode and doubles the width of the display.")
    widescreen_mode_not_supported_subtitle = _("This feature is not currently supported for your device.")

    device_label = Gtk.Template.Child()
    effect_enable_switch = Gtk.Template.Child()
    display_zoom_on_focus_switch = Gtk.Template.Child()
    # display_size_scale = Gtk.Template.Child()
    # display_size_adjustment = Gtk.Template.Child()
    # follow_threshold_scale = Gtk.Template.Child()
    # follow_threshold_adjustment = Gtk.Template.Child()
    # follow_mode_switch = Gtk.Template.Child()
    # widescreen_mode_switch = Gtk.Template.Child()
    # widescreen_mode_row = Gtk.Template.Child()
    # curved_display_switch = Gtk.Template.Child()
    top_features_group = Gtk.Template.Child()
    add_virtual_display_menu = Gtk.Template.Child()
    add_virtual_display_button = Gtk.Template.Child()
    launch_display_settings_button = Gtk.Template.Child()
    all_displays_distance_label = Gtk.Template.Child()
    change_all_displays_distance_button = Gtk.Template.Child()
    focused_display_distance_label = Gtk.Template.Child()
    change_focused_display_distance_button = Gtk.Template.Child()
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
    enable_multi_tap_switch = Gtk.Template.Child()
    monitor_wrapping_scheme_menu = Gtk.Template.Child()
    monitor_spacing_scale = Gtk.Template.Child()
    monitor_spacing_adjustment = Gtk.Template.Child()
    viewport_offset_x_scale = Gtk.Template.Child()
    viewport_offset_x_adjustment = Gtk.Template.Child()
    viewport_offset_y_scale = Gtk.Template.Child()
    viewport_offset_y_adjustment = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Box, self).__init__()
        self.init_template()
        self.active = True
        self.all_enabled_state_inputs = [
            self.display_zoom_on_focus_switch,
            # self.display_size_scale,
            # self.follow_mode_switch,
            # self.follow_threshold_scale,
            # self.curved_display_switch,
            self.add_virtual_display_menu,
            self.add_virtual_display_button,
            self.change_all_displays_distance_button,
            self.change_focused_display_distance_button,
            self.movement_look_ahead_scale,
            self.monitor_wrapping_scheme_menu,
            self.monitor_spacing_scale,
            self.viewport_offset_x_scale,
            self.viewport_offset_y_scale
        ]

        self.settings = SettingsManager.get_instance().settings
        self.desktop_settings = SettingsManager.get_instance().desktop_settings
        self.ipc = XRDriverIPC.get_instance()
        self.virtual_display_manager = VirtualDisplayManager.get_instance()
        self.extensions_manager = ExtensionsManager.get_instance()

        self.settings.connect('changed::display-distance', self._handle_display_distance)
        # self.settings.bind('display-size', self.display_size_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        # self.settings.bind('follow-threshold', self.follow_threshold_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        # self.settings.bind('widescreen-mode', self.widescreen_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        # self.settings.bind('curved-display', self.curved_display_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('headset-as-primary', self.headset_as_primary_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('use-optimal-monitor-config', self.use_optimal_monitor_config_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('use-highest-refresh-rate', self.use_highest_refresh_rate_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('fast-sbs-mode-switching', self.fast_sbs_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('look-ahead-override', self.movement_look_ahead_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('monitor-spacing', self.monitor_spacing_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('viewport-offset-x', self.viewport_offset_x_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind('viewport-offset-y', self.viewport_offset_y_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.settings.connect('changed::monitor-wrapping-scheme', self._handle_monitor_wrapping_scheme_setting_changed)
        self.desktop_settings.bind('text-scaling-factor', self.text_scaling_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.display_zoom_on_focus_switch.connect('notify::active', self._handle_zoom_on_focus_switch_changed)
        self.monitor_wrapping_scheme_menu.connect('changed', self._handle_monitor_wrapping_scheme_menu_changed)
        self._handle_monitor_wrapping_scheme_setting_changed(self.settings, self.settings.get_string('monitor-wrapping-scheme'))

        bind_shortcut_settings(self.get_parent(), [
            [self.reassign_toggle_xr_effect_shortcut_button, self.toggle_xr_effect_shortcut_label],
            [self.reassign_recenter_display_shortcut_button, self.recenter_display_shortcut_label],
            [self.reassign_toggle_display_distance_shortcut_button, self.toggle_display_distance_shortcut_label],
            [self.reassign_toggle_follow_shortcut_button, self.toggle_follow_shortcut_label]
        ])

        self.change_focused_display_distance_button.connect('clicked', 
            self._on_display_distance_preset_change_button_clicked,
            'toggle-display-distance-start',
            self._on_set_focused_display_distance, 
            _('Set Focused Display Distance'),
            _('Use a closer value so the display zooms in when you look at it.'),
            0.2, 1.0
        )
        self.change_all_displays_distance_button.connect('clicked', 
            self._on_display_distance_preset_change_button_clicked,
            'toggle-display-distance-end',
            self._on_set_all_displays_distance,
            _('Set All Displays Distance'),
            _('Use a farther value so the displays are zoomed out when you look away.'),
            1.0, 2.5
        )
        self._set_all_displays_distance(self.settings.get_double('toggle-display-distance-end'))
        self._set_focused_display_distance(self.settings.get_double('toggle-display-distance-start'))

        self.add_virtual_display_menu.set_active_id('1080p')
        self.add_virtual_display_button.connect('clicked', self._on_add_virtual_display)
        self.launch_display_settings_button.connect('clicked', self._launch_display_settings)

        self.state_manager = StateManager.get_instance()
        # self.state_manager.bind_property('follow-mode', self.follow_mode_switch, 'active', GObject.BindingFlags.DEFAULT)
        self.state_manager.connect('notify::enabled-features-list', self._handle_enabled_features)
        self.state_manager.connect('notify::device-supports-sbs', self._handle_device_supports_sbs)

        # self.follow_mode_switch.set_active(self.state_manager.get_property('follow-mode'))
        # self.follow_mode_switch.connect('notify::active', self._refresh_follow_mode)
        self.effect_enable_switch.connect('notify::active', self._handle_switch_enabled_state)

        self.config_manager = ConfigManager.get_instance()
        self.config_manager.connect('notify::breezy-desktop-enabled', self._handle_enabled_config)
        self.config_manager.bind_property('multi-tap-enabled', self.enable_multi_tap_switch, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.enable_multi_tap_switch.connect('notify::active', lambda widget, param: self.config_manager.set_property('multi-tap-enabled', widget.get_active()))

        self.use_optimal_monitor_config_switch.connect('notify::active', self._refresh_use_optimal_monitor_config)

        self._handle_switch_enabled_state(self.effect_enable_switch, None)
        self._handle_display_distance(self.settings, self.settings.get_double('display-distance'))
        self._handle_enabled_features(self.state_manager, None)
        self._handle_device_supports_sbs(self.state_manager, None)
        self._handle_enabled_config(None, None)
        self._refresh_use_optimal_monitor_config(self.use_optimal_monitor_config_switch, None)
        self.extensions_manager.connect('notify::breezy-enabled', self._handle_enabled_config)

        self.virtual_display_manager.connect('notify::displays', self._on_virtual_displays_update)
        self._on_virtual_displays_update(self.virtual_display_manager, None)

        # self.connect("destroy", self._on_widget_destroy)

        self.virtual_displays_by_pid = {}

        self._settings_displays_app_info = None

        for appinfo in Gio.AppInfo.get_all():
            if appinfo.get_id() == 'gnome-display-panel.desktop':
                self._settings_displays_app_info = appinfo
                break
    
    def _handle_zoom_on_focus_switch_changed(self, widget, param):
        display_distance = self.settings.get_double('display-distance')
        toggle_display_distance_end = self.settings.get_double('toggle-display-distance-end')
        toggle_display_distance_start = self.settings.get_double('toggle-display-distance-start')
        is_zoom_on_focus_already_enabled = display_distance < toggle_display_distance_end
        if widget.get_active() and not is_zoom_on_focus_already_enabled:
            self.settings.set_double('display-distance', toggle_display_distance_start)
        elif not widget.get_active() and is_zoom_on_focus_already_enabled:
            self.settings.set_double('display-distance', toggle_display_distance_end)

    def _handle_monitor_wrapping_scheme_setting_changed(self, settings, val):
        self.monitor_wrapping_scheme_menu.set_active_id(val)

    def _handle_monitor_wrapping_scheme_menu_changed(self, widget):
        self.settings.set_string('monitor-wrapping-scheme', widget.get_active_id())

    def _handle_enabled_features(self, state_manager, val):
        enabled_breezy_features = [feature for feature in state_manager.get_property('enabled-features-list') if feature in BREEZY_GNOME_FEATURES]
        breezy_features_granted = len(enabled_breezy_features) > 0
        if not breezy_features_granted:
            self.effect_enable_switch.set_active(False)
        self.effect_enable_switch.set_sensitive(breezy_features_granted)

    def _handle_device_supports_sbs(self, state_manager, val):
        if not state_manager.get_property('device-supports-sbs'):
            self.settings.set_boolean('widescreen-mode', False)
        # self.widescreen_mode_switch.set_sensitive(state_manager.get_property('device-supports-sbs'))
        # subtitle = self.widescreen_mode_subtitle if state_manager.get_property('device-supports-sbs') else self.widescreen_mode_not_supported_subtitle
        # self.widescreen_mode_row.set_subtitle(subtitle)

    def _handle_enabled_config(self, object, val):
        enabled = self.config_manager.get_property('breezy-desktop-enabled') and self.extensions_manager.get_property('breezy-enabled')
        if enabled != self.effect_enable_switch.get_active():
            self.effect_enable_switch.set_active(enabled)
    
    def _handle_switch_enabled_state(self, switch, param):
        GLib.idle_add(self._handle_switch_enabled_state_gui, switch, param)

    def _handle_switch_enabled_state_gui(self, switch, param):
        requesting_enabled = switch.get_active()

        # never turn off the extension, disabling the effect is done via configs only
        if requesting_enabled:
            self.extensions_manager.set_property('breezy-enabled', True)

        self.config_manager.set_property('breezy-desktop-enabled', requesting_enabled)

        for widget in self.all_enabled_state_inputs:
            widget.set_sensitive(requesting_enabled)
        
        # if requesting_enabled: 
        #     self._refresh_follow_mode(self.follow_mode_switch, None)

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

    def _handle_display_distance(self, *args):
        display_distance = self.settings.get_double('display-distance')
        toggle_display_distance_end = self.settings.get_double('toggle-display-distance-end')

        should_zoom_on_focus_be_enabled = display_distance < toggle_display_distance_end
        if self.display_zoom_on_focus_switch.get_active() != should_zoom_on_focus_be_enabled:
            self.display_zoom_on_focus_switch.set_active(should_zoom_on_focus_be_enabled)

    def _set_focused_display_distance(self, distance):
        self.focused_display_distance_label.set_markup(f"{_("Focused display")}: <b>{distance}</b>")
        self.settings.set_double('toggle-display-distance-start', distance)

        self.display_zoom_on_focus_switch.set_sensitive(distance != self.settings.get_double('toggle-display-distance-end'))

    def _set_all_displays_distance(self, distance):
        self.all_displays_distance_label.set_markup(f"{_("All displays")}: <b>{distance}</b>")
        self.settings.set_double('toggle-display-distance-end', distance)
        self.display_zoom_on_focus_switch.set_active(False)
        self.display_zoom_on_focus_switch.set_sensitive(distance != self.settings.get_double('toggle-display-distance-start'))

    def _on_display_distance_preset_change_button_clicked(self, widget, settings_key, on_save_callback, title, subtitle, lower_limit, upper_limit):
        dialog = DisplayDistanceDialog(settings_key, on_save_callback, title, subtitle, lower_limit, upper_limit)
        dialog.set_transient_for(widget.get_ancestor(Gtk.Window))
        dialog.present()
            
    def _on_set_all_displays_distance(self, prev_distance, distance):
        focused_display_distance = self.settings.get_double('toggle-display-distance-start')
        all_displays_distance = self.settings.get_double('toggle-display-distance-end')
        if (distance < focused_display_distance):
            self._set_focused_display_distance(distance)
        
        self._set_all_displays_distance(distance)

        if prev_distance == focused_display_distance:
            self.settings.set_double('display-distance', prev_distance)

    def _on_set_focused_display_distance(self, prev_distance, distance):
        focused_display_distance = self.settings.get_double('toggle-display-distance-start')
        all_displays_distance = self.settings.get_double('toggle-display-distance-end')
        if (distance > all_displays_distance):
            self._set_all_displays_distance(distance)

        self._set_focused_display_distance(distance)

    def _on_add_virtual_display(self, *args):
        resolution = self.add_virtual_display_menu.get_active_id()
        logger.info(f"Adding virtual display {resolution}")

        width = 1920
        height = 1080
        if resolution == '1440p':
            width = 2560
            height = 1440

        self.virtual_display_manager.create_virtual_display(width, height, 60)

    def _on_virtual_displays_update(self, virtual_display_manager, val):
        GLib.idle_add(self._on_virtual_displays_update_gui, virtual_display_manager)

    def _on_virtual_displays_update_gui(self, virtual_display_manager):
        effect_enabled = self.effect_enable_switch.get_active()
        virtual_displays_present = len(virtual_display_manager.displays) > 0
        self.launch_display_settings_button.set_visible(
            self._settings_displays_app_info is not None and virtual_displays_present
        )
        self.monitor_wrapping_scheme_menu.set_sensitive(effect_enabled and virtual_displays_present)
        self.monitor_spacing_scale.set_sensitive(effect_enabled and virtual_displays_present)

        for pid, child in self.virtual_displays_by_pid.items():
            self.top_features_group.remove(child)

        new_displays_by_pid = {}
        for display in virtual_display_manager.displays:
            child = self.virtual_displays_by_pid.get(
                display['pid'], 
                VirtualDisplayRow(display['pid'], display['width'], display['height'], 60))
            self.top_features_group.add(child)
            new_displays_by_pid[display['pid']] = child
        
        self.virtual_displays_by_pid = new_displays_by_pid

    def _launch_display_settings(self, *args):
        self._settings_displays_app_info.launch()
    
    # def _on_widget_destroy(self, widget):
        # self.state_manager.unbind_property('follow-mode', self.follow_mode_switch, 'active')
        # self.settings.unbind('display-size', self.display_size_adjustment, 'value')
        # self.settings.unbind('follow-threshold', self.follow_threshold_adjustment, 'value')
        # self.settings.unbind('widescreen-mode', self.widescreen_mode_switch, 'active')

def reload_display_distance_toggle_button(widget):
    distance = SettingsManager.get_instance().settings.get_double(widget.get_name())
    if distance: widget.set_label(str(distance))

def on_set_display_distance_toggle(widget):
    settings = SettingsManager.get_instance().settings
    distance = settings.get_double('display-distance')
    settings.set_double(widget.get_name(), distance)
    reload_display_distance_toggle_button(widget)
