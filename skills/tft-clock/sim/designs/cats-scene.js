// The world of "cats": an Edo roof at an angle across the strip, the sky
// above it (one flat colour per time of day, a sun or moon disc, kasumi
// mist bands drifting through), the yarn ball, the dragonfly, the mouse and
// the hour's fireworks. All closed-form in time.

import { sin, cos, to565, hash } from '../js/kit.js';
import { SUMI, CREAM, YARN, YARN_D, SKIES } from './cats-art.js';

const W = 160, H = 80, N = W * H;
export const Y0 = 53, SL = 0.09;
export const floorY = (x) => Y0 + SL * x;

// ------------------------------------------------------------ the roof (flash: 12.8 KB material map)
// 0 sky, 1 ridge (sumi), 2 tile, 3 tile joint, 4 the ridge cap's light edge
export const ROOF = new Uint8Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const f = floorY(x + 0.5), dy = y + 0.5 - f;
    let m = 0;
    if (dy >= 0 && dy < 2) m = 1;
    else if (dy >= 2 && dy < 3) m = 4;
    else if (dy >= 3) {
      const row = Math.floor((dy - 3) / 6), ry = (dy - 3) - row * 6;
      const cx = ((x + row * 3) % 7 + 7) % 7;
      m = ry < 1 ? 3 : cx === 0 ? 3 : 2;
    }
    ROOF[y * W + x] = m;
  }
/** First roof row per column, to fill the sky above it fast. */
export const ROOF_TOP = new Uint8Array(W);
for (let x = 0; x < W; x++) { let y = 0; while (y < H && ROOF[y * W + x] === 0) y++; ROOF_TOP[x] = y; }

const DISC_X = 74, DISC_Y = 13, DISC_R = 6.5;

/**
 * The sky and the roof. `sky` a SKIES entry; `glint` 0..1 the moonlight
 * that runs along the ridge cap (x position), or < 0 for none.
 */
export function backdrop(g, sky, T, glint) {
  g.clear(sky.sky);
  // ichimonji bokashi: the band of darker blue printed across the top of the
  // sky, its lower edge wiped off the block in steps (flat, ordered)
  g.fillRect(0, 0, W, 3, sky.band);
  const bb = to565(sky.band), buf0 = g.buf;
  for (let x = 0; x < W; x++) { if ((x & 1) === 0) buf0[3 * W + x] = bb; if ((x & 3) === 1) buf0[4 * W + x] = bb; if ((x & 7) === 5) buf0[5 * W + x] = bb; }
  g.cost.box += W * 3;
  // the disc: a vermilion sun by day, a crescent moon at night
  g.fillCircle(DISC_X, DISC_Y, DISC_R, sky.disc);
  if (sky.moon) g.fillCircle(DISC_X + 3.2, DISC_Y - 1.6, DISC_R - 0.6, sky.sky);
  // kasumi: long rounded mist bands, drifting left, in front of the disc
  for (let k = 0; k < 4; k++) {
    const len = 50 + 12 * k, y = [7, 17, 27, 36][k] + Math.round(1.2 * sin(T * 1.7 + k * 2)), h = [4, 5, 4, 3][k];
    const span = W + len + 20, x = ((((-T * (3 + k * 1.3) + k * 61) % span) + span) % span) - len - 10;
    g.fillRoundRect(Math.round(x), y, len, h, h / 2, sky.mist);
  }
  // the roof, from its material map
  const buf = g.buf, RC = [0, to565(SUMI), to565(sky.tile), to565(sky.line), to565(sky.cap)];
  let n = 0;
  for (let x = 0; x < W; x++)
    for (let y = ROOF_TOP[x]; y < H; y++) { const i = y * W + x; buf[i] = RC[ROOF[i]]; n++; }
  g.cost.px += n; g.cost.box += n * 2;
  // a glint of light travelling along the ridge cap
  if (glint >= 0) {
    const gx = glint * (W + 30) - 15;
    for (let x = Math.max(0, Math.floor(gx - 8)); x < Math.min(W, gx + 8); x++) {
      const y = ROOF_TOP[x] + 2, w = 1 - Math.abs(x + 0.5 - gx) / 8;
      if (w > 0.35) buf[y * W + x] = to565(sky.glint);
      if (w > 0.8 && y + 1 < H) buf[(y + 1) * W + x] = to565(sky.glint);
    }
  }
}

// ------------------------------------------------------------ the yarn ball

export const BALL_R = 4;
/** A ball of red yarn: rolled by `roll` radians, wound threads that turn with it. */
export function yarn(g, x, y, roll, tail) {
  // the loose end trailing on the ridge behind it
  if (tail) g.stroke(tail, 1, YARN_D);
  g.fillCircle(x, y, BALL_R + 1, SUMI);
  g.fillCircle(x, y, BALL_R, YARN);
  // three wraps of thread, drawn as chords that rotate with the roll
  for (let k = 0; k < 3; k++) {
    const a = roll + k * 1.05, c = cos(a), s = sin(a);
    const o = (k - 1) * 1.7;
    const x0 = x + c * -3.2 - s * o, y0 = y + s * -3.2 + c * o, x1 = x + c * 3.2 - s * o, y1 = y + s * 3.2 + c * o;
    g.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), YARN_D);
  }
  g.pixel(x - 1.5, y - 1.8, 0xf08a8a);
}

// ------------------------------------------------------------ the dragonfly

/** An akiakane, the red dragonfly of autumn evenings: a body and two pairs of flickering wings. */
export function dragonfly(g, x, y, F, faceLeft) {
  const xr = Math.round(x), yr = Math.round(y), d = faceLeft ? -1 : 1;
  const up = F & 2 ? 1 : 0;
  // wings: pale, flicker between two positions every other frame pair
  for (const wx of [0, 2]) {
    g.fillRect(xr + d * wx - 1, yr - 2 - up, 2, 1, 0xe8eef4);
    g.fillRect(xr + d * wx - 1, yr + 1 + up, 2, 1, 0xe8eef4);
  }
  // body: head, thorax, the long red tail
  g.fillRect(faceLeft ? xr - 3 : xr - 4, yr, 8, 1, 0xd8342a);
  g.pixel(xr + d * 4, yr, SUMI);
  g.pixel(xr + d * 4, yr - 1, SUMI);
}

// ------------------------------------------------------------ the mouse (the hour)

const MOUSE = [
  '..kk......',
  '.kgk......',
  'kgggggk...',
  'kggggggk..',
  '.kkgggggkk',
  '..k.k..k..',
];
const MOUSE2 = [
  '..kk......',
  '.kgk......',
  'kgggggk...',
  'kggggggk..',
  '.kkgggggkk',
  '.k...k.k..',
];
/** A grey mouse running right (or left), legs in two frames. */
export function mouse(g, x, y, F, left) {
  const pic = (F >> 2) & 1 ? MOUSE2 : MOUSE, xr = Math.round(x), yr = Math.round(y);
  const buf = g.buf, ink = to565(SUMI), body = to565(0x9a96a0), eye = to565(0x101014);
  for (let j = 0; j < pic.length; j++)
    for (let i = 0; i < 10; i++) {
      const ch = pic[j][left ? i : 9 - i];
      if (ch === '.') continue;
      const px = xr + i - 5, py = yr + j - 6;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      buf[py * W + px] = ch === 'k' ? ink : body;
    }
  g.cost.blit += 40;
  // eye and the long tail
  g.pixel(left ? xr - 3 : xr + 2, yr - 4, 0x101014);
  const tx = left ? xr + 5 : xr - 6;
  g.line(tx, yr - 2, tx + (left ? 5 : -5), yr - 3 - (F >> 3 & 1), SUMI);
}

// ------------------------------------------------------------ hanabi (the hour)

/**
 * A firework in the flat print manner: rays of square sparks that open,
 * droop and go out spark by spark. Drawn behind the cats. `tau` seconds old.
 */
export function hanabi(g, cx, cy, tau, c, seed) {
  if (tau < 0.12) { g.fillCircle(cx, cy, 1.5 + tau * 12, 0xffffff); return; }
  const open = 1 - (1 - Math.min(1, tau / 0.8)) ** 3, R = 19 * open, fall = tau > 0.5 ? 7 * (tau - 0.5) ** 2 : 0;
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.283 + seed * 0.37, ca = cos(a), sa = sin(a);
    for (let j = 0; j < 4; j++) {
      const q = 0.35 + j * 0.22;
      // sparks go out one by one, the inner ones first
      if (tau > 1.0 + ((hash(k, j, seed) & 255) / 255) * 1.4 + j * 0.15) continue;
      const x = cx + ca * R * q, y = cy + sa * R * q * 0.92 + fall * q;
      const col = j === 3 && (Math.floor(tau * 12) + k) % 3 === 0 ? 0xffffff : c;
      g.fillRect(Math.round(x), Math.round(y), j === 3 ? 2 : 1, j === 3 ? 2 : 1, col);
    }
  }
}

export { hash };
