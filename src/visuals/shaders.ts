export const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUV;

void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const BACKGROUND_SHADER = `
precision mediump float;

uniform float uTime;
uniform vec2 uRes;
uniform vec3 uBase;
uniform vec3 uUpper;
uniform vec3 uWarmth;
uniform vec3 uDepth;
varying vec2 vUV;

float softCircle(vec2 p, vec2 c, float r, float falloff) {
  float d = length(p - c) / r;
  return exp(-pow(d, falloff));
}

void main() {
  vec2 uv = vUV;
  vec2 p = uv - 0.5;
  p.x *= uRes.x / uRes.y;

  float vignette = smoothstep(0.92, 0.18, length(p));
  float vertical = smoothstep(0.0, 1.0, uv.y);
  float breath = sin(uTime * 0.12) * 0.5 + 0.5;

  vec3 col = mix(uBase, uUpper, vertical * 0.55);
  col += uWarmth * softCircle(p, vec2(-0.32, -0.18), 0.88 + breath * 0.04, 2.2) * 0.34;
  col += uDepth * softCircle(p, vec2(0.28, 0.22), 0.72, 2.0) * 0.48;
  col += vec3(0.018, 0.02, 0.022) * softCircle(p, vec2(0.0, 0.02), 0.42, 2.0);
  col *= mix(0.42, 1.0, vignette);

  gl_FragColor = vec4(col, 1.0);
}`;

export const ORB_SHADER = `
precision mediump float;

uniform float uTime;
uniform float uSeed;
uniform float uDensity;
uniform float uRadius;
uniform vec2 uCenter;
uniform vec2 uRes;
uniform vec3 uCore;
uniform vec3 uGlow;
uniform vec3 uRim;
varying vec2 vUV;

float dropletField(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return (r * r) / (dot(d, d) + 0.0018);
}

vec2 dropletGradient(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  float v = dot(d, d) + 0.0018;
  return -2.0 * r * r * d / (v * v);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 uv = vUV - uCenter;
  uv.x *= asp;

  float dist = length(uv) / uRadius;
  if (dist > 2.8) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float density = clamp(uDensity, 0.0, 1.0);
  float breath = sin(uTime * mix(0.26, 0.48, density) + uSeed) * 0.035;
  float wobble = sin(uTime * 0.19 + uSeed * 1.37) * 0.018;
  vec2 p = uv / (uRadius * (1.0 + breath));

  vec2 c0 = vec2(0.0);
  vec2 c1 = vec2(
    sin(uTime * 0.21 + uSeed) * 0.095,
    cos(uTime * 0.18 + uSeed * 1.4) * 0.075
  );
  vec2 c2 = vec2(
    -0.13 + sin(uTime * 0.16 + uSeed * 0.8) * 0.035,
    0.05 + cos(uTime * 0.13 + uSeed * 2.1) * 0.035
  );
  vec2 c3 = vec2(
    0.1 + cos(uTime * 0.15 + uSeed * 1.9) * 0.04,
    -0.08 + sin(uTime * 0.17 + uSeed * 1.2) * 0.04
  );

  float f = 0.0;
  f += dropletField(p, c0, 0.74 + density * 0.12 + wobble);
  f += dropletField(p, c1, 0.34 + density * 0.08);
  f += dropletField(p, c2, 0.22 + density * 0.06);
  f += dropletField(p, c3, 0.18 + density * 0.05);

  float threshold = 0.92;
  float body = smoothstep(threshold - 0.045, threshold + 0.025, f);
  float outer = smoothstep(threshold - 0.42, threshold + 0.02, f);
  if (outer < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 grad = vec2(0.0);
  grad += dropletGradient(p, c0, 0.74 + density * 0.12 + wobble);
  grad += dropletGradient(p, c1, 0.34 + density * 0.08);
  grad += dropletGradient(p, c2, 0.22 + density * 0.06);
  grad += dropletGradient(p, c3, 0.18 + density * 0.05);

  vec2 n2 = normalize(grad + vec2(0.0001));
  float z = sqrt(clamp(1.0 - dot(n2, n2) * 0.22, 0.0, 1.0));
  vec3 normal = normalize(vec3(n2 * 0.52, z));
  vec3 light = normalize(vec3(-0.42, 0.58, 0.70));
  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(light + view);

  float diffuse = max(dot(normal, light), 0.0);
  float spec = pow(max(dot(normal, halfVec), 0.0), 70.0) * (0.42 + density * 0.42);
  float microSpec = pow(max(dot(normal, normalize(vec3(0.58, -0.25, 0.78))), 0.0), 140.0) * 0.16;
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.3);
  float rim = fresnel * body;
  float innerShadow = smoothstep(2.7, 0.95, f) * body;
  float caustic = sin((p.x - p.y) * 7.0 + uSeed + uTime * 0.16) * 0.5 + 0.5;
  caustic *= smoothstep(0.96, 2.1, f) * body * 0.08;

  vec3 glass = mix(uGlow * 0.52, uCore, 0.34 + diffuse * 0.28);
  glass += uRim * rim * 0.48;
  glass += vec3(1.0, 0.96, 0.86) * (spec + microSpec);
  glass += uGlow * caustic;
  glass *= mix(0.68, 1.12, innerShadow);

  float aura = exp(-dist * mix(1.8, 2.45, density)) * (0.035 + density * 0.08);
  vec3 col = glass * body + uGlow * aura;
  col = col / (vec3(0.72) + col);
  col = pow(max(col, vec3(0.0)), vec3(0.72));

  float alpha = body * mix(0.34, 0.58, density) + rim * 0.28 + aura * 0.7;
  alpha *= smoothstep(2.55, 0.18, dist);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.78));
}`;
