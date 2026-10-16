// Searchlight — the time is painted on a prison wall in glow-in-the-dark
// paint, and a guard's searchlight is the only thing that charges it.
//
// The glass is the wall at night (blue panel: lit dots are light). A beam
// three cells wide sweeps back and forth. Where it falls, the wall shows as a
// stipple of lit brick and the painted digits stand out solid inside it.
// Behind it the paint keeps glowing, and a few seconds later each digit goes
// dark again, whole, until the beam comes back. So the time is read in the
// beam's wake, never all at once at rest: the far end of the yard is dark
// while the light works the other end.
//
// Each minute a tiny burglar in a striped shirt slips out of his corner and
// repaints the digits that changed, a cell at a time with fresh glowing paint.
// When the light comes near he freezes. If he is mid-job he jumps into the
// cell he is painting and poses as the paint it should become, so the beam
// sweeps over a finished digit with two eyes in it. On the hour the alarm
// goes: the floodlights strobe, two beams criss-cross the wall, and when he
// has finished they find him at centre stage, where he puts his hands up and
// takes a bow.
//
// Digits are a kit on the cell grid, three cells by two rows: whole cells
// (ROM 0xff) for strokes and three bar tiles (top, top+middle, bottom), the
// seams between cells doubling as the joints between bricks. Tiles at any
// instant: the three bars as glowing paint, the lit wall and the three bars
// inside the beam (4), and the burglar (1): never more than 8. He paints a
// cell through kit states only (blank, bar, bars, full), so his work needs no
// tile of its own, and the order he paints cells in is searched so that no
// moment shows a valid time other than the old one or the new one.
//
// Everything is a function of the wall clock: the beam's sweep comes from the
// time of day, the burglar's minute is simulated from the minute's start
// (memoised), and the glow is read back from the beam's recent history.

import { noise } from '../js/kit.js';

// ------------------------------------------------------------------ geometry

const COLS = 16;
const BEAM_W = 3;               // cells lit by one beam
const HOME = { c: 15, r: 1 };   // the burglar's corner
const STAGE = { c: 5, r: 1 };   // centre stage, between hours and minutes

// Digit slots. H1 is the 12-hour clock's leading 1, one cell wide.
const SLOTS = [
  { key: 'H1', cols: [0] },
  { key: 'H2', cols: [2, 3, 4] },
  { key: 'M1', cols: [7, 8, 9] },
  { key: 'M2', cols: [11, 12, 13] },
];

// upper row / lower row, one letter per cell: F full, T top bar,
// M top + middle bar, B bottom bar, _ blank.
const DIGITS = {
  0: ['FTF', 'FBF'],
  1: ['__F', '__F'],
  2: ['MMF', 'FBB'],
  3: ['MMF', 'BBF'],
  4: ['F_F', 'TTF'],
  5: ['FMM', 'BBF'],
  6: ['FMM', 'FBF'],
  7: ['TTF', '__F'],
  8: ['FMF', 'FBF'],
  9: ['FMF', 'BBF'],
};
const DECODE = new Map(Object.entries(DIGITS).map(([d, [u, l]]) => [u + l, d]));

// Rows of a cell each part paints.
const PART_ROWS = {
  _: [],
  T: [0, 1, 2],
  M: [0, 1, 2, 6, 7],
  B: [5, 6, 7],
  F: [0, 1, 2, 3, 4, 5, 6, 7],
};
// The kit as a ladder: painting or scrubbing a cell steps along these edges,
// so every in-between state is itself a kit part.
const KIT_EDGES = { _: ['T', 'B'], T: ['_', 'M'], M: ['T', 'F'], B: ['_', 'F'], F: ['M', 'B'] };

const ON = '#####', OFF = '.....';
const partRows = (p) => Array.from({ length: 8 }, (_, r) => (PART_ROWS[p].includes(r) ? ON : OFF));

// The lit wall: a sparse stipple, so solid paint reads clearly inside it.
const WALL = [
  '#.#.#',
  '.....',
  '.#.#.',
  '.....',
  '#.#.#',
  '.....',
  '.#.#.',
  '.....',
];
// A painted part inside the beam: the paint solid, one clear row around it,
// the stipple elsewhere.
function litRows(p) {
  const on = PART_ROWS[p];
  return WALL.map((w, r) => (on.includes(r) ? ON : on.includes(r - 1) || on.includes(r + 1) ? OFF : w));
}

// ------------------------------------------------------------------ the burglar
//
// Each pose is a body mask (his silhouette) and the dots that are lit on him.
// In the dark only his lit dots show: beanie, eyes, white stripes. In the
// light the body is cut out of the lit wall as a dark silhouette, with the
// stripes and eyes still showing in it.

function pose(body, lit) {
  const b = body.trim().split(/\s+/), l = lit.trim().split(/\s+/);
  return { body: b, lit: l };
}
const mirror = (p) => ({
  body: p.body.map((r) => [...r].reverse().join('')),
  lit: p.lit.map((r) => [...r].reverse().join('')),
});

const POSE = {
  stand: pose(`
    .###. .###. .###. ##### .###. ##### .###. .#.#.`, `
    .###. .#.#. ..... ##### ..... ##### ..... .#.#.`),
  lookL: pose(`
    .###. .###. .###. ##### .###. ##### .###. .#.#.`, `
    .###. #.#.. ..... ##### ..... ##### ..... .#.#.`),
  blink: pose(`
    .###. .###. .###. ##### .###. ##### .###. .#.#.`, `
    .###. ..... ..... ##### ..... ##### ..... .#.#.`),
  walkA: pose(`
    .###. .###. .###. ##### .###. ##### .###. #...#`, `
    .###. #.#.. ..... ##### ..... ##### ..... #...#`),
  walkB: pose(`
    ..... .###. .###. .###. ##### .###. ##### .##..`, `
    ..... .###. #.#.. ..... ##### ..... ##### .##..`),
  // flattened against the wall, arms spread, eyes wide
  flat: pose(`
    .###. .###. ##### ##### ##### ##### .###. #...#`, `
    .###. .#.#. #...# ##### ..... ##### ..... #...#`),
  // brush raised to the left
  paintA: pose(`
    #.... ##### .#### .#### .###. ##### .###. .#.#.`, `
    #.... ##### ..#.# ..### ..... ##### ..... .#.#.`),
  paintB: pose(`
    ..... ##### ##### .#### .###. ##### .###. .#.#.`, `
    ..... #.### ##.#. ..### ..... ##### ..... .#.#.`),
  hop: pose(`
    ..... .###. .###. .###. ##### .###. ##### #...#`, `
    ..... .###. .#.#. ..... ##### ..... ##### #...#`),
  handsUp: pose(`
    #...# #.#.# ##### .###. ##### .###. ##### .#.#.`, `
    #...# #.#.# #.#.# ..... ##### ..... ##### .#.#.`),
  bow: pose(`
    ..... ..... ..... ##### ##### ##### .###. .#.#.`, `
    ..... ..... ..... ###.. ..... ##### ..... .#.#.`),
  startle: pose(`
    .###. .###. #.#.# ##### .###. ##### .###. .....`, `
    .###. .#.#. #.#.# ##### ..... ##### ..... .....`),
};
// directional poses, facing right
for (const k of ['lookL', 'walkA', 'walkB', 'paintA', 'paintB']) POSE[k + 'R'] = mirror(POSE[k]);

function posed(name, dir) {
  if (dir > 0 && POSE[name + 'R']) return POSE[name + 'R'];
  return POSE[name];
}

// Camouflage: he holds the shape of the paint the cell is about to become,
// with two eyes showing in it.
function camo(part, t) {
  const eyes = Math.floor(t / 0.6) % 3 === 2 ? '..#.#' : Math.floor(t / 0.6) % 3 === 1 ? '#.#..' : '.#.#.';
  const rows = partRows(part);
  const eyeRow = part === 'B' ? 6 : 1;
  if (part === '_') {
    const lit = rows.map((_, r) => (r === 2 ? eyes : OFF));
    return { body: lit.map(() => OFF), lit, eyesOnly: true };
  }
  const body = rows;
  const lit = rows.map((row, r) => (r === eyeRow ? [...row].map((ch, i) => (eyes[i] === '#' ? '.' : ch)).join('') : row));
  return { body, lit };
}

// ------------------------------------------------------------------ time

const DAY = 86400;
const wrapDay = (x) => ((x % DAY) + DAY) % DAY;
const minuteIndex = (sod) => Math.floor(wrapDay(sod) / 60);

function layoutFor(mi) {
  const m = ((mi % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), min = m % 60;
  const h12 = h % 12 || 12;
  const L = new Map();
  const digits = [h12 >= 10 ? 1 : null, h12 % 10, Math.floor(min / 10), min % 10];
  SLOTS.forEach((slot, i) => {
    const d = digits[i];
    slot.cols.forEach((c, j) => {
      for (let r = 0; r < 2; r++) {
        let p = '_';
        if (slot.key === 'H1') p = d === 1 ? 'F' : '_';
        else p = DIGITS[d][r][j];
        L.set(c + ',' + r, p);
      }
    });
  });
  return L;
}

function readTime(L) {
  let out = '';
  for (const slot of SLOTS) {
    const pat = [0, 1].map((r) => slot.cols.map((c) => L.get(c + ',' + r)).join('')).join('');
    if (slot.key === 'H1') {
      if (pat === 'FF') out += '1';
      else if (pat === '__') out += ' ';
      else return null;
    } else {
      const d = DECODE.get(pat);
      if (d === undefined) return null;
      out += d;
    }
  }
  return out;
}

// ------------------------------------------------------------------ the beam

const HALF = 4.0;               // one sweep across, including its dwell
const TRAVEL = 3.2;             // of which this is motion
const X0 = -3, X1 = 16;         // beam's left cell at each end, just off the glass
const LIFE = 3.0;               // how long the paint glows after the light leaves

// Trapezoidal speed profile: ease in, glide, ease out.
function glide(u) {
  const e = 0.18, v = 1 / (1 - e);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < e) return (v * u * u) / (2 * e);
  if (u > 1 - e) return 1 - (v * (1 - u) ** 2) / (2 * e);
  return v * (u - e / 2);
}

function sweepX(sod) {
  const k = Math.floor(sod / HALF);
  const u = sod / HALF - k;
  const travel = TRAVEL / HALF, dwell = 1 - travel;
  let m = Math.min(u, travel), wig = 0;
  if (noise(k, 3) < 0.45) {
    // the guard stops to look at something, and wobbles the lamp
    const a = travel * (0.2 + 0.6 * noise(k, 4));
    if (u < a) m = u;
    else if (u < a + dwell) { m = a; wig = Math.round(Math.sin(((u - a) * HALF * 2 * Math.PI) / 1.1)); }
    else m = u - dwell;
  }
  const s = glide(m / travel);
  const x = k % 2 === 0 ? X0 + (X1 - X0) * s : X1 - (X1 - X0) * s;
  return x + wig;
}

// The hour: strobe, then two beams criss-crossing, then a curtain call.
const STROBE = 2.4;
const SEARCH_HALF = 2.6;
const CONVERGE = 1.0, CAUGHT = 0.8, BOWS = 1.8, RELEASE = 1.6;
const tri = (x) => { const f = ((x % 2) + 2) % 2; return f < 1 ? f : 2 - f; };

function searchBeams(tm) {
  const s = glide(tri((tm - STROBE) / SEARCH_HALF));
  return [X0 + (X1 - X0) * s, X1 - (X1 - X0) * s];
}

function beamsAt(sod) {
  sod = wrapDay(sod);
  const mi = minuteIndex(sod);
  if (mi % 60 === 0) {
    const tm = sod - mi * 60;
    const strobeOn = tm < STROBE;
    if (strobeOn) return { lefts: [], flood: tm % 0.8 < 0.4 };
    const sim = simFor(mi);
    const D = sim.stageAt - mi * 60;
    if (tm < D) return { lefts: searchBeams(tm).map(Math.round), flood: false };
    const [a0, b0] = searchBeams(D);
    const ta = STAGE.c - 1, tb = STAGE.c;
    if (tm < D + CONVERGE) {
      const u = glide((tm - D) / CONVERGE);
      return { lefts: [a0 + (ta - a0) * u, b0 + (tb - b0) * u].map(Math.round), flood: false };
    }
    const held = D + CONVERGE + CAUGHT + BOWS;
    if (tm < held) return { lefts: [ta, tb], flood: false };
    if (tm < held + RELEASE) {
      const u = glide((tm - held) / RELEASE);
      const xa = sweepX(sod);
      return { lefts: [ta + (xa - ta) * u, tb + (X1 + 2 - tb) * u].map(Math.round), flood: false };
    }
  }
  return { lefts: [Math.round(sweepX(sod))], flood: false };
}

const litCol = (B, c) => B.flood || B.lefts.some((b) => c >= b && c < b + BEAM_W);
const nearCol = (B, c) => B.flood || B.lefts.some((b) => c >= b - 1 && c < b + BEAM_W + 1);

// ------------------------------------------------------------------ the job

// Every simple path through the kit from part a to part b, short ones first.
function kitPaths(a, b) {
  const out = [];
  const walk = (p, path) => {
    if (p === b) { out.push(path); return; }
    if (path.length > 4) return;
    for (const n of KIT_EDGES[p]) if (!path.includes(n)) walk(n, [...path, n]);
  };
  walk(a, [a]);
  return out.sort((x, y) => x.length - y.length).filter((p) => p.length <= out[0].length + 1);
}

const colOf = (key) => Number(key.split(',')[0]);
const rowOf = (key) => Number(key.split(',')[1]);

// Order the changed cells (and pick how each is painted) so that every
// intermediate wall reads as the old time, the new time, or no time at all.
function planJobs(oldL, newL) {
  const keys = [...newL.keys()].filter((k) => oldL.get(k) !== newL.get(k));
  const oldT = readTime(oldL), newT = readTime(newL);
  const state = new Map(oldL);
  const ok = () => { const v = readTime(state); return v === null || v === oldT || v === newT; };
  const seen = new Set();
  const order = [];
  const dfs = (pos, left) => {
    if (left.length === 0) return true;
    const memo = left.join('|');
    if (seen.has(memo)) return false;
    const cand = [...left].sort((a, b) =>
      Math.abs(colOf(a) - pos.c) + Math.abs(rowOf(a) - pos.r) - (Math.abs(colOf(b) - pos.c) + Math.abs(rowOf(b) - pos.r)));
    for (const k of cand) {
      for (const path of kitPaths(oldL.get(k), newL.get(k))) {
        let good = true;
        for (const p of path.slice(1)) { state.set(k, p); if (!ok()) { good = false; break; } }
        if (good) {
          order.push({ key: k, path });
          if (dfs({ c: colOf(k), r: rowOf(k) }, left.filter((x) => x !== k))) return true;
          order.pop();
        }
        state.set(k, oldL.get(k));
      }
    }
    seen.add(memo);
    return false;
  };
  if (!dfs(HOME, keys)) {
    // Should not happen (checked over the whole day); paint nearest-first.
    order.length = 0;
    for (const k of keys) order.push({ key: k, path: kitPaths(oldL.get(k), newL.get(k))[0] });
  }
  return order;
}

// ------------------------------------------------------------------ the burglar's minute

const DT = 0.05;
const STEP_T = 0.24, HOP_T = 0.3, PREP_T = 0.3, WORK_T = 0.32, RELIEF_T = 0.35;

// A program is a list of actions on his own clock, which only runs while the
// light is away from him.
function walkTo(prog, from, to, freeze = true) {
  let { c, r } = from;
  while (c !== to.c) {
    const dir = Math.sign(to.c - c);
    prog.push({ type: 'walk', from: { c, r }, to: { c: c + dir, r }, dir, dur: STEP_T, freeze });
    c += dir;
  }
  if (r !== to.r) {
    prog.push({ type: 'hop', from: { c, r }, to: { c, r: to.r }, dir: 0, dur: HOP_T, freeze });
    r = to.r;
  }
  return { c, r };
}

function standFor(key, pos) {
  const c = colOf(key), r = rowOf(key);
  let s = pos.c > c ? c + 1 : c - 1;
  if (s > COLS - 1) s = c - 1;
  if (s < 0) s = c + 1;
  return { c: s, r };
}

function idleActs(prog, mi, from, endBy) {
  // fill the rest of the minute with small business in his corner
  let t = prog.reduce((a, x) => a + x.dur, 0);
  let j = 0;
  const push = (a) => { prog.push(a); t += a.dur; };
  while (t < endBy - 6) {
    const n = noise(mi * 31 + j, 7);
    const wait = 2 + 3 * noise(mi * 31 + j, 8);
    push({ type: 'home', at: HOME, dur: wait, freeze: true, blink: true });
    if (n < 0.35) {
      // tiptoe out and peer at the wall
      walkTo(prog, HOME, { c: 13, r: 1 });
      push({ type: 'pose', at: { c: 13, r: 1 }, pose: 'lookL', dir: -1, dur: 1.0, freeze: true });
      push({ type: 'pose', at: { c: 13, r: 1 }, pose: 'stand', dir: 0, dur: 0.5, freeze: true });
      walkTo(prog, { c: 13, r: 1 }, HOME);
    } else if (n < 0.6) {
      // up the wall for a look round
      prog.push({ type: 'hop', from: HOME, to: { c: 15, r: 0 }, dir: 0, dur: HOP_T, freeze: true });
      push({ type: 'pose', at: { c: 15, r: 0 }, pose: 'lookL', dir: -1, dur: 1.2, freeze: true });
      prog.push({ type: 'hop', from: { c: 15, r: 0 }, to: HOME, dir: 0, dur: HOP_T, freeze: true });
    } else if (n < 0.8) {
      push({ type: 'pose', at: HOME, pose: 'handsUp', dir: 0, dur: 0.6, freeze: true }); // stretch
      push({ type: 'pose', at: HOME, pose: 'stand', dir: 0, dur: 0.4, freeze: true });
    } else {
      push({ type: 'pose', at: HOME, pose: 'lookL', dir: -1, dur: 0.8, freeze: true });
      push({ type: 'pose', at: HOME, pose: 'stand', dir: 0, dur: 0.3, freeze: true });
    }
    t = prog.reduce((a, x) => a + x.dur, 0);
    j++;
  }
  prog.push({ type: 'home', at: HOME, dur: 1e6, freeze: true, blink: true });
}

const SIMS = new Map();

function simFor(mi) {
  mi = ((mi % 1440) + 1440) % 1440;
  if (SIMS.has(mi)) return SIMS.get(mi);
  const hour = mi % 60 === 0;
  const t0 = mi * 60;
  const oldL = layoutFor(mi - 1), newL = layoutFor(mi);
  const jobs = planJobs(oldL, newL);

  const prog = [];
  if (hour) prog.push({ type: 'pose', at: HOME, pose: 'startle', dir: 0, dur: STROBE, freeze: false });
  else {
    prog.push({ type: 'pose', at: HOME, pose: 'stand', dir: 0, dur: 0.4, freeze: false });
    prog.push({ type: 'pose', at: HOME, pose: 'lookL', dir: -1, dur: 0.4, freeze: true });
  }
  let pos = { ...HOME };
  for (const job of jobs) {
    const stand = standFor(job.key, pos);
    pos = walkTo(prog, pos, stand);
    const dir = Math.sign(colOf(job.key) - stand.c);
    prog.push({ type: 'prep', at: stand, job, dir, dur: PREP_T, freeze: true });
    job.path.slice(1).forEach((part, i) => {
      prog.push({ type: 'work', at: stand, job, step: i + 1, dir, dur: WORK_T, freeze: true });
    });
  }
  if (hour) {
    pos = walkTo(prog, pos, STAGE);
    prog.push({ type: 'stage', at: STAGE, dur: 0, freeze: false });
    prog.push({ type: 'pose', at: STAGE, pose: 'flat', dir: 0, dur: CONVERGE, freeze: false });
    prog.push({ type: 'pose', at: STAGE, pose: 'handsUp', dir: 0, dur: CAUGHT, freeze: false });
    prog.push({ type: 'bow', at: STAGE, dur: BOWS, freeze: false });
    prog.push({ type: 'pose', at: STAGE, pose: 'stand', dir: 0, dur: 0.4, freeze: false });
    pos = walkTo(prog, pos, HOME, false);
  } else {
    pos = walkTo(prog, pos, HOME);
  }
  prog.push({ type: 'pose', at: HOME, pose: 'stand', dir: 0, dur: 0.3, freeze: false });
  const busy = prog.length;
  idleActs(prog, mi, HOME, 58);

  // program start times
  let acc = 0;
  for (const a of prog) { a.start = acc; acc += a.dur; }

  const sim = { mi, t0, hour, oldL, newL, jobs, prog, busy, ticks: [], paints: [], stageAt: Infinity, end: Infinity };
  SIMS.set(mi, sim);

  // run his clock against the light
  let pc = 0, relief = 0, wasFrozen = false, ai = 0;
  const nT = Math.round(60 / DT);
  const stageAct = prog.find((a) => a.type === 'stage');
  for (let i = 0; i < nT; i++) {
    const tau = t0 + i * DT;
    while (ai < prog.length - 1 && pc >= prog[ai].start + prog[ai].dur) ai++;
    const act = prog[ai];
    const at = actPos(act, pc);
    let frozen = false;
    if (act.freeze) {
      const B = hour && (stageAct === undefined || pc < stageAct.start)
        ? { lefts: tau - t0 < STROBE ? [] : searchBeams(tau - t0).map(Math.round), flood: false }
        : beamsAt(tau);
      const cells = [at.c];
      if (act.type === 'prep' || act.type === 'work') cells.push(colOf(act.job.key));
      frozen = cells.some((c) => nearCol(B, c));
    }
    sim.ticks.push({ pc, frozen, relief: !frozen && relief > 0 });
    if (frozen) { wasFrozen = true; relief = RELIEF_T; continue; }
    if (relief > 0) { relief -= DT; continue; }
    const before = pc;
    pc += DT;
    // log paint strokes as they land, in real time
    for (let a = ai; a < prog.length && prog[a].start < pc; a++) {
      const x = prog[a];
      if (x.type === 'work' && x.start >= before && x.start < pc) sim.paints.push({ key: x.job.key, t: tau + DT });
      if (x.type === 'stage' && x.start >= before - 1e-9 && x.start < pc && sim.stageAt === Infinity) sim.stageAt = tau + DT;
    }
    if (sim.end === Infinity && pc >= prog[busy - 1].start + prog[busy - 1].dur) sim.end = tau + DT;
  }
  void wasFrozen;
  return sim;
}

function actPos(act, pc) {
  if (act.type === 'walk' || act.type === 'hop') return pc - act.start < act.dur / 2 ? act.from : act.to;
  return act.at;
}

// Paint state of every cell, and the burglar, at real time `sod`.
function sceneAt(sod) {
  const mi = minuteIndex(sod);
  const sim = simFor(mi);
  const i = Math.min(sim.ticks.length - 1, Math.max(0, Math.floor((wrapDay(sod) - sim.t0) / DT + 1e-6)));
  const tick = sim.ticks[i];
  const pc = tick.pc;
  const L = new Map(sim.oldL);
  let current = null;
  for (const a of sim.prog) {
    if (a.start > pc) break;
    if (a.type === 'work') L.set(a.job.key, a.job.path[a.step]);
    if (a.start + a.dur > pc) { current = a; break; }
  }
  // every job whose program has fully passed is finished
  for (const a of sim.prog) if (a.type === 'work' && a.start + a.dur <= pc) L.set(a.job.key, a.job.path[a.step]);
  current ??= sim.prog[sim.prog.length - 1];

  const local = wrapDay(sod) - sim.t0;
  const at = actPos(current, pc);
  let thief = { c: at.c, r: at.r, pose: POSE.stand };
  const ph = Math.floor(local / 0.3) % 2;
  switch (current.type) {
    case 'walk': thief.pose = posed(pc - current.start < current.dur / 2 ? 'walkA' : 'walkB', current.dir); break;
    case 'hop': thief.pose = POSE.hop; break;
    case 'prep': thief.pose = posed('lookL', current.dir); break;
    case 'work': thief.pose = posed(ph ? 'paintA' : 'paintB', current.dir); break;
    case 'bow': thief.pose = Math.floor((pc - current.start) / 0.45) % 2 ? POSE.stand : POSE.bow; break;
    case 'home': thief.pose = (local % 3.1) > 2.8 ? POSE.blink : POSE.stand; break;
    case 'pose': thief.pose = posed(current.pose, current.dir); break;
    default: break;
  }
  if (tick.frozen) {
    if (current.type === 'prep' || current.type === 'work') {
      thief = { c: colOf(current.job.key), r: rowOf(current.job.key), pose: camo(current.job.path[current.job.path.length - 1], local) };
    } else thief.pose = POSE.flat;
  } else if (tick.relief) thief.pose = POSE.blink;

  return { sim, L, thief };
}

// ------------------------------------------------------------------ glow

const H_DT = 0.1, H_N = 120;

function glowing(sod, L, sims) {
  // charges per column per sample (beam), plus paint strokes per cell
  const cover = [];
  for (let k = 0; k <= H_N; k++) {
    const B = beamsAt(sod - k * H_DT);
    cover.push(Array.from({ length: COLS }, (_, c) => litCol(B, c)));
  }
  const painted = new Map();
  for (const s of sims) for (const p of s.paints) {
    const age = wrapDay(sod - p.t + DAY / 2) - DAY / 2;   // seconds ago, wrap-safe
    if (age >= 0 && age <= H_N * H_DT) {
      const k = Math.floor(age / H_DT);
      if (!painted.has(p.key)) painted.set(p.key, new Set());
      painted.get(p.key).add(k);
    }
  }
  const pos = new Set();
  for (const slot of SLOTS) {
    const keys = slot.cols.flatMap((c) => [c + ',0', c + ',1']);
    const charged = (k, key) => cover[k][colOf(key)] || painted.get(key)?.has(k);
    const any = (k) => keys.some((key) => charged(k, key));
    let first = -1;
    for (let k = 0; k <= H_N; k++) if (any(k)) { first = k; break; }
    if (first < 0 || first * H_DT >= LIFE) continue;
    let start = first, prev = first;
    for (let k = first + 1; k <= H_N; k++) {
      if (any(k)) { if ((k - prev) * H_DT >= LIFE) break; prev = k; start = k; }
    }
    for (const key of keys) {
      let c = false;
      for (let k = 0; k <= start && !c; k++) c = charged(k, key);
      if (c || start >= H_N - 1) pos.add(key);
    }
  }
  return pos;
}

// ------------------------------------------------------------------ drawing

const full = () => Array.from({ length: 8 }, () => ON);
const empty = () => Array.from({ length: 8 }, () => OFF);

function composite(bg, spr, lit) {
  return bg.map((row, r) => [...row].map((ch, i) => {
    if (spr.lit[r][i] === '#') return '#';
    if (spr.body[r][i] === '#') return '.';
    if (spr.eyesOnly && lit) {
      // keep a clear ring round the eyes so they don't mix with the stipple
      for (let dr = -1; dr <= 1; dr++) for (let di = -1; di <= 1; di++) {
        if (spr.lit[r + dr]?.[i + di] === '#') return '.';
      }
    }
    return ch;
  }).join(''));
}

export default {
  name: 'Searchlight',
  blurb: 'Glow paint on a prison wall, charged by a sweeping searchlight; a burglar repaints the minute between sweeps and freezes as paint when it finds him.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,

  frame(lcd, api, ctx) {
    const f = ctx.fields;
    const sod = f.h * 3600 + f.m * 60 + f.s + f.ms / 1000;
    const { sim, L, thief } = sceneAt(sod);
    const B = beamsAt(sod);
    const glow = glowing(sod, L, [sim, simFor(sim.mi - 1)]);

    // what each cell is, before the burglar
    const cells = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < COLS; c++) {
      const key = c + ',' + r;
      const p = L.get(key) ?? '_';
      const lit = litCol(B, c);
      let cell;
      if (lit) cell = p === 'F' ? { rom: 0xff, rows: full() } : { tile: p === '_' ? WALL : litRows(p), rank: 2 };
      else if (glow.has(key) && p !== '_') cell = p === 'F' ? { rom: 0xff, rows: full() } : { tile: partRows(p), rank: 0 };
      else cell = { rom: 0x20, rows: empty() };
      cell.rows ??= cell.tile;
      cell.c = c; cell.r = r; cell.lit = lit;
      cells.push(cell);
    }
    const tc = cells[thief.r * COLS + thief.c];
    const glowBg = tc.rom !== 0x20 || tc.tile;
    cells[thief.r * COLS + thief.c] = { ...tc, rom: undefined, tile: composite(tc.rows, thief.pose, glowBg), rank: 1 };

    // paint first, then the burglar, then the light
    const codes = new Array(cells.length);
    const order = cells.map((x, i) => i).filter((i) => cells[i].tile).sort((a, b) => cells[a].rank - cells[b].rank);
    const alloc = new api.TileAllocator(lcd, 0);
    for (const i of order) codes[i] = alloc.add(cells[i].tile);
    alloc.flush();
    for (let r = 0; r < 2; r++) {
      lcd.setCursor(0, r);
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c, cell = cells[i];
        lcd.data(cell.tile ? codes[i] ?? 0x20 : cell.rom);
      }
    }
  },
};
