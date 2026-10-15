// The pool for synchro.js: white tiles seen through moving water, with
// caustics and soft shadows. One loop of our own over the glass, written the
// way it would be in C:
//   - caustics: two warped sine waves from a 1024-entry table (the warp
//     terms are per row and per column, computed once a frame); their sum
//     looked up in a ramp that is bright only where they cancel, a network
//   - shade: a 81 x 41 grid (a node every 2 px) into which the frame splats
//     every floor shadow and every swimmer under water, blurred once, read
//     back bilinearly (the weights are fixed by pixel parity) and quantised
//     to 4 levels with an ordered dither
//   - the pixel's floor class (tile / grout, times 8 lamp-light levels with
//     a fixed dither baked in) with shade and caustic picks its colour from
//     a 1024-entry RGB565 palette rebuilt once a minute
// No floats are needed on the device: phases in 16.16 fixed point, the
// table and the grid in int16.
//
// Cost, charged to the canvas honestly as `box` units (3 cycles each):
// per pixel 8 for the caustic and palette (two table lookups, adds, two
// lookups and a store), 3 for the shade and 3 for the calm (four grid loads
// and three fixed-point lerps each; zero quads skip); per splat 4, per grid
// node 12 for the three blur passes.

import { to565, mix } from '../js/kit.js';

export const W = 160, H = 80;
const N = 1024, K = N / (Math.PI * 2);
const S = new Float32Array(N);
for (let i = 0; i < N; i++) S[i] = Math.sin(i / K);
/** Table sine for our own loops (phase in radians). */
export const tsin = (a) => S[((a * K) | 0) & (N - 1)];
export const tcos = (a) => S[((a * K + N / 4) | 0) & (N - 1)];

const FL = new Uint8Array(W * H);     // floor class * 8 + light level
const PAL = new Uint16Array(16 * 4 * 16);
const LUT = new Uint8Array(258);
const RW = new Float32Array(H), CL = new Float32Array(W);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYF = Float32Array.from(BAYER, (v) => (v + 0.5) / 16);

// the floor: 8 px tiles with a 1 px grout line. The light map is used at
// night: the show's spotlight on the formation, and the three lamps in the
// near wall under the lower rope.
export const LAMPS = [[24, 86], [80, 87], [136, 86]];
export function lampLight(x, y) {
  const sx = (x - 80) / 86, sy = (y - 40) / 46;
  let l = 0.78 * Math.exp(-(sx * sx + sy * sy) * 2.2);
  for (const [lx, ly] of LAMPS) { const d = Math.hypot((x - lx) * 0.9, (y - ly) * 1.3); l += 0.6 * Math.exp(-(d * d) / 260); }
  return Math.min(1, l + 0.05);
}
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const grout = (x + 3) % 8 === 0 || (y + 4) % 8 === 0;
    const l = lampLight(x + 0.5, y + 0.5) * 7 + BAYER[(y & 3) * 4 + (x & 3)] / 16;
    FL[y * W + x] = (grout ? 8 : 0) + Math.min(7, l | 0);
  }

// the caustic ramp: bright where the two waves cancel, a thin network
for (let i = 0; i < 258; i++) {
  const v = Math.abs(i / 64 - 2);
  const c = Math.max(0, 1 - v / 0.3);
  LUT[i] = Math.min(15, Math.round(15 * c * c * (3 - 2 * c)));
}

/**
 * Rebuild the palette: `p` = { tile, grout, dark, floorAmt, glow, glowAmt,
 * caustic, causAmt, shade }. Per class x light level x shade x caustic.
 */
export function setPalette(p) {
  const base = [p.tile, p.grout];
  for (let cls = 0; cls < 2; cls++)
    for (let l = 0; l < 8; l++) {
      const lit = mix(mix(p.dark, base[cls], p.floorAmt + (1 - p.floorAmt) * (l / 7)), p.glow, p.glowAmt * (l / 7) * (l / 7));
      for (let q = 0; q < 4; q++) {
        const sh = mix(lit, p.shade, 0.55 * (q / 3));
        for (let c = 0; c < 16; c++) PAL[((cls * 8 + l) * 4 + q) * 16 + c] = to565(mix(sh, p.caustic, p.causAmt * (1 - 0.85 * (q / 3)) * (c / 15)));
      }
    }
}

// ------------------------------------------------------------ the shade grid
export const GW = 81, GH = 41;
const SG = new Float32Array(GW * GH), TMP = new Float32Array(GW * GH);
// the calm: the water right round the formations is quieter and a little
// darker (the swimmers' sculling smooths it), so the formation reads first
const CG = new Float32Array(GW * GH);
const CALMK = new Float32Array(16);
for (let k = 0; k < 16; k++) CALMK[k] = 1 - 0.8 * (k / 15);
let splats = 0;
export function shadeClear() { SG.fill(0); CG.fill(0); splats = 0; }
/** Add calm round (x, y). */
export function calm(x, y, amt) {
  const fx = x / 2, fy = y / 2;
  if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GW + i;
  CG[k] += amt * (1 - u) * (1 - v); CG[k + 1] += amt * u * (1 - v);
  CG[k + GW] += amt * (1 - u) * v; CG[k + GW + 1] += amt * u * v;
  splats++;
}
/** Add `amt` of shade around (x, y), canvas coordinates. */
export function splat(x, y, amt) {
  const fx = x / 2, fy = y / 2;
  if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GW + i;
  SG[k] += amt * (1 - u) * (1 - v); SG[k + 1] += amt * u * (1 - v);
  SG[k + GW] += amt * (1 - u) * v; SG[k + GW + 1] += amt * u * v;
  splats++;
}
function blur(A) {
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      TMP[k] = (A[i > 0 ? k - 1 : k] + 2 * A[k] + A[i < GW - 1 ? k + 1 : k]) * 0.25;
    }
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      A[k] = (TMP[j > 0 ? k - GW : k] + 2 * TMP[k] + TMP[j < GH - 1 ? k + GW : k]) * 0.25;
    }
}

/** Paint the water over the whole glass at time t (seconds), with this frame's shade. */
export function drawPool(g, t) {
  blur(SG); blur(CG); blur(CG);
  const buf = g.buf;
  for (let y = 0; y < H; y++) RW[y] = K * (1.5 * S[((y * 0.21 + t * 0.83) * K | 0) & (N - 1)] + t * 0.55);
  for (let x = 0; x < W; x++) CL[x] = K * (1.5 * S[((x * 0.15 - t * 0.61) * K | 0) & (N - 1)] - t * 0.47);
  const a1 = K * 0.19, a2 = K * 0.28;
  for (let y = 0; y < H; y++) {
    const rw = RW[y], row = y * W, yy = y * a2;
    const ka = (y >> 1) * GW, kb = ka + GW, wy = y & 1 ? 0.75 : 0.25, by = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const v = S[((x * a1 + rw) | 0) & (N - 1)] + S[((yy + CL[x]) | 0) & (N - 1)];
      const i = x >> 1, wx = x & 1 ? 0.75 : 0.25;
      const a = SG[ka + i], b = SG[ka + i + 1], c = SG[kb + i], d = SG[kb + i + 1];
      const ca = CG[ka + i], cb = CG[ka + i + 1], cc = CG[kb + i], cd = CG[kb + i + 1];
      let q = 0, cl = 0;
      if (ca + cb + cc + cd > 0.004) {
        const top = ca + (cb - ca) * wx, bot = cc + (cd - cc) * wx;
        cl = top + (bot - top) * wy;
        if (cl > 1) cl = 1;
      }
      let sh = cl * 0.4;
      if (a + b + c + d > 0.004) {
        const top = a + (b - a) * wx, bot = c + (d - c) * wx;
        sh += top + (bot - top) * wy;
      }
      if (sh > 0) {
        q = (sh * 3 + BAYF[by + (x & 3)]) | 0;
        if (q > 3) q = 3;
      }
      const lc = LUT[((v + 2) * 64) | 0];
      buf[row + x] = PAL[(((FL[row + x] << 2) + q) << 4) + ((lc * CALMK[(cl * 15) | 0] + BAYF[by + (x & 3)]) | 0)];
    }
  }
  g.cost.calls += 2;
  g.cost.box += W * H * 14 + GW * GH * 12 + splats * 4;
  g.cost.px += W * H;
}
