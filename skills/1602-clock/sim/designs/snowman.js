// Snow Fort — a snowball fight in the park, and the forts are the time.
//
// Four snowmen stand in the snow: their bodies are the digits (bold 5x8
// numerals of packed snow, bottom row), their heads wear top hats (top row).
// The hours' pair is the left kid's fort, the minutes' pair the right kid's.
// The kids crouch behind them and lob snowballs at each other all minute on
// a real parabola over the heads: wind up, throw, duck when one is coming,
// and sometimes take one in the face. Now and then one of them flops down
// and makes a snow angel. Snow drifts down through the empty glass all the
// time (ROM dots, softened by the slow glass).
//
// The minute: near :55 the left kid stops aiming at the other kid and goes
// for the snowman whose digit is about to change. The first ball knocks its
// head off, and the head lands on the right kid, who staggers about wearing
// it. The next cracks the body, the last bursts it. When the minute turns,
// the right kid, still wearing the head, rolls a new snowball in from the
// edge (it grows from a dot to a full ball as it rolls, a mark going round
// it), pats it into the new digit and tips the head back on. The old digit
// is only ever cracked or gone, so the glass never shows a wrong time; the
// new one is rolled only after the minute has turned.
//
// The hour: the sun comes up at :59:44 and the snow stops. The kids look up,
// then clutch their hats as all four snowmen slump, sag and melt into
// puddles with their hats floating in them. At the hour a blizzard whites
// out the glass, and as it thins both kids roll new snowmen as fast as they
// can, two each, and toss new heads on.
//
// 24-hour clock: there are always four snowmen.
//
// Tiles: digits first (a repeated digit shares), then the one head (every
// head is the same tile), the two kids, then the snowball in flight or the
// ball being rolled. Snow, splats, debris and the blizzard are ROM. Worst
// case 8. Every frame is derived from the wall clock.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

const bits = (r) => r.map((l) => [...l].reduce((b, c) => (b << 1) | (c === '#' ? 1 : 0), 0));
const rev = (b) => { let o = 0; for (let i = 0; i < 5; i++) if (b & (1 << i)) o |= 0x10 >> i; return o; };

// Snow numerals: bold, rounded, the full 5x8 cell.
const DIG = Object.fromEntries(Object.entries({
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '..##.', '.####'],
  2: ['.###.', '##.##', '...##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '...##', '####.'],
  4: ['...##', '..###', '.####', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.###.', '##...', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  8: ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
}).map(([k, v]) => [k, bits(v)]));

// The snowman's head: top hat, coal eyes, sitting on the cell floor.
const HEAD = bits(['.###.', '.###.', '#####', '.....', '.###.', '#.#.#', '#####', '.###.']);

// Kids, facing right (the left kid); the right kid is the mirror image.
const KID_R = Object.fromEntries(Object.entries({
  stand: ['..#..', '.###.', '.###.', '..#..', '#####', '.###.', '.#.#.', '.#.#.'],
  step:  ['..#..', '.###.', '.###.', '..#..', '.###.', '#.###', '.#.#.', '#...#'],
  look:  ['.###.', '.###.', '..#..', '..#..', '#####', '.###.', '.#.#.', '.#.#.'],
  duck:  ['.....', '.....', '.....', '..#..', '.###.', '.###.', '#####', '#.#.#'],
  wind:  ['##...', '##.#.', '..###', '..###', '.###.', '.###.', '.#.#.', '.#..#'],
  throw: ['.....', '...#.', '..###', '..###', '.####', '.###.', '.#.#.', '#...#'],
  push:  ['.....', '.....', '.#...', '###..', '####.', '.####', '.#...', '#.#..'],
  cheer: ['#.#.#', '#####', '.###.', '..#..', '.###.', '.###.', '.#.#.', '.#.#.'],
  ouch:  ['.###.', '.###.', '#####', '..#..', '#####', '.###.', '.#.#.', '.#.#.'],
  hit:   ['.....', '.#...', '###..', '###..', '.###.', '..##.', '..#.#', '.#..#'],
  angel: ['.....', '.....', '.....', '.....', '#.#.#', '#####', '.###.', '#.#.#'],
  angel2:['.....', '.....', '.....', '.....', '..#..', '#####', '.###.', '.#.#.'],
  sit:   ['.....', '.....', '..#..', '.###.', '.###.', '..#..', '#####', '##.##'],
}).map(([k, v]) => [k, bits(v)]));
const KID = { R: KID_R, L: Object.fromEntries(Object.entries(KID_R).map(([k, b]) => [k, b.map(rev)])) };

// Snowballs being rolled, smallest first; rows bottom-aligned, width w.
const BALLS = [
  { w: 1, r: ['#'] },
  { w: 2, r: ['##', '##'] },
  { w: 3, r: ['.#.', '###', '###'] },
  { w: 4, r: ['.##.', '####', '####', '.##.'] },
  { w: 5, r: ['.###.', '#####', '#####', '#####', '.###.'] },
  { w: 5, r: ['.###.', '#####', '#####', '#####', '#####', '.###.'] },
  { w: 5, r: ['.###.', '#####', '#####', '#####', '#####', '#####', '#####', '.###.'] },
];
// The dark mark going round a rolling ball: [row from the bottom, col].
const ROLLMARK = {
  3: [[2, 1], [2, 2], [1, 2], [1, 1]],
  4: [[3, 1], [3, 3], [1, 3], [1, 1]],
  5: [[4, 1], [4, 3], [1, 3], [1, 1]],
  6: [[6, 1], [6, 3], [4, 4], [1, 3], [1, 1], [4, 0]],
};
function ballTile(si, dx, phase) {
  const b = BALLS[si], out = Array(8).fill(0);
  b.r.forEach((line, i) => {
    const row = 8 - b.r.length + i;
    for (let j = 0; j < b.w; j++) if (line[j] === '#') out[row] |= 0x10 >> (dx + j);
  });
  const marks = ROLLMARK[si];
  if (marks && phase !== null) {
    const [rb, c] = marks[((phase % marks.length) + marks.length) % marks.length];
    out[7 - rb] &= ~(0x10 >> (dx + c));
  }
  return out;
}
const FULLBALL = ballTile(6, 0, null);

const SUN = [
  bits(['.....', '.###.', '#####', '#####', '#####', '.###.', '.....', '.....']),
  bits(['#.#.#', '.###.', '#####', '#####', '#####', '.###.', '#.#.#', '.....']),
];

// ROM
const FLAKE = [0xa5, 0x2e, 0xa5];        // top row middle, top row low, bottom row middle
const LYING = 0x2e;                      // snow on the ground
const SPLAT = 0x2a;                      // '*'
const BLIZ = [0x2a, 0xa5, 0x2e, 0xeb, 0xdf, 0x2a, 0xa5, 0x2d];

// ------------------------------------------------------------------ layout

const SLOT = [3, 4, 11, 12];             // H1 H2 | M1 M2: bodies bottom row, heads top row
const A_HOME = 1, B_HOME = 14;           // the kids, behind their forts
const PRI = { digit: 0, head: 1, kid: 2, fx: 3 };
const NEXT_TO_DIGIT = new Set([2, 5, 10, 13]);

const hash = (a, b = 0) => noise(a * 3.731 + b * 17.13, 5);

// ------------------------------------------------------------------ scene

class Scene {
  constructor(lcd) { this.lcd = lcd; this.c = Array(32).fill(null); }
  empty(col, row) { return col >= 0 && col < 16 && !this.c[row * 16 + col]; }
  tile(col, row, b, pri) { if (col >= 0 && col < 16) this.c[row * 16 + col] = { b, pri, fb: null }; }
  rom(col, row, code) { if (code !== undefined && col >= 0 && col < 16) this.c[row * 16 + col] = { rom: code }; }
  romIfEmpty(col, row, code) { if (this.empty(col, row)) this.rom(col, row, code); }
  // OR dots onto whatever is in the cell; if no slot is left, what was there shows.
  ink(col, row, inkRows, pri) {
    if (col < 0 || col > 15 || row < 0 || row > 1) return;
    const k = row * 16 + col, e = this.c[k];
    const base = !e ? Array(8).fill(0) : e.rom !== undefined ? this.lcd.glyph(e.rom) : e.b;
    this.c[k] = { b: base.map((v, r) => (v | inkRows[r]) & 0x1f), pri, fb: e };
  }
  draw() {
    const alloc = new TileAllocator(this.lcd, 0);
    const codes = Array(32).fill(0x20), order = [];
    this.c.forEach((e, k) => { if (e && e.b) order.push(k); else if (e) codes[k] = e.rom; });
    order.sort((a, b) => this.c[a].pri - this.c[b].pri || a - b);
    const resolve = (e) => {
      for (; e; e = e.fb) {
        if (e.rom !== undefined) return e.rom;
        const code = alloc.add(e.b);
        if (code !== null) return code;
      }
      return 0x20;
    };
    for (const k of order) codes[k] = resolve(this.c[k]);
    alloc.flush();
    for (let row = 0; row < 2; row++) {
      this.lcd.setCursor(0, row);
      for (let col = 0; col < 16; col++) this.lcd.data(codes[row * 16 + col]);
    }
    return alloc;
  }
}

// ------------------------------------------------------------------ pieces

// Cracked: a fissure runs down the body (stage 1); then the top half is
// knocked a dot sideways along it (stage 2). The digit keeps its shape, so a
// cracked 9 never reads as a 3.
const FISSURE = [3, 3, 2, 2, 2, 1, 1, 1];
function cracked(d, stage) {
  return DIG[d].map((v, r) => {
    let b = v & ~(0x10 >> FISSURE[r]);
    if (stage >= 2 && r < 4) b = (b >> 1) & 0x1f;
    return b;
  });
}

// Snowball on a parabola from glass (x0,y0) to (x1,y1); p in [0,1]. Kept
// inside one cell so it costs one tile.
function arcBall(sc, x0, y0, x1, y1, p) {
  const H = (y0 + y1) / 2 - 0.5;
  const x = Math.round(x0 + (x1 - x0) * p);
  let y = Math.round(y0 + (y1 - y0) * p - 4 * H * p * (1 - p));
  y = Math.max(0, Math.min(14, y));
  if (y === 7) y = p < 0.5 ? 6 : 8;
  const col = Math.floor(x / 6);
  let dx = x - col * 6; if (dx > 3) dx = 3;
  if (col < 0 || col > 15) return;
  // a 3x3 snowball (2x2 at the cell's right edge, where the gap is)
  const ink = Array(8).fill(0), r0 = Math.min(5, y & 7);
  ink[r0] = 0x18 >> dx; ink[r0 + 1] = 0x18 >> dx;
  sc.ink(col, y >> 3, ink, PRI.fx);
}

// Snow falling through empty glass; flakes that reach the ground lie a while.
function snowfall(sc, T) {
  const N = 7, STEP = 0.55, LIFE = 3 * STEP + 0.8;
  for (let k = 0; k < N; k++) {
    const off = k * LIFE / N;
    const cyc = Math.floor((T + off) / LIFE), u = (T + off) - cyc * LIFE;
    let col = Math.floor(hash(k * 13 + cyc, 1) * 16);
    const i = Math.floor(u / STEP);
    if (i >= 2 && hash(k + cyc * 7, 2) < 0.4) col += hash(k, cyc) < 0.5 ? -1 : 1;   // a puff of wind
    if (i === 2 && NEXT_TO_DIGIT.has(col)) continue;             // no 'decimal point' beside a digit
    if (i >= 0 && i < 3) sc.romIfEmpty(col, i < 2 ? 0 : 1, FLAKE[i]);   // then it melts into the snow
  }
}

// The melt, in two acts so the digit never merges with anything. First the
// heads melt in the top row (the same tile for all four): eyes droop, the
// head sags under its hat, and the hat drops into the slush. Then the bodies
// sink: the numeral loses its top rows one at a time, drips gather in a
// puddle at its foot, and the hat rides down on top. hp, bp in [0,1].
const HEADMELT = [
  HEAD,
  bits(['.....', '.###.', '.###.', '#####', '.###.', '#.#.#', '#####', '#####']),
  bits(['.....', '.....', '.###.', '.###.', '#####', '.###.', '#####', '#####']),
  bits(['.....', '.....', '.....', '.###.', '.###.', '#####', '.###.', '#####']),
  bits(['.....', '.....', '.....', '.....', '.....', '.###.', '#####', '#####']),
  bits(['.....', '.....', '.....', '.....', '.....', '.....', '.###.', '#####']),
];
const HAT = [0x0e, 0x1f];
function meltHead(hp) { return HEADMELT[Math.min(5, Math.floor(hp * 6))]; }
function meltBody(d, bp) {
  // the numeral squashes to 7 then 6 rows (deeper squashes turn an 8 into a
  // 0), then slumps into a shapeless lump and a puddle with the hat in it
  const k = Math.min(4, Math.floor(bp * 5));
  const out = Array(8).fill(0);
  if (k <= 2) {
    const H = 8 - k;
    for (let r = 0; r < H; r++) out[8 - H + r] = DIG[d][Math.round(r * 7 / (H - 1))];
    if (k) out[7] = 0x1f;
  } else if (k === 3) {
    out[2] = HAT[0]; out[3] = HAT[1];
    out[4] = 0x0c; out[5] = 0x1e; out[6] = 0x1f; out[7] = 0x1f;     // a lump in a hat
  } else {
    out[5] = HAT[0]; out[6] = 0x1f | HAT[1]; out[7] = 0x1f;            // puddle and hat
  }
  return out;
}
const PUDDLE = meltBody('8', 1);

// --------------------------------------------------------------- building
// Keyframes for rolling a ball from cell S to cell T (dir -1 left, +1 right),
// the kid pushing from behind.
function rollSteps(S, T, dir) {
  const span = Math.abs(T - S), n = span * 2 + 3, out = [];
  for (let k = 0; k < n; k++) {
    const prog = k / (n - 1);
    const si = Math.min(6, Math.round(prog * 6.4));
    const w = BALLS[si].w;
    const pos = Math.min(span, prog * (span + 0.6));
    const cell = S + dir * Math.floor(pos);
    const f = pos - Math.floor(pos);
    let dx = dir < 0 ? Math.round((1 - f) * (5 - w)) : Math.round(f * (5 - w));
    if (w === 5) dx = 0;
    out.push({ cell, dx, si, kid: cell - dir });
  }
  return out;
}

// A kid's build: for each slot in `order`, walk to the edge, roll a ball in,
// pat it into the digit; then the heads (the worn one is tipped straight
// on, others are scooped up and tossed over). Returns timed segments that
// write into a state object; segments ending at Infinity are persistent.
function makeBuild(side, order, t0, step, cur, worn) {
  const right = side === 'L';                 // the right kid faces left
  const dir = right ? -1 : 1;
  const home = right ? B_HOME : A_HOME, edge = right ? 15 : 0, start = right ? 14 : 1;
  const segs = [];
  let t = t0, at = home, wearing = worn;
  const seg = (dur, fn) => { segs.push([t, t + dur, fn]); t += dur; };
  const keep = (fn) => segs.push([t, Infinity, fn]);
  const walk = (to) => {
    const from = at, n = Math.abs(to - from), w = wearing;
    if (!n) return;
    seg(n * step, (u, st) => {
      st.kid.col = from + Math.sign(to - from) * Math.min(n, Math.floor(u / step) + 1);
      st.kid.pose = Math.floor(u / step) % 2 ? 'stand' : 'step';
      st.kid.wearing = w;
    });
    at = to;
  };
  const pending = [];
  for (const slot of order) {
    const target = SLOT[slot], d = cur[slot];
    walk(edge);
    let w = wearing;
    seg(step * 1.5, (u, st) => {                      // crouch, start a ball
      st.kid.col = edge; st.kid.pose = 'duck'; st.kid.wearing = w;
      if (u > step * 0.7) st.ball = { cell: start, dx: right ? 4 : 0, si: 0, phase: null };
    });
    const steps = rollSteps(start, target, dir);
    seg(steps.length * step, (u, st) => {             // roll
      const k = Math.min(steps.length - 1, Math.floor(u / step)), f = steps[k];
      st.kid.col = f.kid; st.kid.pose = 'push'; st.kid.wearing = w;
      st.ball = { cell: f.cell, dx: f.dx, si: f.si, phase: k * dir };
    });
    at = target - dir;
    seg(step * 3, (u, st) => {                        // pat it: the ball, a puff of snow, the digit
      st.kid.col = target - dir; st.kid.pose = Math.floor(u / step) % 2 ? 'stand' : 'push'; st.kid.wearing = w;
      if (u < step) st.ball = { cell: target, dx: 0, si: 6, phase: null };
      else { st.body[slot] = { kind: 'digit', d }; if (u < step * 2.2) st.puff = target; }
    });
    keep((u, st) => { st.body[slot] = { kind: 'digit', d }; });
    if (wearing) {                                    // tip the worn head over onto it
      seg(step * 2, (u, st) => {
        st.kid.col = target - dir; st.kid.pose = 'push';
        if (u < step) st.kid.wearing = true;
        else st.headOn[slot] = true;
      });
      keep((u, st) => { st.headOn[slot] = true; });
      wearing = false;
    } else pending.push(slot);
  }
  // heads: the far one first, so it flies over an empty head cell
  pending.sort((a, b) => Math.abs(SLOT[b] - at) - Math.abs(SLOT[a] - at));
  for (const slot of pending) {
    const target = SLOT[slot], kc = at;
    seg(step * 2, (u, st) => {                        // scoop a head and hold it up
      st.kid.col = kc; st.kid.pose = u < step ? 'duck' : 'cheer'; st.kid.wearing = u >= step;
    });
    const path = [];
    for (let c = kc; c !== target; c += Math.sign(target - kc)) path.push(c);
    path.push(target);
    seg(step * (path.length - 1), (u, st) => {        // toss it on
      st.kid.col = kc; st.kid.pose = 'throw';
      st.headAt = path[Math.min(path.length - 1, Math.floor(u / step) + 1)];
    });
    keep((u, st) => { st.headOn[slot] = true; });
  }
  const done = at;
  seg(0.8, (u, st) => { st.kid.col = done; st.kid.pose = Math.floor(u / 0.2) % 2 ? 'stand' : 'cheer'; });
  walk(home);
  return {
    end: t,
    apply(s, frame, kid) {
      for (const slot of order) { frame.body[slot] = { kind: 'none' }; frame.headOn[slot] = false; }
      if (s < t0) { kid.wearing = worn; if (worn) kid.pose = 'stand'; return; }
      const st = { kid, ball: null, body: frame.body, headOn: frame.headOn, headAt: null };
      for (const [a, b, fn] of segs) if (s >= a && s < b) fn(s - a, st);
      frame.balls.push(st.ball);
      frame.heads.push(st.headAt);
      if (st.puff !== undefined) frame.puffs.push(st.puff);
    },
  };
}

// ------------------------------------------------------------------ design

export default {
  name: 'Snow Fort',
  blurb: 'Four snowmen are the time and two kids snowball-fight behind them; each minute the changing one is knocked apart and a new one rolled in; on the hour the sun melts the lot.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,

  frame(lcd, api, { date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const mStart = Math.floor(T / 60) * 60, s = T - mStart;
    const at = (sec) => { const f = kit.clockFields(new Date(midnight.getTime() + sec * 1000)); return f.hh + f.mm; };
    const cur = at(mStart), prev = at(mStart - 60), next = at(mStart + 60);
    const minuteNo = Math.floor(date.getTime() / 60000);
    const sc = new Scene(lcd);

    const hourEnd = next.slice(0, 2) !== cur.slice(0, 2);    // :59, the sun and the melt
    const hourStart = prev.slice(0, 2) !== cur.slice(0, 2);  // :00, blizzard and rebuild
    const changedIn = [2, 3].filter((i) => prev[i] !== cur[i]);
    const changingOut = [2, 3].filter((i) => cur[i] !== next[i]);

    const F = {
      body: [0, 1, 2, 3].map((i) => ({ kind: 'digit', d: cur[i] })),
      headOn: [true, true, true, true],
      balls: [], heads: [], puffs: [],
    };
    const kidA = { col: A_HOME, pose: 'stand', wearing: false };
    const kidB = { col: B_HOME, pose: 'stand', wearing: false };
    const fx = [];                     // drawn after the scene: flying things, splats
    let fightFrom = 0.6, fightTo = 60, snowing = true;

    // ------------------------------------------- the rebuild after the turn
    if (hourStart) {
      const step = 0.12, t0 = 1.0;
      const a = makeBuild('R', [1, 0], t0, step, cur, false);
      const b = makeBuild('L', [2, 3], t0, step, cur, false);
      a.apply(s, F, kidA); b.apply(s, F, kidB);
      fightFrom = Math.max(a.end, b.end) + 0.6;
    } else if (changedIn.length) {
      const b = makeBuild('L', changedIn, 0, changedIn.length > 1 ? 0.15 : 0.22, cur, true);
      b.apply(s, F, kidB);
      fightFrom = b.end + 0.6;
    }

    // ------------------------------------------- the volley before the turn
    if (!hourEnd && changingOut.length) {
      const shots = [];
      if (changingOut.includes(3)) shots.push({ i: 3, what: 'head' }, { i: 3, what: 'crack' });
      if (changingOut.includes(2)) shots.push({ i: 2, what: 'bigburst' });
      if (changingOut.includes(3)) shots.push({ i: 3, what: 'burst' });
      const GAP = 1.4, LAST = 59.35;
      shots.forEach((sh, j) => { sh.hit = LAST - (shots.length - 1 - j) * GAP; sh.throw = sh.hit - 1.05; });
      const first = shots[0].throw - 0.45;
      fightTo = first - 0.3;
      if (s >= first) {
        kidB.pose = 'duck';
        for (const sh of shots) {
          const col = SLOT[sh.i];
          if (s >= sh.throw - 0.45 && s < sh.throw) kidA.pose = 'wind';
          if (s >= sh.throw && s < sh.throw + 0.35) kidA.pose = 'throw';
          if (s >= sh.throw && s < sh.hit) {
            const p = (s - sh.throw) / (sh.hit - sh.throw);
            fx.push(() => arcBall(sc, A_HOME * 6 + 3, 9, col * 6 + 1, sh.what === 'head' || sh.what === 'bigburst' ? 4 : 11, p));
          }
          if (s < sh.hit) continue;
          const since = s - sh.hit;
          if (sh.what === 'head') {
            F.headOn[sh.i] = false;
            if (sh.i === 3) {
              // the head flies back and lands on the right kid
              if (since < 0.25) {
                fx.push(() => { sc.tile(col + 1, 0, HEAD.map((v, r) => HEAD[r + 2] ?? 0), PRI.fx); sc.romIfEmpty(col, 0, SPLAT); });
              } else kidB.wearing = true;
              kidB.pose = since < 0.25 ? 'duck' : since < 0.9 ? 'ouch' : (Math.floor(since / 0.4) % 2 ? 'step' : 'stand');
            } else if (since < 0.6) {
              fx.push(() => sc.romIfEmpty(col, 0, since < 0.3 ? SPLAT : 0xa5));
            }
          } else if (sh.what === 'crack') {
            F.body[sh.i] = { kind: 'bits', b: cracked(cur[sh.i], since < 0.6 ? 1 : 2) };
            if (since < 0.35) fx.push(() => sc.romIfEmpty(col, 0, SPLAT));
          } else {
            if (sh.what === 'bigburst') F.headOn[sh.i] = false;
            F.body[sh.i] = since < 0.2 ? { kind: 'bits', b: cracked(cur[sh.i], 2) } : { kind: 'none' };
            if (since < 0.65) fx.push(() => {
              const g = since < 0.35 ? 0 : 1;
              sc.romIfEmpty(col, 1, [SPLAT, 0x2e][g]);
              sc.romIfEmpty(col, 0, [0xa5, 0xdf][g]);
            });
          }
        }
        if (kidB.wearing && kidB.pose === 'duck') kidB.pose = 'stand';
      }
    }

    // ------------------------------------------- the sun and the melt at :59
    let melt = -1, sunUp = -1, headMelt = 0;
    if (hourEnd && s >= 44) {
      fightTo = 43.5; snowing = false;
      sunUp = Math.min(1, (s - 44) / 1.8);
      headMelt = Math.max(0, Math.min(1, (s - 46.5) / 7));          // :46.5-:53.5, heads only
      melt = Math.max(0, Math.min(1, (s - 54.2) / 4.4));            // :54.2-:58.6, the bodies
      if (s < 54.2) melt = -1;
      const pose = s < 46.5 ? 'look' : s < 57.6 ? (Math.floor(s / 0.5) % 2 ? 'ouch' : 'look') : 'sit';
      kidA.pose = pose; kidB.pose = pose;
    }
    // ------------------------------------------- the blizzard at :00
    let bliz = 0;
    if (hourStart && s < 2.2) {
      bliz = s < 0.3 ? s / 0.3 : s < 1.2 ? 1 : (2.2 - s) / 1.0;
      if (s < 1.0) { kidA.pose = 'duck'; kidB.pose = 'duck'; }
    }

    // ------------------------------------------- the fight, and snow angels
    if (s >= fightFrom && s < fightTo) {
      const angel = minuteNo % 4 === 1 ? kidA : minuteNo % 4 === 3 ? kidB : null;
      if (angel && s >= 20 && s < 27.5) {
        const other = angel === kidA ? kidB : kidA, u = s - 20;
        angel.col = angel === kidA ? A_HOME - 1 : B_HOME + 1;
        angel.pose = u < 0.4 ? 'step' : u < 0.8 ? 'duck' : u < 6 ? (Math.floor((u - 0.8) / 0.4) % 2 ? 'angel2' : 'angel')
          : u < 6.6 ? 'sit' : 'cheer';
        if (u >= 7.2) angel.col = angel === kidA ? A_HOME : B_HOME;
        other.pose = u > 1 && u < 6 ? (Math.floor(u / 1.3) % 2 ? 'look' : 'stand') : 'stand';
      } else {
        const P = 3.2, n = Math.floor((s - fightFrom) / P), u = (s - fightFrom) - n * P;
        const ex = minuteNo * 17 + n;
        // the left kid throws
        const lb = hash(ex, 4), bHit = lb < 0.22;
        const bX = bHit ? B_HOME * 6 + 2 : (lb < 0.6 ? 13 : 15) * 6 + 1;
        if (u < 0.4) kidA.pose = 'wind';
        else if (u < 0.75) kidA.pose = 'throw';
        if (u >= 0.4 && u < 1.7) fx.push(() => arcBall(sc, A_HOME * 6 + 3, 9, bX, bHit ? 10 : 13, (u - 0.4) / 1.3));
        if (!bHit && u >= 1.0 && u < 1.9) kidB.pose = 'duck';
        if (u >= 1.7 && u < 2.3) {
          if (bHit) kidB.pose = 'hit';
          else if (u < 2.0) fx.push(() => sc.romIfEmpty(Math.floor(bX / 6), 1, SPLAT));
        }
        // the right kid throws back
        const la = hash(ex, 6), aHit = la < 0.22;
        const aX = aHit ? A_HOME * 6 + 2 : (la < 0.6 ? 2 : 0) * 6 + 1;
        if (u >= 1.6 && u < 2.0 && kidB.pose !== 'hit') kidB.pose = 'wind';
        else if (u >= 2.0 && u < 2.35) kidB.pose = 'throw';
        if (u >= 2.0) fx.push(() => arcBall(sc, B_HOME * 6 + 1, 9, aX, aHit ? 10 : 13, (u - 2.0) / 1.2));
        if (!aHit && u >= 2.55) kidA.pose = 'duck';
        if (n > 0 && u < 0.6) {                        // where the last return landed
          const pl = hash(minuteNo * 17 + n - 1, 6);
          if (pl < 0.22) kidA.pose = 'hit';
          else if (u < 0.3) fx.push(() => sc.romIfEmpty(pl < 0.6 ? 2 : 0, 1, SPLAT));
        }
      }
    }

    // ------------------------------------------- compose
    const melting = melt >= 0;
    for (let i = 0; i < 4; i++) {
      const col = SLOT[i];
      if (melting) {
        sc.tile(col, 1, meltBody(cur[i], melt), PRI.digit);
        if (melt < 0.6) sc.tile(col, 0, meltHead(1), PRI.head);
        continue;
      }
      if (headMelt > 0) {
        sc.tile(col, 1, DIG[cur[i]], PRI.digit);
        const h = meltHead(headMelt);
        if (h.some((v) => v)) sc.tile(col, 0, h, PRI.head);
        continue;
      }
      const b = F.body[i];
      if (b.kind === 'digit') sc.tile(col, 1, DIG[b.d], PRI.digit);
      else if (b.kind === 'bits') sc.tile(col, 1, b.b, PRI.digit);
      else if (hourStart && s < 1.0) sc.tile(col, 1, PUDDLE, PRI.digit);
      if (F.headOn[i]) sc.tile(col, 0, HEAD, PRI.head);
    }
    if (sunUp >= 0) {
      const off = Math.round((1 - sunUp) * 6), g = SUN[Math.floor(s / 0.5) % 2];
      sc.tile(7, 0, g.map((v, r) => g[r - off] ?? 0), PRI.head);
      if (sunUp >= 1) { const ray = Math.floor(s / 0.5) % 2 ? 0x2d : 0xa5; sc.romIfEmpty(6, 0, ray); sc.romIfEmpty(8, 0, ray); }
    }
    for (const h of F.heads) if (h !== null && h !== undefined) sc.tile(h, 0, HEAD, PRI.head);
    for (const [kid, side] of [[kidA, 'R'], [kidB, 'L']]) {
      sc.tile(kid.col, 1, KID[side][kid.pose], PRI.kid);
      if (kid.wearing) sc.tile(kid.col, 0, HEAD, PRI.head);
    }
    for (const b of F.balls) if (b) sc.tile(b.cell, 1, ballTile(b.si, b.dx, b.phase), PRI.fx);
    for (const c of F.puffs) { sc.romIfEmpty(c, 0, SPLAT); sc.romIfEmpty(c + 1, 0, 0xa5); sc.romIfEmpty(c - 1, 0, 0xdf); }
    for (const f of fx) f();
    if (bliz > 0) {
      const tick = Math.floor(T * 6);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
        if (row === 1 && (col === kidA.col || col === kidB.col)) continue;
        if (s >= 1.0 && !sc.empty(col, row)) continue;
        const h = hash(col * 1.7 + row * 31 + tick * 5.3, tick);
        if (h < bliz * 0.8) sc.rom(col, row, BLIZ[Math.floor(hash(col + tick * 3, row + 2) * BLIZ.length)]);
      }
    } else if (snowing) snowfall(sc, T);
    sc.draw();
  },
};
