import Clutter from 'gi://Clutter'
import Shell from 'gi://Shell';
import St from 'gi://St';

import { SystemBackground } from './systembackground.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Overlay {
    constructor(targetMonitor) {
        this._overlayContent = new Clutter.Actor({clip_to_allocation: true});
        this._overlay = new St.Bin({
            child: this._overlayContent
        });
        this._overlay.set_position(targetMonitor.x, targetMonitor.y);
        this._overlay.set_size(targetMonitor.width, targetMonitor.height);

        global.stage.add_child(this._overlay);
        Shell.util_set_hidden_from_pick(this._overlay, true);

        this._background = new SystemBackground();
        this._overlayContent.add_child(this._background);

        this._uiClone = new Clutter.Clone({ source: Main.layoutManager.uiGroup, clip_to_allocation: true });
        this._uiClone.x = -targetMonitor.x;
        this._uiClone.y = -targetMonitor.y;
        this._overlayContent.add_child(this._uiClone);

        this._targetMonitor = targetMonitor;
    }

    isWithinBounds(x, y) {
        return x >= this._targetMonitor.x && x < this._targetMonitor.x + this._targetMonitor.width &&
               y >= this._targetMonitor.y && y < this._targetMonitor.y + this._targetMonitor.height;
    }

    getRelativePosition(x, y) {
        return [x - this._targetMonitor.x, y - this._targetMonitor.y];
    }

    mainActor() {
        return this._overlayContent;
    }

    destroy() {
        global.stage.remove_child(this._overlay);
        this._overlay.destroy();
        this._overlay = null;
    }
}