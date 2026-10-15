// Roguelike: the character generator. Every pixel on the glass is one of
// these 4 x 6 cells, as in a text mode with a custom font loaded into the
// character RAM: a tiny CP437 (letters, the dungeon symbols, box drawing,
// the shade blocks ░ ▒ ▓ █) plus a few animation frames for the torch.
//
// A glyph is six row masks of four bits (bit 3 = the leftmost pixel), one
// foreground colour on one background colour: text mode allows nothing else.
// Flash: ~140 glyphs x 6 bytes, under 1 KB.

const RAW = {
  // ---- capitals, 3 x 5 on the top rows
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###', F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/###/.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/.#./.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '###/..#/.#./#../###',
  // ---- lower case: x-height 3, ascenders on row 0, descenders on row 5
  a: '.../.../.##/#.#/.##', b: '#../#../##./#.#/##.', c: '.../.../.##/#../.##', d: '..#/..#/.##/#.#/.##',
  e: '.../.../.#./###/.##', f: '.##/.#./###/.#./.#.', g: '.../.../.##/#.#/.##/##.', h: '#../#../##./#.#/#.#',
  i: '.#./.../##./.#./###', j: '..#/.../..#/..#/#.#/.#.', k: '#../#../#.#/##./#.#', l: '##./.#./.#./.#./###',
  m: '.../.../##./###/#.#', n: '.../.../##./#.#/#.#', o: '.../.../.#./#.#/.#.', p: '.../.../##./#.#/##./#..',
  q: '.../.../.##/#.#/.##/..#', r: '.../.../.##/#../#..', s: '.../.../.##/.#./##.', t: '.#./.#./###/.#./.##',
  u: '.../.../#.#/#.#/.##', v: '.../.../#.#/#.#/.#.', w: '.../.../#.#/###/###', x: '.../.../#.#/.#./#.#',
  y: '.../.../#.#/#.#/.##/##.', z: '.../.../##./.#./.##',
  // ---- punctuation for the message line
  ' ': '', '.': '.../.../.../.../.#.', ',': '.../.../.../.#./#..', '!': '.#./.#./.#./.../.#.',
  '?': '##./..#/.#./.../.#.', "'": '.#./.#.', '-': '.../.../###', ':': '.../.#./.../.#.',
  // ---- the dungeon's symbols
  '$': '.#./##./.#./.##/.#.', ')': '#../.#./.#./.#./#..', '(': '..#/.#./.#./.#./..#', '[': '##./#../#../#../##.',
  '%': '#.#/..#/.#./#../#.#', '=': '.../###/.../###', '"': '#.#/#.#', '*': '.../#.#/.#./#.#',
  '+': '.../.#./###/.#.', '<': '..#/.#./#../.#./..#', '>': '#../.#./..#/.#./#..', '{': '.##/.#./##./.#./.##',
  '^': '.../.#./#.#', '_': '.../.../.../.../###', '#': '#.#/###/#.#/###/#.#', '&': '.#./#.#/.#./#.#/.##',
  '/': '..#/..#/.#./#../#..', '\\': '#../#../.#./..#/..#',
  '@': '.##./#.##/#.##/#.../.##.', '~': '.../.../.#.#/#.#.', '|': '.#./.#./.#./.#./.#.',
};

/** Glyph rows by code. Characters are their own codes; specials sit at 128+. */
export const GLYPH = new Map();
for (const [ch, pic] of Object.entries(RAW)) {
  const rows = pic ? pic.split('/') : [];
  const g = new Uint8Array(6);
  rows.forEach((r, y) => { for (let x = 0; x < 4; x++) if (r[x] === '#') g[y] |= 8 >> x; });
  GLYPH.set(ch.charCodeAt(0), g);
}
const put = (code, rows) => { GLYPH.set(code, Uint8Array.from(rows)); return code; };

// ---- shades and blocks (CP437 176-178, 219), at the 4 x 6 pitch
export const SHADE1 = put(176, [0b1010, 0, 0b0101, 0, 0b1010, 0]);
export const SHADE2 = put(177, [0b1010, 0b0101, 0b1010, 0b0101, 0b1010, 0b0101]);
export const SHADE3 = put(178, [0b1111, 0b0101, 0b1111, 0b1010, 0b1111, 0b0101]);
export const BLOCK = put(219, [15, 15, 15, 15, 15, 15]);
export const SHADES = [32, SHADE1, SHADE2, SHADE3, BLOCK];

// ---- the floor: one dim dot low in the cell, as NetHack's '.'
export const FLOOR = put(250, [0, 0, 0, 0b0100, 0, 0]);

// ---- box drawing: a 2 px line through the cell centre, joined N E S W
// (CP437 has all sixteen; here they are generated from the four arms)
export const WALL0 = 160;
for (let m = 0; m < 16; m++) {
  const g = [0, 0, 0, 0, 0, 0];
  g[2] |= 0b0110; g[3] |= 0b0110;                    // the centre block
  if (m & 1) { g[0] |= 0b0110; g[1] |= 0b0110; }     // N
  if (m & 2) { g[2] |= 0b0001; g[3] |= 0b0001; }     // E
  if (m & 4) { g[4] |= 0b0110; g[5] |= 0b0110; }     // S
  if (m & 8) { g[2] |= 0b1000; g[3] |= 0b1000; }     // W
  put(WALL0 + m, g);
}

// the same sixteen joins as a 1 px line: walls the light does not reach
export const WALLT0 = 224;
for (let m = 0; m < 16; m++) {
  const g = [0, 0, 0, 0, 0, 0];
  g[3] |= 0b0100;
  if (m & 1) { g[0] |= 0b0100; g[1] |= 0b0100; g[2] |= 0b0100; }
  if (m & 2) { g[3] |= 0b0011; }
  if (m & 4) { g[4] |= 0b0100; g[5] |= 0b0100; }
  if (m & 8) { g[3] |= 0b1000; }
  put(WALLT0 + m, g);
}

// and as CP437's double lines (rails at x 0 and 3, y 1 and 4): stonework in the light
export const WALLD0 = 240;
for (let m = 0; m < 16; m++) {
  const g = [0, 0, 0, 0, 0, 0];
  const on = (x, y) => { g[y] |= 8 >> x; };
  if (!(m & 1)) for (let x = 0; x < 4; x++) on(x, 1);
  if (!(m & 4)) for (let x = 0; x < 4; x++) on(x, 4);
  if (!(m & 8)) for (let y = 1; y <= 4; y++) on(0, y);
  if (!(m & 2)) for (let y = 1; y <= 4; y++) on(3, y);
  if (m & 1) { on(0, 0); on(3, 0); on(0, 1); on(3, 1); }
  if (m & 4) { on(0, 5); on(3, 5); on(0, 4); on(3, 4); }
  if (m & 8) { on(0, 1); on(0, 4); }
  if (m & 2) { on(3, 1); on(3, 4); }
  put(WALLD0 + m, g);
}

// ---- the torch: a flame in four frames (the cell flickers between them)
export const FLAME0 = 200;
[
  [0b0100, 0b0100, 0b0110, 0b1110, 0b0110, 0b0100],
  [0b0000, 0b0010, 0b0110, 0b0111, 0b0110, 0b0100],
  [0b0100, 0b0110, 0b0110, 0b1111, 0b0110, 0b0100],
  [0b0000, 0b0100, 0b1100, 0b1110, 0b0110, 0b0100],
].forEach((r, k) => put(FLAME0 + k, r));

// ---- the dragon (the hour): head, scaled body, wing, tail, in block art
export const SCALE = put(210, [0b0110, 0b1111, 0b1001, 0b0110, 0b1111, 0b1001]);
export const BURN0 = 212;    // fire in a cell: three licking frames
[
  [0b0100, 0b0101, 0b1101, 0b1111, 0b1111, 0b0110],
  [0b0010, 0b1010, 0b1011, 0b1111, 0b1111, 0b0110],
  [0b1000, 0b1001, 0b1101, 0b1111, 0b0111, 0b1110],
].forEach((r, k) => put(BURN0 + k, r));

export const code = (ch) => ch.charCodeAt(0);
