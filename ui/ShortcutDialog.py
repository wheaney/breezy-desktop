from gi.repository import Gtk, Gdk

# ported from https://github.com/velitasali/gnome-shell-extension-awesome-tiles
class ShortcutDialog:
    def __init__(self, settings, settings_key):
        self.settings = settings
        self.settings_key = settings_key

        self._builder = Gtk.Builder()
        self._builder.add_from_file('./shortcut-dialog.ui')

        self.widget = self._builder.get_object('dialog')

        self.event_controller = self._builder.get_object('event-controller')
        self.key_pressed_connect_id = self.event_controller.connect('key-pressed', self._on_key_pressed)

    def _on_key_pressed(self, widget, keyval, keycode, state):
        mask = state & Gtk.accelerator_get_default_mod_mask()
        mask &= ~Gdk.ModifierType.LOCK_MASK

        done = True
        if mask == 0 and keyval == Gdk.KEY_Escape:
            self.widget.visible = False
        elif keyval == Gdk.KEY_BackSpace:
            self.settings.set_strv(self.settings_key, [])
            self.widget.close()
        elif is_binding_valid(mask, keycode, keyval) and is_accel_valid(state, keyval):
            binding = Gtk.accelerator_name_with_keycode(
                None,
                keyval,
                keycode,
                state
            )
            label = Gtk.accelerator_get_label(keyval, state)
            self.settings.set_strv(self.settings_key, [binding, label])
            self.widget.close()
        else:
            done = False
        
        if done and self.key_pressed_connect_id:
            self.event_controller.disconnect(self.key_pressed_connect_id)
            self.key_pressed_connect_id = None

        return Gdk.EVENT_STOP

def is_binding_valid(mask, keycode, keyval):
    if mask == 0 or mask == Gdk.ModifierType.SHIFT_MASK and keycode != 0:
        if keyval >= Gdk.KEY_a and keyval <= Gdk.KEY_z or \
            keyval >= Gdk.KEY_A and keyval <= Gdk.KEY_Z or \
            keyval >= Gdk.KEY_0 and keyval <= Gdk.KEY_9 or \
            keyval >= Gdk.KEY_kana_fullstop and keyval <= Gdk.KEY_semivoicedsound or \
            keyval >= Gdk.KEY_Arabic_comma and keyval <= Gdk.KEY_Arabic_sukun or \
            keyval >= Gdk.KEY_Serbian_dje and keyval <= Gdk.KEY_Cyrillic_HARDSIGN or \
            keyval >= Gdk.KEY_Greek_ALPHAaccent and keyval <= Gdk.KEY_Greek_omega or \
            keyval >= Gdk.KEY_hebrew_doublelowline and keyval <= Gdk.KEY_hebrew_taf or \
            keyval >= Gdk.KEY_Thai_kokai and keyval <= Gdk.KEY_Thai_lekkao or \
            keyval >= Gdk.KEY_Hangul_Kiyeog and keyval <= Gdk.KEY_Hangul_J_YeorinHieuh or \
            keyval == Gdk.KEY_space and mask == 0 or \
            is_keyval_forbidden(keyval):
            return False
    return True

def is_keyval_forbidden(keyval):
    forbidden_keyvals = [
        Gdk.KEY_Home,
        Gdk.KEY_Left,
        Gdk.KEY_Up,
        Gdk.KEY_Right,
        Gdk.KEY_Down,
        Gdk.KEY_Page_Up,
        Gdk.KEY_Page_Down,
        Gdk.KEY_End,
        Gdk.KEY_Tab,
        Gdk.KEY_KP_Enter,
        Gdk.KEY_Return,
        Gdk.KEY_Mode_switch
    ]
    return keyval in forbidden_keyvals

def is_accel_valid(mask, keyval):
    return Gtk.accelerator_valid(keyval, mask) or (keyval == Gdk.KEY_Tab and mask != 0)

def bind_shortcut_settings(window, settings, widgets):
    for widget in widgets:
        settings.connect('changed::' + widget.get_name(), lambda *args, widget=widget: reload_shortcut_widget(settings, widget))
        widget.connect('clicked', lambda *args, widget=widget: on_assign_shortcut(window, settings, widget))

    reload_shortcut_widgets(settings, widgets)

def on_assign_shortcut(window, settings, widget):
    dialog = ShortcutDialog(settings, widget.get_name())
    dialog.widget.set_transient_for(window)
    dialog.widget.present()

def reload_shortcut_widget(settings, widget):
    shortcut = settings.get_strv(widget.get_name())
    widget.set_label(shortcut[1] if len(shortcut) > 1 else 'Disabled')

def reload_shortcut_widgets(settings, widgets):
    for widget in widgets:
        reload_shortcut_widget(settings, widget)