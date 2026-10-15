// Mahjong: the choreography. scene(date, faces) poses every tile for the
// instant `date` (a pure function of the wall clock; per-hour caches only)
// and returns the list to draw. Units: world units, one LED at the time tiles.
import * as kit from '../js/kit.js';
import * as R from './mahjong-render.js';
import { OTHER } from './mahjong-faces.js';

const PI = Math.PI, HALF = PI / 2;
const { clamp, lerp, ease } = kit;
const pad = (n) => String(n).padStart(2, '0');

// ----------------------------------------------------------- the camera
const REST = { pitch: 0.42, ty: 22.6, tz: 28.4, dist: 200, oy: 17 };
const HIGH = { pitch: 0.9, ty: 34, tz: 0, dist: 260, oy: 30 };
let FOCAL = 175, FOCAL0 = 175, OY0 = 17;
const ZOOM = 1.75;                                       // the time tiles at rest: one face texel per LED
function camera(k) {                                     // k: 0 rest .. 1 high over the table
  const p = lerp(REST.pitch, HIGH.pitch, k), ty = lerp(REST.ty, HIGH.ty, k), tz = lerp(REST.tz, HIGH.tz, k), D = lerp(REST.dist, HIGH.dist, k);
  R.setCamera(ty - D * Math.cos(p), tz + D * Math.sin(p), p, lerp(FOCAL, FOCAL0 * 1.25, k), lerp(OY0, HIGH.oy, k));
}

// ------------------------------------------------------------ the table
export const TILT = REST.pitch;                          // time tiles lean back to face the camera
const SLOT_X = [-41, -16, 16, 41], TIME_Y = -16;
const DIM_Y = 6, DIM_TIP = 0.08;
const dimX = (side, p) => side * (70 + 25 * p);          // side -1 left, +1 right; p 0 nearest the time
const WALL_Y = 104, WALL_N = 66;                          // 33 stacks of 2: 59 minutes + 5 tens = 64 draws an hour
const wallX = (i) => ((i >> 1) - 16) * 24.6;
const wallZ = (i) => ((i & 1) ? 8.5 : 25.5);             // even = top layer (drawn first)
const POND_N = 10;
export const CUP = { x: -150, y: 84, r: 10, h: 13 };
const POND = Array.from({ length: POND_N }, (_, s) => {
  return { x: -122 + 29 * s + 6 * (kit.hash(s, 1) - 0.5), y: 60 + 6 * (kit.hash(s, 2) - 0.5), yaw: 0.3 * (kit.hash(s, 3) - 0.5) };
});
const PERM = (() => { const a = [...Array(POND_N).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(kit.hash(i, 77) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
const GLOW = { time: 1.45, dim: 0.16, pond: 0.3, wall: 0.4 };

// -------------------------------------------------------------- tiles
const pool = Array.from({ length: 240 }, R.makeTile);
let used = 0;
const list = [];
function take(tex, glow) {
  const T = pool[used++];
  T.on = true; T.tex = tex; T.glow = glow; T.shadow = 1;
  list.push(T);
  return T;
}
/** Pose a tile that pivots on its bottom-back edge at (x, yb): standing at tip 0, lying face up at PI/2. */
function lean(T, x, yb, tip, lift = 0, flip = 0, yaw = 0) {
  const s = Math.sin(tip), c = Math.cos(tip);
  return R.pose(T, x, yb + (-8.5 * c + 16 * s), lift + (8.5 * s + 16 * c), yaw, tip, flip);
}
const leanC = (x, yb, tip) => [x, yb + (-8.5 * Math.cos(tip) + 16 * Math.sin(tip)), 8.5 * Math.sin(tip) + 16 * Math.cos(tip)];
/** A landing: 0 -> 1 falling under gravity, then two little bounces. */
function land(s) {
  if (s <= 0) return 0;
  if (s < 0.55) return (s / 0.55) ** 2;
  const q = (s - 0.55) / 0.45;
  return q >= 1 ? 1 : 1 - 0.14 * Math.abs(Math.sin(q * 2 * PI)) * (1 - q);
}
/** Damped settle wobble after an impact, t seconds after it. */
const wobble = (t, a = 1) => (t <= 0 ? 0 : a * Math.exp(-t * 7) * Math.sin(t * 34));

// time-tile rest poses, snapped so the carved face lands on whole LEDs
const SNAP = [];
(function calibrate() {
  camera(0);
  const T = R.makeTile();
  lean(T, SLOT_X[0], TIME_Y, TILT);
  FOCAL0 = R.depthOf(T) - 8.5;                          // the face plane at scale 1
  FOCAL = FOCAL0 * ZOOM;
  camera(0);
  // centre the time tiles (face plus a sliver of top bevel) on the banner
  const top = R.project(T.x + 16 * T.m6 - 8.5 * T.m3, T.y + 16 * T.m7 - 8.5 * T.m4, T.z + 16 * T.m8 - 8.5 * T.m5)[1];
  const bot = R.project(T.x - 16 * T.m6 - 8.5 * T.m3, T.y - 16 * T.m7 - 8.5 * T.m4, T.z - 16 * T.m8 - 8.5 * T.m5)[1];
  OY0 += 32.5 - (top + bot) / 2;
  camera(0);
  for (let k = 0; k < 4; k++) {
    lean(T, SLOT_X[k], TIME_Y, TILT);
    // the face's top-left corner: centre + (-12) x + (-8.5) y + 16 z
    const P = R.project(T.x - 12 * T.m0 - 8.5 * T.m3 + 16 * T.m6, T.y - 12 * T.m1 - 8.5 * T.m4 + 16 * T.m7, T.z - 12 * T.m2 - 8.5 * T.m5 + 16 * T.m8);
    const dx = (Math.round(P[0]) - P[0]) / ZOOM, dy = (Math.round(P[1]) - P[1]) / ZOOM;
    SNAP.push([dx, -dy * Math.sin(TILT), -dy * Math.cos(TILT)]);   // screen-down = minus camera up
  }
})();
function timeRest(T, k, tip = TILT, lift = 0, flip = 0) {
  lean(T, SLOT_X[k], TIME_Y, tip, lift, flip);
  const w = clamp(1 - Math.abs(tip - TILT) * 8) * (lift === 0 && flip === 0 ? 1 : 0);
  T.x += SNAP[k][0] * w; T.y += SNAP[k][1] * w; T.z += SNAP[k][2] * w;
  return T;
}
const timeKey = (k, d) => (k < 2 ? 'c' : 'p') + d;

// --------------------------------------------------------- per-hour plan
const DRAWS_BEFORE = new Int32Array(61);                 // my draws in minutes < m (minute 0 draws none)
for (let m = 1; m <= 60; m++) DRAWS_BEFORE[m] = DRAWS_BEFORE[m - 1] + (m - 1 >= 1 ? ((m - 1) % 10 === 0 ? 2 : 1) : 0);
/** This minute's turn: [{ k, off, wi, oldD }] for the slots that change (not on the hour). */
function turnsOf(m) {
  if (m === 0) return [];
  const out = [{ k: 3, off: 0, wi: DRAWS_BEFORE[m], oldD: (m - 1) % 10 }];
  if (m % 10 === 0) out.push({ k: 2, off: 0.55, wi: DRAWS_BEFORE[m] + 1, oldD: Math.floor((m - 1) / 10) });
  return out;
}
const T_LIFT = 0.15, T_GONE = 1.25;                        // the old tile: lift, then lands in the pond
const plans = new Map();
/** Hour plan: the hand's kinds, the dims' sorting moves, the discards. */
function hourPlan(hourId) {
  if (plans.has(hourId)) return plans.get(hourId);
  const hand = Array.from({ length: 8 }, (_, i) => OTHER[Math.floor(kit.hash(hourId, i, 5) * OTHER.length)]);
  // sorting moves: every 5 s from :05 to :55, within one side
  const moves = [];
  for (let m = 0; m < 60; m++) for (let k = 1; k <= 11; k++) {
    if (m === 0 && k < 2) continue;
    const h = kit.hash(hourId, m * 16 + k, 9);
    if (h < 0.3) continue;                                    // sometimes the fingers rest
    const side = kit.hash(hourId, m * 16 + k, 10) < 0.5 ? 0 : 1;
    const i = Math.floor(kit.hash(hourId, m * 16 + k, 11) * 3);
    let j = Math.floor(kit.hash(hourId, m * 16 + k, 12) * 2); if (j >= i) j++;
    moves.push({ t: m * 60 + k * 5, side, i, j });
  }
  // discards: mine at each minute turn, an opponent's at :30
  const ev = [];
  for (let m = 0; m < 60; m++) {
    for (const tr of turnsOf(m)) ev.push({ t: m * 60 + tr.off + T_LIFT, mine: true, k: tr.k, tex: 'p' + tr.oldD, side: 0, slot: 0 });
    const r = kit.hash(hourId, m, 21);
    const tex = r < 0.55 ? OTHER[Math.floor(kit.hash(hourId, m, 22) * OTHER.length)] : (r < 0.8 ? 'p' : 'c') + (1 + Math.floor(kit.hash(hourId, m, 23) * 9));
    ev.push({ t: m * 60 + 30, mine: false, k: 0, tex, side: kit.hash(hourId, m, 24) < 0.5 ? -1 : 1, slot: 0 });
  }
  ev.sort((a, b) => a.t - b.t);
  ev.forEach((e, n) => { e.slot = PERM[n % POND_N]; });
  const plan = { hand, moves, ev };
  if (plans.size > 3) plans.delete(plans.keys().next().value);
  plans.set(hourId, plan);
  return plan;
}
/** The dims' order (indices into the hand) at hour-second hs, and the move in progress. */
function handOrder(P, hs) {
  const ord = [[0, 1, 2, 3], [4, 5, 6, 7]];
  let cur = null;
  for (const mv of P.moves) {
    if (mv.t > hs) break;
    if (hs < mv.t + 1.1) { cur = { mv, from: ord[mv.side].slice(), age: hs - mv.t }; }
    const a = ord[mv.side], [x] = a.splice(mv.i, 1); a.splice(mv.j, 0, x);
  }
  return { ord, cur };
}

// ------------------------------------------------------------ the pieces
function drawDims(P, faces, hs, glow) {
  const { ord, cur } = handOrder(P, hs);
  for (let side = 0; side < 2; side++) {
    const sg = side ? 1 : -1;
    for (let p = 0; p < 4; p++) {
      const id = ord[side][p], T = take(faces[P.hand[id]], GLOW.dim * glow);
      if (cur && cur.mv.side === side) {
        const { mv, from, age } = cur;
        const p0 = from.indexOf(id);
        if (id === from[mv.i]) {                          // the tile being moved: lift, carry, drop
          const up = ease.out(clamp(age / 0.25)) * (1 - land((age - 0.75) / 0.35));
          const e = ease.inOut(clamp((age - 0.2) / 0.6));
          lean(T, lerp(dimX(sg, mv.i), dimX(sg, mv.j), e), DIM_Y - 4 * up, DIM_TIP - 0.12 * up + wobble(age - 1.03, 0.05), 15 * up);
          T.glow *= 1 + 0.5 * up;
          continue;
        }
        const e = ease.inOut(clamp((age - 0.3) / 0.5));
        lean(T, lerp(dimX(sg, p0), dimX(sg, p), e), DIM_Y, DIM_TIP);
        continue;
      }
      lean(T, dimX(sg, p), DIM_Y, DIM_TIP);
    }
  }
}
function drawWall(from, faces) {
  for (let i = from; i < WALL_N; i++) {
    const x = wallX(i);
    if (x < -300 || x > 300) continue;
    const T = take(null, GLOW.wall);
    R.pose(T, x, WALL_Y, wallZ(i), 0, HALF, PI);
  }
}
/** The pond: every discard that has started by hs, flying, resting or being taken away. */
function drawPond(P, faces, hs, digitsNow, glow) {
  const ev = P.ev;
  for (let n = 0; n < ev.length; n++) {
    const e = ev[n];
    if (e.t > hs) break;
    const nx = ev[n + POND_N];
    let gone = 0;
    if (nx && nx.t <= hs) { gone = (hs - nx.t) / 0.8; if (gone >= 1) continue; }
    const S = POND[e.slot], τ = hs - e.t;
    const T = take(faces[e.tex], GLOW.pond * glow);
    if (e.mine) {
      // lifted out of the slot, then flown to the pond face up
      const c0 = leanC(SLOT_X[e.k], TIME_Y, TILT);
      const up = ease.out(clamp(τ / 0.3));
      const f = ease.inOut(clamp((τ - 0.3) / (T_GONE - 0.3)));
      const x = lerp(c0[0], S.x, f), y = lerp(c0[1] - 3 * up, S.y, f);
      const z = lerp(c0[2] + 9 * up, 8.5, f) + 16 * Math.sin(PI * f) + 4 * (1 - land((τ - T_GONE + 0.12) / 0.4)) * (τ > T_GONE - 0.12 ? 1 : 0);
      R.pose(T, x, y, z, S.yaw * f, lerp(TILT - 0.15 * up * (1 - f), HALF, f), 0);
      T.glow = lerp(GLOW.time, GLOW.pond, f) * glow;
    } else {
      const s = clamp(τ / 1.0), f = ease.out(s);
      const air = clamp(s / 0.4), hop = s < 0.4 ? 30 * (1 - air) * (1 - air) + 4 * Math.sin(PI * air) : 2.5 * Math.abs(Math.sin(PI * (s - 0.4) / 0.2)) * (s < 0.6 ? 1 : 0);
      R.pose(T, lerp(e.side * 270, S.x, f), lerp(S.y + 60, S.y, f), 8.5 + hop, S.yaw + e.side * 3.2 * (1 - f), HALF, 0);
    }
    if (gone > 0) {
      const g = ease.in(gone), sx = S.x < 0 ? -1 : 1;
      T.x += sx * 300 * g; T.y += 10 * g;
      R.pose(T, T.x, T.y, T.z, S.yaw + sx * 2 * g, HALF, 0);
    }
  }
}

// ------------------------------------------------------------- the minute
function drawTime(faces, digits, prevDigits, m, sec, glow) {
  const turns = turnsOf(m);
  for (let k = 0; k < 4; k++) {
    const tr = turns.find((t) => t.k === k);
    if (!tr || sec - tr.off >= 2.6) { timeRest(take(faces[timeKey(k, digits[k])], GLOW.time * glow), k); continue; }
    const τ = sec - tr.off;
    if (τ < 0) { timeRest(take(faces[timeKey(k, prevDigits[k])], GLOW.time * glow), k); continue; }
    // the drawn tile: from the wall, face down, to a hover above the slot; drop; flip face up
    if (τ < T_LIFT) timeRest(take(faces[timeKey(k, prevDigits[k])], GLOW.time * glow), k);
    const T = take(faces[timeKey(k, digits[k])], 1);
    if (τ < 0.95) {
      const e = ease.inOut(τ / 0.95);
      const a = [wallX(tr.wi), WALL_Y, wallZ(tr.wi) + 3 * ease.out(clamp(τ / 0.15))], b = leanC(SLOT_X[k], TIME_Y - 8, TILT);
      R.pose(T, lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2] + 16, e) + 22 * Math.sin(PI * e), 0.25 * Math.sin(PI * e), lerp(HALF, TILT, e), PI);
      T.glow = lerp(GLOW.wall, GLOW.time, e) * glow;
    } else if (τ < 1.25) {
      const s = (τ - 0.95) / 0.3, f = land(s * 1.4 > 1 ? 1 : s * 1.4);
      lean(T, SLOT_X[k], TIME_Y - 8 * (1 - f), TILT, 16 * (1 - f), PI);
      T.glow = GLOW.time * glow;
    } else {
      const s = clamp((τ - 1.25) / 0.55);
      const fl = PI * (1 - ease.inOut(s));
      const lift = 5 * Math.sin(PI * s);
      timeRest(T, k, TILT + wobble(τ - 1.8, 0.07), lift, fl);
      T.glow = GLOW.time * glow * (1 + 0.6 * Math.exp(-Math.max(0, τ - 1.8) * 5) * (τ > 1.8 ? 1 : 0));
    }
  }
}

// --------------------------------------------------------------- the hour
let washKey = -1, wash = null;
/** The wash plan for the hour that begins at hourId: tiles, swirls, destinations. */
function washPlan(hourId, faces, oldDigits, newDigits) {
  if (washKey === hourId) return wash;
  const prevP = hourPlan(hourId - 1);
  const W = [];
  const add = (o) => W.push({ tex: null, endTex: null, sx: 0, sy: 0, sz: 8.5, syaw: 0, sflip: 0, flipU: 0, joinU: 0.4,
    cx: 0, cy: 60, r: 40, w: 2, end: 0, ex: 0, ey: 0, ez: 8.5, eyaw: 0, endU: 4, glow: GLOW.dim, newK: -1, ...o });
  const h = (i, j) => kit.hash(hourId, i, 300 + j);
  // the old hand (as it fell), minus the four dims next to the time that are dealt as new time tiles
  const { ord } = handOrder(prevP, 3600);
  const changed = [0, 1, 2, 3].filter((k) => oldDigits[k] !== newDigits[k]);
  const dealer = { 0: [0, 0], 1: [0, 1], 2: [1, 1], 3: [1, 0] };     // slot k <- dim (side, p)
  const dealt = new Set(changed.map((k) => dealer[k].join()));
  for (let side = 0; side < 2; side++) for (let p = 0; p < 4; p++) {
    const sg = side ? 1 : -1, c = leanC(dimX(sg, p), DIM_Y, HALF), id = ord[side][p];
    const k = changed.find((kk) => dealer[kk][0] === side && dealer[kk][1] === p);
    add({ tex: prevP.hand[id], sx: c[0], sy: c[1], sz: c[2], flipU: 0.02 + 0.12 * p, joinU: 0.35 + 0.12 * p + 0.2 * h(side * 4 + p, 1), newK: k ?? -1 });
  }
  // the pond as it was at the end of the hour
  const ev = prevP.ev;
  for (let n = Math.max(0, ev.length - POND_N); n < ev.length; n++) {
    const S = POND[ev[n].slot];
    add({ tex: ev[n].tex, sx: S.x, sy: S.y, syaw: S.yaw, flipU: 0.1 + 0.5 * h(n, 2), joinU: 0.5 + 0.7 * h(n, 3), glow: GLOW.pond });
  }
  // the old time tiles that change
  for (const k of changed) { const c = leanC(SLOT_X[k], TIME_Y, HALF); add({ tex: timeKey(k, oldDigits[k]), sx: c[0], sy: c[1], sz: c[2], flipU: 0, joinU: 0.32, glow: GLOW.time }); }
  // the wall's last tiles
  for (let i = DRAWS_BEFORE[60]; i < WALL_N; i++) add({ sx: wallX(i), sy: WALL_Y, sz: wallZ(i), sflip: PI, flipU: -1, joinU: 0.6, glow: GLOW.wall });
  // the other players push their tiles in from the sides
  const need = WALL_N + 8 - changed.length + 8;
  for (let n = 0; W.length - changed.length < need; n++) {
    const sg = h(n, 4) < 0.5 ? -1 : 1;
    add({ sx: sg * (300 + 40 * h(n, 5)), sy: 20 + 110 * h(n, 6), sflip: PI, flipU: -1, joinU: 0.3 + 1.4 * h(n, 7), glow: GLOW.wall });
  }
  // swirls and destinations: new wall, new hand (dims), the rest leave
  const newP = hourPlan(hourId);
  const pool2 = W.filter((w) => w.newK < 0);
  const order = pool2.map((w, i) => [h(i, 8), w]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  order.forEach((w, i) => {
    w.cx = w.sx < 0 ? -100 : 100; w.cy = 72;
    w.r = 16 + 40 * h(i, 9); w.w = (w.cx < 0 ? 1 : -1) * (2.7 - w.r / 45);
    if (i < WALL_N) {
      w.end = 1; w.ex = wallX(i); w.ey = WALL_Y; w.ez = wallZ(i);
      w.endU = 3.5 + ((i & 1) ? 0 : 0.55) + 0.9 * h(i, 10);
    } else if (i < WALL_N + 8) {
      const q = i - WALL_N, side = q >> 2, p = q & 3, c = leanC(dimX(side ? 1 : -1, p), DIM_Y, HALF);
      w.end = 2; w.ex = c[0]; w.ey = c[1]; w.ez = c[2]; w.endU = 3.8 + 0.25 * p + 0.3 * h(i, 11);
      w.endTex = newP.hand[side * 4 + p];
    } else {
      w.end = 3; w.ex = (w.cx < 0 ? -1 : 1) * 330; w.ey = 30 + 100 * h(i, 12); w.endU = 3.6 + 1.2 * h(i, 13);
    }
  });
  wash = { W, changed, dealer };
  washKey = hourId;
  return wash;
}
const ramp = (x) => (x <= 0 ? 0 : x - 0.45 * (1 - Math.exp(-x / 0.45)));     // spin that winds up
function orbit(w, u, out) {
  const x0 = w.sx - w.cx, y0 = (w.sy - w.cy) / 0.62;
  const th0 = Math.atan2(y0, x0), r0 = Math.hypot(x0, y0);
  const a = u - w.joinU, b = ease.inOut(clamp(a / 0.9));
  const th = th0 + w.w * ramp(a), r = lerp(r0, w.r, b);
  out[0] = w.cx + r * Math.cos(th); out[1] = w.cy + 0.62 * r * Math.sin(th); out[2] = th + HALF * (w.w > 0 ? 1 : -1);
  return out;
}
const O = new Float64Array(3);

/** Everything during the hour show, u seconds from the hour (-3 .. 7.5). */
function hourShow(faces, u, hourId, oldDigits, newDigits, glow) {
  const flare = 1 + 0.35 * Math.exp(-((u + 2.4) ** 2) * 2);
  R.lamp.k *= flare;
  const camK = u < 3 ? ease.inOut(clamp((u + 2.6) / 2.2)) : 1 - ease.inOut(clamp((u - 5.0) / 1.9));
  camera(camK);
  R.lamp.R2 = lerp(9000, 20000, camK); R.lamp.y = lerp(R.lamp.y, 40, camK);
  // the hand pushed down: a wave from left to right, each tile falls back face up
  const fall = (x) => { const s = (u + 3 - 0.75 * (x + 160) / 320) / 0.42; return s <= 0 ? 0 : s >= 1 ? 1 + wobble((s - 1) * 0.42, 0.05) : ease.in(s); };
  if (u < 0) {
    const P = hourPlan(hourId - 1), hs = 3540 + 60 + u;
    const { ord } = handOrder(P, hs);
    for (let side = 0; side < 2; side++) for (let p = 0; p < 4; p++) {
      const x = dimX(side ? 1 : -1, p), f = fall(x);
      lean(take(faces[P.hand[ord[side][p]]], GLOW.dim * glow * (1 + 0.5 * clamp(f))), x, DIM_Y, lerp(DIM_TIP, HALF, f));
    }
    for (let k = 0; k < 4; k++) { const f = fall(SLOT_X[k]); timeRest(take(faces[timeKey(k, oldDigits[k])], GLOW.time * glow), k, lerp(TILT, HALF, f)); }
    drawPond(P, faces, hs, oldDigits, glow);
    drawWall(DRAWS_BEFORE[60], faces);
    return;
  }
  const { W, changed, dealer } = washPlan(hourId, faces, oldDigits, newDigits);
  // time tiles: unchanged ones lie face up until they stand; new ones are dealt from the hand
  const standT = (k) => 5.75 + 0.12 * k;
  for (let k = 0; k < 4; k++) {
    const stand = clamp((u - standT(k)) / 0.45), tip = lerp(HALF, TILT, ease.inOut(stand)) + wobble(u - standT(k) - 0.45, 0.06);
    if (!changed.includes(k)) { timeRest(take(faces[timeKey(k, newDigits[k])], GLOW.time * glow), k, tip); continue; }
    if (u >= 1.2) { timeRest(take(faces[timeKey(k, newDigits[k])], GLOW.time * glow), k, tip); continue; }
    // dealt: the neighbouring dim flips face down, slides into the slot, flips face up as the new digit
    const [side, p] = dealer[k], c0 = leanC(dimX(side ? 1 : -1, p), DIM_Y, HALF), c1 = leanC(SLOT_X[k], TIME_Y, HALF);
    const T = take(null, glow);
    const fd = ease.inOut(clamp(u / 0.3)), mv = ease.inOut(clamp((u - 0.32) / 0.5)), fu = ease.inOut(clamp((u - 0.84) / 0.34));
    const flip = PI * fd - PI * fu, lift = 7 * Math.sin(PI * clamp(u / 0.3)) + 7 * Math.sin(PI * fu) + 4 * Math.sin(PI * mv);
    R.pose(T, lerp(c0[0], c1[0], mv), lerp(c0[1], c1[1], mv), c0[2] + lift, 0, HALF, flip);
    const oldP = hourPlan(hourId - 1);
    T.tex = faces[u < 0.6 ? oldP.hand[handOrder(oldP, 3600).ord[side][p]] : timeKey(k, newDigits[k])];
    T.glow = lerp(GLOW.dim, GLOW.time, mv) * glow;
  }
  // the wash
  for (const w of W) {
    if (w.newK >= 0) continue;
    const T = take(null, w.glow * glow);
    // flip face down where it lies
    const fs = w.flipU < 0 ? 1 : ease.inOut(clamp((u - w.flipU) / 0.3));
    let x = w.sx, y = w.sy, z = w.sz, yaw = w.syaw, flip = w.sflip + PI * fs * (w.sflip ? 0 : 1);
    z += w.flipU >= 0 ? 6 * Math.sin(PI * clamp((u - w.flipU) / 0.3)) : 0;
    if (u > w.joinU) {
      orbit(w, u, O);
      const j = ease.inOut(clamp((u - w.joinU) / 0.5));
      x = lerp(w.sx, O[0], j); y = lerp(w.sy, O[1], j); z = lerp(z, 8.5, j); yaw = lerp(w.syaw, O[2], j);
    }
    let tip = HALF;
    if (u > w.endU) {
      const s = ease.inOut(clamp((u - w.endU) / 0.9));
      let ey = w.eyaw; while (ey - yaw > PI) ey -= 2 * PI; while (yaw - ey > PI) ey += 2 * PI;
      x = lerp(x, w.ex, s); y = lerp(y, w.ey, s); yaw = lerp(yaw, ey, s);
      z = lerp(8.5, w.ez, s) + (w.end === 1 ? 14 : 6) * Math.sin(PI * s);
      if (w.end === 2) {                                   // a new hand tile: stands up, then turns to face you
        const st = ease.inOut(clamp((u - 5.45 - 0.08 * (w.ex > 0 ? 1 : 0)) / 0.45)), tu = ease.inOut(clamp((u - 5.85) / 0.4));
        const c = leanC(w.ex, DIM_Y, lerp(HALF, DIM_TIP, st));
        if (st > 0) { x = c[0]; y = c[1]; z = c[2] + 5 * Math.sin(PI * tu); }
        tip = lerp(HALF, DIM_TIP, st); flip = PI * (1 - tu);
        if (st > 0) { R.pose(T, x, y, z, 0, tip, flip); T.tex = faces[w.endTex]; continue; }
      }
    }
    R.pose(T, x, y, z, yaw, tip, flip);
    T.tex = w.tex && u < w.joinU ? faces[w.tex] : null;
  }
}

// --------------------------------------------------------------- the frame
export function scene(date, faces) {
  used = 0; list.length = 0;
  const now = date.getTime() / 1000;
  const sec = kit.secOf(date), m = date.getMinutes();
  const hourId = Math.floor((now - (m * 60 + sec)) / 3600 + 0.5);   // whole local hours since the epoch
  const hs = m * 60 + sec;
  const digits = pad(date.getHours()) + pad(m);
  const prev = new Date(date.getTime() - (sec + 0.5) * 1000), prevDigits = pad(prev.getHours()) + pad(prev.getMinutes());
  // the lamp sways a little on its cord
  R.lamp.x = 24 * Math.sin(now * 0.37) + 8 * Math.sin(now * 0.91 + 1.3);
  R.lamp.y = -6 + 9 * Math.sin(now * 0.29 + 0.5);
  R.lamp.z = 165; R.lamp.k = 1.25; R.lamp.R2 = 9000;
  const glow = 1;
  const u = m === 59 && sec >= 57 ? sec - 60 : m === 0 && sec < 7.5 ? sec : null;
  if (u !== null) {
    const next = new Date(date.getTime() + (60 - sec + 0.5) * 1000);
    const oldD = u < 0 ? digits : prevDigits, newD = u < 0 ? pad(next.getHours()) + pad(next.getMinutes()) : digits;
    hourShow(faces, u, u < 0 ? hourId + 1 : hourId, oldD, newD, glow);
    return list;
  }
  camera(0);
  const P = hourPlan(hourId);
  drawDims(P, faces, hs, glow);
  drawTime(faces, digits, prevDigits, m, sec, glow);
  drawPond(P, faces, hs, digits, glow);
  const turns = turnsOf(m);
  let drawn = DRAWS_BEFORE[m];
  for (const tr of turns) if (sec >= tr.off) drawn++;
  drawWall(drawn, faces);
  return list;
}
