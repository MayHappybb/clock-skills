// Mahjong tile faces, painted once into small linear-RGB textures (TW x TH
// texels, one texel per world unit of the tile face, which is one LED at the
// time tiles' resting distance). Carved and lacquered: brush strokes drawn as
// tapered capsules at 4x4 supersampling, a groove shadow under each stroke.
//
// Time faces: the characters suit for the hours (blue-black numeral over a
// red 萬), the circles suit for the minutes, and the white dragon (a blank
// tile with a blue frame) as zero in either.
import * as kit from '../js/kit.js';

// faces are designed on a 24 x 32 grid and painted at Q x that resolution
export const Q = 1.75, TW = Math.round(24 * Q), TH = Math.round(32 * Q);
const SS = 4;

const IVORY = kit.hex('#f2e9d2');
export const INK = { k: kit.hex('#141b38'), r: kit.hex('#dc2418'), g: kit.hex('#17a048'), b: kit.hex('#2458d8') };

// ------------------------------------------------------------- painting
/** A face being painted: one coverage mask per lacquer colour. */
function canvas() { return { layers: new Map() }; }
function layer(cv, col) {
  if (!cv.layers.has(col)) cv.layers.set(col, new Float32Array(TW * TH * SS * SS));
  return cv.layers.get(col);
}
/** Tapered capsule from (x1,y1) width w1 to (x2,y2) width w2, in texel units. */
function stroke(cv, col, x1, y1, x2, y2, w1, w2 = w1) {
  x1 *= Q; y1 *= Q; x2 *= Q; y2 *= Q; w1 *= Q; w2 *= Q;
  const m = layer(cv, col), W = TW * SS;
  const r = Math.max(w1, w2) / 2 + 0.5;
  const x0 = Math.max(0, Math.floor((Math.min(x1, x2) - r) * SS)), xe = Math.min(W - 1, Math.ceil((Math.max(x1, x2) + r) * SS));
  const y0 = Math.max(0, Math.floor((Math.min(y1, y2) - r) * SS)), ye = Math.min(TH * SS - 1, Math.ceil((Math.max(y1, y2) + r) * SS));
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
  for (let sy = y0; sy <= ye; sy++) for (let sx = x0; sx <= xe; sx++) {
    const px = (sx + 0.5) / SS, py = (sy + 0.5) / SS;
    const t = kit.clamp(((px - x1) * dx + (py - y1) * dy) / L2);
    const d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
    if (d <= (w1 + (w2 - w1) * t) / 2) m[sy * W + sx] = 1;
  }
}
/** A polyline of strokes with widths per point. */
function path(cv, col, pts) {
  for (let i = 0; i + 1 < pts.length; i++) stroke(cv, col, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2], pts[i + 1][2]);
}
/** Ring (or disc when w >= r) centred at (x, y). */
function ring(cv, col, x, y, r, w) {
  x *= Q; y *= Q; r *= Q; w *= Q;
  const m = layer(cv, col), W = TW * SS;
  for (let sy = Math.floor((y - r - 1) * SS); sy <= (y + r + 1) * SS; sy++) for (let sx = Math.floor((x - r - 1) * SS); sx <= (x + r + 1) * SS; sx++) {
    if (sx < 0 || sy < 0 || sx >= W || sy >= TH * SS) continue;
    const d = Math.hypot((sx + 0.5) / SS - x, (sy + 0.5) / SS - y);
    if (d <= r && d >= r - w) m[sy * W + sx] = 1;
  }
}
/** Rounded-rectangle frame. */
function frame(cv, col, x0, y0, x1, y1, rad, w) {
  x0 *= Q; y0 *= Q; x1 *= Q; y1 *= Q; rad *= Q; w *= Q;
  const m = layer(cv, col), W = TW * SS;
  for (let sy = 0; sy < TH * SS; sy++) for (let sx = 0; sx < W; sx++) {
    const px = (sx + 0.5) / SS, py = (sy + 0.5) / SS;
    const qx = Math.abs(px - (x0 + x1) / 2) - ((x1 - x0) / 2 - rad), qy = Math.abs(py - (y0 + y1) / 2) - ((y1 - y0) / 2 - rad);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
    if (d <= 0 && d >= -w) m[sy * W + sx] = 1;
  }
}
/** Resolve the masks onto ivory: lacquer where carved, a groove shadow below-right. */
function bake(cv) {
  const tex = new Float32Array(TW * TH * 3), W = TW * SS;
  const cov = new Float32Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { tex.set(IVORY, 3 * (y * TW + x)); }
  for (const [col, m] of cv.layers) {
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      let s = 0, sh = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        s += m[(y * SS + j) * W + x * SS + i];
        const ys = y * SS + j - 5, xs = x * SS + i - 4;           // the groove's lip, up-left of the light
        if (ys >= 0 && xs >= 0) sh += m[ys * W + xs];
      }
      s /= SS * SS; sh /= SS * SS;
      const p = 3 * (y * TW + x), k = 1 - 0.3 * sh * (1 - s);
      for (let c = 0; c < 3; c++) tex[p + c] = (tex[p + c] * k) * (1 - s) + col[c] * s;
      cov[y * TW + x] = Math.max(cov[y * TW + x], s);
    }
  }
  return tex;
}

// ------------------------------------------------------------ the suits
const K = INK.k, R = INK.r, G = INK.g, B = INK.b;

// numerals of the characters suit, box x 3..21, y 3..14 (brush: heavy ends)
const NUM = {
  1: [[[3.5, 9, 1.9], [12, 8.5, 2.1], [19.5, 8.2, 2.4], [20.6, 9.2, 2.6]]],
  2: [[[6.5, 5.2, 1.8], [17, 4.8, 2.2]], [[3.5, 12.4, 1.9], [12, 12, 2.1], [19.6, 11.7, 2.4], [20.6, 12.6, 2.6]]],
  3: [[[6.5, 4, 1.7], [17, 3.7, 2.1]], [[7.5, 8.2, 1.7], [16.5, 7.9, 2.1]], [[3.5, 12.6, 1.9], [12, 12.2, 2.1], [19.6, 11.9, 2.4], [20.6, 12.8, 2.6]]],
  4: [[[4.5, 4.2, 2.1], [4.5, 13.5, 2]], [[4.5, 4.2, 1.8], [19.5, 4, 1.9], [19.5, 13.3, 2.1]], [[10.2, 4.6, 1.7], [9.6, 8.5, 1.6], [7.2, 11, 1.5]],
    [[13.8, 4.6, 1.7], [13.8, 9.6, 1.6], [16.4, 10.2, 1.6]], [[4.5, 13.2, 1.8], [19.5, 13.2, 1.9]]],
  5: [[[5, 4.2, 1.8], [19, 3.9, 2.1]], [[11.6, 4.2, 2], [9.8, 13, 2]], [[7.5, 8.6, 1.7], [17.2, 8.4, 1.8], [17.2, 13, 2]], [[3.5, 13, 1.9], [12, 13.1, 2.1], [20.6, 12.9, 2.5]]],
  6: [[[11.4, 2.6, 1.6], [12.8, 5, 2.4]], [[3.6, 7.6, 1.9], [12, 7.3, 2.1], [20.4, 7.1, 2.4]], [[9.2, 9.6, 2.1], [5, 13.8, 1.6]], [[14.8, 9.8, 1.8], [18.8, 13.4, 2.6]]],
  7: [[[3.5, 8.6, 1.8], [12, 7.8, 2], [20.6, 7, 2.3]], [[9.6, 3, 2], [9.6, 11.4, 2.1], [11.4, 13.2, 2], [19.2, 13.2, 2], [20.4, 11.4, 2.2]]],
  8: [[[10, 3.6, 2.1], [9.2, 8, 2], [7.4, 11, 1.8], [3.6, 13.6, 1.5]], [[14, 4.6, 2], [15.4, 9, 2.1], [17.6, 11.6, 2.4], [20.6, 13.2, 2.6]]],
  9: [[[10.4, 2.8, 2], [10.2, 8, 2], [8.6, 11.4, 1.8], [4.6, 13.8, 1.4]], [[4.4, 7, 1.8], [15.4, 6.4, 2.1], [15.2, 11.8, 2.1], [16.4, 13.3, 2], [20, 13.3, 2], [20.8, 11.6, 2.2]]],
};
/** 萬, red, rows 16..30: grass, the 田 field, the 冂 frame and its 厶. */
function wan(cv) {
  const w = 1.5;
  stroke(cv, R, 4, 17.4, 20, 17, w, 1.5);                       // grass horizontal
  stroke(cv, R, 8.6, 15.6, 8.6, 19, w); stroke(cv, R, 15.4, 15.6, 15.4, 19, w);
  stroke(cv, R, 7, 19.8, 7, 23.6, w); stroke(cv, R, 7, 19.8, 17, 19.8, w); stroke(cv, R, 17, 19.8, 17, 23.6, w);
  stroke(cv, R, 7, 21.7, 17, 21.7, 1.3); stroke(cv, R, 7, 23.6, 17, 23.6, w);
  stroke(cv, R, 12, 19.8, 12, 27, w);                           // centre stroke through to the frame
  stroke(cv, R, 4.6, 25.6, 4.6, 30, 1.4); stroke(cv, R, 4.6, 25.6, 19.4, 25.6, w);
  stroke(cv, R, 19.4, 25.6, 19.4, 29.4, 1.4); stroke(cv, R, 19.4, 29.4, 17.6, 30, 1.2);
  path(cv, R, [[10.4, 27, 1.2], [8.6, 29, 1.2], [15, 28.8, 1.2]]); stroke(cv, R, 14.2, 27.4, 15.2, 28.2, 1.3);
}
/** One circle of the circles suit: a lacquered ring round a dot. */
function coin(cv, col, x, y, r) {
  ring(cv, col, x, y, r, Math.max(1.2, r * 0.36));
  ring(cv, col, x, y, r * 0.3 + 0.2, r * 0.3 + 0.2);
}
const PIN = {
  2: [[12, 9, B], [12, 23, G]],
  3: [[6.4, 6.6, B], [12, 16, R], [17.6, 25.4, G]],
  4: [[7, 9, B], [17, 9, G], [7, 23, G], [17, 23, B]],
  5: [[6.5, 7, B], [17.5, 7, G], [12, 16, R], [6.5, 25, G], [17.5, 25, B]],
  6: [[7, 6.2, G], [17, 6.2, G], [7, 16.4, R], [17, 16.4, R], [7, 25.4, R], [17, 25.4, R]],
  7: [[5.4, 4.6, G], [12, 7.6, G], [18.6, 10.6, G], [7.4, 18.6, R], [16.6, 18.6, R], [7.4, 26.4, R], [16.6, 26.4, R]],
  8: [[7.2, 4.8, B], [16.8, 4.8, B], [7.2, 12.2, B], [16.8, 12.2, B], [7.2, 19.6, B], [16.8, 19.6, B], [7.2, 27, B], [16.8, 27, B]],
  9: [[5.4, 6, B], [12, 6, B], [18.6, 6, B], [5.4, 16, R], [12, 16, R], [18.6, 16, R], [5.4, 26, G], [12, 26, G], [18.6, 26, G]],
};
const PIN_R = { 2: 5.2, 3: 4.1, 4: 4.3, 5: 3.9, 6: 3.7, 7: 3.3, 8: 3.5, 9: 3.3 };

export function whiteDragon() {
  const cv = canvas();
  frame(cv, B, 4, 3.5, 20, 28.5, 3.2, 1.7);
  return bake(cv);
}
export function characters(n) {
  if (n === 0) return whiteDragon();
  const cv = canvas();
  for (const p of NUM[n]) path(cv, K, p);
  wan(cv);
  return bake(cv);
}
export function circles(n) {
  if (n === 0) return whiteDragon();
  const cv = canvas();
  if (n === 1) {                                     // the big wheel
    ring(cv, G, 12, 16, 10, 1.6);
    ring(cv, R, 12, 16, 7.6, 1.3);
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ring(cv, B, 12 + 4.6 * Math.cos(a), 16 + 4.6 * Math.sin(a), 1.2, 1.2); }
    ring(cv, R, 12, 16, 2.4, 2.4);
  } else for (const [x, y, c] of PIN[n]) coin(cv, c, x, y, PIN_R[n]);
  return bake(cv);
}
/** Bamboo suit (the hand's other tiles): green canes with a red one for some. */
export function bamboo(n) {
  const cv = canvas();
  const cane = (x, y, len, col) => { stroke(cv, col, x, y, x, y + len, 2.4); stroke(cv, IVORY, x - 2, y + len / 2, x + 2, y + len / 2, 0.7); };
  const L = { 2: [[12, 4, 10, G], [12, 18, 10, G]], 3: [[12, 4, 10, G], [7.5, 18, 10, G], [16.5, 18, 10, G]],
    4: [[7.5, 4, 10, G], [16.5, 4, 10, G], [7.5, 18, 10, G], [16.5, 18, 10, G]],
    5: [[6.5, 4, 10, G], [17.5, 4, 10, G], [12, 10.5, 11, R], [6.5, 18, 10, G], [17.5, 18, 10, G]],
    6: [[5.5, 4, 10, G], [12, 4, 10, G], [18.5, 4, 10, G], [5.5, 18, 10, G], [12, 18, 10, G], [18.5, 18, 10, G]],
    8: [[5.5, 4, 10, G], [10, 6, 8, G], [14, 6, 8, G], [18.5, 4, 10, G], [5.5, 18, 10, G], [10, 18, 8, G], [14, 18, 8, G], [18.5, 18, 10, G]],
    9: [[5.5, 4, 8, R], [12, 4, 8, B], [18.5, 4, 8, G], [5.5, 13, 8, R], [12, 13, 8, B], [18.5, 13, 8, G], [5.5, 22, 7, R], [12, 22, 7, B], [18.5, 22, 7, G]] };
  for (const [x, y, len, col] of L[n]) cane(x, y, len, col);
  return bake(cv);
}
/** The red dragon 中 and the green dragon 發 (simplified for 24 x 32). */
export function redDragon() {
  const cv = canvas();
  stroke(cv, R, 5, 10, 5, 21, 2.2); stroke(cv, R, 5, 10, 19, 10, 2); stroke(cv, R, 19, 10, 19, 21, 2.2); stroke(cv, R, 5, 20.4, 19, 20.4, 2);
  stroke(cv, R, 12, 3.5, 12, 29, 2.6);
  return bake(cv);
}
export function greenDragon() {
  const cv = canvas();
  path(cv, G, [[5, 5, 1.6], [8, 9, 1.8], [4, 13, 1.6]]); path(cv, G, [[19, 5, 1.6], [16, 9, 1.8], [20, 13, 1.6]]);
  stroke(cv, G, 6, 15.5, 18, 15.5, 1.8);
  stroke(cv, G, 7.5, 18, 7.5, 28, 1.8); stroke(cv, G, 7.5, 19, 11, 19, 1.6); stroke(cv, G, 11, 19, 10, 23, 1.5); stroke(cv, G, 4.5, 26, 11.5, 23.5, 1.6);
  path(cv, G, [[14, 18, 1.6], [19, 18, 1.6], [17.6, 21.6, 1.6], [13.6, 28, 1.5]]); stroke(cv, G, 14, 22.5, 20, 28, 1.7);
  return bake(cv);
}
/** The one-bamboo bird. */
export function bird() {
  const cv = canvas();
  ring(cv, G, 11, 18, 5.5, 5.5);                    // body
  ring(cv, R, 15.5, 10, 3, 3);                       // head
  stroke(cv, R, 18, 10, 21, 11, 1.4);                // beak
  path(cv, G, [[7, 21, 2.4], [3, 28, 1.6]]); path(cv, B, [[9, 22, 2], [7, 29, 1.4]]); path(cv, R, [[12, 23, 1.8], [12.5, 29.5, 1.2]]);
  ring(cv, K, 16, 9.5, 0.9, 0.9);
  return bake(cv);
}

/** Every face, keyed. Time tiles: 'c0'..'c9' (characters), 'p0'..'p9' (circles). */
export function buildFaces() {
  const F = {};
  for (let n = 0; n <= 9; n++) { F['c' + n] = characters(n); F['p' + n] = circles(n); }
  for (const n of [2, 3, 4, 5, 6, 8, 9]) F['b' + n] = bamboo(n);
  F.b1 = bird(); F.rd = redDragon(); F.gd = greenDragon();
  return F;
}
/** The faces the other tiles in the hand and the opponents' discards use. */
export const OTHER = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b8', 'b9', 'rd', 'gd'];
