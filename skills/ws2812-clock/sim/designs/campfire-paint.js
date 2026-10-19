// Campfire: raster painting helpers. All shapes are drawn with coverage
// (anti-aliased) into a linear RGB Float32Array of W x H, painted "over".
// Lit shapes take a light value per pixel from the scene's fire light, and an
// optional rim term from the shape's own normal toward the fire.
export const W = 128, H = 64;
export const img = new Float32Array(3 * W * H);

// fire light: centre and strength, set each frame by the scene
export const FL = { x: 64, y: 46, k: 1, amb: 0.05 };
/** Light falling on (x, y) from the fire, plus ambient. */
export function lightAt(x, y) {
  const dx = x - FL.x, dy = (y - FL.y) * 1.25;
  return FL.amb + FL.k / (1 + (dx * dx + dy * dy) / 3200);
}

/** Paint colour (r,g,b) at pixel p over what is there by a. */
export function put(p, r, g, b, a) {
  const q = 3 * p;
  img[q] += (r - img[q]) * a; img[q + 1] += (g - img[q + 1]) * a; img[q + 2] += (b - img[q + 2]) * a;
}
export function addPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const q = 3 * (y * W + x);
  img[q] += r; img[q + 1] += g; img[q + 2] += b;
}
/** A soft dot of light at sub-pixel (x, y), radius rad px, additive. */
export function glowDot(x, y, rad, r, g, b) {
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.ceil(x + rad));
  const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(H - 1, Math.ceil(y + rad));
  const ir = 1 / (rad * rad);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px - x, dy = py - y, f = 1 - (dx * dx + dy * dy) * ir;
    if (f <= 0) continue;
    const q = 3 * (py * W + px), w = f * f;
    img[q] += r * w; img[q + 1] += g * w; img[q + 2] += b * w;
  }
}

/**
 * Lit ellipse. col = albedo [r,g,b]; rim > 0 brightens the side facing the
 * fire by rim * light. emis adds a self-lit amount (0..1) of the albedo.
 */
export function ellipse(cx, cy, rx, ry, col, rim = 0.6, a = 1, emis = 0, clipY = 1e9) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(Math.min(cy + ry + 1, clipY)));
  const m = Math.min(rx, ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ux = (x - cx) / rx, uy = (y - cy) / ry, r = Math.sqrt(ux * ux + uy * uy);
    let cov = (1 - r) * m + 0.5;
    if (cov <= 0) continue;
    if (cov > 1) cov = 1;
    if (y > clipY) continue;
    const L = lightAt(x, y);
    let s = L;
    if (rim) {
      let fx = FL.x - x, fy = FL.y - y; const fl = Math.hypot(fx, fy) || 1;
      const nd = r > 0.001 ? (ux * fx + uy * fy) / (r * fl) : 0;
      s = L * (0.55 + rim * Math.max(0, nd) * r) + emis;
    } else s = L + emis;
    put(y * W + x, col[0] * s, col[1] * s, col[2] * s, cov * a);
  }
}
/** Lit capsule from a to b, radius rad. */
export function capsule(ax, ay, bx, by, rad, col, rim = 0.5, a = 1, emis = 0) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rad + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + rad + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, d = Math.sqrt(ex * ex + ey * ey);
    let cov = rad - d + 0.5;
    if (cov <= 0) continue;
    if (cov > 1) cov = 1;
    const Lt = lightAt(x, y);
    let s = Lt + emis;
    if (rim && d > 0.01) {
      const fx = FL.x - x, fy = FL.y - y, fl = Math.hypot(fx, fy) || 1;
      s = Lt * (0.6 + rim * Math.max(0, (ex * fx + ey * fy) / (d * fl)) * Math.min(1, d / rad)) + emis;
    }
    put(y * W + x, col[0] * s, col[1] * s, col[2] * s, cov * a);
  }
}
/** Darken a disc (shadow / keyline), factor 0..1 at centre. */
export function shade(cx, cy, rad, k) {
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy) / rad;
    if (d >= 1) continue;
    const f = 1 - k * (1 - d * d), q = 3 * (y * W + x);
    img[q] *= f; img[q + 1] *= f; img[q + 2] *= f;
  }
}
