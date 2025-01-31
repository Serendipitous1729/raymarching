const FRAGMENT_SHADER = /*glsl*/`

precision highp float;

varying vec2 v_coord;

uniform vec2 u_resolution;
uniform float u_time;

void main() {
    vec2 coord = v_coord / u_resolution;
    float t = u_time / 1000.;

    gl_FragColor = vec4(sin(t), v_coord, 1.);
}
`;