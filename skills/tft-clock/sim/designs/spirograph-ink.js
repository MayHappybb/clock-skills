// Spirograph ink: the paper, the gel pens, and the integer pixel helpers the
// face composites with (unpack RGB565, mix, pack: what the C port does).

import { to565, from565 } from '../js/kit.js';

/** Black construction paper: a dark grey with a little violet in it (it glows on an LCD). */
export const PAPER = 0x16131c;

/**
 * Eight gel pens for black paper, the kind sold for it: metallic gold,
 * metallic rose, aqua, lavender, copper, lime, sky and silver. Each is light
 * and opaque enough to sit on black; on the beat the wheels change pen.
 */
export const PENS = [0xf2c55c, 0xff78b4, 0x52e2d0, 0xb48cff, 0xff9850, 0xb6ee5a, 0x68b6ff, 0xdfe2ee];

/** The translucent smoke-blue plastic of the wheels, rails and the giant ring. */
export const PLASTIC = 0x8ab4d8;

export const mixc = (a, b, u) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

/** Blend 0xRRGGBB colour c over the stored RGB565 value v by a/256, integer maths. */
export function blend565(v, c, a) {
  const d = from565(v);
  const r = (d >> 16) & 255, g = (d >> 8) & 255, b = d & 255;
  const R = r + (((((c >> 16) & 255) - r) * a) >> 8), G = g + (((((c >> 8) & 255) - g) * a) >> 8), B = b + ((((c & 255) - b) * a) >> 8);
  return to565((R << 16) | (G << 8) | B);
}

/** 17 RGB565 levels of colour c over a flat ground, for splatted lines on bare paper. */
export function levels(ground, c) {
  const t = new Uint16Array(17);
  for (let k = 0; k <= 16; k++) t[k] = to565(mixc(ground, c, k / 16));
  return t;
}
