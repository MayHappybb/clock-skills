// Crop-circle numerals for cropcircle.js: each digit is a formation built
// from the real vocabulary of the fields, used only where it belongs:
//   - lanes: 7 px paths and rings of flattened straw, combed in three lanes
//     laid in alternate directions, so the low sun shows them as light and
//     dark bands (like the stripes of a mown lawn)
//   - rings round standing islands for every bowl and counter (0 6 8 9, the
//     4's triangle)
//   - one proper swirled circle at each free end of a stroke, ~1.9x the lane
//     width, with a tiny standing tuft at its centre
// Joins are plain unions; no discs along the strokes.
//
// Built once at load into small tables per digit (GW x GH):
//   MASK   1 where the wheat is flattened (the edge wanders by under half a
//          pixel, like trampled stalks; hard, on purpose: the wall is crisp)
//   THETA  the lay direction of the flattened stalks, root to head, 0..255 = 0..2pi
//   STREAK 0..5, the comb ridge of alternate lanes plus a fine grain
// On the device these are flash tables: 10 x 29 x 56 x 3 bytes = 49 KB.

import { rand } from '../js/kit.js';

export const GW = 29, GH = 56;
const S = 7;      // lane width
const LANES = 3;  // combed lanes per lane width

// primitives:
//   ['P', x0, y0, x1, y1, w]       path, round ends (only ever hidden in a join or a circle)
//   ['B', x0, y0, x1, y1]          box, square ends, laid along x (the 1's foot)
//   ['A', cx, cy, r, w, a0, a1]    arc (clock degrees, 0 = up, clockwise)
//   ['O', x, y0, y1, r, w]         stadium ring (the 0)
//   ['T', cx, cy, r]               terminal circle: swirled, standing tuft at the centre
//   ['D', cx, cy, r]               swirled disc without a tuft (the colon)
const DIGITS = [
  // 0: a long ring round a standing island
  [['O', 14.5, 15, 41, 11, S]],
  // 1: a stem with a flag ending in a circle, on a flat foot
  [['P', 17, 3.5, 17, 50, S], ['P', 17, 5, 8, 13, 6], ['T', 7, 16, 6.5], ['B', 6.5, 48.5, 27.5, 55]],
  // 2: an arc, a diagonal and a base, circles at the two free ends
  [['A', 14.5, 15, 10.5, S, 285, 485], ['P', 23.1, 21, 5, 50.5, S], ['P', 5, 50.5, 21, 50.5, S],
    ['T', 7, 13, 6.5], ['T', 22, 49, 6.5]],
  // 3: two bowls meeting in a cusp, circles at the two free ends
  [['A', 14, 14, 10, S, 290, 560], ['A', 14, 40, 11, S, 340, 580], ['T', 7, 12, 6.5], ['T', 8, 48, 6.5]],
  // 4: a closed triangle (a standing island) on a stem ending in a circle
  [['P', 20.5, 4, 20.5, 46, S], ['P', 20.5, 4.5, 4.5, 36, S], ['P', 4.5, 36, 20.5, 36, S], ['T', 21, 49, 6.5]],
  // 5: a top bar ending in a circle, a drop and a big bowl ending in a circle
  [['P', 7.5, 5, 20, 5, S], ['P', 7.5, 5, 7, 28, S], ['A', 14, 39.5, 11, S, 318, 575],
    ['T', 22, 7, 6.5], ['T', 8, 48, 6.5]],
  // 6: a ring round an island, its long tail sweeping up into a circle
  [['A', 14.5, 40, 10.5, S, 0, 360], ['A', 42, 40, 38, S, 270, 327], ['T', 22, 8, 6.5]],
  // 7: a top bar and a long diagonal, circles at both free ends
  [['P', 9, 6, 24.5, 6, S], ['P', 24.5, 6, 12.5, 46, S], ['T', 7, 8, 6.5], ['T', 12, 49, 6.5]],
  // 8: two rings round islands, joined at the waist by a short path
  [['A', 14.5, 14, 9.5, S, 0, 360], ['A', 14.5, 40, 10.5, S, 0, 360], ['P', 14.5, 22, 14.5, 31, 6]],
  // 9: the 6 turned round
  null,
];
DIGITS[9] = DIGITS[6].map((p) => {
  const q = p.slice();
  q[1] = GW - p[1]; q[2] = GH - p[2];
  if (p[0] === 'A') { q[5] = p[5] + 180; q[6] = p[6] + 180; }
  return q;
});

const TAU = Math.PI * 2;
const laneOf = (u, w) => Math.max(0, Math.min(LANES - 1, Math.floor(((u + w / 2) / w) * LANES)));

/**
 * One primitive at (px, py): [sdf, lay angle, lane (-1: a swirl), tuft].
 * Lanes alternate their lay by half a turn.
 */
function prim(p, px, py) {
  switch (p[0]) {
    case 'P': {
      const [, x0, y0, x1, y1, w] = p, dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, len = Math.sqrt(l2);
      let u = ((px - x0) * dx + (py - y0) * dy) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(px - x0 - u * dx, py - y0 - u * dy);
      const across = ((px - x0) * -dy + (py - y0) * dx) / len;
      return [d - w / 2, Math.atan2(dy, dx), laneOf(across, w), 0];
    }
    case 'B': {
      const [, x0, y0, x1, y1] = p, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
      const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
      return [d, 0, laneOf(py - cy, y1 - y0), 0];
    }
    case 'A': {
      const [, cx, cy, r, w, a0, a1] = p, dx = px - cx, dy = py - cy, rr = Math.hypot(dx, dy);
      let d = Math.abs(rr - r) - w / 2;
      if (a1 - a0 < 360) {
        let ca = (Math.atan2(dx, -dy) * 180) / Math.PI - a0;
        ca = ((ca % 360) + 360) % 360;
        if (ca > a1 - a0) {
          const e = (a) => { const t = (a * Math.PI) / 180; return Math.hypot(px - (cx + r * Math.sin(t)), py - (cy - r * Math.cos(t))); };
          d = Math.min(e(a0), e(a1)) - w / 2;
        }
      }
      return [d, Math.atan2(dy, dx) + Math.PI / 2, laneOf(rr - r, w), 0];
    }
    case 'O': {
      const [, x, y0, y1, r, w] = p, cy = Math.min(Math.max(py, y0), y1), dx = px - x, dy = py - cy, rr = Math.hypot(dx, dy);
      return [Math.abs(rr - r) - w / 2, Math.atan2(dy, dx) + Math.PI / 2, laneOf(rr - r, w), 0];
    }
    case 'T': case 'D': {
      const [, cx, cy, r] = p, dx = px - cx, dy = py - cy, rr = Math.hypot(dx, dy);
      return [rr - r, Math.atan2(dy, dx) + Math.PI / 2 + 0.45, -1, p[0] === 'T' && rr < 1.25 ? 1 : 0];
    }
  }
  return [99, 0, 0, 0];
}

/** Lay tables for a list of primitives over a w x h box at (ox, oy). */
export function buildShape(P, w, h, seed, ox = 0, oy = 0) {
  const n = w * h, MASK = new Uint8Array(n), THETA = new Uint8Array(n), STREAK = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = ox + x + 0.5, py = oy + y + 0.5;
      let best = 99, ang = 0, lane = 0, tuft = 0;
      for (const p of P) {
        const [sd, a, l, t] = prim(p, px, py);
        if (t) tuft = 1;
        if (sd < best) { best = sd; ang = a; lane = l; }
      }
      const rough = (rand(x, y, 77 + seed) - 0.5) * 0.5;
      if (tuft || best + rough > 0) continue;
      const i = y * w + x;
      MASK[i] = 1;
      if (lane >= 0 && (lane & 1)) ang += Math.PI;
      let u = (ang / TAU) % 1; if (u < 0) u += 1;
      THETA[i] = (u * 256) & 255;
      STREAK[i] = ((lane >= 0 && (lane & 1) ? 4 : 0) + rand(x, y, 9 + seed) * 2.4) | 0;
    }
  return { MASK, THETA, STREAK };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => buildShape(DIGITS[d], GW, GH, d));

/** The colon: two small swirled discs, as one 12 x 18 shape. */
export const COLON_W = 12, COLON_H = 18;
export const COLON = buildShape([['D', 3.5, 3.5, 3.3], ['D', 8, 14.5, 3.3]], COLON_W, COLON_H, 11);
