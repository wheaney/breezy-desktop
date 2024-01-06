# Breezy Desktop

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L)

[![Chat](https://img.shields.io/badge/chat-on%20discord-7289da.svg)](https://discord.gg/azSBTXNXMt)

## What is this?

This repo will eventually contain a collection of tools to enable virtual desktop environments for gaming and productivity on Linux using supported XR glasses. This currently includes XREAL Air 1, 2, 2 Pro and VITURE One models.

As of now, only a Vulkan implementation is available, primarily for gaming but could theoretically be used for anything that uses Vulkan rendering.

## Breezy Vulkan

### Setup

#### Steam Deck via Decky Loader

For Steam Deck users, the driver is now available via the [Decky plugin loader](https://github.com/SteamDeckHomebrew/decky-loader). Just search "xreal" in the Decky store to install and use without leaving Gaming Mode. You can now enable or disable the driver and manage other driver settings via the Decky sidebar menu.

You may still opt to do a manual installation using the instructions below if you enter Desktop Mode.

#### Manual installation

1. [Download the setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_vulkan_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_vulkan_setup`)
2. Run the setup script as root (e.g. `sudo ~/Downloads/breezy_vulkan_setup`)
3. If you're not on Steam Deck, you'll need to set the `ENABLE_VKBASALT` environment variable to `1`. You'll either need to set this globally to enable it for all games, or set it as a launch option for individual games (e.g. in Steam's Launch Options field `ENABLE_VKBASALT=1 %command%`).

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

### Disabling

To disable the floating screen effect, either disable the driver (`~/bin/xreal_driver_config -d`), unplug the glasses, or hit the `Home` key (you'll need to bind this to your controller, if on Steam Deck).

### Updating

Rerun the `breezy_vulkan_setup` script. No need to re-download this script, as it will automatically download the latest installation binary for you.

### Uninstalling

If you wish to completely remove the installation, run the following: `sudo ~/bin/breezy_vulkan_uninstall`. This won't uninstall the base driver package, follow the instructions at the end of the uninstallation to do this manually.
