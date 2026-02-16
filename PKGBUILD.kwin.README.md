# Breezy Desktop KWin Plugin - AUR PKGBUILD

This directory contains the PKGBUILD file for creating an Arch Linux AUR package for the Breezy Desktop KWin plugin.

## File

- `PKGBUILD.kwin` - AUR PKGBUILD for breezy-desktop-kwin-git

## About

The `breezy-desktop-kwin-git` package provides the KWin plugin for Breezy Desktop, which enables virtual desktop environments for gaming and productivity on KDE Plasma 6 using [supported XR glasses](https://github.com/wheaney/XRLinuxDriver#supported-devices).

## Installation via AUR

Once this PKGBUILD is published to AUR, Arch Linux users can install Breezy Desktop for KWin with:

```bash
yay -S breezy-desktop-kwin-git
```

or using other AUR helpers like `paru`.

After installation:

1. Log out and back in
2. Enable "Breezy Desktop" from the Desktop Effects in System Settings
3. Launch the Breezy Desktop application to configure settings

## Dependencies

The package requires:
- KDE Plasma 6 (KWin) with Wayland support
- Qt6 (base and declarative modules)
- KDE Frameworks 6 (config, configwidgets, coreaddons, globalaccel, i18n, kcmutils, windowsystem, xmlgui)
- Python 3
- libepoxy and libxcb

## Optional Dependencies

- `xr-driver-breezy-kwin-git` - XR driver backend (recommended for full functionality)

## Manual Build

To build the package manually without publishing to AUR:

1. Copy `PKGBUILD.kwin` to a clean build directory
2. Rename it to `PKGBUILD`
3. Run `makepkg -si` to build and install

## Publishing to AUR

To publish or update this package on AUR:

1. Create or clone the AUR repository for `breezy-desktop-kwin-git`
2. Copy the contents of `PKGBUILD.kwin` to `PKGBUILD` in the AUR repo
3. Update `.SRCINFO` by running: `makepkg --printsrcinfo > .SRCINFO`
4. Commit and push to AUR

## Notes

- This package builds from the latest git source
- The version is automatically derived from the VERSION file in the repository
- The package installs to system directories (/usr) following Arch Linux packaging standards
- Users must be on Wayland to use virtual display features
- For X11 users, only physical display features will work

## See Also

- Main repository: https://github.com/wheaney/breezy-desktop
- GNOME variant: [breezy-desktop-gnome-git](https://aur.archlinux.org/packages/breezy-desktop-gnome-git) (already available in AUR)
- XR Driver: [xr-driver-breezy-gnome-git](https://aur.archlinux.org/packages/xr-driver-breezy-gnome-git) (for GNOME; KWin variant may vary)

