// Brushwork for everything in "flamingos" that is not a numeral: legs,
// wings, birds in flight, the far flock, ripple rings and splashes. All of it
// paints pigment codes (flamingos-paint.js) straight into the face's working
// buffer P, with integer tests over small boxes (no square roots); `work`
// counts the pixels scanned so the face can bill them to the estimate.

import { sin, cos } from '../js/kit.js';
import { W, H, GRAIN, code, addCode } from './flamingos-paint.js';

export const work = { n: 0 };

// plumage codes, dry
export const C_LEG = code(5, 4, 0), C_KNEE = code(7, 5, 1);
export const C_NECK = code(3, 1, 0), C_BODY = code(4, 3, 0), C_COVERT = code(4, 6, 0), C_PRIM = code(8, 5, 9);
export const C_BILL = code(1, 1, 0), C_TIP = code(9, 6, 10);

/**
 * A round-ended stroke from (ax, ay) to (bx, by), radius r, painted with
 * code c (replacing what is under it: the brush covers paper the background
 * wash was painted round). Granulates by the paper grain.
 */
export function capsule(P, ax, ay, bx, by, r, c) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  if (x0 > x1 || y0 > y1) return;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6, r2 = r * r;
  const cg = addCode(c, 1, 0, 0);
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5 - ay;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      let u = (px * dx + py * dy) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - u * dx, ey = py - u * dy;
      if (ex * ex + ey * ey <= r2) { const i = y * W + x; P[i] = GRAIN[i] >= 13 ? cg : c; }
    }
  }
  work.n += (x1 - x0 + 1) * (y1 - y0 + 1) * 12;   // a dot product, a divide and a compare per pixel
}

/** A filled triangle painted with code c (edge functions over its box). */
export function tri(P, ax, ay, bx, by, cx, cy, c) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (x0 > x1 || y0 > y1 || Math.abs(area) < 0.01) return;
  const sg = area > 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const e0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * sg, e1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * sg, e2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * sg;
      if (e0 >= 0 && e1 >= 0 && e2 >= 0) P[y * W + x] = c;
    }
  }
  work.n += (x1 - x0 + 1) * (y1 - y0 + 1) * 6;
}

/** A quadrilateral a, b, c, d (in order) painted with code c. */
function quad(P, ax, ay, bx, by, cx, cy, dx, dy, c) { tri(P, ax, ay, bx, by, cx, cy, c); tri(P, ax, ay, cx, cy, dx, dy, c); }

/**
 * One wing: from the shoulder (a base a-b along the back) out to a spread
 * tip (t1 trailing, t2 leading), coral coverts then the black primaries.
 */
function wing(P, ax, ay, bx, by, t1x, t1y, t2x, t2y, cov) {
  const k = 0.5, mx = ax + (t1x - ax) * k, my = ay + (t1y - ay) * k, nx = bx + (t2x - bx) * k, ny = by + (t2y - by) * k;
  quad(P, ax, ay, bx, by, nx, ny, mx, my, cov);
  quad(P, mx, my, nx, ny, t2x, t2y, t1x, t1y, C_PRIM);
}

/** A thin elliptical ring (ripple), glazed: adds pigment over what is there. */
export function ring(P, cx, cy, rx, ry, dr, dO, dt) {
  if (rx < 0.8) return;
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const irx = 1 / rx, iry = 1 / ry, th = 1.25 / rx;
  for (let y = y0; y <= y1; y++) {
    const ey = (y + 0.5 - cy) * iry;
    for (let x = x0; x <= x1; x++) {
      const ex = (x + 0.5 - cx) * irx, q = ex * ex + ey * ey - 1;
      if (q > -th && q < th) { const i = y * W + x; P[i] = addCode(P[i], dr, dO, dt); }
    }
  }
  work.n += (x1 - x0 + 1) * (y1 - y0 + 1) * 8;
}

/** A dab of bare paper (spray, a splash): a reserve lifted out with a tissue. */
export function dab(P, x, y, w, h) {
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j;
    if (px >= 0 && py >= 0 && px < W && py < H) P[py * W + px] = 0;
  }
  work.n += w * h;
}

/**
 * A flamingo in flight, side on: neck stretched forward, legs trailing, the
 * long wings beating (flap: 0..1 phase), coral coverts and black primaries.
 * (x, y) is the middle of the body, dir +1 flies right, sc its size.
 * glide 0..1 holds the wings out flat; feet 0..1 swings the legs down to land.
 */
export function flyer(P, x, y, dir, sc, flap, glide = 0, feet = 0) {
  const s = sc, d = dir;
  // wing beat: -1 down .. +1 up; gliding in to land, the wings are held up in a V
  const beat = sin(flap * Math.PI * 2) * (1 - glide) + 0.75 * glide;
  // legs: trailing straight back, or swung down and forward to land
  const la = 0.15 + feet * 1.25, lx = -cos(la) * 12 * s, ly = sin(la) * 12 * s;
  capsule(P, x - d * 3 * s, y + 0.5 * s, x - d * 3 * s + d * lx, y + 0.5 * s + ly, 0.75 * s + 0.15, C_LEG);
  // far wing, behind the body (shorter: it is seen across the back)
  const fy = y - 1 * s - 9 * s * beat - 1 * s;
  wing(P, x - d * 2.5 * s, y - 1 * s, x + d * 2.5 * s, y - 1 * s, x - d * 3 * s, fy, x + d * 0.5 * s, fy, C_COVERT);
  // body, neck, head and bill
  capsule(P, x - d * 4 * s, y, x + d * 3 * s, y - 0.3 * s, 2.3 * s, C_BODY);
  capsule(P, x + d * 3 * s, y - 0.4 * s, x + d * 12 * s, y - 1.6 * s, 0.95 * s + 0.1, C_NECK);
  capsule(P, x + d * 12.6 * s, y - 1.8 * s, x + d * 12.6 * s, y - 1.8 * s, 1.55 * s, C_NECK);
  capsule(P, x + d * 13.6 * s, y - 1.5 * s, x + d * 15.4 * s, y - 0.9 * s, 0.8 * s, C_BILL);
  capsule(P, x + d * 15.4 * s, y - 0.9 * s, x + d * 15.8 * s, y + 0.6 * s, 0.6 * s + 0.1, C_TIP);
  // near wing, over the body: broad, its tip swept back
  const ny = y - 0.5 * s - 13 * s * beat;
  wing(P, x - d * 4.5 * s, y - 0.5 * s, x + d * 3 * s, y - 0.5 * s, x - d * 7 * s, ny + 1.5 * s * beat, x - d * 2 * s, ny, C_COVERT);
}

// ------------------------------------------------------------ the far flock

// A distant flamingo is a few dabs: 7 px tall, pale (it is far off).
// Rows of [dx, dy, kind]: n neck, h head, b body, t tail, l leg, k bill.
const FAR_UP = [[3, 0, 'h'], [4, 0, 'k'], [3, 1, 'n'], [2, 2, 'n'], [2, 3, 'n'], [0, 4, 'b'], [1, 4, 'b'], [2, 4, 'b'], [3, 4, 'b'], [0, 5, 't'], [1, 5, 'b'], [2, 5, 'b'], [3, 5, 'b'], [1, 6, 'l'], [3, 6, 'l'], [1, 7, 'l'], [3, 7, 'l']];
const FAR_DOWN = [[0, 3, 'b'], [1, 3, 'b'], [2, 3, 'b'], [3, 3, 'b'], [0, 4, 't'], [1, 4, 'b'], [2, 4, 'b'], [3, 4, 'b'], [4, 4, 'n'], [5, 5, 'n'], [5, 6, 'h'], [1, 5, 'l'], [3, 5, 'l'], [1, 6, 'l'], [3, 6, 'l'], [1, 7, 'l'], [3, 7, 'l']];
const FAR_CODE = { h: code(2, 1, 0), n: code(2, 1, 0), b: code(3, 2, 0), t: code(5, 3, 5), l: code(3, 2, 0), k: code(5, 3, 5) };

/** One far bird with its feet at (x, y); dir +1 faces right; down: feeding. */
export function farBird(P, x, y, dir, down) {
  x = Math.round(x); y = Math.round(y);
  const pts = down ? FAR_DOWN : FAR_UP;
  for (const [dx, dy, k] of pts) {
    const px = dir > 0 ? x + dx - 2 : x - dx + 2, py = y - 7 + dy;
    if (px >= 0 && px < W && py >= 0 && py < H) P[py * W + px] = FAR_CODE[k];
  }
  work.n += pts.length * 2;
}
