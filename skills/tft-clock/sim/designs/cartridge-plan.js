// Cartridge: the level and the play. Per minute this works out, once, what
// the hero does from :00 to :60 (a list of moves in closed form), where the
// coins and the beetle are, and when each block of a changing digit bursts
// or pops. frame() only looks things up in it.

import { clockFields, hash } from '../js/kit.js';
import { MASKS, DW, DH } from './cartridge-art.js';

export const DX = [4, 40, 88, 124], DY = [32, 32, 24, 24];
export const COLON = [[76, 36], [76, 50]];
export const GROUND = 72, SHORE = 88, POLE_X = 80;
export const V_RUN = 40, V_AIR = 62;
export const HOLE = 999;
const XMIN = 10, XMAX = 150;

export const digitsOf = (key) => { const f = clockFields(new Date(key * 60000)); return [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]]; };

// ------------------------------------------------------------ the walkable surface
/** Top of solid ground in each column (y of the first solid pixel), for a set of digits. */
export function topProfile(digs) {
  const top = new Int16Array(160).fill(HOLE);
  for (let x = 0; x < SHORE; x++) top[x] = GROUND;
  for (const [cx, cy] of COLON) for (let x = cx; x < cx + 8; x++) top[x] = Math.min(top[x], cy);
  for (let i = 0; i < 4; i++) {
    const m = MASKS[digs[i]].m;
    for (let x = 0; x < DW; x++) {
      for (let y = 0; y < DH; y++) if (m[y * DW + x]) { const X = DX[i] + x; top[X] = Math.min(top[X], DY[i] + y); break; }
    }
  }
  return top;
}

/** Where the feet stand at each column: the highest support under an 8-px stance. */
export function walkProfile(top) {
  const ws = new Int16Array(160);
  for (let x = 0; x < 160; x++) {
    let m = HOLE;
    for (let k = -4; k <= 4; k++) { const xx = x + k; if (xx >= 0 && xx < 160 && top[xx] < m) m = top[xx]; }
    ws[x] = m >= 56 ? HOLE : m; // deep wells and water are not walked on
  }
  return ws;
}

// ------------------------------------------------------------ moves
// kind: idle | walk | jump | pound | hang | slide
function mv(list, k, t0, t1, x0, x1, y0, y1, o = {}) {
  let h = o.h ?? 0;
  if (k === 'jump') h = Math.max(2, Math.min(h, (y0 + y1) / 2 - 17)); // keep the head on the glass
  list.push({ k, t0, t1, x0, x1, y0, y1, h, face: o.face ?? (x1 >= x0 ? 1 : -1), pose: o.pose ?? null });
  return t1;
}

/** Evaluate the hero at time s: { x, y (feet), face, pose, air } */
export function heroAt(plan, s) {
  const L = plan.moves;
  let lo = 0, hi = L.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid].t0 <= s) lo = mid; else hi = mid - 1; }
  const m = L[lo];
  const u = m.t1 > m.t0 ? Math.min(1, Math.max(0, (s - m.t0) / (m.t1 - m.t0))) : 1;
  const x = m.x0 + (m.x1 - m.x0) * u;
  let y, pose = m.pose, air = false;
  switch (m.k) {
    case 'walk': {
      const xi = Math.max(0, Math.min(159, Math.round(x)));
      y = plan.ws[xi] === HOLE ? m.y0 : plan.ws[xi];
      if (!pose) { const d = Math.abs(x - m.x0); pose = ['run1', 'run2', 'run3', 'run2'][Math.floor(d / 4) & 3]; }
      break;
    }
    case 'jump':
      y = m.y0 + (m.y1 - m.y0) * u - 4 * m.h * u * (1 - u);
      air = true;
      if (!pose) pose = u < 0.5 ? 'jump' : 'fall';
      break;
    case 'slide': y = m.y0 + (m.y1 - m.y0) * u * u; pose = 'hang'; air = true; break;
    default:
      y = m.y0 + (m.y1 - m.y0) * u;
      if (!pose) pose = 'stand';
  }
  return { x, y, face: m.face, pose, air, k: m.k };
}

// ------------------------------------------------------------ the patrol
function patrol(P, x, dir, t, tEnd, seed) {
  const { ws, moves } = P;
  const hole = (q) => q < 0 || q > 159 || ws[q] === HOLE;
  let lastY = ws[Math.round(x)];
  let guard = 0;
  while (t < tEnd - 0.05 && guard++ < 200) {
    x = Math.round(x);
    const bound = dir > 0 ? XMAX : XMIN;
    let p = x;
    while (p !== bound && !hole(p + dir) && Math.abs(ws[p + dir] - ws[p]) <= 4) p += dir;
    if (p !== x) {
      t = walkWithEvents(P, x, p, dir, t, tEnd, seed);
      if (t >= tEnd - 0.05) return { x: P.lastX, dir, t };
      x = p;
    }
    if (p === bound) {
      const ti = t + 0.35 + (hash(seed, guard, 5) % 3) * 0.15;
      t = mv(moves, 'idle', t, Math.min(ti, tEnd), x, x, ws[x], ws[x], { face: dir, pose: (hash(seed, guard, 6) & 3) === 0 ? 'blink' : 'stand' });
      dir = -dir;
      continue;
    }
    // a gap or a step: find the landing on the far side
    let q = p + dir * 2;
    const stable = (z) => !hole(z) && !hole(z + dir) && !hole(z + 2 * dir) && Math.abs(ws[z + dir] - ws[z]) <= 1 && Math.abs(ws[z + 2 * dir] - ws[z]) <= 2;
    while (q > XMIN - 6 && q < XMAX + 6 && !stable(q)) q += dir;
    if (!(q > XMIN - 6 && q < XMAX + 6)) { dir = -dir; continue; }
    const land = Math.max(XMIN, Math.min(XMAX, q + dir * 3));
    if (Math.abs(land - p) < 3) { dir = -dir; continue; }
    let hiY = Math.min(ws[p], ws[land]);
    for (let z = Math.min(p, land); z <= Math.max(p, land); z++) if (ws[z] !== HOLE) hiY = Math.min(hiY, ws[z]);
    const dur = Math.max(0.34, Math.min(0.85, Math.abs(land - p) / V_AIR));
    const apex = hiY - 9 - (hash(seed, guard, 9) % 3) * 2;
    const h = (ws[p] + ws[land]) / 2 - apex;
    t = mv(moves, 'jump', t, t + dur, p, land, ws[p], ws[land], { h });
    x = land;
    P.lastX = x;
  }
  return { x, dir, t };
}

/** Walk x0 -> x1, sometimes hopping for a coin or stomping a beetle on the way. */
function walkWithEvents(P, x0, x1, dir, t, tEnd, seed) {
  const { moves, ws } = P;
  const len = Math.abs(x1 - x0);
  const flat = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); if (lo < 0 || hi > 159) return false; for (let z = lo; z <= hi; z++) if (ws[z] === HOLE || Math.abs(ws[z] - ws[lo]) > 8 || (z > lo && Math.abs(ws[z] - ws[z - 1]) > 2)) return false; return true; };
  let x = x0;
  const n = moves.length;
  // a beetle: it floats down on a leaf ahead, walks at the hero, gets stomped
  if (len >= 48 && P.bops < 2 && t > 4 && t + 3 < tEnd && (hash(seed, n, 21) % 2) === 0) {
    const D = 40, L = 16, ve = 14;
    const xa = x0 + dir * 4;
    if (flat(xa, xa + dir * (D + 2)) && Math.abs(x1 - xa) >= D) {
      const tw = (D - L - 0.4 * ve) / (V_RUN + ve);
      t = mv(moves, 'walk', t, t + 4 / V_RUN, x0, xa, ws[x0], ws[xa]);
      const t0 = t;
      const xh1 = xa + dir * V_RUN * tw;
      t = mv(moves, 'walk', t, t + tw, xa, xh1, ws[xa], ws[xa]);
      const xl = xh1 + dir * L;
      const yl = ws[Math.round(xl)];
      t = mv(moves, 'jump', t, t + 0.4, xh1, xl, ws[Math.round(xh1)], yl - 7, { h: 10 });
      const tb = t;
      P.beetles.push({ x0: xa + dir * D, y: ws[xa], t0, tb, dir: -dir, ve });
      void 0;
      P.points.push([tb, 100]);
      // the bounce off its back
      let xb = Math.round(xl + dir * 14);
      if (ws[xb] === HOLE || Math.abs(xb - x1) * dir > 0 && (xb - x1) * dir > 0) xb = x1;
      t = mv(moves, 'jump', t, t + 0.36, xl, xb, yl - 7, ws[xb], { h: 9 });
      P.bops++;
      x = Math.round(xb);
      if (t >= tEnd) { P.lastX = x; return t; }
      return walkWithEvents(P, x, x1, dir, t, tEnd, seed);
    }
  }
  // a coin hop
  if (len >= 30 && P.coins.length < 5 && (hash(seed, n, 23) % 3) !== 0) {
    const mid = Math.round(x0 + dir * (10 + (hash(seed, n, 24) % Math.max(1, len - 22))));
    const a = mid - dir * 10, b = mid + dir * 10;
    if (flat(a, b)) {
      const ta = t + Math.abs(a - x0) / V_RUN;
      if (ta + 0.45 < tEnd) {
        t = mv(moves, 'walk', t, ta, x0, a, ws[x0], ws[a]);
        const cy = 9, H = Math.max(4, Math.min(ws[a], ws[b]) - cy - 12);
        t = mv(moves, 'jump', t, t + 0.3 + H * 0.012, a, b, ws[a], ws[b], { h: H });
        P.coins.push({ x: mid, y: cy, tHit: (t + moves[moves.length - 1].t0) / 2 });
        P.points.push([P.coins[P.coins.length - 1].tHit, 50]);
        x = b;
        return walkWithEvents(P, x, x1, dir, t, tEnd, seed);
      }
    }
  }
  let te = t + Math.abs(x1 - x) / V_RUN, xe = x1;
  if (te > tEnd) { xe = x + dir * (tEnd - t) * V_RUN; te = tEnd; }
  if (te > t) t = mv(moves, 'walk', t, te, x, xe, ws[Math.round(x)], ws[Math.round(xe)]);
  P.lastX = Math.round(xe);
  return t;
}

// ------------------------------------------------------------ the turns
function nearestWalk(ws, lo, hi, want) {
  let best = -1, bd = 1e9;
  for (let x = lo; x <= hi; x++) if (ws[x] !== HOLE && Math.abs(x - want) < bd) { bd = Math.abs(x - want); best = x; }
  return best;
}

/** What happens across the boundary into minute `key`: the turn from key-1 to key. */
const TURNS = new Map();
export function turnInto(key) {
  let T = TURNS.get(key);
  if (T) return T;
  const a = digitsOf(key - 1), b = digitsOf(key);
  const changed = [0, 1, 2, 3].filter((i) => a[i] !== b[i]);
  const hour = clockFields(new Date(key * 60000)).m === 0;
  const wsA = walkProfile(topProfile(a));
  T = { key, a, b, changed, hour };
  if (hour) {
    T.launch = nearestWalk(wsA, DX[1] + 8, DX[1] + 30, DX[1] + 26);
    T.impact = [POLE_X, GROUND];
    T.impactT = -1.55;
    T.rest = [POLE_X, GROUND];
  } else {
    const ti = changed[0], li = ti - 1;
    T.launch = nearestWalk(wsA, DX[li] + 6, DX[li] + 30, DX[li] + 22);
    T.target = nearestWalk(wsA, DX[ti] + 4, DX[ti] + 28, DX[ti] + 16);
    T.impact = [T.target, wsA[T.target]];
    T.impactT = -1.55;
    T.rest = [T.launch, wsA[T.launch]];
  }
  // each block's burst (before the boundary, s < 0) and pop (after it)
  const [ix, iy] = T.impact;
  T.burst = []; T.pop = [];
  let nb = 0;
  for (const i of changed) {
    const tilesA = MASKS[a[i]].tiles.map(([c, r]) => {
      const cx = DX[i] + c * 8 + 4, cy = DY[i] + r * 8 + 4;
      const d = Math.hypot(cx - ix, cy - iy);
      return { i, c, r, x: DX[i] + c * 8, y: DY[i] + r * 8, tb: T.impactT + 0.02 + d / 150, seed: hash(key, i * 32 + c * 8 + r) };
    });
    T.burst.push(...tilesA); nb += tilesA.length;
    // each new digit builds quickly once it starts (~0.3 s), so a half-built
    // digit is on the glass only briefly, always over its own full ghost
    let start;
    if (hour) { const cx = DX[i] + 16; let lo = 0, hi = WIPE_T; for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (wipeFront(m) < cx) lo = m; else hi = m; } start = lo; }
    else start = 0.12 + changed.indexOf(i) * 0.38;
    const tl = MASKS[b[i]].tiles, ds = tl.map(([c, r]) => Math.hypot(DX[i] + c * 8 + 4 - T.rest[0], DY[i] + r * 8 + 4 - (T.rest[1] - 8)));
    const dmin = Math.min(...ds), dmax = Math.max(...ds);
    const tilesB = tl.map(([c, r], k) => {
      const u = dmax > dmin ? (ds[k] - dmin) / (dmax - dmin) : 0;
      const tp = start + (hour ? (hash(key, i, c * 8 + r) % 7) * 0.03 : u * 0.3);
      return { i, c, r, x: DX[i] + c * 8, y: DY[i] + r * 8, tp };
    });
    T.pop.push(...tilesB);
  }
  T.nBurst = nb;
  TURNS.set(key, T);
  if (TURNS.size > 6) TURNS.delete(TURNS.keys().next().value);
  return T;
}
// the hour's wipe front: the new world arrives left to right, 0.0 .. 1.3 s
export const WIPE_T = 1.3;
export function wipeEase(u) { return u; }
export function wipeFront(s) { // x of the front at s seconds into the hour
  if (s < 0) return -1;
  const u = Math.min(1, s / WIPE_T);
  return 160 * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) ;
}

// ------------------------------------------------------------ one minute's play
const PLANS = new Map();
export function planFor(key) {
  let P = PLANS.get(key);
  if (P) return P;
  const digs = digitsOf(key);
  const top = topProfile(digs), ws = walkProfile(top);
  P = { key, digs, top, ws, moves: [], coins: [], beetles: [], points: [], bops: 0, lastX: 0 };
  const Tin = turnInto(key), Tout = turnInto(key + 1);
  const seed = hash(key, 77);
  let t = 0, x, dir = 1;
  // ---- the start: where the last turn left the hero
  if (Tin.hour) {
    x = POLE_X;
    t = mv(P.moves, 'idle', 0, 1.0, x, x, GROUND, GROUND, { face: 1, pose: 'stand' });
    t = mv(P.moves, 'idle', t, 1.6, x, x, GROUND, GROUND, { face: 1, pose: 'cheer' });
    t = mv(P.moves, 'idle', t, 2.6, x, x, GROUND, GROUND, { face: -1, pose: 'stand' });
    const to = nearestWalk(ws, DX[1] + 6, DX[1] + 30, DX[1] + 20);
    t = mv(P.moves, 'jump', t, t + 0.7, x, to, GROUND, ws[to], { h: GROUND - ws[to] + 12, face: -1 });
    x = to; dir = -1;
  } else {
    x = Tin.rest[0];
    const y = ws[x] === HOLE ? Tin.rest[1] : ws[x];
    t = mv(P.moves, 'idle', 0, 1.15, x, x, y, y, { face: 1, pose: 'stand' });
    t = mv(P.moves, 'jump', t, t + 0.34, x, x, y, y, { h: 7, face: 1, pose: 'cheer' });
    t = mv(P.moves, 'idle', t, 1.75, x, x, y, y, { face: 1 });
    dir = 1;
  }
  // ---- the patrol
  const TSTOP = 52.5;
  const r = patrol(P, x, dir, t, TSTOP, seed);
  x = Math.round(r.x); t = Math.max(t, r.t);
  if (P.moves.length) { const m = P.moves[P.moves.length - 1]; x = Math.round(m.x1); t = m.t1; }
  // ---- go to the launch point
  const L = Tout.launch;
  {
    const goDir = L > x ? 1 : -1;
    // walk there (with jumps), no events
    const save = { coins: P.coins.length };
    P.coins.length = Math.max(P.coins.length, 4); // no more hops
    const bopsSave = P.bops; P.bops = 9;
    let guard = 0;
    while (x !== L && guard++ < 30) {
      const d = L > x ? 1 : -1;
      let p = x;
      while (p !== L && ws[p + d] !== HOLE && Math.abs(ws[p + d] - ws[p]) <= 4) p += d;
      if (p !== x) { t = mv(P.moves, 'walk', t, t + Math.abs(p - x) / (V_RUN * 1.2), x, p, ws[x], ws[p]); x = p; }
      if (x === L) break;
      let q = p + d * 2;
      while (q !== L && (ws[q] === HOLE || ws[q + d] === HOLE)) q += d;
      const land = (Math.abs(L - q) < 4) ? L : q + d * 2;
      let hiY = Math.min(ws[p], ws[land]);
      for (let z = Math.min(p, land); z <= Math.max(p, land); z++) if (ws[z] !== HOLE) hiY = Math.min(hiY, ws[z]);
      const dur = Math.max(0.34, Math.min(0.85, Math.abs(land - p) / V_AIR));
      t = mv(P.moves, 'jump', t, t + dur, p, land, ws[p], ws[land], { h: (ws[p] + ws[land]) / 2 - (hiY - 9) });
      x = land;
    }
    P.coins.length = save.coins; P.bops = bopsSave;
    void goDir;
  }
  const yL = ws[L];
  // waiting at the launch point: little ready-hops, facing the target
  {
    const until = Tout.hour ? 56.7 : 57.4;
    let k = 0;
    while (t + 0.9 < until) {
      t = mv(P.moves, 'idle', t, t + 0.5, L, L, yL, yL, { face: 1, pose: (k++ % 3 === 2) ? 'blink' : 'stand' });
      t = mv(P.moves, 'jump', t, t + 0.3, L, L, yL, yL, { h: 5, face: 1, pose: 'jump' });
    }
  }
  if (Tout.hour) {
    // the goal: wait for the pole, leap to it, slide down, hop off
    t = mv(P.moves, 'idle', t, Math.max(t + 0.1, 57.0), L, L, yL, yL, { face: 1, pose: 'stand' });
    const hx = POLE_X - 5;
    t = mv(P.moves, 'jump', 57.0, 57.42, L, hx, yL, 28, { h: 8, face: 1, pose: 'jump' });
    t = mv(P.moves, 'slide', t, 58.42, hx, hx, 28, GROUND, { face: 1 });
    t = mv(P.moves, 'idle', t, 58.62, hx, hx, GROUND, GROUND, { face: 1, pose: 'hang' });
    t = mv(P.moves, 'jump', t, 58.95, hx, POLE_X, GROUND, GROUND, { h: 6, face: 1 });
    t = mv(P.moves, 'idle', t, 60.5, POLE_X, POLE_X, GROUND, GROUND, { face: 1, pose: 'stand' });
  } else {
    const X = Tout.target, yT = ws[X];
    t = mv(P.moves, 'idle', t, Math.max(t + 0.1, 57.75), L, L, yL, yL, { face: 1, pose: 'stand' });
    const yTop = Math.max(17, Math.min(yL, yT) - 20);
    t = mv(P.moves, 'jump', 57.75, 58.17, L, X, yL, yTop, { h: 6, face: 1, pose: 'jump' });
    t = mv(P.moves, 'idle', t, 58.3, X, X, yTop, yTop, { face: 1, pose: 'pound' });
    t = mv(P.moves, 'idle', t, 58.45, X, X, yTop, yT, { face: 1, pose: 'pound' });
    // impact at 58.45: bounce back to the launch point, still facing the target
    t = mv(P.moves, 'jump', t, 59.05, X, L, yT, yL, { h: 16, face: 1, pose: 'fall' });
    t = mv(P.moves, 'idle', t, 60.5, L, L, yL, yL, { face: 1, pose: 'stand' });
  }
  // points: the blocks burst share what is left of this minute's 600
  let used = 0; for (const [, p] of P.points) used += p;
  P.blockPoints = Math.max(0, 600 - used) / Math.max(1, Tout.nBurst);
  P.points.sort((u, v) => u[0] - v[0]);
  PLANS.set(key, P);
  if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  return P;
}
