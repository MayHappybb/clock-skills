// Latte: the pour font. Each digit is ONE continuous pour of milk, drawn as
// a Catmull-Rom path in a 10 x 14 box. The stream lands heavy (a round
// dollop where the pour starts), thins as the jug lifts, and ends in a fine
// pull-through tail. Along the way the barista's wiggle leaves rosetta
// ripples on the edge. Rasterised per slot to a signed-distance field (px),
// plus the pour order (arc length) at each pixel, so the face can reveal the
// stroke as it is poured and advect it when it is stirred away.

// [x, y] control points; a point with a third entry 1 is a sharp corner.
const G = {
  '0': [[5, 0.8], [1.9, 2.6], [1.0, 7], [1.9, 11.6], [5, 13.3], [8.1, 11.6], [9, 7], [8.2, 2.5], [5, 0.8], [3.2, 1.6]],
  '1': [[6.0, 13.4], [6.0, 7], [6.0, 0.6, 1], [4.0, 2.4], [1.6, 3.9]],
  '2': [[1.3, 3.8], [2.6, 1.2], [5.3, 0.6], [8.3, 2.0], [8.5, 4.6], [6.4, 7.7], [1.0, 13.3, 1], [5.5, 13.2], [9.4, 13.2]],
  '3': [[1.4, 2.0], [4.8, 0.6], [8.3, 1.9], [8.1, 5.0], [4.6, 6.6, 1], [8.7, 8.2], [8.6, 11.8], [5.0, 13.4], [1.2, 11.9]],
  '4': [[6.9, 13.4], [6.9, 7], [6.9, 0.6, 1], [3.6, 5.3], [0.8, 9.5, 1], [5.2, 9.5], [9.5, 9.5]],
  '5': [[9.0, 0.8], [5.2, 0.8], [2.2, 0.8, 1], [1.7, 6.2, 1], [5.4, 5.0], [8.8, 7.4], [8.7, 11.5], [5.0, 13.4], [1.1, 11.8]],
  '6': [[8.2, 1.4], [5.0, 0.7], [2.0, 2.7], [1.0, 8.0], [2.3, 12.4], [5.2, 13.4], [8.5, 11.7], [8.6, 8.4], [5.6, 6.5], [2.4, 7.4], [1.3, 9.2]],
  '7': [[0.8, 0.8], [5.0, 0.8], [9.4, 0.8, 1], [7.0, 4.8], [5.0, 9.0], [4.2, 13.4]],
  '8': [[5.0, 6.6], [8.0, 4.6], [7.9, 1.6], [5.0, 0.6], [2.1, 1.6], [2.1, 4.6], [5.0, 6.6], [8.9, 9.2], [8.0, 12.7], [5.0, 13.4], [2.0, 12.7], [1.1, 9.2], [5.0, 6.6]],
  '9': [[6.9, 13.4], [8.4, 8.8], [9.0, 4.2], [8.1, 1.5], [5.2, 0.5], [2.3, 1.3], [1.0, 4.2], [2.8, 7.4], [6.0, 7.8], [8.7, 6.0]],
};

/** Catmull-Rom path through the control points, split at corners: [[x, y]...] in box units. */
function path(pts) {
  const runs = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    runs[runs.length - 1].push(pts[i]);
    if (pts[i][2] && i < pts.length - 1) runs.push([pts[i]]);
  }
  const out = [];
  for (const r of runs) {
    for (let i = 0; i + 1 < r.length; i++) {
      const p0 = r[Math.max(0, i - 1)], p1 = r[i], p2 = r[i + 1], p3 = r[Math.min(r.length - 1, i + 2)];
      for (let k = out.length && i === 0 ? 1 : (i === 0 ? 0 : 1); k <= 8; k++) {
        const t = k / 8, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
  }
  return out;
}
const PATHS = Object.fromEntries(Object.entries(G).map(([d, p]) => [d, path(p)]));

const W = 64, H = 64, N = W * H;
const cache = new Map();

/**
 * The pour of digit d in slot box s = { x, y, w, h, rmax, rmin, slant }.
 * ros > 0 cuts deeper rosetta leaves into the edge (the hour's grand pour).
 * Returns { sd, S, L, x0, y0, x1, y1 }: signed distance (px, < 0 inside),
 * arc length of the nearest pour point (px), total length, bbox.
 */
export function pour(d, s, key, ros = 0) {
  const ck = key + d + ':' + ros;
  let g = cache.get(ck);
  if (g) return g;
  const P = PATHS[d].map(([u, v]) => [s.x + (u / 10) * s.w + ((14 - v) / 14) * s.slant, s.y + (v / 14) * s.h]);
  const n = P.length, A = new Float32Array(n);
  for (let i = 1; i < n; i++) A[i] = A[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const L = A[n - 1];
  // radius along the pour: dollop at the start, thick to thin, rosetta ripple
  const amp = 0.16, lam = 3.0;
  const rad = (a) => {
    const u = a / L;
    const base = s.rmax + (s.rmin - s.rmax) * u ** 0.9 + s.rmax * 0.32 * Math.exp(-((a / 1.6) ** 2));
    return base * (1 + amp * Math.sin((a / lam) * Math.PI * 2) * Math.min(1, a / 3) * (1 - 0.6 * u));
  };
  const sd = new Float32Array(N).fill(99), S = new Float32Array(N);
  const x0 = Math.max(0, Math.floor(s.x - 4)), x1 = Math.min(W - 1, Math.ceil(s.x + s.w + s.slant + 4));
  const y0 = Math.max(0, Math.floor(s.y - 4)), y1 = Math.min(H - 1, Math.ceil(s.y + s.h + 4));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let best = 99, bs = 0, bd = 99, ba = 0, bv = 0;
      for (let i = 0; i + 1 < n; i++) {
        const ax = P[i][0], ay = P[i][1], dx = P[i + 1][0] - ax, dy = P[i + 1][1] - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const a = A[i] + (A[i + 1] - A[i]) * t;
        const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        const v = d - rad(a);
        if (v < best) { best = v; bs = a; }
        if (d < bd) { bd = d; ba = a; bv = (dx * (y - ay) - dy * (x - ax)) >= 0 ? d : -d; }
      }
      if (ros) {
        // rosetta: the wiggled jug lays crescent leaves across the path,
        // bent back from the pour direction, split by the pull-through line
        const u = ba / L, R = s.rmax * (1.05 - 0.3 * u) + 0.2;
        const ph = (ba + 0.55 * bv * bv / R) / 3.1;
        const st = Math.cos(ph * Math.PI * 2);
        const leaf = Math.max(Math.abs(bv) - R, (-0.15 - st) * 0.9);
        const line = Math.abs(bv) - 0.55;
        best = Math.min(leaf, line);
        bs = ba;
      }
      sd[y * W + x] = best; S[y * W + x] = bs;
    }
  }
  g = { sd, S, L, x0, y0, x1, y1, P, A };
  cache.set(ck, g);
  return g;
}

/** Point on the pour at arc length a (for the jug's stream), and its direction. */
export function along(g, a) {
  const { P, A } = g;
  let i = 1;
  while (i < A.length - 1 && A[i] < a) i++;
  const t = Math.max(0, Math.min(1, (a - A[i - 1]) / (A[i] - A[i - 1] || 1)));
  const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dy) || 1;
  return [P[i - 1][0] + dx * t, P[i - 1][1] + dy * t, dx / l, dy / l];
}
