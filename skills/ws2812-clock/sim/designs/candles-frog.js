// The owner's frog for the Birthday face: bold and simple, about 26 px wide.
// An outlined head and body in flat rainbow bands, two big white-rimmed round
// glasses, a smile that becomes a puckered "o" with a puffed cheek when it
// blows, and for the hour a party hat and a party blower that unrolls.
import { W, H } from './candles-scene.js';

const BANDS = [
  [0.62, 0.05, 0.05], [0.7, 0.22, 0.02], [0.66, 0.5, 0.03],
  [0.12, 0.5, 0.06], [0.04, 0.2, 0.62], [0.3, 0.06, 0.5],
];
const OUT = [0.012, 0.008, 0.01], WHITE = [0.85, 0.85, 0.8], EYE = [0.55, 0.55, 0.5], PUPIL = [0.005, 0.005, 0.01];
const BLUSH = [0.85, 0.25, 0.3];

function ell(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx, dy = (py - cy) / ry;
  return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry);
}
function put(img, o, c, a, k) {
  img[o] += (c[0] * k - img[o]) * a; img[o + 1] += (c[1] * k - img[o + 1]) * a; img[o + 2] += (c[2] * k - img[o + 2]) * a;
}

/**
 * Frog with its head centred at (cx, cy), facing -side (side +1: it stands
 * at the right and looks left). puff 0..1 cheeks, blow 0..1 mouth, hat 0..1,
 * k brightness.
 */
export function drawFrog(img, cx, cy, side, puff, blow, hat, k) {
  const f = -side;                                     // facing direction in x
  const x0 = Math.max(0, Math.floor(cx - 22)), x1 = Math.min(W - 1, Math.ceil(cx + 22));
  const y0 = Math.max(0, Math.floor(cy - 32)), y1 = Math.min(H - 1, Math.ceil(cy + 30));
  const exA = cx + f * 1.5 - 6.4, exB = cx + f * 1.5 + 6.4, ey = cy - 8.5;
  const chx = cx + f * 11, chy = cy + 3, chr = 1.5 + 5.5 * puff;
  const mx = cx + f * (14.2 + 2.6 * puff), my = cy + 3.6;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const px = xx + 0.5, py = yy + 0.5;
    const dH = ell(px, py, cx, cy, 15, 9.5);
    const dB0 = ell(px, py, cx - f * 1.5, cy + 12, 11.5, 9.5);
    const dFt = Math.min(ell(px, py, cx + f * 5.5, cy + 20.5, 4.2, 2.4), ell(px, py, cx - f * 6.5, cy + 20.5, 4.2, 2.4));
    const dB = Math.min(dH, dB0, dFt);
    const dA = Math.hypot(px - exA, py - ey) - 5.6, dE = Math.hypot(px - exB, py - ey) - 5.6;
    const dC = puff > 0.02 ? Math.hypot(px - chx, py - chy) - chr : 9;
    let D = Math.min(dB, dA, dE, dC);
    // party hat: a cone between the eyes
    let dHat = 9;
    if (hat > 0.01) {
      const hb = cy - 13.5, ht = hb - 13 * hat, hx = cx + f * 1.5;
      if (py > ht && py < hb) { const half = 4.6 * (py - ht) / (hb - ht); dHat = Math.abs(px - (hx + f * 0.35 * (hb - py))) - half; }
      const pom = Math.hypot(px - (hx + f * 0.35 * (hb - ht)), py - ht) - 2.0 * hat;
      if (pom < dHat) dHat = pom - 0.001;
    }
    if (D > 0.6 && dHat > 0.6) continue;
    const o = 3 * (yy * W + xx);
    if (dHat < D && dHat <= 0.6) {
      const a = dHat < -0.6 ? 1 : 0.5 - dHat / 1.2;
      const stripe = Math.floor((py + f * px * 0.6) / 2.6) & 1;
      const pomIn = Math.hypot(px - (cx + f * 1.5 + f * 0.35 * 13 * hat), py - (cy - 13.5 - 13 * hat)) < 2.0 * hat;
      put(img, o, pomIn ? WHITE : stripe ? [0.75, 0.12, 0.4] : [0.1, 0.45, 0.7], a, k);
      continue;
    }
    const cov = D < -0.5 ? 1 : 0.5 - D;
    let col;
    const eyeD = Math.min(dA, dE);
    if (eyeD < 0.5 && eyeD <= dH) {
      // glasses: white rim, pale eye, pupil looking ahead
      const ecx = dA < dE ? exA : exB;
      if (eyeD > -1.6) col = WHITE;
      else {
        const pd = Math.hypot(px - (ecx + f * 1.3), py - (ey + 0.6)) - 1.9;
        col = pd < 0 ? PUPIL : EYE;
        if (Math.hypot(px - (ecx - f * 1.2), py - (ey - 1.6)) < 0.9) col = WHITE;
      }
      if (eyeD > -0.1 && dH > 0) col = OUT;
      put(img, o, col, cov, k);
      continue;
    }
    if (D > -0.9) { put(img, o, OUT, cov, k); continue; }
    // the chin: the head's outline where it overhangs the body, and the feet's tops
    if ((dH > -0.9 && dH < 0.2 && py > cy) || (dFt > -0.9 && dFt < 0.2 && dB0 < 0)) { put(img, o, OUT, cov, k); continue; }
    const band = Math.max(0, Math.min(5, Math.floor((py - (cy - 9)) / 5.0)));
    col = BANDS[band];
    if (dC < 0 && dC < dH + 0.5) col = [col[0] * 0.5 + BLUSH[0] * 0.5, col[1] * 0.5 + BLUSH[1] * 0.5, col[2] * 0.5 + BLUSH[2] * 0.5];
    if (dC > -0.9 && dC < 0 && dH > -1) col = OUT;      // the cheek's own outline outside the head
    // smile (fades into a puckered o)
    const sm = Math.hypot(px - (cx + f * 3.5), py - (cy - 4)) - 9.2;
    if (blow < 0.6 && Math.abs(sm) < 0.8 && py > cy + 1 && dH < -1.2) col = OUT;
    if (blow > 0.05) { const md = Math.hypot(px - mx, py - my); if (md < 0.8 + 1.3 * blow) col = md < 0.6 + 0.9 * blow ? [0.05, 0.0, 0.01] : OUT; }
    put(img, o, col, cov, k);
  }
}

/** A party blower from the frog's mouth: unroll 0..1. */
export function drawBlower(img, cx, cy, side, unroll, k, dot) {
  const f = -side, L = 3 + 17 * unroll;
  let x = cx + f * 13.4, y = cy + 4.2, a = 0;
  const curl = 1 - unroll;
  for (let s = 0; s < L; s += 0.6) {
    a += curl * 0.06 * (s / 2.2);
    x += f * Math.cos(a) * 0.6; y -= Math.sin(a) * 0.6;
    const stripe = Math.floor(s / 2.2) & 1;
    const c = stripe ? [0.8, 0.6, 0.05] : [0.75, 0.08, 0.2];
    dot(img, x, y, 1.6, c[0] * k * 0.6, c[1] * k * 0.6, c[2] * k * 0.6);
  }
  if (unroll > 0.85) for (let j = -1; j <= 1; j++) dot(img, x + f * 1.2, y + j * 1.4, 1.2, 0.5 * k, 0.5 * k, 0.1 * k);
}
