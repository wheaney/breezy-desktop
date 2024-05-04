# main.py
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

import sys
import gi
import threading

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('Gio', '2.0')

from gi.repository import Adw, Gtk, Gio
from .window import BreezydesktopWindow
from .nodevice import NoDevice
from .connecteddevice import ConnectedDevice
from .XRDriverIPC import XRDriverIPC

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class BreezydesktopApplication(Adw.Application):
    """The main application singleton class."""

    def __init__(self):
        super().__init__(application_id='com.xronlinux.BreezyDesktop',
                         flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.create_action('quit', lambda *_: self.quit(), ['<primary>q'])
        self.create_action('about', self.on_about_action)
        self.ipc = XRDriverIPC(logger = Logger(), user="wayne", user_home="/home/wayne")
        self.settings = Gio.Settings.new_with_path("com.xronlinux.BreezyDesktop", "/com/xronlinux/BreezyDesktop/")

    def do_activate(self):
        """Called when the application is activated.

        We raise the application's main window, creating it if
        necessary.
        """
        win = self.props.active_window
        if not win:
            win = BreezydesktopWindow(application=self)
        win.set_settings(self.settings)
        win.present()

        self._refresh_driver_state()

    def _refresh_driver_state(self):
        self.props.active_window.set_state(self.ipc.retrieve_driver_state())
        threading.Timer(1.0, self._refresh_driver_state).start()

    def on_about_action(self, widget, _):
        """Callback for the app.about action."""
        about = Gtk.AboutDialog(transient_for=self.props.active_window,
                                modal=True,
                                program_name='Breezy Desktop',
                                logo_icon_name='com.xronlinux.BreezyDesktop',
                                version='0.1.0',
                                authors=['Wayne Heaney'],
                                copyright='© 2024 Wayne Heaney')
        about.present()

    def create_action(self, name, callback, shortcuts=None):
        """Add an application action.

        Args:
            name: the name of the action
            callback: the function to be called when the action is
              activated
            shortcuts: an optional list of accelerators
        """
        action = Gio.SimpleAction.new(name, None)
        action.connect("activate", callback)
        self.add_action(action)
        if shortcuts:
            self.set_accels_for_action(f"app.{name}", shortcuts)


def main(version):
    """The application's entry point."""
    app = BreezydesktopApplication()
    return app.run(sys.argv)
