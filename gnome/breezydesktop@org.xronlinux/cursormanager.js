

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import { MouseSpriteContent } from './cursor.js';

// Taken from https://github.com/jkitching/soft-brightness-plus
export class CursorManager {
    constructor(logger, settings, mainActor) {
        this._logger = logger;
        this._settings = settings;
        this._mainActor = mainActor;

        this._enableTimeoutId = null;
        this._changeHookFn = null;

        this._cloneMouseSetting = null;
        this._cloneMouseSettingChangedConnection = null;

        // Set/destroyed by _enableCloningMouse/_disableCloningMouse
        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorWatcher = null;
        this._cursorSeat = null;
        // Set/destroyed by _startCloningMouse / _stopCloningMouse
        this._cursorWatch = null;
        this._cursorChangedConnection = null;
        this._cursorVisibilityChangedConnection = null;
        // Set/destroyed by _delayedSetPointerInvisible/_clearDelayedSetPointerInvibleCallbacks
        this._delayedSetPointerInvisibleIdleSource = null;
    }

    setChangeHook(fn) {
        this._changeHookFn = fn;
    }

    enable() {
        // First 500ms: For some reason, starting the mouse cloning at this
        // stage fails when gnome-shell is restarting on x11 and the mouse
        // listener doesn't receive any events.  Adding a small delay before
        // starting the whole mouse cloning business helps.
        this._enableTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            // Wait 500ms before starting to check for the _brightness object.
            this._enableTimeoutId = null;
            this._enable();
            // Ensure proper stacking order for cursor and overlay.
            if (this._changeHookFn !== null) {
                this._changeHookFn();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _enable() {
        this._cloneMouseSetting = true; // this._settings.get_boolean('clone-mouse');
        this._enableCloningMouse();
        // this._cloneMouseSettingChangedConnection = this._settings.connect('changed::clone-mouse', this._on_clone_mouse_change.bind(this));
    }

    disable() {
        // If _enableTimeoutId is non-null, _enable() has not run yet, and will
        // not run.  Do not run _disable() in this case.
        GLib.source_remove(this._enableTimeoutId);
        if (this._enableTimeoutId !== null) {
            return;
        }
        this._enableTimeoutId = null;
        this._changeHookFn = null;

        // this._settings.disconnect(this._cloneMouseSettingChangedConnection);
        // this._cloneMouseSettingChangedConnection = null;
        this._disableCloningMouse();
        this._cloneMouseSetting = null;

        // Set/destroyed by _enableCloningMouse/_disableCloningMouse
        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorWatcher = null;
        this._cursorSeat = null;
        // Set/destroyed by _startCloningMouse / _stopCloningMouse
        this._cursorWatch = null;
        this._cursorChangedConnection = null;
        this._cursorVisibilityChangedConnection = null;
        // Set/destroyed by _delayedSetPointerInvisible/_clearDelayedSetPointerInvibleCallbacks
        this._delayedSetPointerInvisibleIdleSource = null;
    }

    startCloning() {
        if (this._cursorWantedVisible) {
            this._startCloningMouse();
        }
    }

    stopCloning() {
        this._stopCloningShowMouse();
    }

    hidePointer() {
        this._setPointerVisible(false);
    }

    _isMouseClonable() {
        return this._cloneMouseSetting;
    }

    _on_clone_mouse_change() {
        const cloneMouse = true; // this._settings.get_boolean('clone-mouse');
        if (cloneMouse == this._cloneMouseSetting) {
            this._logger.log_debug('_on_clone_mouse_change(): no setting change, no change');
            return;
        }
        if (cloneMouse) {
            // Starting to clone mouse
            this._logger.log_debug('_on_clone_mouse_change(): starting mouse cloning');
            this._cloneMouseSetting = true;
            this._enableCloningMouse();
            if (this._changeHookFn !== null) {
                this._changeHookFn();
            }
        } else {
            this._logger.log_debug('_on_clone_mouse_change(): stopping mouse cloning');
            this._disableCloningMouse();
            this._cloneMouseSetting = false;
        }
    }

    _enableCloningMouse() {
        if (!this._isMouseClonable()) {
            return;
        }
        this._logger.log_debug('_enableCloningMouse()');

        this._cursorWantedVisible = true;
        this._cursorTracker = Meta.CursorTracker.get_for_display(global.display);
        this._cursorTrackerSetPointerVisible = Meta.CursorTracker.prototype.set_pointer_visible;
        this._cursorTrackerSetPointerVisibleBound = this._cursorTrackerSetPointerVisible.bind(this._cursorTracker);
        Meta.CursorTracker.prototype.set_pointer_visible = this._cursorTrackerSetPointerVisibleReplacement.bind(this);

        this._cursorSprite = new Clutter.Actor({ request_mode: Clutter.RequestMode.CONTENT_SIZE });
        this._cursorSprite.content = new MouseSpriteContent();

        this._cursorActor = new Clutter.Actor();
        this._cursorActor.add_actor(this._cursorSprite);
        this._cursorWatcher = PointerWatcher.getPointerWatcher();
        this._cursorSeat = Clutter.get_default_backend().get_default_seat();
    }

    _disableCloningMouse() {
        if (!this._isMouseClonable()) {
            return;
        }
        this._stopCloningShowMouse();
        this._logger.log_debug('_disableCloningMouse()');

        Meta.CursorTracker.prototype.set_pointer_visible = this._cursorTrackerSetPointerVisible;

        this._cursorWantedVisible = null;
        this._cursorTracker = null;
        this._cursorTrackerSetPointerVisible = null;
        this._cursorTrackerSetPointerVisibleBound = null;
        this._cursorSprite = null;
        this._cursorActor = null;
        this._cursorWatcher = null;
        this._cursorSeat = null;
    }

    _setPointerVisible(visible) {
        if (!this._isMouseClonable()) {
            return;
        }
        this._cursorTrackerSetPointerVisibleBound(visible);
    }

    _cursorTrackerSetPointerVisibleReplacement(visible) {
        if (visible) {
            this._startCloningMouse();
            // For some reason, exiting the magnifier causes the
            // stacking order for the cursor and overlay actors to be
            // swapped around.  Reassert stacking order whenever the
            // pointer should become visible again.
            if (this._changeHookFn !== null) {
                this._changeHookFn();
            }
        } else {
            this._stopCloningMouse();
            this._setPointerVisible(false);
        }
        this._cursorWantedVisible = visible;
    }

    _startCloningMouse() {
        if (!this._isMouseClonable()) {
            return;
        }
        this._logger.log_debug('_startCloningMouse()');
        if (this._cursorWatch == null) {
            this._mainActor.add_actor(this._cursorActor);
            this._cursorChangedConnection = this._cursorTracker.connect('cursor-changed', this._updateMouseSprite.bind(this));
            this._cursorVisibilityChangedConnection = this._cursorTracker.connect('visibility-changed', this._updateMouseSprite.bind(this));
            const interval = 1000 / 60;
            this._logger.log_debug('_startCloningMouse(): watch interval = ' + interval + ' ms');
            this._cursorWatch = this._cursorWatcher.addWatch(interval, this._updateMousePosition.bind(this));

            this._updateMouseSprite();
            this._updateMousePosition();
        }
        this._setPointerVisible(false);

        if (this._cursorTracker.set_keep_focus_while_hidden) {
            this._cursorTracker.set_keep_focus_while_hidden(true);
        }

        if (!this._cursorSeat.is_unfocus_inhibited()) {
            this._cursorSeat.inhibit_unfocus();
        }
    }

    _stopCloningShowMouse() {
        if (!this._isMouseClonable()) {
            return;
        }
        this._logger.log_debug('_stopCloningShowMouse(), restoring cursor visibility to ' + this._cursorWantedVisible);
        this._stopCloningMouse();
        this._setPointerVisible(this._cursorWantedVisible);

        if (this._cursorTracker.set_keep_focus_while_hidden) {
            this._cursorTracker.set_keep_focus_while_hidden(false);
        }

        if (this._cursorSeat.is_unfocus_inhibited()) {
            this._cursorSeat.uninhibit_unfocus();
        }
    }

    _stopCloningMouse() {
        if (!this._isMouseClonable()) {
            return;
        }
        if (this._cursorWatch != null) {
            this._logger.log_debug('_stopCloningMouse()');

            this._cursorWatch.remove();
            this._cursorWatch = null;

            this._cursorTracker.disconnect(this._cursorChangedConnection);
            this._cursorChangedConnection = null;

            this._cursorTracker.disconnect(this._cursorVisibilityChangedConnection);
            this._cursorVisibilityChangedConnection = null;

            this._mainActor.remove_actor(this._cursorActor);
        }

        this._clearDelayedSetPointerInvibleCallbacks();
    }

    _updateMousePosition(actor, event) {
        const [x, y, mask] = global.get_pointer();
        this._cursorActor.set_position(x, y);
        this._delayedSetPointerInvisible();
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
        this._delayedSetPointerInvisible();
    }

    _delayedSetPointerInvisible() {
        this._setPointerVisible(false);

        // Clear the pointer upon entering idle loop
        if (this._delayedSetPointerInvisibleIdleSource == null) {
            this._delayedSetPointerInvisibleIdleSource = GLib.idle_add(
                GLib.PRIORITY_DEFAULT,
                () => {
                    this._setPointerVisible(false);
                    this._delayedSetPointerInvisibleIdleSource = null;
                    return false;
                }
            );
        }
    }

    _clearDelayedSetPointerInvibleCallbacks() {
        if (this._delayedSetPointerInvisibleIdleSource != null) {
            GLib.source_remove(this._delayedSetPointerInvisibleIdleSource);
            this._delayedSetPointerInvisibleIdleSource = null;
        }
    }
}