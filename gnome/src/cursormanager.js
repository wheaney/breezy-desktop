import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import { MouseSpriteContent } from './cursor.js';
import Globals from './globals.js';

// Taken from https://github.com/jkitching/soft-brightness-plus
export class CursorManager {
    constructor(targetMonitors, refreshRate) {
        this._targetMonitors = targetMonitors;
        this._refreshRate = refreshRate;

        // Set/destroyed by _enableCloningMouse/_disableCloningMouse
        this._cursorTracker = null;
        this._mouseSprite = null;
        this._cursorRoot = null;
        this._cursorUnfocusInhibited = false;

        // Set/destroyed by _startCloningMouse / _stopCloningMouse
        this._cursorWatch = null;
        this._cursorChangedConnection = null;
        this._systemCursorShown = true;
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
        this._cursorTracker = global.backend.get_cursor_tracker?.() ?? Meta.CursorTracker.get_for_display(global.display);

        this._mouseSprite = new Clutter.Actor({ request_mode: Clutter.RequestMode.CONTENT_SIZE });
        this._mouseSprite.content = new MouseSpriteContent();

        this._cursorRoot = new Clutter.Actor();
        this._cursorRoot.add_child(this._mouseSprite);
    }

    _backend() {
        return global.stage.get_context?.().get_backend() ?? Clutter.get_default_backend();
    }

    _hideSystemCursor() {
        this._systemCursorShown = false;

        this._cursorRoot.show();

        if (!this._cursorUnfocusInhibited) {
            this._backend().get_default_seat().inhibit_unfocus();
            this._cursorUnfocusInhibited = true;
        }

        if (!this._cursorVisibilityChangedId) {
            this._cursorTracker.set_pointer_visible(false);
            this._cursorVisibilityChangedId = this._cursorTracker.connect('visibility-changed', (() => {
                if (this._cursorTracker.get_pointer_visible())
                    this._cursorTracker.set_pointer_visible(false);
            }).bind(this));
        }
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

        if (this._mouseSprite) {
            this._mouseSprite.content = null;
            if (this._cursorRoot) this._cursorRoot.remove_child(this._mouseSprite);
        }

        this._cursorTracker = null;
        this._mouseSprite = null;
        this._cursorRoot = null;
    }

    // After this:
    // * real cursor is hidden
    // * cloning is "on"
    // * clone cursor is visible
    // 
    // add the clone cursor actor, watch for pointer movement and cursor changes, reflect them in the cloned cursor
    // prereqs: setup in _enableCloningMouse
    _startCloningMouse() {
        Globals.logger.log_debug('CursorManager _startCloningMouse');

        this._updateMouseSprite();
        this._cursorTracker.connectObject('cursor-changed', this._updateMouseSprite.bind(this), this);

        // cap the refresh rate for performance reasons
        const interval = 1000.0 / Math.min(this._refreshRate, 60);

        this._cursorWatch = PointerWatcher.getPointerWatcher().addWatch(interval, this._updateMousePosition.bind(this));
        this._updateMousePosition();
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
        }

        if (this._cursorTracker) this._cursorTracker.disconnectObject(this);
        if (this._mouseSprite?.content?.texture) this._mouseSprite.content.texture = null;
        
        if (!this._systemCursorShown) this._showSystemCursor();
    }

    _showSystemCursor() {
        this._systemCursorShown = true;

        if (this._cursorRoot) this._cursorRoot.hide();

        if (this._cursorUnfocusInhibited) {
            this._backend().get_default_seat().uninhibit_unfocus();
            this._cursorUnfocusInhibited = false;
        }

        if (this._cursorVisibilityChangedId) {
            this._cursorTracker.disconnect(this._cursorVisibilityChangedId);
            delete this._cursorVisibilityChangedId;

            this._cursorTracker.set_pointer_visible(true);
        }
    }

    _updateMousePosition(...args) {
        const [xMouse, yMouse] = args.length ? args : global.get_pointer();
        let onMonitorIndex;
        let xRel;
        let yRel;

        const inBoundsCheck = (monitorObj, index) => {
            const inBoundsCoordinates = this._getInBoundsCoordinates(xMouse, yMouse, monitorObj.monitor);
            if (inBoundsCoordinates) {
                onMonitorIndex = index;
                xRel = inBoundsCoordinates.xRel;
                yRel = inBoundsCoordinates.yRel;
                return true;
            }
            return false;
        }

        // check the previously in-bounds monitor first to avoid iterating over the whole list in the likely case that the cursor 
        // is still on the same monitor
        if (this.onMonitorIndex === undefined || !inBoundsCheck(this._targetMonitors[this.onMonitorIndex], this.onMonitorIndex)) {
            for (let i = 0; i < this._targetMonitors.length; i++) {
                if (this.onMonitorIndex === i) continue;
                if (inBoundsCheck(this._targetMonitors[i], i)) break;
            }
        }

        if (this.onMonitorIndex !== onMonitorIndex) {
            try {
                if (this.onMonitorIndex !== undefined) this._targetMonitors[this.onMonitorIndex].actor.remove_child(this._cursorRoot);

                this.onMonitorIndex = onMonitorIndex;
                if (this.onMonitorIndex !== undefined) {
                    const actor = this._targetMonitors[this.onMonitorIndex].actor;
                    actor.add_child(this._cursorRoot);
                    actor.set_child_above_sibling(this._cursorRoot, null);
                }
            } catch (e) {
                Globals.logger.log_debug(e);
            }
        }

        if (this.onMonitorIndex !== undefined) {
            if (this._systemCursorShown) this._hideSystemCursor();
            this._cursorRoot.set_position(xRel, yRel);
        } else if (!this._systemCursorShown) {
            this._showSystemCursor();
        }

        this.xRel = xRel;
        this.xRel = xRel;

        const seat = this._backend().get_default_seat();
        if (this._cursorUnfocusInhibited && !seat.is_unfocus_inhibited()) {
            Globals.logger.log_debug('reinhibiting');
            seat.inhibit_unfocus();
        }
    }

    _updateMouseSprite() {
        this._updateSpriteTexture();
        let [xHot, yHot] = this._cursorTracker.get_hot();
        this._mouseSprite.set({
            translation_x: -xHot,
            translation_y: -yHot,
        });
    }

    _updateSpriteTexture() {
        let sprite = this._cursorTracker.get_sprite();

        if (sprite) {
            this._mouseSprite.content.texture = sprite;
            this._mouseSprite.show();
        } else {
            this._mouseSprite.hide();
        }
    }

    _getInBoundsCoordinates(x, y, monitor) {
        const xRel = x - monitor.x;
        const yRel = y - monitor.y;
        if (xRel >= 0 && xRel < monitor.width && yRel >= 0 && yRel < monitor.height) {
            return {
                xRel,
                yRel,
            }
        }
        
        return null;
    }

    moveCursorTo(x, y) {
        this._backend().get_default_seat().warp_pointer(x, y);
    }
}