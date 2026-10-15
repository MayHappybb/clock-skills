// Cipher — the time decodes itself out of the ROM's katakana.
//
// The A00 ROM carries a full set of half-width katakana (0xA6-0xDD), the very
// glyphs that falling-code screens are made of. They cost nothing. So the
// noise is free, and CGRAM is spent only on what has to look designed: the
// time, in a bold 5x7 face, six tiles at most.
//
// When a digit changes, its cell runs through a few katakana before the new
// digit locks in: two for the seconds' ones and one more for each cell
// further left, so a change that reaches the hours ripples in from the right. Each glyph holds for 150 ms, the
// liquid crystal's own switching time, so each one actually appears.
//
// The date underneath is encrypted most of the minute. Once a minute it
// decodes, a sweep from left to right, holds for twenty seconds, and then
// scrambles back to noise in the same order. A cell of the noise mutates
// every half second or so, so the cipher is never quite still.

import { TileAllocator, noise, art } from '../js/kit.js';

const TIME_COL = 4;                    // HH:MM:SS centred: 8 cells, 4-11
const STEP = 0.15;                     // seconds each scramble glyph holds
const KANA = Array.from({ length: 0xdd - 0xa6 + 1 }, (_, i) => 0xa6 + i);
const DECODE_AT = 8;                   // seconds into the minute the date starts to decode
const HOLD = 20;                       // seconds it stays readable
const SWEEP = 0.12;                    // seconds between neighbouring cells locking

/** Bold 5x7 digits, sitting on the ROM baseline (row 7 empty, like the kana). */
const BOLD = {
  0: art(`.###.\n##.##\n##.##\n##.##\n##.##\n##.##\n.###.\n.....`),
  1: art(`..##.\n.###.\n..##.\n..##.\n..##.\n..##.\n.####\n.....`),
  2: art(`.###.\n##.##\n...##\n..##.\n.##..\n##...\n#####\n.....`),
  3: art(`####.\n...##\n...##\n.###.\n...##\n...##\n####.\n.....`),
  4: art(`...##\n..###\n.#.##\n##.##\n#####\n...##\n...##\n.....`),
  5: art(`#####\n##...\n####.\n...##\n...##\n##.##\n.###.\n.....`),
  6: art(`.###.\n##...\n####.\n##.##\n##.##\n##.##\n.###.\n.....`),
  7: art(`#####\n...##\n..##.\n..##.\n.##..\n.##..\n.##..\n.....`),
  8: art(`.###.\n##.##\n##.##\n.###.\n##.##\n##.##\n.###.\n.....`),
  9: art(`.###.\n##.##\n##.##\n.####\n...##\n...##\n.###.\n.....`),
};

/** A katakana for `cell` at scramble step `n`, deterministic. */
const kana = (cell, n) => KANA[Math.floor(noise(cell * 7.13 + n * 1.618, 3) * KANA.length)];

/**
 * How many time cells, counting from the right, changed at the start of this
 * second: 1 when only the seconds' ones turned, up to 6 at midnight.
 */
function reach({ h, m, s }) {
  if (s % 10) return 1;
  if (s) return 2;
  if (m % 10) return 3;
  if (m) return 4;
  return h % 10 ? 5 : 6;
}

export default {
  name: 'Cipher',
  blurb: 'Bold time digits that decode through ROM katakana as they change; a date that decrypts once a minute.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,

  frame(lcd, api, { fields }) {
    const { s, ms } = fields;
    const sub = ms / 1000;
    const step = Math.floor(sub / STEP);
    const alloc = new TileAllocator(lcd, 0);
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];

    // ---- time: HH:MM:SS, the changed digits scrambling before they lock.
    const digits = [...fields.hh, ...fields.mm, ...fields.ss];
    const changed = reach(fields);
    const cols = [0, 1, 3, 4, 6, 7].map((c) => TIME_COL + c);
    digits.forEach((d, i) => {
      const fromRight = 5 - i;                       // 0 = seconds' ones
      // Two glyphs for the seconds' ones, one more per cell to the left, so a
      // change that reaches the hours ripples in from the right.
      const glyphs = fromRight < changed ? 2 + fromRight : 0;
      grid[0][cols[i]] = step < glyphs ? kana(i, s * 10 + step) : alloc.add(BOLD[d]);
    });
    grid[0][TIME_COL + 2] = 0x3a;
    grid[0][TIME_COL + 5] = 0x3a;

    // ---- the date: noise, decoded for HOLD seconds each minute.
    const date = ` ${fields.dow} ${fields.dd} ${fields.month} ${fields.year}`.padEnd(16);
    const sec = s + sub;
    [...date].forEach((ch, i) => {
      const lockAt = DECODE_AT + i * SWEEP;          // when this cell decodes
      const loseAt = DECODE_AT + HOLD + i * SWEEP;   // and when it scrambles again
      const clear = sec >= lockAt && sec < loseAt;
      if (clear) { grid[1][i] = ch.charCodeAt(0); return; }
      // Noise mutates slowly: each cell picks a new glyph every 0.4-0.9 s.
      const period = 0.4 + noise(i, 9) * 0.5;
      const n = Math.floor((sec + noise(i, 5) * 3) / period);
      // Leave a few cells dark, so the noise has texture rather than a wall.
      grid[1][i] = noise(i * 3.7 + n, 11) < 0.25 ? 0x20 : kana(16 + i, n);
    });

    alloc.flush();
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
