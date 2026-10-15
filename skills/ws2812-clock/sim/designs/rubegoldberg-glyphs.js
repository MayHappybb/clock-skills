// Rube Goldberg: signwriter's numerals, painted on wood.
//
// Each digit is a brush centre-line in a 10 x 16 unit box (y down). The
// brush is broad-nibbed with vertical stress: its width follows the stroke's
// direction (thick on downstrokes, hairline across), with ball terminals, as
// a sign painter's Clarendon numerals are. Rasterised once by 4x4 coverage
// at the size each mechanism needs, then painted onto wooden cards with a
// signwriter's drop shade.
import * as kit from '../js/kit.js';

const THICK = 2.55, THIN = 0.9;

function arc(cx, cy, rx, ry, a0, a1, step = 4) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function quad(ax, ay, cx, cy, bx, by, n = 24) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
  }
  return pts;
}
const line = (ax, ay, bx, by) => [[ax, ay], [bx, by]];

// A stroke is { p: points, w: 'auto' | fixed width }, a ball is { ball: [x, y, r] }.
const S = (p, w = 'auto') => ({ p, w });
const B = (x, y, r) => ({ ball: [x, y, r] });

export const DIGITS = {
  0: [S(arc(5, 8, 4.1, 7.2, 0, 360))],
  1: [S(line(5.8, 0.5, 5.8, 15.5)), S(quad(5.8, 0.5, 4.6, 2.6, 2.3, 3.6), 1.3), S(line(2.9, 15.4, 8.7, 15.4), 1.6)],
  2: [B(2.05, 4.3, 1.35), S([...arc(5.1, 4.7, 3.75, 3.95, 190, 400), ...quad(7.97, 7.24, 3.6, 11.2, 1.0, 15.25).slice(1)]),
      S(line(1.0, 15.25, 9.3, 15.25), 1.75), S(line(9.3, 15.25, 9.3, 13.8), 1.3)],
  3: [B(1.95, 3.7, 1.25), S(arc(5, 4.25, 3.5, 3.7, 200, 455)), S(arc(5, 11.45, 4.15, 4.05, 255, 520)), B(1.15, 12.85, 1.35)],
  4: [S(line(7.2, 0.5, 0.75, 11.0), 1.15), S(line(0.75, 11.0, 9.6, 11.0), 1.5), S(line(7.2, 0.5, 7.2, 15.5)),
      S(line(4.9, 15.4, 9.4, 15.4), 1.5)],
  5: [S(line(9.0, 1.0, 2.75, 1.0), 1.7), S(line(9.0, 1.0, 9.0, 2.4), 1.2), S(line(2.75, 1.0, 2.35, 7.2)),
      S(arc(5.0, 10.75, 4.05, 4.6, 232, 515)), B(1.35, 12.7, 1.35)],
  6: [B(8.25, 2.55, 1.25), S(arc(5.6, 9.2, 4.55, 8.0, 302, 178)), S(arc(5.0, 11.2, 4.0, 4.3, 0, 360))],
  7: [S(line(0.8, 1.0, 9.3, 1.0), 1.7), S(line(0.8, 1.0, 0.8, 2.6), 1.3), S(quad(9.3, 1.0, 5.4, 6.8, 4.3, 15.4))],
  8: [S(arc(5, 4.3, 3.45, 3.85, 0, 360)), S(arc(5, 11.6, 4.15, 4.15, 0, 360))],
  9: [S(arc(5.0, 4.8, 4.0, 4.3, 0, 360)), S(arc(4.4, 7.0, 4.6, 8.0, 0, 122)), B(2.0, 13.8, 1.25)],
};

/** Coverage mask (Float32Array w*h, 0..1) of digit d drawn into a w x h px box. */
export function digitMask(d, w, h) {
  const SS = 4, sw = w * SS, sh = h * SS, hit = new Uint8Array(sw * sh);
  const kx = sw / 10, ky = sh / 16;
  const disc = (ux, uy, ur) => {
    const cx = ux * kx, cy = uy * ky, rx = ur * kx, ry = ur * ky;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(sw - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(sh - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) hit[y * sw + x] = 1;
    }
  };
  for (const st of DIGITS[d]) {
    if (st.ball) { disc(...st.ball); continue; }
    const p = st.p;
    for (let k = 0; k + 1 < p.length; k++) {
      const [ax, ay] = p[k], [bx, by] = p[k + 1], L = Math.hypot(bx - ax, by - ay) || 1e-6;
      const ty = Math.abs(by - ay) / L;
      const wd = st.w === 'auto' ? THIN + (THICK - THIN) * ty ** 1.6 : st.w;
      const n = Math.ceil(L / 0.06);
      for (let j = 0; j <= n; j++) disc(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, wd / 2);
    }
  }
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) s += hit[(y * SS + j) * sw + x * SS + i];
    m[y * w + x] = s / (SS * SS);
  }
  return m;
}

export const CREAM = kit.hex('#fff1cf');
const SHADE = kit.hex('#3a0a04');

/**
 * A wooden card W x H with digit d painted on it (glyph gw x gh at gx, gy):
 * grain, bevelled edges, drop shade, cream numeral. Returns Float32Array RGB.
 */
export function makeCard(d, W, H, { wood, gx = 2, gy = 2, gw = 20, gh = 32, seed = 0, grain = 0.35, bevel = 0.5 } = {}) {
  const img = new Float32Array(3 * W * H), m = digitMask(d, gw, gh);
  const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : m[y * gw + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // wood: long grain along x, with rings wobbling
    const g = kit.fract(y * 0.33 + 2.2 * kit.noise2(x * 0.05 + seed * 7.1, y * 0.22 + seed) + seed * 0.37);
    let f = 1 - grain * kit.smoothstep(0.55, 0.95, g) + 0.15 * (kit.noise2(x * 0.4 + seed, y * 0.9) - 0.5);
    if (x === 0 || y === 0) f *= 1 + bevel;                 // light catches the top/left bevel
    if (x === W - 1 || y === H - 1) f *= 1 - bevel * 0.8;   // shadowed bottom/right
    let r = wood[0] * f, gg = wood[1] * f, b = wood[2] * f;
    const lx = x - gx, ly = y - gy;
    const sh = Math.max(at(lx - 1, ly - 1), at(lx - 1, ly) * 0.8, at(lx, ly - 1) * 0.8, at(lx - 2, ly - 2) * 0.85, at(lx - 2, ly - 1) * 0.6);
    if (sh > 0) { r += (SHADE[0] - r) * sh; gg += (SHADE[1] - gg) * sh; b += (SHADE[2] - b) * sh; }
    const c = at(lx, ly);
    if (c > 0) { r += (CREAM[0] - r) * c; gg += (CREAM[1] - gg) * c; b += (CREAM[2] - b) * c; }
    const p = 3 * (y * W + x);
    img[p] = r; img[p + 1] = gg; img[p + 2] = b;
  }
  return img;
}
