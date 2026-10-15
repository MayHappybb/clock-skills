// Abacus — the time is a number, and the display is a soroban.
//
// Four rods across both character rows, one per decimal digit of HH:MM. Each
// rod is a single cell wide and sixteen dots tall, which is exactly the two
// character rows, so a rod reads as one piece of glass with no seam. On a
// soroban a digit is held by which beads have been pushed up against the
// reckoning bar: one "heaven" bead worth five above the bar, four "earth"
// beads worth one each below it. The value is not drawn anywhere -- it is the
// *position* of the beads, and that is what makes it an instrument and not a
// font.
//
// Each rod drawn as its own picture is two tiles (top half, bottom half), and
// four rods is exactly the eight slots of a full CGRAM page. Two rods showing
// the same digit share their tiles, so most minutes cost six or fewer; the
// allocator proves it over every minute of the day.
//
// What moves is the beads. When a digit turns, every bead on that rod slides
// from where it was to where it now belongs, over about a third of a second,
// and the beads you can see moving are the ones that changed the number. The
// rest of the glass is free ROM: the digital time and the date, so the
// instrument has something to be checked against.

import { TileAllocator } from '../js/kit.js';

const ROD_COLS = [0, 2, 6, 8];   // hours tens, hours ones, minutes tens, minutes ones
const GAP_COLS = [1, 3, 4, 5, 7, 9];  // between the rods, where the bar runs on
const DIGI_COL = 10;             // the ROM readout, columns 10-15
const SLIDE = 0.35;              // seconds a bead takes to reach its new place
const BAR_ROM = 0x5f;            // underscore: a full-width rule on row 6, the bar's row

const BEAD = ['.###.', '#####']; // one bead: two rows, pinched at the top
const BAR = '#####';             // the reckoning bar, one row of solid

/**
 * Where a rod's beads sit for digit `d`, as the top row of each bead:
 * `heaven` is the one bead above the bar, `earth` the four below it, top first.
 * Positions are the layout of a real soroban read on this glass:
 *
 *   row 0      blank
 *   rows 1-2   heaven bead at rest (it is worth nothing here)
 *   rows 3-4   heaven bead pushed down to the bar (worth five)
 *   row 5      blank
 *   row 6      the reckoning bar
 *   rows 7-15  the four earth beads, resting at the bottom or pushed up
 */
function beadRows(d) {
  const heaven = d >= 5 ? 3 : 1;
  const k = d >= 5 ? d - 5 : d;          // earth beads pushed up, 0..4
  const earth = [];
  for (let i = 0; i < 4; i++) {
    if (i < k) earth.push(7 + 2 * i);                    // packed against the bar
    else earth.push(8 + 2 * k + 2 * (i - k));            // and the rest sit low
  }
  return { heaven, earth };
}

/** A rod's sixteen rows, with each bead's top row given by `pos`. */
function rodRows(pos) {
  const rows = Array.from({ length: 16 }, () => '.....');
  const bead = (top) => { rows[top] = BEAD[0]; rows[top + 1] = BEAD[1]; };
  bead(pos.heaven);
  rows[6] = BAR;
  pos.earth.forEach(bead);
  return rows;
}

const topHalf = (rows) => rows.slice(0, 8);
const bottomHalf = (rows) => rows.slice(8, 16);

/** Beads part way between two positions, with bounce neither too slow nor too fast. */
const slide = (a, b, u) => Math.round(a + (b - a) * u);

/**
 * The rod for `d` at `u` seconds into a change from `prev` (u >= 1 is settled).
 * Every bead interpolates its own row, so a bead being pushed up is seen to go.
 */
function transition(prev, d, u) {
  if (u >= 1) return beadRows(d);
  const a = beadRows(prev), b = beadRows(d);
  return {
    heaven: slide(a.heaven, b.heaven, u),
    earth: b.earth.map((y, i) => slide(a.earth[i], y, u)),
  };
}

export default {
  name: 'Abacus',
  blurb: 'The time as beads on a soroban: four rods of five-by-sixteen dots, the beads sliding to the new number each minute.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    // The digits this rod is turning from and how long ago it started. Read
    // from the clock, never "this digit minus one" -- 5 turns to 0, not to 9.
    const prevMinute = kit.clockFields(new Date(date.getTime() - (fields.s + 1) * 1000 - fields.ms));
    const prevHour = kit.clockFields(new Date(date.getTime() - (fields.m * 60 + fields.s + 1) * 1000 - fields.ms));
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    const prevs = [prevHour.hh[0], prevHour.hh[1], prevMinute.mm[0], prevMinute.mm[1]];
    const since = [fields.m * 60 + sec, fields.m * 60 + sec, sec, sec];

    // Exactly one tile pair per rod: four rods is eight slots, so the frame can
    // never want more than the page holds, and no rod can ever be starved.
    const alloc = new TileAllocator(lcd, 0);
    const codes = [[], []];                       // per row, per rod: the two halves
    digits.forEach((d, i) => {
      const u = Math.min(1, since[i] / SLIDE);
      const moving = u < 1 && d !== prevs[i];
      const pos = moving ? transition(prevs[i], d, u) : beadRows(d);
      const rows = rodRows(pos);
      codes[0][i] = alloc.add(topHalf(rows)) ?? 0x20;
      codes[1][i] = alloc.add(bottomHalf(rows)) ?? 0x20;
    });
    alloc.flush();

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    ROD_COLS.forEach((col, i) => { grid[0][col] = codes[0][i]; grid[1][col] = codes[1][i]; });
    // The reckoning bar runs on between the rods, so the four of them are one
    // instrument rather than four columns. ROM 0x5f is a full-width rule on row
    // 6 of its cell, which is exactly the row the rods put their bar on.
    for (const col of GAP_COLS) grid[0][col] = BAR_ROM;
    const write = (row, text, col = DIGI_COL) =>
      [...text].forEach((ch, i) => { grid[row][col + i] = ch.charCodeAt(0) & 0xff; });
    write(0, `${fields.hh}:${fields.mm}`);
    write(1, `${fields.ss} ${fields.dow}`);

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
