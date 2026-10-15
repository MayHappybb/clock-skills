// The stone frog of the middle landing: a jade inlay in the block's face,
// bold and simple (outlined head, two big white-rimmed round glasses, a
// smile). Its eyes follow the slinky and it blinks. Drawn by coverage.
import * as kit from '../js/kit.js';

const JADE = kit.hex('#2a9c50'), JADE_D = kit.hex('#0e5a2a'), RIM = kit.hex('#c8c6bc'), BLUSH = kit.hex('#ff7a8a');
const EYES = [[13, 37], [31, 37]], ER = 6.4;
const len = (x, y) => Math.sqrt(x * x + y * y);
// signed distances (px), local to the block face
const head = (x, y) => Math.min((len((x - 22) / 18.5, (y - 48.5) / 11.5) - 1) * 12, len(x - 13, y - 37) - 8, len(x - 31, y - 37) - 8);
const smile = (x, y) => { const d = len(x - 22, y - 45.5) - 9; return y < 48 ? 9 : Math.abs(d) - 0.75; };

/** Paint the frog at panel offset (ox, oy) into img (W wide). */
export function paintFrog(img, W, ox, oy) {
  for (let y = 26; y < 62; y++) for (let x = 2; x < 42; x++) {
    let hc = 0, moat = 0, rim = 0, eye = 0, sm = 0, bl = 0;
    for (let s = 0; s < 9; s++) {
      const px = x + ((s % 3) + 0.5) / 3, py = y + (Math.floor(s / 3) + 0.5) / 3;
      const h = head(px, py);
      if (h < 0) hc++;
      if (h < 1.2) moat++;
      let de = Infinity;
      for (const [ex, ey] of EYES) de = Math.min(de, len(px - ex, py - ey));
      if (Math.abs(de - ER) < 0.8 || (py > 36.2 && py < 37.8 && px > 19 && px < 25)) rim++;
      else if (de < ER - 0.8) eye++;
      if (smile(px, py) < 0) sm++;
      if (len(px - 8, py - 49) < 2.2 || len(px - 36, py - 49) < 2.2) bl++;
    }
    const p = 3 * ((oy + y) * W + ox + x);
    const k = moat / 9;
    if (!k) continue;
    // moat: a dark keyline cut round the inlay
    for (let c = 0; c < 3; c++) img[p + c] *= 1 - k;
    const shade = 0.7 + 0.3 * kit.smoothstep(60, 34, y);
    const body = kit.mix(JADE_D, JADE, shade);
    for (let c = 0; c < 3; c++) {
      let v = body[c] * (hc / 9);
      v = v * (1 - sm / 9) + JADE_D[c] * 0.15 * (sm / 9);
      v = v * (1 - bl / 9) + BLUSH[c] * 0.5 * (bl / 9);
      v = v * (1 - (rim + eye) / 9) + RIM[c] * (rim / 9) + RIM[c] * 0.55 * (eye / 9);
      img[p + c] += v;
    }
  }
}

/**
 * The live parts: pupils looking toward (tx, ty) (global px), and a blink
 * (0 open .. 1 shut). Paints over the frog already in img.
 */
export function frogEyes(img, W, ox, oy, tx, ty, blink) {
  for (const [ex, ey] of EYES) {
    const gx = ox + ex, gy = oy + ey;
    let dx = tx - gx, dy = ty - gy;
    const d = Math.hypot(dx, dy) || 1, m = Math.min(2.6, d / 6);
    const px = gx + (dx / d) * m, py = gy + (dy / d) * m;
    const lid = gy - (ER - 0.8) + 2 * (ER - 0.8) * blink;
    for (let y = gy - 6; y <= gy + 6; y++) for (let x = gx - 6; x <= gx + 6; x++) {
      const de = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      if (de > ER - 0.8) continue;
      const o = 3 * (y * W + x);
      const a = kit.clamp(2.4 - Math.hypot(x + 0.5 - px, y + 0.5 - py)) * (1 - blink);
      for (let c = 0; c < 3; c++) img[o + c] *= 1 - 0.95 * a;
      const lc = kit.clamp(lid - (y + 0.5) + 0.5);
      if (lc > 0) for (let c = 0; c < 3; c++) img[o + c] += (JADE[c] * 0.8 - img[o + c]) * lc;
    }
  }
}
