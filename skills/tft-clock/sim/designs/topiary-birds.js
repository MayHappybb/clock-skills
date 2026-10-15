// Birds for topiary.js: a robin that hops between the topiaries' crowns, and
// the white doves let loose from behind the balustrade at the hour.

import { sin, cos, clamp, lerp, rand, ease } from '../js/kit.js';

const AA = { aa: true };
const BROWN = 0x7a5a3a, BROWN_D = 0x4a3422, BREAST = 0xe8602a, BELLY = 0xf0e0c8, BEAK = 0x2a2018;

/**
 * A robin at (x, y) = its feet, facing `dir`. fly: wing phase (radians) when
 * flying, or null perched; bob 0..1 (a tail flick / hop crouch).
 */
export function robin(g, x, y, dir, fly, bob, tone, k = 1) {
  const by = y - 3.0 * k - (fly === null ? 0 : 0.5 * k), bx = x;
  if (fly === null) {
    g.thickLine(bx - 0.3 * dir * k, by + 1.4 * k, bx - 0.4 * dir * k, y - 0.1, 0.55 * k, tone(BEAK), AA);
    g.thickLine(bx + 0.7 * dir * k, by + 1.4 * k, bx + 0.7 * dir * k, y - 0.1, 0.55 * k, tone(BEAK), AA);
  }
  // tail, cocked up behind
  const tail = 1.2 + 0.9 * bob;
  g.thickLine(bx - dir * 1.8 * k, by + 0.2 * k, bx - dir * 4.2 * k, by - tail * k, 1.3 * k, tone(BROWN_D), AA);
  g.fillEllipse(bx, by, 2.7 * k, 2.1 * k, tone(BROWN), AA);
  g.fillEllipse(bx + dir * 0.9 * k, by + 0.7 * k, 1.6 * k, 1.4 * k, tone(BELLY), AA);
  g.fillCircle(bx + dir * 1.5 * k, by - 1.5 * k + bob * 0.3 * k, 1.75 * k, tone(BROWN), AA);   // head
  g.fillEllipse(bx + dir * 1.7 * k, by - 0.1 * k, 1.5 * k, 1.5 * k, tone(BREAST), AA);           // red breast
  const hx = bx + dir * 1.5 * k, hy = by - 1.5 * k + bob * 0.3 * k;
  g.fillPolygon([[hx + dir * 1.4 * k, hy - 0.5 * k], [hx + dir * 2.9 * k, hy + 0.1 * k], [hx + dir * 1.4 * k, hy + 0.6 * k]], tone(BEAK), AA);
  g.fillCircle(hx + dir * 0.6 * k, hy - 0.5 * k, 0.5 * k, tone(0x101010), AA);
  if (fly !== null) {
    const up = sin(fly);
    g.fillPolygon([[bx - dir * 1.2 * k, by - 0.5 * k], [bx + dir * 1.0 * k, by - 0.5 * k], [bx - dir * 0.8 * k, by - (0.6 + 3.6 * up) * k]], tone(BROWN_D), AA);
  } else {
    g.fillEllipse(bx - dir * 0.6 * k, by - 0.1 * k, 1.8 * k, 1.2 * k, tone(BROWN_D), AA);       // folded wing
  }
}

/** A white dove in flight, facing `dir`, wings at phase `ph`. */
export function dove(g, x, y, dir, ph, tone, k = 1) {
  const up = sin(ph), white = tone(0xf6f4ee), grey = tone(0xc8ccd4);
  g.fillEllipse(x, y, 2.3 * k, 1.1 * k, white, AA);
  g.fillCircle(x + dir * 2.1 * k, y - 0.6 * k, 0.95 * k, white, AA);
  g.thickLine(x - dir * 1.8 * k, y, x - dir * 3.4 * k, y - 0.4 * k, 1.2 * k, grey, AA);
  const tx = x - dir * 0.3 * k, ty = y - up * 3.6 * k;
  g.fillPolygon([[x - dir * 1.2 * k, y - 0.3 * k], [x + dir * 1.1 * k, y - 0.3 * k], [tx + dir * 0.5 * k, ty], [tx - dir * 1.6 * k, ty + 0.4 * k]], up > 0 ? white : grey, AA);
}

/** The hour's doves: n of them rise from behind the balustrade, wheel and leave. τ: seconds from the hour. */
export function doves(g, τ, seed, tone) {
  if (τ < -0.5 || τ > 9) return;
  for (let i = 0; i < 7; i++) {
    const t0 = i * 0.18 - 0.4, u = (τ - t0) / 8.2;
    if (u <= 0 || u >= 1) continue;
    const side = i & 1 ? 1 : -1, r = rand(seed, i, 3);
    const x0 = 80 + side * (6 + 10 * r), e = ease.inOutQuad(u);
    // up out of the trees, a wide turn over the fountain, and away off the side
    const x = x0 + side * (e * 120 + 14 * sin(u * 5 + r * 3)), y = 38 - 34 * sin(Math.min(1, u * 1.6) * 1.5) + 10 * u * u - 3 * r;
    const vx = side;
    dove(g, x, y, vx, τ * (16 + 4 * r) + i, tone, 0.95 + 0.25 * r);
  }
}
