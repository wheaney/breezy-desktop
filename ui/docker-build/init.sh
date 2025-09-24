#!/bin/bash

# might be needed on a fresh docker setup:
#   install qemu and qemu-user-static packages
#   sudo docker context rm default

docker run --privileged --rm tonistiigi/binfmt --install all
sudo docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

if [[ "$1" == "--init" || ! $(docker buildx inspect breezyuibuilder &>/dev/null; echo $?) -eq 0 ]]; then
    # start fresh
    echo "Creating new docker builder instance"
    docker buildx rm breezyuibuilder 2>/dev/null || true
    docker buildx create --use --name breezyuibuilder --driver docker-container --driver-opt image=moby/buildkit:latest
else
    echo "Using existing docker builder instance"
    docker buildx use breezyuibuilder
fi

echo "Building docker image"
docker buildx build --platform linux/amd64 -f ./docker-build/Dockerfile -t "breezy-ui:amd64" --load .
docker buildx build --platform linux/arm64 -f ./docker-build/Dockerfile -t "breezy-ui:arm64" --load .