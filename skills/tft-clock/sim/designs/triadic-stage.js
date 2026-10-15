// The stage of the Triadic ballet: the cyclorama in the colour of the act,
// the floor with its painted geometry, the follow spots, the valance, and
// the gauze traveller curtain with the act's title card in geometric
// lettering (circle, square, triangle, Bayer-style lowercase).

import { mix, scale, sin, ease, lerp } from '../js/kit.js';

export const FLOOR = 66;           // where the cyclorama meets the floor

// The acts. Schlemmer's three series (yellow, pink, black) and a Bauhaus blue.
export const ACTS = [
  { name: 'gelb', top: 0x4a2c04, bot: 0xb27a0c, fb: 0x3a2610, ff: 0x5a3c1c, pool: 0xffe0a0, val: 0x2a1606, gel: 0xffd040 },
  { name: 'rosa', top: 0x40102c, bot: 0xa8386a, fb: 0x2c1220, ff: 0x4a2034, pool: 0xffd0d8, val: 0x260a18, gel: 0xff7090 },
  { name: 'blau', top: 0x081440, bot: 0x2850a8, fb: 0x141a30, ff: 0x242c4a, pool: 0xd8e4ff, val: 0x080c22, gel: 0x6090ff },
  { name: 'schwarz', top: 0x0c0a14, bot: 0x2a2440, fb: 0x100e16, ff: 0x1e1a26, pool: 0xffe4c0, val: 0x08060c, gel: 0xc0a0ff },
];

/** The act for an hour: black at night (23-7), else yellow, pink, blue in turn. */
export function actOf(h) { return h >= 23 || h < 7 ? 3 : (h - 7) % 3; }

/** A blend of two acts (colours only), into `out`. */
export function blendAct(out, a, b, w) {
  for (const k of ['top', 'bot', 'fb', 'ff', 'pool', 'val', 'gel']) out[k] = w <= 0 ? a[k] : w >= 1 ? b[k] : mix(a[k], b[k], w);
  out.name = w < 0.5 ? a.name : b.name;
  return out;
}

// ------------------------------------------------------------ spots (filled each frame)
export const SPOTS = { n: 0, x: new Float32Array(4), y: new Float32Array(4), fy: new Float32Array(4), i: new Float32Array(4), r: new Float32Array(4), cr: new Float32Array(4), cg: new Float32Array(4), cb: new Float32Array(4) };

let WT = [0, 0, 0], WB = [0, 0, 0], FB = [0, 0, 0], FF = [0, 0, 0];
const rgb3 = (c, o) => { o[0] = (c >> 16) & 255; o[1] = (c >> 8) & 255; o[2] = c & 255; return o; };

function wallAt(x, y) {
  const v = y / FLOOR;
  let r = WT[0] + (WB[0] - WT[0]) * v, g = WT[1] + (WB[1] - WT[1]) * v, b = WT[2] + (WB[2] - WT[2]) * v;
  const ex = (x - 80) / 80, vig = 1 - 0.38 * ex * ex;
  r *= vig; g *= vig; b *= vig;
  for (let k = 0; k < SPOTS.n; k++) {
    const dx = (x - SPOTS.x[k]) / SPOTS.r[k], dy = (y - SPOTS.y[k]) / (SPOTS.r[k] * 1.55), q = dx * dx + dy * dy;
    if (q >= 1) continue;
    const w = (1 - q) * (1 - q) * SPOTS.i[k] * 0.6;
    r += (SPOTS.cr[k] - r) * w; g += (SPOTS.cg[k] - g) * w; b += (SPOTS.cb[k] - b) * w;
  }
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}

function floorAt(x, y) {
  const v = (y - FLOOR) / (80 - FLOOR);
  let r = FB[0] + (FF[0] - FB[0]) * v, g = FB[1] + (FF[1] - FB[1]) * v, b = FB[2] + (FF[2] - FB[2]) * v;
  const ex = (x - 80) / 80, vig = 1 - 0.3 * ex * ex;
  r *= vig; g *= vig; b *= vig;
  for (let k = 0; k < SPOTS.n; k++) {
    const dx = (x - SPOTS.x[k]) / (SPOTS.r[k] * 0.9), dy = (y - SPOTS.fy[k]) / 5.5, q = dx * dx + dy * dy;
    if (q >= 1) continue;
    const w = (1 - q) * SPOTS.i[k] * 0.62;
    r += (SPOTS.cr[k] - r) * w; g += (SPOTS.cg[k] - g) * w; b += (SPOTS.cb[k] - b) * w;
  }
  return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b);
}

/** Cyclorama and floor, lit by this frame's spots. */
export function drawStage(g, act) {
  rgb3(act.top, WT); rgb3(act.bot, WB); rgb3(act.fb, FB); rgb3(act.ff, FF);
  g.coarse(wallAt, { cell: 4, box: [0, 0, 160, FLOOR] });
  g.coarse(floorAt, { cell: 4, box: [0, FLOOR, 160, 80 - FLOOR] });
  // the cyclorama's foot, and Schlemmer's floor geometry: a circle and its diagonals
  g.fillRect(0, FLOOR, 160, 1, scale(act.fb, 0.6));
  const lc = mix(act.ff, 0xffffff, 0.22);
  g.line(8, 79, 52, FLOOR + 2, lc, { a: 0.35 });
  g.line(152, 79, 108, FLOOR + 2, lc, { a: 0.35 });
}

/** The spots' beams through the haze, from the flies to each pool. */
export function drawBeams(g) {
  for (let k = 0; k < SPOTS.n; k++) {
    const x = SPOTS.x[k], w = SPOTS.r[k] * 0.72, c = (SPOTS.cr[k] << 16) | (SPOTS.cg[k] << 8) | SPOTS.cb[k];
    g.fillPolygon([[x - 3 + 0.12 * (x - 80), 3], [x + 3 + 0.12 * (x - 80), 3], [x + w, SPOTS.fy[k]], [x - w, SPOTS.fy[k]]], c, { aa: true, a: 0.07 * SPOTS.i[k] });
  }
}

/** The valance across the top: velvet with a gold trim and scallops. */
export function drawValance(g, act) {
  g.fillRect(0, 0, 160, 3, act.val);
  g.fillRect(0, 3, 160, 1, 0x9a7a3a);
  for (let x = 4; x < 160; x += 8) g.fillCircle(x, 3.6, 2.4, act.val, { aa: true });
}

// ------------------------------------------------------------ the curtain

/**
 * The gauze traveller: two halves meeting in the middle, `c` 0 open .. 1
 * closed. Folds ride with the leading edge, so the cloth bunches as it moves.
 */
export function drawCurtain(g, c, act, title, sin) {
  if (c <= 0.001) return;
  const eL = 80 * c, eR = 160 - 80 * c;
  const base = 0x5a0c1c, hi = 0xb8303e;
  for (let x = 0; x < 160; x++) {
    let d;
    if (x + 0.5 < eL) d = eL - (x + 0.5); else if (x + 0.5 > eR) d = (x + 0.5) - eR; else continue;
    const f = 0.5 + 0.5 * sin(d * 0.62 + 0.4);
    const col = mix(base, hi, f * f * 0.75);
    const edge = d < 1.5 ? 0.35 : 0;
    g.fillRect(x, 3, 1, 72, edge ? mix(col, 0xffd890, edge) : col, { a: 0.74 });
    g.fillRect(x, 75, 1, 3, (x & 1) ? 0xc89a40 : 0x8a6420, { a: 0.9 });
  }
  if (c > 0.6) titleCard(g, (c - 0.6) / 0.4, eL, eR, title);
}

// a Bauhaus composition and the act's name, riding on the closing halves
function titleCard(g, a, eL, eR, title) {
  const o = { aa: true, a: a * 0.95 };
  g.fillRect(Math.round(eL - 62), 14, 15, 15, 0xd8302c, { a: a * 0.95 });
  g.fillCircle(eL - 27, 22, 8.5, 0xf0c020, o);
  g.fillPolygon([[eR + 18, 31], [eR + 28, 13], [eR + 38, 31]], 0x2650c8, o);
  g.fillRect(Math.round(eR + 46), 20, 18, 3, 0x1a1418, { a: a * 0.95 });
  const w = wordWidth(title);
  word(g, title, 80 - w / 2, 58, 0xf4ead4, a);
}

// ------------------------------------------------------------ geometric lowercase
// x-height 9, ascender 13, stroke 2; drawn from rings, arcs, bars and lines.
const XH = 9, ST = 2;
const GL = {
  a: [9.5, (g, x, b, c, o) => { g.ring(x + 4.5, b - 4.5, 2.5, 4.5, c, o); g.fillRect(x + 7, b - 9, 2, 9, c, o); }],
  b: [9.5, (g, x, b, c, o) => { g.ring(x + 5, b - 4.5, 2.5, 4.5, c, o); g.fillRect(x + 0.5, b - 13, 2, 13, c, o); }],
  c: [8.5, (g, x, b, c, o) => g.arc(x + 4.5, b - 4.5, 2.5, 4.5, Math.PI * 0.72, Math.PI * 2.28, c, o)],
  e: [9, (g, x, b, c, o) => { g.arc(x + 4.5, b - 4.5, 2.5, 4.5, Math.PI * 0.78, Math.PI * 2.5, c, o); g.fillRect(x, b - 5, 9, 1.6, c, o); }],
  g: [9.5, (g, x, b, c, o) => { g.ring(x + 4.5, b - 4.5, 2.5, 4.5, c, o); g.fillRect(x + 7, b - 9, 2, 10, c, o); g.arc(x + 4.5, b + 1, 2.5, 4.5, Math.PI * 0.5, Math.PI * 1.5, c, o); }],
  h: [9, (g, x, b, c, o) => { g.fillRect(x, b - 13, 2, 13, c, o); g.arc(x + 4.5, b - 4.5, 2.5, 4.5, -Math.PI / 2, Math.PI / 2, c, o); g.fillRect(x + 7, b - 4.5, 2, 4.5, c, o); }],
  l: [2.5, (g, x, b, c, o) => g.fillRect(x, b - 13, 2, 13, c, o)],
  o: [9, (g, x, b, c, o) => g.ring(x + 4.5, b - 4.5, 2.5, 4.5, c, o)],
  r: [6.5, (g, x, b, c, o) => { g.fillRect(x, b - 9, 2, 9, c, o); g.arc(x + 5.5, b - 4.5, 2.5, 4.5, -Math.PI / 2, 0.7, c, o); }],
  s: [7, (g, x, b, c, o) => { g.arc(x + 3.5, b - 6.6, 1.2, 3.1, Math.PI, Math.PI * 2.4, c, o); g.arc(x + 3.5, b - 2.4, 1.2, 3.1, 0, Math.PI * 1.4, c, o); }],
  u: [9, (g, x, b, c, o) => { g.arc(x + 4.5, b - 4.5, 2.5, 4.5, Math.PI / 2, Math.PI * 1.5, c, o); g.fillRect(x, b - 9, 2, 4.5, c, o); g.fillRect(x + 7, b - 9, 2, 9, c, o); }],
  w: [12.5, (g, x, b, c, o) => g.stroke([[x + 1, b - 9], [x + 3.6, b - 1], [x + 6.2, b - 7], [x + 8.8, b - 1], [x + 11.4, b - 9]], ST, c, o)],
  z: [8, (g, x, b, c, o) => { g.fillRect(x, b - 9, 8, 2, c, o); g.fillRect(x, b - 2, 8, 2, c, o); g.thickLine(x + 6.8, b - 7.8, x + 1.2, b - 1.2, ST, c, o); }],
};

function wordWidth(s) { let w = 0; for (const ch of s) w += (GL[ch]?.[0] ?? 6) + 2.5; return w - 2.5; }

function word(g, s, x, base, c, a) {
  const o = { aa: true, a };
  for (const ch of s) {
    const gl = GL[ch];
    if (gl) gl[1](g, x, base, c, o);
    x += (gl?.[0] ?? 6) + 2.5;
  }
}

// ------------------------------------------------------------ the pit

/** The stage lip with its footlights, across the bottom. */
export function drawApron(g, act) {
  g.fillRect(0, 77, 160, 3, scale(act.fb, 0.55));
  g.fillRect(0, 77, 160, 1, mix(act.ff, 0xffe0a0, 0.25));
  for (let x = 6; x < 160; x += 12) {
    if (x > 66 && x < 94) continue;
    g.fillEllipse(x, 78.6, 1.6, 0.9, 0xffe6b0, { aa: true, a: 0.9 });
  }
}

// the conductor's 4/4 pattern: down, left, right, up (baton tip, relative to the right shoulder)
const BEAT = [[1.5, -2.5], [-9, -6], [7.5, -6.5], [1, -13.5]];

/**
 * The conductor in the pit, between the couples, keeping the clock's beat:
 * one beat a second, a four-beat bar. `big` (0..1) is the hour's finale,
 * both arms up. Silhouette, rim-lit by the stage.
 */
export function drawConductor(g, act, tod, big) {
  const b = Math.floor(tod), u = tod - b, i = b & 3;
  const p0 = BEAT[(i + 3) & 3], p1 = BEAT[i];
  const e = ease.inOutCubic(u < 0.55 ? u / 0.55 : 1);
  const bounce = 1.8 * sin(Math.PI * (u < 0.3 ? u / 0.3 : 1)) * (u < 0.3 ? 1 : 0);
  let tx = lerp(p0[0], p1[0], e) * 1.25, ty = (lerp(p0[1], p1[1], e) + bounce) * 1.25;
  tx = lerp(tx, 5, big); ty = lerp(ty, -20 + 1.5 * sin(tod * 6.3), big);
  const bob = 0.5 * sin(Math.PI * 2 * u) + 0.8 * big;
  const hx = 80 + 0.08 * tx, hy = 70.6 - bob;
  const rim = mix(act.pool, 0xffffff, 0.2), dark = 0x0c080e, o = { aa: true };
  const sx = 85.2, sy = 76.2 - bob * 0.5;
  const hand = [sx + tx * 0.5, sy + ty * 0.55];
  const tip = [sx + tx, sy + ty];
  const lsx = 74.8, lh = [lerp(72.5, 74, big), lerp(79, sy - 17 + 1.5 * sin(tod * 6.3 + 1), big)];
  // rim light, then the silhouette in tails
  g.fillEllipse(80, 80.6, 10.4, 6.2, rim, o);
  g.fillEllipse(hx, hy - 0.7, 3.2, 3.7, rim, o);
  g.thickLine(sx, sy - 0.7, hand[0], hand[1] - 0.7, 2.8, rim, o);
  if (big > 0.02) g.thickLine(lsx, sy - 0.7, lh[0], lh[1] - 0.7, 2.8, rim, o);
  g.fillEllipse(80, 81.2, 10, 6, dark, o);
  g.fillEllipse(hx, hy, 3.1, 3.6, dark, o);
  g.thickLine(sx, sy, hand[0], hand[1], 2.6, dark, o);
  if (big > 0.02) g.thickLine(lsx, sy, lh[0], lh[1], 2.6, dark, o);
  g.fillPolygon([[77.6, 75.3], [80, 79.2], [82.4, 75.3]], 0xe8e4dc, o);    // shirt front
  g.fillRect(79, 75, 2, 1, 0x0c080e);                                        // bow tie
  g.thickLine(hand[0], hand[1], tip[0], tip[1], 0.8, 0xf4ecdc, { aa: true, a: 0.95 });
  g.fillCircle(hand[0], hand[1], 1.2, 0xe8cdb0, o);
}
