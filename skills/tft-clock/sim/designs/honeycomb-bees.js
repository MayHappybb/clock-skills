// The bees of "honeycomb", seen from above, drawn flat: a black head, a
// tawny thorax, a striped abdomen, clear wings. Rasterised once at load for
// 32 headings (flash: 32 x 15 x 15 palette bytes for the body, and 1-bit
// masks for the folded wings, the two strokes of a beating wing and the
// flat cast shadow).

import { R, G, B } from '../js/kit.js';

export const NA = 32, S = 15, HALF = 7;
export const INK = 0x1a0f08, THORAX = 0xb8741c, STRIPE = 0xe0a030, WING = 0xe6f2f6;
export const POLLEN = 0xff7a1a;

function raster(angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const body = new Int32Array(S * S).fill(-1);
  const fold = new Uint8Array(S * S), wa = new Uint8Array(S * S), wb = new Uint8Array(S * S);
  const legs = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - (HALF + 0.5), dy = y + 0.5 - (HALF + 0.5);
    // u along the heading, v across it
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const head = (u - 3.9) ** 2 + v * v < 1.7 ** 2;
    const thor = (u - 1.0) ** 2 + v * v < 2.15 ** 2;
    const abd = ((u + 3.0) / 3.7) ** 2 + (v / 2.35) ** 2 < 1;
    const ant = u > 5.3 && u < 6.8 && Math.abs(Math.abs(v) - (0.7 + (u - 5.4) * 0.8)) < 0.55;
    let c = -1;
    if (abd) {
      // amber bands across the abdomen, the tip black
      c = u < -5.7 ? INK : (u < -4.5 || (u >= -3.4 && u < -2.2) || u >= -1.3) ? STRIPE : INK;
    }
    if (thor) c = THORAX;
    if (head || ant) c = INK;
    body[y * S + x] = c;
    // folded wings lie over the abdomen, splayed a little
    for (const sgn of [-1, 1]) {
      const a = 0.32 * sgn, ua = u * Math.cos(a) - v * Math.sin(a), va = u * Math.sin(a) + v * Math.cos(a);
      if (((ua + 2.0) / 3.4) ** 2 + ((va - sgn * 0.9) / 1.35) ** 2 < 1) fold[y * S + x] = 1;
      // beating wings: two strokes, forward and back
      const fa = ((u - 1.4) / 2.0) ** 2 + ((v - sgn * 3.9) / 2.6) ** 2 < 1;
      const fb = ((u + 1.4) / 2.0) ** 2 + ((v - sgn * 3.9) / 2.6) ** 2 < 1;
      if (fa) wa[y * S + x] = 1;
      if (fb) wb[y * S + x] = 1;
    }
    // legs: three short dark ticks either side of the thorax (walking pose)
    if (Math.abs(Math.abs(v) - 2.9) < 0.5 && (Math.abs(u - 2.0) < 0.5 || Math.abs(u - 0.2) < 0.5 || Math.abs(u + 1.6) < 0.5)) legs[y * S + x] = 1;
  }
  return { body, fold, wa, wb, legs };
}

export const SPR = Array.from({ length: NA }, (_, k) => raster((k / NA) * Math.PI * 2));

const T565 = (c) => ((R(c) >> 3) << 11) | ((G(c) >> 2) << 5) | (B(c) >> 3);
// body colours straight to RGB565, sprite by sprite
for (const s of SPR) {
  s.b565 = new Int32Array(S * S);
  s.shadow = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) { s.b565[i] = s.body[i] < 0 ? -1 : T565(s.body[i]); s.shadow[i] = s.body[i] < 0 ? 0 : 1; }
}

/** Sprite index for a heading in radians (0 = right, clockwise on screen since y is down). */
export function dirIndex(a) {
  let k = Math.round((a / (Math.PI * 2)) * NA) % NA;
  if (k < 0) k += NA;
  return k;
}

/**
 * Blend a 1-bit mask over the frame in one colour: integer RGB565 lerp,
 * `a` in 0..32. Returns the pixels it touched.
 */
export function blendMask(buf, mask, x0, y0, c565, a) {
  const cr = c565 >> 11, cg = (c565 >> 5) & 63, cb = c565 & 31;
  let n = 0;
  for (let j = 0; j < S; j++) {
    const y = y0 + j;
    if (y < 0 || y >= 80) continue;
    for (let i = 0; i < S; i++) {
      if (!mask[j * S + i]) continue;
      const x = x0 + i;
      if (x < 0 || x >= 160) continue;
      const p = y * 160 + x, d = buf[p];
      const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31;
      buf[p] = ((dr + (((cr - dr) * a) >> 5)) << 11) | ((dg + (((cg - dg) * a) >> 5)) << 5) | (db + (((cb - db) * a) >> 5));
      n++;
    }
  }
  return n;
}

/** Opaque mask in one colour. */
export function stampMask(buf, mask, x0, y0, c565) {
  let n = 0;
  for (let j = 0; j < S; j++) {
    const y = y0 + j;
    if (y < 0 || y >= 80) continue;
    for (let i = 0; i < S; i++) {
      if (!mask[j * S + i]) continue;
      const x = x0 + i;
      if (x < 0 || x >= 160) continue;
      buf[y * 160 + x] = c565; n++;
    }
  }
  return n;
}

/** Opaque body sprite. */
export function stampBody(buf, spr, x0, y0) {
  const b = spr.b565;
  let n = 0;
  for (let j = 0; j < S; j++) {
    const y = y0 + j;
    if (y < 0 || y >= 80) continue;
    for (let i = 0; i < S; i++) {
      const v = b[j * S + i];
      if (v < 0) continue;
      const x = x0 + i;
      if (x < 0 || x >= 160) continue;
      buf[y * 160 + x] = v; n++;
    }
  }
  return n;
}
