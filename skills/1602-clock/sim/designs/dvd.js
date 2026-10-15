// DVD — the screensaver logo, waiting for the corner.
//
// A little disc logo drifts diagonally one dot every 200 ms and bounces off
// the edges of the glass. It can't change colour, so on every bounce its disc
// swaps between solid and a ring, and for the one step it touches a wall it
// squashes flat against it. A negative logo (lit plate, dark letters) was
// tried for the colour change first; at four dots tall the letters vanished.
//
// The path is a lattice. The logo is 15 dots by 8 and moves in dot columns
// (five per cell, hopping the gaps, so the letters never lose a stroke), so
// its corner travels 65 columns by 8 rows. 65 and 8 share no factor: leaving
// one corner, it next meets two walls at once after 65 x 8 = 520 steps,
// and that is the only time it does. On the way it touches the side walls
// seven times, and each time it is 1, 2, 3, 4, 3, 2, 1 dots from the corner.
// So the first and last laps are near misses ("so close!", in ROM), and the
// eighth arrival is a true corner hit, dot for dot. 520 steps is 104 s; with
// an 8.5 s celebration the cycle is 112.5 s, which divides the day, so it
// runs on from midnight without a jump. Odd cycles fly the mirror image, so
// the hits alternate between the two left corners. (A 17-dot logo was tried
// first: at some positions it covered five cells, ten tiles.)
//
// The corner hit: the glass flashes solid three times (0xff everywhere, the
// logo cut out of it), then CORNER! and ROM confetti, and the count of corner
// hits so far today.
//
// The logo covers at most 4 cells by 2 rows: 8 tiles at worst, nothing else
// is custom. Sitting in a corner it is in one row, 4 tiles; the flash costs
// nothing more, since every cell off the logo is ROM 0xff.

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 10;
const STEP = 0.2;                     // seconds per dot of travel
const W = 15, H = 8;                  // logo, in dots: 15 wide never covers 5 cells
const LX = 80 - W, LY = 16 - H;       // 65 x 8: coprime, so one corner per flight
const STEPS = LX * LY;                // steps from corner to corner
const FLY = STEPS * STEP;             // 104 s
const CYCLE = 112.5;                  // flight + celebration; 768 a day

// Two looks, swapped on every bounce: the disc solid, or a ring.
const SOLID = [
  '###..#...#.###.',
  '#..#.#...#.#..#',
  '#..#..#.#..#..#',
  '###....#...###.',
  '...............',
  '..###########..',
  '######...######',
  '..###########..',
];
const RING = [...SOLID.slice(0, 5), '..###########..', '#.............#', '..###########..'];
/** The logo squashed against a wall for one step: a row or the letter spaces dropped. */
function squash(look, side) {
  if (!side) return look.filter((_, r) => r !== 4);
  return look.map((line) => [...line].filter((_, i) => i !== 4 && i !== 10).join(''));
}

/** Reflect step n into [0, L], as a coordinate bouncing between two walls. */
function tri(n, L) {
  const p = n % (2 * L);
  return p <= L ? p : 2 * L - p;
}

const CONFETTI = [0x2a, 0x2b, 0xa5, 0xdf, 0x2e, 0x27, 0x2c, 0x6f];

export default {
  name: 'DVD',
  blurb: 'The bouncing screensaver logo. It nearly hits the corner, and every 112.5 s it really does.',
  bus: 'i2c100',
  panel: 'gray',
  fps: FPS,

  frame(lcd, api, { fields }) {
    const T = fields.h * 3600 + fields.m * 60 + fields.s + fields.ms / 1000;
    const c = Math.floor(T / CYCLE), u = T - c * CYCLE;
    const mirror = c % 2 === 1;       // odd cycles start at the bottom
    const rom = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const field = Array.from({ length: 16 }, () => new Uint8Array(80));
    let x, y, look, flash = false;

    if (u < FLY) {
      const n = Math.floor(u / STEP);
      x = tri(n, LX);
      y = mirror ? LY - tri(n, LY) : tri(n, LY);
      // One swap per wall touched so far; a corner touches two.
      look = (Math.floor(n / LX) + Math.floor(n / LY)) % 2 ? RING : SOLID;
      // The step it touches a wall, it squashes against it.
      if (n > 0 && n % LX === 0) { look = squash(look, true); if (x) x += 2; }
      else if (n > 0 && n % LY === 0) { look = squash(look, false); if (y) y += 1; }

      // A side wall reached, not in the corner: say how close it was.
      const lap = Math.floor(n / LX), since = n - lap * LX;
      if (lap >= 1 && lap < LY && since < 12) {
        const at = mirror ? LY - tri(lap * LX, LY) : tri(lap * LX, LY);
        const miss = Math.min(at, LY - at);
        const words = miss === 1 ? 'so close!' : miss === 2 ? 'almost..' : '';
        const row = at < LY / 2 ? 0 : 1;
        const right = lap % 2 === 1;  // odd laps end on the right wall
        const col = right ? 1 : 15 - words.length;
        [...words].forEach((ch, i) => { rom[row][col + i] = ch.charCodeAt(0); });
      }
    } else {
      // The celebration, in the corner it arrived at.
      const v = u - FLY;
      x = 0;
      y = mirror ? 0 : LY;
      const row = y ? 1 : 0, other = 1 - row;
      if (v < 1.8) {
        flash = Math.floor(v / 0.3) % 2 === 0;
        look = SOLID;
      } else {
        look = Math.floor(v / 0.5) % 2 ? RING : SOLID;
        if (v < CYCLE - FLY - 0.6) {
          [...'CORNER!'].forEach((ch, i) => { rom[row][5 + i] = ch.charCodeAt(0); });
          const count = `#${c + 1}`;
          [...count].forEach((ch, i) => { rom[row][15 - count.length + 1 + i] = ch.charCodeAt(0); });
          const k = Math.floor(v / 0.3);
          for (let col = 0; col < 16; col++) {
            const r = noise(col * 7 + k * 13, c);
            if (r < 0.4) rom[other][col] = CONFETTI[Math.floor(noise(col + k * 5, c + 1) * CONFETTI.length)];
          }
        }
      }
      if (flash) rom.forEach((line) => line.fill(0xff));
    }

    // The logo, into a dot field: x in dot columns, five per cell.
    look.forEach((line, r) => [...line].forEach((ch, i) => { if (ch === '#') field[y + r][x + i] = 1; }));
    const w = look[0].length, h = look.length;
    const lx0 = Math.floor(x / 5), lx1 = Math.floor((x + w - 1) / 5);
    const ly0 = y >> 3, ly1 = (y + h - 1) >> 3;

    // Cells under the logo become tiles; everything else stays ROM. In a
    // flash the logo is cut out of a solid glass.
    const alloc = new TileAllocator(lcd, 0);
    const out = rom.map((line) => line.slice());
    for (let row = ly0; row <= ly1; row++) {
      for (let col = lx0; col <= lx1; col++) {
        const tile = [];
        for (let r = 0; r < 8; r++) {
          let bits = 0;
          for (let i = 0; i < 5; i++) {
            if (field[row * 8 + r][col * 5 + i] !== (flash ? 1 : 0)) bits |= 0x10 >> i;
          }
          tile.push(bits);
        }
        const blank = tile.every((b) => b === 0), full = tile.every((b) => b === 0x1f);
        if (full) out[row][col] = 0xff;
        else if (!blank) {
          // Ink over whatever ROM text is under it, as Stage does.
          const base = lcd.glyph(rom[row][col]);
          const code = alloc.add(tile.map((b, r) => (b | (flash ? 0 : base[r])) & 0x1f));
          out[row][col] = code ?? rom[row][col];
        }
      }
    }
    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((code) => lcd.data(code)); });
  },
};
