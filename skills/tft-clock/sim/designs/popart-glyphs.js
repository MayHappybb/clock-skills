// The lettering for popart.js, all drawn for this panel.
//
// Numerals: hand-cut comic sound-effect block figures. Chunky even strokes
// (9 of 52 units), chamfered corners as a letterer's brush cuts them, a
// forward lean, wide open counters (a 6 keeps its top arm, a 4 is open at
// the top so it can never read as A, the 8's top bowl is narrower). Each
// figure is a set of contours in a 28 x 52 unit box, turned once at load
// into a signed distance table per size (int8, 1/8 px: what a const table
// in flash holds), so keyline, misregistered fill and block shadow are all
// lookups.
//
// Small type: a comic letterer's capitals, 4 x 6 with a 1-px pen, drawn as
// sprites (captions, and the sound effects at 2x with an ink outline).

import { to565 } from '../js/kit.js';

export const UW = 28, UH = 52, SHEAR = 0.13;

// ---------------------------------------------------------------- figures (contours, even-odd)

const flip = (pts) => pts.map(([x, y]) => [UW - x, UH - y]);
const SIX = [
  [[6, 0], [26, 0], [26, 9], [11, 9], [9, 11], [9, 18], [22, 18], [28, 24], [28, 46], [22, 52], [6, 52], [0, 46], [0, 6]],
  [[11, 27], [17, 27], [19, 29], [19, 41], [17, 43], [11, 43], [9, 41], [9, 29]],
];
export const FIGURES = [
  [ // 0
    [[6, 0], [22, 0], [28, 6], [28, 46], [22, 52], [6, 52], [0, 46], [0, 6]],
    [[11, 9], [17, 9], [19, 11], [19, 41], [17, 43], [11, 43], [9, 41], [9, 11]],
  ],
  [ // 1
    [[10, 0], [19, 0], [19, 43], [25, 43], [25, 52], [3, 52], [3, 43], [10, 43], [10, 14], [3, 14], [3, 8]],
  ],
  [ // 2
    [[0, 7], [6, 0], [22, 0], [28, 6], [28, 23], [12, 43], [28, 43], [28, 52], [0, 52], [0, 43], [19, 21], [19, 11], [17, 9], [11, 9], [9, 11], [9, 16], [0, 16]],
  ],
  [ // 3
    [[0, 6], [6, 0], [22, 0], [28, 6], [28, 20], [24, 26], [28, 32], [28, 46], [22, 52], [6, 52], [0, 46], [0, 37], [9, 37], [9, 41], [11, 43],
      [17, 43], [19, 41], [19, 33], [17, 31], [9, 31], [9, 22], [17, 22], [19, 20], [19, 11], [17, 9], [11, 9], [9, 11], [9, 15], [0, 15]],
  ],
  [ // 4
    [[1, 0], [10, 0], [9, 31], [17, 31], [17, 0], [26, 0], [26, 31], [28, 31], [28, 40], [26, 40], [26, 52], [17, 52], [17, 40], [0, 40]],
  ],
  [ // 5
    [[1, 0], [28, 0], [28, 9], [10, 9], [10, 18], [22, 18], [28, 24], [28, 46], [22, 52], [6, 52], [0, 46], [0, 37], [9, 37], [9, 41], [11, 43],
      [17, 43], [19, 41], [19, 29], [17, 27], [1, 27]],
  ],
  SIX,
  [ // 7
    [[0, 0], [28, 0], [28, 8], [15, 52], [5, 52], [18, 9], [0, 9]],
  ],
  [ // 8
    [[5, 0], [23, 0], [27, 5], [27, 19], [23, 24], [28, 29], [28, 46], [22, 52], [6, 52], [0, 46], [0, 29], [5, 24], [1, 19], [1, 5]],
    [[11, 8], [17, 8], [18, 9], [18, 17], [17, 18], [11, 18], [10, 17], [10, 9]],
    [[11, 27], [17, 27], [19, 29], [19, 41], [17, 43], [11, 43], [9, 41], [9, 29]],
  ],
  SIX.map(flip),
];

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = ((px - ax) * dx + (py - ay) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
/** Signed distance (units, negative inside) to a set of contours, even-odd. */
function figDist(fig, px, py) {
  let d = Infinity, inside = false;
  for (const pts of fig)
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      const e = segD(px, py, xj, yj, xi, yi);
      if (e < d) d = e;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside ? -d : d;
}

export const GM = 6;   // table margin round each figure: keyline, block shadow, slam squash

/**
 * One size of numeral, `h` px tall. sd[d] is an Int8Array(tw * th): signed
 * distance in 1/8 px at each pixel centre of the glyph box padded by GM,
 * clamped to +-15.9 px. The lean is applied here (the top leans right).
 */
function size(h) {
  const k = h / UH, w = Math.ceil((UW + UH * SHEAR) * k);
  const tw = w + 2 * GM, th = h + 2 * GM;
  const sd = FIGURES.map((fig) => {
    const t = new Int8Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const v = (y - GM + 0.5) / k, u = (x - GM + 0.5) / k - (UH - v) * SHEAR;
        const d = figDist(fig, u, v) * k;
        t[y * tw + x] = Math.max(-127, Math.min(127, Math.round(d * 8)));
      }
    return t;
  });
  return { h, w, tw, th, k, sd };
}
export const HOUR = size(46), MIN = size(32);
export const GLYPH_BYTES = 10 * (HOUR.tw * HOUR.th + MIN.tw * MIN.th);

// ---------------------------------------------------------------- the letterer's capitals, 4 x 6

const L = {
  A: ['.##.', '#..#', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '###.', '#...', '#...', '####'],
  F: ['####', '#...', '###.', '#...', '#...', '#...'],
  G: ['.###', '#...', '#...', '#.##', '#..#', '.###'],
  H: ['#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..##', '...#', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'],
  L: ['#...', '#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '#..#', '###.', '#...', '#...'],
  Q: ['.##.', '#..#', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '...#', '###.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.', '.#.'],
  U: ['#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#..#', '#..#', '#..#', '#..#', '.##.', '.#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#..#', '#..#', '.##.', '.##.', '#..#', '#..#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.', '.#.'],
  Z: ['####', '...#', '..#.', '.#..', '#...', '####'],
  '!': ['#', '#', '#', '#', '.', '#'],
  '.': ['.', '.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '.', '#', '#'],
  "'": ['#', '#', '.', '.', '.', '.'],
  '-': ['...', '...', '###', '...', '...', '...'],
  '?': ['###.', '...#', '.##.', '.#..', '....', '.#..'],
};
/** Glyph bitmaps: { w, rows: Uint8Array(w * 6) }. A space is 2 px. */
export const LETTERS = {};
for (const [ch, rows] of Object.entries(L)) {
  const w = rows[0].length, b = new Uint8Array(w * 6);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) b[y * w + x] = r[x] === '#' ? 1 : 0; });
  LETTERS[ch] = { w, rows: b };
}
export const LH = 6;

/** Width of a string in the capitals at `scale` (1 px letter gap times scale). */
export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of str) w += ((LETTERS[ch]?.w ?? 2) + 1) * scale;
  return w - scale;
}

/**
 * Letter `str` with its top-left at (x, y): every pen pixel `scale` x
 * `scale`, colour `c`. `n` letters only (a caption typing out). An `ink`
 * colour draws a 1-px outline round each pen pixel first (the sound
 * effects). Returns the x past the end.
 */
export function letter(g, str, x, y, c, { scale = 1, n = Infinity, ink = -1, skew = 0, clip = null } = {}) {
  x = Math.round(x); y = Math.round(y);
  const buf = g.buf, W = g.width;
  const [X0, Y0, X1, Y1] = clip ?? [0, 0, g.width, g.height];
  let cnt = 0;
  const pass = (v, grow) => {
    let cx = x, i = 0;
    for (const ch of str) {
      if (i++ >= n) break;
      const gl = LETTERS[ch];
      if (gl) {
        for (let r = 0; r < LH; r++) {
          const sx = Math.round((LH - 1 - r) * scale * skew);
          for (let q = 0; q < gl.w; q++) {
            if (!gl.rows[r * gl.w + q]) continue;
            const px0 = cx + q * scale + sx - grow, py0 = y + r * scale - grow, s = scale + 2 * grow;
            for (let py = py0; py < py0 + s; py++) {
              if (py < Y0 || py >= Y1) continue;
              for (let px = px0; px < px0 + s; px++) if (px >= X0 && px < X1) { buf[py * W + px] = v; cnt++; }
            }
          }
        }
      }
      cx += ((gl?.w ?? 2) + 1) * scale;
    }
    return cx - scale;
  };
  if (ink >= 0) pass(to565(ink), 1);
  const end = pass(to565(c), 0);
  g.cost.blit += cnt;
  return end;
}
