import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';
import { DeviceDataStream } from './devicedatastream.js';
import Globals from './globals.js';
import { Logger } from './logger.js';
import { MonitorManager } from './monitormanager.js';
import { VirtualMonitorsActor } from './virtualmonitorsactor.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const NESTED_MONITOR_PRODUCT = 'MetaMonitor';
const VIRTUAL_MONITOR_PRODUCT = 'Virtual remote monitor';
const SUPPORTED_MONITOR_PRODUCTS = [
    'VITURE',
    'nreal air',
    'Air',
    'Air 2',
    'Air 2 Pro',
    'Air 2 Ultra',
    'SmartGlasses', // TCL/RayNeo
    'Rokid Max',
    'Rokid Air',
    NESTED_MONITOR_PRODUCT
];

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
        this._overlay_content = null;
        this._overlay = null;
        this._target_monitor = null;
        this._is_effect_running = false;
        this._distance_binding = null;
        this._show_banner_binding = null;
        this._show_banner_connection = null;
        this._custom_banner_enabled_binding = null;
        this._monitor_wrapping_scheme_binding = null;
        this._viewport_offset_x_binding = null;
        this._viewport_offset_y_binding = null;
        this._monitor_spacing_binding = null;
        this._distance_connection = null;
        this._follow_threshold_connection = null;
        this._widescreen_mode_settings_connection = null;
        this._widescreen_mode_effect_state_connection = null;
        this._breezy_desktop_running_connection = null;
        this._debug_no_device_binding = null;
        this._start_binding = null;
        this._end_binding = null;
        this._curved_display_binding = null;
        this._display_size_binding = null;
        this._look_ahead_override_binding = null;
        this._disable_anti_aliasing_binding = null;
        this._framerate_cap_binding = null;
        this._optimal_monitor_config_binding = null;
        this._headset_as_primary_binding = null;
        this._actor_added_connection = null;
        this._actor_removed_connection = null;
        this._data_stream_connection = null;

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
            this.settings.bind('debug', Globals.logger, 'debug', Gio.SettingsBindFlags.DEFAULT);

            Globals.data_stream.start();

            this._monitor_manager = new MonitorManager({
                use_optimal_monitor_config: this.settings.get_boolean('use-optimal-monitor-config'),
                headset_as_primary: this.settings.get_boolean('headset-as-primary'),
                use_highest_refresh_rate: this.settings.get_boolean('use-highest-refresh-rate'),
                extension_path: this.path
            });
            this._monitor_manager.setChangeHook(this._handle_monitor_change.bind(this));
            this._monitor_manager.enable();

            this._optimal_monitor_config_binding = this.settings.bind('use-optimal-monitor-config', 
                this._monitor_manager, 'use-optimal-monitor-config', Gio.SettingsBindFlags.DEFAULT);
            this._headset_as_primary_binding = this.settings.bind('headset-as-primary',
                this._monitor_manager, 'headset-as-primary', Gio.SettingsBindFlags.DEFAULT);
            this._debug_no_device_binding = this.settings.bind('debug-no-device', 
                Globals.data_stream, 'debug-no-device', Gio.SettingsBindFlags.DEFAULT);
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
                    monitor => monitor && monitor.product !== VIRTUAL_MONITOR_PRODUCT);
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

                this._cursor_manager = new CursorManager(Main.layoutManager.uiGroup, [targetMonitor, ...virtualMonitors], refreshRate);
                this._cursor_manager.enable();

                // use rgba(255, 4, 144, 1) for chroma key background
                this._overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);', clip_to_allocation: true });
                this._overlay.opacity = 255;
                this._overlay.set_position(targetMonitor.x, targetMonitor.y);
                this._overlay.set_size(targetMonitor.width, targetMonitor.height);

                // const textureSourceActor = Main.layoutManager.uiGroup;
                Globals.data_stream.refresh_data();
                this._overlay_content = new VirtualMonitorsActor({
                    width: targetMonitor.width,
                    height: targetMonitor.height,
                    virtual_monitors: virtualMonitors,
                    monitor_wrapping_scheme: this.settings.get_string('monitor-wrapping-scheme'),
                    monitor_spacing: this.settings.get_int('monitor-spacing'),
                    viewport_offset_x: this.settings.get_double('viewport-offset-x'),
                    viewport_offset_y: this.settings.get_double('viewport-offset-y'),
                    target_monitor: targetMonitor,
                    display_distance: this.settings.get_double('display-distance'),
                    toggle_display_distance_start: this.settings.get_double('toggle-display-distance-start'),
                    toggle_display_distance_end: this.settings.get_double('toggle-display-distance-end'),
                    framerate_cap: this.settings.get_double('framerate-cap'),
                    imu_snapshots: Globals.data_stream.imu_snapshots,
                    show_banner: Globals.data_stream.show_banner,
                    custom_banner_enabled: Globals.data_stream.custom_banner_enabled
                });

                this._overlay.set_child(this._overlay_content);
                this._overlay_content.renderMonitors();

                Shell.util_set_hidden_from_pick(this._overlay, true);
                global.stage.add_child(this._overlay);

                // In GS 45, use of "actor" was renamed to "child".
                const clutterContainer = Clutter.Container !== undefined;
                this._actor_added_connection = global.stage.connect(
                    clutterContainer ? 'actor-added' : 'child-added',
                    this._handle_sibling_update.bind(this),
                );
                this._actor_removed_connection = global.stage.connect(
                    clutterContainer ? 'actor-removed' : 'child-removed',
                    this._handle_sibling_update.bind(this),
                );

                this._update_follow_threshold(this.settings);

                // this gets triggered before _effect_enable if in fast-sbs-mode-switching mode
                // if (!this.settings.get_boolean('fast-sbs-mode-switching')) 
                //     this._update_widescreen_mode_from_settings(this.settings);

                // this._widescreen_mode_effect_state_connection = this._xr_effect.connect('notify::widescreen-mode-state', this._update_widescreen_mode_from_state.bind(this));

                this._show_banner_binding = Globals.data_stream.bind_property('show-banner', this._overlay_content, 'show-banner', Gio.SettingsBindFlags.DEFAULT);
                this._show_banner_connection = Globals.data_stream.connect('notify::show-banner', this._handle_show_banner_update.bind(this));
                this._was_show_banner = Globals.data_stream.show_banner;
                if (!this._was_show_banner) this._recenter_display();

                this._custom_banner_enabled_binding = Globals.data_stream.bind_property('custom-banner-enabled', this._overlay_content, 'custom-banner-enabled', Gio.SettingsBindFlags.DEFAULT);

                this._monitor_wrapping_scheme_binding = this.settings.bind('monitor-wrapping-scheme', this._overlay_content, 'monitor-wrapping-scheme', Gio.SettingsBindFlags.DEFAULT);
                this._viewport_offset_x_binding = this.settings.bind('viewport-offset-x', this._overlay_content, 'viewport-offset-x', Gio.SettingsBindFlags.DEFAULT);
                this._viewport_offset_y_binding = this.settings.bind('viewport-offset-y', this._overlay_content, 'viewport-offset-y', Gio.SettingsBindFlags.DEFAULT);
                this._monitor_spacing_binding = this.settings.bind('monitor-spacing', this._overlay_content, 'monitor-spacing', Gio.SettingsBindFlags.DEFAULT);
                this._distance_binding = this.settings.bind('display-distance', this._overlay_content, 'display-distance', Gio.SettingsBindFlags.DEFAULT);
                this._distance_connection = this.settings.connect('changed::display-distance', this._update_display_distance.bind(this));
                this._follow_threshold_connection = this.settings.connect('changed::follow-threshold', this._update_follow_threshold.bind(this));
                
                // this._widescreen_mode_settings_connection = this.settings.connect('changed::widescreen-mode', this._update_widescreen_mode_from_settings.bind(this))
                this._start_binding = this.settings.bind('toggle-display-distance-start', this._overlay_content, 'toggle-display-distance-start', Gio.SettingsBindFlags.DEFAULT)
                this._end_binding = this.settings.bind('toggle-display-distance-end', this._overlay_content, 'toggle-display-distance-end', Gio.SettingsBindFlags.DEFAULT);
                this._display_size_binding = this.settings.bind('display-size', this._overlay_content, 'display-size', Gio.SettingsBindFlags.DEFAULT);
                this._framerate_cap_binding = this.settings.bind('framerate-cap', this._overlay_content, 'framerate-cap', Gio.SettingsBindFlags.DEFAULT);
                // this._curved_display_binding = this.settings.bind('curved-display', this._xr_effect, 'curved-display', Gio.SettingsBindFlags.DEFAULT)
                this._look_ahead_override_binding = this.settings.bind('look-ahead-override', this._overlay_content, 'look-ahead-override', Gio.SettingsBindFlags.DEFAULT);
                this._disable_anti_aliasing_binding = this.settings.bind('disable-anti-aliasing', this._overlay_content, 'disable-anti-aliasing', Gio.SettingsBindFlags.DEFAULT);

                Meta.disable_unredirect_for_display(global.display);

                this._add_settings_keybinding('toggle-xr-effect-shortcut', this._toggle_xr_effect.bind(this));
                this._add_settings_keybinding('recenter-display-shortcut', this._recenter_display.bind(this));
                this._add_settings_keybinding('toggle-display-distance-shortcut', this._overlay_content._change_distance.bind(this._overlay_content));
                this._add_settings_keybinding('toggle-follow-shortcut', this._toggle_follow_mode.bind(this));
            } catch (e) {
                Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_enable ${e.message}\n${e.stack}`);
                Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_enable ${e.message}\n${e.stack}`);
                this._effect_disable();
            }
        }
    }

    _handle_sibling_update() {
        Globals.logger.log_debug('BreezyDesktopExtension _handle_sibling_update()');
        global.stage.set_child_above_sibling(this._overlay, null);
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
        this._write_control('toggle_breezy_desktop_smooth_follow', 'true');
    }

    // for_setup should be true if our intention is to immediately re-enable the extension
    _effect_disable(for_setup = false) {
        try {
            Globals.logger.log_debug('BreezyDesktopExtension _effect_disable');
            this._is_effect_running = false;

            Main.wm.removeKeybinding('recenter-display-shortcut');
            Main.wm.removeKeybinding('toggle-display-distance-shortcut');
            Main.wm.removeKeybinding('toggle-follow-shortcut');
            Meta.enable_unredirect_for_display(global.display);

            if (this._actor_added_connection) {
                global.stage.disconnect(this._actor_added_connection);
                this._actor_added_connection = null;
            }
            if (this._actor_removed_connection) {
                global.stage.disconnect(this._actor_removed_connection);
                this._actor_removed_connection = null;
            }
            if (this._distance_binding) {
                this.settings.unbind(this._distance_binding);
                this._distance_binding = null;
            }
            if (this._monitor_spacing_binding) {
                this.settings.unbind(this._monitor_spacing_binding);
                this._monitor_spacing_binding = null;
            }
            if (this._viewport_offset_x_binding) {
                this.settings.unbind(this._viewport_offset_x_binding);
                this._viewport_offset_x_binding = null;
            }
            if (this._viewport_offset_y_binding) {
                this.settings.unbind(this._viewport_offset_y_binding);
                this._viewport_offset_y_binding = null;
            }
            if (this._monitor_wrapping_scheme_binding) {
                this.settings.unbind(this._monitor_wrapping_scheme_binding);
                this._monitor_wrapping_scheme_binding = null;
            }
            if (this._show_banner_binding) {
                this._show_banner_binding.unbind();
                this._show_banner_binding = null;
            }
            if (this._show_banner_connection) {
                Globals.data_stream.disconnect(this._show_banner_connection);
                this._show_banner_connection = null;
            }
            if (this._custom_banner_enabled_binding) {
                this._custom_banner_enabled_binding.unbind();
                this._custom_banner_enabled_binding = null;
            }
            if (this._distance_connection) {
                this.settings.disconnect(this._distance_connection);
                this._distance_connection = null;
            }
            if (this._data_stream_connection) {
                this._data_stream_connection.unbind();
                this._data_stream_connection = null;
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
            if (this._look_ahead_override_binding) {
                this.settings.unbind(this._look_ahead_override_binding);
                this._look_ahead_override_binding = null;
            }
            if (this._disable_anti_aliasing_binding) {
                this.settings.unbind(this._disable_anti_aliasing_binding);
                this._disable_anti_aliasing_binding = null;
            }
            if (this._framerate_cap_binding) {
                this.settings.unbind(this._framerate_cap_binding);
                this._framerate_cap_binding = null;
            }
            if (this._overlay) {
                if (this._overlay_content) {
                    this._overlay.remove_child(this._overlay_content);
                    this._overlay_content.destroy();
                    this._overlay_content = null;
                }

                global.stage.remove_child(this._overlay);
                this._overlay.destroy();
                this._overlay = null;
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
        } catch (e) {
            Globals.logger.log(`[ERROR] BreezyDesktopExtension _effect_disable ${e.message}\n${e.stack}`);
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
            if (this._debug_no_device_binding) {
                this.settings.unbind(this._debug_no_device_binding);
                this._debug_no_device_binding = null;
            }

            if (this._monitor_manager) {
                if (this._optimal_monitor_config_binding) {
                    this.settings.unbind(this._optimal_monitor_config_binding);
                    this._optimal_monitor_config_binding = null
                }
                if (this._headset_as_primary_binding) {
                    this.settings.unbind(this._headset_as_primary_binding);
                    this._headset_as_primary_binding = null;
                }

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
