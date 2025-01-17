import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
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

/**
 * Find the vector in the array that's closest to the quaternion rotation
 * 
 * @param {number[]} quaternion - Reference quaternion [w, x, y, z]
 * @param {number[][]} vectors - Array of vectors [x, y, z] to search from
 * @returns {number} Index of the closest vector, if it surpasses the previous closest index by a certain margin, otherwise the previous index
 */
function findClosestVector(quaternion, vectors, previousClosestIndex) {

    const lookVector = [1.0, 0.0, 0.0]; // NWU vector pointing to the center of the screen
    const rotatedLookVector = applyQuaternionToVector(lookVector, [quaternion.x, quaternion.y, quaternion.z, quaternion.w]);
    Globals.logger.log(`\t\t\tRotated look vector: ${rotatedLookVector}`);

    let closestIndex = -1;
    let closestDistance = Infinity;
    let previousDistance = Infinity;

    // find the vector closest to the rotated look vector
    vectors.forEach((vector, index) => {
        const distance = Math.acos(
            Math.min(1.0, Math.max(-1.0, vector[0] * rotatedLookVector[0] + vector[1] * rotatedLookVector[1] + vector[2] * rotatedLookVector[2]))
        );

        if (previousClosestIndex === index) {
            previousDistance = distance;
        }

        Globals.logger.log(`\t\t\tMonitor ${index} distance: ${distance}`);
        if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
        }
    });

    Globals.logger.log(`\t\t\tClosest monitor: ${closestIndex}, distance: ${closestDistance}`);

    // only switch if the closest monitor is greater than the previous closest by 25%
    if (previousClosestIndex !== undefined && closestIndex !== previousClosestIndex && closestDistance * 1.25 > previousDistance) {
        return previousClosestIndex;
    }

    return closestIndex;
}

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180.0;
}

function radiansToDegrees(radians) {
    return radians * 180.0 / Math.PI;
}

/***
 * @returns {Object} - containing `center` and `end` radians
 */
function monitorWrap(radiusPixels, previousMonitorEndRadians, monitorPixels) {
    const monitorHalfPixels = monitorPixels / 2;
    const monitorHalfRadians = Math.asin(monitorHalfPixels / radiusPixels);
    const centerRadians = previousMonitorEndRadians + monitorHalfRadians;
    return {
        begin: previousMonitorEndRadians,
        center: centerRadians,
        end: centerRadians + monitorHalfRadians
    }
}

/**
 * Convert the given monitor details into NWU vectors describing the center of the fully placed monitor, 
 * and the top-left of the partially placed monitor (minus only a single-axis rotation)
 * 
 * @param {Object} fovDetails - contains reference fovDegrees (diagonal), widthPixels, heightPixels
 * @param {Object[]} monitorDetailsList - contains x, y, width, height (coordinates from top-left)
 * @param {string} monitorWrappingScheme - horizontal, vertical, none
 * @returns {Object[]} - contains NWU vectors pointing to `topLeftNoRotate` and `center` of each monitor
 */
function monitorsToVectors(fovDetails, monitorDetailsList, monitorWrappingScheme) {
    const aspect = fovDetails.widthPixels / fovDetails.heightPixels;
    const fovVerticalRadians = degreesToRadians(fovDetails.fovDegrees / Math.sqrt(1 + aspect * aspect));

    // distance needed for the FOV-sized monitor to fill up the screen
    const centerRadius = fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2);

    // NWU vectors pointing to the center of the screen for each monitor
    const monitorVectors = [];

    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally
        const fovHorizontalRadians = fovVerticalRadians * aspect;

        // distance to a horizontal edge is the hypothenuse of the triangle where the opposite side is half the width of the reference fov screen
        const edgeRadius = fovDetails.widthPixels / 2 / Math.sin(fovHorizontalRadians / 2);

        let previousMonitorEndRadians = -fovHorizontalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(edgeRadius, previousMonitorEndRadians, monitorDetails.width);
            previousMonitorEndRadians = monitorWrapDetails.end;

            monitorVectors.push({
                topLeftNoRotate: [
                    centerRadius,
                    fovDetails.widthPixels / 2,
                    -(monitorDetails.y - fovDetails.heightPixels / 2)
                ],
                center: [
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    centerRadius * Math.cos(monitorWrapDetails.center),

                    // west is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -centerRadius * Math.sin(monitorWrapDetails.center),

                    // up is flat when wrapping horizontally
                    -(monitorDetails.y + monitorDetails.height / 2 - fovDetails.heightPixels / 2)
                ]
            });
        });
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically

        // distance to a vertical edge is the hypothenuse of the triangle where the opposite side is half the height of the reference fov screen
        const edgeRadius = fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2);

        let previousMonitorEndRadians = -fovVerticalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(edgeRadius, previousMonitorEndRadians, monitorDetails.height);
            previousMonitorEndRadians = monitorWrapDetails.end;

            monitorVectors.push({
                topLeftNoRotate: [
                    centerRadius,
                    -(monitorDetails.x - fovDetails.widthPixels / 2),
                    fovDetails.heightPixels / 2
                ],
                center: [
                    // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    centerRadius * Math.cos(monitorWrapDetails.center),

                    // west is flat when wrapping vertically
                    -(monitorDetails.x + monitorDetails.width / 2 - fovDetails.widthPixels / 2),

                    // up is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                    -centerRadius * Math.sin(monitorWrapDetails.center)
                ]
            });
        });
    } else {
        // monitors make a flat wall in front of us, no wrapping
        monitorDetailsList.forEach(monitorDetails => {
            monitorVectors.push({
                topLeftNoRotate: [
                    centerRadius,
                    -(monitorDetails.x - fovDetails.widthPixels / 2),
                    -(monitorDetails.y - fovDetails.heightPixels / 2)
                ],
                center: [
                    centerRadius,
                    -(monitorDetails.x + monitorDetails.width / 2 - fovDetails.widthPixels / 2),
                    -(monitorDetails.y + monitorDetails.height / 2 - fovDetails.heightPixels / 2)
                ]
            });
        });
    }

    return monitorVectors;
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

export const TestActorEffect = GObject.registerClass({
    Properties: {
        'monitor-index': GObject.ParamSpec.int(
            'monitor-index',
            'Monitor Index',
            'Index of the monitor that this effect is applied to',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'quaternion': GObject.ParamSpec.jsobject(
            'quaternion',
            'Quaternion',
            'Camera orientation quaternion',
            GObject.ParamFlags.READWRITE
        ),
        'fov-degrees': GObject.ParamSpec.double(
            'fov-degrees',
            'FOV Degrees',
            'Field of view in degrees',
            GObject.ParamFlags.READWRITE,
            30.0, 100.0, 46.0
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
        'monitor-wrapping-scheme': GObject.ParamSpec.string(
            'monitor-wrapping-scheme',
            'Monitor Wrapping Scheme',
            'How the monitors are wrapped around the viewport',
            GObject.ParamFlags.READWRITE,
            'horizontal', ['horizontal', 'vertical', 'none']
        ),
        'monitor-wrapping-rotation-radians': GObject.ParamSpec.double(
            'monitor-wrapping-rotation-radians',
            'Monitor Wrapping Rotation Radians',
            'Rotation of the monitor wrapping around the viewport',
            GObject.ParamFlags.READWRITE,
            -360.0, 360.0, 0.0
        ),
        'focused-monitor-index': GObject.ParamSpec.int(
            'focused-monitor-index',
            'Focused Monitor Index',
            'Index of the monitor that is currently focused',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'display-distance': GObject.ParamSpec.double(
            'display-distance',
            'Display Distance',
            'Distance of the display from the camera',
            GObject.ParamFlags.READWRITE,
            0.0, 
            10000.0, 
            2900.0
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
        'actor-to-display-ratios': GObject.ParamSpec.jsobject(
            'actor-to-display-ratios',
            'Actor to Display Ratios',
            'Ratios to convert actor coordinates to display coordinates',
            GObject.ParamFlags.READWRITE
        )
    }
}, class TestActorEffect extends Shell.GLSLEffect {
    perspective(fovDiagonalRadians, aspect, near, far) {
        // compute horizontal fov given diagonal fov and aspect ratio
        const h = Math.sqrt(aspect * aspect + 1);

        const fovRadians = fovDiagonalRadians / h * aspect;
        console.log(`fovRadians: ${fovRadians}`);

        const f = 1.0 / Math.tan(fovRadians / 2.0);
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
            uniform vec4 u_quaternion;
            uniform mat4 u_projection_matrix;
            uniform float u_display_north_offset;
            uniform float u_rotation_x_radians;
            uniform float u_rotation_y_radians;
            uniform float u_aspect_ratio;

            // for some reason the vector positions are relative to the width and height of the uiGroup actor
            uniform vec2 u_actor_to_display_ratios;

            // constants that help me adjust CoGL vector positions so their components are at the ratios intended, for proper rotation
            float cogl_position_width = 51.7;   // no idea...
            float cogl_z_factor = 2.5;          // no idea...

            vec4 applyQuaternionToVector(vec4 v, vec4 q) {
                vec3 t = 2.0 * cross(q.xyz, v.xyz);
                vec3 rotated = v.xyz + q.w * t + cross(q.xyz, t);
                return vec4(rotated, v.w);
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
        `;

        const main = `
            vec4 world_pos = cogl_position_in;

            float cogl_position_height = cogl_position_width / u_aspect_ratio;
            float position_width_adjustment_count = u_actor_to_display_ratios.x - 1.0;
            float position_height_adjustment_count = u_actor_to_display_ratios.y - 1.0;

            world_pos.z /= cogl_z_factor;

            // if the perspective includes more than just our actor, move vertices towards the center of the perspective so they'll be properly rotated
            world_pos.x += position_width_adjustment_count * cogl_position_width;
            world_pos.y += position_height_adjustment_count * cogl_position_height;

            world_pos.z *= u_aspect_ratio;
            world_pos = applyXRotationToVector(world_pos, u_rotation_x_radians);
            world_pos = applyYRotationToVector(world_pos, u_rotation_y_radians);
            world_pos = applyQuaternionToVector(world_pos, u_quaternion);
            world_pos.z /= u_aspect_ratio;

            world_pos.x /= u_actor_to_display_ratios.x;
            world_pos.y /= u_actor_to_display_ratios.y;

            world_pos = u_projection_matrix * world_pos;

            // if the perspective includes more than just our actor, move the vertices back to just the area we can see.
            // this needs to be done after the projection matrix multiplication so it will be projected as if centered in our vision
            world_pos.x -= 0.5 * position_width_adjustment_count * world_pos.w;
            world_pos.y -= 0.5 * position_height_adjustment_count * world_pos.w;

            cogl_position_out = world_pos;

            cogl_tex_coord_out[0] = cogl_tex_coord_in;
        `

        this.add_glsl_snippet(Shell.SnippetHook.VERTEX, declarations, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        if (!this._initialized) {
            const aspect = this.get_actor().width / this.get_actor().height;
            const projection_matrix = this.perspective(
                this.fov_degrees * Math.PI / 180.0,
                aspect,
                0.0001,
                1000.0
            );
            Globals.logger.log(`aspect: ${aspect}, fov: ${this.fov_degrees}, width: ${this.get_actor().width}, height: ${this.get_actor().height}, projection matrix: ${JSON.stringify(projection_matrix)}`);
            this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projection_matrix);
            this.set_uniform_float(this.get_uniform_location("u_rotation_x_radians"), 1, [this.monitor_wrapping_scheme === 'vertical' ? this.monitor_wrapping_rotation_radians : 0.0]);
            this.set_uniform_float(this.get_uniform_location("u_rotation_y_radians"), 1, [this.monitor_wrapping_scheme === 'horizontal' ? this.monitor_wrapping_rotation_radians : 0.0]);
            this.set_uniform_float(this.get_uniform_location("u_aspect_ratio"), 1, [aspect]);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_ratios"), 2, this.actor_to_display_ratios);
            this._initialized = true;
        }

        this.set_uniform_float(this.get_uniform_location("u_display_north_offset"), 1, [this.display_distance]);

        // NWU to east-up-south conversion, inverted
        this.set_uniform_float(this.get_uniform_location("u_quaternion"), 4, [this.quaternion.y, -this.quaternion.z, this.quaternion.x, this.quaternion.w]);

        this.get_pipeline().set_layer_filters(
            0,
            Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
            Cogl.PipelineFilter.LINEAR
        );

        super.vfunc_paint_target(node, paintContext);
    }
});

export const TestActor = GObject.registerClass({
    Properties: {
        'monitors': GObject.ParamSpec.jsobject(
            'monitors',
            'Monitors',
            'Array of monitor indexes',
            GObject.ParamFlags.READWRITE
        ),
        'quaternion': GObject.ParamSpec.jsobject(
            'quaternion',
            'Quaternion',
            'Camera orientation quaternion',
            GObject.ParamFlags.READWRITE
        ),
        'fov-degrees': GObject.ParamSpec.double(
            'fov-degrees',
            'FOV Degrees',
            'Field of view in degrees',
            GObject.ParamFlags.READWRITE,
            30.0, 100.0, 46.0
        ),
        'focused-monitor-index': GObject.ParamSpec.int(
            'focused-monitor-index',
            'Focused Monitor Index',
            'Index of the monitor that is currently focused',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
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
            1.0
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
    }
}, class TestActor extends Clutter.Actor {
    renderMonitors() {
        this.monitorsAsVectors = monitorsToVectors(
            {
                fovDegrees: this.fov_degrees,
                widthPixels: this.width,
                heightPixels: this.height
            },
            Main.layoutManager.monitors.map(monitor => ({
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height
            })),
            'horizontal'
        );

        // normalize the center vectors
        this.monitorAsNormalizedVectors = this.monitorsAsVectors.map(monitorVectors => {
            const vector = monitorVectors.center;
            const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
            return [vector[0] / length, vector[1] / length, vector[2] / length];
        });

        const actorToDisplayRatios = [
            Main.layoutManager.uiGroup.width / this.width, 
            Main.layoutManager.uiGroup.height / this.height
        ];
        
        Main.layoutManager.monitors.forEach(((monitor, index) => {
            // if (index === 0) return;
            Globals.logger.log(`\t\t\tMonitor ${index}: ${monitor.x}, ${monitor.y}, ${monitor.width}, ${monitor.height}`);
            
            // this is in NWU coordinates
            const noRotationVector = this.monitorsAsVectors[index].topLeftNoRotate;
            Globals.logger.log_debug(`\t\t\tMonitor ${index} vectors: ${JSON.stringify(this.monitorsAsVectors[index])}`);

            // actor coordinates are east-up-south
            const containerActor = new Clutter.Actor({
                x:  -noRotationVector[1],
                y:  -noRotationVector[2],
                'z-position': -noRotationVector[0],
                width: monitor.width,
                height: monitor.height, 
                reactive: false,
            });

            // Create a clone of the stage content for this monitor
            const monitorClone = new Clutter.Clone({
                source: Main.layoutManager.uiGroup, 
                reactive: false,
                x: -containerActor.x - monitor.x,
                y: -containerActor.y - monitor.y
            });
            monitorClone.set_clip(monitor.x, monitor.y, monitor.width, monitor.height);

            // Add the monitor actor to the scene
            containerActor.add_child(monitorClone);
            const effect = new TestActorEffect({
                quaternion: this.quaternion,
                fov_degrees: this.fov_degrees,
                monitor_index: index,
                display_distance: noRotationVector[0],
                monitor_wrapping_scheme: 'horizontal',
                monitor_wrapping_rotation_radians: monitorVectorToRotationAngle(this.monitorsAsVectors[index].center, 'horizontal').angle,
                actor_to_display_ratios: actorToDisplayRatios
            });
            containerActor.add_effect_with_name('viewport-effect', effect);
            this.add_child(containerActor);
            this.bind_property('quaternion', effect, 'quaternion', GObject.BindingFlags.DEFAULT);
            this.bind_property('focused-monitor-index', effect, 'focused-monitor-index', GObject.BindingFlags.DEFAULT);
            // this.bind_property('display-distance', effect, 'display-distance', GObject.BindingFlags.DEFAULT);
        }).bind(this));

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, (() => {
            if (this.quaternion) {
                const closestMonitorIndex = findClosestVector(this.quaternion, this.monitorAsNormalizedVectors, this.closestMonitorIndex);

                // only switch if the closest monitor is greater than the previous closest by 25%
                if (this.closestMonitorIndex === undefined || this.closestMonitorIndex !== closestMonitorIndex) {
                    Globals.logger.log(`Switching to monitor ${closestMonitorIndex}`);
                    this.closestMonitorIndex = closestMonitorIndex;
                }
            }

            return GLib.SOURCE_CONTINUE;
        }).bind(this));

        this._distance_ease_timeline = null;
        // this.connect('notify::toggle-display-distance-start', this._handle_display_distance_properties_change.bind(this));
        // this.connect('notify::toggle-display-distance-end', this._handle_display_distance_properties_change.bind(this));
        // this.connect('notify::display-distance', this._handle_display_distance_properties_change.bind(this));
        this._handle_display_distance_properties_change();
    }
    
    _handle_display_distance_properties_change() {
        const distance_from_end = Math.abs(this.display_distance - this.toggle_display_distance_end);
        const distance_from_start = Math.abs(this.display_distance - this.toggle_display_distance_start);
        this._is_display_distance_at_end = distance_from_end < distance_from_start;
    }

    _change_distance() {
        if (this._distance_ease_timeline?.is_playing()) this._distance_ease_timeline.stop();

        this._distance_ease_start = this.display_distance;
        this._distance_ease_timeline = Clutter.Timeline.new_for_actor(this, 250);

        const toggle_display_distance_target = this._is_display_distance_at_end ? 
            this.toggle_display_distance_start : this.toggle_display_distance_end;
        this._distance_ease_timeline.connect('new-frame', () => {
            this.display_distance = this._distance_ease_start + 
                this._distance_ease_timeline.get_progress() * 
                (toggle_display_distance_target - this._distance_ease_start);
        });

        this._distance_ease_timeline.start();
    }
});