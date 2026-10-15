// Monolith — the typeface is the design.
//
// Each digit is five dots wide and sixteen tall, so it spans both character
// rows. That is only possible because a "character" is just a code into CGRAM:
// four digits need eight tiles, four for their top halves and four for their
// bottom halves.
//
// The trap this design exists to demonstrate: CGRAM is shared, and the display
// resolves a cell's code on every refresh. You cannot draw a glyph's top half,
// then overwrite those slots with the bottom half and draw row two -- the first
// row changes underneath you. Every tile a frame needs must be resident at the
// same time, which caps a frame at eight distinct 5x8 tiles.
//
// When a digit turns it rolls, like a drum in a mechanical counter: the old
// numeral rises out of its window and the new one rises in from below. That
// always fits, with no fallback. A rolling digit needs two tiles of its own,
// but it no longer needs its two static ones, so the frame never wants more
// than the four digits' eight. Static digits are allocated first and share
// tiles when they repeat; the rolls take what is left.
//
// The roll lasts 0.6 s, several times the glass's 150 ms switching time, so it
// reads as motion rather than a smear. The colon is two ROM dots (0xa5), one a
// quarter of the way down the digits and one three quarters, which suits a
// thin face better than the ROM colon's four beads.

import { DIGITS_TALL, TileAllocator, clockFields, ease, clamp } from '../js/kit.js';

const BEAD = 0xa5;  // ROM 2x2 dot on rows 3-4 of its cell
const ROLL = 0.6;   // seconds a turning digit takes to roll over
const GAP = 3;      // blank rows between the outgoing and incoming numerals on the drum

/** Column each glyph of "HH:MM" sits in; the colon gets its own cell so the
 *  digits can be a full five dots wide without crowding it. */
const DIGIT_COLUMNS = [0, 1, 3, 4];
const COLON_COL = 2;

/** Seconds since the digit `index` places from the right of HHMM last changed. */
function sinceChange(index, { h, m, s, ms }) {
  const sec = s + ms / 1000;
  switch (index) {
    case 0: return sec;
    case 1: return (m % 10) * 60 + sec;
    case 2: return m * 60 + sec;
    default: return (h % 10) * 3600 + m * 60 + sec;
  }
}

/** The drum at `progress` 0..1: the old numeral rising out, the new one in. */
function roll(from, to, progress) {
  const drum = [...from, ...Array(GAP).fill('.....'), ...to];
  const top = Math.round(ease.inOutCubic(clamp(progress, 0, 1)) * (16 + GAP));
  return drum.slice(top, top + 16);
}

const halves = (glyph) => [glyph.slice(0, 8), glyph.slice(8, 16)];

export default {
  name: 'Monolith',
  blurb: 'A five-by-sixteen typeface spanning both rows; digits roll like a counter; ROM colon and seconds bar.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 12,

  frame(lcd, api, { date, fields }) {
    const now = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    // The digit each position showed a minute ago -- not "this digit minus
    // one", which is wrong at 59 -> 00 and 23 -> 00.
    const prev = clockFields(new Date(date.getTime() - 60000));
    const was = [prev.hh[0], prev.hh[1], prev.mm[0], prev.mm[1]];

    const glyphs = now.map((d, k) => {
      const elapsed = sinceChange(3 - k, fields);
      return elapsed < ROLL && was[k] !== d
        ? { rolling: true, rows: roll(DIGITS_TALL[was[k]], DIGITS_TALL[d], elapsed / ROLL) }
        : { rolling: false, rows: DIGITS_TALL[d] };
    });

    // Static digits first, then the rolls: see the note at the top.
    const alloc = new TileAllocator(lcd, 0);
    const codes = Array(4);
    for (const pass of [false, true]) {
      glyphs.forEach((g, k) => {
        if (g.rolling !== pass) return;
        codes[k] = halves(g.rows).map((tile) => alloc.add(tile));
        // Never expected, but if a roll ever found CGRAM full, show the digit still.
        if (codes[k].includes(null)) codes[k] = halves(DIGITS_TALL[now[k]]).map((tile) => alloc.add(tile) ?? 0x20);
      });
    }
    alloc.flush();

    DIGIT_COLUMNS.forEach((col, k) => {
      lcd.setCursor(col, 0); lcd.data(codes[k][0]);
      lcd.setCursor(col, 1); lcd.data(codes[k][1]);
    });
    lcd.setCursor(COLON_COL, 0); lcd.data(BEAD);
    lcd.setCursor(COLON_COL, 1); lcd.data(BEAD);

    // Seconds readout, upper right.
    lcd.textAt(11, 0, fields.ss);

    // A row of ten dots, one per six seconds. The next dot to fill pulses with
    // the seconds, so the display ticks even when nothing else on it moves.
    const filled = Math.floor(fields.s / 6);
    const pulse = fields.ms < 500;
    for (let i = 0; i < 10; i++) {
      lcd.setCursor(6 + i, 1);
      const on = i < filled || (i === filled && pulse);
      lcd.data(on ? BEAD : 0x20);
    }
  },
};
