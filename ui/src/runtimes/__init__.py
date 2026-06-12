"""Bundled runtime environment implementations.

Exactly one concrete RuntimeEnvironment implementation module is copied into
this package at package time (see ui/bin/package). The implementation is
selected per-build from a runtime source directory (e.g. gnome/ui), so behavior
can be swapped without touching the core UI.
"""
