// Taffy numerals: each digit is one length of pulled taffy rope, laid by
// hand, hung on a hook at its top. Designed as a set on a 17 x 44 px
// centreline box (the rope is ~6 px thick plus a 1 px keyline, so a digit
// stands ~25 x 52 px on the glass): fat round bends, no closed corners a rope
// could not make, every counter at least ~8 x 12 px of wall.
//
// Each digit is a list of strokes; a stroke is a list of centreline control
// points [x, y], with 'c' marking a corner (the spline restarts there). Only
// the 4 needs two lengths of rope. A loop (0, 6, 8, 9) runs on past its own
// start so the end tucks over it, the way a rope ring is laid.
//
// At load every digit is resampled to N points spaced evenly along its
// length (flash: 10 x 64 x 3 values). `brk[i]` marks the gap between two
// strokes (segment i -> i+1 is not rope at rest). `hook` is where the digit
// hangs; `catchAt` is the point the puller pin catches from below.

export const N = 64;
export const BOX_W = 17, BOX_H = 44;

const C = 'c';
const DEF = {
  0: { tuck: 4.5, hook: [8.5, 0], catchAt: [8.5, 44], strokes: [[
    [8.5, 0], [13.6, 1.4], [16.4, 6], [17, 13], [17, 31], [16.4, 38], [13.6, 42.6], [8.5, 44],
    [3.4, 42.6], [0.6, 38], [0, 31], [0, 13], [0.6, 6], [3.4, 1.4], [8.5, 0], [12.2, 0.7],
  ]] },
  1: { hook: [10.5, 0], catchAt: [10.5, 44], strokes: [[
    [1.6, 7.4], [5.8, 4.4], [10.5, 0], C, [10.5, 0], [10.5, 22], [10.5, 44],
  ]] },
  2: { hook: [8.5, 0], catchAt: [8.5, 44], strokes: [[
    [0.5, 10], [2.6, 3], [8.5, 0], [14.4, 3], [16.8, 10], [15.4, 17.5], [10, 25], [4, 33.5], [0, 44], C,
    [0, 44], [8.5, 44], [17, 44],
  ]] },
  3: { hook: [9, 0], catchAt: [9, 44], strokes: [[
    [0.6, 6.5], [4, 1.4], [9, 0], [14.6, 1.8], [16.6, 8], [14.6, 15], [7.5, 20.5], C,
    [7.5, 20.5], [14, 22.6], [17, 29.5], [16.6, 37], [12.5, 42.6], [7, 44], [2.4, 42.4], [0, 38],
  ]] },
  4: { hook: [12.5, 0], catchAt: [12.5, 44], strokes: [
    [[1.5, 4], [0.8, 16], [0, 28], C, [0, 28], [9, 28], [17.5, 28]],
    [[12.5, 0], [12.5, 22], [12.5, 44]],
  ] },
  5: { hook: [9, 0.5], catchAt: [8, 44], strokes: [[
    [16.8, 0.5], [9, 0.5], [2.2, 0.5], C, [2.2, 0.5], [1.6, 10], [1.2, 19.5], C,
    [1.2, 19.5], [6.5, 16.6], [12.6, 17.6], [16.4, 23.5], [17, 31.5], [14.8, 39.6], [8.5, 44], [2.8, 42.6], [0, 38.5],
  ]] },
  6: { tuck: 6, hook: [9.5, 0], catchAt: [8.5, 44], strokes: [[
    [16, 4], [13.4, 0.8], [9.5, 0], [4.4, 2.2], [1.2, 9], [0, 19], [0, 30], [1.6, 39], [8.5, 44],
    [15.2, 40.6], [17, 32.5], [15.4, 24.6], [9.2, 20.8], [3, 23.2], [0.2, 29.5],
  ]] },
  7: { hook: [8.5, 0.5], catchAt: [7.5, 44], strokes: [[
    [0, 0.5], [8.5, 0.5], [17, 0.5], C, [17, 0.5], [12.6, 13], [9.4, 26], [7.5, 44],
  ]] },
  8: { tuck: 4, hook: [8.5, 0], catchAt: [8.5, 44], strokes: [[
    [8.5, 20.4], [14, 16.6], [15.8, 9.4], [13.6, 2.4], [8.5, 0], [3.4, 2.4], [1.2, 9.4], [3, 16.6],
    [8.5, 20.4], [14.8, 25], [17, 33], [14.8, 41.4], [8.5, 44], [2.2, 41.4], [0, 33], [2.2, 25], [8.5, 20.4], [11.4, 18.6],
  ]] },
  9: { tuck: 7, hook: [8.5, 0], catchAt: [8, 44], strokes: [[
    [0.8, 40], [3.6, 43.2], [7.5, 44], [12.6, 41.8], [15.8, 35], [17, 25], [17, 14], [15.4, 5], [8.5, 0],
    [1.8, 3.4], [0, 11.5], [1.6, 19.4], [7.8, 23.2], [14, 20.8], [16.8, 14.5],
  ]] },
};

/** Uniform Catmull-Rom through a run of points, sampled `per` times a span. */
function spline(pts, per = 24) {
  const out = [];
  const n = pts.length;
  if (n === 1) return [pts[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/** A stroke's dense centreline: spline pieces split at corners. */
function strokePath(def) {
  const pieces = [[]];
  for (const p of def) {
    if (p === C) pieces.push([]);
    else pieces[pieces.length - 1].push(p);
  }
  const path = [];
  for (const pc of pieces) {
    if (!pc.length) continue;
    const s = spline(pc);
    for (const q of s) {
      const l = path[path.length - 1];
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 1e-6) path.push(q);
    }
  }
  return path;
}

function lengthOf(path) {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}

/** `count` points evenly spaced along a dense path. */
function resample(path, count) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const L = cum[cum.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = count === 1 ? 0 : (k / (count - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const f = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    out.push([path[j][0] + (path[j + 1][0] - path[j][0]) * f, path[j][1] + (path[j + 1][1] - path[j][1]) * f]);
  }
  return out;
}

function build(def) {
  const paths = def.strokes.map(strokePath), lens = paths.map(lengthOf), total = lens.reduce((a, b) => a + b, 0);
  // points per stroke in proportion to length, N in all
  const counts = lens.map((l) => Math.max(2, Math.round((l / total) * N)));
  counts[counts.length - 1] += N - counts.reduce((a, b) => a + b, 0);
  const x = new Float32Array(N), y = new Float32Array(N), u = new Float32Array(N), brk = new Uint8Array(N), under = new Uint8Array(N);
  let k = 0, acc = 0;
  paths.forEach((p, si) => {
    const pts = resample(p, counts[si]);
    pts.forEach((q, qi) => {
      if (qi > 0) acc += Math.hypot(q[0] - x[k - 1], q[1] - y[k - 1]);
      x[k] = q[0]; y[k] = q[1]; u[k] = acc; k++;
    });
    if (si < paths.length - 1) { brk[k - 1] = 1; acc += 8; }
  });
  const near = ([px, py]) => {
    let b = 0, bd = 1e9;
    for (let i = 0; i < N; i++) { const d = (x[i] - px) ** 2 + (y[i] - py) ** 2; if (d < bd) { bd = d; b = i; } }
    return b;
  };
  // positions relative to the hook: depth below it is what gravity acts on
  // a loop's last few px tuck under the rope they meet, so the join is seamless
  if (def.tuck) for (let i = 0; i < N - 1; i++) if (u[i + 1] > acc - def.tuck) under[i] = 1;
  const catchI = near(def.catchAt), hookI = near(def.hook);
  const [hx, hy] = def.hook;
  for (let i = 0; i < N; i++) { x[i] -= hx; y[i] -= hy; }
  return { x, y, u, brk, under, len: acc, hookX: hx, catchI, hookI };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(DEF[d]));
