// Murmuration digits: each numeral is a ribbon the flock flies along, not an
// outline to fill. Skeletons are a few control points [x, y, width] in a
// unit box (y down), threaded with a Catmull-Rom spline; most digits are one
// unbroken stroke, as a flock is one ribbon. Open strokes become racetracks:
// birds stream out along one side, round the end and back along the other.
export const DIGITS = {
  0: [{ closed: true, p: [[0.5, 0, 1], [0.88, 0.14, 1], [1, 0.5, 1.15], [0.86, 0.87, 1], [0.5, 1, 0.95], [0.13, 0.86, 1], [0, 0.5, 1.15], [0.14, 0.13, 1]] }],
  1: [{ p: [[0.12, 0.3, 0.75], [0.4, 0.15, 0.9], [0.68, 0, 1.05], [0.64, 0.36, 1.15], [0.6, 0.7, 1.15], [0.57, 1, 1.05]] }],
  2: [{ p: [[0.06, 0.24, 0.85], [0.38, 0, 1], [0.82, 0.07, 1], [0.94, 0.3, 1.05], [0.66, 0.6, 1.05], [0.3, 0.83, 1], [0.03, 1, 1], [0.5, 0.95, 1.05], [1, 0.97, 1]] }],
  3: [{ p: [[0.08, 0.1, 0.85], [0.5, 0, 1], [0.88, 0.17, 1], [0.78, 0.4, 1], [0.4, 0.47, 0.9], [0.86, 0.58, 1], [1, 0.8, 1.1], [0.6, 1, 1], [0.04, 0.88, 0.85]] }],
  4: [{ p: [[0.72, 0.01, 1], [0.37, 0.35, 1], [0.02, 0.7, 1], [0.5, 0.71, 1], [1, 0.7, 0.95]] },
      { p: [[0.73, 0.0, 1], [0.73, 0.5, 1.1], [0.73, 1, 1.1]] }],
  5: [{ p: [[0.94, 0.02, 0.85], [0.56, 0.02, 1], [0.2, 0.02, 1], [0.15, 0.24, 1], [0.12, 0.46, 1], [0.52, 0.37, 1], [0.93, 0.55, 1.05], [0.95, 0.83, 1.05], [0.55, 1, 1], [0.04, 0.9, 0.85]] }],
  6: [{ p: [[0.84, 0.06, 0.85], [0.45, 0.01, 1], [0.12, 0.3, 1.05], [0.03, 0.65, 1.1], [0.24, 0.97, 1], [0.7, 0.98, 1], [0.97, 0.72, 1], [0.76, 0.45, 1], [0.36, 0.47, 1], [0.05, 0.66, 0.9]] }],
  7: [{ p: [[0.02, 0.03, 1], [0.5, 0.0, 1], [0.98, 0.03, 1], [0.72, 0.38, 1.05], [0.52, 0.7, 1.1], [0.42, 1, 1.05]] }],
  8: [{ closed: true, p: [[0.5, 0.48, 0.9], [0.86, 0.26, 1], [0.5, 0, 1], [0.15, 0.24, 1], [0.5, 0.48, 0.9], [0.93, 0.74, 1.05], [0.5, 1, 1], [0.07, 0.74, 1.05]] }],
  9: [{ p: [[0.95, 0.34, 0.9], [0.62, 0.53, 1], [0.16, 0.46, 1.05], [0.08, 0.15, 1], [0.5, 0, 1], [0.92, 0.2, 1.05], [0.94, 0.55, 1.1], [0.78, 0.86, 1], [0.44, 1, 1], [0.12, 0.94, 0.85]] }],
};

const STEP = 0.25;   // px between samples along a stroke

/** Catmull-Rom point (uniform) through p0..p3 at u. */
function cr(a, b, c, d, u, k) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u3);
}

/**
 * Build digit d in the box (x, y, w, h) px with italic `slant` (fraction of h).
 * Returns { strokes: [{ closed, L, X, Y, NX, NY, TX, TY, WD }], total } where
 * every array is sampled each STEP px along the stroke and total is the sum
 * of nominal loop lengths (2L for open strokes, L for closed).
 */
export function buildDigit(d, box) {
  const { x, y, w, h, slant } = box;
  const strokes = [];
  for (const s of DIGITS[d]) {
    const P = s.p.map(([u, v, wd]) => [x + u * w + (1 - v) * slant * h, y + v * h, wd]);
    const n = P.length, segs = s.closed ? n : n - 1;
    const get = (i) => (s.closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    // dense polyline
    const dense = [];
    for (let i = 0; i < segs; i++) {
      const a = get(i - 1), b = get(i), c = get(i + 1), e = get(i + 2);
      for (let k = 0; k < 24; k++) {
        const u = k / 24;
        dense.push([cr(a, b, c, e, u, 0), cr(a, b, c, e, u, 1), b[2] + (c[2] - b[2]) * u]);
      }
    }
    dense.push(s.closed ? dense[0] : [P[n - 1][0], P[n - 1][1], P[n - 1][2]]);
    // resample by arc length
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const L = cum[cum.length - 1], m = Math.max(2, Math.ceil(L / STEP) + 1);
    const X = new Float32Array(m), Y = new Float32Array(m), WD = new Float32Array(m);
    let j = 0;
    for (let q = 0; q < m; q++) {
      const sq = (q / (m - 1)) * L;
      while (j < cum.length - 2 && cum[j + 1] < sq) j++;
      const f = (sq - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      X[q] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
      Y[q] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
      WD[q] = dense[j][2] + (dense[j + 1][2] - dense[j][2]) * f;
    }
    const TX = new Float32Array(m), TY = new Float32Array(m), NX = new Float32Array(m), NY = new Float32Array(m);
    for (let q = 0; q < m; q++) {
      const a = s.closed ? (q - 1 + m - 1) % (m - 1) : Math.max(0, q - 1);
      const b = s.closed ? (q + 1) % (m - 1) : Math.min(m - 1, q + 1);
      let tx = X[b] - X[a], ty = Y[b] - Y[a];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      TX[q] = tx; TY[q] = ty; NX[q] = -ty; NY[q] = tx;
    }
    strokes.push({ closed: !!s.closed, L, m, X, Y, NX, NY, TX, TY, WD, step: L / (m - 1) });
  }
  let total = 0, len = 0;
  for (const s of strokes) len += s.L;
  for (const s of strokes) total += s.closed ? s.L : 2 * s.L;
  let acc = 0;
  for (const s of strokes) { s.c0 = acc / total; acc += s.closed ? s.L : 2 * s.L; s.c1 = acc / total; }
  return { strokes, total, len };
}
