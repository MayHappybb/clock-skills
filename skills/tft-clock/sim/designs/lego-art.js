// lego: drawing the plastic and the hand, seen from straight above.
//
// Light comes from the top left (a window), so every raised thing throws a
// shadow down and right, longer the higher it is. The camera is close: a
// thing lifted toward it grows (perspective about the glass centre), which
// is how the eye reads "this brick is in the air".

import { Gfx, sprite, mix, scale } from '../js/kit.js';
import { P, OX, OY, colourOf } from './lego-plan.js';

export const BASE = 0x237841;    // LEGO "Green" baseplate
const F = 170;                    // camera height, px
const LX = 0.42, LY = 0.34;       // shadow offset per px of height

/** Where a point at height z appears on the glass. */
export const proj = (x, y, z) => { const k = F / (F - z); return [80 + (x - 80) * k, 40 + (y - 40) * k, k]; };
export const shadowAt = (x, y, z) => [x + z * LX, y + z * LY];

// ------------------------------------------------------------ studs

const studCache = new Map();
/** A stud as a 6x6 overlay for one stud cell, in shades of the plastic `c`. */
export function studSprite(c) {
  let s = studCache.get(c);
  if (s) return s;
  s = sprite(`
    ......
    ..hh..
    .hwcd.
    .hccds
    ..dds.
    ......`, {
    h: mix(c, 0xffffff, 0.32), w: mix(c, 0xffffff, 0.7), c: mix(c, 0xffffff, 0.06),
    d: scale(c, 0.66), s: scale(c, 0.8),
  });
  studCache.set(c, s);
  return s;
}

/** The baseplate, studs over the whole glass, drawn once. */
export function makeBase(c = BASE) {
  const g = new Gfx(160, 80);
  g.clear(c);
  const st = studSprite(c);
  for (let r = -1; r < 14; r++) for (let q = -1; q < 27; q++) g.blit(st, OX + q * P, OY + r * P);
  return g;
}

// ------------------------------------------------------------ bricks on the grid

export function gridShadow(g, b) {
  g.fillRect(OX + b.c * P + 2, OY + b.r * P + 2, b.w * P, b.h * P, 0x000000, { a: 0.38 });
}

/** A brick snapped onto the plate: hard pixels, bevelled edges, a stud per cell. */
export function gridBrick(g, b, c = colourOf(b.w, b.h)) {
  const x = OX + b.c * P, y = OY + b.r * P, w = b.w * P, h = b.h * P;
  g.fillRect(x, y, w, h, c);
  const lit = mix(c, 0xffffff, 0.4), dark = scale(c, 0.6);
  g.hline(x, y, w, lit); g.vline(x, y, h, lit);
  g.hline(x, y + h - 1, w, dark); g.vline(x + w - 1, y, h, dark);
  const st = studSprite(c);
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) g.blit(st, x + i * P, y + j * P);
}

// ------------------------------------------------------------ bricks in the air

function corners(cx, cy, hw, hh, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([u, v]) => [cx + u * ca - v * sa, cy + u * sa + v * ca]);
}

/** The shadow of a brick at height z, centre (x, y), angle a. */
export function floatShadow(g, b, x, y, z, a) {
  const [sx, sy] = shadowAt(x, y, z);
  const soft = Math.min(1, z / 40);
  g.fillPolygon(corners(sx + 1.5, sy + 1.5, (b.w * P) / 2, (b.h * P) / 2, a), 0x000000, { aa: true, a: 0.36 - 0.14 * soft });
}

/** A brick off the plate: anti-aliased, scaled by its height. */
export function floatBrick(g, b, x, y, z, a, c = colourOf(b.w, b.h)) {
  const [px, py, k] = proj(x, y, z);
  const hw = (b.w * P * k) / 2, hh = (b.h * P * k) / 2;
  g.fillPolygon(corners(px, py, hw, hh, a), scale(c, 0.62), { aa: true });
  g.fillPolygon(corners(px - 0.4, py - 0.4, hw - 0.9, hh - 0.9, a), c, { aa: true });
  const ca = Math.cos(a), sa = Math.sin(a), rr = 1.9 * k;
  const hi = mix(c, 0xffffff, 0.4), lo = scale(c, 0.66);
  for (let j = 0; j < b.h; j++)
    for (let i = 0; i < b.w; i++) {
      const u = (i + 0.5 - b.w / 2) * P * k, v = (j + 0.5 - b.h / 2) * P * k;
      const cx = px + u * ca - v * sa, cy = py + u * sa + v * ca;
      g.fillCircle(cx + 0.45, cy + 0.45, rr, lo, { aa: true });
      g.fillCircle(cx - 0.35, cy - 0.35, rr * 0.92, hi, { aa: true });
      g.fillCircle(cx + 0.05, cy + 0.05, rr * 0.72, c, { aa: true });
    }
}

// ------------------------------------------------------------ the hand

export const SKIN = 0xe9b38c, SKIN_LIT = 0xf8d2b0, SKIN_DARK = 0xb57a55, NAIL = 0xf7ddd3;
const SLEEVE = 0x2f4778, SLEEVE_DARK = 0x1f3058, SLEEVE_LIT = 0x4a659b;
const SHOULDER = [182, 150];

// Fingers in hand space: u forward (toward the fingertips), v to the right.
// [base u, base v, closed tip u, v, open tip u, v, width]
const FINGERS = [
  [-7, 9.5, -3.5, 10.5, 1.5, 13.5, 5.2],   // little
  [-5, 5, -1, 6.8, 5.5, 8.5, 6.0],         // ring
  [-4, -0.5, 3.5, 2.2, 8.5, 1.2, 6.6],     // middle
  [-5, -6.5, 2.5, -3.8, 7.5, -8, 6.4],     // index
];
const PALM = [[-4, -10], [-3, -4], [-3, 3], [-4.5, 9], [-7, 12.5], [-15, 12.5], [-25, 9], [-26, -6], [-17, -12.5], [-9, -12]];

/**
 * The builder's right hand, back up, coming from below right.
 * pose: { x, y, z, open 0..1, lift: [4] per-finger lift 0..1 }
 * (x, y) is the point between the fingertips; z their height.
 */
export function handFrame(pose) {
  let fx = pose.x - SHOULDER[0], fy = pose.y - SHOULDER[1];
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl; fy /= fl;
  const rx = -fy, ry = fx;
  // Hand-space point (u, v) at extra height dz -> glass.
  const at = (u, v, dz = 0) => {
    const z = pose.z + dz;
    return proj(pose.x + u * fx + v * rx, pose.y + u * fy + v * ry, z);
  };
  const sh = (u, v, dz = 0) => {
    const z = pose.z + dz;
    return shadowAt(pose.x + u * fx + v * rx, pose.y + u * fy + v * ry, z);
  };
  return { at, sh, fx, fy, rx, ry };
}

export function handShadow(g, pose) {
  const H = handFrame(pose);
  const soft = Math.min(1, pose.z / 45);
  const o = { aa: true, a: 0.34 - 0.16 * soft };
  const [ax, ay] = H.sh(-16, 1, 7), [bx, by] = H.sh(-120, 4, 30);
  g.thickLine(ax, ay, bx, by, 21, 0x000000, o);
  const [cx, cy] = H.sh(-1, 1, 3);
  g.fillPolygon([H.sh(-3, -12, 5), H.sh(6, -9, 1), H.sh(8, 3, 1), H.sh(4, 13, 2), H.sh(-8, 14, 5), H.sh(-13, 13, 6), H.sh(-14, -13, 6)], 0x000000, o);
  void cx; void cy;
}

export function drawHand(g, pose) {
  const H = handFrame(pose);
  const open = pose.open ?? 1, lift = pose.lift ?? [0, 0, 0, 0];
  const o = { aa: true };

  // Forearm and sleeve, rising toward the camera as they leave the glass.
  const [w0x, w0y, k0] = H.at(-22, 1, 6), [w1x, w1y, k1] = H.at(-120, 4, 30);
  g.thickLine(w0x, w0y, w1x, w1y, 18 * k0 + 2, SKIN_DARK, o);
  g.thickLine(w0x, w0y, w1x, w1y, 18 * k0, SKIN, o);
  const [s0x, s0y, ks] = H.at(-36, 1.5, 9);
  g.thickLine(s0x, s0y, w1x, w1y, 22 * ks + 2, SLEEVE_DARK, o);
  g.thickLine(s0x, s0y, w1x, w1y, 22 * ks, SLEEVE, o);
  for (let i = 0; i < 4; i++) { // ribbed cuff
    const u = -38 - i * 2.6;
    const [ax, ay] = H.at(u, -10, 9), [bx, by] = H.at(u, 12, 9);
    g.thickLine(ax, ay, bx, by, 0.9, i % 2 ? SLEEVE_LIT : SLEEVE_DARK, o);
  }

  // Back of the hand.
  const palm = PALM.map(([u, v]) => H.at(u, v, 6));
  g.fillPolygon(palm, SKIN_DARK, o);
  g.fillPolygon(PALM.map(([u, v]) => H.at(u * 0.94 - 0.6, v * 0.9, 6)), SKIN, o);
  // A broad highlight on the side facing the light, and the knuckles.
  const [hx, hy] = H.at(-15, -5, 7), [hx2, hy2] = H.at(-8, 2, 7);
  g.thickLine(hx, hy, hx2, hy2, 5, SKIN_LIT, { aa: true, a: 0.55 });

  // Fingers, little to index, each over the last.
  FINGERS.forEach(([bu, bv, cu, cv, ou, ov, w], i) => {
    const l = lift[i] ?? 0;
    const tu = cu + (ou - cu) * open - l * 3, tv = cv + (ov - cv) * open;
    const [ax, ay, ka] = H.at(bu, bv, 5);
    const [bx, by, kb] = H.at(tu, tv, 1 + l * 9);
    const ww = w * (ka + kb) / 2;
    g.thickLine(ax, ay, bx, by, ww + 1.6, SKIN_DARK, o);
    g.thickLine(ax, ay, bx, by, ww, SKIN, o);
    // lit edge, toward the window
    const ox = -0.28 * ww, oy = -0.22 * ww;
    g.thickLine(ax + ox * 0.6, ay + oy * 0.6, bx + ox * 0.5, by + oy * 0.5, ww * 0.3, SKIN_LIT, { aa: true, a: 0.8 });
    // nail
    const [nx, ny] = H.at(tu - 1.6, tv, 1 + l * 9);
    g.fillCircle(nx, ny, ww * 0.3, NAIL, o);
    // knuckle
    g.fillCircle(ax - 0.3, ay - 0.3, ww * 0.22, SKIN_LIT, { aa: true, a: 0.6 });
  });

  // Thumb, along the left side, its tip at the brick.
  const tt = [-5 - open * 3, -10 - open * 5];
  const pts = [H.at(-18, -11, 6), H.at(-11, -14.5, 4), H.at(tt[0], tt[1], 1)];
  const kt = pts[0][2];
  g.stroke(pts.map((p) => [p[0], p[1]]), 7.4 * kt + 1.6, SKIN_DARK, o);
  g.stroke(pts.map((p) => [p[0], p[1]]), 7.4 * kt, SKIN, o);
  g.thickLine(pts[1][0] - 1.6, pts[1][1] - 1.2, pts[2][0] - 1.2, pts[2][1] - 1, 2, SKIN_LIT, { aa: true, a: 0.8 });
  const [nx, ny] = H.at(tt[0] - 0.5, tt[1] + 1.4, 1);
  g.fillCircle(nx, ny, 2.1 * kt, NAIL, o);
}
