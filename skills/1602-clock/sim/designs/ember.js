// Ember — a heavy display face on amber, after the reference photograph.
//
// The reference shows time filling the glass in a fat geometric typeface with
// small stock-ROM seconds tucked to the right. What matters about it here is
// the weight: the factory ROM digits are drawn on a one-dot stroke, which is
// why every 1602 clock looks thin and identical. Drawing the face ourselves is
// the whole point.
//
// The budget decides the proportions. A digit two cells wide AND two rows tall
// would be four tiles, and four of those is sixteen -- twice what CGRAM holds.
// At two cells wide and one row tall it is two tiles each, so four digits land
// on exactly eight, the ceiling, for any time you can throw at it. The face is
// wide and heavy instead of wide and tall, and that is the constraint talking.

import { TileAllocator, art, ease, clockFields } from '../js/kit.js';

/** How long a digit takes to shutter over, in seconds. */
// 0.6 s: the shutter moves one row per ~75 ms, slow enough for the 150 ms
// glass to show it as a shutter rather than a fade. (It was 0.26 s.)
const WIPE = 0.6;

/**
 * Seconds since the digit `index` places from the right last changed, where 0
 * is the ones of minutes. Derived from the wall clock so any instant renders on
 * its own, with no need to replay the seconds before it.
 */
function sinceChange(index, fields) {
  const { h, m, s, ms } = fields;
  const sub = ms / 1000;
  switch (index) {
    case 0: return s + sub;
    case 1: return (m % 10) * 60 + s + sub;
    case 2: return m * 60 + s + sub;
    default: return (h % 10) * 3600 + m * 60 + s + sub;
  }
}

/** 10 dots wide, 8 tall: a bold geometric face with two-dot strokes. */
const BOLD = {
  0: art(`
    .########.
    ##......##
    ##......##
    ##......##
    ##......##
    ##......##
    ##......##
    .########.`),
  1: art(`
    ...###....
    ..####....
    .##.##....
    ....##....
    ....##....
    ....##....
    ....##....
    .########.`),
  2: art(`
    .########.
    ##......##
    ......###.
    ....####..
    ..####....
    .###......
    ##........
    ##########`),
  3: art(`
    .########.
    ##......##
    ......###.
    ....####..
    ....####..
    ......###.
    ##......##
    .########.`),
  4: art(`
    .....###..
    ...##.##..
    ..##..##..
    .##...##..
    ##....##..
    ##########
    ......##..
    ......##..`),
  5: art(`
    ##########
    ##########
    ##........
    ##........
    ##########
    ##......##
    ##......##
    .########.`),
  6: art(`
    .########.
    .########.
    ##........
    ##........
    ##########
    ##......##
    ##......##
    .########.`),
  7: art(`
    ##########
    ##########
    ##.....##.
    ....##....
    ...##.....
    ..##......
    ..##......
    ..##......`),
  8: art(`
    .########.
    ##......##
    ##......##
    .########.
    .########.
    ##......##
    ##......##
    .########.`),
  9: art(`
    .########.
    ##......##
    ##......##
    .########.
    .########.
    .......##.
    ##.....##.
    .########.`),
};

/** Split a ten-wide glyph into the two five-wide CGRAM tiles it needs. */
const splitWide = (glyph) => [
  glyph.map((row) => row.slice(0, 5)),
  glyph.map((row) => row.slice(5, 10)),
];

/** Cells occupied by "HH:MM", leaving the colon its own cell. */
const DIGIT_COLUMNS = [[0, 1], [2, 3], [5, 6], [7, 8]];
const COLON_COL = 4;

export default {
  name: 'Ember',
  blurb: 'A bold ten-by-eight geometric face on amber, with stock-ROM seconds.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { date, fields }) {
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    // What each digit showed a minute ago, so 59 -> 00 shutters from 5, not 9.
    const prev = clockFields(new Date(date.getTime() - 60000));
    const was = [prev.hh[0], prev.hh[1], prev.mm[0], prev.mm[1]];
    const alloc = new TileAllocator(lcd, 0);

    // Two tiles per digit for the face, and up to two more for the shutter
    // that wipes it in. CGRAM is eight tiles however you spend them, and four
    // digits already want eight, so a shutter can only exist when the time
    // happens to repeat a digit -- "02:30" has two zeros, which frees two
    // tiles. Build the face first so it is always correct, then take the
    // shutter only if a slot is genuinely left over.
    const faces = digits.map((ch) => splitWide(BOLD[ch] ?? BOLD[0]));

    // A tile belongs to a slot, and every cell holding that code redraws from
    // it. So a turning digit's tiles may only be redrawn in place if no other
    // visible digit is using them -- otherwise the shutter would smear across
    // its twin. Counting usage first is what makes the transition available at
    // all: adding four shutters on top of four digits would need sixteen slots,
    // but swapping them in for tiles nobody else wants needs none.
    const usage = new Map();
    for (const halves of faces) {
      for (const tile of halves) {
        const key = tile.join('/');
        usage.set(key, (usage.get(key) ?? 0) + 1);
      }
    }

    const tiles = digits.map((ch, k) => {
      const elapsed = sinceChange(3 - k, fields);
      const exclusive = faces[k].every((tile) => usage.get(tile.join('/')) === 1);
      const previous = was[k] !== ch ? BOLD[was[k]] : null;
      if (elapsed >= WIPE || !exclusive || !previous) return faces[k];

      const cutoff = Math.round(ease.outCubic(elapsed / WIPE) * 8);
      return splitWide(previous).map((half, i) =>
        half.map((row, r) => (r < cutoff ? faces[k][i][r] : row)));
    });

    const codes = tiles.map((halves) => halves.map((tile) => alloc.add(tile)));
    alloc.flush();

    digits.forEach((ch, k) => {
      const [left, right] = DIGIT_COLUMNS[k];
      lcd.setCursor(left, 0);
      lcd.data(codes[k][0]);
      lcd.setCursor(right, 0);
      lcd.data(codes[k][1]);
    });

    // The colon stays stock ROM, which costs nothing and keeps the face honest
    // about where the drawn type ends and the factory font begins.
    lcd.setCursor(COLON_COL, 0);
    lcd.data(0x3a);

    // Seconds, small and to the right, as in the reference.
    lcd.textAt(11, 0, fields.ss);

    // Bottom row: the date, and the minute drawn as a growing underline. The ROM
// underscore sits low in the cell, so five of them read as one thin rule
// rather than five blocks.
    lcd.textAt(0, 1, `${fields.dow} ${fields.dd} ${fields.month}`);
    const step = Math.floor(fields.s / 12);
    for (let i = 0; i < 5; i++) {
      lcd.setCursor(11 + i, 1);
      lcd.data(i <= step ? 0x5f : 0x20);
    }
  },
};