// Trainset painting helpers: a supersampled vector Canvas for building
// sprites and the static scene once, and fast compositing of those sprites
// (sub-pixel, bilinear, premultiplied) into a linear RGB float raster.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A supersampled RGBA canvas. Shapes overwrite (or blend over) in painter's order. */
export class Canvas {
  constructor(w, h, ss = 4) {
    this.w = w; this.h = h; this.ss = ss;
    this.W = w * ss; this.H = h * ss;
    this.c = new Float32Array(3 * this.W * this.H);
    this.a = new Float32Array(this.W * this.H);
  }
  /** Fill every sample inside test(x, y) (pixel units) within the bbox with col (array or fn(x, y)). */
  shape(x0, y0, x1, y1, test, col, alpha = 1) {
    const s = this.ss, W = this.W;
    const i0 = Math.max(0, Math.floor(x0 * s)), i1 = Math.min(W - 1, Math.ceil(x1 * s));
    const j0 = Math.max(0, Math.floor(y0 * s)), j1 = Math.min(this.H - 1, Math.ceil(y1 * s));
    const fn = typeof col === 'function', erase = col === 'erase';
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) / s;
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) / s;
        if (!test(x, y)) continue;
        if (erase) { this.a[j * W + i] = 0; continue; }
        const cc = fn ? col(x, y) : col;
        if (!cc) continue;
        const p = j * W + i, a = alpha * (cc[3] ?? 1);
        this.c[3 * p] += (cc[0] - this.c[3 * p]) * a;
        this.c[3 * p + 1] += (cc[1] - this.c[3 * p + 1]) * a;
        this.c[3 * p + 2] += (cc[2] - this.c[3 * p + 2]) * a;
        this.a[p] += (1 - this.a[p]) * a;
      }
    }
    return this;
  }
  rect(x0, y0, x1, y1, col, a) { return this.shape(x0, y0, x1, y1, () => true, col, a); }
  circle(cx, cy, r, col, a) { return this.shape(cx - r, cy - r, cx + r, cy + r, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, col, a); }
  ellipse(cx, cy, rx, ry, col, a) {
    return this.shape(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, col, a);
  }
  ring(cx, cy, r0, r1, col, a) {
    return this.shape(cx - r1, cy - r1, cx + r1, cy + r1, (x, y) => { const d = (x - cx) ** 2 + (y - cy) ** 2; return d <= r1 * r1 && d >= r0 * r0; }, col, a);
  }
  rrect(x0, y0, x1, y1, r, col, a) {
    return this.shape(x0, y0, x1, y1, (x, y) => {
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
      return dx * dx + dy * dy <= r * r;
    }, col, a);
  }
  /** Capsule from (ax, ay) to (bx, by), width w (half-widths may differ at the ends: w as [wa, wb]). */
  line(ax, ay, bx, by, w, col, a) {
    const [wa, wb] = Array.isArray(w) ? w : [w, w], R = Math.max(wa, wb) / 2;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    return this.shape(Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, (x, y) => {
      const t = clamp01(((x - ax) * dx + (y - ay) * dy) / L2);
      const r = (wa + (wb - wa) * t) / 2;
      return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
    }, col, a);
  }
  poly(pts, col, a) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return this.shape(x0, y0, x1, y1, (x, y) => inPoly(pts, x, y), col, a);
  }
  /** Quadratic Bezier stroke, width going wa -> wb. */
  bez(p0, p1, p2, wa, wb, col, a, n = 24) {
    let prev = p0;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      const p = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
      this.line(prev[0], prev[1], p[0], p[1], [wa + (wb - wa) * (k - 1) / n, wa + (wb - wa) * k / n], col, a);
      prev = p;
    }
    return this;
  }
  /** Downsample to a premultiplied RGBA sprite { w, h, px }. */
  sprite() {
    const { w, h, ss, W } = this, px = new Float32Array(4 * w * h), n = ss * ss;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const p = (y * ss + j) * W + x * ss + i, aa = this.a[p];
        r += this.c[3 * p] * aa; g += this.c[3 * p + 1] * aa; b += this.c[3 * p + 2] * aa; al += aa;
      }
      const q = 4 * (y * w + x);
      px[q] = r / n; px[q + 1] = g / n; px[q + 2] = b / n; px[q + 3] = al / n;
    }
    return { w, h, px };
  }
}

export function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Mirror a sprite left-right. */
export function flipX(s) {
  const px = new Float32Array(s.px.length);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const a = 4 * (y * s.w + x), b = 4 * (y * s.w + s.w - 1 - x);
    px[b] = s.px[a]; px[b + 1] = s.px[a + 1]; px[b + 2] = s.px[a + 2]; px[b + 3] = s.px[a + 3];
  }
  return { w: s.w, h: s.h, px };
}

// ------------------------------------------------------------ compositing
// img: Float32Array(3 * W * H), linear RGB. All "over" compositing of
// premultiplied sprites: dst = dst * (1 - a) + rgb.

/**
 * Draw sprite s with its top-left at (x, y), fractional: bilinear, so it glides.
 * k scales its light (dim), op its opacity. clip(x, y) -> false skips a pixel.
 */
export function blit(img, W, H, s, x, y, k = 1, op = 1, clip = null) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const sp = s.px, sw = s.w, sh = s.h;
  for (let v = 0; v <= sh; v++) {
    const Y = yi + v;
    if (Y < 0 || Y >= H) continue;
    for (let u = 0; u <= sw; u++) {
      const X = xi + u;
      if (X < 0 || X >= W) continue;
      if (clip && !clip(X, Y)) continue;
      // source texel (u - 1 + 1 - fx ...) : pixel X covers sprite coords (u - fx, v - fy)
      let r = 0, g = 0, b = 0, a = 0;
      const sx1 = u, sy1 = v, sx0 = u - 1, sy0 = v - 1;
      // weights: texel (sx0,sy0) gets w11, (sx1,sy0) w01, (sx0,sy1) w10, (sx1,sy1) w00
      if (sy0 >= 0 && sy0 < sh) {
        if (sx0 >= 0 && sx0 < sw) { const q = 4 * (sy0 * sw + sx0); r += sp[q] * w11; g += sp[q + 1] * w11; b += sp[q + 2] * w11; a += sp[q + 3] * w11; }
        if (sx1 < sw) { const q = 4 * (sy0 * sw + sx1); r += sp[q] * w01; g += sp[q + 1] * w01; b += sp[q + 2] * w01; a += sp[q + 3] * w01; }
      }
      if (sy1 < sh) {
        if (sx0 >= 0 && sx0 < sw) { const q = 4 * (sy1 * sw + sx0); r += sp[q] * w10; g += sp[q + 1] * w10; b += sp[q + 2] * w10; a += sp[q + 3] * w10; }
        if (sx1 < sw) { const q = 4 * (sy1 * sw + sx1); r += sp[q] * w00; g += sp[q + 1] * w00; b += sp[q + 2] * w00; a += sp[q + 3] * w00; }
      }
      if (a <= 0.002) continue;
      a *= op;
      const p = 3 * (Y * W + X);
      img[p] = img[p] * (1 - a) + r * k * op;
      img[p + 1] = img[p + 1] * (1 - a) + g * k * op;
      img[p + 2] = img[p + 2] * (1 - a) + b * k * op;
    }
  }
}

/**
 * Draw sprite s transformed: sprite point (ax, ay) lands on (cx, cy), then
 * rotated by ang and scaled (sx, sy) about it. Bilinear inverse mapping.
 */
export function blitAffine(img, W, H, s, ax, ay, cx, cy, ang = 0, sx = 1, sy = 1, k = 1, op = 1, clip = null) {
  if (Math.abs(sx) < 0.02 || Math.abs(sy) < 0.02) return;
  const co = Math.cos(ang), si = Math.sin(ang);
  // forward corners for bbox
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]]) {
    const lx = (u - ax) * sx, ly = (v - ay) * sy;
    const X = cx + lx * co - ly * si, Y = cy + lx * si + ly * co;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  const sp = s.px, sw = s.w, sh = s.h;
  const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W - 1, Math.ceil(x1));
  const Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y1));
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    if (clip && !clip(X, Y)) continue;
    const dx = X + 0.5 - cx, dy = Y + 0.5 - cy;
    const u = (dx * co + dy * si) / sx + ax - 0.5, v = (-dx * si + dy * co) / sy + ay - 0.5;
    const ui = Math.floor(u), vi = Math.floor(v);
    if (ui < -1 || vi < -1 || ui >= sw || vi >= sh) continue;
    const fu = u - ui, fv = v - vi;
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) {
      const vv = vi + j;
      if (vv < 0 || vv >= sh) continue;
      const wv = j ? fv : 1 - fv;
      for (let i = 0; i < 2; i++) {
        const uu = ui + i;
        if (uu < 0 || uu >= sw) continue;
        const wgt = wv * (i ? fu : 1 - fu), q = 4 * (vv * sw + uu);
        r += sp[q] * wgt; g += sp[q + 1] * wgt; b += sp[q + 2] * wgt; a += sp[q + 3] * wgt;
      }
    }
    if (a <= 0.002) continue;
    a *= op;
    const p = 3 * (Y * W + X);
    img[p] = img[p] * (1 - a) + r * k * op;
    img[p + 1] = img[p + 1] * (1 - a) + g * k * op;
    img[p + 2] = img[p + 2] * (1 - a) + b * k * op;
  }
}

/** Soft round puff (smoke, glow) painted over: falloff (1 - d^2)^2. add=true adds light instead. */
export function puff(img, W, H, x, y, r, c, a, add = false) {
  if (a <= 0.002 || r <= 0.2) return;
  const X0 = Math.max(0, Math.floor(x - r)), X1 = Math.min(W - 1, Math.ceil(x + r));
  const Y0 = Math.max(0, Math.floor(y - r)), Y1 = Math.min(H - 1, Math.ceil(y + r));
  const ir2 = 1 / (r * r);
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    const d2 = ((X + 0.5 - x) ** 2 + (Y + 0.5 - y) ** 2) * ir2;
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * a, p = 3 * (Y * W + X);
    if (add) { img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f; }
    else { img[p] += (c[0] - img[p]) * f; img[p + 1] += (c[1] - img[p + 1]) * f; img[p + 2] += (c[2] - img[p + 2]) * f; }
  }
}

/** Anti-aliased line of width w painted over with colour c, opacity a. */
export function line(img, W, H, ax, ay, bx, by, w, c, a = 1) {
  const R = w / 2 + 1;
  const X0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), X1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
  const Y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), Y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    const px = X + 0.5, py = Y + 0.5;
    const t = clamp01(((px - ax) * dx + (py - ay) * dy) / L2);
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    const cov = clamp01(w / 2 + 0.5 - d) * a;
    if (cov <= 0) continue;
    const p = 3 * (Y * W + X);
    img[p] += (c[0] - img[p]) * cov; img[p + 1] += (c[1] - img[p + 1]) * cov; img[p + 2] += (c[2] - img[p + 2]) * cov;
  }
}

/** Anti-aliased filled disc painted over. */
export function disc(img, W, H, x, y, r, c, a = 1) {
  const X0 = Math.max(0, Math.floor(x - r - 1)), X1 = Math.min(W - 1, Math.ceil(x + r + 1));
  const Y0 = Math.max(0, Math.floor(y - r - 1)), Y1 = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
    const d = Math.hypot(X + 0.5 - x, Y + 0.5 - y);
    const cov = clamp01(r + 0.5 - d) * a;
    if (cov <= 0) continue;
    const p = 3 * (Y * W + X);
    img[p] += (c[0] - img[p]) * cov; img[p + 1] += (c[1] - img[p + 1]) * cov; img[p + 2] += (c[2] - img[p + 2]) * cov;
  }
}
