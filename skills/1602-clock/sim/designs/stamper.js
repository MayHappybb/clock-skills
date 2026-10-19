// Stamper — a bored office clerk whose job is stamping the time.
//
// The minutes are two ink impressions on little tear-off pads on his desk
// (bottom row); the hour is two slips pinned to the wall behind him (top
// row, far left). Every impression comes off the same worn rubber stamp, so
// a digit always prints with the same skips in its ink.
//
// All minute he idles at his desk: blinks, drums his fingers, sips from his
// mug (it steams), yawns, glances up at the hour on the wall and across at
// the in-tray, which grows a sheet every few minutes; he dozes off, or
// twirls the stamp and peers at its rubber. Near the end of the minute he
// picks the stamp up off the ink pad, dabs it twice, scoots his chair over to
// the pad that is about to change and hovers, squinting.
//
// The minute turn: the old sheet flips over and drops off its pad, the stamp
// comes down THUNK (the desk jumps: everything on it hops a dot), and lifts
// off a fresh impression, wet ink bleeding round it for a moment. When the
// tens change as well he tears off both sheets first and stamps the tens
// before the ones, so the glass shows the old time, a blank, or the new one,
// never a mix.
//
// The hour: a giant stamp comes down from above the glass onto the wall and
// prints the new hour, the whole office jolts, and the full in-tray topples:
// an avalanche of paperwork flies across the desk, one sheet landing on his
// head. He finishes the minutes blind, shakes it off, then stamps every
// sheet on the desk in a frenzy and flings them off the edge.
//
// Tiles: digits first (one tile per distinct digit, shared by the wall and
// the desk), then the moving stamp, the head, the mug, the parked stamp and
// the in-tray (which falls back to a ROM '=' if no slot is left). Flying
// paper, the ink pad and the steam are ROM.
// Everything is a function of the wall clock.

import { noise } from '../js/kit.js';

// ------------------------------------------------------------------ glyphs

const bits = (s) => [...s].reduce((v, ch) => (v << 1) | (ch === '#' ? 1 : 0), 0);
const B = (rows) => rows.map(bits);
const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];

// The stamp's rubber: a bold 5x7 face, two-dot stems, with the skips a worn
// rubber leaves (one dot per digit, always the same one). Row 7 is the
// slip's lower edge.
const DIG = {
  0: ['.###.', '##.##', '##.##', '##..#', '##.##', '##.##', '.###.'],
  1: ['.##..', '###..', '.##..', '.##..', '.#...', '.##..', '####.'],
  2: ['.###.', '##.##', '...##', '..##.', '.#...', '##...', '#####'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...#.', '####.'],
  4: ['##.##', '##.##', '##.##', '#####', '...##', '...#.', '...##'],
  5: ['#####', '##...', '####.', '...##', '...##', '#..##', '.###.'],
  6: ['..##.', '.##..', '##...', '####.', '##.##', '#..##', '.###.'],
  7: ['#####', '...##', '...#.', '..##.', '..##.', '.##..', '.##..'],
  8: ['.###.', '##.##', '#..##', '.###.', '##.##', '##.##', '.###.'],
  9: ['.###.', '##.##', '##.##', '.####', '...#.', '..##.', '.##..'],
};
const EDGE = '#####';
const digitTile = (d) => B([...DIG[d], EDGE]);
const BLANK = B(['.....', '.....', '.....', '.....', '.....', '.....', '.....', EDGE]);
// The torn sheet falling off the pad: its back is blank, drawn as a frame.
const DROP = [
  B(['.....', '....#', '...##', '..##.', '.##..', '##...', '#....', EDGE]),
  B(['.....', '.....', '.....', '.....', '....#', '...#.', '..#..', EDGE]),
  B(['.....', '.....', '.....', '.....', '.....', '.....', '.....', '.###.']),
];
// Wet ink: the fresh impression with a few dots spread round it.
function bleedTile(d, k) {
  const t = digitTile(d);
  const out = t.slice();
  for (let r = 0; r < 7; r++) {
    const spread = ((t[r] << 1) | (t[r] >> 1)) & 0x1f;
    const keep = Math.floor(noise(d * 13 + r * 3.7 + k, 5) * 32) & spread;
    out[r] |= keep & ~t[r] & (noise(d + r * 1.3 + k, 9) < 0.5 ? 0x1f : 0x0a);
  }
  return out;
}

// The clerk: an accountant's eyeshade, eyes under the brim, shoulders on the
// desk edge. Faces are rows 0-5; rows 6-7 are his shoulders.
const SHOULDERS = ['##.##', '#####'];      // collar either side of the tie
// Rows: crown, eyeshade brim, its shadow, eyes, cheeks, mouth.
const FACE = {
  idle:   ['.###.', '#####', '.....', '.#.#.', '.....', '..#..'],
  blink:  ['.###.', '#####', '.....', '.....', '.....', '..#..'],
  bored:  ['.###.', '#####', '.....', '##.##', '.....', '.###.'],
  lookL:  ['.###.', '#####', '.....', '#.#..', '.....', '..#..'],
  lookR:  ['.###.', '#####', '.....', '..#.#', '.....', '..#..'],
  lookUp: ['.###.', '#####', '#.#..', '.....', '.....', '..#..'],
  squint: ['.###.', '#####', '.....', '##.##', '.....', '.##..'],
  grit:   ['.###.', '#####', '.....', '##.##', '.....', '#####'],
  happy:  ['.###.', '#####', '.....', '.#.#.', '#...#', '.###.'],
  yawn1:  ['.###.', '#####', '.....', '##.##', '..#..', '.#.#.'],
  yawn2:  ['.###.', '#####', '##.##', '.###.', '#...#', '.###.'],
  sip:    ['.###.', '#####', '.....', '##.##', '.....', '...##'],
  ahh:    ['.###.', '#####', '.....', '##.##', '.###.', '.###.'],
  sleep:  ['.###.', '#####', '.....', '##.##', '.....', '.....'],
  nod:    ['.....', '.###.', '#####', '.....', '##.##', '.....'],
  shock:  ['#.#.#', '#####', '.....', '#.#.#', '.###.', '.###.'],
  sweat:  ['.###.', '#####', '....#', '.#.#.', '.....', '.###.'],
  paper:  ['#####', '#...#', '#####', '.#.#.', '.....', '.###.'],
};
function headTile(face, jolt) {
  const rows = B([...(FACE[face] ?? FACE.idle), ...SHOULDERS]);
  return jolt ? [...rows.slice(1), 0] : rows;
}

// What the hand holds, as sprites: rows from the top, drawn at a dot row y
// over both character rows (0-15), in one column. `grip` is the row the arm
// leaves from.
const SPRITE = {
  stamp:  { rows: ['..#..', '.###.', '..#..', '.###.', '#####', '#####', '#.#.#'], grip: 1 },
  side:   { rows: ['.....', '##...', '###.#', '#####', '###.#', '##...'], grip: 3 },
  up:     { rows: ['#####', '#####', '.###.', '..#..', '.###.', '..#..'], grip: 4 },
  mug:    { rows: ['.....', '####.', '###.#', '###.#', '####.', '.##..', '.....'], grip: 3 },
  tilt:   { rows: ['.....', '.....', '.##..', '####.', '.####', '..###', '...#.'], grip: 5 },
  rest:   { rows: ['.....', '.....', '.....', '.....', '.....', '.....', '#####', '..###'], grip: 9 },
  drum0:  { rows: ['.....', '.....', '.....', '.....', '.....', '#....', '.####', '..###'], grip: 9 },
  drum1:  { rows: ['.....', '.....', '.....', '.....', '.....', '.....', '#####', '..###'], grip: 9 },
  pat:    { rows: ['.....', '.....', '.##..', '####.', '####.', '.##..', '.....', '.....'], grip: 3 },
};
// The giant hour stamp: two cells of rubber block, its handle off the top.
const GIANT = ['#####', '#####', '#####', '#####', '#####', '#####', '#.#.#', '.###.'];

// The mug on the desk, and the steam off it (ROM).
const MUGT = B(['.....', '.....', '.....', '####.', '###.#', '###.#', '####.', '.##..']);

// The in-tray: a pile that grows a sheet every nine minutes and topples on the hour.
const PILE = ['####.', '.####', '#####', '###..', '.####', '####.', '.###.'];
function trayTile(n, wobble) {
  const out = EMPTY.slice();
  out[7] = bits('#####'); out[6] = bits('#...#');          // the tray, side on
  for (let k = 0; k < n; k++) {
    let row = bits(PILE[k]);
    if (wobble && k >= n - 3) row = wobble > 0 ? row >> 1 : (row << 1) & 0x1f;
    out[5 - k] = row;
  }
  return out.map((v, i) => (i < 0 ? 0 : v));
}

// A sheet of the avalanche once he has stamped it: a smudge of ink.
const DONE = B(['.....', '#####', '#.#.#', '##.##', '#.#.#', '#####', '.....', '#####']);
// The hour's avalanche: sheets that fall past the right of the desk.
const RAIN = [
  { c: 14, t0: 0.30, land: true }, { c: 12, t0: 0.40, land: true }, { c: 13, t0: 0.50 },
  { c: 10, t0: 0.60, land: true }, { c: 11, t0: 0.75 }, { c: 14, t0: 0.95 }, { c: 12, t0: 1.15 },
  { c: 13, t0: 1.35 }, { c: 10, t0: 1.6 },
];
const F0 = 3.0;          // the frenzy starts

// ROM props
const PAD = 0x5f;        // the ink pad, a low strip
const SHEET = 0xdb;      // a loose sheet of paper
const STEAM = [0x27, 0x60, 0xde, 0x20];
const TUMBLE = [0xdb, 0x2f, 0xb0, 0x7c];
const ZED = [0x7a, 0x20, 0x5a, 0x20];
const SPARK = 0x2a;
const TRAY_ROM = 0x3d;   // the in-tray when no slot is free

// ------------------------------------------------------------------ layout

const HC = [1, 2];                 // the hour on the wall, row 0
const MC = [6, 7];                 // the minutes on the desk, row 1
const PADC = 9, MUGC = 11, TRAYC = 13;
const HOME = 10;                   // the clerk's head at rest
const PILE_AT = [10, 12, 14];      // where the avalanche lands on the desk

const pad2 = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------------ the clerk
//
// A pose is { head, face, hand: { col, y, kind } | null, parked, mug, zed }.

const NEUTRAL = { head: HOME, face: 'idle', hand: null, parked: true, mug: true };
const hold = (col, y, kind = 'stamp') => ({ col, y, kind });

// Idle routines, each starting and ending in NEUTRAL. lt is local time.
const ROUTINES = {
  drum: { dur: 6, at(lt) {
    // picks the stamp up and taps it on the pad, bored
    if (lt < 0.4 || lt >= 5.4) return { ...NEUTRAL, parked: false, hand: hold(PADC, 8) };
    const up = Math.floor((lt - 0.4) / 0.5) % 2 === 0;
    return { ...NEUTRAL, parked: false, face: lt < 3 ? 'bored' : 'lookR', hand: hold(PADC, up ? 0 : 8) };
  } },
  sip: { dur: 6, at(lt) {
    if (lt < 0.5) return { ...NEUTRAL, face: 'lookR' };
    if (lt < 1.0) return { ...NEUTRAL, mug: false, hand: { col: MUGC, y: 0, kind: 'mug' } };
    if (lt < 3.2) return { ...NEUTRAL, mug: false, face: 'sip', hand: { col: MUGC, y: 0, kind: 'tilt' } };
    if (lt < 3.9) return { ...NEUTRAL, mug: false, face: 'ahh', hand: { col: MUGC, y: 0, kind: 'mug' } };
    if (lt < 4.4) return { ...NEUTRAL, face: 'ahh' };
    return { ...NEUTRAL, face: lt < 5 ? 'happy' : 'idle' };
  } },
  yawn: { dur: 5, at(lt) {
    if (lt < 0.5) return { ...NEUTRAL, face: 'yawn1' };
    if (lt < 2.2) return { ...NEUTRAL, face: 'yawn2' };
    if (lt < 2.7) return { ...NEUTRAL, face: 'yawn1' };
    return { ...NEUTRAL, face: lt < 3.6 ? 'bored' : 'idle' };
  } },
  glance: { dur: 5, at(lt) {
    const face = lt < 1.6 ? 'lookUp' : lt < 2.4 ? 'bored' : lt < 3.6 ? 'lookR' : 'idle';
    return { ...NEUTRAL, face };
  } },
  doze: { dur: 9, at(lt) {
    if (lt < 1.0) return { ...NEUTRAL, face: 'bored' };
    if (lt < 6.5) {
      const nod = Math.floor((lt - 1) / 1.2) % 2 === 1;
      return { ...NEUTRAL, face: nod ? 'nod' : 'sleep', zed: ZED[Math.floor((lt - 1) / 0.6) % 4] };
    }
    if (lt < 7.0) return { ...NEUTRAL, face: 'shock' };
    if (lt < 7.6) return { ...NEUTRAL, face: 'lookL' };
    if (lt < 8.2) return { ...NEUTRAL, face: 'lookR' };
    return NEUTRAL;
  } },
  twirl: { dur: 6, at(lt) {
    if (lt < 0.5) return { ...NEUTRAL, parked: false, hand: hold(PADC, 8) };
    if (lt < 4.2) {
      const k = lt < 1.0 ? 0 : Math.floor((lt - 1.0) / 0.35);
      const seq = ['stamp', 'side', 'up', 'up', 'up', 'side', 'stamp', 'side', 'up', 'stamp', 'stamp'];
      const kind = seq[Math.min(k, seq.length - 1)];
      return { ...NEUTRAL, parked: false, face: kind === 'up' ? 'squint' : 'idle', hand: hold(PADC, 0, kind) };
    }
    if (lt < 4.7) return { ...NEUTRAL, parked: false, hand: hold(PADC, 8) };
    return NEUTRAL;
  } },
};
const NAMES = Object.keys(ROUTINES);

function idlePose(u, E, mIndex, hour) {
  // Lay routines end to end from E to 52, with neutral gaps between.
  let t = E + 1.0, k = 0;
  const night = hour < 7 || hour >= 22;
  while (t < 52) {
    const r = noise(mIndex * 3.17 + k * 1.91, 4);
    let name = NAMES[Math.floor(r * NAMES.length)];
    if (night && noise(mIndex + k * 7.3, 8) < 0.5) name = 'doze';
    const R = ROUTINES[name];
    if (t + R.dur > 52) break;
    if (u >= t && u < t + R.dur) return R.at(u - t);
    t += R.dur + 1.2 + noise(mIndex * 1.3 + k, 6) * 2.0;
    k++;
  }
  return NEUTRAL;
}

// Blinks over idle faces, every few seconds.
function blink(face, T) {
  if (face !== 'idle' && face !== 'bored') return face;
  const k = Math.floor(T / 3.3);
  const at = k * 3.3 + noise(k, 3) * 2.5;
  return T >= at && T < at + 0.25 ? 'blink' : face;
}

// ------------------------------------------------------------------ the minute
//
// A stamping: the sheet flips and drops at f, the stamp falls at s and lifts
// at s + 0.4, the fresh print bleeds until s + 1.0.

function stampY(u, s) {
  if (u < s) return 0;
  if (u < s + 0.1) return 4;
  if (u < s + 0.4) return 8;
  if (u < s + 0.5) return 4;
  return 0;
}

function slotState(u, flip, s, d) {
  if (u < flip) return null;                        // the old sheet, untouched
  if (u >= s + 0.4) return u < s + 1.0 ? { bleed: d, k: Math.floor((u - s) / 0.3) } : { digit: d };
  if (u < flip + 0.2) return { tile: DROP[0] };
  if (u < flip + 0.35) return { tile: DROP[1] };
  if (u < flip + 0.5) return { tile: DROP[2] };
  return { tile: BLANK };
}

// The plan for this minute: what changed at its start, and how it goes.
function turnPlan(prev, now) {
  const ones = { slot: 1, flip: 0, s: 0.45, d: now.mm[1] };
  if (prev.mm[0] === now.mm[0]) {
    return { slots: [ones], E: 3.0, hour: false,
      clerk: [[0, 8, 7], [1.4, 9, 8], [1.8, HOME, PADC]] };
  }
  const tens = { slot: 0, flip: 0.3, s: 0.75, d: now.mm[0] };
  ones.s = 1.85;
  const hour = prev.hh !== now.hh;
  return { slots: [ones, tens], hour, E: hour ? 10.0 : 4.4,
    clerk: [[0, 8, 7], [0.3, 7, 6], [1.55, 8, 7], [2.8, 9, 8], [3.2, HOME, PADC]] };
}

// Where his head is during the turn: [time, head, hand] keyframes.
const at = (keys, u) => { let k = keys[0]; for (const q of keys) if (u >= q[0]) k = q; return k; };

// ------------------------------------------------------------------ design

export default {
  name: 'Stamper',
  blurb: 'A bored clerk stamps the time: minutes are ink impressions on his desk pads, the hour is pinned on the wall; each minute THUNK, and on the hour a giant stamp and an avalanche of paperwork.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const M = Math.floor(T / 60), u = T - M * 60;
    const f = (mm) => kit.clockFields(new Date(midnight.getTime() + mm * 60000));
    const now = f(M), prev = f(M - 1), next = f(M + 1);
    const mIndex = M + 1440 * (Math.floor(midnight.getTime() / 86400000) % 7);

    const plan = turnPlan(prev, now);
    const nextPlan = turnPlan(now, next);
    const shown = { h: [now.hh[0], now.hh[1]], m: [now.mm[0], now.mm[1]] };

    // ---------------------------------------------------- the clerk's pose
    let pose;
    let stampCol = null, sy = 0;                     // the stamp in his hand, during a turn
    let jolt = false, giantY = null, sparks = false;
    const slot = [null, null];                       // minute pads' override states
    if (u < plan.E) {
      // the turn
      for (const sl of plan.slots) slot[sl.slot] = slotState(u, sl.flip, sl.s, sl.d);
      const k = at(plan.clerk, u);
      // the stamp falls on whichever pad it is over
      let y = 0;
      for (const sl of plan.slots) if (MC[sl.slot] === k[2]) y = Math.max(y, stampY(u, sl.s));
      for (const sl of plan.slots) if (u >= sl.s + 0.1 && u < sl.s + 0.3) jolt = true;
      const firstS = Math.min(...plan.slots.map((s) => s.s));
      const lastS = Math.max(...plan.slots.map((s) => s.s));
      let face = u < firstS + 0.1 ? 'squint' : y === 8 ? 'grit' : u < lastS + 1.6 ? 'happy' : 'idle';
      if (u < lastS + 0.4 && y < 8 && u > firstS + 0.5) face = 'squint';
      const parkAt = plan.clerk[plan.clerk.length - 1][0] + 0.4;
      if (u >= parkAt + 0.4) pose = { ...NEUTRAL, face: 'idle' };
      else if (u >= parkAt) pose = { ...NEUTRAL, face, parked: false, hand: hold(PADC, 8) };
      else pose = { head: k[1], face, hand: hold(k[2], y), parked: false, mug: true };
      if (plan.hour) {
        // the giant stamp prints the hour
        giantY = u < 0.1 ? -6 : u < 0.2 ? -3 : u < 0.8 ? 0 : u < 0.9 ? -3 : u < 1.0 ? -6 : null;
        if (u >= 0.2 && u < 0.45) { jolt = true; sparks = true; }
      }
    } else if (u < 52.5) {
      pose = idlePose(u, plan.E, mIndex, now.h);
    } else {
      // getting ready for the next turn
      const first = MC[1];
      if (u < 53.0) pose = { ...NEUTRAL, parked: false, hand: hold(PADC, 8) };
      else {
        const dab = [53.5, 54.1].some((t) => u >= t && u < t + 0.3);
        if (u < 56.6) pose = { ...NEUTRAL, parked: false, face: dab ? 'squint' : 'idle', hand: hold(PADC, dab ? 8 : 0) };
        else if (u < 57.0) pose = { ...NEUTRAL, head: HOME - 1, parked: false, hand: hold(PADC - 1, 0) };
        else {
          const wind = u >= 59.3 && u < 59.7;
          pose = { ...NEUTRAL, head: first + 1, parked: false, face: u >= 58.6 ? 'squint' : 'idle', hand: hold(first, wind ? 1 : 0) };
        }
      }
      if (nextPlan.hour && u >= 55 && u < 56.4) pose = { ...pose, face: 'lookR' };
    }
    pose = { ...NEUTRAL, ...pose };
    pose.face = blink(pose.face, T);

    // ---------------------------------------------------- the in-tray
    const tray = { n: Math.min(6, Math.floor(now.m / 9)), wobble: 0 };
    if (now.m >= 54) tray.wobble = Math.floor(u / (now.m === 59 ? 0.3 : 0.9)) % 3 === 0 ? 1 : 0;
    if (now.m === 59 && u > 52) tray.wobble = Math.floor(u / 0.2) % 2 ? 1 : -1;

    // ---------------------------------------------------- the avalanche (hour only)
    const flying = [];                               // [col, row, rom]
    const pile = new Map();                          // col -> 'sheet' | 'done'
    if (plan.hour && u < plan.E) {
      tray.n = u < 0.3 ? 6 : 0;
      // the jolt shakes a year's paperwork off the shelf above the glass
      for (const r of RAIN) {
        const k = Math.floor((u - r.t0) / 0.2);
        if (k === 0) flying.push([r.c, 0, TUMBLE[(r.c + 1) % 4]]);
        else if (k >= 1 && r.land) pile.set(r.c, 'sheet');
        else if (k === 1) flying.push([r.c, 1, TUMBLE[r.c % 4]]);
      }
      // the frenzy: stamp every sheet on the desk, then fling them off
      const stampAt = PILE_AT.map((c, i) => F0 + 0.9 + i * 0.6);
      PILE_AT.forEach((c, i) => { if (pile.has(c) && u >= stampAt[i] + 0.25) pile.set(c, 'done'); });
      const fling0 = stampAt[2] + 0.6;
      PILE_AT.forEach((c, i) => {
        const t0 = fling0 + i * 0.25;
        if (u < t0) return;
        pile.delete(c);
        const k = Math.floor((u - t0) / 0.15);
        if (c + k <= 15) flying.push([c + k, 0, TUMBLE[k % 4]]);
      });
      // the clerk through it
      if (u >= 0.9 && u < 2.5) pose.face = 'paper';  // a sheet lands on his head; he works on
      if (u >= 2.5 && u < F0) pose.face = 'shock';
      if (u >= F0) {
        let hn = Math.min(PILE_AT[0], 7 + Math.floor((u - F0) / 0.1)), y = 0;
        PILE_AT.forEach((c, i) => {
          if (u >= stampAt[i] - 0.25) hn = c;
          if (u >= stampAt[i] && u < stampAt[i] + 0.25) y = 8;
          if (u >= stampAt[i] && u < stampAt[i] + 0.15) jolt = true;
        });
        let face = y ? 'grit' : u < F0 + 0.8 ? 'shock' : 'squint';
        if (u >= fling0) face = u < fling0 + 1.2 ? 'happy' : 'sweat';
        if (u >= fling0 + 1.4) hn = Math.max(PADC, hn - 1 - Math.floor((u - fling0 - 1.4) / 0.35));
        pose = { ...pose, head: hn + 1, face, hand: hold(hn, y), parked: false };
        if (hn === PADC && u >= fling0 + 3.0) pose = { ...pose, hand: hold(PADC, 8) };
        if (u >= plan.E - 0.6) pose = { ...NEUTRAL, face: 'sweat' };
      }
    }

    // ---------------------------------------------------- compose the grid
    // Each cell: { rom } or { tile: bytes }. Tiles are allocated in priority order.
    const grid = [[], []];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) grid[r][c] = { rom: 0x20, prio: 0 };
    const put = (c, r, cell) => { if (c >= 0 && c < 16) grid[r][c] = cell; };

    // the hour on the wall
    HC.forEach((c, i) => put(c, 0, { tile: digitTile(shown.h[i]), prio: 9, digit: true }));
    // the minutes on the desk
    MC.forEach((c, i) => {
      const st = slot[i];
      if (!st) {
        // before the turn's flip, the pad still shows the previous minute
        const d = u < plan.E && plan.slots.some((s) => s.slot === i) ? prev.mm[i] : shown.m[i];
        put(c, 1, { tile: digitTile(d), prio: 9, digit: true });
      } else if (st.rom) put(c, 1, { rom: st.rom, prio: 0 });
      else if (st.digit !== undefined) put(c, 1, { tile: digitTile(st.digit), prio: 9, digit: true });
      else if (st.bleed !== undefined) put(c, 1, { tile: bleedTile(st.bleed, st.k), prio: 7 });
      else put(c, 1, { tile: st.tile, prio: 8 });
    });
    if (plan.hour && u < 0.2) HC.forEach((c, i) => put(c, 0, { tile: digitTile(prev.hh[i]), prio: 9, digit: true }));

    // props
    put(PADC, 1, { rom: PAD, prio: 0 });
    put(TRAYC, 1, { tile: trayTile(tray.n, tray.wobble), prio: 1, fallback: TRAY_ROM });
    if (pose.mug) { put(MUGC, 1, { tile: MUGT, prio: 4 }); put(MUGC, 0, { rom: STEAM[Math.floor(T / 0.5) % 4], prio: 0 }); }
    for (const [c, kind] of pile) put(c, 1, kind === 'done' ? { tile: DONE, prio: 2 } : { rom: SHEET, prio: 0 });
    if (pose.zed) put(HOME - 1, 0, { rom: pose.zed, prio: 0 });

    // the desk jumps when the stamp lands
    if (jolt) {
      for (let c = 0; c < 16; c++) {
        const cell = grid[1][c];
        if (cell.tile && c !== (pose.hand?.col)) cell.tile = [...cell.tile.slice(1), 0];
      }
    }

    // the head
    put(pose.head, 0, { tile: headTile(pose.face, jolt), prio: 6 });

    // ink: sprites over cells, private tiles
    const inked = new Set();
    const ink = (c, y, row) => {
      if (c < 0 || c > 15 || y < 0 || y > 15) return;
      const r = y >> 3, cell = grid[r][c];
      if (!cell.tile) cell.tile = cell.rom === 0x20 ? EMPTY.slice() : lcd.glyph(cell.rom).slice();
      else cell.tile = cell.tile.slice();
      cell.tile[y & 7] |= row;
      delete cell.rom;
      cell.prio = Math.max(cell.prio, 5);
      cell.digit = false;
      inked.add(r * 16 + c);
    };
    const sprite = (c, y, rows) => rows.forEach((s, i) => { const b = bits(s); if (b) ink(c, y + i, b); });
    // the parked stamp, on its pad
    if (pose.parked) sprite(PADC, 8, SPRITE.stamp.rows);
    // the hand and what it holds, and an arm back to the shoulder
    if (pose.hand) {
      const h = pose.hand, sp = SPRITE[h.kind];
      sprite(h.col, h.y, sp.rows);
      const gy = h.y + sp.grip;
      if (h.col === pose.head) {
        // a hand on the desk in front of him: the arm is behind the desk
      } else {
        const toward = pose.head > h.col ? 1 : -1;
        const edge = toward > 0 ? 0b00001 : 0b10000;
        const sh = toward > 0 ? 0b10000 : 0b00001;
        ink(h.col, gy, edge);                         // knuckles; the shoulder is next door
      }
    }
    // the giant hour stamp
    if (giantY !== null) {
      HC.forEach((c) => {
        const cell = grid[0][c];
        const t = (cell.tile ?? EMPTY).slice();
        GIANT.forEach((s, i) => { const y = giantY + i; if (y >= 0) t[y] = bits(s); });
        grid[0][c] = { tile: t, prio: 9 };
      });
      if (sparks) { put(0, 0, { rom: SPARK, prio: 0 }); put(3, 0, { rom: SPARK, prio: 0 }); }
    }
    for (const [c, r, g] of flying) {
      const cell = grid[r][c];
      if (cell.tile && !(r === 1 && c === TRAYC)) continue;
      put(c, r, { rom: g, prio: 0 });
    }

    // ---------------------------------------------------- allocate and draw
    const order = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) if (grid[r][c].tile) order.push([c, r]);
    order.sort((a, b) => grid[b[1]][b[0]].prio - grid[a[1]][a[0]].prio);
    const slots = new Map(), defs = [];
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) if (!grid[r][c].tile) codes[r][c] = grid[r][c].rom;
    let dropped = 0;
    for (const [c, r] of order) {
      const t = grid[r][c].tile, key = t.join(',');
      if (!slots.has(key) && defs.length < 8) { slots.set(key, defs.length); defs.push(t); }
      if (!slots.has(key)) dropped++;
      codes[r][c] = slots.has(key) ? slots.get(key) : grid[r][c].fallback ?? 0x20;
    }
    this.dropped = dropped;                          // tiles that found no slot (for checks)
    defs.forEach((t, i) => lcd.defineChar(i, t));
    codes.forEach((row, r) => { lcd.setCursor(0, r); row.forEach((c) => lcd.data(c)); });
  },
};
