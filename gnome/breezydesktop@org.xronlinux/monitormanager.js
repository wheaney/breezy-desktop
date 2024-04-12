// Taken from https://github.com/jkitching/soft-brightness-plus
// 
// Copyright (C) 2019, 2021 Philippe Troin (F-i-f on Github)
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

import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let cachedDisplayConfigProxy = null;

function getDisplayConfigProxy(extPath) {
    if (cachedDisplayConfigProxy == null) {
        let xml = null;
        const file = Gio.File.new_for_path(extPath + '/dbus-interfaces/org.gnome.Mutter.DisplayConfig.xml');
        try {
            const [ok, bytes] = file.load_contents(null);
            if (ok) {
                xml = new TextDecoder().decode(bytes);
            }
        } catch (e) {
            console.error('failed to load DisplayConfig interface XML');
            throw e;
        }
        cachedDisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(xml);
    }
    return cachedDisplayConfigProxy;
}

export function newDisplayConfig(extPath, callback) {
    const DisplayConfigProxy = getDisplayConfigProxy(extPath);
    new DisplayConfigProxy(
        Gio.DBus.session,
        'org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig',
        callback
    );
}

export function getMonitorConfig(displayConfigProxy, callback) {
    displayConfigProxy.GetResourcesRemote((result) => {
        if (result.length <= 2) {
            callback(null, 'Cannot get DisplayConfig: No outputs in GetResources()');
        } else {
            const monitors = [];
            for (let i = 0; i < result[2].length; i++) {
                const output = result[2][i];
                if (output.length <= 7) {
                    callback(null, 'Cannot get DisplayConfig: No properties on output #' + i);
                    return;
                }
                const props = output[7];
                const displayName = props['display-name'].get_string()[0];
                const connectorName = output[4];
                if (!displayName || displayName == '') {
                    const displayName = 'Monitor on output ' + connectorName;
                }
                const vendor = props['vendor'].get_string()[0];
                const product = props['product'].get_string()[0];
                const serial = props['serial'].get_string()[0];
                monitors.push([displayName, connectorName, vendor, product, serial]);
            }
            callback(monitors, null);
        }
    });
}

// Monitor change handling
export default class MonitorManager {
    constructor(extPath) {
        this._extPath = extPath;

        this._monitorsChangedConnection = null;
        this._displayConfigProxy = null;
        this._backendManager = null;
        this._monitorProperties = null;
        this._changeHookFn = null;
    }

    enable() {
        this._backendManager = global.backend.get_monitor_manager();
        newDisplayConfig(this._extPath, (proxy, error) => {
            if (error) {
                return;
            }
            this._displayConfigProxy = proxy;
            this._on_monitors_change();
        });

        this._monitorsChangedConnection = Main.layoutManager.connect('monitors-changed', this._on_monitors_change.bind(this));
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorsChangedConnection);

        this._monitorsChangedConnection = null;
        this._displayConfigProxy = null;
        this._backendManager = null;
        this._monitorProperties = null;
        this._changeHookFn = null;
    }

    setChangeHook(fn) {
        this._changeHookFn = fn;
    }

    setPostCallback(callback) {
        this._postCallback = callback;
    }

    getMonitors() {
        return Main.layoutManager.monitors;
    }

    getMonitorPropertiesList() {
        return this._monitorProperties;
    }

    _on_monitors_change() {
        if (this._displayConfigProxy == null) {
            return;
        }
        getMonitorConfig(this._displayConfigProxy, (result, error) => {
            if (error) {
                return;
            }
            const monitorProperties = [];
            for (let i = 0; i < result.length; i++) {
                const [monitorName, connectorName, vendor, product, serial] = result[i];
                const monitorIndex = this._backendManager.get_monitor_for_connector(connectorName);
                console.log(`\n\nFound monitor ${monitorName}, vendor ${vendor}, product ${product}, serial ${serial}, connector ${connectorName}, index ${monitorIndex}\n\n`);
                if (monitorIndex >= 0) {
                    monitorProperties[monitorIndex] = {
                        index: monitorIndex,
                        name: monitorName,
                        vendor: vendor,
                        product: product,
                        serial: serial,
                        connector: connectorName
                    };
                }
            }
            this._monitorProperties = monitorProperties;
            if (this._changeHookFn !== null) {
                this._changeHookFn();
            }
        });
    }
}