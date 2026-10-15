// Clone — an early, half-height attempt at the reference photograph.
//
// It was written believing the photo's full-height digits could not fit in
// CGRAM. They can: `slab` reproduces the photo dot for dot, by building the
// digits from shared parts. This stays as the record of that wrong turn, and
// as a heavy 10x8 face in its own right. The reasoning below is the original.
//
// The reference is a negative amber module with the time enormous across the
// glass and the seconds small at its right. Every one of those qualities is
// reproducible except one, and the exception is worth being exact about:
//
//   amber, very heavy drawn digits, time dominant, small ROM seconds  -> yes
//   digits two cells wide AND two rows tall                           -> no
//
// A four-digit face at 10x16, drawn one bitmap per digit, needs up to sixteen
// CGRAM tiles and the controller holds eight. `node tools/tile-budget.mjs
// --cellW 2 --cellH 2` puts a number on it for a seven-segment face: over budget
// for 1251 of the 1440 times in a day. (That is a limit of drawing each digit
// separately, not of the hardware: `slab` gets the full height from a kit of
// shared parts.)
//
// So this keeps the width, which is what makes the reference read as a wall
// clock, and gives up the height. Ten dots wide by eight tall is two tiles per
// digit and exactly eight for four digits, at every time of day -- see
// `--cellW 2 --cellH 1`. The weight is pushed as far as a ten-dot box allows:
// three-dot strokes with a four-dot counter, close to the reference's ratio.

import { TileAllocator, art } from '../js/kit.js';

/** 10 dots wide, 8 tall, three-dot strokes. */
const HEAVY = {
  0: art(`
    ..######..
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ..######..`),
  1: art(`
    ....###...
    ...####...
    ..#####...
    .....###..
    .....###..
    .....###..
    .....###..
    ..########`),
  2: art(`
    ..######..
    ###....###
    ......####
    ....####..
    ..####....
    .####.....
    ####......
    ##########`),
  3: art(`
    ..######..
    ###....###
    ......####
    ....#####.
    ....#####.
    ......####
    ###....###
    ..######..`),
  4: art(`
    .....###..
    ...#####..
    .###.###..
    ###...###.
    ###...###.
    ##########
    ##########
    .....###..`),
  5: art(`
    ##########
    ##########
    ###.......
    ###.......
    ########..
    ###...####
    ###....###
    ..######..`),
  6: art(`
    ..######..
    ###....###
    ###.......
    ###.......
    ########..
    ###....###
    ###....###
    ..######..`),
  7: art(`
    ##########
    ##########
    ###...###.
    ....###...
    ...###....
    ..###.....
    ..###.....
    ..###.....`),
  8: art(`
    ..######..
    ###....###
    ###....###
    ..######..
    ..######..
    ###....###
    ###....###
    ..######..`),
  9: art(`
    ..######..
    ###....###
    ###....###
    ..########
    ..########
    .......###
    ###....###
    ..######..`),
};

/** A ten-wide glyph is two five-wide CGRAM tiles. */
const splitWide = (glyph) => [
  glyph.map((row) => row.slice(0, 5)),
  glyph.map((row) => row.slice(5, 10)),
];

/** The reference puts the time hard against the left of the glass. */
const DIGIT_COLUMNS = [[0, 1], [2, 3], [5, 6], [7, 8]];
const COLON_COL = 4;

export default {
  name: 'Clone',
  blurb: 'A very heavy 10x8 face on amber with the date beneath: the half-height take on the reference photo (slab is the full one).',
  bus: 'i2c100',
  panel: 'amber',
  fps: 4,

  frame(lcd, api, { t, fields }) {
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    const alloc = new TileAllocator(lcd, 0);

    const codes = digits.map((ch) =>
      splitWide(HEAVY[ch] ?? HEAVY[0]).map((tile) => alloc.add(tile)));
    alloc.flush();

    digits.forEach((ch, k) => {
      const [left, right] = DIGIT_COLUMNS[k];
      lcd.setCursor(left, 0); lcd.data(codes[k][0]);
      lcd.setCursor(right, 0); lcd.data(codes[k][1]);
    });

    // The colon has no tile to live in, so it stays stock ROM -- which is also
    // how the reference reads, its colon far lighter than the digits beside it.
    lcd.setCursor(COLON_COL, 0);
    lcd.data(0x3a);

    lcd.textAt(11, 0, fields.ss);

    // The reference leaves the glass below the time empty, but its digits reach
    // the bottom edge; these only reach halfway, so the date is set underneath
    // to stop the frame hanging off the top of the panel.
    lcd.textAt(0, 1, `${fields.dow} ${fields.dd} ${fields.month}`);
  },
};