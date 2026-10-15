// Shadowplay's hour dragon: a long jointed leather dragon chasing its flaming
// pearl along an S-curve across the whole stage. Its plates follow the head
// along one fixed path (like a train on rails), overlapping like scales.
import { Piece, draw, dot, hole, rod } from './shadowplay-cloth.js';

const JADE = [0.1, 0.52, 0.3], FIN = [0.85, 0.12, 0.04], GOLD = [1.0, 0.66, 0.1], INK = [0.04, 0.04, 0.04];
const P = (kind, pts, hw, col, pat = 0, sp = 3, hr = 0.6) => new Piece(kind, pts, hw, col, pat, sp, hr);
const Z = (pts, k) => pts.map((v) => v * k);   // scale a shape

// the path: y(x) on the cloth, arc-length tables to walk it at constant speed
const X0 = -260, X1 = 340, STEP = 0.5, NX = (X1 - X0) / STEP + 1;
// it slithers in along the stage floor, under the Monkey King's feet, then rears up through the hour
export const pathY = (x) => 55.5 - 25 * Math.exp(-(((x - 30) / 24) ** 2)) + 2.2 * Math.sin(0.21 * x);
const SX = new Float64Array(NX);
for (let i = 1; i < NX; i++) {
  const xa = X0 + (i - 1) * STEP, xb = xa + STEP;
  SX[i] = SX[i - 1] + Math.hypot(STEP, pathY(xb) - pathY(xa));
}
const sOf = (x) => SX[Math.max(0, Math.min(NX - 1, Math.round((x - X0) / STEP)))];
let QX = 0, QY = 0, QA = 0;
/** Position and tangent angle at arc length s. */
function at(s) {
  let lo = 0, hi = NX - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SX[m] < s) lo = m; else hi = m; }
  const f = Math.max(0, Math.min(1, (s - SX[lo]) / (SX[hi] - SX[lo] || 1)));
  QX = X0 + (lo + f) * STEP; QY = pathY(QX);
  QA = Math.atan2(pathY(QX + 0.5) - pathY(QX - 0.5), 1);
}
export const S_MEET = sOf(32), SPEED = 46;

const head = P(1, Z([0, -4, -4, -5.6, -8, -5.2, -12, -4.4, -16, -3.4, -16.8, -1.5, -12.5, -0.6, -9.2, 0.3, -13, 1.9, -14.8, 3.3,
  -9, 3.9, -4, 4.7, 0, 4.2], 1.3), 0, JADE);
const mane = P(1, Z([-1, -4.4, 2, -8.5, 3.6, -4.6, 6.6, -7.6, 7, -2, 9, -3.4, 7.6, 2.4, 3.6, 4.6, -1, 4.4], 1.3), 0, FIN, 2, 2.4, 0.55);
const horn = P(0, Z([-4.5, -5.2, -1, -9.5, 3.5, -11.5, 6.5, -11], 1.3), 1.1, GOLD);
const whisker = P(0, [0, 0, -3, 1.2, -4.5, 4.4, -3.2, 7.6], 0.45, INK);
const N_SEG = 18, SEG = 4.5;
const plates = [], fins = [], bellies = [];
for (let k = 0; k < N_SEG; k++) {
  const q = 1 - 0.55 * (k / (N_SEG - 1)) ** 1.3, a = 4.6 * q, b = 5.4 * q;
  plates.push(P(1, [-a, 0, -a * 0.7, -b, a * 0.6, -b, a, 0, a * 0.6, b, -a * 0.7, b], 0, k % 2 ? JADE : [0.16, 0.62, 0.4], 2, 2.3, 0.55));
  fins.push(P(1, [-a * 0.8, -b + 0.8, a * 0.9, -b + 0.8, a * 0.7, -b - 4.4 * q], 0, FIN));
  bellies.push(P(1, [-a * 0.7, b - 1.2, a * 0.7, b - 1.2, a * 0.5, b + 1.3, -a * 0.5, b + 1.3], 0, GOLD));
}
const tailFin = P(1, [0, 0, 4, -6, 9, -7, 7, -2, 11, 1, 7, 2.5, 9, 6.5, 4, 5], 0, FIN, 2, 2.2, 0.5);
const claw = P(0, [0, 0, -1.5, 4, -4.5, 5.8], 0.9, GOLD);
const pearl = P(1, (() => { const p = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; p.push(3.6 * Math.cos(a), 3.6 * Math.sin(a)); } return p; })(), 0, [1, 0.5, 0.12]);
const flame = P(1, [0, -3, 5, -2.5, 9, -4, 7, -0.6, 11, 1.2, 6, 2, 0, 3], 0, [1, 0.35, 0.06]);

/** Draw the dragon u seconds from the hour. Returns the head x (for the knock). */
export function dragon(u, t) {
  const sh = S_MEET - SPEED * u;
  const ripple = (k) => 2.2 * Math.sin(0.9 * k - 7 * u);
  // body, tail first so the head sits on top visually (all multiply anyway)
  for (let k = N_SEG - 1; k >= 0; k--) {
    const s = sh + 9 + k * SEG;
    at(s);
    if (QX < -14 || QX > 142) continue;
    const y = QY + ripple(k);
    draw(plates[k], QX, y, QA, 0, 1);
    draw(fins[k], QX, y, QA, 0, 1);
    draw(bellies[k], QX, y, QA, 0, 1);
    if (k === 2 || k === 9) {
      const sw = 0.5 * Math.sin(5 * t + k);
      draw(claw, QX + 2, y + 3, QA + sw, 0, 1); draw(claw, QX - 2, y + 3.5, QA - sw * 0.8 + 0.3, 0, 1);
    }
    if (k === 4) rod(QX, y, QX + 14, 72, 0.6, 0.3, 0, 0.55, 1);
    if (k === N_SEG - 1) draw(tailFin, QX + 2, y, QA + 0.3 * Math.sin(4 * t), 0, 1);
  }
  at(sh);
  const hx = QX, hy = QY + ripple(-1.2), ha = QA + 0.12 * Math.sin(6 * t);
  if (hx > -24 && hx < 150) {
    const c = Math.cos(ha), s = Math.sin(ha);
    draw(mane, hx, hy, ha, 0, 1); draw(head, hx, hy, ha, 0, 1); draw(horn, hx, hy, ha, 0, 1);
    const jx = (lx, ly) => hx + c * lx - s * ly, jy = (lx, ly) => hy + s * lx + c * ly;
    draw(whisker, jx(-20.8, -3.1), jy(-20.8, -3.1), ha + 0.4 * Math.sin(5.3 * t), 0, 1);
    hole(jx(-10.4, -3.8), jy(-10.4, -3.8), 1.8, 1);
    dot(jx(-11.2, -3.8), jy(-11.2, -3.8), 0.8, 0.03, 0.03, 0.03, 0, 1);
    rod(jx(2, 2), jy(2, 2), hx + 18, 72, 0.6, 0.3, 0, 0.55, 1);
  }
  // the flaming pearl, bobbing just out of reach ahead of the jaws
  at(sh - 17 - 3 * Math.sin(3 * t));
  const px = QX, py = QY - 4 + 2 * Math.sin(4.2 * t);
  if (px > -16 && px < 146) {
    draw(flame, px + 1, py, 0.25 * Math.sin(9 * t), 0, 1);
    draw(pearl, px, py, 0, 0, 1);
    hole(px - 0.6, py - 0.8, 1.6, 0.9);
    rod(px, py, px - 6, 72, 0.5, 0.35, 0, 0.6, 1);
  }
  return hx;
}
