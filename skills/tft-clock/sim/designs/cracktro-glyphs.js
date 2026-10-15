// Cracktro type: the logo numerals and the 8x8 scroller font.
//
// The numerals are drawn on an 8 x 12 grid of cells, each cell full ('#'),
// empty ('.') or a 45-degree half (the four wedges below), so every edge is
// either square or a clean 45-degree stair: the angular cut of a 1980s demo
// group's logo. Stroke two cells; outer corners cut two cells deep, counters
// cut one. Rasterised at load at two sizes (hours 4 px a cell, minutes 3),
// into style maps: 0 outside, 1 moat (four pixels of forced ground round
// the stroke), 5 counter (ground inside the row span), 2 rim (the stroke's
// outer pixel), 3 inline (the 1-px cut line just inside it), 4 body. The face lights each class its own way.

// Wedges: A = filled bottom-right, B = bottom-left, C = top-left, D = top-right.
const DIGITS = [
  [ // 0
    '.A####B.',
    'A######B',
    '##C..D##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##....##',
    '##B..A##',
    'D######C',
    '.D####C.'],
  [ // 1
    '...A##..',
    '..A###..',
    '.A####..',
    '.##C##..',
    '.#C.##..',
    '.C..##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..',
    '....##..'],
  [ // 2
    '.A####B.',
    'A######B',
    '##C..D##',
    '##....##',
    '.....A##',
    '....A##C',
    '...A##C.',
    '..A##C..',
    '.A##C...',
    'A##C....',
    '########',
    '########'],
  [ // 3
    '.A####B.',
    'A######B',
    '##C..D##',
    '......##',
    '......##',
    '..#####C',
    '..#####B',
    '......##',
    '......##',
    '##B..A##',
    'D######C',
    '.D####C.'],
  [ // 4
    '##...##.',
    '##...##.',
    '##...##.',
    '##...##.',
    '##...##.',
    '##...##.',
    '########',
    'D#######',
    '.....##.',
    '.....##.',
    '.....##.',
    '.....##.'],
  [ // 5
    '########',
    '########',
    '##......',
    '##......',
    '##......',
    '######B.',
    '#######B',
    '.....D##',
    '......##',
    '##B..A##',
    'D######C',
    '.D####C.'],
  [ // 6
    '.A####B.',
    'A######B',
    '##C..D##',
    '##......',
    '##......',
    '######B.',
    '#######B',
    '##C..D##',
    '##....##',
    '##B..A##',
    'D######C',
    '.D####C.'],
  [ // 7
    '########',
    '########',
    '.....A##',
    '....A##C',
    '...A##C.',
    '..A##C..',
    '..##C...',
    '..##....',
    '..##....',
    '..##....',
    '..##....',
    '..##....'],
  [ // 8
    '.A####B.',
    'A######B',
    '##C..D##',
    '##....##',
    '##B..A##',
    'D######C',
    'A######B',
    '##C..D##',
    '##....##',
    '##B..A##',
    'D######C',
    '.D####C.'],
  [ // 9
    '.A####B.',
    'A######B',
    '##C..D##',
    '##....##',
    '##B..A##',
    'D#######',
    '.D######',
    '......##',
    '......##',
    '##B..A##',
    'D######C',
    '.D####C.'],
];

export const GRID_W = 8, GRID_H = 12, MOAT = 4;

function cellPixel(ch, u, v, s) {
  switch (ch) {
    case '#': return 1;
    case 'A': return u + v >= s - 1 ? 1 : 0;
    case 'B': return v >= u ? 1 : 0;
    case 'C': return u + v <= s - 1 ? 1 : 0;
    case 'D': return u >= v ? 1 : 0;
    default: return 0;
  }
}

/**
 * One numeral at cell size s: { w, h, map } where map is (w + 2*MOAT) x
 * (h + 2*MOAT) bytes of style classes, plus its ink pixels as two lists
 * (for the dot flights): `rand` in a hashed order (an even thinning when
 * taken in order), `edge` rim and inline first, then the body, each part
 * hashed (a dotted outline first when taken in order).
 */
function buildDigit(d, s) {
  const w = GRID_W * s, h = GRID_H * s, bw = w + 2 * MOAT, bh = h + 2 * MOAT;
  const ink = new Uint8Array(bw * bh);
  const rows = DIGITS[d];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (x / s) | 0, cy = (y / s) | 0;
    ink[(y + MOAT) * bw + x + MOAT] = cellPixel(rows[cy][cx], x - cx * s, y - cy * s, s);
  }
  // classes: the rim (ink touching the outside), the inline cut (ink touching
  // the rim, a 1-px line just inside it), the body; outside, the moat
  const map = new Uint8Array(bw * bh);
  const at = (x, y) => (x < 0 || y < 0 || x >= bw || y >= bh ? 0 : ink[y * bw + x]);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x;
    if (ink[i]) map[i] = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) ? 2 : 4;
    else {
      let near = false;
      for (let dy = -MOAT; dy <= MOAT && !near; dy++) for (let dx = -MOAT; dx <= MOAT; dx++) {
        if (dx * dx + dy * dy <= MOAT * MOAT + 1 && at(x + dx, y + dy)) { near = true; break; }
      }
      map[i] = near ? 1 : 0;
    }
  }
  const isRim = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && map[y * bw + x] === 2;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x;
    if (map[i] === 4 && (isRim(x - 1, y) || isRim(x + 1, y) || isRim(x, y - 1) || isRim(x, y + 1))) map[i] = 3;
  }
  // counters: ground between the first and last ink of each row (class 5), so
  // nothing of the background shows inside a numeral
  for (let y = 0; y < bh; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < bw; x++) if (ink[y * bw + x]) { if (x0 < 0) x0 = x; x1 = x; }
    for (let x = x0 + 1; x > 0 && x < x1; x++) if (map[y * bw + x] < 2) map[y * bw + x] = 5;
  }
  // dot lists: packed as (y << 8) | x in box coordinates
  const all = [];
  for (let i = 0; i < bw * bh; i++) if (map[i] >= 2) all.push(i);
  const key = (i, salt) => hashInt(i * 7919 + d * 104729 + s * 31 + salt);
  const pack = (i) => (((i / bw) | 0) << 8) | (i % bw);
  const rand = all.slice().sort((a, b) => key(a, 1) - key(b, 1)).map(pack);
  const edge = all.slice().sort((a, b) => {
    const ea = map[a] === 2 ? 0 : 1, eb = map[b] === 2 ? 0 : 1;
    return ea - eb || key(a, 2) - key(b, 2);
  }).map(pack);
  return { w, h, bw, bh, map, rand: Uint16Array.from(rand), edge: Uint16Array.from(edge), n: all.length };
}

function hashInt(x) {
  let h = Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

export const BIG = DIGITS.map((_, d) => buildDigit(d, 4));    // hours: 32 x 48
export const SMALL = DIGITS.map((_, d) => buildDigit(d, 3));  // minutes: 24 x 36

// ------------------------------------------------------------ the 8x8 scroller font
// Chunky two-pixel strokes, 7 x 7 in an 8 x 8 cell: the demo's own bitmap
// font. Capitals and a little punctuation; the scroller never shows digits
// (the only numerals on the glass are the time).

const FONT_SRC = {
  A: ['.#####.', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
  B: ['######.', '##...##', '##...##', '######.', '##...##', '##...##', '######.'],
  C: ['.######', '##.....', '##.....', '##.....', '##.....', '##.....', '.######'],
  D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##..##.', '#####..'],
  E: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '#######'],
  F: ['#######', '##.....', '##.....', '######.', '##.....', '##.....', '##.....'],
  G: ['.######', '##.....', '##.....', '##..###', '##...##', '##...##', '.######'],
  H: ['##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##'],
  I: ['######.', '..##...', '..##...', '..##...', '..##...', '..##...', '######.'],
  J: ['....###', '.....##', '.....##', '.....##', '##...##', '##...##', '.#####.'],
  K: ['##...##', '##..##.', '##.##..', '####...', '##.##..', '##..##.', '##...##'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
  N: ['##...##', '###..##', '####.##', '##.####', '##..###', '##...##', '##...##'],
  O: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  P: ['######.', '##...##', '##...##', '######.', '##.....', '##.....', '##.....'],
  Q: ['.#####.', '##...##', '##...##', '##...##', '##.#.##', '##..##.', '.###.##'],
  R: ['######.', '##...##', '##...##', '######.', '##.##..', '##..##.', '##...##'],
  S: ['.######', '##.....', '##.....', '.#####.', '.....##', '.....##', '######.'],
  T: ['######.', '..##...', '..##...', '..##...', '..##...', '..##...', '..##...'],
  U: ['##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  V: ['##...##', '##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'],
  W: ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
  X: ['##...##', '.##.##.', '..###..', '..###..', '..###..', '.##.##.', '##...##'],
  Y: ['##..##.', '##..##.', '##..##.', '.####..', '..##...', '..##...', '..##...'],
  Z: ['#######', '....##.', '...##..', '..##...', '.##....', '##.....', '#######'],
  ' ': ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
  '.': ['.......', '.......', '.......', '.......', '.......', '.##....', '.##....'],
  ',': ['.......', '.......', '.......', '.......', '.##....', '.##....', '##.....'],
  '!': ['.##....', '.##....', '.##....', '.##....', '.##....', '.......', '.##....'],
  '?': ['.#####.', '##...##', '....##.', '...##..', '..##...', '.......', '..##...'],
  "'": ['.##....', '.##....', '##.....', '.......', '.......', '.......', '.......'],
  '-': ['.......', '.......', '.......', '.#####.', '.......', '.......', '.......'],
  ':': ['.......', '.##....', '.##....', '.......', '.##....', '.##....', '.......'],
  '&': ['.###...', '##.##..', '.###...', '.###.##', '##.###.', '##..##.', '.###.##'],
  '*': ['.......', '##.#.##', '.#####.', '#######', '.#####.', '##.#.##', '.......'],
  '/': ['.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '.......'],
  '(': ['...##..', '..##...', '.##....', '.##....', '.##....', '..##...', '...##..'],
  ')': ['.##....', '..##...', '...##..', '...##..', '...##..', '..##...', '.##....'],
};

/** Column bit masks: FONT[charCode] is 8 bytes, column x's bits (bit y = row y). */
export const FONT = new Uint8Array(128 * 8);
for (const [ch, rows] of Object.entries(FONT_SRC)) {
  const base = ch.charCodeAt(0) * 8;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (rows[y][x] === '#') FONT[base + x] |= 1 << y;
}
