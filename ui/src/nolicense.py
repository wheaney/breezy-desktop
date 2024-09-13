from gi.repository import Gtk, GLib, GObject

from .xrdriveripc import XRDriverIPC

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/no-license.ui')
class NoLicense(Gtk.Box):
    __gtype_name__ = "NoLicense"

    refresh_license_button = Gtk.Template.Child()

    def __init__(self, hide_refresh_button = False, **kwargs):
        super(Gtk.Box, self).__init__()
        self.init_template()

        self.ipc = XRDriverIPC.get_instance()

        if hide_refresh_button:
            self.refresh_license_button.hide()
        else:
            self.refresh_license_button.connect("clicked", self.on_refresh_license_button_clicked)

    def on_refresh_license_button_clicked(self, button):
        self.ipc.write_control_flags({'refresh_device_license': True})