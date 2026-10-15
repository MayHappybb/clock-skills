// Light and fire for the Birthday face: the per-pixel lighting of the room,
// candle flames, glow, and smoke ribbons. All draw into a 128 x 128 linear
// RGB float image.
import * as kit from '../js/kit.js';
import { W, H, SA, CA } from './candles-scene.js';

const VX = 0, VY = SA, VZ = CA;                      // toward the viewer
export const K2 = 20 * 20;                           // light falloff radius^2

// flame colour by "heat" 0..1, precomputed black-body
const LUT = 64, FL = new Float32Array(3 * (LUT + 1));
for (let k = 0; k <= LUT; k++) {
  const h = k / LUT, c = kit.blackbody(1650 + 2900 * h * h);
  const v = 0.55 + 0.95 * h ** 0.7;
  FL[3 * k] = c[0] * v; FL[3 * k + 1] = c[1] * v; FL[3 * k + 2] = c[2] * v;
}
export const FLAME_LIGHT = kit.mix(kit.blackbody(2300), [1, 0.8, 0.6], 0.35);

/**
 * Light every scene pixel. lights: flat array [x, y, z, r, g, b] * n (world,
 * colour already times intensity). amb: room light [r, g, b].
 */
export function lightScene(img, S, lights, nl, amb) {
  const { P, N, A, G, type } = S;
  for (let p = 0; p < W * H; p++) {
    if (!type[p]) continue;
    const px = P[3 * p], py = P[3 * p + 1], pz = P[3 * p + 2];
    const nx = N[3 * p], ny = N[3 * p + 1], nz = N[3 * p + 2], g = G[p];
    let r = amb[0], gg = amb[1], b = amb[2], sr = 0, sg = 0, sb = 0;
    for (let k = 0; k < nl; k++) {
      const o = 6 * k;
      const lx = lights[o] - px, ly = lights[o + 1] - py, lz = lights[o + 2] - pz;
      const d2 = lx * lx + ly * ly + lz * lz, inv = 1 / Math.sqrt(d2 + 1e-6);
      const ndl = (nx * lx + ny * ly + nz * lz) * inv;
      const w = (ndl + 0.3) / 1.3;
      if (w <= 0) continue;
      const f = (1 / (1 + d2 / K2) - 0.035) * 1.04;
      if (f <= 0) continue;
      r += lights[o + 3] * w * f; gg += lights[o + 4] * w * f; b += lights[o + 5] * w * f;
      if (g > 0) {
        let hx = lx * inv + VX, hy = ly * inv + VY, hz = lz * inv + VZ;
        const hl = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
        let nh = (nx * hx + ny * hy + nz * hz) * hl;
        if (nh > 0.8) {
          nh *= nh; nh *= nh; nh *= nh; nh *= nh; nh *= nh;   // ^32
          const s = nh * g * f * 1.6;
          sr += lights[o + 3] * s; sg += lights[o + 4] * s; sb += lights[o + 5] * s;
        }
      }
    }
    img[3 * p] = A[3 * p] * r + sr; img[3 * p + 1] = A[3 * p + 1] * gg + sg; img[3 * p + 2] = A[3 * p + 2] * b + sb;
  }
}

/** Diffuse + wrap light at one world point with a normal: writes out[0..2]. */
export function lightAt(out, px, py, pz, nx, ny, nz, lights, nl, wrap, amb) {
  let r = amb[0], g = amb[1], b = amb[2];
  for (let k = 0; k < nl; k++) {
    const o = 6 * k;
    const lx = lights[o] - px, ly = lights[o + 1] - py, lz = lights[o + 2] - pz;
    const d2 = lx * lx + ly * ly + lz * lz, inv = 1 / Math.sqrt(d2 + 1e-6);
    const w = ((nx * lx + ny * ly + nz * lz) * inv + wrap) / (1 + wrap);
    if (w <= 0) continue;
    const f = w / (1 + d2 / K2);
    r += lights[o + 3] * f; g += lights[o + 4] * f; b += lights[o + 5] * f;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

/**
 * A candle flame standing on (x, y) (the wick tip, screen px): height h,
 * half width w, the tip pushed sideways by `sway` px, brightness `a`.
 */
export function drawFlame(img, x, y, h, w, sway, a, t, seed) {
  if (a <= 0.003 || h < 0.3) return;
  const x0 = Math.max(0, Math.floor(x - w * 1.3 - Math.abs(sway) - 2)), x1 = Math.min(W - 1, Math.ceil(x + w * 1.3 + Math.abs(sway) + 2));
  const y0 = Math.max(0, Math.floor(y - h * 1.2 - 2)), y1 = Math.min(H - 1, Math.ceil(y + 2));
  const ph = t * 9.3 + seed, ph2 = t * 14.7 + seed * 2.1;
  for (let yy = y0; yy <= y1; yy++) {
    const u = (y - (yy + 0.5)) / h;
    if (u < -0.18 || u >= 0.999) continue;
    const uu = (u + 0.18) / 1.18, up = u > 0 ? u : 0;
    const xc = x + sway * up ** 1.6 + 0.35 * Math.sin(ph + u * 3) * up + 0.3 * Math.sin(ph2 - u * 5) * up * up;
    // a teardrop: a round bulb low down, drawn to a point at the tip
    const wu = (uu < 0.32 ? w * Math.sqrt(Math.max(0, 1 - ((uu - 0.32) / 0.32) ** 2)) : w * (1 - (uu - 0.32) / 0.68) ** 1.25) + 0.15;
    for (let xx = x0; xx <= x1; xx++) {
      const q = Math.abs(xx + 0.5 - xc) / wu;
      if (q > 1.25) continue;
      const dens = q < 0.85 ? 1 : 1 - (q - 0.85) / 0.4;
      const q2 = q < 1 ? 1 - q * q : 0;
      let heat = (q < 1 ? (1 - q) ** 0.9 : 0) * (1.35 - 1.5 * Math.abs(uu - 0.32)) + 0.08 * (1 - uu);
      if (heat < 0) heat = 0;
      if (heat > 1) heat = 1;
      const k = 3 * Math.round(heat * LUT), o = 3 * (yy * W + xx);
      let r = FL[k], g = FL[k + 1], b = FL[k + 2];
      if (u < 0.28) {                                  // the blue bead at the root
        const bl = (1 - Math.max(0, u) / 0.28) * (0.3 + 0.7 * (1 - q2)) * 0.8;
        r = r * (1 - bl) + 0.08 * bl; g = g * (1 - bl) + 0.16 * bl; b = b * (1 - bl) + 0.9 * bl;
      }
      const s = dens * a;
      img[o] += r * s; img[o + 1] += g * s; img[o + 2] += b * s;
    }
  }
}

/** A soft round glow (light in the air, as the smoked acrylic sees it). */
export function glow(img, x, y, rad, c, a) {
  if (a <= 0.002) return;
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.ceil(x + rad));
  const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(H - 1, Math.ceil(y + rad));
  const ir = 1 / (rad * rad);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx + 0.5 - x, dy = yy + 0.5 - y, q = 1 - (dx * dx + dy * dy) * ir;
    if (q <= 0) continue;
    const f = a * q * q * q, o = 3 * (yy * W + xx);
    img[o] += c[0] * f; img[o + 1] += c[1] * f; img[o + 2] += c[2] * f;
  }
}

/** A soft dot, additive, sub-pixel. */
export function dot(img, x, y, rad, r, g, b) {
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.floor(x + rad));
  const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(H - 1, Math.floor(y + rad));
  const ir = 1 / (rad * rad);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx + 0.5 - x, dy = yy + 0.5 - y, q = 1 - (dx * dx + dy * dy) * ir;
    if (q <= 0) continue;
    const o = 3 * (yy * W + xx), f = q * q;
    img[o] += r * f; img[o + 1] += g * f; img[o + 2] += b * f;
  }
}

/**
 * A smoke ribbon from (x, y), emitted from time e0 to e1 (seconds, same
 * clock as t) at density dens. Rises at `rise` px/s and curls.
 */
export function smoke(img, x, y, t, e0, e1, dens, seed, rise = 9, col = [0.5, 0.45, 0.42]) {
  for (let s = 0.5; s < 40; s += 0.8) {
    const te = t - s / rise;                     // when this parcel left the wick
    if (te < e0 || te > e1) continue;
    const age = t - te, fade = Math.exp(-s / 16) * Math.min(1, (te - e0) * 4 + 0.2) * Math.min(1, (e1 - te) * 3 + 0.3);
    const curl = (0.4 + s * 0.09) * Math.sin(s * 0.28 - t * 1.6 + seed) + 0.25 * s * Math.sin(seed * 3 + age * 0.4) * 0.15;
    const a = dens * fade;
    if (a < 0.01) continue;
    dot(img, x + curl, y - s, 0.9 + s * 0.035, col[0] * a, col[1] * a, col[2] * a);
  }
}
