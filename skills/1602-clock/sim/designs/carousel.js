// Carousel — the minute arrives like a train, pulled by the controller itself.
//
// Each DDRAM line is 40 addresses long and the glass shows 16 of them. The
// controller can slide that window along the line with one 39 µs instruction,
// "display shift", and the line wraps round. So the line holds two whole
// faces, 20 addresses apart: the minute on screen, and the next one waiting
// off screen to the right. When the minute turns, the controller shifts left
// twenty times, the old time pulls out to the left and the new one pulls in
// from the right, coupled to it by a short drawbar. Next minute the roles swap.
//
// On hardware each step is one byte. Nothing is redrawn to move it, so the
// motion is as clean as the glass allows: whole cells, 6 dots at a time. The
// steps ease in and out (a half cosine) over 4.8 s, and the quickest holds
// 153 ms.
//
// Budget: the four-part block face from `chomp` (top, top+middle and bottom
// bars, a narrow right stroke, ROM 0xff), so the two faces together never need
// more than four slots. The other four carry the seconds of both: the
// departing face keeps the 59 it left with.
//
// `frame` must define the whole picture, so it writes both faces and then
// issues the shift from scratch (Return Home, then up to 20 shifts, whichever
// way round the ring is shorter). Firmware that
// keeps state sends the one shift that changed.

import { art, clamp, TileAllocator } from '../js/kit.js';
import { SECONDS } from '../js/blockface.js';

const PAN = 4.8;                   // seconds for the 20-cell pan
const LINE = 40, WINDOW = 20;      // DDRAM line length; distance between the faces

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

/**
 * One face as 20 cells per row: the time in 0-12, the seconds in 14-15, a
 * drawbar in the four cells that are off screen at rest.
 */
function face(alloc, fields, colon) {
  const grid = [Array(WINDOW).fill(0x20), Array(WINDOW).fill(0x20)];
  [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]].forEach((d, k) => {
    DIGITS[d].forEach((parts, row) => [...parts].forEach((p, i) => {
      grid[row][DIGIT_COLS[k] + i] = p === '#' ? 0xff : p === ' ' ? 0x20 : alloc.add(PARTS[p]);
    }));
  });
  for (const row of [0, 1]) grid[row][COLON_COL] = colon ? 0xa5 : 0x20;
  // The drawbar: ROM long dashes on the top row, where the couplings would be.
  for (let c = 16; c < WINDOW; c++) grid[0][c] = 0xb0;
  return grid;
}

function seconds(alloc, grid, ss) {
  [...ss].forEach((d, i) => { grid[1][14 + i] = alloc.add(SECONDS[d]) ?? d.charCodeAt(0); });
}

export default {
  name: 'Carousel',
  blurb: 'Two faces on the 40-cell DDRAM ring; each minute the controller\'s own display shift pulls the next one in.',
  bus: 'i2c100',
  panel: 'amber',
  fps: 12,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const minute = Math.floor(date.getTime() / 60000);
    const here = minute % 2;                       // which window holds this minute
    const prev = kit.clockFields(new Date(date.getTime() - (fields.s + 1) * 1000 - fields.ms));

    // Pan position in cells: 0 at the start of the minute (old face showing),
    // 20 once the new one is in.
    const u = clamp(sec / PAN, 0, 1);
    const k = Math.floor(WINDOW * (1 - Math.cos(Math.PI * u)) / 2);
    const panning = k < WINDOW;

    const alloc = new TileAllocator(lcd, 0);
    const colon = panning || sec % 2 < 1;
    const faces = [];
    faces[here] = face(alloc, fields, colon);
    faces[1 - here] = face(alloc, prev, true);
    seconds(alloc, faces[here], fields.ss);
    if (panning) seconds(alloc, faces[1 - here], prev.ss);
    alloc.flush();

    // Both faces into DDRAM, by address: window 0 at 0x00, window 1 at 0x14.
    for (const row of [0, 1]) {
      lcd.command(0x80 | (row * 0x40));
      for (const w of [0, 1]) faces[w][row].forEach((c) => lcd.data(c));
    }

    // The window: the old face is at the left edge until the pan starts.
    const shift = ((1 - here) * WINDOW + k) % LINE;
    lcd.command(0x02);                              // home, which also unshifts
    if (shift <= WINDOW) for (let i = 0; i < shift; i++) lcd.command(0x18);   // left
    else for (let i = shift; i < LINE; i++) lcd.command(0x1c);                // right, the short way
  },
};
