// Jenga — the time is built out of the tower's own blocks, in real 3D.
//
// One set of identical Jenga blocks (15 x 5 x 3 px, the real 5 : 1.7 : 1)
// makes everything. A short Jenga tower stands on the table, three blocks a
// layer, alternating; its top layer has two blocks slid out sideways as
// shelves, and perched on them, precariously, stands the hour, built of the
// same blocks. To the right the minutes stand on the table. A numeral is a
// stack: lying blocks are the bars, standing blocks the stems, and where a
// stem has nothing to stand on a block lies end-on underneath it as a
// spacer. A top bar that rests on one stem only rocks on its edge.
//
// Conservation: the minutes borrow their blocks from the tower. Every block
// the minutes hold is a hole in the tower (holes = blocks in the minutes - 8,
// filled last-out-first-in from a fixed list of legal Jenga pulls), so a
// "00" leaves the tower riddled and a "11" leaves it whole.
//
// Always alive: the camera orbits slowly, the tower sways, every 3 s an
// unseen finger taps a tower block that slides out a little and back with
// a wobble, cantilevered bars rock.
//
// The minute (from :00, ~2.5 s): blocks the new minute doesn't need are
// pushed out of the numeral towards the viewer and lifted away; blocks it
// needs are pulled out of the tower, slowly, teetering as they clear, fly
// over and are pushed in. Surplus goes back into the tower's holes.
//
// The hour: at :58.8 a finger starts pulling one block too many. At :00
// the tower tips towards the viewer, with the hour on it, and crashes:
// every block flies, tumbles, lands and slides on the table. Then the whole
// crash rewinds into a fresh tower with the new hour on top (about 1.5 s).
//
// Rendering: every block is a box (any rotation), its faces projected
// through a perspective camera and filled with a z-buffer; shade by which
// way a face looks (front solid, top half, sides dim), the tower at half the
// brightness of the time; a one-pixel seam wherever two blocks meet.
// Burn-in: the orbiting camera moves every pixel. 23:00-07:00 dims.

import { dither, clamp, ease, previousMinute, clockFields, orbit } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;
const BL = 15, BW = 5, BT = 3, HL = BL / 2, HT = BT / 2, HW = BW / 2;

// ------------------------------------------------------------ rotations (row-major 3x3)
// A block's local axes: x long, y thin, z wide.
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const OX = I3;                              // lying along x
const OY = [0, 0, 1, 1, 0, 0, 0, 1, 0];     // standing: long up, wide across, thin deep
const OZ = [0, 0, -1, 0, 1, 0, 1, 0, 0];    // lying along z (end-on)
function mul(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
function rotAxis(x, y, z, a) {
  const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function quat(m) {
  const [a, b, c, d, e, f, g, h, i] = m, tr = a + e + i;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [0.25 * s, (h - f) / s, (c - g) / s, (d - b) / s]; }
  if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; return [(h - f) / s, 0.25 * s, (b + d) / s, (c + g) / s]; }
  if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; return [(c - g) / s, (b + d) / s, 0.25 * s, (f + h) / s]; }
  const s = Math.sqrt(1 + i - a - e) * 2; return [(d - b) / s, (c + g) / s, (f + h) / s, 0.25 * s];
}
function qmat([w, x, y, z]) {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}
function slerpM(A, B, u) {
  if (u <= 0) return A; if (u >= 1) return B;
  const a = quat(A); let b = quat(B);
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((v) => -v); d = -d; }
  let ka, kb;
  if (d > 0.9995) { ka = 1 - u; kb = u; } else {
    const th = Math.acos(d), s = Math.sin(th); ka = Math.sin((1 - u) * th) / s; kb = Math.sin(u * th) / s;
  }
  const q = a.map((v, k) => ka * v + kb * b[k]), l = Math.hypot(...q);
  return qmat(q.map((v) => v / l));
}
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ camera
// World: px, y up, z away from the viewer, the table at y = 0.
const D = 170, FOC = 0.9 * D, TGX = -5, TGY = 26;
let SX0 = 64, SY0 = 33;
let CY = 1, SY = 0, CPh = 1, SPh = 0, EYE = [0, 0, 0];
function setCamera(yaw, pitch) {
  CY = Math.cos(yaw); SY = Math.sin(yaw); CPh = Math.cos(pitch); SPh = Math.sin(pitch);
  EYE = [TGX - D * CPh * SY, TGY + D * SPh, -D * CPh * CY];
}
function project(p, out, k) {
  const x = p[0] - TGX, y = p[1] - TGY, z = p[2];
  const x1 = x * CY - z * SY, z1 = x * SY + z * CY;
  const yc = y * CPh + z1 * SPh, zc = -y * SPh + z1 * CPh + D;
  out[k] = SX0 + (FOC * x1) / zc; out[k + 1] = SY0 - (FOC * yc) / zc; out[k + 2] = 1 / zc;
}

// ------------------------------------------------------------ z-buffered rasteriser
const ZB = new Float32Array(W * H), LV = new Float32Array(W * H), KB = new Float32Array(W * H), IDB = new Int16Array(W * H);
let CUR_K = 1, CUR_P = 0;
const PB = new Uint8Array(W * H);
function tri(P, i0, i1, i2, lev, id) {
  const x0 = P[i0], y0 = P[i0 + 1], w0 = P[i0 + 2], x1 = P[i1], y1 = P[i1 + 1], w1 = P[i1 + 2], x2 = P[i2], y2 = P[i2 + 1], w2 = P[i2 + 2];
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-6) return;
  const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(W - 1, Math.floor(Math.max(x0, x1, x2)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(H - 1, Math.floor(Math.max(y0, y1, y2)));
  const ia = 1 / area;
  for (let y = ya; y <= yb; y++) {
    const py = y + 0.5;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      const e0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * ia;
      if (e0 < -1e-6) continue;
      const e1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * ia;
      if (e1 < -1e-6) continue;
      const e2 = 1 - e0 - e1;
      if (e2 < -1e-6) continue;
      const w = e0 * w0 + e1 * w1 + e2 * w2, i = y * W + x;
      if (w > ZB[i]) { ZB[i] = w; LV[i] = lev; KB[i] = CUR_K; PB[i] = CUR_P; IDB[i] = id; }
    }
  }
}
const QP = new Float64Array(12);
function quad(c0, c1, c2, c3, lev, id) {
  project(c0, QP, 0); project(c1, QP, 3); project(c2, QP, 6); project(c3, QP, 9);
  tri(QP, 0, 3, 6, lev, id); tri(QP, 0, 6, 9, lev, id);
}
const HALF = [HL, HT, HW];
/** A block: centre p, rotation R, brightness k (1 the time, ~0.5 the tower). */
function drawBlock(b, id) {
  const { p, R, k } = b;
  CUR_K = k; CUR_P = Math.abs(R[3]) > 0.7 ? 1 : 0;   // standing blocks give up their pixels to seams
  const ax = [[R[0], R[3], R[6]], [R[1], R[4], R[7]], [R[2], R[5], R[8]]];
  for (let a = 0; a < 3; a++)
    for (let s = -1; s <= 1; s += 2) {
      const n = [ax[a][0] * s, ax[a][1] * s, ax[a][2] * s];
      const fc = add3(p, n, HALF[a]);
      if (n[0] * (EYE[0] - fc[0]) + n[1] * (EYE[1] - fc[1]) + n[2] * (EYE[2] - fc[2]) <= 0) continue;
      const b1 = (a + 1) % 3, b2 = (a + 2) % 3, u = ax[b1], v = ax[b2], hu = HALF[b1], hv = HALF[b2];
      const c = (su, sv) => [fc[0] + u[0] * hu * su + v[0] * hv * sv, fc[1] + u[1] * hu * su + v[1] * hv * sv, fc[2] + u[2] * hu * su + v[2] * hv * sv];
      // Faces that look at the viewer are filled (by k: the time solid, the
      // tower not at all); every other face is drawn as its outline only.
      const lev = smooth((-n[2] - 0.55) / 0.35);
      quad(c(1, 1), c(1, -1), c(-1, -1), c(-1, 1), lev, id * 8 + a * 2 + (s > 0 ? 1 : 0));
    }
}

// ------------------------------------------------------------ the pieces
const SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
// [rotation, x from the numeral's centre, y from its base]
const SLOT = {
  d: [OX, 0, HT], e: [OY, -5, BT + HL], c: [OY, 5, BT + HL], g: [OX, 0, BT + BL + HT],
  f: [OY, -5, 2 * BT + BL + HL], b: [OY, 5, 2 * BT + BL + HL], a: [OX, 0, 2 * BT + 2 * BL + HT],
  sdL: [OZ, -5, HT], sdR: [OZ, 5, HT], sgL: [OZ, -5, BT + BL + HT], sgR: [OZ, 5, BT + BL + HT],
};
const DIGH = 3 * BT + 2 * BL;   // 39
function digitKeys(d) {
  const s = SEG[d], k = [...s];
  if (!s.includes('d')) { if (s.includes('e')) k.push('sdL'); if (s.includes('c')) k.push('sdR'); }
  if (!s.includes('g')) { if (s.includes('f')) k.push('sgL'); if (s.includes('b')) k.push('sgR'); }
  return k;
}
const COUNT = Array.from({ length: 10 }, (_, d) => digitKeys(d).length);

// The tower: six layers, even ones end-on to the viewer, odd ones lengthwise.
const TWX = -31, TWZ = 0, LAYERS = 6, TOP = LAYERS - 1, SHELF = 11.5;
const MX = [15, 34], MZ = -8, ZE = -18;   // minutes, the table's front edge
// Holes, in the order they open: legal Jenga pulls (a layer always keeps its
// middle or both sides), never the top layer.
const HOLES = [[2, 0], [3, 1], [1, 2], [4, 0], [0, 1], [2, 2], [4, 2], [1, 0]];
const BASE_COUNT = 8;   // blocks in "11"
const GROUP = {
  H0: [TWX - SHELF, LAYERS * BT, TWZ + BW], H1: [TWX + SHELF, LAYERS * BT, TWZ - BW],
  M0: [MX[0], 0, MZ], M1: [MX[1], 0, MZ],
};

function towerSlot(i, j) {
  const y = HT + BT * i;
  if (i % 2 === 0) return { p: [TWX + (j - 1) * BW, y, TWZ], R: OZ, k: 1, ax: [0, 0, -1], dist: BL + 2, tower: true };
  let x = TWX;
  if (i === TOP) x += j === 0 ? SHELF : j === 2 ? -SHELF : 0;
  return { p: [x, y, TWZ + (j - 1) * BW], R: OX, k: 1, ax: [1, 0, 0], dist: BL + 2, tower: true };
}
function digitSlot(gk, key, d) {
  const [R, sx0, sy] = SLOT[key], o = GROUP[gk];
  const sx = d === 1 ? sx0 - 5 : sx0;   // a one stands in the middle of its place
  const fz = R === OX ? HW - HT : R === OZ ? HL - HT : 0;   // every front face flush with the stems'
  const s = { p: [o[0] + sx, o[1] + sy, o[2] + fz], R, k: 1, ax: [0, 0, -1], dist: R === OZ ? BL + 2 : R === OX ? BW + 3 : BT + 3, hour: gk[0] === 'H' };
  if (key === 'a') {
    const sg = SEG[d], hb = sg.includes('b'), hf = sg.includes('f');
    if (hb !== hf) s.teeter = hb ? 1 : -1;   // resting on one stem: it rocks on that stem's inner edge
  }
  return s;
}
const holeKey = (n) => `T${HOLES[n][0]}${HOLES[n][1]}`;

/** Every block of the time hh:mm, keyed by where it sits. */
function config(h, m) {
  const map = new Map();
  const md = [Math.floor(m / 10), m % 10], hd = [Math.floor(h / 10), h % 10];
  const n = COUNT[md[0]] + COUNT[md[1]] - BASE_COUNT;
  const holes = new Set(HOLES.slice(0, n).map(([i, j]) => `T${i}${j}`));
  for (let i = 0; i < LAYERS; i++)
    for (let j = 0; j < 3; j++) if (!holes.has(`T${i}${j}`)) map.set(`T${i}${j}`, towerSlot(i, j));
  hd.forEach((d, q) => { for (const k of digitKeys(d)) map.set(`H${q}${k}${d === 1 ? '!' : ''}`, digitSlot(`H${q}`, k, d)); });
  md.forEach((d, q) => { for (const k of digitKeys(d)) map.set(`M${q}${k}${d === 1 ? '!' : ''}`, digitSlot(`M${q}`, k, d)); });
  return { map, n };
}
const CFG = new Map();
function cfg(h, m) {
  const key = h * 60 + m;
  if (!CFG.has(key)) { if (CFG.size > 8) CFG.clear(); CFG.set(key, config(h, m)); }
  return CFG.get(key);
}

// ------------------------------------------------------------ idle life
function rotAbout(b, P, M) {
  return { ...b, p: add3(P, mv(M, [b.p[0] - P[0], b.p[1] - P[1], b.p[2] - P[2]])), R: mul(M, b.R) };
}
const TAP = 3;
/** The idle pose of a resting block: sway (tower and hour), a finger's tap, the rocking bars. */
function idle(key, b, T, sway, tapKey, tapU) {
  let out = b;
  if (key === tapKey) {
    const s = 2.4 * Math.sin(Math.PI * tapU) * (1 - 0.35 * Math.sin(3 * Math.PI * tapU));
    out = { ...out, p: add3(out.p, out.ax, s) };
  }
  if (b.teeter) {
    const w = 0.5 - 0.5 * Math.cos(T * 2.3 + b.p[0] * 0.7);
    const piv = [b.p[0] + b.teeter * 2.5, b.p[1] - HT, b.p[2]];
    out = rotAbout(out, piv, rotAxis(0, 0, 1, b.teeter * 0.07 * w));
  }
  if (sway && (b.tower || b.hour)) out = rotAbout(out, [TWX, 0, TWZ], sway);
  return out;
}
function swayAt(T, extra = 0) {
  const u = (T % TAP) / 1.0, kick = u < 1.6 ? 0.012 * Math.sin(9 * u) * Math.exp(-2.5 * u) : 0;
  return mul(rotAxis(0, 0, 1, 0.007 * Math.sin((TAU * T) / 3.1) + kick + extra), rotAxis(1, 0, 0, 0.005 * Math.sin((TAU * T) / 4.3 + 1)));
}
function tapTarget(T, map) {
  const k = Math.floor(T / TAP), u = (T - k * TAP) / 1.0;
  if (u >= 1) return [null, 0];
  const keys = [...map.keys()].filter((q) => q[0] === 'T' && q[1] !== `${TOP}`);
  return [keys[Math.floor(hash(k) * keys.length)], u];
}

// ------------------------------------------------------------ the minute: movers
const MD = 1.3, UA = 0.32, UB = 0.76;
const UP = [0, 1, 0];
/** A block on its way from slot `s` to slot `d`, u = 0..1. */
function moverPose(s, d, u) {
  const cross = (a) => [a[1] * UP[2] - a[2] * UP[1], a[2] * UP[0] - a[0] * UP[2], a[0] * UP[1] - a[1] * UP[0]];
  const slide = (q) => {   // out along its axis, the far end drooping as it clears: the teeter
    const t = ease.inOutQuad(q);
    const droop = s.tower ? 0.16 * smooth((t - 0.45) / 0.55) * (1 + 0.25 * Math.sin(q * 14)) : 0.05 * t;
    const c = cross(s.ax);
    return { p: add3(s.p, s.ax, s.dist * t), R: mul(rotAxis(c[0], c[1], c[2], -droop), s.R), k: s.k };
  };
  if (u < UA) return slide(u / UA);
  const a = slide(1);
  const P2 = add3(d.p, d.ax, d.dist);
  if (u < UB) {
    const e = ease.inOutCubic((u - UA) / (UB - UA));
    const dist = Math.hypot(P2[0] - a.p[0], P2[1] - a.p[1], P2[2] - a.p[2]);
    const C = [(a.p[0] + P2[0]) / 2, Math.max(a.p[1], P2[1]) + 10 + 0.25 * dist, (a.p[2] + P2[2]) / 2];
    const v = 1 - e;
    const p = [0, 1, 2].map((i) => v * v * a.p[i] + 2 * v * e * C[i] + e * e * P2[i]);
    return { p, R: slerpM(a.R, d.R, e), k: a.k + (d.k - a.k) * e };
  }
  const e = ease.outCubic((u - UB) / (1 - UB));
  return { p: add3(d.p, d.ax, d.dist * (1 - e)), R: d.R, k: d.k };
}

/** Plan the minute A -> B: which blocks stay, and who goes where. */
function planMinute(A, B, towerOK = true) {
  const rem = [], addl = [];
  for (const [k, b] of A.map) if (k[0] === 'M' && !B.map.has(k)) rem.push([k, b]);
  for (const [k, b] of B.map) if (k[0] === 'M' && !A.map.has(k)) addl.push([k, b]);
  rem.sort((x, y) => y[1].p[1] - x[1].p[1]);
  const moves = [], used = new Set();
  const left = [];
  for (const r of rem) {
    let best = -1, bd = 1e9;
    addl.forEach((a, i) => {
      if (used.has(i)) return;
      const dd = Math.hypot(a[1].p[0] - r[1].p[0], a[1].p[1] - r[1].p[1]);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best >= 0) { used.add(best); moves.push({ sk: r[0], s: r[1], dk: addl[best][0], d: addl[best][1] }); } else left.push(r);
  }
  const need = addl.filter((_, i) => !used.has(i));
  if (towerOK) {
    // Surplus into the tower's newest holes; shortfall pulled out of it.
    left.forEach((r, i) => { const hk = holeKey(B.n + i); moves.push({ sk: r[0], s: r[1], dk: hk, d: B.map.get(hk) }); });
    need.forEach((a, i) => { const hk = holeKey(A.n + i); moves.push({ sk: hk, s: A.map.get(hk), dk: a[0], d: a[1] }); });
  }
  const n = moves.length, st = n > 1 ? Math.min(0.34, 1.45 / (n - 1)) : 0;
  moves.forEach((mo, i) => { mo.t0 = 0.08 + i * st; });
  return { moves, left, need };
}

// ------------------------------------------------------------ the hour: the crash
const G = 700, TS = 0.36, ALPHA = (2 * 0.6) / (TS * TS), KAPPA = 7;
const FALL = (() => { const v = [-0.45, 0, -0.9], l = Math.hypot(...v); return v.map((c) => c / l); })();
const PIVOT = [TWX + FALL[0] * 8.5, 0, TWZ + FALL[2] * 8.5];
const AXIS = [FALL[2], 0, -FALL[0]];        // up x fall: tips the top towards the viewer
const onTable = (x, z) => z >= ZE && z <= 60 && x > -90 && x < 90;
function flatFrom(R) {
  let l = [R[0], 0, R[6]];
  if (Math.hypot(l[0], l[2]) < 0.2) l = [R[2], 0, R[8]];
  const ll = Math.hypot(l[0], l[2]); l = [l[0] / ll, 0, l[2] / ll];
  const t = [0, R[4] >= 0 ? 1 : -1, 0];
  const w = [l[1] * t[2] - l[2] * t[1], l[2] * t[0] - l[0] * t[2], l[0] * t[1] - l[1] * t[0]];
  return [l[0], t[0], w[0], l[1], t[1], w[1], l[2], t[2], w[2]];
}
/** Where crashed block b is at tau: rigid topple, then ballistic, land, slide. */
function debris(b, i, tau) {
  const t0 = b.free ?? TS;
  if (!b.free && tau < TS) return rotAbout(b, PIVOT, rotAxis(AXIS[0], AXIS[1], AXIS[2], 0.5 * ALPHA * Math.max(0, tau) ** 2));
  let p0, R0, v;
  if (b.free) { p0 = b.p; R0 = b.R; v = b.v; } else {
    const s = rotAbout(b, PIVOT, rotAxis(AXIS[0], AXIS[1], AXIS[2], 0.5 * ALPHA * TS * TS));
    p0 = s.p; R0 = s.R;
    const r = [p0[0] - PIVOT[0], p0[1] - PIVOT[1], p0[2] - PIVOT[2]], om = ALPHA * TS;
    v = [om * (AXIS[1] * r[2] - AXIS[2] * r[1]), om * (AXIS[2] * r[0] - AXIS[0] * r[2]), om * (AXIS[0] * r[1] - AXIS[1] * r[0])];
    v = [v[0] + (hash(i * 3.1) - 0.5) * 70, v[1] + hash(i * 5.7) * 40, v[2] + (hash(i * 7.3) - 0.6) * 50];
  }
  const spin = rotAxis(hash(i * 1.3) - 0.5, hash(i * 2.9) - 0.5, hash(i * 4.1) - 0.5, 1);
  const wsp = 6 + 8 * hash(i * 9.1);
  const ax = [spin[7] - spin[5], spin[2] - spin[6], spin[3] - spin[1]];
  const t = tau - t0;
  const tl = (v[1] + Math.sqrt(v[1] * v[1] + 2 * G * Math.max(0, p0[1] - HT))) / G;
  const xl = p0[0] + v[0] * tl, zl = p0[2] + v[2] * tl;
  if (t < tl || !onTable(xl, zl)) {
    return { ...b, p: [p0[0] + v[0] * t, p0[1] + v[1] * t - 0.5 * G * t * t, p0[2] + v[2] * t], R: mul(rotAxis(ax[0], ax[1], ax[2], wsp * t), R0) };
  }
  const s = t - tl, f = (1 - Math.exp(-KAPPA * s)) / KAPPA;
  const Rl = mul(rotAxis(ax[0], ax[1], ax[2], wsp * tl), R0);
  return { ...b, p: [xl + v[0] * 0.35 * f, HT, zl + v[2] * 0.35 * f], R: slerpM(Rl, flatFrom(Rl), smooth(s / 0.2)), k: b.k * (1 - smooth(s / 0.3)) };
}
const PULL = 1.2, REW = 0.55, FD = 0.5, H_END = 1.75;

function hourScene(T, tau, A, B, out) {
  const fk = holeKey(A.n), F = A.map.get(fk);
  if (tau < 0) {
    // One block too many: pulled slowly out, the tower trembling more and more.
    const u = clamp((tau + PULL) / PULL, 0, 1);
    const sway = swayAt(T, 0.03 * u * u * Math.sin(TAU * 6 * tau));
    for (const [k, b] of A.map) {
      if (k === fk) out.push(rotAbout({ ...b, p: add3(b.p, b.ax, b.dist * 0.8 * ease.inOutQuad(u)) }, [TWX, 0, TWZ], sway));
      else if (k[0] !== 'M') out.push(idle(k, b, T, sway, null, 0));
      else out.push(idle(k, b, T, null, null, 0));
    }
    return;
  }
  // The minutes change as usual, but nothing goes back into a tower that is falling.
  const plan = planMinute(A, B, false);
  const moving = new Set(plan.moves.flatMap((m) => [m.sk, m.dk]));
  for (const [k, b] of A.map) if (k[0] === 'M' && B.map.has(k) && !moving.has(k)) out.push(idle(k, b, T, null, null, 0));
  for (const mo of plan.moves) out.push(moverPose(mo.s, mo.d, clamp((tau - mo.t0) / MD, 0, 1)));
  // The crash pool: the tower and the hour, and the minutes' surplus.
  const pool = [];
  let i = 0;
  for (const [k, b] of A.map) {
    if (k[0] === 'M') continue;
    if (k === fk) pool.push({ b: { ...F, p: add3(F.p, F.ax, F.dist * 0.8), free: 0.001, v: [0, 25, -70] }, i: i++ });
    else pool.push({ b, i: i++ });
  }
  for (const [, b] of plan.left) pool.push({ b: { ...b, still: true }, i: i++ });
  const at = (q, t) => (q.b.still ? q.b : debris(q.b, q.i, t));
  // What the rewind builds: the new tower and hour, and what the minutes still need.
  const targets = [];
  for (const [k, b] of B.map) if (k[0] !== 'M') targets.push({ k, b });
  for (const [k, b] of plan.need) targets.push({ k, b, late: true });
  // Pair crash pieces with places by x, near ones first.
  const tx = targets.map((q, j) => [q, j]).sort((a, b) => a[0].b.p[0] - b[0].b.p[0]);
  const px = pool.map((q) => [q, at(q, REW).p[0]]).sort((a, b) => a[1] - b[1]);
  const extra = Math.max(0, px.length - tx.length);
  // Surplus pieces (the old hour had more blocks) are the leftmost ones: they slide off the table.
  const spare = px.slice(0, extra), use = px.slice(extra);
  // Start order: tower bottom up, hour bottom up beside it, minutes' blocks last.
  const rankT = targets.filter((q) => q.b.tower).sort((a, b) => a.b.p[1] - b.b.p[1]);
  const rankH = targets.filter((q) => q.b.hour).sort((a, b) => a.b.p[1] - b.b.p[1]);
  const rankM = targets.filter((q) => q.late);
  const start = new Map();
  rankT.forEach((q, r) => start.set(q, REW + r * 0.02));
  rankH.forEach((q, r) => start.set(q, REW + 0.06 + r * 0.022));
  rankM.forEach((q, r) => start.set(q, REW + 0.25 + r * 0.05));
  tx.forEach(([q], r) => {
    const t0 = start.get(q), src = use[r] ? use[r][0] : null;
    const u = (tau - t0) / FD;
    if (u >= 1) { out.push(q.b); return; }
    const s = src ? at(src, Math.min(tau, t0)) : { p: add3(q.b.p, [0, 1, 0], 70), R: q.b.R, k: q.b.k };
    if (u <= 0) { out.push(s); return; }
    const e = ease.inOutCubic(u), v = 1 - e;
    const C = [(s.p[0] + q.b.p[0]) / 2, Math.max(s.p[1], q.b.p[1]) + 18, (s.p[2] + q.b.p[2]) / 2];
    out.push({ p: [0, 1, 2].map((c) => v * v * s.p[c] + 2 * v * e * C[c] + e * e * q.b.p[c]), R: slerpM(s.R, q.b.R, e), k: s.k + (q.b.k - s.k) * e });
  });
  spare.forEach(([q], r) => {
    const s = at(q, REW), t = Math.max(0, tau - REW - r * 0.05);
    const z = s.p[2] - 90 * t * t, drop = Math.max(0, ZE - z);
    out.push({ ...s, p: [s.p[0], s.p[1] - 0.5 * G * (drop / 60) ** 2 - drop * 0.8, z] });
  });
}

// ------------------------------------------------------------ the table
const TP = new Float64Array(6);
/** The table's front edge, a single line, behind whatever is in front of it. */
function drawTable(g) {
  project([-90, 0, ZE], TP, 0); project([90, 0, ZE], TP, 3);
  const buf = g.buf;
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - TP[0]) / (TP[3] - TP[0]), y = Math.floor(TP[1] + (TP[4] - TP[1]) * u);
    if (y >= 0 && y < H && IDB[y * W + x] < 0) buf[y * W + x] = 1;
  }
}

export default {
  name: 'Jenga',
  blurb: 'The time built from a Jenga tower\'s own blocks: the hour perched on top, the minutes borrowing blocks from it; on the hour one pull too many and the whole thing crashes and rewinds.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;
    const [ox, oy] = orbit(date, 2, 3);
    SX0 = 64 + ox; SY0 = 33 + oy * 0.5;
    setCamera(0.14 * Math.sin((TAU * T) / 41) + 0.025 * Math.sin((TAU * T) / 13), 0.3 + 0.035 * Math.sin((TAU * T) / 29));
    ZB.fill(0); IDB.fill(-1);
    const blocks = [];
    const late = sec >= 60 - PULL;
    const next = late ? clockFields(new Date(date.getTime() + 60000)) : null;
    if (late && next.m === 0) {
      hourScene(T, sec - 60, cfg(f.h, f.m), cfg(next.h, 0), blocks);
    } else if (f.m === 0 && sec < H_END) {
      const p = previousMinute(date);
      hourScene(T, sec, cfg(p.h, p.m), cfg(f.h, 0), blocks);
    } else if (sec < 3.2 && f.m !== 0) {
      const p = previousMinute(date), A = cfg(p.h, p.m), B = cfg(f.h, f.m);
      const plan = planMinute(A, B);
      const moving = new Set(plan.moves.flatMap((m) => [m.sk, m.dk]));
      // The tower trembles while a block is worked out of it (or pushed back in).
      let shake = 0;
      for (const mo of plan.moves) {
        const u = (sec - mo.t0) / MD;
        if (mo.s.tower && u > 0 && u < UA) shake += 0.025 * Math.sin(Math.PI * u / UA) * Math.sin(TAU * 7 * sec);
        if (mo.d.tower && u > UB && u < 1) shake += 0.015 * Math.sin(Math.PI * (u - UB) / (1 - UB)) * Math.sin(TAU * 9 * sec);
      }
      const sway = swayAt(T, shake);
      for (const [k, b] of B.map) if (A.map.has(k) && !moving.has(k)) blocks.push(idle(k, b, T, sway, null, 0));
      for (const mo of plan.moves) blocks.push(moverPose(mo.s, mo.d, clamp((sec - mo.t0) / MD, 0, 1)));
    } else {
      const C = cfg(f.h, f.m), sway = swayAt(T);
      const [tk, tu] = tapTarget(T, C.map);
      for (const [k, b] of C.map) blocks.push(idle(k, b, T, sway, tk, tu));
    }
    blocks.forEach((b, i) => drawBlock(b, i));
    const buf = g.buf;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, id = IDB[i];
        if (id < 0) continue;
        const l = x > 0 ? IDB[i - 1] : -1, u = y > 0 ? IDB[i - W] : -1;
        const r = x < W - 1 ? IDB[i + 1] : -1, d = y < H - 1 ? IDB[i + W] : -1;
        const lv = LV[i], solid = KB[i] >= 0.75;
        const bg = l === -1 || u === -1 || r === -1 || d === -1;
        if (lv < 0.5) continue;   // tops and sides stay dark: only faces that look at you are lit
        // A filled face, and a dark seam where it meets another block's face:
        // on the standing block's side, else on the lower/right one.
        const me = id >> 3, pr = PB[i];
        const seam = (j, first) => {
          const o = IDB[j];
          if (o < 0 || o >> 3 === me || LV[j] < 0.5) return false;
          return pr > PB[j] || (pr === PB[j] && first);
        };
        if (solid && ((x > 0 && seam(i - 1, true)) || (y > 0 && seam(i - W, true)) || (x < W - 1 && seam(i + 1, false)) || (y < H - 1 && seam(i + W, false)))) continue;
        // The time solid; the tower a half-tone, so the time is always the brightest thing.
        if (solid) { if (lv >= 0.97 || dither(x, y, lv)) buf[i] = 1; continue; }
        // The tower is a line drawing: each face's outline, one pixel, shared edges once.
        const edge = (j) => IDB[j] !== id && !(IDB[j] >= 0 && LV[j] >= 0.5 && KB[j] < 0.75 && (j === i + 1 || j === i + W));
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || edge(i - 1) || edge(i - W) || edge(i + 1) || edge(i + W)) buf[i] = 1;
      }
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
