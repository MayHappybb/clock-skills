// Lemmings — the time is the level, and the lemmings walk it.
//
// The four digits are blocks of terrain standing on the floor of the glass,
// eleven dots tall (rows 5-15) and three cells wide, built from a kit: a cap
// (the top of a stroke), the top bar, the middle bar, middle-and-bottom bars,
// with ROM 0xff for full strokes and ROM '_' for the bottom bar of a 0. Above
// them is a five-dot sky lane where the lemmings live: a mop of hair, a nose,
// a body and striding legs, three dots wide. 24-hour, HH on the left, MM on
// the right; between them a two-cell pit with the exit, a little hut, on its
// floor.
//
// Every minute a stream comes in off one edge (the hours side on even
// minutes, the minutes side on odd ones), marches across the tops of the
// digits in lockstep, hops the gaps between digits and the shoulders of a 1,
// steps down into the cup of a 4 and climbs out, and walks off the edge of
// the pit, drops in front of the hut and goes in. Each minute one of them
// does something: shrugs, floats down under an umbrella, or turns blocker on
// top of a digit and sends the ones behind him back the way they came.
//
// Minute turn: for each digit about to change a digger walks in from the
// right edge, stops on it, and at :58 digs it away from the top: the whole
// top cell in his first stroke (its prongs alone could read as a 4), then
// two rows a stroke, standing in his own hole as it sinks. At :00 he turns
// builder and lays the new digit from the floor, a course every 0.22 s for
// the bottom cell, the top cell last, riding up on it, then walks off. The
// old digit is only ever cut down from the top and the new one only grows
// from the floor, so the glass shows the old time, part of it, or the new one
// rising: never another time.
//
// Hour: at :59:18 a builder walks out to the pit and planks it over, cell by
// cell, and the release rate goes up: a crowd marches across the whole glass.
// At :59:55 every lemming on the glass stops dead and clutches its head ("Oh
// no!"). At :00 they all pop at once, the digits that change are blown into
// ROM debris, and the new time rises out of the floor. One of them was blown
// right off the top of the glass: he comes back down under his umbrella,
// lands beside the hut, looks round, shrugs, and walks in. The hut's door
// lights up.
//
// Tiles: the standing time needs at most five parts, the hut one. Every
// lemming walks on the same beat at the same place in its cell, so lemmings
// over the same kind of cell share one tile, and the stream is spaced out at
// times whose digits leave few slots. Workers, fallers, the hut and walkers
// are layered over the terrain in that order, each only if the frame still
// fits in eight; a sprite that does not fit is left out of that frame. The
// terrain is never touched. Debris is ROM.

import { noise } from '../js/kit.js';

const bits = (l) => [...l.padEnd(5, '.')].reduce((b, ch) => (b << 1) | (ch === '#' ? 1 : 0), 0);
const tile = (lit, w = 0x1f) => Array.from({ length: 8 }, (_, r) => (lit.includes(r) ? w : 0));
const rnd = (a, b) => noise(a * 7.13 + b * 0.917, 23);

// ------------------------------------------------------------------ terrain

const TOP = 5;                              // glass row of the digits' top surface
const PART = {
  CAP: tile([5, 6, 7]), BAR: tile([5]), DOT: tile([5], 0b00100),
  M: tile([0, 1]), MB: tile([0, 1, 6]), B: tile([6]),          // B is ROM '_'
  F: tile([0, 1, 2, 3, 4, 5, 6, 7]), E: tile([]),
};
const DIG = {
  0: [['CAP', 'BAR', 'CAP'], ['F', 'B', 'F']],
  1: [['E', 'CAP', 'E'], ['E', 'F', 'E']],
  2: [['BAR', 'BAR', 'CAP'], ['F', 'MB', 'MB']],
  3: [['BAR', 'BAR', 'CAP'], ['MB', 'MB', 'F']],
  4: [['CAP', 'E', 'CAP'], ['M', 'M', 'F']],
  5: [['CAP', 'BAR', 'BAR'], ['MB', 'MB', 'F']],
  6: [['CAP', 'BAR', 'BAR'], ['F', 'MB', 'F']],
  7: [['BAR', 'BAR', 'CAP'], ['E', 'E', 'F']],
  8: [['CAP', 'BAR', 'CAP'], ['F', 'MB', 'F']],
  9: [['CAP', 'BAR', 'CAP'], ['MB', 'MB', 'F']],
};
const POS = [0, 4, 9, 13];                  // left cell of each digit
const GAPS = [3, 12];                      // bridged with builder's planks
const PIT = [7, 8];
const EXIT_COL = 7;                         // the exit hut
// The exit: a little house on the pit floor, peaked roof and open door. (A
// tall arch read as the letter n; a two-cell hut split by the seam read "ft".)
const HUT = ['.....', '.....', '.....', '.....', '..#..', '.###.', '.#.#.', '.#.#.'];
const EXIT = HUT.map(bits);
const EXIT_LIT = HUT.map((l, i) => bits(i >= 6 ? '.###.' : l));

// ------------------------------------------------------------------ lemmings (drawn facing right)

const POSE = {
  walk0: ['##.', '.##', '###', '.#.', '#.#'],
  walk1: ['##.', '.##', '.#.', '.#.', '.#.'],
  fall: ['#.#', '.##', '.#.', '.#.', '#.#'],
  jump: ['##.', '.##', '###', '#.#', '...'],
  land: ['...', '##.', '.##', '##.', '#.#'],
  shrug: ['##.', '.##', '###', '.#.', '#.#'],
  block: ['.#.', '.#.', '###', '.#.', '#.#'],
  dig0: ['...', '##.', '.##', '.##', '###'],
  dig1: ['##.', '.##', '.#.', '###', '#.#'],
  build0: ['##..', '.##.', '.#.#', '.#..', '#.#.'],
  build1: ['##..', '.##.', '.#..', '.#..', '.#..'],
  ohno0: ['##.', '###', '#.#', '.#.', '#.#'],
  ohno1: ['##.', '###', '#.#', '.#.', '.#.'],
  umb: ['.#.', '###', '#.#', '.#.', '##.', '.##', '.#.', '#.#'],   // umbrella, then the lemming
  puff0: ['#.#', '.#.', '#.#', '...', '...'],
  puff1: ['...', '.#.', '...', '...', '...'],
};
const SPR = {};
for (const [k, rows] of Object.entries(POSE)) {
  const w = rows[0].length;
  SPR[k + 'R'] = rows.map(bits);
  SPR[k + 'L'] = rows.map((l) => bits([...l].reverse().join('').padStart(w, '.')));
}
const H = 5;                                // a lemming is five rows tall
const FLOOR = 16 - H;                       // y of a lemming standing on the floor

// ------------------------------------------------------------------ timing

const STEP = 0.3;                          // one walking step
const FALL = 0.06, FLOAT = 0.26;            // seconds per row falling, floating
const CLIMB = 4;                            // highest step a walker clambers up
const DIG0 = 58.2, DIG_DT = 0.26;           // digging: the top cell, then two rows a stroke
const BUILD0 = 0.15, BUILD_DT = 0.22;       // building: one course a step
const RISE_H = 1.0;                         // on the hour the new digits rise from here
const HOLD = 55.2;                          // :59:55, Oh no!
const BRIDGE0 = 18, BRIDGE_DT = 2.0;        // the hour's bridge, a cell at a time
const SURV0 = 0.9, SFLOAT = 0.42;           // the survivor, blown sky-high by the pop, floats back down

// ------------------------------------------------------------------ the level

/** Glass row of the first solid dot in a column (16 = the bare floor). */
function surface(cells, col) {
  if (col < 0 || col > 15) return TOP;
  for (let y = 0; y < 16; y++) if (cells[y >> 3][col][y & 7]) return y;
  return 16;
}

/**
 * One lemming, from its spawn to minute-local time u, on the global step
 * grid. Returns where it is and what it is doing, or null once it has walked
 * off the glass or into the exit.
 */
function walker(w, u, ctx) {
  const { surf, grid } = ctx;
  let t = w.t0, col = w.col, off = w.off, dir = w.dir;
  let y = surf(col, t) - H, mode = 'walk', moves = 0, shrug = 0, until = 0, floating = false, hop = 0;
  let on = col >= 0 && col <= 15;
  for (let guard = 0; guard < 2000; guard++) {
    if (mode === 'walk') {
      if (w.holdAt != null && t >= w.holdAt) return { col, off, y, dir, mode: 'hold' };
      const nt = t + STEP;
      if (nt > u) break;
      t = nt;
      if (shrug > 0) { shrug--; continue; }
      moves++;
      if (w.shrugAt === moves) { shrug = 6; continue; }
      let noff = off + dir, ncol = col;
      if (noff > 2) { ncol++; noff = 0; } else if (noff < 0) { ncol--; noff = 2; }
      if (ncol !== col) {
        if (on && (ncol < 0 || ncol > 15)) return null;
        if (ctx.blocked && ctx.blocked(t, ncol, col)) { dir = -dir; continue; }
        const s1 = y + H, s2 = surf(ncol, t);
        if (s2 < s1 - CLIMB) { dir = -dir; continue; }
        if (s2 > s1 + 3 && !PIT.includes(ncol)) {
          // a narrow hole (a gap between digits, beside a 1): hop it
          let far = 0;
          for (let k = 1; k <= 4; k++) { const c2 = ncol + dir * k; if (PIT.includes(c2)) break; if (Math.abs(surf(c2, t) - s1) <= 1) { far = k; break; } }
          if (far) { hop = far * 3; }
        }
        col = ncol; off = noff;
        if (col >= 0 && col <= 15) on = true;
        if (hop > 0) { hop--; continue; }
        if (s2 > s1) { mode = 'fall'; floating = !!w.floater && s2 - s1 > 6; }
        else y = s2 - H;
      } else { off = noff; if (hop > 0) hop--; }
      if (col === EXIT_COL && y >= FLOOR) return null;      // in at the door
    } else if (mode === 'fall') {
      const nt = t + (floating ? FLOAT : FALL);
      if (nt > u) break;
      t = nt; y++;
      if (y + H >= surf(col, t)) { y = surf(col, t) - H; mode = 'land'; until = t + (floating ? 0.6 : 0.25); }
    } else {
      const nt = grid(Math.max(until, t));
      if (nt > u) break;
      t = nt; mode = 'walk'; floating = false;
    }
  }
  let pose;
  if (mode === 'fall') pose = floating ? 'umb' : 'fall';
  else if (mode === 'land') pose = 'land';
  else if (shrug > 0) pose = 'shrug';
  else pose = hop > 0 ? 'jump' : ctx.beat(t) ? 'walk1' : 'walk0';
  return { col, off, y: pose === 'umb' ? y - 3 : y, dir, mode, pose };
}

// ------------------------------------------------------------------ composition

const keyOf = (b) => b.join(',');
const romKey = new Map([[keyOf(PART.E), 0x20], [keyOf(PART.F), 0xff], [keyOf(PART.B), 0x5f]]);

/** Terrain first (it must be right), then actors in order, each only if the frame still fits. */
const stats = { tiles: 0, dropped: 0, lost: 0 };
function plan(lcd, cells, rom, actors, keep) {
  let grid = cells.map((row, r) => row.map((b, c) => ({ b, rom: rom[r][c] })));
  const count = (g) => {
    const s = new Set();
    for (const row of g) for (const x of row) if (x.rom == null) { const k = keyOf(x.b); if (!romKey.has(k)) s.add(k); }
    return s.size;
  };
  for (const a of actors) {
    if (a.cell) {
      // a whole cell laid over what is there (the exit); ROM stand-in if it does not fit
      const [r, c] = a.cell, x = grid[r][c];
      const trial = grid.map((row) => row.slice());
      trial[r][c] = { b: x.b.map((v, i) => v | a.b[i]), rom: null };
      if (count(trial) <= 8) grid = trial;
      else if (!x.b.some((v) => v)) { grid = trial; grid[r][c] = { b: x.b, rom: a.fallback }; }
      continue;
    }
    const spr = SPR[a.pose + (a.dir < 0 ? 'L' : 'R')];
    if (!spr || a.col < 0 || a.col > 15) continue;
    const trial = grid.map((row) => row.slice());
    let any = false;
    spr.forEach((v, i) => {
      const y = a.y + i;
      if (y < 0 || y > 15 || !v) return;
      const r = y >> 3, x = trial[r][a.col];
      const nb = (x.rom != null ? lcd.glyph(x.rom) : x.b).slice();
      nb[y & 7] |= (v >> a.off) & 0x1f;
      trial[r][a.col] = { b: nb, rom: null }; any = true;
    });
    if (any && count(trial) <= 8) { grid = trial; keep?.add(a); }
    else if (any) stats.dropped++;
  }
  return grid;
}

function compose(lcd, cells, rom, actors) {
  stats.dropped = 0; stats.lost = 0;
  const grid = plan(lcd, cells, rom, actors);
  const slots = new Map();
  const out = grid.map((row) => row.map((x) => {
    if (x.rom != null) return x.rom;
    const k = keyOf(x.b);
    if (romKey.has(k)) return romKey.get(k);
    if (!slots.has(k)) { if (slots.size >= 8) { stats.lost++; return 0x20; } slots.set(k, slots.size); }
    return slots.get(k);
  }));
  for (const [k, i] of slots) lcd.defineChar(i, k.split(',').map((v) => {
    let s = ''; for (let j = 0; j < 5; j++) s += (+v >> (4 - j)) & 1 ? '#' : '.'; return s;
  }));
  stats.tiles = slots.size;
  out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
}

/** Terrain bytes for four digits, each showing only rows at or below visTop[i]. */
function terrain(digits, visTop = [0, 0, 0, 0]) {
  const cells = [0, 1].map(() => Array.from({ length: 16 }, () => PART.E.slice()));
  digits.forEach((d, i) => DIG[d].forEach((row, r) => row.forEach((p, k) => {
    cells[r][POS[i] + k] = PART[p].map((v, j) => (r * 8 + j >= visTop[i] ? v : 0));
  })));
  return cells;
}

/** The hour's bridge across the pit: planks laid a brick at a time. */
function bridgeBricks(u) {
  const out = {};
  PIT.forEach((c, n) => {
    const t0 = BRIDGE0 + n * BRIDGE_DT;
    if (u >= t0) out[c] = 0x1f;            // a plank, laid whole
  });
  return out;
}
const bridgeDone = (c, u) => u >= BRIDGE0 + PIT.indexOf(c) * BRIDGE_DT + 0.3;

/** Who walks this minute: spawn times and direction. */
/** CGRAM tiles the standing time needs on its own. */
function partsOf(digits) {
  const set = new Set();
  digits.forEach((d) => DIG[d].flat().forEach((p) => { if (!['E', 'F', 'B'].includes(p)) set.add(p); }));
  return set.size + 1;                     // + the hut
}

function spawns(m, show, now) {
  const list = [];
  const free = 8 - partsOf(now);           // slots left for lemmings
  const spread = free >= 4 ? 0 : free === 3 ? 3 : 6;
  if (show) {
    for (let k = 0; ; k++) { const free = 8 - partsOf(now); const t = 4 + k * STEP * 3 * (free >= 4 ? 3 : free === 3 ? 4 : free === 2 ? 6 : 9); if (t > HOLD - 0.5) break; list.push({ t, dir: 1 }); }
    return list;
  }
  const left = m % 2 === 0;
  const end = left ? 42 : 40;
  let t = 3.5 + rnd(m, 1) * 2;
  for (let k = 0; t < end; k++) { list.push({ t, dir: left ? 1 : -1 }); t += STEP * 3 * (3 + spread + Math.floor(rnd(m, 10 + k) * 4)); }
  return list;
}

/** Everyone in the stream at minute-local time u of the minute starting at B. */
function crowd(m, B, u, now, show, ctx0) {
  const grid = (t) => Math.ceil((B + t) / STEP - 1e-6) * STEP - B;
  const beat = (t) => Math.round((B + t) / STEP) % 2 === 1;
  const base = terrain(now);
  const surf = (c, t) => {
    if (show && PIT.includes(c) && bridgeDone(c, t)) return TOP;
    return surface(base, c);
  };
  const list = spawns(m, show, now);
  const left = list.length && list[0].dir > 0;
  const ev = rnd(m, 5);
  const event = show ? 'none' : ev < 0.34 ? 'floater' : ev < 0.62 ? 'shrug' : ev < 0.9 ? 'blocker' : 'none';
  const who = 1 + Math.floor(rnd(m, 6) * Math.max(1, list.length - 3));
  let blk = null;
  if (event === 'blocker' && list.length > 3) {
    const col = left ? POS[1] + 1 : POS[2] + 1;
    const t0 = grid(list[who].t) + ((left ? col + 1 : 16 - col) * 3 - 1) * STEP;
    blk = { col, t0, t1: t0 + 7.0 };
  }
  const out = [];
  list.forEach((s, j) => {
    const t0 = grid(s.t);
    if (u < t0) return;
    const spec = { t0, col: s.dir > 0 ? -1 : 16, off: s.dir > 0 ? 2 : 0, dir: s.dir,
      floater: event === 'floater' && j === who,
      shrugAt: event === 'shrug' && j === who ? 6 + Math.floor(rnd(m, 7) * 8) : null,
      holdAt: show ? HOLD : null };
    const c = { surf, grid, beat };
    if (blk) {
      if (j === who) {
        if (u >= blk.t0 && u < blk.t1) {
          out.push({ pri: 1, col: blk.col, off: 1, y: TOP - H, dir: s.dir,
            pose: (u - blk.t0) % 2.6 < 0.3 ? 'walk1' : 'block' });
          return;
        }
        if (u >= blk.t1) { spec.t0 = grid(blk.t1); spec.col = blk.col; spec.off = 1; }
      } else {
        c.blocked = (t, nc, oc) => t >= blk.t0 && t < blk.t1 && nc === blk.col && oc !== blk.col;
      }
    }
    const st = walker(spec, u, c);
    if (!st) return;
    if (st.mode === 'hold') st.pose = Math.floor(u / 0.3) % 2 ? 'ohno1' : 'ohno0';
    out.push({ pri: st.mode === 'walk' || st.mode === 'hold' ? 3 : 2, ...st });
  });
  return out;
}

// ------------------------------------------------------------------ the face

export default {
  name: 'Lemmings',
  blurb: 'The time is a Lemmings level: a stream of tiny lemmings marches over the digits into the exit; diggers tear the old minute down and builders raise the new one from the floor, and on the hour the whole crowd goes "Oh no!" and pops.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,
  stats,

  frame(lcd, api, { fields, date, kit }) {
    const midnight = new Date(date); midnight.setHours(0, 0, 0, 0);
    const T = (date.getTime() - midnight.getTime()) / 1000;
    const u = fields.s + fields.ms / 1000;
    const B = T - u;
    const m = Math.round(B / 60) + 1440 * (Math.floor(midnight.getTime() / 86400000) % 7);
    const dig = (sec) => { const f = kit.clockFields(new Date(midnight.getTime() + sec * 1000)); return (f.hh + f.mm).split('').map(Number); };
    const now = dig(B), prev = dig(B - 60), next = dig(B + 60);
    const show = next[2] === 0 && next[3] === 0;           // :59, the hour is coming
    const after = now[2] === 0 && now[3] === 0;            // :00
    const grid = (t) => Math.ceil((B + t) / STEP - 1e-6) * STEP - B;
    const beat = (t) => Math.round((B + t) / STEP) % 2 === 1;

    const turning = [0, 1, 2, 3].filter((i) => next[i] !== now[i]);
    const landed = [0, 1, 2, 3].filter((i) => prev[i] !== now[i]);

    // ---- terrain: standing, being dug away, or rising
    const visTop = [0, 0, 0, 0];
    // the top cell goes in the first stroke (its prongs alone would read as a 4), then two rows a stroke
    if (!show && u >= DIG0) for (const i of turning) visTop[i] = Math.min(16, 8 + 2 * Math.floor((u - DIG0) / DIG_DT));
    const rise0 = after ? RISE_H : BUILD0;
    for (const i of landed) {
      // eight courses up the bottom cell, then the whole top cell in one go
      const n = u < rise0 ? 0 : 1 + Math.floor((u - rise0) / BUILD_DT);
      if (n < 9) visTop[i] = 16 - n;
    }
    const cells = terrain(now, visTop);
    const rom = [Array(16).fill(null), Array(16).fill(null)];
    if (show) for (const [c, b] of Object.entries(bridgeBricks(u))) { cells[0][c] = cells[0][c].slice(); cells[0][c][TOP] = b; }

    const actors = [];

    // ---- diggers: one walks in from the right for each digit that is due
    if (!show) turning.forEach((i) => {
      const col = POS[i] + 1;
      const steps = (16 - col) * 3 - 1;
      const t0 = grid(DIG0 - 0.5 - steps * STEP);
      if (u < t0) return;
      if (u < DIG0) {
        const k = Math.min(steps, Math.floor((u - t0) / STEP));
        const p = 16 * 3 - k;                                  // sub-steps from the right
        actors.push({ pri: 0, col: Math.floor(p / 3), off: p % 3, y: TOP - H, dir: -1,
          pose: k >= steps ? 'shrug' : beat(u) ? 'walk1' : 'walk0' });
      } else {
        actors.push({ pri: 0, col, off: 1, y: Math.min(FLOOR, visTop[i] - H), dir: -1,
          pose: Math.floor((u - DIG0) / (DIG_DT / 2)) % 2 ? 'dig1' : 'dig0' });
      }
    });

    // ---- builders: they ride the new digit up, then head for the exit
    if (!after) landed.forEach((i) => {
      const col = POS[i] + 1, done = BUILD0 + 9 * BUILD_DT;
      if (u < done) {
        actors.push({ pri: 0, col, off: 1, y: Math.max(0, visTop[i] - H), dir: -1,
          pose: Math.floor(u / BUILD_DT) % 2 ? 'build1' : 'build0' });
      } else {
        const st = walker({ t0: grid(done + 0.5), col, off: 1, dir: -1 }, u,
          { surf: (c) => surface(terrain(now), c), grid, beat });
        if (st) actors.push({ pri: 1, ...st });
      }
    });

    // ---- the stream
    if (show && u >= HOLD) {
      // the frozen crowd: only those who fit at both beats of the head-shake
      const frozen = crowd(m, B, u, now, show);
      const ok = [0, 1].map((ph) => {
        const keep = new Set();
        const trial = frozen.map((a) => ({ ...a, pose: a.mode === 'hold' ? 'ohno' + ph : a.pose }));
        const hut = [{ pri: 0.5, cell: [1, EXIT_COL], b: EXIT, fallback: 0x20 }];
        plan(lcd, cells, rom, [...actors, ...hut, ...trial].sort((p, q) => p.pri - q.pri), keep);
        return new Set([...keep].map((a) => a.col * 100 + a.off * 10 + a.y));
      });
      actors.push(...frozen.filter((a) => a.mode !== 'hold' || ok.every((k) => k.has(a.col * 100 + a.off * 10 + a.y))));
    } else if (!(after && u < 13)) actors.push(...crowd(m, B, u, now, show));

    // ---- the hour: the bridge builder, the frozen crowd, the pop, the survivor
    if (show && u >= BRIDGE0 - 3 && u < BRIDGE0 + PIT.length * BRIDGE_DT + 2.5) {
      if (u < BRIDGE0) {
        const k = Math.floor((u - (BRIDGE0 - 3)) / STEP);
        const p = Math.min(5 * 3 + 2, 3 * 2 + k);
        actors.push({ pri: 0, col: Math.floor(p / 3), off: p % 3, y: TOP - H, dir: 1, pose: beat(u) ? 'walk1' : 'walk0' });
      } else {
        const n = Math.min(PIT.length, Math.floor((u - BRIDGE0) / BRIDGE_DT));
        if (n < PIT.length) actors.push({ pri: 0, col: PIT[0] - 1 + n, off: 2, y: TOP - H, dir: 1, pose: Math.floor(u / 0.33) % 2 ? 'build1' : 'build0' });
        else actors.push({ pri: 0, col: PIT[PIT.length - 1], off: 1, y: TOP - H, dir: 1, pose: 'shrug' });
      }
    }
    if (after && u < 1.2) {
      // everyone who was holding their head goes pop
      const Bp = B - 60, mp = m - 1;
      for (const a of crowd(mp, Bp, HOLD + 0.1, prev, true)) {
        if (a.mode !== 'hold') continue;
        actors.push({ pri: 2, col: a.col, off: a.off, y: a.y, dir: 1, pose: u < 0.5 ? 'puff0' : u < 0.9 ? 'puff1' : null });
      }
    }
    let saved = false;
    const fu = after ? u - SURV0 : -1;
    if (fu >= 0) {
      // the survivor: the pop blew one lemming off the top of the glass; he comes
      // back down under his umbrella into the pit, lands, and walks into the exit
      const y = -6 + Math.floor(fu / SFLOAT);
      // floats down beside the hut, lands, looks round, shrugs, and walks in
      const land = (FLOOR + 6) * SFLOAT;
      if (fu < land) actors.push({ pri: 0, col: 8, off: 1, y: y - 3, dir: -1, pose: 'umb' });
      else {
        const t = fu - land;
        if (t < 0.6) actors.push({ pri: 0, col: 8, off: 1, y: FLOOR, dir: -1, pose: 'land' });
        else if (t < 1.2) actors.push({ pri: 0, col: 8, off: 1, y: FLOOR, dir: 1, pose: 'walk1' });
        else if (t < 2.4) actors.push({ pri: 0, col: 8, off: 1, y: FLOOR, dir: -1, pose: Math.floor(t / 0.3) % 2 ? 'shrug' : 'walk1' });
        else {
          const k = Math.floor((t - 2.4) / STEP);
          if (k < 3) actors.push({ pri: 0, col: 8, off: 1 - Math.min(1, k), y: FLOOR, dir: -1, pose: k % 2 ? 'walk1' : 'walk0' });
          else if (t < 6 && Math.floor(t / 0.4) % 2) saved = true;   // in he goes: the door lights up
        }
      }
    }
    // the hour's debris: what was blown off the old digits
    if (after && u < RISE_H) {
      const DEB = [0x2a, 0xa5, 0x2e, 0xdf, 0x27, 0x60, 0xde];
      for (const i of landed) for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
        const c = POS[i] + k, ph = Math.floor(u / 0.3);
        const keep = [0.9, 0.6, 0.3, 0.15][ph];
        const q = rnd(m * 5 + c, r * 9 + ph);
        if (q < keep && !(r === 1 && PIT.includes(c))) rom[r][c] = DEB[Math.floor(rnd(c + r * 16, ph + 3) * DEB.length)];
      }
    }

    const ex = saved ? EXIT_LIT : EXIT;
    if (rom[1][EXIT_COL] == null) actors.push({ pri: 0.5, cell: [1, EXIT_COL], b: ex, fallback: 0x20 });
    actors.sort((a, b) => a.pri - b.pri);
    compose(lcd, cells, rom, actors.filter((a) => a.pose || a.cell));
  },
};
