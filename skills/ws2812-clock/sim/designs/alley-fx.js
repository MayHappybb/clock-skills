// Alley weather: rain streaks with splashes and puddle ripples, drips off the
// signs, vent steam, lightning. All closed-form in time: no state.
import * as kit from '../js/kit.js';
import { W, H, GROUND, PINK, CYAN, FLASH } from './alley-scene.js';

/** Add colour c * a at fractional (x, y), split over four pixels. */
export function addB(img, idx, x, y, c, a) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= W) continue;
      const p = yy * W + xx;
      if (idx[p] < 0) continue;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * a;
      img[3 * p] += c[0] * w; img[3 * p + 1] += c[1] * w; img[3 * p + 2] += c[2] * w;
    }
  }
}
function addR(rip, x, y, a) {   // ripple height map, street rows only
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = x0 + i, yy = y0 + j;
    if (xx < 0 || xx >= W || yy < GROUND || yy >= H) continue;
    rip[yy * W + xx] += (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * a;
  }
}
function ring(rip, wet, x, y, r, a) {
  if (y < GROUND || y >= H || wet[Math.floor(y) * W + Math.max(0, Math.min(W - 1, Math.floor(x)))] < 0.45) return;
  const n = Math.max(8, Math.ceil(r * 3));
  for (let k = 0; k < n; k++) { const t = (k / n) * kit.TAU; addR(rip, x + r * Math.cos(t), y + 0.3 * r * Math.sin(t), a); }
}

/** Light falling at (x, y): what tints rain and drips. */
export function lightAt(M, L, x, y) {
  const p = Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)));
  const b = L.b * M.mB[p], m = L.m * M.mM[p], f = L.f * M.mF[p];
  return [PINK[0] * b + CYAN[0] * m + FLASH[0] * f, PINK[1] * b + CYAN[1] * m + FLASH[1] * f, PINK[2] * b + CYAN[2] * m + FLASH[2] * f];
}

const NRAIN = 210, SLANT = 0.24, PAD = 150;
/** Ripples first (they bend the reflections), then streaks and splashes are added on top. */
export function rain(img, idx, rip, M, L, now, k, drawStreaks) {
  for (let i = 0; i < NRAIN; i++) {
    const h1 = kit.hash(i, 1), h2 = kit.hash(i, 2), h3 = kit.hash(i, 3);
    const v = 165 + 75 * h1, yEnd = GROUND + 1 + h2 * 22.5, span = yEnd + 24 + PAD, T = span / v;
    const u = now / T + h3, c = Math.floor(u), yh = -24 + (u - c) * span;
    const xh = kit.hash(i, c, 9) * (W + 34) - 26 + yh * SLANT;
    if (yh <= yEnd) {
      if (!drawStreaks) continue;
      const len = 4 + 5 * h2 * h2 + 2 * h1, lt = lightAt(M, L, xh, yh);
      const col = [0.3 + lt[0] * 1.2, 0.33 + lt[1] * 1.2, 0.42 + lt[2] * 1.2];
      for (let m = 0; m < 6; m++) addB(img, idx, xh - len * SLANT * m / 5, yh - len * m / 5, col, k * (1 - m / 6.5));
    } else {
      const tl = (yh - yEnd) / v, xl = xh - (yh - yEnd) * SLANT;
      if (!drawStreaks) { if (tl < 0.85) ring(rip, M.wet, xl, yEnd, 0.6 + 9 * tl, 0.55 * (1 - tl / 0.85) ** 2); continue; }
      if (tl < 0.22) {            // crown: two droplets thrown up and out
        const q = tl / 0.22, hgt = 2.6 * Math.sin(Math.PI * q) * (0.5 + h1), a = k * 0.35 * (1 - q);
        const lt = lightAt(M, L, xl, yEnd), col = [0.12 + lt[0], 0.13 + lt[1], 0.16 + lt[2]];
        addB(img, idx, xl - 2 * q, yEnd - hgt, col, a);
        addB(img, idx, xl + 2 * q, yEnd - hgt * 0.8, col, a);
      }
    }
  }
}

// drips: x, edge y; bead grows on the edge, lets go, falls, splashes
const DRIPS = [[14, 98], [27.5, 98], [45, 98], [70, 100], [88.5, 100], [107, 100], [121, 100], [58.5, 42], [4, 98]];
export function drips(img, idx, rip, M, L, now, k, drawThem) {
  DRIPS.forEach(([x, y0], i) => {
    const T = 2.1 + 1.9 * kit.hash(i, 21), u = kit.fract(now / T + kit.hash(i, 22)), tf = (u - 0.7) * T;
    const yGround = GROUND + 1.5 + 2.5 * kit.hash(i, 23), y = y0 + 0.5 + 0.5 * 330 * Math.max(0, tf) ** 2;
    const lt = lightAt(M, L, x, Math.min(y, H - 1)), col = [0.18 + lt[0] * 1.4, 0.2 + lt[1] * 1.4, 0.24 + lt[2] * 1.4];
    if (y < yGround) {
      if (!drawThem) return;
      const a = tf < 0 ? 0.25 + 0.55 * (u / 0.7) ** 2 : 0.9;
      addB(img, idx, x, y, col, k * a);
      if (tf > 0) addB(img, idx, x, y - 1.6, col, k * 0.3);
    } else {
      const tl = Math.sqrt((2 * (yGround - y0)) / 330), ts = tf - tl;   // seconds since it hit
      if (!drawThem) { if (ts < 1) ring(rip, M.wet, x, yGround, 0.8 + 10 * ts, 0.8 * (1 - ts) ** 2); return; }
      if (ts < 0.25) for (const s of [-1, 1]) addB(img, idx, x + s * 2.4 * ts / 0.25, yGround - 2.5 * Math.sin(Math.PI * ts / 0.25), col, k * 0.4 * (1 - ts / 0.25));
    }
  });
}

/** Steam out of the vent grate at street level, rising up the wall, lit by whatever shines on it. */
export function steam(img, idx, M, L, now, k) {
  const puff = 0.65 + 0.35 * Math.sin(now * 0.8) * Math.sin(now * 0.37 + 1);
  for (let y = 46; y < 99; y++) {
    const h = (99 - y) / 53, xc = 4 + 5 * h + 1.6 * Math.sin(now * 0.6 + h * 3.2), w = 2.2 + 6.5 * h;
    for (let x = 0; x < 18; x++) {
      const e = 1 - Math.abs(x - xc) / w;
      if (e <= 0) continue;
      const n = kit.noise3(x * 0.27, y * 0.2 + now * 1.15, now * 0.25);
      const d = (1 - h) ** 1.3 * e * kit.smoothstep(0.3, 0.8, n) * puff * (x > 9 ? 0.55 : 1) * k;
      if (d <= 0.004) continue;
      const p = y * W + x, lt = lightAt(M, L, x, y);
      img[3 * p] += d * (0.1 + lt[0] * 0.9); img[3 * p + 1] += d * (0.11 + lt[1] * 0.9); img[3 * p + 2] += d * (0.15 + lt[2] * 0.9);
    }
  }
}

/** Lightning: the hour's storm strike, its rumble before, and rare distant sheet lightning. */
export function flash(now) {
  const M = Math.floor(now / 60) * 60;
  let f = 0;
  const ev = (te, amp, dec) => { const t = now - te; if (t >= 0 && t < 3) f += amp * Math.exp(-t / dec) * (1 - Math.exp(-t / 0.012)); };
  for (const m of [M, M + 60]) {
    const d = new Date(m * 1000);
    if (d.getMinutes() === 0) {
      ev(m - 2.7, 0.14, 0.1); ev(m - 1.35, 0.26, 0.13); ev(m - 1.2, 0.12, 0.1);
      ev(m, 1.1, 0.06); ev(m + 0.15, 0.9, 0.2); ev(m + 0.5, 0.35, 0.3);
    }
  }
  const h = kit.hash(M / 60, 77);
  if (h < 0.3 && new Date(M * 1000).getMinutes() !== 0) { const te = M + 12 + 36 * kit.hash(M / 60, 78); ev(te, 0.12, 0.09); ev(te + 0.2, 0.08, 0.15); }
  return f * (0.75 + 0.25 * kit.hash(Math.floor(now * 45), 5));
}
