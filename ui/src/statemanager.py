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
        'device_update': (GObject.SIGNAL_RUN_FIRST, None, (str,))
    }

    _instance = None

    @staticmethod
    def get_instance():
        if not StateManager._instance:
            StateManager._instance = StateManager()

        return StateManager._instance

    @staticmethod
    def device_name(state):
        if state.get('connected_device_brand') and state.get('connected_device_model'):
            return f"{state['connected_device_brand']} {state['connected_device_model']}"

        return None

    def __init__(self):
        GObject.GObject.__init__(self)
        self.ipc = XRDriverIPC(logger = Logger(), user="wayne", user_home="/home/wayne")
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
            self.emit('device_update', self.connected_device_name)

        if self.running: threading.Timer(1.0, self._refresh_state).start()
