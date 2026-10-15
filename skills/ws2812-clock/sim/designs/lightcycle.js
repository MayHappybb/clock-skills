// Light Cycle: the 61-degree parallelogram is a Tron arena, leaning forward
// like speed. Two light cycles never stop racing round it. Their jetwalls ARE
// the time: cyan rides the hours, orange the minutes. Every digit is a route
// a cycle can ride: one-LED strokes that turn only along the lattice's three
// directions (the row, the slant, the steep backslash), so every corner is a
// sharp 60 or 120 degree light-cycle turn.
//
// At rest the cycles lap their digits through the dark one-LED lanes between
// them and behind the board's edge; walls charge as their cycle passes and
// energy flows along each wall the way it was ridden. Twice a lap the two
// cycles pass each other, side by side, in the 2-LED centre lane.
//
// Minute turn: the walls of the digits that change derez into voxels that
// blow away behind, the cycle surges out of its garage (off the board) and
// lays the new digit at speed, in a stroke order whose half-laid shapes
// never read as another digit. Hour: on the last pass the two swerve into
// one lane and crash head-on mid-board; the shockwave shatters every digit
// that changes, and both rez in where they died and race the new hour in.
//
// Stateless: routes and debris are deterministic caches keyed by the minute.
import * as kit from '../js/kit.js';

const P = 2.55, A61 = (61 * Math.PI) / 180, CX = Math.cos(A61), SY = Math.sin(A61);
/** Board lattice (column c along a row, row r down the slant) to mm. */
const pos = (c, r) => [(c - 7.5) * P - (r - 3.5) * P * CX, (r - 3.5) * P * SY];

// ------------------------------------------------------------ the routes
// Digits are 3 columns x 8 rows. Moves: row (+-1, 0), slant (0, +-1) and
// backslash (+1, +1)/(-1, -1). The backslash cuts the acute corners.
// Each digit is ridden in this order, chosen so that a half-laid digit
// never looks like another one (no top-first strokes that read as a 7).
const G = {
  0: [[[2, 7], [1, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7]]],
  1: [[[0, 7], [1, 7], [2, 7]], [[1, 6], [1, 5], [1, 4], [1, 3], [1, 2], [1, 1], [1, 0], [0, 0]]],
  2: [[[2, 7], [1, 7], [0, 6], [0, 5], [0, 4], [0, 3], [1, 3], [2, 3], [2, 2], [2, 1], [1, 0], [0, 0]]],
  3: [[[0, 7], [1, 7], [2, 7], [2, 6], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1], [1, 0], [0, 0]], [[1, 3], [2, 3]]],
  4: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [2, 5], [2, 6], [2, 7]], [[2, 2], [2, 3], [2, 4]]],
  5: [[[2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 4], [2, 5], [2, 6], [2, 7], [1, 7], [0, 7]]],
  6: [[[2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [2, 7], [2, 6], [2, 5], [2, 4], [1, 3], [0, 3]]],
  7: [[[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7]]],
  8: [[[0, 3], [1, 3], [2, 3], [2, 2], [2, 1], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [2, 7], [2, 6], [2, 5], [2, 4], [2, 3]]],
  9: [[[2, 4], [1, 4], [0, 3], [0, 2], [0, 1], [0, 0], [1, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [1, 7], [0, 7]]],
};
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
for (const [d, strokes] of Object.entries(G)) for (const st of strokes) for (let k = 1; k < st.length; k++) {
  const dc = st[k][0] - st[k - 1][0], dr = st[k][1] - st[k - 1][1];
  if (!DIRS.some(([a, b]) => a === dc && b === dr)) throw new Error(`lightcycle: glyph ${d} has a non-lattice move at ${k}`);
}

const SLOTS = [0, 4, 9, 13];                    // first column of each digit
const CYAN = kit.hex('#00d4ff'), ORANGE = kit.hex('#ff5c00'), WHITE = [1, 1, 1];
const CYCLES = [
  { slots: [0, 1], home: [7, -1], col: CYAN, hot: kit.hex('#c8f8ff') },
  { slots: [2, 3], home: [8, 8], col: ORANGE, hot: kit.hex('#ffd2a0') },
];
const SLOT_COL = [CYAN, CYAN, ORANGE, ORANGE];

// ---------------------------------------------------------- the timing
const VW = 70;                   // shockwave speed, mm/s
const LIFE = 1.0;                // a voxel's flight

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (M) => { const d = new Date(M * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const isHour = (M) => new Date(M * 1000).getMinutes() === 0;

/** Cells of digit d in slot s, board coordinates. */
const cellsOf = (s, d) => {
  const seen = new Map();
  for (const st of G[d]) for (const [c, r] of st) seen.set(`${SLOTS[s] + c},${r}`, [SLOTS[s] + c, r]);
  return [...seen.values()];
};

// The floor graph: the board plus a ring of positions just off its edges.
const C0 = -1, C1 = 16, R0 = -1, R1 = 8, NW = C1 - C0 + 1;
const nid = (c, r) => (r - R0) * NW + (c - C0);
const NN = NW * (R1 - R0 + 1);
const onBoard = (c, r) => c >= 0 && c <= 15 && r >= 0 && r <= 7;

/** Cheapest paths from node `from`; floor 1, off-board 1.3, over any wall 5. */
function dijkstra(from, occ) {
  const dist = new Float64Array(NN).fill(Infinity), prev = new Int32Array(NN).fill(-1), done = new Uint8Array(NN);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let k = 0; k < NN; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
    if (u < 0) break;
    done[u] = 1;
    const uc = (u % NW) + C0, ur = Math.floor(u / NW) + R0;
    for (const [dc, dr] of DIRS) {
      const c = uc + dc, r = ur + dr;
      if (c < C0 || c > C1 || r < R0 || r > R1) continue;
      const v = nid(c, r), w = !onBoard(c, r) ? 1.3 : occ.has(v) ? 5 : 1;
      if (best + w < dist[v]) { dist[v] = best + w; prev[v] = u; }
    }
  }
  return { dist, prev };
}

const routes = new Map();
/** A cycle's excursion for the time `digs`: from `start`, its digits' strokes in `order`, then home. */
function routeFor(ci, digs, order, start) {
  const key = ci + digs + order.join('') + start;
  if (routes.has(key)) return routes.get(key);
  const cy = CYCLES[ci];
  const occ = new Set();
  for (let s = 0; s < 4; s++) for (const [c, r] of cellsOf(s, digs[s])) occ.add(nid(c, r));
  const nodes = [{ c: start[0], r: start[1], wall: -1 }];
  let cur = nid(...start);
  const go = (target) => {                       // connector from cur to target, target excluded
    if (target === cur) return;
    const { prev } = dijkstra(cur, occ), path = [];
    for (let v = prev[target]; v >= 0 && v !== cur; v = prev[v]) path.push(v);
    for (const v of path.reverse()) nodes.push({ c: (v % NW) + C0, r: Math.floor(v / NW) + R0, wall: -1 });
  };
  for (const s of order) {
    const rem = G[digs[s]].map((st) => st.map(([c, r]) => [SLOTS[s] + c, r]));
    while (rem.length) {
      const st = rem.shift();                    // strokes in their drawing order
      go(nid(...st[0]));
      for (const [c, r] of st) {
        const last = nodes[nodes.length - 1];
        if (last.c === c && last.r === r) { last.wall = s; continue; }
        nodes.push({ c, r, wall: s });
      }
      cur = nid(...st[st.length - 1]);
    }
  }
  go(nid(...cy.home));
  nodes.push({ c: cy.home[0], r: cy.home[1], wall: -1 });
  for (const n of nodes) n.p = pos(n.c, n.r);
  // where each wall cell sits on the lap
  const walls = new Map();
  nodes.forEach((n, k) => {
    if (n.wall < 0) return;
    const id = nid(n.c, n.r);
    if (!walls.has(id)) walls.set(id, { c: n.c, r: n.r, slot: n.wall, ks: [] });
    walls.get(id).ks.push(k);
  });
  const R = { nodes, L: nodes.length - 1, walls: [...walls.values()] };
  if (routes.size > 64) routes.delete(routes.keys().next().value);
  routes.set(key, R);
  return R;
}

// The rest lap: each cycle circles its own pair of digits through the dark
// lanes between them and round the board's edge. Cyan: down the centre
// lane, under to lane 3, up it, over the top, down the left edge (just off
// the board), under everything and back up the centre lane. Orange is the
// same lap turned 180 degrees, so twice a lap the two pass each other,
// side by side, in the centre lane.
const LOOP_C = (() => {
  const pts = [[7, -1]], to = (c, r) => {
    let [pc, pr] = pts[pts.length - 1];
    while (pc !== c || pr !== r) { pc += Math.sign(c - pc); pr += Math.sign(r - pr); pts.push([pc, pr]); }
  };
  to(7, 8); to(3, 8); to(3, -1); to(-1, -1); to(-1, 8); to(7, 8); to(7, -1);
  return pts;
})();
const LOOPS = [LOOP_C, LOOP_C.map(([c, r]) => [15 - c, 7 - r])];
const LAPS = 14, T_LAP = 60 / LAPS, LOOP_L = LOOP_C.length - 1, V_LOOP = LOOP_L / T_LAP;
const COLLIDE = LOOP_L - 4.5;                    // arc where both meet mid-board on the way home
const T_COL = (LOOP_L - COLLIDE) / V_LOOP;       // the crash comes this long before the hour

/** Lattice position along a lap at arc q, with the heading. */
function loopAt(L, q) {
  const k = Math.min(Math.floor(q), L.length - 2), f = q - k, a = L[k], b = L[k + 1];
  return [kit.lerp(a[0], b[0], f), kit.lerp(a[1], b[1], f), b[0] - a[0], b[1] - a[1]];
}

const plans = new Map();
/**
 * One cycle's minute starting at epoch second M. If its digits change it
 * leaves the lap at home and rides an excursion that lays the new digits,
 * surging out and easing back home exactly one lap (or two) later.
 */
function planFor(ci, M) {
  const key = `${ci}:${M}`;
  if (plans.has(key)) return plans.get(key);
  const cy = CYCLES[ci], digs = digitsAt(M), was = digitsAt(M - 60);
  const changed = new Set(cy.slots.filter((s) => digs[s] !== was[s]));
  const near = ci ? cy.slots : [...cy.slots].reverse();
  let exc = null, Texc = 0, Td = 1;
  if (changed.size) {
    // after the crash the cycles rez in where they died, mid-board
    const start = isHour(M) ? [ci ? 8 : 7, ci ? 3 : 4] : cy.home;
    exc = routeFor(ci, digs, [...near.filter((s) => changed.has(s)), ...near.filter((s) => !changed.has(s))], start);
    Td = kit.clamp(exc.L / 22, 1.6, 2.8);
    Texc = T_LAP * Math.ceil((Td + 0.3) / T_LAP);
  }
  const first = new Map();
  if (exc) exc.nodes.forEach((n, k) => { if (n.wall >= 0 && !first.has(nid(n.c, n.r))) first.set(nid(n.c, n.r), k); });
  const cells = [];
  for (const s of cy.slots) cellsOf(s, digs[s]).forEach(([c, r], j) => {
    const id = nid(c, r);
    cells.push({ id, slot: s, j, p: pos(c, r), k: changed.has(s) ? first.get(id) ?? 0 : -1 });
  });
  const pl = { exc, Texc, Td, changed, cells, crash: isHour(M + 60), after: isHour(M) };
  // when the cycle lays each new wall cell: invert the ride curve
  for (const w of cells) {
    if (w.k < 0) continue;
    let lo = 0, hi = Td;
    for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (rideS(pl, mid) < w.k) lo = mid; else hi = mid; }
    w.tk = hi;
  }
  if (plans.size > 12) plans.delete(plans.keys().next().value);
  plans.set(key, pl);
  return pl;
}

/** Point at arc length s along a route, and the heading there. */
function along(R, s) {
  s = kit.clamp(s, 0, R.L - 1e-6);
  const k = Math.floor(s), f = s - k, a = R.nodes[k].p, b = R.nodes[k + 1].p;
  return [kit.lerp(a[0], b[0], f), kit.lerp(a[1], b[1], f), b[0] - a[0], b[1] - a[1]];
}

/** Arc ridden on the excursion `tm` s into the minute: a sine surge, then the garage. */
const rideS = (pl, tm) => { const u = Math.min(1, tm / pl.Td); return pl.exc.L * (0.3 * u + 0.35 * (1 - Math.cos(Math.PI * u))); };

/** Where cycle ci is at epoch second T: [x, y, dx, dy, alpha], or null (derezzed). */
function headAt(ci, T) {
  const M = Math.floor(T / 60) * 60, tm = T - M, pl = planFor(ci, M);
  const alpha = pl.after ? kit.smoothstep(0.05, 0.35, tm) : 1;
  if (pl.exc && tm < pl.Texc) {
    const parked = kit.smoothstep(pl.Td - 0.1, pl.Td + 0.15, tm) * (1 - kit.smoothstep(pl.Texc - 0.25, pl.Texc, tm));
    return [...along(pl.exc, rideS(pl, tm)), alpha * (1 - parked)];         // dark while parked in the garage
  }
  const q = (tm % T_LAP) * V_LOOP;
  let [c, r, dc, dr] = loopAt(LOOPS[ci], q);
  if (pl.crash && tm >= 60 - T_LAP && q > COLLIDE - 9) {
    if (q >= COLLIDE) return null;
    c += (ci ? -0.5 : 0.5) * kit.smoothstep(COLLIDE - 9, COLLIDE, q);   // swerve into the other lane
  }
  const [x, y] = pos(c, r), [x2, y2] = pos(c + dc, r + dr);
  return [x, y, x2 - x, y2 - y, alpha];
}

const debrisCache = new Map();
/**
 * The derez at the turn into minute N: every wall cell of a digit that
 * changes becomes a voxel at time ts. Minute: the wall unzips along its
 * stroke and blows away behind. Hour: the crash's shockwave shatters it.
 */
function debrisFor(N) {
  if (debrisCache.has(N)) return debrisCache.get(N);
  const prev = digitsAt(N - 60), next = digitsAt(N), hour = isHour(N);
  const list = [], dead = new Map();
  for (let s = 0; s < 4; s++) {
    if (prev[s] === next[s]) continue;
    const cells = cellsOf(s, prev[s]);
    cells.forEach(([c, r], j) => {
      const [x, y] = pos(c, r), h1 = kit.hash(N, s * 31 + j), h2 = kit.hash(j, N, s + 7);
      let ts, vx, vy;
      if (hour) {
        ts = Math.min(N - T_COL + Math.hypot(x, y) / VW, N - 0.03);
        const a = Math.atan2(y, x) + (h1 - 0.5) * 0.9, sp = 16 + 22 * h2;
        vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
      } else {
        ts = N - 0.55 + (0.4 * j) / cells.length;
        vx = -(9 + 16 * h1); vy = (h2 - 0.5) * 20;
      }
      list.push({ x, y, ts, vx, vy, col: SLOT_COL[s], a: hour ? 0.42 : 0.6 });
      dead.set(nid(c, r), ts);
    });
  }
  const d = { list, dead };
  if (debrisCache.size > 6) debrisCache.delete(debrisCache.keys().next().value);
  debrisCache.set(N, d);
  return d;
}

const DRAG = 2.6;
const flight = (age) => (1 - Math.exp(-DRAG * age)) / DRAG;

function drawDebris(ctx, D, now, dim) {
  for (const q of D.list) {
    const age = now - q.ts;
    if (age < 0 || age >= LIFE) continue;
    const f = flight(age), fade = (1 - age / LIFE) ** 2;
    const c = kit.mix(q.col, WHITE, 0.6 * Math.exp(-age / 0.07));
    kit.splat(ctx, q.x + q.vx * f, q.y + q.vy * f, P * 1.05, c, q.a * fade * dim);
  }
}

const SPARKS = 22, BURST = kit.hex('#fff0d8');
/** The head-on crash, `age` seconds after impact at the centre. */
function drawCrash(ctx, age, dim) {
  if (age < 0 || age > 1.4) return;
  if (age < 0.5) kit.splat(ctx, 0, 0, 3 + 16 * age, BURST, 0.8 * (1 - age / 0.5) ** 2 * dim);
  const R = VW * age, fade = kit.clamp(1 - age / 1.0);
  if (fade > 0) for (const l of ctx.leds) {
    const rd = Math.hypot(l.x, l.y) - R;
    if (Math.abs(rd) > 3.5) continue;
    const c = kit.mix(kit.mix(CYAN, ORANGE, kit.smoothstep(-6, 6, l.y)), WHITE, 0.12);
    kit.add(ctx, l.i, c, Math.exp(-(rd * rd) / 1.6) * fade * 0.4 * dim);
  }
  const f = flight(age), life = kit.clamp(1 - age / 1.2) ** 1.5;
  for (let j = 0; j < SPARKS; j++) {
    const a = (kit.TAU * j) / SPARKS + kit.hash(j, 3) * 0.5, sp = 22 + 30 * kit.hash(j, 9);
    const c = kit.mix(j % 2 ? ORANGE : CYAN, WHITE, Math.exp(-age / 0.12));
    kit.splat(ctx, Math.cos(a) * sp * f, Math.sin(a) * sp * f, P, c, 0.6 * life * dim);
  }
}

const cellLeds = new WeakMap();
/** Board cell -> LED index, for this layout. */
function ledsOf(L) {
  if (cellLeds.has(L)) return cellLeds.get(L);
  const m = new Int32Array(NN).fill(-1);
  for (let c = 0; c <= 15; c++) for (let r = 0; r <= 7; r++) m[nid(c, r)] = L.index.at(...pos(c, r));
  cellLeds.set(L, m);
  return m;
}

export default {
  name: 'Light Cycle',
  blurb: 'two Tron light cycles race the slanted arena; their jetwalls are the digits, derezzed and re-ridden each minute, crashed head-on at the hour',
  layouts: ['para'], look: { look: 'opal', gap: 0.8 }, fps: 60, brightness: 1, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, tm = now - M, N = M + 60;
    const dim = 1 - 0.75 * ctx.night;
    const idx = ledsOf(ctx.layout);
    const up = tm > 58.5 ? debrisFor(N) : null;
    const past = tm < 2 ? debrisFor(M) : null;

    for (let ci = 0; ci < 2; ci++) {
      const cy = CYCLES[ci], pl = planFor(ci, M);
      const head = headAt(ci, now);

      // the jetwalls: laid behind the cycle, charged where it passes close
      for (const w of pl.cells) {
        if (up && up.dead.has(w.id) && now >= up.dead.get(w.id)) continue;
        if (w.k >= 0 && tm < w.tk) continue;                     // not laid yet
        let e = w.k >= 0 ? Math.exp(-(tm - w.tk) / 0.4) : 0;     // fresh wall glows white-hot
        if (head) { const d2 = (head[0] - w.p[0]) ** 2 + (head[1] - w.p[1]) ** 2; e = Math.max(e, 0.7 * head[4] * Math.exp(-d2 / 18)); }
        // energy runs along the wall the way it was ridden
        const flow = 0.5 + 0.5 * Math.sin(kit.TAU * (w.j / 7 - now * 0.8));
        kit.add(ctx, idx[w.id], kit.mix(cy.col, cy.hot, 0.55 * e), (0.26 + 0.12 * flow * flow + 0.8 * e) * dim);
      }

      // the cycle and the short ribbon of light it trails
      for (let j = 6; j >= 0; j--) {
        const h = j ? headAt(ci, now - j * 0.035) : head;
        if (!h) continue;
        const [x, y, dx, dy, a] = h;
        if (j) { kit.splat(ctx, x, y, P * 0.95, cy.col, 0.32 * (1 - j / 7) * a * dim); continue; }
        const n = Math.hypot(dx, dy) || 1;
        kit.splat(ctx, x, y, P * 1.2, kit.mix(cy.col, WHITE, 0.6), 1.1 * a * dim);
        kit.splat(ctx, x - (dx / n) * 1.4, y - (dy / n) * 1.4, P * 1.0, cy.col, 0.6 * a * dim);
      }
    }

    if (past) drawDebris(ctx, past, now, dim);
    if (up) drawDebris(ctx, up, now, dim);
    if (isHour(N) && tm >= 60 - T_COL) drawCrash(ctx, tm - (60 - T_COL), dim);
    if (isHour(M) && tm < 1.5) drawCrash(ctx, tm + T_COL, dim);
  },
};
