// Vectorcade's numerals: hollow vector rocks shaped as digits, drawn for a
// 64x64 raster where each rock is about 21 x 26 pixels.
//
// Each digit is one or more closed loops on a 9 x 11 unit design grid
// (outer outline, plus holes for 0 4 6 8 9), chamfered like Asteroids rocks.
// Every digit is then cut into exactly N segments: each edge gets a share
// by length (corners are kept), and the cut points are nudged off the line
// by a fixed hash so each edge kinks into two facets, lumpy like a rock.
// Equal N for all ten is what lets an old digit's segments fly apart and
// land as the new digit: the same pieces, re-laid.

const W = 9, H = 11;
export const N = 48;

const mirror = (loops) => loops.map((l) => l.map(([x, y]) => [W - x, H - y]));

const SIX = [
  [[2, 0], [8.4, 0], [8.4, 2], [2.9, 2], [2, 2.9], [2, 4.5], [7, 4.5], [9, 6.5], [9, 9], [7, 11], [2, 11], [0, 9], [0, 2]],
  [[2, 6.5], [6.2, 6.5], [7, 7.3], [7, 8.2], [6.2, 9], [2.8, 9], [2, 8.2]],
];

export const LOOPS = [
  // 0: an octagonal rock with an octagonal hole
  [
    [[2.2, 0], [6.8, 0], [9, 2.2], [9, 8.8], [6.8, 11], [2.2, 11], [0, 8.8], [0, 2.2]],
    [[3.1, 2], [5.9, 2], [7, 3.1], [7, 7.9], [5.9, 9], [3.1, 9], [2, 7.9], [2, 3.1]],
  ],
  // 1: shaft, flag and foot
  [[[3.6, 0], [6, 0], [6, 9], [8, 9], [8, 11], [1, 11], [1, 9], [4, 9], [4, 3.2], [2.1, 4.1], [1.3, 2.3]]],
  // 2
  [[[0, 3], [0, 2], [2, 0], [7, 0], [9, 2], [9, 4.6], [4.4, 9], [9, 9], [9, 11], [0, 11], [0, 8.8], [7, 3.7], [7, 2.8], [6.2, 2], [2.8, 2], [2, 2.8], [2, 3]]],
  // 3
  [[[0, 0], [7, 0], [9, 2], [9, 4.2], [7.8, 5.5], [9, 6.8], [9, 9], [7, 11], [0, 11], [0, 9], [6.2, 9], [7, 8.2], [7, 7.3], [6.2, 6.5], [2.4, 6.5], [2.4, 4.5], [6.2, 4.5], [7, 3.7], [7, 2.8], [6.2, 2], [0, 2]]],
  // 4
  [
    [[5, 0], [8, 0], [8, 6.5], [9, 6.5], [9, 8.5], [8, 8.5], [8, 11], [6, 11], [6, 8.5], [0, 8.5], [0, 6.5]],
    [[6, 3], [6, 6.5], [2.9, 6.5]],
  ],
  // 5
  [[[1, 0], [9, 0], [9, 2], [3, 2], [2.8, 4], [7, 4], [9, 6], [9, 9], [7, 11], [1.6, 11], [0, 9.6], [0, 9], [6.2, 9], [7, 8.2], [7, 6.8], [6.2, 6], [0.8, 6]]],
  SIX,
  // 7
  [[[0, 0], [9, 0], [9, 2], [4.6, 11], [2.3, 11], [6.6, 2], [0, 2]]],
  // 8
  [
    [[2, 0], [7, 0], [8.8, 1.8], [8.8, 3.8], [7.6, 5.3], [9, 6.8], [9, 9], [7, 11], [2, 11], [0, 9], [0, 6.8], [1.4, 5.3], [0.2, 3.8], [0.2, 1.8]],
    [[3, 2], [6, 2], [6.8, 2.8], [6.8, 3.4], [5.9, 4.3], [3.1, 4.3], [2.2, 3.4], [2.2, 2.8]],
    [[3, 6.3], [6.2, 6.3], [7, 7.1], [7, 8.2], [6.2, 9], [2.8, 9], [2, 8.2], [2, 7.1]],
  ],
  mirror(SIX),
];

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The ten digits as N segments each, in pixels about the digit's centre:
 * Float32Array(4 * N) of [midX, midY, angle, length], plus the corner points
 * (for the beam's dwell dots). `s` is pixels per unit, `lump` the hash
 * nudge in pixels.
 */
export function buildDigits(s = 2.35, lump = 0.45) {
  return LOOPS.map((loops, d) => {
    const edges = [];
    loops.forEach((loop, li) => {
      // which side is out: (-dy, dx) points inward on a loop of positive shoelace area (y down)
      const area = loop.reduce((t, [x, y], k) => { const [u, v] = loop[(k + 1) % loop.length]; return t + x * v - u * y; }, 0);
      const out = area > 0 ? -1 : 1;
      for (let k = 0; k < loop.length; k++) {
        const a = loop[k], b = loop[(k + 1) % loop.length];
        edges.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), outer: li === 0, out });
      }
    });
    // share N among the edges by length: one each, the rest by largest remainder
    const total = edges.reduce((t, e) => t + e.len, 0);
    let left = N - edges.length;
    if (left < 0) throw new Error(`digit ${d} has ${edges.length} edges > N`);
    const want = edges.map((e) => (e.len / total) * left);
    edges.forEach((e, k) => { e.n = 1 + Math.floor(want[k]); });
    left = N - edges.reduce((t, e) => t + e.n, 0);
    const order = edges.map((e, k) => [want[k] - Math.floor(want[k]), k]).sort((p, q) => q[0] - p[0]);
    for (let k = 0; k < left; k++) edges[order[k][1]].n++;
    // points along each edge, nudged off the line (not at the corners)
    const segs = new Float32Array(4 * N), corners = [];
    let j = 0;
    const P = (x, y) => [(x - W / 2) * s, (y - H / 2) * s];
    edges.forEach((e, ei) => {
      const [ax, ay] = e.a, [bx, by] = e.b, nx = -(by - ay) / e.len, ny = (bx - ax) / e.len;
      corners.push(P(ax, ay));
      let prev = P(ax, ay);
      // one kink per edge: the edge becomes two straight facets, like a rock
      const ks = e.n >= 2 ? 1 + Math.floor(hash(d * 97 + ei, 1) * (e.n - 1)) : 0;
      // outer outlines kink more (and outward more often): the rock's silhouette; holes stay open
      const hk = hash(d * 97 + ei, 2);
      const ko = (e.outer ? (hk - 0.3) * 1.6 * e.out : (hk - 0.5) * 0.9) * lump * Math.min(1, e.len / 3);
      for (let k = 1; k <= e.n; k++) {
        const t = k / e.n;
        let [px, py] = P(ax + (bx - ax) * t, ay + (by - ay) * t);
        if (ks && k < e.n) { const o = ko * (k <= ks ? k / ks : (e.n - k) / (e.n - ks)); px += nx * o; py += ny * o; }
        const mx = (prev[0] + px) / 2, my = (prev[1] + py) / 2;
        segs[4 * j] = mx; segs[4 * j + 1] = my;
        segs[4 * j + 2] = Math.atan2(py - prev[1], px - prev[0]);
        segs[4 * j + 3] = Math.hypot(px - prev[0], py - prev[1]);
        j++; prev = [px, py];
      }
    });
    return { segs, corners, w: W * s, h: H * s };
  });
}
