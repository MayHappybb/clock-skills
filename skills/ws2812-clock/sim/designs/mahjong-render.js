// A tiny 3D renderer for mahjong tiles on baize, into a W x H linear-RGB
// raster. Perspective camera; each tile is an oriented box (ivory front
// layer, green back layer, carved face texture on the front) with bevelled
// edges. Coverage comes from the box's projected outline (an offset convex
// hull, so silhouettes are anti-aliased and rounded and glide between
// pixels); shading from a ray-box hit at the pixel centre. Tiles are drawn
// back to front. A table-space shadow buffer gives soft contact shadows that
// spread and fade as a tile lifts.
import { TW, TH } from './mahjong-faces.js';

export const W = 256, H = 64;
export const img = new Float32Array(W * H * 3);

// ---------------------------------------------------------------- camera
export const cam = { cx: 0, cy: 0, cz: 0, fy: 1, fz: 0, uy: 0, uz: 1, F: 100, ox: 128, oy: 32 };
/** Camera at (0, y, z) looking along +Y pitched down by `pitch` radians. */
export function setCamera(y, z, pitch, F, oy = 32) {
  cam.cx = 0; cam.cy = y; cam.cz = z; cam.F = F; cam.oy = oy;
  cam.fy = Math.cos(pitch); cam.fz = -Math.sin(pitch);
  cam.uy = Math.sin(pitch); cam.uz = Math.cos(pitch);
}
/** Project a world point: writes screen x, y and the camera depth into P. */
const P = new Float64Array(3);
export function project(x, y, z) {
  const dx = x - cam.cx, dy = y - cam.cy, dz = z - cam.cz;
  const zz = dy * cam.fy + dz * cam.fz;
  P[0] = cam.ox + cam.F * dx / zz; P[1] = cam.oy - cam.F * (dy * cam.uy + dz * cam.uz) / zz; P[2] = zz;
  return P;
}

// ----------------------------------------------------------------- tiles
/** Tile pool: every tile has the same fields in the same order. */
export function makeTile() {
  return { x: 0, y: 0, z: 0, m0: 1, m1: 0, m2: 0, m3: 0, m4: 1, m5: 0, m6: 0, m7: 0, m8: 1,
    w: 24, h: 32, d: 17, tex: null, glow: 1, depth: 0, on: false, shadow: 1 };
}
/**
 * Pose a tile: centre (x, y, z); yaw about world Z; tip back by `tip`
 * (0 standing face to the viewer, PI/2 lying face up); `flip` about the tile's
 * own height axis (PI turns the face away / face down).
 */
export function pose(T, x, y, z, yaw, tip, flip) {
  T.x = x; T.y = y; T.z = z;
  const cf = Math.cos(flip), sf = Math.sin(flip), ct = Math.cos(tip), st = Math.sin(tip), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Rz(flip) on the unit axes, then Rx(-tip): (x, y ct + z st, -y st + z ct), then Rz(yaw)
  const ax = (vx, vy, vz, o) => {
    const x1 = vx * cf - vy * sf, y1 = vx * sf + vy * cf, z1 = vz;
    const y2 = y1 * ct + z1 * st, z2 = -y1 * st + z1 * ct;
    const x3 = x1 * cy - y2 * sy, y3 = x1 * sy + y2 * cy;
    if (o === 0) { T.m0 = x3; T.m1 = y3; T.m2 = z2; } else if (o === 1) { T.m3 = x3; T.m4 = y3; T.m5 = z2; } else { T.m6 = x3; T.m7 = y3; T.m8 = z2; }
  };
  ax(1, 0, 0, 0); ax(0, 1, 0, 1); ax(0, 0, 1, 2);
  return T;
}

// ------------------------------------------------------------- lighting
export const lamp = { x: 0, y: 40, z: 150, k: 1, r: 0.0, g: 0.0, b: 0.0, R2: 26000 };
export const AMB = 0.035;

// ------------------------------------------------------------- shadows
// table space: X -260..260, Y -60..220 in 2-unit cells
const SX0 = -260, SY0 = -60, SC = 2, SW = 260, SH = 140;
const shadow = new Float32Array(SW * SH);
export function clearShadow() { shadow.fill(0); }

// convex hull scratch
const hx = new Float64Array(8), hy = new Float64Array(8), ord = [0, 1, 2, 3, 4, 5, 6, 7];
const ex = new Float64Array(9), ey = new Float64Array(9), en = new Float64Array(27); let ecount = 0;
/** Hull of the 8 points (hx, hy) into ex/ey (closed), edge normals into en. */
function hull() {
  ord.sort((a, b) => hx[a] - hx[b] || hy[a] - hy[b]);
  const st = [];
  const cross = (o, a, b) => (hx[a] - hx[o]) * (hy[b] - hy[o]) - (hy[a] - hy[o]) * (hx[b] - hx[o]);
  for (let k = 0; k < 8; k++) { const p = ord[k]; while (st.length >= 2 && cross(st[st.length - 2], st[st.length - 1], p) <= 0) st.pop(); st.push(p); }
  const lo = st.length + 1;
  for (let k = 6; k >= 0; k--) { const p = ord[k]; while (st.length >= lo && cross(st[st.length - 2], st[st.length - 1], p) <= 0) st.pop(); st.push(p); }
  st.pop();
  ecount = st.length;
  for (let k = 0; k < ecount; k++) { ex[k] = hx[st[k]]; ey[k] = hy[st[k]]; }
  ex[ecount] = ex[0]; ey[ecount] = ey[0];
  for (let k = 0; k < ecount; k++) {
    const dx = ex[k + 1] - ex[k], dy = ey[k + 1] - ey[k], L = Math.hypot(dx, dy) || 1;
    // counter-clockwise hull in (x right, y down) => outward normal (dy, -dx)
    const nx = dy / L, ny = -dx / L;
    en[3 * k] = nx; en[3 * k + 1] = ny; en[3 * k + 2] = nx * ex[k] + ny * ey[k];
  }
}
/** Signed distance from (px, py) to the hull (negative inside). */
function hullDist(px, py) {
  let dm = -1e9;
  for (let k = 0; k < ecount; k++) { const d = en[3 * k] * px + en[3 * k + 1] * py - en[3 * k + 2]; if (d > dm) dm = d; }
  if (dm <= 0) return dm;
  let best = 1e9;
  for (let k = 0; k < ecount; k++) {
    const ax = ex[k], ay = ey[k], dx = ex[k + 1] - ax, dy = ey[k + 1] - ay, L2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - ax - t * dx, qy = py - ay - t * dy, d = qx * qx + qy * qy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const RB = 2.2;  // corner / edge radius (world units)
function corners(T, shrink, fn) {
  const a = T.w / 2 - shrink, b = T.d / 2 - shrink, c = T.h / 2 - shrink;
  let k = 0;
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) for (let l = -1; l <= 1; l += 2) {
    fn(k++, T.x + i * a * T.m0 + j * b * T.m3 + l * c * T.m6, T.y + i * a * T.m1 + j * b * T.m4 + l * c * T.m7, T.z + i * a * T.m2 + j * b * T.m5 + l * c * T.m8);
  }
}

/** Splat a tile's soft shadow onto the table. */
export function castShadow(T) {
  const lift = Math.max(0, T.z - Math.min(T.h, T.w, T.d) / 2);
  corners(T, RB, (k, x, y) => { hx[k] = (x - SX0) / SC; hy[k] = (y - SY0) / SC; });
  hull();
  const soft = (1.6 + lift * 0.18) / SC, strength = T.shadow * 0.75 / (1 + lift * 0.05);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < ecount; k++) { x0 = Math.min(x0, ex[k]); x1 = Math.max(x1, ex[k]); y0 = Math.min(y0, ey[k]); y1 = Math.max(y1, ey[k]); }
  const r = RB / SC + soft;
  x0 = Math.max(0, Math.floor(x0 - r)); x1 = Math.min(SW - 1, Math.ceil(x1 + r)); y0 = Math.max(0, Math.floor(y0 - r)); y1 = Math.min(SH - 1, Math.ceil(y1 + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = hullDist(x + 0.5, y + 0.5) - RB / SC;
    let a = 0.5 - d / (2 * soft); if (a <= 0) continue; if (a > 1) a = 1;
    const s = a * strength, p = y * SW + x;
    shadow[p] = 1 - (1 - shadow[p]) * (1 - s);
  }
}

// ----------------------------------------------------------- the table
const FELT = [0.011, 0.13, 0.045];
const grain = new Float32Array(1024);
for (let i = 0; i < 1024; i++) { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); grain[i] = ((h >>> 0) % 1000) / 1000; }
/** Lamp falloff at a table point. */
const lampAt = (x, y, z) => { const dx = x - lamp.x, dy = y - lamp.y; return lamp.k / (1 + (dx * dx + dy * dy) / lamp.R2) ; };
export function drawTable(dim) {
  const F = cam.F;
  for (let py = 0; py < H; py++) {
    const b = (py + 0.5 - cam.oy) / F;
    const dy = cam.fy - b * cam.uy, dz = cam.fz - b * cam.uz;
    for (let px = 0; px < W; px++) {
      const p = 3 * (py * W + px);
      if (dz >= -1e-4) { img[p] = img[p + 1] = img[p + 2] = 0; continue; }
      const a = (px + 0.5 - cam.ox) / F;
      const t = -cam.cz / dz, X = a * t, Y = cam.cy + dy * t;
      if (Y > 230) { img[p] = img[p + 1] = img[p + 2] = 0; continue; }
      const sx = ((X - SX0) / SC) | 0, sy = ((Y - SY0) / SC) | 0;
      const sh = sx >= 0 && sy >= 0 && sx < SW && sy < SH ? shadow[sy * SW + sx] : 0;
      const g = grain[((Math.floor(X * 0.8) & 31) * 32 + (Math.floor(Y * 0.8) & 31))];
      const L = (AMB + lampAt(X, Y, 0) * (0.8 + 0.2 * g)) * (1 - sh) * dim * (Y > 175 ? Math.max(0, 1 - (Y - 175) / 40) : 1);
      img[p] = FELT[0] * L; img[p + 1] = FELT[1] * L; img[p + 2] = FELT[2] * L;
    }
  }
}

// ------------------------------------------------------------ draw a tile
const IVORY_S = [0.78, 0.7, 0.52], GREEN = [0.03, 0.4, 0.26], SEAM = [0.25, 0.22, 0.14];
export function drawTile(T, dim) {
  let near = false;
  corners(T, RB, (k, x, y, z) => { project(x, y, z); hx[k] = P[0]; hy[k] = P[1]; if (P[2] < 4) near = true; });
  if (near) return;
  hull();
  project(T.x, T.y, T.z);
  const rs = RB * cam.F / P[2];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < ecount; k++) { x0 = Math.min(x0, ex[k]); x1 = Math.max(x1, ex[k]); y0 = Math.min(y0, ey[k]); y1 = Math.max(y1, ey[k]); }
  x0 = Math.max(0, Math.floor(x0 - rs - 1)); x1 = Math.min(W - 1, Math.ceil(x1 + rs + 1));
  y0 = Math.max(0, Math.floor(y0 - rs - 1)); y1 = Math.min(H - 1, Math.ceil(y1 + rs + 1));
  if (x0 > x1 || y0 > y1) return;

  const { m0, m1, m2, m3, m4, m5, m6, m7, m8 } = T;
  // camera and its axes in tile space (R^T v)
  const qx = cam.cx - T.x, qy = cam.cy - T.y, qz = cam.cz - T.z;
  const ox = qx * m0 + qy * m1 + qz * m2, oy = qx * m3 + qy * m4 + qz * m5, oz = qx * m6 + qy * m7 + qz * m8;
  const fx = cam.fy * m1 + cam.fz * m2, fy = cam.fy * m4 + cam.fz * m5, fz = cam.fy * m7 + cam.fz * m8;  // forward
  const rx = m0, ry = m3, rz = m6;                                                                         // right (1,0,0)
  const ux = cam.uy * m1 + cam.uz * m2, uy = cam.uy * m4 + cam.uz * m5, uz = cam.uy * m7 + cam.uz * m8;  // up
  const e = 0.9 * P[2] / cam.F;
  const hw = T.w / 2, hd = T.d / 2, hh = T.h / 2, bw = hw + e, bd = hd + e, bh = hh + e;
  const tex = T.tex, glow = T.glow * dim, F = cam.F;
  const lx = lamp.x, ly = lamp.y, lz = lamp.z;

  for (let py = y0; py <= y1; py++) {
    const b = (py + 0.5 - cam.oy) / F;
    for (let px = x0; px <= x1; px++) {
      let cov = rs + 0.5 - hullDist(px + 0.5, py + 0.5);
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      const a = (px + 0.5 - cam.ox) / F;
      const dx = fx + a * rx - b * ux, dy = fy + a * ry - b * uy, dz = fz + a * rz - b * uz;
      // slab test
      let tn = -1e9, tf = 1e9, ax = 0, sg = 0;
      let t1 = (-bw - ox) / dx, t2 = (bw - ox) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tn) { tn = t1; ax = 0; sg = dx > 0 ? -1 : 1; } if (t2 < tf) tf = t2;
      t1 = (-bd - oy) / dy; t2 = (bd - oy) / dy;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tn) { tn = t1; ax = 1; sg = dy > 0 ? -1 : 1; } if (t2 < tf) tf = t2;
      t1 = (-bh - oz) / dz; t2 = (bh - oz) / dz;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tn) { tn = t1; ax = 2; sg = dz > 0 ? -1 : 1; } if (t2 < tf) tf = t2;
      if (tn > tf || tf < 0) continue;
      const hx_ = ox + tn * dx, hy_ = oy + tn * dy, hz_ = oz + tn * dz;
      // base colour
      let cr, cg, cb;
      if (ax === 1 && sg < 0) {
        if (tex) {
          let u = (hx_ + hw) / T.w * TW - 0.5, v = (hh - hz_) / T.h * TH - 0.5;
          u = u < 0 ? 0 : u > TW - 1.001 ? TW - 1.001 : u; v = v < 0 ? 0 : v > TH - 1.001 ? TH - 1.001 : v;
          const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv;
          const p00 = 3 * (iv * TW + iu), p01 = p00 + 3, p10 = p00 + 3 * TW, p11 = p10 + 3;
          const w00 = (1 - fu) * (1 - fv), w01 = fu * (1 - fv), w10 = (1 - fu) * fv, w11 = fu * fv;
          cr = tex[p00] * w00 + tex[p01] * w01 + tex[p10] * w10 + tex[p11] * w11;
          cg = tex[p00 + 1] * w00 + tex[p01 + 1] * w01 + tex[p10 + 1] * w10 + tex[p11 + 1] * w11;
          cb = tex[p00 + 2] * w00 + tex[p01 + 2] * w01 + tex[p10 + 2] * w10 + tex[p11 + 2] * w11;
        } else { cr = IVORY_S[0]; cg = IVORY_S[1]; cb = IVORY_S[2]; }
      } else if (ax === 1) { cr = GREEN[0]; cg = GREEN[1]; cb = GREEN[2]; }
      else {
        const s = (hy_ + hd) / T.d;
        if (s < 0.56) { cr = IVORY_S[0]; cg = IVORY_S[1]; cb = IVORY_S[2]; }
        else if (s < 0.62) { cr = SEAM[0]; cg = SEAM[1]; cb = SEAM[2]; }
        else { cr = GREEN[0]; cg = GREEN[1]; cb = GREEN[2]; }
      }
      // bevelled normal in tile space
      let nx = 0, ny = 0, nz = 0;
      if (ax === 0) nx = sg; else if (ax === 1) ny = sg; else nz = sg;
      if (ax !== 0) { const k = 1 - (hw - Math.abs(hx_)) / RB; if (k > 0) nx += (hx_ > 0 ? 1 : -1) * k * 0.9; }
      if (ax !== 1) { const k = 1 - (hd - Math.abs(hy_)) / RB; if (k > 0) ny += (hy_ > 0 ? 1 : -1) * k * 0.9; }
      if (ax !== 2) { const k = 1 - (hh - Math.abs(hz_)) / RB; if (k > 0) nz += (hz_ > 0 ? 1 : -1) * k * 0.9; }
      // to world
      let wx = nx * m0 + ny * m3 + nz * m6, wy = nx * m1 + ny * m4 + nz * m7, wz = nx * m2 + ny * m5 + nz * m8;
      const nl = 1 / Math.sqrt(wx * wx + wy * wy + wz * wz); wx *= nl; wy *= nl; wz *= nl;
      // world hit point
      const Wx = T.x + hx_ * m0 + hy_ * m3 + hz_ * m6, Wy = T.y + hx_ * m1 + hy_ * m4 + hz_ * m7, Wz = T.z + hx_ * m2 + hy_ * m5 + hz_ * m8;
      let Lx = lx - Wx, Ly = ly - Wy, Lz = lz - Wz;
      const L2 = Lx * Lx + Ly * Ly, Li = 1 / Math.sqrt(L2 + Lz * Lz); Lx *= Li; Ly *= Li; Lz *= Li;
      let diff = wx * Lx + wy * Ly + wz * Lz; if (diff < 0) diff = 0;
      const fall = lamp.k / (1 + L2 / lamp.R2);
      // view vector (to the camera) in world: -(f + a r - b u)
      let vx = -a, vy = -(cam.fy - b * cam.uy), vz = -(cam.fz - b * cam.uz);
      const vl = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz); vx *= vl; vy *= vl; vz *= vl;
      let hx2 = Lx + vx, hy2 = Ly + vy, hz2 = Lz + vz; const hl = 1 / Math.sqrt(hx2 * hx2 + hy2 * hy2 + hz2 * hz2);
      let sp = (wx * hx2 + wy * hy2 + wz * hz2) * hl; if (sp < 0) sp = 0;
      sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;                     // ^32
      const I = AMB + (0.25 + 0.75 * diff) * fall;
      const S = sp * fall * 0.35;
      const o = 3 * (py * W + px), k = 1 - cov;
      img[o] = img[o] * k + (cr * I + S) * glow * cov;
      img[o + 1] = img[o + 1] * k + (cg * I + S * 0.92) * glow * cov;
      img[o + 2] = img[o + 2] * k + (cb * I + S * 0.75) * glow * cov;
    }
  }
}

/** Camera depth of a tile's centre, for sorting. */
export function depthOf(T) { project(T.x, T.y, T.z); return P[2]; }

// ------------------------------------------------------- tea and steam
const CELADON = [0.34, 0.52, 0.38], TEA = [0.32, 0.12, 0.02];
/** A celadon tea bowl (vertical cylinder, radius r, height h) standing at (x, y). */
export function drawCup(x, y, r, h, dim) {
  project(x, y, h / 2);
  const s = cam.F / P[2], cx = P[0], cy = P[1];
  const x0 = Math.max(0, Math.floor(cx - r * s - 2)), x1 = Math.min(W - 1, Math.ceil(cx + r * s + 2));
  const y0 = Math.max(0, Math.floor(cy - h * s - 2)), y1 = Math.min(H - 1, Math.ceil(cy + h * s + 2));
  const ox = cam.cx - x, oy = cam.cy - y, oz = cam.cz;
  for (let py = y0; py <= y1; py++) {
    const b = (py + 0.5 - cam.oy) / cam.F;
    for (let px = x0; px <= x1; px++) {
      const a = (px + 0.5 - cam.ox) / cam.F;
      const dx = a, dy = cam.fy - b * cam.uy, dz = cam.fz - b * cam.uz;
      let col = null, I = 0;
      // tea surface first (seen from above, inside the rim)
      const tt = (h - 1.6 - oz) / dz;
      const tx = ox + tt * dx, ty = oy + tt * dy;
      const rr = Math.sqrt(tx * tx + ty * ty);
      // outer wall
      const A = dx * dx + dy * dy, B = 2 * (ox * dx + oy * dy), C = ox * ox + oy * oy - r * r, D = B * B - 4 * A * C;
      let cov = 0;
      if (D > 0) {
        const t = (-B - Math.sqrt(D)) / (2 * A), z = oz + t * dz;
        if (z >= 0 && z <= h) {
          const nx = (ox + t * dx) / r, ny = (oy + t * dy) / r;
          const lx = lamp.x - x - r * nx, ly = lamp.y - y - r * ny, ll = Math.hypot(lx, ly, lamp.z - z);
          const diff = Math.max(0, (nx * lx + ny * ly) / ll);
          const edge = Math.sqrt(Math.max(0, 1 - (C + r * r - (B * B) / (4 * A)) / (r * r) * 0 ));
          I = AMB + (0.35 + 0.65 * diff) * lamp.k / (1 + ((x - lamp.x) ** 2 + (y - lamp.y) ** 2) / lamp.R2);
          const rim = z > h - 1.3 ? 1.4 : 1, foot = z < 1.2 ? 0.6 : 1;
          col = CELADON; I *= rim * foot * (0.75 + 0.25 * edge);
          // anti-alias the silhouette by how far inside the disc the ray passes
          cov = Math.min(1, Math.sqrt(D) / (2 * A) * s * 0.5);
        }
      }
      if (rr < r - 0.9 && tt > 0) { col = TEA; I = AMB + 0.7 * lamp.k / (1 + ((x - lamp.x) ** 2 + (y - lamp.y) ** 2) / lamp.R2); cov = Math.min(1, (r - 0.9 - rr) * s + 0.5); }
      if (!col || cov <= 0) continue;
      const o = 3 * (py * W + px), k = 1 - cov, g = I * dim * 0.6;
      img[o] = img[o] * k + col[0] * g * cov; img[o + 1] = img[o + 1] * k + col[1] * g * cov; img[o + 2] = img[o + 2] * k + col[2] * g * cov;
    }
  }
  return [cx, cy - h * s * 0.55, s];
}
/** Steam: wisps rising from (sx, sy) on screen, curling as they go. */
export function drawSteam(sx, sy, s, t, dim, noise2) {
  const hgt = 30, wid = 9 * s + 4;
  for (let py = Math.max(0, Math.floor(sy - hgt)); py < Math.min(H, sy); py++) {
    const up = (sy - py) / hgt;                               // 0 at the cup, 1 at the top
    const spread = wid * (0.5 + up);
    for (let px = Math.max(0, Math.floor(sx - spread)); px <= Math.min(W - 1, Math.ceil(sx + spread)); px++) {
      const q = (px - sx) / spread;
      const n = noise2((px - sx) * 0.22 + 3 * Math.sin(t * 0.7 + up * 3), (sy - py) * 0.16 - t * 1.1);
      const curl = Math.sin((px - sx) * 0.5 + up * 6 - t * 1.7) * 0.5 + 0.5;
      let a = (n * 0.75 + 0.25 * curl - 0.45) * 2.2; if (a <= 0) continue;
      a *= (1 - q * q) * Math.sin(Math.PI * Math.min(1, up * 1.15)) * (1 - up) * 0.3 * dim;
      if (a <= 0) continue;
      const o = 3 * (py * W + px);
      img[o] += a * 0.9; img[o + 1] += a * 0.92; img[o + 2] += a;
    }
  }
}
