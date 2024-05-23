import logging
import os
import subprocess

logger = logging.getLogger('breezy_ui')
user_home = os.path.expanduser('~')

def verify_installation():
    xdg_bin_home = os.environ.get('XDG_BIN_HOME')
    if not xdg_bin_home or xdg_bin_home.startswith('/app') or xdg_bin_home.startswith(os.path.join(user_home, '.var/app')):
        xdg_bin_home = os.path.join(user_home, '.local', 'bin')
    verify_installation_path = os.path.join(xdg_bin_home, 'breezy_gnome_verify')

    if not os.path.exists(verify_installation_path):
        logger.error(f"Could not verify your Breezy GNOME installation. Please ensure that Breezy GNOME is installed.")
        exit(1)

    env_copy = os.environ.copy()
    xdg_data_home = os.environ.get('XDG_DATA_HOME')
    if not xdg_data_home or xdg_data_home.startswith('/app') or xdg_data_home.startswith(os.path.join(user_home, '.var/app')):
        xdg_data_home = os.path.join(user_home, '.local', 'share')
    env_copy["XDG_DATA_HOME"] = xdg_data_home
    try:
        verify_output = subprocess.check_output([verify_installation_path], stderr=subprocess.STDOUT, env=env_copy).strip()
        success = verify_output == b"Verification succeeded"
        if not success:
            logger.error(f"Could not verify your Breezy GNOME installation. Please ensure that Breezy GNOME is installed.")
            logger.error(verify_output)
        
        return success
    except subprocess.CalledProcessError as e:
        logger.error(f"Could not verify your Breezy GNOME installation. Please ensure that Breezy GNOME is installed.")
        logger.error(e.output.decode().strip())

    return False