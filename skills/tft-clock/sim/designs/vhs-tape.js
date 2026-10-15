// VHS tape: the post-pass that turns a clean picture into a worn tape played
// back on a cheap VCR (vhs.js). It runs once a frame over the whole canvas,
// row by row, in integer arithmetic:
//
//  - every row is split into luma (Y) and colour difference (U = B - Y,
//    V = R - Y); colour-under recording keeps only a narrow chroma band, so U
//    and V are box-filtered over 4 px and arrive late (the colour sits right
//    of its edges), and come back a little washed out
//  - luma is lifted and compressed (grey blacks, soft whites), with a fine
//    temporal grain and a faint field line on odd rows
//  - time-base error: every row is displaced sideways by a slowly wandering
//    0..1 px, the top rows bend ("flagging")
//  - tracking noise bands: rows inside a band are torn sideways by a few px,
//    and white dropout streaks fly through them
//  - head-switching noise in the bottom three rows: torn right, noisy
//
// Cost: ~30 integer operations a pixel (charged as box work, 10 per pixel)
// plus a few table lookups per row. RAM: three 168-entry rows.
import { sin, hash } from '../js/kit.js';

const W = 160, H = 80, PAD = 4;
const RY = new Int16Array(W + 2 * PAD), RU = new Int16Array(W + 2 * PAD), RV = new Int16Array(W + 2 * PAD);
const GRAIN = new Int8Array(2048);
for (let i = 0; i < GRAIN.length; i++) GRAIN[i] = ((hash(i, 71) % 9) - 4);

/** A band of tracking noise: rows y0..y0+h, tearing `amp` px, `streak` 0..1 dropouts. */
export function band(y0, h, amp, streak) { return { y0, h, amp, streak }; }

/**
 * Run the tape over g.buf in place.
 *   F       frame number (grain, streaks)
 *   T       seconds (wobble)
 *   bands   tracking-noise bands
 *   o       { wob 0..2 (time-base error), lift, gain, sat (0..256), grain, flag (px), hs (head switch on), jy (0/1: the paused frame's field shake) }
 */
export function tape(g, F, T, bands, o) {
  const buf = g.buf, lift = o.lift, gain = o.gain, sat = o.sat, gr = o.grain;
  const fz = (F * 977) & 2047;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    // ---- this row's sideways error
    let sh = o.wob * (0.6 * sin(y * 0.23 + T * 1.9) + 0.45 * sin(y * 0.061 - T * 0.83 + 1.3));
    if (y < 6) sh += o.flag * (6 - y) / 6;
    let noisy = 0, streak = 0;
    for (let b = 0; b < bands.length; b++) {
      const B = bands[b], k = y - B.y0;
      if (k < 0 || k >= B.h) continue;
      const e = 1 - Math.abs((2 * k + 1) / B.h - 1);              // strongest in the band's middle
      const hr = hash(y, F >> 1, 5);
      sh += B.amp * e * (0.6 + 0.4 * ((hr & 255) / 255)) * ((hr >> 9) & 1 ? 1 : 0.7);
      noisy += e * 40; streak += e * B.streak;
    }
    if (o.hs && y >= H - 3) { const hr = hash(y, F, 9); sh += 3 + (H - y === 1 ? 4 : H - y === 2 ? 2 : 0) + (hr & 3); noisy += 30; }
    const s = Math.round(sh);

    // ---- unpack the row into Y, U, V (with a blanking pad either side)
    const srow = Math.min(H - 1, y + o.jy) * W;
    for (let x = 0; x < W; x++) {
      const v = buf[srow + x];
      const r = (v >> 8) & 0xf8, gg = (v >> 3) & 0xfc, b = (v << 3) & 0xf8;
      const Y = (77 * r + 150 * gg + 29 * b) >> 8;
      RY[x + PAD] = Y; RU[x + PAD] = b - Y; RV[x + PAD] = r - Y;
    }
    for (let p = 0; p < PAD; p++) {
      RY[p] = 14; RU[p] = 0; RV[p] = 0;
      RY[W + PAD + p] = RY[W + PAD - 1]; RU[W + PAD + p] = 0; RV[W + PAD + p] = 0;
    }

    // ---- dropout streaks of this row (white flecks along the band)
    let sx0 = -1, sx1 = -1;
    if (streak > 0.05) {
      const hr = hash(y, F, 13);
      if ((hr & 1023) < streak * 700) { sx0 = (hr >>> 10) % W; sx1 = sx0 + 3 + ((hr >>> 20) % 14); }
    }

    // ---- rebuild: luma at its place, chroma late and soft
    let gi = (fz + y * 131) & 2047;
    const field = y & 1 ? 5 : 0;
    for (let x = 0; x < W; x++) {
      let src = x - s;
      src = src < -PAD ? -PAD : src > W + PAD - 1 ? W + PAD - 1 : src;
      const k = src + PAD;
      const Y0 = RY[k];
      // chroma: mean of 4 px ending 1 px to the left (late by ~2.5 px)
      const k1 = k - 1 < 0 ? 0 : k - 1, k4 = k - 4 < 0 ? 0 : k - 4;
      const k2 = k - 2 < 0 ? 0 : k - 2, k3 = k - 3 < 0 ? 0 : k - 3;
      const U = ((RU[k1] + RU[k2] + RU[k3] + RU[k4]) * sat) >> 10;
      const V = ((RV[k1] + RV[k2] + RV[k3] + RV[k4]) * sat) >> 10;
      let Y = lift + ((Y0 * gain) >> 8) + ((GRAIN[gi] * gr) >> 2) - field;
      gi = (gi + 7) & 2047;
      if (noisy > 0) Y += (GRAIN[(gi * 3) & 2047] * noisy) >> 4;
      if (x >= sx0 && x < sx1) Y = 236;
      let R = Y + V, B = Y + U, G = Y - ((130 * V + 50 * U) >> 8);
      R = R < 0 ? 0 : R > 255 ? 255 : R;
      G = G < 0 ? 0 : G > 255 ? 255 : G;
      B = B < 0 ? 0 : B > 255 ? 255 : B;
      buf[row + x] = ((R & 0xf8) << 8) | ((G & 0xfc) << 3) | (B >> 3);
    }
  }
  g.cost.box += W * H * 11;
  g.cost.calls += H;
}
