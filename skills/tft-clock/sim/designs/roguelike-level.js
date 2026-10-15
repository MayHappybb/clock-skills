// Roguelike: the dungeon level. Each numeral is a room whose floor plan IS
// the digit: a one-cell band of floor, closed in by walls that are joined the
// way NetHack joins them (box drawing through the cell centres). The rooms are
// linked by dark corridors through the rock between them; the colon is the
// up and down staircase.
//
// Everything here is a pure function of the clock: a room is seeded by its
// slot and its EPOCH (the moment its digit last changed: the minute for the
// last digit, the ten minutes for the third, the hour, the ten hours), so a
// room that does not change at a minute turn is identical before and after
// it, and its monsters walk on in closed form. The hero's minute (his route,
// his fights, the corridors he maps) is simulated once per minute from :00,
// 120 turns of integer work, and cached.
import { hash, rand, noise, clockFields } from '../js/kit.js';

export const COLS = 40, ROWS = 12, MAP_Y = 8, CW = 4, CH = 6;
export const SLOT_C = [1, 10, 22, 31], SLOT_R = [0, 1, 0, 1], BOX_W = 8, BOX_H = 11;
export const UP = [19, 4], DOWN = [20, 7];
export const ROCK = 0, FLOOR = 1, WALL = 2, DOOR = 3, CORR = 4, STAIR = 5;
export const TURNS = 120, TPS = 2;                 // two game turns a second

// The ten floor plans, 6 x 9 cells: '#' is floor. Strokes one cell wide; any
// two strokes are three cells apart (wall, rock, wall), so every counter is
// open ground at least 10 x 10 px. Corners are chamfered (a diagonal step,
// as rooms and corridors join in the dungeon), the 2 and 7 come down in a
// staircase.
const PLANS = [
  ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  ['.###..', '...#..', '...#..', '...#..', '...#..', '...#..', '...#..', '...#..', '.#####'],
  ['.####.', '#....#', '.....#', '.....#', '....#.', '...#..', '..#...', '.#....', '######'],
  ['.####.', '#....#', '.....#', '.....#', '..###.', '.....#', '.....#', '#....#', '.####.'],
  ['#...#.', '#...#.', '#...#.', '#...#.', '#...#.', '######', '....#.', '....#.', '....#.'],
  ['######', '#.....', '#.....', '#.....', '#####.', '.....#', '.....#', '#....#', '.####.'],
  ['.####.', '#.....', '#.....', '#.....', '#####.', '#....#', '#....#', '#....#', '.####.'],
  ['######', '.....#', '.....#', '....#.', '....#.', '...#..', '...#..', '...#..', '...#..'],
  ['.####.', '#....#', '#....#', '#....#', '.####.', '#....#', '#....#', '#....#', '.####.'],
  ['.####.', '#....#', '#....#', '#....#', '.#####', '.....#', '.....#', '.....#', '.####.'],
];
export { PLANS };

// ------------------------------------------------------------ the bestiary

// [glyph, EGA colour, name, speed (cells a turn x 12)]
const M = (ch, c, name, sp = 12) => ({ ch: ch.charCodeAt(0), c, name, sp });
const COMMON = [
  M('d', 6, 'jackal'), M('k', 12, 'large kobold'), M('G', 6, 'gnome', 8), M('x', 5, 'grid bug', 6), M('r', 6, 'sewer rat'),
  M('b', 10, 'acid blob', 4), M('o', 14, 'hill orc', 9), M('i', 2, 'homunculus'), M('B', 12, 'giant bat', 22),
  M('h', 12, 'dwarf', 6), M('s', 14, 'centipede', 4), M('S', 6, 'snake', 15), M('f', 15, 'kitten', 18), M('j', 9, 'blue jelly', 2),
  M('F', 10, 'lichen', 2), M('e', 9, 'floating eye', 2), M('n', 2, 'wood nymph'), M('u', 15, 'white unicorn', 24),
];
const ROOMS = {
  den: { mon: () => COMMON, n: [2, 4] },
  hive: { mon: () => [M('a', 14, 'killer bee', 18)], n: [4, 6], item: ['%', 14] },
  crypt: { mon: () => [M('Z', 12, 'kobold zombie', 6), M('Z', 15, 'human zombie', 6), M('M', 7, 'gnome mummy', 8), M('V', 4, 'vampire bat', 20)], n: [3, 4], item: ['|', 7] },
  lepre: { mon: () => [M('l', 2, 'leprechaun', 15)], n: [2, 3], item: ['$', 14] },
  zoo: { mon: () => COMMON, n: [5, 7], item: ['$', 14] },
};
const KINDS = ['den', 'den', 'hive', 'crypt', 'lepre', 'zoo'];
const ITEMS = [['$', 14], [')', 11], ['[', 3], ['!', 13], ['?', 15], ['!', 12], ['=', 14], ['*', 10], ['"', 11], ['(', 6]];

// ------------------------------------------------------------ epochs

/** When slot i's digit last changed, in minutes since the epoch (a room's identity). */
export function epochOf(i, f) {
  const day = f.minuteKey - (f.h * 60 + f.m);
  if (i === 3) return f.minuteKey;
  if (i === 2) return f.minuteKey - (f.m % 10);
  if (i === 1) return f.minuteKey - f.m;
  return day + Math.floor(f.h / 10) * 600;
}

// ------------------------------------------------------------ one room

const ROOM_CACHE = new Map();

/** The room for digit d in slot i, born at minute `ep`. Cached; pure. */
export function room(i, d, ep) {
  const key = i * 10 + d + ep * 40;
  let r = ROOM_CACHE.get(key);
  if (r) return r;
  const seed = hash(i, d, ep);
  const c0 = SLOT_C[i], r0 = SLOT_R[i];
  const k = new Uint8Array(BOX_W * BOX_H);           // ROCK / FLOOR / WALL in the box
  const plan = PLANS[d];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 6; x++) if (plan[y][x] === '#') k[(y + 1) * BOX_W + x + 1] = FLOOR;
  const isF = (x, y) => x >= 0 && y >= 0 && x < BOX_W && y < BOX_H && k[y * BOX_W + x] === FLOOR;
  for (let y = 0; y < BOX_H; y++) for (let x = 0; x < BOX_W; x++) {
    if (k[y * BOX_W + x]) continue;
    let adj = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isF(x + dx, y + dy)) adj = true;
    if (adj) k[y * BOX_W + x] = WALL;
  }
  const floor = [];
  for (let y = 0; y < BOX_H; y++) for (let x = 0; x < BOX_W; x++) if (k[y * BOX_W + x] === FLOOR) floor.push([c0 + x, r0 + y]);
  r = { i, d, ep, seed, c0, r0, k, floor };
  // the population
  const kind = KINDS[seed % KINDS.length];
  const R = ROOMS[kind];
  r.kind = kind;
  const tour = tourOf(floor);
  r.tour = tour;
  const nm = R.n[0] + (hash(seed, 1) % (R.n[1] - R.n[0] + 1));
  const pool = R.mon();
  r.mons = [];
  for (let j = 0; j < nm; j++) {
    const sp = pool[hash(seed, 2, j) % pool.length];
    r.mons.push({ ...sp, ph: hash(seed, 3, j) % tour.length, dir: hash(seed, 4, j) & 1 ? 1 : -1, ns: hash(seed, 5, j) & 1023, id: j });
  }
  // a torch on the floor at the end of a stroke or a corner, and a few items
  const used = new Set();
  const pick = (salt) => {
    for (let t = 0; t < 20; t++) {
      const c = floor[hash(seed, salt, t) % floor.length], key2 = c[1] * COLS + c[0];
      if (!used.has(key2)) { used.add(key2); return c; }
    }
    return floor[0];
  };
  r.torches = [pick(7)];
  if (floor.length > 26) r.torches.push(pick(8));
  // walking distance from the first torch over the floor: the beat's light front runs along it
  const fi = new Map(floor.map((c, n) => [c[1] * COLS + c[0], n]));
  const dist = new Int8Array(floor.length).fill(-1), q = [fi.get(r.torches[0][1] * COLS + r.torches[0][0])];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = floor[q[h]];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const m = fi.get((y + dy) * COLS + x + dx);
      if (m !== undefined && dist[m] < 0) { dist[m] = dist[q[h]] + 1; q.push(m); }
    }
  }
  r.dist = dist; r.maxDist = Math.max(...dist);
  r.items = [];
  const ni = 2 + (hash(seed, 9) % 3);
  for (let j = 0; j < ni; j++) {
    const it = R.item && j < 2 ? R.item : ITEMS[hash(seed, 10, j) % ITEMS.length];
    const c = pick(11 + j);
    r.items.push({ x: c[0], y: c[1], ch: it[0].charCodeAt(0), c: it[1] });
  }
  ROOM_CACHE.set(key, r);
  if (ROOM_CACHE.size > 40) ROOM_CACHE.delete(ROOM_CACHE.keys().next().value);
  return r;
}

/** A closed walk over the floor (depth first, orthogonal steps before diagonal): where monsters patrol. */
function tourOf(floor) {
  const set = new Map(floor.map((c, n) => [c[1] * COLS + c[0], n]));
  const seen = new Uint8Array(floor.length), walk = [];
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  const go = (n) => {
    seen[n] = 1; walk.push(floor[n]);
    for (const [dx, dy] of DIRS) {
      const m = set.get((floor[n][1] + dy) * COLS + floor[n][0] + dx);
      if (m !== undefined && !seen[m]) { go(m); walk.push(floor[n]); }
    }
  };
  go(0);
  if (walk.length > 1) walk.pop();
  return walk;
}

/** Where monster m of room r is at turn T (absolute turns): closed form, a drift plus a wander. */
export function monAt(r, m, T) {
  const t = T - r.ep * 60 * TPS;
  const L = r.tour.length;
  const v = (m.sp / 12) * 0.45;
  const wander = noise(t * v * 0.16, m.ns) * 9 * Math.min(1, v * 2);
  const idx = Math.floor(m.ph + m.dir * t * v * 0.55 + wander);
  return r.tour[((idx % L) + L) % L];
}

// ------------------------------------------------------------ the level

const LEVEL_CACHE = new Map();
/** Levels built (the frame that builds one is billed for it: ~200k simple integer steps in C). */
export const BUILT = { n: 0 };

/** The level shown during minute `mk`: four rooms, doors, corridors, stairs, and the hero's minute. */
export function level(mk) {
  let L = LEVEL_CACHE.get(mk);
  if (L) return L;
  const f = clockFields(new Date(mk * 60000));
  const digits = (f.hh + f.mm).split('').map(Number);
  const rooms = digits.map((d, i) => room(i, d, epochOf(i, f)));
  const N = COLS * ROWS;
  const kind = new Uint8Array(N), owner = new Int8Array(N).fill(-1), mask = new Uint8Array(N);
  for (const r of rooms) for (let y = 0; y < BOX_H; y++) for (let x = 0; x < BOX_W; x++) {
    const v = r.k[y * BOX_W + x];
    if (!v) continue;
    const c = (r.r0 + y) * COLS + r.c0 + x;
    kind[c] = v; owner[c] = r.i;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? ROCK : kind[y * COLS + x]);
  // the rock that is outside every room (counters are rock enclosed by walls: never dug)
  const out = new Uint8Array(N), q = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if ((x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) && !kind[y * COLS + x]) { out[y * COLS + x] = 1; q.push(y * COLS + x); }
  while (q.length) {
    const c = q.pop(), x = c % COLS, y = (c / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * COLS + nx;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || out[n] || kind[n]) continue;
      out[n] = 1; q.push(n);
    }
  }
  // doors: a wall cell with floor on one side and outside rock on the other
  const doorsOf = (r, side) => {
    const res = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = y * COLS + x;
      if (kind[c] !== WALL || owner[c] !== r.i) continue;
      const pairs = side === 'L' ? [[1, 0]] : side === 'R' ? [[-1, 0]] : side === 'T' ? [[0, 1]] : [[0, -1]];
      for (const [dx, dy] of pairs) {
        if (at(x + dx, y + dy) !== FLOOR) continue;
        const ox = x - dx, oy = y - dy;
        if (ox < 0 || oy < 0 || ox >= COLS || oy >= ROWS || !out[oy * COLS + ox]) continue;
        res.push([x, y, ox, oy]);
      }
    }
    return res;
  };
  const doors = [];
  const choose = (r, side, salt) => {
    const c = doorsOf(r, side);
    if (!c.length) return null;
    // prefer doors nearer the middle rows, seeded by the room so they persist with it
    c.sort((a, b) => Math.abs(a[1] - 5.5) - Math.abs(b[1] - 5.5));
    const d = c[hash(r.seed, salt) % Math.min(3, c.length)];
    kind[d[1] * COLS + d[0]] = DOOR;
    doors.push(d);
    return d;
  };
  const dR = rooms.map((r) => (r.i < 3 ? choose(r, 'R', 21) : null));
  const dL = rooms.map((r) => (r.i > 0 ? choose(r, 'L', 22) : null));
  // stairs (the colon)
  kind[UP[1] * COLS + UP[0]] = STAIR; kind[DOWN[1] * COLS + DOWN[0]] = STAIR;
  // corridors: cheapest paths through the outside rock; dear inside a room's box and in the colon
  const costAt = (x, y) => {
    const c = y * COLS + x;
    if (!out[c]) return 0;
    let w = 1;
    for (const r of rooms) if (x >= r.c0 && x < r.c0 + BOX_W && y >= r.r0 && y < r.r0 + BOX_H) w = 8;
    if (x >= 18 && x <= 21 && y >= 2 && y <= 9) w = 12;
    return w;
  };
  const dig = (a, b) => {
    if (!a || !b) return;
    const dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1);
    const s = a[1] * COLS + a[0], e = b[1] * COLS + b[0];
    dist[s] = 0;
    const open = [s];
    while (open.length) {
      let bi = 0;
      for (let j = 1; j < open.length; j++) if (dist[open[j]] < dist[open[bi]]) bi = j;
      const c = open[bi]; open.splice(bi, 1);
      if (c === e) break;
      const x = c % COLS, y = (c / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const n = ny * COLS + nx;
        const w = n === e ? 1 : costAt(nx, ny);
        if (!w) continue;
        if (dist[c] + w < dist[n]) { if (dist[n] >= 1e9) open.push(n); dist[n] = dist[c] + w; prev[n] = c; }
      }
    }
    for (let c = e; c >= 0 && c !== s; c = prev[c]) if (kind[c] === ROCK) kind[c] = CORR;
    if (kind[s] === ROCK) kind[s] = CORR;
  };
  const o = (d) => (d ? [d[2], d[3]] : null);
  dig(o(dR[0]), o(dL[1]));
  dig(o(dR[1]), [UP[0], UP[1]]);
  dig([DOWN[0], DOWN[1]], o(dL[2]));
  dig(o(dR[1]), o(dL[2]));
  dig(o(dR[2]), o(dL[3]));
  // wall joins: two walls join when some floor cell touches both
  const touch = (x, y) => {
    const s = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === FLOOR) s.add((y + dy) * COLS + x + dx);
    return s;
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = y * COLS + x;
    if (kind[c] !== WALL && kind[c] !== DOOR) continue;
    const mine = touch(x, y);
    let m = 0;
    [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].forEach(([dx, dy, bit]) => {
      const t = at(x + dx, y + dy);
      if (t !== WALL && t !== DOOR) return;
      for (const n of touch(x + dx, y + dy)) if (mine.has(n)) { m |= bit; return; }
    });
    mask[c] = m;
  }
  // corridor cells by walking distance from the nearest door: the beat runs out along them
  const cdist = new Int8Array(N).fill(-1), cq = [];
  for (const d of doors) { cdist[d[1] * COLS + d[0]] = 0; cq.push(d[1] * COLS + d[0]); }
  for (let h = 0; h < cq.length; h++) {
    const c = cq[h], x = c % COLS, y = (c / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * COLS + nx;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || cdist[n] >= 0 || kind[n] !== CORR) continue;
      cdist[n] = Math.min(100, cdist[c] + 1); cq.push(n);
    }
  }
  L = { mk, f, digits, rooms, kind, owner, mask, doors, cdist, out };
  L.hero = heroMinute(L);
  BUILT.n++;
  LEVEL_CACHE.set(mk, L);
  if (LEVEL_CACHE.size > 4) LEVEL_CACHE.delete(LEVEL_CACHE.keys().next().value);
  return L;
}

// ------------------------------------------------------------ the hero's minute

const passable = (k) => k === FLOOR || k === DOOR || k === CORR || k === STAIR;

function bfs(L, a, b) {
  const N = COLS * ROWS, prev = new Int32Array(N).fill(-2);
  const s = a[1] * COLS + a[0], e = b[1] * COLS + b[0];
  prev[s] = -1;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === e) break;
    const x = c % COLS, y = (c / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (prev[n] !== -2 || !passable(L.kind[n])) continue;
      // no diagonal moves into or out of a doorway, or through rock corners
      if (dx && dy && (L.kind[c] === DOOR || L.kind[n] === DOOR || L.kind[c] === CORR || L.kind[n] === CORR)) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[e] === -2) return null;
  const path = [];
  for (let c = e; c !== s; c = prev[c]) path.push([c % COLS, (c / COLS) | 0]);
  return path.reverse();
}

/**
 * 120 turns: the hero arrives on the up stair, tours the rooms, fights what
 * is in his way, zaps a wand now and then, and is on the down stair by :57.
 * Returns his cell per turn, kills (monster -> turn), corpses, messages,
 * and the turn each corridor cell was first seen.
 */
function heroMinute(L) {
  const seed = hash(L.mk, 77);
  const pos = [], msgs = [], kills = new Map(), corpses = [], zaps = [];
  const seen = new Int16Array(COLS * ROWS).fill(9999);
  const T0 = L.mk * 60 * TPS;
  const live = (T) => {
    const res = [];
    for (const r of L.rooms) for (const m of r.mons) {
      const kt = kills.get(r.i * 16 + m.id);
      if (kt !== undefined && kt <= T) continue;
      const c = monAt(r, m, T0 + T);
      res.push({ r, m, x: c[0], y: c[1] });
    }
    return res;
  };
  // the tour: rooms in a seeded order, then the down stair
  let cur = [UP[0], UP[1]], path = [], wp = 0;
  const order = [1, 0, 2, 3, 1, 3, 2, 0, 3, 2];
  const start = hash(seed, 1) % 2;
  const nextTarget = () => {
    const ri = order[(start + wp++) % order.length], r = L.rooms[ri];
    return r.floor[hash(seed, 2, wp) % r.floor.length];
  };
  let target = nextTarget(), goingDown = false, hits = 0, inRoom = -1, pend = null;
  const greeted = new Set();
  const ARRIVE = L.f.m === 0 ? 15 : 2, LAST = 114;     // at the hour he holds the stair until the dragon is dead
  for (let T = 0; T < TURNS; T++) {
    if (T >= ARRIVE && T < LAST) {
      if (!path.length) {
        if (!goingDown) {
          // the next room on his tour that still leaves time to reach the stair; else head down
          for (let tries = 0; tries < 8 && !path.length; tries++) {
            const p = bfs(L, cur, target), home = p ? bfs(L, p.length ? p[p.length - 1] : cur, DOWN) : null;
            if (p && p.length && home && T + p.length + home.length < LAST - 6) path = p;
            target = nextTarget();
          }
          if (!path.length) { goingDown = true; path = bfs(L, cur, DOWN) || []; }
        }
      }
      const step = path[0];
      // fight whatever stands in the way, or is next to him (not in the last stretch)
      let foe = null;
      if (T < 100) for (const e of live(T)) {
        const adj = Math.abs(e.x - cur[0]) <= 1 && Math.abs(e.y - cur[1]) <= 1;
        if ((step && e.x === step[0] && e.y === step[1]) || (adj && hash(seed, 5, T) % 3 === 0)) { foe = e; break; }
      }
      if (foe && T < 100) {
        hits++;
        const kill = hits >= 1 + (hash(seed, 6, foe.m.id) % 2);
        if (kill) {
          kills.set(foe.r.i * 16 + foe.m.id, T + 1);
          corpses.push({ x: foe.x, y: foe.y, T: T + 1, c: foe.m.c });
          msgs.push([T, `You kill the ${foe.m.name}!`]);
          hits = 0;
        } else msgs.push([T, hash(seed, 7, T) & 1 ? `You hit the ${foe.m.name}.` : `The ${foe.m.name} bites!`]);
      } else if (step) {
        // a monster that wandered onto the next cell after the fight check: wait a turn
        cur = path.shift();
      }
    }
    // the flourishes: a wand bolt at :12, :24 and :48, a scroll of light at :36
    const want = { 24: 'lightning', 48: 'fire', 96: 'cold' }[T];
    if (want) pend = [want, T];
    const ZAP = pend && T - pend[1] < 10 && L.kind[cur[1] * COLS + cur[0]] === FLOOR ? pend[0] : null;
    if (ZAP) {
      pend = null;
      const ray = rayFrom(L, cur, seed + T);
      zaps.push({ T, kind: ZAP, ray });
      msgs.push([T, `You zap a wand of ${ZAP}!`]);
      const hitT = new Set(ray.map((c) => c[1] * COLS + c[0]));
      let victim = null;
      for (const e of live(T)) if (hitT.has(e.y * COLS + e.x)) { kills.set(e.r.i * 16 + e.m.id, T + 1); corpses.push({ x: e.x, y: e.y, T: T + 1, c: e.m.c }); victim = e; }
      msgs.push([T + 1, victim ? `The bolt of ${ZAP} hits the ${victim.m.name}!` : `The bolt of ${ZAP} bounces!`]);
    }
    if (T === 72) { zaps.push({ T, kind: 'light' }); msgs.push([T, 'You read a scroll of light. A lit field surrounds you!']); }
    // entering a special room
    const ow = L.owner[cur[1] * COLS + cur[0]];
    if (ow >= 0 && L.kind[cur[1] * COLS + cur[0]] === FLOOR && ow !== inRoom) {
      inRoom = ow;
      const k = L.rooms[ow].kind;
      if (!greeted.has(ow) && ENTER[k]) { greeted.add(ow); msgs.push([T, ENTER[k]]); }
    }
    if (T === 0) msgs.push([T, 'A map coalesces in your mind!']);
    if (T === 115) msgs.push([T, 'You climb down the stairs.']);
    // between events the line is never long quiet: what he steps on, what he hears, what is near
    const quiet = !msgs.length || T - msgs[msgs.length - 1][0] > 5;
    if (T > 3 && T < 112 && quiet) {
      const it = L.rooms.flatMap((r) => r.items).find((q) => q.x === cur[0] && q.y === cur[1]);
      const near = live(T).find((e) => Math.abs(e.x - cur[0]) <= 2 && Math.abs(e.y - cur[1]) <= 2);
      if (it) msgs.push([T, `You see here ${ITEM_NAME[String.fromCharCode(it.ch)] || 'something'}.`]);
      else if (near && hash(seed, 8, T) & 1) msgs.push([T, `You see a ${near.m.name} nearby.`]);
      else if (hash(seed, 8, T) % 3 === 0) msgs.push([T, AMBIENT[hash(seed, 9, T) % AMBIENT.length]]);
    }
    pos.push(cur);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cur[0] + dx, y = cur[1] + dy;
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS && seen[y * COLS + x] > T) seen[y * COLS + x] = T;
    }
  }
  if (cur[0] !== DOWN[0] || cur[1] !== DOWN[1]) { /* not reached: he is teleported (never seen at test times) */ }
  msgs.sort((a, b) => a[0] - b[0]);
  return { pos, msgs, kills, corpses, seen, zaps };
}

const ENTER = {
  hive: 'You enter a giant beehive!', crypt: 'You have an uncanny feeling...', zoo: "Welcome to David's treasure zoo!",
  lepre: 'You enter a leprechaun hall!',
};
const ITEM_NAME = {
  '$': 'some gold pieces', ')': 'an elven dagger', '[': 'a leather cloak', '!': 'a bubbly potion', '?': 'a scroll labeled ELBIB YLOH',
  '=': 'a jade ring', '*': 'a green gem', '"': 'an amulet', '(': 'a brass lantern', '%': 'a lump of royal jelly', '|': 'a grave',
};
const AMBIENT = [
  'You hear the footsteps of a guard on patrol.', 'You hear bubbling water.', 'You hear a door open.',
  'You hear some noises in the distance.', 'You hear the splashing of a naiad.', 'You hear a slow drip.',
  'You smell smoke.', 'You feel a strange vibration under your feet.', 'You hear a distant squeak.',
  'You hear the chime of a cash register.', 'You hear someone counting money.', 'You hear a crunching sound.',
  'You hear a monster behind the boulder.', 'You feel a cold draft.',
];

const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** A bolt from the hero: the straight line with the longest run of floor, bouncing back off walls. */
function rayFrom(L, at, seed) {
  const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && passable(L.kind[y * COLS + x]);
  let best = 0, bl = -1;
  for (let d = 0; d < 8; d++) {
    let n = 0;
    while (n < 12 && ok(at[0] + DIR8[d][0] * (n + 1), at[1] + DIR8[d][1] * (n + 1))) n++;
    if (n > bl || (n === bl && hash(seed, d) & 1)) { bl = n; best = d; }
  }
  let [x, y] = at, [dx, dy] = DIR8[best];
  const ray = [];
  for (let k = 0; k < 18; k++) {
    if (!ok(x + dx, y + dy)) { dx = -dx; dy = -dy; if (!ok(x + dx, y + dy)) break; }
    x += dx; y += dy;
    ray.push([x, y, dx === 0 ? 1 : dy === 0 ? 0 : dx === dy ? 3 : 2]);
  }
  return ray;
}

export { passable, rand };
