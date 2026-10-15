// Skywriter sky: the real time of day. Gradient sky, drifting cumulus from a
// precomputed tileable texture (sampled bilinear, so clouds glide), sun or
// moon on their arcs, stars, a little airfield on the hills with a windsock
// that shows the wind (it fills at every minute's gust), runway lights at
// night, and gulls in the day.
import * as kit from '../js/kit.js';

const W = 64, H = 64;
export const HORIZON = 52;

// ---------------------------------------------------------------- palette
// [hour, skyTop, skyHorizon, cloudLit, cloudShade, cloudAmount, smoke, stars, farHill, nearHill]
const K = [
  [0.0, '#01030d', '#071230', '#151d33', '#070a14', 0.35, '#8796b8', 1.0, '#040814', '#010205'],
  [4.6, '#01030d', '#071230', '#151d33', '#070a14', 0.35, '#8796b8', 1.0, '#040814', '#010205'],
  [5.9, '#141844', '#c0505a', '#b06a78', '#40284a', 0.45, '#ffc8c0', 0.25, '#1c1830', '#0a0812'],
  [7.2, '#2a62b8', '#a8cce8', '#f4f2ee', '#8a9cb8', 0.6, '#ffffff', 0.0, '#3f5f80', '#1c3a1e'],
  [12.0, '#1d55bc', '#8cc0ee', '#ffffff', '#90a6c4', 0.7, '#ffffff', 0.0, '#3f6488', '#1e4220'],
  [16.6, '#2856a8', '#b0c6dc', '#fff4e4', '#8c9cb4', 0.6, '#fffaf0', 0.0, '#46607c', '#203c1e'],
  [18.2, '#38306e', '#ff7a3c', '#ffb072', '#7a3a58', 0.55, '#ffd2b4', 0.0, '#3a2a48', '#140c14'],
  [19.3, '#0c1034', '#7a3050', '#704060', '#281828', 0.45, '#d8b8d4', 0.5, '#140e22', '#06040a'],
  [20.6, '#01030d', '#071230', '#151d33', '#070a14', 0.35, '#8796b8', 1.0, '#040814', '#010205'],
  [24.0, '#01030d', '#071230', '#151d33', '#070a14', 0.35, '#8796b8', 1.0, '#040814', '#010205'],
].map((r) => [r[0], kit.hex(r[1]), kit.hex(r[2]), kit.hex(r[3]), kit.hex(r[4]), r[5], kit.hex(r[6]), r[7], kit.hex(r[8]), kit.hex(r[9])]);

/** The palette at fractional hour h (0..24). */
export const pal = { top: [0, 0, 0], hor: [0, 0, 0], cLit: [0, 0, 0], cSh: [0, 0, 0], cAmt: 0, smoke: [0, 0, 0], stars: 0, far: [0, 0, 0], near: [0, 0, 0], day: 0 };
export function palette(h) {
  let i = 0;
  while (i < K.length - 2 && K[i + 1][0] <= h) i++;
  const a = K[i], b = K[i + 1], f = kit.smoothstep(0, 1, (h - a[0]) / (b[0] - a[0]));
  const m = (j, o) => { for (let c = 0; c < 3; c++) o[c] = a[j][c] + (b[j][c] - a[j][c]) * f; };
  m(1, pal.top); m(2, pal.hor); m(3, pal.cLit); m(4, pal.cSh); m(6, pal.smoke); m(8, pal.far); m(9, pal.near);
  pal.cAmt = kit.lerp(a[5], b[5], f); pal.stars = kit.lerp(a[7], b[7], f);
  pal.day = kit.smoothstep(5.6, 7.0, h) * (1 - kit.smoothstep(18.4, 19.6, h));
  return pal;
}

// --------------------------------------------------------------- textures
const CW = 160, CH = 56;
const cloudTex = new Float32Array(CW * CH), cloudShadeTex = new Float32Array(CW * CH);
{
  // a few cumulus: unions of round puffs with flat, shaded bottoms (tileable in x)
  for (let c = 0; c < 5; c++) {
    const cx0 = c * 32 + 6 + 14 * kit.hash(c, 11), bot = 8 + 34 * kit.hash(c, 12), wd = 7 + 9 * kit.hash(c, 13);
    const nb = 3 + Math.floor(3 * kit.hash(c, 14)), puffs = [];
    for (let i = 0; i < nb; i++) {
      const f = nb === 1 ? 0.5 : i / (nb - 1), r = (2.2 + 2.6 * kit.hash(c, 20 + i)) * (1 - 0.45 * Math.abs(f - 0.5) * 2) + 1;
      puffs.push([cx0 - wd / 2 + wd * f, bot - r * 0.55 - 0.6 * kit.hash(c, 30 + i), r]);
    }
    for (let y = 0; y < CH; y++) for (let xx = -24; xx <= 24; xx++) {
      const x = Math.round(cx0) + xx, tx = ((x % CW) + CW) % CW;
      let v = 0;
      for (const [px, py, r] of puffs) {
        const rr = r + (kit.noise2(x * 0.45, y * 0.45 + c * 7) - 0.5) * 1.6;
        v = Math.max(v, kit.clamp(rr - Math.hypot(x - px, y - py) + 0.5));
      }
      v *= kit.smoothstep(bot + 0.7, bot - 0.8, y);
      if (v <= cloudTex[y * CW + tx]) continue;
      cloudTex[y * CW + tx] = v;
      // light from above: top of the cloud lit, the flat base in shade
      let top = bot;
      for (const [px, py, r] of puffs) if (Math.abs(x - px) < r) top = Math.min(top, py - Math.sqrt(r * r - (x - px) ** 2));
      cloudShadeTex[y * CW + tx] = kit.clamp(1 - (y - top) / Math.max(2, bot - top) * 0.9);
    }
  }
}
const STARS = [];
for (let k = 0; k < 70; k++) {
  const x = kit.hash(k, 1) * 64, y = kit.hash(k, 2) * (HORIZON - 4);
  STARS.push([Math.floor(x), Math.floor(y), 0.25 + 0.75 * kit.hash(k, 3) ** 2, kit.hash(k, 4) * 6.28, 0.6 + 2 * kit.hash(k, 5)]);
}
// hills: far range and near field (fractional heights for coverage)
const farH = new Float32Array(W), nearH = new Float32Array(W);
for (let x = 0; x < W; x++) {
  farH[x] = 52.2 - 2.6 * Math.sin(x * 0.11 + 0.6) - 1.4 * Math.sin(x * 0.29 + 2) - 1.2 * kit.noise2(x * 0.2, 4);
  nearH[x] = 57.6 - 1.6 * Math.sin(x * 0.07 + 2.2) - 0.7 * Math.sin(x * 0.23);
  if (x >= 4 && x <= 22) nearH[x] = 58.2; // the airfield is flat
}

const rowT = new Float32Array(H);
for (let y = 0; y < H; y++) rowT[y] = Math.min(1, y / HORIZON) ** 1.6;

const s0 = (i) => cloudShadeTex[i];
const cov = (d) => (d <= -0.5 ? 1 : d >= 0.5 ? 0 : 0.5 - d);

/**
 * Paint the sky into img. T: seconds (any epoch), h: fractional hour, wind: px/s,
 * gust 0..1 (windsock), gain: overall sky level.
 */
export function paint(img, T, h, wind, gust, gain) {
  const P = palette(h), g = gain;
  // sun and moon on their arcs (sun 06:00-18:40, moon the rest)
  const sf = (h - 6) / 12.7, mf = (((h - 18.7) + 24) % 24) / 11.3;
  const sunOn = sf > -0.03 && sf < 1.03, moonOn = mf > -0.03 && mf < 1.03;
  const sx = 3 + 58 * sf, sy = HORIZON + 1 - 17 * Math.sin(Math.PI * kit.clamp(sf, 0, 1));
  const mx = 3 + 58 * mf, my = HORIZON + 1 - 17 * Math.sin(Math.PI * kit.clamp(mf, 0, 1));
  const warm = 1 - P.day * 0.65 + (1 - kit.smoothstep(0.1, 0.25, Math.min(sf, 1 - sf))) * 0.6;
  const sunC = [1, 0.75 + 0.2 * P.day, 0.42 + 0.45 * P.day];
  const cx = (T * wind * 0.25) % CW, cA = P.cAmt;
  const cxi = Math.floor(cx), cxf = cx - cxi;
  for (let y = 0; y < H; y++) {
    const t = rowT[y];
    const r0 = (P.top[0] + (P.hor[0] - P.top[0]) * t) * g, g0 = (P.top[1] + (P.hor[1] - P.top[1]) * t) * g, b0 = (P.top[2] + (P.hor[2] - P.top[2]) * t) * g;
    const cy = y - 2;
    for (let x = 0; x < W; x++) {
      let r = r0, gg = g0, b = b0;
      if (sunOn) {
        const d2 = (x - sx) ** 2 + (y - sy) ** 2;
        const glow = (0.06 * g * warm) / (1 + d2 * 0.02) + (0.16 * g) / (1 + d2 * 0.07);
        r += glow * sunC[0]; gg += glow * sunC[1] * 0.85; b += glow * sunC[2] * 0.6;
      }
      if (cy >= 0 && cy < CH - 1 && cA > 0) {
        let tx = x - cxi; tx = ((tx % CW) + CW) % CW;
        const tx1 = (tx + CW - 1) % CW, o = cy * CW;
        const v = cloudTex[o + tx] * (1 - cxf) + cloudTex[o + tx1] * cxf;
        const a = v * (0.3 + 0.4 * cA) * (0.45 + 0.55 * s0(o + tx));
        if (a > 0) {
          const s = cloudShadeTex[o + tx] * (1 - cxf) + cloudShadeTex[o + tx1] * cxf;
          const cr = P.cSh[0] + (P.cLit[0] - P.cSh[0]) * s, cg = P.cSh[1] + (P.cLit[1] - P.cSh[1]) * s, cb = P.cSh[2] + (P.cLit[2] - P.cSh[2]) * s;
          r += (cr * 0.75 * g - r) * a; gg += (cg * 0.75 * g - gg) * a; b += (cb * 0.75 * g - b) * a;
        }
      }
      const q = 3 * (y * W + x);
      img[q] = r; img[q + 1] = gg; img[q + 2] = b;
    }
  }
  // sun disc
  if (sunOn) {
    // the sun: a disc with slowly turning rays, so it reads as a sun and not a dot
    for (let y = Math.max(0, Math.floor(sy - 10)); y <= Math.min(H - 1, sy + 10); y++) for (let x = Math.max(0, Math.floor(sx - 10)); x <= Math.min(W - 1, sx + 10); x++) {
      const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy);
      if (d < 4 || d > 10) continue;
      const ray = Math.max(0, Math.cos(Math.atan2(dy, dx) * 6 + T * 0.35)) ** 3 * (1 - (d - 4) / 6) ** 1.5;
      const q = 3 * (y * W + x), v = ray * 0.2 * g / 0.42;
      img[q] += v * sunC[0]; img[q + 1] += v * sunC[1] * 0.8; img[q + 2] += v * sunC[2] * 0.4;
    }
    disc(img, sx, sy, 3.6, [0.75, 0.62 + 0.08 * P.day, 0.25 + 0.2 * P.day], 1);
  }
  // stars and moon
  if (P.stars > 0.01) {
    for (const [x, y, br, ph, sp] of STARS) {
      const tw = 0.6 + 0.4 * Math.sin(T * sp + ph);
      const v = P.stars * br * tw * 0.09 * g / 0.4, q = 3 * (y * W + x);
      img[q] += v * 0.85; img[q + 1] += v * 0.9; img[q + 2] += v;
    }
  }
  if (moonOn) {
    const mc = [0.55, 0.55, 0.45];
    disc(img, mx, my, 3.2, mc, 1, mx + 1.6, my - 0.8, 2.8);
    // a faint halo
    for (let y = Math.max(0, Math.floor(my - 8)); y <= Math.min(H - 1, my + 8); y++) for (let x = Math.max(0, Math.floor(mx - 8)); x <= Math.min(W - 1, mx + 8); x++) {
      const d2 = (x - mx) ** 2 + (y - my) ** 2, v = 0.012 / (1 + d2 * 0.08), q = 3 * (y * W + x);
      img[q] += v * 0.6; img[q + 1] += v * 0.7; img[q + 2] += v;
    }
  }
}

/** Anti-aliased disc (optionally minus a second disc: a crescent). */
function disc(img, x0, y0, r, c, a, bx, by, br) {
  for (let y = Math.max(0, Math.floor(y0 - r - 1)); y <= Math.min(H - 1, Math.ceil(y0 + r + 1)); y++)
    for (let x = Math.max(0, Math.floor(x0 - r - 1)); x <= Math.min(W - 1, Math.ceil(x0 + r + 1)); x++) {
      let k = cov(Math.hypot(x - x0, y - y0) - r);
      if (br) k *= 1 - cov(Math.hypot(x - bx, y - by) - br);
      if (k <= 0) continue;
      const q = 3 * (y * W + x);
      img[q] += (c[0] - img[q]) * k * a; img[q + 1] += (c[1] - img[q + 1]) * k * a; img[q + 2] += (c[2] - img[q + 2]) * k * a;
    }
}

/** Gulls: a little flock crossing the lower sky every 30 s or so, by day. */
export function birds(img, T) {
  if (pal.day < 0.05) return;
  const per = 34, n = Math.floor(T / per), u = (T - n * per) / 15;
  if (u > 1) return;
  const dir = kit.hash(n, 7) < 0.5 ? 1 : -1, by = 33 + 12 * kit.hash(n, 8);
  for (let k = 0; k < 3; k++) {
    const x = dir > 0 ? -6 + 76 * u - k * 4.2 : 70 - 76 * u + k * 4.2;
    const y = by + k * 2.2 + 1.2 * Math.sin(T * 0.9 + k);
    const flap = Math.sin(T * 9 + k * 1.7);
    // a gull is a soft dark "m": body and two wing tips
    const pts = [[0, 0, 1], [-1.4, -0.6 * flap - 0.3, 0.8], [1.4, -0.6 * flap - 0.3, 0.8], [-2.4, -1.1 * flap, 0.5], [2.4, -1.1 * flap, 0.5]];
    for (const [dx, dy, w] of pts) dark(img, x + dx, y + dy, w * pal.day * 0.75);
  }
}
function dark(img, x, y, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ws = [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]];
  for (const [dx, dy, w] of ws) {
    const px = xi + dx, py = yi + dy;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const q = 3 * (py * W + px), m = 1 - a * w;
    img[q] *= m; img[q + 1] *= m; img[q + 2] *= m;
  }
}

/** Hills, the airfield (hangar, windsock) and its runway lights at night. */
export function land(img, T, wind, gust, gain, night) {
  const P = pal, g = gain;
  for (let x = 0; x < W; x++) {
    for (let y = 44; y < H; y++) {
      const q = 3 * (y * W + x);
      const kf = cov(farH[x] - y), kn = cov(nearH[x] - y);
      if (kf > 0) { const s = 0.8 + 0.2 * (y - farH[x]) / 6; img[q] += (P.far[0] * g * s - img[q]) * kf; img[q + 1] += (P.far[1] * g * s - img[q + 1]) * kf; img[q + 2] += (P.far[2] * g * s - img[q + 2]) * kf; }
      if (kn > 0) {
        const s = 1 - 0.35 * (y - nearH[x]) / 6;
        const tex = 0.85 + 0.3 * kit.hash(x, y, 9);
        img[q] += (P.near[0] * g * s * tex - img[q]) * kn; img[q + 1] += (P.near[1] * g * s * tex - img[q + 1]) * kn; img[q + 2] += (P.near[2] * g * s * tex - img[q + 2]) * kn;
      }
    }
  }
  // the runway: a slightly paler strip on the flat
  const rw = kit.mix(P.near, [0.3, 0.3, 0.3], 0.25 + 0.2 * P.day);
  for (let x = 3; x <= 30; x++) for (const y of [61]) { const q = 3 * (y * W + x); img[q] = rw[0] * g; img[q + 1] = rw[1] * g; img[q + 2] = rw[2] * g; }
  // hangar: a barrel roof with a door; lit window at night
  const roof = kit.mix([0.42, 0.08, 0.05], [0.06, 0.02, 0.02], 1 - P.day), wall = kit.mix([0.28, 0.24, 0.2], [0.03, 0.03, 0.04], 1 - P.day);
  for (let x = 5; x <= 15; x++) for (let y = 53; y <= 58; y++) {
    const dx = (x - 10) / 5.6, top = 58 - 5.4 * Math.sqrt(Math.max(0, 1 - dx * dx));
    const k = cov(top - y);
    if (k <= 0) continue;
    const isRoof = y < top + 1.4, door = x >= 8 && x <= 12 && y >= 56;
    const c = isRoof ? roof : door ? [0.01, 0.01, 0.01] : wall;
    const q = 3 * (y * W + x);
    img[q] += (c[0] * g - img[q]) * k; img[q + 1] += (c[1] * g - img[q + 1]) * k; img[q + 2] += (c[2] * g - img[q + 2]) * k;
  }
  if (P.day < 0.6) {
    const v = (1 - P.day) * 0.35 * g;
    for (let x = 9; x <= 11; x++) { const q = 3 * (57 * W + x); img[q] += v; img[q + 1] += v * 0.6; img[q + 2] += v * 0.2; }
    // runway lights: a chase of amber dots
    for (let k = 0; k < 7; k++) {
      const x = 4 + k * 4, ph = kit.fract(T * 0.8 - k / 7), on = Math.max(0.25, 1 - ph * 3);
      const q = 3 * (62 * W + x), lv = v * 0.9 * on;
      img[q] += lv; img[q + 1] += lv * 0.55; img[q + 2] += lv * 0.1;
    }
  }
  // windsock on a pole: angle from the wind, length fills with the gust
  const px = 55, py0 = 52, pyb = Math.floor(nearH[px]);
  const pole = kit.mix([0.4, 0.4, 0.4], [0.05, 0.05, 0.06], 1 - P.day);
  for (let y = py0; y <= pyb; y++) { const q = 3 * (y * W + px); img[q] = pole[0] * g; img[q + 1] = pole[1] * g; img[q + 2] = pole[2] * g; }
  const fill = kit.clamp(0.35 + 0.65 * gust + 0.08 * Math.sin(T * 3.1));
  const ang = (1 - fill) * 1.1 + 0.08 * Math.sin(T * 5.3), len = 3 + 3.5 * fill;
  for (let k = 0; k <= 8; k++) {
    const s = (k / 8) * len, x = px + 0.5 + s * Math.cos(ang) * Math.sign(wind || 1), y = py0 + 0.3 + s * Math.sin(ang) + 0.3 * Math.sin(T * 7 + k);
    const band = Math.floor((k / 8) * 4) % 2 === 0;
    const c = band ? [0.9, 0.2, 0.04] : [0.75, 0.72, 0.68];
    stamp(img, x, y, c, (0.75 - 0.3 * (k / 8)) * g * (0.35 + 0.65 * P.day) * (1 - 0.5 * night));
  }
}
function stamp(img, x, y, c, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ws = [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]];
  for (const [dx, dy, w] of ws) {
    const px = xi + dx, py = yi + dy;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const q = 3 * (py * W + px), k = Math.min(1, w * 1.6);
    img[q] += (c[0] * a - img[q]) * k; img[q + 1] += (c[1] * a - img[q + 1]) * k; img[q + 2] += (c[2] * a - img[q + 2]) * k;
  }
}
