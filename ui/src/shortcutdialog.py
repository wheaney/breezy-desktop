from gi.repository import Gtk, Gdk
import gettext

_ = gettext.gettext

from .settingsmanager import SettingsManager

# ported from https://github.com/velitasali/gnome-shell-extension-awesome-tiles
@Gtk.Template(resource_path='/com/xronlinux/BreezyDesktop/gtk/shortcut-dialog.ui')
class ShortcutDialog(Gtk.Dialog):
    __gtype_name__ = 'ShortcutDialog'

    event_controller = Gtk.Template.Child()

    def __init__(self, settings_key):
        super(Gtk.Dialog, self).__init__()
        self.init_template()

        self.settings_key = settings_key
        self.key_pressed_connect_id = self.event_controller.connect('key-pressed', self._on_key_pressed)

    def _on_key_pressed(self, widget, keyval, keycode, state):
        mask = state & Gtk.accelerator_get_default_mod_mask()
        mask &= ~Gdk.ModifierType.LOCK_MASK

        done = True
        if mask == 0 and keyval == Gdk.KEY_Escape:
            self.visible = False
        elif keyval == Gdk.KEY_BackSpace:
            SettingsManager.get_instance().settings.set_strv(self.settings_key, [])
            self.close()
        elif is_binding_valid(mask, keycode, keyval) and is_accel_valid(state, keyval):
            binding = Gtk.accelerator_name_with_keycode(
                None,
                keyval,
                keycode,
                state
            )
            label = Gtk.accelerator_get_label(keyval, state)

            # hacky way to store the label, causes warnings from the WM
            SettingsManager.get_instance().settings.set_strv(self.settings_key, [binding])

            self.close()
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

def bind_shortcut_settings(window, widget_tuples):
    for widget_tuple in widget_tuples:
        widget, label = widget_tuple
        SettingsManager.get_instance().settings.connect('changed::' + widget.get_name(), 
                                                        lambda *args, widget=widget, label=label: reload_shortcut_widget(widget, label))
        widget.connect('clicked', lambda *args, widget=widget: on_assign_shortcut(window, widget))

    reload_shortcut_widgets(widget_tuples)

def on_assign_shortcut(window, widget):
    dialog = ShortcutDialog(widget.get_name())
    dialog.set_transient_for(widget.get_ancestor(Gtk.Window))
    dialog.present()

def reload_shortcut_widget(widget, label):
    shortcut = SettingsManager.get_instance().settings.get_strv(widget.get_name())
    label.set_accelerator(shortcut[0] if len(shortcut) > 0 else _('Disabled'))

def reload_shortcut_widgets(widget_tuples):
    for widget_tuple in widget_tuples:
        widget, label = widget_tuple
        reload_shortcut_widget(widget, label)