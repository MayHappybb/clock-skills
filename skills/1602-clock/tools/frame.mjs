// Print a design's frame as ASCII dot art, straight from the emulator.
//
//   node tools/frame.mjs <design> [--t 0] [--clock 10:09:30] [--bus i2c400]
//
// This is the fastest way to check what the controller actually holds, without
// a browser in the loop: '#' is a lit dot, '.' an unlit one, and the two
// character rows are separated by a blank line.

import { buildFrame } from '../sim/js/player.js';
import { DOT_COLS, DOT_ROWS } from '../sim/js/hd44780.js';

const argv = process.argv.slice(2);
const opts = { t: 0, clock: '10:09:30' };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const design = positional[0];
if (!design) {
  console.error('usage: node tools/frame.mjs <design> [--t 0] [--clock HH:MM:SS]');
  process.exit(2);
}

const { lcd, design: d, report } = buildFrame(design, {
  t: Number(opts.t ?? 0),
  clock: opts.clock,
  bus: opts.bus,
});

console.log(`${d.name}  @ t=${opts.t ?? 0}s  clock=${opts.clock}`);
// Judged against the design's own frame rate: a 4 fps clock does not need 60.
const want = d.fps ?? 30;
console.log(`frame: ${(report.totalUs / 1000).toFixed(2)} ms on ${report.bus} -> ` +
  `bus allows ${report.fps === Infinity ? 'inf' : report.fps.toFixed(1)} fps, design runs at ${want}: ` +
  (report.fps >= want ? 'fits' : 'TOO SLOW for this bus'));
if (report.hazards.length) console.log(`TRAP #1: CGRAM slot ${report.hazards.join(', ')} rewritten after a cell showing it was drawn`);
console.log();

if (d.rotate === 90) {
  // Portrait: the module turned clockwise, viewed upright. 16 dots across
  // (two viewer columns of 8), 80 down, a blank line between viewer cells.
  const dot = (x, y) => {
    const R = 15 - x, col = Math.floor(y / 5);
    return (lcd.glyph(lcd.codeAt(col, R >> 3))[R & 7] >> (4 - (y % 5))) & 1;
  };
  for (let y = 0; y < 80; y++) {
    if (y && y % 5 === 0) console.log();
    let line = '';
    for (let x = 0; x < 16; x++) line += (x === 8 ? ' ' : '') + (dot(x, y) ? '#' : '.');
    console.log(line);
  }
  process.exit(0);
}

for (let row = 0; row < lcd.rows; row++) {
  for (let r = 0; r < DOT_ROWS; r++) {
    let line = '';
    for (let c = 0; c < lcd.cols; c++) {
      const bits = lcd.glyph(lcd.codeAt(c, row))[r] ?? 0;
      for (let i = 0; i < DOT_COLS; i++) line += (bits >> (4 - i)) & 1 ? '#' : '.';
      line += c === lcd.cols - 1 ? '' : ' ';
    }
    console.log(line);
  }
  if (row < lcd.rows - 1) console.log();
}