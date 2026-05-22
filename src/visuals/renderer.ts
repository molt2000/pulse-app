import { Friend, ViewportSize, friendDistanceLabel, friendScreenPosition, initialsFor } from '../state';
import { BACKGROUND_SHADER, GRAVITY_FIELD_SHADER, MERGED_ORBS_SHADER, VERTEX_SHADER } from './shaders';
import { rgbCss, theme, toneFor } from './theme';
// Note: gravityField.ts is NOT needed – gravity field logic is fully inlined below

interface RenderPoint { x: number; y: number; }
interface LabelParts {
  root: HTMLDivElement;
  initials: HTMLDivElement;
  name: HTMLDivElement;
  meta: HTMLDivElement;
}

// ── orb sizing ──────────────────────────────────────────────────────────────
const USER_RADIUS = { mobile: 0.062, desktop: 0.09 };
const FRIEND_RADIUS = {
  mobileBase: 0.018,  mobileDensity: 0.052,
  desktopBase: 0.026, desktopDensity: 0.076,
};

// ── merge config ─────────────────────────────────────────────────────────────
const MERGE_DISTANCE_METERS = 100;
const MERGE_STRENGTH        = 0.95;
const MERGE_SMOOTHNESS      = 28;
const MERGE_ANIMATION_EASE  = 0.025;
const MIN_MERGE_SEPARATION  = { mobile: 14, desktop: 18 };
const MAX_MERGED_FRIENDS    = 10;

// ── gravity field config ─────────────────────────────────────────────────────
const GRAVITY_MAX_ORBS = 11; // 1 user + 10 friends

interface ActiveFriendRender {
  friend: Friend;
  point: RenderPoint;
  mergeLevel: number;
}

export class PulseRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLDivElement;
  private readonly gl: WebGLRenderingContext;
  private readonly backgroundProgram: WebGLProgram;
  private readonly gravityFieldProgram: WebGLProgram;
  private readonly mergedOrbsProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly labels          = new Map<number, LabelParts>();
  private readonly positions       = new Map<number, RenderPoint>();
  private readonly visualPositions = new Map<number, RenderPoint>();
  private readonly mergeLevels     = new Map<number, number>();
  private readonly isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  private readonly dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1 : 1.5);
  private readonly uniformCache      = new Map<string, WebGLUniformLocation | null>();
  private readonly uniformProgramIds = new WeakMap<WebGLProgram, number>();
  private nextUniformProgramId = 0;
  private width  = 1;
  private height = 1;
  private start  = 0;
  private raf    = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly friends: Friend[],
  ) {
    injectRendererStyles();

    this.canvas  = document.createElement('canvas');
    this.canvas.className = 'pulse-canvas';
    this.overlay = document.createElement('div');
    this.overlay.className = 'pulse-overlay';
    this.root.append(this.canvas, this.overlay);

    const gl = this.canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    this.backgroundProgram   = this.createProgram(BACKGROUND_SHADER);
    this.gravityFieldProgram = this.createProgram(GRAVITY_FIELD_SHADER);
    this.mergedOrbsProgram   = this.createProgram(MERGED_ORBS_SHADER);
    this.quadBuffer          = this.createQuad();

    this.createStaticUi();
    this.refreshFriendUi();
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  startRendering(): void { this.raf = requestAnimationFrame(this.frame); }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.overlay.remove();
  }

  refreshFriendUi(): void {
    const existingIds = new Set(this.labels.keys());
    const newIds = new Set(this.friends.map((friend) => friend.id));

    for (const id of existingIds) {
      if (!newIds.has(id)) {
        this.labels.get(id)?.root.remove();
        this.labels.delete(id);
        this.positions.delete(id);
        this.mergeLevels.delete(id);
        this.visualPositions.delete(id);
      }
    }

    for (const friend of this.friends) {
      if (!this.labels.has(friend.id)) {
        this.buildLabel(friend);
      } else {
        this.patchLabel(friend);
      }
    }
  }

  getViewport(): ViewportSize { return { width: this.width, height: this.height }; }

  private ul(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let programId = this.uniformProgramIds.get(program);
    if (programId === undefined) {
      programId = ++this.nextUniformProgramId;
      this.uniformProgramIds.set(program, programId);
    }
    const key = `${programId}___${name}`;
    if (!this.uniformCache.has(key)) {
      this.uniformCache.set(key, this.gl.getUniformLocation(program, name));
    }
    return this.uniformCache.get(key) ?? null;
  }

  private readonly resize = (): void => {
    this.width  = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width  = Math.round(this.width  * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  };

  private readonly frame = (timestamp: number): void => {
    if (!this.start) this.start = timestamp;
    const time = (timestamp - this.start) * 0.001;
    this.draw(time);
    this.updateLabels(time);
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(time: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // ── 1. Opaque background ────────────────────────────────────────────────
    gl.disable(gl.BLEND);
    gl.useProgram(this.backgroundProgram);
    this.bindQuad(this.backgroundProgram);
    this.setBackgroundUniforms(time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Resolve active friends & visual positions (needed by both field + orbs)
    const activeFriends: ActiveFriendRender[] = this.friends
      .filter((f) => f.active)
      .map((friend) => ({
        friend,
        point:      this.visualFriendPoint(friend, time),
        mergeLevel: this.mergeLevels.get(friend.id) ?? 0,
      }));

    // ── 2. Gravity field – blended layer behind orbs ────────────────────────
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.drawGravityField(time, activeFriends);

    // ── 3. Orbs ─────────────────────────────────────────────────────────────
    gl.useProgram(this.mergedOrbsProgram);
    this.bindQuad(this.mergedOrbsProgram);
    this.drawMergedOrbs(time, activeFriends);
  }

  // ── gravity field pass ───────────────────────────────────────────────────────
  private drawGravityField(time: number, activeFriends: ActiveFriendRender[]): void {
    const gl  = this.gl;
    const MAX = GRAVITY_MAX_ORBS;

    const centers   = new Float32Array(MAX * 2);
    const radii     = new Float32Array(MAX);
    const strengths = new Float32Array(MAX);

    // Orb 0 = YOU (strongest)
    const uc = this.toWorld(this.userPoint());
    centers[0]   = uc[0];
    centers[1]   = uc[1];
    radii[0]     = this.userRadius();
    strengths[0] = 1.0;

    // Orbs 1..N = friends
    const friends = activeFriends.slice(0, MAX - 1);
    for (let i = 0; i < friends.length; i++) {
      const { friend, point } = friends[i];
      const fc = this.toWorld(point);
      centers[(i + 1) * 2]     = fc[0];
      centers[(i + 1) * 2 + 1] = fc[1];
      radii[i + 1]              = this.friendRadius(friend.density);
      strengths[i + 1]          = 0.36 + friend.density * 0.44; // 0.36–0.80
    }
    const count = 1 + friends.length;

    gl.useProgram(this.gravityFieldProgram);
    this.bindQuad(this.gravityFieldProgram);

    const loc = (n: string) => this.ul(this.gravityFieldProgram, n);
    gl.uniform1f(loc('uTime'),              time);
    gl.uniform2f(loc('uRes'),               this.canvas.width, this.canvas.height);
    gl.uniform1i(loc('uOrbCount'),          count);
    gl.uniform2fv(loc('uOrbCenters[0]'),   centers);
    gl.uniform1fv(loc('uOrbRadii[0]'),     radii);
    gl.uniform1fv(loc('uOrbStrengths[0]'), strengths);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private userRadius(): number {
    return this.isMobile ? USER_RADIUS.mobile : USER_RADIUS.desktop;
  }

  private friendRadius(density: number): number {
    const shaped = density * density;
    return this.isMobile
      ? FRIEND_RADIUS.mobileBase  + shaped * FRIEND_RADIUS.mobileDensity
      : FRIEND_RADIUS.desktopBase + shaped * FRIEND_RADIUS.desktopDensity;
  }

  private visualFriendPoint(friend: Friend, time: number): RenderPoint {
    const target  = friendScreenPosition(friend.bearing, this.getViewport());
    const current = this.smoothPosition(friend.id, target);
    const float_  = this.friendFloat(friend.id, time, friend.density);
    const meters  = proximityMeters(friend.density);
    const pull    = softGravityPull(meters);
    const user    = this.userPoint();
    const floated = {
      x: current.x + float_.x,
      y: current.y + float_.y,
    };
    const softPulled = {
      x: floated.x + (user.x - floated.x) * pull,
      y: floated.y + (user.y - floated.y) * pull,
    };
    const merged = this.applyUserMerge(friend, softPulled);
    this.visualPositions.set(friend.id, merged);
    return merged;
  }

  private applyUserMerge(friend: Friend, point: RenderPoint): RenderPoint {
    const user        = this.userPoint();
    const meters      = proximityMeters(friend.density);
    const targetLevel = this.targetMergeLevel(meters);
    const previous    = this.mergeLevels.get(friend.id) ?? 0;
    const ease        = MERGE_ANIMATION_EASE + targetLevel * 0.04;
    const level       = previous + (targetLevel - previous) * ease;
    this.mergeLevels.set(friend.id, level);
    if (level <= 0.001) return point;
    const dx       = user.x - point.x;
    const dy       = user.y - point.y;
    const distance = Math.hypot(dx, dy);
    const minSep   = this.isMobile ? MIN_MERGE_SEPARATION.mobile : MIN_MERGE_SEPARATION.desktop;
    const distCappedLevel = Math.max(0, 1 - minSep / Math.max(distance, minSep));
    const pull = Math.min(level, distCappedLevel);
    return { x: point.x + dx * pull, y: point.y + dy * pull };
  }

  private targetMergeLevel(meters: number): number {
    if (meters >= MERGE_DISTANCE_METERS) return 0;
    const closeness = 1 - meters / MERGE_DISTANCE_METERS;
    return smoothstep(closeness) * MERGE_STRENGTH;
  }

  private userPoint(): RenderPoint {
    return { x: this.width / 2, y: this.height / 2 };
  }

  private drawMergedOrbs(time: number, activeFriends: ActiveFriendRender[]): void {
    const gl = this.gl;
    const userCenter      = this.toWorld(this.userPoint());
    const friendCenters   = new Float32Array(MAX_MERGED_FRIENDS * 2);
    const friendRadii     = new Float32Array(MAX_MERGED_FRIENDS);
    const friendMerges    = new Float32Array(MAX_MERGED_FRIENDS);
    const friendDensities = new Float32Array(MAX_MERGED_FRIENDS);
    const friendSeeds     = new Float32Array(MAX_MERGED_FRIENDS);
    const friendCores     = new Float32Array(MAX_MERGED_FRIENDS * 3);
    const friendGlows     = new Float32Array(MAX_MERGED_FRIENDS * 3);
    const friendRims      = new Float32Array(MAX_MERGED_FRIENDS * 3);

    const friendsToDraw = activeFriends.slice(0, MAX_MERGED_FRIENDS);
    for (let i = 0; i < friendsToDraw.length; i++) {
      const { friend, point, mergeLevel } = friendsToDraw[i];
      const center = this.toWorld(point);
      const radius = this.friendRadius(friend.density);
      const tone   = toneFor(friend.colorIdx);
      friendCenters[i * 2]     = center[0];
      friendCenters[i * 2 + 1] = center[1];
      friendRadii[i]      = radius;
      friendMerges[i]     = mergeLevel / MERGE_STRENGTH;
      friendDensities[i]  = friend.density;
      friendSeeds[i]      = friend.id * 4.93 + 1.7;
      friendCores.set(tone.core, i * 3);
      friendGlows.set(tone.glow, i * 3);
      friendRims.set(tone.rim,   i * 3);
    }

    const p  = this.mergedOrbsProgram;
    const ul = (n: string) => this.ul(p, n);
    gl.uniform1f(ul('uTime'),              time);
    gl.uniform1f(ul('uSmoothness'),        MERGE_SMOOTHNESS);
    gl.uniform1i(ul('uFriendCount'),       friendsToDraw.length);
    gl.uniform2f(ul('uUserCenter'),        userCenter[0], userCenter[1]);
    gl.uniform2fv(ul('uFriendCenters[0]'), friendCenters);
    gl.uniform2f(ul('uRes'),               this.canvas.width, this.canvas.height);
    gl.uniform1f(ul('uUserRadius'),        this.userRadius());
    gl.uniform1f(ul('uUserDensity'),       0.2);
    gl.uniform1f(ul('uUserSeed'),          0.3);
    gl.uniform1fv(ul('uFriendRadii[0]'),     friendRadii);
    gl.uniform1fv(ul('uFriendMerges[0]'),    friendMerges);
    gl.uniform1fv(ul('uFriendDensities[0]'), friendDensities);
    gl.uniform1fv(ul('uFriendSeeds[0]'),     friendSeeds);
    gl.uniform3fv(ul('uUserCore'),  theme.youTone.core);
    gl.uniform3fv(ul('uUserGlow'),  theme.youTone.glow);
    gl.uniform3fv(ul('uUserRim'),   theme.youTone.rim);
    gl.uniform3fv(ul('uFriendCores[0]'), friendCores);
    gl.uniform3fv(ul('uFriendGlows[0]'), friendGlows);
    gl.uniform3fv(ul('uFriendRims[0]'),  friendRims);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private setBackgroundUniforms(time: number): void {
    const gl = this.gl;
    const ul = (n: string) => this.ul(this.backgroundProgram, n);
    gl.uniform1f(ul('uTime'), time);
    gl.uniform2f(ul('uRes'),  this.canvas.width, this.canvas.height);
    gl.uniform3fv(ul('uBase'),   theme.background.base);
    gl.uniform3fv(ul('uUpper'),  theme.background.upper);
    gl.uniform3fv(ul('uWarmth'), theme.background.warmth);
    gl.uniform3fv(ul('uDepth'),  theme.background.depth);
  }

  private updateLabels(time: number): void {
    for (const friend of this.friends) {
      const parts    = this.labels.get(friend.id);
      if (!parts)    continue;
      const position = this.visualPositions.get(friend.id)
                    ?? this.visualFriendPoint(friend, time);
      const scale    = 0.96 + friend.density * 0.08 + Math.sin(time * 0.55 + friend.id) * 0.018;
      // translate3d bringt den Ursprung exakt auf den Orb-Mittelpunkt.
      // Da der Container width:0/height:0 hat, brauchen wir kein translate(-50%,-50%) mehr.
      parts.root.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`;
      parts.root.style.opacity   = String(0.55 + friend.density * 0.45);
      parts.root.style.zIndex    = String(Math.round(friend.density * 10));
      parts.meta.textContent     = friendDistanceLabel(friend);
    }
  }

  private buildLabel(friend: Friend): void {
    const tone = toneFor(friend.colorIdx);
    const root = document.createElement('div');
    root.className = 'pulse-friend-label';

    const initials = document.createElement('div');
    initials.className = 'pulse-friend-initials';
    initials.style.borderColor = rgbCss(tone.rim, 0.5);
    initials.style.boxShadow = `0 0 24px ${rgbCss(tone.glow, 0.35)}`;

    this.applyAvatarOrInitials(initials, friend);

    const name = document.createElement('div');
    name.className = 'pulse-friend-name';
    name.textContent = friend.name;

    const meta = document.createElement('div');
    meta.className = 'pulse-friend-meta';
    meta.textContent = friendDistanceLabel(friend);

    root.append(initials, name, meta);
    this.overlay.appendChild(root);
    this.labels.set(friend.id, { root, initials, name, meta });
  }

  private patchLabel(friend: Friend): void {
    const parts = this.labels.get(friend.id);
    if (!parts) return;

    parts.name.textContent = friend.name;
    parts.meta.textContent = friendDistanceLabel(friend);

    const currentUrl = parts.initials.dataset.avatarUrl ?? '';
    const newUrl = friend.avatarUrl ?? '';
    if (currentUrl !== newUrl) {
      parts.initials.innerHTML = '';
      this.applyAvatarOrInitials(parts.initials, friend);
    } else if (!newUrl || parts.initials.dataset.avatarFailed === 'true') {
      parts.initials.textContent = initialsFor(friend.name);
    }
  }

  private applyAvatarOrInitials(container: HTMLDivElement, friend: Friend): void {
    container.dataset.avatarUrl = friend.avatarUrl ?? '';
    container.dataset.avatarFailed = '';

    if (friend.avatarUrl) {
      container.style.background = 'transparent';
      container.style.overflow = 'hidden';
      container.style.padding = '0';

      const img = document.createElement('img');
      img.src = friend.avatarUrl;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:999px;display:block;';
      img.onerror = () => {
        img.remove();
        container.dataset.avatarFailed = 'true';
        container.style.background = 'rgba(255,255,255,0.15)';
        container.textContent = initialsFor(friend.name);
      };
      container.appendChild(img);
    } else {
      container.style.background = 'rgba(255,255,255,0.15)';
      container.style.overflow = 'hidden';
      container.style.padding = '';
      container.textContent = initialsFor(friend.name);
    }
  }

  private createStaticUi(): void {
    const title = document.createElement('div');
    title.className   = 'pulse-title';
    title.textContent = 'PULSE';
    const you = document.createElement('div');
    you.className = 'pulse-you';
    you.innerHTML = `YOU`;
    this.overlay.append(title, you);
  }

  private smoothPosition(id: number, target: RenderPoint): RenderPoint {
    const previous = this.positions.get(id);
    if (!previous) { this.positions.set(id, target); return target; }
    const mergeLevel = this.mergeLevels.get(id) ?? 0;
    const posEase    = 0.055 + mergeLevel * 0.12;
    const next = {
      x: previous.x + (target.x - previous.x) * posEase,
      y: previous.y + (target.y - previous.y) * posEase,
    };
    this.positions.set(id, next);
    return next;
  }

  private friendFloat(id: number, time: number, density: number): RenderPoint {
    const amount = 4 + density * 7;
    return {
      x: Math.sin(time * 0.2  + id * 1.7)  * amount,
      y: Math.cos(time * 0.17 + id * 1.13) * amount * 0.72,
    };
  }

  private toWorld(point: RenderPoint): [number, number] {
    const aspect = this.canvas.width / this.canvas.height;
    return [
      (point.x / this.width  - 0.5) * aspect,
       0.5 - point.y / this.height,
    ];
  }

  private createProgram(fragmentShader: string): WebGLProgram {
    const gl      = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error('Program creation failed');
    gl.attachShader(program, this.createShader(gl.VERTEX_SHADER,   VERTEX_SHADER));
    gl.attachShader(program, this.createShader(gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(program);
    return program;
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl     = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader creation failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  private createQuad(): WebGLBuffer {
    const gl     = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Buffer creation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),
      gl.STATIC_DRAW);
    return buffer;
  }

  private bindQuad(program: WebGLProgram): void {
    const gl   = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const attr = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  }
}

/**
 * Returns a 0-1 pull factor that starts gently at 250 m and ramps up
 * more steeply below 100 m. The merge effect (< ~100 m) is handled
 * separately in applyUserMerge(), so we cap this pull to not interfere.
 */
function softGravityPull(meters: number): number {
  if (meters >= 250) return 0;
  if (meters <= 0)   return 0.28;
  if (meters > 100) {
    const t = 1 - (meters - 100) / 150;
    return smoothstep(t) * 0.08;
  }
  const t = 1 - meters / 100;
  return 0.08 + smoothstep(t) * 0.20;
}

function proximityMeters(density: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, density))) * 1000);
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function injectRendererStyles(): void {
  if (document.getElementById('pulse-renderer-styles')) return;
  const style = document.createElement('style');
  style.id = 'pulse-renderer-styles';
  style.textContent = `
    body {
      margin: 0;
      overflow: hidden;
      background: #020304;
      color: white;
      font-family: Inter, system-ui, sans-serif;
    }
    .pulse-canvas,
    .pulse-overlay {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .pulse-overlay {
      pointer-events: none;
      z-index: 2;
    }
    .pulse-title {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      letter-spacing: .4em;
      opacity: .4;
    }
    .pulse-you {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      display: grid;
      place-items: center;
      gap: 3px;
      text-align: center;
    }

    /* ── Friend labels ───────────────────────────────────────────────────── */
    /*
     * Der Container hat width:0 / height:0.
     * translate3d(x, y, 0) in updateLabels() setzt den Ursprung exakt
     * auf den Orb-Mittelpunkt. Alle Kinder positionieren sich relativ dazu.
     */
    .pulse-friend-label {
      position: fixed;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      text-align: center;
      will-change: transform, opacity;
    }

    /* Initialen-Kreis / Avatar – zentriert auf dem Orb-Mittelpunkt */
    .pulse-friend-initials {
      position: absolute;
      left: 0;
      top: 0;
      transform: translate(-50%, -50%);
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(7px);
      font-size: 13px;
      font-weight: 700;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    }

    /* Profilbild – füllt den Kreis komplett */
    .pulse-friend-initials img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* Name – direkt unter dem Orb (22px Radius + 6px Abstand) */
    .pulse-friend-name {
      position: absolute;
      left: 0;
      top: 28px;
      transform: translateX(-50%);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      opacity: 1;
      text-shadow:
        0 0 8px  rgba(0, 0, 0, 1),
        0 1px 3px rgba(0, 0, 0, 0.9),
        0 0 16px rgba(0, 0, 0, 0.7);
      letter-spacing: 0.02em;
    }

    /* Distanz – direkt unter dem Namen */
    .pulse-friend-meta {
      position: absolute;
      left: 0;
      top: 46px;
      transform: translateX(-50%);
      font-size: 11px;
      font-weight: 500;
      opacity: 1;
      white-space: nowrap;
      color: rgba(255, 255, 255, 0.85);
      text-shadow:
        0 0 6px  rgba(0, 0, 0, 1),
        0 1px 3px rgba(0, 0, 0, 0.9);
      letter-spacing: 0.01em;
    }
  `;
  document.head.appendChild(style);
}
