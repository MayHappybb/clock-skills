// Danmaku bullet font: each numeral is a few stroke paths (in a 24 x 42 px
// box) along which a stream of orbs flows. Joints and stroke ends carry
// bigger, fixed orbs. Paths are resampled uniformly so a bead at arc length s
// is a table lookup.

export const GW = 24, GH = 42;
const D2R = Math.PI / 180;

/** Points on an ellipse arc, angles in degrees (0 = right, 90 = down), a0 -> a1. */
function arc(cx, cy, rx, ry, a0, a1, step = 4) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + (a1 - a0) * (k / n)) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const P = (...pts) => pts;

// Each glyph: paths [{ pts, closed }], joints (bigger orbs), ends (big orbs).
const RAW = {
  0: { paths: [{ pts: arc(12, 21, 10.5, 19.5, 0, 360), closed: true }], joints: [], ends: [] },
  1: {
    paths: [{ pts: P([4.5, 10], [13.5, 2], [13.5, 40]) }, { pts: P([6, 40], [21, 40]) }],
    joints: [[13.5, 2], [13.5, 40]], ends: [[4.5, 10], [6, 40], [21, 40]],
  },
  2: {
    paths: [{ pts: [...arc(12, 12.5, 10, 10.5, 195, 395), [2.5, 40], [22, 40]] }],
    joints: [[2.5, 40]], ends: [[2.3, 9.8], [22, 40]],
  },
  3: {
    paths: [{ pts: arc(12, 11, 9.5, 9.5, 200, 450) }, { pts: arc(11.5, 30.5, 10.5, 10, 270, 515) }],
    joints: [[11.5, 20.5]], ends: [[3.1, 7.8], [2.1, 34.7]],
  },
  4: {
    paths: [{ pts: P([16, 2], [2, 29], [23, 29]) }, { pts: P([17, 15], [17, 40]) }],
    joints: [[2, 29], [17, 29]], ends: [[16, 2], [23, 29], [17, 15], [17, 40]],
  },
  5: {
    paths: [{ pts: [[21.5, 2], [6, 2], [4.5, 19], ...arc(12, 28.5, 10, 11.5, 235, 510)] }],
    joints: [[6, 2], [4.5, 19]], ends: [[21.5, 2], [3.3, 34.2]],
  },
  6: {
    paths: [{ pts: arc(13, 21, 11, 19, 300, 165) }, { pts: arc(12, 30.5, 10, 9.5, 180, 540), closed: true }],
    joints: [[2, 30.5]], ends: [[18.5, 4.5]],
  },
  7: {
    paths: [{ pts: P([2, 3], [22, 3], [17, 13], [11, 27], [8.5, 40]) }],
    joints: [[22, 3]], ends: [[2, 3], [8.5, 40]],
  },
  8: {
    paths: [{ pts: arc(12, 11, 8.5, 9, 90, 450), closed: true }, { pts: arc(12, 30.5, 10.5, 10.5, 270, 630), closed: true }],
    joints: [[12, 20]], ends: [],
  },
};
// 9 is 6 turned half round.
const rot = ([x, y]) => [GW - x, GH - y];
RAW[9] = {
  paths: RAW[6].paths.map((p) => ({ pts: p.pts.map(rot), closed: p.closed })),
  joints: RAW[6].joints.map(rot), ends: RAW[6].ends.map(rot),
};

const STEP = 0.25;
function resample(pts, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let k = 1; k < src.length; k++) cum.push(cum[k - 1] + Math.hypot(src[k][0] - src[k - 1][0], src[k][1] - src[k - 1][1]));
  const L = cum[cum.length - 1], M = Math.max(2, Math.round(L / STEP));
  const xs = new Float32Array(M + 1), ys = new Float32Array(M + 1);
  let seg = 1;
  for (let m = 0; m <= M; m++) {
    const s = (m / M) * L;
    while (seg < src.length - 1 && cum[seg] < s) seg++;
    const t = (s - cum[seg - 1]) / (cum[seg] - cum[seg - 1] || 1);
    xs[m] = src[seg - 1][0] + (src[seg][0] - src[seg - 1][0]) * t;
    ys[m] = src[seg - 1][1] + (src[seg][1] - src[seg - 1][1]) * t;
  }
  return { xs, ys, L, M, closed: !!closed };
}

/**
 * Glyph geometry for digit d, scaled by (sx, sy) into raster pixels, with
 * beads `spacing` px apart: { paths: [{ xs, ys, L, M, closed, n, first }], joints, ends, total }.
 */
const cache = new Map();
export function glyph(d, spacing, sx = 1, sy = 1) {
  const key = d + ':' + spacing + ':' + sx + ':' + sy;
  if (cache.has(key)) return cache.get(key);
  const r = RAW[d], sc = ([x, y]) => [x * sx, y * sy];
  const paths = r.paths.map((p) => {
    const q = resample(p.pts.map(sc), p.closed);
    q.n = Math.max(2, Math.round(q.L / spacing) + (p.closed ? 0 : 1));
    return q;
  });
  let total = 0;
  for (const p of paths) { p.first = total; total += p.n; }
  const g = { paths, joints: r.joints.map(sc), ends: r.ends.map(sc), total };
  cache.set(key, g);
  return g;
}
/** Point at arc length s on a resampled path, into out[0..1]. */
export function pathAt(p, s, out) {
  let u = (s / p.L) * p.M;
  if (p.closed) { u %= p.M; if (u < 0) u += p.M; } else u = u < 0 ? 0 : u > p.M ? p.M : u;
  const k = Math.min(p.M - 1, Math.floor(u)), f = u - k;
  out[0] = p.xs[k] + (p.xs[k + 1] - p.xs[k]) * f;
  out[1] = p.ys[k] + (p.ys[k + 1] - p.ys[k]) * f;
}

// The SPELL CARD banner, 5x7 capitals (not the time).
export const LETTERS = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
