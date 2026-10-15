// Chomp — every minute, Pac-Man eats the time.
//
// Full-height block digits with a colon of power pellets that blink like
// the arcade's. When the minute turns, Pac-Man runs in from the left and
// chomps through the old time, mouth snapping once per cell, and the new time
// is left in his wake. He is three cells by two rows: 10 x 11.6 mm on the
// glass, as near a circle as this dot field gets. He is drawn in millimetres
// at the real dot centres (as `dial` is), so the gaps between cells fall
// where they would on a real disc.
//
// Budget: the digits are a four-part kit (top, top+middle and bottom bars, a
// narrow right stroke, and ROM 0xff for the left strokes), so the old and new
// times together never need more than four slots. Pac-Man's middle column is
// solid in both frames, which makes those two cells ROM 0xff, so he costs
// four. That is all eight while he runs, and the seconds he leaves behind him
// are ROM digits until he has gone. (The photo's own face needs up to seven
// parts across old and new times, which is why it is not used here.)
//
// He moves a whole cell per step and each step holds 160 ms, the glass's
// switching time, so he reads as moving, not as a smear.

import { art, Stage } from '../js/kit.js';
import { MODULE } from '../js/panel.js';
import { SECONDS } from '../js/blockface.js';

const STEP = 0.16;                 // seconds per cell
const START = -3, END = 16;        // Pac-Man's left cell, off one edge to off the other

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
// The right stroke is three dots wide, as in the reference photo's face
// (blockface.js), so the two dark columns after it space the digits. Bars in
// the right column stay full width: that is what keeps the kit at four parts.
const DIGITS = {
  0: ['#TR', '#BR'],
  1: ['  R', '  R'],
  2: ['MMR', '#BB'],
  3: ['MMR', 'BBR'],
  4: ['#BR', '  R'],
  5: ['#MM', 'BBR'],
  6: ['#MM', '#BR'],
  7: ['TTR', '  R'],
  8: ['#MR', '#BR'],
  9: ['#MR', 'BBR'],
};
const DIGIT_COLS = [0, 3, 7, 10];
const COLON_COL = 6;
const PELLET = 0xa5;               // ROM: a 2x2 dot, centred, in both rows
const SOLID = 0xff;

/** Grid of cells (ROM codes or tiles) showing a time, cols 0-15, both rows. */
function face(fields, withSeconds) {
  const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
  [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]].forEach((d, k) => {
    DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => {
      grid[row][DIGIT_COLS[k] + i] = p === '#' ? SOLID : p === ' ' ? 0x20 : PARTS[p];
    }));
  });
  if (withSeconds) {
    grid[1][14] = SECONDS[fields.ss[0]];
    grid[1][15] = SECONDS[fields.ss[1]];
  }
  return grid;
}

// ---------------------------------------------------------------- Pac-Man

/**
 * Pac-Man as six 5x8 tiles [row][cell], open or shut. A disc in mm sampled at
 * every real dot centre, clipped to the three cells: its flat top and sides
 * are the arcade sprite's. The mouth's point sits at the right cell's edge,
 * so the middle column stays solid and is ROM 0xff in both frames.
 */
function pacman(open) {
  const cx = MODULE.charPitchX + 2 * MODULE.dotPitchX;        // middle dot of the middle cell
  const cy = (MODULE.charPitchY + 7 * MODULE.dotPitchY) / 2;  // halfway down both rows
  const R = 5.7, apex = 2 * MODULE.charPitchX - 0.4, half = 0.85;
  const tiles = [[], []];
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < 3; c++) {
      const rows = [];
      for (let r = 0; r < 8; r++) {
        let bits = '';
        for (let i = 0; i < 5; i++) {
          const x = c * MODULE.charPitchX + i * MODULE.dotPitchX;
          const y = row * MODULE.charPitchY + r * MODULE.dotPitchY;
          let on = (x - cx) ** 2 + ((y - cy) * 1.0) ** 2 <= R * R;
          if (open && x > apex - 0.01 && Math.abs(Math.atan2(y - cy, x - apex)) < half) on = false;
          if (c === 1) on = true;
          bits += on ? '#' : '.';
        }
        rows.push(bits);
      }
      tiles[row].push(rows);
    }
  }
  return tiles;
}
const PAC = [pacman(false), pacman(true)];

// ------------------------------------------------------------------- design

export default {
  name: 'Chomp',
  blurb: 'Block digits with power-pellet colon; every minute Pac-Man eats the old time and leaves the new.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 12,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const step = Math.floor(sec / STEP);
    const pos = START + step;                  // Pac-Man's left cell
    const running = pos <= END;

    const now = face(fields, true);
    const old = face(kit.clockFields(new Date(date.getTime() - 60000)), false);

    const st = new Stage(lcd);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        // Behind him the new time; ahead of him the old one, its seconds
        // already gone: it is :00 and the old seconds are what he is eating.
        st.put(col, row, running && col >= pos + 3 ? old[row][col] : now[row][col]);
      }
    }
    // The seconds font costs two slots, which are not free while he runs, so
    // a digit that does not get one shows in ROM.
    for (const col of [14, 15]) {
      if (!running || col < pos + 3) st.put(col, 1, now[1][col], fields.ss[col - 14].charCodeAt(0));
    }

    // Power pellets: on for the first half of every second, as in the arcade.
    const lit = (sec % 1) < 0.5;
    for (const row of [0, 1]) st.put(COLON_COL, row, lit ? PELLET : 0x20);

    if (running) {
      const frameTiles = PAC[step % 2 === 0 ? 1 : 0];
      for (let row = 0; row < 2; row++) {
        for (let c = 0; c < 3; c++) {
          st.put(pos + c, row, c === 1 ? SOLID : frameTiles[row][c]);
        }
      }
    }

    st.draw();
  },
};
