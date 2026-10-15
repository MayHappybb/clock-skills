// Warp — the time at the bridge window, stars streaming past, and a jump to
// lightspeed on every minute.
//
// Stars are born beside the time and fly outward, growing as they come
// closer: the ROM's own dots and symbols in order of size, 0xa5, '+', '*'.
// They move a whole cell at a time, accelerating, so the outer cells flash
// by and the inner ones linger, which reads as depth. Over the minute the
// drive spools up: stars live 2.6 s at :00 and 1.4 s by :59, and come more
// often. At :00 the field stretches into streaks (ROM 0xb0), whites out for
// a moment while the digits change, and drops back to a slow cruise.
//
// The whole star field is free ROM. CGRAM holds only the time: four tall
// 5x16 digits in a squared seven-segment cut, eight tiles at most.
//
// The quickest a star crosses a cell is 0.11 x its life, so 150 ms at the end
// of the minute: the glass shows every step. In the jump the streaks hold for
// at least two frames each.

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 12;
const JUMP = 1.8;                         // seconds of hyperspace at :00

// --------------------------------------------------------------- the digits

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/** A digit as two 5x8 tiles: verticals one dot wide, bars two dots thick. */
function digit(d) {
  const on = (s) => SEG[d].includes(s);
  const px = Array.from({ length: 16 }, () => Array(5).fill(false));
  const hbar = (r) => { for (const y of [r, r + 1]) px[y].fill(true); };
  const vbar = (x, y0, y1) => { for (let y = y0; y <= y1; y++) px[y][x] = true; };
  if (on('a')) hbar(0);
  if (on('g')) hbar(7);
  if (on('d')) hbar(14);
  if (on('f')) vbar(0, 0, 8);
  if (on('b')) vbar(4, 0, 8);
  if (on('e')) vbar(0, 7, 15);
  if (on('c')) vbar(4, 7, 15);
  const rows = px.map((r) => r.map((v) => (v ? '#' : '.')).join(''));
  return [rows.slice(0, 8), rows.slice(8)];
}
const DIGITS = Object.fromEntries([...'0123456789'].map((d) => [d, digit(d)]));

const DIGIT_COLS = [5, 6, 8, 9];
const COLON_COL = 7;

// ---------------------------------------------------------------- the stars

// Four lanes, each a run of cells leading away from the time. The cell next
// to the digits stays dark, or a small star there reads as punctuation.
const LANES = [
  { row: 0, cells: [3, 2, 1, 0] },
  { row: 1, cells: [3, 2, 1, 0] },
  { row: 0, cells: [11, 12, 13, 14, 15] },
  { row: 1, cells: [11, 12, 13, 14, 15] },
];
const SIZES = [0xa5, 0x2b, 0x2a];        // a dot, '+', '*': far to near

/** Life of a star born at second `s` of a minute: the drive spools up. */
const lifeAt = (s) => 2.6 - 1.2 * (s / 60);
/** Gap between births in a lane, also shrinking over the minute. */
const gapAt = (s) => 1.1 - 0.5 * (s / 60);

/**
 * Stars alive in one lane at `T` (seconds since midnight), as cell indexes
 * into the lane with a size. Births are laid down a minute at a time from
 * the wall clock, jittered per lane, so any instant can be drawn on its own.
 */
function laneStars(lane, li, T) {
  const out = [];
  for (const minute of [Math.floor(T / 60) - 1, Math.floor(T / 60)]) {
    let s = noise(minute * 4 + li, 9) * 0.8;
    for (let k = 0; s < 60; k++) {
      const birth = minute * 60 + s, life = lifeAt(s), age = T - birth;
      if (age >= 0 && age < life) {
        const u = age / life;
        const i = Math.min(lane.cells.length - 1, Math.floor(lane.cells.length * u * u));
        out.push({ i, size: Math.min(SIZES.length - 1, Math.floor((i / (lane.cells.length - 1)) * SIZES.length)) });
      }
      s += gapAt(s) * (0.7 + 0.6 * noise(minute * 97 + li * 13 + k, 4));
    }
  }
  return out;
}

export default {
  name: 'Warp',
  blurb: 'Tall digits at the bridge window, ROM stars streaming past faster through the minute, a jump to lightspeed at :00.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];

    // Hyperspace: streaks race out (u < 0.35), white-out (to 0.5), streaks
    // drain away outward (to 1).
    const jumping = sec < JUMP;
    const u = sec / JUMP;
    const flash = jumping && u >= 0.35 && u < 0.5;
    // The old time holds until the white-out.
    const shown = jumping && u < 0.42 ? kit.clockFields(new Date(date.getTime() - 60000)) : fields;

    LANES.forEach((lane, li) => {
      const n = lane.cells.length;
      if (jumping) {
        // Streak cells are lit from `tail` to `head`, counted outward. Each
        // grows or drains in whole cells of at least two frames.
        const head = u < 0.35 ? Math.floor((u / 0.35) * (n + 1)) : n;
        const tail = u < 0.5 ? 0 : Math.floor(((u - 0.5) / 0.5) * (n + 1));
        for (let i = 0; i < n; i++) {
          if (flash) grid[lane.row][lane.cells[i]] = 0xff;
          else if (i >= tail && i < head) grid[lane.row][lane.cells[i]] = 0xb0;
        }
        return;
      }
      for (const star of laneStars(lane, li, T)) {
        const c = lane.cells[star.i];
        const cur = grid[lane.row][c];
        if (cur === 0x20 || SIZES.indexOf(cur) < star.size) grid[lane.row][c] = SIZES[star.size];
      }
    });

    const alloc = new TileAllocator(lcd, 0);
    const digits = [shown.hh[0], shown.hh[1], shown.mm[0], shown.mm[1]];
    const codes = digits.map((d) => DIGITS[d].map((half) => alloc.add(half) ?? 0x20));
    alloc.flush();
    codes.forEach(([top, bottom], k) => { grid[0][DIGIT_COLS[k]] = top; grid[1][DIGIT_COLS[k]] = bottom; });
    // The colon: ROM ':' in both rows, four beads, so it is never taken for a
    // star. Out during the jump.
    if (!jumping) { grid[0][COLON_COL] = 0x3a; grid[1][COLON_COL] = 0x3a; }

    grid.forEach((codesRow, row) => { lcd.setCursor(0, row); codesRow.forEach((c) => lcd.data(c)); });
  },
};
