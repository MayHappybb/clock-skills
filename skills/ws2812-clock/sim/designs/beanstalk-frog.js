// The rainbow frog in round glasses, drawn analytically at sub-pixel
// position (it glides, never hops a pixel), plus the butterflies and the
// flowers of the hour show. Everything paints over the shared image.
import * as kit from '../js/kit.js';
import { W, H, img } from './beanstalk-draw.js';

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const RAINBOW = Array.from({ length: 33 }, (_, i) => kit.scale(kit.hsv(0.0 + 0.8 * i / 32, 0.82, 1), 0.85));
const BELLY = [0.75, 0.62, 0.30], LENS = [0.70, 0.72, 0.68], FRAME = [0.012, 0.010, 0.014], RIM = [0.55, 0.42, 0.16];
const PINK = kit.hex('#ff5a8c'), PEACH = kit.hex('#ffc0a0'), GOLD = kit.hex('#ffd040'), STEM = kit.hex('#2f7a18');

/** Coverage of an ellipse at (u, v). */
function ell(u, v, cx, cy, rx, ry) {
  const a = (u - cx) / rx, b = (v - cy) / ry, q = Math.sqrt(a * a + b * b);
  return cl((1 - q) * (rx < ry ? rx : ry) + 0.5);
}
const px = new Float32Array(3);
function paint(q, col, c) {
  img[q] += (col[0] - img[q]) * c; img[q + 1] += (col[1] - img[q + 1]) * c; img[q + 2] += (col[2] - img[q + 2]) * c;
}
function skin(u, v, k) {
  const h = cl((u * 0.75 - v * 0.55 + 8) / 16), c = RAINBOW[Math.round(h * 32)];
  px[0] = c[0] * k; px[1] = c[1] * k; px[2] = c[2] * k;
  return px;
}

/**
 * The frog at (x, y). o: { pose 0 sit | 1 climb | 2 parachute, ph climb phase,
 * blink 0..1, lx, ly pupil offset, rot, canopy 0..1, breath }.
 */
export function frog(x, y, o) {
  const S = o.s || 1, iS = 1 / S, top = (o.pose === 2 ? 27 : 10) * S;
  const x0 = Math.max(0, Math.floor(x - 14 * S)), x1 = Math.min(W - 1, Math.ceil(x + 14 * S));
  const y0 = Math.max(0, Math.floor(y - top)), y1 = Math.min(H - 1, Math.ceil(y + 10 * S));
  const cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0), br = o.breath || 0;
  // limb positions for the pose
  let hx = 3.4, hy = 5.6, hy2 = 5.6, lgx = 5.6, lgy = 3.2, lgy2 = 3.2, lrx = 3.3, lry = 2.6;
  if (o.pose === 1) {
    const s = Math.sin(o.ph);
    hx = 4.6; hy = -3 - 2.4 * s; hy2 = -3 + 2.4 * s; lgx = 5.2; lgy = 4.6 + 1.8 * s; lgy2 = 4.6 - 1.8 * s; lrx = 2.2; lry = 3.0;
  } else if (o.pose === 2) {
    hx = 2.3; hy = -8.6; hy2 = -8.6; lgx = 2.9; lgy = 6.6; lgy2 = 6.9; lrx = 1.5; lry = 2.4;
  }
  for (let py = y0; py <= y1; py++) {
    for (let pxl = x0; pxl <= x1; pxl++) {
      const dx = (pxl - x) * iS, dy = (py - y) * iS, u = cr * dx + sr * dy, v = -sr * dx + cr * dy;
      const q = 3 * (py * W + pxl);
      if (o.pose === 2 && v < -7) {
        // flower canopy and its stem
        const cs = o.canopy;
        if (Math.abs(u) < 0.6 && v > -17) paint(q, STEM, cl(0.6 + 0.5 - Math.abs(u)));
        if (cs > 0) {
          // an upturned flower as a parachute: a dome of five petals with
          // scalloped tips, veins radiating from the gold heart on top
          const cy = -18.5, rx = 9 * cs + 0.3, ry = 6 * cs + 0.3;
          const du = u / rx, dv = (v - cy) / ry, rr = Math.sqrt(du * du + dv * dv);
          let c = dv < 0 ? cl((1 - rr) * ry + 0.5) : 0;
          // scallops hanging under the rim
          const pw = 2 * rx / 5, k = Math.floor((u + rx) / pw), sc = -rx + (k + 0.5) * pw;
          if (k >= 0 && k < 5 && dv >= -0.2) c = Math.max(c, cl(pw * 0.55 - Math.hypot(u - sc, (v - cy) * 1.6) + 0.5));
          if (c > 0) {
            const ang = Math.atan2(v - cy + ry, u), vein = Math.abs(Math.sin(ang * 5 * 0.5 * 2)) < 0.18 ? 0.55 : 1;
            const col = kit.mix(PEACH, PINK, cl(0.3 + 0.7 * rr));
            paint(q, kit.scale(col, vein), c);
          }
          const g = ell(u, v, 0, cy - ry + 0.6, 1.8 * cs + 0.1, 1.1 * cs + 0.1);
          if (g > 0) paint(q, GOLD, g);
        }
        if (v < -9.8) continue;
      }
      // legs / haunches behind the body
      let c = Math.max(ell(u, v, -lgx, lgy, lrx, lry), ell(u, v, lgx, lgy2, lrx, lry));
      if (c > 0) paint(q, skin(u, v, 0.62), c);
      // body and head
      c = Math.max(ell(u, v, 0, 1.2, 6.0, 4.6 + br), ell(u, v, 0, -2.6, 6.6, 3.7), ell(u, v, -3.5, -5.6, 2.7, 2.7), ell(u, v, 3.5, -5.6, 2.7, 2.7));
      if (c > 0) paint(q, skin(u, v, 1), c);
      c = ell(u, v, 0, 2.7 + br * 0.5, 3.4, 2.4);
      if (c > 0) paint(q, BELLY, c * 0.9);
      // smile
      if (Math.abs(u) < 4.3) {
        const m = cl(0.5 + 0.5 - Math.abs(v - (-0.9 + 0.07 * u * u)));
        if (m > 0) paint(q, FRAME, m * cl(4.3 - Math.abs(u)));
      }
      // round glasses
      for (const ex of [-3.5, 3.5]) {
        const d = Math.hypot(u - ex, v + 5.6);
        if (d > 2.9) continue;
        const ring = cl(1 - Math.abs(d - 2.35) / 0.6);
        if (d < 2.1) {
          if (o.blink > 0.5) {
            paint(q, skin(u, v, 0.8), cl(2.1 - d + 0.5));
            if (Math.abs(v + 5.3) < 0.5) paint(q, FRAME, 0.9);
          } else {
            paint(q, LENS, cl(2.1 - d + 0.3));
            const pd = Math.hypot(u - ex - o.lx, v + 5.6 - o.ly);
            paint(q, FRAME, cl(1.05 + 0.5 - pd));
          }
        }
        if (ring > 0) paint(q, RIM, ring);
      }
      if (Math.abs(v + 5.7) < 0.55 && Math.abs(u) < 1.4) paint(q, RIM, 0.9);
      // tongue, flicked at a butterfly
      if (o.tongue > 0) {
        const tl = o.tongue, ex = o.tx * tl, ey = -0.6 + o.ty * tl;
        const L2 = ex * ex + (ey + 0.6) ** 2, t = L2 ? cl((u * ex + (v + 0.6) * (ey + 0.6)) / L2) : 0;
        const d = Math.hypot(u - t * ex, v + 0.6 - t * (ey + 0.6));
        const tc = cl(0.55 + 0.25 * t - d + 0.3);
        if (tc > 0) paint(q, [0.9, 0.18, 0.28], tc);
      }
      // hands in front
      c = Math.max(ell(u, v, -hx, hy, 1.6, 1.2), ell(u, v, hx, hy2, 1.6, 1.2));
      if (c > 0) paint(q, skin(u, v, 1.1), c);
    }
  }
}

/** A butterfly at (x, y): wings flap with f (0 closed .. 1 open), colour col. */
export function butterfly(x, y, f, col, a = 1) {
  const x0 = Math.max(0, Math.floor(x - 5)), x1 = Math.min(W - 1, Math.ceil(x + 5));
  const y0 = Math.max(0, Math.floor(y - 4)), y1 = Math.min(H - 1, Math.ceil(y + 4));
  const rx = 0.5 + 2.2 * f, rx2 = 0.4 + 1.5 * f;
  for (let py = y0; py <= y1; py++) for (let pxl = x0; pxl <= x1; pxl++) {
    const u = pxl - x, v = py - y, q = 3 * (py * W + pxl);
    const w = Math.max(ell(u, v, -rx, -0.9, rx, 1.9), ell(u, v, rx, -0.9, rx, 1.9));
    const w2 = Math.max(ell(u, v, -rx2, 1.3, rx2, 1.3), ell(u, v, rx2, 1.3, rx2, 1.3));
    if (w > 0) paint(q, col, w * a);
    if (w2 > 0) paint(q, kit.scale(col, 0.6), w2 * a);
    const b = ell(u, v, 0, 0.2, 0.55, 2.0);
    if (b > 0) paint(q, [0.03, 0.02, 0.02], b * a);
  }
}

/** A five-petal flower, open by s (0..1), turned by rot. */
export function flower(x, y, s, rot, pink) {
  if (s <= 0.02) return;
  const col = pink ? PINK : PEACH, R = 5.6 * s + 1;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) for (let pxl = x0; pxl <= x1; pxl++) {
    const u = pxl - x, v = py - y, q = 3 * (py * W + pxl);
    let best = 0;
    for (let p = 0; p < 5; p++) {
      const a = rot + p * 1.2566, cx = Math.cos(a) * 2.8 * s, cy = Math.sin(a) * 2.8 * s;
      best = Math.max(best, ell(u, v, cx, cy, 2.1 * s + 0.15, 2.1 * s + 0.15));
    }
    if (best > 0) paint(q, kit.mix(col, [1, 1, 1], 0.35 * cl(1 - Math.hypot(u, v) / (4.5 * s + 0.1))), best);
    const g = ell(u, v, 0, 0, 1.2 * s + 0.1, 1.2 * s + 0.1);
    if (g > 0) paint(q, GOLD, g);
  }
}
export { PINK, PEACH };
