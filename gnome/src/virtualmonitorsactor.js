import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Globals from './globals.js';

function applyQuaternionToVector(vector, quaternion) {
    const t = [
        2.0 * (quaternion[1] * vector[2] - quaternion[2] * vector[1]),
        2.0 * (quaternion[2] * vector[0] - quaternion[0] * vector[2]),
        2.0 * (quaternion[0] * vector[1] - quaternion[1] * vector[0])
    ];
    return [
        vector[0] + quaternion[3] * t[0] + quaternion[1] * t[2] - quaternion[2] * t[1],
        vector[1] + quaternion[3] * t[1] + quaternion[2] * t[0] - quaternion[0] * t[2],
        vector[2] + quaternion[3] * t[2] + quaternion[0] * t[1] - quaternion[1] * t[0]
    ];
}

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
 * @param {Object} fovDetails - Contains reference widthPixels, heightPixels, horizontal and vertical radians, and pixel distance to the center of the screen
 * @param {Object[]} monitorsDetails - Contains x, y, width, height (coordinates from top-left) for each monitor
 * @returns {number} Index of the closest vector, if it surpasses the previous closest index by a certain margin, otherwise the previous index
 */
function findFocusedMonitor(quaternion, monitorVectors, currentFocusedIndex, focusedMonitorDistance, fovDetails, monitorsDetails) {
    const lookVector = [1.0, 0.0, 0.0]; // NWU vector pointing to the center of the screen
    const rotatedLookVector = applyQuaternionToVector(lookVector, quaternion);

    let closestIndex = -1;
    let closestDistance = Infinity;
    let currentFocusedDistance = Infinity;

    // find the vector closest to the rotated look vector
    monitorVectors.forEach((vector, index) => {
        const distance = Math.acos(
            Math.min(1.0, Math.max(-1.0, vector[0] * rotatedLookVector[0] + vector[1] * rotatedLookVector[1] + vector[2] * rotatedLookVector[2]))
        );

        const distancePixels = fovDetails.fullScreenDistance * Math.tan(distance);
        const monitorDiagonalPixels = Math.sqrt(Math.pow(monitorsDetails[index].width, 2) + Math.pow(monitorsDetails[index].height, 2));
        const distanceToMonitorSize = distancePixels / monitorDiagonalPixels;

        if (currentFocusedIndex === index) {
            currentFocusedDistance = distanceToMonitorSize * focusedMonitorDistance;
        }

        if (distanceToMonitorSize < closestDistance) {
            closestIndex = index;
            closestDistance = distanceToMonitorSize;
        }
    });

    const keepCurrent = currentFocusedIndex !== -1 && currentFocusedDistance < UNFOCUS_THRESHOLD;
    if (!keepCurrent) {
        if (closestDistance < FOCUS_THRESHOLD) return closestIndex;

        // neither the current nor the closest will take focus, unfocus all displays
        return -1;
    }

    return currentFocusedIndex;
}

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180.0;
}

/***
 * @returns {Object} - containing `begin`, `center`, and `end` radians for rotating the given monitor
 */
function monitorWrap(cachedMonitorRadians, radiusPixels, monitorSpacingPixels, monitorBeginPixel, monitorLengthPixels) {
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

    const spacingRadians = Math.asin(monitorSpacingPixels / 2 / radiusPixels) * 2;
    if (closestWrapPixel !== monitorBeginPixel) {
        // there's a gap between the cached wrap value and this one
        const gapPixels = monitorBeginPixel - closestWrapPixel;
        const gapHalfRadians = Math.asin(gapPixels / 2 / radiusPixels);
        const gapRadians = gapHalfRadians * 2;

        // use Math.floor so if it's negative (this monitor is to the left of or above the closest) it will always
        // compenstate for the spacing that's needed at the right/bottom
        const appliedSpacingRadians = Math.floor(gapPixels / monitorLengthPixels) * spacingRadians;

        // update the closestWrap value and cache it
        closestWrap = closestWrap + gapRadians + appliedSpacingRadians;
        closestWrapPixel = monitorBeginPixel;
        cachedMonitorRadians[closestWrapPixel] = closestWrap;
    }

    const monitorHalfRadians = Math.asin(monitorLengthPixels / 2 / radiusPixels);
    const centerRadians = closestWrap + monitorHalfRadians;
    const endRadians = centerRadians + monitorHalfRadians;

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
 * @param {string} monitorWrappingScheme - horizontal, vertical, none
 * @returns {Object[]} - contains NWU vectors pointing to `topLeftNoRotate` and `center` of each monitor 
 *                       and a `rotation` angle for the given wrapping scheme
 */
function monitorsToPlacements(fovDetails, monitorDetailsList, monitorWrappingScheme, monitorSpacing) {
    const monitorPlacements = [];
    const cachedMonitorRadians = {};

    Globals.logger.log_debug(`\t\t\tFOV Details: ${JSON.stringify(fovDetails)}, Monitor Wrapping Scheme: ${monitorWrappingScheme}`);

    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally

        // distance to a horizontal edge is the hypothenuse of the triangle where the opposite side is half the width of the reference fov screen
        const edgeRadius = fovDetails.widthPixels / 2 / Math.sin(fovDetails.horizontalRadians / 2);
        const monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;

        cachedMonitorRadians[0] = -fovDetails.horizontalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, edgeRadius, monitorSpacingPixels, monitorDetails.x, monitorDetails.width);
            const monitorCenterRadius = Math.sqrt(Math.pow(edgeRadius, 2) - Math.pow(monitorDetails.width / 2, 2));
            const upTopPixels = monitorDetails.y + (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;
            const upCenterPixels = upTopPixels + monitorDetails.height / 2 - fovDetails.heightPixels / 2;

            monitorPlacements.push({
                topLeftNoRotate: [
                    monitorCenterRadius,

                    // west stays aligned with (0, 0), will apply rotationAngleRadians value during rendering
                    -(monitorDetails.width - fovDetails.widthPixels) / 2,

                    // up is flat when wrapping horizontally, apply it here as a constant, not touched by rendering
                    -upTopPixels
                ],
                centerNoRotate: [
                    monitorCenterRadius,

                    // west centered about the FOV center
                    0,

                    // up is flat when wrapping horizontally
                    -upCenterPixels
                ],
                center: [
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),

                    // west is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center),

                    // up is flat when wrapping horizontally
                    -upCenterPixels
                ],
                rotationAngleRadians: {
                    x: 0,
                    y: -monitorWrapDetails.center
                }
            });
        });
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically

        // distance to a vertical edge is the hypothenuse of the triangle where the opposite side is half the height of the reference fov screen
        const edgeRadius = fovDetails.heightPixels / 2 / Math.sin(fovDetails.verticalRadians / 2);
        const monitorSpacingPixels = monitorSpacing * fovDetails.heightPixels;

        cachedMonitorRadians[0] = -fovDetails.verticalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(cachedMonitorRadians, edgeRadius, monitorSpacingPixels, monitorDetails.y, monitorDetails.height);
            const monitorCenterRadius = Math.sqrt(Math.pow(edgeRadius, 2) - Math.pow(monitorDetails.height / 2, 2));
            const westPixels = monitorDetails.x + (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;
            const westCenterPixels = westPixels + monitorDetails.width / 2 - fovDetails.widthPixels / 2;

            monitorPlacements.push({
                topLeftNoRotate: [
                    monitorCenterRadius,

                    // west is flat when wrapping vertically, apply it here as a constant, not touched by rendering
                    westPixels,

                    // up stays aligned with (0, 0), will apply rotationAngleRadians value during rendering
                    (monitorDetails.height - fovDetails.heightPixels) / 2
                ],
                centerNoRotate: [
                    monitorCenterRadius,

                    // west is flat when wrapping horizontally
                    westCenterPixels,

                    // west centered about the FOV center
                    0
                ],
                center: [
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    monitorCenterRadius * Math.cos(monitorWrapDetails.center),

                    // west is flat when wrapping vertically
                    -westCenterPixels,

                    // up is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -monitorCenterRadius * Math.sin(monitorWrapDetails.center)
                ],
                rotationAngleRadians: {
                    x: -monitorWrapDetails.center,
                    y: 0
                }
            });
        });
    } else {
        const monitorSpacingPixels = monitorSpacing * fovDetails.widthPixels;

        // monitors make a flat wall in front of us, no wrapping
        monitorDetailsList.forEach(monitorDetails => {
            const upPixels = monitorDetails.y + (monitorDetails.y / fovDetails.heightPixels) * monitorSpacingPixels;
            const westPixels = monitorDetails.x + (monitorDetails.x / fovDetails.widthPixels) * monitorSpacingPixels;
            const westCenterPixels = westPixels + monitorDetails.width / 2 - fovDetails.widthPixels / 2;
            const upCenterPixels = upPixels + monitorDetails.height / 2 - fovDetails.heightPixels / 2;
            monitorPlacements.push({
                topLeftNoRotate: [
                    fovDetails.fullScreenDistance,
                    westPixels,
                    -upPixels
                ],
                centerNoRotate: [
                    fovDetails.fullScreenDistance,
                    westCenterPixels,
                    -upCenterPixels
                ],
                center: [
                    fovDetails.fullScreenDistance,
                    -westCenterPixels,
                    -upCenterPixels
                ],
                rotationAngleRadians: {
                    x: 0,
                    y: 0
                }
            });
        });
    }

    Globals.logger.log_debug(`\t\t\tMonitor placements: ${JSON.stringify(monitorPlacements)}, cached values: ${JSON.stringify(cachedMonitorRadians)}`);

    return monitorPlacements;
}

function monitorVectorToRotationAngle(vector, monitorWrappingScheme) {
    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally
        return {
            angle: Math.atan2(vector[1], vector[0]),
            axis: Clutter.RotateAxis.Y_AXIS
        };
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically
        return {
            angle: Math.atan2(vector[2], vector[0]),
            axis: Clutter.RotateAxis.X_AXIS
        }
    } else {
        // no rotation
        return undefined;
    }
}

// how far to look ahead is how old the IMU data is plus a constant that is either the default for this device or an override
function lookAheadMS(imuDateMs, lookAheadCfg, override) {
    // how stale the imu data is
    const dataAge = Date.now() - imuDateMs;

    return (override === -1 ? lookAheadCfg[0] : override) + dataAge;
}

export const VirtualMonitorEffect = GObject.registerClass({
    Properties: {
        'monitor-index': GObject.ParamSpec.int(
            'monitor-index',
            'Monitor Index',
            'Index of the monitor that this effect is applied to',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'monitor-placements': GObject.ParamSpec.jsobject(
            'monitor-placements',
            'Monitor Placements',
            'Target and virtual monitor placement details, as relevant to rendering',
            GObject.ParamFlags.READWRITE
        ),
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
            GObject.ParamFlags.READWRITE
        ),
        'width': GObject.ParamSpec.int(
            'width',
            'Width',
            'Width of the viewport',
            GObject.ParamFlags.READWRITE,
            1, 10000, 1920
        ),
        'height': GObject.ParamSpec.int(
            'height',
            'Height',
            'Height of the viewport',
            GObject.ParamFlags.READWRITE,
            1, 10000, 1080
        ),
        'focused-monitor-index': GObject.ParamSpec.int(
            'focused-monitor-index',
            'Focused Monitor Index',
            'Index of the monitor that is currently focused',
            GObject.ParamFlags.READWRITE,
            -1, 100, -1
        ),
        'display-distance': GObject.ParamSpec.double(
            'display-distance',
            'Display Distance',
            'Distance of the display from the camera',
            GObject.ParamFlags.READWRITE,
            0.0, 
            2.5, 
            1.0
        ),
        'display-position': GObject.ParamSpec.jsobject(
            'display-position',
            'Display Position',
            'Position of the display in COGL (ESU) coordinates',
            GObject.ParamFlags.READWRITE
        ),
        'display-distance-default': GObject.ParamSpec.double(
            'display-distance-default',
            'Display distance default',
            'Distance to use when not explicitly set, or when reset',
            GObject.ParamFlags.READWRITE, 
            0.2, 
            2.5, 
            1.0
        ),
        'show-banner': GObject.ParamSpec.boolean(
            'show-banner',
            'Show banner',
            'Whether the banner should be displayed',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'lens-vector': GObject.ParamSpec.jsobject(
            'lens-vector',
            'Lens Vector',
            'Vector representing the offset of the lens from the pivot point',
            GObject.ParamFlags.READWRITE
        ),
        'actor-to-display-ratios': GObject.ParamSpec.jsobject(
            'actor-to-display-ratios',
            'Actor to Display Ratios',
            'Ratios to convert actor coordinates to display coordinates',
            GObject.ParamFlags.READWRITE
        ),
        'actor-to-display-offsets': GObject.ParamSpec.jsobject(
            'actor-to-display-offsets',
            'Actor to Display Offsets',
            'Offsets to convert actor coordinates to display coordinates',
            GObject.ParamFlags.READWRITE
        ),
        'is-closest': GObject.ParamSpec.boolean(
            'is-closest',
            'Is Closest',
            'Whether this monitor is the closest to the camera',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'disable-anti-aliasing': GObject.ParamSpec.boolean(
            'disable-anti-aliasing',
            'Disable anti-aliasing',
            'Disable anti-aliasing for the effect',
            GObject.ParamFlags.READWRITE,
            false
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
    }
}, class VirtualMonitorEffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);

        this._current_display_distance = this._is_focused() ? this.display_distance : this.display_distance_default;

        this.connect('notify::display-distance', this._update_display_distance.bind(this));
        this.connect('notify::focused-monitor-index', this._update_display_distance.bind(this));
        this.connect('notify::monitor-placements', this._update_display_position_uniforms.bind(this));
        this.connect('notify::monitor-wrapping-scheme', this._update_display_position_uniforms.bind(this));
        this.connect('notify::show-banner', this._handle_banner_update.bind(this));
    }

    _is_focused() {
        return this.focused_monitor_index === this.monitor_index;
    }

    _update_display_distance() {
        const desired_distance = this._is_focused() ? this.display_distance : this.display_distance_default;
        if (this._distance_ease_timeline?.is_playing()) {
            // we're already easing towards the desired distance, do nothing
            if (this._distance_ease_target === desired_distance) return;

            this._distance_ease_timeline.stop();
        }
        
        // if we're the focused display, we'll double the timeline and wait for the first half to let other 
        // displays ease out first
        this._distance_ease_focus = this._is_focused();
        const timeline_ms = this._distance_ease_focus ? 500 : 150;

        this._distance_ease_start = this._current_display_distance;
        this._distance_ease_timeline = Clutter.Timeline.new_for_actor(this.get_actor(), timeline_ms);

        this._distance_ease_target = desired_distance;
        this._distance_ease_timeline.connect('new-frame', (() => {
            let progress = this._distance_ease_timeline.get_progress();
            if (this._distance_ease_focus) {
                // if we're the focused display, wait for the first half of the timeline to pass
                if (progress < 0.5) return;

                // treat the second half of the timeline as its own full progression
                progress = (progress - 0.5) * 2;

                // put this display in front as it starts to easy in
                this.is_closest = true;
            } else {
                this.is_closest = false;
            }

            this._current_display_distance = this._distance_ease_start + 
                progress * (this._distance_ease_target - this._distance_ease_start);
            this._update_display_position_uniforms();
        }).bind(this));

        this._distance_ease_timeline.start();
    }

    _update_display_position_uniforms() {
        // this is in NWU coordinates
        const monitorPlacement = this.monitor_placements[this.monitor_index];
        // Globals.logger.log_debug(`\t\t\tMonitor ${this.monitor_index} vectors: ${JSON.stringify(monitorPlacement)}`);

        // use the center vector with the distance applied to determine how much to move each coordinate, so they all move uniformly
        const inverseAppliedDistance = 1.0 - this._current_display_distance / this.display_distance_default;
        const distanceDelta = monitorPlacement.centerNoRotate.map(coord => coord * inverseAppliedDistance);
        const noRotationVector = monitorPlacement.topLeftNoRotate.map((coord, index) => coord - distanceDelta[index]);

        // convert to CoGL's east-down-south coordinates and apply display distance
        this.set_uniform_float(this.get_uniform_location("u_display_position"), 3, 
            [-noRotationVector[1], -noRotationVector[2], -noRotationVector[0]]);

        const rotation_radians = this.monitor_placements[this.monitor_index].rotationAngleRadians;
        this.set_uniform_float(this.get_uniform_location("u_rotation_x_radians"), 1, [rotation_radians.x]);
        this.set_uniform_float(this.get_uniform_location("u_rotation_y_radians"), 1, [rotation_radians.y]);
    }

    _handle_banner_update() {
        this.set_uniform_float(this.get_uniform_location("u_show_banner"), 1, [this.show_banner ? 1.0 : 0.0]);
    }

    perspective(fovVerticalRadians, aspect, near, far) {
        const fovHorizontalRadians = fovVerticalRadians * aspect;
        const f = 1.0 / Math.tan(fovHorizontalRadians / 2.0);
        const range = far - near;
    
        return [
            f / aspect, 0,          0,                              0,
            0,          f,          0,                              0,
            0,          0,          - (far + near) / range,        -1,
            0,          0,          - (2.0 * near * far) / range,   0
        ];
    }

    vfunc_build_pipeline() {
        const declarations = `
            uniform bool u_show_banner;
            uniform mat4 u_imu_data;
            uniform float u_look_ahead_ms;
            uniform vec4 u_look_ahead_cfg;
            uniform mat4 u_projection_matrix;
            uniform float u_fov_vertical_radians;
            uniform vec3 u_display_position;
            uniform float u_rotation_x_radians;
            uniform float u_rotation_y_radians;
            uniform vec2 u_display_resolution;
            uniform vec3 u_lens_vector;

            // vector positions are relative to the width and height of the entire stage
            uniform vec2 u_actor_to_display_ratios;
            uniform vec2 u_actor_to_display_offsets;

            // discovered through trial and error, no idea the significance
            float cogl_position_mystery_factor = 29.09 * 2;
            
            float look_ahead_ms_cap = 45.0;

            vec4 quatConjugate(vec4 q) {
                return vec4(-q.xyz, q.w);
            }

            vec3 applyQuaternionToVector(vec3 v, vec4 q) {
                vec3 t = 2.0 * cross(q.xyz, v);
                return v + q.w * t + cross(q.xyz, t);
            }

            vec4 applyXRotationToVector(vec4 v, float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return vec4(v.x, v.y * c - v.z * s, v.y * s + v.z * c, v.w);
            }

            vec4 applyYRotationToVector(vec4 v, float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return vec4(v.x * c + v.z * s, v.y, v.z * c - v.x * s, v.w);
            }

            vec4 nwuToESU(vec4 v) {
                return vec4(-v.y, v.z, -v.x, v.w);
            }
                
            // returns the rate of change between the two vectors, in same time units as delta_time
            // e.g. if delta_time is in ms, then the rate of change is "per ms"
            vec3 rateOfChange(vec3 v1, vec3 v2, float delta_time) {
                return (v1-v2) / delta_time;
            }

            // attempt to figure out where the current position should be based on previous position and velocity.
            // velocity and time values should use the same time units (secs, ms, etc...)
            vec3 applyLookAhead(vec3 position, vec3 velocity, float look_ahead_ms) {
                return position + velocity * look_ahead_ms;
            }

            // project the vector onto a flat surface, return it's vertical position relative to the vertical fov, where 0.0 is 
            // the top and 1.0 is the bottom. vectors that project outside the vertical range of the display will have values 
            // outside this range, but capped
            float vectorToScanline(float fovVerticalRadians, vec3 v) {
                return clamp(1.0 - (-v.y / (tan(fovVerticalRadians / 2.0) * v.z) + 1.0) / 2.0, -1.5, 2.5);
            }
        `;

        const main = `
            vec4 world_pos = cogl_position_in;

            if (!u_show_banner) {
                float aspect_ratio = u_display_resolution.x / u_display_resolution.y;

                float cogl_position_width = cogl_position_mystery_factor * aspect_ratio / u_actor_to_display_ratios.y;
                float cogl_position_height = cogl_position_width / aspect_ratio;

                vec3 pos_factors = vec3(cogl_position_width / u_display_resolution.x, cogl_position_height / u_display_resolution.y, cogl_position_mystery_factor / u_display_resolution.x);
                world_pos.x -= u_display_position.x * pos_factors.x;
                world_pos.y -= u_display_position.y * pos_factors.y;
                world_pos.z = u_display_position.z * pos_factors.z;

                // if the perspective includes more than just our viewport actor, move vertices towards the center of the perspective so they'll be properly rotated
                world_pos.x += u_actor_to_display_offsets.x * cogl_position_width / 2;
                world_pos.y -= u_actor_to_display_offsets.y * cogl_position_height / 2;

                world_pos.z *= aspect_ratio / u_actor_to_display_ratios.y;
                world_pos = applyXRotationToVector(world_pos, u_rotation_x_radians);
                world_pos = applyYRotationToVector(world_pos, u_rotation_y_radians);

                vec4 quat_t0 = nwuToESU(quatConjugate(u_imu_data[0]));
                vec3 adjusted_lens_vector = u_lens_vector * pos_factors;
                vec3 complete_vector = world_pos.xyz + adjusted_lens_vector;
                vec3 rotated_vector_t0 = applyQuaternionToVector(complete_vector, quat_t0);
                vec3 rotated_vector_t1 = applyQuaternionToVector(complete_vector, nwuToESU(quatConjugate(u_imu_data[1])));
                float delta_time_t0 = u_imu_data[3][0] - u_imu_data[3][1];
                vec3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

                // compute the capped look ahead with scanline adjustments
                float look_ahead_scanline_ms = vectorToScanline(u_fov_vertical_radians, rotated_vector_t0) * u_look_ahead_cfg[2];
                float effective_look_ahead_ms = min(min(u_look_ahead_ms, look_ahead_ms_cap), u_look_ahead_cfg[3]) + look_ahead_scanline_ms;

                vec3 look_ahead_vector = applyLookAhead(rotated_vector_t0, velocity_t0, effective_look_ahead_ms);

                vec3 rotated_lens_vector = applyQuaternionToVector(adjusted_lens_vector, quat_t0);
                world_pos = vec4(look_ahead_vector - rotated_lens_vector, world_pos.w);

                world_pos.z /= aspect_ratio / u_actor_to_display_ratios.y;

                world_pos.x *= u_actor_to_display_ratios.y / u_actor_to_display_ratios.x;

                world_pos = u_projection_matrix * world_pos;

                // if the perspective includes more than just our viewport actor, move the vertices back to just the area we can see.
                // this needs to be done after the projection matrix multiplication so it will be projected as if centered in our vision
                world_pos.x -= (u_actor_to_display_offsets.x / u_actor_to_display_ratios.x) * world_pos.w;
                world_pos.y += (u_actor_to_display_offsets.y / u_actor_to_display_ratios.y) * world_pos.w;
            } else {
                world_pos = cogl_modelview_matrix * world_pos;
                world_pos = cogl_projection_matrix * world_pos;
            }

            cogl_position_out = world_pos;
            cogl_tex_coord_out[0] = cogl_tex_coord_in;
        `

        this.add_glsl_snippet(Shell.SnippetHook.VERTEX, declarations, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        if (!this._initialized) {
            const aspect = this.get_actor().width / this.get_actor().height;
            const fovDiagonalRadians = Globals.data_stream.device_data.displayFov * Math.PI / 180.0;
            const diagToVertRatio = Math.sqrt(aspect * aspect + 1);
            const fovVerticalRadians = fovDiagonalRadians / diagToVertRatio;
            const projection_matrix = this.perspective(
                fovVerticalRadians,
                aspect,
                0.0001,
                1000.0
            );
            this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projection_matrix);
            this.set_uniform_float(this.get_uniform_location("u_fov_vertical_radians"), 1, [fovVerticalRadians]);
            this.set_uniform_float(this.get_uniform_location("u_display_resolution"), 2, [this.get_actor().width, this.get_actor().height]);
            this.set_uniform_float(this.get_uniform_location("u_look_ahead_cfg"), 4, Globals.data_stream.device_data.lookAheadCfg);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_ratios"), 2, this.actor_to_display_ratios);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_offsets"), 2, this.actor_to_display_offsets);
            this.set_uniform_float(this.get_uniform_location("u_lens_vector"), 3, this.lens_vector);
            this._update_display_position_uniforms();
            this._handle_banner_update();
            this._initialized = true;
        }

        this.set_uniform_float(this.get_uniform_location('u_look_ahead_ms'), 1, [lookAheadMS(this.imu_snapshots.timestamp_ms, Globals.data_stream.device_data.lookAheadCfg, this.look_ahead_override)]);
        this.set_uniform_matrix(this.get_uniform_location("u_imu_data"), false, 4, this.imu_snapshots.imu_data);

        if (!this.disable_anti_aliasing) {
            // improves sampling quality for smooth text and edges
            this.get_pipeline().set_layer_filters(
                0,
                Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
                Cogl.PipelineFilter.LINEAR
            );
        }

        super.vfunc_paint_target(node, paintContext);
    }
});

export const VirtualMonitorsActor = GObject.registerClass({
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
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
            GObject.ParamFlags.READWRITE
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
        'display-size': GObject.ParamSpec.double(
            'display-size',
            'Display size',
            'Size of the display',
            GObject.ParamFlags.READWRITE,
            0.2,
            2.5,
            1.0
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
}, class VirtualMonitorsActor extends Clutter.Actor {
    constructor(params = {}) {
        super(params);

        this._all_monitors = [
            this.target_monitor,
            ...this.virtual_monitors
        ]

        const bannerTextureClippingRect = new Mtk.Rectangle({
            x: 0,
            y: 0,
            width: 800,
            height: 200
        });

        const calibratingBanner = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/calibrating.png`);
        const calibratingImage = new Clutter.Image();
        calibratingImage.set_data(calibratingBanner.get_pixels(), Cogl.PixelFormat.RGB_888,
                                  calibratingBanner.width, calibratingBanner.height, calibratingBanner.rowstride);
        this.bannerContent = Clutter.TextureContent.new_from_texture(calibratingImage.get_texture(), bannerTextureClippingRect);

        const customBanner = GdkPixbuf.Pixbuf.new_from_file(`${Globals.extension_dir}/textures/custom_banner.png`);
        const customBannerImage = new Clutter.Image();
        customBannerImage.set_data(customBanner.get_pixels(), Cogl.PixelFormat.RGB_888,
                                   customBanner.width, customBanner.height, customBanner.rowstride);
        this.customBannerContent = Clutter.TextureContent.new_from_texture(customBannerImage.get_texture(), bannerTextureClippingRect);

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
    }

    renderMonitors() {
        // collect bindings and connections to clean up on dispose
        this._property_bindings = [];
        this._property_connections = [];
        this._monitor_actors = [];

        const notifyToFunction = ((property, fn) => {
            this._property_connections.push(this.connect(`notify::${property}`, fn.bind(this)));
        }).bind(this);

        this._distance_ease_timeline = null;
        notifyToFunction('toggle-display-distance-start', this._handle_display_distance_properties_change);
        notifyToFunction('toggle-display-distance-end', this._handle_display_distance_properties_change);
        notifyToFunction('display-distance', this._handle_display_distance_properties_change);
        notifyToFunction('monitor-wrapping-scheme', this._update_monitor_placements);
        notifyToFunction('monitor-spacing', this._update_monitor_placements);
        notifyToFunction('viewport-offset-x', this._update_monitor_placements);
        notifyToFunction('viewport-offset-y', this._update_monitor_placements);
        notifyToFunction('show-banner', this._handle_banner_update);
        notifyToFunction('custom-banner-enabled', this._handle_banner_update);
        notifyToFunction('framerate-cap', this._handle_frame_rate_cap_change);
        this._update_monitor_placements();
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
                width: this.target_monitor.width,
                height: this.target_monitor.height
            });

            // Create a clone of the stage content for this monitor
            const monitorClone = new Clutter.Clone({
                source: Main.layoutManager.uiGroup,
                x: -monitor.x,
                y: -monitor.y
            });
            monitorClone.set_clip(monitor.x, monitor.y, monitor.width, monitor.height);

            // Add the monitor actor to the scene
            containerActor.add_child(monitorClone);
            const effect = new VirtualMonitorEffect({
                focused_monitor_index: this.focused_monitor_index,
                imu_snapshots: this.imu_snapshots,
                monitor_index: index,
                monitor_placements: this.monitor_placements,
                display_distance: this.display_distance,
                display_distance_default: this._display_distance_default(),
                actor_to_display_ratios: actorToDisplayRatios,
                actor_to_display_offsets: actorToDisplayOffsets,
                lens_vector: this.lens_vector,
                show_banner: this.show_banner
            });
            containerActor.add_effect_with_name('viewport-effect', effect);
            this.add_child(containerActor);

            this._monitor_actors.push({
                containerActor,
                monitorClone,
                effect
            });

            // do this so the primary monitor is always on top at first, before the focused monitor logic comes into play
            this.set_child_below_sibling(containerActor, null);

            [
                'monitor-placements',
                'imu-snapshots',
                'focused-monitor-index',
                'display-distance',
                'lens-vector',
                'look-ahead-override',
                'disable-anti-aliasing',
                'show-banner'
            ].forEach((property => {
                this._property_bindings.push(this.bind_property(property, effect, property, GObject.BindingFlags.DEFAULT));
            }));

            const updateEffectDistanceDefault = (() => {
                effect.display_distance_default = this._display_distance_default();
            }).bind(this);
            this._property_connections.push(this.connect('notify::toggle-display-distance-start', updateEffectDistanceDefault));
            this._property_connections.push(this.connect('notify::toggle-display-distance-end', updateEffectDistanceDefault));

            // in addition to rendering distance properly in the shader, the parent actor determines overlap based on child ordering
            effect.connect('notify::is-closest', ((actor, _pspec) => {
                if (!this._is_disposed && actor.is_closest) {
                    this.set_child_above_sibling(containerActor, null);
                    if (this.show_banner) this.set_child_above_sibling(this.bannerActor, null);
                }
            }).bind(this));
        }).bind(this));

        this.add_child(this.bannerActor);
        if (this.show_banner) {
            this.set_child_above_sibling(this.bannerActor, null);
            this.bannerActor.show();
        }

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, (() => {
            if (this._is_disposed) return GLib.SOURCE_REMOVE;

            if (this.show_banner) {
                this.focused_monitor_index = -1;
            } else if (this.imu_snapshots) {
                const focusedMonitorIndex = findFocusedMonitor(
                    this.imu_snapshots.imu_data.splice(0, 4),
                    this._monitorsAsNormalizedVectors, 
                    this.focused_monitor_index,
                    this.display_distance / this._display_distance_default(),
                    this._fov_details(),
                    this._all_monitors
                );

                if (this.focused_monitor_index !== focusedMonitorIndex) {
                    if (this.focused_monitor_index !== -1)
                        Globals.logger.log_debug(`Switching to monitor ${focusedMonitorIndex}`);
                    
                    this.focused_monitor_index = focusedMonitorIndex;
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
            this.queue_redraw();
            this._last_redraw = Date.now();
        }).bind(this));
        this._redraw_timeline.set_repeat_count(-1);
        this._redraw_timeline.start();
    }

    _display_distance_default() {
        return Math.max(this.toggle_display_distance_start, this.toggle_display_distance_end);
    }

    _fov_details() {
        const aspect = this.target_monitor.width / this.target_monitor.height;
        const fovVerticalRadiansInitial = degreesToRadians(Globals.data_stream.device_data.displayFov / Math.sqrt(1 + aspect * aspect));
        const fovVerticalRadians = Math.atan(Math.tan(fovVerticalRadiansInitial) / this._display_distance_default());

        // distance needed for the FOV-sized monitor to fill up the screen
        const fullScreenDistance = this.target_monitor.height / 2 / Math.sin(fovVerticalRadians / 2);

        return {
            widthPixels: this.target_monitor.width,
            heightPixels: this.target_monitor.height,
            verticalRadians: fovVerticalRadians,
            horizontalRadians: fovVerticalRadians * aspect,
            fullScreenDistance
        };
    }

    _update_monitor_placements() {
        // collect minimum and maximum x and y values of monitors
        let actualWrapScheme = this.monitor_wrapping_scheme;
        if (actualWrapScheme === 'automatic') {
            const minX = Math.min(...this._all_monitors.map(monitor => monitor.x));
            const minY = Math.min(...this._all_monitors.map(monitor => monitor.y));
            const maxX = Math.max(...this._all_monitors.map(monitor => monitor.x + monitor.width));
            const maxY = Math.max(...this._all_monitors.map(monitor => monitor.y + monitor.height));

            // check if there are more monitors in the horizontal or vertical direction, prefer horizontal if equal
            if ((maxX - minX) / this.target_monitor.width >= (maxY - minY) / this.target_monitor.height) {
                actualWrapScheme = 'horizontal';
            } else {
                actualWrapScheme = 'vertical';
            }
        }
        
        const fovDetails = this._fov_details();

        // full screen distance + lens distance
        const completeScreenDistance = fovDetails.fullScreenDistance / (1.0 - Globals.data_stream.device_data.lensDistanceRatio);

        this.lens_vector = [0.0, 0.0, -Globals.data_stream.device_data.lensDistanceRatio * completeScreenDistance];
        this.monitor_placements = monitorsToPlacements(
            fovDetails,

            // shift all monitors so they center around the target monitor, then adjusted by the offsets
            this._all_monitors.map(monitor => ({
                x: monitor.x - this.target_monitor.x - this.viewport_offset_x * this.target_monitor.width,
                y: monitor.y - this.target_monitor.y - this.viewport_offset_y * this.target_monitor.height,
                width: monitor.width,
                height: monitor.height
            })),
            actualWrapScheme,
            this.monitor_spacing / 1000.0
        );

        // normalize the center vectors
        this._monitorsAsNormalizedVectors = this.monitor_placements.map(monitorVectors => {
            const vector = monitorVectors.center;
            const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
            return [vector[0] / length, vector[1] / length, vector[2] / length];
        });
    }
    
    _handle_display_distance_properties_change() {
        const distance_from_end = Math.abs(this.display_distance - this.toggle_display_distance_end);
        const distance_from_start = Math.abs(this.display_distance - this.toggle_display_distance_start);
        this._is_display_distance_at_end = distance_from_end < distance_from_start;
        this._update_monitor_placements();
    }

    _handle_banner_update() {
        if (this.show_banner) {
            this.bannerActor.set_content(this.custom_banner_enabled ? this.customBannerContent : this.bannerContent);
            this.bannerActor.show();
        } else {
            this.bannerActor.hide();
        }
    }

    _handle_frame_rate_cap_change() {
        // add a margin to the cap time so we don't cut off frames that come in close
        const frametime_margin = 0.75;
        this._cap_frametime_ms = this.framerate_cap === 0 ? 0.0 : Math.floor(1000 * frametime_margin / this.framerate_cap);
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

        this._monitor_actors.forEach(({ containerActor, monitorClone, effect }) => {
            containerActor.remove_effect(effect);
            containerActor.remove_child(monitorClone);
            this.remove_child(containerActor);
        });
        this._monitor_actors = [];

        this._property_bindings.forEach(binding => binding.unbind());
        this._property_bindings = [];

        this._property_connections.forEach(connection => this.disconnect(connection));
    }
});