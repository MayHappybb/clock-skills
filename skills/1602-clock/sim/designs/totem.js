// Totem — the module stood on end, and the time stacked down it.
//
//   H      Four digits, each the full width of the portrait glass (16 dots,
//   H      both viewer columns, 11.5 mm) and four viewer cells tall (20 dots,
//   M      13.6 mm): the largest a digit can be when four of them share
//   M      sixteen cells. HH over MM, read top to bottom like a totem pole.
//
// The budget is the whole problem. A digit two cells wide and four tall drawn
// as its own picture would be eight tiles. Instead every digit is built from
// one kit of seven parts that line up with the viewer cells:
//
//   A  top bar, at the bottom of its cell     D  bottom bar, at the top of its cell
//   L  left stroke (left column only)         R  right stroke (right column only)
//   G  middle bar                             LG / RG  a stroke meeting the middle bar
//
// A cell holds at most one stroke, because a stroke only ever lives in its own
// viewer column, and the bars run the full width so the same tile serves both
// columns. Seven parts is the whole kit, so no time of day, and no frame of a
// transition between two times, can ever need more than seven slots.
//
// The bars sit against the cell seams (A at the bottom of the top cell, D at
// the top of the bottom one), so the only break between a bar and its stroke is
// the seam itself, and two stacked digits are kept apart by the blank rows above
// A and below D. The middle bar is at the bottom of the upper-stroke cell, so
// the lower counter is the taller one, as in the reference block face.
//
// Tried and dropped: digits three cells tall, which would have left room for a
// separator and seconds. With bars that are not whole cells, a three-cell digit
// mixes bar and strokes in every cell, and the kit grows to fifteen parts; a
// typical time (10:09) needs nine. Four cells is the smallest height whose parts
// are separable. So there is no colon: the stack itself is the separator, HH
// above the middle seam, MM below it.
//
// On the minute the digits roll like an odometer. A turning digit's window
// slides down its own four cells over a strip of new-above-old, one cell (five
// dots) per 200 ms, so the new digit drops in from above and the old one is
// pushed out below. When several digits change the carry ripples upward:
// minutes' ones first, then each digit to its left 0.35 s later.

import { PortraitStage, clamp } from '../js/kit.js';

const FPS = 10;
const STEP = 0.2;                      // seconds per cell of roll: a little over the glass's switching time
const RIPPLE = 0.35;                   // delay between a digit and the one above it

const FULL = '########', NONE = '........';
const LEFT = '###.....', RIGHT = '.....###';
const tile = (...rows) => rows;
const PART = {
  A: tile(NONE, NONE, FULL, FULL, FULL),
  D: tile(FULL, FULL, FULL, NONE, NONE),
  L: tile(LEFT, LEFT, LEFT, LEFT, LEFT),
  R: tile(RIGHT, RIGHT, RIGHT, RIGHT, RIGHT),
  G: tile(NONE, NONE, NONE, FULL, FULL),
  LG: tile(LEFT, LEFT, LEFT, FULL, FULL),
  RG: tile(RIGHT, RIGHT, RIGHT, FULL, FULL),
};

/** Each digit as four rows (top to bottom) of [left cell, right cell]; '' is blank. */
const DIGITS = {
  0: [['A', 'A'], ['L', 'R'], ['L', 'R'], ['D', 'D']],
  1: [['', 'R'], ['', 'R'], ['', 'R'], ['', 'R']],
  2: [['A', 'A'], ['G', 'RG'], ['L', ''], ['D', 'D']],
  3: [['A', 'A'], ['G', 'RG'], ['', 'R'], ['D', 'D']],
  4: [['L', 'R'], ['LG', 'RG'], ['', 'R'], ['', 'R']],
  5: [['A', 'A'], ['LG', 'G'], ['', 'R'], ['D', 'D']],
  6: [['A', 'A'], ['LG', 'G'], ['L', 'R'], ['D', 'D']],
  7: [['A', 'A'], ['', 'R'], ['', 'R'], ['', 'R']],
  8: [['A', 'A'], ['LG', 'RG'], ['L', 'R'], ['D', 'D']],
  9: [['A', 'A'], ['LG', 'RG'], ['', 'R'], ['D', 'D']],
};

/**
 * The rows a digit slot shows `dt` seconds after it started turning from
 * `was` to `now`: a window over the strip [now's four rows, was's four rows],
 * starting on `was` and stepping up a row each STEP until it shows `now`.
 */
function slotRows(was, now, dt) {
  if (was === now || dt >= 4 * STEP) return DIGITS[now];
  const strip = [...DIGITS[now], ...DIGITS[was]];
  const top = 4 - clamp(Math.floor(dt / STEP), 0, 4);
  return strip.slice(top, top + 4);
}

export default {
  name: 'Totem',
  blurb: 'Portrait: HH over MM, four digits the full width of the glass, stacked like a totem pole; they roll like an odometer.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,
  rotate: 90,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const now = fields.hh + fields.mm;
    const before = kit.clockFields(new Date(date.getTime() - 60000));
    const was = before.hh + before.mm;

    const st = new PortraitStage(lcd);
    // The carry ripples up from the minutes' ones: digit 3 turns first.
    let order = 0;
    for (let k = 3; k >= 0; k--) {
      const turning = was[k] !== now[k];
      const dt = turning ? sec - RIPPLE * order++ : Infinity;
      slotRows(was[k], now[k], dt).forEach(([l, r], row) => {
        if (l) st.pput(0, 4 * k + row, PART[l]);
        if (r) st.pput(1, 4 * k + row, PART[r]);
      });
    }
    st.draw();
  },
};
