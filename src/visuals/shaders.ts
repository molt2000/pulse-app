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
    col += uDepth  * softCircle(p, vec2( 0.28,  0.22), 0.72, 2.0) * 0.16;
    col *= mix(0.18, 0.85, vignette);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Gravity field – clean spacetime grid ─────────────────────────────────────
export const GRAVITY_FIELD_SHADER = `
  precision mediump float;

  // ── easy tuning ──────────────────────────────────────────────────────────────
  const float GRID_SCALE   = 16.0;   // denser grid — more lines
  const float LINE_W       = 0.022;  // line half-width
  const float LINE_GLOW    = 0.08;   // soft glow halo
  const float LINE_BRIGHT  = 0.55;   // solid line alpha
  const float HALO_BRIGHT  = 0.16;   // glow halo alpha
  const float USER_STR     = 0.10;   // YOU orb warp — very subtle
  const float FRIEND_STR   = 0.52;   // friend orb warp strength
  const float REACH_MULT   = 3.8;    // warp reach in orb-radii
  const float DRIFT_SPD    = 0.030;
  const float DRIFT_AMP    = 0.005;
  const int   MAX_ORBS     = 11;
  // ─────────────────────────────────────────────────────────────────────────────

  uniform float uTime;
  uniform vec2  uRes;
  uniform int   uOrbCount;
  uniform vec2  uOrbCenters[MAX_ORBS];
  uniform float uOrbRadii[MAX_ORBS];
  uniform float uOrbStrengths[MAX_ORBS]; // 1.0=user, 0..0.8=friends

  varying vec2 vUV;

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }

  vec2 warp(vec2 p) {
    for (int i = 0; i < MAX_ORBS; i++) {
      if (i >= uOrbCount) break;
      vec2  d     = uOrbCenters[i] - p;
      float dist  = length(d);
      float r     = uOrbRadii[i];
      float reach = r * REACH_MULT;
      if (dist < 0.001 || dist > reach) continue;

      float t    = 1.0 - dist / reach;
      float pull = t * t * (3.0 - 2.0 * t);

      // User orb (strength==1.0) gets very low warp; friends get full
      float str  = mix(FRIEND_STR, USER_STR, step(0.99, uOrbStrengths[i]));
      str       *= uOrbStrengths[i];

      p += normalize(d) * pull * r * str;
    }
    return p;
  }

  float gridBrightness(vec2 p) {
    vec2  cell = fract(p * GRID_SCALE);
    vec2  edge = min(cell, 1.0 - cell);
    float d    = min(edge.x, edge.y);
    float solid = 1.0 - smoothstep(LINE_W - 0.003, LINE_W + 0.003, d);
    float glow  = (1.0 - smoothstep(LINE_W, LINE_W + LINE_GLOW, d)) * (1.0 - solid);
    return solid * LINE_BRIGHT + glow * HALO_BRIGHT;
  }

  void main() {
    float asp = uRes.x / uRes.y;
    vec2  p   = vUV - 0.5;
    p.x      *= asp;

    // slow drift
    float t  = uTime * DRIFT_SPD;
    float dx = (vnoise(p * 2.0 + vec2(t,  t * 0.7)) - 0.5) * DRIFT_AMP;
    float dy = (vnoise(p * 2.0 + vec2(-t * 0.8, t)) - 0.5) * DRIFT_AMP;
    p       += vec2(dx, dy);

    vec2  pw = warp(p);
    float g  = gridBrightness(pw);

    // screen-edge fade
    float vig = smoothstep(0.64, 0.22, length(p));

    // Always red — no colour transition
    vec3 col    = vec3(0.85, 0.08, 0.12);   // solid red everywhere

    float alpha  = g * vig;
    gl_FragColor = vec4(col, alpha);
  }
`;

export const MERGED_ORBS_SHADER = `
  precision mediump float;
  const float EPS = 0.0012;
  const int ITR = 28;
  const int MAX_MERGED_FRIENDS = 10;

  uniform float uTime;
  uniform float uSmoothness;
  uniform int   uFriendCount;
  uniform vec2  uUserCenter;
  uniform vec2  uFriendCenters[MAX_MERGED_FRIENDS];
  uniform vec2  uRes;
  uniform float uUserRadius;
  uniform float uUserDensity;
  uniform float uUserSeed;
  uniform float uFriendRadii[MAX_MERGED_FRIENDS];
  uniform float uFriendMerges[MAX_MERGED_FRIENDS];
  uniform float uFriendDensities[MAX_MERGED_FRIENDS];
  uniform float uFriendSeeds[MAX_MERGED_FRIENDS];
  uniform vec3  uUserCore;
  uniform vec3  uUserGlow;
  uniform vec3  uUserRim;
  uniform vec3  uFriendCores[MAX_MERGED_FRIENDS];
  uniform vec3  uFriendGlows[MAX_MERGED_FRIENDS];
  uniform vec3  uFriendRims[MAX_MERGED_FRIENDS];

  varying vec2 vUV;

  float sdSphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

  float smoothMin(float d1, float d2, float k) {
    float h = exp(-k * d1) + exp(-k * d2);
    return -log(h) / k;
  }

  float rnd3D(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    float a000 = rnd3D(i);
    float a100 = rnd3D(i + vec3(1,0,0));
    float a010 = rnd3D(i + vec3(0,1,0));
    float a110 = rnd3D(i + vec3(1,1,0));
    float a001 = rnd3D(i + vec3(0,0,1));
    float a101 = rnd3D(i + vec3(1,0,1));
    float a011 = rnd3D(i + vec3(0,1,1));
    float a111 = rnd3D(i + vec3(1,1,1));
    vec3 u = f * f * (3.0 - 2.0 * f);
    float k0 = a000;
    float k1 = a100 - a000;
    float k2 = a010 - a000;
    float k3 = a001 - a000;
    float k4 = a000 - a100 - a010 + a110;
    float k5 = a000 - a010 - a001 + a011;
    float k6 = a000 - a100 - a001 + a101;
    float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;
    return k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z;
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
      float fd = sdSphere(p, vec3(uFriendCenters[i], 0.0), uFriendRadii[i]);
      if (uFriendMerges[i] <= 0.001) { d = min(d, fd); }
      else                           { d = smoothMin(d, fd, uSmoothness); }
    }
    return d;
  }

  vec3 generateNormal(vec3 p) {
    return normalize(vec3(
      mapMerged(p + vec3(EPS,0,0)) - mapMerged(p + vec3(-EPS,0,0)),
      mapMerged(p + vec3(0,EPS,0)) - mapMerged(p + vec3(0,-EPS,0)),
      mapMerged(p + vec3(0,0,EPS)) - mapMerged(p + vec3(0,0,-EPS))
    ));
  }

  float nearestWeight(vec3 p, vec2 center, float radius) {
    return exp(-length(p.xy - center) / max(radius, 0.001) * 2.2);
  }

  void blendedTone(vec3 p, out vec3 core, out vec3 glow, out vec3 rim) {
    float total = nearestWeight(p, uUserCenter, uUserRadius);
    core = uUserCore * total; glow = uUserGlow * total; rim = uUserRim * total;
    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;
      float w = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]) * mix(0.45, 1.0, uFriendMerges[i]);
      total += w;
      core += uFriendCores[i] * w;
      glow += uFriendGlows[i] * w;
      rim  += uFriendRims[i]  * w;
    }
    core /= total; glow /= total; rim /= total;
  }

  float blendedDensity(vec3 p) {
    float total = nearestWeight(p, uUserCenter, uUserRadius);
    float density = uUserDensity * total;
    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;
      float w = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]);
      total += w; density += uFriendDensities[i] * w;
    }
    return clamp(density / total, 0.0, 1.0);
  }

  float blendedSeed(vec3 p) {
    float w = nearestWeight(p, uUserCenter, uUserRadius);
    float seed = uUserSeed * w; float total = w;
    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;
      float wi = nearestWeight(p, uFriendCenters[i], uFriendRadii[i]);
      seed += uFriendSeeds[i] * wi; total += wi;
    }
    return seed / total;
  }

  vec3 dropletColor(vec3 p, vec3 normal, vec3 rayDir) {
    vec3 core, glow, rim;
    blendedTone(p, core, glow, rim);
    float seed = blendedSeed(p);
    vec3 reflectDir = reflect(rayDir, normal);
    float np = noise3D(reflectDir * 2.0 + vec3(uTime * 0.18 + seed));
    float nn = noise3D(reflectDir * 2.0 - vec3(uTime * 0.15 - seed));
    vec3 color = (mix(glow, core, 0.32) * np + mix(rim, vec3(1.0), 0.36) * nn * 0.48) * 1.78;
    return pow(max(color, vec3(0.0)), vec3(5.8));
  }

  void main() {
    vec2 p = toWorld(vUV);
    float bound = length(p - uUserCenter) / uUserRadius;
    for (int i = 0; i < MAX_MERGED_FRIENDS; i++) {
      if (i >= uFriendCount) break;
      bound = min(bound, length(p - uFriendCenters[i]) / uFriendRadii[i]);
    }
    if (bound > 2.4) { gl_FragColor = vec4(0.0); return; }

    vec3 origin = vec3(p, 0.42);
    vec3 ray    = origin;
    vec3 rayDir = vec3(0.0, 0.0, -1.0);
    float marchDist = 0.0;
    float hit = 0.0;
    for (int i = 0; i < ITR; i++) {
      marchDist = mapMerged(ray);
      ray      += rayDir * marchDist;
      if (marchDist < EPS) { hit = 1.0; break; }
      if (ray.z < -0.42)   { break; }
    }

    vec3 core, glow, rim;
    blendedTone(vec3(p, 0.0), core, glow, rim);
    float density = blendedDensity(vec3(p, 0.0));
    float aura    = exp(-bound * mix(1.95, 2.5, density)) * (0.04 + density * 0.08);
    vec3  color   = glow * aura;
    float alpha   = aura * 0.72;

    if (hit > 0.5) {
      vec3  normal  = generateNormal(ray);
      vec3  light   = normalize(vec3(-0.52, 0.62, 0.72));
      vec3  halfVec = normalize(light + vec3(0,0,1));
      float spec    = pow(max(dot(normal, halfVec), 0.0), 82.0) * (0.35 + density * 0.55);
      float fresnel = pow(1.0 - max(dot(normal, vec3(0,0,1)), 0.0), 2.1);
      color += dropletColor(ray, normal, rayDir);
      color += rim * fresnel * 0.34;
      color += vec3(1.0, 0.96, 0.86) * spec;
      alpha  = mix(0.56, 0.82, density) + fresnel * 0.12;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
  }
`;
