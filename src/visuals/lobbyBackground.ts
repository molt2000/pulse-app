import { BACKGROUND_SHADER, GRAVITY_FIELD_SHADER, VERTEX_SHADER } from './shaders';

export class LobbyBackground {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly bgProgram: WebGLProgram;
  private readonly gridProgram: WebGLProgram;
  private readonly quad: WebGLBuffer;
  private raf = 0;
  private startTime = 0;

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;';
    root.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    this.bgProgram = this.createProgram(BACKGROUND_SHADER);
    this.gridProgram = this.createProgram(GRAVITY_FIELD_SHADER);
    this.quad = this.createQuad();

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  private readonly resize = (): void => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  private readonly frame = (ts: number): void => {
    if (!this.startTime) this.startTime = ts;
    const time = (ts - this.startTime) * 0.001;
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;

    gl.viewport(0, 0, w, h);

    gl.disable(gl.BLEND);
    gl.useProgram(this.bgProgram);
    this.bindQuad(this.bgProgram);
    gl.uniform1f(gl.getUniformLocation(this.bgProgram, 'uTime'), time);
    gl.uniform2f(gl.getUniformLocation(this.bgProgram, 'uRes'), w, h);
    gl.uniform3f(gl.getUniformLocation(this.bgProgram, 'uBase'), 0.008, 0.01, 0.016);
    gl.uniform3f(gl.getUniformLocation(this.bgProgram, 'uUpper'), 0.01, 0.012, 0.02);
    gl.uniform3f(gl.getUniformLocation(this.bgProgram, 'uWarmth'), 0.6, 0.05, 0.06);
    gl.uniform3f(gl.getUniformLocation(this.bgProgram, 'uDepth'), 0.04, 0.01, 0.02);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.gridProgram);
    this.bindQuad(this.gridProgram);
    gl.uniform1f(gl.getUniformLocation(this.gridProgram, 'uTime'), time);
    gl.uniform2f(gl.getUniformLocation(this.gridProgram, 'uRes'), w, h);
    gl.uniform1i(gl.getUniformLocation(this.gridProgram, 'uOrbCount'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.raf = requestAnimationFrame(this.frame);
  };

  private createProgram(frag: string): WebGLProgram {
    const gl = this.gl;
    const prog = gl.createProgram();
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!prog || !vs || !fs) throw new Error('WebGL program creation failed');

    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    gl.shaderSource(fs, frag);
    gl.compileShader(fs);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
  }

  private createQuad(): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer();
    if (!buf) throw new Error('WebGL buffer creation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return buf;
  }

  private bindQuad(prog: WebGLProgram): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const attr = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  }
}
