// Crop Circle — a flying saucer keeps the time on a farm at night.
//
// The bottom row is a field. The time is four numerals pressed into it,
// hours on the left and minutes on the right, and two cows graze around them:
// one between the hours and the minutes, one at the far end. The top row is
// the night sky (ROM stars and a ROM moon), and a little saucer hops about in
// it: one CGRAM cell with a dome, a rim and chasing lights, the rim carried on
// out either side by two ROM dashes.
//
// All minute the saucer wanders the sky, hovering, darting a cell at a time,
// and stopping over a cow now and then, at which the cow looks up. The cows
// chew, flick their tails, wander and turn round; at night the far one lies
// down to sleep.
//
// Each minute the saucer goes to the digit that is about to change, lowers a
// tractor beam (a sparkle that the slow glass turns into a glow), and the old
// numeral lifts, spinning, faster and faster, up into its hatch. At :00 the
// new numeral comes down the beam the same way, spinning slower and slower,
// lands with a bump, and the nearest cow jumps.
//
// The hour: the saucer flies off, the cows look up, and the mothership slides
// in across the whole sky. Every turning numeral is taken up at once in its
// own beam, the new hour comes down, and then a beam picks out the middle
// cow: it floats up kicking and dematerialises; the other cow bolts off the
// end of the field. A minute later the little saucer brings the cow back and
// drops it, dazed, with stars going round its head.
//
// Never a wrong time: an old numeral only ever leaves before the minute turns
// and a new one only arrives after it; in between the beam is empty.
//
// Tiles: numerals first (a repeated digit shares), then the saucer (whose
// tile also carries a numeral rising into the hatch), then the middle cow,
// then the far cow, which falls back to sharing the first cow's tiles when
// the budget is tight. Sky, field, moon, stars, '!' and the mothership are
// ROM. Everything is derived from the clock.

import { TileAllocator, noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

const bits = (rows) => rows.map((l) => [...l].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0));
const str = (b) => { let s = ''; for (let i = 0; i < 5; i++) s += (b >> (4 - i)) & 1 ? '#' : '.'; return s; };
const rev = (b) => { let o = 0; for (let i = 0; i < 5; i++) if (b & (1 << i)) o |= 0x10 >> i; return o; };

// Crop numerals: bold, two-dot strokes, rows 1-7, standing on the ground line.
const DIG = {
  0: ['.....', '.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.....', '..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
  2: ['.....', '.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  3: ['.....', '####.', '...##', '..##.', '...##', '...##', '##.##', '.###.'],
  4: ['.....', '...##', '..###', '.#.##', '##.##', '#####', '...##', '...##'],
  5: ['.....', '#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  6: ['.....', '..##.', '.##..', '####.', '##.##', '##.##', '##.##', '.###.'],
  7: ['.....', '#####', '...##', '...##', '..##.', '..##.', '.##..', '.##..'],
  8: ['.....', '.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.....', '.###.', '##.##', '##.##', '.####', '...##', '..##.', '.##..'],
};
const DIGB = Object.fromEntries(Object.entries(DIG).map(([d, r]) => [d, bits(r)]));

// Cows, facing right, ten dots wide: rear cell then front cell.
const COWPIC = {
  up: ['..........', '.......#.#', '.......###', '.#########', '#########.', '########..', '.#.#..#.#.', '.#.#..#.#.'],
  graze: ['..........', '..........', '..........', '.#######..', '#########.', '##########', '.#.#..#.##', '.#.#..#.##'],
  chew: ['..........', '..........', '..........', '.#######..', '#########.', '#########.', '.#.#..#.##', '.#.#..#.##'],
  flick: ['#.........', '.#.....#.#', '.#.....###', '.#########', '#########.', '########..', '.#.#..#.#.', '.#.#..#.#.'],
  walk: ['..........', '.......#.#', '.......###', '.#########', '#########.', '########..', '#..#.#..#.', '.#..#.#..#'],
  lie: ['..........', '..........', '..........', '.......#.#', '.......###', '.#########', '#########.', '#########.'],
  sleep: ['..........', '..........', '..........', '..........', '..........', '.#######..', '##########', '##########'],
  jump: ['.......#.#', '.......###', '.#########', '#########.', '########..', '#...##...#', '#...##...#', '..........'],
  dangle: ['..........', '.......#.#', '.......###', '.#########', '#########.', '########..', '#.#.##.#.#', '..........'],
  dazed: ['..........', '......#..#', '.......##.', '.#########', '#########.', '########..', '#...##..#.', '#...##...#'],
  dazed2: ['..........', '..........', '.......#..', '.#########', '##########', '########.#', '#...##..#.', '#...##...#'],
};
const COW = {};
for (const [k, p] of Object.entries(COWPIC)) {
  COW[k] = [bits(p.map((r) => r.slice(0, 5))), bits(p.map((r) => r.slice(5, 10)))];
}

// The calf, one cell, facing right.
const CALFPIC = {
  up:    ['.....', '.....', '.....', '...##', '...##', '####.', '####.', '#..#.'],
  walk:  ['.....', '.....', '.....', '...##', '...##', '####.', '####.', '.#..#'],
  graze: ['.....', '.....', '.....', '.....', '.....', '###..', '####.', '#.###'],
  chew:  ['.....', '.....', '.....', '.....', '.....', '###..', '####.', '#..##'],
  flick: ['.....', '.....', '#....', '.#.##', '.#.##', '####.', '####.', '#..#.'],
  jump:  ['.....', '...##', '...##', '####.', '####.', '#..#.', '.....', '.....'],
  lie:   ['.....', '.....', '.....', '.....', '.....', '...##', '...##', '####.'],
  sleep: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '####.'],
};
const CALF = Object.fromEntries(Object.entries(CALFPIC).map(([k, r]) => [k, bits(r)]));

// The saucer: dome, rim on row 3 (the ROM dashes either side carry it on),
// lights on row 4 that chase, a hatch on row 5. Beam rows 6-7 when lit.
const UFO_TOP = bits(['.....', '.###.', '##.##', '#####']);
const LIGHTS = [bits(['#.#.#'])[0], bits(['.#.#.'])[0]];
const HATCH = bits(['.###.'])[0];
const RIM = 0x2d;

// ROM scenery
const MOON = 0xdf;
const STAR = [0x2e, 0xa5, 0x2a];          // twinkle: faint, bright, a sparkle
const TUFT = [0x2c, 0xa4];                // grass in the field
const BANG = 0x21;                         // '!'
const SPIN_STAR = [0x2a, 0x2b, 0xa5];     // stars round a dazed cow's head
const HULL = { nose: 0x3c, tail: 0x3e, body: 0x3d, win: 0xdb, lit: 0xff };

// ------------------------------------------------------------------ layout

const DCOL = [2, 3, 10, 11];               // H1 H2 | M1 M2, bottom row
const A_HOME = 6, A_RANGE = [4, 8];        // middle cow (rear/front at p, p+1)
const B_HOME = 14, B_RANGE = [12, 15];     // the calf, one cell
const SKY_STARS = [[0, 1], [4, 0], [6, 1], [9, 0], [12, 1], [15, 0]];

// saucer timings
const HOP = 0.17;                          // seconds per cell when cruising
const RISE = [0, 1, 2, 3, 5, 7, 10];       // dots up the beam, accelerating
const RSTEP = 0.15;
const LIFT_T = 0.45 + RISE.length * RSTEP + 0.25;   // one removal
const LAND_T = 0.3 + RISE.length * RSTEP + 0.5;     // one landing (with bump)

// ------------------------------------------------------------------ helpers

const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);
const diff = (a, b) => [0, 1, 2, 3].filter((i) => a[i] !== b[i]);

/** A digit squeezed to width w (1, 3 or 5), mirrored when `back`. */
function spin(rows, phase) {
  // phase 0..7: 5, 3, 1, 3m, 5m, 3m, 1, 3
  const W = [5, 3, 1, 3, 5, 3, 1, 3][((phase % 8) + 8) % 8];
  const back = [false, false, false, true, true, true, false, false][((phase % 8) + 8) % 8];
  return rows.map((b) => {
    const src = []; for (let i = 0; i < 5; i++) src.push((b >> (4 - i)) & 1);
    if (back) src.reverse();
    let out = 0;
    if (W === 5) src.forEach((v, i) => { if (v) out |= 0x10 >> i; });
    else if (W === 3) { const m = [src[0] | src[1], src[2], src[3] | src[4]]; m.forEach((v, i) => { if (v) out |= 0x10 >> (i + 1); }); }
    else if (src.some((v) => v)) out = 0x04;
    return out;
  });
}

let beamDir = 1;

/** Sparkle of a tractor beam: density 0..3, phase advances each frame. */
function beamRows(level, frame, cone) {
  const out = Array(8).fill(0);
  if (level <= 0) return out;
  for (let r = 0; r < 8; r++) for (let i = 0; i < 5; i++) {
    if (cone && (i < cone[r][0] || i > cone[r][1])) continue;
    // sparse sparks streaming along the beam: up while lifting, down while landing
    const k = (((r * 2 + i * 3 + frame * 2 * beamDir) % 7) + 7) % 7;
    if (k < [0, 1, 1, 2][Math.min(3, level)]) out[r] |= 0x10 >> i;
  }
  return out;
}

/** Random dissolve: keep a fraction of a tile's dots. */
function dissolve(rows, keep, seed) {
  if (keep >= 1) return rows;
  const dots = [];
  rows.forEach((b, r) => { for (let i = 0; i < 5; i++) if (b & (0x10 >> i)) dots.push([r, i]); });
  dots.sort((p, q) => rnd(seed, p[0] * 5 + p[1]) - rnd(seed, q[0] * 5 + q[1]));
  const out = Array(8).fill(0);
  for (const [r, i] of dots.slice(0, Math.round(dots.length * Math.max(0, keep)))) out[r] |= 0x10 >> i;
  return out;
}

const shiftRows = (rows, d) => rows.map((_, r) => rows[r + d] ?? 0); // d>0 moves up

// ------------------------------------------------------------------ saucer plan

/**
 * The saucer's minute as segments {t0, t1, col, act, i, k}:
 *   act 'fly' (col0 -> col over the segment), 'hover', 'lift', 'land', 'off'.
 */
function saucerPlan(m, landed, eat, mode) {
  const segs = [];
  let t = 0, col;
  const add = (dur, s) => { segs.push({ t0: t, t1: t + dur, col, ...s }); t += dur; };
  const flyTo = (c, per = HOP) => {
    if (c === col) return;
    const n = Math.abs(c - col);
    segs.push({ t0: t, t1: t + n * per, col, to: c, act: 'fly' });
    t += n * per; col = c;
  };
  if (mode === 'after') {
    // away with the mothership; comes back at 40 s with the cow
    col = -2; add(40, { act: 'off' });
    flyTo(A_HOME + 1, 0.12);
    add(0.6, { act: 'hover' });
    add(4.4, { act: 'drop' });
    add(0.4, { act: 'hover' });
  } else {
    // land the new digits, from where the last one left
    const L = [...landed].sort((a, b) => b - a);        // in the order they left
    col = DCOL[Math.min(...landed)];
    for (const i of L) { flyTo(DCOL[i]); add(LAND_T, { act: 'land', i }); }
  }
  // the last part of the minute: removals (right to left), or leaving for the hour
  let tEnd, firstTarget;
  if (mode === 'show') { tEnd = 38; firstTarget = 15; }
  else {
    const R = [...eat].sort((a, b) => b - a);
    const span = R.length * LIFT_T + (DCOL[R[0]] - DCOL[R[R.length - 1]]) * HOP;
    tEnd = 59.85 - span; firstTarget = DCOL[R[0]];
  }
  // wander until then
  let k = 0;
  while (true) {
    const c = 1 + Math.floor(rnd(m, 10 + k) * 14);
    const hover = 1.2 + rnd(m, 30 + k) * 3.2;
    const need = Math.abs(c - col) * HOP + hover + Math.abs(firstTarget - c) * HOP + 0.4;
    if (t + need > tEnd) break;
    flyTo(c);
    add(hover, { act: 'hover' });
    k++;
  }
  const lead = Math.abs(firstTarget - col) * HOP;
  add(Math.max(0, tEnd - t - lead), { act: 'hover' });
  if (mode === 'show') {
    flyTo(17, 0.12);
    add(61 - t, { act: 'off' });
  } else {
    flyTo(firstTarget);
    const R = [...eat].sort((a, b) => b - a);
    for (const i of R) { flyTo(DCOL[i]); add(LIFT_T, { act: 'lift', i }); }
    add(Math.max(0.1, 61 - t), { act: 'hover' });
  }
  return segs;
}

function saucerAt(plan, u) {
  for (const s of plan) if (u >= s.t0 && u < s.t1) {
    if (s.act === 'fly') {
      const n = Math.abs(s.to - s.col), f = (u - s.t0) / (s.t1 - s.t0);
      const c = s.col + Math.sign(s.to - s.col) * Math.min(n, Math.floor(f * n + 0.5));
      return { col: c, act: 'fly', lt: u - s.t0 };
    }
    return { col: s.col, act: s.act, i: s.i, lt: u - s.t0, dur: s.t1 - s.t0 };
  }
  return { col: -5, act: 'off', lt: 0 };
}

// ------------------------------------------------------------------ cows

/** A cow's minute: segments {t0, t1, p, dir, pose}. Starts and ends at home. */
function cowPlan(who, m, dir, night) {
  const home = who === 'A' ? A_HOME : B_HOME, [lo, hi] = who === 'A' ? A_RANGE : B_RANGE;
  const seed = m * 5 + (who === 'A' ? 1 : 2);
  const segs = [];
  let t = 0, p = home, d = dir;
  const hold = (dur, pose) => { segs.push({ t0: t, t1: t + dur, p, dir: d, pose }); t += dur; };
  const walkTo = (c) => {
    if (c === p) return;
    const s = Math.sign(c - p);
    if (s !== d) { hold(0.5, 'up'); d = s; hold(0.4, 'up'); }
    while (p !== c) { hold(0.35, 'walk'); p += s; hold(0.35, 'up'); }
  };
  const graze = (dur) => hold(dur, (lt) => (Math.floor(lt / 0.4) % 2 ? 'chew' : 'graze'));
  if (night && who === 'B') {
    hold(3, 'up');
    hold(61, (lt) => (lt % 9 < 6.5 ? 'sleep' : 'lie'));
    return segs;
  }
  hold(2.5 + rnd(seed, 1), 'up');
  let k = 0;
  while (t < 46) {
    const r = rnd(seed, 10 + k++);
    if (r < 0.4) graze(2 + rnd(seed, 40 + k) * 4);
    else if (r < 0.55) hold(0.35, 'flick');
    else if (r < 0.75) walkTo(lo + Math.floor(rnd(seed, 60 + k) * (hi - lo + 1)));
    else if (r < 0.85) hold(1.5, 'up');
    else { hold(0.4, 'up'); d = -d; hold(1.2, 'up'); }
    if (t < 46) graze(1 + rnd(seed, 80 + k) * 2);
  }
  walkTo(home);
  if (d !== dir) { hold(0.4, 'up'); d = dir; }
  graze(Math.max(0.1, 61 - t));
  return segs;
}

function cowAt(plan, u) {
  for (const s of plan) if (u >= s.t0 && u < s.t1) {
    return { p: s.p, dir: s.dir, pose: typeof s.pose === 'function' ? s.pose(u - s.t0) : s.pose };
  }
  const s = plan[plan.length - 1];
  return { p: s.p, dir: s.dir, pose: 'graze' };
}

/** Tiles of a cow (rear+front or mirrored) at cols p, p+1. */
function cowTiles(pose, dir, lift = 0) {
  let [r, f] = COW[pose];
  if (lift) { r = shiftRows(r, lift); f = shiftRows(f, lift); }
  return dir > 0 ? [r, f] : [f.map(rev), r.map(rev)];
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Crop Circle',
  blurb: 'A flying saucer keeps the time on a farm: each minute it beams the old numeral up out of the field and the new one down; on the hour the mothership comes for a cow.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const dayStart = midnight.getTime();
    const T = (date.getTime() - dayStart) / 1000;
    const u = fields.s + fields.ms / 1000;
    const B = T - u;
    const fr = Math.floor(T * 10 + 1e-6);
    const m = Math.round(B / 60) + 1440 * (Math.floor(dayStart / 86400000) % 7);
    const at = (dt) => kit.clockFields(new Date(dayStart + (B + dt) * 1000));
    const now = at(0), prev = at(-60), next = at(60);
    const vNow = now.hh + now.mm, vPrev = prev.hh + prev.mm, vNext = next.hh + next.mm;
    const landed = diff(vPrev, vNow), eat = diff(vNow, vNext);
    const show = next.mm === '00';          // :59, the mothership comes at the end
    const after = now.mm === '00';           // the minute after: cow away, comes back
    const dazedMin = now.mm === '01';
    const night = now.h >= 20 || now.h < 6;
    const mode = show ? 'show' : after ? 'after' : 'normal';

    // ---- the saucer
    const plan = saucerPlan(m, landed, eat, mode);
    const sc = saucerAt(plan, u);

    // ---- numerals: what each cell shows
    // state: {rows, beam, private}  rows = tile rows or null (empty)
    const digit = vNow.split('');
    const cell = digit.map((d) => ({ rows: DIGB[d], beam: 0, moving: false }));
    let inHatch = null;                     // rows of a numeral rising into the saucer cell
    const saucerBeam = { level: 0 };
    const bumps = [];                       // times a numeral landed (for the cows)
    for (const s of plan) if (s.act === 'land') bumps.push({ t: s.t0 + 0.3 + RISE.length * RSTEP, i: s.i });

    if (sc.act === 'lift' || sc.act === 'land') {
      const i = sc.i, lt = sc.lt;
      const d = sc.act === 'lift' ? digit[i] : digit[i];
      const src = sc.act === 'lift' ? DIGB[vNow[i]] : DIGB[vNow[i]];
      let level, k, gone = false, bump = 0;
      if (sc.act === 'lift') {
        level = Math.min(3, 1 + Math.floor(lt / 0.15));
        k = lt < 0.45 ? 0 : Math.floor((lt - 0.45) / RSTEP);
        if (k >= RISE.length) { gone = true; level = Math.max(0, 3 - Math.floor((lt - 0.45 - RISE.length * RSTEP) / 0.1)); }
      } else {
        level = Math.min(3, 1 + Math.floor(lt / 0.1));
        const j = lt < 0.3 ? -1 : Math.floor((lt - 0.3) / RSTEP);
        if (j < 0) { gone = true; k = RISE.length; }
        else if (j < RISE.length) k = RISE.length - 1 - j;
        else { k = 0; const b = lt - 0.3 - RISE.length * RSTEP; bump = b < 0.15 ? 1 : 0; level = Math.max(0, 3 - Math.floor(b / 0.12)); }
      }
      const dy = gone ? 99 : RISE[Math.min(k, RISE.length - 1)] + bump;
      const ph = sc.act === 'lift' ? Math.floor(Math.max(0, lt - 0.45) / (RSTEP * (k > 3 ? 0.5 : 1))) : Math.floor(Math.max(0, (LAND_T - 0.5) - lt) / RSTEP);
      const spun = (sc.act === 'land' && k === 0) || (sc.act === 'lift' && k === 0) ? src : spin(src, ph);
      // glass rows: numeral rows r at glass y = 8 + r - dy; hatch at y <= 5
      const low = Array(8).fill(0), high = Array(8).fill(0);
      if (!gone) spun.forEach((b, r) => {
        const y = 8 + r - dy;
        if (y >= 8 && y < 16) low[y - 8] |= b;
        else if (y > 5 && y < 8) high[y] |= b;
      });
      cell[i] = { rows: gone ? null : low, beam: level, moving: true };
      inHatch = high;
      saucerBeam.level = level;
      void d;
    }
    // after a numeral has left and before the new one lands, the cell is empty
    if (mode !== 'after' || u >= 13) {
      for (const i of eat) {
        const s = plan.find((q) => q.act === 'lift' && q.i === i);
        if (s && u >= s.t1 - 0.25) cell[i] = { rows: null, beam: 0 };
      }
    }
    for (const i of landed) {
      const s = plan.find((q) => q.act === 'land' && q.i === i);
      if (s && u < s.t0) cell[i] = { rows: null, beam: 0 };
    }

    // ---- the hour: mothership (end of :59, start of :00)
    let hull = null;                        // array of 16 ROM codes or null for row 0
    const hb = [];                          // per-col beam level for bottom cells (mothership)
    const H0 = 47, HSLIDE = 0.2;
    let cowA = { on: true }, cowB = { on: true };
    if (show && u >= H0) {
      const n = Math.min(16, Math.floor((u - H0) / HSLIDE));
      hull = shipRow(n, 'in', fr);
      const bt = u - 55.6;                    // beams and lifting
      if (bt >= 0) for (const i of eat) {
        const st = bt - (3 - i) * 0.4;        // staggered right to left
        if (st < 0) continue;
        const level = Math.min(3, 1 + Math.floor(st / 0.15));
        const dy = st < 0.8 ? 0 : st < 1.0 ? 1 : 2;
        const keep = st < 1.4 ? 1 : 1 - (st - 1.4) / 1.0;
        const ph = st < 0.8 ? 0 : 1 + Math.floor((st - 0.8) / 0.15);
        const rows = keep <= 0 ? null : shiftRows(dissolve(ph ? spin(DIGB[vNow[i]], ph) : DIGB[vNow[i]], keep, m * 4 + i), dy);
        cell[i] = { rows, beam: level, moving: true };
      }
    }
    if (after && u < 14) {
      // new numerals materialise in the beams, then the cow
      const out = u >= 10.5 ? Math.min(16, Math.floor((u - 10.5) / HSLIDE)) : 0;
      hull = shipRow(out, 'out', fr);
      for (const i of landed) {
        const st = u - (3 - i) * 0.35;
        if (st < 0) { cell[i] = { rows: null, beam: 3 }; continue; }
        const keep = Math.min(1, st / 1.2);
        const ph = st < 1.2 ? Math.floor((1.2 - st) / 0.2) : 0;
        const dy = st < 1.4 ? 2 : st < 1.6 ? 1 : st < 1.75 ? 0 : st < 1.9 ? 1 : 0;
        const level = st < 1.9 ? 3 : Math.max(0, 3 - Math.floor((st - 1.9) / 0.15));
        cell[i] = { rows: shiftRows(dissolve(ph ? spin(DIGB[vNow[i]], ph) : DIGB[vNow[i]], keep, m * 4 + i + 9), dy), beam: level, moving: true };
      }
      for (const i of landed) bumps.push({ t: (3 - i) * 0.35 + 1.6, i });
    }

    // ---- cows
    const dirOf = (mm) => (rnd(mm, 3) < 0.5 ? 1 : -1);
    const dir = dirOf(m);
    const pA = cowPlan('A', m, dir, night), pB = cowPlan('B', m, dir, night);
    let A = cowAt(pA, u), Bc = cowAt(pB, u);
    A.lift = 0; Bc.lift = 0; A.keep = 1; A.beam = 0;
    const bangs = [];
    const cowNear = (i) => (i <= 1 || i === 2 ? 'A' : 'B');
    // reactions: look up at a saucer overhead, jump when a numeral lands
    const overhead = (c) => sc.act !== 'off' && sc.col >= c.p && sc.col <= c.p + 1;
    for (const c of [A, Bc]) if (overhead(c) && c.pose !== 'sleep' && c.pose !== 'lie') c.pose = 'up';
    for (const b of bumps) {
      const w = u - b.t;
      if (w < 0 || w > 1.6) continue;
      const c = cowNear(b.i) === 'A' ? A : Bc;
      if (w < 0.3) { c.pose = 'jump'; c.lift = 0; }
      else c.pose = 'up';
      bangs.push(c);
    }
    if (show && u >= H0 - 2) { A.pose = 'up'; if (!night || u >= H0 + 2) Bc.pose = 'up'; }
    if (after) {
      // the abduction: A floats up and dematerialises; B bolts off the end
      const at0 = 3.6;
      if (u < at0) { A.pose = 'up'; }
      else if (u < at0 + 4.2) {
        const w = u - at0;
        A.beam = Math.min(3, 1 + Math.floor(w / 0.2));
        A.pose = w < 0.6 ? 'jump' : 'dangle';
        A.lift = w < 0.6 ? 0 : w < 1.2 ? 1 : 2;
        A.keep = w < 2.4 ? 1 : 1 - (w - 2.4) / 1.6;
        if (w < 0.6) bangs.push(A);
      } else cowA.on = false;
      if (u >= at0 + 0.5 && u < 13) {
        const w = u - at0 - 0.5;
        if (w < 0.5) { Bc.pose = 'jump'; bangs.push(Bc); }
        else {
          const step = Math.floor((w - 0.5) / 0.25);
          if (step < 2) { Bc.p = B_HOME + step; Bc.dir = 1; Bc.pose = step % 2 ? 'walk' : 'up'; }
          else cowB.on = false;
        }
      }
      if (u >= 13 && u < 16.5) {   // creeps back, looks about
        const step = Math.floor((u - 13) / 0.7);
        Bc.p = Math.max(B_HOME, 16 - step); Bc.dir = -1; Bc.pose = step % 2 ? 'walk' : 'up';
      } else if (u >= 16.5 && u < 44) {
        // looks for its friend: up at the sky, round at the empty field, a nervous nibble
        const k = Math.floor((u - 16.5) / 1.4);
        Bc.p = B_HOME; Bc.dir = k % 4 === 3 ? 1 : -1;
        Bc.pose = ['up', 'up', 'graze', 'up', 'chew', 'up', 'flick'][k % 7];
      }
      // the return
      if (sc.act === 'drop') {
        cowA.on = true;
        const w = sc.lt;
        A.p = A_HOME; A.dir = dir;
        A.beam = w < 3.6 ? Math.min(3, 1 + Math.floor(w / 0.15)) : Math.max(0, 3 - Math.floor((w - 3.6) / 0.15));
        A.keep = Math.min(1, w / 1.6);
        A.pose = w < 2.4 ? 'dangle' : 'dazed';
        A.lift = w < 2.0 ? 2 : w < 2.2 ? 1 : w < 2.4 ? 0 : w < 2.55 ? 1 : 0;
        if (w >= 2.4 && w < 3.4) bangs.push(Bc);
      } else if (u >= 45.4) {
        cowA.on = true; A.p = A_HOME; A.dir = dir;
        A.pose = Math.floor(u / 0.6) % 2 ? 'dazed' : 'dazed2';
        A.stars = true;
      }
      if (u >= 44 && u < 58) { Bc.pose = 'up'; Bc.dir = -1; Bc.p = B_HOME; }
    }
    if (dazedMin && u < 30 && !(sc.act === 'land' && false)) {
      A = { ...A, p: A_HOME, dir, pose: Math.floor(u / 0.6) % 2 ? 'dazed' : 'dazed2', stars: u < 24 };
      if (u >= 22) A.pose = Math.floor(u / 0.6) % 2 ? 'up' : 'dazed';
    }

    // ---- compose
    beamDir = sc.act === 'land' || sc.act === 'drop' || (after && u < 3.6) ? -1 : 1;
    const grid = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const tiles = [Array(16).fill(null), Array(16).fill(null)];   // requested tile rows, by priority later
    // sky
    if (night) {
      for (const [c, ph] of SKY_STARS) grid[0][c] = STAR[(Math.floor(T / 0.8) + ph * 4 + c) % 7 === 0 ? 2 : ph % 2 ? 1 : 0];
      grid[0][14] = MOON;
    } else grid[0][14] = MOON;   // a pale day moon
    // field tufts where nothing stands
    void TUFT;

    const req = [];   // {row, col, rows, prio, alt}
    // numerals
    cell.forEach((q, i) => {
      const c = DCOL[i];
      if (!q.rows && !q.beam) { grid[1][c] = 0x20; return; }
      let rows = q.rows ? [...q.rows] : Array(8).fill(0);
      if (q.beam) rows = rows.map((b, r) => b | beamRows(q.beam, fr, null)[r]);
      req.push({ row: 1, col: c, rows, prio: 0 });
    });
    // saucer
    if (sc.act !== 'off' && sc.col >= 0 && sc.col <= 15) {
      const c = sc.col;
      const lightsOn = LIGHTS[Math.floor(T / 0.3) % 2];
      const rows = [...UFO_TOP, lightsOn, 0, 0, 0];
      const lvl = saucerBeam.level || ((sc.act === 'drop') ? A.beam : 0);
      if (lvl) { const bm = beamRows(lvl, fr, [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [1, 3], [0, 4]]); rows[6] |= bm[6]; rows[7] |= bm[7]; }
      if (inHatch) for (let r = 6; r < 8; r++) rows[r] |= inHatch[r];
      // a hop makes it tilt: lights go dark for the dash
      if (sc.act === 'fly') rows[4] = 0;
      req.push({ row: 0, col: c, rows, prio: 1 });
      if (c - 1 >= 0) grid[0][c - 1] = RIM;
      if (c + 1 <= 15) grid[0][c + 1] = RIM;
    }
    if (hull) hull.forEach((code, c) => { if (code != null) grid[0][c] = code; });

    // cows: the far one tries its own pose, then poses already on the glass
    const cowCells = (c) => {
      if (!c) return [];
      if (c.calf) {
        let t = CALF[c.pose] ?? CALF.up;
        if (c.lift) t = shiftRows(t, c.lift);
        if (c.dir < 0) t = t.map(rev);
        return c.p >= 0 && c.p <= 15 ? [[c.p, t]] : [];
      }
      let [r0, r1] = cowTiles(c.pose, c.dir, c.lift);
      if (c.keep < 1) { r0 = dissolve(r0, c.keep, m + 1); r1 = dissolve(r1, c.keep, m + 2); }
      if (c.beam) { const bm = beamRows(c.beam, fr, null); r0 = r0.map((x, r) => x | bm[r]); r1 = r1.map((x, r) => x | bm[r]); }
      return [[c.p, r0], [c.p + 1, r1]].filter(([col]) => col >= 0 && col <= 15);
    };
    const headCol = (c) => (c.calf || c.dir < 0 ? c.p : c.p + 1);
    for (const c of bangs) {
      const hc = headCol(c);
      if (hc >= 0 && hc <= 15 && grid[0][hc] !== RIM && !req.some((q) => q.row === 0 && q.col === hc) && !hull) grid[0][hc] = BANG;
    }
    if (A.stars && cowA.on) {
      const hc = headCol(A), k = Math.floor(T / 0.35) % 3;
      if (grid[0][hc] === 0x20 || STAR.includes(grid[0][hc])) grid[0][hc] = SPIN_STAR[k];
    }

    // ---- allocate: numerals, saucer, middle cow, far cow
    const alloc = new TileAllocator(lcd, 0);
    const keyOf = (rows) => rows.map(str).join('/');
    const fits = (cells) => {
      const fresh = new Set(cells.map(([, rows]) => keyOf(rows)).filter((k) => !alloc.index.has(k)));
      return fresh.size <= alloc.capacity - alloc.used;
    };
    const place = (row, cells) => cells.forEach(([col, rows]) => { grid[row][col] = alloc.add(rows.map(str)); });
    req.sort((a, b) => a.prio - b.prio);
    for (const q of req) { const code = alloc.add(q.rows.map(str)); if (code != null) grid[q.row][q.col] = code; }
    if (cowA.on) { const cc = cowCells(A); if (fits(cc)) place(1, cc); }
    if (cowB.on) {
      const opts = [{ ...Bc, calf: true }, { ...Bc, calf: true, pose: 'up', lift: 0 }];
      for (const o of opts) { const cc = cowCells(o); if (fits(cc)) { place(1, cc); break; } }
    }
    alloc.flush();
    grid.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};

/** The mothership across row 0: `n` cells of it on the glass, sliding in from the right or out to the left. */
function shipRow(n, way, fr) {
  const ship = [];
  for (let k = 0; k < 16; k++) {
    if (k === 0) ship.push(HULL.nose);
    else if (k === 15) ship.push(HULL.tail);
    else ship.push(k % 3 === 2 ? HULL.win : HULL.body);
  }
  // a light runs along the windows
  const wins = ship.map((c, k) => (c === HULL.win ? k : -1)).filter((k) => k >= 0);
  const lit = wins[Math.floor(fr / 2) % wins.length];
  ship[lit] = HULL.lit;
  const row = Array(16).fill(null);
  if (way === 'in') for (let k = 0; k < n; k++) row[16 - n + k] = ship[k];
  else for (let c = 0; c < 16 - n; c++) row[c] = ship[c + n];
  if (way === 'out') for (let c = 16 - n; c < 16; c++) row[c] = null;
  return row;
}
