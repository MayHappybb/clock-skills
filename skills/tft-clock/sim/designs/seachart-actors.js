// The supporting cast of "seachart", all engraved: the galleon (a sprite in
// ink and paper, in profile, with her pennants; edge-on while she goes
// about), the serpents' spouts (two jets of engraved spray, the way Olaus
// Magnus drew his sea beasts blowing), splash rings, the galleon's cannon
// smoke, and the kraken that rises at the hour (mantle, eye and arms, laid
// into the material map behind the serpents so the time stays on top).

import { sprite } from '../js/kit.js';
import { M, W, H } from './seachart-sheet.js';
import { ISIN } from './seachart-serpent.js';

const isin = (a) => ISIN[(a | 0) & 255] / 256;          // a in 1/256 turns
const icos = (a) => ISIN[((a | 0) + 64) & 255] / 256;

// ------------------------------------------------------------ the galleon

export const SHIP_PAL = { '#': 0x2a1f17, s: 0xf4ecd4, h: 0x6a4a2c, f: 0xc23a2a, w: 0xe8d9b0, k: 0x8e7f63 };
const NIGHT_PAL = { '#': 0x120c08, s: 0xb8ad90, h: 0x4a3420, f: 0xa23224, w: 0x9a8e70, k: 0x5e4d35 };
const SHIP_ART = [`
  .....f.......f....
  .....#ff.....#ff..
  ....#ss#....#ss#..
  ....#sss#...#sss#.
  ....#ss#....#ss#..
  ...#ssss#..#ssss#.
  ...#sssss#.#sssss#
  ...#ssss#..#ssss#.
  ##...#.......#..k.
  ##hhhhhhhhhhhhhh#.
  .#hhwhhwhhwhhhh#..
  ..#############...`,
// going about: head to wind, her sails shiver edge-on
`
  .....f.......f....
  .....#.......#....
  .....#.......#....
  ....##.......##...
  .....#.......#....
  ....##.......##...
  ....##.......##...
  ....##.......##...
  ##...#.......#..k.
  ##hhhhhhhhhhhhhh#.
  .#hhwhhwhhwhhhh#..
  ..#############...`];
export const SHIP = SHIP_ART.map((a) => sprite(a, SHIP_PAL));
export const SHIP_NIGHT = SHIP_ART.map((a) => sprite(a, NIGHT_PAL));
export const SHIP_W = 18, SHIP_H = 12;

/**
 * Where the galleon is at time T (s): she beats to windward across the top of
 * the chart, a long leg each way, going about at each end. Returns
 * { x, y, flip, about } (x, y her top-left).
 */
export function galleon(T) {
  const LEG = 14, ABOUT = 1.2, X0 = 74, X1 = 116;
  const per = 2 * (LEG + ABOUT), u = ((T % per) + per) % per;
  let x, flip, about = false, e;
  if (u < LEG) { e = u / LEG; x = X0 + (X1 - X0) * e; flip = false; }
  else if (u < LEG + ABOUT) { x = X1; flip = u - LEG > ABOUT / 2; about = true; e = 1; }
  else if (u < 2 * LEG + ABOUT) { e = (u - LEG - ABOUT) / LEG; x = X1 - (X1 - X0) * e; flip = true; e = 1 - e; }
  else { x = X0; flip = u - 2 * LEG - ABOUT < ABOUT / 2; about = true; e = 0; }
  // tacking zig-zag: each leg climbs a little as she makes ground to windward
  const y = 9 - e * 3;
  return { x, y, flip, about };
}

// ------------------------------------------------------------ spray: spouts, splashes

/** Put a ground-only pixel of spray (never over a serpent or the ship's ink). */
function dab(map, x, y, m) {
  x |= 0; y |= 0;
  if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) return;
  const p = y * W + x;
  if (map[p] < M.INK) map[p] = m;
}

/**
 * An engraved spout from (x, y): two jets that rise, part and fall in dotted
 * arcs, with droplets at their ends. `t` 0..1 through its life, `hgt` px.
 */
export function spout(map, x, y, t, hgt) {
  if (t <= 0 || t >= 1) return 0;
  const rise = t < 0.4 ? t / 0.4 : 1, fall = t < 0.4 ? 0 : (t - 0.4) / 0.6;
  let n = 0;
  for (const side of [-1, 1]) {
    const len = 28;
    for (let k = 0; k < len; k++) {
      const u = k / len;
      if (u > rise) break;
      if (u < fall * 0.9) continue;                     // the column falls away from the bottom
      const px = x + side * (u * u * 7), py = y - hgt * (1 - (1 - u) * (1 - u) * 0.15) * Math.min(1, u * 1.8) + u * u * u * hgt * 0.55;
      dab(map, px, py, k & 1 && u > 0.6 ? M.WAVE : M.SPRAY); n++;
    }
    if (rise >= 1) {
      // droplets at the jets' ends, falling
      for (let d = 0; d < 3; d++) {
        const dx = side * (7 + d * 1.6 + fall * 3), dy = -hgt * 0.45 + fall * fall * hgt * 0.9 + d * 2;
        dab(map, x + dx, y + dy, M.SPRAY); n++;
      }
    }
  }
  // the column's root
  if (t < 0.7) for (let k = 0; k < 3; k++) { dab(map, x - 1 + k, y - 1, M.SPRAY); n++; }
  return n;
}

/** Engraved splash rings round (x, y), growing with t (0..1). */
export function rings(map, x, y, t, rmax) {
  if (t <= 0 || t >= 1) return 0;
  let n = 0;
  for (let k = 0; k < 2; k++) {
    const r = (t - k * 0.25) * rmax;
    if (r < 1.5) continue;
    const steps = Math.ceil(r * 3);
    for (let i = 0; i < steps; i++) {
      if ((i + k) % 3 === 2) continue;                  // engraved, broken
      const a = (i / steps) * 256;
      dab(map, x + icos(a) * r, y + isin(a) * r * 0.4, k ? M.WAVE : M.SPRAY); n++;
    }
  }
  return n;
}

// ------------------------------------------------------------ the kraken

const KX = new Float32Array(80), KY = new Float32Array(80);

/** Stamp a disc of material m (radius r) at (cx, cy), only over ground. */
function disc(map, cx, cy, r, m) {
  const x0 = Math.max(3, Math.floor(cx - r)), x1 = Math.min(W - 4, Math.ceil(cx + r));
  const y0 = Math.max(3, Math.floor(cy - r)), y1 = Math.min(H - 4, Math.ceil(cy + r));
  const r2 = r * r;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      n++;
      if (dx * dx + dy * dy <= r2) { const p = y * W + x; if (map[p] < M.INK) map[p] = m; }
    }
  }
  return n;
}

const ARMS = [
  { bx: 12, len: 44, th: 0.02, k: 0 }, { bx: 36, len: 34, th: -0.02, k: 1 }, { bx: 60, len: 50, th: 0.01, k: 2 },
  { bx: 70, len: 30, th: -0.04, k: 3 }, { bx: 91, len: 32, th: 0.04, k: 4 }, { bx: 112, len: 46, th: -0.01, k: 5 },
  { bx: 0, len: 78, th: 0, k: 6 }, { bx: 150, len: 40, th: -0.03, k: 7 },
];

/**
 * The kraken at `rise` (0 under the sea, 1 fully up), time T. The mantle and
 * its eye stand in the strait between hours and minutes; the arms climb out
 * of the sea along the bottom of the chart, writhing, tips curling. Arm 6
 * rises under the galleon (at `shipX`) and, with `reach`, coils up round her.
 * Returns pixels scanned.
 */
export function kraken(map, rise, T, reach, eyeOpen, shipX) {
  if (rise <= 0) return 0;
  let n = 0;
  for (const A of ARMS) {
    const grab = A.k === 6;
    const len = A.len * rise * (grab ? 0.55 + reach * 0.45 : 1);
    const m = Math.max(2, Math.floor(len));
    let x = grab ? shipX : A.bx, y = H + 2, hd = A.th * 256;
    const ph = T * 50 + A.k * 37, curl = A.k & 1 ? 1 : -1;
    for (let i = 0; i < m; i++) {
      const u = i / A.len;
      // a wave runs up the arm; the tip curls over
      hd += isin(ph - u * 200) * (grab ? 3 : 9) * u + curl * (u > 0.62 ? (u - 0.62) * 56 : 0) * (grab ? reach * 1.2 : 1);
      x += isin(hd); y -= icos(hd);
      KX[i] = x; KY[i] = y;
    }
    const rr = (i) => 0.7 + 2.4 * (1 - i / m);
    for (let i = 0; i < m; i++) n += disc(map, KX[i], KY[i], rr(i) + 1, M.KRAK_INK);
    for (let i = 0; i < m; i++) n += disc(map, KX[i], KY[i], rr(i), M.KRAK);
    // suckers along the inner side, engraved as dots
    for (let i = 3; i < m - 3; i += 3) {
      const tx = KX[i + 1] - KX[i - 1], ty = KY[i + 1] - KY[i - 1], l = Math.abs(tx) + Math.abs(ty) || 1;
      const sx = KX[i] - curl * (ty / l) * rr(i) * 0.55, sy = KY[i] + curl * (tx / l) * rr(i) * 0.55;
      const p = (sy | 0) * W + (sx | 0);
      if (sy > 3 && sy < H - 4 && sx > 3 && sx < W - 4 && map[p] === M.KRAK) map[p] = M.KRAK_SH;
    }
  }
  // the mantle: a tall bulb rising behind the strait, hatched down one side
  const cx = 80, cy = 98 - rise * 40, rx = 11, ry = 19;
  for (let y = Math.max(3, Math.floor(cy - ry - 1)); y < Math.min(H - 3, cy + ry + 1); y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, q = dx * dx + dy * dy;
      n++;
      const p = y * W + x;
      if (map[p] >= M.INK) continue;
      const qo = ((x + 0.5 - cx) / (rx + 1)) ** 2 + ((y + 0.5 - cy) / (ry + 1)) ** 2;
      if (q <= 1) map[p] = dx > 0.3 && (x + y) % 3 === 0 ? M.KRAK_INK : M.KRAK;
      else if (qo <= 1) map[p] = M.KRAK_INK;
    }
  }
  // the eye: an ink ring, a pale ball, a slot pupil that opens and closes
  const ex = cx - 1, ey = cy + 2;
  if (ey < H - 6) {
    n += disc(map, ex + 0.5, ey + 0.5, 4.2, M.KRAK_INK);
    n += disc(map, ex + 0.5, ey + 0.5, 3.2, M.EYE);
    const open = eyeOpen;
    if (open < 0.15) for (let x = ex - 3; x <= ex + 3; x++) map[ey * W + x] = M.KRAK_INK;   // shut
    else {
      const h = Math.max(1, Math.round(open * 2));
      for (let y = ey - h; y <= ey + h; y++) for (let x = ex - 1; x <= ex + 1; x++) map[y * W + x] = M.INK;
    }
  }
  return n;
}
