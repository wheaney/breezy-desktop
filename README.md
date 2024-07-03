# Breezy Desktop

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L)

[![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://discord.gg/azSBTXNXMt)

## What is this?

This repo contains a collection of tools to enable virtual desktop environments for gaming and productivity on Linux using [supported XR glasses](https://github.com/wheaney/XRLinuxDriver#supported-devices).

There are two installations at the moment. **Note: Only install one of these at a time, as they invalidate each other's installations. This is only temporary.**
* [Breezy GNOME](#breezy-gnome) for desktop support, primarily in GNOME Linux desktop environments
* [Breezy Vulkan](#breezy-vulkan) primarily for gaming but would work with pretty much any application that uses Vulkan rendering.

## Breezy GNOME
Breezy GNOME is a virtual workspace solution for Linux desktops that use the GNOME desktop environment (requires GNOME 45+ on an x86_64 system); see [non-GNOME setup](#non-gnome-setup) if you want to try it without a GNOME desktop environment. It currently supports one virtual monitor and multiple physical monitors, but it will soon support multiple virtual monitors. See [upcoming features](#upcoming-features) for more improvements on the horizon.

### GNOME Setup
1. Ensure you have the latest graphics drivers installed for your distro.
2. Download the Breezy GNOME [setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_gnome_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_gnome_setup`)
3. Run the setup script (e.g. `~/Downloads/breezy_gnome_setup`)
4. You'll have an application called `Breezy Desktop` installed. Launch that and follow any instructions. You will need to log out and back in at least once to get the GNOME extension working.

### Non-GNOME Setup
A workable solution (with some [QoL improvements needed](#upcoming-features)) is to use your preferred desktop environment with a GNOME window open in nested mode. To do this:
1. Install `gnome-shell` using your distros package manager (e.g. apt-get, pacman, dnf, etc...). This will currently only work with GNOME Shell versions 45+, so check that using `gnome-shell --version`
2. Run the [GNOME setup](#gnome-setup) steps. You shouldn't need to log out and back in since GNOME will be running nested.
3. Launch the nested GNOME Shell using `MUTTER_DEBUG_DUMMY_MODE_SPECS="1920x1080@60" dbus-run-session -- gnome-shell --nested`

### Breezy GNOME Usage
All controls are provided through the Breezy Desktop application. You can also configure keyboard shortcuts for the most common toggle actions. The Breezy Desktop app doesn't have to be running to use the virtual desktop or the keyboard shortcuts once you've configured everything to your liking.

### Upcoming Features
1. Widescreen + true display depth w/ SBS
2. Port to GNOME 43/44
3. ARM/AARCH64 build
4. Port to KWin Effect (KDE Plasma support)
5. Multiple virtual monitors + multiple physical monitors
6. Supported nested or Distrobox deployment

## Breezy Vulkan

### Setup

#### Steam Deck via Decky Loader

For Steam Deck users, the driver is now available via the [Decky plugin loader](https://github.com/SteamDeckHomebrew/decky-loader). Just search "xreal" in the Decky store to install and use without leaving Gaming Mode. You can now enable or disable the driver and manage other driver settings via the Decky sidebar menu.

You may still opt to do a manual installation using the instructions below if you enter Desktop Mode.

#### Manual installation

1. Download the [setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_vulkan_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_vulkan_setup`)
2. Run the setup script as root (e.g. `sudo ~/Downloads/breezy_vulkan_setup`)
3. If you're not on Steam Deck, you'll need to set the `ENABLE_VKBASALT` environment variable to `1`. You'll either need to set this globally to enable it for all games, or set it as a launch option for individual games (e.g. in Steam's Launch Options field `ENABLE_VKBASALT=1 %command%`).

### Supported Devices
See [XRLinuxDriver's supported devices](https://github.com/wheaney/XRLinuxDriver#supported-devices).

### Usage

Once installed, you'll want to make sure you've enabled the driver (`~/bin/xreal_driver_config -e`) and then you can go into whichever output mode you'd like using (`~/bin/xreal_driver_config -m`) where `-m` is for mouse mode, `-j` for joystick, `-vd` for virtual display, and `-sv` for sideview; note that these two commands can't be combined, they have to be done separately. From there, you should be able to launch any Vulkan game, plug in your glasses (at any point, not just after launching), and see a floating virtual display or a sideview screen (depending on which mode you've chosen).

There's a wait period of 15 seconds after plugging in XREAL glasses where the screen will stay static to allow for the glasses to calibrate. Once ready, the screen will anchor to the space where you are looking.

### Configurations

To see all the configuration options available to you, type `~/bin/xreal_driver_config` with no parameters to get the usage statement. There are some things you can't trigger from the script, like re-centering the virtual display or entering SBS mode; you can achieve these things through multi-tap or through the physical buttons on the glasses, respectively.

#### Multi-tap to re-center or re-calibrate
I've implemented an experimental multi-tap detection feature for screen **re-centering (2 taps)** and **re-calibrating the device (3 taps)**. To perform a multi-tap, you'll want to give decent taps on the top of the glasses. I tend to do this on the corner, right on top of the hinge. It should be a firm, sharp tap, and wait just a split second to do the second tap, as it needs to detect a slight pause in between (but it also shouldn't take more than a half a second between taps so don't wait too long).

### Troubleshooting

#### Screen drag or flickering
Framerate is really important here, because individual frames are static, so moving your head quickly may produce a noticeable flicker as it moves the screen. Higher framerates will produce an overall better experience (less flicker and smoother follow), but lower framerates should still be totally usable.

#### Unexpected screen movement or drift
It's important that your glasses are either on your head or sitting on a flat surface when they're first plugged in and calibrated. If you notice that your screen is constantly drifting in one direction or continues to move for several seconds after a head movement, almost as if the screen has some momentum that takes time to slow down, then you'll want to re-calibrate them. To do this, do a triple-tap as described in the Multi-tap section above.  

#### Display size

If the screen appears very small in your view, you may be playing at the Deck screen's native resolution, and not at the glasses' native
resolution. To fix this:
1. Go to the game details in Steam, hit the Settings/cog icon, and open `Properties`, then for `Game Resolution` choose `Native`.
2. After launching the game, if it's still small, go into the game options, and in the graphics or video settings, change the resolution (the glasses run at 1920x1080).

If you *WANT* to keep a low resolution, then you can just use the `Zoom` setting to make the screen appear larger. For now this is done through the config script: `~/bin/xreal_driver_config -z 1.0`. Larger numbers zoom in (e.g. `2.0` doubles the screen size) and smaller numbers zoom out (e.g. `0.5` is half the screen size).

### Supporter Tier

Supporter Tier features are enhancments to core functionality, offered as a way to reward those who have [supported the project](https://ko-fi.com/wheaney). Core features -- like Virtual Display mode, VR-Lite mouse/joystick modes, and Follow mode's display positioning/resizing settings -- will always remain available to everyone regardless of supporter status. Donating $10 gets you a year, and $25 gets you lifetime of Supporter Tier access. If you have enough funds, your access will renew automatically within 7 days of expiration so you never experience an unexpected outage. Your device is never required to be online to continue using Supporter Tier features when enabled, but if your access expires while offline (even if you have enough funds), the features will be disabled until the next time your device goes online and the license can be refreshed. Be sure to check for expiration warnings prior to travel.

Features currently offered:
* Smooth Follow (in Follow mode)
* Automatic Recentering (in Virtual Display mode)
* Side-by-side support (in Virtual Display mode)

#### Unlocking Supporter Tier

If you donate at least $10, you should immediately receive an email (to your Ko-fi email address) with a verification token. If you don't, request it using the config script: 
```bash
~/bin/xreal_driver_config --request-token [emailAddress]
```

Once you have a token, verify it using:
```bash
~/bin/xreal_driver_config --verify-token [token]
~/bin/xreal_driver_config --refresh-license
```

### Disabling

To disable the floating screen effect, either disable the driver (`~/bin/xreal_driver_config -d`), unplug the glasses, or hit the `Home` key (you'll need to bind this to your controller, if on Steam Deck).

### Updating

Rerun the `breezy_vulkan_setup` script. No need to re-download this script, as it will automatically download the latest installation binary for you.

### Uninstalling

If you wish to completely remove the installation, run the following: `sudo ~/bin/breezy_vulkan_uninstall`. This won't uninstall the base driver package, follow the instructions at the end of the uninstallation to do this manually.

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
