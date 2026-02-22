import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import Globals from './globals.js';
import { degreeToRadian, diagonalToCrossFOVs, fovConversionFns } from './math.js';


// these need to mirror the values in XRLinuxDriver
// https://github.com/wheaney/XRLinuxDriver/blob/main/src/plugins/smooth_follow.c#L31
export const SMOOTH_FOLLOW_SLERP_TIMELINE_MS = 1000;
const SMOOTH_FOLLOW_SLERP_FACTOR = Math.pow(1-0.999, 1/SMOOTH_FOLLOW_SLERP_TIMELINE_MS);

// this mirror's how the driver's slerp function progresses so our effect will match it
function smoothFollowSlerpProgress(elapsedMs) {
    return 1 - Math.pow(SMOOTH_FOLLOW_SLERP_FACTOR, elapsedMs);
}

// how far to look ahead is how old the IMU data is plus a constant that is either the default for this device or an override
function lookAheadMS(imuDateMs, lookAheadCfg, override) {
    // how stale the imu data is
    const dataAge = Date.now() - imuDateMs;

    return (override === -1 ? lookAheadCfg[0] : override) + dataAge;
}

// Create a mesh of vertices in a pattern suitable for TRIANGLE_STRIP
function createVertexMesh(fovDetails, monitorDetails, positionVectorNWU) {
    let horizontalWrap = fovDetails.monitorWrappingScheme === 'horizontal';
    const horizontalConversions = fovDetails.curvedDisplay && horizontalWrap ? fovConversionFns.curved : fovConversionFns.flat;
    const sideEdgeDistancePixels = horizontalConversions.centerToFovEdgeDistance(
        fovDetails.completeScreenDistancePixels,
        fovDetails.sizeAdjustedWidthPixels
    );
    const horizontalRadians = horizontalConversions.lengthToRadians(
        fovDetails.defaultDistanceHorizontalRadians,
        fovDetails.widthPixels,
        sideEdgeDistancePixels,
        monitorDetails.width
    );

    let verticalWrap = fovDetails.monitorWrappingScheme === 'vertical';
    const verticalConversions = fovDetails.curvedDisplay && verticalWrap ? fovConversionFns.curved : fovConversionFns.flat;
    const topEdgeDistancePixels = verticalConversions.centerToFovEdgeDistance(
        fovDetails.completeScreenDistancePixels,
        fovDetails.sizeAdjustedHeightPixels
    );
    const verticalRadians = verticalConversions.lengthToRadians(
        fovDetails.defaultDistanceVerticalRadians,
        fovDetails.heightPixels,
        topEdgeDistancePixels,
        monitorDetails.height
    );

    const xSegments = horizontalConversions.radiansToSegments(horizontalRadians);
    const ySegments = verticalConversions.radiansToSegments(verticalRadians);

    const texXLeft = 0;
    const texYTop = 0;
    const texXRight = 1;
    const texYBottom = 1;

    // curve the monitor placments based on the fov, wrapping, and texture coordinates
    const radius = fovDetails.completeScreenDistancePixels;
    function v(s, t) {
        let zOffsetPixels = 0

        const xOffset = s - 0.5;
        let xOffsetPixels = monitorDetails.width * xOffset;
        if (fovDetails.curvedDisplay && horizontalWrap) {
            const xOffsetRadians = xOffset * horizontalRadians;
            xOffsetPixels = Math.sin(xOffsetRadians) * radius;
            zOffsetPixels = radius - Math.cos(xOffsetRadians) * radius;
        }
        const x = -positionVectorNWU[1] + xOffsetPixels;

        const yOffset = 0.5 - t;
        let yOffsetPixels = monitorDetails.height * yOffset;
        if (fovDetails.curvedDisplay && verticalWrap) {
            const yOffsetRadians = yOffset * verticalRadians;
            yOffsetPixels = Math.sin(yOffsetRadians) * radius;
            zOffsetPixels = radius - Math.cos(yOffsetRadians) * radius;
        }
        const y = positionVectorNWU[2] + yOffsetPixels;
        const z = -positionVectorNWU[0] + zOffsetPixels;

        return new Cogl.VertexP3T2({x, y, z, s, t});
    }

    const vertices = [];
    for (let j = 0; j < ySegments; j++) {
        const texY0 = texYTop - (texYTop - texYBottom) * j / ySegments;
        const texY1 = texYTop - (texYTop - texYBottom) * (j + 1) / ySegments;
        
        const evenRow = j % 2 === 0;
        for (let i = 0; i <= xSegments; i++) {
            // even rows stitch left-to-right, odd rows stitch right-to-left
            const colIndex = evenRow ? i : xSegments - i;

            const texX = texXLeft + (texXRight - texXLeft) * colIndex / xSegments;
            
            // bottom then top
            vertices.push(v(texX, texY1));
            vertices.push(v(texX, texY0));
        }
    }

    return vertices;
}

export const VirtualDisplayEffect = GObject.registerClass({
    Properties: {
        'monitor-index': GObject.ParamSpec.int(
            'monitor-index',
            'Monitor Index',
            'Index of the monitor that this effect is applied to',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'monitor-details': GObject.ParamSpec.jsobject(
            'monitor-details',
            'Monitor Details',
            'Details about the monitor that this effect is applied to',
            GObject.ParamFlags.READWRITE
        ),
        'monitor-placements': GObject.ParamSpec.jsobject(
            'monitor-placements',
            'Monitor Placements',
            'Target and virtual monitor placement details, as relevant to rendering',
            GObject.ParamFlags.READWRITE
        ),
        'fov-details': GObject.ParamSpec.jsobject(
            'fov-details',
            'FOV Details',
            'Details about the field of view of the headset',
            GObject.ParamFlags.READWRITE
        ),
        'target-monitor': GObject.ParamSpec.jsobject(
            'target-monitor',
            'Target Monitor',
            'Details about the monitor being used as a viewport',
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
        'focused-monitor-index': GObject.ParamSpec.int(
            'focused-monitor-index',
            'Focused Monitor Index',
            'Index of the monitor that is currently focused',
            GObject.ParamFlags.READWRITE,
            -1, 100, -1
        ),
        'display-zoom-on-focus': GObject.ParamSpec.boolean(
            'display-zoom-on-focus',
            'Display zoom on focus',
            'Automatically move a display closer when it becomes focused.',
            GObject.ParamFlags.READWRITE,
            true
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
        'display-distance': GObject.ParamSpec.double(
            'display-distance',
            'Display Distance',
            'Distance of the display from the camera',
            GObject.ParamFlags.READWRITE,
            0.1, 
            2.5, 
            1.0
        ),
        'display-distance-default': GObject.ParamSpec.double(
            'display-distance-default',
            'Display distance default',
            'Distance to use when not explicitly set, or when reset',
            GObject.ParamFlags.READWRITE, 
            0.1, 
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
}, class VirtualDisplayEffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);

        this._current_display_distance = this._is_focused() ? this.display_distance : this.display_distance_default;
        this.no_distance_ease = false;
        this._current_follow_ease_progress = 0.0;
        this._use_smooth_follow_origin = false;

        this.connect('notify::display-distance', this._update_display_distance.bind(this));
        this.connect('notify::display-distance-default', this._update_display_distance.bind(this));
        this.connect('notify::display-size', this._update_display_position.bind(this));
        this.connect('notify::focused-monitor-index', this._update_display_distance.bind(this));
        this.connect('notify::monitor-placements', this._update_display_position.bind(this));
        this.connect('notify::show-banner', this._handle_banner_update.bind(this));
        this.connect('notify::smooth-follow-enabled', this._handle_smooth_follow_enabled_update.bind(this));

        this._update_display_position();
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

        if (this.no_distance_ease) {
            this._current_display_distance = desired_distance;
            this._update_display_position();
            this.no_distance_ease = false;
            return;
        }
        
        // if we're the focused display, we'll double the timeline and wait for the first half to let other 
        // displays ease out first
        this._distance_ease_focus = this._is_focused();
        const ease_out_timeline_ms = 150;
        const pause_ms = 50;
        const ease_in_timeline_ms = 500; // includes ease out and pause
        const ease_in_begin_pct = (ease_out_timeline_ms + pause_ms) / ease_in_timeline_ms;
        const timeline_ms = this._distance_ease_focus ? 
            ease_in_timeline_ms : 
            ease_out_timeline_ms;

        this._distance_ease_start = this._current_display_distance;
        this._distance_ease_timeline = Clutter.Timeline.new_for_actor(this.get_actor(), timeline_ms);

        this._distance_ease_target = desired_distance;
        this._distance_ease_timeline.connect('new-frame', (() => {
            let progress = this._distance_ease_timeline.get_progress();
            if (this._distance_ease_focus) {
                // if we're the focused display, wait for the first half of the timeline to pass
                if (progress < ease_in_begin_pct) return;

                // treat the second half of the timeline as its own full progression
                progress = (progress - ease_in_begin_pct) / (1 - ease_in_begin_pct);

                // put this display in front as it starts to easy in
                this.is_closest = true;
            } else {
                this.is_closest = false;
            }

            this._current_display_distance = this._distance_ease_start +
                (1 - Math.cos(progress * Math.PI)) / 2 * (this._distance_ease_target - this._distance_ease_start);
            this._update_display_position();
        }).bind(this));

        this._distance_ease_timeline.start();

        if (this.smooth_follow_enabled) this._handle_smooth_follow_enabled_update();
    }

    _handle_smooth_follow_enabled_update() {
        // we'll re-trigger this once a monitor becomes focused
        if (this.focused_monitor_index === -1) return;

        this._use_smooth_follow_origin = false;

        if (this._follow_ease_timeline?.is_playing()) this._follow_ease_timeline.stop();

        const ease_to_focus = this.smooth_follow_enabled && this._is_focused();
        const from = this._current_follow_ease_progress;
        const to = ease_to_focus ? 1.0 : 0.0;
        const toggleTime = this.smooth_follow_toggle_epoch_ms === 0 ? Date.now() : this.smooth_follow_toggle_epoch_ms;
        
        // would have been a slight delay between request and slerp actually starting
        const toggleDelayMs = (Date.now() - toggleTime) * 0.75;
        const slerpStartTime = toggleTime + toggleDelayMs;

        if (to !== from) {
            this._follow_ease_timeline = Clutter.Timeline.new_for_actor(
                this.get_actor(), 
                SMOOTH_FOLLOW_SLERP_TIMELINE_MS - toggleDelayMs
            );
            this._follow_ease_timeline.connect('new-frame', ((timeline, elapsed_ms) => {
                const toggleTimeOffsetMs = Date.now() - slerpStartTime;

                // this relies on the slerp function tuned to reach 100% in about 1 second
                const progress = smoothFollowSlerpProgress(toggleTimeOffsetMs);
                this._current_follow_ease_progress = from + (to - from) * progress;
                this._update_display_position();
            }).bind(this));

            this._follow_ease_timeline.connect('completed', (() => {
                this._current_follow_ease_progress = to;
                this._use_smooth_follow_origin = false;
                this.smooth_follow_toggle_epoch_ms = 0;
                this._update_display_position();
            }).bind(this));

            this._follow_ease_timeline.start();
        } else if (!this.smooth_follow_enabled) {
            // smooth follow has been turned off and this screen wasn't the focus,
            // continue to use the smooth_follow_origin data for 1 more second
            this._use_smooth_follow_origin = true;
            GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 
                SMOOTH_FOLLOW_SLERP_TIMELINE_MS - toggleDelayMs, 
                (() => {
                    this._use_smooth_follow_origin = false;
                    this.smooth_follow_toggle_epoch_ms = 0;
                    this._current_follow_ease_progress = to;
                    return GLib.SOURCE_REMOVE;
                }).bind(this)
            );
        }
    }

    // follow_ease transitions this from a rotated display (progress 0.0) to a centered/focused display (progress 1.0)
    _update_display_position() {
        // this is in NWU coordinates
        const monitorPlacement = this.monitor_placements[this.monitor_index];      
        const noRotationVector = monitorPlacement.centerNoRotate.map(coord => coord * this._current_display_distance / this.display_distance_default);
        const inverse_follow_ease = 1.0 - this._current_follow_ease_progress;
        let finalPositionVector = noRotationVector;
        if (this._current_follow_ease_progress > 0.0)  {
            // slerp from the rotated display to the centered display
            finalPositionVector = noRotationVector.map(coord => coord * inverse_follow_ease);
            finalPositionVector[0] = noRotationVector[0];
        }
        const resizedMonitorDetails = {
            width: this.monitor_details.width * this.fov_details.distanceAdjustedSize,
            height: this.monitor_details.height * this.fov_details.distanceAdjustedSize
        };
        this._vertices = createVertexMesh(this.fov_details, resizedMonitorDetails, finalPositionVector);

        const rotation_radians = this.monitor_placements[this.monitor_index].rotationAngleRadians;
        if (this._initialized) {
            this.set_uniform_float(this.get_uniform_location("u_rotation_x_radians"), 1, [rotation_radians.x * inverse_follow_ease]);
            this.set_uniform_float(this.get_uniform_location("u_rotation_y_radians"), 1, [rotation_radians.y * inverse_follow_ease]);
        }
    }

    _handle_banner_update() {
        this.set_uniform_float(this.get_uniform_location("u_show_banner"), 1, [this.show_banner ? 1.0 : 0.0]);
    }

    perspective(widthUnitDistance, aspect, near, far) {
        const f = 2.0 / widthUnitDistance;
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
            uniform mat4 u_pose_orientation;
            uniform vec3 u_pose_position;
            uniform float u_look_ahead_ms;
            uniform vec4 u_look_ahead_cfg;
            uniform mat4 u_projection_matrix;
            uniform float u_fov_vertical_radians;
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

            vec3 applyXRotationToVector(vec3 v, float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
            }

            vec3 applyYRotationToVector(vec3 v, float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return vec3(v.x * c + v.z * s, v.y, v.z * c - v.x * s);
            }

            vec4 nwuToEUS(vec4 v) {
                return vec4(-v.y, v.z, -v.x, v.w);
            }

            vec3 nwuToEUS(vec3 v) {
                return vec3(-v.y, v.z, -v.x);
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

                vec4 quat_t0 = nwuToEUS(quatConjugate(u_pose_orientation[0]));
                vec3 position_vector = applyQuaternionToVector(nwuToEUS(u_pose_position), quat_t0);
                vec3 final_lens_position = nwuToEUS(u_lens_vector) + position_vector;

                vec3 complete_vector = applyXRotationToVector(world_pos.xyz, u_rotation_x_radians);
                complete_vector = applyYRotationToVector(complete_vector, u_rotation_y_radians);

                vec3 rotated_vector_t0 = applyQuaternionToVector(complete_vector, quat_t0);
                vec3 rotated_vector_t1 = applyQuaternionToVector(complete_vector, nwuToEUS(quatConjugate(u_pose_orientation[1])));
                float delta_time_t0 = u_pose_orientation[3][0] - u_pose_orientation[3][1];

                // how quickly the vertex is moving relative to the camera
                vec3 velocity_t0 = rateOfChange(
                    rotated_vector_t0 - final_lens_position, 
                    rotated_vector_t1 - final_lens_position, 
                    delta_time_t0
                );

                // compute the capped look ahead with scanline adjustments
                float look_ahead_scanline_ms = u_look_ahead_ms == 0.0 ? 0.0 : vectorToScanline(u_fov_vertical_radians, rotated_vector_t0) * u_look_ahead_cfg[2];
                float effective_look_ahead_ms = min(min(u_look_ahead_ms, look_ahead_ms_cap), u_look_ahead_cfg[3]) + look_ahead_scanline_ms;

                vec3 look_ahead_vector = applyLookAhead(rotated_vector_t0, velocity_t0, effective_look_ahead_ms);

                world_pos = vec4(look_ahead_vector - final_lens_position, world_pos.w);

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

        this.add_glsl_snippet(Cogl.SnippetHook?.VERTEX ?? Shell.SnippetHook.VERTEX, declarations, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        if (!this._initialized) {
            this._initialized = true;

            const aspect = this.target_monitor.width / this.target_monitor.height;
            const fovLengths = diagonalToCrossFOVs(degreeToRadian(Globals.data_stream.device_data.displayFov), aspect);
            const projection_matrix = this.perspective(
                fovLengths.widthUnitDistance,
                aspect,
                1.0,
                10000.0
            );
            this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projection_matrix);
            this.set_uniform_float(this.get_uniform_location("u_fov_vertical_radians"), 1, [fovLengths.verticalRadians]);
            this.set_uniform_float(this.get_uniform_location("u_display_resolution"), 2, [this.target_monitor.width, this.target_monitor.height]);
            this.set_uniform_float(this.get_uniform_location("u_look_ahead_cfg"), 4, Globals.data_stream.device_data.lookAheadCfg);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_ratios"), 2, this.actor_to_display_ratios);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_offsets"), 2, this.actor_to_display_offsets);
            this._update_display_position();
            this._handle_banner_update();
        }
        this.set_uniform_float(this.get_uniform_location("u_lens_vector"), 3, this.pose_has_position ? [0.0, 0.0, 0.0] : this.lens_vector);

        if (this.imu_snapshots && !this.show_banner) {
            let lookAheadSet = false;
            if (!this._use_smooth_follow_origin && (!this.smooth_follow_enabled || this._is_focused() || this._current_follow_ease_progress > 0.0)) {
                if (this._current_follow_ease_progress > 0.0 && this._current_follow_ease_progress < 1.0) {
                    // don't apply look-ahead while the display is slerping
                    this.set_uniform_float(this.get_uniform_location('u_look_ahead_ms'), 1, [0.0]);
                    lookAheadSet = true;
                }
                this.set_uniform_matrix(this.get_uniform_location("u_pose_orientation"), false, 4, this.imu_snapshots.pose_orientation);
            } else {
                this.set_uniform_matrix(this.get_uniform_location("u_pose_orientation"), false, 4, this.imu_snapshots.smooth_follow_origin);
            }
            let posePositionPixels = [0.0, 0.0, 0.0];
            if (this.pose_has_position) {
                posePositionPixels = this.imu_snapshots.pose_position.map((coord, index) => {
                    return coord * this.fov_details.fullScreenDistancePixels + this.lens_vector[index];
                });
            }
            this.set_uniform_float(this.get_uniform_location("u_pose_position"), 3, posePositionPixels);
            if (!lookAheadSet) {
                this.set_uniform_float(this.get_uniform_location('u_look_ahead_ms'), 1, [lookAheadMS(this.imu_snapshots.timestamp_ms, Globals.data_stream.device_data.lookAheadCfg, this.look_ahead_override)]);
            }

            if (!this.disable_anti_aliasing) {
                // improves sampling quality for smooth text and edges
                this.get_pipeline().set_layer_filters(
                    0,
                    Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
                    Cogl.PipelineFilter.LINEAR
                );
            }

            // skip the actor's default rendering, draw our custom vertices instead
            const framebuffer = paintContext.get_framebuffer();
            const coglContext = framebuffer.get_context();
            const primitive = Cogl.Primitive.new_p3t2(coglContext, Cogl.VerticesMode.TRIANGLE_STRIP, this._vertices);
            primitive.draw(framebuffer, this.get_pipeline());
        } else {
            super.vfunc_paint_target(node, paintContext);
        }
    }
});