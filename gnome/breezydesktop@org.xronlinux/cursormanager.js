import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import { MouseSpriteContent } from './cursor.js';

// Taken from https://github.com/jkitching/soft-brightness-plus
export class CursorManager {
    constructor(mainActor) {
        this._mainActor = mainActor;

        this._changeHookFn = null;

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
        this._cursorPositionInvalidatedConnection = null;
    }

    enable() {
        this._enableCloningMouse();
        this.startCloning();
    }

    disable() {
        this._disableCloningMouse();
    }

    startCloning() {
        this._startCloningMouse();
    }

    stopCloning() {
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
        if (this._cursorWatch == null) {
            if (Clutter.Container === undefined) {
                this._mainActor.add_child(this._cursorActor);
            } else {
                this._mainActor.add_actor(this._cursorActor);
            }
            this._cursorChangedConnection = this._cursorTracker.connect('cursor-changed', this._updateMouseSprite.bind(this));
            this._cursorVisibilityChangedConnection = this._cursorTracker.connect('visibility-changed', this._updateMouseSprite.bind(this));
            this._cursorPositionInvalidatedConnection = this._cursorTracker.connect('position-invalidated', this._updateMouseSprite.bind(this));

            const interval = 1000 / 250;
            this._cursorWatch = this._cursorWatcher.addWatch(interval, this._updateMousePosition.bind(this));

            const [x, y] = global.get_pointer();
            this._updateMousePosition(x, y);
            this._updateMouseSprite();
        }

        if (this._cursorTracker.set_keep_focus_while_hidden) {
            this._cursorTracker.set_keep_focus_while_hidden(true);
        }

        if (!this._cursorUnfocusInhibited) {
            console.log('Breezy debug - inhibit_unfocus\n');
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
        if (this._cursorWatch != null) {
            this._cursorWatch.remove();
            this._cursorWatch = null;

            this._cursorTracker.disconnect(this._cursorChangedConnection);
            this._cursorChangedConnection = null;

            this._cursorTracker.disconnect(this._cursorVisibilityChangedConnection);
            this._cursorVisibilityChangedConnection = null;

            this._cursorTracker.disconnect(this._cursorPositionInvalidatedConnection);
            this._cursorPositionInvalidatedConnection = null;

            if (Clutter.Container === undefined) {
                this._mainActor.remove_child(this._cursorActor);
            } else {
                this._mainActor.remove_actor(this._cursorActor);
            }
        }

        if (this._cursorTracker.set_keep_focus_while_hidden) {
            this._cursorTracker.set_keep_focus_while_hidden(false);
        }

        if (this._cursorUnfocusInhibited) {
            console.log('Breezy debug - uninhibit_unfocus\n');
            this._cursorSeat.uninhibit_unfocus();
            this._cursorUnfocusInhibited = false;
        }
    }

    _updateMousePosition(x, y) {
        this._cursorActor.set_position(x, y);
    }

    _updateMouseSprite() {
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
        this._mainActor.set_child_above_sibling(this._cursorActor, null);
        this._cursorTrackerSetPointerVisibleBound(false);

        // some other processes are uninhibiting when they shouldn't, so we need to re-inhibit here
        if (!this._cursorSeat.is_unfocus_inhibited() && this._cursorUnfocusInhibited) {
            console.log('Breezy debug - reinhibiting\n');
            this._cursorSeat.inhibit_unfocus();
        }
    }
}