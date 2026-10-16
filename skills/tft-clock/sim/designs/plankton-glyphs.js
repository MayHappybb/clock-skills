// plankton: the numerals, written with a stick in wet sand.
//
// Each digit is one or more strokes in the order a hand writes them, in a
// 20 x 32 box. A stroke is a Catmull-Rom curve through its points; a
// corner is two strokes that meet. Every written instance is jittered from
// a seed, so the same digit written twice is not quite the same, as with
// real handwriting.
//
// Each hand of each digit is rasterised once, at load, into a small mask
// (on the device a const table in flash), holding for each pixel
// the groove's coverage, a halo for the glow round it, and `u`, how far
// along the writing (0..1) the nearest point of the stroke is, so that the
// reveal can follow the stick.

import { rng } from '../js/kit.js';

// prettier-ignore
const STROKES = {
  0: [[[12, 1.5], [5, 4], [1.5, 15], [3.5, 27], [10, 31], [16.5, 27], [18.5, 15], [16.5, 4.5], [11, 1.5], [7, 3.5]]],
  1: [[[4, 8.5], [8, 5.5], [12, 1.5]], [[12, 1.5], [12.2, 12], [11.6, 22], [11, 31]]],
  2: [[[2.5, 8], [6, 2.5], [12.5, 1.5], [17.5, 6], [17, 13], [10, 21.5], [2, 30.5]], [[2, 30.5], [10, 29.5], [19, 30.5]]],
  3: [[[2.5, 4.5], [9, 1.5], [16.5, 4], [16.5, 10.5], [9.5, 15]], [[9.5, 15], [17.5, 18.5], [18, 26.5], [11, 31], [2, 28]]],
  4: [[[13.5, 1.5], [7, 12], [1.5, 21.5]], [[1.5, 21.5], [10, 21.5], [19.5, 20.5]], [[15, 9.5], [15, 20], [14.5, 31]]],
  5: [[[17, 1.5], [10.5, 1.5], [5, 2]], [[5, 2], [3.5, 13.5]], [[3.5, 13.5], [10.5, 11], [17, 15], [18, 23], [13, 30], [6, 31], [1.5, 27]]],
  6: [[[16, 2.5], [9, 4.5], [4, 12], [2, 22], [5, 29.5], [11.5, 31], [17, 26], [16.5, 19], [10.5, 16], [4.5, 18.5], [2.5, 23]]],
  7: [[[1.5, 2.5], [10, 1.5], [19, 2]], [[19, 2], [13.5, 13], [8, 31]]],
  8: [[[16, 5], [10, 1.5], [4, 4.5], [4.5, 10.5], [10, 15], [17, 20.5], [17, 28], [10, 31], [3, 28], [3, 21], [10, 15], [15.5, 10.5], [16, 5], [11, 2]]],
  9: [[[17, 8], [13.5, 2], [8, 1.5], [3.5, 6.5], [4.5, 13], [10, 15], [16, 11.5], [17, 5]], [[17, 5], [17, 17], [15.5, 31]]],
};

/** Catmull-Rom through pts, `n` samples a span; returns [[x, y], ...]. */
function spline(pts, n = 8) {
  if (pts.length < 3) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < n; k++) {
        const u = k / n;
        out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]);
      }
    out.push(pts[pts.length - 1]);
    return out;
  }
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [];
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

/** Glyph box on the sand. */
export const DW = 22, DH = 34;
const PAD = 5;                      // halo room round the box
export const MW = DW + 2 * PAD + 6, MH = DH + 2 * PAD; // + slant room
const SLANT = 0.16;                 // handwriting lean: x shifts right as y rises

/**
 * The path of digit `d` written with seed `seed`, in mask coordinates:
 * a list of strokes, each a list of [x, y, u] with u the writing progress.
 */
function path(d, seed) {
  const r = rng(seed * 7919 + d * 131 + 17);
  const sx = (DW / 20) * (0.94 + 0.1 * r()), sy = (DH / 32) * (0.95 + 0.06 * r());
  const lean = SLANT + (r() - 0.5) * 0.08;
  const strokes = STROKES[d].map((st) => st.map(([x, y]) => [x, y]));
  // jitter shared points identically so joined strokes stay joined
  const jit = new Map();
  for (const st of strokes)
    for (const p of st) {
      const k = `${p[0]},${p[1]}`;
      if (!jit.has(k)) jit.set(k, [(r() - 0.5) * 1.3, (r() - 0.5) * 1.1]);
      const [jx, jy] = jit.get(k);
      p[0] += jx; p[1] += jy;
    }
  const lines = strokes.map((st) => spline(st).map(([x, y]) => {
    const X = x * sx, Y = y * sy;
    return [PAD + 2 + X + (DH - Y) * lean - 2, PAD + Y];
  }));
  // writing progress by arc length (pen lifts cost a little time too)
  let total = 0;
  const lens = lines.map((pl) => {
    let L = 0;
    for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
    return L;
  });
  const LIFT = 6;
  total = lens.reduce((a, b) => a + b, 0) + LIFT * (lines.length - 1);
  let acc = 0;
  return lines.map((pl, si) => {
    const out = [[pl[0][0], pl[0][1], acc / total]];
    for (let i = 1; i < pl.length; i++) {
      acc += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
      out.push([pl[i][0], pl[i][1], acc / total]);
    }
    if (si < lines.length - 1) acc += LIFT;
    return out;
  });
}

/**
 * The mask of digit d (or ':' for the colon's two stick pokes) written
 * with `seed`: { core, halo, u: Float32Array(MW*MH), tipAt(u) }. There are
 * VARIANTS hands of each digit, rasterised once at load: on the device
 * they are const tables in flash (31 masks x 1.7k px x 3 bytes, ~160 KB),
 * so writing a digit costs nothing to set up.
 */
export const VARIANTS = 3;
export function glyph(d, seed) {
  return TABLE[d][((seed % VARIANTS) + VARIANTS) % VARIANTS];
}

function build(d, seed) {
  let m;
  const strokes = d === ':' ? colonPath(seed) : path(+d, seed);
  const core = new Float32Array(MW * MH), halo = new Float32Array(MW * MH), u = new Float32Array(MW * MH).fill(2);
  const R = d === ':' ? 1.9 : 1.25;          // groove half-width: a stick, or a poked hole
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = 1e9, bu = 2;
      for (const st of strokes) {
        if (st.length === 1) {
          const dd = Math.hypot(px - st[0][0], py - st[0][1]);
          if (dd < best) { best = dd; bu = st[0][2]; }
          continue;
        }
        for (let i = 1; i < st.length; i++) {
          const [ax, ay, au] = st[i - 1], [bx, by, bu2] = st[i];
          const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
          let k = ((px - ax) * vx + (py - ay) * vy) / l2;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          const dd = Math.hypot(px - ax - vx * k, py - ay - vy * k);
          if (dd < best) { best = dd; bu = au + (bu2 - au) * k; }
        }
      }
      const i = y * MW + x;
      const c = R + 0.5 - best;
      core[i] = c <= 0 ? 0 : c >= 1 ? 1 : c;
      halo[i] = best < 6 ? 0.32 * Math.exp(-(best - R) / 1.5) * (best > R ? 1 : 1) : 0;
      if (halo[i] > 0.32) halo[i] = 0.32;
      u[i] = best < 6 ? bu : 2;
    }
  // the tip's position at writing progress v
  const pts = strokes.flat();
  const tipAt = (v) => {
    for (let i = 1; i < pts.length; i++)
      if (pts[i][2] >= v) {
        const a = pts[i - 1], b = pts[i], k = b[2] > a[2] ? (v - a[2]) / (b[2] - a[2]) : 1;
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
    const l = pts[pts.length - 1];
    return [l[0], l[1]];
  };
  m = { core, halo, u, tipAt };
  return m;
}

/** The colon: two pokes of the stick, upper then lower. */
function colonPath(seed) {
  const r = rng(seed * 31 + 5);
  const x = MW / 2 - 4 + (r() - 0.5), lean = SLANT * 9;
  return [[[x + lean, PAD + 11 + (r() - 0.5), 0.15]], [[x + 1, PAD + 24 + (r() - 0.5), 0.85]]];
}

export const GLYPH_PAD = PAD;

const TABLE = {};
for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':'])
  TABLE[d] = Array.from({ length: VARIANTS }, (_, v) => build(d, v * 977 + 13));
