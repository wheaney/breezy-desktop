import json
import os
import pwd
import stat
import subprocess
import time

# write-only file that the driver reads (but never writes) to get user-specified control flags
CONTROL_FLAGS_FILE_PATH = '/dev/shm/xr_driver_control'

# read-only file that the driver writes (but never reads) to with its current state
DRIVER_STATE_FILE_PATH = '/dev/shm/xr_driver_state'

CONTROL_FLAGS = ['recenter_screen', 'recalibrate', 'sbs_mode', 'refresh_device_license']
SBS_MODE_VALUES = ['unset', 'enable', 'disable']
KNOWN_EXTERNAL_MODES = ['virtual_display', 'sideview', 'none']

def parse_boolean(value, default):
    if not value:
        return default

    return value.lower() == 'true'


def parse_int(value, default):
    return int(value) if value.isdigit() else default

def parse_float(value, default):
    try:
        return float(value)
    except ValueError:
        return default
    
def parse_string(value, default):
    return value if value else default


CONFIG_PARSER_INDEX = 0
CONFIG_DEFAULT_VALUE_INDEX = 1
CONFIG_ENTRIES = {
    'disabled': [parse_boolean, True],
    'output_mode': [parse_string, 'mouse'],
    'external_mode': [parse_string, 'none'],
    'mouse_sensitivity': [parse_int, 30],
    'display_zoom': [parse_float, 1.0],
    'look_ahead': [parse_int, 0],
    'sbs_display_size': [parse_float, 1.0],
    'sbs_display_distance': [parse_float, 1.0],
    'sbs_content': [parse_boolean, False],
    'sbs_mode_stretched': [parse_boolean, False],
    'sideview_position': [parse_string, 'center'],
    'sideview_display_size': [parse_float, 1.0],
    'virtual_display_smooth_follow_enabled': [parse_boolean, False],
    'sideview_smooth_follow_enabled': [parse_boolean, False]
}

class XRDriverIPC:
    def __init__(self, logger, user=None, user_home=None):
        self.breezy_installed = False
        self.breezy_installing = False
        self.user = user if user else pwd.getpwuid( os.getuid() )[0]
        self.user_home = user_home if user_home else os.path.expanduser("~")
        self.config_file_path = os.path.join(self.user_home, ".xreal_driver_config")
        self.config_script_path = os.path.join(self.user_home, "bin/xreal_driver_config")
        self.logger = logger

    def config_to_headset_mode(self, config):
        if config['disabled'] or (config['output_mode'] == "external_only" and config['external_mode'] == 'none'):
            return "disabled"
        if config['output_mode'] == "external_only" and config['external_mode'] != 'none':
            if config['external_mode'] in KNOWN_EXTERNAL_MODES:
                return config['external_mode']
            
            return "other"
        
        return "vr_lite"
        
    def retrieve_config(self):
        config = {}
        for key, value in CONFIG_ENTRIES.items():
            config[key] = value[CONFIG_DEFAULT_VALUE_INDEX]

        try:
            with open(self.config_file_path, 'r') as f:
                for line in f:
                    try:
                        if not line.strip():
                            continue

                        key, value = line.strip().split('=')
                        if key in CONFIG_ENTRIES:
                            config[key] = CONFIG_ENTRIES[key][CONFIG_PARSER_INDEX](value)
                    except Exception as e:
                        self.logger.error(f"Error parsing line {line}: {e}")
        except FileNotFoundError as e:
            self.logger.error(f"Config file not found {e}")
            return config
        
        # like a SQL "view," these are computed values that are commonly used in the UI
        config['ui_view'] = {
            'headset_mode': self.config_to_headset_mode(config),
            'is_joystick_mode': config['output_mode'] == 'joystick'
        }

        return config
    
    def headset_mode_to_config(self, headset_mode, joystick_mode):
        if headset_mode == "virtual_display":
            return { 'disabled': False, 'output_mode': 'external_only', 'external_mode': 'virtual_display' }
        if headset_mode == "vr_lite":
            return { 'disabled': False, 'output_mode': 'joystick' if joystick_mode else 'mouse', 'external_mode': 'none' }
        if headset_mode == "sideview":
            return { 'disabled': False, 'output_mode': 'external_only', 'external_mode': 'sideview' }
        if headset_mode == "other":
            # leave external_mode unset so it doesn't override the current value
            return { 'disabled': False, 'output_mode': 'external_only' }
        if headset_mode == "disabled":
            return { 'disabled': True, 'external_mode': 'none' }

        return { }

    def write_config(self, config):
        try:
            output = ""

            # remove the UI's "view" data, translate back to config values, and merge them in
            view = config.pop('ui_view', None)
            config.update(self.headset_mode_to_config(view['headset_mode'], view['is_joystick_mode']))

            for key, value in config.items():
                if key != "updated":
                    if isinstance(value, bool):
                        output += f'{key}={str(value).lower()}\n'
                    elif isinstance(value, int):
                        output += f'{key}={value}\n'
                    elif isinstance(value, list):
                        output += f'{key}={",".join(value)}\n'
                    else:
                        output += f'{key}={value}\n'

            temp_file = "temp.txt"

            # Write to a temporary file
            with open(temp_file, 'w') as f:
                f.write(output)

            # Atomically replace the old config file with the new one
            os.replace(temp_file, self.config_file_path)
            os.chmod(self.config_file_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IWGRP | stat.S_IROTH | stat.S_IWOTH)
        except Exception as e:
            self.logger.error(f"Error writing config {e}")

    def write_control_flags(self, control_flags):
        try:
            output = ""
            for key, value in control_flags.items():
                if key in CONTROL_FLAGS:
                    if key == 'sbs_mode':
                        if value not in SBS_MODE_VALUES:
                            self.logger.error(f"Invalid value {value} for sbs_mode flag")
                            continue
                    elif not isinstance(value, bool):
                        self.logger.error(f"Invalid value {value} for {key} flag")
                        continue
                    output += f'{key}={str(value).lower()}\n'

            with open(CONTROL_FLAGS_FILE_PATH, 'w') as f:
                f.write(output)
        except Exception as e:
            self.logger.error(f"Error writing control flags {e}")

    def retrieve_driver_state(self):
        state = {}
        state['heartbeat'] = 0
        state['connected_device_brand'] = None
        state['connected_device_model'] = None
        state['calibration_setup'] = "AUTOMATIC"
        state['calibration_state'] = "NOT_CALIBRATED"
        state['sbs_mode_enabled'] = False
        state['sbs_mode_supported'] = False
        state['firmware_update_recommended'] = False
        state['device_license'] = {}

        try:
            with open(DRIVER_STATE_FILE_PATH, 'r') as f:
                output = f.read()
                for line in output.splitlines():
                    try:
                        if not line.strip():
                            continue

                        key, value = line.strip().split('=')
                        if key == 'heartbeat':
                            state[key] = parse_int(value, 0)
                        elif key in ['calibration_setup', 'calibration_state', 'connected_device_brand', 'connected_device_model']:
                            state[key] = value
                        elif key in ['sbs_mode_enabled', 'sbs_mode_supported', 'firmware_update_recommended']:
                            state[key] = parse_boolean(value, False)
                        elif key == 'device_license':
                            state[key] = json.loads(value)
                    except Exception as e:
                        self.logger.error(f"Error parsing key-value pair {key}={value}: {e}")
        except FileNotFoundError:
            pass

        # state is stale, just send the license
        if state['heartbeat'] == 0 or (time.time() - state['heartbeat']) > 5:
            return {
                'heartbeat': state['heartbeat'],
                'device_license': state['device_license']
            }

        return state

    async def request_token(self, email):
        self.logger.info(f"Requesting a new token for {email}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = self.user

        try:
            output = subprocess.check_output([self.config_script_path, "--request-token", email], stderr=subprocess.STDOUT, env=env_copy)
            return output.strip() == b"Token request sent"
        except subprocess.CalledProcessError as exc:
            self.logger.error(f"Error running config script {exc.output}")
            return False

    async def verify_token(self, token):
        self.logger.info(f"Verifying token {token}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = self.user

        try:
            output = subprocess.check_output([self.config_script_path, "--verify-token", token], stderr=subprocess.STDOUT, env=env_copy)
            return output.strip() == b"Token verified"
        except subprocess.CalledProcessError as exc:
            self.logger.error(f"Error running config script {exc.output}")
            return False