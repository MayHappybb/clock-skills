// Breakout's raster: additive drawing into one 64 x 192 linear-light image,
// with sub-pixel rectangles, dots and sprites (coverage, so things glide).
import * as kit from '../js/kit.js';
import { W, H } from './breakout-sim.js';

export const img = new Float32Array(3 * W * H);

/** Add colour c * a, covering the rectangle [x0, x1) x [y0, y1) with area coverage. */
export function rect(x0, y0, x1, y1, c, a = 1) {
  if (x1 <= x0 || y1 <= y0) return;
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1) - 1);
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1) - 1);
  for (let y = ya; y <= yb; y++) {
    const cy = Math.min(y + 1, y1) - Math.max(y, y0);
    if (cy <= 0) continue;
    for (let x = xa; x <= xb; x++) {
      const cx = Math.min(x + 1, x1) - Math.max(x, x0);
      if (cx <= 0) continue;
      const k = a * cx * cy, o = 3 * (y * W + x);
      img[o] += c[0] * k; img[o + 1] += c[1] * k; img[o + 2] += c[2] * k;
    }
  }
}

/** A soft round dot at (x, y) (pixel units, pixel centres at +0.5), radius r. */
export function dot(x, y, r, c, a = 1) {
  const xa = Math.max(0, Math.floor(x - r)), xb = Math.min(W - 1, Math.floor(x + r));
  const ya = Math.max(0, Math.floor(y - r)), yb = Math.min(H - 1, Math.floor(y + r));
  const ir2 = 1 / (r * r);
  for (let py = ya; py <= yb; py++) {
    const dy = py + 0.5 - y;
    for (let px = xa; px <= xb; px++) {
      const dx = px + 0.5 - x, q = (dx * dx + dy * dy) * ir2;
      if (q >= 1) continue;
      const f = a * (1 - q) * (1 - q), o = 3 * (py * W + px);
      img[o] += c[0] * f; img[o + 1] += c[1] * f; img[o + 2] += c[2] * f;
    }
  }
}

/** A sprite (rgb Float32Array sw x sh) added at fractional (x, y): bilinear split. */
export function sprite(spr, sw, sh, x, y, a = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = [(1 - fx) * (1 - fy) * a, fx * (1 - fy) * a, (1 - fx) * fy * a, fx * fy * a];
  for (let j = 0; j < sh; j++) {
    for (let i = 0; i < sw; i++) {
      const s = 3 * (j * sw + i);
      const r = spr[s], g = spr[s + 1], b = spr[s + 2];
      if (r + g + b === 0) continue;
      for (let k = 0; k < 4; k++) {
        const X = xi + i + (k & 1), Y = yi + j + (k >> 1);
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const o = 3 * (Y * W + X);
        img[o] += r * w[k]; img[o + 1] += g * w[k]; img[o + 2] += b * w[k];
      }
    }
  }
}

/** Build a sprite from strings and a palette { ch: [r, g, b] }; mask(i, j) may veto pixels. */
export function makeSprite(rows, pal, mask) {
  const sh = rows.length, sw = rows[0].length, spr = new Float32Array(3 * sw * sh);
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = pal[ch];
    if (!c || (mask && !mask(i, j))) return;
    spr.set(c, 3 * (j * sw + i));
  }));
  return { spr, sw, sh };
}
