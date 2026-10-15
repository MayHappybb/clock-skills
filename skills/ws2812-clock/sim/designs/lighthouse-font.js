// Lighthouse: the sandbar digits. Each numeral is a set of sand spits laid
// down by the current: thick where the sand piles up, tapering to a fine
// point at the free ends, the 0 an atoll. Drawn for a 12 x 20 cell on the
// 64 x 64 HUB75 grid (strokes about 3.4 px), as skeletons with a radius at
// every point, so coverage (anti-aliasing) comes out of the distance field.
//
// stroke point: [x, y, r] in cell pixels, y down.

const D2R = Math.PI / 180;
/** Points along an elliptical arc, angles in degrees (0 = right, 90 = down). */
function arc(cx, cy, rx, ry, a0, a1, r0, r1, n = 14, rMid = null) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, a = (a0 + (a1 - a0) * u) * D2R;
    let r = r0 + (r1 - r0) * u;
    if (rMid !== null) r += (rMid - (r0 + r1) / 2) * Math.sin(Math.PI * u);
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), r]);
  }
  return pts;
}
/** Smooth polyline through control points (Catmull-Rom), radius interpolated. */
function curve(ctrl, per = 5) {
  const P = (k) => ctrl[Math.max(0, Math.min(ctrl.length - 1, k))];
  const pts = [];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
      pts.push([f(0), f(1), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  return pts;
}

export const CELL = { w: 12, h: 20 };
const RW = 0.72;                     // stroke weight: radii as drawn x RW

export const GLYPHS = {
  // an atoll: a ring of sand, heavier on the weather (left) side
  0: [arc(6, 10, 4.3, 8.2, 0, 360, 1.75, 1.75, 40, 1.45)],
  // a straight spit with its tip hooked by the current
  1: [curve([[6.8, 19.2, 1.25], [6.8, 11, 1.8], [6.6, 2.4, 2.0], [5.0, 2.0, 1.6], [3.3, 3.6, 1.25], [2.6, 5.4, 1.0]])],
  2: [curve([[1.7, 6.6, 1.15], [2.6, 2.9, 1.6], [6.0, 1.3, 1.8], [9.7, 3.0, 1.85], [9.9, 6.8, 1.85], [6.6, 11.8, 1.8], [2.0, 18.4, 2.0]]),
      curve([[2.0, 18.4, 2.0], [6.5, 18.6, 1.75], [11.2, 18.3, 1.15]])],
  3: [curve([[1.9, 3.6, 1.15], [4.5, 1.3, 1.6], [8.6, 1.8, 1.75], [9.6, 5.4, 1.75], [7.2, 8.9, 1.7], [4.6, 9.6, 1.4]]),
      curve([[6.4, 9.3, 1.6], [10.2, 11.4, 1.85], [10.3, 15.6, 1.85], [7.0, 18.7, 1.75], [3.4, 18.3, 1.45], [1.6, 16.2, 1.1]])],
  4: [curve([[7.4, 1.2, 1.2], [5.0, 5.6, 1.7], [2.6, 10.0, 1.85], [1.4, 13.0, 1.85]]),
      curve([[1.4, 13.0, 1.85], [6.0, 13.2, 1.75], [11.6, 13.0, 1.15]]),
      curve([[9.0, 6.4, 1.15], [9.1, 12.0, 1.85], [9.0, 19.2, 1.35]])],
  5: [curve([[11.0, 1.7, 1.1], [7.0, 1.6, 1.7], [3.2, 1.7, 1.9], [2.7, 5.4, 1.8], [2.6, 8.9, 1.7]]),
      curve([[2.6, 8.9, 1.7], [6.2, 7.6, 1.75], [10.2, 10.4, 1.85], [10.4, 15.0, 1.85], [7.2, 18.6, 1.75], [3.6, 18.4, 1.45], [1.5, 16.4, 1.1]])],
  6: [curve([[10.0, 2.6, 1.1], [7.6, 1.3, 1.6], [4.4, 2.2, 1.8], [2.3, 6.4, 1.9], [1.8, 12.0, 1.9]]),
      arc(6.2, 13.7, 4.4, 5.0, 180, 540, 1.85, 1.85, 30, 1.7)],
  7: [curve([[1.2, 1.7, 1.15], [6.0, 1.6, 1.75], [10.8, 1.7, 1.95], [8.6, 6.6, 1.85], [6.6, 11.4, 1.75], [5.4, 15.6, 1.5], [5.0, 19.2, 1.15]])],
  8: [arc(6, 5.3, 3.75, 4.1, 0, 360, 1.6, 1.6, 30, 1.55),
      arc(6, 14.4, 4.6, 4.9, 0, 360, 1.85, 1.85, 34, 1.75)],
  9: [arc(5.8, 6.3, 4.4, 5.0, 0, 360, 1.85, 1.85, 30, 1.7),
      curve([[10.2, 6.3, 1.9], [10.1, 11.2, 1.9], [8.8, 15.6, 1.8], [6.2, 18.6, 1.5], [2.6, 19.0, 1.1]])],
};

/** Segments [ax, ay, ar, bx, by, br] of a glyph, scaled by s and placed at (ox, oy). */
export function segments(d, ox, oy, s) {
  const out = [];
  for (const st of GLYPHS[d]) {
    for (let k = 0; k + 1 < st.length; k++) {
      const a = st[k], b = st[k + 1];
      out.push([ox + a[0] * s, oy + a[1] * s, a[2] * s * RW, ox + b[0] * s, oy + b[1] * s, b[2] * s * RW]);
    }
  }
  return out;
}

/**
 * Coverage of glyph d in a box on a W-wide raster: returns { x0, y0, w, h, c }
 * with c a Float32Array(w * h). `rough(x, y)` adds to the radius (ragged sand).
 */
export function coverage(d, ox, oy, s, W, H, rough) {
  const segs = segments(d, ox, oy, s);
  const x0 = Math.max(0, Math.floor(ox - 2)), y0 = Math.max(0, Math.floor(oy - 2));
  const x1 = Math.min(W - 1, Math.ceil(ox + CELL.w * s + 2)), y1 = Math.min(H - 1, Math.ceil(oy + CELL.h * s + 2));
  const w = x1 - x0 + 1, h = y1 - y0 + 1, c = new Float32Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let best = 0;
    for (const [ax, ay, ar, bx, by, br] of segs) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d2 = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      const r = ar + (br - ar) * t + (rough ? rough(x, y) : 0);
      const v = r - d2 + 0.5;
      if (v > best) best = v;
    }
    c[(y - y0) * w + (x - x0)] = best > 1 ? 1 : best;
  }
  return { x0, y0, w, h, c };
}
