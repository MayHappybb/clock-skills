// Raster primitives for rpgbattle: a 128x128 linear-light image, shapes drawn
// with coverage (signed distance, half-pixel ramp) so everything can sit at
// sub-pixel positions. Pixel centres are at integer coordinates.
export const W = 128, H = 128;
export const img = new Float32Array(W * H * 3);

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Paint over: blend pixel toward c by a. */
export function over(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += (c[0] - img[p]) * a; img[p + 1] += (c[1] - img[p + 1]) * a; img[p + 2] += (c[2] - img[p + 2]) * a;
}
/** Light adds. */
export function add(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
}
/** Darken toward black by a. */
export function shade(x, y, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x), k = 1 - (a > 1 ? 1 : a);
  img[p] *= k; img[p + 1] *= k; img[p + 2] *= k;
}

// Drawing state: `grow` widens every shape (outline pass), `ink` overrides
// its colour, `alpha` scales coverage, `mode` 0 over, 1 add.
export const S = { grow: 0, ink: null, alpha: 1, mode: 0 };
function put(x, y, c, a) {
  a *= S.alpha;
  if (S.mode) add(x, y, c, a); else over(x, y, S.ink || c, a);
}

/** Filled disc. */
export function disc(cx, cy, r, c) {
  r += S.grow;
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - r;
    if (d < 0.5) put(x, y, c, cl(0.5 - d));
  }
}
/** Filled ellipse, optionally rotated by ang. */
export function ellipse(cx, cy, rx, ry, c, ang = 0) {
  rx += S.grow; ry += S.grow;
  const R = Math.max(rx, ry) + 1, m = Math.min(rx, ry), ca = Math.cos(ang), sa = Math.sin(ang);
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
    const d = (Math.sqrt(u * u + v * v) - 1) * m;
    if (d < 0.5) put(x, y, c, cl(0.5 - d));
  }
}
/** Capsule (thick segment) with radii ra at a and rb at b. */
export function capsule(ax, ay, bx, by, ra, c, rb = ra) {
  ra += S.grow; rb += S.grow;
  const R = Math.max(ra, rb) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy;
    const d = Math.sqrt(ex * ex + ey * ey) - (ra + (rb - ra) * t);
    if (d < 0.5) put(x, y, c, cl(0.5 - d));
  }
}
/** Convex polygon [x0, y0, x1, y1, ...] in either winding. */
export function poly(pts, c) {
  const n = pts.length / 2;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, area = 0;
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k], y = pts[2 * k + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const j = (k + 1) % n; area += x * pts[2 * j + 1] - pts[2 * j] * y;
  }
  const sg = area > 0 ? 1 : -1, g = S.grow;
  const X0 = Math.max(0, Math.floor(x0 - g - 1)), X1 = Math.min(W - 1, Math.ceil(x1 + g + 1));
  const Y0 = Math.max(0, Math.floor(y0 - g - 1)), Y1 = Math.min(H - 1, Math.ceil(y1 + g + 1));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    let d = -1e9;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n, ax = pts[2 * k], ay = pts[2 * k + 1], ex = pts[2 * j] - ax, ey = pts[2 * j + 1] - ay;
      const L = Math.sqrt(ex * ex + ey * ey) || 1;
      const e = sg * ((x - ax) * ey - (y - ay) * ex) / L;   // > 0 outside this edge
      if (e > d) d = e;
    }
    d -= g;
    if (d < 0.5) put(x, y, c, cl(0.5 - d));
  }
}
/** A soft additive glow: c * a * (1 - (d/r)^2)^2. */
export function glow(cx, cy, r, c, a) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const ir2 = 1 / (r * r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const q = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * ir2;
    if (q < 1) add(x, y, c, a * (1 - q) * (1 - q));
  }
}
/** Soft additive capsule glow, falloff over r. */
export function glowLine(ax, ay, bx, by, r, c, a) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, ir2 = 1 / (r * r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, q = (ex * ex + ey * ey) * ir2;
    if (q < 1) add(x, y, c, a * (1 - q) * (1 - q));
  }
}
/** Axis-aligned filled rectangle (integer cells), painted over. */
export function rect(x, y, w, h, c, a = 1) {
  for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) over(i, j, c, a);
}
