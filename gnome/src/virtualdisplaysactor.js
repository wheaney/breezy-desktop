import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { VirtualDisplayEffect, SMOOTH_FOLLOW_SLERP_TIMELINE_MS } from './virtualdisplayeffect.js';
import { degreeToRadian, diagonalToCrossFOVs, fovConversionFns } from './shared/math.js';
import { findFocusedMonitor, monitorsToPlacements } from './shared/displayPlacement.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Globals from './globals.js';


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
        'pose-has-position': GObject.ParamSpec.boolean(
            'pose-has-position',
            'Pose Has Position',
            'Whether the IMU snapshots contain pose data',
            GObject.ParamFlags.READWRITE,
            false
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
            0.1,
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
            0.1, 
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
            0.1, 
            2.5, 
            1.05
        ),
        'toggle-display-distance-end': GObject.ParamSpec.double(
            'toggle-display-distance-end',
            'Display distance end',
            'End distance when using the "change distance" shortcut.',
            GObject.ParamFlags.READWRITE, 
            0.1, 
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

        this._all_monitors_unmodified = [
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

        notifyToFunction('toggle-display-distance-start', this._handle_display_size_distance_change);
        notifyToFunction('toggle-display-distance-end', this._handle_display_size_distance_change);
        notifyToFunction('display-distance', this._handle_display_size_distance_change);
        notifyToFunction('display-size', this._handle_display_size_distance_change);
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
        this._handle_display_size_distance_change();
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

        this._all_monitors_unmodified.forEach(((monitor, index) => {
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
                pose_has_position: this.pose_has_position,
                monitor_index: index,
                monitor_details: monitor,
                monitor_placements: this.monitor_placements,
                fov_details: this.fov_details,
                target_monitor: this.target_monitor,
                display_size: this.display_size,
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
                'display-size',
                'fov-details',
                'imu-snapshots',
                'pose-has-position',
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
            } else if (this.imu_snapshots && 
                       (!this.smooth_follow_enabled || this.focused_monitor_index === -1) && 
                       (!this._smooth_follow_slerping || this.focused_monitor_index === -1)) {
                // if smooth follow is enabled, use the origin IMU data to inform the initial focused monitor
                // since it reflects where the user is looking in relation to the original monitor positions
                const currentOrientationQuat = this.smooth_follow_enabled ? 
                    this.imu_snapshots.smooth_follow_origin.splice(0, 4) : 
                    this.imu_snapshots.pose_orientation.splice(0, 4);

                const currentPosition = this.pose_has_position ?
                    this.imu_snapshots.pose_position.map(coord => coord * this.fov_details.fullScreenDistancePixels) :
                    [0.0, 0.0, 0.0];

                const focusedMonitorIndex = findFocusedMonitor(
                    currentOrientationQuat,
                    currentPosition,
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

    _size_adjusted_target_monitor() {
        return this._all_monitors[0];
    }

    _display_distance_default() {
        return Math.max(this.display_distance, this.toggle_display_distance_start, this.toggle_display_distance_end);
    }

    _fov_details() {
        const aspect = this.target_monitor.width / this.target_monitor.height;
        const fovLengths = diagonalToCrossFOVs(degreeToRadian(Globals.data_stream.device_data.displayFov), aspect);
        const monitorWrappingScheme = this._actual_wrap_scheme();
        const defaultDistance = this._display_distance_default();
        const lensDistanceComplement = 1.0 - Globals.data_stream.device_data.lensDistanceRatio;
        const lensDistanceFactor = (1.0 / lensDistanceComplement) - 1.0;
        const horizontalConversions = this.curved_display && monitorWrappingScheme === 'horizontal' ? fovConversionFns.curved : fovConversionFns.flat;
        const verticalConversions = this.curved_display && monitorWrappingScheme === 'vertical' ? fovConversionFns.curved : fovConversionFns.flat;
        
        // adjust FOV to a new focal point distance while keeping screens the same size
        // i.e. focus from pivot point to new screen distance, adjusted from lens at unit distance
        const defaultDistanceVerticalRadians = verticalConversions.fovRadiansAtDistance(
            fovLengths.verticalRadians, 
            fovLengths.heightUnitDistance,
            defaultDistance
        );
        const defaultDistanceHorizontalRadians = horizontalConversions.fovRadiansAtDistance(
            fovLengths.horizontalRadians, 
            fovLengths.widthUnitDistance,
            defaultDistance
        );

        // distance needed for the FOV-sized monitor to fill up the screen, as measured from the lenses
        const lensToUnitDistancePixels = this.target_monitor.width / fovLengths.widthUnitDistance;

        // distance from pivot point to lens
        const lensDistancePixels = lensToUnitDistancePixels * lensDistanceFactor;

        // distance from pivot point to full screen (monitor at unit distance from lens)
        const fullScreenDistancePixels = lensToUnitDistancePixels + lensDistancePixels;

        // distance of a display at the default (most zoomed out) distance from the pivot point
        const completeScreenDistancePixels = fullScreenDistancePixels * defaultDistance;

        return {
            widthPixels: this.target_monitor.width,
            distanceAdjustedSize: this._distance_adjusted_size,
            sizeAdjustedWidthPixels: this.target_monitor.width * this._distance_adjusted_size,
            heightPixels: this.target_monitor.height,
            sizeAdjustedHeightPixels: this.target_monitor.height * this._distance_adjusted_size,
            defaultDistanceVerticalRadians,
            defaultDistanceHorizontalRadians,
            lensDistancePixels,
            fullScreenDistancePixels,
            completeScreenDistancePixels,
            monitorWrappingScheme,
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

        const targetMonitor = this._size_adjusted_target_monitor();
        if ((maxX - minX) / targetMonitor.width >= (maxY - minY) / targetMonitor.height) {
            return 'horizontal';
        } else {
            return 'vertical';
        }
    }

    _update_monitor_placements() {
        try {
            const targetMonitor = this._size_adjusted_target_monitor();

            const minX = Math.min(...this._all_monitors.map(monitor => monitor.x));
            const maxX = Math.max(...this._all_monitors.map(monitor => monitor.x + monitor.width));
            const minY = Math.min(...this._all_monitors.map(monitor => monitor.y));
            const maxY = Math.max(...this._all_monitors.map(monitor => monitor.y + monitor.height));

            // the beginning edges of the viewport if it's centered on all displays
            const allDisplaysCenterXBegin = (minX + maxX) / 2 - targetMonitor.width / 2;
            const allDisplaysCenterYBegin = (minY + maxY) / 2 - targetMonitor.height / 2;

            const viewportXBegin = this.headset_display_as_viewport_center ? targetMonitor.x : allDisplaysCenterXBegin;
            const viewportYBegin = this.headset_display_as_viewport_center ? targetMonitor.y : allDisplaysCenterYBegin;

            this.fov_details = this._fov_details();
            this.lens_vector = [this.fov_details.lensDistancePixels, 0.0, 0.0];
            this.monitor_placements = monitorsToPlacements(
                this.fov_details,

                // shift all monitors so they center around the viewport center, then adjusted by the offsets
                this._all_monitors.map(monitor => ({
                    x: monitor.x - viewportXBegin - this.viewport_offset_x * targetMonitor.width,
                    y: monitor.y - viewportYBegin + this.viewport_offset_y * targetMonitor.height,
                    width: monitor.width,
                    height: monitor.height
                })),
                this.monitor_spacing / 1000.0
            );
        } catch (e) {
            Globals.logger.log(`ERROR: virtualdisplaysactor.js _update_monitor_placements ${e.message}\n${e.stack}`);
        }
    }
    
    _handle_display_size_distance_change() {
        this._distance_adjusted_size = (this._display_distance_default() - Globals.data_stream.device_data.lensDistanceRatio) * this.display_size;

        const distance_from_end = Math.abs(this.display_distance - this.toggle_display_distance_end);
        const distance_from_start = Math.abs(this.display_distance - this.toggle_display_distance_start);
        this._is_display_distance_at_end = distance_from_end < distance_from_start;

        const sizeComplement = (1.0 - this._distance_adjusted_size) / 2.0;
        const sizeViewportOffsetX = sizeComplement * this.target_monitor.width;
        const sizeViewportOffsetY = sizeComplement * this.target_monitor.height;
        this._all_monitors = this._all_monitors_unmodified.map(monitor => ({
            x: monitor.x * this._distance_adjusted_size + sizeViewportOffsetX,
            y: monitor.y * this._distance_adjusted_size + sizeViewportOffsetY,
            width: monitor.width * this._distance_adjusted_size,
            height: monitor.height * this._distance_adjusted_size
        }));
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