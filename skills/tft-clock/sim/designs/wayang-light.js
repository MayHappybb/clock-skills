// Wayang: the kelir (the cotton screen) and the blencong (the oil lamp).
//
// Every pixel on the glass is one of three things mixed: the cloth lit by
// the lamp (brightest in the pool under the flame, falling off to the
// screen's edges), the shadow of leather (the cloth with almost no light:
// a warm near-black), or the painted side of the leather glowing through
// where a puppet is pressed against the cloth (rawhide is translucent: the
// gold, red and indigo of the paint show as deep stained colours).
//
// So the frame is built from three small numbers per pixel: the lamp light
// L (0..31), the shadow density D (0..15) and the paint T (colour x level,
// 0..15), looked up in a colour table per tone of the screen (flash, 16 KB a
// tone). The tone follows the time of day: a pale cotton by day, the amber of
// the lamp in the evening, a low orange glow late at night, a cool grey at
// dawn.

import { to565 } from '../js/kit.js';

export const W = 160, H = 80;
export const NL = 32, ND = 16, NT = 16;

// screen colour at the edge (unlit) and in the lamp's pool, and the shadow's own colour
const TONES = {
  day: { edge: [92, 66, 40], pool: [252, 240, 208], shade: [26, 16, 10] },
  eve: { edge: [92, 44, 18], pool: [250, 214, 140], shade: [20, 10, 6] },
  night: { edge: [86, 40, 16], pool: [238, 168, 86], shade: [16, 8, 4] },
  dawn: { edge: [74, 64, 80], pool: [238, 222, 196], shade: [18, 14, 18] },
};
export const TONE_KEYS = Object.keys(TONES);
/** The tone of each hour: index into TONE_KEYS. */
export function toneOf(h) {
  if (h >= 23 || h < 5) return 2;
  if (h < 8) return 3;
  if (h < 18) return 0;
  return 1;
}

// the painted leather, as a colour filter on the lamp light
const FILTER = [null, [0.86, 0.6, 0.16], [0.8, 0.14, 0.08], [0.12, 0.3, 0.46]];

const mixc = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const pack = (c) => to565((Math.round(Math.min(255, Math.max(0, c[0]))) << 16) | (Math.round(Math.min(255, Math.max(0, c[1]))) << 8) | Math.round(Math.min(255, Math.max(0, c[2]))));

/** Screen colour at light level l (0..1): a gamma-ish ramp from the edge to the pool. */
function cloth(tone, l) {
  const u = Math.pow(l, 1.25);
  return mixc(tone.edge, tone.pool, u);
}

function buildLUT(tone) {
  const t = new Uint16Array(NL * ND * NT);
  for (let L = 0; L < NL; L++) {
    const l = L / (NL - 1), scr = cloth(tone, l);
    const shade = mixc(tone.shade, scr, 0.05);
    for (let T = 0; T < NT; T++) {
      const c = T >> 2, k = T & 3;
      let leather = shade;
      if (c > 0 && k > 0) {
        const f = FILTER[c], lit = [scr[0] * f[0] * 0.3, scr[1] * f[1] * 0.3, scr[2] * f[2] * 0.3];
        leather = mixc(shade, lit, k / 3);
      }
      for (let D = 0; D < ND; D++) t[(L << 8) | (D << 4) | T] = pack(mixc(scr, leather, D / (ND - 1)));
    }
  }
  return t;
}
export const LUTS = TONE_KEYS.map((k) => buildLUT(TONES[k]));

/** The colour of full shadow with paint (c, k) at light level L: for the parts drawn as shapes (arms, rods). */
export function leatherRGB(tone, L, T, D = ND - 1) {
  const v = LUTS[tone][(L << 8) | (D << 4) | T];
  return ((v >> 11) << 19) | (((v >> 5) & 63) << 10) | ((v & 31) << 3);
}

// ------------------------------------------------------------ the lamp's pool (flash: 176 x 80 bytes)

export const GW = W + 16;     // wider than the glass: the flame sways, the pool slides
export const LAMP_X = 80, LAMP_Y = 30;
export const GLOW = new Uint8Array(GW * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < GW; x++) {
    const dx = (x - 8 + 0.5 - LAMP_X) / 118, dy = (y + 0.5 - LAMP_Y) / 70;
    let v = 1 - Math.min(1, dx * dx + dy * dy) * 0.8;
    v = Math.max(0, v);
    // the kelir's border: the cloth is hemmed in dark at the top and bottom
    if (y < 2) v *= 0.35 + 0.3 * y;
    if (y >= H - 5) v *= 0.12;
    else if (y === H - 6) v *= 0.55;
    GLOW[y * GW + x] = Math.round(v * 255);
  }

export const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
