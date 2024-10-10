const Cogl = imports.gi.Cogl;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Meta = imports.gi.Meta;

const DEFAULT_BACKGROUND_COLOR = new Cogl.Color({red: 40, green: 40, blue: 40, alpha: 255});

let _systemBackground;

var SystemBackground = GObject.registerClass({
    Signals: {'loaded': {}},
}, class SystemBackground extends Meta.BackgroundActor {
    _init() {
        if (_systemBackground == null) {
            _systemBackground = new Meta.Background({meta_display: global.display});
            _systemBackground.set_color(DEFAULT_BACKGROUND_COLOR);
        }

        super._init({
            meta_display: global.display,
            monitor: 0,
        });
        this.content.background = _systemBackground;

        let id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.emit('loaded');
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(id, '[gnome-shell] SystemBackground.loaded');
    }
});
