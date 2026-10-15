// Geometry for vector.js: the numerals, the small vector type, the models.
//
// The numerals are drawn on a 6 x 10 grid (y down) as beam paths: straight
// strokes and chamfered corners, the way a 1980 vector cabinet's type was
// (no curves: the beam draws lines). Each is extruded into a solid on
// screen. For the shatter, every numeral is cut into exactly NPIECE
// segments (splitting its longest strokes), so the old digit's pieces can
// fly back together as the new one's.

export const GW = 6, GH = 10;

const P = {
  0: [[[1.3, 0], [4.7, 0], [6, 1.6], [6, 8.4], [4.7, 10], [1.3, 10], [0, 8.4], [0, 1.6], [1.3, 0]], [[4.6, 2.6], [1.4, 7.4]]],
  1: [[[1.2, 2.4], [3.6, 0], [3.6, 10]], [[1.2, 10], [6, 10]]],
  2: [[[0, 2], [1.5, 0], [4.5, 0], [6, 1.8], [6, 4], [0, 10], [6, 10]]],
  3: [[[0.3, 0], [6, 0], [2.6, 4.1], [4.5, 4.1], [6, 5.7], [6, 8.4], [4.6, 10], [1.4, 10], [0, 8.3]]],
  4: [[[4.5, 10], [4.5, 0], [0, 6.9], [6, 6.9]]],
  5: [[[5.8, 0], [0.7, 0], [0.2, 4.6], [4.4, 4.1], [6, 5.6], [6, 8.4], [4.6, 10], [1.4, 10], [0, 8.4]]],
  6: [[[5, 0], [2.6, 0], [0, 3.5], [0, 8.4], [1.4, 10], [4.6, 10], [6, 8.4], [6, 6.1], [4.6, 4.6], [1.4, 4.6], [0, 6]]],
  7: [[[0, 1.8], [0, 0], [6, 0], [2.3, 10]]],
  8: [[[1.5, 0], [4.5, 0], [5.6, 1.2], [5.6, 3.4], [4.5, 4.6], [1.5, 4.6], [0.4, 3.4], [0.4, 1.2], [1.5, 0]],
      [[1.5, 4.6], [0, 6.1], [0, 8.5], [1.4, 10], [4.6, 10], [6, 8.5], [6, 6.1], [4.5, 4.6]]],
};
P[9] = P[6].map((pl) => pl.map(([x, y]) => [6 - x, 10 - y]));

export const NPIECE = 16;

/**
 * Each digit as NPIECE pieces: { ax, ay, bx, by, ca, cb } in glyph units;
 * ca / cb: whether a connector (the extrusion edge) is drawn at that end
 * when the digit is whole, i.e. the end is a real corner.
 */
export const PIECES = [];
export const CORNERS = [];
for (let d = 0; d <= 9; d++) {
  let segs = [];
  const corners = [];
  for (const pl of P[d]) {
    const closed = pl[0][0] === pl[pl.length - 1][0] && pl[0][1] === pl[pl.length - 1][1];
    for (let i = 1; i < pl.length; i++) segs.push({ ax: pl[i - 1][0], ay: pl[i - 1][1], bx: pl[i][0], by: pl[i][1], ca: true, cb: !closed && i === pl.length - 1 });
    for (let i = 0; i < pl.length - (closed ? 1 : 0); i++) corners.push(pl[i]);
  }
  while (segs.length < NPIECE) {
    let k = 0, best = -1;
    segs.forEach((s, i) => { const l = Math.hypot(s.bx - s.ax, s.by - s.ay); if (l > best) { best = l; k = i; } });
    const s = segs[k], mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
    segs.splice(k, 1, { ax: s.ax, ay: s.ay, bx: mx, by: my, ca: s.ca, cb: false }, { ax: mx, ay: my, bx: s.bx, by: s.by, ca: false, cb: s.cb });
  }
  PIECES.push(segs);
  CORNERS.push(corners);
}

// ------------------------------------------------------------ small type
// The same hand at 4 x 6, drawn with 1-pixel hard beam strokes: score and
// labels. Only what the face uses.
const SMALL = {
  0: [[[0, 0], [3, 0], [3, 5], [0, 5], [0, 0]]],
  1: [[[0.5, 1], [1.5, 0], [1.5, 5]]],
  2: [[[0, 0], [3, 0], [3, 2], [0, 5], [3, 5]]],
  3: [[[0, 0], [3, 0], [1, 2], [3, 3], [3, 5], [0, 5]]],
  4: [[[2.5, 5], [2.5, 0], [0, 3.5], [3, 3.5]]],
  5: [[[3, 0], [0, 0], [0, 2], [3, 2.5], [3, 5], [0, 5]]],
  6: [[[3, 0], [0, 0], [0, 5], [3, 5], [3, 2.5], [0, 2.5]]],
  7: [[[0, 0], [3, 0], [1, 5]]],
  8: [[[0, 0], [3, 0], [3, 5], [0, 5], [0, 0]], [[0, 2.5], [3, 2.5]]],
  9: [[[3, 2.5], [0, 2.5], [0, 0], [3, 0], [3, 5], [0, 5]]],
  S: [[[3, 0], [0, 0], [0, 2.5], [3, 2.5], [3, 5], [0, 5]]],
  C: [[[3, 0], [0, 0], [0, 5], [3, 5]]],
  O: [[[0, 0], [3, 0], [3, 5], [0, 5], [0, 0]]],
  R: [[[0, 5], [0, 0], [3, 0], [3, 2.5], [0, 2.5], [3, 5]]],
  E: [[[3, 0], [0, 0], [0, 5], [3, 5]], [[0, 2.5], [2, 2.5]]],
  H: [[[0, 0], [0, 5]], [[3, 0], [3, 5]], [[0, 2.5], [3, 2.5]]],
  I: [[[1.5, 0], [1.5, 5]]],
  B: [[[0, 0], [2.4, 0], [3, 1.2], [2.4, 2.5], [0, 2.5]], [[0, 0], [0, 5], [3, 5], [3, 2.5], [2.4, 2.5]]],
  N: [[[0, 5], [0, 0], [3, 5], [3, 0]]],
  U: [[[0, 0], [0, 5], [3, 5], [3, 0]]],
  ' ': [],
};
export function smallText(str) {
  const out = [];
  let x = 0;
  for (const ch of str) {
    for (const pl of SMALL[ch] ?? []) out.push(pl.map(([px, py]) => [px + x, py]));
    x += ch === '1' || ch === 'I' ? 3 : 5;
  }
  return { paths: out, width: x - 1 };
}

// ------------------------------------------------------------ models
// Battlezone-style wireframes, world units (x right, y up, z forward).

/** The enemy tank: a list of edges [[x, y, z], [x, y, z]]. Faces +z. */
export const TANK = (() => {
  const e = [];
  const box = (pts) => { for (let i = 0; i < pts.length; i++) e.push([pts[i], pts[(i + 1) % pts.length]]); };
  // hull: a lower tread trapezoid and an upper deck, both as rings, joined
  const lo = [[-0.5, 0, -0.8], [0.5, 0, -0.8], [0.5, 0, 0.8], [-0.5, 0, 0.8]];
  const hi = [[-0.58, 0.28, -0.95], [0.58, 0.28, -0.95], [0.58, 0.28, 1.0], [-0.58, 0.28, 1.0]];
  box(lo); box(hi);
  for (let i = 0; i < 4; i++) e.push([lo[i], hi[i]]);
  // turret: a smaller box with a sloped front
  const t0 = [[-0.3, 0.28, -0.45], [0.3, 0.28, -0.45], [0.3, 0.28, 0.35], [-0.3, 0.28, 0.35]];
  const t1 = [[-0.22, 0.55, -0.35], [0.22, 0.55, -0.35], [0.22, 0.55, 0.1], [-0.22, 0.55, 0.1]];
  box(t0); box(t1);
  for (let i = 0; i < 4; i++) e.push([t0[i], t1[i]]);
  // the gun
  e.push([[0, 0.45, 0.2], [0, 0.45, 1.25]]);
  return e;
})();

/** The saucer: two cones and a rim, edges. */
export const SAUCER = (() => {
  const e = [], n = 8, rim = [], top = [], bot = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rim.push([Math.cos(a), 0, Math.sin(a)]);
    top.push([Math.cos(a) * 0.42, 0.32, Math.sin(a) * 0.42]);
    bot.push([Math.cos(a) * 0.5, -0.2, Math.sin(a) * 0.5]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    e.push([rim[i], rim[j]], [top[i], top[j]], [rim[i], top[i]], [bot[i], bot[j]], [rim[i], bot[i]]);
  }
  return e;
})();
