// Flipclock — a split-flap display: the top half turns first, then the bottom.
//
// Bold 5x7 numerals (two-dot strokes). When a digit changes it flips like a
// split-flap card: for 150 ms the new digit's top half sits over the old
// digit's bottom half, with the seam between them lit as the falling flap's
// edge; then the bottom lands. 150 ms is the glass's switching time, so the
// half-and-half state actually shows. The original design wiped each digit in
// over 0.24 s (30 ms a row), which the glass could not show at all.
//
// The digit a card flips *from* is read off the clock a moment before the
// change. The original computed it as "this digit minus one", which flipped
// from 9 instead of 5 at every minute and from 9 instead of 2 at midnight.
//
// Budget: six cards, at most six distinct tiles at rest. A flipping card needs
// one tile for its in-between state but no longer needs its resting one
// unless another card shows the same digit, so frames stay within eight.
// Resting cards are allocated first; a flip that does not fit is skipped.

import { TileAllocator, clockFields } from '../js/kit.js';

const STEP = 0.15;                     // seconds the half-flipped card holds
const TIME_COL = 4;                    // HH:MM:SS across cells 4-11
const SEAM = 3;                        // last row of the top half

/** Bold 5x7 numerals, two-dot strokes, on the ROM baseline (row 7 blank). */
const FACE = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.', '.....'],
  1: ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####', '.....'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####', '.....'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.', '.....'],
  4: ['...##', '..###', '.####', '##.##', '#####', '...##', '...##', '.....'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.', '.....'],
  6: ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.', '.....'],
  7: ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..', '.....'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.', '.....'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.', '.....'],
};

/** Half-flipped: the new top over the old bottom, the seam lit as the flap edge. */
const flipping = (from, to) => FACE[to].map((row, r) => (r < SEAM ? row : r === SEAM ? '#####' : FACE[from][r]));

export default {
  name: 'Flipclock',
  blurb: 'Bold 5x7 digits that flip like split-flap cards: top half first, then the bottom.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, fields }) {
    const sub = fields.ms / 1000;
    const now = [...fields.hh, ...fields.mm, ...fields.ss];
    // What every card showed just before this second began.
    const before = clockFields(new Date(date.getTime() - fields.ms - 1));
    const was = [...before.hh, ...before.mm, ...before.ss];

    const alloc = new TileAllocator(lcd, 0);
    const rest = now.map((d) => alloc.add(FACE[d]));
    const codes = now.map((d, i) => {
      if (sub >= STEP || was[i] === d) return rest[i];
      return alloc.add(flipping(was[i], d)) ?? rest[i];
    });
    alloc.flush();

    const cols = [0, 1, 3, 4, 6, 7].map((c) => TIME_COL + c);
    codes.forEach((code, i) => { lcd.setCursor(cols[i], 0); lcd.data(code); });
    lcd.setCursor(TIME_COL + 2, 0); lcd.data(0x3a);
    lcd.setCursor(TIME_COL + 5, 0); lcd.data(0x3a);

    lcd.textAt(3, 1, `${fields.dow} ${fields.dd} ${fields.month}`);
  },
};
