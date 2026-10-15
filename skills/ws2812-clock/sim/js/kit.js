// Everything a design needs, in one import:  import * as kit from '../js/kit.js'
//
// Colour is LINEAR LIGHT, 0..1 per channel: what the LED emits as a fraction
// of full PWM. Mix, add and fade in linear light; kit.hex / kit.hsv convert
// from the sRGB numbers people pick colours in.

import { STROKE, COMB, SQ3X5, combDots } from './fonts.js';
export { STROKE, COMB, SQ3X5, combDots };

// ------------------------------------------------------------------ math
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

/** Deterministic hash of integers to [0, 1). */
export function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in 2D and 3D, range about [0, 1]. */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function noise3(x, y, z) {
  const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf);
  return lerp(noise2(x + zi * 17.3, y + zi * 9.1), noise2(x + (zi + 1) * 17.3, y + (zi + 1) * 9.1), w);
}
export function fbm(x, y, z = 0, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2; a *= 0.5; }
  return s / (1 - 0.5 ** oct);
}

// ---------------------------------------------------------------- colour
const lin1 = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** '#ff8800' (sRGB) to linear [r, g, b]. */
export function hex(s) {
  const n = parseInt(s.replace('#', ''), 16);
  return [lin1(((n >> 16) & 255) / 255), lin1(((n >> 8) & 255) / 255), lin1((n & 255) / 255)];
}
/** Hue (0..1), saturation, value, in sRGB terms, to linear [r, g, b]. */
export function hsv(h, s = 1, v = 1) {
  h = fract(h) * 6;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [lin1(r), lin1(g), lin1(b)];
}
/** Black-body colour at `kelvin`, linear, brightest channel 1. Fire, embers, warm white. */
export function blackbody(kelvin) {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
  const c = [r, g, b].map((v) => lin1(clamp(v / 255)));
  const m = Math.max(...c);
  return c.map((v) => v / m);
}
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ------------------------------------------------------------ the frame
/** Set LED i to colour c (times a). */
export function set(ctx, i, c, a = 1) { const o = ctx.out; o[3 * i] = c[0] * a; o[3 * i + 1] = c[1] * a; o[3 * i + 2] = c[2] * a; }
/** Add colour c (times a) to LED i: light adds. */
export function add(ctx, i, c, a = 1) { const o = ctx.out; o[3 * i] += c[0] * a; o[3 * i + 1] += c[1] * a; o[3 * i + 2] += c[2] * a; }
/** Blend LED i toward c by a (0..1): paint over. */
export function over(ctx, i, c, a = 1) {
  const o = ctx.out;
  o[3 * i] += (c[0] - o[3 * i]) * a; o[3 * i + 1] += (c[1] - o[3 * i + 1]) * a; o[3 * i + 2] += (c[2] - o[3 * i + 2]) * a;
}
/** Colour every LED: fn(led, i) returns [r, g, b] (or null to leave it). */
export function fill(ctx, fn) {
  for (const l of ctx.leds) { const c = fn(l, l.i); if (c) set(ctx, l.i, c); }
}
/**
 * A soft dot of light at (x, y) mm: adds c * a * falloff to LEDs within r.
 * Moves smoothly between LEDs, so a dot can glide rather than hop.
 */
export function splat(ctx, x, y, r, c, a = 1) {
  for (const i of ctx.layout.index.near(x, y, r)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y) / r;
    const f = (1 - d * d) ** 2;
    add(ctx, i, c, a * f);
  }
}
/** The LED at (x, y) mm, or -1. */
export const at = (ctx, x, y) => ctx.layout.index.at(x, y);

// --------------------------------------------------------------- raster
/**
 * On a layout that is one square lattice (HUB75 panels, strips and squares,
 * a single 8x8...): the layout as a pixel grid, or null.
 *   { w, h, idx }  idx[y * w + x] is the LED at grid cell (x, y), or -1
 * x runs right and y down from the top-left LED. Each LED also carries
 * gridX / gridY. Draw into your own Float32Array(3 * w * h) and copy it
 * with kit.blitGrid, or write ctx.out directly through idx.
 */
export const grid = (ctx) => ctx.layout.grid;
/** Copy an RGB float image (3 * w * h, linear) onto the LEDs, times a. */
export function blitGrid(ctx, img, a = 1) {
  const G = ctx.layout.grid, o = ctx.out, idx = G.idx;
  for (let p = 0; p < idx.length; p++) {
    const i = idx[p];
    if (i < 0) continue;
    o[3 * i] = img[3 * p] * a; o[3 * i + 1] = img[3 * p + 1] * a; o[3 * i + 2] = img[3 * p + 2] * a;
  }
}
/**
 * Paint a bitmap given as strings ('#' or any non '.'/' ' char is ink) at
 * grid cell (x, y): fn(ch) may map characters to colours, else `color`.
 */
export function bitmap(ctx, rows, x, y, color = [1, 1, 1], a = 1) {
  const G = ctx.layout.grid;
  rows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const ch = row[k];
      if (ch === '.' || ch === ' ') continue;
      const gx = x + k, gy = y + j;
      if (gx < 0 || gy < 0 || gx >= G.w || gy >= G.h) continue;
      const i = G.idx[gy * G.w + gx];
      if (i >= 0) add(ctx, i, typeof color === 'function' ? color(ch) : color, a);
    }
  });
}

// -------------------------------------------------------------- strokes
/** Distance from (px, py) to the segment a-b. */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Lay out text in the STROKE font: returns segments [ax, ay, bx, by, glyphIndex]
 * in mm. (x, y) is the top-left; h the cap height in mm; `slant` shears right.
 * Use `textWidth` to centre it.
 */
export function strokes(text, { x = 0, y = 0, h = 20, slant = 0, track = 1 } = {}) {
  const s = h / STROKE.height, segs = [];
  let cx = x;
  [...text].forEach((ch, gi) => {
    const g = STROKE.glyphs[ch];
    if (!g) return;
    for (const path of g) {
      const pts = path.length === 1 ? [path[0], path[0]] : path;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        segs.push([cx + ax * s + (STROKE.height - ay) * s * slant, y + ay * s, cx + bx * s + (STROKE.height - by) * s * slant, y + by * s, gi]);
      }
    }
    cx += (g.advance ?? STROKE.advance) * s * track;
  });
  return segs;
}
export function textWidth(text, h, track = 1) {
  const s = h / STROKE.height;
  let w = 0;
  for (const ch of text) w += (STROKE.glyphs[ch]?.advance ?? STROKE.advance) * s * track;
  return w - (STROKE.advance - STROKE.width) * s * track;
}

/**
 * Light the LEDs near a set of segments. For each LED within `width/2 + soft`
 * of a stroke, calls paint(led, d, seg) with d its distance in mm; the
 * default adds `color` with a soft edge. Coverage, not rasterising: the
 * stroke can sit anywhere, at any angle, across seams.
 */
export function drawStrokes(ctx, segs, { width = 3, soft = 1.5, color = [1, 1, 1], paint } = {}) {
  const reach = width / 2 + soft;
  const best = new Map();
  for (const sg of segs) {
    const [ax, ay, bx, by] = sg;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, r = Math.hypot(bx - ax, by - ay) / 2 + reach;
    for (const i of ctx.layout.index.near(mx, my, r)) {
      const l = ctx.leds[i], d = segDist(l.x, l.y, ax, ay, bx, by);
      if (d <= reach && !(best.get(i)?.[0] <= d)) best.set(i, [d, sg]);
    }
  }
  for (const [i, [d, sg]] of best) {
    if (paint) paint(ctx.leds[i], d, sg);
    else add(ctx, i, color, 1 - smoothstep(width / 2 - soft, width / 2 + soft, d));
  }
  return best;
}

// ----------------------------------------------------------------- COMB
/**
 * The LEDs of COMB text on a triangular lattice. (x0, y0) is the world
 * position of a glyph's column 0, half-row 0: it must be an LED whose column
 * has dots at that half-row parity (any LED works for col 0, k 0).
 * Returns [{ ch, glyph, dots: [{ i, c, k }] }]; dots off the board get i = -1.
 */
export function combText(ctx, text, x0, y0, { advance = COMB.advance } = {}) {
  const L = ctx.layout, P = L.leds[0] ? L.panels[0].def.pitch : 4, dx = P * Math.sqrt(3) / 2;
  const out = [];
  [...text].forEach((ch, gi) => {
    const ox = x0 + gi * advance * dx;
    out.push({ ch, glyph: gi, dots: combDots(ch).map(([c, k]) => ({ c, k, i: L.index.at(ox + c * dx, y0 + k * P / 2) })) });
  });
  return out;
}

// ----------------------------------------------------------------- time
/** Night is 23:00 to 07:00, fading over the first and last minute. */
export const NIGHT = { from: 23, to: 7 };
export function nightLevel(date) {
  const m = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const a = NIGHT.from * 60, b = NIGHT.to * 60;
  const inside = m >= a ? m - a : m < b ? m + 1440 - a : -1;
  if (inside < 0) return 0;
  const len = (b + 1440 - a) % 1440 || 1440;
  return clamp(Math.min(inside, len - inside));
}
/** Seconds into the current minute, with a fraction. */
export const secOf = (date) => date.getSeconds() + date.getMilliseconds() / 1000;
