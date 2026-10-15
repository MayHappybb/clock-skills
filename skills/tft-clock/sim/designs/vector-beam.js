// The beam: a tiny colour vector-display renderer for vector.js.
//
// A frame is a display list of strokes and points, as on a real vector
// cabinet. `flush()` turns it into pixels in three passes:
//   1. bloom: every stroke deposits its light into a 41 x 21 grid (one node
//      every 4 pixels), blurred twice; this is the phosphor halo.
//   2. the tube: one g.coarse pass over the whole glass paints the glass
//      (deep blue-black, a curved glare, the overlay gel) plus the bloom.
//   3. the strokes: anti-aliased beam lines of any width, own scan loop
//      (a Wu-style column/row walk, ~3 blended pixels per pixel of length),
//      then the vertex points, brighter where the beam lingers.
// The top OVL rows are under a red gel, like Battlezone's: whatever the beam
// draws there turns red.
//
// Cost: g.put prices each blended pixel; the walk around it (a few integer
// and float ops per step) is charged honestly to g.cost.box (3 cycles each,
// 5 per step), so check.mjs sees it.

import { R, G, B } from '../js/kit.js';

export const W = 160, H = 80;
const GW = 41, GH = 21, CELL = 4;
const MAXS = 3000, MAXP = 800;

// display list (typed arrays: monomorphic, no allocation per stroke)
const SX0 = new Float32Array(MAXS), SY0 = new Float32Array(MAXS), SX1 = new Float32Array(MAXS), SY1 = new Float32Array(MAXS);
const SC = new Uint32Array(MAXS), SI = new Float32Array(MAXS), SW = new Float32Array(MAXS), SB = new Float32Array(MAXS);
const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PC = new Uint32Array(MAXP), PI = new Float32Array(MAXP);
let ns = 0, np = 0;

// bloom grid, and the tube underneath it
const BR = new Float32Array(GW * GH), BG = new Float32Array(GW * GH), BB = new Float32Array(GW * GH);
const TR = new Float32Array(GW * GH), TG = new Float32Array(GW * GH), TB = new Float32Array(GW * GH);
const TMP = new Float32Array(GW * GH);

export const OVL = 11;               // rows under the red gel
const GEL = [1.0, 0.16, 0.12];       // what the gel passes of the beam's light

/** Build the tube's glass colour per grid node: `fn(x, y)` -> 0xRRGGBB. */
export function setTube(fn) {
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const c = fn(i * CELL, j * CELL), k = j * GW + i;
      TR[k] = R(c); TG[k] = G(c); TB[k] = B(c);
    }
}

export function reset() { ns = 0; np = 0; }

/**
 * A beam stroke from (x0, y0) to (x1, y1), screen pixels (centres at +0.5),
 * colour c, intensity i (0..1), width w (pixels), bloom weight b.
 */
export function line(x0, y0, x1, y1, c, i = 1, w = 1.3, b = 1) {
  if (ns >= MAXS || i <= 0.01) return;
  SX0[ns] = x0; SY0[ns] = y0; SX1[ns] = x1; SY1[ns] = y1; SC[ns] = c; SI[ns] = i; SW[ns] = w; SB[ns] = b; ns++;
}

/** A point where the beam lingers: a small hot spot. */
export function point(x, y, c, i = 1) {
  if (np >= MAXP || i <= 0.01) return;
  PX[np] = x; PY[np] = y; PC[np] = c; PI[np] = i; np++;
}

// ------------------------------------------------------------ bloom

function deposit(x, y, r, g, b) {
  const fx = x / CELL, fy = y / CELL;
  if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * GW + i;
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  BR[k] += r * w00; BG[k] += g * w00; BB[k] += b * w00;
  BR[k + 1] += r * w10; BG[k + 1] += g * w10; BB[k + 1] += b * w10;
  BR[k + GW] += r * w01; BG[k + GW] += g * w01; BB[k + GW] += b * w01;
  BR[k + GW + 1] += r * w11; BG[k + GW + 1] += g * w11; BB[k + GW + 1] += b * w11;
}

function blur(A) {
  // separable [1 2 1] / 4, clamped edges
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

let bloomGain = 1, tubeGain = 1;
function tubePixel(x, y) {
  const k = (y >> 2) * GW + (x >> 2);
  let r = TR[k] * tubeGain + BR[k] * bloomGain, g = TG[k] * tubeGain + BG[k] * bloomGain, b = TB[k] * tubeGain + BB[k] * bloomGain;
  if (y < OVL) { const l = (r + g + b) * 0.5; r = TR[k] * tubeGain + l * GEL[0]; g = TG[k] * tubeGain + l * GEL[1]; b = TB[k] * tubeGain + l * GEL[2]; }
  r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}

// ------------------------------------------------------------ strokes

let G_ = null, cost = null;
let colA = 0, colGel = 0;

function plot(x, y, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a < 0.02) return;
  G_.put(x, y, y < OVL ? colGel : colA, a > 1 ? 1 : a);
}

function gel(c) {
  const l = (R(c) + G(c) + B(c)) / 3;
  return ((Math.min(255, l * GEL[0] * 1.6) | 0) << 16) | ((l * GEL[1] * 1.6 | 0) << 8) | (l * GEL[2] * 1.6 | 0);
}

function stroke(x0, y0, x1, y1, inten, w) {
  const dx = x1 - x0, dy = y1 - y0;
  const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
  if (adx >= ady) {
    if (adx < 1e-3) return;
    if (x1 < x0) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
    const sl = (y1 - y0) / (x1 - x0), hw = 0.5 * w * Math.sqrt(1 + sl * sl);
    const ix0 = Math.floor(x0), ix1 = Math.floor(x1);
    for (let ix = ix0 < 0 ? 0 : ix0; ix <= ix1 && ix < W; ix++) {
      const cl = ix > x0 ? ix : x0, cr = ix + 1 < x1 ? ix + 1 : x1, hc = cr - cl;
      if (hc <= 0) continue;
      const yc = y0 + ((cl + cr) * 0.5 - x0) * sl, ya = yc - hw, yb = yc + hw;
      const k = hc * inten;
      for (let iy = Math.floor(ya); iy <= yb; iy++) {
        cost.box += 5;
        const lo = iy > ya ? iy : ya, hi = iy + 1 < yb ? iy + 1 : yb;
        if (hi > lo) plot(ix, iy, (hi - lo) * k);
      }
    }
  } else {
    if (y1 < y0) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
    const sl = (x1 - x0) / (y1 - y0), hw = 0.5 * w * Math.sqrt(1 + sl * sl);
    const iy0 = Math.floor(y0), iy1 = Math.floor(y1);
    for (let iy = iy0 < 0 ? 0 : iy0; iy <= iy1 && iy < H; iy++) {
      const cl = iy > y0 ? iy : y0, cr = iy + 1 < y1 ? iy + 1 : y1, hc = cr - cl;
      if (hc <= 0) continue;
      const xc = x0 + ((cl + cr) * 0.5 - y0) * sl, xa = xc - hw, xb = xc + hw;
      const k = hc * inten;
      for (let ix = Math.floor(xa); ix <= xb; ix++) {
        cost.box += 5;
        const lo = ix > xa ? ix : xa, hi = ix + 1 < xb ? ix + 1 : xb;
        if (hi > lo) plot(ix, iy, (hi - lo) * k);
      }
    }
  }
}

function spot(x, y, inten) {
  // bilinear 2 x 2 splat, boosted: a hot point that glides by fractions of a pixel
  x -= 0.5; y -= 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, k = 1.7 * inten;
  cost.box += 10;
  plot(ix, iy, (1 - u) * (1 - v) * k); plot(ix + 1, iy, u * (1 - v) * k);
  plot(ix, iy + 1, (1 - u) * v * k); plot(ix + 1, iy + 1, u * v * k);
}

/**
 * Draw the frame: tube + bloom, strokes, points. `bloom` scales the halo,
 * `tube` the glass (night).
 */
export function flush(g, { bloom = 1, tube = 1 } = {}) {
  G_ = g; cost = g.cost;
  BR.fill(0); BG.fill(0); BB.fill(0);
  for (let s = 0; s < ns; s++) {
    const x0 = SX0[s], y0 = SY0[s], dx = SX1[s] - x0, dy = SY1[s] - y0;
    const len = Math.abs(dx) + Math.abs(dy);
    const n = 1 + ((len * 0.5) | 0), e = SI[s] * SB[s] * SW[s] * (len + 0.5) / n, c = SC[s];
    const r = R(c) * e, gg = G(c) * e, b = B(c) * e;
    cost.box += 4 * n;
    for (let q = 0; q < n; q++) { const u = (q + 0.5) / n; deposit(x0 + dx * u, y0 + dy * u, r, gg, b); }
  }
  for (let p = 0; p < np; p++) { const c = PC[p], e = PI[p] * 1.5; deposit(PX[p], PY[p], R(c) * e, G(c) * e, B(c) * e); }
  blur(BR); blur(BG); blur(BB);
  cost.box += GW * GH * 3 * 12;
  bloomGain = 0.055 * bloom; tubeGain = tube;
  g.coarse(tubePixel, { cell: CELL });

  let last = -1;
  for (let s = 0; s < ns; s++) {
    const c = SC[s];
    if (c !== last) { colA = c; colGel = gel(c); last = c; }
    stroke(SX0[s], SY0[s], SX1[s], SY1[s], SI[s], SW[s]);
  }
  for (let p = 0; p < np; p++) {
    const c = PC[p];
    if (c !== last) { colA = c; colGel = gel(c); last = c; }
    spot(PX[p], PY[p], PI[p]);
  }
  G_ = null;
}
