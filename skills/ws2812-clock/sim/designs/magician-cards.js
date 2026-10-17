// Magician: the props that carry the time, as baked textures.
// - Ten Victorian fat-face numerals (Didone stress: fat stems, hairline
//   joins, ball terminals) drawn as shape tests in a 14 x 21 unit box.
// - The hour card: an ivory playing card, 30 x 40 px, gilt frame, heart
//   pips, the hour printed in red with a black drop shadow. One per hour.
// - The sawing box: each half's end panel, 27 x 30 px, red lacquer with a
//   gilt frame and a gold numeral in a black moat. One per digit, plus a
//   plain side panel.
// Textures are premultiplied RGBA at 2 texels per px (4x4 samples each) and
// sampled with bilinear taps, so props can move, spin and tilt at
// sub-pixel positions.
import * as kit from '../js/kit.js';

const S = 2;
// ---------------------------------------------------------------- glyphs
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const ring = (x, y, cx, cy, rxo, ryo, cxi, cyi, rxi, ryi) => ell(x, y, cx, cy, rxo, ryo) && !ell(x, y, cxi, cyi, rxi, ryi);
const box = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function seg(x, y, ax, ay, bx, by, wa, wb = wa) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = kit.clamp(((x - ax) * dx + (y - ay) * dy) / L2);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= (wa + (wb - wa) * t) / 2;
}
const ball = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function six(x, y) {
  return ring(x, y, 7, 14.3, 6.4, 6.3, 7.4, 14.4, 2.9, 4.4)
    || (ring(x, y, 10.2, 11.2, 9.6, 10.6, 10.6, 11.6, 5.8, 8.7) && x < 10.4 && y < 12.5)
    || ball(x, y, 11.3, 2.9, 1.95);
}
export const GLYPH = [
  (x, y) => ring(x, y, 7, 10.5, 6.8, 10.3, 7, 10.5, 3.0, 8.5),
  (x, y) => box(x, y, 5.2, 0.9, 8.9, 19.6) || box(x, y, 2.4, 19.2, 11.6, 21)
    || seg(x, y, 5.6, 1.1, 2.0, 4.8, 1.6, 1.4) || ball(x, y, 2.3, 4.9, 1.15)
    || (box(x, y, 3.6, 17.6, 10.5, 19.4) && !ball(x, y, 3.6, 17.4, 1.7) && !ball(x, y, 10.5, 17.4, 1.7)),
  (x, y) => ball(x, y, 3.0, 5.0, 2.15)
    || (ring(x, y, 7, 6.4, 6.3, 5.7, 6.2, 6.8, 3.2, 3.9) && (y < 6.4 || x > 7) && y < 10)
    || seg(x, y, 11.3, 9.0, 2.0, 19.3, 3.5, 1.7)
    || box(x, y, 1.1, 18.6, 13.1, 21) || box(x, y, 11.7, 15.8, 13.1, 21),
  (x, y) => (ring(x, y, 7, 5.2, 5.8, 4.7, 6.2, 5.3, 2.8, 3.0) && !(x < 6.2 && y > 4.6))
    || ball(x, y, 2.5, 3.6, 1.95)
    || (ring(x, y, 7, 14.7, 6.6, 6.2, 6.2, 14.7, 3.1, 4.3) && !(x < 6.2 && y < 15.4))
    || ball(x, y, 2.3, 17.5, 2.1),
  (x, y) => box(x, y, 8.6, 0.8, 12.2, 19.6) || box(x, y, 6.4, 19.2, 14, 21)
    || box(x, y, 0.4, 14.0, 14, 15.9) || seg(x, y, 9.2, 1.0, 0.9, 14.7, 1.5),
  (x, y) => box(x, y, 3.9, 0.8, 12.4, 3.1) || box(x, y, 11.0, 0.8, 12.6, 4.6)
    || box(x, y, 3.5, 0.8, 5.4, 9.8)
    || (ring(x, y, 6.9, 14.1, 6.5, 6.7, 6.2, 14.1, 3.0, 4.8) && !(x < 5.4 && y < 16.2))
    || ball(x, y, 2.2, 17.4, 2.05),
  six,
  (x, y) => box(x, y, 1.0, 0.8, 13.2, 3.4) || box(x, y, 1.0, 0.8, 2.7, 6.0)
    || seg(x, y, 12.4, 2.6, 8.6, 10.6, 2.0, 3.0) || seg(x, y, 8.6, 10.6, 6.7, 19.4, 3.0, 3.8),
  (x, y) => ring(x, y, 7, 5.4, 5.6, 4.9, 7, 5.4, 2.6, 3.1) || ring(x, y, 7, 15.0, 6.7, 6.0, 7, 15.0, 3.2, 4.2),
  (x, y) => six(14 - x, 21 - y),
];
const GW = 14, GH = 21;

// ----------------------------------------------------------------- pips
const heart = (x, y, cx, cy, r) => ball(x, y, cx - r * 0.5, cy - r * 0.2, r * 0.55) || ball(x, y, cx + r * 0.5, cy - r * 0.2, r * 0.55)
  || (y >= cy - r * 0.2 && Math.abs(x - cx) <= (cy + r - y) * 0.95);

// ---------------------------------------------------------------- inks
const IVORY = kit.scale(kit.hex('#f6ead0'), 0.075), REDH = kit.hex('#ff6a50'), RED = kit.hex('#d8162e'), INK = [0.006, 0.005, 0.01];
const GILT = kit.scale(kit.hex('#e0a830'), 0.55), BACK = kit.scale(kit.hex('#a8101e'), 0.7), BACKL = kit.scale(kit.hex('#ff5a3a'), 0.45);
const LACQ = kit.scale(kit.hex('#8a0a1c'), 0.42), LACQD = kit.scale(kit.hex('#5a0612'), 0.3);
const GOLD = kit.scale(kit.hex('#ffc040'), 0.95), GOLDH = kit.scale(kit.hex('#fff0b0'), 1), MOAT = [0.004, 0.001, 0.002];
const STAR = kit.scale(kit.hex('#e0a830'), 0.5);

const rrect = (x, y, w, h, r) => {
  const qx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0), qy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return qx * qx + qy * qy <= r * r;
};

/** Bake a w x h px texture from fn(x, y, out) (out[3] = coverage 0/1). */
function bake(w, h, fn) {
  const TW = w * S, TH = h * S, t = new Float32Array(4 * TW * TH), o = [0, 0, 0, 0], N = 4;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      o[3] = 0;
      fn((i + (sx + 0.5) / N) / S, (j + (sy + 0.5) / N) / S, o);
      if (o[3]) { r += o[0]; g += o[1]; b += o[2]; a += 1; }
    }
    const k = 4 * (j * TW + i), n = N * N;
    t[k] = r / n; t[k + 1] = g / n; t[k + 2] = b / n; t[k + 3] = a / n;
  }
  return { t, w, h, TW, TH };
}
const put = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = 1; };

// ------------------------------------------------------------ hour card
const MO = []; for (let k = 0; k < 12; k++) MO.push(Math.cos((k / 12) * kit.TAU) * 1.0, Math.sin((k / 12) * kit.TAU) * 1.0);
export const CARD_W = 27, CARD_H = 36;
const HS = 0.86, HGX = [CARD_W / 2 - 0.6 - GW * HS, CARD_W / 2 + 0.6], HGY = (CARD_H - GH * HS) / 2;
function cardFace(hh) {
  const d = [Math.floor(hh / 10), hh % 10];
  return bake(CARD_W, CARD_H, (x, y, o) => {
    if (!rrect(x, y, CARD_W, CARD_H, 2.6)) return;
    let c = IVORY;
    const fr = Math.min(x, CARD_W - x, y, CARD_H - y);
    if (fr > 1.2 && fr < 1.8) c = GILT;
    if (heart(x, y, 3.9, 4.2, 1.5) || heart(CARD_W - x, CARD_H - y, 3.9, 4.2, 1.5)) c = RED;
    for (let k = 0; k < 2; k++) {
      const g = GLYPH[d[k]], gx = (x - HGX[k]) / HS, gy = (y - HGY) / HS;
      let moat = false;
      for (let q = 0; q < MO.length && !moat; q += 2) moat = g(gx + MO[q] * 1.25, gy + MO[q + 1] * 1.25);
      if (moat) c = INK;
      if (g(gx, gy)) c = g(gx + 0.8, gy + 0.8) ? RED : REDH;
    }
    put(o, c);
  });
}
export const HOUR_CARDS = Array.from({ length: 24 }, (_, h) => cardFace(h));
export const CARD_BACK = bake(CARD_W, CARD_H, (x, y, o) => {
  if (!rrect(x, y, CARD_W, CARD_H, 2.6)) return;
  const fr = Math.min(x, CARD_W - x, y, CARD_H - y);
  let c = IVORY;
  if (fr > 1.8) {
    const a = kit.fract((x + y) / 3.6), b = kit.fract((x - y) / 3.6);
    c = a < 0.2 || b < 0.2 ? BACKL : BACK;
    if (fr < 2.5) c = GILT;
    if (ell(x, y, CARD_W / 2, CARD_H / 2, 5.5, 7.5)) c = ell(x, y, CARD_W / 2, CARD_H / 2, 4.2, 6.2) ? BACK : GILT;
    if (heart(x, y, CARD_W / 2, CARD_H / 2, 3)) c = GILT;
  }
  put(o, c);
});

// ------------------------------------------------------------ box panels
export const BOX_W = 23, BOX_H = 30;
const BS = 1.06, BGX = (BOX_W - GW * BS) / 2, BGY = (BOX_H - GH * BS) / 2;
function panel(x, y, w, o) {
  const fr = Math.min(x, w - x, y, BOX_H - y);
  let c = fr < 0.9 ? LACQD : LACQ;
  if (fr > 1.4 && fr < 2.0) c = GILT;
  put(o, c);
  return fr;
}
function boxFace(dg) {
  const g = GLYPH[dg];
  return bake(BOX_W, BOX_H, (x, y, o) => {
    const fr = panel(x, y, BOX_W, o);
    if (fr > 2.0) for (const [sx, sy] of [[3.3, 3.3], [BOX_W - 3.3, 3.3], [3.3, BOX_H - 3.3], [BOX_W - 3.3, BOX_H - 3.3]]) if (ball(x, y, sx, sy, 0.75)) put(o, STAR);
    const gx = (x - BGX) / BS, gy = (y - BGY) / BS;
    let moat = false;
    for (let k = 0; k < MO.length && !moat; k += 2) moat = g(gx + MO[k], gy + MO[k + 1]);
    if (moat) put(o, MOAT);
    if (g(gx, gy)) put(o, g(gx + 0.9, gy + 0.9) && g(gx - 0.5, gy - 0.5) ? GOLD : GOLDH);
  });
}
export const BOX_FACES = Array.from({ length: 10 }, (_, d) => boxFace(d));
export const BOX_SIDE_W = 12;
export const BOX_SIDE = bake(BOX_SIDE_W, BOX_H, (x, y, o) => {
  const fr = panel(x, y, BOX_SIDE_W, o);
  if (fr > 2.0 && heart(x, y, BOX_SIDE_W / 2, BOX_H / 2, 2.0)) put(o, STAR);
});

// ------------------------------------------------------------- drawing
const smp = new Float32Array(4);
function sample(T, tx, ty) {
  const x0 = Math.floor(tx), y0 = Math.floor(ty), fx = tx - x0, fy = ty - y0, t = T.t, TW = T.TW, TH = T.TH;
  smp[0] = smp[1] = smp[2] = smp[3] = 0;
  for (let k = 0; k < 4; k++) {
    const xx = x0 + (k & 1), yy = y0 + (k >> 1);
    if (xx < 0 || yy < 0 || xx >= TW || yy >= TH) continue;
    const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), p = 4 * (yy * TW + xx);
    smp[0] += t[p] * w; smp[1] += t[p + 1] * w; smp[2] += t[p + 2] * w; smp[3] += t[p + 3] * w;
  }
}
const OFF = [-0.25, -0.25, 0.25, -0.25, -0.25, 0.25, 0.25, 0.25];

/**
 * Draw a card into img: centre (cx, cy), in-plane angle ang, yaw (spin about
 * its vertical axis: the face shows while cos(yaw) > 0, else the back), size
 * k, brightness b, opacity alpha. A glint sweeps across as it turns.
 */
export function drawCard(img, W, H, face, cx, cy, ang, yaw, k, b, alpha = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ac = Math.abs(c);
  if (ac < 0.03) return;
  const T = c > 0 ? face : CARD_BACK, cw = T.w, chh = T.h;
  const ca = Math.cos(ang), sa = Math.sin(ang), hw = (cw / 2) * k * ac + 1, hh = (chh / 2) * k * 1.15 + 1;
  const ex = Math.abs(hw * ca) + Math.abs(hh * sa), ey = Math.abs(hw * sa) + Math.abs(hh * ca);
  const x0 = Math.max(0, Math.floor(cx - ex)), x1 = Math.min(W - 1, Math.ceil(cx + ex));
  const y0 = Math.max(0, Math.floor(cy - ey)), y1 = Math.min(H - 1, Math.ceil(cy + ey));
  const shade = b * (0.55 + 0.45 * ac), glintU = s * 40, persp = 0.2 * s / (cw / 2), sgn = c > 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let r = 0, g = 0, bl = 0, a = 0, gl = 0;
    for (let q = 0; q < 8; q += 2) {
      const dx = x + OFF[q] - cx, dy = y + OFF[q + 1] - cy;
      const xs = (dx * ca + dy * sa) / k, ys = (-dx * sa + dy * ca) / k;
      const u = (xs / c) * sgn, v = ys / (1 + persp * u * sgn);
      if (u < -cw / 2 - 1 || u > cw / 2 + 1 || v < -chh / 2 - 1 || v > chh / 2 + 1) continue;
      sample(T, (u + cw / 2) * S - 0.5, (v + chh / 2) * S - 0.5);
      r += smp[0]; g += smp[1]; bl += smp[2]; a += smp[3];
      const gu = u - glintU + v * 0.35;
      gl += smp[3] * Math.exp(-gu * gu * 0.06);
    }
    if (a <= 0) continue;
    const p = 3 * (y * W + x), A = (a / 4) * alpha, G = 0.14 * (gl / 4) * b;
    img[p] = img[p] * (1 - A) + (r / 4 * shade + G) * alpha;
    img[p + 1] = img[p + 1] * (1 - A) + (g / 4 * shade + G * 0.92) * alpha;
    img[p + 2] = img[p + 2] * (1 - A) + (bl / 4 * shade + G * 0.8) * alpha;
  }
}

/**
 * Draw a flat panel texture stretched between screen x xa..xb (xa < xb),
 * rows y0..y0 + T.h, times shade, with a glint g (0..1) across it.
 */
export function drawPanel(img, W, H, T, xa, xb, y0, shade, glint = 0) {
  const span = xb - xa;
  if (span < 0.05) return;
  const X0 = Math.max(0, Math.floor(xa)), X1 = Math.min(W - 1, Math.ceil(xb)), Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y0 + T.h));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let q = 0; q < 8; q += 2) {
      const sx = x + OFF[q], sy = y + OFF[q + 1];
      if (sx < xa || sx > xb || sy < y0 || sy > y0 + T.h) continue;
      sample(T, ((sx - xa) / span) * T.TW - 0.5, (sy - y0) * S - 0.5);
      r += smp[0]; g += smp[1]; b += smp[2]; a += smp[3];
    }
    if (a <= 0) continue;
    const p = 3 * (y * W + x), A = a / 4, G = glint * 0.1 * A;
    img[p] = img[p] * (1 - A) + r / 4 * shade + G;
    img[p + 1] = img[p + 1] * (1 - A) + g / 4 * shade + G * 0.9;
    img[p + 2] = img[p + 2] * (1 - A) + b / 4 * shade + G * 0.75;
  }
}
export const BOX_BACK = bake(BOX_W, BOX_H, (x, y, o) => {
  const fr = panel(x, y, BOX_W, o);
  if (fr > 2.0 && (heart(x, y, BOX_W / 2, BOX_H / 2, 3.2) || ball(x, y, BOX_W / 2, 7, 0.8) || ball(x, y, BOX_W / 2, BOX_H - 7, 0.8))) put(o, STAR);
});
