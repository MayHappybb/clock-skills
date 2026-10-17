// Pigeons — the time is breadcrumbs, and the pigeons eat it.
//
// The hour is two crumb piles on a rooftop ledge (top row, over a ROM
// cornice, '=' rails, with a lit window or two at night); the minutes are two piles on the pavement below.
// Each pile is a bold numeral of crumbs with a little spill at its foot.
// Somebody off the right edge feeds the birds.
//
// All minute the street pigeons strut (head-bob gait: head forward, then the
// body catches up, a cell at a time), coo with their chests puffed, and peck
// up the stray crumbs (ROM '.') that bounced off the last handful. Up on the
// ledge a lookout fidgets and peers down, and an old bird sleeps by the hour.
//
// Near the end of the minute the two street pigeons go back to their posts
// either side of the minute piles and eat the digit that is about to change,
// peck by peck, crumbs vanishing in a scatter. Just as the minute turns a
// handful of crumbs is lobbed in from the right, tumbles across the sky and
// lands as the new numeral (three settling steps), with a few strays bouncing
// off. The old digit is only ever eaten, so the glass never shows a wrong
// time: a digit is the old one, half eaten, gone, or the new one landing.
//
// The hour: three strangers fly in, the street birds and the lookout clap up
// to join them, and the flock wheels round the street in a loop. Then it
// drops on every pile that is about to change and devours them in a frenzy,
// lifts off, and the whole bag is thrown: one long lob up onto the ledge for
// the hour, one onto the pavement. The sleeper slept through it all; he wakes
// at the crumbs landing beside him, looks round, leans in to peck... and
// nods off again. The greedy one comes back round as a ball and waddles the
// whole of that minute.
//
// Tiles: piles first (four at most, a repeated digit shares), then birds in
// priority order, falling back to a pose already on the glass. Flying birds
// share one global wing beat, so a whole flock costs two tiles. Building,
// crumbs in flight and strays are ROM. Everything is derived from the clock.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

// Crumb numerals: bold 5x7 on rows 0-6, two-dot stems, spill on row 7.
const DIG = {
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
const SPILL = '#.#.#';
const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const PILE = Object.fromEntries(Object.entries(DIG).map(([d, r]) => [d, bits([...r, SPILL])]));

// Pigeons, facing right; feet on row 7.
const POSE = {
  stand: ['.....', '...##', '...##', '..###', '.####', '#####', '#.##.', '..#.#'],
  alert: ['...##', '...##', '...#.', '..###', '.####', '#####', '#.##.', '..#.#'],
  bob:   ['.....', '.....', '...##', '..###', '#####', '#####', '#.##.', '..#.#'],
  peck:  ['.....', '.....', '.....', '#....', '.###.', '.####', '..###', '..#.#'],
  puff:  ['...##', '...##', '..###', '.####', '#####', '#####', '#.##.', '.#.#.'],
  sleep: ['.....', '.....', '.....', '..##.', '.####', '#####', '#.##.', '..#..'],
  snore: ['.....', '.....', '.....', '.....', '.####', '#####', '#####', '..#..'],
  flyU:  ['.#...', '.##..', '..##.', '..###', '#####', '.....', '.....', '.....'],
  flyD:  ['.....', '.....', '...##', '#####', '.###.', '.##..', '.#...', '.....'],
  fat:   ['.....', '...##', '.####', '#####', '#####', '#####', '.###.', '..#.#'],
  fatbob:['.....', '.....', '..###', '#####', '#####', '#####', '.###.', '.#.#.'],
};
const rev = (b) => { let o = 0; for (let i = 0; i < 5; i++) if (b & (1 << i)) o |= 0x10 >> i; return o; };
const BIRD = {};
for (const [k, r] of Object.entries(POSE)) {
  const b = bits(r);
  BIRD[k + 'R'] = b;
  BIRD[k + 'L'] = b.map(rev);
}
function str(b) { let s = ''; for (let i = 0; i < 5; i++) s += (b >> (4 - i)) & 1 ? '#' : '.'; return s; }

// ------------------------------------------------------------------ layout

const HCOL = [1, 2], MCOL = [10, 11];        // hour piles on the ledge (row 0), minutes on the street (row 1)
const CELL = [[HCOL[0], 0], [HCOL[1], 0], [MCOL[0], 1], [MCOL[1], 1]];
const DOZER = 0, LOOK = 4;                   // ledge birds
const A_HOME = 9, B_HOME = 12;               // street birds, either side of the minute piles
const A_RANGE = [5, 9], B_RANGE = [12, 15];
const STRAY = 0x2e;                          // a crumb on the ground
const TUMBLE = [0xde, 0xa4, 0x27, 0xa5];     // a handful in flight
const CORNICE = 0x3d, LIT = 0xff;           // the roof's cornice rails; a lit window at night
const EAT0 = 52.5, EAT1 = 58.2;              // the minute's meal
const STEP = 0.25;                           // half a strut: head forward, then body

// ------------------------------------------------------------------ time helpers

const valueAt = (kit, dayStart, B) => {
  const f = kit.clockFields(new Date(dayStart + B * 1000));
  return { v: f.hh + f.mm, f };
};
const diff = (a, b) => [0, 1, 2, 3].filter((i) => a[i] !== b[i]);
const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 11);

// A pile as row bytes: `keep` is the fraction of its dots still there,
// removed (or landed) in a scatter order seeded by `seed`.
function pileTile(d, keep, seed) {
  const full = PILE[d];
  if (keep >= 1) return full;
  const dots = [];
  full.forEach((b, r) => { for (let i = 0; i < 5; i++) if (b & (0x10 >> i)) dots.push([r, i]); });
  dots.sort((p, q) => rnd(seed, p[0] * 5 + p[1]) - rnd(seed, q[0] * 5 + q[1]));
  const n = Math.round(dots.length * keep);
  const out = Array(8).fill(0);
  for (const [r, i] of dots.slice(0, n)) out[r] |= 0x10 >> i;
  return out;
}

// ------------------------------------------------------------------ scripts
//
// A script is a list of segments {t0, t1, col, row, dir, pose}; pose may be a
// function of local time. Built deterministically per minute.

class Script {
  constructor(col, row, dir, t = 0) { this.s = []; this.t = t; this.col = col; this.row = row; this.dir = dir; }
  hold(dur, pose) { this.s.push({ t0: this.t, t1: this.t + dur, col: this.col, row: this.row, dir: this.dir, pose }); this.t += dur; return this; }
  face(dir) { this.dir = dir; return this; }
  walkTo(c) {
    if (c === this.col) return this;
    this.dir = Math.sign(c - this.col);
    while (this.col !== c) { this.hold(STEP, 'bob'); this.col += this.dir; this.hold(STEP, 'stand'); }
    return this;
  }
  peck(n, onEat) { for (let k = 0; k < n; k++) { this.hold(0.3, 'peck'); if (k === n - 1 && onEat) onEat(this.t); this.hold(0.3, 'stand'); } return this; }
  coo(dur) { return this.hold(dur, (lt) => (Math.floor(lt / 0.3) % 3 === 2 ? 'bob' : 'puff')); }
  fly(cells, dt) { for (const [c, r] of cells) { this.col = c; this.row = r; this.hold(dt, 'fly'); } return this; }
  at(T) {
    for (const g of this.s) if (T >= g.t0 && T < g.t1) {
      const pose = typeof g.pose === 'function' ? g.pose(T - g.t0) : g.pose;
      return { col: g.col, row: g.row, dir: g.dir, pose };
    }
    return null;
  }
}

/** A street bird's minute: strays first, then a wander, then the meal. */
function streetBird(who, m, strays, eats, show, back) {
  const home = who === 'A' ? A_HOME : B_HOME, faceHome = who === 'A' ? 1 : -1;
  const [lo, hi] = who === 'A' ? A_RANGE : B_RANGE;
  const seed = m * 3 + (who === 'A' ? 1 : 2);
  let sc;
  if (back) {
    // returning after the hour: fly in from the right along the sky, drop to the post
    const t0 = who === 'A' ? 1.6 : 2.4;
    sc = new Script(15, 0, -1, t0);
    const path = []; for (let c = 15; c >= home; c--) path.push([c, 0]);
    sc.fly(path, 0.18).fly([[home, 1]], 0.25);
    sc.col = home; sc.row = 1; sc.face(faceHome).hold(0.6, 'stand');
  } else {
    sc = new Script(home, 1, faceHome);
    sc.hold(0.35, 'fly').hold(0.5, 'alert');        // flinch as the crumbs land
  }
  const stop = show ? 38 : 46;
  for (const st of strays) {
    if (sc.t > stop - 6) break;
    const side = st.col < sc.col ? 1 : -1;           // stand beside it, facing it
    const c = Math.min(hi, Math.max(lo, st.col + side));
    sc.walkTo(c).face(-side).hold(0.4, 'alert');
    sc.peck(2 + Math.floor(rnd(seed, st.col) * 2), (t) => { st.eaten = t; });
    sc.hold(0.5 + rnd(seed, 9) * 1.5, 'stand');
  }
  let k = 0;
  while (sc.t < stop - 5) {
    const r = rnd(seed, 20 + k++);
    if (r < 0.3) sc.coo(1.2 + rnd(seed, 40 + k) * 1.2);
    else if (r < 0.65) sc.walkTo(lo + Math.floor(rnd(seed, 60 + k) * (hi - lo + 1)));
    else if (r < 0.8) sc.face(-sc.dir).hold(0.9, 'stand');
    else sc.hold(0.6, 'peck').hold(0.6, 'stand');
    sc.hold(0.6 + rnd(seed, 80 + k) * 1.4, (lt) => (lt % 2.2 < 0.25 ? 'alert' : 'stand'));
  }
  sc.walkTo(home).face(faceHome);
  if (show) { sc.hold(Math.max(0.1, 41 - sc.t), 'alert'); return sc; }
  // eyeing the pile, then the meal (or envy, if its digit is not the one turning)
  sc.hold(Math.max(0.1, EAT0 - 1.2 - sc.t), (lt) => (lt % 1.6 < 0.4 ? 'bob' : 'stand'));
  sc.hold(Math.max(0.1, EAT0 - sc.t), 'alert');
  if (eats) sc.hold(EAT1 - sc.t, (lt) => (lt % 0.5 < 0.25 ? 'peck' : 'stand')).hold(61 - sc.t, 'puff');
  else sc.hold(61 - sc.t, (lt) => (lt % 3 < 1.2 ? 'puff' : lt % 3 < 1.5 ? 'bob' : 'stand'));
  return sc;
}

function lookout(m, show, back) {
  const seed = m * 3 + 7;
  let sc;
  if (back) {
    sc = new Script(15, 0, -1, 3.0);
    const path = []; for (let c = 15; c >= LOOK; c--) path.push([c, 0]);
    sc.fly(path, 0.16); sc.col = LOOK; sc.face(1).hold(0.5, 'alert');
  } else sc = new Script(LOOK, 0, 1).hold(0.35, 'fly').hold(0.6, 'alert');
  let k = 0;
  const stop = show ? 38 : 61;
  while (sc.t < stop) {
    const r = rnd(seed, k++);
    if (r < 0.25) sc.coo(1.5);
    else if (r < 0.45) sc.face(-sc.dir).hold(1.2, 'stand');
    else if (r < 0.6) sc.walkTo(sc.col === LOOK ? LOOK - 1 : LOOK);
    else if (r < 0.75) sc.hold(0.8, 'bob');               // peering down at the street
    sc.hold(1 + rnd(seed, 50 + k) * 2, (lt) => (lt % 2.6 < 0.2 ? 'alert' : 'stand'));
  }
  if (show) { sc.walkTo(LOOK).face(1); sc.hold(Math.max(0.1, 41 - sc.t), 'alert'); }
  return sc;
}

// ------------------------------------------------------------------ the hour show

const RING = [];                                            // the loop the flock wheels round
for (let c = 15; c >= 5; c--) RING.push([c, 0]);
for (let c = 5; c <= 15; c++) RING.push([c, 1]);
const RING_DT = 0.2, RING0 = 41.4, LAND = 49.0, LIFT = 55.8;

/** Flock positions during the last 20 s of :59, and how much of each turning pile is left. */
function hourShow(u, eatIdx) {
  const birds = [];
  const left = {};
  if (u < 40) return { birds, left };
  const ringAt = (i0) => {
    const i = i0 + Math.floor((u - RING0) / RING_DT);
    const [c, r] = RING[((i % RING.length) + RING.length) % RING.length];
    return { col: c, row: r, dir: r === 0 ? -1 : 1, pose: 'fly' };
  };
  // three strangers sweep in from the right, then everyone wheels
  const STRANGER0 = [7, 4, 1], JOIN = { A: 15, B: 18, L: 10 };
  if (u < LAND) {
    STRANGER0.forEach((i0, j) => {
      if (u < RING0) {
        const i = Math.floor((u - 40 - j * 0.45) / RING_DT);
        if (i >= 0) birds.push({ col: RING[i][0], row: RING[i][1], dir: -1, pose: 'fly', who: 'S' });
      } else birds.push({ ...ringAt(i0), who: 'S' });
    });
    if (u >= RING0) for (const k of ['A', 'B', 'L']) birds.push({ ...ringAt(JOIN[k]), who: k });
    return { birds, left };
  }
  // the frenzy: one bird on each turning pile, the rest crowding in
  const piles = eatIdx.map((i) => CELL[i]);
  const extra = [[3, 0], [9, 1], [12, 1], [4, 0], [13, 1], [8, 1]].filter(([c, r]) => !piles.some(([pc, pr]) => pc === c && pr === r));
  const spots = [...piles, ...extra].slice(0, 6);
  spots.forEach(([c, r], j) => {
    let row = r;
    const onPile = j < piles.length;
    let pose;
    if (u < LAND + 0.25) pose = 'fly';
    else if (u >= LIFT) {
      const v = u - LIFT;
      if (v > 0.6 || (row === 0 && v > 0.3)) return;      // gone up out of the glass
      if (v >= 0.3) row = 0;
      pose = 'fly';
    } else if (onPile) pose = (u + j * 0.17) % 0.5 < 0.25 ? 'peck' : 'stand';
    else pose = (u + j * 0.37) % 1.0 < 0.3 ? 'alert' : (u + j * 0.37) % 1.0 < 0.6 ? 'bob' : 'stand';
    const dir = onPile ? (j % 2 ? -1 : 1) : (c <= 2 || (r === 1 && c <= MCOL[0]) ? 1 : -1);
    birds.push({ col: c, row, dir, pose, onPile: onPile && row === r, who: ['A', 'B', 'L', 'S', 'S', 'S'][j] });
  });
  eatIdx.forEach((i) => {
    left[i] = u < LAND + 0.4 ? 1 : Math.max(0, 1 - (u - LAND - 0.4) / (LIFT - LAND - 1.0));
  });
  return { birds, left };
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Pigeons',
  blurb: 'The time is breadcrumbs: pigeons peck the old digit away and a lobbed handful lands as the new one; on the hour the flock wheels in and devours the lot.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const B = T - (fields.s + fields.ms / 1000);            // this minute began
    const u = T - B;
    const m = Math.round(B / 60) + 1440 * (Math.floor(dayStart / 86400000) % 7);
    const now = valueAt(kit, dayStart, B), prev = valueAt(kit, dayStart, B - 60), next = valueAt(kit, dayStart, B + 60);
    const landed = diff(prev.v, now.v);                     // landed at the start of this minute
    const eat = diff(now.v, next.v);                        // eaten before the next
    const show = next.f.mm === '00';                        // this is :59: the hour show
    const back = now.f.mm === '00';                         // the minute after it

    // strays bounced off the last handful, onto the pavement
    const strays = [];
    const nStray = 1 + landed.filter((i) => i >= 2).length;
    for (let k = 0; k < nStray; k++) {
      const a = k % 2 === 1;
      const [lo, hi] = a ? [A_RANGE[0], A_RANGE[1] - 1] : [B_RANGE[0] + 1, B_RANGE[1]];
      strays.push({ col: lo + Math.floor(rnd(m, 100 + k) * (hi - lo + 1)), owner: a ? 'A' : 'B', eaten: 99 });
    }
    const sA = streetBird('A', m, strays.filter((s) => s.owner === 'A'), eat.includes(2), show, back);
    const sB = streetBird('B', m, strays.filter((s) => s.owner === 'B'), eat.includes(3), show, back);
    const sL = lookout(m, show, back);

    // ---- piles: how much of each is there
    const keep = [1, 1, 1, 1], digit = now.v.split('');
    for (const i of landed) if (u < 0.45) keep[i] = [0.35, 0.7, 1][Math.floor(u / 0.15)];
    const hs = show ? hourShow(u, eat) : { birds: [], left: {} };
    if (show) {
      for (const i of eat) if (u >= LAND) keep[i] = u >= LIFT ? 0 : hs.left[i] ?? 1;
    } else {
      const n = Math.ceil((EAT1 - EAT0 - 0.4) / 0.5);
      for (const i of eat) if (i >= 2 && u >= EAT0) keep[i] = Math.max(0, 1 - Math.ceil((u - EAT0) / 0.5) / n);
    }

    // ---- birds on the glass
    const flyPose = Math.floor(T / 0.2) % 2 ? 'flyD' : 'flyU';
    const birds = [];
    const add = (b, who) => {
      if (!b) return;
      let pose = b.pose === 'fly' ? flyPose : b.pose;
      if (who === 'A' && back && pose !== flyPose) pose = pose === 'bob' || pose === 'peck' ? 'fatbob' : 'fat';
      birds.push({ ...b, pose, who });
    };
    if (show && u >= 40) {
      for (const b of hs.birds) add(b, b.who);
      if (u < RING0) {
        const up = u >= 41 ? 'fly' : 'alert';
        const a = sA.at(u), b = sB.at(u);
        if (a) add({ ...a, pose: up }, 'A');
        if (b) add({ ...b, pose: up }, 'B');
        add({ col: LOOK, row: 0, dir: 1, pose: up }, 'L');
      }
    } else {
      add(sA.at(u), 'A'); add(sB.at(u), 'B'); add(sL.at(u), 'L');
    }
    // the sleeper
    let dz = { col: DOZER, row: 0, dir: 1, pose: Math.floor(T / 1.7) % 2 ? 'snore' : 'sleep' };
    if (back && u >= 0.3 && u < 3.6) {
      const w = u - 0.3;
      dz = { ...dz, pose: w < 0.4 ? 'alert' : w < 2.0 ? 'stand' : w < 2.7 ? 'bob' : 'sleep', dir: w >= 1.2 && w < 2.0 ? -1 : 1 };
    }
    birds.push({ ...dz, who: 'D' });

    // ---- the scene, in ROM
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const night = now.f.h >= 20 || now.f.h < 6;
    // One or two lit windows at night, never side by side, so they read as
    // windows and not as a slab (or a numeral) beside the time.
    const lit = (c) => night && (c === 1 + 2 * (now.f.h % 2) || (c === 4 && now.f.h % 3 === 0 && now.f.h % 2 === 0));
    for (let c = 0; c <= 4; c++) grid[1][c] = lit(c) ? LIT : CORNICE;
    for (const s of strays) if (u >= 0.3 && u < s.eaten) grid[1][s.col] = STRAY;

    // a handful in flight: lobbed from off the right edge, lands at :00
    const lobs = [];
    const lobTo = (cells, t0, dt) => {
      const k = Math.floor((u - t0) / dt);
      if (k >= 0 && k < cells.length) lobs.push([cells[k][0], cells[k][1], TUMBLE[k % 4]]);
    };
    const mEat = eat.filter((i) => i >= 2);
    if (mEat.length) {
      const target = Math.min(...mEat.map((i) => CELL[i][0]));
      const path = [[15, 1]]; for (let c = 14; c >= target; c--) path.push([c, 0]);
      lobTo(path, 60 - path.length * 0.28, 0.28);
    }
    if (show && eat.some((i) => i < 2)) {
      const path = [[15, 1]]; for (let c = 14; c >= HCOL[0] + 1; c--) path.push([c, 0]);
      lobTo(path, 60 - path.length * 0.16, 0.16);
    }

    // ---- tiles: piles, then birds over them, then birds
    const alloc = new TileAllocator(lcd, 0);
    const cover = (c, r) => birds.some((b) => b.col === c && b.row === r);
    const pileBits = (i) => (keep[i] > 0 ? pileTile(digit[i], keep[i], m * 4 + i) : null);
    CELL.forEach(([c, r], i) => {
      if (cover(c, r)) return;
      const t = pileBits(i);
      grid[r][c] = t ? alloc.add(t.map(str)) ?? 0x20 : 0x20;
    });
    const order = { A: 0, B: 1, L: 2, D: 3 };
    birds.sort((p, q) => (q.onPile ? 1 : 0) - (p.onPile ? 1 : 0) || (order[p.who] ?? 4) - (order[q.who] ?? 4));
    for (const b of birds) {
      if (b.col < 0 || b.col > 15) continue;
      const side = b.dir < 0 ? 'L' : 'R';
      let t = BIRD[b.pose + side];
      const pi = CELL.findIndex(([c, r]) => c === b.col && r === b.row);
      if (pi >= 0) { const p = pileBits(pi); if (p) t = t.map((v, r) => v | p[r]); }
      let code = alloc.add(t.map(str));
      if (code == null) {
        // fall back to a pose already on the glass, same way round
        for (const alt of ['stand', 'alert', 'bob', 'flyU', 'flyD', 'sleep']) {
          code = alloc.index.get(BIRD[alt + side].map(str).join('/'));
          if (code != null) break;
        }
      }
      if (code != null) grid[b.row][b.col] = code;
    }
    for (const [c, r, g] of lobs) if (!cover(c, r)) grid[r][c] = g;
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};
