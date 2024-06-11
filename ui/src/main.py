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

import gi
import logging
import os
import sys
import argparse

from logging.handlers import TimedRotatingFileHandler

gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('Gio', '2.0')
gi.require_version('GLib', '2.0')

from gi.repository import Adw, Gtk, Gio
from .licensedialog import LicenseDialog
from .statemanager import StateManager
from .window import BreezydesktopWindow
from .xrdriveripc import XRDriverIPC

state_dir = os.path.expanduser("~/.local/state")
log_dir = os.path.join(state_dir, 'breezy_gnome/logs/ui')
os.makedirs(log_dir, exist_ok=True)

logger = logging.getLogger('breezy_ui')
logger.setLevel(logging.INFO)
logname = os.path.join(log_dir, "breezy_desktop.log")
handler = TimedRotatingFileHandler(logname, when="midnight", backupCount=30)
handler.suffix = "%Y%m%d"
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

def excepthook(exc_type, exc_value, exc_traceback):
    logger.error('Unhandled exception', exc_info=(exc_type, exc_value, exc_traceback))

sys.excepthook = excepthook

XRDriverIPC.set_instance(XRDriverIPC(logger))

class BreezydesktopApplication(Adw.Application):
    """The main application singleton class."""

    def __init__(self, skip_verification):
        super().__init__(application_id='com.xronlinux.BreezyDesktop',
                         flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        self.create_action('quit', self.on_quit_action, ['<primary>q'])
        self.create_action('about', self.on_about_action)
        self.create_action('license', self.on_license_action)
        self._skip_verification = skip_verification

    def do_activate(self):
        """Called when the application is activated.

        We raise the application's main window, creating it if
        necessary.
        """
        win = self.props.active_window
        if not win:
            win = BreezydesktopWindow(self._skip_verification, application=self)
            win.connect('close-request', lambda *_: self.on_quit_action())
            win.connect('destroy', lambda *_: self.on_quit_action())
        win.present()

    def on_about_action(self, widget, _):
        """Callback for the app.about action."""
        about = Gtk.AboutDialog(transient_for=self.props.active_window,
                                modal=True,
                                program_name='Breezy Desktop',
                                logo_icon_name='com.xronlinux.BreezyDesktop',
                                version='0.1.1',
                                authors=['Wayne Heaney'],
                                copyright='© 2024 Wayne Heaney')
        about.present()

    def on_license_action(self, widget, _):
        dialog = LicenseDialog()
        dialog.set_transient_for(self.props.active_window)
        dialog.present()

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

    def on_quit_action(self, _action = None, _pspec = None):
        win = self.props.active_window
        if win:
            win.close()

        StateManager.destroy_instance()
        self.quit()


def main(version):
    parser = argparse.ArgumentParser()
    parser.add_argument("-sv", "--skip-verification", action="store_true")
    parser.parse_args()

    app = BreezydesktopApplication(parser.skip-verification)
    return app.run(sys.argv)
