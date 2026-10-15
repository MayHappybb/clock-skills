// Beanstalk raster helpers: a 64 x 192 linear-light image plus one scratch
// coverage layer. Strokes are stamped as overlapping discs (max coverage, so
// overlaps don't double), then composited over the image in one pass with a
// lit/shaded colour pair. Leaves, petals and the like paint straight over.

export const W = 64, H = 192;
export const img = new Float32Array(3 * W * H);
const cov = new Float32Array(W * H), sh = new Float32Array(W * H), at = new Float32Array(W * H);
let bx0 = W, by0 = H, bx1 = -1, by1 = -1;

const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Stamp a disc of radius r into the scratch layer; attr is carried per pixel (bud glow / withering). */
export function stamp(cx, cy, r, attr) {
  const x0 = Math.max(0, Math.floor(cx - r - 0.5)), x1 = Math.min(W - 1, Math.ceil(cx + r + 0.5));
  const y0 = Math.max(0, Math.floor(cy - r - 0.5)), y1 = Math.min(H - 1, Math.ceil(cy + r + 0.5));
  if (x0 > x1 || y0 > y1) return;
  if (x0 < bx0) bx0 = x0; if (x1 > bx1) bx1 = x1; if (y0 < by0) by0 = y0; if (y1 > by1) by1 = y1;
  const rr = r + 0.5, inv = 1 / rr;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, d = Math.sqrt(dx * dx + dy * dy);
      let c = rr - d;
      if (c <= 0) continue;
      if (c > 1) c = 1;
      const p = y * W + x;
      if (c > cov[p]) { cov[p] = c; sh[p] = (-0.55 * dx - 0.83 * dy) * inv; at[p] = attr; }
    }
  }
}

/**
 * Composite the scratch layer over the image and clear it. Colour runs from
 * dark (shaded side) to light (lit side); attr mixes toward acol (mode 0) or
 * adds acol (mode 1).
 */
export function flush(dark, light, acol, mode = 0, alpha = 1) {
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const p = y * W + x, c = cov[p];
      if (c <= 0) continue;
      const k = cl(0.45 + 0.75 * sh[p]), a = at[p];
      let r = dark[0] + (light[0] - dark[0]) * k, g = dark[1] + (light[1] - dark[1]) * k, b = dark[2] + (light[2] - dark[2]) * k;
      if (a > 0) {
        if (mode === 0) { const s = 0.4 + 0.6 * k; r += (acol[0] * s - r) * a; g += (acol[1] * s - g) * a; b += (acol[2] * s - b) * a; }
        else { r += acol[0] * a; g += acol[1] * a; b += acol[2] * a; }
      }
      const q = 3 * p, ca = c * alpha;
      img[q] += (r - img[q]) * ca; img[q + 1] += (g - img[q + 1]) * ca; img[q + 2] += (b - img[q + 2]) * ca;
      cov[p] = 0;
    }
  }
  bx0 = W; by0 = H; bx1 = -1; by1 = -1;
}

/** A leaf from (x, y) pointing at angle ang: a lens with a midrib, lit on one half. */
export function leaf(x, y, ang, len, wid, dark, light, alpha = 1) {
  if (len < 0.3 || alpha <= 0) return;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const mx = x + ca * len * 0.5, my = y + sa * len * 0.5, rad = len * 0.5 + wid + 1;
  const x0 = Math.max(0, Math.floor(mx - rad)), x1 = Math.min(W - 1, Math.ceil(mx + rad));
  const y0 = Math.max(0, Math.floor(my - rad)), y1 = Math.min(H - 1, Math.ceil(my + rad));
  const lit = Math.sin(ang) > 0 ? 1 : -1; // the upper half catches the light
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, dy = py - y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      if (u < -0.6 || u > len + 0.6) continue;
      const t = cl(u / len), hw = wid * Math.pow(4 * t * (1 - t), 0.55) * (1 - 0.25 * t);
      let c = cl(hw - Math.abs(v) + 0.5) * cl(u + 0.6) * cl(len - u + 0.4);
      if (c <= 0) continue;
      c *= alpha;
      const k = v * lit < 0 ? 0.75 : 0.2, rib = Math.abs(v) < 0.45 && t < 0.85 ? 0.35 : 0;
      const q = 3 * (py * W + px);
      for (let ch = 0; ch < 3; ch++) {
        const col = dark[ch] + (light[ch] - dark[ch]) * Math.min(1, k + rib);
        img[q + ch] += (col - img[q + ch]) * c;
      }
    }
  }
}

/** Soft additive glow. */
export function glow(x, y, r, col, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  const ir2 = 1 / (r * r);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d2 = ((px - x) ** 2 + (py - y) ** 2) * ir2;
    if (d2 >= 1) continue;
    const f = (1 - d2) * (1 - d2) * a, q = 3 * (py * W + px);
    img[q] += col[0] * f; img[q + 1] += col[1] * f; img[q + 2] += col[2] * f;
  }
}

/** A solid anti-aliased disc painted over. */
export function disc(x, y, r, col, a = 1) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(W - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const c = cl(r + 0.5 - Math.hypot(px - x, py - y)) * a;
    if (c <= 0) continue;
    const q = 3 * (py * W + px);
    img[q] += (col[0] - img[q]) * c; img[q + 1] += (col[1] - img[q + 1]) * c; img[q + 2] += (col[2] - img[q + 2]) * c;
  }
}
