// datamosh: the keyframe (the I-frame), built the way a cheap encoder would.
//
// An ideal picture is painted (a tileable colour field for the hour, the
// time in the macroblock numerals of datamosh-font.js), converted to YCbCr,
// and compressed: luma in 4 x 4 blocks through a DCT with a coarse
// quantiser, chroma subsampled 2 x 2 and quantised harder. What comes back
// is the decoded keyframe: blocking, ringing round the strokes and blocky
// colour fringes are real compression artefacts, not drawn ones.
//
// Built once per minute (cached on the minute). On the device it would be
// built for the next minute a block row per frame; datamosh.js bills that
// share to every frame.

import { rand } from '../js/kit.js';
import { MB, BW, BH, GW, GH, GLYPH, SLOT_X, SLOT_Y, COLON } from './datamosh-font.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ palettes

const hx = (s) => parseInt(s.replace('#', ''), 16);
/** By time of day: a field ramp (dark to light) and the numerals' ink, top to foot. */
const SCHEMES = [
  { from: 23, bg: ['#07061a', '#1d0e46', '#4b1670', '#0f5a6c', '#6a2a8a'], ink: ['#eef6ff', '#a8e0ff'] },  // night
  { from: 5, bg: ['#1a0c2c', '#5a1a4c', '#a8344e', '#e0704a', '#5a2a6a'], ink: ['#fff6ec', '#ffc8a8'] },   // dawn
  { from: 8, bg: ['#041c2c', '#0a4a64', '#127c80', '#58b05a', '#1a3a7a'], ink: ['#fbfff0', '#d8ff90'] },   // morning
  { from: 12, bg: ['#0c1048', '#2234a8', '#a02a90', '#f0623a', '#1a7ab0'], ink: ['#fffbf2', '#ffe08a'] },  // day
  { from: 16, bg: ['#220828', '#6c1446', '#c8382e', '#f09a2a', '#5a1a5a'], ink: ['#fff4e0', '#ffd060'] },  // dusk
  { from: 19, bg: ['#050822', '#14205e', '#6a208c', '#c83a72', '#0e4a7a'], ink: ['#f4f0ff', '#ff9ad8'] },  // evening
].map((s) => ({ ...s, bg: s.bg.map(hx), ink: s.ink.map(hx) }));

export function schemeOf(h) {
  if (h >= 23 || h < 5) return 0;
  if (h < 8) return 1;
  if (h < 12) return 2;
  if (h < 16) return 3;
  if (h < 19) return 4;
  return 5;
}

// ------------------------------------------------------------ the DCT

const DCT = new Float32Array(16);
for (let k = 0; k < 4; k++) for (let n = 0; n < 4; n++) DCT[k * 4 + n] = (k === 0 ? 0.5 : Math.SQRT1_2) * Math.cos(((2 * n + 1) * k * Math.PI) / 8);
/** Quantiser step per coefficient (u, v), before the quality scale: coarser at high frequency. */
const QW = Float32Array.from({ length: 16 }, (_, i) => 1 + 0.9 * ((i >> 2) + (i & 3)) + 0.25 * (i >> 2) * (i & 3));

/** Basis image (u, v) at (x, y) of a 4 x 4 block, -1..1: the garbage blocks show these. */
export const basis = (u, v, x, y) => 2 * DCT[u * 4 + x] * DCT[v * 4 + y];

const tmp = new Float32Array(16), co = new Float32Array(16);
/** Compress the 4 x 4 blocks of a plane (w x h floats) in place with quality step q. */
function codePlane(p, w, h, q) {
  for (let by = 0; by < h; by += 4)
    for (let bx = 0; bx < w; bx += 4) {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) tmp[y * 4 + x] = p[(by + y) * w + bx + x];
      // forward: co = D * X * D^T
      for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
        let s = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) s += DCT[v * 4 + y] * DCT[u * 4 + x] * tmp[y * 4 + x];
        const st = q * QW[v * 4 + u];
        co[v * 4 + u] = Math.round(s / st) * st;
      }
      // inverse: X = D^T * co * D
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        let s = 0;
        for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) s += DCT[v * 4 + y] * DCT[u * 4 + x] * co[v * 4 + u];
        p[(by + y) * w + bx + x] = s;
      }
    }
}

// ------------------------------------------------------------ the picture

/** Tileable value noise: lattice nx x ny over the screen, wrapping. */
function tile(x, y, nx, ny, seed) {
  const fx = (x / W) * nx, fy = (y / H) * ny;
  const ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
  const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
  const r = (i, j) => rand(((i % nx) + nx) % nx, ((j % ny) + ny) % ny, seed);
  const a = r(ix, iy), b = r(ix + 1, iy), c = r(ix, iy + 1), d = r(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function ramp(stops, u) {
  const n = stops.length - 2;                    // the last stop is the accent
  u = u < 0 ? 0 : u > 0.999 ? 0.999 : u;
  const f = u * n, i = Math.floor(f), t = f - i;
  const a = stops[i], b = stops[i + 1];
  return [((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, (a & 255) * (1 - t) + (b & 255) * t];
}

/** Which glyph cell (0-3), and the block's role there, for every macroblock. */
export function blockMap(digits) {
  const role = new Uint8Array(BW * BH), slot = new Int8Array(BW * BH).fill(-1);
  for (let s = 0; s < 4; s++) {
    const gl = GLYPH[digits[s]];
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const b = (SLOT_Y + j) * BW + SLOT_X[s] + i;
      slot[b] = s; role[b] = gl[j * GW + i];
    }
  }
  for (const [cx, cy] of COLON) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) role[(cy + j) * BW + cx + i] = 1;
  return { role, slot };
}

const cache = new Map();

/**
 * The decoded keyframe for hour h showing `digits` ([h1, h2, m1, m2]).
 * Y 0..255, U and V about -128..127 per pixel; K565 the picture as stored;
 * role / slot per macroblock; DC the per-block mean (progressive decode).
 */
export function keyframe(h, digits, seed) {
  const key = `${h}|${digits.join('')}|${seed}`;
  let k = cache.get(key);
  if (k) return k;
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  const sc = SCHEMES[schemeOf(h)];
  const { role, slot } = blockMap(digits);
  const Yp = new Float32Array(N), Uf = new Float32Array(N), Vf = new Float32Array(N);
  const ink0 = sc.ink[0], ink1 = sc.ink[1];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const b = (y >> 2) * BW + (x >> 2);
      let r, g, bl;
      if (role[b] === 1) {
        // ink: a vertical ramp through the glyph's height, with a lit edge on the left
        const top = slot[b] >= 0 ? SLOT_Y * MB : COLON[0][1] * MB;
        const u = Math.min(1, Math.max(0, (y - top) / (GH * MB)));
        r = ((ink0 >> 16) & 255) * (1 - u) + ((ink1 >> 16) & 255) * u;
        g = ((ink0 >> 8) & 255) * (1 - u) + ((ink1 >> 8) & 255) * u;
        bl = (ink0 & 255) * (1 - u) + (ink1 & 255) * u;
      } else {
        const n = 0.62 * tile(x, y, 8, 4, seed) + 0.28 * tile(x, y, 20, 10, seed + 1) + 0.1 * tile(x, y, 40, 20, seed + 2);
        [r, g, bl] = ramp(sc.bg, n * 1.25 - 0.12);
        // a few accent veins where the coarse field crosses a level
        const v = tile(x, y, 10, 5, seed + 3);
        if (v > 0.48 && v < 0.53) {
          const a = sc.bg[sc.bg.length - 1];
          r = r * 0.3 + ((a >> 16) & 255) * 0.7; g = g * 0.3 + ((a >> 8) & 255) * 0.7; bl = bl * 0.3 + (a & 255) * 0.7;
        }
      }
      const i = y * W + x, Y = 0.299 * r + 0.587 * g + 0.114 * bl;
      Yp[i] = Y; Uf[i] = (bl - Y) * 0.564; Vf[i] = (r - Y) * 0.713;
    }
  codePlane(Yp, W, H, 9);
  // chroma 4:2:0, then coded harder
  const cw = W / 2, ch = H / 2, Uc = new Float32Array(cw * ch), Vc = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = 2 * y * W + 2 * x;
    Uc[y * cw + x] = (Uf[i] + Uf[i + 1] + Uf[i + W] + Uf[i + W + 1]) / 4;
    Vc[y * cw + x] = (Vf[i] + Vf[i + 1] + Vf[i + W] + Vf[i + W + 1]) / 4;
  }
  codePlane(Uc, cw, ch, 7); codePlane(Vc, cw, ch, 7);
  const Y = new Int16Array(N), U = new Int16Array(N), V = new Int16Array(N), K565 = new Uint16Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = (y >> 1) * cw + (x >> 1);
    Y[i] = clamp(Math.round(Yp[i]), 0, 255); U[i] = clamp(Math.round(Uc[c]), -128, 127); V[i] = clamp(Math.round(Vc[c]), -128, 127);
    K565[i] = yuv565(Y[i], U[i], V[i]);
  }
  const DC = new Uint16Array(BW * BH);
  for (let b = 0; b < BW * BH; b++) {
    const x0 = (b % BW) * MB, y0 = ((b / BW) | 0) * MB;
    let sy = 0, su = 0, sv = 0;
    for (let j = 0; j < MB; j++) for (let i = 0; i < MB; i++) { const p = (y0 + j) * W + x0 + i; sy += Y[p]; su += U[p]; sv += V[p]; }
    DC[b] = yuv565(sy >> 4, su >> 4, sv >> 4);
  }
  k = { Y, U, V, K565, DC, role, slot };
  cache.set(key, k);
  return k;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Integer YCbCr (full range) to RGB565: what the per-pixel loop does. */
export function yuv565(y, u, v) {
  let r = y + ((359 * v) >> 8), g = y - ((88 * u + 183 * v) >> 8), b = y + ((454 * u) >> 8);
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}
