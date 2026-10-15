// Sustower: the raster canvas (64 x 192) and compositing primitives, plus a
// placard-numeral renderer (carved groove: dark channel, gold-leaf fill, a
// cold highlight on the upper-left bevel) built on sonnet-sustower-glyphs.
import * as kit from '../js/kit.js';
import { GLYPHS, BOX_W, BOX_H } from './sonnet-sustower-glyphs.js';

export const W = 64, H = 192;
export const img = new Float32Array(W * H * 3);

export function over(x, y, r, g, b, a) {
  if (a <= 0) return;
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  if (a > 1) a = 1;
  const p = 3 * (y * W + x);
  img[p] += (r - img[p]) * a; img[p + 1] += (g - img[p + 1]) * a; img[p + 2] += (b - img[p + 2]) * a;
}
export function addPx(x, y, r, g, b, a) {
  if (a <= 0) return;
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] += r * a; img[p + 1] += g * a; img[p + 2] += b * a;
}

/** Filled ellipse, coverage-antialiased. col may be [r,g,b] or a 3*H row table. */
export function ellipse(cx, cy, rx, ry, col, a = 1, shade = 0, glow = false) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const m = Math.min(rx, ry), row = col.length > 3;
  for (let y = y0; y <= y1; y++) {
    const v = (y - cy) / ry;
    const cr = row ? col[3 * y] : col[0], cg = row ? col[3 * y + 1] : col[1], cb = row ? col[3 * y + 2] : col[2];
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / rx, q = Math.sqrt(u * u + v * v);
      const c = 0.5 - (q - 1) * m;
      if (c <= 0) continue;
      let k = 1;
      if (shade) k = 1 + shade * (-0.55 * u - 0.75 * v - 0.25 * q * q);
      if (glow) addPx(x, y, cr * k, cg * k, cb * k, a * (c > 1 ? 1 : c));
      else over(x, y, cr * k, cg * k, cb * k, a * (c > 1 ? 1 : c));
    }
  }
}
export function capsule(ax, ay, bx, by, r, col, a = 1, glow = false) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ey = y - ay - dy * t;
      const c = r - Math.sqrt(ex * ex + ey * ey) + 0.5;
      if (c <= 0) continue;
      if (glow) addPx(x, y, col[0], col[1], col[2], a * (c > 1 ? 1 : c));
      else over(x, y, col[0], col[1], col[2], a * (c > 1 ? 1 : c));
    }
  }
}
export function rect(x0, y0, x1, y1, col, a = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    const cy = kit.clamp(Math.min(y - y0 + 0.5, y1 - y + 0.5));
    if (cy <= 0) continue;
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const c = cy * kit.clamp(Math.min(x - x0 + 0.5, x1 - x + 0.5));
      if (c <= 0) continue;
      over(x, y, col[0], col[1], col[2], c * a);
    }
  }
}

/**
 * Draw digit `d` at box origin (ox, oy), scale `s` (px per glyph-unit),
 * carved into a placard: `cut` 0..1 is how much of the groove is engraved
 * (for the carve-reveal transition; 1 = fully cut), `wood` is the plank
 * colour, `gold` the leaf colour in the groove, `deep` the shadow colour.
 */
export function placardDigit(d, ox, oy, s, { cut = 1, wood, gold, deep, bright = 1 } = {}) {
  if (cut <= 0) return;
  const G = GLYPHS[d];
  const reveal = cut * G.total;
  const rm = G.R * s;
  for (const st of G.strokes) {
    const { xs, ys, from, n } = st;
    for (let i = 0; i < n - 1; i++) {
      if (from[i] > reveal) break;
      const f = Math.min(1, (reveal - from[i]) / Math.max(1e-6, from[i + 1] - from[i]));
      if (f <= 0) continue;
      const ax = ox + xs[i] * s, ay = oy + ys[i] * s;
      const bx = ox + kit.lerp(xs[i], xs[i + 1], f) * s, by = oy + kit.lerp(ys[i], ys[i + 1], f) * s;
      // groove shadow (slightly offset down-right), then gold fill, then a thin cold highlight up-left
      capsule(ax + rm * 0.35, ay + rm * 0.35, bx + rm * 0.35, by + rm * 0.35, rm * 1.15, deep, 0.85 * bright);
      capsule(ax, ay, bx, by, rm, gold, bright);
      capsule(ax - rm * 0.3, ay - rm * 0.3, bx - rm * 0.3, by - rm * 0.3, rm * 0.4, kit.mix(gold, [1, 1, 1], 0.55), 0.5 * bright);
    }
  }
}

export { BOX_W, BOX_H };
