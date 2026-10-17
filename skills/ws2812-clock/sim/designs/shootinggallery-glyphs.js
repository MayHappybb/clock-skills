// Shooting gallery numerals: a fairground fat-face (Bodoni-on-a-carnival-
// wagon) with ball terminals, thick verticals and hairline-ish joins, drawn
// as signed-distance shapes in a 72 x 100 design box. They are never drawn
// flat: tex.js stamps them into tin (raised, chipped enamel, lit edges).

const hyp = Math.hypot;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---- shape distances (design units, negative inside)
export function ell(px, py, cx, cy, rx, ry) {
  const x = px - cx, y = py - cy, q = hyp(x / rx, y / ry);
  if (q < 1e-6) return -Math.min(rx, ry);
  const g = hyp(x / (rx * rx), y / (ry * ry));
  return ((q - 1) * q) / g;
}
const DEG = Math.PI / 180;
/** Elliptic ring: outer rx, ry; side strokes tx thick, top/bottom ty. Optional arc a0..a1 (deg, y down, clockwise). */
export function ring(px, py, cx, cy, rx, ry, tx, ty, a0, a1) {
  let d = Math.max(ell(px, py, cx, cy, rx, ry), -ell(px, py, cx, cy, rx - tx, ry - ty));
  if (a0 !== undefined) {
    const x = px - cx, y = py - cy;
    const c0 = Math.cos(a0 * DEG), s0 = Math.sin(a0 * DEG), c1 = Math.cos(a1 * DEG), s1 = Math.sin(a1 * DEG);
    const d0 = -(c0 * y - s0 * x), d1 = -(x * s1 - y * c1);
    const w = a1 - a0 <= 180 ? Math.max(d0, d1) : Math.min(d0, d1);
    d = Math.max(d, w);
  }
  return d;
}
export function cap(px, py, ax, ay, bx, by, r0, r1 = r0) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return hyp(px - ax - t * dx, py - ay - t * dy) - (r0 + (r1 - r0) * t);
}
export const circ = (px, py, cx, cy, r) => hyp(px - cx, py - cy) - r;
export function box(px, py, x0, y0, x1, y1) {
  const qx = Math.max(x0 - px, px - x1), qy = Math.max(y0 - py, py - y1);
  return qx > 0 && qy > 0 ? hyp(qx, qy) : Math.max(qx, qy);
}
/** Convex polygon, points in any consistent order. */
export function poly(px, py, pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  let d = -1e9;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    let nx = b[1] - a[1], ny = a[0] - b[0];
    const L = hyp(nx, ny); nx /= L; ny /= L;
    if ((cx - a[0]) * nx + (cy - a[1]) * ny > 0) { nx = -nx; ny = -ny; }
    d = Math.max(d, (px - a[0]) * nx + (py - a[1]) * ny);
  }
  return d;
}
const U = Math.min;

/** Signed distance to digit d at (x, y) in the 72 x 100 box. */
export function digitSDF(d, x, y) {
  switch (d) {
    case 0: return ring(x, y, 36, 50, 34, 49, 22, 10);
    case 1: return U(
      poly(x, y, [[25, 9], [47, 1], [47, 91], [25, 91]]),
      cap(x, y, 30, 10, 10, 25, 4.5, 3.5),
      circ(x, y, 11, 24, 5),
      box(x, y, 12, 88, 60, 98),
    );
    case 2: return U(
      ring(x, y, 36, 31, 32, 28, 20, 9, -175, 38),
      circ(x, y, 15, 28, 11),
      cap(x, y, 57, 50, 12, 86, 5, 7),
      box(x, y, 4, 84, 70, 98),
      box(x, y, 61, 72, 70, 98),
    );
    case 3: return U(
      ring(x, y, 35, 26, 28, 24, 17, 8, -165, 95),
      ring(x, y, 36, 71, 33, 28, 21, 9, -95, 165),
      circ(x, y, 13, 20, 9.5),
      circ(x, y, 12, 79, 10.5),
      box(x, y, 26, 43, 38, 51),
    );
    case 4: return U(
      cap(x, y, 50, 6, 5, 68, 4.5),
      box(x, y, 41, 2, 63, 96),
      box(x, y, 2, 63, 72, 73),
      box(x, y, 31, 89, 72, 98),
    );
    case 5: return U(
      box(x, y, 19, 2, 66, 13),
      box(x, y, 17, 2, 27, 46),
      ring(x, y, 36, 64, 33, 32, 21, 9, -128, 150),
      circ(x, y, 12, 80, 10.5),
    );
    case 6: return U(
      ring(x, y, 37, 66, 33, 31, 21, 9),
      ring(x, y, 47, 54, 43, 50, 21, 9, 180, 298),
      circ(x, y, 63, 15, 9.5),
    );
    case 7: return U(
      box(x, y, 4, 2, 70, 14),
      box(x, y, 4, 2, 12, 24),
      poly(x, y, [[55, 12], [70, 12], [40, 98], [18, 98]]),
    );
    case 8: return U(
      ring(x, y, 36, 26, 27, 23, 18, 8),
      ring(x, y, 36, 72, 33, 27, 22, 9),
    );
    case 9: return U(
      ring(x, y, 35, 34, 33, 31, 21, 9),
      ring(x, y, 25, 46, 43, 50, 21, 9, 0, 118),
      circ(x, y, 9, 85, 9.5),
    );
  }
  return 1e9;
}

/**
 * Coverage mask (0..1) of digit d drawn in a w x h pixel box: Float32Array(w*h).
 * 3x3 supersampled distance coverage.
 */
export function digitMask(d, w, h) {
  const m = new Float32Array(w * h), sx = 72 / w, sy = 100 / h, ppu = Math.min(w / 72, h / 100);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const dd = digitSDF(d, (x + (i + 0.5) / 3) * sx, (y + (j + 0.5) / 3) * sy) * ppu * 3;
      s += clamp(0.5 - dd, 0, 1);
    }
    m[y * w + x] = s / 9;
  }
  return m;
}
