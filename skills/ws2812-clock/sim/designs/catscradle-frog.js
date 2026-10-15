// Cat's cradle: the player. The owner's frog sits at the foot of the panel in
// its round glasses, arms up, playing the figure on its two green hands.
import * as kit from '../js/kit.js';
import { W, capsule, disc, ring, ellipse } from './catscradle-draw.js';

const BLACK = [0, 0, 0];
const SKIN = kit.hex('#34c24c'), SKIN_DK = kit.hex('#1f8a36'), PAD = kit.hex('#a6f07a');
const BANDS = ['#ff3b30', '#ff8c1a', '#ffd21a', '#3fcf4f', '#2f86ff', '#9b55ff'].map(kit.hex);
const RIM = kit.hex('#ffffff'), EYE = kit.hex('#fff2c8'), TONGUE = kit.hex('#ff5a2a');
const FROG_A = 0.3;

/** Left hand at rest; the right is its mirror image (x -> 127 - x). */
const LEFT = {
  sh: [42, 112], el: [6, 88], palm: [9, 42],
  tips: [[21, 20], [23.5, 33], [23.5, 51], [21, 65.5]],
};

/**
 * The hand's joints for this frame. spread pulls the hand outwards (the
 * figure goes taut), dy is breathing, curl folds the two idle fingers.
 */
export function handGeom(side, spread, dy, curl) {
  const m = (x) => (side < 0 ? x : W - 1 - x);
  const g = {
    sh: [m(LEFT.sh[0]), LEFT.sh[1]],
    el: [m(LEFT.el[0] - 0.3 * spread), LEFT.el[1] + 0.3 * dy],
    palm: [m(LEFT.palm[0] - 0.8 * spread), LEFT.palm[1] + dy],
    tips: LEFT.tips.map(([x, y], k) => {
      const c = k === 1 || k === 2 ? curl : 0;
      return [m(x - spread - 6 * c), y + dy + (k === 1 ? 5 : -5) * c];
    }),
  };
  return g;
}

/** Arm, palm, four fingers with round pads: keyline first, then the fill. */
export function drawHand(img, g) {
  const { sh, el, palm, tips } = g;
  capsule(img, sh[0], sh[1], el[0], el[1], 5.6, BLACK);
  capsule(img, el[0], el[1], palm[0], palm[1], 5.0, BLACK);
  disc(img, palm[0], palm[1], 8.2, BLACK);
  for (const t of tips) { capsule(img, palm[0], palm[1], t[0], t[1], 3.3, BLACK); disc(img, t[0], t[1], 4.6, BLACK); }
  capsule(img, sh[0], sh[1], el[0], el[1], 4.2, SKIN_DK, FROG_A * 0.8, 0.55);
  capsule(img, el[0], el[1], palm[0], palm[1], 3.8, SKIN, FROG_A, 0.55);
  disc(img, palm[0], palm[1], 7, SKIN, FROG_A, 0.45);
  for (const t of tips) capsule(img, palm[0], palm[1], t[0], t[1], 2.2, SKIN, FROG_A, 0.45);
  for (const t of tips) disc(img, t[0], t[1], 3.5, PAD, FROG_A * 1.1, 0.45);
}

const EYES = [[51.5, 98.5], [76.5, 98.5]];
/**
 * The frog's head: rainbow bands, big white-rimmed round glasses whose
 * pupils follow (lx, ly), a blink, a smile that opens for the tongue.
 * wide (0..1) is delight: bigger pupils, a bigger grin.
 */
export function drawFrog(img, lx, ly, blink, mouth, wide) {
  ellipse(img, 64, 115, 28.5, 18, [BLACK], 0, 1);
  for (const [x, y] of EYES) disc(img, x, y, 10, BLACK);
  ellipse(img, 64, 115, 27.3, 16.8, BANDS, 92, 6, FROG_A, 0.25);
  for (const [x, y] of EYES) ellipse(img, x, y, 8.8, 8.8, BANDS, 92, 6, FROG_A, 0.15);
  // glasses
  capsule(img, EYES[0][0] + 7.2, 98.5, EYES[1][0] - 7.2, 98.5, 0.8, RIM, 0.55);
  for (const [x, y] of EYES) {
    ellipse(img, x, y, 6, 6 * (1 - blink) + 0.01, [EYE], 0, 1, 0.42);
    if (blink < 0.6) {
      let dx = lx - x, dy = ly - y;
      const l = Math.hypot(dx, dy) || 1, r = Math.min(2.3, l * 0.08);
      dx = (dx / l) * r; dy = (dy / l) * r * (1 - blink);
      disc(img, x + dx, y + dy, 2.5 + 0.7 * wide, BLACK);
      disc(img, x + dx - 0.9, y + dy - 1, 0.5, RIM, 0.35);
    }
    ring(img, x, y, 7, 1.6, RIM, 0.6);
  }
  // smile: a dark line on the skin, opening into a mouth when the tongue goes
  const sm = 2.6 + 1.2 * wide;
  for (let k = 0; k < 8; k++) {
    const u0 = k / 8, u1 = (k + 1) / 8;
    const x0 = 47 + 34 * u0, x1 = 47 + 34 * u1;
    const y0 = 115 + sm * 4 * u0 * (1 - u0), y1 = 115 + sm * 4 * u1 * (1 - u1);
    capsule(img, x0, y0, x1, y1, 0.75, BLACK);
  }
  if (mouth > 0.01) ellipse(img, 64, 118 + 0.5 * mouth, 4 * mouth + 0.5, 2.8 * mouth + 0.3, [BLACK], 0, 1);
}

export const MOUTH = [64, 118];
/** The tongue, from the mouth to (tx, ty), with a sticky round tip. */
export function drawTongue(img, tx, ty) {
  capsule(img, MOUTH[0], MOUTH[1], tx, ty, 2.8, BLACK);
  capsule(img, MOUTH[0], MOUTH[1], tx, ty, 1.8, TONGUE, 0.7, 0.4);
  disc(img, tx, ty, 3, TONGUE, 0.85, 0.35);
}
