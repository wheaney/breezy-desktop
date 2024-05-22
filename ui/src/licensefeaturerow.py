from gi.repository import Gtk

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-feature-row.ui')
class LicenseFeatureRow(Gtk.Grid):
    __gtype_name__ = 'LicenseFeatureRow'

    def __init__(self, feature_name, feature_details):
        super(Gtk.Grid, self).__init__()
        self.init_template()
