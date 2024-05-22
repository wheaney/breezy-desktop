from gi.repository import Adw, Gtk, GLib
from .statemanager import StateManager
from .licensetierrow import LicenseTierRow
from .licensefeaturerow import LicenseFeatureRow
from .xrdriveripc import XRDriverIPC

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/license-dialog.ui')
class LicenseDialog(Gtk.Dialog):
    __gtype_name__ = 'LicenseDialog'

    tiers = Gtk.Template.Child()
    features = Gtk.Template.Child()
    request_token = Gtk.Template.Child()
    verify_token = Gtk.Template.Child()
    refresh_license_button = Gtk.Template.Child()

    def __init__(self):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.ipc = XRDriverIPC.get_instance()
        StateManager.get_instance().connect('license-action-needed', self._handle_license)
        self._handle_license(StateManager.get_instance())

        self.request_token.connect('apply', self._on_request_token)
        self.verify_token.connect('apply', self._on_verify_token)
        self.refresh_license_button.connect('clicked', self._refresh_license)

    def _refresh_license(self, widget):
        self.refresh_license_button.set_sensitive(False)
        self.ipc.write_control_flags({'refresh_device_license': True})
        GLib.timeout_add_seconds(3, self._handle_license)

    def _handle_license(self, state_manager = None, val = None):
        GLib.idle_add(self._handle_license_idle, state_manager or StateManager.get_instance())
    
    def _handle_license_idle(self, state_manager):
        self.refresh_license_button.set_sensitive(False)

        license_view = state_manager.state['ui_view']['license']
        self.request_token.set_visible(not state_manager.confirmed_token)
        self.verify_token.set_visible(not state_manager.confirmed_token)

        for child in self.tiers:
            self.tiers.remove(child)
        tiers_group = Adw.PreferencesGroup(title="Paid Tier Status", margin_top=20)
        self.tiers.append(tiers_group)
        
        for tier_name, tier_details in license_view['tiers'].items():
            tiers_group.add(LicenseTierRow(tier_name, tier_details))

        for child in self.features:
            self.features.remove(child)
        features_group = Adw.PreferencesGroup(title="Feature Availability", margin_top=20)
        self.features.append(features_group)

        for feature_name, feature_details in license_view['features'].items():
            features_group.add(LicenseFeatureRow(feature_name, feature_details))

        self.refresh_license_button.set_sensitive(True)

    def _on_request_token(self, widget):
        email_address = self.request_token.get_text()
        self.request_token.set_editable(False)
        if not self.ipc.request_token(email_address):
            self.request_token.set_editable(True)

    def _on_verify_token(self, widget):
        token = self.verify_token.get_text()
        self.request_token.set_editable(False)
        self.verify_token.set_editable(False)
        if self.ipc.verify_token(token):
            self.ipc.write_control_flags({'refresh_device_license': True})
        else:
            self.request_token.set_editable(True)
            self.verify_token.set_editable(True)