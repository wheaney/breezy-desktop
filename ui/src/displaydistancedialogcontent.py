from gi.repository import Gtk, Gio
from .settingsmanager import SettingsManager
from .statemanager import StateManager

import gettext

_ = gettext.gettext


@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/display-distance-dialog-content.ui')
class DisplayDistanceDialogContent(Gtk.Box):
    __gtype_name__ = 'DisplayDistanceDialogContent'

    display_distance_subtitle = Gtk.Template.Child()
    display_distance_scale = Gtk.Template.Child()
    display_distance_adjustment = Gtk.Template.Child()

    def __init__(self, settings_key, save_button, on_save_callback, subtitle, lower_limit, upper_limit):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.display_distance_subtitle.set_markup(f"""<span size="small">{subtitle}</span>""")

        self.on_save_callback = on_save_callback
        self.settings = SettingsManager.get_instance().settings
        self.state_manager = StateManager.get_instance()
        self.prev_distance = self.settings.get_double('display-distance')
        self.display_distance_adjustment.set_value(self.settings.get_double(settings_key))

        self.display_distance_scale.set_format_value_func(lambda scale, val: self._format_distance(val))
        self.state_manager.connect('notify::connected-device-full-distance-cm', lambda *args: self.display_distance_scale.queue_draw())
        self.settings.connect('changed::units', lambda *args: self.display_distance_scale.queue_draw())
        save_button.connect('clicked', self._on_save_button_clicked)

    def _on_save_button_clicked(self, button):
        self.on_save_callback(self.prev_distance, self.display_distance_adjustment.get_value())

    def _get_units(self):
        units = self.settings.get_string('units')
        return units if units in ['cm', 'in'] else 'cm'

    def _format_distance(self, normalized):
        full_cm = float(self.state_manager.get_property('connected-device-full-distance-cm') or 0.0)
        if full_cm <= 0:
            return f"{round(normalized, 2)}"
        cm = normalized * full_cm
        if self._get_units() == 'in':
            inches = cm / 2.54
            return f"{inches:.2f} in"
        return f"{cm:.1f} cm"