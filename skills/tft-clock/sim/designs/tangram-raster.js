// Tangram: the one drawing routine, a convex polygon filled straight into the
// RGB565 buffer with integer-friendly maths: per pixel the minimum of the
// edge distances (3 or 4 multiply-adds), so the coverage is exact for these
// convex pieces and edges are anti-aliased. `inset` pulls the edge in, which
// opens the hairline seam between pieces that makes a tangram read as
// pieces. A glint (a soft diagonal band of lighter lacquer) is added as a
// per-pixel lighten from a 64-entry ramp. Costs are billed to g.cost the way
// the kit bills its own primitives.

const W = 160, H = 80;
const ex = new Float64Array(8), ey = new Float64Array(8), enx = new Float64Array(8), eny = new Float64Array(8);

/** Unpacked 565 helpers. */
export const r5 = (v) => ((v >> 11) & 31) << 3, g6 = (v) => ((v >> 5) & 63) << 2, b5 = (v) => (v & 31) << 3;
export const pack = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);

/**
 * Fill convex polygon `xs/ys` (n vertices, canvas px) with colour (r, g, b).
 * glint: null, or { k, pos, w, lr, lg, lb }: the band is where |x + k*y - pos| < w,
 * lightened toward (lr, lg, lb) by a triangular profile of strength `amt`.
 */
export function fillPiece(g, xs, ys, n, r, gg, b, inset, gl, alpha = 1) {
  const buf = g.buf;
  // orientation
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += xs[i] * ys[j] - xs[j] * ys[i]; }
  if (Math.abs(area) < 0.05) return;   // edge-on (mid flip): nothing to see
  const sg = area > 0 ? 1 : -1;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i];
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    ex[i] = xs[i]; ey[i] = ys[i];
    // inward normal: for a positive (clockwise on screen, y down) polygon it is (-dy, dx)
    enx[i] = (-dy / L) * sg; eny[i] = (dx / L) * sg;
    if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i];
    if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i];
  }
  const ix0 = Math.max(0, Math.floor(x0)), iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(W - 1, Math.ceil(x1)), iy1 = Math.min(H - 1, Math.ceil(y1));
  if (ix0 > ix1 || iy0 > iy1) return;
  const off = 0.5 - inset;
  let scanned = 0, solid = 0, edge = 0, glints = 0;
  const solidV = pack(r, gg, b);
  for (let y = iy0; y <= iy1; y++) {
    const py = y + 0.5;
    for (let x = ix0; x <= ix1; x++) {
      scanned++;
      const px = x + 0.5;
      let d = 1e9;
      for (let i = 0; i < n; i++) {
        const e = enx[i] * (px - ex[i]) + eny[i] * (py - ey[i]);
        if (e < d) d = e;
      }
      let cov = d + off;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      cov *= alpha;
      let cr = r, cg = gg, cb = b, v = solidV;
      if (gl) {
        const u = px + gl.k * py - gl.pos;
        const au = u < 0 ? -u : u;
        if (au < gl.w) {
          const s = (1 - au / gl.w) * gl.amt;
          cr = (r + (gl.lr - r) * s) | 0; cg = (gg + (gl.lg - gg) * s) | 0; cb = (b + (gl.lb - b) * s) | 0;
          v = pack(cr, cg, cb);
          glints++;
        }
      }
      const i = y * W + x;
      if (cov >= 1) { buf[i] = v; solid++; }
      else {
        const d0 = buf[i], dr = r5(d0), dg = g6(d0), db = b5(d0);
        buf[i] = pack((dr + (cr - dr) * cov) | 0, (dg + (cg - dg) * cov) | 0, (db + (cb - db) * cov) | 0);
        edge++;
      }
    }
  }
  const c = g.cost;
  c.calls++;
  c.box += scanned * 2;       // the edge-distance mins, incremental across a row in C
  c.px += solid;
  c.edge += edge;
  c.blend += edge;
  c.ramp += glints;
}
