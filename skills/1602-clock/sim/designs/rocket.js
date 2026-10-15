// Rocket — one flight an hour, the module stood on its end.
//
// The module is turned a quarter turn (`rotate: 90`): the glass is 16 dots
// wide and 80 tall, a column of sky. A rocket climbs it through the hour, its
// altitude the minutes: just clear of the pad at :00, at the top of the glass
// by :59. Stars stream down past it in three layers at three speeds, so it is
// always visibly flying even though it rises only a dot every minute and a
// half. At :30 the booster separates, tumbles and falls away, and the upper
// stage lights its own engine. From :40 the Moon comes down into view at the
// top left. At :59:20 the rocket accelerates out of the top of the glass.
//
// Then the pad: ground, a lattice gantry and a fresh rocket, with a countdown
// beside the tower from :59:50. At :00 it ignites, smoke billows round the
// pad, and it lifts off while the ground and the gantry drop away beneath it.
//
// Everything that does not move dot by dot is ROM, read sideways: the stars
// are 0xa5, '.', '+' and '*', the gantry is '#' (a lattice on its side), the
// ground is '|' (a bar on its side) and the smoke is 'o' and 'O'. They step a
// whole cell at a time, which is what stars streaming past ought to do.
// CGRAM goes on the rocket and its flame (three or four cells: it is eight
// dots wide, exactly one viewer column, so it never pays for both), the time
// as 3x5 digit pairs (two), the Moon (two) and the countdown (one).

import { TileAllocator, portraitTile, portraitMM, noise, clamp } from '../js/kit.js';

const FPS = 12;
const W = 16, H = 80;

// -------------------------------------------------------------- the picture

const blank = () => Array.from({ length: H }, () => new Uint8Array(W));
const set = (px, x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = 1; };
const paint = (px, rows, x0, y0) => rows.forEach((line, r) =>
  [...line].forEach((ch, i) => { if (ch === '#') set(px, x0 + i, y0 + r); }));

/**
 * Turn the picture into cells and write them. A solid cell is ROM 0xff, an
 * empty one shows `rom` for that cell if there is one (a star, the gantry)
 * or a space; anything else is a tile, allocated in the order `first` gives
 * and then top to bottom.
 */
function emit(lcd, px, rom, first) {
  const alloc = new TileAllocator(lcd, 0);
  const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
  const view = (vc, vr) => Array.from({ length: 5 }, (_, i) =>
    Array.from({ length: 8 }, (_, x) => (px[vr * 5 + i][vc * 8 + x] ? '#' : '.')).join(''));
  const order = [...first];
  for (let vr = 0; vr < 16; vr++) for (const vc of [0, 1]) {
    if (!order.some(([c, r]) => c === vc && r === vr)) order.push([vc, vr]);
  }
  for (const [vc, vr] of order) {
    const v = view(vc, vr);
    if (v.every((l) => l === '########')) codes[vc][vr] = 0xff;
    else if (v.every((l) => l === '........')) codes[vc][vr] = rom.get(vc * 16 + vr) ?? 0x20;
    else codes[vc][vr] = alloc.add(portraitTile(v)) ?? 0x20;
  }
  alloc.flush();
  for (const [row, vc] of [[0, 1], [1, 0]]) {
    lcd.setCursor(0, row);
    for (let vr = 0; vr < 16; vr++) lcd.data(codes[vc][vr]);
  }
}

const DIGIT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};
const pair = (px, str, x0, y0) => [...str].forEach((d, i) => paint(px, DIGIT[d], x0 + i * 4, y0));

// ------------------------------------------------------------------ rocket

const RX = 8;                          // the rocket flies in the right-hand column
// Upper stage (rows 0-5) on the booster (rows 6-9).
const UPPER = [
  '...##...',
  '..####..',
  '..#..#..',
  '..####..',
  '..####..',
  '..####..',
];
const BOOSTER = [
  '..####..',
  '.######.',
  '##.##.##',
  '#..##..#',
];
const TUMBLE = [                        // the spent booster, on its way down
  ['..####..', '.######.', '##.##.##', '#..##..#'],
  ['...###..', '..####..', '.#####..', '.#..##..'],
  ['#..##..#', '##.##.##', '.######.', '..####..'],
  ['..###...', '..####..', '..#####.', '..##..#.'],
];

/** Exhaust below `y`: a flickering tongue, each shape held 160 ms or more. */
function exhaust(px, y, T, size) {
  const k = Math.floor(T / 0.16), n = noise(k, 5);
  const long = size === 'big' ? 5 + Math.floor(n * 3) : size === 'small' ? 1 + Math.floor(n * 2) : 2 + Math.floor(n * 3);
  for (let r = 0; r < long; r++) {
    const wide = r === 0 && size !== 'small' ? '..####..' : r < long - 1 ? '...##...' : (n > 0.5 ? '...#....' : '....#...');
    paint(px, [wide], RX, y + r);
  }
}

// ------------------------------------------------------------------ timing

const TOP0 = 52, TOP59 = 4;            // nose row at 0 and 59.5 minutes
const PAD_TOP = 62;                    // nose row standing on the pad (base at 71)
const EXIT = 59 * 60 + 20, PAD = 59 * 60 + 45, COUNT = 59 * 60 + 50;
const LIFT = 4.0;                      // seconds from ignition to cruise
const SEP = 30 * 60;                   // staging, seconds into the hour

/** Nose row through the hour, `S` seconds in, while cruising. */
const cruiseTop = (S) => Math.round(TOP0 - ((TOP0 - TOP59) * S) / (59.5 * 60));

// Star layers: [glyph, seconds per cell, count]. Far stars are small and slow.
const LAYERS = [[0x2e, 0.9, 5], [0xa5, 0.5, 4], [0x2b, 0.3, 2], [0x2a, 0.22, 1]];

/** Stars as ROM cells, streaming down a cell per step; `still` holds them. */
function stars(rom, T, still) {
  LAYERS.forEach(([code, step, count], li) => {
    for (let k = 0; k < count; k++) {
      const id = li * 10 + k;
      const vc = noise(id, 41) < 0.5 ? 0 : 1;
      const run = still ? 0 : Math.floor(T / step);
      const vr = Math.floor(noise(id, 42) * 15 + run) % 15;
      rom.set(vc * 16 + vr, code);
    }
  });
}

/** The Moon, drawn round in mm, its centre at viewer dot (3.5, cy), with two craters. */
function moon(px, cy) {
  const c = portraitMM(3.5, cy), r = 2.6;
  for (let y = Math.max(0, Math.floor(cy) - 6); y <= Math.min(H - 1, Math.ceil(cy) + 6); y++) {
    for (let x = 0; x < 8; x++) {
      const p = portraitMM(x, y), d = Math.hypot(p.x - c.x, p.y - c.y);
      const crater = (Math.abs(x - 2) + Math.abs(y - Math.round(cy - 1)) === 0) || (x === 5 && y === Math.round(cy + 2));
      if (d <= r && !crater) set(px, x, y);
    }
  }
}

// -------------------------------------------------------------- the design

export default {
  name: 'Rocket',
  blurb: 'Portrait. A rocket climbs the glass through the hour past streaming ROM stars, stages at :30, and a new one launches on the hour.',
  bus: 'i2c100',
  panel: 'blue',
  fps: FPS,
  rotate: 90,

  frame(lcd, api, { fields, date }) {
    const px = blank();
    const rom = new Map();
    const T = date.getTime() / 1000;
    const S = fields.m * 60 + fields.s + fields.ms / 1000;
    const first = [[0, 15], [1, 15]];

    pair(px, fields.hh, 0, 75);
    pair(px, fields.mm, 9, 75);

    if (S >= PAD || S < LIFT) {
      // ------------------------------------------------- the pad and the launch
      const lift = S < LIFT ? S : -1;
      // The ground and the gantry drop away a cell at a time after lift-off.
      const drop = lift < 0 ? 0 : Math.floor(Math.max(0, lift - 0.8) / 0.3);
      stars(rom, T, lift < 0);
      for (let vr = 0; vr < 15; vr++) if (rom.has(16 + vr) && vr >= 9) rom.delete(16 + vr);
      for (let vr = 9; vr <= 13; vr++) {
        const at = vr + drop;
        if (at <= 14) rom.set(at, 0x23);
      }
      if (14 + drop <= 14) { rom.set(14, 0x7c); rom.set(16 + 14, 0x7c); }

      // The rocket: on the pad, then rising to cruise, slowly then quickly.
      const top = lift < 0 ? PAD_TOP : Math.round(PAD_TOP - (PAD_TOP - TOP0) * clamp((lift - 0.6) / (LIFT - 0.6), 0, 1) ** 2);
      paint(px, UPPER, RX, top);
      paint(px, BOOSTER, RX, top + UPPER.length);
      if (lift >= 0) {
        exhaust(px, top + 10, T, lift < 2.5 ? 'big' : 'mid');
        // Smoke billows round the pad, in ROM, while the rocket clears it.
        if (lift < 2.6) {
          const puff = Math.floor(lift / 0.35);
          rom.set(13 - Math.min(2, Math.floor(puff / 2)), puff % 2 ? 0x4f : 0x6f);
          if (drop === 0) rom.set(14, 0x4f);
        }
      }
      // The countdown beside the gantry.
      if (S >= COUNT) {
        pair(px, String(Math.ceil(60 * 60 - S)).padStart(2, '0'), 0, 40);
        first.push([0, 8]);
      }
    } else {
      // ------------------------------------------------------------- the flight
      stars(rom, T, false);
      if (S >= 40 * 60) moon(px, clamp(-7 + (S - 40 * 60) / 50, -7, 5));

      let top = cruiseTop(S);
      if (S >= EXIT) top = Math.round(cruiseTop(EXIT) - 0.5 * ((S - EXIT) / 0.35) ** 2);

      if (S < SEP) {
        paint(px, UPPER, RX, top);
        paint(px, BOOSTER, RX, top + UPPER.length);
        exhaust(px, top + 10, T, 'mid');
      } else {
        // Staging: the booster drops back, its flame out, then tumbles away;
        // the upper stage lights its own engine a moment later.
        const u = S - SEP;
        paint(px, UPPER, RX, top);
        if (u < 8) {
          const fall = u < 0.6 ? 1 : Math.round(1 + 0.6 * ((u - 0.6) / 0.25) ** 1.6);
          const by = top + UPPER.length + fall;
          if (by < 70) paint(px, u < 0.6 ? BOOSTER : TUMBLE[Math.floor(u / 0.4) % 4], RX, by);
        }
        if (u >= 1.0) exhaust(px, top + UPPER.length, T, u < 1.4 ? 'small' : 'mid');
      }
    }

    emit(lcd, px, rom, first);
  },
};
