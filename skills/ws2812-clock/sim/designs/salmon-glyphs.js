// Salmon numerals: each digit is ONE spawning sockeye bent into the numeral's
// stroke. The paths run TAIL -> HEAD (the fish swims in along the path, so it
// rests with its head at the end). Control points live in a 20 x 38 box
// (stroke centreline); a third element 1 marks a sharp corner.
//
// Also: Catmull-Rom smoothing, cubic Beziers, and "routes": polylines
// resampled at a fixed STEP with normals, along which a fish slides like a
// snake (head at u = headU, tail at u = tailU).

export const STEP = 0.5;

export const GLYPHS = {
  0: [[12.5, 0.9], [17.8, 4], [20, 12], [20, 26], [17, 34.2], [10, 37.6], [3, 34.2], [0, 26], [0, 12], [2.2, 4], [7.2, 1.0]],
  1: [[11, 38], [11, 20], [11, 0.8, 1], [3.5, 8]],
  2: [[20, 37], [0.8, 37, 1], [8, 28.5], [15, 20.5], [19, 12.5], [17.5, 4.5], [10.5, 0.8], [3.5, 3], [0.8, 9]],
  3: [[0.5, 31], [4, 36], [11, 37.5], [18, 34], [20, 27], [16.5, 21], [9, 19, 1], [15, 16.5], [18.5, 10.5], [16.5, 3.5], [10, 0.8], [3.5, 2.5], [0.8, 7]],
  4: [[15, 38], [15, 20], [15, 0.8, 1], [0.5, 26.5, 1], [20, 26.5]],
  5: [[0.5, 32], [5, 36.8], [12, 37.4], [18.5, 32.5], [19.5, 24.5], [15.5, 18.5], [8.5, 17], [2, 19, 1], [2.5, 9], [3, 1, 1], [19.5, 1]],
  6: [[1.5, 24], [5.5, 19], [11, 17.5], [17.5, 20.5], [19.8, 27], [17, 34.5], [10, 37.5], [3, 34.5], [0.5, 26], [0.8, 16], [3.5, 7.5], [9, 2], [15, 0.6], [18.5, 1.8]],
  7: [[6, 38], [9, 26.5], [13, 14.5], [19.5, 1.2, 1], [0.8, 1.2]],
  8: [[2.5, 7], [6, 1.8], [11, 0.8], [16.5, 3], [18, 9], [14.5, 15], [10, 18], [4, 21.5], [0.8, 28], [3, 35], [10, 37.5], [17, 35], [19.3, 28], [16, 21.5], [10, 18], [5.5, 15], [2, 10.5]],
  9: [[18.5, 13], [15, 18], [9, 19.5], [3, 17], [0.6, 10], [3.5, 3], [10, 0.8], [16, 3], [19.5, 10], [19.5, 20], [17, 30], [12, 37.5]],
};

/** Catmull-Rom through pts (each [x, y, sharp?]); corners split the runs. Dense [[x,y]]. */
export function crPath(pts, sub = 10) {
  const runs = [];
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    if (pts[i][2] && i < pts.length - 1) { runs.push(run); run = [pts[i]]; }
  }
  runs.push(run);
  const out = [];
  for (const r of runs) {
    const n = r.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = r[Math.max(0, i - 1)], p1 = r[i], p2 = r[i + 1], p3 = r[Math.min(n - 1, i + 2)];
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (r === runs[runs.length - 1]) out.push([r[n - 1][0], r[n - 1][1]]);
  }
  return out;
}

/** Cubic Bezier, dense. */
export function bezier(a, b, c, d, n = 80) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
  }
  return out;
}

/** Resample a dense polyline at STEP; returns [[x,y]] (the last point is the end). */
function resample(poly) {
  const out = [[poly[0][0], poly[0][1]]];
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    let [ax, ay] = poly[i - 1];
    const [bx, by] = poly[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= STEP) {
      const k = (STEP - acc) / seg;
      ax += (bx - ax) * k; ay += (by - ay) * k;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay); acc = 0;
    }
    acc += seg;
  }
  return out;
}

/**
 * A route from several dense polylines laid end to end. Returns
 * { n, L, x, y, nx, ny, marks } where marks[k] is the arc length at which
 * part k ends.
 */
export function makeRoute(parts) {
  const pts = [], marks = [];
  for (const p of parts) {
    const r = resample(p);
    for (let i = pts.length ? 1 : 0; i < r.length; i++) pts.push(r[i]);
    marks.push((pts.length - 1) * STEP);
  }
  const n = pts.length;
  const x = new Float32Array(n), y = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = pts[i][0]; y[i] = pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const tx = x[b] - x[a], ty = y[b] - y[a], l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l; ny[i] = tx / l;
  }
  return { n, L: (n - 1) * STEP, x, y, nx, ny, marks };
}

/** The glyph's dense centreline placed in box (x, y, w, h), sheared by `lean`. */
export function glyphPoly(d, bx, by, bw, bh, lean = 0) {
  const sx = bw / 20, sy = bh / 38;
  return crPath(GLYPHS[d].map(([px, py, s]) => [bx + px * sx + (38 - py) * sy * lean, by + py * sy, s]));
}
