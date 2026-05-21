import { Friend, ViewportSize, friendDistanceLabel, friendScreenPosition, initialsFor } from '../state';
import { BACKGROUND_SHADER, MERGED_ORBS_SHADER, VERTEX_SHADER } from './shaders';
import { rgbCss, theme, toneFor } from './theme';

interface RenderPoint {
  x: number;
  y: number;
}

interface LabelParts {
  root: HTMLDivElement;
  initials: HTMLDivElement;
  name: HTMLDivElement;
  meta: HTMLDivElement;
}

const USER_RADIUS = {
  mobile: 0.085,
  desktop: 0.13,
};

const FRIEND_RADIUS = {
  mobileBase: 0.052,
  mobileDensity: 0.02,
  desktopBase: 0.078,
  desktopDensity: 0.032,
};

const MERGE_DISTANCE_METERS = 100;
const MERGE_STRENGTH = 0.95;
const MERGE_SMOOTHNESS = 28;
const MERGE_ANIMATION_EASE = 0.025;
const MIN_MERGE_SEPARATION = {
  mobile: 14,
  desktop: 18,
};
const MAX_MERGED_FRIENDS = 10;

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
  private readonly mergedOrbsProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly labels = new Map<number, LabelParts>();
  private readonly positions = new Map<number, RenderPoint>();
  private readonly visualPositions = new Map<number, RenderPoint>();
  private readonly mergeLevels = new Map<number, number>();
  private readonly isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
  private readonly dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1 : 1.5);

  private width = 1;
  private height = 1;
  private start = 0;
  private raf = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly friends: Friend[],
  ) {
    injectRendererStyles();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pulse-canvas';

    this.overlay = document.createElement('div');
    this.overlay.className = 'pulse-overlay';

    this.root.append(this.canvas, this.overlay);

    const gl = this.canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL unavailable');
    }

    this.gl = gl;

    this.backgroundProgram = this.createProgram(BACKGROUND_SHADER);
    this.mergedOrbsProgram = this.createProgram(MERGED_ORBS_SHADER);
    this.quadBuffer = this.createQuad();

    this.createStaticUi();
    this.rebuildLabels();
    this.resize();

    window.addEventListener('resize', this.resize);
  }

  startRendering(): void {
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);

    this.canvas.remove();
    this.overlay.remove();
  }

  refreshFriendUi(): void {
    this.rebuildLabels();
  }

  getViewport(): ViewportSize {
    return {
      width: this.width,
      height: this.height,
    };
  }

  private readonly resize = (): void => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.round(this.width * this.dpr);
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

    gl.disable(gl.BLEND);

    gl.useProgram(this.backgroundProgram);

    this.bindQuad(this.backgroundProgram);

    this.setBackgroundUniforms(time);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const activeFriends = this.friends
      .filter((friend) => friend.active)
      .map((friend) => ({
        friend,
        point: this.visualFriendPoint(friend, time),
        mergeLevel: this.mergeLevels.get(friend.id) ?? 0,
      }));

    gl.useProgram(this.mergedOrbsProgram);
    this.bindQuad(this.mergedOrbsProgram);
    this.drawMergedOrbs(time, activeFriends);
  }

  private userRadius(): number {
    return this.isMobile ? USER_RADIUS.mobile : USER_RADIUS.desktop;
  }

  private friendRadius(density: number): number {
    if (this.isMobile) {
      return FRIEND_RADIUS.mobileBase + density * FRIEND_RADIUS.mobileDensity;
    }

    return FRIEND_RADIUS.desktopBase + density * FRIEND_RADIUS.desktopDensity;
  }

  private visualFriendPoint(friend: Friend, time: number): RenderPoint {
    const target = friendScreenPosition(
      friend.bearing,
      this.getViewport(),
    );

    const current = this.smoothPosition(friend.id, target);
    const float = this.friendFloat(friend.id, time, friend.density);
    const merged = this.applyUserMerge(friend, {
      x: current.x + float.x,
      y: current.y + float.y,
    });

    this.visualPositions.set(friend.id, merged);

    return merged;
  }

  private applyUserMerge(friend: Friend, point: RenderPoint): RenderPoint {
    const user = this.userPoint();
    const meters = proximityMeters(friend.density);
    const targetLevel = this.targetMergeLevel(meters);
    const previous = this.mergeLevels.get(friend.id) ?? 0;
    const level = previous + (targetLevel - previous) * MERGE_ANIMATION_EASE;

    this.mergeLevels.set(friend.id, level);

    if (level <= 0.001) {
      return point;
    }

    const dx = user.x - point.x;
    const dy = user.y - point.y;
    const distance = Math.hypot(dx, dy);
    const minSeparation = this.isMobile
      ? MIN_MERGE_SEPARATION.mobile
      : MIN_MERGE_SEPARATION.desktop;
    const distanceCappedLevel = Math.max(
      0,
      1 - minSeparation / Math.max(distance, minSeparation),
    );
    const pull = Math.min(level, distanceCappedLevel);

    return {
      x: point.x + dx * pull,
      y: point.y + dy * pull,
    };
  }

  private targetMergeLevel(meters: number): number {
    if (meters >= MERGE_DISTANCE_METERS) {
      return 0;
    }

    const closeness = 1 - meters / MERGE_DISTANCE_METERS;
    const shaped = smoothstep(closeness);

    return shaped * MERGE_STRENGTH;
  }

  private userPoint(): RenderPoint {
    return {
      x: this.width / 2,
      y: this.height / 2,
    };
  }

  private drawMergedOrbs(
    time: number,
    activeFriends: ActiveFriendRender[],
  ): void {
    const gl = this.gl;
    const userCenter = this.toWorld(this.userPoint());
    const friendCenters = new Float32Array(MAX_MERGED_FRIENDS * 2);
    const friendRadii = new Float32Array(MAX_MERGED_FRIENDS);
    const friendMerges = new Float32Array(MAX_MERGED_FRIENDS);
    const friendDensities = new Float32Array(MAX_MERGED_FRIENDS);
    const friendCores = new Float32Array(MAX_MERGED_FRIENDS * 3);
    const friendGlows = new Float32Array(MAX_MERGED_FRIENDS * 3);
    const friendRims = new Float32Array(MAX_MERGED_FRIENDS * 3);

    const friendsToDraw = activeFriends.slice(0, MAX_MERGED_FRIENDS);

    for (let i = 0; i < friendsToDraw.length; i++) {
      const { friend, point, mergeLevel } = friendsToDraw[i];
      const center = this.toWorld(point);
      const radius = this.friendRadius(friend.density);
      const tone = toneFor(friend.colorIdx);

      friendCenters[i * 2] = center[0];
      friendCenters[i * 2 + 1] = center[1];
      friendRadii[i] = radius;
      friendMerges[i] = mergeLevel / MERGE_STRENGTH;
      friendDensities[i] = friend.density;
      friendCores.set(tone.core, i * 3);
      friendGlows.set(tone.glow, i * 3);
      friendRims.set(tone.rim, i * 3);
    }

    gl.uniform1f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uTime'),
      time,
    );

    gl.uniform1f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uSmoothness'),
      MERGE_SMOOTHNESS,
    );

    gl.uniform1i(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendCount'),
      friendsToDraw.length,
    );

    gl.uniform2f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserCenter'),
      userCenter[0],
      userCenter[1],
    );

    gl.uniform2fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendCenters[0]'),
      friendCenters,
    );

    gl.uniform2f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uRes'),
      this.canvas.width,
      this.canvas.height,
    );

    gl.uniform1f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserRadius'),
      this.userRadius(),
    );

    gl.uniform1f(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserDensity'),
      0.72,
    );

    gl.uniform1fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendRadii[0]'),
      friendRadii,
    );

    gl.uniform1fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendMerges[0]'),
      friendMerges,
    );

    gl.uniform1fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendDensities[0]'),
      friendDensities,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserCore'),
      theme.youTone.core,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserGlow'),
      theme.youTone.glow,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uUserRim'),
      theme.youTone.rim,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendCores[0]'),
      friendCores,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendGlows[0]'),
      friendGlows,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.mergedOrbsProgram, 'uFriendRims[0]'),
      friendRims,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private setBackgroundUniforms(time: number): void {
    const gl = this.gl;

    gl.uniform1f(
      gl.getUniformLocation(this.backgroundProgram, 'uTime'),
      time,
    );

    gl.uniform2f(
      gl.getUniformLocation(this.backgroundProgram, 'uRes'),
      this.canvas.width,
      this.canvas.height,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.backgroundProgram, 'uBase'),
      theme.background.base,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.backgroundProgram, 'uUpper'),
      theme.background.upper,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.backgroundProgram, 'uWarmth'),
      theme.background.warmth,
    );

    gl.uniform3fv(
      gl.getUniformLocation(this.backgroundProgram, 'uDepth'),
      theme.background.depth,
    );
  }

  private updateLabels(time: number): void {
    const viewport = this.getViewport();

    for (const friend of this.friends) {
      const parts = this.labels.get(friend.id);

      if (!parts) continue;

      const position =
        this.visualPositions.get(friend.id) ??
        this.visualFriendPoint(friend, time);

      const scale =
        0.96 +
        friend.density * 0.08 +
        Math.sin(time * 0.55 + friend.id) * 0.018;

      parts.root.style.transform = `
        translate3d(
          ${position.x}px,
          ${position.y}px,
          0
        )
        translate(-50%, -50%)
        scale(${scale})
      `;

      parts.meta.textContent = friendDistanceLabel(friend);
    }
  }

  private rebuildLabels(): void {
    for (const label of this.labels.values()) {
      label.root.remove();
    }

    this.labels.clear();

    for (const friend of this.friends) {
      const tone = toneFor(friend.colorIdx);

      const root = document.createElement('div');
      root.className = 'pulse-friend-label';

      const initials = document.createElement('div');
      initials.className = 'pulse-friend-initials';

      initials.textContent = initialsFor(friend.name);

      initials.style.borderColor = rgbCss(tone.rim, 0.26);

      initials.style.boxShadow = `
        0 0 24px ${rgbCss(tone.glow, 0.18)}
      `;

      const name = document.createElement('div');
      name.className = 'pulse-friend-name';
      name.textContent = friend.name;

      const meta = document.createElement('div');
      meta.className = 'pulse-friend-meta';
      meta.textContent = friendDistanceLabel(friend);

      root.append(initials, name, meta);

      this.overlay.appendChild(root);

      this.labels.set(friend.id, {
        root,
        initials,
        name,
        meta,
      });
    }
  }

  private createStaticUi(): void {
    const title = document.createElement('div');

    title.className = 'pulse-title';
    title.textContent = 'PULSE';

    const you = document.createElement('div');

    you.className = 'pulse-you';

    you.innerHTML = `
      <span>YOU</span>
      <small>centered</small>
    `;

    this.overlay.append(title, you);
  }

  private smoothPosition(
    id: number,
    target: RenderPoint,
  ): RenderPoint {
    const previous = this.positions.get(id);

    if (!previous) {
      this.positions.set(id, target);
      return target;
    }

    const next = {
      x: previous.x + (target.x - previous.x) * 0.055,
      y: previous.y + (target.y - previous.y) * 0.055,
    };

    this.positions.set(id, next);

    return next;
  }

  private friendFloat(
    id: number,
    time: number,
    density: number,
  ): RenderPoint {
    const amount = 4 + density * 7;

    return {
      x: Math.sin(time * 0.2 + id * 1.7) * amount,
      y: Math.cos(time * 0.17 + id * 1.13) * amount * 0.72,
    };
  }

  private toWorld(point: RenderPoint): [number, number] {
    const aspect = this.canvas.width / this.canvas.height;

    return [
      (point.x / this.width - 0.5) * aspect,
      0.5 - point.y / this.height,
    ];
  }

  private createProgram(fragmentShader: string): WebGLProgram {
    const gl = this.gl;

    const program = gl.createProgram();

    if (!program) {
      throw new Error('Program creation failed');
    }

    gl.attachShader(
      program,
      this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER),
    );

    gl.attachShader(
      program,
      this.createShader(gl.FRAGMENT_SHADER, fragmentShader),
    );

    gl.linkProgram(program);

    return program;
  }

  private createShader(
    type: number,
    source: string,
  ): WebGLShader {
    const gl = this.gl;

    const shader = gl.createShader(type);

    if (!shader) {
      throw new Error('Shader creation failed');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    return shader;
  }

  private createQuad(): WebGLBuffer {
    const gl = this.gl;

    const buffer = gl.createBuffer();

    if (!buffer) {
      throw new Error('Buffer creation failed');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]),
      gl.STATIC_DRAW,
    );

    return buffer;
  }

  private bindQuad(program: WebGLProgram): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);

    const attribute = gl.getAttribLocation(program, 'aPos');

    gl.enableVertexAttribArray(attribute);

    gl.vertexAttribPointer(
      attribute,
      2,
      gl.FLOAT,
      false,
      0,
      0,
    );
  }
}

function proximityMeters(density: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, density))) * 1000);
}

function smoothstep(value: number): number {
  const x = Math.max(0, Math.min(1, value));

  return x * x * (3 - 2 * x);
}

let stylesInjected = false;

function injectRendererStyles(): void {
  if (stylesInjected) return;

  stylesInjected = true;

  const style = document.createElement('style');

  style.textContent = `
    body {
      margin: 0;
      overflow: hidden;
      background: #020304;
      color: white;
      font-family:
        Inter,
        system-ui,
        sans-serif;
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
      letter-spacing: 0.4em;
      opacity: 0.4;
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

    .pulse-friend-label {
      position: fixed;
      left: 0;
      top: 0;
      width: 86px;
      height: 86px;
      text-align: center;
      will-change: transform, opacity;
    }

    .pulse-friend-initials {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(7px);
      font-size: 11px;
      font-weight: 700;
    }

    .pulse-friend-name {
      position: absolute;
      left: 50%;
      top: calc(50% + 25px);
      transform: translateX(-50%);
      font-size: 11px;
      white-space: nowrap;
      opacity: 0.8;
    }

    .pulse-friend-meta {
      position: absolute;
      left: 50%;
      top: calc(50% + 40px);
      transform: translateX(-50%);
      font-size: 9px;
      opacity: 0.45;
      white-space: nowrap;
    }
  `;

  document.head.appendChild(style);
}
