// Effects for rpgbattle: the battlefield, the summoned phoenix, slashes,
// fire, sparks, and the blue battle-window chrome.
import * as G from './rpgbattle-gfx.js';
import { menuText } from './rpgbattle-font.js';

const { W, H, img } = G;
const lin = (h) => { const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return [f(n >> 16), f((n >> 8) & 255), f(n & 255)]; };
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const FX = {
  fireW: lin('#fff4c0'), fireY: lin('#ffc030'), fireO: lin('#ff6a10'), fireR: lin('#e0200a'),
  slash: lin('#e8f4ff'), slashC: lin('#7ad0ff'), spark: lin('#fff0a0'), portal: lin('#a040ff'),
  star: lin('#c8d0ff'), moon: lin('#fff2c8'),
};

// ------------------------------------------------------------ battlefield
export const BG = new Float32Array(W * H * 3);
export const HORIZON = 52;
(function build() {
  const top = lin('#020110'), hor = lin('#2a1640'), g0 = lin('#141c10'), g1 = lin('#26301a'), mtn = lin('#0a0818');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = 3 * (y * W + x);
    let c;
    if (y < HORIZON) {
      const v = (y / HORIZON) ** 2.2;
      c = [top[0] + (hor[0] - top[0]) * v, top[1] + (hor[1] - top[1]) * v, top[2] + (hor[2] - top[2]) * v];
      // far mountains
      const m = HORIZON - 9 - 6 * Math.sin(x * 0.07 + 1.3) - 4 * Math.sin(x * 0.19 + 0.4) - 2 * Math.sin(x * 0.43);
      if (y > m) c = mtn;
    } else {
      const v = (y - HORIZON) / (H - HORIZON);
      c = [g0[0] + (g1[0] - g0[0]) * v, g0[1] + (g1[1] - g0[1]) * v, g0[2] + (g1[2] - g0[2]) * v];
      // perspective tufts: faint grass rows that widen towards us
      const row = Math.sqrt(y - HORIZON + 1) * 2.3, fr = row - Math.floor(row);
      const tuft = hash(Math.floor(row), Math.floor((x + 3 * Math.floor(row)) / (2 + row * 0.6))) > 0.72 && fr < 0.25;
      if (tuft) { c = [c[0] * 1.9, c[1] * 1.9, c[2] * 1.7]; }
    }
    BG[o] = c[0]; BG[o + 1] = c[1]; BG[o + 2] = c[2];
  }
})();
const STARS = [];
for (let i = 0; i < 46; i++) {
  const x = hash(i, 1) * W, y = hash(i, 2) * (HORIZON - 14);
  if (x > 66 && y < 38) continue;   // keep the damage number's sky clear
  STARS.push([x, y, 0.5 + hash(i, 3) * 2.5, hash(i, 4) * 6.28, 0.04 + 0.12 * hash(i, 5) ** 2]);
}
export function stars(t, k) {
  for (const s of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(t * s[2] + s[3]);
    G.add(Math.round(s[0]), Math.round(s[1]), FX.star, s[4] * tw * k);
  }
}
/** Drifting fireflies over the grass: soft dots gliding. */
export function fireflies(t, k) {
  const c = lin('#c8ff60');
  for (let i = 0; i < 7; i++) {
    const x = 70 + 30 * Math.sin(t * 0.13 * (1 + hash(i, 7)) + i * 2.1) + 12 * Math.sin(t * 0.41 + i);
    const y = 60 + 16 * Math.sin(t * 0.17 * (1 + hash(i, 8)) + i * 1.3) + 5 * Math.sin(t * 0.7 + i * 3);
    const p = 0.5 + 0.5 * Math.sin(t * (1.1 + hash(i, 9)) + i * 4);
    G.glow(x, y, 2.2, c, 0.18 * p * p * k);
  }
}

// ---------------------------------------------------------------- phoenix
/**
 * A front-facing bird of fire with wings spread. (x, y) the body; s scale;
 * flap phase; a opacity. Additive light.
 */
export function phoenix(x, y, s, flap, a, t) {
  if (a <= 0) return;
  const up = Math.sin(flap);                 // +1 wings raised
  // tail streamers
  for (let k = -2; k <= 2; k++) {
    let px = x + k * 1.2 * s, py = y + 4 * s;
    for (let j = 1; j <= 7; j++) {
      const nx = x + (k * 3.6 + Math.sin(t * 4 + j * 0.8 + k) * 2.2) * s * (j / 7), ny = y + (4 + j * 2.2) * s;
      const f = 1 - j / 8;
      G.glowLine(px, py, nx, ny, (1.0 + 0.9 * f) * s, j < 3 ? FX.fireY : j < 5 ? FX.fireO : FX.fireR, a * (0.25 + 0.35 * f));
      px = nx; py = ny;
    }
  }
  // wings: a fan of feathers each side
  for (const sd of [-1, 1]) {
    const shx = x + sd * 2.5 * s, shy = y - 1.5 * s;
    for (let j = 0; j < 7; j++) {
      const len = (14 + j * 3.2) * s, ang = (-0.95 - up * 0.45) + j * 0.2 + 0.15 * Math.sin(t * 6 + j);
      const tx = shx + sd * Math.cos(ang) * len, ty = shy + Math.sin(ang) * len * 0.8 - (6 - j) * up * 0.8 * s;
      const col = j < 2 ? FX.fireY : j < 5 ? FX.fireO : FX.fireR;
      G.glowLine(shx, shy, tx, ty, (2.6 - j * 0.15) * s, col, a * 0.38);
      G.glowLine((shx + tx) / 2, (shy + ty) / 2, tx, ty, 1.4 * s, FX.fireW, a * 0.12);
    }
  }
  // body, head, crest
  G.glow(x, y, 7 * s, FX.fireY, a * 0.8);
  G.glow(x, y, 3.8 * s, FX.fireW, a * 0.9);
  G.glow(x, y - 7 * s, 4.6 * s, FX.fireW, a * 1.1);
  G.glowLine(x, y - 6 * s, x, y - 3.6 * s, 0.9 * s, FX.fireO, a * 0.9);
  for (let k = -1; k <= 1; k++) G.glowLine(x, y - 9 * s, x + k * 3 * s, y - (14 + Math.sin(t * 9 + k) * 1.2) * s, 1.4 * s, FX.fireO, a * 0.5);
  // two dark eyes and a beak make it a creature, not a flare
  for (const sd of [-1, 1]) for (let dy = -1; dy <= 0; dy++) for (let dx = 0; dx <= 1; dx++) G.shade(Math.round(x + sd * 1.8 * s) + dx * sd, Math.round(y - 7.4 * s) + dy, a * 0.9);
}

// ----------------------------------------------------------------- strikes
/** A crescent sword slash across (cx, cy), progress p 0..1, fade f. */
export function slash(cx, cy, r, p, f) {
  if (f <= 0) return;
  const a0 = -2.4, a1 = 0.75, head = a0 + (a1 - a0) * Math.min(1, p * 1.2), tail = a0 + (a1 - a0) * Math.max(0, p * 1.3 - 0.45);
  const n = 14;
  let px = 0, py = 0;
  for (let k = 0; k <= n; k++) {
    const a = tail + (head - tail) * (k / n), w = Math.sin(Math.PI * k / n);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
    if (k) {
      G.glowLine(px, py, x, y, 1.2 + 2.6 * w, FX.slashC, f * 0.55);
      G.glowLine(px, py, x, y, 0.8 + 1.2 * w, FX.slash, f * 0.9);
    }
    px = x; py = y;
  }
}
/** A starburst of sparks at (x, y), age a (s). */
export function burst(x, y, age, seed, size = 1) {
  if (age < 0 || age > 0.6) return;
  const k = age / 0.6, f = (1 - k) ** 1.5;
  G.glow(x, y, (5 + 10 * k) * size, FX.fireW, 0.7 * f);
  for (let i = 0; i < 10; i++) {
    const ang = hash(seed, i) * 6.283, sp = (14 + 26 * hash(seed, i, 2)) * size;
    const d = sp * (1 - (1 - k) ** 2) * 0.6;
    const x1 = x + Math.cos(ang) * d, y1 = y + Math.sin(ang) * d + 10 * k * k;
    G.glowLine(x + Math.cos(ang) * d * 0.55, y + Math.sin(ang) * d * 0.55, x1, y1, 1.2, FX.spark, 0.7 * f);
  }
}
/** Impact star for punches: four points. */
export function impact(x, y, age) {
  if (age < 0 || age > 0.22) return;
  const f = 1 - age / 0.22, r = 3 + 7 * (age / 0.22);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.5708 + 0.4;
    G.glowLine(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.3, FX.spark, f);
  }
  G.glow(x, y, 4, FX.fireW, f * 0.8);
}
export function fireball(x, y, t, a = 1) {
  G.glow(x, y, 6, FX.fireO, 0.55 * a);
  G.glow(x, y, 3.2, FX.fireY, 0.9 * a);
  G.glow(x + Math.sin(t * 40) * 0.6, y, 1.7, FX.fireW, a);
}

// ------------------------------------------------------------------ window
const WTOP = lin('#3858e8'), WBOT = lin('#0c1468'), WB = lin('#f0f0f8'), WB2 = lin('#8890b0');
/** A blue battle window with rounded white chrome. */
export function windowBox(x0, y0, w, h) {
  const x1 = x0 + w - 1, y1 = y0 + h - 1;
  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / (h - 1);
    const c = [WTOP[0] + (WBOT[0] - WTOP[0]) * v, WTOP[1] + (WBOT[1] - WTOP[1]) * v, WTOP[2] + (WBOT[2] - WTOP[2]) * v];
    for (let x = x0; x <= x1; x++) {
      const ex = Math.min(x - x0, x1 - x), ey = Math.min(y - y0, y1 - y);
      if (ex + ey < 2) continue;                          // rounded corner
      const o = 3 * (y * W + x);
      let cc = c;
      if (ex === 0 || ey === 0 || (ex + ey === 2)) cc = WB;
      else if (ex === 1 || ey === 1) cc = WB2;
      img[o] = cc[0]; img[o + 1] = cc[1]; img[o + 2] = cc[2];
    }
  }
}
export { menuText };
