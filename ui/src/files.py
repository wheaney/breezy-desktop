

import os

def get_user_home():
    return os.path.expanduser('~')

def get_config_dir():
    config_home = os.environ.get('XDG_CONFIG_HOME', '~/.config')
    return os.path.expanduser(config_home)

def get_state_dir():
    state_home = os.environ.get('XDG_STATE_HOME', '~/.local/state')
    return os.path.join(os.path.expanduser(state_home), 'breezy_gnome')

def get_data_home():
    data_home = os.environ.get('XDG_DATA_HOME', '~/.local/share')
    return os.path.expanduser(data_home)

def get_bin_home():
    bin_home = os.environ.get('XDG_BIN_HOME', '~/.local/bin')
    return os.path.expanduser(bin_home)