// Low-poly numerals for lowpoly.js: each digit is a few centre-line
// polylines on a 6 x 10 unit box (y down), stroked into convex quads with
// mitred joins (a bevel triangle where a turn is sharper than ~85 degrees).
// Curves are octagons: the faceted look of a model with a tiny polygon
// budget. Every quad (and bevel) is one PIECE: lowpoly.js floats each piece
// at its own depth in the world, so the numeral only exists from one point
// of view.
//
// Built once at import; pure data afterwards.

const T = 1.6, HW = T / 2;                 // stroke width, half width (units)
const a = 0.8, b = 5.2, top = 0.8, bot = 9.2, mid = 5.0, c = 1.3;
const SPLIT = 4.6;                          // segments longer than this become two pieces

/** Centre lines, [points, closed]. */
const PATHS = {
  0: [[[[a + c, top], [b - c, top], [b, top + c], [b, bot - c], [b - c, bot], [a + c, bot], [a, bot - c], [a, top + c]], true]],
  1: [[[[1.3, 3.0], [3.5, top], [3.5, bot]], false], [[[1.5, bot], [5.3, bot]], false]],
  2: [[[[a, top + c], [a + c, top], [b - c, top], [b, top + c], [b, 4.3], [a, bot], [b + 0.1, bot]], false]],
  3: [[[[a, top + c], [a + c, top], [b - c, top], [b, top + c], [b, mid - 1.0], [b - 1.0, mid], [2.3, mid]], false],
    [[[b - 1.0, mid], [b, mid + 1.0], [b, bot - c], [b - c, bot], [a + c, bot], [a, bot - c]], false]],
  4: [[[[3.9, top - 0.1], [a, 6.6], [b + 0.1, 6.6]], false], [[[3.9, top], [3.9, bot + 0.1]], false]],
  5: [[[[b, top], [a, top], [a, 4.6], [b - c, 4.6], [b, 4.6 + c], [b, bot - c], [b - c, bot], [a - 0.1, bot]], false]],
  6: [[[[b - 0.2, top], [a + c, top], [a, top + c], [a, bot - c], [a + c, bot], [b - c, bot], [b, bot - c], [b, 4.7 + c], [b - c, 4.7], [a, 4.7]], false]],
  7: [[[[a - 0.1, top], [b, top], [2.4, bot + 0.1]], false]],
  8: [[[[a + 0.3 + c * 0.8, top], [b - 0.3 - c * 0.8, top], [b - 0.3, top + c * 0.8], [b - 0.3, mid - c * 0.8], [b - 0.3 - c * 0.8, mid],
    [a + 0.3 + c * 0.8, mid], [a + 0.3, mid - c * 0.8], [a + 0.3, top + c * 0.8]], true],
  [[[b - c, mid], [b, mid + c], [b, bot - c], [b - c, bot], [a + c, bot], [a, bot - c], [a, mid + c], [a + c, mid]], false]],
};
// 9 is the 6 turned half round.
PATHS[9] = PATHS[6].map(([pts, closed]) => [pts.map(([x, y]) => [6 - x, 10 - y]), closed]);

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
const norm = (p) => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] / l, p[1] / l]; };
const left = (d) => [d[1], -d[0]];          // a normal (which side is irrelevant, used consistently)

/** Signed area (y down): make every piece wind the same way. */
function wind(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s < 0 ? poly.slice().reverse() : poly;
}

function stroke(pts, closed) {
  // split long segments
  const P = [];
  const n0 = pts.length;
  for (let i = 0; i < n0; i++) {
    P.push(pts[i]);
    if (!closed && i === n0 - 1) break;
    const q = pts[(i + 1) % n0];
    const len = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]);
    if (len > SPLIT) P.push(mul(add(pts[i], q), 0.5));
  }
  const n = P.length, segs = closed ? n : n - 1;
  const D = [], N = [];
  for (let i = 0; i < segs; i++) { const d = norm(sub(P[(i + 1) % n], P[i])); D.push(d); N.push(left(d)); }
  // per vertex: [leftPoint, rightPoint] for the incoming end and outgoing start, plus a bevel
  const ends = [], starts = [], pieces = [];
  for (let j = 0; j < n; j++) {
    const inc = closed ? (j - 1 + segs) % segs : j - 1;   // segment ending at j
    const out = closed ? j % segs : j;                     // segment starting at j
    const hasIn = closed || j > 0, hasOut = closed || j < n - 1;
    const p = P[j];
    if (hasIn && hasOut) {
      const m = norm(add(N[inc], N[out]));
      const L = HW / dot(m, N[out]);
      if (L <= 1.5 * HW) {
        const l = add(p, mul(m, L)), r = sub(p, mul(m, L));
        ends[j] = [l, r]; starts[j] = [l, r];
      } else {
        // bevel: the inner side shares the offset-line intersection, the outer gets a triangle
        const leftInner = dot(m, D[inc]) < 0;
        const inner = leftInner ? add(p, mul(m, L)) : sub(p, mul(m, L));
        const oa = leftInner ? sub(p, mul(N[inc], HW)) : add(p, mul(N[inc], HW));
        const ob = leftInner ? sub(p, mul(N[out], HW)) : add(p, mul(N[out], HW));
        ends[j] = leftInner ? [inner, oa] : [oa, inner];
        starts[j] = leftInner ? [inner, ob] : [ob, inner];
        pieces.push(wind([inner, oa, ob]));
      }
    } else if (hasOut) {
      starts[j] = [add(p, mul(N[out], HW)), sub(p, mul(N[out], HW))];
    } else {
      ends[j] = [add(p, mul(N[inc], HW)), sub(p, mul(N[inc], HW))];
    }
  }
  for (let i = 0; i < segs; i++) {
    const s = starts[i], e = ends[(i + 1) % n];
    pieces.push(wind([s[0], e[0], e[1], s[1]]));
  }
  return pieces;
}

/** GLYPHS[d] = list of convex polygons in digit units (0..6 x 0..10). */
export const GLYPHS = [];
for (let d = 0; d <= 9; d++) GLYPHS[d] = PATHS[d].flatMap(([pts, closed]) => stroke(pts, closed));
