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

        this._changeHookFn = null;

        // Set/destroyed by _enableCloningMouse/_disableCloningMouse
        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorSeat = null;
        this._cursorUnfocusInhibited = false;

        // Set/destroyed by _startCloningMouse / _stopCloningMouse
        this._cursorChangedConnection = null;
        this._cursorVisibilityChangedConnection = null;
        this._moveToTopTimeout = null;
        this._redraw_timeline = null;
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
        if (Clutter.Container === undefined) {
            this._mainActor.add_child(this._cursorActor);
        } else {
            this._mainActor.add_actor(this._cursorActor);
        }
        this._cursorChangedConnection = this._cursorTracker.connect('cursor-changed', this._updateMouseSprite.bind(this));
        this._cursorVisibilityChangedConnection = this._cursorTracker.connect('visibility-changed', this._handleVisibilityChanged.bind(this));

        // Some elements will occasionally appear above the cursor, so we periodically reset the actor stacking.
        // This could theoretically be fixed "better" by attaching to all events that might affect actor ordering,
        // but finding a comprehensive list is difficult and not future proof. So this ugly solution helps us
        // catch everything.
        this._moveToTopTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, (() => {
            this._moveToTop()
            return GLib.SOURCE_CONTINUE;
        }).bind(this));

        const refreshInterval = 1000 / this._refreshRate;

        // we'll force repaint the cursor every frame,
        // this keeps the cursor up-to-date and is sort of a hack that's a critical part of making sure
        // the XR Effect refreshes even if nothing on-screen has changed (bypass the texture caching)
        this._redraw_timeline = Clutter.Timeline.new_for_actor(this._cursorActor, refreshInterval);
        this._redraw_timeline.set_repeat_count(-1);

        var on = false;
        this._redraw_timeline.connect('completed', (() => {
            this._cursorActor.set_opacity(this._cursorActor.opacity + (on ? 1 : -1));
            const [x, y] = global.get_pointer();
            this._cursorActor.set_position(x, y);
            on = !on;
        }).bind(this));
        this._redraw_timeline.start();

        this._updateMouseSprite();

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
        if (this._redraw_timeline) {
            this._redraw_timeline.stop();
            this._redraw_timeline = null;
        }

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

        if (this._moveToTopTimeout) {
            GLib.source_remove(this._moveToTopTimeout);
            this._moveToTopTimeout = null;
        }

        if (this._cursorUnfocusInhibited) {
            Globals.logger.log_debug('uninhibit_unfocus');
            this._cursorSeat.uninhibit_unfocus();
            this._cursorUnfocusInhibited = false;
        }
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

        // some other processes are uninhibiting when they shouldn't, so we need to re-inhibit here
        if (!this._cursorSeat.is_unfocus_inhibited() && this._cursorUnfocusInhibited) {
            Globals.logger.log_debug('reinhibiting');
            this._cursorSeat.inhibit_unfocus();
        }
    }

    _handleVisibilityChanged() {
        this._cursorTrackerSetPointerVisibleBound(false);
    }

    _moveToTop() {
        this._mainActor.set_child_above_sibling(this._cursorActor, null);
    }
}