// Figures for 'illuminated': the scribe's two hands (the left with the
// pen-knife that scrapes, the right with the quill that paints) and the
// small marginal folk who live in the initials and the bas-de-page: a snail,
// a goldfinch, a climbing knight, a hare with a sword. All anti-aliased so
// they glide by fractions of a pixel; each is drawn bold and simple (an ink
// outline, two or three flat colours, a clear eye) because they are 6-14 px.
//
// `tn` is a colour function: the candle's light at the figure (see the face).

import { hex, sin, cos, clamp } from '../js/kit.js';

export const C = {
  ink: hex('2a1a10'), flesh: hex('e8b894'), fleshD: hex('b88060'), sleeve: hex('5a3a26'), sleeveD: hex('3a2416'),
  steel: hex('d8dce4'), steelD: hex('7a808a'), haft: hex('6a3e1e'), quill: hex('f6f2e6'), quillD: hex('c8bca4'),
  shell: hex('c8843a'), shellD: hex('8a5020'), slug: hex('d8cfb8'),
  red: hex('d4442a'), white: hex('fbf6ea'), lapis: hex('2a4cb0'), gold: hex('f0c048'), grey: hex('9aa0aa'), greyD: hex('5a606a'),
  hare: hex('d8c8b0'), hareD: hex('9a8670'), green: hex('3c7a48'),
};

const AA = { aa: true };

/** A rigid little frame: local (u, v) -> screen, rotated by angle a, scaled by k. */
function frameOf(x, y, a, k = 1, flip = 1) {
  const c = cos(a) * k, s = sin(a) * k;
  return (u, v) => [x + (u * flip) * c - v * s, y + (u * flip) * s + v * c];
}

// ------------------------------------------------------------ hands
// Seen from above, as the scribe sees his own hands: the sleeve of the habit
// runs off the bottom of the glass, the fingers pinch the tool near its tip.
// (sx, sy): the direction of the hand's shadow, away from the candle.

function shadowOf(g, F, sx, sy, h) {
  const S = (u, v) => { const p = F(u, v); return [p[0] + sx * h, p[1] + sy * h]; };
  g.thickLine(...S(9, 9), ...S(60, 60), 13, 0x000000, { aa: true, a: 0.2 });
  g.fillEllipse(...S(7, 6), 6, 5, 0x000000, { aa: true, a: 0.16 });
}

/** The right hand holding a quill, tip at (x, y), angle a. */
export function quillHand(g, x, y, a, tn, sx, sy, lift = 0) {
  const F = frameOf(x, y, a);
  shadowOf(g, F, sx, sy, 3 + 4 * lift);
  g.thickLine(...F(1, -1), ...F(20, -19), 1.3, 0x000000, { aa: true, a: 0.15 });
  drawParts(g, [
    Pg([F(4, -3.4), F(9, -9.6), F(15, -16.2), F(22, -22), F(20, -17.2), F(15.6, -11.6), F(9.8, -5.4)], C.quill),
    Ln(F(0, 0), F(18, -17), 0.9, C.quillD, { noOutline: true }),
    Ln(F(16, 16), F(62, 62), 13, C.sleeve),
    Ln(F(15, 15), F(18, 18), 13.5, C.sleeveD, { noOutline: true }),
    E(...F(9.4, 9), 5.4, 4.6, C.fleshD),
    Ln(F(9.6, 9.6), F(6.2, 8.6), 2.3, C.flesh),
    Ln(F(8.6, 6.8), F(3.6, 4.4), 2.4, C.flesh),
    Ln(F(7.4, 4.4), F(2, 1.8), 2.4, C.flesh),
    Ln(F(10.4, 4.6), F(4.4, 0.8), 2.5, C.flesh),
  ], tn);
  g.fillCircle(...F(0.2, 0.2), 0.6, tn(C.ink), { aa: true });
}

/** The left hand with the pen-knife, blade tip at (x, y); `glint` 0..1 flashes the blade. */
export function knifeHand(g, x, y, a, tn, sx, sy, glint = 0, lift = 0) {
  const F = frameOf(x, y, a, 1, -1);
  shadowOf(g, F, sx, sy, 3 + 4 * lift);
  drawParts(g, [
    Pg([F(-0.3, -0.3), F(5.4, 2.4), F(3.8, 5)], C.steel),
    Ln(F(4.6, 3.8), F(11, 10), 2.6, C.haft),
    Ln(F(16, 16), F(62, 62), 13, C.sleeve),
    Ln(F(15, 15), F(18, 18), 13.5, C.sleeveD, { noOutline: true }),
    E(...F(10.8, 10.4), 5.2, 4.4, C.fleshD),
    Ln(F(11, 11), F(7.6, 9.8), 2.3, C.flesh),
    Ln(F(10, 8.2), F(6.4, 6.8), 2.4, C.flesh),
    Ln(F(11.2, 6.4), F(6.6, 3.6), 2.5, C.flesh),
  ], tn);
  g.thickLine(...F(0.2, 0), ...F(5, 2.5), 0.7, glint > 0.02 ? mixc(tn(C.white), 0xffffff, glint) : tn(C.white), { aa: true, a: 0.6 + 0.4 * glint });
}

function mixc(a, b, u) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const gg = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return ((r | 0) << 16) | ((gg | 0) << 8) | (bl | 0);
}

// ------------------------------------------------------------ folk
// Each figure is a short list of parts, drawn twice: first every part in ink,
// grown by the outline width (one silhouette, so the outline never cuts
// across the figure), then the parts in their colours.
const OL = 0.85;
function drawParts(g, parts, tn, a = 1) {
  const ink = tn(C.ink), o = { aa: true, a };
  for (let pass = 0; pass < 2; pass++) {
    const e = pass ? 0 : OL;
    for (const p of parts) {
      if (pass === 0 && p.noOutline) continue;
      const c = pass ? tn(p.c) : ink;
      if (p.t === 'e') g.fillEllipse(p.x, p.y, p.rx + e, p.ry + e, c, o);
      else if (p.t === 'l') g.thickLine(p.x, p.y, p.x1, p.y1, p.w + 2 * e, c, o);
      else if (p.t === 'p') { if (pass) g.fillPolygon(p.pts, c, o); else g.stroke([...p.pts, p.pts[0]], 2 * e, c, o), g.fillPolygon(p.pts, c, o); }
    }
  }
}
const E = (x, y, rx, ry, c, extra) => ({ t: 'e', x, y, rx, ry, c, ...extra });
const Ln = (a, b, w, c, extra) => ({ t: 'l', x: a[0], y: a[1], x1: b[0], y1: b[1], w, c, ...extra });
const Pg = (pts, c, extra) => ({ t: 'p', pts, c, ...extra });

/** A snail facing `dir` (1 right, -1 left), foot at y, `ph` its creep phase, `horn` 0..1+ how far out. */
export function snail(g, x, y, dir, ph, tn, k = 1, horn = 1, a = 1) {
  const st = 0.7 * sin(ph);
  const F = (u, v) => [x + dir * u * k, y + v * k];
  const hl = (1.5 + 0.7 * sin(ph * 0.7)) * horn, hb = F(4.6 + st, -2.2);
  const t1 = F(6.2 + st + 0.5 * hl, -2.4 - hl), t2 = F(4.8 + st + 0.1 * hl, -2.6 - hl * 1.1);
  const [sx, sy] = F(-0.4, -3.9);
  drawParts(g, [
    Ln(hb, t1, 0.55, C.ink), Ln(hb, t2, 0.55, C.ink),
    E(t1[0], t1[1], 0.5, 0.5, C.ink), E(t2[0], t2[1], 0.5, 0.5, C.ink),
    Pg([F(-5, 0), F(5.2 + st, 0), F(6.4 + st, -1.2), F(5 + st, -2.8), F(-3, -1.4)], C.slug),
    E(sx, sy, 3.6 * k, 3.6 * k, C.shell),
    E(sx + 0.5 * dir * k, sy + 0.3 * k, 1.9 * k, 1.9 * k, C.shellD, { noOutline: true }),
    E(sx + 0.7 * dir * k, sy + 0.4 * k, 0.9 * k, 0.9 * k, C.shell, { noOutline: true }),
    E(sx - 1.3 * dir * k, sy - 1.4 * k, 0.9 * k, 0.7 * k, hex('f6d8a0'), { noOutline: true }),
  ], tn, a);
}

/** A goldfinch perched at (x, y) (its feet), facing dir; `peck` 0..1 dips the head, `hop` lifts it. */
export function bird(g, x, y, dir, peck, hop, tn, k = 1, a = 1) {
  y -= hop;
  const F = (u, v) => [x + dir * u * k, y + v * k];
  const hx = 2.6 + 0.9 * peck, hy = -5.6 + 2.3 * peck;
  const h = F(hx, hy);
  drawParts(g, [
    Ln(F(-0.6, -0.3), F(-0.8, -1.8), 0.5, C.ink, { noOutline: true }), Ln(F(0.9, -0.3), F(0.7, -1.8), 0.5, C.ink, { noOutline: true }),
    Pg([F(-2.4, -3.4), F(-6.6, -5), F(-6.4, -3.4), F(-2.2, -2.1)], hex('3a2a20')),
    E(...F(0, -3.4), 3.2 * k, 2.2 * k, hex('c8946a')),
    E(...F(0.7, -2.6), 1.9 * k, 1.1 * k, C.white, { noOutline: true }),
    Pg([F(-2.6, -4.6), F(1.2, -4.4), F(-0.4, -3.0), F(-2.9, -3.4)], hex('2a2020'), { noOutline: true }),
    Ln(F(-2, -3.9), F(0.4, -3.8), 0.9, C.gold, { noOutline: true }),
    E(h[0], h[1], 1.7 * k, 1.7 * k, C.white),
    E(...F(hx + 0.6, hy + 0.2), 1.0 * k, 1.0 * k, C.red, { noOutline: true }),
    E(...F(hx - 0.7, hy - 0.6), 0.9 * k, 0.7 * k, hex('2a2020'), { noOutline: true }),
    Pg([F(hx + 1.4, hy - 0.5), F(hx + 3.2, hy + 0.3 + 0.4 * peck), F(hx + 1.4, hy + 0.8)], hex('f0d8a8')),
    E(...F(hx + 0.4, hy - 0.5), 0.5, 0.5, C.ink, { noOutline: true }),
  ], tn, a);
}

/** A small knight climbing (hands up, legs braced), at (x, y) his middle; `ph` the climbing stride. */
export function knight(g, x, y, dir, ph, tn, k = 1, a = 1) {
  const F = (u, v) => [x + dir * u * k, y + v * k];
  const s = sin(ph), c2 = cos(ph);
  drawParts(g, [
    Ln(F(-0.8, 1.6), F(-1.9 + 0.9 * s, 5.2 - 0.9 * s), 1.4, C.greyD), Ln(F(0.8, 1.6), F(1.7 - 0.9 * s, 5.2 + 0.9 * s), 1.4, C.greyD),
    Ln(F(-1, -1.6), F(-1.6 - 0.4 * c2, -5.4 + 1 * s), 1.2, C.grey), Ln(F(1, -1.6), F(1.8 + 0.4 * c2, -5.4 - 1 * s), 1.2, C.grey),
    E(...F(0, -0.2), 2.1 * k, 2.9 * k, C.white),
    Ln(F(0, -2.6), F(0, 2.2), 0.9, C.red, { noOutline: true }), Ln(F(-1.6, -0.9), F(1.6, -0.9), 0.9, C.red, { noOutline: true }),
    E(...F(0, -4.4), 1.7 * k, 1.8 * k, C.grey),
    Ln(F(-1.2, -4.3), F(1.2, -4.3), 0.5, C.ink, { noOutline: true }),
  ], tn, a);
}

/**
 * A hare with a sword and a red shield, standing at (x, y) (feet), facing
 * dir. `swing` 0..1 raises the sword overhead; `hop` lifts him.
 */
export function hare(g, x, y, dir, swing, hop, tn, k = 1, a = 1) {
  y -= hop;
  const F = (u, v) => [x + dir * u * k, y + v * k];
  const flop = 0.5 * hop;
  const sa = -0.5 - 1.7 * swing;
  const sh = F(1.4, -6.4), hand = [sh[0] + dir * 2.6 * k * cos(sa), sh[1] + 2.6 * k * sin(sa)];
  const tip = [hand[0] + dir * 8 * k * cos(sa - 0.12), hand[1] + 8 * k * sin(sa - 0.12)];
  const gx = -1.3 * sin(sa), gy = 1.3 * cos(sa);
  const brown = hex('a87850'), brownD = hex('7a5232');
  drawParts(g, [
    Ln(F(-0.3, -10.6), F(-2.2 - flop, -16 + flop), 1.5, brown), Ln(F(1, -10.8), F(0.4 - flop, -16.4 + flop), 1.5, brown),
    E(...F(-2.4, -1.9), 3 * k, 1.9 * k, brownD),
    E(...F(-0.6, -5.4), 3.1 * k, 4 * k, brown),
    E(...F(-4.6, -3.6), 1.3 * k, 1.3 * k, C.white),
    E(...F(0.9, -9.6), 2.3 * k, 2.1 * k, brown),
    Ln(F(1, -11), F(0.5 - flop, -15.6 + flop), 0.6, hex('e8a0a0'), { noOutline: true }),
    E(...F(0.5, -4.6), 1.3 * k, 2.3 * k, hex('f0e4cc'), { noOutline: true }),
    E(...F(1.9, -9.9), 0.6, 0.6, C.ink, { noOutline: true }),
    Ln(sh, hand, 1.3, brownD),
    Ln(hand, tip, 1.1, C.steel),
    Ln([hand[0] + gx, hand[1] + gy], [hand[0] - gx, hand[1] - gy], 0.9, C.gold),
    E(...F(2.6, -3.8), 2.1 * k, 2.1 * k, C.red),
    E(...F(2.6, -3.8), 0.7 * k, 0.7 * k, C.gold, { noOutline: true }),
  ], tn, a);
}
