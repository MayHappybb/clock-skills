// Stack — the block face, rebuilt every minute like a falling-block game.
//
// The face is the reference photo's (sim/js/blockface.js): every digit is a
// stack of shared parts. That makes the parts natural game pieces. When a
// digit turns, the old one flashes like a cleared line and vanishes, then the
// new one is dropped into place a piece at a time: bottom row first, then the
// top, each piece accelerating as it falls.
//
// Budget. A piece in flight sits across two cells at some dot offset, which
// is two tiles of its own; there is only ever one piece in flight. The face
// rarely needs more than five parts, the seconds two and the flight two, so a
// frame normally fits. Slots go in that order. If the flight does not fit it
// falls back to whole-cell steps drawn with the piece's own part, which still
// reads as a fall; a seconds readout that switched font mid-drop did not.
// The face is allocated first and is never the thing that gives.
//
// Motion is paced for the glass: the flash holds each state for 200 ms, and a
// piece takes 0.3-0.45 s to fall, so the 150 ms liquid crystal shows a streak
// rather than a smudge.

import { TileAllocator, clockFields, ease, clamp } from '../js/kit.js';
import { DIGITS, DIGIT_OFFSETS, COLON_OFFSET, SECONDS, partTile, partCode } from '../js/blockface.js';

const LEFT = 1;
const SECONDS_COL = 14;
const FLASH_STEP = 0.2;                // the cleared digit: off, on, off
const FLASH = 3 * FLASH_STEP;
const FALL = { 0: 0.3, 1: 0.45 };      // seconds to fall into the top / bottom row
const GAP = 0.06;                      // pause between pieces

/** The pieces of a digit in drop order: bottom row left to right, then top. */
function pieces(d) {
  const out = [];
  for (const row of [1, 0]) {
    DIGITS[d][row].forEach((name, i) => { if (name !== ' ') out.push({ name, row, i }); });
  }
  return out;
}

/** Where every piece of the turning digits is at `sec` seconds into the minute. */
function schedule(changing, now, sec) {
  let t = FLASH;
  const landed = new Set();
  let flying = null;
  for (const k of changing) {
    for (const p of pieces(now[k])) {
      const dur = FALL[p.row];
      const key = `${k}/${p.row}/${p.i}`;
      if (sec >= t + dur) landed.add(key);
      else if (sec >= t && !flying) flying = { ...p, k, progress: (sec - t) / dur };
      t += dur + GAP;
    }
  }
  return { landed, flying };
}

/** Two tiles for a part whose top edge is `y` dots below the top of the glass. */
function flightTiles(name, y) {
  const src = partTile(name);
  return [0, 1].map((cellRow) => Array.from({ length: 8 }, (_, r) => src[cellRow * 8 + r - y] ?? '.....'));
}

const isBlank = (tile) => tile.every((row) => !row.includes('#'));

export default {
  name: 'Stack',
  blurb: 'The block face, cleared and rebuilt piece by falling piece whenever a digit turns.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { date, fields }) {
    const prev = clockFields(new Date(date.getTime() - 60000));
    const now = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    const was = [prev.hh[0], prev.hh[1], prev.mm[0], prev.mm[1]];
    const sec = fields.s + fields.ms / 1000;
    const changing = [0, 1, 2, 3].filter((k) => now[k] !== was[k]);

    const alloc = new TileAllocator(lcd, 0);
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const put = (k, row, i, name) => { grid[row][LEFT + DIGIT_OFFSETS[k] + i] = partCode(alloc, name) ?? 0x20; };

    const { landed, flying } = schedule(changing, now, sec);
    now.forEach((d, k) => {
      if (!changing.includes(k)) {
        DIGITS[d].forEach((parts, row) => parts.forEach((name, i) => put(k, row, i, name)));
      } else if (sec < FLASH) {
        // The cleared line: the old digit blinks out.
        if (Math.floor(sec / FLASH_STEP) === 1) {
          DIGITS[was[k]].forEach((parts, row) => parts.forEach((name, i) => put(k, row, i, name)));
        }
      } else {
        DIGITS[d].forEach((parts, row) => parts.forEach((name, i) => {
          if (landed.has(`${k}/${row}/${i}`)) put(k, row, i, name);
        }));
      }
    });
    grid[0][LEFT + COLON_OFFSET] = 0x3a;
    grid[1][LEFT + COLON_OFFSET] = 0x3a;

    // Both seconds digits get the squared font or neither does.
    const ss = [...fields.ss];
    const freshSeconds = new Set(ss.filter((d) => !alloc.index.has(SECONDS[d].join('/')))).size;
    const squared = alloc.used + freshSeconds <= alloc.capacity;
    ss.forEach((d, i) => { grid[1][SECONDS_COL + i] = squared ? alloc.add(SECONDS[d]) : d.charCodeAt(0); });

    if (flying) {
      // Falls from just above the glass to its row, accelerating.
      const target = flying.row * 8;
      const y = Math.round(-8 + (target + 8) * ease.inQuad(clamp(flying.progress, 0, 1)));
      const col = LEFT + DIGIT_OFFSETS[flying.k] + flying.i;
      const tiles = flightTiles(flying.name, y).map((t) => (isBlank(t) ? null : t));
      const fresh = tiles.filter((t) => t && !alloc.index.has(t.join('/'))).length;
      if (alloc.used + fresh <= alloc.capacity) {
        tiles.forEach((t, row) => { if (t) grid[row][col] = alloc.add(t); });
      } else {
        // No room for the in-between tiles: step a whole cell at a time.
        const row = y < 4 ? 0 : 1;
        if (row <= flying.row) grid[row][col] = partCode(alloc, flying.name) ?? 0x20;
      }
    }

    alloc.flush();
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
