// Crossroads traffic: the signal cycle, lane routes and a closed-form queue.
// Every vehicle is known from its arrival time alone: per approach and per
// green, the arrivals are hashed, those that meet red stop in a queue slot,
// and the queue discharges with a fixed headway once the light turns green.
// So a vehicle's position is a pure function of time (no simulation).
import { hash } from '../js/kit.js';
import { KIND } from './crossroads-draw.js';

export const CYCLE = 30;
// phases, seconds into each 30 s cycle (the cycle is locked to the minute)
export const EW_G = [0, 9], EW_A = [9, 11], NS_G = [12, 20], NS_A = [20, 22], WALK = [23, 29];
export const V = 34, ACC = 26, DEC = 40, HEAD = 0.9, LOST = 0.6, GAP = 4;

/** Light shown to approach group g (0 = E-W, 1 = N-S) at time t (s): 0 red, 1 amber, 2 green. */
export function light(g, t) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE, G = g ? NS_G : EW_G, A = g ? NS_A : EW_A;
  return c >= G[0] && c < G[1] ? 2 : c >= A[0] && c < A[1] ? 1 : 0;
}

// routes: a list of segments; s runs along them in px
function line(x0, y0, x1, y1) { const L = Math.hypot(x1 - x0, y1 - y0); return { k: 0, x0, y0, dx: (x1 - x0) / L, dy: (y1 - y0) / L, cx: 0, cy: 0, a0: 0, len: L }; }
function arc(cx, cy, a0) { return { k: 1, x0: 0, y0: 0, dx: 0, dy: 0, cx, cy, a0, len: 12 * Math.PI / 2 }; }   // r 12, +90 deg
const D = Math.PI / 180;
// approach a: 0 EB (y 108), 1 WB (y 84), 2 SB (x 84), 3 NB (x 108); turn 0 straight, 1 right
export const ROUTES = [
  [[line(-30, 108, 222, 108)], [line(-30, 108, 72, 108), arc(72, 120, -90 * D), line(84, 120, 84, 222)]],
  [[line(222, 84, -30, 84)], [line(222, 84, 120, 84), arc(120, 72, 90 * D), line(108, 72, 108, -30)]],
  [[line(84, -30, 84, 222)], [line(84, -30, 84, 72), arc(72, 72, 0), line(72, 84, -30, 84)]],
  [[line(108, 222, 108, -30)], [line(108, 222, 108, 120), arc(120, 120, 180 * D), line(120, 108, 222, 108)]],
];
for (const pair of ROUTES) for (const r of pair) r.total = r.reduce((s, g) => s + g.len, 0);

/** Pose along a route at distance s: out = [x, y, heading]. */
export function pose(route, s, out) {
  let g = route[0], i = 0;
  if (s > 0) for (; i < route.length; i++) { g = route[i]; if (s <= g.len || i === route.length - 1) break; s -= g.len; }
  if (g.k === 0) { out[0] = g.x0 + g.dx * s; out[1] = g.y0 + g.dy * s; out[2] = Math.atan2(g.dy, g.dx); }
  else { const a = g.a0 + s / 12; out[0] = g.cx + 12 * Math.cos(a); out[1] = g.cy + 12 * Math.sin(a); out[2] = a + Math.PI / 2; }
  return out;
}

const BODY = [
  [0.55, 0.035, 0.03], [0.04, 0.12, 0.55], [0.55, 0.55, 0.56], [0.26, 0.28, 0.31],
  [0.05, 0.28, 0.12], [0.6, 0.25, 0.03], [0.08, 0.08, 0.1], [0.35, 0.05, 0.3],
];
const TAXI = [0.78, 0.5, 0.025], BUS = [0.6, 0.04, 0.03], VAN = [0.62, 0.62, 0.6];
const RIDER = [[0.05, 0.3, 0.55], [0.55, 0.3, 0.02], [0.08, 0.4, 0.15]];

/** One vehicle, monomorphic. */
function makeVehicle(app, turn, kindName, col, a0, sq, rel, queued) {
  return { app, turn, kind: KIND[kindName], col, a0, sq, rel, queued, lat: kindName === 'bike' ? 7.5 : 0, tS: 0, tB: 0 };
}

const cache = new Map();
/**
 * The vehicles served by green number c of approach app (they arrive at the
 * stop line between the previous green's end and this one's).
 */
export function bucket(app, c) {
  const key = c * 4 + app;
  let b = cache.get(key);
  if (b) return b;
  b = [];
  const ns = app >= 2, G = ns ? NS_G : EW_G;
  const gs = c * CYCLE + G[0], ge = c * CYCLE + G[1];
  // arrival times at the stop line
  const T = [];
  if (ns) {                       // N-S arrives on a green wave: never queues over the road paint
    const n = 1 + Math.floor(hash(app, c, 11) * 2.6);
    for (let k = 0; k < n; k++) T.push(gs + 0.4 + (k + 0.15 + 0.6 * hash(app, c, 20 + k)) * (G[1] - G[0] - 1.6) / n);
  } else {
    const n = 3 + Math.floor(hash(app, c, 11) * 3);
    const w0 = ge - CYCLE;
    for (let k = 0; k < n; k++) T.push(w0 + (k + 0.1 + 0.8 * hash(app, c, 20 + k)) * CYCLE / n);
  }
  let front = 89, j = 0, lastClear = -1e9;
  for (let k = 0; k < T.length; k++) {
    const hk = hash(app, c, 40 + k);
    let kind = hk < 0.5 ? 'car' : hk < 0.68 ? 'taxi' : hk < 0.78 ? 'van' : hk < 0.88 ? 'bike' : 'bus';
    if (ns && kind === 'bus') kind = 'car';
    const K = KIND[kind];
    const col = kind === 'taxi' ? TAXI : kind === 'bus' ? BUS : kind === 'van' ? VAN : kind === 'bike' ? RIDER[Math.floor(hash(app, c, 60 + k) * 3)] : BODY[Math.floor(hash(app, c, 50 + k) * BODY.length)];
    // right turns: N-S often (they leave the painted arms); E-W only in the :30 cycle,
    // so nothing turns into the arms while the road crew works around :00
    const half = ((c % 2) + 2) % 2;
    const turn = kind !== 'bus' && hash(app, c, 70 + k) < (ns ? 0.45 : half ? 0.3 : 0) ? 1 : 0;
    const sStop = 89 - K.hl;
    const a0 = T[k] - sStop / V;
    const free = (T[k] >= gs && T[k] < ge && T[k] >= lastClear) || ns;
    if (free) { b.push(makeVehicle(app, turn, kind, col, a0, 0, 0, false)); continue; }
    if (j >= 5) continue;
    const sq = front - K.hl;
    let rel = gs + LOST + HEAD * j;
    const v = makeVehicle(app, turn, kind, col, a0, sq, rel, true);
    v.tB = a0 + (sq - V * V / (2 * DEC)) / V;
    v.tS = v.tB + V / DEC;
    if (rel < v.tS + 0.3) rel = v.rel = v.tS + 0.3;
    lastClear = rel + Math.sqrt(2 * (89 - sq + K.hl + GAP) / ACC);
    front -= 2 * K.hl + GAP;
    j++;
    b.push(v);
  }
  if (cache.size > 400) cache.clear();
  cache.set(key, b);
  return b;
}

/** Distance along its route of vehicle v at time t, and whether it is braking/stopped. */
export function travel(v, t, out) {
  if (!v.queued) { out[0] = V * (t - v.a0); out[1] = 0; return out; }
  const db = V * V / (2 * DEC);
  if (t < v.tB) { out[0] = V * (t - v.a0); out[1] = 0; }
  else if (t < v.tS) { const u = t - v.tB; out[0] = v.sq - db + V * u - 0.5 * DEC * u * u; out[1] = 1; }
  else if (t < v.rel) { out[0] = v.sq; out[1] = 1; }
  else {
    const u = t - v.rel, ta = V / ACC;
    out[0] = u < ta ? v.sq + 0.5 * ACC * u * u : v.sq + 0.5 * ACC * ta * ta + V * (u - ta);
    out[1] = u < 0.4 ? 1 : 0;
  }
  return out;
}
