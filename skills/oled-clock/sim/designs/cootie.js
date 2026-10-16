// Cootie — prototype geometry.
import { clamp, ease, progress, font3x5 } from '../js/kit.js';
const LABELS = [];

const W = 128, H = 64;
const R2 = Math.SQRT2;

// paper: square [-1,1]^2. pockets k: 0 NE 1 NW 2 SW 3 SE; seams j between k and k+1: 0 N 1 W 2 S 3 E
const DIAG = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const SEAM = [[0, 1], [-1, 0], [0, -1], [1, 0]];
// faces: [pocket, seam]
const FACES = [];
for (let k = 0; k < 4; k++) { FACES.push([k, k]); FACES.push([k, (k + 3) % 4]); }

// camera
const EL = 0.62, CE = Math.cos(EL), SE = Math.sin(EL);
const DIST = 6, FOC = 260, CX = 64, CY = 34, TZ = 0.7;

function midOf(a, b, s, out) {
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cc = Math.max(0, c);
  const al = 1 / (2 + cc);
  let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
  let l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) { nx = s[0]; ny = s[1]; nz = 0; l = 1; }
  if (nx * s[0] + ny * s[1] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const gm = Math.sqrt(cc / (2 + cc)) / l;
  out[0] = al * (a[0] + b[0]) + gm * nx; out[1] = al * (a[1] + b[1]) + gm * ny; out[2] = al * (a[2] + b[2]) + gm * nz;
}

/** tips from horizontal offsets h[k] = [x,y] and unfold u. */
function tipsFrom(h, u) {
  return h.map(([x, y], k) => {
    let th = Math.atan(Math.hypot(x, y)), ps = Math.atan2(y, x);
    const dps = Math.atan2(DIAG[k][1], DIAG[k][0]);
    let d = dps - ps; d = Math.atan2(Math.sin(d), Math.cos(d));
    ps += d * u; th += (Math.PI / 2 - th) * u;
    return [R2 * Math.sin(th) * Math.cos(ps), R2 * Math.sin(th) * Math.sin(ps), R2 * Math.cos(th)];
  });
}

function pose(mode, a, u) {
  const e = 0.08, T = 0.75;
  const h = DIAG.map(([dx, dy]) => {
    const px = mode === 1 ? 0 : dx, py = mode === 1 ? dy : 0;
    return [e * dx + a * T * px, e * dy + a * T * py];
  });
  const C = tipsFrom(h, u);
  const M = SEAM.map((s, j) => { const o = [0, 0, 0]; midOf(C[j], C[(j + 1) % 4], s, o); return o; });
  return { C, M };
}

const ZB = new Float32Array(W * H), FID = new Int8Array(W * H), PU = new Float32Array(W * H), PV = new Float32Array(W * H);
const LIGHT = (() => { const v = [-0.35, -0.75, 0.6]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

function project(p, rot, out) {
  // rot: world transform applied (3x3) then translation
  const x = p[0], y = p[1], z = p[2] - TZ;
  const X = x, Y = y * SE + z * CE, Z = DIST + y * CE - z * SE;
  out[0] = CX + (FOC * X) / Z; out[1] = CY - (FOC * Y) / Z; out[2] = Z;
}

function render(g, P) {
  ZB.fill(1e9); FID.fill(-1); LABELS.length = 0;
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const lev = [];
  FACES.forEach(([k, j], f) => {
    const V = [[0, 0, 0], P.C[k], P.M[j]];
    const UV = [[0, 0], DIAG[k], SEAM[j]];
    V.forEach((v, i) => project(v, null, S[i]));
    // normal (inner side)
    const ax = V[1][0], ay = V[1][1], az = V[1][2], bx = V[2][0], by = V[2][1], bz = V[2][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const sp = Math.sign(UV[1][0] * UV[2][1] - UV[1][1] * UV[2][0]);
    nx *= sp; ny *= sp; nz *= sp;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    // which side faces camera: camera dir from point
    const cam = [0, -CE * DIST, SE * DIST + TZ];
    const cx = (V[0][0] + V[1][0] + V[2][0]) / 3, cy = (V[0][1] + V[1][1] + V[2][1]) / 3, cz = (V[0][2] + V[1][2] + V[2][2]) / 3;
    const inner = (cam[0] - cx) * nx + (cam[1] - cy) * ny + (cam[2] - cz) * nz > 0;
    const sgn = inner ? 1 : -1;
    const b = sgn * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    lev[f * 2 + (inner ? 0 : 1)] = b;
    rasterTri(S, UV, f * 2 + (inner ? 0 : 1));
    LABELS.push([(S[0][0]+S[1][0]+S[2][0])/3, (S[0][1]+S[1][1]+S[2][1])/3, f + (inner ? 'i' : 'o')]);
  });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = FID[i];
      if (id < 0) continue;
      const b = lev[id];
      let on = b > 0.55 ? 1 : b > 0.2 ? ((x + y) & 1) : 0;
      let edge = false, bg = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx, nid = FID[n];
        if (nid < 0) bg = true;
        else if (nid !== id && ZB[n] >= ZB[i]) edge = true;
      }
      if (bg) on = 1; else if (edge) on = b > 0.55 ? 0 : 1;
      if (on) g.pixel(x, y);
    }
  if (DEBUG) for (const [x, y, s] of LABELS) { const i = Math.floor(y) * W + Math.floor(x); g.fillRect(x - 4, y - 3, 9, 7, 0); g.text(s, x - 3, y - 2, { font: font3x5 }); }
}
let DEBUG = 1;

function rasterTri(S, UV, id) {
  const [a, b, c] = S;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(den) < 1e-6) return;
  const iza = 1 / a[2], izb = 1 / b[2], izc = 1 / c[2];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const iz = w0 * iza + w1 * izb + w2 * izc, z = 1 / iz;
      const i = y * W + x;
      if (z >= ZB[i]) continue;
      ZB[i] = z; FID[i] = id;
      PU[i] = (w0 * iza * UV[0][0] + w1 * izb * UV[1][0] + w2 * izc * UV[2][0]) * z;
      PV[i] = (w0 * iza * UV[0][1] + w1 * izb * UV[1][1] + w2 * izc * UV[2][1]) * z;
    }
}

export default {
  name: 'Cootie',
  blurb: 'Prototype.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, { t }) {
    const mode = t < 1 ? 2 : 1;
    render(g, pose(mode, 0.7, 0));
  },
};
