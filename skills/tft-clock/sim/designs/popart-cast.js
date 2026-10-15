// The cast for popart.js: flat cel drawings, every shape a flat fill with an
// ink keyline (drawn as the same shape inflated in ink first), no shading.
// Each actor is a list of polygons in its own coordinates; poses are rigid
// moves (translate, a 2-D turn), the motion of cut-out cels.

const P = { ink: 0x1a1714, paper: 0xf4ead0, white: 0xfffaf0, red: 0xe5262c, yellow: 0xffd52a, cyan: 0x22a0dc, blue: 0x2650b0, skin: 0xf6c3a0, grey: 0xd9dfe6 };
export const CAST_PAL = P;

/** Move a polygon: turn by `a` (radians) about the origin, scale, then translate. */
function placeAt(pts, x, y, a = 0, s = 1) {
  return place(pts, x, y, a, s);
}
function place(pts, x, y, a = 0, s = 1) {
  const c = Math.cos(a) * s, n = Math.sin(a) * s;
  return pts.map(([px, py]) => [x + px * c - py * n, y + px * n + py * c]);
}
/** Inflate a polygon about its centroid by `d` px (keyline): good enough for these convex-ish cels. */
function grow(pts, d) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * d, y + (dy / l) * d];
  });
}
/** A cel: ink keyline then flat fill. */
export function cel(g, pts, c, { key = 1, aa = true } = {}) {
  if (key > 0) g.fillPolygon(grow(pts, key), P.ink, { aa });
  g.fillPolygon(pts, c, { aa });
}

// ------------------------------------------------------------ the jet (after Whaam!), facing right, 46 x 14
const JET = {
  tail: [[0, 7], [2, 0], [8, 0], [12, 5]],
  body: [[0, 6], [8, 4.2], [28, 3.4], [39, 4], [46, 6.6], [39, 8.4], [28, 9.2], [6, 9.2], [0, 8.4]],
  canopy: [[22, 4], [25.5, 0.8], [32, 0.8], [36, 4]],
  wing: [[17, 7.5], [31, 7.5], [22, 13.5], [13, 13.5]],
  stripe: [[33, 4.1], [36, 4.2], [36, 8.8], [33, 9]],
};
export function jet(g, x, y, t, { a = 0, s = 1, flip = false } = {}) {
  const place = (pts, X, Y, A, S) => placeAt(flip ? pts.map(([u, v]) => [-u, v]) : pts, X, Y, A, S);
  const fl = 4 + 2.5 * (0.5 + 0.5 * Math.sin(t * 41)), k = s > 1 ? 1.6 : 1;
  cel(g, place([[1, 5.4], [-fl - 3, 7.3], [1, 9]], x, y, a, s), P.red, { key: k });
  g.fillPolygon(place([[1, 6.4], [-fl, 7.3], [1, 8.2]], x, y, a, s), P.yellow, { aa: true });
  cel(g, place(JET.tail, x, y, a, s), P.grey, { key: k });
  cel(g, place(JET.body, x, y, a, s), P.grey, { key: k });
  cel(g, place(JET.canopy, x, y, a, s), P.cyan, { key: k });
  g.fillPolygon(place(JET.stripe, x, y, a, s), P.red, { aa: true });
  // the pilot's helmet in the canopy
  const [hx, hy] = place([[29.5, 2.6]], x, y, a, s)[0];
  g.fillCircle(hx, hy, 1.4 * s, P.white, { aa: true });
  cel(g, place(JET.wing, x, y, a, s), P.grey, { key: k });
  // a roundel on the wing
  const [rx, ry] = place([[21, 10.5]], x, y, a, s)[0];
  g.fillCircle(rx, ry, 1.9 * s, P.blue, { aa: true });
  g.fillCircle(rx, ry, 0.9 * s, P.white, { aa: true });
}
/** A missile, nose at (x, y) heading `a`. */
export function missile(g, x, y, a) {
  cel(g, place([[-9, -1.3], [-1.5, -1.3], [1, 0], [-1.5, 1.3], [-9, 1.3]], x, y, a), P.white);
  g.fillPolygon(place([[-2.2, -1.3], [1, 0], [-2.2, 1.3]], x, y, a), P.red, { aa: true });
  g.fillPolygon(place([[-9, -1.3], [-11, -3], [-7.5, -1.3]], x, y, a), P.red, { aa: true });
  g.fillPolygon(place([[-9, 1.3], [-11, 3], [-7.5, 1.3]], x, y, a), P.red, { aa: true });
}

// ------------------------------------------------------------ the ray gun in a gloved hand, muzzle along +x
const GUN = {
  body: [[2, -3.5], [18, -3.5], [21, -1.8], [21, 1.8], [18, 3.5], [2, 3.5]],
  fin1: [[5, -3.5], [8, -8], [12, -8], [12, -3.5]],
  fin2: [[3, 3.5], [1, 7], [5, 7], [8, 3.5]],
  barrel: [[21, -1.3], [28, -1.3], [28, 1.3], [21, 1.3]],
  ring1: [[23, -2.8], [24.6, -2.8], [24.6, 2.8], [23, 2.8]],
  hand: [[6, 1], [15, 1], [16.5, 5], [15, 11], [6, 11], [4, 6]],
  cuff: [[5.5, 11], [15.5, 11], [16, 16], [5, 16]],
};
export function raygun(g, x, y, a, t, charge, sc = 1) {
  const place = (pts, X, Y, A) => placeAt(pts, X, Y, A, sc);
  cel(g, place(GUN.cuff, x, y, a), P.white);
  cel(g, place(GUN.fin1, x, y, a), P.yellow);
  cel(g, place(GUN.fin2, x, y, a), P.yellow);
  cel(g, place(GUN.barrel, x, y, a), P.cyan);
  cel(g, place(GUN.body, x, y, a), P.red);
  cel(g, place(GUN.ring1, x, y, a), P.yellow);
  cel(g, place(GUN.hand, x, y, a), P.skin);
  // knuckle lines
  for (const k of [4, 6.8]) {
    const [a0, a1] = place([[7, k], [14.5, k]], x, y, a);
    g.thickLine(a0[0], a0[1], a1[0], a1[1], 0.9, P.ink, { aa: true });
  }
  // the muzzle's energy rings, always pulsing out
  const [mx, my] = place([[30, 0]], x, y, a)[0];
  for (let k = 0; k < 3; k++) {
    const u = (t * 1.6 + k / 3) % 1, r = (1.5 + u * 6 * (1 + charge)) * sc;
    if (u > 0.08) g.ring(mx + Math.cos(a) * r * 0.6, my + Math.sin(a) * r * 0.6, r - 0.6, r + 0.6, k === 1 ? P.yellow : P.cyan, { aa: true, a: 1 - u * 0.6 });
  }
}

// ------------------------------------------------------------ the fist, punching up, knuckles at (x, y)
const FIST = {
  sleeve: [[-7, 12], [7, 12], [9, 70], [-9, 70]],
  cuff: [[-7.5, 9], [7.5, 9], [7.5, 13], [-7.5, 13]],
  fist: [[-8, -1], [-4, -4], [4, -4], [8, -1], [8.5, 6], [6, 10], [-6, 10], [-8.5, 6]],
  thumb: [[-8.5, 4], [-1, 3.5], [1, 6], [-7, 7.5]],
};
export function fist(g, x, y) {
  cel(g, place(FIST.sleeve, x, y), P.blue);
  cel(g, place(FIST.cuff, x, y), P.white);
  cel(g, place(FIST.fist, x, y), P.skin);
  // finger creases, the thumb across them
  for (const k of [-4, 0, 4]) g.thickLine(x + k, y - 3.5, x + k, y + 1.5, 0.9, P.ink, { aa: true });
  cel(g, place(FIST.thumb, x, y), P.skin, { key: 0.8 });
}

// ------------------------------------------------------------ the girl's eyes (after the crying-girl paintings)
/** One eye centred at (x, y), 22 x 10, `open` 0..1, gaze (gx, gy) in px. Mirror with `m` = -1. */
export function eye(g, x, y, open, gx, gy, m = 1) {
  const X = (u) => x + u * m;
  // brow: a heavy curved ink stroke
  g.stroke([[X(-11), y - 5], [X(-5), y - 9.5], [X(4), y - 10], [X(10), y - 7]], 2.2, P.ink, { aa: true });
  const h = 4.6 * open;
  if (h > 0.6) {
    const white = [[X(-11), y + 0.5], [X(-6), y - h], [X(4), y - h - 0.5], [X(11), y - 1], [X(5), y + h * 0.75], [X(-5), y + h * 0.7]];
    g.fillPolygon(white, P.white, { aa: true });
    g.clip(Math.min(X(-11), X(11)) - 1, y - h - 1, 24, 2 * h + 2);
    g.fillCircle(x + gx, y + gy, 4.3, P.cyan, { aa: true });
    g.fillCircle(x + gx, y + gy, 2.1, P.ink, { aa: true });
    g.unclip();
    // lower lid line
    g.stroke([[X(-10), y + 1], [X(-5), y + h * 0.7 + 0.4], [X(5), y + h * 0.75 + 0.4], [X(10), y]], 1, P.ink, { aa: true });
  }
  // upper lid: the thick lashed line, it comes down to blink
  const lid = [[X(-12), y + 0.5], [X(-6), y - h - 0.3], [X(4), y - h - 0.8], [X(11.5), y - 1.2]];
  g.stroke(lid, 2.4, P.ink, { aa: true });
  for (const [u, v] of [[-3, -h - 0.5], [2, -h - 0.8], [7, -h * 0.6 - 1]]) g.thickLine(X(u), y + v, X(u + 2.5), y + v - 3, 1.2, P.ink, { aa: true });
}
/** The tear: a flat drop, point up, at (x, y), length L. */
export function tear(g, x, y, L) {
  const w = L * 0.42;
  const pts = [[x, y - L * 0.6], [x + w * 0.7, y - L * 0.05], [x + w, y + L * 0.2], [x + w * 0.6, y + L * 0.38], [x, y + L * 0.42], [x - w * 0.6, y + L * 0.38], [x - w, y + L * 0.2], [x - w * 0.7, y - L * 0.05]];
  cel(g, pts, P.white);
  g.fillPolygon([[x - w * 0.55, y + L * 0.12], [x - w * 0.2, y - L * 0.25], [x - w * 0.15, y + L * 0.2]], P.cyan, { aa: true });
}

// ------------------------------------------------------------ bursts for the sound effects
/** A jagged flat burst at (x, y): `n` spikes, outer radius rx/ry, alternating inner 0.62. */
export function burst(g, x, y, rx, ry, n, seed, cOut, cIn) {
  const pts = [], inner = [];
  for (let k = 0; k < 2 * n; k++) {
    const a = (k / (2 * n)) * Math.PI * 2 + seed;
    const j = 0.82 + 0.3 * (((Math.sin(seed * 7 + k * 12.9898) * 43758.5453) % 1 + 1) % 1);
    const r = k % 2 ? 0.6 : j;
    pts.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
    inner.push([x + Math.cos(a) * rx * r * 0.62, y + Math.sin(a) * ry * r * 0.62]);
  }
  g.fillPolygon(grow(pts, 1.3), P.ink, { aa: true });
  g.fillPolygon(pts, cOut, { aa: true });
  if (cIn !== undefined) g.fillPolygon(inner, cIn, { aa: true });
}
