// Shadowplay's numerals: each digit is a jointed leather puppet, cut as a few
// strips (stem, bowl, flag, foot) tied together at joints. The first strip is
// the root, held by the rod at its pivot; every other strip hangs from its
// parent at its own first point, so it can swing there, or come apart.
import { Piece } from './shadowplay-cloth.js';

const rad = Math.PI / 180;
/** Points of an elliptical arc, degrees, y down (90 = bottom). */
function arc(cx, cy, rx, ry, a0, a1, step = 0.045) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * rad * (rx + ry)) / 2 / step));
  const out = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + ((a1 - a0) * k) / n) * rad; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
const L = (...p) => p;

// Strips in a box 0.56 wide, 1 tall; the stroke centre runs 0.075 in from the edge.
// { p: points, par: parent (default previous), pv: pivot (default first point), rod: rod point (root) }
const GLYPHS = {
  0: [
    { p: arc(0.28, 0.5, 0.205, 0.425, 90, -90), pv: [0.28, 0.925] },
    { p: arc(0.28, 0.5, 0.205, 0.425, 90, 270), par: 0 },
  ],
  1: [
    { p: L([0.11, 0.925], [0.5, 0.925]), pv: [0.31, 0.925] },
    { p: L([0.31, 0.925], [0.31, 0.075]), par: 0 },
    { p: L([0.31, 0.08], [0.2, 0.17], [0.08, 0.24]), par: 1 },
  ],
  2: [
    { p: L([0.075, 0.925], [0.49, 0.925]), pv: [0.27, 0.925] },
    { p: L([0.075, 0.925], [0.26, 0.69], [0.437, 0.445]), par: 0 },
    { p: arc(0.28, 0.3, 0.205, 0.225, 400, 190), par: 1 },
  ],
  3: [
    { p: arc(0.27, 0.69, 0.215, 0.235, 270, 518), pv: [0.27, 0.925] },
    { p: arc(0.265, 0.27, 0.185, 0.195, 90, -150), par: 0 },
  ],
  4: [
    { p: L([0.39, 0.925], [0.39, 0.075]), pv: [0.39, 0.925] },
    { p: L([0.39, 0.075], [0.075, 0.64]), par: 0 },
    { p: L([0.075, 0.64], [0.5, 0.64]), par: 1 },
  ],
  5: [
    { p: arc(0.265, 0.665, 0.22, 0.26, 500, 222), pv: [0.265, 0.925] },
    { p: L([0.105, 0.47], [0.11, 0.075]), par: 0 },
    { p: L([0.11, 0.075], [0.49, 0.075]), par: 1 },
  ],
  6: [
    { p: arc(0.285, 0.685, 0.21, 0.24, 180, 540), pv: [0.285, 0.925] },
    { p: L([0.075, 0.66], [0.09, 0.42], [0.17, 0.24], [0.3, 0.12], [0.46, 0.075]), par: 0 },
  ],
  7: [
    { p: L([0.2, 0.925], [0.27, 0.6], [0.485, 0.075]), pv: [0.2, 0.925] },
    { p: L([0.485, 0.075], [0.075, 0.075]), par: 0 },
  ],
  8: [
    { p: arc(0.28, 0.7, 0.205, 0.225, 270, 630), pv: [0.28, 0.925] },
    { p: arc(0.28, 0.27, 0.17, 0.195, 90, 450), par: 0 },
  ],
  9: [
    { p: L([0.1, 0.925], [0.3, 0.88], [0.44, 0.72], [0.485, 0.32]), pv: [0.1, 0.925] },
    { p: arc(0.275, 0.315, 0.21, 0.24, 0, 360), par: 0 },
  ],
};
export const ASPECT = 0.56;

/**
 * The puppet for digit d at height h px: parts with a Piece in px relative
 * to its pivot, the pivot in glyph px (top-left origin), parent index (-1
 * root) and the strip's centre (for flying apart).
 */
export function puppet(d, h, hwFrac, col, pat, sp, hr) {
  const def = GLYPHS[d];
  return def.map((s, i) => {
    const pv = s.pv ?? s.p[0];
    const pts = [];
    let mx = 0, my = 0;
    for (const [x, y] of s.p) { pts.push((x - pv[0]) * h, (y - pv[1]) * h); mx += x; my += y; }
    mx /= s.p.length; my /= s.p.length;
    const pc = new Piece(0, pts, hwFrac * h, col, pat, sp, hr);
    pc.knob = 0.32;
    return {
      pc,
      px: pv[0] * h, py: pv[1] * h,
      par: i === 0 ? -1 : s.par ?? i - 1,
      cx: mx * h, cy: my * h,
    };
  });
}
