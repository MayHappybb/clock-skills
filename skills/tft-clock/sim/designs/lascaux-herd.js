// The herd: ten numerals that are ten painted animals, for lascaux.js.
//
// Each digit is authored as painted parts in a 32 x 52 frame (the hour
// size; parts may overhang it by MARGIN) and rasterised once at boot at two
// sizes into a paint map: per pixel a pigment id, a coverage and a paint
// order (when the painter's finger reaches it). Parts:
//   b  body stroke [[x, y, r], ...] whose radius swells and tapers (the
//      chest, the belly, the hump), or an oval [cx, cy, rx, ry] (also 'o');
//      ochre fill shaded toward a charcoal contour that is thick along the
//      back and thin at the belly, as the Lascaux painters drew it
//   w  wash: a dark umber blown over part of the body (forequarters, the
//      neck behind a black head, the haunches above the legs)
//   n  charcoal mass: heads, muzzles, manes, beards, tufts
//   k  charcoal line: horns, ears, tails, antler tines
//   e  eye or tusk, in a light pigment: [geometry, pigment]
//   a/c legs in two poses, charcoal, tapering to small hooves: the torch
//      flicker swaps them, so the animals seem to step
// Round every animal a soft soot halo darkens the rock, so the herd stands
// off the wall it is painted on.
//
// The body strokes ARE the numeral's strokes; the heads sit on the
// terminals, horns and legs hang off where they cannot close or open a
// counter.
//
// Flash (if shipped rather than built at boot): hour maps 42 x 62 x 3 bytes
// x 10 = 78 KB, minute maps 36 x 53 x 3 x 10 = 57 KB.

import { rand, noise2 } from '../js/kit.js';

export const PIG = { black: 1, red: 2, yellow: 3, brown: 4, legA: 5, legB: 6, halo: 10, wash: 11 };
// 7, 8, 9: red, yellow and brown shaded toward the contour
export const MARGIN = 5;

// ------------------------------------------------------------ authoring helpers
const D2R = Math.PI / 180;
/** Cubic Bezier through [x, y] points, radius r0 -> r1. */
function bez(p0, p1, p2, p3, r0 = 3, r1 = r0, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], r0 + (r1 - r0) * u]);
  }
  return out;
}
const join = (...ls) => ls.reduce((a, l) => a.concat(a.length ? l.slice(1) : l), []);
function lerpTable(t, u) {
  if (u <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (u <= t[i][0]) { const a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); }
  return t[t.length - 1][1];
}
/** Radius along a chain by arc-length fraction: table [[u, r], ...]. */
function prof(pts, table) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const T = L[L.length - 1] || 1;
  return pts.map((p, i) => [p[0], p[1], lerpTable(table, L[i] / T)]);
}
/** An elliptical ring from angle a0 to a1 (degrees, 0 = right, 90 = down), radius by angle from a 0..360 table. */
function ring(cx, cy, rx, ry, a0, a1, table, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, ad = ((a % 360) + 360) % 360;
    out.push([cx + rx * Math.cos(a * D2R), cy + ry * Math.sin(a * D2R), lerpTable(table, ad)]);
  }
  return out;
}
/** A leg: hip, knee, fetlock, hoof; thick at the top, a small hoof. */
const leg = (x0, y0, x1, y1, x2, y2, r = 3.0) => [[x0, y0, r], [x1, y1, r * 0.6], [x1 + (x2 - x1) * 0.78, y1 + (y2 - y1) * 0.78, r * 0.42], [x2, y2, r * 0.56]];
/** A mammoth's pillar leg. */
const pillar = (x0, y0, x2, y2, r = 3) => [[x0, y0, r], [x0 + (x2 - x0) * 0.6, y0 + (y2 - y0) * 0.6, r * 0.78], [x2, y2, r * 0.85]];

/** A head's own frame: a along the head from its base toward the muzzle, c toward its top. */
function frameOf(bx, by, ang, side) {
  const dx = Math.cos(ang * D2R), dy = Math.sin(ang * D2R);
  const sd = side ?? (dx <= 0 ? 1 : -1), nx = -dy * sd, ny = dx * sd;
  return (a, c) => [bx + dx * a + nx * c, by + dy * a + ny * c];
}
const at = (P, a, c, r) => { const q = P(a, c); return [q[0], q[1], r]; };
const eyeAt = (P, a, c, r = 0.85) => { const q = P(a, c); return ['e', [q[0], q[1], r, r], PIG.yellow]; };

/** A horse's head in profile: long, tapering to the muzzle, a deep jowl, a pricked ear, an eye. */
function horseHead(bx, by, ang, L, side) {
  const P = frameOf(bx, by, ang, side), k = L / 9;
  return [
    ['n', [at(P, 0, 0.3 * k, 3.1 * k), at(P, L * 0.34, 0.5 * k, 3.0 * k), at(P, L * 0.72, 0.2 * k, 2.1 * k), at(P, L, -0.2 * k, 1.85 * k)]],
    ['n', [at(P, L * 0.26, -1.6 * k, 2.8 * k)]],
    ['k', [at(P, L * 0.06, 2.6 * k, 1.35 * k), at(P, -0.9 * k, 5.8 * k, 0.65 * k)]],
    eyeAt(P, L * 0.38, 1.1 * k, 0.95),
  ];
}
/** Bison and aurochs: a massive head, the lyre of twisted-perspective horns, an ear, an eye, a beard. */
function bovidHead(bx, by, ang, L, side, { beard = false, hornK = 1 } = {}) {
  const P = frameOf(bx, by, ang, side), k = L / 8, c = L * 0.3, h = hornK * k;
  const parts = [
    ['n', [at(P, 0, 0.3 * k, 3.1 * k), at(P, c, 0.6 * k, 3.4 * k), at(P, L * 0.72, 0, 2.6 * k), at(P, L, -0.4 * k, 2.1 * k)]],
    ['k', bez(P(c - 1.2 * k, 2.6 * k), P(c - 4.0 * k, 4.4 * h), P(c - 3.8 * k, 7.0 * h), P(c - 1.5 * k, 8.2 * h), 1.5 * k, 0.6 * k, 10)],
    ['k', bez(P(c + 1.2 * k, 2.6 * k), P(c + 4.0 * k, 4.4 * h), P(c + 3.8 * k, 7.0 * h), P(c + 1.5 * k, 8.2 * h), 1.5 * k, 0.6 * k, 10)],
    ['k', [at(P, c - 2.4 * k, 1.6 * k, 1.2 * k), at(P, c - 5.2 * k, 1.8 * k, 0.6 * k)]],
    eyeAt(P, c + 1.1 * k, 0.9 * k, 0.95),
  ];
  if (beard) parts.push(['n', [at(P, L * 0.42, -2.2 * k, 2.3 * k), at(P, L * 0.3, -4.8 * k, 1.5 * k), at(P, L * 0.4, -6.4 * k, 0.7 * k)]]);
  return parts;
}
/** An ibex's head: short, a goat's beard, a small ear (the great horn is the animal's). */
function ibexHead(bx, by, ang, L, side) {
  const P = frameOf(bx, by, ang, side), k = L / 7.6;
  return [
    ['n', [at(P, 0, 0.2 * k, 2.8 * k), at(P, L * 0.4, 0.3 * k, 2.5 * k), at(P, L, -0.3 * k, 1.5 * k)]],
    ['n', [at(P, L * 0.66, -1.6 * k, 1.3 * k), at(P, L * 0.56, -4.2 * k, 0.75 * k)]],
    ['k', [at(P, L * 0.05, 1.5 * k, 1.1 * k), at(P, -2.6 * k, 2.1 * k, 0.55 * k)]],
    eyeAt(P, L * 0.34, 0.9 * k, 0.95),
  ];
}
/** A deer's head: slim, with big ears (a hind) or small ones (under an antler). */
function deerHead(bx, by, ang, L, side, bigEars) {
  const P = frameOf(bx, by, ang, side), k = L / 8;
  const parts = [['n', [at(P, 0, 0.2 * k, 2.8 * k), at(P, L * 0.4, 0.3 * k, 2.5 * k), at(P, L, -0.2 * k, 1.45 * k)]], eyeAt(P, L * 0.36, 0.95 * k, 0.95)];
  if (bigEars) {
    parts.push(['k', [at(P, L * 0.04, 2.0 * k, 1.4 * k), at(P, -1.0 * k, 5.2 * k, 1.4 * k), at(P, -1.8 * k, 6.6 * k, 0.6 * k)]]);
    parts.push(['k', [at(P, L * 0.24, 2.1 * k, 1.3 * k), at(P, L * 0.38, 5.6 * k, 1.3 * k), at(P, L * 0.3, 7.0 * k, 0.55 * k)]]);
  } else parts.push(['k', [at(P, L * 0.06, 2.0 * k, 1.15 * k), at(P, -1.2 * k, 4.8 * k, 0.55 * k)]]);
  return parts;
}

// ------------------------------------------------------------ the ten animals
// Hour frame 32 x 52: body roughly x 2..30, y 2..46, hooves at 51.
export const ANIMALS = [
  // 0: a bison, curled like the Altamira bison: its back, rump and belly are
  // the ring, the hump swells at the upper left over dark forequarters, the
  // massive bearded head hangs low in front, a raised tufted tail
  {
    name: 'bison', fill: PIG.red,
    parts: [
      ['b', ring(17.5, 23.5, 9.4, 17.0, 0, 360, [[0, 3.6], [45, 3.9], [95, 5.0], [140, 4.7], [185, 4.8], [228, 5.8], [270, 4.9], [315, 3.9], [360, 3.6]])],
      ['w', [9.0, 34.0, 4.6, 5.0]],
      ...bovidHead(8.4, 41.0, 166, 10.4, 1, { beard: true }),
      ['k', [[25.6, 9.4, 1.2], [28.4, 5.8, 1.0], [29.4, 2.8, 0.9]]],
      ['n', [29.6, 1.6, 1.7, 2.3]],
      ['a', leg(11.6, 40.4, 10.2, 46.0, 10.4, 51.0)],
      ['a', leg(24.0, 39.4, 25.6, 45.4, 25.2, 51.0)],
      ['c', leg(12.6, 40.6, 12.9, 46.0, 11.9, 51.0)],
      ['c', leg(23.0, 39.8, 22.8, 45.6, 23.8, 51.0)],
    ],
  },
  // 1: a horse rearing: its barrel the stem, a black head the flag, a short
  // black mane brush along the neck, forelegs pawing, hind legs the foot
  {
    name: 'horse', fill: PIG.yellow,
    parts: [
      ['b', prof(bez([20.6, 8.0], [21.8, 19.0], [19.8, 32.0], [18.6, 43.5]), [[0, 3.4], [0.3, 4.3], [0.55, 5.1], [0.8, 4.7], [1, 3.6]])],
      ['w', [20.4, 9.6, 3.6, 4.6]],
      ['w', [18.4, 42.8, 4.6, 2.8]],
      ...horseHead(19.8, 7.4, 152, 9.6),
      ['n', [[22.8, 4.2, 1.2], [24.8, 8.6, 1.8], [25.4, 13.6, 1.6], [24.8, 18.0, 0.8]]],
      ['k', [[19.6, 36.0, 1.7], [23.8, 38.4, 1.6], [26.8, 43.0, 1.3], [27.8, 48.6, 0.8]]],
      ['a', leg(16.4, 17.4, 12.2, 19.6, 11.0, 24.0, 2.8)],
      ['c', leg(16.6, 18.4, 13.8, 22.8, 13.6, 26.8, 2.8)],
      ['a', leg(17.0, 42.0, 14.0, 46.8, 12.0, 51.0)],
      ['a', leg(19.8, 42.0, 21.4, 46.8, 23.2, 51.0)],
      ['c', leg(17.2, 42.0, 15.6, 47.0, 14.6, 51.0)],
      ['c', leg(19.6, 42.0, 22.4, 46.4, 25.0, 50.4)],
    ],
  },
  // 2: an ibex leaping down: its head and the great back-swept horn the top
  // terminal, the neck the arc, the deep-chested body the diagonal, the
  // hind legs stretched back the base
  {
    name: 'ibex', fill: PIG.brown,
    parts: [
      ['b', prof(bez([8.8, 13.0], [8.6, 4.6], [24.2, 3.2], [25.0, 13.6]), [[0, 3.0], [1, 3.9]])],
      ['b', prof(bez([25.0, 13.6], [25.2, 21.0], [14.6, 29.6], [6.6, 42.6]), [[0, 3.9], [0.45, 5.1], [0.75, 4.9], [1, 4.0]])],
      ['b', prof(bez([6.6, 43.2], [13.0, 44.0], [20.0, 44.2], [28.2, 43.6]), [[0, 3.9], [0.3, 3.1], [0.6, 2.3], [1, 1.6]])],
      ['w', [23.6, 43.8, 9.5, 3.6]],
      ['w', [9.6, 12.6, 3.4, 4.4]],
      ['n', [29.0, 43.4, 1.5, 1.7]],
      ...ibexHead(8.6, 12.4, 125, 7.6),
      ['k', bez([7.8, 9.4], [7.4, 0.0], [15.6, -3.6], [23.6, -1.6], 2.3, 0.7, 16)],
      ['k', [[6.0, 41.4, 1.1], [2.6, 39.0, 0.7]]],
      ['a', leg(15.2, 32.4, 11.0, 34.2, 9.8, 38.0, 2.6)],
      ['c', leg(15.8, 32.0, 13.0, 36.0, 13.0, 39.0, 2.6)],
    ],
  },
  // 3: a mammoth: the domed black head and trunk the top terminal, a pale
  // tusk, the high shoulder the top bowl, the dip of the back the waist, the
  // heavy rump the lower bowl, a shaggy fringe, pillar legs
  {
    name: 'mammoth', fill: PIG.brown,
    parts: [
      ['b', prof(join(bez([7.4, 8.8], [10.4, 2.4], [25.2, 2.6], [24.8, 12.6]), bez([24.8, 12.6], [24.4, 19.6], [18.6, 22.6], [15.0, 23.2])), [[0, 4.6], [0.2, 5.1], [0.45, 4.5], [0.7, 3.4], [1, 2.8]])],
      ['b', prof(join(bez([15.0, 23.2], [23.4, 22.8], [28.4, 27.8], [27.4, 34.4]), bez([27.4, 34.4], [26.4, 44.0], [14.2, 46.2], [5.8, 40.6])), [[0, 2.8], [0.3, 4.3], [0.55, 5.3], [0.8, 4.7], [1, 3.4]])],
      ['w', [13.0, 5.6, 6.0, 4.0]],
      ['n', [7.4, 9.2, 4.9, 5.0]],
      ['n', [11.6, 10.2, 1.9, 2.8]],
      ['n', bez([4.4, 12.0], [1.4, 17.4], [1.8, 23.8], [6.6, 24.4], 2.7, 1.1, 10)],
      ['k', [[6.6, 24.4, 1.1], [7.8, 22.4, 0.7]]],
      ['e', bez([8.4, 13.8], [8.8, 17.8], [11.4, 19.6], [14.2, 18.4], 1.1, 0.6, 8), PIG.yellow],
      ['e', [6.0, 8.2, 0.9, 0.9], PIG.yellow],
      ['k', [[29.0, 29.4, 0.9], [31.2, 32.8, 0.6]]],
      ['k', [[29.4, 34.6, 0.9], [31.6, 38.4, 0.6]]],
      ['k', [[28.2, 39.6, 0.9], [30.0, 43.0, 0.6]]],
      ['k', [[16.6, 45.2, 0.9], [16.2, 48.0, 0.6]]],
      ['k', [[5.6, 40.6, 1.0], [2.6, 38.6, 0.7]]],
      ['a', pillar(10.4, 42.6, 9.2, 51.0, 2.3)],
      ['a', pillar(22.0, 42.0, 23.6, 51.0, 2.3)],
      ['c', pillar(12.4, 43.0, 12.6, 51.0, 2.3)],
      ['c', pillar(20.2, 42.4, 20.0, 51.0, 2.3)],
    ],
  },
  // 4: a giant deer (Megaloceros): neck and foreleg the stem, a humped
  // withers, the barrel the crossbar, the great black palmate antler the
  // diagonal
  {
    name: 'giant deer', fill: PIG.red,
    parts: [
      ['b', prof(bez([21.8, 9.4], [22.2, 20.0], [21.6, 30.0], [21.6, 42.0]), [[0, 3.0], [0.35, 3.9], [0.65, 4.6], [0.8, 4.0], [1, 2.8]])],
      ['b', prof(bez([5.4, 33.4], [12.0, 33.2], [20.0, 33.2], [28.4, 33.2]), [[0, 3.6], [0.4, 4.6], [0.7, 4.6], [1, 3.2]])],
      ['o', [24.0, 24.4, 3.4, 6.0]],
      ['w', [22.0, 11.4, 3.6, 4.0]],
      ['w', [21.6, 41.2, 3.6, 3.0]],
      ...deerHead(22.4, 8.6, 14, 8.8, -1, false),
      ['n', bez([19.6, 6.4], [15.2, 12.4], [9.4, 20.4], [5.2, 28.6], 1.9, 2.7, 12)],
      ['k', [[15.4, 12.2, 1.2], [12.0, 9.4, 0.9], [10.8, 6.0, 0.6]]],
      ['k', [[11.4, 18.2, 1.2], [7.6, 15.8, 0.9], [5.8, 12.4, 0.6]]],
      ['k', [[7.6, 24.4, 1.2], [4.0, 22.6, 0.9], [2.2, 19.4, 0.6]]],
      ['k', [[3.8, 31.2, 1.1], [1.2, 28.6, 0.7]]],
      ['a', leg(7.0, 35.6, 5.2, 39.6, 4.2, 43.0, 2.6)],
      ['c', leg(8.0, 35.6, 9.2, 39.6, 9.0, 43.0, 2.6)],
      ['a', leg(20.6, 41.0, 18.4, 46.6, 17.2, 51.0)],
      ['a', leg(22.6, 41.0, 24.6, 46.6, 26.2, 51.0)],
      ['c', leg(20.8, 41.0, 20.0, 46.6, 19.6, 51.0)],
      ['c', leg(22.4, 41.0, 23.0, 46.6, 23.6, 51.0)],
    ],
  },
  // 5: a bison charging, head down: its raised tail the flag and stem, its
  // humped body the bowl, the dark bearded head and horns the lower terminal
  {
    name: 'bison', fill: PIG.red,
    parts: [
      ['b', prof([[26.0, 6.2, 2.5], [10.2, 6.6, 3.0]], [[0, 2.5], [1, 3.0]])],
      ['b', [[10.2, 6.6, 3.0], [9.2, 21.6, 3.4]]],
      ['b', prof(join(bez([9.2, 21.6], [16.0, 15.4], [28.0, 18.2], [27.4, 31.0]), bez([27.4, 31.0], [27.0, 42.2], [14.2, 46.6], [7.6, 41.4])), [[0, 3.4], [0.25, 5.4], [0.45, 5.7], [0.7, 4.9], [1, 3.6]])],
      ['n', [28.6, 5.6, 2.4, 2.6]],
      ['w', [11.0, 39.6, 5.4, 4.4]],
      ...bovidHead(8.0, 40.4, 132, 10.0, 1, { beard: true, hornK: 0.8 }),
      ['a', leg(14.6, 43.4, 12.8, 47.6, 12.0, 51.0)],
      ['a', leg(23.0, 41.0, 24.6, 46.4, 26.0, 50.8)],
      ['c', leg(16.0, 43.6, 16.4, 48.0, 15.8, 51.0)],
      ['c', leg(21.4, 42.0, 21.0, 46.6, 21.8, 51.0)],
    ],
  },
  // 6: a hind (red deer doe): the black head and big ears the top terminal,
  // the long neck the spine, the round body the bowl
  {
    name: 'hind', fill: PIG.yellow,
    parts: [
      ['b', prof(bez([22.4, 9.8], [12.0, 9.2], [6.8, 20.0], [7.0, 31.0]), [[0, 2.8], [0.5, 3.4], [1, 4.0]])],
      ['b', ring(16.6, 33.6, 9.6, 10.4, 180, 540, [[0, 3.8], [90, 4.9], [180, 4.1], [270, 3.4], [360, 3.8]])],
      ['w', [21.0, 10.2, 3.2, 3.6]],
      ...deerHead(21.6, 9.4, 20, 8.6, -1, true),
      ['k', [[26.4, 29.6, 1.0], [29.0, 28.2, 0.7]]],
      ['a', leg(12.0, 42.6, 10.6, 47.0, 9.6, 51.0, 2.6)],
      ['a', leg(21.6, 42.2, 23.4, 46.8, 24.4, 51.0, 2.6)],
      ['c', leg(13.2, 43.0, 13.8, 47.4, 13.4, 51.0, 2.6)],
      ['c', leg(20.2, 42.8, 19.6, 47.2, 20.4, 51.0, 2.6)],
    ],
  },
  // 7: a horse stretching its neck: the black head the top-left terminal,
  // the neck under its mane brush the top bar, the round barrel the
  // diagonal, forelegs tucked under the chest, hind legs and tail at the foot
  {
    name: 'horse', fill: PIG.yellow,
    parts: [
      ['b', prof(bez([9.2, 9.8], [14.0, 8.8], [20.0, 8.6], [26.0, 9.2]), [[0, 3.0], [1, 4.2]])],
      ['b', prof(bez([26.0, 9.2], [24.8, 20.0], [18.4, 31.0], [14.4, 42.0]), [[0, 4.2], [0.35, 5.3], [0.65, 5.1], [1, 3.8]])],
      ['w', [10.6, 9.6, 3.2, 3.6]],
      ['w', [14.6, 41.4, 3.6, 2.6]],
      ...horseHead(9.8, 9.8, 166, 9.6),
      ['n', [[11.4, 5.6, 1.3], [16.8, 4.6, 1.8], [22.8, 5.0, 1.6], [26.6, 6.6, 0.9]]],
      ['k', bez([17.0, 38.0], [20.0, 39.6], [22.0, 44.0], [22.4, 49.0], 1.7, 0.8, 8)],
      ['a', leg(25.6, 13.2, 29.6, 16.0, 29.2, 20.6, 2.8)],
      ['c', leg(25.0, 13.6, 27.8, 18.2, 26.6, 22.0, 2.8)],
      ['a', leg(14.0, 41.6, 11.6, 46.6, 10.4, 51.0)],
      ['a', leg(16.0, 41.6, 17.2, 46.6, 18.2, 51.0)],
      ['c', leg(14.2, 41.6, 13.4, 46.6, 13.8, 51.0)],
      ['c', leg(15.8, 41.6, 16.2, 46.8, 15.6, 51.0)],
    ],
  },
  // 8: an aurochs: the humped forequarters the top loop, the heavy belly and
  // hindquarters the lower loop, the dark head and lyre horns out of the
  // waist, the tail out of the other side
  {
    name: 'aurochs', fill: PIG.red,
    parts: [
      ['b', ring(16.2, 14.4, 8.0, 9.2, 90, 450, [[0, 3.4], [90, 3.0], [180, 3.5], [270, 4.2], [360, 3.4]], 32)],
      ['b', ring(16.2, 34.2, 10.0, 10.2, -90, 270, [[0, 4.2], [90, 5.1], [180, 4.3], [270, 3.0], [360, 4.2]])],
      ['w', [9.6, 12.0, 4.6, 6.0]],
      ...bovidHead(8.6, 24.6, 166, 9.6, 1, { hornK: 0.85 }),
      ['k', [[25.6, 24.4, 1.1], [28.6, 26.6, 0.9], [30.2, 30.0, 0.8]]],
      ['n', [30.6, 31.4, 1.5, 2.2]],
      ['a', leg(11.4, 42.6, 9.8, 47.2, 8.8, 51.0)],
      ['a', leg(21.4, 42.6, 23.0, 47.2, 24.4, 51.0)],
      ['c', leg(12.8, 43.4, 13.4, 47.6, 12.8, 51.0)],
      ['c', leg(20.0, 43.4, 19.4, 47.6, 20.2, 51.0)],
    ],
  },
  // 9: a horse grazing: its round haunch and back the bowl, the neck under
  // a black mane brush the descending stroke, the black head down at the
  // grass, forelegs by the head, a raised tail
  {
    name: 'horse', fill: PIG.brown,
    parts: [
      ['b', ring(15.6, 15.0, 9.4, 10.4, 0, 360, [[0, 3.6], [90, 3.4], [180, 4.7], [270, 3.9], [360, 3.6]], 36)],
      ['b', prof(bez([24.8, 14.6], [25.6, 27.0], [22.2, 35.0], [17.4, 40.2]), [[0, 3.8], [0.4, 4.3], [1, 3.2]])],
      ['w', [18.6, 38.6, 3.8, 3.4]],
      ...horseHead(17.6, 40.0, 148, 9.4),
      ['n', [[28.2, 14.0, 1.2], [29.2, 22.0, 1.7], [27.6, 30.4, 1.6], [24.2, 36.4, 0.9]]],
      ['k', bez([8.4, 7.0], [6.2, 4.4], [4.4, 3.4], [2.4, 1.6], 1.7, 0.8, 8)],
      ['a', leg(22.2, 38.4, 23.6, 44.6, 24.8, 51.0, 2.8)],
      ['c', leg(20.8, 39.2, 20.8, 45.0, 21.6, 51.0, 2.8)],
    ],
  },
];

// ------------------------------------------------------------ rasteriser
const isOval = (g) => typeof g[0] === 'number';
function chainLen(pts) {
  let l = 0; for (let i = 1; i < pts.length; i++) l += Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2);
  return l;
}
/** Distance to a tapered chain minus its radius; out[0] = arc-length fraction of the nearest point. */
function chainDist(px, py, pts, total, out) {
  if (pts.length === 1) { out[0] = 0; return Math.sqrt((px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2) - pts[0][2]; }
  let best = 1e9, bu = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], ar = pts[i - 1][2], bx = pts[i][0], by = pts[i][1], br = pts[i][2];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - ax - u * dx, ey = py - ay - u * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - (ar + (br - ar) * u);
    if (d < best) { best = d; bu = total ? (acc + u * l) / total : 0; }
    acc += l;
  }
  out[0] = bu;
  return best;
}
function ovalDist(px, py, g, out) {
  const qx = (px - g[0]) / g[2], qy = (py - g[1]) / g[3];
  out[0] = (Math.atan2(qy, qx) / (2 * Math.PI) + 1) % 1;
  return (Math.sqrt(qx * qx + qy * qy) - 1) * Math.min(g[2], g[3]);
}
const partDist = (px, py, q, out) => (q.oval ? ovalDist(px, py, q.g, out) : chainDist(px, py, q.g, q.total, out));
function partPoint(q, u) {
  const g = q.g;
  if (q.oval) { const a = u * 2 * Math.PI; return [g[0] + g[2] * 0.5 * Math.cos(a), g[1] + g[3] * 0.5 * Math.sin(a)]; }
  if (g.length === 1) return [g[0][0], g[0][1]];
  let want = u * q.total;
  for (let i = 1; i < g.length; i++) {
    const l = Math.sqrt((g[i][0] - g[i - 1][0]) ** 2 + (g[i][1] - g[i - 1][1]) ** 2);
    if (want <= l || i === g.length - 1) { const v = l ? Math.min(1, want / l) : 0; return [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * v, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * v]; }
    want -= l;
  }
  return [g[0][0], g[0][1]];
}

const HALO_R = 4.2;   // the soot halo's reach, pixels

/**
 * Rasterise animal `d` at scale `s` (1 = the hour frame) into a paint map
 * whose (0, 0) is at frame (-MARGIN, -MARGIN). `minR` floors line radii so
 * thin parts survive the small size; `cw` is the contour width in pixels at
 * the sides (thicker on the back, thinner at the belly).
 */
function rasterise(d, s, cw, minR) {
  const A = ANIMALS[d];
  const w = Math.ceil((32 + 2 * MARGIN) * s), h = Math.ceil((52 + 2 * MARGIN) * s);
  const pid = new Uint8Array(w * h), al = new Uint8Array(w * h), ord = new Uint8Array(w * h);
  // paint order: the body (the numeral) first, then heads, lines, legs, eyes
  const rank = { b: 0, o: 0, n: 1, k: 2, a: 3, c: 3, e: 4 };
  const all = A.parts.map((p, i) => {
    const kind = p[0] === 'o' ? 'b' : p[0], oval = isOval(p[1]);
    let g = p[1];
    if (!oval && kind !== 'b' && kind !== 'w') g = g.map(([x, y, r]) => [x, y, Math.max(r, minR / s)]);
    const total = oval ? 0 : chainLen(g);
    return { kind, oval, g, total, i, pig: p[2], len: oval ? Math.PI * (g[2] + g[3]) * 0.5 : total + 2 };
  });
  const timeline = all.filter((q) => q.kind !== 'w').sort((a, b) => rank[a.kind] - rank[b.kind] || a.i - b.i);
  const T = timeline.reduce((a, q) => a + q.len, 0);
  let acc = 0;
  for (const q of timeline) { q.o0 = acc / T; acc += q.len; q.o1 = acc / T; }
  const bodies = all.filter((q) => q.kind === 'b'), washes = all.filter((q) => q.kind === 'w');
  const out = [0];
  const bodyD = (px, py) => { let m = 1e9; for (const q of bodies) { const dd = partDist(px, py, q, out); if (dd < m) m = dd; } return m; };
  const cov = (v) => (v <= -0.5 ? 1 : v >= 0.5 ? 0 : 0.5 - v);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / s - MARGIN, py = (y + 0.5) / s - MARGIN;
      let dB = 1e9, oB = 0, dN = 1e9, oN = 0, dK = 1e9, oK = 0, dA = 1e9, oA = 0, dC = 1e9, oC = 0, dE = 1e9, oE = 0, pE = 0;
      for (const q of timeline) {
        const dd = partDist(px, py, q, out) * s, o = q.o0 + (q.o1 - q.o0) * out[0];
        switch (q.kind) {
          case 'b': if (dd < dB) { dB = dd; oB = o; } break;
          case 'n': if (dd < dN) { dN = dd; oN = o; } break;
          case 'k': if (dd < dK) { dK = dd; oK = o; } break;
          case 'a': if (dd < dA) { dA = dd; oA = o; } break;
          case 'c': if (dd < dC) { dC = dd; oC = o; } break;
          default: if (dd < dE) { dE = dd; oE = o; pE = q.pig; }
        }
      }
      const i = y * w + x;
      const cB = cov(dB), cN = cov(dN), cK = cov(dK), cA = cov(dA), cC = cov(dC), cE = cov(dE);
      const mot = noise2(x / 1.7 + d * 9, y / 1.7, 31), sp = rand(x, y, 40 + d);
      const ink = Math.max(cN, cK);
      let dH = dB, oH = oB;
      if (dN < dH) { dH = dN; oH = oN; }
      if (dK < dH) { dH = dK; oH = oK; }
      const hu = dH < HALO_R ? 1 - Math.max(0, dH) / HALO_R : 0;
      const hA = 255 * 0.6 * Math.pow(hu, 1.3) * (0.75 + 0.25 * noise2(x / 2, y / 2, 70 + d));
      if (cE > 0.35) { pid[i] = pE; al[i] = Math.round(225 * cE); ord[i] = Math.round(oE * 255); }
      else if (ink > 0 && ink >= cB * 0.6) { pid[i] = PIG.black; al[i] = Math.round(255 * Math.max(ink, cB) * (0.86 + 0.14 * sp)); ord[i] = Math.round((cN >= cK ? oN : oK) * 255); }
      else if (cB > 0) {
        // the outward normal's y: + at the belly, - along the back
        const ny = (bodyD(px, py + 0.6) - bodyD(px, py - 0.6)) / 1.2;
        const band = Math.max(0.85, cw * (1.05 - 0.6 * ny));
        if (dB > -band) { pid[i] = PIG.black; al[i] = Math.round(255 * cB * (0.84 + 0.16 * sp)); }
        else {
          let dW = 1e9;
          for (const q of washes) { const dd = partDist(px, py, q, out) * s; if (dd < dW) dW = dd; }
          const wc = Math.min(1, Math.max(0, 0.5 - dW / 2.4));
          if (wc > 0 && rand(x, y, 60 + d) < wc) pid[i] = PIG.wash;
          else pid[i] = dB > -band - 1.3 * s ? A.fill + 5 : A.fill;
          al[i] = Math.round(255 * (0.7 + 0.24 * mot + 0.06 * sp));
        }
        ord[i] = Math.round(oB * 255);
      } else if (cA > 0 && cC > 0) { pid[i] = PIG.black; al[i] = Math.round(255 * Math.max(cA, cC)); ord[i] = Math.round(Math.min(oA, oC) * 255); }
      else if (cA > 0) { pid[i] = PIG.legA; al[i] = Math.round(255 * cA); ord[i] = Math.round(oA * 255); }
      else if (cC > 0) { pid[i] = PIG.legB; al[i] = Math.round(255 * cC); ord[i] = Math.round(oC * 255); }
      else if (hA >= 1) { pid[i] = PIG.halo; al[i] = Math.round(hA); ord[i] = Math.round(oH * 255); }   // the soot halo
      if (pid[i] === PIG.black && al[i] < hA) al[i] = Math.round(hA);
    }
  // the finger's path: 64 samples of what is being painted, by order, in map pixels
  const path = new Float32Array(128);
  for (let k = 0; k < 64; k++) {
    const o = (k + 0.5) / 64, q = timeline.find((p) => o < p.o1) ?? timeline[timeline.length - 1];
    const [px, py] = partPoint(q, (o - q.o0) / (q.o1 - q.o0));
    path[2 * k] = (px + MARGIN) * s; path[2 * k + 1] = (py + MARGIN) * s;
  }
  const bodyEnd = Math.max(...bodies.map((q) => q.o1));
  return { w, h, off: MARGIN * s, pid, al, ord, path, bodyEnd, fill: A.fill };
}

export const HOUR_S = 1, MIN_S = 0.84;
export const GLYPH_H = ANIMALS.map((_, d) => rasterise(d, HOUR_S, 1.45, 0.75));
export const GLYPH_M = ANIMALS.map((_, d) => rasterise(d, MIN_S, 1.25, 0.7));
