// Cat's cradle: raster primitives on the 128x128 picture (linear RGB floats).
// Every shape is coverage-antialiased so it can sit between pixels.
export const W = 128, H = 128;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Distance from (px, py) to segment a-b (no allocation). */
export function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Paint a capsule (a-b, radius r) over the image in colour c, scaled by a.
 * shade > 0 rounds it: the middle of the capsule is lit, the flanks fall off.
 */
export function capsule(img, ax, ay, bx, by, r, c, a = 1, shade = 0) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const c0 = c[0] * a, c1 = c[1] * a, c2 = c[2] * a;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = segD(x, y, ax, ay, bx, by);
      const cov = clamp01(r + 0.5 - d);
      if (cov <= 0) continue;
      const k = shade > 0 ? 1 - shade + shade * Math.sqrt(clamp01(1 - d / (r + 0.5))) : 1;
      const p = 3 * (y * W + x);
      img[p] += (c0 * k - img[p]) * cov; img[p + 1] += (c1 * k - img[p + 1]) * cov; img[p + 2] += (c2 * k - img[p + 2]) * cov;
    }
  }
}
export const disc = (img, x, y, r, c, a = 1, shade = 0) => capsule(img, x, y, x, y, r, c, a, shade);

/** A ring (circle outline) of radius R and thickness th. */
export function ring(img, cx, cy, R, th, c, a = 1) {
  const e = R + th + 1;
  const x0 = Math.max(0, Math.floor(cx - e)), x1 = Math.min(W - 1, Math.ceil(cx + e));
  const y0 = Math.max(0, Math.floor(cy - e)), y1 = Math.min(H - 1, Math.ceil(cy + e));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.abs(Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - R);
      const cov = clamp01(th / 2 + 0.5 - d);
      if (cov <= 0) continue;
      const p = 3 * (y * W + x);
      img[p] += (c[0] * a - img[p]) * cov; img[p + 1] += (c[1] * a - img[p + 1]) * cov; img[p + 2] += (c[2] * a - img[p + 2]) * cov;
    }
  }
}

/**
 * An ellipse filled in horizontal colour bands: bands[k] covers
 * y in [by0 + k*bh, by0 + (k+1)*bh). grow inflates it (for a keyline).
 * shade lights the top and darkens the bottom (the spotlight is above).
 */
export function ellipse(img, cx, cy, rx, ry, bands, by0, bh, a = 1, shade = 0) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const m = Math.min(rx, ry), nb = bands.length;
  for (let y = y0; y <= y1; y++) {
    let b = Math.floor((y - by0) / bh); b = b < 0 ? 0 : b >= nb ? nb - 1 : b;
    const c = bands[b];
    const k = 1 - shade * clamp01((y - (cy - ry)) / (2 * ry));
    for (let x = x0; x <= x1; x++) {
      const qx = (x - cx) / rx, qy = (y - cy) / ry;
      const d = (Math.sqrt(qx * qx + qy * qy) - 1) * m;
      const cov = clamp01(0.5 - d);
      if (cov <= 0) continue;
      const p = 3 * (y * W + x);
      img[p] += (c[0] * a * k - img[p]) * cov; img[p + 1] += (c[1] * a * k - img[p + 1]) * cov; img[p + 2] += (c[2] * a * k - img[p + 2]) * cov;
    }
  }
}

/**
 * One straight piece of string into the core/glow buffers (max, so doubled
 * strands and joints do not double up). hw = half width of the core.
 */
export function strand(core, glow, ax, ay, bx, by, w, hw = 0.8) {
  const R = 3.4;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = segD(x, y, ax, ay, bx, by);
      if (d >= R) continue;
      const p = y * W + x;
      const c = clamp01(hw + 0.5 - d) * w;
      if (c > core[p]) core[p] = c;
      const q = 1 - (d * d) / (R * R), g = q * q * w;
      if (g > glow[p]) glow[p] = g;
    }
  }
}
