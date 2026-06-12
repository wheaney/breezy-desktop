import json
import logging
import os
import sys
import threading
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger('breezy_ui')

GITHUB_RELEASES_URL = 'https://api.github.com/repos/wheaney/breezy-desktop/releases/latest'


def _is_user_local_install():
    """Return True if the app is running from a user-local installation.

    Scripted installs put the binary under the user's home directory (e.g.
    ~/.local/bin/breezydesktop).  System-wide package manager installs (e.g.
    AUR) put the binary in a system path like /usr/bin and don't need a
    version-update prompt because the package manager handles updates.
    """
    home = os.path.expanduser('~')
    script_path = os.path.realpath(sys.argv[0])
    return script_path.startswith(home + os.sep)


def _parse_version(version_str):
    """Parse a version string like '2.8.10' or 'v2.8.9' into a tuple of ints."""
    v = version_str.strip().lstrip('v')
    try:
        return tuple(int(x) for x in v.split('.'))
    except (ValueError, AttributeError):
        return None


def check_for_update(current_version, callback):
    """
    Asynchronously check for a newer version on GitHub.

    Calls callback(latest_version_str) on the calling thread's GLib main loop
    if a newer version is found, or callback(None) if no update is available
    or if the check fails.  Does nothing (no callback) when not running from a
    user-local installation (e.g. installed via AUR).
    """
    if not _is_user_local_install():
        return

    def _check():
        latest_version = None
        try:
            req = Request(GITHUB_RELEASES_URL, headers={'User-Agent': 'breezy-desktop-ui'})
            with urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            latest_tag = data.get('tag_name', '')
            latest = _parse_version(latest_tag)
            current = _parse_version(current_version)
            if latest and current and latest > current:
                latest_version = latest_tag.lstrip('v')
        except (URLError, json.JSONDecodeError, ValueError, OSError) as e:
            logger.debug('Update check failed: %s', e)
        callback(latest_version)

    threading.Thread(target=_check, daemon=True).start()
