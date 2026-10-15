// Rube Goldberg: raster primitives with coverage anti-aliasing.
// One Float32Array RGB canvas (linear light), W x H. Every shape paints
// "over" (alpha blend) so wood occludes wood; glow uses add.
export class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Float32Array(3 * w * h); }
  clear() { this.px.fill(0); }
  over(x, y, c, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a > 1) a = 1;
    const p = 3 * (y * this.w + x), o = this.px;
    o[p] += (c[0] - o[p]) * a; o[p + 1] += (c[1] - o[p + 1]) * a; o[p + 2] += (c[2] - o[p + 2]) * a;
  }
  add(x, y, c, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const p = 3 * (y * this.w + x), o = this.px;
    o[p] += c[0] * a; o[p + 1] += c[1] * a; o[p + 2] += c[2] * a;
  }
  /** Filled disc, centre (cx, cy) in pixel units (pixel centres at integers). */
  disc(cx, cy, r, c, a = 1, glow = false) {
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy), k = r - d + 0.5;
      if (k <= 0) continue;
      if (glow) this.add(x, y, c, a * (k > 1 ? 1 : k)); else this.over(x, y, c, a * (k > 1 ? 1 : k));
    }
  }
  /** Ring of radius r and half-width hw. */
  ring(cx, cy, r, hw, c, a = 1) {
    const R = r + hw + 1;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = hw - Math.abs(Math.hypot(x - cx, y - cy) - r) + 0.5;
      if (k > 0) this.over(x, y, c, a * (k > 1 ? 1 : k));
    }
  }
  /** Line with round caps, half-width hw. */
  line(ax, ay, bx, by, hw, c, a = 1) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + hw + 1));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const k = hw - Math.hypot(x - ax - t * dx, y - ay - t * dy) + 0.5;
      if (k > 0) this.over(x, y, c, a * (k > 1 ? 1 : k));
    }
  }
  /**
   * Rotated box centred (cx, cy), half sizes hw x hh, angle ang (rad).
   * shade(u, v) may return a brightness factor (u, v in -1..1).
   */
  box(cx, cy, hw, hh, ang, c, a = 1, shade = null) {
    const cs = Math.cos(ang), sn = Math.sin(ang), R = Math.hypot(hw, hh) + 1;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy, u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
      let ku = hw - Math.abs(u) + 0.5, kv = hh - Math.abs(v) + 0.5;
      if (ku <= 0 || kv <= 0) continue;
      const k = (ku > 1 ? 1 : ku) * (kv > 1 ? 1 : kv);
      if (shade) { const f = shade(u / hw, v / hh); this.over(x, y, [c[0] * f, c[1] * f, c[2] * f], a * k); }
      else this.over(x, y, c, a * k);
    }
  }
}

/**
 * Bilinear RGB sample of an image W x H at card coords (u, v), where
 * pixel (i, j) covers [i, i+1) x [j, j+1). Writes into out[0..2].
 */
export function sampleRGB(img, W, H, u, v, out) {
  let x = u - 0.5, y = v - 0.5;
  if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
  if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const i1 = i + 1 < W ? i + 1 : i, j1 = j + 1 < H ? j + 1 : j;
  const a = 3 * (j * W + i), b = 3 * (j * W + i1), c = 3 * (j1 * W + i), d = 3 * (j1 * W + i1);
  for (let k = 0; k < 3; k++) {
    out[k] = (img[a + k] * (1 - fx) + img[b + k] * fx) * (1 - fy) + (img[c + k] * (1 - fx) + img[d + k] * fx) * fy;
  }
}

const tmp = [0, 0, 0];
/**
 * Draw image (W x H) centred at (cx, cy) on the canvas, turned by ang and
 * scaled sx, sy, times brightness k. clip(y) optional: rows y >= clipY are hidden.
 */
export function blitImage(cv, img, W, H, cx, cy, ang = 0, sx = 1, sy = 1, k = 1, clipY = 1e9) {
  const cs = Math.cos(ang), sn = Math.sin(ang), R = Math.hypot(W * sx, H * sy) / 2 + 1;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(cv.w - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(cv.h - 1, Math.ceil(cy + R), Math.ceil(clipY) - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    const u = (dx * cs + dy * sn) / sx + W / 2, v = (-dx * sn + dy * cs) / sy + H / 2;
    let au = (u < W / 2 ? u : W - u) + 0.5, av = (v < H / 2 ? v : H - v) + 0.5;
    if (au <= 0 || av <= 0) continue;
    if (au > 1) au = 1; if (av > 1) av = 1;
    let a = au * av;
    if (y + 0.5 > clipY) a *= clipY - (y - 0.5);
    sampleRGB(img, W, H, u, v, tmp);
    tmp[0] *= k; tmp[1] *= k; tmp[2] *= k;
    cv.over(x, y, tmp, a);
  }
}

/** Bilinear sample of a mask (Float32Array mw x mh) at (u, v), 0 outside. */
export function sample(m, mw, mh, u, v) {
  const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
  const g = (i, j) => (i < 0 || j < 0 || i >= mw || j >= mh ? 0 : m[j * mw + i]);
  return (g(x, y) * (1 - fx) + g(x + 1, y) * fx) * (1 - fy) + (g(x, y + 1) * (1 - fx) + g(x + 1, y + 1) * fx) * fy;
}
