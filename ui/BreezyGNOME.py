import gi
import sys

gi.require_version("Gtk", "4.0")
gi.require_version('Adw', '1')

from gi.repository import Gio
from gi.repository import Gtk, Adw

from XRDriverIPC import XRDriverIPC

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class MainWindow(Gtk.ApplicationWindow):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.settings = Gio.Settings.new_with_path("org.gnome.shell.extensions.breezy-desktop", "/org/gnome/shell/extensions/breezy-desktop/")

        self.set_default_size(600, 250)
        self.set_title("Breezy GNOME")

        self.box1 = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.set_child(self.box1)

        self.button = Gtk.Button(label="Hello")
        self.box1.append(self.button)
        self.button.connect('clicked', self.on_button_clicked)

        self.slider = Gtk.Scale()
        self.slider.set_digits(2)  # Number of decimal places to use
        self.slider.set_range(0.2, 2.5)
        self.slider.set_draw_value(True)  # Show a label with current value
        self.slider.set_value(1.0)  # Sets the current value/position
        self.box1.append(self.slider)

        self.ipc = XRDriverIPC(logger = Logger())
        
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