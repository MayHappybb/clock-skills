// The plot of each minute for katamari.js, and the katamari's rolling.
//
// A minute's plan is a pure function of the digits before, during and after
// it. The ball's floor position is a C1 cubic Hermite curve through keys.
// The keys are designed in screen space (where the ball's disc is drawn) and
// stored on the floor, so the plan can promise what the viewer sees:
//   - the ball, everything stuck to it (COAT px beyond its core) and the
//     prince never touch a numeral that is not being eaten;
//   - at rest (most of the minute) they lap a flat clockwise loop of open
//     floor at the front right, below the minutes and right of the hours:
//     rightward along its far side, round the right end (where the prince,
//     behind the ball, passes above it: out there nothing is in his way),
//     leftward along the near side, round the left end with the prince
//     below. Its height is worked out from the numerals' boxes;
//   - to eat, the ball rolls up the changing numeral from below, on the
//     side away from any numeral that stays (the ones digit alone: up a
//     column just clear of the tens, loop over the top, down the right
//     edge; tens and ones together: up the tens, across, down the ones).
// Things are picked up by contact: an object leaps onto the ball when the
// ball's disc reaches it (R + REACH). The route is timed so the eating
// ends at 59.35 s (at the hour, the ball stops at 54.8 s: the King needs the
// rest of the minute), so every old numeral is gone before :00.
//
// Size: the core grows with the number of things picked up this hour, up to
// RCAP px on screen (the room is small); past that the growth shows in what
// is stuck to it: more of it, and bigger (`bulkFor`).
//
// Rolling: the ball's orientation is the integral of its path (it rolls
// without slipping), stepped at 60 Hz from the start of the hour, when the
// King hands the prince a new ball. Each minute's steps are cached (a
// deterministic table keyed by the minute); the firmware would do one step a
// frame. Plain arithmetic only (quaternion small-angle steps, renormalised
// without a square root), so a cold start replays an hour in a few ms of JS.

import { rand, clockFields } from '../js/kit.js';
import { layDigit, SLOT_UNIT, SLOT_STROKE } from './katamari-digits.js';

export const SIN_E = 0.866, COS_E = 0.5;   // the camera looks down at 60 degrees
export const SLOTS = [
  { x: 4, y: 31, unit: SLOT_UNIT.hour, stroke: SLOT_STROKE.hour },
  { x: 32, y: 31, unit: SLOT_UNIT.hour, stroke: SLOT_STROKE.hour },
  { x: 95, y: 5, unit: SLOT_UNIT.min, stroke: SLOT_STROKE.min },
  { x: 121, y: 5, unit: SLOT_UNIT.min, stroke: SLOT_STROKE.min },
];
export const SPAWN = [150, 71];            // where the new ball lands each hour (floor)
export const SPAWN_T = 1.7;                // ... and when
export const ROUTE_END = 59.35, ROUTE_END_HOUR = 54.8;
const SPEED = 30;                          // px/s while eating
export const R0 = 5.2, RK = 0.5, RMAX = 15.5, RCAP = 10;
export const COAT = 6;                     // how far stuck things reach past the core (px)
const REACH = 4.5;                         // contact: an object this far past the core sticks
const STEPS = 60;                          // integration steps per second
// the prince, relative to his feet: half-width of his head, height to the antenna knob
export const PRINCE_HW = 8.2, PRINCE_H = 22, PRINCE_OFF = 4.2;
// the loop the ball laps at rest: straight runs from X0 to X1 (floor x), ends of radius LOOP_R
const LOOP = { x0: 88, x1: 152, r: 3.5, maxY: 76 };

// ------------------------------------------------------------ digits

const LAY = new Map();
/** The objects of digit d in slot i (cached; pure). */
export function laid(d, i) {
  const k = d * 4 + i;
  if (!LAY.has(k)) { const s = SLOTS[i]; LAY.set(k, layDigit(d, s.x, s.y, s.unit, i, s.stroke)); }
  return LAY.get(k);
}

/** Screen box round every object of digit d in slot i, with keyline and shadow: [x0, y0, x1, y1]. */
const BOX = new Map();
export function digitBox(d, i) {
  const k = d * 4 + i;
  if (BOX.has(k)) return BOX.get(k);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of laid(d, i)) {
    const ex = Math.abs(p.ux) * p.o.len / 2 + Math.abs(p.uy) * p.o.wid / 2 + 1;
    const ey = Math.abs(p.uy) * p.o.len / 2 + Math.abs(p.ux) * p.o.wid / 2 + 1;
    x0 = Math.min(x0, p.x - ex); x1 = Math.max(x1, p.x + ex + 1);
    y0 = Math.min(y0, p.y - ey); y1 = Math.max(y1, p.y + ey + 2);
  }
  const b = [x0, y0, x1, y1];
  BOX.set(k, b);
  return b;
}
/** The union of digitBox over all ten digits of slot i. */
export function slotBox(i) {
  let b = [1e9, 1e9, -1e9, -1e9];
  for (let d = 0; d < 10; d++) {
    const e = digitBox(d, i);
    b = [Math.min(b[0], e[0]), Math.min(b[1], e[1]), Math.max(b[2], e[2]), Math.max(b[3], e[3])];
  }
  return b;
}

export function digitsAt(mk) {
  const f = clockFields(new Date(mk * 60000));
  return f.hh + f.mm;
}

/** First minute (key) of the hour that contains mk. */
export function hourStartOf(mk) {
  let k = mk;
  for (let n = 0; n < 61; n++) { if (digitsAt(k - 1).slice(0, 2) !== digitsAt(k).slice(0, 2)) return k; k--; }
  return k;
}

// ------------------------------------------------------------ size

/** How big the ball "really" is for n things on it (what the stuck things show). */
export const bulkFor = (n) => Math.min(RMAX, R0 + RK * Math.sqrt(n));
/** The core's radius on screen: the bulk, capped to fit the room. */
export const radiusFor = (n) => Math.min(RCAP, bulkFor(n));

// ------------------------------------------------------------ the loop

/** Floor y of the loop's far run for core radius R: the ball and the prince clear the minutes. */
function loopTop(R) {
  const b = Math.max(slotBox(2)[3], slotBox(3)[3]) + 1;
  return Math.min(LOOP.maxY - 2 * LOOP.r, b + Math.max(R + COAT + R * COS_E, PRINCE_H));
}
const LOOP_LEN = 2 * (LOOP.x1 - LOOP.x0) + 2 * Math.PI * LOOP.r;
/** Point and unit direction at arc length a along the loop (clockwise on screen, from the far run's left end). */
function loopAt(top, a, out) {
  const run = LOOP.x1 - LOOP.x0, r = LOOP.r, arc = Math.PI * r;
  a = ((a % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  if (a < run) { out[0] = LOOP.x0 + a; out[1] = top; out[2] = 1; out[3] = 0; return out; }
  a -= run;
  if (a < arc) { const th = a / r; out[0] = LOOP.x1 + r * Math.sin(th); out[1] = top + r - r * Math.cos(th); out[2] = Math.cos(th); out[3] = Math.sin(th); return out; }
  a -= arc;
  if (a < run) { out[0] = LOOP.x1 - a; out[1] = top + 2 * r; out[2] = -1; out[3] = 0; return out; }
  a -= run;
  const th = a / r;
  out[0] = LOOP.x0 - r * Math.sin(th); out[1] = top + r + r * Math.cos(th); out[2] = -Math.cos(th); out[3] = -Math.sin(th);
  return out;
}
/** Arc length of the loop point nearest (x, y). */
function loopNearest(top, x, y) {
  let best = 0, bd = 1e9;
  for (let a = 0; a < LOOP_LEN; a += 2) {
    loopAt(top, a, LP);
    const d = (LP[0] - x) ** 2 + (LP[1] - y) ** 2;
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const LP = [0, 0, 0, 0];

// ------------------------------------------------------------ the route

/** Objects a minute eats: the old digits that change, minutes only at the hour (the star takes the hour). */
function eatList(mk) {
  const cur = digitsAt(mk), nxt = digitsAt(mk + 1);
  const hourEnd = cur.slice(0, 2) !== nxt.slice(0, 2);
  const slots = [2, 3].filter((i) => cur[i] !== nxt[i]);
  const eat = [];
  for (const i of slots) laid(+cur[i], i).forEach((_, j) => eat.push({ slot: i, j }));
  return { cur, nxt, hourEnd, slots, eat };
}

const COUNT = new Map();
/** Objects landed on the ball before minute mk began, this hour. */
export function countBefore(mk) {
  if (COUNT.has(mk)) return COUNT.get(mk);
  const h0 = hourStartOf(mk);
  let n = 0;
  for (let k = h0; k < mk; k++) n += eatList(k).eat.length;
  COUNT.set(mk, n);
  if (COUNT.size > 200) COUNT.delete(COUNT.keys().next().value);
  return n;
}

const ROUTES = new Map();
/**
 * The route of minute mk, in screen space (the disc's centre), as keys
 * [t, x, y] with t relative; `eatEnd` is the key where the last object has
 * been reached. Converted to floor keys in planOf.
 */
function routeOf(mk) {
  if (ROUTES.has(mk)) return ROUTES.get(mk);
  const L = eatList(mk), R = radiusFor(countBefore(mk)), V = R + COAT, reach = R + REACH;
  const restY = loopTop(R) - R * COS_E;             // the loop's far run, as a disc centre
  const pts = [];
  let t = 0, px = null, py = null, eatEnd = 0;
  const go = (x, y, speed = SPEED) => {
    if (px !== null) t += Math.max(0.1, Math.hypot(x - px, y - py) / speed);
    pts.push([t, x, y]); px = x; py = y;
  };
  const objs = (i) => laid(+L.cur[i], i);
  const minY = (i) => Math.min(...objs(i).map((p) => p.y)), maxY = (i) => Math.max(...objs(i).map((p) => p.y));
  const mid = (i) => { const b = digitBox(+L.cur[i], i); return (b[0] + b[2]) / 2; };
  const b2 = slotBox(2), b3 = slotBox(3);
  if (L.slots.length === 1) {
    // the ones alone: the tens stay, so keep the disc and the prince clear of them
    const colX = Math.max(mid(3), b2[2] + V + 4, b2[2] + R + PRINCE_OFF + 2);
    const topY = minY(3) + 0.6 * reach;
    go(colX, restY); go(colX, topY);
    eatEnd = t;
    // loop over the top and roll down the far edge, clear of the ones' slot
    const dx = Math.max(colX + 16, b3[2] + PRINCE_HW + 1.5);
    go((colX + dx) / 2 + 1, topY - 6, 34); go(dx, topY, 34);
    go(dx, restY, 40);
  } else {
    // tens and ones: up the tens, across the top, down the ones
    const x2 = mid(2), x3 = mid(3);
    go(x2, restY); go(x2, minY(2) + 0.5 * reach);
    go((x2 + x3) / 2, minY(2) + 0.5 * reach - 5); go(x3, minY(3) + 0.5 * reach);
    go(x3, maxY(3) - 0.75 * reach);
    eatEnd = t;
    if (L.hourEnd) {
      // down to the floor, then a few steps left, and stop for the King
      go(x3 - 4, restY - 4, 36); go(x3 - 22, restY, 26);
    } else go(x3 + 3, restY, 40);
  }
  const end = L.hourEnd ? ROUTE_END_HOUR : ROUTE_END;
  const t0 = L.hourEnd ? end - t : end - eatEnd;
  for (const p of pts) p[0] += t0;
  // the last key: at the hour, where it stops; otherwise it lies past :00 (the next minute starts from it)
  const r = { ...L, pts, t0, eatStart: pts[0][0], eatEnd: eatEnd + t0, end, R, exitAfter: !L.hourEnd };
  ROUTES.set(mk, r);
  if (ROUTES.size > 200) ROUTES.delete(ROUTES.keys().next().value);
  return r;
}

// ------------------------------------------------------------ the path

const PLANS = new Map();
const PT = [0, 0, 0, 0];
/**
 * The plan of minute mk: Hermite keys (t, x, y, vx, vy) for the ball's floor
 * position over the minute, the picks, and the hour flags.
 */
export function planOf(mk) {
  if (PLANS.has(mk)) return PLANS.get(mk);
  const route = routeOf(mk);
  const prv = digitsAt(mk - 1), cur = route.cur;
  const hourStart = prv.slice(0, 2) !== cur.slice(0, 2);
  const R = route.R, toFloor = (y) => y + R * COS_E;
  const K = [];   // [t, x, y, vx, vy]
  if (hourStart) {
    K.push([0, SPAWN[0], SPAWN[1], 0, 0], [SPAWN_T, SPAWN[0], SPAWN[1], 0, 0]);
  } else {
    // carry on along the last minute's curve: same point, same velocity, and its exit key
    const pp = planOf(mk - 1), o = pathAt(pp, 60, [0, 0, 0, 0]), E = pp.K[pp.K.length - 1];
    K.push([0, o[0], o[1], o[2], o[3]]);
    if (E[0] - 60 > 0.05) K.push([E[0] - 60, E[1], E[2], E[3], E[4]]);
  }
  // laps of the loop: join it where the ball is, leave it on the far run just before the route's first key
  const top = loopTop(R), last = K[K.length - 1];
  const A = route.pts[0];
  const lead = 12;                                   // px of far run before the route turns off it
  const a0 = loopNearest(top, last[1], last[2]) + 4;
  let a1 = Math.max(0, Math.min(LOOP.x1 - LOOP.x0, A[1] - lead - LOOP.x0));
  const tw0 = last[0] + 0.8, want = 9 + 4 * rand(mk, 7);                 // px/s, a lazy roll
  let tw1 = route.t0 - lead / want;
  let span = ((a1 - a0) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
  span += LOOP_LEN * Math.max(0, Math.round((want * (tw1 - tw0) - span) / LOOP_LEN));
  const sp = span / Math.max(0.5, tw1 - tw0);
  const nk = Math.max(2, Math.ceil((tw1 - tw0) / 0.5));
  for (let k = 0; k <= nk; k++) {
    const t = tw0 + ((tw1 - tw0) * k) / nk;
    loopAt(top, a0 + sp * (t - tw0), LP);
    K.push([t, LP[0], LP[1], LP[2] * sp, LP[3] * sp]);
  }
  for (const [t, x, y] of route.pts) K.push([t, x, toFloor(y), NaN, NaN]);
  // tangents: Catmull-Rom (non-uniform)
  for (let k = 0; k < K.length; k++) {
    if (!Number.isNaN(K[k][3])) continue;
    const a = K[Math.max(0, k - 1)], b = K[Math.min(K.length - 1, k + 1)];
    const dt = b[0] - a[0] || 1;
    K[k][3] = (b[1] - a[1]) / dt; K[k][4] = (b[2] - a[2]) / dt;
  }
  if (route.hourEnd) { const L = K[K.length - 1]; L[3] = 0; L[4] = 0; }   // it stops for the King
  const plan = { mk, K, route, hourStart, hourEnd: route.hourEnd, cur, nxt: route.nxt, prv };
  // picks: the first moment the disc touches each object, one at a time
  const reach2 = (R + REACH) ** 2, picks = [];
  for (const e of route.eat) {
    const p = laid(+cur[e.slot], e.slot)[e.j];
    let best = route.eatEnd, bestD = 1e9;
    for (let t = route.eatStart - 0.4; t <= route.eatEnd + 1e-6; t += 1 / 60) {
      pathAt(plan, t, PT);
      const dx = PT[0] - p.x, dy = PT[1] - R * COS_E - p.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = t; }
      if (d < reach2) { best = t; break; }
    }
    picks.push({ slot: e.slot, j: e.j, t: best });
  }
  picks.sort((a, b) => a.t - b.t);
  const latest = route.hourEnd ? ROUTE_END_HOUR : 59.55;
  for (let k = 1; k < picks.length; k++) picks[k].t = Math.max(picks[k].t, picks[k - 1].t + 0.05);
  for (const p of picks) p.t = Math.min(p.t, latest);
  plan.picks = picks;
  PLANS.set(mk, plan);
  if (PLANS.size > 200) PLANS.delete(PLANS.keys().next().value);
  return plan;
}

/** The ball's floor position at second s of plan p, into out[0..3] (x, y, vx, vy). */
export function pathAt(p, s, out) {
  const K = p.K;
  if (s <= K[0][0]) { out[0] = K[0][1]; out[1] = K[0][2]; out[2] = 0; out[3] = 0; return out; }
  const L = K[K.length - 1];
  if (s >= L[0]) {
    // after the route: roll on and slow down (only until :00)
    const u = s - L[0], k = 1 - Math.exp(-u * 2.5);
    out[0] = L[1] + (L[3] / 2.5) * k; out[1] = L[2] + (L[4] / 2.5) * k;
    out[2] = L[3] * (1 - k); out[3] = L[4] * (1 - k);
    return out;
  }
  let k = 1;
  while (K[k][0] < s) k++;
  const a = K[k - 1], b = K[k], h = b[0] - a[0], u = (s - a[0]) / h;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  out[0] = h00 * a[1] + h10 * h * a[3] + h01 * b[1] + h11 * h * b[3];
  out[1] = h00 * a[2] + h10 * h * a[4] + h01 * b[2] + h11 * h * b[4];
  const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
  out[2] = (d00 * a[1] + d01 * b[1]) / h + d10 * a[3] + d11 * b[3];
  out[3] = (d00 * a[2] + d01 * b[2]) / h + d10 * a[4] + d11 * b[4];
  return out;
}

// ------------------------------------------------------------ what the ball has eaten

/** Pick, flight and landing of every object eaten in minute mk. */
export const FLIGHT = 0.32;
export function eatenOf(mk) {
  const p = planOf(mk);
  return p.picks.map((pk) => ({ ...pk, land: pk.t + FLIGHT, o: laid(+p.cur[pk.slot], pk.slot)[pk.j].o, d: +p.cur[pk.slot] }));
}

// ------------------------------------------------------------ rolling

// One minute of orientations: STEPS * 60 + 1 quaternions (w, x, y, z), and the
// landed objects' directions in the ball's own frame.
const ROLL = new Map();
const tmp = [0, 0, 0, 0];
// where things can stick: 48 spots spread evenly over the ball (a Fibonacci sphere)
const SITES = [];
for (let i = 0; i < 64; i++) {
  const y = 1 - (2 * (i + 0.5)) / 64, r = Math.sqrt(1 - y * y), a = i * 2.39996 + 0.7;
  SITES.push([r * Math.cos(a), y, r * Math.sin(a)]);
}

/** The minute's rolling table (cached), integrating from the hour's start as needed. */
export function rollOf(mk) {
  if (ROLL.has(mk)) return ROLL.get(mk);
  const h0 = hourStartOf(mk);
  let k = h0;
  while (k < mk && ROLL.has(k + 1)) k++;
  // integrate forward from the first minute we lack
  let first = mk;
  for (let j = mk; j >= h0; j--) { if (ROLL.has(j)) break; first = j; }
  for (let j = first; j <= mk; j++) integrate(j);
  return ROLL.get(mk);
}

function integrate(mk) {
  const p = planOf(mk);
  const N = STEPS * 60;
  const Q = new Float32Array((N + 1) * 4);
  let w = 1, x = 0, y = 0, z = 0;
  if (!p.hourStart) {
    const prev = ROLL.get(mk - 1).Q, o = N * 4;
    w = prev[o]; x = prev[o + 1]; y = prev[o + 2]; z = prev[o + 3];
  }
  // radius steps at each landing (a step function is enough for rolling)
  const eaten = eatenOf(mk), base = countBefore(mk);
  let ei = 0, R = radiusFor(base);
  let ax = pathAt(p, 0, tmp)[0], ay = tmp[1];
  Q[0] = w; Q[1] = x; Q[2] = y; Q[3] = z;
  const landed = [];
  const used = p.hourStart ? new Float64Array(SITES.length).fill(-1e9) : Float64Array.from(ROLL.get(mk - 1).used);
  for (let i = 0; i < N; i++) {
    const t1 = (i + 1) / STEPS;
    pathAt(p, t1, tmp);
    const dX = tmp[0] - ax, dZ = (tmp[1] - ay) / SIN_E;
    ax = tmp[0]; ay = tmp[1];
    // rotation vector of rolling: axis up x motion, angle = distance / R
    const ox = dZ / R, oz = -dX / R;
    // q += 0.5 * (0, o) * q
    const nw = w + 0.5 * (-ox * x - oz * z);
    const nx = x + 0.5 * (ox * w + (0 * z - oz * y));
    const ny = y + 0.5 * (oz * x - ox * z);
    const nz = z + 0.5 * (oz * w + (ox * y - 0 * x));
    const s = (3 - (nw * nw + nx * nx + ny * ny + nz * nz)) * 0.5;
    w = nw * s; x = nx * s; y = ny * s; z = nz * s;
    const o = (i + 1) * 4;
    Q[o] = w; Q[o + 1] = x; Q[o + 2] = y; Q[o + 3] = z;
    while (ei < eaten.length && eaten[ei].land <= t1) {
      const e = eaten[ei];
      // it sticks on a spot of the ball that faces the camera now, the one
      // covered longest ago, so the ball fills evenly as it grows
      let best = -1, bestAge = -1e9;
      for (let k = 0; k < SITES.length; k++) {
        const v = SITES[k], nv = rotate(w, x, y, z, v[0], v[1], v[2]);
        const depth = nv[1] * COS_E + nv[2] * SIN_E;
        if (depth < 0.2 || nv[1] < -0.2) continue;
        const age = base + ei - used[k] + depth * 3;
        if (age > bestAge) { bestAge = age; best = k; }
      }
      if (best < 0) best = (base + ei) % SITES.length;
      used[best] = base + ei;
      landed.push({ ...e, u: SITES[best], n: base + ei });
      ei++;
      R = radiusFor(base + ei);
    }
  }
  ROLL.set(mk, { Q, landed, used });
  // keep the hour (60 tables) and a little more
  if (ROLL.size > 64) ROLL.delete(ROLL.keys().next().value);
}

/** Rotate vector v by unit quaternion (w, x, y, z). */
export function rotate(w, x, y, z, vx, vy, vz) {
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** Orientation at second s of minute mk, into out (w, x, y, z): table lookup and a lerp. */
export function orientAt(mk, s, out) {
  const { Q } = rollOf(mk);
  const f = Math.min(STEPS * 60, Math.max(0, s * STEPS)), i = f | 0, u = f - i, o = i * 4, o2 = Math.min(i + 1, STEPS * 60) * 4;
  let w = Q[o] + (Q[o2] - Q[o]) * u, x = Q[o + 1] + (Q[o2 + 1] - Q[o + 1]) * u;
  let y = Q[o + 2] + (Q[o2 + 2] - Q[o + 2]) * u, z = Q[o + 3] + (Q[o2 + 3] - Q[o + 3]) * u;
  const k = (3 - (w * w + x * x + y * y + z * z)) * 0.5;
  out[0] = w * k; out[1] = x * k; out[2] = y * k; out[3] = z * k;
  return out;
}
