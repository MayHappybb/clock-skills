// Drawing a noodle: stamp a round brush along the (wobbling) centre line
// into a small distance buffer, then shade it through the palette: a flat
// wheat fill, a dark brown keyline, a clear-broth moat round it. AA comes
// from the distance, so the keyline glides by fractions of a pixel as the
// noodle wobbles. A crossing (4, 8) is shaded again on top, keyline and all,
// so one pass of the noodle visibly lies over the other.
//
// RAM: one 48 x 80 Uint16 distance buffer and a Uint8 index buffer (11.5 KB).
// Flash: the sqrt table (10.8 KB).

import { C } from './noodles-bowl.js';

export const BW = 48, BH = 80;
const D = new Uint16Array(BW * BH), IX = new Uint8Array(BW * BH);
const SQ = new Uint8Array(10817);
for (let i = 0; i < SQ.length; i++) SQ[i] = Math.min(255, Math.round(Math.sqrt(i)));
const FAR = 0xffff;
const W = 160, H = 80;

// mixed colours (RGB565), rebuilt per frame from the palette: TRI[ck * 17 + cf]
const TRI = new Uint16Array(17 * 17);
let triKey = -1;
const r5 = (c) => (c >> 16) & 255, g5 = (c) => (c >> 8) & 255, b5 = (c) => c & 255;
const pack = (r, g, b) => (((r >> 3) & 31) << 11) | (((g >> 2) & 63) << 5) | ((b >> 3) & 31);

/** Rebuild the blend table for this palette (broth under, key, fill). */
export function prepare(pal, pal565, nt) {
  const key = Math.round(nt * 64);
  if (key === triKey) return;
  triKey = key;
  const b = pal[C.BROTH], k = pal[C.KEY], f = pal[C.FILL];
  for (let ck = 0; ck <= 16; ck++) for (let cf = 0; cf <= ck; cf++) {
    const wb = 16 - ck, wk = ck - cf, wf = cf;
    const r = (r5(b) * wb + r5(k) * wk + r5(f) * wf + 8) >> 4;
    const g = (g5(b) * wb + g5(k) * wk + g5(f) * wf + 8) >> 4;
    const bl = (b5(b) * wb + b5(k) * wk + b5(f) * wf + 8) >> 4;
    TRI[ck * 17 + cf] = pack(r, g, bl);
  }
  // the pure colours exactly as the rest of the glass has them
  TRI[0] = pal565[C.BROTH]; TRI[16 * 17] = pal565[C.KEY]; TRI[16 * 17 + 16] = pal565[C.FILL];
}

/** Integer blend of two RGB565 values, a in 0..16. */
function blend565(d, s, a) {
  const dr = d >> 11, dg = (d >> 5) & 63, db = d & 31, sr = s >> 11, sg = (s >> 5) & 63, sb = s & 31;
  return ((((dr * (16 - a) + sr * a) >> 4) << 11) | (((dg * (16 - a) + sg * a) >> 4) << 5) | ((db * (16 - a) + sb * a) >> 4));
}

let bx0 = 0, by0 = 0, ux0 = 0, uy0 = 0, ux1 = 0, uy1 = 0;

/**
 * Stamp samples [a, b) of the centre line (screen coords SX, SY) with brush
 * radius R (px) into the buffer, which is placed with its top-left at
 * (ox, oy). Returns the number of buffer pixels touched (for the cost).
 */
function stamp(SX, SY, a, b, R, ox, oy) {
  bx0 = ox; by0 = oy;
  const R16 = (R * 16) | 0, R2 = R16 * R16;
  // the box the stamps cover
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (let k = a; k < b; k++) {
    if (SX[k] < mnx) mnx = SX[k]; if (SX[k] > mxx) mxx = SX[k];
    if (SY[k] < mny) mny = SY[k]; if (SY[k] > mxy) mxy = SY[k];
  }
  ux0 = Math.max(0, ((mnx - R) | 0) - 1 - ox); uy0 = Math.max(0, ((mny - R) | 0) - 1 - oy);
  ux1 = Math.min(BW, ((mxx + R) | 0) + 2 - ox); uy1 = Math.min(BH, ((mxy + R) | 0) + 2 - oy);
  if (ux1 <= ux0 || uy1 <= uy0) return 0;
  for (let y = uy0; y < uy1; y++) D.fill(FAR, y * BW + ux0, y * BW + ux1);
  let ops = (ux1 - ux0) * (uy1 - uy0);
  for (let k = a; k < b; k++) {
    const X = ((SX[k] - ox) * 16 + 0.5) | 0, Y = ((SY[k] - oy) * 16 + 0.5) | 0;
    let x0 = (X - R16) >> 4, x1 = (X + R16) >> 4, y0 = (Y - R16) >> 4, y1 = (Y + R16) >> 4;
    if (x0 < ux0) x0 = ux0; if (y0 < uy0) y0 = uy0; if (x1 >= ux1) x1 = ux1 - 1; if (y1 >= uy1) y1 = uy1 - 1;
    for (let y = y0; y <= y1; y++) {
      const dy = y * 16 + 8 - Y, dy2 = dy * dy;
      if (dy2 >= R2) continue;
      const row = y * BW;
      for (let x = x0; x <= x1; x++) {
        const dx = x * 16 + 8 - X, d2 = dx * dx + dy2;
        if (d2 < R2 && d2 < D[row + x]) { D[row + x] = d2; IX[row + x] = k - a; }
      }
    }
    ops += (x1 - x0 + 1) * (y1 - y0 + 1);
  }
  return ops;
}

/**
 * Draw one noodle. SX/SY: its centre line in screen coordinates, samples
 * [a, b). rf: fill radius, rk: keyline radius (>= rf), moat: clear broth
 * beyond the keyline (px). over: [oa, ob] the crossing window to draw on
 * top (or null); ends that are path ends keep their keyline.
 * Samples outside [m0, m1) are the noodle's ends going under the broth:
 * drawn thinning, in the submerged colour `bed`, without a keyline.
 */
export function drawNoodle(g, SX, SY, a, b, rf, rk, moat, over, m0 = a, m1 = b, bed = 0) {
  if (b - a < 1) return;
  const buf = g.buf;
  // place the buffer round the samples' box
  let mnx = 1e9, mny = 1e9;
  for (let k = a; k < b; k++) { if (SX[k] < mnx) mnx = SX[k]; if (SY[k] < mny) mny = SY[k]; }
  const bx = Math.floor(mnx - 8), by = Math.floor(mny - 8);
  const R = Math.min(6.45, rk + 0.5 + moat);
  let ops = stamp(SX, SY, a, b, R, bx, by);
  const f0 = (rf - 0.5) * 16, f1 = (rf + 0.5) * 16, k1 = (rk + 0.5) * 16;
  const broth = TRI[0];
  let px = 0;
  for (let y = uy0; y < uy1; y++) {
    const sy = y + by0;
    if (sy < 0 || sy >= H) continue;
    for (let x = ux0; x < ux1; x++) {
      const d2 = D[y * BW + x];
      if (d2 === FAR) continue;
      const sx = x + bx0;
      if (sx < 0 || sx >= W) continue;
      const d = SQ[d2];
      let v;
      const j = IX[y * BW + x] + a;
      if (j < m0 || j >= m1) {
        // under the surface: a dim strand thinning away from the noodle
        const q = j < m0 ? m0 - j : j - m1 + 1, rt = 26 - q * 2;
        v = d < rt ? bed : broth;
      } else if (d >= k1) v = broth;
      else if (d < f0) v = TRI[16 * 17 + 16];
      else {
        let ck = (k1 - d) | 0, cf = f1 - d; cf = cf <= 0 ? 0 : cf | 0;
        if (ck > 16) ck = 16; if (cf > ck) cf = ck;
        v = TRI[ck * 17 + cf];
      }
      buf[sy * W + sx] = v; px++;
    }
  }
  // the crossing: the over strand again, on top, with its keyline
  if (over) {
    const oa = Math.max(a, over[0]), ob = Math.min(b, over[1]);
    if (ob - oa > 2) {
      ops += stamp(SX, SY, oa, ob, Math.min(6.45, rk + 0.5), bx, by);
      const headOpen = oa > a, tailOpen = ob < b, m = ob - oa;
      for (let y = uy0; y < uy1; y++) {
        const sy = y + by0;
        if (sy < 0 || sy >= H) continue;
        for (let x = ux0; x < ux1; x++) {
          const i = y * BW + x, d2 = D[i];
          if (d2 === FAR) continue;
          const sx = x + bx0;
          if (sx < 0 || sx >= W) continue;
          const d = SQ[d2];
          if (d >= k1) continue;
          const j = IX[i], junction = (headOpen && j < 3) || (tailOpen && j >= m - 3);
          let cf = f1 - d; cf = cf <= 0 ? 0 : cf >= 16 ? 16 : cf | 0;
          if (junction) { if (cf >= 16) buf[sy * W + sx] = TRI[16 * 17 + 16]; continue; }
          let ck = (k1 - d) | 0; if (ck > 16) ck = 16;
          if (ck >= 16) buf[sy * W + sx] = TRI[16 * 17 + cf];
          else if (ck > 0) buf[sy * W + sx] = blend565(buf[sy * W + sx], TRI[16 * 17 + ((cf * 16) / ck | 0)], ck);
          px++;
        }
      }
    }
  }
  g.cost.box += ops * 3 + px * 3; g.cost.px += px;
}
