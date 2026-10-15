// The numerals of katamari.js, as arrangements of things on the floor.
//
// Each digit is designed on a 12 x 22 grid as a few strokes, and each stroke
// is laid with the object that suits it, the way a child would lay them:
//   'L'  a straight run: one pencil or crayon (or a toy car) lying along it
//   'C'  a curve: a chain of round things (sweets, coins, gumballs, buttons)
//        along an elliptical arc, each turned along the curve
//   'P'  a single accent: a die, a block, a rubber duck at a joint
// Straights are long rigid things, curves are chains, so every numeral is a
// clean shape with open counters (a 6's loop is a ring of gumballs, its stem
// one crayon), and the open-topped 4 cannot be read as an A: its crossbar
// is a pencil laid over the stem, its point running well past it.
//
// The grid scales per slot: hours at 2 px a unit (24 x 44), minutes at
// 1.7 px (20 x 37) and laid a little heavier for their size (stroke 3.5
// units, not 3.2), so the hours are made of bigger things and the minutes
// still hold their own.

import { T, makeObj, CANDY } from './katamari-objects.js';
import { rand } from '../js/kit.js';

const { PENCIL: P, CRAYON: C, SWEET: S, COIN: O, GUM: G, DIE: D, BLOCK: B, DUCK: K, CAR: R, BUTTON: U } = T;

// strokes: ['L', x0, y0, x1, y1, type] | ['C', cx, cy, rx, ry, deg0, deg1, n, [types]] | ['P', x, y, type, deg]
// angles: 0 = right, 90 = down (screen)
export const GLYPHS = [
  /* 0 */ [['L', 2.0, 15.2, 2.0, 6.8, P], ['L', 10.0, 6.8, 10.0, 15.2, C],
    ['C', 6, 6.6, 4.0, 4.7, 180, 360, 4, [S, G, S, G]], ['C', 6, 15.4, 4.0, 4.7, 0, 180, 4, [S, O, S, O]]],
  /* 1 */ [['L', 6.6, 20.0, 6.6, 1.6, P], ['L', 2.0, 6.6, 6.3, 2.0, C], ['L', 2.8, 20.3, 10.4, 20.3, R]],
  /* 2 */ [['C', 6, 6.6, 4.2, 4.8, 192, 395, 5, [G, S, O, S, G]], ['L', 9.3, 10.0, 2.1, 19.4, C], ['L', 1.6, 20.3, 10.6, 20.3, P]],
  /* 3 */ [['C', 5.9, 6.1, 4.1, 4.3, 196, 445, 5, [S, G, S, O, S]], ['C', 5.9, 15.5, 4.4, 4.8, 275, 520, 5, [O, S, G, S, G]], ['P', 4.2, 10.8, D, 10]],
  /* 4 */ [['L', 2.0, 1.7, 2.0, 11.6, C], ['L', 8.0, 20.5, 8.0, 1.6, P], ['L', 0.6, 13.4, 12.5, 13.4, P]],
  /* 5 */ [['L', 10.4, 2.0, 1.6, 2.0, P], ['L', 2.1, 2.2, 2.1, 9.6, C], ['C', 5.8, 14.6, 4.5, 5.4, 222, 500, 6, [S, G, S, O, S, G]]],
  /* 6 */ [['L', 9.2, 1.8, 2.3, 13.2, C], ['C', 6.1, 15.6, 4.1, 4.6, 0, 360, 7, [G, S, O, S, G, S, O]]],
  /* 7 */ [['L', 1.6, 2.0, 10.6, 2.0, P], ['L', 9.8, 2.6, 4.2, 20.4, C], ['P', 1.9, 3.8, K, 0]],
  /* 8 */ [['C', 6, 5.9, 3.6, 4.0, 0, 360, 6, [S, G, S, O, S, G]], ['C', 6, 15.7, 4.3, 4.6, 0, 360, 7, [G, S, O, S, G, S, O]]],
  /* 9 */ [['C', 5.9, 6.4, 4.1, 4.6, 0, 360, 7, [G, S, O, S, G, S, O]], ['L', 9.7, 8.8, 3.0, 20.3, C]],
];

export const SLOT_UNIT = { hour: 2.0, min: 1.7 };
export const SLOT_STROKE = { hour: 3.2, min: 3.5 };   // stroke width, grid units

/**
 * The objects of digit d laid out at (x0, y0) with `unit` px per grid unit:
 * a list of { o, x, y, ux, uy } in canvas coordinates, in laying order (the
 * order they are thrown down and picked up). Pure: cache it.
 */
export function layDigit(d, x0, y0, unit, seed, stroke = SLOT_STROKE.hour) {
  const sw = stroke * unit, out = [];
  let ci = (rand(d, seed, 7) * CANDY.length) | 0;
  const colour = () => CANDY[(ci++) % CANDY.length];
  for (const s of GLYPHS[d]) {
    if (s[0] === 'L') {
      const [, ax, ay, bx, by, type] = s;
      const X0 = x0 + ax * unit, Y0 = y0 + ay * unit, X1 = x0 + bx * unit, Y1 = y0 + by * unit;
      const dx = X1 - X0, dy = Y1 - Y0, len = Math.hypot(dx, dy);
      const wid = type === T.PENCIL ? sw * 0.86 : type === T.CAR ? sw * 1.05 : sw;
      out.push({ o: makeObj(type, len + sw * 0.55, wid, colour()), x: (X0 + X1) / 2, y: (Y0 + Y1) / 2, ux: dx / len, uy: dy / len });
    } else if (s[0] === 'C') {
      const [, cx, cy, rx, ry, a0, a1, n, types] = s;
      const full = Math.abs(a1 - a0) >= 359.9, steps = full ? n : n - 1;
      // spacing along the curve, for the sweets' length
      const arc = Math.PI * (rx + ry) * Math.abs(a1 - a0) / 360 * unit;
      const gap = arc / steps;
      for (let i = 0; i < n; i++) {
        const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
        const x = x0 + (cx + rx * Math.cos(a)) * unit, y = y0 + (cy + ry * Math.sin(a)) * unit;
        let tx = -rx * Math.sin(a), ty = ry * Math.cos(a);
        const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
        const type = types[i % types.length];
        const len = type === T.SWEET ? Math.max(gap * 1.25, sw * 1.9) : sw * 1.12;
        const wid = type === T.SWEET ? sw * 0.95 : sw * 1.12;
        out.push({ o: makeObj(type, len, wid, colour()), x, y, ux: tx, uy: ty });
      }
    } else {
      const [, px, py, type, deg] = s, a = (deg * Math.PI) / 180;
      const wid = type === T.DUCK ? sw * 1.25 : sw * 1.25;
      out.push({ o: makeObj(type, type === T.DUCK ? sw * 1.9 : wid, wid, colour()), x: x0 + px * unit, y: y0 + py * unit, ux: Math.cos(a), uy: Math.sin(a) });
    }
  }
  return out;
}
