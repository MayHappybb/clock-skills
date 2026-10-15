// Manga SFX: the ten numerals as hand-lettered sound effects, drawn with a
// brush: fat pressed strokes (~9 px) that taper to a lifted tail, the tails
// splitting into two dry-brush prongs (kasure). Each digit is a few brush
// strokes along Catmull-Rom splines with a radius per control point; the
// union of tapered capsules is baked at load into a signed distance field
// at 2 samples per glyph pixel, one byte a sample (d * 8, glyph px).
//
// Glyph box 30 x 44 px, centre (15, 22); the field reaches MARG px beyond it
// so the keyline and outer rule can be read off the same table.
// Flash: 10 x 88 x 116 B = 102 KB.

export const GW0 = 30, GH0 = 44, MARG = 7, RES = 2;
export const SW = (GW0 + 2 * MARG) * RES, SH = (GH0 + 2 * MARG) * RES;
export const RMUL = 0.88;
export const GCX = GW0 / 2, GCY = GH0 / 2;

// A stroke: control points [x, y, r]; `loop` closes it; `split` turns the last
// fraction of the stroke into two diverging prongs; `ell` is an ellipse ring
// [cx, cy, rx, ry, rSide, rTop, a0, a1] (angles in turns, 0 = right, y down).
const S = (pts, o = {}) => ({ pts, ...o });
const E = (cx, cy, rx, ry, rSide, rTop, a0 = 0, a1 = 1.06) => ({ ell: [cx, cy, rx, ry, rSide, rTop, a0, a1] });

export const STROKES = [
  // 0: one brush loop, thick down the sides, lighter over the top and bottom,
  // started at the upper right and overlapped past the start
  [E(15, 22, 9.8, 17.2, 5.0, 3.2, -0.16, 0.90)],
  // 1: a flag pressed in from the left, then the heavy stem lifting at the foot
  [S([[6, 13, 2.0], [11, 8, 3.2], [17, 2.6, 4.2]]),
    S([[17, 2.6, 4.4], [18, 14, 5.2], [17.5, 29, 5.0], [16.5, 41.5, 3.8]], { split: 0.22 })],
  // 2: the hook, the diagonal spine, the heavy base with a flick
  [S([[3.6, 13, 2.4], [6.5, 6, 3.6], [14, 2.6, 4.1], [22, 4, 4.5], [25.6, 11.5, 4.8], [22.5, 20, 4.6], [14, 29, 4.4], [7, 36.5, 4.3], [4.5, 40.5, 4.3]]),
    S([[4, 40, 4.6], [15, 39.6, 4.4], [24.5, 40.2, 3.6], [28.5, 36.6, 1.6]])],
  // 3: two open bowls meeting at a pointed tongue
  [S([[3.5, 9, 2.4], [9, 3.4, 3.6], [18, 2.6, 4.1], [24.6, 8, 4.5], [23, 15.5, 4.2], [14.5, 20.2, 3.4]]),
    S([[12.5, 20.4, 3.0], [21, 21.6, 4.1], [26.5, 29.5, 5.1], [23.4, 38.6, 4.9], [14.5, 42.4, 4.3], [6, 39.6, 3.2], [3, 35.4, 1.8]])],
  // 4: open-topped: the leaning left stroke, the bar, the heavy stem
  [S([[10.6, 2.2, 4.1], [7.4, 13.6, 4.5], [4.4, 25, 4.3]]),
    S([[3.4, 28.6, 3.8], [16, 28.2, 3.8], [29.2, 28.4, 2.6]]),
    S([[22.8, 10, 3.6], [22.6, 21, 5.2], [22, 33, 5.0], [21.4, 41.6, 3.8]], { split: 0.24 })],
  // 5: the flag to the right, the short neck, the big belly
  [S([[9.6, 4.2, 3.9], [18, 3.6, 3.5], [27.6, 2.6, 2.4]]),
    S([[9.6, 4.2, 4.2], [8.8, 12, 4.5], [8.2, 19.5, 4.1]]),
    S([[8.2, 19.8, 3.9], [15.5, 16.8, 4.2], [23.5, 20, 4.7], [27, 28.5, 5.1], [24, 37.4, 4.9], [15.5, 42.2, 4.2], [7, 40.4, 3.0], [3, 36.4, 1.6]])],
  // 6: one stroke: the sweep down the left, round the bowl, closing on the stem
  [S([[24.5, 3.6, 2.2], [17, 5.6, 3.8], [10.2, 11.6, 4.6], [6, 21, 5.1], [5.2, 30, 5.1], [8.4, 38.4, 4.6], [15.6, 42.6, 4.2], [23.4, 39, 4.4], [26.2, 31, 4.5], [22.4, 24.2, 4.0], [14.4, 23.2, 3.6], [8, 27, 3.2]])],
  // 7: the bar, pressed hard at the turn, the long diagonal lifting at the foot
  [S([[3, 7.6, 2.8], [9, 4.6, 3.7], [18, 4.2, 3.8], [27, 3.2, 4.2]]),
    S([[27, 3.2, 4.6], [22.6, 14, 5.1], [18, 27, 4.9], [15, 41.6, 3.6]], { split: 0.24 })],
  // 8: a small head loop over a bigger belly loop
  [E(15, 11.4, 8.6, 9.0, 3.6, 2.9, 0.1, 1.16), E(15, 31.2, 10.8, 10.8, 4.6, 3.5, -0.4, 0.66)],
  // 9: the head loop, then the stem curling down to a lifted tail
  [E(14.2, 13.4, 9.4, 10.2, 4.6, 3.3, 0.0, 1.06),
    S([[23.6, 12, 4.6], [24.4, 22, 5.1], [22, 32, 4.8], [17, 39.6, 4.1], [9.6, 42.6, 3.0], [4.6, 41, 1.7]])],
];

/** A stroke's centreline as a dense list of [x, y, r] (Catmull-Rom). */
function sample(st) {
  if (st.ell) {
    const [cx, cy, rx, ry, rS, rT, a0, a1] = st.ell, out = [];
    const n = Math.ceil((a1 - a0) * 64);
    for (let k = 0; k <= n; k++) {
      const a = (a0 + ((a1 - a0) * k) / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      out.push([cx + rx * c, cy + ry * s, (rT + (rS - rT) * Math.abs(c)) * RMUL]);
    }
    return out;
  }
  const P = st.pts, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      const q = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([q(0), q(1), (p1[2] + (p2[2] - p1[2]) * t) * RMUL]);
    }
  }
  out.push([P[P.length - 1][0], P[P.length - 1][1], P[P.length - 1][2] * RMUL]);
  return out;
}

/** Capsule list [ax, ay, ar, bx, by, br] for one digit, with split tails. */
function capsules(d) {
  const caps = [];
  for (const st of STROKES[d]) {
    const L = sample(st);
    const n = L.length, k0 = st.split ? Math.floor(n * (1 - st.split)) : n;
    for (let i = 1; i < n; i++) {
      const a = L[i - 1], b = L[i];
      if (i <= k0) { caps.push([a[0], a[1], a[2], b[0], b[1], b[2]]); continue; }
      // the dry-brush tail: two prongs drifting apart, each under half the width
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
      const fa = (i - 1 - k0) / (n - 1 - k0), fb = (i - k0) / (n - 1 - k0);
      for (const sg of [-1, 1]) {
        const oa = sg * a[2] * (0.42 + 0.5 * fa), ob = sg * b[2] * (0.42 + 0.5 * fb);
        const ra = a[2] * (0.62 - 0.22 * fa), rb = b[2] * (0.62 - 0.22 * fb);
        caps.push([a[0] + px * oa, a[1] + py * oa, ra, b[0] + px * ob, b[1] + py * ob, rb]);
      }
    }
  }
  return caps;
}

function capDist(x, y, c) {
  const dx = c[3] - c[0], dy = c[4] - c[1], l2 = dx * dx + dy * dy;
  let u = l2 ? ((x - c[0]) * dx + (y - c[1]) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = x - c[0] - u * dx, ey = y - c[1] - u * dy;
  return Math.sqrt(ex * ex + ey * ey) - (c[2] + (c[5] - c[2]) * u);
}

/** The ten fields: Int8Array(SW * SH), value = signed distance * 8 (glyph px). */
export const SDF = [];
for (let d = 0; d < 10; d++) {
  const caps = capsules(d), f = new Int8Array(SW * SH);
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const x = i / RES - MARG, y = j / RES - MARG;
      let m = 99;
      for (const c of caps) { const e = capDist(x, y, c); if (e < m) m = e; }
      const v = Math.round(m * 8);
      f[j * SW + i] = v > 127 ? 127 : v < -127 ? -127 : v;
    }
  SDF.push(f);
}

/**
 * Each digit's contour as points (glyph px, x16 in Int16 pairs): the zero
 * crossings of its field between neighbouring samples. The echoes that ring
 * out from a slammed letter are this list mapped forward, a few ops a point.
 * Flash: ~10 x 2.4 KB.
 */
export const CONTOUR = SDF.map((f) => {
  const pts = [];
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const a = f[j * SW + i];
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        if (i + di >= SW || j + dj >= SH) continue;
        const b = f[(j + dj) * SW + i + di];
        if ((a < 0) === (b < 0)) continue;
        const t = a / (a - b);
        pts.push(Math.round(((i + di * t) / RES - MARG) * 16), Math.round(((j + dj * t) / RES - MARG) * 16));
      }
    }
  return Int16Array.from(pts);
});
