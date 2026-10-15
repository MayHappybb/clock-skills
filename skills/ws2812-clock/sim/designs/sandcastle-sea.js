// Low Tide: the sand in section, the sea, the swash, foam and spray.
import * as kit from '../js/kit.js';
import { GW, GH, GROUND, SEA, X0, groundY, img, over, addPx, C, dot, frontOf, SLOTS, BURROW } from './sandcastle-common.js';

const SAND_TOP = C('#d8ac68'), SAND_DEEP = C('#7a5630'), SAND_WET = C('#8a6438'), BURROW_IN = C('#120a04');
const WATER_S = C('#46c2d6'), WATER_D = C('#0e4a78'), FOAM = C('#f2fbff');
const SHELLS = Array.from({ length: 7 }, (_, i) => [Math.floor(kit.hash(i, 31) * 92), GROUND + 2 + Math.floor(kit.hash(i, 32) * 11), kit.hash(i, 33)]);

/** The waves on the go now: crests at sea, fronts running on the sand, spray bursts. */
export function wavesAt(sec, A, B) {
  const crests = [], fronts = [], bursts = [];
  for (let j = 1; j <= 9; j++) {
    const b = 59.65 - 6 * j, tau = sec - b;
    if (A.hour && j === 9) continue;                     // the hour's backwash is still running out
    const R = 97.4 - 5.6 * (b / 60) - 1.2 * kit.hash((A.Mt / 60) % 9973, j);
    if (tau >= -3 && tau < 0.45) {
      const xc = X0 + Math.max(0, -tau) * 14;
      const hc = tau < 0 ? 1.4 + 3.4 * (1 - (xc - X0) / 42) : 4.8 * (1 - tau / 0.45);
      crests.push({ xc, hc, curl: kit.smoothstep(-0.5, 0, tau) * (tau < 0 ? 1 : 1 - tau / 0.45) });
    }
    if (tau >= 0 && tau < 4) {
      let f;
      if (tau < 1.4) { const u = tau / 1.4; f = { xf: X0 - (X0 - R) * (1 - (1 - u) ** 2), h: 2.6 * (1 - 0.5 * u), foam: 1 }; }
      else if (tau < 1.6) f = { xf: R, h: 0.85, foam: 0.6 };
      else { const v = (tau - 1.6) / 2.4; f = { xf: R + (X0 - R) * v * v, h: 0.85 * (1 - v), foam: 0.4 * (1 - v) }; }
      fronts.push(f);
    }
    if (tau >= 0 && tau < 1) bursts.push({ x: X0 + 1, y: SEA - 2.5, t: tau, n: 7, vx: 14, vy: 16, id: ((A.Mt / 60) % 9973) * 16 + j });
  }
  // the turn's big wave: coming in (B, before its minute) and landing (A)
  for (const [T, tau] of [[A, sec], [B, sec - 60]]) {
    const dur = T.hour ? 6 : 3, v = T.hour ? 7 : 14, Hmax = T.hour ? 19 : 10;
    if (tau >= T.tb - dur && tau < T.tb + 0.5) {
      const pre = tau < T.tb;
      const xc = X0 + Math.max(0, T.tb - tau) * v;
      const g = 1 - (xc - X0) / (v * dur);
      const hc = pre ? 1.5 + (Hmax - 1.5) * g ** 1.6 : Hmax * (1 - (tau - T.tb) / 0.5);
      const curl = pre ? kit.smoothstep(T.tb - (T.hour ? 0.9 : 0.45), T.tb, tau) : 1 - (tau - T.tb) / 0.5;
      crests.push({ xc, hc, curl, big: T.hour ? 2 : 1 });
    }
    const f = frontOf(T, tau);
    if (f) fronts.push(f);
    const bt = tau - T.tb;
    if (bt >= 0 && bt < 1.6) bursts.push({ x: X0, y: SEA - Hmax * 0.6, t: bt, n: T.hour ? 60 : 26, vx: T.hour ? 34 : 20, vy: T.hour ? 46 : 26, id: ((T.Mt / 60) % 9973) * 16 + 11 });
    for (let k = T.c; k < 4; k++) {
      const xr = SLOTS[k].x + (SLOTS[k].size === 'H' ? 20 : 16), ht = tau - T.hit(xr);
      if (ht >= 0 && ht < 1.4) bursts.push({ x: xr, y: GROUND - (T.hour ? 8 : 4), t: ht, n: T.hour ? 44 : 28, vx: T.hour ? 26 : 16, vy: T.hour ? 34 : 24, id: ((T.Mt / 60) % 9973) * 16 + 12 + k });
    }
  }
  return { crests, fronts, bursts };
}

/** How far up the sand recent waves have soaked it (0..1) at column x. */
function wetAt(x, sec, A) {
  let w = 0;
  for (let j = 1; j <= 9; j++) {
    const b = 59.65 - 6 * j;
    if (sec < b) continue;
    const R = 97.4 - 5.6 * (b / 60) - 1.2 * kit.hash((A.Mt / 60) % 9973, j);
    if (x >= R - 0.5) w = Math.max(w, Math.exp(-Math.max(0, sec - b - 1.6) / 9) * kit.smoothstep(R - 0.5, R + 2, x));
  }
  if (x >= A.xR && sec > A.tb) w = Math.max(w, Math.exp(-Math.max(0, sec - A.t1) / 14) * kit.smoothstep(A.xR, A.xR + 3, x));
  return w;
}

export function drawGround(E, now, sec, A) {
  const L = 0.1 + 0.8 * E.lev, lc = E.lcol;
  for (let x = 0; x < GW; x++) {
    const gy = groundY(x), w = wetAt(x, sec, A), wd = 0.6 + 5 * w;
    const table = 63.5 - (x - 52) * 0.32;                         // the water table rises toward the sea
    for (let y = Math.floor(gy); y < GH; y++) {
      const cov = Math.min(1, y + 1 - gy), dd = y + 0.5 - gy;
      let c = kit.mix(SAND_TOP, SAND_DEEP, kit.clamp(dd / 12) ** 0.8);
      const strata = 0.9 + 0.1 * Math.sin(y * 1.9 + 2.5 * kit.noise2(x * 0.08, y * 0.4)) + 0.1 * (kit.hash(x, y, 7) - 0.5);
      let wet = Math.max(dd < wd ? 0.75 * w + 0.25 : 0, kit.smoothstep(table - 1, table + 2, y) * 0.8);
      if (x > 94) wet = Math.max(wet, 0.6);
      c = kit.mix(c, SAND_WET, wet);
      const top = dd < 1 ? 0.3 : 0.36;
      let r = c[0] * strata * top, g = c[1] * strata * top, b = c[2] * strata * top;
      const o = 3 * (y * GW + x), a = cov;
      const k = L * (0.6 + 0.4 * Math.exp(-dd / 5));
      img[o] += (r * k * lc[0] - img[o]) * a; img[o + 1] += (g * k * lc[1] - img[o + 1]) * a; img[o + 2] += (b * k * lc[2] - img[o + 2]) * a;
    }
  }
  for (const [sx, sy, h] of SHELLS) if (sy >= groundY(sx) + 1) over(sy * GW + sx, h > 0.5 ? [0.5, 0.3, 0.26] : [0.42, 0.4, 0.36], 0.6 * L);
  // the crab's burrow: a slanting tunnel down to a chamber under the minutes
  for (let y = GROUND; y < GH; y++) for (let x = BURROW.x - 3; x < BURROW.cx + 8; x++) {
    const px = x + 0.5, py = y + 0.5;
    const dT = kit.segDist(px, py, BURROW.x + 0.5, GROUND - 1, BURROW.cx - 2, BURROW.cy) - 1.5;
    const dC = (Math.hypot((px - BURROW.cx) / 6.2, (py - BURROW.cy) / 3.0) - 1) * 3;
    const cov = kit.clamp(0.5 - Math.min(dT, dC));
    if (cov > 0) over(y * GW + x, kit.scale(BURROW_IN, 0.6 + 0.6 * L), cov * 0.92);
  }
}

function seaTop(x, now, crests) {
  let y = SEA - 0.7 * Math.sin(0.42 * x + 2.2 * now) - 0.35 * Math.sin(0.95 * x + 3.1 * now);
  for (const c of crests) {
    const d = x - c.xc, w = d < 0 ? 1.1 + 0.12 * c.hc : 2.4 + 0.65 * c.hc;
    y -= c.hc * Math.exp(-((d / w) ** 2));
  }
  return y;
}

export function drawWater(E, now, waves) {
  const { crests, fronts } = waves;
  const L = 0.12 + 0.88 * E.lev;
  const surf = kit.scale(kit.mix(WATER_S, E.hor, 0.2), L), deep = kit.scale(WATER_D, 0.3 + 0.7 * L);
  const foam = kit.scale(FOAM, 0.2 + 0.75 * E.lev), tick = Math.floor(now * 12);
  for (let x = 0; x < GW; x++) {
    const gy = groundY(x);
    let hw = 0, fa = 0;
    for (const f of fronts) {
      if (x < f.xf) continue;
      const d = x - f.xf;
      hw = Math.max(hw, f.h * (1 - Math.exp(-d / 2.2)) + (d < 1 ? 0.3 : 0));
      fa = Math.max(fa, f.foam * (d < 2.5 ? 1 : Math.exp(-(d - 2.5) / 6)));
    }
    let top = hw > 0.08 ? gy - hw : 99, sea = false;
    if (x >= 95) { const st = seaTop(x, now, crests); if (st < gy) { sea = st < top; top = Math.min(top, st); } }
    if (top >= GH) continue;
    for (const c of crests) fa = Math.max(fa, c.curl * Math.exp(-(((x - c.xc + 1) / (1.5 + 0.3 * c.hc)) ** 2)));
    const bottom = x >= 95 ? GH : gy;
    for (let y = Math.max(0, Math.floor(top)); y < bottom; y++) {
      const cov = Math.min(1, y + 1 - top) * (y + 1 <= gy ? 1 : x >= 95 ? 1 : kit.clamp(gy - y));
      if (cov <= 0) continue;
      const d = y + 0.5 - top, under = y + 0.5 > gy;
      const col = kit.mix(surf, deep, kit.clamp(d / 9));
      const p = y * GW + x;
      over(p, col, cov * (under ? 0.62 : x >= 95 ? 0.92 : 0.7 + 0.25 * kit.clamp(d / 3)));
      const fz = fa * Math.exp(-d / 2.4) + (d < 1 ? 0.22 : 0);
      if (fz > 0.02) over(p, foam, cov * kit.clamp(fz * (0.55 + 0.6 * kit.hash(x, y, tick))));
      if (d < 1.2 && !under && kit.hash(x, tick, 3) > 0.9 && E.sun.up && Math.abs(x - E.sun.x) < 30) addPx(p, [1, 0.9, 0.7], 0.25 * E.dayK);
    }
  }
  // the lip of a breaking crest curls forward over its own trough
  for (const c of crests) {
    if (c.curl <= 0.05 || c.hc < 1.5) continue;
    const st = seaTop(c.xc, now, crests), R = 0.3 * c.hc + 0.4, cx = c.xc - 0.3, cy = st + R;
    const n = Math.ceil(10 + c.hc * 3), th = 0.45 + 0.09 * c.hc;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 - Math.PI * 1.05 * c.curl * (i / n);
      dot(cx + R * Math.cos(a) - 0.4 * c.hc * c.curl * (i / n), cy + R * Math.sin(a), th, kit.mix(surf, foam, 0.35 + 0.6 * i / n), 0.85);
    }
  }
}

export function drawSpray(E, bursts) {
  const foam = kit.scale(FOAM, 0.25 + 0.7 * E.lev);
  for (const b of bursts) for (let i = 0; i < b.n; i++) {
    const r1 = kit.hash(b.id, i, 1), r2 = kit.hash(b.id, i, 2), r3 = kit.hash(b.id, i, 3), r4 = kit.hash(b.id, i, 4);
    const life = 0.55 + 0.75 * r3, t = b.t - 0.12 * r1;
    if (t < 0 || t > life) continue;
    const vx = -(0.1 + r4) * b.vx + 8 * (r2 - 0.5), vy = -(0.25 + 0.75 * r3) * b.vy;
    const x = b.x + 3 * (r2 - 0.5) + vx * t, y = b.y + 5 * (r1 - 0.5) + vy * t + 30 * t * t;
    if (y > GROUND + 1) continue;
    dot(x, y, 0.45 + 0.3 * r3, foam, (1 - t / life) * 0.85);
  }
}
