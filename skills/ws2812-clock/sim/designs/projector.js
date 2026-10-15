// The Picture House: a dark cinema across three HUB75 panels. At the left a
// 35 mm projector, reels turning, lamp house glowing; its beam crosses the
// room through drifting smoke and lands on the screen, where the time is the
// film being shown: the hour as a silent-film title card, the minutes as the
// numeral of an Academy leader whose sweep hand is the seconds. The beam is
// lit volumetrically from the frame itself, so the numerals hang in the smoke
// as shafts of light and the dust motes glitter only where a numeral's light
// passes through them.
//   minute: the film slips a frame; the old frame rolls up and away, the frame
//           line crosses the screen and the new frame racks into place
//   hour:   intermission: cue dots flash, house lights and footlights rise,
//           the velvet curtains close with the picture still projected across
//           their folds, the frame slips on the curtain, and they reopen
import * as kit from '../js/kit.js';
import { makeDigits, MARGIN } from './projector-glyphs.js';

const W = 192, H = 64, N = W * H;
const SX0 = 80, SY0 = 3, FW = 104, FH = 54, FL = 5;   // the screen / film frame, and the frame line
const LX = 47.5, LY = 31;                            // lens
const HOURD = makeDigits(21, 38, 'deco'), MIND = makeDigits(14, 26, 'sans');
const CX = 77, CY = 25, R1 = 24, R2 = 21;            // the leader circle (frame coords)
const BG = 0.075, INK = 0.0, RING = 0.42;                         // film base grey, and the dark of rings and keylines
const LIGHT = [1.0, 0.84, 0.62];
const VELVET = [0.62, 0.045, 0.05];
const ROLL = 1.3;

// ---- the leader's static rings and crosshair, as coverage of ink
const LEAD = new Float32Array(FW * FH), RAD = new Float32Array(FW * FH), ANG = new Float32Array(FW * FH);
for (let v = 0; v < FH; v++) for (let u = 0; u < FW; u++) {
  const p = v * FW + u, dx = u + 0.5 - CX, dy = v + 0.5 - CY, r = Math.hypot(dx, dy);
  RAD[p] = r;
  ANG[p] = ((Math.atan2(dx, -dy) / kit.TAU) + 1) % 1;            // 0 at 12 o'clock, clockwise
  let c = Math.max(0, 1.1 - Math.abs(r - R1) / 0.75) + 0.8 * Math.max(0, 1 - Math.abs(r - R2) / 0.65);
  if (r < R1 + 0.5) c += 0.55 * Math.max(0, 1 - Math.abs(dx) / 0.6) + 0.55 * Math.max(0, 1 - Math.abs(dy) / 0.6);
  LEAD[p] = Math.min(1, c);
}

// ---- tileable smoke texture
const TW = 128, TH = 64, SMOKE = new Float32Array(TW * TH);
{
  let amp = 0.5, tot = 0;
  for (let o = 0; o < 4; o++) {
    const cx = 4 << o, cy = 2 << o;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const gx = (x / TW) * cx, gy = (y / TH) * cy, xi = Math.floor(gx), yi = Math.floor(gy);
      const fx = gx - xi, fy = gy - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const h = (i, j) => kit.hash(((xi + i) % cx), ((yi + j) % cy), o + 11);
      const a = h(0, 0), b = h(1, 0), c = h(0, 1), d = h(1, 1);
      SMOKE[y * TW + x] += amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < SMOKE.length; i++) { const n = SMOKE[i] / tot; const k = kit.clamp((n - 0.38) * 2.2); SMOKE[i] = k * k; }
}
function smokeAt(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % TW) + TW) % TW, y0 = ((yi % TH) + TH) % TH, x1 = (x0 + 1) % TW, y1 = (y0 + 1) % TH;
  const a = SMOKE[y0 * TW + x0], b = SMOKE[y0 * TW + x1], c = SMOKE[y1 * TW + x0], d = SMOKE[y1 * TW + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ---- buffers
const img = new Float32Array(3 * N), beam = new Float32Array(N);
const Fcur = new Float32Array(FW * FH), Fprev = new Float32Array(FW * FH);
const S = { roll: -1, wx: 0, wy: 0, blur: 0, gain: 1 };                 // per-frame sampling state (monomorphic)
// ---- one film frame: title-card hour, leader minutes, sweep = seconds, wear
function blit(F, g, x0, y0, lum) {
  const M = MARGIN;
  for (let j = 0; j < g.h; j++) {
    const v = y0 - M + j;
    if (v < 0 || v >= FH) continue;
    for (let i = 0; i < g.w; i++) {
      const u = x0 - M + i;
      if (u < 0 || u >= FW) continue;
      const k = j * g.w + i, p = v * FW + u, m = g.moat[k], a = g.a[k];
      if (m <= 0) continue;
      const f = F[p] * (1 - m) + INK * m;
      F[p] = f * (1 - a) + lum * a;
    }
  }
}
function dot(F, cx, cy, r, lum) {
  for (let v = Math.max(0, Math.floor(cy - r - 1)); v <= Math.min(FH - 1, cy + r + 1); v++) {
    for (let u = Math.max(0, Math.floor(cx - r - 1)); u <= Math.min(FW - 1, cx + r + 1); u++) {
      const a = kit.clamp(r + 0.5 - Math.hypot(u + 0.5 - cx, v + 0.5 - cy));
      const p = v * FW + u; F[p] += (lum - F[p]) * a;
    }
  }
}
function compose(F, hh, mm, sf, fi, cue) {
  // base, grain, leader rings + crosshair (ink), the sweep (the seconds)
  const ang = sf, arcK = kit.TAU, hx = Math.sin(sf * kit.TAU), hy = -Math.cos(sf * kit.TAU);
  for (let p = 0; p < FW * FH; p++) {
    let f = BG * (1 + 0.08 * (kit.hash(p, fi & 1023, 5) - 0.5));
    const r = RAD[p];
    if (r < R2) {
      const a = ANG[p];
      if (a < ang) {                                  // swept: a lighter grey, glowing just behind the hand
        const behind = (ang - a) * arcK * r;
        f += 0.05 + 0.16 * Math.exp(-behind / 5);
      }
    }
    if (r < R1 + 0.6 && r > 16.5) {                   // the hand: a bright pointer in the ring band
      const u = (p % FW) + 0.5 - CX, v = ((p / FW) | 0) + 0.5 - CY, along = u * hx + v * hy;
      if (along > 0) { const d = Math.abs(u * hy - v * hx); if (d < 1.2) f += (0.8 - f) * (1.2 - d) / 1.2; }
    }
    F[p] = f + (RING - f) * LEAD[p];
  }
  const h0 = (hh / 10) | 0, h1 = hh % 10, m0 = (mm / 10) | 0, m1 = mm % 10;
  blit(F, HOURD[h0], 3, 6, 1); blit(F, HOURD[h1], 26, 6, 1);
  blit(F, MIND[m0], 62, 12, 0.95); blit(F, MIND[m1], 78, 12, 0.95);
  dot(F, 49.5, 19.5, 1.5, 0.9); dot(F, 49.5, 31.5, 1.5, 0.9);
  if (cue) { dot(F, 97, 7, 3.6, INK); dot(F, 97, 7, 2.6, 1); }
  // wear: scratches that run for a while, and one-frame specks of dirt
  for (let k = 0; k < 3; k++) {
    const run = Math.floor(fi / 37) + k * 101;
    if (kit.hash(run, k, 7) < 0.45 || kit.hash(fi, k, 8) < 0.25) continue;
    const x = 8 + kit.hash(run, k, 9) * (FW - 16) + 1.5 * Math.sin(fi * 0.07 + k);
    const xi = Math.floor(x), fx = x - xi, white = kit.hash(run, k, 10) < 0.5;
    const v0 = Math.floor(kit.hash(fi, k, 12) * 20), lum = white ? 0.55 : INK;
    for (let v = v0; v < FH; v++) {
      if (xi >= 0 && xi < FW - 1) {
        const p = v * FW + xi;
        F[p] += (lum - F[p]) * 0.6 * (1 - fx); F[p + 1] += (lum - F[p + 1]) * 0.6 * fx;
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    if (kit.hash(fi, k, 13) < 0.55) continue;
    const x = kit.hash(fi, k, 14) * FW, y = kit.hash(fi, k, 15) * FH, r = 0.5 + 1.3 * kit.hash(fi, k, 16);
    dot(F, x, y, r, kit.hash(fi, k, 17) < 0.6 ? INK : 0.7);
  }
}

// bilinear sample of a frame, clamped at its edges
function bil(F, u, v) {
  if (u < 0) u = 0; else if (u > FW - 1.001) u = FW - 1.001;
  if (v < 0) v = 0; else if (v > FH - 1.001) v = FH - 1.001;
  const ui = u | 0, vi = v | 0, fu = u - ui, fv = v - vi, p = vi * FW + ui;
  const a = F[p], b = F[p + 1], c = F[p + FW], d = F[p + FW + 1];
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
// what the projector puts at frame point (u, v) (centre-of-pixel coords), with weave and the frame slip
function film(u, v) {
  u += S.wx - 0.5; v += S.wy - 0.5;
  if (S.roll < 0) return bil(Fcur, u, v);
  const z = v + S.roll, b = S.blur;
  return S.gain * (strip(u, z - b) + strip(u, z) + strip(u, z + b)) / 3;
}
function strip(u, z) {                                   // the film as a strip: old frame, frame line, new frame
  if (z < FH - 0.5) return bil(Fprev, u, z);
  if (z < FH + FL - 0.5) return 0.004;
  return bil(Fcur, u, z - FH - FL);
}
// ---- the projector, drawn per pixel from signed distances, back to front
const sdBox = (x, y, cx, cy, hx, hy, r) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const C = [0, 0, 0];                                   // scratch colour (monomorphic, reused)
function lay(p, d, r, g, b, rim) {                     // paint a layer of signed distance d at pixel p
  const a = 0.5 - d; if (a <= 0) return;
  const k = a >= 1 ? 1 : a, e = d > -1.3 ? rim : 1;  // a lighter edge band reads the shape
  const o = 3 * p;
  img[o] += (r * e - img[o]) * k; img[o + 1] += (g * e - img[o + 1]) * k; img[o + 2] += (b * e - img[o + 2]) * k;
}
function reel(p, x, y, cx, cy, R, rp, rot) {
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
  const fl = R + 0.5 - r; if (fl <= 0) return;
  let th = Math.atan2(dy, dx) - rot, per = kit.TAU / 3;
  th = ((th % per) + per) % per - per / 2;                     // angle from the nearest slot's centre
  const dHole = Math.max((Math.abs(th) - 0.72) * r, Math.max(3.8 - r, r - (R - 2.0)));
  const hole = kit.clamp(0.5 - dHole);
  const lit = 0.75 + 0.5 * Math.max(0, (-dx * 0.55 - dy * 0.83) / (r + 0.01)) + (r > R - 1.3 ? 2.6 : 0);
  let cr = 0.07 * lit, cg = 0.075 * lit, cb = 0.085 * lit;
  if (r < 2.4) { cr = 0.34; cg = 0.33; cb = 0.3; if (r < 1.0) { cr = cg = cb = 0.02; } }
  let a = kit.clamp(fl);
  if (hole > 0) {
    if (r < rp) {                                              // the film pack seen through the slot
      const sh = 0.6 + 0.4 * Math.sin(r * 2.7);
      cr += (0.16 * sh - cr) * hole; cg += (0.06 * sh - cg) * hole; cb += (0.015 * sh - cb) * hole;
    } else a *= 1 - hole;
  }
  const o = 3 * p;
  img[o] += (cr - img[o]) * a; img[o + 1] += (cg - img[o + 1]) * a; img[o + 2] += (cb - img[o + 2]) * a;
}
function strand(p, x, y, pts) {                         // the film: a thin polyline
  let d = 9;
  for (let k = 0; k + 3 < pts.length; k += 2) d = Math.min(d, kit.segDist(x, y, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]));
  const a = kit.clamp(1.05 - d); if (a <= 0) return;
  const o = 3 * p;
  img[o] += (0.3 - img[o]) * a; img[o + 1] += (0.17 - img[o + 1]) * a; img[o + 2] += (0.07 - img[o + 2]) * a;
}
const FEED = [0, 0, 0, 0, 0, 0, 0, 0], TAKE = [0, 0, 0, 0, 0, 0, 0, 0];
function projector(tl, lamp, fi, slip) {
  const rpF = 9.6, rpT = 7.4;                         // film packs
  const rotF = tl * kit.TAU * 0.31, rotT = tl * kit.TAU * 0.4;
  const fl = (1 + 4 * slip) * (0.35 * Math.sin(tl * 9.1) + 0.2 * Math.sin(tl * 23.7));   // flutter of the loops (wild while the film slips)
  FEED[0] = 26 + rpF; FEED[1] = 12.5; FEED[2] = 36.6 + fl * 0.4; FEED[3] = 18; FEED[4] = 35.8 + fl; FEED[5] = 21.8; FEED[6] = 34.5; FEED[7] = 24.8;
  TAKE[0] = 35; TAKE[1] = 38.2; TAKE[2] = 37.8 + fl; TAKE[3] = 42.5; TAKE[4] = 36.8 + fl * 0.5; TAKE[5] = 47; TAKE[6] = 26 + rpT; TAKE[7] = 52;
  const vent = (0.55 + 0.45 * lamp) * (0.9 + 0.1 * Math.sin(tl * 5.3));
  const sa = tl * kit.TAU * 0.7, sx = Math.cos(sa), sy = Math.sin(sa);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    for (let x = 0; x < 50; x++) {
      const xc = x + 0.5, p = y * W + x;
      // pedestal and foot
      lay(p, sdBox(xc, yc, 26, 52, 3.5, 11.5, 0.5), 0.05, 0.055, 0.06, 3.2);
      lay(p, sdBox(xc, yc, 26, 62.5, 11, 1.6, 0.8), 0.055, 0.06, 0.065, 3.2);
      // lamp house, chimney and cap
      lay(p, sdBox(xc, yc, 8.5, 17, 2.6, 5.2, 0.3), 0.045, 0.065, 0.055, 3.5);
      lay(p, sdBox(xc, yc, 8.5, 11.8, 3.8, 0.9, 0.5), 0.06, 0.075, 0.065, 3.2);
      lay(p, sdBox(xc, yc, 9.5, 31.5, 7.5, 9.5, 1.5), 0.045, 0.065, 0.05, 3.8);
      if (xc > 4 && xc < 15 && yc > 24 && yc < 34) {         // vents, glowing
        const vy = (yc - 24) % 3.2;
        if (vy > 1.2 && vy < 2.3) { const o = 3 * p, e = vent * kit.clamp(Math.min(xc - 4, 15 - xc) / 1.5); img[o] = 0.9 * e; img[o + 1] = 0.36 * e; img[o + 2] = 0.07 * e; }
      }
      { const dw = Math.hypot(xc - 9, yc - 37); if (dw < 2.6) { const o = 3 * p, e = vent * kit.clamp(2.6 - dw) * (0.8 + 0.2 * Math.sin(tl * 2.1)); img[o] = 0.85 * e; img[o + 1] = 0.16 * e; img[o + 2] = 0.03 * e; } }
      // mechanism body, its shutter shaft, the gate
      lay(p, sdBox(xc, yc, 27, 31.5, 10, 7, 1.8), 0.048, 0.07, 0.055, 3.8);
      { const ds = Math.hypot(xc - 22, yc - 31.5);
        if (ds < 3.2) {
          const mark = Math.max(0, (xc - 22) * sx + (yc - 31.5) * sy) > 0.6 && Math.abs((xc - 22) * sy - (yc - 31.5) * sx) < 0.7;
          lay(p, ds - 3, 0.19, 0.2, 0.2, 1.4);
          if (mark && ds < 2.7) { const o = 3 * p; img[o] = 0.5; img[o + 1] = 0.48; img[o + 2] = 0.4; }
        } }
      if (xc > 36.3 && xc < 37.7 && yc > 28.5 && yc < 34.5) { const o = 3 * p; img[o] = 0.9 * lamp; img[o + 1] = 0.75 * lamp; img[o + 2] = 0.5 * lamp; }
      // lens barrel (brass, two rings) and the front glass
      lay(p, sdBox(xc, yc, 42.3, 31, 5, 2.5, 0.8), 0.3, 0.19, 0.06, 1.5);
      if (xc > 40 && xc < 41.1 && Math.abs(yc - 31) < 3) { const o = 3 * p; img[o] *= 1.7; img[o + 1] *= 1.7; img[o + 2] *= 1.7; }
      // film strands, then the reels over them
      if (xc > 24 && yc < 55) { strand(p, xc, yc, FEED); strand(p, xc, yc, TAKE); }
      reel(p, xc, yc, 26, 12.5, 11.5, rpF, rotF);
      reel(p, xc, yc, 26, 52, 11, rpT, rotT);
    }
  }
  // the lens front: the source of the beam
  for (let y = 27; y < 36; y++) for (let x = 45; x < 52; x++) {
    const d = Math.hypot(x + 0.5 - LX, (y + 0.5 - LY) * 1.2), g = Math.exp(-d * d / 2.2) * lamp;
    const o = 3 * (y * W + x); img[o] += 1.0 * g; img[o + 1] += 0.9 * g; img[o + 2] += 0.72 * g;
  }
}
// ---- the screen, curtains, beam, dust and audience
const CU = { c: 0, lag: 0, amb: 0, lamp: 1 };
const eL = (yc) => 82 + 50.5 * CU.c + CU.lag * (yc / 64) * (yc / 64);
const eR = (yc) => 183 - 51.5 * CU.c - CU.lag * (yc / 64) * (yc / 64);
const vign = (u, v) => { const a = u / FW - 0.5, b = v / FH - 0.5; return 1 - 0.6 * a * a - 0.4 * b * b; };

function screen() {
  const lamp = CU.lamp, raise = 0.04 * CU.amb;
  for (let y = SY0; y < SY0 + FH; y++) {
    const yc = y + 0.5, l = eL(yc), r = eR(yc), v = y - SY0 + 0.5;
    for (let x = Math.max(SX0, Math.floor(l)); x < Math.min(SX0 + FW, Math.ceil(r)); x++) {
      const u = x - SX0 + 0.5, f = film(u, v) * lamp * vign(u, v) + raise, o = 3 * (y * W + x);
      img[o] = LIGHT[0] * f; img[o + 1] = LIGHT[1] * f; img[o + 2] = LIGHT[2] * f;
    }
  }
}

function curtains() {
  const c = CU.c, nF = 3 + 3 * c, amb = CU.amb, lamp = CU.lamp;
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5, l = eL(yc), r = eR(yc), q3 = (yc / 64) ** 3;
    const lightBase = 0.3 + 0.16 * amb + 0.9 * amb * q3;
    for (let x = 72; x < W; x++) {
      const xc = x + 0.5;
      let q, a;
      if (xc < l + 0.5) { q = (xc - 72) / (l - 72); a = kit.clamp(l - xc + 0.5); }
      else if (xc > r - 0.5) { q = (192 - xc) / (192 - r); a = kit.clamp(xc - r + 0.5); }
      else continue;
      const ph = Math.cos(kit.TAU * nF * q), fold = 0.5 + 0.5 * ph;
      let sh = (0.28 + 0.72 * Math.sqrt(fold)) * (q > 0.9 ? 1 - (q - 0.9) * 3.5 : 1);
      let lr = lightBase * sh, sheen = 0;
      if (x >= SX0 && x < SX0 + FW && y >= SY0 && y < SY0 + FH) {   // the picture falls on the velvet
        const u = x - SX0 + 0.5 + 1.3 * fold - 0.65, v = y - SY0 + 0.5;
        const f = film(u, v) * lamp * vign(u, v);
        lr += 1.9 * f * sh; sheen = 0.2 * f * (0.4 + 0.6 * fold);
      }
      const o = 3 * (y * W + x);
      const R = VELVET[0] * lr + sheen, G = VELVET[1] * lr + sheen * 0.8, B = VELVET[2] * lr + sheen * 0.6;
      img[o] += (R - img[o]) * a; img[o + 1] += (G - img[o + 1]) * a; img[o + 2] += (B - img[o + 2]) * a;
    }
  }
  // valance: a scalloped pelmet across the top
  for (let x = 72; x < W; x++) {
    const edge = 2.2 + 1.0 * Math.abs(Math.sin(((x + 0.5 - 72) / 7) * Math.PI));
    for (let y = 0; y < 4; y++) {
      const a = kit.clamp(edge - y); if (a <= 0) continue;
      const lr = (0.16 + 0.35 * CU.amb) * (0.7 + 0.3 * Math.sin((x - 72) * 0.9));
      const o = 3 * (y * W + x);
      img[o] += (VELVET[0] * lr - img[o]) * a; img[o + 1] += (VELVET[1] * lr - img[o + 1]) * a; img[o + 2] += (VELVET[2] * lr - img[o + 2]) * a;
    }
  }
}

const NS = 8, BEAM_GAIN = 0.8;
function volumetric(tl) {
  const lamp = CU.lamp;
  for (let j = 0; j < NS; j++) {
    const f = 0.07 + 0.36 * (j + 0.5) / NS, inv = 1 / f;
    const xa = LX + f * (SX0 - LX), xb = LX + f * (SX0 + FW - LX), ya = LY + f * (SY0 - LY), yb = LY + f * (SY0 + FH - LY);
    const k = BEAM_GAIN * lamp / (f + 0.15), sc = 0.8 + 0.6 * f;
    const ox = j * 29.3 - tl * (0.9 + 0.17 * j), oy = j * 17.1 + tl * (0.7 + 0.05 * j);
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
      const yc = y + 0.5, cy = kit.clamp(Math.min(yc + 0.5 - ya, yb - yc + 0.5));
      const v = (yc - LY) * inv + LY - SY0;
      for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
        const xc = x + 0.5, cov = cy * kit.clamp(Math.min(xc + 0.5 - xa, xb - xc + 0.5));
        const d = smokeAt((xc - LX) * sc + ox, (yc - LY) * sc + oy);
        if (d <= 0.002) continue;
        const u = (xc - LX) * inv + LX - SX0;
        const fv = film(u, v);
        beam[y * W + x] += k * cov * (0.01 * fv + d * (fv > 0.07 ? fv - 0.07 : 0) + 0.006 * d);
      }
    }
  }
  // the cone itself: a soft haze between the lens and the screen's edges
  const s0 = (SY0 - LY) / (SX0 - LX), s1 = (SY0 + FH - LY) / (SX0 - LX);
  for (let x = Math.floor(LX); x < SX0; x++) {
    const xc = x + 0.5, dx = xc - LX; if (dx <= 0) continue;
    const y0 = Math.max(0, Math.floor(LY + s0 * dx - 2)), y1 = Math.min(H - 1, Math.ceil(LY + s1 * dx + 2));
    const near = 0.6 + 1.8 * Math.exp(-dx / 7);
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, sl = (yc - LY) / dx, edge = kit.clamp(Math.min((sl - s0) * dx, (s1 - sl) * dx) / 2.5 + 0.2);
      if (edge <= 0) continue;
      beam[y * W + x] += 0.03 * lamp * edge * near * (0.35 + smokeAt(xc * 0.55 - tl * 1.1, yc * 0.55 + tl * 0.45));
    }
  }
  for (let p = 0; p < N; p++) {
    const b = beam[p]; if (b <= 0) continue;
    const x = p % W, y = (p / W) | 0, onScreen = x >= SX0 && y >= SY0 && y < SY0 + FH ? 0.3 : 1;
    const o = 3 * p, e = b * onScreen;
    img[o] += LIGHT[0] * e; img[o + 1] += LIGHT[1] * e; img[o + 2] += LIGHT[2] * e * 1.05;
  }
}

const NM = 64;
function motes(tl) {
  for (let m = 0; m < NM; m++) {
    const f = 0.08 + 0.7 * kit.hash(m, 1, 3) + 0.03 * Math.sin(tl * 0.21 + m);
    const u = kit.hash(m, 2, 3) * (FW + 16) - 8 + 7 * Math.sin(tl * (0.05 + 0.04 * kit.hash(m, 5, 3)) + m * 1.7);
    const span = FH + 24, vs = 0.5 + 0.9 * kit.hash(m, 4, 3);
    const v = ((((kit.hash(m, 3, 3) * span - tl * vs) % span) + span) % span) - 12 + 2 * Math.sin(tl * 0.3 + m);
    if (u < 0 || u >= FW || v < 0 || v >= FH) continue;
    const px = LX + f * (SX0 + u - LX), py = LY + f * (SY0 + v - LY);
    const lum = film(u, v) * CU.lamp;
    const tw = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(tl * (2 + 3 * kit.hash(m, 6, 3)) + m), 3);
    const b = (0.05 + 1.3 * Math.max(0, lum - 0.16)) * tw / (f + 0.35);
    const xi = Math.floor(px - 0.5), yi = Math.floor(py - 0.5), fx = px - 0.5 - xi, fy = py - 0.5 - yi;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const X = xi + i, Y = yi + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * b, o = 3 * (Y * W + X);
      img[o] += w; img[o + 1] += 0.9 * w; img[o + 2] += 0.75 * w;
    }
  }
}
// front row, from behind: black heads cut into the bottom of the picture, rimmed by its light
const HX = [87, 99.5, 112, 124.5, 137.5, 150, 163, 176.5], HR = [5.0, 4.6, 5.3, 4.8, 5.1, 4.5, 5.2, 4.9];
const HXN = new Float64Array(8), HYN = new Float64Array(8);
function heads(tl) {
  const amb = CU.amb;
  for (let i = 0; i < 8; i++) {
    const ev = tl / 41 + i * 0.37, k = ev - Math.floor(ev), lean = kit.smoothstep(0, 0.06, k) * (1 - kit.smoothstep(0.1, 0.16, k));
    const side = kit.hash(Math.floor(ev), i, 21) < 0.5 ? -1 : 1, on = kit.hash(Math.floor(ev), i, 22) < 0.35 ? 1 : 0;
    HXN[i] = HX[i] + 0.5 * Math.sin(tl * 0.19 + i * 2.1) + side * on * 2.6 * lean;
    HYN[i] = 56.2 + 0.3 * Math.sin(tl * 0.13 + i) - 1.2 * amb - on * 0.6 * lean;
  }
  for (let y = 48; y < H; y++) {
    const yc = y + 0.5;
    for (let x = 78; x < W; x++) {
      const xc = x + 0.5;
      let d = 9, top = 0;
      for (let i = 0; i < 8; i++) {
        const dx = xc - HXN[i]; if (dx > 11 || dx < -11) continue;
        const rx = HR[i], ry = HR[i] * 1.22, dy = yc - HYN[i];
        const dh = (Math.hypot(dx / rx, dy / ry) - 1) * rx;
        const ds = (Math.hypot(dx / (rx * 2.2), (yc - HYN[i] - 9) / 5.5) - 1) * 5.5;
        let dd = Math.min(dh, ds);
        if (i === 2 || i === 6) {                                          // two of them keep their hats on
          const yb = HYN[i] - ry * 0.5, brim = (Math.hypot(dx / (rx * 1.5), (yc - yb) / 1.1) - 1) * 1.1;
          const crown = sdBox(xc, yc, HXN[i], yb - ry * 0.45, rx * 0.86, ry * 0.5, 1.4);
          dd = Math.min(dd, brim, crown);
        }
        if (dd < d) { d = dd; top = dh < ds ? -dy / ry : 0.2; }
      }
      const a = kit.clamp(0.5 - d); if (a <= 0) continue;
      const o = 3 * (y * W + x), rim = kit.clamp(1 - Math.abs(d + 0.7) / 0.9) * kit.clamp(top + 0.3);
      const back = y < SY0 + FH ? img[o + 1] : 0.05;  // light just behind the edge
      const lr = 0.006 + rim * (0.5 * back + 0.05) + amb * 0.1 * kit.clamp(top + 0.5);
      img[o] += (lr * 1.0 - img[o]) * a; img[o + 1] += (lr * 0.72 - img[o + 1]) * a; img[o + 2] += (lr * 0.5 - img[o + 2]) * a;
    }
  }
}

export default {
  name: 'Picture House',
  blurb: 'a cinema: the projector beams the time through smoke; leader sweep = seconds, frames slip, curtains at the hour',
  layouts: ['hub-x3'], look: 'smoke', fps: 60, brightness: 0.32, dither: false,
  frame(ctx) {
    const d = ctx.date, now = d.getTime() / 1000, tl = ((now % 86400) + 86400) % 86400;
    const hh = d.getHours(), mm = d.getMinutes(), sec = d.getSeconds() + d.getMilliseconds() / 1000;
    const fi = ((Math.floor(now * 24) % 1000000) + 1000000) % 1000000;
    const tau = mm >= 30 ? mm * 60 + sec - 3600 : mm * 60 + sec;          // seconds from the nearest hour
    const cue = (tau > -7.0 && tau < -6.83) || (tau > -1.25 && tau < -1.08);
    compose(Fcur, hh, mm, sec / 60, fi, cue);
    if (sec < ROLL) {
      const p = new Date(d.getTime() - 60000);
      compose(Fprev, p.getHours(), p.getMinutes(), 0.9999, fi, false);
      const k = sec / ROLL, D = FH + FL;
      S.roll = D * kit.ease.inOut(k);
      const vel = D * (k < 0.5 ? 12 * k * k : 12 * (1 - k) * (1 - k)) / ROLL;   // px/s
      S.blur = Math.min(4, vel / 60 * 0.8);
      S.gain = 1 - 0.18 * Math.sin(Math.PI * k) * (kit.hash(fi, 31) < 0.5 ? 1 : 0.4);   // the shutter beats out of phase
    } else S.roll = -1;
    S.wx = 0.5 * (kit.noise2(tl * 0.8, 3.3) - 0.5);
    S.wy = 0.6 * (kit.noise2(tl * 0.6, 9.1) - 0.5) + 0.08 * (kit.hash(fi, 3) - 0.5);
    if (sec >= ROLL && sec < ROLL + 0.6) { const k = (sec - ROLL) / 0.6; S.wy += 1.4 * Math.sin(k * 2 * kit.TAU) * (1 - k) * (1 - k); }   // the framer re-racks
    CU.lamp = 0.97 + 0.05 * (kit.noise2(tl * 2.3, 1.7) - 0.5) - 0.025 * kit.hash(fi, 4);
    // the intermission: curtains close at -3.8..-2, reopen 1..3; house lights round them
    const cAt = (t) => (t < -3.8 ? 0 : t < -2 ? kit.ease.inOut((t + 3.8) / 1.8) : t < 1 ? 1 : t < 3 ? 1 - kit.ease.inOut((t - 1) / 2) : 0);
    CU.c = cAt(tau);
    CU.lag = -9 * (cAt(tau + 0.05) - cAt(tau - 0.05)) / 0.1 * 0.35;
    CU.amb = kit.smoothstep(-4.6, -2.6, tau) * (1 - kit.smoothstep(2.4, 4.6, tau));
    img.fill(0); beam.fill(0);
    screen(); curtains(); volumetric(tl); motes(tl); heads(tl); projector(tl, CU.lamp, fi, sec < ROLL + 0.5 ? Math.sin(Math.PI * Math.min(1, sec / (ROLL + 0.5))) : 0);
    kit.blitGrid(ctx, img, 1 - 0.65 * ctx.night);
  },
};
