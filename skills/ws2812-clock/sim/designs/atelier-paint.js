// Atelier: the canvas raster, compositing primitives, and the paint look.
import * as kit from '../js/kit.js';
import { GLYPHS, rasterise } from './atelier-glyphs.js';

export const W = 64, H = 64;
export const img = new Float32Array(W * H * 3);

// ------------------------------------------------------------ compositing
/** Paint over pixel (x, y) toward c by a. */
export function over(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  if (a > 1) a = 1;
  img[p] += (r - img[p]) * a; img[p + 1] += (g - img[p + 1]) * a; img[p + 2] += (b - img[p + 2]) * a;
}
export function addPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += r * a; img[p + 1] += g * a; img[p + 2] += b * a;
}

/**
 * Filled ellipse with coverage edges. col is [r,g,b], or a 3*H row table
 * (colour by pixel row). shade > 0 rounds it with a light from the top-left.
 * clipY: only rows < clipY (for lids).
 */
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
/** A round-capped line of radius r. */
export function capsule(ax, ay, bx, by, r, col, a = 1, glow = false) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, row = col.length > 3;
  for (let y = y0; y <= y1; y++) {
    const cr = row ? col[3 * y] : col[0], cg = row ? col[3 * y + 1] : col[1], cb = row ? col[3 * y + 2] : col[2];
    for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - dx * t, ey = y - ay - dy * t;
      const c = r - Math.sqrt(ex * ex + ey * ey) + 0.5;
      if (c <= 0) continue;
      if (glow) addPx(x, y, cr, cg, cb, a * (c > 1 ? 1 : c));
      else over(x, y, cr, cg, cb, a * (c > 1 ? 1 : c));
    }
  }
}
/** A ring (circle outline) of radius R and half-thickness t. */
export function ring(cx, cy, R, t, col, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - R - t - 1)), x1 = Math.min(W - 1, Math.ceil(cx + R + t + 1));
  const y0 = Math.max(0, Math.floor(cy - R - t - 1)), y1 = Math.min(H - 1, Math.ceil(cy + R + t + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.abs(Math.hypot(x - cx, y - cy) - R);
    const c = t - d + 0.5;
    if (c > 0) over(x, y, col[0], col[1], col[2], a * (c > 1 ? 1 : c));
  }
}

// ------------------------------------------------------------- the paint
const LX = -0.6, LY = -0.8;                    // studio lamp: top-left
const fields = [null, null, null, null, null];

/**
 * Paint glyph `d` at (ox, oy), stroke progress prog, colour col, onto the
 * canvas whose ground is `ground`. wet 0..1 (fresh sheen), erase(y) gives
 * how much of row y has been painted over (0 = intact). clip = canvas rect.
 */
export const LIGHT = { x: 0, y: 0, a: 0, col: [1, 1, 0.4] };   // the firefly: a moving light in the room
export function paintGlyph(slot, d, prog, ox, oy, col, wet, t, clip, scrubY = -1e9) {
  const g = GLYPHS[d];
  const f = fields[slot] = rasterise(g, prog, ox, oy, fields[slot]);
  const { cov, k: K, s: S, across: AC, nx: NX, ny: NY, w, h, x0, y0 } = f;
  const [cx0, cy0, cx1, cy1] = clip;
  for (let j = 0; j < h; j++) {
    const y = y0 + j;
    if (y < cy0 || y >= cy1 || y < 0 || y >= H) continue;
    // painted over from the top down to scrubY (soft front)
    const keep = scrubY < -1e8 ? 1 : kit.clamp((y - scrubY) / 1.5 + 0.5);
    if (keep <= 0) continue;
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      let c = cov[p];
      if (c <= 0) continue;
      const x = x0 + i;
      if (x < cx0 || x >= cx1 || x < 0 || x >= W) continue;
      const k = K[p], s = S[p], ac = AC[p], st = g.strokes[k];
      // bristle streaks: lanes across the brush, varying along it
      const lane = Math.floor((ac + 1) * 3.2);
      const streak = 0.74 + 0.36 * kit.hash(lane, Math.floor(s * 0.45), d * 7 + k + slot * 31);
      // dry brush: the last stretch of a stroke breaks up into lanes
      const dry = kit.clamp((s - (st.L - 3.2)) / 3.2);
      if (dry > 0 && kit.hash(lane, d, k + 3) < dry * 0.75) c *= 0.35;
      // the paint is a ridge: its upper-left flank catches the lamp
      const facing = -(NX[p] * LX + NY[p] * LY) * Math.min(1, Math.abs(ac) * 1.4);
      const spec = facing > 0 ? facing * facing : 0;
      const glint = 0.5 + 0.5 * Math.sin(s * 0.9 - t * 1.3 + k * 2);
      const sh = spec * (0.08 + 0.4 * wet * (0.6 + 0.4 * glint));
      // the firefly's own glint on the wet ridges as it passes
      const vx = LIGHT.x - x, vy = LIGHT.y - y, d2 = vx * vx + vy * vy, dl = Math.sqrt(d2) || 1;
      const f2 = (NX[p] * vx + NY[p] * vy) / dl * Math.min(1, Math.abs(ac) * 1.4 + 0.25);
      const fs = 2.6 * LIGHT.a * (f2 > 0 ? f2 : 0) * (0.4 + 0.6 * wet) / (1 + d2 / 60);
      const body = streak * (0.88 + 0.12 * wet) * (1 - 0.18 * Math.max(0, -facing));
      const L = LIGHT.col;
      const r = col[0] * body + sh * (0.6 + 0.4 * col[0]) + fs * L[0];
      const gg = col[1] * body + sh * (0.6 + 0.4 * col[1]) + fs * L[1];
      const b = col[2] * body + sh * (0.6 + 0.4 * col[2]) + fs * L[2];
      over(x, y, r, gg, b, c * keep);
    }
  }
}

/** Drips running from the bottom of a freshly painted digit; they stop as it dries. */
export function drips(slot, d, ox, oy, col, age, maxLen, clip) {
  const g = GLYPHS[d];
  g.drips.forEach(([x, y, w], n) => {
    if (kit.hash(d, n, slot) > 0.6) return;
    const L = maxLen * (0.45 + 0.55 * kit.hash(n, d, slot + 9)) * (1 - Math.exp(-age / 3.5));
    if (L < 0.2) return;
    const X = x + ox - 0.4 * L * 0.13, Y = y + oy;
    if (Y + L > clip[3] - 1) return;
    capsule(X, Y - 0.5, X - 0.13 * L, Y + L - 0.6, 0.5, col, 0.9);
    ellipse(X - 0.13 * L, Y + L, 0.8, 0.95, col, 1, 0.6);
  });
}

/** A soft pool of light (additive, radial falloff) of radius r. */
export function pool(cx, cy, r, col, a) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = 1 - ((x - cx) ** 2 + (y - cy) ** 2) / r2;
    if (q > 0) addPx(x, y, col[0], col[1], col[2], a * q * q);
  }
}
