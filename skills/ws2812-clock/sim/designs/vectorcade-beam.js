// Vectorcade's "vector monitor": an electron beam drawn into a 64x64 float
// raster with sub-pixel anti-aliasing, then phosphor bloom.
//
// Lines go into a one-channel layer with MAX, so the cut points of one
// outline don't double up into a dotted line; a whole object's layer is then
// tinted and ADDED to the colour image (light adds between objects). A
// separable blur adds the glow the phosphor and the glass give a vector CRT.

export function makeBeam(w, h) {
  const layer = new Float32Array(w * h), rgb = new Float32Array(3 * w * h), tmp = new Float32Array(3 * w * h);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  // beam profile: a gaussian core, sigma ~0.55 px, as a table on d^2
  const R = 1.35, R2 = R * R, NT = 128, PROF = new Float32Array(NT + 1);
  for (let k = 0; k <= NT; k++) { const d2 = (k / NT) * R2; PROF[k] = Math.exp(-d2 / (2 * 0.45 * 0.45)) * (1 - k / NT); }
  // bloom kernel, radius 3
  const KR = 3, KER = new Float32Array(2 * KR + 1);
  { let s = 0; for (let k = -KR; k <= KR; k++) { KER[k + KR] = Math.exp(-(k * k) / (2 * 1.2 * 1.2)); s += KER[k + KR]; } for (let k = 0; k < KER.length; k++) KER[k] /= s; }

  const B = {
    w, h, rgb, layer,
    clear() { rgb.fill(0); },
    /** A beam line from a to b at intensity I (MAX into the layer). */
    line(ax, ay, bx, by, I) {
      if (I <= 0.002) return;
      let lx = Math.floor(Math.min(ax, bx) - R) + 1, hx = Math.ceil(Math.max(ax, bx) + R) - 1;
      let ly = Math.floor(Math.min(ay, by) - R) + 1, hy = Math.ceil(Math.max(ay, by) + R) - 1;
      if (lx < 0) lx = 0; if (ly < 0) ly = 0; if (hx > w - 1) hx = w - 1; if (hy > h - 1) hy = h - 1;
      if (lx > hx || ly > hy) return;
      if (lx < x0) x0 = lx; if (hx > x1) x1 = hx; if (ly < y0) y0 = ly; if (hy > y1) y1 = hy;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, inv = L2 > 1e-9 ? 1 / L2 : 0;
      for (let y = ly; y <= hy; y++) {
        const py = y - ay;
        let row = y * w;
        for (let x = lx; x <= hx; x++) {
          const px = x - ax;
          let t = (px * dx + py * dy) * inv;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
          if (d2 >= R2) continue;
          const v = I * PROF[(d2 * (NT / R2)) | 0];
          if (v > layer[row + x]) layer[row + x] = v;
        }
      }
    },
    /** A dot (a line of no length). */
    dot(x, y, I) { B.line(x, y, x + 0.001, y, I); },
    /** Tint the layer by colour c and add it to the image; clear the layer. White-hot where it is strong. */
    flush(c, hot = 0.35) {
      if (x1 < 0) return;
      const cr = c[0], cg = c[1], cb = c[2];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0, p = y * w + x0; x <= x1; x++, p++) {
          const v = layer[p];
          if (v === 0) continue;
          layer[p] = 0;
          const wv = hot * v * v, k = v * (1 - wv);
          rgb[3 * p] += cr * k + wv * v; rgb[3 * p + 1] += cg * k + wv * v; rgb[3 * p + 2] += cb * k + wv * v;
        }
      }
      x0 = w; x1 = -1; y0 = h; y1 = -1;
    },
    /** Phosphor glow: add `amt` x a blur of the image. */
    bloom(amt) {
      // horizontal into tmp
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0;
          for (let k = -KR; k <= KR; k++) {
            const xx = x + k;
            if (xx < 0 || xx >= w) continue;
            const q = 3 * (y * w + xx), f = KER[k + KR];
            r += rgb[q] * f; g += rgb[q + 1] * f; b += rgb[q + 2] * f;
          }
          const p = 3 * (y * w + x);
          tmp[p] = r; tmp[p + 1] = g; tmp[p + 2] = b;
        }
      }
      // vertical, added back
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0;
          for (let k = -KR; k <= KR; k++) {
            const yy = y + k;
            if (yy < 0 || yy >= h) continue;
            const q = 3 * (yy * w + x), f = KER[k + KR];
            r += tmp[q] * f; g += tmp[q + 1] * f; b += tmp[q + 2] * f;
          }
          const p = 3 * (y * w + x);
          rgb[p] += r * amt; rgb[p + 1] += g * amt; rgb[p + 2] += b * amt;
        }
      }
    },
  };
  return B;
}
