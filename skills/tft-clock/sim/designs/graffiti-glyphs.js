// The letters of "graffiti": ten numerals drawn as a semi-wildstyle piece.
// Each digit is a set of centre lines (straight runs and squarish
// superellipse bowls, so the counters are fat bubble-boxes, not circles),
// stroked R = 3.6 px with round ends, slanted forward 0.15 (a piece leans
// into its own motion), with a few wildstyle arrows on safe terminals (the
// 2's base, the 5's top bar, the 7's bar, the 1's flag, the 6's and 9's
// tails: always pointing out of the digit, never closing a counter).
//
// At load each digit becomes a signed distance field (Int8, 1/8 px units)
// on a 44 x 52 grid that also covers the outline, the 3D block and the
// cutback border: 2.3 KB a digit, 23 KB of flash for the set. From the same
// field come, per digit:
//   SHINE   the highlight dashes along the upper-left inner edge (bitmask)
//   DRIPS   candidate drip sources: the low points of the bottom edge
//   STAR    where the shine star pops (an upper-left fill point)
import { polygonDist } from '../js/kit.js';

export const SW = 18, SH = 34;          // skeleton box, glyph units (= px at scale 1)
export const M = 9;                     // grid margin
export const GW = 44, GH = SH + 2 * M;  // grid: u in [-M, GW - M), v in [-M, SH + M)
export const R = 3.6, SLANT = 0.15;

const rad = (a) => (a * Math.PI) / 180;
/** A squarish bowl: superellipse arc, angles in degrees (0 right, 90 down: clockwise on screen). */
function se(cx, cy, rx, ry, a0, a1, n = 2.7, steps = 44) {
  const pts = [], e = 2 / n;
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / steps), c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e]);
  }
  return pts;
}
/** A plain elliptic arc. */
function el(cx, cy, rx, ry, a0, a1, steps = 30) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / steps);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

// centre lines per digit, and arrowheads [tipX, tipY, dirX, dirY] (unslanted glyph units)
const SKEL = {
  0: [se(9, 17, 9, 17, 0, 360, 2.7, 72)],
  1: [[[3.4, 7.6], [11, 0.6]], [[11, 0.6], [11, 33.4]]],
  2: [[...se(9, 9, 9, 8.6, 186, 378), [0.6, 33.4], [14.5, 33.4]]],
  3: [se(8.6, 8.4, 8.6, 7.9, 205, 450), [[4.2, 16.3], [8.6, 16.3]], se(9, 25.2, 9, 8.6, 270, 520)],
  4: [[[2.4, 0.6], [1.0, 21.6], [18, 21.6]], [[13.2, 8.5], [13.2, 33.4]]],
  5: [[[13.5, 0.6], [2.4, 0.6], [1.8, 15.2]], se(9, 23.6, 9, 9.9, 228, 518)],
  6: [se(9, 24.6, 9, 9.2, 0, 360, 2.7, 56), el(18.4, 24.6, 18.4, 23.6, 180, 252)],
  7: [[[4.0, 0.6], [18, 0.6], [6.6, 33.4]]],
  8: [se(9, 8.3, 7.8, 7.7, 0, 360, 2.7, 56), se(9, 25.1, 9, 8.6, 0, 360, 2.7, 56)],
  9: [se(9, 9.4, 9, 9.2, 0, 360, 2.7, 56), el(-0.4, 9.4, 18.4, 23.6, 0, 72)],
};
const ARROW = {
  2: [[23.5, 33.4, 1, 0]],
  5: [[22.5, 0.6, 1, 0]],
  7: [[-4.5, 0.6, -1, 0]],
};

const slant = (p) => [p[0] + SLANT * (SH - p[1]), p[1]];

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** A wildstyle arrowhead: a fat triangle, tip at (tx, ty), pointing (dx, dy). */
function head(tx, ty, dx, dy) {
  const L = 7.4, Wd = 5.6, bx = tx - dx * L, by = ty - dy * L, nx = -dy, ny = dx;
  return [[tx, ty], [bx + nx * Wd, by + ny * Wd], [bx + dx * 1.6, by + dy * 1.6], [bx - nx * Wd, by - ny * Wd]].map(slant);
}

export const SDF = [], SHINE = [], DRIPS = [], STAR = [];
for (let d = 0; d < 10; d++) {
  const lines = SKEL[d].map((pl) => pl.map(slant));
  const heads = (ARROW[d] ?? []).map((a) => head(...a));
  const f = new Int8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const px = i + 0.5 - M, py = j + 0.5 - M;
      let best = 1e9;
      for (const pl of lines) for (let k = 1; k < pl.length; k++) {
        const e = segD(px, py, pl[k - 1][0], pl[k - 1][1], pl[k][0], pl[k][1]);
        if (e < best) best = e;
      }
      let v = best - R;
      for (const h of heads) { const e = polygonDist(px, py, h) - 0.4; if (e < v) v = e; }
      const q = Math.round(v * 8);
      f[j * GW + i] = q < -127 ? -127 : q > 127 ? 127 : q;
    }
  SDF.push(f);

  // highlight dashes: fill pixels whose upper-left neighbour 1.5 px away is outside the fill
  const s = new Uint8Array(GW * GH);
  const at = (i, j) => (i < 0 || j < 0 || i >= GW || j >= GH ? 127 : f[j * GW + i]);
  for (let j = 1; j < GH; j++)
    for (let i = 1; i < GW; i++) {
      const k = j * GW + i;
      if (f[k] > -6 || f[k] < -17) continue;
      if (at(i - 1, j - 1) >= -2 || at(i - 2, j - 1) >= -2 || at(i - 1, j - 2) >= -2) s[k] = (i + j) % 9 < 5 ? 1 : 0;
    }
  SHINE.push(s);

  // drip sources: local low points of the bottom edge in the lower half
  const bottom = new Int16Array(GW).fill(-1);
  for (let i = 0; i < GW; i++) for (let j = GH - 1; j >= 0; j--) if (f[j * GW + i] < -4) { bottom[i] = j; break; }
  const drips = [];
  for (let i = 2; i < GW - 2; i++) {
    const b = bottom[i];
    if (b < M + 30) continue;
    let top = true;
    for (let k = -3; k <= 3; k++) if (k && i + k >= 0 && i + k < GW && bottom[i + k] > b) top = false;
    if (top && !drips.some((p) => Math.abs(p[0] - (i - M)) < 5)) drips.push([i - M + 0.5, b - M + 1]);
  }
  DRIPS.push(drips);

  // the star: the most upper-left fill point, pulled 2 px inside
  let bi = 0, bj = 0, bs = 1e9;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (f[j * GW + i] < -10 && i + j * 1.2 < bs) { bs = i + j * 1.2; bi = i; bj = j; }
  STAR.push([bi - M + 0.5, bj - M + 0.5]);
}

/** Bilinear sample of field f at glyph (u, v), in 1/8 px; off the grid: far outside. */
export function sample(f, u, v) {
  const x = u + M - 0.5, y = v + M - 0.5;
  if (x < 0 || y < 0 || x >= GW - 1 || y >= GH - 1) return 127;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, k = iy * GW + ix;
  const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + GW] + (f[k + GW + 1] - f[k + GW]) * fx;
  return a + (b - a) * fy;
}

/** The ink extent of the whole set at scale 1 (outline, block and border included): [u0, u1, v0, v1]. */
export const EXT = (() => {
  let u0 = 99, u1 = -99, v0 = 99, v1 = -99;
  for (const f of SDF)
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++)
        if (f[j * GW + i] < 3.4 * 8) { u0 = Math.min(u0, i - M); u1 = Math.max(u1, i - M + 1); v0 = Math.min(v0, j - M); v1 = Math.max(v1, j - M + 1); }
  return [u0, u1 + 1.6, v0, v1 + 2.4];
})();
