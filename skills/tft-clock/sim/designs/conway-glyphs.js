// The numerals for conway.js: every digit is a still life made of blocks,
// the commonest object in the Game of Life, on a lattice of pitch 3 cells (a
// block is 2 x 2 cells, one dead cell between neighbours: a grid of blocks
// is itself a still life, and a column of blocks is the densest still-life
// strip there is). The rule decides the letterforms: in any 2 x 2 window of
// the lattice there may not be exactly three blocks (the dead cell between
// them would see three neighbours and be born), so no stroke can meet a
// thick stroke at a right angle. The set is built from bold bars two blocks
// deep (10 px) and single-block stems that meet them corner to corner, which
// rounds every corner with a notch; the 6 and 9 swing their tails on block
// diagonals, the 7 drops its stem in one jog. Counters stay at least a block
// row open, the 4 is open at the top so it never reads as A. Every glyph is
// checked to be a true still life at load. 5 x 8 blocks: 14 x 23 cells,
// 28 x 46 px on the glass.

import { lifeStep } from './conway-life.js';

export const GW = 5, GH = 8, PITCH = 3;
export const BOX_W = PITCH * (GW - 1) + 2, BOX_H = PITCH * (GH - 1) + 2;   // 14 x 23 cells

/** Where the four numerals stand (cells): the hours low left, the minutes high right. */
export const SLOTS = [[1, 17], [18, 17], [48, 1], [65, 1]];

const ART = [
  ['.###.', '.###.', '#...#', '#...#', '#...#', '#...#', '.###.', '.###.'],
  ['.#...', '#.##.', '..##.', '..##.', '..##.', '..##.', '..##.', '..##.'],
  ['.###.', '.###.', '....#', '....#', '.###.', '#....', '#....', '.####'],
  ['.###.', '.###.', '....#', '..##.', '..##.', '....#', '.###.', '.###.'],
  ['#...#', '#...#', '#...#', '.###.', '.###.', '....#', '....#', '....#'],
  ['.####', '#....', '#....', '.###.', '.###.', '....#', '.###.', '.###.'],
  ['..##.', '.#...', '#....', '.###.', '.###.', '#...#', '.###.', '.###.'],
  ['####.', '####.', '....#', '...#.', '.##..', '.##..', '.##..', '.##..'],
  ['.###.', '.###.', '#...#', '.###.', '.###.', '#...#', '.###.', '.###.'],
  ['.###.', '.###.', '#...#', '.###.', '.###.', '....#', '...#.', '.##..'],
];

/** Per digit: its blocks as top-left cells [x, y] inside the box, in reading order. */
export const BLOCKS = ART.map((rows) => {
  const out = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (rows[j][i] === '#') out.push([i * PITCH, j * PITCH]);
  return out;
});

/** Stamp a digit's blocks into a cell grid (w wide) at cell (ox, oy). */
export function stampDigit(grid, w, d, ox, oy) {
  for (const [bx, by] of BLOCKS[d]) {
    const k = (oy + by) * w + ox + bx;
    grid[k] = grid[k + 1] = grid[k + w] = grid[k + w + 1] = 1;
  }
}

// every glyph must be a still life: one generation must leave it unchanged
{
  const w = BOX_W + 4, h = BOX_H + 4;
  for (let d = 0; d < 10; d++) {
    const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    stampDigit(a, w, d, 2, 2);
    lifeStep(a, b, w, h);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`conway: digit ${d} is not a still life`);
  }
}
