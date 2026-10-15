// Wayang: the gunungan (kayon), the tree-of-life puppet that opens and
// closes every scene. A tall pointed leaf of leather: a border punched with a
// row of holes, the tree's trunk rising from a gate, its branches curling out
// as lines of holes, two lines of flame-holes up the shoulders, and the gate
// at the foot with its two doors. Built at load into a distance table and a
// paint map, like the digits (flash, ~5.6 KB).

import { M } from './wayang-glyphs.js';

export const GWID = 38, GHGT = 62;
export const GTW = GWID + 2 * M, GTH = GHGT + 2 * M;
const Q = 4;

/** Half width of the leaf at height v (0 = foot, 1 = tip). */
function half(v) {
  if (v <= 0 || v >= 1) return 0;
  return 19 * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * v)), 0.72) * (1 - 0.15 * v);
}

const W4 = GTW * 4, H4 = GTH * 4;
const a = new Uint8Array(W4 * H4);
const set = (gx, gy, r, v) => {
  const cx = (gx + M) * 4, cy = (gy + M) * 4, R = r * 4;
  for (let j = Math.max(0, Math.floor(cy - R - 1)); j <= Math.min(H4 - 1, Math.ceil(cy + R + 1)); j++)
    for (let i = Math.max(0, Math.floor(cx - R - 1)); i <= Math.min(W4 - 1, Math.ceil(cx + R + 1)); i++)
      if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= R * R) a[j * W4 + i] = v;
};
const CX = GWID / 2;
// the leaf: the tip slightly curled to one side, as carved
for (let j = 0; j < H4; j++) {
  const gy = (j + 0.5) / 4 - M, v = 1 - gy / (GHGT - 9);
  const hw = half(v), lean = 1.6 * Math.pow(Math.max(0, v - 0.6) / 0.4, 2);
  for (let i = 0; i < W4; i++) {
    const gx = (i + 0.5) / 4 - M;
    if (Math.abs(gx - CX - lean) <= hw) a[j * W4 + i] = 1;
  }
}
// the gate at the foot: a stepped roof, a block, the base
const box = (x0, y0, x1, y1, v) => {
  for (let j = Math.max(0, Math.floor((y0 + M) * 4)); j < Math.min(H4, Math.ceil((y1 + M) * 4)); j++)
    for (let i = Math.max(0, Math.floor((x0 + M) * 4)); i < Math.min(W4, Math.ceil((x1 + M) * 4)); i++) a[j * W4 + i] = v;
};
box(CX - 13, GHGT - 4, CX + 13, GHGT, 1);       // the base
box(CX - 9, GHGT - 15, CX + 9, GHGT - 4, 1);    // the gate house
box(CX - 11, GHGT - 17, CX + 11, GHGT - 15, 1); // the roof
box(CX - 7, GHGT - 19, CX + 7, GHGT - 17, 1);

// the holes
const holes = [];
// the border: a row of holes just inside the outline
for (let v = 0.06; v < 0.93; v += 0.001) {
  const gy = (1 - v) * (GHGT - 9), hw = half(v) - 3.4, lean = 1.6 * Math.pow(Math.max(0, v - 0.6) / 0.4, 2);
  if (hw < 2) continue;
  for (const sd of [-1, 1]) {
    const x = CX + lean + sd * hw;
    if (holes.every(([hx, hy]) => (hx - x) ** 2 + (hy - gy) ** 2 >= 3.9 * 3.9)) holes.push([x, gy, 1]);
  }
}
// the branches: curling lines of holes out of the trunk, five pairs
for (let k = 0; k < 5; k++) {
  const y0 = GHGT - 22 - k * 7.4, len = 9 - k * 1.1;
  for (const sd of [-1, 1]) {
    for (let u = 0.15; u <= 1; u += 0.02) {
      const ang = (u * 1.5 + 0.2) * (k % 2 ? 1 : 0.85);
      const x = CX + sd * (2.6 + u * len * Math.cos(ang * 0.6)), y = y0 - u * len * 0.55 - Math.sin(u * 3) * 1.4;
      if (half(1 - y / (GHGT - 9)) - Math.abs(x - CX) < 5.5) continue;
      if (holes.every(([hx, hy]) => (hx - x) ** 2 + (hy - y) ** 2 >= 3.6 * 3.6)) holes.push([x, y, 2]);
    }
  }
}
for (const [x, y] of holes) set(x, y, 1.1, 0);
// the gate's two doors, and the slit windows in the roof
box(CX - 6, GHGT - 12, CX - 2, GHGT - 5, 0);
box(CX + 2, GHGT - 12, CX + 6, GHGT - 5, 0);
for (const x of [-8, -4, 0, 4, 8]) set(CX + x, GHGT - 16, 0.8, 0);

// distance (brute force at the 1x pixel centres from the 4x mask: load time only)
function dist(on) {
  const out = new Float32Array(GTW * GTH).fill(1e9);
  const pts = [];
  for (let j = 0; j < H4; j++) for (let i = 0; i < W4; i++) {
    const v = a[j * W4 + i];
    // a boundary cell: its state differs from a neighbour
    if ((i > 0 && a[j * W4 + i - 1] !== v) || (j > 0 && a[(j - 1) * W4 + i] !== v)) pts.push((i + 0.5) / 4, (j + 0.5) / 4);
  }
  for (let y = 0; y < GTH; y++) for (let x = 0; x < GTW; x++) {
    let best = 1e9;
    const cx = x + 0.5, cy = y + 0.5;
    for (let k = 0; k < pts.length; k += 2) {
      const dx = pts[k] - cx, dy = pts[k + 1] - cy, d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    out[y * GTW + x] = Math.sqrt(best);
  }
  return out;
}
const dd = dist();
export const GSDF = new Int8Array(GTW * GTH);
export const GPAINT = new Uint8Array(GTW * GTH);
for (let y = 0; y < GTH; y++) for (let x = 0; x < GTW; x++) {
  const inside = a[(y * 4 + 2) * W4 + x * 4 + 2];
  const d = dd[y * GTW + x];
  GSDF[y * GTW + x] = Math.max(-127, Math.min(127, Math.round((inside ? -d : d) * Q)));
  // paint: red flames round the rim, a green-blue crown of leaves, the gold tree and gate
  const gx = x - M + 0.5, gy = y - M + 0.5, v = 1 - gy / (GHGT - 9);
  const rim = half(v) - Math.abs(gx - CX);
  GPAINT[y * GTW + x] = !inside ? 0 : gy > GHGT - 20 ? 1 : rim < 5 ? 2 : Math.abs(gx - CX) < 2.6 ? 1 : 3;
}
