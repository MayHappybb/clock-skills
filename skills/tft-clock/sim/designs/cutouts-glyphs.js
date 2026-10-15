// Cut-outs: the numerals and the loose shapes, as scissor-cut paper.
//
// Every shape is designed as a few centre-line strokes with a width at each
// point (the way the scissors swing round a form), smoothed, and snipped
// square or slanted at its free ends, the way a blade leaves a stroke. The
// edge then wavers by a fraction of a pixel (a hand cut, not a font). Each
// shape is baked at load into a signed distance field at its display size
// (int8, 1/16 px), which the frame samples rotated and anti-aliased: the
// paper sways on its pin without the edge crawling.
//
// For the minute turn every numeral also carries the scissors' path (its
// contours, counters first, then the outside, traced by marching squares)
// and the waste of the painted sheet it is cut from, split into the pieces
// that fall away (each counter, and the outside in bands along the path),
// with the moment along the path when each is freed.
//
// Flash: 10 numerals x 2 sizes x (field + tau) ~ 2 x 10 x 2 x 1.9 KB = 76 KB,
// paths 20 x ~260 points x 6 B = 31 KB, loose shapes ~8 KB.

import { noise2 } from '../js/kit.js';

export const UNIT_W = 28, UNIT_H = 50;   // the design box of a numeral
export const MARGIN = 5;                 // field padding round the box, px
export const SHEET = 3;                  // the painted sheet overhangs the numeral's box by this, px
const FAR = 127;

// [x, y, half-width] in the 28 x 50 box. `c` closed loop; `s0`/`s1` snip
// angle (degrees off square) at the start / end.
const DIGITS = {
  0: [{ blob: [[14.4, -0.6], [23.4, 5], [28.8, 21], [27.8, 39], [19, 50.6], [8, 48.4], [-0.8, 30], [1.2, 9]] }, { hole: [14.8, 7.2, 13.4, 43.4, 5.6] }],
  1: [
    { p: [[17.4, 3.4, 3.4], [16.8, 26, 4.2], [16.2, 46.6, 5.2]], s0: null, s1: 6 },
    { p: [[16.6, 5, 3.2], [11.5, 8.6, 3], [5.2, 13.8, 3.4]], s0: null, s1: -30 },
  ],
  2: [
    { p: [[4.6, 13, 3.9], [7.2, 5.6, 3.4], [15, 2.8, 3.6], [22.2, 6.2, 4.4], [23.8, 14, 5], [19.8, 23.6, 4.6], [11.6, 33.4, 4], [5, 43.6, 3.8]], s0: 22, s1: null },
    { p: [[4.6, 45, 3.6], [14.5, 45.6, 3.8], [25.6, 44, 4.8]], s0: null, s1: -12 },
  ],
  3: [
    { p: [[3.8, 9.4, 3.9], [9.6, 3.8, 3.4], [17.6, 3.2, 3.8], [22.8, 8.6, 4.6], [21.2, 16.8, 4.2], [12.6, 22.6, 3]], s0: 25, s1: null },
    { p: [[12.6, 22.6, 3], [21, 25.6, 4.4], [25, 35, 5.2], [21.2, 44, 4.6], [12, 47.6, 3.8], [3.6, 42.4, 4]], s0: null, s1: -20 },
  ],
  4: [
    { p: [[14.2, 2.8, 3.9], [8.8, 17, 3.8], [3.6, 32.8, 4]], s0: 18, s1: null },
    { p: [[3.6, 33, 4], [15, 33.6, 3.8], [27.2, 32.8, 3.9]], s0: null, s1: 10 },
    { p: [[20.4, 15.2, 3.6], [20.2, 31, 4.4], [19.6, 47.6, 5.2]], s0: -15, s1: 6 },
  ],
  5: [
    { p: [[25.4, 4.2, 4], [16.4, 3.8, 3.6], [8.2, 4.4, 4]], s0: -14, s1: null },
    { p: [[8.2, 4.4, 4], [7.6, 13, 4], [7, 21.6, 3.6]], s0: null, s1: null },
    { p: [[7, 21.6, 3.4], [13, 18.4, 3.6], [21, 20.6, 4.4], [25, 30.4, 5.2], [22, 41, 4.8], [13, 47.2, 3.8], [3.6, 42.6, 4.2]], s0: null, s1: -18 },
  ],
  6: [
    { p: [[22.6, 5.8, 3.9], [15.4, 3.4, 3.4], [8.4, 9.6, 4.2], [4.6, 20, 4.8], [3.6, 30, 4.6]], s0: 24, s1: null },
    { blob: [[13, 20.4], [24, 24], [29.4, 35], [24.6, 47.6], [12.6, 51], [2.4, 45], [-1, 33], [4, 23]] },
    { hole: [7.4, 38.8, 22.4, 33.4, 4.1] },
  ],
  7: [
    { p: [[2.8, 5.2, 4], [14, 4.4, 3.6], [26, 4.6, 4.2]], s0: -10, s1: null },
    { p: [[26, 4.6, 4.2], [20.6, 16.6, 4.6], [15.6, 31.6, 4.6], [12.8, 47, 5.2]], s0: null, s1: 18 },
  ],
  8: [
    { blob: [[14, -0.6], [23, 3], [25.6, 12.4], [19.6, 21], [14, 23.6], [8, 21], [2.6, 13], [5, 3.4]] },
    { blob: [[14, 19.6], [24.6, 24], [29, 36], [24.6, 47], [14.4, 51.2], [3.8, 47.4], [-0.8, 36], [3.6, 24.4]] },
    { hole: [14.4, 5.6, 13.8, 17.4, 3.1] },
    { hole: [14.8, 27.2, 13.6, 43.6, 4.4] },
  ],
  9: [
    { blob: [[15, -0.8], [25.6, 3.6], [29, 15], [25, 26.6], [15.4, 30], [4, 26.6], [-1, 15.4], [4, 3.6]] },
    { hole: [5, 18, 21.6, 11, 4.6] },
    { p: [[23.4, 15, 4.6], [23.2, 30, 5.2], [18.4, 41, 4.6], [11.4, 47, 3.8], [4.6, 45.2, 4]], s0: null, s1: -22 },
  ],
};

// ------------------------------------------------------------ stroke geometry

/** Catmull-Rom through [x, y, r] points, sampled about every `step` units. */
function spline(p, closed, step = 0.3) {
  const n = p.length, out = [];
  const at = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    const len = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (q) => 0.5 * (2 * b[q] + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t3);
      out.push([f(0), f(1), b[2] + (c[2] - b[2]) * t]);
    }
  }
  if (!closed) out.push(p[n - 1].slice());
  return out;
}

/** A stroke as disks plus its end snips: { pts, snips: [[ex, ey, nx, ny, R]] }. */
function prepStroke(st) {
  if (st.blob) return { blob: spline(st.blob.map((q) => [q[0], q[1], 0]), true, 0.4) };
  if (st.hole) {
    // an almond counter: two snips, the intersection of two disks
    const [x1, y1, x2, y2, h] = st.hole, a = Math.hypot(x2 - x1, y2 - y1) / 2, R = (a * a + h * h) / (2 * h);
    const nx = -(y2 - y1) / (2 * a), ny = (x2 - x1) / (2 * a), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, o = R - h;
    return { hole: [mx + nx * o, my + ny * o, mx - nx * o, my - ny * o, R] };
  }
  const pts = spline(st.p, !!st.c);
  const snips = [];
  if (!st.c) {
    for (const [end, ang] of [[0, st.s0 === undefined ? 0 : st.s0], [1, st.s1 === undefined ? 0 : st.s1]]) {
      if (ang === null) continue;
      const e = end ? pts[pts.length - 1] : pts[0], q = end ? pts[pts.length - 4] : pts[3];
      let tx = e[0] - q[0], ty = e[1] - q[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const a = (ang * Math.PI) / 180, nx = tx * Math.cos(a) - ty * Math.sin(a), ny = tx * Math.sin(a) + ty * Math.cos(a);
      snips.push([e[0], e[1], nx, ny, e[2] * 2.6]);
    }
  }
  return { pts, snips };
}

/** Distance (design units, negative inside) to a set of prepared strokes. */
function strokesDist(strokes, x, y) {
  let d = Infinity;
  for (const s of strokes) {
    if (s.hole) continue;
    if (s.blob) {
      const P = s.blob;
      let e = Infinity, inside = false;
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
        const [xa, ya] = P[a], [xb, yb] = P[b], ex = xb - xa, ey = yb - ya, l2 = ex * ex + ey * ey || 1;
        const u = Math.max(0, Math.min(1, ((x - xa) * ex + (y - ya) * ey) / l2));
        e = Math.min(e, Math.hypot(x - xa - u * ex, y - ya - u * ey));
        if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
      }
      e = inside ? -e : e;
      if (e < d) d = e;
      continue;
    }
    let ds = Infinity;
    for (const [px, py, r] of s.pts) {
      const e = Math.hypot(x - px, y - py) - r;
      if (e < ds) ds = e;
    }
    for (const [ex, ey, nx, ny, R] of s.snips)
      if (Math.hypot(x - ex, y - ey) < R) ds = Math.max(ds, (x - ex) * nx + (y - ey) * ny);
    if (ds < d) d = ds;
  }
  for (const s of strokes) if (s.hole) {
    const [ax, ay, bx, by, R] = s.hole;
    d = Math.max(d, -Math.max(Math.hypot(x - ax, y - ay) - R, Math.hypot(x - bx, y - by) - R));
  }
  return d;
}

/**
 * Bake strokes into a field: `k` px per design unit, design box bw x bh,
 * `wob` px of hand-cut waver, `seed` for it.
 */
export function bakeField(strokesSpec, k, bw, bh, wob, seed, margin = MARGIN) {
  const strokes = strokesSpec.map(prepStroke);
  const w = Math.ceil(bw * k) + 2 * margin, h = Math.ceil(bh * k) + 2 * margin;
  const d = new Int8Array(w * h), f = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5 - margin) / k, y = (j + 0.5 - margin) / k;
      let v = strokesDist(strokes, x, y) * k;
      v += wob * (noise2((i + seed * 31) * 0.21, j * 0.21, seed) * 2 - 1);
      f[j * w + i] = v;
      d[j * w + i] = Math.max(-FAR, Math.min(FAR, Math.round(v * 16)));
    }
  return { w, h, d, f, margin, k };
}

// ------------------------------------------------------------ contours (the scissors' path)

/** Closed loops of the zero level of a float field, in field pixel coordinates. */
function traceLoops(F) {
  const { w, h, f } = F;
  const v = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 9 : f[j * w + i]);
  const pt = new Map(), adj = new Map();
  const key = (t, i, j) => `${t}${i},${j}`;
  const cross = (t, i, j) => {
    const k = key(t, i, j);
    if (!pt.has(k)) {
      const a = v(i, j), b = t === 'h' ? v(i + 1, j) : v(i, j + 1), u = a / (a - b);
      pt.set(k, t === 'h' ? [i + 0.5 + u, j + 0.5] : [i + 0.5, j + 0.5 + u]);
    }
    return k;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  };
  for (let j = -1; j < h; j++)
    for (let i = -1; i < w; i++) {
      const c0 = v(i, j) < 0, c1 = v(i + 1, j) < 0, c2 = v(i + 1, j + 1) < 0, c3 = v(i, j + 1) < 0;
      const e = [];
      if (c0 !== c1) e.push(cross('h', i, j));
      if (c1 !== c2) e.push(cross('v', i + 1, j));
      if (c3 !== c2) e.push(cross('h', i, j + 1));
      if (c0 !== c3) e.push(cross('v', i, j));
      if (e.length === 2) link(e[0], e[1]);
      else if (e.length === 4) { link(e[0], e[1]); link(e[2], e[3]); }
    }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur); loop.push(pt.get(cur));
      const nb = adj.get(cur).filter((x) => x !== prev && !seen.has(x));
      prev = cur; cur = nb[0];
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

const area = (L) => { let a = 0; for (let i = 0, j = L.length - 1; i < L.length; j = i++) a += (L[j][0] - L[i][0]) * (L[j][1] + L[i][1]); return a / 2; };

/**
 * The scissors' path for a numeral: counters first (top to bottom), then the
 * outside from its top. Points [x, y, time 0..1]; `lift` marks the jumps
 * between contours (the blade comes out and goes in again elsewhere).
 */
function scissorPath(loops) {
  const sorted = loops.map((L) => ({ L, a: Math.abs(area(L)) })).sort((p, q) => q.a - p.a);
  const outer = sorted[0], inner = sorted.slice(1).sort((p, q) => Math.min(...p.L.map((z) => z[1])) - Math.min(...q.L.map((z) => z[1])));
  const order = [...inner, outer];
  const pts = [], ends = [];
  let len = 0, last = null;
  const LIFT = 0.45;   // a jump costs this fraction of its length in cutting time
  for (const [li, { L }] of order.entries()) {
    // start at the contour's top, run clockwise on screen
    let s = 0;
    for (let i = 1; i < L.length; i++) if (L[i][1] < L[s][1] - 0.01) s = i;
    let ring = [...L.slice(s), ...L.slice(0, s)];
    if (area(ring) > 0) ring = [ring[0], ...ring.slice(1).reverse()];
    ring.push(ring[0]);
    if (last) { len += Math.hypot(ring[0][0] - last[0], ring[0][1] - last[1]) * LIFT; }
    for (let i = 0; i < ring.length; i++) {
      if (i > 0) len += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      pts.push([ring[i][0], ring[i][1], len, i === 0 ? 1 : 0, li]);
      last = ring[i];
    }
    ends.push(len);
  }
  for (const p of pts) p[2] /= len;
  return { pts, len, ends: ends.map((e) => e / len), inner: inner.length };
}

const BANDS = 4;   // the outside's waste comes away in this many pieces

/**
 * Split the sheet's waste into the pieces that fall: each counter is one
 * (it drops out when its contour closes), the outside comes away in BANDS
 * pieces along the path. Per pixel the piece (0 off the sheet, 255 the
 * numeral); per piece the moment it is freed, its centre and its box.
 */
function wastePieces(F, path) {
  const { w, h, f, margin } = F;
  const piece = new Uint8Array(w * h), tau = new Uint8Array(w * h);
  const x0 = margin - SHEET, y0 = margin - SHEET, x1 = w - margin + SHEET, y1 = h - margin + SHEET;
  const nIn = path.inner, tOut = nIn ? path.ends[nIn - 1] : 0;
  const N = nIn + BANDS, acc = Array.from({ length: N }, () => ({ n: 0, sx: 0, sy: 0, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }));
  for (let j = y0; j < y1; j++)
    for (let i = x0; i < x1; i++) {
      if (f[j * w + i] < 0) { piece[j * w + i] = 255; continue; }
      let best = Infinity, t = 0, li = 0;
      for (const p of path.pts) {
        const e = (i + 0.5 - p[0]) ** 2 + (j + 0.5 - p[1]) ** 2;
        if (e < best) { best = e; t = p[2]; li = p[4]; }
      }
      const k = li < nIn ? li : nIn + Math.min(BANDS - 1, Math.floor(((t - tOut) / (1 - tOut)) * BANDS));
      piece[j * w + i] = k + 1; tau[j * w + i] = Math.min(254, Math.round(t * 254));
      const A = acc[k];
      A.n++; A.sx += i + 0.5; A.sy += j + 0.5;
      A.x0 = Math.min(A.x0, i); A.y0 = Math.min(A.y0, j); A.x1 = Math.max(A.x1, i + 1); A.y1 = Math.max(A.y1, j + 1);
    }
  const pieces = acc.map((A, k) => ({
    rel: k < nIn ? path.ends[k] : tOut + ((k - nIn + 1) / BANDS) * (1 - tOut),
    cx: A.n ? A.sx / A.n : 0, cy: A.n ? A.sy / A.n : 0, box: [A.x0, A.y0, A.x1, A.y1], n: A.n,
  })).map((p, k) => ({ ...p, id: k + 1 })).filter((p) => p.n > 0);
  return { piece, tau, pieces, sheet: [x0, y0, x1 - x0, y1 - y0] };
}

/** The pin: high on the numeral, well inside a stroke, near the middle. */
function pinOf(F) {
  const { w, h, f } = F;
  let best = Infinity, at = [w / 2, F.margin + 3];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (f[j * w + i] > -2.2) continue;
      const sc = j + Math.abs(i + 0.5 - w / 2) * 0.55;
      if (sc < best) { best = sc; at = [i + 0.5, j + 0.5]; }
    }
  return at;
}

function bakeDigit(n, k, seed) {
  const F = bakeField(DIGITS[n], k, UNIT_W, UNIT_H, 0.32, seed);
  const path = scissorPath(traceLoops(F));
  const { piece, tau, pieces, sheet } = wastePieces(F, path);
  const P = new Float32Array(path.pts.length * 4);
  path.pts.forEach((p, i) => P.set(p.slice(0, 4), i * 4));
  // freed-by time per piece id, for the frame's lookup
  const rel = new Float32Array(256).fill(2);
  for (const q of pieces) rel[q.id] = q.rel;
  return { w: F.w, h: F.h, d: F.d, margin: F.margin, piece, tau, pieces, rel, sheet, path: P, pathN: path.pts.length, pathLen: path.len, pin: pinOf(F) };
}

export const SIZES = { big: 1.1, small: 0.8 };
export const GLYPHS = {};
for (const [name, k] of Object.entries(SIZES)) GLYPHS[name] = Array.from({ length: 10 }, (_, n) => bakeDigit(n, k, n + 3 + (name === 'small' ? 20 : 0)));

// ------------------------------------------------------------ loose shapes on the wall

function bakeShape(spec, k, bw, bh, wob, seed, pin) {
  const F = bakeField(spec, k, bw, bh, wob, seed, 3);
  return { w: F.w, h: F.h, d: F.d, margin: 3, pin: [pin[0] * k + 3, pin[1] * k + 3] };
}

// Matisse's alga: a wavering stem with fat alternate lobes, cut in one go.
const ALGA = [
  { p: [[10, 40, 1.9], [9, 30, 1.7], [11, 20, 1.5], [9.5, 10, 1.3], [10.5, 2, 1.1]] },
  { p: [[9.4, 33, 1.6], [4.5, 30.5, 2.5], [1.6, 26, 1.9]], s1: 10 },
  { p: [[10.4, 26, 1.5], [15.5, 23.5, 2.4], [18.6, 18.5, 1.8]], s1: -10 },
  { p: [[10.6, 17, 1.4], [5.2, 14.8, 2.2], [2.6, 10.6, 1.6]], s1: 10 },
  { p: [[9.8, 10, 1.3], [14.4, 7.6, 2], [16.2, 3.8, 1.4]], s1: -10 },
  { p: [[9.4, 38, 1.7], [15, 36, 2.6], [18, 31.6, 2]], s1: -6 },
];
// A leaf with three fingers (the "Oceania" kind).
const LEAF = [
  { p: [[9, 30, 1.4], [9, 20, 1.6], [9, 10, 2.6], [9, 3, 2.2]], s0: 0 },
  { p: [[9, 18, 2], [4, 13, 2.8], [2, 7, 2]] },
  { p: [[9, 18, 2], [14, 13, 2.8], [16, 7, 2]] },
  { p: [[9, 24, 1.6], [4.5, 21, 2.2], [2.4, 18, 1.4]], s1: 0 },
  { p: [[9, 24, 1.6], [13.5, 21, 2.2], [15.6, 18, 1.4]], s1: 0 },
];
// A cut star, five points, a little lopsided; and its twin with six.
function starSpec(n, r0, r1, rot) {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? r1 : r0 * (1 + 0.08 * Math.sin(i * 2.3));
    pts.push([10 + r * Math.sin(a), 10 - r * Math.cos(a), 0.6]);
  }
  return pts;
}
function bakePoly(pts, k, bw, bh, seed, pin) {
  const m = 3, w = Math.ceil(bw * k) + 2 * m, h = Math.ceil(bh * k) + 2 * m;
  const d = new Int8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5 - m) / k, y = (j + 0.5 - m) / k;
      let dd = Infinity, inside = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [xa, ya] = pts[a], [xb, yb] = pts[b];
        const ex = xb - xa, ey = yb - ya, l2 = ex * ex + ey * ey;
        const u = Math.max(0, Math.min(1, ((x - xa) * ex + (y - ya) * ey) / l2));
        dd = Math.min(dd, Math.hypot(x - xa - u * ex, y - ya - u * ey));
        if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
      }
      let v = (inside ? -dd : dd) * k + 0.25 * (noise2(i * 0.3, j * 0.3, seed) * 2 - 1);
      d[j * w + i] = Math.max(-FAR, Math.min(FAR, Math.round(v * 16)));
    }
  return { w, h, d, margin: m, pin: [pin[0] * k + m, pin[1] * k + m] };
}

export const SHAPES = {
  alga: bakeShape(ALGA, 0.72, 20, 42, 0.25, 71, [10, 22]),
  leaf: bakeShape(LEAF, 0.8, 18, 32, 0.25, 72, [9, 14]),
  star5: bakePoly(starSpec(5, 9.5, 4.2, 0.1), 0.8, 20, 20, 73, [10, 10]),
  star6: bakePoly(starSpec(6, 9, 4.6, 0.3), 0.8, 20, 20, 74, [10, 10]),
};
