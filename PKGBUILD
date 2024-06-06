# Maintainer: hodasemi <michaelh.95 at t-online dot de>
_pkgbase=breezy-desktop
pkgname="${_pkgbase}"
pkgver=0.1
pkgrel=1
pkgdesc="Breezy desktop - XR desktop"
arch=('x86_64')
url="https://github.com/wheaney/breezy-desktop"
license=('GPL-3.0')
makedepends=('ninja' 'meson')
depends=('python' 'python-pydbus' 'gnome-shell')
conflicts=("${_pkgbase}")
source=("git+${url}")
md5sums=(SKIP)

_uuid="breezydesktop@xronlinux.com"

build() {
    cd ${_pkgbase}

    # init submpdules
    git submodule update --init --recursive

    # build binaries
    cd ui
    meson setup build
    cd build
    meson compile

    # prepare extension
    cd ../..
    unlink gnome/src/schemas/com.xronlinux.BreezyDesktop.gschema.xml
    cp ui/data/com.xronlinux.BreezyDesktop.gschema.xml gnome/src/schemas/
    glib-compile-schemas --targetdir="gnome/src/schemas" "gnome/src/schemas"

    unlink gnome/src/textures/custom_banner.png
    cp vulkan/custom_banner.png gnome/src/textures/

    unlink gnome/src/textures/calibrating.png
    cp modules/sombrero/calibrating.png gnome/src/textures/

    # build xr driver
    cd modules/XRLinuxDriver
    mkdir build/
    cd build
    cmake ..
    make
}

package() {
    # copy gnome extension
    install -Dm755 ${_pkgbase}/ui/data/com.xronlinux.BreezyDesktop.gschema.xml "${pkgdir}"/usr/share/glib-2.0/schemas/com.xronlinux.BreezyDesktop.gschema.xml

    install -d "${pkgdir}/usr/share/gnome-shell/extensions/${_uuid}/"
    cp -r ${_pkgbase}/gnome/src/* "${pkgdir}/usr/share/gnome-shell/extensions/${_uuid}/"
    unlink "${pkgdir}/usr/share/gnome-shell/extensions/${_uuid}/IMUAdjust.frag"

    # copy binaries
    install -d "${pkgdir}"/usr/local/share/breezydesktop/breezydesktop/
    cp -r ${_pkgbase}/ui/src/*.py "${pkgdir}"/usr/local/share/breezydesktop/breezydesktop/
    install -Dm755 ${_pkgbase}/ui/modules/PyXRLinuxDriverIPC/xrdriveripc.py "${pkgdir}"/usr/local/share/breezydesktop/breezydesktop/xrdriveripc.py
    install -Dm755 ${_pkgbase}/ui/build/src/breezydesktop.gresource "${pkgdir}"/usr/local/share/breezydesktop/breezydesktop.gresource

    install -Dm755 ${_pkgbase}/ui/build-aux/start-breezy-desktop.sh "${pkgdir}"/usr/bin/start-breezy-desktop
    install -Dm755 ${_pkgbase}/ui/build/src/breezydesktop "${pkgdir}"/usr/bin/breezydesktop

    install -Dm755 ${_pkgbase}/ui/build/src/breezydesktop.gresource "${pkgdir}"/usr/local/share/breezydesktop/breezydesktop.gresource
    install -Dm755 ${_pkgbase}/ui/build/data/com.xronlinux.BreezyDesktop.desktop "${pkgdir}"/usr/share/applications/com.xronlinux.BreezyDesktop.desktop

    # copy xr driver
    install -Dm755 ${_pkgbase}/modules/XRLinuxDriver/build/xrealAirLinuxDriver "${pkgdir}"/usr/bin/xrealAirLinuxDriver
    sed -i '/ExecStart/c\ExecStart=xrealAirLinuxDriver' ${_pkgbase}/modules/XRLinuxDriver/systemd/xreal-air-driver.service
    install -Dm644 ${_pkgbase}/modules/XRLinuxDriver/systemd/xreal-air-driver.service "${pkgdir}"/usr/lib/systemd/system/xreal-air-driver.service
}

