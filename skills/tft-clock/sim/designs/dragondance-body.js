// The dragons' bodies for "dragondance": stamping the centre lines into a
// distance buffer, then printing it as a woodblock would.
//
// Each body is the union of discs round its N samples. Every disc is stamped
// into one screen-sized buffer that keeps, per pixel, the smallest squared
// distance (x16, integer), which sample won (slot << 8 | index) and the
// signed offset across the body at that sample (x16; + is the back). The
// print pass then reads, per pixel: the ink keyline at the edge, the
// serrated dorsal teeth on the back, the gold belly band on the counter
// side, and the scales between, all in flat inks. The scales and teeth are
// indexed by the sample's arc length plus a running phase, so the body's
// pattern travels along the digit while its outline stays put.
//
// Cost: per sample a 13 x 13 stamp (~6 integer ops a pixel), per body pixel
// a few table lookups; billed as box work.

import { N } from './dragondance-glyphs.js';

const W = 160, H = 80, NP = W * H;
export const R = 3.7;                       // body radius, px
const TOOTH_H = 3.2, TOOTH_P = 6.0;         // dorsal teeth: height and pitch along the body, px
const RM = R + TOOTH_H + 0.3;               // how far a disc can reach
const STAMP = Math.ceil(RM);
const KEY = 1.25;                           // keyline width, px
const BELLY = 1.3;                          // gold belly band width inside the keyline

export const D = new Float32Array(NP);      // power distance d^2 - r^2 (an int16 x16 on the device)
export const ID = new Uint16Array(NP);      // slot << 8 | sample
export const VV = new Int8Array(NP);        // signed offset across the body x16, + = back
const FAR = 1e9;
D.fill(FAR);
const LIMQ = Math.ceil(RM * RM * 16) + 1;
const LIMP = (RM * RM) - (R * R) * 0.1;      // nothing beyond this power distance can print

// sqrt of q/16 for every q a body pixel can have
const SQ = new Float32Array(LIMQ + 1);
for (let q = 0; q <= LIMQ; q++) SQ[q] = Math.sqrt(q / 16);

export function clearBox(x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  for (let y = y0; y < y1; y++) D.fill(FAR, y * W + x0, y * W + x1);
  return Math.max(0, (x1 - x0) * (y1 - y0));
}

/**
 * Stamp one body: N samples (X, Y, NX, NY, BACK) for slot `slot`.
 * Returns the number of pixels scanned (for the bill).
 */
// sqrt of q/4 for the stamp's row half-widths (q up to (RM + 1)^2 * 4)
const HWN = Math.ceil((RM + 1) * (RM + 1) * 4) + 1;
const HW = new Float32Array(HWN);
for (let q = 0; q < HWN; q++) HW[q] = Math.sqrt(q / 4);

export const BOX = [W, H, 0, 0];           // the union of what was stamped this frame
export function resetBox() { BOX[0] = W; BOX[1] = H; BOX[2] = 0; BOX[3] = 0; }

export function stamp(slot, X, Y, NX, NY, BACK, RAD, step) {
  let n = 0;
  const tag = slot << 8;
  // discs ~1.5 px apart are enough: the scallop between them is under 0.1 px
  const skip = Math.max(1, Math.floor(1.5 / step));
  for (let i = 0; i < N; i += skip) {
    if (i + skip >= N && i !== N - 1) i = N - 1;   // always the last one (the neck)
    const cx = X[i], cy = Y[i], r = RAD[i], nx = NX[i] * BACK[i], ny = NY[i] * BACK[i], r2 = r * r;
    const reach = r + TOOTH_H * (r / R) + 0.4, reach2 = reach * reach;
    // integer floors by offset truncation, a table for the row half-widths: no float library calls
    let ya = ((cy - reach + 64) | 0) - 64, yb = ((cy + reach + 64) | 0) - 64;
    if (ya < 0) ya = 0; if (yb > H - 1) yb = H - 1;
    for (let y = ya; y <= yb; y++) {
      const dy = y + 0.5 - cy, h2 = reach2 - dy * dy, hw = h2 > 0 ? HW[(h2 * 4) | 0] : 0, row = y * W;
      let xa = ((cx - hw + 64) | 0) - 64, xb = ((cx + hw + 64) | 0) - 64;
      if (xa < 0) xa = 0; if (xb > W - 1) xb = W - 1;
      for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - cx, p = dx * dx + dy * dy - r2;
        const k = row + x;
        if (p < D[k]) { D[k] = p; ID[k] = tag | i; VV[k] = ((dx * nx + dy * ny) * 16) | 0; }
      }
      if (xb >= xa) n += xb - xa + 1;
      if (xa < BOX[0]) BOX[0] = xa; if (xb + 1 > BOX[2]) BOX[2] = xb + 1;
    }
    if (ya < BOX[1]) BOX[1] = ya; if (yb + 1 > BOX[3]) BOX[3] = yb + 1;
  }
  return n;
}

/**
 * Print the stamped bodies over the box into the canvas buffer.
 * `ink[slot]` = { body, scale, belly, key } as RGB565; `step[slot]` the
 * sample spacing; `flow[slot]` the pattern phase (px along the body).
 * `hide[slot]` (optional) a sample index below which nothing prints.
 */
export function print(buf, x0, y0, x1, y1, ink, step, flow, rads, flash) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) {
      const k = row + x, p = D[k];
      if (p >= LIMP) continue;
      const id = ID[k], s = id >> 8, i = id & 255, P = ink[s], r = rads[s][i];
      const q = ((p + r * r) * 16) | 0;
      if (q >= LIMQ) continue;
      const d = SQ[q], v = VV[k] / 16;
      const u0 = i * step[s], u = u0 + flow[s], fl = u0 - flash[s];
      let lim = r;
      if (v > 0.6 && r > R * 0.75) {
        let f = (u / TOOTH_P) % 1; if (f < 0) f += 1;
        const tri = f < 0.5 ? 2 * f : 2 - 2 * f;
        lim = r + TOOTH_H * (r / R) * tri * (v / d);   // teeth stand on the back, along the normal
      }
      if (d > lim) continue;
      n++;
      let c;
      if (d > lim - KEY) c = P.key;
      else if (v > 0 && d > r - 0.7) c = P.fin;
      else if (v < -(r - KEY - BELLY)) {
        let f = (u / 2.5) % 1; if (f < 0) f += 1;
        c = f < 0.28 ? P.tick : P.belly;
      } else {
        // scales: chevrons pointing to the head, travelling with the body
        let f = ((u + (v > 0.4 ? v - 0.4 : 0.4 - v) * 1.2) / 4.0) % 1; if (f < 0) f += 1;
        c = f < 0.2 || (fl > 0 && fl < 7) ? P.scale : P.body;
      }
      buf[k] = c;
    }
  }
  return n;
}
