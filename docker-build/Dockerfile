# To run the build from the package root (note: requires non-root docker):
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
    flatpak-builder \
    libglib2.0-dev \
    gnome-shell-extensions

RUN case "${TARGETPLATFORM}" in \
        "linux/amd64")  FLATPAK_ARCH="x86_64" ;; \
        "linux/arm64")  FLATPAK_ARCH="aarch64" ;; \
        *)              FLATPAK_ARCH="x86_64" ;; \
    esac && \
    flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo && \
    flatpak install --user --noninteractive runtime/org.gnome.Sdk/${FLATPAK_ARCH}/46 && \
    flatpak install --user --noninteractive runtime/org.gnome.Platform/${FLATPAK_ARCH}/46

VOLUME /out
WORKDIR /source

CMD bin/package_gnome && cp gnome/build/*.tar.gz /out/