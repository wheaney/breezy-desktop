import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';
import Globals from './globals.js';
import MonitorManager from './monitormanager.js';
import { IPC_FILE_PATH, XREffect } from './xrEffect.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SUPPORTED_MONITOR_PRODUCTS = [
    'VITURE',
    'Air',
    'MetaMonitor' // nested mode dummy monitor
];

export default class BreezyDesktopExtension extends Extension {
    constructor(metadata, uuid) {
        super(metadata, uuid);
        
        // Set/destroyed by enable/disable
        this._cursor_manager = null;
        this._monitor_manager = null;
        this._xr_effect = null;
        this._overlay = null;
        this._target_monitor = null;
        this._is_effect_running = false;
    }

    enable() {
        Globals.extension_dir = this.path;
        this._monitor_manager = new MonitorManager(this.path);
        this._monitor_manager.setChangeHook(this._monitors_changed.bind(this));
        this._monitor_manager.enable();

        this._poll_for_ready();
    }

    _poll_for_ready() {
        this._running_poller_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, (() => {
            const is_driver_running = this._check_driver_running();
            if (is_driver_running && this._target_monitor) {
                console.log('Driver is running, supported monitor connected. Enabling XR effect.');
                this._effect_enable();
                this._running_poller_id = undefined;
                return GLib.SOURCE_REMOVE;
            } else {
                console.log(`Not ready: driver_running ${is_driver_running}, target_monitor ${JSON.stringify(this._target_monitor)}`);
                return GLib.SOURCE_CONTINUE;
            }
        }).bind(this));
    }

    _find_supported_monitor() {
        const target_monitor_id = this._monitor_manager.getMonitorPropertiesList()
                                          .find(monitor => SUPPORTED_MONITOR_PRODUCTS.includes(monitor.product))?.index;
        if (target_monitor_id !== undefined) {
            return this._monitor_manager.getMonitors()[target_monitor_id];
        }

        return null;
    }

    _monitors_changed() {
        if (this._is_effect_running) {
            console.log('Monitors changed, disabling effect');
            this._effect_disable();
        }
        this._target_monitor = this._find_supported_monitor();
        this._poll_for_ready();
    }

    _check_driver_running() {
        if (!Globals.ipc_file) Globals.ipc_file = Gio.file_new_for_path(IPC_FILE_PATH);
        return Globals.ipc_file.query_exists(null);
    }

    _effect_enable() {
        if (!this._is_effect_running) {
            this._cursor_manager = new CursorManager(Main.layoutManager.uiGroup);
            this._cursor_manager.enable();

            this._overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);'});
            this._overlay.opacity = 255;
            this._overlay.set_position(this._target_monitor.x, this._target_monitor.y);
            this._overlay.set_size(this._target_monitor.width, this._target_monitor.height);

            const overlayContent = new Clutter.Actor({clip_to_allocation: true});
            const uiClone = new Clutter.Clone({ source: Main.layoutManager.uiGroup, clip_to_allocation: true });
            uiClone.x = -this._target_monitor.x;
            uiClone.y = -this._target_monitor.y;
            overlayContent.add_actor(uiClone);

            this._overlay.set_child(overlayContent);

            global.stage.insert_child_above(this._overlay, null);
            Shell.util_set_hidden_from_pick(this._overlay, true);
            
            this._xr_effect = new XREffect({
                target_monitor: this._target_monitor,
                target_framerate: 60
            });

            this._overlay.add_effect_with_name('xr-desktop', this._xr_effect);
            Meta.disable_unredirect_for_display(global.display);

            this._is_effect_running = true;
        }
    }

    _effect_disable() {
        if (this._running_poller_id) GLib.source_remove(this._running_poller_id);

        Meta.enable_unredirect_for_display(global.display);
        this._overlay.remove_effect_by_name('xr-desktop');
        if (this._xr_effect) {
            this._xr_effect.unref();
            this._xr_effect = null;
        }

        if (this._overlay) {
            global.stage.remove_child(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }

        if (this._cursor_manager) {
            this._cursor_manager.disable();
            this._cursor_manager = null;
        }

        this._is_effect_running = false;
    }

    disable() {
        this._effect_disable();
        this._target_monitor = null;
        if (this._monitor_manager) {
            this._monitor_manager.disable();
            this._monitor_manager = null;
        }
    }
}

function init() {
    return new Extension();
}
