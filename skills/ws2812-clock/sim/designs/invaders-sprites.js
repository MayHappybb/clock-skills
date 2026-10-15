// Invaders: sprites, the alien-formation numerals and a sub-pixel blitter.
//
// Every numeral is a formation: aliens on a half-step lattice (x in steps of
// 3 px, rows 6 px apart), so bowls round off and diagonals slant instead of
// being a block font. Seven half-steps wide (23 px), six rows (35 px).
// Rows 0-1 are squids, 2-3 crabs, 4-5 octopuses, as in the arcade.

const NUM = {
  0: ['.#.#.#.', '#.....#', '#.....#', '#.....#', '#.....#', '.#.#.#.'],
  1: ['...#...', '.#.#...', '...#...', '...#...', '...#...', '.#.#.#.'],
  2: ['.#.#.#.', '#.....#', '.....#.', '...#...', '.#.....', '#.#.#.#'],
  3: ['.#.#.#.', '......#', '...#.#.', '......#', '#.....#', '.#.#.#.'],
  4: ['....#..', '..#.#..', '#...#..', '#.#.#.#', '....#..', '....#..'],
  5: ['#.#.#.#', '#......', '#.#.#..', '......#', '......#', '#.#.#..'],
  6: ['...#.#.', '.#.....', '#.#.#..', '#.....#', '#.....#', '.#.#.#.'],
  7: ['#.#.#.#', '......#', '.....#.', '....#..', '...#...', '..#....'],
  8: ['.#.#.#.', '#.....#', '.#.#.#.', '#.....#', '#.....#', '.#.#.#.'],
  9: ['.#.#.#.', '#.....#', '#.....#', '..#.#.#', '......#', '.#.#.#.'],
};
export const DIGIT_W = 23, ROW_PITCH = 6, HALF = 3;
/** Aliens of numeral d: [{hx, row}], hx in half-steps. Bottom rows first. */
export const DIGITS = {};
for (const d in NUM) {
  const list = [];
  NUM[d].forEach((r, row) => { for (let hx = 0; hx < r.length; hx++) if (r[hx] === '#') list.push({ hx, row }); });
  list.sort((a, b) => b.row - a.row || a.hx - b.hx);
  DIGITS[d] = list;
}

/** Parse rows of characters into { w, h, px: Uint8Array of palette codes (0 = none) }. */
export function sprite(rows, codes = { '#': 1 }) {
  const h = rows.length, w = rows[0].length, px = new Uint8Array(w * h);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) px[y * w + x] = codes[r[x]] ?? 0; });
  return { w, h, px };
}

// 5x5 aliens, two marching frames each
export const SQUID = [
  sprite(['..#..', '.###.', '#.#.#', '.###.', '#.#.#']),
  sprite(['..#..', '.###.', '#.#.#', '.###.', '.#.#.']),
];
export const CRAB = [
  sprite(['.#.#.', '.###.', '#.#.#', '#####', '#...#']),
  sprite(['#...#', '.###.', '#.#.#', '#####', '.#.#.']),
];
export const OCTO = [
  sprite(['.###.', '#####', '#.#.#', '#####', '.#.#.']),
  sprite(['.###.', '#####', '#.#.#', '#####', '#...#']),
];
export const BURST = sprite(['#...#', '.#.#.', '##.##', '.#.#.', '#...#']);

export const UFO = [
  sprite(['...#####...', '.#########.', '##1##1##1##', '..##...##..'], { '#': 1, 1: 2 }),
  sprite(['...#####...', '.#########.', '#1##1##1##1', '..##...##..'], { '#': 1, 1: 2 }),
];

// The mothership: 33 x 10, a hull, a dome with an eye, a ring of lights.
export const MOTHER = sprite([
  '.............ddddddd.............',
  '...........ddwwwwwwwdd...........',
  '..........dwwwwkkkwwwwd..........',
  '.....hhhhhhhhhhhhhhhhhhhhhhh.....',
  '..hhhhhhhhhhhhhhhhhhhhhhhhhhhhh..',
  'hhllhhhllhhhllhhhllhhhllhhhllhhhh',
  'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
  '..ss..sssssssssssssssssssss..ss..',
  '...s...s.................s...s...',
  '..ss..ss.................ss..ss..',
], { d: 1, w: 2, k: 0, h: 3, l: 4, s: 5 });

// Alien bombs, 3x5, four frames each
export const SQUIGGLE = [
  sprite(['.#.', '#..', '.#.', '..#', '.#.']),
  sprite(['#..', '.#.', '..#', '.#.', '#..']),
  sprite(['.#.', '..#', '.#.', '#..', '.#.']),
  sprite(['..#', '.#.', '#..', '.#.', '..#']),
];
export const PLUNGER = [
  sprite(['.#.', '.#.', '.#.', '###', '.#.']),
  sprite(['.#.', '###', '.#.', '.#.', '.#.']),
  sprite(['.#.', '.#.', '###', '.#.', '.#.']),
  sprite(['###', '.#.', '.#.', '.#.', '.#.']),
];

// The owner's frog, rainbow bands, round white-rimmed glasses, in a tank.
// 17 x 16. Codes: W rim, e lens, k pupil (dark), m mouth (dark),
// r o y g b v bands, T hull, L tread (animated), U turret
export const FROG_W = 19, FROG_H = 16;
export const FROG_ROWS = [
  '..WWWW.......WWWW..',
  '.WeeeeW.....WeeeeW.',
  '.WekkeWWWWWWWekkeW.',
  'rWekkeWrrrrrWekkeWr',
  'rWeeeeWrrrrrWeeeeWr',
  'rrWWWWrrrrrrrWWWWrr',
  'ooooooooooooooooooo',
  'ooomooooooooooomooo',
  'yyyymmmmmmmmmmmyyyy',
  'yyyyyyyyyyyyyyyyyyy',
  'ggggggggggggggggggg',
  '.bbbbbbbbbbbbbbbbb.',
  '..vvvvvvvvvvvvvvv..',
  '.TTTTTTTTTTTTTTTTT.',
];

export const SHIELD = sprite([
  '..##########..',
  '.############.',
  '##############',
  '##############',
  '####......####',
  '###........###',
]);

/**
 * Add sprite s at (x, y) — fractional allowed, drawn with bilinear coverage —
 * into the float image img (W x H x 3), colours from pal[code], times a.
 */
export function blit(img, W, H, s, x, y, pal, a = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const w00 = (1 - fx) * (1 - fy) * a, w10 = fx * (1 - fy) * a, w01 = (1 - fx) * fy * a, w11 = fx * fy * a;
  const sw = s.w, sh = s.h, px = s.px;
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const c = px[j * sw + i];
      if (!c) continue;
      const col = pal[c];
      if (!col) continue;
      const X = x0 + i, Y = y0 + j;
      if (w00 > 0) put(img, W, H, X, Y, col, w00);
      if (w10 > 0) put(img, W, H, X + 1, Y, col, w10);
      if (w01 > 0) put(img, W, H, X, Y + 1, col, w01);
      if (w11 > 0) put(img, W, H, X + 1, Y + 1, col, w11);
    }
  }
}
export function put(img, W, H, X, Y, col, k) {
  if (X < 0 || Y < 0 || X >= W || Y >= H) return;
  const p = 3 * (Y * W + X);
  img[p] += col[0] * k; img[p + 1] += col[1] * k; img[p + 2] += col[2] * k;
}
/** A soft dot of radius ~1 at fractional (x, y). */
export function dot(img, W, H, x, y, col, a = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  put(img, W, H, x0, y0, col, (1 - fx) * (1 - fy) * a);
  put(img, W, H, x0 + 1, y0, col, fx * (1 - fy) * a);
  put(img, W, H, x0, y0 + 1, col, (1 - fx) * fy * a);
  put(img, W, H, x0 + 1, y0 + 1, col, fx * fy * a);
}
