// Tide: the characters, drawn by coverage straight into the scene raster so
// they glide between pixels. The frog is the owner's: bold flat rainbow
// bands, two big white-rimmed round glasses, a smile. The crab is the
// beach's resident.
import * as kit from '../js/kit.js';

const k = 0.72; // characters are light sources too: keep them below the moon
const BANDS = ['#ff2e2e', '#ff8c1a', '#ffe02a', '#3cd64a', '#2a7cff', '#a24cff'].map((h) => kit.scale(kit.hex(h), k));
const RIM = kit.scale([1, 1, 1], 0.95), LENS = kit.hex('#081028'), GLINT = [1, 1, 1];
const KEY = kit.hex('#0c0814'), MOUTH = kit.hex('#1a0820'), LID = kit.scale(kit.hex('#ff2e2e'), k);
const FOOT = kit.scale(kit.hex('#2aa83a'), k), ARM = kit.scale(kit.hex('#3cd64a'), k * 1.05);

function over(img, p, c, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  const o = 3 * p;
  img[o] += (c[0] - img[o]) * a; img[o + 1] += (c[1] - img[o + 1]) * a; img[o + 2] += (c[2] - img[o + 2]) * a;
}
const cov = (sd) => (sd <= -0.5 ? 1 : sd >= 0.5 ? 0 : 0.5 - sd);
function ellSd(x, y, rx, ry) {
  const q = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2);
  return (q - 1) * Math.min(rx, ry);
}
function segSd(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export const FROG_S = 1.12;

/**
 * Frog with feet centre at (fx, fy) (px). o: { lift, phase, moving, blink, look }.
 * Returns the hand position [x, y] for the stick.
 */
export function drawFrog(img, W, H, fx, fy, o) {
  const S = FROG_S;
  const walk = o.moving ? o.phase : 0;
  const bob = o.moving ? -0.55 * Math.abs(Math.sin(walk * Math.PI)) : 0;
  const by0 = fy - o.lift + bob * S; // body origin (feet line)
  const breathe = 1 + 0.025 * Math.sin(o.t * 2.1);
  const liftL = o.moving ? 1.3 * Math.max(0, Math.sin(walk * Math.PI)) : 0;
  const liftR = o.moving ? 1.3 * Math.max(0, -Math.sin(walk * Math.PI)) : 0;
  const x0 = Math.max(0, Math.floor(fx - 11 * S)), x1 = Math.min(W - 1, Math.ceil(fx + 11 * S));
  const y0 = Math.max(0, Math.floor(by0 - 19.5 * S)), y1 = Math.min(H - 1, Math.ceil(fy + 1.5));
  const hand = [-8.9, -6.6];
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const p = py * W + px;
      const lx = (px - fx) / S, lyF = (py - (fy - o.lift)) / S, ly = (py - by0) / S;
      // feet (they stay on the ground unless hopping)
      let sd = Math.min(ellSd(lx + 4.3, lyF + 0.8 + liftL, 2.7, 1.15), ellSd(lx - 4.3, lyF + 0.8 + liftR, 2.7, 1.15)) * S;
      over(img, p, FOOT, cov(sd));
      // body with a dark keyline
      const bry = 7.1 * breathe;
      sd = ellSd(lx, ly + 7.3, 8.5, bry) * S;
      if (sd < 1.3) {
        over(img, p, KEY, cov(sd - 0.9));
        const a = cov(sd);
        if (a > 0) {
          const top = -7.3 - bry, bh = (2 * bry) / 6;
          const bp = (ly - top) / bh;
          let i = Math.floor(bp); i = i < 0 ? 0 : i > 5 ? 5 : i;
          const f = bp - i, toNext = (1 - f) * bh * S;
          let c = BANDS[i];
          const m = i < 5 ? kit.clamp(0.5 - toNext) : 0;
          if (m > 0) c = kit.mix(c, BANDS[i + 1], m);
          over(img, p, c, a);
        }
      }
      // the arm that holds the stick
      sd = (Math.hypot(lx - hand[0], ly - hand[1]) - 1.6) * S;
      over(img, p, ARM, cov(sd));
      // smile
      const sx = lx, sy = ly + 10.4, sr = Math.hypot(sx, sy);
      if (sy > 0.6) over(img, p, MOUTH, cov((Math.abs(sr - 3.3) - 0.62) * S));
      // glasses
      for (let e = -1; e <= 1; e += 2) {
        const cx = e * 4.75, cy = -14.6, r = Math.hypot(lx - cx, ly - cy);
        if (r > 4.6) continue;
        over(img, p, RIM, cov((r - 3.95) * S));
        const lens = cov((r - 2.75) * S);
        if (lens > 0) {
          const lidY = cy - 2.9 + o.blink * 5.8;
          over(img, p, ly < lidY ? LID : LENS, lens);
          if (ly >= lidY) over(img, p, GLINT, cov((Math.hypot(lx - cx - 0.9 - o.look, ly - cy + 0.9) - 0.95) * S));
        }
      }
      // bridge of the glasses
      if (Math.abs(lx) < 1.3) over(img, p, RIM, cov((Math.abs(ly + 14.9) - 0.5) * S));
    }
  }
  return [fx + hand[0] * S, by0 + hand[1] * S];
}

/** A soft line (the stick), width w, colour c. */
export function drawLine(img, W, H, ax, ay, bx, by, w, c, a = 1) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - w - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + w + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - w - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + w + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    over(img, py * W + px, c, a * cov(segSd(px, py, ax, ay, bx, by) - w / 2));
  }
}

const SHELL = kit.scale(kit.hex('#ff5a22'), 0.62), DARK = kit.hex('#2a0c06'), CLAW = kit.scale(kit.hex('#ff8a44'), 0.7), EYE = [0.95, 0.95, 0.9];

/** Crab centred at (cx, cy); legPhase animates the legs while it scuttles. */
export function drawCrab(img, W, H, cx, cy, legPhase, moving) {
  const x0 = Math.max(0, Math.floor(cx - 9)), x1 = Math.min(W - 1, Math.ceil(cx + 9));
  const y0 = Math.max(0, Math.floor(cy - 7)), y1 = Math.min(H - 1, Math.ceil(cy + 4));
  const wig = moving ? Math.sin(legPhase * Math.PI * 2) : 0;
  const pinch = 0.5 + 0.5 * Math.sin(legPhase * 3);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const p = py * W + px, lx = px - cx, ly = py - cy;
    // legs: three a side, splayed, scissoring as it runs
    let sd = 1e9;
    for (let s = -1; s <= 1; s += 2) for (let l = 0; l < 3; l++) {
      const ox = s * (1.4 + l * 1.0), w = (l % 2 ? wig : -wig) * 0.9;
      sd = Math.min(sd, segSd(lx, ly, ox, 0.5, ox + s * 2.2 + w, 2.6));
    }
    over(img, p, SHELL, cov(sd - 0.42));
    // arms up to two big pincers
    sd = Math.min(segSd(lx, ly, 2.4, -0.8, 4.8, -3.4), segSd(lx, ly, -2.4, -0.8, -4.8, -3.4));
    over(img, p, SHELL, cov(sd - 0.5));
    const cl = Math.min(Math.hypot(lx - 5.0, ly + 4.4), Math.hypot(lx + 5.0, ly + 4.4)) - 1.55;
    over(img, p, CLAW, cov(cl));
    // the pincer's notch opens and closes
    const nt = Math.min(segSd(lx, ly, 5.0, -4.4, 5.0, -6.2), segSd(lx, ly, -5.0, -4.4, -5.0, -6.2)) - 0.3 - 0.25 * pinch;
    over(img, p, DARK, cov(nt) * (cl < 0.3 ? 1 : 0));
    // shell
    over(img, p, SHELL, cov(ellSd(lx, ly, 3.5, 2.1)));
    // eyes on stalks
    sd = Math.min(Math.hypot(lx - 1.3, ly + 2.9), Math.hypot(lx + 1.3, ly + 2.9)) - 0.75;
    over(img, p, EYE, cov(sd));
    sd = Math.min(Math.hypot(lx - 1.3, ly + 2.9), Math.hypot(lx + 1.3, ly + 2.9)) - 0.32;
    over(img, p, DARK, cov(sd));
  }
}
