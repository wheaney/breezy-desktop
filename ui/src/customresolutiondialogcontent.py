from gi.repository import Gtk, Gio
from .settingsmanager import SettingsManager

import gettext

_ = gettext.gettext


@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/custom-resolution-dialog-content.ui')
class CustomResolutionDialogContent(Gtk.Box):
    __gtype_name__ = 'CustomResolutionDialogContent'

    custom_resolution_width_scale = Gtk.Template.Child()
    custom_resolution_width_adjustment = Gtk.Template.Child()
    custom_resolution_height_scale = Gtk.Template.Child()
    custom_resolution_height_adjustment = Gtk.Template.Child()

    def __init__(self, add_button, on_add_callback):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.on_add_callback = on_add_callback

        add_button.connect('clicked', self._on_add_button_clicked)

    def _on_add_button_clicked(self, button):
        self.on_add_callback(self.custom_resolution_width_adjustment.get_value(), self.custom_resolution_height_adjustment.get_value())