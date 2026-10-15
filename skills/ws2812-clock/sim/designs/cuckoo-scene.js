// Cuckoo scene: the carved case, built once as a height field with an albedo
// (at 2x, then shaded under a raking lamp from the upper left and averaged
// down), so roof, fretwork leaves, mouldings and the bird finial all share
// one light. Plus the small raster helpers the moving parts draw with.
import * as kit from '../js/kit.js';

export const W = 64, H = 128;
export const img = new Float32Array(3 * W * H);

// ---------------------------------------------------------------- palette
export const P = {
  roof: kit.hex('#3c1f0e'), roofEdge: kit.hex('#5a3216'),
  wall: kit.hex('#6e4222'), case: kit.hex('#5b3419'), frame: kit.hex('#8a5a2c'),
  lime: kit.hex('#c49660'), leaf: kit.hex('#a08a44'), acorn: kit.hex('#b0702c'),
  recess: kit.hex('#1c0d06'), door: kit.hex('#7a4a24'), doorIn: kit.hex('#070302'),
  ivory: kit.hex('#fff0cc'), ivoryShade: kit.hex('#a2743a'), brass: kit.hex('#e0a848'),
};
export const LIGHT = (() => { const v = [-0.5, -0.62, 0.6], n = Math.hypot(...v); return v.map((x) => x / n); })();

// ------------------------------------------------------- height field (2x)
const SS = 2, SW = W * SS, SH = H * SS;
const hgt = new Float32Array(SW * SH), alb = new Float32Array(3 * SW * SH), msk = new Uint8Array(SW * SH);

function put(x, y, h, c, mode) {
  const p = y * SW + x;
  if (mode === 'add') hgt[p] += h; else if (mode === 'max') { if (h <= hgt[p] && msk[p]) return; hgt[p] = h; } else hgt[p] = h;
  if (c) { alb[3 * p] = c[0]; alb[3 * p + 1] = c[1]; alb[3 * p + 2] = c[2]; }
  msk[p] = 1;
}
/** Fill where inside(x, y) (px coords) is true. hf(x, y) gives the height. */
function region(x0, y0, x1, y1, inside, hf, c, mode = 'set') {
  for (let sy = Math.max(0, Math.floor(y0 * SS)); sy < Math.min(SH, Math.ceil(y1 * SS)); sy++) {
    for (let sx = Math.max(0, Math.floor(x0 * SS)); sx < Math.min(SW, Math.ceil(x1 * SS)); sx++) {
      const x = (sx + 0.5) / SS, y = (sy + 0.5) / SS;
      if (!inside(x, y)) continue;
      const cc = typeof c === 'function' ? c(x, y) : c;
      put(sx, sy, hf(x, y), cc, mode);
    }
  }
}
/** A carved leaf: pointed ellipse along angle a, domed, with a midrib groove. */
function leaf(cx, cy, a, len, wid, ht = 1.6, c = P.leaf) {
  const ca = Math.cos(a), sa = Math.sin(a), R = len + wid;
  region(cx - R, cy - R, cx + R, cy + R, (x, y) => {
    const u = ((x - cx) * ca + (y - cy) * sa) / len, v = (-(x - cx) * sa + (y - cy) * ca);
    if (u < -1 || u > 1) return false;
    const hw = wid * Math.pow(1 - u * u, 0.75) * (1 + 0.25 * Math.sin(u * 9));   // lobed edge
    return Math.abs(v) < hw;
  }, (x, y) => {
    const u = ((x - cx) * ca + (y - cy) * sa) / len, v = (-(x - cx) * sa + (y - cy) * ca);
    const hw = Math.max(0.3, wid * Math.pow(1 - u * u, 0.75));
    const dome = Math.sqrt(Math.max(0, 1 - (v / hw) ** 2)) * (1 - 0.4 * u * u);
    return 2.2 + ht * dome - 0.7 * Math.exp(-((v / 0.45) ** 2));
  }, c, 'max');
}
function disc(cx, cy, r, ht, c, base = 2) {
  region(cx - r, cy - r, cx + r, cy + r, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r,
    (x, y) => base + ht * Math.sqrt(Math.max(0, 1 - ((x - cx) ** 2 + (y - cy) ** 2) / (r * r))), c, 'max');
}
const grain = (c, x, y, k = 0.22, sx = 0.35, sy = 0.05) => {
  const g = 1 + k * (kit.fbm(x * sx, y * sy, 3, 3) - 0.5) * 2;
  return [c[0] * g, c[1] * g, c[2] * g];
};

// ------------------------------------------------------------- geometry
export const ROOF = { apex: 7, slope: 0.7, th: 5 };
export const roofY = (x) => ROOF.apex + Math.abs(x - 32) * ROOF.slope;
export const DOOR = { cx: 32, top: 15, bot: 32, hw: 6.5 };
export const CASE = { x0: 5, x1: 59, y0: 33, y1: 75 };
export const PLAQ = [{ cx: 21.5, cy: 52 }, { cx: 42.5, cy: 52 }];
export const PLAQ_HW = 9.5, PLAQ_HH = 14;
export const PIVOT = { x: 32, y: 74 };
export const CHAIN_X = [9.5, 54.5];
export const ESC = { x: 32, y: 70.3, r: 3.6 };

function build() {
  // gable wall: vertical boards
  region(4, 8, 60, CASE.y0 + 1, (x, y) => y > roofY(x) + 2, (x, y) => 0.6 - (x % 6 < 0.6 ? 0.6 : 0),
    (x, y) => grain(P.wall, x, y, 0.25, 0.08, 0.6));
  // door frame: raised arch moulding, dark doorway
  const { cx, top, bot, hw } = DOOR, ar = hw, ay = top + ar;
  const inDoor = (x, y, g) => (y >= ay ? Math.abs(x - cx) < hw + g && y < bot + g * 0.2 : Math.hypot(x - cx, y - ay) < ar + g);
  region(cx - hw - 3, top - 3, cx + hw + 3, bot + 1, (x, y) => inDoor(x, y, 1.6) && !inDoor(x, y, 0), (x, y) => 1.8, P.frame);
  region(cx - hw, top, cx + hw, bot, (x, y) => inDoor(x, y, 0), () => -1, P.doorIn);
  // case body with a raised frame moulding
  const { x0, x1, y0, y1 } = CASE;
  region(x0, y0, x1, y1, () => true, () => 0.8, (x, y) => grain(P.case, x, y, 0.3, 0.06, 0.5));
  region(x0, y0, x1, y1, (x, y) => Math.min(x - x0, x1 - x, y - y0, y1 - y) < 2.6, (x, y) => {
    const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);
    return 0.8 + 1.6 * Math.sin(Math.PI * Math.min(1, d / 2.6));
  }, (x, y) => grain(P.frame, x, y, 0.2, 0.3, 0.3));
  // plaque recesses
  for (const q of PLAQ) {
    region(q.cx - PLAQ_HW - 2, q.cy - PLAQ_HH - 2, q.cx + PLAQ_HW + 2, q.cy + PLAQ_HH + 2,
      (x, y) => Math.abs(x - q.cx) < PLAQ_HW + 1.8 && Math.abs(y - q.cy) < PLAQ_HH + 1.8, (x, y) => {
        const d = Math.max(Math.abs(x - q.cx) - PLAQ_HW, Math.abs(y - q.cy) - PLAQ_HH);
        return d > 0 ? 0.8 + 1.4 * (1 - d / 1.8) : -1.2;
      }, (x, y) => (Math.max(Math.abs(x - q.cx) - PLAQ_HW, Math.abs(y - q.cy) - PLAQ_HH) > 0 ? P.frame : P.recess));
  }
  // garland between plaques and the case foot
  for (let k = 0; k < 9; k++) {
    if (k === 4) continue;                              // the escapement window
    const x = 9.5 + k * 5.6, up = k % 2;
    leaf(x, 70.2 + (up ? -0.4 : 0.4), up ? -0.5 : 0.5, 2.8, 1.25, 1.1, P.lime);
  }
  // escapement window: a brass-ringed porthole
  region(26, 65, 38, 76, (x, y) => Math.hypot(x - ESC.x, y - ESC.y) < ESC.r + 1.4, (x, y) => {
    const d = Math.hypot(x - ESC.x, y - ESC.y);
    return d < ESC.r ? -1.5 : 1.2 + Math.sin(Math.PI * (d - ESC.r) / 1.4);
  }, (x, y) => (Math.hypot(x - ESC.x, y - ESC.y) < ESC.r ? P.doorIn : P.brass));
  // roof planks, with a carved edge and scalloped shingle ends
  region(-1, 0, 65, 40, (x, y) => y >= roofY(x) - 0.2 && y < roofY(x) + ROOF.th, (x, y) => {
    const d = y - roofY(x);
    return 3 + 1.4 * Math.sin(Math.PI * d / ROOF.th) - (d > 1.4 && d < 1.9 ? 0.9 : 0);
  }, (x, y) => grain(P.roof, x, y, 0.3, 0.2, 0.2));
  // fretwork leaves hanging under the roof edge (the bargeboard)
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const x = 32 + side * (5.2 + k * 4.6), y = roofY(x) + ROOF.th + 1.6;
      if (x < 1 || x > 63) continue;
      leaf(x, y, Math.PI / 2 + side * 0.25 * (k % 2 ? 1 : -1), 2.6, 1.3, 1.3, k % 2 ? P.lime : P.leaf);
    }
  }
  // oak sprays and acorns at the case's top corners
  for (const side of [-1, 1]) {
    const bx = 32 + side * 27, by = CASE.y0 + 1.5;
    leaf(bx - side * 1.5, by - 1, side > 0 ? -0.9 : Math.PI + 0.9, 4.2, 1.9, 1.6, P.leaf);
    leaf(bx + side * 0.5, by + 3.5, side > 0 ? 1.2 : Math.PI - 1.2, 3.8, 1.7, 1.5, P.lime);
    disc(bx - side * 2.4, by + 2.4, 1.5, 1.4, P.acorn, 3);
  }
  // skirt: hanging leaves under the case, a big central cluster round the pivot
  for (let k = 0; k < 8; k++) {
    const x = 10 + k * 6.3; if (Math.abs(x - 32) < 5) continue;
    leaf(x, CASE.y1 + 2.4, Math.PI / 2 + (x < 32 ? 0.35 : -0.35), 3.6, 1.6, 1.4, k % 2 ? P.leaf : P.lime);
  }
  leaf(28.5, CASE.y1 + 1.5, Math.PI / 2 + 0.9, 4.4, 2.0, 1.7, P.leaf);
  leaf(35.5, CASE.y1 + 1.5, Math.PI / 2 - 0.9, 4.4, 2.0, 1.7, P.leaf);
  leaf(32, CASE.y1 + 3.2, Math.PI / 2, 4.6, 2.2, 1.8, P.lime);
  // bird finial on the ridge: body, raised wings, tail, head with beak
  leaf(32, 3.6, 0, 4.2, 2.1, 1.8, P.lime);               // body
  leaf(26.6, 5.0, Math.PI + 0.25, 2.6, 1.0, 1.2, P.lime); // tail
  disc(36.4, 2.7, 1.7, 1.3, P.lime, 3.4);                 // head
  leaf(38.8, 3.0, 0.15, 1.2, 0.55, 0.8, P.acorn);          // beak
}

// shading: normals from the height field, raking light + soft occlusion
export const STATIC = new Float32Array(3 * W * H);
export const SOLID = new Uint8Array(W * H);   // where the case is (for shadows)
export const SH_H = new Float32Array(W * H);  // height at 1x (for cast shadows of moving parts)
function shade() {
  const [lx, ly, lz] = LIGHT;
  for (let sy = 0; sy < SH; sy++) {
    for (let sx = 0; sx < SW; sx++) {
      const p = sy * SW + sx;
      if (!msk[p]) continue;
      const hL = hgt[sy * SW + Math.max(0, sx - 1)], hR = hgt[sy * SW + Math.min(SW - 1, sx + 1)];
      const hU = hgt[Math.max(0, sy - 1) * SW + sx], hD = hgt[Math.min(SH - 1, sy + 1) * SW + sx];
      const nx = -(hR - hL) * SS * 0.5, ny = -(hD - hU) * SS * 0.5, nl = Math.hypot(nx, ny, 1);
      const dif = Math.max(0, (nx * lx + ny * ly + lz) / nl);
      // occlusion: lower than the neighbourhood -> darker
      let s = 0, n = 0;
      for (let k = -4; k <= 4; k += 2) for (let j = -4; j <= 4; j += 2) {
        const yy = sy + k, xx = sx + j;
        if (yy < 0 || xx < 0 || yy >= SH || xx >= SW) continue;
        s += msk[yy * SW + xx] ? hgt[yy * SW + xx] : -2; n++;
      }
      const ao = kit.clamp(1 - 0.28 * (s / n - hgt[p]), 0.35, 1.15);
      // cast shadow toward lower right: is something higher up-left?
      let sh = 1;
      for (let k = 1; k <= 6; k++) {
        const xx = sx - k, yy = sy - Math.round(k * 1.25);
        if (xx < 0 || yy < 0) break;
        if (msk[yy * SW + xx] && hgt[yy * SW + xx] > hgt[p] + k * 0.32) { sh = 0.55; break; }
      }
      // the lamp: a warm pool from the upper left
      const x = sx / SS, y = sy / SS;
      const pool = 0.55 + 0.6 / (1 + ((x - 14) ** 2 + (y - 30) ** 2) / 2600);
      const L = 1.15 * (0.1 + 1.1 * Math.pow(dif, 1.8)) * ao * sh * pool;
      const o = 3 * ((y | 0) * W + (x | 0)), q = 1 / (SS * SS);
      STATIC[o] += alb[3 * p] * L * q; STATIC[o + 1] += alb[3 * p + 1] * L * q; STATIC[o + 2] += alb[3 * p + 2] * L * q;
      SOLID[(y | 0) * W + (x | 0)] = 1;
      SH_H[(y | 0) * W + (x | 0)] += hgt[p] * q;
    }
  }
}
build();
shade();

// ------------------------------------------------------------ helpers
/** Alpha-over one pixel (linear). */
export function over(x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const o = 3 * (y * W + x);
  if (a >= 1) { img[o] = r; img[o + 1] = g; img[o + 2] = b; return; }
  img[o] += (r - img[o]) * a; img[o + 1] += (g - img[o + 1]) * a; img[o + 2] += (b - img[o + 2]) * a;
}
export function mul(x, y, k) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = 3 * (y * W + x); img[o] *= k; img[o + 1] *= k; img[o + 2] *= k;
}
export function add(x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = 3 * (y * W + x); img[o] += r * a; img[o + 1] += g * a; img[o + 2] += b * a;
}
