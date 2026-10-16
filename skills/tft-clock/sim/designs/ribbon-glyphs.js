// Ribbon glyphs: the ten numerals as the centre line of a 6 px satin
// ribbon, each one continuous ribbon laid in one stroke. Every glyph starts
// at the bottom, where the gymnast's stick holds it (sample 0), and runs to
// the free tail. Curves bend the ribbon softly; every sharp corner is a FOLD:
// the ribbon creases over there, so the far side shows its reverse face and
// the corner is a mitred crease (ribbon-draw.js), the way a real ribbon
// turns a corner. Closed figures (0, 6, 8) lap over their own start.
//
// Coordinates: the centre line lives in a 24 x 40 box (x right, y down);
// with the band's half width of 3 the glyph covers -3..27 x -3..43.
// Every counter keeps at least 10 x 12 px of ground at full width.

export const NS = 128;           // samples per ribbon, the same for every glyph (so they morph index to index)
export const GW = 24, GH = 40;   // the centre line box

// Ops: M x y | L x y | C x1 y1 x2 y2 x y | F (a fold at the current point)
const DEF = {
  0: [['M', 12, 40], ['C', 18.6, 40, 23, 32, 23, 20.5], ['C', 23, 9, 18.6, 0, 12, 0], ['C', 5.4, 0, 1, 9, 1, 20.5],
    ['C', 1, 32, 5.4, 40, 12, 40], ['C', 14.5, 40, 16.5, 39.4, 18, 38]],
  1: [['M', 14, 40], ['L', 14, 0], ['F'], ['C', 11.5, 3.8, 8.5, 6.6, 4.5, 8.6]],
  2: [['M', 24, 40], ['L', 1, 40], ['F'], ['C', 6, 33, 22, 25, 22, 13], ['C', 22, 4.6, 17.5, 0, 11.5, 0],
    ['C', 6, 0, 2, 3.4, 1, 8.6]],
  3: [['M', 0.5, 34.5], ['C', 2.5, 38.6, 6.5, 40, 11.5, 40], ['C', 18.5, 40, 23.5, 36, 23.5, 29.5],
    ['C', 23.5, 23.6, 19, 20, 12.5, 20], ['L', 8, 20], ['F'], ['L', 12, 20], ['C', 18, 20, 22, 16.5, 22, 10.2],
    ['C', 22, 4, 17.5, 0, 11.5, 0], ['C', 6.5, 0, 2.6, 2.6, 1, 6.6]],
  4: [['M', 18, 40], ['L', 18, 0], ['F'], ['L', 0, 27.5], ['F'], ['L', 24, 27.5]],
  5: [['M', 0.5, 35], ['C', 2.6, 38.8, 6.5, 40, 11, 40], ['C', 18.5, 40, 23.5, 35, 23.5, 28],
    ['C', 23.5, 21, 18.5, 16.5, 11.5, 16.5], ['C', 7.5, 16.5, 4.5, 17.4, 2.5, 18.6], ['F'], ['L', 3.5, 0], ['F'], ['L', 22.5, 0]],
  6: [['M', 12, 40], ['C', 18.5, 40, 23.5, 35.5, 23.5, 29], ['C', 23.5, 22.5, 18.5, 18, 12, 18],
    ['C', 5.5, 18, 0.5, 22.5, 0.5, 29], ['C', 0.5, 35.5, 5.5, 40, 12, 40],
    ['C', 5.5, 40, 0.5, 35.5, 0.5, 29], ['C', 0.5, 25, 0.5, 18, 2.5, 11], ['C', 5, 3.5, 9.5, 0, 14, 0],
    ['C', 17.5, 0, 20.5, 1.6, 22.5, 4.4]],
  7: [['M', 7.5, 40], ['C', 9.5, 26, 16, 12, 23, 0], ['F'], ['L', 1, 0]],
  8: [['M', 12, 40], ['C', 19, 40, 24, 35.5, 24, 30], ['C', 24, 24.5, 18, 21, 12, 19.5], ['C', 6.5, 18, 2, 14.5, 2, 9.4],
    ['C', 2, 3.8, 6.5, 0, 12, 0], ['C', 17.5, 0, 22, 3.8, 22, 9.4], ['C', 22, 14.5, 17.5, 18, 12, 19.5],
    ['C', 6, 21, 0, 24.5, 0, 30], ['C', 0, 35.5, 5, 40, 12, 40], ['C', 14, 40, 15.6, 39.6, 17, 38.9]],
  9: [['M', 19.5, 40], ['C', 21.5, 32, 23, 22, 23, 11], ['C', 23, 4.4, 18.5, 0, 12, 0], ['C', 5.5, 0, 1, 4.6, 1, 11],
    ['C', 1, 17.6, 5.5, 22, 12, 22], ['C', 16.5, 22, 20.5, 19.6, 22.6, 15.6]],
};

/** The op list as dense polylines, split into runs at the folds. */
function runsOf(def) {
  const runs = [];
  let cur = [], px = 0, py = 0;
  for (const op of def) {
    if (op[0] === 'M') { px = op[1]; py = op[2]; cur = [[px, py]]; }
    else if (op[0] === 'L') {
      const [, x, y] = op, n = Math.max(2, Math.ceil(Math.hypot(x - px, y - py) / 0.25));
      for (let k = 1; k <= n; k++) cur.push([px + (x - px) * k / n, py + (y - py) * k / n]);
      px = x; py = y;
    } else if (op[0] === 'C') {
      const [, x1, y1, x2, y2, x, y] = op;
      for (let k = 1; k <= 80; k++) {
        const t = k / 80, u = 1 - t;
        cur.push([u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
      }
      px = x; py = y;
    } else if (op[0] === 'F') { runs.push(cur); cur = [[px, py]]; }
  }
  runs.push(cur);
  return runs;
}

function lengths(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

function at(pts, cum, s) {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const f = cum[hi] > cum[lo] ? (s - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
}

/**
 * A glyph as NS samples: positions, arc length and folds (sample indices
 * where the ribbon creases). Built once at load: flash tables on the device.
 */
function build(def) {
  const runs = runsOf(def).map((pts) => ({ pts, cum: lengths(pts) }));
  const total = runs.reduce((a, r) => a + r.cum[r.cum.length - 1], 0);
  const segs = NS - 1;
  // segments per run, proportional to length, at least 2 each
  let alloc = runs.map((r) => Math.max(2, Math.round(segs * r.cum[r.cum.length - 1] / total)));
  let diff = segs - alloc.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const k = alloc.indexOf(Math.max(...alloc));
    alloc[k] += Math.sign(diff); diff -= Math.sign(diff);
  }
  const x = new Float32Array(NS), y = new Float32Array(NS), folds = [];
  let i = 0;
  runs.forEach((r, k) => {
    const L = r.cum[r.cum.length - 1], n = alloc[k];
    for (let j = k === 0 ? 0 : 1; j <= n; j++) { const [px, py] = at(r.pts, r.cum, L * j / n); x[i] = px; y[i] = py; i++; }
    if (k < runs.length - 1) folds.push(i - 1);
  });
  const s = new Float32Array(NS);
  for (let j = 1; j < NS; j++) s[j] = s[j - 1] + Math.hypot(x[j] - x[j - 1], y[j] - y[j - 1]);
  return { x, y, s, L: s[NS - 1], folds, end: [x[0], y[0]] };
}

export const GLYPHS = Object.fromEntries(Object.entries(DEF).map(([k, d]) => [k, build(d)]));
