// A small light-accumulating rasteriser for abyss.js.
//
// The frame is built in ACC, three float channels per pixel (int16 on the
// device), so faint glows add up without losing the low bits RGB565 would
// throw away; `resolve` writes it to the canvas once, with an ordered
// dither. Light is additive (`add*`), solid things composite over it
// (`over*`, `sprite`).
//
// Nothing here goes through the canvas's drawing calls, so every loop
// charges what it does to g.cost by hand: `box` (3 cycles each) for the
// arithmetic per pixel touched, `px` and `dither` for the final stores.
// The charges are written next to each loop.

import { Gfx, R, G, B } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;
export const ACC = new Float32Array(N * 3);
let cost = null;

export function begin(g) { cost = g.cost; }

/** Start the frame from a precomputed background (memcpy). */
export function copyBase(base) {
  ACC.set(base);
  cost.box += N;                       // ~3 cycles a pixel: a block copy of 6 bytes
}

// ------------------------------------------------------------ masks

/**
 * Add a mask (mw x mh floats at `off` in `m`) times a colour, its top-left
 * at integer (x0, y0). The caller picks the sub-pixel phase of the mask.
 */
export function addMask(m, off, mw, mh, x0, y0, r, g, b) {
  for (let j = 0; j < mh; j++) {
    const y = y0 + j;
    if (y < 0 || y >= H) continue;
    for (let i = 0; i < mw; i++) {
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const a = m[off + j * mw + i];
      if (a <= 0) continue;
      const k = (y * W + x) * 3;
      ACC[k] += r * a; ACC[k + 1] += g * a; ACC[k + 2] += b * a;
    }
  }
  cost.box += mw * mh * 2;             // load, 3 multiply-adds: ~6 cycles a mask pixel
}

/** Composite a mask over ACC: colour (r, g, b) at opacity mask * a. */
export function overMask(m, off, mw, mh, x0, y0, r, g, b, a) {
  for (let j = 0; j < mh; j++) {
    const y = y0 + j;
    if (y < 0 || y >= H) continue;
    for (let i = 0; i < mw; i++) {
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const v = m[off + j * mw + i] * a;
      if (v <= 0) continue;
      const k = (y * W + x) * 3;
      ACC[k] += (r - ACC[k]) * v; ACC[k + 1] += (g - ACC[k + 1]) * v; ACC[k + 2] += (b - ACC[k + 2]) * v;
    }
  }
  cost.box += mw * mh * 3;             // ~9 cycles a mask pixel
}

/** A point of light gliding by fractions of a pixel: a bilinear 2 x 2 splat. */
export function splatAdd(x, y, r, g, b) {
  x -= 0.5; y -= 0.5;
  const ix = x | 0, iy = y | 0;
  if (x < 0 || y < 0 || ix >= W - 1 || iy >= H - 1) return;
  const u = x - ix, v = y - iy, k = (iy * W + ix) * 3, k2 = k + W * 3;
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  ACC[k] += r * w00; ACC[k + 1] += g * w00; ACC[k + 2] += b * w00;
  ACC[k + 3] += r * w10; ACC[k + 4] += g * w10; ACC[k + 5] += b * w10;
  ACC[k2] += r * w01; ACC[k2 + 1] += g * w01; ACC[k2 + 2] += b * w01;
  ACC[k2 + 3] += r * w11; ACC[k2 + 4] += g * w11; ACC[k2 + 5] += b * w11;
  cost.box += 10;
}

/** A solid point gliding by fractions of a pixel (a 2 x 2 splat, composited over). */
export function splatOver(x, y, r, g, b, a) {
  x -= 0.5; y -= 0.5;
  const ix = x | 0, iy = y | 0;
  if (x < 0 || y < 0 || ix >= W - 1 || iy >= H - 1) return;
  const u = x - ix, v = y - iy, k = (iy * W + ix) * 3, k2 = k + W * 3;
  over1(k, r, g, b, (1 - u) * (1 - v) * a); over1(k + 3, r, g, b, u * (1 - v) * a);
  over1(k2, r, g, b, (1 - u) * v * a); over1(k2 + 3, r, g, b, u * v * a);
  cost.box += 14;
}
function over1(k, r, g, b, v) {
  if (v > 1) v = 1;
  ACC[k] += (r - ACC[k]) * v; ACC[k + 1] += (g - ACC[k + 1]) * v; ACC[k + 2] += (b - ACC[k + 2]) * v;
}

// ------------------------------------------------------------ round glows

/** A falloff table over squared distance: lut[(d2 / r2) * 255]. */
export function glowLUT(fn) {
  return Float32Array.from({ length: 257 }, (_, i) => fn(Math.min(1, i / 255)));
}

/** A round glow of radius `rad` at (cx, cy), table `lut`, colour times `amp`. */
export function addRadial(cx, cy, rad, lut, r, g, b) {
  const x0 = Math.max(0, (cx - rad) | 0), x1 = Math.min(W - 1, (cx + rad) | 0);
  const y0 = Math.max(0, (cy - rad) | 0), y1 = Math.min(H - 1, (cy + rad) | 0);
  if (x1 < x0 || y1 < y0) return;
  const s = 255 / (rad * rad);
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, dy2 = dy * dy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, q = (dx * dx + dy2) * s;
      if (q >= 255) continue;
      const w = lut[q | 0], k = (y * W + x) * 3;
      ACC[k] += r * w; ACC[k + 1] += g * w; ACC[k + 2] += b * w;
    }
  }
  cost.box += (x1 - x0 + 1) * (y1 - y0 + 1) * 3;   // ~9 cycles a pixel (fixed point)
}

// ------------------------------------------------------------ sprites

/**
 * A sprite drawn once at load with the kit's own shapes: `draw(g, pal)` is
 * called on a colour canvas with `pal` and on a mask canvas with every
 * colour white. Returns premultiplied colour (over black), alpha, and the
 * same for each extra palette in `alts` (e.g. the scene under a floodlight).
 */
export function buildSprite(w, h, draw, pal, alts = []) {
  const white = Object.fromEntries(Object.keys(pal).map((k) => [k, 0xffffff]));
  const m = new Gfx(w, h); m.aa = true; draw(m, white);
  const A = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = G(m.get(i % w, (i / w) | 0)) / 255;
  const colour = (p) => {
    const c = new Gfx(w, h); c.aa = true; draw(c, p);
    const C = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { const v = c.get(i % w, (i / w) | 0); C[i * 3] = R(v); C[i * 3 + 1] = G(v); C[i * 3 + 2] = B(v); }
    return C;
  };
  return { w, h, A, C: colour(pal), alt: alts.map(colour) };
}

/**
 * Composite a sprite under an affine map. (ox, oy) is where sprite point
 * (px, py) lands; `ang` rotates, `sx` scales x (a turn). Bilinear sampling,
 * so it glides and turns smoothly. `mixA` (0..1 per pixel, or null) blends
 * towards the sprite's first alternate palette.
 */
export function sprite(spr, ox, oy, px, py, ang, sx, mixA = null, alpha = 1) {
  const c = Math.cos(ang), s = Math.sin(ang);
  // sprite -> screen: X = ox + (c*(u-px)*sx - s*(v-py)), Y = oy + (s*(u-px)*sx + c*(v-py))
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const corner = (u, v) => {
    const X = ox + c * (u - px) * sx - s * (v - py), Y = oy + s * (u - px) * sx + c * (v - py);
    if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
  };
  corner(0, 0); corner(spr.w, 0); corner(0, spr.h); corner(spr.w, spr.h);
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H, Math.ceil(maxY));
  if (x1 <= x0 || y1 <= y0) return;
  const isx = 1 / sx, A = spr.A, C = spr.C, C2 = spr.alt.length ? spr.alt[0] : C, sw = spr.w, sh = spr.h;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - oy;
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - ox;
      // screen -> sprite (the pixel centre), then to texel space
      const u = (c * dx + s * dy) * isx + px - 0.5, v = -s * dx + c * dy + py - 0.5;
      if (u <= -1 || v <= -1 || u >= sw || v >= sh) continue;
      const iu = ((u + 1) | 0) - 1, iv = ((v + 1) | 0) - 1, fu = u - iu, fv = v - iv;
      let a = 0, r = 0, g = 0, b = 0, r2 = 0, g2 = 0, b2 = 0;
      for (let q = 0; q < 4; q++) {
        const tu = iu + (q & 1), tv = iv + (q >> 1);
        if (tu < 0 || tv < 0 || tu >= sw || tv >= sh) continue;
        const w = ((q & 1) ? fu : 1 - fu) * ((q >> 1) ? fv : 1 - fv), t = tv * sw + tu, t3 = t * 3;
        a += A[t] * w; r += C[t3] * w; g += C[t3 + 1] * w; b += C[t3 + 2] * w;
        if (mixA) { r2 += C2[t3] * w; g2 += C2[t3 + 1] * w; b2 += C2[t3 + 2] * w; }
      }
      if (a <= 0.004) continue;
      const p = y * W + x, k = p * 3;
      if (mixA) { const m = mixA[p] > 1 ? 1 : mixA[p]; r += (r2 - r) * m; g += (g2 - g) * m; b += (b2 - b) * m; }
      const ia = 1 - a * alpha;
      ACC[k] = ACC[k] * ia + r * alpha; ACC[k + 1] = ACC[k + 1] * ia + g * alpha; ACC[k + 2] = ACC[k + 2] * ia + b * alpha;
    }
  }
  // per pixel scanned: an inverse map (incremental), 4 taps of 4 channels in fixed point
  cost.box += (x1 - x0) * (y1 - y0) * (mixA ? 26 : 18);
}

// ------------------------------------------------------------ out

const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

/** Write ACC to the canvas as RGB565, ordered-dithered. */
export function resolve(g) {
  const buf = g.buf;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x, k = p * 3, t = BAYER[((y & 3) << 2) | (x & 3)];
      let r = ACC[k] * (31 / 255) + t, gg = ACC[k + 1] * (63 / 255) + t, b = ACC[k + 2] * (31 / 255) + t;
      r = r < 0 ? 0 : r > 31 ? 31 : r | 0; gg = gg < 0 ? 0 : gg > 63 ? 63 : gg | 0; b = b < 0 ? 0 : b > 31 ? 31 : b | 0;
      buf[p] = (r << 11) | (gg << 5) | b;
    }
  cost.px += N; cost.dither += N; cost.box += N * 3;   // ~19 cycles a pixel
}
