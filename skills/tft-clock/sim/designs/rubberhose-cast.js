// Drawing the cast of "rubberhose": a numeral body from its distance field
// under squash, stretch and lean; noodle limbs stamped 2 x 2 along a bowed
// curve; white gloves, big shoes and pie-cut eyes as fixed-size sprites.
import { hash } from '../js/kit.js';
import { SDF, ANCH, GH, sample } from './rubberhose-glyphs.js';
import { INK, GROUND, INK_C, GROUND_C, GLOVE, GLOVE_UP, SHOE, SHOE_ANKLE } from './rubberhose-art.js';

const W = 160, H = 80;

/**
 * The body. mode 0: the ground-coloured moat round it (a keyline against the
 * scenery); 1: solid ink; 2: dust, a stipple of the body keeping the pixels
 * whose fixed rank is below `dens` (0..1), so it thins evenly.
 */
export function body(g, d, cx, by, sx, sy, k, mode, dens = 1) {
  const f = SDF[d], buf = g.buf, ak = k < 0 ? -k : k;
  const x0 = Math.max(0, (cx - 11 * sx - ak - 3) | 0), x1 = Math.min(W - 1, (cx + 11 * sx + ak + 3) | 0);
  const y0 = Math.max(0, (by - GH * sy - 3) | 0), y1 = Math.min(H - 1, (by + 3) | 0);
  if (x1 < 0 || x0 >= W) return;
  const isx = 1 / sx, isy = 1 / sy, kk = k / GH, thr = (dens * 255) | 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const v = GH - (by - (y + 0.5)) * isy;
    const sh = cx + kk * (GH - v);
    for (let x = x0; x <= x1; x++) {
      const s = sample(f, (x + 0.5 - sh) * isx + 11, v);
      n++;
      if (mode === 0) { if (s >= 0 && s < 12) buf[y * W + x] = GROUND; }
      else if (s < 0) {
        if (mode === 1) buf[y * W + x] = INK;
        else buf[y * W + x] = (hash(x, y, 7) & 255) < thr ? INK : GROUND;
      }
    }
  }
  g.cost.box += n * 9;
}

/** Screen position of glyph point p under the body's transform. */
export const at = (cx, by, sx, sy, k, p) => [cx + (p[0] - 11) * sx + (k * (GH - p[1])) / GH, by - (GH - p[1]) * sy];

/** A noodle limb: a quadratic curve bowed `bend` px to its left, 2 px thick. */
export function noodle(g, ax, ay, bx, by, bend) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
  const L = Math.sqrt(dx * dx + dy * dy) || 1;
  const qx = mx - (dy / L) * bend, qy = my + (dx / L) * bend;
  const n = Math.max(2, (L * 1.5) | 0), buf = g.buf;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    const x = (a * ax + b * qx + c * bx - 0.5) | 0, y = (a * ay + b * qy + c * by - 0.5) | 0;
    for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++) {
      const X = x + q, Y = y + j;
      if (X >= 0 && Y >= 0 && X < W && Y < H) buf[Y * W + X] = INK;
    }
  }
  g.cost.px += n * 4; g.cost.box += n * 8;
}

/** Two pie-cut eyes centred on (ex, ey); pupils offset (lx 0..2, ly 0..3). */
export function eyes(g, ex, ey, lx, ly, blink) {
  const x = Math.round(ex - 4.5), y = Math.round(ey - 3);
  g.fillRect(x - 1, y - 1, 11, 8, INK_C);
  for (const o of [0, 5]) {
    if (blink) { g.fillRect(x + o + 1, y + 4, 2, 1, GROUND_C); g.fillRect(x + o, y + 3, 1, 1, GROUND_C); g.fillRect(x + o + 3, y + 3, 1, 1, GROUND_C); continue; }
    g.fillRect(x + o + 1, y, 2, 6, GROUND_C);
    g.fillRect(x + o, y + 1, 4, 4, GROUND_C);
    const px = x + o + lx, py = y + 1 + ly;
    g.fillRect(px, py, 2, 3, INK_C);
    g.pixel(px + (lx >= 1 ? 1 : 0), py, GROUND_C);   // the pie cut
  }
}

/** The running-blur "wheel" of legs under a digit winding up to dash. */
export function wheel(g, x, y, a) {
  g.circle(x, y, 6, INK_C);
  g.circle(x, y, 5, INK_C);
  for (let i = 0; i < 3; i++) {
    const t = a + (i * Math.PI * 2) / 3;
    g.line(x, y, Math.round(x + 5 * Math.cos(t)), Math.round(y + 5 * Math.sin(t)), INK_C);
    g.line(x + 1, y, Math.round(x + 1 + 5 * Math.cos(t)), Math.round(y + 5 * Math.sin(t)), INK_C);
  }
}

/**
 * A whole character. st: { d, cx, by, sx, sy, k } ; pose: { footL, footR,
 * knee, handL, handR, elbow, up, lookX, lookY, blink, wheel }.
 */
export function character(g, st, pose) {
  const { d, cx, by, sx, sy, k } = st, A = ANCH[d];
  if (pose.wheel !== undefined) {
    const hl = at(cx, by, sx, sy, k, A.hipL);
    noodle(g, hl[0], hl[1], cx, FLOOR_WHEEL - 6, 0);
    wheel(g, Math.round(cx), FLOOR_WHEEL - 6, pose.wheel);
  } else {
    const hl = at(cx, by, sx, sy, k, A.hipL), hr = at(cx, by, sx, sy, k, A.hipR);
    const fl = pose.footL, fr = pose.footR;
    noodle(g, hl[0], hl[1], fl[0], fl[1] - 1, pose.knee);
    noodle(g, hr[0], hr[1], fr[0], fr[1] - 1, -pose.knee);
    g.blit(SHOE, fl[0] - SHOE_ANKLE, fl[1] - 2);
    g.blit(SHOE, fr[0] - (SHOE.w - 1 - SHOE_ANKLE), fr[1] - 2, { flipX: true });
  }
  const al = at(cx, by, sx, sy, k, A.armL), ar = at(cx, by, sx, sy, k, A.armR);
  noodle(g, al[0], al[1], pose.handL[0], pose.handL[1], pose.elbow);
  noodle(g, ar[0], ar[1], pose.handR[0], pose.handR[1], -pose.elbow);
  body(g, d, cx, by, sx, sy, k, 1);
  const gl = pose.up ? GLOVE_UP : GLOVE;
  g.blit(gl, Math.round(pose.handL[0] - 3), Math.round(pose.handL[1] - 3), { flipX: true });
  g.blit(gl, Math.round(pose.handR[0] - 3), Math.round(pose.handR[1] - 3));
  const e = at(cx, by, sx, sy, k, A.eye);
  eyes(g, e[0], e[1], pose.lookX, pose.lookY, pose.blink);
}

const FLOOR_WHEEL = 73;
