# To run the build from the package root:
#    docker buildx build --platform linux/amd64,linux/arm64 -f ./docker-build/Dockerfile -t "breezy-ui" .
#    docker run --rm -t -v ./:/source -v --platform linux/amd64 "breezy-ui:amd64"
#    docker run --rm -t -v ./:/source -v --platform linux/arm64 "breezy-ui:arm64"

FROM --platform=$TARGETPLATFORM debian:latest

ARG TARGETPLATFORM
RUN echo "Target platform: $TARGETPLATFORM"

RUN apt-get update && apt-get install -y \
    build-essential \
    meson \
    ninja-build \
    librsvg2-bin \
    libglib2.0-dev \
    libgtk-4-common \
    libgtk-4-bin \
    gtk-update-icon-cache \
    desktop-file-utils \
    gettext \
    appstream

WORKDIR /source

CMD bin/package