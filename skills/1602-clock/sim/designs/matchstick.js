// Matchstick — the time is a matchstick puzzle, and a matchstick man
// solves it every minute.
//
// The four digits are laid out of matches: one-dot sticks with 2x2 heads,
// the bars a whole cell wide and the sticks on the cell edge beside them, so
// the one-dot gap between cells is the joint between two matches, as in the
// puzzle books. The man is a match too (his head is a match head) and lives
// beside a matchbox with a striker down its side.
//
// Just before :00 he walks to the digit that is about to change and studies it, hand
// on chin, foot tapping. At :00 he solves "move the fewest matches": every
// match that can go straight to a new place does, the rest go back in the
// box or come out of it, in the order that walks least and never leaves a
// digit reading as some other number. He pulls a match out, carries it like
// a torch and plants it; surplus matches he gathers in an armful.
//
// On the hour he takes a match from the box, strikes it three times on the
// striker, carries it alight to the colon and touches it to the old hour,
// which goes up all at once, singeing him. When the embers have smoked out
// he fixes the minutes, fetches an armful and lays the new hour, then
// cheers. Between turns he taps his foot every second, fidgets, and at :20
// flips a spare match three times and fumbles the fourth.
//
// Budget: the digits are a kit of five parts (top bar, bottom bar, both, a
// stick on the left or the right edge). The man is one column of two cells,
// and everything he holds is drawn inside them, with whatever is under him
// cut back a dot round his outline so he never fuses with a digit: two
// tiles wherever he stands. The burning hour is one fire tile for every
// cell at once. The box takes the slot left over. At most eight, every
// instant; the colon and the smoke are ROM.
//
// Everything is a pure function of the wall clock: each minute turn is a
// script of keyframes built from (previous time, this time), and a frame
// looks up where it is in it. No keyframe holds less than 0.24 s.

import { art, TileAllocator } from '../js/kit.js';

// ------------------------------------------------------------------ parts

const bits = (rows) => rows.map((r) => [...r].reduce((v, c) => (v << 1) | (c === '#' ? 1 : 0), 0));
const pic = (s) => bits(art(s));
const mirror = (b) => b.map((v) => [0, 1, 2, 3, 4].reduce((o, i) => o | ((v >> i & 1) << (4 - i)), 0));

const PART = {
  T: pic(`
    #####
    ...##
    .....
    .....
    .....
    .....
    .....
    .....`),
  L: pic(`
    .....
    .....
    .....
    .....
    .....
    .....
    ...##
    #####`),
  VL: pic(`
    ...##
    ...##
    ....#
    ....#
    ....#
    ....#
    ....#
    ....#`),
};
PART.VR = mirror(PART.VL);

// The old hour going up: every cell that held a match becomes the same
// fire tile, so a whole hour of flames costs one or two slots.
const FIRE = {
  flare: pic(`
    #.#.#
    .#.#.
    #.#.#
    .###.
    #####
    #####
    .###.
    #.#.#`),
  A: pic(`
    ..#..
    ..#..
    .##.#
    .#.##
    ##.#.
    #.#.#
    #.#.#
    .###.`),
  B: pic(`
    .....
    .#...
    .#..#
    .##.#
    #.###
    #.#.#
    ##.##
    .###.`),
  lowA: pic(`
    .....
    .....
    .....
    .....
    ..#..
    .#.#.
    .#.#.
    #.#.#`),
  lowB: pic(`
    .....
    .....
    .....
    .....
    .....
    ...#.
    .#.#.
    #.#.#`),
  ember: pic(`
    .....
    .....
    .....
    .....
    .....
    .....
    .....
    #.#.#`),
};

// Segment -> [column offset in the digit, row, part]. A digit is three cells
// wide: a cell of left sticks (on its right edge), a cell of bars, a cell of
// right sticks (on its left edge). HH is cells 0-5, MM is 7-12. An earlier
// version shared the stick cell between the two digits of a pair; a 1 then
// sat three dots from the next digit and "10" read as one shape.
const SEG = { f: [0, 0, 'VL'], e: [0, 1, 'VL'], b: [2, 0, 'VR'], c: [2, 1, 'VR'], a: [1, 0, 'T'], g: [1, 0, 'L'], d: [1, 1, 'L'] };
const SEGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const DIGIT = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const MASK = Object.fromEntries(Object.entries(DIGIT).map(([d, s]) => [d, [...s].reduce((m, c) => m | (1 << SEGS.indexOf(c)), 0)]));
const VALID = new Map(Object.entries(MASK).map(([d, m]) => [m, Number(d)]));
const BASE = [0, 3, 7, 10];
const COLON = 6;
const segCol = (k, s) => BASE[k] + SEG[s][0];
const has = (m, s) => (m >> SEGS.indexOf(s)) & 1;
const without = (m, s) => m & ~(1 << SEGS.indexOf(s));
const withSeg = (m, s) => m | (1 << SEGS.indexOf(s));

const HOME = 13;          // where he idles, beside the box
const BOXSIDE = 13;       // where he stands to reach into the box
const BOX_COLS = [14, 15];
// The matchbox: two cells of sleeve with a striker down the side. It takes
// the slot that is always left over; if it ever were not, ROM 0xff stands in.
const BOX = pic(`
  .....
  #####
  #.#.#
  ##.##
  #.#.#
  ##.##
  #.#.#
  #####`);

/** Map of cell key (col + 16*row) -> 8 row bytes, for four digit masks. */
function digitCells(masks) {
  const cells = new Map();
  masks.forEach((m, k) => SEGS.forEach((s) => {
    if (!has(m, s)) return;
    const [dc, row, part] = SEG[s], key = BASE[k] + dc + row * 16;
    const cur = cells.get(key) ?? Array(8).fill(0);
    cells.set(key, cur.map((v, r) => v | PART[part][r]));
  }));
  return cells;
}

// ------------------------------------------------------------------ the man
//
// Poses are his column, both rows: 5 dots by 16, feet on the bottom row.
// He is a match too: his head is a match head.

const LEGS = {
  stand: ['.#.#.', '.#.#.', '.#.#.', '##.##'],
  tap: ['.#.#.', '.#.#.', '.#..#', '##...'],
  stride: ['.#.#.', '#...#', '#...#', '#...#'],
  pass: ['..#..', '..#..', '.#.#.', '##.#.'],
};
const TORSO = {
  //          y3       y4       y5       y6       y7       y8
  down:   ['..##.', '..##.', '..#..', '.###.', '#.#.#', '#.#.#'],
  swing:  ['..##.', '..##.', '..#..', '.###.', '#.#.#', '..#..'],
  hips:   ['..##.', '..##.', '..#..', '.###.', '#.#.#', '.###.'],
  watch:  ['.##..', '.##..', '..#..', '.###.', '.#.#.', '.#.#.'],
  chin:   ['..##.', '..##.', '..#.#', '.####', '#.#..', '#.#..'],
  reachR: ['..##.', '..##.', '..#..', '.####', '#.#..', '#.#..'],
  hold:   ['.##..', '.##..', '..#..', '.###.', '#.#..', '#.#..'],
  up:     ['#.##.', '#.##.', '#.#..', '.###.', '..#.#', '..#.#'],
  cheer:  ['#.###', '#.###', '.###.', '..#..', '..#..', '..#..'],
};
const OVERHEAD = { up: ['#....', '#....', '#....'], cheer: ['.....', '#...#', '#...#'] };

function body(torso, legs) {
  const top = OVERHEAD[torso] ?? ['.....', '.....', '.....'];
  return bits([...top, ...TORSO[torso], '..#..', '..#..', '..#..', ...LEGS[legs]]);
}

const POSE = {
  stand: body('down', 'stand'),
  tap: body('down', 'tap'),
  walkA: body('swing', 'stride'),
  walkB: body('down', 'pass'),
  hips: body('hips', 'stand'),
  hipsTap: body('hips', 'tap'),
  think: body('chin', 'stand'),
  thinkTap: body('chin', 'tap'),
  reachR: body('reachR', 'stand'),
  reachRL: mirror(body('reachR', 'stand')),
  up: body('up', 'stand'),
  cheer: body('cheer', 'stand'),
  hold: body('hold', 'stand'),
  holdA: body('hold', 'stride'),
  holdB: body('hold', 'pass'),
  watch: body('watch', 'stand'),
  squat: pic(`
    .....
    .....
    .....
    .....
    .....
    .....
    ..##.
    ..##.
    ..#..
    .###.
    #.#.#
    #.#.#
    ..#..
    .#.#.
    #...#
    #...#`),
};
// Facing the other way: a mirrored copy of every pose.
for (const [k, v] of Object.entries({ ...POSE })) POSE[k + 'L'] = mirror(v);

/** Shift a 16-row picture up by n rows (a hop). */
const hop = (b, n) => [...b.slice(n), ...Array(n).fill(0)];

// Things in his hands, drawn into his column.
function itemBits(item) {
  const out = Array(16).fill(0);
  const blit = (rows, y0) => rows.forEach((v, r) => { if (y0 + r >= 0 && y0 + r < 16) out[y0 + r] |= v; });
  if (!item) return out;
  const R = item.side !== 'L';
  if (item.type === 'v') blit(R ? PART.VL : PART.VR, item.y);
  if (item.type === 'diag') blit(R ? ITEM.diag : mirror(ITEM.diag), item.y ?? 2);
  if (item.type === 'bundle') blit(ITEM.bundle, 0);
  if (item.type === 'h') blit(PART.T, item.y);
  if (item.type === 'floor') blit(PART.L, 8);
  if (item.flame != null) blit(R ? FLAME[item.flame] : mirror(FLAME[item.flame]), 0);
  if (item.spark) blit(ITEM.spark, 8);
  return out;
}
const ITEM = {
  diag: pic(`
    ...##
    ...##
    ...#.
    ..#..
    ..#..
    .#...
    .#...
    #....`),
  bundle: pic(`
    ..###
    ..###
    ...##
    ...##
    ...##
    ...##
    ...##
    ...##`),
  spark: pic(`
    .....
    ....#
    ...#.
    ....#
    .....
    .....
    .....
    .....`),
};
const FLAME = [
  pic(`
    ...#.
    ...##`),
  pic(`
    ....#
    ...#.`),
  pic(`
    #.#.#
    .###.`),         // the flare, as it catches
];

// ------------------------------------------------------------- the puzzle

function* perms(a) {
  if (a.length <= 1) { yield a.slice(); return; }
  for (let i = 0; i < a.length; i++) {
    const rest = [...a.slice(0, i), ...a.slice(i + 1)];
    for (const p of perms(rest)) yield [a[i], ...p];
  }
}

/**
 * The fewest matches to move from old digits to new ones: every match that
 * can go straight to a new place does (a move), the rest go back in the box
 * (out) or come from it (in). Of all the ways to pair and order them, the one
 * that walks least and never leaves a digit showing some other number.
 */
function solve(oldD, newD, ks, start) {
  const R = [], A = [];
  for (const k of ks) {
    const o = MASK[oldD[k]], n = MASK[newD[k]];
    for (const s of SEGS) {
      if (has(o, s) && !has(n, s)) R.push([k, s]);
      if (!has(o, s) && has(n, s)) A.push([k, s]);
    }
  }
  const p = Math.min(R.length, A.length);
  const c = ([k, s]) => segCol(k, s);
  let best = { moves: [], out: [], in: [] }, bestCost = Infinity;
  for (const pr of perms(R)) {
    for (const pa of perms(A)) {
      const plan = { moves: pr.slice(0, p).map((f, i) => [f, pa[i]]), out: pr.slice(p), in: pa.slice(p) };
      const m = oldD.map((d) => MASK[d]);
      let col = start, cost = 0;
      const go = (x) => { cost += Math.abs(col - x); col = x; };
      const check = (k) => {
        const v = VALID.get(m[k]);
        if (v !== undefined && v !== oldD[k] && v !== newD[k]) cost += 40;
      };
      const take = ([k, s]) => { m[k] = without(m[k], s); check(k); };
      const put = ([k, s]) => { m[k] = withSeg(m[k], s); check(k); };
      for (const [f, t] of plan.moves) { go(c(f)); take(f); go(c(t)); put(t); }
      for (const f of plan.out) { go(c(f)); take(f); }
      if (plan.out.length || plan.in.length) go(BOXSIDE);
      for (const t of plan.in) { go(c(t)); put(t); }
      cost += Math.abs(col - HOME) * 0.5;
      if (cost < bestCost) { bestCost = cost; best = plan; }
    }
  }
  return best;
}

// ------------------------------------------------------------- the script

const STEP = 0.24;    // a cell per step
const BEAT = 0.25;    // a grab, a lift, a plant

class Script {
  constructor(masks, col) { this.keys = []; this.m = masks.slice(); this.col = col; this.t = 0; this.n = 0; this.side = 'R'; }
  /** What his hands hold, drawn: one match like a torch, or an armful. */
  get held() { return this._held !== undefined ? this._held : this.n === 0 ? null : this.n === 1 ? { type: 'v', side: this.side, y: 2 } : { type: 'bundle' }; }
  set held(v) { this._held = v; }
  key(dur, pose, extra = {}) {
    this.keys.push({ t: this.t, dur, col: this.col, pose, m: this.m.slice(), item: this.held, ...extra });
    this.t += dur;
  }
  /** Pose name for the side he holds a single match on. */
  P(name) { return this.n === 1 && this.side === 'L' && this._held === undefined ? name + 'L' : name; }
  walk(to) {
    const dir = Math.sign(to - this.col);
    let i = 0;
    while (this.col !== to) {
      this.col += dir;
      const stride = i++ % 2 === 0;
      const held = this._held !== undefined ? this._held : this.held;
      this.key(STEP, held ? this.P(stride ? 'holdA' : 'holdB') : stride ? 'walkA' : 'walkB');
    }
  }
  remove(k, s) { this.m[k] = without(this.m[k], s); }
  add(k, s) { this.m[k] = withSeg(this.m[k], s); }
  /** Show a transitional thing in his hands for one beat. */
  beat(pose, item, extra) { this._held = item; this.key(BEAT, pose, extra); this._held = undefined; }

  pick([k, s]) {
    const [, row, part] = SEG[s];
    const low = row === 1, vert = part === 'VL' || part === 'VR';
    if (this.n > 0) {
      // Hands already full: stoop or reach, and add it to the armful.
      this.key(BEAT, low ? 'squat' : 'hold');
      this.remove(k, s); this.n++;
      this.key(BEAT, 'hold');
      return;
    }
    const side = part === 'VR' ? 'L' : 'R', L = side === 'L' ? 'L' : '';
    if (vert) {
      this.key(BEAT, (low ? 'squat' : 'reachR') + L);
      this.remove(k, s);
      if (low) this.beat('squat' + L, { type: 'v', side, y: 8 });
      this.beat('hold' + L, { type: 'v', side, y: low ? 4 : 0 });
    } else {
      this.key(BEAT, s === 'a' ? 'up' : low ? 'squat' : 'stand');
      this.remove(k, s);
      this.beat(low ? 'squat' : 'hold', { type: 'diag', side: 'R', y: low ? 8 : s === 'g' ? 4 : 0 });
    }
    this.n = 1; this.side = vert ? side : 'R';
    this.key(BEAT, this.P('hold'));
  }

  place([k, s]) {
    const [, row, part] = SEG[s];
    const low = row === 1, vert = part === 'VL' || part === 'VR';
    if (this.n > 1) {
      this.key(BEAT, low ? 'squat' : 'hold');
      this.add(k, s); this.n--;
      this.key(BEAT, low ? 'squat' : 'hold');
      return;
    }
    const side = part === 'VR' ? 'L' : 'R', L = side === 'L' ? 'L' : '';
    if (vert) {
      if (this.side !== side) { this.side = side; this.key(BEAT, 'hold' + L); }
      this.beat((low ? 'squat' : 'hold') + L, { type: 'v', side, y: low ? 8 : 0 });
      this.n = 0; this.add(k, s);
      this.key(BEAT, (low ? 'squat' : 'reachR') + L);
    } else {
      this.beat(low ? 'squat' : 'hold', { type: 'diag', side: 'R', y: low ? 8 : s === 'g' ? 4 : 0 });
      this.n = 0; this.add(k, s);
      this.key(BEAT, s === 'a' ? 'up' : low ? 'squat' : 'stand');
    }
    this.key(STEP, 'stand');
  }

  fromBox(n) { this.key(BEAT, 'reachR'); this.n = n; this.side = 'R'; this.key(BEAT, 'hold'); }
  toBox() {
    if (this.n === 1 && this.side !== 'R') { this.side = 'R'; this.key(BEAT, 'hold'); }
    this.key(BEAT, 'reachR'); this.n = 0; this.key(BEAT, 'reachR'); this.key(STEP, 'stand');
  }

  run(plan) {
    for (const [f, t] of plan.moves) { this.walk(segCol(...f)); this.pick(f); this.walk(segCol(...t)); this.place(t); }
    for (const f of plan.out) { this.walk(segCol(...f)); this.pick(f); }
    if (plan.out.length) { this.walk(BOXSIDE); this.toBox(); }
    if (plan.in.length) { this.walk(BOXSIDE); this.fromBox(plan.in.length); }
    for (const t of plan.in) { this.walk(segCol(...t)); this.place(t); }
  }
}

const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
const THINK = 2.4;    // he studies the puzzle this long before :00

/**
 * The work of one minute turn, old -> new: `pre` runs up to :00 (nothing on
 * the face changes in it), `post` from :00.
 */
function plan(oldD, newD) {
  const hour = oldD[0] !== newD[0] || oldD[1] !== newD[1];
  const masks = oldD.map((d) => MASK[d]);
  const firstCol = (p) => (p.moves.length ? segCol(...p.moves[0][0]) : p.out.length ? segCol(...p.out[0]) : p.in.length ? BOXSIDE : HOME);

  if (!hour) {
    const work = solve(oldD, newD, [2, 3], HOME);
    const first = firstCol(work);
    const pre = new Script(masks, HOME);
    pre.walk(first);
    for (let i = 0; i < THINK / 0.5; i++) pre.key(0.5, i % 2 ? 'thinkTap' : 'think');
    const post = new Script(masks, first);
    post.run(work);
    post.walk(HOME);
    post.key(0.6, 'hips');
    return { pre, post };
  }

  // The hour. Before :00 he strikes a match on the box and carries it,
  // alight, to the old hour. Nothing on the face changes yet.
  const torch = (f) => ({ type: 'v', side: 'R', y: 2, flame: f });
  const pre = new Script(masks, HOME);
  pre.walk(BOXSIDE);
  pre.fromBox(1);
  for (let i = 0; i < 3; i++) {
    pre.beat('reachR', { type: 'diag', side: 'R', y: 6, spark: i > 0 });
    pre.key(BEAT, 'hold');
  }
  pre.n = 0;
  pre._held = torch(2); pre.key(0.4, 'hold');
  for (let i = 0; pre.col !== COLON; i++) { pre.col--; pre._held = torch(i % 2); pre.key(STEP, i % 2 ? 'holdB' : 'holdA'); }
  for (let i = 0; i < 3; i++) { pre._held = torch(i % 2); pre.key(0.3, 'hold'); }

  // From :00: he touches the flame to the old hour and the whole of it goes
  // up at once, match head to match head, singeing him.
  const post = new Script(masks, COLON);
  const burnt = [...digitCells([masks[0], masks[1], 0, 0]).keys()];
  post.beat('reachRL', { type: 'v', side: 'L', y: 2, flame: 1 });
  post.m[0] = post.m[1] = 0;
  post.key(0.3, 'cheer', { hop: 2, fire: 'flare', burnt });
  const fireFor = [];
  for (let i = 0; i < 10; i++) fireFor.push(i % 2 ? 'B' : 'A');
  for (let i = 0; i < 3; i++) fireFor.push(i % 2 ? 'lowB' : 'lowA');
  for (let i = 0; i < 3; i++) fireFor.push('ember');
  const after = ['think', 'think', 'thinkTap', 'think', 'hips', 'hipsTap', 'hips', 'hipsTap', 'hips', 'hipsTap', 'hips', 'hipsTap', 'hips', 'tap', 'stand', 'tap'];
  fireFor.forEach((f, i) => post.key(0.25, after[i], { fire: f, burnt }));
  const smoke = burnt.map((k) => ({ col: k % 16, row: k >> 4, t: post.t }));
  post.key(0.5, 'hips');
  // Then the minutes, as on any other turn.
  post.run(solve(oldD, newD, [2, 3], post.col));
  // Then an armful from the box, and the new hour laid down left to right.
  const lay = [];
  for (let col = 0; col <= BASE[1] + 2; col++) for (const k of [0, 1]) for (const s of SEGS) if (has(MASK[newD[k]], s) && segCol(k, s) === col) lay.push([k, s]);
  post.walk(BOXSIDE);
  post.fromBox(lay.length);
  for (const t of lay) { post.walk(segCol(...t)); post.place(t); }
  post.walk(HOME);
  for (let i = 0; i < 4; i++) post.key(0.3, 'cheer', { hop: i % 2 ? 0 : 2 });
  post.key(0.5, 'hips');
  post.smoke = smoke;
  return { pre, post };
}

const PLANS = new Map();
function planFor(oldD, newD) {
  const key = oldD.join('') + newD.join('');
  if (!PLANS.has(key)) PLANS.set(key, plan(oldD, newD));
  return PLANS.get(key);
}

function at(script, t) {
  const keys = script.keys;
  let lo = 0, hi = keys.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (keys[mid].t <= t) lo = mid; else hi = mid - 1; }
  return keys[lo];
}

// Idle at home: a foot tapping every second, and something else now and then.
const FIDGET = ['tap', 'tap', 'hips', 'tap', 'think', 'tap', 'tap', 'look', 'tap', 'hips', 'tap', 'stretch'];
function idle(n, sub) {
  const f = FIDGET[Math.floor(n / 2) % FIDGET.length];
  const half = sub < 0.5;
  if (f === 'tap') return half ? 'tap' : 'stand';
  if (f === 'hips') return half ? 'hipsTap' : 'hips';
  if (f === 'think') return half ? 'thinkTap' : 'think';
  if (f === 'look') return half ? 'standL' : 'tapL';
  return half ? 'up' : 'cheer';
}

// Mid-minute, when he has nothing to do, he takes a spare and flips it:
// three clean flips, then one he fumbles to the floor.
const JUGGLE_AT = 20;
const JUGGLE = (() => {
  const j = new Script([0, 0, 0, 0], HOME);
  j.walk(BOXSIDE);
  j.fromBox(1);
  const flip = [
    ['reachR', { type: 'v', side: 'R', y: 0 }],
    ['stand', { type: 'diag', side: 'R', y: 0 }],
    ['stand', { type: 'h', y: 0 }],
    ['stand', { type: 'diag', side: 'L', y: 0 }],
  ];
  for (let i = 0; i < 3; i++) { for (const [p, it] of flip) j.beat(p, it); j.key(0.3, 'hold'); }
  for (const [p, it] of flip) j.beat(p, it);
  j.n = 0;
  j.beat('reachR', { type: 'diag', side: 'R', y: 6 });
  j.beat('reachR', { type: 'floor' });
  j.beat('think', { type: 'floor' });
  j.beat('think', { type: 'floor' });
  j.beat('squat', { type: 'floor' });
  j.n = 1; j.key(BEAT, 'hold');
  j.toBox();
  j.walk(HOME);
  return j;
})();

// ------------------------------------------------------------------ design

export default {
  name: 'Matchstick',
  blurb: 'A matchstick puzzle that solves itself: each minute a matchstick man moves the fewest matches to make the new time; on the hour he sets the old one alight.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, fields, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const base = date.getTime() - fields.s * 1000 - fields.ms;
    const cur = digitsOf(fields);
    const prev = digitsOf(kit.clockFields(new Date(base - 60000)));
    const next = digitsOf(kit.clockFields(new Date(base + 60000)));
    const { post } = planFor(prev, cur);
    const { pre } = planFor(cur, next);

    let key, smoke = [];
    if (sec < post.t) { key = at(post, sec); smoke = post.smoke ?? []; }
    else if (sec >= 60 - pre.t) key = at(pre, sec - (60 - pre.t));
    else {
      const m = cur.map((d) => MASK[d]);
      if (post.t < JUGGLE_AT && 60 - pre.t > JUGGLE_AT + JUGGLE.t && sec >= JUGGLE_AT && sec < JUGGLE_AT + JUGGLE.t) {
        key = { ...at(JUGGLE, sec - JUGGLE_AT), m };
      } else {
        const n = Math.floor(sec);
        key = { col: HOME, pose: idle(n + fields.m * 60, sec - n), m, item: null };
      }
    }

    // The man: his pose, and what he holds.
    let man = POSE[key.pose].slice();
    if (key.hop) man = hop(man, key.hop);
    const it = itemBits(key.item);
    man = man.map((v, r) => v | it[r]);

    // He stands in front of the matches: whatever is under him is cut back
    // a dot all round his outline, so he never fuses with a digit.
    const halo = man.map((v, r) => {
      const near = v | (man[r - 1] ?? 0) | (man[r + 1] ?? 0);
      return (near | (near << 1) | (near >> 1)) & 0x1f;
    });

    const cells = digitCells(key.m);
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const alloc = new TileAllocator(lcd, 0);
    for (const [k, rows] of cells) grid[k >> 4][k % 16] = rows;
    grid[0][COLON] = grid[1][COLON] = 0xa5;
    
    if (key.fire) for (const k of key.burnt) {
      grid[k >> 4][k % 16] = FIRE[key.fire];
    }
    for (const s of smoke) {
      const age = sec - s.t;
      if (age > 0 && age < 2 && !cells.has(s.col + s.row * 16)) grid[s.row][s.col] = age < 1 ? 0xdf : 0x27;
    }
    for (const row of [0, 1]) {
      const what = grid[row][key.col];
      const under = Array.isArray(what) ? what : lcd.glyph(what);
      const rows = under.map((v, r) => (v & ~halo[row * 8 + r]) | man[row * 8 + r]);
      grid[row][key.col] = rows.some((v) => v) ? rows : 0x20;
    }
    // Digits and the man first; that is at most eight tiles.
    const codes = grid.map((line) => line.map((w) => (Array.isArray(w) ? alloc.add(w) : w)));
    // Spares lying on the box lid, only if their tile is already resident.
    const spare = alloc.index.get(PART.L.join('/'));
    if (spare !== undefined) for (const c of BOX_COLS) if (key.col !== c) codes[0][c] = spare;
    const box = alloc.add(BOX) ?? 0xff;
    for (const c of BOX_COLS) if (key.col !== c) codes[1][c] = box;
    alloc.flush();
    codes.forEach((line, row) => { lcd.setCursor(0, row); line.forEach((c) => lcd.data(c ?? 0x20)); });
  },
};
