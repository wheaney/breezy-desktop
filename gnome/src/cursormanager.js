const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const PointerWatcher = imports.ui.pointerWatcher;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Globals = Me.imports.globals;
const { MouseSpriteContent } = Me.imports.cursor;

// Taken from https://github.com/jkitching/soft-brightness-plus
var CursorManager = class CursorManager {
    constructor(overlay, refreshRate) {
        this._overlay = overlay;
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
        this._cursorTracker = Meta.CursorTracker.get_for_display(global.display);

        this._mouseSprite = new Clutter.Actor({ request_mode: Clutter.RequestMode.CONTENT_SIZE });
        this._mouseSprite.content = new MouseSpriteContent();

        this._cursorRoot = new Clutter.Actor();
        this._cursorRoot.add_child(this._mouseSprite);
    }

    _hideSystemCursor() {
        this._systemCursorShown = false;

        this._cursorRoot.show();

        if (!this._cursorUnfocusInhibited) {
            Clutter.get_default_backend().get_default_seat().inhibit_unfocus();
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
        this._overlay.mainActor().add_child(this._cursorRoot);

        this._updateMouseSprite();
        this._cursorTracker.connectObject('cursor-changed', this._updateMouseSprite.bind(this), this);
        Meta.disable_unredirect_for_display(global.display);

        // cap the refresh rate for performance reasons
        const interval = 1000.0 / Math.min(this._refreshRate, 60);

        this._cursorWatch = PointerWatcher.getPointerWatcher().addWatch(interval, this._updateMousePosition.bind(this));
        this._updateMousePosition();

        const [xMouse, yMouse] = global.get_pointer();
        if (this._overlay.isWithinBounds(xMouse, yMouse)) this._hideSystemCursor();
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

        this._cursorTracker.disconnectObject(this);
        this._mouseSprite.content.texture = null;
        Meta.enable_unredirect_for_display(global.display);

        if (this._cursorTracker) this._cursorTracker.disconnectObject(this);
        if (this._mouseSprite?.content?.texture) this._mouseSprite.content.texture = null;
        Meta.enable_unredirect_for_display(global.display);
        
        if (this._cursorRoot) this._overlay.mainActor().remove_child(this._cursorRoot);
        if (!this._systemCursorShown) this._showSystemCursor();
    }

    _showSystemCursor() {
        this._systemCursorShown = true;

        if (this._cursorRoot) this._cursorRoot.hide();

        if (this._cursorUnfocusInhibited) {
            Clutter.get_default_backend().get_default_seat().uninhibit_unfocus();
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
        const inBounds = this._overlay.isWithinBounds(xMouse, yMouse);
        const [xRel, yRel] = this._overlay.getRelativePosition(xMouse, yMouse);

        if (xRel === this.xMouse && yRel === this.yMouse)
            return;

        if (inBounds) {
            if (this._systemCursorShown) this._hideSystemCursor();
            this._cursorRoot.set_position(xRel, yRel);
        } else if (!this._systemCursorShown && !inBounds) {
            this._showSystemCursor();
        }

        this.xMouse = xRel;
        this.yMouse = yRel;

        const seat = Clutter.get_default_backend().get_default_seat();
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
}