// Murmuration: the one-hue ramp. Ember amber, hue 25 deg: the colour of a
// winter sky ten minutes after the sun has gone. Nine named shades from the
// burnt-umber of a starling against the glow to the pale peach at the
// horizon, interpolated to 65 steps (same-hue colours mix on hue), and each
// step snapped to the RGB565 value nearest to hue 25 (the dark end of 565
// drifts toward red or olive if rounded blindly). Every pixel on the glass
// is one of these 65 values: the sky, the flock, the reeds, the falcon, the
// moon. In-between tones are an ordered dither between two neighbours.

import { from565 } from '../js/kit.js';

const HUE = 25;
// [name, value (max channel 0..1), saturation]
export const SHADES = [
  ['umber', 0.15, 0.86],    // starlings and silhouettes by day
  ['soot', 0.22, 0.84],     // the night sky's top
  ['burnt', 0.33, 0.80],    // the night horizon, the vignette
  ['rust', 0.48, 0.76],     // the high dusk sky
  ['ember', 0.66, 0.70],    // mid sky
  ['amber', 0.82, 0.60],    // low sky
  ['apricot', 0.94, 0.46],  // the afterglow band
  ['peach', 1.0, 0.30],     // the horizon; starlings' spangles by moonlight
  ['glow', 1.0, 0.13],      // the moon, the last of the sun
];

function hsvRGB(v, s) {
  // hue 25: r max, b min, g = b + (r - b) * 25/60
  const r = v * 255, b = r * (1 - s), g = b + (r - b) * (HUE / 60);
  return [r, g, b];
}

function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
  if (ch === 0) return [0, 0];
  let h;
  if (mx === r) h = ((g - b) / ch) % 6; else if (mx === g) h = (b - r) / ch + 2; else h = (r - g) / ch + 4;
  return [((h * 60) + 360) % 360, ch];
}

/** The RGB565 value nearest to (r, g, b) that keeps hue 25 (searching the 565 neighbours). */
function snap(r, g, b) {
  const r5 = (r * 31) / 255, g6 = (g * 63) / 255, b5 = (b * 31) / 255;
  let best = 0, bs = Infinity;
  for (let ri = Math.floor(r5) - 1; ri <= Math.ceil(r5) + 1; ri++)
    for (let gi = Math.floor(g6) - 2; gi <= Math.ceil(g6) + 2; gi++)
      for (let bi = Math.floor(b5) - 1; bi <= Math.ceil(b5) + 1; bi++) {
        if (ri < 0 || gi < 0 || bi < 0 || ri > 31 || gi > 63 || bi > 31) continue;
        const v = (ri << 11) | (gi << 5) | bi, c = from565(v);
        const cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
        const [h, ch] = hueOf(cr, cg, cb);
        let dh = Math.abs(h - HUE); if (dh > 180) dh = 360 - dh;
        const lum = Math.abs(cr - r) * 0.3 + Math.abs(cg - g) * 0.59 + Math.abs(cb - b) * 0.11;
        const score = lum + (ch >= 20 ? dh * 1.2 : 0) + (dh > 9 && ch >= 20 ? 400 : 0);
        if (score < bs) { bs = score; best = v; }
      }
  return best;
}

/** 65 RGB565 values: RAMP[v >> 2] for a value v in 0..256. */
export const RAMP = new Uint16Array(65);
{
  const n = SHADES.length - 1;
  for (let i = 0; i <= 64; i++) {
    const p = (i / 64) * n, k = Math.min(n - 1, Math.floor(p)), f = p - k;
    const a = hsvRGB(SHADES[k][1], SHADES[k][2]), b = hsvRGB(SHADES[k + 1][1], SHADES[k + 1][2]);
    RAMP[i] = snap(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }
}

/** The value (0..256) of a named shade. */
export const V = Object.fromEntries(SHADES.map(([nm], i) => [nm, Math.round((i / (SHADES.length - 1)) * 256)]));

/** 0xRRGGBB of a value, for the kit's own drawing calls (AA edges mix along the ramp). */
export const col = (v) => from565(RAMP[Math.max(0, Math.min(64, v >> 2))]);

/** 4x4 Bayer, scaled 0..3.75 in quarter steps of the ramp index (value units 0..15). */
export const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
