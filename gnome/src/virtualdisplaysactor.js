import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { VirtualDisplayEffect, SMOOTH_FOLLOW_SLERP_TIMELINE_MS } from './virtualdisplayeffect.js';
import { applyQuaternionToVector, degreeToRadian, diagonalToCrossFOVs, fovConversionFns, normalizeVector } from './math.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Globals from './globals.js';

// if nothing is in focus, take it as soon as it crosses into the monitor's bounds
const FOCUS_THRESHOLD = 0.95 / 2.0;

// if we leave the monitor with some margin, unfocus even if no other monitor is in focus
const UNFOCUS_THRESHOLD = 1.1 / 2.0;

/**
 * Find the vector in the array that's closest to the quaternion rotation
 * 
 * @param {number[]} quaternion - Reference quaternion [x, y, z, w]
 * @param {number[][]} monitorVectors - Array of monitor vectors [x, y, z] to search from
 * @param {number} currentFocusedIndex - Index of the currently focused monitor
 * @param {number} focusedMonitorDistance - Distance to the focused monitor, < 1.0 if zoomed in
 * @param {boolean} smoothFollowEnabled - If true, always keep the current monitor in focus or choose the closest
 * @param {Object} fovDetails - Contains reference widthPixels, heightPixels, horizontal and vertical radians, and pixel distance to the center of the screen
 * @param {Object[]} monitorsDetails - Contains x, y, width, height (coordinates from top-left) for each monitor
 * @returns {number} Index of the closest vector, if it surpasses the previous closest index by a certain margin, otherwise the previous index
 */
function findFocusedMonitor(quaternion, monitorVectors, currentFocusedIndex, focusedMonitorDistance, smoothFollowEnabled, fovDetails, monitorsDetails) {
    const lookVector = [1.0, 0.0, 0.0]; // NWU vector pointing to the center of the screen
    const rotatedLookVector = applyQuaternionToVector(lookVector, quaternion);

    // TODO - right now we're using the curved functions to figure out distances even for flat monitors
    // because it will account for the monitors facing towards us, but this will lose some accuracy
    const upConversionFns = fovDetails.monitorWrappingScheme === 'vertical' ? fovConversionFns.curved : fovConversionFns.flat;
    const lookUpPixels = upConversionFns.angleToLength(
        fovDetails.defaultDistanceVerticalRadians,
        fovDetails.heightPixels,
        fovDetails.completeScreenDistancePixels,
        rotatedLookVector[2], 
        rotatedLookVector[0]
    );
    const westConversionFns = fovDetails.monitorWrappingScheme === 'horizontal' ? fovConversionFns.curved : fovConversionFns.flat;
    const lookWestPixels = westConversionFns.angleToLength(
        fovDetails.defaultDistanceHorizontalRadians,
        fovDetails.widthPixels,
        fovDetails.completeScreenDistancePixels,
        rotatedLookVector[1],
        rotatedLookVector[0]
    );

    let closestIndex = -1;
    let closestDistance = Infinity;
    let currentFocusedDistance = Infinity;

    // find the vector closest to the rotated look vector
    monitorVectors.forEach((monitorVector, index) => {
        const monitor = monitorsDetails[index];
        const monitorAspectRatio = monitor.width / monitor.height;

        // weight the up distance by the aspect ratio
        const vectorUpPixels = upConversionFns.angleToLength(
            fovDetails.defaultDistanceVerticalRadians,
            fovDetails.heightPixels,
            fovDetails.completeScreenDistancePixels,
            monitorVector[2],
            monitorVector[0]
        );
        const upDeltaPixels = (lookUpPixels - vectorUpPixels) * monitorAspectRatio;

        const vectorWestPixels = westConversionFns.angleToLength(
            fovDetails.defaultDistanceHorizontalRadians,
            fovDetails.widthPixels,
            fovDetails.completeScreenDistancePixels,
            monitorVector[1],
            monitorVector[0]
        );
        const westDeltaPixels = lookWestPixels - vectorWestPixels;
        const totalDeltaPixels = Math.sqrt(upDeltaPixels * upDeltaPixels + westDeltaPixels * westDeltaPixels);

        // threshold is a percentage of width, and height was already properly weighted
        const distanceFromCenterSizeRatio = totalDeltaPixels / monitor.width;

        if (currentFocusedIndex === index) {
            currentFocusedDistance = distanceFromCenterSizeRatio * focusedMonitorDistance;
        }

        if (distanceFromCenterSizeRatio < closestDistance) {
            closestIndex = index;
            closestDistance = distanceFromCenterSizeRatio;
        }
    });

    const keepCurrent = currentFocusedIndex !== -1 && (smoothFollowEnabled || currentFocusedDistance < UNFOCUS_THRESHOLD);
    if (!keepCurrent) {
        if (smoothFollowEnabled || closestDistance < FOCUS_THRESHOLD) return closestIndex;

        // neither the current nor the closest will take focus, unfocus all displays
        return -1;
    }

    return currentFocusedIndex;
}

/***
 * @returns {Object} - containing `begin`, `center`, and `end` radians for rotating the given monitor
 */
function monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels, lengthToRadianFn) {
    let closestWrapPixel = monitorBeginPixel;
    let closestWrap = cachedMonitorRadians[monitorBeginPixel];
    if (closestWrap === undefined) {
        closestWrapPixel = Object.keys(cachedMonitorRadians).reduce((previousPixel, currentPixel) => {
            if (previousPixel === undefined) return currentPixel;

            const currentDelta = currentPixel - monitorBeginPixel;
            const previousDelta = previousPixel - monitorBeginPixel;

            // always prefer an exact monitor width match
            if (previousDelta % monitorLengthPixels !== 0) {
                if (currentDelta % monitorLengthPixels === 0) return currentPixel;

                // prefer placing a monitor to the right or below, even if there's a closer placement to the left or above
                if (previousDelta < 0 && currentDelta > 0) return currentPixel;

                // otherwise, just prefer the closest one
                if (Math.abs(currentDelta) < Math.abs(previousDelta)) return currentPixel;
            }
            
            return previousPixel;
        }, undefined);
        closestWrap = cachedMonitorRadians[closestWrapPixel];
    }

    const spacingRadians = lengthToRadianFn(monitorSpacingPixels);
    if (closestWrapPixel !== monitorBeginPixel) {
        // there's a gap between the cached wrap value and this one
        const gapPixels = monitorBeginPixel - closestWrapPixel;
        const gapRadians = lengthToRadianFn(gapPixels);

        // use Math.floor so if it's negative (this monitor is to the left of or above the closest) it will always
        // compenstate for the spacing that's needed at the right/bottom
        const appliedSpacingRadians = Math.floor(gapPixels / monitorLengthPixels) * spacingRadians;

        // update the closestWrap value and cache it
        closestWrap = closestWrap + gapRadians + appliedSpacingRadians;
        closestWrapPixel = monitorBeginPixel;
        cachedMonitorRadians[closestWrapPixel] = closestWrap;
    }

    const monitorRadians = lengthToRadianFn(monitorLengthPixels);
    const centerRadians = closestWrap + monitorRadians / 2;
    const endRadians = closestWrap + monitorRadians;

    // since we're computing the end values for this monitor, cache them too in case they line up with a future monitor
    const nextMonitorPixel = monitorBeginPixel + monitorLengthPixels;
    if (cachedMonitorRadians[nextMonitorPixel] === undefined)
        cachedMonitorRadians[nextMonitorPixel] = endRadians + spacingRadians;
    
    return {
        begin: closestWrap,
        center: centerRadians,
        end: endRadians
    }
}

/**
 * Convert the given monitor details into NWU vectors describing the center of the fully placed monitor, 
 * and the top-left of the partially placed monitor (minus only a single-axis rotation)
 * 
 * @param {Object} fovDetails - contains reference widthPixels, heightPixels, horizontal and vertical radians, 
*                               and distance to the center of the screen
 * @param {Object[]} monitorDetailsList - contains x, y, width, height (coordinates from top-left)
 * @param {number} monitorSpacing - visual spacing between monitors, as a percentage of the viewport width
 * @returns {Object[]} - contains NWU vectors used for rendering and focused monitor detection
 */
function monitorsToPlacements(fovDetails, monitorDetailsList, monitorSpacing) {
    const monitorPlacements = [];
    const cachedMonitorRadians = {};

    Globals.logger.log_debug(`\t\t\tFOV Details: ${JSON.stringify(fovDetails)}`);

    const conversionFns = fovDetails.curvedDisplay ? fovConversionFns.curved : fovConversionFns.flat;

    if (fovDetails.monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally

        const sideEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.widthPixels);
        const monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;
        const lengthToRadianFn = (targetWidth) => conversionFns.lengthToRadians(
            fovDetails.defaultDistanceHorizontalRadians, 
            fovDetails.widthPixels, 
            sideEdgeRadius, 
            targetWidth
        );

        cachedMonitorRadians[0] = -fovDetails.defaultDistanceHorizontalRadians / 2;
        horizontalMonitorSort(monitorDetailsList).forEach(({monitorDetails, originalIndex}) => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.x, monitorDetails.width, lengthToRadianFn);
            const monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(sideEdgeRadius, monitorDetails.width);
            const upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;

            // offset for aligning this monitor's center with the fov-sized viewport's center
            const upCenterOffsetPixels = (monitorDetails.height - fovDetails.heightPixels) / 2;

            // this is where our monitor's center is in relation to an fov-sized viewport centered about (0, 0)
            const upCenterPixels = upTopPixels - upCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex,
                centerNoRotate: [
                    monitorCenterRadius,

                    // west is centered about the FOV center
                    0,

                    // up is flat when wrapping horizontally
                    upCenterPixels
                ],
                centerLook: normalizeVector([
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),

                    // west is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center),

                    // up is flat when wrapping horizontally
                    upCenterPixels
                ]),
                rotationAngleRadians: {
                    x: 0,
                    y: -monitorWrapDetails.center
                }
            });
        });
    } else if (fovDetails.monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically

        const topEdgeRadius = conversionFns.centerToFovEdgeDistance(fovDetails.completeScreenDistancePixels, fovDetails.heightPixels);
        const monitorSpacingPixels = monitorSpacing * fovDetails.heightPixels;
        const lengthToRadianFn = (targetHeight) => conversionFns.lengthToRadians(
            fovDetails.defaultDistanceVerticalRadians, 
            fovDetails.heightPixels, 
            topEdgeRadius, 
            targetHeight
        );

        cachedMonitorRadians[0] = -fovDetails.defaultDistanceVerticalRadians / 2;
        verticalMonitorSort(monitorDetailsList).forEach(({monitorDetails, originalIndex}) => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, monitorSpacingPixels, monitorDetails.y, monitorDetails.height, lengthToRadianFn);
            const monitorCenterRadius = conversionFns.fovEdgeToScreenCenterDistance(topEdgeRadius, monitorDetails.height);
            const westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;

            // offset for aligning this monitor's center with the fov-sized viewport's center
            const westCenterOffsetPixels = (monitorDetails.width - fovDetails.widthPixels) / 2;

            // this is where our monitor's center is in relation to an fov-sized viewport centered about (0, 0)
            const westCenterPixels = westLeftPixels - westCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex,
                centerNoRotate: [
                    monitorCenterRadius,

                    // west is flat when wrapping horizontally
                    westCenterPixels,

                    // up is centered about the FOV center
                    0
                ],
                centerLook: normalizeVector([
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),

                    // west is flat when wrapping vertically
                    westCenterPixels,

                    // up is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center)
                ]),
                rotationAngleRadians: {
                    x: -monitorWrapDetails.center,
                    y: 0
                }
            });
        });
    } else {
        const monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;

        // monitors make a flat wall in front of us, no wrapping
        monitorDetailsList.forEach((monitorDetails, index) => {
            const upTopPixels = -monitorDetails.y - (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;
            const westLeftPixels = -monitorDetails.x - (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;

            // offsets for aligning this monitor's center with the fov-sized viewport's center
            const westCenterOffsetPixels = (monitorDetails.width - fovDetails.widthPixels) / 2;
            const upCenterOffsetPixels = (monitorDetails.height - fovDetails.heightPixels) / 2;

            const westCenterPixels = westLeftPixels - westCenterOffsetPixels;
            const upCenterPixels = upTopPixels - upCenterOffsetPixels;

            monitorPlacements.push({
                originalIndex: index,
                centerNoRotate: [
                    fovDetails.completeScreenDistancePixels,
                    westCenterPixels,
                    upCenterPixels
                ],
                centerLook: normalizeVector([
                    fovDetails.completeScreenDistancePixels,
                    westCenterPixels,
                    upCenterPixels
                ]),
                rotationAngleRadians: {
                    x: 0,
                    y: 0
                }
            });
        });
    }

    // put them back in the original monitor order before returning
    monitorPlacements.sort((a, b) => a.originalIndex - b.originalIndex);

    Globals.logger.log_debug(`\t\t\tMonitor placements: ${JSON.stringify(monitorPlacements)}, cached values: ${JSON.stringify(cachedMonitorRadians)}`);

    return monitorPlacements;
}

// sort monitors based on wrapping scheme before determining their placements to avoid odd gaps
function horizontalMonitorSort(monitors) {
    return monitors.map((monitor, index) => ({originalIndex: index, monitorDetails: monitor})).sort((a, b) => {
        const aMon = a.monitorDetails;
        const bMon = b.monitorDetails;

        // First compare by y-coordinate to form rows (top to bottom)
        if (aMon.y !== bMon.y) {
            return aMon.y - bMon.y;
        }
        // Then compare by x-coordinate within the same row (left to right)
        return aMon.x - bMon.x;
    });
}

// sort monitors based on wrapping scheme before determining their placements to avoid odd gaps
function verticalMonitorSort(monitors) {
    return monitors.map((monitor, index) => ({originalIndex: index, monitorDetails: monitor})).sort((a, b) => {
        const aMon = a.monitorDetails;
        const bMon = b.monitorDetails;

        // First compare by x-coordinate to form columns (left to right)
        if (aMon.x !== bMon.x) {
            return aMon.x - bMon.x;
        }
        // Then compare by y-coordinate within the same column (top to bottom)
        return aMon.y - bMon.y;
    });
}

export const VirtualDisplaysActor = GObject.registerClass({
    Properties: {
        'target-monitor': GObject.ParamSpec.jsobject(
            'target-monitor',
            'Target Monitor',
            'Details about the monitor being used as a viewport',
            GObject.ParamFlags.READWRITE
        ),
        'virtual-monitors': GObject.ParamSpec.jsobject(
            'virtual-monitors',
            'Virtual Monitors',
            'Details about the virtual monitors',
            GObject.ParamFlags.READWRITE
        ),
        'fov-details': GObject.ParamSpec.jsobject(
            'fov-details',
            'FOV Details',
            'Details about the field of view of the headset',
            GObject.ParamFlags.READWRITE
        ),
        'monitor-wrapping-scheme': GObject.ParamSpec.string(
            'monitor-wrapping-scheme',
            'Monitor Wrapping Scheme',
            'How the monitors are wrapped around the viewport',
            GObject.ParamFlags.READWRITE,
            'horizontal', ['horizontal', 'vertical', 'none']
        ),
        'monitor-spacing': GObject.ParamSpec.int(
            'monitor-spacing',
            'Monitor Spacing',
            'Visual spacing between monitors, units are 0.001 of the viewport width',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'viewport-offset-x': GObject.ParamSpec.double(
            'viewport-offset-x',
            'Viewport Offset x',
            'Offset to apply to the viewport',
            GObject.ParamFlags.READWRITE,
            -2.5, 2.5, 0.0
        ),
        'viewport-offset-y': GObject.ParamSpec.double(
            'viewport-offset-y',
            'Viewport Offset y',
            'Offset to apply to the viewport',
            GObject.ParamFlags.READWRITE,
            -2.5, 2.5, 0.0
        ),
        'monitor-placements': GObject.ParamSpec.jsobject(
            'monitor-placements',
            'Monitor Placements',
            'Target and virtual monitor placement details, as relevant to rendering',
            GObject.ParamFlags.READWRITE
        ),
        'monitor-actors': GObject.ParamSpec.jsobject(
            'monitor-actors',
            'Monitor Actors',
            'Tracking actors and details for each monitor',
            GObject.ParamFlags.READWRITE
        ),
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
            GObject.ParamFlags.READWRITE
        ),
        'curved-display': GObject.ParamSpec.boolean(
            'curved-display',
            'Curved Display',
            'Whether the displays are curved',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'smooth-follow-enabled': GObject.ParamSpec.boolean(
            'smooth-follow-enabled',
            'Smooth follow enabled',
            'Whether smooth follow is enabled',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'smooth-follow-toggle-epoch-ms': GObject.ParamSpec.uint64(
            'smooth-follow-toggle-epoch-ms',
            'Smooth follow toggle epoch time',
            'ms since epoch when smooth follow was toggled',
            GObject.ParamFlags.READWRITE,
            0, Number.MAX_SAFE_INTEGER, 0
        ),
        'show-banner': GObject.ParamSpec.boolean(
            'show-banner',
            'Show banner',
            'Whether the banner should be displayed',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'custom-banner-enabled': GObject.ParamSpec.boolean(
            'custom-banner-enabled',
            'Custom banner enabled',
            'Whether the custom banner should be displayed',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'focused-monitor-index': GObject.ParamSpec.int(
            'focused-monitor-index',
            'Focused Monitor Index',
            'Index of the monitor that is currently focused',
            GObject.ParamFlags.READWRITE,
            -1, 100, -1
        ),
        'focused-monitor-details': GObject.ParamSpec.jsobject(
            'focused-monitor-details',
            'Focused Monitor Details',
            'Details about the monitor that is currently focused',
            GObject.ParamFlags.READWRITE
        ),
        'display-size': GObject.ParamSpec.double(
            'display-size',
            'Display size',
            'Size of the display',
            GObject.ParamFlags.READWRITE,
            0.2,
            2.5,
            1.0
        ),
        'display-zoom-on-focus': GObject.ParamSpec.boolean(
            'display-zoom-on-focus',
            'Display zoom on focus',
            'Automatically move a display closer when it becomes focused.',
            GObject.ParamFlags.READWRITE,
            true
        ),
        'display-distance': GObject.ParamSpec.double(
            'display-distance',
            'Display Distance',
            'Distance of the display from the camera',
            GObject.ParamFlags.READWRITE,
            0.2, 
            2.5,
            1.05
        ),
        'headset-display-as-viewport-center': GObject.ParamSpec.boolean(
            'headset-display-as-viewport-center',
            'Headset display as viewport center',
            'Whether to use the headset display as the reference point for the center of the viewport',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'lens-vector': GObject.ParamSpec.jsobject(
            'lens-vector',
            'Lens Vector',
            'Vector representing the offset of the lens from the pivot point',
            GObject.ParamFlags.READWRITE
        ),
        'toggle-display-distance-start': GObject.ParamSpec.double(
            'toggle-display-distance-start',
            'Display distance start',
            'Start distance when using the "change distance" shortcut.',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.05
        ),
        'toggle-display-distance-end': GObject.ParamSpec.double(
            'toggle-display-distance-end',
            'Display distance end',
            'End distance when using the "change distance" shortcut.',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.05
        ),
        'framerate-cap': GObject.ParamSpec.double(
            'framerate-cap',
            'Framerate Cap',
            'Maximum framerate to render at',
            GObject.ParamFlags.READWRITE,
            0.0, 240.0, 0.0
        ),
        'look-ahead-override': GObject.ParamSpec.int(
            'look-ahead-override',
            'Look ahead override',
            'Override the look ahead value',
            GObject.ParamFlags.READWRITE,
            -1,
            45,
            -1
        ),
        'disable-anti-aliasing': GObject.ParamSpec.boolean(
            'disable-anti-aliasing',
            'Disable anti-aliasing',
            'Disable anti-aliasing for the effect',
            GObject.ParamFlags.READWRITE,
            false
        )
    }
}, class VirtualDisplaysActor extends Clutter.Actor {
    constructor(params = {}) {
        super(params);

        this._all_monitors = [
            this.target_monitor,
            ...this.virtual_monitors
        ];
        this.focused_monitor_index = -1;

        try {
            const calibratingBanner = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/calibrating.png`);
            const customBanner = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/custom_banner.png`);

            if (Clutter.Image) {
                const calibratingImage = new Clutter.Image();
                calibratingImage.set_data(calibratingBanner.get_pixels(), Cogl.PixelFormat.RGB_888,
                                        calibratingBanner.width, calibratingBanner.height, calibratingBanner.rowstride);
                this.bannerContent = Clutter.TextureContent.new_from_texture(calibratingImage.get_texture(), null);

                const customBannerImage = new Clutter.Image();
                customBannerImage.set_data(customBanner.get_pixels(), Cogl.PixelFormat.RGB_888,
                                        customBanner.width, customBanner.height, customBanner.rowstride);
                this.customBannerContent = Clutter.TextureContent.new_from_texture(customBannerImage.get_texture(), null);
            } else {
                const backend = global.stage.get_context?.().get_backend() ?? Clutter.get_default_backend();
                const coglContext = backend.get_cogl_context();
                this.bannerContent = St.ImageContent.new_with_preferred_size(calibratingBanner.width, calibratingBanner.height);
                this.bannerContent.set_bytes(
                    coglContext,
                    calibratingBanner.get_pixels(),
                    Cogl.PixelFormat.RGB_888,
                    calibratingBanner.width,
                    calibratingBanner.height,
                    calibratingBanner.rowstride
                )

                this.customBannerContent = St.ImageContent.new_with_preferred_size(customBanner.width, customBanner.height);
                this.customBannerContent.set_bytes(
                    coglContext,
                    customBanner.get_pixels(),
                    Cogl.PixelFormat.RGB_888,
                    customBanner.width,
                    customBanner.height,
                    customBanner.rowstride
                );
            }

            this.bannerActor = new Clutter.Actor({
                width: calibratingBanner.width,
                height: calibratingBanner.height,
                reactive: false
            });
            this.bannerActor.set_position(
                (this.target_monitor.width - this.bannerActor.width) / 2, 
                this.target_monitor.height * 0.75 - this.bannerActor.height / 2
            );
            this.bannerActor.set_content(this.custom_banner_enabled ? this.customBannerContent : this.bannerContent);
            this.bannerActor.hide();
        } catch (e) {
            Globals.logger.log(`ERROR: virtualdisplaysactor.js ${e.message}\n${e.stack}`);
        }

        this.monitor_actors = [];
    }

    renderMonitors() {
        // collect bindings and connections to clean up on dispose
        this._property_bindings = [];
        this._property_connections = [];

        const notifyToFunction = ((property, fn) => {
            this._property_connections.push(this.connect(`notify::${property}`, fn.bind(this)));
        }).bind(this);

        this._distance_ease_timeline = null;
        notifyToFunction('toggle-display-distance-start', this._handle_display_distance_properties_change);
        notifyToFunction('toggle-display-distance-end', this._handle_display_distance_properties_change);
        notifyToFunction('display-distance', this._handle_display_distance_properties_change);
        notifyToFunction('monitor-wrapping-scheme', this._update_monitor_placements);
        notifyToFunction('monitor-spacing', this._update_monitor_placements);
        notifyToFunction('headset-display-as-viewport-center', this._update_monitor_placements);
        notifyToFunction('curved-display', this._update_monitor_placements);
        notifyToFunction('viewport-offset-x', this._update_monitor_placements);
        notifyToFunction('viewport-offset-y', this._update_monitor_placements);
        notifyToFunction('show-banner', this._handle_banner_update);
        notifyToFunction('custom-banner-enabled', this._handle_banner_update);
        notifyToFunction('framerate-cap', this._handle_frame_rate_cap_change);
        notifyToFunction('smooth-follow-enabled', this._handle_smooth_follow_enabled_change);
        this._handle_display_distance_properties_change();
        this._handle_frame_rate_cap_change();

        const actorToDisplayRatios = [
            global.stage.width / this.target_monitor.width, 
            global.stage.height / this.target_monitor.height
        ];

        // how far this viewport actor's center is from the center of the whole stage
        const actorMidX = this.target_monitor.x + this.target_monitor.width / 2;
        const actorMidY = this.target_monitor.y + this.target_monitor.height / 2;
        const actorToDisplayOffsets = [
            (global.stage.width / 2 - (actorMidX - global.stage.x)) * 2 / this.target_monitor.width,
            (global.stage.height / 2 - (actorMidY - global.stage.y)) * 2 / this.target_monitor.height
        ];

        Globals.logger.log_debug(`\t\t\tActor to display ratios: ${actorToDisplayRatios}, offsets: ${actorToDisplayOffsets}`);
        
        this._all_monitors.forEach(((monitor, index) => {
            Globals.logger.log_debug(`\t\t\tMonitor ${index}: ${monitor.x}, ${monitor.y}, ${monitor.width}, ${monitor.height}`);

            const containerActor = new Clutter.Actor({
                clip_to_allocation: true
            });
            const viewport = new St.Bin({
                child: containerActor,
                width: monitor.width,
                height: monitor.height
            });

            // Create a clone of the stage content for this monitor
            const monitorClone = new Clutter.Clone({
                source: Main.layoutManager.uiGroup,
                clip_to_allocation: true,
                x: -monitor.x,
                y: -monitor.y
            });

            // Add the monitor actor to the scene
            containerActor.add_child(monitorClone);
            const effect = new VirtualDisplayEffect({
                focused_monitor_index: this.focused_monitor_index,
                imu_snapshots: this.imu_snapshots,
                monitor_index: index,
                monitor_details: monitor,
                monitor_placements: this.monitor_placements,
                fov_details: this.fov_details,
                target_monitor: this.target_monitor,
                display_distance: this.display_distance,
                display_distance_default: this._display_distance_default(),
                actor_to_display_ratios: actorToDisplayRatios,
                actor_to_display_offsets: actorToDisplayOffsets,
                lens_vector: this.lens_vector,
                show_banner: this.show_banner
            });
            viewport.add_effect_with_name('viewport-effect', effect);
            this.add_child(viewport);
            Shell.util_set_hidden_from_pick(viewport, true);

            this.monitor_actors.push({
                viewport,
                containerActor,
                monitorClone,
                effect,
                monitorDetails: monitor
            });

            // do this so the primary monitor is always on top at first, before the focused monitor logic comes into play
            this.set_child_below_sibling(viewport, null);

            [
                'monitor-placements',
                'fov-details',
                'imu-snapshots',
                'smooth-follow-enabled',
                'smooth-follow-toggle-epoch-ms',
                'focused-monitor-index',
                'lens-vector',
                'look-ahead-override',
                'disable-anti-aliasing',
                'show-banner'
            ].forEach((property => {
                this._property_bindings.push(this.bind_property(property, effect, property, GObject.BindingFlags.DEFAULT));
            }));

            const updateEffectDistanceDefault = (() => {
                effect.no_distance_ease = Math.abs(this.display_distance - effect.display_distance) <= 0.05;
                effect.display_distance = this.display_distance;
                effect.display_distance_default = this._display_distance_default();
            }).bind(this);
            this._property_connections.push(this.connect('notify::display-distance', updateEffectDistanceDefault));
            this._property_connections.push(this.connect('notify::toggle-display-distance-start', updateEffectDistanceDefault));
            this._property_connections.push(this.connect('notify::toggle-display-distance-end', updateEffectDistanceDefault));

            // in addition to rendering distance properly in the shader, the parent actor determines overlap based on child ordering
            effect.connect('notify::is-closest', ((actor, _pspec) => {
                if (!this._is_disposed && actor.is_closest) {
                    this.set_child_above_sibling(viewport, null);
                    if (this.show_banner && this.bannerActor) this.set_child_above_sibling(this.bannerActor, null);
                }
            }).bind(this));
        }).bind(this));

        if (this.bannerActor) {
            this.add_child(this.bannerActor);
            if (this.show_banner) {
                this.set_child_above_sibling(this.bannerActor, null);
                this.bannerActor.show();
            }
        }

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, (() => {
            if (this._is_disposed) return GLib.SOURCE_REMOVE;

            if (this.show_banner) {
                this.focused_monitor_index = -1;
                this.focused_monitor_details = null;
            } else if (this.imu_snapshots && (!this._smooth_follow_slerping || this.focused_monitor_index === -1)) {
                // if smooth follow is enabled, use the origin IMU data to inform the initial focused monitor
                // since it reflects where the user is looking in relation to the original monitor positions
                const currentPoseQuat = this.smooth_follow_enabled ? 
                    this.imu_snapshots.smooth_follow_origin.splice(0, 4) : 
                    this.imu_snapshots.imu_data.splice(0, 4);

                const focusedMonitorIndex = findFocusedMonitor(
                    currentPoseQuat,
                    this.monitor_placements.map(monitorVectors => monitorVectors.centerLook), 
                    this.focused_monitor_index,
                    this.display_distance / this._display_distance_default(),
                    this.smooth_follow_enabled,
                    this.fov_details,
                    this._all_monitors
                );

                if (this.focused_monitor_index !== focusedMonitorIndex) {
                    Globals.logger.log_debug(`Switching to monitor ${focusedMonitorIndex}`);
                    this.focused_monitor_index = focusedMonitorIndex;
                    if (focusedMonitorIndex !== -1) {
                        this.focused_monitor_details = this._all_monitors[focusedMonitorIndex];
                    } else {
                        this.focused_monitor_details = null;
                    }
                }
            }

            return GLib.SOURCE_CONTINUE;
        }).bind(this));

        this._redraw_timeline = Clutter.Timeline.new_for_actor(global.stage, 1000);
        this._redraw_timeline.connect('new-frame', (() => {
            // let's try to cap the forced redraw rate
            if (this._is_disposed || this._last_redraw !== undefined && Date.now() - this._last_redraw < this._cap_frametime_ms) return;

            Globals.data_stream.refresh_data();
            this.imu_snapshots = Globals.data_stream.imu_snapshots;
            this.monitor_actors.forEach(({ monitorClone }) => monitorClone.queue_redraw());
            this._last_redraw = Date.now();
        }).bind(this));
        this._redraw_timeline.set_repeat_count(-1);
        this._redraw_timeline.start();
    }

    _display_distance_default() {
        return Math.max(this.display_distance, this.toggle_display_distance_start, this.toggle_display_distance_end);
    }

    _fov_details() {
        const aspect = this.target_monitor.width / this.target_monitor.height;
        const fovRadians = diagonalToCrossFOVs(degreeToRadian(Globals.data_stream.device_data.displayFov), aspect);

        // adjusted angles based on how far away the screens are e.g. a closer screen takes up a larger slice of our FOV
        const defaultDistanceVerticalRadians = 2 * Math.atan(Math.tan(fovRadians.vertical / 2) / this._display_distance_default());
        const defaultDistanceHorizontalRadians = 2 * Math.atan(Math.tan(fovRadians.horizontal / 2) / this._display_distance_default());

        // distance needed for the FOV-sized monitor to fill up the screen
        const fullScreenDistance = this.target_monitor.height / 2 / Math.tan(fovRadians.vertical / 2);
        const lensDistancePixels = fullScreenDistance / (1.0 - Globals.data_stream.device_data.lensDistanceRatio) - fullScreenDistance;

        // distance of a display at the default (most zoomed out) distance, plus the lens distance constant
        const lensToScreenDistance = this.target_monitor.height / 2 / Math.tan(defaultDistanceVerticalRadians / 2);
        const completeScreenDistancePixels = lensToScreenDistance + lensDistancePixels;

        return {
            widthPixels: this.target_monitor.width,
            heightPixels: this.target_monitor.height,
            defaultDistanceVerticalRadians,
            defaultDistanceHorizontalRadians,
            lensDistancePixels,
            completeScreenDistancePixels,
            monitorWrappingScheme: this._actual_wrap_scheme(),
            curvedDisplay: this.curved_display
        };
    }

    _actual_wrap_scheme() {
        // use automatic wrapping if the none/flat wrapping option is selected and the display is supposed to be curved
        const noneUseAutomatic = this.monitor_wrapping_scheme === 'none' && this.curved_display;
        if (this.monitor_wrapping_scheme !== 'automatic' && !noneUseAutomatic) return this.monitor_wrapping_scheme;

        const minX = Math.min(...this._all_monitors.map(monitor => monitor.x));
        const maxX = Math.max(...this._all_monitors.map(monitor => monitor.x + monitor.width));
        const minY = Math.min(...this._all_monitors.map(monitor => monitor.y));
        const maxY = Math.max(...this._all_monitors.map(monitor => monitor.y + monitor.height));

        if ((maxX - minX) / this.target_monitor.width >= (maxY - minY) / this.target_monitor.height) {
            return 'horizontal';
        } else {
            return 'vertical';
        }
    }

    _update_monitor_placements() {
        try {
            const minX = Math.min(...this._all_monitors.map(monitor => monitor.x));
            const maxX = Math.max(...this._all_monitors.map(monitor => monitor.x + monitor.width));
            const minY = Math.min(...this._all_monitors.map(monitor => monitor.y));
            const maxY = Math.max(...this._all_monitors.map(monitor => monitor.y + monitor.height));

            // the beginning edges of the viewport if it's centered on all displays
            const allDisplaysCenterXBegin = (minX + maxX) / 2 - this.target_monitor.width / 2;
            const allDisplaysCenterYBegin = (minY + maxY) / 2 - this.target_monitor.height / 2;

            const viewportXBegin = this.headset_display_as_viewport_center ? this.target_monitor.x : allDisplaysCenterXBegin;
            const viewportYBegin = this.headset_display_as_viewport_center ? this.target_monitor.y : allDisplaysCenterYBegin;

            this.fov_details = this._fov_details();
            this.lens_vector = [0.0, 0.0, -this.fov_details.lensDistancePixels];
            this.monitor_placements = monitorsToPlacements(
                this.fov_details,

                // shift all monitors so they center around the viewport center, then adjusted by the offsets
                this._all_monitors.map(monitor => ({
                    x: monitor.x - viewportXBegin - this.viewport_offset_x * this.target_monitor.width,
                    y: monitor.y - viewportYBegin + this.viewport_offset_y * this.target_monitor.height,
                    width: monitor.width,
                    height: monitor.height
                })),
                this.monitor_spacing / 1000.0
            );
        } catch (e) {
            Globals.logger.log(`ERROR: virtualdisplaysactor.js _update_monitor_placements ${e.message}\n${e.stack}`);
        }
    }
    
    _handle_display_distance_properties_change() {
        const distance_from_end = Math.abs(this.display_distance - this.toggle_display_distance_end);
        const distance_from_start = Math.abs(this.display_distance - this.toggle_display_distance_start);
        this._is_display_distance_at_end = distance_from_end < distance_from_start;
        this._update_monitor_placements();
    }

    _handle_banner_update() {
        if (this.bannerActor) {
            if (this.show_banner) {
                this.bannerActor.set_content(this.custom_banner_enabled ? this.customBannerContent : this.bannerContent);
                this.bannerActor.show();
            } else {
                this.bannerActor.hide();
            }
        }
    }

    _handle_frame_rate_cap_change() {
        // add a margin to the cap time so we don't cut off frames that come in close
        const frametime_margin = 0.75;
        this._cap_frametime_ms = this.framerate_cap === 0 ? 0.0 : Math.floor(1000 * frametime_margin / this.framerate_cap);
    }

    _handle_smooth_follow_enabled_change() {
        if (this._smooth_follow_timeout_id !== undefined) GLib.source_remove(this._smooth_follow_timeout_id);

        this._smooth_follow_slerping = true;
        this._smooth_follow_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SMOOTH_FOLLOW_SLERP_TIMELINE_MS, (() => {
            this._smooth_follow_slerping = false;
            this._smooth_follow_timeout_id = undefined;
            return GLib.SOURCE_REMOVE;
        }).bind(this));
    }

    _change_distance() {
        this.display_distance = this._is_display_distance_at_end ? 
            this.toggle_display_distance_start : this.toggle_display_distance_end;
    }

    vfunc_dispose() {
        Globals.logger.log_debug(`Disposing VirtualMonitorsActor`);
        this._is_disposed = true;

        if (this._redraw_timeline) {
            this._redraw_timeline.stop();
            this._redraw_timeline = null;
        }

        this.monitor_actors.forEach(({ viewport, containerActor, monitorClone, effect }) => {
            viewport.remove_effect(effect);
            containerActor.remove_child(monitorClone);
            viewport.set_child(null);
            this.remove_child(viewport);
        });
        this.monitor_actors = [];

        this._property_bindings.forEach(binding => binding.unbind());
        this._property_bindings = [];

        this._property_connections.forEach(connection => this.disconnect(connection));
    }
});