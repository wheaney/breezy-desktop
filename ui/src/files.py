

import os

def get_user_home():
    return os.path.expanduser('~')

def get_config_dir():
    config_home = os.environ.get('XDG_CONFIG_HOME', '~/.config')
    return os.path.expanduser(config_home)

def get_state_dir():
    # imported lazily to avoid an import cycle (runtime discovery imports
    # modules that import this one)
    from .runtime import runtime_namespace
    state_home = os.environ.get('XDG_STATE_HOME', '~/.local/state')
    return os.path.join(os.path.expanduser(state_home), runtime_namespace())

def get_data_home():
    data_home = os.environ.get('XDG_DATA_HOME', '~/.local/share')
    return os.getenv('APPDIR', os.path.expanduser(data_home))

def get_bin_home():
    bin_home = os.environ.get('XDG_BIN_HOME', '~/.local/bin')
    return os.getenv('BINDIR', os.path.expanduser(bin_home))