// Cracktro effects: the demo's background "parts", all pure 1-bit into a
// byte mask (1 = ink). Each returns the work it did (pixels scanned, for
// the estimate). Every effect is a closed form of the time `t` (seconds),
// so any frame can be built cold.
//
//   0 STARFIELD     three parallax layers streaming left; the kick warps them
//   1 PLASMA        four sine tables summed, banded, through an ordered dither
//   2 TUNNEL        a tunnel of checkered rings (1/d depth and angle tables)
//   3 ROTOZOOMER    a checker plane spinning and zooming (16.16 fixed point)
// Densities are kept low (under ~10 % ink) so the logo stays the strongest read.

import { sin, cos, hash } from '../js/kit.js';

const W = 160, H = 80;
export const PART_NAMES = ['STARFIELD', 'PLASMA', 'TUNNEL', 'ROTOZOOMER'];

/** The 4x4 ordered-dither thresholds, 0..15. */
export const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

// ------------------------------------------------------------ starfield

const STARS = 72;
const SX = new Float32Array(STARS), SY = new Uint8Array(STARS), SL = new Uint8Array(STARS);
for (let i = 0; i < STARS; i++) {
  SX[i] = hash(i, 1) % 176; SY[i] = hash(i, 2) % H; SL[i] = i % 3;
}
const SPEED = [15, 30, 60];   // px/s: a quarter, a half and one pixel per frame

/** `warp` is the distance (in seconds of extra travel) the kicks have added; `kick` 0..1 now. */
function starfield(M, t, warp, kick) {
  let ops = 0;
  for (let i = 0; i < STARS; i++) {
    const l = SL[i], v = SPEED[l];
    let x = (SX[i] - v * (t + warp * (l + 1))) % 176;
    if (x < 0) x += 176;
    x = (x | 0) - 8;
    const y = SY[i], len = l === 0 ? 1 : l === 1 ? 2 : 3 + ((kick * 6) | 0) * (l - 1);
    const row = y * W;
    for (let k = 0; k < len; k++) {
      const xx = x + k;
      if (xx >= 0 && xx < W) M[row + xx] = 1;
    }
    ops += len + 4;
  }
  return ops;
}

// ------------------------------------------------------------ plasma

const PT = new Uint8Array(256);
for (let i = 0; i < 256; i++) PT[i] = Math.round(31.5 + 31.5 * Math.sin((i / 256) * Math.PI * 2));
// the summed value (0..252) to a dither level: thin iso-lines at a wide
// spacing, and a 1/16 dust in alternate bands: a sparse 1-bit plasma
const PBAND = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  const p = v % 56;
  PBAND[v] = p === 0 ? 16 : (((v / 56) | 0) & 1) ? 1 : 0;
}

function plasma(M, t) {
  const a = (t * 37) & 255, b = (t * -53) & 255, c = (t * 29) & 255, d = (t * 61) & 255;
  for (let y = 0; y < H; y++) {
    const ry = PT[(y * 4 + b) & 255], row = y * W, by = (y & 3) << 2;
    for (let x = 0; x < W; x++) {
      const v = PT[(x * 2 + a) & 255] + ry + PT[((x + y) * 2 + c) & 255] + PT[((x - y * 2) + d) & 255];
      if (BAYER[by | (x & 3)] < PBAND[v]) M[row + x] = 1;
    }
  }
  return W * H * 7;
}

// ------------------------------------------------------------ tunnel

// One quadrant of depth (1/d) and angle, |dx| 0..160 by |dy| 0..80: flash tables.
const QW = 161, QH = 81;
const DEPTH = new Uint16Array(QW * QH), ANG = new Uint8Array(QW * QH);
for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
  const d = Math.hypot(x, y * 1.15);
  DEPTH[y * QW + x] = Math.min(4095, Math.round(1400 / (d + 0.5)));
  ANG[y * QW + x] = Math.round((Math.atan2(y, x) / (Math.PI / 2)) * 64) & 255;
}

function tunnel(M, t) {
  const cx = (80 + 34 * sin(t * 0.61)) | 0, cy = (40 + 14 * sin(t * 0.93 + 1)) | 0;
  const zoom = (t * 48) | 0, rot = (t * 22) | 0;
  for (let y = 0; y < H; y++) {
    const dy = y - cy, ady = dy < 0 ? -dy : dy, row = y * W, by = (y & 3) << 2;
    for (let x = 0; x < W; x++) {
      const dx = x - cx, adx = dx < 0 ? -dx : dx, q = ady * QW + adx;
      const dep = DEPTH[q];
      if (dep > 700) continue;                   // the vanishing point: left dark
      let a = ANG[q];
      if (dx < 0) a = 128 - a;
      if (dy < 0) a = 256 - a;
      const z = dep + zoom;
      const ring = (z & 63) === 0;
      const cell = ((z >> 6) ^ ((a + rot) >> 5)) & 1;
      if (ring || (cell && BAYER[by | (x & 3)] < 1)) M[row + x] = 1;
    }
  }
  return W * H * 9;
}

// ------------------------------------------------------------ rotozoomer

// A flat checkerboard plane spinning and zooming about a wandering centre:
// solid grid lines and a sparse dither in alternate squares, stepped per
// pixel in 16.16 fixed point (two adds a pixel, as on the Amiga).
function rotozoom(M, t) {
  const a = t * 0.45, k = 1.1 + 0.45 * sin(t * 0.37);
  const c = cos(a) / k, s = sin(a) / k;
  const du = (c * 65536) | 0, dv = (s * 65536) | 0;
  const ox = 80 + 20 * sin(t * 0.29), oy = 38;
  const pu = t * 9, pv = t * 5;   // the plane also drifts
  for (let y = 0; y < H; y++) {
    const dy = y - oy, row = y * W, by = (y & 3) << 2;
    let u = (((-ox * c - dy * s) + pu) * 65536) | 0, v = (((-ox * s + dy * c) + pv) * 65536) | 0;
    for (let x = 0; x < W; x++) {
      const iu = u >> 16, iv = v >> 16;
      if ((iu & 31) === 0 || (iv & 31) === 0 || ((((iu ^ iv) >> 5) & 1) && BAYER[by | (x & 3)] < 1)) M[row + x] = 1;
      u += du; v += dv;
    }
  }
  return W * H * 6;
}

// ------------------------------------------------------------ copper bars

const COPPER = [1, 2, 4, 6, 4, 2, 1];   // no solid row: a raster, never a stroke
/** One copper bar centred on row yc, dithered by row: the 1-bit raster bar. */
export function copper(M, yc) {
  let n = 0;
  for (let k = 0; k < COPPER.length; k++) {
    const y = yc - 3 + k;
    if (y < 0 || y >= H) continue;
    const d = COPPER[k], row = y * W, by = (y & 3) << 2;
    for (let x = 0; x < W; x++) if (BAYER[by | (x & 3)] < d) M[row + x] = 1;
    n += W;
  }
  return n * 2;
}

export function background(M, part, t, warp, kick) {
  switch (part) {
    case 0: return starfield(M, t, warp, kick);
    case 1: return plasma(M, t);
    case 2: return tunnel(M, t);
    default: return rotozoom(M, t);
  }
}
