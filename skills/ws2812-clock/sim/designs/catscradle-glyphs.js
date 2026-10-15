// Cat's cradle: the ten numerals as string figures. Each digit is ONE path of
// taut straight strands on a 6 x 8 design grid, entering on the left and
// leaving on the right so the string can run on to the next digit and to the
// fingers. Retraced strands lie on top of each other (a doubled string).
// Corners are drawn as crossings: both strands run a little past the turn.
import { hash } from '../js/kit.js';

export const DIG = {
  0: [[0, 6.5], [0, 1.5], [1, 0], [5, 0], [6, 1.5], [6, 6.5], [5, 8], [1, 8], [0, 6.5], [1, 8], [5, 8], [6, 6.5]],
  1: [[1, 2.2], [3.4, 0], [3.4, 8], [1.2, 8], [5.6, 8]],
  2: [[0.2, 1.6], [1.6, 0], [4.6, 0], [6, 1.4], [6, 3.2], [0, 8], [6, 8]],
  3: [[0.2, 1], [1.2, 0], [4.8, 0], [6, 1.2], [6, 2.8], [4.8, 3.9], [2.4, 3.9], [4.8, 3.9], [6, 5], [6, 6.8], [4.8, 8], [1.2, 8], [0.2, 7], [1.2, 8], [4.8, 8], [6, 6.8]],
  4: [[0, 5.6], [4.4, 0], [4.4, 8], [4.4, 5.6], [0, 5.6], [6, 5.6]],
  5: [[0.2, 7], [1.2, 8], [4.8, 8], [6, 6.8], [6, 4.6], [4.6, 3.3], [0.2, 3.6], [0.6, 0], [6, 0]],
  6: [[0, 5], [1.2, 3.8], [4.8, 3.8], [6, 5], [6, 6.8], [4.8, 8], [1.2, 8], [0, 6.6], [0, 2], [1.6, 0], [4.6, 0], [5.6, 0.6]],
  7: [[0, 1.4], [0, 0], [6, 0], [2.4, 8]],
  8: [[0.5, 2.9], [0.5, 1], [1.2, 0], [4.8, 0], [5.5, 1], [5.5, 2.9], [4.6, 3.9], [0, 5.2], [0, 6.8], [1, 8], [5, 8], [6, 6.8], [6, 5.2], [1.4, 3.9], [0.5, 2.9], [0.5, 1], [1.2, 0], [4.8, 0], [5.5, 1]],
  9: [[0.4, 7.4], [1.4, 8], [4.6, 8], [6, 6.4], [6, 1.4], [4.8, 0], [1.2, 0], [0, 1.2], [0, 3], [1.2, 4.2], [4.8, 4.2], [6, 3]],
};

/**
 * Resample a polyline to exactly N intervals, keeping every vertex (so a
 * figure at rest is exact). Per sample: position, corner flag, and for the
 * strand it lies on: canonical normal, position along it (0..1) and a phase,
 * identical for a strand and its retrace so doubled strings vibrate together.
 */
export function sample(P, N) {
  const S = P.length - 1, len = [];
  let L = 0;
  for (let k = 0; k < S; k++) { const l = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]); len.push(l); L += l; }
  const n = len.map((l) => Math.max(1, Math.floor((N * l) / L)));
  let sum = n.reduce((a, b) => a + b, 0);
  const order = len.map((l, k) => k).sort((a, b) => (N * len[b]) / L - n[b] - ((N * len[a]) / L - n[a]));
  for (let j = 0; sum < N; j = (j + 1) % S) { n[order[j]]++; sum++; }
  for (let j = 0; sum > N; j = (j + 1) % S) { const k = order[S - 1 - j]; if (n[k] > 1) { n[k]--; sum--; } }
  const o = {
    x: new Float32Array(N + 1), y: new Float32Array(N + 1), corner: new Float32Array(N + 1),
    nx: new Float32Array(N + 1), ny: new Float32Array(N + 1), u: new Float32Array(N + 1), ph: new Float32Array(N + 1), len: L,
  };
  let i = 0;
  for (let k = 0; k < S; k++) {
    const [ax, ay] = P[k], [bx, by] = P[k + 1];
    let nx = -(by - ay), ny = bx - ax;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (nx < -1e-6 || (Math.abs(nx) < 1e-6 && ny < 0)) { nx = -nx; ny = -ny; }
    const key = [Math.round((ax + bx) * 5), Math.round((ay + by) * 5)];
    const ph = hash(key[0], key[1], 7) * 6.283;
    for (let j = 0; j < n[k]; j++, i++) {
      const u = j / n[k];
      o.x[i] = ax + (bx - ax) * u; o.y[i] = ay + (by - ay) * u;
      o.nx[i] = nx; o.ny[i] = ny; o.u[i] = u; o.ph[i] = ph;
      o.corner[i] = j === 0 && k > 0 ? 1 : 0;
    }
  }
  o.x[N] = P[S][0]; o.y[N] = P[S][1];
  return o;
}

const cache = new Map();
/** Digit d sampled to N intervals in the box (bx, by, w, h). */
export function glyph(d, bx, by, w, h, N) {
  const key = `${d}|${bx}|${by}|${w}|${h}|${N}`;
  let g = cache.get(key);
  if (!g) {
    g = sample(DIG[d].map(([x, y]) => [bx + (x * w) / 6, by + (y * h) / 8]), N);
    cache.set(key, g);
  }
  return g;
}

/**
 * Jacob's ladder between the two fingers aL, aR: a top and a bottom strand,
 * two zigzags crossing between them into a row of diamonds, strings fanning
 * to each hand. One path, as the real figure is one loop.
 */
export function ladderPath(aLx, aLy, aRx, aRy, yT, yB, n) {
  const xL = aLx + 6, xR = aRx - 6, w = (xR - xL) / n;
  const P = [[aLx, aLy], [xL, yT], [xR, yT]];
  for (let k = 1; k <= 2 * n; k++) P.push([xR - (k * w) / 2, k % 2 ? yB : yT]);
  P.push([aLx, aLy], [xL, yB], [xR, yB]);
  for (let k = 1; k <= 2 * n; k++) P.push([xR - (k * w) / 2, k % 2 ? yT : yB]);
  P.push([xR, yB], [aRx, aRy], [xR, yT], [aRx, aRy]);
  return P;
}
