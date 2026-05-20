export const VERTEX_SHADER = `
  attribute vec2 aPos;

  varying vec2 vUV;

  void main() {
    vUV = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

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

    vec3 col = mix(uBase, uUpper, vertical * 0.35);
    col += uWarmth * softCircle(p, vec2(-0.32, -0.18), 0.88 + breath * 0.04, 2.2) * 0.08;
    col += uDepth * softCircle(p, vec2(0.28, 0.22), 0.72, 2.0) * 0.16;

    col *= mix(0.18, 0.85, vignette);

    gl_FragColor = vec4(col, 1.0);
  }
`;

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

  const float EPS = 0.0012;
  const int ITR = 22;
  const int TRAIL_LENGTH = 10;

  vec3 translate(vec3 p, vec3 t) {
    return p - t;
  }

  float sdSphere(vec3 p, float s) {
    return length(p) - s;
  }

  float smoothMin(float d1, float d2, float k) {
    float h = exp(-k * d1) + exp(-k * d2);
    return -log(h) / k;
  }

  float rnd3D(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float a000 = rnd3D(i);
    float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));
    float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));
    float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));
    float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));
    float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));
    float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));
    float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));
    vec3 u = f * f * (3.0 - 2.0 * f);

    float k0 = a000;
    float k1 = a100 - a000;
    float k2 = a010 - a000;
    float k3 = a001 - a000;
    float k4 = a000 - a100 - a010 + a110;
    float k5 = a000 - a010 - a001 + a011;
    float k6 = a000 - a100 - a001 + a101;
    float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;
    return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  }

  float mapDroplet(vec3 p) {
    float density = clamp(uDensity, 0.0, 1.0);
    float k = 7.0;
    float d = 1e5;
    float phase = uTime * 0.18 + uSeed;
    vec2 axis = normalize(vec2(cos(uSeed * 1.91 + uTime * 0.08), sin(uSeed * 1.37 + uTime * 0.07)));
    vec2 side = vec2(-axis.y, axis.x);
    float stretch = 0.12 + density * 0.24;
    float baseRadius = 0.065 + density * 0.006;

    for (int i = 0; i < TRAIL_LENGTH; i++) {
      float fi = float(i);
      float t = fi / float(TRAIL_LENGTH - 1);
      vec2 trail = -axis * t * stretch;
      trail += side * sin(phase + fi * 0.75) * 0.025 * (1.0 - t);
      trail += axis * sin(phase * 0.8 + fi * 0.43) * 0.012;
      float radius = baseRadius * float(TRAIL_LENGTH) * (1.0 - t * 0.72);
      float sphere = sdSphere(translate(p, vec3(trail, 0.0)), radius);
      d = smoothMin(d, sphere, k);
    }

    float satellite = sdSphere(
      translate(p, vec3(axis * (0.26 + density * 0.05) + side * 0.04, 0.02)),
      0.22 + density * 0.04
    );
    d = smoothMin(d, satellite, k);

    return d;
  }

  vec3 generateNormal(vec3 p) {
    return normalize(vec3(
      mapDroplet(p + vec3(EPS, 0.0, 0.0)) - mapDroplet(p + vec3(-EPS, 0.0, 0.0)),
      mapDroplet(p + vec3(0.0, EPS, 0.0)) - mapDroplet(p + vec3(0.0, -EPS, 0.0)),
      mapDroplet(p + vec3(0.0, 0.0, EPS)) - mapDroplet(p + vec3(0.0, 0.0, -EPS))
    ));
  }

  vec3 dropletColor(vec3 normal, vec3 rayDir) {
    vec3 reflectDir = reflect(rayDir, normal);

    float noisePosTime = noise3D(reflectDir * 2.0 + vec3(uTime * 0.18 + uSeed));
    float noiseNegTime = noise3D(reflectDir * 2.0 - vec3(uTime * 0.15 - uSeed));

    vec3 _color0 = mix(uGlow, uCore, 0.32) * noisePosTime;
    vec3 _color1 = mix(uRim, vec3(1.0), 0.36) * noiseNegTime;
    vec3 color = (_color0 + _color1 * 0.48) * 1.78;
    return pow(max(color, vec3(0.0)), vec3(5.8));
  }

  void main() {
    float asp = uRes.x / uRes.y;
    vec2 uv = vUV - uCenter;
    uv.x *= asp;

    float dist = length(uv) / uRadius;

    if (dist > 2.35) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float density = clamp(uDensity, 0.0, 1.0);
    float breath = sin(uTime * mix(0.22, 0.36, density) + uSeed) * 0.025;

    vec2 p = uv / (uRadius * (1.0 + breath));

    vec3 origin = vec3(0.0, 0.0, 1.75);
    vec3 lookAt = vec3(0.0, 0.0, 0.0);
    vec3 cDir = normalize(lookAt - origin);
    vec3 cUp = vec3(0.0, 1.0, 0.0);
    vec3 cSide = cross(cDir, cUp);
    vec3 ray = origin + cSide * p.x + cUp * p.y;
    vec3 rayDirection = cDir;

    float marchDist = 0.0;
    float hit = 0.0;
    for (int i = 0; i < ITR; i++) {
      marchDist = mapDroplet(ray);
      ray += rayDirection * marchDist;
      if (marchDist < EPS) {
        hit = 1.0;
        break;
      }
      if (ray.z < -1.2) {
        break;
      }
    }

    float aura = exp(-dist * mix(1.95, 2.5, density)) * (0.04 + density * 0.08);
    vec3 color = uGlow * aura;
    float alpha = aura * 0.7;

    if (hit > 0.5) {
      vec3 normal = generateNormal(ray);
      vec3 light = normalize(vec3(-0.52, 0.62, 0.72));
      vec3 halfVec = normalize(light + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(normal, halfVec), 0.0), 82.0) * (0.35 + density * 0.55);
      float fresnel = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 2.1);
      vec3 droplet = dropletColor(normal, rayDirection);
      droplet += uRim * fresnel * 0.34;
      droplet += vec3(1.0, 0.96, 0.86) * spec;
      color += droplet;
      alpha = mix(0.56, 0.82, density) + fresnel * 0.12;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
  }
`;
