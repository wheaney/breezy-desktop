import gettext

from gi.repository import GObject

_ = gettext.gettext

# Default namespace used for XDG directories, application identity, etc. A
# concrete RuntimeEnvironment should override APP_NAMESPACE.
DEFAULT_APP_NAMESPACE = 'breezy_gnome'


class NullVirtualDisplayManager(GObject.GObject):
    """A no-op virtual display manager.

    Provides the same interface (the 'displays' property + change
    notifications, plus create/destroy methods) that the UI binds to, but
    never creates anything.  Runtime environments that don't support virtual
    displays can use this so the UI degrades gracefully.
    """
    __gproperties__ = {
        'displays': (object, 'Displays', 'A list of the displays', GObject.ParamFlags.READWRITE)
    }

    def __init__(self):
        GObject.GObject.__init__(self)
        self._displays = []

    def create_virtual_display(self, width, height, framerate):
        return None

    def destroy_virtual_display(self, pid):
        return False

    def do_set_property(self, prop, value):
        if prop.name == 'displays':
            self._displays = value

    def do_get_property(self, prop):
        if prop.name == 'displays':
            return self._displays


class RuntimeEnvironment(GObject.GObject):
    """Abstraction over the host environment the UI is running in.

    A RuntimeEnvironment encapsulates everything that differs between the
    environments Breezy can run in (e.g. GNOME Shell vs. a headless Breezy Box):
    how the effect is enabled, how the installation is verified, whether/how
    updates are checked, how virtual displays are managed, and which optional
    views and fields the UI should present.

    The first concrete subclass discovered in the bundled ``runtimes`` package
    (see :mod:`breezydesktop.runtime`) is instantiated as the active
    environment, so a build can swap behavior simply by packaging a different
    implementation.

    Subclasses inherit the ``breezy-enabled`` GObject property; override
    :meth:`enable`/:meth:`disable`/:meth:`is_enabled` (and, if needed,
    ``do_set_property``/``do_get_property``) to back it with real state.
    """

    # The application/namespace identifier, e.g. 'breezy_gnome' or 'breezy_box'.
    # Used for namespacing XDG directories and similar.  Subclasses must set
    # this.
    APP_NAMESPACE = None

    __gproperties__ = {
        'breezy-enabled': (bool, 'Breezy Enabled', 'Whether the Breezy Desktop effect is enabled', False, GObject.ParamFlags.READWRITE)
    }

    _instance = None

    @classmethod
    def get_instance(cls):
        if RuntimeEnvironment._instance is None:
            from .runtime import get_runtime_class
            RuntimeEnvironment._instance = get_runtime_class()()
        return RuntimeEnvironment._instance

    def __init__(self):
        GObject.GObject.__init__(self)
        self._breezy_enabled = False
        self._virtual_display_manager = None

    # --- identity ---------------------------------------------------------

    @classmethod
    def app_namespace(cls):
        return cls.APP_NAMESPACE or DEFAULT_APP_NAMESPACE

    # --- effect enablement (backs the 'breezy-enabled' property) ----------

    def is_installed(self):
        """Whether the supporting components for this environment are installed.

        Environments with no separate component to install (e.g. a headless
        box where the runtime is always present) should return True.
        """
        return True

    def is_enabled(self):
        return self._breezy_enabled

    def enable(self):
        self._breezy_enabled = True

    def disable(self):
        self._breezy_enabled = False

    # --- verification -----------------------------------------------------

    def verify(self):
        """Verify the installation. Return True when verification passes (or
        when the environment has no verification step)."""
        return True

    # --- update checking --------------------------------------------------

    def check_for_update(self, current_version, callback):
        """Asynchronously check for a newer version.

        Implementations that support updates should invoke
        ``callback(latest_version_str)`` when a newer version is available.
        The default is a no-op (no update prompt).
        """
        return None

    # --- optional views / fields ------------------------------------------

    @property
    def shows_no_device_view(self):
        """Whether a dedicated "no device connected" view should be shown.

        When False, the connected-device view is always shown and
        :meth:`no_device_label` supplies the label used when no device is
        actually connected.
        """
        return False

    def no_device_label(self):
        """Label shown in place of a device name when no device is connected
        (only relevant when :attr:`shows_no_device_view` is False)."""
        return _("No supported glasses connected")

    # --- virtual displays -------------------------------------------------

    def is_virtual_display_supported(self):
        return False

    def _create_virtual_display_manager(self):
        """Build the virtual display manager for this environment. Override to
        provide a real implementation."""
        return NullVirtualDisplayManager()

    @property
    def virtual_display_manager(self):
        if self._virtual_display_manager is None:
            self._virtual_display_manager = self._create_virtual_display_manager()
        return self._virtual_display_manager

    # --- GObject property plumbing ----------------------------------------

    def do_set_property(self, prop, value):
        if prop.name == 'breezy-enabled' and value != self.is_enabled():
            self.enable() if value else self.disable()

    def do_get_property(self, prop):
        if prop.name == 'breezy-enabled':
            return self.is_enabled()
