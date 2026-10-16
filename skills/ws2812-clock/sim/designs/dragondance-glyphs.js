// Dragon dance: the ten numerals as routes for the dragon's body.
//
// Each digit is one continuous stroke the dancers carry the body along, in a
// 28 x 40 box (y down, 40 = baseline), entered from the low band at the
// left (E) and left to the low band at the right (X), so a digit can be
// swapped for another without moving its neighbours. z is depth: 1 is the
// body held up in front (the stroke you read), 0 is the body dipping low
// behind the troupe (dim, thin), >1 passes over another part of itself.
//
// Every route is resampled to NS points by arc length, so any two digits
// (and the low "dive" wave between them) morph point by point.

export const NS = 300;               // samples per digit route
export const E = [-6, 47, 0], X = [34, 47, 0];

// prettier-ignore
const ROUTES = {
  0: [E, [6, 46, 0], [12, 42.5, 0.6], [14, 40, 1], [23, 36.5, 1], [27.3, 25, 1], [26.5, 11, 1], [21, 2, 1], [14, 0, 1],
      [7, 2, 1], [1.5, 11, 1], [0.7, 25, 1], [5, 36.5, 1], [14, 40, 1], [20, 42, 0.6], [26, 46, 0], X],
  1: [E, [-3, 36, 0], [1, 18, 0], [4, 11, 0.5], [7, 9.5, 1], [12, 6, 1], [17, 0.5, 1], [17.5, 10, 1], [17.5, 22, 1],
      [17.5, 34, 1], [18.5, 40, 1], [23, 43, 0.5], [28, 46, 0], X],
  2: [E, [-4, 34, 0], [-1, 16, 0], [1.5, 9, 0.5], [4, 4.5, 1], [13, 0, 1], [22.5, 2.5, 1], [26.5, 10.5, 1], [23, 19.5, 1],
      [13, 28.5, 1], [3, 39, 1], [13, 39.5, 1], [27, 39.5, 1], [30, 43, 0.4], X],
  3: [E, [-4, 30, 0], [-1, 12, 0], [1.5, 6.5, 0.5], [5, 3, 1], [14, 0, 1], [23.5, 3.5, 1], [24.5, 12, 1], [17, 18.5, 1],
      [11, 19.5, 1], [19, 21, 1], [26, 27, 1], [26, 35, 1], [18.5, 40, 1], [9, 40, 1], [1.5, 35, 1], [5, 43, 0.4],
      [16, 46.5, 0], X],
  4: [E, [12, 47, 0], [26, 45, 0], [30.5, 38, 0], [30, 32, 0.4], [27, 29, 1], [14, 29, 1], [1, 29, 1], [10, 15, 1],
      [19.5, 0.5, 1], [19.5, 14, 1], [19.5, 28, 1.4], [19.5, 40, 1], [24, 44, 0.4], X],
  5: [E, [-3, 44, 0], [1, 38, 0.6], [4, 38.5, 1], [10.5, 40, 1], [19, 39.5, 1], [26, 33, 1], [26.5, 24, 1], [20.5, 16.5, 1],
      [11, 16, 1], [3.5, 19, 1], [4, 9, 1], [4.5, 0.5, 1], [15, 0.5, 1], [26.5, 0.5, 1], [30, 5, 0.4], [32.5, 16, 0],
      [34, 32, 0], X],
  6: [E, [-3, 42, 0], [0, 34, 0.4], [3.5, 28, 1], [8, 21, 1], [16, 18.5, 1], [24.5, 23, 1], [26.5, 31.5, 1], [21, 39, 1],
      [12, 40, 1], [3.5, 34, 1], [2, 22, 1], [5, 9, 1], [12.5, 1.5, 1], [21, 0.5, 1], [26, 3, 1], [30.5, 9, 0.4],
      [33, 22, 0], [34, 38, 0], X],
  7: [E, [-4, 34, 0], [-3, 12, 0], [0, 3, 0.5], [4, 0.5, 1], [16, 0.5, 1], [27.5, 0.5, 1], [21.5, 13, 1], [16, 26, 1],
      [12.5, 40, 1], [16, 44, 0.4], [24, 47, 0], X],
  8: [E, [5, 47, 0], [11, 43, 0.6], [14, 40, 1], [23.5, 36.5, 1], [25, 27, 1], [14, 20, 1], [4, 13, 1], [5, 3.5, 1],
      [14, 0, 1], [23, 3.5, 1], [24, 13, 1.4], [14, 20, 1.4], [3, 27, 1.4], [4.5, 36.5, 1], [14, 40, 1],
      [20, 42.5, 0.6], [27, 46.5, 0], X],
  9: [E, [14, 47, 0], [27, 45, 0], [31.5, 33, 0], [30.5, 20, 0], [27, 13, 0.6], [25.5, 11, 1], [22, 2.5, 1], [13.5, 0, 1],
      [5, 3, 1], [1.5, 11.5, 1], [6, 20, 1], [15, 22, 1], [23.5, 17, 1.3], [26.5, 11.5, 1.3], [26.5, 23, 1], [23, 34, 1],
      [15, 40, 1], [6.5, 39.5, 1], [9, 44, 0.3], [20, 47, 0], X],
};

/** Centripetal-ish Catmull-Rom through pts [[x,y,z]...], densely sampled. */
function spline(pts, per = 24) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** Resample a dense polyline to n points evenly by arc length (x, y only). */
function resample(dense, n) {
  const L = [0];
  for (let i = 1; i < dense.length; i++) L.push(L[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const tot = L[L.length - 1], xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const s = (tot * j) / (n - 1);
    while (k < dense.length - 2 && L[k + 1] < s) k++;
    const f = L[k + 1] > L[k] ? (s - L[k]) / (L[k + 1] - L[k]) : 0;
    xs[j] = dense[k][0] + (dense[k + 1][0] - dense[k][0]) * f;
    ys[j] = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * f;
    zs[j] = Math.max(0, Math.min(1.5, dense[k][2] + (dense[k + 1][2] - dense[k][2]) * f));
  }
  return { x: xs, y: ys, z: zs, len: tot };
}

/** Where the dancers' poles hold a route: the lowest front sample in each half. */
function poles(r) {
  const best = [-1, -1], by = [-1e9, -1e9];
  for (let j = 0; j < NS; j++) {
    if (r.z[j] < 0.9) continue;
    const h = r.x[j] < 14 ? 0 : 1;
    if (r.y[j] > by[h]) { by[h] = r.y[j]; best[h] = j; }
  }
  return best;
}

export const GLYPHS = [];
for (let d = 0; d <= 9; d++) {
  const r = resample(spline(ROUTES[d]), NS);
  r.poles = poles(r);
  GLYPHS.push(r);
}

/** The dive: the body ducks into a low wave across the slot, between digits. */
export const DIVE = (() => {
  const pts = [E, [2, 45, 0.5], [8, 40, 1], [14, 43, 1], [20, 38.5, 1], [26, 42, 1], [30, 45, 0.5], X];
  const r = resample(spline(pts), NS);
  r.poles = [Math.round(NS * 0.3), Math.round(NS * 0.7)];
  return r;
})();

/** A fixed stretch of body from a to b through the given points (world coords). */
export function strand(pts, n) { return resample(spline(pts), n); }
