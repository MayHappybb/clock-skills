// Bowling — the time is four racks of pins at the end of a lane.
//
// Every numeral is built of bowling pins: a standing pin is each upright
// stroke, two dots of a fallen pin each crossbar, so an 8 is four pins and
// three bars, a 1 is two pins stacked. Hours to the left of a ROM colon,
// minutes to the right, and the lane runs from the minute units to a bowler
// at the right edge: a front-view stick man, three cells at most, the ball
// held at his side as part of his pose.
//
// All minute the bowler fidgets with his ball: wipes it, hefts it, sights
// down the lane, taps his foot. Ten seconds before the minute he settles,
// then: push-away, back-swing, slide, release. The ball rolls dot by dot down
// the lane (it leaves a comet tail on the slow glass) and takes out the
// minute units: the pins jump, then fly back toward the pit turning a
// quarter at a time, and fall flat on the deck. A carry is real pin action: the flying pins
// of the units take out the tens, and on the hour the tens take out the
// hour. Then the sweep comes down across the deck, and the pinsetter lowers
// the new numeral, a row at a time. About six seconds later the ball comes
// back up the return with a rumble that makes every pin on the deck wobble.
// The old digit only ever falls before the minute and the new one lands after
// it, so the glass shows a time with a gap in it, never a wrong one.
//
// The hour: in :59 he bowls three times, a strike each time (the units are
// knocked down and re-set as the same 9), the score monitor ticking X, XX,
// XXX. The third ball is the real one and cascades through every digit that
// changes. A turkey: XXX flashes, confetti falls on the lane, and he does
// the turkey dance. When the hour's tens does not change (11:00 to 19:00,
// 21:00 to 23:00) it is left standing, the pins that would not go down: they
// teeter, he pleads with them, they stay.
//
// 24-hour clock, no leading zero, so no AM/PM cue is needed.
//
// Tiles: the pin kit (pin, top bar, top+middle bars, bar) is at most four at
// any time of day; the bowler two or three; the ball, once he lets go of it,
// one (it moves two dots per cell and never straddles a seam). Struck, spinning and fallen pins take whatever is left, and
// fall back to ROM sticks (! / - | _) when the slots run out; the time, the
// ball and the bowler never do. The sweep, confetti and the score are ROM.
// Everything is derived from the clock.

import { noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const rev = (b) => { let o = 0; for (let i = 0; i < 5; i++) if (b & (1 << i)) o |= 0x10 >> i; return o; };

const PIN = bits(['..#..', '.###.', '.###.', '..#..', '.###.', '#####', '#####', '.###.']);
const PIN_L = bits(['.#...', '###..', '.###.', '..#..', '.###.', '#####', '#####', '.###.']);
const PIN_R = PIN_L.map(rev);
const STRUCK = bits(['#....', '##...', '###..', '.##..', '..###', '.####', '.####', '..##.']);
// A pin in flight, a quarter turn at a time (with PIN itself), and lying on the deck.
const SPIN = [
  PIN,
  bits(['.....', '....#', '...##', '.###.', '####.', '####.', '.##..', '.....']),
  bits(['.....', '.....', '.....', '.....', '.##.#', '#####', '#####', '.##.#']),
  bits(['.....', '.##..', '####.', '####.', '.###.', '##...', '#....', '.....']),
];
const FLAT = SPIN[2];
const T = bits(['#####', '#####', '.....', '.....', '.....', '.....', '.....', '.....']);
const TM = bits(['#####', '#####', '.....', '.....', '.....', '.....', '#####', '#####']);
const BAR = bits(['.....', '.....', '.....', '.....', '.....', '.....', '#####', '#####']);

// Each digit as [top row L M R, bottom row L M R]: P pin, T top bar,
// M top + middle bars, B a bar on the cell's bottom two rows.
const DIGIT = {
  0: ['PTP', 'PBP'], 1: ['_P_', '_P_'], 2: ['_MP', 'PB_'], 3: ['_MP', '_BP'], 4: ['PBP', '__P'],
  5: ['PM_', '_BP'], 6: ['PM_', 'PBP'], 7: ['_TP', '__P'], 8: ['PMP', 'PBP'], 9: ['PMP', '_BP'],
};
// The hour tens has two cells: 1 is a pair of stacked pins, 2 the same
// zig-zag as the wide 2. Before ten o'clock it is left empty.
const DIGIT2 = { 1: ['P_', 'P_'], 2: ['MP', 'PB'] };
const specOf = (i, d, row) => (i === 0 ? DIGIT2[d] : DIGIT[d])[row];
const KIT = { T, M: TM, B: BAR };

// The bowler, front view, three cells wide: the cell in front of him (toward
// the pins), his own, and the one behind; top row then bottom. Most poses use
// two or three cells; the ball is part of the pose while he holds it.
const POSES = {
  hold: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..##. ##### .....", ".#### #.#.# .....", ".#### #.#.# .....", "..##. #.#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  rub: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..##. ##### .....", ".#### #.### .....", ".#### #.#.. .....", "..##. #.#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  heft: [
    "..... .###. .....", "..... .###. .....", "..##. .###. .....", ".#### #.#.. .....",
    ".#### ##### .....", "..##. ..#.# .....", "..... ..#.# .....", "..... ..#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  aim: [
    "..##. .###. .....", ".#### .###. .....", ".#### ####. .....", "..##. #.#.. .....",
    "..... ##### .....", "..... ..#.# .....", "..... ..#.# .....", "..... ..#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  tap: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..##. ##### .....", ".#### #.#.# .....", ".#### #.#.# .....", "..##. #.#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #..#. .....", "..... #..#. .....", "..... #...# .....", "..... #.... .....",
  ],
  step: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..##. ##### .....", ".#### #.#.# .....", ".#### #.#.# .....", "..##. ..#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... #...# .....", "..... #...# .....",
    "..... #...# .....", "..... ....# .....", "..... #...# .....", "..... #...# .....",
  ],
  back: [
    "..... ..... .....", "..... .###. ..##.", "..... .###. .####", "..... .###. .####",
    "..... ..#.# ..##.", "..... ####. .....", "..... #.#.. .....", "..... #.#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... #...# .....", "..... #...# .....",
    "..... #...# .....", "..... ....# .....", "..... #...# .....", "..... #...# .....",
  ],
  slide: [
    "..... ..... .....", "..... ..... .....", "..... .###. .....", "..... .###. .....",
    "..... .###. .....", "..... ..#.. .....", "..... ##### .....", "..... #.#.# .....",
    "....# ..#.# .....", "...#. .###. .....", "..... #..#. .....", "..... #..#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  follow: [
    "....# ..... .....", "....# ..... .....", "....# .###. .....", "....# .###. .....",
    "..... ####. .....", "..... ..#.. .....", "..... ####. .....", "..... ..#.# .....",
    "..... ..#.# .....", "..... .###. .....", "..... #..#. .....", "..... #..#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  lean: [
    "..... ..... .....", "...#. ..... .....", "....# .###. .....", "..... ####. .....",
    "..... .###. .....", "..... ..#.. .....", "..... ##### .....", "..... ..#.# .....",
    "..... ..#.# .....", "..... .###. .....", "..... #..#. .....", "..... #..#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  stand: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..... ##### .....", "..... #.#.# .....", "..... #.#.# .....", "..... #.#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  walk: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..... ##### .....", "..... #.#.# .....", "..... #.#.# .....", "..... #.#.# .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... .#.#. .....", "..... .#.#. .....", "..... .#.#. .....", "..... .#.#. .....",
  ],
  cheer: [
    "....# .###. #....", "....# .###. #....", "....# .###. #....", "....# ..#.. #....",
    "..... ##### .....", "..... ..#.. .....", "..... ..#.. .....", "..... ..#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  pump: [
    "..... .###. #....", "..... .###. #....", "..... .###. #....", "..... ..#.. #....",
    "..... ##### .....", "..... #.#.. .....", "..... #.#.. .....", "..... #.#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #..#. .....", "..... #..#. .....", "..... #...# .....", "..... #.... .....",
  ],
  slump: [
    "..... ..... .....", "..... ..... .....", "..... .###. .....", "..... .###. .....",
    "..... .###. .....", "..... ##### .....", "..... #.#.# .....", "..... #.#.# .....",
    "..... #.#.# .....", "..... .###. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... .#.#. .....", "..... .#.#. .....", "..... .#.#. .....", "..... ##.## .....",
  ],
  plead: [
    "..... ..... .....", "..... ..... .....", "..... .###. .....", "..... .###. .....",
    "##### .###. .....", "..... ####. .....", "..... ..#.. .....", "..... ..#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... #..#. .....", "..... #..#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  bend: [
    "..... ..... .....", "..... ..... .....", "..... ..... .....", "..... ..... .....",
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ####. .....",
    "....# #.#.. .....", "..... ####. .....", "..... .#.#. .....", "..... .#.#. .....",
    "..... #...# .....", "..... #...# .....", "..... #...# .....", "..... #...# .....",
  ],
  flapU: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... #.#.# .....",
    "..... ##### .....", "..... ..#.. .....", "..... ..#.. .....", "..... ..#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... .#.## .....",
    "..... .#... .....", "..... .#... .....", "..... .#... .....", "..... ##... .....",
  ],
  flapD: [
    "..... .###. .....", "..... .###. .....", "..... .###. .....", "..... ..#.. .....",
    "..... ##### .....", "..... #.#.# .....", "..... #.#.# .....", "..... ..#.. .....",
    "..... ..#.. .....", "..... .###. .....", "..... .#.#. .....", "..... ##.#. .....",
    "..... ...#. .....", "..... ...#. .....", "..... ...#. .....", "..... ...## .....",
  ],
};
const POSE = {};
for (const [k, art] of Object.entries(POSES)) {
  const cells = [];
  for (let dc = -1; dc <= 1; dc++) for (let row = 0; row < 2; row++) {
    const rows = bits(art.slice(row * 8, row * 8 + 8).map((l) => l.split(' ')[dc + 1]));
    if (rows.some((v) => v)) cells.push({ dc, row, rows });
  }
  POSE[k] = cells;
}

// The ball, 4x4, with a finger hole that turns as it rolls.
const BALL = [
  ['.##.', '####', '##.#', '.##.'],
  ['.##.', '##.#', '####', '.##.'],
  ['.##.', '#.##', '####', '.##.'],
  ['.##.', '####', '#.##', '.##.'],
].map((f) => f.map((l) => [...l].map((c) => c === '#')));

// ------------------------------------------------------------------ layout

const BOX = [[0, 2], [2, 3], [6, 3], [9, 3]];     // [first col, width] of HT HO MT MO
const COLON = 5, HOME = 15, LINE = 14;            // bowler's spot, and the foul line
const HIT = -1.2, CASCADE = 0.3;                  // first strike, relative to the turn
const ROLL = 1.0;                                 // the roll, release to contact
const SWEEP0 = 0.2, SWEEP_DT = 0.15, LOWER = 0.35;
const TUMBLE = [0x21, 0x2f, 0x2d, 0x7c];          // a pin spinning: ! / - |
const DEBRIS = 0x5f;
const CONFETTI = [0x2a, 0xa5, 0x27, 0xdf, 0x2c, 0x2b];

const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);

// ------------------------------------------------------------------ time

function digitsOf(f) {
  const hs = String(f.h).padStart(2, ' ');          // 24 h, no leading zero
  return [hs[0], hs[1], f.mm[0], f.mm[1]];
}

/** Throws near day-second T: {H: hit time, t0: the turn, kind, old, new, changed}. */
function throwsAround(kit, dayStart, B) {
  const out = [];
  for (const b of [B - 120, B - 60, B, B + 60]) {
    const f = kit.clockFields(new Date(dayStart + b * 1000));
    const g = kit.clockFields(new Date(dayStart + (b + 60) * 1000));
    const now = digitsOf(f), next = digitsOf(g);
    if (f.mm === '59') {
      for (const s of [18.8, 38.8]) out.push({ H: b + s, t0: b + s - HIT, kind: 'practice', old: now, new: now, changed: [3], seed: b + s });
    }
    const changed = [3, 2, 1, 0].filter((i) => now[i] !== next[i]);
    out.push({ H: b + 60 + HIT, t0: b + 60, kind: f.mm === '59' ? 'hour' : 'minute', old: now, new: next, changed, seed: b });
  }
  return out.sort((a, b) => a.H - b.H);
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Bowling',
  blurb: 'The numerals are racks of bowling pins; each minute the bowler knocks down the digit that changes and the pinsetter lowers the new one, and the hour is a turkey.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const B = T - (fields.s + fields.ms / 1000);

    const throws = throwsAround(kit, dayStart, B);
    let prev = null, next = null;
    for (const th of throws) { if (th.H <= T) prev = th; else if (!next) next = th; }
    const s = T - prev.H;           // since the last strike
    const r = next.H - T;           // until the next

    // ---- the cells: ROM codes, or {t: rows, p: priority, f: fallback}
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const put = (c, row, t, p, f = 0x20) => { if (c >= 0 && c < 16) grid[row][c] = { t, p, f }; };

    const now = digitsOf(fields);
    grid[0][COLON] = 0xa5; grid[1][COLON] = 0xa5;

    // the turn in progress, if any
    const ev = [prev, next].find((e) => T - e.t0 >= -1.6 && T - e.t0 < 3);
    const t = ev ? T - ev.t0 : 99;

    // the ball return rumble makes the standing pins wobble
    let pin = PIN;
    const rumble = prev.kind === 'hour' ? 12 : 6;
    // and when the hour's tens survives the turkey it teeters, and stays up
    const lone = prev.kind === 'hour' && prev.old[0] !== ' ' && prev.old[0] === prev.new[0];
    const teeter = lone && s >= 0.4 && s < 3.2 ? [PIN_L, PIN, PIN_R, PIN][Math.floor((s - 0.4) / 0.3) % 4] : null;
    if (s >= rumble && s < rumble + 1) pin = [PIN_L, PIN, PIN_R, PIN][Math.floor((s - rumble) / 0.2) % 4];

    const drawDigit = (i, d, rowsOnly) => {
      if (d === ' ') return;
      const [c0] = BOX[i];
      for (let row = 0; row < 2; row++) {
        [...specOf(i, d, row)].forEach((ch, j) => {
          if (ch === '_') return;
          const tile = ch === 'P' ? (i === 0 && teeter ? teeter : pin) : KIT[ch];
          if (rowsOnly === 'drop') { if (row === 1) put(c0 + j, 0, ch === 'P' ? pin : KIT[ch], 0); }
          else put(c0 + j, row, tile, 0);
        });
      }
    };

    const debris = [];
    for (let i = 0; i < 4; i++) {
      if (!ev || !ev.changed.includes(i)) { drawDigit(i, (ev ? ev.new : now)[i]); continue; }
      const k = ev.changed.indexOf(i);
      const th = HIT + CASCADE * k;
      const [c0] = BOX[i];
      const lo = BOX[Math.min(...ev.changed)][0];
      const sweepAt = SWEEP0 + (11 - c0 + 1) * SWEEP_DT;
      if (t < th) { drawDigit(i, ev.old[i]); continue; }
      if (t >= sweepAt + LOWER) { drawDigit(i, ev.new[i]); continue; }
      if (t >= sweepAt) { drawDigit(i, ev.new[i], 'drop'); continue; }
      const old = ev.old[i];
      if (old === ' ') continue;
      // the old rack: struck, then flying, then lying on the deck
      const parts = [];
      for (let row = 0; row < 2; row++) {
        [...specOf(i, old, row)].forEach((ch, j) => { if (ch !== '_') parts.push({ c: c0 + j, row, ch }); });
      }
      if (t < th + 0.2) {
        for (const q of parts) {
          if (q.ch === 'P') put(q.c, q.row, STRUCK, 3, 0x21);
          else put(q.c, q.row, KIT[q.ch], 0);
        }
        continue;
      }
      // every part is a pin: it jumps, flies back toward the pit turning a
      // quarter at a time (half of them half a turn behind, so two spin tiles
      // cover the lot), and falls flat on the deck
      parts.forEach((q, n) => {
        const step = Math.max(0, Math.floor((t - th - 0.2) / 0.2 + 1e-9));
        const seed = ev.seed + i * 10 + n;
        const vx = 0.35 + rnd(seed, 1) * 0.5;
        const c = Math.max(lo, Math.round(q.c - step * vx));
        const land = 4 + (n % 2);
        if (step >= land) { if (n % 3 !== 2) debris.push(c); return; }
        const row = step === 0 ? q.row : step < land - 1 ? 0 : 1;
        if (typeof grid[row][c] === 'object' && grid[row][c].p === 3) return;
        const ph = (step + (n % 2) * 2) % 4;
        put(c, row, SPIN[ph], 3, TUMBLE[ph]);
      });
    }
    // the sweep, and the deadwood in front of it
    if (ev && t >= SWEEP0) {
      const sc = 11 - Math.floor((t - SWEEP0) / SWEEP_DT);
      const lo = BOX[Math.min(...ev.changed)][0];
      if (sc >= lo) { grid[0][sc] = 0x7c; grid[1][sc] = 0x7c; }
      for (const c of debris) if (c < sc && grid[1][c] === 0x20) put(c, 1, FLAT, 4, DEBRIS);
    } else for (const c of debris) if (grid[1][c] === 0x20) put(c, 1, FLAT, 4, DEBRIS);

    // ---- the score monitor
    // (only in :59, as the strikes are bowled, and for the turkey after it)
    let score = '';
    if (fields.mm === '59' && fields.s >= 20) score = fields.s >= 40 ? 'XX' : 'X';
    if (prev.kind === 'hour' && s < 9) score = Math.floor(s / 0.3) % 3 === 2 ? '' : 'XXX';
    [...score].forEach((ch, j) => { grid[0][12 + j] = ch.charCodeAt(0); });

    // ---- the bowler and the ball
    // The ball only ever sits inside one cell (two spots per cell), so it
    // costs one tile; while he holds it, it is drawn as part of his pose.
    let col = HOME, pose = 'hold', ball = null;      // ball: [col, row, dx, dy]
    const party = prev.kind === 'hour' ? 7 : 0;      // the hour's dance pushes the routine back

    if (r <= ROLL) {
      col = LINE; pose = r > ROLL - 0.4 ? 'follow' : Math.floor(r / 0.3) % 2 ? 'lean' : 'follow';
      const k = Math.min(3, Math.floor((1 - r / ROLL) * 4));
      ball = [13 - (k >> 1), 1, 1 - (k & 1), 4];
    } else if (r <= ROLL + 0.5) { col = LINE; pose = 'slide'; }
    else if (r <= ROLL + 1.0) { col = LINE; pose = 'back'; }
    else if (r <= ROLL + 1.5) { col = HOME; pose = 'step'; }
    else if (r <= ROLL + 4.0) { col = HOME; pose = Math.floor(r / 0.8) % 3 ? 'aim' : 'heft'; }
    else if (s < 2 + party) {
      col = prev.kind === 'hour' && s >= 1.2 ? HOME : LINE;   // steps back to dance under the score
      if (lone && s < 3.2) pose = s < 1.2 ? 'plead' : Math.floor(s / 0.4) % 2 ? 'plead' : 'slump';
      else if (prev.kind === 'hour') pose = s < 1.2 ? 'cheer' : Math.floor(s / 0.35) % 2 ? 'flapD' : 'flapU';
      else pose = s < 0.3 ? 'follow' : Math.floor(s / 0.4) % 2 ? 'pump' : 'cheer';
    } else if (s < 2.5 + party) { col = LINE; pose = 'walk'; }
    else if (s < 3.0 + party) { col = HOME; pose = 'stand'; }
    else if (s < rumble + 1) {
      const u = s - 3.0 - party;
      pose = u % 3 < 0.5 ? 'walk' : 'stand';         // shifts his weight, waiting for the ball
    } else if (s < rumble + 1.4) {
      pose = 'stand';
      ball = [HOME - 1, 1, 1, Math.max(4, 7 - Math.floor((s - rumble - 1) / 0.13))];
    } else if (s < rumble + 2.0) { pose = 'bend'; ball = [HOME - 1, 1, 1, 4]; }
    else {
      // idle with the ball: a little routine, different every throw
      const u = s - rumble - 2.0;
      const seg = Math.floor(u / 2.2), lu = u - seg * 2.2;
      const a = rnd(prev.seed, seg);
      if (a < 0.3) pose = lu % 0.6 < 0.3 ? 'rub' : 'hold';
      else if (a < 0.5) pose = lu % 1.1 < 0.55 ? 'heft' : 'hold';
      else if (a < 0.7) pose = lu < 1.6 ? 'aim' : 'hold';
      else pose = lu % 0.8 < 0.4 ? 'tap' : 'hold';
    }

    for (const q of POSE[pose]) put(col + q.dc, q.row, q.rows, 2);

    if (ball) {
      const [c, row, dx, dy] = ball;
      const frame = BALL[(c * 2 + dx) % 4];
      const rows = Array(8).fill(0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        if (frame[y][x] && dy + y < 8) rows[dy + y] |= 0x10 >> (dx + x);
      }
      put(c, row, rows, 1);
    }

    // confetti for the turkey, falling through every empty cell off the deck
    if (prev.kind === 'hour' && s > 0.8 && s < 8) {
      [1, 12, 13, 14].forEach((c, k) => {
        const ph = (s / 0.35 + rnd(k, 5) * 4) % 4;
        if (ph >= 2) return;
        const row = ph < 1 ? 0 : 1;
        if (grid[row][c] === 0x20) grid[row][c] = CONFETTI[(k * 2 + Math.floor(s / 0.35)) % CONFETTI.length];
      });
    }

    // ---- allocate: the time first, then the ball, the bowler, the strike
    const reqs = [];
    grid.forEach((cells, row) => cells.forEach((v, c) => { if (typeof v === 'object') reqs.push({ v, row, c }); }));
    reqs.sort((a, b) => a.v.p - b.v.p);
    const keys = [], codes = new Map();
    for (const q of reqs) {
      const k = q.v.t.join(',');
      let code = codes.get(k);
      if (code == null && keys.length < 8) { code = keys.length; keys.push(q.v.t); codes.set(k, code); }
      grid[q.row][q.c] = code ?? q.v.f;
    }
    keys.forEach((rows, i) => lcd.defineChar(i, rows.map((b) => { let s2 = ''; for (let j = 0; j < 5; j++) s2 += (b >> (4 - j)) & 1 ? '#' : '.'; return s2; })));
    grid.forEach((cells, row) => { lcd.setCursor(0, row); cells.forEach((c) => lcd.data(c)); });
  },
};
