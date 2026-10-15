// Focus — two digits at the reference photograph's true size.
//
// This is the largest a digit can be when each digit is its own drawn
// picture. A digit two cells wide and two rows tall is four CGRAM tiles; two
// digits is eight, which is exactly what the controller holds. Four digits
// drawn this way would need up to sixteen. (Four digits this tall *are*
// possible when they are assembled from parts shared across digits -- see
// `slab` -- at the cost of the curves this face has.)
//
// The two big digits carry the minutes, since that is the unit that actually
// changes while you are looking at it. Hours and seconds sit to their right as
// small stock-ROM text, which costs no CGRAM at all.
//
// At a minute boundary the turning digit shutters over. It can afford to: two
// digits leave no spare slot, but each digit's four tiles are private to it, so
// they can be redrawn in place without disturbing the other one.

import { TileAllocator, art, ease, clockFields } from '../js/kit.js';

const WIPE = 0.8; // seconds to shutter over: 16 rows, ~50 ms a row, as a sweep the glass can follow

/** 10 dots wide, 16 tall, three-dot strokes: the reference's weight on a two-row box. */
const BIG = {
  0: art(`
    ..######..
    .########.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    .########.
    ..######..`),
  1: art(`
    ....###...
    ...####...
    ..#####...
    .######...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    ....###...
    .########.
    .########.`),
  2: art(`
    ..######..
    .########.
    ###....###
    ###....###
    ......####
    .....####.
    ....####..
    ...####...
    ..####....
    .####.....
    ####......
    ###.......
    ###.......
    ###.......
    ##########
    ##########`),
  3: art(`
    ..######..
    .########.
    ###....###
    ......####
    ....######
    ...#######
    ...#######
    ....######
    ......####
    ......####
    ......####
    ......####
    ###....###
    ###....###
    .########.
    ..######..`),
  4: art(`
    ......###.
    ....#####.
    ..#######.
    .####.###.
    ###...###.
    ###...###.
    ###...###.
    ###...###.
    ##########
    ##########
    ......###.
    ......###.
    ......###.
    ......###.
    ......###.
    ......###.`),
  5: art(`
    .########.
    .########.
    ###.......
    ###.......
    ###.......
    ###.......
    ########..
    .########.
    ......####
    ......####
    ......####
    ......####
    ###....###
    ###....###
    .########.
    ..######..`),
  6: art(`
    ...#####..
    ..#####...
    .###......
    ###.......
    ###.......
    ###.......
    ########..
    .########.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    .########.
    ..######..`),
  7: art(`
    ##########
    ##########
    #####..###
    ....####..
    ...####...
    ..####....
    ..###.....
    ..###.....
    .###......
    .###......
    .###......
    .###......
    .###......
    .###......
    .###......
    .###......`),
  8: art(`
    ..######..
    .########.
    ###....###
    ###....###
    ###....###
    ###....###
    .########.
    ..######..
    ..######..
    .########.
    ###....###
    ###....###
    ###....###
    ###....###
    .########.
    ..######..`),
  9: art(`
    ..######..
    .########.
    ###....###
    ###....###
    ###....###
    ###....###
    ###....###
    .########.
    ..########
    ......####
    ......####
    ......####
    ......####
    ......####
    ......####
    ......####`),
};

/** The four tiles of a two-by-two-cell glyph, in reading order: TL TR / BL BR. */
const quadrants = (glyph) => [
  glyph.slice(0, 8).map((r) => r.slice(0, 5)),
  glyph.slice(0, 8).map((r) => r.slice(5, 10)),
  glyph.slice(8, 16).map((r) => r.slice(0, 5)),
  glyph.slice(8, 16).map((r) => r.slice(5, 10)),
];

/** Left-hand cell of each big digit: hard against the left, as in the reference. */
const DIGIT_COLS = [0, 2];

/** Seconds since each minute digit last turned: 0 is the ones, 1 the tens. */
function sinceChange(index, fields) {
  const sub = fields.ms / 1000;
  return index === 0
    ? fields.s + sub
    : (fields.m % 10) * 60 + fields.s + sub;
}

export default {
  name: 'Focus',
  blurb: 'The minutes as two huge drawn digits (four tiles each, all eight), the rest spelled out: MIN PAST 10, AND 37 SEC.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { date, fields }) {
    const digits = [fields.mm[0], fields.mm[1]];
    // What each digit showed a minute ago, so 59 -> 00 shutters from 5, not 9.
    const prev = clockFields(new Date(date.getTime() - 60000));
    const was = [prev.mm[0], prev.mm[1]];
    const faces = digits.map((ch) => quadrants(BIG[ch] ?? BIG[0]));

    // How many of the two digits want each tile. A tile is only safe to redraw
    // for a shutter if the other digit is not using it.
    const usage = new Map();
    for (const q of faces) for (const tile of q) {
      const key = tile.join('/');
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }

    const tiles = digits.map((ch, k) => {
      const elapsed = sinceChange(1 - k, fields); // k=1 is the ones of minutes
      const exclusive = faces[k].every((tile) => usage.get(tile.join('/')) === 1);
      const previous = was[k] !== ch ? BIG[was[k]] : null;
      if (elapsed >= WIPE || !exclusive || !previous) return faces[k];

      // Top-down shutter: the incoming digit's rows replace the outgoing one's.
      const cutoff = Math.round(ease.outCubic(elapsed / WIPE) * 16);
      const merged = previous.map((row, r) => (r < cutoff ? BIG[ch][r] : row));
      return quadrants(merged);
    });

    const alloc = new TileAllocator(lcd, 0);
    const codes = tiles.map((q) => q.map((tile) => alloc.add(tile)));
    alloc.flush();

    digits.forEach((ch, k) => {
      const col = DIGIT_COLS[k];
      const [tl, tr, bl, br] = codes[k];
      lcd.setCursor(col, 0); lcd.data(tl);
      lcd.setCursor(col + 1, 0); lcd.data(tr);
      lcd.setCursor(col, 1); lcd.data(bl);
      lcd.setCursor(col + 1, 1); lcd.data(br);
    });

    // The rest of the time as words, in stock ROM: "09 | MIN PAST 10 /
    // AND 37 SEC". It reads the way the time is said, and the plain small
    // text makes the two big digits look bigger still.
    lcd.textAt(5, 0, `MIN PAST ${fields.hh}`);
    lcd.textAt(5, 1, `AND ${fields.ss} SEC`);
  },
};