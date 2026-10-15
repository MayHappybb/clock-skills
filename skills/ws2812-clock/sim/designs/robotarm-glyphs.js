// Robot-arm workshop: the machined numerals.
//
// Each digit is a centre-line skeleton on a 12 x 19 unit box, swept by an
// OCTAGONAL pen (half-width 1.5 units). An octagonal pen gives every corner
// and terminal a 45-degree chamfer, the way a part is cut on a mill, and its
// distance field has flat facets, so the bevels shade as machined chamfers.
//
// Per digit we precompute, on a 0.25-unit grid: the signed distance (units),
// the outward facet normal, and the outline as ordered paths (marching
// squares), which is the route the laser follows when it cuts the part.

export const GW = 12, GH = 19, PEN = 1.5;
export const STEP = 0.25, X0 = -2, Y0 = -2, NX = 65, NY = 93;

const SK = {
  0: [[[1.5, 4], [4, 1.5], [8, 1.5], [10.5, 4], [10.5, 15], [8, 17.5], [4, 17.5], [1.5, 15], [1.5, 4]]],
  1: [[[6.5, 1.5], [6.5, 17.5]], [[6.5, 1.5], [2.6, 5.4]], [[2.5, 17.5], [10.5, 17.5]]],
  2: [[[1.5, 5.5], [1.5, 4], [4, 1.5], [8, 1.5], [10.5, 4], [10.5, 7.5], [1.5, 16], [1.5, 17.5], [10.5, 17.5]]],
  3: [[[1.5, 4], [4, 1.5], [8, 1.5], [10.5, 4], [10.5, 6.5], [8, 9], [4.5, 9]],
      [[8, 9], [10.5, 11.5], [10.5, 15], [8, 17.5], [4, 17.5], [1.5, 15]]],
  4: [[[8.5, 1.5], [1.5, 12.5], [10.8, 12.5]], [[8.5, 1.5], [8.5, 17.5]]],
  5: [[[10.5, 1.5], [1.5, 1.5], [1.5, 8.5], [8, 8.5], [10.5, 11], [10.5, 15], [8, 17.5], [4, 17.5], [1.5, 15]]],
  6: [[[9.8, 1.5], [4, 1.5], [1.5, 4], [1.5, 15], [4, 17.5], [8, 17.5], [10.5, 15], [10.5, 11], [8, 8.5], [1.5, 8.5]]],
  7: [[[1.5, 1.5], [10.5, 1.5], [10.5, 4.5], [5.5, 11], [5.5, 17.5]]],
  8: [[[2, 3.5], [4, 1.5], [8, 1.5], [10, 3.5], [10, 6.6], [7.8, 8.8], [4.2, 8.8], [2, 6.6], [2, 3.5]],
      [[1.5, 11.3], [4, 8.8], [8, 8.8], [10.5, 11.3], [10.5, 15], [8, 17.5], [4, 17.5], [1.5, 15], [1.5, 11.3]]],
  9: [[[2.2, 17.5], [8, 17.5], [10.5, 15], [10.5, 4], [8, 1.5], [4, 1.5], [1.5, 4], [1.5, 8], [4, 10.5], [10.5, 10.5]]],
};

const oct = (x, y) => { x = Math.abs(x); y = Math.abs(y); const d = (x + y) * 0.70710678; return x > y ? (x > d ? x : d) : (y > d ? y : d); };

function sdf(segs, x, y) {
  let best = 1e9;
  for (let k = 0; k < segs.length; k += 4) {
    const ax = segs[k], ay = segs[k + 1], dx = segs[k + 2] - ax, dy = segs[k + 3] - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const v = oct(x - ax - t * dx, y - ay - t * dy);
    if (v < best) best = v;
  }
  return best - PEN;
}

/** Ordered outline loops of the zero level set (marching squares), resampled. */
function contours(d) {
  const adj = new Map(), link = (a, b) => {
    (adj.get(a) || adj.set(a, []).get(a)).push(b);
    (adj.get(b) || adj.set(b, []).get(b)).push(a);
  };
  const T = (i, j) => (j * NX + i) * 2, L = (i, j) => (j * NX + i) * 2 + 1;
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = d[j * NX + i] < 0, b = d[j * NX + i + 1] < 0, c = d[(j + 1) * NX + i + 1] < 0, e = d[(j + 1) * NX + i] < 0;
    const cs = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (e ? 8 : 0);
    const eT = T(i, j), eB = T(i, j + 1), eL = L(i, j), eR = L(i + 1, j);
    switch (cs) {
      case 1: case 14: link(eL, eT); break;
      case 2: case 13: link(eT, eR); break;
      case 3: case 12: link(eL, eR); break;
      case 4: case 11: link(eR, eB); break;
      case 6: case 9: link(eT, eB); break;
      case 7: case 8: link(eL, eB); break;
      case 5: link(eL, eT); link(eR, eB); break;
      case 10: link(eT, eR); link(eL, eB); break;
    }
  }
  const pt = (k) => {
    const n = k >> 1, j = Math.floor(n / NX), i = n % NX;
    const d0 = d[j * NX + i];
    if (k & 1) { const d1 = d[(j + 1) * NX + i], t = d0 / (d0 - d1); return [X0 + i * STEP, Y0 + (j + t) * STEP]; }
    const d1 = d[j * NX + i + 1], t = d0 / (d0 - d1); return [X0 + (i + t) * STEP, Y0 + j * STEP];
  };
  const seen = new Set(), loops = [];
  for (const k0 of adj.keys()) {
    if (seen.has(k0)) continue;
    const loop = [];
    let prev = -1, k = k0;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k); loop.push(pt(k));
      const nb = adj.get(k), nx = nb[0] !== prev ? nb[0] : nb[1];
      prev = k; k = nx;
    }
    if (loop.length > 8) loops.push(loop);
  }
  // resample each loop at even spacing, starting from its top-left point
  const out = loops.map((lp) => {
    let s0 = 0;
    for (let q = 1; q < lp.length; q++) if (lp[q][1] < lp[s0][1] - 1e-6 || (Math.abs(lp[q][1] - lp[s0][1]) < 1e-6 && lp[q][0] < lp[s0][0])) s0 = q;
    const r = lp.slice(s0).concat(lp.slice(0, s0)); r.push(r[0]);
    const pts = []; let acc = 0; const sp = 0.2;
    pts.push(r[0]);
    for (let q = 1; q < r.length; q++) {
      const [ax, ay] = r[q - 1], [bx, by] = r[q], l = Math.hypot(bx - ax, by - ay);
      let u = sp - acc;
      while (u <= l) { pts.push([ax + (bx - ax) * u / l, ay + (by - ay) * u / l]); u += sp; }
      acc = l - (u - sp);
    }
    return pts;
  });
  out.sort((p, q) => p.length - q.length);   // holes first, the outside last, as a cutter does
  return out;
}

function build(ch) {
  const segs = [];
  for (const pl of SK[ch]) for (let k = 0; k + 1 < pl.length; k++) segs.push(pl[k][0], pl[k][1], pl[k + 1][0], pl[k + 1][1]);
  const S = Float64Array.from(segs);
  const d = new Float32Array(NX * NY), nx = new Float32Array(NX * NY), ny = new Float32Array(NX * NY);
  const e = 0.06;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + i * STEP, y = Y0 + j * STEP, p = j * NX + i;
    d[p] = sdf(S, x, y);
    const gx = sdf(S, x + e, y) - sdf(S, x - e, y), gy = sdf(S, x, y + e) - sdf(S, x, y - e);
    const m = Math.hypot(gx, gy) || 1;
    nx[p] = gx / m; ny[p] = gy / m;
  }
  // the cut path: loops joined by short laser-off jumps; cum = arc length incl. jumps
  const loops = contours(d), px = [], py = [], cum = [], on = [];
  let s = 0;
  loops.forEach((lp, li) => {
    if (li > 0) s += 3;                     // the head travels, laser off
    lp.forEach((q, k) => { if (k) s += 0.2; px.push(q[0]); py.push(q[1]); cum.push(s); on.push(li); });
  });
  return { d, nx, ny, px: Float32Array.from(px), py: Float32Array.from(py), cum: Float32Array.from(cum), loop: Int8Array.from(on), len: s };
}

export const GLYPHS = Array.from({ length: 10 }, (_, k) => build(k));

/** Index into the cut path at arc length s (binary search): the last sample with cum <= s. */
export function pathIndex(G, s) {
  let lo = 0, hi = G.cum.length - 1;
  if (s <= 0) return 0;
  if (s >= G.cum[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (G.cum[m] <= s) lo = m; else hi = m; }
  return lo;
}
