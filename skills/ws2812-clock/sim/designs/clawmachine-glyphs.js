// Claw machine glyphs: one skeleton for the ten digits, worn by two materials.
// - Plush: a felt tube R thick round the skeleton, puffy shading, a running
//   stitch near the edge, button eyes and a stitched smile (numberfolk).
// - Neon: the same skeleton as a thin glass tube on the marquee.
// Each digit is precomputed once as a distance field (distance to the
// skeleton, arc length along it, direction away from it) at half-unit cells,
// then sampled with any squash / tilt / sub-pixel offset per frame.

export const GW = 20, GH = 28, R = 2.9;
const FS = 0.5, M = 4.5;
export const FNX = Math.round((GW + 2 * M) / FS) + 1, FNY = Math.round((GH + 2 * M) / FS) + 1;

const rad = (d) => (d * Math.PI) / 180;
function arc(cx, cy, rx, ry, a0, a1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
}
function quad(a, c, b, n) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    p.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return p;
}
const T = R + 0.2, B = GH - R - 0.2, Lx = R + 0.2, Rx = GW - R - 0.2;

// Skeletons (polylines) and the face anchor [x, y, eye spread] per digit.
const SIX = [
  arc(10.5, 14.2, 7.2, 11.1, -48, -198, 22),
  arc(10, 18.6, 6.8, 6.3, -180, 180, 40),
];
const rot180 = (pls) => pls.map((pl) => pl.map(([x, y]) => [GW - x, GH - y]));
export const SKEL = {
  0: { p: [arc(10, 14, 6.9, 10.9, -90, 270, 44)], face: [10, 3.1, 2.5] },
  1: { p: [[[5.2, 8.2], [11.6, T], [11.6, B]], [[5.4, B], [16.4, B]]], face: [11.6, 9.0, 2.0] },
  2: { p: [arc(10, 9.4, 6.8, 6.2, -168, 18, 22).concat(quad([16.45, 11.3], [13.6, 17.4], [Lx, B], 10).slice(1), [[Rx, B]])], face: [10, 3.3, 2.5] },
  3: { p: [arc(9.8, 8.4, 6.5, 5.3, -162, 90, 22), arc(9.8, 19.3, 7.0, 5.6, -90, 158, 24)], face: [9.8, 3.2, 2.5] },
  4: { p: [[[7.0, T], [Lx, 17.4], [Rx, 17.4]], [[14.0, T + 1.5], [14.0, B]]], face: [14.0, 9.6, 2.0] },
  5: { p: [[[16.2, T], [5.4, T], [4.8, 12.0]].concat(arc(9.8, 18.3, 7.0, 6.6, -126, 152, 24))], face: [11.2, 3.2, 2.5] },
  6: { p: SIX, face: [10.5, 3.2, 2.4] },
  7: { p: [[[Lx, T], [Rx, T]].concat(quad([Rx, T], [11.4, 12.5], [8.6, B], 12).slice(1))], face: [9.4, 3.2, 2.5] },
  8: { p: [arc(10, 8.6, 5.7, 5.5, -90, 270, 30), arc(10, 19.5, 6.8, 5.4, -90, 270, 34)], face: [10, 3.1, 2.4] },
  9: { p: rot180(SIX), face: [10, 3.2, 2.4] },
};

/** Distance fields: per digit { d, s, gx, gy } Float32Arrays of FNX * FNY. */
function buildField(pls) {
  const segs = [];
  let base = 0;
  for (const pl of pls) {
    let s = base;
    for (let k = 0; k + 1 < pl.length; k++) {
      const [ax, ay] = pl[k], [bx, by] = pl[k + 1], len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      segs.push([ax, ay, bx, by, s, len]);
      s += len;
    }
    base = Math.ceil(s / 2.2) * 2.2 + 2.2;   // next stroke starts on a whole stitch
  }
  const n = FNX * FNY, d = new Float32Array(n), S = new Float32Array(n), gx = new Float32Array(n), gy = new Float32Array(n);
  for (let j = 0; j < FNY; j++) for (let i = 0; i < FNX; i++) {
    const u = -M + i * FS, v = -M + j * FS;
    let best = 1e9, bs = 0, qx = 0, qy = 0;
    for (const [ax, ay, bx, by, s0, len] of segs) {
      const dx = bx - ax, dy = by - ay;
      let t = ((u - ax) * dx + (v - ay) * dy) / (len * len);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * dx, py = ay + t * dy, dd = Math.hypot(u - px, v - py);
      if (dd < best) { best = dd; bs = s0 + t * len; qx = px; qy = py; }
    }
    const c = j * FNX + i;
    d[c] = best; S[c] = bs;
    gx[c] = best > 1e-4 ? (u - qx) / best : 0; gy[c] = best > 1e-4 ? (v - qy) / best : 0;
  }
  return { d, s: S, gx, gy };
}
export const FIELD = [];
for (let k = 0; k < 10; k++) FIELD.push(buildField(SKEL[k].p));

// Sampled values (module scratch, no allocation per pixel).
export const smp = { d: 99, s: 0, gx: 0, gy: 0 };
/** Bilinear sample of digit field F at glyph coords (u, v) into smp. */
export function sample(F, u, v) {
  const fx = (u + M) / FS, fy = (v + M) / FS;
  if (fx < 0 || fy < 0 || fx >= FNX - 1 || fy >= FNY - 1) { smp.d = 99; return false; }
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, c = j * FNX + i;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  const D = F.d;
  smp.d = D[c] * w00 + D[c + 1] * w10 + D[c + FNX] * w01 + D[c + FNX + 1] * w11;
  if (smp.d > R + 1.6) return true;
  const G = F.gx, H = F.gy, S = F.s;
  smp.gx = G[c] * w00 + G[c + 1] * w10 + G[c + FNX] * w01 + G[c + FNX + 1] * w11;
  smp.gy = H[c] * w00 + H[c + 1] * w10 + H[c + FNX] * w01 + H[c + FNX + 1] * w11;
  // arc length: nearest corner (interpolating across stroke joins smears stitches)
  smp.s = S[c + (tx > 0.5 ? 1 : 0) + (ty > 0.5 ? FNX : 0)];
  return true;
}
