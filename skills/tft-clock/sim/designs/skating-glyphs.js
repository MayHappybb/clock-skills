// skating: the numerals as blade tracings. Each digit is ONE continuous
// path a skater can skate: smooth Catmull-Rom curves between cusps, the
// cusps being the "brackets" and "rockers" of compulsory figures (8 is the
// figure eight itself). Paths are drawn on a 10 x 16 grid, slanted like a
// written hand, and resampled once at load to points ~1.5 px apart, so the
// face only walks arrays at run time.

// Runs of grid points; a new run starts at a cusp.
const RUNS = {
  0: [[[5, 0], [1.2, 2.6], [0, 8], [1.4, 13.6], [5, 16], [8.6, 13.6], [10, 8], [9, 2.6], [5.4, 0], [2.8, 1]]],
  1: [[[2.4, 4], [6.2, 0.2]], [[6.2, 0.2], [5.8, 16]]],
  2: [[[0.8, 3.8], [3.6, 0.4], [7.2, 0.3], [9.6, 3], [9, 6.6], [5, 10.6], [0.4, 16]], [[0.4, 16], [5, 15.5], [10, 16]]],
  3: [[[0.6, 2], [4.5, 0], [8.6, 1.6], [8.8, 5], [4.4, 7.4]], [[4.4, 7.4], [8.8, 9.4], [10, 12.6], [7.6, 15.6], [3.6, 16], [0.4, 13.8]]],
  4: [[[7.4, 16], [7.4, 0]], [[7.4, 0], [0, 11]], [[0, 11], [10, 11]]],
  5: [[[9.6, 0], [2.2, 0]], [[2.2, 0], [1.2, 7.2]], [[1.2, 7.2], [5, 5.9], [9, 7.6], [10, 11.6], [8, 15.2], [4, 16], [0.4, 14]]],
  6: [[[8.6, 1], [5, 0], [1.6, 2.4], [0, 8], [0.6, 13], [4, 16], [8, 15.6], [10, 12], [9, 8.2], [5, 7], [1.4, 8.6], [0.3, 11.4]]],
  7: [[[0.2, 0.4], [10, 0]], [[10, 0], [6.6, 6], [4.6, 11], [3.9, 16]]],
  8: [[[5, 7.6], [8.6, 5], [9, 2], [5, 0], [1, 2], [1.4, 5], [5, 7.6], [9, 10.6], [9.6, 14], [5, 16], [0.4, 14], [1, 10.6], [5, 7.6]]],
  9: [[[9.6, 4.4], [8, 7.6], [5, 8.6], [1.6, 7.4], [0, 4.2], [1.6, 1], [5, 0], [8.4, 1], [10, 4.6], [9.6, 10], [8.2, 16]]],
};

export const SL = 0.2, SX = 1.85, SY = 2.5;    // slant, grid -> px
export const DIGIT_TOP = 20;                   // y of the grid's top row
export const DIGIT_OX = [12, 39, 95, 122];     // x of each position's grid origin
export const COLON = [[82.6, 32], [80.2, 48.5]];

const toPx = ([gx, gy]) => [(gx + (16 - gy) * SL) * SX, DIGIT_TOP + gy * SY];

function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** Dense polyline of one digit, in px relative to the position's origin, plus cusp flags. */
function dense(d) {
  const out = [], cuspAt = [];
  for (const run of RUNS[d]) {
    const P = run.map(toPx);
    const n = P.length;
    const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]]];
    if (out.length) cuspAt.push(out.length - 1);
    for (let i = 0; i < n - 1; i++)
      for (let k = i === 0 && out.length ? 1 : 0; k < 16; k++) out.push(catmull(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], k / 16));
    out.push(P[n - 1]);
  }
  return { out, cuspAt };
}

/**
 * GLYPH[d] = { pts: [[x, y]...] ~1.5 px apart, len (px), cusps: [arc length...],
 * t0, t1: unit tangents at the start and end }.
 */
export const GLYPH = {};
for (let d = 0; d <= 9; d++) {
  const { out, cuspAt } = dense(d);
  const acc = [0];
  for (let i = 1; i < out.length; i++) acc.push(acc[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const len = acc[acc.length - 1];
  const n = Math.max(2, Math.round(len / 1.5));
  const pts = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (len * k) / n;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const u = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    pts.push([out[j][0] + (out[j + 1][0] - out[j][0]) * u, out[j][1] + (out[j + 1][1] - out[j][1]) * u]);
  }
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  GLYPH[d] = {
    pts, len, step: len / n,
    cusps: cuspAt.map((i) => acc[i]),
    t0: unit(pts[0], pts[2]),
    t1: unit(pts[n - 2], pts[n]),
  };
}

/** Point and unit heading at arc length s along digit d (relative coords). */
export function along(d, s) {
  const G = GLYPH[d], n = G.pts.length - 1;
  const f = Math.max(0, Math.min(n, s / G.step)), i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const a = G.pts[i], b = G.pts[i + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * u, a[1] + dy * u, dx / l, dy / l];
}
