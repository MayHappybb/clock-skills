// Domino — the time is two dominoes, and a domino run turns them over.
//
// The hour and the minute each lie face up at the right of the glass, hours
// over minutes, as double-nine dominoes: [1|0] over [0|9] is 10:09. A pip
// half is one cell: pips on a 3x3 lattice of single dots (columns 0, 2, 4,
// rows 0, 2, 4), and the tile's front edge, two solid rows, under them. The
// seam between the two cells is the line down the middle of the domino. Pips
// as holes in a solid tile were tried first: five columns leave no margin,
// the edge holes bit notches out of the outline, and it read as a sprocket.
//
// The rest of the glass is two domino runs seen side on, twelve each, a
// domino a cell: standing is a two-dot slab, fallen a slab leaning on the
// next. The bottom row is the minute's run. A cartoon glove stands its
// dominoes back up one every 3.6 s, so how far it has got is the seconds;
// about one minute in seven a domino will not stay up and it has to try
// again. At :57 it winds up and flicks the first; the wave runs along the
// row a domino every 180 ms, the last one strikes the minute domino, and it
// turns over in the air (on its edge, its black back, its edge: ROM 0xb0
// and 0xff) and lands at :00.0 showing the new minute. The glove gives it a
// thumbs up and starts again.
//
// The top row is the hour's run: one domino is stood back up every five
// minutes (the glove climbs up to do it at :49), so it is full at :59. On
// the hour the glove sets a master domino, a solid cell in both rows, in
// front of both runs, and only its finger comes back to flick it: both rows
// fall together, both dominoes are struck at once, and the hour domino spins
// twice and lands half a second after the minutes. While a domino is in the
// air it shows no number, so the glass never shows a time that is not true:
// 10:59 goes through --:-- and --:00 to 11:00.
//
// Budget: the four pip halves, standing, fallen and the two glove cells are
// eight tiles; every ROM-free extra (the fallen master) appears only while
// the glove is off the glass. Allocation is time first, then the runs, then
// the glove, and a sweep of every frame of a day at 10 fps found no tile
// dropped. Everything is derived from the clock, so any instant renders.

import { TileAllocator } from '../js/kit.js';

const FPS = 10;
const RUN0 = 2, RUN1 = 13;          // run cells, both rows
const HOME = 1;                     // finger cell when flicking the minute run
const DT = 0.18;                    // wave: one domino every 180 ms
const FLIP0 = 59.2;                 // the struck domino leaves its face here
const T0 = FLIP0 - (RUN1 - RUN0) * DT; // first domino of the run tips
const RESTAND = (c) => 3 + (c - RUN0) * 3.6;  // minute run re-stood, one every 3.6 s
const HOUR_RESTAND = 49;            // second at which an hour slab is re-stood

// ------------------------------------------------------------------ glyphs

const g = (s) => s.trim().split(/\s+/);

// Pips on a 3x3 lattice, dot columns 0, 2, 4 and rows 0, 2, 4, numbered
// 0..8 in reading order: the double-nine layouts.
const PIPS = {
  0: [], 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8], 7: [0, 2, 3, 4, 5, 6, 8], 8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};
/** A domino half lying face up: pips, and its front edge. Landing, the edge thins. */
function face(d, lift = 0) {
  const rows = Array.from({ length: 8 }, () => [...'.....']);
  for (const p of PIPS[d]) rows[Math.floor(p / 3) * 2][(p % 3) * 2] = '#';
  rows[6] = [...'#####']; rows[7] = [...'#####'];
  if (lift) rows[7] = [...'.....'];
  return rows.map((r) => r.join(''));
}

const STAND = g('.##.. .##.. .##.. .##.. .##.. .##.. .##.. .##..');
const LEAN = g('...## ...## ..##. ..##. .##.. .##.. ##... ##...');
// The hour's master domino is a solid cell in both rows (ROM 0xff, free);
// fallen, it leans its whole height on the first domino of both runs.
const TALL_TOP = g('..### ..### ..### .###. .###. .###. ###.. ###..');
const TALL_BOT = g('###.. ###.. ###.. ##... ##... ##... ##... ##...');
const BACK = 0xff, EDGE = 0xb0;

// A cartoon glove pointing right, two cells: cuff and back of the hand,
// then the knuckles and the index finger, which reaches the edge of its cell
// when it pokes. The cell seam falls at the wrist.
const GLOVE = [
  '..... .....',
  '...## #....',
  '#.### ###..',
  '#.### ####.',
  '#.### ###..',
  '#.### ##...',
  '...## #....',
  '..... .....',
];
const GLOVE_POKE = GLOVE.map((l, r) => (r === 3 ? '#.### #####' : l));
// Thumbs up, for a domino that landed.
const THUMB = [
  '..... ..#..',
  '..... .##..',
  '...## ####.',
  '#.### ####.',
  '#.### ####.',
  '#.### ###..',
  '...## ###..',
  '..... .....',
];
const halves = (art) => [art.map((l) => l.slice(0, 5)), art.map((l) => l.slice(6, 11))];
const shift = (tile, dy) => tile.map((_, r) => tile[r - dy] ?? '.....');

// ------------------------------------------------------------------ script

/**
 * About one minute in seven a domino will not stay up: it is stood, sways
 * and tips back onto its neighbour, and the glove shakes and stands it again.
 * Returns that domino's cell, or 0.
 */
const OOPS_FALL = 0.5, OOPS_AGAIN = 1.6;
function oopsCell(h, m) {
  const n = h * 60 + m;
  return n % 7 === 5 ? 4 + (Math.floor(n / 7) % 8) : 0;
}

/** Where the hand is: { row, f (finger cell), poke, bob } or null. */
function handAt(h, m, s) {
  const hourMin = m % 5 === 4;
  const home = m === 59 ? 0 : HOME;
  const bob = Math.floor(s) % 2;
  if (s < 0.3) return null;
  if (s < 0.6) return { row: 1, f: 0, thumb: true };
  if (s < 1.7) return { row: 1, f: 1, thumb: true, bob: Math.floor(s * 4) % 2 };
  if (s < 2.0) return { row: 1, f: 0, bob };
  // Re-standing the minute run, a domino every 3.6 s.
  const last = RESTAND(RUN1);
  if (s < last + 0.6) {
    let c = RUN0;
    while (c < RUN1 && s >= RESTAND(c) + (c === oopsCell(h, m) ? OOPS_AGAIN + 0.6 : 0.6)) c++;
    const t = RESTAND(c);
    const f = s < t - 0.8 && c > RUN0 ? c - 2 : c - 1;   // steps up 0.8 s before
    if (c === oopsCell(h, m) && s >= t + OOPS_FALL - 0.1 && s < t + OOPS_AGAIN + 0.25) {
      // It fell back: the glove shakes, then pokes again.
      const again = Math.abs(s - t - OOPS_AGAIN) < 0.25;
      return { row: 1, f, poke: again, bob: again ? 0 : Math.floor(s * 6) % 2 };
    }
    return { row: 1, f, poke: Math.abs(s - t) < 0.25, bob: s < t - 0.8 ? bob : 0 };
  }
  let t, f = RUN1 - 1;
  const walk = (from, to, t0, step) => {
    const n = Math.min(Math.abs(to - from), Math.max(0, Math.floor((s - t0) / step)));
    return from + Math.sign(to - from) * n;
  };
  if (hourMin) {
    const target = (m + 1) / 5;               // hour slab k stands at cell k + 1
    if (s < 44) return { row: 1, f, bob };
    if (s < HOUR_RESTAND + 0.6) {
      return { row: 0, f: walk(f, target, 44, 0.3), poke: Math.abs(s - HOUR_RESTAND) < 0.25, bob: 0 };
    }
    f = target; t = HOUR_RESTAND + 0.6;
  } else if (s < 46) return { row: 1, f, bob };
  else t = 46;
  const jab = m === 59 ? 56.84 : 57.0;
  if (s < jab - 1.2) return { row: 1, f: walk(f, home, t, 0.3), bob: 0 };
  // Wind up, jab, and away.
  if (s < jab - 0.6) return { row: 1, f: home, bob };
  if (s < jab) return { row: 1, f: home - 1, bob: 0 };
  if (s < jab + 0.2) return { row: 1, f: home, poke: true, bob: 0 };
  if (m === 59) return null;                // gone at once: the master needs the room
  if (s < jab + 0.3) return { row: 1, f: home, poke: true, bob: 0 };
  if (s < jab + 0.6) return { row: 1, f: home - 1, bob: 0 };
  if (s < jab + 0.9) return { row: 1, f: home - 2, bob: 0 };
  return null;
}

/** Minute-run domino at cell c: standing? */
function minuteUp(c, h, m, s) {
  if (s >= T0 + (c - RUN0) * DT) return false;
  const t = RESTAND(c);
  if (c === oopsCell(h, m) && s >= t + OOPS_FALL && s < t + OOPS_AGAIN) return false;
  return s >= t;
}

/** Hour-run domino at cell c (the k-th, k = c - 1, re-stood in minute 5k - 1). */
function hourUp(c, m, s) {
  const when = 5 * (c - 1) - 1;
  if (m === 59 && s >= T0 + (c - RUN0) * DT) return false;
  return m > when || (m === when && s >= HOUR_RESTAND);
}

/**
 * A struck domino turning over in the air: on its edge, its back, its edge.
 * `u` is seconds since it was struck (negative: not yet); `turns` how many
 * times it shows its back. It lands, with a bounce, when the turns are done.
 */
const PHASE = 0.27;
function flipCells(u, turns, digits) {
  const air = (2 * turns + 1) * PHASE;
  if (u >= 0 && u < air) return Math.floor(u / PHASE) % 2 ? [BACK, BACK] : [EDGE, EDGE];
  if (u >= air && u < air + 0.25) return digits.map((d) => face(d, 1));
  return digits.map((d) => face(d));
}

// ------------------------------------------------------------------ frame

export default {
  name: 'Domino',
  blurb: 'The time as two double-nine dominoes; a glove re-stands a domino run all minute, flicks it, and the struck tile turns over.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields }) {
    const { m } = fields;
    const s = fields.s + fields.ms / 1000;

    // cells[row][col] = ROM code or tile; prio decides who gets a slot first.
    const cells = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const prio = [Array(16).fill(9), Array(16).fill(9)];
    const put = (col, row, what, p) => {
      if (col < 0 || col > 15) return;
      cells[row][col] = what; prio[row][col] = p;
    };

    // The time: hours over minutes, a lying domino each.
    const dig = (str) => [Number(str[0]), Number(str[1])];
    // Seconds since each was struck: in this minute, or in the last one.
    const struck = s >= FLIP0 ? s - FLIP0 : s + 60 - FLIP0;
    const hourStruck = m === 59 ? s - FLIP0 : m === 0 ? s + 60 - FLIP0 : -1;
    flipCells(hourStruck, 2, dig(fields.hh)).forEach((w, i) => put(14 + i, 0, w, 0));
    flipCells(struck, 1, dig(fields.mm)).forEach((w, i) => put(14 + i, 1, w, 0));

    // The runs.
    for (let c = RUN0; c <= RUN1; c++) {
      put(c, 1, minuteUp(c, fields.h, m, s) ? STAND : LEAN, 1);
      put(c, 0, hourUp(c, m, s) ? STAND : LEAN, 1);
    }
    // The hour's master domino, both rows tall, at cell 1.
    if (m === 59 && s >= 53.6) {
      const fallen = s >= 57.04;
      put(1, 0, fallen ? TALL_TOP : 0xff, 3);
      put(1, 1, fallen ? TALL_BOT : 0xff, 3);
    } else if (m === 0 && s < 0.6) {
      put(1, 0, TALL_TOP, 3); put(1, 1, TALL_BOT, 3);
    }

    // The hand, in front of whatever it covers.
    const hand = handAt(fields.h, m, s);
    if (hand) {
      const dy = hand.bob ? 1 : 0;
      const [a, b] = halves(hand.thumb ? THUMB : hand.poke ? GLOVE_POKE : GLOVE);
      put(hand.f - 1, hand.row, shift(a, dy), 2);
      put(hand.f, hand.row, shift(b, dy), 2);
    }

    const alloc = new TileAllocator(lcd, 0);
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (let p = 0; p <= 9; p++) {
      for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
        if (prio[row][col] !== p) continue;
        const w = cells[row][col];
        codes[row][col] = Array.isArray(w) ? alloc.add(w) ?? 0x20 : w;
      }
    }
    alloc.flush();
    for (let row = 0; row < 2; row++) {
      lcd.setCursor(0, row);
      codes[row].forEach((c) => lcd.data(c));
    }
  },
};
