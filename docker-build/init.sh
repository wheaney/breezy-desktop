#!/bin/bash

if [[ "$1" == "--init" || ! $(docker buildx inspect breezydesktopbuilder &>/dev/null; echo $?) -eq 0 ]]; then
    # start fresh
    echo "Creating new docker builder instance"
    docker buildx rm breezydesktopbuilder 2>/dev/null || true
    docker buildx create --name breezydesktopbuilder --use
else
    echo "Using existing docker builder instance"
    docker buildx use breezydesktopbuilder
fi

echo "Building docker image"
docker buildx build --platform linux/amd64 -f ./docker-build/Dockerfile -t "breezy-desktop:amd64" --load .
docker buildx build --platform linux/arm64 -f ./docker-build/Dockerfile -t "breezy-desktop:arm64" --load .