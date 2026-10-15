// The actors of cropcircle.js, seen from straight above like the field: the
// saucer and the mothership, Holstein cows, the farmer's tractor and the
// scarecrow. All anti-aliased kit shapes (they glide by fractions of a
// pixel), bold outlines and a few flat colours, each with the shadow that
// makes a thing seen from above read as a thing.

import { sin, cos } from '../js/kit.js';

const OUT = 0x141a22;

// moonlight: at night every actor's colours go toward the field's navy
let NK = 0;
export function setNight(k) { NK = k; }
function T(c) {
  if (NK <= 0) return c;
  const k = NK * 0.55, f = (v, n) => (v + (n - v) * k) | 0;
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, l = (r + g + b) / 3;
  return (f(r, l * 0.55) << 16) | (f(g, l * 0.7 + 10) << 8) | f(b, l * 0.95 + 30);
}

/** A polygon for an ellipse rotated by `ang`, `n` points. */
function ell(cx, cy, rx, ry, ang, n = 12) {
  const ca = cos(ang), sa = sin(ang), pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * 6.2832, ex = rx * cos(t), ey = ry * sin(t);
    pts.push([cx + ex * ca - ey * sa, cy + ex * sa + ey * ca]);
  }
  return pts;
}
/** A rotated box in local coordinates (x forward). */
function box(cx, cy, ang, x0, y0, x1, y1) {
  const ca = cos(ang), sa = sin(ang);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
}
const AA = { aa: true };

/**
 * The saucer, tipped towards the viewer the way saucers wobble: a dark rim,
 * a lit metal hull over a darker skirt, a ring of chasing lights along the
 * skirt, a glass dome. `spin` chases the lights; `sh` = [dx, dy] is where its
 * shadow falls (its height), `shA` how dark.
 */
export function saucer(g, x, y, R, spin, nl, sh, shA, dome = T(0x48e8c8)) {
  const ry = R * 0.6;
  if (shA > 0) g.fillEllipse(x + sh[0], y + sh[1], R * 0.95, R * 0.8, 0x000000, { aa: true, a: shA });
  g.fillEllipse(x, y + R * 0.1, R + 1.1, ry + 1.3, T(OUT), AA);
  g.fillEllipse(x, y + R * 0.14, R, ry, T(0x56606c), AA);
  g.fillEllipse(x, y - R * 0.04, R * 0.97, ry * 0.8, T(0xa4b2be), AA);
  g.fillEllipse(x - R * 0.28, y - R * 0.12, R * 0.5, ry * 0.36, T(0xe0e8ee), { aa: true, a: 0.7 });
  for (let k = 0; k < nl; k++) {
    const t = ((k + 0.5) / nl) * Math.PI, on = 0.5 + 0.5 * sin(k * 1.9 - spin * 3);
    const c = [T(0xff5040), T(0xffd040), T(0x58ff8c)][k % 3];
    g.fillCircle(x - R * 0.84 * cos(t), y + R * 0.14 + ry * 0.62 * sin(t), R > 12 ? 1.3 : 0.95, c, { aa: true, a: 0.35 + 0.65 * on });
  }
  const dy = y - R * 0.26, dr = R * 0.44;
  g.fillCircle(x, dy, dr + 0.9, T(OUT), AA);
  g.fillCircle(x, dy, dr, dome, AA);
  g.fillEllipse(x, dy + dr * 0.45, dr * 0.9, dr * 0.45, T(0x1c8a88), { aa: true, a: 0.5 });
  g.fillCircle(x - dr * 0.35, dy - dr * 0.38, dr * 0.3, T(0xf4fffc), AA);
}

/**
 * The mothership: a wide gunmetal disc, tipped, its panel spokes turning,
 * a crown of white and amber lights chasing round the rim and a mint core.
 */
export function mothership(g, x, y, R, spin, sh, shA) {
  const ry = R * 0.5;
  if (shA > 0) g.fillEllipse(x + sh[0], y + sh[1], R, R * 0.7, 0x000000, { aa: true, a: shA });
  g.fillEllipse(x, y + R * 0.08, R + 1.3, ry + 1.4, T(OUT), AA);
  g.fillEllipse(x, y + R * 0.1, R, ry, T(0x2c323e), AA);
  g.fillEllipse(x, y - R * 0.02, R * 0.96, ry * 0.8, T(0x5e6a7a), AA);
  g.fillEllipse(x - R * 0.3, y - R * 0.12, R * 0.45, ry * 0.3, T(0xb8c4d0), { aa: true, a: 0.5 });
  // panel spokes, turning
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * 6.2832 + spin * 0.5, ca = cos(a), sa = sin(a);
    g.thickLine(x + ca * R * 0.42, y - R * 0.02 + sa * ry * 0.34, x + ca * R * 0.92, y - R * 0.02 + sa * ry * 0.76, 0.8, T(0x3a4250), { aa: true, a: 0.8 });
  }
  g.fillEllipse(x, y - R * 0.04, R * 0.44, ry * 0.4, T(OUT), AA);
  g.fillEllipse(x, y - R * 0.04, R * 0.38, ry * 0.32, T(0x7a8696), AA);
  g.fillEllipse(x, y - R * 0.08, R * 0.24, ry * 0.2, T(0x58ffc8), AA);
  g.fillEllipse(x - R * 0.06, y - R * 0.11, R * 0.1, ry * 0.08, T(0xf0fff8), AA);
  // the crown of lights, chasing round the rim (the near half brighter)
  for (let k = 0; k < 22; k++) {
    const t = (k / 22) * 6.2832 + spin * 0.25, st = sin(t), on = 0.5 + 0.5 * sin(k * 1.3 - spin * 4);
    const near = st > 0 ? 1 : 0.45;
    g.fillCircle(x + R * 0.9 * cos(t), y + R * 0.1 + ry * 0.78 * st, 1.15, k & 1 ? T(0xfff4d8) : T(0xffb040), { aa: true, a: near * (0.35 + 0.65 * on) });
  }
}

/**
 * A Holstein, drawn side-on like the tipped saucer (from straight above a
 * cow is a blob): white with black patches, four legs, pink muzzle, horns.
 * `ang` tilts it (it tumbles slowly when floating), `s` scales it, `face`
 * is +1 or -1 (which way it looks), `chew` nods the head as it grazes.
 */
export function cow(g, x, y, ang, s, face, sh, shA, chew) {
  if (shA > 0) g.fillEllipse(x + sh[0], y + 5 * s + sh[1], 6.5 * s, 2 * s, 0x000000, { aa: true, a: shA });
  const ca = cos(ang), sa = sin(ang), at = (u, v) => [x + (u * face * ca - v * sa) * s, y + (u * face * sa + v * ca) * s];
  const nod = 0.8 + 0.8 * sin(chew);
  const L = (u0, v0, u1, v1, w, c) => { const [a0, b0] = at(u0, v0), [a1, b1] = at(u1, v1); g.thickLine(a0, b0, a1, b1, w * s, c, AA); };
  const E = (u, v, rx, ry, c) => { const [px, py] = at(u, v); g.fillPolygon(ell(px, py, rx * s, ry * s, ang * face, 10), c, AA); };
  // tail, legs (outlined), body, head
  L(-5.6, -1.4, -6.8, 2.6, 1, T(OUT));
  for (const u of [-3.8, -2.2, 2.4, 3.9]) { L(u, 1.5, u + 0.1, 5.4, 1.9, T(OUT)); L(u, 1.5, u + 0.1, 5, 1, T(0xf2f0ea)); }
  E(0, 0, 6.2, 3.6, T(OUT));
  E(0, 0, 5.5, 2.9, T(0xf6f4ee));
  for (const [u, v, r] of [[-2.6, -0.9, 1.6], [1.4, 0.6, 1.8], [3.6, -1.4, 1], [-4.4, 1.2, 0.8]]) E(u, v, r * 1.1, r * 0.9, T(0x1c1816));
  E(1.2, 2.8, 1, 0.6, T(0xf0a0a4));
  E(6.6, -2 + nod, 2.6, 2.1, T(OUT));
  E(6.6, -2 + nod, 2, 1.55, T(0xf6f4ee));
  E(5.9, -2.6 + nod, 1, 0.9, T(0x1c1816));
  E(8.1, -1.4 + nod, 1.1, 0.95, T(0xf0a0a4));
  L(5.6, -3.6 + nod, 5.2, -5 + nod, 0.9, T(0xe8e0c8));
  const [ex, ey] = at(7, -2.6 + nod);
  g.fillCircle(ex, ey, 0.5 * s, T(0x101010), AA);
}

/** The farmer's tractor from above, heading `ang`: red bonnet, white cab roof, big rear tyres. */
export function tractor(g, x, y, ang, sh, shA) {
  if (shA > 0) g.fillPolygon(box(x + sh[0], y + sh[1], ang, -6, -4.5, 8, 4.5), 0x000000, { aa: true, a: shA });
  for (const side of [-1, 1]) {
    g.fillPolygon(box(x, y, ang, -6, side * 3.1 - 1.6, -0.6, side * 3.1 + 1.6), T(0x16161a), AA);
    g.fillPolygon(box(x, y, ang, 4.2, side * 2.6 - 0.9, 7.4, side * 2.6 + 0.9), T(0x16161a), AA);
  }
  g.fillPolygon(box(x, y, ang, -5.2, -2.2, 8.2, 2.2), T(OUT), AA);
  g.fillPolygon(box(x, y, ang, -1.5, -1.6, 7.6, 1.6), T(0xd8302a), AA);
  g.fillPolygon(box(x, y, ang, 1.8, -0.6, 7.2, 0.6), T(0xff6a50), { aa: true, a: 0.7 });
  const [ex, ey] = box(x, y, ang, 3, -1.1, 3, -1.1)[0];
  g.fillCircle(ex, ey, 0.7, T(0x202020), AA);
  // the farmer on the open seat: blue shoulders under a wide straw hat
  g.fillPolygon(box(x, y, ang, -4.6, -2.4, -1.6, 2.4), T(0x2a4a90), AA);
  const [fx, fy] = box(x, y, ang, -3, 0, -3, 0)[0];
  g.fillCircle(fx, fy, 2.7, T(OUT), AA);
  g.fillCircle(fx, fy, 2.2, T(0xe8c460), AA);
  g.fillCircle(fx - 0.3, fy - 0.3, 1.1, T(0xf8e090), AA);
}

/** The scarecrow from above: a straw hat on a crossbar of sleeves, and its long shadow. */
export function scarecrow(g, x, y, sh, shA, sway) {
  if (shA > 0) {
    const L = Math.hypot(sh[0], sh[1]) || 1, ux = sh[0] / L, uy = sh[1] / L;
    const bx = x + sh[0] * 0.7, by = y + sh[1] * 0.7;
    g.thickLine(x, y, x + sh[0], y + sh[1], 1.6, 0x000000, { aa: true, a: shA });
    g.thickLine(bx - uy * 7, by + ux * 7, bx + uy * 7, by - ux * 7, 2, 0x000000, { aa: true, a: shA });
    g.fillCircle(x + sh[0] * 1.08, y + sh[1] * 1.08, 3.4, 0x000000, { aa: true, a: shA });
  }
  const s = 0.5 * sway;
  g.thickLine(x - 7.5, y + s, x + 7.5, y - s, 3.4, T(OUT), AA);
  g.thickLine(x - 7, y + s, x + 7, y - s, 2.3, T(0x3a64b0), AA);
  g.thickLine(x - 3, y + s * 0.4 - 0.2, x - 1, y - 0.2, 1, T(0x88a8e0), { aa: true, a: 0.6 });
  for (const sd of [-1, 1]) {
    g.fillCircle(x + sd * 7.6, y - sd * s, 1.7, T(OUT), AA);
    g.fillCircle(x + sd * 7.6, y - sd * s, 1.25, T(0xf2d060), AA);
  }
  g.fillCircle(x, y, 4.5, T(OUT), AA);
  g.fillCircle(x, y, 3.9, T(0xc09048), AA);
  g.fillCircle(x - 0.6, y - 0.6, 2.4, T(0xe8c068), AA);
  g.ring(x, y, 2.3, 3, T(0xa0302a), AA);
}

/** A crow from above: on the ground (wings folded) or flying (wings beating, `flap` 0..1). */
export function crow(g, x, y, ang, flying, flap, sh, shA) {
  const ca = cos(ang), sa = sin(ang), at = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  if (shA > 0) g.fillCircle(x + sh[0], y + sh[1], 1.8, 0x000000, { aa: true, a: shA });
  if (flying) {
    const span = 3.2 + 1.6 * flap;
    for (const sd of [-1, 1]) { const [wx, wy] = at(-0.6 - flap, sd * span); const [bx, by] = at(0.3, 0); g.thickLine(bx, by, wx, wy, 1.5, T(0x101014), AA); }
  }
  const [hx, hy] = at(2, 0), [bx, by] = at(3.3, 0), [tx, ty] = at(-2.6, 0);
  g.thickLine(x, y, tx, ty, 1.4, T(0x101014), AA);
  g.fillPolygon(ell(x, y, 2.1, 1.3, ang, 8), T(0x16161c), AA);
  g.fillCircle(hx, hy, 1.05, T(0x16161c), AA);
  g.thickLine(hx, hy, bx, by, 0.7, T(0x8a8478), AA);
}
