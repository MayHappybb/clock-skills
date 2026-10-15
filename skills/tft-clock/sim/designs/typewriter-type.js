// Typewriter: the type. One pixel-designed monospaced face for the whole
// sheet: each glyph 4 x 6 on a 5 x 7 pitch (the slug), so the last column
// and row are the space a real machine leaves between strikes. A bold
// strike is the same slug struck twice, one pixel apart, which fills that
// column. Capitals only for the log (a telegram / ship's-log hand), plus the
// lower-case letters the typewriter artist needs (d b o x) and the punctuation
// of typed ornament.
//
// Then the figures: each numeral of the time is typewriter art, 6 slugs wide
// and 7 lines tall, built the way the 1960s typists built them: bold '8's for
// the strokes, d b Y P at the corners so the curves turn, struck on the grid.
//
// All of it is flash: 60 glyphs x 6 bytes, 10 figures x 42 bytes.

const G = {
  A: '.##. #..# #..# #### #..# #..#',
  B: '###. #..# ###. #..# #..# ###.',
  C: '.### #... #... #... #... .###',
  D: '###. #..# #..# #..# #..# ###.',
  E: '#### #... ###. #... #... ####',
  F: '#### #... ###. #... #... #...',
  G: '.### #... #... #.## #..# .###',
  H: '#..# #..# #### #..# #..# #..#',
  I: '###. .#.. .#.. .#.. .#.. ###.',
  J: '..## ...# ...# ...# #..# .##.',
  K: '#..# #.#. ##.. #.#. #..# #..#',
  L: '#... #... #... #... #... ####',
  M: '#..# #### #### #..# #..# #..#',
  N: '#..# ##.# ##.# #.## #.## #..#',
  O: '.##. #..# #..# #..# #..# .##.',
  P: '###. #..# #..# ###. #... #...',
  Q: '.##. #..# #..# #..# #.#. .#.#',
  R: '###. #..# #..# ###. #.#. #..#',
  S: '.### #... .##. ...# ...# ###.',
  T: '###. .#.. .#.. .#.. .#.. .#..',
  U: '#..# #..# #..# #..# #..# .##.',
  V: '#.#. #.#. #.#. #.#. #.#. .#..',
  W: '#..# #..# #..# #### #### #..#',
  X: '#..# #..# .##. .##. #..# #..#',
  Y: '#.#. #.#. .#.. .#.. .#.. .#..',
  Z: '#### ...# ..#. .#.. #... ####',
  0: '.##. #..# #.## ##.# #..# .##.',
  1: '.#.. ##.. .#.. .#.. .#.. ###.',
  2: '.##. #..# ..#. .#.. #... ####',
  3: '###. ...# .##. ...# ...# ###.',
  4: '..#. .##. #.#. #### ..#. ..#.',
  5: '#### #... ###. ...# ...# ###.',
  6: '.##. #... ###. #..# #..# .##.',
  7: '#### ...# ..#. .#.. .#.. .#..',
  8: '.##. #..# .##. #..# #..# .##.',
  9: '.##. #..# #..# .### ...# .##.',
  '.': '.... .... .... .... .... .#..',
  ',': '.... .... .... .... .#.. #...',
  ':': '.... .#.. .... .... .#.. ....',
  "'": '.#.. .#.. .... .... .... ....',
  '"': '#.#. #.#. .... .... .... ....',
  '-': '.... .... .... ###. .... ....',
  '=': '.... .... #### .... #### ....',
  '*': '.... .#.. ###. .#.. #.#. ....',
  '+': '.... .#.. ###. .#.. .... ....',
  '~': '.... .... .#.# #.#. .... ....',
  '/': '...# ...# ..#. .#.. #... #...',
  '\\': '#... #... .#.. ..#. ...# ...#',
  '(': '..#. .#.. .#.. .#.. .#.. ..#.',
  ')': '.#.. ..#. ..#. ..#. ..#. .#..',
  '<': '.... ..#. .#.. #... .#.. ..#.',
  '>': '.... #... .#.. ..#. .#.. #...',
  '#': '#.#. #### #.#. #.#. #### #.#.',
  '@': '.##. #..# #.## #.## #... .###',
  '&': '.#.. #.#. .#.. #.## #..# .###',
  '!': '.#.. .#.. .#.. .#.. .... .#..',
  '?': '.##. #..# ..#. .#.. .... .#..',
  '|': '.#.. .#.. .#.. .#.. .#.. .#..',
  '_': '.... .... .... .... .... ####',
  o: '.... .... .##. #..# #..# .##.',
  x: '.... .... #..# .##. .##. #..#',
  d: '...# ...# .### #..# #..# .###',
  b: '#... #... ###. #..# #..# ###.',
  // the art slugs: the '8' and the corner turns of the figures
  '%8': '.##. #..# .##. #..# #..# .##.',
  '%P': '###. #..# #..# ###. #... #...',
  '%Y': '#..# #..# .##. ..#. ..#. ..#.',
};

/** Glyph rows: 6 bytes, bit 3 = left column. Index by char code; 0 = unknown. */
export const GLYPH = new Map();
for (const [k, v] of Object.entries(G)) {
  const rows = v.split(' ').map((r) => [...r].reduce((a, c, i) => a | (c === '#' ? 8 >> i : 0), 0));
  GLYPH.set(k, Uint8Array.from(rows));
}
export const glyph = (ch) => GLYPH.get(ch) ?? GLYPH.get('?');

// The figures, 6 slugs x 7 lines. In these maps '8' is a bold-struck 8,
// d b are the letters, Y P the art slugs above, '.' a full stop, ' ' blank.
const F = {
  0: [' d88b ', 'd8  8b', '88  88', '88  88', '88  88', 'Y8  8P', ' Y88P '],
  1: [' d888 ', '   88 ', '   88 ', '   88 ', '   88 ', '   88 ', '  8888'],
  2: [' d88b ', 'd8  8b', '    8P', '  d8P ', ' d8P  ', 'd8P   ', '888888'],
  3: [' d88b ', 'd8  8b', '    8P', '  888 ', '    8b', 'Y8  8P', ' Y88P '],
  4: ['   88 ', '  d88 ', ' d888 ', 'd8 88 ', '888888', '   88 ', '   88 '],
  5: ['888888', '88    ', '8888b ', '    Y8', '    88', 'Y8  8P', ' Y88P '],
  6: [' d88b ', 'd8  YP', '88    ', '8888b ', '88  88', 'Y8  8P', ' Y88P '],
  7: ['888888', '    8P', '   d8 ', '  d8  ', '  88  ', '  88  ', '  88  '],
  8: [' d88b ', 'd8  8b', 'Y8  8P', ' d88b ', 'd8  8b', 'Y8  8P', ' Y88P '],
  9: [' d88b ', 'd8  8b', '88  88', ' Y8888', '    88', 'db  8P', ' Y88P '],
};

/**
 * FIG[d] = 42 slugs, row-major (6 x 7): 0 blank, else a code into SLUG.
 * SLUG[code] = [glyph rows, bold].
 */
export const FIG_W = 6, FIG_H = 7;
const SLUG_KEYS = { 8: ['%8', 1], d: ['d', 1], b: ['b', 1], Y: ['%Y', 1], P: ['%P', 1], '.': ['.', 0] };
export const SLUG = [null];
const slugCode = {};
for (const [k, [gk, bold]] of Object.entries(SLUG_KEYS)) { slugCode[k] = SLUG.length; SLUG.push({ rows: GLYPH.get(gk), bold }); }
export const FIG = [];
for (let d = 0; d < 10; d++) {
  const a = new Uint8Array(FIG_W * FIG_H);
  F[d].forEach((row, r) => [...row].forEach((c, i) => { a[r * FIG_W + i] = c === ' ' ? 0 : slugCode[c]; }));
  FIG.push(a);
}
