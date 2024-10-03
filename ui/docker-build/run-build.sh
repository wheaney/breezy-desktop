#!/bin/bash

set -e

USER=${SUDO_USER:-$USER}
GROUP=$(id -gn $USER)

# Run containers for each architecture
if [[ "$1" == "x86_64" || -z "$1" ]]; then
    sudo rm -rf build/
    docker run --rm -t -v ./:/source --platform linux/amd64 --device /dev/fuse --cap-add SYS_ADMIN --security-opt apparmor:unconfined "breezy-ui:amd64"
    sudo chown -R $USER:$GROUP out/
fi

if [[ "$1" == "aarch64" || -z "$1"  ]]; then
    sudo rm -rf build/
    docker run --rm -t -v ./:/source --platform linux/arm64 --device /dev/fuse --cap-add SYS_ADMIN --security-opt apparmor:unconfined "breezy-ui:arm64"
    sudo chown -R $USER:$GROUP out/
fi

# build directory structure is all owned by root because of docker, delete it all now
sudo rm -rf build/