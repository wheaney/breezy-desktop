#!/bin/bash

set -e

# Create output directories
mkdir -p out/x86_64 out/aarch64

# Run containers for each architecture
sudo rm -rf build/
docker run --privileged --rm -t -v ./:/source -v ./out/x86_64:/out --platform linux/amd64 "breezy-desktop:amd64"

sudo rm -rf build/
docker run --privileged --rm -t -v ./:/source -v ./out/aarch64:/out --platform linux/arm64 "breezy-desktop:arm64"

# build directory structure is all owned by root because of docker, delete it all now
sudo rm -rf build/