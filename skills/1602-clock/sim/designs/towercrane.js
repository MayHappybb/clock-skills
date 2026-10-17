// Topping Out — a tower crane builds the time.
//
// The jib of a flat-top tower crane runs the whole top row and off the
// right edge, where the yard is. The time stands on the ground as four
// precast concrete numerals. Each minute the hook, already lowered onto the
// last digit at :59, lifts every numeral that changed and carries it off to
// the yard, last digit first, then brings the new ones in, first digit
// first. A numeral on the hook rides a dot higher and drops into place. The
// load swings on a real damped pendulum, driven by the trolley's
// acceleration and by gusts. A banksman in a hard hat signals each lift and
// gives a thumbs-up, then walks off to eat his lunch on the girder pile and
// walks back before the next turn. At night he falls asleep there, with z's
// rising under the jib. The operator in the cab at the mast head looks
// toward the hook between jobs.
//
// On the hour a fir tree comes in from the yard and is set on the roof of
// the new hour (topping out), and the crane slews a full lap of honour: the
// jib shortens into the mast as it swings toward you, and the counterweight
// comes round over the banksman, who ducks.
//
// Never a wrong time: the old numerals all leave before any new one
// arrives, and a swinging numeral is held clear of cells that already have
// a numeral in them. Checked on every 0.1 s frame of a whole day.
//
// Budget: one shared jib tile, up to four numerals, the banksman, and the
// trolley/hook/load cells. The cab and mast are ROM (0xdb, 'X'); the cab
// gets its operator only when a slot is free. If a frame would still need
// more than eight, the hook snaps to a cell column and drops detail
// (compose(..., simple)).

import { clockFields } from '../js/kit.js';

const FPS = 10;

// ------------------------------------------------------------------ layout
//
//   col   0 1   2      3 4   5     6 7   8          9   10 11 12 13 14  15
//   top   jib   cab    jib ..................................... jib (yard off the right edge)
//   bot         mast         pile        banksman       H  H  :  M  M   lane
//
const MAST = 2, PILE = 5, BANK = 8, COLON = 12;
const SLOT = [10, 11, 13, 14];
const SLOT_X = (i) => SLOT[i] * 6 + 2;      // cable x over a slot's numeral
const IDLE_X = 7 * 6 + 2;                    // where the hook is parked between jobs
const MAST_X = MAST * 6 + 2;
const YARD = 99;                             // trolley x off the right edge
const TROLLEY_Y = 3;                         // trolley under the jib's bottom chord
const CJ = 5;                                // counter-jib length in cells, mostly off the left edge

// ------------------------------------------------------------------ glyphs

const bits = (rows) => rows.map((r) => [...r].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, bits(v)]));

// Prefab numerals: concrete blocks, 5x7, two-dot walls. They stand on dot
// rows 1-7 of the bottom row; hanging off the hook a numeral rides a dot
// higher, so it visibly drops into place.
const NUM = map({
  0: ['#####', '##.##', '##.##', '##.##', '##.##', '##.##', '#####'],
  1: ['.##..', '###..', '.##..', '.##..', '.##..', '.##..', '####.'],
  2: ['#####', '...##', '...##', '#####', '##...', '##...', '#####'],
  3: ['#####', '...##', '...##', '.####', '...##', '...##', '#####'],
  4: ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '#####', '...##', '...##', '#####'],
  6: ['#####', '##...', '##...', '#####', '##.##', '##.##', '#####'],
  7: ['#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['#####', '##.##', '##.##', '.###.', '##.##', '##.##', '#####'],
  9: ['#####', '##.##', '##.##', '#####', '...##', '...##', '#####'],
});

// The jib: a three-row truss, one tile shared by every jib cell.
const JIB = bits(['#####', '.#.#.', '#####', '.....', '.....', '.....', '.....', '.....']);

// The operator in the cab at the top of the mast (ROM 0xdb if no slot).
const CAB = map({
  r: ['.....', '#####', '#...#', '#..##', '#...#', '#####', '#####', '.....'],
  l: ['.....', '#####', '#...#', '##..#', '#...#', '#####', '#####', '.....'],
  up: ['#....', '##...', '#####', '#...#', '#.#.#', '#...#', '#####', '.....'],
});

// The banksman on the ground, in a hard hat.
const MAN = map({
  stand: ['.###.', '#####', '.#.#.', '..#..', '.###.', '#.#.#', '.#.#.', '.#.#.'],
  hoist: ['.###.', '#####', '.#.##', '..#.#', '.###.', '#.#..', '.#.#.', '.#.#.'],
  hoist2: ['.###.', '####.', '.#.##', '..#.#', '.###.', '#.#..', '.#.#.', '.#.#.'],
  point: ['.###.', '#####', '.#.#.', '..#..', '.####', '#.#..', '.#.#.', '.#.#.'],
  lower: ['.###.', '#####', '.#.#.', '..#..', '.####', '#.#.#', '.#.#.', '.#.#.'],
  thumb: ['.###.', '#####', '.#.#.', '..#.#', '.####', '#.#..', '.#.#.', '.#.#.'],
  cheer: ['.###.', '#####', '.....', '#.#.#', '#####', '..#..', '.#.#.', '#...#'],
  cheer2: ['.....', '.###.', '#####', '#.#.#', '#.#.#', '.###.', '..#..', '.#.#.'],
  look: ['.###.', '#####', '..#.#', '..#..', '.###.', '#.#.#', '.#.#.', '.#.#.'],
  walk: ['.###.', '#####', '.#.#.', '..#..', '.###.', '#.#.#', '.#.#.', '#...#'],
  walk2: ['.###.', '#####', '.#.#.', '..#..', '.###.', '.###.', '..#..', '.##..'],
  sit: ['.....', '.##..', '####.', '.#...', '.###.', '.#...', '#####', '..#..'],
  eat: ['.....', '.##..', '####.', '.##..', '.#.#.', '.#...', '#####', '..#..'],
  chew: ['.....', '.##..', '####.', '.#...', '.###.', '.#...', '#####', '...#.'],
  wave: ['...#.', '.##.#', '####.', '.#.#.', '.##..', '.#...', '#####', '..#..'],
  sleep: ['.....', '.....', '.....', '.....', '.##..', '####.', '#####', '..#..'],
  duck: ['.....', '.....', '.....', '.###.', '#####', '.#.#.', '#####', '##.##'],
});

// The topping-out tree.
const TREE = bits(['..#..', '.###.', '#####', '..#..']);

// ------------------------------------------------------------------ glass

// The 16x2 grid: every cell is a ROM code or 8 row bytes, with a priority
// that decides who keeps a CGRAM slot if a frame asks for more than eight.
class Glass {
  constructor(lcd) {
    this.lcd = lcd;
    this.cells = Array.from({ length: 32 }, () => ({ rom: 0x20, pri: 0 }));
  }
  rom(col, row, code) { this.cells[row * 16 + col] = { rom: code, pri: 0 }; }
  tile(col, row, b, pri, rom) {
    this.cells[row * 16 + col] = { bits: b.slice(), pri, base: rom === undefined ? { bits: b.slice() } : { rom } };
  }
  // Ink one dot at glass x (6 per cell, the sixth is the gap), row y 0-15.
  dot(x, y, pri) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= 96 || y < 0 || y > 15) return;
    const col = Math.floor(x / 6), dx = x % 6;
    if (dx === 5) return;
    const c = this.cells[(y >> 3) * 16 + col];
    if (!c.bits) {
      const g = this.lcd.glyph(c.rom);
      c.base = { rom: c.rom };
      c.bits = Array.from({ length: 8 }, (_, r) => g[r] & 0x1f);
      delete c.rom;
      c.pri = pri;
    } else c.pri = Math.max(c.pri, pri);
    c.bits[y & 7] |= 0x10 >> dx;
  }
  blit(rowsB, x0, y0, pri, w = 5) {
    rowsB.forEach((b, r) => {
      for (let i = 0; i < w; i++) if ((b >> (w - 1 - i)) & 1) this.dot(x0 + i, y0 + r, pri);
    });
  }
  // Slots needed by everything that has no ROM stand-in.
  need() {
    return new Set(this.cells.filter((c) => c.bits && c.base?.rom === undefined || (c.bits && c.pri > 2)).map((c) => c.bits.join(','))).size;
  }
  draw() {
    const key = (b) => b.join(',');
    const want = new Map();
    for (const c of this.cells) if (c.bits) {
      const k = key(c.bits);
      want.set(k, Math.max(want.get(k) ?? -1, c.pri));
    }
    const order = [...want.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    const slot = new Map();
    order.slice(0, 8).forEach((k, i) => slot.set(k, i));
    this.dropped = Math.max(-1, ...order.slice(8).map((k) => want.get(k)));
    for (const [k, i] of slot) this.lcd.defineChar(i, k.split(',').map(Number));
    for (let row = 0; row < 2; row++) {
      this.lcd.setCursor(0, row);
      for (let col = 0; col < 16; col++) {
        const c = this.cells[row * 16 + col];
        let code = 0x20;
        if (!c.bits) code = c.rom;
        else if (slot.has(key(c.bits))) code = slot.get(key(c.bits));
        else if (c.base?.rom !== undefined) code = c.base.rom;
        else if (c.base?.bits && slot.has(key(c.base.bits))) code = slot.get(key(c.base.bits));
        this.lcd.data(code);
      }
    }
  }
}

// ------------------------------------------------------------------ script
//
// Each minute is a script, worked out from the old time and the new one:
// segments move the trolley (x) or the hook (yb, one dot row per ROW_T),
// events change what hangs on the hook, what stands in the slots and where
// the banksman is. Every changed numeral is lifted out and taken off the
// right edge, last digit first, before any new one comes in, so the glass
// only ever shows the old time with gaps or the new time with gaps.

const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
const ROW_T = 0.17;
const travelT = (dx) => 0.6 + Math.abs(dx) / 32;
const HOOK_UP = 4, HOOK_LOW = 7, TREE_YB = 3;
const ANT = 54.6;                    // anticipation: out over the last digit, hook down onto it
const SPIN_T = 8;

function buildScript(oldD, newD, hour, night) {
  const segs = [], events = [];
  let t = 0, x = SLOT_X(3), yb = HOOK_LOW;
  const changed = [0, 1, 2, 3].filter((i) => oldD[i] !== newD[i]);
  const mv = (to, extra = 0) => { const d = travelT(to - x) + extra; segs.push({ k: 'x', t0: t, t1: t + d, a: x, b: to }); t += d; x = to; };
  const ho = (to) => { const d = Math.abs(to - yb) * ROW_T; segs.push({ k: 'y', t0: t, t1: t + d, a: yb, b: to }); t += d; yb = to; };
  const setY = (v) => { segs.push({ k: 'y', t0: t, t1: t, a: v, b: v }); yb = v; };
  const wait = (d) => { t += d; };
  const at = (time) => { t = Math.max(t, time); };
  const ev = (e) => events.push({ t, ...e });
  const walk = (from, to, t0) => {
    const dir = Math.sign(to - from);
    let k = 0;
    for (let c = from + dir; dir && c !== to + dir; c += dir, k++) {
      events.push({ t: t0 + k * 0.5, man: c, tag: k % 2 ? 'walk2' : 'walk' });
    }
    events.push({ t: t0 + k * 0.5, tag: 'idle' });
    return t0 + k * 0.5;
  };

  ev({ man: BANK, pile: true, pin: true, tag: 'ready' });
  [...changed].sort((a, b) => b - a).forEach((i, n) => {
    if (n > 0) { ev({ tag: 'point' }); mv(SLOT_X(i)); ev({ tag: 'lower', calm: true }); ho(HOOK_LOW); }
    ev({ load: { d: oldD[i], lift: false }, slot: [i, null], pin: true, calm: false, tag: 'hoist' });
    wait(0.45);
    ev({ load: { d: oldD[i], lift: true }, pin: false });
    wait(0.2);
    ev({ tag: 'watch' });
    mv(YARD);
    ev({ load: null });
  });
  [...changed].sort((a, b) => a - b).forEach((i, n) => {
    ev({ load: { d: newD[i], lift: true }, tag: 'point' });
    wait(0.15);
    mv(SLOT_X(i), 0.3);
    ev({ tag: 'lower', calm: true });
    wait(0.7);
    ev({ load: { d: newD[i], lift: false }, pin: true, calm: false });
    wait(0.3);
    ev({ load: null, slot: [i, newD[i]], tag: 'thumb' });
    wait(0.15);
    if (n < changed.length - 1) { ev({ pin: false }); mv(YARD); }
  });
  ev({ pin: false });
  ho(HOOK_UP);
  const end = t;
  let work1 = end;

  if (hour) {
    // Topping out: a fir tree comes in from the yard and is set on the roof
    // of the new hour; then the crane slews a full lap of honour.
    mv(YARD);
    ho(TREE_YB);
    ev({ load: { tree: true }, tag: 'point' });
    wait(0.2);
    mv(SLOT_X(1), 0.3);
    ev({ tag: 'lower', calm: true });
    wait(0.9);
    ev({ load: null, tree: true, tag: 'cheer', calm: false });
    wait(0.4);
    mv(IDLE_X, 0.4);
    if (t + SPIN_T < 44) {
      segs.push({ k: 'spin', t0: t, t1: t + SPIN_T });
      wait(SPIN_T + 0.3);
    }
    ev({ tag: 'thumb' });
    wait(1);
    ev({ tag: 'idle' });
    // The tree goes back to the yard before the next turn.
    at(45);
    mv(SLOT_X(1));
    ev({ calm: true });
    wait(0.5);
    ev({ load: { tree: true }, tree: false, calm: false });
    wait(0.3);
    mv(YARD);
    ev({ load: null });
    ho(HOOK_UP);
  }
  // Rest: the hook is parked over the open ground; the banksman goes and
  // has his lunch on the girder pile, and walks back before the next turn.
  if (!hour) { mv(IDLE_X, 0.6); ho(HOOK_UP); work1 = t + 1.5; }
  const lunch = walk(BANK, PILE, Math.max(end + 1.2, hour ? 46 : 0));
  events.push({ t: lunch, tag: 'lunch', pile: false });
  const back = ANT - 3.2;
  events.push({ t: back - 0.01, pile: true });
  walk(PILE, BANK, back);
  at(ANT);
  ev({ tag: 'point', pin: false });
  if (yb !== HOOK_UP) ho(HOOK_UP);
  mv(SLOT_X(3));
  ev({ tag: 'lower', calm: true });
  ho(HOOK_LOW);
  ev({ tag: 'ready', pin: true, calm: false });
  return { segs, events, end, work1, changed, hour, night };
}

const ease = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);

// The whole scene at second `s` of the minute.
function sceneAt(sc, s) {
  let x = SLOT_X(3), yb = HOOK_LOW, spin = null;
  for (const g of sc.segs) {
    if (g.t0 > s) break;
    const u = g.t1 > g.t0 ? Math.min(1, (s - g.t0) / (g.t1 - g.t0)) : 1;
    if (g.k === 'x') x = g.a + (g.b - g.a) * ease(u);
    else if (g.k === 'y') {
      const n = Math.abs(g.b - g.a);
      yb = g.a + Math.sign(g.b - g.a) * Math.min(n, Math.floor((s - g.t0) / ROW_T + 1e-9));
      if (u >= 1) yb = g.b;
    } else if (g.k === 'spin' && s < g.t1) spin = ease(u) * 2 * Math.PI;
  }
  const st = { night: sc.night, x, yb, spin, load: null, tag: 'idle', tagT: 0, pin: true, calm: false, man: BANK, pile: true, tree: false };
  for (const e of sc.events) {
    if (e.t > s) break;
    for (const k of ['load', 'pin', 'calm', 'man', 'pile', 'tree']) if (k in e) st[k] = e[k];
    if (e.tag) { st.tag = e.tag; st.tagT = e.t; }
  }
  return st;
}

// Pendulum: the hook's offset from under the trolley, driven by the
// trolley's acceleration and gusts of wind, damped (hard, while the
// banksman steadies it), pinned while it rests on something. Integrated
// over the whole minute once, and cached.
const cache = new Map();
function swingTrack(key, sc, seed) {
  if (cache.has(key)) return cache.get(key);
  const dt = 0.02, N = Math.ceil(60.2 / dt);
  const d = new Float32Array(N), xs = new Float32Array(N), st = [];
  for (let i = 0; i < N; i++) {
    const c = sceneAt(sc, i * dt);
    xs[i] = c.spin == null ? c.x : MAST_X + (c.x - MAST_X) * Math.cos(c.spin);
    st.push(c);
  }
  let p = 0, v = 0;
  const w = 2 * Math.PI / 1.8;
  for (let i = 0; i < N; i++) {
    const s = i * dt, c = st[i];
    const a = i > 0 && i < N - 1 ? (xs[i + 1] - 2 * xs[i] + xs[i - 1]) / (dt * dt) : 0;
    const gust = 0.5 + 0.5 * Math.sin(s * 0.31 + seed);
    const wind = 2.6 * gust * Math.sin(w * s + seed);
    if (c.pin) { p = 0; v = 0; } else {
      const zeta = c.calm ? 0.9 : 0.06;
      const acc = -w * w * p - 2 * zeta * w * v - a * 0.8 + (c.calm ? 0 : wind);
      v += acc * dt; p += v * dt;
    }
    d[i] = p;
  }
  if (cache.size > 32) cache.clear();
  const r = { d, dt };
  cache.set(key, r);
  return r;
}

// ------------------------------------------------------------------ drawing

function compose(lcd, F, simple) {
  const { c, standing, sway, s, sc } = F;
  const g = new Glass(lcd);

  // Jib and counter-jib, foreshortened while the crane slews.
  const cosT = c.spin == null ? 1 : Math.cos(c.spin);
  const jibR = Math.round(20 * cosT);
  const cjR = Math.round(CJ * cosT);
  for (let col = 0; col < 16; col++) {
    const a = col - MAST;
    if (a === 0) continue;
    const onJib = jibR >= 0 ? a > 0 && a <= jibR : a < 0 && -a <= -jibR;
    const onCj = cjR >= 0 ? a < 0 && -a < cjR : a > 0 && a < -cjR;
    if (cjR !== 0 && a === -cjR) g.rom(col, 0, 0xff);
    else if (onJib || onCj) g.tile(col, 0, JIB, 9);
  }
  const tx = c.spin == null ? c.x : MAST_X + (c.x - MAST_X) * cosT;
  const cab = c.tag === 'cheer' || c.tag === 'thumb' ? 'up' : tx >= MAST_X ? 'r' : 'l';
  // The operator shows in his cab between jobs; while the crane works, the
  // cab is the plain ROM box and its slot goes to the load.
  if (s >= sc.work1 && s < ANT && c.spin == null && !(sc.hour && s >= 44.8)) g.tile(MAST, 0, CAB[cab], 2, 0xdb);
  else g.rom(MAST, 0, 0xdb);
  g.rom(MAST, 1, 0x58);
  g.rom(COLON, 1, 0x3a);
  if (c.pile) g.rom(PILE, 1, 0x5f);
  if (c.night && c.tag === 'lunch') {
    // A z rising over the sleeping banksman, under the jib.
    const k = Math.floor(s / 0.8) % 4;
    if (k < 3) g.blit(bits(['###', '.#.', '###']), PILE * 6 + 1 + (k === 1 ? 1 : 0), 5 - k, 3, 3);
  }

  standing.forEach((d, i) => { if (d != null) g.tile(SLOT[i], 1, [0, ...NUM[d]], 10); });
  if (c.tree) g.blit(TREE, SLOT_X(1) - 2, TREE_YB + 1, 5);

  // Trolley, cable, hook and load.
  const sw = c.load ? sway : Math.max(-2, Math.min(2, sway));
  let tdx = Math.round(tx), hx = Math.round(tx + sw);
  if (c.load?.d != null) {
    // A swinging numeral never sways into a cell that is already built on
    // (it would read as a different digit): the cable takes the slack.
    const busy = [COLON, ...SLOT.filter((_, i) => standing[i] != null)];
    const tcol = Math.floor(tdx / 6);
    const left = Math.max(-1, ...busy.filter((k) => k < tcol)), right = Math.min(99, ...busy.filter((k) => k > tcol));
    hx = Math.max((left + 1) * 6 + 2, Math.min((right - 1) * 6 + 2, hx));
  }
  if (simple) {
    const snap = (v) => Math.floor(v / 6) * 6 + 2;
    tdx = snap(tdx); hx = snap(hx);
  }
  const yb = c.yb;
  const wide = simple ? [0] : [-1, 0, 1];
  for (const i of wide) g.dot(tdx + i, TROLLEY_Y, 7);
  for (let y = TROLLEY_Y + 1; y < yb; y++) {
    const u = (y - TROLLEY_Y) / (yb - TROLLEY_Y);
    g.dot(Math.round(tdx + (hx - tdx) * u), y, 7);
  }
  for (const i of wide) g.dot(hx + i, yb, 8);
  if (c.load?.d != null) g.blit(NUM[c.load.d], hx - 2, c.load.lift ? 8 : 9, 8);
  else if (c.load?.tree) g.blit(TREE, hx - 2, yb + 1, 8);
  else if (!c.pin) {
    g.dot(hx, yb + 1, 7); g.dot(hx - 1, yb + 2, 7); g.dot(hx + 1, yb + 2, 7);
    if (!simple) { g.dot(hx - 1, yb + 3, 7); g.dot(hx, yb + 3, 7); }
  }

  // The banksman ducks when the counterweight comes round over his head.
  if (c.man != null) {
    const duck = cjR < 0 && Math.abs(MAST - cjR - c.man) <= 1;
    g.tile(c.man, 1, MAN[duck ? 'duck' : manPose(c, s)], 6);
  }
  return g;
}

function manPose(c, s) {
  const beat = Math.floor(s * 2.5) % 2;
  switch (c.tag) {
    case 'hoist': return beat ? 'hoist' : 'hoist2';
    case 'point': case 'watch': return 'point';
    case 'lower': case 'ready': return 'lower';
    case 'thumb': return 'thumb';
    case 'walk': case 'walk2': return c.tag;
    case 'cheer': return Math.floor(s * 2) % 2 ? 'cheer' : 'cheer2';
    case 'lunch': {
      if (c.night) return 'sleep';
      const k = Math.floor((s - c.tagT) / 1.2);
      return ['sit', 'eat', 'chew', 'eat', 'chew', 'sit', 'wave', 'wave', 'sit', 'eat', 'chew', 'sit', 'sit', 'eat', 'chew', 'eat', 'chew', 'sit'][k % 18];
    }
    default: return ['stand', 'look', 'stand', 'stand', 'look', 'stand'][Math.floor(s / 2.5) % 6];
  }
}

// ------------------------------------------------------------------ design

export default {
  name: 'Topping Out',
  blurb: 'A tower crane swaps the precast numerals that changed each minute, swinging on a real pendulum; on the hour it tops out with a fir tree and slews a lap of honour.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields, date }) {
    const s = fields.s + fields.ms / 1000;
    const minuteStart = date.getTime() - fields.s * 1000 - fields.ms;
    const newD = digitsOf(fields);
    const oldD = digitsOf(clockFields(new Date(minuteStart - 60000)));
    const night = fields.h >= 22 || fields.h < 6;
    const sc = buildScript(oldD, newD, fields.m === 0, night);
    const seed = (Math.floor(minuteStart / 60000) % 997) * 0.37;
    const c = sceneAt(sc, s);
    const tr = swingTrack(minuteStart, sc, seed);
    const sway = Math.max(-3, Math.min(3, tr.d[Math.min(tr.d.length - 1, Math.round(s / tr.dt))]));

    const standing = [0, 1, 2, 3].map((i) => (sc.changed.includes(i) ? oldD[i] : newD[i]));
    for (const e of sc.events) {
      if (e.t > s) break;
      if (e.slot) standing[e.slot[0]] = e.slot[1];
    }

    const F = { c, standing, sway, s, sc };
    let g = compose(lcd, F, false), simple = false;
    if (g.need() > 8) { g = compose(lcd, F, true); simple = true; }
    g.draw();
    this.stats = { simple, want: g.need(), dropped: g.dropped, standing, oldD, newD, end: sc.end };
  },
};
