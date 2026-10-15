// Props for the Birthday face: the hand that swaps candles, the match, the
// hour's bunting and confetti. All closed-form in time.
import * as kit from '../js/kit.js';
import { W, H } from './candles-scene.js';
import { dot } from './candles-fx.js';

const SKIN = kit.hex('#e9a77c'), SLEEVE = kit.hex('#3a5fa8'), CUFF = kit.hex('#f2f2f2');
const OUT = [0.01, 0.006, 0.004];

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function put(img, o, c, a, k) {
  img[o] += (c[0] * k - img[o]) * a; img[o + 1] += (c[1] * k - img[o + 1]) * a; img[o + 2] += (c[2] * k - img[o + 2]) * a;
}

/**
 * An arm reaching from (ax, ay) (off-screen) to a pinch at (hx, hy): sleeve,
 * cuff, hand, and finger and thumb either side of what it holds (gap px).
 */
export function drawArm(img, ax, ay, hx, hy, gap, k, sleeve = SLEEVE) {
  const len = Math.hypot(hx - ax, hy - ay) || 1, ux = (hx - ax) / len, uy = (hy - ay) / len;
  const wx = hx - ux * 5, wy = hy - uy * 5;                 // the wrist
  const nx = -uy, ny = ux;
  const fA = [hx + nx * gap, hy + ny * gap], fB = [hx - nx * gap, hy - ny * gap];
  const x0 = Math.max(0, Math.floor(Math.min(ax, hx) - 9)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, hx) + 9));
  const y0 = Math.max(0, Math.floor(Math.min(ay, hy) - 9)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, hy) + 9));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const px = xx + 0.5, py = yy + 0.5;
    const dS = segD(px, py, ax, ay, wx - ux * 2, wy - uy * 2) - 3.3 - 0.018 * Math.max(0, len - ((px - ax) * ux + (py - ay) * uy));
    const dP = segD(px, py, wx, wy, hx - ux * 1.5, hy - uy * 1.5) - 3.2;
    const dF = Math.min(segD(px, py, wx + nx * 2, wy + ny * 2, fA[0], fA[1]), segD(px, py, wx - nx * 2, wy - ny * 2, fB[0], fB[1])) - 1.5;
    const dSkin = Math.min(dP, dF), D = Math.min(dS, dSkin);
    if (D > 0.5) continue;
    const o = 3 * (yy * W + xx), cov = D < -0.5 ? 1 : 0.5 - D;
    let col;
    if (D > -0.8) col = OUT;
    else if (dS < dSkin) {
      const along = (px - ax) * ux + (py - ay) * uy;
      col = along > len - 7.5 ? CUFF : sleeve;
    } else col = SKIN;
    put(img, o, col, cov, k);
  }
}

/** A match from (bx, by) (held end) to its head at (tx, ty). */
export function drawMatch(img, bx, by, tx, ty, k, burnt) {
  const n = Math.ceil(Math.hypot(tx - bx, ty - by) / 0.6);
  for (let j = 0; j <= n; j++) {
    const s = j / n, x = bx + (tx - bx) * s, y = by + (ty - by) * s;
    dot(img, x, y, 1.25, 0.6 * k, 0.45 * k, 0.22 * k);
  }
  const hc = burnt ? [0.03, 0.02, 0.02] : [0.6, 0.06, 0.03];
  dot(img, tx, ty, 2.1, hc[0] * k, hc[1] * k, hc[2] * k);
}

// --------------------------------------------------------------- the hour
const PEN = ['#ff6f9c', '#ffd25a', '#5cc8ff', '#8be07a', '#c69bff', '#ff9a4a'].map(kit.hex);

/** Bunting: two swags across the top. drop 0 (up out of view) .. 1. */
export function drawBunting(img, t, drop, k) {
  if (drop <= 0.001) return;
  const off = -26 * (1 - drop);
  for (let sw = 0; sw < 2; sw++) {
    const xa = sw * 64 - 2, xb = xa + 68, sag = 9;
    const yAt = (x) => { const q = (x - (xa + xb) / 2) / ((xb - xa) / 2); return 2 + off + sag * (1 - q * q); };
    for (let x = Math.max(0, xa); x < Math.min(W, xb); x += 0.7) dot(img, x, yAt(x), 0.8, 0.35 * k, 0.32 * k, 0.28 * k);
    for (let p = 0; p < 6; p++) {
      const x = xa + 7 + p * 10.8, y = yAt(x);
      const sway = 0.18 * Math.sin(t * 2.1 + p * 1.3 + sw * 2) + 0.1 * Math.sin(t * 3.7 + p);
      const c = PEN[(p + sw * 3) % PEN.length];
      // a pennant: a triangle hanging from (x-3.6, y)..(x+3.6, y), tip 7.5 down, swung by `sway`
      const tipX = x + Math.sin(sway) * 7.5, tipY = y + Math.cos(sway) * 7.5;
      const A = [x - 3.6, y], B = [x + 3.6, y], C = [tipX, tipY];
      const x0 = Math.max(0, Math.floor(Math.min(A[0], C[0]) - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(B[0], C[0]) + 1));
      const y0 = Math.max(0, Math.floor(y - 1)), y1 = Math.min(H - 1, Math.ceil(tipY + 1));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const px = xx + 0.5, py = yy + 0.5;
        // signed distance to the triangle (negative inside), by edge half-planes
        let dp = -1e9, dn = -1e9;
        for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
          const ex = Q[0] - P[0], ey = Q[1] - P[1], el = Math.hypot(ex, ey);
          const s = ((px - P[0]) * ey - (py - P[1]) * ex) / el;
          if (s > dp) dp = s;
          if (-s > dn) dn = -s;
        }
        const d = Math.min(dp, dn);                               // whichever winding is the inside
        if (d > 0.5) continue;
        const a = d < -0.5 ? 1 : 0.5 - d, o = 3 * (yy * W + xx);
        put(img, o, c, a, k);
      }
    }
  }
}

/** Confetti, released at t0 from the top, landing on the cake; alpha a. */
export function drawConfetti(img, age, a, k) {
  if (a <= 0.01) return;
  for (let j = 0; j < 110; j++) {
    const ts = kit.hash(j, 1) * 2.2, dt = age - ts;
    if (dt < 0) continue;
    const vy = 15 + 12 * kit.hash(j, 2), land = 58 + 60 * kit.hash(j, 3);
    let y = -3 + vy * dt; const landed = y > land; if (landed) y = land;
    const tf = landed ? (land + 3) / vy : dt;
    const x = 2 + 124 * kit.hash(j, 4) + 3.5 * Math.sin(tf * (2 + 2 * kit.hash(j, 5)) + 9 * kit.hash(j, 6));
    const spin = landed ? 0.55 : Math.abs(Math.cos(tf * (5 + 6 * kit.hash(j, 7)) + j));
    const c = PEN[j % PEN.length], s = a * k * (0.25 + 0.75 * spin) * (landed ? 0.6 : 1);
    dot(img, x, y, 1.15, c[0] * s, c[1] * s, c[2] * s);
  }
}
