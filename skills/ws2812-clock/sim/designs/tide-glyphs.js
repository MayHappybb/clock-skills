// Tide: the sand script. Ten digits written with a stick, one or two strokes
// each, in the order a hand would draw them. Units: a 10 x 16 box, y down.
// A point [x, y, 1] is a corner (the stick changes direction sharply there);
// between corners the path is a Catmull-Rom spline through the points.
//
// For each (slot, digit) we bake, over the slot's box, the distance from
// every pixel to the stroke and the arc length at which the stick first
// passes it, so the groove can be revealed as the stick moves.

const C = 1;
export const GLYPHS = {
  0: [[[6.2, 0.6], [3.0, 1.4], [1.0, 5.2], [0.8, 10.6], [2.8, 15.0], [6.4, 15.3], [8.9, 11.6], [9.3, 5.6], [7.8, 1.6], [5.2, 0.4], [3.6, 1.2]]],
  1: [[[1.6, 4.6], [4.0, 2.8], [6.2, 0.4, C], [6.0, 6.0], [5.6, 11.0], [5.2, 15.6]]],
  2: [[[0.9, 4.2], [2.4, 1.2], [5.4, 0.3], [8.4, 1.8], [8.8, 5.0], [6.6, 8.8], [3.4, 12.2], [0.6, 15.4, C], [4.0, 14.8], [7.0, 15.3], [9.8, 14.6]]],
  3: [[[1.0, 2.6], [4.0, 0.4], [7.6, 1.0], [8.4, 3.8], [6.6, 6.6], [3.8, 7.6, C], [7.6, 8.6], [9.2, 11.6], [7.6, 14.8], [4.2, 15.6], [1.0, 14.0]]],
  4: [[[7.0, 0.4], [4.6, 4.8], [0.6, 10.8, C], [5.0, 10.6], [9.8, 10.4]], [[7.6, 5.4], [7.4, 10.0], [7.2, 15.6]]],
  5: [[[9.2, 0.8, C], [5.4, 0.9], [2.4, 0.8, C], [1.6, 7.4, C], [4.6, 5.9], [8.0, 7.0], [9.4, 10.6], [8.0, 14.4], [4.4, 15.7], [0.8, 14.2]]],
  6: [[[8.4, 1.4], [5.4, 0.3], [2.4, 2.0], [0.7, 6.8], [0.9, 12.0], [3.4, 15.4], [7.2, 15.2], [9.2, 12.0], [8.4, 8.6], [5.4, 7.4], [2.4, 8.4], [1.0, 10.8]]],
  7: [[[0.4, 1.4], [4.6, 0.6], [9.6, 0.9, C], [7.0, 5.2], [5.0, 9.6], [4.0, 15.6]], [[3.4, 8.0], [6.2, 7.7], [8.8, 7.6]]],
  8: [[[8.0, 2.6], [5.0, 0.3], [1.8, 1.6], [2.2, 5.0], [5.0, 7.6], [8.6, 10.4], [8.4, 14.2], [5.0, 15.7], [1.4, 14.2], [1.4, 10.6], [5.0, 7.6], [7.8, 5.2], [8.2, 2.4], [6.6, 0.6]]],
  9: [[[8.6, 4.4], [7.4, 1.0], [4.0, 0.3], [1.2, 2.4], [1.2, 6.2], [4.2, 8.2], [7.6, 7.0], [9.0, 3.2, C], [8.9, 9.0], [8.2, 13.2], [6.6, 15.7]]],
};

/** Sample a stroke into points every ~step units (in output px after xf). */
function sampleStroke(stroke, xf, step) {
  const runs = [];
  let run = [];
  for (let i = 0; i < stroke.length; i++) {
    const p = stroke[i];
    run.push(p);
    if (p[2] === C && i > 0 && i < stroke.length - 1) { runs.push(run); run = [p]; }
  }
  runs.push(run);
  const out = [];
  for (const r of runs) {
    const P = r.map((p) => xf(p[0], p[1]));
    for (let i = 0; i + 1 < P.length; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(len / step));
      for (let k = (out.length && i === 0 ? 1 : 0); k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    const e = P[P.length - 1];
    out.push([e[0], e[1]]);
  }
  return out;
}

/**
 * Bake digit d in a slot { x, y, h, slant }: returns
 *   { bx, by, bw, bh, dist, sAt, L, path: [[x, y, s, ink]], tip(s) }
 * dist / sAt are per pixel of the box; L the arc length (air moves included).
 */
export function bake(d, slot, W, H) {
  const s = slot.h / 16, sl = slot.slant;
  const xf = (u, v) => [slot.x + u * s + (16 - v) * s * sl, slot.y + v * s];
  const path = [], ends = [];
  let acc = 0, last = null;
  for (const stroke of GLYPHS[d]) {
    const pts = sampleStroke(stroke, xf, 0.3);
    const e = pts[pts.length - 1], e0 = pts[Math.max(0, pts.length - 5)], el = Math.hypot(e[0] - e0[0], e[1] - e0[1]) || 1;
    let s0 = 0;
    pts.forEach((p, k) => {
      if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (k === 0) s0 = acc;
      // the first point of a later stroke ends an air move: not ink
      path.push([p[0], p[1], acc, k === 0 && last ? 0 : 1]);
      last = p;
    });
    ends.push({ x: e[0], y: e[1], dx: (e[0] - e0[0]) / el, dy: (e[1] - e0[1]) / el, s: acc, s0 });
  }
  const m = 4;
  const bx = Math.max(0, Math.floor(slot.x - m)), by = Math.max(0, Math.floor(slot.y - m));
  const ex = Math.min(W, Math.ceil(slot.x + 10 * s + 16 * s * sl + m)), ey = Math.min(H, Math.ceil(slot.y + slot.h + m));
  const bw = ex - bx, bh = ey - by;
  const dist = new Float32Array(bw * bh), sAt = new Float32Array(bw * bh);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const px = bx + i, py = by + j;
      let dm = 1e9;
      for (let k = 1; k < path.length; k++) {
        if (!path[k][3]) continue;
        const dd = segD(px, py, path[k - 1], path[k]);
        if (dd < dm) dm = dd;
      }
      let sm = 1e9;
      const lim = dm + 0.6;
      for (let k = 1; k < path.length; k++) {
        if (!path[k][3]) continue;
        if (segD(px, py, path[k - 1], path[k]) <= lim) { sm = path[k - 1][2]; break; }
      }
      dist[j * bw + i] = dm;
      sAt[j * bw + i] = sm;
    }
  }
  const L = acc;
  function tip(sv) {
    if (sv <= 0) return [path[0][0], path[0][1]];
    if (sv >= L) { const e = path[path.length - 1]; return [e[0], e[1]]; }
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid][2] <= sv) lo = mid; else hi = mid; }
    const a = path[lo], b = path[hi], f = (sv - a[2]) / Math.max(1e-6, b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  return { bx, by, bw, bh, dist, sAt, L, path, tip, ends };
}

function segD(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = px - a[0] - t * dx, y = py - a[1] - t * dy;
  return Math.sqrt(x * x + y * y);
}
