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
 * @param {number[]} quaternion - Reference quaternion [x, y, z, w]
 * @param {number[][]} vectors - Array of vectors [x, y, z] to search from
 * @returns {number} Index of the closest vector, if it surpasses the previous closest index by a certain margin, otherwise the previous index
 */
function findClosestVector(quaternion, vectors, previousClosestIndex) {

    const lookVector = [1.0, 0.0, 0.0]; // NWU vector pointing to the center of the screen
    const rotatedLookVector = applyQuaternionToVector(lookVector, quaternion);
    // Globals.logger.log(`\t\t\tRotated look vector: ${rotatedLookVector}`);

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

        // Globals.logger.log(`\t\t\tMonitor ${index} distance: ${distance}`);
        if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
        }
    });

    // Globals.logger.log(`\t\t\tClosest monitor: ${closestIndex}, distance: ${closestDistance}`);

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
 * @returns {Object} - containing `start`, `center`, and `end` radians for rotating the given monitor
 */
function monitorWrap(cachedMonitorWrap, radiusPixels, monitorBeginPixel, monitorLengthPixels) {
    let closestWrap = cachedMonitorWrap.reduce((previous, current) => {
        return (!previous || Math.abs(current.pixel - monitorBeginPixel) < Math.abs(previous.pixel - monitorBeginPixel)) ? current : previous;
    }, undefined);

    if (closestWrap.pixel !== monitorBeginPixel) {
        // there's a gap between the cached wrap value and this one
        const gapPixels = monitorBeginPixel - closestWrap.pixel;
        const gapHalfRadians = Math.asin(gapPixels / 2 / radiusPixels);
        const gapRadians = gapHalfRadians * 2;

        // update the closestWrap value and cache it
        closestWrap = { pixel: monitorBeginPixel, radians: closestWrap.radians + gapRadians };
        cachedMonitorWrap.push(closestWrap);
    }

    const monitorHalfRadians = Math.asin(monitorLengthPixels / 2 / radiusPixels);
    const centerRadians = closestWrap.radians + monitorHalfRadians;
    const endRadians = centerRadians + monitorHalfRadians;

    // since we're computing the end values for this monitor, cache them too in case they line up with a future monitor
    cachedMonitorWrap.push({ pixel: monitorBeginPixel + monitorLengthPixels, radians: endRadians });
    return {
        begin: closestWrap.radians,
        center: centerRadians,
        end: endRadians
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
 *                       and a `rotation` angle for the given wrapping scheme
 */
function monitorsToPlacements(fovDetails, monitorDetailsList, monitorWrappingScheme) {
    const aspect = fovDetails.widthPixels / fovDetails.heightPixels;
    const fovVerticalRadians = degreesToRadians(fovDetails.fovDegrees / Math.sqrt(1 + aspect * aspect));

    // distance needed for the FOV-sized monitor to fill up the screen
    const centerRadius = fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2);

    const monitorPlacements = [];
    const cachedMonitorWrap = [];

    if (monitorWrappingScheme === 'horizontal') {
        // monitors wrap around us horizontally
        const fovHorizontalRadians = fovVerticalRadians * aspect;

        // distance to a horizontal edge is the hypothenuse of the triangle where the opposite side is half the width of the reference fov screen
        const edgeRadius = fovDetails.widthPixels / 2 / Math.sin(fovHorizontalRadians / 2);

        cachedMonitorWrap.push({ pixel: 0, radians: -fovHorizontalRadians / 2 });
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(cachedMonitorWrap, edgeRadius, monitorDetails.x, monitorDetails.width);

            monitorPlacements.push({
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
                ],
                rotationAngleRadians: -monitorWrapDetails.center
            });
        });
    } else if (monitorWrappingScheme === 'vertical') {
        // monitors wrap around us vertically

        // distance to a vertical edge is the hypothenuse of the triangle where the opposite side is half the height of the reference fov screen
        const edgeRadius = fovDetails.heightPixels / 2 / Math.sin(fovVerticalRadians / 2);

        cachedMonitorWrap.push({ pixel: 0, radians: -fovVerticalRadians / 2 });
        monitorDetailsList.forEach(monitorDetails => {
            const monitorWrapDetails = monitorWrap(cachedMonitorWrap, edgeRadius, monitorDetails.y, monitorDetails.height);

            monitorPlacements.push({
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
                ],
                rotationAngleRadians: -monitorWrapDetails.center
            });
        });
    } else {
        // monitors make a flat wall in front of us, no wrapping
        monitorDetailsList.forEach(monitorDetails => {
            monitorPlacements.push({
                topLeftNoRotate: [
                    centerRadius,
                    -(monitorDetails.x - fovDetails.widthPixels / 2),
                    -(monitorDetails.y - fovDetails.heightPixels / 2)
                ],
                center: [
                    centerRadius,
                    -(monitorDetails.x + monitorDetails.width / 2 - fovDetails.widthPixels / 2),
                    -(monitorDetails.y + monitorDetails.height / 2 - fovDetails.heightPixels / 2)
                ],
                rotationAngleRadians: 0
            });
        });
    }

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
function lookAheadMS(imuDateMs, override) {
    // how stale the imu data is
    const dataAge = Date.now() - imuDateMs;

    // if (override === -1)
    //     return lookAheadCfg[0] + dataAge;

    return override + dataAge;
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
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
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
            uniform mat4 u_imu_data;
            uniform float u_look_ahead_ms;
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

            float vectorLength(vec3 v) {
                return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            }

            float quaternionLength(vec4 q) {
                return sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
            }

            vec4 quatMul(vec4 q1, vec4 q2) {
                return vec4(
                    q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,  // x
                    q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,  // y
                    q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,  // z
                    q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z   // w
                );
            }

            vec4 quatConjugate(vec4 q) {
                return vec4(-q.xyz, q.w);
            }

            vec4 quatExp(vec4 q) {
                float vLength = vectorLength(q.xyz);
                float expW = exp(q.w);
                
                if (vLength < 0.000001) {
                    return vec4(0.0, 0.0, 0.0, expW);
                }
                
                float scale = expW * sin(vLength) / vLength;
                return vec4(q.xyz * scale, expW * cos(vLength));
            }

            vec4 quatLog(vec4 q) {
                float qLength = quaternionLength(q);
                float vLength = vectorLength(q.xyz);
                
                if (vLength < 0.000001) {
                    return vec4(0.0, 0.0, 0.0, log(qLength));
                }
                
                float scale = acos(clamp(q.w / qLength, -1.0, 1.0)) / vLength;
                return vec4(q.xyz * scale, log(qLength));
            }

            vec4 computeQuaternionVelocity(vec4 q1, vec4 q2, float milliseconds) {
                // Normalize input quaternions
                q1 = normalize(q1);
                q2 = normalize(q2);
                
                // Compute difference quaternion (q2 * q1^-1)
                vec4 diffQ = quatMul(q2, quatConjugate(q1));
                
                // Ensure we take the shortest path
                if (diffQ.w < 0.0) {
                    diffQ = -diffQ;
                }
                
                // Take the log and scale by time
                return quatLog(diffQ) / milliseconds;
            }

            vec4 extrapolateRotation(vec4 initialQuat, vec4 velocity, float deltaTimeMs) {
                // Scale velocity by time
                vec4 scaledVelocity = velocity * deltaTimeMs;
                
                // Compute the exponential
                vec4 deltaRotation = quatExp(scaledVelocity);
                
                // Apply to initial quaternion
                return normalize(quatMul(deltaRotation, initialQuat));
            }

            vec4 imuDataToLookAheadQuaternion(mat4 imuData, float lookAheadMS) {
                // last row of matrix contains imu timestamps, subtract the second column from the first
                float imuDeltaTime = imuData[3][0] - imuData[3][1];

                // rotation per ms
                vec4 velocity = computeQuaternionVelocity(imuData[0], imuData[1], imuDeltaTime);
                return extrapolateRotation(imuData[0], velocity, lookAheadMS);
            }

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

            vec4 nwuToESU(vec4 v) {
                return vec4(-v.y, v.z, -v.x, v.w);
            }
        `;

        const main = `
            vec4 world_pos = cogl_position_in;
            vec4 look_ahead_quaternion = nwuToESU(imuDataToLookAheadQuaternion(u_imu_data, u_look_ahead_ms));

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
            world_pos = applyQuaternionToVector(world_pos, quatConjugate(look_ahead_quaternion));
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
            this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projection_matrix);
            this.set_uniform_float(this.get_uniform_location("u_rotation_x_radians"), 1, [this.monitor_wrapping_scheme === 'vertical' ? this.monitor_wrapping_rotation_radians : 0.0]);
            this.set_uniform_float(this.get_uniform_location("u_rotation_y_radians"), 1, [this.monitor_wrapping_scheme === 'horizontal' ? this.monitor_wrapping_rotation_radians : 0.0]);
            this.set_uniform_float(this.get_uniform_location("u_aspect_ratio"), 1, [aspect]);
            this.set_uniform_float(this.get_uniform_location("u_actor_to_display_ratios"), 2, this.actor_to_display_ratios);
            this._initialized = true;
        }

        this.set_uniform_float(this.get_uniform_location('u_look_ahead_ms'), 1, [lookAheadMS(this.imu_snapshots.timestamp_ms, 0)]);
        this.set_uniform_float(this.get_uniform_location("u_display_north_offset"), 1, [this.display_distance]);
        this.set_uniform_matrix(this.get_uniform_location("u_imu_data"), false, 4, this.imu_snapshots.imu_data);

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
        'imu-snapshots': GObject.ParamSpec.jsobject(
            'imu-snapshots',
            'IMU Snapshots',
            'Latest IMU quaternion snapshots and epoch timestamp for when it was collected',
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
        this._monitorPlacements = monitorsToPlacements(
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
        this._monitorsAsNormalizedVectors = this._monitorPlacements.map(monitorVectors => {
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
            const noRotationVector = this._monitorPlacements[index].topLeftNoRotate;
            Globals.logger.log_debug(`\t\t\tMonitor ${index} vectors: ${JSON.stringify(this._monitorPlacements[index])}`);

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
                imu_snapshots: this.imu_snapshots,
                fov_degrees: this.fov_degrees,
                monitor_index: index,
                display_distance: noRotationVector[0],
                monitor_wrapping_scheme: 'horizontal',
                monitor_wrapping_rotation_radians: this._monitorPlacements[index].rotationAngleRadians,
                actor_to_display_ratios: actorToDisplayRatios
            });
            containerActor.add_effect_with_name('viewport-effect', effect);
            this.add_child(containerActor);
            this.bind_property('imu-snapshots', effect, 'imu-snapshots', GObject.BindingFlags.DEFAULT);
            this.bind_property('focused-monitor-index', effect, 'focused-monitor-index', GObject.BindingFlags.DEFAULT);
            // this.bind_property('display-distance', effect, 'display-distance', GObject.BindingFlags.DEFAULT);
        }).bind(this));

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, (() => {
            if (this.imu_snapshots) {
                const closestMonitorIndex = findClosestVector(
                    this.imu_snapshots.imu_data.splice(0, 4),
                    this._monitorsAsNormalizedVectors, this.closestMonitorIndex
                );

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