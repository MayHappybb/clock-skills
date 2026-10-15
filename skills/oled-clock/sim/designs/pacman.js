// Pac-Man — the time is the pellets in the maze.
//
// Each digit of HH:MM is laid out in pellets, two pellets per stroke, on the
// arcade's own 8-pixel corridor grid: every stroke is a corridor Pac-Man can
// run along, every closed counter (in 0, 6, 8, 9) is a wall island drawn the
// way the arcade draws its islands, a one-pixel outline with rounded corners.
// The playfield is a slice of the maze between the arcade's double-line
// borders, with the side tunnels at both screen edges. The colon is the two
// power pellets, blinking at the arcade's rate (8 frames on, 8 off).
//
// The minute turn is a round of the game: Pac-Man comes in through the right
// tunnel and eats the old minute digit (or both minute digits at :X9), the
// ghosts on his tail; he leaves the way he came and the new digit's pellets
// appear at :00. His route is solved, not drawn: the shortest walk along the
// corridors that eats every pellet of the digits that change, found by a
// breadth-first search over (corridor node, pellets eaten). Since only the
// right-most digits ever change, the route never crosses a digit that stays.
//
// The hour turn is a power-pellet round: he eats both minute digits, then the
// colon's top power pellet; the ghosts turn frightened, reverse and flee; he
// turns and eats them one by one (200, 400, 800, 1600; the game freezes for
// each, as it does), their eyes rushing home through the tunnel; then he eats
// the other power pellet and the hour, and leaves. The cleared maze flashes,
// and the new hour starts with READY! in the border.
//
// The sprites are the arcade's, decoded from the Pac-Man sprite ROM (via
// floooh/pacman.c, which embeds the dump): the 13 px Pac-Man with its
// open-half-shut-half chomp (a frame every 2 px moved), the 14 px ghosts with
// four eye directions and two skirts (a skirt every 8 px), the frightened
// ghost, the 200-1600 score sprites, and the 8x8 tile font for the text.
// Speeds are the arcade's level-1 figures from the Pac-Man Dossier: 100% is
// 75.76 px/s; Pac-Man 80% (90% while ghosts are frightened), ghosts 75%,
// frightened ghosts 50%. In one bit, a ghost's body is lit, its eye whites lit
// inside a dark rim, its pupils dark; a frightened ghost is a 50% dither with
// a lit face, flashing solid near the end of its fright.
//
// Everything comes from the clock: each turn's route, timing and ghosts are
// worked out from this minute's digits and the next's (cached per minute),
// and the score is every pellet and ghost eaten since midnight, a new game.
//
// Burn-in: the playfield walks a 2 px orbit sideways and 1 px up and down;
// the borders are the only fixed lines, a third of the day on any row.

import { noise, orbit, clamp, dither, clockFields } from '../js/kit.js';

// ------------------------------------------------------------ sprites
// '#' lit. Ghosts: B body, w eye white, p pupil. Frightened: B body, F face.
const ART = {
  open: `
    ....#####.....
    ..#######.....
    .#######......
    .######.......
    ######........
    #####.........
    ####..........
    #####.........
    ######........
    .######.......
    .#######......
    ..#######.....
    ....#####.....
    ..............
  `,
  half: `
    ....#####.....
    ..#########...
    .###########..
    .###########..
    ##########....
    #######.......
    ####..........
    #######.......
    ##########....
    .###########..
    .###########..
    ..#########...
    ....#####.....
    ..............
  `,
  shut: `
    ....#####.....
    ..#########...
    .###########..
    .###########..
    #############.
    #############.
    #############.
    #############.
    #############.
    .###########..
    .###########..
    ..#########...
    ....#####.....
    ..............
  `,
  openV: `
    ....#####.....
    ..#########...
    .###########..
    .###########..
    ######.######.
    #####...#####.
    ####.....####.
    ###.......###.
    ##.........##.
    ..............
    ..............
    ..............
    ..............
    ..............
  `,
  halfV: `
    ....#####.....
    ..#########...
    .###########..
    .###########..
    #############.
    ######.######.
    ######.######.
    #####...#####.
    #####...#####.
    .####...####..
    .###.....###..
    ..##.....##...
    ..............
    ..............
  `,
  right0: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBwwBBBBwwB.
    .BBwwwwBBwwww.
    .BBwwppBBwwpp.
    BBBwwppBBwwppB
    BBBBwwBBBBwwBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BB.BBB..BBB.BB
    B...BB..BB...B
  `,
  right1: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBwwBBBBwwB.
    .BBwwwwBBwwww.
    .BBwwppBBwwpp.
    BBBwwppBBwwppB
    BBBBwwBBBBwwBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBB.BBBB.BBBB
    .BB...BB...BB.
  `,
  down0: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBBBBBBBBBB.
    .BBwwBBBBwwBB.
    .BwwwwBBwwwwB.
    BBwwwwBBwwwwBB
    BBwppwBBwppwBB
    BBBppBBBBppBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BB.BBB..BBB.BB
    B...BB..BB...B
  `,
  down1: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBBBBBBBBBB.
    .BBwwBBBBwwBB.
    .BwwwwBBwwwwB.
    BBwwwwBBwwwwBB
    BBwppwBBwppwBB
    BBBppBBBBppBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBB.BBBB.BBBB
    .BB...BB...BB.
  `,
  left0: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BwwBBBBwwBBB.
    .wwwwBBwwwwBB.
    .ppwwBBppwwBB.
    BppwwBBppwwBBB
    BBwwBBBBwwBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BB.BBB..BBB.BB
    B...BB..BB...B
  `,
  left1: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BwwBBBBwwBBB.
    .wwwwBBwwwwBB.
    .ppwwBBppwwBB.
    BppwwBBppwwBBB
    BBwwBBBBwwBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBB.BBBB.BBBB
    .BB...BB...BB.
  `,
  up0: `
    .....BBBB.....
    ...ppBBBBpp...
    ..wppwBBwppw..
    .BwwwwBBwwwwB.
    .BwwwwBBwwwwB.
    .BBwwBBBBwwBB.
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BB.BBB..BBB.BB
    B...BB..BB...B
  `,
  up1: `
    .....BBBB.....
    ...ppBBBBpp...
    ..wppwBBwppw..
    .BwwwwBBwwwwB.
    .BwwwwBBwwwwB.
    .BBwwBBBBwwBB.
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBBB.BBBB.BBBB
    .BB...BB...BB.
  `,
  fright0: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBBBBBBBBBB.
    .BBBBBBBBBBBB.
    .BBBFFBBFFBBB.
    BBBBFFBBFFBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBFFBBFFBBFFBB
    BFBBFFBBFFBBFB
    BBBBBBBBBBBBBB
    BB.BBB..BBB.BB
    B...BB..BB...B
  `,
  fright1: `
    .....BBBB.....
    ...BBBBBBBB...
    ..BBBBBBBBBB..
    .BBBBBBBBBBBB.
    .BBBBBBBBBBBB.
    .BBBFFBBFFBBB.
    BBBBFFBBFFBBBB
    BBBBBBBBBBBBBB
    BBBBBBBBBBBBBB
    BBFFBBFFBBFFBB
    BFBBFFBBFFBBFB
    BBBBBBBBBBBBBB
    BBBB.BBBB.BBBB
    .BB...BB...BB.
  `,
  s200: `
    .###...##...##..
    #...#.#..#.#..#.
    #...#.#..#.#..#.
    ...#..#..#.#..#.
    ..#...#..#.#..#.
    .#....#..#.#..#.
    #####..##...##..
  `,
  s400: `
    ...#...##...##..
    ..##..#..#.#..#.
    .#.#..#..#.#..#.
    #..#..#..#.#..#.
    #####.#..#.#..#.
    ...#..#..#.#..#.
    ...#...##...##..
  `,
  s800: `
    .###...##...##..
    #...#.#..#.#..#.
    #...#.#..#.#..#.
    .###..#..#.#..#.
    #...#.#..#.#..#.
    #...#.#..#.#..#.
    .###...##...##..
  `,
  s1600: `
    #..###..##...##.
    #.#....#..#.#..#
    #.#....#..#.#..#
    #.####.#..#.#..#
    #.#..#.#..#.#..#
    #.#..#.#..#.#..#
    #..##...##...##.
  `,
};

// The arcade tile font (8x8 cells, 7 rows used), for the score and READY!.
const FONT = {
  "0": '...###../..#..##./.##...##/.##...##/.##...##/..##..#./...###..',
  "1": '....##../...###../....##../....##../....##../....##../..######',
  "2": '..#####./.##...##/.....###/...####./..####../.###..../.#######',
  "3": '..######/.....##./....##../...####./......##/.##...##/..#####.',
  "4": '....###./...####./..##.##./.##..##./.#######/.....##./.....##.',
  "5": '.######./.##...../.######./......##/......##/.##...##/..#####.',
  "6": '...####./..##..../.##...../.######./.##...##/.##...##/..#####.',
  "7": '.#######/.##...##/.....##./....##../...##.../...##.../...##...',
  "8": '..####../.##...#./.###..#./..####../.#..####/.#....##/..#####.',
  "9": '..#####./.##...##/.##...##/..######/......##/.....##./..####..',
  "R": '.######./.##...##/.##...##/.##..###/.#####../.##.###./.##..###',
  "E": '..######/..##..../..##..../..#####./..##..../..##..../..######',
  "A": '...###../..##.##./.##...##/.##...##/.#######/.##...##/.##...##',
  "D": '.#####../.##..##./.##...##/.##...##/.##...##/.##..##./.#####..',
  "Y": '..##..##/..##..##/..##..##/...####./....##../....##../....##..',
  "!": '....###./....###./...###../...##.../...#..../......../..#.....',
  "U": '.##...##/.##...##/.##...##/.##...##/.##...##/.##...##/..#####.',
  "P": '.######./.##...##/.##...##/.##...##/.######./.##...../.##.....',
  "H": '.##...##/.##...##/.##...##/.#######/.##...##/.##...##/.##...##',
  "I": '..######/....##../....##../....##../....##../....##../..######',
  "G": '...#####/..##..../.##...../.##..###/.##...##/..##..##/...#####',
  "S": '..####../.##..##./.##...../..#####./......##/.##...##/..#####.',
  "C": '...####./..##..##/.##...../.##...../.##...../..##..##/...####.',
  "O": '..#####./.##...##/.##...##/.##...##/.##...##/.##...##/..#####.',
  "M": '.##...##/.###.###/.#######/.#######/.##.#.##/.##...##/.##...##',
  "V": '.##...##/.##...##/.##...##/.###.###/..#####./...###../....#...',
};

// Big Pac-Man of the first intermission: four 16x16 ROM sprites each
// (16-19, 20-23, 24-27), as 32 rows of 32 bits. Open, half, shut; facing right.
const BIG = [
  '000ff000 007ffe00 01ffff00 03ffff00 07fffe00 0ffffc00 1ffff800 3ffff000 3fffe000 7fffc000 7fff8000 7fff0000 fffe0000 fffc0000 fff80000 fff00000 fff00000 fff80000 fffc0000 fffe0000 7fff0000 7fff8000 7fffc000 3fffe000 3ffff000 1ffff800 0ffffc00 07fffe00 03ffff00 01ffff00 007ffe00 000ff000',
  '000ff000 007ffe00 01ffff80 03ffffc0 07ffffe0 0ffffff0 1ffffff8 3ffffffc 3ffffffc 7ffffff0 7fffffc0 7fffff00 fffff800 ffffc000 ffff0000 fffc0000 fffc0000 ffff0000 ffffc000 fffff800 7fffff00 7fffffc0 7ffffff0 3ffffffc 3ffffffc 1ffffff8 0ffffff0 07ffffe0 03ffffc0 01ffff80 007ffe00 000ff000',
  '000ff000 007ffe00 01ffff80 03ffffc0 07ffffe0 0ffffff0 1ffffff8 3ffffffc 3ffffffc 7ffffffe 7ffffffe 7ffffffe ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff 7ffffffe 7ffffffe 7ffffffe 3ffffffc 3ffffffc 1ffffff8 0ffffff0 07ffffe0 03ffffc0 01ffff80 007ffe00 000ff000',
].map((hex) => grid(hex.split(' ').map((h) => parseInt(h, 16).toString(2).padStart(32, '0').replace(/0/g, '.').replace(/1/g, '#')).join('\n')));

/** A picture as rows of characters, so one sprite can carry several colours. */
function grid(pic) {
  const rows = pic.split(/[\n/]/).map((l) => l.trim()).filter(Boolean);
  const w = Math.max(...rows.map((r) => r.length));
  return { w, h: rows.length, at: (x, y) => (x >= 0 && y >= 0 && y < rows.length && rows[y][x]) || '.' };
}
const S = Object.fromEntries(Object.entries(ART).map(([k, v]) => [k, grid(v)]));
const GLYPH_FONT = Object.fromEntries(Object.entries(FONT).map(([k, v]) => [k, grid(v)]));
// Mouth: open, half, shut, half; one frame per 2 px moved (the arcade's anim tick).
const PAC_H = [S.open, S.half, S.shut, S.half];
const PAC_V = [S.openV, S.halfV, S.shut, S.halfV];
const GHOST = { R: [S.right0, S.right1], D: [S.down0, S.down1], L: [S.left0, S.left1], U: [S.up0, S.up1] };
const FRIGHT = [S.fright0, S.fright1];
const SCORE_SPR = [S.s200, S.s400, S.s800, S.s1600];
// A spare life, for the status row: the arcade's is the 13 px sprite, too
// tall for a 7 px row, so this is the same circle and wedge cut down.
const LIFE = grid(`
  ..###..
  .#####.
  ..#####
  ...####
  ..#####
  .#####.
  ..###..
`);

/**
 * Draw a sprite. `ink(ch, i, j)` says what each sprite pixel becomes: 1 lit,
 * 0 dark, null see-through. Unless `key` is false, a one-pixel ring round
 * the opaque pixels is cleared first: a dark keyline, so the sprite reads over
 * pellets and walls.
 */
function drawSprite(g, spr, x, y, ink, { flipX = false, flipY = false, key = true } = {}) {
  x = Math.round(x); y = Math.round(y);
  const ch = (i, j) => spr.at(flipX ? spr.w - 1 - i : i, flipY ? spr.h - 1 - j : j);
  const val = (i, j) => (i < 0 || j < 0 || i >= spr.w || j >= spr.h ? null : ink(ch(i, j), i, j, ch));
  if (key)
    for (let j = -1; j <= spr.h; j++)
      for (let i = -1; i <= spr.w; i++) {
        let near = false;
        for (let b = -1; b <= 1 && !near; b++) for (let a = -1; a <= 1; a++) if (val(i + a, j + b) !== null) { near = true; break; }
        if (near) g.pixel(x + i, y + j, 0);
      }
  for (let j = 0; j < spr.h; j++)
    for (let i = 0; i < spr.w; i++) {
      const v = val(i, j);
      if (v !== null) g.pixel(x + i, y + j, v);
    }
}

const INK_SOLID = (c) => (c === '.' ? null : 1);
/** A ghost in one bit: body lit, eye whites lit inside a dark rim, pupils dark. */
function inkGhost(c, i, j, ch) {
  if (c === 'w') return 1;
  if (c === 'p') return 0;
  if (c !== 'B') return null;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ch(i + a, j + b) === 'w') return 0;
  return 1;
}
/** Eyes alone: an eaten ghost going home. */
const inkEyes = (c) => (c === 'w' ? 1 : c === 'p' ? 0 : null);

function text(g, str, x, y) {
  for (const c of str) {
    const gl = GLYPH_FONT[c];
    if (gl) for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) if (gl.at(i, j) === '#') g.pixel(x + i, y + j, 1);
    x += 8;
  }
}

// ------------------------------------------------------------ the maze

// Playfield coordinates (before the burn-in orbit). Each digit is a 3x5
// lattice of corridor nodes 8 px apart, the arcade's tile pitch; a lit node
// is a 2x2 block of pellets (4 px apart, 2x2 px each) round the node.
const DIG_X = [4, 32, 74, 102], DIG_Y = 17;
const COLON_X = 64, COLON = 4;            // the colon column is "slot" 4
const ENTRY_X = 138;                      // the right tunnel, off the glass
const TOP_WALL = 9, BOTTOM_WALL = 59;     // each a double line, 3 px apart
const rowY = (r) => DIG_Y + 3 + 8 * r;
const nodeXY = (slot, n) => (slot === COLON ? [COLON_X, rowY(n)] : [DIG_X[slot] + 3 + 8 * (n % 3), rowY(Math.floor(n / 3))]);
const NODE = (c, r) => r * 3 + c;
const PILLS = [1, 3];                     // the colon's power pellets sit on rows 1 and 3

// The digits, drawn for the lattice: strokes are corridors, so every corner
// is a right angle, rounded by leaving out the corner pellet.
const GLYPH = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
};

const DIGIT = [];
for (let d = 0; d <= 9; d++) {
  const on = (c, r) => c >= 0 && c < 3 && r >= 0 && r < 5 && GLYPH[d][r][c] === '#';
  const pellets = [], lit = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++) {
      if (!on(c, r)) continue;
      lit.push(NODE(c, r));
      for (const sy of [-1, 1])
        for (const sx of [-1, 1]) {
          const corner = !on(c + sx, r) && !on(c, r + sy) && on(c - sx, r) && on(c, r - sy);
          if (!corner) pellets.push({ x: 8 * c + (sx > 0 ? 4 : 0), y: 8 * r + (sy > 0 ? 4 : 0), node: NODE(c, r) });
        }
    }
  // Counters the strokes close all round become wall islands.
  const out = new Set(), stack = [];
  for (let n = 0; n < 15; n++) {
    const c = n % 3, r = Math.floor(n / 3);
    if (!on(c, r) && (c === 0 || c === 2 || r === 0 || r === 4)) { out.add(n); stack.push(n); }
  }
  while (stack.length) {
    const n = stack.pop(), c = n % 3, r = Math.floor(n / 3);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = NODE(c + a, r + b);
      if (c + a >= 0 && c + a < 3 && r + b >= 0 && r + b < 5 && !on(c + a, r + b) && !out.has(m)) { out.add(m); stack.push(m); }
    }
  }
  const wall = new Set();
  for (let n = 0; n < 15; n++) if (!on(n % 3, Math.floor(n / 3)) && !out.has(n)) wall.add(n);
  // One island per vertical run of enclosed nodes (the digits only have those).
  const islands = [];
  for (const n of [...wall].sort((a, b) => a - b)) {
    const c = n % 3, r = Math.floor(n / 3), last = islands[islands.length - 1];
    if (last && last.c === c && last.r1 === r - 1) last.r1 = r;
    else islands.push({ c, r0: r, r1: r });
  }
  DIGIT.push({ pellets, lit, wall, islands });
}
// ------------------------------------------------------------ routes

/** Each digit's corridor lattice: neighbours of every walkable node. */
const NB = DIGIT.map(({ wall }) => Array.from({ length: 15 }, (_, n) => {
  if (wall.has(n)) return [];
  const c = n % 3, r = Math.floor(n / 3), out = [];
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cc = c + a, rr = r + b;
    if (cc >= 0 && cc < 3 && rr >= 0 && rr < 5 && !wall.has(NODE(cc, rr))) out.push(NODE(cc, rr));
  }
  return out;
}));

/** Shortest corridor walks between any two nodes of a digit (steps of 8 px). */
const APSP = NB.map((nb) => Array.from({ length: 15 }, (_, s) => {
  const dist = new Array(15).fill(Infinity), prev = new Array(15).fill(-1), q = [s];
  dist[s] = 0;
  while (q.length) {
    const n = q.shift();
    for (const m of nb[n]) if (dist[m] === Infinity) { dist[m] = dist[n] + 1; prev[m] = n; q.push(m); }
  }
  return { dist, prev };
}));
function lpath(d, a, b) {
  const out = [], { prev } = APSP[d][a];
  for (let n = b; n !== a && n >= 0; n = prev[n]) out.push(n);
  return out.reverse();
}

/**
 * Every shortest way to eat all of digit d's pellets from node `start`:
 * breadth-first over (node, set of lit nodes visited). Memoised; at most
 * 15 x 2^13 states, a few milliseconds the first time each is asked for.
 */
const coverMemo = new Map();
function cover(d, start) {
  const k = d * 16 + start;
  if (coverMemo.has(k)) return coverMemo.get(k);
  const { lit } = DIGIT[d], bit = new Array(15).fill(0);
  lit.forEach((n, i) => { bit[n] = 1 << i; });
  const FULL = (1 << lit.length) - 1, SZ = 15 << lit.length;
  const dist = new Int16Array(SZ).fill(-1), par = new Int32Array(SZ).fill(-1), q = new Int32Array(SZ);
  const s0 = bit[start] * 15 + start;
  let h = 0, t = 0;
  dist[s0] = 0; q[t++] = s0;
  while (h < t) {
    const s = q[h++], node = s % 15, mask = (s - node) / 15;
    for (const m of NB[d][node]) {
      const ms = (mask | bit[m]) * 15 + m;
      if (dist[ms] < 0) { dist[ms] = dist[s] + 1; par[ms] = s; q[t++] = ms; }
    }
  }
  const res = {
    cost: (end) => dist[FULL * 15 + end],
    walk(end) {                                  // nodes from start to end, inclusive
      const out = [];
      for (let s = FULL * 15 + end; s >= 0; s = par[s]) out.push(s % 15);
      return out.reverse();
    },
  };
  coverMemo.set(k, res);
  return res;
}

/** Eat digit d entering at (2, rin), then walk to the right-hand column's top or bottom, to leave. */
function lastLeg(d, rin) {
  const cv = cover(d, NODE(2, rin));
  let best = null;
  for (let e = 0; e < 15; e++) {
    const c = cv.cost(e);
    if (c < 0) continue;
    for (const xr of [0, 4]) {
      const cost = c + APSP[d][e].dist[NODE(2, xr)];
      if (!best || cost < best.cost) best = { cost, e, xr };
    }
  }
  return { cost: best.cost, nodes: [...cv.walk(best.e), ...lpath(d, best.e, NODE(2, best.xr))], exitRow: best.xr };
}
/** A polyline with arc-length lookup; beyond either end it carries straight on. */
function track(points) {
  const segs = [];
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    segs.push({ ax, ay, len, s0: L, dx: (bx - ax) / len, dy: (by - ay) / len });
    L += len;
  }
  return {
    segs, L,
    /** [x, y, dx, dy] at arc length s. */
    at(s) {
      let sg = segs[0];
      for (const q of segs) { if (q.s0 <= s) sg = q; else break; }
      const u = s - sg.s0;
      return [sg.ax + sg.dx * u, sg.ay + sg.dy * u, sg.dx, sg.dy];
    },
    /** The first arc length at which a point comes within r of (px, py), or Infinity. */
    reach(px, py, r) {
      for (const q of segs) {
        const ux = px - q.ax, uy = py - q.ay;
        const along = ux * q.dx + uy * q.dy, off = Math.abs(ux * q.dy - uy * q.dx);
        if (off > r) continue;
        const half = Math.sqrt(r * r - off * off), u = Math.max(0, along - half);
        if (u <= q.len && along + half >= 0) return q.s0 + u;
      }
      return Infinity;
    },
  };
}

const digitsOf = (f) => [Number(f.hh[0]), Number(f.hh[1]), Number(f.mm[0]), Number(f.mm[1])];
const pts = (slot, nodes) => nodes.map((n) => nodeXY(slot, n));

/**
 * The route for the turn from digits `a` to `b`: polyline points, and for
 * the hour, the index of the top power pellet in it. Enters through the right
 * tunnel on whichever row makes the walk shortest; `key` breaks ties.
 */
function route(a, b, key) {
  const hour = b[2] === 0 && b[3] === 0;
  const jitter = (i) => noise(key, 7 + i) * 0.5;   // less than a step: only breaks ties
  let best = null;
  const consider = (cost, build) => { if (!best || cost < best.cost) best = { cost, build }; };
  for (let rin = 0; rin < 5; rin++) {
    const enter = [ENTRY_X, rowY(rin)];
    if (!hour && a[2] === b[2]) {
      const L = lastLeg(a[3], rin);
      consider(L.cost + jitter(rin), () => ({ points: [enter, ...pts(3, L.nodes), [ENTRY_X, rowY(L.exitRow)]] }));
      continue;
    }
    for (let r1 = 0; r1 < 5; r1++) {
      const c3 = cover(a[3], NODE(2, rin));
      if (!hour) {
        const L = lastLeg(a[2], r1);
        consider(c3.cost(NODE(0, r1)) + L.cost + jitter(rin * 5 + r1), () => ({
          points: [enter, ...pts(3, c3.walk(NODE(0, r1))), ...pts(2, L.nodes), [ENTRY_X, rowY(L.exitRow)]],
        }));
      } else {
        const c2 = cover(a[2], NODE(2, r1));
        consider(c3.cost(NODE(0, r1)) + c2.cost(NODE(0, PILLS[0])) + jitter(rin * 5 + r1), () => {
          const A = [enter, ...pts(3, c3.walk(NODE(0, r1))), ...pts(2, c2.walk(NODE(0, PILLS[0]))), nodeXY(COLON, PILLS[0])];
          const B = [nodeXY(COLON, 2), nodeXY(COLON, PILLS[1])];
          let L;
          if (a[0] !== b[0]) {
            let m = null;
            for (let r2 = 0; r2 < 5; r2++) {
              const c1 = cover(a[1], NODE(2, PILLS[1])), L0 = lastLeg(a[0], r2);
              const cost = c1.cost(NODE(0, r2)) + L0.cost;
              if (!m || cost < m.cost) m = { cost, nodes: c1.walk(NODE(0, r2)), L0 };
            }
            B.push(...pts(1, m.nodes), ...pts(0, m.L0.nodes));
            L = m.L0;
          } else {
            L = lastLeg(a[1], PILLS[1]);
            B.push(...pts(1, L.nodes));
          }
          B.push([ENTRY_X, rowY(L.exitRow)]);
          return { points: [...A, ...B], pill: A.length - 1 };
        });
      }
    }
  }
  return best.build();
}
// ------------------------------------------------------------ the turn

const V = 75.7576;                         // 100% speed in px/s (Pac-Man Dossier)
const V_PAC = 0.8 * V, V_PAC_FRIGHT = 0.9 * V, V_GHOST = 0.75 * V, V_FRIGHT = 0.5 * V, V_EYES = 2 * V;
const FREEZE = 1.0;                        // the game stops while a ghost's score shows
const R_EAT = 4.5;                         // a pellet goes once Pac-Man's centre is this close
const END_MINUTE = 59.3, END_HOUR = 58.3;  // when Pac-Man is back in the tunnel
const FLASH_FROM = 58.5;                   // the hour's cleared maze flashes until :00

const planMemo = new Map();
/** Everything about the turn at the end of the minute `f` (to `next`), in seconds of that minute. */
function planFor(f, next) {
  const key = f.minuteKey;
  if (planMemo.has(key)) return planMemo.get(key);
  const a = digitsOf(f), b = digitsOf(next);
  const r = route(a, b, key), trk = track(r.points), hour = r.pill !== undefined;
  const food = [];
  for (let s = 0; s < 4; s++) {
    if (a[s] === b[s]) continue;
    for (const p of DIGIT[a[s]].pellets) food.push({ slot: s, p, arc: trk.reach(DIG_X[s] + p.x + 1, DIG_Y + p.y + 1, R_EAT) });
  }
  const P = { a, b, trk, hour, food, pills: [Infinity, Infinity] };
  if (!hour) {
    P.T0 = END_MINUTE - trk.L / V_PAC;
    const n = 2 + Math.floor(noise(key, 3) * 3);
    P.ghosts = Array.from({ length: n }, (_, k) => ({ lag: 0.45 + 0.34 * k + 0.12 * noise(key, 20 + k) }));
  } else {
    const L1 = track(r.points.slice(0, r.pill + 1)).L;
    P.L1 = L1;
    P.pills = [L1, trk.reach(COLON_X, rowY(PILLS[1]), 3)];
    P.tf = L1 / V_PAC;
    P.ghosts = [0, 1, 2, 3].map((k) => {
      const lag = 0.35 + 0.28 * k, a0 = V_GHOST * (P.tf - lag);
      const u = (L1 - a0) / (V_PAC_FRIGHT - V_FRIGHT);
      return { lag, a0, tc: P.tf + u, c: L1 - V_PAC_FRIGHT * u, pts: 200 << k };
    });
    const last = P.ghosts[3];
    P.tLast = last.tc; P.cLast = last.c;
    P.tfe = last.tc + 0.5;                       // fright ends just after the last catch,
    P.tb = last.tc + (L1 - last.c) / V_PAC_FRIGHT; // so the last ghosts are caught flashing
    P.tEnd = P.tb + (trk.L - L1) / V_PAC;
    P.T0 = END_HOUR - P.tEnd - FREEZE * 4;
  }
  if (planMemo.size > 6) planMemo.delete(planMemo.keys().next().value);
  planMemo.set(key, P);
  return P;
}

/** Game time at second `sec` of the plan's minute: the clock stops for each ghost eaten. */
function gameTime(P, sec) {
  let tau = sec - P.T0;
  if (!P.hour) return { tau, frozen: -1 };
  for (let k = 0; k < 4; k++) {
    const tc = P.ghosts[k].tc;
    if (tau < tc) break;
    if (tau < tc + FREEZE) return { tau: tc, frozen: k };
    tau -= FREEZE;
  }
  return { tau, frozen: -1 };
}

/** Pac-Man: arc position, direction along the track, and how far along he has eaten. */
function pacAt(P, tau) {
  if (!P.hour || tau < P.tf) { const s = V_PAC * tau; return { s, dir: 1, eaten: s }; }
  if (tau < P.tLast) return { s: P.L1 - V_PAC_FRIGHT * (tau - P.tf), dir: -1, eaten: P.L1 };
  if (tau < P.tb) return { s: P.cLast + V_PAC_FRIGHT * (tau - P.tLast), dir: 1, eaten: P.L1 };
  const s = P.L1 + V_PAC * (tau - P.tb);
  return { s, dir: 1, eaten: s };
}

/** Ghost k: { mode: chase | fright | score | eyes, s, dir, white }. */
function ghostAt(P, k, tau, frozen) {
  const G = P.ghosts[k];
  if (!P.hour || tau < P.tf) return { mode: 'chase', s: V_GHOST * (tau - G.lag), dir: 1 };
  if (tau < G.tc) {
    const fl = tau - (P.tfe - 2);
    return { mode: 'fright', s: G.a0 - V_FRIGHT * (tau - P.tf), dir: -1, white: fl > 0 && Math.floor(fl / 0.2) % 2 === 1 };
  }
  if (frozen === k) return { mode: 'score', s: G.c, dir: -1 };
  return { mode: 'eyes', s: G.c - V_EYES * (tau - G.tc), dir: -1 };
}
// The score: 10 a pellet, 50 a power pellet, 200-1600 the ghosts, a new
// game at midnight. CUM[m] is everything scored before minute m of the day.
const CUM = new Float64Array(1441);
for (let m = 0; m < 1440; m++) {
  const dg = (k) => { const h = Math.floor(k / 60) % 24, mm = k % 60; return [Math.floor(h / 10), h % 10, Math.floor(mm / 10), mm % 10]; };
  const a = dg(m), b = dg(m + 1);
  let p = 0;
  for (let s = 0; s < 4; s++) if (a[s] !== b[s]) p += 10 * DIGIT[a[s]].pellets.length;
  if (b[2] === 0 && b[3] === 0) p += 2 * 50 + 200 + 400 + 800 + 1600;
  CUM[m + 1] = CUM[m] + p;
}

// ------------------------------------------------------------ drawing

const DAY = 0xcf, NIGHT = 0x18;
const PS = 2;                              // pellet size, as the arcade's
const POP = 0.4;                           // the new digit's pellets appear over this long after :00
const BLINK = 8 / 60;                      // power pellets: 8 frames on, 8 off

function dirOf(dx, dy, sign) {
  dx *= sign; dy *= sign;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
}

function drawPac(g, P, pac, X, Y) {
  const [x, y, dx, dy] = P.trk.at(pac.s), d = dirOf(dx, dy, pac.dir);
  const fr = Math.floor(Math.abs(pac.s) / 2) % 4;
  const spr = d === 'R' || d === 'L' ? PAC_H[fr] : PAC_V[fr];
  drawSprite(g, spr, X(x) - 7, Y(y) - 7, INK_SOLID, { flipX: d === 'L', flipY: d === 'U' });
}

function drawGhost(g, P, st, tau, X, Y) {
  const [x, y, dx, dy] = P.trk.at(st.s), gx = X(x) - 7, gy = Y(y) - 7;
  if (gx < -16 || gx > 130) return;
  const d = dirOf(dx, dy, st.dir), skirt = Math.floor(Math.abs(st.s) / 8) % 2;
  if (st.mode === 'chase') drawSprite(g, GHOST[d][skirt], gx, gy, inkGhost);
  else if (st.mode === 'eyes') drawSprite(g, GHOST[d][0], gx, gy, inkEyes);
  else if (st.mode === 'fright') {
    const spr = FRIGHT[Math.floor(tau * 15) % 2];
    const ink = st.white
      ? (c) => (c === 'B' ? 1 : c === 'F' ? 0 : null)
      : (c, i, j, ch) => {
        if (c === 'F') return 1;
        if (c !== 'B') return null;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ch(i + a, j + b) === 'F') return 0;
        return dither(i, j, 0.5) ? 1 : 0;
      };
    drawSprite(g, spr, gx, gy, ink);
  }
}

const READY_FOR = 2.5;                     // READY! shows for this long after the hour
/**
 * The first intermission, `t` seconds in: Blinky chases Pac-Man off to the
 * left, then a frightened Blinky runs back, Big Pac-Man after him.
 */
function intermission(g, t, X, Y) {
  if (t < 0) return;
  const y = rowY(2), vA = V_PAC, vB = 0.6 * V, t2 = 190 / vA;
  if (t < t2) {
    const px = 140 - vA * t, bx = px + 28 - 3 * t;
    drawSprite(g, GHOST.L[Math.floor(t * vA / 8) % 2], X(bx) - 7, Y(y) - 7, inkGhost);
    drawSprite(g, PAC_H[Math.floor(t * vA / 2) % 4], X(px) - 7, Y(y) - 7, INK_SOLID, { flipX: true });
    return;
  }
  const u = t - t2, bx = -16 + vB * u, px = bx - 46;
  if (px > 150) return;
  const fake = { trk: { at: () => [bx, y, 1, 0] } };
  drawGhost(g, fake, { mode: 'fright', s: bx, dir: 1, white: false }, u, X, Y);
  drawSprite(g, BIG[[0, 1, 2, 1][Math.floor(u * vB / 3) % 4]], X(px) - 16, Y(y) - 16, INK_SOLID);
}

function drawIsland(g, x, y, w, h) {
  g.roundRect(x, y, w, h, 2);
}
export default {
  name: 'Pac-Man',
  blurb: 'The time in pellets on the arcade maze: Pac-Man eats the old minute with the ghosts on his tail; on the hour, a power pellet, and he eats them.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);  // night dimming, 23:00-07:00 (ctx.night)
    const sec = f.sec;
    const next = clockFields(new Date(date.getTime() + 60000));
    const prev = clockFields(new Date(date.getTime() - 60000));
    const P = planFor(f, next), Pp = planFor(prev, f);
    const ox = orbit(date, 2, 3)[0], oy = orbit(date, 1, 5)[1];
    const X = (x) => x + ox, Y = (y) => y + oy;
    const { tau, frozen } = gameTime(P, sec);
    const pac = pacAt(P, tau);
    const cur = P.a;

    // Walls: the double borders, and the islands in the digits' counters.
    // The hour's cleared maze flashes in its last two seconds.
    const flash = P.hour && sec >= FLASH_FROM && Math.floor((sec - FLASH_FROM) / (16 / 60)) % 2 === 0;
    if (!flash) for (const y of [TOP_WALL, TOP_WALL + 3, BOTTOM_WALL, BOTTOM_WALL + 3]) g.hline(0, Y(y), 128);

    // Pellets: this minute's, less what Pac-Man has eaten; a digit that just
    // changed fills in over the first POP seconds, right to left. A digit's
    // islands go with its last pellet, so an eaten 0 cannot leave a 1 behind.
    for (let s = 0; s < 4; s++) {
      const dg = DIGIT[cur[s]], going = P.a[s] !== P.b[s], fresh = Pp.a[s] !== Pp.b[s] && sec < POP;
      let left = 0;
      dg.pellets.forEach((p) => {
        if (going && P.food.find((q) => q.slot === s && q.p === p).arc <= pac.eaten) return;
        left++;
        if (fresh && sec < POP * (1 - (DIG_X[s] + p.x) / 128)) return;
        g.fillRect(X(DIG_X[s] + p.x), Y(DIG_Y + p.y), PS, PS);
      });
      if (!flash && left && !(fresh && sec < POP / 2))
        for (const is of dg.islands) drawIsland(g, X(DIG_X[s] + 8 * is.c), Y(DIG_Y + 8 * is.r0), 6, 8 * (is.r1 - is.r0) + 6);
    }
    // The colon's power pellets, blinking (solid while READY! shows).
    const ready = f.m === 0 && sec < READY_FOR;
    if (ready || Math.floor(sec / BLINK) % 2 === 0)
      PILLS.forEach((r, i) => {
        if (pac.eaten >= P.pills[i]) return;
        g.fillRoundRect(X(COLON_X - 4), Y(rowY(r) - 4), 8, 8, 3);
      });

    // The cast: last turn's stragglers, then this turn's.
    const gp = gameTime(Pp, sec + 60);
    Pp.ghosts.forEach((_, k) => drawGhost(g, Pp, ghostAt(Pp, k, gp.tau, gp.frozen), gp.tau, X, Y));
    let points = 0;
    P.ghosts.forEach((G, k) => {
      if (tau < 0) return;
      const st = ghostAt(P, k, tau, frozen);
      if (st.mode === 'score') {
        const [x, y] = P.trk.at(st.s);
        drawSprite(g, SCORE_SPR[k], X(x) - 8, Y(y) - 3, INK_SOLID);
      } else drawGhost(g, P, st, tau, X, Y);
      if (P.hour && tau >= G.tc) points += G.pts;
    });
    if (tau >= 0 && frozen < 0 && pac.s < P.trk.L + 12) drawPac(g, P, pac, X, Y);

    // The status row: score since midnight, two spare lives.
    for (const q of P.food) if (q.arc <= pac.eaten) points += 10;
    P.pills.forEach((a) => { if (pac.eaten >= a) points += 50; });
    const score = String(CUM[f.h * 60 + f.m] + points).padStart(2, '0');
    const ty = 1 + oy, playing = tau >= 0 && pac.s < P.trk.L + 12;
    // 1UP blinks while the round is being played, as the arcade's does, and
    // is not shown in between (it would be the hottest thing on the glass).
    if ((playing || ready) && Math.floor(sec / (16 / 60)) % 2 === 0) text(g, '1UP', X(2), ty);
    const ks = Math.floor(f.minuteKey / 3) % 16, sx = 76 + (ks <= 8 ? ks : 16 - ks);
    text(g, score, X(sx) - 8 * score.length, ty);
    // The lives drift a pixel a minute to and fro across the free width, so
    // the two solid icons do not sit on the same pixels all day.
    const k = f.minuteKey % 40, lx = 88 + (k <= 20 ? k : 40 - k);
    for (let i = 0; i < 2; i++) drawSprite(g, LIFE, X(lx + 9 * i), ty, INK_SOLID, { flipX: true, key: false });

    // A new hour: READY! in the bottom border, then (by day) the first
    // intermission. At midnight the day's game is over and a new one starts.
    if (f.m === 0) {
      const over = f.h === 0;
      const banner = over && sec < 2.5 ? 'GAME  OVER' : sec < READY_FOR + (over ? 2.5 : 0) ? 'READY!' : null;
      if (banner) {
        const w = 8 * banner.length, x0 = 64 - w / 2;
        g.fillRect(X(x0 - 4), Y(BOTTOM_WALL - 3), w + 8, 9, 0);
        text(g, banner, X(x0), Y(BOTTOM_WALL - 2));
      }
      if (night < 0.5 && f.h !== 0) intermission(g, sec - READY_FOR, X, Y);
    }
  },
};
