// Raster helpers for the sushi face: one 256 x 64 linear-RGB image, painted
// back to front with coverage (so everything can sit between pixels).
export const W = 256, H = 64;
export const img = new Float32Array(3 * W * H);

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

/** Paint (r, g, b) over pixel (x, y) with coverage a. */
export function ov(x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  if (a > 1) a = 1;
  const p = 3 * (y * W + x);
  img[p] += (r - img[p]) * a; img[p + 1] += (g - img[p + 1]) * a; img[p + 2] += (b - img[p + 2]) * a;
}
/** Add light. */
export function ad(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] += r; img[p + 1] += g; img[p + 2] += b;
}

/** Sprite from strings and a palette { ch: [r, g, b] } (linear): premultiplied colour + alpha. */
export function sprite(rows, pal) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = new Float32Array(3 * w * h), a = new Float32Array(w * h);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i]];
      if (!col) continue;
      const p = j * w + i, al = col[3] ?? 1;
      a[p] = al; c[3 * p] = col[0] * al; c[3 * p + 1] = col[1] * al; c[3 * p + 2] = col[2] * al;
    }
  });
  return { w, h, c, a };
}

/** Draw a sprite with its top-left at fractional (x, y): bilinear gather, one composite per pixel. */
export function blit(s, x, y, alpha = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const w = s.w, h = s.h, A = s.a, C = s.c;
  for (let J = 0; J <= h; J++) {
    const Y = y0 + J;
    if (Y < 0 || Y >= H) continue;
    for (let I = 0; I <= w; I++) {
      const X = x0 + I;
      if (X < 0 || X >= W) continue;
      let r = 0, g = 0, b = 0, al = 0;
      for (let q = 0; q < 4; q++) {
        const ti = I - (q & 1), tj = J - (q >> 1);
        if (ti < 0 || tj < 0 || ti >= w || tj >= h) continue;
        const wt = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
        const p = tj * w + ti;
        if (!A[p]) continue;
        al += A[p] * wt; r += C[3 * p] * wt; g += C[3 * p + 1] * wt; b += C[3 * p + 2] * wt;
      }
      if (al <= 0.002) continue;
      al *= alpha;
      const o = 3 * (Y * W + X), k = 1 - al;
      img[o] = img[o] * k + r * alpha; img[o + 1] = img[o + 1] * k + g * alpha; img[o + 2] = img[o + 2] * k + b * alpha;
    }
  }
}

/** A round-capped stroke from a to b, width w, with a soft one-pixel edge. */
export function seg(ax, ay, bx, by, w, r, g, b, a = 1) {
  const R = w / 2 + 0.5;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    const cov = w / 2 + 0.5 - d;
    if (cov > 0) ov(x, y, r, g, b, a * (cov > 1 ? 1 : cov));
  }
}
/** A filled ellipse with a soft edge. */
export function disk(cx, cy, rx, ry, r, g, b, a = 1) {
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
  const m = Math.min(rx, ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = (Math.sqrt(u * u + v * v) - 1) * m;
    const cov = 0.5 - d;
    if (cov > 0) ov(x, y, r, g, b, a * (cov > 1 ? 1 : cov));
  }
}
/** A soft additive glow. */
export function glow(cx, cy, rad, r, g, b) {
  const x0 = Math.floor(cx - rad), x1 = Math.ceil(cx + rad), y0 = Math.floor(cy - rad), y1 = Math.ceil(cy + rad);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = ((x - cx) ** 2 + (y - cy) ** 2) / (rad * rad);
    if (q < 1) { const f = (1 - q) ** 2; ad(x, y, r * f, g * f, b * f); }
  }
}
