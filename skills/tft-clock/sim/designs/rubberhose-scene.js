// The sets of "rubberhose", drawn in hard ink lines on film cream: the sky
// (sun with a face by day, the man in the moon and a dithered sky by night,
// puffy clouds), the floor (cobbles, grass, stage boards), two tulips at the
// wings, and centre stage the gramophone that plays the beat.
import { sin, cos } from '../js/kit.js';
import { INK, GROUND, INK_C, GROUND_C, TULIP, NOTE } from './rubberhose-art.js';

const W = 160, H = 80;
export const FLOOR = 73;
export const SETS = ['street', 'farm', 'night'];
export const setFor = (h) => (h >= 20 || h < 6 ? 2 : h % 2 ? 0 : 1);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function face(g, x, y, wink, sleepy) {
  g.fillRect(x - 2, y - 1, 1, sleepy ? 1 : 2, INK_C);
  if (wink) g.fillRect(x + 1, y, 2, 1, INK_C); else g.fillRect(x + 2, y - 1, 1, sleepy ? 1 : 2, INK_C);
  g.fillRect(x - 2, y + 2, 1, 1, INK_C); g.fillRect(x - 1, y + 3, 3, 1, INK_C); g.fillRect(x + 2, y + 2, 1, 1, INK_C);
}

function sun(g, x, y, s, beat, wink) {
  const L = beat < 0.2 ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    const a = s * 0.4 + (i * Math.PI) / 4, c = cos(a), n = sin(a);
    g.line(Math.round(x + 7 * c), Math.round(y + 7 * n), Math.round(x + (9 + L) * c), Math.round(y + (9 + L) * n), INK_C);
  }
  g.fillCircle(x, y, 5.6, INK_C); g.fillCircle(x, y, 4.6, GROUND_C);
  face(g, Math.round(x), Math.round(y), wink, false);
}

function moon(g, x, y, beat, wink) {
  g.fillCircle(x, y, 6.6, INK_C); g.fillCircle(x, y, 5.6, GROUND_C);
  g.pixel(x - 4, y + 1, INK_C); g.pixel(x + 3, y - 4, INK_C); g.pixel(x + 4, y + 2, INK_C);
  face(g, Math.round(x), Math.round(y - (beat < 0.2 ? 1 : 0)), wink, true);
}

function cloud(g, x, y, puff) {
  const C = [[0, 0, 3.6], [4, -2, 4.4 + puff], [8.5, 0, 3.6]];
  for (const [dx, dy, r] of C) g.fillCircle(x + dx, y + dy, r + 1, INK_C);
  g.fillRect(Math.round(x - 3), Math.round(y + 1), 15, 4, INK_C);
  for (const [dx, dy, r] of C) g.fillCircle(x + dx, y + dy, r, GROUND_C);
  g.fillRect(Math.round(x - 2), Math.round(y + 1), 13, 3, GROUND_C);
}

function nightSky(g, wy) {
  const buf = g.buf;
  for (let y = 0; y < 22; y++) {
    const lvl = Math.round(9 - y * 0.45);           // 9/16 ink at the top, none by y 20
    if (lvl <= 0) break;
    for (let x = 0; x < W; x++) if (BAYER[(((y + wy) & 3) << 2) | (x & 3)] < lvl) buf[y * W + x] = INK;
  }
  g.cost.box += W * 20 * 2;
}

function star(g, x, y, tw) {
  g.fillRect(x - 1, y - 1, 3, 3, GROUND_C);
  if (tw) { g.fillRect(x - 2, y, 5, 1, GROUND_C); g.fillRect(x, y - 2, 1, 5, GROUND_C); }
}

function floor(g, set, wy) {
  g.fillRect(0, FLOOR, W, 1, INK_C);
  if (set === 0) {                                    // cobbles
    g.fillRect(0, FLOOR + 3 + wy, W, 1, INK_C);
    for (let x = 0; x < W; x += 9) { g.fillRect(x, FLOOR + 1, 1, 2, INK_C); g.fillRect(x + 4, FLOOR + 4 + wy, 1, 3, INK_C); }
  } else if (set === 1) {                             // grass tufts and dirt
    for (let x = 2; x < W; x += 6) { g.pixel(x, FLOOR - 1, INK_C); g.pixel(x + 2, FLOOR - 1, INK_C); g.pixel(x + 1, FLOOR + 2 + wy, INK_C); }
    for (let x = 4; x < W; x += 11) g.fillRect(x, FLOOR + 4 + wy, 2, 1, INK_C);
  } else {                                            // stage boards
    for (let x = 6; x < W; x += 14) g.fillRect(x, FLOOR + 1, 1, 6, INK_C);
    g.fillRect(0, FLOOR + 5 + wy, W, 1, INK_C);
  }
}

function tulip(g, x, sway) {
  const top = 58;
  for (let y = top + 3; y < FLOOR; y++) {
    const u = (FLOOR - y) / (FLOOR - top);
    g.pixel(Math.round(x + sway * u * u), y, INK_C);
  }
  g.pixel(x - 1, 68, INK_C); g.pixel(x + 1, 67, INK_C);
  g.blit(TULIP, Math.round(x + sway - 2), top);
}

// skylines, one height per column (flash: 3 x 160 bytes)
const SKY = [0, 1, 2].map((set) => {
  const h = new Uint8Array(W);
  if (set === 1) { for (let x = 0; x < W; x++) h[x] = Math.round(17.5 + 1.6 * Math.sin(x / 13 + 1) + 1.1 * Math.sin(x / 5.1)); return h; }
  let x = 0, k = set * 7 + 3;
  while (x < W) {
    const r = (Math.sin(k * 12.9898) * 43758.5453) % 1, q = Math.abs(r);
    const w = 7 + Math.round(q * 8), top = 12 + Math.round(q * 5), gable = q > 0.55;
    for (let i = 0; i < w && x + i < W; i++) {
      const roof = gable ? Math.round(Math.abs(i - (w - 1) / 2) * 0.8) : 0;
      h[x + i] = top + roof;
    }
    if (!gable && w > 9) { h[x + 2] = top - 3; h[x + 3] = top - 3; }   // a chimney
    x += w; k++;
  }
  return h;
});

function skyline(g, set, wy) {
  const h = SKY[set], buf = g.buf;
  for (let x = 0; x < W; x++) {
    const y0 = h[x] + wy, prev = x ? h[x - 1] + wy : y0;
    if (set === 2) {                                     // the night town: solid, with lit windows
      for (let y = y0; y < 19 + wy; y++) buf[y * W + x] = ((x % 5 === 2 || x % 5 === 3) && (y - y0) % 4 === 2 && ((x * 7 + y0) % 3)) ? GROUND : INK;
    } else {
      buf[y0 * W + x] = INK;
      for (let y = Math.min(y0, prev); y < Math.max(y0, prev); y++) buf[y * W + x] = INK;
    }
  }
  g.cost.box += W * 8;
}

function windmill(g, x, y, T) {
  g.fillPolygon([[x - 1.5, y], [x + 1.5, y], [x + 3, y + 9], [x - 3, y + 9]], INK_C);
  for (let i = 0; i < 4; i++) {
    const a = T * 1.6 + (i * Math.PI) / 2, c = cos(a), n = sin(a);
    g.line(Math.round(x), Math.round(y), Math.round(x + 7 * c), Math.round(y + 7 * n), INK_C);
    g.line(Math.round(x + 2 * c - n), Math.round(y + 2 * n + c), Math.round(x + 6 * c - 2 * n), Math.round(y + 6 * n + 2 * c), INK_C);
  }
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, INK_C);
}

/** The backdrop of a set. s: seconds into the minute, T: absolute seconds, p: beat phase. */
export function backdrop(g, set, T, p, wy, gag) {
  if (set === 2) {
    nightSky(g, wy);
    skyline(g, 2, wy);
    for (const [x, y, ph] of [[34, 4, 0], [66, 9, 1], [97, 3, 2], [122, 11, 3], [58, 2, 1], [8 + 4, 15, 2]]) star(g, x, y + wy, ((T * 2 + ph) | 0) % 4 === 0);
    moon(g, 146, 10 + wy, p, gag === 'wink');
  } else {
    skyline(g, set, wy);
    if (set === 1) windmill(g, 124, 9 + wy, T);
    sun(g, set === 0 ? 13 : 146, 10 + wy, T, p, gag === 'wink');
    const puff = p < 0.25 ? 1 : 0;
    for (const [o, y] of [[0, 6], [90, 10]]) {
      const x = ((T * 3 + o) % 200) - 20;
      cloud(g, Math.round(x), y + wy, puff);
    }
  }
  floor(g, set, wy);
  tulip(g, 5, Math.round(2 * sin(Math.PI * (T * 2) * 0.5)));
  tulip(g, 155, Math.round(-2 * sin(Math.PI * (T * 2) * 0.5)));
}

// ------------------------------------------------------------ the gramophone

export const GRAM_X = 83, MOUTH_Y = 31;      // where the ball lands and the notes come out
const HX = 62, HY = 26, HW = 38, HH = 36;   // the horn's box
const NX = 77, NY = 61.5, MX = 84, MY = 38.5;

/** The horn as a 2-tone map (0 clear, 1 ink, 2 ground), flared bell up and to the right; two breaths. */
const HORN = [0, 1].map((puls) => {
  const m = new Uint8Array(HW * HH);
  const ax = MX - NX, ay = MY - NY, L = Math.hypot(ax, ay), ux = ax / L, uy = ay / L, vx = -uy, vy = ux;
  const A = 10 + puls, B = 5;
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const px = HX + i + 0.5 - NX, py = HY + j + 0.5 - NY;
    const t = (px * ux + py * uy) / L, ds = px * vx + py * vy, d = Math.abs(ds);
    const w = 1.6 + (8.4 + puls) * t * t * t;
    let v = 0;
    if (t >= 0 && t <= 1 && d < w) v = t > 0.25 && Math.abs(ds + w * 0.55) < 0.55 ? 2 : 1;
    // the mouth, seen a little from above
    const qx = HX + i + 0.5 - MX, qy = HY + j + 0.5 - MY;
    const ea = (qx * vx + qy * vy) / A, eb = (qx * ux + qy * uy) / B, e = ea * ea + eb * eb;
    const ia = (qx * vx + qy * vy) / (A - 1.4), ib = (qx * ux + qy * uy) / (B - 1.3), ie = ia * ia + ib * ib;
    if (e < 1) v = ie < 1 ? 2 : 1;
    const ta = (qx * vx + qy * vy) / 4, tb = (qx * ux + qy * uy + 0.6) / 1.6;
    if (ta * ta + tb * tb < 1) v = 1;
    m[j * HW + i] = v;
  }
  return m;
});

export function gramophone(g, T, p, loud) {
  const buf = g.buf, puls = p < 0.2 || loud ? 1 : 0;
  // cabinet
  g.fillRect(70, 63, 17, 10, INK_C); g.fillRect(71, 64, 15, 8, GROUND_C);
  g.rect(73, 66, 11, 4, INK_C);
  g.fillRect(70, 72, 2, 1, INK_C); g.fillRect(85, 72, 2, 1, INK_C);
  // the crank turns
  const a = T * 6;
  g.line(87, 67, Math.round(87 + 3 * cos(a)), Math.round(67 + 3 * sin(a)), INK_C);
  // turntable and the spinning record
  g.fillRect(69, 62, 19, 1, INK_C);
  g.fillRect(71, 61, 15, 1, INK_C);
  g.pixel(Math.round(78.5 + 6 * cos(T * 9)), 61, GROUND_C);
  // the horn
  const hm = HORN[puls];
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const v = hm[j * HW + i];
    if (v) buf[(HY + j) * W + HX + i] = v === 1 ? INK : GROUND;
  }
  g.cost.box += HW * HH * 2;
}

/** The little notes the gramophone puffs out, one a beat, closed form from the beat count. */
export function notes(g, b, every = 1) {
  const n = Math.floor(b);
  for (let j = n - 5; j <= n; j++) {
    if (j % every) continue;
    const a = b - j;                        // age in beats
    const dir = (j / every) & 1 ? 1 : -1;
    const x = GRAM_X - 4 + dir * (2 + a * 3.5) + 2 * sin(a * 2.5 + j);
    const y = MOUTH_Y - 6 - a * 8;
    if (y < -8) continue;
    g.blit(NOTE, Math.round(x), Math.round(y), { flipX: dir < 0 });
  }
}
