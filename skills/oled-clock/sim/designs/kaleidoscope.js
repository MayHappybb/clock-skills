// Kaleidoscope — the time cut in glass, in front of a turning kaleidoscope.
//
// Behind the time, the whole glass is a kaleidoscope: bits of "coloured"
// glass (solid, hatched, stippled, clear) lie in the object cell, and two
// mirrors at pi/N fold them into an N-fold mandala round the centre of the
// screen. A pixel is folded into the mirrors' wedge (polar angle mod 2pi/N,
// mirrored), and looks up which bit lies there: the bits are scan-filled
// into a small grid in the mirrors' frame every frame, so bits that cross a
// mirror join their reflections, as in a real tube. The cell turns slowly
// against the mirrors (the pattern flows), the image turns slowly on the
// glass, and it breathes. Hatching is in the folded frame, so it mirrors
// into chevrons; each bit has a one-pixel rim.
//
// The digits are cut glass: octagonal strokes, each split at its mitres
// into facets and along its centre-line into a V-cut, the half facing the
// light (upper left) solid and the other a thin stipple, with a one-pixel
// seam between facets. A dark moat keeps them clear of the mandala.
//
// The minute: from :57 the changing digits crack (seams open, facets
// shiver) and the tube starts to turn; from :58 the facets lift off one by
// one and spiral into the centre of the mandala, fanning into their own
// reflections as they shrink, and are gone before :00. The tube turns: the
// bits tumble (each on its own lag), the mandala blooms open and settles
// into a new pattern. From :00.1 the new digit is born in the centre as an
// N-fold rosette of tiny copies of its facets that grows and closes like a
// fan onto the real one, overshooting a little; the reflections are dimmer
// than the image, as in a real kaleidoscope. A glint runs across it.
//
// The hour: the symmetry order changes (6 -> 8 -> 12 fold, by hour). From
// :56 every digit cracks while the mandala spins up like a top; from :57.6
// the spin flings the facets out off the glass; the mandala collapses into
// a point, and at :00 it flashes and re-blooms from the point with its new
// symmetry and a new set of bits, a shock ring running out; the label shows
// the new order, and all four digits close in from a spinning rosette.
//
// Everything is a function of the clock: the bits of an hour come from a
// hash of the hour; their positions are closed-form in the seconds since the
// hour and the eased count of minute turns so far. Nothing is kept between
// frames except caches.
//
// Burn-in: the mandala moves all the time; the digits walk kit.orbit; the
// dim facet halves are a stipple; 23:00-07:00 the panel dims.

import { dither, clockFields, previousMinute, orbit, font3x5 } from '../js/kit.js';

const W = 128, H = 64, CX = 32, CY = 32;   // the eyepiece
const DISC = 29.5;                          // radius of the image in it
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };
const outCubic = (u) => 1 - (1 - clamp01(u)) ** 3;
const inCubic = (u) => clamp01(u) ** 3;
const outBack = (u, c = 1.6) => { u = clamp01(u); return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ scan fill

const XS = new Float64Array(64);
/** Fill a polygon (pixel centres inside, even-odd) on a w x h grid. */
function scan(pts, w, h, fn) {
  const n = pts.length;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const y = pts[i][1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(h - 1, Math.floor(y1 - 0.5));
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    let k = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = pts[i][1], yj = pts[j][1];
      if ((yi > yc) !== (yj > yc)) XS[k++] = pts[i][0] + ((yc - yi) * (pts[j][0] - pts[i][0])) / (yj - yi);
    }
    for (let a = 1; a < k; a++) { const v = XS[a]; let b = a - 1; while (b >= 0 && XS[b] > v) { XS[b + 1] = XS[b]; b--; } XS[b + 1] = v; }
    for (let a = 0; a + 1 < k; a += 2) {
      const xa = Math.max(0, Math.ceil(XS[a] - 0.5)), xb = Math.min(w - 1, Math.floor(XS[a + 1] - 0.5));
      for (let x = xa; x <= xb; x++) fn(x, y);
    }
  }
}

// ------------------------------------------------------------ cut-glass digits
// Centre-lines in a 22 x 28 box; strokes are 2*HW wide with mitred joints.
// A free end is cut square, or along `c0`/`c1` ('h' horizontal, 'v' vertical).

const DW = 22, DH = 28, HW = 2.6, SEAM = 1.2;
const S = (pts, o = {}) => ({ pts, ...o });
const L = 2.6, R = 19.4, T = 2.6, B = 25.4;
const SKEL = {
  0: [S([[7.1, T], [14.9, T], [R, 7.1], [R, 20.9], [14.9, B], [7.1, B], [L, 20.9], [L, 7.1]], { closed: true })],
  1: [S([[12.5, 0], [12.5, 21.8]], { c1: 'h' }), S([[3.6, 9.6], [8.9, 4.3]], { c1: 'v' }), S([[5, B], [20, B]])],
  2: [S([[L, 9], [L, 7.1], [7.1, T], [14.9, T], [R, 7.1], [R, 10], [3.8, 21.8]], { c1: 'h' }), S([[0, B], [22, B]])],
  3: [S([[0, T], [14.9, T], [R, 7.1], [R, 9.4], [15, 13.8], [7, 13.8]]),
    S([[15, 13.8], [R, 18.2], [R, 20.9], [14.9, B], [0, B]], { c0: 'h' })],
  4: [S([[15, 0], [15, 28]]), S([[22, 19], [L, 19], [L, 13], [11.4, 4.2]], { c1: 'v' })],
  5: [S([[22, T], [L, T], [L, 12.4], [14.9, 12.4], [R, 16.9], [R, 20.9], [14.9, B], [0, B]])],
  6: [S([[20, T], [7.1, T], [L, 7.1], [L, 20.9], [7.1, B], [14.9, B], [R, 20.9], [R, 17.5], [14.9, 13], [6.2, 13]], { c1: 'v' })],
  7: [S([[0, T], [R, T], [R, 7], [10, 28]], { c1: 'h' })],
  8: [S([[7.6, T], [14.4, T], [18.4, 6.6], [18.4, 9.6], [14.4, 13.6], [7.6, 13.6], [3.6, 9.6], [3.6, 6.6]], { closed: true }),
    S([[7.1, 13.6], [14.9, 13.6], [R, 18.1], [R, 20.9], [14.9, B], [7.1, B], [L, 20.9], [L, 18.1]], { closed: true })],
};
SKEL[9] = SKEL[6].map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [DW - x, DH - y]) }));

const LIGHT = (() => { const l = Math.hypot(-0.6, -0.8); return [-0.6 / l, -0.8 / l]; })();

/**
 * A stroke as facets: one quad per segment between mitres, split along the
 * centre-line into two halves, each with its tone (how it faces the light).
 */
function strokeFacets(st) {
  const P = st.pts, n = P.length, closed = !!st.closed;
  const nseg = closed ? n : n - 1;
  const d = [], nn = [];
  for (let j = 0; j < nseg; j++) {
    const a = P[j], b = P[(j + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    d.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
    nn.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]);
  }
  const cutVec = (c, nrm) => {
    const v = c === 'h' ? [1, 0] : c === 'v' ? [0, 1] : nrm;
    const k = v[0] * nrm[0] + v[1] * nrm[1];
    const s = HW / k;
    return [v[0] * s, v[1] * s];
  };
  const m = [], joint = [];
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
    if (hasPrev && hasNext) {
      const n0 = nn[(i - 1 + nseg) % nseg], n1 = nn[i % nseg];
      let bx = n0[0] + n1[0], by = n0[1] + n1[1];
      const l = Math.hypot(bx, by); bx /= l; by /= l;
      const k = HW / (bx * n1[0] + by * n1[1]);
      m.push([bx * k, by * k]); joint.push(true);
    } else if (hasNext) { m.push(cutVec(st.c0, nn[0])); joint.push(false); }
    else { m.push(cutVec(st.c1, nn[nseg - 1])); joint.push(false); }
  }
  const out = [];
  const g = SEAM / 2;
  for (let j = 0; j < nseg; j++) {
    const i0 = j, i1 = (j + 1) % n;
    const a = P[i0], b = P[i1], dj = d[j];
    const sa = joint[i0] ? g : 0, sb = joint[i1] ? g : 0;
    const A = [a[0] + dj[0] * sa, a[1] + dj[1] * sa], B = [b[0] - dj[0] * sb, b[1] - dj[1] * sb];
    const ma = m[i0], mb = m[i1];
    const plus = [[A[0] + ma[0], A[1] + ma[1]], [B[0] + mb[0], B[1] + mb[1]], [B[0], B[1]], [A[0], A[1]]];
    const minus = [[A[0], A[1]], [B[0], B[1]], [B[0] - mb[0], B[1] - mb[1]], [A[0] - ma[0], A[1] - ma[1]]];
    for (const [poly, sgn] of [[plus, 1], [minus, -1]]) {
      const lt = sgn * (nn[j][0] * LIGHT[0] + nn[j][1] * LIGHT[1]);
      const tone = lt > 0.25 ? 1 : lt > -0.25 ? 0.5 : 0.26;
      let cx = 0, cy = 0;
      for (const p of poly) { cx += p[0] / 4; cy += p[1] / 4; }
      out.push({ poly, tone, cx, cy });
    }
  }
  return out;
}

/** Every digit's facets, ordered along its strokes (the order they lift off and land). */
const FACETS = {};
for (let dgt = 0; dgt <= 9; dgt++) {
  const fs = [];
  for (const st of SKEL[dgt]) fs.push(...strokeFacets(st));
  fs.forEach((f, i) => { f.o = fs.length > 1 ? i / (fs.length - 1) : 0; f.h = hash(i, dgt, 77); });
  FACETS[dgt] = fs;
}

// ------------------------------------------------------------ the digit layer

const DL = new Uint8Array(W * H);    // 0 nothing, 1 lit, 2 glass but unlit (stipple)
const MO = new Uint8Array(W * H), MO2 = new Uint8Array(W * H);
const TP = [[0, 0], [0, 0], [0, 0], [0, 0]];

/**
 * Put one facet half on the digit layer: rotate it by `rot` and scale it by
 * `s` about its centre, which goes to (px, py). Its stipple travels with it.
 * A reflection (`clip`) exists only inside the eyepiece.
 */
function putFacet(f, px, py, rot, s, tone, clip = false) {
  const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  putFacetM(f, px, py, c, -sn, sn, c, tone, clip);
}

/** The same with any linear map [[a, b], [c, d]] about the facet's centre (a mirror image). */
function putFacetM(f, px, py, m00, m01, m10, m11, tone, clip = false) {
  for (let k = 0; k < 4; k++) {
    const x = f.poly[k][0] - f.cx, y = f.poly[k][1] - f.cy;
    TP[k][0] = px + m00 * x + m01 * y; TP[k][1] = py + m10 * x + m11 * y;
  }
  const rx = Math.round(px - f.cx), ry = Math.round(py - f.cy);
  scan(TP, W, H, (x, y) => {
    const i = y * W + x;
    if (clip && PR[i] > DISC) return;
    if (tone >= 0.99 || dither(x - rx, y - ry, tone)) DL[i] = 1;
    else if (!DL[i]) DL[i] = 2;
  });
}

/** Clear a moat round everything on the digit layer, then light it. */
function composeDigits(g) {
  // Dilate twice with a plus: a diamond of radius 2.
  let src = DL, dst = MO;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        dst[i] = src[i] || (x > 0 && src[i - 1]) || (x < W - 1 && src[i + 1]) || (y > 0 && src[i - W]) || (y < H - 1 && src[i + W]) ? 1 : 0;
      }
    src = dst; dst = MO2;
  }
  const buf = g.buf;
  for (let i = 0; i < W * H; i++) {
    if (src[i]) buf[i] = 0;
    if (DL[i] === 1) buf[i] = 1;
  }
}

// ------------------------------------------------------------ the kaleidoscope

const PR = new Float32Array(W * H), PA = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
    PR[y * W + x] = Math.hypot(dx, dy);
    PA[y * W + x] = Math.atan2(dy, dx);
  }

const RMAX = 36;                          // object cell radius, units (1 unit = 1 px at zoom 1)
const GS = 3;                             // grid cells per unit
const GU = RMAX * GS + 4, GV = 72;
const GRID = new Uint8Array(GU * GV);
const ID = new Uint8Array(W * H);
const UU = new Float32Array(W * H), VV = new Float32Array(W * H);
const TT = new Uint8Array(256), TC = new Float32Array(256), TSN = new Float32Array(256), TPER = new Float32Array(256);

const SOLID = 1, HATCH = 2, STIP = 3, DOTS = 4, CLEAR = 5;
const SYM = (h) => [6, 8, 12][((h % 3) + 3) % 3];

const bitCache = new Map();
/** The bits in the object cell for an hour: shards of glass, beads and rods. */
function bitsFor(eraKey, N) {
  const k = `${eraKey}:${N}`;
  let B = bitCache.get(k);
  if (B) return B;
  const M = 124;
  const ringPh = hash(1, 2, eraKey) * TAU;
  B = [];
  for (let i = 0; i < M; i++) {
    const h = (j) => hash(i, j, eraKey * 31 + N);
    // A sunflower spiral (even cover in every wedge) with a little jitter.
    const rho = i < 4 ? 1.5 + 3 * h(1) : 35 * Math.sqrt((i - 3.5) / (M - 4)) + (h(1) - 0.5) * 2;
    const kind = h(9);
    const nv = kind < 0.15 ? 8 : 3 + Math.floor(h(3) * 3.99);
    const size = (1.4 + 0.09 * rho) * (0.55 + 0.6 * h(4)) * (kind < 0.15 ? 0.7 : 1);
    const aspect = kind > 0.85 ? 2.2 : 1 + 0.5 * h(5);
    const shape = [];
    for (let v = 0; v < nv; v++) {
      const a = (v / nv) * TAU + (nv === 8 ? 0 : (h(20 + v) - 0.5) * 1.2 / nv * 3);
      const r = nv === 8 ? 1 : 0.6 + 0.4 * h(40 + v);
      shape.push([Math.cos(a) * r * size * aspect, Math.sin(a) * r * size]);
    }
    const t = h(6);
    const small = size * aspect < 4.2;
    const tex = i < 4 ? (i % 2 ? SOLID : HATCH) : t < (small ? 0.36 : 0.06) ? SOLID : t < 0.5 ? HATCH : t < 0.64 ? DOTS : CLEAR;
    const ha = h(7) * Math.PI;
    B.push({
      rho, th: i * 2.39996 + (h(2) - 0.5) * 0.3, shape, ext: size * aspect, tex,
      hc: Math.cos(ha), hs: Math.sin(ha), per: tex === HATCH ? (h(8) < 0.3 ? 2 : 3) : 3,
      kap: 0.55 * Math.sin(rho * 0.2 + ringPh) + 0.1 * (h(10) - 0.5),   // how far it tumbles at each turn: ring by ring
      jump: (h(11) - 0.5) * 3.4,         // how far it spins at each turn
      rj: (h(12) - 0.5) * 0.9, rp: h(13) * TAU,
      spin0: h(14) * TAU, om: (h(15) - 0.5) * 0.25,
      lag: h(16),
      wob: h(17) * TAU, wf: 0.25 + 0.3 * h(18),
    });
  }
  bitCache.set(k, B);
  if (bitCache.size > 4) bitCache.delete(bitCache.keys().next().value);
  return B;
}

const turnEase = (tau, lag) => inOut((tau + 2.6 - 0.9 * lag) / 4.4);

const VP = [];
for (let i = 0; i < 8; i++) VP.push([0, 0]);

/**
 * The mandala. `K(lag)` is the eased count of minute turns so far in the
 * hour, for a bit with that lag; `tE` seconds since the hour.
 */
function mandala(g, B, N, tE, Kof, alpha, beta, z, fill, rv = DISC) {
  const wedge = Math.PI / N, w2 = 2 * wedge;
  GRID.fill(0);
  let id = 0;
  const vmax = (GV - 1) / GS;
  for (const b of B) {
    const K = Kof(b.lag);
    const th = b.th + alpha + b.kap * K;
    let rho = b.rho + b.rj * 3 * Math.sin(0.9 * K + b.rp) + 0.8 * Math.sin(tE * b.wf + b.wob);
    if (rho < 0) rho = -rho;
    if (rho - b.ext > RMAX) continue;
    let a = ((th % TAU) + TAU) % TAU;
    if (a > Math.PI) a -= TAU;
    const marg = Math.min(Math.PI, b.ext / Math.max(rho, 0.5) + 0.04);
    if (a < -marg || a > wedge + marg) continue;
    if (id >= 255) break;
    const cxu = rho * Math.cos(a), cyu = rho * Math.sin(a);
    if (cyu - b.ext > vmax) continue;
    id++;
    const sp = b.spin0 + b.om * tE + b.jump * K;
    const c = Math.cos(sp), s = Math.sin(sp);
    const nv = b.shape.length;
    const pts = VP.slice(0, nv);
    for (let v = 0; v < nv; v++) {
      const [x, y] = b.shape[v];
      pts[v][0] = (cxu + c * x - s * y) * GS;
      pts[v][1] = (cyu + s * x + c * y) * GS;
    }
    const myId = id;
    scan(pts, GU, GV, (x, y) => { GRID[y * GU + x] = myId; });
    TT[myId] = b.tex; TC[myId] = b.hc; TSN[myId] = b.hs; TPER[myId] = b.per;
  }
  const iz = 1 / Math.max(z, 1e-4);
  ID.fill(0);
  for (let i = 0; i < W * H; i++) {
    if (PR[i] > rv) continue;
    const r = PR[i] * iz;
    if (r >= RMAX) continue;
    let p = (PA[i] - beta) % w2;
    if (p < 0) p += w2;
    if (p > wedge) p = w2 - p;
    const u = r * Math.cos(p), v = r * Math.sin(p);
    const gx = (u * GS) | 0, gy = (v * GS) | 0;
    ID[i] = gy < GV ? GRID[gy * GU + gx] : 0;
    UU[i] = u; VV[i] = v;
  }
  const buf = g.buf;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < 2 * CX; x++) {
      const i = y * W + x, d = ID[i];
      if (!d) continue;
      const l = x > 0 ? ID[i - 1] : 0, rr = x < W - 1 ? ID[i + 1] : 0, up = y > 0 ? ID[i - W] : 0, dn = y < H - 1 ? ID[i + W] : 0;
      if ((l !== d && (l === 0 || d > l)) || (rr !== d && (rr === 0 || d > rr)) || (up !== d && (up === 0 || d > up)) || (dn !== d && (dn === 0 || d > dn))) { buf[i] = 1; continue; }
      if (fill < 1 && !dither(x, y, fill)) continue;
      const t = TT[d];
      let on = false;
      if (t === SOLID) on = true;
      else if (t === HATCH) { const q = (UU[i] * TC[d] + VV[i] * TSN[d]) / TPER[d]; on = q - Math.floor(q) < 1 / TPER[d] + 0.001; }
      else if (t === STIP) on = dither(x, y, 0.5);
      else if (t === DOTS) on = dither(x, y, 0.2);
      if (on) buf[i] = 1;
    }
}

// ------------------------------------------------------------ the face

/** HH over MM, to the right of the eyepiece. */
const SLOTS = [[70, 2], [97, 2], [70, 34], [97, 34]];
const RIM = 31.5;

/** The end of the tube: a ring of dots that turns with the object cell. */
function drawRim(g, alpha) {
  const n = 66;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + alpha;
    g.pixel(Math.floor(CX + RIM * Math.cos(a)), Math.floor(CY + RIM * Math.sin(a)), 1);
  }
}
const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

/** Wait-free closed-form spin-up of the mandala before the hour (radians). */
const spinUp = (tau) => (tau > -4.2 ? 7 * ((tau + 4.2) / 4.2) ** 3 : 0);

function drawStatic(dgt, sx, sy, glint) {
  for (const f of FACETS[dgt]) {
    let tone = f.tone;
    if (glint !== null) {
      const q = sx + f.cx + 0.45 * (sy + f.cy);
      if (Math.abs(q - glint) < 3.5) tone = 1;
    }
    putFacet(f, sx + f.cx, sy + f.cy, 0, 1, tone);
  }
}

/**
 * The changing digits as one piece of glass: every facet as an offset from
 * the group's centre, so the group can fly, shrink and turn as one while
 * each facet keeps a little lag of its own.
 */
function groupOf(digs, idx, ox, oy) {
  const items = [];
  let gx = 0, gy = 0;
  for (const k of idx) { gx += SLOTS[k][0] + ox + DW / 2; gy += SLOTS[k][1] + oy + DH / 2; }
  gx /= idx.length; gy /= idx.length;
  for (const k of idx)
    for (const f of FACETS[digs[k]]) {
      const tx = SLOTS[k][0] + ox + f.cx, ty = SLOTS[k][1] + oy + f.cy;
      items.push({ f, tx, ty, vx: tx - gx, vy: ty - gy, o: (f.o + idx.indexOf(k)) / idx.length });
    }
  const ext = Math.max(...idx.map((k) => Math.max(Math.abs(SLOTS[k][0] + ox + DW / 2 - gx), Math.abs(SLOTS[k][1] + oy + DH / 2 - gy)))) * 2 + DH;
  return { items, G: [gx, gy], n: idx.length, ext };
}

/**
 * How small the images in a rosette are and the radius they sit at, so that
 * N of them go round without piling on each other.
 */
function rosette(grp, N) {
  const sr = Math.min(0.46 / Math.sqrt(grp.n), (2 * Math.PI * 21) / N / grp.ext / 0.95);
  const rr = Math.max(13, Math.min(21, (N * grp.ext * sr * 0.95) / (2 * Math.PI)));
  return { sr, rr };
}

/**
 * Draw a group at the pose `poseAt(u)` (each facet at its own u): the group
 * centre at radius `rho` from the eyepiece's centre along the line to its
 * home, turned `ang` round the centre, scaled `sc`, with N reflections
 * fanned `fan` of the way round (reflections only inside the eyepiece).
 */
function drawGroup(grp, N, uOf, poseAt) {
  const gx = grp.G[0] - CX, gy = grp.G[1] - CY, d0 = Math.hypot(gx, gy);
  const ux = gx / d0, uy = gy / d0;
  for (const it of grp.items) {
    const u = uOf(it);
    if (u <= 0 && poseAt.before === 'hide') continue;
    if (u >= 1 && poseAt.after === 'hide') continue;
    if (u <= 0 || u >= 1) { putFacet(it.f, it.tx, it.ty, 0, 1, it.f.tone); continue; }
    const p = poseAt(u, d0);
    const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
    const Px = CX + p.rho * (ca * ux - sa * uy), Py = CY + p.rho * (sa * ux + ca * uy);
    const r = p.ang + (p.rot || 0), cr = Math.cos(r), sr = Math.sin(r);
    const fx = Px + p.sc * (cr * it.vx - sr * it.vy), fy = Py + p.sc * (sr * it.vx + cr * it.vy);
    // Small glass is drawn a little fat and solid, or it falls between pixels.
    const sz0 = p.sc * p.fs, small = sz0 < 0.62, sz = small ? sz0 * 1.3 : sz0;
    const th = Math.atan2(Py - CY, Px - CX);
    for (let j = 0; j < N; j++) {
      if (j && p.fan <= 0) break;
      const a = ((TAU * j) / N) * p.fan;
      const c = Math.cos(a), sn = Math.sin(a);
      let qx = c * (fx - CX) - sn * (fy - CY), qy = sn * (fx - CX) + c * (fy - CY);
      const tone = small ? (j ? 0.75 : 1) : j ? Math.min(it.f.tone, 0.5) : it.f.tone;
      const rr = r + a, cr2 = Math.cos(rr) * sz, sr2 = Math.sin(rr) * sz;
      if (j % 2 === 0) { putFacetM(it.f, CX + qx, CY + qy, cr2, -sr2, sr2, cr2, tone, j > 0); continue; }
      // Odd images are mirror images, reflected in their own radius, as in a real tube.
      const ph = 2 * (th + a), c2 = Math.cos(ph), s2 = Math.sin(ph);
      const mx = c2 * qx + s2 * qy, my = s2 * qx - c2 * qy;
      // M = Ref(ph) * R(rr) * sz
      putFacetM(it.f, CX + mx, CY + my, c2 * cr2 + s2 * sr2, -c2 * sr2 + s2 * cr2, s2 * cr2 - c2 * sr2, -s2 * sr2 - c2 * cr2, tone, true);
    }
  }
}


/** The old digits going in: shrink into the eyepiece, fan into a rosette, fall into the centre. */
function exitPose(dir, { sr, rr: ROSETTE }) {
  const f = (e, d0) => {
    const i = inOut(e / 0.55), fall = inCubic((e - 0.62) / 0.38);
    return {
      rho: (d0 + (ROSETTE - d0) * i) * (1 - fall),
      ang: dir * (0.45 * i + 2.6 * inCubic((e - 0.5) / 0.5)),
      sc: (1 + (sr - 1) * i) * (1 - 0.7 * fall),
      fan: smooth((e - 0.38) / 0.24),
      fs: 0.88,
    };
  };
  f.after = 'hide';
  return f;
}

/**
 * The new digits coming out: born in the centre as a rosette that grows and
 * turns, holds, then the image flies home (its reflections pass out of the
 * eyepiece and are gone) and lands with a small overshoot.
 */
function birthPose(dir, { sr, rr: ROSETTE }, extra) {
  const f = (u, d0) => {
    const g = outCubic(u / 0.32), out = (u - 0.5) / 0.5;
    return {
      rho: u < 0.5 ? ROSETTE * g : ROSETTE + (d0 - ROSETTE) * outBack(out, 0.9),
      ang: dir * (1.4 + extra * TAU) * (1 - outCubic(u / 0.5)),
      sc: u < 0.5 ? 0.08 + (sr - 0.08) * g : sr + (1 - sr) * inOut(out),
      fan: 1,
      fs: 0.86 + 0.14 * outBack((u - 0.86) / 0.14, 2.2),
    };
  };
  f.before = 'hide';
  return f;
}

/** Cracking: the seams open and the facets shiver. */
function drawCrack(dgt, sx, sy, tau, k0, amp) {
  const crack = smooth((tau - k0) / 0.9) * amp;
  for (const f of FACETS[dgt]) {
    const sh = crack * 0.08 * Math.sin(TAU * 7 * tau + f.h * 20);
    putFacet(f, sx + f.cx + crack * 0.6 * Math.sin(TAU * 5 * tau + f.h * 9), sy + f.cy + crack * 0.3 * Math.sin(TAU * 3.7 * tau + f.h * 4), sh, 1 - 0.12 * crack, f.tone);
  }
}

/**
 * The hour: cracking while the mandala spins up, then caught in the spin:
 * each facet is drawn round into the rim of the eyepiece, rides it, and
 * falls into the point the image collapses to.
 */
const collapse = (tau) => 1 - inOut((tau + 1.7) / 1.6);
function drawWhirl(dgt, sx, sy, tau, slot) {
  const crack = smooth((tau + 4.4) / 1.2);
  for (const f of FACETS[dgt]) {
    const t0 = -3.1 + 0.9 * f.h + 0.12 * slot;
    const tx = sx + f.cx, ty = sy + f.cy;
    if (tau < t0) {
      const sh = crack * 0.09 * Math.sin(TAU * 8 * tau + f.h * 20);
      putFacet(f, tx + crack * 0.7 * Math.sin(TAU * 6 * tau + f.h * 9), ty + crack * 0.4 * Math.sin(TAU * 4.3 * tau + f.h * 5), sh, 1 - 0.12 * crack, f.tone);
      continue;
    }
    const e = inOut((tau - t0) / 1.1);
    const r0 = Math.hypot(tx - CX, ty - CY), a0 = Math.atan2(ty - CY, tx - CX);
    const r = (r0 + (22 + 6 * f.h - r0) * e) * collapse(tau);
    const a = a0 + (spinUp(tau) - spinUp(t0)) * smooth((tau - t0) / 0.8);
    if (r < 0.5) continue;
    const sc = (1 - 0.45 * e) * (0.3 + 0.7 * collapse(tau));
    putFacet(f, CX + r * Math.cos(a), CY + r * Math.sin(a), a - a0, sc, f.tone);
  }
}

export default {
  name: 'Kaleidoscope',
  blurb: 'Cut-glass digits before a turning N-fold kaleidoscope; on the minute the tube turns, old facets spiral into the mandala and the new digit unfolds from a rosette of its reflections; on the hour the symmetry changes.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000;
    const late = f.sec >= 30;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;

    // The hour this mandala belongs to changes at the hour's :00.
    const tE = f.m * 60 + f.sec;
    const eraKey = Math.round((T - tE) / 60);
    const N = SYM(f.h);
    const B = bitsFor(eraKey, N);
    const j0 = Math.floor(tE / 60), sec = tE - 60 * j0;
    const Kof = (lag) => Math.max(0, j0 - 1) + (j0 >= 1 ? turnEase(sec, lag) : 0) + turnEase(sec - 60, lag);
    const K = Kof(0.5);

    let alpha = 0.012 * tE + 0.62 * K;
    let beta = (TAU * tE) / 240 + 0.3 * K;
    let z = 1 + 0.05 * Math.sin((TAU * tE) / 9), rv = DISC;
    if (!hour) {
      // The bloom: the image swells open as the tube turns.
      const b = Math.sin(Math.PI * clamp01((tau + 1.0) / 3.4));
      z *= 1 + 0.32 * b * b;
    } else if (tau < 0) {
      // Spinning up, swelling, then falling into the centre.
      beta += spinUp(tau);
      z *= 1 + 0.25 * Math.sin(Math.PI * clamp01((tau + 4) / 2.8)) - 0.45 * (1 - collapse(tau));
      rv = DISC * collapse(tau);
    } else {
      // A new image crystallising outward from the point, still turning.
      beta -= 3.2 * (1 - (1 - clamp01(tau / 3.2)) ** 3);
      z *= 0.55 + 0.45 * outBack(tau / 1.8, 1.4);
      rv = (DISC + 1) * outCubic((tau - 0.05) / 1.3);
    }
    // While glass flies through the eyepiece the bits drain to their rims.
    const drain = hour ? smooth((tau + 3.2) / 0.8) * (1 - smooth((tau - 3.0) / 1.2))
      : smooth((tau + 1.9) / 0.6) * (1 - smooth((tau - 2.0) / 0.9));
    if (rv > 0.5) mandala(g, B, N, tE, Kof, alpha, beta, z, 1 - 0.9 * drain, rv);
    // The front of the image as it implodes or grows: a bright ring.
    if (rv > 0.5 && rv < DISC - 0.5) g.ring(CX, CY, rv - 0.3, rv + 0.9, 1);
    drawRim(g, alpha + (hour && tau < 0 ? spinUp(tau) * 0.5 : 0));

    // The shock ring of the hour.
    if (hour && tau >= 0 && tau < 1.2) {
      const r = 3 + 100 * outCubic(tau / 1.2);
      const lv = 1 - tau / 1.2;
      g.fillWhere((px, py) => {
        const d = Math.hypot(px - CX, py - CY);
        return Math.abs(d - r) < 1.6 ? lv : Math.abs(d - r * 0.8) < 0.8 ? lv * 0.5 : false;
      });
    }

    // The digits.
    DL.fill(0);
    const [ox, oy] = orbit(date, 2, 3);
    const a = digitsOf(from), b = digitsOf(to);
    const dir = to.minuteKey % 2 ? 1 : -1;
    const glintT = (T % 17);
    const glint = glintT < 1.4 ? 58 + (glintT / 1.4) * 100 : null;
    const changed = [0, 1, 2, 3].filter((k) => hour || a[k] !== b[k]);
    for (let k = 0; k < 4; k++) {
      const sx = SLOTS[k][0] + ox, sy = SLOTS[k][1] + oy;
      if (hour && tau < 0) {
        if (tau < -4.4) drawStatic(a[k], sx, sy, glint);
        else drawWhirl(a[k], sx, sy, tau, k);
        continue;
      }
      if (changed.includes(k) && tau > -3.4 && tau < (hour ? 5.1 : 3.5)) {
        if (tau < -2.3) drawCrack(a[k], sx, sy, tau, -3.3, 1);
        continue;
      }
      const landed = !hour ? tau > 3.5 && tau < 4.4 : tau > 5.1 && tau < 6.0;
      const gl = landed && changed.includes(k) ? 58 + ((tau - (hour ? 5.1 : 3.5)) / 0.9) * 100 : glint;
      drawStatic(tau < 0 ? a[k] : b[k], sx, sy, gl);
    }
    if (changed.length && !hour && tau >= -2.3 && tau < 0) {
      const grp = groupOf(a, changed, ox, oy);
      drawGroup(grp, N, (it) => (tau + 2.3 - 0.22 * it.o) / 1.95, exitPose(dir, rosette(grp, N)));
    }
    if (changed.length && tau >= 0 && tau < (hour ? 5.1 : 3.5)) {
      if (hour) {
        // One rosette for each digit in turn, each flying home.
        for (const k of changed) {
          const grp = groupOf(b, [k], ox, oy);
          drawGroup(grp, N, (it) => (tau - 0.6 - 0.55 * k - 0.2 * it.o) / 2.6, birthPose(k % 2 ? -dir : dir, rosette(grp, N), 0.5));
        }
      } else {
        const grp = groupOf(b, changed, ox, oy);
        drawGroup(grp, N, (it) => (tau - 0.05 - 0.2 * it.o) / 3.2, birthPose(dir, rosette(grp, N), 0));
      }
    }
    composeDigits(g);

    // The new order, for a moment after the hour.
    if (hour && tau > 0.4 && tau < 4.2) {
      const txt = `${SYM(to.h)}-FOLD`;
      const tw = font3x5.measure(txt);
      const x = Math.round(CX - tw / 2), y = 57;
      g.fillRect(x - 2, y - 1, tw + 4, 7, 0);
      if (tau < 3.8 || Math.floor(tau * 10) % 2) g.text(txt, x, y, { font: font3x5 });
    }

    oled.invert(hour && tau >= 0 && tau < 0.034);
    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};
