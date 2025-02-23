from gi.repository import Gtk, Gio
from .settingsmanager import SettingsManager

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/display-distance-dialog-content.ui')
class DisplayDistanceDialogContent(Gtk.Box):
    __gtype_name__ = 'DisplayDistanceDialogContent'

    display_distance_adjustment = Gtk.Template.Child()

    def __init__(self, settings_key, save_button, on_save_callback):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.on_save_callback = on_save_callback
        self.settings = SettingsManager.get_instance().settings
        self.prev_distance = self.settings.get_double('display-distance')

        self.settings.bind('display-distance', self.display_distance_adjustment, 'value', Gio.SettingsBindFlags.DEFAULT)

        save_button.connect('clicked', self._on_save_button_clicked)

    def _on_save_button_clicked(self, button):
        self.on_save_callback(self.prev_distance, self.display_distance_adjustment.get_value())