// Colour. Designs name colours as 24-bit numbers, 0xRRGGBB, the sRGB values
// people pick colours in. The frame buffer holds RGB565: 5 bits of red, 6 of
// green, 5 of blue, 65,536 colours. Every write rounds to that, so a colour
// you ask for and the colour on the glass can differ by up to half a step:
// 4 levels (of 255) in red and blue, 2 in green.
//
// Blends happen on the sRGB numbers, the way C on the MCU does them (cheap
// integer maths on the stored values), not in linear light. That is what the
// device will show, so the simulator does the same.

/** 0xRRGGBB from 0..255 channels. */
export const rgb = (r, g, b) => ((clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)) >>> 0;

/** 0xRRGGBB from '#rgb', '#rrggbb' or 'rrggbb'. */
export function hex(s) {
  let h = String(s).replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(v)) throw new Error(`bad colour '${s}'`);
  return v >>> 0;
}

export const R = (c) => (c >>> 16) & 255;
export const G = (c) => (c >>> 8) & 255;
export const B = (c) => c & 255;

function clamp8(v) { return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v); }

/** Nearest RGB565 value to a 0xRRGGBB colour. */
export function to565(c) {
  const r = ((R(c) * 31 + 127) / 255) | 0, g = ((G(c) * 63 + 127) / 255) | 0, b = ((B(c) * 31 + 127) / 255) | 0;
  return (r << 11) | (g << 5) | b;
}

/** The 0xRRGGBB a stored RGB565 value stands for (bits replicated into the low end). */
export function from565(v) {
  const r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
  return ((((r << 3) | (r >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | ((b << 3) | (b >> 2))) >>> 0;
}

/** 4x4 Bayer thresholds, 0..15. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * RGB565 for 0..255 channel values with an ordered dither at pixel (x, y):
 * between two representable levels, the fraction of pixels that round up
 * follows the value, so a smooth ramp becomes a fine, stable pattern instead
 * of bands. Channels may carry fractions.
 */
export function dither565(r, g, b, x, y) {
  const t = (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  const q = (v, n) => { const s = (v <= 0 ? 0 : v >= 255 ? 255 : v) * n / 255; const k = Math.floor(s + t); return k > n ? n : k; };
  return (q(r, 31) << 11) | (q(g, 63) << 5) | q(b, 31);
}

/** Mix a towards b by u (0..1), per channel, on the sRGB numbers. */
export function mix(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  return rgb(R(a) + (R(b) - R(a)) * u, G(a) + (G(b) - G(a)) * u, B(a) + (B(b) - B(a)) * u);
}

/** Scale a colour's channels by k (0..1 darkens, >1 brightens, clamped). */
export const scale = (c, k) => rgb(R(c) * k, G(c) * k, B(c) * k);

/** 0xRRGGBB from hue (degrees), saturation and value (0..1). */
export function hsv(h, s = 1, v = 1) {
  h = ((h % 360) + 360) % 360 / 60;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return rgb(r * 255, g * 255, b * 255);
}

/** 'rrggbb' for a colour, for reports. */
export const hexOf = (c) => (c >>> 0).toString(16).padStart(6, '0');

/**
 * A few palettes to start from. A face should choose its colours on purpose
 * (see SKILL.md); these are lists of hex values, not a style.
 */
export const PALETTES = {
  /** PICO-8's 16, the fantasy console's fixed palette. */
  pico8: ['000000', '1d2b53', '7e2553', '008751', 'ab5236', '5f574f', 'c2c3c7', 'fff1e8',
    'ff004d', 'ffa300', 'ffec27', '00e436', '29adff', '83769c', 'ff77a8', 'ffccaa'].map(hex),
  /** The four greens of the original Game Boy screen. */
  dmg: ['0f380f', '306230', '8bac0f', '9bbc0f'].map(hex),
  /** CGA mode 4, palette 1 high intensity. */
  cga: ['000000', '55ffff', 'ff55ff', 'ffffff'].map(hex),
  /** Eight colours the controller's idle mode can show: each channel fully on or off. */
  idle8: [0x000000, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff],
};
