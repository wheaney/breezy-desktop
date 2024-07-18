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
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Globals from './globals.js';

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
            Globals.logger.log('ERROR: failed to load DisplayConfig interface XML');
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

function getMonitorConfig(displayConfigProxy, callback) {
    displayConfigProxy.GetResourcesRemote((result, error) => {
        if (error) {
            callback(null, `GetResourcesRemote failed: ${error}`);
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

                // grab refresh rate from the modes array
                const refreshRate = result[3][i][4];

                monitors.push([displayName, connectorName, vendor, product, serial, refreshRate]);
            }
            callback(monitors, null);
        }
    });
}

// triggers callback with true result if an an async monitor config change was triggered, false if no config change needed
function performOptimalModeCheck(displayConfigProxy, connectorName, headsetAsPrimary, useHighestRefreshRate, callback) {
    Globals.logger.log_debug(`monitormanager.js performOptimalModeCheck for ${connectorName}`);
    displayConfigProxy.GetCurrentStateRemote((result, error) => {
        if (error) {
            callback(null, `GetCurrentState failed: ${error}`);
        } else {
            Globals.logger.log_debug(`monitormanager.js performOptimalModeCheck GetCurrentState result: ${JSON.stringify(result)}`);
            const [serial, monitors, logicalMonitors, properties] = result;

            // iterate over all monitors at least once, collecting the best fit mode for our monitor, and mode information
            // for each monitor
            let ourMonitor = undefined;
            let monitorToModeIdMap = {};
            let bestFitMode = undefined;
            for (let monitor of monitors) {
                const [details, availableModes, monProperties] = monitor;
                const [connector, vendor, product, monitorSerial] = details;
                const isOurMonitor = connector == connectorName;
                let modes = availableModes;
                if (isOurMonitor) {
                    ourMonitor = monitor;
                    if (!useHighestRefreshRate) {
                        const currentMode = modes.find((mode) => !!mode[6]['is-current']);
                        
                        // filter modes to only include the current refresh rate
                        modes = availableModes.filter((mode) => mode[3] === currentMode[3]);
                    }
                }

                for (let mode of modes) {
                    const [modeId, width, height, refreshRate, preferredScale, supportedScales, modeProperites] = mode;
                    const isCurrent = !!modeProperites['is-current'];
                    if (isCurrent) monitorToModeIdMap[connector] = modeId;
                    
                    if (isOurMonitor && (!bestFitMode || (
                            width >= bestFitMode.width && 
                            height >= bestFitMode.height && 
                            refreshRate >= bestFitMode.refreshRate))) {
                        // find the scale that is closest to 1.0
                        const bestScale = supportedScales.reduce((prev, curr) => {
                            return Math.abs(curr - 1.0) < Math.abs(prev - 1.0) ? curr : prev;
                        });

                        bestFitMode = {
                            modeId,
                            width,
                            height,
                            refreshRate,
                            bestScale,
                            isCurrent 
                        };
                    }
                }
            }

            if (!!ourMonitor) {
                let anyMonitorsChanged = false;
                if (!!bestFitMode) {
                    // map from original logical monitors schema to a(iiduba(ssa{sv})) for ApplyMonitorsConfig call
                    const updatedLogicalMonitors = logicalMonitors.map((logicalMonitor) => {
                        const [x, y, scale, transform, primary, monitors, logMonProperties] = logicalMonitor;
                        const hasOurMonitor = !!monitors.some((monitor) => monitor[0] === connectorName);
                        anyMonitorsChanged |= hasOurMonitor && bestFitMode.bestScale !== scale;

                        // there can only be one primary monitor, so we need to set all other monitors to not primary and glasses to primary, 
                        // if headsetAsPrimary is true
                        anyMonitorsChanged |= headsetAsPrimary && ((hasOurMonitor && !primary) || (!hasOurMonitor && primary));
                        return [
                            x,
                            y,
                            hasOurMonitor ? bestFitMode.bestScale : scale,
                            transform,
                            headsetAsPrimary ? hasOurMonitor : primary,
                            monitors.map((monitor) => {
                                const monitorConnector = monitor[0];
                                const isOurMonitor = monitorConnector === connectorName;
                                anyMonitorsChanged |= isOurMonitor && !bestFitMode.isCurrent;
                                return [
                                    monitorConnector,
                                    isOurMonitor ? bestFitMode.modeId : monitorToModeIdMap[monitorConnector],
                                    {} // properties
                                ];
                            })
                        ];
                    });

                    // if our monitor is already properly configured, we can skip the ApplyMonitorsConfig call
                    if (anyMonitorsChanged) {
                        Globals.logger.log_debug(`monitormanager.js performOptimalModeCheck updatedLogicalMonitors: ${JSON.stringify(updatedLogicalMonitors)}`);
                        displayConfigProxy.ApplyMonitorsConfigRemote(
                            serial,
                            1, // "temporary" config -- "permanent" might be pointless since we always do this check
                            updatedLogicalMonitors,
                            {}, // properties
                            (_result, error) => {
                                if (error) {
                                    callback(null, `ApplyMonitorsConfig failed: ${error}`);
                                } else {
                                    callback(true, null);
                                }
                            }
                        );
                    }
                }
                if (!anyMonitorsChanged) callback(false, null);
            } else {
                callback(null, `Monitor ${connectorName} not found in GetCurrentState result`);
            }
        }
    });
}

// Monitor change handling
export const MonitorManager = GObject.registerClass({
    Properties: {
        'use-optimal-monitor-config': GObject.ParamSpec.boolean(
            'use-optimal-monitor-config',
            'Use optimal monitor configuration',
            'Automatically set the optimal monitor configuration upon connection',
            GObject.ParamFlags.READWRITE,
            true
        ),
        'use-highest-refresh-rate': GObject.ParamSpec.boolean(
            'use-highest-refresh-rate',
            'Use highest refresh rate',
            'Set the highest refresh rate which choosing optimal configs',
            GObject.ParamFlags.READWRITE,
            true
        ),
        'headset-as-primary': GObject.ParamSpec.boolean(
            'headset-as-primary',
            'Use headset as primary monitor',
            'Automatically set the headset as the primary display upon connection',
            GObject.ParamFlags.READWRITE,
            true
        ),
        'extension-path': GObject.ParamSpec.string(
            'extension-path',
            'Extension path',
            'Path to the extension directory',
            GObject.ParamFlags.READWRITE,
            ''
        )
    }
}, class MonitorManager extends GObject.Object {
    constructor(params = {}) {
        super(params);

        this._monitorsChangedConnection = null;
        this._displayConfigProxy = null;
        this._backendManager = null;
        this._monitorProperties = null;
        this._changeHookFn = null;
        this._needsConfigCheck = this.use_optimal_monitor_config;
    }

    enable() {
        Globals.logger.log_debug('MonitorManager enable');
        this._backendManager = global.backend.get_monitor_manager();
        newDisplayConfig(this.extension_path, ((proxy, error) => {
            if (error) {
                return;
            }
            this._displayConfigProxy = proxy;
            this._on_monitors_change();
        }).bind(this));

        this._monitorsChangedConnection = Main.layoutManager.connect('monitors-changed', this._on_monitors_change.bind(this));
    }

    disable() {
        Globals.logger.log_debug('MonitorManager disable');
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

    getMonitors() {
        return Main.layoutManager.monitors;
    }

    getMonitorPropertiesList() {
        return this._monitorProperties;
    }

    // returns true if a check is needed, caller should wait for the next change hook call
    needsOptimalModeCheck(monitorConnector) {
        Globals.logger.log_debug(`MonitorManager checkOptimalMode: ${monitorConnector}`);
        if (this._displayConfigProxy == null) {
            Globals.logger.log('MonitorManager checkOptimalMode: _displayConfigProxy not set!');
            return false;
        }

        if (this._needsConfigCheck) {
            performOptimalModeCheck(this._displayConfigProxy, monitorConnector, this.headset_as_primary, this.use_highest_refresh_rate, ((configChanged, error) => {
                this._needsConfigCheck = false;
                if (error) {
                    Globals.logger.log(`Failed to switch to optimal mode for monitor ${monitorConnector}: ${error}`);
                } else {
                    if (configChanged) {
                        Globals.logger.log(`Switched to optimal mode for monitor ${monitorConnector}`);
                    } else if (!!this._changeHookFn) {
                        Globals.logger.log_debug('MonitorManager checkOptimalMode: no config change');
                        
                        // no config change means this won't be triggered automatically, so trigger it manually
                        this._changeHookFn();
                    } else {
                        Globals.logger.log('MonitorManager checkOptimalMode: can\'t trigger change hook, no hook set!');
                    }
                }
            }).bind(this));
        } else {
            Globals.logger.log_debug('MonitorManager checkOptimalMode: skipping config check');
        }
        return this._needsConfigCheck;
    }

    _on_monitors_change() {
        Globals.logger.log_debug('MonitorManager _on_monitors_change');
        if (this._displayConfigProxy == null) {
            return;
        }
        this._needsConfigCheck = this.use_optimal_monitor_config;
        getMonitorConfig(this._displayConfigProxy, ((result, error) => {
            if (error) {
                return;
            }
            const monitorProperties = [];
            for (let i = 0; i < result.length; i++) {
                const [monitorName, connectorName, vendor, product, serial, refreshRate] = result[i];
                const monitorIndex = this._backendManager.get_monitor_for_connector(connectorName);
                Globals.logger.log_debug(`Found monitor ${monitorName}, vendor ${vendor}, product ${product}, serial ${serial}, connector ${connectorName}, index ${monitorIndex}`);
                if (monitorIndex >= 0) {
                    monitorProperties[monitorIndex] = {
                        index: monitorIndex,
                        name: monitorName,
                        vendor: vendor,
                        product: product,
                        serial: serial,
                        connector: connectorName,
                        refreshRate: refreshRate
                    };
                }
            }
            this._monitorProperties = monitorProperties;
            if (!!this._changeHookFn) {
                this._changeHookFn();
            } else {
                Globals.logger.log('MonitorManager _on_monitors_change: can\'t trigger change hook, no hook set!');
            }
        }).bind(this));
    }
});