// Black-figure: the ten numerals, each a figure painted in slip, in a
// 30 x 46 box standing on the groundline (y = 46). Parts are in painting
// order: silhouette strokes first, then incisions ('i'), then added red and
// white. The set is designed as numerals first: every counter stays open
// reserved clay, and props (shields, spears, pipes) carry the strokes.
//   0 a hoplite behind his round shield (aspis), helmet over the rim
//   1 an elder wrapped in his himation, arm raised
//   2 a swan: neck curled over, body along the water
//   3 a bearded serpent rearing
//   4 an aulos player: the pipes are the diagonal, his forearm the bar
//   5 a kneeling spearman: spear overhead, back upright, bent leg the bowl
//   6 a crouching hoplite: shield low, his crest sweeps up and over
//   7 a javelin thrower leaning back, javelin level
//   8 a Boeotian shield, waisted
//   9 a hoplite striding out from under his raised shield

import { raster } from './blackfigure-raster.js';

export const GW = 30, GH = 46;
export const MW = 38, MH = 56, MOX = 4, MOY = 8;   // the map box round the digit box

const L = (p, w, m = 'k') => ({ t: 'L', p, w, m });
const P = (p, m = 'k', ax) => ({ t: 'P', p, m, ax });
const E = (c, r, m = 'k', ax) => ({ t: 'E', c, r, m, ax });
const R = (c, r, w, m = 'k', a) => ({ t: 'R', c, r, w, m, a });
const I = (p) => L(p, 1, 'i');
/** Mark a part as one that sways while the figure stands (drawn per frame from small rasters). */
const A = (q) => ({ ...q, anim: true });
const dot = (x, y, m = 'w') => P([[x - 0.1, y - 0.1], [x + 1.1, y - 0.1], [x + 1.1, y + 1.1], [x - 0.1, y + 1.1]], m);

/**
 * A Corinthian helmet in profile, facing f (+1 right, -1 left): dome, the
 * pointed cheek guard, the eye opening scraped back to clay, and a crest
 * trailing back (cl its length; 0 for none). Returns [slip parts, detail parts].
 */
function helmet(cx, cy, f, cl = 1, d = 0) {
  const X = (dx) => cx + dx * f;
  const k = [
    E([cx, cy], [4.6, 4.4]),
    P([[X(3.6), cy - 1.4], [X(5.0), cy + 3], [X(4.4), cy + 6.6], [X(2.6), cy + 8.2], [X(1.2), cy + 5.4], [X(-1.6), cy + 5.6], [X(-4.2), cy + 7.6], [X(-5.2), cy + 3.4], [X(-4.4), cy - 0.8]]),
  ];
  if (cl) k.push(A(L([[X(1.6), cy - 4], [X(-1.4), cy - 7.2 - d * 0.4], [X(-6 * cl), cy - 7.4 - d * 0.9], [X(-9 * cl - d * 0.5), cy - 4.4 - d * 1.4]], [3.4, 2])));
  const dd = [
    E([X(2.4), cy + 1.6], [1.5, 1.0], 'x'),
    I([[X(-0.6), cy - 1.4], [X(-0.6), cy + 4.6]]),
  ];
  if (cl) dd.push(A(L([[X(-1.2), cy - 7.2 - d * 0.4], [X(-6 * cl), cy - 7.4 - d * 0.9]], 1.2, 'r')));
  return [k, dd];
}

/** Added-white dots round a shield's rim band. */
function rimDots(cx, cy, rx, ry, n, skip = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const a = (i / n) * Math.PI * 2;
    out.push(dot(cx + Math.sin(a) * rx - 0.5, cy - Math.cos(a) * ry - 0.5));
  }
  return out;
}

/** A zigzag incision along a polyline: the serpent's scales, a crest's hair. */
function zig(p, amp, step) {
  const out = [];
  let flip = 1;
  for (let i = 1; i < p.length; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i];
    const l = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(l / step));
    const nx = -(by - ay) / l, ny = (bx - ax) / l;
    for (let s = i === 1 ? 0 : 1; s <= n; s++) {
      const u = s / n;
      out.push([ax + (bx - ax) * u + nx * amp * flip, ay + (by - ay) * u + ny * amp * flip]);
      flip = -flip;
    }
  }
  return I(out);
}

const DIGITS = [
  // 0: aspis; the warrior's helmet over the rim, spear behind, greaves below
  (d) => {
    const [hk, hd] = helmet(18.4, 1.6, 1, 0.9, d);
    return [
      L([[23.6, 10], [28.6, -2]], 1.8),
      P([[27.6, -0.8], [29.6, -5], [30, -0.4]]),
      ...hk,
      R([14.6, 25], [13.8, 18.8], 6.8),
      P([[7.6, 42.6], [11.4, 42.6], [11.4, 45], [14.4, 46.2], [7.2, 46.2]]),
      P([[16.6, 42.6], [20.4, 42.6], [20.4, 45], [23.4, 46.2], [16.2, 46.2]]),
      ...hd,
      R([14.6, 25], [12, 17], 1.05, 'i'),
      ...rimDots(14.6, 25, 10.2, 14.8, 14, [0, 1, 13]),
    ];
  },
  // 1: an elder in his himation, facing left, forearm raised
  (d) => [
    E([17.6, 5.4], [3.7, 4.1]),
    P([[14.4, 3.4], [12.2, 6.4], [14.6, 7.2]]),
    P([[14.2, 7.2], [11.4, 12.6], [15.8, 11.2], [18.8, 8.2]]),
    P([[19.6, 2.6], [22.6, 6], [21.8, 12], [18.6, 9.8]]),
    P([[14.2, 9.6], [21, 9.6], [23.2, 14], [23, 43.5], [11.4, 43.5], [12, 14]], 'k', [0, 1]),
    A(L([[14, 14.5], [7.8 + d * 0.3, 18.8 - d * 1.2], [5.8 + d * 0.6, 15.4 - d * 1.8]], [4.2, 3])),
    P([[11.4, 42.5], [23, 42.5], [23, 46.2], [7.8, 46.2], [9, 44.6]]),
    I([[15, 15.6], [14.4, 41.6]]), I([[18.2, 16.4], [18, 41.6]]), I([[21, 20], [20.6, 40]]),
    I([[12.6, 21.4], [22.2, 15.4]]),
    A(I([[14.4, 17.8], [8.6 + d * 0.3, 21.6 - d * 1.2]])),
    I([[15, 4.6], [15, 4.6]]),
    P([[11.6, 38.4], [23, 38.4], [23, 40.6], [11.6, 40.6]], 'r'),
    L([[15.4, 2.4], [20.6, 3.6]], 1.4, 'r'),
  ],
  // 2: a swan, neck curled over, body along the bottom
  (d) => [
    A(E([6.8 - d * 0.3, 9.6 + d * 0.9], [4.2, 3.4])),
    L([[6.4, 7], [9.6, 3.2], [15.4, 1.6], [21.6, 3.2], [25.2, 8.4], [24.8, 14.8], [20.4, 21.8], [13, 30.4], [7.8, 37.4]], [4.4, 6.6]),
    P([[3, 41.6], [6.4, 36], [14, 35.2], [22, 35.8], [27, 31.4], [30, 28.6], [29.4, 36.6], [26.4, 42.6], [20.6, 45.8], [8, 45.8], [3, 44.6]], 'k', [1, 0]),
    A(P([[3.6 - d * 0.3, 10.6 + d * 0.9], [0.6 - d * 0.6, 15.6 + d * 1.2], [5.6 - d * 0.3, 12.6 + d * 0.9]], 'r')),
    I([[12.4, 39.4], [19, 37.8], [26.6, 33.4]]), I([[14.6, 42], [21.4, 40.6], [27.6, 36.4]]),
    I([[9, 37.4], [13, 36.8]]),
    A(dot(5.8 - d * 0.3, 8.2 + d * 0.9)),
    P([[12.4, 39.2], [19.4, 37.8], [27, 33.2], [25, 38.6], [20.2, 40.4], [13.4, 41.6]], 'r'),
    I([[5, 43.8], [24.4, 43.8]]),
  ],
  // 3: a bearded serpent rearing, jaws open at the top left
  (d) => {
    const top = [[8.4, 4.8], [14.4, 2.8], [21, 3.4], [25.6, 7], [26, 12.8], [22.2, 18.2], [14, 21.4]];
    const bot = [[14, 21.6], [21.6, 23.6], [26.8, 28.2], [27.4, 35], [24.4, 40.8], [17.8, 44.4], [10, 44.2], [4.8, 41.4], [2, 37.4]];
    return [
      P([[1, 3.6], [4.4, 0.6], [9.4, 1.2], [11.4, 5.4], [9, 8.8], [3.4, 8.6], [0.4, 7.4], [4.4, 6.2]], 'k', [1, 0]),
      P([[3.4, 8], [3.2, 13.2], [7.4, 8.6]]),
      L(top, [6.4, 5.6]),
      L(bot, [5.8, 2.4]),
      dot(4.6, 2.6),
      zig(top.slice(1), 1.2, 2.6),
      zig(bot.slice(0, 7), 1.0, 2.6),
      ...(d > 0 ? [A(L([[2.8, 5.4], [2.8 - 4.4 * d, 5.2], [2.8 - 5.6 * d, 4 + 0.4 * (1 - d)]], 1.2, 'r'))] : []),
    ];
  },
  // 4: an aulos player facing left: pipes from his mouth, forearm level, robe below
  (d) => [
    E([23.4, 5.8], [3.9, 4.3]),
    P([[20.2, 3.8], [18.2, 6.6], [20.4, 7.4]]),
    P([[20.2, 7.6], [19.2, 11.4], [22.6, 11]]),
    P([[24.6, 2], [27.8, 4.6], [27.4, 10], [25, 9.4]]),
    A(L([[20.2, 8.4], [3.6 + d * 0.5, 29.6 - d * 1.1]], [2.8, 3.6])),
    A(L([[20.6, 9.6], [6.8 + d * 0.5, 31.4 - d * 1.1]], [2.4, 3.2])),
    P([[19.2, 10.4], [27, 10.4], [28.6, 18], [28.6, 43.4], [18.4, 43.4], [19, 18]], 'k', [0, 1]),
    A(L([[4.6 + d * 0.5, 30.4 - d * 1.1], [21, 30.4], [30, 30.8]], [4.4, 4.8])),
    P([[18.4, 42.4], [28.6, 42.4], [28.6, 46.2], [14.6, 46.2], [15.8, 44.4]]),
    I([[19.6, 9.6], [23.6, 8.6], [26.6, 6]]),
    A(I([[19.2, 28], [27.6, 28.2]])),
    I([[22, 33], [21.6, 41.6]]), I([[25.2, 33], [25.4, 41.6]]),
    I([[20.6, 13], [20.6, 13]]),
    dot(21.4, 4.4, 'k'),
    P([[18.6, 37.6], [28.6, 37.6], [28.6, 39.8], [18.6, 39.8]], 'r'),
    L([[22.4, 2.4], [26.6, 3.8]], 1.4, 'r'),
  ],
  // 5: a kneeling spearman: spear overhead, upright back, the bent leg is the bowl
  (d) => {
    const [hk, hd] = helmet(8.2, 11.6, 1, 0);
    const e = d * 1.2;
    return [
      A(L([[1.6 + e, 3.6], [24 + e, 3.6]], 2.6)),
      A(P([[22.4 + e, 1], [30.2 + e, 3.6], [22.4 + e, 6.2]])),
      L([[5.4, 3.2], [5.4, 12]], 5.2),
      ...hk,
      L([[6, 17], [6.4, 24.4]], [7.6, 6.6]),
      L([[6.6, 22.8], [15.6, 21.2], [23.8, 24.2], [28, 30.6], [27, 38], [21.6, 43.2], [13, 44.8], [6.2, 43.4]], [6.6, 4.6]),
      P([[2.8, 40.2], [7.8, 41], [7.4, 46.2], [0.8, 46.2]]),
      ...hd,
      I([[2.8, 20.4], [9.6, 20.4]]),
      I([[22.4, 27.4], [25.4, 33.4]]), I([[20.8, 29], [23.2, 35]]),
      P([[2.6, 21.6], [9.8, 21.6], [10, 24], [2.6, 24]], 'r'),
    ];
  },
  // 6: a crouching hoplite: his crest sweeps up and over, the shield low
  (d) => {
    const [hk, hd] = helmet(8.6, 18.6, 1, 0);
    const crest = [[7.4, 13.8], [8.4, 8], [13, 3.4 - d * 0.2], [19.6, 1.8 - d * 0.5], [25.4 + d * 0.3, 3.8 - d * 0.8], [27.6 + d * 0.5, 7.6 - d * 1.1]];
    return [
      L([[5.6, 31], [5.6, 21]], [6.6, 5.6]),
      ...hk,
      A(L(crest, [5.4, 3])),
      R([16.4, 33.6], [12.8, 12.6], 6.6),
      ...hd,
      A(zig(crest.slice(1, 5), 1.1, 2.2)),
      R([16.4, 33.6], [10.8, 10.6], 1.05, 'i'),
      ...rimDots(16.4, 33.6, 8.4, 8.2, 10, [8]),
      L([[6.6, 13.4], [10.2, 13]], 1.8, 'r'),
    ];
  },
  // 7: a javelin thrower facing left, leaning back, javelin held level overhead
  (d) => [
    A(L([[0.4 + d * 1.4, 4.4], [29.6 + d * 1.4, 4.4]], 2.4)),
    A(P([[d * 1.4, 4.4], [3.4 + d * 1.4, 2.6], [3.4 + d * 1.4, 6.2]])),
    E([24.2, 9.8], [3.8, 4.2]),
    P([[21, 8], [18.8, 10.6], [21.2, 11.4]]),
    L([[27.2, 5.6], [27.8, 12.4]], 3.4),
    A(L([[22, 13.6], [14.6 + d * 0.8, 7.6], [10.6 + d * 1.4, 5.6]], [3.4, 2.6])),
    L([[24, 13.4], [19.6, 21], [15.2, 28]], [7.6, 6.2]),
    L([[15.6, 26.6], [10.8, 35.6], [5.6, 44.6]], [5.8, 4.2]),
    L([[16.6, 28], [13.8, 36.6], [11.6, 44.6]], [5, 3.6]),
    P([[1.4, 43.4], [7.2, 43.4], [7.6, 46.2], [0.4, 46.2]]),
    P([[9.6, 43.4], [13.8, 43.4], [14, 46.2], [8.4, 46.2]]),
    I([[24.6, 12.6], [18.6, 22]]),
    I([[15.6, 29.6], [9.4, 40.6]]),
    I([[21.2, 6.6], [21.2, 6.6]]),
    L([[21.8, 6.6], [26.6, 7.2]], 1.4, 'r'),
  ],
  // 8: a Boeotian shield, waisted; the hoplite's helmet over it, his spear behind
  (d) => {
    const [hk, hd] = helmet(19.4, 0.6, 1, 0.9, d);
    return [
      L([[24.4, 10], [28.8, -2.6]], 1.8),
      P([[27.8, -1.4], [29.8, -5.6], [30.2, -1]]),
      ...hk,
      E([15, 25.6], [14.4, 20.6], 'k', [0, 1]),
      E([0.2, 26.2], [4.8, 3.2], 'x'),
      E([29.8, 26.2], [4.8, 3.2], 'x'),
      E([15, 15.4], [7.8, 7], 'x'),
      E([15, 35.8], [8.8, 7.6], 'x'),
      ...hd,
      R([15, 25.6], [12.6, 18.8], 1.05, 'i'),
      ...rimDots(15, 25.6, 11, 17, 16, [0, 1, 15, 4, 12]),
    ];
  },
  // 9: a hoplite striding out from under his raised shield
  (d) => {
    const [hk, hd] = helmet(14.2, 0.4, 1, 0.8, d);
    return [
    L([[22, 6], [27.4, -3.4]], 1.8),
    P([[26.4, -2.4], [28.6, -6.4], [29, -2]]),
    ...hk,
    R([15, 14.6], [13.2, 13], 6.6),
    L([[23.4, 24.6], [26.6, 31.4], [22.8, 38], [15.6, 42.8], [8.6, 44.4]], [6.8, 4.6]),
    P([[3, 42.2], [9.4, 41.8], [10.4, 46.2], [1.8, 46.2]]),
    R([15, 14.6], [11.2, 11], 1.05, 'i'),
    I([[21.6, 37.2], [16.6, 40.6]]), I([[22.8, 34.4], [18.2, 37.8]]),
    I([[24.4, 33.6], [25.8, 31]]),
    ...hd.filter((q) => q.m !== 'x'),
    ...rimDots(15, 14.6, 8.8, 8.6, 10, [0]),
    ];
  },
];

/** The whole figure at rest (painting, wiping, the turn), as one map. */
export const GLYPHS = DIGITS.map((f) => raster(f(0), MW, MH, MOX, MOY));

/**
 * The figure standing: its still parts (BASE), and its swaying parts as
 * SWAY_N small cropped rasters for displacements -1..1 (null if it has none).
 */
export const SWAY_N = 9;
export const BASE = DIGITS.map((f) => {
  const still = f(0).filter((q) => !q.anim);
  return raster(still, MW, MH, MOX, MOY);
});
export const SWAY = DIGITS.map((f) => {
  if (!f(0).some((q) => q.anim) && !f(1).some((q) => q.anim)) return null;
  const full = [];
  for (let n = 0; n < SWAY_N; n++) {
    const d = -1 + (2 * n) / (SWAY_N - 1);
    // keep the still parts' 'x' scrapes out of it; the sway is slip and colour laid on top
    full.push(raster(f(d).filter((q) => q.anim), MW, MH, MOX, MOY));
  }
  let x0 = MW, y0 = MH, x1 = 0, y1 = 0;
  for (const r of full) for (let i = 0; i < MW * MH; i++) if (r.k[i] || r.o[i]) { const x = i % MW, y = (i / MW) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  const w = x1 - x0, h = y1 - y0;
  return full.map((r) => {
    const k = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { k[j * w + i] = r.k[(y0 + j) * MW + x0 + i]; o[j * w + i] = r.o[(y0 + j) * MW + x0 + i]; }
    return { x0, y0, w, h, k, o };
  });
});
