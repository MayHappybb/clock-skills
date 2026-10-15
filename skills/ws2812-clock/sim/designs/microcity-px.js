// Microcity: the shared 192x192 linear-light image and sub-pixel painters.
import { GW, GH, N } from './microcity-city.js';
export const img = new Float32Array(3 * N);

// ---------------------------------------------------------------- pixels
/** Add colour at sub-pixel (x, y), bilinear: things glide between LEDs. */
export function addPt(x, y, r, g, b) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  if (xi < -1 || yi < -1 || xi >= GW || yi >= GH) return;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  if (xi >= 0 && yi >= 0) { const p = 3 * (yi * GW + xi); img[p] += r * w00; img[p + 1] += g * w00; img[p + 2] += b * w00; }
  if (xi + 1 < GW && yi >= 0) { const p = 3 * (yi * GW + xi + 1); img[p] += r * w10; img[p + 1] += g * w10; img[p + 2] += b * w10; }
  if (xi >= 0 && yi + 1 < GH) { const p = 3 * ((yi + 1) * GW + xi); img[p] += r * w01; img[p + 1] += g * w01; img[p + 2] += b * w01; }
  if (xi + 1 < GW && yi + 1 < GH) { const p = 3 * ((yi + 1) * GW + xi + 1); img[p] += r * w11; img[p + 1] += g * w11; img[p + 2] += b * w11; }
}
/** Multiply (darken) at sub-pixel (x, y) by 1 - k: shadows. */
export function mulPt(x, y, k) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], os = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (let q = 0; q < 4; q++) {
    const X = xi + os[q][0], Y = yi + os[q][1];
    if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
    const p = 3 * (Y * GW + X), f = 1 - k * ws[q];
    img[p] *= f; img[p + 1] *= f; img[p + 2] *= f;
  }
}
/** Paint toward colour (r, g, b) by a at sub-pixel (x, y): opaque things. */
export function overPt(x, y, r, g, b, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  for (let q = 0; q < 4; q++) {
    const X = xi + (q & 1), Y = yi + (q >> 1);
    if (X < 0 || Y < 0 || X >= GW || Y >= GH) continue;
    const p = 3 * (Y * GW + X), w = Math.min(1, a * ws[q] * 1.8);
    img[p] += (r - img[p]) * w; img[p + 1] += (g - img[p + 1]) * w; img[p + 2] += (b - img[p + 2]) * w;
  }
}
