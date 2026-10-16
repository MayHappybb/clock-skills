// othello-disc: the lit two-faced disc. Resting discs are baked once into
// 9x9 sprites (one per colour and per light bucket: the light goes round
// the board once a minute), so a resting disc costs one blit. A disc that
// is flipping, rocking or flying is drawn live from anti-aliased ellipses.

import { mix, scale, clamp } from '../js/kit.js';

export const FELT = 0x1b7a4c, GRID = 0x0b3b25, SHADOW = 0x0c3f27;
export const BLACK = 0, WHITE = 1;
const BASE = [0x2a2a30, 0xf3f0e6];
const SPEC = [0.75, 0.22], AMB = [0.52, 0.62], KD = [0.62, 0.46];
export const R = 3.8;            // disc radius, px
export const LIGHT_N = 120;      // light buckets per revolution
const ELEV = 0.70;               // light elevation, radians
const SHADOW_OFF = 0.95;         // resting shadow offset, px

/** Direction to the light at clock angle `a`: [x, y, z], screen y down. */
export function light3(a) {
  const c = Math.cos(ELEV), z = Math.sin(ELEV);
  const L = [Math.sin(a) * c, -Math.cos(a) * c, z];
  // Blinn half vector with the viewer straight above, kept with the light.
  const hl = Math.sqrt(L[0] * L[0] + L[1] * L[1] + (z + 1) * (z + 1));
  L.h = [L[0] / hl, L[1] / hl, (z + 1) / hl];
  L.dx = Math.sin(a); L.dy = -Math.cos(a);   // towards the light, on the board
  return L;
}

/** Lit colour of `side` for a surface normal n (unit) under light L. */
export function shade(side, n, L) {
  const d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
  const H = L.h;
  // Specular lobe: (n.h)^32 by five squarings.
  let sp = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
  sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
  sp *= SPEC[side];
  const k = AMB[side] + KD[side] * d;
  const base = BASE[side];
  const r = clamp(((base >> 16) & 255) * k + 255 * sp, 0, 255);
  const g = clamp(((base >> 8) & 255) * k + 255 * sp, 0, 255);
  const b = clamp((base & 255) * k + 255 * sp, 0, 255);
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | (b + 0.5);
}

/** Normal of the slightly domed, bevelled face at (px, py) from the centre. */
function domeNormal(px, py) {
  const d = Math.hypot(px, py), rho = d / R;
  if (d < 1e-6) return [0, 0, 1];
  const slope = rho < 0.68 ? 0.12 * rho : 0.082 + (rho - 0.68) * 3.6;
  const nx = (px / d) * slope, ny = (py / d) * slope;
  const l = Math.hypot(nx, ny, 1);
  return [nx / l, ny / l, 1 / l];
}

function bake(side, a) {
  const L = light3(a);
  const sx = -Math.sin(a) * SHADOW_OFF, sy = Math.cos(a) * SHADOW_OFF;
  const data = new Int32Array(81);
  const SS = 4;
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++) {
      let rr = 0, gg = 0, bb = 0;
      for (let v = 0; v < SS; v++)
        for (let u = 0; u < SS; u++) {
          const px = i + (u + 0.5) / SS - 4.5, py = j + (v + 0.5) / SS - 4.5;
          let c;
          if (px * px + py * py < R * R) c = shade(side, domeNormal(px, py), L);
          else if ((px - sx) ** 2 + (py - sy) ** 2 < R * R) c = SHADOW;
          else c = FELT;
          rr += (c >> 16) & 255; gg += (c >> 8) & 255; bb += c & 255;
        }
      const n = SS * SS;
      data[j * 9 + i] = (Math.round(rr / n) << 16) | (Math.round(gg / n) << 8) | Math.round(bb / n);
    }
  return { w: 9, h: 9, data };
}

/** SPRITES[side][bucket]: a resting disc with its shadow on felt. */
export const SPRITES = [BLACK, WHITE].map((side) =>
  Array.from({ length: LIGHT_N }, (_, b) => bake(side, (b / LIGHT_N) * Math.PI * 2)));

/**
 * A disc off its rest: turned by `theta` (0 = side A up, PI = side B up)
 * about the axis across `axis` ('x': it tips left/right, 'y': up/down),
 * `sgn` the way it tips, lifted `h` px towards the camera, lit by L (light3).
 * Drawn as: shadow on the board, the hidden face's rim, the visible face.
 */
export function drawDisc(g, cx, cy, sideA, sideB, theta, h, L, { sgn = 1, axis = 'x', size = 1, shadowA = 0.55, bevel = false } = {}) {
  const k = size * (1 + h * 0.035);
  const rad = R * k, T = 1.5 * k;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const fore = Math.max(0.45, rad * Math.abs(ct));
  const ex = axis === 'x', ux = ex ? sgn : 0, uy = ex ? 0 : sgn;

  // Shadow: the disc's outline pushed away from the light, further when lifted.
  const so = SHADOW_OFF + h * 0.75, ss = 1 / (1 + h * 0.04);
  const shx = cx - L.dx * so, shy = cy - L.dy * so;
  const sr = Math.max(0.6, R * size * ss);
  const sf = Math.max(0.6, R * size * ss * Math.max(Math.abs(ct), Math.abs(st) * 0.32));
  g.fillEllipse(shx, shy, ex ? sf : sr, ex ? sr : sf, 0x000000, { aa: true, a: shadowA * (1 / (1 + h * 0.06)) });

  // The face normal of side A, tipped by theta.
  const nA = [st * ux, st * uy, ct];
  const up = ct >= 0;
  const vis = up ? sideA : sideB, hid = up ? sideB : sideA;
  const nV = up ? nA : [-nA[0], -nA[1], -nA[2]];
  // Side A's face sits half a thickness along +nA from the centre.
  const off = (T / 2) * st;
  const ax = cx + off * ux, ay = cy + off * uy, bx = cx - off * ux, by = cy - off * uy;
  const [vx, vy, hx, hy] = up ? [ax, ay, bx, by] : [bx, by, ax, ay];
  const rimV = scale(shade(vis, nV, L), 0.72), rimH = scale(shade(hid, nV, L), 0.62);
  const ell = (x, y, c) => g.fillEllipse(x, y, ex ? fore : rad, ex ? rad : fore, c, { aa: true });
  ell(hx, hy, rimH);
  ell((hx + vx) / 2, (hy + vy) / 2, mix(rimH, rimV, 0.5));
  const face = shade(vis, nV, L);
  if (!bevel) { ell(vx, vy, face); return; }
  // Slow discs get the baked discs' bevel: dark rim, lit rim towards the lamp, face.
  const ellK = (x, y, f, c) => g.fillEllipse(x, y, (ex ? fore : rad) * f, (ex ? rad : fore) * f, c, { aa: true });
  ellK(vx, vy, 1, scale(face, 0.62));
  ellK(vx + L.dx * 0.45 * k, vy + L.dy * 0.45 * k, 0.9, mix(face, 0xffffff, vis === BLACK ? 0.3 : 0.12));
  ellK(vx - L.dx * 0.1 * k, vy - L.dy * 0.1 * k, 0.72, face);
}
