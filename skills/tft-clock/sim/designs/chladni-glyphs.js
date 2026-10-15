// Chladni numerals: ten digits drawn as nodal figures. Every stroke is a
// smooth standing-wave curve (arcs of big circles, spirals, a figure-eight),
// and wherever two strokes meet they cross and run on a little, the way two
// nodal lines cross on a plate: lens tips on the 0, a crossed waist on the 3
// and 8, crossed bars on 2, 4, 5 and 7. 6 and 9 are one figure turned half
// round, as a plate's figures are.
//
// Designed on a 10 x 22 unit box, rasterised once at load into a 40 x 74 px
// table per digit (the 28 x 62 px numeral plus a 6 px margin):
//   mask  (build time only) the sand, as light added to the value buffer: a ridge
//         with a brighter crest, grain texture, and loose grains scattered at
//         its foot (real Chladni ridges are fuzzy)
//   moat  0..255, the bare ring of plate around the ridge where the sand was
//         pulled in from: suppresses the background figure, carries the glow
//   grains the mask's pixels as a list (box index, light): what flies at a turn
// Flash: 10 moats x 2960 B + 7.9k grains x 5 B (index, light, throw), about 69 KB.

import { rand } from '../js/kit.js';

export const GW = 28, GH = 62, MARGIN = 6;
export const BW = GW + 2 * MARGIN, BH = GH + 2 * MARGIN;
const SX = 2.75, SY = 2.78, OX = MARGIN + 0.25, OY = MARGIN + 0.4;
const RAD = 1.9, TAPER = 5;      // ridge half-width, px; taper length at free ends

// ------------------------------------------------------------ curve helpers (unit box)

function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** Catmull-Rom through the points, `closed` for a loop. */
function spline(p, closed = false, n = 10) {
  const out = [], m = p.length;
  const at = (i) => (closed ? p[(i + m) % m] : p[Math.max(0, Math.min(m - 1, i))]);
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(closed ? p[0] : p[m - 1]);
  return out;
}

const line = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];
const rot = (strokes) => strokes.map((s) => s.map(([x, y]) => [10 - x, 22 - y]));

// lens 0: two arcs of big circles meeting in points, crossing past the tips
function lensArc(side) {
  // circle through (5, 0.4) and (5, 21.6) whose extreme is at x = 5 -/+ 4.6
  const h = 10.6, w = 4.6, k = (h * h - w * w) / (2 * w), R = k + w;
  const cx = 5 - side * k, a = (Math.asin((h + 0.75) / R) * 180) / Math.PI;
  return arc(cx, 11, R, R, side > 0 ? -a : 180 - a, side > 0 ? a : 180 + a, 40);
}

const SIX = [
  spline([[9.0, 1.3], [5.2, 1.4], [2.2, 4.6], [0.7, 10.5], [0.9, 16.4], [3.2, 20.9], [6.6, 21.2], [9.4, 18.4], [9.5, 14.0], [7.0, 11.3], [3.6, 11.6], [1.0, 14.6], [-0.2, 16.4]]),
];

export const STROKES = {
  0: [lensArc(-1), lensArc(1)],
  1: [
    line(5.9, 0.6, 5.9, 21.4),
    spline([[5.9, 0.6], [4.2, 2.6], [1.6, 4.4]]),
    spline([[2.3, 21.0], [5.9, 21.6], [9.5, 21.0]]),
  ],
  2: [
    spline([[0.7, 6.6], [1.4, 2.6], [5.0, 0.7], [8.6, 2.2], [9.5, 6.0], [7.8, 10.4], [3.6, 15.2], [1.0, 19.4], [0.8, 21.4]]),
    line(-0.6, 21.0, 10.2, 21.0),
  ],
  3: [
    spline([[0.6, 3.6], [3.0, 0.8], [7.0, 0.9], [9.1, 3.8], [8.6, 7.6], [5.4, 10.0], [2.0, 11.4], [0.2, 12.0]]),
    spline([[0.2, 9.6], [2.6, 10.4], [7.0, 11.0], [9.8, 14.4], [9.4, 19.0], [5.4, 21.5], [1.6, 20.6], [0.0, 18.0]]),
  ],
  4: [
    spline([[5.0, 0.6], [3.2, 6.0], [1.4, 10.6], [0.4, 15.0]]),
    line(-0.6, 15.0, 10.4, 15.0),
    line(7.8, 5.2, 7.8, 21.5),
  ],
  5: [
    line(1.2, 1.2, 10.0, 1.2),
    spline([[2.6, -0.2], [2.3, 4.0], [1.8, 10.0]]),
    spline([[1.8, 10.0], [5.4, 8.6], [8.9, 10.4], [10.0, 14.8], [8.8, 19.6], [5.0, 21.5], [1.6, 20.6], [0.0, 17.6]]),
  ],
  6: SIX,
  7: [
    line(-0.2, 1.2, 10.0, 1.2),
    spline([[10.0, 1.2], [7.4, 7.2], [5.0, 14.2], [3.8, 21.5]]),
    line(3.4, 11.4, 9.6, 11.4),
  ],
  8: [
    spline([[5.0, 10.2], [8.4, 7.6], [8.8, 3.4], [5.0, 0.7], [1.2, 3.4], [1.6, 7.6], [5.0, 10.2], [9.0, 13.2], [9.8, 17.8], [5.0, 21.4], [0.2, 17.8], [1.0, 13.2]], true),
  ],
  9: rot(SIX),
};

// ------------------------------------------------------------ rasterising

function segDistU(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return [ex * ex + ey * ey, u];
}

function build(d) {
  // each segment carries the ridge's half-width there: full along the stroke,
  // thinning over the last ~4 px of a free end, as sand runs out at a line's tip
  const segs = [];
  for (const s of STROKES[d]) {
    const closed = s.length > 2 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 0.01;
    const P = s.map(([x, y]) => [OX + x * SX, OY + y * SY]), acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const len = acc[acc.length - 1];
    const wid = (a) => (closed ? RAD : RAD * (0.55 + 0.45 * Math.min(1, a / TAPER, (len - a) / TAPER)));
    for (let i = 1; i < P.length; i++) segs.push([P[i - 1][0], P[i - 1][1], P[i][0], P[i][1], wid(acc[i - 1]), wid(acc[i])]);
  }
  const mask = new Uint8Array(BW * BH), moat = new Uint8Array(BW * BH);
  const idx = [], val = [];
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      // distance in units of the local half-width, scaled back to px at full width
      let m = Infinity;
      for (const s of segs) {
        const [e, u] = segDistU(x + 0.5, y + 0.5, s[0], s[1], s[2], s[3]);
        const r = s[4] + (s[5] - s[4]) * u, v = Math.sqrt(e) - r + RAD;
        if (v < m) m = v;
      }
      const dist = Math.max(0, m), i = y * BW + x;
      const grain = rand(x, y, 71 + d), tex = 0.8 + 0.2 * rand(x, y, 13 + d);
      let v = 0;
      if (dist <= RAD) v = (168 + 40 * (1 - dist / RAD) ** 1.5) * tex;
      else if (dist < RAD + 1) v = 168 * (RAD + 1 - dist) * tex;
      if (dist > RAD + 0.6 && dist < RAD + 3.6) {                      // loose grains at the ridge's foot
        const p = 0.34 * (1 - (dist - RAD - 0.6) / 3);
        if (grain < p) v = Math.max(v, 70 + 70 * rand(x, y, 29 + d));
      }
      mask[i] = Math.round(Math.min(230, v));
      moat[i] = Math.round(255 * Math.max(0, Math.min(1, (RAD + 5.5 - dist) / 3.5)));
      if (mask[i] > 0) { idx.push(i); val.push(mask[i]); }
    }
  // where each grain is thrown when the plate shakes: outward from the
  // numeral's middle (so counters and open sides empty first, never fill),
  // tipped upward, with a random kick; 12-34 px, stored as int8 px
  const n = idx.length, ox = new Int8Array(n), oy = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const x = idx[k] % BW, y = (idx[k] / BW) | 0;
    let rx = x + 0.5 - BW / 2, ry = (y + 0.5 - BH / 2) * 0.45;
    const l = Math.hypot(rx, ry) || 1, a = rand(k, d, 61) * Math.PI * 2, D = 12 + 22 * rand(k, d, 62);
    rx = rx / l + 0.55 * Math.cos(a); ry = ry / l + 0.55 * Math.sin(a) - 0.35;
    const m = Math.hypot(rx, ry) || 1;
    ox[k] = Math.round((rx / m) * D); oy[k] = Math.round((ry / m) * D);
  }
  return { mask, moat, gi: Uint16Array.from(idx), gv: Uint8Array.from(val), ox, oy, n };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
export const GRAIN_MAX = Math.max(...GLYPHS.map((g) => g.n));
