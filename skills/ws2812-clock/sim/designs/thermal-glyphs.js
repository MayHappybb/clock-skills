// Thermal: finger-written digits, as paths a fingertip follows.
// Each digit is a list of pen-down strokes; each stroke is a list of pieces
// (Catmull-Rom splines through points in a 0..1 box), joined at sharp corners.
// The per-pixel "heat map" of a placed glyph stores, for every pixel near the
// ink, the distance to the stroke and WHEN (as a fraction of the trace time)
// the fingertip passed the nearest point, so the heat can be aged per pixel.

const D = {
  0: [[[[0.58, 0.03], [0.24, 0.1], [0.05, 0.42], [0.12, 0.82], [0.42, 0.99], [0.76, 0.9], [0.95, 0.56], [0.9, 0.2], [0.66, 0.02], [0.4, 0.06]]]],
  1: [[[[0.16, 0.26], [0.42, 0.14], [0.66, 0.0]], [[0.66, 0.0], [0.62, 0.5], [0.58, 1.0]]]],
  2: [[[[0.08, 0.26], [0.3, 0.04], [0.66, 0.02], [0.9, 0.22], [0.8, 0.48], [0.44, 0.76], [0.04, 0.99]], [[0.04, 0.99], [0.5, 0.95], [0.98, 0.97]]]],
  3: [[[[0.1, 0.14], [0.45, 0.0], [0.84, 0.1], [0.86, 0.32], [0.56, 0.47], [0.36, 0.48]], [[0.36, 0.48], [0.62, 0.5], [0.94, 0.66], [0.9, 0.88], [0.58, 1.0], [0.24, 0.98], [0.04, 0.84]]]],
  4: [[[[0.64, 0.0], [0.0, 0.68]], [[0.0, 0.68], [1.0, 0.68]]], [[[0.76, 0.28], [0.74, 1.0]]]],
  5: [[[[0.86, 0.02], [0.2, 0.04]], [[0.2, 0.04], [0.13, 0.46]], [[0.13, 0.46], [0.46, 0.38], [0.84, 0.48], [0.94, 0.72], [0.76, 0.95], [0.4, 1.0], [0.04, 0.88]]]],
  6: [[[[0.82, 0.04], [0.46, 0.1], [0.16, 0.4], [0.07, 0.72], [0.28, 0.97], [0.64, 0.98], [0.9, 0.78], [0.8, 0.54], [0.5, 0.48], [0.2, 0.6], [0.09, 0.74]]]],
  7: [[[[0.02, 0.04], [0.97, 0.03]], [[0.97, 0.03], [0.72, 0.34], [0.5, 0.67], [0.38, 1.0]]]],
  8: [[[[0.84, 0.15], [0.52, 0.0], [0.18, 0.12], [0.2, 0.35], [0.5, 0.5], [0.84, 0.66], [0.86, 0.88], [0.5, 1.0], [0.14, 0.88], [0.16, 0.66], [0.5, 0.5], [0.8, 0.34], [0.82, 0.17]]]],
  9: [[[[0.9, 0.2], [0.62, 0.02], [0.22, 0.06], [0.08, 0.3], [0.28, 0.52], [0.64, 0.5], [0.9, 0.24]], [[0.9, 0.24], [0.87, 0.62], [0.8, 1.0]]]],
};

/** Catmull-Rom through pts, sampled densely; a 2-point piece is a line. */
function spline(pts, n = 16) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const HOP = 0.55;   // a pen-up hop between strokes costs this many digit-heights of "time"

/**
 * A glyph placed at box (x, y, w, h) px with slant: strokes as dense
 * polylines in pixels, plus a timeline: each stroke [f0, f1] in trace-time
 * fraction, hops in between.
 */
export function placed(ch, x, y, w, h, slant) {
  const strokes = D[ch].map((st) => {
    const pts = [];
    for (const pc of st) {
      const s = spline(pc);
      for (const [u, v] of (pts.length ? s.slice(1) : s)) pts.push([x + u * w + (1 - v) * h * slant, y + v * h]);
    }
    // resample by arc length
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / 0.3));
    const res = [];
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * L;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      res.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
    }
    return { pts: res, len: L };
  });
  const total = strokes.reduce((a, s) => a + s.len, 0) + HOP * h * (strokes.length - 1);
  let acc = 0;
  for (const s of strokes) { s.f0 = acc / total; acc += s.len; s.f1 = acc / total; acc += HOP * h; }
  return { strokes };
}

/** Fingertip position at trace fraction f (0..1); pen = 1 while touching. */
export function tipAt(g, f) {
  const S = g.strokes;
  for (let k = 0; k < S.length; k++) {
    const s = S[k];
    if (f <= s.f1 || k === S.length - 1) {
      if (f < s.f0 && k > 0) {     // hop from the end of the previous stroke
        const a = S[k - 1].pts.at(-1), b = s.pts[0], u = (f - S[k - 1].f1) / (s.f0 - S[k - 1].f1);
        const e = u * u * (3 - 2 * u);
        return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, 0];
      }
      const u = Math.max(0, Math.min(1, (f - s.f0) / (s.f1 - s.f0))) * (s.pts.length - 1);
      const i = Math.min(s.pts.length - 2, Math.floor(u)), t = u - i;
      const p = s.pts[i], q = s.pts[i + 1];
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 1];
    }
  }
  return [...S.at(-1).pts.at(-1), 0];
}

/**
 * Heat map of a placed glyph on a W x H raster: for each pixel within
 * `reach` px, the nearest stroke point (distance^2 and trace fraction) and a
 * second, far-along-the-path candidate (for crossings and close passes).
 */
export function heatMap(g, W, H, reach = 6) {
  const all = [];
  for (const s of g.strokes) {
    const n = s.pts.length - 1;
    s.pts.forEach((p, k) => {
      // pressure: the finger dwells where it touches down, and a little where it lifts
      const a = s.len * (k / n), z = s.len - a;
      all.push(p[0], p[1], s.f0 + (s.f1 - s.f0) * (k / n), a + s.f0 * 1000, 1 + 0.75 * Math.exp(-a / 1.6) + 0.3 * Math.exp(-z / 1.4));
    });
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < all.length; k += 5) { x0 = Math.min(x0, all[k]); x1 = Math.max(x1, all[k]); y0 = Math.min(y0, all[k + 1]); y1 = Math.max(y1, all[k + 1]); }
  x0 = Math.max(0, Math.floor(x0 - reach)); y0 = Math.max(0, Math.floor(y0 - reach));
  x1 = Math.min(W - 1, Math.ceil(x1 + reach)); y1 = Math.min(H - 1, Math.ceil(y1 + reach));
  const pix = [], f1 = [], d1 = [], f2 = [], d2 = [], w1 = [], w2 = [];
  const R2 = reach * reach;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let bd = 1e9, bf = 0, bs = 0, bw = 1;
    for (let k = 0; k < all.length; k += 5) {
      const dx = all[k] - x, dy = all[k + 1] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bf = all[k + 2]; bs = all[k + 3]; bw = all[k + 4]; }
    }
    if (bd > R2) continue;
    // second candidate: nearest point at least ~5 px of path away from the first
    let cd = 1e9, cf = -1, cw = 1;
    for (let k = 0; k < all.length; k += 5) {
      if (Math.abs(all[k + 3] - bs) < 5) continue;
      const dx = all[k] - x, dy = all[k + 1] - y, d = dx * dx + dy * dy;
      if (d < cd) { cd = d; cf = all[k + 2]; cw = all[k + 4]; }
    }
    pix.push(y * W + x); f1.push(bf); d1.push(bd); w1.push(bw); w2.push(cw);
    if (cd <= R2 && cd < bd + 9) { f2.push(cf); d2.push(cd); } else { f2.push(-1); d2.push(0); }
  }
  return { pix: Int32Array.from(pix), f1: Float32Array.from(f1), d1: Float32Array.from(d1), f2: Float32Array.from(f2), d2: Float32Array.from(d2), w1: Float32Array.from(w1), w2: Float32Array.from(w2) };
}
