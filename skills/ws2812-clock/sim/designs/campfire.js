// Campfire: two kids on logs either side of a crackling fire, holding sticks
// over the flames. The time is four puffy marshmallow numerals, skewered on
// the sticks (hours on the left stick, minutes on the right). Every
// marshmallow toasts from white to gold to brown over its own period and
// swells as it heats, so the minute marshmallow's colour is the seconds.
//
// Minute turn: the old marshmallow catches fire, the kid starts, leans in and
// blows it out (smoke), flicks it off the stick and swallows it whole (cheeks
// balloon, chewing); a fresh white numeral pops out of the bag at their feet,
// sails over and lands on the stick with a squish.
// Hour: a shooting star crosses the sky, the kids look up, the fire flares and
// throws a fountain of sparks.
import * as kit from '../js/kit.js';
import { GW, GH, R, S, sample, dist } from './campfire-glyphs.js';
import { W, H, img, FL, lightAt, put, addPx, glowDot, ellipse, capsule, shade } from './campfire-paint.js';

const sst = kit.smoothstep, clamp = kit.clamp, lerp = kit.lerp;
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------ scenery
const FX = 64, FY = 57;                        // fire base
const HAND = [20.5, 44.2], STICK_LEN = 40, A0 = -31 * Math.PI / 180, MS = 0.9, TILT = 0.3;
const SLOT_S = [12.5, 29.5];                     // inner, tip (px from the hand)
// slot k: side (-1 left kid, 1 right kid), position on the stick
const SLOTS = [{ side: -1, s: 0 }, { side: -1, s: 1 }, { side: 1, s: 1 }, { side: 1, s: 0 }];
const KIDS = [
  { side: -1, hat: kit.hex('#d8241c'), pom: kit.hex('#f2ece0'), coat: kit.hex('#1f5fd0'), skin: kit.hex('#ffc8a0') },
  { side: 1, hat: kit.hex('#2aa64a'), pom: kit.hex('#ffd23a'), coat: kit.hex('#e0782a'), skin: kit.hex('#e0a070') },
];
const BARK = kit.hex('#8a5028'), WOOD = kit.hex('#c08848'), JEANS = kit.hex('#4a5a88'), STONE = kit.hex('#8a8680');
const DIRT = kit.hex('#5a3a22'), DARK = [0.004, 0.002, 0.002];
const BAG = kit.hex('#e8e2d8'), BAGBAND = kit.hex('#3a78e0');

// stars, fixed; avoid the marshmallow band a little
const STARS = [];
for (let k = 0; STARS.length < 46 && k < 400; k++) {
  const x = kit.hash(k, 1) * 127, y = kit.hash(k, 2) ** 1.4 * 40;
  if (y > 18 && x > 20 && x < 108) continue;
  STARS.push([x, y, 0.25 + 0.75 * kit.hash(k, 3) ** 2, kit.hash(k, 4) * 6.28, 0.6 + 2 * kit.hash(k, 5)]);
}
// pines: [x, top y, half width at base, base y]
const PINES = [[3, 6, 9, 58], [14, 14, 7, 58], [-4, 18, 7, 58], [123, 4, 10, 58], [112, 15, 7, 58], [132, 14, 8, 58],
  [40, 30, 5, 56], [88, 28, 6, 56], [30, 34, 4, 56], [98, 33, 4, 56]];
const SKY = new Float32Array(3 * W * H);       // sky, static
const TREE = new Float32Array(W * H), LF = new Float32Array(W * H);
const PINE = kit.hex('#3a6a34');
(function buildSky() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = 3 * (y * W + x), k = y / 56;
    let r = 0.001 + 0.006 * k ** 3, g = 0.003 + 0.014 * k ** 2, b = 0.009 + 0.04 * k ** 1.6;
    // milky band
    const mb = Math.exp(-(((y - 6 - x * 0.12) / 7) ** 2)) * (0.6 + 0.4 * kit.noise2(x * 0.2, y * 0.3));
    r += 0.002 * mb; g += 0.0025 * mb; b += 0.006 * mb;
    let tree = 0;
    for (const [px, top, hw, base] of PINES) {
      if (y < top || y > base) continue;
      const v = (y - top) / (base - top), tier = 0.55 + 0.45 * kit.fract(v * 4.2);
      const half = hw * v * tier + 0.6;
      const c = clamp(half - Math.abs(x - px) + 0.5);
      if (c > tree) tree = c;
    }
    const f = 1 - tree;
    SKY[q] = r * f; SKY[q + 1] = g * f; SKY[q + 2] = b * f;
    TREE[y * W + x] = tree;
    const dx = x - FX, dy = (y - FY + 9) * 1.25;
    LF[y * W + x] = tree * (y / 58) ** 3 / (1 + (dx * dx + dy * dy) / 1400);
  }
})();

// marshmallow colour ramp: white -> gold -> toasted brown
const RAMP = [[0, 1, 0.95, 0.86], [0.45, 1, 0.66, 0.24], [0.8, 0.78, 0.36, 0.1], [1, 0.6, 0.24, 0.06]];
const TC = [0, 0, 0];
function toastCol(t) {
  t = clamp(t);
  for (let k = 1; k < RAMP.length; k++) if (t <= RAMP[k][0] || k === RAMP.length - 1) {
    const a = RAMP[k - 1], b = RAMP[k], u = clamp((t - a[0]) / (b[0] - a[0]));
    TC[0] = lerp(a[1], b[1], u); TC[1] = lerp(a[2], b[2], u); TC[2] = lerp(a[3], b[3], u); return TC;
  }
  return TC;
}

// tongue anchors on each glyph's top: [u, v] three per digit
const ANCH = [];
for (let g = 0; g < 10; g++) {
  const a = [];
  for (const u of [4, 8, 12]) {
    let v = 0;
    while (v < GH && dist(g, u, v) > -0.6) v += 0.5;
    if (v >= GH) { v = 0; while (v < GH && dist(g, 8, v) > -0.6) v += 0.5; a.push([8, v]); } else a.push([u, v]);
  }
  ANCH.push(a);
}

// ------------------------------------------------------------ fire
const FIRE = [kit.hex('#5a0a00'), kit.hex('#e83a04'), kit.hex('#ffa020'), kit.hex('#fff0b0')];
function fireCol(h, out) {
  const t = clamp(h) * 3, i = Math.min(2, t | 0), u = t - i, a = FIRE[i], b = FIRE[i + 1];
  out[0] = lerp(a[0], b[0], u); out[1] = lerp(a[1], b[1], u); out[2] = lerp(a[2], b[2], u);
}
const FC = [0, 0, 0];
// The fire is a heat field built from licking tongues and detached puffs,
// combined with a soft max, then mapped through the fire colour ramp.
const FH = new Float32Array(W * H);
function heatTongue(x, y, h, w, lean, hmax, t, seed) {
  if (h < 1) return;
  const X0 = Math.max(0, Math.floor(x - w - Math.abs(lean) - 2)), X1 = Math.min(W - 1, Math.ceil(x + w + Math.abs(lean) + 2));
  const Y0 = Math.max(0, Math.floor(y - h)), Y1 = Math.min(H - 1, Math.ceil(y + 1));
  for (let py = Y0; py <= Y1; py++) {
    const v = (y - py) / h;
    if (v > 1) continue;
    const vv = v < 0 ? 0 : v;
    const wob = (kit.noise2(seed + t * 5.5, py * 0.35) - 0.5) * 2.2 * vv;
    const cx = x + lean * vv * vv + wob;
    const hw = w * Math.pow(1 - vv, 0.75) * (0.75 + 0.25 * Math.min(1, vv * 6 + 0.3)) + 0.25;
    for (let px = X0; px <= X1; px++) {
      const d = Math.abs(px - cx) / hw;
      if (d >= 1.2) continue;
      const e = clamp((1.15 - d) * 2.5) * (1 - d * d * 0.5);
      const ht = hmax * e * (1 - 0.55 * vv);
      if (ht <= 0) continue;
      const q = py * W + px;
      FH[q] = 1 - (1 - FH[q]) * (1 - ht);
    }
  }
}
function drawFire(t, flare, dim) {
  const Hf = 30 + 22 * flare, X0 = FX - 22, X1 = FX + 22, Y0 = Math.max(0, Math.floor(FY - Hf * 1.7));
  for (let y = Y0; y <= FY + 2; y++) FH.fill(0, y * W + X0, y * W + X1 + 1);
  const lean = (kit.noise2(t * 0.35, 3) - 0.5) * 7;
  const N = 9;
  for (let i = 0; i < N; i++) {
    const o = (i - (N - 1) / 2) / ((N - 1) / 2), env = 1 - 0.75 * o * o;
    const n = kit.noise2(i * 7.1, t * (1.6 + 0.2 * i));
    const h = Hf * env * (0.4 + 0.75 * n) * (1 + 0.15 * flare);
    const x = FX + o * (9 + 1 * flare) + (kit.noise2(i, t * 0.9) - 0.5) * 2;
    heatTongue(x, FY + 1, h, (2.6 + 1.6 * env) * (1 + 0.1 * flare), lean * env + o * 2, 0.45 + 0.4 * env, t, i * 13);
  }
  // inner hot core
  heatTongue(FX + lean * 0.1, FY + 1, Hf * (0.42 + 0.1 * kit.noise2(t * 2.2, 9)), 6.5, lean * 0.4, 0.75, t, 99);
  // puffs that pinch off the tips and rise
  for (let i = 0; i < 6; i++) {
    const P = 0.7 + 0.25 * kit.hash(i, 5), a = kit.fract(t / P + i / 6), cyc = Math.floor(t / P + i / 6);
    const x = FX + (kit.hash(i, cyc) - 0.5) * 12 + lean * (0.6 + a);
    const y = FY - Hf * (0.6 + 0.55 * a);
    heatTongue(x, y + 3 * (1 - a), 6 * (1 - a) + 1, 2.2 * (1 - a) + 0.4, lean * 0.2, 0.55 * (1 - a), t, i * 31);
  }
  for (let y = Y0; y <= FY + 2 && y < H; y++) for (let x = X0; x <= X1; x++) {
    const ht = FH[y * W + x];
    if (ht < 0.04) continue;
    fireCol(Math.min(1, ht * 1.05), FC);
    const a = sst(0.04, 0.3, ht) * dim;
    addPx(x, y, FC[0] * a, FC[1] * a, FC[2] * a);
  }
}
/** A small flame tongue at (x, y) (base), height h, leaning `lean` px at the tip. */
function tongue(x, y, h, w, lean, t, seed, a) {
  if (a <= 0.01 || h < 0.5) return;
  const X0 = Math.floor(x - w - Math.abs(lean) - 1), X1 = Math.ceil(x + w + Math.abs(lean) + 1);
  const Y0 = Math.floor(y - h - 1), Y1 = Math.ceil(y + 1.5);
  for (let py = Y0; py <= Y1; py++) {
    if (py < 0 || py >= H) continue;
    const v = (y - py) / h;
    if (v < -0.3 || v > 1) continue;
    const wob = (kit.noise2(seed + t * 7, py * 0.4) - 0.5) * 1.6 * v;
    const cx = x + lean * v * v + wob, ww = w * (v < 0 ? 1 + v * 2.5 : Math.pow(1 - v, 0.7));
    for (let px = X0; px <= X1; px++) {
      const d = Math.abs(px - cx) / Math.max(0.3, ww);
      let heat = (1 - d) * (1 - 0.7 * v);
      if (heat <= 0) continue;
      fireCol(0.25 + heat * 0.8, FC);
      const k = a * sst(0, 0.4, heat);
      addPx(px, py, FC[0] * k, FC[1] * k, FC[2] * k);
    }
  }
}

// ------------------------------------------------------------ marshmallow
/**
 * Draw numeral g as a marshmallow centred at (cx, cy), rotated ang, scaled
 * sc (and squash sx, sy). toast 0..1, char 0..1 (burnt), a alpha.
 */
function mallow(g, cx, cy, ang, sc, sx, sy, toast, char, a, t, glow) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const ex = sc * sx * MS, ey = sc * sy * MS, reach = (Math.hypot(GW, GH) / 2 + 3) * Math.max(ex, ey);
  const X0 = Math.max(0, Math.floor(cx - reach)), X1 = Math.min(W - 1, Math.ceil(cx + reach));
  const Y0 = Math.max(0, Math.floor(cy - reach)), Y1 = Math.min(H - 1, Math.ceil(cy + reach));
  const MOAT = 1.7, k = Math.min(ex, ey);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / ex + GW / 2, v = (-dx * s + dy * c) / ey + GH / 2;
    const d = sample(g, u, v) * k;
    if (d > MOAT) continue;
    const p = y * W + x, q = 3 * p;
    if (d > 0) {                       // dark moat round the numeral
      const f = 1 - 0.85 * a * (1 - d / MOAT);
      img[q] *= f; img[q + 1] *= f; img[q + 2] *= f;
      if (d > 0.5) continue;
    }
    const cov = clamp(0.5 - d) * a;
    if (cov <= 0) continue;
    const depth = clamp(-d / (R * k));
    // outward normal to screen
    const nx = S.gx * c - S.gy * s, ny = S.gx * s + S.gy * c;
    let fx = FL.x - x, fy = FL.y - 6 - y; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    const face = nx * fx + ny * fy, edge = 1 - depth;
    // the fire side toasts first, and the crust darkens at the edges
    const tl = toast * (0.82 + 0.3 * face * edge) + 0.12 * toast * edge;
    toastCol(tl);
    let r = TC[0], gg = TC[1], b = TC[2];
    if (char > 0) {
      const ch = clamp(char * (0.7 + 0.5 * edge));
      r = lerp(r, 0.07, ch); gg = lerp(gg, 0.022, ch); b = lerp(b, 0.008, ch);
    }
    const L = lightAt(x, y);
    const pillow = 0.5 + 0.5 * Math.sqrt(depth) - 0.12 * Math.max(0, -ny) * edge * 0;
    let sh = pillow * (0.5 + 0.5 * Math.min(1.4, L)) + Math.max(0, face) * edge * 0.55 * L;
    // a soft sheen on top, away from the fire
    sh += 0.1 * Math.max(0, -ny) * edge;
    let R0 = r * sh, G0 = gg * sh, B0 = b * sh;
    if (char > 0.2) {                  // embers in the char
      const e = char * Math.max(0, kit.noise2(u * 0.7 + t * 1.5, v * 0.7) - 0.5) * 2.2 * (0.5 + edge) * glow;
      R0 += 0.9 * e; G0 += 0.22 * e; B0 += 0.02 * e;
    }
    put(p, R0, G0, B0, cov);
  }
}

// ------------------------------------------------------------ kids
const mxf = (side, x) => (side < 0 ? x : 127 - x);
/**
 * One kid. st: lean (px toward fire), bob, cheek (0..1.6), mouth mode
 * ('smile','o','wide','chew'), eyes: blink 0..1, wide 0..1, look up 0..1, happy 0..1.
 */
function drawKid(K, st, t) {
  const sd = K.side, X = (x) => mxf(sd, x), L = st.lean, B = st.bob, E = 0.32;
  // log seat
  capsule(X(-2), 57, X(24), 57, 3.4, BARK, 0.7, 1, 0.08);
  capsule(X(22.5), 55.6, X(24.5), 58.4, 0.8, WOOD, 0.4, 1, 0.1);
  // legs
  capsule(X(10.5), 51.5 + B, X(18.5), 50 + B * 0.5, 2.8, JEANS, 0.9, 1, 0.15);
  capsule(X(18.5), 50 + B * 0.5, X(19.5), 58, 2.4, JEANS, 0.9, 1, 0.15);
  ellipse(X(21), 59.2, 3, 1.6, [0.35, 0.2, 0.12], 0.6, 1, 0.1);
  // body
  ellipse(X(10 + L * 0.4), 46.5 + B, 6.2, 7, K.coat, 1, 1, E);
  // head
  const hx = 11 + L, hy = 32.5 + B - st.up * 0.8;
  ellipse(X(hx), hy, 7.4, 7.0, K.skin, 1.1, 1, E);
  const ck = st.cheek;
  // cheek blush always, swollen cheeks when eating
  ellipse(X(hx + 4.4 + ck * 0.7), hy + 3.2, 2.6 + ck * 2.6, 2.1 + ck * 2.1, K.skin, 1.1, 1, E + 0.05 * ck);
  ellipse(X(hx + 4.6 + ck * 0.8), hy + 3.0, 1.4 + ck * 1.2, 0.9 + ck * 0.8, [1, 0.3, 0.28], 0.3, 0.5, 0.3);
  if (ck > 0.02) ellipse(X(hx - 3), hy + 3, 1.6 * ck, 1.5 * ck, K.skin, 0.6, 1, E);
  // hat: beanie with a turned-up band and a bobble
  ellipse(X(hx - 0.4), hy - 3.2, 7.9, 6.0, K.hat, 0.9, 1, E, hy - 3.2);
  capsule(X(hx - 7.4), hy - 3.0, X(hx + 6.8), hy - 3.0, 1.6, kit.scale(K.hat, 0.7), 0.7, 1, E);
  ellipse(X(hx - 2), hy - 10.4, 2.3, 2.2, K.pom, 0.7, 1, E);
  // eyes (3/4 view toward the fire)
  const ey = hy + 0.2 - st.up * 1.6;
  for (const ex of [hx + 1.3, hx + 5.2]) {
    const big = st.wide, open = Math.max(0, (1 - st.blink) * (1 - st.happy));
    if (open > 0.08) {
      ellipse(X(ex), ey, 1.5 + big * 0.6, (2.0 + big * 0.6) * open, [1, 0.96, 0.9], 0, 1, 0.45);
      ellipse(X(ex + 0.55 - big * 0.4), ey + 0.3 - st.up * 0.8, 1.0 - big * 0.3, (1.5 - big * 0.4) * open, [0, 0, 0], 0, 1);
    }
    if (open < 0.92) capsule(X(ex - 1.1), ey + 0.2 - st.happy * 0.5, X(ex + 1.1), ey + 0.2 - st.happy * 0.5, 0.5, [0.06, 0.02, 0.02], 0, 1 - open);
    if (open > 0.5) addPx(Math.round(X(ex + 0.6)), Math.round(ey - 0.8 - st.up * 0.5), 0.5, 0.45, 0.4);
  }
  // nose
  ellipse(X(hx + 7.3), hy + 1.4, 1.2, 1.2, K.skin, 1.3, 1, E);
  // mouth
  const mx = hx + 4.6 + ck * 0.3, my = hy + 4.4;
  const M = [0.16, 0.02, 0.02];
  if (st.mouth === 'o') ellipse(X(mx + 0.8), my, 1.3, 1.3, M, 0);
  else if (st.mouth === 'wide') ellipse(X(mx + 0.4), my, 1.4 * st.open + 0.6, 2.4 * st.open + 0.5, M, 0);
  else if (st.mouth === 'chew') capsule(X(mx - 1), my + 0.3 * Math.sin(t * 22), X(mx + 1.2), my - 0.3 * Math.sin(t * 22), 0.5, M, 0);
  else { capsule(X(mx - 1.4), my - 0.5, X(mx), my + 0.3, 0.5, M, 0); capsule(X(mx), my + 0.3, X(mx + 1.3), my - 0.5, 0.5, M, 0); }
  // arm out to the stick
  capsule(X(12.5 + L * 0.5), 43.5 + B, X(HAND[0] - 1), HAND[1] + 0.6 + st.jerk * 0.5, 2.0, K.coat, 0.9, 1, E);
}
function drawHand(K, st) {
  ellipse(mxf(K.side, HAND[0]), HAND[1] + st.jerk * 0.4, 1.8, 1.7, K.skin, 1, 1, 0.22);
}
/** The marshmallow bag at the kid's feet. */
function drawBag(side, pop) {
  const X = (x) => mxf(side, x);
  ellipse(X(27.5), 59.5, 4.2, 4.3, BAG, 0.7, 1, 0.12);
  capsule(X(24), 59.5, X(31), 59.5, 0.9, BAGBAND, 0.4);
  ellipse(X(27.6), 55.6 - pop * 1.2, 2.2, 1.3, kit.scale(BAG, 0.8), 0.5);
}

// ------------------------------------------------------------ the turn
// p: seconds from the minute boundary (negative before it)
const T_FIRE = -4.4, T_START = -2.8, T_BLOW = -2.5, T_OUT = -1.6, T_FLICK = -1.35, T_FLY = 0.8, T_NEW = -0.45, T_NEWFLY = 0.75, T_GULP = 3.2;
const flightOff = [0, 0.32];                       // inner first, then tip
function slotPos(k, ang) {
  const sd = SLOTS[k].side, s = SLOT_S[SLOTS[k].s];
  const x = HAND[0] + Math.cos(ang) * s, y = HAND[1] + Math.sin(ang) * s;
  return [mxf(sd, x), y, (sd < 0 ? ang : -ang) * TILT];
}
function mouthPos(side, st) { return [mxf(side, 11 + st.lean + 4.8), 32.5 + st.bob + 4.4]; }
/** Parabola from a to b with apex lift, at u 0..1. */
function arcPt(a, b, lift, u) {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - lift * 4 * u * (1 - u)];
}

// toast of the digit in slot k at date d: fraction of its own period
function toastOf(k, d) {
  const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes(), h = d.getHours();
  if (k === 3) return s / 60;
  if (k === 2) return ((m % 10) * 60 + s) / 600;
  if (k === 1) return (m * 60 + s) / 3600;
  return ((h % 10) + m / 60) / 10;
}

const KST = [0, 1].map(() => ({ lean: 0, bob: 0, cheek: 0, mouth: 'smile', open: 0, blink: 0, wide: 0, up: 0, happy: 0, jerk: 0 }));

export default {
  name: 'Campfire',
  blurb: 'two kids toast marshmallow numerals over a fire; the burnt one is swallowed whole and a fresh one flies from the bag',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const date = ctx.date, now = date.getTime() / 1000, t = now;
    const sec = date.getSeconds() + date.getMilliseconds() / 1000;
    const dim = 1 - 0.55 * ctx.night;
    // the event: the boundary nearest ahead (or just passed)
    const Bnd = (sec >= 30 ? Math.floor(now / 60) + 1 : Math.floor(now / 60)) * 60;
    const p = now - Bnd;
    const oldD = digitsOf(new Date((Bnd - 60) * 1000)), newD = digitsOf(new Date(Bnd * 1000));
    const hourTurn = new Date(Bnd * 1000).getMinutes() === 0;
    const changed = [0, 1, 2, 3].map((k) => oldD[k] !== newD[k]);
    const kidBusy = [changed[0] || changed[1], changed[2] || changed[3]];
    const nEaten = [(changed[0] ? 1 : 0) + (changed[1] ? 1 : 0), (changed[2] ? 1 : 0) + (changed[3] ? 1 : 0)];

    // hour flare
    const flare = hourTurn ? sst(-5, -4.2, p) * (1 - sst(1, 4, p)) : 0;
    FL.k = (1.05 + 0.18 * (kit.noise2(t * 5, 1) - 0.5) + 0.08 * Math.sin(t * 17)) * (1 + 0.6 * flare);
    FL.amb = 0.035; FL.x = FX; FL.y = FY - 9;

    // sky
    img.set(SKY);
    for (let p2 = 0; p2 < W * H; p2++) {
      const f = LF[p2];
      if (f <= 0) continue;
      const k = f * FL.k * 0.35, q = 3 * p2;
      img[q] += PINE[0] * k * 1.6; img[q + 1] += PINE[1] * k; img[q + 2] += PINE[2] * k;
    }
    for (const [x, y, b, ph, sp] of STARS) {
      if (TREE[Math.round(y) * W + Math.round(x)] > 0.3) continue;
      const tw = b * (0.6 + 0.4 * Math.sin(t * sp + ph)) * 0.16;
      glowDot(x, y, 1.1, tw * 0.8, tw * 0.85, tw);
    }
    // shooting star at the hour
    if (hourTurn && p > -9 && p < -5.5) {
      const u = (p + 9) / 3.5, e = kit.ease.inOut(u);
      const hx = lerp(122, 8, e), hy = lerp(3, 17, e) + 6 * e * e;
      for (let k = 0; k < 24; k++) {
        const v = k / 24, ee = Math.max(0, e - v * 0.3);
        const x = lerp(122, 8, ee), y = lerp(3, 17, ee) + 6 * ee * ee;
        const a = (1 - v) ** 1.5 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.9;
        glowDot(x, y, 1.6, a * 0.7, a * 0.8, a);
      }
      const hb = Math.sin(Math.PI * Math.min(1, u * 1.15));
      glowDot(hx, hy, 2.4, 1.4 * hb, 1.4 * hb, 1.3 * hb);
    }
    // owl in the right pine: two eyes, blinking, looking round
    {
      const blink = kit.hash(Math.floor(t / 4.3), 7) > 0.3 ? sst(0, 0.08, kit.fract(t / 4.3) * 4.3) * (1 - sst(0.12, 0.22, kit.fract(t / 4.3) * 4.3)) : 0;
      const look = Math.sin(t * 0.37) * 0.9;
      const ox = 117 + look * 0.4, oy = 10.5;
      ellipse(ox, oy + 3, 3.4, 4.4, [0.3, 0.2, 0.13], 0.3, 1, 0.12);
      capsule(ox - 7, oy + 7.6, ox + 6, oy + 7.2, 0.8, [0.25, 0.15, 0.08], 0, 1, 0.12);
      ellipse(ox - 2.3, oy - 1.4, 0.9, 1.4, [0.3, 0.2, 0.13], 0, 1, 0.12);
      ellipse(ox + 2.3, oy - 1.4, 0.9, 1.4, [0.3, 0.2, 0.13], 0, 1, 0.12);
      for (const sx of [-1.9, 1.9]) {
        const op = 1 - blink;
        if (op > 0.05) {
          ellipse(ox + sx, oy + 0.4, 1.3, 1.3 * op, [0.75, 0.42, 0.02], 0, 1, 0.9);
          addPx(Math.round(ox + sx + look * 0.6), Math.round(oy + 0.4), -1, -1, -1);
        }
      }
    }
    // ground, lit by the fire
    for (let y = 52; y < H; y++) for (let x = 0; x < W; x++) {
      const e = clamp((y - 52.5 - 1.2 * Math.sin(x * 0.11) - 0.8 * Math.sin(x * 0.29 + 1)) * 0.9);
      if (e <= 0) continue;
      const Lg = lightAt(x, y) * (0.75 + 0.25 * kit.noise2(x * 0.5, y * 0.7));
      put(y * W + x, DIRT[0] * Lg * 0.5, DIRT[1] * Lg * 0.5, DIRT[2] * Lg * 0.5, e);
    }
    // fire pit: back stones, logs, flames, front stones
    for (let k = 0; k < 7; k++) ellipse(FX - 13 + k * 4.3, 55.2, 2.4, 1.6, STONE, 0.6, 1, 0, 1e9);
    capsule(FX - 14, 59, FX + 8, 53.5, 2.6, BARK, 0.9, 1, 0.12);
    capsule(FX + 14, 59, FX - 8, 53.5, 2.6, BARK, 0.9, 1, 0.12);
    ellipse(FX - 14.5, 59.1, 2.4, 2.4, WOOD, 0.6, 1, 0.2);
    ellipse(FX + 14.5, 59.1, 2.4, 2.4, WOOD, 0.6, 1, 0.2);
    for (let k = 0; k < 9; k++) {                 // glowing embers on the logs
      const ex = FX - 9 + k * 2.3, eyy = 56.8 + Math.abs(k - 4) * 0.4;
      const g = Math.max(0, kit.noise2(k * 3.1, t * 1.3) - 0.35) * 0.9 * dim;
      glowDot(ex, eyy, 1.6, g, g * 0.25, g * 0.02);
    }
    drawFire(t, flare, 1);
    for (let k = 0; k < 6; k++) ellipse(FX - 11 + k * 4.4, 60.6, 2.6, 1.8, STONE, 0.7);
    // sparks
    const nSp = 22 + Math.round(30 * flare);
    for (let k = 0; k < nSp; k++) {
      const P = 1.4 + 1.6 * kit.hash(k, 11), a = kit.fract(t / P + kit.hash(k, 12));
      const cyc = Math.floor(t / P + kit.hash(k, 12));
      const rise = (30 + 14 * kit.hash(k, cyc)) * (1 + flare);
      const x = FX + (kit.hash(k, cyc, 3) - 0.5) * 10 + Math.sin(a * 5 + k) * 3 * a + (kit.noise2(k, t * 0.5) - 0.5) * 8 * a;
      const y = FY - 8 - a * rise;
      const b = (1 - a) ** 1.6 * (0.5 + 0.5 * kit.hash(k, Math.floor(t * 12))) * 0.8;
      glowDot(x, y, 1.15, b, b * 0.42, b * 0.06);
    }

    // kid states
    for (let s = 0; s < 2; s++) {
      const st = KST[s], busy = kidBusy[s];
      const ph = t * 0.9 + s * 2.1;
      st.bob = 0.35 * Math.sin(ph); st.lean = 0.4 * Math.sin(t * 0.31 + s); st.cheek = 0; st.mouth = 'smile';
      st.open = 0; st.wide = 0; st.happy = 0; st.jerk = 0;
      const bt = kit.fract(t / 3.7 + s * 0.4) * 3.7; st.blink = bt < 0.14 ? Math.sin(bt / 0.14 * Math.PI) : 0;
      st.up = hourTurn ? sst(-9.2, -8.4, p) * (1 - sst(-5.6, -4.8, p)) : 0;
      if (busy && p > T_FIRE && p < T_GULP + 0.6) {
        st.wide = sst(T_START, T_START + 0.15, p) * (1 - sst(T_OUT, T_OUT + 0.3, p));
        st.bob += -1.2 * Math.exp(-(((p - T_START - 0.12) / 0.12) ** 2));
        const blow = sst(T_BLOW - 0.15, T_BLOW, p) * (1 - sst(T_OUT - 0.1, T_OUT + 0.1, p));
        st.lean += 2.2 * blow;
        if (blow > 0.3) st.mouth = 'o';
        st.jerk = -3 * Math.exp(-(((p - T_FLICK - 0.08) / 0.1) ** 2));
        const lastLand = T_FLICK + flightOff[nEaten[s] > 1 ? 1 : 0] + T_FLY;
        if (p > T_FLICK && p < lastLand) { st.mouth = 'wide'; st.open = sst(T_FLICK, T_FLICK + 0.3, p) * (1 - sst(lastLand - 0.06, lastLand, p)); st.lean += 1; }
        if (p >= lastLand - 0.1) {
          const ch = sst(lastLand - 0.15, lastLand, p) * (1 - sst(T_GULP - 0.25, T_GULP, p));
          st.cheek = ch * (nEaten[s] > 1 ? 1.6 : 1.15) * (1 + 0.12 * Math.sin((p - lastLand) * 14));
          st.happy = ch; if (ch > 0.05) st.mouth = 'chew';
          st.bob += 0.4 * ch * Math.sin((p - lastLand) * 14);
        }
        st.blink = st.wide > 0 ? 0 : st.blink;
      }
    }
    for (let s = 0; s < 2; s++) drawBag(KIDS[s].side, 0);
    for (let s = 0; s < 2; s++) drawKid(KIDS[s], KST[s], t);

    // sticks
    const angs = [0, 1].map((s) => A0 + 0.022 * Math.sin(t * 0.8 + s * 1.7) + KST[s].jerk * 0.025);
    for (let s = 0; s < 2; s++) {
      const sd = KIDS[s].side, a = angs[s];
      const bx = HAND[0] - Math.cos(a) * 5, by = HAND[1] - Math.sin(a) * 5;
      const tx = HAND[0] + Math.cos(a) * STICK_LEN, ty = HAND[1] + Math.sin(a) * STICK_LEN;
      capsule(mxf(sd, bx), by, mxf(sd, tx), ty, 0.8, WOOD, 0.8, 1, 0.15);
      glowDot(mxf(sd, tx), ty, 1.2, 0.3, 0.05, 0);
    }

    // marshmallows
    for (let k = 0; k < 4; k++) {
      const sl = SLOTS[k], s = sl.side < 0 ? 0 : 1, [cx, cy, ang] = slotPos(k, angs[s]);
      const tt = toastOf(k, date);
      if (!changed[k] || p < T_FIRE || p > 2 * T_NEWFLY + 1.6) {
        // at rest (during the event an unchanged digit just sits)
        const dg = +(p < 0 ? oldD[k] : newD[k]);
        mallow(dg, cx, cy, ang, 1 + 0.07 * tt, 1, 1, tt, 0, 1, t, 0);
        continue;
      }
      const off = flightOff[sl.s === 0 ? 0 : (changed[k + (s === 0 ? -1 : 1)] ? 1 : 0)];
      const og = +oldD[k], ng = +newD[k];
      const tFl = T_FLICK + off, tLand = tFl + T_FLY;
      if (p < tFl) {
        // burning, blown out, charred, still on the stick
        const fa = sst(T_FIRE, T_FIRE + 1.2, p) * (1 - sst(T_BLOW + 0.2, T_OUT, p));
        const chr = sst(T_FIRE + 0.4, T_OUT, p);
        mallow(og, cx, cy, ang, 1.07 + 0.05 * chr, 1, 1, 0.97, chr, 1, t, 1);
        const blowing = sst(T_BLOW, T_BLOW + 0.3, p) * (1 - sst(T_OUT, T_OUT + 0.2, p));
        const c = Math.cos(ang), sn = Math.sin(ang);
        for (let j = 0; j < 3; j++) {
          const [u, v] = ANCH[og][j], lu = u - GW / 2, lv = v - GH / 2;
          const ax = cx + lu * c - lv * sn, ay = cy + lu * sn + lv * c;
          const hgt = (5 + 2.5 * kit.noise2(t * 6, j * 4 + k)) * fa;
          tongue(ax, ay + 1, hgt, 1.9, -sl.side * (1 + 6 * blowing), t, k * 7 + j, fa * 0.9 * dim);
        }
        // smoke after it is blown out
        const sm = sst(T_OUT - 0.4, T_OUT, p) * (1 - sst(tFl - 0.2, tFl + 0.3, p));
        for (let j = 0; j < 5; j++) {
          const age = kit.fract(t * 0.8 + j / 5);
          const sx = cx + Math.sin(age * 4 + j) * 2 - sl.side * age * 4, sy = cy - 12 - age * 14;
          const a = sm * (1 - age) * 0.05;
          glowDot(sx, sy, 2 + age * 3, a, a * 0.95, a * 0.9);
        }
        // breath puffs from the kid's mouth
        if (blowing > 0.01) {
          const m = mouthPos(sl.side, KST[s]);
          for (let j = 0; j < 7; j++) {
            const u = kit.fract(t * 2.6 + j / 7), bx = lerp(m[0] - sl.side * 1.5, cx + sl.side * 3, u), by = lerp(m[1], cy - 4, u) + Math.sin(u * 6 + j) * 1.2;
            const a = blowing * Math.sin(u * Math.PI) * 0.08;
            glowDot(bx, by, 1.3 + u * 1.5, a * 0.8, a * 0.9, a);
          }
        }
      } else if (p < tLand) {
        // flicked off: a tumbling arc into the kid's mouth
        const u = (p - tFl) / T_FLY, m = mouthPos(sl.side, KST[s]);
        const [x, y] = arcPt([cx, cy], m, 7 + 5 * sl.s, kit.ease.inOut(u) * 0.3 + u * 0.7);
        const sc = lerp(1.05, 0.3, sst(0.35, 1, u));
        mallow(og, x, y, ang - sl.side * Math.sin(u * 3) * 0.5, sc, 1, 1, 0.97, 1, 1, t, 0.6);
      }
      // the fresh one: out of the bag, arcing up and onto the stick
      const both = changed[k + (s === 0 ? (sl.s === 0 ? 1 : -1) : (sl.s === 0 ? -1 : 1))];
      // the new numeral leaves the bag only once the old one is swallowed
      const n0 = Math.max(T_NEW + (sl.s === 0 && both ? 0.3 : 0), tLand + 0.05), n1 = n0 + T_NEWFLY;
      if (p >= n0) {
        const bag = [mxf(sl.side, 27.6), 55.5];
        if (p < n1) {
          const u = (p - n0) / T_NEWFLY;
          const [x, y] = arcPt(bag, [cx, cy], sl.s ? 15 : 9, u);
          const sc = lerp(0.35, 1, sst(0, 0.5, u));
          const spin = sl.side * Math.sin(u * Math.PI) * 0.45;
          mallow(ng, x, y, ang + spin, sc, 1, 1, 0, 0, 1, t, 0);
        } else {
          const w = p - n1, sq = 0.2 * Math.exp(-w * 5) * Math.cos(w * 22);
          mallow(ng, cx, cy, ang, 1 + 0.07 * tt, 1 + sq, 1 - sq, tt, 0, 1, t, 0);
        }
      }
    }
    for (let s = 0; s < 2; s++) drawHand(KIDS[s], KST[s]);

    for (let q = 0; q < img.length; q++) if (img[q] < 0) img[q] = 0;
    kit.blitGrid(ctx, img, dim);
  },
};
