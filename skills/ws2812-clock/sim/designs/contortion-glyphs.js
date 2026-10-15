// Contortion: the ten acrobats' bodies. Each digit is ONE rubber tube, drawn
// as a single stroke in a 10 x 16 box (y down), with a head somewhere on top.
// A repeated point is a corner. Every body is resampled to N points at equal
// arc length, so any digit can bend into any other by interpolating the
// heading of each body segment (a real bend: the chain stays a chain).

export const N = 48;
export const BOX_W = 10, BOX_H = 16;

const oval = [];
for (let k = 0; k <= 22; k++) {
  const a = 0.02 + (k / 22) * (Math.PI * 2 - 0.5);
  oval.push([5 + 4.35 * Math.sin(a), 8 - 7.65 * Math.cos(a) + 0.35 * Math.sin(a) ** 2]);
}

// [path, face point]
const DEF = {
  0: [oval, [5, 0.6]],
  1: [[[1.4, 4.9], [3.7, 2.6], [5.6, 0.4], [5.6, 0.4], [5.6, 8], [5.6, 15.6], [5.6, 15.6], [8.6, 15.6]], [5.6, 0.9]],
  2: [[[0.9, 4.4], [1.6, 1.7], [5.0, 0.3], [8.5, 1.7], [9.0, 4.6], [7.3, 8.0], [1.0, 15.6], [1.0, 15.6], [9.5, 15.6]], [5.0, 0.6]],
  3: [[[0.8, 2.8], [2.9, 0.6], [6.0, 0.3], [8.7, 2.2], [8.5, 5.4], [5.6, 7.3], [4.2, 7.6], [4.2, 7.6], [6.4, 7.9], [9.1, 10.0], [9.3, 13.0], [7.0, 15.4], [3.8, 15.8], [0.8, 13.8]], [5.6, 0.6]],
  4: [[[9.9, 11.0], [0.4, 11.0], [0.4, 11.0], [7.0, 0.4], [7.0, 0.4], [7.0, 8], [7.0, 15.9]], [7.0, 1.0]],
  5: [[[9.2, 0.4], [1.9, 0.4], [1.9, 0.4], [1.3, 7.2], [1.3, 7.2], [4.8, 5.8], [8.1, 6.8], [9.4, 10.5], [8.2, 14.5], [4.8, 15.8], [0.9, 14.2]], [4.6, 0.7]],
  6: [[[8.7, 1.6], [6.1, 0.3], [2.7, 1.1], [0.9, 5.3], [0.9, 10.6], [2.3, 14.6], [5.0, 15.8], [8.2, 14.7], [9.3, 11.5], [8.0, 8.2], [5.0, 7.0], [2.0, 8.2], [0.9, 10.6]], [5.4, 0.6]],
  7: [[[0.5, 0.4], [9.5, 0.4], [9.5, 0.4], [6.1, 7.0], [3.9, 15.9]], [8.4, 0.7]],
  8: [[[5.0, 0.3], [1.7, 1.7], [1.5, 5.2], [5.0, 7.6], [8.8, 10.1], [9.1, 13.8], [5.0, 15.8], [0.9, 13.8], [1.2, 10.1], [5.0, 7.6], [8.5, 5.2], [8.3, 1.7], [5.6, 0.3]], [5.0, 0.6]],
  9: [[[1.3, 14.4], [4.0, 15.7], [7.3, 14.9], [9.1, 10.7], [9.1, 5.4], [7.7, 1.4], [5.0, 0.2], [1.8, 1.3], [0.7, 4.7], [2.0, 8.0], [5.0, 9.0], [8.0, 7.8], [9.1, 5.4]], [5.0, 0.6]],
};

/** Uniform Catmull-Rom through the points, densely sampled. */
function dense(p) {
  const out = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
    for (let s = 0; s < 24; s++) {
      const t = s / 24, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

function build(d) {
  const [path, face] = DEF[d];
  return fromDense(d, dense(path), face);
}

function fromDense(d, q, face) {
  const cum = [0];
  for (let i = 1; i < q.length; i++) cum.push(cum[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
  const L = cum[cum.length - 1];
  const pts = new Float64Array(2 * N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / (N - 1)) * L;
    while (j < q.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts[2 * k] = q[j][0] + (q[j + 1][0] - q[j][0]) * f;
    pts[2 * k + 1] = q[j][1] + (q[j + 1][1] - q[j][1]) * f;
  }
  const th = new Float64Array(N - 1);
  for (let k = 0; k < N - 1; k++) {
    let a = Math.atan2(pts[2 * k + 3] - pts[2 * k + 1], pts[2 * k + 2] - pts[2 * k]);
    if (k) a += Math.round((th[k - 1] - a) / (2 * Math.PI)) * 2 * Math.PI;
    th[k] = a;
  }
  let cx = 0, cy = 0;
  for (let k = 0; k < N; k++) { cx += pts[2 * k]; cy += pts[2 * k + 1]; }
  let fi = 0, best = 1e9;
  for (let k = 0; k < N; k++) {
    const dd = Math.hypot(pts[2 * k] - face[0], pts[2 * k + 1] - face[1]);
    if (dd < best) { best = dd; fi = k; }
  }
  const far = (k) => Math.hypot(pts[2 * k] - pts[2 * fi], pts[2 * k + 1] - pts[2 * fi + 1]) > 1.6;
  return { d, pts, th, L, cx: cx / N, cy: cy / N, face: fi, mitA: far(0), mitB: far(N - 1) };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

/**
 * The bridge: the contortionist's backbend, an arch standing on hands and
 * feet, open underneath like no digit is. sigma picks which foot it starts from.
 */
function bridge(id, sigma) {
  const q = [];
  for (let t = 0; t <= 1; t += 0.004) {
    // up the left leg, over the top, down the right leg
    const L1 = 0.27, ang = Math.PI * (t - L1) / (1 - 2 * L1);
    let x, y;
    if (t < L1) { x = 0.6; y = 15.9 - (15.9 - 8.2) * t / L1; }
    else if (t > 1 - L1) { x = 9.4; y = 8.2 + (15.9 - 8.2) * (t - 1 + L1) / L1; }
    else { x = 5 - 4.4 * Math.cos(ang); y = 8.2 - 6.2 * Math.sin(ang); }
    q.push(sigma > 0 ? [x, y] : [10 - x, y]);
  }
  const g = fromDense(id, q, q[0]);
  g.face = Math.round(0.5 * (N - 1));
  g.mitA = g.mitB = true;
  return g;
}
export const BRIDGES = { [1]: bridge(12, 1), [-1]: bridge(13, -1) };
/** Which way digit d curls up: the way its own stroke mostly turns. */
// (overridden where the natural way passes through the look of another
// digit: a 9 that closes its loop first reads as 0)
const CURL = { 9: 1 };
export const curlOf = (d) => CURL[d] ?? (GLYPHS[d].th[N - 2] - GLYPHS[d].th[0] >= 0 ? 1 : -1);

const offs = new Map();
/**
 * The body bending from digit a to digit b at e (0..1), into out (units).
 * Segment headings are interpolated (the shortest overall way round), the
 * length runs between the two, and the centroid glides. `wave` adds a
 * travelling bend (radians) so the middle of the move is a wriggle, not a blend;
 * `lag` makes the change run down the body from its first end (or, negative,
 * from its last).
 * A and B are glyphs (GLYPHS or BALLS). Returns the body length and the
 * (fractional) face index.
 */
export function bend(A, B, e, wave, phase, out, glide = 0.3, lag = 0) {
  const key = A.d * 16 + B.d;
  let off = offs.get(key);
  if (off === undefined) {
    let s = 0;
    for (let k = 0; k < N - 1; k++) s += A.th[k] - B.th[k];
    off = Math.round(s / (N - 1) / (2 * Math.PI)) * 2 * Math.PI;
    offs.set(key, off);
  }
  const L = A.L + (B.L - A.L) * e, seg = L / (N - 1), lg = Math.abs(lag);
  let x = 0, y = 0, sx = 0, sy = 0;
  out[0] = 0; out[1] = 0;
  for (let k = 0; k < N - 1; k++) {
    const ek = Math.min(1, Math.max(0, e * (1 + lg) - lg * (lag < 0 ? 1 - k / (N - 1) : k / (N - 1))));
    const t = A.th[k] + (B.th[k] + off - A.th[k]) * ek + wave * Math.sin(k * 0.42 - phase);
    x += Math.cos(t) * seg; y += Math.sin(t) * seg;
    out[2 * k + 2] = x; out[2 * k + 3] = y;
    sx += x; sy += y;
  }
  const dx = A.cx + (B.cx - A.cx) * e - sx / N, dy = A.cy + (B.cy - A.cy) * e - sy / N;
  // mostly bend, a little glide toward the straight point blend, which
  // keeps the body compact while it wriggles
  const g1 = 1 - glide;
  for (let k = 0; k < 2 * N; k += 2) {
    const ek = Math.min(1, Math.max(0, e * (1 + lg) - lg * (lag < 0 ? 1 - k / (2 * N - 2) : k / (2 * N - 2))));
    out[k] = g1 * (out[k] + dx) + glide * (A.pts[k] + (B.pts[k] - A.pts[k]) * ek);
    out[k + 1] = g1 * (out[k + 1] + dy) + glide * (A.pts[k + 1] + (B.pts[k + 1] - A.pts[k + 1]) * ek);
  }
  return { L, face: A.face + (B.face - A.face) * e };
}
