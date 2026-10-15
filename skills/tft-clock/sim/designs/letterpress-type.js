// Letterpress: the type case. Every face cut for this panel as a 1-bit mask
// (1 = the raised printing face, 0 = the routed-away shoulder), built once at
// load from a few solid shapes and supersampled 4 x 4: flash tables.
//
// The numerals are a French Clarendon, the reverse-contrast wood type of the
// 1850s playbill and the WANTED poster: the horizontals (bowl tops and
// bottoms, bars, slabs) are heavy, the verticals light, and the bowls are
// squared superellipses as a router cuts them in end-grain maple. Counters
// stay open and at least 4 x 6 px at the smaller size. The day line is a
// plain Gothic wood type of the same shop; the colon and the line ornament
// are wood-type dingbats. Worn edges: a few one-pixel nicks along each face
// (wood type chips with use), fixed per glyph, never in a thin part.

import { hash } from '../js/kit.js';

const SS = 4;

// ------------------------------------------------------------ solid shapes: inside tests in glyph pixels
const seb = (x0, y0, x1, y1, n = 2.6) => {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = (x1 - x0) / 2, b = (y1 - y0) / 2;
  return (x, y) => Math.abs((x - cx) / a) ** n + Math.abs((y - cy) / b) ** n <= 1;
};
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const cap = (ax, ay, bx, by, r) => (x, y) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = ((x - ax) * dx + (y - ay) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = x - ax - u * dx, ey = y - ay - u * dy;
  return ex * ex + ey * ey <= r * r;
};
const poly = (pts) => (x, y) => {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const ADD = 1, SUB = 0;

function raster(w, h, ops) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          let ins = false;
          for (const [op, f] of ops) {
            if (op === ADD) { if (!ins && f(px, py)) ins = true; } else if (ins && f(px, py)) ins = false;
          }
          if (ins) n++;
        }
      m[y * w + x] = n * 2 >= SS * SS ? 1 : 0;
    }
  return m;
}

// ------------------------------------------------------------ the numerals
// w x h box, V the light (vertical) stroke, T the heavy (horizontal) one
function digitOps(d, w, h, V, T) {
  const ring = (x0, y0, x1, y1, v, t) => [[ADD, seb(x0, y0, x1, y1)], [SUB, seb(x0 + v, y0 + t, x1 - v, y1 - t)]];
  switch (d) {
    case 0: return ring(0, 0, w, h, V, T);
    case 1: {
      const s0 = w / 2 - V * 0.65, s1 = w / 2 + V * 0.95;
      return [
        [ADD, rect(s0, 0, s1, h)],
        [ADD, poly([[s0 + 0.5, 0], [s0 + 0.5, T * 0.95], [w * 0.14, h * 0.18 + T * 0.3], [w * 0.14, h * 0.18 - T * 0.45]])],
        [ADD, rect(w * 0.12, h - T * 0.85, w * 0.9, h)],
      ];
    }
    case 2: {
      const yb = h * 0.56;
      return [
        ...ring(0, 0, w, yb, V, T * 0.9),
        [SUB, rect(-1, h * 0.27, w * 0.5, yb + 1)],          // the left side below the beak
        [SUB, rect(w * 0.3, yb * 0.62, w + 1, yb + 1)],       // the ring's foot: the neck replaces it
        [ADD, poly([[w - V * 1.25, h * 0.33], [w, h * 0.38], [V * 1.4, h - T + 1], [0, h - T + 1]])],
        [ADD, rect(0, h - T, w, h)],
        [ADD, rect(w - V * 0.9, h - T - h * 0.09, w, h)],     // the spur at the end of the foot
      ];
    }
    case 3: {
      const ym = h * 0.47;
      return [
        ...ring(1, 0, w - 1, ym + T * 0.5, V, T * 0.85),
        ...ring(0, ym - T * 0.5, w, h, V, T),
        [SUB, rect(-1, h * 0.25, w * 0.52, ym - T * 0.5)],
        [SUB, rect(-1, ym + T * 0.5, w * 0.52, h * 0.75)],
        [SUB, rect(-1, ym - T * 0.5 - 1, w * 0.3, ym + T * 0.5 + 1)],
      ];
    }
    case 4: {
      const s0 = w * 0.6, s1 = s0 + V * 1.3, yb = h * 0.64;
      return [
        [ADD, rect(s0, 0, s1, h)],
        [ADD, poly([[s0 - 0.5, 0], [s1, 0], [s0 + 0.5, h * 0.15], [V * 1.5, yb + 1], [0, yb + 1], [0, yb - h * 0.03]])],
        [ADD, rect(0, yb, w, yb + T * 0.95)],
        [ADD, rect(s0 - V * 0.9, h - T * 0.75, Math.min(w, s1 + V * 0.9), h)],
      ];
    }
    case 5: {
      const yb = h * 0.36;
      return [
        [ADD, rect(0, 0, w - 1, T)],
        [ADD, rect(w - V * 0.9 - 1, 0, w - 1, T + h * 0.06)],  // the flag's spur
        [ADD, rect(0, 0, V + 0.5, yb + T)],
        ...ring(0, yb, w, h, V, T),
        [SUB, rect(-1, yb + T, w * 0.47, h * 0.75)],
        [SUB, rect(-1, yb - 1, V + 0.5, yb + T)],            // keep the stem's own edge clean
        [ADD, rect(0, T, V + 0.5, yb + T)],
      ];
    }
    case 6: {
      const yb = h * 0.4;
      return [
        ...ring(0, 0, w, h, V, T),
        [SUB, rect(w * 0.5, h * 0.21, w + 1, yb + T + 2)],
        ...ring(0, yb, w, h, V, T),
      ];
    }
    case 7: {
      return [
        [ADD, rect(0, 0, w, T)],
        [ADD, rect(0, 0, V * 0.9, T + h * 0.08)],              // the left spur
        [ADD, poly([[w - V * 1.6, T - 1], [w, T - 1], [w, T + h * 0.06], [w * 0.36 + V * 1.25, h], [w * 0.36 - V * 0.15, h]])],
      ];
    }
    case 8: {
      const ym = h * 0.47;
      return [
        [ADD, seb(1, 0, w - 1, ym + T * 0.5 + 1)],
        [ADD, seb(0, ym - T * 0.5 - 1, w, h)],
        [SUB, seb(V + 1, T * 0.9, w - V - 1, ym - T * 0.45)],
        [SUB, seb(V, ym + T * 0.5, w - V, h - T)],
      ];
    }
    default: return [];
  }
}

function digitMask(d, w, h, V, T) {
  if (d === 9) {                                   // the 6 turned end for end, as type founders cut it
    const m6 = digitMask(6, w, h, V, T), m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = m6[w * h - 1 - i];
    return m;
  }
  return raster(w, h, digitOps(d, w, h, V, T));
}

// ------------------------------------------------------------ the day line: a Gothic wood type
function letterOps(ch, w, h, V) {
  const T = V, mid = h / 2;
  const ringOps = (x0, y0, x1, y1) => [[ADD, seb(x0, y0, x1, y1, 2.4)], [SUB, seb(x0 + V, y0 + T, x1 - V, y1 - T, 2.4)]];
  switch (ch) {
    case 'S': return [
      ...ringOps(0, 0, w, mid + T / 2 + 0.5), ...ringOps(0, mid - T / 2 - 0.5, w, h),
      [SUB, rect(w * 0.55, h * 0.26, w + 1, mid - T / 2)], [SUB, rect(-1, mid + T / 2, w * 0.45, h * 0.74)],
    ];
    case 'U': return [[ADD, rect(0, 0, V, h * 0.6)], [ADD, rect(w - V, 0, w, h * 0.6)], ...ringOps(0, h * 0.2, w, h), [SUB, rect(V, 0, w - V, h * 0.6)]];
    case 'N': return [[ADD, rect(0, 0, V, h)], [ADD, rect(w - V, 0, w, h)], [ADD, poly([[0, 0], [V * 1.3, 0], [w, h], [w - V * 1.3, h]])]];
    case 'M': return [[ADD, rect(0, 0, V, h)], [ADD, rect(w - V, 0, w, h)],
      [ADD, poly([[0, 0], [V * 1.2, 0], [w / 2 + 0.6, h * 0.62], [w / 2 - 0.6, h * 0.62 + 2]])],
      [ADD, poly([[w, 0], [w - V * 1.2, 0], [w / 2 - 0.6, h * 0.62], [w / 2 + 0.6, h * 0.62 + 2]])]];
    case 'W': return [[ADD, rect(0, 0, V, h)], [ADD, rect(w - V, 0, w, h)],
      [ADD, poly([[0, h], [V * 1.2, h], [w / 2 + 0.6, h * 0.38], [w / 2 - 0.6, h * 0.38 - 2]])],
      [ADD, poly([[w, h], [w - V * 1.2, h], [w / 2 - 0.6, h * 0.38], [w / 2 + 0.6, h * 0.38 - 2]])]];
    case 'O': return ringOps(0, 0, w, h);
    case 'T': return [[ADD, rect(0, 0, w, T)], [ADD, rect(w / 2 - V / 2, 0, w / 2 + V / 2, h)]];
    case 'E': return [[ADD, rect(0, 0, V, h)], [ADD, rect(0, 0, w, T)], [ADD, rect(0, mid - T / 2, w - 2, mid + T / 2)], [ADD, rect(0, h - T, w, h)]];
    case 'F': return [[ADD, rect(0, 0, V, h)], [ADD, rect(0, 0, w, T)], [ADD, rect(0, mid - T / 2, w - 2, mid + T / 2)]];
    case 'H': return [[ADD, rect(0, 0, V, h)], [ADD, rect(w - V, 0, w, h)], [ADD, rect(0, mid - T / 2, w, mid + T / 2)]];
    case 'I': return [[ADD, rect(w / 2 - V / 2, 0, w / 2 + V / 2, h)], [ADD, rect(w / 2 - V * 1.5, 0, w / 2 + V * 1.5, T - 1)], [ADD, rect(w / 2 - V * 1.5, h - T + 1, w / 2 + V * 1.5, h)]];
    case 'D': return [...ringOps(-w * 0.6, 0, w, h), [ADD, rect(0, 0, V, h)], [SUB, rect(-w, -1, 0, h + 1)]];
    case 'R': return [[ADD, rect(0, 0, V, h)], ...ringOps(-w * 0.5, 0, w, mid + T / 2), [SUB, rect(-w, -1, 0, h + 1)],
      [ADD, rect(0, 0, w * 0.4, T)], [ADD, rect(0, mid - T / 2, w * 0.5, mid + T / 2)],
      [ADD, poly([[w * 0.38, mid], [w * 0.38 + V * 1.3, mid], [w, h], [w - V * 1.3, h]])]];
    case 'A': return [
      [ADD, poly([[w / 2 - V * 0.9, 0], [w / 2 + V * 0.9, 0], [w, h], [w - V * 1.25, h]])],
      [ADD, poly([[w / 2 - V * 0.9, 0], [w / 2 + V * 0.9, 0], [V * 1.25, h], [0, h]])],
      [SUB, poly([[w / 2, T + 0.5], [w - V * 1.6, h * 0.62], [V * 1.6, h * 0.62]])],
      [ADD, rect(V * 0.8, h * 0.62, w - V * 0.8, h * 0.62 + T)],
    ];
    default: return [];
  }
}

// ------------------------------------------------------------ ornaments
function lozenge(w, h) {         // the colon: two heavy lozenges, a wood-type dingbat pair
  const c = w / 2, r = w / 2;
  const one = (cy) => poly([[c, cy - r - 1], [c + r, cy], [c, cy + r + 1], [c - r, cy]]);
  return raster(w, h, [[ADD, one(h * 0.34)], [ADD, one(h * 0.7)]]);
}
function star(w, h) {            // the line's ornament: a four-point printer's star with a dot
  const cx = w / 2, cy = h / 2, R = w / 2, r = w * 0.15;
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, q = k % 2 ? r : R;
    pts.push([cx + q * Math.sin(a), cy - q * Math.cos(a) * 1.25]);
  }
  return raster(w, h, [[ADD, poly(pts)]]);
}

/** Wear: one-pixel nicks on the face's edge where a hash says so, only where the stroke is thick. */
function wear(m, w, h, seed, rate) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
  const out = m.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      if (!edge) continue;
      // thick here: the pixel two steps in, on the opposite side of the open one, is face too
      const thick = (!at(x - 1, y) ? at(x + 3, y) : 1) && (!at(x + 1, y) ? at(x - 3, y) : 1) &&
        (!at(x, y - 1) ? at(x, y + 3) : 1) && (!at(x, y + 1) ? at(x, y - 3) : 1);
      if (thick && hash(x, y, seed) % 1000 < rate) out[y * w + x] = 0;
    }
  return out;
}

// ------------------------------------------------------------ the case
export const SIZES = {
  H: { w: 30, h: 64, V: 6, T: 9.5 },    // the hours: 64-line wood type
  M: { w: 26, h: 40, V: 5, T: 7 },      // the minutes: 40-line
};
export const LETTER = { w: 14, h: 14, V: 3 };
export const COLON = { w: 8, h: 30 };
export const STAR = { w: 8, h: 11 };

export const DIGITS = {};
for (const k of Object.keys(SIZES)) {
  const { w, h, V, T } = SIZES[k];
  DIGITS[k] = [];
  for (let d = 0; d < 10; d++) DIGITS[k].push(wear(digitMask(d, w, h, V, T), w, h, d * 31 + (k === 'H' ? 7 : 3), 55));
}
export const LETTERS = {};
for (const ch of 'SUNMOTEWDHFRIA') LETTERS[ch] = wear(raster(LETTER.w, LETTER.h, letterOps(ch, LETTER.w, LETTER.h, LETTER.V)), LETTER.w, LETTER.h, ch.charCodeAt(0), 20);
export const COLON_MASK = lozenge(COLON.w, COLON.h);
export const STAR_MASK = star(STAR.w, STAR.h);

/** Flash used by the case, bytes (1 byte a mask pixel). */
export const TYPE_BYTES = 10 * (SIZES.H.w * SIZES.H.h + SIZES.M.w * SIZES.M.h) + 14 * LETTER.w * LETTER.h + COLON.w * COLON.h + STAR.w * STAR.h;
