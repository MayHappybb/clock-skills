// Zen sand: the table's memory. One steel ball, one continuous path per
// minute, and a height field that is whatever the ball last did near each
// grain of sand.
//
// Model: every pixel of sand takes the groove profile of the LAST pass of
// the ball within reach R ("latest writer"). A pass is a visit: the run of
// path samples during which the ball is within R; it writes a * f(dMin).
// That one rule gives grooves with ridges, crossings where the newer groove
// wins, and smoothing: tight parallel passes leave every grain at the same
// small offset from the next pass, i.e. flat sand.
//
// Determinism: the path of minute m depends only on m. The field at the
// start of a minute is the end of the previous one; the hour show re-ploughs
// the whole table except an unchanged first digit, so a cold start replays
// at most the previous full hour from a synthetic base (see startState).

import { glyphLegs } from './zensand-glyphs.js';

export const W = 64, N = W * W;
export const CX = 31.5, CY = 31.5;
export const RF = 28.0;          // radius of the field (inside the lace band)
export const RB = 30.0, AB = 1.25; // lace band: mean radius, amplitude
export const RS = 31.9;          // radius of the sand (the table's wall)
export const YL = 12.3;          // half height of the script lane
const YC = 10.8;                 // half height of an erase column
const YJ = 7.9;                  // join line, relative to centre
const BODY_DY = -9.1;            // body y -> relative y
const SLANT = 0.12;              // italic shear of the script

const JOIN_A = 0.35;
const R = 2.4, WG = 1.25, RIDGE = 0.36;
/** The groove profile: trough to d = WG, a ridge out to R. */
export function prof(d) {
  if (d < WG) { const q = d / WG; return -1 + q * q; }
  if (d < R) return RIDGE * Math.sin(Math.PI * (d - WG) / (R - WG));
  return 0;
}

// slots of the script: H1 H2 : M1 M2  (left edge relative to centre, width)
const SLOT_L = [-26, -14, -2, 2, 14];

const pad2 = (n) => String(n).padStart(2, '0');
export function timeStr(m) { const d = new Date(m * 60000); return pad2(d.getHours()) + pad2(d.getMinutes()); }
const slotChars = (s) => [s[0], s[1], ':', s[2], s[3]];

// --------------------------------------------------------------- the path
// A path is built as pieces { xy:[...], a, v } (v px/s), then resampled.
class Path {
  constructor() { this.pieces = []; this.x = 0; this.y = 0; }
  at(x, y) { this.x = x; this.y = y; return this; }
  /** add points (absolute px) */
  line(xy, a, v, carve = false) {
    const pts = [this.x, this.y, ...xy];
    this.pieces.push({ xy: pts, a, v, carve });
    this.x = xy[xy.length - 2]; this.y = xy[xy.length - 1];
    return this;
  }
  to(x, y, a, v, carve = false) { return this.line([x, y], a, v, carve); }
}

const ax = (rx) => CX + rx, ay = (ry) => CY + ry;
function glyphXY(bx, by, slot) {
  const ry = by + BODY_DY;
  const off = slot === 2 ? 0 : 1.5;
  return [ax(SLOT_L[slot] + off + bx - ry * SLANT), ay(ry)];
}
/** Join point at the left edge of a slot (absolute). */
const joinL = (slot) => [ax(SLOT_L[slot] - YJ * SLANT), ay(YJ)];
const textEnd = () => [ax(26 - YJ * SLANT), ay(YJ)];

/** Plough slot k's figure of time string s, from joinL(k) to joinL(k + 1). */
function writeSlot(P, s, k, v) {
  for (const leg of glyphLegs(slotChars(s)[k])) {
    const xy = [];
    for (let q = 0; q < leg.xy.length; q += 2) xy.push(...glyphXY(leg.xy[q], leg.xy[q + 1], k));
    P.line(xy.slice(2), leg.a, v, true);
  }
}

/**
 * Erase (smooth) the script lane from a slanted left edge (relative x xL at
 * the join line... i.e. x = xL - ry * SLANT) to the rim, in vertical columns,
 * right to left. Columns sit on pixel centres, one pixel apart, so every
 * grain ends one pixel from the pass after it: flat. Ends at the join height.
 */
const RR = RF - 0.4, ERASE_A = 0.3;
/** 1. Cut the old figures right of the slanted edge xL through the waist, then rake coarse rows outward: after this pass no digit survives in a readable form. */
function eraseCoarse(P, xL, v) {
  const rowX = (ry) => [ax(xL - ry * SLANT) + 0.6, ax(Math.sqrt(Math.max(0, RR * RR - ry * ry)))];
  let right = true;
  for (const ry of [0, -4, 4, -8, 8, -10.8, 10.8]) {
    const [xa, xb] = rowX(ry);
    if (xb - xa < 1) continue;
    P.to(right ? xb : xa, ay(ry), ERASE_A, v);
    P.to(right ? xa : xb, ay(ry), ERASE_A, v);
    right = !right;
  }
}
/**
 * 2. Smooth relative x in [xL (slanted if `slant`), xR) in tight columns on
 * pixel centres, left to right: every grain ends one pixel from the pass
 * after it, i.e. flat. Ends on the last column at the join height.
 */
function smoothCols(P, xL, xR, slant, v) {
  const cols = [];
  for (let gx = 0; gx < W; gx++) {
    const rx = gx - CX, lim = Math.min(YC, Math.sqrt(Math.max(0, RR * RR - rx * rx)));
    if (rx >= xR || lim <= YJ + 0.6) continue;
    const top = slant ? Math.max(-lim, (xL - rx) / SLANT) : rx >= xL ? -lim : lim;
    if (lim - top > 1) cols.push([gx, top, lim]);
  }
  if (!cols.length) return;
  P.to(cols[0][0], ay(Math.min(cols[0][2], Math.max(cols[0][1], YJ))), JOIN_A, 60, true);
  cols.forEach(([gx, top, bot], i) => {
    const up = i % 2 === 0;
    P.to(gx, ay(up ? bot : top), ERASE_A, v);
    P.to(gx, ay(up ? top : bot), ERASE_A, v);
  });
  const [gx, top, bot] = cols[cols.length - 1];
  P.to(gx, ay(Math.min(bot, Math.max(top, YJ))), ERASE_A, v);
}
/** Where slot k's smoothing starts when slot k - 1 is being rewritten too. */
const innerEdge = (k) => SLOT_L[k] + 2.75;
/**
 * Replace slots [from..4] with time s: one coarse pass over all of them,
 * then slot by slot: smooth, rule back along the join line, plough. The
 * ball starts and ends at the script's right end.
 */
function replaceSlots(P, s, from, vE, vW) {
  const xL = from === 0 ? -RF - 2 : SLOT_L[from] + 1.9;
  eraseCoarse(P, xL, vE * 1.4);
  for (let k = from; k < 5; k++) {
    const a = k === from ? xL : innerEdge(k), b = k === 4 ? RF + 1 : innerEdge(k + 1);
    smoothCols(P, a, b, k === from, vE);
    P.to(...joinL(k), JOIN_A, 70, true);
    writeSlot(P, s, k, vW);
  }
}

/** Lace band radius at angle th with phase ph. */
const laceR = (th, ph) => RB + AB * Math.sin(7 * th + ph);
const TH_J = Math.atan2(YJ, Math.sqrt(RB * RB - YJ * YJ));
const LACE_DRIFT = 0.5 + 0.021; // phase advance per radian of travel / ... see lace()
export const phaseOf = (m) => ((m * 4 * Math.PI * LACE_DRIFT) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
const junction = (m) => { const r = laceR(TH_J, phaseOf(m)); return [ax(r * Math.cos(TH_J)), ay(r * Math.sin(TH_J))]; };

/** Two laps of lace from the junction of minute m to the junction of m+1 (or a part of them from th0). */
function lace(P, m, v, th0 = TH_J, a = 0.75) {
  const ph0 = phaseOf(m), xy = [];
  const end = TH_J + 4 * Math.PI;
  for (let th = th0; ; th += 0.01) {
    const t = Math.min(th, end), s = t - TH_J;
    const r = laceR(t, ph0 + LACE_DRIFT * s);
    xy.push(ax(r * Math.cos(t)), ay(r * Math.sin(t)));
    if (t >= end) break;
  }
  P.line(xy, a, v);
}

/**
 * The caps: arcs back and forth from the rim inward, top (sgn -1) or bottom
 * (+1), ending at the lane edge on the right. Every hour has its own ripple:
 * the arcs wobble with a different number of lobes and phase, so the hour's
 * re-rake visibly turns the whole field into a new pattern.
 */
const RIPPLES = [0, 5, 3, 7, 4, 9, 6, 8];
export const rippleOf = (hi) => {
  const n = RIPPLES[((hi % 8) + 8) % 8];
  return { n, amp: n ? 1.15 : 0, ph: n ? (hi * 2.39996) % (2 * Math.PI) : 0 };
};
function cap(P, sgn, v, hi) {
  const A = 0.38, { n, amp, ph } = rippleOf(hi);
  let i = 0;
  for (let r = RF - 0.8 - amp; r > YL + 1.0; r -= 3.4, i++) {
    const run = [];
    let best = [];
    for (let k = 0; k <= 400; k++) {
      const t = sgn * Math.PI * k / 400;       // 0 (right) .. +-pi (left)
      const rr = r + amp * Math.sin(n * t + ph) * Math.min(1, (r - YL) / 4);
      const x = rr * Math.cos(t), y = rr * Math.sin(t);
      if (y * sgn >= YL && rr < RF - 0.2) run.push(ax(x), ay(y));
      else { if (run.length > best.length) best = run.slice(); run.length = 0; }
    }
    if (run.length > best.length) best = run.slice();
    if (best.length < 4) continue;
    if (i % 2 === 1) {   // right to left on even arcs, left to right on odd
      const rev = [];
      for (let q = best.length - 2; q >= 0; q -= 2) rev.push(best[q], best[q + 1]);
      best = rev;
    }
    P.to(best[0], best[1], A, v);
    P.line(best.slice(2), A, v);
  }
  // out along the lane edge to the rim, on the right
  P.to(ax(Math.sqrt(RF * RF - YL * YL) - 0.3), ay(sgn * YL), A, v);
}

/** Travel along the band circle from the current angle to th1 (radians, either direction). */
function bandTo(P, th1, v, a = 0.75, r = RB) {
  const th0 = Math.atan2(P.y - CY, P.x - CX);
  let d = th1 - th0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const xy = [], n = Math.ceil(Math.abs(d) * r / 0.4);
  for (let k = 1; k <= n; k++) { const t = th0 + d * k / n; xy.push(ax(r * Math.cos(t)), ay(r * Math.sin(t))); }
  P.line(xy, a, v);
}

/** First slot that differs between time strings a (old) and b (new). */
function firstChange(a, b) {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return i < 2 ? i : i + 1;
  return 5;
}

/**
 * The ball's whole path for minute m: samples { x, y, a, t } (typed arrays),
 * t in seconds into the minute, ending exactly at 60 at the next junction.
 */
export function minutePath(m) {
  const now = timeStr(m), prev = timeStr(m - 1), hour = now.slice(2) === '00';
  const P = new Path().at(...junction(m));
  const from = firstChange(prev, now);
  const nSlots = 5 - from;
  P.line(textEnd(), JOIN_A, 30, true);                             // in along the stem
  replaceSlots(P, now, from, 280 + 30 * nSlots * nSlots, 80 + 24 * nSlots); // smooth the old digits away, plough the new
  P.to(...junction(m), JOIN_A, 30, true);                          // out along the stem
  if (hour) {
    // the hour: re-rake the whole table around the script
    const thTop = -Math.asin(YL / (RF - 0.6));
    const hi = Math.floor(m / 60);
    bandTo(P, thTop, 160);
    cap(P, -1, 170, hi);
    bandTo(P, -thTop, 160);
    cap(P, +1, 170, hi);
    P.to(...junction(m - 1).map((v, i) => v), 0.75, 160);
    lace(P, m - 1, 260);                                    // two fast laps re-lay the band
  }
  const lacePieceStart = P.pieces.length;
  lace(P, m, 1);                                            // the slow lace for the rest of the minute
  return resample(P.pieces, lacePieceStart);
}

/** Resample pieces at ds, time them, stretch the final lace so the minute ends at 60 s. */
function resample(pieces, laceStart) {
  const DS = 0.3;
  const X = [], Y = [], A = [], V = [], isLace = [], C = [];
  let carry = 0;
  pieces.forEach((pc, pi) => {
    const xy = pc.xy;
    for (let k = 0; k + 3 < xy.length; k += 2) {
      const x0 = xy[k], y0 = xy[k + 1], x1 = xy[k + 2], y1 = xy[k + 3];
      const L = Math.hypot(x1 - x0, y1 - y0);
      let s = carry;
      while (s < L) {
        const f = s / L;
        X.push(x0 + (x1 - x0) * f); Y.push(y0 + (y1 - y0) * f); A.push(pc.a); V.push(pc.v); isLace.push(pi >= laceStart); C.push(pc.carve ? 1 : 0);
        s += DS;
      }
      carry = s - L;
    }
  });
  const last = pieces[pieces.length - 1].xy;
  X.push(last[last.length - 2]); Y.push(last[last.length - 1]); A.push(pieces[pieces.length - 1].a); V.push(1); isLace.push(true); C.push(0);
  const n = X.length;
  // smooth the pace (1/v) so the ball accelerates instead of jumping speed
  const pace = new Float64Array(n);
  for (let i = 0; i < n; i++) pace[i] = isLace[i] ? 0 : DS / V[i];
  const sm = new Float64Array(n), K = 6;
  let acc = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { acc += pace[i]; pre[i + 1] = acc; }
  for (let i = 0; i < n; i++) {
    if (isLace[i]) { sm[i] = 0; continue; }
    const a = Math.max(0, i - K), b = Math.min(n, i + K + 1);
    sm[i] = (pre[b] - pre[a]) / (b - a);
  }
  const T = new Float64Array(n);
  let t = 0, firstLace = -1;
  for (let i = 0; i < n; i++) { T[i] = t; if (isLace[i] && firstLace < 0) firstLace = i; t += sm[i]; }
  const tA = T[firstLace];
  const nl = n - 1 - firstLace;
  // the lace: constant speed, filling the rest of the minute
  for (let i = firstLace; i < n; i++) {
    const u = (i - firstLace) / nl;
    T[i] = tA + (60 - tA) * u;
  }
  return {
    n, x: Float32Array.from(X), y: Float32Array.from(Y), a: Float32Array.from(A), t: Float32Array.from(T), c: Uint8Array.from(C),
    tA,
  };
}

// ----------------------------------------------------------------- visits
/**
 * Stamp a path into visits: { pix, t0, t1, tm, dm, a } typed arrays, in
 * order of t0. Each pixel's runs of samples within R are one visit.
 */
export function visitsOf(path) {
  const n = path.n, last = new Int32Array(N).fill(-2), cur = new Int32Array(N);
  let cap = 16384, k = 0;
  let pix = new Int32Array(cap), t0 = new Float32Array(cap), t1 = new Float32Array(cap), tm = new Float32Array(cap), dm = new Float32Array(cap), av = new Float32Array(cap);
  const grow = () => {
    cap *= 2;
    const g = (A, T) => { const B = new T(cap); B.set(A); return B; };
    pix = g(pix, Int32Array); t0 = g(t0, Float32Array); t1 = g(t1, Float32Array); tm = g(tm, Float32Array); dm = g(dm, Float32Array); av = g(av, Float32Array);
  };
  const R2 = R * R;
  for (let j = 0; j < n; j++) {
    const x = path.x[j], y = path.y[j], t = path.t[j], a = path.c[j] ? -path.a[j] : path.a[j];
    const xa = Math.max(0, Math.ceil(x - R)), xb = Math.min(W - 1, Math.floor(x + R));
    const ya = Math.max(0, Math.ceil(y - R)), yb = Math.min(W - 1, Math.floor(y + R));
    for (let py = ya; py <= yb; py++) {
      const dy = py - y;
      for (let px = xa; px <= xb; px++) {
        const dx = px - x, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const p = py * W + px, d = Math.sqrt(d2);
        if (last[p] === j - 1) {
          const v = cur[p];
          if (d < dm[v]) { dm[v] = d; tm[v] = t; av[v] = a; }
          t1[v] = t;
        } else {
          if (k === cap) grow();
          pix[k] = p; t0[k] = t; t1[k] = t; tm[k] = t; dm[k] = d; av[k] = a; cur[p] = k; k++;
        }
        last[p] = j;
      }
    }
  }
  return { k, pix, t0, t1, tm, dm, a: av };
}

/** Apply every visit (the whole minute) to field h in place. */
export function applyAll(h, V) {
  for (let v = 0; v < V.k; v++) write(h, V.pix[v], V.a[v], V.dm[v]);
}
/**
 * One visit's mark. a > 0: the ball overwrites (latest writer). a < 0: it
 * carves script: troughs only deepen and ridges never fill a trough, so a
 * figure's strokes, retraces and joins combine instead of erasing each other.
 */
function write(h, p, a, d) {
  if (a >= 0) { h[p] = a * prof(d); return; }
  const v = -a * prof(d), o = h[p];
  if (v < 0) { if (v < o) h[p] = v; }
  else if (o > -0.12 && v > o) h[p] = v;
}

/** Ball position at time t (seconds into the minute). */
export function ballAt(path, t) {
  const T = path.t;
  let lo = 0, hi = path.n - 1;
  if (t <= T[0]) return [path.x[0], path.y[0], 0];
  if (t >= T[hi]) return [path.x[hi], path.y[hi], hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
  const f = (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo]);
  return [path.x[lo] + (path.x[hi] - path.x[lo]) * f, path.y[lo] + (path.y[hi] - path.y[lo]) * f, lo];
}

/** Field at time t into minute: start state + visits so far (in-progress ones by the ball's current distance). */
export function fieldAt(h, start, V, path, t) {
  h.set(start);
  const [bx, by] = ballAt(path, t);
  for (let v = 0; v < V.k; v++) {
    if (V.t0[v] > t) break;
    const p = V.pix[v];
    if (V.t1[v] <= t || V.tm[v] <= t) write(h, p, V.a[v], V.dm[v]);
    else {
      const px = p % W, py = (p / W) | 0;
      const d = Math.hypot(px - bx, py - by);
      if (d < R) write(h, p, V.a[v], d);
    }
  }
}

// ------------------------------------------------------------------ cache
const minutes = new Map(); // m -> { path, V, start }
const MAX = 150;
function remember(m, e) {
  minutes.set(m, e);
  if (minutes.size > MAX) minutes.delete(minutes.keys().next().value);
}
function pathOf(m) {
  const e = minutes.get(m);
  if (e?.path) return e;
  const path = minutePath(m);
  const ne = { path, V: visitsOf(path), start: e?.start ?? null };
  remember(m, ne);
  return ne;
}

/** A plausible table for the start of hour minute m0 - 60 (used only as a seed before a full hour of replay). */
function seed(mHour) {
  const h = new Float32Array(N);
  const P = new Path().at(...textEnd());
  const s = timeStr(mHour - 1);
  replaceSlots(P, s, 0, 300, 100);
  P.to(...junction(mHour - 1), JOIN_A, 30, true);
  const thTop = -Math.asin(YL / (RF - 0.6));
  const hi = Math.floor((mHour - 1) / 60);
  bandTo(P, thTop, 160); cap(P, -1, 170, hi); bandTo(P, -thTop, 160); cap(P, +1, 170, hi);
  P.to(...junction(mHour - 1), 0.75, 160);
  lace(P, mHour - 1, 100);
  const path = resample(P.pieces, P.pieces.length - 1);
  applyAll(h, visitsOf(path));
  return h;
}

/** The field at the start of minute m. */
export function startState(m) {
  const e = minutes.get(m);
  if (e?.start) return e.start;
  // walk back to a cached start, or to the start of the previous hour
  const d = new Date(m * 60000), mi = d.getMinutes();
  const hourStart = m - mi;
  let k = m - 1, base = null;
  for (; k >= hourStart - 60; k--) {
    const c = minutes.get(k);
    if (c?.start) { base = c.start; break; }
  }
  let h;
  if (!base) { k = hourStart - 60; h = seed(k); }
  else h = base.slice();
  for (; k < m; k++) {
    const pe = pathOf(k);
    if (!pe.start) pe.start = h.slice();
    applyAll(h, pe.V);
  }
  const me = pathOf(m);
  me.start = h;
  return h;
}

export function minuteData(m) {
  const start = startState(m);
  const e = pathOf(m);
  return { start, path: e.path, V: e.V };
}
