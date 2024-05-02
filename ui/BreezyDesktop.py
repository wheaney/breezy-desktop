import gi
import sys
import threading

gi.require_version("Gtk", "4.0")
gi.require_version('Adw', '1')

from gi.repository import Adw, Gio, Gtk

from XRDriverIPC import XRDriverIPC
from ShortcutDialog import bind_shortcut_settings

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class MainWindow(Gtk.ApplicationWindow):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.set_title("Breezy Desktop")

        builder = Gtk.Builder()
        builder.add_from_file("./breezy-desktop.ui")
        self.set_child(builder.get_object("main"))
        self.connected_device_info = builder.get_object("connected-device-info")
        self.connected_device_label = builder.get_object("connected-device-label")
        self.connected_device_settings = builder.get_object("connected-device-settings")
        self.connected_device_shortcuts = builder.get_object("connected-device-shortcuts")
        self.no_connected_device = builder.get_object("no-connected-device")

        self.settings = Gio.Settings.new_with_path("org.gnome.shell.extensions.breezy-desktop", "/org/gnome/shell/extensions/breezy-desktop/")
        self.ipc = XRDriverIPC(logger = Logger())
        self._refresh_state()

        bind_shortcut_settings(self, self.settings, [
            builder.get_object('reassign-recenter-display-shortcut-button'),
            builder.get_object('reassign-toggle-display-distance-shortcut-button'),
        ])

        self.bind_set_distance_toggle([
            builder.get_object('set-toggle-display-distance-start-button'), 
            builder.get_object('set-toggle-display-distance-end-button')
        ])
        display_distance_slider = builder.get_object('display-distance-slider')
        self.settings.bind('display-distance', display_distance_slider, 'value', Gio.SettingsBindFlags.DEFAULT)

        effect_enable_switch = builder.get_object('effect-enable')
        self.settings.bind('effect-enable', effect_enable_switch, 'active', Gio.SettingsBindFlags.DEFAULT)

    def _refresh_state(self):
        self.state = self.ipc.retrieve_driver_state()
        if self.state.get('connected_device_brand') and self.state.get('connected_device_model'):
            self.connected_device_info.set_visible(True)
            self.connected_device_settings.set_visible(True)
            self.connected_device_shortcuts.set_visible(True)
            self.no_connected_device.set_visible(False)
            self.connected_device_label.set_markup(f"<b>{self.state['connected_device_brand']} {self.state['connected_device_model']}</b>")
        else:
            self.connected_device_info.set_visible(False)
            self.connected_device_settings.set_visible(False)
            self.connected_device_shortcuts.set_visible(False)
            self.no_connected_device.set_visible(True)
        threading.Timer(1.0, self._refresh_state).start()


    def bind_set_distance_toggle(self, widgets):
        for widget in widgets:
            widget.connect('clicked', lambda *args, widget=widget: on_set_display_distance_toggle(self.settings, widget))
            reload_display_distance_toggle_button(self.settings, widget)

def reload_display_distance_toggle_button(settings, widget):
    distance = settings.get_double(widget.get_name())
    if distance: widget.set_label(str(distance))

def on_set_display_distance_toggle(settings, widget):
    distance = settings.get_double('display-distance')
    settings.set_double(widget.get_name(), distance)
    reload_display_distance_toggle_button(settings, widget)

class BreezyDesktop(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.connect('activate', self.on_activate)

    def on_activate(self, app):
        self.win = MainWindow(application=app)
        self.win.present()        

app = BreezyDesktop(application_id="com.example.GtkApplication")
app.run(sys.argv)