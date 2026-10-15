// Murmuration — starlings at dusk, holding the time.
//
// Each digit is a few dozen to a hundred-odd starlings hovering in formation:
// a calligraphic ribbon letterform (broad-nib stress, tapered ends, a slight
// italic lean), sampled as a jittered grid of birds, so every pour of a digit
// is a new arrangement. Nearer birds are two pixels and flick their wings;
// all of them shimmer about their places, and every few seconds a wave of
// turning (the dark band of a real murmuration: birds banking edge-on) runs
// through the four digits. The colon is two tiny knots of birds circling.
// Below, the sun is half set over the water, glittering on it, wandering
// slowly along the horizon; reeds sway in silhouette against it, and far off
// over the horizon a distant murmuration is always wheeling, small, a cloud
// of black specks when it crosses the sun. The resting time is in front: a
// flock passing behind a digit is hidden by it, so the time stays legible.
//
// The minute: from :55 the distant flock rises and comes in, growing as it
// nears; birds stream in from off the glass to join it. The changing digit
// grows restless, crouches, and lifts off bird by bird (a take-off wave)
// into the flock, so it is gone by :00. Then the murmuration fills the sky:
// it is a thin folded sheet in 3D, rolled and turned in perspective, with
// compression waves running along it, so it is a dense black ribbon where
// it is seen edge-on and a sparse veil face-on, and the nearest birds are
// three-pixel flapping "v"s. From :02 it twists into a funnel over the slot
// and pours down into the new digit bottom up, each bird spiralling in to
// its place with a small overshoot; the rest of the flock drifts back to the
// horizon and the stragglers fly off the glass.
//
// The hour: the whole time lifts, the flock rises huge, and at :01 a
// peregrine stoops through it: the starlings burst away from it (flash
// expansion, a hole that opens round the falcon and closes behind), an
// agitation wave rings out through the flock, and the falcon pulls up and
// leaves. Then the flock rolls across the sky from left to right and roosts
// the new time as it passes.
//
// Everything is closed-form in time: a bird's position is its home, or its
// place on the analytic flock sheet at that instant, or an eased path between
// the two with per-bird timing. Glyphs and turn plans are cached by seed and
// minute only to save work.
//
// Burn-in: the face walks kit.orbit, digits are re-sampled every time they
// are poured, birds never sit still, the sun sweeps the horizon every 90
// minutes. From 23:00 to 07:00 the panel dims (ctx.night).

import { clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const DW = 24, DH = 34, TOP = 5;
const SLOT_X = [3, 29, 76, 102];
const COLON_X = 64.5;
const SLANT = 0.1;

const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const inOut = (u) => { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };

/** An integer hash as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
// Centre-lines in a 20 x 34 box (y down), before the italic lean. Arcs take
// clock angles in degrees (0 = up, clockwise). Each path is one ribbon of
// birds: its width follows a broad nib held at NIB (thin rising diagonals,
// full verticals) and an open path tapers to its ends.

function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

const SKELETON = {
  0: [arc(10.5, 17, 7.6, 14.8, 28, 384, 44)],
  1: [[[3.5, 9.5], [7.5, 6.5], [12, 1.6], [12, 32.4]]],
  2: [[...arc(10.5, 10.4, 7.4, 8.4, -72, 122, 22), [3, 32], [19.5, 32]]],
  3: [arc(10, 9.4, 7, 7.6, -68, 196, 24), arc(10.5, 23.6, 8, 9.4, -18, 238, 26)],
  4: [[[15, 32.4], [15, 1.8], [1.8, 22.5], [20, 22.5]]],
  5: [[[18.5, 2], [5.4, 2], [4.4, 15.6], ...arc(10.6, 23, 8, 9.6, -50, 228, 24).slice(1)]],
  7: [[[2.5, 2.2], [19, 2.2], [8.5, 32.4]]],
  8: [arc(10.5, 9.4, 6.4, 7.6, 180, 540, 30), arc(10.5, 24, 8, 9.6, 0, 360, 34)],
  9: [[...arc(10.5, 11, 7.6, 9, 90, 450, 34), ...arc(6.5, 11, 11.6, 21.4, 90, 192, 14).slice(1)]],
};
SKELETON[6] = SKELETON[9].map((p) => p.map(([x, y]) => [21 - x, 34 - y]));

const HW = 3.0;                    // a ribbon's full half-width
const NIB = (-38 * Math.PI) / 180; // the pen angle: strokes along it are thin
const TAPER = 8;

// Segments [ax, ay, bx, by, s0, len, L, open, nib].
const SEGS = {};
for (const [d, paths] of Object.entries(SKELETON)) {
  const s = [];
  for (const p of paths) {
    const open = Math.hypot(p[0][0] - p.at(-1)[0], p[0][1] - p.at(-1)[1]) > 0.5;
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], len = Math.hypot(dx, dy);
      const nib = 0.6 + 0.4 * Math.abs(Math.sin(Math.atan2(dy, dx) - NIB));
      s.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], acc, len, L, open, nib]);
      acc += len;
    }
  }
  SEGS[d] = s;
}

/**
 * One digit as birds: a jittered grid over the box, keeping the points that
 * fall inside the ribbon (thinned at its edges). Per bird: position in the
 * slot, size class and the phases of its shimmer and wing flicks.
 */
function buildGlyph(d, seed) {
  const segs = SEGS[d];
  const S = 1.5;
  const ox = hash(seed, 1, 1) * S, oy = hash(seed, 2, 1) * S;
  const xs = [], ys = [];
  for (let gy = -1; gy * S < DH + 1; gy++)
    for (let gx = -1; gx * S < DW + 1; gx++) {
      const px = gx * S + ox + (hash(gx, gy, seed) - 0.5) * S * 0.75;
      const py = gy * S + oy + (hash(gx, gy, seed + 7) - 0.5) * S * 0.75;
      const sx = px - SLANT * (DH - py);
      let best = 9;
      for (const [ax, ay, bx, by, s0, len, L, open, nib] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp01(((sx - ax) * dx + (py - ay) * dy) / l2) : 0;
        const e = Math.hypot(sx - ax - u * dx, py - ay - u * dy);
        const end = open ? Math.min(s0 + u * len, L - s0 - u * len) : 99;
        const w = HW * nib * (0.6 + 0.4 * smooth(end / TAPER));
        const v = e / Math.max(0.9, w);
        if (v < best) best = v;
      }
      if (best > 1.05) continue;
      if (best > 0.75 && hash(gx, gy, seed + 3) > (1.05 - best) / 0.3) continue;
      xs.push(px); ys.push(py);
    }
  const n = xs.length;
  const g = { n, x: Float32Array.from(xs), y: Float32Array.from(ys), big: new Uint8Array(n), p: new Float32Array(n * 4) };
  for (let i = 0; i < n; i++) {
    g.big[i] = hash(i, 5, seed) < 0.5 ? 1 : 0;
    for (let k = 0; k < 4; k++) g.p[i * 4 + k] = hash(i, 20 + k, seed);
  }
  return g;
}

const GLYPHS = new Map();
function glyph(d, seed) {
  const k = `${d}:${seed}`;
  let v = GLYPHS.get(k);
  if (!v) {
    if (GLYPHS.size > 40) GLYPHS.clear();
    v = buildGlyph(d, seed);
    GLYPHS.set(k, v);
  }
  return v;
}

/** Each digit is new birds every time it is formed: seed by the minute it was poured. */
function seedOf(k, c) {
  const day = c.year * 400 + c.day * 13 + c.month.charCodeAt(0) * 3 + c.month.charCodeAt(2);
  const m = k === 3 ? c.m : k === 2 ? c.m - (c.m % 10) : 0;
  return ((day * 24 + c.h) * 60 + m) * 4 + k;
}

// ------------------------------------------------------------ birds

/**
 * One starling at (x, y). Size 0 is a far speck, 1 a near bird whose wings
 * flick (two pixels open, one shut), 2 a close bird, a three-pixel "v"
 * beating its wings.
 */
let PG = null, PC = 1, PB = false;
function put(px, py) {
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const i = py * W + px;
  if (PB) { if (!MASK[i]) PG.pixel(px, py, PC); return; }
  PG.pixel(px, py, PC);
  if (MARK) { if (px < SPAN0[py]) SPAN0[py] = px; if (px > SPAN1[py]) SPAN1[py] = px; }
}
function bird(g, x, y, sz, ph, behind = false) {
  const ix = Math.floor(x), iy = Math.floor(y);
  PG = g; PB = behind; PC = iy > SUN.y - SUN_R - 1 ? ink(ix, iy) : 1;
  put(ix, iy);
  if (sz === 1) { if (Math.sin(ph) > -0.55) put(ix + 1, iy); return; }
  if (sz >= 2) {
    const s = Math.sin(ph), wy = s > 0.3 ? -1 : s < -0.45 ? 1 : 0;
    put(ix - 1, iy + wy); put(ix + 1, iy + wy);
  }
}

/**
 * The resting time is in front: birds of the flock that pass behind a
 * resting digit are hidden by it (MASK, its pixels grown by one), so the
 * time stays legible while the murmuration wheels behind.
 */
const MASK = new Uint8Array(W * H);
const SPAN0 = new Int16Array(H), SPAN1 = new Int16Array(H);
let MARK = false;
function beginMark() { SPAN0.fill(W); SPAN1.fill(-1); MARK = true; }
/** Mask what was drawn since beginMark: each row from its first to last pixel, grown by one. */
function endMark() {
  for (let y = 0; y < H; y++) {
    if (SPAN1[y] < 0) continue;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
      MASK.fill(1, yy * W + Math.max(0, SPAN0[y] - 1), yy * W + Math.min(W, SPAN1[y] + 2));
  }
  MARK = false;
}

/**
 * The waves of turning that run through the resting flock: a band crosses
 * the glass every 7 s, alternating direction. Birds in it bank (thin, a
 * pixel up), and flash their wings just behind it. Returns [band, behind].
 */
function turningWave(x, T) {
  const q = T / 7, n = Math.floor(q), f = q - n;
  const dir = hash(n, 3, 77) < 0.5 ? 1 : -1;
  const xf = dir > 0 ? -16 + 260 * f : 144 - 260 * f;
  const d = (x - xf) * dir;
  return [Math.exp(-((d / 4.5) ** 2)), d < -4 && d > -11 ? 1 : 0];
}

/**
 * Where a resting bird of glyph `gl` is: its place plus a shimmer of two
 * slow sines, `amp` times as wide (restless before take-off, fluttering
 * after landing). Writes [x, y, size, phase] into `out`.
 */
function homeAt(gl, i, x0, y0, T, amp, out) {
  const p = gl.p, j = i * 4;
  const w1 = 1.3 + 1.6 * p[j], w2 = 0.9 + 1.4 * p[j + 1];
  let x = x0 + gl.x[i] + amp * (0.42 * Math.sin(T * w1 + 6.3 * p[j + 2]) + 0.22 * Math.sin(T * 2.7 * w2 + 1.1));
  let y = y0 + gl.y[i] + amp * (0.38 * Math.sin(T * w2 + 6.3 * p[j + 3]) + 0.2 * Math.sin(T * 3.1 * w1 + 2.3));
  const [band, behind] = turningWave(x, T);
  y -= 1.1 * band;
  let sz = gl.big[i];
  if (band > 0.45) sz = 0;
  else if (behind) sz = 1;
  out[0] = x; out[1] = y; out[2] = sz;
  // Wing flicks: slow for birds hovering in place, quickened by agitation.
  out[3] = T * (2.5 + 3 * p[j + 1]) * (0.6 + 0.4 * amp) + 6.3 * p[j];
  return out;
}

/** The colon: two little knots of birds wheeling round each other. */
function colon(g, cx, cy, T) {
  for (let k = 0; k < 2; k++) {
    const y = cy + (k ? 24 : 11);
    for (let i = 0; i < 6; i++) {
      const r = 0.5 + 1.1 * hash(i, k, 9), w = (1.4 + 1.2 * hash(i, k, 10)) * (i % 3 ? 1 : -1);
      const a = T * w + 6.3 * hash(i, k, 11);
      bird(g, cx + r * Math.cos(a), y + r * 1.1 * Math.sin(a), 0, 0);
    }
  }
}

// ------------------------------------------------------------ the flock
//
// A murmuration is modelled as a thin, folded sheet of birds in 3D. Each bird
// has fixed coordinates (a, b, c) on the sheet: a along it, b across it, c
// through its thickness. Compression waves run along a, the sheet folds and
// undulates, it rolls and yaws in space and is seen in perspective. Where it
// is edge-on its birds pile up into a dense ribbon; face-on it is a veil.
// `P` is where the flock is and how big: centre, scale, spin in the screen
// plane, and `funnel` (0..1), which narrows it into a twisting cone along a.

function flockAt(a, b, c, ph, T, P, out) {
  // Compression waves run along the sheet and across it.
  const aa = a + 0.24 * Math.sin(3.6 * a - 3.1 * T + 0.8 * Math.sin(0.4 * T));
  const bb = b + 0.16 * Math.sin(4.4 * b + 2.3 * T + 1.5 * a);
  const fw = lerp(1, 0.14 + 0.5 * (aa + 1) * 0.5, P.funnel);
  let X = 34 * aa + 4 * (1 - P.funnel) * Math.sin(1.3 * bb + 0.9 * T);
  let Y = fw * (14 * bb + 5 * Math.sin(1.7 * aa - 1.1 * T) + 8 * (aa * aa - 0.35) * Math.sin(0.7 * T + 1));
  // The sheet is folded: a travelling S-fold through its thickness.
  let Z = fw * (2.5 * c + 11 * Math.sin(2.1 * aa + 1.5 * T + 0.8 * b));
  // Roll about the sheet's long axis (a twist when it is a funnel), then yaw.
  const roll = lerp(0.8 + 0.9 * Math.sin(0.9 * T) + 0.3 * Math.sin(2.1 * T + 2), T * 2.6, P.funnel);
  const yaw = (1 - P.funnel) * (0.65 * Math.sin(0.53 * T + 1) + 0.2 * Math.sin(1.3 * T));
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const Y1 = Y * cr - Z * sr, Z1 = Y * sr + Z * cr;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const X2 = X * cy + Z1 * sy, Z2 = -X * sy + Z1 * cy;
  const cs = Math.cos(P.spin), ss = Math.sin(P.spin);
  const x = X2 * cs - Y1 * ss, y = X2 * ss + Y1 * cs;
  const k = (P.s * 80) / (80 - Z2 * P.s);
  // Each bird also weaves a little about its place on the sheet.
  out[0] = P.cx + x * k + 0.7 * P.s * Math.sin(T * 3.1 + 6.3 * ph);
  out[1] = P.cy + y * k * 0.9 + 0.6 * P.s * Math.sin(T * 2.3 + 9.1 * ph);
  out[2] = k > 1.08 ? 2 : k > 0.46 ? 1 : 0;
  out[3] = T * (40 + 22 * ph) + 6.3 * ph;   // flapping, about 7-10 beats a second
  return out;
}

/** The distant murmuration, always wheeling low over the horizon. */
function distant(T, P) {
  P.cx = 64 + 36 * Math.sin(T * 0.023) + 12 * Math.sin(T * 0.061 + 1);
  P.cy = 48.5 + 1.2 * Math.sin(T * 0.09);
  P.s = 0.19 + 0.03 * Math.sin(T * 0.13);
  P.spin = 0.2 * Math.sin(T * 0.05);
  P.funnel = 0;
  return P;
}

/** Keyframes [tau, cx, cy, s, spin, funnel], cubic Hermite between them. */
function keyAt(K, tau, out) {
  if (tau <= K[0][0]) { for (let j = 1; j < 6; j++) out[j - 1] = K[0][j]; return out; }
  if (tau >= K.at(-1)[0]) { for (let j = 1; j < 6; j++) out[j - 1] = K.at(-1)[j]; return out; }
  let i = 0;
  while (K[i + 1][0] < tau) i++;
  const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(K.length - 1, i + 2)];
  const h = k2[0] - k1[0], u = (tau - k1[0]) / h;
  const u2 = u * u, u3 = u2 * u;
  for (let j = 1; j < 6; j++) {
    const m1 = ((k2[j] - k0[j]) / (k2[0] - k0[0])) * h, m2 = ((k3[j] - k1[j]) / (k3[0] - k1[0])) * h;
    out[j - 1] = (2 * u3 - 3 * u2 + 1) * k1[j] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[j] + (u3 - u2) * m2;
  }
  return out;
}

// ------------------------------------------------------------ the turn plan
//
// Who does what in a turn. The flock is the distant core (always there),
// plus every bird of the changing digits (they lift off), plus arrivals
// streaming in from off the glass. Some of them land as the new digits, the
// rest fly off again. Every bird has its times and its place on the sheet;
// a lander's place is set by its landing order, so the leading tip of the
// flock is the first to come down.

const CORE = 48;
const CORE_ABC = new Float32Array(CORE * 4);
for (let i = 0; i < CORE; i++) {
  const a = 2 * hash(i, 1, 5) - 1;
  CORE_ABC.set([a, (2 * hash(i, 2, 5) - 1) * Math.sqrt(1 - 0.7 * a * a), 2 * hash(i, 3, 5) - 1, hash(i, 4, 5)], i * 4);
}

const DIG = (c) => `${c.hh}${c.mm}`;

// Timings, seconds from :00. Minute, then hour.
const TM = { arrive: [-5.8, -1.6], lift: [-3.3, -1.4], land: [2.1, 4.3], leave: [4.9, 7.4], fly: 1.0, landFly: 1.0 };
const TH = { arrive: [-9.4, -4.5], lift: [-5.6, -1.7], land: [3.3, 6.3], leave: [6.6, 7.6], fly: 1.2, landFly: 1.05 };

const PLANS = new Map();
function planFor(from, to) {
  const key = to.minuteKey;
  let p = PLANS.get(key);
  if (p) return p;
  if (PLANS.size > 4) PLANS.clear();
  p = makePlan(from, to, key);
  PLANS.set(key, p);
  return p;
}

function makePlan(from, to, key) {
  const hour = to.m === 0;
  const TT = hour ? TH : TM;
  const A = DIG(from), B = DIG(to);
  const changing = [0, 1, 2, 3].map((k) => hour || A[k] !== B[k]);
  const lift = [], land = [];      // [glyph, index, slot]
  for (let k = 0; k < 4; k++) {
    if (!changing[k]) continue;
    const ga = glyph(A[k], seedOf(k, from)), gb = glyph(B[k], seedOf(k, to));
    for (let i = 0; i < ga.n; i++) lift.push([ga, i, k]);
    for (let i = 0; i < gb.n; i++) land.push([gb, i, k]);
  }
  const slotsX = [0, 1, 2, 3].filter((k) => changing[k]).map((k) => SLOT_X[k] + DW / 2);
  const X0 = slotsX.reduce((s, x) => s + x, 0) / slotsX.length;
  const side = hash(key, 1, 2) < 0.5 ? -1 : 1;
  const gxOf = ([gl, i, k]) => SLOT_X[k] + gl.x[i], gyOf = ([gl, i]) => gl.y[i];
  // Take-off runs as a wave from one side; roosting fills bottom up (the
  // minute) or sweeps left to right with the rolling flock (the hour).
  const liftKey = (e, j) => (hour ? gxOf(e) / 128 : (side * (gxOf(e) - X0)) / 40) + 0.35 * hash(j, 3, key);
  const landKey = (e, j) => (hour ? gxOf(e) / 128 + 0.1 * hash(j, 4, key) : (DH - gyOf(e)) / DH + 0.3 * hash(j, 4, key));
  const rank = (arr, f) => {
    const ks = arr.map(f), idx = arr.map((_, j) => j).sort((x, y) => ks[x] - ks[y]);
    const r = new Float32Array(arr.length);
    idx.forEach((j, q) => { r[j] = arr.length > 1 ? q / (arr.length - 1) : 0; });
    return r;
  };
  const liftR = rank(lift, liftKey), landR = rank(land, landKey);
  const nA = lift.length, nB = land.length;
  const X = Math.max(0, nB - nA) + (hour ? 70 : 120);
  const M = nA + X;
  // Which pool birds land: a shuffle, then the first nB in landing order.
  const perm = Array.from({ length: M }, (_, j) => j).sort((x, y) => hash(x, 7, key) - hash(y, 7, key));
  const landOrder = land.map((_, j) => j).sort((x, y) => landR[x] - landR[y]);
  const bird = [];
  for (let j = 0; j < M; j++) bird.push({});
  for (let q = 0; q < M; q++) {
    const b = bird[perm[q]];
    if (q < nB) { b.dst = land[landOrder[q]]; b.t1 = lerp(TT.land[0], TT.land[1], landR[landOrder[q]]); b.r = landR[landOrder[q]]; }
    else b.t1 = lerp(TT.leave[0], TT.leave[1], hash(q, 8, key));
  }
  for (let j = 0; j < M; j++) {
    const b = bird[j], h = (s) => hash(j, s, key);
    if (j < nA) { b.src = lift[j]; b.t0 = lerp(TT.lift[0], TT.lift[1], liftR[j]); }
    else {
      b.t0 = lerp(TT.arrive[0], TT.arrive[1], h(10));
      // In from the top or the right, never across the time.
      if (h(11) < 0.5) { b.sx = 56 + 76 * h(12); b.sy = -6 - 8 * h(13); }
      else { b.sx = 134 + 12 * h(12); b.sy = -4 + 34 * h(13); }
    }
    if (!b.dst) { b.ex = 40 + 100 * h(15); b.ey = -8 - 12 * h(16); }
    // Place on the sheet: landers by landing order (the tip comes down first).
    b.a = b.dst ? -1 + 1.85 * b.r + 0.14 * (h(17) - 0.5) : -0.15 + 1.1 * h(17);
    b.b = (2 * h(18) - 1) * Math.sqrt(Math.max(0, 1 - 0.7 * b.a * b.a));
    b.c = 2 * h(19) - 1; b.ph = h(20);
    b.spiral = (h(21) < 0.5 ? -1 : 1) * (0.7 + 1.0 * h(22));
  }
  return { hour, changing, bird, X0, side, TT, K: hour ? hourKeys() : minuteKeys(X0) };
}

/** Where the flock goes in a minute turn: rise, wheel over the sky, funnel into the slot, recede. */
function minuteKeys(X0) {
  return [
    [-10, X0 - 40, 48, 0.22, 0, 0],
    [-4.6, X0 - 26, 45, 0.3, 0.1, 0],
    [-2.6, X0 - 14, 22, 0.66, -0.2, 0],
    [-0.8, Math.max(72, X0 - 24), 17, 0.86, 0.25, 0],
    [0.9, Math.max(72, X0 - 30), 21, 0.86, -0.2, 0],
    [2.0, X0 - 12, 12, 0.76, -0.9, 0.5],
    [3.0, X0, 8, 0.62, -1.5, 1],
    [4.6, X0, 4, 0.58, -1.56, 1],
    [6.4, X0 - 16, 30, 0.42, -0.4, 0],
    [9.8, 60, 48, 0.22, 0, 0],
  ];
}

/** The hour: the whole flock rises huge, takes the falcon, then rolls across to roost. */
function hourKeys() {
  return [
    [-10, 64, 47, 0.3, 0, 0],
    [-6, 60, 30, 0.65, 0.2, 0],
    [-2.5, 64, 19, 1.0, -0.2, 0],
    [0.5, 68, 22, 1.3, 0.25, 0],
    [2.2, 60, 20, 1.0, -0.1, 0],
    [3.3, 46, 19, 0.72, 0.05, 0],
    [6.3, 98, 15, 0.8, 0.05, 0],
    [7.8, 96, 26, 0.55, 0.3, 0],
    [9.9, 64, 47, 0.24, 0, 0],
  ];
}

/** How far the flock has left its distant wheeling for the turn's choreography. */
const turnWeight = (tau) => smooth((tau + 10) / 4) * (1 - smooth((tau - 6) / 3.8));

// ------------------------------------------------------------ the falcon

const FALCON_T0 = 0.0, FALCON_T1 = 2.5;
const FB = [[150, -30], [110, 0], [40, 75], [-30, -10]];

/** The peregrine at tau: [x, y, heading, wing spread] or null. */
function falconAt(tau) {
  if (tau < FALCON_T0 || tau > FALCON_T1) return null;
  const v = (tau - FALCON_T0) / (FALCON_T1 - FALCON_T0);
  const bz = (u, j) => {
    const w = 1 - u;
    return w * w * w * FB[0][j] + 3 * w * w * u * FB[1][j] + 3 * w * u * u * FB[2][j] + u * u * u * FB[3][j];
  };
  const x = bz(v, 0), y = bz(v, 1);
  const hx = bz(v + 0.01, 0) - bz(v - 0.01, 0), hy = bz(v + 0.01, 1) - bz(v - 0.01, 1);
  // Stooping with wings tucked; spread on the pull-up and the climb away.
  return [x, y, Math.atan2(hy, hx), smooth((v - 0.5) / 0.2)];
}

function drawFalcon(g, F, T) {
  const [x, y, h, spread] = F;
  const c = Math.cos(h), s = Math.sin(h);
  const flap = spread * Math.sin(T * 30) * 1.2;
  const span = 2.2 + 3.6 * spread;
  const local = [[5, 0], [2, -1.1], [-0.5 - 1.5 * spread, -span + flap], [-2.5, -0.8], [-5, -1.4], [-4.2, 0], [-5, 1.4], [-2.5, 0.8], [-0.5 - 1.5 * spread, span + flap], [2, 1.1]];
  g.fillPolygon(local.map(([u, v]) => [x + 1.35 * (u * c - v * s), y + 1.35 * (u * s + v * c)]));
}

/**
 * The starlings' answer to the falcon: a hole that opens round it (flash
 * expansion, reacting a beat late) and, from the strike, an agitation wave
 * ringing out through the flock. Moves the point in `o`; returns true if
 * the bird is banking away (drawn thin).
 */
const STRIKE = 1.25;
function evade(o, tau, Fa, Fs) {
  let thin = false;
  if (Fa) {
    const dx = o[0] - Fa[0], dy = o[1] - Fa[1], d = Math.hypot(dx, dy) + 0.01;
    const push = 12 * Math.exp(-((d / 9) ** 2));
    o[0] += (dx / d) * push; o[1] += (dy / d) * push;
    if (d < 14) thin = true;
  }
  if (Fs && tau > STRIKE) {
    const dt = tau - STRIKE;
    const dx = o[0] - Fs[0], dy = o[1] - Fs[1], d = Math.hypot(dx, dy) + 0.01;
    const ring = Math.exp(-(((d - 48 * dt) / 4.5) ** 2)) * Math.exp(-dt / 1.1);
    o[0] += (dx / d) * 3 * ring; o[1] += (dy / d) * 3 * ring;
    if (ring > 0.35) thin = true;
  }
  return thin;
}

// ------------------------------------------------------------ dusk and reeds
//
// The sun, half set over the water, wanders slowly along the horizon. Things
// in front of it are silhouettes: a bird or a reed is drawn dark over the
// disc and lit everywhere else, so the distant flock passing the sun is a
// cloud of black specks, as in every photograph of a murmuration.

const HORIZON = 58, SUN_R = 13;
const SUN = { x: 64, y: HORIZON };
/** The colour to draw a silhouette in at (x, y): dark over the sun, else lit. */
function ink(x, y) {
  const dx = Math.floor(x) + 0.5 - SUN.x, dy = (Math.floor(y) + 0.5 - SUN.y) * 1.05;
  return dy < 0 && dx * dx + dy * dy < SUN_R * SUN_R ? 0 : 1;
}

// Reeds grow in clumps, with open water between.
const CLUMPS = [4, 22, 47, 88, 109, 125];
const REEDS = Array.from({ length: 17 }, (_, i) => ({
  x: CLUMPS[i % CLUMPS.length] + 8 * (hash(i, 1, 31) - 0.5),
  top: 47 + 7 * hash(i, 2, 31),
  kind: hash(i, 3, 31) < 0.25 ? 1 : 0,       // 1: a bulrush head, 0: a reed plume
  ph: 6.3 * hash(i, 4, 31),
}));

/** Wind over the reed bed: gusts travel left to right, so the bed sways as a wave. */
const sway = (x, T, ph) => 1.4 * Math.sin(T * 0.9 - x * 0.045 + ph * 0.2) + 0.45 * Math.sin(T * 2.3 + ph);

function dusk(g, T, key, ox, oy) {
  const hz = HORIZON + oy;
  // 90 minutes a sweep, so no glass stays under it.
  SUN.x = 64 + 46 * Math.sin((T * TAU) / 5400 + 1) + ox; SUN.y = hz;
  const sx = SUN.x, sr = SUN_R;
  for (let y = Math.floor(hz - sr - 5); y < hz; y++) {
    // Two thin strands of cloud drifting across the disc's lower half.
    const v = (hz - 0.5 - y) / sr;
    const band = Math.abs(v - 0.16) < 0.04 || Math.abs(v - 0.37) < 0.035;
    for (let x = Math.floor(sx - sr - 5); x <= sx + sr + 5; x++) {
      const d = Math.hypot(x + 0.5 - sx, (y + 0.5 - hz) * 1.05);
      if (d < sr) { if (!(band && Math.sin((x - T * 0.8) * 0.25 + v * 9) > -0.4)) g.pixel(x, y); continue; }
      // A thin corona: grain re-dealt every minute.
      if (hash(x, y, key) < 0.3 * Math.exp(-(d - sr) / 1.6)) g.pixel(x, y);
    }
  }
  // The far shore: one lit line of horizon, a second broken one under it.
  for (let x = 0; x < W; x++) {
    g.pixel(x, hz - 1);
    if (Math.sin(x * 0.7 + T * 0.6) + Math.sin(x * 0.23 - T * 0.4) > 0.3) g.pixel(x, hz + 1);
  }
  // Glitter on the water below, every row breaking up and drifting.
  for (let y = hz + 2; y < H; y++) {
    const r = y - hz, w = sr * (1.1 - 0.14 * r) * (0.75 + 0.25 * Math.sin(T * 1.3 + r * 2.1));
    const dir = r & 1 ? 1 : -1;
    for (let x = Math.floor(sx - w); x <= sx + w; x++)
      if (Math.sin(x * 0.85 + T * 2.1 * dir + r * 1.7) + 0.6 * Math.sin(x * 0.31 - T * 0.9 * dir) > 0.15 * r - 0.2) g.pixel(x, y);
  }
  // Reeds, in silhouette: seen only where they cross the sun, the shore
  // line and the glitter.
  for (const r of REEDS) {
    const x0 = r.x + ox, s = sway(x0, T, r.ph);
    const h = hz - r.top;
    for (let y = Math.floor(r.top + oy); y < H; y++) {
      const u = Math.max(0, (hz - y) / h);
      g.pixel(x0 + s * u * u, y, 0);
    }
    const tx = x0 + s, ty = r.top + oy;
    if (r.kind) {
      // A bulrush: a fat head on the stalk, a spike above.
      for (let j = 1; j <= 5; j++) { g.pixel(tx - 0.5 + s * 0.05 * j, ty + 1 - j, 0); g.pixel(tx + 0.5 + s * 0.05 * j, ty + 1 - j, 0); }
      g.pixel(tx + s * 0.32, ty - 5, 0); g.pixel(tx + s * 0.35, ty - 6, 0);
    } else {
      // A reed plume, nodding downwind.
      const W0 = [1, 2, 2, 3, 3, 2, 1];
      for (let j = 0; j < W0.length; j++) {
        const cx = tx + (0.25 + 0.12 * j) * s + j * 0.35;
        for (let k = 0; k < W0[j]; k++) g.pixel(cx - W0[j] / 2 + k, ty - 1 - j * 0.8, 0);
      }
    }
  }
}

// ------------------------------------------------------------ face

const Q = [0, 0, 0, 0], F = [0, 0, 0, 0];
const PD = { cx: 0, cy: 0, s: 0, spin: 0, funnel: 0 }, PK = [0, 0, 0, 0, 0], P = { cx: 0, cy: 0, s: 0, spin: 0, funnel: 0 };

function flockParams(T, tau, plan) {
  distant(T, PD);
  const w = plan ? turnWeight(tau) : 0;
  if (w <= 0) return Object.assign(P, PD);
  keyAt(plan.K, tau, PK);
  P.cx = lerp(PD.cx, PK[0], w); P.cy = lerp(PD.cy, PK[1], w); P.s = lerp(PD.s, PK[2], w);
  P.spin = lerp(PD.spin, PK[3], w); P.funnel = clamp01(PK[4]) * w;
  return P;
}

/** A flock bird: its place on the sheet now, chased by the falcon if there is one. */
function onSheet(a, b, c, ph, T, tau, Fa, Fs, out) {
  flockAt(a, b, c, ph, T, P, out);
  if ((Fa || Fs) && evade(out, tau, Fa, Fs)) out[2] = 0;
  return out;
}

/** Every bird of the turn plan at tau. */
function drawPlan(g, plan, T, tau, ox, oy, Fa, Fs) {
  const TT = plan.TT;
  for (const b of plan.bird) {
    onSheet(b.a, b.b, b.c, b.ph, T, tau, Fa, Fs, F);
    let x = F[0], y = F[1], sz = F[2], ph = F[3];
    if (b.src && tau < b.t0 + TT.fly) {
      // Waiting in the digit, restless, then crouch and spring up into the flock.
      const [gl, i, k] = b.src;
      const amp = 1 + 2 * smooth((tau - b.t0 + 4) / 3.6);
      homeAt(gl, i, SLOT_X[k] + ox, TOP + oy, T, amp, Q);
      const u = (tau - b.t0) / TT.fly;
      if (u <= 0) { bird(g, Q[0], Q[1] + 0.9 * smooth((tau - b.t0 + 0.3) / 0.3), Q[2], Q[3] * 2); continue; }
      const e = inOut(u);
      x = lerp(Q[0], x, e); y = lerp(Q[1], y, e) - 7 * Math.sin(Math.PI * u) * (1 - 0.4 * u);
      sz = u < 0.5 ? 1 : sz;
    } else if (!b.src && tau < b.t0 + 1.8) {
      // Arriving from off the glass.
      const u = (tau - b.t0) / 1.8;
      if (u <= 0) continue;
      const e = inOut(u);
      x = lerp(b.sx, x, e); y = lerp(b.sy, y, e);
    } else if (b.dst && tau >= b.t1) {
      // Coming down to its place, spiralling in, a little overshoot, settle.
      const [gl, i, k] = b.dst;
      const after = tau - b.t1 - TT.landFly;
      homeAt(gl, i, SLOT_X[k] + ox, TOP + oy, T, 1 + 2.4 * Math.exp(-Math.max(0, after) / 0.35), Q);
      const u = (tau - b.t1) / TT.landFly;
      if (u >= 1) { bird(g, Q[0], Q[1], Q[2], Q[3]); continue; }
      const v = u - 1, e = 1 + 2.2 * v * v * v + 1.2 * v * v;
      const th = b.spiral * (1 - smooth(u)), c = Math.cos(th), s = Math.sin(th);
      const dx = (x - Q[0]) * (1 - e), dy = (y - Q[1]) * (1 - e);
      x = Q[0] + dx * c - dy * s; y = Q[1] + dx * s + dy * c;
      if (u > 0.7) sz = Q[2];
    } else if (!b.dst && tau >= b.t1) {
      // Leaving: off the glass with the stragglers.
      const u = (tau - b.t1) / 2.2;
      if (u >= 1) continue;
      const e = u * u * (2 - u);
      x = lerp(x, b.ex, e); y = lerp(y, b.ey, e);
    }
    if (x < -2 || x > W + 1 || y < -2 || y > H + 1) continue;
    bird(g, x, y, sz, ph, true);
  }
}

export default {
  name: 'Murmuration',
  blurb: 'Starlings at dusk hold the time over a reed bed; each minute the changing digit lifts into a vast swirling murmuration that funnels down as the new one. On the hour a falcon stoops through the flock.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const plan = tau < 10 ? planFor(from, to) : null;
    const D = DIG(to);

    dusk(g, T, f.minuteKey, ox, oy);
    flockParams(T, tau, plan);
    const Fa = plan && plan.hour ? falconAt(tau - 0.06) : null;
    const Fs = plan && plan.hour && tau > STRIKE ? falconAt(STRIKE) : null;
    // The digits that are resting, and the colon: in front of the flock.
    MASK.fill(0);
    for (let k = 0; k < 4; k++) {
      if (plan && plan.changing[k]) continue;
      const gl = glyph(D[k], seedOf(k, to));
      beginMark();
      for (let i = 0; i < gl.n; i++) { homeAt(gl, i, SLOT_X[k] + ox, TOP + oy, T, 1, Q); bird(g, Q[0], Q[1], Q[2], Q[3]); }
      endMark();
    }
    colon(g, COLON_X - 0.5 + ox, TOP + oy, T);
    // The distant core of the flock, always on the wing.
    for (let i = 0; i < CORE; i++) {
      const j = i * 4;
      onSheet(CORE_ABC[j], CORE_ABC[j + 1], CORE_ABC[j + 2], CORE_ABC[j + 3], T, tau, Fa, Fs, F);
      bird(g, F[0], F[1], F[2], F[3], true);
    }
    if (plan) drawPlan(g, plan, T, tau, ox, oy, Fa, Fs);
    if (plan && plan.hour) { const fa = falconAt(tau); if (fa) drawFalcon(g, fa, T); }
    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};
