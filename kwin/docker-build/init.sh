#!/bin/bash

# might be needed on a fresh docker setup:
#   install qemu and qemu-user-static packages
#   sudo docker context rm default
#   docker run --privileged --rm tonistiigi/binfmt --install all
#   sudo docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
#   ls -l /proc/sys/fs/binfmt_misc/ # should contain qemu-<arch> files

if [[ "$1" == "--init" || ! $(docker buildx inspect breezykwinbuilder &>/dev/null; echo $?) -eq 0 ]]; then
    # start fresh
    echo "Creating new docker builder instance"
    docker buildx rm breezykwinbuilder 2>/dev/null || true
    docker buildx create --use --name breezykwinbuilder --driver docker-container --driver-opt image=moby/buildkit:latest
else
    echo "Using existing docker builder instance"
    docker buildx use breezykwinbuilder
fi

echo "Building docker image"
docker buildx build --platform linux/amd64 -f ./docker-build/Dockerfile -t "breezy-kwin:amd64" --load .
# docker buildx build --platform linux/arm64 -f ./docker-build/Dockerfile -t "breezy-kwin:arm64" --load .
docker buildx build --platform linux/amd64 -f ./docker-build/Dockerfile.steamos -t "breezy-kwin-steamos:amd64" --load .