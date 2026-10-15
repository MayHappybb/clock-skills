// Small raster painting helpers for the typewriter face: coverage-based
// discs, ellipses and segments into a Float32 RGB image (linear light).
export const W = 128, H = 64;

/** Paint colour c over pixel p with alpha a. */
export function over(img, p, c, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  const o = 3 * p;
  img[o] += (c[0] - img[o]) * a; img[o + 1] += (c[1] - img[o + 1]) * a; img[o + 2] += (c[2] - img[o + 2]) * a;
}
/** Multiply pixel p by (1 - a * (1 - t)) per channel: a transmissive tint (ink, shadow). */
export function tint(img, p, t, a) {
  if (a <= 0) return;
  const o = 3 * p;
  img[o] *= 1 - a * (1 - t[0]); img[o + 1] *= 1 - a * (1 - t[1]); img[o + 2] *= 1 - a * (1 - t[2]);
}

/**
 * Filled ellipse at (cx, cy), radii rx, ry, with a 1 px soft edge.
 * shade(dx, dy, p) returns the colour (dx, dy in -1..1), or a fixed colour.
 */
export function ellipse(img, cx, cy, rx, ry, col, alpha = 1, clipY = H) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(clipY - 1, Math.ceil(cy + ry + 1));
  const fn = typeof col === 'function';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, r = Math.sqrt(dx * dx + dy * dy);
    // distance to the edge, approximately in pixels
    const d = (r - 1) * Math.min(rx, ry);
    const a = d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d;
    if (a <= 0) continue;
    const p = y * W + x;
    over(img, p, fn ? col(dx, dy, p) : col, a * alpha);
  }
}

/** A round-capped segment of width w from (ax, ay) to (bx, by). */
export function seg(img, ax, ay, bx, by, w, col, alpha = 1) {
  const r = w / 2 + 0.6;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const fn = typeof col === 'function';
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - w / 2;
    const a = d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d;
    if (a <= 0) continue;
    const p = y * W + x;
    over(img, p, fn ? col(t, d, p) : col, a * alpha);
  }
}
