// Fourier glyphs: ten calligraphic one-stroke numerals, each a single closed
// loop, turned into Fourier coefficients (the arm lengths of an epicycle
// machine). Open strokes are closed by the pen retracing its line, the way
// a drawing machine has to.
//
// Glyph box: x 0..0.6, y 0..1 (y down). A point with a third entry 1 is a
// corner (the spline stops there).

export const K = 24;             // terms -K..K: 49 circles per numeral
const N = 512;                   // samples of the path for the DFT

const G = {
  0: { closed: true, pts: [[0.33, 0.02], [0.12, 0.12], [0.03, 0.42], [0.07, 0.78], [0.25, 0.98], [0.47, 0.90], [0.57, 0.60], [0.54, 0.24], [0.42, 0.06]] },
  1: { pts: [[0.10, 0.25], [0.22, 0.15], [0.36, 0.02, 1], [0.34, 0.50], [0.32, 0.98, 1]] },
  2: { pts: [[0.05, 0.24], [0.15, 0.07], [0.34, 0.02], [0.52, 0.12], [0.55, 0.32], [0.42, 0.52], [0.22, 0.73], [0.04, 0.97, 1], [0.24, 0.93], [0.42, 0.97], [0.59, 0.94]] },
  3: { pts: [[0.05, 0.13], [0.24, 0.02], [0.46, 0.05], [0.54, 0.22], [0.44, 0.40], [0.24, 0.47, 1], [0.46, 0.53], [0.58, 0.72], [0.50, 0.91], [0.28, 0.99], [0.04, 0.87]] },
  4: { closed: true, pts: [[0.46, 0.02, 1], [0.02, 0.68, 1], [0.60, 0.68, 1], [0.46, 0.68, 1], [0.46, 0.98, 1]] },
  5: { pts: [[0.56, 0.03], [0.36, 0.04], [0.17, 0.03, 1], [0.11, 0.45, 1], [0.30, 0.38], [0.50, 0.44], [0.58, 0.64], [0.52, 0.86], [0.32, 0.98], [0.04, 0.89]] },
  6: { pts: [[0.54, 0.05], [0.32, 0.04], [0.13, 0.22], [0.04, 0.52], [0.08, 0.80], [0.26, 0.97], [0.46, 0.94], [0.57, 0.76], [0.52, 0.57], [0.35, 0.48], [0.17, 0.52], [0.06, 0.66]] },
  7: { pts: [[0.03, 0.11], [0.14, 0.03], [0.32, 0.07], [0.58, 0.03, 1], [0.42, 0.36], [0.28, 0.68], [0.22, 0.98]] },
  8: { closed: true, pts: [[0.30, 0.48], [0.52, 0.63], [0.56, 0.82], [0.42, 0.97], [0.18, 0.97], [0.04, 0.82], [0.08, 0.64], [0.30, 0.48], [0.49, 0.33], [0.52, 0.14], [0.40, 0.02], [0.20, 0.02], [0.08, 0.14], [0.11, 0.33]] },
  9: { pts: [[0.24, 0.98], [0.46, 0.82], [0.56, 0.52], [0.56, 0.26], [0.46, 0.06], [0.27, 0.02], [0.08, 0.12], [0.04, 0.32], [0.16, 0.48], [0.36, 0.50], [0.52, 0.40], [0.56, 0.30]] },
};

/** Catmull-Rom through the points (corners doubled), as a dense polyline. */
function spline(raw, closed) {
  const P = [];
  for (const p of raw) { P.push(p); if (p[2]) P.push(p); }
  const n = P.length, out = [];
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < 32; s++) {
      const t = s / 32, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(P[n - 1]);
  return out;
}

/** The glyph as one closed loop, resampled at N points uniform in arc length. */
function loop(d) {
  const g = G[d];
  let poly = spline(g.pts, !!g.closed);
  if (!g.closed) poly = poly.concat(poly.slice(0, -1).reverse());   // retrace home
  const L = [0];
  for (let i = 1; i <= poly.length; i++) {
    const a = poly[i - 1], b = poly[i % poly.length];
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const tot = L[L.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / N) * tot;
    while (L[j + 1] < s) j++;
    const a = poly[j], b = poly[(j + 1) % poly.length], f = (s - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return { pts: out, len: tot };
}

const cache = new Map();
/**
 * Coefficients of digit d drawn h px tall with `slant`, centred on the
 * glyph box: { re, im } indexed n + K, and `ink`, a brightness factor that
 * evens out retraced (twice-drawn) and single-pass loops.
 */
export function glyphCoeffs(d, h, slant) {
  const key = d + '|' + h + '|' + slant;
  if (cache.has(key)) return cache.get(key);
  const { pts } = loop(d);
  const re = new Float64Array(2 * K + 1), im = new Float64Array(2 * K + 1);
  for (let n = -K; n <= K; n++) {
    let sr = 0, si = 0;
    for (let k = 0; k < N; k++) {
      const [gx, gy] = pts[k];
      const x = (gx - 0.3 + (0.5 - gy) * slant) * h, y = (gy - 0.5) * h;
      const a = (-2 * Math.PI * n * k) / N, c = Math.cos(a), s = Math.sin(a);
      sr += x * c - y * s; si += x * s + y * c;
    }
    // a light Lanczos taper: tames ringing at the corners
    const q = (Math.PI * n) / (2 * (K + 1)), sig = n ? Math.sin(q) / q : 1;
    re[n + K] = (sr / N) * sig; im[n + K] = (si / N) * sig;
  }
  const g = G[d];
  const out = { re, im, ink: g.closed ? (d === '4' ? 1.35 : 1.7) : 1 };
  cache.set(key, out);
  return out;
}
