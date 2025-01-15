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
    Globals.logger.log(`\t\t\tQuaternion: ${JSON.stringify(quaternion)}`);
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
        center: centerRadians,
        end: centerRadians + monitorHalfRadians
    }
}

/**
 * Convert the given monitor details into NWU vectors pointing to the center of each monitor.
 * 
 * @param {Object} fovDetails - contains reference fovDegrees (diagonal), widthPixels, heightPixels
 * @param {Object[]} monitorDetailsList - contains x, y, width, height (coordinates from top-left)
 * @param {string} monitorWrappingScheme - horizontal, vertical, none
 * @returns {number[]} - Vector [x, y, z]
 */
function monitorsToVectors(fovDetails, monitorDetailsList, monitorWrappingScheme) {
    const aspect = fovDetails.widthPixels / fovDetails.heightPixels;
    const fovVerticalRadians = degreesToRadians(fovDetails.fovDegrees / Math.sqrt(1 + aspect * aspect));

    // NWU vectors pointing to the center of the screen for each monitor
    const monitorVectors = [];

    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally
        const fovHorizontalRadians = fovVerticalRadians * aspect;

        // radius is the hypothenuse of the triangle where the opposite side is half the width of the reference fov screen
        const radius = fovDetails.widthPixels / 2 / Math.sin(fovHorizontalRadians / 2);

        let previousMonitorEndRadians = -fovHorizontalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(radius, previousMonitorEndRadians, monitorDetails.width);
            previousMonitorEndRadians = monitorWrapDetails.end;

            monitorVectors.push([
                // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                radius * Math.cos(monitorWrapDetails.center),

                // west is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                -radius * Math.sin(monitorWrapDetails.center),

                // up is flat when wrapping horizontally
                -(monitorDetails.y + monitorDetails.height / 2 - fovDetails.heightPixels / 2)
            ]);
        });
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically

        // radius is the hypothenuse of the triangle where the opposite side is half the height of the reference fov screen
        const radius = fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2);

        let previousMonitorEndRadians = -fovVerticalRadians / 2;
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(radius, previousMonitorEndRadians, monitorDetails.height);
            previousMonitorEndRadians = monitorWrapDetails.end;

            monitorVectors.push([
                // north is adjacent where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                radius * Math.cos(monitorWrapDetails.center),

                // west is flat when wrapping vertically
                -(monitorDetails.x + monitorDetails.width / 2 - fovDetails.widthPixels / 2),

                // up is opposite where radius is the hypotenuse, using monitorWrapDetails.center as the radians
                -radius * Math.sin(monitorWrapDetails.center)
            ]);
        });
    } else {
        // monitors make a flat wall in front of us, no wrapping
        monitorDetailsList.forEach(monitorDetails => {
            monitorVectors.push([
                fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2),
                -(monitorDetails.x + monitorDetails.width / 2 - fovDetails.widthPixels / 2),
                -(monitorDetails.y + monitorDetails.height / 2 - fovDetails.heightPixels / 2)
            ]);
        });
    }

    return monitorVectors;
}

function monitorVectorToRotationAngle(vector, monitorWrappingScheme) {
    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally
        return {
            angle: radiansToDegrees(Math.atan2(vector[1], vector[0])),
            axis: Clutter.RotateAxis.Y_AXIS
        };
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically
        return {
            angle: radiansToDegrees(Math.atan2(vector[2], vector[0])),
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

            vec4 applyQuaternionToVector(vec4 v, vec4 q) {
                vec3 t = 2.0 * cross(q.xyz, v.xyz);
                vec3 rotated = v.xyz + q.w * t + cross(q.xyz, t);
                return vec4(rotated, v.w);
            }
        `;

        const main = `
            vec4 world_pos = cogl_position_in;

            // // move pixel space to texcoord space
            // world_pos.x = (world_pos.x / 192.0);
            // world_pos.y = (world_pos.y / 108.0);

            // float displayAspectRatio = 1920.0 / 1080.0;
            // float diagToVertRatio = sqrt(pow(displayAspectRatio, 2) + 1);
            // float halfFovZRads = radians(46.0 / diagToVertRatio) / 2.0;
            // float halfFovYRads = halfFovZRads * displayAspectRatio;
            // vec2 fovHalfWidths = vec2(tan(halfFovYRads), tan(halfFovZRads));
            // vec2 fovWidths = fovHalfWidths * 2.0;

            // float vec_y = -world_pos.x * fovWidths.x + fovHalfWidths.x;
            // float vec_z = -world_pos.y * fovWidths.y + fovHalfWidths.y;
            // vec4 look_vector = vec4(1.0, vec_y, vec_z, 1.0);
            // // vec3 rotated_vector = applyQuaternionToVector(look_vector, u_quaternion).xyz;
            // vec3 rotated_vector = look_vector.xyz;

            // // scale back to the screen distance
            // rotated_vector /= rotated_vector.x;
            // cogl_position_out = vec4(
            //     ((fovHalfWidths.x - rotated_vector.y) / fovWidths.x) * 2.0 - 1.0,
            //     ((fovHalfWidths.y - rotated_vector.z) / fovWidths.y) * 2.0 - 1.0,
            //     0.0,
            //     1.0
            // );

            // float z_orig = world_pos.z;
            // world_pos.z -= z_orig / 1920.0;
            // world_pos.x /= 2.0;
            // world_pos *= u_display_north_offset;
            world_pos = applyQuaternionToVector(world_pos, u_quaternion);
            // world_pos /= u_display_north_offset;
            // world_pos.x *= 2.0;
            // world_pos.z += z_orig / 1920.0;
            world_pos = cogl_modelview_matrix * world_pos;
            cogl_position_out = cogl_projection_matrix * world_pos;

            // cogl_position_out.x = world_pos.x / 103.4;
            // cogl_position_out.y = world_pos.y / 29.075;
            // cogl_position_out.z = -1.0;
            // cogl_position_out.w = 1.0;

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
            this._initialized = true;
        }

        this.set_uniform_float(this.get_uniform_location("u_display_north_offset"), 1, [this.focused_monitor_index === this.monitor_index ? this.display_distance : this.toggle_display_distance_start]);

        // NUW to east-up-south conversion, inverted
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
        this.monitorAsNormalizedVectors = this.monitorsAsVectors.map(vector => {
            const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
            return [vector[0] / length, vector[1] / length, vector[2] / length];
        });
        
        Main.layoutManager.monitors.forEach(((monitor, index) => {
            // if (index === 0) return;
            Globals.logger.log(`\t\t\tMonitor ${index}: ${monitor.x}, ${monitor.y}, ${monitor.width}, ${monitor.height}`);
            
            // this is in NWU coordinates
            const monitorVector = this.monitorsAsVectors[index];
            const monitorRotation = monitorVectorToRotationAngle(monitorVector, 'horizontal');
            Globals.logger.log_debug(`\t\t\tMonitor ${index} vector: ${monitorVector} rotation: ${JSON.stringify(monitorRotation)}`);

            // actor coordinates are east-up-south
            const containerActor = new Clutter.Actor({
                x:  -monitorVector[1],
                y:  -monitorVector[2],
                'z-position': -monitorVector[0],
                width: monitor.width,
                height: monitor.height, 
                reactive: false
            });

            // Create a clone of the stage content for this monitor
            const monitorClone = new Clutter.Clone({
                source: Main.layoutManager.uiGroup, 
                reactive: false
            });

            monitorClone.x = -containerActor.x;
            // monitorActor.y = 0;
            monitorClone.set_clip(monitor.x, 0, monitor.width, monitor.height);

            // Add the monitor actor to the scene
            containerActor.add_child(monitorClone);
            containerActor.set_pivot_point(0.5, 0.5);
            containerActor.set_rotation_angle(monitorRotation.axis, monitorRotation.angle);
            const effect = new TestActorEffect({
                quaternion: this.quaternion,
                fov_degrees: this.fov_degrees,
                monitor_index: index,
                display_distance: this.toggle_display_distance_start
            });
            containerActor.add_effect_with_name('viewport-effect', effect);
            this.add_child(containerActor);
            this.bind_property('quaternion', effect, 'quaternion', GObject.BindingFlags.DEFAULT);
            this.bind_property('focused-monitor-index', effect, 'focused-monitor-index', GObject.BindingFlags.DEFAULT);
            this.bind_property('display-distance', effect, 'display-distance', GObject.BindingFlags.DEFAULT);
        }).bind(this));

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, (() => {
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
        this.connect('notify::toggle-display-distance-start', this._handle_display_distance_properties_change.bind(this));
        this.connect('notify::toggle-display-distance-end', this._handle_display_distance_properties_change.bind(this));
        this.connect('notify::display-distance', this._handle_display_distance_properties_change.bind(this));
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