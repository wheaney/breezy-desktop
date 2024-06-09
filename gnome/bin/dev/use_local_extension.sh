USER_HOME=$(realpath ~)

# https://stackoverflow.com/a/246128
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

if [ -z "$XDG_DATA_HOME" ]; then
  XDG_DATA_HOME="$USER_HOME/.local/share"
fi
DATA_DIR="$XDG_DATA_HOME/breezy_gnome"

# if $XDG_DATA_HOME/gnome-shell/extensions/breezydesktop@xronlinux.com exists
extension_path="$XDG_DATA_HOME/gnome-shell/extensions/breezydesktop@xronlinux.com"
if [ -d $extension_path ]; then
  # remove it
  rm -rf $extension_path
fi

# recursively copy the $SCRIPT_DIR/../../src to extension_path, don't preserve symlinks
cp -rL $SCRIPT_DIR/../../src $extension_path

glib-compile-schemas $extension_path/schemas

pushd $extension_path
GNOME_MANIFEST_LINE=$(find -L . -type f ! -name "*.compiled" -exec sha256sum {} \; | sort | sha256sum | sed 's/ .*//')
popd

pushd $DATA_DIR
echo -e "$GNOME_MANIFEST_LINE breezydesktop@xronlinux.com" > manifest
popd