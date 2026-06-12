"""GNOME Shell runtime environment for Breezy Desktop.

This is the reference RuntimeEnvironment implementation. It is packaged into the
UI's ``runtimes`` subpackage by the GNOME package script (see bin/package_gnome
-> ui/bin/package), so its imports are relative to the installed
``breezydesktop`` package.
"""

import logging
import os

import pydbus

from ..runtimeenvironment import RuntimeEnvironment

logger = logging.getLogger('breezy_ui')

BREEZY_DESKTOP_UUID = "breezydesktop@xronlinux.com"
EXTENSION_STATE_ENABLED = 1


class BreezyGNOMERuntimeEnvironment(RuntimeEnvironment):
    """Runs Breezy Desktop as a GNOME Shell extension.

    Enablement is backed by the GNOME Shell extension state, verification runs
    the breezy_gnome_verify binary, updates are checked against GitHub, and
    virtual displays are created via the Mutter ScreenCast portal.
    """

    APP_NAMESPACE = 'breezy_gnome'

    def __init__(self):
        super().__init__()

        self.bus = pydbus.SessionBus()
        self.gnome_shell_extensions = self.bus.get("org.gnome.Shell.Extensions")
        self.gnome_shell_extensions.ExtensionStateChanged.connect(self._handle_extension_state_change)

        self._breezy_enabled = self.is_enabled()

    def _handle_extension_state_change(self, extension_uuid, state):
        if extension_uuid == BREEZY_DESKTOP_UUID:
            enabled = state.get('state') == EXTENSION_STATE_ENABLED
            # update internal state first so do_set_property doesn't re-trigger
            # an extension enable/disable; this just emits the notify
            self._breezy_enabled = enabled
            self.set_property('breezy-enabled', enabled)

    # --- effect enablement ------------------------------------------------

    def is_installed(self):
        extensions_result = self.gnome_shell_extensions.ListExtensions()
        for extension in extensions_result:
            if extension == BREEZY_DESKTOP_UUID:
                return True
        return False

    def is_enabled(self):
        return self.gnome_shell_extensions.GetExtensionInfo(BREEZY_DESKTOP_UUID).get('state') == EXTENSION_STATE_ENABLED

    def enable(self):
        if not self.gnome_shell_extensions.UserExtensionsEnabled:
            self.gnome_shell_extensions.UserExtensionsEnabled = True
        self.gnome_shell_extensions.EnableExtension(BREEZY_DESKTOP_UUID)
        self._breezy_enabled = True

    def disable(self):
        self.gnome_shell_extensions.DisableExtension(BREEZY_DESKTOP_UUID)
        self._breezy_enabled = False

    # --- verification / updates -------------------------------------------

    def verify(self):
        from .verify import verify_installation
        return verify_installation()

    def check_for_update(self, current_version, callback):
        from .updatechecker import check_for_update
        return check_for_update(current_version, callback)

    # --- optional views ---------------------------------------------------

    @property
    def shows_no_device_view(self):
        return True

    # --- virtual displays -------------------------------------------------

    def is_virtual_display_supported(self):
        # wayland + the Mutter ScreenCast portal are required to create displays
        from .virtualdisplay import is_screencast_available
        return is_screencast_available() and "WAYLAND_DISPLAY" in os.environ

    def _create_virtual_display_manager(self):
        from .virtualdisplaymanager import VirtualDisplayManager
        return VirtualDisplayManager.get_instance()

    # --- GObject property plumbing ----------------------------------------

    def do_set_property(self, prop, value):
        if prop.name == 'breezy-enabled' and value != self._breezy_enabled:
            self.enable() if value else self.disable()

    def do_get_property(self, prop):
        if prop.name == 'breezy-enabled':
            return self._breezy_enabled
