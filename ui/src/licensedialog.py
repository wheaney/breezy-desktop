from gi.repository import Gtk
from .licensedialogcontent import LicenseDialogContent

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-dialog.ui')
class LicenseDialog(Gtk.Dialog):
    __gtype_name__ = 'LicenseDialog'

    refresh_license_button = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Dialog, self).__init__()
        self.init_template()
        self.content = LicenseDialogContent(self.refresh_license_button)
        self.get_content_area().append(self.content)