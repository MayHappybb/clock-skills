// Dragon dance: small coverage-antialiased painters on a linear RGB raster
// (Float32Array 3*W*H). Everything takes sub-pixel coordinates, pixel
// centres at integers, so shapes glide rather than hop.

export const W = 256, H = 64;
export const img = new Float32Array(3 * W * H);

const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Paint colour c over the pixel p with coverage a. */
function overPx(p, c, a) {
  const q = 3 * p;
  img[q] += (c[0] - img[q]) * a; img[q + 1] += (c[1] - img[q + 1]) * a; img[q + 2] += (c[2] - img[q + 2]) * a;
}

/** Filled ellipse (rotation ang), painted over. */
export function ellipse(cx, cy, rx, ry, ang, c, a = 1) {
  const R = Math.max(rx, ry) + 1, ca = Math.cos(ang), sa = Math.sin(ang), m = Math.min(rx, ry);
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
    const sd = (Math.sqrt(u * u + v * v) - 1) * m;
    const cov = cl(0.5 - sd);
    if (cov > 0) overPx(y * W + x, c, cov * a);
  }
}
export const disc = (cx, cy, r, c, a = 1) => ellipse(cx, cy, r, r, 0, c, a);

/** Capsule (thick line) from a to b, width w, painted over. */
export function capsule(ax, ay, bx, by, w, c, a = 1) {
  const r = w / 2, x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, d = Math.sqrt(ex * ex + ey * ey);
    const cov = cl(r + 0.5 - d);
    if (cov > 0) overPx(y * W + x, c, cov * a);
  }
}

/** A polyline of capsules: pts flat [x0,y0,x1,y1,...]. */
export function polyline(pts, w, c, a = 1) {
  for (let i = 0; i + 3 < pts.length; i += 2) capsule(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], w, c, a);
}

/** Additive soft glow: c * a * (1 - (d/r)^2)^2. */
export function glow(cx, cy, r, c, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, d2 = (dx * dx + dy * dy) / r2;
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * a, q = 3 * (y * W + x);
    img[q] += c[0] * f; img[q + 1] += c[1] * f; img[q + 2] += c[2] * f;
  }
}

/** Darken a soft disc (for keylines behind a shape). */
export function shade(cx, cy, r, k) {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy), cov = cl(r + 0.5 - d) * k;
    if (cov <= 0) continue;
    const q = 3 * (y * W + x);
    img[q] *= 1 - cov; img[q + 1] *= 1 - cov; img[q + 2] *= 1 - cov;
  }
}
