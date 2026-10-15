// Skywriter smoke: a density field on the 64 x 64 raster. Every smoke sample
// is a soft puff (polynomial kernel, no exp) that adds density and carries a
// colour; the field is then composited over the sky with a dark rim (the
// smoke hides the sky round it, so thin strokes keep a margin) and a
// top-lit shading that gives the trail volume.

export const W = 64, H = 64;
export const D = new Float32Array(W * H);
const CR = new Float32Array(W * H), CG = new Float32Array(W * H), CB = new Float32Array(W * H);

export function clear() { D.fill(0); CR.fill(0); CG.fill(0); CB.fill(0); }

/** Add a puff of radius r (px) and weight w at (x, y), colour c (linear). */
export function puff(x, y, r, w, c0, c1, c2) {
  if (w <= 0 || r <= 0.05) return;
  const xa = Math.max(0, Math.ceil(x - r)), xb = Math.min(W - 1, Math.floor(x + r));
  const ya = Math.max(0, Math.ceil(y - r)), yb = Math.min(H - 1, Math.floor(y + r));
  const ir2 = 1 / (r * r);
  for (let py = ya; py <= yb; py++) {
    const dy2 = (py - y) * (py - y), row = py * W;
    for (let px = xa; px <= xb; px++) {
      const d2 = ((px - x) * (px - x) + dy2) * ir2;
      if (d2 >= 1) continue;
      const k = (1 - d2) * (1 - d2) * w, p = row + px;
      D[p] += k; CR[p] += k * c0; CG[p] += k * c1; CB[p] += k * c2;
    }
  }
}

/** Weight that gives a line of puffs spaced ds a core density of 1. */
export const lineWeight = (ds, r) => (ds * 15) / (16 * r);

const ss = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };

const B = new Float32Array(W * H), tmp = new Float32Array(W * H);
/** Separable 5 x 5 box blur of D into B: the thin veil of smoke round a trail. */
function blur() {
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += D[o + xx]; }
      tmp[o + x] = s * 0.2;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += tmp[yy * W + x]; }
    B[y * W + x] = s * 0.2;
  }
}

/**
 * Composite the smoke over img (linear RGB, 3 per pixel), times gain; tint
 * colours the veil. The sky behind is veiled (a soft dark margin), the trail
 * emits with a soft, unsaturated curve so its puffs and lumps show, and it is
 * lit from above.
 */
export function composite(img, gain, tint) {
  blur();
  for (let p = 0; p < W * H; p++) {
    const d = D[p], b = B[p];
    if (b < 0.003 && d < 0.003) continue;
    const q = 3 * p, veil = ss(0, 0.32, b), m = 1 - 0.62 * veil;
    img[q] *= m; img[q + 1] *= m; img[q + 2] *= m;
    const hz = 0.07 * gain * (b > 0.6 ? 0.6 : b);
    img[q] += tint[0] * hz; img[q + 1] += tint[1] * hz; img[q + 2] += tint[2] * hz;
    if (d < 0.004) continue;
    let a = (1.3 * d) / (d + 0.4); a = a > 1 ? 1 : a;
    const up = p >= W ? D[p - W] : d, dn = p < W * (H - 1) ? D[p + W] : d;
    // lit from above: the top of a puff is bright, its underside takes the sky's blue
    let sh = 0.78 + 0.8 * (dn - up) + 0.25 * (d > 1 ? 1 : d);
    sh = sh < 0.42 ? 0.42 : sh > 1.3 ? 1.3 : sh;
    const k = (a * sh * gain) / d, bl = sh < 0.9 ? (0.9 - sh) * 0.5 : 0;
    img[q] = img[q] * (1 - a * 0.9) + CR[p] * k * (1 - bl);
    img[q + 1] = img[q + 1] * (1 - a * 0.9) + CG[p] * k * (1 - bl * 0.6);
    img[q + 2] = img[q + 2] * (1 - a * 0.9) + CB[p] * k;
  }
}
