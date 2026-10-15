// Snake — four snakes, each curled up into a digit.
//
// The phone game's snake, made of 5x2 segments, one a cell wide, five rows of
// them down both character rows; the cell gaps and the dark row between
// segments are the seams of its body. Each digit of HH:MM is a snake lying
// coiled along a walk that covers a 3x5 numeral. Three sleep. The minutes'
// last digit is awake: its head rests outside the digit, a round face in the
// right-hand column with its neck on the last segment, flicking its tongue
// every second, glancing about, blinking, yawning at the half minute.
//
// From :52 an apple sits in the column beside each snake that is about to
// change. The face watches it, the tongue goes faster, the mouth opens. At
// :00 the snake slithers out of its digit, eats the apple on the way, goes
// off the edge of the glass and wraps round from the other edge of the same
// column, as in the game, and draws the new digit head first, its tail
// pulling in last. The old digit has always left before the new one starts,
// so the glass shows gaps, never a mix of two digits. When several digits
// change, the snakes go one at a time, right to left out and left to right
// back. On the hour all four go, and the empty glass says LEVEL and the hour.
//
// Budget. With every segment a whole cell wide, a cell's picture is just
// which of its segment rows are filled: seven for a top cell, three for a
// bottom one. A resting time needs 3-6 of those, the face one more, and an
// apple on its own is ROM 0xa5 (it grows a stalk and leaf only with a slot to
// spare). A snake on the move makes column patterns the resting digits do
// not use, so every turn is chosen from a list of routes by simulating it:
// the first one that never needs more than eight slots wins. The routes and
// which way each digit's snake lies were found by search: see `routes` and
// the WALKS table.

import { TileAllocator, noise } from '../js/kit.js';

const FPS = 12;
const STEP = 1 / 6;            // seconds per move: two frames, past the glass's 150 ms

// ------------------------------------------------------------------- grid
// The playfield is 16 columns (one per cell) by 5 rows of segments. A segment
// is a 5x2 brick; the dark row under it and the cell gap beside it are the
// seams between segments, as in the phone game.
const SEG_Y = [0, 3, 6, 9, 12];  // first dot row of each segment row (8-15 are the bottom cells)
const DIGIT_X = [0, 4, 8, 12];   // left column of each digit
const ARENA_X = [3, 7, 11, 15];  // the column each snake leaves its digit into
const COLON_X = 7;

const P = (s) => s.split(' ').map((p) => p.split(',').map(Number));
// Each digit is one snake, tail to head, and may lie over itself where a
// stroke branches; the drawing is the union. Which way each snake lies was
// chosen, per digit slot, by searching every covering walk for the set that
// makes the slot's whole cycle of turns shortest (0-9, 0-5, 0-2, and 3->0
// at midnight for the hours).
export const WALKS = [
  {
    0: P('2,0 1,0 0,0 0,1 0,2 0,3 0,4 1,4 2,4 2,3 2,2 2,1'),
    1: P('1,0 0,0 1,0 1,1 1,2 1,3 1,4 0,4 1,4 2,4'),
    2: P('2,0 1,0 0,0 1,0 2,0 2,1 2,2 1,2 0,2 0,3 0,4 1,4 2,4'),
  },
  {
    0: P('1,0 2,0 2,1 2,2 2,3 2,4 1,4 0,4 0,3 0,2 0,1 0,0'),
    1: P('2,4 1,4 0,4 1,4 1,3 1,2 1,1 1,0 0,0 1,0'),
    2: P('2,4 1,4 0,4 0,3 0,2 1,2 2,2 2,1 2,0 1,0 0,0 1,0 2,0'),
    3: P('2,4 1,4 0,4 1,4 2,4 2,3 2,2 1,2 2,2 2,1 2,0 1,0 0,0'),
    4: P('0,0 0,1 0,2 1,2 2,2 2,1 2,0 2,1 2,2 2,3 2,4'),
    5: P('2,0 1,0 0,0 0,1 0,2 1,2 2,2 2,3 2,4 1,4 0,4 1,4 2,4'),
    6: P('2,0 1,0 0,0 0,1 0,2 0,3 0,4 1,4 2,4 2,3 2,2 1,2'),
    7: P('2,4 2,3 2,2 2,1 2,0 1,0 0,0 1,0 2,0'),
    8: P('2,0 1,0 0,0 0,1 0,2 1,2 0,2 0,3 0,4 1,4 2,4 2,3 2,2 2,1'),
    9: P('1,4 0,4 1,4 2,4 2,3 2,2 2,1 2,0 1,0 0,0 0,1 0,2 1,2'),
  },
  {
    0: P('2,4 1,4 0,4 0,3 0,2 0,1 0,0 1,0 2,0 2,1 2,2 2,3'),
    1: P('0,0 1,0 1,1 1,2 1,3 1,4 0,4 1,4 2,4'),
    2: P('2,0 1,0 0,0 1,0 2,0 2,1 2,2 1,2 0,2 0,3 0,4 1,4 2,4'),
    3: P('2,4 1,4 0,4 1,4 2,4 2,3 2,2 1,2 2,2 2,1 2,0 1,0 0,0'),
    4: P('0,0 0,1 0,2 1,2 2,2 2,3 2,4 2,3 2,2 2,1 2,0'),
    5: P('2,4 1,4 0,4 1,4 2,4 2,3 2,2 1,2 0,2 0,1 0,0 1,0 2,0'),
  },
  {
    0: P('2,3 2,4 1,4 0,4 0,3 0,2 0,1 0,0 1,0 2,0 2,1 2,2 3,2'),
    1: P('0,0 1,0 1,1 1,2 1,3 1,4 0,4 1,4 2,4 3,4'),
    2: P('2,4 1,4 0,4 0,3 0,2 1,2 2,2 2,1 2,0 1,0 0,0 1,0 2,0 2,1 2,2 3,2'),
    3: P('1,0 0,0 1,0 2,0 2,1 2,2 1,2 2,2 2,3 2,4 1,4 0,4 1,4 2,4 3,4'),
    4: P('2,4 2,3 2,2 1,2 0,2 0,1 0,0 0,1 0,2 1,2 2,2 2,1 2,0 3,0'),
    5: P('2,0 1,0 0,0 0,1 0,2 1,2 2,2 2,3 2,4 1,4 0,4 1,4 2,4 3,4'),
    6: P('2,2 1,2 2,2 2,3 2,4 1,4 0,4 0,3 0,2 0,1 0,0 1,0 2,0 3,0'),
    7: P('2,0 1,0 0,0 1,0 2,0 2,1 2,2 2,3 2,4 3,4'),
    8: P('2,3 2,4 1,4 0,4 0,3 0,2 1,2 0,2 0,1 0,0 1,0 2,0 2,1 2,2 3,2'),
    9: P('2,1 2,0 1,0 0,0 0,1 0,2 1,2 2,2 2,3 2,4 1,4 0,4 1,4 2,4 3,4'),
  },
];
const digitPath = (d, k) => WALKS[k][d].map(([x, y]) => [x + DIGIT_X[k], y]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// ------------------------------------------------------------------ canvas
/** The glass as an 80x16 field of dots (no gap columns: dot 5 is the next cell's first). */
class Canvas {
  constructor() { this.d = Array.from({ length: 16 }, () => new Uint8Array(80)); }
  set(gx, gy, v = 1) { if (gx >= 0 && gx < 80 && gy >= 0 && gy < 16) this.d[gy][gx] = v; }
  /** Rows of '#' (light) / '.' (clear) / ' ' (leave), top-left at (gx, gy). */
  stamp(gx, gy, rows) {
    rows.forEach((line, r) => [...line].forEach((ch, i) => {
      if (ch === '#') this.set(gx + i, gy + r, 1);
      else if (ch === '.') this.set(gx + i, gy + r, 0);
    }));
  }
  seg(x, y) { this.stamp(x * 5, SEG_Y[y], ['#####', '#####']); }
  tile(col, row) {
    return Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 5 }, (_, i) => (this.d[row * 8 + r][col * 5 + i] ? '#' : '.')).join(''));
  }
}
// ----------------------------------------------------------------- planner
// A turn is one slither along a route: the old digit, a way out past the
// apple and off the edge of the glass, a while out of sight, a way back in,
// then the new digit. The body is a window on the route: the head moves a
// segment a step and the tail follows, pausing after the apple to grow (or
// hurrying, to shrink) to the new digit's length.

/** Body window [tail, head] (route indices) at step s. */
function bodyWindow(L0, L1, sA, s) {
  const h = L0 - 1 + s;
  const dL = L1 - L0;
  const L = sA < 0 || s <= sA ? L0 : L0 + Math.sign(dL) * Math.min(Math.abs(dL), s - sA);
  return [h - L + 1, h];
}
const onGlass = (c) => c[1] >= 0 && c[1] <= 4 && c[0] >= 0 && c[0] <= 15;

/** Whether the snake ever lies across itself, apart from the digits' own crossings. */
function collides(route, L0, L1, sA, K) {
  const newFrom = route.length - L1;
  const own = (i, j) => (i < L0 && j < L0) || (i >= newFrom && j >= newFrom);
  for (let s = 1; s <= K; s++) {
    const [t, h] = bodyWindow(L0, L1, sA, s);
    const c = route[h];
    if (!onGlass(c)) continue;
    for (let i = Math.max(t, 0); i < h; i++) if (same(route[i], c) && !own(i, h)) return true;
  }
  return false;
}

/** Simple paths from `start` (exclusive) through free cells, up to `max` long, ending on an edge. */
function pathsToEdge(start, ok, isEdge, max) {
  const out = [];
  const walk = (from, path) => {
    if (path.length && isEdge(path[path.length - 1])) out.push(path.slice());
    if (path.length === max) return;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = [from[0] + dx, from[1] + dy];
      if (!ok(c) || path.some((q) => same(q, c))) continue;
      path.push(c); walk(c, path); path.pop();
    }
  };
  walk(start, []);
  return out.sort((a, b) => a.length - b.length);
}

/**
 * Every good way for the snake in digit slot k to go from lying along `old`
 * to lying along `neu`, best first: shortest overall, never running into
 * itself, with the apple on its way out.
 */
export function routes(k, old, neu, maxPath = 5) {
  const L0 = old.length, L1 = neu.length;
  const x0 = DIGIT_X[k], x1 = ARENA_X[k];
  const ok = ([x, y]) => x >= x0 && x <= x1 && y >= 0 && y <= 4;
  const isEdge = ([, y]) => y === 0 || y === 4;
  const taken = (c) => old.some((q) => same(q, c)) || neu.some((q) => same(q, c));
  const outs = pathsToEdge(old[L0 - 1], ok, isEdge, maxPath).filter((p) => p.some((c) => !taken(c))).slice(0, 40);
  const ins = (isEdge(neu[0]) ? [[]] : []).concat(
    pathsToEdge(neu[0], ok, isEdge, maxPath).filter((p) => !p.some((c) => neu.some((q) => same(q, c)))).map((p) => p.reverse()))
    .slice(0, 40);
  const found = [];
  for (const X1 of outs) {
    const exit = X1[X1.length - 1];
    for (const X2 of ins) {
      // Off the top, back in at the bottom of the same column, or the other way: the game's wrap.
      const entry = X2.length ? X2[0] : neu[0];
      if (entry[0] !== exit[0] || entry[1] !== 4 - exit[1]) continue;
      for (let G = 0; G <= 20; G++) {
        const off = Array.from({ length: G }, (_, i) => [-10 - i, -10]);
        const route = old.concat(X1, off, X2, neu);
        const K = X1.length + G + X2.length + L1;
        // The apple: in the arena column, the last cell of it on the way out;
        // in a gap in the old digit only when the snake cannot reach the column.
        let ai = X1.map((c, i) => (c[0] === x1 ? i : -1)).filter((i) => i >= 0).pop();
        let penalty = 0;
        if (ai === undefined) { ai = X1.map((c, i) => (taken(c) ? -1 : i)).filter((i) => i >= 0).pop(); penalty = 8; }
        // A head resting in the arena column fills its cell: the apple goes in the other one.
        const rest = old[L0 - 1];
        if (rest[0] === x1 && (X1[ai][1] < 3) === (rest[1] < 3)) break;
        const sA = ai + 1;
        if (collides(route, L0, L1, sA, K)) continue;
        // The old digit has gone before the head comes back in, so the glass
        // never shows half of one digit and half of the next.
        const back = L0 + X1.length + G;            // route index of the first cell back on the glass
        if (bodyWindow(L0, L1, sA, back - L0 + 1)[0] < L0) continue;
        found.push({ route, L0, L1, sA, K, apple: X1[ai], out: L0 + X1.length, G, score: K + penalty });
        break;
      }
    }
  }
  found.sort((a, b) => a.score - b.score);
  const best = found.length ? found[0].score : 0;
  return found.slice(0, 24);
}

const planCache = new Map();
export function plans(k, d0, d1) {
  const id = `${k}${d0}${d1}`;
  if (!planCache.has(id)) planCache.set(id, routes(k, digitPath(d0, k), digitPath(d1, k)));
  return planCache.get(id);
}
// ----------------------------------------------------------------- sprites
// Drawn over a segment slot: row 0 is the dark row above the segment, rows
// 1-2 the segment, row 3 the dark row below. ' ' leaves a dot as it was.
const HEAD = {
  R: { shut: [' ##  ', '##.##', '#####', '     '], open: [' ##  ', '##.##', '###..', '     '] },
  L: { shut: ['  ## ', '##.##', '#####', '     '], open: ['  ## ', '##.##', '..###', '     '] },
  U: { shut: [' ### ', '#.#.#', '#####', '     '], open: [' #.# ', '#.#.#', '#####', '     '] },
  D: { shut: ['     ', '#####', '#.#.#', ' ### '], open: ['     ', '#####', '#.#.#', ' #.# '] },
};
function dirOf(a, b) {
  if (b[0] > a[0]) return 'R';
  if (b[0] < a[0]) return 'L';
  return b[1] > a[1] ? 'D' : 'U';
}

/** A head on the move: kept inside its own cell, so it never costs a second slot. */
function drawHead(cv, x, y, dir, { open = false } = {}) {
  const row = y < 3 ? 0 : 1, gy = SEG_Y[y] - 1;
  HEAD[dir][open ? 'open' : 'shut'].forEach((line, r) => {
    if (gy + r >= row * 8 && gy + r < row * 8 + 8) cv.stamp(x * 5, gy + r, [line]);
  });
}
// The awake snake rests with its head out of the digit, in the arena column:
// a face five rows tall looking out of the glass, on a neck from its last
// segment, with room under it for the tongue where the cell allows.
const FACE = ['.###.', '#####', '#####', '#####', '.###.'];
const EYES = { mid: [[1, 1], [1, 3]], right: [[1, 2], [1, 4]], left: [[1, 0], [1, 2]],
  down: [[2, 1], [2, 3]], up: [[0, 1], [0, 3]], shut: [] };
function drawFace(cv, x, y, { eyes = 'mid', mouth = false, tongue = false } = {}) {
  const row = y < 3 ? 0 : 1, r0 = SEG_Y[y] - row * 8;
  const top = Math.max(0, r0 - 3), gx = x * 5, gy = row * 8 + top;
  cv.stamp(gx, gy, FACE);
  cv.set(gx, row * 8 + r0); cv.set(gx, row * 8 + r0 + 1);          // the neck
  for (const [r, c] of EYES[eyes]) cv.set(gx + c, gy + r, 0);
  if (mouth) cv.stamp(gx, gy + 3, ['#...#']);
  if (tongue) cv.stamp(gx, gy + 5, ['..#..', '.#.#.'].slice(0, 3 - top));
}

// --------------------------------------------------------------- schedule
const digitsOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);
const LEVEL_HOLD = 2.4;          // seconds the empty glass says LEVEL nn on the hour

/** The same route, held off the glass `extra` steps longer. */
function delayed(p, extra) {
  if (extra <= 0) return p;
  const at = p.out + p.G;
  const pad = Array.from({ length: extra }, (_, i) => [-40 - i, -40]);
  return { ...p, route: p.route.slice(0, at).concat(pad, p.route.slice(at)), K: p.K + extra, G: p.G + extra };
}
/** Step at which the last of the snake has left the glass. */
function goneAt(p) {
  for (let s = 0; s <= p.K; s++) if (bodyWindow(p.L0, p.L1, p.sA, s)[0] >= p.out) return s;
  return p.K;
}
/** Step at which the head comes back onto the glass. */
const backAt = (p) => p.out + p.G - (p.L0 - 1);

/**
 * Who moves in the turn into minute M (epoch minutes) and when, given a
 * route index per snake. A minute: the snakes whose digit changes, all at
 * :00. The hour: all four, one at a time, off the glass right to left; the
 * empty glass says LEVEL and the hour; then back on left to right, so the
 * new time is written out as it would be read.
 */
function buildSchedule(M, kit, pick) {
  const prev = digitsOf(kit.clockFields(new Date((M - 1) * 60000)));
  const f = kit.clockFields(new Date(M * 60000));
  const now = digitsOf(f);
  const hour = f.m === 0;
  const moves = [];
  const ks = hour ? [3, 2, 1, 0] : [0, 1, 2, 3].filter((k) => prev[k] !== now[k]);
  for (const k of ks) {
    const all = plans(k, prev[k], now[k]);
    moves[k] = { p: all[Math.min(pick[k] ?? 0, all.length - 1)], t0: 0 };
  }
  const sched = { M, hour, moves, prev, now, level: null };
  if (ks.length < 2) return sched;
  // More than one snake: one at a time, so the glass never shows a mix of
  // old and new digits, only gaps.
  const order = ks.slice().sort((a, b) => b - a);
  let t = 0;
  for (const k of order) { moves[k].t0 = t; t += goneAt(moves[k].p) * STEP; }
  if (hour) { sched.level = { from: t, to: t + LEVEL_HOLD, text: f.hh }; t += LEVEL_HOLD; }
  for (const k of order.reverse()) {
    const m = moves[k];
    m.p = delayed(m.p, Math.round((t - m.t0) / STEP) - backAt(m.p));
    t = m.t0 + m.p.K * STEP + STEP;
  }
  return sched;
}
// ------------------------------------------------------------------- scene
/**
 * The apple. Plain, it is the ROM's middle dot, 0xa5, which on its own in a
 * cell costs no slot; given a slot to spare it grows a stalk and a leaf.
 */
function drawApple(cv, x, y, fancy = false) {
  const row = (y < 3 ? 0 : 8);
  if (fancy) { cv.stamp(x * 5, row + 1, ['...#.', '..#..', '.###.', '#####', '#####', '.###.']); return; }
  for (const dy of [3, 4]) for (const dx of [1, 2]) cv.set(x * 5 + dx, row + dy);
}

/**
 * Everything on the glass at this instant, as draw calls in two layers:
 * `must` (digits, moving snakes and their heads, apples, the awake head) and
 * `nice` (tongues, sleepy heads waking, the apple's stalk and leaf), which
 * give way first if slots run out. `schedOf(M)` is the turn into minute M.
 */
function scene(fields, date, schedOf) {
  const sec = fields.s + fields.ms / 1000;
  const M = Math.floor(date.getTime() / 60000);
  const cur = schedOf(M), nxt = sec >= 52 ? schedOf(M + 1) : null;
  const must = [], nice = [], text = [];
  const busy = [false, false, false, false];

  for (let k = 0; k < 4; k++) {
    const mv = cur.moves[k];
    let d = cur.now[k];
    if (mv) {
      const s = Math.floor((sec - mv.t0) / STEP + 1e-6);
      if (s < 0) d = cur.prev[k];
      else if (s < mv.p.K) {
        busy[k] = true;
        const p = mv.p;
        const [t, h] = bodyWindow(p.L0, p.L1, p.sA, s);
        const cells = p.route.slice(Math.max(t, 0), h + 1).filter(onGlass);
        const head = p.route[h], dir = dirOf(p.route[h - 1], head);
        const appleAt = p.L0 - 1 + p.sA;
        const drawIt = (cv) => {
          // Its first move is a lunge: the face, mouth open, before it shrinks to a running head.
          if (s === 0 && head[0] === ARENA_X[k]) drawFace(cv, ...head, { eyes: 'mid', mouth: true });
          else if (onGlass(head)) drawHead(cv, ...head, dir, { open: s < p.sA && appleAt - h <= 2 });
        };
        must.push((cv) => {
          for (const [x, y] of cells) cv.seg(x, y);
          if (s < p.sA) drawApple(cv, ...p.apple);
          drawIt(cv);
        });
        if (s < p.sA) nice.push((cv) => { drawApple(cv, ...p.apple, true); drawIt(cv); });
        continue;
      }
    }
    const path = digitPath(d, k);
    const head = path[path.length - 1], dir = dirOf(path[path.length - 2], head);
    const up = nxt && nxt.moves[k];
    const face = head[0] === ARENA_X[k];
    must.push((cv) => { for (const [x, y] of face ? path.slice(0, -1) : path) cv.seg(x, y); });
    if (up) {
      busy[k] = true;
      must.push((cv) => drawApple(cv, ...up.p.apple));
      nice.push((cv) => drawApple(cv, ...up.p.apple, true));
    }
    if (face) {
      const since = mv && sec >= mv.t0 ? sec - mv.t0 - mv.p.K * STEP : 99;   // seconds since it coiled up
      const ap = up && up.p.apple;
      const look = ap ? (ap[1] < head[1] ? 'mid' : 'down')
        : Math.floor(sec / 9) % 3 === 1 && sec % 9 < 2.4 ? 'right' : 'mid';
      const blink = !ap && Math.floor(sec) % 7 === 3 && sec % 1 >= 0.5 && sec % 1 < 0.7;
      const eyes = since < 1.2 || blink ? 'shut' : look;
      const mouth = (ap && sec >= 59.3) || (!ap && sec >= 30 && sec < 30.7);
      const tongue = !mouth && since >= 1.2 && (ap && sec >= 56 ? sec % 0.5 < 0.25 : sec % 1 < 0.3);
      must.push((cv) => drawFace(cv, ...head, { eyes, mouth }));
      if (tongue) nice.push((cv) => drawFace(cv, ...head, { eyes, mouth, tongue }));
      continue;
    }
    // A sleeping snake about to move opens an eye in its last segment.
    if (up && sec >= 55) nice.push((cv) => cv.set(head[0] * 5 + 2, SEG_Y[head[1]], 0));
  }
  if (cur.level && sec >= cur.level.from && sec < cur.level.to) text.push([4, 0, `LEVEL ${cur.level.text}`]);
  return { must, nice, text, colon: !busy[1] && !text.length };
}

// ---------------------------------------------------------------- budget
let ROM = null;                  // tile key -> ROM code, read from the controller's own ROM
const keyOf = (rows) => rows.join('/');
function romTable(lcd) {
  if (ROM) return ROM;
  ROM = new Map();
  for (let c = 0xff; c >= 0x20; c--) {
    const g = lcd.glyph(c);
    ROM.set(keyOf(Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 5 }, (_, i) => ((g[r] >> (4 - i)) & 1 ? '#' : '.')).join(''))), c);
  }
  return ROM;
}
/** Slots a canvas needs: distinct cell pictures that the ROM does not already have. */
function slotsFor(cv) {
  const need = new Set();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    const k = keyOf(cv.tile(col, row));
    if (!ROM.has(k)) need.add(k);
  }
  return need.size;
}

const quietCache = new Map(), chosenCache = new Map();
function quiet(M, kit) {
  if (quietCache.size > 256) quietCache.clear();
  if (!quietCache.has(M)) quietCache.set(M, buildSchedule(M, kit, []));
  return quietCache.get(M);
}
/** The worst slot count over a turn and the seconds before it. */
function worstSlots(sched, kit) {
  const schedOf = (m) => (m === sched.M ? sched : quiet(m, kit));
  const end = Math.max(0, ...sched.moves.filter(Boolean).map((m) => m.t0 + m.p.K * STEP));
  const at = [-4, -8];
  for (let t = 0; t <= end + STEP; t += STEP) at.push(t + 0.01);
  let worst = 0;
  for (const t of at) {
    const date = new Date(sched.M * 60000 + Math.round(t * 1000));
    const sc = scene(kit.clockFields(date), date, schedOf);
    const cv = new Canvas();
    for (const f of sc.must) f(cv);
    worst = Math.max(worst, slotsFor(cv));
  }
  return worst;
}
/**
 * The turn into minute M, with each snake's route chosen so the whole turn
 * fits in eight slots: one snake at a time, trying its routes best first.
 */
function chosen(M, kit) {
  if (chosenCache.has(M)) return chosenCache.get(M);
  const base = quiet(M, kit);
  const pick = [];
  for (let k = 0; k < 4; k++) {
    const mv = base.moves[k];
    if (!mv) continue;
    const prev = base.prev[k], now = base.now[k];
    const all = plans(k, prev, now), n = all.length;
    const near = all.filter((p) => p.score <= all[0].score + 2).length;
    const offset = Math.floor(noise(M * 13 + k, 5) * near);   // vary the route from minute to minute
    let best = null;
    for (let j = 0; j < n; j++) {
      pick[k] = j < near ? (offset + j) % near : j;
      const w = worstSlots(buildSchedule(M, kit, pick), kit);
      if (!best || w < best.w) best = { w, i: pick[k] };
      if (w <= 8) break;
    }
    pick[k] = best.i;
  }
  const sched = buildSchedule(M, kit, pick);
  if (chosenCache.size > 64) chosenCache.clear();
  chosenCache.set(M, sched);
  return sched;
}

// ------------------------------------------------------------------ design

export default {
  name: 'Snake',
  blurb: 'Four snakes curled up into the time. Each minute an apple appears and the last digit uncoils, eats it, wraps round the glass and coils into the next.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { fields, date, kit }) {
    romTable(lcd);
    const sc = scene(fields, date, (M) => chosen(M, kit));
    const a = new Canvas(), b = new Canvas();
    for (const f of sc.must) { f(a); f(b); }
    for (const f of sc.nice) f(b);

    // Cells the extras leave alone first; then each cell an extra touches gets
    // its fancier picture only while that leaves room for every plain one.
    const alloc = new TileAllocator(lcd, 0);
    const has = (rows) => ROM.has(keyOf(rows)) || alloc.index.has(keyOf(rows));
    const code = (rows) => ROM.get(keyOf(rows)) ?? alloc.add(rows);
    const out = [Array(16).fill(0x20), Array(16).fill(0x20)];
    const want = [], differ = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      const ta = a.tile(col, row), tb = b.tile(col, row);
      if (keyOf(ta) !== keyOf(tb)) { differ.push([row, col, ta, tb]); continue; }
      out[row][col] = code(ta);
      if (out[row][col] === null) want.push([row, col, ta]);
    }
    const plain = new Set(differ.filter(([, , ta]) => !has(ta)).map(([, , ta]) => keyOf(ta)));
    let spare = alloc.capacity - alloc.used - plain.size;
    for (const d of differ) {
      const [row, col, ta, tb] = d;
      if (has(tb) || spare > 0) {
        if (!has(tb)) spare--;
        out[row][col] = code(tb);
      } else {
        out[row][col] = code(ta);
        if (out[row][col] === null) want.push([row, col, ta]);
      }
    }
    // Over budget (the route search could not avoid it): the nearest tile held.
    for (const [row, col, ta] of want) out[row][col] = nearest(alloc, ta);
    for (const [col, row, str] of sc.text) [...str].forEach((ch, i) => { out[row][col + i] = ch.charCodeAt(0); });
    if (sc.colon) for (const row of [0, 1]) if (out[row][COLON_X] === 0x20) out[row][COLON_X] = 0xa5;
    alloc.flush();
    out.forEach((codes, row) => { lcd.setCursor(0, row); codes.forEach((c) => lcd.data(c)); });
  },
};

function nearest(alloc, rows) {
  let best = 0x20, bd = Infinity;
  alloc.tiles.forEach((t, i) => {
    let d = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) d += t[r][c] !== rows[r][c];
    if (d < bd) { bd = d; best = alloc.firstSlot + i; }
  });
  return best;
}
