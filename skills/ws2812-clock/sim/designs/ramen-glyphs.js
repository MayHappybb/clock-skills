// Ramen glyphs: each numeral is one or two long noodles laid in the broth.
// Skeletons are drawn in a 14 x 23 px box (the minute slot); the same
// skeletons, scaled and brushed with a slanted nib, print the hour on nori.
//
// sampleDigit(d, w, h) returns the skeleton resampled every STEP px:
//   { x, y, nx, ny, s: Float32Array, n, strokeStart: Uint8Array (1 at the
//     first sample of each noodle), len }
// so strands can be laid either side of it with a normal offset.

const STEP = 0.5;

// Control points, x 0..14, y 0..23. Each digit: list of strokes (noodles).
const SK = {
  0: [ellipse(7, 11.5, 4.9, 9.1, -0.06, 26, 1.08)],
  1: [[[3.2, 6.2], [5.6, 4.4], [8.0, 1.9], [8.0, 8], [8.0, 15], [8.0, 21.3]]],
  2: [[[2.4, 6.4], [3.6, 3.0], [7.0, 1.9], [10.6, 3.2], [11.6, 6.6], [10.0, 10.6], [6.0, 15.2], [2.2, 21.0], [7.5, 21.0], [12.6, 21.0]]],
  3: [[[2.4, 4.0], [6.6, 1.9], [11.2, 3.6], [11.2, 7.6], [7.2, 10.4], [5.2, 10.6], [7.2, 10.8], [11.8, 13.0], [12.0, 17.8], [7.6, 21.3], [2.0, 19.0]]],
  4: [[[9.4, 1.9], [5.6, 8.4], [1.8, 15.0], [7.4, 15.0], [13.0, 15.0]], [[10.0, 6.6], [10.0, 14.0], [10.0, 21.6]]],
  5: [[[12.2, 2.0], [7.6, 2.0], [3.6, 2.0], [3.0, 6.4], [2.8, 10.6], [7.0, 8.6], [11.4, 11.0], [12.2, 16.4], [9.4, 20.8], [5.4, 21.2], [2.0, 18.8]]],
  6: [[[11.4, 3.4], [7.6, 1.9], [4.0, 3.6], [2.4, 9.0], [2.4, 15.8], [4.6, 20.4], [8.6, 21.3], [11.8, 17.6], [11.4, 13.2], [8.0, 11.0], [4.4, 12.2], [2.6, 15.0]]],
  7: [[[1.8, 2.0], [7.2, 2.0], [12.6, 2.0], [10.2, 6.4], [7.6, 12.0], [6.0, 21.6]]],
  8: [[[7.0, 10.6], [10.6, 8.6], [11.2, 4.8], [8.2, 1.9], [4.6, 2.4], [3.0, 5.6], [4.8, 9.0], [9.6, 12.0], [12.0, 16.2], [10.0, 20.6], [5.8, 21.4], [2.4, 18.0], [3.2, 13.6], [7.0, 10.6], [9.0, 9.6]]],
  9: [[[11.6, 9.4], [8.4, 11.8], [4.0, 11.0], [2.4, 7.0], [4.6, 2.6], [8.6, 1.9], [11.6, 5.0], [11.8, 11.0], [10.8, 16.6], [7.6, 21.2], [3.2, 19.8]]],
};

function ellipse(cx, cy, rx, ry, tilt, n, turns) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = -Math.PI / 2 - 0.5 + (k / n) * turns * 2 * Math.PI;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return pts;
}

/** Catmull-Rom through pts, densely, then resampled by arc length. */
function resample(pts, sx, sy, step) {
  const P = pts.map(([x, y]) => [x * sx, y * sy]);
  const dense = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(P[P.length - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1], out = [];
  let j = 1;
  for (let s = 0; s <= total + 1e-6; s += step) {
    while (j < cum.length - 1 && cum[j] < s) j++;
    const f = cum[j] > cum[j - 1] ? Math.min(1, Math.max(0, (s - cum[j - 1]) / (cum[j] - cum[j - 1]))) : 0;
    out.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f]);
  }
  return out;
}

const cache = new Map();
export function sampleDigit(d, w = 14, h = 23, step = STEP) {
  const key = d + ':' + w + ':' + h + ':' + step;
  if (cache.has(key)) return cache.get(key);
  const xs = [], ys = [], starts = [];
  for (const stroke of SK[d]) {
    const pts = resample(stroke, w / 14, h / 23, step);
    pts.forEach(([x, y], k) => { xs.push(x); ys.push(y); starts.push(k === 0 ? 1 : 0); });
  }
  const n = xs.length;
  const x = new Float32Array(xs), y = new Float32Array(ys), nx = new Float32Array(n), ny = new Float32Array(n);
  const s = new Float32Array(n), rem = new Float32Array(n), strokeStart = new Uint8Array(starts), last = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = strokeStart[i] ? i : i - 1;
    const b = i + 1 < n && !strokeStart[i + 1] ? i + 1 : i;
    const tx = x[b] - x[a], ty = y[b] - y[a], L = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / L; ny[i] = tx / L;
    s[i] = strokeStart[i] ? 0 : s[i - 1] + step;
    last[i] = i + 1 >= n || strokeStart[i + 1] ? 1 : 0;
  }
  for (let i = n - 1; i >= 0; i--) rem[i] = last[i] ? 0 : rem[i + 1] + step;
  // per stroke: first sample index and length; lay coordinate (strokes in
  // order, with the hop between them counted as travel)
  const base = new Int32Array(n), first = [], lens = [], sl = new Float32Array(n);
  let b = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    if (strokeStart[i]) {
      if (i > 0) acc += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
      b = i; first.push(i);
    } else acc += step;
    base[i] = b; sl[i] = acc;
    if (last[i]) lens.push(s[i]);
  }
  const r = { x, y, nx, ny, s, rem, n, strokeStart, last, base, first, lens, sl, layLen: acc, maxLen: Math.max(...lens) };
  cache.set(key, r);
  return r;
}
