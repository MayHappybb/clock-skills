// Moiré numerals: ten geometric op-art digits built from circle and ellipse
// arcs with flat radial cuts, straight bars and slanted strokes, rasterised
// once at load into 1-bit masks with an inner distance (a chamfer transform)
// so the face can draw contour bands and grow a digit from its outline.
//
// A glyph is { w, h, d: Uint8Array(w * h) }: d = 0 outside, 1 on the edge
// pixels, rising inward (1 + chamfer distance in pixels, capped at 15).

const DEG = Math.PI / 180;

// ---- primitives: each returns a point test (x, y) -> boolean, pixel centres
const bar = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
/** An elliptical ring (outer radii rx, ry, thickness t), clock angles a0..a1 degrees (0 = up, clockwise). */
function arc(cx, cy, rx, ry, t, a0 = 0, a1 = 360) {
  const full = a1 - a0 >= 360;
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) return false;
    const ix = rx - t, iy = ry - t;
    if (ix > 0 && iy > 0 && (dx * dx) / (ix * ix) + (dy * dy) / (iy * iy) <= 1) return false;
    if (full) return true;
    let a = Math.atan2(dx / rx, -dy / ry) / DEG;
    if (a < a0) a += 360;
    if (a < a0) a += 360;
    return a <= a1;
  };
}
/** A stroke of width t along a segment, round ends (bury them in other strokes or the box edge). */
function seg(x0, y0, x1, y1, t) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, r2 = (t / 2) * (t / 2);
  return (x, y) => {
    let u = ((x - x0) * dx + (y - y0) * dy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = x - x0 - u * dx, ey = y - y0 - u * dy;
    return ex * ex + ey * ey <= r2;
  };
}
/** A polygon, even-odd. */
function poly(pts) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

// ---- the ten digits, as unions of primitives in a w x h box with stroke t
function parts(n, w, h, t) {
  const r = w / 2, ym = Math.round(h * 0.46);            // the waist of 3, 5, 6, 8, 9
  const up = { cy: (ym + t / 2) / 2, ry: (ym + t / 2) / 2 };          // upper bowl, top at 0, bottom at the waist
  const lo = { cy: (ym - t / 2 + h) / 2, ry: (h - ym + t / 2) / 2 };  // lower bowl, top at the waist, bottom at h
  switch (n) {
    case 0: return [arc(r, r, r, r, t, 270, 450), arc(r, h - r, r, r, t, 90, 270), bar(0, r, t, h - r), bar(w - t, r, w, h - r)];
    case 1: {
      const sx = Math.round(w / 2 - t / 2 + 3);
      return [bar(sx, 0, sx + t, h), poly([[sx + 0.5, 0], [sx + 0.5, t + 1], [sx - 11, t + 11], [sx - 11, 10]])];
    }
    case 2: {
      const a = 128 * DEG, rc = r - t / 2;
      const ex = r + rc * Math.sin(a), ey = r - rc * Math.cos(a);
      return [arc(r, r, r, r, t, 270, 488), seg(ex, ey, t / 2 + 0.3, h - t / 2, t * 1.08), bar(0, h - t, w, h)];
    }
    case 3: return [arc(r, up.cy, r - 1, up.ry, t, 290, 540), arc(r, lo.cy, r, lo.ry, t, 0, 240)];
    case 4: {
      const sx = w - t - 2, cy = Math.round(h * 0.6);
      return [bar(sx, Math.round(h * 0.22), sx + t, h), bar(0, cy, w, cy + t), poly([[3, 0], [3 + t, 0], [t, cy + 1], [0, cy + 1]])];
    }
    case 5: {
      const sh = lo.cy - lo.ry * 0.55;
      return [bar(1, 0, w, t), bar(1, 0, t + 1, sh + 2), arc(r, lo.cy, r, lo.ry, t, 300, 600)];
    }
    case 6: return [arc(r, lo.cy, r, lo.ry, t), arc(r, h / 2, r, h / 2, t, 200, 395)];
    case 7: return [bar(0, 0, w, t), seg(w - t / 2 - 0.5, t / 2, w * 0.36, h + 4, t * 1.1)];
    case 8: return [arc(r, up.cy, r - 2, up.ry, t), arc(r, lo.cy, r, lo.ry, t)];
    case 9: { const p = parts(6, w, h, t); return p.map((f) => (x, y) => f(w - x, h - y)); }
    default: return [];
  }
}

/** Rasterise digit n at w x h, stroke t, with its inner distance. */
export function glyph(n, w, h, t) {
  const ps = parts(n, w, h, t), d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (ps.some((f) => f(x + 0.5, y + 0.5))) d[y * w + x] = 255;
  // chamfer distance inward (3-4 metric), from outside pixels and the box edge
  const D = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (!d[i]) D[i] = 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
  for (let pass = 0; pass < 2; pass++) {
    const ys = pass ? h - 1 : 0, ye = pass ? -1 : h, st = pass ? -1 : 1;
    for (let y = ys; y !== ye; y += st)
      for (let x = pass ? w - 1 : 0; pass ? x >= 0 : x < w; x += st) {
        const i = y * w + x;
        if (!D[i]) continue;
        D[i] = Math.min(D[i], at(x - st, y) + 3, at(x, y - st) + 3, at(x - st, y - st) + 4, at(x + st, y - st) + 4);
      }
  }
  for (let i = 0; i < w * h; i++) if (d[i]) d[i] = Math.min(15, Math.round(D[i] / 3));
  return { w, h, d };
}

export const DIGITS = (w, h, t) => Array.from({ length: 10 }, (_, n) => glyph(n, w, h, t));
