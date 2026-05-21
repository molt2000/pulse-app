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

export const MERGED_ORBS_SHADER = `
  precision mediump float;

  const float EPS = 0.0012;
  const int ITR = 28;
  const int MAX_MERGED_FRIENDS = 10;

  uniform float uTime;
  uniform float uSmoothness;
  uniform int uFriendCount;
  uniform vec2 uUserCenter;
  uniform vec2 uFriendCenters[MAX_MERGED_FRIENDS];
  uniform vec2 uRes;
  uniform float uUserRadius;
  uniform float uUserDensity;
  uniform float uUserSeed;
  uniform float uFriendRadii[MAX_MERGED_FRIENDS];
  uniform float uFriendMerges[MAX_MERGED_FRIENDS];
  uniform float uFriendDensities[MAX_MERGED_FRIENDS];
  uniform float uFriendSeeds[MAX_MERGED_FRIENDS];
  uniform vec3 uUserCore;
  uniform vec3 uUserGlow;
  uniform vec3 uUserRim;
  uniform vec3 uFriendCores[MAX_MERGED_FRIENDS];
  uniform vec3 uFriendGlows[MAX_MERGED_FRIENDS];
  uniform vec3 uFriendRims[MAX_MERGED_FRIENDS];

  varying vec2 vUV;

  float sdSphere(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
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

  vec2 toWorld(vec2 uv) {
    float asp = uRes.x / uRes.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    return p;
  }

  float mapMerged(vec3 p) {
    float d = sdSphere(p, vec3(uUserCenter, 0.0), uUserRadius);

    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;

      float friendDistance = sdSphere(p, vec3(uFriendCenters[i], 0.0), uFriendRadii[i]);
      if (uFriendMerges[i] <= 0.001) {
        d = min(d, friendDistance);
      } else {
        d = smoothMin(d, friendDistance, uSmoothness);
      }
    }

    return d;
  }

  vec3 generateNormal(vec3 p) {
    return normalize(vec3(
      mapMerged(p + vec3(EPS, 0.0, 0.0)) - mapMerged(p + vec3(-EPS, 0.0, 0.0)),
      mapMerged(p + vec3(0.0, EPS, 0.0)) - mapMerged(p + vec3(0.0, -EPS, 0.0)),
      mapMerged(p + vec3(0.0, 0.0, EPS)) - mapMerged(p + vec3(0.0, 0.0, -EPS))
    ));
  }

  float nearestWeight(vec3 p, vec2 center, float radius) {
    return exp(-length(p.xy - center) / max(radius, 0.001) * 2.2);
  }

  void blendedTone(vec3 p, out vec3 core, out vec3 glow, out vec3 rim) {
    float total = nearestWeight(p, uUserCenter, uUserRadius);
    core = uUserCore * total;
    glow = uUserGlow * total;
    rim = uUserRim * total;

    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;

      float weight = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]) * mix(0.45, 1.0, uFriendMerges[i]);
      total += weight;
      core += uFriendCores[i] * weight;
      glow += uFriendGlows[i] * weight;
      rim += uFriendRims[i] * weight;
    }

    core /= total;
    glow /= total;
    rim /= total;
  }

  float blendedDensity(vec3 p) {
    float total = nearestWeight(p, uUserCenter, uUserRadius);
    float density = uUserDensity * total;

    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;

      float weight = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]);
      total += weight;
      density += uFriendDensities[i] * weight;
    }

    return clamp(density / total, 0.0, 1.0);
  }

  float blendedSeed(vec3 p) {
    float weight = nearestWeight(p, uUserCenter, uUserRadius);
    float seed = uUserSeed * weight;
    float total = weight;

    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;

      float w = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]);
      seed += uFriendSeeds[i] * w;
      total += w;
    }

    return seed / total;
  }

  vec3 dropletColor(vec3 p, vec3 normal, vec3 rayDir) {
    vec3 core;
    vec3 glow;
    vec3 rim;
    blendedTone(p, core, glow, rim);
    float seed = blendedSeed(p);

    vec3 reflectDir = reflect(rayDir, normal);
    float noisePosTime = noise3D(reflectDir * 2.0 + vec3(uTime * 0.18 + seed));
    float noiseNegTime = noise3D(reflectDir * 2.0 - vec3(uTime * 0.15 - seed));
    vec3 color = (mix(glow, core, 0.32) * noisePosTime + mix(rim, vec3(1.0), 0.36) * noiseNegTime * 0.48) * 1.78;
    return pow(max(color, vec3(0.0)), vec3(5.8));
  }

  void main() {
    vec2 p = toWorld(vUV);
    float bound = length(p - uUserCenter) / uUserRadius;

    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;
      bound = min(bound, length(p - uFriendCenters[i]) / uFriendRadii[i]);
    }

    if (bound > 2.4) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec3 origin = vec3(p, 0.42);
    vec3 ray = origin;
    vec3 rayDirection = vec3(0.0, 0.0, -1.0);

    float marchDist = 0.0;
    float hit = 0.0;
    for (int i = 0; i < ITR; i++) {
      marchDist = mapMerged(ray);
      ray += rayDirection * marchDist;
      if (marchDist < EPS) {
        hit = 1.0;
        break;
      }
      if (ray.z < -0.42) {
        break;
      }
    }

    vec3 core;
    vec3 glow;
    vec3 rim;
    blendedTone(vec3(p, 0.0), core, glow, rim);
    float density = blendedDensity(vec3(p, 0.0));

    float aura = exp(-bound * mix(1.95, 2.5, density)) * (0.04 + density * 0.08);
    vec3 color = glow * aura;
    float alpha = aura * 0.72;

    if (hit > 0.5) {
      vec3 normal = generateNormal(ray);
      vec3 light = normalize(vec3(-0.52, 0.62, 0.72));
      vec3 halfVec = normalize(light + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(normal, halfVec), 0.0), 82.0) * (0.35 + density * 0.55);
      float fresnel = pow(1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 2.1);
      color += dropletColor(ray, normal, rayDirection);
      color += rim * fresnel * 0.34;
      color += vec3(1.0, 0.96, 0.86) * spec;
      alpha = mix(0.56, 0.82, density) + fresnel * 0.12;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
  }
`;
