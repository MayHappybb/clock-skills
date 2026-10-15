// Plasma globe digits: fingertip script, one continuous stroke each, as if a
// finger wrote it on the glass and the plasma followed. Box 10 x 16 units.
// A glyph is a chain of pieces: 'C' = Catmull-Rom curve through the points,
// 'L' = straight polyline. Each piece starts where the last one ended, so a
// change of piece is a sharp corner.
export const GLYPHS = {
  0: [['C', [[5.6, 0.4], [2.2, 1.5], [0.5, 6], [0.7, 10.9], [2.8, 15.1], [6.1, 15.6], [8.9, 12.6], [9.5, 7.8], [8.8, 3.3], [6.6, 0.6], [4.4, 0.6], [3.2, 1.4]]]],
  1: [['L', [[1.6, 4.4], [6.3, 0.3], [6.3, 15.7]]]],
  2: [['C', [[0.9, 4.2], [2.1, 1.3], [5.1, 0.3], [8.2, 1.4], [9.2, 4.4], [8, 7.9], [4.4, 11.8], [0.6, 15.7]]], ['L', [[0.6, 15.7], [9.6, 15.7]]]],
  3: [['C', [[0.8, 2.8], [3.6, 0.4], [7.3, 0.6], [8.9, 3.3], [7.8, 6.4], [4.3, 7.6]]], ['C', [[4.3, 7.6], [8.2, 8.5], [9.6, 11.8], [8.1, 15], [4.5, 15.8], [0.6, 13.9]]]],
  4: [['L', [[7.2, 15.7], [7.2, 0.3], [0.4, 10.9], [9.8, 10.9]]]],
  5: [['L', [[9.1, 0.4], [2.3, 0.4], [1.5, 7.3]]], ['C', [[1.5, 7.3], [4.7, 5.9], [8.2, 6.8], [9.6, 10.6], [8.3, 14.6], [4.7, 15.8], [0.6, 14.1]]]],
  6: [['C', [[8.5, 0.8], [5.2, 0.4], [2.1, 2.8], [0.6, 7.9], [1, 12.8], [4, 15.7], [7.6, 15.1], [9.4, 11.8], [8.6, 8.3], [5.4, 6.9], [2.3, 8], [0.8, 10.6]]]],
  7: [['L', [[0.4, 0.4], [9.6, 0.4]]], ['C', [[9.6, 0.4], [6.4, 5.4], [4.4, 10.4], [3.6, 15.7]]]],
  8: [['C', [[8.3, 2.5], [5.2, 0.3], [1.7, 1.6], [1.6, 5.3], [5, 7.6], [8.8, 10.1], [9, 13.8], [5, 15.8], [1, 13.8], [1.2, 10.1], [5, 7.6], [8.4, 5.3], [8.8, 2.7], [7.4, 1.1]]]],
  9: [['C', [[9.2, 2.7], [6.6, 0.4], [3, 0.5], [0.7, 3.2], [1.2, 6.8], [4.4, 8.4], [7.8, 7.4], [9.4, 4.2], [9.4, 1.2]]], ['C', [[9.4, 1.2], [9.4, 8], [8.9, 12.6], [7.4, 15.7]]]],
};

function catmull(pts, out, step) {
  const n = pts.length, P = (i) => (i < 0 ? [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]
    : i >= n ? [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]] : pts[i]);
  for (let i = 0; i + 1 < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.ceil(len / step));
    for (let j = out.length ? 1 : 0; j <= k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
}
function polyline(pts, out, step) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = out.length ? 1 : 0; j <= k; j++) out.push([ax + (bx - ax) * j / k, ay + (by - ay) * j / k]);
  }
}

/** The glyph for digit d as a dense point list in glyph units. */
export function glyphPoints(d, step = 0.4) {
  const out = [];
  for (const [kind, pts] of GLYPHS[d]) {
    const piece = [];
    (kind === 'C' ? catmull : polyline)(pts, piece, step);
    for (let i = out.length ? 1 : 0; i < piece.length; i++) out.push(piece[i]);
  }
  return out;
}
