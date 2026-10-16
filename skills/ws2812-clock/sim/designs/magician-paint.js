// Magician: a tiny coverage rasteriser for the stage. Every shape is a signed
// distance tested per pixel in its bounding box, so edges are anti-aliased
// and shapes glide between pixels. Optional keyline (kc, kw): the band of
// width kw inside the edge takes colour kc, which outlines dark heroes on
// the black GOB face. Pixel (x, y) has its centre at (x, y).
export const W = 128, H = 64;
export const img = new Float32Array(3 * W * H);

function blend(p, sd, c, a, kc, kw) {
  let cov = 0.5 - sd;
  if (cov <= 0) return;
  if (cov > 1) cov = 1;
  cov *= a;
  let r = c[0], g = c[1], b = c[2];
  if (kc !== null) {
    const k = sd + kw; // > 0 inside the keyline band
    if (k > -0.5) { const t = k >= 0.5 ? 1 : k + 0.5; r += (kc[0] - r) * t; g += (kc[1] - g) * t; b += (kc[2] - b) * t; }
  }
  const q = 3 * p;
  img[q] += (r - img[q]) * cov; img[q + 1] += (g - img[q + 1]) * cov; img[q + 2] += (b - img[q + 2]) * cov;
}
const bx0 = (x) => Math.max(0, Math.floor(x)), bx1 = (x) => Math.min(W - 1, Math.ceil(x));
const by0 = (y) => Math.max(0, Math.floor(y)), by1 = (y) => Math.min(H - 1, Math.ceil(y));

/** Filled disc. */
export function disc(cx, cy, r, c, a = 1, kc = null, kw = 1) {
  for (let y = by0(cy - r - 1); y <= by1(cy + r + 1); y++) for (let x = bx0(cx - r - 1); x <= bx1(cx + r + 1); x++)
    blend(y * W + x, Math.hypot(x - cx, y - cy) - r, c, a, kc, kw);
}
/** Filled ellipse, radii rx, ry, turned by ang. */
export function ellipse(cx, cy, rx, ry, ang, c, a = 1, kc = null, kw = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(rx, ry) + 1;
  for (let y = by0(cy - R); y <= by1(cy + R); y++) for (let x = bx0(cx - R); x <= bx1(cx + R); x++) {
    const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
    const q = Math.hypot(u, v) + 1e-6, gu = u / rx, gv = v / ry, g = Math.hypot(gu, gv) / q + 1e-6;
    blend(y * W + x, (q - 1) / g, c, a, kc, kw);
  }
}
/** Tapered capsule from a (radius ra) to b (radius rb). */
export function capsule(ax, ay, bx, by, ra, rb, c, a = 1, kc = null, kw = 1) {
  const R = Math.max(ra, rb) + 1, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = by0(Math.min(ay, by) - R); y <= by1(Math.max(ay, by) + R); y++)
    for (let x = bx0(Math.min(ax, bx) - R); x <= bx1(Math.max(ax, bx) + R); x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      blend(y * W + x, Math.hypot(x - ax - t * dx, y - ay - t * dy) - (ra + (rb - ra) * t), c, a, kc, kw);
    }
}
/** Filled polygon, pts flat [x0, y0, x1, y1, ...]. */
export function poly(pts, c, a = 1, kc = null, kw = 1) {
  let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
  const n = pts.length >> 1;
  for (let k = 0; k < n; k++) { const x = pts[2 * k], y = pts[2 * k + 1]; if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y; }
  for (let y = by0(ya - 1); y <= by1(yb + 1); y++) for (let x = bx0(xa - 1); x <= bx1(xb + 1); x++) {
    let d = 1e9, inside = false;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const x1 = pts[2 * j], y1 = pts[2 * j + 1], x2 = pts[2 * k], y2 = pts[2 * k + 1];
      const ex = x2 - x1, ey = y2 - y1, L2 = ex * ex + ey * ey || 1e-6;
      let t = ((x - x1) * ex + (y - y1) * ey) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dd = (x - x1 - t * ex) ** 2 + (y - y1 - t * ey) ** 2;
      if (dd < d) d = dd;
      if ((y1 > y) !== (y2 > y) && x < x1 + ((y - y1) * ex) / ey) inside = !inside;
    }
    d = Math.sqrt(d);
    blend(y * W + x, inside ? -d : d, c, a, kc, kw);
  }
}
/** Additive soft glow, (1 - d^2)^2 falloff, radius r. */
export function glow(cx, cy, r, c, a = 1) {
  for (let y = by0(cy - r); y <= by1(cy + r); y++) for (let x = bx0(cx - r); x <= bx1(cx + r); x++) {
    const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * a, q = 3 * (y * W + x);
    img[q] += c[0] * f; img[q + 1] += c[1] * f; img[q + 2] += c[2] * f;
  }
}
/** A four-pointed twinkle (sparkle) of size s at (x, y), additive. */
export function twinkle(x, y, s, c, a = 1) {
  glow(x, y, 1.6, c, a);
  for (let k = 1; k <= Math.ceil(s); k++) {
    const f = a * (1 - k / (s + 1)) ** 1.5;
    if (f <= 0) continue;
    glow(x + k, y, 1.1, c, f); glow(x - k, y, 1.1, c, f); glow(x, y + k, 1.1, c, f); glow(x, y - k, 1.1, c, f);
  }
}
