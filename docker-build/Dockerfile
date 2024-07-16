# To run the build from the package root:
#    docker buildx build --platform linux/amd64 -f ./docker-build/Dockerfile -t "breezy-desktop:amd64" --load .
#    docker buildx build --platform linux/arm64 -f ./docker-build/Dockerfile -t "breezy-desktop:arm64" --load .
#    docker buildx build --platform linux/arm/v7 -f ./docker-build/Dockerfile -t "breezy-desktop:armv7" --load .
#    docker run --rm -t -v ./:/source -v ./out/amd64:/out --platform linux/amd64 "breezy-desktop:amd64"
#    docker run --rm -t -v ./:/source -v ./out/arm64:/out --platform linux/arm64 "breezy-desktop:arm64"
#    docker run --rm -t -v ./:/source -v ./out/arm64:/out --platform linux/arm64 "breezy-desktop:armv7"

FROM --platform=$TARGETPLATFORM debian:latest

ARG TARGETPLATFORM
RUN echo "Target platform: $TARGETPLATFORM"

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libudev-dev \
    libusb-1.0-0-dev \
    libcurl4-openssl-dev \
    libevdev-dev \
    libssl-dev \
    libjson-c-dev \
    python3 \
    python3-yaml \
    flatpak \
    flatpak-builder

VOLUME /out
WORKDIR /source

CMD bin/package_gnome && cp build/*.tar.gz /out/