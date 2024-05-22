from gi.repository import Gtk
from .statemanager import StateManager
from .licensetierrow import LicenseTierRow
from .licensefeaturerow import LicenseFeatureRow

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-dialog.ui')
class LicenseDialog(Gtk.Dialog):
    __gtype_name__ = 'LicenseDialog'

    tiers = Gtk.Template.Child()
    features = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.state_manager = StateManager.get_instance()
        self._handle_license();

    def _handle_license(self):
        license_view = self.state_manager.state['ui_view']['license']
        for tier_name, tier_details in license_view['tiers'].items():
            self.tiers.append(LicenseTierRow(tier_name, tier_details))

        for feature_name, feature_details in license_view['features'].items():
            self.features.append(LicenseFeatureRow(feature_name, feature_details))