from gi.repository import Adw, Gtk
from .virtualdisplaymanager import VirtualDisplayManager

import gettext

_ = gettext.gettext

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/virtual-display-row.ui')
class VirtualDisplayRow(Adw.ActionRow):
    __gtype_name__ = "VirtualDisplayRow"

    remove_virtual_display_button = Gtk.Template.Child()

    def __init__(self, pid, width, height, framerate):
        super(Adw.ActionRow, self).__init__()
        self.init_template()
        self.pid = pid

        icon = Gtk.Image.new_from_icon_name("video-display-symbolic")

        # padding around the icon
        self.add_prefix(Gtk.Label(label="  "))
        self.add_prefix(icon)
        self.add_prefix(Gtk.Label(label="  "))

        self.set_subtitle(f"{width} x {height}")

        self.remove_virtual_display_button.connect('clicked', self._remove_virtual_display)

    def _remove_virtual_display(self, widget):
        VirtualDisplayManager.get_instance().destroy_virtual_display(self.pid)