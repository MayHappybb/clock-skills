// Tide — the time fills with water over each minute.
//
// A simplified kit-of-parts face: every digit is built from full-width bars
// and solid blocks (fewer parts than the photo's face in `slab`, which has a
// narrow right stroke), so four 15x16 digits cost a fixed number of slots
// whatever the time. Here that sharing is the effect rather than a cost-saving. Redraw one
// part and every digit that uses it changes at once, so a single waterline
// drawn into six parts runs straight across the whole face.
//
// Below the waterline a stroke is solid. Above it the stroke is a half-lit
// mesh, so the empty part of a digit still reads as glass waiting to be
// filled. The surface carries a ripple whose period is exactly one cell (five
// dots), which is what lets it run unbroken across tiles that know nothing
// about their neighbours. The water reaches the brim on the fifty-ninth second
// and drains away as the minute turns.
//
// Every part is drawn per frame and the waterline spans both rows, so the top
// and bottom rows need their own copies: four top-row parts, two bottom-row
// parts and the two halves of the colon. Eight, exactly.

import { art, ease, clamp } from '../js/kit.js';

const FULL = art(`
  #####
  #####
  #####
  #####
  #####
  #####
  #####
  #####`);
const TOP = art(`
  #####
  #####
  #####
  .....
  .....
  .....
  .....
  .....`);
const BOTTOM = art(`
  .....
  .....
  .....
  .....
  .....
  #####
  #####
  #####`);
const BOTH = TOP.map((row, i) => (i < 3 ? row : BOTTOM[i]));
const COLON_TOP = art(`
  .....
  .....
  .....
  .###.
  .###.
  .###.
  .....
  .....`);
const COLON_BOT = art(`
  .....
  .###.
  .###.
  .###.
  .....
  .....
  .....
  .....`);

// [shape, character row] for each slot. The waterline depends on which row a
// tile sits in, so a shape used in both rows needs a slot per row.
const SLOTS = {
  F0: [FULL, 0], T0: [TOP, 0], M0: [BOTH, 0], B0: [BOTTOM, 0],
  F1: [FULL, 1], B1: [BOTTOM, 1],
  C0: [COLON_TOP, 0], C1: [COLON_BOT, 1],
};
const CODE = Object.fromEntries(Object.keys(SLOTS).map((k, i) => [k, i]));

// Each digit as three cells over two rows: F full, T top bar, M top + middle
// bars, B bottom bar (in the top row, a lone middle bar), ' ' blank.
const DIGITS = {
  0: ['FTF', 'FBF'],
  1: ['TF ', 'BFB'],
  2: ['MMF', 'FBB'],
  3: ['MMF', 'BBF'],
  4: ['FBF', '  F'],
  5: ['FMM', 'BBF'],
  6: ['FMM', 'FBF'],
  7: ['TTF', '  F'],
  8: ['FMF', 'FBF'],
  9: ['FMF', 'BBF'],
};

const LEFT = 1;                        // face is 13 cells wide; one cell of margin
const DIGIT_COLS = [0, 3, 7, 10].map((c) => c + LEFT);
const COLON_COL = 6 + LEFT;
const DRAIN = 0.9;                     // seconds the water takes to run out

/** Height of the water in dots, 0..16, from the wall clock alone. */
function waterHeight({ s, ms }) {
  const sec = s + ms / 1000;
  if (sec < DRAIN) return 16 * (1 - ease.inQuad(sec / DRAIN));
  return 16 * clamp(sec / 59, 0, 1);
}

/** Draw one part with the waterline through it. */
function flood(shape, charRow, height, t) {
  return shape.map((line, y) => {
    const gy = charRow * 8 + y;        // dot row on the whole glass, 0 at the top
    let out = '';
    for (let x = 0; x < 5; x++) {
      // A one-dot swell, travelling left to right, period exactly one cell.
      const ripple = height > 0.5 && height < 15.5 ? Math.sin((x / 5) * 2 * Math.PI - t * 6) * 0.9 : 0;
      const wet = gy >= 16 - height + ripple;
      const mesh = (x + gy) % 2 === 0;
      out += line[x] === '#' && (wet || mesh) ? '#' : '.';
    }
    return out;
  });
}

export default {
  name: 'Tide',
  blurb: 'Kit-of-parts digits that fill with rippling water over each minute and drain as it turns.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 12,

  frame(lcd, api, { t, fields }) {
    const height = waterHeight(fields);
    for (const [key, [shape, row]] of Object.entries(SLOTS)) {
      lcd.defineChar(CODE[key], flood(shape, row, height, t));
    }

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    digits.forEach((d, k) => {
      DIGITS[d].forEach((parts, r) => {
        [...parts].forEach((p, i) => {
          if (p !== ' ') grid[r][DIGIT_COLS[k] + i] = CODE[p + r];
        });
      });
    });
    grid[0][COLON_COL] = CODE.C0;
    grid[1][COLON_COL] = CODE.C1;

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
