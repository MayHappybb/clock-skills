// Low Tide: shared geometry, the frame buffer, and the clock's turn schedule.
import * as kit from '../js/kit.js';

export const GW = 128, GH = 64;
export const GROUND = 50;   // the beach surface: castles stand on it, rows >= 50 are sand in section
export const SEA = 52;      // still-water level
export const FLAT = 94;     // the beach is flat up to here, then slopes into the sea
export const X0 = 100;      // where waves break and start to run up the sand
export const groundY = (x) => (x <= FLAT ? GROUND : GROUND + (x - FLAT) * 0.45);
// Hours stand on the dry sand, minutes at the water's edge: the order in which
// the sea reaches them is the order of significance.
export const SLOTS = [{ x: 3, size: 'H' }, { x: 26, size: 'H' }, { x: 56, size: 'M' }, { x: 75, size: 'M' }];
export const BURROW = { x: 50, cx: 57, cy: 59.5 };

export const img = new Float32Array(GW * GH * 3);
export const C = (h) => kit.hex(h);

/** Blend pixel p toward colour c by a. */
export function over(p, c, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  const o = 3 * p;
  img[o] += (c[0] - img[o]) * a; img[o + 1] += (c[1] - img[o + 1]) * a; img[o + 2] += (c[2] - img[o + 2]) * a;
}
export function addPx(p, c, a) {
  const o = 3 * p;
  img[o] += c[0] * a; img[o + 1] += c[1] * a; img[o + 2] += c[2] * a;
}

const pad = (n) => String(n).padStart(2, '0');
export const digitsAt = (s) => { const d = new Date(s * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

/** A soft dot (radius r, coverage-weighted) blended over the image: glides between pixels. */
export function dot(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(GW - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(GH - 1, Math.ceil(y + r + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
    const cov = r + 0.5 - d;
    if (cov > 0) over(py * GW + px, c, a * Math.min(1, cov));
  }
}

const turns = new Map();
/**
 * The wave that lands at minute start Mt (epoch s) and what it does. The
 * front reaches x = 91 (the minute castle's right edge) exactly at Mt, and
 * runs as far as the leftmost digit that changes (changes are always a
 * suffix: if the hour's units change, so do both minutes).
 */
export function turnInfo(Mt) {
  if (turns.has(Mt)) return turns.get(Mt);
  const prev = digitsAt(Mt - 60), cur = digitsAt(Mt);
  let c = 0;
  while (c < 4 && prev[c] === cur[c]) c++;
  const hour = c <= 1;
  const xR = (c < 4 ? SLOTS[c].x : 92) - 2, D = X0 - xR;
  const Tup = hour ? 3.2 : 0.8, Tdown = hour ? 2.4 : 1.2, Hb = hour ? 16 : 8.5;
  const u0 = 1 - Math.sqrt(1 - 9 / D), tb = -u0 * Tup, t1 = tb + Tup + 0.15;
  const hit = (x) => tb + Tup * (1 - Math.sqrt(Math.max(0, 1 - (X0 - x) / D)));
  const builds = [];
  if (hour) {
    for (let k = c; k < 4; k++) builds.push({ k, start: Math.max(hit(SLOTS[k].x) + 0.45, 0.85 + 0.25 * (3 - k)), dur: 1.3 });
  } else {
    let s = t1 + 0.05;
    const dur = c === 3 ? 1.6 : 1.05;
    for (let k = 3; k >= c; k--) { builds.push({ k, start: s, dur }); s += dur; }
  }
  for (const b of builds) { b.old = prev[b.k]; b.d = cur[b.k]; b.end = b.start + b.dur; }
  const bEnd = Math.max(...builds.map((b) => b.end));
  const T = { Mt, prev, cur, c, hour, xR, D, Tup, Tdown, Hb, tb, t1, hit, builds, bEnd, fanfare: hour ? bEnd + 0.15 : null };
  turns.set(Mt, T);
  if (turns.size > 8) turns.delete(turns.keys().next().value);
  return T;
}

/** Where that wave's front is at tau seconds after Mt, and how deep it runs. */
export function frontOf(T, tau) {
  if (tau < T.tb) return null;
  if (tau <= T.tb + T.Tup) {
    const u = (tau - T.tb) / T.Tup;
    return { xf: X0 - T.D * (1 - (1 - u) * (1 - u)), h: T.Hb * (1 - 0.6 * u), foam: 1, up: true };
  }
  if (tau <= T.t1) return { xf: T.xR, h: T.Hb * 0.4, foam: 0.8, up: false };
  const v = (tau - T.t1) / T.Tdown;
  if (v > 1) return null;
  return { xf: T.xR + T.D * v * v, h: (T.Hb * 0.4 + 0.5) * (1 - v), foam: 0.6 * (1 - v), up: false };
}
