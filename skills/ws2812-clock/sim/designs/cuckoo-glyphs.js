// Cuckoo numerals: Black Forest carved figures, raised and chisel-ridged.
// Each digit is drawn on a 10 x 16 em as straight knife cuts with a radius
// per point (thick uprights, hairline diagonals), then baked once into
// a height field: h = radius - distance to the stroke's centre line, so every
// stroke is a raised ridge with two flat chisel facets and mitred joints,
// as a carver cuts them. Sampled per pixel through any 3D mapping (flips).

export const EM_W = 10, EM_H = 16;
const RES = 6, PAD = 1.5;                       // grid cells per em unit, margin
const GW = Math.ceil((EM_W + 2 * PAD) * RES) + 1, GH = Math.ceil((EM_H + 2 * PAD) * RES) + 1;

const T = 1.35, S = 0.6;                        // thick, hairline

// Knife-cut figures: straight cuts with sharp turns, as chip carving is
// done (no compass curves): thick uprights, thin diagonals at the heads and
// feet of the bowls, wedge terminals. Each stroke is a polyline [x, y, r].
const cut = (...pts) => ({ pts });
const turn = (st) => ({ pts: st.pts.map(([x, y, r]) => [EM_W - x, EM_H - y, r]) });

const SIX = [cut([8.1, 2.4, 1.05], [5.2, 0.9, S], [1.8, 4.4, T], [1.8, 12.5, T], [5.0, 15.1, S], [8.2, 12.5, T], [8.2, 10.0, 1.25], [5.0, 7.5, S], [1.9, 9.6, 0.85])];

export const DIGITS = [
  [cut([5.0, 0.9, S], [8.3, 3.7, T], [8.3, 12.3, T], [5.0, 15.1, S], [1.7, 12.3, T], [1.7, 3.7, T], [5.0, 0.9, S])],
  [cut([5.8, 0.8, 1.0], [5.8, 8, T], [5.8, 15.0, T]),
    cut([5.7, 0.8, 0.8], [2.4, 3.6, 0.7]),
    cut([2.7, 15.25, 0.62], [8.7, 15.25, 0.62])],
  [cut([1.9, 4.1, 1.15], [4.7, 0.95, S], [8.1, 2.8, 1.15], [8.1, 5.6, T], [1.8, 14.9, 0.95]),
    cut([1.8, 15.0, 0.7], [8.6, 15.0, 0.75], [8.9, 13.0, 0.95])],
  [cut([1.8, 3.5, 1.1], [4.7, 0.95, S], [7.9, 2.7, 1.15], [7.9, 5.4, 1.2], [4.3, 7.7, S]),
    cut([4.3, 7.7, S], [8.3, 10.0, T], [8.3, 12.8, T], [5.0, 15.1, S], [1.7, 12.8, 1.1])],
  [cut([7.0, 0.9, 0.62], [1.0, 11.0, 0.72]),
    cut([1.0, 11.0, 0.78], [9.2, 11.0, 0.78]),
    cut([7.0, 0.9, 1.0], [7.0, 8, T], [7.0, 15.0, T]),
    cut([4.9, 15.25, 0.6], [9.1, 15.25, 0.6])],
  [cut([2.9, 1.1, 0.8], [8.9, 0.95, 0.95]),
    cut([2.9, 1.0, 1.25], [2.6, 7.4, 1.1]),
    cut([2.6, 7.4, 0.7], [5.0, 6.2, S], [8.3, 8.5, T], [8.3, 12.6, T], [5.0, 15.1, S], [1.7, 12.8, 1.1])],
  SIX,
  [cut([1.3, 1.1, 0.8], [8.7, 1.1, 0.8]),
    cut([1.3, 1.1, 0.85], [1.1, 3.4, 0.78]),
    cut([8.7, 1.1, 0.9], [6.3, 7.4, T], [5.2, 15.0, T])],
  [cut([5.0, 0.9, 0.55], [7.8, 2.7, 1.1], [7.8, 5.5, 1.1], [5.0, 7.6, 0.55], [2.2, 5.5, 1.1], [2.2, 2.7, 1.1], [5.0, 0.9, 0.55]),
    cut([5.0, 7.6, S], [8.3, 10.0, T], [8.3, 12.6, T], [5.0, 15.1, S], [1.7, 12.6, T], [1.7, 10.0, T], [5.0, 7.6, S])],
  SIX.map(turn),
];

/** Polylines into capsules [ax, ay, ar, bx, by, br]. */
function capsules(strokes) {
  const caps = [];
  for (const st of strokes) for (let i = 0; i < st.pts.length - 1; i++) caps.push([...st.pts[i], ...st.pts[i + 1]]);
  return caps;
}

function bake(strokes) {
  const caps = capsules(strokes);
  const H = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const u = gx / RES - PAD, v = gy / RES - PAD;
      let best = -3;
      for (const [ax, ay, ar, bx, by, br] of caps) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
        let t = ((u - ax) * dx + (v - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = u - ax - t * dx, ey = v - ay - t * dy;
        const h = ar + (br - ar) * t - Math.sqrt(ex * ex + ey * ey);
        if (h > best) best = h;
      }
      H[gy * GW + gx] = best;
    }
  }
  // gradients (em units), central differences
  const GX = new Float32Array(GW * GH), GY = new Float32Array(GW * GH);
  for (let gy = 1; gy < GH - 1; gy++) {
    for (let gx = 1; gx < GW - 1; gx++) {
      const p = gy * GW + gx;
      GX[p] = (H[p + 1] - H[p - 1]) * RES * 0.5;
      GY[p] = (H[p + GW] - H[p - GW]) * RES * 0.5;
    }
  }
  return { H, GX, GY };
}

export const BAKED = DIGITS.map(bake);

// sample results (no allocation)
export const S_ = { h: -3, gx: 0, gy: 0 };
/** Bilinear sample of digit d at em (u, v) into S_. */
export function sample(d, u, v) {
  const fx = (u + PAD) * RES, fy = (v + PAD) * RES;
  if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) { S_.h = -3; S_.gx = 0; S_.gy = 0; return -3; }
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, p = y0 * GW + x0;
  const g = BAKED[d], A = g.H;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  S_.h = A[p] * w00 + A[p + 1] * w10 + A[p + GW] * w01 + A[p + GW + 1] * w11;
  const X = g.GX, Y = g.GY;
  S_.gx = X[p] * w00 + X[p + 1] * w10 + X[p + GW] * w01 + X[p + GW + 1] * w11;
  S_.gy = Y[p] * w00 + Y[p + 1] * w10 + Y[p + GW] * w01 + Y[p + GW + 1] * w11;
  return S_.h;
}
/** Height only. */
export function height(d, u, v) {
  const fx = (u + PAD) * RES, fy = (v + PAD) * RES;
  if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return -3;
  const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, p = y0 * GW + x0, A = BAKED[d].H;
  return (A[p] * (1 - tx) + A[p + 1] * tx) * (1 - ty) + (A[p + GW] * (1 - tx) + A[p + GW + 1] * tx) * ty;
}
