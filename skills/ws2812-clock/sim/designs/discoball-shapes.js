// Discoball: opaque anti-aliased shapes painted OVER the canvas (the frog).
// Colour comes from a per-row LUT (3 floats per canvas row), so the frog can
// be a rainbow from head to toe without per-pixel allocation.
import { img, W, H } from './discoball-raster.js';

/** A capsule (thick line with round ends) a-b of radius r. */
export function capsule(ax, ay, bx, by, r, lut, a = 1) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let py = y0; py <= y1; py++) {
    const cr = lut[3 * py], cg = lut[3 * py + 1], cb = lut[3 * py + 2];
    for (let px = x0; px <= x1; px++) {
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - t * dx, ey = py - ay - t * dy;
      let c = r + 0.5 - Math.sqrt(ex * ex + ey * ey);
      if (c <= 0) continue;
      c = (c > 1 ? 1 : c) * a;
      const p = 3 * (py * W + px);
      img[p] += (cr - img[p]) * c; img[p + 1] += (cg - img[p + 1]) * c; img[p + 2] += (cb - img[p + 2]) * c;
    }
  }
}

/** An axis-aligned ellipse centred (cx, cy). */
export function ellipse(cx, cy, rx, ry, lut, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const m = Math.min(rx, ry);
  for (let py = y0; py <= y1; py++) {
    const cr = lut[3 * py], cg = lut[3 * py + 1], cb = lut[3 * py + 2];
    const ny = (py - cy) / ry;
    for (let px = x0; px <= x1; px++) {
      const nx = (px - cx) / rx;
      let c = 0.5 - (Math.sqrt(nx * nx + ny * ny) - 1) * m;
      if (c <= 0) continue;
      c = (c > 1 ? 1 : c) * a;
      const p = 3 * (py * W + px);
      img[p] += (cr - img[p]) * c; img[p + 1] += (cg - img[p + 1]) * c; img[p + 2] += (cb - img[p + 2]) * c;
    }
  }
}

/** A flat LUT of one colour. */
export function flat(lut, c) { for (let y = 0; y < H; y++) { lut[3 * y] = c[0]; lut[3 * y + 1] = c[1]; lut[3 * y + 2] = c[2]; } return lut; }
