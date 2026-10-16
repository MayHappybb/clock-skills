// saulbass: the hand-cut title type and the scanline filler that sets it.
//
// The numerals are drawn as polygons on a 9 x 15 unit grid, like letters cut
// from card with scissors: straight cuts, clipped corners, no curves. Every
// vertex is nudged by a fixed hash so no two cuts are quite parallel (the
// same nudge every frame: it is the typeface, not a wobble).
//
// fillPoly is an even-odd scanline filler: for each row it finds where the
// row crosses the contours and fills the spans with fillRect, blending only
// the two end pixels by their horizontal coverage. That is how a C port
// would do it (integer spans), so a whole line of type costs a few hundred
// span fills, not a per-pixel shader. `inverse` fills everything outside the
// shape instead, which turns the type into windows.

import { rand, sin, cos } from '../js/kit.js';

// Contours per digit, [x, y, x, y, ...] in units (x 0..9, y 0..15, y down).
// The first contour is the outside; any others are counters (even-odd).
const RAW = {
  0: [[1, 0, 8, 0, 9, 1.6, 9, 13.4, 8, 15, 1, 15, 0, 13.4, 0, 1.6], [3, 3, 6, 3, 6, 12, 3, 12]],
  1: [[3.8, 0, 7, 0, 7, 15, 3.8, 15, 3.8, 4.6, 1.6, 5.8, 1.6, 2.6]],
  2: [[0, 4.6, 0, 1.6, 1.6, 0, 7.4, 0, 9, 1.6, 9, 7, 3.6, 12, 9, 12, 9, 15, 0, 15, 0, 12, 6, 6.4, 6, 3, 3, 3, 3, 4.6]],
  3: [[0, 0, 8, 0, 9, 1, 9, 6.6, 8.1, 7.5, 9, 8.4, 9, 14, 8, 15, 0, 15, 0, 12, 6, 12, 6, 9, 2.6, 9, 2.6, 6, 6, 6, 6, 3, 0, 3]],
  4: [[0, 0, 3, 0, 3, 8, 5.6, 8, 5.6, 3, 8.6, 3, 8.6, 8, 9, 8, 9, 11, 8.6, 11, 8.6, 15, 5.6, 15, 5.6, 11, 0, 11]],
  5: [[0, 0, 9, 0, 9, 3, 3, 3, 3, 5.6, 7.6, 5.6, 9, 7.2, 9, 13.4, 7.4, 15, 0, 15, 0, 12, 6, 12, 6, 8.6, 0, 8.6]],
  6: [[1.6, 0, 9, 0, 9, 3, 3, 3, 3, 5.6, 7.4, 5.6, 9, 7.2, 9, 13.4, 7.4, 15, 1.6, 15, 0, 13.4, 0, 1.6], [3, 8.6, 6, 8.6, 6, 12, 3, 12]],
  7: [[0, 0, 9, 0, 9, 3, 5.6, 15, 2.4, 15, 5.8, 3, 0, 3]],
  8: [[1, 0, 8, 0, 9, 1, 9, 6.4, 8, 7.5, 9, 8.6, 9, 14, 8, 15, 1, 15, 0, 14, 0, 8.6, 1, 7.5, 0, 6.4, 0, 1], [3, 2.8, 6, 2.8, 6, 6.1, 3, 6.1], [3, 8.9, 6, 8.9, 6, 12.2, 3, 12.2]],
  9: [[7.4, 15, 0, 15, 0, 12, 6, 12, 6, 9.4, 1.6, 9.4, 0, 7.8, 0, 1.6, 1.6, 0, 7.4, 0, 9, 1.6, 9, 13.4], [3, 3, 6, 3, 6, 6.4, 3, 6.4]],
};

export const UW = 9, UH = 15;

/** The cut glyphs: every vertex nudged up to ±0.28 units by a fixed hash. */
export const GLYPHS = {};
for (const [d, cs] of Object.entries(RAW)) {
  GLYPHS[d] = cs.map((c, ci) => c.map((v, i) => v + (rand(+d, ci * 64 + i, 77) - 0.5) * 0.56));
}

/** A colon: two cut squares, a little askew. Units, centred on x = 0. */
export const COLON = [
  [-1.1, 3.6, 1.0, 3.4, 1.2, 5.6, -1.0, 5.8],
  [-1.0, 9.4, 1.1, 9.2, 1.0, 11.4, -1.2, 11.6],
];

/**
 * Transform unit contours to screen: scale `s` (px per unit, or [sx, sy]),
 * rotate `rot` radians about the glyph's own centre, shear `sh` (x += sh * y,
 * about the centre), then put that centre at (cx, cy).
 */
export function place(contours, cx, cy, s, { rot = 0, sh = 0, ox = UW / 2, oy = UH / 2 } = {}) {
  const sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s;
  const c = cos(rot), n = sin(rot);
  return contours.map((ct) => {
    const out = new Array(ct.length);
    for (let i = 0; i < ct.length; i += 2) {
      let x = (ct[i] - ox) * sx, y = (ct[i + 1] - oy) * sy;
      x += sh * y;
      out[i] = cx + x * c - y * n;
      out[i + 1] = cy + x * n + y * c;
    }
    return out;
  });
}

/** Move already-placed contours by (dx, dy). */
export function shift(contours, dx, dy) {
  return contours.map((ct) => ct.map((v, i) => v + (i & 1 ? dy : dx)));
}

/**
 * Clip contours to the half-plane nx*x + ny*y <= k (Sutherland-Hodgman per
 * contour; with even-odd filling that is exactly shape ∩ half-plane).
 */
export function clipHalf(contours, nx, ny, k) {
  const out = [];
  for (const ct of contours) {
    const n = ct.length / 2, res = [];
    for (let i = 0; i < n; i++) {
      const ax = ct[2 * i], ay = ct[2 * i + 1];
      const j = (i + 1) % n, bx = ct[2 * j], by = ct[2 * j + 1];
      const da = nx * ax + ny * ay - k, db = nx * bx + ny * by - k;
      if (da <= 0) res.push(ax, ay);
      if ((da <= 0) !== (db <= 0)) {
        const u = da / (da - db);
        res.push(ax + (bx - ax) * u, ay + (by - ay) * u);
      }
    }
    if (res.length >= 6) out.push(res);
  }
  return out;
}

// Reused crossing buffer.
const XS = new Float64Array(256);

/**
 * Even-odd scanline fill of `contours` (screen px) in colour `c`.
 * `inverse`: fill the clip area outside the shape instead.
 */
export function fillPoly(g, contours, c, { a = 1, inverse = false } = {}) {
  let ymin = Infinity, ymax = -Infinity;
  for (const ct of contours) for (let i = 1; i < ct.length; i += 2) {
    if (ct[i] < ymin) ymin = ct[i];
    if (ct[i] > ymax) ymax = ct[i];
  }
  const cx0 = g.cx0, cx1 = g.cx1;
  let y0 = Math.max(g.cy0, Math.floor(ymin)), y1 = Math.min(g.cy1, Math.ceil(ymax));
  if (inverse) {
    // Rows the shape misses entirely are one span.
    const top = Math.min(y0, g.cy1), bot = Math.max(y1, g.cy0);
    if (top > g.cy0) g.fillRect(cx0, g.cy0, cx1 - cx0, top - g.cy0, c, { a });
    if (bot < g.cy1) g.fillRect(cx0, bot, cx1 - cx0, g.cy1 - bot, c, { a });
  }
  for (let y = y0; y < y1; y++) {
    const yc = y + 0.5;
    let n = 0;
    if (inverse) XS[n++] = -1e6;
    for (const ct of contours) {
      const m = ct.length;
      for (let i = 0; i < m; i += 2) {
        const ax = ct[i], ay = ct[i + 1];
        const j = i + 2 < m ? i + 2 : 0, bx = ct[j], by = ct[j + 1];
        if ((ay <= yc) !== (by <= yc) && n < 254) XS[n++] = ax + ((yc - ay) * (bx - ax)) / (by - ay);
      }
    }
    if (inverse) XS[n++] = 1e6;
    // Insertion sort: a row crosses a dozen edges at most.
    for (let i = 1; i < n; i++) {
      const v = XS[i];
      let k = i - 1;
      while (k >= 0 && XS[k] > v) { XS[k + 1] = XS[k]; k--; }
      XS[k + 1] = v;
    }
    for (let i = 0; i + 1 < n; i += 2) span(g, XS[i], XS[i + 1], y, c, a, cx0, cx1);
  }
}

function span(g, xa, xb, y, c, a, cx0, cx1) {
  if (xa < cx0) xa = cx0;
  if (xb > cx1) xb = cx1;
  if (xb <= xa) return;
  const ia = Math.floor(xa), ib = Math.floor(xb);
  if (ia === ib) { g.pixel(ia, y, c, { a: (xb - xa) * a }); return; }
  if (xa > ia) g.pixel(ia, y, c, { a: (ia + 1 - xa) * a });
  const fa = xa > ia ? ia + 1 : ia;
  if (ib > fa) g.fillRect(fa, y, ib - fa, 1, c, { a });
  if (xb > ib) g.pixel(ib, y, c, { a: (xb - ib) * a });
}

/**
 * Lay out "HH:MM" at digit height `h` px, centred on (cx, cy). Returns the
 * four digit slots { d, x, y, s } (x, y = slot centre, s = px per unit) and
 * the colon centre.
 */
export function layout(hh, mm, h, cx = 80, cy = 40, { gap = 1.5, colon = 3.4 } = {}) {
  const s = h / UH, cw = UW * s, g = gap * s, cl = colon * s;
  const total = 4 * cw + 4 * g + cl;
  let x = cx - total / 2;
  const slots = [];
  const ds = [hh[0], hh[1], mm[0], mm[1]];
  for (let i = 0; i < 4; i++) {
    if (i === 2) x += cl + g;
    slots.push({ d: ds[i], x: x + cw / 2, y: cy, s, i });
    x += cw + g;
  }
  return { slots, colon: { x: (slots[1].x + slots[2].x) / 2, y: cy, s } };
}

/**
 * Place unit contours by a general affine map about the glyph centre:
 * X = cx + m[0] * x + m[1] * y, Y = cy + m[2] * x + m[3] * y (x, y in units
 * from the centre). Puts type flat on a slanted facade.
 */
export function placeAffine(contours, cx, cy, m, { ox = UW / 2, oy = UH / 2 } = {}) {
  return contours.map((ct) => {
    const out = new Array(ct.length);
    for (let i = 0; i < ct.length; i += 2) {
      const x = ct[i] - ox, y = ct[i + 1] - oy;
      out[i] = cx + m[0] * x + m[1] * y;
      out[i + 1] = cy + m[2] * x + m[3] * y;
    }
    return out;
  });
}

/** Rotate placed contours by `rot` about (px, py), then move by (dx, dy). */
export function turn(contours, px, py, rot, dx = 0, dy = 0) {
  const c = cos(rot), n = sin(rot);
  return contours.map((ct) => {
    const out = new Array(ct.length);
    for (let i = 0; i < ct.length; i += 2) {
      const x = ct[i] - px, y = ct[i + 1] - py;
      out[i] = px + dx + x * c - y * n;
      out[i + 1] = py + dy + x * n + y * c;
    }
    return out;
  });
}

/** Bounding-box centre of placed contours (the first, outer one is enough). */
export function centre(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ct of contours) for (let i = 0; i < ct.length; i += 2) {
    if (ct[i] < x0) x0 = ct[i]; if (ct[i] > x1) x1 = ct[i];
    if (ct[i + 1] < y0) y0 = ct[i + 1]; if (ct[i + 1] > y1) y1 = ct[i + 1];
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
