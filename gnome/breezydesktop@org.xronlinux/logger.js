// Taken from https://github.com/jkitching/soft-brightness-plus
// 
// Copyright (C) 2023 Joel Kitching (jkitching on Github)
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import GLib from 'gi://GLib';
import System from 'system';

export class Logger {
    constructor(title, metadata, packageVersion) {
        this._title = title;
        this._metadata = metadata;
        this._packageVersion = packageVersion;

        this._first_log = true;
        this._debug = false;
    }

    get_version() {
        return this._metadata['version'] + ' / git ' + this._metadata['vcs_revision'];
    }

    logVersion() {
        const gnomeShellVersion = Config.PACKAGE_VERSION;
        if (gnomeShellVersion != undefined) {
            const splitVersion = gnomeShellVersion.split('.').map((x) => {
                x = Number(x);
                if (Number.isNaN(x)) {
                    return 0;
                } else {
                    return x;
                }
            });
            const major = splitVersion[0];
            const minor = splitVersion.length >= 2 ? splitVersion[1] : 0;
            const patch = splitVersion.length >= 3 ? splitVersion[2] : 0;
            const xdgSessionType = GLib.getenv('XDG_SESSION_TYPE');
            const onWayland = xdgSessionType == 'wayland';
            this.log_debug('_logVersion(): gnome-shell version major=' + major + ', minor=' + minor + ', patch=' + patch + ', system_version=' + System.version + ', XDG_SESSION_TYPE=' + xdgSessionType);
            this.log_debug('_logVersion(): onWayland=' + onWayland);
        }
    }

    log(text) {
        if (this._first_log) {
            this._first_log = false;
            let msg = 'version ' + this.get_version();
            const gnomeShellVersion = this._packageVersion;
            if (gnomeShellVersion != undefined) {
                msg += ' on Gnome-Shell ' + gnomeShellVersion;
            }
            const gjsVersion = System.version;
            if (gjsVersion != undefined) {
                const gjsVersionMajor = Math.floor(gjsVersion / 10000);
                const gjsVersionMinor = Math.floor((gjsVersion % 10000) / 100);
                const gjsVersionPatch = gjsVersion % 100;
                msg += (' / gjs ' + gjsVersionMajor +
                    '.' + gjsVersionMinor +
                    '.' + gjsVersionPatch +
                    ' (' + gjsVersion + ')'
                );
            }
            const sessionType = GLib.getenv('XDG_SESSION_TYPE');
            if (sessionType != undefined) {
                msg += ' / ' + sessionType;
            }
            this.log(msg);
        }
        console.log('' + this._title + ': ' + text);
    }

    log_debug(text) {
        if (this._debug) {
            this.log(text);
        }
    }

    set_debug(debug) {
        this._debug = debug;
    }

    get_debug() {
        return this._debug;
    }
};