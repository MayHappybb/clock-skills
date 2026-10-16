// Ropework — work in progress.
import { clamp, clockFields, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ camera
const DZ = 200;
let EX = 64, EY = 22;
function project(x, y, z) { const k = DZ / (z + DZ); return [EX + (x - EX) * k, EY + (y - EY) * k, k]; }
const L = (() => { const v = [-0.55, -0.7, -0.45], l = Math.hypot(...v); return v.map((c) => c / l); })();

// ------------------------------------------------------------ buffers
let BW = 0, BH = 0, ZB, SB, UB, RB, NB;
function buffers(w, h) {
  if (w !== BW || h !== BH) {
    BW = w; BH = h;
    ZB = new Float32Array(w * h); SB = new Float32Array(w * h); UB = new Float32Array(w * h);
    RB = new Int16Array(w * h); NB = new Float32Array(w * h);
  }
  ZB.fill(1e9); RB.fill(-1);
}

// Rasterise a tube given world points (flat array x,y,z,...) spaced `ds` apart.
// mat 0 = laid rope, 1 = wood.
function tube(P, n, R, id, s0 = 0, ds = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1);
    const [ax, ay] = project(P[j0 * 3], P[j0 * 3 + 1], P[j0 * 3 + 2]);
    const [bx, by] = project(P[j1 * 3], P[j1 * 3 + 1], P[j1 * 3 + 2]);
    let tx = bx - ax, ty = by - ay; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const [sx, sy, k] = project(x, y, z);
    const r = R * k, r2 = r * r;
    const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(BW - 1, Math.floor(sx + r));
    const y0 = Math.max(0, Math.floor(sy - r)), y1 = Math.min(BH - 1, Math.floor(sy + r));
    const s = s0 + i * ds;
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - sy;
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - sx, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const along = dx * tx + dy * ty, perp = -dx * ty + dy * tx;
        const w = Math.sqrt(1 - d2 / r2);
        const depth = z - R * w;
        const o = py * BW + px;
        if (depth >= ZB[o]) continue;
        ZB[o] = depth; RB[o] = id; SB[o] = s + along / k; UB[o] = perp / r;
        // diffuse on the tube's cross-section (normal ignores the along part)
        const u = perp / r, c = Math.sqrt(Math.max(0, 1 - u * u));
        const nx = -ty * u, ny = tx * u, nz = -c;
        NB[o] = nx * L[0] + ny * L[1] + nz * L[2];
      }
    }
  }
}

const LAY = 9;   // length of one full turn of the three strands
function shadePass(g, ids) {
  const buf = g.buf;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const o = y * BW + x, id = RB[o];
    if (id < 0) continue;
    const d = ZB[o], s = SB[o];
    // a nearer, unrelated surface right next to this pixel: cut a gap
    let gap = false;
    for (let k = 0; k < 8 && !gap; k++) {
      const nx = x + NX[k], ny = y + NY[k];
      if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
      const q = ny * BW + nx;
      if (RB[q] < 0) continue;
      if (ZB[q] < d - 1.6 && (RB[q] !== id || Math.abs(SB[q] - s) > 9)) gap = true;
    }
    if (gap) continue;
    const mat = ids[id] ?? 0, lit = NB[o];
    let on;
    if (mat === 1) {
      on = lit > -0.15 && !(UB[o] > 0.35 && UB[o] < 0.62);
    } else {
      const th = Math.asin(clamp(UB[o], -1, 1));
      let f = (3 * (s / LAY + th / TAU)) % 1; if (f < 0) f += 1;
      const groove = f < 0.2 + 0.25 * clamp(-lit, 0, 1);
      on = !groove && lit > -0.35;
    }
    if (on) buf[o] = 1;
  }
}
const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1];

// ------------------------------------------------------------ digits
// Centre-lines in a 20 x 34 box (rope radius 2.7), z > 0 away from the eye.
// Crossings get +-2.5 in z so the rope really passes over and under itself.
const SPEC = {
  0: [[13.5, 1.2, 2], [9, 3.4, 2.6], [4.5, 8, 1], [2.7, 15, 0], [3, 24, 0], [6, 30.4, 0], [10, 31.6, 0], [14, 30.4, 0],
      [17, 24, 0], [17.3, 15, 0], [16, 7.5, 0], [12.5, 3.4, -1.6], [8.5, 2, -2.6], [5.5, 1.8, -1.5]],
  1: [[12.4, 2.2, 0], [9.5, 4.6, 0], [6.2, 8, 0], [5.4, 10, 2.4], [7.2, 9.6, 4.8], [10.2, 6.8, 5.2], [12.4, 5.5, 4],
      [12.5, 11, 1.5], [12.4, 19, 0], [12.4, 31.6, 0]],
  2: [[3, 10, 0], [4.4, 4.8, 0], [10, 2.7, 0], [15.4, 4.6, 0], [17.2, 9.6, 0], [16, 15, 0], [11.6, 20.4, 0], [6.5, 25.6, 0],
      [3.4, 29.6, 0], [5, 31.4, 0], [10, 31.5, 0], [17.5, 31.3, 0]],
  3: [[2.9, 6.8, 0], [6, 3.4, 0], [11, 2.7, 0], [15.6, 4.6, 0], [16.8, 9.5, 0], [14.5, 14.2, -1], [10.5, 16, -2.6],
      [6.6, 15.4, -1.2], [5.6, 17.8, 1], [8, 19.3, 2.6], [11.5, 16.4, 1], [15.5, 19.6, 0], [17.3, 25, 0], [15.4, 29.9, 0],
      [10, 31.6, 0], [5, 30.6, 0], [2.5, 27.2, 0]],
  4: [[13.5, 2.6, -1], [9.5, 8.5, 0], [5.5, 14.6, 0], [2.7, 21.6, 0], [6, 22.6, -1], [11.5, 22.8, -2.6], [16, 22.6, -1],
      [17.6, 22.6, 0], [15, 24, 0], [13.6, 27.5, 0], [13.5, 31.4, 0], [13.6, 33.5, 2.6], [13.6, 31, 5.2],
      [13.6, 22, 4.6], [13.5, 12, 2.6], [13.5, 4.6, 1.2], [13.5, 1.0, 1.4]],
  5: [[17.4, 2.9, 0], [11, 2.7, 0], [4.4, 2.9, 0], [3.5, 8, 0], [3.2, 14.6, 0], [8, 13.4, 0], [14.2, 14.6, 0],
      [17.3, 21, 0], [16.2, 28.4, 0], [10.6, 31.6, 0], [5, 30.6, 0], [2.4, 27.4, 0]],
  6: [[16, 4.6, 0], [11, 2.7, 0], [6, 4, 0], [3.2, 10, 0], [2.7, 18, 0], [3.4, 26, 0], [7, 31, 0], [12.5, 31.4, 0],
      [16.8, 27, 0], [17, 21, 0], [13.6, 16.8, 0], [8, 17, 0], [4.6, 20.2, -2.6], [2.4, 23.4, -1.2]],
  7: [[2.6, 7.4, 0], [3, 3, 0], [10, 2.7, 0], [15.6, 2.9, -1.6], [19.2, 1.4, -1.6], [19.6, -1.2, 0], [17.4, -1.0, 1.6],
      [16, 3.2, 2.6], [14, 9, 1], [11.4, 16, 0], [9.4, 23, 0], [8.6, 31.6, 0]],
  8: [[10, 2.7, -1], [15.4, 4.4, 0], [16.6, 10, 0], [13.2, 14.8, 1], [10, 17, 2.6], [5.2, 19.8, 1], [2.7, 25, 0],
      [5, 30.4, 0], [10, 31.6, 0], [15, 30.4, 0], [17.3, 25, 0], [14.8, 19.8, -1], [10, 17, -2.6], [6.8, 14.8, -1],
      [3.4, 10, 0], [4.6, 4.4, 0], [9, 2.4, 1.5], [12.5, 2.6, 2.8]],
  9: [[12, 2.7, 0], [7, 3, 0], [3.4, 6.4, 0], [2.7, 11.5, 0], [5, 16, 0], [10, 17.4, 0], [14.6, 15.2, -1.2],
      [17, 10.5, -2.6], [18.2, 5, -1.6], [16.8, 1.4, 0], [14.6, 3.6, 1.6], [16.4, 8, 2.6], [17.3, 14, 1], [17, 22, 0],
      [15, 28.6, 0], [10.5, 31.6, 0], [5.5, 30.8, 0], [2.6, 27.6, 0]],
};

// Catmull-Rom through the control points, resampled to equal arc length.
const DS = 0.5;
function resample(cp) {
  const dense = [];
  for (let i = 0; i < cp.length - 1; i++) {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t +
        (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  dense.push(cp[cp.length - 1].slice());
  const out = [dense[0]]; let acc = 0, need = DS;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (acc + l >= need) {
      const u = (need - acc) / l;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
      need += DS;
    }
    acc += l;
  }
  const P = new Float32Array(out.length * 3);
  out.forEach((p, i) => { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; });
  return P;
}
const DIG = {};
for (const k in SPEC) DIG[k] = resample(SPEC[k]);

const RR = 2.7;
const LEN = {};
for (const k in DIG) LEN[k] = (DIG[k].length / 3 - 1) * DS;

// ------------------------------------------------------------ the world
// Screen-pixel world on z = 0; a slot is one hanging rope: block on the spar,
// a lead down to where the numeral starts, then the numeral.
const SLOTS = [
  { bx: 17, by: 8, z: -6, ox: 17, oy: 14, sc: 1.18 },
  { bx: 45, by: 8, z: -2, ox: 45, oy: 14, sc: 1.18 },
  { bx: 83, by: 8, z: 46, ox: 83, oy: 27, sc: 1.08 },
  { bx: 109, by: 8, z: 54, ox: 109, oy: 27, sc: 1.08 },
];
let CYAW = 0, CX = 64, CZ = 30;
function cam(x, y, z) {
  const c = Math.cos(CYAW), s = Math.sin(CYAW), dx = x - CX, dz = z - CZ;
  return [CX + dx * c - dz * s, y, CZ + dx * s + dz * c];
}

// Build the rope for slot k showing digit d, `vis` world units of it out of
// the block, the strands shifted by `slide`. Returns flat points.
const TMP = new Float32Array(3 * 1200);
function slotRope(k, d, vis, phi, psi, endWag) {
  const S = SLOTS[k], sc = S.sc, P = DIG[d], n = P.length / 3;
  const cp = Math.cos(phi), sp = Math.sin(phi), cy = Math.cos(psi), sy = Math.sin(psi);
  const xf = (lx, ly, lz) => {
    // local numeral box (centred on x) -> twist about the vertical through the block -> swing about the block
    const X = (lx - 10) * sc, Y = ly * sc, Z = lz * sc;
    const xr = X * cy - Z * sy, zr = X * sy + Z * cy;
    const wx = S.ox - S.bx + xr, wy = S.oy - S.by + Y;
    return cam(S.bx + wx * cp - wy * sp, S.by + wx * sp + wy * cp, S.z + zr);
  };
  let m = 0;
  const push = (q) => { TMP[m * 3] = q[0]; TMP[m * 3 + 1] = q[1]; TMP[m * 3 + 2] = q[2]; m++; };
  // lead: block (local) to the numeral's first point
  const st = [P[0], P[1], P[2]];
  const bl = [10 + (S.bx - S.ox) / sc, (S.by + 2 - S.oy) / sc, 0];
  const ll = Math.hypot(st[0] - bl[0], st[1] - bl[1]) * sc;
  const nl = Math.max(1, Math.round(ll / (DS * sc)));
  let s = 0;
  for (let i = 0; i < nl && s <= vis; i++, s += DS * sc) {
    const u = i / nl; push(xf(bl[0] + (st[0] - bl[0]) * u, bl[1] + (st[1] - bl[1]) * u, 0));
  }
  for (let i = 0; i < n && s <= vis; i++, s += DS * sc) push(xf(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  return [m, ll + LEN[d] * sc];
}

const MAT = [];
function drawSlot(k, d, vis, slide, phi, psi) {
  const [m] = slotRope(k, d, vis, phi, psi);
  tube(TMP, m, RR * SLOTS[k].sc, k, slide, DS * SLOTS[k].sc);
  MAT[k] = 0;
}
function fullLen(k, d) { return slotRope(k, d, 1e9, 0, 0)[1]; }

export function specimen(g, t = 0) {
  buffers(g.width, g.height);
  const ex = EX, ey = EY; EX = g.width / 2; EY = g.height / 2;
  const mats = [];
  for (let d = 0; d < 10; d++) {
    const col = d % 5, row = Math.floor(d / 5);
    mats[d] = 0;
    placeDigit(d, 16 + col * 30, 4 + row * 42, 0, 1, 0.25 * Math.sin(t * 1.3 + d), d, 0);
  }
  shadePass(g, mats);
  EX = ex; EY = ey;
}
function placeDigit(d, x, y, z, sc, psi, id, s0) {
  const P = DIG[d], n = P.length / 3, Q = new Float32Array(P.length);
  const c = Math.cos(psi), sn = Math.sin(psi);
  for (let i = 0; i < n; i++) {
    const lx = (P[i * 3] - 10) * sc, ly = P[i * 3 + 1] * sc, lz = P[i * 3 + 2] * sc;
    Q[i * 3] = x + lx * c - lz * sn; Q[i * 3 + 1] = y + ly; Q[i * 3 + 2] = z + lx * sn + lz * c;
  }
  tube(Q, n, RR * sc, id, s0, DS * sc);
}

// ------------------------------------------------------------ timing
const R0 = -0.95, P1 = 1.45;   // haul in before :00, pay out after
function slotState(k, now, was, sec, ms) {
  // returns [digit, visible length, slide]
  const lag = (k % 2 ? 0.18 : 0);
  if (now === was) return [now, 1e9, 0];
  const tau = sec >= 30 ? sec - 60 : sec;   // seconds from the turn
  const t = tau - lag;
  if (tau < 0) {
    const L = fullLen(k, was), u = smooth((t - R0) / (0 - R0 - 0.05));
    return [was, L * (1 - u), L * u];
  }
  const L = fullLen(k, now), u = smooth(t / P1);
  return [now, L * u, L * (1 - u) + 40 * (1 - u)];
}

export default {
  name: 'ropeknot',
  blurb: 'Placeholder.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    buffers(g.width, g.height);
    const f = ctx.fields, T = ctx.t, sec = f.sec;
    // which minute is "now" and "was": during the last second before :00 the
    // rope is already hauling in the old one
    const nextDate = new Date(ctx.date.getTime() + 60000);
    const after = sec < 30;
    const cur = after ? f : clockFields(nextDate);
    const prev = after ? previousMinute(ctx.date) : f;
    const dn = [Math.floor(cur.h / 10), cur.h % 10, Math.floor(cur.m / 10), cur.m % 10];
    const dw = [Math.floor(prev.h / 10), prev.h % 10, Math.floor(prev.m / 10), prev.m % 10];
    CYAW = 0.16 * Math.sin(TAU * T / 23);
    const roll = 0.05 * Math.sin(TAU * T / 7.3);
    for (let k = 0; k < 4; k++) {
      const [d, vis, slide] = slotState(k, dn[k], dw[k], sec);
      const phi = -roll * 0.8 + 0.025 * Math.sin(TAU * T / 3.1 + k * 1.7);
      const psi = 0.32 * Math.sin(TAU * T / 9.7 + k * 2.1);
      drawSlot(k, d, vis, slide, phi, psi);
    }
    shadePass(g, MAT);
    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
