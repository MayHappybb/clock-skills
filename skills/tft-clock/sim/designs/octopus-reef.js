// The reef behind and in front of the octopus: flat-colour water in three
// depth bands, a far reef of coral heads in one dim tone with a lit rim, the
// rock ledge the octopus hides under (plum stone, a lit lip, pits, polyps),
// slow light shafts from the surface, drifting marine snow; and the
// octopus's own head between the hours and the minutes, and its ink.
//
// Everything static is painted once at load into four RGB565 tables (day,
// day lit by a shaft, night, night lit): flash, 4 x 25.6 KB. A frame copies
// the table row by row, choosing lit or unlit per pixel from three moving
// shaft spans with ordered-dither edges, and dithers day into night over
// the dimming minute.

import { to565, sin, cos, hash } from '../js/kit.js';

export const W = 160, H = 80;
const WH = W * H;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixc = (a, b, u) => { const A = rgb(a), B = rgb(b); return (Math.round(A[0] + (B[0] - A[0]) * u) << 16) | (Math.round(A[1] + (B[1] - A[1]) * u) << 8) | Math.round(A[2] + (B[2] - A[2]) * u); };

// ------------------------------------------------------------ the ledge line
export const LEDGE_TOP = new Uint8Array(W);
let HEAD_CLIP = 80;
for (let x = 0; x < W; x++) {
  let y = 68 + Math.round(1.1 * Math.sin(x * 0.19 + 1) + 0.7 * Math.sin(x * 0.53 + 2));
  if (x > 66 && x < 94) y = Math.min(y, 67);
  LEDGE_TOP[x] = Math.max(66, Math.min(70, y));
}
for (let x = 62; x < 98; x++) HEAD_CLIP = Math.min(HEAD_CLIP, LEDGE_TOP[x]);

// ------------------------------------------------------------ palettes
const DAY = {
  water: [0x2a8494, 0x1f6d81, 0x1f6d81], far: 0x134b5f, farRim: 0x1f6a7e,
  rock: 0x4c3050, rockDeep: 0x3a2440, lip: 0x7c5479, pit: 0x2a1830, polyp: [0xff9a4a, 0xff6f9a, 0xffd25a], barnacle: 0xcbb2c4,
  lit: 0xa8ecea, litAmt: 0.11,
};
const NIGHT = {
  water: [0x103a52, 0x0c2d42, 0x0c2d42], far: 0x081c2b, farRim: 0x123a52,
  rock: 0x2c1c32, rockDeep: 0x221628, lip: 0x4c3650, pit: 0x170d1b, polyp: [0xb86a3a, 0xb05074, 0xb89a44], barnacle: 0x7c6c80,
  lit: 0x7fb6d8, litAmt: 0.08,
};

// the far reef: coral heads and branches as one silhouette
const FAR = new Uint8Array(WH);
{
  const domes = [[4, 66, 9], [20, 65, 6], [52, 66, 7], [70, 64, 6], [104, 66, 8], [124, 66, 6], [146, 65, 8], [158, 66, 6], [36, 67, 5], [88, 66, 6]];
  const branches = [[28, 66, 25, 54], [25, 54, 21, 49], [25, 54, 29, 50], [62, 66, 61, 56], [61, 56, 58, 52], [61, 56, 64, 51], [114, 66, 116, 55], [116, 55, 113, 51], [116, 55, 120, 50], [136, 66, 138, 57], [138, 57, 141, 53], [92, 66, 95, 58], [95, 58, 93, 54]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [cx, cy, r] of domes) if ((x + 0.5 - cx) ** 2 + ((y + 0.5 - cy) * 1.25) ** 2 < r * r) v = 1;
    for (const [ax, ay, bx, by] of branches) {
      const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x + 0.5 - ax - u * dx, y + 0.5 - ay - u * dy) < 1.6 - u * 0.5) v = 1;
    }
    FAR[y * W + x] = v;
  }
}

function paint(P, lit) {
  const t = new Uint16Array(WH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = BAYER[((y & 3) << 2) | (x & 3)];
    let c;
    // water bands with two dithered rows between them
    const band = y < 5 ? 0 : y === 5 ? (b < 10 ? 0 : 1) : y === 6 ? (b < 5 ? 0 : 1) : y === 7 ? (b < 2 ? 0 : 1) : 1;
    c = P.water[band];
    if (FAR[i]) c = y > 0 && !FAR[i - W] ? P.farRim : P.far;
    const top = LEDGE_TOP[x];
    if (y >= top) {
      c = y === top ? P.lip : y > 75 ? P.rockDeep : P.rock;
      const h = hash(x >> 1, y >> 1, 7);
      if (y > top + 1 && h % 13 === 0) c = P.pit;
      if (y > top + 2 && y < 78 && (h >> 5) % 61 === 0) c = P.barnacle;
    }
    if (lit) {
      const amt = y >= LEDGE_TOP[x] ? P.litAmt * 0.45 : P.litAmt * (0.25 + 0.75 * Math.pow(1 - y / 80, 1.3));
      c = mixc(c, P.lit, amt);
    }
    t[i] = to565(c);
  }
  // polyps on the lip: little clusters of colour
  for (let k = 0; k < 26; k++) {
    const h = hash(k, 3, 9), x = 2 + (h % 156), y = LEDGE_TOP[x] + 1 + ((h >> 8) % 3);
    const c = P.polyp[(h >> 12) % 3];
    const col = to565(lit ? mixc(c, P.lit, 0.08) : c);
    t[y * W + x] = col;
    if ((h >> 16) & 1) t[y * W + x + 1] = col;
  }
  return t;
}
const BG = [paint(DAY, false), paint(DAY, true), paint(NIGHT, false), paint(NIGHT, true)];

// ------------------------------------------------------------ shafts and snow
const COV = new Uint8Array(W);

/** The water, reef and ledge, with light shafts and marine snow. */
export function background(g, T, night) {
  const buf = g.buf;
  // three shafts slanting down to the right, drifting and breathing
  const sh = [];
  for (let k = 0; k < 3; k++) {
    const x0 = 22 + k * 52 + 9 * sin(T * 0.11 + k * 2.1) + 4 * sin(T * 0.37 + k);
    const w = 7 + 3 * k % 5 + 2.5 * sin(T * 0.6 + k * 1.7);
    sh.push(x0, w);
  }
  const nb = night * 16;
  for (let y = 0; y < H; y++) {
    COV.fill(0);
    for (let k = 0; k < 3; k++) {
      const c = sh[2 * k] + y * 0.42, w = sh[2 * k + 1] * (1 - y / 140);
      const a = (c - w) | 0, b = (c + w) | 0;
      const xa = a - 3 < 0 ? 0 : a - 3, xb = b + 3 > W - 1 ? W - 1 : b + 3;
      for (let x = xa; x <= xb; x++) {
        const d = x + 0.5 < c ? c - w - (x + 0.5) : x + 0.5 - (c + w);
        const v = d <= -2 ? 21 : d >= 2 ? 0 : (10.5 - d * 5.25) | 0;
        if (v > COV[x]) COV[x] = v;
      }
    }
    // the surface's waves flicker down every shaft: a soft band of dither travels down it
    const fl = (6 + 6 * sin(y * 0.3 - T * 4.2)) | 0;
    const row = y * W, br = (y & 3) << 2;
    for (let x = 0; x < W; x++) {
      const b = BAYER[br | (x & 3)];
      const tb = nb > b ? 2 : 0;
      buf[row + x] = BG[tb + (COV[x] - fl > b ? 1 : 0)][row + x];
    }
  }
  g.cost.px += WH; g.cost.box += WH * 4 + 3 * H * 14;
  // marine snow (by night it glows a little)
  const snow = to565(night > 0.5 ? 0x7fe8e0 : 0x8cc4c8);
  for (let i = 0; i < 18; i++) {
    const h = hash(i, 41);
    const y = ((h % 640) / 10 + T * (0.6 + (h >> 10) % 5 * 0.15)) % 64;
    const x = ((h >> 4) % 1600 / 10 + T * 0.8 + 3 * sin(T * 0.4 + i)) % W;
    const xi = x | 0, yi = y | 0;
    buf[yi * W + xi] = snow;
  }
  g.cost.px += 18; g.cost.calls += 18;
}

// ------------------------------------------------------------ the ink
const INK = new Uint8Array(WH);
const inkC = [to565(0x1a1428), to565(0x0e0b18)];
function blend565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31, sr = s >> 11, sg = (s >> 5) & 63, sb = s & 31;
  return ((((dr * (16 - a) + sr * a) >> 4) << 11) | (((dg * (16 - a) + sg * a) >> 4) << 5) | ((db * (16 - a) + sb * a) >> 4));
}

/**
 * The hour's ink: puffs jetted from the siphon at tau = 0 billow up and out
 * behind the arms, then thin away (density thresholds drop, dithered).
 * Flat: two tones of ink, nothing in between but the dither.
 */
export function ink(g, tau) {
  if (tau <= 0 || tau > 9) return;
  const buf = g.buf;
  let x0 = W, x1 = 0, y0 = H, y1 = 0, ops = 0;
  const puffs = [];
  for (let k = 0; k < 15; k++) {
    const h = hash(k, 77), t0 = (k % 5) * 0.16 + ((h >> 3) % 10) * 0.02;
    const t = tau - t0;
    if (t <= 0) continue;
    const dir = k & 1 ? 1 : -1, sp = 0.5 + ((h >> 8) % 10) / 20;
    const reach = 1 - Math.exp(-t * 0.9);
    const cx = 80 + dir * (4 + 66 * sp * reach) + 4 * sin(t * 0.8 + k);
    const cy = 56 - (4 + 44 * ((h >> 14) % 10) / 10) * reach - t * 0.8;
    const r = 4 + 13 * reach * (0.6 + ((h >> 20) % 10) / 22);
    puffs.push(cx, cy, r);
    x0 = Math.min(x0, cx - r - 2); x1 = Math.max(x1, cx + r + 2); y0 = Math.min(y0, cy - r - 2); y1 = Math.max(y1, cy + r + 2);
  }
  if (!puffs.length) return;
  x0 = Math.max(0, x0 | 0); x1 = Math.min(W, x1 | 0); y0 = Math.max(0, y0 | 0); y1 = Math.min(H, y1 | 0);
  for (let y = y0; y < y1; y++) INK.fill(0, y * W + x0, y * W + x1);
  // each puff adds its density (1 - d^2/r^2, in 1/16) over its own disc
  for (let p = 0; p < puffs.length; p += 3) {
    const cx = puffs[p], cy = puffs[p + 1], r = puffs[p + 2], r2 = r * r, k = 16 / r2;
    let ax = (cx - r) | 0, bx = (cx + r + 1) | 0, ay = (cy - r) | 0, by = (cy + r + 1) | 0;
    if (ax < 0) ax = 0; if (ay < 0) ay = 0; if (bx > W) bx = W; if (by > H) by = H;
    for (let y = ay; y < by; y++) {
      const dy = y + 0.5 - cy, row = y * W;
      for (let x = ax; x < bx; x++) {
        const dx = x + 0.5 - cx, q = r2 - dx * dx - dy * dy;
        if (q > 0) { const v = INK[row + x] + ((q * k) | 0); INK[row + x] = v > 255 ? 255 : v; }
      }
    }
    ops += (bx - ax) * (by - ay);
  }
  // thinning: the cloud's density falls with age
  const fade = tau < 4 ? 16 : tau > 9 ? 0 : ((1 - (tau - 4) / 5) * 16) | 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const j = y * W + x, v = INK[j];
    ops++;
    if (!v || y >= LEDGE_TOP[x]) continue;
    const dens = (v * fade) >> 4, b = BAYER[((y & 3) << 2) | (x & 3)];
    if (dens > 10 + (b >> 1)) buf[j] = blend565(buf[j], inkC[1], 14);
    else if (dens > (b * 0.6 | 0) + 1) buf[j] = blend565(buf[j], inkC[0], 9);
    else continue;
    g.cost.blend++;
  }
  g.cost.box += ops * 4;
}

// ------------------------------------------------------------ the head

/**
 * The octopus's head, peeking over the ledge between the hours and the
 * minutes: a mantle dome with two eye bulges, bar pupils, flat skin with a
 * lit rim. rise 0..1 lifts it out (the hour). look -1..1 moves the pupils.
 * lut is the arm colourway (same skin), tone 1..4.
 */
export function head(g, o) {
  const { rise, breath, look, lookY, blink, lut, tone, keyC, eyeC, pupilC, spots } = o;
  const cx = 80, eyeY = 60 - 15 * rise - breath * 0.4;
  // the mantle: a bag above and behind the eyes, ballooning as it rises
  const mh = 9 + 20 * rise + breath, mrx = 10.5 + 3.5 * rise + breath * 0.4, mcy = eyeY - 2 - mh * 0.55;
  const skin = lut[tone];
  g.clip(0, 0, W, HEAD_CLIP);
  const aa = { aa: true };
  // keyline shapes first, then skin over them
  g.fillEllipse(cx, mcy, mrx + 1.2, mh * 0.62 + 1.2, keyC, aa);
  g.fillCircle(cx - 9, eyeY, 6.1, keyC, aa); g.fillCircle(cx + 9, eyeY, 6.1, keyC, aa);
  g.fillPolygon([[cx - 11.5, eyeY], [cx + 11.5, eyeY], [cx + 16.2, 72], [cx - 16.2, 72]], keyC);
  g.fillEllipse(cx, mcy, mrx, mh * 0.62, skin);
  g.fillPolygon([[cx - 10.5, eyeY], [cx + 10.5, eyeY], [cx + 15, 72], [cx - 15, 72]], skin);
  // a lit rim on the mantle's upper left
  g.fillEllipse(cx - 1.8, mcy - 0.8, mrx - 2, mh * 0.62 - 1.2, lut[5]);
  g.fillEllipse(cx - 0.6, mcy + 0.4, mrx - 2.2, mh * 0.62 - 1.6, skin);
  for (const [dx, dy] of spots) g.fillRect(Math.round(cx + dx * mrx / 11), Math.round(mcy + dy * mh / 20), 2, 2, lut[1]);
  // the eyes, bulging out at the sides
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 9;
    g.fillCircle(ex, eyeY, 5, skin);
    g.fillCircle(ex, eyeY, 3.7, eyeC);
    if (blink < 1) {
      const px = Math.round(ex - 2 + look * 1.2), py = Math.round(eyeY - 1 + lookY);
      g.fillRect(px, py, 4, 2, pupilC);
    }
    if (blink > 0) g.fillRect(Math.round(ex - 4), Math.round(eyeY - 4), 8, Math.round(8 * Math.min(1, blink)), skin);
  }
  g.unclip();
}
