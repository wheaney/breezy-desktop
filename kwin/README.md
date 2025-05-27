# Cube effect

![Screenshot](data/screenshot.avif)

This is a basic desktop cube effect for KWin. It's primarily intended to help you
impress your friends with what one can do on "Linux."

<p align="center">
    <img src="https://raw.githubusercontent.com/zzag/kwin-effects-cube/main/data/demo.gif" />
</p>


## How to use it

Go to desktop effect settings, and enable the Cube effect. Once you've done that,
the Cube effect can be activated by pressing `Meta+C` shortcut.

Note that you will need at least 3 virtual desktops in order to activate the effect.

Key navigation:

- `Escape` - quit the effect
- `Left` and `Right` arrow keys - rotate the cube left or right, respectively
- `Enter`/`Space`/`Return` - switch to the currently viewed desktop

Mouse navigation:

- LMB click - switch to the currently viewed desktop
- Press LMB and drag - rotate the cube
- Wheel up and down - move the cube farther or closer, respectively


## Installation

Arch Linux:

For users who are using KF6/Plasma 6
```sh
yay -S kwin-effects-cube-git
```
For users who are using Plasma 5
```sh
yay -S kwin-effects-cube
```

## Building from Git

You will need the following dependencies to build this effect:

* CMake
* any C++14 enabled compiler
* Qt
    - qtbase
    - qtdeclarative
    - qtquick3d
* libkwineffects
* KDE Frameworks 5:
    - Config
    - CoreAddons
    - Extra CMake Modules
    - GlobalAccel
    - WindowSystem

On Arch Linux

```sh
sudo pacman -S cmake extra-cmake-modules kwin qt5-quick3d
```

On Fedora

```sh
sudo dnf install cmake extra-cmake-modules kf5-kconfig-devel kf5-kcoreaddons-devel \
    kf5-kglobalaccel-devel kf5-ki18n-devel kf5-kwindowsystem-devel kf5-kxmlgui-devel \
    kwin-devel libepoxy-devel qt5-qtbase-devel
```

On Ubuntu

```sh
sudo apt install cmake extra-cmake-modules gettext kwin-dev libkf5config-dev \
    libkf5configwidgets-dev libkf5coreaddons-dev libkf5globalaccel-dev
    libkf5windowsystem-dev libkf5xmlgui-dev qtbase5-dev qtdeclarative5-dev
```

After you installed all the required dependencies, you can build
the effect:

```sh
git clone https://github.com/zzag/kwin-effects-cube.git
cd kwin-effects-cube
cmake -B build -S . \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/usr
cmake --build build --parallel
cmake --install build
```

## Building QtQuick 3D from source code

Note that some distributions (e.g. Ubuntu or Fedora) don't package QtQuick 3D.
If you use such a distro, you will have to build QtQuick 3D from source code.

Go to https://download.qt.io/official_releases/qt/ and download qtquick3d source
tarball (it's in `submodules/` folder) for 5.15, unpack it and run the following commands

```
qmake qtquick3d.pro
make
make install
```
