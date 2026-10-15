// Spirograph rosettes: the hour's big drawing on the paper behind the
// numerals. Each hour a big wheel rolls round the inside of the giant ring
// and its pen lays one hypotrochoid across the glass; it stays on the paper
// for the rest of the hour, in dried (dimmer) ink. Built once an hour:
// ~2-4k points as int16 pairs on the device (8-16 KB RAM).
//
//   x = (R - r) cos t + p cos((R - r) t / r)
//   y = (R - r) sin t - p sin((R - r) t / r),   t in [0, 2 pi r]
// with integer tooth counts R (ring) and r (wheel), coprime, so the curve
// closes after r turns with R petals.

import { mixc } from './spirograph-ink.js';

export const RCX = 80, RCY = 40, RMAX = 39;

// one per hour of the twelve: ring teeth, wheel teeth, pen hole (fraction of r), ink
const SETS = [
  [12, 5, 0.82, 0xf2c55c], [7, 3, 0.86, 0x52e2d0], [9, 4, 0.8, 0xff78b4], [10, 3, 0.74, 0xb48cff],
  [11, 4, 0.88, 0xff9850], [13, 5, 0.78, 0x68b6ff], [8, 3, 0.9, 0xb6ee5a], [14, 5, 0.8, 0xf2c55c],
  [9, 2, 0.84, 0xdfe2ee], [11, 3, 0.86, 0xff78b4], [15, 4, 0.82, 0x52e2d0], [13, 4, 0.76, 0xb48cff],
];

const CACHE = new Map();

/** The rosette for an hour (0..23): points, petal count, the ring and wheel geometry, its ink. */
// sine table (shared idea with the face's own: an int16 table on the device)
const ST = Float32Array.from({ length: 4096 }, (_, i) => Math.sin((i / 4096) * 2 * Math.PI));
const sn = (t) => ST[((t * 4096) / (2 * Math.PI)) & 4095];
const cs = (t) => ST[(((t * 4096) / (2 * Math.PI)) + 1024) & 4095];

/** Work done by the last rosette() build, in integer-op units (billed by the face). */
export let roseOps = 0;
export function takeRoseOps() { const o = roseOps; roseOps = 0; return o; }

/** The rosette for an hour (0..23): points (int16 pairs on the device), the ring and wheel geometry, its ink. */
export function rosette(hour) {
  const key = hour % 12;
  let ro = CACHE.get(key);
  if (ro) return ro;
  const [R, r, pf, ink] = SETS[key];
  const p = pf * r, sc = RMAX / (R - r + p);
  const T = 2 * Math.PI * r, k = (R - r) / r;
  // a fixed parameter step: the pen's top speed covers about 0.5 px a step
  const vmax = sc * ((R - r) + p * k), n = Math.ceil((T * vmax) / 0.5), dt = T / n;
  const P = new Float32Array(2 * n), Tv = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const t = j * dt;
    P[2 * j] = ((R - r) * cs(t) + p * cs(k * t)) * sc;
    P[2 * j + 1] = ((R - r) * sn(t) - p * sn(k * t)) * sc;
    Tv[j] = t;
  }
  roseOps += n * 12;
  ro = {
    P, Tv, n, petals: R,
    ringR: R * sc, wheelR: r * sc, orbit: (R - r) * sc, pen: p * sc, k, T, ink,
    dim: mixc(0x16131c, ink, 0.3),
  };
  CACHE.set(key, ro);
  if (CACHE.size > 2) CACHE.delete(CACHE.keys().next().value);
  return ro;
}
