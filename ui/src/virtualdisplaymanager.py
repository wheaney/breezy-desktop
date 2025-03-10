import gi
import json
import os
import signal
import subprocess
import time
from pathlib import Path

import logging
logger = logging.getLogger('breezy_ui')

gi.require_version('GLib', '2.0')
from gi.repository import GLib, GObject

xdg_bin_home = os.getenv('XDG_BIN_HOME', os.path.join(os.path.expanduser('~'), '.local', 'bin'))
bindir = os.getenv('BINDIR', xdg_bin_home)

class VirtualDisplayManager(GObject.GObject):
    __gproperties__ = {
        'displays': (object, 'Displays', 'A list of the displays', GObject.ParamFlags.READWRITE)
    }
    _instance = None

    @staticmethod
    def get_instance():
        if not VirtualDisplayManager._instance:
            VirtualDisplayManager._instance = VirtualDisplayManager()

        return VirtualDisplayManager._instance

    def __init__(self):
        GObject.GObject.__init__(self)

        self.shm_path = Path("/dev/shm/breezy_virtual_displays.json")
        self._load_displays()
        self._prune_dead_display_processes()

        GLib.timeout_add_seconds(15, self._prune_dead_display_processes)

    def _process_dead(self, pid):
        if (not os.path.exists(f"/proc/{pid}")):
            return True

        try:
            if (os.waitpid(pid, os.WNOHANG) == (pid, 0)):
                return True
        except ChildProcessError:
            # process isn't tied to the current process, it's not dead if it's still open
            return False

        return False

    def _prune_dead_display_processes(self):
        new_displays = [disp for disp in self.displays if not self._process_dead(disp['pid'])]
        if new_displays != self.displays:
            self.set_property('displays', new_displays)
            self._save_processes()

        return GLib.SOURCE_CONTINUE
    
    def create_virtual_display(self, width, height, framerate):
        try:
            process = subprocess.Popen(
                [f"{bindir}/virtualdisplay", "--width", str(int(round(width))), "--height", str(int(round(height))), "--framerate", str(framerate)],
                start_new_session=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            if process.returncode is not None:
                logger.error(f"Failed to create virtual display: {process.stderr.read()}")
                return
            
            self.displays.append({
                'pid': process.pid,
                'width': width,
                'height': height
            })
            self.set_property('displays', self.displays)
            self._save_processes()
        except Exception as e:
            logger.error(f"Failed to create virtual display: {e}")
    
    def destroy_virtual_display(self, pid: str) -> bool:
        try:
            # Send SIGTERM to allow graceful shutdown
            os.killpg(pid, signal.SIGTERM)
            self.set_property('displays', [disp for disp in self.displays if disp['pid'] != pid])
            self._save_processes()
            return True
        except ProcessLookupError:
            # Process already gone, delete pid from list
            self.set_property('displays', [disp for disp in self.displays if disp['pid'] != pid])
            self._save_processes()
            return True
        except Exception as e:
            logger.error(f"Failed to kill process {pid}: {e}")
            return False

    def _save_processes(self):
        with open(self.shm_path, 'w') as f:
            json.dump(self.displays, f)
    
    def _load_displays(self):
        displays = []
        if self.shm_path.exists():
            try:
                with open(self.shm_path, 'r') as f:
                    displays = json.load(f)
            except Exception:
                displays = []

        self.set_property('displays', displays)

    def do_set_property(self, prop, value):
        if prop.name == 'displays':
            self.displays = value

    def do_get_property(self, prop):
        if prop.name == 'displays':
            return self.displays