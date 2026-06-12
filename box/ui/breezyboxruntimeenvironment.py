"""Breezy Box runtime environment (headless).

Stub implementation for the headless "Breezy Box" environment. Unlike the GNOME
environment there is no shell extension to install/enable, no verification step,
and no in-app update prompt. The connected-device view is always shown (with a
fallback label when no glasses are connected).

Virtual-display support is not yet implemented here; flesh out
``_create_virtual_display_manager`` / ``is_virtual_display_supported`` against
the box backend when it exists.

This module is packaged into the UI's ``runtimes`` subpackage by the box package
flow, so its imports are relative to the installed ``breezydesktop`` package.
"""

import logging

from ..runtimeenvironment import RuntimeEnvironment

logger = logging.getLogger('breezy_ui')


class BreezyBoxRuntimeEnvironment(RuntimeEnvironment):
    APP_NAMESPACE = 'breezy_box'

    def __init__(self):
        super().__init__()
        # On the box the effect is always engaged; there's no extension to gate
        # it behind.
        self._breezy_enabled = True

    # is_installed(), verify(), check_for_update(), enable()/disable() and the
    # NullVirtualDisplayManager defaults from RuntimeEnvironment are all
    # appropriate for the box stub.

    @property
    def shows_no_device_view(self):
        # Always show the connected-device view; no_device_label() supplies the
        # text shown when no glasses are connected.
        return False
