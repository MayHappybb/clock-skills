// Quincunx: a Galton board that tells the time.
//
// The hour is the board itself: its brass pins are set in the shape of the
// hour numeral, on the staggered quincunx lattice every bean machine uses.
// The minute is what the board produces: steel balls stacked in six glass
// tubes, little shelves holding up the balls that float, so the stacks spell
// the digits. Every second a ball drops from the hopper, rattles through the
// hour, lands on the roof over the tubes and rolls away. On the minute only
// the tubes that differ open their gates and drain, and the new digit is
// poured ball by ball: each one bounces chaotically through the pins and
// still lands in exactly the right tube. On the hour the pin board flips
// over to show the next hour on its back, and the hopper empties in a
// downpour that builds the new minutes.
//
// All physics is a pure function of time: ball paths are simulated from
// their launch with a fixed step (cached per hour layout, so the cache only
// saves work and never changes a frame).

import { sprite, previousMinute, orbit, clamp, ease } from '../js/kit.js';

const SPECIMEN = true;

// ---------------------------------------------------------------- geometry
const G = 300;            // gravity, px/s^2
const R = 2.5;            // ball radius (5 px balls)
const PIN_R = 1.5;        // pin radius
const E = 0.42;           // restitution ball/pin
const NECK_X = 64, NECK_Y = 2.5;

// Tubes: 2 digits x 3 tubes, 5 rows. Tube k's balls span x [TX[k], TX[k]+5).
const TY = 37;            // top of row 0
const FLOOR_Y = 62;
const TX = [38, 44, 50, 56, 67, 73, 79, 85];
const tubeCX = (k) => TX[k] + 2.5;
const restCY = (row) => TY + row * 5 + 2.5;

// Roof over the tubes: a shallow chevron.
const ROOF = [[37, 36.2], [64, 31.2], [91, 36.2]];
function roofY(x) {
  if (x <= 64) return ROOF[0][1] + (x - ROOF[0][0]) * (ROOF[1][1] - ROOF[0][1]) / (64 - ROOF[0][0]);
  return ROOF[1][1] + (x - 64) * (ROOF[2][1] - ROOF[1][1]) / (ROOF[2][0] - 64);
}

// Pin board: quincunx lattice, 4 px pitch, rows 3.5 px apart, odd rows
// offset by half a pitch. A digit is 7 rows x 9 half-steps.
const PIN_Y0 = 8.5, PIN_DY = 3.5;

// ------------------------------------------------------------ letterforms
// Minutes: three tubes per digit, five balls high, top row first.
const BALL_DIGITS = {
  0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '..#.', '.#..', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['..#.', '.##.', '#.#.', '####', '..#.'],
  5: ['####', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'],
};
// Column k of digit d as booleans, row 0 (top) .. 4.
const colOf = (d, k) => BALL_DIGITS[d].map((row) => row[k] === '#');

// Hours: pins on the quincunx. Each row is 9 half-steps; a pin can only sit
// where (column + row) is even, which is what makes the lattice staggered.
const PIN_DIGITS = {
  0: ['  o o o  ', ' o     o ', 'o       o', ' o     o ', 'o       o', ' o     o ', '  o o o  '],
  1: ['    o    ', '   o o   ', '  o o    ', '   o o   ', '    o    ', '   o o   ', '  o o o  '],
  2: ['  o o o  ', ' o     o ', '        o', '     o o ', '    o    ', ' o o     ', 'o o o o o'],
  3: ['o o o o  ', '       o ', '      o  ', '   o o   ', '      o  ', '       o ', 'o o o o  '],
  4: ['      o  ', '     o o ', '    o o  ', '   o   o ', '  o   o  ', ' o o o o ', '      o  '],
  5: ['o o o o o', ' o       ', 'o o o o  ', '       o ', '        o', '       o ', 'o o o o  '],
  6: ['    o o  ', '   o     ', '  o      ', ' o o o   ', 'o       o', ' o     o ', '  o o o  '],
  7: ['o o o o o', '       o ', '      o  ', '     o   ', '    o    ', '   o     ', '  o      '],
  8: ['  o o o  ', ' o     o ', '  o   o  ', '   o o   ', '  o   o  ', ' o     o ', '  o o o  '],
};
PIN_DIGITS[9] = [...PIN_DIGITS[6]].reverse().map((r) => [...r].reverse().join(''));
for (const [d, rows] of Object.entries(PIN_DIGITS)) rows.forEach((row, r) => {
  for (let i = 0; i < row.length; i++) if (row[i] === 'o' && (i + r) % 2) console.warn(`galton: pin ${d} r${r} i${i} off lattice`);
});
// Pin positions (relative to digit origin) in pixels.
const pinCells = {};
for (const [d, rows] of Object.entries(PIN_DIGITS)) {
  const cells = [];
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) if (row[i] === 'o') cells.push([i * 2 + 1.5, r * PIN_DY + 1.5]);
  });
  pinCells[d] = cells;
}

// Pins for an hour (1-12), absolute pixel coordinates (centres).
const DIGIT_W = 19, DIGIT_GAP = 6;
function hourPins(h) {
  const s = String(h);
  const w = s.length * DIGIT_W + (s.length - 1) * DIGIT_GAP;
  const x0 = Math.round(64 - w / 2);
  const out = [];
  [...s].forEach((ch, i) => {
    for (const [px, py] of pinCells[ch]) out.push([x0 + i * (DIGIT_W + DIGIT_GAP) + px, PIN_Y0 - 1.5 + py]);
  });
  return out;
}

// ---------------------------------------------------------------- sprites
const BALL = sprite(`
  .###.
  #.###
  #####
  #####
  .###.
`);
const PIN = sprite(`
  ###
  ###
  ###
`);

// ---------------------------------------------------------------- specimen
function specimen(g, t) {
  if (t >= 0.5) {
    for (let d = 0; d < 10; d++) {
      const x = 2 + (d % 5) * 25, y = 2 + Math.floor(d / 5) * 32;
      for (const [px, py] of pinCells[d]) g.blit(PIN, Math.round(x + px - 1.5), Math.round(y + py - 1.5));
    }
    return;
  }
  for (let d = 0; d < 10; d++) {
    const x = 1 + (d % 5) * 25.5, y = 1 + Math.floor(d / 5) * 32;
    for (let k = 0; k < 4; k++) {
      const col = colOf(d, k);
      col.forEach((on, r) => { if (on) g.blit(BALL, Math.round(x) + k * 6, y + r * 5); });
    }
  }
}

export default {
  name: 'Quincunx',
  blurb: 'Placeholder.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    if (SPECIMEN) return specimen(g, ctx.t);
  },
};
