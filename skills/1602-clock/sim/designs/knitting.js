// Knitting: the time is knitted.
//
// Granny sits at the right edge in her rocking chair, knitting; her kitten
// sits at her feet. The four numerals are knitted panels: every stroke is a
// column of knit stitches (a chevron two dots tall), every bar a single row
// of them. The ball of yarn she is working from sits between the hours and
// the minutes and turns a little at each click of the needles.
//
// All minute the kitten is a kitten: it sits, blinks, looks up at granny,
// flicks its tail and bats at the loose end hanging off the minute. Near the
// end of the minute it crouches, wiggles, and pounces on the end of the
// thread. Each yank undoes one row of stitches, from the top of the panel
// down, until the old digit is gone, just as the minute turns. Then granny's
// needles go fast and the new digit grows up from its cast-on edge, a row of
// stitches per click.
//
// The unravelled yarn keeps its crimp: it lies on the floor as a wavy line
// from the panel to the kitten, exactly as long as the rows that are off,
// and it shrinks back as granny knits it up again.
//
// On the hour granny has nodded off (head down, needles in her lap). The
// kitten watches her, then grabs every loose end at once and runs off along
// the floor with them: every digit that is about to change comes undone
// together and the yarn trails across the whole glass. Granny wakes with a
// start and knits it all back, and her knitting reels the tangled kitten
// home along the floor.
//
// 24 h, no leading zero: the hour's tens is a two-cell panel when there is one.
//
// Budget: the panels are built from four parts (full column F, top bar T,
// both bars M, bottom bar B), all made of the same stitch, so a digit that is
// half unravelled is just the rows from `lo` down: only F cut mid-cell is a
// new tile, and every digit in motion shares it. Rest: four parts, granny
// (two), kitten, ball. Mid-turn the ball can fall back to ROM 0xa1, a little ring.

import { TileAllocator, clockFields } from '../js/kit.js';

// ------------------------------------------------------------------ fabric

const STITCH = ['##.##', '.###.'];
const PART = { F: [0, 1, 2, 3], T: [0], M: [0, 3], B: [3] };
const DIGITS = {
  0: ['FTF', 'FBF'], 1: [' F ', 'BFB'], 2: ['MMF', 'FBB'], 3: ['MMF', 'BBF'], 4: ['FBF', '  F'],
  5: ['FMM', 'BBF'], 6: ['FMM', 'FBF'], 7: ['TTF', '  F'], 8: ['FMF', 'FBF'], 9: ['FMF', 'BBF'],
};
// 24 h without a leading zero, so the hour's tens is only ever 1 or 2: two cells wide.
const TENS = { 1: [' F', ' F'], 2: ['MF', 'FB'] };
const DCOL = [0, 3, 7, 11];
const GAPS = [2, 6, 10];
const BALL_COL = 6, KIT_COL = 14, GRAN_COL = 15;

const BLANK = '.....';
/** A part's tile in cell row `row`, with only stitch rows >= lo (0..8, over both cell rows). */
function partTile(p, row, lo) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const on = PART[p].includes(i) && row * 4 + i >= lo;
    out.push(on ? STITCH[0] : BLANK, on ? STITCH[1] : BLANK);
  }
  return out;
}
const isBlank = (t) => t.every((r) => !r.includes('#'));

// ------------------------------------------------------------------ granny

// Five dots by sixteen at the right edge, facing out of the glass: a bun,
// her face with two eyes behind the spectacles, the shawl; her arms and the
// needles over the work in her lap, skirt, and the rocker. Rocking dips her
// head a dot.
const HEAD = {
  awake: ['.##..', '####.', '.###.', '#...#', '##.##', '#...#', '.###.', '#####'],
  look:  ['.##..', '####.', '.###.', '#...#', '#.#.#', '#...#', '.###.', '#####'],  // peering over the specs at the kitten
  doze:  ['.....', '.##..', '####.', '.###.', '#...#', '#####', '#...#', '.###.'],  // nodding, eyes shut
  start: ['#.#.#', '####.', '.###.', '#...#', '##.##', '#...#', '.#.#.', '#####'],  // hair up, mouth open
};
// Bottom cell: hands and needles (rows 0-2), lap and skirt, the rocker.
const LAP = {
  a:    ['##.##', '#.#.#', '.###.'],   // needle tips out
  b:    ['.#.#.', '##.##', '.###.'],   // tips crossed: click
  rest: ['.....', '#...#', '.###.'],   // needles down, asleep
  up:   ['#...#', '#...#', '.###.'],   // hands up, startled
};
const SKIRT = ['#####', '#...#', '#...#'];
const ROCKER = { level: ['.###.', '.....'], fwd: ['###..', '.....'], back: ['..###', '.....'] };

// ------------------------------------------------------------------ kitten

// On the floor between the minute and granny, side-on, facing the minute:
// pointed ears, a slim neck, the tail curled up behind. Light, so it reads
// as a cat and not as a block beside the digits.
const KIT = {
  sit:    ['.....', '.....', '#.#..', '###..', '.#...', '.##.#', '.###.', '.#.#.'],
  ear:    ['.....', '.....', '#....', '###..', '.#...', '.##.#', '.###.', '.#.#.'],
  blink:  ['.....', '.....', '..#..', '###..', '.#...', '.##.#', '.###.', '.#.#.'],   // other ear flick
  look:   ['.....', '.....', '..#.#', '..###', '...#.', '#.##.', '.###.', '.#.#.'],   // turned round, at granny
  up:     ['.....', '#.#..', '###..', '.#...', '.##.#', '.###.', '.###.', '.#.#.'],   // sat up tall, alert
  tail:   ['.....', '.....', '#.#..', '###.#', '.#..#', '.##.#', '.###.', '.#.#.'],
  bat:    ['.....', '#....', '##.#.', '.###.', '..#..', '.##.#', '.###.', '.#.#.'],   // paw up at the loose end
  proud:  ['.....', '.....', '#.#.#', '###.#', '.#..#', '.###.', '.###.', '##.#.'],   // tail high
  crouch: ['.....', '.....', '.....', '.....', '#.#..', '###.#', '.####', '#.#.#'],   // low, tail up
  wiggle: ['.....', '.....', '.....', '.....', '#.#.#', '###.#', '.###.', '#.#..'],   // butt wiggle
  pounce: ['#.#..', '###..', '.####', '...##', '....#', '.....', '.....', '.....'],   // in the air
  pull1:  ['.....', '.....', '.#.#.', '.###.', '..#..', '..###', '.####', '.#..#'],   // leaning back, thread in teeth
  pull2:  ['.....', '.....', '..#.#', '..###', '...#.', '..###', '..###', '..#.#'],
  run1:   ['.....', '.....', '.....', '#.#..', '###.#', '.####', '#...#', '.....'],   // running off, stretched
  run2:   ['.....', '.....', '.....', '#.#..', '###..', '.####', '..##.', '.#.#.'],   // and tucked
  tangle: ['.....', '#.#..', '###..', '#.#.#', '.#.#.', '#.#.#', '.#.#.', '.###.'],   // wrapped in yarn
};
/** The thread, up the kitten's left edge from its teeth to row `y`. */
function withThread(tile, y, mouth) {
  const t = tile.map((r) => [...r]);
  for (let r = Math.min(y, mouth); r <= mouth; r++) t[r][0] = '#';
  return t.map((r) => r.join(''));
}
// Unravelled yarn keeps its crimp: a wavy line lying on the floor. Two
// phases, so it wriggles as it is pulled.
const WAVE = [
  ['.....', '.....', '.....', '.....', '.....', '.....', '.##..', '#..##'],
  ['.....', '.....', '.....', '.....', '.....', '.....', '##..#', '..##.'],
];

// ------------------------------------------------------------------ yarn ball

// A ball of yarn on the floor, its strand trailing off along the floor
// towards granny (a strand rising out of it made the ball read as a "6").
const BALL = [
  ['.....', '.....', '.....', '.##..', '#.##.', '##.#.', '.##..', '...##'],
  ['.....', '.....', '.....', '.##..', '##.#.', '#.##.', '.##..', '..##.'],
];
const ROM_BALL = 0xa1;   // halfwidth full stop: a 3x3 ring on the floor

// ------------------------------------------------------------------ timeline

const UN = 0.16, UN_H = 0.16;      // seconds per row unravelled (minute, hour)
const KN = 0.17;                   // seconds per row knitted
const KN0 = 0.1, KN0_H = 0.3;      // knitting starts this long after :00

function phases(tau, hour) {
  const un = hour ? UN_H : UN;
  const u0 = -0.1 - 8 * un;                    // first yank
  const k0 = hour ? KN0_H : KN0;
  let lo = 0;                                  // rows gone from the top
  if (tau < 0 && tau >= u0) lo = Math.min(8, Math.floor((tau - u0) / un) + 1);
  if (tau >= -0.1 && tau < 0) lo = 8;
  if (tau >= 0) lo = tau < k0 ? 8 : Math.max(0, 7 - Math.floor((tau - k0) / KN));
  return { u0, k0, un, lo, unravel: tau < 0 && tau >= u0, knit: tau >= k0 && tau < k0 + 8 * KN };
}

function kittenPose(sec, tau, hour, P) {
  if (tau < 0 && tau >= P.u0) {                      // pulling, a row a yank
    if (hour && tau > P.u0 + 5 * P.un) return 'tangle';
    return Math.floor((tau - P.u0) / P.un) % 2 ? 'pull2' : 'pull1';
  }
  if (tau < 0 && tau >= P.u0 - 0.4) return 'pounce';
  if (tau < 0 && tau >= P.u0 - 2.6) return Math.floor(tau / 0.2) % 2 ? 'wiggle' : 'crouch';
  if (tau < 0 && tau >= P.u0 - 4.6) return 'crouch';
  if (tau >= -0.1 && tau < P.k0 + 8 * KN + 1.2) return hour ? 'tangle' : 'proud';
  if (hour && tau < 0 && tau >= -16) return Math.floor(sec / 0.6) % 2 ? 'look' : 'up';   // granny is asleep...
  // idle, a twelve-second round
  const c = sec % 12;
  if (c >= 2 && c < 2.3) return 'ear';
  if (c >= 3 && c < 3.2) return 'blink';
  if (c >= 4 && c < 5) return 'look';
  if (c >= 5 && c < 6) return 'up';
  if (c >= 6 && c < 8.4) return Math.floor(c / 0.6) % 2 ? 'bat' : 'sit';
  if (c >= 8.4 && c < 10) return Math.floor(c / 0.5) % 2 ? 'tail' : 'sit';
  if (c >= 10 && c < 10.3) return 'ear';
  return 'sit';
}

function grannyTiles(sec, tau, hour, P) {
  let head = HEAD.awake, lap, rock = 'level';
  if (hour && tau < 0 && tau >= -18) {               // asleep: needles down, a slow rock
    head = HEAD.doze; lap = LAP.rest;
    rock = Math.floor(sec / 2.4) % 2 ? 'back' : 'level';
  } else if (hour && tau >= 0 && tau < P.k0) {       // wakes with a start
    head = HEAD.start; lap = LAP.up;
  } else if (P.knit) {                               // needles flying, a click a row
    lap = Math.floor((tau - P.k0) / KN) % 2 ? LAP.b : LAP.a;
  } else {                                           // knitting, rocking
    lap = Math.floor(sec / 0.5) % 2 ? LAP.b : LAP.a;
    rock = ['back', 'level', 'fwd', 'level'][Math.floor(sec / 1.2) % 4];
    if (sec % 12 >= 6 && sec % 12 < 8.4) head = HEAD.look;   // watching the kitten bat
  }
  if (rock === 'fwd') head = ['.....', ...head.slice(0, 7)];
  return [head, [...lap, ...SKIRT, ...ROCKER[rock]]];
}

// ------------------------------------------------------------------ design

function digitsOf(f) {
  return [f.h < 10 ? null : f.hh[0], f.hh[1], f.mm[0], f.mm[1]];
}















export default {
  name: 'Knitting',
  blurb: 'Granny knits the time: each minute her kitten pulls the thread and unravels the digit, and she knits the new one up row by row.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const minuteStart = date.getTime() - fields.s * 1000 - fields.ms;
    const ahead = sec >= 30;
    const tau = ahead ? sec - 60 : sec;
    const newF = ahead ? clockFields(new Date(minuteStart + 60000)) : fields;
    const oldF = ahead ? fields : clockFields(new Date(minuteStart - 60000));
    const now = digitsOf(newF), old = digitsOf(oldF);
    const hour = newF.m === 0;
    const P = phases(tau, hour);
    const shown = ahead ? old : now;                 // the true time
    const moving = now.map((d, i) => d !== old[i]);

    const alloc = new TileAllocator(lcd, 0);
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const put = (col, row, tile, fallback = 0x20) => {
      codes[row][col] = isBlank(tile) ? 0x20 : alloc.add(tile) ?? fallback;
    };

    // The panels first: they are the time.
    shown.forEach((d, k) => {
      if (d == null) return;
      const rows = k === 0 ? TENS[d] : DIGITS[d];
      const lo = moving[k] ? P.lo : 0;
      rows.forEach((s, row) => [...s].forEach((p, i) => { if (p !== ' ') put(DCOL[k] + i, row, partTile(p, row, lo)); }));
    });

    // Granny, the kitten, the ball, then the loose yarn on the floor.
    const [gt, gb] = grannyTiles(sec, tau, hour, P);
    put(GRAN_COL, 0, gt); put(GRAN_COL, 1, gb);

    // The yarn on the floor is exactly what has come undone: it runs from the
    // first moving digit to the kitten, as long as the rows that are off
    // (lo of 8), growing while the kitten pulls and shrinking as granny knits.
    // Behind the panels that stand still it is hidden; it shows in the gaps
    // and at the foot of the panels that have come undone.
    const first = moving.indexOf(true);
    const span = KIT_COL - (hour ? 0 : DCOL[Math.max(0, first)]);
    const reach = P.lo > 0 && first >= 0 ? Math.ceil((span * P.lo) / 8) : 0;
    const still = (c) => DCOL.some((d0, k) => !moving[k] && shown[k] != null && c >= d0 && c < d0 + (k === 0 ? 2 : 3));

    // On the hour the kitten does not sit and pull: it grabs every loose end
    // and runs off along the floor with them, and when granny wakes and
    // knits, the yarn reels the tangled kitten back home.
    let kcol = KIT_COL, kt;
    if (hour && reach > 0) {
      // It runs as far as the first panel that is coming undone, never behind a standing one.
      // It runs as far as the yarn reaches, but only over open floor: where a
      // panel still hangs (or is not yet undone) it waits beside it.
      kcol = Math.max(KIT_COL - reach, 0);
      while (kcol < KIT_COL && (codes[1][kcol] !== 0x20 || still(kcol))) kcol++;
      kt = tau < 0 ? KIT[Math.floor(sec / 0.2) % 2 ? 'run1' : 'run2'] : KIT.tangle;
    } else {
      const pose = kittenPose(sec, tau, hour, P);
      kt = KIT[pose];
      if (pose === 'pull1' || pose === 'pull2') kt = withThread(kt, Math.max(0, 2 * P.lo - 8), 3);
      // The loose end it is after: a strand hanging off the minute's corner,
      // swinging when batted, and dead still while the kitten stalks it.
      else if (pose === 'bat' || pose === 'crouch' || pose === 'wiggle') {
        const swing = pose === 'bat' && Math.floor(sec / 0.6) % 2;
        kt = kt.map((r, i) => (i < 3 ? (swing && i === 2 ? '.#' : '#.') + r.slice(2) : r));
      }
    }
    if (kt) put(kcol, 1, kt);

    const spin = P.knit ? Math.floor((tau - P.k0) / KN) % 2 : Math.floor(sec / 1.5) % 2;
    put(BALL_COL, 1, BALL[spin], ROM_BALL);

    const ph = Math.floor(sec / 0.4) % 2;
    for (let c = KIT_COL - (hour ? 0 : 1); c > KIT_COL - reach - (hour ? 0 : 1); c--) {
      if (c === kcol) continue;
      if (codes[1][c] === 0x20 && !still(c)) put(c, 1, WAVE[(c + ph) % 2]);
    }

    alloc.flush();
    for (const row of [0, 1]) { lcd.setCursor(0, row); codes[row].forEach((c) => lcd.data(c)); }
  },
};
