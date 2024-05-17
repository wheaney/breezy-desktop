// soft-brightness-plus - Control the display's brightness via an alpha channel.
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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import System from 'system';

const LOG_DIR_NAME = 'breezy_gnome/logs/gjs';

export const Logger = GObject.registerClass({
    GTypeName: 'Logger',
    Properties: {
        'title': GObject.ParamSpec.string(
            'title', 
            'Title', 
            'Title to use when logging', 
            GObject.ParamFlags.READWRITE,
            null
        ),
        'debug': GObject.ParamSpec.boolean(
            'debug',
            'Log debug messages',
            'Log debug messages',
            GObject.ParamFlags.READWRITE, 
            false
        )
    }
}, class Logger extends GObject.Object {
    constructor(params = {}) {
        super(params);

        this._log_file_dir = `${GLib.get_user_data_dir()}/${LOG_DIR_NAME}/`
        this._first_log = true;
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
            let msg = '';
            const gnomeShellVersion = Config.PACKAGE_VERSION;
            if (gnomeShellVersion != undefined) {
                msg += 'Gnome-Shell ' + gnomeShellVersion;
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

        const now = GLib.DateTime.new_now_local();
        const logFileName = `${now.format('%Y-%m-%d')}.log`;
        const file = Gio.File.new_for_path(`${this._log_file_dir}/${logFileName}`);

        if (!file.query_exists(null)) {
            const parentDir = file.get_parent();
            if (!parentDir.query_exists(null)) {
                parentDir.make_directory_with_parents(null);
            }
        }
        const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
        stream.write(`${this.title}: ${text}\n`, null);
        stream.close(null);
    }

    log_debug(text) {
        if (this.debug) {
            this.log(`\tDEBUG - ${text}`);
        }
    }
});