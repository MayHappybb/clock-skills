// Candle — a candle clock, the module stood on its end.
//
// The module is turned a quarter turn (`rotate: 90`), so the glass is 16 dots
// wide and 80 tall. A taper candle stands in a chamberstick and burns down one
// dot a minute through the hour: it is full at :00 and a one-dot stub at :59.
// The glass's own seams, a missing dot row every five, cross the candle at
// every fifth minute, which is exactly the graduation a real candle clock has
// painted on it. The time is in the saucer's foot as 3x5 digit pairs: "10"
// fits one viewer cell (8 dots wide), so HH and MM cost one tile each.
//
// The flame flickers through a handful of shapes, each held 180 ms or more.
// Once a minute a bead of wax spills over the rim and runs down the side, a
// dot every 200 ms, and joins the puddle on the saucer, which grows through the
// hour. In the last minute the flame gutters. On the hour the stub goes out in
// a wisp of smoke, a fresh candle is lowered in a cell at a time, and a match
// comes in from the left and lights it.
//
// Budget. The candle is the right-hand viewer column, exactly eight dots wide,
// so every cell of its body is ROM 0xff and free; only the cell with its top
// in it is a tile. Above it the flame and wick take one or two, the saucer
// two, the time two, and the running drip one: eight at most. The match and
// the smoke only appear while there is no drip.
//
// Tried and dropped: a candle centred across both columns. It looks better on
// paper, but every cell of it, flame included, is then two tiles, and the
// frame needed eleven.

import { TileAllocator, portraitTile, noise } from '../js/kit.js';

const FPS = 12;
const W = 16, H = 80;

// -------------------------------------------------------------- the picture

const blank = () => Array.from({ length: H }, () => new Uint8Array(W));
const set = (px, x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = 1; };
const clear = (px, x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = 0; };
/** Paint rows of '#' with their top-left at (x0, y0). */
const paint = (px, rows, x0, y0) => rows.forEach((line, r) =>
  [...line].forEach((ch, i) => { if (ch === '#') set(px, x0 + i, y0 + r); }));

/**
 * Turn the 16x80 picture into cells and write them. A solid cell is ROM 0xff
 * and an empty one a space, both free; anything else is a tile. `first` lists
 * viewer cells [vc, vr] to allocate before the rest, so the time and the
 * saucer are never the ones that miss out.
 */
function emit(lcd, px, first) {
  const alloc = new TileAllocator(lcd, 0);
  const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];      // [vc][vr]
  const view = (vc, vr) => Array.from({ length: 5 }, (_, i) =>
    Array.from({ length: 8 }, (_, x) => (px[vr * 5 + i][vc * 8 + x] ? '#' : '.')).join(''));
  const order = [...first];
  for (let vr = 0; vr < 16; vr++) for (const vc of [0, 1]) {
    if (!order.some(([c, r]) => c === vc && r === vr)) order.push([vc, vr]);
  }
  for (const [vc, vr] of order) {
    const v = view(vc, vr);
    if (v.every((l) => l === '########')) codes[vc][vr] = 0xff;
    else if (v.every((l) => l === '........')) codes[vc][vr] = 0x20;
    else codes[vc][vr] = alloc.add(portraitTile(v)) ?? 0x20;
  }
  alloc.flush();
  // Module row 0 is the right viewer column, row 1 the left; module column is vr.
  for (const [row, vc] of [[0, 1], [1, 0]]) {
    lcd.setCursor(0, row);
    for (let vr = 0; vr < 16; vr++) lcd.data(codes[vc][vr]);
  }
}

// 3x5 digits, two to a viewer cell.
const DIGIT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};

// ------------------------------------------------------------------- scene

const CANDLE_X = 8;                    // the right-hand column, x 8-15
const FULL_TOP = 10;                   // the top at :00; it burns a dot a minute
const BOTTOM = 69;                     // the candle's last row
const WICK_X = 11;
const SAUCER_Y = 70;                   // the puddle row; the saucer is under it
const TIME_Y = 75;

// The candlestick, from y 71 (the row above is the candle's socket and the
// puddle): a broad dish, a short stem and the foot. A chamberstick with a
// finger loop was tried; at 4x4 dots the loop read as a letter.
const SAUCER = [
  '################',
  '.##############.',
  '.......###......',
  '...##########...',
];

// Flame shapes, tip first, in the candle column's own x (0-7, wick at 3).
// Three dots wide at most: in portrait the dots are 0.70 mm across and 0.60
// mm down, so a five-wide flame came out as a squat diamond.
const FLAMES = {
  calm: ['...#....', '...#....', '..###...', '..###...', '..###...', '...#....'],
  left: ['..#.....', '..#.....', '..##....', '..###...', '..###...', '...#....'],
  right: ['....#...', '....#...', '...##...', '..###...', '..###...', '...#....'],
  tall: ['...#....', '...#....', '...#....', '..###...', '..###...', '..###...', '...#....'],
  short: ['...#....', '..###...', '..###...', '...#....'],
  ember: ['...#....', '..###...'],
  spark: ['...#....'],
};

/** The flame for a moment: mostly calm, now and then a lean or a lick upward. */
function flicker(T) {
  const k = Math.floor(T / 0.18), n = noise(k, 3);
  return n < 0.45 ? 'calm' : n < 0.6 ? 'left' : n < 0.75 ? 'right' : n < 0.88 ? 'tall' : 'short';
}

/** Draw a flame whose base sits just above the wick at `top`. */
function flame(px, name, top) {
  const rows = FLAMES[name];
  set(px, WICK_X, top - 1);                          // the wick
  paint(px, rows, CANDLE_X, top - 1 - rows.length);
}

/** The candle body from `top` down, with a melt pool cupped in its top row. */
function candle(px, top) {
  for (let y = Math.max(top, 0); y <= BOTTOM; y++) for (let x = CANDLE_X; x < W; x++) set(px, x, y);
  if (top >= 0) for (let x = CANDLE_X + 2; x <= CANDLE_X + 5; x++) clear(px, x, top);
}

// --------------------------------------------------------------- the drips

/** Second of minute `m` its drip spills, in the hour numbered `hk`. None in the first or last. */
const spillAt = (hk, m) => (m < 1 || m > 58 ? null : 12 + noise(hk * 61 + m, 7) * 34);
const DRIP_STEP = 0.2;                 // seconds per dot as it runs down

/** Drips that have reached the saucer this hour, by second `S` of it. */
function landed(hk, S) {
  let n = 0;
  for (let m = 1; m <= 58; m++) {
    const at = spillAt(hk, m);
    if (m * 60 + at + (BOTTOM - (FULL_TOP + m)) * DRIP_STEP <= S) n++;
  }
  return n;
}

// -------------------------------------------------------------- the design

export default {
  name: 'Candle',
  blurb: 'Portrait. A candle burns a dot a minute through the hour, dripping wax; on the hour it goes out and a fresh one is lit.',
  bus: 'i2c100',
  panel: 'amber',
  fps: FPS,
  rotate: 90,

  frame(lcd, api, { fields, date }) {
    const px = blank();
    const T = date.getTime() / 1000;
    const S = fields.m * 60 + fields.s + fields.ms / 1000;     // seconds into the hour
    const hk = Math.floor(T / 3600);

    // Saucer, puddle and the time on its foot.
    paint(px, SAUCER, 0, SAUCER_Y + 1);
    for (let x = CANDLE_X; x < W; x++) set(px, x, SAUCER_Y);
    // The puddle spreads along the saucer, never up the side: the row above
    // is another cell, and a ninth tile.
    const puddle = Math.min(7, Math.ceil(landed(hk, S) / 8));
    for (let i = 0; i < puddle; i++) set(px, CANDLE_X - 1 - i, SAUCER_Y);
    [...fields.hh].forEach((d, i) => paint(px, DIGIT[d], i * 4, TIME_Y));
    [...fields.mm].forEach((d, i) => paint(px, DIGIT[d], 9 + i * 4, TIME_Y));

    const SMOKE = 3.0, LOWERED = SMOKE + 2.4, LIT = LOWERED + 2.4;

    if (S < SMOKE) {
      // The stub is out: a wisp of smoke curls up from the wick.
      candle(px, BOTTOM);
      for (let k = 0; k < 14; k++) {
        const age = S - k * 0.2;
        if (age < 0 || age > 1.6) continue;
        const y = BOTTOM - 2 - Math.floor(age / 0.15);
        set(px, WICK_X + Math.round(Math.sin(age * 4 + k * 0.7) * 1.6), y);
      }
    } else if (S < LOWERED) {
      // A fresh candle is lowered in, a cell at a time, onto the old stub.
      const top = FULL_TOP - 60 + 5 * Math.min(12, Math.floor((S - SMOKE) / 0.2) + 1);
      candle(px, BOTTOM);
      candle(px, top);
      for (let y = top + 60; y <= BOTTOM - 1; y++) for (let x = CANDLE_X; x < W; x++) clear(px, x, y);
      set(px, WICK_X, top - 1);
    } else if (S < LIT) {
      // A match comes in from the left, the wick catches, the match goes.
      candle(px, FULL_TOP);
      const u = S - LOWERED;
      const head = u < 0.9 ? -2 + 2 * Math.floor(u / 0.15) : u < 1.5 ? 9 : 9 - 2 * Math.floor((u - 1.5) / 0.15);
      const y = FULL_TOP - 2;
      for (let x = head - 6; x < head; x++) set(px, x, y + 1);      // the stick
      paint(px, ['##', '##'], head, y);                              // the head
      if (Math.floor(T / 0.18) % 2) set(px, head, y - 1); else set(px, head + 1, y - 2);
      if (u >= 0.9) flame(px, u < 1.2 ? 'spark' : u < 1.6 ? 'ember' : 'short', FULL_TOP);
      else set(px, WICK_X, FULL_TOP - 1);
    } else {
      const top = FULL_TOP + fields.m;
      candle(px, top);
      // The last minute: the flame gutters, sputtering lower and going out more often.
      if (fields.m === 59) {
        const k = Math.floor(T / 0.2), n = noise(k, 9), p = fields.s / 60;
        flame(px, n < 0.25 + 0.5 * p ? 'spark' : n < 0.8 ? 'ember' : 'short', top);
      } else flame(px, flicker(T), top);

      // This minute's drip, running down the left side to the saucer.
      const at = spillAt(hk, fields.m);
      if (at !== null && fields.s + fields.ms / 1000 >= at) {
        const y = top + 1 + Math.floor((fields.s + fields.ms / 1000 - at) / DRIP_STEP);
        if (y <= BOTTOM) set(px, CANDLE_X - 1, y);
      }
    }

    // The time and the saucer first, then whatever cell the candle's top is in.
    emit(lcd, px, [[0, 15], [1, 15], [0, 14], [1, 14]]);
  },
};
