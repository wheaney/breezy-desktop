
from gi.repository import Gio

class SettingsManager:
    _instance = None

    @staticmethod
    def get_instance():
        if not SettingsManager._instance:
            SettingsManager._instance = SettingsManager()

        return SettingsManager._instance

    def __init__(self):
        self.settings = Gio.Settings.new_with_path("com.xronlinux.BreezyDesktop", "/com/xronlinux/BreezyDesktop/")
