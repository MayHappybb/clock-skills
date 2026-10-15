// The numerals for delft.js: ten brushed figures in the hand of a 17th-century
// Delft tile painter, built once at load from brush strokes (on the device:
// const tables in flash).
//
// Each figure is a list of brush strokes, each a few points (x, y in the
// glyph box 0..1, w = brush width in px). The painter lays a stroke with
// pressure: hairline where the brush enters, full where it presses, a ball
// where it rests (old Dutch figures end in balls and flags). Rasterised to:
//   cls  0 glaze, 1 'trek' (the dark contour line), 2 'dik' (the lighter wash
//        inside), 4 the wash pooled darker where the loaded brush first
//        touched and in the balls, 3 a sliver of bare glaze where the wash, laid by a second
//        brush, missed the line (it is offset down-right by ~3/4 px, as it is
//        on the real tiles); +8 marks a pounce dot (the charcoal dots left by
//        the pricked paper stencil, on the outline, ~3 px apart)
//   ord  0..255: when the brush reaches that pixel, along the strokes in order
//   path the brush's track, for drawing the brush itself while it paints
// The maps cover the whole digit slot (2 tiles wide), so a tile's fragment is
// a plain lookup.

const TREK = 1.35;     // contour thickness, px
const MINW = 3.3;      // the finest hairline that survives at arm's length
const WASH_DX = 0.75, WASH_DY = 0.7;
const POOL = 4.5;      // px of each stroke where the wash pools darker

// x, y in 0..1 of the glyph box, w in px at the hours' size
const S = {
  0: [
    [[0.56, 0.015, 2.4], [0.24, 0.1, 5.2], [0.06, 0.38, 7.6], [0.1, 0.74, 7], [0.42, 0.985, 2.6]],
    [[0.56, 0.015, 2.4], [0.86, 0.2, 6.2], [0.94, 0.56, 7.4], [0.76, 0.9, 4.6], [0.42, 0.985, 2.6]],
  ],
  1: [
    [[0.14, 0.24, 2.4], [0.36, 0.13, 3.6], [0.6, 0.0, 4.6]],
    [[0.6, 0.0, 4.6], [0.6, 0.3, 7.4], [0.57, 0.7, 7.6], [0.56, 0.955, 7]],
    [[0.18, 0.985, 2.4], [0.4, 0.955, 3.6], [0.72, 0.955, 3.6], [0.95, 0.985, 2.4]],
  ],
  2: [
    [[0.15, 0.2, 7.6]],
    [[0.15, 0.2, 3], [0.3, 0.04, 2.6], [0.62, 0.0, 4], [0.88, 0.15, 6.6], [0.84, 0.4, 7.2], [0.5, 0.68, 6], [0.1, 0.95, 3.6]],
    [[0.08, 0.96, 3.6], [0.36, 0.91, 4.6], [0.66, 0.985, 5], [0.95, 0.92, 3.6]],
  ],
  3: [
    [[0.16, 0.16, 7.4]],
    [[0.16, 0.16, 3], [0.42, 0.01, 2.8], [0.76, 0.06, 6], [0.82, 0.24, 6.4], [0.58, 0.42, 3.4], [0.34, 0.465, 2.4]],
    [[0.44, 0.455, 2.4], [0.82, 0.56, 6.6], [0.93, 0.79, 7.6], [0.62, 0.985, 4], [0.32, 0.98, 3], [0.14, 0.87, 3]],
    [[0.15, 0.84, 7.4]],
  ],
  4: [
    [[0.52, 0.0, 3.4], [0.28, 0.33, 4.8], [0.04, 0.67, 3.6]],
    [[0.04, 0.675, 3.8], [0.5, 0.665, 4.6], [0.97, 0.67, 3.6]],
    [[0.7, 0.1, 5.2], [0.71, 0.5, 7.6], [0.7, 0.97, 7]],
  ],
  5: [
    [[0.3, 0.035, 3.2], [0.6, 0.005, 4.2], [0.95, 0.02, 5.4]],
    [[0.3, 0.035, 6.2], [0.26, 0.24, 6.4], [0.22, 0.45, 4.6]],
    [[0.22, 0.45, 2.8], [0.52, 0.37, 4.2], [0.86, 0.5, 6.6], [0.93, 0.76, 7.6], [0.64, 0.975, 4], [0.32, 0.98, 3], [0.14, 0.87, 3]],
    [[0.15, 0.84, 7.4]],
  ],
  6: [
    [[0.86, 0.13, 7.2]],
    [[0.86, 0.13, 3], [0.62, 0.005, 3], [0.3, 0.1, 5.6], [0.07, 0.45, 7.6], [0.12, 0.8, 6.6], [0.45, 0.985, 3.4], [0.82, 0.88, 6.2], [0.92, 0.66, 6.6], [0.7, 0.47, 3.4], [0.4, 0.47, 2.6], [0.13, 0.6, 2.6]],
  ],
  7: [
    [[0.06, 0.17, 3.2], [0.07, 0.0, 3.6]],
    [[0.07, 0.03, 4], [0.5, 0.05, 4.6], [0.96, 0.0, 5.2]],
    [[0.96, 0.01, 4], [0.72, 0.34, 6.6], [0.52, 0.68, 7.6], [0.45, 0.98, 7]],
  ],
  8: [
    [[0.5, 0.455, 2.8], [0.16, 0.3, 5.2], [0.2, 0.07, 3.4], [0.52, 0.0, 2.6], [0.84, 0.08, 3.6], [0.84, 0.29, 5.4], [0.5, 0.455, 2.8]],
    [[0.5, 0.455, 2.8], [0.08, 0.68, 7.4], [0.2, 0.94, 4.2], [0.5, 0.995, 2.8], [0.82, 0.94, 4.2], [0.93, 0.68, 7.4], [0.5, 0.455, 2.8]],
  ],
  9: [
    [[0.9, 0.33, 3], [0.55, 0.47, 3], [0.12, 0.34, 6.6], [0.26, 0.04, 4], [0.56, 0.0, 2.8], [0.86, 0.14, 6], [0.93, 0.4, 7.6], [0.82, 0.72, 7], [0.52, 0.97, 3.6], [0.17, 0.89, 3]],
    [[0.16, 0.86, 7.2]],
  ],
};

function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return [Math.sqrt(ex * ex + ey * ey), u];
}

/** Catmull-Rom through the points, `n` samples a span: [x, y, w] in px. */
function spline(pts, n = 10) {
  if (pts.length === 1) return [pts[0]];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Build one digit for a slot of sw x sh px, the glyph box at (ox, oy, gw, gh),
 * brush widths scaled by `ws`.
 */
function build(d, sw, sh, ox, oy, gw, gh, ws) {
  // the strokes in px, as segments with cumulative length
  const segs = [];
  let L = 0;
  const path = [];
  for (const st of S[d]) {
    const pts = spline(st.map(([x, y, w]) => [ox + x * gw, oy + y * gh, Math.max(MINW, w * ws)]));
    if (pts.length === 1) {                       // a ball: the brush pressed and lifted
      const [x, y, w] = pts[0];
      segs.push([x, y, x, y, w, w, L, L + 1, 0, 0]);
      path.push([x, y, L]); L += 1; path.push([x, y, L]);
      continue;
    }
    let sl = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, aw] = pts[i], [bx, by, bw] = pts[i + 1];
      const l = Math.hypot(bx - ax, by - ay);
      segs.push([ax, ay, bx, by, aw, bw, L, L + l, sl, sl + l]);
      sl += l;
      path.push([ax, ay, L]);
      L += l;
    }
    path.push([pts[pts.length - 1][0], pts[pts.length - 1][1], L]);
    L += 4;                                       // the brush lifts between strokes
  }
  const field = (px, py) => {
    let best = 1e9, at = 0, loc = 0;
    for (const [ax, ay, bx, by, aw, bw, l0, l1, s0, s1] of segs) {
      const [dist, u] = seg(px, py, ax, ay, bx, by);
      const dd = dist - (aw + (bw - aw) * u) / 2;
      if (dd < best) { best = dd; at = l0 + (l1 - l0) * u; loc = s0 + (s1 - s0) * u; }
    }
    return [best, at, loc];
  };
  const cls = new Uint8Array(sw * sh), ord = new Uint8Array(sw * sh);
  const outline = [];
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const [dd, at, loc] = field(x + 0.5, y + 0.5);
      if (dd > 0) continue;
      const i = y * sw + x;
      ord[i] = Math.min(255, Math.round((at / L) * 255));
      if (dd > -TREK) { cls[i] = 1; if (dd > -1) outline.push([x, y, ord[i]]); }
      else if (field(x + 0.5 - WASH_DX, y + 0.5 - WASH_DY)[0] > -TREK * 0.85) cls[i] = 3;
      // the wash pools darker where the loaded brush first touches, and in the balls
      else cls[i] = loc < POOL - 0.6 * (dd + TREK) ? 4 : 2;
    }
  // pounce dots: along the outline in brush order, ~3 px apart
  outline.sort((a, b) => a[2] - b[2]);
  const dots = [];
  for (const p of outline) {
    let ok = true;
    for (let k = dots.length - 1; k >= 0 && k >= dots.length - 40; k--) {
      const q = dots[k];
      if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < 7.5) { ok = false; break; }
    }
    if (ok) { dots.push(p); cls[p[1] * sw + p[0]] |= 8; }
  }
  const P = new Float32Array(path.length * 3);
  path.forEach(([x, y, l], k) => { P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = l / L; });
  return { w: sw, h: sh, cls, ord, path: P, n: path.length, dots: dots.length };
}

/** Where the brush is at paint progress p (0..1): [x, y] in slot px. */
export function brushAt(G, p) {
  const P = G.path, n = G.n;
  if (p <= 0) return [P[0], P[1]];
  for (let k = 1; k < n; k++)
    if (P[k * 3 + 2] >= p) {
      const a = P[(k - 1) * 3 + 2], b = P[k * 3 + 2], u = b > a ? (p - a) / (b - a) : 1;
      return [P[(k - 1) * 3] + (P[k * 3] - P[(k - 1) * 3]) * u, P[(k - 1) * 3 + 1] + (P[k * 3 + 1] - P[(k - 1) * 3 + 1]) * u];
    }
  return [P[(n - 1) * 3], P[(n - 1) * 3 + 1]];
}

// Hours: a 2 x 5 tile slot (32 x 80), the figure 27 x 70. Minutes: 2 x 3 tiles (32 x 48), 25 x 41.
export const SLOT = {
  H: { w: 32, h: 80, ox: 2.5, oy: 5, gw: 27, gh: 70, ws: 1.32 },
  M: { w: 32, h: 48, ox: 3.5, oy: 3, gw: 25, gh: 41, ws: 1.08 },
};
export const GLYPHS = {};
for (const k of Object.keys(SLOT)) {
  const s = SLOT[k];
  GLYPHS[k] = [];
  for (let d = 0; d <= 9; d++) GLYPHS[k][d] = build(d, s.w, s.h, s.ox, s.oy, s.gw, s.gh, s.ws);
}
