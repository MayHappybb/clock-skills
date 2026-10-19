// Small raster painters for the Ferris wheel: an RGB Float32Array of
// W x H, linear light. Coverage-based, so everything can sit between pixels.
export const W = 192, H = 192;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Paint colour c over the image with coverage of the box [x, x+w) x [y, y+h). */
export function rect(img, x, y, w, h, c, a = 1) {
  const x1 = x + w, y1 = y + h;
  const i0 = Math.max(0, Math.floor(x)), i1 = Math.min(W - 1, Math.ceil(x1) - 1);
  const j0 = Math.max(0, Math.floor(y)), j1 = Math.min(H - 1, Math.ceil(y1) - 1);
  for (let j = j0; j <= j1; j++) {
    const cy = Math.min(y1, j + 1) - Math.max(y, j);
    if (cy <= 0) continue;
    for (let i = i0; i <= i1; i++) {
      const cx = Math.min(x1, i + 1) - Math.max(x, i);
      if (cx <= 0) continue;
      const k = a * cx * cy, p = 3 * (j * W + i);
      img[p] += (c[0] - img[p]) * k; img[p + 1] += (c[1] - img[p + 1]) * k; img[p + 2] += (c[2] - img[p + 2]) * k;
    }
  }
}

/** A line of width `wd` painted over, soft edge of about a pixel. */
export function line(img, x0, y0, x1, y1, wd, c, a = 1) {
  const r = wd / 2 + 0.7;
  const i0 = Math.max(0, Math.floor(Math.min(x0, x1) - r)), i1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + r));
  const j0 = Math.max(0, Math.floor(Math.min(y0, y1) - r)), j1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + r));
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = i + 0.5 - x0, py = j + 0.5 - y0;
      const t = clamp((px * dx + py * dy) / L2, 0, 1);
      const ex = px - t * dx, ey = py - t * dy, d = Math.sqrt(ex * ex + ey * ey);
      const k = clamp(wd / 2 + 0.5 - d, 0, 1) * a;
      if (k <= 0) continue;
      const p = 3 * (j * W + i);
      img[p] += (c[0] - img[p]) * k; img[p + 1] += (c[1] - img[p + 1]) * k; img[p + 2] += (c[2] - img[p + 2]) * k;
    }
  }
}

/** A filled disc painted over. */
export function disc(img, cx, cy, r, c, a = 1) {
  const i0 = Math.max(0, Math.floor(cx - r - 1)), i1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const j0 = Math.max(0, Math.floor(cy - r - 1)), j1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy), k = clamp(r + 0.5 - d, 0, 1) * a;
    if (k <= 0) continue;
    const p = 3 * (j * W + i);
    img[p] += (c[0] - img[p]) * k; img[p + 1] += (c[1] - img[p + 1]) * k; img[p + 2] += (c[2] - img[p + 2]) * k;
  }
}

/**
 * A light: adds c * a with a round core of radius r (smooth, sub-pixel) and
 * a faint halo of radius 2.4 r.
 */
export function glow(img, x, y, r, c, a = 1, halo = 0.07) {
  const R = r * 2.4, i0 = Math.max(0, Math.floor(x - R)), i1 = Math.min(W - 1, Math.floor(x + R));
  const j0 = Math.max(0, Math.floor(y - R)), j1 = Math.min(H - 1, Math.floor(y + R));
  const ir2 = 1 / (r * r), iR2 = 1 / (R * R);
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - y;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - x, d2 = dx * dx + dy * dy;
      let k = 0;
      const u = 1 - d2 * ir2; if (u > 0) k += u * u;
      const v = 1 - d2 * iR2; if (v > 0) k += halo * v * v;
      if (k <= 0) continue;
      k *= a;
      const p = 3 * (j * W + i);
      img[p] += c[0] * k; img[p + 1] += c[1] * k; img[p + 2] += c[2] * k;
    }
  }
}
