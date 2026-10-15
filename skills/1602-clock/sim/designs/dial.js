// Dial — an analog clock on a character LCD.
//
// A 15x16-dot canvas (three cells by two rows, six tiles) holds a dial:
// twelve hour marks, a long minute hand, a heavy hour hand, and a single dot
// that orbits outside the marks with the seconds. The ROM carries the date
// beside it.
//
// The glass is 11.5 mm tall, so no dial can be bigger than this one. A full
// ring was tried and left the hands no room; twelve dots imply the circle
// and keep the middle clear.
//
// The dial is drawn in millimetres, not in dots. Every dot is placed where it
// really sits on the glass (sim/js/panel.js MODULE): 0.60 x 0.70 mm pitch, a
// missing dot column between cells and a 0.40 mm gap between the rows. A
// circle drawn in dot coordinates comes out as a tall oval with a kink at
// every seam; drawn in millimetres and sampled at the real dot centres it
// comes out round. The centre sits on a real dot (the middle column of the
// middle cell, the last row of the top cell), so a hand at 12, 3, 6 or 9 has
// a straight line of dots to run along.

import { TileAllocator } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const DIAL_COL = 0;                    // leftmost cell of the 3x2 dial
const TEXT_COL = 4;
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// Real centre of every dot of the dial, in mm from the dial's top-left dot.
const DOTS = [];
for (let row = 0; row < 2; row++)
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < 5; i++)
        DOTS.push({
          c, row, i, r,
          x: c * MODULE.charPitchX + i * MODULE.dotPitchX,
          y: row * MODULE.charPitchY + r * MODULE.dotPitchY,
        });

const CENTRE = DOTS.find((d) => d.c === 1 && d.i === 2 && d.row === 0 && d.r === 7);
const MARK_R = 4.3;                    // mm; the dial is 9.5 mm across at most
const SECOND_R = 4.75;
const MINUTE_R = 4.0;
const HOUR_R = 2.7;

/** The dot nearest a point, or null if the point is off the dial. */
function nearest(x, y) {
  let best = null, bd = 0.45 ** 2;     // within about half a pitch
  for (const d of DOTS) {
    const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}

/** Point at `angle` (0 = 12 o'clock, clockwise, radians) and `radius` mm from the centre. */
const polar = (angle, radius) => [CENTRE.x + Math.sin(angle) * radius, CENTRE.y - Math.cos(angle) * radius];

/**
 * Light the dots along a hand, sampled finely enough to stay connected.
 * `offset` moves the line sideways by that many mm, for a thicker hand.
 */
function hand(lit, angle, radius, offset) {
  const [ox, oy] = [Math.cos(angle) * offset, Math.sin(angle) * offset];
  for (let s = 0; s <= radius; s += 0.08) {
    const [x, y] = polar(angle, s);
    const d = nearest(x + ox, y + oy);
    if (d) lit.add(d);
  }
}


export default {
  name: 'Dial',
  blurb: 'An analog dial drawn at the real dot positions, with an orbiting seconds dot; the date in ROM.',
  bus: 'i2c100',
  panel: 'gray',
  fps: 4,

  frame(lcd, api, { fields }) {
    const { h, m, s, ms } = fields;
    const sec = s + ms / 1000;
    const lit = new Set([CENTRE]);

    for (let k = 0; k < 12; k++) { const d = nearest(...polar((k * Math.PI) / 6, MARK_R)); if (d) lit.add(d); }
    const second = nearest(...polar((sec / 60) * 2 * Math.PI, SECOND_R));
    if (second) lit.add(second);

    const minuteAngle = ((m + sec / 60) / 60) * 2 * Math.PI;
    const hourAngle = (((h % 12) + m / 60) / 12) * 2 * Math.PI;
    hand(lit, minuteAngle, MINUTE_R, 0);
    // One dot wide, told apart by length: a doubled hour hand was tried and
    // merged with the minute hand into a blob at this size.
    hand(lit, hourAngle, HOUR_R, 0);

    // Cut the canvas into its six tiles.
    const alloc = new TileAllocator(lcd, 0);
    const codes = [];
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < 3; c++) {
        const tile = Array.from({ length: 8 }, () => Array(5).fill('.'));
        for (const d of lit) if (d.row === row && d.c === c) tile[d.r][d.i] = '#';
        const rows = tile.map((l) => l.join(''));
        codes.push(rows.every((l) => l === '.....') ? 0x20 : alloc.add(rows));
      }
    alloc.flush();

    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    codes.forEach((code, n) => { grid[Math.floor(n / 3)][DIAL_COL + (n % 3)] = code; });
    const write = (row, text) => [...text].forEach((ch, i) => { grid[row][TEXT_COL + i] = ch.charCodeAt(0); });
    write(0, DAYS.find((d) => d.startsWith(fields.dow)));
    write(1, `${fields.day} ${MONTHS.find((x) => x.startsWith(fields.month))}`);

    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
