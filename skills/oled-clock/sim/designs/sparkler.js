// Sparkler: a kid in a bobble hat writes the time in the air with a sparkler.
//
// The numerals are light painting: each is one continuous stroke (a
// sparkler cannot be lifted off the air), and the trail's weight is the
// exposure, so it swells where the hand slowed (setting off, corners,
// arriving) and thins on the fast runs. The trail smoulders on in small
// twinkles. The hour is small, high on the left, written once an hour; the
// minutes large on the right.
//
// The seconds are the sparkler itself: it is lit at the turn and burns down
// its wire toward the mitten over the minute, the light sinking as it goes.
// At :56 it dies, the spent wire goes in the bucket with a hiss, and a fresh
// one comes out of a pocket, unlit. The kid walks over in the dark (only
// the glow of the numerals outlines it) and holds the cold tip to the end
// of the numeral about to change. At :00 that numeral's fire runs back
// along its own stroke like a fuse, embers dropping where it has passed,
// into the new sparkler, which catches in a ring of sparks, lights the
// kid's face, and writes the new numeral. Between turns the kid waves the
// sparkler in lazy loops and now and then doodles (a heart, a spiral, a
// star, a loop-the-loop) that only hang in the afterglow.
//
// On the hour the fuse runs through the whole time, numeral to numeral,
// leaping the gaps, into a sparkler that catches in a great burst; the kid
// writes the new minutes, runs to the hour, writes it, and spins a ring of
// light over its head.
//
// frame() is a pure function of the wall clock: the minute's choreography
// is a plan built from the minute key, and every spark is placed by when
// (and from where) it was thrown. Burn-in: each numeral is written a little
// differently every time (offset, slant, wobble), the kid's rest spot moves
// each minute, the bucket walks a small orbit. The panel dims at night.

import { dither, orbit } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the hand
// Every numeral is ONE continuous stroke: a sparkler cannot be lifted off
// the air. Each is a list of pieces (smooth runs of control points) that
// meet at corners, where the hand pauses and the exposure blooms. Box 20 x 32.

const GLYPHS = {
  0: [[[13, 1.2], [7, 0.6], [2.6, 5], [0.8, 13], [1.2, 22], [4, 29.5], [9.5, 32], [15, 29.5], [18.6, 21], [19, 11], [16.5, 3.5], [12, 0.6], [7.5, 2]]],
  1: [[[3, 9], [7, 5.5], [12, 0]], [[12, 0], [11.4, 32]]],
  2: [[[1.6, 8.5], [3.2, 3], [9, 0.2], [15.4, 2], [17.6, 7.6], [15.6, 14], [9.6, 20.5], [3.6, 26.5], [0.8, 31.5]], [[0.8, 31.5], [6, 30.4], [12, 31.4], [19, 30.6]]],
  3: [[[1.4, 4.6], [6, 0.6], [12, 0.4], [16.6, 3.6], [16.4, 9.6], [9.6, 15]], [[9.6, 15], [15.6, 17], [19, 22.6], [17.2, 29], [11, 32], [4.6, 31.4], [0.6, 27.2]]],
  4: [[[14, 32], [14, 0]], [[14, 0], [0.8, 21.6]], [[0.8, 21.6], [19.6, 21.6]]],
  5: [[[17.6, 0.8], [4, 0.8]], [[4, 0.8], [2.8, 14]], [[2.8, 14], [8.4, 11.6], [14, 12.4], [18.4, 17.4], [18.4, 25], [14.6, 30.6], [8.6, 32], [3.6, 30.8], [0.6, 27]]],
  6: [[[16.2, 2.6], [12, 0.2], [7, 0.8], [3, 5.4], [0.9, 13.5], [1, 22], [3.8, 29.6], [9.6, 32], [15.4, 29.8], [18.6, 23.6], [16.8, 17], [11, 14.4], [5.4, 15.8], [1.4, 20.6]]],
  7: [[[0.8, 4.4], [1.4, 0.8]], [[1.4, 0.8], [19, 0.8]], [[19, 0.8], [13.6, 9.4], [9.8, 19.4], [8.4, 32]]],
  8: [[[15.6, 5], [12, 0.6], [6, 0.6], [2.4, 4.4], [3.4, 10], [10, 15.6], [16.8, 21], [18, 27.2], [13.4, 31.8], [6.4, 31.8], [1.6, 27.4], [2.8, 21.2], [10, 15.6], [15.8, 10.6], [16.6, 5.6], [13.6, 1.6]]],
  9: [[[17.4, 9.6], [13.4, 14.6], [7.4, 15.8], [2.6, 12.6], [1.2, 6.8], [4.4, 1.6], [10, 0], [15.6, 2], [18.2, 8], [17.8, 17], [15.4, 25], [11.4, 30.8], [5.8, 32], [1.6, 29.4]]],
};

const GH = 32, SLANT = 0.14;

/** Centripetal Catmull-Rom through pts, densely sampled. */
function spline(pts) {
  if (pts.length < 3) {
    const out = [];
    const [a, b] = pts, n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    return out;
  }
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.4));
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

/** Resample a polyline at a fixed arc-length step. */
function resample(pts, step = 0.5) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    while (s <= d) { out.push([ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d]); s += step; }
    carry = d - (s - step);
  }
  const last = pts.at(-1), e = out.at(-1);
  if (Math.hypot(last[0] - e[0], last[1] - e[1]) > 0.15) out.push([...last]);
  return out;
}

const DWELL_START = 5, DWELL_CORNER = 2.6, DWELL_END = 3.4;   // px-equivalents of hand time

/**
 * A written numeral: samples along the stroke with, for each, the share of
 * the writing time already spent when the sparkler passes it (C, 0..1),
 * how slowly the hand moved there (D: 1 = full speed) and how long it
 * paused there (B). `jit` is the hand's variation this time.
 */
function buildGlyph(d, x0, y0, s, jit = null) {
  const sl = SLANT + (jit ? jit.slant : 0);
  const map = ([x, y], i) => {
    if (jit) { x += jit.wob(i, 0); y += jit.wob(i, 1); }
    return [x0 + (x + sl * (GH - y)) * s, y0 + y * s];
  };
  const X = [], Y = [], anchors = [];
  let k = 0;
  GLYPHS[d].forEach((piece, pi) => {
    const pts = resample(spline(piece.map((p, i) => map(p, k + i))), 0.5);
    k += piece.length;
    pts.forEach((p, i) => { if (!(pi > 0 && i === 0)) { X.push(p[0]); Y.push(p[1]); } });
    anchors.push(X.length - 1);
  });
  const n = X.length;
  // How fast the hand moves: it sets off and arrives slowly, brakes into
  // corners and tight turns, and races along the open runs. Exposure is
  // time spent per pixel, so a slow hand leaves a fat, bright trail and a
  // fast one a thin one: the numerals swell like a brush, by speed alone.
  const D = new Float32Array(n), B = new Float32Array(n), cost = new Float32Array(n);
  const stops = [0, ...anchors];
  for (let i = 0; i < n; i++) {
    let near = 1e9;
    for (const a of stops) near = Math.min(near, Math.abs(i - a) * 0.5);
    const a0 = Math.max(0, i - 4), a1 = Math.min(n - 1, i + 4), m = Math.min(n - 1, Math.max(0, i));
    let turn = 0;
    if (a1 - a0 >= 4) {
      const t1 = Math.atan2(Y[m] - Y[a0], X[m] - X[a0]), t2 = Math.atan2(Y[a1] - Y[m], X[a1] - X[m]);
      turn = Math.abs(t2 - t1); if (turn > Math.PI) turn = 2 * Math.PI - turn;
    }
    const brake = Math.min(1, near / (9 * s));
    const v = Math.max(0.3, (0.38 + 0.62 * brake * brake * (3 - 2 * brake)) * (1 - Math.min(0.55, turn * 0.5)));
    D[i] = 1 / v;
    cost[i] = (i ? 0.5 : 0) * D[i];
  }
  const dw = (i, amt) => { cost[i] += amt * s; B[i] = Math.max(B[i], amt); };
  dw(0, DWELL_START);
  anchors.forEach((j, q) => dw(j, q === anchors.length - 1 ? DWELL_END : DWELL_CORNER));
  const C = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += cost[i]; C[i] = acc; }
  for (let i = 0; i < n; i++) C[i] /= acc;
  return { X, Y, D, B, C, n, len: n * 0.5, s };
}

/** Radius of the trail at sample i, for a core between rMin and rMax. */
const radiusAt = (gl, i, rMin, rMax) =>
  rMin + (rMax - rMin) * Math.min(1, (gl.D[i] - 1) / 1.9) + Math.min(0.9, gl.B[i] * 0.18) * (rMax / 1.8);

/** Index of the sample the hand has reached at share c of the writing time. */
function sampleAt(gl, c) {
  const C = gl.C;
  if (c <= 0) return 0;
  if (c >= 1) return gl.n - 1;
  let lo = 0, hi = gl.n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (C[m] < c) lo = m + 1; else hi = m; }
  return lo;
}

/** Fill a disc straight into the buffer (fast). */
function disc(g, x, y, r, c = 1) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(g.width - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(g.height - 1, Math.floor(y + r));
  const r2 = r * r, buf = g.buf, w = g.width;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x;
      if (dx * dx + dy * dy <= r2) buf[py * w + px] = c;
    }
  }
}

let HALO = false;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * The trail of a numeral. The core is the exposure (fatter where the hand
 * lingered); beside it the trail still smoulders in twinkles, each opening
 * and closing on its own beat. `age` (s since the hand passed sample i)
 * makes the fresh part white-hot.
 */
function drawTrail(g, gl, rr, T, { i0 = 0, i1 = gl.n - 1, seed = 0, age = null, step = 9 } = {}) {
  const { X, Y } = gl, [rMin, rMax] = rr, r0 = rMin;
  if (HALO) {
    // the light is in front of the kid: cut it a dark margin out of what is behind
    for (let i = i0; i <= i1; i += 2) disc(g, X[i], Y[i], radiusAt(gl, i, rMin, rMax) + 1.3, 0);
    return;
  }
  for (let i = i0; i <= i1; i++) {
    // Fresh exposure is still white-hot and fat; it settles in a moment.
    const hot = age ? 1.1 * Math.exp(-age(i) / 0.3) : 0;
    disc(g, X[i], Y[i], radiusAt(gl, i, rMin, rMax) + hot * (rMax / 1.9));
  }
  for (let i = i0 + 4; i <= i1 - 2; i += step) {
    if (age && age(i) < 0.5) continue;
    const h = hash(i, seed);
    const rate = 0.45 + 0.6 * hash(i, seed + 1), ph = (T * rate + h) % 1;
    if (ph > 0.3) continue;
    const grow = Math.sin(Math.PI * (ph / 0.3));
    const a = Math.max(0, i - 2), b = Math.min(gl.n - 1, i + 2);
    let tx = X[b] - X[a], ty = Y[b] - Y[a];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const side = h < 0.5 ? 1 : -1;
    const off = r0 + 2.2 + 1.6 * hash(i, seed + 2);
    glint(g, X[i] - ty * side * off, Y[i] + tx * side * off, grow);
  }
}

/** A twinkle: a dot that opens into a four-ray star and closes again. */
function glint(g, x, y, k) {
  x = Math.floor(x); y = Math.floor(y);
  g.pixel(x, y);
  if (k > 0.45) { g.pixel(x - 1, y); g.pixel(x + 1, y); g.pixel(x, y - 1); g.pixel(x, y + 1); }
  if (k > 0.9) { g.pixel(x - 2, y); g.pixel(x + 2, y); g.pixel(x, y - 2); g.pixel(x, y + 2); }
}

export function specimen(g, scale = 1.06, rr = [0.95, 1.9], y = 2, T = 0, step = 9) {
  for (let d = 0; d < 10; d++) drawTrail(g, buildGlyph(d, 4 + d * 25, y, scale), rr, T, { seed: d, step });
}

// ------------------------------------------------------------ the page
// The hour is small and high on the left, written once an hour; the
// minutes large on the right, written every minute. The kid stands
// between them on the grass.

const G = 61;                                   // the grass line: feet stand on it
const HOUR = { x: 6, y: 4, s: 0.56, pitch: 13, rr: [0.72, 1.2], step: 23 };
const MINS = { x: [62, 93], y: 9, s: 1.06, rr: [0.95, 1.9], step: 9 };

/** The hand is never quite the same twice: offset, slant and wobble, per writing. */
function handOf(key, slot) {
  const sd = (key % 100000) * 0.731 + slot * 17.3;
  return {
    dx: (hash(sd, 1) - 0.5) * 3, dy: (hash(sd, 2) - 0.5) * 2.4,
    slant: (hash(sd, 3) - 0.5) * 0.09,
    wob: (i, ax) => (hash(sd + i * 0.37, 4 + ax) - 0.5) * 1.1,
  };
}

const glCache = new Map();
function glyphOf(it) {
  const k = `${it.d},${it.x},${it.y},${it.s},${it.key},${it.slot}`;
  let gl = glCache.get(k);
  if (!gl) {
    const j = handOf(it.key, it.slot);
    gl = buildGlyph(it.d, it.x + j.dx, it.y + j.dy, it.s, j);
    glCache.set(k, gl);
    if (glCache.size > 40) glCache.delete(glCache.keys().next().value);
  }
  return gl;
}

/**
 * What is written in the air during minute K: each numeral with the minute
 * it was written in (the ones every minute, the tens every ten, the hour
 * on the hour), which fixes how the hand made it.
 */
function itemsOf(K) {
  const d = new Date(K * 60000), h = d.getHours(), m = d.getMinutes();
  const out = [];
  const hs = String(h);
  const hx = HOUR.x + (hs.length === 1 ? 6 : 0);
  [...hs].forEach((ch, i) => out.push({ slot: i, d: +ch, key: K - m, x: hx + i * HOUR.pitch, y: HOUR.y, s: HOUR.s, rr: HOUR.rr, step: HOUR.step, hour: true }));
  out.push({ slot: 2, d: Math.floor(m / 10), key: K - (m % 10), x: MINS.x[0], y: MINS.y, s: MINS.s, rr: MINS.rr, step: MINS.step });
  out.push({ slot: 3, d: m % 10, key: K, x: MINS.x[1], y: MINS.y, s: MINS.s, rr: MINS.rr, step: MINS.step });
  for (const it of out) it.gl = glyphOf(it);
  return out;
}

// ------------------------------------------------------------ the minute's choreography
// Times are seconds from the turn of minute K (negative: the end of K-1).
// The sparkler burns down over the minute: that is the seconds. It dies
// just before the turn; the spent wire goes in the bucket; a fresh one
// comes out of a pocket, unlit, and the kid holds its tip to the end of the
// numeral that is about to change. At :00 that numeral's fire runs back
// along its own stroke, like a fuse, into the new sparkler, which catches,
// and writes the new numeral. On the hour the fuse runs through the whole
// time, numeral to numeral, and the hour is written again.

const BURN_OUT = 55.6;          // s into the minute: burnt down to the handle
const T_DROP0 = -4.0, T_DROP = -3.4, T_POCKET = -3.05, T_NEW = -2.75, T_WALK = -2.05, T_REACH = -0.7;
const LEAP = 0.32;              // s for the fire to leap between numerals
const WIRE = 20, HANDLE = 3;    // the sparkler: wire length, bare handle
const BUCKET0 = { x: 13, y: 53 };  // the bucket's mouth
/** The bucket gets nudged about a pixel every few minutes (burn-in). */
function bucketAt(T) { const [dx, dy] = orbit(new Date(T * 1000), 2, 4); return { x: BUCKET0.x + dx, y: BUCKET0.y + Math.max(0, dy) }; }
const walkTime = (dx) => 0.2 + Math.abs(dx) / 40;
const consDur = (gl) => 0.25 + gl.len * 0.006;
const writeDur = (gl) => 0.45 + gl.len * 0.0125;
const restX = (K) => 32 + Math.round((hash(K % 9973, 9) - 0.5) * 10);
const clampX = (x) => Math.max(9, Math.min(118, x));

const planCache = new Map();
function plan(K) {
  let p = planCache.get(K);
  if (p) return p;
  const old = itemsOf(K - 1), cur = itemsOf(K);
  const hour = cur[0].key === K;
  // The kid writes what is at hand first: the ones (it is standing at
  // them), then the tens, then, on the hour, a run to the hour, which ends
  // beside the rest spot.
  const writes = cur.filter((it) => it.key === K);
  const order = { 3: 0, 2: 1, 0: 2, 1: 3 };
  writes.sort((a, b) => order[a.slot] - order[b.slot]);
  const slots = new Set(writes.map((w) => w.slot));
  const chain = old.filter((it) => slots.has(it.slot) || !cur.some((c) => c.slot === it.slot));
  const keep = cur.filter((it) => it.key !== K);
  const last = chain.at(-1).gl;
  const E = [last.X[last.n - 1], last.Y[last.n - 1]];
  const touchX = clampX(E[0] - 13);
  const pace = hour ? 0.7 : writes.length > 1 ? 0.85 : 1, run = hour ? 1.45 : 1;
  let c = 0;
  chain.forEach((it, j) => { it.c0 = c; it.c1 = c + consDur(it.gl) * pace; c = it.c1 + (j < chain.length - 1 ? LEAP * pace : 0); });
  const ig = c;
  const keys = [[T_WALK, restX(K - 1)], [T_REACH, touchX], [ig, touchX]];
  let prevEnd = ig + (hour ? 0.5 : 0), px = touchX;
  for (const w of writes) {
    w.face = w.hour ? -1 : 1;
    w.stance = clampX(w.hour ? w.x + 25 : w.x - 4);
    const wk = Math.max(0.4, walkTime(w.stance - px) / run);
    w.t0 = prevEnd + wk;
    w.t1 = w.t0 + writeDur(w.gl) * (hour ? 0.8 : writes.length > 1 ? 0.85 : 1);
    keys.push([prevEnd, px], [prevEnd + wk, w.stance], [w.t1, w.stance]);
    prevEnd = w.t1; px = w.stance;
  }
  const back0 = prevEnd + 0.3, back1 = back0 + walkTime(restX(K) - px);
  keys.push([back0, px], [back1, restX(K)]);
  // ...and on the hour, a twirl over the head before settling down.
  const twirl = hour ? [back1 + 0.1, back1 + 1.9] : null;
  p = { K, old, cur, writes, chain, keep, E, ig, keys, back0, back1, twirl, end: (twirl ? twirl[1] : back1) + 0.6, hour };
  planCache.set(K, p);
  if (planCache.size > 6) planCache.delete(planCache.keys().next().value);
  return p;
}

const smooth = (u) => u * u * (3 - 2 * u);

/** The kid's feet along the keyframes, and which way it is going. */
function bodyAt(p, tau) {
  const k = p.keys;
  if (tau <= k[0][0]) return [k[0][1], 0];
  for (let i = 1; i < k.length; i++) {
    if (tau <= k[i][0]) {
      const [ta, xa] = k[i - 1], [tb, xb] = k[i];
      if (xa === xb || tb <= ta) return [xa, 0];
      const u = (tau - ta) / (tb - ta);
      return [xa + (xb - xa) * smooth(u), Math.sign(xb - xa) * (u > 0.02 && u < 0.98 ? 1 : 0.5)];
    }
  }
  return [k.at(-1)[1], 0];
}

const SH_Y = 15;                 // the shoulder, above the grass
const shoulder = (bx, face, hop = 0) => [bx + 3 * face, G - SH_Y - hop];
/** The sparkler held straight out along the arm: angle (facing right), reach of the hand, burn point. */
function poseP(bx, face, ang, e, Lb) {
  const sx = bx + 3 * face, sy = G - SH_Y;   // face may be fractional, mid-turn
  return [sx + (e + Lb) * Math.cos(ang) * face, sy + (e + Lb) * Math.sin(ang)];
}
const TAU = Math.PI * 2;
/** At rest the kid keeps the sparkler moving, in lazy loops. */
const idleAng = (t) => -0.98 + 0.24 * Math.sin((TAU * t) / 2.6) + 0.13 * Math.sin((TAU * t) / 1.1 + 1);
const idleExt = (t) => 7 + 1.6 * Math.sin((TAU * t) / 1.9 + 0.4);
const mixP = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** Where the hand is along a numeral at share u of its writing time. */
function glyphPoint(gl, u) {
  const i = sampleAt(gl, u);
  if (i === 0) return [gl.X[0], gl.Y[0]];
  const c0 = gl.C[i - 1], c1 = gl.C[i], k = c1 > c0 ? (u - c0) / (c1 - c0) : 1;
  return [gl.X[i - 1] + (gl.X[i] - gl.X[i - 1]) * k, gl.Y[i - 1] + (gl.Y[i] - gl.Y[i - 1]) * k];
}
const glyphStart = (gl) => [gl.X[0], gl.Y[0]];
const glyphEnd = (gl) => [gl.X[gl.n - 1], gl.Y[gl.n - 1]];
/** A quick swing of the hand from a to b, lifted on the way. */
const swingP = (a, b, u) => { const v = smooth(u); const q = mixP(a, b, v); q[1] -= 5 * Math.sin(Math.PI * v); return q; };

// While it waits, the kid doodles in the air now and then: a heart, a
// spiral, a star, a loop-the-loop. They are never written, only waved, so
// they hang for a moment in the afterglow and are gone.
const DOODLES = [
  (u) => { const a = TAU * u; return [Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]; },
  (u) => { const r = 1 - 0.85 * u, a = TAU * 2.5 * u; return [r * Math.cos(a), r * Math.sin(a)]; },
  (u) => {
    const k = Math.min(4.999, u * 5), i = Math.floor(k), f = k - i;
    const v = (j) => { const a = -Math.PI / 2 + (j * 4 * Math.PI) / 5; return [Math.cos(a), Math.sin(a)]; };
    const a = v(i), b = v(i + 1);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  },
  (u) => [1.5 * (2 * u - 1) + 0.55 * Math.sin(TAU * 3 * u), -0.65 * Math.cos(TAU * 3 * u)],
];
const DOODLE_LEN = 1.5;
/** The doodle being waved at second s of minute K, if any. */
function doodleAt(K, s, after = 0) {
  for (let j = 0; j < 4; j++) {
    const t0 = 9 + 11 * j + Math.floor(hash(K % 9973, j + 50) * 4);
    if (t0 > after + 0.4 && s >= t0 && s < t0 + DOODLE_LEN && hash(K % 9973, j + 60) < 0.75)
      return { u: (s - t0) / DOODLE_LEN, shape: Math.floor(hash(K % 9973, j + 70) * DOODLES.length) };
  }
  return null;
}

/**
 * Everything about the kid and the sparkler at wall time t (epoch s):
 * feet, facing, where the light (or the cold tip) is, the wire's state.
 */
function stateAt(t) {
  const Kc = Math.floor(t / 60), s = t - Kc * 60;
  const pc = plan(Kc);
  const late = s >= 60 + T_DROP0 - 0.8;
  const p = late ? plan(Kc + 1) : pc, tau = late ? s - 60 : s;
  const st = { p, tau, s, wire: 'lit', Lb: WIRE, f: 0, face: 1, hold: true };
  const [bx, mv] = bodyAt(p, tau);
  st.bx = bx; st.walk = mv;
  if (s < pc.ig) st.wire = 'fresh';
  else if (s < BURN_OUT) { st.f = (s - pc.ig) / (BURN_OUT - pc.ig); st.Lb = HANDLE + (WIRE - HANDLE) * (1 - st.f); }
  else if (s < 60 + T_DROP0) { st.wire = 'dying'; st.f = 1; st.Lb = HANDLE; st.die = (s - BURN_OUT) / (60 + T_DROP0 - BURN_OUT); }
  else if (s < 60 + T_DROP) { st.wire = 'spent'; st.Lb = HANDLE; }
  else if (s < 60 + T_NEW) { st.wire = 'none'; st.Lb = 4; st.hold = false; }
  else {
    st.wire = 'fresh';
    // pulled out of the pocket: it slides out of the hand to its full length
    const u = (s - (60 + T_NEW)) / 0.4;
    if (u >= 0 && u < 1) st.Lb = st.wireLen = 4 + (WIRE - 4) * smooth(u);
  }
  const idle = (b, face = 1) => poseP(b, face, idleAng(t), idleExt(t), st.Lb);
  const carry = (b, face) => poseP(b, face, -0.55 + 0.05 * Math.sin(t * 9), 7, st.Lb);
  let P, face = 1;
  if (tau < 0) {
    if (tau < T_DROP0) P = idle(bx);
    else if (tau < T_DROP) { face = -1; P = mixP(idle(bx, 1), poseP(bx, -1, 1.05, 9, st.Lb), smooth((tau - T_DROP0) / (T_DROP - T_DROP0))); }
    else if (tau < T_POCKET) { face = -1; P = poseP(bx, -1, 1.05 + 0.25 * smooth((tau - T_DROP) / (T_POCKET - T_DROP)), 9, st.Lb); }
    else if (tau < T_NEW) { face = -1; P = poseP(bx, -1, 1.3 + 0.2 * smooth((tau - T_POCKET) / (T_NEW - T_POCKET)), 7, st.Lb); }
    else if (tau < T_WALK) { const u = smooth((tau - T_NEW) / (T_WALK - T_NEW)); P = poseP(bx, -1 + 2 * u, 1.5 + (-0.55 - 1.5) * u, 7, st.Lb); }
    else if (tau < T_REACH) P = carry(bx, 1);
    else P = mixP(carry(bx, 1), p.E, smooth((tau - T_REACH) / -T_REACH));
  } else if (tau < p.ig) {
    P = [p.E[0] + 0.3 * Math.sin(t * 31), p.E[1] + 0.3 * Math.sin(t * 23)];
  } else if (tau < p.end) {
    const ws = p.writes;
    let prevEnd = p.ig, prevP = p.E;
    P = null;
    for (const w of ws) {
      if (tau < w.t0) { face = w.face; P = swingP(prevP, glyphStart(w.gl), (tau - prevEnd) / (w.t0 - prevEnd)); break; }
      if (tau < w.t1) { face = w.face; st.writing = w; P = glyphPoint(w.gl, (tau - w.t0) / (w.t1 - w.t0)); break; }
      prevEnd = w.t1; prevP = glyphEnd(w.gl);
    }
    if (!P) {
      const lw = ws.at(-1);
      // turning about to walk home, and back again on arrival: the facing
      // used for the held sparkler swings through, so the light never jumps
      const dir = Math.sign(restX(p.K) - lw.stance) || 1;
      const fs = lw.face + (dir - lw.face) * smooth(Math.min(1, Math.max(0, (tau - p.back0) / 0.35)));
      const fs2 = dir + (1 - dir) * smooth(Math.min(1, Math.max(0, (tau - p.back1) / 0.4)));
      if (tau < p.back0 + 0.35) { face = lw.face; P = swingP(prevP, carry(bx, lw.face), Math.min(1, (tau - prevEnd) / (p.back0 - prevEnd))); if (tau > p.back0) P = carry(bx, fs); }
      else if (tau < p.back1) P = carry(bx, dir);
      else if (p.twirl && tau < p.twirl[1]) {
        // two turns of the sparkler in a ring over the head, spun up and down
        const u = Math.max(0, (tau - p.twirl[0]) / (p.twirl[1] - p.twirl[0]));
        const ang = -Math.PI / 2 + 0.6 + TAU * 2 * smooth(u);
        const c = [bx + 15, G - 43], r = 10 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 1;
        const ring = [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)];
        const w = smooth(Math.min(1, u * 5, (1 - u) * 5));
        P = mixP(carry(bx, fs2), ring, w);
        st.doodle = true;
      } else {
        const t0 = p.twirl ? p.twirl[1] : p.back1;
        P = mixP(carry(bx, fs2), idle(bx), smooth((tau - t0) / (p.end - t0)));
      }
    }
  } else {
    P = idle(bx);
    const dd = doodleAt(p.K, s, p.end);
    if (dd) {
      const q = DOODLES[dd.shape](dd.u), env = smooth(Math.min(1, dd.u * 6, (1 - dd.u) * 6));
      P = [P[0] + q[0] * 10 * env, P[1] - 5 * env + q[1] * 10 * env];
      st.doodle = true;
    }
  }
  st.joy = (tau >= p.ig && tau < p.ig + 1.3) || (p.twirl && tau >= p.twirl[0] && tau < p.twirl[1]);
  if (mv) face = Math.sign(mv);
  st.face = face; st.P = P;
  return st;
}

// ------------------------------------------------------------ the kid
// Drawn as a silhouette against the night: the body is black (it hides the
// trail behind it) and only its edge catches the light, solid on the side
// that faces the sparkler and stippled on the far side. The face is lit
// by the sparkler in front of it. Facing right; column 6 is the feet.
// # body   f face (lit)   e eye   m mouth

const KID = [
  '.....###.....',
  '....#####....',
  '.....###.....',
  '...#######...',
  '..#########..',
  '.###########.',
  '.###########.',
  '#############',
  '#ooooooooooo#',
  '#############',
  '.##fffffffff.',
  '.##ffeffffef.',
  '.##ffeffffef.',
  '.##fffffffff.',
  '..##fffffmf..',
  '...#ffffff...',
  '..#########..',
  '.#s##s##s##s#',
  '.###########.',
  '#######o#####',
  '#############',
  '#######o#####',
  '#############',
  '.######o####.',
  '.###########.',
  '..#########..',
];
const KID_W = 13, KID_H = KID.length, KID_C = 6;
const LEGS = 8;                           // hips above the grass
const MW = 48, MH = 52;                   // the mask the kid is composed in
const MASK = new Uint8Array(MW * MH);     // 0 none, 1 body, 2 lit (face, scarf), 3 dark feature
const ARMM = new Uint8Array(MW * MH);     // the arm, in front of the body

function mdisc(ox, oy, x, y, r, v = 1, M = MASK) {
  for (let py = Math.floor(y - r - oy); py <= Math.ceil(y + r - oy); py++)
    for (let px = Math.floor(x - r - ox); px <= Math.ceil(x + r - ox); px++) {
      if (px < 0 || py < 0 || px >= MW || py >= MH) continue;
      const dx = px + ox + 0.5 - x, dy = py + oy + 0.5 - y;
      if (dx * dx + dy * dy <= r * r && !M[py * MW + px]) M[py * MW + px] = v;
    }
}
function mline(ox, oy, a, b, r, M = MASK) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
  for (let i = 0; i <= n; i++) mdisc(ox, oy, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, r, 1, M);
}

/**
 * The kid's arm, found from where the light must be: the sparkler is held
 * straight out along the arm, so the hand sits one wire-length short of
 * the light. When the light is out of reach, the kid goes up on tiptoe and
 * hops.
 */
function reach(st) {
  const ARM = 10, P = st.P;
  let S = shoulder(st.bx, st.face);
  let d = Math.hypot(P[0] - S[0], P[1] - S[1]);
  let hop = 0;
  if (d > ARM + st.Lb) {
    // raise the shoulder until it reaches (only helps when the light is above)
    const need = ARM + st.Lb, dx = P[0] - S[0];
    if (Math.abs(dx) < need) hop = Math.max(0, Math.min(8, (S[1] - P[1]) - Math.sqrt(need * need - dx * dx)));
    S = shoulder(st.bx, st.face, hop);
    d = Math.hypot(P[0] - S[0], P[1] - S[1]);
  }
  const ux = (P[0] - S[0]) / (d || 1), uy = (P[1] - S[1]) / (d || 1);
  const e = Math.max(3, Math.min(ARM + 2, d - st.Lb));
  return { S, hop, H: [S[0] + ux * e, S[1] + uy * e], u: [ux, uy] };
}

/** The kid, composed in the mask, then lit from `L` (strength `k`: 1 the sparkler, <1 the numerals' glow). */
function drawKid(g, st, R, L, k, T) {
  MASK.fill(0);
  const bx = Math.round(st.bx), face = st.face, hop = Math.round(R.hop);
  const ox = bx - 24, oy = G - 46;
  const top = G - LEGS - (KID_H - 1) - hop;
  const blink = (T % 3.7) < 0.13;
  for (let r = 0; r < KID_H; r++)
    for (let c = 0; c < KID_W; c++) {
      const ch = KID[r][c];
      if (ch === '.') continue;
      const x = bx + (c - KID_C) * face - ox, y = top + r - oy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      let v = ch === '#' ? 1 : ch === 'f' || ch === 's' || ch === 'o' ? 2 : 3;
      if (ch === 'e') {
        // the eyes follow the light: up a row when it is overhead
        const up = L[1] < top + 6 && k >= 1;
        if (blink ? true : up ? r === 12 : false) v = 2;
        if (up && r === 11 && !blink) MASK[(y - 1) * MW + x] = 3;
      }
      if (st.joy && r === 15 && c === 9) v = 3;     // an open, delighted mouth
      MASK[y * MW + x] = v;
    }
  // legs: a stride paced by the ground covered, so feet do not skate
  const hipY = G - LEGS + 0.5 - hop;
  const ph = (st.bx / 9) * Math.PI;
  for (const sgn of [-1, 1]) {
    const sw = st.walk ? Math.sin(ph) * 3 * sgn : 0;
    const lift = st.walk ? Math.max(0, Math.cos(ph) * sgn) * 2 : 0;
    const tuck = Math.min(3, R.hop * 0.4);
    const fx = bx + 0.5 + sgn * 2 + sw, fy = G - 0.5 - lift - Math.max(0, R.hop - tuck);
    mline(ox, oy, [bx + 0.5 + sgn * 2, hipY], [fx, fy - 1.5], 1.0);
    mline(ox, oy, [fx - 0.3 * face, fy - 0.8], [fx + 1.3 * face, fy - 0.8], 1.25);
  }
  // the scarf's tail, streaming behind
  const nx = bx + 0.5 - 4 * face, ny = top + 17.5;
  const wav = Math.sin(T * 7) * 0.8 + (st.walk ? 1.2 : 0);
  mline(ox, oy, [nx, ny], [nx - 3.5 * face, ny + 3 - wav], 0.85);
  // the arm, in front of the body, and the mitten
  ARMM.fill(0);
  mline(ox, oy, R.S, R.H, 1.3, ARMM);
  const lx = L[0], ly = L[1];
  const isOut = (M, x, y) => x < 0 || y < 0 || x >= MW || y >= MH || !M[y * MW + x];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const v = MASK[y * MW + x], a = ARMM[y * MW + x];
      if (!v && !a) continue;
      const X = x + ox, Y = y + oy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const M = a ? ARMM : MASK;
      const edge = isOut(M, x - 1, y) || isOut(M, x + 1, y) || isOut(M, x, y - 1) || isOut(M, x, y + 1);
      let on;
      if (!a && v === 2) on = k >= 1 || edge;        // the face shows only in the sparkler's light
      else if (!a && v === 3) on = false;
      else if (edge) on = true;
      else on = false;
      g.buf[Y * W + X] = on ? 1 : 0;
    }
  // the mitten holds the light: it is lit through
  disc(g, R.H[0], R.H[1], 1.5);
}

// ------------------------------------------------------------ the light in the air

const seedOf = (it) => (it.key % 997) + it.slot * 7;
const drawItem = (g, it, T, o = {}) => drawTrail(g, it.gl, it.rr, T, { seed: seedOf(it), step: it.step, ...o });
/** A 1-px line between two points in canvas coordinates. */
function seg(g, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) g.pixel(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}

/** The numerals, as the minute's choreography has them at this instant. */
function drawTrails(g, st, T) {
  const { p, tau } = st;
  if (tau < 0 || tau >= p.end) { for (const it of (tau < 0 ? p.old : p.cur)) drawItem(g, it, T); return; }
  for (const it of p.keep) drawItem(g, it, T);
  // The old numerals burn back along their own strokes, like a fuse,
  // toward the cold sparkler held to the end of the last one.
  for (const it of p.chain) {
    if (tau >= it.c1) continue;
    const u = Math.max(0, (tau - it.c0) / (it.c1 - it.c0));
    const iF = Math.min(it.gl.n - 1, Math.floor(u * (it.gl.n - 1)));
    drawItem(g, it, T, { i0: iF });
    if (tau >= it.c0 && !HALO) {
      const x = it.gl.X[iF], y = it.gl.Y[iF];
      disc(g, x, y, it.rr[1] + 0.9 + 0.5 * Math.sin(T * 50));
      burst(g, x, y, Math.floor(T * 40), 5, 7 * it.s, 0.6);
    }
  }
  // Embers drop from where the fuse has passed.
  if (!HALO) for (const it of p.chain) {
    const { X, Y, n } = it.gl;
    for (let i = 0; i < n; i += 3) {
      const a = tau - (it.c0 + (i / (n - 1)) * (it.c1 - it.c0));
      const life = 0.45 + 0.55 * hash(i, it.slot + 3);
      if (a < 0 || a > life) continue;
      const x = X[i] + (hash(i, it.slot) - 0.5) * 16 * a, y = Y[i] - (4 + 10 * hash(i, 8)) * a + 55 * a * a;
      if (y < G) { g.pixel(x, y); if (a < 0.2 * life) g.pixel(x, y - 1); }
    }
  }
  // Between numerals the fire leaps across in a spark.
  for (let j = 0; j + 1 < p.chain.length && !HALO; j++) {
    const a = p.chain[j], b = p.chain[j + 1];
    if (tau < a.c1 || tau >= b.c0) continue;
    const u = (tau - a.c1) / (b.c0 - a.c1);
    for (let k = 0; k < 6; k++) {
      const q = swingP(glyphEnd(a.gl), glyphStart(b.gl), Math.max(0, u - k * 0.04));
      disc(g, q[0], q[1] - 3 * Math.sin(Math.PI * u), 1.4 - k * 0.2);
    }
  }
  // The new numerals, as far as the hand has got: white-hot at the head.
  for (const w of p.writes) {
    if (tau < w.t0) continue;
    const u = Math.min(1, (tau - w.t0) / (w.t1 - w.t0)), D = w.t1 - w.t0;
    drawItem(g, w, T, { i1: sampleAt(w.gl, u), age: (i) => tau - (w.t0 + w.gl.C[i] * D) });
  }
}

/** A frame's worth of sparks thrown from a point: `seed` changes them each frame. */
function burst(g, x, y, seed, n, r, k = 1) {
  for (let j = 0; j < n; j++) {
    const a = TAU * hash(seed % 9973, j), l = r * (0.4 + 0.6 * hash(seed % 9973, j + 20)) * k;
    seg(g, x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
}

/** The new sparkler catching: a ring of sparks thrown out from the tip. */
function ignition(g, st, T) {
  const { p, tau } = st;
  const a = tau - p.ig;
  const big = p.hour;
  if (a < 0 || a > (big ? 1.6 : 0.8)) return;
  const N = big ? 90 : 34;
  for (let j = 0; j < N; j++) {
    const ang = TAU * (j / N) + hash(j, 31) * 0.4, v = (big ? 70 : 45) + (big ? 90 : 50) * hash(j, 32);
    const life = (big ? 0.7 : 0.35) + (big ? 0.9 : 0.4) * hash(j, 33);
    if (a > life) continue;
    const pos = (aa) => {
      const dd = (1 - Math.exp(-aa * 3.5)) / 3.5;            // air drag
      return [p.E[0] + Math.cos(ang) * v * dd, p.E[1] + Math.sin(ang) * v * dd + 30 * aa * aa];
    };
    const [x1, y1] = pos(a), [x0, y0] = pos(Math.max(0, a - 0.04));
    if (y1 < G) seg(g, x0, y0, x1, y1);
  }
}

/**
 * The sparkler's own fountain: sparks thrown from the burning point, each
 * from where the light was when it left, so a moving sparkler leaves a
 * wake. The old ones fork as they die, as sparkler sparks do.
 */
function fountain(g, T) {
  const RATE = 90, LMAX = 0.42;
  for (let k = Math.floor((T - LMAX) * RATE); k <= Math.floor(T * RATE); k++) {
    const te = k / RATE, a = T - te, kk = k % 100003;
    const life = 0.1 + 0.32 * hash(kk, 3) ** 1.6;
    if (a < 0 || a > life) continue;
    const s = stateAt(te);
    const rate = s.wire === 'lit' ? 1 : s.wire === 'dying' ? (1 - s.die) ** 2 : 0;
    if (hash(kk, 5) >= rate) continue;
    const ang = TAU * hash(kk, 1), v = 24 + 62 * hash(kk, 2);
    const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v - 6;
    const pos = (aa) => [s.P[0] + vx * aa, s.P[1] + vy * aa + 40 * aa * aa];
    const [x1, y1] = pos(a), [x0, y0] = pos(Math.max(0, a - 0.02));
    if (y1 >= G) continue;
    seg(g, x0, y0, x1, y1);
    if (hash(kk, 4) > 0.55 && a > 0.6 * life) {
      const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
      g.pixel(x1 + nx * 1.5 + (x1 - x0) / l, y1 + ny * 1.5 + (y1 - y0) / l);
      g.pixel(x1 - nx * 1.5 + (x1 - x0) / l, y1 - ny * 1.5 + (y1 - y0) / l);
    }
  }
}

/**
 * The afterglow of a moving sparkler: its path over the last moment,
 * thinning out. Longer while it doodles, so the doodle can be seen whole.
 */
function drawTail(g, T, st) {
  if (st.wire !== 'lit') return;
  const N = st.doodle ? 100 : 16, dt = 0.0135;
  let prev = st.P;
  for (let j = 1; j <= N; j++) {
    const s = stateAt(T - j * dt);
    if (s.wire !== 'lit' || (j > 16 && !s.doodle)) break;
    const q = s.P, lv = 1 - j / (N + 1);
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) * 1.3));
    for (let i = 0; i < n; i++) {
      const x = prev[0] + ((q[0] - prev[0]) * i) / n, y = prev[1] + ((q[1] - prev[1]) * i) / n;
      if (lv > 0.35 || dither(Math.floor(x), Math.floor(y), lv / 0.35)) g.pixel(x, y);
    }
    prev = q;
  }
}

/** The wire in the kid's hand: bare handle, coating, the burning point, burnt wire beyond. */
function drawWire(g, st, R, T) {
  if (!st.hold) return;
  const [hx, hy] = R.H, P = st.P;
  let ux = P[0] - hx, uy = P[1] - hy;
  const Lb = Math.hypot(ux, uy) || 1; ux /= Lb; uy /= Lb;
  const k = Lb / st.Lb, len = (st.wireLen ?? WIRE) * k, hd = HANDLE * k;
  for (let d = 1.5; d <= len; d += 0.7) {
    const x = hx + ux * d, y = hy + uy * d;
    let on;
    if (d < hd) on = ((Math.round(d / 0.7)) & 1) === 0;
    else if (st.wire === 'fresh' || (st.wire === 'lit' && d <= Lb)) {
      // the unburnt coating: thicker than the wire, so it reads as what is left
      g.pixel(x - uy * 0.9, y + ux * 0.9);
      on = true;
    } else if (st.wire === 'lit') on = d < Lb + 2 || (Math.round(d / 0.7) % 3 === 0);
    else if (st.wire === 'dying') on = Math.round(d / 0.7) % (st.die < 0.5 ? 2 : 4) === 0;
    else on = Math.round(d / 0.7) % 4 === 0;
    if (on) g.pixel(x, y);
  }
  if (st.wire === 'lit' || (st.wire === 'dying' && st.die < 0.6)) {
    const fl = st.wire === 'lit' ? 1 : 1 - st.die / 0.6;
    disc(g, P[0], P[1], 1.2 + 0.6 * fl + 0.3 * Math.sin(T * 47));
    burst(g, P[0], P[1], Math.floor(T * 60), 4, 4.5 * fl);
  }
}

/**
 * The light the sparkler throws on the grass: a pool under it that widens
 * as the light is held higher, tufts catching it, and the kid's own
 * shadow thrown away from it.
 */
function drawGround(g, L, k, bx, T) {
  const hk = Math.floor(T / 3600) % 997;     // the grass is trodden differently each hour (burn-in)
  if (k <= 0) return;
  const rx = 13 + 0.55 * Math.max(0, G - L[1]);
  const sh0 = bx, sh1 = bx + (bx - L[0]) * (8 / Math.max(6, G - L[1])) * 1.6;
  for (let x = 0; x < W; x++) {
    const d = (x + 0.5 - L[0]) / rx;
    let lv = k * Math.exp(-d * d * 1.6);
    if (lv < 0.03) continue;
    const inShadow = (x - sh0) * (x - sh1) < 0 && Math.abs(x - bx) > 1.5;
    if (inShadow) lv *= 0.25;
    if (dither(x, G, 0.2 + 0.8 * lv)) g.pixel(x, G);
    if (dither(x, G + 1, lv * 0.6)) g.pixel(x, G + 1);
    if (dither(x, G + 2, lv * 0.3)) g.pixel(x, G + 2);
    const blade = hash(x + hk * 13, 41);
    if (!inShadow && blade > 0.6 && lv > 0.25) g.pixel(x, G - 1);
    if (!inShadow && blade > 0.88 && lv > 0.5) g.pixel(x + (blade > 0.94 ? 1 : -1), G - 2);
  }
}

const PAIL = [
  '..#######..',
  '##.......##',
  '#.#######.#',
  '.#.......#.',
  '.#.......#.',
  '.#.......#.',
  '..#.....#..',
  '..#######..',
];
/** The bucket of water the spent wires go into, a few already standing in it. */
function drawBucket(g, L, k, T) {
  const BUCKET = bucketAt(T);
  const x0 = BUCKET.x - 5, y0 = BUCKET.y;
  const near = k > 0 && Math.hypot(L[0] - BUCKET.x, L[1] - BUCKET.y) < 45;
  for (let r = 0; r < PAIL.length; r++)
    for (let c = 0; c < PAIL[r].length; c++) {
      if (PAIL[r][c] !== '#') continue;
      const X = x0 + c, Y = y0 + r;
      if (near || r < 3 || ((X + Y) & 1) === 0) g.pixel(X, Y);
    }
  // the handle, stood up, and one spent wire leaning in it
  for (let q = 1; q < 12; q++) {
    const a = Math.PI * (q / 12);
    if (near || q & 1) g.pixel(BUCKET.x + 0.5 - 5.5 * Math.cos(a), y0 + 1 - 5 * Math.sin(a));
  }
  for (let d = 1; d < 9; d += 0.8) g.pixel(x0 + 7 + Math.sin(0.45) * d, y0 + 1 - Math.cos(0.45) * d);
}

/** The spent wire falling into the bucket, and the hiss of steam after. */
function drawDrop(g, st, T) {
  const { tau } = st, BUCKET = bucketAt(T);
  if (tau < T_DROP || tau > T_DROP + 2.2) return;
  const a = tau - T_DROP;
  if (a < 0.3) {
    const R = reach({ ...st, wire: 'spent', Lb: HANDLE, P: poseP(st.bx, -1, 1.05, 9, HANDLE) });
    const u = a / 0.3, q = mixP(R.H, [BUCKET.x, BUCKET.y + 1], u * u);
    const ang = 1.2 + 1.2 * u;
    for (let d = 0; d < WIRE * (1 - 0.6 * u); d += 1.4) g.pixel(q[0] - Math.cos(ang) * d, q[1] - Math.sin(ang) * d);
  } else {
    for (let j = 0; j < 3; j++) {
      const b = a - 0.3 - j * 0.25;
      if (b < 0 || b > 1.2) continue;
      const r = 1 + b * 3, y = BUCKET.y - 2 - b * 9, x = BUCKET.x + Math.sin(b * 4 + j) * 2;
      for (let q = 0; q < 10; q++) if (q % 2 === (j & 1)) g.pixel(x + r * Math.cos((TAU * q) / 10), y + r * Math.sin((TAU * q) / 10));
    }
  }
}

export default {
  name: 'Sparkler',
  blurb: 'A kid writes the time in the air with a sparkler that burns down with the seconds; at the minute it lights a new one from the old numeral, which burns back into it like a fuse.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, oled, night }) {
    const T = date.getTime() / 1000;
    const st = stateAt(T);
    const R = reach(st);
    const lit = st.wire === 'lit' || (st.wire === 'dying' && st.die < 0.7);
    const k = st.wire === 'lit' ? 1 : st.wire === 'dying' ? Math.max(0, 1 - st.die / 0.7) : 0;
    const L = lit ? st.P : [96, 22];
    drawGround(g, st.P, k * (0.85 + 0.15 * Math.sin(T * 37)), st.bx, T);
    drawBucket(g, L, k, T);
    drawDrop(g, st, T);
    drawKid(g, st, R, L, lit ? 1 : 0.4, T);
    // The kid stands behind the plane of the light it is painting.
    HALO = true; drawTrails(g, st, T);
    HALO = false; drawTrails(g, st, T);
    ignition(g, st, T);
    drawTail(g, T, st);
    drawWire(g, st, R, T);
    fountain(g, T);
    oled.contrast(0xcf + (0x30 - 0xcf) * night);
  },
};
