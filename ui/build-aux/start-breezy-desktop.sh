#!/usr/bin/env bash

# stolen from dconf-editor:
# https://gitlab.gnome.org/GNOME/dconf-editor/-/blob/master/build-aux/start-dconf-editor.sh

IFS=: read -ra host_data_dirs < <(flatpak-spawn --host sh -c 'echo "$XDG_DATA_DIRS"')
IFS=: read -ra HOST_XDG_STATE_HOME < <(flatpak-spawn --host sh -c 'echo "$XDG_STATE_HOME"')
IFS=: read -ra HOST_XDG_CONFIG_HOME < <(flatpak-spawn --host sh -c 'echo "$XDG_CONFIG_HOME"')
IFS=: read -ra HOST_XDG_BIN_HOME < <(flatpak-spawn --host sh -c 'echo "$XDG_BIN_HOME"')
IFS=: read -ra HOST_XDG_DATA_HOME < <(flatpak-spawn --host sh -c 'echo "$XDG_DATA_HOME"')

# To avoid potentially muddying up $XDG_DATA_DIRS too much, we link the schema paths
# into a temporary directory.
bridge_dir=$XDG_RUNTIME_DIR/dconf-bridge
mkdir -p "$bridge_dir"

HOST_XDG_DATA_DIRS=""

for dir in "${host_data_dirs[@]}"; do
  if [[ "$dir" == /usr/* ]]; then
    dir=/run/host/"$dir"
  fi

  schemas="$dir/glib-2.0/schemas"
  if [[ -d "$schemas" ]]; then
    bridged=$(mktemp -d XXXXXXXXXX -p "$bridge_dir")
    mkdir -p "$bridged"/glib-2.0
    ln -s "$schemas" "$bridged"/glib-2.0
    HOST_XDG_DATA_DIRS="${HOST_XDG_DATA_DIRS}:${bridged}"
  fi
done

# We MUST prepend the host's data dirs BEFORE the Flatpak environment's own dirs,
# otherwise data (such as default values) load in the wrong order and would then
# incorrectly prefer the Flatpak's internal defaults instead of the host's defaults!
if [[ ! -z "${HOST_XDG_DATA_DIRS}" ]]; then
  XDG_DATA_DIRS="${HOST_XDG_DATA_DIRS:1}:${XDG_DATA_DIRS}"
fi

if [[ ! -z "${HOST_XDG_BIN_HOME}" ]]; then
  XDG_BIN_HOME="${HOST_XDG_BIN_HOME}"
else
  XDG_BIN_HOME="$(realpath ~)/.local/bin"
fi

if [[ ! -z "${HOST_XDG_STATE_HOME}" ]]; then
  XDG_STATE_HOME="${HOST_XDG_STATE_HOME}"
else
  XDG_STATE_HOME="$(realpath ~)/.local/state"
fi

if [[ ! -z "${HOST_XDG_CONFIG_HOME}" ]]; then
  XDG_CONFIG_HOME="${HOST_XDG_CONFIG_HOME}"
else
  XDG_CONFIG_HOME="$(realpath ~)/.config"
fi

if [[ ! -z "${HOST_XDG_DATA_HOME}" ]]; then
  XDG_DATA_HOME="${HOST_XDG_DATA_HOME}"
else
  XDG_DATA_HOME="$(realpath ~)/.local/share"
fi

export XDG_DATA_DIRS
export XDG_BIN_HOME
export XDG_STATE_HOME
export XDG_CONFIG_HOME
export XDG_DATA_HOME
exec breezydesktop "$@"