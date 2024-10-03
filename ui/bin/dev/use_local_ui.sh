USER_HOME=$(realpath ~)
ARCH=$(uname -m)

# https://stackoverflow.com/a/246128
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

if [ -z "$XDG_DATA_HOME" ]; then
  XDG_DATA_HOME="$USER_HOME/.local/share"
fi

if [ -z "$XDG_BIN_HOME" ]; then
  XDG_BIN_HOME="$USER_HOME/.local/bin"
fi


# create temp directory
tmp_dir=$(mktemp -d -t breezy-gnome-XXXXXXXXXX)
pushd $tmp_dir > /dev/null
echo "Created temp directory: ${tmp_dir}"

echo "Extracting to: ${tmp_dir}/breezy_ui"
tar -xf $SCRIPT_DIR/../../out/breezyUI-${ARCH}.tar.gz

echo "Installing the Breezy Desktop UI application"
cp -r breezy_ui/data/* $XDG_DATA_HOME
cp -r breezy_ui/bin/* $XDG_BIN_HOME

# update copied files to use the local XDG paths
ESCAPED_XDG_DATA_HOME=$(printf '%s\n' "$XDG_DATA_HOME" | sed -e 's/[\/&]/\\&/g')
sed -i -e "s/\/usr\/local\/share/$ESCAPED_XDG_DATA_HOME/g" $XDG_BIN_HOME/breezydesktop
sed -i "/Exec/c\Exec=$XDG_BIN_HOME/breezydesktop" $XDG_DATA_HOME/applications/com.xronlinux.BreezyDesktop.desktop

glib-compile-schemas $XDG_DATA_HOME/glib-2.0/schemas
update-desktop-database $XDG_DATA_HOME/applications
gtk-update-icon-cache