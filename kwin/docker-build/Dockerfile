# To run the build from the package root:
#    docker buildx build --platform linux/amd64,linux/arm64 -f ./docker-build/Dockerfile -t "breezy-kwin" .
#    docker run --rm -t -v ./:/source -v --platform linux/amd64 "breezy-kwin:amd64"
#    docker run --rm -t -v ./:/source -v --platform linux/arm64 "breezy-kwin:arm64"

FROM --platform=$TARGETPLATFORM debian:trixie

ARG TARGETPLATFORM
RUN echo "Target platform: $TARGETPLATFORM"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    cmake \
    pkg-config \
    git \
    curl \
    wget \
    extra-cmake-modules \
    qt6-base-dev \
    qt6-base-dev-tools \
    qt6-declarative-dev \
    qt6-tools-dev \
    qt6-tools-dev-tools \
    libkf6config-dev \
    libkf6configwidgets-dev \
    libkf6coreaddons-dev \
    libkf6globalaccel-dev \
    libkf6i18n-dev \
    libkf6kcmutils-dev \
    libkf6xmlgui-dev \
    libkf6windowsystem-dev \
    kwayland-dev \
    plasma-wayland-protocols \
    libwayland-dev \
    kwin-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /source

CMD bin/package