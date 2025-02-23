from gi.repository import Gtk, Gio
from .displaydistancedialogcontent import DisplayDistanceDialogContent

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/display-distance-dialog.ui')
class DisplayDistanceDialog(Gtk.Dialog):
    __gtype_name__ = 'DisplayDistanceDialog'

    show_full_scale_button = Gtk.Template.Child()
    save_button = Gtk.Template.Child()

    def __init__(self, settings_key, on_save_callback, title, subtitle, lower_limit, upper_limit):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.on_save_callback = on_save_callback
        self.set_title(title)

        self.content = DisplayDistanceDialogContent(settings_key, self.show_full_scale_button, self.save_button, self._on_save_callback, subtitle, lower_limit, upper_limit)
        self.get_content_area().append(self.content)

        self.show_full_scale_button.connect('clicked', self._on_show_full_scale_button_clicked)

    def _on_show_full_scale_button_clicked(self, button):
        self.show_full_scale_button.set_visible(False)

    def _on_save_callback(self, prev_distance, distance):
        self.on_save_callback(prev_distance, distance)
        self.close()