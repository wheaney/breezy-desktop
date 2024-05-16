import threading
from gi.repository import GObject
from .xrdriveripc import XRDriverIPC

class Logger:
    def info(self, message):
        print(message)

    def error(self, message):
        print(message)

class StateManager(GObject.GObject):
    __gsignals__ = {
        'device-update': (GObject.SIGNAL_RUN_FIRST, None, (str,))
    }

    __gproperties__ = {
        'follow-mode': (bool, 'Follow Mode', 'Whether the follow mode is enabled', False, GObject.ParamFlags.READWRITE)
    }

    _instance = None

    @staticmethod
    def get_instance():
        if not StateManager._instance:
            StateManager._instance = StateManager()

        return StateManager._instance
        
    @staticmethod
    def destroy_instance():
        if StateManager._instance:
            StateManager._instance.stop()
            StateManager._instance = None

    @staticmethod
    def device_name(state):
        if state.get('connected_device_brand') and state.get('connected_device_model'):
            return f"{state['connected_device_brand']} {state['connected_device_model']}"

        return None

    def __init__(self):
        GObject.GObject.__init__(self)
        self.ipc = XRDriverIPC.get_instance()
        self.connected_device_name = None

        self.start()

    def start(self):
        self.running = True
        self._refresh_state()

    def stop(self):
        self.running = False

    def _refresh_state(self):
        self.state = self.ipc.retrieve_driver_state()
        new_device_name = StateManager.device_name(self.state)
        if self.connected_device_name != new_device_name:
            self.connected_device_name = new_device_name
            self.emit('device-update', self.connected_device_name)

        self.set_property('follow-mode', self.state.get('breezy_desktop_smooth_follow_enabled'))

        if self.running: threading.Timer(1.0, self._refresh_state).start()

    def do_set_property(self, prop, value):
        if prop.name == 'follow-mode':
            self.follow_mode = value

    def do_get_property(self, prop):
        if prop.name == 'follow-mode':
            return self.follow_mode