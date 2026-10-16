// flipbook: the pencil, the coloured pencils and the paper geometry.
//
// Everything on a page is drawn by Pen: a 1-px graphite line plotted pixel
// by pixel, gone over two or three times with a little jitter (so a stroke
// is 2-3 px of uneven grey with paper tooth showing through), plus coloured
// pencil hatching clipped to a polygon. Each page re-jitters its strokes
// from its own seed, which is the line boil of a hand-drawn flipbook.
//
// A Pen can be masked to one side of a fold line (the part of a page not
// yet peeled away) and can mirror what it draws across that line (the
// graphite seen through the back of a turning page).

import { rand } from '../js/kit.js';

const GRAIN = new Float32Array(1024);
for (let i = 0; i < 1024; i++) GRAIN[i] = rand(i, 77);

/** Paper tooth at a pixel, 0..1, fixed to the paper. */
export const tooth = (x, y) => GRAIN[((x * 37) ^ (y * 101) ^ (x * y)) & 1023];

const fl = (v) => ((v + 4096) | 0) - 4096;

export class Pen {
  constructor(g) {
    this.g = g;
    this.hp = null;       // [nx, ny, c]: draw only where nx*x + ny*y <= c
    this.mir = null;      // [mx, my, nx, ny]: mirror across the line through m with normal n
    this.box = [8, 0, 160, 77];
    this.k = 1;           // global opacity
    this.lx = -99; this.ly = -99;
  }

  dab(xi, yi, c, a) {
    const b = this.box;
    if (xi < b[0] || yi < b[1] || xi >= b[2] || yi >= b[3]) return;
    if (xi === this.lx && yi === this.ly) return;
    this.lx = xi; this.ly = yi;
    const hp = this.hp;
    if (hp !== null && hp[0] * (xi + 0.5) + hp[1] * (yi + 0.5) > hp[2]) return;
    this.g.pixel(xi, yi, c, { a: a * this.k * (0.55 + 0.45 * tooth(xi, yi)) });
  }

  map(x, y) {
    const m = this.mir;
    if (m === null) return [x, y];
    const s = (x - m[0]) * m[2] + (y - m[1]) * m[3];
    return [x - 2 * s * m[2], y - 2 * s * m[3]];
  }

  /** A 1-px pencil segment between continuous points. */
  seg(x0, y0, x1, y1, c, a) {
    if (this.mir !== null) { [x0, y0] = this.map(x0, y0); [x1, y1] = this.map(x1, y1); }
    const dx = x1 - x0, dy = y1 - y0;
    const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
    const n = ((adx > ady ? adx : ady) | 0) + 1;
    for (let i = 1; i <= n; i++) this.dab(fl(x0 + (dx * i) / n), fl(y0 + (dy * i) / n), c, a);
  }

  /**
   * A pencil stroke through points [[x, y], ...] (page pixels), smoothed
   * with Catmull-Rom unless `sharp`. `passes` goings-over, `jit` px of
   * wobble per point, from `seed`.
   */
  stroke(pts, c, { passes = 2, jit = 0.5, a = 0.8, seed = 0, smooth = true, upto = 1, spread = 1.3 } = {}) {
    const n = pts.length;
    if (n < 2 || upto <= 0) return;
    for (let p = 0; p < passes; p++) {
      const ox = (rand(p, seed, 11) - 0.5) * spread, oy = (rand(p, seed, 12) - 0.5) * spread;
      const q = [];
      for (let i = 0; i < n; i++)
        q.push([pts[i][0] + ox + (rand(i, p, seed) - 0.5) * 2 * jit, pts[i][1] + oy + (rand(i, p, seed + 3) - 0.5) * 2 * jit]);
      const sub = smooth && n > 2 ? 3 : 1;
      const total = (n - 1) * sub, last = upto >= 1 ? total : Math.max(1, Math.round(total * upto));
      let px = q[0][0], py = q[0][1], step = 0;
      this.lx = -99;
      for (let i = 0; i < n - 1 && step < last; i++) {
        const p0 = q[i > 0 ? i - 1 : 0], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2 < n ? i + 2 : n - 1];
        const pa = a * (0.78 + 0.22 * rand(i, p, seed + 7));
        for (let s = 1; s <= sub && step < last; s++, step++) {
          let x, y;
          if (sub === 1) { x = p2[0]; y = p2[1]; } else {
            const t = s / sub, t2 = t * t, t3 = t2 * t;
            x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
            y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
          }
          this.seg(px, py, x, y, c, pa);
          px = x; py = y;
        }
      }
    }
  }

  /** Coloured-pencil hatching inside a polygon (page pixels): parallel strokes rising to the right. */
  hatch(poly, c, { gap = 2, a = 0.7, seed = 0, upto = 1 } = {}) {
    const ux = 0.57, uy = -0.82, mx = 0.82, my = 0.57;   // stroke direction and its normal
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of poly) { const s = x * mx + y * my; if (s < lo) lo = s; if (s > hi) hi = s; }
    const cut = lo + (hi - lo) * upto;
    let row = 0;
    for (let s = lo + gap * 0.5; s < cut; s += gap, row++) {
      const ts = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, ay] = poly[j], [bx, by] = poly[i];
        const sa = ax * mx + ay * my - s, sb = bx * mx + by * my - s;
        if ((sa <= 0) === (sb <= 0)) continue;
        const f = sa / (sa - sb), x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
        ts.push(x * ux + y * uy);
      }
      ts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < ts.length; k += 2) {
        const j0 = (rand(row, k, seed) - 0.5) * 1.6, j1 = (rand(row, k, seed + 1) - 0.5) * 1.6;
        const t0 = ts[k] + j0, t1 = ts[k + 1] + j1;
        if (t1 <= t0) continue;
        this.lx = -99;
        this.seg(s * mx + t0 * ux, s * my + t0 * uy, s * mx + t1 * ux, s * my + t1 * uy, c, a);
      }
    }
  }

  /** A small pressed pencil dot. */
  dot(x, y, r, c, a = 0.9) {
    if (this.mir !== null) [x, y] = this.map(x, y);
    const r2 = r * r;
    for (let j = fl(y - r); j <= y + r; j++)
      for (let i = fl(x - r); i <= x + r; i++) {
        const dx = i + 0.5 - x, dy = j + 0.5 - y;
        if (dx * dx + dy * dy <= r2) { this.lx = -99; this.dab(i, j, c, a); }
      }
  }
}

// ------------------------------------------------------------ polygons

/** Keep the part of a convex-or-not polygon where nx*x + ny*y <= c (le) or >= c. */
export function clipHalf(poly, nx, ny, c, le = true) {
  const out = [];
  const side = (p) => (le ? nx * p[0] + ny * p[1] - c : c - nx * p[0] - ny * p[1]);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const f = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  return out;
}

/** Mirror points across the line through (mx, my) with unit normal (nx, ny). */
export function mirror(poly, mx, my, nx, ny) {
  return poly.map(([x, y]) => {
    const s = (x - mx) * nx + (y - my) * ny;
    return [x - 2 * s * nx, y - 2 * s * ny];
  });
}

export const shiftPoly = (poly, dx, dy) => poly.map(([x, y]) => [x + dx, y + dy]);
