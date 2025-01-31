const VERTEX_SHADER = /*glsl*/`
attribute vec4 a_position;

varying vec2 v_coord;

void main() {
    v_coord = a_position.xy;
    gl_Position = a_position;
}
`;