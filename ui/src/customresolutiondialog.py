from gi.repository import Gtk, Gio
from .customresolutiondialogcontent import CustomResolutionDialogContent

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/custom-resolution-dialog.ui')
class CustomResolutionDialog(Gtk.Dialog):
    __gtype_name__ = 'CustomResolutionDialog'

    add_button = Gtk.Template.Child()

    def __init__(self, on_add_callback):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.on_add_callback = on_add_callback

        self.content = CustomResolutionDialogContent(self.add_button, self._on_add_callback)
        self.get_content_area().append(self.content)

    def _on_add_callback(self, width, height):
        self.on_add_callback(width, height)
        self.close()