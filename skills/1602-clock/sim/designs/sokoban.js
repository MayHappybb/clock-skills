// Sokoban — the time is a solved Sokoban level.
//
// The glass is a warehouse floor seen from above. Every cell is split into
// two slots (dot rows 0-3 and 4-7), so the floor is 16 x 4 slots, and a crate
// fills one: 5 x 3 dots, with a dark row under it so stacked crates stay
// apart. Each digit is twelve slots, 3 x 4, built of crates, and the cell
// seams are the joins between the floor tiles.
//
// Each minute the keeper solves the next level: he pushes the old digit's
// crates into the shape of the new one, by real Sokoban moves (he cannot
// pull, and pushes at most a short line of three). Spare crates go out
// through the edge of the glass into the hallway that runs round it, and new
// ones are shoved in from there, so he disappears off the edge and comes back
// behind a crate. As in the game, a crate sitting on its goal is solid, a
// crate that still has to move is hollow, and an empty goal is a small
// diamond, so mid-move the glass shows exactly what is left to do.
//
// Every turn is solved by a breadth-first search (solveDigit) and the plans
// are written into PLANS below. No state between the old digit and the new
// one is shaped like any digit, and when several digits turn at once each is
// left one push from done until the last, so the glass never shows a time
// that is wrong. On the hour the level is cleared: every crate blinks and he
// jumps once per hour. Between jobs he idles in the aisle between hours and
// minutes; at night he sleeps there, z's rising in ROM.
//
// Budget: three crate tiles for any finished time (top, bottom, both), one
// for him; hollow crates and goals are extras, dropped (goals first) if a
// frame runs out of slots.

import { TileAllocator } from '../js/kit.js';

// 3 x 4 crate font: rows top to bottom, '#' a crate.
export const FONT = {
  0: ['###', '#.#', '#.#', '###'],
  1: ['##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '#..', '###'],
  3: ['###', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#'],
  5: ['###', '#..', '..#', '###'],
  6: ['#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.'],
  8: ['###', '.#.', '#.#', '###'],
  9: ['###', '#.#', '###', '..#'],
};

// Where each digit's box starts, and the region its plan may use: the box,
// the aisle beside it, and the glass edge if it has one. Neighbours share an
// aisle, so every plan leaves its aisle empty before its last push, and
// digits that turn together never get in each other's way.
const BOX = [0, 4, 9, 13];
const REGION = [
  { cols: [0, 1, 2, 3], box: 0, left: true, right: false },
  { cols: [3, 4, 5, 6, 7], box: 1, left: false, right: false },
  { cols: [8, 9, 10, 11, 12], box: 1, left: false, right: false },
  { cols: [12, 13, 14, 15], box: 1, left: false, right: true },
];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_RUN = 3;

const bit = (lc, y) => 1 << (lc * 4 + y);
function boxMask(digit, boxLc) {
  let m = 0;
  FONT[digit].forEach((row, y) => [...row].forEach((ch, c) => { if (ch === '#') m |= bit(boxLc + c, y); }));
  return m;
}

/**
 * Solve one digit's turn as a Sokoban puzzle in its region, by breadth-first
 * search over pushes. The worker walks through empty slots and the hallway
 * that runs round the outside of the glass; he can push a crate out through
 * the top or bottom (or an outer edge), or push one in from the hallway.
 * No state between start and finish may look like a digit, so the glass
 * never shows a wrong time, and the state before the last push may not
 * either, so the last push of several digits can be held back to the end.
 * Returns a list of actions in local coordinates.
 */
export function solveDigit(k, from, to) {
  const R = REGION[k];
  const W = R.cols.length;
  const start = boxMask(from, R.box);
  const goal = boxMask(to, R.box);
  let boxAll = 0;
  for (let c = 0; c < 3; c++) for (let y = 0; y < 4; y++) boxAll |= bit(R.box + c, y);
  const digitShapes = new Set(Object.keys(FONT).map((d) => boxMask(d, R.box)));
  const exitDir = (lc, y, dx, dy) =>
    (dy === -1 && y === 0) || (dy === 1 && y === 3) || (dx === -1 && lc === 0 && R.left) || (dx === 1 && lc === W - 1 && R.right);
  const inside = (lc, y) => lc >= 0 && lc < W && y >= 0 && y < 4;
  const HALL = -1;

  // Reachable worker positions (slot indices; HALL for the hallway).
  function reach(mask, wpos) {
    const seen = new Uint8Array(W * 4);
    let hall = wpos === HALL;
    const q = [];
    if (wpos !== HALL) { seen[wpos] = 1; q.push(wpos); }
    const enterFromHall = () => {
      for (let lc = 0; lc < W; lc++) for (let y = 0; y < 4; y++) {
        const i = lc * 4 + y;
        if (seen[i] || (mask >> i) & 1) continue;
        if (DIRS.some(([dx, dy]) => exitDir(lc, y, dx, dy))) { seen[i] = 1; q.push(i); }
      }
    };
    if (hall) enterFromHall();
    while (q.length) {
      const i = q.pop();
      const lc = i >> 2, y = i & 3;
      for (const [dx, dy] of DIRS) {
        if (exitDir(lc, y, dx, dy)) { if (!hall) { hall = true; enterFromHall(); } continue; }
        const nl = lc + dx, ny = y + dy;
        if (!inside(nl, ny)) continue;
        const j = nl * 4 + ny;
        if (seen[j] || (mask >> j) & 1) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return { seen, hall };
  }
  const canon = (r) => {
    if (r.hall) return HALL;
    for (let i = 0; i < r.seen.length; i++) if (r.seen[i]) return i;
    return HALL;
  };
  const okMid = (mask) => { const b = mask & boxAll; return b === start || !digitShapes.has(b); };

  const key = (m, w) => m * 32 + (w + 1);
  const r0 = reach(start, HALL);
  const startKey = key(start, canon(r0));
  const prev = new Map([[startKey, null]]);
  let frontier = [{ mask: start, w: canon(r0), r: r0, k: startKey }];
  for (let depth = 0; depth < 40 && frontier.length; depth++) {
    const next = [];
    for (const s of frontier) {
      const moves = [];
      for (let lc = 0; lc < W; lc++) for (let y = 0; y < 4; y++) {
        const i = lc * 4 + y;
        if ((s.mask >> i) & 1) {
          for (const [dx, dy] of DIRS) {
            // worker stands behind the crate
            const bl = lc - dx, by = y - dy;
            let ok;
            if (inside(bl, by)) ok = s.r.seen[bl * 4 + by] === 1;
            else ok = exitDir(lc, y, -dx, -dy) && s.r.hall;
            if (!ok) continue;
            // the run of crates in front of him, pushed together
            let n = 1, el = lc, ey = y, out = false, blocked = false;
            for (;;) {
              if (exitDir(el, ey, dx, dy)) { out = true; break; }
              const tl = el + dx, ty = ey + dy;
              if (!inside(tl, ty)) { blocked = true; break; }
              if (!((s.mask >> (tl * 4 + ty)) & 1)) break;
              el = tl; ey = ty; n++;
            }
            if (blocked || n > MAX_RUN) continue;
            if (out && !inside(bl, by)) continue;      // can't push from outside to outside
            let m = s.mask;
            for (let j = n - 1; j >= 0; j--) {
              const cl = lc + dx * j, cy = y + dy * j;
              m &= ~(1 << (cl * 4 + cy));
              if (!(out && j === n - 1)) m |= 1 << ((cl + dx) * 4 + cy + dy);
            }
            moves.push({ type: out ? 'remove' : 'push', lc, y, dx, dy, n, mask: m, w: i });
          }
        } else if (s.r.hall) {
          for (const [dx, dy] of DIRS) {
            if (!exitDir(lc, y, dx, dy)) continue;      // delivered from that side, inward
            moves.push({ type: 'deliver', lc, y, dx: -dx, dy: -dy, mask: s.mask | (1 << i), w: HALL });
          }
        }
      }
      for (const mv of moves) {
        const r = reach(mv.mask, mv.w);
        const isGoal = (mv.mask & boxAll) === goal && (mv.mask & ~boxAll) === 0 && r.hall;
        if (isGoal) {
          {
            const pb = s.mask & boxAll;
            if (!digitShapes.has(pb) && (s.mask & ~boxAll) === 0) {
              const path = [mv];
              for (let p = prev.get(s.k); p; p = prev.get(p.from)) path.push(p.mv);
              return path.reverse().map(({ type, lc, y, dx, dy, n }) => ({ type, x: R.cols[lc], y, dx, dy, n: n ?? 1 }));
            }
          }
          continue;
        }
        if (!okMid(mv.mask)) continue;
        const kk = key(mv.mask, canon(r));
        if (prev.has(kk)) continue;
        prev.set(kk, { from: s.k, mv });
        next.push({ mask: mv.mask, w: canon(r), r, k: kk });
      }
    }
    frontier = next;
  }
  return null;
}

// ------------------------------------------------------------------ pictures

// A slot is four dot rows: a crate is three of them, the fourth is the gap
// that keeps stacked crates apart.
const SLOT = {
  E: ['.....', '.....', '.....', '.....'],
  S: ['#####', '#####', '#####', '.....'],   // crate on its goal: solid
  H: ['#####', '#...#', '#####', '.....'],   // crate still to be moved: hollow
  G: ['..#..', '.#.#.', '..#..', '.....'],   // an empty goal
};

// The warehouse keeper, 5 x 4, drawn facing right; facing left is mirrored.
const MAN = {
  front: ['.###.', '..#..', '.###.', '.#.#.'],   // cap, head, arms, legs
  tap:   ['.###.', '..#..', '.###.', '#..#.'],
  look:  ['.###.', '...#.', '.###.', '.#.#.'],
  watch: ['.....', '.###.', '.####', '.#.#.'],   // head down to his wrist
  tip:   ['###..', '..#..', '.###.', '.#.#.'],   // tips his cap
  stand: ['.###.', '...#.', '.###.', '.#.#.'],
  step:  ['.###.', '...#.', '.###.', '..#..'],
  lean:  ['.....', '.###.', '..###', '.#.#.'],   // crouched, hands on the crate
  push:  ['..###', '...#.', '.####', '#..#.'],
  up:    ['#.#.#', '.###.', '.###.', '.#.#.'],
  down:  ['.....', '.###.', '.###.', '#.#.#'],
  cheer: ['#.#.#', '.###.', '.###.', '#...#'],
  sleep: ['.....', '.....', '##...', '#####'],   // flat out on the floor, cap over his face
  sleep2: ['.....', '.....', '##.#.', '#####'],  // ...breathing
};
/** A crate part-way through the edge of the glass: side U, D, L or R. */
function peek(crate, side) {
  const c = [...crate.slice(0, 3), '.....'];
  if (side === 'U') return [c[1], c[2], '.....', '.....'];
  if (side === 'D') return ['.....', '.....', c[0], c[1]];
  if (side === 'L') return c.map((r) => r.slice(3) + '...');
  return c.map((r) => '...' + r.slice(0, 2));
}
const sideOf = (dx, dy) => (dy < 0 ? 'U' : dy > 0 ? 'D' : dx < 0 ? 'L' : 'R');
const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

// ------------------------------------------------------------------ the job

const T_WALK = 0.2, T_HALL = 0.15, T_LEAN = 0.25, T_PUSH = 0.35, T_DELIVER = 0.3, T_PEEK = 0.2;
const HOME = { x: 7, y: 1 };

// Every digit turn the day contains, solved by solveDigit() and written down,
// so a frame never waits for a search. Key: digit position, from, to. Each
// action is type (push / remove / deliver), column (hex), slot row,
// direction, and how many crates move in the line.
const PLANS = {
  '001': 'p01R1 p02R1 r20L3 r21D3 r22D2',
  '012': 'p11R1 p12L1 d20D1',
  '020': 'd01R1 p20D2 d20D1',
  '101': 'p41R1 p62L1 r42D2 r61U2 r60U1',
  '112': 'p51R1 p52L1 d60D1',
  '123': 'p42R1 p50D1 d50D1 p52R1',
  '134': 'p40D1 d40D1 r51U2 r50U1 p43U1 p53U1',
  '145': 'r42U3 d43U1 p52D1 p61L1 p51U1',
  '156': 'p40D2 d40D1 p50D1 p60D1',
  '167': 'p63U3 r62U3 p51U1 p42R1 r41U2 r43D1',
  '178': 'd43U1 p52R1 p43U1 d43U1 p61L1 d63U1',
  '189': 'p51R1 p43U2 p53U1',
  '190': 'd43U1 p52U1 r51U2 d53U1',
  '130': 'p40D1 d40D1 r51U2 p40D2 d40D1',
  '201': 'p91R1 pb2L1 r92D2 rb1U2 rb0U1',
  '212': 'pa1R1 pa2L1 db0D1',
  '223': 'p92R1 pa0D1 da0D1 pa2R1',
  '234': 'p90D1 d90D1 ra1U2 ra0U1 p93U1 pa3U1',
  '245': 'r92U3 d93U1 pa2D1 pb1L1 pa1U1',
  '250': 'p90D2 d90D1 pb0D1 db0D1',
  '301': 'pd1R1 pf2L1 rd2D2 rf1U2 rf0U1',
  '312': 'pe1R1 pe2L1 df0L1',
  '323': 'pd2R1 pe0D1 de0D1 pe2R1',
  '334': 'pd0D1 dd0D1 pd3U1 pe0D2 re1D3 re3R2',
  '345': 'rd2R3 dd3U1 pe2D1 de0D1 rf1R1',
  '356': 'pd0D2 dd0D1 pe0D1 pf0D1',
  '367': 'rd1R3 rd2D2 rd3R3 pe1U1 pf3U3 pf2L1',
  '378': 'dd3U1 pe2L1 pf1L1 df2L1 df3L1',
  '389': 'pe1R1 pd3U2 pe3U1',
  '390': 'dd3U1 pe2U1 re1U2 de3U1',
};
const DIR = { R: [1, 0], L: [-1, 0], D: [0, 1], U: [0, -1] };
const TYPE = { p: 'push', r: 'remove', d: 'deliver' };
const plans = new Map();
function plan(k, a, b) {
  const key = `${k}${a}${b}`;
  if (!plans.has(key)) {
    const src = PLANS[key];
    plans.set(key, src ? src.split(' ').map((w) => ({
      type: TYPE[w[0]], x: parseInt(w[1], 16), y: +w[2], dx: DIR[w[3]][0], dy: DIR[w[3]][1], n: +w[4],
    })) : solveDigit(k, a, b));
  }
  return plans.get(key);
}

function digitsOf(f) { return [f.hh[0], f.hh[1], f.mm[0], f.mm[1]]; }
function cratesFor(digits) {
  const g = new Uint8Array(64);
  digits.forEach((d, k) => FONT[d].forEach((row, y) => [...row].forEach((ch, c) => {
    if (ch === '#') g[y * 16 + BOX[k] + c] = 1;
  })));
  return g;
}
const onGlass = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 4;

/** Shortest walk on the glass and round the hallway outside it. */
function walk(crates, from, to) {
  const id = (x, y) => (y + 1) * 18 + (x + 1);
  const ok = (x, y) => x >= -1 && x <= 16 && y >= -1 && y <= 4 && (!onGlass(x, y) || !crates[y * 16 + x]);
  const dist = new Map([[id(from.x, from.y), 0]]), prev = new Map();
  const open = [{ x: from.x, y: from.y, d: 0 }];
  while (open.length) {
    open.sort((p, q) => p.d - q.d);
    const c = open.shift();
    if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx, ny = c.y + dy;
      if (!ok(nx, ny)) continue;
      const nd = c.d + (onGlass(nx, ny) ? T_WALK : T_HALL);
      const nid = id(nx, ny);
      if (dist.has(nid) && dist.get(nid) <= nd) continue;
      dist.set(nid, nd); prev.set(nid, c);
      open.push({ x: nx, y: ny, d: nd });
    }
  }
  const path = [];
  for (let c = to; c && !(c.x === from.x && c.y === from.y); c = prev.get(id(c.x, c.y))) path.push({ x: c.x, y: c.y });
  return path.reverse();
}

/** Where the worker stands for an action (may be in the hallway). */
const standFor = (a) => ({ x: a.x - a.dx, y: a.y - a.dy });

/** The first place the minute's job needs him, if it is on the glass. */
function firstSpot(oldD, newD) {
  const k = [3, 2, 1, 0].find((q) => oldD[q] !== newD[q]);
  const p = k === undefined ? null : plan(k, oldD[k], newD[k]);
  if (!p || !p.length) return null;
  const s = standFor(p[0]);
  return onGlass(s.x, s.y) ? { ...s, face: p[0].dx || 1, pose: p[0].dy < 0 ? 'up' : p[0].dy > 0 ? 'down' : 'lean' } : null;
}

/**
 * The minute's job as keyframes: { t, dur, crates, x, y, pose, face }.
 * Digits are worked right to left. When several change, each is taken to
 * one push from done, and the last pushes are made together at the end, so
 * no moment shows a time that is wrong.
 */
export function buildJob(oldD, newD) {
  const frames = [];
  let t = 0;
  const spot = firstSpot(oldD, newD) ?? HOME;
  const st = { crates: cratesFor(oldD), x: spot.x, y: spot.y, face: spot.face ?? 1, stepN: 0 };
  const emit = (dur, pose, edge = null) => {
    frames.push({ t, dur, crates: st.crates.slice(), x: st.x, y: st.y, pose, face: st.face, edge });
    t += dur;
  };
  const goTo = (to) => {
    for (const p of walk(st.crates, st, to)) {
      if (p.x !== st.x) st.face = p.x > st.x ? 1 : -1;
      const vis = onGlass(p.x, p.y);
      st.x = p.x; st.y = p.y; st.stepN++;
      emit(vis ? T_WALK : T_HALL, st.stepN % 2 ? 'step' : 'stand');
    }
  };
  const act = (a, last) => {
    const pose = a.dy < 0 ? 'up' : a.dy > 0 ? 'down' : 'push';
    goTo(standFor(a));
    if (a.dx) st.face = a.dx;
    if (a.type === 'deliver') {
      // shoved in from the hallway: it shows half-way through the edge first
      emit(T_PEEK, pose, { x: a.x, y: a.y, side: sideOf(-a.dx, -a.dy) });
      st.crates[a.y * 16 + a.x] = 1;
      emit(T_DELIVER, pose);
    } else {
      emit(T_LEAN * (1 + 0.6 * (a.n - 1)), a.dy ? pose : 'lean');   // set his feet; a line takes longer
      if (a.type === 'remove' && a.n === 1) {
        st.crates[a.y * 16 + a.x] = 0;
        emit(T_PEEK, pose, { x: a.x, y: a.y, side: sideOf(a.dx, a.dy) });
      }
      for (let j = a.n - 1; j >= 0; j--) {
        const cx = a.x + a.dx * j, cy = a.y + a.dy * j;
        st.crates[cy * 16 + cx] = 0;
        const nx = cx + a.dx, ny = cy + a.dy;
        if (onGlass(nx, ny)) st.crates[ny * 16 + nx] = 1;
      }
      st.x = a.x; st.y = a.y;
      emit(T_PUSH, pose);                              // shove: clunk
    }
    if (last && onGlass(st.x, st.y)) emit(0.3, 'front');   // a glance at the result
  };
  const changed = [3, 2, 1, 0].filter((k) => oldD[k] !== newD[k]);
  const finals = [];
  for (const k of changed) {
    const p = plan(k, oldD[k], newD[k]);
    if (!p) continue;
    const hold = changed.length > 1 ? 1 : 0;
    p.slice(0, p.length - hold).forEach((a, i) => act(a, !hold && i === p.length - 1));
    if (hold) finals.push(p[p.length - 1]);
  }
  finals.forEach((a) => act(a, true));
  goTo(HOME);
  st.face = 1;
  return { frames, end: t };
}

const jobs = new Map();
function jobFor(oldD, newD) {
  const key = oldD.join('') + newD.join('');
  if (!jobs.has(key)) {
    if (jobs.size > 8) jobs.clear();
    jobs.set(key, buildJob(oldD, newD));
  }
  return jobs.get(key);
}

// ------------------------------------------------------------------ idle

// Between jobs he keeps himself busy in the aisle between hours and
// minutes, in four-second turns: tapping a foot, looking about, pacing a lap
// of the aisle, checking his watch. Something moves every half second.
const LAP = [[7, 1], [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [7, 3], [7, 2]];
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function idle(sec, seed, night) {
  const seg = Math.floor(sec / 4), u = sec - seg * 4, half = Math.floor(u * 2);
  const at = (pose, face = 1, x = HOME.x, y = HOME.y) => ({ x, y, pose, face });
  if (night) {
    // Night shift: he naps in the aisle, breathing every two seconds, and
    // sits bolt upright when the minute is nearly up.
    if (sec >= 57) return at(sec < 57.6 ? 'cheer' : 'front');
    return { ...at(Math.floor(sec / 2) % 2 ? 'sleep2' : 'sleep'), zz: Math.floor(sec) % 3 };
  }
  const kind = Math.floor(hash(seed * 17 + seg) * 5);
  if (kind === 0) {                                   // pace a lap of the aisle
    const i = Math.min(LAP.length, half);
    const [x, y] = LAP[i % LAP.length];
    const [px] = LAP[(i + LAP.length - 1) % LAP.length];
    return at(i === LAP.length ? 'front' : half % 2 ? 'step' : 'stand', x < px ? -1 : x > px ? 1 : 1, x, y);
  }
  if (kind === 1) {                                   // look about
    return half < 2 ? at('look', -1) : half < 4 ? at('look', 1) : at(half % 2 ? 'tap' : 'front');
  }
  if (kind === 2) {                                   // check the watch
    return half === 1 || half === 2 || half === 5 ? at('watch') : at(half % 2 ? 'tap' : 'front');
  }
  return at(half % 2 ? 'tap' : 'front');              // tap a foot
}

/** From :56 he walks to where the next job starts and gets ready. */
function anticipate(sec, crates, spot) {
  if (!spot) return sec >= 58 ? { ...HOME, pose: Math.floor(sec * 3) % 2 ? 'lean' : 'front', face: 1 } : null;
  const path = walk(crates, HOME, spot);
  const tWalk = path.reduce((a, p) => a + (onGlass(p.x, p.y) ? T_WALK : T_HALL), 0);
  const t0 = 59.4 - tWalk - 0.8;
  if (sec < Math.min(t0, 56)) return null;
  const go = Math.min(t0, 56);
  let tt = go, prev = HOME;
  for (let i = 0; i < path.length; i++) {
    const d = onGlass(path[i].x, path[i].y) ? T_WALK : T_HALL;
    if (sec < tt + d) {
      const p = path[i];
      return { x: p.x, y: p.y, pose: i % 2 ? 'stand' : 'step', face: p.x < prev.x ? -1 : p.x > prev.x ? 1 : (spot.face ?? 1) };
    }
    tt += d; prev = path[i];
  }
  // Ready: crouched at the crate, bouncing on his heels.
  return { x: spot.x, y: spot.y, face: spot.face, pose: Math.floor((sec - tt) * 3) % 2 ? spot.pose : 'stand' };
}

// ------------------------------------------------------------------ hour

// On the hour, once the new hour is pushed into place: LEVEL CLEAR. Every
// crate blinks three times, then the keeper jumps for joy once for each
// hour on a twelve-hour dial, as a cuckoo would call it, and tips his cap.
const clearLength = (h) => 2.4 + (h % 12 || 12) * 0.5 + 1;
function levelClear(u, h) {
  if (u < 2.4) {
    const beat = Math.floor(u / 0.4);
    return { flash: beat % 2 === 0, man: { x: HOME.x, y: HOME.y, pose: beat % 2 ? 'front' : 'cheer', face: 1 } };
  }
  const v = u - 2.4, hops = h % 12 || 12, i = Math.floor(v / 0.5);
  if (i < hops) {
    const up = v - i * 0.5 < 0.25;
    return { flash: false, man: { x: HOME.x, y: HOME.y - (up ? 1 : 0), pose: up ? 'cheer' : 'front', face: 1 } };
  }
  return { flash: false, man: { x: HOME.x, y: HOME.y, pose: 'tip', face: 1 } };
}

// ------------------------------------------------------------------ drawing

function slotPicture(crate, target) {
  if (crate) return target ? SLOT.S : SLOT.H;
  return target ? SLOT.G : SLOT.E;
}

export default {
  name: 'Sokoban',
  blurb: 'The time is a Sokoban level built of crates; every minute a tiny warehouse keeper pushes the old digits into the new ones.',
  bus: 'i2c100',
  panel: 'green',
  fps: 10,

  frame(lcd, api, { fields, date, kit }) {
    const sec = fields.s + fields.ms / 1000;
    const minuteStart = date.getTime() - fields.s * 1000 - fields.ms;
    const newD = digitsOf(fields);
    const oldD = digitsOf(kit.clockFields(new Date(minuteStart - 60000)));
    const nextD = digitsOf(kit.clockFields(new Date(minuteStart + 60000)));
    const targets = cratesFor(newD);
    const job = jobFor(oldD, newD);
    const seed = Math.floor(minuteStart / 60000);

    let crates = targets, man, flash = false, edge = null;
    if (sec < job.end) {
      const f = job.frames.find((q) => sec < q.t + q.dur) ?? job.frames[job.frames.length - 1];
      crates = f.crates;
      man = f;
      edge = f.edge;
    } else if (fields.m === 0 && sec < job.end + clearLength(fields.h)) {
      ({ flash, man } = levelClear(sec - job.end, fields.h));
    } else {
      const night = fields.h < 6;
      man = (night && sec < 57.6 ? null : anticipate(sec, targets, firstSpot(newD, nextD))) ?? idle(sec, seed, night);
    }

    // Each slot's picture, then each cell as its two slots.
    // Each slot's picture at three levels of detail: plain (every crate
    // solid, no goals), with the hollow crates still to move, and with the
    // empty goals too. Cells are allocated plain first, then upgraded, so if
    // slots run out a cell loses a goal mark before a crate loses its hollow.
    const levels = [[], [], []];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
      const c = crates[y * 16 + x], g = targets[y * 16 + x];
      let full = flash && c ? SLOT.H : slotPicture(c, g);
      let mid = c ? full : SLOT.E, plain = c ? SLOT.S : SLOT.E;
      if (edge && edge.x === x && edge.y === y) full = mid = plain = peek(SLOT.H, edge.side);
      const m0 = MAN[man.pose] ?? MAN.stand, m = man.face < 0 ? mirror(m0) : m0;
      if (onGlass(man.x, man.y)) {
        if (man.x === x && man.y === y) full = mid = plain = m;
      } else if (!c && !(edge && edge.x === x && edge.y === y)) {
        // Out in the hallway he is just past the edge: what shows is the
        // part of him nearest the glass, his legs below the top edge, his cap
        // above the bottom one, half of him at the ends.
        let p = null;
        if (man.y === -1 && man.x === x && y === 0) p = [m[2], m[3], '.....', '.....'];
        if (man.y === 4 && man.x === x && y === 3) p = ['.....', '.....', m[0], m[1]];
        if (man.x === -1 && man.y === y && x === 0) p = m.map((r) => r.slice(3) + '...');
        if (man.x === 16 && man.y === y && x === 15) p = m.map((r) => '...' + r.slice(0, 2));
        if (p) full = mid = plain = p;
      }
      levels[0].push(plain); levels[1].push(mid); levels[2].push(full);
    }
    const tileOf = (src, col, row) => [...src[row * 32 + col], ...src[row * 32 + 16 + col]];
    const blank = (t) => t.every((l) => l === '.....');
    const alloc = new TileAllocator(lcd, 0);
    const codes = Array(32).fill(0x20);
    levels.forEach((src, lv) => {
      for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
        const t = tileOf(src, col, row);
        if (blank(t)) continue;
        const c = alloc.add(t);
        if (c !== null) codes[row * 16 + col] = c;
      }
    });
    alloc.flush();
    // His z's are ROM letters in the empty cells of the aisle, rising.
    if (man.zz !== undefined) {
      const [row, ch] = [[1, 'z'], [0, 'z'], [0, 'Z']][man.zz];
      if (codes[row * 16 + 8] === 0x20) codes[row * 16 + 8] = ch.charCodeAt(0);
    }
    for (let row = 0; row < 2; row++) {
      lcd.setCursor(0, row);
      for (let col = 0; col < 16; col++) lcd.data(codes[row * 16 + col]);
    }
  },
};
