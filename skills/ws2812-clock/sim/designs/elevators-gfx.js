// Raster primitives for the elevators face: one 128 x 192 linear-RGB canvas,
// everything sub-pixel (fractional rects by area coverage, bilinear sprites,
// distance-field lines), no per-pixel allocation.
export const W = 128, H = 192;
export const img = new Float32Array(3 * W * H);

export function clear() { img.fill(0); }

/** Blend pixel (x, y) toward colour c by a (0..1). */
export function over(x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a;
}
/** Add light c * a at pixel (x, y). */
export function add(x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
}
/** Set pixel. */
export function set(x, y, c, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] = c[0] * a; img[p + 1] = c[1] * a; img[p + 2] = c[2] * a;
}

/** Fill [x0, x1) x [y0, y1) (fractional) with area coverage, blended over. */
export function rect(x0, y0, x1, y1, c, a = 1) {
  if (x1 <= x0 || y1 <= y0) return;
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    const cy = Math.min(y1, y + 1) - Math.max(y0, y);
    for (let x = xa; x < xb; x++) {
      const cx = Math.min(x1, x + 1) - Math.max(x0, x);
      over(x, y, c, a * cx * cy);
    }
  }
}
/** Additive version of rect. */
export function glow(x0, y0, x1, y1, c, a = 1) {
  if (x1 <= x0 || y1 <= y0) return;
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    const cy = Math.min(y1, y + 1) - Math.max(y0, y);
    for (let x = xa; x < xb; x++) add(x, y, c, a * cy * (Math.min(x1, x + 1) - Math.max(x0, x)));
  }
}
/** Multiply a whole-pixel block by k (room lighting). */
export function scaleBlock(x0, y0, x1, y1, kr, kg, kb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const p = 3 * (y * W + x);
    img[p] *= kr; img[p + 1] *= kg; img[p + 2] *= kb;
  }
}

/** Soft additive dot of radius r. */
export function splat(x, y, r, c, a = 1) {
  const xa = Math.max(0, Math.floor(x - r)), xb = Math.min(W - 1, Math.ceil(x + r));
  const ya = Math.max(0, Math.floor(y - r)), yb = Math.min(H - 1, Math.ceil(y + r));
  const r2 = r * r;
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y, d2 = (dx * dx + dy * dy) / r2;
    if (d2 < 1) { const f = (1 - d2) * (1 - d2); add(px, py, c, a * f); }
  }
}
/** Solid disc with an anti-aliased edge, blended over. */
export function disc(x, y, r, c, a = 1) {
  const xa = Math.max(0, Math.floor(x - r - 1)), xb = Math.min(W - 1, Math.ceil(x + r + 1));
  const ya = Math.max(0, Math.floor(y - r - 1)), yb = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
    const cov = d < r - 0.5 ? 1 : d > r + 0.5 ? 0 : r + 0.5 - d;
    if (cov > 0) over(px, py, c, a * cov);
  }
}

/** Anti-aliased line of width w from (ax, ay) to (bx, by), blended over (add = true: light). */
export function line(ax, ay, bx, by, c, a = 1, w = 1, addMode = false) {
  const r = w / 2 + 0.5;
  const xa = Math.max(0, Math.floor(Math.min(ax, bx) - r)), xb = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const ya = Math.max(0, Math.floor(Math.min(ay, by) - r)), yb = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) {
    const qx = px + 0.5 - ax, qy = py + 0.5 - ay;
    let t = (qx * dx + qy * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(qx - t * dx, qy - t * dy);
    const cov = d < w / 2 - 0.5 ? 1 : d > w / 2 + 0.5 ? 0 : w / 2 + 0.5 - d;
    if (cov > 0) { if (addMode) add(px, py, c, a * Math.min(1, cov)); else over(px, py, c, a * Math.min(1, cov)); }
  }
}

/** Compile a char-art sprite: rows of chars, pal maps char -> colour (missing = clear). */
export function sprite(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const d = new Float32Array(4 * w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = pal[rows[j][i]];
    if (!c) continue;
    const p = 4 * (j * w + i);
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 1;
  }
  return { w, h, d };
}
/** Draw a compiled sprite at fractional (fx, fy), bilinear-sampled, times light k, alpha a. */
const ACC = [0, 0, 0];
export function blit(S, fx, fy, a = 1, k = 1, flip = false) {
  const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  const { w, h, d } = S;
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) {
    // destination (ix + i, iy + j) mixes sprite texels (i, j), (i-1, j), (i, j-1), (i-1, j-1)
    let al = 0, r = 0, g = 0, b = 0;
    for (let q = 0; q < 4; q++) {
      const si = q & 1 ? i - 1 : i, sj = q & 2 ? j - 1 : j;
      if (si < 0 || sj < 0 || si >= w || sj >= h) continue;
      const wt = q === 0 ? w00 : q === 1 ? w10 : q === 2 ? w01 : w11;
      const p = 4 * (sj * w + (flip ? w - 1 - si : si)), t = d[p + 3] * wt;
      if (t <= 0) continue;
      al += t; r += d[p] * t; g += d[p + 1] * t; b += d[p + 2] * t;
    }
    if (al > 0.002) { ACC[0] = (r / al) * k; ACC[1] = (g / al) * k; ACC[2] = (b / al) * k; over(ix + i, iy + j, ACC, al * a); }
  }
}
