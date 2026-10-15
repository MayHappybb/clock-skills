// Atelier: brush-script numerals, drawn as real brush strokes in stroke order.
//
// Each digit is a list of strokes; each stroke a list of control points in a
// 10 x 14 unit box (y down). A point with a third element 1 is a sharp
// corner (the brush turns without lifting). The strokes are smoothed
// (Catmull-Rom), slanted, and sampled into short segments carrying the width
// of a flat brush held at a fixed angle (thick across its edge, thin along
// it); the brush lands a little thin and runs dry at the end.

export const UNIT = 1.26;          // px per glyph unit
export const SLANT = 0.13;         // italic shear
export const BASE_W = 3.9;         // flat brush width, px, drawn across its edge
const NIB = -0.62;                 // the flat brush's edge angle (rad, y down): thick verticals, thin up-right hairlines

const G = {
  0: [[[6.0, 0.7], [3.0, 1.6], [1.2, 5.6], [1.4, 10.6], [4.0, 13.3], [7.2, 12.4], [8.9, 8.2], [8.6, 3.4], [6.6, 0.9], [4.6, 1.1]]],
  1: [[[2.6, 3.8], [4.6, 2.4], [6.4, 0.6, 1], [5.9, 7.0], [5.4, 13.4]]],
  2: [[[1.4, 3.6], [3.0, 1.0], [6.0, 0.5], [8.5, 2.2], [8.3, 5.2], [5.8, 8.4], [1.2, 13.2, 1], [4.8, 12.5], [9.3, 13.1]]],
  3: [[[1.6, 2.2], [4.6, 0.5], [7.9, 1.6], [8.0, 4.4], [4.4, 6.6, 1], [8.0, 8.0], [8.7, 11.0], [6.0, 13.4], [2.6, 13.2], [1.0, 11.4]]],
  4: [[[6.7, 0.6], [3.6, 5.2], [0.8, 9.5, 1], [5.0, 9.2], [9.6, 9.3]], [[7.4, 4.4], [7.2, 9.0], [7.0, 13.5]]],
  5: [[[2.8, 0.8], [2.4, 3.6], [2.0, 6.4, 1], [5.2, 5.4], [8.2, 6.8], [8.8, 10.0], [6.8, 13.0], [3.4, 13.4], [1.0, 11.6]], [[2.8, 0.9], [5.8, 0.9], [9.0, 0.5]]],
  6: [[[8.2, 1.4], [5.8, 0.4], [3.0, 2.0], [1.3, 6.6], [1.6, 11.4], [4.4, 13.4], [7.6, 12.6], [8.8, 9.6], [7.4, 6.6], [4.4, 6.4], [1.6, 8.6]]],
  7: [[[1.0, 1.8], [3.6, 0.7], [6.4, 1.2], [9.4, 0.6, 1], [6.6, 5.6], [5.0, 9.6], [4.4, 13.5]]],
  8: [[[8.0, 2.4], [5.2, 0.4], [2.0, 1.8], [2.4, 4.8], [5.2, 6.7], [8.4, 8.8], [8.4, 12.2], [5.2, 13.6], [1.8, 12.4], [1.6, 9.2], [4.6, 6.8], [7.8, 4.8], [8.3, 2.2], [7.4, 1.2]]],
  9: [[[8.4, 3.8], [6.8, 6.2], [3.6, 6.6], [1.4, 4.6], [2.2, 1.4], [5.4, 0.4], [8.4, 2.0], [8.9, 5.2], [8.0, 10.0], [5.8, 13.2], [2.4, 13.0]]],
};

/** Catmull-Rom through pts (each [x, y]), `n` samples per span. */
function spline(pts, n) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}

/**
 * Geometry of digit d in px, origin at the glyph box's top-left.
 * Returns { strokes: [{ x, y, w, s (Float32Array per point), L }], len, bbox }.
 */
function build(d) {
  const strokes = [];
  let total = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const ctl of G[d]) {
    // split at corners into smooth runs, then join
    const runs = [];
    let run = [ctl[0]];
    for (let i = 1; i < ctl.length; i++) {
      run.push(ctl[i]);
      if (ctl[i][2] && i < ctl.length - 1) { runs.push(run); run = [ctl[i]]; }
    }
    runs.push(run);
    let pts = [];
    for (const r of runs) { const sp = spline(r, 5); pts = pts.length ? pts.concat(sp.slice(1)) : sp; }
    // to px, slanted
    pts = pts.map(([u, v]) => [(u + (14 - v) * SLANT) * UNIT, v * UNIT]);
    const n = pts.length, X = new Float32Array(n), Y = new Float32Array(n), W = new Float32Array(n), S = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      X[i] = pts[i][0]; Y[i] = pts[i][1];
      if (i) s += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
      S[i] = s;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1;
      const ux = dx / l, uy = dy / l;
      const across = Math.abs(ux * Math.sin(NIB) - uy * Math.cos(NIB));   // 1 = moving across the edge
      const press = 0.4 + 0.6 * across;
      const land = 0.7 + 0.3 * Math.min(1, S[i] / 1.4);
      const lift = 1 - 0.35 * Math.max(0, (S[i] - (s - 2.0)) / 2.0);
      W[i] = Math.max(1.05, BASE_W * press * land * lift);
      x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]);
    }
    strokes.push({ x: X, y: Y, w: W, s: S, L: s });
    total += s;
  }
  const m = BASE_W;
  return { strokes, len: total, bbox: [Math.floor(x0 - m), Math.floor(y0 - m), Math.ceil(x1 + m), Math.ceil(y1 + m)] };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));

/** The point at arc length `s` along stroke st: [x, y, dx, dy]. */
export function pointAt(st, s) {
  const S = st.s, n = S.length;
  if (s <= 0) return [st.x[0], st.y[0], st.x[1] - st.x[0], st.y[1] - st.y[0]];
  if (s >= st.L) return [st.x[n - 1], st.y[n - 1], st.x[n - 1] - st.x[n - 2], st.y[n - 1] - st.y[n - 2]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
  const f = (s - S[lo]) / (S[hi] - S[lo] || 1);
  return [st.x[lo] + (st.x[hi] - st.x[lo]) * f, st.y[lo] + (st.y[hi] - st.y[lo]) * f, st.x[hi] - st.x[lo], st.y[hi] - st.y[lo]];
}

/**
 * Rasterise glyph g, placed with its box's top-left at (ox, oy) px (fractional),
 * with stroke progress prog[k] (px of arc length per stroke), into `field`
 * over the integer pixels it touches: coverage, stroke index, arc length,
 * across offset (-1..1) and the outward normal of the nearest centreline.
 */
export function rasterise(g, prog, ox, oy, field) {
  const bx0 = Math.floor(g.bbox[0] + ox), by0 = Math.floor(g.bbox[1] + oy);
  const bx1 = Math.ceil(g.bbox[2] + ox), by1 = Math.ceil(g.bbox[3] + oy);
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1, N = w * h;
  if (!field || field.cov.length < N) field = {
    cov: new Float32Array(N + 64), k: new Int8Array(N + 64), s: new Float32Array(N + 64), across: new Float32Array(N + 64),
    nx: new Float32Array(N + 64), ny: new Float32Array(N + 64), w: 0, h: 0, x0: 0, y0: 0,
  };
  field.w = w; field.h = h; field.x0 = bx0; field.y0 = by0;
  const { cov, k: K, s: SS, across: AC, nx: NX, ny: NY } = field;
  cov.fill(0, 0, N); K.fill(-1, 0, N);
  for (let k = 0; k < g.strokes.length; k++) {
    const st = g.strokes[k], P = Math.min(st.L, prog[k] ?? 0);
    if (P <= 0) continue;
    const X = st.x, Y = st.y, W = st.w, S = st.s, n = X.length;
    for (let j = 0; j + 1 < n; j++) {
      if (S[j] >= P) break;
      let ax = X[j] + ox, ay = Y[j] + oy, bx = X[j + 1] + ox, by = Y[j + 1] + oy;
      const sa = S[j]; let sb = S[j + 1];
      if (sb > P) { const f = (P - sa) / (sb - sa); bx = ax + (bx - ax) * f; by = ay + (by - ay) * f; sb = P; }
      const wa = W[j] / 2, wb = W[j + 1] / 2, reach = Math.max(wa, wb) + 0.8;
      const qx0 = Math.max(bx0, Math.floor(Math.min(ax, bx) - reach)), qx1 = Math.min(bx1, Math.ceil(Math.max(ax, bx) + reach));
      const qy0 = Math.max(by0, Math.floor(Math.min(ay, by) - reach)), qy1 = Math.min(by1, Math.ceil(Math.max(ay, by) + reach));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, len = Math.sqrt(L2);
      for (let py = qy0; py <= qy1; py++) {
        for (let px = qx0; px <= qx1; px++) {
          let t = ((px - ax) * dx + (py - ay) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - ax - dx * t, ey = py - ay - dy * t, d = Math.sqrt(ex * ex + ey * ey);
          const r = wa + (wb - wa) * t;
          let c = r - d + 0.5;
          if (c <= 0) continue;
          if (c > 1) c = 1;
          const p = (py - by0) * w + (px - bx0), kp = K[p];
          // the later stroke owns a pixel it clearly covers; within one stroke the nearest segment wins
          const take = kp < 0 || (k > kp ? c > 0.4 : c > cov[p]);
          if (c > cov[p]) cov[p] = c;
          if (!take) continue;
          K[p] = k; SS[p] = sa + (sb - sa) * t;
          AC[p] = (ex * -dy + ey * dx) / len / (r || 1);
          if (d > 1e-4) { NX[p] = ex / d; NY[p] = ey / d; } else { NX[p] = -dy / len; NY[p] = dx / len; }
        }
      }
    }
  }
  return field;
}

/** Where wet paint gathers and drips: the lowest point of each stroke that sits on the glyph's bottom. */
for (const g of GLYPHS) {
  let ymax = -1e9;
  for (const st of g.strokes) for (let i = 0; i < st.y.length; i++) ymax = Math.max(ymax, st.y[i]);
  g.drips = [];
  for (const st of g.strokes) {
    let b = 0;
    for (let i = 1; i < st.y.length; i++) if (st.y[i] > st.y[b]) b = i;
    if (st.y[b] > ymax - 2.2) g.drips.push([st.x[b], st.y[b] + st.w[b] * 0.3, st.w[b]]);
  }
}
