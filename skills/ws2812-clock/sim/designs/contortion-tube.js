// Contortion: rasterising a rubber body into the 64 x 64 image. Segments are
// stamped into a small distance field (min of d - r), so the tube is one
// smooth union with round joins, sampled by coverage; a sphere normal from
// the nearest point gives it a lit, glossy 3D roundness.
import { N } from './contortion-glyphs.js';

export const W = 64, H = 64;
const F = new Float32Array(W * H), S = new Float32Array(W * H);
const NX = new Float32Array(W * H), NY = new Float32Array(W * H);
const ID = new Uint8Array(W * H);
// light from the spotlight: up, a little left, mostly from the front
const LX = -0.32, LY = -0.62, LZ = 0.72, HX = LX / 2, HY = LY / 2, HZ = (LZ + 1) / 2;
const HL = Math.hypot(HX, HY, HZ);

function stamp(cx, cy, r, x0, y0, x1, y1, id) {
  const ax = Math.max(x0, Math.floor(cx - r - 1)), bx = Math.min(x1, Math.ceil(cx + r + 1));
  const ay = Math.max(y0, Math.floor(cy - r - 1)), by = Math.min(y1, Math.ceil(cy + r + 1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), f = d - r, p = y * W + x;
    if (f < F[p]) { F[p] = f; ID[p] = id; NX[p] = dx / r; NY[p] = dy / r; S[p] = 0; }
  }
}

/**
 * Draw one acrobat. pts: 2N px coordinates. r: tube radius. face: index
 * (fractional) of the head on the body; rh its radius. look: { body(s, lat)
 * -> fills tmp colour, skin, mitt }. lit(x, y) -> light level. Returns the
 * head centre in px.
 */
export function drawBody(img, pts, r, faceIdx, rh, mitA, mitB, look, lit) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = 0; k < N; k++) {
    const x = pts[2 * k], y = pts[2 * k + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const m = rh + 2;
  x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m));
  x1 = Math.min(W - 1, Math.ceil(x1 + m)); y1 = Math.min(H - 1, Math.ceil(y1 + m));
  if (x0 > x1 || y0 > y1) return null;
  for (let y = y0; y <= y1; y++) F.fill(1e9, y * W + x0, y * W + x1 + 1);
  for (let k = 0; k < N - 1; k++) {
    const ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[2 * k + 2], by = pts[2 * k + 3];
    const ux = bx - ax, uy = by - ay, L2 = ux * ux + uy * uy || 1e-9;
    const sx0 = Math.max(x0, Math.floor(Math.min(ax, bx) - r - 1)), sx1 = Math.min(x1, Math.ceil(Math.max(ax, bx) + r + 1));
    const sy0 = Math.max(y0, Math.floor(Math.min(ay, by) - r - 1)), sy1 = Math.min(y1, Math.ceil(Math.max(ay, by) + r + 1));
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      let t = ((x - ax) * ux + (y - ay) * uy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - t * ux, dy = y - ay - t * uy, d = Math.sqrt(dx * dx + dy * dy), f = d - r, p = y * W + x;
      if (f < F[p]) { F[p] = f; ID[p] = 0; NX[p] = dx / r; NY[p] = dy / r; S[p] = k + t; }
    }
  }
  // the head: a ball on the body
  const fi = Math.min(N - 1.001, Math.max(0, faceIdx)), k0 = Math.floor(fi), ft = fi - k0;
  const hx = pts[2 * k0] + (pts[2 * k0 + 2] - pts[2 * k0]) * ft;
  const hy = pts[2 * k0 + 1] + (pts[2 * k0 + 3] - pts[2 * k0 + 1]) * ft - (rh - r) * 0.9;
  stamp(hx, hy, rh, x0, y0, x1, y1, 1);
  // white mittens at the stroke ends
  const rm = r * 1.05;
  if (mitA) stamp(pts[0] + (pts[0] - pts[2]) * 0.5, pts[1] + (pts[1] - pts[3]) * 0.5, rm, x0, y0, x1, y1, 2);
  if (mitB) {
    const e = 2 * (N - 1);
    stamp(pts[e] + (pts[e] - pts[e - 2]) * 0.5, pts[e + 1] + (pts[e + 1] - pts[e - 1]) * 0.5, rm, x0, y0, x1, y1, 2);
  }
  const c = look.tmp;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = y * W + x, f = F[p];
    if (f >= 0.5) continue;
    const a = f <= -0.5 ? 1 : 0.5 - f;
    let nx = NX[p], ny = NY[p], q = nx * nx + ny * ny;
    if (q > 1) { q = Math.sqrt(q); nx /= q; ny /= q; q = 1; }
    const nz = Math.sqrt(1 - q);
    const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
    const sp = Math.max(0, (nx * HX + ny * HY + nz * HZ) / HL);
    const sp2 = sp * sp, spec = sp2 * sp2 * sp2 * sp2 * sp2;
    const id = ID[p];
    if (id === 0) look.body(S[p], nx, ny, x, y);
    else { const s = id === 1 ? look.skin : look.mitt; c[0] = s[0]; c[1] = s[1]; c[2] = s[2]; }
    const L = lit(x, y), sh = (0.18 + 0.95 * diff) * L, g = spec * (id === 1 ? 0.12 : look.gloss) * L;
    const o = 3 * p;
    img[o] += (c[0] * sh + g - img[o]) * a;
    img[o + 1] += (c[1] * sh + g - img[o + 1]) * a;
    img[o + 2] += (c[2] * sh + g * 0.9 - img[o + 2]) * a;
  }
  return [hx, hy];
}

/** An ellipse painted over the image (alpha a), coverage by 4 x 4 supersampling. */
export function blob(img, cx, cy, rx, ry, col, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  const irx = 1 / rx, iry = 1 / ry;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let n = 0;
    for (let sy = 0; sy < 4; sy++) {
      const v = (y - 0.375 + sy * 0.25 - cy) * iry, v2 = v * v;
      if (v2 > 1) continue;
      for (let sx = 0; sx < 4; sx++) { const u = (x - 0.375 + sx * 0.25 - cx) * irx; if (u * u + v2 <= 1) n++; }
    }
    if (!n) continue;
    const cov = Math.min(1, (n / 16) * a), o = 3 * (y * W + x);
    img[o] += (col[0] - img[o]) * cov; img[o + 1] += (col[1] - img[o + 1]) * cov; img[o + 2] += (col[2] - img[o + 2]) * cov;
  }
}

const INK = [0.002, 0.001, 0.0015];
/**
 * A rubber-hose face on a head at (hx, hy), radius rh: black pill eyes cut
 * firmly out of the skin (coverage boosted so they stay whole LEDs), a smile.
 * gx, gy: gaze (-1..1). open: eyelids (0 shut .. 1). happy: shut eyes curve
 * up. mouth: 0 smile .. 1 straining 'o'.
 */
export function drawFace(img, hx, hy, rh, gx, gy, open, happy, mouth) {
  const big = rh > 3.8, ex = big ? 1.65 : 1.2, ey = hy - (big ? 0.5 : 0.35) + gy * (big ? 0.6 : 0.4);
  const erx = big ? 0.72 : 0.6, ery = big ? 1.3 : 0.95;
  for (const s of [-1, 1]) {
    const cx = hx + s * ex + gx * (big ? 0.75 : 0.5);
    if (open > 0.3) blob(img, cx, ey, erx, ery * open, INK, 1.7);
    else blob(img, cx, ey + (happy ? -0.2 : 0.3), erx + 0.45, 0.4, INK, 1.5);
  }
  if (big) blob(img, hx + gx * 0.5, hy + 2.0, 1.05 - 0.4 * mouth, 0.36 + 0.45 * mouth, INK, 1.3);
}
