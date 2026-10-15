// The hour's big stunt for cardstunt: card fireworks on the night sky the
// field has flipped to. The stand flips a rocket up a column of seats (a
// short orange trail climbing), then a ring of cards that spreads from the
// burst point and flips back behind itself, a few of its cards glittering
// white. Only field cards take part: the numerals stay held up in front.
//
// Everything is closed form in the seconds since the hour: a seat is lit
// while the ring band covers it, and its flip progress is the time since the
// band's leading (or trailing) edge passed it.

import { hash } from '../js/kit.js';

export const FW_COLOURS = [0xff8a2a, 0xfff6e6, 0xf0489c, 0x3ccfd8, 0xa4e04a];   // orange, white, magenta, teal, lime

const COLS = 36, NC = 720;
const SX = new Float32Array(NC), SY = new Float32Array(NC);
for (let k = 0; k < NC; k++) {
  const c = k % COLS, r = (k / COLS) | 0;
  SX[k] = (c < 18 ? 4 + 4 * c : 84 + 4 * (c - 18)) + 2;
  SY[k] = r * 4 + 1.5;
}

const N_BURST = 9, T0 = 2.0, STEP = 0.85, RISE = 0.6, LIFE = 1.8, THK = 8, D = 0.25;
const TRAIL = 9;

const bursts = Array.from({ length: N_BURST }, () => ({ t: 0, x: 0, y: 0, rmax: 0, col: 0, rx: 0 }));
let showKey = null;
const ev = { a: -1, b: -1, p: 1 };
let now = 0;

function plan(mk) {
  if (showKey === mk) return;
  showKey = mk;
  for (let i = 0; i < N_BURST; i++) {
    const b = bursts[i], h = hash(mk, i, 41);
    b.t = T0 + STEP * i;
    b.x = (i & 1 ? 18 : 84) + (h % 58);
    b.y = 18 + ((h >>> 8) % 30);
    b.rmax = 30 + ((h >>> 16) % 16);
    b.col = [2, 3, 0, 4, 2, 3, 4, 0, 2][i];
    b.rx = Math.round((b.x - 2) / 4);
  }
}

const ringR = (b, u) => b.rmax * (1 - (1 - u) * (1 - u));        // ease-out spread
const ringV = (b, u) => (2 * b.rmax * (1 - u)) / LIFE;            // its speed, px/s

const api = {
  /** The latest fireworks event at seat k: { a, b, p } (colour indexes, -1 = field), or null. */
  at(k, s) {
    const x = SX[k], y = SY[k];
    let best = null;
    for (let i = 0; i < N_BURST; i++) {
      const b = bursts[i];
      const u0 = s - (b.t - RISE);
      if (u0 < 0 || u0 > RISE + LIFE + D) continue;
      // the rocket: a short trail climbing the seats under the burst point
      if (u0 < RISE + D && Math.abs(x - b.x) < 2.5) {
        const v = u0 / RISE, yh = 80 - (80 - b.y) * (1 - (1 - v) * (1 - v));
        const sp = (2 * (80 - b.y) * Math.max(0.15, 1 - v)) / RISE;
        if (y >= yh && y < 80 && u0 <= RISE) {
          if (y < yh + TRAIL) { ev.a = -1; ev.b = 0; ev.p = (y - yh) / sp / D; best = ev; }
          else { const p = (y - yh - TRAIL) / sp / D; if (p < 1) { ev.a = 0; ev.b = -1; ev.p = p; best = ev; } }
        }
      }
      // the burst: a ring of cards
      const u = (s - b.t) / LIFE;
      if (u < 0 || u > 1 + D / LIFE) continue;
      const uc = u > 1 ? 1 : u;
      const dx = x - b.x, dy = (y - b.y) * 1.15, d2 = dx * dx + dy * dy;
      const R = ringR(b, uc), Ri = R - THK - THK * uc;              // the band widens as it slows
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2), v = Math.max(6, ringV(b, uc));
      const fade = u > 0.55 ? (u - 0.55) / 0.45 : 0;                  // the band thins as it dies, ranked by seat
      const gone = ((hash(k, i, 3) & 255) / 256) < fade;
      const col = (hash(k, i, 7) % 5) === 0 ? 1 : b.col;
      if (d >= Ri && u <= 1 && !gone) { ev.a = -1; ev.b = col; ev.p = (R - d) / v / D; best = ev; }
      else {
        // behind the band (or dropped out of it): flipping back to the field
        const tBack = gone && d >= Ri ? (fade - (hash(k, i, 3) & 255) / 256) * 0.45 * LIFE : (Ri - d) / v;
        const p = tBack / D;
        if (p < 1) { ev.a = col; ev.b = -1; ev.p = p; best = ev; }
      }
    }
    return best;
  },
};

/** The hour's show at seconds s past the hour: an object with `at`, planned once per hour. */
export function fireworks(mk, s) {
  plan(mk - Math.floor(s / 60));
  now = s;
  return api;
}
