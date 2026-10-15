// Hourglass — big time, and a sand glass that runs out every minute.
//
// The digits are a simplified kit of parts: three full-width bars plus the
// ROM solid block, so four 15x16 digits cost three CGRAM slots at any time of
// day. (The photo's own face, in `slab`, needs up to seven, which would leave
// no room for the glass.) One
// more holds the colon bead, used in both rows. That leaves four slots, which
// is exactly a 10x16 canvas: two cells wide, both rows, private to the glass
// and redrawn every frame.
//
// Sand drains grain by grain from the top bulb -- the surface first, centre
// first, so it dishes like real sand -- and piles into a mound in the bottom.
// A stream of grains falls through the neck while it runs. When the minute
// turns the glass spins end over end: the picture is scaled vertically by
// cos(angle), which squashes it to a sliver and lets it come back inverted,
// with the full bulb now on top. Everything is derived from the wall clock,
// so any instant of the spin renders on its own.

import { art, ease, clamp } from '../js/kit.js';

const PARTS = {
  T: art(`
    #####
    #####
    #####
    .....
    .....
    .....
    .....
    .....`),
  M: art(`
    #####
    #####
    #####
    .....
    .....
    #####
    #####
    #####`),
  B: art(`
    .....
    .....
    .....
    .....
    .....
    #####
    #####
    #####`),
  bead: art(`
    .....
    .....
    .###.
    .###.
    .###.
    .....
    .....
    .....`),
};
const SLOT = { T: 0, M: 1, B: 2, bead: 3 };
const GLASS_SLOT = 4;                  // slots 4-7: TL, TR, BL, BR of the glass

const DIGITS = {
  0: ['#T#', '#B#'],
  1: ['T# ', 'B#B'],
  2: ['MM#', '#BB'],
  3: ['MM#', 'BB#'],
  4: ['#B#', '  #'],
  5: ['#MM', 'BB#'],
  6: ['#MM', '#B#'],
  7: ['TT#', '  #'],
  8: ['#M#', '#B#'],
  9: ['#M#', 'BB#'],
};
const code = (p) => (p === '#' ? 0xff : p === ' ' ? 0x20 : SLOT[p]);

const DIGIT_COLS = [0, 3, 7, 10];
const COLON_COL = 6;
const GLASS_COL = 14;
const FLIP = 1.0;                      // seconds to turn over: several LC response times, so it reads

// ------------------------------------------------------------------ the glass

/** Interior columns [lo, hi] of the glass, per dot row; rows 0 and 15 are caps. */
const INTERIOR = [
  null, [2, 7], [2, 7], [2, 7], [3, 6], [3, 6], [4, 5], [4, 5],
  [4, 5], [4, 5], [3, 6], [3, 6], [2, 7], [2, 7], [2, 7], null,
];
const NECK = [7, 8];                   // dot rows the stream passes through

const cells = (rows) => rows.flatMap((y) => {
  const [lo, hi] = INTERIOR[y];
  return Array.from({ length: hi - lo + 1 }, (_, i) => ({ x: lo + i, y }));
});
const off = (x) => Math.abs(x - 4.5);

/** Top bulb, in the order its grains leave: highest row first, centre first. */
const TOP_ORDER = cells([1, 2, 3, 4, 5, 6])
  .sort((a, b) => a.y - b.y || off(a.x) - off(b.x));
/** Bottom bulb, in the order grains land: a mound, centre and bottom first. */
const BOTTOM_ORDER = cells([9, 10, 11, 12, 13, 14])
  .sort((a, b) => (14 - a.y + off(a.x) * 0.6) - (14 - b.y + off(b.x) * 0.6));
const GRAINS = TOP_ORDER.length;

/** The glass as 16 rows of 10 booleans, with `moved` grains through the neck. */
function drawGlass(moved, t) {
  const px = Array.from({ length: 16 }, () => Array(10).fill(false));
  px[0].fill(true);
  px[15].fill(true);
  INTERIOR.forEach((span, y) => {
    if (!span) return;
    px[y][span[0] - 1] = true;
    px[y][span[1] + 1] = true;
  });
  TOP_ORDER.slice(moved).forEach(({ x, y }) => { px[y][x] = true; });
  BOTTOM_ORDER.slice(0, moved).forEach(({ x, y }) => { px[y][x] = true; });

  if (moved > 0 && moved < GRAINS) {
    // A two-dot trickle from the neck down to the top of the pile, the grains
    // in its two columns offset so it shimmers as it falls at 16 dots/s.
    const phase = Math.floor(t * 16);
    const pileTop = Math.min(...BOTTOM_ORDER.slice(0, moved).filter((c) => c.x === 4 || c.x === 5).map((c) => c.y), 15);
    for (let y = NECK[0]; y < pileTop; y++) {
      for (const x of [4, 5]) {
        if ((((y - phase + x) % 3) + 3) % 3 === 0) px[y][x] = true;
      }
    }
  }
  return px;
}

/** Turn the glass by `angle`: a vertical scale by cos, nearest-row sampling. */
function turn(px, angle) {
  const c = Math.cos(angle);
  if (Math.abs(c) < 0.07) {
    const out = Array.from({ length: 16 }, () => Array(10).fill(false));
    out[7].fill(true); out[8].fill(true);
    return out;
  }
  return px.map((_, y) => {
    const sy = Math.round(7.5 + (y - 7.5) / c);
    return sy >= 0 && sy < 16 ? px[sy] : Array(10).fill(false);
  });
}

/** Cut the 10x16 picture into its four 5x8 tiles: TL, TR, BL, BR. */
function quarter(px) {
  const tile = (x0, y0) => px.slice(y0, y0 + 8)
    .map((row) => row.slice(x0, x0 + 5).map((on) => (on ? '#' : '.')).join(''));
  return [tile(0, 0), tile(5, 0), tile(0, 8), tile(5, 8)];
}

function glassFrame(fields, t) {
  const sec = fields.s + fields.ms / 1000;
  if (sec < FLIP) {
    // Last minute's glass, every grain through, spinning end over end.
    return turn(drawGlass(GRAINS, t), Math.PI * ease.inOutCubic(sec / FLIP));
  }
  const p = clamp((sec - FLIP) / (60 - FLIP), 0, 1);
  return drawGlass(Math.floor(p * GRAINS), t);
}

// ------------------------------------------------------------------- design

export default {
  name: 'Hourglass',
  blurb: 'Full-height kit-of-parts digits beside a 10x16 sand glass that drains each minute and flips.',
  bus: 'i2c100',
  panel: 'green',
  fps: 12,

  frame(lcd, api, { t, fields }) {
    for (const [k, slot] of Object.entries(SLOT)) lcd.defineChar(slot, PARTS[k]);
    quarter(glassFrame(fields, t)).forEach((tile, i) => lcd.defineChar(GLASS_SLOT + i, tile));

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    digits.forEach((d, k) => {
      DIGITS[d].forEach((parts, r) => {
        [...parts].forEach((p, i) => { grid[r][DIGIT_COLS[k] + i] = code(p); });
      });
    });
    grid[0][COLON_COL] = SLOT.bead;
    grid[1][COLON_COL] = SLOT.bead;
    grid[0][GLASS_COL] = GLASS_SLOT;
    grid[0][GLASS_COL + 1] = GLASS_SLOT + 1;
    grid[1][GLASS_COL] = GLASS_SLOT + 2;
    grid[1][GLASS_COL + 1] = GLASS_SLOT + 3;

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
