// tarot: the palette and the inked pen every card is drawn with.
//
// The look is the Tarot de Marseille: black woodblock lines over flat
// stencil colours (red, blue, sky, yellow, flesh, green) on cream paper.

import { sin, cos } from '../js/kit.js';

export const INK = 0x1c1612, PAPER = 0xf2e4c0, PAPER2 = 0xdfcc9f;
export const RED = 0xc8302a, BLUE = 0x2a58a8, SKY = 0x86c0dc, YEL = 0xecb52e;
export const FLESH = 0xf4c69c, GREEN = 0x3f8c48, WHITE = 0xfff6e0, ORANGE = 0xd9772a;

export const CW = 38, CH = 64;              // a card
export const PX = 3, PY = 15, PW = 32, PH = 38;   // its picture box, relative to the card

// ------------------------------------------------------------ the pen
// Every shape is inked the woodcut way: a black line round a flat fill.
// Coordinates are the picture box's own (0..32, 0..38); `tf` bends them
// (rotation of a swinging part), and with it rects become polygons.

export function pen(g, ox, oy, tf = null) {
  const P = tf ? (x, y) => { const q = tf(x, y); return [ox + q[0], oy + q[1]]; } : (x, y) => [ox + x, oy + y];
  const pts = (list) => list.map(([x, y]) => P(x, y));
  const p = {
    g, ox, oy, tf, P,
    /** A pen whose coordinates are first passed through `f`, then through this pen's. */
    with(f) { return pen(g, ox, oy, tf ? (x, y) => { const q = f(x, y); return tf(q[0], q[1]); } : f); },
    fill(list, c) { g.fillPolygon(pts(list), c); return p; },
    poly(list, c) {
      const q = pts(list);
      g.fillPolygon(q, c);
      g.stroke([...q, q[0]], 1, INK);
      return p;
    },
    rect(x, y, w, h, c) {
      if (tf) return p.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c);
      g.fillRect(ox + x - 1, oy + y - 1, w + 2, h + 2, INK);
      g.fillRect(ox + x, oy + y, w, h, c);
      return p;
    },
    box(x, y, w, h, c) {
      if (tf) return p.fill([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c);
      g.fillRect(ox + x, oy + y, w, h, c);
      return p;
    },
    disc(x, y, r, c) { const [a, b] = P(x, y); g.fillCircle(a, b, r + 1, INK); g.fillCircle(a, b, r, c); return p; },
    dot(x, y, r, c) { const [a, b] = P(x, y); g.fillCircle(a, b, r, c); return p; },
    ell(x, y, rx, ry, c) { const [a, b] = P(x, y); g.fillEllipse(a, b, rx + 1, ry + 1, INK); g.fillEllipse(a, b, rx, ry, c); return p; },
    cap(x0, y0, x1, y1, w, c) {
      const [a, b] = P(x0, y0), [d, e] = P(x1, y1);
      g.thickLine(a, b, d, e, w + 2, INK);
      g.thickLine(a, b, d, e, w, c);
      return p;
    },
    bar(x0, y0, x1, y1, w, c) { const [a, b] = P(x0, y0), [d, e] = P(x1, y1); g.thickLine(a, b, d, e, w, c); return p; },
    line(x0, y0, x1, y1, c = INK) { const [a, b] = P(x0, y0), [d, e] = P(x1, y1); g.thickLine(a, b, d, e, 1, c); return p; },
    px(x, y, c) { const [a, b] = P(x, y); g.pixel(a, b, c); return p; },
    /** A soft light: translucent anti-aliased disc. */
    glow(x, y, r, c, a) { const [u, v] = P(x, y); g.fillCircle(u, v, r, c, { aa: true, a }); return p; },
  };
  return p;
}

/** Rotation by `a` radians about (cx, cy), for pen.with(). */
export const rot = (cx, cy, a) => {
  const c = cos(a), s = sin(a);
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
