// The hour for conway.js: the universe is re-seeded. Once the new time is
// built (+1.5 s) the gun's stream bursts: from its lane a front runs out
// across the glass both ways, 60 cells a second, and behind it the glass goes
// negative (amber ground, dark cells: the same two colours, roles swapped)
// and is sown with random soup, 40% live, the way every Life session starts.
// From then on it is the real rule: the soup boils, swallows the gun, the
// eater and the pentadecathlon, throws out gliders and settles into ash. The
// time cannot burn: each digit sits in a dead moat two cells wide, so the
// soup boils round the numerals and never into their counters, and they read
// as dark blocks on amber. From +4.6 s the front closes back into the lane,
// eased, killing the ash as it passes, and behind it the glass is positive
// again with the machine back in place, phase-locked to the seconds.
//
// The soup is different every hour (hashed from the hour) and is simulated
// from the hour inside the frame: at most 210 generations of the 96 x 56
// garden domain from cold (~0.1 s of work on an esp32c3), one generation
// every other frame when warm. RAM: two 5.4 KB grids, the 5.4 KB allow
// masks (x2), a 10.8 KB table of when the front sows each cell and the
// 5.4 KB distance table: ~38 KB while the show runs.

import { lifeStep, GARDEN_FULL0, GARDEN_M as M, GARDEN_W as FW, GARDEN_H as FH, LANE, CW, CH } from './conway-life.js';
import { BOX_W, BOX_H, SLOTS } from './conway-glyphs.js';
import { hash } from '../js/kit.js';

export { SLOTS };

export const FIRE_T0 = 0;                     // the show is simulated from the hour (phase 0 of the garden)
const SOW_T = 1.5, SOW_V = 60;               // once the new time is built, the front leaves the lane, 60 cells a second
export const REVEAL = [4.6, 7.0];           // the negative closes back into the lane, killing the ash, bringing the garden back
const DENSITY = 0.4;

/** Generations of the show at time t (s from the hour): the garden's own 30 a second. */
export const fireGen = (t) => Math.floor((t - FIRE_T0) * 30 + 1e-6);
const timeOf = (gen) => FIRE_T0 + gen / 30;

/** Where the soup may live: not in a digit's moat; the domain's outer ring is dead. */
const ALLOW = new Uint8Array(FW * FH);
for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
  const X = x - M, Y = y - M;
  let ok = true;
  for (const [sx, sy] of SLOTS) if (X >= sx - 2 && X <= sx + BOX_W + 1 && Y >= sy - 2 && Y <= sy + BOX_H + 1) ok = false;
  ALLOW[y * FW + x] = ok ? 1 : 0;
}
// each cell's distance from the lane's middle (cells): the front goes out by it, and comes back by it
const LANE_C = (LANE[0] + LANE[1]) / 2;
const DIST = new Uint8Array(FW * FH);
for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) DIST[y * FW + x] = Math.round(Math.abs(x - M - (y - M) - LANE_C) / Math.SQRT2);
/** The same on the glass. */
export const DIST_VIS = new Uint8Array(CW * CH);
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) DIST_VIS[y * CW + x] = DIST[(y + M) * FW + x + M];
let DMAX = 0;
for (const d of DIST_VIS) DMAX = Math.max(DMAX, d);
const SOW_AT = new Uint16Array(FW * FH);
for (let i = 0; i < SOW_AT.length; i++) SOW_AT[i] = fireGen(SOW_T + DIST[i] / SOW_V);
/** How far out the negative reaches at time t (cells from the lane): grows with the front, shrinks back in the reveal. */
export function reachAt(t) {
  if (t < SOW_T) return -1;
  if (t < REVEAL[0]) return Math.min(255, Math.floor((t - SOW_T) * SOW_V));
  const u = Math.min(1, (t - REVEAL[0]) / (REVEAL[1] - REVEAL[0]));
  return Math.floor((DMAX + 1) * (1 - u * u * (3 - 2 * u))) - 1;
}

let cur = new Uint8Array(FW * FH), nxt = new Uint8Array(FW * FH), curGen = -1, curKey = -1;
const allowQ = new Uint8Array(FW * FH);
export let fireOps = 0;

/** The show's domain at generation `gen` for the hour `key` (cached: steps on from the last one asked, or restarts). */
export function fireAt(key, gen) {
  fireOps = 0;
  if (key !== curKey || gen < curGen || curGen < 0) { cur.set(GARDEN_FULL0); curGen = 0; curKey = key; }
  let lastQ = -1;
  while (curGen < gen) {
    // sow: the cells the front reaches this generation
    for (let i = 0; i < cur.length; i++)
      if (SOW_AT[i] === curGen && ALLOW[i]) cur[i] = hash(i, key, 77) / 4294967296 < DENSITY ? 1 : 0;
    const t = timeOf(curGen + 1);
    let allow = ALLOW;
    if (t > REVEAL[0]) {
      const w = reachAt(t);
      if (w !== lastQ) { for (let i = 0; i < allowQ.length; i++) allowQ[i] = ALLOW[i] && DIST[i] <= w ? 1 : 0; lastQ = w; }
      allow = allowQ;
    }
    lifeStep(cur, nxt, FW, FH, allow);
    [cur, nxt] = [nxt, cur];
    curGen++;
    fireOps += FW * FH * 2;
  }
  return cur;
}
