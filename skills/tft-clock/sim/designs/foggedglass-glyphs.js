// Fogged Glass: the numerals as a finger writes them in condensation.
//
// Each digit is one or two finger strokes: a centre line (Catmull-Rom through
// hand-placed points, corners where a pen would turn sharp) swept by a round
// fingertip about 6 px wide, a little fatter where the finger lands and a
// little thinner where it lifts, slanted like quick handwriting. All ten are
// drawn as a set in a 17 x 38 box: open counters at least 5 x 10 px, a 1
// with a flag, an open 4 with its bar through the stem, a 5 written in one
// go (bar, down, bowl), an 8 as two loops from the waist.
//
// Baked at load into two byte fields per digit (flash):
//   D  signed distance to the wiped edge, quarter pixels (negative = clear),
//      with a little static noise so the edge is ragged like real wiped fog
//   T  arclength along the writing (px) at which the fingertip first reaches
//      the pixel: inside the stroke, when its centre is wiped; in the rim
//      band just outside, when the pushed water ridge forms there
// So writing is "clear where T <= front", re-fogging is "clear where
// D < -creep", and a glint can run along the stroke as |T - g| < w.

import { hash } from '../js/kit.js';

export const CW = 17, CH = 38;          // centre-line box
export const SLANT = 0.12;              // italic shear, px per px of height
export const R0 = 3.1;                  // fingertip radius
export const FW = 36, FH = 54;          // field box
export const OX = 7, OY = 7;            // centre-line origin inside the field box
const LIFT = 8;                          // arclength the finger "spends" moving between strokes

// Points are [u, v] in the centre-line box (v down); a third entry 1 marks a sharp corner.
const PATHS = {
  0: [[[9.5, 0.6], [3.6, 2.6], [0.6, 11], [0.5, 25], [3.4, 35.5], [9, 37.6], [14.2, 34], [16.4, 24], [16.3, 11], [13.6, 2.8], [8.6, 0.6], [5.6, 2.2]]],
  1: [[[0.6, 11.6], [9.8, 0.6, 1], [9.4, 19], [8.8, 37.6]]],
  2: [[[1.4, 8.4], [4.4, 2], [9.6, 0.6], [14.6, 3.6], [15.6, 10.4], [12.4, 18.4], [6.6, 27], [0.8, 37.4, 1], [16.4, 37]]],
  3: [[[1.2, 4.6], [6.4, 0.7], [12.4, 1.4], [15.4, 6.4], [13.4, 13.4], [6.8, 18.2, 1], [13.4, 20.6], [16.4, 27.4], [13.6, 35], [7.4, 37.8], [0.8, 34.6]]],
  4: [[[4, 0.6], [2.2, 12], [0.4, 25.4, 1], [17.4, 25.2]], [[13.4, 1.4], [13, 20], [12.4, 37.8]]],
  5: [[[16, 0.9], [4.2, 1, 1], [2.8, 16.6, 1], [8.8, 13.8], [14.4, 16.6], [16.6, 25], [14, 34], [7.6, 37.8], [1, 34.4]]],
  6: [[[14.6, 2.6], [9.4, 0.5], [4, 4], [0.9, 14], [0.7, 26], [3.8, 35.6], [9.6, 37.8], [14.8, 34], [16.4, 26.6], [13.4, 19.6], [7.6, 18.4], [2.6, 21.6], [1, 27.4]]],
  7: [[[0.4, 1.4], [16.8, 0.8, 1], [11.6, 14.6], [8, 25.4], [5.6, 37.8]]],
  8: [[[8.6, 18], [3.6, 13.4], [2.2, 6], [5.4, 1], [11.6, 0.6], [15, 5.4], [13.6, 12.6], [8.6, 18], [2.6, 23.6], [1.4, 31], [4.6, 37], [10.6, 37.8], [15.4, 33], [15.2, 25], [11, 20], [6.6, 16]]],
  9: [[[15, 6.4], [10.4, 0.8], [3.8, 2.4], [0.8, 9.8], [3.4, 17.6], [9.6, 19.2], [14.8, 13.4], [15.8, 3.2, 1], [15, 20], [12.6, 37.8]]],
};
// the colon: two dabs, placed in its own field
const COLON = [[[8, 12.5], [8, 12.5]], [[8, 26.5], [8, 26.5]]];

// ------------------------------------------------------------ path sampling

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** Dense samples of one stroke: split at corners, a spline through each run. */
function sampleStroke(pts) {
  const runs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (pts[i][2] && i < pts.length - 1) { runs.push(cur); cur = [pts[i]]; }
  }
  runs.push(cur);
  const out = [];
  for (const run of runs) {
    const n = run.length;
    if (n === 1 || (n === 2 && run[0][0] === run[1][0] && run[0][1] === run[1][1])) { out.push([run[0][0], run[0][1]]); continue; }
    for (let i = 0; i < n - 1; i++) {
      const p1 = run[i], p2 = run[i + 1];
      const p0 = i > 0 ? run[i - 1] : [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
      const p3 = i < n - 2 ? run[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(2, Math.ceil(len / 0.2));
      for (let s = out.length && i === 0 ? 1 : 0; s < steps; s++) out.push(catmull(p0, p1, p2, p3, s / steps));
    }
    out.push([run[n - 1][0], run[n - 1][1]]);
  }
  return out;
}

/** Samples of a whole glyph in field coordinates: x, y, arclength, radius. */
function sampleGlyph(strokes, seed) {
  const S = [], starts = [], lens = [];
  let base = 0;
  strokes.forEach((pts, si) => {
    const raw = sampleStroke(pts).map(([u, v]) => [OX + u + (CH - v) * SLANT, OY + v]);
    const arc = [0];
    for (let i = 1; i < raw.length; i++) arc.push(arc[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const L = arc[arc.length - 1];
    raw.forEach(([x, y], i) => {
      const s = arc[i];
      // pressure: a press where the finger lands, a slight lift at the end, a slow wander
      let r = R0 + 0.5 * Math.exp(-s / 3.5) + 0.18 * Math.sin(s * 0.3 + seed * 1.7 + si);
      if (L > 4) r -= 0.4 * Math.max(0, Math.min(1, (s - (L - 7)) / 7));
      else r = R0 + 0.35;                                  // a dab
      S.push([x, y, base + s, r]);
    });
    starts.push(base); lens.push(L);
    base += L + LIFT;
  });
  return { S, L: base - LIFT, starts, lens };
}

// static edge raggedness: smooth value noise at ~1.6 px, +-0.3 px
function edgeNoise(x, y, seed) {
  const fx = x / 1.6, fy = y / 1.6, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
  const r = (a, b) => hash(a, b, seed) / 4294967296;
  const a = r(ix, iy), b = r(ix + 1, iy), c = r(ix, iy + 1), d = r(ix + 1, iy + 1);
  const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy - 0.5) * 0.6;
}

function bake(strokes, seed) {
  const { S, L, starts, lens } = sampleGlyph(strokes, seed);
  const D = new Int8Array(FW * FH), T = new Uint8Array(FW * FH);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let dmin = 1e9, tin = 255, tout = 255;
      for (let k = 0; k < S.length; k++) {
        const [sx, sy, s, r] = S[k];
        const dd = Math.hypot(px - sx, py - sy);
        const e = dd - r;
        if (e < dmin) dmin = e;
        if (e <= 0.5 && s < tin) tin = s;
        if (e <= 3.2 && s < tout) tout = s;
      }
      const d = dmin + edgeNoise(x, y, seed);
      D[y * FW + x] = Math.max(-127, Math.min(127, Math.round(d * 4)));
      const tt = d <= 0.5 ? tin : tout;
      T[y * FW + x] = tt >= 254 ? 255 : Math.floor(tt);
    }
  // where the finger lifts at the very end, and drip origins: the lowest points of the stroke
  const end = S[S.length - 1];
  const bottoms = [];
  const low = [];
  for (let x = 0; x < FW; x++) {
    let yb = -1;
    for (let y = FH - 1; y >= 0; y--) if (D[y * FW + x] < 0) { yb = y; break; }
    low.push(yb);
  }
  const ymax = Math.max(...low);
  // candidates: columns within 4 px of the lowest, local maxima, at least 8 px apart
  const cand = [];
  for (let x = 2; x < FW - 2; x++) {
    if (low[x] < ymax - 4) continue;
    if (low[x] >= low[x - 1] && low[x] >= low[x + 1] && low[x] >= low[x - 2] && low[x] >= low[x + 2]) cand.push([x, low[x]]);
  }
  cand.sort((a, b) => b[1] - a[1]);
  for (const c of cand) if (bottoms.every((b) => Math.abs(b[0] - c[0]) >= 8)) bottoms.push(c);
  return { D, T, L, starts: starts.map(Math.floor), lens, end: [end[0], end[1]], drips: bottoms.slice(0, 2).map(([x, y]) => [x + 0.5, y + 1]) };
}

/** GLYPHS[d] for d = 0..9, GLYPHS[10] the colon. */
export const GLYPHS = [];
for (let d = 0; d < 10; d++) GLYPHS.push(bake(PATHS[d], d + 1));
GLYPHS.push(bake(COLON, 11));

/** Flash used by the fields, bytes. */
export const GLYPH_BYTES = GLYPHS.length * FW * FH * 2;
