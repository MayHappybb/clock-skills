// Tangram geometry: the seven pieces, poses, the ten numerals, the double
// square that four sets make together, and matching one arrangement to another.
import { DIGITS } from './tangram-digits.js';

const R2 = Math.SQRT2;
export const TYPES = ['L', 'L', 'M', 'S', 'S', 'Q', 'P'];
// canonical shapes in units (small-triangle leg = 1), vertex 0 at the origin
const SHAPE = { L: [[0, 0], [2, 0], [0, 2]], M: [[0, 0], [R2, 0], [0, R2]], S: [[0, 0], [1, 0], [0, 1]], Q: [[0, 0], [1, 0], [1, 1], [0, 1]], P: [[0, 0], [1, 0], [2, 1], [1, 1]] };
// rotational symmetry of each piece (radians); mirrored triangles are just rotations
export const SYM = { L: 2 * Math.PI, M: 2 * Math.PI, S: 2 * Math.PI, Q: Math.PI / 2, P: Math.PI };

const cen = (poly) => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
/** The piece's outline centred on its centroid, in units: LOCAL[type]. */
export const LOCAL = {};
for (const t in SHAPE) { const [cx, cy] = cen(SHAPE[t]); LOCAL[t] = SHAPE[t].map(([x, y]) => [x - cx, y - cy]); }

/** World polygon (units) of a piece at pose (x, y, th, fx): mirror in local x, then rotate. */
export function polyOf(t, x, y, th, fx = 1, s = 1) {
  const c = Math.cos(th), sn = Math.sin(th);
  return LOCAL[t].map(([vx, vy]) => { const a = vx * fx * s, b = vy * s; return [x + a * c - b * sn, y + a * sn + b * c]; });
}

/** Pose of a digit piece given as [type, k, flip, x0, y0] (vertex 0 at x0, y0). */
function poseOfEntry([t, k, flip, x0, y0]) {
  const th = (k * Math.PI) / 4, fx = flip ? -1 : 1;
  // the canonical vertex 0 is at -centroid in LOCAL; it must land on (x0, y0)
  const [lx, ly] = LOCAL[t][0], c = Math.cos(th), s = Math.sin(th);
  const ax = lx * fx * c - ly * s, ay = lx * fx * s + ly * c;
  return { t, x: x0 - ax, y: y0 - ay, th, fx };
}

/** Find the pose of piece type t that covers polygon poly (units), or null. */
function fitPose(t, poly) {
  const [cx, cy] = cen(poly);
  for (let k = 0; k < 8; k++) for (const fx of [1, -1]) {
    const th = (k * Math.PI) / 4, q = polyOf(t, cx, cy, th, fx);
    if (q.length !== poly.length) continue;
    if (q.every(([x, y]) => poly.some(([u, v]) => Math.abs(u - x) < 1e-6 && Math.abs(v - y) < 1e-6))) return { t, x: cx, y: cy, th, fx };
  }
  return null;
}

/** Each digit as 7 poses in TYPES order, centred on (0, 0) in units, plus its size. */
export const NUM = {};
for (const d in DIGITS) {
  // pair entries to TYPES order: take entries of each type in the order given
  const pool = DIGITS[d].map(poseOfEntry), used = new Set(), poses = [];
  for (const t of TYPES) { const i = pool.findIndex((p, j) => p.t === t && !used.has(j)); used.add(i); poses.push(pool[i]); }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of poses) for (const [x, y] of polyOf(p.t, p.x, p.y, p.th, p.fx)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  NUM[d] = { poses: poses.map((p) => ({ ...p, x: p.x - mx, y: p.y - my })), w: x1 - x0, h: y1 - y0 };
}

// ---- the double tangram: four sets tile one square twice the size, piece for piece
// classic square [0,4]^2 in "square units" (small leg = sqrt2 there); doubled: [0,8]^2.
const CLASSIC = {
  L: [[[0, 0], [4, 0], [2, 2]], [[0, 0], [2, 2], [0, 4]]],
  M: [[[4, 4], [2, 4], [4, 2]]],
  S: [[[3, 1], [4, 0], [4, 2]], [[2, 2], [3, 3], [1, 3]]],
  Q: [[[2, 2], [3, 1], [4, 2], [3, 3]]],
  P: [[[0, 4], [1, 3], [3, 3], [2, 4]]],
};
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function split4(poly) {
  if (poly.length === 3) {
    // right angle vertex: the one whose two edges are equal and shortest
    const [A, B, C] = poly, ab = mid(A, B), ac = mid(A, C), bc = mid(B, C);
    return [[A, ab, ac], [ab, B, bc], [ac, bc, C], [bc, ac, ab]];
  }
  const [p0, p1, , p3] = poly, e1 = [(p1[0] - p0[0]) / 2, (p1[1] - p0[1]) / 2], e3 = [(p3[0] - p0[0]) / 2, (p3[1] - p0[1]) / 2];
  const out = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const o = [p0[0] + e1[0] * i + e3[0] * j, p0[1] + e1[1] * i + e3[1] * j];
    out.push([o, [o[0] + e1[0], o[1] + e1[1]], [o[0] + e1[0] + e3[0], o[1] + e1[1] + e3[1]], [o[0] + e3[0], o[1] + e3[1]]]);
  }
  return out;
}
/** 28 slots of the double square, centred on (0, 0), in units: { t, x, y, th, fx, g } (g = giant piece). */
export const GIANT = [];
export const GIANT_OUTLINES = [];
{
  const k = 1 / R2; // square units -> units
  let g = 0;
  for (const t of ['L', 'M', 'S', 'Q', 'P']) for (const big of CLASSIC[t]) {
    const B = big.map(([x, y]) => [(2 * x - 4) * k, (2 * y - 4) * k]);
    GIANT_OUTLINES.push(B);
    for (const sp of split4(B)) {
      const p = fitPose(t, sp);
      if (!p) throw new Error('tangram: no pose for giant ' + t);
      GIANT.push({ ...p, g });
    }
    g++;
  }
}
/** Side of the double square in units. */
export const GIANT_SIDE = 8 / R2;

/** Wrap an angle difference into (-half, half] for a piece of symmetry `per`. */
export function angDelta(a, b, per) {
  let d = (b - a) % per;
  if (d > per / 2) d -= per;
  if (d <= -per / 2) d += per;
  return d;
}

/** Match pieces a -> b of the same types (TYPES order), min total travel. Returns perm: a[i] goes to b[perm[i]]. */
export function matchSets(A, B) {
  const perm = TYPES.map((_, i) => i);
  const cost = (i, j) => Math.hypot(A[i].x - B[j].x, A[i].y - B[j].y) + 0.6 * Math.abs(angDelta(A[i].th, B[j].th, SYM[A[i].t]));
  for (const [i, j] of [[0, 1], [3, 4]]) if (cost(i, j) + cost(j, i) < cost(i, i) + cost(j, j)) { perm[i] = j; perm[j] = i; }
  return perm;
}
