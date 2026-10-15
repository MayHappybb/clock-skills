// Knit: drawing helpers on a 64x64 linear-RGB raster (Float32Array 3*W*H).
// Everything is coverage-sampled so it glides between pixels.
import * as kit from '../js/kit.js';

export const W = 64, H = 64;

/** Paint a round-capped segment of radius r over img: colour col, opacity a. */
export function seg(img, ax, ay, bx, by, r, col, a = 1) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - t * dx, ey = py - ay - t * dy;
      const d = Math.sqrt(ex * ex + ey * ey);
      let c = r + 0.5 - d;
      if (c <= 0) continue;
      if (c > 1) c = 1;
      c *= a;
      const p = 3 * (y * W + x);
      img[p] += (col[0] - img[p]) * c; img[p + 1] += (col[1] - img[p + 1]) * c; img[p + 2] += (col[2] - img[p + 2]) * c;
    }
  }
}

/** A polyline (flat array x0,y0,x1,y1,...) as a strand of yarn with a soft
 *  shadow under it, so it reads lifted off the fabric. */
export function strand(img, pts, r, col, a = 1, shadow = 0.7) {
  const n = pts.length / 2;
  if (shadow > 0) for (let k = 0; k + 1 < n; k++) seg(img, pts[2 * k] + 0.6, pts[2 * k + 1] + 0.9, pts[2 * k + 2] + 0.6, pts[2 * k + 3] + 0.9, r + 0.2, [0, 0, 0], a * shadow);
  for (let k = 0; k + 1 < n; k++) {
    // a twist highlight running along the ply
    const tw = 0.82 + 0.18 * Math.sin(k * 2.1);
    seg(img, pts[2 * k], pts[2 * k + 1], pts[2 * k + 2], pts[2 * k + 3], r, [col[0] * tw, col[1] * tw, col[2] * tw], a);
  }
}

/**
 * A kinked strand from A to B: freshly unravelled yarn keeps the crimp of
 * the stitches it was in, a ramen wave that relaxes toward the far end.
 * sag pulls it down under gravity; phase rolls the kinks along it.
 */
export function kinked(ax, ay, bx, by, { kink = 1.3, wave = 3.2, sag = 3, bow = 0, phase = 0, relax = 0.6, out } = {}) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / L, ny = dx / L;
  const n = Math.max(2, Math.min(48, Math.ceil(L / 1.2)));
  const pts = out || [];
  pts.length = 0;
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const amp = kink * (1 - relax * s) * Math.min(1, s * 6) * Math.min(1, (1 - s) * 10 + 0.3);
    const w = amp * Math.sin((s * L) / wave * kit.TAU + phase) + bow * Math.sin(Math.PI * s);
    const g = sag * Math.sin(Math.PI * s);
    pts.push(ax + dx * s + nx * w, ay + dy * s + ny * w + g);
  }
  return pts;
}

/** A steel tapestry needle: tip at (tx, ty) pointing along (ux, uy). */
export function darner(img, tx, ty, ux, uy, a = 1, thread = null) {
  const len = 11, ex = tx - ux * len, ey = ty - uy * len;
  seg(img, tx + 0.7, ty + 1.0, ex + 0.7, ey + 1.0, 0.9, [0, 0, 0], 0.65 * a);
  seg(img, tx, ty, ex, ey, 0.75, [0.55, 0.62, 0.72], a);
  // the polished top edge catches the light
  seg(img, tx - uy * 0.35, ty + ux * 0.35 - 0.3, ex - uy * 0.35, ey + ux * 0.35 - 0.3, 0.3, [0.95, 0.97, 1], 0.8 * a);
  // the eye: a dark slot near the blunt end, with the yarn through it
  const eyx = tx - ux * (len - 1.8), eyy = ty - uy * (len - 1.8);
  seg(img, eyx - ux * 0.8, eyy - uy * 0.8, eyx + ux * 0.8, eyy + uy * 0.8, 0.35, [0, 0, 0], 0.9 * a);
  if (thread) {
    const pts = kinked(eyx, eyy, thread[0], thread[1], { kink: 0.5, wave: 4, sag: 1.5, relax: 0 });
    strand(img, pts, 0.75, thread[2], a, 0.6);
  }
}
