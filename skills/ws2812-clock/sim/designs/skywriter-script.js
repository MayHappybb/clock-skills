// Skywriter script: ten numerals, each ONE continuous flight path, as a
// skywriting pilot would fly them (no lifts: corners become stall turns,
// joins become small loops). Control points in a 10 x 20 box, y down; a
// centripetal Catmull-Rom spline runs through them and is resampled by arc
// length, so the plane (and its smoke) moves along it at an even speed.

const P = {
  0: [[7, 1.2], [4.6, 0], [1.6, 2.6], [0.3, 9.5], [1.2, 16.6], [4.8, 20], [8.4, 17.8], [9.8, 10.5], [9.2, 3.6], [6.8, 0.3], [3.6, 1.6]],
  1: [[1.2, 5.6], [4, 3], [7.2, 0], [6.8, 7], [6.3, 13.5], [5.6, 20]],
  2: [[0.7, 5.2], [2.4, 1.2], [5.8, 0], [9.2, 2.6], [9.1, 7.2], [6, 11.8], [2.2, 16.6], [0.4, 19.8], [3.2, 19.2], [6.6, 19.5], [10, 19.8]],
  3: [[0.6, 3.2], [4.2, 0], [8.4, 0.8], [9.2, 4.6], [6.8, 8.3], [3.4, 9.3], [7.4, 10.1], [9.8, 13.8], [9.1, 18.2], [5, 20], [0.4, 17.6]],
  4: [[7.4, 20], [7.5, 11.5], [7.7, 0.2], [4.2, 5.6], [0.3, 12.8], [4.8, 13], [10.1, 12.8]],
  5: [[9.6, 0.4], [5.6, 0.3], [2.2, 0.4], [1.6, 4.6], [1.1, 9], [5, 7.6], [9, 9.4], [10, 14], [8, 19], [4, 20], [0.4, 17.6]],
  6: [[9, 1.6], [6, 0], [2.2, 3.2], [0.4, 10.4], [1.4, 17.4], [5, 20], [8.9, 17.9], [9.8, 13.6], [7.6, 10.1], [4, 10], [0.9, 13]],
  7: [[0.4, 3], [0.8, 0.6], [5, 0.5], [9.9, 0.4], [7.6, 6], [5.6, 12.6], [4.2, 20]],
  8: [[8.8, 3.4], [5.6, 0], [1.8, 1.9], [2, 6.4], [5, 9.6], [9.2, 12.9], [9.3, 17.9], [5.1, 20], [1, 18], [0.8, 13.1], [5, 9.6], [8.3, 6.4], [9, 2.4], [6.4, 0.1]],
  9: [[9.2, 2.8], [6, 0], [2, 1], [0.4, 5.4], [2.4, 9.6], [6.4, 10], [9.2, 6.6], [9.8, 0.9], [9.5, 8], [8.6, 14], [7.6, 20]],
};

/** Centripetal Catmull-Rom through pts, densely sampled. */
function spline(pts, per = 24) {
  const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  for (let i = 1; i + 2 < ext.length; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t0 = 0, t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < per; k++) {
      const t = t1 + (t2 - t1) * (k / per);
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push(pts.at(-1));
  return out;
}

/** Resample a dense polyline at even arc-length spacing ds: Float32Array [x, y, ...]. */
export function resample(pts, ds) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum.at(-1), n = Math.max(2, Math.round(L / ds) + 1), out = new Float32Array(2 * n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    out[2 * k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
    out[2 * k + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
  }
  return { pts: out, n, L };
}

// The four slots: one line of sky writing, gently uneven like a real message.
export const GLYPH = { w: 10.8, h: 21, slant: 0.12 };
export const SLOT_X = [1.0, 15.3, 35.0, 49.3];
export const SLOT_Y = [12.4, 11.6, 12.8, 12.0];
export const DS = 0.55; // smoke sample spacing in pixels

const cache = new Map();
/** The flight path of digit d in slot k, in panel pixels: { pts, n, L }. */
export function glyphPath(k, d) {
  const key = k * 10 + d;
  if (cache.has(key)) return cache.get(key);
  const sx = GLYPH.w / 10, sy = GLYPH.h / 20;
  const pts = spline(P[d]).map(([x, y]) => [SLOT_X[k] + x * sx + (20 - y) * sy * GLYPH.slant, SLOT_Y[k] + y * sy]);
  const r = resample(pts, DS);
  cache.set(key, r);
  return r;
}
