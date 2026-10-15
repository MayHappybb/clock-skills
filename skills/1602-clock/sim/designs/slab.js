// Slab — the reference photograph, reproduced dot for dot.
//
// Four digits, each three cells wide and both rows tall, built from the block
// face's shared parts (sim/js/blockface.js); a ROM colon; seconds in the
// photo's squared font at the bottom right. The layout matches the photo
// exactly: column 0 empty, digits at 1, 4, 8 and 11, the colon at 7, seconds
// flush right at 14-15.
//
// Budget. The face needs between one part (11:11) and seven (20:45, which
// wants T, M, G, B, R, M3 and B3), and the seconds two more. So for the few
// minutes a day where the face needs seven parts and the two seconds digits
// differ, nine slots are wanted and eight exist. At those times the seconds
// fall back to the ROM digits rather than corrupting the face:
// `node tools/tile-budget.mjs --design slab` checks it never overflows.

import { TileAllocator } from '../js/kit.js';
import { DIGITS, DIGIT_OFFSETS, COLON_OFFSET, SECONDS, partCode } from '../js/blockface.js';

const LEFT = 1;
const SECONDS_COL = 14;

export default {
  name: 'Slab',
  blurb: 'The reference photo, dot for dot: four 3x2-cell block digits, ROM colon, squared seconds.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 4,

  frame(lcd, api, { fields }) {
    const alloc = new TileAllocator(lcd, 0);
    const digits = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];

    // The face first: it must always be right.
    digits.forEach((d, k) => {
      DIGITS[d].forEach((parts, row) => parts.forEach((name, i) => {
        grid[row][LEFT + DIGIT_OFFSETS[k] + i] = partCode(alloc, name);
      }));
    });
    grid[0][LEFT + COLON_OFFSET] = 0x3a;
    grid[1][LEFT + COLON_OFFSET] = 0x3a;

    // Then the seconds, if there is room for both digits.
    const ss = [...fields.ss];
    const need = new Set(ss).size;
    if (alloc.capacity - alloc.used >= need) {
      ss.forEach((d, i) => { grid[1][SECONDS_COL + i] = alloc.add(SECONDS[d]); });
    } else {
      ss.forEach((d, i) => { grid[1][SECONDS_COL + i] = d.charCodeAt(0); });
    }

    alloc.flush();
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
