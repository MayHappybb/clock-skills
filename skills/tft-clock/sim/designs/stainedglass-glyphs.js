// Leaded numerals for 'stainedglass': each digit is a few ribbons of glass
// (centre lines below, in a 26 x 50 design box) cut into pieces where a
// glazier would cut them: at corners, and across a curve every ~60 degrees,
// so a 0 is six curved pieces like the segments of a rose. Rasterised once
// at load into a material map: glass (piece, streak tone), lead (the two
// pieces it holds) and a pale moat outside the came.

import { hash, noise } from '../js/kit.js';

const CUT = 'cut';
const rad = (d) => (d * Math.PI) / 180;
/** Points on an ellipse arc, angles in degrees (0 = right, 90 = down), a0 -> a1. */
function arc(cx, cy, rx, ry, a0, a1, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
/** A path: point runs and CUT markers. */
function path(...parts) {
  const pts = [], cuts = [];
  for (const p of parts) {
    if (p === CUT) { cuts.push(pts.length - 1); continue; }
    for (const q of p) {
      const l = pts[pts.length - 1];
      if (!l || Math.abs(l[0] - q[0]) + Math.abs(l[1] - q[1]) > 1e-6) pts.push(q);
    }
  }
  return { pts, cuts };
}
const L = (...pts) => pts;

const E0 = [13, 25, 8.5, 20.5];
const sixArcs = (cx, cy, rx, ry, start) => {
  const parts = [];
  for (let k = 0; k < 6; k++) { if (k) parts.push(CUT); parts.push(arc(cx, cy, rx, ry, start + 60 * k, start + 60 * (k + 1), 6)); }
  return path(...parts);
};
const fourArcs = (cx, cy, rx, ry, start) => {
  const parts = [];
  for (let k = 0; k < 4; k++) { if (k) parts.push(CUT); parts.push(arc(cx, cy, rx, ry, start + 90 * k, start + 90 * (k + 1), 8)); }
  return path(...parts);
};

const SIX = [
  path(arc(17.6, 31, 13.1, 26.5, 257, 219, 6), CUT, arc(17.6, 31, 13.1, 26.5, 219, 180, 6)),
  fourArcs(13, 33.5, 8.5, 12, 180),
];
const mirror = (P) => ({ pts: P.pts.map(([x, y]) => [26 - x, 50 - y]), cuts: P.cuts });

export const DIGIT_PATHS = [
  [sixArcs(...E0, 300)],
  [path(L([6.2, 12.5], [15, 4.6])), path(L([15, 4.6], [15, 18]), CUT, L([15, 32]), CUT, L([15, 45.5]))],
  [path(arc(13, 13.6, 8.5, 9.1, 188, 284, 7), CUT, arc(13, 13.6, 8.5, 9.1, 284, 395, 8), CUT, L([12.2, 32.1]), CUT, L([4.5, 45.5]), CUT, L([21.6, 45.5]))],
  [
    path(arc(12.6, 13.5, 8.3, 9, 202, 290, 6), CUT, arc(12.6, 13.5, 8.3, 9, 290, 360, 6), CUT, arc(12.6, 13.5, 8.3, 9, 0, 90, 6)),
    path(L([7.4, 23.2], [12.6, 23.2])),
    path(arc(12.6, 34.4, 9, 11.1, 270, 345, 6), CUT, arc(12.6, 34.4, 9, 11.1, 345, 420, 6), CUT, arc(12.6, 34.4, 9, 11.1, 60, 162, 7)),
  ],
  [path(L([7.2, 4.6], [5.9, 18]), CUT, L([4.6, 31])), path(L([4.6, 31], [21.8, 31])), path(L([17.2, 11], [17.2, 31]), CUT, L([17.2, 45.5]))],
  [path(L([21.4, 4.6], [6.6, 4.6]), CUT, L([6.6, 22.4]), CUT, arc(12.2, 33.2, 9.4, 12, 238, 340, 7), CUT, arc(12.2, 33.2, 9.4, 12, 340, 440, 7), CUT, arc(12.2, 33.2, 9.4, 12, 80, 162, 6))],
  SIX,
  [path(L([4.5, 4.6], [13, 4.6]), CUT, L([21.6, 4.6])), path(L([21.6, 4.6], [16.2, 25]), CUT, L([10.6, 45.5]))],
  [fourArcs(13, 14.4, 7.4, 9.9, 90), fourArcs(13, 34.6, 8.5, 10.9, 270)],
  SIX.map(mirror),
];

// ruby family: pot-metal and flashed reds, crimson and a warm scarlet
export const RUBY = [[176, 22, 38], [206, 44, 40], [148, 18, 56], [194, 50, 72], [214, 70, 48]];

export const GLASS = 1, LEAD = 2, MOAT = 3;

/**
 * Rasterise digit d at scale (sx, sy) with glass width sw, came width lw and
 * moat mw. Returns the box (margin m round the design box) and its maps.
 */
export function rasterDigit(d, sx, sy, sw, lw, mw) {
  const m = 3;
  const bw = Math.ceil(26 * sx) + 2 * m, bh = Math.ceil(50 * sy) + 2 * m;
  const segs = [];   // [ax, ay, bx, by, pieceA (for t<cut), ...] flattened per segment with its piece id
  let np = 0;
  for (const P of DIGIT_PATHS[d]) {
    const cutSet = new Set(P.cuts);
    let piece = np++;
    for (let i = 1; i < P.pts.length; i++) {
      const a = P.pts[i - 1], b = P.pts[i];
      segs.push([a[0] * sx + m, a[1] * sy + m, b[0] * sx + m, b[1] * sy + m, piece]);
      if (cutSet.has(i) && i < P.pts.length - 1) piece = np++;
    }
  }
  const N = bw * bh;
  const kind = new Uint8Array(N), p1 = new Uint8Array(N), p2 = new Uint8Array(N), tone = new Uint8Array(N);
  const dist = new Float32Array(N);
  const ang = Array.from({ length: np }, (_, k) => (hash(d, k, 5) % 180) * Math.PI / 180);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bp = 0;
      for (const [ax, ay, bx, by, pc] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = px - ax - u * dx, ey = py - ay - u * dy, e = ex * ex + ey * ey;
        if (e < best - 1e-9) { best = e; bp = pc; }
      }
      const r = Math.sqrt(best), i = y * bw + x;
      dist[i] = r; p1[i] = bp; p2[i] = bp;
      if (r <= sw / 2) {
        kind[i] = GLASS;
        const a = ang[bp], u = px * Math.cos(a) + py * Math.sin(a);
        const v = noise(u * 0.55 + bp * 7.3, d * 31 + bp);
        tone[i] = v < 0.3 ? 1 : v > 0.7 ? 2 : 0;
      } else if (r <= sw / 2 + lw) kind[i] = LEAD;
      else if (r <= sw / 2 + lw + mw) kind[i] = MOAT;
    }
  // the cames between pieces: a glass pixel whose right or lower neighbour is another piece
  const lead2 = new Uint8Array(N);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (kind[i] !== GLASS) continue;
      for (const j of [x + 1 < bw ? i + 1 : -1, y + 1 < bh ? i + bw : -1]) {
        if (j >= 0 && kind[j] === GLASS && p1[j] !== p1[i]) { lead2[i] = 1; p2[i] = p1[j]; }
      }
    }
  for (let i = 0; i < N; i++) if (lead2[i]) kind[i] = LEAD;
  // pieces: pixel lists and centres
  const pieces = Array.from({ length: np }, () => ({ px: [], cx: 0, cy: 0 }));
  for (let i = 0; i < N; i++) if (kind[i] === GLASS) { const P = pieces[p1[i]]; P.px.push(i); P.cx += i % bw; P.cy += (i / bw) | 0; }
  for (const P of pieces) { const n = P.px.length || 1; P.cx = P.cx / n + 0.5; P.cy = P.cy / n + 0.5; P.px = Int16Array.from(P.px); }
  // joints, where the solder goes: came pixels touching two or more pieces and either the outline or a third piece
  const joints = [];
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x;
      if (kind[i] !== LEAD) continue;
      const ids = new Set();
      let out = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * bw + dx;
          if (kind[j] === GLASS) ids.add(p1[j]); else if (kind[j] !== LEAD) out = true;
        }
      if (ids.size >= 3 || (ids.size >= 2 && out)) {
        if (joints.every(([jx, jy]) => Math.abs(jx - x) + Math.abs(jy - y) > 4)) joints.push([x, y]);
      }
    }
  const colour = pieces.map((_, k) => RUBY[(k * 2 + hash(d, 3) % 5) % 5]);
  return { bw, bh, kind, p1, p2, tone, np, pieces, joints, colour };
}
