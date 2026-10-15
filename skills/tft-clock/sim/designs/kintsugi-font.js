// Kintsugi's numerals: each digit is a crack. The skeletons are drawn in a
// 24 x 40 box as straight runs that turn at sharp kinks, the way a fired
// glaze breaks (no smooth curves anywhere); long runs are split and nudged
// sideways a little, deterministically, so every stroke wanders like a real
// fracture. The seam's width swells and pinches along its length, as gold
// lacquer does where the break was wider.
//
// Everything is rasterised once at load into small byte maps per digit and
// size (flash): distance to the seam's centre line (1/16 px), arc length
// along the stroke (px), fraction along the stroke (0..255), kept only for
// the pixels near the seam (5 bytes each), so a frame only visits those.

import { hash, noise } from '../js/kit.js';

/** Centre lines, 24 x 40 box, one or more strokes per digit. */
const SKEL = {
  0: [[[7, 3], [15.5, 2.5], [20, 6.5], [21.5, 14], [20.5, 22], [21.5, 30], [18, 36], [11, 37.5], [5, 34.5], [2.5, 27], [3.5, 18], [2.5, 10], [7, 3]]],
  1: [[[5.5, 9], [13.5, 2.5], [12.5, 13], [13.5, 25], [12.5, 37.5]]],
  2: [[[3, 9.5], [7.5, 3.5], [15.5, 2.5], [20.5, 7], [20, 14.5], [14, 22], [8, 29], [3, 37], [12, 36], [21.5, 37.5]]],
  3: [[[3, 6.5], [9, 2.5], [17, 3], [20.5, 8], [19, 15], [11, 19], [17.5, 21.5], [21.5, 27.5], [20, 34], [13, 37.5], [6, 37], [2.5, 32]]],
  4: [[[13, 2.5], [8, 13], [3, 26], [12, 25.5], [21.5, 26.5]], [[17.5, 11], [16.5, 24], [17.5, 37.5]]],
  5: [[[20.5, 3], [12, 2.5], [5.5, 3.5], [4.5, 17], [10, 15], [16.5, 16], [21, 21.5], [21.5, 30], [16.5, 36.5], [8.5, 37.5], [2.5, 33]]],
  6: [[[18.5, 3], [11, 5.5], [5.5, 12.5], [3, 22], [3.5, 30], [8, 36.5], [15, 37.5], [20.5, 32.5], [21, 25], [16, 19.5], [9, 19.5], [3.5, 24]]],
  7: [[[2.5, 3], [12, 2.5], [21.5, 3], [17, 12.5], [13.5, 23], [11, 37.5]]],
  8: [[[12, 19], [5.5, 15.5], [4, 8.5], [8, 3], [16, 2.5], [20, 8], [19, 15], [12, 19], [4.5, 23.5], [2.5, 31], [7.5, 37.5], [16.5, 37.5], [21.5, 31.5], [20, 24], [12, 19]]],
  9: [[[20.5, 15.5], [15, 20.5], [8, 20], [3.5, 15], [3.5, 7.5], [8.5, 2.5], [16, 3], [20.5, 8], [21, 16], [20, 26], [16, 34], [8, 37.5]]],
};

export const PAD = 4;
export const SIZES = [1.1, 0.9];   // hours, minutes

/** Split long runs and nudge the new points sideways: the crack's wander. */
function wander(pts, d, k) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    const n = Math.max(1, Math.round(l / 4.5));
    for (let j = 1; j < n; j++) {
      const u = j / n, j0 = (hash(d, k * 64 + i, j) % 1000) / 1000 - 0.5;
      out.push([ax + dx * u - (dy / l) * j0 * 2.1, ay + dy * u + (dx / l) * j0 * 2.1]);
    }
    out.push([bx, by]);
  }
  return out;
}

function build(d, si) {
  const sc = SIZES[si];
  const w = Math.ceil(24 * sc) + 2 * PAD, h = Math.ceil(40 * sc) + 2 * PAD;
  const segs = [], kinks = [];
  SKEL[d].forEach((st, k) => {
    const pts = wander(st, d, k).map(([x, y]) => [PAD + x * sc, PAD + y * sc]);
    st.forEach(([x, y], j) => { if (j > 0 && j < st.length - 1) kinks.push([PAD + x * sc, PAD + y * sc]); });
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let a = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, len, a0: a, L });
      a += len;
    }
  });
  const D = new Uint8Array(w * h), A = new Uint8Array(w * h), U = new Uint8Array(w * h);
  const list = [];
  let maxA = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, arc = 0, L = 1;
      for (const s of segs) {
        const dx = s.bx - s.ax, dy = s.by - s.ay;
        let u = ((px - s.ax) * dx + (py - s.ay) * dy) / (s.len * s.len || 1);
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = px - s.ax - u * dx, ey = py - s.ay - u * dy, e = Math.sqrt(ex * ex + ey * ey);
        if (e < best) { best = e; arc = s.a0 + u * s.len; L = s.L; }
      }
      const i = y * w + x;
      D[i] = Math.min(255, Math.round(best * 16));
      A[i] = Math.min(255, Math.round(arc));
      U[i] = Math.min(255, Math.round((arc / L) * 255));
      if (A[i] > maxA) maxA = A[i];
      if (best < 7) list.push(i);
    }
  // the seam's own width along its length: lacquer pools where the break was wider
  const HW = new Uint8Array(256);
  // and two or three chips (kake) where a sliver flaked off the edge: a sharp lozenge of gold
  const chips = [];
  for (let c = 0, a = 9 + (hash(d, si, 5) % 12); c < 3 && a < maxA - 6; c++, a += 26 + (hash(d, si, c) % 22)) chips.push(a);
  for (let a = 0; a < 256; a++) {
    let w = 1.0 + 0.75 * noise(a / 6, d * 7 + si * 3);
    for (const c of chips) { const e = Math.abs(a - c); if (e < 3) w += 1.05 * (1 - e / 3); }
    HW[a] = Math.round(w * 16);
  }
  // only the pixels near the seam are kept (flash): position, distance, arc, fraction
  const lx = Uint8Array.from(list, (i) => i % w), ly = Uint8Array.from(list, (i) => (i / w) | 0);
  const pd = Uint8Array.from(list, (i) => D[i]), pa = Uint8Array.from(list, (i) => A[i]), pu = Uint8Array.from(list, (i) => U[i]);
  return { w, h, HW, lx, ly, pd, pa, pu, n: list.length, maxA, kinks };
}

/** GLYPHS[size][digit] */
export const GLYPHS = SIZES.map((_, si) => Array.from({ length: 10 }, (_, d) => build(d, si)));

/** Flash: bytes of every table above. */
export const FONT_BYTES = GLYPHS.flat().reduce((s, g) => s + g.n * 5 + 256, 0);
