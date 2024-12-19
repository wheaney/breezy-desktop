
import Clutter from 'gi://Clutter'
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Globals from './globals.js';

export const TestActorEffect = GObject.registerClass({
    Properties: {
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
        )
    }
}, class TestActorEffect extends Shell.GLSLEffect {
    constructor(params = {}) {
        super(params);


        // Compute the projection matrix
        let aspectRatio = this.width / this.height;
        let fovRadians = this.fov_degrees * (Math.PI / 180);
        let near = 0.1;
        let far = 1000.0;

        let projectionMatrix = this._computeProjectionMatrix(fovRadians, aspectRatio, near, far);
        Globals.logger.log(JSON.stringify(projectionMatrix));

        // Compute the view matrix from the quaternion
        let viewMatrix = this._computeViewMatrixFromQuaternion(this.quaternion);
        Globals.logger.log(JSON.stringify(viewMatrix));

        let rotationMatrix = this._createRotationMatrix(this.quaternion);
        Globals.logger.log(JSON.stringify(rotationMatrix));
    }

    _computeProjectionMatrix(fovRadians, aspect, near, far) {
        let f = 1.0 / Math.tan(fovRadians / 2);
        let nf = 1 / (near - far);

        let projectionMatrix = [
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, (2 * far * near) * nf, 0
        ];

        return projectionMatrix;
    }

    _computeViewMatrixFromQuaternion(q) {
        let x = q.x, y = q.y, z = q.z, w = q.w;

        let x2 = x + x;
        let y2 = y + y;
        let z2 = z + z;

        let xx = x * x2;
        let xy = x * y2;
        let xz = x * z2;
        let yy = y * y2;
        let yz = y * z2;
        let zz = z * z2;
        let wx = w * x2;
        let wy = w * y2;
        let wz = w * z2;

        let viewMatrix = [
            1 - (yy + zz), xy - wz, xz + wy, 0,
            xy + wz, 1 - (xx + zz), yz - wx, 0,
            xz - wy, yz + wx, 1 - (xx + yy), 0,
            0, 0, 0, 1
        ];

        // Invert the view matrix (since it's from camera space)
        // For rotation matrices, the inverse is the transpose
        let inverseViewMatrix = [
            viewMatrix[0], viewMatrix[4], viewMatrix[8], 0,
            viewMatrix[1], viewMatrix[5], viewMatrix[9], 0,
            viewMatrix[2], viewMatrix[6], viewMatrix[10], 0,
            0, 0, 0, 1
        ];

        return viewMatrix;
    }

    _createRotationMatrix(q) {
        // Normalize the quaternion
        const len = Math.sqrt(
            q.x * q.x + 
            q.y * q.y + 
            q.z * q.z + 
            q.w * q.w
        );
        const x = q.x / len;
        const y = q.y / len;
        const z = q.z / len;
        const w = q.w / len;

        // Compute matrix elements
        const x2 = x * x;
        const y2 = y * y;
        const z2 = z * z;
        const xy = x * y;
        const xz = x * z;
        const yz = y * z;
        const wx = w * x;
        const wy = w * y;
        const wz = w * z;

        // Create rotation matrix
        return [
            1.0 - 2.0 * (y2 + z2),  // m00
            2.0 * (xy - wz),         // m01
            2.0 * (xz + wy),         // m02
            0.0,                     // m03

            2.0 * (xy + wz),         // m10
            1.0 - 2.0 * (x2 + z2),   // m11
            2.0 * (yz - wx),         // m12
            0.0,                     // m13

            2.0 * (xz - wy),         // m20
            2.0 * (yz + wx),         // m21
            1.0 - 2.0 * (x2 + y2),   // m22
            0.0,                     // m23

            0.0,                     // m30
            0.0,                     // m31
            0.0,                     // m32
            1.0                      // m33
        ];
    }

    vfunc_build_pipeline() {
        const declarations = `
            uniform mat4 u_rotation_matrix;
            uniform mat4 u_view_matrix;
            uniform mat4 u_projection_matrix;
        `;

        const main = `
            vec4 world_pos = cogl_position_in;
            world_pos = u_rotation_matrix * world_pos;
            world_pos = cogl_modelview_matrix * world_pos;
            cogl_position_out = cogl_projection_matrix * world_pos;
            cogl_tex_coord_out[0] = cogl_tex_coord_in;
        `

        this.add_glsl_snippet(Shell.SnippetHook.VERTEX, declarations, main, false);
    }

    vfunc_paint_target(node, paintContext) {
        // Compute the projection matrix
        let aspectRatio = this.width / this.height;
        let fovRadians = this.fov_degrees * (Math.PI / 180);
        let near = 0.1;
        let far = 1000.0;

        let projectionMatrix = this._computeProjectionMatrix(fovRadians, aspectRatio, near, far);

        // Compute the view matrix from the quaternion
        let viewMatrix = this._computeViewMatrixFromQuaternion(this.quaternion);

        // Set up the uniforms
        this.set_uniform_matrix(this.get_uniform_location("u_projection_matrix"), false, 4, projectionMatrix);
        this.set_uniform_matrix(this.get_uniform_location("u_view_matrix"), false, 4, viewMatrix);
        this.set_uniform_matrix(this.get_uniform_location("u_rotation_matrix"), false, 4, this._createRotationMatrix(this.quaternion));

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
        )
    }
}, class TestActor extends Clutter.Actor {
    constructor(params = {}) {
        super({...params});

        // Set the size of the viewport (implicitly provides aspect ratio)
        // You can set the size when adding this actor to the stage
        // this.set_size(this.width, this.height);

        // Create the monitor actors
        this._createMonitorActors();

        // Apply the shader effect to this viewport actor
        // this._applyShaderEffect();
    }

    _createMonitorActors() {
        Main.layoutManager.monitors.forEach((monitor, index) => {
            // if (index === 0) return;
            Globals.logger.log(`\t\t\tMonitor ${index}: ${monitor.x}, ${monitor.y}, ${monitor.width}, ${monitor.height}`);
            
            const containerActor = new Clutter.Actor({
                x:  -monitor.x,
                y:  monitor.y,
                'z-position': -500,
                width: monitor.width,
                height: monitor.height, 
                reactive: false
            });
            // Create a clone of the stage content for this monitor
            const monitorClone = new Clutter.Clone({
                source: Main.layoutManager.uiGroup, 
                reactive: false
            });

            monitorClone.x = -monitor.x;
            // monitorActor.y = 0;

            // Set the size and position of the clone to match the monitor
            // monitorActor.set_size(monitor.width, monitor.height);

            // // Apply clipping to show only this monitor's area
            monitorClone.set_clip(monitor.x, 0, monitor.width, monitor.height);

            // Position the monitor actor within the 3D scene
            // monitorActor.set_position(0, 0);

            // // For 3D positioning, we might want to center the monitors around (0,0,0)
            // // Adjust positions accordingly
            // monitorActor.set_translation(monitor.x, monitor.y, 1.0);

            // Add the monitor actor to the scene
            containerActor.add_child(monitorClone);
            containerActor.add_effect_with_name('viewport-effect', new TestActorEffect({
                quaternion: this.quaternion,
                fov_degrees: this.fov_degrees,
                width: this.width,
                height: this.height
            }));
            this.add_child(containerActor);
        });
    }

    // _applyShaderEffect() {
    //     const glslEffect = 

    //     // Apply the shader effect to this viewport actor
    //     this.add_effect_with_name('viewport-effect', glslEffect);
    // }
});