// The live view's renderer: render.js's light model on the GPU (WebGL2).
//
// The unlit scene (desk, boards, packages) is drawn once per scene into a
// half-float texture. Each frame copies it, adds every LED's light as one
// instanced quad with additive blending (linear light, as render.js sums
// it), and tone-maps to the canvas. Behind an opal diffuser the light is
// drawn into a coarse target instead (render.js opalCell) and interpolated
// in the tone pass, as the CPU renderer does. The CPU cost of a frame is uploading
// 3 floats per LED.
//
// createGLRenderer(canvas) returns null where WebGL2 or float render
// targets are missing; the caller then falls back to renderFrame().

import { LIGHT, frameSize, opalSpot, opalCell, exposureFor, kindCode } from './render.js';

const VS_QUAD = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 center;
layout(location=2) in float rot;
layout(location=3) in vec3 pkg;      // half width, half height, kind (0 clear, 1 frosted, 2 gob)
layout(location=4) in vec3 emit;
uniform vec2 uOrigin; uniform float uScale; uniform vec2 uSize;
uniform float uReach;                // > 0: light quad of this half size; 0: package quad
uniform float uReachGob;             // the same for gob packages (their halo is smaller)
flat out vec2 vC; flat out float vRot; flat out vec3 vPk; flat out vec3 vE;
void main() {
  vC = center; vRot = radians(rot); vPk = pkg; vE = emit;
  float half_ = uReach > 0.0 ? (pkg.z > 1.5 ? uReachGob : uReach) : length(pkg.xy) + 0.2;
  if (uReach > 0.0 && emit.r + emit.g + emit.b <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 px = (center + corner * half_ - uOrigin) * uScale;
  gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0);
}`;

// world position of this pixel's centre, in mm, y down: the CPU renderer's sample point
const WORLD = `
uniform vec2 uOrigin; uniform float uScale; uniform vec2 uSize;
vec2 world() { return vec2(gl_FragCoord.x / uScale + uOrigin.x, (uSize.y - gl_FragCoord.y) / uScale + uOrigin.y); }
vec2 local(vec2 d, float r) { float c = cos(-r), s = sin(-r); return vec2(d.x * c - d.y * s, d.x * s + d.y * c); }`;

const FS_PKG = `#version 300 es
precision highp float;
${WORLD}
uniform vec3 uBody;
flat in vec2 vC; flat in float vRot; flat in vec3 vPk; flat in vec3 vE;
out vec4 o;
void main() {
  vec2 uv = local(world() - vC, vRot);
  float cov = clamp((vPk.x - abs(uv.x)) * uScale + 0.5, 0.0, 1.0) * clamp((vPk.y - abs(uv.y)) * uScale + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vec4(uBody, cov);
}`;

const FS_LIGHT = `#version 300 es
precision highp float;
${WORLD}
uniform int uOpal; uniform float uHalo, uA2, uFR, uAmpF, uAmpC, uAmpG;
flat in vec2 vC; flat in float vRot; flat in vec3 vPk; flat in vec3 vE;
out vec4 o;
const vec2 D0 = vec2(${LIGHT.dies[0].join(', ')}), D1 = vec2(${LIGHT.dies[1].join(', ')}), D2 = vec2(${LIGHT.dies[2].join(', ')});
float sq(vec2 v) { return dot(v, v); }
void main() {
  vec2 d = world() - vC;
  float d2 = dot(d, d);
  if (uOpal == 1) {          // render.js opalSpot(): Lambertian spot, cut off smoothly
    float f = 1.0 / ((1.0 + d2 / uA2) * (1.0 + d2 / uA2));
    o = vec4(vE * (f > uFR ? (vPk.z > 1.5 ? uAmpG : vPk.z > 0.5 ? uAmpF : uAmpC) * (f - uFR) : 0.0), 0.0); return;
  }
  if (vPk.z > 1.5) {         // gob: close dies blurred by the epoxy, a small halo
    vec2 uv = local(d, vRot);
    vec3 g = vec3(uHalo * ${(LIGHT.gob.halo / LIGHT.halo.bare).toFixed(4)} * exp(-d2 / ${LIGHT.gob.haloS2.toFixed(4)}));
    if (abs(uv.x) < vPk.x && abs(uv.y) < vPk.y) {
      float f = ${LIGHT.gob.face.toFixed(4)} * (1.0 - 0.5 * sq(uv / vPk.xy));
      float k = ${LIGHT.gob.die.toFixed(4)}, s2 = ${LIGHT.gob.s2.toFixed(4)}, ds = ${LIGHT.gob.dieScale.toFixed(4)};
      g += vec3(f + k * exp(-sq(uv - ds * D0) / s2), f + k * exp(-sq(uv - ds * D1) / s2), f + k * exp(-sq(uv - ds * D2) / s2));
    }
    o = vec4(vE * g, 0.0); return;
  }
  vec3 g = vec3(uHalo * exp(-d2 / ${LIGHT.halo.s2.toFixed(4)}));
  vec2 uv = local(d, vRot);
  if (abs(uv.x) < vPk.x && abs(uv.y) < vPk.y) {
    float r2 = sq(uv / vPk.xy);
    if (vPk.z > 0.5) {
      g += ${LIGHT.frosted.face.toFixed(4)} * (1.0 - 0.35 * r2) + ${LIGHT.frosted.spot.toFixed(4)} * exp(-d2 / ${LIGHT.frosted.s2.toFixed(4)});
    } else {
      float f = ${LIGHT.clear.face.toFixed(4)} * (1.0 - 0.5 * r2);
      float k = ${LIGHT.clear.die.toFixed(4)}, s2 = ${LIGHT.clear.s2.toFixed(4)};
      g += vec3(f + k * exp(-sq(uv - D0) / s2), f + k * exp(-sq(uv - D1) / s2), f + k * exp(-sq(uv - D2) / s2));
    }
  }
  o = vec4(vE * g, 0.0);
}`;

const VS_POLY = `#version 300 es
layout(location=0) in vec2 p;
uniform vec2 uOrigin; uniform float uScale; uniform vec2 uSize;
void main() { vec2 px = (p - uOrigin) * uScale; gl_Position = vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0); }`;
const FS_POLY = `#version 300 es
precision highp float; uniform vec3 uCol; out vec4 o; void main() { o = vec4(uCol, 1.0); }`;

const VS_FULL = `#version 300 es
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_TONE = `#version 300 es
precision highp float;
uniform sampler2D uAcc, uOpalTex; uniform float uEx, uGain;
uniform int uOpalOn; uniform vec2 uOrigin; uniform float uScale, uCell; uniform vec2 uSize, uCoarse;
out vec4 o;
void main() {
  vec3 c = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0).rgb;
  if (uOpalOn == 1) {
    vec2 w = vec2(gl_FragCoord.x / uScale, (uSize.y - gl_FragCoord.y) / uScale);   // mm from the origin, y down
    c += uGain * texture(uOpalTex, vec2(w.x / uCell / uCoarse.x, 1.0 - w.y / uCell / uCoarse.y)).rgb;
  }
  c *= uEx;
  float m = max(c.r, max(c.g, c.b));
  c += m > ${LIGHT.tone.spillAt.toFixed(4)} ? (m - ${LIGHT.tone.spillAt.toFixed(4)}) * ${LIGHT.tone.spill.toFixed(4)} : 0.0;
  c = 1.0 - exp(-${LIGHT.tone.k.toFixed(4)} * c);
  o = vec4(mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0);
}`;

/** Ear-clip a simple polygon into triangles (flat [x, y, ...] list). */
function triangulate(poly) {
  let pts = poly.slice();
  const area = pts.reduce((s, [x, y], k) => { const [u, v] = pts[(k + 1) % pts.length]; return s + x * v - u * y; }, 0);
  if (area < 0) pts.reverse();
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  pts = pts.filter((p, k) => Math.abs(cross(pts[(k + pts.length - 1) % pts.length], p, pts[(k + 1) % pts.length])) > 1e-9);
  const inTri = (p, a, b, c) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  const out = [];
  let guard = 0;
  while (pts.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[(k + pts.length - 1) % pts.length], b = pts[k], c = pts[(k + 1) % pts.length];
      if (cross(a, b, c) <= 0) continue;
      if (pts.some((p) => p !== a && p !== b && p !== c && inTri(p, a, b, c))) continue;
      out.push(...a, ...b, ...c); pts.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (pts.length === 3) out.push(...pts[0], ...pts[1], ...pts[2]);
  return out;
}

export function createGLRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;

  const compile = (vs, fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = new Proxy({}, { get: (c, n) => (c[n] ??= gl.getUniformLocation(p, n)) });
    return { p, u };
  };
  const pkgP = compile(VS_QUAD, FS_PKG), lightP = compile(VS_QUAD, FS_LIGHT);
  const polyP = compile(VS_POLY, FS_POLY), toneP = compile(VS_FULL, FS_TONE);

  const quadVao = gl.createVertexArray(), polyVao = gl.createVertexArray(), emptyVao = gl.createVertexArray();
  const cornerBuf = gl.createBuffer(), instBuf = gl.createBuffer(), emitBuf = gl.createBuffer(), polyBuf = gl.createBuffer();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  for (const [loc, n, off] of [[1, 2, 0], [2, 1, 8], [3, 3, 12]]) {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 24, off); gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, emitBuf);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(4, 1);
  gl.bindVertexArray(polyVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, polyBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const target = () => {
    const tex = gl.createTexture(), fb = gl.createFramebuffer();
    return { tex, fb };
  };
  const baseT = target(), accT = target(), opalT = target();
  let S = null;   // the current scene

  function common(prog) {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.uOrigin, S.ox, S.oy); gl.uniform1f(prog.u.uScale, S.scale); gl.uniform2f(prog.u.uSize, S.W, S.H);
  }

  /** Set up a layout and look; draws the unlit scene. Cheap enough to call on every option change. */
  function setScene(L, opts = {}) {
    const o = { scale: 10, margin: 4, look: 'bare', gap: 8, room: 'dark', exposure: 1, ...opts };
    const { width: W, height: H } = frameSize(L, o);
    S = { L, o, W, H, scale: o.scale, ox: L.bbox.x0 - o.margin, oy: L.bbox.y0 - o.margin, n: L.n };
    if (o.look === 'opal') {
      S.spot = opalSpot(o.gap); S.cell = opalCell(o.gap, o.scale);
      S.Wc = Math.ceil(W / o.scale / S.cell) + 1; S.Hc = Math.ceil(H / o.scale / S.cell) + 1;
      gl.bindTexture(gl.TEXTURE_2D, opalT.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, S.Wc, S.Hc, 0, gl.RGBA, gl.HALF_FLOAT, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, opalT.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, opalT.tex, 0);
    }
    canvas.width = W; canvas.height = H;
    for (const t of [baseT, accT]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.HALF_FLOAT, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    // per-LED static data: centre, rotation, package
    const inst = new Float32Array(L.n * 6);
    L.leds.forEach((l, i) => {
      const pk = L.panels[l.panel].def.package;
      inst.set([l.x, l.y, l.rot, pk.w / 2, pk.h / 2, kindCode(pk)], i * 6);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, emitBuf); gl.bufferData(gl.ARRAY_BUFFER, L.n * 12, gl.DYNAMIC_DRAW);

    // the unlit scene, once
    const amb = LIGHT.room[o.room] ?? LIGHT.room.dark, tint = o.look === 'smoke' ? LIGHT.smokeTint : 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseT.fb);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(...LIGHT.desk.map((c) => c * amb), 1); gl.clear(gl.COLOR_BUFFER_BIT);
    common(polyP);
    gl.uniform3fv(polyP.u.uCol, (o.look === 'opal' ? LIGHT.opalSheet : LIGHT.mask).map((c) => c * amb * (o.look === 'opal' ? 1 : tint)));
    gl.bindVertexArray(polyVao); gl.bindBuffer(gl.ARRAY_BUFFER, polyBuf);
    const tris = new Float32Array(L.panels.flatMap((p) => triangulate(p.outline)));
    gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
    if (o.look !== 'opal') {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      common(pkgP);
      gl.uniform1f(pkgP.u.uReach, 0);
      // one body colour per package type; draw each board's LEDs with its own
      gl.bindVertexArray(quadVao);
      for (const p of L.panels) {
        gl.uniform3fv(pkgP.u.uBody, p.def.package.body.map((v) => v * amb * tint));
        drawInstances(p.start, p.count);
      }
    }
    gl.bindVertexArray(null);
    return { width: W, height: H };
  }

  // Instanced draw of LEDs [first, first + count): rebind the instance
  // attributes at an offset (WebGL2 has no base-instance draw).
  function drawInstances(first, count) {
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    for (const [loc, n, off] of [[1, 2, 0], [2, 1, 8], [3, 3, 12]]) gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 24, first * 24 + off);
    gl.bindBuffer(gl.ARRAY_BUFFER, emitBuf);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, first * 12);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  /** Draw one frame: `duty` is Float32Array(3n), PWM duty 0..1 per channel. */
  function draw(duty) {
    const { W, H, o } = S;
    gl.bindBuffer(gl.ARRAY_BUFFER, emitBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, duty);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, baseT.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, accT.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accT.fb);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const opal = o.look === 'opal';
    gl.useProgram(lightP.p);
    gl.uniform2f(lightP.u.uOrigin, S.ox, S.oy);
    gl.uniform1i(lightP.u.uOpal, opal ? 1 : 0);
    gl.uniform1f(lightP.u.uHalo, o.look === 'smoke' ? LIGHT.halo.smoke : LIGHT.halo.bare);
    if (opal) {
      // the diffused light goes to the coarse target: one texel per opalCell mm
      gl.bindFramebuffer(gl.FRAMEBUFFER, opalT.fb);
      gl.viewport(0, 0, S.Wc, S.Hc);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(lightP.u.uScale, 1 / S.cell); gl.uniform2f(lightP.u.uSize, S.Wc, S.Hc);
      gl.uniform1f(lightP.u.uA2, S.spot.a * S.spot.a); gl.uniform1f(lightP.u.uFR, S.spot.fR); gl.uniform1f(lightP.u.uAmpF, S.spot.ampF); gl.uniform1f(lightP.u.uAmpC, S.spot.ampC); gl.uniform1f(lightP.u.uAmpG, S.spot.ampG);
      gl.uniform1f(lightP.u.uReach, S.spot.R); gl.uniform1f(lightP.u.uReachGob, S.spot.R);
    } else {
      gl.uniform1f(lightP.u.uScale, S.scale); gl.uniform2f(lightP.u.uSize, W, H);
      gl.uniform1f(lightP.u.uReach, LIGHT.reach); gl.uniform1f(lightP.u.uReachGob, LIGHT.gob.reach);
    }
    gl.bindVertexArray(quadVao);
    drawInstances(0, S.n);
    // tone map to the canvas
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(toneP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accT.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, opalT.tex);
    gl.uniform1i(toneP.u.uAcc, 0); gl.uniform1i(toneP.u.uOpalTex, 1); gl.uniform1f(toneP.u.uEx, o.exposure); gl.uniform1f(toneP.u.uGain, exposureFor(S.L, 'opal'));
    gl.uniform1i(toneP.u.uOpalOn, opal ? 1 : 0);
    if (opal) {
      gl.uniform1f(toneP.u.uScale, S.scale); gl.uniform2f(toneP.u.uSize, W, H);
      gl.uniform1f(toneP.u.uCell, S.cell); gl.uniform2f(toneP.u.uCoarse, S.Wc, S.Hc);
    }
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  return { setScene, draw, gl };
}
