// The field for cropcircle.js: the texture of the ears, the ground beyond
// the field, the wind, and the one per-pixel pass that paints the glass.
//
// The pass (renderField) is the whole background, written as it would be in
// C: integer table look-ups straight into the frame buffer. Per pixel it
// interpolates the wind and cloud grids, then either samples the ear texture
// displaced by the wind's lean (bilinear, so the heads glide by sixteenths of
// a pixel) or reads the laid straw's gloss, looks up whether the standing
// wall towards the sun shades it, mixes in the beam's light and dithers to
// RGB565. It is priced honestly on g.cost.box (about 60 cycles a pixel).

import { noise2, sin, rand } from '../js/kit.js';

export const W = 160, H = 80;
const PAD = 4, TW = W + 2 * PAD;
export const FP = W * 4;                 // FL is padded by 4 rows above and below
export const GX = 41, GY = 21;           // wind / light grid, a node every 4 px

// ------------------------------------------------------------ static tables (flash)
/** Ear texture 0..15: heads of wheat seen from above, drooping downwind. */
export const TEX = new Uint8Array(TW * H);
{
  const acc = new Float32Array(TW * H);
  for (let i = 0; i < acc.length; i++) acc[i] = 1.5 + rand(i, 0, 3) * 2.5;
  for (let gy = -2; gy < H + 2; gy += 3)
    for (let gx = -2; gx < TW + 2; gx += 3) {
      const cx = gx + rand(gx, gy, 1) * 3, cy = gy + rand(gx, gy, 2) * 3;
      const a = (rand(gx, gy, 4) - 0.5) * 1.2, ca = Math.cos(a), sa = Math.sin(a);
      const len = 1.7 + rand(gx, gy, 5) * 0.8, wid = 0.95, peak = 10 + rand(gx, gy, 6) * 5.5;
      for (let y = Math.floor(cy - 3); y <= cy + 3; y++)
        for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
          if (x < 0 || y < 0 || x >= TW || y >= H) continue;
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca) / wid;
          const q = 1 - (u * u + v * v);
          if (q > 0) { const val = peak * Math.sqrt(q); const k = y * TW + x; if (val > acc[k]) acc[k] = val; }
        }
    }
  for (let i = 0; i < acc.length; i++) TEX[i] = Math.min(15, acc[i] | 0);
}

// the ground beyond the field: pasture and hedgerow top right, a farm track bottom left
export const hedgeY = (x) => (x < 90 ? -9 : x < 106 ? -9 + 23 * Math.sin(((x - 90) / 16) * Math.PI / 2) : 14 + 1.2 * Math.sin(x * 0.21));
export const trackY = (x) => (x < 58 ? 72.5 + 0.6 * Math.sin(x * 0.11) : 72.5 + ((x - 58) / 30) ** 2 * 14);
/** 0 field, else 1 + an index into the zone table. */
export const ZONE = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, px = x + 0.5, py = y + 0.5, n = rand(x, y, 21);
    const hy = hedgeY(px) + (rand(x >> 1, 0, 22) - 0.5) * 1.6;
    if (px > 89 && py < hy - 1.6) {
      const stripe = ((px * 0.7 + py * 0.25) / 5 | 0) & 1;   // mower stripes in the pasture
      ZONE[i] = 1 + Math.min(15, (stripe * 5 + n * 6 + 3) | 0);
    } else if (px > 89 && py < hy + 2) {
      const bush = noise2(px * 0.5, py * 0.5, 23);
      ZONE[i] = 1 + 16 + Math.min(15, (bush * 13 + n * 3) | 0);
    } else if (px < 92 && py > trackY(px) + 1.2) {
      const ty = py - trackY(px);
      const rut = Math.abs(ty - 2.6) < 0.7 || Math.abs(ty - 6) < 0.7;
      ZONE[i] = 1 + 32 + Math.min(15, ((rut ? 1 : 7) + n * 6) | 0);
    } else if (px < 92 && py > trackY(px) - 0.4) {
      ZONE[i] = 1 + Math.min(15, (n * 8) | 0);                // a grass verge
    }
  }

/** Tramlines: the pairs of tractor wheelings every farmed field has, bare between the wheat. */
export const TRAM = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const p = (x + 0.5) * 0.342 + (y + 0.5) * 0.94 + 9;
    const q = ((p % 44) + 44) % 44 - 22, a = Math.abs(q);
    if (a > 1.1 && a < 2.3) TRAM[y * W + x] = 1;
  }

/** Distance and angle tables for the beam's rings and the spiral (flash, 2 x 13 KB). */
export const DISTT = new Uint8Array(161 * 81), ATANT = new Uint8Array(161 * 81);
for (let y = 0; y <= 80; y++)
  for (let x = 0; x <= 160; x++) {
    DISTT[y * 161 + x] = Math.min(255, Math.round(Math.hypot(x, y)));
    ATANT[y * 161 + x] = Math.round((Math.atan2(y, x) / (Math.PI / 2)) * 63);   // first quadrant, 0..63
  }
export const dist = (dx, dy) => DISTT[(dy < 0 ? -dy : dy) * 161 + (dx < 0 ? -dx : dx)];
/** Clock-ish angle 0..255 of (dx, dy) from the tables. */
export function angle(dx, dy) {
  const a = ATANT[(dy < 0 ? -dy : dy) * 161 + (dx < 0 ? -dx : dx)];
  if (dx >= 0 && dy >= 0) return a;
  if (dx < 0 && dy >= 0) return 127 - a;
  if (dx < 0) return 128 + a;
  return 255 - a;
}

// ------------------------------------------------------------ per-frame state
export const FL = new Uint8Array(W * H + 2 * FP);   // flatness 0..16, padded
export const LAYC = new Uint8Array(W * H);          // gloss index of laid straw
export const EX = new Uint8Array(W * H);            // extra light 0..255 (the beam)
const WG = new Int32Array(GX * GY), LG = new Int32Array(GX * GY);
const ROWW = new Int32Array(GX), ROWL = new Int32Array(GX);
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 4096 + 2048);

/** The wind (heads bent 0..255) and the light (cloud shadow, vignette; 256 = 1) on the grid. */
export function windGrid(g, tod, cloudK, moonK) {
  for (let j = 0; j < GY; j++)
    for (let i = 0; i < GX; i++) {
      const x = i * 4, y = j * 4, k = j * GX + i;
      const env = noise2((x - tod * 21) * 0.017, y * 0.04 + tod * 0.01, 3);
      const wave = sin(x * 0.15 + y * 0.06 - tod * 3.1 + 2.4 * noise2(x * 0.021, y * 0.05 + tod * 0.04, 7));
      let w = 255 * (0.08 + 0.92 * (env * 1.7 - 0.35) * (0.5 + 0.5 * wave));
      WG[k] = w < 0 ? 0 : w > 255 ? 255 : w | 0;
      const cl = noise2((x + tod * 2.6) * 0.012, (y - tod * 0.7) * 0.022, 11);
      const sh = cl > 0.55 ? Math.min(1, (cl - 0.55) * 4) : 0;
      const ex = x - 80, ey = (y - 40) * 2, v = (ex * ex + ey * ey) / 12800;
      LG[k] = (256 - sh * cloudK - v * 40 + moonK * (46 - (x * 0.5 + y) * 0.62)) | 0;
    }
  g.cost.box += GX * GY * 40;
}

/**
 * Paint the whole glass. L: { S (standing LUT 512), F (flat LUT 64), Z (zone
 * LUT 48), ts (FL offset one step towards the light), len (shadow length
 * 1..3), glow (0xRRGGBB), ex (true if EX holds any light) }.
 */
export function renderField(g, L) {
  const buf = g.buf, S = L.S, F = L.F, Z = L.Z, ts = L.ts, ts2 = ts * 2, ts3 = ts * 3, len = L.len;
  const gr = (L.glow >> 16) & 255, gg = (L.glow >> 8) & 255, gb = L.glow & 255, exOn = L.ex;
  let blends = 0;
  for (let y = 0; y < H; y++) {
    const j = y >> 2, fy = y & 3, r0 = j * GX, r1 = j < GY - 1 ? r0 + GX : r0;
    for (let i = 0; i < GX; i++) {
      ROWW[i] = WG[r0 + i] * (4 - fy) + WG[r1 + i] * fy;
      ROWL[i] = LG[r0 + i] * (4 - fy) + LG[r1 + i] * fy;
    }
    const trow = y * TW + PAD, brow = (y & 3) << 2;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, gi = x >> 2, fx = x & 3;
      const w = (ROWW[gi] * (4 - fx) + ROWW[gi + 1] * fx) >> 4;          // 0..255
      const lt = (ROWL[gi] * (4 - fx) + ROWL[gi + 1] * fx) >> 4;         // 256 = 1
      const z = ZONE[i], fi = i + FP;
      let c, ru = 0;
      if (z) c = Z[z - 1];
      else {
        const f = FL[fi];
        let cs = 0, cf = 0;
        if (f < 16) {
          // standing: the ears, leaning downwind with the gust
          const sx = (x << 4) - ((w * 26) >> 8) - 8, a = sx >> 4, fr = sx & 15;
          let t = (TEX[trow + a] * (16 - fr) + TEX[trow + a + 1] * fr) >> 4;
          if (TRAM[i]) { t >>= 2; ru = -20; }
          // the wall of standing stalks round a laid area: a dark rim, then
          // the row behind it lit where the light comes across the lane
          if (f < 8 && (FL[fi - 1] > 8 || FL[fi + 1] > 8 || FL[fi - W] > 8 || FL[fi + W] > 8)) cs = S[512 | t];
          else cs = S[(FL[fi + ts2] > 8 ? 256 : 0) | ((w >> 4) << 4) | t];
        }
        if (f > 0) {
          // laid: the gloss of the combed straw, shaded by the wall towards the light
          let sh = FL[fi + ts] < 8 ? 2 : 0;
          if (len > 1 && FL[fi + ts2] < 8) sh++;
          if (len > 2 && sh === 0 && FL[fi + ts3] < 8) sh = 1;
          cf = F[(sh << 4) | LAYC[i]];
        }
        if (f === 0) c = cs;
        else if (f === 16) c = cf;
        else {
          // stalks on the move: a blend, and a flash as they catch the light
          blends++;
          const u = f << 4, hl = (f * (16 - f)) >> 1;
          let r = ((cs >> 16) & 255) + (((((cf >> 16) & 255) - ((cs >> 16) & 255)) * u) >> 8) + hl;
          let gn = ((cs >> 8) & 255) + (((((cf >> 8) & 255) - ((cs >> 8) & 255)) * u) >> 8) + hl;
          let b = (cs & 255) + ((((cf & 255) - (cs & 255)) * u) >> 8) + (hl >> 1);
          c = ((r > 255 ? 255 : r) << 16) | ((gn > 255 ? 255 : gn) << 8) | (b > 255 ? 255 : b);
        }
        if (f === 16) ru = ((w >> 4) - 6) * 2;   // a gust ruffles the laid straw a little
      }
      let r = ((((c >> 16) & 255) + ru) * lt) >> 8, gn = ((((c >> 8) & 255) + ru) * lt) >> 8, b = (((c & 255) + ru) * lt) >> 8;
      if (exOn) {
        const e = EX[i];
        if (e) { r += (gr * e) >> 8; gn += (gg * e) >> 8; b += (gb * e) >> 8; }
      }
      if (r > 255) r = 255; else if (r < 0) r = 0;
      if (gn > 255) gn = 255; else if (gn < 0) gn = 0;
      if (b > 255) b = 255; else if (b < 0) b = 0;
      const t = BAY[brow | (x & 3)];
      buf[i] = (((r * 7967 + t) >> 16) << 11) | (((gn * 16191 + t) >> 16) << 5) | ((b * 7967 + t) >> 16);
    }
  }
  g.cost.box += W * H * 23 + blends * 8;
  g.cost.px += W * H;
  g.cost.calls += 1;
}
