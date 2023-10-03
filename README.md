# Breezy Desktop

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L)

## What is this?

This repo will eventually contain a collection of tools to enable virtual desktop environments for gaming and productivity on Linux using XREAL Air glasses.

As of now, only a Vulkan implementation is available, primarily for gaming but could theoretically be used for anything that uses Vulkan rendering.

## Breezy Vulkan

### Setup

#### Steam Deck via Decky Loader

This is still a work in progress... star this repo or check back later.

#### Manual installation

1. [Download the setup script](https://github.com/wheaney/breezy-desktop/releases/latest/download/breezy_vulkan_setup) and set the execute flag (e.g. from the terminal: `chmod +x ~/Downloads/breezy_vulkan_setup`)
2. Run the setup script as root (e.g. `sudo ~/Downloads/breezy_vulkan_setup`)

### Usage

Once installed, you should be able to launch any Vulkan game, plug in your glasses (at any point, not just after launching), and see a floating screen. Note that the initial centering of the screen is based on pre-calibrated values, so it may not actually start out where you're looking, or you may even see it move around for 10+ seconds after you've plugged in your glasses.

To re-center the screen, I've implemented an experimental double-tap feature: you'll want to give two decent taps on the top of the glasses. I tend to do this on the corner, right on top of the hinge. It should be a firm, sharp tap, and wait just a split second to do the second tap, as it needs to detect a slight pause in between (but it also shouldn't take more than a half a second between taps so don't wait too long).

Framerate is really important here, because individual frames are static, so if you're moving your head and the next frame hasn't rendered yet, you'll see the screen move with you for just tiny fraction of a second (e.g. 30Hz, the screen follows you for 33ms) which produces a kind of "dragging" effect. I've found 60Hz to be the best experience, though there is still some dragging that I'd like to try to resolve; I expect 120Hz would work even better if you have the firmware version to support it.

### Disabling

To disable the floating screen effect, either unplug the glasses or hit the `Home` key (you'll need to bind this to your controller on Steam Deck).

### Updating

Rerun the `breezy_vulkan_setup` script. No need to redownload this script, as it will automatically download the latest installation binary for you.

### Uninstalling

If you wish to completely remove the installation, run the following script as root: `~/bin/breezy_vulkan_uninstall`. This won't uninstall the base driver package, following the instructions at the end of the uninstallation to do this manually.