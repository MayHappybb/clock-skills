// Sushi letterforms: ten plump numerals drawn as centre-line skeletons in a
// 22 x 31 cell, then turned into distance maps (with the unit gradient), so
// the face can shade each stroke as a rounded piece of fish or a cut maki
// roll. Built once at load; nothing here runs per frame.
//
// The skeletons are drawn for a ~7 px stroke on the 2 mm HUB75 lattice:
// round superelliptic bowls (a nigiri's pillow shape), a footed 1, a closed
// 4 (an open one reads as U), a 6 / 9 with a long swept stem.

export const PAD = 4;              // map margin round the skeleton
export const GW = 22 + 2 * PAD;    // 30 px
export const GH = 31 + 2 * PAD;    // 39 px

// superelliptic arc from a0 to a1 (degrees, screen coords: 90 = down)
function arc(cx, cy, rx, ry, a0, a1, e = 2.35, n = 0) {
  n = n || Math.max(6, Math.round(Math.abs(a1 - a0) / 7));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / e), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return pts;
}
function quad(a, c, b, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}
const flip = (paths) => paths.map((p) => p.map(([x, y]) => [22 - x, 31 - y]));

const SIX = [arc(11, 21.5, 10, 9.5, 0, 360), arc(23.5, 22, 22.5, 21.5, 180, 251, 2)];

export const SKELETONS = {
  0: [arc(11, 15.5, 10.5, 15.5, 0, 360, 2.5)],
  1: [[[4, 6.5], [12.5, 0], [12.5, 31]], [[5, 31], [20, 31]]],
  2: [[...arc(11, 9.5, 10, 9.5, 192, 378, 2.2), ...quad([20.3, 12.6], [16, 21], [1, 31]).slice(1), [21.5, 31]]],
  3: [[...arc(11, 8, 9, 8, 205, 450, 2.2), [8, 16]], arc(11, 23.5, 10.5, 7.5, 270, 515, 2.2)],
  4: [[[16, 31], [16, 0], [0.5, 21.5], [22, 21.5]]],
  5: [[[20.5, 0.5], [3, 0.5], [2.2, 14.5], ...arc(11, 21.5, 10, 9.5, 225, 520, 2.2)]],
  6: SIX,
  7: [[[0.5, 0.5], [21.5, 0.5], ...quad([21.5, 0.5], [12, 12], [9, 31]).slice(1)]],
  8: [arc(11, 7.75, 8.5, 7.75, 0, 360), arc(11, 23, 10.5, 8, 0, 360)],
  9: flip(SIX),
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** { d, gx, gy } Float32Arrays of GW x GH: distance to the skeleton (px) and its unit gradient. */
function build(paths) {
  const segs = [];
  for (const p of paths) for (let k = 0; k + 1 < p.length; k++) segs.push([p[k][0] + PAD, p[k][1] + PAD, p[k + 1][0] + PAD, p[k + 1][1] + PAD]);
  const dist = (x, y) => {
    let m = 1e9;
    for (const s of segs) { const d = segDist(x, y, s[0], s[1], s[2], s[3]); if (d < m) m = d; }
    return m;
  };
  const n = GW * GH, d = new Float32Array(n), gx = new Float32Array(n), gy = new Float32Array(n);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const p = j * GW + i, e = 0.35;
    d[p] = dist(i, j);
    let ax = dist(i + e, j) - dist(i - e, j), ay = dist(i, j + e) - dist(i, j - e);
    const L = Math.hypot(ax, ay) || 1;
    gx[p] = ax / L; gy[p] = ay / L;
  }
  return { d, gx, gy };
}

export const MAPS = Array.from({ length: 10 }, (_, k) => build(SKELETONS[k]));

/**
 * Where the maki pieces sit for each numeral: points along the skeleton,
 * in drawing order, about one piece-width apart (map coordinates, PAD
 * included). Closed loops are spaced evenly round; pieces closer than
 * 4.4 px to an earlier one (corners, junctions) are dropped.
 */
export const STEP = 5.9;
function pieces(paths) {
  const out = [];
  for (const p of paths) {
    const L = [0];
    for (let k = 1; k < p.length; k++) L.push(L[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
    const len = L[L.length - 1], closed = Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) < 0.5;
    const n = Math.max(1, Math.round(len / STEP)), cnt = closed ? n : n + 1;
    for (let q = 0; q < cnt; q++) {
      const s = (q * len) / n;
      let k = 1;
      while (k < L.length - 1 && L[k] < s) k++;
      const u = (s - L[k - 1]) / (L[k] - L[k - 1] || 1);
      const x = p[k - 1][0] + (p[k][0] - p[k - 1][0]) * u + PAD, y = p[k - 1][1] + (p[k][1] - p[k - 1][1]) * u + PAD;
      if (out.every(([a, b]) => Math.hypot(a - x, b - y) > 4.0)) out.push([x, y]);
    }
  }
  return out;
}
export const PIECES = Array.from({ length: 10 }, (_, k) => pieces(SKELETONS[k]));
