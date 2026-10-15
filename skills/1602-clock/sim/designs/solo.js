// Solo — one numeral on the glass, a rock in the sea, and the tide is the
// seconds.
//
// The hour (twelve-hour, 1 to 12) stands in the middle of the glass as one
// big block numeral. The rest of the glass is sky above and sea below, and
// the sea rises: over each minute the tide comes in a dot row every few
// seconds, up the glass and up the numeral, until by :59 only the top of it
// is dry. At :00 it goes out with a rush and the next minute's tide starts
// low again. So the water level is the seconds hand, read at a glance as
// "how far up the rock".
//
// The minutes are a sailing boat riding on the water. Its place along the
// glass is the minutes past the hour: at the left edge on the hour, up to
// the rock by :29, behind it at half past (it sails across in four seconds
// and is hidden by the stone), and on to the right edge by :59; at the hour it
// sails off the right and comes back in at the left. It rides the tide, bobs,
// and sits in a patch of calm water so the hull reads against the waves.
//
// The water is a sparse dither below a wavy surface line. Its pattern repeats
// exactly every cell (five dots, as in `tide` and `runner`), so every sea
// cell in a row is the same tile, and the waves travel by shifting that one
// tile a dot every 0.45 s. A row wholly above water is ROM blank; a row wholly
// below is the one "deep" tile. The numeral is the block kit from
// `hourglass` (bars, and ROM 0xff for strokes), so its solid cells are free
// in any water and a row of it costs one tile at most. 10, 11 and 12 use a
// narrow 1 (a stroke with a flag) so the two figures fit the same rock.
//
// At night a few stars (ROM 0xa5) twinkle in the cells that are still plain
// sky, so the rising tide puts them out one by one.
//
// Allocation order: numeral first, then sea, then the boat. The boat is kept
// to two cells across (nudged a dot when it would touch a third), its bob
// never takes the hull into the next row of cells, and the swell never
// crosses the row boundary; with those three rules a frame never asks for
// more than eight tiles, checked at every tenth of a second of the day.

import { TileAllocator, clamp, noise } from '../js/kit.js';

const FPS = 10;
const W = 80, H = 16;                  // the dot field, gaps not counted

// Tide: the top row of water, in dot rows from the top of the glass.
const LOW = 14, HIGH = 4;              // two rows of sea at :02, the rock all but drowned at :59
const EBB = 2.0;                       // seconds the tide takes to go out at :00
const WAVE_STEP = 0.45;                // seconds per dot the waves travel

// The surface, per column within a cell: a one-dot swell, period one cell.
const SWELL = [0, -1, -1, 0, 1];
// The water below it: a short ripple every third row, staggered, so the sea
// reads as water and the stone stays readable through it.
const wet = (i, d) => d % 3 === 0 && ((i + d) % 5) < 2;

// The block kit from `hourglass`: '#' a solid cell (ROM 0xff), ' ' empty,
// T top bar, M top and middle bars, B bottom bar (three dots each).
const BAR = { T: [0, 1, 2], M: [0, 1, 2, 5, 6, 7], B: [5, 6, 7] };
// The narrow 1's flag, a short diagonal down from the top of the stroke. A
// full top bar there read as a 7.
const FLAG = ['...##', '..###', '.###.', '###..', '##...', '.....', '.....', '.....'];
const DIGITS = {
  0: ['#T#', '#B#'],
  1: ['f# ', 'B#B'],
  2: ['MM#', '#BB'],
  3: ['MM#', 'BB#'],
  4: ['#B#', '  #'],
  5: ['#MM', 'BB#'],
  6: ['#MM', '#B#'],
  7: ['TT#', '  #'],
  8: ['#M#', '#B#'],
  9: ['#M#', 'BB#'],
};
const NARROW_ONE = ['f#', ' #'];       // a stroke with a flag, for 10, 11, 12

/** The hour as part strings for the two rows. */
function sign(h12) {
  if (h12 < 10) return DIGITS[h12];
  const second = h12 === 11 ? NARROW_ONE : DIGITS[h12 % 10];
  return [0, 1].map((r) => `${NARROW_ONE[r]} ${second[r]}`);
}

// The boat, facing right: a sail on a mast, and a hull whose bottom row sits
// on the water.
const BOAT = [
  '..#....',
  '..##...',
  '..###..',
  '..####.',
  '#######',
  '.#####.',
];

const STARS = [1, 3, 12, 14];          // top-row cells that may hold a star at night
const CROSS = 4.0;                     // seconds to sail behind the rock at :30
const WRAP = 3.0;                      // seconds to sail off the right and in at the left at :00

/**
 * The boat's left edge. `left` is the last dot it may reach before the rock,
 * `right` the first after it. At :30 it sails behind the rock, hidden by it;
 * at :00 it sails off the right edge and comes back in at the left.
 */
function boatX(m, sec, left, right, bw) {
  const lo = 1, hi = W - bw - 1;
  const leftEnd = left - bw, rightStart = right;
  const at = (min) => (min < 30
    ? lo + Math.round((min / 29) * (leftEnd - lo))
    : rightStart + Math.round(((min - 30) / 29) * (hi - rightStart)));
  if (m === 30 && sec < CROSS) return Math.round(leftEnd + (rightStart - leftEnd) * (sec / CROSS));
  if (m === 0 && sec < WRAP) {
    const u = sec / WRAP, span = (W - hi) + bw + lo;
    const x = hi + Math.round(u * span);
    return x >= W ? x - W - bw : x;
  }
  return at(m);
}

/** The tide's top water row at second `sec` of the minute. */
function tideAt(sec) {
  const span = LOW - HIGH;
  if (sec < EBB) return HIGH + Math.min(span, Math.floor((sec / EBB) * (span + 1)));
  const u = (sec - EBB) / (60 - EBB);
  return LOW - Math.min(span, Math.floor(u * (span + 1)));
}

/** The picture: H rows of W booleans, without and with the boat. */
export function picture(fields, sec, T) {
  const w = tideAt(sec);
  const phase = Math.floor(T / WAVE_STEP);
  // The swell never crosses from one row of cells into the other: that would
  // put a surface tile in both rows at once, one more than the budget has.
  const [top, bottom] = w >= 8 ? [8, 15] : [0, 7];
  const surface = (x) => clamp(w + SWELL[(((x % 5) - phase) % 5 + 5) % 5], top, bottom);

  const parts = sign(fields.h % 12 || 12);
  const n = parts[0].length, c0 = Math.floor((16 - n) / 2);
  const rock = (x, y) => {
    const c = Math.floor(x / 5) - c0;
    if (c < 0 || c >= n) return false;
    const p = parts[y >> 3][c];
    if (p === 'f') return FLAG[y & 7][x % 5] === '#';
    return p === '#' || (p in BAR && BAR[p].includes(y & 7));
  };

  const px = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    if (rock(x, y)) return true;
    const s = surface(x);
    return y === s || (y > s && wet(x % 5, y - w));
  }));

  // The boat: minutes past the hour along the open water, left of the rock
  // for :00-:29 and right of it for :30-:59. It rides the tide with a slow
  // bob, and a dark halo keeps it clear of the waves.
  const boat = px.map((row) => [...row]);
  const bw = BOAT[0].length, bh = BOAT.length;
  // A 7-dot boat starting on a cell's last column would touch three cells;
  // nudging it one dot keeps it to two, which is what the budget allows.
  let bx = boatX(fields.m, sec, c0 * 5 - 2, (c0 + n) * 5 + 1, bw);
  if (((bx % 5) + 5) % 5 === 4) bx += 1;
  // The bob never takes the hull down into the next row of cells.
  const bob = Math.floor(T / 0.9) % 2;
  const by = Math.min(w - bh + 1 + bob, bottom - bh + 1);
  const inRock = (x) => x >= c0 * 5 && x < (c0 + n) * 5;
  const mask = new Set();
  BOAT.forEach((line, r) => [...line].forEach((ch, i) => {
    if (ch === '#' && !inRock(bx + i)) mask.add((by + r) * W + bx + i);
  }));
  // Calm water round the boat: its box and a dot either side are cleared, so
  // the hull reads against the waves. The clearing stays inside the cells the
  // boat already occupies, so it never costs a slot of its own.
  const cellOf = (x, y) => (y >> 3) * 16 + Math.floor(x / 5);
  const boatCells = new Set([...mask].map((k) => cellOf(k % W, Math.floor(k / W))));
  for (let yy = by - 1; yy <= by + bh; yy++) for (let xx = bx - 1; xx <= bx + bw; xx++) {
    if (yy >= 0 && yy < H && xx >= 0 && xx < W && !inRock(xx) && boatCells.has(cellOf(xx, yy))) boat[yy][xx] = false;
  }
  for (const k of mask) {
    const y = Math.floor(k / W), x = k % W;
    if (y >= 0 && y < H && x >= 0 && x < W) boat[y][x] = true;
  }
  return { px, boat, rockCols: [c0, c0 + n - 1] };
}

const tileOf = (px, col, row) => px.slice(row * 8, row * 8 + 8)
  .map((line) => line.slice(col * 5, col * 5 + 5).map((v) => (v ? '#' : '.')).join(''));
const SOLID = '#####', CLEAR = '.....';
const romOf = (tile) => (tile.every((l) => l === SOLID) ? 0xff : tile.every((l) => l === CLEAR) ? 0x20 : null);

export default {
  name: 'Solo',
  blurb: 'One numeral, the hour, stands in the sea; the tide rising up it is the seconds, a boat sailing past is the minutes.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const T = date.getTime() / 1000;
    const { px, boat, rockCols } = picture(fields, sec, T);

    // Every cell, in allocation order: the rock, then the sea, then the boat.
    const cells = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const base = tileOf(px, col, row), withBoat = tileOf(boat, col, row);
      const boatHere = base.join() !== withBoat.join();
      const isRock = col >= rockCols[0] && col <= rockCols[1];
      cells.push({ col, row, base, withBoat, boatHere, rank: isRock ? 0 : 1 });
    }

    const alloc = new TileAllocator(lcd, 0);
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const place = (tile) => romOf(tile) ?? alloc.add(tile);
    for (const rank of [0, 1]) for (const c of cells) {
      if (c.rank === rank && !c.boatHere) codes[c.row][c.col] = place(c.base) ?? 0x20;
    }
    for (const c of cells) {
      if (c.boatHere) codes[c.row][c.col] = place(c.withBoat) ?? place(c.base) ?? 0x20;
    }
    alloc.flush();

    // At night, stars in the open sky: ROM, so free, and only in cells that
    // are still plain sky, so the rising tide puts them out one by one.
    if (fields.h >= 20 || fields.h < 6) {
      for (const col of STARS) {
        const lit = noise(Math.floor(T / 1.3) * 7 + col, 4) > 0.35;
        if (lit && codes[0][col] === 0x20) codes[0][col] = 0xa5;
      }
    }
    codes.forEach((line, row) => { lcd.setCursor(0, row); line.forEach((code) => lcd.data(code)); });
  },
};
