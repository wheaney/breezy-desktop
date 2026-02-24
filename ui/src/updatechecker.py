# updatechecker.py
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

import json
import logging
import threading
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger('breezy_ui')

GITHUB_RELEASES_URL = 'https://api.github.com/repos/wheaney/breezy-desktop/releases/latest'


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
    or if the check fails.
    """
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
