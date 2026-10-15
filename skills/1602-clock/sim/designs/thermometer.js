// Thermometer — the module stood on end, and the hour measured in mercury.
//
// A glass thermometer down the left-hand viewer column: a rounded cap, a tube
// of twelve cells, and a bulb full of mercury at the bottom. The column rises
// one dot a minute, so every viewer cell is five minutes and the glass's own
// seams between cells are the scale. A small tick on the left marks each five
// minutes, and the quarter hours have long marks on the right, which are ROM
// '|' seen sideways (a seven-dot line across the middle of a cell): free.
//
// The exact minute rides up beside the top of the column, as two 3x5 digits
// in one cell, the way a pointer on a gauge carries its reading. The hour sits
// on a label beside the bulb.
//
// The seconds are a heartbeat: the dot just above the mercury pulses once a
// second, and each pulse lasts longer than the last, from a blink at :01 to
// nine tenths of a second at :59, so the next minute's dot fills in by itself
// just before it is counted. On the hour the mercury drains back to the bulb
// a cell at a time, 180 ms a cell, with the pointer counting down beside it,
// while the new hour comes up on the label.
//
// Budget: the thermometer is drawn as one 8x80 picture and cut into cells, so
// identical cells share a tile. However full the column is, it has at most a
// cap, empty tube, full tube, one partly filled cell and two bulb cells: six.
// The minute pointer and the hour label are one tile each. Eight.
//
// Tried and dropped: scale numbers (15, 30, 45) as 3x5 pairs, which cost three
// more tiles; the pointer reads better and the quarter marks need no labels.
// A surge into the cap before the drain: at :59 the column already touches the
// cap, so the surge was invisible. Tick marks at the cell edges, where the
// five-minute steps would naturally be: no ROM
// glyph seen sideways lights the edge rows of a cell, so the scale is offset by
// half a cell to put the marks where '|' draws them.

import { PortraitStage, portraitMM, clamp } from '../js/kit.js';

const FPS = 10;
const TUBE = { x0: 2, x1: 6 };          // walls; the bore is x 3-5
const CX = 4;                           // the tube's centre column
const ZERO_Y = 62;                      // the mercury's top at :00, mid-cell of row 12
const BULB = { cy: 70, r: 2.75 };       // centre row and radius (mm) of the bulb
const QUARTERS = [0, 15, 30, 45, 60];
const DRAIN_STEP = 0.18;                // the hour: the column drains a cell per step

// 3x5 digits, drawn as seen.
const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};
/** Two digits in one viewer cell, with an optional pointer notch at the left. */
const pair = (text, notch) => [0, 1, 2, 3, 4].map((y) =>
  (notch && y === 2 ? '#' : '.') + FONT[text[0]][y] + '.' + FONT[text[1]][y]);

/** Is (x, y) inside the bulb? Drawn in mm, so it is round across the seam. */
function inBulb(x, y) {
  const p = portraitMM(x, y), c = portraitMM(CX, BULB.cy);
  return Math.hypot(p.x - c.x, (p.y - c.y)) <= BULB.r;
}

/** The thermometer as 80 rows of 8, with the mercury's top at row `top`. */
function thermometer(top, pulse) {
  const px = Array.from({ length: 80 }, () => Array(8).fill(false));
  // The tube: walls from the cap to the bulb, the cap rounded over the bore.
  for (let y = 2; y <= 66; y++) { px[y][TUBE.x0] = true; px[y][TUBE.x1] = true; }
  px[1][TUBE.x0 + 1] = px[1][TUBE.x1 - 1] = true;
  px[0][CX] = true;
  px[1][CX] = true;
  // Five-minute ticks at the left, level with every mid-cell mark.
  for (let m = 0; m <= 60; m += 5) px[ZERO_Y - m][0] = true;
  // The bulb, full, and the mercury column above it.
  for (let y = 60; y < 80; y++) for (let x = 0; x < 8; x++) if (inBulb(x, y)) px[y][x] = true;
  for (let y = Math.max(1, top); y <= 68; y++) for (let x = TUBE.x0 + 1; x < TUBE.x1; x++) px[y][x] = true;
  if (pulse && top > 1) for (let x = TUBE.x0 + 1; x < TUBE.x1; x++) px[top - 1][x] = true;
  return px;
}

const cell = (px, vr) => px.slice(vr * 5, vr * 5 + 5).map((row) => row.map((on) => (on ? '#' : '.')).join(''));

export default {
  name: 'Thermometer',
  blurb: 'Portrait: a mercury thermometer that rises a dot a minute; the seams are the scale, the seconds a heartbeat.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,
  rotate: 90,

  frame(lcd, api, { fields }) {
    const sec = fields.s + fields.ms / 1000;
    let top = ZERO_Y - fields.m;
    let pulse = sec % 1 < Math.max(0.1, (fields.s / 60) * 0.9);
    let shown = fields.mm;

    // The hour: from full, drain a cell at a time back to the bulb.
    if (fields.m === 0 && sec < 13 * DRAIN_STEP) {
      pulse = false;
      top = Math.min(ZERO_Y, ZERO_Y - 60 + 5 * Math.floor(sec / DRAIN_STEP));
      shown = String(clamp(ZERO_Y - top, 0, 59)).padStart(2, '0');
    }

    const px = thermometer(top, pulse);
    const st = new PortraitStage(lcd);
    for (let vr = 0; vr < 16; vr++) {
      const tile = cell(px, vr);
      if (tile.some((row) => row.includes('#'))) st.pput(0, vr, tile);
    }
    // The quarter marks, then the pointer at the top of the column over them.
    for (const m of QUARTERS) st.pput(1, Math.floor((ZERO_Y - m) / 5), 0x7c);
    st.pput(1, Math.floor(Math.max(top, 0) / 5), pair(shown, true));
    st.pput(1, 14, pair(fields.hh, false));
    st.draw();
  },
};
