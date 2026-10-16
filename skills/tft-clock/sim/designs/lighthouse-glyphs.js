// lighthouse numerals: one continuous lamp-filament line per stroke, the shape
// a hot wire leaves on the retina. Each digit is a skeleton (polylines in an
// 18 x 30 design box) turned, once at load, into a byte distance field at the
// size it is shown. The afterimage pass (lighthouse.js) looks the distance up
// per pixel and maps it through a per-frame colour table, so blur, fringe and
// the flight of colours cost a table lookup, not geometry.

import { segDist } from '../js/kit.js';

// Points on an ellipse arc, screen angles in degrees (0 = right, 90 = down).
function arc(cx, cy, rx, ry, a0, a1, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const join = (...parts) => parts.flat();
const flip = (strokes) => strokes.map((s) => s.map(([x, y]) => [18 - x, 30 - y]));

// The 6: a falling sweep that winds into its bowl.
const SIX = [join(
  [[15.5, 2.0], [11.5, 3.0], [7.0, 6.5], [3.6, 11.5], [1.8, 16.5]],
  arc(9.2, 21.6, 7.4, 7.4, 172, 532, 22),
)];

/** Skeletons: per digit, a list of polylines in an 18 x 30 box. */
export const SKELETONS = {
  0: [arc(9, 15, 7.8, 13.6, 0, 360, 28)],
  1: [[[3.6, 7.6], [7.4, 4.6], [10.4, 1.4], [10.4, 28.8]], [[5.2, 28.8], [15.6, 28.8]]],
  2: [join(arc(9, 8.8, 7.4, 7.4, 190, 395, 14), [[3.0, 23.0], [1.4, 28.8], [16.8, 28.8]])],
  3: [join(arc(8.8, 7.9, 6.6, 6.6, 205, 450, 12), arc(8.8, 21.6, 7.6, 7.3, 270, 515, 14))],
  4: [[[12.6, 29.0], [12.6, 1.4], [1.2, 20.8], [17.2, 20.8]]],
  5: [join([[16.2, 1.4], [3.8, 1.4], [2.8, 14.2]], arc(9.2, 20.6, 7.6, 8.2, 222, 510, 16))],
  6: SIX,
  7: [[[1.4, 1.4], [16.8, 1.4], [14.0, 6.0], [10.8, 12.5], [8.6, 20.0], [7.6, 28.8]]],
  8: [arc(9, 7.6, 6.2, 6.2, 0, 360, 20), arc(9, 21.4, 7.8, 7.6, 0, 360, 24)],
  9: flip(SIX),
};

export const DW = 18, DH = 30;
/** Margin of the field round the digit, px (the widest halo plus a jump). */
export const MARGIN = 8;
/** Distance quantisation: field value = distance * Q. */
export const Q = 8;

/**
 * Bake the ten digits at `scale`: { w, h, f: Uint8Array } per digit, where
 * f is the distance (x Q, capped at 255) from each pixel centre to the
 * stroke's centre line, the box starting MARGIN px left of and above the
 * design box.
 */
export function bake(scale) {
  const out = {};
  for (let d = 0; d <= 9; d++) {
    const w = Math.ceil(DW * scale) + 2 * MARGIN, h = Math.ceil(DH * scale) + 2 * MARGIN;
    const f = new Uint8Array(w * h);
    const segs = [];
    for (const s of SKELETONS[d])
      for (let i = 1; i < s.length; i++)
        segs.push([s[i - 1][0] * scale + MARGIN, s[i - 1][1] * scale + MARGIN, s[i][0] * scale + MARGIN, s[i][1] * scale + MARGIN]);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let best = 1e9;
        for (const [ax, ay, bx, by] of segs) {
          const e = segDist(x + 0.5, y + 0.5, ax, ay, bx, by);
          if (e < best) best = e;
        }
        f[y * w + x] = Math.min(255, Math.round(best * Q));
      }
    out[d] = { w, h, f };
  }
  return out;
}
