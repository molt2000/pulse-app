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

void main() {
  float asp = uRes.x / uRes.y;
  vec2 uv = vUV - uCenter;
  uv.x *= asp;

  float dist = length(uv) / uRadius;
  if (dist > 3.2) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float density = clamp(uDensity, 0.0, 1.0);
  float breath = sin(uTime * mix(0.42, 0.74, density) + uSeed) * 0.055;
  float drift = sin(uTime * 0.21 + uSeed * 1.7) * 0.018;
  float r = dist / (1.0 + breath + drift);

  float halo = exp(-r * mix(0.95, 1.5, density)) * mix(0.08, 0.38, density);
  float body = exp(-r * r * mix(4.2, 7.5, density)) * mix(0.18, 0.68, density);
  float core = exp(-r * r * mix(24.0, 42.0, density)) * mix(0.16, 0.7, density);
  float rim = exp(-pow(r - 0.62, 2.0) * 34.0) * mix(0.06, 0.22, density);
  float glass = smoothstep(0.95, 0.1, r) * (0.08 + density * 0.1);

  vec3 col = uGlow * halo + mix(uGlow, uCore, smoothstep(0.85, 0.05, r)) * body;
  col += uCore * core + uRim * rim + vec3(1.0) * glass;
  col = col / (vec3(0.62) + col);
  col = pow(max(col, vec3(0.0)), vec3(0.62));

  float alpha = halo * 0.62 + body * 0.78 + core * 0.9 + rim * 0.5;
  alpha *= smoothstep(3.15, 0.08, r);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`;
