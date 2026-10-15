// The battle plan of one minute for artillery.js: who fires, at what, when
// each crater opens, when each old island has sunk and each new one lands.
// A pure function of the minute (cached by minuteKey), so any frame can be
// rebuilt from cold.

import { rand, hash, clamp, clockFields } from '../js/kit.js';

export const SEA = 66;
export const SLOTS = [
  { x: 3, w: 31, h: 50, s: 9, team: 0 },
  { x: 37, w: 31, h: 50, s: 9, team: 0 },
  { x: 93, w: 28, h: 44, s: 8, team: 1 },
  { x: 126, w: 28, h: 44, s: 8, team: 1 },
];
for (const S of SLOTS) S.top = SEA + 2 - S.h;

// where shells land on each digit, as glyph-width fractions (first shot,
// second bomb). The crater is centred on the ground surface there and is
// shallower than the stroke is thick: it bites the island but never cuts a
// stroke through, so the wreck still reads as the old digit, never another.
export const HIT = [[0.5, 0.2], [0.56, 0.3], [0.55, 0.25], [0.45, 0.8], [0.84, 0.3], [0.55, 0.15], [0.5, 0.2], [0.45, 0.8], [0.5, 0.8], [0.5, 0.82]];

export const GRAV = 120, BOMB_G = 140, PLANE_V = 72, PLANE_Y = 9, GONE = 59.85;

/** Wind over absolute time T (s): smooth, -1..1; and its integral for drifting things. */
const P1 = 347, P2 = 131;
export function wind(T) {
  const a = ((T % P1) / P1) * 6.2832, b = ((T % P2) / P2) * 6.2832 + 1;
  return 0.65 * Math.sin(a) + 0.35 * Math.sin(b);
}
export function windDisp(T) {
  const a = ((T % P1) / P1) * 6.2832, b = ((T % P2) / P2) * 6.2832 + 1;
  return -0.65 * Math.cos(a) * P1 / 6.2832 - 0.35 * Math.cos(b) * P2 / 6.2832;
}

const CACHE = { key: null, plan: null };

/**
 * The plan for the minute starting at `date` (fields `f`). `perchOf(slot,
 * digit)` returns the worm's standing point on a digit, [x, y] absolute.
 */
export function planFor(date, f, perchOf, groundOf) {
  if (CACHE.key === f.minuteKey) return CACHE.plan;
  const nf = clockFields(new Date(date.getTime() + 60000)), pf = clockFields(new Date(date.getTime() - 60000));
  const cur = f.hh + f.mm, nxt = nf.hh + nf.mm, prv = pf.hh + pf.mm;
  const key = f.minuteKey, Tm = (key % 100000) * 60;
  const air = nf.m === 0, afterAir = f.m === 0;
  const doomed = [0, 1, 2, 3].filter((i) => cur[i] !== nxt[i]);
  const impacts = [], shots = [], sink = {};
  const hitPoint = (i, j) => {
    const S = SLOTS[i], d = +cur[i], gx = HIT[d][j] * S.w, gy = groundOf(i, d, gx) + 0.5;
    return [S.x + gx, S.top + gy, gx, gy];
  };
  let plane = null, turn = null;
  if (!air) {
    // the bazooka: the red worm on the right-hand hour digit shoots, farthest target first
    const targets = doomed.slice().sort((a, b) => b - a), n = targets.length;
    const [sx, sy] = perchOf(1, +cur[1], true);
    const lx = sx + 4.7, ly = sy - 8.6;
    targets.forEach((i, k) => {
      const T = 57.0 - (n - 1 - k) * 1.9;
      const [tx, ty, gx, gy] = hitPoint(i, 0);
      const F = clamp(Math.hypot(tx - lx, ty - ly) / 72, 0.75, 1.25), t0 = T - F;
      const aw = 26 * wind(Tm + t0), dx = tx - lx, dy = ty - ly;
      const vx = (dx - 0.5 * aw * F * F) / F, vy = (dy - 0.5 * GRAV * F * F) / F;
      shots.push({ i, t0, t1: T, x0: lx, y0: ly, vx, vy, aw, aim: Math.atan2(vy, vx) });
      impacts.push({ i, t: T, x: tx, y: ty, gx, gy, r: SLOTS[i].s * 0.62, k: 1, seed: hash(key, i, 1) });
    });
    if (n) turn = { t0: shots[0].t0 - 3.4, x: sx, y: sy, end: shots[n - 1].t0 + 0.8 };
  } else {
    // the hour: an airstrike, two bombs on every digit that changes, left to right
    const bombs = [];
    for (const i of doomed) for (let j = 0; j < 2; j++) {
      const [tx, ty, gx, gy] = hitPoint(i, j);
      const tf = Math.sqrt((2 * (ty - PLANE_Y - 2)) / BOMB_G), xr = tx - PLANE_V * 0.5 * tf;
      bombs.push({ i, j, tx, ty, gx, gy, tf, xr, rel: (xr + 40) / PLANE_V });
    }
    const TP = 57.9 - Math.max(...bombs.map((b) => b.rel + b.tf));
    plane = { t0: TP, bombs: bombs.map((b) => ({ ...b, tr: TP + b.rel, t1: TP + b.rel + b.tf })) };
    for (const b of plane.bombs) impacts.push({ i: b.i, t: b.t1, x: b.tx, y: b.ty, gx: b.gx, gy: b.gy, r: SLOTS[b.i].s * 0.62, k: 1.25, seed: hash(key, b.i, b.j + 5) });
  }
  for (const i of doomed) {
    const first = Math.min(...impacts.filter((m) => m.i === i).map((m) => m.t));
    sink[i] = { t0: first + 0.06, tilt: (rand(key, i, 9) < 0.5 ? -1 : 1) * (0.14 + 0.08 * rand(key, i, 8)) };
  }
  // the new islands of this minute, airdropped
  const arrivals = [0, 1, 2, 3].filter((i) => cur[i] !== prv[i]);
  const drop = {};
  arrivals.forEach((i, k) => {
    const D = afterAir ? 0.02 + k * 0.08 : 0.05 + k * 0.32, dur = afterAir ? 0.95 : 1.75;
    drop[i] = { D, dur };
  });
  // a jetpack hop and a taunt, mid-minute
  const jet = { w: hash(key, 3) % 4, t0: 21 + 6 * rand(key, 4), dx: (rand(key, 5) - 0.5) * 8 };
  const taunt = { w: (jet.w + 1 + (hash(key, 6) % 3)) % 4, t0: 9 + 4 * rand(key, 7) };
  // a health crate parachutes onto an island; its worm crawls over and opens it
  const ci = hash(key, 8) % 4, cu = rand(key, 9), cland = 37 + 4 * rand(key, 10);
  const crate = { i: ci, u: cu, t0: cland - 3.2, land: cland, open: cland + 2.8 };
  const plan = { cur, nxt, prv, air, afterAir, doomed, impacts, shots, sink, drop, plane, turn, jet, taunt, crate, Tm };
  CACHE.key = key; CACHE.plan = plan;
  return plan;
}
