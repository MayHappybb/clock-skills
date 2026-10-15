// Trainset numerals: toy-shop Clarendon figures, cut from wood, painted in
// one golden lacquer and bevelled. Thick verticals, thinner joins, ball
// terminals, slab feet: the lettering of a tin-toy goods wagon. Each figure
// is 22 x 32 px; the sprite adds a 2 px margin for a black keyline (the
// dark moat that keeps it clear of the scenery behind).
import { Canvas } from './trainset-paint.js';
import { noise2 } from '../js/kit.js';

export const GW = 22, GH = 32, M = 2, SW = GW + 2 * M, SH = GH + 2 * M;
const SS = 8;
const INK = [1, 1, 1];

/** Variable-width arc stroke: angles in degrees (y down), width w(angle). */
function arc(cv, cx, cy, r, a0, a1, w, n = 28) {
  let prev = null;
  for (let k = 0; k <= n; k++) {
    const a = (a0 + (a1 - a0) * (k / n)) * Math.PI / 180;
    const p = [cx + r * Math.cos(a), cy + r * Math.sin(a), w(a)];
    if (prev) cv.line(M + prev[0], M + prev[1], M + p[0], M + p[1], [prev[2], p[2]], INK);
    prev = p;
  }
}
const stress = (thin, thick) => (a) => thin + (thick - thin) * Math.abs(Math.cos(a));
const pt = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];

// Each draws into the canvas in glyph coordinates (shifted by the margin).
const R = (cv, x0, y0, x1, y1) => cv.rect(M + x0, M + y0, M + x1, M + y1, INK);
const RR = (cv, x0, y0, x1, y1, r) => cv.rrect(M + x0, M + y0, M + x1, M + y1, r, INK);
const E = (cv, x, y, rx, ry, col = INK) => cv.ellipse(M + x, M + y, rx, ry, col);
const C = (cv, x, y, r) => cv.circle(M + x, M + y, r, INK);
const Ln = (cv, ax, ay, bx, by, w) => cv.line(M + ax, M + ay, M + bx, M + by, w, INK);
const P = (cv, pts) => cv.poly(pts.map(([x, y]) => [M + x, M + y]), INK);
const Bz = (cv, p0, p1, p2, wa, wb) => cv.bez([M + p0[0], M + p0[1]], [M + p1[0], M + p1[1]], [M + p2[0], M + p2[1]], wa, wb, INK);

const DRAW = {
  0(cv) { E(cv, 11, 16, 11, 16); E(cv, 11, 16, 4.6, 11.0, 'erase'); },
  1(cv) {
    R(cv, 8.2, 0.2, 14.8, 29);
    P(cv, [[8.6, 0.2], [2.0, 5.2], [2.2, 9.0], [8.6, 6.6]]);
    RR(cv, 2.6, 27.6, 20.4, 32, 1);
    // brackets where stem meets slab
    P(cv, [[5.2, 27.8], [8.2, 24.6], [8.2, 27.8]]); P(cv, [[17.8, 27.8], [14.8, 24.6], [14.8, 27.8]]);
  },
  2(cv) {
    arc(cv, 11, 10.0, 7.3, 200, 382, stress(3.5, 6.2));
    C(cv, ...pt(11, 10.0, 7.3, 200), 3.8);
    Ln(cv, ...pt(11, 10.0, 7.3, 382), 2.8, 28.6, [6.0, 4.4]);
    R(cv, 0.8, 27.8, 21.4, 32);
    R(cv, 18.4, 23.8, 21.4, 32);
  },
  3(cv) {
    arc(cv, 10.6, 8.5, 6.6, 206, 450, stress(3.5, 6.0));
    C(cv, ...pt(10.6, 8.5, 6.6, 206), 3.6);
    arc(cv, 10.6, 21.6, 7.7, -90, 154, stress(3.6, 6.6));
    C(cv, ...pt(10.6, 21.6, 7.7, 154), 3.9);
    Ln(cv, 10.6, 14.5, 7.4, 14.5, 3.4);
  },
  4(cv) {
    R(cv, 12.6, 0.2, 18.8, 29);
    RR(cv, 9.2, 27.8, 22, 32, 1);
    Ln(cv, 15.0, 1.6, 1.4, 21.8, 3.9);
    R(cv, 0.6, 20.4, 22, 24.8);
  },
  5(cv) {
    R(cv, 5.2, 0.2, 20.6, 4.5);
    R(cv, 17.8, 0.2, 21.0, 7.6);
    R(cv, 4.0, 0.2, 9.0, 14.6);
    arc(cv, 10.8, 20.6, 7.6, -128, 154, stress(3.6, 6.6));
    C(cv, ...pt(10.8, 20.6, 7.6, 154), 3.9);
  },
  6(cv) {
    E(cv, 11, 21.2, 10.8, 10.6);
    Bz(cv, [3.4, 21], [3.2, 4.2], [14.0, 3.6], 6.6, 3.4);
    C(cv, 15.4, 4.4, 3.8);
    E(cv, 11.4, 21.6, 4.4, 4.8, 'erase');
  },
  7(cv) {
    R(cv, 1.0, 0.2, 21.4, 4.6);
    R(cv, 1.0, 0.2, 4.0, 8.4);
    Bz(cv, [20.0, 3.0], [10.6, 13.6], [9.8, 31.4], 3.8, 6.8);
  },
  8(cv) {
    E(cv, 11, 8.4, 8.4, 8.2); E(cv, 11, 22.4, 10.8, 9.6);
    E(cv, 11, 8.4, 3.3, 3.5, 'erase'); E(cv, 11, 22.6, 4.6, 4.8, 'erase');
  },
};

/** Chamfer distance transform (1, sqrt2) of mask m (1 inside): distance to nearest 0. */
function dt(m, W, H) {
  const BIG = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = m[i] ? BIG : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); }
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) v = Math.min(v, 1);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); }
    d[i] = v;
  }
  return d;
}

const FACE = [1.0, 0.46, 0.0], HI = [1.0, 0.86, 0.42], LO = [0.36, 0.09, 0.0];

function build(n) {
  const cv = new Canvas(SW, SH, SS);
  if (n === 9) { DRAW[6](cv); cv.a.reverse(); } else DRAW[n](cv);
  const W = cv.W, H = cv.H, m = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { m[i] = cv.a[i] > 0.5 ? 1 : 0; o[i] = 1 - m[i]; }
  const din = dt(m, W, H), dout = dt(o, W, H);
  const px = new Float32Array(4 * SW * SH), nS = SS * SS;
  const Lx = -0.62, Ly = -0.78, bevel = 1.5 * SS;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    let r = 0, g = 0, b = 0, cov = 0, key = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const X = x * SS + i, Y = y * SS + j, p = Y * W + X;
      if (m[p]) {
        const d = din[p];
        // outward normal from the distance gradient
        const gx = (din[p - 1] ?? 0) - (din[p + 1] ?? 0), gy = (din[p - W] ?? 0) - (din[p + W] ?? 0);
        const gl = Math.hypot(gx, gy) || 1;
        const lam = (gx / gl) * Lx + (gy / gl) * Ly;
        const bv = d < bevel ? 1 - (d / bevel) ** 2 : 0;
        const grain = 0.9 + 0.1 * Math.sin((Y / SS) * 1.9 + 3.2 * noise2((X / SS) * 0.35 + n * 7, (Y / SS) * 0.5));
        let c0 = FACE[0] * grain, c1 = FACE[1] * grain, c2 = FACE[2];
        if (bv > 0) {
          const t = Math.abs(lam) * bv, T = lam > 0 ? HI : LO;
          c0 += (T[0] - c0) * t; c1 += (T[1] - c1) * t; c2 += (T[2] - c2) * t;
        }
        r += c0; g += c1; b += c2; cov++;
      } else if (dout[p] < 1.3 * SS) key++;
    }
    const q = 4 * (y * SW + x);
    px[q] = r / nS; px[q + 1] = g / nS; px[q + 2] = b / nS;
    px[q + 3] = (cov + key) / nS;
  }
  return { w: SW, h: SH, px };
}

let cache = null;
/** The ten numeral sprites, premultiplied RGBA, SW x SH. */
export function glyphs() {
  if (!cache) cache = Array.from({ length: 10 }, (_, n) => build(n));
  return cache;
}
