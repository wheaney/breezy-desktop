"""Runtime environment discovery.

Exactly one concrete :class:`~breezydesktop.runtimeenvironment.RuntimeEnvironment`
implementation is bundled into the ``runtimes`` subpackage at package time. This
module finds it (the first one it sees) and exposes both the class and a cheap
way to read its namespace without constructing the (potentially side-effectful)
instance.
"""

import importlib
import inspect
import logging
import pkgutil

from .runtimeenvironment import RuntimeEnvironment, DEFAULT_APP_NAMESPACE

logger = logging.getLogger('breezy_ui')

_runtime_class = None


def get_runtime_class():
    """Return the active RuntimeEnvironment subclass.

    Scans the bundled ``runtimes`` subpackage and returns the first concrete
    RuntimeEnvironment subclass found. The result is cached. Raises
    RuntimeError if no implementation is bundled.
    """
    global _runtime_class
    if _runtime_class is not None:
        return _runtime_class

    from . import runtimes

    for module_info in pkgutil.iter_modules(runtimes.__path__, runtimes.__name__ + '.'):
        try:
            module = importlib.import_module(module_info.name)
        except Exception as e:
            logger.error("Failed to import runtime module %s: %s", module_info.name, e)
            continue

        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, RuntimeEnvironment) and obj is not RuntimeEnvironment \
                    and obj.__module__ == module_info.name:
                logger.info("Using runtime environment %s", obj.__name__)
                _runtime_class = obj
                return _runtime_class

    raise RuntimeError(
        "No RuntimeEnvironment implementation was found in the 'runtimes' package. "
        "A runtime implementation must be bundled at package time.")


def runtime_namespace():
    """Return the active runtime's application namespace.

    Falls back to the default namespace if no runtime is bundled, so early
    bootstrap paths (e.g. log directory setup) never fail.
    """
    try:
        return get_runtime_class().app_namespace()
    except RuntimeError:
        return DEFAULT_APP_NAMESPACE
