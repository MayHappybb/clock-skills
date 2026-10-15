// Cyanotype: the fronds. Every numeral is one seaweed specimen laid in the
// digit's shape: a smooth rachis (the stem, the stroke that carries the
// digit) feathered with alternate pinnae on its outer side, short stubs on
// the side that faces a counter (so a counter never fills), tapering at its
// free ends. The same builder makes the loose specimens of the hour's full
// plate (a fern, a forked wrack, a tuft) and the drifting sprig.
//
// A frond is data, built once (flash tables on the device): stem dots
// (position, radius, arc length, normal) and pinnae (a stem dot they grow
// from, a resting direction, and their own dots as offsets from it). The
// frame turns it into silhouette coverage with cyanotype.js's stamp().

import { hash, rand } from '../js/kit.js';

// ------------------------------------------------------------ the digit skeletons
// Normalised boxes (0..1, y down). p: a smooth path through points
// (Catmull-Rom); e: an ellipse arc [cu, cv, ru, rv, a0, a1] (radians,
// x = cu + ru cos a, y = cv + rv sin a). Each stroke grows from its first
// point, so the pinnae point towards its end.
const PI = Math.PI;
export const SKELETONS = [
  /* 0 */ [{ e: [0.5, 0.5, 0.5, 0.5, PI / 2, PI / 2 + 2 * PI] }],
  /* 1 */ [{ p: [[0.62, 1], [0.6, 0.5], [0.62, 0]] }, { p: [[0.62, 0], [0.42, 0.11], [0.2, 0.23]] }],
  /* 2 */ [{ p: [[0.05, 0.25], [0.24, 0.04], [0.55, 0], [0.86, 0.13], [0.92, 0.36], [0.68, 0.6], [0.32, 0.83], [0.03, 1]] },
           { p: [[0.03, 1], [0.5, 0.995], [1, 1]] }],
  /* 3 */ [{ p: [[0.06, 0.12], [0.38, 0], [0.78, 0.05], [0.88, 0.25], [0.68, 0.42], [0.38, 0.47]] },
           { p: [[0.38, 0.47], [0.76, 0.52], [0.96, 0.73], [0.84, 0.94], [0.48, 1], [0.04, 0.88]] }],
  /* 4 */ [{ p: [[0.72, 1], [0.72, 0.5], [0.72, 0]] }, { p: [[0.72, 0], [0.38, 0.35], [0.02, 0.69]] },
           { p: [[0.02, 0.69], [0.5, 0.69], [1, 0.69]] }],
  /* 5 */ [{ p: [[0.94, 0], [0.55, 0], [0.16, 0]] }, { p: [[0.16, 0], [0.13, 0.22], [0.1, 0.45]] },
           { p: [[0.1, 0.45], [0.42, 0.37], [0.8, 0.42], [0.97, 0.66], [0.85, 0.9], [0.5, 1], [0.05, 0.9]] }],
  /* 6 */ [{ e: [0.5, 0.69, 0.48, 0.31, PI, 3 * PI] },
           { p: [[0.02, 0.69], [0.07, 0.36], [0.29, 0.08], [0.6, 0], [0.9, 0.09]] }],
  /* 7 */ [{ p: [[0, 0], [0.5, 0], [1, 0]] }, { p: [[1, 0], [0.72, 0.33], [0.52, 0.66], [0.44, 1]] }],
  /* 8 */ [{ e: [0.5, 0.235, 0.4, 0.235, PI / 2, PI / 2 + 2 * PI] },
           { e: [0.5, 0.71, 0.5, 0.29, -PI / 2, 1.5 * PI] }],
  /* 9 */ [{ e: [0.5, 0.31, 0.48, 0.31, 0, 2 * PI] },
           { p: [[0.98, 0.31], [0.94, 0.64], [0.72, 0.92], [0.4, 1], [0.1, 0.92]] }],
];
/** Where the stipe leaves each digit, as a target in the normalised box (the nearest stem dot is used). */
const ANCHOR = [[0.5, 1], [0.62, 1], [0.5, 1], [0.48, 1], [0.72, 1], [0.5, 1], [0.5, 1], [0.44, 1], [0.5, 1], [0.4, 1]];

// ------------------------------------------------------------ curves

function catmull(P, step = 0.25) {
  const out = [];
  const n = P.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[n - 1]);
  return out;
}

function ellipse([cx, cy, rx, ry, a0, a1], step = 0.25) {
  const per = PI * (rx + ry), k = Math.max(16, Math.ceil((per * Math.abs(a1 - a0)) / (2 * PI) / step));
  const out = [];
  for (let j = 0; j <= k; j++) { const a = a0 + ((a1 - a0) * j) / k; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

/** Resample a dense polyline at even arc-length spacing. */
function resample(pts, spacing) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1], n = Math.max(2, Math.round(total / spacing) + 1), out = [];
  let k = 0;
  for (let j = 0; j < n; j++) {
    const s = (total * j) / (n - 1);
    while (k < L.length - 2 && L[k + 1] < s) k++;
    const u = L[k + 1] > L[k] ? (s - L[k]) / (L[k + 1] - L[k]) : 0;
    out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, s]);
  }
  return { pts: out, total };
}

// ------------------------------------------------------------ the generic frond

/**
 * Build a frond from strokes in pixel coordinates.
 * strokes: [{ pts: [[x, y], ...] dense, closed, r0, r1 (radius at start/end), taper (px at free ends),
 *             pin: pinna length scale (0 = bare), pinIn: max length on a counter's side }]
 * opt: { pitch, angle (rad from the tangent), seed, counter(x, y) -> bool, alpha, spacing }
 */
export function makeFrond(strokes, opt) {
  const { pitch = 2.3, angle = 0.95, seed = 1, counter = null, spacing = 1 } = opt;
  const sx = [], sy = [], sr = [], ss = [], snx = [], sny = [];
  const strokeOf = [], ls = [], totals = [], firstDot = [], lastDot = [];
  let arc = 0;
  strokes.forEach((st, si) => {
    const { pts, total } = resample(st.pts, spacing);
    const n = pts.length;
    totals.push(total); firstDot.push(sx.length); lastDot.push(sx.length + n - 1);
    for (let i = 0; i < n; i++) {
      const [x, y, s] = pts[i];
      ls.push(s);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      // radius: r0 -> r1 along the stroke, thinned at free ends
      let r = st.r0 + (st.r1 - st.r0) * (s / (total || 1));
      if (!st.closed && st.taper) {
        const e0 = st.freeStart ? s : 1e9, e1 = st.freeEnd ? total - s : 1e9;
        const e = Math.min(e0, e1);
        if (e < st.taper) r *= 0.55 + 0.45 * (e / st.taper);
      }
      sx.push(x); sy.push(y); sr.push(r); ss.push(arc + s); snx.push(-ty); sny.push(tx);
      strokeOf.push(si);
    }
    arc += total + 7;
  });

  // pinnae: alternate sides along each stroke, pointing forward
  const bBase = [], bStart = [], bCount = [], bDirX = [], bDirY = [], bAng = [], bPh = [];
  const dox = [], doy = [], dr = [], da = [];
  const nStem = sx.length;
  const near = (x, y, i0, minArc) => {
    // is (x, y) close to the stem anywhere far (along the stem) from dot i0?
    for (let j = 0; j < nStem; j++) {
      if (Math.abs(ss[j] - ss[i0]) < minArc) continue;
      const dx = x - sx[j], dy = y - sy[j], q = sr[j] + 1.6;
      if (dx * dx + dy * dy < q * q) return true;
    }
    return false;
  };
  let side = (hash(seed, 7) & 1) ? 1 : -1, nextS = 0.6 * pitch;
  for (let i = 0; i < nStem; i++) {
    const st = strokes[strokeOf[i]];
    if (!st.pin) continue;
    if (i > 0 && strokeOf[i - 1] !== strokeOf[i]) nextS = ss[i] + 0.6 * pitch;
    if (ss[i] < nextS) continue;
    const jit = rand(seed, i, 3);
    nextS = ss[i] + pitch * (0.85 + 0.3 * jit);
    side = -side;
    // the stroke's own tangent at this dot
    const tx = sny[i], ty = -snx[i];
    const ang = side * angle;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // rotate the tangent by ang (screen coordinates): side +1 turns towards +normal
    let dx = tx * ca - ty * sa, dy = tx * sa + ty * ca;
    const nside = dx * snx[i] + dy * sny[i] > 0 ? 1 : -1;
    // length: an envelope along the stroke, a little noise
    const sl = st.pinEnv ? st.pinEnv(ls[i], totals[strokeOf[i]]) : 1;
    let L = st.pin * (0.75 + 0.5 * rand(seed, i, 5)) * sl;
    // which side is this: the counter's side gets only a stub
    const r = sr[i];
    const px = sx[i] + snx[i] * nside * (r + 2.2), py = sy[i] + sny[i] * nside * (r + 2.2);
    if (counter && counter(px, py)) L = Math.min(L, st.pinIn ?? 1.2);
    if (L < 0.8) continue;
    // walk out, stop before touching another part of the stem
    const start = dox.length;
    const step = 0.7, root = r * 0.8;
    for (let d = root; d <= root + L; d += step) {
      const ox = dx * d, oy = dy * d;
      if (near(sx[i] + ox, sy[i] + oy, i, 6)) break;
      const u = (d - root) / L;
      dox.push(ox); doy.push(oy);
      dr.push(1.0 - 0.45 * u);
      da.push(Math.round(235 - 85 * u));
    }
    if (dox.length - start < 1) { dox.length = dr.length = da.length = doy.length = start; continue; }
    bBase.push(i); bStart.push(start); bCount.push(dox.length - start);
    bDirX.push(dx); bDirY.push(dy); bAng.push(ang); bPh.push(rand(seed, i, 9) * 6.283);
  }
  // forked tips: a free end splits in two short strands, as a frond's growing tips do
  strokes.forEach((st, si) => {
    if (!st.fork || st.closed) return;
    for (const [free, i, sg] of [[st.freeStart, firstDot[si], -1], [st.freeEnd, lastDot[si], 1]]) {
      if (!free) continue;
      const tx = sny[i] * sg, ty = -snx[i] * sg;
      for (const ang of [-0.5, 0.5]) {
        const ca = Math.cos(ang), sa = Math.sin(ang), dx = tx * ca - ty * sa, dy = tx * sa + ty * ca;
        const start = dox.length;
        for (let d = 0.6; d <= st.fork; d += 0.7) {
          const u = d / st.fork;
          dox.push(dx * d); doy.push(dy * d); dr.push(sr[i] * (1 - 0.5 * u)); da.push(Math.round(250 - 60 * u));
        }
        bBase.push(i); bStart.push(start); bCount.push(dox.length - start);
        bDirX.push(dx); bDirY.push(dy); bAng.push(ang * 0.6); bPh.push(rand(seed, i, 19 + ang) * 6.283);
      }
    }
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < nStem; i++) { x0 = Math.min(x0, sx[i]); x1 = Math.max(x1, sx[i]); y0 = Math.min(y0, sy[i]); y1 = Math.max(y1, sy[i]); }
  const F32 = (a) => Float32Array.from(a);
  return {
    n: nStem, sx: F32(sx), sy: F32(sy), sr: F32(sr), ss: F32(ss), snx: F32(snx), sny: F32(sny),
    m: bBase.length, bBase: Uint16Array.from(bBase), bStart: Uint16Array.from(bStart), bCount: Uint8Array.from(bCount),
    bDirX: F32(bDirX), bDirY: F32(bDirY), bAng: F32(bAng), bPh: F32(bPh),
    k: dox.length, dox: F32(dox), doy: F32(doy), dr: F32(dr), da: Uint8Array.from(da),
    box: [x0, y0, x1, y1],
  };
}

/** Bytes this frond takes as flash tables (int16 Q4 positions, bytes for the rest). */
export const frondBytes = (F) => F.n * 9 + F.m * 9 + F.k * 6;

// ------------------------------------------------------------ digits

function counterTest(strokes, w, h, r) {
  // rasterise the strokes thickened, flood the outside, what is left is counter
  const M = 6, GW = Math.ceil(w) + 2 * M, GH = Math.ceil(h) + 2 * M;
  const ink = new Uint8Array(GW * GH);
  for (const st of strokes)
    for (const [x, y] of st.pts) {
      const q = r + 1;
      for (let yy = Math.floor(y - q); yy <= Math.ceil(y + q); yy++)
        for (let xx = Math.floor(x - q); xx <= Math.ceil(x + q); xx++) {
          if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > q * q) continue;
          const gx = xx + M, gy = yy + M;
          if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) ink[gy * GW + gx] = 1;
        }
    }
  const out = new Uint8Array(GW * GH), st = [0];
  out[0] = 1;
  while (st.length) {
    const i = st.pop(), x = i % GW, y = (i / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      if (!out[j] && !ink[j]) { out[j] = 1; st.push(j); }
    }
  }
  return (x, y) => {
    const gx = Math.floor(x) + M, gy = Math.floor(y) + M;
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return false;
    const j = gy * GW + gx;
    return !out[j] && !ink[j];
  };
}

/**
 * The frond for digit d in a w x h box (pixels, the stroke's outside edge
 * fills the box), core radius r, pinnae up to `pin` px.
 */
export function digitFrond(d, w, h, r, pin, seed) {
  const X = (u) => r + u * (w - 2 * r), Y = (v) => r + v * (h - 2 * r);
  const strokes = SKELETONS[d].map((sk, i) => {
    const sx = (w - 2 * r), sy = (h - 2 * r);
    const pts = sk.e ? ellipse([X(sk.e[0]), Y(sk.e[1]), sk.e[2] * sx, sk.e[3] * sy, sk.e[4], sk.e[5]])
      : catmull(sk.p.map(([u, v]) => [X(u), Y(v)]));
    const closed = !!sk.e && Math.abs(sk.e[5] - sk.e[4]) >= 2 * PI - 1e-6;
    // a stroke's end is free unless another stroke starts or ends there
    const ends = SKELETONS[d].flatMap((o, j) => (j === i || o.e ? [] : [o.p[0], o.p[o.p.length - 1]]));
    const isJoined = (q) => ends.some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) < 0.05);
    const fs = sk.p ? !isJoined(sk.p[0]) : false, fe = sk.p ? !isJoined(sk.p[sk.p.length - 1]) : false;
    // the pinnae swell along an open stroke and shorten at its ends; round a loop they wax and wane
    const env = closed ? (s, T) => 0.82 + 0.18 * Math.sin((s / T) * 6 * PI + d) : (s, T) => 0.55 + 0.45 * Math.sin(PI * Math.min(1, s / T));
    return { pts, closed, r0: r, r1: r, taper: closed ? 0 : 6, freeStart: fs, freeEnd: fe, pin, pinIn: 2.0, pinEnv: env, fork: 3.4 };
  });
  const counter = counterTest(strokes, w, h, r);
  const F = makeFrond(strokes, { pitch: 2.1, angle: 1.1, seed: seed * 31 + d, counter });
  // the anchor: the stem dot nearest the target
  const [au, av] = ANCHOR[d];
  let best = 0, bd = Infinity;
  for (let i = 0; i < F.n; i++) {
    const e = (F.sx[i] - X(au)) ** 2 + (F.sy[i] - Y(av)) ** 2 * 0.5;
    if (e < bd) { bd = e; best = i; }
  }
  F.ax = F.sx[best]; F.ay = F.sy[best] + F.sr[best] * 0.6;
  F.w = w; F.h = h;
  return F;
}

// ------------------------------------------------------------ stipes and holdfasts

/** A stipe from (ax, ay) down to a holdfast at (hx, hy), with its rootlets. */
export function stipeFrond(ax, ay, hx, hy, seed) {
  const pts = [];
  const N = 24, bow = (rand(seed, 1) - 0.5) * 3;
  for (let j = 0; j <= N; j++) {
    const u = j / N;
    pts.push([ax + (hx - ax) * u + bow * Math.sin(PI * u), ay + (hy - ay) * u]);
  }
  const strokes = [{ pts, closed: false, r0: 0.9, r1: 1.25, taper: 0, pin: 0 }];
  // rootlets: short strands fanning down from the base
  for (let k = 0; k < 5; k++) {
    const a = PI / 2 + (k - 2) * 0.55 + (rand(seed, k, 2) - 0.5) * 0.3, L = 2.6 + 2 * rand(seed, k, 4);
    const rp = [];
    for (let j = 0; j <= 6; j++) {
      const u = j / 6, aa = a + (k - 2) * 0.25 * u;
      rp.push([hx + Math.cos(aa) * L * u, hy - 0.5 + Math.sin(aa) * L * u * 0.8]);
    }
    strokes.push({ pts: rp, closed: false, r0: 0.75, r1: 0.45, taper: 0, pin: 0 });
  }
  return makeFrond(strokes, { seed, spacing: 0.9 });
}

// ------------------------------------------------------------ the loose specimens

/** A fern-like plume: a curved rachis from (x, y), heading `dir` (rad), length L, curling `curl`. */
export function plume(x, y, dir, L, curl, pin, seed) {
  const pts = [];
  for (let j = 0, N = Math.ceil(L * 3); j <= N; j++) {
    const u = j / N, a = dir + curl * u * u;
    const px = j ? pts[j - 1][0] + Math.cos(a) * (L / N) : x, py = j ? pts[j - 1][1] + Math.sin(a) * (L / N) : y;
    pts.push([px, py]);
  }
  const env = (s) => 0.35 + 0.65 * Math.sin(PI * Math.min(1, Math.max(0, s / L)) * 0.92 + 0.15);  // a plume: widest below the middle
  return makeFrond([{ pts, closed: false, r0: 1.35, r1: 0.8, taper: 4, freeEnd: true, pin, pinEnv: env, fork: 2.6 }],
    { pitch: 1.9, angle: 1.0, seed });
}

/** A forked wrack: dichotomous branching from (x, y), heading `dir`. */
export function wrack(x, y, dir, L, depth, seed) {
  const strokes = [];
  const grow = (x0, y0, a, len, r, lev) => {
    const pts = [];
    const N = Math.max(3, Math.ceil(len * 2)), bend = (rand(seed, lev, strokes.length) - 0.5) * 0.4;
    for (let j = 0; j <= N; j++) { const u = j / N, aa = a + bend * u; pts.push([x0 + Math.cos(aa) * len * u, y0 + Math.sin(aa) * len * u]); }
    const end = pts[N];
    strokes.push({ pts, closed: false, r0: r, r1: r * 0.85, taper: lev === depth ? 3 : 0, freeEnd: lev === depth, pin: 0 });
    if (lev < depth) {
      const spread = 0.42 + 0.15 * rand(seed, lev, 11);
      grow(end[0], end[1], a - spread, len * 0.78, r * 0.8, lev + 1);
      grow(end[0], end[1], a + spread, len * 0.74, r * 0.8, lev + 1);
    }
  };
  grow(x, y, dir, L, 1.45, 0);
  return makeFrond(strokes, { seed });
}

/** A tuft: fine curling filaments from one point. */
export function tuft(x, y, dir, L, count, seed) {
  const strokes = [];
  for (let k = 0; k < count; k++) {
    const a0 = dir + (k - (count - 1) / 2) * 0.32, c = (rand(seed, k) - 0.5) * 1.6, len = L * (0.7 + 0.4 * rand(seed, k, 1));
    const pts = [];
    let px = x, py = y;
    for (let j = 0, N = Math.ceil(len * 2); j <= N; j++) {
      const a = a0 + c * (j / N) * (j / N);
      pts.push([px, py]); px += Math.cos(a) * (len / N); py += Math.sin(a) * (len / N);
    }
    strokes.push({ pts, closed: false, r0: 1.0, r1: 0.65, taper: 2, freeEnd: true, pin: k % 2 ? 2.4 : 0, pinIn: 2.4 });
  }
  return makeFrond(strokes, { seed, pitch: 2.2, angle: 0.9 });
}
