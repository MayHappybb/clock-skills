// fridge-art.js: the drawn parts of the 'fridge' face.
//   POETRY   a proportional lowercase for magnetic-poetry tiles (9 rows:
//            2 ascender, 5 x-height, 2 descender)
//   LETTERS  chunky plastic alphabet magnets as centre-line polylines
//   hand()   an arm reaching in, pinching something, with its own shadow

import { makeFont, mix } from '../js/kit.js';

// ------------------------------------------------------------ poetry type
const _ = (...rows) => rows;
const P = {
  a: _('....', '....', '.##.', '...#', '.###', '#..#', '.###', '....', '....'),
  c: _('...', '...', '.##', '#..', '#..', '#..', '.##', '...', '...'),
  d: _('...#', '...#', '.###', '#..#', '#..#', '#..#', '.###', '....', '....'),
  e: _('....', '....', '.##.', '#..#', '####', '#...', '.###', '....', '....'),
  f: _('.##', '#..', '###', '#..', '#..', '#..', '#..', '...', '...'),
  g: _('....', '....', '.###', '#..#', '#..#', '#..#', '.###', '...#', '.##.'),
  h: _('#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#', '....', '....'),
  i: _('#', '.', '#', '#', '#', '#', '#', '.', '.'),
  k: _('#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#', '....', '....'),
  l: _('#', '#', '#', '#', '#', '#', '#', '.', '.'),
  m: _('.....', '.....', '####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '.....', '.....'),
  n: _('....', '....', '###.', '#..#', '#..#', '#..#', '#..#', '....', '....'),
  o: _('....', '....', '.##.', '#..#', '#..#', '#..#', '.##.', '....', '....'),
  p: _('....', '....', '###.', '#..#', '#..#', '#..#', '###.', '#...', '#...'),
  q: _('....', '....', '.###', '#..#', '#..#', '#..#', '.###', '...#', '...#'),
  r: _('....', '....', '#.##', '##..', '#...', '#...', '#...', '....', '....'),
  s: _('...', '...', '.##', '#..', '.#.', '..#', '##.', '...', '...'),
  t: _('...', '.#.', '###', '.#.', '.#.', '.#.', '..#', '...', '...'),
  u: _('....', '....', '#..#', '#..#', '#..#', '#..#', '.###', '....', '....'),
  v: _('...', '...', '#.#', '#.#', '#.#', '#.#', '.#.', '...', '...'),
  w: _('.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.', '.....', '.....'),
  x: _('...', '...', '#.#', '#.#', '.#.', '#.#', '#.#', '...', '...'),
  y: _('....', '....', '#..#', '#..#', '#..#', '#..#', '.###', '...#', '.##.'),
  "'": _('#', '#', '.', '.', '.', '.', '.', '.', '.'),
  ' ': _('..', '..', '..', '..', '..', '..', '..', '..', '..'),
};
export const POETRY = makeFont({ name: 'poetry', height: 9, spacing: 1, glyphs: P, fallback: ' ' });

// ------------------------------------------------------------ alphabet magnets
// Centre lines in a box 0..w x 0..14 (y down); drawn with a round 4.4 px pen.
const ell = (cx, cy, rx, ry, a0, a1, n) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
const PI = Math.PI;
export const LETTERS = {
  O: { w: 9, lines: [ell(4.5, 7, 4.5, 7, 0, 2 * PI, 18)] },
  N: { w: 9, lines: [[[0, 14], [0, 0], [9, 14], [9, 0]]] },
  E: { w: 8, lines: [[[8, 0], [0, 0], [0, 14], [8, 14]], [[0, 7], [6, 7]]] },
  T: { w: 9, lines: [[[0, 0], [9, 0]], [[4.5, 0], [4.5, 14]]] },
  W: { w: 12, lines: [[[0, 0], [3, 14], [6, 4], [9, 14], [12, 0]]] },
  H: { w: 9, lines: [[[0, 0], [0, 14]], [[9, 0], [9, 14]], [[0, 7], [9, 7]]] },
  R: { w: 9, lines: [[[0, 14], [0, 0], [5, 0], ...ell(5, 3.5, 3.8, 3.5, -PI / 2, PI / 2, 6).slice(1), [0, 7]], [[4, 7], [9, 14]]] },
  F: { w: 8, lines: [[[8, 0], [0, 0], [0, 14]], [[0, 7], [6, 7]]] },
  U: { w: 9, lines: [[[0, 0], ...ell(4.5, 9.5, 4.5, 4.5, PI, 0, 8), [9, 0]]] },
  I: { w: 0, lines: [[[0, 0], [0, 14]]] },
  V: { w: 10, lines: [[[0, 0], [5, 14], [10, 0]]] },
  S: { w: 9, lines: [[[9, 1.8], [7, 0], [2.5, 0], [0, 2.2], [0, 4.8], [2.5, 6.8], [6.5, 7.2], [9, 9.2], [9, 12], [6.6, 14], [2, 14], [0, 12.4]]] },
  X: { w: 9, lines: [[[0, 0], [9, 14]], [[9, 0], [0, 14]]] },
  G: { w: 9, lines: [[[9, 2], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [9, 12], [9, 8], [5.5, 8]]] },
  L: { w: 8, lines: [[[0, 0], [0, 14], [8, 14]]] },
  M: { w: 11, lines: [[[0, 14], [0, 0], [5.5, 8], [11, 0], [11, 14]]] },
  D: { w: 9, lines: [[[0, 0], [0, 14], [4, 14], [7.5, 12.8], [9, 9.6], [9, 4.4], [7.5, 1.2], [4, 0], [0, 0]]] },
};
export const PEN = 4.4;

/** Outer width of a letter magnet in pixels. */
export const letterW = (ch) => LETTERS[ch].w + PEN;

/** The letter's polylines, rotated by `rot` about its centre and centred on (cx, cy). */
export function letterLines(ch, cx, cy, rot, k = 1) {
  const L = LETTERS[ch], c = Math.cos(rot), s = Math.sin(rot), mx = L.w / 2, my = 7;
  return L.lines.map((pl) => pl.map(([x, y]) => {
    const u = (x - mx) * k, v = (y - my) * k;
    return [cx + u * c - v * s, cy + u * s + v * c];
  }));
}

// ------------------------------------------------------------ hands
export const SKIN = { adult: 0xe2a882, kid: 0xf0c09a };
export const SLEEVE = { adult: 0x34477a, kid: 0xe8b420 };


/** The parts of a hand pinching at grip `G`, its arm running to `B` (off the glass). */
function handParts(G, B, S, pinch) {
  const dx = B[0] - G[0], dy = B[1] - G[1];
  const l = Math.hypot(dx, dy) || 1;
  const d = [dx / l, dy / l], n = [d[1], -d[0]];
  // hand-local (u back along the arm, v across it), in units of S
  const at = (u, v) => [G[0] + (d[0] * u + n[0] * v) * S, G[1] + (d[1] * u + n[1] * v) * S];
  const open = 1 - pinch;                            // finger and thumb part when not holding
  return {
    d, n, at,
    index: [at(0, 1.1 + 2.6 * open), at(5, 2.6 + 1.2 * open), at(10, 4.4)],
    thumb: [at(0.6, -1.1 - 2.6 * open), at(6.5, -4.6 - open), at(12, -4.2)],
    fist: [at(10.5, 6.6), at(13, 8.2), at(15.5, 8.6)],
    palm: at(15, 1.8),
    wrist: at(21, 0.6),
    cuff: at(27, 0.4),
  };
}

/**
 * A hand pinching at (gx, gy), its arm coming from (bx, by). `z` is how far
 * the hand is off the door (its shadow walks away), `pinch` 1 when closed.
 */
export function hand(g, gx, gy, bx, by, { who = 'adult', z = 0, pinch = 1, shade = 0 } = {}) {
  const S = who === 'adult' ? 1.2 : 0.9;
  const Hp = handParts([gx, gy], [bx, by], S, pinch);
  const skin = mix(SKIN[who], 0x1a1020, shade), dark = mix(skin, 0x6a2a1a, 0.4);
  const sleeve = mix(SLEEVE[who], 0x101020, shade);
  const draw = (o, col, a, grow = 0) => {
    const tr = (p) => [p[0] + o[0], p[1] + o[1]];
    const opt = { aa: true, a };
    g.thickLine(...tr(Hp.wrist), ...tr([bx, by]), 9 * S + grow, col.skin, opt);
    g.thickLine(...tr(Hp.cuff), ...tr([bx, by]), 13 * S + grow, col.sleeve, opt);
    g.fillCircle(...tr(Hp.palm), 6.4 * S + grow / 2, col.skin, opt);
    g.stroke(Hp.fist.map(tr), 5.2 * S + grow, col.skin, opt);
    g.stroke(Hp.thumb.map(tr), 4.2 * S + grow, col.skin, opt);
    g.stroke(Hp.index.map(tr), 3.8 * S + grow, col.skin, opt);
  };
  // the shadow: further from the door, further down-right and softer
  const so = [1.5 + 2.2 * z, 2 + 2.6 * z];
  draw(so, { skin: 0x0c2a22, sleeve: 0x0c2a22 }, 0.1, 2.5);
  draw(so, { skin: 0x0c2a22, sleeve: 0x0c2a22 }, 0.14, 0);
  draw([0, 0], { skin, sleeve }, 1);
  // shade: the far side of the arm, the crease where the curled fingers meet the palm
  g.stroke([Hp.at(13, -5.2), Hp.at(26, -4.6)], 1.8 * S, dark, { aa: true, a: 0.5 });
  g.stroke([Hp.at(9.5, 4.2), Hp.at(12.5, 6.0), Hp.at(15.5, 6.4)], 1.1 * S, dark, { aa: true, a: 0.55 });
  g.stroke([Hp.at(6.5, -2.6), Hp.at(11, -2.2)], 1.0 * S, dark, { aa: true, a: 0.4 });
  // the cuff's rib
  g.stroke([Hp.at(27, -6.4), Hp.at(27, 7)], 1.6 * S, mix(sleeve, 0xffffff, 0.2), { aa: true });
  if (who === 'kid') {
    for (const u of [31, 36, 41]) g.stroke([Hp.at(u, -6.4), Hp.at(u, 7)], 2.2 * S, mix(0xd8322a, 0x101020, shade), { aa: true });
  }
// fingernails catch the light
  const nail = mix(skin, 0xffffff, 0.5);
  const tip = Hp.at(1.2, 1.6 + 2.6 * (1 - pinch));
  g.fillCircle(tip[0], tip[1], 1.0 * S, nail, { aa: true, a: 0.8 });
}
