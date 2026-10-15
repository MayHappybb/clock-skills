// Zen sand: the groove script. Each digit is ONE unbroken path for a ball
// that cannot lift: it enters at the left on the join line, ploughs the
// figure, and leaves at the right on the same line, so a whole time is one
// continuous groove. Where a figure needs a second stroke, the ball rides
// back along a groove it has already cut (a retrace leaves no new mark).
//
// Body box: x 0..9, y 0.8..17.4 (y down), join line y = 17, entry
// E = (-1.5, 17), exit X = (10.5, 17). Strokes are Catmull-Rom splines
// through their points; a walk leg [stroke, from, to] runs between two of a
// stroke's control points (to < from runs it backwards, sample for sample).
// `j` marks join strokes, cut shallower than the figure.

const E = [-1.5, 17], X = [10.5, 17];
const J = 0.35, F = 1;   // depth of join strokes and of figure strokes

export const GLYPHS = {
  0: {
    s: [
      { a: J, p: [E, [1.6, 17.1], [4.5, 17.4]] },
      { a: F, p: [[4.5, 17.4], [7.4, 16.0], [8.7, 12.0], [8.7, 6.2], [7.4, 2.2], [4.5, 0.8], [1.6, 2.2], [0.3, 6.2], [0.3, 12.0], [1.6, 16.0], [4.5, 17.4]] },
      { a: J, p: [[4.5, 17.4], [7.4, 17.1], X] },
    ],
    w: [[0, 0, 2], [1, 0, 10], [2, 0, 2]],
  },
  1: {
    s: [
      { a: J, p: [E, [5.2, 17], X] },
      { a: F, p: [[5.2, 17], [5.2, 9], [5.2, 0.8]] },
      { a: 0.99, p: [[5.2, 0.8], [4.0, 2.3], [2.4, 3.6]] }, // no pit: a ball here would read as a 7
    ],
    w: [[0, 0, 1], [1, 0, 2], [2, 0, 2], [2, 2, 0], [1, 2, 0], [0, 1, 2]],
  },
  2: {
    s: [
      { a: J, p: [E, [0.6, 17]] },
      { a: F, p: [[1.0, 4.2], [2.4, 1.6], [4.6, 0.8], [7.0, 1.4], [8.5, 3.8], [8.1, 7.0], [6.0, 10.2], [3.2, 13.7], [0.6, 17]] },
      { a: F, p: [[0.6, 17], [4.6, 17], [8.8, 17]] },
      { a: J, p: [[8.8, 17], X] },
    ],
    w: [[0, 0, 1], [1, 8, 0], [1, 0, 8], [2, 0, 2], [3, 0, 1]],
  },
  3: {
    s: [
      { a: J, p: [E, [0.1, 16.5], [1.0, 15.4]] },
      { a: F, p: [[1.0, 2.8], [3.0, 1.0], [5.4, 0.8], [7.6, 2.0], [8.2, 4.6], [6.8, 7.4], [4.0, 8.8]] },
      { a: F, p: [[4.0, 8.8], [6.9, 9.6], [8.7, 12.4], [7.9, 15.6], [5.2, 17.4], [2.6, 17.2], [1.0, 15.4]] },
      { a: J, p: [[7.9, 15.6], [9.2, 16.8], X] },
    ],
    w: [[0, 0, 2], [2, 6, 0], [1, 6, 0], [1, 0, 6], [2, 0, 3], [3, 0, 2]],
  },
  4: {
    s: [
      { a: J, p: [E, [0.4, 12.2]] },
      { a: F, p: [[0.4, 12.2], [6.4, 12.2], [9.0, 12.2]] },
      { a: F, p: [[6.4, 17], [6.4, 12.2], [6.4, 0.8]] },
      { a: F, p: [[6.4, 0.8], [3.4, 6.5], [0.4, 12.2]] },
      { a: J, p: [[6.4, 17], [8.4, 17], X] },
    ],
    w: [[0, 0, 1], [1, 0, 2], [1, 2, 1], [2, 1, 2], [3, 0, 2], [3, 2, 0], [2, 2, 0], [4, 0, 2]],
  },
  5: {
    s: [
      { a: J, p: [E, [0.0, 16.6], [0.9, 15.6]] },
      { a: F, p: [[1.1, 8.4], [4.4, 7.0], [7.6, 8.4], [8.7, 12.0], [7.6, 15.6], [4.6, 17.4], [2.0, 17.0], [0.9, 15.6]] },
      { a: F, p: [[1.6, 0.8], [1.35, 4.6], [1.1, 8.4]] },
      { a: F, p: [[1.6, 0.8], [5.0, 0.8], [8.6, 0.8]] },
      { a: J, p: [[7.6, 15.6], [9.2, 16.8], X] },
    ],
    w: [[0, 0, 2], [1, 7, 0], [2, 2, 0], [3, 0, 2], [3, 2, 0], [2, 0, 2], [1, 0, 4], [4, 0, 2]],
  },
  6: {
    s: [
      { a: J, p: [E, [1.5, 17.2], [4.4, 17.4]] },
      { a: F, p: [[7.8, 2.4], [5.6, 0.8], [3.0, 1.6], [1.2, 5.0], [0.4, 9.6], [0.9, 14.2], [2.2, 16.6], [4.4, 17.4], [6.8, 16.8], [8.5, 14.4], [8.5, 11.2], [6.8, 9.0], [4.4, 8.5], [2.2, 9.4], [0.8, 11.6]] },
      { a: J, p: [[6.8, 16.8], [8.8, 17.1], X] },
    ],
    w: [[0, 0, 2], [1, 7, 0], [1, 0, 14], [1, 14, 8], [2, 0, 2]],
  },
  7: {
    s: [
      { a: J, p: [E, [1.4, 17], [3.8, 17]] },
      { a: F, p: [[3.8, 17], [5.0, 11.2], [6.6, 5.8], [8.6, 0.8]] },
      { a: F, p: [[8.6, 0.8], [4.6, 0.8], [0.6, 0.8]] },
      { a: J, p: [[3.8, 17], [7.0, 17], X] },
    ],
    w: [[0, 0, 2], [1, 0, 3], [2, 0, 2], [2, 2, 0], [1, 3, 0], [3, 0, 2]],
  },
  8: {
    s: [
      { a: J, p: [E, [1.6, 17.2], [4.5, 17.4]] },
      { a: F, p: [[4.5, 17.4], [1.3, 15.8], [0.7, 12.6], [2.3, 10.2], [4.5, 9.0], [6.6, 7.6], [7.9, 4.8], [6.8, 1.8], [4.5, 0.8], [2.2, 1.8], [1.1, 4.8], [2.4, 7.6], [4.5, 9.0], [6.7, 10.2], [8.3, 12.6], [7.7, 15.8], [4.5, 17.4]] },
      { a: J, p: [[4.5, 17.4], [7.4, 17.1], X] },
    ],
    w: [[0, 0, 2], [1, 0, 16], [2, 0, 2]],
  },
  9: {
    s: [
      { a: J, p: [E, [0.3, 17.0], [1.5, 16.2]] },
      { a: F, p: [[8.4, 5.0], [7.0, 8.5], [4.4, 9.5], [1.7, 8.4], [0.5, 5.2], [1.6, 2.0], [4.4, 0.8], [7.2, 1.8], [8.4, 5.0], [8.4, 10.0], [7.6, 14.6], [5.6, 17.2], [3.0, 17.4], [1.5, 16.2]] },
      { a: J, p: [[7.6, 14.6], [9.0, 16.4], X] },
    ],
    w: [[0, 0, 2], [1, 13, 0], [1, 0, 10], [2, 0, 2]],
  },
  // the separator, in its own 4-wide cell: two dimples on a hair-line stem
  ':': {
    s: [
      { a: J, p: [[0, 17], [2, 17]] },
      { a: 0.3, p: [[2, 17], [2, 14.6], [2, 12.6]] },
      { a: F, p: [[2, 12.6], [3.0, 12.1], [2.6, 11.2], [1.4, 11.2], [1.0, 12.1], [2, 12.6]] },
      { a: 0.3, p: [[2, 12.6], [2, 9.4], [2, 6.6]] },
      { a: F, p: [[2, 6.6], [3.0, 6.1], [2.6, 5.2], [1.4, 5.2], [1.0, 6.1], [2, 6.6]] },
      { a: J, p: [[2, 17], [4, 17]] },
    ],
    w: [[0, 0, 1], [1, 0, 2], [2, 0, 5], [3, 0, 2], [4, 0, 5], [3, 2, 0], [1, 2, 0], [5, 0, 1]],
  },
};

// ---------------------------------------------------------------- splines
const STEP = 0.2; // px between samples along a spline
const PIT = 0.95; // radius of the pivot loop at a ball terminal

/** Samples of segment k of a stroke (from point k to k+1), start included, end excluded. */
function segment(P, k, closed) {
  const n = P.length;
  const get = (i) => {
    if (i < 0) return closed ? P[n - 2] : [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
    if (i > n - 1) return closed ? P[1] : [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
    return P[i];
  };
  const p0 = get(k - 1), p1 = get(k), p2 = get(k + 1), p3 = get(k + 2);
  const m1x = (p2[0] - p0[0]) / 2, m1y = (p2[1] - p0[1]) / 2, m2x = (p3[0] - p1[0]) / 2, m2y = (p3[1] - p1[1]) / 2;
  const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n2 = Math.max(2, Math.ceil(L / STEP));
  const out = [];
  for (let s = 0; s < n2; s++) {
    const t = s / n2, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.push(h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y);
  }
  return out;
}

const cache = new Map();
/**
 * The ball's path through glyph ch, in body coordinates: a list of legs
 * { xy: number[] (x, y pairs), a: depth }. Consecutive legs join end to start.
 */
export function glyphLegs(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const g = GLYPHS[ch];
  const segs = g.s.map((st) => {
    const P = st.p, closed = P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1];
    const list = [];
    for (let k = 0; k + 1 < P.length; k++) list.push(segment(P, k, closed));
    return list;
  });
  const legs = g.w.map(([si, a, b]) => {
    const st = g.s[si], xy = [];
    if (a < b) {
      for (let k = a; k < b; k++) xy.push(...segs[si][k]);
      xy.push(...st.p[b]);
    } else {
      for (let k = a - 1; k >= b; k--) {
        const s = segs[si][k], e = st.p[k + 1];
        // reversed: from the end point back to (not including) the start
        const pts = [e[0], e[1]];
        for (let q = s.length - 2; q >= 2; q -= 2) pts.push(s[q], s[q + 1]);
        xy.push(...pts);
      }
      xy.push(...st.p[b]);
    }
    return { xy, a: st.a, si, from: a, to: b };
  });
  // Ball terminals: where the ball turns back on its own groove it pivots,
  // and the pivot digs a round pit. Every stroke end the ball returns from
  // ends in a ball, like a ball terminal in type.
  const out = [];
  legs.forEach((lg, i) => {
    out.push({ xy: lg.xy, a: lg.a });
    const nx = legs[i + 1];
    if (!nx || nx.si !== lg.si || nx.from !== lg.to || nx.to !== lg.from || lg.a < 1) return;
    const n = lg.xy.length, ex = lg.xy[n - 2], ey = lg.xy[n - 1];
    let dx = ex - lg.xy[n - 6], dy = ey - lg.xy[n - 5];
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const r = PIT, cx = ex + dx * r * 0.55, cy = ey + dy * r * 0.55, a0 = Math.atan2(ey - cy, ex - cx);
    const loop = [];
    for (let k = 1; k <= 24; k++) { const t = a0 + (k / 24) * 2 * Math.PI; loop.push(cx + r * Math.cos(t), cy + r * Math.sin(t)); }
    out.push({ xy: [ex, ey, ...loop], a: lg.a });
  });
  cache.set(ch, out);
  return out;
}
