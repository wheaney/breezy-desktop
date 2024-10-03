# To run the build from the package root:
#    docker buildx build --platform linux/amd64,linux/arm64 -f ./docker-build/Dockerfile -t "breezy-ui" .
#    docker run --rm -t -v ./:/source -v --platform linux/amd64 "breezy-ui:amd64"
#    docker run --rm -t -v ./:/source -v --platform linux/arm64 "breezy-ui:arm64"

FROM --platform=$TARGETPLATFORM debian:latest

ARG TARGETPLATFORM
RUN echo "Target platform: $TARGETPLATFORM"

ENV LINUXDEPLOY=/usr/local/bin/linuxdeploy.AppImage
ENV LINUXDEPLOY_PLUGIN_GTK=/usr/local/bin/linuxdeploy-plugin-gtk.sh
ENV DEPLOY_GTK_VERSION=4
ENV APPDIR=/AppDir
RUN mkdir $APPDIR

RUN apt-get update && apt-get install -y \
    build-essential \
    meson \
    ninja-build \
    librsvg2-bin \
    librsvg2-common \
    librsvg2-dev \
    libglib2.0-dev \
    libgtk-4-dev \
    libadwaita-1-dev \
    libgirepository1.0-dev \
    gtk-update-icon-cache \
    desktop-file-utils \
    gettext \
    appstream \
    fuse \
    file

RUN case ${TARGETPLATFORM} in \
        "linux/amd64") curl -L -o $LINUXDEPLOY "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage" ;; \
        "linux/arm64") curl -L -o $LINUXDEPLOY "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-aarch64.AppImage" ;; \
        *) echo "Unsupported architecture: ${TARGETPLATFORM}" && exit 1 ;; \
    esac && chmod +x $LINUXDEPLOY

RUN curl -L -o $LINUXDEPLOY_PLUGIN_GTK "https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/master/linuxdeploy-plugin-gtk.sh" && \
    chmod +x $LINUXDEPLOY_PLUGIN_GTK

WORKDIR /source

CMD bin/package