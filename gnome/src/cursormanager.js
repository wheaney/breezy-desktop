import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import { MouseSpriteContent } from './cursor.js';
import Globals from './globals.js';

// Taken from https://github.com/jkitching/soft-brightness-plus
export class CursorManager {
    constructor(mainActor, refreshRate) {
        this._mainActor = mainActor;
        this._refreshRate = refreshRate;

        // Set/destroyed by _enableCloningMouse/_disableCloningMouse
        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorWatcher = null;
        this._cursorSeat = null;
        this._cursorUnfocusInhibited = false;

        // Set/destroyed by _startCloningMouse / _stopCloningMouse
        this._cursorWatch = null;
        this._cursorChangedConnection = null;
        this._cursorVisibilityChangedConnection = null;
        this._periodicResetTimeout = null;
    }

    enable() {
        Globals.logger.log_debug('CursorManager enable');
        this._enableCloningMouse();
        this.startCloning();
    }

    disable() {
        Globals.logger.log_debug('CursorManager disable');
        this._disableCloningMouse();
    }

    startCloning() {
        Globals.logger.log_debug('CursorManager startCloning');
        this._startCloningMouse();
    }

    stopCloning() {
        Globals.logger.log_debug('CursorManager stopCloning');
        this._stopCloningMouse();
    }

    // After this:
    // * real cursor is disabled
    // * cloning is "on" 
    // * cloned cursor not visible, but ready for _startCloningMouse to make it visible
    //
    // okay if _startCloningMouse is not immediately called since set_pointer_visible is bound to our replacement function
    // and will trigger _startCloningMouse when the cursor should be shown
    _enableCloningMouse() {
        Globals.logger.log_debug('CursorManager _enableCloningMouse');
        this._cursorTracker = Meta.CursorTracker.get_for_display(global.display);
        this._cursorWantedVisible = this._cursorTracker.get_pointer_visible();
        this._cursorTrackerSetPointerVisible = Meta.CursorTracker.prototype.set_pointer_visible;
        this._cursorTrackerSetPointerVisibleBound = this._cursorTrackerSetPointerVisible.bind(this._cursorTracker);
        Meta.CursorTracker.prototype.set_pointer_visible = this._cursorTrackerSetPointerVisibleReplacement.bind(this);

        this._cursorTrackerSetPointerVisibleBound(false);

        this._cursorSprite = new Clutter.Actor({ request_mode: Clutter.RequestMode.CONTENT_SIZE });
        this._cursorSprite.content = new MouseSpriteContent();

        this._cursorActor = new Clutter.Actor();
        if (Clutter.Container === undefined) {
            this._cursorActor.add_child(this._cursorSprite);
        } else {
            this._cursorActor.add_actor(this._cursorSprite);
        }
        this._cursorWatcher = PointerWatcher.getPointerWatcher();
        this._cursorSeat = Clutter.get_default_backend().get_default_seat();
    }

    // After this:
    // * real cursor enabled, manages its own visibility
    // * cloning is "off"
    // * no cloned cursor
    // 
    // completely reverts _enableCloningMouse
    _disableCloningMouse() {
        Globals.logger.log_debug('CursorManager _disableCloningMouse');
        this._stopCloningMouse();
        Meta.CursorTracker.prototype.set_pointer_visible = this._cursorTrackerSetPointerVisible;
        this._cursorTracker.set_pointer_visible(this._cursorWantedVisible);

        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorWatcher = null;
        this._cursorSeat = null;
    }

    // bound to Meta.CursorTracker.prototype.set_pointer_visible when cloning is "on"
    // original function available in this._cursorTrackerSetPointerVisibleBound
    _cursorTrackerSetPointerVisibleReplacement(visible) {
        Globals.logger.log_debug('CursorManager _cursorTrackerSetPointerVisibleReplacement');
        this._cursorWantedVisible = visible;
        if (visible) {
            this._startCloningMouse();
        } else {
            this._stopCloningMouse();
        }
    }

    // After this:
    // * real cursor is hidden
    // * cloning is "on"
    // * clone cursor is visible
    // 
    // add the clone cursor actor, watch for pointer movement and cursor changes, reflect them in the cloned cursor
    // prereqs: setup in _enableCloningMouse, _cursorWantedVisible is true
    _startCloningMouse() {
        Globals.logger.log_debug('CursorManager _startCloningMouse');
        if (this._cursorWatch == null) {
            if (Clutter.Container === undefined) {
                this._mainActor.add_child(this._cursorActor);
            } else {
                this._mainActor.add_actor(this._cursorActor);
            }
            this._cursorChangedConnection = this._cursorTracker.connect('cursor-changed', this._queueSpriteUpdate.bind(this));
            this._cursorVisibilityChangedConnection = this._cursorTracker.connect('visibility-changed', this._queueVisibilityUpdate.bind(this));

            // Some elements will occasionally appear above the cursor, so we periodically reset the actor stacking.
            // This could theoretically be fixed "better" by attaching to all events that might affect actor ordering,
            // but finding a comprehensive list is difficult and not future proof. So this ugly solution helps us
            // catch everything.
            this._periodicResetTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, (() => {
                this._periodicReset()
                return GLib.SOURCE_CONTINUE;
            }).bind(this));

            const interval = 1000 / this._refreshRate;
            this._cursorWatch = this._cursorWatcher.addWatch(interval, this._queuePositionUpdate.bind(this));

            const [x, y] = global.get_pointer();
            this._queuePositionUpdate(x, y);
            this._queueSpriteUpdate();
        }

        if (this._cursorTracker.set_keep_focus_while_hidden) {
            this._cursorTracker.set_keep_focus_while_hidden(true);
        }

        if (!this._cursorUnfocusInhibited) {
            Globals.logger.log_debug('inhibit_unfocus');
            this._cursorSeat.inhibit_unfocus();
            this._cursorUnfocusInhibited = true;
        }
    }

    // After this:
    // * real cursor is hidden
    // * cloning is "on"
    // * cloned cursor not visible, but ready for _startCloningMouse to make it visible
    // 
    // completely reverts _startCloningMouse
    _stopCloningMouse() {
        Globals.logger.log_debug('CursorManager _stopCloningMouse');
        if (this._cursorWatch != null) {
            this._cursorWatch.remove();
            this._cursorWatch = null;

            if (this._cursorChangedConnection) {
                this._cursorTracker.disconnect(this._cursorChangedConnection);
                this._cursorChangedConnection = null;
            }

            if (this._cursorVisibilityChangedConnection) {
                this._cursorTracker.disconnect(this._cursorVisibilityChangedConnection);
                this._cursorVisibilityChangedConnection = null;
            }

            if (Clutter.Container === undefined) {
                this._mainActor.remove_child(this._cursorActor);
            } else {
                this._mainActor.remove_actor(this._cursorActor);
            }

            if (this._periodicResetTimeout) {
                GLib.source_remove(this._periodicResetTimeout);
                this._periodicResetTimeout = null;
            }
        }

        if (this._cursorUnfocusInhibited) {
            Globals.logger.log_debug('uninhibit_unfocus');
            this._cursorSeat.uninhibit_unfocus();
            this._cursorUnfocusInhibited = false;
        }
    }

    _queuePositionUpdate(x, y) {
        this._queued_cursor_position = [x, y];
    }

    _queueSpriteUpdate() {
        this._queued_sprite_update = true;
    }

    _queueVisibilityUpdate() {
        this._cursorTrackerSetPointerVisibleBound(false);
        this._queued_visibility_update = true;
        this._queueSpriteUpdate();
    }

    handleNewFrame() {
        let redraw = false;
        if (this._queued_cursor_position) {
            const [x, y] = this._queued_cursor_position;
            this._cursorActor.set_position(x, y);
            this._queued_cursor_position = null;
            redraw = true;
        }

        if (this._queued_sprite_update) {
            const sprite = this._cursorTracker.get_sprite();
            if (sprite) {
                this._cursorSprite.content.texture = sprite;
                this._cursorSprite.show();
            } else {
                this._cursorSprite.hide();
            }
    
            const [xHot, yHot] = this._cursorTracker.get_hot();
            this._cursorSprite.set({
                translation_x: -xHot,
                translation_y: -yHot,
            });
            this._queued_sprite_update = false;
            redraw = true;
        }

        if (this._queued_visibility_update) {
            this._queued_visibility_update = false;
            redraw = true;
        }

        return redraw;
    }

    // updates the stacking and other attributes that are hard to track and may periodically get out of sync
    _periodicReset() {
        this._queueVisibilityUpdate();
        this._mainActor.set_child_above_sibling(this._cursorActor, null);

        // some other processes are uninhibiting when they shouldn't, so we need to re-inhibit here
        if (!this._cursorSeat.is_unfocus_inhibited() && this._cursorUnfocusInhibited) {
            Globals.logger.log_debug('reinhibiting');
            this._cursorSeat.inhibit_unfocus();
        }
    }
}