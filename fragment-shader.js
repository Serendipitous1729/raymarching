const FRAGMENT_SHADER = /*glsl*/`

precision highp float;

varying vec2 v_coord;

uniform vec2 u_resolution;
uniform float u_time;

float focal_dist = 1.;
const int max_steps = 255;
const float PI = 3.14159265358979;
vec3 light_dir = vec3(1., 1., -1.);

float EPSILON = 0.001;

// transforming a SDF is equivalent to evaluating the SDF at the inversely transformed p
vec3 rotateX(vec3 p, float theta) {
    float c = cos(-theta);
    float s = sin(-theta);
    mat4 transformation = mat4(
        vec4(1., 0., 0., 0.),
        vec4(0., c, s, 0.),
        vec4(0., -s, c, 0.),
        vec4(0., 0., 0., 1.)
    );
    return (transformation * vec4(p, 1.0)).xyz;
}
vec3 rotateY(vec3 p, float theta) {
    float c = cos(-theta);
    float s = sin(-theta);
    mat4 transformation = mat4(
        vec4(c, 0., -s, 0.),
        vec4(0., 1., 0., 0.),
        vec4(s, 0., c, 0.),
        vec4(0., 0., 0., 1.)
    );
    return (transformation * vec4(p, 1.0)).xyz;
}
vec3 rotateZ(vec3 p, float theta) {
    float c = cos(-theta);
    float s = sin(-theta);
    mat4 transformation = mat4(
        vec4(c, s, 0., 0.),
        vec4(-s, c, 0., 0.),
        vec4(0., 0., 1., 0.),
        vec4(0., 0., 0., 1.)
    );
    return (transformation * vec4(p, 1.0)).xyz;
}

vec3 translate(vec3 p, vec3 d) {
    return p - d;
}

float sphereSDF(vec3 p, float radius) {
    return length(p) - radius;
}

float cubeSDF(vec3 p, float side) {
    // If d.x < 0, then -1 < p.x < 1, and same logic applies to p.y, p.z
    // So if all components of d are negative, then p is inside the unit cube
    vec3 d = abs(p) - 0.5*vec3(side, side, side);
    
    // Assuming p is inside the cube, how far is it from the surface?
    // Result will be negative or zero.
    float insideDistance = min(max(d.x, max(d.y, d.z)), 0.0);
    
    // Assuming p is outside the cube, how far is it from the surface?
    // Result will be positive or zero.
    float outsideDistance = length(max(d, 0.0));
    
    return insideDistance + outsideDistance;
}

// inigo quilez, cubic smoothmin function
float smin( float a, float b, float k )
{
    k *= 6.0;
    float h = max( k-abs(a-b), 0.0 )/k;
    return min(a,b) - h*h*h*k*(1.0/6.0);
}

vec3 trajectory(float t, vec3 amplitudes, vec3 phases) {
    vec3 t_ = amplitudes * t + phases;
    return vec3(cos(t_.x), cos(t_.y), cos(t_).z);
}

vec3 spiralTrajectory(float t, float r, float offset) {
    float t_mod = mod(t, 2.) / 2.;
    float theta = 2. * PI * exp(t_mod) + offset;
    return r * (1. - t_mod) * vec3(cos(theta), 0., sin(theta));
}

vec4 unionSDF(vec4 a, vec4 b) {
    if(a.w < b.w){
        return a;
    }
    return b;
}

vec4 sceneSDF(vec3 p) {
    float t = u_time / 1000.;

    float sphere1_amplitude = 0.1*((1. + sin(t))*(1. + sin(1.6*t+4.2))+1.);
    //float sphere1_amplitude = 0.5*pow(max(0., sin(t)), 4.);
    vec3 sphere1_pos = sphere1_amplitude*trajectory(2.*t, vec3(1.2, 2.73, 0.983), vec3(t, 0., 0.));
    float sphere1 = sphereSDF(translate(p, sphere1_pos), 1.);

    vec3 sphere2_pos = vec3(0., 0., 0.);
    float sphere2 = sphereSDF(translate(p, sphere2_pos), 1.8+0.2*sin(t));

    vec4 center = vec4(vec3(0., 0., 0.), smin(sphere2, sphere1, 0.25));

    vec3 cube_pos = 4. * vec3(sin(0.25 * PI * t), 0.1 * cos(4.*t), cos(0.25 * PI * t));
    float cube = cubeSDF(rotateY(translate(rotateZ(p, 0.2), cube_pos), t), 0.5);

    vec3 cube2_pos = 3. * vec3(cos(-0.25 * PI * t), 0.2 + 0.1 * cos(4.*t), sin(0.25 * PI * t));
    float cube2 = cubeSDF(rotateY(translate(rotateZ(p, -0.5), cube2_pos), t), 0.4);

    vec3 cube3_pos = 3. * vec3(cos(0.4 * PI * t), -0.5 + smoothstep(4. + 4.*sin(t), 0., 1.), sin(0.4 * PI * t));
    float cube3 = cubeSDF(rotateY(translate(p, cube3_pos), t), 0.3);

    vec4 cubes = unionSDF(vec4(vec3(0.0, 0.4, 0.8), cube2), vec4(vec3(0.8, 0.4, 0.0), cube));
    vec4 cubes2 = unionSDF(cubes, vec4(vec3(0.0, 0.8, 0.6), cube3));

    vec4 combined = unionSDF(cubes2, center);


    return combined;
}

vec3 surfaceNormal(vec3 p) {
    // normalized gradient of sceneSDF!
    return normalize(vec3(
        sceneSDF(vec3(p.x + EPSILON, p.y, p.z)).w - sceneSDF(vec3(p.x, p.y, p.z)).w,
        sceneSDF(vec3(p.x, p.y + EPSILON, p.z)).w - sceneSDF(vec3(p.x, p.y, p.z)).w,
        sceneSDF(vec3(p.x, p.y, p.z + EPSILON)).w - sceneSDF(vec3(p.x, p.y, p.z)).w
    ));
}

void main() {
    vec2 coord = u_resolution * v_coord / min(u_resolution.x, u_resolution.y);
    float t = u_time / 1000.;

    vec3 ray_dir = normalize(vec3(coord, focal_dist));
    vec3 camera = vec3(0., 0., -6.);
    float ray_length = 0.;
    for(int i = 0; i < max_steps; i++) {
        vec3 p = camera + ray_dir * ray_length;
        vec4 ssdf = sceneSDF(p);
        float signed_dist = ssdf.w;
        if(signed_dist < EPSILON) {
            float shade = smoothstep(0.0, 50.0, float(i));
            if(ssdf.x != 0.0 || ssdf.y != 0.0 || ssdf.z != 0.0){
                shade = 0.;
            }
            vec4 glow = vec4(shade, shade, shade, 1.);
            float darkFactor = clamp(clamp(dot(surfaceNormal(p), light_dir), 0., 1.) + 0.3, 0., 1.);
            vec4 color = vec4(darkFactor * ssdf.xyz, 1.);
            gl_FragColor = glow + color;
            return;
        }
        ray_length += signed_dist;
    }

    gl_FragColor = vec4(0., 0., 0., 1.);
}
`;