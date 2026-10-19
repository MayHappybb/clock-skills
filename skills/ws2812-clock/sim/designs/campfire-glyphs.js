// Campfire: puffy marshmallow numerals. Each digit is a skeleton of strokes in
// a 16 x 26 px box, swollen by R into a soft pillow. The signed distance field
// is precomputed once per digit on a half-pixel grid (plus its gradient), so a
// marshmallow can be drawn at any sub-pixel position, tilt and squash by
// sampling it: d < 0 inside, |grad| the outward direction for pillow shading.
export const GW = 16, GH = 26, R = 2.55;
const MARGIN = 7, STEP = 0.5;
export const SW = Math.round((GW + 2 * MARGIN) / STEP) + 1, SH = Math.round((GH + 2 * MARGIN) / STEP) + 1;

const rad = Math.PI / 180;
function ell(cx, cy, rx, ry, a0, a1, n = 18) {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * rad; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
}
const arc = (cx, cy, r, a0, a1, n) => ell(cx, cy, r, r, a0, a1, n);

// Skeletons: lists of polylines, y down.
const SIX = [arc(8, 18.0, 5.3, 0, 360, 24), [[2.75, 18.4], [2.9, 13.0], [4.3, 8.0], [7.0, 4.2], [11.6, 2.6]]];
const SK = [
  [ell(8, 13, 5.4, 10.4, 0, 360, 28)],
  [[[4.4, 7.8], [9.6, 2.7]], [[9.6, 2.7], [9.6, 23.4]]],
  [[...arc(8, 8, 5.3, 168, 380, 16), [6.0, 16.6], [2.8, 23.4]], [[2.8, 23.4], [13.4, 23.4]]],
  [arc(7.8, 7.9, 5.0, 200, 450, 16), arc(7.8, 18.2, 5.2, 270, 520, 16), [[5.4, 12.95], [7.8, 12.95]]],
  [[[10.4, 2.6], [2.7, 16.6]], [[2.7, 16.6], [13.4, 16.6]], [[10.4, 2.6], [10.4, 23.4]]],
  [[[13.0, 2.6], [4.0, 2.6]], [[4.0, 2.6], [3.4, 12.3]], [[3.4, 12.3], ...arc(7.8, 17.3, 5.6, 222, 505, 18)]],
  SIX,
  [[[2.6, 2.6], [13.4, 2.6]], [[13.4, 2.6], [11.0, 8.6], [8.4, 15.4], [6.8, 23.4]]],
  [arc(8, 7.7, 4.9, 0, 360, 22), arc(8, 18.1, 5.3, 0, 360, 24)],
  SIX.map((pl) => pl.map(([x, y]) => [GW - x, GH - y])),
];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Per digit: Float32Array d, gx, gy on the SW x SH grid (glyph units = px). */
export const FIELD = SK.map((polys) => {
  const segs = [];
  for (const pl of polys) for (let k = 0; k + 1 < pl.length; k++) segs.push([...pl[k], ...pl[k + 1]]);
  const d = new Float32Array(SW * SH), gx = new Float32Array(SW * SH), gy = new Float32Array(SW * SH);
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const u = -MARGIN + i * STEP, v = -MARGIN + j * STEP;
    let m = 1e9;
    for (const s of segs) { const q = segDist(u, v, s[0], s[1], s[2], s[3]); if (q < m) m = q; }
    d[j * SW + i] = m - R;
  }
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const a = d[j * SW + Math.max(0, i - 1)], b = d[j * SW + Math.min(SW - 1, i + 1)];
    const c = d[Math.max(0, j - 1) * SW + i], e = d[Math.min(SH - 1, j + 1) * SW + i];
    let x = b - a, y = e - c; const L = Math.hypot(x, y) || 1;
    gx[j * SW + i] = x / L; gy[j * SW + i] = y / L;
  }
  return { d, gx, gy };
});

/** Bilinear sample of digit g's field at glyph coords (u, v); writes S.d, S.gx, S.gy. */
export const S = { d: 0, gx: 0, gy: 0 };
export function sample(g, u, v) {
  const fu = (u + MARGIN) / STEP, fv = (v + MARGIN) / STEP;
  if (fu < 0 || fv < 0 || fu >= SW - 1 || fv >= SH - 1) { S.d = 9; S.gx = 0; S.gy = 0; return 9; }
  const i = fu | 0, j = fv | 0, a = fu - i, b = fv - j, F = FIELD[g], k = j * SW + i;
  const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
  S.d = F.d[k] * w00 + F.d[k + 1] * w10 + F.d[k + SW] * w01 + F.d[k + SW + 1] * w11;
  S.gx = F.gx[k] * w00 + F.gx[k + 1] * w10 + F.gx[k + SW] * w01 + F.gx[k + SW + 1] * w11;
  S.gy = F.gy[k] * w00 + F.gy[k + 1] * w10 + F.gy[k + SW] * w01 + F.gy[k + SW + 1] * w11;
  return S.d;
}
/** Distance only (cheaper). */
export function dist(g, u, v) {
  const fu = (u + MARGIN) / STEP, fv = (v + MARGIN) / STEP;
  if (fu < 0 || fv < 0 || fu >= SW - 1 || fv >= SH - 1) return 9;
  const i = fu | 0, j = fv | 0, a = fu - i, b = fv - j, D = FIELD[g].d, k = j * SW + i;
  return (D[k] * (1 - a) + D[k + 1] * a) * (1 - b) + (D[k + SW] * (1 - a) + D[k + SW + 1] * a) * b;
}
