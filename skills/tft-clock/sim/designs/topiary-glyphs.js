// Topiary numerals: ten clipped-box hedge sculptures, designed as a set.
//
// Each digit is a skeleton of hedge "limbs" (polylines, arcs sampled) in a
// 28 x 44 design box. A limb is a clipped hedge of round-shouldered square
// section: its height above the backing falls off with a flattened profile,
// so a limb has a broad lit face and soft shoulders. Limbs merge by max, which
// leaves a crease where two meet. On top sits leaf texture: a jittered grid of
// leaf clusters (~2.4 px) that bumps the surface and scallops the outline, so
// the silhouette is leafy rather than vector-smooth.
//
// buildGlyph(d, k) returns, for size factor k (1 = the near hedges, ~0.64 the
// far ones), arrays over a padded box:
//   H   height 0..255 (0 = no hedge)
//   NX, NY, NZ  the surface normal (-127..127)
//   T   leaf cluster id (0..255) for tint and rustle
//   F   overgrowth fuzz: 1 where the shaggy new growth may stick out
//       beyond the clipped shape (outside only, never into a counter)
// All of it is constant: on the device these are flash tables
// (6 bytes a pixel, ~100 KB for twenty glyphs).

import { hash } from '../js/kit.js';

export const DW = 28, DH = 44, R0 = 4.75;

function arc(cx, cy, rx, ry, a0, a1, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const L = R0, Rt = DW - R0, T0 = R0, B0 = DH - R0;   // stroke-centre limits

/** Limbs per digit: [polyline, radius factor]. Angles: 0 right, 90 down. */
const SKEL = {
  0: [[arc(14, 22, 9.25, 17.25, 0, 360, 36), 1]],
  1: [[[[15.5, T0 - 0.2], [15.5, B0]], 1.04], [[[15.5, T0 + 0.6], [7.2, 12.4]], 0.92]],
  2: [[[...arc(14, 13.7, 9.25, 9.0, 192, 396, 20), [L + 0.2, B0], [Rt, B0]], 1]],
  3: [[arc(13.4, 12.5, 8.6, 7.8, 205, 450, 18), 1],
    [arc(13.4, 30.1, 9.85, 9.2, 270, 520, 20), 1],
    [[[13.4, 20.4], [8.6, 20.6]], 0.86]],
  4: [[[[19.4, T0 - 0.2], [19.4, B0]], 1], [[[19.4, T0 + 0.4], [L, 28.4], [Rt + 0.4, 28.4]], 0.96]],
  5: [[[[Rt - 0.2, T0], [6.2, T0], [6.0, 19.6], ...arc(14, 28.4, 9.25, 10.9, 222, 513, 22)], 1]],
  6: [[arc(14, 29.3, 9.25, 9.95, 0, 360, 30), 1], [arc(19.2, 29.3, 14.5, 23.3, 286, 182, 16), 1]],
  7: [[[[L, T0], [Rt, T0], [17.4, 20.5], [11.6, B0]], 1]],
  8: [[arc(14, 12.3, 7.9, 7.6, 0, 360, 26), 0.97], [arc(14, 30.2, 9.25, 9.05, 0, 360, 30), 1]],
  9: [[arc(14, 14.7, 9.25, 9.95, 0, 360, 30), 1], [arc(8.8, 14.7, 14.5, 23.3, 2, 106, 16), 1]],
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Leaf clusters: nearest jittered point on a grid of `C` px; returns [f1, id]. */
const C = 2.35;
function leaf(x, y, seed) {
  const ci = Math.floor(x / C), cj = Math.floor(y / C);
  let best = 9, id = 0;
  for (let j = cj - 1; j <= cj + 1; j++)
    for (let i = ci - 1; i <= ci + 1; i++) {
      const h = hash(i, j, seed);
      const qx = (i + 0.15 + 0.7 * ((h & 255) / 255)) * C, qy = (j + 0.15 + 0.7 * (((h >> 8) & 255) / 255)) * C;
      const d = Math.hypot(x - qx, y - qy);
      if (d < best) { best = d; id = (h >>> 16) & 255; }
    }
  return [best, id];
}

export const PAD = 3;

export function buildGlyph(d, k, seed = 7) {
  const w = Math.ceil(DW * k) + 2 * PAD, h = Math.ceil(DH * k) + 2 * PAD, n = w * h;
  const R = R0 * k;
  const height = new Float32Array(n), dist = new Float32Array(n).fill(99);
  const H = new Uint8Array(n), NX = new Int8Array(n), NY = new Int8Array(n), NZ = new Int8Array(n), T = new Uint8Array(n), F = new Uint8Array(n);
  const limbs = SKEL[d];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5, u = (px - PAD) / k, v = (py - PAD) / k;
      const [f1, id] = leaf(px, py, seed);
      const bump = Math.max(0, 1 - f1 / 1.55);
      let best = 0, bd = 99;
      for (const [pts, rf] of limbs) {
        let dm = 99;
        for (let i = 1; i < pts.length; i++) dm = Math.min(dm, segD(u, v, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
        const r = R * rf, dp = dm * k;
        // scalloped outline: the leaf clusters bulge the edge by up to ~0.6 px
        const rr = r + 0.65 * bump - 0.2;
        bd = Math.min(bd, dp - r);
        if (dp < rr) {
          const t = dp / rr, prof = Math.pow(1 - Math.pow(t, 2.6), 1 / 2.6);
          best = Math.max(best, prof * r);
        }
      }
      const i = y * w + x;
      dist[i] = bd;
      T[i] = id;
      if (best > 0) height[i] = best + 0.9 * bump * Math.min(1, best);
    }
  // normals from the height's gradient
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : height[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (height[i] <= 0) continue;
      const gx = (at(x + 1, y) - at(x - 1, y)) * 0.5, gy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const nz = 1, len = Math.hypot(gx, gy, nz);
      NX[i] = Math.round((-gx / len) * 127); NY[i] = Math.round((-gy / len) * 127); NZ[i] = Math.round((nz / len) * 127);
      H[i] = Math.max(1, Math.min(255, Math.round((height[i] / (R + 1)) * 255)));
    }
  // fuzz: the outside region (flood from the border), within reach of the shape
  const out = new Uint8Array(n), stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (out[i] || H[i]) continue;
    out[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
  }
  const reach = 0.9 + 1.3 * k;
  for (let i = 0; i < n; i++) {
    if (!out[i]) continue;
    const x = i % w, y = (i / w) | 0;
    const [f1] = leaf(x + 0.5, y + 0.5, seed + 1);
    if (dist[i] < reach * (1.15 - f1 / 1.8)) F[i] = 1;
  }
  return { d, k, w, h, H, NX, NY, NZ, T, F };
}
