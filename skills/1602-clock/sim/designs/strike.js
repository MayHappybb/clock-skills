// Strike — a long-case clock, with the pendulum hanging through the middle.
//
// The time is the reference block face cut in two: the hours fill the left six
// cells, the minutes the right six, and the four cells between them are a
// window with a pendulum in it. That gap is the whole idea -- every other block
// clock puts a colon there.
//
// The pendulum is a true seconds pendulum: its period is two seconds, so it
// passes the middle exactly on each tick, and the swing you watch *is* the
// seconds readout. It is drawn in millimetres off the real dot pitch, because a
// rod drawn in dot coordinates kinks at the seam between the two cells.
//
// On the hour it rings: the amplitude more than doubles and rings expand from
// the pivot, one per second, for as many seconds as the hour struck twelve-hour
// time -- twelve at noon and midnight, and one at one o'clock. That is the one
// moment a day the glass does something it does at no other.

import { TileAllocator, art } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const HOUR_COLS = [0, 3];              // two 3-cell digits, left of the window
const MIN_COLS = [8, 11];              // and right of it
const PANEL_COLS = [6, 7];             // the pendulum window, 10 x 16 dots
const SEC_COL = 14;

/** The block face's parts: full-width bars, and a right stroke only 3 dots wide. */
const PARTS = {
  T: art(`
    #####
    #####
    #####
    .....
    .....
    .....
    .....
    .....`),
  M: art(`
    #####
    #####
    #####
    .....
    .....
    #####
    #####
    #####`),
  B: art(`
    .....
    .....
    .....
    .....
    .....
    #####
    #####
    #####`),
  R: art(`
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..
    ###..`),
};
const DIGITS = {
  0: ['#TR', '#BR'], 1: ['  R', '  R'], 2: ['MMR', '#BB'], 3: ['MMR', 'BBR'], 4: ['#BR', '  R'],
  5: ['#MM', 'BBR'], 6: ['#MM', '#BR'], 7: ['TTR', '  R'], 8: ['#MR', '#BR'], 9: ['#MR', 'BBR'],
};

// Every dot of the window, at its real position in millimetres.
const DOTS = [];
for (let row = 0; row < 2; row++)
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < 5; i++)
        DOTS.push({
          c, row, i, r,
          x: c * MODULE.charPitchX + i * MODULE.dotPitchX,
          y: row * MODULE.charPitchY + r * MODULE.dotPitchY,
        });

const WINDOW = MODULE.charPitchX + MODULE.dotPitchX * 4;   // the window's width in mm
const PIVOT = { x: WINDOW / 2, y: 1.0 };
const ROD = 8.9;                       // mm from the pivot to the bob
const SWING = 0.27;                    // radians at rest; ~15 degrees
const BOB = 1.35;                      // bob radius, mm

/** How many times the hour is struck, twelve-hour time: 12 at noon and midnight. */
const strikes = (h) => ((h + 11) % 12) + 1;

const mark = (px, d) => { px[d.row * 8 + d.r][d.c * 5 + d.i] = true; };

/** The window as 16 rows of 10 marks, for the second `sec` of the minute. */
function windowPicture(sec, h, m, ms) {
  const ringing = m === 0 && sec < strikes(h);
  const amp = ringing ? SWING * 2.2 : SWING;
  const theta = amp * Math.sin(Math.PI * sec);          // period 2 s: centre on every tick
  const bob = { x: PIVOT.x + ROD * Math.sin(theta), y: PIVOT.y + ROD * Math.cos(theta) };
  const bobR = ringing && ms < 170 ? BOB * 1.5 : BOB;   // the bob takes the blow

  const px = Array.from({ length: 16 }, () => Array(10).fill(false));
  // The suspension bracket the pendulum hangs from, across the top of the window.
  for (const d of DOTS) if (d.row === 0 && d.r === 0 && d.x >= 1.7 && d.x <= 4.3) mark(px, d);
  for (const d of DOTS) {
    // The rod is one dot per row -- the one nearest the line at that row --
    // because the two cells' dots do not quite line up with any angle.
    if (d.y <= bob.y + 0.35) {
      const xRod = PIVOT.x + (d.y - PIVOT.y) * (bob.x - PIVOT.x) / (bob.y - PIVOT.y);
      const row = DOTS.filter((o) => o.row === d.row && o.r === d.r);
      const nearest = row.reduce((b, o) => (Math.abs(o.x - xRod) < Math.abs(b.x - xRod) ? o : b));
      if (nearest === d) mark(px, d);
    }
    if (Math.hypot(d.x - bob.x, d.y - bob.y) < bobR) mark(px, d);
    // Rings going out from the pivot, one per struck hour.
    if (ringing) {
      for (let k = 0; k < strikes(h); k++) {
        const age = sec - k;
        if (age < 0 || age > 2.2) continue;
        const r = age * 3.1;
        if (Math.abs(Math.hypot(d.x - PIVOT.x, d.y - PIVOT.y) - r) < 0.38) mark(px, d);
      }
    }
  }
  return px;
}

/** Cut the window into its four 5x8 cells: TL, TR, BL, BR. */
function quarter(px) {
  const tile = (x0, y0) => px.slice(y0, y0 + 8)
    .map((row) => row.slice(x0, x0 + 5).map((on) => (on ? '#' : '.')).join(''));
  return [tile(0, 0), tile(5, 0), tile(0, 8), tile(5, 8)];
}

export default {
  name: 'Strike',
  blurb: 'A long-case clock: the block face split by a window with a seconds pendulum in it, which rings the hour.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { fields }) {
    const sec = fields.s + fields.ms / 1000;
    const alloc = new TileAllocator(lcd, 0);

    // The face parts first: the time must be right whatever happens to the window.
    // Four parts plus the window's four tiles is exactly the eight slots, so
    // neither can ever starve the other.
    const partSlot = {};
    for (const [k, spec] of Object.entries(PARTS)) partSlot[k] = alloc.add(spec);
    const windowSlot = quarter(windowPicture(sec, fields.h, fields.m, fields.ms))
      .map((rows) => alloc.add(rows));
    alloc.flush();

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const part = (p) => (p === '#' ? 0xff : p === ' ' ? 0x20 : partSlot[p] ?? 0x20);
    for (const [d, cols] of [[fields.hh[0], HOUR_COLS[0]], [fields.hh[1], HOUR_COLS[1]],
      [fields.mm[0], MIN_COLS[0]], [fields.mm[1], MIN_COLS[1]]]) {
      DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => { grid[row][cols + i] = part(p); }));
    }
    windowSlot.forEach((c, n) => { grid[Math.floor(n / 2)][PANEL_COLS[n % 2]] = c ?? 0x20; });
    [...fields.ss].forEach((d, i) => { grid[1][SEC_COL + i] = d.charCodeAt(0); });

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
