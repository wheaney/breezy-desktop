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
from .licensedialog import LicenseDialog
from .statemanager import StateManager
from .connecteddevice import ConnectedDevice
from .nodevice import NoDevice
from .noextension import NoExtension
from .time import LICENSE_WARN_SECONDS

@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/window.ui')
class BreezydesktopWindow(Gtk.ApplicationWindow):
    __gtype_name__ = 'BreezydesktopWindow'

    main_content = Gtk.Template.Child()
    license_action_needed_banner = Gtk.Template.Child()

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        self.state_manager = StateManager.get_instance()
        self.state_manager.connect('device-update', self._handle_device_update)
        self.state_manager.connect('license-action-needed', self._handle_device_update)

        self.connected_device = ConnectedDevice()
        self.no_device = NoDevice()
        self.no_extension = NoExtension()

        self.license_action_needed_banner.connect('button-clicked', self._on_license_action_needed_button_clicked)

        self._handle_device_update(self.state_manager, None)

        self.connect("destroy", self._on_window_destroy)

    def _handle_device_update(self, state_manager, val):
        GLib.idle_add(self._handle_device_update_gui, state_manager)

    def _handle_device_update_gui(self, state_manager):
        license_action_needed_seconds = state_manager.get_property('license-action-needed-seconds')
        show_banner = license_action_needed_seconds is not None and license_action_needed_seconds < LICENSE_WARN_SECONDS
        self.license_action_needed_banner.set_revealed(show_banner)

        for child in self.main_content:
            self.main_content.remove(child)

        if not ExtensionsManager.get_instance().is_installed():
            self.main_content.append(self.no_extension)
        elif state_manager.connected_device_name:
            self.main_content.append(self.connected_device)
            self.connected_device.set_device_name(state_manager.connected_device_name)
        else:
            self.main_content.append(self.no_device)

    def _on_license_action_needed_button_clicked(self, widget):
        dialog = LicenseDialog()
        dialog.set_transient_for(widget.get_ancestor(Gtk.Window))
        dialog.present()

    def _on_window_destroy(self, widget):
        self.state_manager.disconnect_by_func(self._handle_device_update)