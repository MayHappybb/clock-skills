// Busker — a street juggler keeps the time in the air.
//
// The four digits are the balls, thrown in a fountain over his head: the
// hours to his left, the minutes to his right, the outer two (hour tens,
// minute units) low near the edges, the inner two high in the top row. He
// stands at the bottom in the middle, in a top hat. The pattern never
// stops: every 0.8 s one ball is thrown, the low ones up into the top row
// and back down, the high ones dropped into his hand and thrown back up,
// round the four in turn, so a still always catches one ball off its place
// in the arch. Each ball keeps its own column, so the time always reads
// left to right: HH on the left, MM on the right.
//
// Two kids watch from the kerb. The one on the left points at whichever
// ball is up; the one on the right claps every catch. At night one kid is
// left, asleep.
//
// When the minute turns he tosses each digit that is about to change high
// out of the top of the glass, right to left. Then a kid holds up a fresh
// ball and lobs it over the top (hours from the left kid, minutes from the
// right), and the new digits fall in, left to right, into the pattern: a
// low ball is caught and settles, a high ball is caught and thrown back up
// to its place. Every old digit has left before a new one arrives, so the
// glass shows a time with a gap in it, never a wrong one.
//
// On the hour the balls hang where they are. He spins, bows and flips his
// top hat up into the empty top of the arch; it turns over twice and lands
// back on his head, and the kids cheer.
//
// Tiles: balls first (a digit shown twice at the same height shares one),
// then the juggler, then the kids. One ball at most is between the rows at
// any instant, so a frame is at most 5 + 1 + 2 = 8.

import { TileAllocator } from '../js/kit.js';

const COL = [2, 4, 10, 12];        // H1 H2 | M1 M2
const HOME = [8, 0, 0, 8];         // top dot row of each ball at rest: an arch
const JC = 7;                      // the juggler, bottom row
const ORDER = [0, 3, 1, 2];        // throw order: H1, M2, H2, M1 (left, right, left, right)
const PER = 0.8;                   // seconds per throw
const POINTER = 0, CLAPPER = 15;   // the kids' cells, bottom row

// Bold 5x7 digits: they are the balls.
const D = {
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '##...', '####.', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
};
// The kids' ball, before it is anyone's digit: small and solid.
const SMALL = ['.###.', '#####', '#####', '.###.'];

// --------------------------------------------------------------- the juggler
// One cell: top hat (rows 0-1), eyes under the brim, arms, legs apart.
const HAT = ['.###.', '#####'];
const HAT_EDGE = ['..#..', '#####'];          // the hat turning over, seen side-on
const HAT_FLIP = ['#####', '.###.'];          // upside down
const BARE = ['.....', '.###.'];              // no hat: the top of his head
const EYES = { c: '.#.#.', l: '#.#..', r: '..#.#', shut: '.....', wide: '#.#.#', side: '...#.', back: '.....' };
// Arms, rows 3-5, by pose of [left, right]:
//   ready: hands out low   up: flung up beside the face   catch: reaching out level
const ARMS = {
  'ready,ready': ['..#..', '.###.', '#.#.#'],
  'up,ready':    ['#.#..', '.###.', '..#.#'],
  'ready,up':    ['..#.#', '.###.', '#.#..'],
  'catch,ready': ['..#..', '####.', '..#.#'],
  'ready,catch': ['..#..', '.####', '#.#..'],
  'up,up':       ['#.#.#', '.###.', '..#..'],
};
const LEGS = { stand: ['.#.#.', '#...#'], spin: ['..#..', '.###.'], brace: ['#...#', '#...#'] };
function juggler({ eyes = 'c', left = 'ready', right = 'ready', legs = 'stand', top = HAT } = {}) {
  return [...top, EYES[eyes], ...(ARMS[`${left},${right}`] ?? ARMS['ready,ready']), ...LEGS[legs]];
}
// The bow: bent double, hat swept off and held out low.
const BOW = ['.....', '.....', '.....', '####.', '...#.', '.####', '##.#.', '...#.'];
const BOW_BARE = ['.....', '.....', '.....', '.###.', '...#.', '#.###', '.#.#.', '...#.'];

// ------------------------------------------------------------------ the kids
const SIT = ['.....', '.....', '.....', '.###.', '.###.', '..#..', '#####', '#.#.#'];
const POINT_AT = ['.....', '.....', '....#', '.###.', '.###.', '..#..', '.###.', '#.#.#'];  // hand up-right
const POINT_UP = ['.....', '...#.', '...#.', '.###.', '.###.', '..#..', '.###.', '#.#.#'];  // hand straight up
const CLAP_OPEN = ['.....', '.....', '.....', '.###.', '.###.', '#.#.#', '.###.', '#.#.#'];
const CLAP_SHUT = ['.....', '.....', '..#..', '.###.', '.###.', '..#..', '.###.', '#.#.#'];
const CHEER = ['.....', '#...#', '#...#', '.###.', '.###.', '..#..', '.###.', '#.#.#'];
const HOLD = ['.....', '.....', '#...#', '##.##', '.###.', '..#..', '.###.', '#.#.#'];      // ball overhead
const JUMP = ['#...#', '##.##', '.###.', '.###.', '..#..', '.###.', '#.#.#', '.....'];
const SLEEP = ['.....', '.....', '.....', '.....', '.....', '.###.', '#####', '##.##'];

// ------------------------------------------------------------------- helpers
const blank = () => Array(8).fill('.....');
const isBlank = (t) => t.every((r) => r === '.....');
/** The part of a glyph whose top is at glass row y that falls in cell row `row`. */
function slice(glyph, y, row) {
  const out = blank();
  for (let r = 0; r < 8; r++) {
    const gy = row * 8 + r - y;
    if (gy >= 0 && gy < glyph.length) out[r] = glyph[gy];
  }
  return out;
}
const over = (a, b) => a.map((r, i) => [...r].map((c, k) => (c === '#' || b[i][k] === '#' ? '#' : '.')).join(''));
const lerp = (a, b, u) => a + (b - a) * u;
const fall = (u, a, b) => Math.round(lerp(a, b, u * u));              // accelerating
const rise = (u, a, b) => Math.round(lerp(a, b, 1 - (1 - u) ** 2));    // decelerating

/**
 * One throw of ball i, u in [0,1). A low ball dips in his hand, flies up to
 * the top row, hangs, falls and is caught with a dip. A high ball sags,
 * drops into his hand, is held, and is thrown back up. Returns the ball's
 * top row and what his arm is doing.
 */
function excursion(i, u) {
  if (HOME[i] === 8) {
    if (u < 0.12) return { y: 9, arm: 'catch' };
    if (u < 0.35) return { y: rise((u - 0.12) / 0.23, 9, 0), arm: 'up' };
    if (u < 0.6) return { y: 0, arm: 'up', high: true };
    if (u < 0.82) return { y: fall((u - 0.6) / 0.22, 0, 9), arm: 'ready' };
    if (u < 0.95) return { y: 9, arm: 'catch', caught: true };
    return { y: 8, arm: 'ready' };
  }
  if (u < 0.12) return { y: 1, arm: 'ready' };
  if (u < 0.35) return { y: fall((u - 0.12) / 0.23, 1, 9), arm: 'ready' };
  if (u < 0.6) return { y: 9, arm: 'catch', caught: true };
  if (u < 0.82) return { y: rise((u - 0.6) / 0.22, 9, 0), arm: 'up' };
  return { y: 0, arm: 'ready', high: true };
}

function digitsAt(sec) {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}

// The plan around a minute boundary B. Old balls are tossed out, right to
// left, 0.5 s apart, and are all gone before a kid moves. The kid lobs every
// new ball up out of sight, one per LOB, ending just before B; the new
// digits fall in from the top from B on, left to right, RAIN apart.
const TOSS = 0.5, LOB = 0.35, WIND = 0.5, RAIN = 0.85, SHOW = 6;
function plan(B) {
  const before = digitsAt(B - 60), after = digitsAt(B);
  const changed = [0, 1, 2, 3].filter((i) => before[i] !== after[i]);
  const out = [...changed].reverse();
  const k0 = B - 0.1 - WIND - (changed.length - 1) * LOB - 0.45;   // the kid starts
  const w0 = k0 - 0.7 - (out.length - 1) * TOSS;                   // the first toss
  const rEnd = B + (changed.length - 1) * RAIN + 0.9;
  const hour = B % 3600 === 0;
  const show = hour ? Math.ceil(rEnd * 2) / 2 : null;
  const end = hour ? show + SHOW : rEnd;
  return { B, before, after, changed, out, w0, k0, end, show };
}

export default {
  name: 'Busker',
  blurb: 'A street juggler keeps the four digits up in a fountain; each minute he tosses the old one away and a kid on the kerb lobs him the new one.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const hourNow = date.getHours();
    const night = hourNow < 7;

    // A turn owns the instants around its boundary.
    let P = plan(Math.round(T / 60) * 60);
    if (!(T >= P.w0 && T < P.end)) P = null;

    const ball = [0, 1, 2, 3].map((i) => ({ d: null, y: HOME[i] }));
    let active = -1, arm = 'ready', high = false, caught = false;
    let thrower = null, look = null;
    let J = null, hatY = null, hatGlyph = HAT, cheer = false;

    if (!P) {
      // The fountain: one throw every PER seconds, round the four balls.
      const now = digitsAt(T);
      const n = Math.floor(T / PER), u = T / PER - n;
      for (let i = 0; i < 4; i++) ball[i].d = now[i];
      active = ORDER[n % 4];
      const e = excursion(active, u);
      ball[active].y = e.y; arm = e.arm; high = !!e.high && HOME[active] === 8; caught = !!e.caught;
    } else {
      const { B, before, after, out, changed, w0, k0, show } = P;
      for (let i = 0; i < 4; i++) ball[i].d = before[i];
      // tosses: right to left, each flung out of the top of the glass
      out.forEach((i, k) => {
        const q = T - (w0 + k * TOSS);
        if (q < 0) return;
        if (q >= 0.6) { ball[i].d = null; return; }
        active = i;
        if (q < 0.15) { ball[i].y = HOME[i] + 1; arm = 'catch'; }
        else { ball[i].y = Math.round(lerp(HOME[i], -8, ((q - 0.15) / 0.45) ** 0.8)); arm = 'up'; }
      });
      // a kid lobs the new balls up and out of sight
      const kq = T - k0;
      if (kq >= 0 && T < B) {
        const left = changed[0] < 2 || night;
        thrower = { col: left ? POINTER : CLAPPER, q: kq, n: changed.length };
        look = left ? 'l' : 'r';
      }
      // ...and they fall in, left to right, and join the pattern
      changed.forEach((i, k) => {
        const r = T - (B + k * RAIN);
        if (r < 0) return;
        ball[i].d = after[i];
        if (r >= 0.9) return;
        active = i;
        if (r < 0.3) { ball[i].y = fall(r / 0.3, -7, 9); arm = 'ready'; }
        else if (r < 0.55) { ball[i].y = 9; arm = 'catch'; caught = true; }
        else if (HOME[i] === 8) { ball[i].y = 8; arm = 'ready'; }
        else if (r < 0.8) { ball[i].y = rise((r - 0.55) / 0.25, 9, 0); arm = 'up'; }
        else { ball[i].y = 0; }
      });
      // the hour: spin, bow, flip the hat, land it
      if (show != null && T >= show) {
        const s = T - show;
        for (let i = 0; i < 4; i++) { ball[i].d = after[i]; ball[i].y = HOME[i]; }
        active = -1;
        if (s < 1.8) {
          const ph = Math.floor(s / 0.3) % 4;
          J = juggler({ eyes: ['c', 'side', 'back', 'l'][ph], left: 'up', right: 'up', legs: 'spin' });
        } else if (s < 2.9) {
          J = s < 2.1 ? juggler({ left: 'catch', right: 'catch' }) : BOW;
          cheer = s >= 2.3;
        } else if (s < 4.9) {
          // the flip: from his bow straight up into the top of the arch and back down
          const v = (s - 2.9) / 2.0;
          J = juggler({ eyes: v < 0.2 ? 'c' : 'wide', left: v < 0.2 ? 'up' : 'ready', right: v > 0.75 ? 'catch' : 'ready', top: BARE });
          hatY = v < 0.45 ? rise(v / 0.45, 7, 0) : v < 0.55 ? 0 : fall((v - 0.55) / 0.45, 0, 8);
          hatGlyph = v > 0.12 && v < 0.88 ? [HAT, HAT_EDGE, HAT_FLIP, HAT_EDGE][Math.floor(s / 0.2) % 4] : HAT;
          if (hatY >= 8) { hatY = null; J = juggler({ eyes: 'shut', right: 'catch' }); }
        } else {
          J = juggler({ eyes: 'c', left: 'up', right: 'up' });
          cheer = true;
        }
      }
    }

    // ------------------------------------------------------------- compose
    const tiles = [Array(16).fill(null), Array(16).fill(null)];
    for (let i = 0; i < 4; i++) {
      const b = ball[i];
      if (b.d == null) continue;
      for (const row of [0, 1]) {
        const t = slice(D[b.d], b.y, row);
        if (!isBlank(t)) tiles[row][COL[i]] = t;
      }
    }

    // the juggler: the arm on the active ball's side, eyes on it
    if (!J) {
      const right = active >= 2;
      let eyes = active < 0 ? 'c' : right ? 'r' : 'l';
      if (look) eyes = look;
      if (Math.floor(T * 10) % 53 === 0) eyes = 'shut';
      J = juggler({ eyes, left: !right ? arm : 'ready', right: right ? arm : 'ready' });
    }
    tiles[1][JC] = J;
    if (hatY != null) {
      for (const row of [0, 1]) {
        const t = slice(hatGlyph, hatY, row);
        if (!isBlank(t)) tiles[row][JC] = row ? over(tiles[1][JC], t) : t;
      }
    }

    // the kids
    let pointer = night ? SLEEP : high ? POINT_UP : POINT_AT;
    let clapper = night ? null : caught ? CLAP_SHUT : CLAP_OPEN;
    if (cheer) { pointer = clapper = Math.floor(T * 4) % 2 ? CHEER : JUMP; if (night) clapper = null; }
    if (thrower) {
      const { col, q, n } = thrower;
      let pose = HOLD, ballY = 4;
      if (q >= WIND) {
        const k = Math.floor((q - WIND) / LOB), v = ((q - WIND) % LOB) / LOB;
        pose = v < 0.5 ? JUMP : HOLD;
        ballY = k < n ? rise(v, 3, -4) : null;
      }
      if (col === POINTER) pointer = pose; else clapper = pose;
      if (ballY != null) {
        const t = slice(SMALL, ballY, 0);
        if (!isBlank(t)) tiles[0][col] = t;
      }
    }
    tiles[1][POINTER] = pointer;
    if (clapper) tiles[1][CLAPPER] = clapper;

    // allocate: balls, juggler, the hat, kids, the kid's ball
    const alloc = new TileAllocator(lcd, 0);
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const order = [];
    for (const c of COL) order.push([c, 0], [c, 1]);
    order.push([JC, 1], [JC, 0], [POINTER, 1], [CLAPPER, 1], [POINTER, 0], [CLAPPER, 0]);
    for (const [c, row] of order) {
      const t = tiles[row][c];
      if (t) grid[row][c] = alloc.add(t) ?? 0x20;
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
