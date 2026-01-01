VARYING vec3 pos;
VARYING vec2 texcoord;

void MAIN() {
    vec2 tex = vec2(texcoord.x, 1.0 - texcoord.y);
    vec4 color = texture(desktopTex, tex);
    if (showCursor) {
        vec2 fragCoord = tex * vec2(screenWidth, screenHeight);
        vec2 cursorTopLeft = vec2(cursorX, cursorY);
        vec2 cursorBottomRight = cursorTopLeft + vec2(cursorW, cursorH);
        if (fragCoord.x >= cursorTopLeft.x && fragCoord.x < cursorBottomRight.x && fragCoord.y >= cursorTopLeft.y && fragCoord.y < cursorBottomRight.y) {
            vec2 rel = (fragCoord - cursorTopLeft) / vec2(cursorW, cursorH);
            vec4 cursorCol = texture(cursorTex, rel);
            color = mix(color, cursorCol, cursorCol.a);
        }
    }
    // Apply dimming by scaling RGB towards black while preserving alpha
    color.rgb *= displayDimming;
    FRAGCOLOR = color;
}