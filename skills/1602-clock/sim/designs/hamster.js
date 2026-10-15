// Hamster — the clock is an odometer, and the hamster's wheel is its last drum.
//
// The time is four counter drums in a heavy block face; the wheel at the
// right end is the drum that turns fastest, and the hamster in it is the
// engine. The notches round the rim and the tread under his feet move with
// his stride. Coming up to the minute he hunkers down and sprints; at :00 the
// carry engages, the minutes drum rolls up a number and the wheel lurches as
// it takes the load. When the ones roll past 9 the carry ripples left, drum by
// drum, each one another lurch, so 10:59 -> 11:00 is a wave through the whole
// counter. That one is too much for him: he lets go, the wheel carries him up
// and over the top curled in a ball, he drops onto his back and sees stars,
// rolls over, pulls a seed out of his cheek, eats it, and goes back to work.
//
// Hamsters keep night hours. From 20:00 to 08:00 he runs all minute, and
// stops halfway through to wash his face. By day he only works the carry:
// he winds down after it, yawns and falls asleep in the wheel, z's rising
// beside it, until something wakes him with a start at :52 and he scrambles
// back up to speed for the next minute.
//
// Budget. The digits are a three-part kit (top bar, top+middle, bottom bar,
// each two dots thick, like the rim; full cells are ROM 0xff), so any time,
// and any instant of a roll, needs at most three slots: a drum rolls a whole
// cell row per step, so a rolling digit only ever shows parts the kit has.
// The wheel is 15x16 dots across three cells, drawn in millimetres at the
// real dot centres so it is round. Its top-middle cell is exactly the kit's
// top bar and its bottom-middle exactly the bottom bar, so those cost nothing
// unless he is in them. The four corners carry the moving notches and he
// takes one middle cell: 3 + 4 + 1 = 8, and the rim falls back to the plain
// bars before the clock would ever lose a slot. Twelve-hour time makes the
// hours' tens drum one cell wide (1 or nothing), which buys the blank column
// beside the wheel: his z's, his stars and his '!' are ROM text there.

import { TileAllocator, clamp, noise } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const FPS = 10;
const WHEEL_COL = 13;
const SAY_COL = 12;              // the blank column beside the wheel
const DIGIT_COLS = [0, 2, 6, 9];
const COLON_COL = 5;

// ------------------------------------------------------------------ digits

const bars = (rowsLit) => Array.from({ length: 8 }, (_, r) => (rowsLit.includes(r) ? '#####' : '.....'));
const PART = { T: bars([0, 1]), M: bars([0, 1, 6, 7]), B: bars([6, 7]) };
const DIGITS = {
  0: ['#T#', '#B#'], 1: [' # ', ' # '], 2: ['MM#', '#BB'], 3: ['MM#', 'BB#'], 4: ['#B#', '  #'],
  5: ['#MM', 'BB#'], 6: ['#MM', '#B#'], 7: ['TT#', '  #'], 8: ['#M#', '#B#'], 9: ['#M#', 'BB#'],
};
const NARROW = { 1: ['#', '#'], ' ': [' ', ' '] };   // the hours' tens drum
const face = (d, narrow) => (narrow ? NARROW : DIGITS)[d];

// A drum rolls upward a cell row at a time: the old number climbs out of the
// top, the drum's blank band passes, and the next number follows from below.
const ROLL_STEP = 0.2;           // seconds per state; four states
const RIPPLE = 0.45;             // the carry reaches the next drum this much later

function rollRows(oldD, newD, u, narrow) {
  const o = face(oldD, narrow), n = face(newD, narrow), gap = narrow ? ' ' : '   ';
  const k = Math.floor(u / ROLL_STEP);
  if (k <= 0) return o;
  if (k === 1) return [o[1], gap];
  if (k === 2) return [gap, n[0]];
  return n;
}

// ------------------------------------------------------------------- wheel

const PX = MODULE.dotPitchX, PY = MODULE.dotPitchY, CX = MODULE.charPitchX, CY = MODULE.charPitchY;
const WCX = CX + 2 * PX, WCY = (CY + 7 * PY) / 2;   // wheel centre, mm, from its top-left dot
const R_OUT = 5.65, R_IN = 4.3;
const NOTCHES = 9;
const NOTCH = (2 * Math.PI) / NOTCHES;

/** mm offset from the wheel's centre of wheel-grid dot (x 0-14, y 0-15). */
const mmOf = (x, y) => [Math.floor(x / 5) * CX + (x % 5) * PX - WCX, (y >> 3) * CY + (y & 7) * PY - WCY];
/** Inside the rim: halos may darken these dots, never the rim itself. */
const inside = (x, y) => Math.hypot(...mmOf(x, y)) < R_IN;

/**
 * The rim as a 16x15 grid of 0/1. A point on it at polar angle `a` (screen
 * axes, so pi/2 is the bottom) is notched by the pattern at `a + rot`, so as
 * `rot` grows the notches travel toward smaller angles: the bottom of the
 * wheel moves right, under a hamster running left. The middle column is only
 * notched where `notchMiddle[row]`, so it can stay the kit's plain bars.
 */
function wheelGrid(rot, notchMiddle) {
  const g = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 15; x++) {
      const [mx, my] = mmOf(x, y);
      const d = Math.hypot(mx, my);
      let on = d <= R_OUT && d >= R_IN;
      const middle = x >= 5 && x <= 9;
      if (on && d > R_IN + 0.6 && (!middle || notchMiddle[y >> 3])) {
        const f = (((Math.atan2(my, mx) + rot) / NOTCH) % 1 + 1) % 1;
        if (f < 0.34) on = false;
      }
      row.push(on ? 1 : 0);
    }
    g.push(row);
  }
  return g;
}

// ------------------------------------------------------------- the schedule
// Seconds into the minute. The hour's show:
const LET_GO = 2.4, STOPPED = 6.0, ROLL_OVER = 8.4, SEED_OUT = 9.2, ATE = 12.6, RESTART = 13.4;
// A day minute:
const D_STOP = 7, D_SLEEP = 8.6, D_WAKE = 52, D_RUN = 53.6;
// A night minute's face wash:
const N_WASH = 23.5, N_WASHED = 28;

const isDay = (h) => h >= 8 && h < 20;

// Speed of the wheel, revolutions per second.
const CRUISE = 0.22, SPRINT = 0.55;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lurch = (s, at) => (s >= at && s < at + 0.5 ? 0.7 * (1 - (s - at) / 0.5) : 0);

function speed(s, hourShow, drums, day) {
  const first = s < 30;
  let v = CRUISE + (SPRINT - CRUISE) * (smooth(54, 58.5, s) + (first ? 1 - smooth(0.4, 3, s) : 0));
  if (day) v *= first ? 1 - smooth(D_STOP - 3, D_STOP, s) : smooth(D_RUN, D_RUN + 1, s);
  else v *= 1 - smooth(N_WASH - 1.5, N_WASH + 0.8, s) * (1 - smooth(N_WASHED - 0.5, N_WASHED + 1, s));
  if (first) for (let k = 0; k < drums; k++) v -= lurch(s, k * RIPPLE) * SPRINT;
  if (hourShow && first && s >= LET_GO) {
    // He lets go; the wheel coasts to a stop with him in it, and at night he
    // starts it again once he has eaten.
    v = SPRINT * (1 - smooth(LET_GO, STOPPED, s)) + (day ? 0 : CRUISE * smooth(RESTART, RESTART + 2.5, s));
  }
  return Math.max(0, v);
}

// Cumulative rim angle through each kind of minute, tabulated once.
const DT = 0.01;
const TABLES = new Map();
function table(hourShow, drums, day) {
  const key = `${hourShow}/${drums}/${day}`;
  if (TABLES.has(key)) return TABLES.get(key);
  const n = Math.round(60 / DT);
  const acc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) acc[i + 1] = acc[i] + speed((i + 0.5) * DT, hourShow, drums, day) * DT * 2 * Math.PI;
  // Each minute turns a whole number of notches, so the rim is seamless from
  // one minute to the next whatever each minute did. The correction is
  // spread in proportion to speed, so a wheel at rest stays at rest.
  const want = Math.round(acc[n] / NOTCH) * NOTCH, k = want / acc[n];
  for (let i = 0; i <= n; i++) acc[i] *= k;
  TABLES.set(key, acc);
  return acc;
}
function angleAt(acc, s) {
  const i = clamp(s / DT, 0, acc.length - 1), k = Math.floor(i);
  return acc[k] + (acc[Math.min(k + 1, acc.length - 1)] - acc[k]) * (i - k);
}

// ----------------------------------------------------------------- hamster
// Sprites on the wheel grid (x 0-14, y 0-15), facing left, toward the clock.
// '#' lit, 'o' forced dark (the eye, a mouth). [art, x, y]. His head is
// exactly the middle cell, so no gap crosses his face; the gap to the right
// is his neck, and his rump fills the corner cell behind.

const RUN = [
  [['..##.', '.####', '#o###', '#####', '.#.#.'], 5, 9],
  [['..##.', '.####', '#o###', '#####', '#...#'], 5, 9],
];
const RUN_LOW = [                 // hunkered down for the sprint, ears flat
  [['.##..', '#o###', '#####', '.#.#.'], 5, 10],
  [['.##..', '#o###', '#####', '#...#'], 5, 10],
];
const BLINK = [['..##.', '.####', '#####', '#####', '.#.#.'], 5, 9];
const STRAIN = [['.##..', '#o###', '#####', '#..#.'], 5, 10];
const HOP = [['..##.', '.####', '#o###', '#####', '#...#'], 5, 8];
const YAWN = [['..##.', '.####', '#o###', 'o####', '.#.#.'], 5, 9];
const SLEEP = [
  [['.##..', '.####', '#####', '#####'], 5, 10],     // breathing in
  [['.....', '.##..', '#####', '#####'], 5, 10],     // and out
];
const SIT = [['.##..', '.###.', '#o##.', '####.', '.###.', '.#.#.'], 5, 8];
const CHEEK = [['.##..', '.###.', '#o##.', '#####', '####.', '.#.#.'], 5, 8];
const BELLY = [
  [['#.#.#', '#####', 'o####', '.###.'], 5, 10],
  [['.#.#.', '#####', 'o####', '.###.'], 5, 10],
];
const PAWS = [[[4, 10], [4, 11]], [[4, 9], [4, 10]]];   // washing: paws to his face
const BALL_R = 1.25;

/**
 * Stamp a sprite with a one-dot dark halo, so he never merges with the rim.
 * The halo stops at his feet: those stand on the tread.
 */
function stamp(g, [art, x0, y0], extra = []) {
  const lit = [];
  art.forEach((l, r) => [...l].forEach((ch, i) => { if (ch !== '.') lit.push([x0 + i, y0 + r, ch]); }));
  extra.forEach(([x, y]) => lit.push([x, y, '#']));
  const feet = y0 + art.length - 1;
  for (const [x, y] of lit) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (Y > feet || Y < 0 || X < 0 || X > 14) continue;
    if (g[Y][X] === null && inside(X, Y)) g[Y][X] = 0;
  }
  for (const [x, y, ch] of lit) if (y >= 0 && y <= 15 && x >= 0 && x <= 14) g[y][x] = ch === '#' ? 1 : 0;
}

/** Him, curled in a ball at polar angle `th` (pi/2 = bottom) inside the rim. */
function ball(g, th) {
  const r = R_IN - BALL_R - 0.3;
  const cx = r * Math.cos(th), cy = r * Math.sin(th);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) {
    const [mx, my] = mmOf(x, y);
    const d = Math.hypot(mx - cx, my - cy);
    if (d <= BALL_R) g[y][x] = 1;
    else if (d <= BALL_R + 0.5 && g[y][x] === null && inside(x, y)) g[y][x] = 0;
  }
}

/** The hamster for this instant: a pose (or the ball) inked into `g`, and what he says. */
function act(g, { sec, rot, acc, drums, hourShow, day, T }) {
  const stride = Math.floor(rot / (NOTCH / 2)) % 2;
  const blink = noise(Math.floor(T / 3.7), 7) > 0.6 && T % 3.7 < 0.3;
  const straining = sec < 30 && drums > 0 && sec < (drums - 1) * RIPPLE + 0.7;
  const sprint = sec >= 55.5 || sec < 1.2;

  if (hourShow && sec >= LET_GO) {
    if (sec < ROLL_OVER) {
      // Carried up the back of the wheel by the rim, over the top, then he
      // drops down the front and lands on his back.
      const since = rot - angleAt(acc, LET_GO);
      const RIDE = 1.2 * Math.PI;
      let s = LET_GO;
      while (s < STOPPED && rot - angleAt(acc, LET_GO) > 0 && angleAt(acc, s) - angleAt(acc, LET_GO) < RIDE) s += 0.05;
      const fall = clamp((sec - s) / 0.5, 0, 1);
      if (fall < 1) {
        const th = Math.PI / 2 - Math.min(since, RIDE);
        ball(g, th - (2 * Math.PI - RIDE) * fall);
        return {};
      }
      stamp(g, BELLY[Math.floor(sec / 0.5) % 2]);
      return { say: [Math.floor(sec / 0.4) % 2 ? 0x2a : 0x20, Math.floor(sec / 0.4) % 2 ? 0x20 : 0x2a] };
    }
    if (sec < SEED_OUT) { stamp(g, CHEEK); return {}; }
    if (sec < ATE) {
      // The seed from his cheek, in his paws, a dot shorter every other bite.
      const bite = Math.floor((sec - SEED_OUT) / 0.45);
      const left = Math.max(1, 3 - Math.floor(bite / 2));
      stamp(g, bite % 2 ? CHEEK : SIT, Array.from({ length: left }, (_, r) => [4, 10 + r]));
      return {};
    }
    if (day) return dozing(g, sec, T);
    if (sec < RESTART + 1) { stamp(g, blink ? BLINK : RUN[0]); return {}; }
    stamp(g, blink ? BLINK : RUN[stride]);
    return {};
  }

  if (straining) { stamp(g, stride ? STRAIN : RUN_LOW[0]); return { say: [0x20, drums > 1 ? 0x27 : 0x20] }; }
  if (sprint) { stamp(g, RUN_LOW[stride]); return {}; }
  if (day) {
    if (sec < D_STOP) { stamp(g, blink ? BLINK : RUN[stride]); return {}; }
    if (sec < D_WAKE || sec >= D_RUN) {
      if (sec >= D_RUN) { stamp(g, RUN[stride]); return {}; }
      return dozing(g, sec, T);
    }
    // Woken with a start, then a look round, and back to work.
    if (sec < D_WAKE + 0.6) { stamp(g, HOP); return { say: [0x21, 0x20] }; }
    stamp(g, Math.floor(sec / 0.35) % 3 === 0 ? BLINK : SIT);
    return {};
  }
  if (sec >= N_WASH && sec < N_WASHED) {
    stamp(g, SIT, PAWS[Math.floor(sec / 0.3) % 2]);
    return {};
  }
  stamp(g, blink ? BLINK : RUN[stride]);
  return {};
}

/** Day: a yawn, then asleep in the wheel, breathing, with z's drifting up. */
function dozing(g, sec, T) {
  const since = sec < 30 ? sec - D_STOP : 99;
  if (since >= 0 && since < D_SLEEP - D_STOP) {
    stamp(g, since > 0.5 && since < 1.3 ? YAWN : SIT);
    return {};
  }
  stamp(g, SLEEP[Math.floor(T / 2) % 2]);
  const z = Math.floor(T / 0.9) % 3;
  return { say: [z === 1 ? 0x5a : 0x20, z === 0 ? 0x7a : 0x20] };
}

// ------------------------------------------------------------------ design

export default {
  name: 'Hamster',
  blurb: 'An odometer whose last drum is a hamster wheel: he sprints for every carry, and the hour\'s ripple flings him over the top.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { date, fields, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const prev = kit.clockFields(new Date(date.getTime() - 60000));
    const h12 = (f) => String(f.h % 12 || 12).padStart(2, ' ');
    const now = [...h12(fields), fields.mm[0], fields.mm[1]];
    const old = [...h12(prev), prev.mm[0], prev.mm[1]];
    // How far the carry ripples this minute: the drums, from the right, that change.
    let drums = 0;
    while (drums < 4 && now[3 - drums] !== old[3 - drums]) drums++;
    const hourShow = fields.m === 0;
    const day = isDay(fields.h);

    // ---- the drums
    const cells = [Array(16).fill(' '), Array(16).fill(' ')];
    now.forEach((d, k) => {
      const i = 3 - k;                                   // drum index from the right
      const rows = i < drums && sec < 30 ? rollRows(old[k], d, sec - i * RIPPLE, k === 0) : face(d, k === 0);
      rows.forEach((parts, row) => [...parts].forEach((p, c) => { cells[row][DIGIT_COLS[k] + c] = p; }));
    });

    // ---- the wheel: the hamster on an ink layer (1 lit, 0 dark, null
    // untouched), the rim under him.
    const acc = table(hourShow, drums, day);
    const rot = angleAt(acc, sec);
    const g = Array.from({ length: 16 }, () => Array(15).fill(null));
    const said = act(g, { sec, rot, acc, drums, hourShow, day, T: date.getTime() / 1000 });
    // The middle cells show the tread moving only while he is in them;
    // otherwise they stay the kit's plain bars and cost nothing.
    const inked = (row) => g.slice(row * 8, row * 8 + 8).some((l) => l.slice(5, 10).some((v) => v === 1));
    const rim = wheelGrid(rot, [inked(0), inked(1)]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 15; x++) if (g[y][x] === null) g[y][x] = rim[y][x];

    // ---- allocate: the clock's parts first, then the wheel's corners, then
    // the middle cells. Out of slots, a middle cell falls back to plain rim.
    const alloc = new TileAllocator(lcd, 0);
    const out = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (let row = 0; row < 2; row++) for (let col = 0; col < SAY_COL; col++) {
      const p = cells[row][col];
      out[row][col] = p === '#' ? 0xff : p === ' ' ? 0x20 : alloc.add(PART[p]);
    }
    out[0][COLON_COL] = out[1][COLON_COL] = 0xa5;
    if (said.say) [out[0][SAY_COL], out[1][SAY_COL]] = said.say;
    const tileOf = (row, c) => Array.from({ length: 8 }, (_, r) =>
      g[row * 8 + r].slice(c * 5, c * 5 + 5).map((v) => (v ? '#' : '.')).join(''));
    for (const [row, c] of [[0, 0], [0, 2], [1, 0], [1, 2], [1, 1], [0, 1]]) {
      const t = tileOf(row, c), key = t.join('');
      let code = key === '#'.repeat(40) ? 0xff : key === '.'.repeat(40) ? 0x20 : alloc.add(t);
      if (code == null) code = c === 1 ? alloc.add(row ? PART.B : PART.T) ?? 0x20 : 0x20;
      out[row][WHEEL_COL + c] = code;
    }
    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((x) => lcd.data(x)); });
  },
};
