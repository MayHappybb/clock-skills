// The cast of the Triadic ballet: ten costumed dancers, one per numeral.
//
// Each costume is the numeral itself, built of padded tubes and spheres
// (triadic-tube.js) in a box 24 wide and 40 tall (local units, y down), with
// a masked metal head above it, dark tights for arms and legs, white gloves
// and coloured shoes. The costumes after Schlemmer's figurines:
//   0  the hoop dancer: a wire hoop skirt, ivory with a red spiral, spinning
//   1  the Goldkugel: a column of gold spheres, one raised arm holding a ball
//   2  the spiral and the tutu: a white coil over the shoulder, a flat
//      striped tutu disc seen edge-on for the base
//   3  the padded Turk: two quilted cushions
//   4  the abstract: silver staff and club, an open top (never an A)
//   5  the collar and disc: a flat collar plate, a round padded belly
//   6  the spiral: a black-and-white spiral horn over a turning wheel
//   7  the cone: a yoke and a striped cone skirt, turning
//   8  the disc dancer: two stacked silver discs, counter-rotating
//   9  the diver: a round helmet ring and a gold tail
// The counters are kept open: nothing of the dancer is ever drawn in them.

import * as T from './triadic-tube.js';
import { sin, cos } from '../js/kit.js';

// ------------------------------------------------------------ path helpers

function arc(cx, cy, rx, ry, a0, a1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + (a1 - a0) * i / steps) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function quad(p0, p1, p2, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
function line(a, b, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push([a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]);
  return pts;
}
const join = (...ps) => ps.reduce((acc, p) => acc.concat(acc.length ? p.slice(1) : p), []);

/** A part: a polyline (or one point: a sphere) with radii, a material slot and its arc lengths. */
function part(pts, r, mat, opts = {}) {
  const n = pts.length;
  const P = new Float32Array(n * 2), R = new Float32Array(n), S = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    P[i * 2] = pts[i][0]; P[i * 2 + 1] = pts[i][1];
    R[i] = typeof r === 'function' ? r(i / Math.max(1, n - 1)) : r;
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    S[i] = s;
  }
  return { n, P, R, S, mat, wave: opts.wave ?? 0 };
}

// ------------------------------------------------------------ colours

const IVORY = 0xf4ead4, WHITE = 0xf6f4ee, CREAM = 0xf2d9a8, GOLD = 0xe8b03a, SILVER = 0xc6cfdc;
const RED = 0xd8302c, BLUE = 0x2650c8, BLACK = 0x1c1a22, OCHRE = 0xb87a2a, PALEB = 0xb8cdf0, ROSE = 0xe86a8a;

// material slots: [main, accent, period, duty, slant, metal, speed px/s]
const M = (main, acc, per, duty, slant, metal, speed) => ({ main, acc, per, duty, slant, metal, speed });

export const COSTUMES = [
  { // 0: hoop skirt
    mats: [M(IVORY, RED, 14, 0.2, 0.8, 0, 9)], head: GOLD, shoe: RED,
    parts: [part(arc(12, 20, 8.6, 16.4, -90, 270, 30), 2.6, 0)],
    hx: 12, hip: 12, sh: [3.6, 13, 20.4, 13], hat: { type: 'knob', c: RED },
  },
  { // 1: Goldkugel
    mats: [M(GOLD, GOLD, 6, 0, 0, 1, 0)], head: GOLD, shoe: RED,
    parts: [
      part(line([14, 6], [14, 37], 6), 2.3, 0),
      ...[7.5, 14.4, 21.3, 28.2, 35.1].map((y, i) => part([[14, y]], 3.4, 0, { wave: i + 1 })),
      part(line([12.6, 6.4], [6.8, 12.2], 2), 2.2, 0),
      part([[6.2, 12.6]], 2.7, 0),
    ],
    hx: 14, hip: 14, sh: [10.4, 17, 17.6, 13],
  },
  { // 2: coil and tutu
    mats: [M(WHITE, BLUE, 7, 0.22, 1.8, 0, 7), M(RED, WHITE, 4.2, 0.3, 0, 0, -12)], head: SILVER, shoe: BLUE,
    parts: [
      part(join(arc(12, 11.8, 8.3, 8.3, 175, 352, 10), line([20.2, 13.2], [4.6, 33.2], 6)), 2.55, 0),
      part(line([2.6, 35.8], [21.8, 35.8], 6), (t) => 1.9 + 0.9 * Math.sin(Math.PI * t), 1),
    ],
    hx: 12, hip: 12.2, sh: [4.2, 12, 20.2, 12], hat: { type: 'knob', c: BLUE },
  },
  { // 3: quilted cushions
    mats: [M(CREAM, OCHRE, 4.2, 0.16, 0, 0, 3)], head: GOLD, shoe: RED,
    parts: [
      part(arc(11.4, 11.3, 7.6, 7.4, -155, 90, 12), 2.65, 0),
      part(arc(11.4, 27.4, 8.9, 8.7, -90, 152, 13), 2.75, 0),
    ],
    hx: 11.5, hip: 12, sh: [5.2, 8, 19.4, 11], hat: { type: 'brim', c: RED },
  },
  { // 4: staff and club
    mats: [M(SILVER, SILVER, 6, 0, 0, 1, 0), M(SILVER, BLUE, 4.6, 0.42, 0, 1, 6)], head: SILVER, shoe: BLUE,
    parts: [
      part(line([5.8, 3.6], [3.8, 25.2], 6), (t) => 2.9 - 0.5 * t, 0),
      part(line([3.8, 25.2], [22, 25.2], 5), 2.5, 1),
      part(line([16.2, 3.4], [16.2, 37.2], 9), 2.6, 0),
    ],
    hx: 16.2, hip: 16.2, sh: [2.4, 11, 18.8, 11], hat: { type: 'cone', c: BLUE },
  },
  { // 5: collar and disc
    mats: [M(BLUE, BLUE, 5, 0, 0, 0, 0), M(PALEB, WHITE, 6.5, 0.3, 1.4, 0, 8)], head: SILVER, shoe: BLUE,
    parts: [
      part(join(line([21, 4.2], [6.4, 4.2], 4), line([6.4, 4.2], [5.6, 17.6], 4)), 2.6, 0),
      part(join([[5.6, 17.6]], arc(11.8, 26.4, 9.2, 9.0, -128, 150, 13)), 2.65, 1),
    ],
    hx: 13, hip: 11.5, sh: [4.4, 6, 21.4, 6.6], hat: { type: 'disc', c: BLUE },
  },
  { // 6: spiral horn and wheel
    mats: [M(WHITE, BLACK, 6.2, 0.42, 2.2, 0, 10)], head: SILVER, shoe: RED,
    parts: [
      part(arc(12, 27.2, 8.4, 8.3, 180, 540, 24), 2.6, 0),
      part(quad([3.7, 27], [3.2, 4.2], [19.6, 4.6], 9), 2.6, 0),
    ],
    hx: 11, hip: 12, sh: [3.6, 15, 18.5, 9],
  },
  { // 7: yoke and cone
    mats: [M(WHITE, RED, 4.4, 0.45, 0, 0, -9), M(SILVER, SILVER, 6, 0, 0, 1, 0)], head: GOLD, shoe: RED,
    parts: [
      part(line([3.0, 4.4], [21.0, 4.4], 5), 2.6, 1),
      part(line([20.4, 5.2], [9.4, 37], 8), (t) => 3.3 - 1.4 * t, 0),
    ],
    hx: 12, hip: 9.6, sh: [2.6, 5, 21.6, 5], hat: { type: 'cone', c: RED },
  },
  { // 8: two discs
    mats: [M(SILVER, BLUE, 7, 0.24, 1.2, 1, 9), M(SILVER, BLUE, 8, 0.24, 1.2, 1, -9)], head: GOLD, shoe: BLUE,
    parts: [
      part(arc(12, 11.3, 7.1, 7.1, 90, 450, 20), 2.5, 0),
      part(arc(12, 27.7, 8.7, 8.6, -90, 270, 24), 2.6, 1),
    ],
    hx: 12, hip: 12, sh: [5.0, 10, 19.0, 10],
  },
  { // 9: diver
    mats: [M(WHITE, BLACK, 8, 0.22, 0, 0, -8), M(GOLD, GOLD, 6, 0, 0, 1, 0)], head: SILVER, shoe: RED,
    parts: [
      part(arc(12, 12.4, 8.4, 8.2, 0, 360, 24), 2.6, 0),
      part(quad([20.4, 12.8], [21.4, 33.4], [7.4, 36.8], 9), (t) => 2.6 - 0.3 * t, 1),
    ],
    hx: 12, hip: 9.6, sh: [3.8, 13, 20.6, 10], hat: { type: 'brim', c: BLACK },
  },
];

// ------------------------------------------------------------ a dancer

/** A dancer's pose: everything a frame needs to draw one figure. */
export function dancer() {
  return {
    d: 0, x: 0, fy: 0, s: 1, tilt: 0, k: 1, sy: 1, rise: 0,
    aL0: 0.5, aL1: 0, aR0: 0.5, aR1: 0, liftL: 0, liftR: 0, nod: 0, look: 0,
    light: 1, alpha: 1, spin: 0, wave: 0, t: 0, key: 0x161018,
  };
}

const LEG = 6;           // hip to floor, local units
const CM = [T.material(), T.material(), T.material(), T.material(), T.material()];   // costume materials + head
const LM = [T.material(), T.material(), T.material(), T.material()];                 // tights, gloves, shoes
const TIGHTS = 0x2c2434, GLOVE = 0xf2eee6;

let PX = 0, PY = 0, C = 1, SN = 0, KS = 1, SYS = 1, HIP = 12;
function tx(lx, ly) { const dx = (lx - HIP) * KS, dy = (ly - 39) * SYS; return PX + dx * C - dy * SN; }
function ty(lx, ly) { const dx = (lx - HIP) * KS, dy = (ly - 39) * SYS; return PY + dx * SN + dy * C; }

/** Where the dancer's costume sits on the glass (for spots and shadows): centre x, top y, bottom y. */
export function bounds(D) {
  const s = D.s;
  return { x: D.x, top: D.fy - s * (LEG + D.rise + 39 * D.sy), bot: D.fy - s * (LEG + D.rise) };
}

function setRig(D) {
  const cs = COSTUMES[D.d], s = D.s;
  HIP = cs.hip;
  C = cos(D.tilt); SN = sin(D.tilt);
  KS = D.k * s; SYS = D.sy * s;
  PX = D.x + (cs.hip - 12) * D.k * s;
  PY = D.fy - s * (LEG + D.rise);
}

/** Arms, legs, neck: dark tights, white gloves, coloured shoes. Drawn before the costume. */
export function drawLimbs(g, D) {
  const cs = COSTUMES[D.d], s = D.s;
  setRig(D);
  T.setMaterial(LM[0], TIGHTS, TIGHTS, 6, 0, 0, 0);
  T.setMaterial(LM[1], GLOVE, GLOVE, 6, 0, 0, 0);
  T.setMaterial(LM[2], cs.shoe, cs.shoe, 6, 0, 0, 0);
  { const q = cs.mats[0]; T.setMaterial(LM[3], q.main, q.metal ? q.main : (q.duty > 0 ? q.acc : q.main), 2.6 * s, q.metal ? 0 : 0.45, 0, q.metal); }
  T.begin();
  const lr = 0.95 * s;
  // arms: shoulder, elbow, wrist
  for (let side = -1; side <= 1; side += 2) {
    const sx = tx(side < 0 ? cs.sh[0] : cs.sh[2], side < 0 ? cs.sh[1] : cs.sh[3]);
    const sy = ty(side < 0 ? cs.sh[0] : cs.sh[2], side < 0 ? cs.sh[1] : cs.sh[3]);
    const a0 = side < 0 ? D.aL0 : D.aR0, a1 = a0 + (side < 0 ? D.aL1 : D.aR1);
    const ux = side * sin(a0) * D.k, uy = cos(a0), vx = side * sin(a1) * D.k, vy = cos(a1);
    const ex = sx + 5.4 * s * (ux * C - uy * SN), ey = sy + 5.4 * s * (ux * SN + uy * C);
    const wx = ex + 4.8 * s * (vx * C - vy * SN), wy = ey + 4.8 * s * (vx * SN + vy * C);
    T.capsule(sx, sy, ex, ey, 1.75 * s, 1.25 * s, 0, 3);
    T.capsule(ex, ey, wx, wy, lr, lr * 0.9, 0, 0);
    T.capsule(wx, wy, wx, wy, 1.25 * s, 1.25 * s, 0, 1);
  }
  // legs: hip, knee, ankle, toe
  const rr = D.rise > 2 ? 1 : D.rise / 2;
  for (let side = -1; side <= 1; side += 2) {
    const lift = side < 0 ? D.liftL : D.liftR;
    const hx = tx(HIP + side * 2.3, 36.5), hy = ty(HIP + side * 2.3, 36.5);
    const fx = PX + side * s * (2.7 - 1.8 * lift), fy = D.fy - s * (1.2 + 0.9 * D.rise * (1 - lift) + 4.2 * lift);
    const kx = (hx + fx) / 2 + side * s * 3.2 * lift, ky = (hy + fy) / 2 - s * 0.6 * lift;
    T.capsule(hx, hy, kx, ky, lr * 1.1, lr, 0, 0);
    T.capsule(kx, ky, fx, fy, lr, lr * 0.85, 0, 0);
    const toeX = fx + side * s * 2.0 * (1 - rr * (1 - lift)), toeY = fy + s * (0.5 + 0.8 * rr * (1 - lift));
    T.capsule(fx, fy, toeX, toeY, 0.95 * s, 0.75 * s, 0, 2);
  }
  // neck
  T.capsule(tx(cs.hx, 1.2), ty(cs.hx, 1.2), tx(cs.hx + D.look * 0.3, -2.6 + D.nod), ty(cs.hx + D.look * 0.3, -2.6 + D.nod), 1.05 * s, 1.05 * s, 0, 0);
  T.draw(g, LM, D.key, 0.55 * s, D.light, D.alpha);
}

/** The costume (the numeral), the masked head and its eyes. */
export function drawCostume(g, D) {
  const cs = COSTUMES[D.d], s = D.s;
  setRig(D);
  for (let m = 0; m < cs.mats.length; m++) {
    const q = cs.mats[m];
    T.setMaterial(CM[m], q.main, q.acc, q.per * s, q.duty, q.slant, q.metal);
    const ph = -(D.t * q.speed) / (q.per * s) - D.spin * (q.speed >= 0 ? 1 : -1);
    CM[m].phase = ph - Math.floor(ph);
  }
  T.setMaterial(CM[3], cs.head, cs.head, 6, 0, 0, 1);
  T.begin();
  for (const p of cs.parts) {
    const off = p.wave ? 0.55 * D.wave * sin(D.t * 5.2 - p.wave * 1.1) : 0;
    let px = tx(p.P[0] + off, p.P[1]), py = ty(p.P[0] + off, p.P[1]);
    if (p.n === 1) { T.capsule(px, py, px, py, p.R[0] * s, p.R[0] * s, 0, p.mat); continue; }
    for (let i = 1; i < p.n; i++) {
      const qx = tx(p.P[i * 2] + off, p.P[i * 2 + 1]), qy = ty(p.P[i * 2] + off, p.P[i * 2 + 1]);
      T.capsule(px, py, qx, qy, p.R[i - 1] * s, p.R[i] * s, p.S[i - 1] * s, p.mat);
      px = qx; py = qy;
    }
  }
  // the head: a metal mask, egg-shaped, and its hat
  const hlx = cs.hx + D.look * 0.5, hly = -5.0 + D.nod;
  const hx = tx(hlx, hly), hy = ty(hlx, hly);
  T.capsule(tx(hlx, hly - 0.8), ty(hlx, hly - 0.8), tx(hlx, hly + 0.8), ty(hlx, hly + 0.8), 3.8 * s, 3.4 * s, 0, 3);
  const ht = cs.hat;
  if (ht) {
    T.setMaterial(CM[4], ht.c, ht.c, 6, 0, 0, ht.metal ? 1 : 0);
    if (ht.type === 'cone') T.capsule(tx(hlx, hly - 3.2), ty(hlx, hly - 3.2), tx(hlx + 0.8, hly - 10), ty(hlx + 0.8, hly - 10), 2.6 * s, 0.5 * s, 0, 4);
    else if (ht.type === 'knob') {
      T.capsule(tx(hlx, hly - 4), ty(hlx, hly - 4), tx(hlx, hly - 7.4), ty(hlx, hly - 7.4), 0.6 * s, 0.6 * s, 0, 4);
      T.capsule(tx(hlx, hly - 8.4), ty(hlx, hly - 8.4), tx(hlx, hly - 8.4), ty(hlx, hly - 8.4), 1.6 * s, 1.6 * s, 0, 4);
    } else if (ht.type === 'brim') {
      T.capsule(tx(hlx - 4.6, hly - 3.6), ty(hlx - 4.6, hly - 3.6), tx(hlx + 4.6, hly - 3.6), ty(hlx + 4.6, hly - 3.6), 0.9 * s, 0.9 * s, 0, 4);
      T.capsule(tx(hlx, hly - 4.6), ty(hlx, hly - 4.6), tx(hlx, hly - 6.4), ty(hlx, hly - 6.4), 2.5 * s, 2.3 * s, 0, 4);
    } else if (ht.type === 'disc') {
      T.capsule(tx(hlx - 3.4, hly - 5.2), ty(hlx - 3.4, hly - 5.2), tx(hlx + 3.4, hly - 5.2), ty(hlx + 3.4, hly - 5.2), 1.3 * s, 1.3 * s, 0, 4);
    }
  }
  T.draw(g, CM, D.key, 1.05 * s, D.light, D.alpha);
  // eyes: two dark dots, looking where the dancer looks
  const eo = 1.35 * s * D.k, ey = 0.25 * s;
  for (let side = -1; side <= 1; side += 2) {
    const ex = hx + (side * eo + D.look * 0.6) * C - ey * SN, eyy = hy + (side * eo + D.look * 0.6) * SN + ey * C;
    g.fillEllipse(ex, eyy, 0.78 * s * (0.5 + 0.5 * D.k), 1.05 * s, 0x15101a, { aa: true, a: D.alpha });
  }
}
