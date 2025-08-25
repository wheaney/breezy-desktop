# To run the build from the package root:
#    docker buildx build --platform linux/amd64,linux/arm64 -f ./docker-build/Dockerfile -t "breezy-kwin" .
#    docker run --rm -t -v ./:/source -v --platform linux/amd64 "breezy-kwin:amd64"
#    docker run --rm -t -v ./:/source -v --platform linux/arm64 "breezy-kwin:arm64"

FROM --platform=$TARGETPLATFORM archlinux:base-20250817.0.405639@sha256:31f0749bdb81517dc8f379feac0a3860b097f1da1f53c8315c1bae0817d6c0a1

ARG TARGETPLATFORM
RUN echo "Target platform: $TARGETPLATFORM"

RUN pacman -Sy --noconfirm --needed \
    ca-certificates \
    base-devel \
    cmake \
    pkgconf \
    git \
    curl \
    wget \
    extra-cmake-modules \
    qt6-base \
    qt6-declarative \
    qt6-tools \
    kconfig \
    kconfigwidgets \
    kcoreaddons \
    kglobalaccel \
    ki18n \
    kcmutils \
    kxmlgui \
    kwindowsystem \
    kwin \
 && pacman -Scc --noconfirm

WORKDIR /source

CMD bin/package_kwin_plugin