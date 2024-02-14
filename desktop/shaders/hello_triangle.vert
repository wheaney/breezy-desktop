#version 450
#extension GL_ARB_separate_shader_objects : enable

out gl_PerVertex {
    vec4 gl_Position;
};

layout(location = 0) out vec2 fragPosition;

vec2 positions[6] = vec2[](
    vec2(-1.0, -1.0),
    vec2(1.0, -1.0),
    vec2(1.0, 1.0),
    vec2(-1.0, -1.0),
    vec2(1.0, 1.0),
    vec2(-1.0, 1.0)
);

void main() {
    gl_Position = vec4(positions[gl_VertexIndex], 0.0, 1.0);
    fragPosition = positions[gl_VertexIndex] * 0.5 + 0.5;
}