// kaleidoscope: the mirrors. Two ways of folding the object cell into the
// eyepiece, both per pixel, both reading a cached picture of the cell:
//
//   polar(): two mirrors hinged at the screen centre, opening angle `alpha`.
//     alpha = 2 pi is no mirror at all (you see the cell as it is); as it
//     closes, a reflected wedge sweeps in, and at 2 pi / n there are n
//     images round the centre. Every wedge is one rotation or one
//     reflection of the cell, set up once a frame, so the per-pixel work is
//     a table lookup, a compare and a 2x2 multiply.
//
//   triangle(): three mirrors in an equilateral triangle round the centre
//     (the classic three-mirror scope that tiles the whole field). Side
//     huge = no mirror; as the triangle shrinks, its images tile the strip.
//     Per pixel: into lattice coordinates, one translation by the lattice
//     (closed form), then at most a few reflections into the triangle.
//
// Light is lost at every bounce, so images further from the direct view
// are dimmer (a real scope does this); the mirror edges show as faint dark
// seams.

import { CX, CY } from './kaleidoscope-glass.js';

export const W = 160, H = 80;
// The cell's cache canvas: 184 x 184, centred on the screen centre.
export const CC = 184, COFF = 92;
export const OX = COFF - CX, OY = COFF - CY;

// Per-pixel tables, built once: angle (0..2pi) and radius from the centre,
// and an eyepiece vignette weight.
const TH = new Float32Array(W * H), RR = new Float32Array(W * H), VIG = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    const r = Math.sqrt(dx * dx + dy * dy);
    TH[y * W + x] = a; RR[y * W + x] = r;
    const v = Math.min(1, Math.max(0, (r - 50) / 40));
    VIG[y * W + x] = v * v * (3 - 2 * v);
  }

// Light kept per reflection.
const KEEP = 0.94;
const DIM = Float32Array.from({ length: 64 }, (_, n) => Math.pow(KEEP, n));

/** Sample the cache at offset (sx, sy) from the centre, as 0xRRGGBB scaled by k. */
function sample(buf, sx, sy, k) {
  let ix = (sx + COFF) | 0, iy = (sy + COFF) | 0;
  if (ix < 0) ix = 0; else if (ix >= CC) ix = CC - 1;
  if (iy < 0) iy = 0; else if (iy >= CC) iy = CC - 1;
  const v = buf[iy * CC + ix];
  const r = ((v >> 11) & 31) * 8.226, gg = ((v >> 5) & 63) * 4.048, b = (v & 31) * 8.226;
  return (((r * k) | 0) << 16) | (((gg * k) | 0) << 8) | ((b * k) | 0);
}

/**
 * Fold with two mirrors. `psi` is the direction the direct view looks
 * along; `alpha` the mirrors' opening; `depth` 0..1 scales the seams and
 * the eyepiece vignette.
 */
export function polar(g, cell, { psi, alpha, depth, sin, cos }) {
  const TAU = Math.PI * 2;
  const phi = psi - alpha / 2;
  const m = Math.ceil(TAU / alpha - 1e-6);
  // one 2x2 per wedge, and its light
  const M = new Float32Array(m * 4), K = new Float32Array(m), WD = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    if (k % 2 === 0) {
      const gma = -k * alpha, c = cos(gma), s = sin(gma);
      M[k * 4] = c; M[k * 4 + 1] = -s; M[k * 4 + 2] = s; M[k * 4 + 3] = c;
    } else {
      const beta = phi + ((k + 1) * alpha) / 2, c = cos(2 * beta), s = sin(2 * beta);
      M[k * 4] = c; M[k * 4 + 1] = s; M[k * 4 + 2] = s; M[k * 4 + 3] = -c;
    }
    K[k] = DIM[Math.min(k, m - k)];
    WD[k] = Math.min(alpha, TAU - k * alpha);
  }
  const buf = cell.buf, seam = 0.45 * depth, vig = 0.35 * depth;
  let ph = phi % TAU; if (ph < 0) ph += TAU;
  const inv = 1 / alpha;
  g.paint((px, py, x, y) => {
    const i = y * W + x;
    let th = TH[i] - ph;
    if (th < 0) th += TAU;
    let k = (th * inv) | 0;
    if (k >= m) k = m - 1;
    const dx = px - CX, dy = py - CY, o = k * 4;
    const sx = M[o] * dx + M[o + 1] * dy, sy = M[o + 2] * dx + M[o + 3] * dy;
    let f = K[k] * (1 - vig * VIG[i]);
    // the mirror edge: a fine dark seam
    const fr = th - k * alpha, ed = (fr < WD[k] - fr ? fr : WD[k] - fr) * RR[i];
    if (ed < 1 && m > 1) f *= 1 - seam * (1 - ed);
    return sample(buf, sx, sy, f);
  });
}

/**
 * Fold with three mirrors in an equilateral triangle centred on the screen.
 * `h` is the triangle's height in pixels, `rho` its rotation.
 */
export function triangle(g, cell, { h, rho, depth, sin, cos }) {
  const c = cos(rho), s = sin(rho), ih = 1 / h, R3 = Math.sqrt(3) / 2, I3 = 1 / Math.sqrt(3);
  const buf = cell.buf, seam = 0.45 * depth, vig = 0.35 * depth;
  g.paint((px, py, x, y) => {
    const i = y * W + x;
    const dx = px - CX, dy = py - CY;
    const u = c * dx + s * dy, v = -s * dx + c * dy;
    // lattice levels: the three mirror families are l1, l2, l3 = whole numbers
    let l1 = v * ih + 1 / 3, l2 = (R3 * u - 0.5 * v) * ih + 1 / 3;
    // translate by the group's lattice (two reflections each)
    let ta = (2 * l1 + l2) / 3, tb = (l1 + 2 * l2) / 3;
    let a = ta | 0; if (ta < a) a--;
    let b = tb | 0; if (tb < b) b--;
    l1 -= 2 * a - b; l2 -= 2 * b - a;
    let n = 2 * ((a < 0 ? -a : a) + (b < 0 ? -b : b));
    // then reflect into the triangle l1 >= 0, l2 >= 0, l1 + l2 <= 1
    for (let it = 0; it < 6; it++) {
      if (l1 < 0) { l2 += l1; l1 = -l1; n++; }
      else if (l2 < 0) { l1 += l2; l2 = -l2; n++; }
      else if (l1 + l2 > 1) { const e = l1 + l2 - 1; l1 -= e; l2 -= e; n++; }
      else break;
    }
    // back to pixels
    const v2 = (l1 - 1 / 3) * h, u2 = ((l2 - 1 / 3) * h + 0.5 * v2) * 2 * I3;
    const sx = c * u2 - s * v2, sy = s * u2 + c * v2;
    let f = DIM[n < 63 ? n : 63] * (1 - vig * VIG[i]);
    const ed = (l1 < l2 ? (l1 < 1 - l1 - l2 ? l1 : 1 - l1 - l2) : (l2 < 1 - l1 - l2 ? l2 : 1 - l1 - l2)) * h;
    if (ed < 1) f *= 1 - seam * (1 - ed);
    return sample(buf, sx, sy, f);
  });
}
