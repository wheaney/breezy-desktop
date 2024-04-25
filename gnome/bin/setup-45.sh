if [ -z "$1" ]; then
    echo "Usage: $0 username [group]"
    exit 1
fi
user=$1
user_home=/home/$user

# Check if a second parameter is provided, if not, use the username as the group
if [ -z "$2" ]; then
    group=$user
else
    group=$2
fi

# go to the downloads directory in user_home
pushd $user_home/Downloads

rm xrealAirLinuxDriver.tar.gz xreal_driver_setup
wget https://github.com/wheaney/XRLinuxDriver/releases/download/breezy-test-v2/xrealAirLinuxDriver.tar.gz
wget https://github.com/wheaney/XRLinuxDriver/releases/download/breezy-test-v2/xreal_driver_setup

chmod +x xreal_driver_setup
chown $user:$group xreal*

sudo ./xreal_driver_setup $user_home/Downloads/xrealAirLinuxDriver.tar.gz

$user_home/bin/xreal_driver_config -e
$user_home/bin/xreal_driver_config -vd

sed -i 's/virtual_display/breezy_desktop/g' $user_home/.xreal_driver_config

if [ ! -d breezy-desktop ]; then
    git clone https://github.com/wheaney/breezy-desktop.git

    chown -R $user:$group breezy-desktop

    pushd breezy-desktop
    git checkout gnome-45
else
    pushd breezy-desktop

    git fetch origin
    git reset --hard origin/gnome-45
fi

popd

extensions_dir=$user_home/.local/share/gnome-shell/extensions

if [ ! -d $extensions_dir ]; then
    mkdir -p $extensions_dir
    chown $user:$group $extensions_dir
fi

# check if the symlink at $extensions_dir/breezydesktop@org.xronlinux already exists
if [ ! -L $extensions_dir/breezydesktop@org.xronlinux ]; then
    ln -s $user_home/Downloads/breezy-desktop/gnome/breezydesktop@org.xronlinux $extensions_dir/breezydesktop@org.xronlinux
    chown -R $user:$group $extensions_dir/breezydesktop@org.xronlinux
fi

echo "Breezy Desktop extension is installed. Please log out, log back in, \
    and then run the following command to enable it:\
    gnome-extensions enable breezydesktop@org.xronlinux"
