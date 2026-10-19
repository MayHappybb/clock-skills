// Bead Maze: the waiting-room toy, in 3D, telling the time.
//
// Every numeral is ONE bent wire standing on a wooden base, beads threaded
// on it. The minutes stand in front, big; the hour stands at the back,
// smaller, inside the loop-the-loop of the toy's big roller-coaster track,
// which arches over the minutes and drops to the base at the right, where
// its beads sit stacked on the upright.
//
// The beads are real 1-D physics on the wire: gravity along the wire's
// tangent, static friction, damping, bead-on-bead collisions with a small
// restitution (they bunch and clack). Every bead rests at the bottom of its
// numeral, the lowest point of every wire is where its stem enters the base.
// An unseen child's finger pushes a group of beads up some wire every ten
// seconds or so, and they slide back.
//
// Each wire is stored as two arms leaving the stem, as turning angles. The
// minute: the old wire springs open (its curvature relaxes, it bulges out
// of its plane), bends itself through the angles of the new numeral, and
// wobbles to rest, the stem sliding along its slot; the beads ride the wire
// the whole time and slide to its new low point.
// The hour: the track's beads are launched: they race over the arch, round
// the loop-the-loop round the hour, to the far end and back again, while the
// whole toy is jolted and every bead on every numeral jumps.
//
// frame() is a pure function of the time: the beads are simulated from the
// start of the current minute (fixed step, one-second snapshots cached),
// from a canonical rest state, and eased back to it in the last seconds.
import { clamp, clockFields, previousMinute, orbit, noise, dither } from '../js/kit.js';

const TAU = Math.PI * 2;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------------ digits
// Centre-lines in a 20 x 34 box, y down. 'c' marks a sharp bend.
const SPEC = {
  0: [[10, 0], [4, 2.5], [1, 10], [1, 24], [4, 31.5], [10, 34], [16, 31.5], [19, 24], [19, 10], [16, 2.5], [10, 0]],
  1: [[3.6, 8.6], [8, 5], [11.6, 0, 'c'], [11.6, 12], [11.6, 24], [11.6, 34, 'c'], [4.2, 34, 'c'], [12, 34], [19, 34]],
  2: [[1.8, 8.5], [4.5, 2.2], [10, 0], [15.8, 2], [18.6, 7.5], [17.2, 13.5], [12.5, 19.5], [1.5, 34, 'c'], [10, 34], [19.2, 34]],
  3: [[1.4, 6.2], [5, 1.4], [10.5, 0], [16, 1.6], [18.4, 6.8], [16.6, 12.6], [11, 16.4], [6.8, 16.6, 'c'], [12, 17], [17.6, 20.6], [19.2, 26.6], [16.2, 32], [10, 34], [4.6, 32.6], [1, 28.2]],
  4: [[19.4, 23.6], [10, 23.6], [1, 23.6, 'c'], [13.8, 0, 'c'], [13.8, 12], [13.8, 34]],
  5: [[18.6, 0.6], [10, 0.6], [2.8, 0.6, 'c'], [2.4, 15.6, 'c'], [8, 13.4], [14.2, 14.2], [18.6, 19.4], [19.2, 26.4], [16.2, 32], [10, 34], [4.4, 32.6], [1, 28.6]],
  6: [[16.8, 3.2], [11, 0], [5, 2], [1.6, 9], [1, 17], [1.5, 26], [4.6, 32], [10, 34], [15.6, 32], [19, 26], [18, 19.6], [13, 16], [7, 16.6], [2.8, 19.8], [1.2, 23.4]],
  7: [[1, 6.2], [1, 0.6, 'c'], [10, 0.6], [19.2, 0.6, 'c'], [14.4, 12], [11, 23], [9.6, 34]],
  8: [[10, 16.6], [4.6, 19.6], [1, 25.6], [3.6, 32], [10, 34], [16.4, 32], [19, 25.6], [15.4, 19.6], [10, 16.6], [5, 13.6], [2.2, 8], [4.6, 2], [10, 0], [15.4, 2], [17.8, 8], [15, 13.6], [10, 16.6]],
  9: [[3.2, 30.4], [5.6, 33], [10, 34], [15.6, 32], [18.6, 25], [19, 17], [18.6, 9], [15.6, 2], [10, 0], [4.4, 2], [1.2, 8.6], [2, 14.6], [6, 18], [12, 18.4], [16.8, 15], [18.8, 11]],
};
const M = 30;   // segments per arm

// Catmull-Rom through runs of points, sharp at 'c' points; ~0.25-unit steps.
function densify(pts) {
  const out = [];
  let run = [pts[0]];
  const flush = () => {
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[Math.max(0, i - 1)], p1 = run[i], p2 = run[i + 1], p3 = run[Math.min(run.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
  };
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i]);
    if (pts[i][2] === 'c') { flush(); run = [pts[i]]; }
  }
  flush();
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}

// Resample a polyline (from the attach point outward) into M equal segments; angles unwrapped.
function arm(Q) {
  let L = 0;
  const cum = [0];
  for (let i = 1; i < Q.length; i++) { L += Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]); cum.push(L); }
  const th = new Float64Array(M);
  if (L < 0.5) return { L: 0, th, zero: true };
  const at = (s) => {
    let j = 1; while (j < Q.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    return [lerp(Q[j - 1][0], Q[j][0], u), lerp(Q[j - 1][1], Q[j][1], u)];
  };
  let prev = null;
  for (let i = 0; i < M; i++) {
    const a = at(L * i / M), b = at(L * (i + 1) / M);
    let t = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (prev !== null) { while (t - prev > Math.PI) t -= TAU; while (t - prev < -Math.PI) t += TAU; }
    th[i] = t; prev = t;
  }
  return { L, th };
}

// Each numeral as two arms leaving its attach point: the bottom (minutes,
// on a stem from the base) or the top (hours, hung from the track).
function build(d, top) {
  const Q = densify(SPEC[d]);
  let yx = top ? 1e9 : -1;
  for (const p of Q) yx = top ? Math.min(yx, p[1]) : Math.max(yx, p[1]);
  let ai = 0, best = 1e9;
  Q.forEach((p, i) => { if (Math.abs(p[1] - yx) < 0.15) { const c = Math.abs(p[0] - 10); if (c < best) { best = c; ai = i; } } });
  const F = arm(Q.slice(ai)), B = arm(Q.slice(0, ai + 1).reverse());
  if (F.zero) F.th.fill(B.th[0] + Math.PI);
  if (B.zero) B.th.fill(F.th[0] + Math.PI);
  // a free end gets a knob unless it runs back into the wire (0, 8, the 6's and 9's bowls)
  const free = (k) => {
    const e = Q[k];
    for (let i = 0; i < Q.length; i++) if (Math.abs(i - k) > 24 && Math.hypot(Q[i][0] - e[0], Q[i][1] - e[1]) < 2.6) return false;
    return true;
  };
  return { ax: Q[ai][0], ay: Q[ai][1], F, B, knobF: !F.zero && free(Q.length - 1), knobB: !B.zero && free(0) };
}
const DIGS = [[], []];
for (let d = 0; d < 10; d++) { DIGS[0].push(build(d, false)); DIGS[1].push(build(d, true)); }

// Align B's arm angles to A's by whole turns.
function turnsTo(a, b) { return TAU * Math.round((a - b) / TAU); }

// ------------------------------------------------------------------ wire state
// A wire at a moment: digits A -> B, blend e, opening o (curvature relaxed), bulge z.
function wireAt(dA, dB, e, o, top = 0) {
  const A = DIGS[top][dA], B = DIGS[top][dB];
  const kF = turnsTo(A.F.th[0], B.F.th[0]), kB = turnsTo(A.B.th[0], B.B.th[0]);
  return { A, B, e, o, kF, kB, LF: lerp(A.F.L, B.F.L, e), LB: lerp(A.B.L, B.B.L, e), ax: lerp(A.ax, B.ax, e), ay: lerp(A.ay, B.ay, e) };
}
function armAngle(w, fwd, i) {
  const a = fwd ? w.A.F.th : w.A.B.th, b = fwd ? w.B.F.th : w.B.B.th, k = fwd ? w.kF : w.kB;
  const t0 = lerp(a[0], b[0] + k, w.e), t = lerp(a[i], b[i] + k, w.e);
  return t0 + (t - t0) * (1 - w.o);
}
// dy/ds along increasing s (s > 0 on the forward arm, s < 0 on the backward arm)
function slope(w, s) {
  if (s >= 0) {
    const L = w.LF; if (L <= 0) return 0;
    const f = clamp(s / L * M - 0.5, 0, M - 1), i = Math.floor(f), j = Math.min(M - 1, i + 1);
    return Math.sin(lerp(armAngle(w, 1, i), armAngle(w, 1, j), f - i));
  }
  const L = w.LB; if (L <= 0) return 0;
  const f = clamp(-s / L * M - 0.5, 0, M - 1), i = Math.floor(f), j = Math.min(M - 1, i + 1);
  return -Math.sin(lerp(armAngle(w, 0, i), armAngle(w, 0, j), f - i));
}
// points of both arms in local units: PF[0..M], PBk[0..M] (index 0 = attach)
const PF = new Float64Array((M + 1) * 2), PBK = new Float64Array((M + 1) * 2);
function wirePoints(w) {
  for (const fwd of [1, 0]) {
    const P = fwd ? PF : PBK, L = (fwd ? w.LF : w.LB) / M;
    let x = w.ax, y = w.ay; P[0] = x; P[1] = y;
    for (let i = 0; i < M; i++) { const t = armAngle(w, fwd, i); x += L * Math.cos(t); y += L * Math.sin(t); P[i * 2 + 2] = x; P[i * 2 + 3] = y; }
  }
}
function pointAt(w, s) {
  const fwd = s >= 0, P = fwd ? PF : PBK, L = fwd ? w.LF : w.LB;
  if (L <= 0) return [w.ax, w.ay, 0];
  const f = clamp(Math.abs(s) / L * M, 0, M), i = Math.min(M - 1, Math.floor(f)), u = f - i;
  return [lerp(P[i * 2], P[i * 2 + 2], u), lerp(P[i * 2 + 1], P[i * 2 + 3], u), Math.abs(s) / Math.max(1, w.LF + w.LB)];
}

// ------------------------------------------------------------------ the track
const TRACK = (() => {
  // left foot, a loop-the-loop (entered heading right, round anticlockwise,
  // crossing itself in depth), the climb, the arch the hour hangs from, the
  // right upright where the beads wait
  const P = [[10.5, 57, 34], [10.5, 53.5, 34]];
  const x0 = 10.5, cy = 35.6, r = 13.4, bx = 1.9;
  for (let i = 1; i < 40; i++) {
    const p = i / 40 * TAU;
    P.push([x0 + bx * p + r * Math.sin(p), cy + r * Math.cos(p), 34 - 8 * i / 40]);
  }
  const xe = x0 + bx * TAU;
  P.push([xe + 4, 48.6, 26], [xe + 8.4, 44.6, 26.4], [33.6, 30, 27.4], [36, 14, 28.6], [41.6, 5.6, 29.5], [54, 2.0, 30], [76, 1.0, 30], [96, 2.0, 30], [111, 5.6, 30], [118.6, 14, 30], [121.6, 28, 30], [122.6, 44, 30], [122.8, 57, 30]);
  // densify with Catmull-Rom (no sharp bends on a coaster), then arc-length table
  const Q = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.6));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      Q.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  Q.push(P[P.length - 1]);
  const cum = [0];
  for (let i = 1; i < Q.length; i++) cum.push(cum[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1], Q[i][2] - Q[i - 1][2]));
  // uniform table, 1 unit apart
  const L = cum[cum.length - 1], n = Math.ceil(L), X = new Float64Array(n + 1), Y = new Float64Array(n + 1), Z = new Float64Array(n + 1);
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(L, i * L / n);
    while (j < Q.length - 1 && cum[j] < s) j++;
    const u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    X[i] = lerp(Q[j - 1][0], Q[j][0], u); Y[i] = lerp(Q[j - 1][1], Q[j][1], u); Z[i] = lerp(Q[j - 1][2], Q[j][2], u);
  }
  return { L, n, ds: L / n, X, Y, Z };
})();
function trackAt(s) {
  const f = clamp(s / TRACK.ds, 0, TRACK.n), i = Math.min(TRACK.n - 1, Math.floor(f)), u = f - i;
  return [lerp(TRACK.X[i], TRACK.X[i + 1], u), lerp(TRACK.Y[i], TRACK.Y[i + 1], u), lerp(TRACK.Z[i], TRACK.Z[i + 1], u)];
}
// the arch's height above a world x (for the hour's hangers)
function trackYAt(x) {
  let best = 1e9, y = 0;
  for (let i = Math.floor(TRACK.n * 0.6); i <= TRACK.n; i++) if (TRACK.Y[i] < 20) { const d = Math.abs(TRACK.X[i] - x); if (d < best) { best = d; y = TRACK.Y[i]; } }
  return y;
}
function trackSlope(s) {
  const f = clamp(s / TRACK.ds, 0, TRACK.n - 1e-6), i = Math.floor(f);
  return (TRACK.Y[i + 1] - TRACK.Y[i]) / TRACK.ds;
}

// ------------------------------------------------------------------ physics
const RB = 3.3;          // bead radius on a numeral (local units)
const RO = [7.3, 7.3, 6.4, 6.4];   // per numeral: the hour's beads are bigger in its own units
const RT = 3.6;          // bead radius on the track
const NB = [2, 2, 2, 2, 5];   // beads per object: hour tens, hour units, minute tens, minute units, track
const G = 240, DAMP = 1.2, MU = 0.16, REST = 0.3;
const DT = 1 / 100;

// object o's range and slope at time tau of the minute, given the plan
function objLimits(o, w) {
  if (o === 4) return [RT, TRACK.L - RT];
  const A = w.A, B = w.B, e = w.e;
  const lo = -w.LB + RO[o] + (lerp(+A.knobB, +B.knobB, e) * 1.0);
  const hi = w.LF - RO[o] - (lerp(+A.knobF, +B.knobF, e) * 1.0);
  return [lo, hi];
}

function stepBeads(S, V, n, lo, hi, r, slopeFn, drag, kin) {
  for (let i = 0; i < n; i++) {
    if (kin && kin.i === i) continue;
    const a = G * slopeFn(S[i]);
    if (Math.abs(V[i]) < 2 && Math.abs(a) < MU * G) { V[i] = 0; continue; }
    V[i] += (a - Math.sign(V[i] || a) * MU * G * 0.5 - drag * V[i]) * DT;
    S[i] += V[i] * DT;
  }
  if (kin) { S[kin.i] += kin.v * DT; V[kin.i] = kin.v; }
  // collisions: velocities, then positions
  for (let i = 0; i < n - 1; i++) {
    if (S[i + 1] - S[i] < 2 * r + 0.05 && V[i] > V[i + 1]) {
      const vm = (V[i] + V[i + 1]) / 2, dv = (V[i] - V[i + 1]) / 2 * REST;
      if (kin && kin.i === i) V[i + 1] = Math.max(V[i + 1], V[i]);
      else if (kin && kin.i === i + 1) V[i] = Math.min(V[i], V[i + 1]);
      else { V[i] = vm - dv; V[i + 1] = vm + dv; }
    }
  }
  if (S[0] < lo) { S[0] = lo; if (V[0] < 0) V[0] = -V[0] * REST; }
  if (S[n - 1] > hi) { S[n - 1] = hi; if (V[n - 1] > 0) V[n - 1] = -V[n - 1] * REST; }
  for (let i = 1; i < n; i++) if (S[i] < S[i - 1] + 2 * r) S[i] = S[i - 1] + 2 * r;
  if (S[n - 1] > hi) S[n - 1] = hi;
  for (let i = n - 2; i >= 0; i--) if (S[i] > S[i + 1] - 2 * r) S[i] = S[i + 1] - 2 * r;
}

// Canonical rest: beads bunched round the lowest point (the stem), settled.
const CANON = new Map();
function canon(o, d) {
  const key = o === 4 ? 't' : (o < 2 ? 'h' : 'm') + d;
  if (CANON.has(key)) return CANON.get(key);
  const n = NB[o], S = new Float64Array(n), V = new Float64Array(n);
  let w = null, lo, hi, r, sl;
  if (o === 4) { [lo, hi] = objLimits(4); r = RT; sl = trackSlope; for (let i = 0; i < n; i++) S[i] = hi - (n - 1 - i) * 2 * r; }
  else {
    w = wireAt(d, d, 1, 0, o < 2 ? 1 : 0); [lo, hi] = objLimits(o, w); r = RO[o]; sl = (s) => slope(w, s);
    for (let i = 0; i < n; i++) S[i] = clamp((i - (n - 1) / 2) * 2 * r, lo, hi);
  }
  for (let k = 0; k < 800; k++) stepBeads(S, V, n, lo, hi, r, sl, 3);
  CANON.set(key, S);
  return S;
}

// settle every numeral once, at load
for (let d = 0; d < 10; d++) { canon(0, d); canon(2, d); }
canon(4, 0);

// The plan of a minute: what changes, the pushes.
const TURN = 2.6;
function morph(tau) {
  // o: how far the wire has sprung open (its bends relaxed), peaking while
  // the angles of the old numeral are swapped for the new one (e), so no
  // in-between shape is ever bent tight enough to read as a digit; then it
  // bends home past its shape and wobbles in
  const e = smooth((tau - 0.3) / 0.75);
  let o;
  if (tau < 0.35) o = 0.5 * smooth(tau / 0.35);
  else if (tau < 0.95) o = 0.5;
  else o = 0.5 * Math.cos(Math.PI / 2 * clamp((tau - 0.95) / 0.4, 0, 1)) ** 2;
  if (tau > 1.35) o -= 0.12 * Math.exp(-(tau - 1.35) * 3.4) * Math.sin((tau - 1.35) * 16);
  return { e, o: tau >= TURN ? 0 : o };
}
function plan(f, prev, key) {
  const dn = [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];
  const dw = [Math.floor(prev.h / 10), prev.h % 10, Math.floor(prev.m / 10), prev.m % 10];
  const hour = f.m === 0;
  const pushes = [];
  let t = 8 + 3 * noise(key, 1);
  for (let k = 0; k < 4; k++) {
    const o = Math.floor(noise(key + k * 7.1, 2) * 5);
    const n = NB[o], dir = noise(key + k, 3) < 0.5 ? -1 : 1;
    pushes.push({ t, o, i: dir > 0 ? 0 : n - 1, i2: Math.floor(noise(key + k, 4) * 2), dir, d: 0.45 + 0.25 * noise(key + k, 5), v: (o === 4 ? 48 : 30) * (0.8 + 0.4 * noise(key + k, 6)) });
    t += 9 + 4 * noise(key + k, 8);
  }
  return { dn, dw, hour, pushes: pushes.filter((q) => q.t < 55) };
}

// The hour train. Its timing comes from a coaster's energy: speed grows with
// the drop below the arch's crest, so the beads crawl over the top, scream
// through the loop and the dips; T[i] is the time to reach track unit i.
const COAST = (() => {
  let ymin = 1e9;
  for (let i = 0; i <= TRACK.n; i++) ymin = Math.min(ymin, TRACK.Y[i]);
  const T = new Float64Array(TRACK.n + 1);
  for (let i = 1; i <= TRACK.n; i++) {
    const y = (TRACK.Y[i] + TRACK.Y[i - 1]) / 2;
    T[i] = T[i - 1] + TRACK.ds / Math.sqrt(y - ymin + 5);
  }
  return T;
})();
function coastT(s) { const f = clamp(s / TRACK.ds, 0, TRACK.n), i = Math.min(TRACK.n - 1, Math.floor(f)); return lerp(COAST[i], COAST[i + 1], f - i); }
function coastS(t) {
  let lo = 0, hi = TRACK.n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (COAST[m] < t) lo = m; else hi = m; }
  return (lo + clamp((t - COAST[lo]) / ((COAST[hi] - COAST[lo]) || 1), 0, 1)) * TRACK.ds;
}
const TR0 = 0.3, TR1 = 3.2, TR2 = 3.55, TR3 = 6.6, LAG = 0.07;
// a launch from rest, full coaster speed, a bump into the far stop
const launch = (u) => { u = clamp(u, 0, 1); const a = 0.2, c = 1 / (1 - a / 2); return u < a ? c * u * u / (2 * a) : c * (u - a / 2); };
function trainAt(tau, out) {
  const n = NB[4], hi = TRACK.L - RT, lo = RT;
  if (tau < TR0 - 0.01 || tau > TR3 + n * LAG + 0.4) return false;
  for (let i = 0; i < n; i++) {
    const R = hi - (n - 1 - i) * 2 * RT, E = lo + i * 2 * RT;
    let s;
    const tOut = tau - TR0 - i * LAG, tBack = tau - TR2 - (n - 1 - i) * LAG;
    if (tBack > 0) s = coastS(lerp(coastT(E), coastT(R), launch(tBack / (TR3 - TR2))));
    else s = coastS(lerp(coastT(R), coastT(E), launch(Math.max(0, tOut) / (TR1 - TR0))));
    out[i] = s;
  }
  // beads cannot pass through each other
  if (tau > TR2) { for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - 2 * RT); }
  else { for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + 2 * RT); }
  for (let i = 0; i < n; i++) out[i] = clamp(out[i], lo + i * 2 * RT, hi - (n - 1 - i) * 2 * RT);
  return true;
}

// Episodes. Between events every numeral (and the track) sits exactly at
// its closed-form rest, canon(). Something moves only in a short episode:
// the turn of a changing numeral, the hour jolt, a push. Each episode is
// simulated from rest at its start and blended back to rest at its end, so a
// frame at any time costs at most one episode's worth of steps of one object,
// and successive frames only step forward from where the last one stopped.
const EP_TURN = 3.4, EP_JOLT = 3.0, EP_PUSH = 3.2, BLEND = 0.7;
let PLAN = null;
function planFor(f, prev) {
  if (PLAN && PLAN.key === f.minuteKey) return PLAN;
  const P = plan(f, prev, f.minuteKey);
  P.key = f.minuteKey;
  P.eps = [0, 1, 2, 3, 4].map((o) => {
    const L = [];
    const turn = o < 4 && P.dn[o] !== P.dw[o];
    if (turn || (P.hour && o < 4)) L.push([0, turn ? EP_TURN : EP_JOLT]);
    for (const q of P.pushes) if (q.o === o) L.push([q.t, Math.min(59.9, q.t + EP_PUSH)]);
    L.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const e of L) { const last = out[out.length - 1]; if (last && e[0] <= last[1]) last[1] = Math.max(last[1], e[1]); else out.push(e.slice()); }
    return out;
  });
  PLAN = P;
  return P;
}
function wireFor(P, o, tau) {
  const top = o < 2 ? 1 : 0;
  if (P.dn[o] === P.dw[o] || tau >= TURN) return REST_W[top][P.dn[o]];
  const { e, o: op } = morph(tau);
  return wireAt(P.dw[o], P.dn[o], e, op, top);
}
const REST_W = [0, 1].map((top) => [...Array(10).keys()].map((d) => wireAt(d, d, 1, 0, top)));

// one step of object o at time tau (step index j into an episode starting at t0)
function stepObj(P, o, tau, j, t0, S, V) {
  const n = NB[o];
  let kin = null;
  for (const q of P.pushes) if (q.o === o && tau >= q.t && tau < q.t + q.d) kin = { i: q.i, v: q.dir * q.v * Math.sin(Math.PI * (tau - q.t) / q.d) * 1.57 };
  if (P.hour && o < 4 && t0 === 0 && j === 15) for (let i = 0; i < n; i++) V[i] += (noise(P.key + i + o * 9, 11) < 0.5 ? -1 : 1) * (70 + 50 * noise(P.key + i, 12));
  if (o === 4) stepBeads(S, V, n, RT, TRACK.L - RT, RT, trackSlope, 0.4, kin);
  else {
    const w = wireFor(P, o, tau);
    const [lo, hi] = objLimits(o, w);
    stepBeads(S, V, n, lo, hi, RO[o], (x) => slope(w, x), DAMP, kin);
  }
}
const ST = [0, 1, 2, 3, 4].map((o) => ({ key: -1, ei: -1, step: 0, S: new Float64Array(NB[o]), V: new Float64Array(NB[o]) }));
const OUT = [0, 1, 2, 3, 4].map((o) => new Float64Array(NB[o]));
function objAt(P, o, tau) {
  const eps = P.eps[o], out = OUT[o], n = NB[o];
  let ei = -1;
  for (let i = 0; i < eps.length; i++) if (tau >= eps[i][0] && tau < eps[i][1]) ei = i;
  if (ei < 0) { out.set(canon(o, P.dn[o])); return; }
  const [t0, t1] = eps[ei], st = ST[o];
  const k = Math.floor((tau - t0) / DT);
  if (st.key !== P.key || st.ei !== ei || st.step > k) {
    st.key = P.key; st.ei = ei; st.step = 0;
    st.S.set(canon(o, t0 === 0 ? P.dw[o] : P.dn[o])); st.V.fill(0);
  }
  while (st.step < k) { stepObj(P, o, t0 + st.step * DT, st.step, t0, st.S, st.V); st.step++; }
  const u = (tau - t0) / DT - k, b = smooth((tau - (t1 - BLEND)) / BLEND), c = canon(o, P.dn[o]);
  for (let i = 0; i < n; i++) out[i] = lerp(st.S[i] + st.V[i] * DT * u, c[i], b);
}
function beadsAt(f, prev, tau) {
  const P = planFor(f, prev);
  for (let o = 0; o < 5; o++) objAt(P, o, tau);
  if (P.hour) trainAt(tau, OUT[4]);
  return { P };
}

// ------------------------------------------------------------------ camera, raster
let YAW = 0, OX = 0, OY = 0;
const D = 230, EX = 64, EY = 6, PZ = 18;
function project(x, y, z) {
  const dx = x - 64, dz = z - PZ, c = Math.cos(YAW), s = Math.sin(YAW);
  const xr = 64 + dx * c - dz * s, zr = PZ + dx * s + dz * c;
  const k = D / (zr + D);
  return [EX + (xr - EX) * k + OX, EY + (y - EY) * k + OY, k];
}
let BUF = null, W = 128, H = 64;
function disc(cx, cy, r, c) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r)), r2 = r * r;
  for (let y = y0; y <= y1; y++) { const dy = y + 0.5 - cy; for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) BUF[y * W + x] = c; } }
}
function segment(ax, ay, bx, by, r, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
  for (let i = 0; i <= n; i++) disc(lerp(ax, bx, i / n), lerp(ay, by, i / n), r, c);
}
// Beads are hand-drawn spheres, one sprite per size: a contour, a glint up
// left, the shadow side filled in down right. '#' lit, '.' black, ' ' clear.
const BEADS = [
  [ // 0: the track, 6 px
    ' #### ',
    '#..###',
    '#.####',
    '######',
    '#####.',
    ' ###. '],
  [ // 1: the hour, 7 px: a catchlight (a lit dot in a dark ring) up left
    ' ##### ',
    '##.####',
    '#.#.###',
    '##.####',
    '#######',
    '######.',
    ' ####. '],
  [ // 2: the minutes, 9 px, the heroes
    '  #####  ',
    ' ####### ',
    '##...####',
    '##.#.####',
    '##...####',
    '#########',
    '########.',
    ' ######. ',
    '  ###..  '],
].map((rows) => rows.map((r) => [...r]));
function bead(cx, cy, r, noMoat, spr) {
  const S = BEADS[spr ?? (r < 2.9 ? 0 : r < 3.7 ? 1 : 2)], n = S.length;
  if (!noMoat) disc(cx, cy, n / 2 + 1.05, 0);
  const x0 = Math.round(cx - n / 2), y0 = Math.round(cy - n / 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + i, y = y0 + j, c = S[j][i];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (c === '#') BUF[y * W + x] = 1;
    else if (c === '.') BUF[y * W + x] = 0;
    else if (!noMoat) BUF[y * W + x] = 0;
  }
}

// ------------------------------------------------------------------ layout
const SLOTS = [
  { x: 57.6, y: 4.2, z: 30, sc: 0.62, hang: true },   // hour tens, hung from the arch
  { x: 78.4, y: 4.2, z: 30, sc: 0.62, hang: true },   // hour units
  { x: 46.4, y: 25.2, z: 4, sc: 0.8 },              // minute tens, on stems
  { x: 80, y: 25.2, z: 4, sc: 0.8 },              // minute units
];
const BASE_Y = 56;

let LASTPTS = null;
// the wire's core again, inside a bead's moat: the wire visibly runs into the bead
function wireCore(pts, rWire, cx, cy, rr) {
  for (const arr of pts) for (let i = 0; i < M; i++) {
    const a = arr[i], b = arr[i + 1];
    if (Math.hypot(a[0] - cx, a[1] - cy) > rr + 3 && Math.hypot(b[0] - cx, b[1] - cy) > rr + 3) continue;
    segment(a[0], a[1], b[0], b[1], rWire * a[2], 1);
  }
}
// beads on a wire: a black moat round each, the wire's core drawn again
// through the moats (it shows in the gaps between touching beads), then the
// sprites on top
function drawBeads(pts, BX, rw, spr) {
  const n = BEADS[spr].length;
  for (const [x, y] of BX) disc(x, y, n / 2 + 1.2, 0);
  for (const [x, y] of BX) wireCore(pts, rw * 0.6, x, y, n / 2);
  for (const [x, y] of BX) bead(x, y, n / 2, true, spr);
}
function drawWire(slot, w, rWire, bulge) {
  wirePoints(w);
  const sc = slot.sc, tot = Math.max(1, w.LF + w.LB);
  const proj = (lx, ly, sAbs) => {
    const z = slot.z - bulge * Math.sin(Math.PI * clamp(sAbs / (tot * 0.6), 0, 1)) * 7;
    return project(slot.x + lx * sc, slot.y + ly * sc, z);
  };
  // stem: from the attach point down into the base
  const [sx, sy] = project(slot.x + w.ax * sc, slot.y + w.ay * sc, slot.z);
  const [bx, by] = project(slot.x + w.ax * sc, slot.hang ? trackYAt(slot.x + w.ax * sc) : slot.base ?? BASE_Y, slot.z);
  const pts = [];
  for (const fwd of [0, 1]) {
    const P = fwd ? PF : PBK, L = fwd ? w.LF : w.LB;
    const arr = [];
    for (let i = 0; i <= M; i++) arr.push(proj(P[i * 2], P[i * 2 + 1], L * i / M));
    pts.push(arr);
  }
  for (const pass of [0, 1]) {
    const r = pass ? rWire : rWire + 1;
    segment(sx, sy, bx, by, pass ? 0.55 : 1.4, pass);
    for (const arr of pts) for (let i = 0; i < M; i++) segment(arr[i][0], arr[i][1], arr[i + 1][0], arr[i + 1][1], r * arr[i][2], pass);
    // knobs at free ends
    for (const [fwd, has] of [[1, lerp(+w.A.knobF, +w.B.knobF, w.e) > 0.5], [0, lerp(+w.A.knobB, +w.B.knobB, w.e) > 0.5]]) {
      if (!has) continue;
      const e = pts[fwd][M];
      disc(e[0], e[1], (pass ? rWire + 0.7 : rWire + 1.7) * e[2], pass);
    }
  }
  if (slot.base === undefined && !slot.hang) grommet(slot.x + w.ax * sc, BASE_Y, slot.z);
  LASTPTS = pts;
  return proj;
}

function drawBase() {
  const c = (x, y, z) => project(x, y, z);
  const bl = c(2, BASE_Y, 40), br = c(126, BASE_Y, 40), fl = c(2, BASE_Y, 0), fr = c(126, BASE_Y, 0);
  segment(bl[0], bl[1], br[0], br[1], 0.5, 1);
  segment(fl[0], fl[1], bl[0], bl[1], 0.5, 1);
  segment(fr[0], fr[1], br[0], br[1], 0.5, 1);
  return { fl, fr, fl2: c(2, BASE_Y + 12, 0), fr2: c(126, BASE_Y + 12, 0) };
}
// a grommet where a wire enters the wood: a small dark-ringed lit ellipse
// a turned wooden block where a wire enters the base: a low dome
function grommet(x, y, z) {
  const [gx, gy, k] = project(x, y, z);
  const rx = 3.4 * k, ry = 2.2 * k;
  for (let yy = Math.floor(gy - ry); yy < gy; yy++) for (let xx = Math.floor(gx - rx); xx <= gx + rx; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const ex = (xx + 0.5 - gx) / rx, ey = (yy + 0.5 - gy) / ry;
    if (ex * ex + ey * ey < 1) BUF[yy * W + xx] = 1;
  }
}
function drawBaseFront(b) {
  const { fl, fr, fl2, fr2 } = b;
  // clear the front face, then a bright top edge and one long grain line
  const yTop = Math.min(fl[1], fr[1]);
  for (let y = Math.max(0, Math.floor(yTop)); y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - fl[0]) / (fr[0] - fl[0]);
    if (u < 0 || u > 1) continue;
    if (y + 0.5 >= lerp(fl[1], fr[1], u)) BUF[y * W + x] = 0;
  }
  segment(fl[0], fl[1], fr[0], fr[1], 0.75, 1);
  segment(fl[0], fl[1], fl2[0], fl2[1], 0.62, 1);
  segment(fr[0], fr[1], fr2[0], fr2[1], 0.62, 1);
  let px = null, py = null;
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, x = 14 + 100 * u;
    const y = BASE_Y + 4.6 + 0.9 * Math.sin(u * 6.3 + 0.4);
    const [qx, qy] = project(x, y, 0);
    if (px !== null && !(u > 0.46 && u < 0.53)) segment(px, py, qx, qy, 0.5, 1);
    px = qx; py = qy;
  }
}

// the track through a depth buffer: where the corkscrew passes in front of
// itself the nearer wire cuts a black gap in the farther one
let ZT = null;
function drawTrack() {
  if (!ZT || ZT.length !== W * H) ZT = new Float32Array(W * H);
  ZT.fill(1e9);
  let p = trackAt(0), a = project(p[0], p[1], p[2]);
  for (let s = 0.5; s <= TRACK.L + 0.25; s += 0.5) {
    p = trackAt(Math.min(s, TRACK.L));
    const b = project(p[0], p[1], p[2]);
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(lerp(a[0], b[0], k / 3)), y = Math.floor(lerp(a[1], b[1], k / 3));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = y * W + x;
      if (p[2] < ZT[o]) ZT[o] = p[2];
    }
    a = b;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = y * W + x, z = ZT[o];
    if (z > 1e8) continue;
    let cut = false;
    for (let dy = -1; dy <= 1 && !cut; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (ZT[yy * W + xx] < z - 3.5) { cut = true; break; }
    }
    if (!cut) BUF[o] = 1;
  }
}

function render(g, ctx, f, prev, tau, T) {
  BUF = g.buf; W = g.width; H = g.height;
  const sim = beadsAt(f, prev, tau);
  const P = sim.P;
  // the hour jolt shakes the whole toy
  const jolt = P.hour ? Math.exp(-Math.max(0, tau - 0.15) * 2.2) * smooth((tau - 0.1) / 0.18) : 0;
  YAW = 0.075 * Math.sin(TAU * T / 21) + 0.03 * Math.sin(TAU * T / 7.7 + 1) + jolt * 0.03 * Math.sin(tau * 31);
  // burn-in walk, eased over 2.5 s instead of stepping a pixel
  const [ox, oy] = orbit(ctx.date, 1, 4), [px, py] = orbit(new Date(ctx.date.getTime() - 2500), 1, 4);
  const ob = smooth((tau - 30) / 2.5);
  OX = lerp(px, ox, ob); OY = lerp(py, oy, ob) + jolt * 1.0 * Math.sin(tau * 40);
  const base = drawBase();
  drawTrack();
  grommet(10.5, BASE_Y, 34); grommet(122.8, BASE_Y, 30);
  for (let i = 0; i < NB[4]; i++) { const q = trackAt(OUT[4][i]); const [x, y] = project(q[0], q[1], q[2]); bead(x, y, 3, false, 0); }
  for (let o = 0; o < 4; o++) {
    const slot = SLOTS[o];
    const w = wireFor(P, o, tau);
    const changing = P.dn[o] !== P.dw[o] && tau < TURN;
    const rw = o < 2 ? 1.5 : 1.6;
    const proj = drawWire(slot, w, rw, changing ? w.o : 0);
    const BX = [];
    for (let i = 0; i < NB[o]; i++) {
      const [lx, ly] = pointAt(w, OUT[o][i]);
      BX.push(proj(lx, ly, Math.abs(OUT[o][i])));
    }
    drawBeads(LASTPTS, BX, rw, o < 2 ? 1 : 2);
  }
  drawBaseFront(base);
}

export function specimen(g, t = 0) {
  BUF = g.buf; W = g.width; H = g.height; YAW = 0; OX = 0; OY = 0;
  for (let d = 0; d < 10; d++) {
    const slot = { x: 4 + (d % 5) * 33, y: 4 + Math.floor(d / 5) * 46, z: 0, sc: 1 };
    slot.base = slot.y + 41;
    const w = wireAt(d, d, 1, 0);
    const proj = drawWire(slot, w, 1.6 / 0.8, 0);
    const c = canon(2, d);
    drawBeads(LASTPTS, [...c].map((s) => { const [lx, ly] = pointAt(w, s); return proj(lx, ly, Math.abs(s)); }), 1.6 / 0.8, 2);
  }
}

export default {
  name: 'Bead Maze',
  blurb: 'The waiting-room bead maze in 3D: every numeral is one bent wire with beads sliding on it under gravity; each minute the wire springs open and bends itself into the next numeral, and on the hour the coaster track\'s beads race round the loop that holds the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, prev = previousMinute(ctx.date);
    render(g, ctx, f, prev, f.sec, ctx.t);
    ctx.oled.contrast(0xcf + (0x20 - 0xcf) * ctx.night);
  },
};
