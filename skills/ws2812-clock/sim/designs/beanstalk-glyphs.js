// Beanstalk digits: each numeral is one tendril (a few strokes joined at
// corners) drawn in a 26 x 38 pixel box, smoothed by Catmull-Rom, with spiral
// curls on its free ends. A tendril grows out of the stalk through a short
// branch that meets it at a "junction"; from there it grows both ways, thick
// at the junction and thin at the tips. Built once per digit and per side
// (stalk on the left of the box, or on the right).

export const BOX_W = 26, BOX_H = 38;
const R_BASE = 2.0, R_TIP = 0.72, STEP = 0.6;

function zero() {
  const pts = [], cx = 13, cy = 19, rx = 9.8, ry = 16.2, a0 = -Math.PI / 2 - 0.55, a1 = a0 + 2 * Math.PI + 0.3;
  for (let a = a0; a <= a1 + 1e-6; a += 0.22) {
    const k = 1 - 0.2 * Math.max(0, Math.min(1, (a - (a1 - 0.9)) / 0.9)) ** 2;
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
  }
  return [pts];
}

// strokes: polylines meeting at corners; curl: [start, end] turn sign (0 none)
const RAW = {
  0: { strokes: zero(), curl: [0, 1] },
  1: { strokes: [[[15, 36], [14.5, 27], [14, 17], [14.2, 8], [14.6, 3]], [[14.6, 3], [11.5, 4.6], [8.6, 7.6], [6.6, 10.6]]], curl: [0, 1], j: 0 },
  2: { strokes: [[[4.5, 9.5], [6.5, 4.5], [12.5, 2.6], [19, 4], [22, 9.5], [20.5, 15.5], [15.5, 21], [9, 27.5], [4, 35]], [[4, 35], [12, 35.2], [22.5, 35]]], curl: [-1, -1] },
  3: { strokes: [[[4, 7], [8.5, 3.3], [15, 2.6], [20.5, 5.5], [21, 11], [17, 16], [11.5, 18]], [[11.5, 18], [18, 19.5], [22.5, 24.5], [22.5, 30.5], [18.5, 34.8], [11, 35.6], [4.5, 32.5]]], curl: [-1, 1] },
  4: { strokes: [[[17, 36], [17, 20], [17, 3]], [[17, 3], [11, 11.5], [4, 24.5]], [[4, 24.5], [13, 24.5], [23, 24.5]]], curl: [0, -1] },
  5: { strokes: [[[21.5, 3.2], [14, 3], [7, 3]], [[7, 3], [6.2, 10], [5.8, 16.5]], [[5.8, 16.5], [11, 14], [17.5, 14.5], [22, 19.5], [22.5, 27], [19, 33.5], [12, 35.6], [4.5, 32.5]]], curl: [1, 1] },
  6: { strokes: [[[20.5, 5], [16, 2.8], [10, 4], [5.5, 10], [4, 18], [4.5, 26], [8, 33], [13.5, 35.6], [19, 33.5], [22, 27], [21, 21], [16.5, 17], [10.5, 17.5], [6, 21.5], [4.8, 25.5]]], curl: [1, 0] },
  7: { strokes: [[[3.5, 3], [13, 3], [22.5, 3]], [[22.5, 3], [18, 11], [14, 19], [11.5, 27], [10.5, 36]]], curl: [-1, 0] },
  8: { strokes: [[[19, 6], [15, 3], [10, 3], [6, 6], [6.5, 11], [13, 17.5], [20, 23], [21.5, 29.5], [17.5, 35], [9, 35.5], [4.8, 30], [6, 23], [13, 17.5], [19, 12], [20.2, 7.5]]], curl: [0, -1] },
  9: { strokes: [[[21, 11], [18.5, 4.8], [12.5, 2.6], [6.5, 4.8], [4.2, 10.5], [6.5, 16.5], [12.5, 18.8], [18.5, 16.5], [21.8, 11]], [[21.8, 11], [22, 19], [20.5, 27], [16.5, 33.5], [10, 35.6], [5, 33]]], curl: [0, 1] },
};

/** Catmull-Rom through pts, densely sampled. */
function crDense(pts) {
  const n = pts.length, out = [];
  const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i ? pts[i - 1] : ext(pts[0], pts[1]), p1 = pts[i], p2 = pts[i + 1];
    const p3 = i + 2 < n ? pts[i + 2] : ext(pts[n - 1], pts[n - 2]);
    for (let k = 0; k < 20; k++) {
      const t = k / 20, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}
/** Resample a dense polyline at equal arc length. */
function resample(d, step) {
  const out = [d[0]];
  let acc = 0;
  for (let i = 1; i < d.length; i++) {
    let [ax, ay] = d[i - 1];
    const [bx, by] = d[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      ax += (bx - ax) * t; ay += (by - ay) * t;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay); acc = 0;
    }
    acc += seg;
  }
  const last = d[d.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last);
  return out;
}
/** A spiral leaving p heading `ang`, turning with sign sg. */
function curlFrom(p, ang, sg) {
  const out = [];
  let [x, y] = p, phi = ang, turned = 0;
  const total = 1.55 * Math.PI;
  while (turned < total) {
    const r = 2.5 * (1 - 0.55 * turned / total), st = 0.25;
    phi += (sg * st) / r; turned += st / r;
    x += st * Math.cos(phi); y += st * Math.sin(phi);
    out.push([x, y]);
  }
  return out;
}

function build(raw, side) {
  // side: +1 = stalk to the right of the box, -1 = stalk to the left
  let core = [];
  for (const s of raw.strokes) { const d = crDense(s); core = core.length ? core.concat(d.slice(1)) : d; }
  core = resample(core, STEP);
  const n = core.length;
  // junction: an end near the stalk side if there is one, else the extreme point
  let j;
  if (raw.j !== undefined) j = Math.round(raw.j * (n - 1));
  else {
    let best = 0;
    for (let i = 0; i < n; i++) if (core[i][0] * side > core[best][0] * side) best = i;
    const ex = core[best][0] * side;
    const e0 = ex - core[0][0] * side, e1 = ex - core[n - 1][0] * side;
    j = e0 < 2.5 && e0 <= e1 ? 0 : e1 < 2.5 ? n - 1 : best;
  }
  // curls on free ends
  let pre = [], post = [];
  if (raw.curl[0] && j !== 0) {
    const a = Math.atan2(core[0][1] - core[2][1], core[0][0] - core[2][0]);
    pre = resample([core[0], ...curlFrom(core[0], a, raw.curl[0])], STEP).slice(1).reverse();
  }
  if (raw.curl[1] && j !== n - 1) {
    const a = Math.atan2(core[n - 1][1] - core[n - 3][1], core[n - 1][0] - core[n - 3][0]);
    post = resample([core[n - 1], ...curlFrom(core[n - 1], a, raw.curl[1])], STEP).slice(1);
  }
  const pts = [...pre, ...core, ...post];
  const N = pts.length, J = j + pre.length;
  const xs = new Float32Array(N), ys = new Float32Array(N), rs = new Float32Array(N), ds = new Float32Array(N);
  const L0 = J * STEP, L1 = (N - 1 - J) * STEP;
  for (let i = 0; i < N; i++) {
    xs[i] = pts[i][0]; ys[i] = pts[i][1];
    const d = Math.abs(i - J) * STEP, Ld = i < J ? L0 : L1;
    ds[i] = d;
    const q = Ld > 0 ? d / Ld : 0;
    rs[i] = R_TIP + (R_BASE - R_TIP) * (1 - q) ** 0.85;
  }
  // direction the tendril leaves the junction (for the branch to flow into)
  let tin;
  if (J === 0) tin = [xs[2] - xs[0], ys[2] - ys[0]];
  else if (J === N - 1) tin = [xs[N - 3] - xs[N - 1], ys[N - 3] - ys[N - 1]];
  else tin = [-side, 0];
  const tl = Math.hypot(tin[0], tin[1]); tin = [tin[0] / tl, tin[1] / tl];
  // leaves: along the core, on whichever side has more room
  const leaves = [];
  const clearance = (px, py, skip) => {
    let m = 1e9;
    for (let i = 0; i < N; i += 2) if (Math.abs(i - skip) > 12) m = Math.min(m, Math.hypot(xs[i] - px, ys[i] - py));
    return m;
  };
  for (const dir of [-1, 1]) {
    for (let d = 7; ; d += 13) {
      const i = J + dir * Math.round(d / STEP);
      if (i < pre.length + 2 || i > pre.length + n - 3) break;
      const tx = xs[i + 1] - xs[i - 1], ty = ys[i + 1] - ys[i - 1], tlen = Math.hypot(tx, ty);
      const nx = -ty / tlen, ny = tx / tlen;
      let bestS = 0, bestC = 0;
      for (const s of [-1, 1]) {
        const c = Math.min(clearance(xs[i] + s * nx * 5, ys[i] + s * ny * 5, i), clearance(xs[i] + s * nx * 2.5, ys[i] + s * ny * 2.5, i) + 1.5);
        const inBox = xs[i] + s * nx * 4 > -1 && xs[i] + s * nx * 4 < BOX_W + 1;
        if (inBox && c > bestC) { bestC = c; bestS = s; }
      }
      if (bestC < 4) continue;
      // leaf points outward, leaning the way the tendril grows
      const gx = dir * tx / tlen, gy = dir * ty / tlen;
      const ang = Math.atan2(bestS * ny + 0.7 * gy, bestS * nx + 0.7 * gx);
      leaves.push({ i, x: xs[i], y: ys[i], ang, d: ds[i], ph: (i * 0.37) % 6.28 });
    }
  }
  let dmax = 0;
  for (let i = 0; i < N; i++) dmax = Math.max(dmax, ds[i]);
  return { N, xs, ys, rs, ds, J, jx: xs[J], jy: ys[J], tin, leaves, dmax };
}

/** GLYPHS[side][digit]: side 0 = stalk on the right of the box, 1 = on the left. */
export const GLYPHS = [[], []];
for (let dg = 0; dg < 10; dg++) {
  GLYPHS[0][dg] = build(RAW[dg], 1);
  GLYPHS[1][dg] = build(RAW[dg], -1);
}
