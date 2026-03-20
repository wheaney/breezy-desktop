#!/bin/bash

set -e

USER=${SUDO_USER:-$USER}
GROUP=$(id -gn $USER)

# only SteamOS is pre-built
if [[ "$1" == steamos-* || -z "$1"  ]]; then
    sudo rm -rf build/
    docker run --rm -t -v ./:/source --platform linux/amd64 "breezy-kwin-$1:amd64"
    sudo chown -R $USER:$GROUP out/
fi

# build directory structure is all owned by root because of docker, delete it all now
sudo chown -R $USER:$GROUP build/