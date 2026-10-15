// The lunar set of mochi.js: the landscape, the props, the light, the
// rabbits and the kine.
//
// The landscape is painted twice at load (sun from the left, sun from the
// right) into plain RGB tables, with a class per pixel (sky, star, regolith,
// wood). Once a minute (at :30, when nothing else happens) the background
// buffer is rebuilt from them: the two are blended by the sun's side and
// each class is multiplied by the hour's light (white sun, a warm low sun,
// blue earthshine), ordered-dithered into RGB565 with integer maths, and
// the Earth is drawn in its phase. On the device the two tables live in
// flash: 2 x 12,800 x 3 bytes = 75 KB, plus 12.8 KB of classes.

import { Gfx, hex, R, G, B, rgb, mix, clamp, rand, noise2, rng, sin, cos, from565 } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ layout
export const MORTAR = { cx: 105, rim: 55, rx: 25, ry: 4.5, hx: 21, hy: 3.2, base: 73 };
export const TRAY = { x0: 3, x1: 55, top: 58 };
export const ROCK = { cx: 145, top: 56 };
export const EARTH = { cx: 41, cy: 12, r: 8.5 };

const SKY_TOP = hex('0a0b26'), SKY_LOW = hex('262a58');
const REG_FAR = hex('8c8a96'), REG_NEAR = hex('b4b2b4'), REG_DARK = hex('5c5a6c'), REG_LIT = hex('dedad6');
const WOOD = hex('8e5a34'), WOOD_DK = hex('5e3a22'), WOOD_LT = hex('b88250'), HOLLOW = hex('2e1a12');
const HINOKI = hex('e2bc88'), HINOKI_MD = hex('c89c64'), HINOKI_DK = hex('8e6a40');
export const OUTLINE = hex('1c1530');
const ROCK_C = hex('9a98a4'), ROCK_DK = hex('5e5c70'), ROCK_LT = hex('d0ccd0');

// classes
function polyIn(pts, px, py) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const C_SKY = 0, C_STAR = 1, C_REG = 2, C_WOOD = 3;

function ridgeY(x) {
  // the far crater wall: a long low rim with a shoulder
  return 49 - 3.2 * Math.exp(-(((x - 120) / 26) ** 2)) - 1.6 * Math.exp(-(((x - 30) / 18) ** 2)) + 0.8 * Math.sin(x * 0.21) + 0.5 * Math.sin(x * 0.53 + 1);
}

const CRATERS = [[105, 51.5, 27, 4.2], [22, 75.5, 13, 3.4], [92, 77.5, 8, 1.9], [150, 78.5, 9, 1.8], [62, 53.5, 5, 1.1], [8, 54, 4, 0.9], [128, 52.5, 3.5, 0.8], [40, 70.5, 3.2, 0.9]];

/** Paint the static set with the sun on `side` (-1 left, +1 right) into c; mark classes. */
function paintSet(c, side, cls) {
  c.gradient(0, 0, W, 52, [SKY_TOP, [0.75, hex('161842')], SKY_LOW]);
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const x = (r() * W) | 0, y = (r() * 46) | 0, b = r();
    if (Math.hypot(x - EARTH.cx, y - EARTH.cy) < EARTH.r + 3) continue;
    c.pixel(x, y, mix(hex('3a3c70'), hex('fff6e8'), b * b));
    if (cls) cls[y * W + x] = C_STAR;
  }
  // the regolith: far wall, then the plain, lighter towards us, speckled
  c.paint((px, py, x, y) => {
    const ry = ridgeY(px);
    if (py < ry) return -1;
    const near = clamp((py - ry) / 30, 0, 1);
    let col = mix(REG_FAR, REG_NEAR, near);
    // the rim's top edge catches the sun
    if (py - ry < 1.2) col = mix(col, REG_LIT, 0.55);
    const n = noise2(px * 0.5, py * 1.1, 3) - 0.5, sp = rand(x, y, 9);
    col = mix(col, n > 0 ? REG_LIT : REG_DARK, Math.abs(n) * 0.45 + (sp > 0.96 ? 0.15 : 0));
    if (cls) cls[y * W + x] = C_REG;
    return col;
  });
  // craters: a dark floor, the wall facing the sun lit, the near wall in shadow
  for (const [cx, cy, rx, ry] of CRATERS) {
    c.fillEllipse(cx, cy, rx + 1, ry + 0.6, mix(REG_NEAR, REG_LIT, 0.4), { aa: true, a: 0.7 });
    c.fillEllipse(cx, cy, rx, ry, mix(REG_DARK, REG_FAR, 0.35), { aa: true });
    c.fillWhere((px, py) => {
      const u = (px - cx) / rx, v = (py - cy) / ry;
      if (u * u + v * v > 1) return false;
      const w = (px - cx + side * rx * 0.45) / (rx * 0.85), q = (py - cy) / (ry * 0.9);
      return w * w + q * q > 1 ? 0 : 0.8;
    }, mix(REG_FAR, REG_NEAR, 0.6), [cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2]);
  }
  // shadows of the props, cast away from the sun
  const sh = -side * 7;
  c.fillEllipse(TRAY.x0 + 26 + sh, 72, 28, 2.6, hex('3a3850'), { aa: true, a: 0.55 });
  c.fillEllipse(MORTAR.cx + sh, 74, 27, 2.8, hex('3a3850'), { aa: true, a: 0.55 });
  c.fillEllipse(ROCK.cx + sh, 75.5, 17, 2.5, hex('3a3850'), { aa: true, a: 0.5 });

  const mark = (x0, y0, x1, y1, test, k = C_WOOD) => {
    if (!cls) return;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test(x + 0.5, y + 0.5)) cls[y * W + x] = k;
  };
  // the boulder the pounder stands on (regolith class: it is moon)
  // a rounded boulder, shaded as a lumpy sphere, with a dark keyline and two pits
  const RX = 16.5, RY = 13.5, RCX = 145, RCY = 69;
  const rockD = (px, py) => {
    const u = (px - RCX) / RX, v = (py - RCY) / RY;
    const lump = 0.04 * Math.sin(px * 0.7 + 1) + 0.03 * Math.sin(py * 1.1);
    return (Math.abs(u) ** 2.6 + Math.abs(v) ** 3.2) ** (1 / 2.8) - 1 - lump;
  };
  c.fillWhere((px, py) => (py < 78 ? clamp((0.07 - rockD(px, py)) * RX + 0.5, 0, 1) : 0), OUTLINE, [RCX - RX - 2, RCY - RY - 2, 2 * RX + 4, 24]);
  c.paint((px, py) => {
    const d = rockD(px, py);
    if (d > 0 || py >= 78) return -1;
    const u = (px - RCX) / RX, v = (py - RCY) / RY, w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const lam = clamp(-u * side * 0.55 - v * 0.6 + w * 0.45, 0, 1);
    const n = noise2(px * 0.6, py * 0.6, 21) - 0.5;
    return mix(mix(ROCK_DK, ROCK_C, clamp(lam * 1.4, 0, 1)), ROCK_LT, clamp(lam * 1.6 - 1, 0, 1) + n * 0.25);
  }, [RCX - RX - 1, RCY - RY - 1, 2 * RX + 2, 24]);
  for (const [px, py, pr] of [[139, 67, 2.6], [151.5, 72, 1.8], [146, 61.5, 1.3]]) {
    c.fillEllipse(px, py, pr, pr * 0.6, ROCK_DK, { aa: true, a: 0.8 });
    c.fillEllipse(px - side * 0.6, py + 0.3, pr * 0.75, pr * 0.4, ROCK_C, { aa: true, a: 0.6 });
  }
  mark(126, 54, 160, 78, (px, py) => rockD(px, py) < 0.07, C_REG);

  // the sanbo: a hinoki offering stand with an eye-shaped cut-out
  const T = TRAY;
  c.fillRect(9, 62, 40, 10, HINOKI_MD);
  c.fillRect(side < 0 ? 45 : 9, 62, 4, 10, HINOKI_DK);
  c.fillEllipse(29, 67, 7.5, 2.6, hex('3a2614'), { aa: true });
  c.fillRect(7, 71, 44, 2, HINOKI_DK);
  c.fillRoundRect(T.x0, T.top, T.x1 - T.x0, 4.5, 1.2, HINOKI, { aa: true });
  c.fillRect(T.x0 + 1, T.top + 2, T.x1 - T.x0 - 2, 2, HINOKI_MD);
  c.hline(T.x0 + 1, T.top + 4, T.x1 - T.x0 - 2, HINOKI_DK);
  mark(T.x0, T.top, T.x1, 74, (px, py) => py < T.top + 5 || (px > 7 && px < 51));

  // the usu: a wooden mortar, hourglass body, a thick rim, the hollow
  const M = MORTAR;
  const half = (y) => { const u = (y - M.rim) / (M.base - M.rim); return M.rx - 1 - 3.2 * Math.sin(u * Math.PI) ** 2 - (u > 0.9 ? (u - 0.9) * 10 : 0); };
  c.fillWhere((px, py) => {
    if (py < M.rim || py > M.base) return false;
    const hw = half(py);
    return Math.abs(px - M.cx) <= hw;
  }, WOOD, [M.cx - 26, M.rim, 52, M.base - M.rim + 1]);
  // round shading across the body and grain lines
  c.fillWhere((px, py) => {
    if (py < M.rim || py > M.base) return 0;
    const hw = half(py), u = (px - M.cx) / hw;
    if (Math.abs(u) > 1) return 0;
    return clamp(u * side * 0.9 - 0.15, 0, 0.7);
  }, WOOD_DK, [M.cx - 26, M.rim, 52, M.base - M.rim + 1]);
  c.fillWhere((px, py) => {
    if (py < M.rim || py > M.base) return 0;
    const hw = half(py), u = (px - M.cx) / hw;
    if (Math.abs(u) > 1) return 0;
    return clamp(-u * side * 0.8 - 0.3, 0, 0.45);
  }, WOOD_LT, [M.cx - 26, M.rim, 52, M.base - M.rim + 1]);
  // a vertical sheen on the turned wood, and end grain rings at the foot
  c.fillWhere((px, py) => { if (py < M.rim || py > M.base) return 0; const u = (px - M.cx) / half(py) + side * 0.45; return Math.abs(px - M.cx) <= half(py) ? clamp(0.5 - Math.abs(u) * 3, 0, 0.5) : 0; }, hex('d8a070'), [M.cx - 26, M.rim, 52, M.base - M.rim + 1]);
  c.fillRect(M.cx - 21, 71, 42, 1, WOOD_DK, { a: 0.5 });
  c.fillEllipse(M.cx, M.rim + 1.4, M.rx, M.ry, WOOD_DK, { aa: true, a: 0.6 });
  c.fillEllipse(M.cx, M.rim, M.rx, M.ry, WOOD_LT, { aa: true });
  c.fillEllipse(M.cx, M.rim, M.hx, M.hy, HOLLOW, { aa: true });
  c.fillEllipse(M.cx, M.rim + 0.8, M.hx - 2, M.hy - 1.2, hex('1e100a'), { aa: true });
  mark(M.cx - 26, M.rim - 5, M.cx + 26, M.base + 1, (px, py) => {
    const u = (px - M.cx) / M.rx, v = (py - M.rim) / M.ry;
    return u * u + v * v <= 1 || (py >= M.rim && py <= M.base && Math.abs(px - M.cx) <= half(py) + 0.5);
  });
  return half;
}

// the two lit sets as RGB tables, and the classes
const SET = [new Uint8Array(W * H * 3), new Uint8Array(W * H * 3)];
const CLS = new Uint8Array(W * H).fill(C_REG);
// the mortar's front: the pixels that stand in front of the dough
const FRONT_I = [], FRONT_SET = [[], []];
{
  for (let s = 0; s < 2; s++) {
    const c = new Gfx(W, H);
    const cls = s === 0 ? new Uint8Array(W * H).fill(C_SKY) : null;
    const half = paintSet(c, s === 0 ? -1 : 1, cls);
    if (cls) CLS.set(cls);
    for (let i = 0; i < W * H; i++) {
      const v = from565(c.buf[i]);
      SET[s][i * 3] = R(v); SET[s][i * 3 + 1] = G(v); SET[s][i * 3 + 2] = B(v);
    }
    const M = MORTAR;
    for (let y = M.rim; y <= M.base; y++)
      for (let x = M.cx - 26; x <= M.cx + 26; x++) {
        const px = x + 0.5, py = y + 0.5, u = (px - M.cx) / M.hx, v = (py - M.rim) / M.hy;
        if (u * u + v * v <= 1.02) continue;
        const ou = (px - M.cx) / M.rx, ov = (py - M.rim) / M.ry;
        if (!(ou * ou + ov * ov <= 1.05 || Math.abs(px - M.cx) <= half(py) + 0.5)) continue;
        if (s === 0) FRONT_I.push(y * W + x);
        FRONT_SET[s].push(from565(c.buf[y * W + x]));
      }
  }
}
export const FRONT_N = FRONT_I.length;
const FRONT_IDX = Int32Array.from(FRONT_I);
const FRONT_C = new Uint16Array(FRONT_N);

// ------------------------------------------------------------ light

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The hour's light (h: fractional hours): sun, side, warmth, earthshine. */
export function lightAt(h) {
  const sun = sstep(5.6, 7.2, h) * (1 - sstep(17.8, 19.4, h));
  const side = clamp((h - 12.5) / 5.5, -1, 1);                 // -1 morning (from the left), +1 evening
  const warm = sun * Math.max(1 - sstep(7, 9.5, h), sstep(15.5, 18.2, h));
  const earth = 1 - sun;                                       // earthshine when the sun is down
  // the Earth's phase seen from the moon: full at midnight, a thin crescent at noon
  let ph = ((h / 24) * 2 * Math.PI) % (2 * Math.PI);
  if (ph > Math.PI) ph -= 2 * Math.PI;
  ph = clamp(ph, -2.1, 2.1);
  return { h, sun, side, warm, earth, ph };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const pack = (r, g, b, x, y) => {
  // integer ordered dither to RGB565
  const t = BAYER[((y & 3) << 2) | (x & 3)];
  let r5 = (r * 31 + t * 16) >> 8, g6 = (g * 63 + t * 16) >> 8, b5 = (b * 31 + t * 16) >> 8;
  if (r5 > 31) r5 = 31; if (g6 > 63) g6 = 63; if (b5 > 31) b5 = 31;
  if (r5 < 0) r5 = 0; if (g6 < 0) g6 = 0; if (b5 < 0) b5 = 0;
  return (r5 << 11) | (g6 << 5) | b5;
};

/** Per-class multipliers (x256) and additions for a light. */
function classLight(L) {
  const m = [];
  const day = [256, 256, 256], warm = [270, 236, 196], night = [92, 118, 178], nightWood = [150, 140, 178];
  const lit = (k, n = night) => day.map((d, i) => Math.round((d * (1 - L.warm) + warm[i] * L.warm) * L.sun + n[i] * k * (1 - L.sun)));
  m[C_SKY] = { mul: [256, 256, 256].map((v, i) => Math.round(v * (0.85 + 0.15 * L.sun) + [0, 6, 30][i] * L.earth)), add: [0, 0, 0] };
  m[C_STAR] = { mul: [1, 1, 1].map(() => Math.round(256 * (0.55 + 0.45 * L.earth))), add: [0, 0, 0] };
  m[C_REG] = { mul: lit(1), add: [6, 10, 22].map((v) => Math.round(v * L.earth)) };
  m[C_WOOD] = { mul: lit(1, nightWood), add: [4, 6, 14].map((v) => Math.round(v * L.earth)) };
  return m;
}

/**
 * Rebuild the background canvas `bg` for light L. Charges its integer work
 * to `cost` (the main canvas's, so the estimate sees it).
 */
export function buildBackground(bg, L, cost) {
  const m = classLight(L);
  const k = Math.round((L.side + 1) * 128), k0 = 256 - k;
  const A = SET[0], Bs = SET[1], buf = bg.buf;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 3, q = m[CLS[i]];
      const r = ((((A[j] * k0 + Bs[j] * k) >> 8) * q.mul[0]) >> 8) + q.add[0];
      const g = ((((A[j + 1] * k0 + Bs[j + 1] * k) >> 8) * q.mul[1]) >> 8) + q.add[1];
      const b = ((((A[j + 2] * k0 + Bs[j + 2] * k) >> 8) * q.mul[2]) >> 8) + q.add[2];
      buf[i] = pack(r, g, b, x, y);
    }
  cost.box += W * H * 8;
  // the mortar's front, lit the same way
  const qw = m[C_WOOD];
  for (let n = 0; n < FRONT_N; n++) {
    const i = FRONT_IDX[n], x = i % W, y = (i / W) | 0, ca = FRONT_SET[0][n], cb = FRONT_SET[1][n];
    const r = ((((R(ca) * k0 + R(cb) * k) >> 8) * qw.mul[0]) >> 8) + qw.add[0];
    const g = ((((G(ca) * k0 + G(cb) * k) >> 8) * qw.mul[1]) >> 8) + qw.add[1];
    const b = ((((B(ca) * k0 + B(cb) * k) >> 8) * qw.mul[2]) >> 8) + qw.add[2];
    FRONT_C[n] = pack(r, g, b, x, y);
  }
  cost.box += FRONT_N * 8;
  drawEarth(bg, L);
}

/** The mortar's front rim and body over the dough: a stored run of pixels. */
export function drawMortarFront(g) {
  const buf = g.buf;
  for (let n = 0; n < FRONT_N; n++) buf[FRONT_IDX[n]] = FRONT_C[n];
  g.cost.blit += FRONT_N;
}

// ------------------------------------------------------------ the Earth

const OCEAN = hex('2a64c8'), LAND = hex('5f9a52'), DESERT = hex('c8a86a'), CLOUD = hex('f4f8ff'), NIGHTSIDE = hex('1c2a5c');

function drawEarth(c, L) {
  const E = EARTH;
  // halo: the Earth glows in its own light, more so when full
  const full = 0.5 + 0.5 * Math.cos(L.ph);
  for (let k = 4; k >= 1; k--) c.fillCircle(E.cx, E.cy, E.r + k * 2, hex('4a70d8'), { aa: true, a: 0.12 * full * (1 - k / 5) + 0.015 });
  const sx = Math.sin(L.ph), sz = Math.cos(L.ph);
  const spin = L.h * 0.26;
  // own loop: the disc with an anti-aliased limb (once a minute, ~300 px)
  for (let y = Math.floor(E.cy - E.r - 1); y <= E.cy + E.r + 1; y++)
    for (let x = Math.floor(E.cx - E.r - 1); x <= E.cx + E.r + 1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const nx = (px - E.cx) / E.r, ny = (py - E.cy) / E.r, rr = nx * nx + ny * ny;
      const cov = clamp((1 - Math.sqrt(rr)) * E.r + 0.5, 0, 1);
      if (cov <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - rr));
      const lon = Math.atan2(nx, nz) + spin, lat = ny;
      const land = noise2(lon * 2.2, lat * 3.1, 5), cl = noise2(lon * 3.3 + 1.7, lat * 5.5, 8);
      let col = land > 0.58 ? (Math.abs(lat) < 0.35 && land > 0.7 ? DESERT : LAND) : OCEAN;
      if (cl > 0.6 || Math.abs(lat) > 0.86) col = CLOUD;
      const lit = clamp((nx * sx + nz * sz) * 3 + 0.15, 0, 1);
      col = mix(NIGHTSIDE, col, lit * (0.55 + 0.45 * nz));
      if (rr > 0.72) col = mix(col, hex('8ab8ff'), Math.min(1, (rr - 0.72) * 1.6) * Math.max(lit, 0.15));
      c.put(x, y, col, cov);
    }
}

// ------------------------------------------------------------ rabbits

const BASE = {
  FUR: hex('fbf8f4'), FUR_SH: hex('cfc8da'), EAR_IN: hex('f2a0b0'), EYE: hex('8a1830'), NOSE: hex('e87890'), BLUSH: hex('f6c4cc'), WHITE: 0xffffff,
  KINE: hex('c08850'), KINE_DK: hex('7a5030'), KINE_LT: hex('e2b07a'), HANDLE: hex('a87444'),
};
/** The actors' colours under the current light (set once a minute). */
export const PAL = { ...BASE };
let TM = [256, 256, 256];
/** Tint a colour for the light set by setActorLight. */
export const tint = (c) => rgb((R(c) * TM[0]) >> 8, (G(c) * TM[1]) >> 8, (B(c) * TM[2]) >> 8);
export function setActorLight(L) {
  const day = [256, 256, 256], warm = [266, 240, 210], night = [176, 196, 250];
  TM = day.map((d, i) => Math.round(((d * (1 - L.warm) + warm[i] * L.warm) * L.sun + night[i] * (1 - L.sun))));
  for (const k of Object.keys(BASE)) PAL[k] = tint(BASE[k]);
}

/** A pose block for drawRabbit, reused. */
export function rabbitPose() {
  return { x: 0, y: 0, k: 1, dir: 1, lean: 0, earA: 0, earB: 0, hx: 0, hy: 0, blink: 0, coat: 0, band: -1, crouch: 0, tie: 0, look: 0 };
}

let P = null;
// local (facing right, feet at 0,0, y down) to screen, with the upper body leaning about the hip
function tx(lx, ly, upper) {
  let x = lx, y = ly * (1 - P.crouch * 0.18);
  if (upper) {
    const hx = -1, hy = -4, c = cos(P.lean), s = sin(P.lean);
    const dx = x - hx, dy = y - hy;
    x = hx + dx * c - dy * s; y = hy + dx * s + dy * c;
  }
  return [P.x + P.dir * x * P.k, P.y + y * P.k];
}

function ell(g, lx, ly, rx, ry, col, up, grow) {
  const [x, y] = tx(lx, ly, up);
  g.fillEllipse(x, y, rx * P.k + grow, ry * P.k + grow, col, { aa: true });
}
function cap(g, lx0, ly0, lx1, ly1, w, col, up, grow) {
  const [x0, y0] = tx(lx0, ly0, up), [x1, y1] = tx(lx1, ly1, up);
  g.thickLine(x0, y0, x1, y1, w * P.k + 2 * grow, col, { aa: true });
}

function ears(g, grow, inner) {
  const base = [[-2.2, -25.5, -0.42 + P.earA], [1.2, -26.5, -0.1 + P.earB]];
  for (const [bx, by, a] of base) {
    const L = 12.5, ex = bx + Math.sin(a) * L, ey = by - Math.cos(a) * L;
    if (!inner) cap(g, bx, by, ex, ey, 4.6, grow ? OUTLINE : PAL.FUR, true, grow);
    else cap(g, bx + Math.sin(a) * 2.5, by - Math.cos(a) * 2.5, bx + Math.sin(a) * (L - 2.6), by - Math.cos(a) * (L - 2.6), 1.7, PAL.EAR_IN, true, 0);
  }
}

/** The rabbit's body, head and ears (everything but the near arm). */
export function drawRabbit(g, pose, coat) {
  P = pose;
  for (const grow of [1, 0]) {
    const o = grow ? OUTLINE : 0;
    ell(g, -8.2, -5.5, 2.8, 2.8, o || PAL.FUR, false, grow);                 // tail
    ell(g, 0.5, -1.7, 6.6, 2.3, o || PAL.FUR, false, grow);                  // hind foot
    ell(g, -1, -9.5, 7.4, 8.8, o || coat, true, grow);                   // body in a happi coat
    ears(g, grow, false);
    ell(g, 1.6, -21.5, 7.2, 6.2, o || PAL.FUR, true, grow);                  // head
  }
  ell(g, -1, -9.5 + 5.5, 6.2, 2.6, PAL.FUR_SH, true, 0);                     // the coat's hem shows fur under it
  ell(g, -1.5, -8.5, 6.4, 7.6, coat, true, 0);
  cap(g, 3.5, -16.5, -2.5, -4.5, 1.2, mix(coat, 0xffffff, 0.45), true, 0); // the coat's collar line
  ears(g, 0, true);
  ell(g, 6.2, -19.8, 3, 2.4, PAL.WHITE, true, 0);                        // muzzle
  ell(g, -1.5, -19.5, 4, 3, mix(PAL.FUR, PAL.FUR_SH, 0.6), true, 0);           // shade at the back of the head
  if (P.band >= 0) {                                                     // hachimaki and its ties
    cap(g, -4.6, -25.2, 6.5, -24.6, 1.6, P.band, true, 0);
    const [kx, ky] = tx(-5, -25, true);
    for (const s of [-1, 1]) {
      const a = 2.6 + s * 0.35 + P.tie;
      g.thickLine(kx, ky, kx - P.dir * Math.cos(a - 2.6) * 5 * P.k * (s > 0 ? 1 : 0.8), ky + Math.sin(a) * 3.2 * P.k, 1.3 * P.k, P.band, { aa: true });
    }
  }
  // eye: closed is a short line
  const [ex, ey] = tx(4.5 + P.look, -22.6, true);
  if (P.blink > 0.5) g.thickLine(ex - 1.3 * P.k, ey, ex + 1.3 * P.k, ey, 0.9, OUTLINE, { aa: true });
  else {
    g.fillCircle(ex, ey, 1.55 * P.k, PAL.EYE, { aa: true });
    g.fillCircle(ex - 0.3 * P.dir, ey - 0.3, 0.75 * P.k, OUTLINE, { aa: true });
    g.fillCircle(ex - 0.55 * P.dir * P.k, ey - 0.65 * P.k, 0.5, 0xffffff, { aa: true });
  }
  const [nx, ny] = tx(9, -20.8, true);
  g.fillCircle(nx, ny, 0.8 * P.k, PAL.NOSE, { aa: true });
  const [cx2, cy2] = tx(4.2, -18.6, true);
  g.fillCircle(cx2, cy2, 1.2 * P.k, PAL.BLUSH, { aa: true, a: 0.7 });  // a blush
}

/** The near arm, from the shoulder to the paw at (hx, hy) in screen coordinates. */
export function drawArm(g, pose, coat) {
  P = pose;
  const [sx, sy] = tx(2.2, -14.5, true);
  // a wide sleeve to the elbow, then the white forearm and paw
  const ex = sx + (pose.hx - sx) * 0.5, ey = sy + (pose.hy - sy) * 0.5;
  g.thickLine(ex, ey, pose.hx, pose.hy, 2.8 * P.k + 2, OUTLINE, { aa: true });
  g.fillCircle(pose.hx, pose.hy, 2.1 * P.k + 1, OUTLINE, { aa: true });
  g.thickLine(sx, sy, ex, ey, 4.4 * P.k + 2, OUTLINE, { aa: true });
  g.thickLine(ex, ey, pose.hx, pose.hy, 2.8 * P.k, PAL.FUR, { aa: true });
  g.fillCircle(pose.hx, pose.hy, 2.1 * P.k, PAL.FUR, { aa: true });
  g.thickLine(sx, sy, ex, ey, 4.4 * P.k, coat, { aa: true });
}

// ------------------------------------------------------------ the kine


/** The mallet: handle from (hx, hy) along angle a (radians, screen), barrel across its end. */
export function drawKine(g, hx, hy, a, len) {
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;     // v: the barrel's axis
  const cx = hx + ux * len, cy = hy + uy * len;
  g.thickLine(hx - ux * 3, hy - uy * 3, cx, cy, 4.4, OUTLINE, { aa: true });
  g.thickLine(hx - ux * 3, hy - uy * 3, cx, cy, 2.6, PAL.HANDLE, { aa: true });
  const hl = 7.5, ht = 5;   // half length along the axis, half thickness along the handle
  const quad = (l, t, dl = 0) => [[cx + vx * (l + dl) + ux * t, cy + vy * (l + dl) + uy * t], [cx + vx * (l + dl) - ux * t, cy + vy * (l + dl) - uy * t],
    [cx - vx * (l - dl) - ux * t, cy - vy * (l - dl) - uy * t], [cx - vx * (l - dl) + ux * t, cy - vy * (l - dl) + uy * t]];
  g.fillPolygon(quad(hl + 1, ht + 1), OUTLINE, { aa: true });
  g.fillPolygon(quad(hl, ht), PAL.KINE, { aa: true });
  g.fillPolygon(quad(hl, ht * 0.4, 0).map(([x, y]) => [x - ux * ht * 0.45, y - uy * ht * 0.45]), PAL.KINE_LT, { aa: true, a: 0.8 });
  for (const s of [-1, 1]) g.thickLine(cx + vx * s * 4.6 + ux * ht, cy + vy * s * 4.6 + uy * ht, cx + vx * s * 4.6 - ux * ht, cy + vy * s * 4.6 - uy * ht, 1, PAL.KINE_DK, { aa: true, a: 0.8 });
  // the face that strikes (the barrel's lower end) is a little darker: wet with dough
  return [cx, cy, vx, vy];
}

export { rgb };
