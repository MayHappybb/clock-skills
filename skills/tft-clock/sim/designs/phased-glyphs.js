// Phased-array numerals: ten digits drawn as single centre-lines for a
// wave to focus on. A monochromatic field cannot hold a sharp corner or two
// close parallel strokes (the focus is half a wavelength wide and its
// fringes would merge), and every extra pixel of stroke adds speckle to the
// whole glass, so the type is lean: circle and ellipse arcs (wavefronts)
// and straight runs (plane fronts), joined tangentially, counters at least
// a wavelength across, no serifs.
//
// A digit is a list of paths in a unit box (x right, y down); a path is a
// list of commands, sampled into points a fraction of a pixel apart:
//   ['M', x, y]                      move
//   ['L', x, y]                      line
//   ['A', cx, cy, rx, ry, a0, a1]    elliptical arc, clock degrees (0 = up, clockwise; a1 < a0 runs back)
//
// Other faces pass their own table in the same form (unison-glyphs.js).

const D = {
  0: [[['A', 0.5, 0.5, 0.5, 0.5, 0, 360]]],
  1: [[['A', 0.15, 0, 0.45, 0.2, 180, 90], ['L', 0.6, 1]]],
  2: [[['A', 0.5, 0.27, 0.48, 0.27, 270, 480], ['A', 0.02, 0.405, 0.896, 0.575, 90, 180], ['L', 1, 0.98]]],
  3: [[['A', 0.47, 0.25, 0.43, 0.25, 250, 480]], [['A', 0.5, 0.72, 0.5, 0.28, 0, 230]]],
  4: [[['M', 0.75, 1], ['L', 0.75, 0], ['L', 0, 0.68], ['L', 1, 0.68]]],
  5: [[['M', 0.92, 0.01], ['L', 0.14, 0.01], ['L', 0.07, 0.44], ['A', 0.5, 0.66, 0.5, 0.34, 300, 590]]],
  6: [[['A', 0.5, 0.67, 0.5, 0.33, 0, 360]], [['A', 0.95, 0.67, 0.95, 0.67, 270, 345]]],
  7: [[['M', 0, 0.01], ['L', 1, 0.01], ['A', 1, 1, 0.65, 0.99, 360, 270]]],
  8: [[['A', 0.5, 0.235, 0.4, 0.235, 0, 360]], [['A', 0.5, 0.735, 0.5, 0.265, 0, 360]]],
  9: [[['A', 0.5, 0.33, 0.5, 0.33, 0, 360]], [['A', 0.05, 0.33, 0.95, 0.67, 90, 180]]],
};

const DEG = Math.PI / 180;

/** The digit's centre-line as points (pixel coordinates), about `step` px apart, for a w x h box at (x, y). */
export function glyphPoints(d, x, y, w, h, step = 0.5, table = D) {
  const out = [];
  for (const path of table[d]) {
    let px = 0, py = 0, first = true;
    const to = (qx, qy) => {
      const X = x + qx * w, Y = y + qy * h;
      if (!first) {
        const n = Math.max(1, Math.ceil(Math.hypot(X - px, Y - py) / step));
        for (let k = 1; k <= n; k++) out.push([px + ((X - px) * k) / n, py + ((Y - py) * k) / n]);
      } else out.push([X, Y]);
      first = false; px = X; py = Y;
    };
    for (const c of path) {
      if (c[0] === 'M' || c[0] === 'L') { if (c[0] === 'M') first = true; to(c[1], c[2]); continue; }
      const [, cx, cy, rx, ry, a0, a1] = c, len = Math.abs(a1 - a0) * DEG * Math.max(rx * w, ry * h);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = 0; k <= n; k++) {
        const a = (a0 + ((a1 - a0) * k) / n) * DEG;
        const qx = cx + rx * Math.sin(a), qy = cy - ry * Math.cos(a);
        if (k === 0 && !first) { to(qx, qy); continue; }
        if (k === 0) { first = true; to(qx, qy); continue; }
        to(qx, qy);
      }
    }
  }
  return out;
}

export const GLYPHS = D;

/**
 * A numeral's pen path rasterised round its box [x, y, w, h] (margin m px):
 * per pixel, the distance to the path (`dist`) and how far along the path
 * the nearest point is (`along`, px); `L` is the path length, `pts`/`arc`
 * the sampled path. Pen lifts (sub-path jumps) add no length. `table` is
 * the digit set (default: these).
 */
export function penRaster(d, [bx, by, bw, bh], m, table = D, W = 160, H = 80) {
  const pts = glyphPoints(d, bx, by, bw, bh, 0.4, table), arc = [0];
  for (let j = 1; j < pts.length; j++) { const st = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); arc.push(arc[j - 1] + (st < 1.5 ? st : 0)); }
  const L = arc[arc.length - 1];
  const x0 = Math.max(0, Math.floor(bx - m)), y0 = Math.max(0, Math.floor(by - m)), x1 = Math.min(W, Math.ceil(bx + bw + m)), y1 = Math.min(H, Math.ceil(by + bh + m)), gw = x1 - x0;
  const dist = new Float32Array(gw * (y1 - y0)).fill(99), along = new Float32Array(gw * (y1 - y0));
  for (let j = 0; j < pts.length; j++) {
    const [px, py] = pts[j];
    for (let y = Math.max(y0, Math.floor(py - m)); y < Math.min(y1, py + m); y++) for (let x = Math.max(x0, Math.floor(px - m)); x < Math.min(x1, px + m); x++) {
      const dd = Math.hypot(x + 0.5 - px, y + 0.5 - py), i = (y - y0) * gw + x - x0;
      if (dd < dist[i]) { dist[i] = dd; along[i] = arc[j]; }
    }
  }
  /** The point at distance s along the path. */
  const at = (s) => {
    s = Math.max(0, Math.min(L, s));
    let lo = 0, hi = arc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi], seg = arc[hi] - arc[lo], u = seg > 0 ? (s - arc[lo]) / seg : 0;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  return { x0, y0, x1, y1, gw, dist, along, L, pts, arc, at };
}
