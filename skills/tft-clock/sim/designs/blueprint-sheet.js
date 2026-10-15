// Blueprint: the sheet. Materials (what a pixel is) rather than colours, so
// one integer pass can print the same drawing as a washed cyanotype, as an
// exposed but unwashed print, or as blank sensitised paper (the hour show).
// Also the draughtsman's lettering: single-stroke capitals 3 x 5 with a
// slightly open, hand-ruled look (an open 4, flat-topped 3 and 7, a G with a
// spur), drawn for this panel.

import { hash, R, G, B, to565 } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ materials
export const M_G0 = 0, M_G1 = 1, M_G2 = 2, M_DOT = 3, M_LINE = 4, M_HATCH = 5, M_THIN = 6, M_TEXT = 7, M_RUB = 8, M_WALL = 9, M_FAINT = 10, M_RUB1 = 11, M_F2 = 12;
export const NMAT = 13;
// how much "line" each material is: 0 bare paper, 1 a full white line (negative: darker paper)
export const INK = [0, 0.07, -0.06, 0.16, 1, 0.62, 0.5, 0.78, 0.075, 0.13, 0.3, 0.13, 0.17];

// ------------------------------------------------------------ palettes
// Washed print: Prussian blue paper with chalk-white lines. Exposed, before
// the wash: dull grey-blue with the drawing still the yellow-green of the
// unexposed iron salts. Blank: sensitised paper, yellow-green, no image.
export const PRINT = { ground: 0x1b4888, line: 0xeef4ff };
export const EXPOSED = { ground: 0x4c5a74, line: 0xcfcb7e };
export const BLANK = { ground: 0xd3cf86, line: 0xd3cf86 };

const ch = (c, k) => [R(c), G(c), B(c)][k];
/** RGB triplets for every material, for a print state, optionally lerped towards another state. */
export function palette(a, b = a, u = 0) {
  const out = new Int16Array(NMAT * 3);
  for (let m = 0; m < NMAT; m++)
    for (let k = 0; k < 3; k++) {
      const ga = ch(a.ground, k) + (ch(a.line, k) - ch(a.ground, k)) * INK[m];
      const gb = ch(b.ground, k) + (ch(b.line, k) - ch(b.ground, k)) * INK[m];
      let v = ga + (gb - ga) * u;
      out[m * 3 + k] = Math.max(0, Math.min(255, Math.round(v)));
    }
  return out;
}
/** RGB triplets -> RGB565 table. */
export function to565Table(p) {
  const t = new Uint16Array(NMAT);
  for (let m = 0; m < NMAT; m++) t[m] = to565((p[m * 3] << 16) | (p[m * 3 + 1] << 8) | p[m * 3 + 2]);
  return t;
}
// blank paper shows its grain a little (darker/lighter flecks): RGB triplets like palette()
export function blankRGB() {
  const out = new Int16Array(NMAT * 3), g = BLANK.ground;
  for (let m = 0; m < NMAT; m++) {
    const d = m === M_G1 ? 14 : m === M_G2 ? -18 : 0;
    out[m * 3] = Math.max(0, Math.min(255, R(g) + d)); out[m * 3 + 1] = Math.max(0, Math.min(255, G(g) + d)); out[m * 3 + 2] = Math.max(0, Math.min(255, B(g) + d - 4));
  }
  return out;
}
/** Two RGB palettes mixed, as an RGB565 table. */
export function mixTable(a, b, u) {
  const t = new Uint16Array(NMAT);
  for (let m = 0; m < NMAT; m++) {
    const k = m * 3, r = a[k] + (b[k] - a[k]) * u, gg = a[k + 1] + (b[k + 1] - a[k + 1]) * u, bb = a[k + 2] + (b[k + 2] - a[k + 2]) * u;
    t[m] = to565(((r + 0.5) << 16) | ((gg + 0.5) << 8) | (bb + 0.5));
  }
  return t;
}

// ------------------------------------------------------------ lettering
const GLY = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '#.#', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#.', '##.', '.#.', '.#.', '.#.'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['###', '..#', '.#.', '..#', '##.'], 4: ['#..', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.#.', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '#..'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '.#.'], '.': ['...', '...', '...', '...', '.#.'], '-': ['...', '...', '###', '...', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], "'": ['.#.', '.#.', '...', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};
/** Letter a string into a material map; returns the x after it. */
export function letter(map, mw, str, x, y, mat, gap = 1) {
  for (const c of str) {
    const g = GLY[c] ?? GLY[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') {
      const px = x + i, py = y + j;
      if (px >= 0 && py >= 0 && px < mw && py < map.length / mw) map[py * mw + px] = mat;
    }
    x += 3 + gap;
  }
  return x - gap;
}
export const textW = (s, gap = 1) => s.length * (3 + gap) - gap;
/** The glyph rows, for drawing lettering as moving overlays. */
export const glyph = (c) => GLY[c] ?? GLY[' '];

// ------------------------------------------------------------ the static sheet
const BORDER = [2, 2, 156, 76];      // x, y, w, h of the drawing frame
export const TB = [101, 63, 55, 13];   // the title block in the frame's corner: two rows of lettering

function grain() {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // chalky paper: sparse light flecks, a few short dark fibres
      const h = hash(x, y, 77) & 1023, f = hash(x >> 1, y, 91) & 255;
      m[y * W + x] = h < 46 ? M_G1 : (f < 7 && (x & 1)) || h > 1006 ? M_G2 : M_G0;
    }
  return m;
}
export const GRAIN = grain();

const rectM = (m, x, y, w, h, mat) => {
  for (let i = x; i < x + w; i++) { m[y * W + i] = mat; m[(y + h - 1) * W + i] = mat; }
  for (let j = y; j < y + h; j++) { m[j * W + x] = mat; m[j * W + x + w - 1] = mat; }
};
const hl = (m, x, y, w, mat) => { for (let i = x; i < x + w; i++) m[y * W + i] = mat; };
const vl = (m, x, y, h, mat) => { for (let j = y; j < y + h; j++) m[j * W + x] = mat; };

/**
 * The sheet for one hour: paper grain, a dot grid, the frame, view titles
 * and the title block with its revision letter (one per hour: A..Z without I
 * and O is exactly 24) and the date.
 */
export function buildSheet(revLetter, dateStr) {
  const m = GRAIN.slice();
  for (let y = 6; y < H - 4; y += 6) for (let x = 6; x < W - 4; x += 6) if (m[y * W + x] !== M_G2) m[y * W + x] = M_DOT;
  rectM(m, BORDER[0], BORDER[1], BORDER[2], BORDER[3], M_LINE);
  // the trim marks outside the frame
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) m[y * W + x] = M_THIN;
  // title block
  const [tx, ty, tw, th] = TB;
  for (let j = ty; j < ty + th; j++) for (let i = tx; i < tx + tw; i++) m[j * W + i] = GRAIN[j * W + i] === M_G1 ? M_G1 : M_G0;
  rectM(m, tx, ty, tw, th, M_LINE);
  hl(m, tx, ty + 6, tw, M_THIN);
  vl(m, tx + 31, ty + 6, th - 6, M_THIN);
  letter(m, W, 'TIME HOUSE', tx + 2, ty + 1, M_TEXT);
  letter(m, W, dateStr, tx + 2, ty + 7, M_THIN);
  const e = letter(m, W, 'REV', tx + 34, ty + 7, M_THIN);
  letter(m, W, revLetter, e + 3, ty + 7, M_TEXT);
  // view titles: a bubble with the view number, the title, an underline
  viewTitle(m, 7, 71, '1', 'GROUND FLOOR');
  viewTitle(m, 88, 57, '2', 'FIRST FLOOR');
  // north point
  north(m, 149, 47);
  return m;
}

function viewTitle(m, x, y, num, title) {
  // bubble: a 7x7 ring
  const ring = ['.###.', '#...#', '#...#', '#...#', '.###.'];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (ring[j][i] === '#') m[(y + j) * W + x + i] = M_THIN;
  letter(m, W, num, x + 1, y, M_TEXT);
  const e = letter(m, W, title, x + 7, y, M_TEXT);
  hl(m, x + 7, y + 6, e - x - 7, M_THIN);
}

function north(m, cx, cy) {
  const pic = [
    '...#...',
    '..###..',
    '.#.#.#.',
    '#..#..#',
    '#..#..#',
    '#.....#',
    '.#...#.',
    '..###..',
  ];
  for (let j = 0; j < pic.length; j++) for (let i = 0; i < 7; i++) if (pic[j][i] === '#') m[(cy - 4 + j) * W + cx - 3 + i] = M_THIN;
  letter(m, W, 'N', cx - 1, cy - 11, M_TEXT);
}

export const REVS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
