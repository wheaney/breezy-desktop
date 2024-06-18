import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';
import Globals from './globals.js';
import { Logger } from './logger.js';
import MonitorManager from './monitormanager.js';
import { isValidKeepAlive } from './time.js';
import { IPC_FILE_PATH, XREffect } from './xrEffect.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SUPPORTED_MONITOR_PRODUCTS = [
    'VITURE',
    'nreal air',
    'Air',
    'Air 2', // guessing this one
    'Air 2 Pro',
    'SmartGlasses', // TCL/RayNeo
    'MetaMonitor' // nested mode dummy monitor
];

export default class BreezyDesktopExtension extends Extension {
    constructor(metadata, uuid) {
        super(metadata, uuid);

        this.settings = this.getSettings();
        
        // Set/destroyed by enable/disable
        this._cursor_manager = null;
        this._monitor_manager = null;
        this._xr_effect = null;
        this._overlay = null;
        this._target_monitor = null;
        this._is_effect_running = false;
        this._distance_binding = null;
        this._distance_connection = null;
        this._follow_threshold_connection = null;
        this._widescreen_mode_settings_connection = null;
        this._widescreen_mode_effect_state_connection = null;
        this._supported_device_detected_connected = null;
        this._start_binding = null;
        this._end_binding = null;
        this._curved_display_binding = null;
        this._display_size_binding = null;

        if (!Globals.logger) {
            Globals.logger = new Logger({
                title: 'breezydesktop',
                debug: this.settings.get_boolean('debug')
            });
            Globals.logger.logVersion();
        }
    }

    enable() {
        Globals.logger.log_debug('BreezyDesktopExtension enable');

        try {
            Globals.extension_dir = this.path;
            this.settings.bind('debug', Globals.logger, 'debug', Gio.SettingsBindFlags.DEFAULT);

            this._monitor_manager = new MonitorManager(this.path);
            this._monitor_manager.setChangeHook(this._handle_monitor_change.bind(this));
            this._monitor_manager.enable();

            this._setup();
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension enable ${e.message}\n${e.stack}`);
        }
    }

    _poll_for_ready() {
        Globals.logger.log_debug('BreezyDesktopExtension _poll_for_ready');
        var target_monitor = this._target_monitor;
        var is_effect_running = this._is_effect_running;
        this._running_poller_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, (() => {
            if (is_effect_running) return GLib.SOURCE_REMOVE;

            const is_driver_running = this._check_driver_running();
            if (is_driver_running && target_monitor) {
                // don't enable the effect yet if an async optimal mode check is needed,
                // _setup will be triggered after a mode change so we can remove this timeout_add
                if (target_monitor.is_dummy || !this._monitor_manager.checkOptimalMode(target_monitor.connector)) {
                    Globals.logger.log('Driver is running, supported monitor connected. Enabling XR effect.');
                    this._effect_enable();
                }
                return GLib.SOURCE_REMOVE;
            } else {
                return GLib.SOURCE_CONTINUE;
            }
        }).bind(this));
    }

    _find_supported_monitor() {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension _find_supported_monitor');
            const target_monitor = this._monitor_manager.getMonitorPropertiesList()?.find(
                monitor => SUPPORTED_MONITOR_PRODUCTS.includes(monitor.product));
            if (target_monitor !== undefined) {
                return {
                    monitor: this._monitor_manager.getMonitors()[target_monitor.index],
                    connector: target_monitor.connector,
                    refreshRate: target_monitor.refreshRate
                };
            }

            if (this.settings.get_boolean('developer-mode')) {
                // allow testing XR devices with just USB, no video needed
                return {
                    monitor: this._monitor_manager.getMonitors()[0],
                    connector: 'dummy',
                    refreshRate: 60,
                    is_dummy: true
                };
            }

            return null;
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension _find_supported_monitor ${e.message}\n${e.stack}`);
            return null;
        }
    }

    _setup() {
        Globals.logger.log_debug('BreezyDesktopExtension _setup');
        if (this._is_effect_running) {
            Globals.logger.log('Reset triggered, disabling XR effect');
            this._effect_disable();
        }
        const target_monitor = this._find_supported_monitor();

        // if target_monitor isn't set, do nothing and wait for MonitorManager to call this again
        if (target_monitor && this._running_poller_id === undefined) {
            this._target_monitor = target_monitor.monitor;
            this._refresh_rate = target_monitor.refreshRate;

            if (this._check_driver_running()) {
                // don't enable the effect yet if an async optimal mode check is needed,
                // _setup will be triggered again after a mode change
                if (target_monitor.is_dummy || !this._monitor_manager.checkOptimalMode(target_monitor.connector)) {
                    Globals.logger.log('Ready, enabling XR effect');
                    this._effect_enable();
                }
            } else {
                this._poll_for_ready();
            }
        }
    }

    _check_driver_running() {
        try {
            if (!Globals.ipc_file) Globals.ipc_file = Gio.file_new_for_path(IPC_FILE_PATH);
            if (Globals.ipc_file.query_exists(null)) {
                const file_info = Globals.ipc_file.query_info(Gio.FILE_ATTRIBUTE_TIME_MODIFIED, Gio.FileQueryInfoFlags.NONE, null);
                const file_modified_time = file_info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_TIME_MODIFIED);

                // when the driver is running, the IMU file is updated at least 60x per second, do a strict check
                return isValidKeepAlive(file_modified_time, true);
            }
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension _check_driver_running ${e.message}\n${e.stack}`);
        }

        return false;
    }

    _effect_enable() {
        Globals.logger.log_debug('BreezyDesktopExtension _effect_enable');
        this._running_poller_id = undefined;
        if (!this._is_effect_running) {
            this._is_effect_running = true;

            try {
                this._cursor_manager = new CursorManager(Main.layoutManager.uiGroup, this._refresh_rate * 1.05);
                this._cursor_manager.enable();

                this._overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);'});
                this._overlay.opacity = 255;
                this._overlay.set_position(this._target_monitor.x, this._target_monitor.y);
                this._overlay.set_size(this._target_monitor.width, this._target_monitor.height);

                const overlayContent = new Clutter.Actor({clip_to_allocation: true});
                const uiClone = new Clutter.Clone({ source: Main.layoutManager.uiGroup, clip_to_allocation: true });
                uiClone.x = -this._target_monitor.x;
                uiClone.y = -this._target_monitor.y;
                if (Clutter.Container === undefined) {
                    overlayContent.add_child(uiClone);
                } else {
                    overlayContent.add_actor(uiClone);
                }

                this._overlay.set_child(overlayContent);

                global.stage.insert_child_above(this._overlay, null);
                Shell.util_set_hidden_from_pick(this._overlay, true);
                
                this._xr_effect = new XREffect({
                    target_monitor: this._target_monitor,
                    target_framerate: this._refresh_rate ?? 60,
                    display_distance: this.settings.get_double('display-distance'),
                    toggle_display_distance_start: this.settings.get_double('toggle-display-distance-start'),
                    toggle_display_distance_end: this.settings.get_double('toggle-display-distance-end'),
                });

                this._update_follow_threshold(this.settings);
                this._update_widescreen_mode_from_settings(this.settings);

                this._widescreen_mode_effect_state_connection = this._xr_effect.connect('notify::widescreen-mode-state', this._update_widescreen_mode_from_state.bind(this));
                this._supported_device_detected_connected = this._xr_effect.connect('notify::supported-device-detected', this._handle_supported_device_change.bind(this));

                this._distance_binding = this.settings.bind('display-distance', this._xr_effect, 'display-distance', Gio.SettingsBindFlags.DEFAULT)
                this._distance_connection = this.settings.connect('changed::display-distance', this._update_display_distance.bind(this))
                this._follow_threshold_connection = this.settings.connect('changed::follow-threshold', this._update_follow_threshold.bind(this))
                this._widescreen_mode_settings_connection = this.settings.connect('changed::widescreen-mode', this._update_widescreen_mode_from_settings.bind(this))
                this._start_binding = this.settings.bind('toggle-display-distance-start', this._xr_effect, 'toggle-display-distance-start', Gio.SettingsBindFlags.DEFAULT)
                this._end_binding = this.settings.bind('toggle-display-distance-end', this._xr_effect, 'toggle-display-distance-end', Gio.SettingsBindFlags.DEFAULT)
                this._curved_display_binding = this.settings.bind('curved-display', this._xr_effect, 'curved-display', Gio.SettingsBindFlags.DEFAULT)
                this._display_size_binding = this.settings.bind('widescreen-display-size', this._xr_effect, 'widescreen-display-size', Gio.SettingsBindFlags.DEFAULT);

                this._overlay.add_effect_with_name('xr-desktop', this._xr_effect);
                Meta.disable_unredirect_for_display(global.display);

                this._add_settings_keybinding('recenter-display-shortcut', this._recenter_display.bind(this));
                this._add_settings_keybinding('toggle-display-distance-shortcut', this._xr_effect._change_distance.bind(this._xr_effect));
                this._add_settings_keybinding('toggle-follow-shortcut', this._toggle_follow_mode.bind(this));
            } catch (e) {
                Globals.logger.log(`ERROR: BreezyDesktopExtension _effect_enable ${e.message}\n${e.stack}`);
                this._effect_disable();
            }
        }
    }

    _add_settings_keybinding(settings_key, bind_to_function) {
        try {
            Main.wm.addKeybinding(
                settings_key,
                this.settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                bind_to_function
            );
                    
            // Connect to the 'changed' signal for the keybinding property
            this.settings.connect(`changed::${settings_key}`, () => {
                try {
                    // Remove the old keybinding
                    Main.wm.removeKeybinding(settings_key);
                
                    // Add the updated keybinding
                    Main.wm.addKeybinding(
                        settings_key,
                        this.settings,
                        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                        Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                        bind_to_function
                    );
                } catch (e) {
                    Globals.logger.log(`ERROR: BreezyDesktopExtension _add_settings_keybinding settings binding lambda ${e.message}\n${e.stack}`);
                }
            });
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension _add_settings_keybinding ${e.message}\n${e.stack}`);
        }
    }

    _write_control(key, value) {
        const file = Gio.file_new_for_path('/dev/shm/xr_driver_control');
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        stream.write(`${key}=${value}`, null);
        stream.close(null);
    }

    _update_display_distance(settings, event) {
        const value = settings.get_double('display-distance');
        Globals.logger.log_debug(`BreezyDesktopExtension _update_display_distance ${value}`);
        if (value !== undefined) this._write_control('breezy_desktop_display_distance', value);
    }

    _update_follow_threshold(settings, event) {
        const value = settings.get_double('follow-threshold');
        Globals.logger.log_debug(`BreezyDesktopExtension _update_follow_threshold ${value}`);
        if (value !== undefined) this._write_control('breezy_desktop_follow_threshold', value);
    }

    _update_widescreen_mode_from_settings(settings, event) {
        const value = settings.get_boolean('widescreen-mode');
        Globals.logger.log_debug(`BreezyDesktopExtension _update_widescreen_mode_from_settings ${value}`);
        if (value !== undefined && value != this._xr_effect.widescreen_mode_state) 
            this._write_control('sbs_mode', value ? 'enable' : 'disable');
        else
            Globals.logger.log_debug('effect.widescreen_mode_state already matched setting');
    }

    _update_widescreen_mode_from_state(effect, _pspec) {
        const value = effect.widescreen_mode_state;
        Globals.logger.log_debug(`BreezyDesktopExtension _update_widescreen_mode_from_state ${value}`);
        if (value !== this.settings.get_boolean('widescreen-mode'))
            this.settings.set_boolean('widescreen-mode', value);
        else
            Globals.logger.log_debug('settings.widescreen-mode already matched state');
    }

    _handle_monitor_change() {
        Globals.logger.log('Monitor change detected');
        this._setup();
    }

    _handle_supported_device_change(effect, _pspec) {
        const value = effect.supported_device_detected;
        Globals.logger.log_debug(`BreezyDesktopExtension _handle_supported_device_change ${value}`);

        // this will disable the effect and begin polling for a ready state again
        if (!value && this._is_effect_running) {
            Globals.logger.log('Supported device disconnected');
            this._setup();
        }
    }

    _recenter_display() {
        Globals.logger.log_debug('BreezyDesktopExtension _recenter_display');
        this._write_control('recenter_screen', 'true');
    }

    _toggle_follow_mode() {
        Globals.logger.log_debug('BreezyDesktopExtension _toggle_follow_mode');
        this._write_control('toggle_breezy_desktop_smooth_follow', 'true');
    }

    _effect_disable() {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension _effect_disable');
            this._is_effect_running = false;

            if (this._running_poller_id) GLib.source_remove(this._running_poller_id);

            Main.wm.removeKeybinding('recenter-display-shortcut');
            Main.wm.removeKeybinding('toggle-display-distance-shortcut');
            Main.wm.removeKeybinding('toggle-follow-shortcut');
            Meta.enable_unredirect_for_display(global.display);

            if (this._overlay) {
                global.stage.remove_child(this._overlay);
                this._overlay.remove_effect_by_name('xr-desktop');
                this._overlay.destroy();
                this._overlay = null;
            }

            if (this._distance_binding) {
                this.settings.unbind(this._distance_binding);
                this._distance_binding = null;
            }
            if (this._distance_connection) {
                this.settings.disconnect(this._distance_connection);
                this._distance_connection = null;
            }
            if (this._follow_threshold_connection) {
                this.settings.disconnect(this._follow_threshold_connection);
                this._follow_threshold_connection = null;
            }
            if (this._widescreen_mode_settings_connection) {
                this.settings.disconnect(this._widescreen_mode_settings_connection);
                this._widescreen_mode_settings_connection = null;
            }
            if (this._start_binding) {
                this.settings.unbind(this._start_binding);
                this._start_binding = null;
            }
            if (this._end_binding) {
                this.settings.unbind(this._end_binding);
                this._end_binding = null;
            }
            if (this._curved_display_binding) {
                this.settings.unbind(this._curved_display_binding);
                this._curved_display_binding = null;
            }
            if (this._display_size_binding) {
                this.settings.unbind(this._display_size_binding);
                this._display_size_binding = null;
            }
            if (this._xr_effect) {
                if (this._widescreen_mode_effect_state_connection) {
                    this._xr_effect.disconnect(this._widescreen_mode_effect_state_connection);
                    this._widescreen_mode_effect_state_connection = null;
                }
                if (this._supported_device_detected_connected) {
                    this._xr_effect.disconnect(this._supported_device_detected_connected);
                    this._supported_device_detected_connected = null;
                }
                this._xr_effect.cleanup();
                this._xr_effect = null;
            }

            if (this._cursor_manager) {
                this._cursor_manager.disable();
                this._cursor_manager = null;
            }
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension _effect_disable ${e.message}\n${e.stack}`);
        }
    }

    disable() {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension disable');
            this._effect_disable();
            this._target_monitor = null;
            if (this._monitor_manager) {
                this._monitor_manager.disable();
                this._monitor_manager = null;
            }
        } catch (e) {
            Globals.logger.log(`ERROR: BreezyDesktopExtension disable ${e.message}\n${e.stack}`);
        }
    }
}

function init() {
    return new Extension();
}
