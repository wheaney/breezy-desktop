# window.py
#
# Copyright 2024 Unknown
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# SPDX-License-Identifier: GPL-3.0-or-later

from gi.repository import Gtk, GLib
from .extensionsmanager import ExtensionsManager
from .license import BREEZY_GNOME_FEATURES
from .licensedialog import LicenseDialog
from .statemanager import StateManager
from .connecteddevice import ConnectedDevice
from .failedverification import FailedVerification
from .nodevice import NoDevice
from .nodriver import NoDriver
from .noextension import NoExtension
from .nolicense import NoLicense
from .verify import verify_installation

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/window.ui')
class BreezydesktopWindow(Gtk.ApplicationWindow):
    __gtype_name__ = 'BreezydesktopWindow'

    main_content = Gtk.Template.Child()
    license_action_needed_banner = Gtk.Template.Child()
    license_action_needed_button = Gtk.Template.Child()
    missing_breezy_features_banner = Gtk.Template.Child()
    missing_breezy_features_button = Gtk.Template.Child()

    def __init__(self, skip_verification, **kwargs):
        super().__init__(**kwargs)
        
        self._skip_verification = skip_verification

        self.state_manager = StateManager.get_instance()
        self.state_manager.connect('device-update', self._handle_state_update)
        self.state_manager.connect('notify::license-action-needed', self._handle_state_update)
        self.state_manager.connect('notify::license-present', self._handle_state_update)
        self.state_manager.connect('notify::enabled-features-list', self._handle_state_update)

        self.connected_device = ConnectedDevice()
        self.failed_verification = FailedVerification()
        self.no_device = NoDevice()
        self.no_driver = NoDriver()
        self.no_extension = NoExtension()
        self.no_license = NoLicense()

        self.license_action_needed_button.connect('clicked', self._on_license_button_clicked)
        self.missing_breezy_features_button.connect('clicked', self._on_license_button_clicked)

        self._handle_state_update(self.state_manager, None)

        self._skip_verification = skip_verification

        self.connect("destroy", self._on_window_destroy)

    def _handle_state_update(self, state_manager, val):
        GLib.idle_add(self._handle_state_update_gui, state_manager)

    def _handle_state_update_gui(self, state_manager):
        enabled_breezy_features = [feature for feature in state_manager.get_property('enabled-features-list') if feature in BREEZY_GNOME_FEATURES]
        breezy_features_granted = len(enabled_breezy_features) > 0
        self.missing_breezy_features_banner.set_revealed(not breezy_features_granted)
        self.license_action_needed_banner.set_revealed(state_manager.get_property('license-action-needed') == True)

        for child in self.main_content:
            self.main_content.remove(child)

        if not self._skip_verification and not verify_installation():
            self.main_content.append(self.failed_verification)
        elif not self.state_manager.driver_running:
            self.main_content.append(self.no_driver)
        elif not self.state_manager.license_present:
            self.main_content.append(self.no_license)
        elif not state_manager.connected_device_name:
            self.main_content.append(self.no_device)
        elif not ExtensionsManager.get_instance().is_installed():
            self.main_content.append(self.no_extension)
        else:
            self.main_content.append(self.connected_device)
            self.connected_device.set_device_name(state_manager.connected_device_name)

    def _on_license_button_clicked(self, widget):
        dialog = LicenseDialog()
        dialog.set_transient_for(widget.get_ancestor(Gtk.Window))
        dialog.present()

    def _on_window_destroy(self, widget):
        self.state_manager.disconnect_by_func(self._handle_state_update)