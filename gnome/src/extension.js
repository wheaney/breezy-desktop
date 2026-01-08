import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';
import { DeviceDataStream } from './devicedatastream.js';
import Globals from './globals.js';
import { Logger } from './logger.js';
import { MonitorManager, NESTED_MONITOR_PRODUCT, SUPPORTED_MONITOR_PRODUCTS, VIRTUAL_MONITOR_PRODUCT } from './monitormanager.js';
import { VirtualDisplaysActor } from './virtualdisplaysactor.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BIN_HOME = GLib.getenv('XDG_BIN_HOME') || GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin']);
const XDG_CLI_PATH = GLib.build_filenamev([BIN_HOME, 'xr_driver_cli']);
const ALT_CLI_PATH = '/usr/bin/xr_driver_cli';

export default class BreezyDesktopExtension extends Extension {
    constructor(metadata, uuid) {
        super(metadata, uuid);

        this.settings = this.getSettings();
        
        // Set/destroyed by enable/disable
        this._cursor_manager = null;
        this._monitor_manager = null;
        this._virtual_displays_actor = null;
        this._virtual_displays_overlay = null;
        this._target_monitor = null;
        this._is_effect_running = false;
        this._effect_settings_bindings = [];
        this._data_stream_bindings = [];
        this._show_banner_connection = null;
        this._distance_connection = null;
        this._display_size_connection = null;
        this._focused_monitor_distance_connection = null;
        this._follow_threshold_connection = null;
        this._breezy_desktop_running_connection = null;

        // "fresh" means the effect hasn't been enabled since breezy-desktop-running became true
        this._fresh_session = true;

        if (!Globals.logger) {
            Globals.logger = new Logger({
                title: 'breezydesktop',
                debug: this.settings.get_boolean('debug')
            });
            Globals.logger.logVersion();
        }

        if (!Globals.data_stream) {
            Globals.data_stream = new DeviceDataStream({
                debug_no_device: this.settings.get_boolean('debug-no-device')
            });
        }
    }

    enable() {
        Globals.logger.log_debug('BreezyDesktopExtension enable');

        try {
            Globals.extension_dir = this.path;

            Globals.data_stream.start();

            this._monitor_manager = new MonitorManager({
                use_optimal_monitor_config: this.settings.get_boolean('use-optimal-monitor-config'),
                headset_as_primary: this.settings.get_boolean('headset-as-primary'),
                use_highest_refresh_rate: this.settings.get_boolean('use-highest-refresh-rate'),
                disable_physical_displays: this.settings.get_boolean('disable-physical-displays'),
                extension_path: this.path
            });
            this._monitor_manager.setChangeHook(this._handle_monitor_change.bind(this));
            this._monitor_manager.enable();

            this.settings.bind('debug', Globals.logger, 'debug', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-optimal-monitor-config',this._monitor_manager, 'use-optimal-monitor-config', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('headset-as-primary', this._monitor_manager, 'headset-as-primary', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('disable-physical-displays', this._monitor_manager, 'disable-physical-displays', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('legacy-follow-mode', Globals.data_stream, 'legacy-follow-mode', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('debug-no-device', Globals.data_stream, 'debug-no-device', Gio.SettingsBindFlags.DEFAULT);

            this._breezy_desktop_running_connection = Globals.data_stream.connect('notify::breezy-desktop-running', 
                this._handle_breezy_desktop_running_change.bind(this));

            this._cli_file = Gio.file_new_for_path(XDG_CLI_PATH);
            if (!this._cli_file.query_exists(null)) {
                this._cli_file = Gio.file_new_for_path(ALT_CLI_PATH);
                if (!this._cli_file.query_exists(null)) {
                    this._cli_file = null;
                    Globals.logger.log('[ERROR] BreezyDesktopExtension enable - xr_driver_cli not found');
                }
            }

            this._add_settings_keybinding('toggle-xr-effect-shortcut', this._toggle_xr_effect.bind(this));

            this._setup();
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension enable ${e.message}\n${e.stack}`);
        }
    }

    _find_virtual_monitors() {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension _find_virtual_monitors');
            const virtual_monitors = this._monitor_manager.getMonitorPropertiesList()?.filter(
                monitor => monitor && monitor.product === VIRTUAL_MONITOR_PRODUCT);
            if (virtual_monitors.length > 0) {
                Globals.logger.log(`Found ${virtual_monitors.length} virtual monitors`);
                return virtual_monitors.map(monitor => {
                    return this._monitor_manager.getMonitors()[monitor.index];
                });
            }

            Globals.logger.log_debug('BreezyDesktopExtension _find_virtual_monitors - No virtual monitors found');
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _find_virtual_monitors ${e.message}\n${e.stack}`)
        }

        return [];
    }

    _find_supported_monitor() {
        if (!this._monitor_manager.getMonitorPropertiesList()) return null;

        try {
            Globals.logger.log_debug('BreezyDesktopExtension _find_supported_monitor');
            let target_monitor = this._monitor_manager.getMonitorPropertiesList()?.find(
                monitor => monitor && (SUPPORTED_MONITOR_PRODUCTS.includes(monitor.product) || 
                           this.settings.get_string('custom-monitor-product') === monitor.product));
            let is_dummy = target_monitor?.product === NESTED_MONITOR_PRODUCT;

            if (target_monitor === undefined && this.settings.get_boolean('developer-mode')) {
                Globals.logger.log_debug('BreezyDesktopExtension _find_supported_monitor - Using dummy monitor');
                // find the first of the physical monitors
                target_monitor = this._monitor_manager.getMonitorPropertiesList()?.find(
                    monitor => monitor && monitor.product !== VIRTUAL_MONITOR_PRODUCT) ||
                    this._monitor_manager.getMonitorPropertiesList()?.[0];
                is_dummy = true;
            }

            if (target_monitor !== undefined) {
                Globals.logger.log(`Identified supported monitor: ${target_monitor.product} on ${target_monitor.connector}`);
                return {
                    monitor: this._monitor_manager.getMonitors()[target_monitor.index],
                    connector: target_monitor.connector,
                    refreshRate: target_monitor.refreshRate,
                    is_dummy: is_dummy,
                    is_virtual: target_monitor.product === VIRTUAL_MONITOR_PRODUCT
                };
            }

            Globals.logger.log_debug('BreezyDesktopExtension _find_supported_monitor - No supported monitor found');
            return null;
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _find_supported_monitor ${e.message}\n${e.stack}`);
            return null;
        }
    }

    // Assumes target_monitor is set, and was returned by _find_supported_monitor.
    // A false result means we'll expect _handle_monitor_change to be triggered
    _target_monitor_ready(target_monitor) {
        if (target_monitor.is_dummy) return true;

        const needs_sbs_mode_switch = this.settings.get_boolean('fast-sbs-mode-switching') && 
                                      this._needs_widescreen_monitor_update();
        return !needs_sbs_mode_switch && !this._monitor_manager.needsOptimalModeCheck(target_monitor.connector);
    }

    // for_disable should be true if we're using this function to disable the
    // effect without anticipating an immediate re-enable
    _setup(for_disable = false) {
        Globals.logger.log_debug('BreezyDesktopExtension _setup');
        if (this._is_effect_running) {
            Globals.logger.log('Reset triggered, disabling XR effect');
            this._effect_disable(!for_disable);
        }

        this._target_monitor = this._find_supported_monitor();
        if (this._target_monitor) {
            if (Globals.data_stream.breezy_desktop_running) {
                // Don't enable the effect yet if monitor updates are needed.
                // _setup will be triggered again since a !ready result means it will trigger monitor changes
                if (this._target_monitor_ready(this._target_monitor)) {
                    Globals.logger.log('Ready, enabling XR effect');
                    this._effect_enable();
                } else {
                    Globals.logger.log_debug('BreezyDesktopExtension _setup - breezy desktop enabled, but async monitor action needed');
                }
            } else {
                Globals.logger.log_debug('BreezyDesktopExtension _setup - Doing nothing, target monitor found, but device stream not being received');
            }
        } else {
            Globals.logger.log_debug(`BreezyDesktopExtension _setup - Doing nothing, no supported monitor found, breezy_desktop_running: ${Globals.data_stream.breezy_desktop_running}`);
        }
    }

    _needs_widescreen_monitor_update() {
        Globals.logger.log_debug('BreezyDesktopExtension _needs_widescreen_monitor_update');
        const state = this._read_state();
        const sbs_enabled = state['sbs_mode_enabled'] === 'true';
        const widescreen_setting_enabled = this.settings.get_boolean('widescreen-mode');
        if (widescreen_setting_enabled !== sbs_enabled) {
            Globals.logger.log_debug('BreezyDesktopExtension _needs_widescreen_monitor_update - true');
            this._request_sbs_mode_change(widescreen_setting_enabled);
            return true;
        }

        return false;
    }

    _effect_enable() {
        Globals.logger.log_debug('BreezyDesktopExtension _effect_enable');
        if (!this._is_effect_running) {
            this._is_effect_running = true;

            try {
                const targetMonitor = this._target_monitor.monitor;
                const virtualMonitors = this._find_virtual_monitors();
                const refreshRate = targetMonitor.refreshRate ?? 60;

                // use rgba(255, 4, 144, 1) for chroma key background
                this._virtual_displays_overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);', clip_to_allocation: true });
                this._virtual_displays_overlay.opacity = 255;
                this._virtual_displays_overlay.set_position(targetMonitor.x, targetMonitor.y);
                this._virtual_displays_overlay.set_size(targetMonitor.width, targetMonitor.height);

                const state = this._read_state();
                const pose_has_position = state['connected_device_pose_has_position'] === 'true';

                Globals.logger.log_debug(
                    `connected_device_pose_has_position=${pose_has_position}`
                );

                Globals.data_stream.refresh_data();
                this._virtual_displays_actor = new VirtualDisplaysActor({
                    width: targetMonitor.width,
                    height: targetMonitor.height,
                    target_monitor: targetMonitor,
                    virtual_monitors: virtualMonitors,
                    monitor_wrapping_scheme: this.settings.get_string('monitor-wrapping-scheme'),
                    monitor_spacing: this.settings.get_int('monitor-spacing'),
                    curved_display: this.settings.get_boolean('curved-display'),
                    headset_display_as_viewport_center: this.settings.get_boolean('headset-display-as-viewport-center'),
                    viewport_offset_x: this.settings.get_double('viewport-offset-x'),
                    viewport_offset_y: this.settings.get_double('viewport-offset-y'),
                    display_distance: this.settings.get_double('display-distance'),
                    display_size: this.settings.get_double('display-size'),
                    toggle_display_distance_start: this.settings.get_double('toggle-display-distance-start'),
                    toggle_display_distance_end: this.settings.get_double('toggle-display-distance-end'),
                    framerate_cap: this.settings.get_double('framerate-cap'),
                    imu_snapshots: Globals.data_stream.imu_snapshots,
                    show_banner: Globals.data_stream.show_banner,
                    custom_banner_enabled: Globals.data_stream.custom_banner_enabled,
                    pose_has_position
                });

                this._virtual_displays_overlay.set_child(this._virtual_displays_actor);
                this._virtual_displays_actor.renderMonitors();

                Shell.util_set_hidden_from_pick(this._virtual_displays_overlay, true);
                global.stage.add_child(this._virtual_displays_overlay);

                const cursor_manager_monitor_objs = this._virtual_displays_actor.monitor_actors.map(monitor => {
                    return {
                        monitor: monitor.monitorDetails,
                        actor: monitor.containerActor
                    };
                });

                this._cursor_manager = new CursorManager(cursor_manager_monitor_objs, refreshRate);
                this._cursor_manager.enable();

                this._update_follow_threshold(this.settings);

                this._data_stream_bindings = [
                    'show-banner',
                    'custom-banner-enabled',
                    'smooth-follow-enabled'
                ].map(data_stream_key => 
                    Globals.data_stream.bind_property(data_stream_key, this._virtual_displays_actor, data_stream_key, Gio.SettingsBindFlags.DEFAULT)
                );
                
                this._show_banner_connection = Globals.data_stream.connect('notify::show-banner', this._handle_show_banner_update.bind(this));
                this._was_show_banner = Globals.data_stream.show_banner;
                if (!this._was_show_banner && this._fresh_session) this._recenter_display();

                this._effect_settings_bindings = [
                    'monitor-wrapping-scheme',
                    'curved-display',
                    'headset-display-as-viewport-center',
                    'viewport-offset-x',
                    'viewport-offset-y',
                    'monitor-spacing',
                    'display-distance',
                    'toggle-display-distance-start',
                    'toggle-display-distance-end',
                    'display-size',
                    'framerate-cap',
                    'look-ahead-override',
                    'disable-anti-aliasing'
                ]
                this._effect_settings_bindings.forEach(settings_key => 
                    this.settings.bind(settings_key, this._virtual_displays_actor, settings_key, Gio.SettingsBindFlags.DEFAULT)
                );

                this._distance_connection = this.settings.connect('changed::display-distance', this._update_display_distance.bind(this));
                this._toggle_distance_start_connection = this.settings.connect('changed::toggle-display-distance-start', this._update_display_distance.bind(this));
                this._toggle_distance_end_connection = this.settings.connect('changed::toggle-display-distance-end', this._update_display_distance.bind(this));
                this._display_size_connection = this.settings.connect('changed::display-size', this._update_display_distance.bind(this));
                this._focused_monitor_distance_connection = 
                    this._virtual_displays_actor.connect('notify::focused-monitor-details', this._update_display_distance.bind(this));
                this._follow_threshold_connection = this.settings.connect('changed::follow-threshold', this._update_follow_threshold.bind(this));

                if (global.compositor?.disable_unredirect) {
                    global.compositor.disable_unredirect();
                } else {
                    Meta.disable_unredirect_for_display(global.display);
                }

                this._add_settings_keybinding('recenter-display-shortcut', this._recenter_display.bind(this));
                this._add_settings_keybinding('toggle-display-distance-shortcut', this._virtual_displays_actor._change_distance.bind(this._virtual_displays_actor));
                this._add_settings_keybinding('toggle-follow-shortcut', this._toggle_follow_mode.bind(this));
                this._add_settings_keybinding('cursor-to-focused-display-shortcut', this._cursor_to_focused_display.bind(this));

                this._fresh_session = false;
            } catch (e) {
                Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_enable ${e.message}\n${e.stack}`);
                Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_enable ${e.message}\n${e.stack}`);
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
                    Globals.logger.log(`[ERROR] BreezyDesktopExtension _add_settings_keybinding settings binding lambda ${e.message}\n${e.stack}`);
                }
            });
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _add_settings_keybinding ${e.message}\n${e.stack}`);
        }
    }

    _write_control(key, value) {
        try {
            Globals.logger.log_debug(`BreezyDesktopExtension _write_control ${key} ${value}`);
            let proc = Gio.Subprocess.new(
                ['bash', '-c', `echo "${key}=${value}" > /dev/shm/xr_driver_control`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            let [success, stdout, stderr] = proc.communicate_utf8(null, null);
            if (!success || !!stderr)
                throw new Error(`Failed to write control: ${stderr}`);
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _write_control ${e.message}\n${e.stack}`);
        }
    }

    _read_state() {
        const state = {};
        try {
            const file = Gio.file_new_for_path('/dev/shm/xr_driver_state');
            if (file.query_exists(null)) {
                const data = file.load_contents(null);
            
                if (data[0]) {
                    const bytes = new Uint8Array(data[1]);
                    const decoder = new TextDecoder();
                    const contents = decoder.decode(bytes);

                    const lines = contents.split('\n');
                    for (const line of lines) {
                        const [k, v] = line.split('=');
                        state[k] = v;
                    }
                }
            }
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _read_state ${e.message}\n${e.stack}`);
        }
        return state;
    }

    _update_display_distance(object, event) {
        const distance = this.settings.get_double('display-distance');
        const size = this.settings.get_double('display-size');
        Globals.logger.log_debug(`BreezyDesktopExtension _update_display_distance ${distance} ${size}`);
        if (distance !== undefined && size !== undefined) {
            const defaultDistance = Math.max(
                distance, 
                this.settings.get_double('toggle-display-distance-start'), 
                this.settings.get_double('toggle-display-distance-end')
            );
            let focusedMonitorSizeAdjustment = size * defaultDistance;
            if (this._virtual_displays_actor?.focused_monitor_details && this._target_monitor) {
                const fovMonitor = this._target_monitor.monitor;
                const focusedMonitor = this._virtual_displays_actor.focused_monitor_details;
                focusedMonitorSizeAdjustment *= 
                    Math.max(focusedMonitor.width / fovMonitor.width, focusedMonitor.height / fovMonitor.height);
            }
            this._write_control('breezy_desktop_display_distance', distance / focusedMonitorSizeAdjustment);
        }
    }

    _update_follow_threshold(settings, event) {
        const value = settings.get_double('follow-threshold');
        Globals.logger.log_debug(`BreezyDesktopExtension _update_follow_threshold ${value}`);
        if (value !== undefined) this._write_control('breezy_desktop_follow_threshold', value);
    }

    // requests sbs_mode change and monitors to ensure the state reflects the setting
    _request_sbs_mode_change(value) {
        Globals.logger.log_debug(`BreezyDesktopExtension _request_sbs_mode_change ${value}`);
        this._write_control('sbs_mode', value ? 'enable' : 'disable');
        if (!this._sbs_mode_update_timeout) {
            var attempts = 0;
            this._sbs_mode_update_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, (() => {
                const state = this._read_state();
                const sbs_enabled = state['sbs_mode_enabled'] === 'true';
                if (sbs_enabled === value) {
                    Globals.logger.log_debug('BreezyDesktopExtension _request_sbs_mode_change - successfully updated');
                    this._sbs_mode_update_timeout = undefined;

                    if (this.settings.get_boolean('fast-sbs-mode-switching')) {
                        // setup was halted if this is enabled, so we have to re-trigger it now
                        this._setup();
                    }
                    
                    return GLib.SOURCE_REMOVE;
                }

                if (attempts++ < 3) {
                    this._write_control('sbs_mode', value ? 'enable' : 'disable');
                    return GLib.SOURCE_CONTINUE;
                }

                // the state never updated to reflect our request, revert the setting
                Globals.logger.log('Failed to update sbs_mode state, reverting setting');
                this.settings.set_boolean('widescreen-mode', !value);
                this._sbs_mode_update_timeout = undefined;
                return GLib.SOURCE_REMOVE;
            }).bind(this));
        }
    }

    _update_widescreen_mode_from_settings(settings, event) {
        // const value = settings.get_boolean('widescreen-mode');
        // Globals.logger.log_debug(`BreezyDesktopExtension _update_widescreen_mode_from_settings ${value}`);
        // if (value !== undefined && value !== this._xr_effect.widescreen_mode_state) {
        //     this._request_sbs_mode_change(value);
        // } else
        //     Globals.logger.log_debug('effect.widescreen_mode_state already matched setting');
    }

    _update_widescreen_mode_from_state(effect, _pspec) {
        // kill our state checker if it's running
        if (this._sbs_mode_update_timeout) {
            Globals.logger.log_debug('BreezyDesktopExtension _update_widescreen_mode_from_state - clearing timeout');
            GLib.source_remove(this._sbs_mode_update_timeout);
            this._sbs_mode_update_timeout = undefined;
        }

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

    _handle_breezy_desktop_running_change(datastream, _pspec) {
        Globals.logger.log_debug(`BreezyDesktopExtension _handle_breezy_desktop_running_change ${datastream.breezy_desktop_running}`);

        if (datastream.breezy_desktop_running !== this._is_effect_running) {
            if (!datastream.breezy_desktop_running) Globals.logger.log('Breezy desktop disabled');
            this._fresh_session = datastream.breezy_desktop_running;
            this._setup(!datastream.breezy_desktop_running);
        }
    }

    _handle_show_banner_update(datastream, _pspec) {
        Globals.logger.log_debug(`BreezyDesktopExtension _handle_show_banner_update ${datastream.show_banner}`);
        if (this._was_show_banner && !datastream.show_banner) this._recenter_display();

        this._was_show_banner = datastream.show_banner;
    }

    _toggle_xr_effect() {
        if (!this._cli_file) return;

        Globals.logger.log_debug('BreezyDesktopExtension _toggle_xr_effect');

        let proc = Gio.Subprocess.new(
            ['bash', '-c', `${this._cli_file.get_path()} --external-mode`],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        let [success, stdout, stderr] = proc.communicate_utf8(null, null);
        if (!success || !!stderr || !stdout) {
            Globals.logger.log(`[ERROR] Failed to get driver status: ${stderr}`);
            return;
        }

        Globals.logger.log_debug(`BreezyDesktopExtension _toggle_xr_effect external_mode: ${stdout}`);
        const enabled = stdout.trim() === 'breezy_desktop';

        // use the CLI to change the external mode, avoid using disable/enable, otherwise the driver will 
        // shut down and recalibrate each time
        proc = Gio.Subprocess.new(
            ['bash', '-c', `${this._cli_file.get_path()} --${enabled ? 'disable-external' : 'breezy-desktop'}`],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );
        [success, stdout, stderr] = proc.communicate_utf8(null, null);
        if (!success || !!stderr) {
            Globals.logger.log(`[ERROR] Failed to toggle driver: ${stderr}`);
        }
    }

    _recenter_display() {
        Globals.logger.log_debug('BreezyDesktopExtension _recenter_display');
        this._write_control('recenter_screen', 'true');
    }

    _toggle_follow_mode() {
        Globals.logger.log_debug('BreezyDesktopExtension _toggle_follow_mode');
        if (!!this._virtual_displays_actor) this._virtual_displays_actor.set_property('smooth-follow-toggle-epoch-ms', Date.now());
        this._write_control('toggle_breezy_desktop_smooth_follow', 'true');
    }

    _cursor_to_focused_display() {
        Globals.logger.log_debug('BreezyDesktopExtension _cursor_to_focused_display');
        if (this._virtual_displays_actor?.focused_monitor_details) {
            const monitorDetails = this._virtual_displays_actor.focused_monitor_details;
            const xMid = monitorDetails.x + monitorDetails.width / 2;
            const yMid = monitorDetails.y + monitorDetails.height / 2;
            this._cursor_manager.moveCursorTo(xMid, yMid);
        }
    }

    // for_setup should be true if our intention is to immediately re-enable the extension
    _effect_disable(for_setup = false) {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension _effect_disable');
            this._is_effect_running = false;

            if (Globals.data_stream.smooth_follow_enabled) this._toggle_follow_mode();

            Main.wm.removeKeybinding('recenter-display-shortcut');
            Main.wm.removeKeybinding('toggle-display-distance-shortcut');
            Main.wm.removeKeybinding('toggle-follow-shortcut');
            Main.wm.removeKeybinding('cursor-to-focused-display-shortcut');
            
            if (global.compositor?.enable_unredirect) {
                global.compositor.enable_unredirect();
            } else {
                Meta.enable_unredirect_for_display(global.display);
            }

            for (let settings_key of this._effect_settings_bindings) {
                Gio.Settings.unbind(this.settings, settings_key);
            }
            this._effect_settings_bindings = [];
            this._data_stream_bindings.forEach(binding => binding.unbind());
            this._data_stream_bindings = [];

            if (this._show_banner_connection) {
                Globals.data_stream.disconnect(this._show_banner_connection);
                this._show_banner_connection = null;
            }
            if (this._distance_connection) {
                this.settings.disconnect(this._distance_connection);
                this._distance_connection = null;
            }
            if (this._toggle_distance_start_connection) {
                this.settings.disconnect(this._toggle_distance_start_connection);
                this._toggle_distance_start_connection = null;
            }
            if (this._toggle_distance_end_connection) {
                this.settings.disconnect(this._toggle_distance_end_connection);
                this._toggle_distance_end_connection = null;
            }
            if (this._display_size_connection) {
                this.settings.disconnect(this._display_size_connection);
                this._display_size_connection = null;
            }
            if (this._focused_monitor_distance_connection) {
                this._virtual_displays_actor.disconnect(this._focused_monitor_distance_connection);
                this._focused_monitor_distance_connection = null;
            }
            if (this._follow_threshold_connection) {
                this.settings.disconnect(this._follow_threshold_connection);
                this._follow_threshold_connection = null;
            }
            if (this._virtual_displays_overlay) {
                if (this._virtual_displays_actor) {
                    this._virtual_displays_overlay.set_child(null);
                    this._virtual_displays_actor.destroy();
                    this._virtual_displays_actor = null;
                }

                global.stage.remove_child(this._virtual_displays_overlay);
                this._virtual_displays_overlay.destroy();
                this._virtual_displays_overlay = null;
            }
            if (this._cursor_manager) {
                this._cursor_manager.disable();
                this._cursor_manager = null;
            }

            // this should always be done at the end of this function after the widescreen settings binding is removed,
            // so it doesn't reset the setting to false
            if (!for_setup && this.settings.get_boolean('widescreen-mode')) {
                Globals.logger.log('Disabling SBS mode due to disabling effect');
                this._write_control('sbs_mode', 'disable');
            }

            if (!for_setup && this.settings.get_boolean('remove-virtual-displays-on-disable')) {
                this._remove_virtual_displays();
            }
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_disable ${e.message}\n${e.stack}`);
        }
    }

    _remove_virtual_displays() {
        try {
            GLib.spawn_command_line_sync(`pkill -f "/virtualdisplay( |$)"`);
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _remove_virtual_displays ${e.message}\n${e.stack}`);
        }
    }

    disable() {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension disable');

            this._effect_disable();
            Globals.data_stream.stop();
            this._target_monitor = null;
            
            if (this._breezy_desktop_running_connection) {
                Globals.data_stream.disconnect(this._breezy_desktop_running_connection);
                this._breezy_desktop_running_connection = null;
            }
            Main.wm.removeKeybinding('toggle-xr-effect-shortcut');
            Gio.Settings.unbind(this.settings, 'debug');
            Gio.Settings.unbind(this.settings, 'use-optimal-monitor-config');
            Gio.Settings.unbind(this.settings, 'headset-as-primary');
            Gio.Settings.unbind(this.settings, 'disable-physical-displays');
            Gio.Settings.unbind(this.settings, 'debug-no-device');

            if (this._monitor_manager) {
                this._monitor_manager.disable();
                this._monitor_manager = null;
            }
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension disable ${e.message}\n${e.stack}`);
        }
    }
}

function init() {
    return new Extension();
}
