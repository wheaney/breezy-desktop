VARYING vec3 pos;
VARYING vec2 texcoord;

// this is a no-op vertex shader, CustomMaterial required one
void MAIN()
{
    pos = VERTEX;
    texcoord = UV0;
    POSITION = MODELVIEWPROJECTION_MATRIX * vec4(pos, 1.0);
}