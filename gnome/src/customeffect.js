const { Clutter, GLib, GObject } = imports.gi;

export const CustomEffect = GObject.registerClass({
    Properties: {
        'fov-degrees': GObject.ParamSpec.double(
            'fov-degrees', 
            'FOV Degrees', 
            'Diagonal field-of-view in degrees', 
            GObject.ParamFlags.READWRITE, 
            1.0, 
            179.0, 
            60.0
        )
    }
}, class Customffect extends Clutter.ShaderEffect {
    _init(params = {}) {
        super._init(params);

        this.fov_degrees = params['fov-degrees'] || 60.0;
        this.connect('notify::fov-degrees', this._updateMatrices.bind(this));

        // Set up the vertex shader
        this.set_shader_source(Clutter.ShaderType.VERTEX, `
            uniform mat4 viewMatrix;
            uniform mat4 projectionMatrix;
            uniform vec4 quaternion;

            vec3 applyQuaternionToVector(vec3 v, vec4 q) {
                return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
            }

            void main() {
                // First apply the view matrix to position the vertex in camera space
                vec4 viewPosition = viewMatrix * vec4(gl_Vertex.xyz, 1.0);
                // Then apply the quaternion rotation
                vec3 transformedPosition = applyQuaternionToVector(viewPosition.xyz, quaternion);
                // Finally apply the projection matrix
                gl_Position = projectionMatrix * vec4(transformedPosition, 1.0);
                gl_TexCoord[0] = gl_MultiTexCoord0;
            }
        `);

        // Initialize with the current matrices
        this._updateMatrices();
    }

    _updateMatrices() {
        let aspect = this.get_parent().width / this.get_parent().height;
        let fov = this.fov_degrees * Math.PI / 180.0;
        let near = 0.1;
        let far = 100.0;
        let top = Math.tan(fov / 2.0) * near;
        let bottom = -top;
        let right = top * aspect;
        let left = -right;

        let projectionMatrix = GLib.Matrix.init_frustum(left, right, bottom, top, near, far);
        let viewMatrix = GLib.Matrix.init_identity();
        
        // Calculate the appropriate Z-distance based on FOV
        let distance = -1.0 / Math.tan(fov / 2.0);
        viewMatrix = viewMatrix.translate(0, 0, distance);

        this.set_shader_uniform_value('projectionMatrix', new Clutter.ShaderValue({matrix: projectionMatrix}));
        this.set_shader_uniform_value('viewMatrix', new Clutter.ShaderValue({matrix: viewMatrix}));
    }

    set_quaternion(quat) {
        this.set_shader_uniform_value('quaternion', new Clutter.ShaderValue({vector4: quat}));
    }
});
