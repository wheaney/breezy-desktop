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

export const NESTED_MONITOR_PRODUCT = 'MetaMonitor';
export const VIRTUAL_MONITOR_PRODUCT = 'Virtual remote monitor';
export const SUPPORTED_MONITOR_PRODUCTS = [
    'VITURE',
    'nreal air',
    'Air',
    'Air 2',
    'Air 2 Pro',
    'Air 2 Ultra',
    'One',
    'One Pro',
    'XREAL One',
    'XREAL One Pro',
    'SmartGlasses', // TCL/RayNeo
    'Rokid Max',
    'Rokid Max 2',
    'Rokid Air',
    NESTED_MONITOR_PRODUCT
];

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
            Globals.logger.log('[ERROR] failed to load DisplayConfig interface XML');
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
    displayConfigProxy.GetCurrentStateRemote((result, error) => {
        if (error) {
            callback(null, `GetCurrentState failed: ${error}`);
        } else {
            Globals.logger.log_debug(`monitormanager.js getMonitorConfig GetCurrentState result: ${JSON.stringify(result)}`);
            
            const allMonitors = [];
            const [serial, monitors, logicalMonitors, properties] = result;
            for (let monitor of monitors) {
                const [details, modes, monProperties] = monitor;
                const [connector, vendor, product, monitorSerial] = details;
                const displayName = monProperties['display-name'].get_string()[0];

                for (let mode of modes) {
                    const [modeId, width, height, refreshRate, preferredScale, supportedScales, modeProperites] = mode;
                    const isCurrent = !!modeProperites['is-current'];
                    if (isCurrent) {
                        allMonitors.push([displayName, connector, vendor, product, serial, refreshRate]);
                    }
                }
            }
            callback(allMonitors, null);
        }
    });
}

// triggers callback with true result if an an async monitor config change was triggered, false if no config change needed
function performOptimalModeCheck(displayConfigProxy, connectorName, headsetAsPrimary, useHighestRefreshRate, 
                                 disablePhysicalDisplays, callback, allowConfigUpdateFn) {
    Globals.logger.log_debug(`monitormanager.js performOptimalModeCheck for ${connectorName}`);

    displayConfigProxy.GetCurrentStateRemote((result, error) => {
        if (!allowConfigUpdateFn()) {
            // other requests are in progress, this monitor state may be stale, do nothing
            Globals.logger.log_debug('MonitorManager performOptimalModeCheck: allowConfigUpdate is false');
            callback(false, null);
            return;
        }

        if (error) {
            callback(null, `GetCurrentState failed: ${error}`);
        } else {
            Globals.logger.log_debug(`monitormanager.js performOptimalModeCheck GetCurrentState result: ${JSON.stringify(result)}`);
            const [serial, monitors, logicalMonitors, properties] = result;

            // iterate over all monitors at least once, collecting the best fit mode for our monitor, and mode information
            // for each monitor
            let ourMonitor = undefined;
            let monitorToCurrentModeMap = {};
            let bestFitMode = undefined;
            const skipScaleUpdate = !!properties['global-scale-required'];
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
                    if (isCurrent) monitorToCurrentModeMap[connector] = mode;
                    
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
                            bestScale
                        };
                    }
                }
            }

            if (!!ourMonitor) {
                let anyMonitorsChanged = false;
                if (!!bestFitMode) {
                    // this will hold how much the width of the monitor has changed,
                    // and what range of y values is affected
                    let deltaX = 0;
                    let rangeY = [0, 0];

                    // sort logicalMonitors by x ascending, so we can tell if any are affected by a width change
                    logicalMonitors.sort((a, b) => a[0] - b[0]);

                    // map from original logical monitors schema to a(iiduba(ssa{sv})) for ApplyMonitorsConfig call
                    const removeMonitorIndexes = [];
                    const updatedLogicalMonitors = logicalMonitors.map((logicalMonitor, index) => {
                        const [x, y, scale, transform, primary, monitors, logMonProperties] = logicalMonitor;
                        const hasOurMonitor = !!monitors.some((monitor) => monitor[0] === connectorName);
                        const hasVirtualMonitor = monitors.some((monitor) => monitor[2] === VIRTUAL_MONITOR_PRODUCT);
                        const newScale = (!skipScaleUpdate && hasOurMonitor) ? bestFitMode.bestScale : scale;
                        anyMonitorsChanged |= newScale !== scale;

                        // there can only be one primary monitor, so we need to set all other monitors to not primary and glasses to primary, 
                        // if headsetAsPrimary is true
                        anyMonitorsChanged |= headsetAsPrimary && ((hasOurMonitor && !primary) || (!hasOurMonitor && primary));

                        if (disablePhysicalDisplays && !hasVirtualMonitor && !hasOurMonitor) {
                            removeMonitorIndexes.push(index);
                            anyMonitorsChanged = true;
                        }

                        // we need to figure out if the deltaX applies to this logical monitor,
                        // i.e. if it is within the same row as our monitor and to the right of it
                        let thisDeltaX = deltaX;
                        if (thisDeltaX !== 0) {
                            // find the monitor with the largest height
                            const maxMonitorHeight = monitors.reduce((maxHeight, monitor) => {
                                const monitorConnector = monitor[0];
                                const currentMode = monitorToCurrentModeMap[monitorConnector];
                                const currentHeight = currentMode[2];
                                return Math.max(maxHeight, currentHeight);
                            }, 0);

                            if (y >= rangeY[1] || y + maxMonitorHeight <= rangeY[0]) {
                                // monitors outside the y range are not affected by the width change
                                thisDeltaX = 0;
                            } else {
                                anyMonitorsChanged = true;
                            }
                        }

                        return [
                            x + thisDeltaX,
                            y,
                            newScale,
                            transform,
                            headsetAsPrimary ? hasOurMonitor : primary,
                            monitors.map((monitor) => {
                                const monitorConnector = monitor[0];
                                const isOurMonitor = monitorConnector === connectorName;
                                const [currentModeId, currentWidth, currentHeight] = monitorToCurrentModeMap[monitorConnector];
                                if (isOurMonitor) {
                                    deltaX = bestFitMode.width - currentWidth;
                                    rangeY = [y, y + currentHeight];
                                }
                                anyMonitorsChanged |= isOurMonitor && bestFitMode.modeId !== currentModeId;
                                return [
                                    monitorConnector,
                                    isOurMonitor ? bestFitMode.modeId : currentModeId,
                                    {} // properties
                                ];
                            })
                        ];
                    });

                    // if our monitor is already properly configured, we can skip the ApplyMonitorsConfig call
                    if (anyMonitorsChanged) {
                        if (removeMonitorIndexes.length > 0) {
                            let removedPrimary = false;

                            // remove monitors that are not virtual or our monitor
                            removeMonitorIndexes.reverse().forEach((index) => {
                                const [x, y, scale, transform, primary, monitors, logMonProperties] = updatedLogicalMonitors[index];
                                if (primary) removedPrimary = true;
                                updatedLogicalMonitors.splice(index, 1);
                            });

                            // collect sizes based on modes of attached monitors
                            const logicalMonitorsWithSizes = updatedLogicalMonitors.map((logicalMonitor) => {
                                const [x, y, scale, transform, primary, monitors, logMonProperties] = logicalMonitor;
                                const {width, height} = monitors.reduce(({width, height}, monitor) => {
                                    const monitorConnector = monitor[0];
                                    const currentMode = monitorToCurrentModeMap[monitorConnector];
                                    const currentWidth = currentMode[1];
                                    const currentHeight = currentMode[2];
                                    return {
                                        width: Math.max(width, currentWidth),
                                        height: Math.max(height, currentHeight)
                                    };
                                }, {width: 0, height: 0});

                                return {
                                    logicalMonitor,
                                    width,
                                    height,
                                    xEnd: x + width,
                                    yEnd: y + height
                                }
                            });
                            logicalMonitorsWithSizes.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

                            // this array will track monitors we've already corrected, but we'll toss it out since we're modifying the
                            // objects in the original array
                            const processedLogicalMonitors = [];

                            // make sure all monitors have a monitor adjacent
                            for (let i = 0; i < logicalMonitorsWithSizes.length; i++) {
                                const thisMonitor = logicalMonitorsWithSizes[i];
                                const [x, y, scale, transform, primary, monitors, logMonProperties] = thisMonitor.logicalMonitor;
                                const {xEnd, yEnd} = thisMonitor;

                                const hasOurMonitor = !!monitors.some((monitor) => monitor[0] === connectorName);
                                if (removedPrimary && hasOurMonitor) {
                                    // if we removed the primary monitor, we need to set the glasses monitor as the new primary
                                    thisMonitor.logicalMonitor[4] = true;
                                }

                                if (logicalMonitorsWithSizes.some((monitor, index) => {
                                    if (index === i) return false;

                                    const [monX, monY, monScale, monTransform, monPrimary, monMonitors, monLogMonProperties] = monitor.logicalMonitor;
                                    const monXEnd = monitor.xEnd;
                                    const monYEnd = monitor.yEnd;
                                    const xOverlap = x < monXEnd && xEnd > monX;
                                    const yOverlap = y < monYEnd && yEnd > monY;

                                    // use top or left sides to determine if it's already adjacent
                                    return (x === monXEnd && yOverlap) || (y === monYEnd && xOverlap);
                                })) {
                                    // this monitor is already adjacent to another monitor, leave it as-is
                                    processedLogicalMonitors.push(thisMonitor);
                                } else {
                                    let newX = undefined;
                                    let newY = undefined;

                                    // move the monitor left until it runs into one
                                    const procMonitorsByXEndDesc = [...processedLogicalMonitors].sort((a, b) => b.xEnd - a.xEnd);
                                    for (let j = 0; j < procMonitorsByXEndDesc.length; j++) {
                                        const procMonitor = procMonitorsByXEndDesc[j];
                                        const [procX, procY, procScale, procTransform, procPrimary, procMonitors, procLogMonProperties] = procMonitor.logicalMonitor;
                                        if (procMonitor.xEnd <= x && procY < yEnd && procMonitor.yEnd > y) {
                                            newX = procMonitor.xEnd;
                                            newY = y;
                                            break;
                                        }
                                    }

                                    if (newX === undefined) {
                                        newX = 0;

                                        // we didn't find an adjacent monitor to the left, now move it up until it runs into one
                                        const procMonitorsByYEndDesc = [...processedLogicalMonitors].sort((a, b) => b.yEnd - a.yEnd);
                                        for (let j = 0; j < procMonitorsByYEndDesc.length; j++) {
                                            const procMonitor = procMonitorsByYEndDesc[j];
                                            const [procX, procY, procScale, procTransform, procPrimary, procMonitors, procLogMonProperties] = procMonitor.logicalMonitor;
                                            if (procMonitor.yEnd <= y && procX < thisMonitor.width && procMonitor.xEnd > 0) {
                                                newY = procMonitor.yEnd;
                                                break;
                                            }
                                        }

                                        // if nothing found, put at origin
                                        if (newY === undefined) newY = 0;
                                    }
                                    thisMonitor.logicalMonitor[0] = newX;
                                    thisMonitor.logicalMonitor[1] = newY;
                                    thisMonitor.xEnd = newX + thisMonitor.width;
                                    thisMonitor.yEnd = newY + thisMonitor.height;
                                    processedLogicalMonitors.push(thisMonitor);
                                }
                            }
                        }

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
            false
        ),
        'disable-physical-displays': GObject.ParamSpec.boolean(
            'disable-physical-displays',
            'Disable physical displays',
            'Disable physical displays when a virtual display is connected',
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
        this._monitorProperties = null;
        this._changeHookFn = null;
        this._needsConfigCheck = this.use_optimal_monitor_config || this.headset_as_primary || this.disable_physical_displays;

        // help prevent certain actions from taking place multiple times in the event of rapid monitor updates
        this._asyncRequestsInFlight = 0;
        this._configCheckRequestsCount = 0;
        this._enabled = false;
    }

    enable() {
        Globals.logger.log_debug('MonitorManager enable');
        newDisplayConfig(this.extension_path, ((proxy, error) => {
            if (error) {
                return;
            }
            this._displayConfigProxy = proxy;
            this._on_monitors_change();
        }).bind(this));

        this._monitorsChangedConnection = Main.layoutManager.connect('monitors-changed', this._on_monitors_change.bind(this));
        this._disable_physical_displays_connection = this.connect('notify::disable-physical-displays', this._on_disable_physical_displays_change.bind(this));
        this._enabled = true;
    }

    disable() {
        Globals.logger.log_debug('MonitorManager disable');
        this.disconnect(this._disable_physical_displays_connection);
        Main.layoutManager.disconnect(this._monitorsChangedConnection);

        this._enabled = false;
        this._disable_physical_displays_connection = null;
        this._monitorsChangedConnection = null;
        this._displayConfigProxy = null;
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

    // returns true if an async check is needed, caller should wait for the next change hook call
    needsOptimalModeCheck(monitorConnector) {
        Globals.logger.log_debug(`MonitorManager needsOptimalModeCheck: ${monitorConnector}`);
        if (this._displayConfigProxy == null) {
            Globals.logger.log('MonitorManager needsOptimalModeCheck: _displayConfigProxy not set!');
            return false;
        }

        const isCheckingConfig = this._needsConfigCheck;
        if (this._needsConfigCheck && this._asyncRequestsInFlight === 0) {
            this._asyncRequestsInFlight++;

            const configCheckCountSnapshot = this._configCheckRequestsCount;
            const allowConfigUpdateFn = (() => {
                // allow updates to the config if this is the only in-flight request and no more requests
                // were made while we were waiting for the previous request to complete
                return this._asyncRequestsInFlight === 1 && this._configCheckRequestsCount === configCheckCountSnapshot;
            }).bind(this);

            performOptimalModeCheck(this._displayConfigProxy, monitorConnector, this.headset_as_primary, this.use_highest_refresh_rate, this.disable_physical_displays, ((configChanged, error) => {
                if (--this._asyncRequestsInFlight > 0) {
                    Globals.logger.log_debug(`MonitorManager needsOptimalModeCheck: ${this._asyncRequestsInFlight} async requests still pending, skipping change hook`);
                    return;
                } else if (this._configCheckRequestsCount !== configCheckCountSnapshot) {
                    Globals.logger.log_debug('MonitorManager needsOptimalModeCheck: config checks requested while in-flight, skipping change hook');
                    return;
                }

                this._needsConfigCheck = false;
                if (error) {
                    Globals.logger.log(`[ERROR] Failed to switch to optimal mode for monitor ${monitorConnector}: ${error}`);

                    // tell the extension to proceed, this should result in another config check
                    this._changeHookFn();
                } else {
                    if (configChanged) {
                        Globals.logger.log(`Switched to optimal mode for monitor ${monitorConnector}`);
                    } else if (!!this._changeHookFn) {
                        Globals.logger.log_debug('MonitorManager needsOptimalModeCheck: no config change');
                        
                        // no config change means this won't be triggered automatically, so trigger it manually
                        this._changeHookFn();
                    } else {
                        Globals.logger.log('MonitorManager needsOptimalModeCheck: can\'t trigger change hook, no hook set!');
                    }
                }
            }).bind(this), allowConfigUpdateFn);
        } else if (!this._needsConfigCheck) {
            Globals.logger.log_debug('MonitorManager needsOptimalModeCheck: skipping config check');
        } else {
            Globals.logger.log_debug(`MonitorManager needsOptimalModeCheck: skipping due to async requests ${this._asyncRequestsInFlight}`);
        }
        return isCheckingConfig;
    }

    _on_monitors_change() {
        if (!this._enabled) return;

        Globals.logger.log_debug('MonitorManager _on_monitors_change');
        if (this._displayConfigProxy == null) {
            return;
        }
        if (this.use_optimal_monitor_config || this.headset_as_primary || this.disable_physical_displays) {
            this._needsConfigCheck = true;
            this._configCheckRequestsCount++;
        }
        this._asyncRequestsInFlight++;
        getMonitorConfig(this._displayConfigProxy, ((result, error) => {
            this._asyncRequestsInFlight--;
            if (error) {
                Globals.logger.log(`[ERROR] Failed _on_monitors_change getMonitorConfig: ${error}`);
                return;
            }

            const monitorProperties = [];
            for (let i = 0; i < result.length; i++) {
                const [monitorName, connectorName, vendor, product, serial, refreshRate] = result[i];
                const monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(connectorName);
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
                if (this._asyncRequestsInFlight === 0) {
                    this._changeHookFn();
                } else {
                    Globals.logger.log_debug(`MonitorManager _on_monitors_change: ${this._asyncRequestsInFlight} requests still pending, skipping change hook`);
                }
            } else {
                Globals.logger.log('MonitorManager _on_monitors_change: can\'t trigger change hook, no hook set!');
            }
        }).bind(this));
    }

    _on_disable_physical_displays_change() {
        if (this._enabled && this.disable_physical_displays && !!this._changeHookFn) {
            Globals.logger.log_debug('MonitorManager _on_disable_physical_displays_change triggering change hook');
            this._needsConfigCheck = true;
            this._configCheckRequestsCount++;
            this._changeHookFn();
        }
    }
});