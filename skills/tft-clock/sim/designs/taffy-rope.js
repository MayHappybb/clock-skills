// The taffy rope renderer: a rope is a chain of points (centreline, radius,
// material coordinate); its segments are stamped as capsules into a small
// G-buffer (owner, squared distance, material coordinate, stripe phase,
// edge/light band), and one integer pass shades the buffer through a
// per-flavour colour table. Where a rope passes over itself (the 8's waist,
// a loop's tucked end, the strands of a skein) the later pass wins, keyline
// and all, so crossings read as rope laid over rope.
//
// RAM (device sizes): owner 1 B, d^2 2 B, u 2 B, phase 1 B, band 1 B a pixel
// over 160 x 72 rows = 80.6 KB. Colour tables: 60 entries per flavour.
import { to565 } from '../js/kit.js';

export const W = 160, H = 80, GH = 72;     // the rope buffer stops above the counter
const NPX = W * GH;
const OWN = new Uint8Array(NPX), D2 = new Uint16Array(NPX), UU = new Uint16Array(NPX);
const PH = new Uint8Array(NPX), EB = new Uint8Array(NPX);

export const KEY = 1.15;                   // keyline thickness, px
const LX = -0.55, LY = -0.835;             // light from the shop window, upper left
const SLANT = 1.15;                        // stripe slant across the rope (a helix seen from the side)

// sqrt of d^2 in 1/32 px^2 steps: a table on the device
const SQ = new Float32Array(32 * 40);
for (let i = 0; i < SQ.length; i++) SQ[i] = Math.sqrt(i / 32);

// stripe coverage by phase: period 8 px (32 quarter px), stripe 2.75 px wide, AA'd at both edges
export const PERIOD_Q = 32;
const COV = new Uint8Array(PERIOD_Q);
for (let q = 0; q < PERIOD_Q; q++) {
  const x = (q + 0.5) / 4, D = 2.75, P = 8;
  let c = Math.min(x, D - x) + 0.5;                 // inside the stripe
  if (x > D) c = Math.max(0.5 - (x - D), 0.5 - (P - x));
  c = Math.max(0, Math.min(1, c));
  COV[q] = Math.round(c * 4);
}

let bx0 = W, by0 = GH, bx1 = 0, by1 = 0, tests = 0, writes = 0;

/** Start a frame: clear the buffer (only the box the last frame used). */
export function begin(g) {
  if (bx1 > bx0) {
    for (let y = by0; y < by1; y++) OWN.fill(0, y * W + bx0, y * W + bx1);
    g.cost.px += (bx1 - bx0) * (by1 - by0);
  }
  bx0 = W; by0 = GH; bx1 = 0; by1 = 0; tests = 0; writes = 0;
}

/**
 * Stamp one rope: n points (X, Y), radius per point (R), material
 * coordinate (U), break flags (BRK: segment i -> i+1 is a gap between two
 * lengths of rope; it is drawn only where the two ends are pressed together,
 * thinning to a thread as they part).
 */
export function stamp(slot, X, Y, R, U, BRK, n, UNDER = null, merge = 0) {
  // a later pass of the rope lies over an earlier one (keyline and all) unless the rope is being
  // worked: then the passes fuse, nearest centreline wins, and only the mass's outline shows
  const bonus = 40 * (1 - merge) * (1 - merge), bonusQ = bonus * 64;
  const own = slot + 1;
  for (let k = 0; k < n - 1; k++) {
    const ax = X[k], ay = Y[k], dx = X[k + 1] - ax, dy = Y[k + 1] - ay;
    const L2 = dx * dx + dy * dy;
    let r = (R[k] + R[k + 1]) * 0.5;
    if (BRK[k]) {
      const f = 1 - (Math.sqrt(L2) - 2.2) / 6;
      if (f <= 0.15) continue;
      if (f < 1) r *= f;
    }
    if (r < 0.7) continue;
    const ro = r + KEY, ro2 = ro * ro, inv = L2 > 1e-6 ? 1 / L2 : 0, invL = Math.sqrt(inv);
    const ua = U[k], du = U[k + 1] - ua, same = 2.4 * r, ir = 1 / r, under = merge < 0.5 && UNDER !== null && UNDER[k] === 1;
    let x0 = Math.floor(Math.min(ax, ax + dx) - ro), x1 = Math.ceil(Math.max(ax, ax + dx) + ro);
    let y0 = Math.floor(Math.min(ay, ay + dy) - ro), y1 = Math.ceil(Math.max(ay, ay + dy) + ro);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W) x1 = W; if (y1 > GH) y1 = GH;
    if (x0 >= x1 || y0 >= y1) continue;
    if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    tests += (x1 - x0) * (y1 - y0);
    for (let y = y0; y < y1; y++) {
      const py = y + 0.5 - ay;
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5 - ax;
        let t = (px * dx + py * dy) * inv;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const nx = px - t * dx, ny = py - t * dy, d2 = nx * nx + ny * ny;
        if (d2 >= ro2) continue;
        const i = y * W + x, u = ua + t * du, d2q = (d2 * 64) | 0;
        if (OWN[i] === own) {
          const du2 = u - UU[i] * 0.25;
          if (du2 < same && du2 > -same) { if (d2q >= D2[i]) continue; }   // same pass: nearest centreline wins
          else if (under || d2q - bonusQ >= D2[i]) continue;                 // a tucked end stays under
        }
        writes++;
        OWN[i] = own; D2[i] = d2q; UU[i] = (u * 4) | 0;
        const e = SQ[(d2 * 32) | 0] - r;
        const edge = e < -0.55 ? 0 : e < -0.15 ? 1 : e < 0.25 ? 2 : 3;
        const w = (LX * nx + LY * ny) * ir;
        const band = w > 0.3 && w < 0.66 && e < -0.75 ? 2 : w < -0.42 ? 1 : 0;
        const v = (dx * ny - dy * nx) * invL;
        PH[i] = ((u + SLANT * v) * 4) & 255;
        EB[i] = (edge << 2) | band;
      }
    }
  }
}

/**
 * A flavour's colour table: [band (plain, shade, gloss)][stripe cover 0..4][edge 0..3]
 * as RGB565, the edge steps blending body into keyline.
 */
export function flavourLUT(base, stripe, shadeK, gloss, keyline) {
  const lut = new Uint16Array(3 * 5 * 4);
  const mixc = (a, b, u) => {
    const r = ((a >> 16) & 255) * (1 - u) + ((b >> 16) & 255) * u;
    const g = ((a >> 8) & 255) * (1 - u) + ((b >> 8) & 255) * u;
    const bb = (a & 255) * (1 - u) + (b & 255) * u;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
  };
  const dark = (c) => mixc(c, 0x1a0606, shadeK);
  for (let band = 0; band < 3; band++)
    for (let cv = 0; cv < 5; cv++) {
      let b = band === 1 ? dark(base) : base, s = band === 1 ? dark(stripe) : stripe;
      if (band === 2) { b = mixc(base, gloss, 0.55); s = mixc(stripe, 0xffffff, 0.6); }
      const body = mixc(b, s, cv / 4);
      for (let e = 0; e < 4; e++) lut[(band * 5 + cv) * 4 + e] = to565(mixc(body, keyline, [0, 0.4, 0.75, 1][e]));
    }
  return lut;
}

/**
 * Shade the buffer into the canvas. `slots[o]`: { lut, lutB, front, uHook,
 * tauQ, glint } for each rope owner. Wall pixels (exactly `ground`) one
 * step down-right of rope take the rope's shadow.
 */
export function shade(g, slots, ground565, shadow565, glint565) {
  if (bx1 <= bx0) return;
  const buf = g.buf;
  const sy1 = Math.min(GH, by1 + 3), sx1 = Math.min(W, bx1 + 2);
  let ink = 0, wall = 0;
  for (let y = by0; y < sy1; y++) {
    for (let x = bx0; x < sx1; x++) {
      const i = y * W + x, o = y < by1 && x < bx1 ? OWN[i] : 0;
      if (o) {
        const sl = slots[o - 1];
        const u = UU[i] >> 2;
        let lut = sl.lut;
        if (sl.front > 0) { const du = u - sl.uHook; if (du < sl.front && du > -sl.front) lut = sl.lutB; }
        const eb = EB[i], band = eb & 3;
        let c = lut[(band * 5 + COV[(PH[i] + sl.tauQ) & 31]) * 4 + (eb >> 2)];
        if (band === 2 && sl.glint > -99) { const dg = u - sl.glint; if (dg < 4 && dg > -4) c = glint565; }
        buf[i] = c;
        ink++;
      } else if (y >= 3 && x >= 2) {
        const j = i - 3 * W - 2;
        wall++;
        if (OWN[j] && buf[i] === ground565) buf[i] = shadow565;
      }
    }
  }
  // device price: the stamp loop is ~16 integer ops a tested pixel, a write ~20 more;
  // the shade pass ~14 ops a rope pixel, 5 a wall pixel
  g.cost.box += tests * 6 + writes * 7 + ink * 5 + wall * 2;
  g.cost.px += ink;
}
