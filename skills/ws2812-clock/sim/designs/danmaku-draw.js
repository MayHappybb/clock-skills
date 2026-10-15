// Danmaku drawing primitives on a 192 x 192 float raster (linear RGB):
// glowing orbs, the moat mask, the boss core and the frog ship.
import * as kit from '../js/kit.js';

export const W = 192, H = 192, CX = 95.5, CY = 95.5;
export const bg = new Float32Array(W * H * 3);    // patterns, boss, frog, items
export const dl = new Float32Array(W * H * 3);    // the numerals
export const moat = new Float32Array(W * H);      // where the numerals push the ground dark

export function clear() { bg.fill(0); dl.fill(0); moat.fill(0); }

/** A danmaku orb: coloured body with antialiased edge, soft glow, white core. */
export function orb(buf, x, y, r, c, a, core = 1, glow = 0.35) {
  const R = r + 2.2;
  const x0 = Math.max(0, Math.ceil(x - R)), x1 = Math.min(W - 1, Math.floor(x + R));
  const y0 = Math.max(0, Math.ceil(y - R)), y1 = Math.min(H - 1, Math.floor(y + R));
  const c0 = c[0] * a, c1 = c[1] * a, c2 = c[2] * a, wr = r * 0.5 + 0.5, wa = core * a;
  for (let py = y0; py <= y1; py++) {
    const dy = py - y, row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R) continue;
      let cov = r + 0.5 - d; cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
      const g = 1 - d / R, body = cov + glow * g * g;
      let wh = wr - d; wh = wh < 0 ? 0 : wh > 1 ? 1 : wh;
      wh *= wa;
      const o = 3 * (row + px);
      buf[o] += c0 * body + wh; buf[o + 1] += c1 * body + wh; buf[o + 2] += c2 * body + wh;
    }
  }
}
/** Mark a dark disc of radius r around (x, y) in the moat mask (max). */
export function moatDisc(x, y, r, a = 1) {
  const x0 = Math.max(0, Math.ceil(x - r - 1)), x1 = Math.min(W - 1, Math.floor(x + r + 1));
  const y0 = Math.max(0, Math.ceil(y - r - 1)), y1 = Math.min(H - 1, Math.floor(y + r + 1));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, dy = py - y;
      let m = (r + 0.5 - Math.sqrt(dx * dx + dy * dy)) * a;
      if (m <= 0) continue;
      if (m > a) m = a;
      const p = py * W + px;
      if (m > moat[p]) moat[p] = m;
    }
  }
}

const GOLD = kit.hex('#ffb43a'), CRIM = kit.hex('#e0103a'), ROSE = kit.hex('#ff4f7a'), DEEP = kit.hex('#5a0820');
/**
 * The boss: a glowing eye in a ring of eight petals, a dashed gold ring and
 * twelve turrets. spin: extra rotation (hour reassembly); spread: ring
 * radius gain; look: [dx, dy] unit vector to the frog; hit: shot sparks 0..1.
 */
export function boss(T, { spin = 0, spread = 0, look = [0, 1], blink = 1, hot = 0, dim = 1 }) {
  const Rb = 28 + spread * 18;
  const x0 = Math.ceil(CX - Rb), x1 = Math.floor(CX + Rb), y0 = Math.ceil(CY - Rb), y1 = Math.floor(CY + Rb);
  const sec = kit.TAU / 8, ph = -kit.TAU * T / 24 - spin, rg = kit.TAU * T / 30 + spin * 1.5;
  const ex = CX + look[0] * 1.5, ey = CY + look[1] * 1.5;
  const pr0 = 8 + spread * 6, pr1 = 17 + spread * 10, ring = 19.5 + spread * 14, outer = 26 + spread * 18;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - CX, dy = py - CY, d = Math.sqrt(dx * dx + dy * dy);
      if (d > Rb) continue;
      let r = 0, g = 0, b = 0;
      // halo
      const hal = 1 - d / Rb; r += 0.05 * hal * hal * (1 + hot); g += 0.004 * hal; b += 0.012 * hal * hal;
      if (d > pr0 - 1 && d < pr1 + 1) {
        let a = Math.atan2(dy, dx) - ph; a -= Math.floor(a / sec) * sec; a = Math.abs(a - sec / 2);
        const u = (d - pr0) / (pr1 - pr0), w = 0.36 * Math.sin(Math.PI * kit.clamp(u)) + 0.02;
        const cov = kit.clamp((w - a) * d + 0.5) * (u > 0 && u < 1 ? 1 : 0);
        const edge = kit.clamp(1 - Math.abs((w - a) * d - 0.8));
        const vein = kit.clamp(1 - a * d * 1.6) * 0.5, k = cov * (0.12 + 0.3 * u) * (1 - vein);
        r += DEEP[0] * cov * 0.6 + ROSE[0] * (k + 0.75 * edge * cov); g += ROSE[1] * (k + 0.5 * edge * cov) * 0.6; b += ROSE[2] * (k + 0.5 * edge * cov) * 0.6;
      }
      // inner rim and dashed ring
      r += GOLD[0] * 0.55 * kit.clamp(1 - Math.abs(d - pr0)); g += GOLD[1] * 0.55 * kit.clamp(1 - Math.abs(d - pr0));
      const dr = kit.clamp(1.1 - Math.abs(d - ring));
      if (dr > 0) {
        const dash = 0.5 + 0.5 * Math.cos(16 * (Math.atan2(dy, dx) - rg));
        r += GOLD[0] * 0.5 * dr * dash; g += GOLD[1] * 0.5 * dr * dash; b += GOLD[2] * 0.5 * dr * dash;
      }
      const ol = kit.clamp(0.9 - Math.abs(d - outer)) * 0.18;
      r += GOLD[0] * ol; g += GOLD[1] * ol;
      // the eye: a gold-rimmed socket, a glowing iris and a slit pupil that follows the frog
      const sx = dx / 7.2, sy = dy / (7.2 * blink + 0.01), sd = Math.sqrt(sx * sx + sy * sy);
      if (sd < 1.2) {
        const sc = kit.clamp((1 - sd) * 7.2 + 0.5), rimc = kit.clamp(1 - Math.abs(sd - 1) * 7.2) * 0.8;
        const ix = px - ex, iy = py - ey, id = Math.sqrt(ix * ix + iy * iy);
        const ic = kit.clamp(5.3 - id) * sc, glow = kit.clamp(1 - id / 5.3);
        const slit = kit.clamp(1.0 - Math.abs(ix) * 1.1 - Math.max(0, Math.abs(iy) - 2.6)) * sc;
        const gl = kit.clamp(1.1 - Math.hypot(ix + 1.6, iy + 1.8)) * sc;
        const lit = ic * (0.35 + 0.65 * glow * glow) * (1 - slit) * (1 + hot);
        const scl = 0.16 * sc * (1 - ic);
        r = r * (1 - sc) + scl + lit * 1.0 + GOLD[0] * rimc + gl;
        g = g * (1 - sc) + scl * 0.05 + lit * (0.12 + 0.5 * glow * glow) + GOLD[1] * rimc + gl * 0.9;
        b = b * (1 - sc) + scl * 0.15 + lit * 0.04 + GOLD[2] * rimc + gl * 0.8;
      }
      const o = 3 * (py * W + px);
      bg[o] += r * dim; bg[o + 1] += g * dim; bg[o + 2] += b * dim;
    }
  }
  // turrets
  const tr = 22.8 + spread * 20, out = [];
  for (let k = 0; k < 12; k++) {
    const a = -rg * 0.7 + (k * kit.TAU) / 12 + spin * 0.5;
    const x = CX + tr * Math.cos(a), y = CY + tr * Math.sin(a);
    orb(bg, x, y, 1.7, GOLD, 0.7 * dim, 0.4 + 0.6 * hot, 0.3);
    out.push([x, y, a]);
  }
  return out;
}
