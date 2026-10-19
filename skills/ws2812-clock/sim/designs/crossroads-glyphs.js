// Crossroads numerals: road lettering. Real road text is stretched about
// 2.5x along the lane so drivers read it foreshortened; these are drawn for
// a 20 x 50 px lane cell, as the centrelines a thermoplastic applicator
// walks (one line width, 4.6 px), in painting order. From the centrelines
// we build per-pixel coverage (anti-aliased) and `par`: how far along the
// painter's walk that pixel is first laid, so the paint can be revealed
// stroke by stroke and the painter placed exactly at the nozzle.
export const DW = 20, DH = 50, SW = 4.6;     // the cell and the line width
export const CW = DW + 2, CH = DH + 2;       // field arrays carry a 1 px margin
const TRAVEL = 0.45;                          // pen-up walking counts at this share of a stroke's length

const R = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 5)), out = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * R; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
function bez(a, c, b) {
  const out = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}
const cat = (...parts) => parts.flat();

// centreline strokes per digit, cell coords (x right, y down), 0..20 x 0..50
const l = 2.3, r = 17.7, t = 2.3, b = 47.7;
const six = [cat(arc(9.6, 24, 7.3, 21.7, 318, 180), [[l, 35]], arc(10, 35, 7.7, 12.7, 180, -180))];
const STROKES = {
  0: [cat(arc(10, 12.3, 7.7, 10, 270, 360), [[r, 37.7]], arc(10, 37.7, 7.7, 10, 0, 180), [[l, 12.3]], arc(10, 12.3, 7.7, 10, 180, 270))],
  1: [[[4.0, 10.2], [11.8, t], [11.8, b]]],
  2: [cat(arc(10, 12.3, 7.6, 10, 192, 380), bez([17.2, 15.7], [15.6, 28.5], [l, b]).slice(1), [[18.2, b]])],
  3: [cat(arc(10, 12, 7.0, 9.7, 202, 450), [[5.4, 21.7]]), arc(10, 34.4, 7.7, 13.3, 270, 517)],
  4: [[[13.6, t], [l, 33.6], [18.8, 33.6]], [[13.6, t], [13.6, b]]],
  5: [cat([[17.4, t], [3.3, t], [3.3, 21.4]], arc(9.6, 33.9, 8.1, 13.8, 236, 518))],
  6: six,
  7: [cat([[l, t], [r, t]], bez([r, t], [15.2, 19], [7.6, b]).slice(1))],
  8: [arc(10, 12.6, 6.6, 10.3, 90, -270), arc(10, 35.3, 7.7, 12.4, 270, 630)],
  9: [six[0].map(([x, y]) => [DW - x, DH - y]).reverse()],
};

/** A digit as fields over its CW x CH cell plus the painter's walk. */
function build(d) {
  // one polyline of the whole walk; `ink` marks segments that lay paint
  const pts = [], ink = [];
  for (const s of STROKES[d]) {
    if (pts.length) { pts.push(s[0]); ink.push(0); }        // pen-up walk to the next stroke
    else pts.push(s[0]);
    for (let k = 1; k < s.length; k++) { pts.push(s[k]); ink.push(1); }
  }
  const acc = [0];
  for (let k = 1; k < pts.length; k++) {
    const L = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    acc.push(acc[k - 1] + L * (ink[k - 1] ? 1 : TRAVEL));
  }
  const len = acc[acc.length - 1];
  const cov = new Float32Array(CW * CH), par = new Float32Array(CW * CH).fill(1e9), edge = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const px = x - 1 + 0.5, py = y - 1 + 0.5, p = y * CW + x;
    let best = 1e9;
    for (let k = 1; k < pts.length; k++) {
      if (!ink[k - 1]) continue;
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const dist = Math.hypot(px - ax - u * dx, py - ay - u * dy);
      if (dist < best) best = dist;
      if (dist < SW / 2 + 0.5) { const a = acc[k - 1] + u * (acc[k] - acc[k - 1]); if (a < par[p]) par[p] = a; }
    }
    cov[p] = Math.min(1, Math.max(0, SW / 2 + 0.5 - best));
    edge[p] = Math.min(1, Math.max(0, best / (SW / 2)));       // 0 on the centreline, 1 at the edge
  }
  return { d, pts, ink, acc, len, cov, par, edge };
}
export const DIGITS = Array.from({ length: 10 }, (_, d) => build(d));

/**
 * Where the nozzle is after `a` units of the walk: writes cell x, y and a
 * smoothed heading into out[0..2]. Allocation-free.
 */
export function walkAt(G, a, out) {
  const { pts, acc } = G;
  a = Math.max(0, Math.min(G.len, a));
  let k = 1;
  while (k < acc.length - 1 && acc[k] < a) k++;
  const s = acc[k] - acc[k - 1] || 1, u = (a - acc[k - 1]) / s;
  out[0] = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u;
  out[1] = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u;
  // heading: average direction over a short window either side
  const k0 = Math.max(1, k - 2), k1 = Math.min(pts.length - 1, k + 2);
  out[2] = Math.atan2(pts[k1][1] - pts[k0 - 1][1], pts[k1][0] - pts[k0 - 1][0]);
  return out;
}
