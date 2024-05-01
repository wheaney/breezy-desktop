import gi
import sys

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
        self.set_title("Breezy GNOME")

        # grab ui from breezy-desktop.ui file and render it
        builder = Gtk.Builder()
        builder.add_from_file("./breezy-desktop.ui")
        self.set_child(builder.get_object("main"))

        self.settings = Gio.Settings.new_with_path("org.gnome.shell.extensions.breezy-desktop", "/org/gnome/shell/extensions/breezy-desktop/")
        self.ipc = XRDriverIPC(logger = Logger())

        bind_shortcut_settings(self, self.settings, [
            builder.get_object('reassign-recenter-display-shortcut-button'),
            builder.get_object('reassign-toggle-display-distance-shortcut-button'),
        ])
    
    def on_button_clicked(self, widget):
        print("Hello World")

        self.settings.set_strv('shortcut-change-distance', ['<Control><Super>Return'])
        print(self.settings.get_strv('shortcut-change-distance'))

        config = self.ipc.retrieve_config()
        print(config)

class MyApp(Adw.Application):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.connect('activate', self.on_activate)

    def on_activate(self, app):
        self.win = MainWindow(application=app)
        self.win.present()        

app = MyApp(application_id="com.example.GtkApplication")
app.run(sys.argv)