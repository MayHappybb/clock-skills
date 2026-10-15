// Ducks — a mother duck and four ducklings, at the edge of a pond.
//
// Not a clock: a desk toy. The left of the bottom row is the bank (ROM '_'),
// the right is water. Every 90 seconds the family comes by. They waddle in
// along the bank in a line, the mother leading; often the last duckling stops
// to peck at something, looks up to find itself alone ("pip!") and scurries
// after them. They plop in one by one, each with a splash, drift apart and
// bob about. One dives bottoms up, feet kicking. Sometimes the one at the
// back wanders off up the bank and looks about ("pip?"), the mother turns
// and calls "QUACK!", the others close up round her and the stray hurries
// back to the end of the line. Then home: back to the bank, ducklings first
// and the mother last, and away. While the pond is empty a frog may hop
// along the bank, croak and jump in, or a fish leaps. Which duckling does
// what, and whether it happens, is decided per visit by deterministic noise.
//
// From 21:00 to 06:00 they sleep in a huddle on the bank under a crescent
// moon and twinkling ROM stars; z and Z drift off the mother's back, and
// once a visit a duckling wakes, looks round, peeps and settles again. The
// first visit of the night walks them in to bed; the first of the morning
// wakes them where they slept and takes them to the water.
//
// The budget trick is that the ducks move a whole cell at a time, so every
// duckling in the same pose is the same tile: four ducklings walking in step
// cost two tiles (legs together, legs apart), however many there are, and
// afloat they cost one. A duckling is exactly one cell; the mother is two
// cells of body with her head in the cell above her front half, three tiles,
// and each half of her floats or stands on its own cell, so she can be half
// in the water. The water is one tile in every water cell, a ripple whose
// phase moves a dot every 0.4 s (as in `runner` and `tide`). Speech, splashes
// (` and ' either side of a dot), stars and z's are ROM; top-row ROM gives way
// to a head passing in front of it. Worst case eight slots, checked on every
// frame of a whole day, not just the budget tool's samples.
//
// Each duck steps a cell every 0.6 s, its legs alternating every 0.3 s; they
// set off in turn 150 ms apart, front first, which both looks like a family
// following its mother and guarantees that nobody steps into a cell that is
// not yet empty. Every pose holds 300 ms or more.
//
// Tried and dropped: a 'Y' as a reed (it read as a letter), ripples as
// separate humps, a 5-dot fish (it read as an asterisk), and a 5x5 frog in
// profile (it read as a staircase); the frog is face on now, two cells wide.

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 10;
const WATER = 7;          // first water cell on the bottom row; 0-6 is the bank
const PER = 0.6;          // seconds a cell, walking or swimming
const P = 90;             // seconds an episode

// ------------------------------------------------------------------ the art
// Right-facing. '#' lit, 'o' forced dark, '.' transparent. The mother is two
// cells wide and both rows tall; her head is the top-row cell over her front
// half. Rows are dot rows of the glass (0-15); the bank's ground is ROM '_'
// on dot row 14, which every duck stands on.

const MOM = [
  '', '',
  '......##..',
  '.....####.',
  '.....#o###',
  '.....#####',
  '......##..',
  '......##..',
  '#.....###.',
  '##...####.',
  '##########',
  '##########',
  '.########.',
];
const MOM_LEGS = ['...#...#..', '..#.....#.'];
const MOM_QUACK = [                   // bill open
  '', '',
  '......##..',
  '.....####.',
  '.....#o###',
  '.....##...',
  '......####',
  '......##..',
];
const MOM_SLEEP = [                   // head turned back onto her back
  '', '', '', '', '', '', '', '',
  '..........',
  '.....###..',
  '##..#o###.',
  '##########',
  '.########.',
  '..........',
];

// Ducklings: one cell, dot rows 8-13.
const KID = {
  walk: [['..##.', '..###', '#.##.', '####.', '.###.', '..#..'],
         ['..##.', '..###', '#.##.', '####.', '.###.', '.#.#.']],
  peck: [['.....', '.....', '#....', '####.', '.####', '..#.#'],
         ['.....', '#....', '###..', '#####', '.###.', '..#..']],
  dive: [['#...#', '.#.#.', '.###.', '.###.', '..#..'],
         ['.#.#.', '.#.#.', '.###.', '.###.', '..#..']],
  sleep: [['.....', '.....', '.....', '.##..', '#####', '####.'],
          ['.....', '.....', '.....', '.....', '#####', '#####']],
};

// A frog, for the empty pond, face on and two cells wide: eyes up top,
// a wide mouth, feet splayed. Sitting it is dot rows 8-13; it croaks by
// puffing out its throat, and leaps with its legs out behind.
const FROG = {
  sit: ['.##....##.', '#o##..##o#', '##########', '#........#', '.########.', '##.#..#.##'],
  croak: ['.##....##.', '#o##..##o#', '##########', '#........#', '##########', '.########.'],
  leap: ['.##....##.', '#o##..##o#', '##########', '#........#', '.########.', '.#......#.', '#........#'],
};
// A fish's leap, in three frames: rising out of the water, over the top
// (two cells wide, so it reads as a fish and not a star), diving back in.
const FISH = {
  rise: ['...##', '..###', '.###.', '.##..', '#.#..'],
  arc: ['....###..', '#..#####.', '.####o###', '#..#####.', '....###..'],
  dive: ['#.#..', '.##..', '.###.', '..###', '...##'],
};
const MOON = [0b01110, 0b11100, 0b11000, 0b11000, 0b11100, 0b01110, 0, 0];

const mirror = (art) => {
  const w = Math.max(...art.map((l) => l.length));
  return art.map((l) => (l ? [...l.padEnd(w, '.')].reverse().join('') : l));
};

// The water: a ripple on dot rows 13-14 of the bottom row, one tile in every
// water cell, its phase moving a dot every 0.4 s.
const RIPPLE = ['..##.', '##..#'];

// ------------------------------------------------------------------ canvas

/** The glass as 32 cells over ROM codes or tiles, inked dot by dot. */
class Canvas {
  constructor(lcd) {
    this.lcd = lcd;
    this.bg = [Array(16).fill(0x20), Array(16).fill(0x20)];
    this.on = new Map();
    this.off = new Map();
  }
  put(col, row, what) { if (col >= 0 && col < 16) this.bg[row][col] = what; return this; }
  text(col, row, s) { [...s].forEach((ch, i) => this.put(col + i, row, ch.charCodeAt(0))); return this; }
  /** Dot column X (five a cell), dot row Y (0-15). */
  dot(X, Y, lit = true) {
    if (X < 0 || X >= 80 || Y < 0 || Y >= 16) return;
    const key = (Y >> 3) * 16 + Math.floor(X / 5), r = Y & 7;
    const m = lit ? this.on : this.off;
    const rows = m.get(key) ?? Array(8).fill(0);
    rows[r] |= 0x10 >> (X % 5);
    m.set(key, rows);
  }
  /** Stamp art with its top-left at (X, Y); rows below `clip` are dropped. */
  stamp(art, X, Y, { flip = false, clip = 15 } = {}) {
    const a = flip ? mirror(art) : art;
    a.forEach((l, r) => [...l].forEach((ch, i) => {
      if (Y + r > clip) return;
      if (ch === '#') this.dot(X + i, Y + r, true);
      else if (ch === 'o') this.dot(X + i, Y + r, false);
    }));
  }
  draw() {
    const alloc = new TileAllocator(this.lcd, 0);
    const out = [[], []];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const key = row * 16 + col;
      let what = this.bg[row][col];
      const inked = this.on.has(key) || this.off.has(key);
      // The sky is behind the ducks: ROM in the top row yields to ink.
      if (inked && row === 0 && !Array.isArray(what)) what = 0x20;
      if (inked) {
        const base = Array.isArray(what) ? what : this.lcd.glyph(what);
        const on = this.on.get(key) ?? Array(8).fill(0), off = this.off.get(key) ?? Array(8).fill(0);
        out[row][col] = alloc.add(base.map((b, r) => ((b | on[r]) & ~off[r]) & 0x1f)) ?? 0x20;
      } else out[row][col] = Array.isArray(what) ? alloc.add(what) ?? 0x20 : what;
    }
    alloc.flush();
    out.forEach((codes, row) => { this.lcd.setCursor(0, row); codes.forEach((c) => this.lcd.data(c)); });
    this.alloc = alloc;
    return alloc;
  }
}

const bits = (s) => [...s].reduce((b, ch, i) => (ch === '#' ? b | (0x10 >> i) : b), 0);
const shift = (s, p) => s.slice(5 - p) + s.slice(0, 5 - p);
const ripple = (p) => [0, 0, 0, 0, 0, bits(shift(RIPPLE[0], p)), bits(shift(RIPPLE[1], p)), 0];

// ------------------------------------------------------------------ tracks

/**
 * One duck's episode: a list of segments, each a hold or a walk from cell to
 * cell at a steady pace. A duck steps at the end of each `per`; while it is
 * moving its legs alternate twice a step.
 */
class Track {
  constructor(x, face = 1) { this.x = x; this.face = face; this.t = 0; this.segs = []; }
  hold(dur, pose = null) {
    if (dur > 0) this.segs.push({ t0: this.t, t1: this.t + dur, x0: this.x, x1: this.x, per: 1, face: this.face, pose });
    this.t += Math.max(0, dur);
    return this;
  }
  until(t, pose = null) { return this.hold(t - this.t, pose); }
  turn(face) { this.face = face; return this; }
  go(x, per = PER, pose = null) {
    const n = Math.abs(x - this.x);
    if (!n) return this;
    this.face = Math.sign(x - this.x);
    this.segs.push({ t0: this.t, t1: this.t + n * per, x0: this.x, x1: x, per, face: this.face, pose, moving: true });
    this.t += n * per;
    this.x = x;
    return this;
  }
  /** Where the duck is at episode time `u`. */
  at(u) {
    const s = this.segs.find((g) => u < g.t1);
    if (!s) return { x: this.x, face: this.face, pose: null, k: 0, still: true, u: 0 };
    if (u < s.t0) return { x: s.x0, face: s.face, pose: null, k: 0, still: true, u: 0 };
    const n = Math.floor((u - s.t0) / s.per);
    const x = s.moving ? s.x0 + Math.sign(s.x1 - s.x0) * Math.min(n + 1, Math.abs(s.x1 - s.x0)) : s.x0;
    return { x, face: s.face, pose: s.pose, k: Math.floor((u - s.t0) / (s.per / 2)) % 2, still: !s.moving, u: u - s.t0 };
  }
}

// ----------------------------------------------------------------- episode

const plans = new Map();

/** Set by every frame, for checks: did a tile fail to get a slot? */
export const lastFrame = { overflow: false };

const EPISODES = 86400 / P;
const isNight = (ep) => {
  const h = Math.floor((((ep % EPISODES) + EPISODES) % EPISODES) * P / 3600);
  return h >= 21 || h < 6;
};
// Asleep on the bank: three ducklings tucked against her tail, one at her bill.
const HUDDLE = { kids: [5, 2, 1, 0], mom: 3 };

/** Episode `ep`'s story: who goes where and when, and what gets said. */
export function plan(ep) {
  if (plans.has(ep)) return plans.get(ep);
  const r = (k) => noise(ep * 13 + k, 7);
  const night = isNight(ep), fromNight = isNight(ep - 1);
  const mom = { tr: new Track(-2, 1), w: 2, mom: true };
  const kids = [0, 1, 2, 3].map((i) => ({ tr: new Track(-3 - i, 1), w: 1 }));
  const all = [mom, ...kids];
  const says = [];
  const say = (t0, dur, col, text) => says.push({ t0, t1: t0 + dur, col: Math.max(0, Math.min(16 - text.length, col)), text });
  const now = () => Math.max(...all.map((m) => m.tr.t));
  const sync = (t = now()) => { all.forEach((m) => m.tr.until(t)); return t; };
  const sorted = () => [...all].sort((a, b) => a.tr.x - b.tr.x);
  const result = { mom, kids, says, act: null, night };
  plans.set(ep, result);

  /**
   * Everyone to new cells at once, in order. Ducks moving left set off
   * leftmost first and ducks moving right rightmost first, all at one pace,
   * so nobody ever steps into a cell that is not yet empty.
   */
  function move(targets, per = PER, step = 0.15) {
    sync();
    const list = [...targets].filter(([m, x]) => x !== m.tr.x);
    const lefts = list.filter(([m, x]) => x < m.tr.x).sort((a, b) => a[0].tr.x - b[0].tr.x);
    const rights = list.filter(([m, x]) => x > m.tr.x).sort((a, b) => b[0].tr.x - a[0].tr.x);
    for (const group of [lefts, rights]) group.forEach(([m, x], i) => m.tr.hold(i * step).go(x, per));
    return sync();
  }
  /** Close up round the mother at cell `at`, in the order they are in. */
  const packed = (at, who = all) => {
    const order = sorted().filter((m) => who.includes(m)), i = order.indexOf(mom), map = new Map([[mom, at]]);
    let x = at;
    for (let j = i - 1; j >= 0; j--) map.set(order[j], --x);
    x = at + 1;
    for (let j = i + 1; j < order.length; j++) map.set(order[j], ++x);
    return map;
  };

  if (night) {
    if (!fromNight) {
      // Back from the pond for the night: in from the left, and settle.
      kids[0].tr.x = -2; mom.tr.x = -4; kids.slice(1).forEach((k, i) => { k.tr.x = -5 - i; });
      sync(2);
      move(new Map([[mom, HUDDLE.mom], ...kids.map((k, i) => [k, HUDDLE.kids[i]])]));
      kids[0].tr.turn(-1);
      sync(now() + 1.5);
    } else {
      mom.tr.x = HUDDLE.mom; kids.forEach((k, i) => { k.tr.x = HUDDLE.kids[i]; });
      mom.tr.face = 1; kids[0].tr.face = -1;
    }
    // Asleep the rest of the time, but for one duckling who wakes for a look.
    const t = sync(), w = kids[Math.floor(r(1) * 4)], tw = t + 10 + r(2) * (P - t - 30);
    for (const m of all) if (m !== w) m.tr.until(P, 'sleep');
    w.tr.until(tw, 'sleep').hold(1.2, 'stand').hold(1.6, 'look').hold(0.8, 'stand').until(P, 'sleep');
    say(tw + 1.2, 1.6, w.tr.x - 1, 'pip');
    return result;
  }
  if (fromNight) {
    // Morning: they wake where they slept, and head for the water.
    mom.tr.x = HUDDLE.mom; kids.forEach((k, i) => { k.tr.x = HUDDLE.kids[i]; });
    kids[0].tr.face = -1;
    all.forEach((m) => m.tr.hold(2.5, 'sleep'));
    kids.forEach((k, i) => k.tr.hold(0.4 * i, 'sleep').until(6, 'stand'));
    mom.tr.until(4.5, 'sleep').hold(1.5, 'stand');
    say(3, 2.5, 0, 'pip pip');
    move(new Map([[kids[3], 7], [kids[2], 8], [kids[1], 9], [mom, 10], [kids[0], 12]]));
  } else {
    // Waddle in along the bank and out onto the water, in a line.
    sync(2);
    const dawdle = r(3) < 0.6;
    mom.tr.go(12);
    kids.forEach((k, i) => {
      k.tr.hold(0.15 * (i + 1));
      if (i < 3 || !dawdle) k.tr.go(11 - i);
      else k.tr.go(1 + Math.floor(r(4) * 3)).hold(4.5, 'peck').hold(1.2, 'look');
    });
    if (dawdle) {
      // The last one stops to peck at something, looks up, finds itself
      // alone, and scurries after them.
      const late = kids[3].tr;
      late.until(Math.max(late.t, kids[2].tr.t));
      say(late.t - 1.2, 1.6, late.x - 1, 'pip!');
      late.go(8, 0.3);
    }
  }
  sync(now() + 2);

  // Out on the water: they drift apart and bob about.
  const spread = () => {
    const order = sorted(), free = 16 - WATER - order.reduce((s, m) => s + m.w, 0);
    const gaps = Array(order.length + 1).fill(0);
    for (let g = 0; g < free; g++) gaps[Math.floor(r(10 + g + 5 * now()) * gaps.length)]++;
    let x = WATER + gaps[0];
    return new Map(order.map((m, i) => { const at = x; x += m.w + gaps[i + 1]; return [m, at]; }));
  };
  move(spread(), 1.0, 0.4);
  sync(now() + 3);

  // One dives, bottoms up, twice.
  const diver = kids[Math.floor(r(5) * 4)];
  diver.tr.hold(2.5, 'dive').hold(1.5).hold(2, 'dive');
  sync(now() + 2);
  move(spread(), 1.0, 0.4);
  sync(now() + 2);

  // Sometimes the one at the back wanders off up the bank.
  const lost = r(6) < 0.55 && sorted()[0] !== mom ? sorted()[0] : null;
  if (lost) {
    lost.tr.go(2 + Math.floor(r(7) * 2), 0.7).hold(3, 'look');
    say(lost.tr.t - 2.5, 2, lost.tr.x - 1, 'pip?');
  }
  // Mother turns to the ducklings and calls them in.
  const left = kids.filter((k) => k.tr.x < mom.tr.x && k !== lost).length;
  mom.tr.turn(left >= 2 || lost ? -1 : 1);
  const front = mom.tr.face < 0 ? mom.tr.x : mom.tr.x + 1;
  if (lost) mom.tr.until(lost.tr.t - 1.5);
  const tq = mom.tr.t + 0.5;
  mom.tr.hold(0.5).hold(0.5, 'quack').hold(0.3).hold(0.6, 'quack');
  say(tq, 1.6, mom.tr.face < 0 ? front - 6 : front + 1, 'QUACK!');
  move(packed(mom.tr.x, all.filter((m) => m !== lost)), 0.8, 0.2);
  if (lost) {
    // The stray hears her, and hurries back to the end of the line.
    const slot = Math.min(...kids.filter((k) => k !== lost).map((k) => k.tr.x), mom.tr.x) - 1;
    lost.tr.hold(0.3, 'stand');
    say(now() + 0.2, 1.4, lost.tr.x - 1, 'pip!');
    lost.tr.go(slot, 0.35);
    mom.tr.until(lost.tr.t - 1.2).hold(0.6, 'quack');
  }
  sync(now() + 3);

  // Home: back to the bank, ducklings first and mother last, and away.
  const shiftBy = Math.max(...all.map((m) => m.tr.x)) + 4;
  move(new Map(all.map((m) => [m, m.tr.x - shiftBy])), PER, 0.15);

  // The empty pond: a frog or a fish, now and then.
  const t = now() + 4;
  const kind = r(8) < 0.45 ? 'frog' : r(8) < 0.8 ? 'fish' : null;
  if (kind && t + 20 < P) result.act = { kind, t0: t, col: 9 + Math.floor(r(9) * 3) };
  result.length = now();
  return result;
}
// ------------------------------------------------------------------ drawing

/** The mother; `x` is the left of her two cells, whichever way she faces. */
function drawMom(cv, s) {
  const { x, face, pose, k } = s;
  const X = x * 5;
  const front = face > 0 ? x + 1 : x, rear = face > 0 ? x : x + 1;
  const wet = (c) => c >= WATER;
  if (pose === 'sleep') { cv.stamp(MOM_SLEEP, X, 0, { flip: face < 0 }); return; }
  const top = pose === 'quack' ? MOM_QUACK : MOM.slice(0, 8);
  const art = [...top, ...MOM.slice(8), MOM_LEGS[s.still ? 0 : k]];
  const pic = face < 0 ? mirror(art) : art;
  // Each half floats or stands on its own cell: afloat it sits a dot lower
  // and the waterline hides the legs. The head goes with the front half.
  for (const c of [front, rear]) {
    const dy = wet(c) ? 1 : 0;
    pic.forEach((l, r) => [...l].forEach((ch, i) => {
      const xx = X + i, yy = r + dy, mine = Math.floor(xx / 5) === c;
      if (r < 8 ? c !== front : !mine) return;
      if (wet(c) && yy > 13) return;
      if (ch === '#') cv.dot(xx, yy, true); else if (ch === 'o') cv.dot(xx, yy, false);
    }));
  }
}

function drawKid(cv, s, bob) {
  const { x, face, pose, k } = s;
  const wet = x >= WATER;
  let art;
  if (pose === 'peck') art = KID.peck[k];
  else if (pose === 'dive') art = KID.dive[Math.floor(s.u / 0.4) % 2];
  else if (pose === 'sleep') art = KID.sleep[bob];
  else art = KID.walk[wet || s.still ? 0 : k];
  const f = pose === 'look' ? (Math.floor(s.u / 0.8) % 2 ? -face : face) : face;
  cv.stamp(art, x * 5, pose === 'dive' ? 8 : wet ? 9 : 8, { flip: f < 0, clip: wet ? 13 : 15 });
}

/** The frog's visit: hops along the bank, croaks, and jumps in. */
function frogAt(v) {
  const steps = [];
  for (const c of [-2, -1, 0, 1, 2, 3]) steps.push([0.4, c, 'leap'], [0.6, c, 'sit']);
  steps.push([1.6, 3, 'sit'], [2.4, 3, 'croak'], [1.6, 3, 'sit'], [0.4, 4, 'leap'], [0.8, 4, 'sit'],
    [0.4, 6, 'leap'], [1.0, 6, 'gone']);
  let t = 0;
  for (const [d, x, pose] of steps) {
    if (v < t + d) {
      if (pose === 'croak') return { x, pose: Math.floor((v - t) / 0.4) % 2 ? 'sit' : 'croak', says: 'ribbit' };
      return { x, pose, splash: pose === 'gone' ? x + 1 : null };
    }
    t += d;
  }
  return null;
}

/** The fish's leap: up out of the water, over, and back in. */
function fishAt(v, col) {
  const steps = [[0, 1, 'rise'], [1, 0, 'arc'], [3, 1, 'dive']];
  const k = Math.floor(v / 0.5);
  if (k < 0) return null;
  if (k < steps.length) { const [dx, row, pose] = steps[k]; return { x: col + dx, row, pose }; }
  if (v < 3 * 0.5 + 0.8) return { x: col + 3, row: 1, pose: 'gone', splash: col + 3 };
  return null;
}

const SKY = [[1, 0x2e], [4, 0xa5], [6, 0x2e], [9, 0x2a], [14, 0x2e], [10, 0x2e]];
const MOON_COL = 12;

export default {
  name: 'Ducks',
  blurb: 'A mother duck and her ducklings: in along the bank, onto the pond, one dawdles, one dives, one strays; at night they sleep in a huddle.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields }) {
    const T = fields.h * 3600 + fields.m * 60 + fields.s + fields.ms / 1000;
    const ep = Math.floor(T / P), u = T - ep * P;
    const cv = new Canvas(lcd);
    const { mom, kids, says, act, night } = plan(ep);
    const wave = ripple(Math.floor(T / (night ? 0.8 : 0.4)) % 5);
    for (let c = 0; c < 16; c++) cv.put(c, 1, c < WATER ? 0x5f : wave);

    if (night) {
      // Stars that twinkle on their own slow clocks, and a crescent moon
      // with its reflection broken up on the ripples.
      SKY.forEach(([c, code], i) => cv.put(c, 0, noise(Math.floor(T / 2.3) + i * 7, 9) < 0.2 ? 0x20 : code));
      cv.put(MOON_COL, 0, MOON);
      cv.put(MOON_COL, 1, wave.map((b, r) => b | (r === 7 ? bits(shift('.##..', Math.floor(T / 0.8) % 2)) : 0)));
    }

    const bob = Math.floor(T / 1.2) % 2;
    const ms = mom.tr.at(u);
    drawMom(cv, ms);
    kids.forEach((kd) => drawKid(cv, kd.tr.at(u), bob));
    if (ms.pose === 'sleep') {
      // z, z, Z, drifting up off her back.
      const z = Math.floor(T / 1.1) % 4, c = ms.x + 1;
      if (z === 1) cv.put(c, 0, 0x7a);
      if (z === 2) cv.put(c + 1, 0, 0x7a);
      if (z === 3) cv.put(c + 1, 0, 0x5a);
    }

    // A splash where anyone has just gone in.
    const splash = (c) => { cv.put(c - 1, 0, 0x60); cv.put(c, 0, 0xa5); cv.put(c + 1, 0, 0x27); };
    for (const m of [mom, ...kids]) {
      const front = (s) => s.x + (m === mom && s.face > 0 ? 1 : 0);
      if (front(m.tr.at(u - 0.7)) < WATER && front(m.tr.at(u)) >= WATER) splash(WATER);
    }

    if (act && u >= act.t0) {
      const v = u - act.t0;
      const a = act.kind === 'frog' ? frogAt(v) : fishAt(v, act.col);
      if (a?.splash) splash(a.splash);
      if (a && a.pose !== 'gone') {
        if (act.kind === 'frog') cv.stamp(FROG[a.pose], a.x * 5, a.pose === 'leap' ? 5 : 8);
        else cv.stamp(FISH[a.pose], a.x * 5, a.row ? 9 : 2, { clip: a.row ? 13 : 15 });
        if (a.says) cv.text(a.x - 2, 0, a.says);
      }
    }
    for (const s of says) if (u >= s.t0 && u < s.t1) cv.text(s.col, 0, s.text);
    lastFrame.overflow = cv.draw().overflow;
  },
};
