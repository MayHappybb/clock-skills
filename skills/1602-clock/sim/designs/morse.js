// Morse — the clock is a beacon, and the time is what it is sending.
//
// A station keying its own time: a lamp flashing the four digits of HH:MM in
// Morse, and the tape underneath taking them down. Every symbol the lamp sends
// is one cell of tape, written on from the left; when the tape fills it scrolls
// a symbol at a time, so the last sixteen of the transmission are always
// readable. A dot holds for one unit, a dash for three, and the lamp is dark
// between them -- that timing *is* the message, and it is the only thing on the
// glass that a viewer cannot read but a listener could.
//
// Almost all of it is ROM and therefore free: the dot is 0xa5 (a 2x2 bead), the
// dash is 0x2d (a full-width rule), and the gaps are spaces, so the whole tape
// costs nothing. CGRAM is spent only on the lamp itself, two tiles, lit and
// dark. The digital readout sits above it in the factory font, which is what
// makes the tape a demonstration rather than a puzzle.

import { art } from '../js/kit.js';

const LAMP_ON = 0, LAMP_OFF = 1;
const LAMP = {
  on: art(`
    .###.
    #####
    #####
    #####
    #####
    #####
    .###.
    .....`),
  off: art(`
    .###.
    #...#
    #...#
    #...#
    #...#
    #...#
    .###.
    .....`),
};

const DOT = 0xa5;                 // ROM: a 2x2 bead on rows 3-4
const DASH = 0x2d;                // ROM: a full-width rule on row 3
const BLANK = 0x20;
const TAPE = 16;                  // cells of tape
const U = 0.26;                   // one Morse unit, in seconds

/** The five Morse symbols of each digit: 0-9 are all exactly five long. */
const MORSE = {
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
};

/**
 * One transmission of `hhmm`, as a list of events on a timeline: a symbol
 * lights the lamp and lays a cell of tape, a gap merely passes the time. The
 * letter gaps between digits lay a blank cell so the tape keeps its grouping.
 */
function schedule(hhmm) {
  const events = [];
  let t = 0;
  const digits = [...hhmm];
  digits.forEach((ch, i) => {
    const symbols = MORSE[ch];
    symbols.split('').forEach((s, j) => {
      const dur = s === '.' ? U : 3 * U;
      events.push({ t0: t, t1: t + dur, cell: s === '.' ? DOT : DASH });
      t += dur;
      if (j < symbols.length - 1) { events.push({ t0: t, t1: t + U, cell: null }); t += U; }
    });
    if (i < digits.length - 1) { events.push({ t0: t, t1: t + 3 * U, cell: BLANK }); t += 3 * U; }
  });
  return { events, total: t };
}

export default {
  name: 'Morse',
  blurb: 'A beacon keying the time in Morse: a lamp flashing dot and dash, and a tape that scrolls as it is written.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { fields }) {
    const { events, total } = schedule(fields.hh + fields.mm);
    // The transmission restarts every `total` seconds, and the minute is longer
    // than a transmission, so it repeats two or three times a minute.
    const phase = (fields.s + fields.ms / 1000) % total;
    const current = events.find((e) => phase >= e.t0 && phase < e.t1);

    const tape = events.filter((e) => e.cell !== null).map((e) => e.cell);
    const written = events.filter((e) => e.cell !== null && e.t0 <= phase).length;
    const from = Math.max(0, written - TAPE);

    lcd.defineChar(LAMP_ON, LAMP.on);
    lcd.defineChar(LAMP_OFF, LAMP.off);

    const grid = [Array(16).fill(BLANK), Array(16).fill(BLANK)];
    const lit = current && current.cell !== null && current.cell !== BLANK;
    grid[0][0] = lit ? LAMP_ON : LAMP_OFF;
    const write = (row, text, col) =>
      [...text].forEach((ch, i) => { grid[row][col + i] = ch.charCodeAt(0) & 0xff; });
    write(0, `${fields.hh}:${fields.mm}:${fields.ss}`, 2);
    write(0, `${fields.dd}${fields.month}`, 11);
    // Only what has actually been sent is on the tape; the rest is still to come.
    for (let i = 0; i < TAPE; i++) grid[1][i] = from + i < written ? tape[from + i] : BLANK;

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
