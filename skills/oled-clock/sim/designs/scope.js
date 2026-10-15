// Scope — the time written by one electron beam on a phosphor screen.
//
// A vector "scope clock": nothing on the face is drawn as pixels. There is
// one beam, and a program saying where it is at every instant: it traces
// the four digits (a single-stroke italic hand of its own, a slashed zero, a
// crossed seven, each digit one breath of the beam), dwells on the two
// colon dots, and finishes each 0.8 s pass with a seconds trace along the
// bottom, a sweep out to the current second with a pulse every ten. Between
// strokes the beam is blanked and jumps.
//
// What the glass shows is the phosphor. Every frame the beam's path over the
// last 2.4 s is replayed in 1/2400 s steps and each step deposits energy in
// proportion to the time spent there (so a slow beam is bright, a fast one
// faint), decayed by age. The energy is blurred into the spot and a wider
// bloom: where it is high (a fresh trace, the ends and corners where the
// beam dwells, the colon) the trace is fat and blooms; as it ages it thins
// to a dotted ridge. So the head of the beam is always visibly writing,
// the digit it wrote 0.8 s ago is fading, and nothing is stored between
// frames: frame() is a pure function of the wall clock.
//
// The minute turn is in beam passes (0.8 s divides the minute, so passes
// start on the same instants every minute): from :58.4 the old time is
// unwritten left to right as the program blends into X-Y mode, a Lissajous
// figure or a spirograph knot chosen by the minute (readout "X-Y"); after
// :00.2 the figure winds itself tight into the colon, spinning up as it
// shrinks, and from :01.6 one clean pass writes the new time left to right.
// The old time is only ever shown before :00, the new one after, and what
// is legible during the writing pass is always the start of the new time.
//
// The hour is the old way a picture tube switches off: from :57.6 the time
// is squeezed into a line, then into a dot that hangs and fades; at :00 the
// beam bursts out in spokes, and draws the scope clock's analog face
// (readout "DIAL"), the plate swinging in in perspective to rest, with the
// hour and "00" either side, the hand of the hour just struck blooming and a
// second hand running. At :04.8 the face is blended back into the digits.
//
// Burn-in: the trace walks a 3 px orbit, one step a minute, taken during
// the turn; the graticule and the date readout walk their own; the date
// changes corner every five minutes. From 23:00 to 07:00 the panel dims.

import { dither, noise, clamp, ease, clockFields, font3x5, orbit } from '../js/kit.js';

const TAU2 = Math.PI * 2;

// ------------------------------------------------------------ splines

/** Centripetal Catmull-Rom through `pts`, sampled finely. */
function spline(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const n = 12;
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

/** Elliptical arc as points, clock angles in degrees (0 = up, clockwise). */
function ell(cx, cy, rx, ry, a0, a1, step = 12) {
  const pts = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}

// ------------------------------------------------------------ the stroke font
// Each digit is a list of strokes; a stroke is a list of pieces, smooth runs
// of control points that meet at corners. Box 18 x 32, y down, before slant.

const GLYPHS = {
  0: [[ell(9, 16, 8.5, 15.5, 32, -328), [[13.5, 2.9], [4.5, 29.1]]]],
  1: [[[[1, 10.5], [2.6, 9.4], [7.2, 6], [11.5, 0]], [[11.5, 0], [11.5, 32]]]],
  2: [[[[2.5, 9.5], [1, 6], [3, 1.6], [9, 0], [15, 2.4], [16.6, 8], [14, 14.5], [8, 21], [3, 27], [0.8, 31.5]], [[0.8, 31.5], [5.5, 30], [10.5, 31.6], [15, 31.2], [17.6, 28.4]]]],
  3: [[[[1, 0.8], [16.8, 0.8]], [[16.8, 0.8], [7.5, 12.5]], [[7.5, 12.5], [13, 13.4], [17, 19], [16.2, 26.5], [10.5, 31.6], [4, 31.2], [0.6, 27.2]]]],
  4: [[[[12.5, 32], [12.5, 0]], [[12.5, 0], [0.5, 22]], [[0.5, 22], [17.5, 22]]]],
  5: [[[[16.2, 0.8], [3, 0.8]], [[3, 0.8], [2, 13.6]], [[2, 13.6], [6, 12], [11, 11.6], [16, 15.6], [17.2, 22], [14.6, 29], [8.6, 31.8], [3, 30.6], [0.5, 27]]]],
  6: [[[[15.5, 3], [12, 0.3], [7, 0.5], [2.5, 5], [0.5, 14], [0.7, 23], [3.5, 30], [9, 31.8], [14.5, 29.5], [16.8, 23], [15, 16], [9.5, 13.5], [4, 15.5], [1, 20]]]],
  7: [[[[0.8, 5], [1, 0.8]], [[1, 0.8], [17.5, 0.8]], [[17.5, 0.8], [12.5, 10], [8.6, 20], [7, 32]]], [[[5, 16.5], [15, 16.5]]]],
  8: [[[[15, 5], [12, 0.8], [6, 0.6], [2, 4], [2.5, 9.5], [9, 15.5], [15.5, 21], [16.5, 27], [12, 31.5], [5, 31.5], [1, 27], [2.5, 21], [9, 15.5], [14.5, 10.5], [15, 5]]]],
  9: [[[[16.5, 10.5], [13, 15], [7, 16], [2, 13], [0.8, 7.5], [3.5, 1.5], [9, 0], [14.5, 2], [17, 8], [16.5, 17], [14, 25], [10, 30.5], [4.5, 31.8], [1, 29]]]],
};

/** At small sizes the slash would fill the zero: a plain oval. */
const ZERO_PLAIN = [[ell(9, 16, 8.5, 15.5, 0, 360)]];

const GH = 32, SLANT = 0.16, GSCALE = 34 / 32;
/** A glyph's strokes as point lists in screen coordinates. */
function glyphStrokes(d, x0, y0) {
  return GLYPHS[d].map((stroke) => stroke.map((piece) => spline(piece.map(([x, y]) =>
    [x0 + (x + SLANT * (GH - y)) * GSCALE, y0 + y * GSCALE]))));
}

// ------------------------------------------------------------ beam programs
// A program is where the beam is at loop phase u (0..1) and wall time T:
// at(u, T) -> [x, y, z], z the beam current (0 = blanked).

/**
 * A table program from strokes (each a list of smooth pieces) and dots.
 * Time is spent along strokes at constant speed, plus dwell at the ends and
 * corners (that is where a vector display is brightest), and a quick
 * blanked jump between strokes.
 */
function table(items, { dwellEnd = 4, dwellCorner = 2.5, jump = 0.08 } = {}) {
  const X = [], Y = [], Z = [], W = [];
  const node = (x, y, z, w) => { X.push(x); Y.push(y); Z.push(z); W.push(w); };
  let last = null;
  const go = (x, y) => {
    if (last) node(x, y, 0, jump * Math.hypot(x - last[0], y - last[1]) + 0.4);
    else node(x, y, 0, 0);
    last = [x, y];
  };
  for (const it of items) {
    if (it.dot) {
      go(it.dot[0], it.dot[1]);
      node(it.dot[0], it.dot[1], 1, it.dwell ?? 6);
      continue;
    }
    const pieces = it;
    go(pieces[0][0][0], pieces[0][0][1]);
    node(last[0], last[1], 1, dwellEnd);
    pieces.forEach((pc, k) => {
      for (let i = 1; i < pc.length; i++) {
        const [x, y] = pc[i];
        node(x, y, 1, Math.hypot(x - last[0], y - last[1]));
        last = [x, y];
      }
      node(last[0], last[1], 1, k < pieces.length - 1 ? dwellCorner : dwellEnd);
    });
  }
  // Close the loop: blank back to the start.
  node(X[0], Y[0], 0, jump * Math.hypot(X[0] - last[0], Y[0] - last[1]) + 0.4);
  const C = new Float64Array(W.length);
  let s = 0;
  for (let i = 0; i < W.length; i++) { s += W[i]; C[i] = s; }
  for (let i = 0; i < C.length; i++) C[i] /= s;
  return { X, Y, Z, C, total: s };
}

/** Where a table puts the beam at phase v in [0,1). */
function tableAt(tb, v, out) {
  const C = tb.C;
  let lo = 1, hi = C.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (C[mid] < v) lo = mid + 1; else hi = mid; }
  const c0 = C[lo - 1], c1 = C[lo];
  const k = c1 > c0 ? (v - c0) / (c1 - c0) : 0;
  out[0] = tb.X[lo - 1] + (tb.X[lo] - tb.X[lo - 1]) * k;
  out[1] = tb.Y[lo - 1] + (tb.Y[lo] - tb.Y[lo - 1]) * k;
  out[2] = tb.Z[lo];
  return out;
}

// ------------------------------------------------------------ the time program

const SLOT_X = [5, 30, 72, 97];
const TIME_Y = 13;
const COLON_X = 64;
const SWEEP_Y = 57, SWEEP_X0 = 4, SWEEP_W = 120;
const F_TIME = 0.93;          // share of each loop spent on the digits
const SWEEP_V = 1100;          // px/s along the seconds trace

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

/** The display offset for a minute: the scope's screensaver walk (burn-in). */
function offsetFor(key) {
  const [x, y] = orbit(new Date(key * 60000 + 30000), 3, 1);
  return [x, y];
}

const timeCache = new Map();
/** The digits of minute `key` as a table program. */
function timeTable(key) {
  let tb = timeCache.get(key);
  if (tb) return tb;
  const f = clockFields(new Date(key * 60000));
  const [ox, oy] = offsetFor(key);
  const d = digitsOf(f);
  const items = [];
  const add = (i) => { for (const s of glyphStrokes(d[i], SLOT_X[i] + ox, TIME_Y + oy)) items.push(s); };
  add(0); add(1);
  const cx = COLON_X + ox;
  items.push({ dot: [cx + 1.2, TIME_Y + oy + 11], dwell: 7 }, { dot: [cx - 0.6, TIME_Y + oy + 25], dwell: 7 });
  add(2); add(3);
  tb = table(items);
  tb.ox = ox; tb.oy = oy;
  timeCache.set(key, tb);
  if (timeCache.size > 6) timeCache.delete(timeCache.keys().next().value);
  return tb;
}

/** The steady display: digits, then the seconds trace along the bottom. */
function timeAt(key, u, T, out) {
  const tb = timeTable(key);
  if (u < F_TIME) return tableAt(tb, u / F_TIME, out);
  // The seconds trace: a sweep from the left edge to the current second,
  // with a small pulse every ten seconds, then the beam rests on its head.
  const sec = ((T % 60) + 60) % 60;
  const len = (SWEEP_W * sec) / 60;
  const tAvail = (1 - F_TIME) * LOOP;
  const tLine = Math.min(tAvail * 0.85, len / SWEEP_V);
  const tt = (u - F_TIME) * LOOP;
  const x = SWEEP_X0 + tb.ox + (tt < tLine ? (len * tt) / tLine : len);
  const rel = (x - SWEEP_X0 - tb.ox) % 20;
  const bump = rel > 18 ? 2 : 0;
  // After a short rest on the head the beam is blanked till the next loop.
  out[0] = x; out[1] = SWEEP_Y + tb.oy - bump; out[2] = tt < 0.004 || tt > tLine + 0.006 ? 0 : 1;
  return out;
}

// ------------------------------------------------------------ the phosphor

const LOOP = 0.8;              // seconds per refresh of the whole picture
const PERSIST = 0.9;           // phosphor decay time constant, s
const WINDOW = 2.4;            // how far back the afterglow is computed
const DT = 1 / 2400;           // beam sample step
const V0 = 520;                // reference beam speed, px/s: energy 1 per px
const GAIN = 3.2;

const W = 128, H = 64;
const E = new Float32Array(W * H), B = new Float32Array(W * H), B2 = new Float32Array(W * H), TMP = new Float32Array(W * H);

function deposit(x, y, e) {
  const fx = x - 0.5, fy = y - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) return;
  const ax = fx - ix, ay = fy - iy, i = iy * W + ix;
  E[i] += e * (1 - ax) * (1 - ay); E[i + 1] += e * ax * (1 - ay);
  E[i + W] += e * (1 - ax) * ay; E[i + W + 1] += e * ax * ay;
}

/** Box blur of `src` into `dst`, radius r, separable. */
function blur(src, dst, r) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += src[y * W + xx]; }
      TMP[y * W + x] = s / (2 * r + 1);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += TMP[yy * W + x]; }
      dst[y * W + x] = s / (2 * r + 1);
    }
}

const decay = (age) => Math.exp(-((age / PERSIST) ** 1.6)) + 1.5 * Math.exp(-age / 0.025);

/** Run the beam over the last WINDOW seconds and paint what still glows. */
function phosphor(g, beam, T) {
  E.fill(0);
  const p = [0, 0, 0];
  let px = 0, py = 0, pz = 0, have = false;
  const n = Math.round(WINDOW / DT);
  for (let i = 0; i <= n; i++) {
    const age = i * DT;
    beam(T - age, p);
    const [x, y, z] = p;
    if (have && z > 0 && pz > 0) {
      const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
      const e = DT * V0 * z * decay(age);
      const m = dist < 0.7 ? 1 : Math.ceil(dist / 0.7);
      for (let k = 0; k < m; k++) deposit(px + (dx * (k + 0.5)) / m, py + (dy * (k + 0.5)) / m, e / m);
    }
    px = x; py = y; pz = z; have = true;
  }
  blur(E, B, 1);
  blur(B, B2, 2);
  // The trace's centre (a ridge of the spot's energy) fades by getting
  // sparser; its bloom spreads only where the energy is high, so a fresh or
  // dwelling beam looks fat and an old trace thin.
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : B[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = B[i];
      const glow = B2[i];
      if (b < 0.004 && glow < 0.02) continue;
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      const ridgeX = b >= l && b >= r && b > 1.08 * Math.min(l, r);
      const ridgeY = b >= u && b >= d && b > 1.08 * Math.min(u, d);
      let lv;
      if (ridgeX || ridgeY) lv = (1 - Math.exp(-GAIN * 4 * b) - 0.12) / 0.88;
      else lv = clamp((1 - Math.exp(-GAIN * (1.2 * b + 0.8 * glow)) - 0.45) / 0.4, 0, 1);
      if (lv > 0 && dither(x, y, lv)) g.pixel(x, y, 1);
    }
}

// ------------------------------------------------------------ other figures

const CX = 64, CY = 31;

/** This turn's dance: a Lissajous figure or a spirograph knot, from the minute key. */
const danceCache = new Map();
function danceParams(key) {
  let d = danceCache.get(key);
  if (!d) { d = makeDance(key); danceCache.set(key, d); if (danceCache.size > 4) danceCache.delete(danceCache.keys().next().value); }
  return d;
}
function makeDance(key) {
  const RATIOS = [[3, 2], [1, 2], [2, 3], [2, 1], [3, 4], [4, 3]];
  const r = RATIOS[Math.floor(noise(key, 1) * RATIOS.length)];
  return {
    spiro: noise(key, 2) < 0.5,
    a: r[0], b: r[1],
    phase: noise(key, 3) * TAU2,
    spin: (noise(key, 4) < 0.5 ? -1 : 1) * (0.06 + 0.05 * noise(key, 5)),
    knot: [[5, 3], [7, 4], [8, 3], [7, 3], [5, 2]][Math.floor(noise(key, 6) * 5)],
  };
}

/**
 * The dance at phase u, `tau` seconds after the turn. A Lissajous figure is
 * X-Y mode: two sines; its phase drifts, so it seems to turn in depth. A
 * spirograph is a hypotrochoid, turning slowly.
 */
function danceAt(P, u, tau, out) {
  // After :00.4 the figure winds itself tight into the colon, spinning up
  // as it shrinks, and the new digits unspool from there.
  const w = ease.inOutCubic(clamp((tau - 0.2) / (MIN_IN - 0.2), 0, 1));
  const env = 1 - 0.95 * w;
  tau += 0.9 * w * w;
  if (!P.spiro) {
    const k = 2;
    out[0] = CX + 50 * env * Math.sin(TAU2 * P.a * k * u + P.phase + TAU2 * P.spin * tau);
    out[1] = CY + 22 * env * Math.sin(TAU2 * P.b * k * u);
  } else {
    // A hypotrochoid with R:r = n:m closes after m turns of the rolling circle.
    const [n, m] = P.knot;
    const R = 1, r = m / n, d = 0.8 * r + 0.25;
    const th = TAU2 * m * u, rot = P.phase + TAU2 * P.spin * tau;
    const x = (R - r) * Math.cos(th) + d * Math.cos(((R - r) / r) * th);
    const y = (R - r) * Math.sin(th) - d * Math.sin(((R - r) / r) * th);
    const s = 29 * env / (R - r + d);
    out[0] = CX + s * 1.25 * (x * Math.cos(rot) - y * Math.sin(rot));
    out[1] = CY + s * (x * Math.sin(rot) + y * Math.cos(rot));
  }
  out[2] = 0.3 + 0.7 * env;   // the current falls as the figure shrinks
  return out;
}

/** The starburst: spokes flung out from the centre, blanked on the way back. */
function burstAt(u, tau, out) {
  const N = 12;
  const j = Math.floor(u * N), v = u * N - j;
  const a = (j * TAU2) / N + tau * 0.8;
  const R = 75 * ease.outCubic(clamp(tau / 0.5, 0, 1)) * (j % 2 ? 0.6 : 1);
  const r0 = 50 * clamp((tau - 0.35) / 0.5, 0, 1);       // the spokes leave the centre
  const r = v < 0.6 ? r0 + (R - r0) * (v / 0.6) : R;
  out[0] = CX + r * Math.sin(a) * 1.15; out[1] = CY - r * Math.cos(a) * 0.85;
  out[2] = v < 0.6 && r > r0 ? 2.2 : 0;
  return out;
}

// The analog face of a scope clock, drawn at the hour.
const DIAL_R = 28;
const dialCache = new Map();
function dialTable(h12, hh) {
  if (dialCache.has(hh)) return dialCache.get(hh);
  const items = [[ell(CX, CY, DIAL_R, DIAL_R, 0, 360, 6)]];
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU2) / 12, r0 = k % 3 ? 24 : 20;
    const p = (r) => [CX + r * Math.sin(a), CY - r * Math.cos(a)];
    items.push([[p(r0), p(DIAL_R - 1.5)]]);
    // The hour that has just struck dwells longest, so it blooms.
    if (k === h12 % 12) items.push({ dot: p(DIAL_R + 3.5), dwell: 22 });
  }
  // Either side of the dial, the hour and the minutes in the beam's own
  // hand, smaller: the face is also the plain time.
  const k = 0.6, gw = 18 * k + 3.5;
  const put = (txt, xc) => {
    const x0 = xc - (txt.length * gw - 2.5) / 2 - 1;
    [...txt].forEach((ch, i) => {
      for (const st of (ch === '0' ? ZERO_PLAIN : GLYPHS[ch])) items.push(st.map((pc) => spline(pc.map(([x, y]) =>
        [x0 + i * gw + (x + SLANT * (GH - y)) * k, CY - 10 + y * k]))));
    });
  };
  put(hh, 17); put('00', 111);
  const tb = table(items, { dwellEnd: 2 });
  dialCache.set(hh, tb);
  return tb;
}

const F_DIAL = 0.72;
/** The dial at phase u and wall time t, before its 3D swing. */
function dialFlat(h12, u, t, fl, out) {
  if (u < F_DIAL) return tableAt(dialTable(h12, fl.hh), u / F_DIAL, out);
  // Hands: hour, minute, second, each traced out and back (the hour hand twice, a slim kite).
  const v = (u - F_DIAL) / (1 - F_DIAL);
  const hands = [
    [((h12 % 12) + fl.m / 60) / 12, 14, 0.12],
    [((h12 % 12) + fl.m / 60) / 12, 14, -0.12],
    [(fl.m + fl.sec / 60) / 60, 22, 0],
    [fl.sec / 60, 25, 0],
  ];
  const j = Math.min(3, Math.floor(v * 4)), w = v * 4 - j;
  const [turn, len, wob] = hands[j];
  const a = turn * TAU2 + (w < 0.5 ? wob : -wob) * (w < 0.5 ? w * 2 : (1 - w) * 2);
  const r = len * (w < 0.5 ? w * 2 : (1 - w) * 2);
  out[0] = CX + r * Math.sin(a); out[1] = CY - r * Math.cos(a); out[2] = 1;
  return out;
}

/** The dial swung about its vertical axis by `yaw`, in perspective. */
function swing(out, yaw, pitch) {
  const x = out[0] - CX, y = out[1] - CY;
  const x1 = x * Math.cos(yaw), z1 = x * Math.sin(yaw);
  const y1 = y * Math.cos(pitch), z2 = z1 + y * Math.sin(pitch);
  const s = 110 / (110 + z2);
  out[0] = CX + x1 * s; out[1] = CY + y1 * s;
  return out;
}

// ------------------------------------------------------------ the schedule

const MIN_OUT = 1.6, MIN_HOLD = 0.8, MIN_IN = 1.0, MIN_ARRIVE = 1.6;   // minute turn, s from :00
const H_SQUEEZE = 2.4, H_DOT = 0.8, H_DIAL = 0.55, H_SETTLE = 4.8, H_BACK = 5.6;

const QA = [0, 0, 0], QB = [0, 0, 0];
const mix = (out, a, b, m) => {
  out[0] = a[0] + (b[0] - a[0]) * m; out[1] = a[1] + (b[1] - a[1]) * m; out[2] = a[2] + (b[2] - a[2]) * m;
  return out;
};

const fieldsCache = new Map();
function fieldsOf(key) {
  let f = fieldsCache.get(key);
  if (!f) { f = clockFields(new Date(key * 60000)); fieldsCache.set(key, f); if (fieldsCache.size > 8) fieldsCache.delete(fieldsCache.keys().next().value); }
  return f;
}

/** What phase of the minute or hour event wall time t is in. */
function phaseOf(t) {
  const key = Math.floor(t / 60), s = t - key * 60;
  if (s >= 57) return { turn: key + 1, tau: s - 60, key };
  if (s < 8) return { turn: key, tau: s, key };
  return { turn: null, tau: 0, key };
}

/** Where the beam is at wall time t (epoch seconds). */
function beamAt(t, out) {
  const u = ((t / LOOP) % 1 + 1) % 1;
  const { turn, tau, key } = phaseOf(t);
  if (turn === null) return timeAt(key, u, t, out);
  const old = turn - 1;
  const hour = fieldsOf(turn).m === 0;
  if (!hour) {
    const P = danceParams(turn);
    if (tau < -MIN_OUT) return timeAt(old, u, t, out);
    // The turn's phases begin on loop boundaries (LOOP divides the minute),
    // so each is one pass of the beam: the old time is unwritten left to
    // right, and the new time is written in one clean pass from :01.6.
    if (tau < -MIN_HOLD) return mix(out, timeAt(old, u, t, QA), danceAt(P, u, tau, QB), (tau + MIN_OUT) / (MIN_OUT - MIN_HOLD));
    if (tau < MIN_IN) return danceAt(P, u, tau, out);
    if (tau < MIN_ARRIVE) return mix(out, danceAt(P, u, tau, QA), timeAt(turn, u, t, QB), ease.inQuad((tau - MIN_IN) / (MIN_ARRIVE - MIN_IN)));
    return timeAt(turn, u, t, out);
  }
  // The hour. The picture is switched off as an old set does it: squeezed to
  // a line, then to a dot that hangs and fades; at :00 it bursts, and the
  // beam draws the scope clock's analog face, swinging in to rest.
  if (tau < -H_SQUEEZE) return timeAt(old, u, t, out);
  if (tau < 0) {
    timeAt(old, u, t, out);
    const k = (tau + H_SQUEEZE) / (H_SQUEEZE - H_DOT);
    const sy = 1 - ease.inCubic(clamp(k / 0.55, 0, 1)) * 0.985;
    const sx = 1 - ease.inCubic(clamp((k - 0.55) / 0.45, 0, 1));
    out[0] = CX + (out[0] - CX) * sx; out[1] = CY + (out[1] - CY) * sy;
    if (k > 1) out[2] = 3 - 2.6 * clamp((tau + H_DOT) / H_DOT, 0, 1);
    return out;
  }
  const fl = fieldsOf(turn);
  const h12 = fl.h12;
  const fNow = { m: fl.m, sec: tau, hh: fl.hh };
  const yawAt = (tt) => {
    const k = Math.max(0, tt - H_DIAL);
    return 1.45 * Math.exp(-k / 0.9) * Math.cos(k * 3.4);
  };
  const dial = (o) => swing(dialFlat(h12, u, t, fNow, o), yawAt(tau), 0.25 * Math.exp(-Math.max(0, tau - H_DIAL) / 1.2));
  if (tau < H_DIAL) return burstAt(u, tau, out);
  if (tau < H_DIAL + 0.7) return mix(out, burstAt(u, tau, QA), dial(QB), ease.inOutCubic((tau - H_DIAL) / 0.7));
  if (tau < H_SETTLE) return dial(out);
  if (tau < H_BACK) return mix(out, dial(QA), timeAt(turn, u, t, QB), ease.inOutCubic((tau - H_SETTLE) / (H_BACK - H_SETTLE)));
  return timeAt(turn, u, t, out);
}

// ------------------------------------------------------------ graticule and readouts

/**
 * The graticule: a dot at every 16 px division, the centre axes dotted with
 * minor divisions. One-pixel marks, so it reads as etched glass behind the
 * trace. It walks its own small orbit (burn-in).
 */
function graticule(g, date) {
  const [gx, gy] = orbit(new Date(date.getTime() + 7 * 60000), 1, 5);
  for (let y = 0; y <= 64; y += 16)
    for (let x = 0; x <= 128; x += 16) g.pixel(x + gx, y + gy, 1);
  for (let x = 4; x < 128; x += 4) if (x % 16) g.pixel(x + gx, 32 + gy, 1);
  for (let y = 4; y < 64; y += 4) if (y % 16) g.pixel(64 + gx, y + gy, 1);
}

/** Readouts in the corners, as a scope prints them: mode, and the date. */
function readouts(g, date, f, T) {
  const { turn, tau } = phaseOf(T);
  // The mode readout shows only when the scope leaves Y-T (the time).
  let mode = '';
  if (turn !== null) {
    const hour = fieldsOf(turn).m === 0;
    if (!hour && tau > -MIN_HOLD - 0.3 && tau < MIN_ARRIVE) mode = 'X-Y';
        if (hour && tau >= H_DIAL + 0.3 && tau < H_BACK) mode = 'DIAL';
  }
  const [rx, ry0] = orbit(new Date(date.getTime() + 2 * 60000), 3, 2), ry = Math.max(-1, Math.min(1, ry0));
  const dt = `${f.dow} ${f.dd} ${f.month}`;
  // The two readouts change corners every five minutes (at :30, never during
  // a turn), so neither lights the same glass all day.
  const swap = Math.floor((date.getTime() - 30000) / 300000) % 2;
  const [a, b] = swap ? [dt, mode] : [mode, dt];
  if (a) g.text(a, 4 + rx, 1 + ry, { font: font3x5 });
  if (b) g.text(b, 124 - font3x5.measure(b) + rx, 1 + ry, { font: font3x5 });
}

// ------------------------------------------------------------ the design

export default {
  name: 'Scope',
  blurb: 'A scope clock: one electron beam writes the time on glowing phosphor; Lissajous knots on the minute, a tube switch-off and an analog dial on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    graticule(g, date);
    readouts(g, date, f, T);
    phosphor(g, beamAt, T);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
