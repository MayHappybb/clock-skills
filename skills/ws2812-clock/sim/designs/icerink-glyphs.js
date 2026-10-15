// Ice script: the ten numerals as skating paths. Each digit is a list of
// runs; a run is a smooth Catmull-Rom curve through its points, consecutive
// runs meet at a corner (the skater turns on an edge and throws spray), and
// an 'a' run is a jump (the skater is in the air: nothing is carved).
// Coordinates are a 0..1 box (x right, y down); the slot applies size and
// italic slant.

const C = (pts) => ({ air: false, pts }), A = (pts) => ({ air: true, pts });

export const DIGITS = {
  0: [C([[0.55, 0.0], [0.14, 0.14], [0.0, 0.52], [0.14, 0.9], [0.5, 1.0], [0.86, 0.86], [1.0, 0.47], [0.86, 0.1], [0.55, 0.0], [0.42, 0.02]])],
  1: [C([[0.2, 0.26], [0.5, 0.1], [0.76, 0.0]]), C([[0.76, 0.0], [0.74, 0.5], [0.72, 1.0]])],
  2: [C([[0.04, 0.24], [0.3, 0.02], [0.66, 0.0], [0.94, 0.2], [0.84, 0.46], [0.42, 0.74], [0.02, 1.0]]), C([[0.02, 1.0], [0.5, 0.97], [1.0, 1.0]])],
  3: [C([[0.04, 0.12], [0.45, 0.0], [0.86, 0.1], [0.84, 0.34], [0.4, 0.47]]), C([[0.4, 0.47], [0.88, 0.6], [0.96, 0.84], [0.56, 1.0], [0.0, 0.88]])],
  4: [C([[0.7, 0.0], [0.0, 0.68]]), C([[0.0, 0.68], [1.0, 0.68]]), A([[1.0, 0.68], [0.72, 0.03]]), C([[0.72, 0.03], [0.72, 1.0]])],
  5: [C([[0.96, 0.0], [0.16, 0.0]]), C([[0.16, 0.0], [0.08, 0.45]]), C([[0.08, 0.45], [0.5, 0.36], [0.92, 0.52], [0.96, 0.8], [0.6, 1.0], [0.0, 0.9]])],
  6: [C([[0.9, 0.05], [0.48, 0.06], [0.1, 0.4], [0.06, 0.78], [0.42, 1.0], [0.86, 0.88], [0.92, 0.6], [0.56, 0.44], [0.1, 0.6]])],
  7: [C([[0.0, 0.02], [1.0, 0.0]]), C([[1.0, 0.0], [0.7, 0.42], [0.44, 1.0]])],
  8: [C([[0.52, 0.0], [0.14, 0.1], [0.16, 0.36], [0.5, 0.5], [0.88, 0.66], [0.9, 0.9], [0.5, 1.0], [0.1, 0.9], [0.12, 0.66], [0.5, 0.5], [0.84, 0.34], [0.86, 0.1], [0.52, 0.0]])],
  9: [C([[0.94, 0.46], [0.9, 0.14], [0.55, 0.0], [0.14, 0.1], [0.04, 0.36], [0.36, 0.56], [0.76, 0.5], [0.94, 0.3]]), C([[0.94, 0.3], [0.9, 0.66], [0.64, 1.0]])],
};

/** Catmull-Rom through pts, densely sampled into [x, y] in px. */
function spline(pts, W, H, slant) {
  const P = pts.map(([x, y]) => [x * W + (1 - y) * slant, y * H]);
  if (P.length === 2) {
    const out = [];
    for (let k = 0; k <= 40; k++) out.push([P[0][0] + (P[1][0] - P[0][0]) * k / 40, P[0][1] + (P[1][1] - P[0][1]) * k / 40]);
    return out;
  }
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

/**
 * Build a digit for a slot of size W x H px with slant (px the top leans right).
 * Returns:
 *   path: Float32Array of [x, y, air] every STEP px of arc length, L its length
 *   cells: groove pixels near the carved path, in local integer coords:
 *          { n, x, y (Int16), d, s, nx, ny (Float32) }
 *   sprays: [{ s, x, y, ax, ay }] corners and the jump landing
 */
export const STEP = 0.25;
export function buildDigit(d, W, H, slant, reach = 2.6) {
  const runs = DIGITS[d];
  const pts = [], air = [], sprays = [];
  for (let r = 0; r < runs.length; r++) {
    const sp = spline(runs[r].pts, W, H, slant);
    for (let k = r ? 1 : 0; k < sp.length; k++) { pts.push(sp[k]); air.push(runs[r].air ? 1 : 0); }
  }
  // resample by arc length
  const path = [];
  let acc = 0, need = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], seg = Math.hypot(bx - ax, by - ay);
    while (need <= acc + seg) {
      const t = seg ? (need - acc) / seg : 0;
      path.push(ax + (bx - ax) * t, ay + (by - ay) * t, air[k]);
      need += STEP;
    }
    acc += seg;
  }
  const L = acc, N = path.length / 3;
  // corners: where runs join (the turn throws spray outward)
  let s0 = 0;
  for (let r = 0; r < runs.length - 1; r++) {
    // arc length to the end of run r
    const sp = spline(runs[r].pts, W, H, slant);
    let len = 0;
    for (let k = 1; k < sp.length; k++) len += Math.hypot(sp[k][0] - sp[k - 1][0], sp[k][1] - sp[k - 1][1]);
    s0 += len;
    const k = Math.min(N - 1, Math.round(s0 / STEP)), kb = Math.max(0, k - 12), ka = Math.min(N - 1, k + 12);
    const tin = [path[3 * k] - path[3 * kb], path[3 * k + 1] - path[3 * kb + 1]];
    const tout = [path[3 * ka] - path[3 * k], path[3 * ka + 1] - path[3 * k + 1]];
    let ax = tin[0] / (Math.hypot(...tin) || 1) - tout[0] / (Math.hypot(...tout) || 1);
    let ay = tin[1] / (Math.hypot(...tin) || 1) - tout[1] / (Math.hypot(...tout) || 1);
    const m = Math.hypot(ax, ay) || 1;
    // a jump's take-off throws nothing; its landing and every corner do
    if (!runs[r].air) sprays.push({ s: s0, x: path[3 * k], y: path[3 * k + 1], ax: ax / m, ay: ay / m });
    else sprays.push({ s: s0, x: path[3 * k], y: path[3 * k + 1], ax: 0, ay: 0 });
  }
  // groove cells
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < N; k++) { x0 = Math.min(x0, path[3 * k]); x1 = Math.max(x1, path[3 * k]); y0 = Math.min(y0, path[3 * k + 1]); y1 = Math.max(y1, path[3 * k + 1]); }
  const cx = [], cy = [], cd = [], cs = [], cnx = [], cny = [];
  for (let y = Math.floor(y0 - reach); y <= Math.ceil(y1 + reach); y++) {
    for (let x = Math.floor(x0 - reach); x <= Math.ceil(x1 + reach); x++) {
      let best = Infinity, bk = -1;
      for (let k = 0; k < N; k++) {
        if (path[3 * k + 2]) continue;
        const dx = x - path[3 * k], dy = y - path[3 * k + 1], dd = dx * dx + dy * dy;
        if (dd < best - 1e-6) { best = dd; bk = k; }
      }
      const dist = Math.sqrt(best);
      if (dist > reach) continue;
      const nx = dist > 1e-3 ? (x - path[3 * bk]) / dist : 0, ny = dist > 1e-3 ? (y - path[3 * bk + 1]) / dist : 0;
      cx.push(x); cy.push(y); cd.push(dist); cs.push(bk * STEP); cnx.push(nx); cny.push(ny);
    }
  }
  return {
    path: Float32Array.from(path), N, L, sprays,
    cells: { n: cx.length, x: Int16Array.from(cx), y: Int16Array.from(cy), d: Float32Array.from(cd), s: Float32Array.from(cs), nx: Float32Array.from(cnx), ny: Float32Array.from(cny) },
  };
}

/** Point on the path at arc length s: writes x, y, heading, air into o. */
export function pathAt(g, s, o) {
  const N = g.N, f = Math.max(0, Math.min(N - 1.001, s / STEP)), k = Math.floor(f), t = f - k, p = g.path;
  o.x = p[3 * k] + (p[3 * k + 3] - p[3 * k]) * t;
  o.y = p[3 * k + 1] + (p[3 * k + 4] - p[3 * k + 1]) * t;
  const ka = Math.min(N - 1, k + 6), kb = Math.max(0, k - 6);
  o.h = Math.atan2(p[3 * ka + 1] - p[3 * kb + 1], p[3 * ka] - p[3 * kb]);
  o.air = p[3 * k + 2];
  return o;
}
