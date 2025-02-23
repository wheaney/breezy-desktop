from gi.repository import Gtk, Gio
from .displaydistancedialogcontent import DisplayDistanceDialogContent

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/display-distance-dialog.ui')
class DisplayDistanceDialog(Gtk.Dialog):
    __gtype_name__ = 'DisplayDistanceDialog'

    save_button = Gtk.Template.Child()

    def __init__(self, settings_key, on_save_callback, title):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.on_save_callback = on_save_callback
        self.set_title(title)

        self.content = DisplayDistanceDialogContent(settings_key, self.save_button, self._on_save_callback)
        self.get_content_area().append(self.content)

    def _on_save_callback(self, prev_distance, distance):
        self.on_save_callback(prev_distance, distance)
        self.close()