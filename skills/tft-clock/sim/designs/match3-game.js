// Match-3 game: the board, the numerals as cell patterns, and the invisible
// player. Everything is a deterministic simulation keyed by the minute: a
// minute's script (every gem's path, every pop, hint, combo) is built once,
// from the board the previous minute left, back to the start of the hour
// (where the colour bomb clears the board and it refills from scratch).
// No Math.* in here: integer maths and tables, so the estimate sees no
// soft-float calls and the C port is plain.

import { rng, clockFields } from '../js/kit.js';

export const COLS = 20, ROWS = 10, CELL = 8, NCELL = COLS * ROWS;
export const NTYPES = 5, DIAMOND = 5, BOMB = 6;

// ------------------------------------------------------------ the numerals
// 4 x 7 cells, drawn as one set for this grid. Gold wire links the stones
// (orthogonal neighbours, and diagonal ones where no orthogonal path
// exists), so diagonals read as strokes: the 2's spine, the 4's arm, the 7's
// leg, the curl of 6 and 9.
const DIGITS = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['..#.', '.##.', '#.#.', '..#.', '..#.', '..#.', '.###'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
  3: ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'],
  4: ['...#', '..##', '.#.#', '#..#', '####', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['..#.', '.#..', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '.###', '...#', '..#.', '.#..'],
};

/** The four slots: hours high on the left, minutes low on the right. */
export const SLOTS = [{ c0: 0, r0: 0 }, { c0: 5, r0: 0 }, { c0: 11, r0: 3 }, { c0: 16, r0: 3 }];
export const DW = 4, DH = 7;

/** Cells of digit d in slot i, in stroke order (a walk along the wire), as cell indices. */
const PATHS = {};
export function digitPath(d, i) {
  const key = d * 4 + i;
  if (PATHS[key]) return PATHS[key];
  const pat = DIGITS[d], { c0, r0 } = SLOTS[i], cells = [];
  for (let r = 0; r < DH; r++) for (let c = 0; c < DW; c++) if (pat[r][c] === '#') cells.push([c, r]);
  // walk: start at the first cell in reading order, then always the nearest
  // unvisited linked neighbour (orthogonal first), else the nearest cell
  const has = (c, r) => c >= 0 && r >= 0 && c < DW && r < DH && pat[r][c] === '#';
  const seen = new Set(), order = [];
  let cur = cells[0];
  while (cur) {
    seen.add(cur[1] * DW + cur[0]); order.push(cur);
    let next = null;
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const c = cur[0] + dc, r = cur[1] + dr;
      if (has(c, r) && !seen.has(r * DW + c)) { next = [c, r]; break; }
    }
    if (!next) {
      let best = 1e9;
      for (const p of cells) if (!seen.has(p[1] * DW + p[0])) { const d2 = (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2; if (d2 < best) { best = d2; next = p; } }
    }
    cur = next;
  }
  // links: orthogonal pairs, plus diagonals with no orthogonal detour
  const links = [];
  for (const [c, r] of cells) {
    if (has(c + 1, r)) links.push([c, r, c + 1, r]);
    if (has(c, r + 1)) links.push([c, r, c, r + 1]);
    if (has(c + 1, r + 1) && !has(c + 1, r) && !has(c, r + 1)) links.push([c, r, c + 1, r + 1]);
    if (has(c - 1, r + 1) && !has(c - 1, r) && !has(c, r + 1)) links.push([c, r, c - 1, r + 1]);
  }
  const idx = (c, r) => (r0 + r) * COLS + c0 + c;
  const rank = new Map(order.map(([c, r], k) => [idx(c, r), k]));
  const res = {
    cells: order.map(([c, r]) => idx(c, r)),
    links: links.map(([a, b, c, d]) => [idx(a, b), idx(c, d)]),
    rank,
  };
  PATHS[key] = res;
  return res;
}

/** Which slot owns each cell for the digits `hhmm` (a 4-char string), -1 free. */
export function digitMask(hhmm) {
  const m = new Int8Array(NCELL).fill(-1);
  for (let i = 0; i < 4; i++) for (const k of digitPath(+hhmm[i], i).cells) m[k] = i;
  return m;
}

// ------------------------------------------------------------ falling
// Gravity 900 px/s^2 to a terminal 210 px/s, then a rebound: a table of
// landing times by distance (whole pixels), so no sqrt at run time.
export const GRAV = 900, VMAX = 210, BOUNCE = 0.13;
const T_ACC = VMAX / GRAV, D_ACC = 0.5 * GRAV * T_ACC * T_ACC;
export const FALL_T = new Float32Array(256);
for (let d = 0; d < 256; d++) FALL_T[d] = d <= D_ACC ? Math.sqrt((2 * d) / GRAV) : T_ACC + (d - D_ACC) / VMAX;
/** Distance fallen after e seconds (unbounded). */
export function fallDist(e) {
  return e <= T_ACC ? 0.5 * GRAV * e * e : D_ACC + (e - T_ACC) * VMAX;
}

// ------------------------------------------------------------ a minute's script
//
// Gems are kept as parallel arrays. A gem's path is a list of segments:
// [t0, t1, x0, y0, x1, y1, mode]; mode 0 = a swap (eased), 1 = a fall
// (gravity, then a rebound), 2 = a shuffle glide. Before its first segment a
// gem sits at (x0, y0) of that segment, or at its home (hx, hy).

const SWAP = 0.2, POPT = 0.22, HINT = 0.5;
export { SWAP, POPT, HINT };

class Script {
  constructor() {
    this.type = []; this.born = []; this.die = []; this.hx = []; this.hy = []; this.segs = []; this.slot = [];
    this.hints = [];      // [t0, t1, gemA, gemB]
    this.popups = [];     // [t, x, y, word]
    this.chains = [];     // [slot, digit, t0, t1]  lightning along an old numeral
    this.arrive = [];     // [slot, digit, tLand]   a new numeral landed, wire grows after
    this.bomb = null;     // { gem, t0, tSwap, tBlast, cx, cy }
    this.shuffles = [];   // [t0, t1]
  }
  add(type, x, y, born, slot = -1) {
    const id = this.type.length;
    this.type.push(type); this.born.push(born); this.die.push(1e9); this.hx.push(x); this.hy.push(y); this.segs.push([]); this.slot.push(slot);
    return id;
  }
}

const cx = (k) => (k % COLS) * CELL, cy = (k) => ((k / COLS) | 0) * CELL;

/** Is there a run of 3 through cell k (types in `T`, -1 empty, >= 5 never matches)? */
function runAt(T, k) {
  const t = T[k];
  if (t < 0 || t >= NTYPES) return false;
  const c = k % COLS, r = (k / COLS) | 0;
  let n = 1;
  for (let x = c - 1; x >= 0 && T[r * COLS + x] === t; x--) n++;
  for (let x = c + 1; x < COLS && T[r * COLS + x] === t; x++) n++;
  if (n >= 3) return true;
  n = 1;
  for (let y = r - 1; y >= 0 && T[y * COLS + c] === t; y--) n++;
  for (let y = r + 1; y < ROWS && T[y * COLS + c] === t; y++) n++;
  return n >= 3;
}

function findMatches(T) {
  const out = [];
  for (let k = 0; k < NCELL; k++) if (runAt(T, k)) out.push(k);
  return out;
}

function findMoves(T) {
  const out = [];
  for (let k = 0; k < NCELL; k++) {
    if (T[k] < 0 || T[k] >= NTYPES) continue;
    const c = k % COLS;
    for (const j of [c < COLS - 1 ? k + 1 : -1, k + COLS < NCELL ? k + COLS : -1]) {
      if (j < 0 || T[j] < 0 || T[j] >= NTYPES || T[j] === T[k]) continue;
      const a = T[k]; T[k] = T[j]; T[j] = a;
      const ok = runAt(T, k) || runAt(T, j);
      T[j] = T[k]; T[k] = a;
      if (ok) out.push([k, j]);
    }
  }
  return out;
}

/** A colour for empty cell k that makes no run with what is already there. */
function safeType(T, k, r) {
  const s = (r() * NTYPES) | 0;
  for (let i = 0; i < NTYPES; i++) {
    T[k] = (s + i) % NTYPES;
    if (!runAt(T, k)) return T[k];
  }
  return T[k];
}

/**
 * Fill the empty cells of the given columns from above, as stacks dropping in
 * (every gem falls the same height, lower rows first), at `t0`, with
 * per-column delay `colDelay`. `mask` says which cells are numeral cells
 * (they get diamonds).
 */
function dropIn(S, T, G, mask, cols, t0, colDelay, rnd) {
  let tEnd = t0;
  // pick colours first, bottom-up, so the landed board has no runs
  for (const c of cols)
    for (let r = ROWS - 1; r >= 0; r--) {
      const k = r * COLS + c;
      if (T[k] !== -1) continue;
      if (mask[k] >= 0) T[k] = DIAMOND; else safeType(T, k, rnd);
    }
  let n = 0;
  for (const c of cols) {
    const d0 = t0 + n++ * colDelay;
    for (let r = ROWS - 1; r >= 0; r--) {
      const k = r * COLS + c;
      if (G[k] !== -1) continue;
      const x = c * CELL, y = r * CELL, dist = ROWS * CELL;
      const ts = d0 + (ROWS - 1 - r) * 0.012;
      const id = S.add(T[k], x, y - dist, ts - 0.01, mask[k]);
      const tl = ts + FALL_T[dist];
      S.segs[id].push(ts, tl + BOUNCE, x, y - dist, x, y, 1);
      G[k] = id;
      if (T[k] === DIAMOND && mask[k] >= 0) S.lastLand = Math.max(S.lastLand ?? 0, tl);
      if (tl + BOUNCE > tEnd) tEnd = tl + BOUNCE;
    }
  }
  return tEnd;
}

/** Gravity after pops at time t: gems slide down through free cells (behind the numerals), new ones drop in. */
function gravity(S, T, G, mask, t, rnd) {
  let tEnd = t;
  for (let c = 0; c < COLS; c++) {
    // the free cells of this column, bottom to top
    const free = [];
    for (let r = ROWS - 1; r >= 0; r--) { const k = r * COLS + c; if (mask[k] < 0) free.push(k); }
    const keep = free.filter((k) => G[k] !== -1);
    if (keep.length === free.length) continue;
    const ids = keep.map((k) => G[k]), types = keep.map((k) => T[k]);
    for (const k of free) { G[k] = -1; T[k] = -1; }
    // survivors move down into the lowest free cells, in order
    for (let i = 0; i < ids.length; i++) {
      const k = free[i], id = ids[i], from = keep[i];
      G[k] = id; T[k] = types[i];
      if (from !== k) {
        const dist = cy(k) - cy(from), tl = t + FALL_T[dist];
        S.segs[id].push(t, tl + BOUNCE, cx(k), cy(from), cx(k), cy(k), 1);
        if (tl + BOUNCE > tEnd) tEnd = tl + BOUNCE;
      }
    }
    // new gems, stacked above the board, falling the same way
    let above = 0;
    for (let i = ids.length; i < free.length; i++) {
      const k = free[i];
      const y0 = -CELL * (++above), dist = cy(k) - y0;
      safeTypeOrAny(T, k, rnd);
      const id = S.add(T[k], cx(k), y0, t - 0.01);
      const tl = t + FALL_T[dist];
      S.segs[id].push(t, tl + BOUNCE, cx(k), y0, cx(k), cy(k), 1);
      G[k] = id;
      if (tl + BOUNCE > tEnd) tEnd = tl + BOUNCE;
    }
  }
  return tEnd;
}
// refills may make cascades: that is the fun of the game, so pick freely
function safeTypeOrAny(T, k, rnd) { T[k] = (rnd() * NTYPES) | 0; }

/** One move at time T0 (the swap starts): returns the time the board is still again. */
function playMove(S, T, G, mask, a, b, T0, rnd) {
  const ia = G[a], ib = G[b];
  S.hints.push([T0 - HINT, T0, ia, ib]);
  S.segs[ia].push(T0, T0 + SWAP, cx(a), cy(a), cx(b), cy(b), 0);
  S.segs[ib].push(T0, T0 + SWAP, cx(b), cy(b), cx(a), cy(a), 0);
  G[a] = ib; G[b] = ia;
  let tt = T[a]; T[a] = T[b]; T[b] = tt;
  let t = T0 + SWAP, combo = 0;
  for (;;) {
    const m = findMatches(T);
    if (!m.length) break;
    combo++;
    let sx = 0, sy = 0;
    for (const k of m) { S.die[G[k]] = t; sx += cx(k); sy += cy(k); G[k] = -1; T[k] = -1; }
    if (combo >= 2) S.popups.push([t, sx / m.length + 4, sy / m.length + 4, combo >= 4 ? 2 : combo - 2]);
    t = gravity(S, T, G, mask, t + POPT, rnd) - 0.04;
  }
  return t;
}

/** Shuffle when no move is left: every jewel glides to a new cell. */
function shuffle(S, T, G, mask, t0, rnd) {
  const cells = [];
  for (let k = 0; k < NCELL; k++) if (mask[k] < 0 && G[k] !== -1) cells.push(k);
  for (let tries = 0; tries < 30; tries++) {
    const perm = cells.slice();
    for (let i = perm.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const x = perm[i]; perm[i] = perm[j]; perm[j] = x; }
    const T2 = T.slice();
    cells.forEach((k, i) => { T2[perm[i]] = T[k]; });
    if (findMatches(T2).length || !findMoves(T2).length) continue;
    const G2 = G.slice();
    cells.forEach((k, i) => {
      const id = G[k], to = perm[i];
      G2[to] = id;
      S.segs[id].push(t0, t0 + 0.7, cx(k), cy(k), cx(to), cy(to), 2);
    });
    for (let k = 0; k < NCELL; k++) { T[k] = T2[k]; G[k] = G2[k]; }
    S.shuffles.push([t0, t0 + 0.7]);
    return t0 + 0.7;
  }
  return t0 + 1;
}

const digitsOf = (f) => f.hh + f.mm;

/**
 * Simulate minute `mk` from the board `start` (types per cell, -1 empty).
 * Returns the script and the board it leaves for the next minute.
 */
function simulate(mk, start) {
  const f = clockFields(new Date(mk * 60000)), nf = clockFields(new Date((mk + 1) * 60000)), pf = clockFields(new Date((mk - 1) * 60000));
  const cur = digitsOf(f), nxt = digitsOf(nf), prv = digitsOf(pf);
  const mask = digitMask(cur), rnd = rng(mk * 7919 + 13);
  const S = new Script();
  S.cur = cur; S.nxt = nxt; S.prv = prv; S.mask = mask; S.f = f;
  const T = Int8Array.from(start), G = new Int16Array(NCELL).fill(-1);
  // what is already on the board stays where it is
  for (let k = 0; k < NCELL; k++) if (T[k] >= 0) G[k] = S.add(T[k], cx(k), cy(k), -1, T[k] === DIAMOND ? mask[k] : -1);

  // ---- the arrival: empty columns fill from the top, new numerals in them
  const hourShow = f.m === 0;
  let cols = [];
  for (let c = 0; c < COLS; c++) { let empty = false; for (let r = 0; r < ROWS; r++) if (T[r * COLS + c] === -1) empty = true; if (empty) cols.push(c); }
  S.lastLand = 0;
  const settled = dropIn(S, T, G, mask, cols, 0.0, hourShow ? 0.022 : 0.035, rnd);
  for (let i = 0; i < 4; i++) if (cur[i] !== prv[i]) {
    // when did this numeral's last stone land?
    let tl = 0;
    for (const k of digitPath(+cur[i], i).cells) { const sg = S.segs[G[k]]; if (sg.length) tl = Math.max(tl, sg[1] - BOUNCE); }
    S.arrive.push([i, +cur[i], tl]);
  }

  // ---- the play
  const toHour = nf.m === 0;
  const deadline = toHour ? 53.6 : 56.0;
  let t = Math.max(settled + 0.6, hourShow ? 3.4 : 2.0) + HINT;
  while (t < deadline) {
    const moves = findMoves(T);
    if (!moves.length) { t = shuffle(S, T, G, mask, t, rnd) + 0.5 + HINT; continue; }
    const [a, b] = moves[(rnd() * moves.length) | 0];
    // try it on a copy first: a move whose cascade would run past the deadline is not played
    const snap = { T: T.slice(), G: G.slice(), n: S.type.length, segs: S.segs.map((s) => s.length), die: S.die.slice(), h: S.hints.length, p: S.popups.length };
    const end = playMove(S, T, G, mask, a, b, t, rnd);
    if (end > deadline) {
      T.set(snap.T); G.set(snap.G);
      for (const k of ['type', 'born', 'die', 'hx', 'hy', 'segs', 'slot']) S[k].length = snap.n;
      S.segs.forEach((s, i) => { s.length = snap.segs[i]; });
      for (let i = 0; i < snap.n; i++) S.die[i] = snap.die[i];
      S.hints.length = snap.h; S.popups.length = snap.p;
      break;
    }
    t = end + 0.35 + rnd() * 0.9 + HINT;
  }

  // ---- the turn
  const out = T.slice();
  const pop = (k, tt) => { if (G[k] !== -1) { S.die[G[k]] = tt; G[k] = -1; } out[k] = -1; };
  const chain = (i, t0, t1) => {
    const p = digitPath(+cur[i], i), n = p.cells.length;
    S.chains.push([i, +cur[i], t0, t1]);
    p.cells.forEach((k, j) => pop(k, t0 + ((t1 - t0) * j) / (n - 1)));
  };
  if (toHour) {
    // the colour bomb: a jewel between the hours and the minutes turns into a prism orb
    const kb = 4 * COLS + 9, kn = kb + 1;
    S.die[G[kb]] = 54.6;
    const bomb = S.add(BOMB, cx(kb), cy(kb), 54.6);
    S.segs[bomb].push(57.0, 57.0 + SWAP, cx(kb), cy(kb), cx(kn), cy(kn), 0);
    S.segs[G[kn]].push(57.0, 57.0 + SWAP, cx(kn), cy(kn), cx(kb), cy(kb), 0);
    S.hints.push([56.4, 57.0, bomb, G[kn]]);
    G[kb] = G[kn]; G[kn] = bomb;
    const tb = 57.35, bx = cx(kn) + 4, by = cy(kn) + 4;
    S.die[bomb] = tb; G[kn] = -1; out[kn] = -1;
    S.bomb = { gem: bomb, t0: 54.6, tBlast: tb, cx: bx, cy: by };
    S.popups.push([tb + 0.1, bx, by - 6, 2]);
    // the wave: every jewel pops as the ring passes it (squared distance via a table-free isqrt)
    for (let k = 0; k < NCELL; k++) {
      if (G[k] === -1 || T[k] >= NTYPES) continue;
      const dx = cx(k) + 4 - bx, dy = cy(k) + 4 - by;
      pop(k, tb + isqrt(dx * dx + dy * dy) / 110);
    }
    for (let i = 0; i < 4; i++) if (cur[i] !== nxt[i]) chain(i, 58.7, 59.75);
  } else {
    for (let i = 0; i < 4; i++) if (cur[i] !== nxt[i]) {
      chain(i, 58.4, 59.4);
      // and the rest of its columns go in the blast
      const { c0 } = SLOTS[i];
      for (let c = c0; c < c0 + DW; c++)
        for (let r = 0; r < ROWS; r++) {
          const k = r * COLS + c;
          if (G[k] === -1) continue;
          let dmin = 9;
          for (let rr = 0; rr < ROWS; rr++) if (mask[rr * COLS + c] === i) { const d = rr > r ? rr - r : r - rr; if (d < dmin) dmin = d; }
          pop(k, 59.42 + 0.06 * (dmin > 6 ? 6 : dmin));
        }
    }
  }
  return { S, end: out };
}

function isqrt(n) {
  // integer square root (Newton), for the bomb's wave timing
  if (n <= 0) return 0;
  let x = n, y = (x + 1) >> 1;
  while (y < x) { x = y; y = (x + ((n / x) | 0)) >> 1; }
  return x;
}

// ------------------------------------------------------------ the cache

const ENDS = new Map(), SCRIPTS = new Map();

/** The board as the hour starts: the unchanged numerals' diamonds only. */
function hourStart(mk) {
  const f = clockFields(new Date(mk * 60000)), pf = clockFields(new Date((mk - 1) * 60000));
  const cur = digitsOf(f), prv = digitsOf(pf), mask = digitMask(cur);
  const T = new Int8Array(NCELL).fill(-1);
  for (let k = 0; k < NCELL; k++) if (mask[k] >= 0 && cur[mask[k]] === prv[mask[k]]) T[k] = DIAMOND;
  return T;
}

function endOf(mk) {
  if (ENDS.has(mk)) return ENDS.get(mk);
  // walk forward from the start of the hour (or the last minute we know)
  const m = clockFields(new Date(mk * 60000)).m;
  let k0 = mk - m;
  for (let k = mk - 1; k >= mk - m; k--) if (ENDS.has(k)) { k0 = k + 1; break; }
  for (let k = k0; k <= mk; k++) {
    const start = k === mk - m ? hourStart(k) : ENDS.get(k - 1);
    const { S, end } = simulate(k, start);
    ENDS.set(k, end);
    if (k === mk) SCRIPTS.set(k, S);
  }
  if (ENDS.size > 200) for (const k of [...ENDS.keys()].slice(0, 100)) ENDS.delete(k);
  return ENDS.get(mk);
}

/** The script for minute mk (built and cached on first use). */
export function scriptFor(mk) {
  if (SCRIPTS.has(mk)) return SCRIPTS.get(mk);
  const m = clockFields(new Date(mk * 60000)).m;
  const start = m === 0 ? hourStart(mk) : endOf(mk - 1);
  const { S, end } = simulate(mk, start);
  ENDS.set(mk, end);
  SCRIPTS.set(mk, S);
  if (SCRIPTS.size > 6) SCRIPTS.delete(SCRIPTS.keys().next().value);
  return S;
}
