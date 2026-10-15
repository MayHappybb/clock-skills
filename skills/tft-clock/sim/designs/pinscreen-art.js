// The pinscreen's low reliefs: four board-wide scenes (one per hour, in
// turn) and the small things pressed in from behind between turns. All are
// height maps in pins, levels in 1/32 (Q), built once at load: flash tables.

import { hash, noise2 } from '../js/kit.js';

export const COLS = 53, ROWS = 26, N = COLS * ROWS, Q = 32;

function scene(fn) {
  const t = new Uint8Array(N);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) t[j * COLS + i] = Math.max(0, Math.min(255, Math.round(fn(i + 0.5, j + 0.5, i, j) * Q)));
  return t;
}

// The scenes are the quietest thing on the board, drawn in the two lowest
// levels only: 1 is every pin flush (a full lattice of 1-px glints), 0.55
// every other pin pulled back (half the lattice), 0 a pulled-back halo. The
// wind, the things pressed in and the fingers ride above them at 2-3 (4- and
// 6-px heads), the numerals' plates at 5.
const LO = 0.55, HI = 1.0;

// 0: hills under a sun.
const hills = scene((x, y) => {
  const sd = Math.hypot(x - 47, (y - 3.5) * 1.1);
  if (sd < 2.6) return HI + 1;
  if (sd < 3.7) return 0;
  const far = 6.6 + 1.4 * Math.sin(x * 0.19 + 0.6) + 0.8 * Math.sin(x * 0.47);
  return y > far ? HI : LO;
});

// 1: a crescent moon and scattered stars.
const moon = scene((x, y, i, j) => {
  const a = Math.hypot(x - 48, y - 3.8), b = Math.hypot(x - 49.6, y - 3.0);
  if (a < 3.1 && b > 2.5) return HI + 1;
  if (a < 4.1) return 0;
  if (hash(i, j, 77) % 19 === 0) return 2.2;
  return LO;
});

// 2: the sea, as seigaiha: overlapping fans of concentric rings, drawn as lines.
const sea = scene((x, y) => {
  const SX = 8, SY = 3.2, R = 5.2;
  let best = -1, bestCy = -1e9;
  for (let rj = -1; rj <= Math.ceil(ROWS / SY) + 1; rj++) {
    const cy = rj * SY, off = (rj & 1) * SX / 2;
    for (let ri = -1; ri <= COLS / SX + 1; ri++) {
      const cx = ri * SX + off, r = Math.hypot(x - cx, (y - cy) * 1.25);
      if (r < R && cy > bestCy) { bestCy = cy; best = r; }
    }
  }
  if (best < 0) return LO;
  return best > R - 1.2 || (best > 2.1 && best < 3.2) ? HI : LO;
});

// 3: a sunburst from below the hours, rays fanning across the board.
const burst = scene((x, y) => {
  const a = Math.atan2(-(y - 31), x + 6);
  const k = Math.floor(a / (Math.PI / 2 / 20));
  return k % 2 === 0 ? HI : LO;
});

export const SCENES = [hills, moon, sea, burst];

// Free field between and round the numerals with no scene: the flat board.
export const FLAT = 0.8 * Q;

/** Per-pin phase jitter for the wind, so crests wander instead of marching. */
export const WIND_PH = new Int16Array(N);
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) WIND_PH[j * COLS + i] = Math.round(noise2(i * 0.18, j * 0.22, 5) * 2600);

// ------------------------------------------------------------ pressed things
// '#' pushed well out (6-px heads), '+' half (4-px), 'o' pulled back (a hole).

function obj(src) {
  const r = src.split('\n').map((l) => l.trim()).filter((l) => l.length);
  const w = Math.max(...r.map((l) => l.length)), h = r.length;
  const v = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = r[y][x];
      v[y * w + x] = c === '#' ? 3.3 * Q : c === '+' ? 2 * Q : c === 'o' ? 0 : -1;
    }
  // centre-out order for the press: distance from the middle, 0..1
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = Math.round(255 * Math.min(1, Math.hypot((x - (w - 1) / 2) / w, (y - (h - 1) / 2) / h) * 1.6));
  return { w, h, v, d };
}

const KEY = obj(`
  .###..........
  #####.........
  ##o###########
  #####..##.#.##
  .###...##.#...`);

const SHELL = obj(`
  ...+#+#+#+...
  .+#+#+#+#+#+.
  #+#+#+#+#+#+#
  #+#+#+#+#+#+#
  .#+#+#+#+#+#.
  ..##+#+#+##..
  .####+#+####.`);

const CAR = obj(`
  ....#######...
  ...##oo#ooo#..
  .############.
  ##############
  ###o.####o.###
  ..###...###...`);

const COMB = obj(`
  .#############.
  ###############
  #.#.#.#.#.#.#.#
  #.#.#.#.#.#.#.#
  #.#.#.#.#.#.#.#`);

export const THINGS = [KEY, SHELL, CAR, COMB];
