// Full house — HH:MM:SS with no factory characters at all, on all eight slots.
//
//   . . . . 1 0 : 2 3 : 4 5 . . . .
//   . . . . . . . . . . . . . . . .
//
// Every one of the 32 cells shows a CGRAM slot on every frame, the blank
// included, so the glass is entirely the design's: there is no ROM space for a
// stray pixel to come from. The cost is exact. Each distinct digit on screen
// is a slot, the colon is a slot and the blank is a slot, and a time like
// 10:23:45 has six different digits: eight, all of them, at the worst second
// of the day. Allocation is digits first, then colon, then blank, and the sum
// can never pass eight, so nothing ever falls back.
//
// Owning the blank means it can carry something. Here it carries the seconds
// a second time: every blank cell holds one dot, on the cell's middle row,
// and all 24 of them step across their cells together, a column every 200 ms,
// so the whole field ticks over once a second. The colon breathes on the
// same beat: big on the tick, a cross, then small beads for the rest of the
// second.
//
// The digits use all eight dot rows, which ROM digits never do: two-dot
// verticals and one-dot bars, squared, the seconds face from `slab` stretched
// to the full cell.

import { TileAllocator } from '../js/kit.js';

const FPS = 10;
const DIGITS = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '####.', '...##', '...##', '...##', '####.'],
  6: ['.###.', '##...', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};

// The colon through one second: a beat, then settling.
const COLON = {
  big: ['.###.', '.###.', '.###.', '.....', '.....', '.###.', '.###.', '.###.'],
  cross: ['..#..', '.###.', '..#..', '.....', '.....', '..#..', '.###.', '..#..'],
  small: ['.....', '..#..', '.....', '.....', '.....', '.....', '..#..', '.....'],
};
const colonAt = (frac) => (frac < 0.2 ? COLON.big : frac < 0.4 ? COLON.cross : COLON.small);

/** The blank: one dot on row 3, in column `x`. */
const blankAt = (x) => Array.from({ length: 8 }, (_, r) => (r === 3 ? '.....'.slice(0, x) + '#' + '.....'.slice(x + 1) : '.....'));

const LEFT = 4;                       // "HH:MM:SS" in columns 4-11 of the top row
const ROW = 0;

export default {
  name: 'Full house',
  blurb: 'HH:MM:SS with no factory characters: all eight slots, the blank\'s dots ticking the seconds across the whole glass.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,
  romFree: true,

  frame(lcd, api, { fields }) {
    const frac = fields.ms / 1000;
    const text = `${fields.hh}:${fields.mm}:${fields.ss}`;

    const alloc = new TileAllocator(lcd, 0);
    const codes = [...text].map((ch) => (ch === ':' ? null : alloc.add(DIGITS[ch])));
    const colon = alloc.add(colonAt(frac));
    const blank = alloc.add(blankAt(Math.min(4, Math.floor(frac * 5))));
    alloc.flush();

    const grid = [Array(16).fill(blank), Array(16).fill(blank)];
    codes.forEach((code, i) => { grid[ROW][LEFT + i] = code ?? colon; });
    grid.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
