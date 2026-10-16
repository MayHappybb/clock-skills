// Busker — a street juggler keeps the time in the air.
//
// The four digits are the balls. He juggles them in "columns": each ball
// goes straight up and down in its own column, so they never swap places
// and the time always reads left to right, hours in his left hand, minutes
// in his right, and he stands where the colon would be. The balls hang at
// the top of their throws (cartoon physics) and he works one ball a second,
// alternating hands, so the clock ticks as a juggling pattern.
//
// A crowd of kids sits round him on the pavement, more of them in the
// afternoon and evening, one diehard at night. When the minute turns he
// tosses each digit that is about to change high out of the top of the
// glass, right to left, and keeps the rest going. Then a kid in the crowd
// lobs him a fresh ball over the top, which drops into the empty column as
// the new digit, left to right. Old digits all leave before the new ones
// arrive, so the glass shows an incomplete time but never a wrong one.
//
// On the hour he stops juggling and the balls simply stay up there. He
// spins, sweeps a bow, the crowd cheers; he straightens, looks up, and the
// balls remember gravity: they drop, and he scrambles to catch every one.
//
// Tiles: ball cells first (a digit shown twice at rest shares a tile), then
// the juggler's two cells, then the crowd (one tile, every kid the same),
// then the thrower and its plain ball. At most one ball is ever between the
// rows, so the worst frame is 8. The far arm is ROM 0x2d; stars are ROM.

import { TileAllocator } from '../js/kit.js';

const COL = [5, 6, 8, 9];          // H1 H2 | M1 M2
const JC = 7;                      // the juggler, both rows
const HAND = [0, 0, 1, 1];         // 0 left hand, 1 right
const ORDER = [0, 3, 1, 2];        // one throw a second: H1, M2, H2, M1
const KID_L = [3, 2, 1, 0], KID_R = [11, 12, 13, 14, 15];

// Bold 5x7 digits, round shouldered: they are the balls.
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
const PLAIN = ['.###.', '#####', '#####', '#####', '#####', '#####', '.###.'];

// --------------------------------------------------------------- the juggler
// Head cell: a busker's top hat, dot eyes, a grin. No outline: the face is
// the gap under the hat, which reads as a face and never as a numeral.
const HAT = ['.###.', '.###.', '#####', '.....'];
const EYES = { c: '.#.#.', l: '#.#..', r: '..#.#', shut: '##.##', wide: '#.#.#' };
const MOUTH = { grin: ['#...#', '.###.'], o: ['..#..', '.#.#.'], flat: ['.....', '.###.'] };
function head(eyes = 'c', mouth = 'grin') {
  return [...HAT, EYES[eyes], ...MOUTH[mouth], '.....'];
}
const HEAD_BACK = ['.###.', '.###.', '#####', '.###.', '.###.', '.###.', '..#..', '.....'];
const HEAD_SIDE = ['.###.', '.###.', '#####', '.....', '...#.', '....#', '..##.', '.....'];
// Bow: head dipped right down, hat swept off and held out.
const HEAD_BOW = ['.....', '.....', '.....', '.....', '.....', '.....', '.###.', '#####'];
// Body cell, built from parts so either arm can be anywhere.
function body(left, right, legs = 'stand') {
  const g = ['.###.', '.###.', '.###.', '.###.', '.###.', '.#.#.', '.#.#.', '##.##'].map((r) => [...r]);
  if (legs === 'spin') { g[5] = [...'..#..']; g[6] = [...'..#..']; g[7] = [...'.###.']; }
  const arm = (side, pose) => {
    const c = side ? 4 : 0;
    if (pose === 'down') { g[1][c] = '#'; g[2][c] = '#'; g[3][c] = '#'; }
    else if (pose === 'up') { g[0][c] = '#'; }
    else if (typeof pose === 'number') { for (let r = 1; r <= pose; r++) g[r][c] = '#'; }
    else if (pose === 'hip') { g[2][c] = '#'; }
  };
  arm(0, left); arm(1, right);
  return g.map((r) => r.join(''));
}
const BODY_BOW = ['#####', '.####', '..###', '..###', '..##.', '..#.#', '..#.#', '.##.#'];

// ------------------------------------------------------------------ the crowd
const KID = ['.....', '.....', '.###.', '.###.', '..#..', '#####', '.###.', '##.##'];
const KID_CHEER = ['#...#', '#...#', '##.##', '.###.', '..#..', '.###.', '.###.', '##.##'];
const KID_HOLD = ['#...#', '#...#', '##.##', '.###.', '..#..', '.###.', '.###.', '##.##'];
const KID_SLEEP = ['.....', '.....', '.....', '.....', '.###.', '#####', '#####', '##.##'];

// ------------------------------------------------------------------- helpers
const blank = () => Array(8).fill('.....');
/** The part of a 7-row glyph whose top is at glass row y that falls in cell row `row`. */
function slice(glyph, y, row) {
  const out = blank();
  for (let r = 0; r < 8; r++) {
    const gy = row * 8 + r - y;
    if (gy >= 0 && gy < glyph.length) out[r] = glyph[gy];
  }
  return out;
}
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// Height of a ball (top row, glass) through one ordinary throw, u in [0,1).
// Hang ends with a one-dot sag, then fall, catch with a dip, throw.
function throwY(u) {
  if (u < 0.3) return Math.round(lerp(1, 8, (u / 0.3) ** 2));
  if (u < 0.55) return u >= 0.35 && u < 0.45 ? 9 : 8;
  if (u < 0.85) { const v = (u - 0.55) / 0.3; return Math.round(8 - 8 * (1 - (1 - v) ** 2)); }
  return 0;
}

function digitsAt(sec) {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}

function crowdSize(h) {
  if (h < 6) return 1;
  if (h < 9) return 2;
  if (h < 12) return 4;
  if (h < 17) return 6;
  if (h < 22) return 8;
  return 3;
}

// The plan around a minute boundary B: tosses out, catches in, a show on the hour.
const TOSS = 0.9, RECV = 1.9, SHOW = 9;
function plan(B) {
  const before = digitsAt(B - 60), after = digitsAt(B);
  const changed = [0, 1, 2, 3].filter((i) => before[i] !== after[i]);
  const out = [...changed].reverse();
  const w0 = B - Math.ceil(out.length * TOSS + 0.1);
  const r0 = B - 0.95;
  const rEnd = r0 + changed.length * RECV;
  const hour = B % 3600 === 0;
  const show = hour ? Math.ceil(rEnd) : null;
  const end = hour ? show + SHOW : Math.ceil(rEnd);
  return { B, before, after, changed, out, w0, r0, end, show, hour };
}

export default {
  name: 'Busker',
  blurb: 'A street juggler keeps the four digits in the air; each minute he tosses the old one away and a kid in the crowd lobs him the new one.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, t }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const hourNow = date.getHours();

    // Which turn, if any, owns this instant: the nearest boundary's window.
    const Bn = Math.round(T / 60) * 60;
    let P = plan(Bn);
    if (!(T >= P.w0 && T < P.end)) P = null;

    // Per ball: digit (null = away), y (top row), and whether its hand is under it.
    const ball = [0, 1, 2, 3].map(() => ({ d: null, y: 0, held: false, glyph: null }));
    let active = -1, panic = false;
    let thrower = null;            // { col, pose, ballY }
    let headPose = null, bodyPose = null, cheer = false;
    const now = digitsAt(T);

    if (!P) {
      // Ordinary juggling: one ball a second.
      const n = Math.floor(T), u = T - n;
      active = ORDER[((n % 4) + 4) % 4];
      for (let i = 0; i < 4; i++) {
        ball[i].d = now[i];
        ball[i].y = i === active ? throwY(u) : 0;
      }
      // the ball due next sags a dot before it falls
      const next = ORDER[(((n + 1) % 4) + 4) % 4];
      if (u > 0.7 && next !== active) ball[next].y = 1;
    } else {
      const { before, after, out, changed, w0, r0, show } = P;
      for (let i = 0; i < 4; i++) { ball[i].d = before[i]; ball[i].y = 0; }
      // tosses: right to left
      out.forEach((i, k) => {
        const q = T - (w0 + k * TOSS);
        if (q < 0) return;
        if (q >= 0.8) { ball[i].d = null; return; }
        active = i;
        if (q < 0.3) ball[i].y = Math.round(lerp(0, 8, (q / 0.3) ** 2));
        else if (q < 0.5) ball[i].y = q < 0.4 ? 9 : 8;
        else ball[i].y = Math.round(lerp(8, -8, (q - 0.5) / 0.3));
      });
      // catches: left to right
      changed.forEach((i, k) => {
        const r = T - (r0 + k * RECV);
        if (r < 1.0) {
          if (r >= 0 && r < 0.9) {
            const kid = (after[i] + i) % 2 === 0 || i < 2 ? KID_R[0] : KID_R[0];
            const side = i < 2 && crowdSize(hourNow) > 1 ? KID_L[0] : KID_R[0];
            thrower = { col: side, r };
            void kid;
          }
          return;
        }
        ball[i].d = after[i];
        if (r < 1.3) { ball[i].y = Math.round(lerp(-7, 8, ((r - 1.0) / 0.3) ** 2)); active = i; }
        else if (r < 1.55) { ball[i].y = r < 1.4 ? 9 : 8; active = i; }
        else if (r < 1.85) { const v = (r - 1.55) / 0.3; ball[i].y = Math.round(8 - 8 * (1 - (1 - v) ** 2)); active = i; }
        else ball[i].y = 0;
      });
      // the hour: spin, bow, cheer, look up, scramble
      if (show != null && T >= show) {
        const s = T - show;
        for (let i = 0; i < 4; i++) { ball[i].d = after[i]; ball[i].y = 0; }
        active = -1;
        if (s < 2.4) {
          const ph = Math.floor(s / 0.3) % 4;
          headPose = [head('c'), HEAD_SIDE, HEAD_BACK, HEAD_SIDE.map((r) => [...r].reverse().join(''))][ph];
          bodyPose = body('up', 'up', 'spin');
        } else if (s < 4.6) {
          headPose = s < 2.7 ? head('c', 'grin') : HEAD_BOW;
          bodyPose = s < 2.7 ? body('down', 'down') : BODY_BOW;
          cheer = s >= 2.9;
        } else if (s < 5.8) {
          cheer = s < 5.2;
          headPose = s < 5.0 ? head('c') : head('wide', 'o');
          bodyPose = body('down', 'down');
          if (s >= 5.2) panic = true;
        } else {
          // they drop, fast, in the usual order, and he flings each back up
          const k = Math.floor((s - 5.8) / 0.5), u = ((s - 5.8) % 0.5) / 0.5;
          if (k < 4) {
            active = ORDER[k];
            ball[active].y = u < 0.35 ? Math.round(lerp(0, 8, (u / 0.35) ** 2))
              : u < 0.55 ? 8 : Math.round(8 - 8 * (1 - (1 - (u - 0.55) / 0.45) ** 2));
            panic = true;
          }
        }
      }
    }

    // ------------------------------------------------------------- compose
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const tiles = [Array(16).fill(null), Array(16).fill(null)];
    for (let i = 0; i < 4; i++) {
      const b = ball[i];
      if (b.d == null) continue;
      const g = D[b.d];
      for (const row of [0, 1]) {
        const t = slice(g, b.y, row);
        if (t.some((r) => r !== '.....')) tiles[row][COL[i]] = t;
      }
    }

    // juggler
    let L = 'hip', R = 'hip', eyes = 'c';
    if (active >= 0) {
      const y = ball[active].y, side = HAND[active];
      const pose = y >= 7 ? 3 : y >= 4 ? 1 : 'up';
      if (side) R = pose; else L = pose;
      eyes = side ? 'r' : 'l';
      if (y >= 7 && (COL[active] === 5 || COL[active] === 9)) {
        // the far arm reaches across the near column, under its ball
        const via = COL[active] === 5 ? 6 : 8;
        if (!tiles[1][via]) grid[1][via] = 0x2d;
      }
    }
    const blink = Math.floor(T * 10) % 47 === 0;
    const hd = headPose ?? head(blink ? 'shut' : panic ? 'wide' : eyes, panic ? 'o' : 'grin');
    const bd = bodyPose ?? body(panic && active < 0 ? 'up' : L, panic && active < 0 ? 'up' : R);
    tiles[0][JC] = hd; tiles[1][JC] = bd;

    // crowd
    const n = crowdSize(hourNow);
    const seats = [];
    for (let k = 0; k < n; k++) seats.push(k % 2 ? KID_L[k >> 1] : KID_R[k >> 1]);
    const night = hourNow < 6;
    const kidTile = cheer ? (Math.floor(T * 4) % 2 ? KID_CHEER : KID) : night ? KID_SLEEP : KID;
    for (const c of seats) tiles[1][c] = kidTile;
    if (thrower) {
      const { col, r } = thrower;
      if (r < 0.5) { tiles[1][col] = KID_HOLD; tiles[0][col] = slice(PLAIN, 1, 0); }
      else if (r < 0.75) {
        tiles[1][col] = KID_CHEER;
        const y = Math.round(lerp(1, -7, (r - 0.5) / 0.25));
        const t = slice(PLAIN, y, 0);
        if (t.some((x) => x !== '.....')) tiles[0][col] = t;
      }
    }

    // allocate: balls, juggler, crowd, thrower
    const alloc = new TileAllocator(lcd, 0);
    const order = [];
    for (const i of [0, 1, 2, 3]) for (const row of [0, 1]) order.push([COL[i], row]);
    order.push([JC, 0], [JC, 1]);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 16; c++) {
      if (tiles[row][c] && !order.some(([oc, or]) => oc === c && or === row)) order.push([c, row]);
    }
    for (const [c, row] of order) {
      const t = tiles[row][c];
      if (!t) continue;
      const code = alloc.add(t);
      grid[row][c] = code ?? 0x20;
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
