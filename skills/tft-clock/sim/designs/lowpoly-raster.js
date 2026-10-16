// A PlayStation-style polygon rasteriser for lowpoly.js.
//
// The way the 1994 GPU did it, because that is the look:
//   - vertices are snapped to whole pixels before a triangle is filled
//     (no sub-pixel precision), so slow camera moves make every vertex hop
//     on its own and edges swim;
//   - textures are mapped affinely (u, v interpolated straight across the
//     screen, no perspective divide), so a textured quad seen at an angle
//     bends along its diagonal;
//   - colour is dithered to 15/16-bit with a 4x4 ordered pattern;
//   - no depth buffer: the caller sorts by depth (an ordering table) and
//     paints back to front.
//
// It writes the canvas buffer directly and charges what it does to g.cost
// by hand, priced as the C it maps onto: `calls` per triangle (edge set-up),
// `dither` x16 per flat colour (its 4x4 pattern is built once), `px` + `box`
// per pixel filled (a 16-bit store in a span loop), `blit` per textured
// pixel (a texel fetch), `blend` per translucent pixel.

import { R, G, B, to565, from565 } from '../js/kit.js';
import { STATE } from '../js/cost.js';

export const W = 160, H = 80;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let g = null, buf = null;

export function begin(canvas) { g = canvas; buf = canvas.buf; }

/**
 * Colour mix on 0xRRGGBB with integer rounding (no library calls), what the
 * C does per triangle; same result as kit.mix to within one level.
 */
export function mix(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const ra = a >>> 16, ga = (a >>> 8) & 255, ba = a & 255;
  const r = (ra + ((b >>> 16) - ra) * u + 0.5) | 0, g2 = (ga + (((b >>> 8) & 255) - ga) * u + 0.5) | 0, b2 = (ba + ((b & 255) - ba) * u + 0.5) | 0;
  return ((r < 0 ? 0 : r > 255 ? 255 : r) << 16) | ((g2 < 0 ? 0 : g2 > 255 ? 255 : g2) << 8) | (b2 < 0 ? 0 : b2 > 255 ? 255 : b2);
}

// 1/sqrt the way small machines do it: a bit trick and one Newton step
// (~0.2% error), no library call.
const F32 = new Float32Array(1), I32 = new Int32Array(F32.buffer);
export function rsqrt(x) {
  if (x <= 0) return 0;
  F32[0] = x; I32[0] = 0x5f3759df - (I32[0] >> 1);
  const y = F32[0];
  return y * (1.5 - 0.5 * x * y * y);
}

/** One opaque pixel, dithered (stars). */
export function put(x, y, c) {
  buf[y * W + x] = pattern(R(c), G(c), B(c), PX)[((y & 3) << 2) | (x & 3)];
  g.cost.px++; g.cost.dither -= 15;
}
const PX = new Uint16Array(16);

/** Round to the nearest whole pixel with integer maths (what the C does). */
export const snap = (v) => ((v + 4096.5) | 0) - 4096;

function q(v, n, t) { const s = (v <= 0 ? 0 : v >= 255 ? 255 : v) * n / 255; const k = (s + t) | 0; return k > n ? n : k; }

/** The 4x4 dithered RGB565 pattern of a colour given as float channels. */
export function pattern(r, gg, b, out = new Uint16Array(16)) {
  for (let i = 0; i < 16; i++) {
    const t = (BAYER[i] + 0.5) / 16;
    out[i] = (q(r, 31, t) << 11) | (q(gg, 63, t) << 5) | q(b, 31, t);
  }
  g.cost.dither += 16;
  return out;
}
export const patternOf = (c, out) => pattern(R(c), G(c), B(c), out);

/**
 * Scan a triangle with integer vertices; calls span(y, x0, x1) for each row
 * (x1 exclusive). Pixel centres decide coverage, so shared edges neither
 * gap nor overlap.
 */
function scan(x0, y0, x1, y1, x2, y2, span) {
  // sort by y
  if (y1 < y0) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
  if (y2 < y0) { let t = x0; x0 = x2; x2 = t; t = y0; y0 = y2; y2 = t; }
  if (y2 < y1) { let t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
  if (y2 === y0) return;
  const ya = y0 < 0 ? 0 : y0, yb = y2 > H ? H : y2;
  for (let y = ya; y < yb; y++) {
    const py = y + 0.5;
    const xl = x0 + (x2 - x0) * (py - y0) / (y2 - y0);
    let xm;
    if (py < y1) xm = x0 + (x1 - x0) * (py - y0) / (y1 - y0);
    else xm = y2 === y1 ? x1 : x1 + (x2 - x1) * (py - y1) / (y2 - y1);
    let l = xl < xm ? xl : xm, r = xl < xm ? xm : xl;
    // pixels whose centre x + 0.5 lies in [l, r)
    let xa = Math.ceil(l - 0.5), xb = Math.ceil(r - 0.5);
    if (xa < 0) xa = 0;
    if (xb > W) xb = W;
    if (xa < xb) span(y, xa, xb);
  }
}

/** Flat triangle in a dithered pattern (16 RGB565 values). Vertices are snapped here. */
export function tri(ax, ay, bx, by, cx, cy, pat) {
  ax = snap(ax); ay = snap(ay); bx = snap(bx); by = snap(by); cx = snap(cx); cy = snap(cy);
  if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) === 0) return;
  g.cost.calls++;
  STATE.prim++;
  try {
    scan(ax, ay, bx, by, cx, cy, (y, x0, x1) => {
      const row = y * W, pr = (y & 3) << 2;
      for (let x = x0; x < x1; x++) buf[row + x] = pat[pr | (x & 3)];
      g.cost.px += x1 - x0; g.cost.box += x1 - x0;
    });
  } finally { STATE.prim--; }
}

/** Translucent flat triangle: blends colour c at opacity a (shadows, foam). */
export function triBlend(ax, ay, bx, by, cx, cy, c, a) {
  ax = snap(ax); ay = snap(ay); bx = snap(bx); by = snap(by); cx = snap(cx); cy = snap(cy);
  if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) === 0) return;
  g.cost.calls++;
  const cr = R(c), cg = G(c), cb = B(c);
  STATE.prim++;
  try {
    scan(ax, ay, bx, by, cx, cy, (y, x0, x1) => {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x, d = from565(buf[i]);
        buf[i] = to565(((R(d) + (cr - R(d)) * a + 0.5) << 16) | ((G(d) + (cg - G(d)) * a + 0.5) << 8) | (B(d) + (cb - B(d)) * a + 0.5));
      }
      g.cost.blend += x1 - x0; g.cost.box += x1 - x0;
    });
  } finally { STATE.prim--; }
}

/**
 * Affine-textured triangle. (u, v) per vertex in texels; `tex` is a
 * Uint8Array of palette indices, tw x th, power-of-two sizes (wraps);
 * `pats` is one 16-entry dither pattern per palette index, concatenated.
 */
export function triTex(ax, ay, au, av, bx, by, bu, bv, cx, cy, cu, cv, tex, tw, th, pats) {
  ax = snap(ax); ay = snap(ay); bx = snap(bx); by = snap(by); cx = snap(cx); cy = snap(cy);
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (det === 0) return;
  g.cost.calls += 2;                      // edge set-up plus the u, v gradients
  // u, v as planes over the screen: the affine mapping (no 1/z)
  const dux = ((bu - au) * (cy - ay) - (cu - au) * (by - ay)) / det;
  const duy = ((cu - au) * (bx - ax) - (bu - au) * (cx - ax)) / det;
  const dvx = ((bv - av) * (cy - ay) - (cv - av) * (by - ay)) / det;
  const dvy = ((cv - av) * (bx - ax) - (bv - av) * (cx - ax)) / det;
  const mw = tw - 1, mh = th - 1;
  STATE.prim++;
  try {
    scan(ax, ay, bx, by, cx, cy, (y, x0, x1) => {
      const row = y * W, pr = (y & 3) << 2;
      let u = au + (x0 + 0.5 - ax) * dux + (y + 0.5 - ay) * duy;
      let v = av + (x0 + 0.5 - ax) * dvx + (y + 0.5 - ay) * dvy;
      for (let x = x0; x < x1; x++) {
        const k = tex[((Math.floor(v) & mh) * tw) + (Math.floor(u) & mw)];
        buf[row + x] = pats[(k << 4) | pr | (x & 3)];
        u += dux; v += dvx;
      }
      const n = x1 - x0;
      g.cost.px += n; g.cost.box += n; g.cost.blit += n;
    });
  } finally { STATE.prim--; }
}
