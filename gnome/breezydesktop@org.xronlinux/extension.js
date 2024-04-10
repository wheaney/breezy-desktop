import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CursorManager } from './cursormanager.js';
import Globals from './globals.js';
import { IPC_FILE_PATH, XREffect } from './xrEffect.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class BreezyDesktopExtension extends Extension {
    constructor(metadata, uuid) {
        super(metadata, uuid);
        
        // Set/destroyed by enable/disable
        this._cursorManager = null;
        this._xr_effect = null;
        this._overlay = null;
    }

    enable() {
        if (!this._check_driver_running()) {
            this._running_poller_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, (() => {
                if (this._check_driver_running()) {
                    this._effect_enable();
                    this._running_poller_id = undefined;
                    return GLib.SOURCE_REMOVE;
                } else {
                    return GLib.SOURCE_CONTINUE;
                }
            }).bind(this));
        } else {
            this._effect_enable();
        }
    }

    _check_driver_running() {
        if (!Globals.ipc_file) Globals.ipc_file = Gio.file_new_for_path(IPC_FILE_PATH);
        return Globals.ipc_file.query_exists(null);
    }

    _effect_enable() {
        if (!Globals.extension_dir) Globals.extension_dir = this.metadata.path;

        if (!this._cursorManager) this._cursorManager = new CursorManager(Main.layoutManager.uiGroup);
        this._cursorManager.enable();

        if (!this._overlay) {
            const monitors = Main.layoutManager.monitors;
            this._target_monitor = monitors[monitors.length-1];

            this._overlay = new St.Bin({ style: 'background-color: rgba(0, 0, 0, 1);'});
            this._overlay.opacity = 255;
            this._overlay.set_position(this._target_monitor.x, this._target_monitor.y);
            this._overlay.set_size(this._target_monitor.width, this._target_monitor.height);

            const overlayContent = new Clutter.Actor({clip_to_allocation: true});
            const uiClone = new Clutter.Clone({ source: Main.layoutManager.uiGroup, clip_to_allocation: true });
            overlayContent.add_actor(uiClone);

            this._overlay.set_child(overlayContent);

            global.stage.insert_child_above(this._overlay, null);
            Shell.util_set_hidden_from_pick(this._overlay, true);

            uiClone.x = -this._target_monitor.x;
            uiClone.y = -this._target_monitor.y;
        }

        if (!this._xr_effect) {
            this._xr_effect = new XREffect({
                target_monitor: this._target_monitor,
                target_framerate: 60
            });
        }

        this._overlay.add_effect_with_name('xr-desktop', this._xr_effect);
        Meta.disable_unredirect_for_display(global.display);
    }

    disable() {
        if (this._running_poller_id) {
            GLib.source_remove(this._running_poller_id);
        } else {
            Meta.enable_unredirect_for_display(global.display);
            this._overlay.remove_effect_by_name('xr-desktop');
            this._cursorManager.disable();
            this._cursorManager = null;
        }
    }
}

function init() {
    return new Extension();
}
