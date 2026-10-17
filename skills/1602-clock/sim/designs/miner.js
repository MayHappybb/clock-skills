// Miner — a cross-section of a mine. The rock is the glass, solid ROM
// blocks with the cell seams for its joints, and the time is the galleries a
// little miner has dug out of it: the numerals are negative space.
//
// The digits are a kit of six parts, all rock with a band of tunnel through
// them: a vertical stroke (Vt in the top row, Vb in the bottom, each with a
// one-dot rim of rock at the glass edge so the gallery is closed), the top
// bar (A), the middle bar (G), both (AG) and the bottom drift (D). The
// strokes are whole cells, five dots wide; the separators are whole cells
// of solid rock (ROM 0xff, free). The hour runs 1-12, so the tens of hours
// is a single shaft, the "1".
//
// He lives in the minute galleries and works them every second: raises the
// pick, strikes, a chip flies. At :12 he wipes his brow, at :28 he checks
// his pocket watch, at :44 he yawns, from :55 he spits on his hands and
// turns to the digit that is due. At night he dozes on his feet between
// turns.
//
// Minute turn: he walks (in a pocket his lamp makes in the rock) to every
// cell that differs between the old and the new time and works it a column
// at a time from his side, one pick stroke per column of rock dug out, one
// shovelful per column of rubble packed back. Each stroke holds 0.28 s.
//
// Hour: at :59:48 he puts the pick down, walks to the rock between the
// hours and the minutes, packs a bundle of dynamite into it, lights it and
// runs back to his gallery with his fingers in his ears. At :00 the
// glass flashes white, goes black, and the new time is there under a cloud
// of dust that falls and thins for three seconds (the slow glass is the
// dust). Then he is there, black with soot, blinking; his helmet comes down
// out of the rock and lands on his head, he shakes the soot off and goes
// back to work.
//
// Budget: the kit is at most six tiles (all six only when a 4, a 0 or 7 and
// one of 2 3 5 6 8 9 are on the glass together); he is one tile standing and
// working, two walking; the cell he is working is one. A dense sweep (every
// 0.1 s of all 1440 minutes) never needs a ninth. Ore glints in the
// separators take whatever slot is left. Turns are ordered so that between
// jobs each changing digit reads as its old value, its new one or no numeral,
// and never one minute digit new beside the other old. Every frame is a function of the wall clock: each
// turn is a script of segments built from (previous time, this time).

import { TileAllocator } from '../js/kit.js';

const F = 31;
const PART = {
  rock: [F, F, F, F, F, F, F, F],
  Vt: [F, 0, 0, 0, 0, 0, 0, 0],
  Vb: [0, 0, 0, 0, 0, 0, 0, F],
  A: [F, 0, 0, F, F, F, F, F],
  G: [F, F, F, F, F, F, 0, 0],
  AG: [F, 0, 0, F, F, F, 0, 0],
  D: [F, F, F, F, 0, 0, 0, F],
};
// digit -> [top-left, top-centre, top-right, bottom-left, bottom-centre, bottom-right]
const DIG = {
  0: ['Vt', 'A', 'Vt', 'Vb', 'D', 'Vb'],
  1: ['rock', 'Vt', 'rock', 'rock', 'Vb', 'rock'],
  2: ['AG', 'AG', 'Vt', 'Vb', 'D', 'D'],
  3: ['AG', 'AG', 'Vt', 'D', 'D', 'Vb'],
  4: ['Vt', 'G', 'Vt', 'rock', 'rock', 'Vb'],
  5: ['Vt', 'AG', 'AG', 'D', 'D', 'Vb'],
  6: ['Vt', 'AG', 'AG', 'Vb', 'D', 'Vb'],
  7: ['A', 'A', 'Vt', 'rock', 'rock', 'Vb'],
  8: ['Vt', 'AG', 'Vt', 'Vb', 'D', 'Vb'],
  9: ['Vt', 'AG', 'Vt', 'D', 'D', 'Vb'],
};
const SLOT = { h: 3, mt: 8, mo: 12 }; // first column of each digit; the hour's "1" is column 1

// ------------------------------------------------------------------ the miner
// Facing right, five dots wide, rows 0-6; he stands on row 7 of his cell.
const POSES = `
stand    raise    strike    walk1    walk2    climb1    climb2    scoop    toss     watch    tick     wipe     rub1     rub2     yawn     sleep    jolt     plant    run1     run2     ears     soot     nohat    nohatb    squash
.##..    #.##.    .##..    .##..    .##..    .##.#    #.##.    .....    .##.#    .##..    .##..    .##..    .##..    .##..    .##..    .....    #.#.#    .....    ..##.    ..##.    .....    .##..    #.#.#    #.#.#    .....
.####    .####    .####    .####    .####    .####    #####    .##..    .####    .####    .####    #####    .####    .####    .####    .##..    .###.    .....    .####    .####    .....    .####    .###.    .###.    .....
.##..    ..##.    .##..    .##..    .##..    .##..    .##..    .####    .##.#    .##..    .##.#    .##.#    .##..    .##..    .#.#.    .####    .##..    .##..    ..##.    ..##.    #..#.    #.#.#    #.#.#    #####    .###.
.###.    .###.    .####    .##..    .##..    .###.    .##..    .##..    .###.    .####    .###.    .##..    .###.    .####    .##..    .##..    #####    .####    ####.    .###.    ####.    #####    #####    #####    #.#.#
.##.#    ..##.    .##.#    .###.    .##..    .##..    .###.    .###.    .##..    .##..    .##..    .##..    .###.    .##..    .##..    .###.    .##..    .##..    .##..    .##..    #..#.    .###.    .###.    .###.    #####
.##.#    ..##.    .##.#    .##..    .###.    .##..    .##..    .##.#    .##..    .##..    .##..    .##..    .##..    .##..    .##..    .##.#    .##..    .###.    ##.#.    .##..    .##..    .###.    .###.    .###.    .###.
.#.##    ..#.#    .#...    #..#.    .##..    .#.#.    .#.#.    .#.##    .#.#.    .#.#.    .#.#.    .#.#.    .#.#.    .#.#.    .#.#.    .#.##    #...#    .#.##    ....#    .##..    .#.#.    .#.#.    .#.#.    .#.#.    #.#.#
`;
const HELMET = ['.##.', '####'];
const ZED = ['####', '..#.', '.#..', '####'];

function parsePoses(src) {
  const lines = src.trim().split('\n');
  const names = lines[0].trim().split(/\s+/);
  const out = {};
  names.forEach((n, k) => { out[n] = lines.slice(1).map((l) => l.trim().split(/\s+/)[k]); });
  return out;
}
const POSE = parsePoses(POSES);

// ------------------------------------------------------------------- the time

function digitsAt(date) {
  const h = date.getHours(), m = date.getMinutes();
  const h12 = h % 12 || 12;
  return { ht: h12 >= 10 ? 1 : -1, h: h12 % 10, mt: Math.floor(m / 10), mo: m % 10 };
}

/** 2x16 grid of part names for a time. */
function partsFor(d) {
  const g = [Array(16).fill('rock'), Array(16).fill('rock')];
  if (d.ht === 1) { g[0][1] = 'Vt'; g[1][1] = 'Vb'; }
  for (const k of ['h', 'mt', 'mo']) {
    DIG[d[k]].forEach((p, i) => { g[i < 3 ? 0 : 1][SLOT[k] + (i % 3)] = p; });
  }
  return g;
}

/** Where he stands at rest: a bottom-row gallery of the minutes' ones. */
function home(d) {
  const p = DIG[d.mo];
  const c0 = SLOT.mo;
  if (p[5] === 'Vb') return { x: (c0 + 2) * 6, y: 8, face: 1 };
  if (p[3] === 'Vb') return { x: c0 * 6, y: 8, face: -1 };
  return { x: (c0 + 1) * 6, y: 8, face: 1 };
}

const colsDiffer = (a, b) => [0, 1, 2, 3, 4].filter((i) => a.some((v, r) => ((v ^ b[r]) >> (4 - i)) & 1));
const popc = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1) + ((v >> 4) & 1);

// ------------------------------------------------------------------ scripts
const WALK = 0.085; // s per glass column
const CLIMB = 0.1; // s per dot row
const STEP = 0.28; // s per worked column (raise 0.14, strike 0.14)

/** Digit shown in a slot of a part grid, or null if it is no numeral. */
function readDigit(g, c0) {
  const p = [g[0][c0], g[0][c0 + 1], g[0][c0 + 2], g[1][c0], g[1][c0 + 1], g[1][c0 + 2]].join();
  for (const d in DIG) if (DIG[d].join() === p) return Number(d);
  return null;
}

/**
 * The order to work the cells in: the shortest walk such that the glass never
 * spells a time it is not. Between jobs a digit may read as its old value,
 * its new one or no numeral at all; and when both minute digits change, never
 * one new beside the other old (09 -> 10 must not stop at 00 or 19).
 */
function safeOrder(a, b, prevD, newD, jobs, start) {
  const g = a.map((row) => row.slice());
  const slots = ['mt', 'mo'].filter((k) => prevD[k] !== newD[k]);
  const ok = () => {
    const st = slots.map((k) => {
      const d = readDigit(g, SLOT[k]);
      return d === newD[k] ? 'new' : d === prevD[k] ? 'old' : d === null ? 'none' : 'wrong';
    });
    if (st.includes('wrong')) return false;
    return !(st.includes('new') && st.includes('old'));
  };
  const distTo = (j, p) => Math.min(...[-1, 1].filter((sd) => j.c + sd >= 0 && j.c + sd <= 15)
    .map((sd) => Math.abs((j.c + sd) * 6 - p.x) * WALK + Math.abs(j.r * 8 - p.y) * CLIMB));
  let bestOrder = null, bestCost = Infinity, tries = 0;
  const rec = (left, p, cost, seq) => {
    if (cost >= bestCost || ++tries > 20000) return;
    if (!left.length) { bestOrder = seq.slice(); bestCost = cost; return; }
    const cand = left.map((j) => ({ j, d: distTo(j, p) })).sort((u, v) => u.d - v.d);
    for (const { j, d } of cand) {
      const was = g[j.r][j.c];
      g[j.r][j.c] = b[j.r][j.c];
      if (left.length === 1 || ok()) {
        seq.push(j);
        rec(left.filter((q) => q !== j), { x: j.c * 6, y: j.r * 8 }, cost + d, seq);
        seq.pop();
      }
      g[j.r][j.c] = was;
    }
  };
  rec(jobs, start, 0, []);
  return bestOrder ?? jobs;
}

/** The minute turn: walk to each changed cell and work it. */
function buildTurn(prevD, newD) {
  const a = partsFor(prevD), b = partsFor(newD);
  const jobs = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
    if (a[r][c] !== b[r][c]) jobs.push({ c, r, from: PART[a[r][c]], to: PART[b[r][c]] });
  }
  const segs = [];
  let t = 0;
  const pos = { ...home(prevD) };
  const walkTo = (x, y) => {
    if (x !== pos.x) {
      const dur = Math.abs(x - pos.x) * WALK;
      segs.push({ kind: 'walk', t0: t, t1: t + dur, x0: pos.x, x1: x, y: pos.y });
      t += dur; pos.x = x;
    }
    if (y !== pos.y) {
      const dur = Math.abs(y - pos.y) * CLIMB;
      segs.push({ kind: 'climb', t0: t, t1: t + dur, x, y0: pos.y, y1: y });
      t += dur; pos.y = y;
    }
  };
  const order = safeOrder(a, b, prevD, newD, jobs, pos);
  for (const j of order) {
    let best = null;
    for (const side of [-1, 1]) {
      const sc = j.c + side;
      if (sc < 0 || sc > 15) continue;
      const sx = sc * 6, sy = j.r * 8;
      const cost = Math.abs(sx - pos.x) * WALK + Math.abs(sy - pos.y) * CLIMB;
      if (!best || cost < best.cost) best = { j, side, sx, sy, cost };
    }
    const { side, sx, sy } = best;
    walkTo(sx, sy);
    const cols = colsDiffer(j.from, j.to);
    const fill = j.to.reduce((n, v) => n + popc(v), 0) > j.from.reduce((n, v) => n + popc(v), 0);
    // dig: the face recedes away from him; fill: packed from the back towards him
    const near = side < 0 ? (i) => i : (i) => 4 - i; // distance from him
    cols.sort((p, q) => (fill ? near(q) - near(p) : near(p) - near(q)));
    const dur = cols.length * STEP;
    j.t0 = t; j.cols = cols; j.fill = fill;
    segs.push({ kind: 'work', t0: t, t1: t + dur, x: sx, y: sy, face: -side, job: j });
    t += dur;
  }
  const hm = home(newD);
  if (pos.y !== hm.y) walkTo(pos.x, hm.y);
  walkTo(hm.x, hm.y);
  return { segs, jobs, end: t };
}

const cache = new Map();
function turnFor(key, prevD, newD) {
  if (!cache.has(key)) {
    if (cache.size > 8) cache.clear();
    cache.set(key, buildTurn(prevD, newD));
  }
  return cache.get(key);
}

/** The cell's bitmap partway through a job: a column changes on each strike. */
function partial(job, tt) {
  const done = Math.max(0, Math.min(job.cols.length, Math.floor((tt - job.t0 - STEP / 2) / STEP) + 1));
  const mask = job.cols.slice(0, done).reduce((m, i) => m | (0x10 >> i), 0);
  return job.from.map((v, r) => (v & ~mask) | (job.to[r] & mask));
}

// ------------------------------------------------------------------ drawing

class Canvas {
  constructor(parts) {
    this.base = parts.map((row) => row.map((p) => PART[p].slice()));
    this.cell = this.base.map((row) => row.map((b) => b.slice()));
    this.touched = new Set();
    this.prio = new Map();
  }
  setCell(c, r, bits, prio = 1) {
    this.base[r][c] = bits.slice(); this.cell[r][c] = bits.slice();
    this.prio.set(r * 16 + c, prio);
  }
  set(x, y, on, prio = 2) {
    const c = Math.floor(x / 6), i = x - c * 6;
    if (i > 4 || c < 0 || c > 15 || y < 0 || y > 15) return;
    const r = y >> 3, bit = 0x10 >> i;
    const row = this.cell[r][c];
    row[y & 7] = on ? row[y & 7] | bit : row[y & 7] & ~bit;
    const k = r * 16 + c;
    this.touched.add(k);
    this.prio.set(k, Math.max(this.prio.get(k) ?? 0, prio));
  }
  /** A sprite of '#' rows at glass (x, y); `halo` cuts a pocket in rock round it. */
  sprite(rows, x, y, face = 1, halo = true, prio = 2) {
    const w = rows[0].length;
    const ink = (i, j) => {
      if (j < 0 || j >= rows.length || i < 0 || i >= w) return false;
      return rows[j][face > 0 ? i : w - 1 - i] === '#';
    };
    if (halo) {
      // cells his body is in: the pocket never spills into another cell
      const own = new Set();
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) {
        if (ink(i, j) && (x + i) % 6 !== 5) own.add(((y + j) >> 3) * 16 + Math.floor((x + i) / 6));
      }
      for (let j = -1; j < rows.length; j++) for (let i = -1; i <= w; i++) {
        if (ink(i, j)) continue;
        // beside and above him, never under his feet
        if (!(ink(i - 1, j) || ink(i + 1, j) || ink(i, j + 1) || ink(i - 1, j + 1) || ink(i + 1, j + 1))) continue;
        const yy = y + j, xx = x + i;
        if (yy < 0 || yy > 15) continue;
        if (own.has((yy >> 3) * 16 + Math.floor(xx / 6))) this.set(xx, yy, 0, prio);
      }
    }
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (ink(i, j)) this.set(x + i, y + j, 1, prio);
  }
  /** Allocate tiles by priority and write the frame. Ink that finds no slot falls back to the cell under it. */
  draw(lcd, extraFallback = new Map()) {
    const alloc = new TileAllocator(lcd, 0);
    const codes = [Array(16).fill(0xff), Array(16).fill(0xff)];
    const romOf = (b) => (b.every((v) => v === F) ? 0xff : b.every((v) => v === 0) ? 0x20 : null);
    let dropped = 0;
    const order = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) order.push({ r, c, p: this.prio.get(r * 16 + c) ?? 0 });
    order.sort((u, v) => u.p - v.p);
    for (const { r, c } of order) {
      const cands = [this.cell[r][c], this.base[r][c], ...(extraFallback.get(r * 16 + c) ?? [])];
      let code = null;
      for (const b of cands) {
        code = romOf(b);
        if (code === null) code = alloc.add(b);
        if (code !== null) break;
      }
      if (b0(this, r, c, code, cands) && (this.prio.get(r * 16 + c) ?? 0) < 5) dropped++;
      codes[r][c] = code ?? 0xff;
    }
    alloc.flush();
    if (globalThis.__minerStats) globalThis.__minerStats.dropped = dropped;
    codes.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((code) => lcd.data(code)); });
  }
}

// true when a cell could not show its own picture (only counted by the sweep in tests)
function b0(cv, r, c, code, cands) {
  const want = cands[0];
  const rom = want.every((v) => v === F) ? 0xff : want.every((v) => v === 0) ? 0x20 : -1;
  return rom >= 0 ? code !== rom : code === null || code === 0xff || code === 0x20 ? true : false;
}

// ore glints in rock that is always rock: they take whatever slot is left
const ORE = [[0, 1, 0], [7, 0, 4], [11, 1, 2], [15, 0, 6], [6, 1, 8]];
function oreTile(phase) {
  const t = [F, F, F, F, F, F, F, F];
  if (phase === 1 || phase === 3) t[3] &= ~0x04;
  if (phase === 2) { t[2] &= ~0x04; t[3] &= ~0x0e; t[4] &= ~0x04; }
  return t;
}

// dust after the blast: hollow dots speckled, falling and thinning
function hash(a, b, c) {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x1b87, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function dusty(bits, variant, tt, density, seed = 0) {
  const step = Math.floor(tt / 0.2);
  return bits.map((v, r) => {
    let out = v;
    for (let i = 0; i < 5; i++) {
      if ((v >> (4 - i)) & 1) continue;
      if (hash(i + variant * 5, r - step, variant + seed) < density) out |= 0x10 >> i;
    }
    return out;
  });
}

const BLANK = [0, 0, 0, 0, 0, 0, 0, 0];
const allRock = () => new Canvas([Array(16).fill('rock'), Array(16).fill('rock')]);

// ------------------------------------------------------------------ behaviour

function restPose(s, hm, night, nextSide) {
  const p = s - Math.floor(s);
  let face = hm.face;
  if (night && s < 59.4) return { pose: 'sleep', face, zz: s % 2.4 };
  if (s >= 55) {
    if (nextSide) face = nextSide;
    const q = Math.floor((s - 55) / 0.35);
    return { pose: s < 57.8 ? (q % 2 ? 'rub1' : 'rub2') : 'stand', face };
  }
  if (s >= 12 && s < 14.4) return { pose: s < 12.3 || s > 14.1 ? 'stand' : 'wipe', face };
  if (s >= 28 && s < 32) {
    if (s < 28.3) return { pose: 'stand', face };
    if (s < 31) return { pose: Math.floor((s - 28.3) / 0.45) % 2 ? 'tick' : 'watch', face };
    return { pose: Math.floor((s - 31) / 0.25) % 2 ? 'stand' : 'squash', face };
  }
  if (s >= 44 && s < 46) return { pose: s < 44.3 || s > 45.7 ? 'stand' : 'yawn', face };
  // one stroke a second at the rock beside him
  if (p < 0.38) return { pose: 'raise', face };
  if (p < 0.62) return { pose: 'strike', face, chip: 0 };
  if (p < 0.82) return { pose: 'stand', face, chip: 1 };
  return { pose: 'stand', face };
}

export default {
  name: 'Miner',
  blurb: 'The time is a mine: the numerals are galleries dug out of solid rock; each minute the miner digs and backfills, and on the hour he blasts.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, ctx) {
    const f = ctx.fields, date = ctx.date;
    const s = f.s + f.ms / 1000;
    const nowD = digitsAt(date);
    const minuteStart = new Date(date.getTime() - (f.s * 1000 + f.ms));
    const prevD = digitsAt(new Date(minuteStart.getTime() - 1000));
    const nextD = digitsAt(new Date(minuteStart.getTime() + 60000));
    const night = f.h < 6 || f.h >= 23;
    const hourTurn = prevD.h !== nowD.h || prevD.ht !== nowD.ht;
    const hourDue = nextD.h !== nowD.h || nextD.ht !== nowD.ht;

    let cv = new Canvas(partsFor(nowD));
    let man = null; // { x, y, pose, face }
    const extra = [];

    if (hourTurn && s < 7.4) {
      // ------------------------------------------------------- the blast
      if (s < 0.3) {
        cv = allRock();
        for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) cv.setCell(c, r, BLANK, 0);
        cv.draw(lcd); return;
      }
      if (s < 0.6) { allRock().draw(lcd); return; }
      if (s < 3.6) {
        const tt = s - 0.6, density = 0.4 * (1 - tt / 3) ** 1.5;
        const parts = partsFor(nowD), fb = new Map();
        for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
          const p = parts[r][c];
          if (p === 'rock') continue;
          // each part its own speckle; the strokes get a second one if a slot is free
          const seed = p.length * 3 + p.charCodeAt(0), v = (p === 'Vt' || p === 'Vb') ? (c >> 1) % 2 : 0;
          cv.setCell(c, r, dusty(PART[p], v, tt, density, seed), v);
          if (v) fb.set(r * 16 + c, [dusty(PART[p], 0, tt, density, seed)]);
        }
        cv.draw(lcd, fb);
        return;
      }
      // soot; the helmet comes down the gallery onto his head; shake it off
      const hm = home(nowD), hx = hm.x, hy = hm.y, st = s - 3.6;
      if (st < 1.6) {
        const shut = [0.6, 1.2].some((b) => st >= b && st < b + 0.2);
        man = { x: hx, y: hy, pose: shut ? 'nohatb' : 'nohat', face: -1 };
      } else if (st < 2.4) {
        man = { x: hx, y: hy, pose: 'nohat', face: -1 };
        extra.push({ rows: HELMET, x: hx + 1, y: Math.min(hy, 1 + Math.floor((st - 1.6) / 0.1)), face: 1 });
      } else if (st < 2.7) {
        man = { x: hx, y: hy, pose: 'squash', face: -1 };
        extra.push({ rows: HELMET, x: hx + 1, y: hy + 1, face: 1 });
      } else {
        const q = Math.floor((st - 2.7) / 0.2);
        man = { x: hx, y: hy, pose: q >= 5 ? 'stand' : q % 2 ? 'soot' : 'stand', face: q % 2 ? -1 : 1 };
      }
    } else if (hourDue && s >= 48) {
      // ---------------------------------------------- planting the dynamite
      const hm = home(nowD), dx = 7 * 6;
      const walkEnd = 48.4 + (hm.x - dx) * WALK;
      let lit = false;
      if (s < 48.4) man = { ...hm, pose: 'stand', face: -1 };
      else if (s < walkEnd) {
        const x = Math.round(Math.max(dx, hm.x - (s - 48.4) / WALK));
        man = { x, y: 8, pose: Math.floor(s / 0.2) % 2 ? 'walk1' : 'walk2', face: -1 };
      } else if (s < walkEnd + 2) {
        man = { x: dx, y: 8, pose: Math.floor((s - walkEnd) / 0.4) % 2 ? 'plant' : 'scoop', face: -1 };
      } else if (s < walkEnd + 2.8) {
        man = { x: dx, y: 8, pose: 'stand', face: -1 }; lit = s > walkEnd + 2.4;
      } else {
        lit = true;
        const rs = s - (walkEnd + 2.8), runEnd = hm.x;
        const x = Math.round(Math.min(runEnd, dx + rs / 0.05));
        if (x < runEnd) man = { x, y: 8, pose: Math.floor(rs / 0.15) % 2 ? 'run1' : 'run2', face: 1 };
        else man = { x: runEnd, y: 8, pose: 'ears', face: 1 };
      }
      if (s >= walkEnd + 0.8) {
        // the bundle packed into the rock, its fuse burning down
        const burnFrom = walkEnd + 2.4;
        const left = lit ? Math.max(0, 1 - (s - burnFrom) / (60 - burnFrom)) : 1;
        // a niche with two sticks bound together, the fuse up between them
        const bits = [F, 0, 0, 0, 0b01010, 0b01110, 0b01010, 0b01010];
        const top = 4 - Math.ceil(left * 3); // the fuse is rows top..3 of the niche
        for (let r = top; r < 4; r++) bits[r] |= 0b00100;
        if (lit && top > 1) bits[top - 1] = Math.floor(s / 0.2) % 2 ? 0b01010 : 0b00100;
        if (lit && top <= 1) bits[1] = Math.floor(s / 0.2) % 2 ? 0b01110 : 0b00100;
        cv.setCell(6, 1, bits, 1);
      }
    } else {
      // ----------------------------------------------- the minute turn
      const key = minuteStart.getTime();
      const changed = prevD.mo !== nowD.mo || prevD.mt !== nowD.mt;
      const turn = changed && !hourTurn ? turnFor(key, prevD, nowD) : null;
      const tt = s - (night ? 0.6 : 0);
      if (turn && tt < turn.end) {
        const was = partsFor(prevD), now = partsFor(nowD);
        for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) cv.setCell(c, r, PART[was[r][c]], 0);
        for (const j of turn.jobs) {
          if (tt >= j.t0 + j.cols.length * STEP) cv.setCell(j.c, j.r, PART[now[j.r][j.c]], 0);
          else if (tt >= j.t0) cv.setCell(j.c, j.r, partial(j, tt), 1);
        }
        if (tt < 0) man = { ...home(prevD), pose: 'jolt' };
        else {
          const seg = turn.segs.find((g) => tt < g.t1) ?? turn.segs[turn.segs.length - 1];
          const u = (tt - seg.t0) / (seg.t1 - seg.t0);
          if (seg.kind === 'walk') {
            const x = Math.round(seg.x0 + (seg.x1 - seg.x0) * u);
            man = { x, y: seg.y, pose: Math.floor(tt / 0.2) % 2 ? 'walk1' : 'walk2', face: Math.sign(seg.x1 - seg.x0) };
          } else if (seg.kind === 'climb') {
            const y = Math.round(seg.y0 + (seg.y1 - seg.y0) * u);
            man = { x: seg.x, y, pose: Math.floor(tt / 0.2) % 2 ? 'climb1' : 'climb2', face: 1 };
          } else {
            const ph = ((tt - seg.t0) % STEP) / STEP;
            const pose = seg.job.fill ? (ph < 0.5 ? 'scoop' : 'toss') : (ph < 0.5 ? 'raise' : 'strike');
            man = { x: seg.x, y: seg.y, pose, face: seg.face };
          }
        }
      } else {
        const hm = home(nowD);
        let side = 0;
        if (!hourDue) {
          const w = turnFor(key + 60000, nowD, nextD).segs.find((g) => g.kind === 'work');
          if (w) side = w.x > hm.x ? 1 : w.x < hm.x ? -1 : w.face;
        }
        const st = restPose(s, hm, night, side);
        man = { ...hm, pose: st.pose, face: st.face };
        if (st.chip !== undefined) {
          // a chip off the wall in front of him, falling
          const cx = hm.face > 0 ? hm.x + 4 : hm.x;
          extra.push({ rows: ['#'], x: cx, y: 8 + 2 + st.chip * 3, face: 1, halo: false });
        }
        if (st.zz !== undefined) {
          // z's rising in the gallery above him, if there is one
          const zc = Math.floor(hm.x / 6);
          const zy = 4 - Math.floor(st.zz / 0.5);
          if (partsFor(nowD)[0][zc] === 'Vt' && zy >= 1) extra.push({ rows: ZED, x: hm.x + (Math.floor(st.zz / 1) % 2), y: zy, face: 1, halo: false });
        }
      }
    }

    if (man) cv.sprite(POSE[man.pose], man.x, man.y, man.face);
    for (const e of extra) cv.sprite(e.rows, e.x, e.y, e.face, e.halo !== false);

    // ore glints, lowest priority, on the wall clock
    const oph = Math.floor((f.m * 60 + s) / 0.4);
    for (const [c, r, off] of ORE) {
      const ph = (oph + off) % 10;
      if (ph >= 4 || cv.prio.has(r * 16 + c) || cv.base[r][c].some((v) => v !== F)) continue;
      cv.setCell(c, r, oreTile(ph), 5);
    }
    cv.draw(lcd);
  },
};
