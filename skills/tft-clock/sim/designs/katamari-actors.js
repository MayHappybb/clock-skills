// The cast of katamari.js: the katamari, the little prince who pushes it,
// and the King of All Cosmos with his rainbow. All anti-aliased kit shapes,
// so everything glides by fractions of a pixel.

import { hex, mix, sin, cos } from '../js/kit.js';
import { drawObj, OUT, ELONGATED } from './katamari-objects.js';
import { rotate, SIN_E, COS_E, COAT } from './katamari-plan.js';

const AA = { aa: true };

// ------------------------------------------------------------ the katamari

const CORE = hex('ff5fae'), CORE_D = hex('c8337f'), CORE_L = hex('ff9fd0'), NUB = hex('ffb3dc');
// knobs on the bare core (a Fibonacci sphere): they show the roll before anything sticks
const NUBS = [];
for (let i = 0; i < 16; i++) {
  const y = 1 - (2 * (i + 0.5)) / 16, r = Math.sqrt(1 - y * y), a = i * 2.39996;
  NUBS.push([r * Math.cos(a), y, r * Math.sin(a)]);
}

const FRONT = [], BACK = [];
/**
 * The katamari centred on screen at (cx, cy), radius R, orientation q
 * (w, x, y, z), with `stuck` = [{ o, u: [x, y, z] (ball frame), p: 0..1 how
 * far it pokes out }]. `kObj` scales the stuck things relative to the floor.
 */
export function drawBall(g, cx, cy, R, q, stuck, kObj = 0.72) {
  const [w, x, y, z] = q;
  FRONT.length = 0; BACK.length = 0;
  for (const s of stuck) {
    const n = rotate(w, x, y, z, s.u[0], s.u[1], s.u[2]);
    const sx = n[0], sy = n[2] * SIN_E - n[1] * COS_E, depth = n[1] * COS_E + n[2] * SIN_E;
    const it = { s, sx, sy, depth };
    (depth < 0 ? BACK : FRONT).push(it);
  }
  BACK.sort((a, b) => a.depth - b.depth);
  FRONT.sort((a, b) => a.depth - b.depth);
  for (const it of BACK) stuckThing(g, cx, cy, R, it, kObj);
  // the core: keyline, shade, body, knobs, shine
  g.fillCircle(cx, cy, R + 0.9, OUT, AA);
  g.fillCircle(cx, cy, R, CORE_D, AA);
  g.fillCircle(cx - R * 0.16, cy - R * 0.18, R * 0.8, CORE, AA);
  for (const v of NUBS) {
    const n = rotate(w, x, y, z, v[0], v[1], v[2]);
    const depth = n[1] * COS_E + n[2] * SIN_E;
    if (depth < 0.25) continue;
    const sx = n[0], sy = n[2] * SIN_E - n[1] * COS_E;
    const lit = (-sx - sy) * 0.5 + 0.5;
    g.fillCircle(cx + sx * R * 0.86, cy + sy * R * 0.86, R * 0.15 * (0.5 + 0.5 * depth) + 0.35, lit > 0.45 ? NUB : CORE_L, AA);
  }
  g.fillEllipse(cx - R * 0.42, cy - R * 0.45, R * 0.22 + 0.4, R * 0.14 + 0.3, 0xffffff, { aa: true, a: 0.8 });
  for (const it of FRONT) stuckThing(g, cx, cy, R, it, kObj);
}

function stuckThing(g, cx, cy, R, it, kObj) {
  const { s, sx, sy } = it, o = s.o, p = s.p;
  if (p <= 0.02) return;
  const pl = Math.sqrt(sx * sx + sy * sy) + 1e-6;
  const ax = sx / pl, ay = sy / pl;
  if (ELONGATED[o.type]) {
    // a pencil poking out: from inside the ball along its normal
    const len = Math.min(o.len * kObj, R * 0.3 + COAT - 1.8) * p;
    const vis = Math.max(o.wid * kObj * 0.9, len * pl);
    const bx = cx + sx * R * 0.7, by = cy + sy * R * 0.7;
    drawObj(g, o, bx + ax * vis * 0.5, by + ay * vis * 0.5, pl > 0.15 ? ax : 1, pl > 0.15 ? ay : 0, kObj, 0, false, vis / (o.len * kObj));
  } else {
    const k = kObj * (0.55 + 0.45 * p), lift = o.wid * k * 0.3 * p;
    drawObj(g, o, cx + sx * (R + lift), cy + sy * (R + lift), -ay, ax, k, 0, k > 0.5);
  }
}

// ------------------------------------------------------------ the prince

const LIME = hex('9be84c'), LIME_D = hex('5fb02e'), SUIT = hex('2fb38a'), SUIT_D = hex('1f7f68'), KNOB = hex('ff4f9a'), FACE = hex('fff1d6');

/**
 * The prince standing with his feet at (x, y), facing f (+1 right, -1 left),
 * walking phase `ph` (radians; legs swing), `push` 0..1 arms reaching out,
 * `look` -1..1 head tilt up (looking at the sky), `hop` px off the ground.
 */
export function drawPrince(g, x, y, f, ph, push, look = 0, hop = 0) {
  const gy = y - hop;
  g.fillEllipse(x, y + 0.5, 5.2, 1.6, OUT, { aa: true, a: 0.28 });
  const sw = sin(ph) * 1.8, sw2 = -sw;
  // legs
  g.thickLine(x - 1.3, gy - 4, x - 1.3 + sw, gy - 0.6, 2.6, OUT, AA);
  g.thickLine(x + 1.3, gy - 4, x + 1.3 + sw2, gy - 0.6, 2.6, OUT, AA);
  g.thickLine(x - 1.3, gy - 4, x - 1.3 + sw, gy - 0.9, 1.4, SUIT_D, AA);
  g.thickLine(x + 1.3, gy - 4, x + 1.3 + sw2, gy - 0.9, 1.4, SUIT_D, AA);
  // body
  g.fillEllipse(x, gy - 6.2, 3.6, 3.4, OUT, AA);
  g.fillEllipse(x, gy - 6.2, 2.7, 2.5, SUIT, AA);
  // arms toward the ball
  const hx = x + f * (2.5 + 3 * push), hy = gy - 6.5 - 0.5 * push;
  g.thickLine(x + f * 1.5, gy - 7, hx, hy, 2.4, OUT, AA);
  g.thickLine(x + f * 1.5, gy - 7, hx, hy, 1.2, SUIT, AA);
  g.fillCircle(hx, hy, 1.1, FACE, AA);
  // the head: a wide capsule, lime, with the face to the side he faces
  const hcx = x + f * 0.6, hcy = gy - 12.2 - look * 0.4;
  g.fillRoundRect(hcx - 7.6, hcy - 3.9, 15.2, 7.8, 3.9, OUT, AA);
  g.fillRoundRect(hcx - 6.7, hcy - 3, 13.4, 6, 3, LIME, AA);
  g.fillRoundRect(hcx - 6.7, hcy + 0.6, 13.4, 2.4, 1.2, LIME_D, AA);
  const fx = hcx + f * 1.5;
  g.fillRoundRect(fx - 2.6, hcy - 2.2 - look * 0.6, 5.2, 4.2, 1.8, FACE, AA);
  g.fillRect(Math.round(fx - 1.6 + f * 0.4), Math.round(hcy - 1.4 - look * 0.8), 1, 2, OUT);
  g.fillRect(Math.round(fx + 0.8 + f * 0.4), Math.round(hcy - 1.4 - look * 0.8), 1, 2, OUT);
  // the antenna, springy
  const tipx = hcx + sin(ph * 0.5) * 0.6 * (push > 0 ? 1 : 0.3) - look * f * 0.5, tipy = hcy - 8.2;
  g.thickLine(hcx, hcy - 3.6, tipx, tipy + 1, 1.3, OUT, AA);
  g.thickLine(hcx, hcy - 3.6, tipx, tipy + 1, 0.6, LIME_D, AA);
  g.fillCircle(tipx, tipy, 1.9, OUT, AA);
  g.fillCircle(tipx, tipy, 1.15, KNOB, AA);
}

// ------------------------------------------------------------ the King of All Cosmos

const SKIN = hex('ffdcb4'), SKIN_D = hex('f0b088'), CROWN = hex('ffd23a'), CROWN_D = hex('d89a18');
const RUFF = hex('fff4fb'), CAPE = hex('7a4cff'), JEWEL_R = hex('ff3a6a'), JEWEL_B = hex('3ac8ff'), BEARD = hex('ffffff');
export const RAINBOW = ['ff4a6a', 'ff9a3a', 'ffe14a', '5ee08a', '4ab8ff', '9a6aff'].map(hex);

/**
 * The King's head and shoulders, centred at (x, y) (the middle of his face),
 * at scale k. `blink` 0..1, `grin` 0..1, `hand` [hx, hy] or null: his gloved
 * hand, held out (where the rainbow starts).
 */
export function drawKing(g, x, y, k, grin, hand) {
  const K = (v) => v * k;
  // the ruff: a ring of white scallops
  for (let i = -2; i <= 2; i++) g.fillCircle(x + K(i * 4.4), y + K(12.5 + Math.abs(i) * 0.4), K(3.4), OUT, AA);
  for (let i = -2; i <= 2; i++) g.fillCircle(x + K(i * 4.4), y + K(12.5 + Math.abs(i) * 0.4), K(2.6), RUFF, AA);
  // the long face
  g.fillEllipse(x, y, K(9.6), K(12.4), OUT, AA);
  g.fillEllipse(x, y, K(8.7), K(11.5), SKIN, AA);
  g.fillEllipse(x + K(2.5), y + K(3), K(5), K(7), SKIN_D, { aa: true, a: 0.5 });
  for (const sd of [-1, 1]) g.fillEllipse(x + K(sd * 5.6), y + K(2.4), K(2.6), K(1.8), hex('ff8aa0'), { aa: true, a: 0.75 });
  // eyes: two smug closed arcs and big brows
  for (const sd of [-1, 1]) {
    // brows, raised; eyes closed in two happy arches
    g.thickLine(x + K(sd * 2.0), y - K(4.6), x + K(sd * 6.4), y - K(5.6), K(1.5), OUT, AA);
    g.stroke([[x + K(sd * 2.3), y - K(0.6)], [x + K(sd * 4), y - K(2.2)], [x + K(sd * 5.7), y - K(0.6)]], K(1.2), OUT, AA);
  }
  g.fillEllipse(x, y + K(2.4), K(1.8), K(2.6), SKIN_D, AA);
  // a wide, pleased smile; it opens when he throws
  if (grin > 0.5) {
    g.fillEllipse(x, y + K(8.6), K(3), K(2.2), OUT, AA);
    g.fillEllipse(x, y + K(9.6), K(1.9), K(1), hex('ff6a8a'), AA);
  } else g.stroke([[x - K(3.4), y + K(7.8)], [x, y + K(9.4)], [x + K(3.4), y + K(7.8)]], K(1.2), OUT, AA);
  // the curling white moustache, over the mouth
  for (const sd of [-1, 1]) {
    g.fillEllipse(x + K(sd * 3.3), y + K(5.6), K(3.6), K(1.7), OUT, AA);
    g.fillEllipse(x + K(sd * 3.3), y + K(5.5), K(3), K(1.1), BEARD, AA);
    g.fillCircle(x + K(sd * 6.6), y + K(4.6), K(1.3), OUT, AA);
    g.fillCircle(x + K(sd * 6.6), y + K(4.6), K(0.7), BEARD, AA);
  }
  // the crown: tall, gold, three points with jewels
  const cy = y - K(10.5);
  const pts = [[x - K(8.6), cy + K(2)], [x - K(9.6), cy - K(8)], [x - K(4.4), cy - K(3)], [x, cy - K(10.5)],
    [x + K(4.4), cy - K(3)], [x + K(9.6), cy - K(8)], [x + K(8.6), cy + K(2)]];
  g.fillPolygon(pts.map(([px, py]) => [px + (px - x) * 0.1, py + (py < cy ? -K(1) : K(1))]), OUT, AA);
  g.fillPolygon(pts, CROWN, AA);
  g.fillRect(Math.round(x - K(8.6)), Math.round(cy - K(0.4)), Math.round(K(17.2)), Math.max(1, Math.round(K(2))), CROWN_D);
  g.fillCircle(x, cy - K(1), K(1.7), JEWEL_R, AA);
  g.fillCircle(x - K(5.2), cy - K(0.6), K(1.2), JEWEL_B, AA);
  g.fillCircle(x + K(5.2), cy - K(0.6), K(1.2), JEWEL_B, AA);
  for (const [px, py] of [pts[1], pts[3], pts[5]]) g.fillCircle(px, py, K(1.4), JEWEL_R, AA);
  if (hand) {
    g.fillCircle(hand[0], hand[1], K(3.4), OUT, AA);
    g.fillCircle(hand[0], hand[1], K(2.6), 0xffffff, AA);
  }
}

/**
 * A rainbow from a to b, bulging up by `bow` px, drawn from fraction u0 to u1
 * of its length (it grows out of the King's hand and is reeled back in).
 */
export function drawRainbow(g, ax, ay, bx, by, bow, u0, u1, width = 1.4, alpha = 1) {
  if (u1 - u0 < 0.01) return;
  const n = 10, mx = (ax + bx) / 2, my = Math.min(ay, by) - bow;
  for (let band = 0; band < RAINBOW.length; band++) {
    const off = (band - (RAINBOW.length - 1) / 2) * width;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = u0 + ((u1 - u0) * i) / n, it = 1 - t;
      const x = it * it * ax + 2 * it * t * mx + t * t * bx, y = it * it * ay + 2 * it * t * my + t * t * by;
      // the normal of the curve, for the band offset
      const dx = 2 * it * (mx - ax) + 2 * t * (bx - mx), dy = 2 * it * (my - ay) + 2 * t * (by - my);
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      pts.push([x - (dy / l) * off, y + (dx / l) * off]);
    }
    g.stroke(pts, width + 0.35, RAINBOW[band], { aa: true, a: alpha });
  }
}

/** A point on the rainbow's centre line at fraction t. */
export function rainbowAt(ax, ay, bx, by, bow, t, out) {
  const mx = (ax + bx) / 2, my = Math.min(ay, by) - bow, it = 1 - t;
  out[0] = it * it * ax + 2 * it * t * mx + t * t * bx;
  out[1] = it * it * ay + 2 * it * t * my + t * t * by;
  return out;
}

/** A five-pointed star with a soft glow, radius r, turned by `rot`. */
export function drawStar(g, x, y, r, rot, glow = 1) {
  if (r < 0.3) return;
  if (glow > 0) {
    g.fillCircle(x, y, r * 2.2, hex('fff3a0'), { aa: true, a: 0.18 * glow });
    g.fillCircle(x, y, r * 1.5, hex('fff3a0'), { aa: true, a: 0.25 * glow });
  }
  const pts = [], pin = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push([x + rr * sin(a), y - rr * cos(a)]);
    const r2 = rr + 0.9;
    pin.push([x + r2 * sin(a), y - r2 * cos(a)]);
  }
  g.fillPolygon(pin, OUT, AA);
  g.fillPolygon(pts, hex('ffe14a'), AA);
  g.fillCircle(x - r * 0.15, y - r * 0.15, r * 0.25, 0xffffff, { aa: true, a: 0.8 });
}

/** A four-ray twinkle. */
export function twinkle(g, x, y, r, c = 0xffffff, a = 1) {
  if (r < 0.4 || a <= 0) return;
  g.fillPolygon([[x - r, y], [x, y - r * 0.22], [x + r, y], [x, y + r * 0.22]], c, { aa: true, a });
  g.fillPolygon([[x, y - r], [x + r * 0.22, y], [x, y + r], [x - r * 0.22, y]], c, { aa: true, a });
}

export { mix };
