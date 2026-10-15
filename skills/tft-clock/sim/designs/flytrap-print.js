// The press for "flytrap": a three-drum risograph.
//
// A frame is first composed as one byte map of MATERIALS (MB, the glass plus
// a 4 px margin), and every material says how much of each spot ink it takes
// (DP, DT, DY: 0 none .. 255 solid). Each ink is then "printed" through its
// own screen at its own registration offset: an ink lands on a pixel when the
// material's density beats that drum's threshold there. The thresholds are
// coarse round-dot halftones (pitch ~4 px, a different angle per drum, so
// tints read as riso dots even at true size), roughened, with ~3 % of
// dropouts where the drum starved (riso grain in the solids). Where inks
// cross they multiply over the paper, so three inks give eight colours and
// nothing else: that is the whole palette.
//
// Cost on the device: per glass pixel three material reads, three density
// lookups, three threshold compares and one palette store.

import { to565 } from '../js/kit.js';

export const W = 160, H = 80, PAD = 4, MW = W + 2 * PAD, MH = H + 2 * PAD, MN = MW * MH;
export const MB = new Uint8Array(MN);                 // the material map (RAM, 14.8 KB)
export const DP = new Uint8Array(64), DT = new Uint8Array(64), DY = new Uint8Array(64);

// ------------------------------------------------------------ the inks
// Riso Fluorescent Pink, Teal and Yellow as transmittances over the paper.
const INK = {
  P: [1.0, 0.30, 0.68],
  T: [0.13, 0.54, 0.58],
  Y: [1.0, 0.91, 0.06],
};
/** The eight colours: index = P | T << 1 | Y << 2. */
export function palette(paper) {
  const pal = new Uint16Array(8);
  for (let c = 0; c < 8; c++) {
    const v = paper.map((p, k) => {
      let t = p;
      if (c & 1) t *= INK.P[k];
      if (c & 2) t *= INK.T[k];
      if (c & 4) t *= INK.Y[k];
      return Math.round(Math.min(255, t));
    });
    pal[c] = to565((v[0] << 16) | (v[1] << 8) | v[2]);
  }
  return pal;
}
export const PAL_DAY = palette([246, 241, 229]);
export const PAL_NIGHT = palette([214, 206, 192]);

// ------------------------------------------------------------ the screens (flash: 3 x 14.8 KB)
function hash(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
function screen(angle, pitch, seed) {
  const th = new Uint8Array(MN), a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const u = (x * ca + y * sa) / pitch, v = (-x * sa + y * ca) / pitch;
      const f = (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v)) / 2;   // 1 at a dot centre
      const h = hash(x, y, seed);
      let t = Math.round(((1 - f) / 2) * 236 + 6 + ((h & 31) - 16) * 0.9);
      if ((h >>> 8) % 100 < 3) t = 255;          // a starved speck: never inks
      th[y * MW + x] = t < 1 ? 1 : t > 255 ? 255 : t;
    }
  return th;
}
export const THP = screen(45, 4.2, 1), THT = screen(72, 4.0, 2), THY = screen(12, 4.0, 3);

/**
 * Print MB onto the glass. (px, py), (tx, ty), (yx, yy): each drum's
 * registration offset in whole pixels, |v| <= PAD.
 */
export function print(buf, pal, px, py, tx, ty, yx, yy) {
  const oP = py * MW + px, oT = ty * MW + tx, oY = yy * MW + yx;
  let o = 0;
  for (let y = 0; y < H; y++) {
    let j = (y + PAD) * MW + PAD;
    for (let x = 0; x < W; x++, j++, o++) {
      const jp = j - oP, jt = j - oT, jy = j - oY;
      const c = (DP[MB[jp]] > THP[jp] ? 1 : 0) | (DT[MB[jt]] > THT[jt] ? 2 : 0) | (DY[MB[jy]] > THY[jy] ? 4 : 0);
      buf[o] = pal[c];
    }
  }
}

// ------------------------------------------------------------ drawing materials (glass coordinates)
// Each returns the number of pixels it scanned, for the cost estimate.

export function rectM(x0, y0, w, h, m) {
  let n = 0;
  const xa = Math.max(-PAD, x0), xb = Math.min(W + PAD, x0 + w), ya = Math.max(-PAD, y0), yb = Math.min(H + PAD, y0 + h);
  for (let y = ya; y < yb; y++) { const r = (y + PAD) * MW + PAD; for (let x = xa; x < xb; x++) MB[r + x] = m; n += xb - xa; }
  return n;
}
/** A filled ellipse, hard edge by pixel centre. */
export function ellM(cx, cy, rx, ry, m) {
  let n = 0;
  const y0 = Math.max(-PAD, Math.floor(cy - ry)), y1 = Math.min(H + PAD - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry, q = 1 - dy * dy;
    if (q <= 0) continue;
    const hw = rx * Math.sqrt(q);
    const xa = Math.max(-PAD, Math.round(cx - hw)), xb = Math.min(W + PAD, Math.round(cx + hw));
    const r = (y + PAD) * MW + PAD;
    for (let x = xa; x < xb; x++) MB[r + x] = m;
    n += xb - xa > 0 ? xb - xa : 0;
  }
  return n + 8;
}
/** A line `w` px thick (square-ish ends), by stepping discs along it. */
export function lineM(x0, y0, x1, y1, w, m) {
  const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(L));
  let n = 0;
  const r = w / 2;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    if (w <= 1.2) { n += dotM(Math.floor(cx), Math.floor(cy), m); continue; }
    n += ellM(cx, cy, r, r, m);
  }
  return n;
}
export function dotM(x, y, m) {
  if (x < -PAD || y < -PAD || x >= W + PAD || y >= H + PAD) return 1;
  MB[(y + PAD) * MW + PAD + x] = m;
  return 1;
}
