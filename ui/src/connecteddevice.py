from gi.repository import Adw, Gtk


@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/connecteddevice.ui')
class ConnectedDevice(Gtk.Box):
    __gtype_name__ = "ConnectedDevice"

    effect_enable_switch = Gtk.Template.Child()
    display_distance_scale = Gtk.Template.Child()
    device_label = Gtk.Template.Child()
    set_toggle_display_distance_start_button = Gtk.Template.Child()
    set_toggle_display_distance_end_button = Gtk.Template.Child()
    reassign_recenter_display_shortcut_button = Gtk.Template.Child()
    reassign_toggle_display_distance_shortcut_button = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.get_settings().bind('display-distance', display_distance_scale, 'value', Gio.SettingsBindFlags.DEFAULT)
        self.get_settings().bind('effect-enable', effect_enable_switch, 'active', Gio.SettingsBindFlags.DEFAULT)

    def set_device_name(self, name):
        self.device_label.set_markup(f"<b>{name}</b>")
