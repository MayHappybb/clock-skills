// Cyanotype: the paper and the chemistry. A sheet of watercolour paper,
// brushed with sensitiser by hand: the coated field has ragged ends where
// the brush started and lifted, dry-brush bristle streaks running out into
// the bare paper, faint horizontal brush streaks across it and a pooled,
// slightly deeper line where each stroke began. The paper's coat density
// is one byte map (COAT, flash).
//
// Every pixel on the glass is one number, the exposure (0 = paper white, 255
// = the deepest Prussian blue), looked up in one 64-step ramp: the tonal
// range a cyanotype has, from bare paper through the pale blues of a
// translucent frond to full exposure. Nothing else exists, so the digits,
// the specimens, the brush marks and every effect obey the medium.

import { noise, noise2, rand, hex, R, G, B, to565 } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ the ramp
// exposure -> colour: bare paper, the pale wash of a thin frond, the mid
// blues of a partial exposure, Prussian blue. A night ramp keeps the same
// steps on a darker sheet.
const DAY = [[0, '#f3f0e6'], [0.1, '#e4e9ea'], [0.26, '#b4cadc'], [0.45, '#7499c4'], [0.64, '#3f6ca8'], [0.8, '#24508e'], [0.92, '#173f7a'], [1, '#10316a']];
const NIGHT = [[0, '#a8b9c9'], [0.12, '#93a9bf'], [0.3, '#6987ab'], [0.5, '#3d5f8e'], [0.68, '#244673'], [0.84, '#16335d'], [1, '#0d2449']];
function ramp(stops) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const u = i / 63;
    let k = 1;
    while (k < stops.length - 1 && stops[k][0] < u) k++;
    const [p0, c0] = stops[k - 1], [p1, c1] = stops[k], f = Math.min(1, Math.max(0, (u - p0) / (p1 - p0)));
    const a = hex(c0), b = hex(c1);
    out.push([R(a) + (R(b) - R(a)) * f, G(a) + (G(b) - G(a)) * f, B(a) + (B(b) - B(a)) * f]);
  }
  return out;
}
const RD = ramp(DAY), RN = ramp(NIGHT);
export const PAL = new Uint16Array(65);   // [64] repeats [63], so full exposure never dithers
let palNight = -1;
/** Fill PAL for this night level (64 mixes; only when the level changes). */
export function palette(night) {
  const q = Math.round(night * 32);
  if (q === palNight) return 0;
  palNight = q;
  const f = q / 32;
  for (let i = 0; i < 64; i++) {
    const a = RD[i], b = RN[i];
    const r = a[0] + (b[0] - a[0]) * f, g = a[1] + (b[1] - a[1]) * f, bl = a[2] + (b[2] - a[2]) * f;
    PAL[i] = to565((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl));
  }
  PAL[64] = PAL[63];
  return 64;
}

// ------------------------------------------------------------ the coated sheet

export const COAT = new Uint8Array(N);
{
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    // each row is brushed left to right; the brush starts and lifts at a ragged place
    const band = Math.floor(y / 3);
    const xl = 3.5 + 2.2 * noise(y * 0.31, 11) + 1.5 * rand(band, 1);
    const xr = 156 - 2.2 * noise(y * 0.29, 12) - 1.5 * rand(band, 2);
    // bristle streaks run on past the ends, thinning out
    const runL = rand(y, 3) < 0.35 ? 2 + 5 * rand(y, 4) : 0, runR = rand(y, 5) < 0.4 ? 2 + 7 * rand(y, 6) : 0;
    for (let x = 0; x < W; x++) {
      const yt = 2.2 + 1.6 * noise(x * 0.13, 13) + (rand(Math.floor(x / 2), 7) < 0.12 ? 1 : 0);
      const yb = 77.4 - 1.6 * noise(x * 0.12, 14) - (rand(Math.floor(x / 2), 8) < 0.12 ? 1 : 0);
      let c = sm(xl - 0.6, xl + 0.6, x + 0.5) * (1 - sm(xr - 0.6, xr + 0.6, x + 0.5));
      if (runL && x + 0.5 < xl) c = Math.max(c, (1 - (xl - x - 0.5) / runL) * 0.75 * (rand(x, y, 9) < 0.8 ? 1 : 0.4));
      if (runR && x + 0.5 > xr) c = Math.max(c, (1 - (x + 0.5 - xr) / runR) * 0.7 * (rand(x, y, 10) < 0.8 ? 1 : 0.4));
      c *= sm(yt - 0.7, yt + 0.7, y + 0.5) * (1 - sm(yb - 0.7, yb + 0.7, y + 0.5));
      if (c <= 0) { COAT[y * W + x] = 0; continue; }
      // inside: horizontal brush streaks, a pooled start, dry-brush gaps near the top and bottom, grain
      let d = 0.9 + 0.07 * (noise2(x / 26, y / 1.7, 15) - 0.5) * 2 + 0.03 * (noise2(x / 7, y / 3, 16) - 0.5) * 2;
      if (x + 0.5 > xl && x + 0.5 < xl + 2.5) d += 0.06;
      const edge = Math.min(y + 0.5 - yt, yb - y - 0.5);
      if (edge < 4 && noise2(x / 9, y / 0.9, 17) < 0.3) d -= 0.18 * (1 - edge / 4);
      d += (rand(x, y, 18) - 0.5) * 0.035;
      COAT[y * W + x] = Math.round(Math.min(1, Math.max(0, c * d)) * 255);
    }
  }
}

// ------------------------------------------------------------ the light: dappled sun through the tide pool
// two tileable soft patterns drift across each other; the exposure follows
export const TS = 64;
function tile(seed, cells) {
  const t = new Uint8Array(TS * TS), c = TS / cells;
  const v = (i, j) => rand(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const fx = x / c, fy = y / c, ix = Math.floor(fx), iy = Math.floor(fy);
    const ux = (fx - ix) ** 2 * (3 - 2 * (fx - ix)), uy = (fy - iy) ** 2 * (3 - 2 * (fy - iy));
    const a = v(ix, iy), b = v(ix + 1, iy), cc = v(ix, iy + 1), d = v(ix + 1, iy + 1);
    const n = a + (b - a) * ux + (cc - a) * uy + (a - b - cc + d) * ux * uy;
    // ridged: thin bright lines along the pattern's contours, a caustic net
    t[y * TS + x] = Math.round((1 - Math.abs(n * 2 - 1)) ** 7 * 255);
  }
  return t;
}
export const T1 = tile(21, 4), T2 = tile(22, 5);

/** 4x4 ordered dither, 0..15 scaled to 0..240 */
export const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 16));

/** Static jitter per row: makes vertical wash edges ragged like a brush's. */
export const JIT = Int8Array.from({ length: H }, (_, y) => Math.round((noise(y * 0.45, 31) - 0.5) * 5 + (rand(y, 32) - 0.5) * 1.6));
