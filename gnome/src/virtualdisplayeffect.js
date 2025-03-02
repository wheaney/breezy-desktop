import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import Globals from './globals.js';
import { degreeToRadian, diagonalToCrossFOVs } from './math.js';

// how far to look ahead is how old the IMU data is plus a constant that is either the default for this device or an override
function lookAheadMS(imuDateMs, lookAheadCfg, override) {
    // how stale the imu data is
    const dataAge = Date.now() - imuDateMs;

    return (override === -1 ? lookAheadCfg[0] : override) + dataAge;
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
        'monitor-placements': GObject.ParamSpec.jsobject(
            'monitor-placements',
            'Monitor Placements',
            'Target and virtual monitor placement details, as relevant to rendering',
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
}, class VirtualDisplayEffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);

        this._current_display_distance = this._is_focused() ? this.display_distance : this.display_distance_default;
        this.no_distance_ease = false;

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

        if (this.no_distance_ease) {
            this._current_display_distance = desired_distance;
            this._update_display_position_uniforms();
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

    perspective(fovHorizontalRadians, aspect, near, far) {
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

                float pos_z_factor = aspect_ratio / u_actor_to_display_ratios.y;
                vec3 pos_factors = vec3(
                    cogl_position_width / u_display_resolution.x, 
                    cogl_position_height / u_display_resolution.y, 
                    cogl_position_mystery_factor * pos_z_factor / u_display_resolution.x
                );
                world_pos.x -= u_display_position.x * pos_factors.x;
                world_pos.y -= u_display_position.y * pos_factors.y;
                world_pos.z = u_display_position.z * pos_factors.z;

                // if the perspective includes more than just our viewport actor, move vertices towards the center of the perspective so they'll be properly rotated
                world_pos.x += u_actor_to_display_offsets.x * cogl_position_width / 2;
                world_pos.y -= u_actor_to_display_offsets.y * cogl_position_height / 2;

                vec3 complete_vector = applyXRotationToVector(world_pos.xyz, u_rotation_x_radians);
                complete_vector = applyYRotationToVector(complete_vector, u_rotation_y_radians);

                vec4 quat_t0 = nwuToESU(quatConjugate(u_imu_data[0]));
                vec3 rotated_vector_t0 = applyQuaternionToVector(complete_vector, quat_t0);
                vec3 rotated_vector_t1 = applyQuaternionToVector(complete_vector, nwuToESU(quatConjugate(u_imu_data[1])));
                float delta_time_t0 = u_imu_data[3][0] - u_imu_data[3][1];
                vec3 velocity_t0 = rateOfChange(rotated_vector_t0, rotated_vector_t1, delta_time_t0);

                // compute the capped look ahead with scanline adjustments
                float look_ahead_scanline_ms = vectorToScanline(u_fov_vertical_radians, rotated_vector_t0) * u_look_ahead_cfg[2];
                float effective_look_ahead_ms = min(min(u_look_ahead_ms, look_ahead_ms_cap), u_look_ahead_cfg[3]) + look_ahead_scanline_ms;

                vec3 look_ahead_vector = applyLookAhead(rotated_vector_t0, velocity_t0, effective_look_ahead_ms);

                vec3 adjusted_lens_vector = u_lens_vector * pos_factors;
                world_pos = vec4(look_ahead_vector - adjusted_lens_vector, world_pos.w);

                world_pos.z /= pos_z_factor;

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
            const aspect = this.target_monitor.width / this.target_monitor.height;
            const fovRadians = diagonalToCrossFOVs(degreeToRadian(Globals.data_stream.device_data.displayFov), aspect);
            const projection_matrix = this.perspective(
                fovRadians.horizontal,
                aspect,
                0.0001,
                1000.0
            );
            this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projection_matrix);
            this.set_uniform_float(this.get_uniform_location("u_fov_vertical_radians"), 1, [fovRadians.vertical]);
            this.set_uniform_float(this.get_uniform_location("u_display_resolution"), 2, [this.target_monitor.width, this.target_monitor.height]);
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