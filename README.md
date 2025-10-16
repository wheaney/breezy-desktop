# Breezy Desktop

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L)

[![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://discord.gg/azSBTXNXMt)

## What is this?

This repo contains a collection of tools to enable virtual desktop environments for gaming and productivity on Linux using [supported XR glasses](https://github.com/wheaney/XRLinuxDriver#supported-devices).

There are two installations available. **Note: Don't manually install either of these if you're running the Decky plugin on the same machine, as they invalidate each other's installations. This is only temporary.**
* [Breezy Desktop](#breezy-desktop) for KDE Plasma or GNOME desktop environments on Linux.
* [Breezy Vulkan](#breezy-vulkan) primarily for gaming but would work with pretty much any application that uses Vulkan rendering.

## Breezy Desktop

Breezy Desktop is a virtual workspace solution for Linux desktops that use the KDE Plasma 6 or GNOME desktop environments (versions 42 through 49). It supports launching multiple virtual monitors alongside multiple physical monitors. For Linux users not running GNOME or KDE, you can play around with a [nested GNOME setup](#nested-gnome-setup).

For the best performance, ensure you have the latest graphics drivers installed for your distro.

### KDE Plasma Setup (Beta)

Breezy Desktop is only compatible with KDE Plasma 6.

**IMPORTANT** - Please read carefully through this list before you get started
* **If this is the first time you're using your glasses with KDE**, you'll be presented with some options around how to extend your desktop that aren't very clear. Choose the "No action" option to leave the glasses' display independent.
* **If you're running KDE on `X11`**, you won't be able to launch virtual displays. If you're not on SteamOS, look for Wayland options on the login screen.
* **Steam Deck users** note the extra step in the setup instructions for switching to `Wayland` if you want virtual display features.
* **If you're using XREAL Ones** or other glasses that provide built-in 3DoF/stabilization/anchoring features (e.g. VITURE Beast), you must disable ALL such features first, using the menu on the glasses.
* **For the best experience**
  * To prevent a broken taskbar: in `Panel Settings`, set `Visibility` to `always-visible`.
  * To prevent a magnified cursor from showing in the wrong place: in `System Settings` / `Accessibility`, disable the `Shake Cursor` effect.

To setup Breezy on KDE, with your glasses unplugged:
1. Make sure your glasses are in the [supported devices list](https://github.com/wheaney/XRLinuxDriver#supported-devices) and are on the latest firmware.
2. Download the [Breezy KWin setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_kwin_setup)
3. Set the execute flag: `chmod +x ~/Downloads/breezy_kwin_setup`
4. Run the setup script: `~/Downloads/breezy_kwin_setup`
5. If you're on SteamOS and want to use virtual displays, run this: `steamos-session-select plasma-wayland-persistent`
   * **IMPORTANT** - this will prevent you from accessing Game Mode again, until you undo it by running just `steamos-session-select`
6. Log out and back in.

After setup, you'll have an application called `Breezy Desktop` installed. Launch that and follow any instructions. You can also configure keyboard shortcuts for the most common toggle actions. The Breezy Desktop app doesn't have to be running to use the virtual desktop or the keyboard shortcuts once you've configured everything to your liking.

### GNOME Setup

Make sure your glasses are extending your workspace and not just mirroring your primary monitor by opening up the `Displays` settings dialog and choosing the `Join` option for multiple displays. If you're running `GNOME on Xorg`, you won't be able to launch virtual displays; switch to `Wayland` or follow the [GNOME Legacy setup](#gnome-widescreen-legacy-setup) instructions if you want access to widescreen mode.

#### GNOME Multi-display

**Note: an [AUR installation](#gnome-arch-linux-setup) is also available for Arch users**

1. Download the Breezy GNOME [setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_gnome_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_gnome_setup`)
2. Run the setup script: `~/Downloads/breezy_gnome_setup`
3. Log out and back in, then proceed to [usage](#breezy-gnome-usage).

#### GNOME Arch Linux setup

Breezy GNOME is in AUR (but not pacman, yet). To install, run these commands from a terminal:

1. If you've previously installed Breezy GNOME using the setup script, you must uninstall it first with `breezy_gnome_uninstall`
2. `yay -S breezy-desktop-gnome-git`
3. `systemctl --user enable --now xr-driver.service`
4. Log out and back in, then proceed to [usage](#breezy-gnome-usage).

#### GNOME Widescreen (Legacy) Setup

1. Download the Breezy GNOME [setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_gnome_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_gnome_setup`)
2. Run the setup script: `~/Downloads/breezy_gnome_setup --tag legacy`
3. Log out and back in, then proceed to [usage](#breezy-gnome-usage).

#### Nested-GNOME Setup
A workable demo -- but not a great long-term solutions -- is to use your preferred desktop environment with a GNOME window open in nested mode. To do this:
1. Install `gnome-shell` using your distros package manager (e.g. apt-get, pacman, dnf, etc...). This will currently only work with GNOME Shell versions 42-49, so check that using `gnome-shell --version`
2. On GNOME 49 and above, you'll also need to install the mutter devkit package
3. Run the [GNOME setup](#gnome-setup) steps. You shouldn't need to log out and back in since GNOME will be running nested.
4. Launch the nested GNOME Shell using:
  * GNOME 49 and newer: `MUTTER_DEBUG_DUMMY_MODE_SPECS="1920x1080@60" dbus-run-session -- gnome-shell --devkit`
  * Older GNOME versions: `MUTTER_DEBUG_DUMMY_MODE_SPECS="1920x1080@60" dbus-run-session -- gnome-shell --nested`
5. You may have to set developer mode: `gsettings set com.xronlinux.BreezyDesktop developer-mode true`

#### Breezy GNOME Usage

After setup, you'll have an application called `Breezy Desktop` installed. Launch that and follow any instructions. You will need to log out and back in at least once to get the GNOME extension working. You can also configure keyboard shortcuts for the most common toggle actions. The Breezy Desktop app doesn't have to be running to use the virtual desktop or the keyboard shortcuts once you've configured everything to your liking.

For a double-wide screen, enable "widescreen mode" using the toggle in the Breezy Desktop application. **Note: this can be significantly more resource intensive than non-widescreen, you may notice performance dips on older hardware.**

### Upcoming Features
* Port to KWin Effect (KDE Plasma support)

### Breezy Desktop Pricing (Productivity Tier)

Breezy Desktop for GNOME and KDE comes with 2 free trial months. After that, it requires an active Productivity Tier license. Payments are currently only accepted via [Ko-fi](https://ko-fi.com/wheaney). Here's the pricing structure:

| Payment period | Price              | Upgrade window \*                     |
| -------------- | ------------------ | ------------------------------------- |
| Monthly        | $5 USD, recurring  | Within 7 days to upgrade to yearly    |
| Yearly         | $50 USD, recurring | Within 90 days to upgrade to lifetime |
| Lifetime       | $125 USD, one-time | &mdash;                               |

\* If you pay for a plan and decide to upgrade to a longer-term plan, you may pay the difference within this window.

If you have enough funds, your license will renew automatically within 7 days of expiration so you never experience an unexpected outage. Your device is never required to be online to continue using Productivity Tier features when enabled, but if your access expires while offline (even if you have enough funds), the features will be disabled until the next time your device goes online and the license can be refreshed. Be sure to check for expiration warnings prior to travel.

#### Free Productivity Tier

To make Breezy widely accessible, Productivity Tier is currently free of charge for qualified individuals using it for non-commercial purposes. Eligible groups include:

* Students
* Public school educators
* Active duty service members and veterans of the U.S. Armed Forces
* Individuals experiencing financial hardship or special circumstances that make electronic payments prohibitive
* Individuals affected by active war zones or humanitarian crises (e.g. Ukrainian citizens)

If you believe you qualify, please email wayne@xronlinux.com. You may be asked to provide documentation to verify your eligibility.

#### Unlocking Productivity Tier

After your first payment, you should immediately receive an email (to your Ko-fi email address) with a verification token. Once you receive that, enter it in the `License Details` view of the `Breezy Desktop` application, available from the menu in the top window bar.

If you don't receive a token, you can request one in the `License Details` view by entering your email address.

## Breezy Vulkan

### Setup

#### Steam Deck via Decky Loader

For Steam Deck users, the driver is now available via the [Decky plugin loader](https://github.com/SteamDeckHomebrew/decky-loader). Just search "xr" in the Decky store to install and use without leaving Gaming Mode. You can now enable or disable the driver and manage other driver settings via the Decky sidebar menu.

You may still opt to do a manual installation using the instructions below if you enter Desktop Mode.

#### Manual installation

1. Download the [setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_vulkan_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_vulkan_setup`)
2. Run the setup script as root (e.g. `sudo ~/Downloads/breezy_vulkan_setup`)
3. If you're not on Steam Deck, you'll need to set the `ENABLE_VKBASALT` environment variable to `1`. You'll either need to set this globally to enable it for all games, or set it as a launch option for individual games (e.g. in Steam's Launch Options field `ENABLE_VKBASALT=1 %command%`).

### Supported Devices
See [XRLinuxDriver's supported devices](https://github.com/wheaney/XRLinuxDriver#supported-devices).

### Usage

Once installed, you'll want to make sure you've enabled the driver (`xr_driver_cli -e`) and then you can go into whichever output mode you'd like using (`xr_driver_cli -m`) where `-m` is for mouse mode, `-j` for joystick, `-vd` for virtual display, and `-sv` for sideview; note that these two commands can't be combined, they have to be done separately. From there, you should be able to launch any Vulkan game, plug in your glasses (at any point, not just after launching), and see a floating virtual display or a sideview screen (depending on which mode you've chosen).

There's a wait period of 15 seconds after plugging in XREAL glasses where the screen will stay static to allow for the glasses to calibrate. Once ready, the screen will anchor to the space where you are looking.

### Configurations

To see all the configuration options available to you, type `xr_driver_cli` with no parameters to get the usage statement. There are some things you can't trigger from the script, like re-centering the virtual display or entering SBS mode; you can achieve these things through multi-tap or through the physical buttons on the glasses, respectively.

#### Multi-tap to re-center or re-calibrate
I've implemented an experimental multi-tap detection feature for screen **re-centering (2 taps)** and **re-calibrating the device (3 taps)**. To perform a multi-tap, you'll want to give decent taps on the top of the glasses. I tend to do this on the corner, right on top of the hinge. It should be a firm, sharp tap, and wait just a split second to do the second tap, as it needs to detect a slight pause in between (but it also shouldn't take more than a half a second between taps so don't wait too long).

### Supporter Tier

Breezy Vulkan's Supporter Tier features are enhancments to core functionality, offered as a way to reward those who have [supported the project](https://ko-fi.com/wheaney). Core features -- like Virtual Display mode, VR-Lite mouse/joystick modes, and Follow mode's display positioning/resizing settings -- will always remain available to everyone regardless of supporter status. Here's the pricing structure:

| Payment period | Price              | Upgrade window \*                     |
| -------------- | ------------------ | ------------------------------------- |
| Yearly         | $10 USD, recurring | Within 90 days to upgrade to lifetime |
| Lifetime       | $25 USD, one-time  | &mdash;                               |

\* If you pay for a plan and decide to upgrade to a longer-term plan, you may pay the difference within this window.

If you have enough funds, your access will renew automatically within 7 days of expiration so you never experience an unexpected outage. Your device is never required to be online to continue using Supporter Tier features when enabled, but if your access expires while offline (even if you have enough funds), the features will be disabled until the next time your device goes online and the license can be refreshed. Be sure to check for expiration warnings prior to travel.

Features currently offered:
* Smooth Follow (in Follow mode)
* Automatic Recentering (in Virtual Display mode)
* Side-by-side support (in Virtual Display mode)

#### Unlocking Supporter Tier

If you donate at least $10, you should immediately receive an email (to your Ko-fi email address) with a verification token. If you don't, request it using the config script: 
```bash
xr_driver_cli --request-token [emailAddress]
```

Once you have a token, verify it using:
```bash
xr_driver_cli --verify-token [token]
xr_driver_cli --refresh-license
```

### Disabling

To disable the floating screen effect, either disable the driver (`xr_driver_cli -d`), unplug the glasses, or hit the `Home` key (you'll need to bind this to your controller, if on Steam Deck).

### Updating

Rerun the `breezy_vulkan_setup` script. No need to re-download this script, as it will automatically download the latest installation binary for you.

### Uninstalling

If you wish to completely remove the installation:
* For **Breezy KDE** run the following: `breezy_kwin_uninstall`
* For **Breezy GNOME**:
  * If you installed *via the setup script* run the following: `~/.local/bin/breezy_gnome_uninstall`
  * If you installed via `yay` run the following: `pacman -R breezy-desktop-gnome-git`, you may also want to uninstall the base driver with `pacman -R xr-driver-breezy-gnome-git`
* For **Breezy Vulkan** run the following: `~/.local/bin/breezy_vulkan_uninstall`. This won't uninstall the base driver package, follow the instructions at the end of the uninstallation to do this manually.

## Data Privacy Notice

Your right to privacy and the protection of your personal data are baked into every decision around how your personal data is collected, handled and stored. Your personal data will never be shared, sold, or distributed in any form.

### Data Collected

In order to provide you with Supporter Tier features, this application and its backend services have to collect the following pieces of personal information:

* Your email address is sent to this application's backend server from either the payment vendor (Ko-fi) or from your device (at your request). Your email address may be used immediately upon receipt in its unaltered form to send you a transactional email, but it is then hashed prior to storage. The unaltered form of your email address is never stored and can no longer be referenced. The hashed value is stored for later reference.
  * Other personal data may be sent from the payment vendor, but is never utilized nor stored. 
* Your device's MAC address is hashed on your device. It never leaves your device in its original, unaltered form. The hashed value is sent to this application's backend server and stored for later reference, and -- up to version 0.8.7 -- to Google Analytics.

Hashing functions are a one-way process that serve to anonymize your personal data by irreversibly changing them. Once hashed, they can never be unhashed or traced back to their original values.

### Contact

For inquires about data privacy or any related concerns, please contact:

Wayne Heaney - **wayne@xronlinux.com**
