// The things on the floor for katamari.js: pencils, crayons, wrapped sweets,
// coins, gumballs, dice, toy blocks, rubber ducks, toy cars, buttons.
//
// Every object is drawn with the kit's anti-aliased shapes from a centre
// (x, y), an axis (ux, uy) (a unit vector: the way a pencil points, a car
// drives) and a scale k, so the same drawing serves the object lying in a
// numeral (cached once a minute into the floor), flying through the air, and
// stuck to the turning katamari (drawn smaller, fewer details).
//
// The look is the game's: chunky low-poly toys, flat bright colours, one
// lighter facet, and a dark plum keyline round everything so a pile of them
// reads as one shape on the floor.

import { hex, mix } from '../js/kit.js';

export const OUT = hex('2c1b3d');          // the keyline: deep plum, not black (the LCD's black is grey)
const WHITE = hex('fffaf0'), SILVER = hex('c9d2e0'), WOOD = hex('f4c98e'), LEAD = hex('4a4458');
const ERASER = hex('ff8fa8'), GOLD = hex('ffcf3a'), GOLD_D = hex('d8901c'), GLASS = hex('9fe6ff');
const BEAK = hex('ff8a2a'), TYRE = hex('3a3046');

export const T = { PENCIL: 0, CRAYON: 1, SWEET: 2, COIN: 3, GUM: 4, DIE: 5, BLOCK: 6, DUCK: 7, CAR: 8, BUTTON: 9 };
export const ELONGATED = [true, true, false, false, false, false, false, false, false, false];

/** Candy colours: lemon, bubblegum, mint, sky, tangerine, grape, cherry. */
export const CANDY = ['ffe14d', 'ff7ec4', '58e0a8', '5ec4ff', 'ff9f40', 'b58cff', 'ff5a6e'].map(hex);

/**
 * An object description. `len` along the axis, `wid` across it, in pixels at
 * k = 1. Colours are worked out once here (light facet, shade), not per frame.
 */
export function makeObj(type, len, wid, c) {
  if (type === T.DUCK) c = hex('ffd93a');
  if (type === T.COIN) c = GOLD;
  if (type === T.DIE) c = WHITE;
  return { type, len, wid, c, lit: mix(c, 0xffffff, 0.5), dk: mix(c, OUT, 0.35) };
}

// ------------------------------------------------------------ helpers

const AA = { aa: true };
// Corners of an oriented box from a to b along the axis, half-widths wa at a and wb at b.
function quad(x, y, ux, uy, a, b, wa, wb) {
  const vx = -uy, vy = ux;
  return [
    [x + ux * a + vx * wa, y + uy * a + vy * wa], [x + ux * b + vx * wb, y + uy * b + vy * wb],
    [x + ux * b - vx * wb, y + uy * b - vy * wb], [x + ux * a - vx * wa, y + uy * a - vy * wa],
  ];
}
function quadOff(x, y, ux, uy, a, b, o0, o1) {
  // a strip between offsets o0 and o1 across the axis (o0 < o1), from a to b along it
  const vx = -uy, vy = ux;
  return [
    [x + ux * a + vx * o0, y + uy * a + vy * o0], [x + ux * b + vx * o0, y + uy * b + vy * o0],
    [x + ux * b + vx * o1, y + uy * b + vy * o1], [x + ux * a + vx * o1, y + uy * a + vy * o1],
  ];
}
function tri(x, y, ux, uy, a, b, w) {
  const vx = -uy, vy = ux;
  return [[x + ux * a + vx * w, y + uy * a + vy * w], [x + ux * b, y + uy * b], [x + ux * a - vx * w, y + uy * a - vy * w]];
}

/**
 * Draw object `o` centred at (x, y), axis (ux, uy), scale k.
 * `side`: the thickness seen in the three-quarter view (pixels, 0 for none).
 * `detail`: false draws only the silhouette, fill and one facet (for things
 * stuck on the ball, where a pencil is a few pixels long).
 */
export function drawObj(g, o, x, y, ux, uy, k, side = 1.2, detail = true, kl = 1) {
  const L = o.len * k * kl, w = o.wid * k, h = w / 2, e = 0.85;   // e: keyline thickness
  const c = o.c;
  switch (o.type) {
    case T.PENCIL: {
      const back = -L / 2, cone = L / 2 - Math.min(L * 0.24, w * 1.5), tip = L / 2;
      const sil = (dy, ex) => {
        const p = quad(x, y + dy, ux, uy, back - ex, cone, h + ex, h + ex);
        g.fillPolygon([p[0], p[1], [x + ux * (tip + ex * 1.4), y + dy + uy * (tip + ex * 1.4)], p[2], p[3]], OUT, AA);
      };
      if (side) sil(side, e);
      sil(0, e);
      g.fillPolygon(quad(x, y, ux, uy, back + w * 0.9, cone, h, h), c, AA);
      g.fillPolygon(tri(x, y, ux, uy, cone, tip, h), WOOD, AA);
      if (!detail) break;
      g.fillPolygon(quadOff(x, y, ux, uy, back + w * 0.9, cone, -h, -h * 0.15), o.lit, AA);
      g.fillPolygon(tri(x, y, ux, uy, tip - (tip - cone) * 0.42, tip, h * 0.42), LEAD, AA);
      g.fillPolygon(quad(x, y, ux, uy, back + w * 0.45, back + w * 0.95, h, h), SILVER, AA);
      g.fillPolygon(quad(x, y, ux, uy, back, back + w * 0.5, h, h), ERASER, AA);
      break;
    }
    case T.CRAYON: {
      const back = -L / 2, cone = L / 2 - Math.min(L * 0.2, w * 1.1), tip = L / 2;
      const sil = (dy, ex) => {
        const p = quad(x, y + dy, ux, uy, back - ex, cone, h + ex, h + ex);
        const q = quad(x, y + dy, ux, uy, cone, tip + ex, h + ex, h * 0.45 + ex);
        g.fillPolygon([p[0], p[1], q[1], q[2], p[2], p[3]], OUT, AA);
      };
      if (side) sil(side, e);
      sil(0, e);
      g.fillPolygon(quad(x, y, ux, uy, back, cone, h, h), c, AA);
      g.fillPolygon(quad(x, y, ux, uy, cone - 0.2, tip, h * 0.95, h * 0.45), o.dk, AA);
      if (!detail) break;
      g.fillPolygon(quadOff(x, y, ux, uy, back, cone, -h, -h * 0.25), o.lit, AA);
      // the paper wrapper's two printed bands
      const b0 = back + (cone - back) * 0.22, b1 = back + (cone - back) * 0.66;
      g.fillPolygon(quad(x, y, ux, uy, b0, b0 + Math.max(1, w * 0.22), h, h), o.dk, AA);
      g.fillPolygon(quad(x, y, ux, uy, b1, b1 + Math.max(1, w * 0.22), h, h), o.dk, AA);
      break;
    }
    case T.SWEET: {
      const rx = L * 0.29, tw = L / 2;
      const bow = (dy, ex, col) => {
        g.fillPolygon(quad(x, y + dy, ux, uy, rx * 0.5, tw + ex, h * 0.25 + ex, h * 0.95 + ex), col, AA);
        g.fillPolygon(quad(x, y + dy, ux, uy, -rx * 0.5, -tw - ex, h * 0.25 + ex, h * 0.95 + ex), col, AA);
      };
      const body = (dy, ex, col) => g.fillEllipse(x, y + dy, rx + ex, h + ex, col, AA);
      if (side) { bow(side, e, OUT); body(side, e, OUT); }
      bow(0, e, OUT); body(0, e, OUT);
      bow(0, 0, o.lit);
      body(0, 0, c);
      if (!detail) break;
      // a wrapper stripe across the sweet and a shine
      g.fillPolygon(quad(x, y, ux, uy, -rx * 0.18, rx * 0.18, h * 0.95, h * 0.95), WHITE, { aa: true, a: 0.55 });
      g.fillEllipse(x - rx * 0.4 * ux - 0.2, y - h * 0.45, Math.max(0.6, rx * 0.25), Math.max(0.5, h * 0.22), WHITE, AA);
      break;
    }
    case T.COIN: case T.GUM: case T.BUTTON: {
      const r = h;
      if (side) g.fillCircle(x, y + side, r + e, OUT, AA);
      g.fillCircle(x, y, r + e, OUT, AA);
      if (o.type === T.COIN) {
        g.fillCircle(x, y, r, GOLD_D, AA);
        g.fillCircle(x - 0.25, y - 0.3, r * 0.74, GOLD, AA);
        if (detail) g.fillCircle(x - r * 0.3, y - r * 0.35, Math.max(0.5, r * 0.26), hex('fff6c8'), AA);
      } else if (o.type === T.GUM) {
        g.fillCircle(x, y, r, o.dk, AA);
        g.fillCircle(x - r * 0.12, y - r * 0.14, r * 0.82, c, AA);
        if (detail) g.fillCircle(x - r * 0.38, y - r * 0.4, Math.max(0.55, r * 0.28), WHITE, AA);
      } else {
        g.fillCircle(x, y, r, c, AA);
        g.fillCircle(x, y, r * 0.7, o.lit, AA);
        if (detail) {
          const d = r * 0.3, vx = -uy, vy = ux;
          g.fillCircle(x + vx * d, y + vy * d, Math.max(0.5, r * 0.17), OUT, AA);
          g.fillCircle(x - vx * d, y - vy * d, Math.max(0.5, r * 0.17), OUT, AA);
        }
      }
      break;
    }
    case T.DIE: case T.BLOCK: {
      const s = h;
      if (side) g.fillPolygon(quad(x, y + side, ux, uy, -s - e, s + e, s + e, s + e), OUT, AA);
      g.fillPolygon(quad(x, y, ux, uy, -s - e, s + e, s + e, s + e), OUT, AA);
      g.fillPolygon(quad(x, y, ux, uy, -s, s, s, s), o.type === T.DIE ? hex('e8dcd0') : o.dk, AA);
      g.fillPolygon(quad(x - 0.2, y - 0.3, ux, uy, -s * 0.78, s * 0.78, s * 0.78, s * 0.78), o.type === T.DIE ? WHITE : c, AA);
      if (!detail) break;
      if (o.type === T.DIE) {
        const pr = Math.max(0.55, s * 0.17), d = s * 0.45, vx = -uy, vy = ux;
        g.fillCircle(x, y, pr, OUT, AA);
        g.fillCircle(x + (ux + vx) * d, y + (uy + vy) * d, pr, OUT, AA);
        g.fillCircle(x - (ux + vx) * d, y - (uy + vy) * d, pr, OUT, AA);
      } else {
        g.fillPolygon(quad(x - 0.2, y - 0.3, ux, uy, -s * 0.34, s * 0.34, s * 0.34, s * 0.34), o.lit, AA);
      }
      break;
    }
    case T.DUCK: {
      // body along the axis, head up at the front, beak further on; facing ux's sign
      const f = ux >= 0 ? 1 : -1, bx = x - f * L * 0.08, by = y + h * 0.15;
      const hx = x + f * L * 0.22, hy = y - h * 0.45, hr = h * 0.62;
      const shape = (dy, ex, cb, ch) => {
        g.fillEllipse(bx, by + dy, L * 0.42 + ex, h * 0.78 + ex, cb, AA);
        g.fillCircle(hx, hy + dy, hr + ex, ch, AA);
      };
      if (side) shape(side, e, OUT, OUT);
      shape(0, e, OUT, OUT);
      g.fillPolygon([[hx + f * hr * 0.6, hy - hr * 0.05], [hx + f * (hr + L * 0.2) + f * e, hy + hr * 0.25], [hx + f * hr * 0.6, hy + hr * 0.55]], OUT, AA);
      g.fillPolygon([[hx + f * hr * 0.6, hy + hr * 0.05], [hx + f * (hr + L * 0.18), hy + hr * 0.25], [hx + f * hr * 0.6, hy + hr * 0.45]], BEAK, AA);
      shape(0, 0, c, c);
      if (!detail) break;
      g.fillEllipse(bx - f * L * 0.08, by - h * 0.05, L * 0.2, h * 0.32, o.dk, AA);   // the wing
      g.fillCircle(hx + f * hr * 0.25, hy - hr * 0.25, Math.max(0.6, hr * 0.26), OUT, AA);
      break;
    }
    case T.CAR: {
      const sil = (dy, ex) => g.fillPolygon(quad(x, y + dy, ux, uy, -L / 2 - ex, L / 2 + ex, h + ex, h + ex), OUT, AA);
      const vx = -uy, vy = ux;
      const wheel = (a, sd, r, col) => g.fillCircle(x + ux * a + vx * sd, y + uy * a + vy * sd, r, col, AA);
      if (side) sil(side, e);
      for (const a of [-L * 0.28, L * 0.28]) for (const sd of [-h, h]) wheel(a, sd, w * 0.24 + e, OUT);
      sil(0, e);
      for (const a of [-L * 0.28, L * 0.28]) for (const sd of [-h, h]) wheel(a, sd, w * 0.24, TYRE);
      g.fillPolygon(quad(x, y, ux, uy, -L / 2, L / 2, h * 0.86, h * 0.86), c, AA);
      if (!detail) break;
      g.fillPolygon(quad(x, y, ux, uy, -L * 0.2, L * 0.16, h * 0.62, h * 0.62), OUT, AA);
      g.fillPolygon(quad(x, y, ux, uy, -L * 0.14, L * 0.1, h * 0.5, h * 0.5), GLASS, AA);
      g.fillPolygon(quad(x, y, ux, uy, L * 0.3, L / 2, h * 0.4, h * 0.4), o.lit, AA);
      break;
    }
  }
}
