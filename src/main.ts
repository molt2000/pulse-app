/**
 * PULSE v10
 * - Clean glowing orbs, no smoke/clouds
 * - Density drives brightness visibly
 * - Breathing animation clearly visible
 * - Labels centered on orb
 * - YOU orb same style, center ready for profile picture
 */

// ─── Palettes ──────────────────────────────────────────────────────────────
const PAL = [
  {a:[1.0,0.10,0.55],b:[0.9,0.0,1.0], c:[1.0,0.5,0.1] },
  {a:[0.0,0.80,1.0], b:[0.1,0.3,1.0], c:[0.4,1.0,0.9] },
  {a:[1.0,0.80,0.05],b:[0.0,0.85,0.5],c:[1.0,0.25,0.0]},
  {a:[0.55,0.0,1.0], b:[0.2,0.5,1.0], c:[1.0,0.1,0.8] },
  {a:[0.1,1.0,0.4],  b:[0.0,0.65,0.3],c:[0.5,1.0,0.1] },
  {a:[1.0,0.3,0.05], b:[1.0,0.55,0.0],c:[1.0,0.0,0.3] },
  {a:[0.0,0.85,0.85],b:[0.0,0.4,0.8], c:[0.3,1.0,0.7] },
  {a:[1.0,0.05,0.15],b:[0.8,0.0,0.5], c:[1.0,0.4,0.0] },
  {a:[0.75,1.0,0.05],b:[0.3,0.85,0.0],c:[0.0,1.0,0.5] },
  {a:[0.9,0.4,1.0],  b:[0.4,0.1,1.0], c:[1.0,0.6,0.9] },
] as {a:number[];b:number[];c:number[]}[];

const YOU_PAL = {a:[1.0,1.0,1.0], b:[0.75,0.88,1.0], c:[0.9,0.95,1.0]};

// ─── Data model ────────────────────────────────────────────────────────────
interface Friend {
  id:number; name:string;
  density:number;
  bearing:number;
  colorIdx:number; active:boolean;
}

export const friends: Friend[] = [
  {id:0,name:'Alex',  density:0.9, bearing:0,   colorIdx:0, active:true},
  {id:1,name:'Sam',   density:0.4, bearing:36,  colorIdx:1, active:true},
  {id:2,name:'Jordan',density:0.7, bearing:72,  colorIdx:2, active:true},
  {id:3,name:'Taylor',density:0.2, bearing:108, colorIdx:3, active:true},
  {id:4,name:'Morgan',density:0.6, bearing:144, colorIdx:4, active:true},
  {id:5,name:'Riley', density:0.15,bearing:180, colorIdx:5, active:true},
  {id:6,name:'Casey', density:0.85,bearing:216, colorIdx:6, active:true},
  {id:7,name:'Drew',  density:0.5, bearing:252, colorIdx:7, active:true},
  {id:8,name:'Quinn', density:0.3, bearing:288, colorIdx:8, active:true},
  {id:9,name:'Avery', density:0.75,bearing:324, colorIdx:9, active:true},
];

// ─── Geometry ──────────────────────────────────────────────────────────────
const ORB_REACH = 0.78;

function orbPx(bearing:number):{x:number;y:number} {
  const W=window.innerWidth, H=window.innerHeight;
  const cx=W/2, cy=H/2;
  const dx=Math.sin(bearing*Math.PI/180);
  const dy=-Math.cos(bearing*Math.PI/180);
  let t=1e9;
  if(dx> 1e-6) t=Math.min(t,(W-cx)/dx);
  if(dx<-1e-6) t=Math.min(t,(0-cx)/dx);
  if(dy> 1e-6) t=Math.min(t,(H-cy)/dy);
  if(dy<-1e-6) t=Math.min(t,(0-cy)/dy);
  return {x:cx+dx*t*ORB_REACH, y:cy+dy*t*ORB_REACH};
}

function cssToGLuv(x:number,y:number):[number,number] {
  return [x/window.innerWidth, 1.0-y/window.innerHeight];
}

// ─── Vertex shader ─────────────────────────────────────────────────────────
const VERT=`
attribute vec2 aPos;
varying vec2 vUV;
void main(){ vUV=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0); }`;

// ─── Orb shader — clean pulse glow, no smoke ───────────────────────────────
const FRAG_FRIEND=`
precision mediump float;
uniform float uTime;
uniform float uSeed;
uniform float uDensity;
uniform float uRadius;
uniform vec2  uCenter;
uniform vec2  uRes;
uniform vec3  uCA, uCB, uCC;
varying vec2  vUV;

void main(){
  float asp = uRes.x / uRes.y;
  vec2 uv = vUV - uCenter;
  uv.x *= asp;
  float r = length(uv) / uRadius;
  if(r > 3.0){ gl_FragColor = vec4(0.0); return; }

  float D = uDensity;

  // ── two-layer breathing: slow swell + fast flutter ──
  float swell   = sin(uTime * mix(0.5, 1.2, D) + uSeed * 6.2832) * 0.12;
  float flutter = sin(uTime * mix(2.0, 3.5, D) + uSeed * 2.718)  * 0.05;
  float rA = r / (1.0 + swell + flutter);   // animated radius

  // ── colour layers ───────────────────────────────────
  // 1. wide atmospheric halo
  float halo = exp(-rA * mix(0.8, 1.5, D)) * mix(0.08, 0.60, D * D);

  // 2. main coloured body
  float body = exp(-rA * rA * mix(4.0, 8.0, D)) * mix(0.12, 0.85, D);

  // 3. bright white core (only for close friends)
  float core = exp(-rA * rA * mix(80.0, 20.0, D))
               * mix(0.0, 1.0, smoothstep(0.25, 0.85, D));

  // 4. edge rim — gives a clean orb outline
  float rim  = exp(-pow(rA - 0.55, 2.0) * mix(18.0, 35.0, D)) * mix(0.04, 0.20, D);

  // centre stays slightly lit (for YOU / profile pic area)
  float cf = mix(0.25, 1.0, smoothstep(0.0, 0.40, rA));

  vec3 col = uCA * (halo + rim)
           + mix(uCA, uCB, smoothstep(0.0, 0.9, rA)) * body
           + vec3(1.0) * core;
  col *= cf;

  // tone-map
  float exposure = mix(0.8, 1.5, D);
  col = col * exposure / (0.45 + col * exposure);
  col = pow(max(col, vec3(0.0)), vec3(0.48));

  float a = (halo * 0.65 + body * mix(0.25, 0.90, D) + core * mix(0.0, 1.0, D) + rim * 0.45)
            * cf * smoothstep(3.0, 0.05, rA);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

// ─── Blit shader ───────────────────────────────────────────────────────────
const BLIT=`
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUV;
void main(){ gl_FragColor = texture2D(uTex, vUV); }`;

// ─── WebGL bootstrap ───────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
document.getElementById('app')!.appendChild(canvas);
Object.assign(canvas.style, {position:'fixed',inset:'0',width:'100%',height:'100%'});
const glOpts = {antialias:false, alpha:false, powerPreference:'high-performance'};
const gl = (canvas.getContext('webgl', glOpts) || canvas.getContext('experimental-webgl', glOpts)) as WebGLRenderingContext;

function makeShader(type:number, src:string){
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
  return s;
}
function makeProg(frag:string){
  const p = gl.createProgram()!;
  gl.attachShader(p, makeShader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, makeShader(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  return p;
}

const FP = makeProg(FRAG_FRIEND);
const BP = makeProg(BLIT);

function u(p:WebGLProgram, n:string){ return gl.getUniformLocation(p, n)!; }
const FU = {
  time: u(FP,'uTime'), seed: u(FP,'uSeed'), dens: u(FP,'uDensity'),
  rad:  u(FP,'uRadius'), cen: u(FP,'uCenter'), res: u(FP,'uRes'),
  ca:   u(FP,'uCA'), cb: u(FP,'uCB'), cc: u(FP,'uCC')
};
const BU = { tex: u(BP,'uTex') };

const quadBuf = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
function bindQuad(prog:WebGLProgram){
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  const a = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
}

// ─── FBO ───────────────────────────────────────────────────────────────────
let FW=2, FH=2, SW=2, SH=2;
const fboTex = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_2D, fboTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const fbo = gl.createFramebuffer()!;
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

const MOB = /iPhone|iPad|Android/i.test(navigator.userAgent);
const DPR = Math.min(window.devicePixelRatio || 1, MOB ? 1.0 : 1.5);
const FBO_SCALE = MOB ? 0.38 : 0.48;
const FRD_R = 0.26;

function resize(){
  SW = Math.round(window.innerWidth  * DPR);
  SH = Math.round(window.innerHeight * DPR);
  canvas.width = SW; canvas.height = SH;
  FW = Math.round(SW * FBO_SCALE);
  FH = Math.round(SH * FBO_SCALE);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  buildLabels();
}
window.addEventListener('resize', resize);

// ─── Draw orb ──────────────────────────────────────────────────────────────
function drawOrb(t:number, uv:[number,number], density:number, seed:number,
                 pal:{a:number[];b:number[];c:number[]}, radius=FRD_R){
  gl.useProgram(FP); bindQuad(FP);
  gl.uniform1f(FU.time, t);
  gl.uniform1f(FU.seed, seed);
  gl.uniform1f(FU.dens, density);
  gl.uniform1f(FU.rad,  radius);
  gl.uniform2f(FU.cen,  uv[0], uv[1]);
  gl.uniform2f(FU.res,  FW, FH);
  gl.uniform3fv(FU.ca,  pal.a);
  gl.uniform3fv(FU.cb,  pal.b);
  gl.uniform3fv(FU.cc,  pal.c);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ─── Render loop ───────────────────────────────────────────────────────────
let t0 = 0;
function frame(ts:number){
  if(!t0) t0 = ts;
  const t = (ts - t0) * 0.001;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, FW, FH);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  // YOU orb — center, white/silver
  drawOrb(t, [0.5, 0.5], 0.65, 0.0, YOU_PAL, 0.32);

  // Friend orbs
  friends.forEach((f, i) => {
    if(!f.active) return;
    const {x, y} = orbPx(f.bearing);
    drawOrb(t, cssToGLuv(x, y), f.density, (i+1)*7.391, PAL[f.colorIdx]);
  });

  // Blit to screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, SW, SH); gl.disable(gl.BLEND);
  gl.useProgram(BP); bindQuad(BP);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.uniform1i(BU.tex, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(frame);
}

// ─── UI helpers ────────────────────────────────────────────────────────────
function el(css:string, html=''){
  const e = document.createElement('div');
  e.style.cssText = css;
  if(html) e.innerHTML = html;
  return e;
}

const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes pulse-fadein{
    from{opacity:0;transform:translate(-50%,-50%) scale(0.8);}
    to  {opacity:1;transform:translate(-50%,-50%) scale(1);}
  }
  .pulse-label{ animation:pulse-fadein 0.5s ease forwards; }
`;
document.head.appendChild(styleEl);

// App title
document.body.appendChild(el(
  'position:fixed;top:18px;left:50%;transform:translateX(-50%);'+
  'color:rgba(255,255,255,0.22);font:10px system-ui;letter-spacing:5px;pointer-events:none;z-index:10',
  'PULSE'
));

// YOU label
document.body.appendChild(el(
  'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);'+
  'color:rgba(255,255,255,0.70);font:bold 12px/1.3 system-ui,sans-serif;letter-spacing:1px;'+
  'text-shadow:0 0 10px rgba(255,255,255,0.6),0 1px 3px rgba(0,0,0,0.9);'+
  'text-align:center;pointer-events:none;z-index:10',
  'YOU'
));

// FPS counter
const fpsEl = el('position:fixed;top:18px;right:16px;color:rgba(255,255,255,0.2);font:10px monospace;pointer-events:none;z-index:10');
document.body.appendChild(fpsEl);
let fc=0, ft=performance.now();
(function fpsLoop(ts:number){
  fc++; if(ts-ft>700){ fpsEl.textContent=Math.round(fc*1000/(ts-ft))+' fps'; fc=0; ft=ts; }
  requestAnimationFrame(fpsLoop);
})(ft);

// ─── Friend labels centered on orbs ────────────────────────────────────────
let lblEls: HTMLElement[] = [];

function buildLabels(){
  lblEls.forEach(l => l.remove());
  lblEls = [];

  friends.filter(f => f.active).forEach(f => {
    const pos = orbPx(f.bearing);
    const c   = PAL[f.colorIdx].a;
    const rgb = `rgb(${~~(c[0]*255)},${~~(c[1]*255)},${~~(c[2]*255)})`;

    const div = document.createElement('div');
    div.className = 'pulse-label';
    div.style.cssText =
      `position:fixed;left:${pos.x}px;top:${pos.y}px;`+
      `transform:translate(-50%,-50%);`+
      `text-align:center;pointer-events:none;z-index:10;`;

    const nameSpan = document.createElement('div');
    nameSpan.style.cssText =
      `font:bold 12px/1.3 system-ui,sans-serif;letter-spacing:0.5px;`+
      `color:#fff;`+
      `text-shadow:0 0 12px ${rgb},0 0 24px ${rgb},0 0 2px rgba(0,0,0,1),0 1px 3px rgba(0,0,0,1);`;
    nameSpan.textContent = f.name;

    const pctSpan = document.createElement('div');
    pctSpan.style.cssText =
      `font:9px/1.2 system-ui,sans-serif;letter-spacing:1px;`+
      `color:${rgb};`+
      `text-shadow:0 0 8px ${rgb},0 1px 2px rgba(0,0,0,0.9);`+
      `margin-top:1px;`;
    pctSpan.textContent = `${~~(f.density*100)}%`;

    div.appendChild(nameSpan);
    div.appendChild(pctSpan);
    document.body.appendChild(div);
    lblEls.push(div);
  });
}

// ─── Control panel (press D) ────────────────────────────────────────────────
const panel = el(
  'position:fixed;right:14px;top:50%;transform:translateY(-50%);'+
  'background:rgba(4,0,14,0.92);border:1px solid rgba(255,255,255,0.1);border-radius:14px;'+
  'padding:14px 16px;z-index:20;min-width:200px;backdrop-filter:blur(16px);display:none',
  '<div style="color:rgba(255,255,255,0.4);font:9px system-ui;letter-spacing:3px;margin-bottom:12px">PROXIMITY & BEARING</div>'
);
friends.forEach(f => {
  const c   = PAL[f.colorIdx].a;
  const rgb = `rgb(${~~(c[0]*255)},${~~(c[1]*255)},${~~(c[2]*255)})`;
  const row = el('display:flex;align-items:center;gap:6px;margin-bottom:10px');
  row.innerHTML =
    `<span style="color:${rgb};font:bold 10px system-ui;width:52px">${f.name}</span>`+
    `<input type="range" min="0" max="100" value="${~~(f.density*100)}" data-id="${f.id}" data-field="density" style="width:70px">`+
    `<span id="lv${f.id}" style="color:rgba(255,255,255,0.5);font:9px monospace;width:28px">${~~(f.density*100)}%</span>`+
    `<input type="range" min="0" max="359" value="${f.bearing}" data-id="${f.id}" data-field="bearing" style="width:70px">`;
  panel.appendChild(row);
});
document.body.appendChild(panel);
panel.addEventListener('input', (e:Event) => {
  const inp = e.target as HTMLInputElement;
  if(inp.tagName !== 'INPUT') return;
  const id = +inp.dataset['id']!;
  if(inp.dataset['field'] === 'density'){
    friends[id].density = +inp.value / 100;
    const lv = document.getElementById('lv'+id);
    if(lv) lv.textContent = inp.value+'%';
  } else {
    friends[id].bearing = +inp.value;
  }
  buildLabels();
});

let panelOpen = false;
function togglePanel(){ panelOpen=!panelOpen; panel.style.display=panelOpen?'block':'none'; }
window.addEventListener('keydown', (e:KeyboardEvent) => { if(e.key.toLowerCase()==='d') togglePanel(); });

document.body.appendChild(el(
  'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);'+
  'color:rgba(255,255,255,0.12);font:9px system-ui;letter-spacing:2px;'+
  'pointer-events:auto;z-index:10;cursor:pointer',
  '[ D ] proximity & bearing'
)).addEventListener('click', togglePanel);

// ─── Boot ──────────────────────────────────────────────────────────────────
document.title = 'Pulse';
resize();
requestAnimationFrame(frame);
