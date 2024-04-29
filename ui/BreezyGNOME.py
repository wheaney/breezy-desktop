import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gio
from gi.repository import Gtk

from XRDriverIPC import XRDriverIPC

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class MyWindow(Gtk.Window):
    def __init__(self):
        super().__init__(title="Hello World")

        self.button = Gtk.Button(label="Click Here")
        self.button.connect("clicked", self.on_button_clicked)
        self.add(self.button)

        self.ipc = XRDriverIPC(logger = Logger())

    def on_button_clicked(self, widget):
        print("Hello World")

        settings = Gio.Settings.new_with_path("org.gnome.shell.extensions.breezy-desktop", "/org/gnome/shell/extensions/breezy-desktop/")
        settings.set_strv('shortcut-change-distance', ['<Control><Super>Return'])
        print(settings.get_strv('shortcut-change-distance'))

        config = self.ipc.retrieve_config()
        print(config)


win = MyWindow()
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()