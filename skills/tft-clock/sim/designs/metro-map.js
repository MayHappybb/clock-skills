// Metro: the map sheet (Thames, the pale rest of the network, the roundel)
// as a byte map of materials, the editions' palettes, and the map's lettering.
//
// The sheet never changes, so it is rasterised once at load into a
// 160 x 80 byte map (12.8 KB flash) and coloured per frame through a
// 16-entry table per edition, like a printed map's spot colours.

import { Gfx } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ layout

// centre-line origins of the four numerals (pixel centres at .5)
export const SLOTS = [
  [6.5, 5.5], [34.5, 5.5],        // hours, north bank
  [108.5, 35.5], [136.5, 35.5],   // minutes, south bank
];

// the Thames: Beck's flat pale band with 45 degree bends
export const RIVER = [[-4, 55], [62, 55], [92, 25], [164, 25]];

// the rest of the network, in pale tints: [material, width, points, termini]
export const NET = [
  // Jubilee (grey): down from the north edge, across the river, to a south-bank terminus
  [3, 2, [[78, -3], [78, 12], [99, 33], [99, 46]], [false, true]],
  // Hammersmith & City (pink): along the north bank, under the roundel
  [4, 2, [[60, 4], [94, 4], [104, 14], [125, 14]], [true, true]],
  // DLR (teal, a double line): east from the south bank
  [5, 3, [[60, 82], [60, 74], [70, 64], [99, 64]], [false, true]],
];
export const INTERCHANGE = [[78, 4]];             // a white ring where two pale lines meet
export const YAH = [84.5, 64];                  // the 'you are here' dot
export const ROUNDEL = [146, 10];
export const LABELS = [['BANK', 83, 7], ['WAPPING', 66, 67]];

// ------------------------------------------------------------ materials

export const M = { PAPER: 0, RIVER: 1, RIVER_LT: 2, GREY: 3, PINK: 4, TEAL: 5, TEAL_IN: 6, INK: 7, RED: 8, BLUE: 9, WHITE: 10, RING: 11 };

const enc = (k) => k << 19;    // a material as a red level the canvas keeps exactly

function buildSheet() {
  const g = new Gfx(W, H);
  g.clear(enc(M.PAPER));
  g.stroke(RIVER, 6, enc(M.RIVER));
  for (const [mat, w, pts] of NET) {
    g.stroke(pts, w, enc(mat));
    if (mat === M.TEAL) g.stroke(pts, 1, enc(M.TEAL_IN));
  }
  // termini and ticks of the pale lines
  for (const [mat, w, pts, term] of NET) {
    const ends = [];
    if (term[0]) ends.push([pts[0], pts[1]]);
    if (term[1]) ends.push([pts[pts.length - 1], pts[pts.length - 2]]);
    for (const [[x, y], [px, py]] of ends) {
      const l = Math.hypot(x - px, y - py), tx = (x - px) / l, ty = (y - py) / l;
      g.thickLine(x - ty * 3, y + tx * 3, x + ty * 3, y - tx * 3, 1.6, enc(mat));
    }
  }
  for (const [x, y] of INTERCHANGE) { g.fillCircle(x, y, 3.2, enc(M.RING)); g.fillCircle(x, y, 2.1, enc(M.WHITE)); }
  // a few station names in the map's lettering
  for (const [str, x, y] of LABELS) mapText(g, str, x, y, enc(M.INK));
  // the roundel, hard pixels: a red ring and a blue bar
  const [rx, ry] = ROUNDEL;
  g.ring(rx, ry, 4.2, 8, enc(M.RED));
  g.fillRect(rx - 11.5, ry - 2.5, 23, 5, enc(M.BLUE));
  return g;
}


// ------------------------------------------------------------ editions

// day: the printed card map. Paper a warm white, the Thames pale blue, the
// rest of the network in 25 % tints so the four lines carrying the time are
// the only saturated things; lettering in the map's dark blue.
// live: the line controllers' dark track diagram, used for the hour show and
// at night: a deep navy, the river a darker blue, tints of the lines on it,
// and every line lit (they glow a little, which is how that screen looks).
export const EDITIONS = {
  day: {
    ground: 0xf6f3ea,
    mat: [0xf6f3ea, 0xb3d9ef, 0xcde6f4, 0xc6c9cb, 0xeec0cd, 0xa6d8d5, 0xf6f3ea, 0x1b2f6e, 0xdc241f, 0x10248c, 0xffffff, 0x1b1f2a],
    closed: 0xb9bcc1,
    label: 0x1b2f6e,
    glow: 0,
  },
  live: {
    ground: 0x0c1a3d,
    mat: [0x0c1a3d, 0x16365f, 0x1d4570, 0x2d3a55, 0x46304f, 0x14474f, 0x0c1a3d, 0xc9d4ee, 0xe0362c, 0x3a5cd8, 0xe8ecf6, 0xc9d4ee],
    closed: 0x6c7a9a,
    label: 0xc9d4ee,
    glow: 1,
  },
};

// the line of each numeral: [name, day colour, live colour, train colour on day, on live]
export const LINES = [
  ['CIRCLE', 0xf6c400, 0xffd31a, 0x14286e, 0x14286e],
  ['CENTRAL', 0xe1251b, 0xff4434, 0xffffff, 0xffffff],
  ['PICCADILLY', 0x0b2a8f, 0x4672ff, 0xffffff, 0xffffff],
  ['DISTRICT', 0x00843d, 0x1fbf62, 0xffffff, 0xffffff],
  ['VICTORIA', 0x0098d8, 0x2cbcf7, 0xffffff, 0xffffff],
  ['BAKERLOO', 0xa45a22, 0xdc8a33, 0xffffff, 0xffffff],
  ['METROPOLITAN', 0x9b0058, 0xe2368f, 0xffffff, 0xffffff],
  ['OVERGROUND', 0xee7c0e, 0xff9d33, 0xffffff, 0xffffff],
  ['NORTHERN', 0x15161a, 0xe9ebf2, 0xffffff, 0x0c1a3d],
  ['ELIZABETH', 0x6950a1, 0xa58cf0, 0xffffff, 0xffffff],
];

// ------------------------------------------------------------ lettering

// The map's own caps, a 5 px sans after Johnston: round O and C, a plain I,
// narrow letters narrow. Drawn for this grid; only what the map needs.
const GL = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], ' ': ['..', '..', '..', '..', '..'],
  '&': ['.#..', '#.#.', '.#.#', '#.#.', '.#.#'], '.': ['.', '.', '.', '.', '#'],
};
const GLYPH = {};
for (const [ch, rows] of Object.entries(GL)) {
  const pts = [];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') pts.push(x, y); });
  GLYPH[ch] = { w: rows[0].length, pts };
}

export function textWidth(str) {
  let w = 0;
  for (const ch of str) w += (GLYPH[ch] ?? GLYPH[' ']).w + 1;
  return w - 1;
}

/** Map lettering, hard pixels, clipped to the canvas clip. Returns the end x. */
export function mapText(g, str, x, y, c, a = 1) {
  let cx = Math.round(x);
  const y0 = Math.round(y);
  for (const ch of str) {
    const gl = GLYPH[ch] ?? GLYPH[' '];
    const p = gl.pts;
    for (let i = 0; i < p.length; i += 2) g.pixel(cx + p[i], y0 + p[i + 1], c, { a });
    cx += gl.w + 1;
  }
  return cx - 1;
}

// ------------------------------------------------------------ the sheet, once

const SHEET = buildSheet();
export const MAT = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) MAT[i] = SHEET.buf[i] >> 11;
