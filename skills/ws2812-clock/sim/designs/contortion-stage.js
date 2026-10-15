// Contortion: the little circus stage. Crimson drapes tied back at the
// sides, a swagged valance with a gold fringe, a plank floor in raked
// perspective, footlights, one warm follow-spot from above with dust in its
// beam, and confetti after the hour's act.
import * as kit from '../js/kit.js';
import { W, H, blob } from './contortion-tube.js';

export const FLOOR = 57;
const CRIMSON = kit.hex('#9c0a22'), GOLD = kit.hex('#ffb43a'), WOOD = kit.hex('#8a4f22');
const BEAM = kit.hex('#ffe2b0'), BULB = kit.hex('#ffb060');
const CONF = [kit.hex('#ffc845'), kit.hex('#fff0d8'), kit.hex('#20d0c8'), kit.hex('#ff5a8a')];

/** The follow-spot: axis x at row y, and half-width. */
export function beam(spotX, y) {
  const s = (y + 14) / (FLOOR + 3 + 14);
  return [32 + (spotX - 32) * s, 3 + 19 * s];
}

/** Drape inner edge (left curtain) at row y. */
function drapeEdge(y) {
  if (y < 37) { const u = 1 - y / 37; return 3.4 + 8.4 * u * u; }
  return 3.4 + 4.6 * kit.smoothstep(37, FLOOR, y);
}

/** Paint the stage into img. spotX: where the spot aims; spot: its strength. */
export function drawStage(img, now, spotX, spot, shadows) {
  const sway = 0.35 * Math.sin(now * 0.5);
  for (let y = 0; y < H; y++) {
    const [ax, bw] = beam(spotX, y), e = drapeEdge(y);
    for (let x = 0; x < W; x++) {
      const o = 3 * (y * W + x);
      let r = 0, g = 0, b = 0;
      // haze in the beam
      const bd = Math.abs(x - ax) / bw;
      const inB = bd < 1 ? 1 - kit.smoothstep(0.55, 1, bd) : 0;
      if (y < FLOOR) {
        const h = spot * inB * (0.018 + 0.03 * (y / FLOOR));
        r += BEAM[0] * h; g += BEAM[1] * h; b += BEAM[2] * h;
      } else {
        // raked plank floor, lines converging on a vanishing point above
        const dz = y - FLOOR + 1, u = (x - 32) / (dz + 9) * 5.2;
        const seam = kit.smoothstep(0.82, 1, Math.abs(Math.cos(u * Math.PI)));
        const px = (x - spotX) / 25, py = (y - 60) / 4.4, pool = Math.max(0, 1 - px * px - py * py);
        let lv = (0.05 + 0.03 * dz / 7) * (1 - 0.6 * seam) + spot * pool * (0.42 - 0.25 * seam);
        for (const [sx, sw] of shadows) {
          const qx = (x - sx) / sw, qy = (y - FLOOR - 0.6) / 2.2, q = qx * qx + qy * qy;
          if (q < 1) lv *= 0.35 + 0.65 * q;
        }
        if (y === H - 1) lv *= 0.45;
        r = WOOD[0] * lv; g = WOOD[1] * lv; b = WOOD[2] * lv;
      }
      // drapes, tied back, folds swaying
      const xm = x < 32 ? x : W - 1 - x;
      const cov = kit.clamp(e - xm + 0.5);
      if (cov > 0 && y < FLOOR) {
        const u = xm / e, f = 0.5 + 0.5 * Math.cos((u * 3.2 + sway * (x < 32 ? 1 : -1) * (1 - y / 64)) * kit.TAU);
        let lv = (0.08 + 0.3 * f * f) * (0.55 + 0.45 * (1 - y / FLOOR));
        lv += 0.25 * kit.smoothstep(0.75, 1, u) * f;            // the lit inner edge
        const tie = Math.abs(y - 37) < 1.3 && xm < e + 0.5 ? 1 - Math.abs(y - 37) / 1.3 : 0;
        r += (CRIMSON[0] * lv - r) * cov + GOLD[0] * 0.3 * tie;
        g += (CRIMSON[1] * lv - g) * cov + GOLD[1] * 0.3 * tie;
        b += (CRIMSON[2] * lv - b) * cov + GOLD[2] * 0.3 * tie;
      }
      // swagged valance and gold fringe
      const sw = 1.6 + 1.7 * Math.sin(Math.PI * kit.fract((x + 0.5) / 16));
      if (y < sw + 1) {
        const c2 = kit.clamp(sw - y + 0.5), fold = 0.55 + 0.45 * Math.cos((y - sw * 0.5) * 1.9);
        const lv = 0.14 * fold + 0.04;
        r += (CRIMSON[0] * lv - r) * c2; g += (CRIMSON[1] * lv - g) * c2; b += (CRIMSON[2] * lv - b) * c2;
        const fr = Math.max(0, 1 - Math.abs(y - sw + 0.3) / 0.9) * (0.75 + 0.25 * Math.sin(x * 2.1 + now * 2));
        r += GOLD[0] * 0.32 * fr; g += GOLD[1] * 0.32 * fr; b += GOLD[2] * 0.32 * fr;
      }
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
}

/** Dust motes drifting through the beam. */
export function drawMotes(img, now, spotX, spot) {
  for (let k = 0; k < 11; k++) {
    const per = 9 + 5 * kit.hash(k, 3), ph = kit.fract(now / per + kit.hash(k, 1));
    const y = 6 + 48 * ph, [ax, bw] = beam(spotX, y);
    const x = ax + bw * 0.85 * Math.sin(k * 2.3 + now * (0.2 + 0.1 * kit.hash(k, 2)));
    const tw = 0.5 + 0.5 * Math.sin(now * 3 + k * 1.7);
    const a = spot * 0.07 * tw * Math.sin(Math.PI * ph);
    if (a > 0.004) blobAdd(img, x, y, BEAM, a);
  }
}

function blobAdd(img, x, y, c, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], j) => {
    const X = xi + dx, Y = yi + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= H) return;
    const o = 3 * (Y * W + X);
    img[o] += c[0] * a * w[j]; img[o + 1] += c[1] * a * w[j]; img[o + 2] += c[2] * a * w[j];
  });
}

/** Footlights along the apron; chase (0..1) runs a drum-roll sweep along them. */
export function drawFootlights(img, now, chase) {
  for (let k = 0; k < 8; k++) {
    const x = 4.5 + k * 7.85;
    const run = chase > 0 ? Math.max(0, Math.cos((k / 7 - kit.fract(now * 1.6)) * Math.PI * 2)) ** 6 : 0;
    const a = 0.13 + 0.03 * Math.sin(now * 1.3 + k) + chase * (0.55 * run - 0.05);
    blob(img, x, H - 1, 1.05, 0.62, kit.scale(BULB, Math.min(1, a * 2.5)), 0.95);
  }
}

/** Confetti for the hour's bow: tau = seconds since it was thrown. */
export function drawConfetti(img, tau, seed) {
  if (tau < 0 || tau > 7) return;
  for (let k = 0; k < 64; k++) {
    const h1 = kit.hash(k, seed), h2 = kit.hash(k, seed, 7), t = tau - 0.6 * h2;
    if (t < 0) continue;
    const vy = 7 + 6 * h1, x0 = 6 + 52 * kit.hash(k, seed, 3);
    let y = 3 + vy * t;
    const land = FLOOR + 1 + 4 * kit.hash(k, seed, 5);
    let fade = 1;
    if (y > land) { y = land; fade = Math.max(0, 1 - (tau - (land - 3) / vy) / 2.5); }
    const x = x0 + 2.4 * Math.sin(t * (2.5 + 2 * h2) + k);
    const flip = 0.35 + 0.65 * Math.abs(Math.cos(t * (7 + 5 * h1) + k));
    blob(img, x, y, 0.55 + 0.35 * flip, 0.5, kit.scale(CONF[k % 4], 0.7 * flip), fade);
  }
}
