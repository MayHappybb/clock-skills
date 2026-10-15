// Knit: the owner's frog as a knitted toy, 22 LEDs wide. Bold and simple:
// a black outline, six flat rainbow bands in a fine knit texture, two big
// white-rimmed round glasses and a smile. Drawn by signed distance, so it
// hops between pixels smoothly and squashes when it lands.
import { W, H } from './knit-draw.js';
import * as kit from '../js/kit.js';

const BANDS = ['#e8403a', '#f08a2a', '#f2cf3a', '#4cb848', '#3a78e0', '#8a4ad0'].map(kit.hex);
const RIM = [1, 0.97, 0.9], LENS = [0.0, 0.004, 0.012], PUFF = kit.hex('#f6e6a0');

const ell = (u, v, rx, ry) => (Math.sqrt((u / rx) ** 2 + (v / ry) ** 2) - 1) * Math.min(rx, ry);
const smin = (a, b, k) => { const h = kit.clamp(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };

/**
 * Frog with body centre (x, y). sx, sy: squash/stretch. face: -1 looks left,
 * +1 right. puff 0..1: the throat sac of a "ribbit". a: opacity.
 * Returns the mouth corner, where the yarn is held.
 */
export function frog(img, x, y, { sx = 1, sy = 1, face = -1, puff = 0, a = 1, legs = 0 } = {}) {
  const x0 = Math.max(0, Math.floor(x - 15 * sx)), x1 = Math.min(W - 1, Math.ceil(x + 15 * sx));
  const y0 = Math.max(0, Math.floor(y - 14 * sy)), y1 = Math.min(H - 1, Math.ceil(y + 13 * sy + legs * 4));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - x) / sx, v = (py + 0.5 - y) / sy;
      const body = ell(u, v - 2, 10, 6.6);
      const eL = Math.hypot(u + 5, v + 4.6) - 4.1, eR = Math.hypot(u - 5, v + 4.6) - 4.1;
      // feet: tucked when sitting, trailing when it leaps
      const fl = ell(u + 8 + legs * 2, v - 8 - legs * 3, 3.6, 1.8), fr = ell(u - 8 - legs * 2, v - 8 - legs * 3, 3.6, 1.8);
      const d = Math.min(smin(smin(body, eL, 1.6), eR, 1.6), fl, fr);
      if (d > 1.6) continue;
      let c;
      if (d > 0.4) c = LENS; // the black outline
      else {
        const band = kit.clamp(Math.floor(((v + 8.8) / 17.6) * 6), 0, 5);
        const b = BANDS[band];
        // knit texture: little V columns 2 LEDs wide
        const k = 0.8 + 0.2 * Math.abs(((u * 0.5 + Math.abs(kit.fract(v * 0.5) - 0.5)) % 1 + 1) % 1 - 0.5) * 2;
        c = [b[0] * k, b[1] * k, b[2] * k];
        // glasses
        for (const ex of [-5, 5]) {
          const q = Math.hypot(u - ex, v + 4.6);
          if (q < 3.5) {
            c = q > 2.3 ? RIM : LENS;
            // pupil glint, looking the way it faces
            if (Math.hypot(u - ex - face * 0.7 + 0.2, v + 5.4) < 0.85) c = RIM;
          }
        }
        if (Math.abs(v + 4.9) < 0.6 && Math.abs(u) < 1.9) c = RIM; // bridge
        // smile
        const sm = 0.6 + 0.09 * u * u;
        if (Math.abs(u) < 4.6 && Math.abs(v - sm) < 0.55) c = LENS;
        // throat sac
        if (puff > 0 && Math.hypot(u, (v - 3.6) * 1.2) < 3.4 * puff) c = PUFF;
      }
      const cov = kit.clamp(1.6 - d) * a;
      const p = 3 * (py * W + px);
      img[p] += (c[0] - img[p]) * cov; img[p + 1] += (c[1] - img[p + 1]) * cov; img[p + 2] += (c[2] - img[p + 2]) * cov;
    }
  }
  return [x + face * 4.6 * sx, y + (0.6 + 0.09 * 21) * sy];
}
