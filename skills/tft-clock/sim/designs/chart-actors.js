// The engraved figures of chart.js, drawn flat with the kit's AA shapes so
// they glide by fractions of a pixel: the ship in profile (as chart ships
// always are, whatever the projection), the cartographer's quill, the
// storm's wind-head and the whale.

import { sin, cos, clamp } from '../js/kit.js';
import { M } from './chart-sheet.js';

const AA = { aa: true };
let SC = 1;

/** Map ship-space points (x forward, y up negative) through flip `fx` (-1..1), heel `h` (rad) and position. */
function xf(pts, x, y, fx, h) {
  const c = cos(h), s = sin(h), k = SC;
  return pts.map(([px, py]) => {
    const qx = px * fx;
    py *= k;
    return [x + qx * c - py * s, y + qx * s + py * c];
  });
}

const HULL = [[-6.5, -3], [7, -3], [4.8, 0.6], [-5.2, 0.6]];
const CASTLE = [[-6.6, -5.2], [-3.4, -5.2], [-3.4, -2.8], [-6.6, -2.8]];
const MAIN_O = [[-3.6, -13.6], [3.3, -13.6], [3.8, -5.0], [-4.1, -5.0]];
const MAIN_I = [[-2.8, -12.8], [2.5, -12.8], [2.9, -5.8], [-3.2, -5.8]];
const FORE_O = [[3.6, -11.2], [7.4, -11.2], [7.8, -5.0], [3.4, -5.0]];
const FORE_I = [[4.3, -10.5], [6.7, -10.5], [7.0, -5.8], [4.1, -5.8]];

/** The ship at waterline centre (x, y). `fx` is the flip (1 east, -1 west), `heel` radians, `t` seconds. */
export function ship(g, pal, x, y, fx, heel, t, wake, scale = 1) {
  fx *= scale; SC = scale;
  const ink = pal[M.INK], paper = pal[M.PAPER];
  // the wake: engraved strokes trailing on the water, and a curl at the bow
  const back = -Math.sign(fx || 1);
  for (const [yy, l0, l1, a] of [[0.9, 6, 13 * wake + 6, 0.75], [2.2, 4, 9 * wake + 4, 0.5]])
    g.thickLine(x + back * l0, y + yy, x + back * l1, y + yy + 0.3, 0.7, ink, { aa: true, a });
  g.thickLine(x - back * 5.5, y + 1.2, x - back * 8.5, y + 1.6, 0.7, ink, { aa: true, a: 0.5 });
  g.fillPolygon(xf(HULL, x, y, fx, heel), ink, AA);
  g.fillPolygon(xf(CASTLE, x, y, fx, heel), ink, AA);
  const m0 = xf([[0, -3], [0, -15], [5.6, -3], [5.6, -12], [7, -3], [10.5, -5.4]], x, y, fx, heel);
  g.thickLine(m0[0][0], m0[0][1], m0[1][0], m0[1][1], 0.95, ink, AA);
  g.thickLine(m0[2][0], m0[2][1], m0[3][0], m0[3][1], 0.85, ink, AA);
  g.thickLine(m0[4][0], m0[4][1], m0[5][0], m0[5][1], 0.8, ink, AA);
  g.fillPolygon(xf(MAIN_O, x, y, fx, heel), ink, AA);
  g.fillPolygon(xf(MAIN_I, x, y, fx, heel), paper, AA);
  g.fillPolygon(xf(FORE_O, x, y, fx, heel), ink, AA);
  g.fillPolygon(xf(FORE_I, x, y, fx, heel), paper, AA);
  // the pennant streams aft from the main truck
  const w = sin(t * 7) * 0.8;
  g.fillPolygon(xf([[0, -15.6], [-5.5, -15.0 + w], [0, -14.0]], x, y, fx, heel), pal[M.RED], AA);
}

/** The cartographer's quill, nib at (x, y), leaning up and right. `a` opacity. */
export function quill(g, pal, x, y, a, t) {
  if (a <= 0) return;
  const ink = pal[M.INK], paper = pal[M.PAPER];
  const ang = -1.0 + 0.06 * sin(t * 9);           // a little writing tremor
  const ux = cos(ang), uy = sin(ang), nx = -uy, ny = ux;
  const at = (s, w) => [x + ux * s + nx * w, y + uy * s + ny * w];
  const vane = (grow) => {
    const L = [], Rr = [];
    for (let i = 0; i <= 6; i++) {
      const s = 7 + (17 * i) / 6, e = Math.pow(Math.max(0, Math.sin((Math.PI * i) / 6)), 0.7);
      L.push(at(s + (i === 6 ? grow : 0), -(2.0 * e + grow)));
      Rr.push(at(s + (i === 6 ? grow : 0), 3.4 * e + grow));
    }
    return [at(7 - grow, 0), ...Rr, ...L.reverse()];
  };
  g.fillPolygon(vane(0.8), ink, { aa: true, a });
  g.fillPolygon(vane(0), paper, { aa: true, a });
  // barbs, and the shaft
  for (const s of [12, 16.5, 20.5]) { const p = at(s, 0), q = at(s + 2.2, 2.6); g.thickLine(p[0], p[1], q[0], q[1], 0.6, ink, { aa: true, a: 0.8 * a }); }
  const sh = at(26, 0), nb = at(7.5, 0);
  g.thickLine(x, y, sh[0], sh[1], 0.8, ink, { aa: true, a });
  g.thickLine(x, y, nb[0], nb[1], 1.4, ink, { aa: true, a });
}

/** The storm's wind-head in its cloud, blowing west, at (x, y) (its mouth). `a` presence 0..1. */
export function windHead(g, pal, x, y, a, t) {
  if (a <= 0) return;
  const ink = pal[M.INK], cloud = pal[M.CLOUD];
  const puffs = [[9, -6, 6.5], [18, -8, 6], [24, -1, 6.5], [16, 5, 6], [26, 8, 5], [7, 6, 4.5]];
  for (const [dx, dy, r] of puffs) g.fillCircle(x + dx, y + dy, r + 0.9, ink, AA);
  for (const [dx, dy, r] of puffs) g.fillCircle(x + dx, y + dy, r, cloud, AA);
  // the face: puffed cheek, eye, pursed lips
  const puff = 0.3 * sin(t * 6);
  g.fillCircle(x + 7, y, 5.6 + puff, ink, AA);
  g.fillCircle(x + 7, y, 4.8 + puff, pal[M.PAPER], AA);
  g.fillCircle(x + 6, y + 1.6, 1.8 + puff, pal[M.RED], { aa: true, a: 0.55 });
  g.fillRect(Math.round(x + 5), Math.round(y - 2), 1, 1, ink);
  g.thickLine(x + 4, y - 3.4, x + 6.5, y - 3.8, 0.7, ink, AA);
  g.fillCircle(x + 1.6, y + 1.2, 1.4, ink, AA);
  // the wind: three strands of dashes streaming west
  for (let k = 0; k < 3; k++) {
    const sl = (k - 1) * 0.14;
    for (let j = 0; j < 4; j++) {
      const ph = ((t * 46 + j * 14 + k * 5) % 56);
      const x0 = x - 1 - ph, x1 = x0 - 7;
      const fade = clamp(1 - ph / 56, 0, 1) * a;
      g.thickLine(x0, y + 1.2 + sl * (x - x0), x1, y + 1.2 + sl * (x - x1), 0.75, ink, { aa: true, a: 0.85 * fade });
    }
  }
}

/**
 * A whale in the strait, in profile as chart whales are, waterline y: it
 * surfaces (`rise` 0..1), spouts (`spout` 0..1), and sinks again, its
 * flukes lifting as it dives (`fluke` 0..1). Facing east.
 */
const WHALE = [[-8, -1.6], [-5, -3.4], [0, -4.6], [4, -5.0], [7.4, -4.4], [8.8, -2.6], [8.4, 0.6], [-6, 0.6], [-8.2, -0.4]];
const TAIL = [[-7.6, -1.4], [-11.4, -4.8], [-10.3, -1.5], [-12.0, 0.4], [-7.6, -0.4]];
export function whale(g, pal, cx, y, rise, spout, fluke, t) {
  const ink = pal[M.INK], body = pal[M.SERP];
  if (rise > 0) {
    const dy = y + (1 - rise) * 6;
    const P = (pts, grow) => pts.map(([px, py]) => [cx + px * (1 + grow / 9), dy + py * (1 + grow / 4)]);
    g.clip(cx - 14, y - 9, 28, 9.5);
    g.fillPolygon(P(WHALE, 0.9), ink, AA);
    g.fillPolygon(P(WHALE, 0), body, AA);
    g.fillPolygon(P(TAIL, 0), ink, AA);
    g.thickLine(cx + 6.8, dy - 1.0, cx - 4, dy - 0.5, 0.7, pal[M.PAPER], AA);     // the pale belly line
    g.thickLine(cx + 8.6, dy - 1.6, cx + 5, dy - 1.7, 0.6, ink, AA);              // the mouth
    g.fillRect(Math.round(cx + 4.6), Math.round(dy - 3.2), 1, 1, ink);           // the eye
    g.unclip();
    for (const dx of [-14, 9.5]) g.thickLine(cx + dx, y + 1, cx + dx + 3, y + 1, 0.6, ink, { aa: true, a: 0.7 * rise });
  }
  if (spout > 0 && rise > 0.8) {
    // the spout: an engraved fountain, three jets fanning and falling as drops
    const h = 8 * Math.sin(Math.PI * Math.min(1, spout * 1.4) / 2), bx = cx + 4.5, by = y - 5.2;
    const a = spout < 0.8 ? 1 : (1 - spout) / 0.2;
    for (const k of [-1, 0, 1]) {
      const tx = bx + k * 2.8 * Math.min(1, spout * 1.6), ty = by - h + Math.abs(k) * 1.6;
      g.thickLine(bx + k * 0.4, by, tx, ty, 0.7, ink, { aa: true, a: 0.85 * a });
      if (spout > 0.45) g.fillCircle(tx + k * 1.3, ty + 1.6 + (spout - 0.45) * 6, 0.55, ink, { aa: true, a: 0.8 * a });
    }
  }
  if (fluke > 0) {
    // diving: the flukes stand up out of the water and slide down
    const fy = y - 7 * Math.sin(Math.PI * fluke), fx = cx - 6;
    g.clip(cx - 14, 0, 28, y + 0.5);
    const F = [[fx - 0.9, y + 1], [fx - 1.0, fy + 1.6], [fx - 4.6, fy - 1.3], [fx - 2.6, fy + 0.2], [fx, fy + 0.7], [fx + 2.6, fy + 0.2], [fx + 4.6, fy - 1.3], [fx + 1.0, fy + 1.6], [fx + 0.9, y + 1]];
    g.fillPolygon(F, ink, AA);
    g.unclip();
  }
}
