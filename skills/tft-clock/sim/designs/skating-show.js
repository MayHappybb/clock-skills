// skating: the choreography. Everything here is a pure function of absolute
// time T (seconds since the epoch): where each skater is, which digits are
// carved how far, where the resurfacer is and which ice it has already
// shaved clean.
//
// Each minute has a schedule (built once per minute key, cached):
//   - carves: skater p skates the new digit at position p just after :00
//   - at the hour: every digit, then two spins that cut the colon, then a
//     four-skater pinwheel round centre ice
//   - runs: the resurfacer pass at the END of the minute, over the strips of
//     ice holding the digits about to change (two machines at the hour)

import { clockFields, sin, clamp } from '../js/kit.js';
import { GLYPH, DIGIT_OX, COLON, along } from './skating-glyphs.js';

const TAU = Math.PI * 2;
export const CARVE_V = 40;          // px/s along a digit
export const ZW = 10;               // resurfacer strip width
const Y_TOP = 14, Y_BOT = 66, ZR = ZW / 2, LS = Y_BOT - Y_TOP, ARC = Math.PI * ZR;
const LEAD = 26, LEAD_OUT = 30;
export const REAR = 7;              // conditioner behind the machine's centre

// ------------------------------------------------------------ free skating

// Hour-periodic Lissajous loops: integer cycles per hour, so T mod 3600 is exact.
const FREE = [
  { k: [200, 470, 380, 900], p: [0, 1.3, 0.4, 2.2] },
  { k: [230, 410, 350, 830], p: [2.1, 0.2, 3.0, 1.1] },
  { k: [190, 530, 410, 760], p: [4.0, 2.6, 1.7, 0.5] },
  { k: [250, 450, 330, 970], p: [5.2, 4.1, 5.5, 3.3] },
];
const SPIN_P = 30, SPIN_D = 6;
export const spinOff = (i) => 3 + 7.5 * i;
const JUMP_D = 0.7;
export const jumpOffs = (i) => [spinOff(i) + 11, spinOff(i) + 24];

const mod = (a, n) => ((a % n) + n) % n;

/** Spin warp: inside a spin window the skater decelerates to a stop and catches up after. */
function warp(i, T) {
  const x = mod(T - spinOff(i), SPIN_P) / SPIN_D;
  if (x >= 1) return T;
  const h = x + 0.5 * (Math.sin(TAU * x) / TAU - Math.sin(2 * TAU * x) / (2 * TAU));
  return T + (h - x) * SPIN_D;
}

/** How hard skater i is spinning at T (0..1, peaks mid-window). */
export function spinAmt(i, T) {
  const x = mod(T - spinOff(i), SPIN_P) / SPIN_D;
  if (x >= 1) return 0;
  const b = Math.sin(Math.PI * x);
  return b * b * b;
}

/** Height of a jump 0..1 (0 on the ice) and the time of the last landing. */
export function jumpAir(i, T) {
  for (const o of jumpOffs(i)) {
    const u = mod(T - o, SPIN_P) / JUMP_D;
    if (u < 1) return Math.sin(Math.PI * u);
  }
  return 0;
}
export function lastLanding(i, T) {
  let best = -Infinity;
  for (const o of jumpOffs(i)) {
    const land = T - mod(T - o - JUMP_D, SPIN_P);
    if (land > best) best = land;
  }
  return best;
}

export function freeAt(i, T) {
  const F = FREE[i];
  const ph = mod(warp(i, mod(T, 3600)), 3600) / 3600;
  const a = (k, p) => sin(TAU * mod(k * ph, 1) + p);
  return [
    80 + 64 * (0.7 * a(F.k[0], F.p[0]) + 0.3 * a(F.k[1], F.p[1])),
    40 + 28 * (0.75 * a(F.k[2], F.p[2]) + 0.25 * a(F.k[3], F.p[3])),
  ];
}

// ------------------------------------------------------------ schedules

export const PIN_C = [81, 40], PIN_R = 13, PIN_W = 1.4;   // pinwheel centre, radius, rad/s

const CACHE = new Map();
/** The schedule of minute key mk (minutes since the epoch). */
export function schedule(mk) {
  let S = CACHE.get(mk);
  if (S) return S;
  const t0 = mk * 60;
  const cur = clockFields(new Date(mk * 60000)), prev = clockFields(new Date((mk - 1) * 60000));
  const cd = cur.hh + cur.mm, pd = prev.hh + prev.mm;
  const hour = cur.m === 0;
  const changed = [];
  for (let p = 0; p < 4; p++) if (hour || cd[p] !== pd[p]) changed.push(p);
  const segs = [[], [], [], []];     // per skater, in time order
  const carves = [];
  changed.forEach((p, idx) => {
    const d = +cd[p], G = GLYPH[d], ox = DIGIT_OX[p];
    const c0 = t0 + (hour ? 0.9 + 0.45 * p : 0.9 + 0.7 * idx), c1 = c0 + G.len / CARVE_V;
    const c = { p, d, ox, c0, c1 };
    carves.push(c);
    segs[p].push({
      a0: c0 - 1.6, c0, c1, e1: c1 + 2.2,
      at: (T) => { const [x, y] = along(d, (T - c0) * CARVE_V); return [ox + x, DIGIT_TOP_OFF + y]; },
      v0: [G.t0[0] * CARVE_V, G.t0[1] * CARVE_V], v1: [G.t1[0] * CARVE_V, G.t1[1] * CARVE_V],
      carve: c,
    });
  });
  // mid-minute, one skater retraces her own figure, as compulsory figures were
  // skated three times over one tracing: her follow spot reads the numeral out
  if (!hour) {
    const p = ((mk % 4) + 4) % 4, d = +cd[p], G = GLYPH[d], ox = DIGIT_OX[p];
    const c0 = t0 + 22 + (mk % 3) * 2, c1 = c0 + G.len / (CARVE_V * 0.8);
    segs[p].push({
      a0: c0 - 1.8, c0, c1, e1: c1 + 2.2,
      at: (T) => { const [x, y] = along(d, (T - c0) * CARVE_V * 0.8); return [ox + x, y]; },
      v0: [G.t0[0] * CARVE_V * 0.8, G.t0[1] * CARVE_V * 0.8], v1: [G.t1[0] * CARVE_V * 0.8, G.t1[1] * CARVE_V * 0.8],
    });
  }
  const spins = [];
  let pin = null;
  if (hour) {
    // the colon: skater 1 spins on the upper dot, skater 2 on the lower
    for (const [k, sk] of [[0, 1], [1, 2]]) {
      const after = carves.find((c) => c.p === sk).c1;
      const c0 = after + 1.2, c1 = c0 + 1.5;
      const [cx, cy] = COLON[k];
      const sp = { k, cx, cy, c0, c1, sk };
      spins.push(sp);
      segs[sk].push({
        a0: c0 - 1.2, c0, c1, e1: c1 + 1.6,
        at: (T) => { const a = (T - c0) * 18; return [cx + 1.1 * Math.cos(a), cy + 0.8 * Math.sin(a)]; },
        v0: [0, 0], v1: [0, 0], spin: sp,
      });
    }
    const p0 = Math.max(...spins.map((s) => s.c1)) + 1.4, p1 = p0 + 5.5;
    pin = { c0: p0, c1: p1 };
    for (let i = 0; i < 4; i++) {
      const pos = (T) => { const a = (T - p0) * PIN_W + i * Math.PI / 2; return [PIN_C[0] + PIN_R * Math.cos(a), PIN_C[1] + PIN_R * Math.sin(a)]; };
      const vel = (T) => { const a = (T - p0) * PIN_W + i * Math.PI / 2; return [-PIN_R * PIN_W * Math.sin(a), PIN_R * PIN_W * Math.cos(a)]; };
      segs[i].push({ a0: p0 - 1.8, c0: p0, c1: p1, e1: p1 + 2, at: pos, v0: vel(p0), v1: vel(p1), pin: true });
    }
  }
  // the resurfacer at the end of THIS minute clears what changes at the next
  const nx = clockFields(new Date((mk + 1) * 60000)), nd = nx.hh + nx.mm;
  const runs = [];
  if (nx.m === 0) {
    const v = 56, n = 7, st = t0 + 59.6 - runLen(n) / v;
    runs.push({ x0: 10, dir: 1, n, up: true, start: st, v });
    runs.push({ x0: 150, dir: -1, n, up: false, start: st, v });
  } else {
    let lo = 4, hi = -1;
    for (let p = 0; p < 4; p++) if (cd[p] !== nd[p]) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    if (hi >= 0) {
      const xa = DIGIT_OX[lo] - 2, xb = DIGIT_OX[hi] + 26;
      const n = Math.ceil((xb - xa) / ZW), v = 48;
      runs.push({ x0: xa, dir: 1, n, up: true, start: t0 + 59.6 - runLen(n) / v, v });
    }
  }
  S = { mk, t0, cd, hour, changed, carves, spins, pin, segs, runs, nextChange: [0, 1, 2, 3].map((p) => nx.m === 0 || cd[p] !== nd[p]) };
  CACHE.set(mk, S);
  if (CACHE.size > 8) CACHE.delete(CACHE.keys().next().value);
  return S;
}
const DIGIT_TOP_OFF = 0;   // along() already includes DIGIT_TOP

// ------------------------------------------------------------ skaters

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * Skater i at time T: { x, y, free } where free is 1 in free skating and 0
 * while performing a scripted element (carving, colon spin, pinwheel).
 */
export function skaterAt(i, T) {
  let [x, y] = freeAt(i, T);
  let free = 1;
  const mk = Math.floor(T / 60);
  for (const m of [mk - 1, mk, mk + 1]) {
    for (const s of schedule(m).segs[i]) {
      if (T < s.a0 || T > s.e1) continue;
      let tx, ty, w;
      if (T < s.c0) {
        const [sx, sy] = s.at(s.c0), dt = s.c0 - T;
        tx = sx - s.v0[0] * dt; ty = sy - s.v0[1] * dt;
        w = smooth((T - s.a0) / (s.c0 - s.a0));
      } else if (T <= s.c1) {
        [tx, ty] = s.at(T); w = 1;
      } else {
        const [ex, ey] = s.at(s.c1), dt = T - s.c1, k = dt * (1 - 0.45 * dt / (s.e1 - s.c1));
        tx = ex + s.v1[0] * k; ty = ey + s.v1[1] * k;
        w = 1 - smooth((T - s.c1) / (s.e1 - s.c1));
      }
      x += (tx - x) * w; y += (ty - y) * w;
      free = Math.min(free, 1 - w);
    }
  }
  return { x, y, free };
}

// ------------------------------------------------------------ the resurfacer

export function runLen(n) { return LEAD + n * LS + (n - 1) * ARC + LEAD_OUT; }

const stripX = (r, k) => r.x0 + r.dir * (k + 0.5) * ZW;
const stripUp = (r, k) => (k % 2 === 0) === r.up;

/** The machine of run r at T: [x, y, heading radians] or null when not on the ice. */
export function machineAt(r, T) {
  let s = (T - r.start) * r.v;
  if (s < 0 || s > runLen(r.n)) return null;
  const k0up = stripUp(r, 0);
  if (s < LEAD) return [stripX(r, 0), k0up ? Y_BOT + LEAD - s : Y_TOP - LEAD + s, k0up ? -Math.PI / 2 : Math.PI / 2];
  s -= LEAD;
  for (let k = 0; k < r.n; k++) {
    const up = stripUp(r, k), x = stripX(r, k);
    if (s < LS || k === r.n - 1) {
      const y = up ? Y_BOT - s : Y_TOP + s;
      return [x, y, up ? -Math.PI / 2 : Math.PI / 2];
    }
    s -= LS;
    if (s < ARC) {
      // half turn over the end, towards the next strip
      const a = s / ZR, cx = x + r.dir * ZR, cy = up ? Y_TOP : Y_BOT;
      if (up) return [cx - r.dir * ZR * Math.cos(a), cy - ZR * Math.sin(a), -Math.PI / 2 + r.dir * a];
      return [cx - r.dir * ZR * Math.cos(a), cy + ZR * Math.sin(a), Math.PI / 2 - r.dir * a];
    }
    s -= ARC;
  }
  return null;
}

/** When run r's conditioner shaves the ice at (x, y), or Infinity if it never does. */
export function passTime(r, x, y) {
  const k = Math.floor((r.dir > 0 ? x - r.x0 : r.x0 - x) / ZW);
  if (k < 0 || k >= r.n) return Infinity;
  const along = stripUp(r, k) ? Y_BOT - y : y - Y_TOP;
  return r.start + (LEAD + k * (LS + ARC) + clamp(along, -ZR - 2, LS + ZR + 2) + REAR) / r.v;
}

/** Strip k of run r as [x0, x1). */
export function stripBox(r, k) {
  const a = r.x0 + r.dir * k * ZW, b = a + r.dir * ZW;
  return [Math.min(a, b), Math.max(a, b)];
}
