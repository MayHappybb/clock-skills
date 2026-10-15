// Smoke — the time written in incense smoke.
//
// An incense stick stands in the gap between the hours and the minutes and
// burns down over the hour; its plume leaves the ember as a thin laminar
// thread, starts to sway a little higher up, and fans out and curls at the
// top. The numerals are smoke held in shape: a flowing single-stroke hand of
// its own, each stroke a ribbon of strands (a core filament, two looser ones
// twisting round it, a thin haze) that swells, narrows and flows slowly
// along the stroke; now and then a wisp peels off a stroke and curls away.
//
// The air is curl noise: the velocity is the curl of a stream function made
// of plane waves at several scales, rising with the warm air, so it has no
// divergence and makes real eddies. Every loose bit of smoke is a particle
// integrated through it (RK2, 1/60 s steps on an absolute lattice), so its
// position depends only on when it was let go and the clock.
//
// The minute: the changing numeral's braid loosens and trembles
// (anticipation, from -2.4 s); from -1.45 s it comes apart top first, each
// part of the stroke lifted with its own buoyancy, so it rises in fingers
// that roll over in the eddies and thin out, with streaks along their paths
// (action); it is shapeless by :00. Then the ember's smoke is drawn off: a
// twisting ribbon rises from the stick, arcs over and comes down on the new
// numeral, laying it along its stroke, each bit landing loose and tightening
// into the braid (settle). Two changing numerals are laid 0.45 s apart.
//
// The hour: a smoke ring is blown in from the left, rolling on its core: a
// travelling pair of Lamb-Oseen vortices. As it reaches each stroke the
// smoke is drawn through the ring, wound round its cores and left curling in
// its wake; its gust puts the ember out, the stub sinks away and a fresh
// stick rises and catches with a flare. From :00.35 the new time gathers out
// of the stirred air, left to right: each bit of smoke is traced backwards
// through the eddies from where it settles, so the haze visibly condenses.
//
// Purity: frame() fully draws from black. Streams (plume, wisps) keep each
// particle's last two steps in a ring buffer and turn groups keep their
// trajectories, but only as caches keyed by particle id and turn: a cold
// call integrates everything live from its release, at most a few seconds.
//
// Burn-in: everything moves (the braid flows, the plume never stops) and
// the face walks kit.orbit; 23:00-07:00 the panel dims via ctx.night.

import { clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;
const DW = 24, DH = 38, TOP = 5;          // a digit's box, and its top on the glass
const SLOT_X = [2, 27, 77, 102];
const SLANT = 0.12;
const EPOCH = 1.7e9;                      // s; keeps the field's arguments small
const DT = 1 / 60;                        // integration step, s

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------ letterforms
//
// A flowing single-stroke hand, drawn for smoke: each digit is one or two
// centre-lines (Catmull-Rom through these points) in a DW x DH box, slanted.

const GLYPHS = {
  0: [[[17.5, 4.5], [12, 2.5], [6, 6], [3.5, 15], [4, 26], [8, 34], [13, 35.5], [18.5, 31], [20.5, 21], [19.5, 10], [15.5, 3.8], [10, 3.6]]],
  1: [[[5, 10], [9.5, 6.5], [14.5, 2.5], [13.8, 14], [13, 25], [12.2, 35.5]]],
  2: [[[4, 9], [8, 3.8], [13, 2.6], [18, 5.5], [19, 11.5], [15.5, 19], [9.5, 26], [4, 34.8], [12, 34.6], [21, 35]]],
  3: [[[4, 6.5], [10, 2.5], [17, 4], [19, 10], [15.5, 15.5], [9.5, 17.8], [16, 19.5], [20, 26], [18, 33], [11, 35.8], [3.5, 32.5]]],
  4: [[[15.5, 2.5], [9, 13.5], [3.5, 24.6], [12, 24.4], [20.5, 24.2]], [[17.4, 14], [17, 25], [16.6, 35.5]]],
  5: [[[20, 2.8], [13, 2.8], [7.5, 2.8], [6.4, 10], [5.5, 17], [11.5, 14.6], [18, 17], [20.5, 25], [18, 32.5], [11, 35.8], [4, 32]]],
  6: [[[18, 4.5], [12, 2.5], [6.5, 7], [4, 16], [4, 26], [7, 33.5], [12.5, 35.8], [18, 32.5], [19.5, 25.5], [16, 19.5], [10.5, 19], [5.5, 23.5]]],
  7: [[[3, 3.5], [12, 3], [21, 3], [15.5, 13.5], [11.5, 24.5], [9.5, 35.5]]],
  8: [[[17, 6], [12, 2.5], [6, 5], [5.5, 11], [12, 17.5], [18.5, 24], [19, 31.5], [12.5, 35.8], [5, 32], [5, 25], [12, 17.5], [18, 11.5], [17.5, 5.5], [13, 2.6]]],
};
GLYPHS[9] = [[[19, 12], [15, 17.5], [9.5, 18.5], [4.5, 14.5], [4.5, 7], [9.5, 2.6], [15.5, 3], [19.5, 8], [19.5, 18], [17, 28], [12, 35.5], [5.5, 34]]];

/** Centripetal Catmull-Rom through `pts`, sampled finely. */
function spline(pts) {
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  const tj = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < 16; k++) {
      const t = t1 + ((t2 - t1) * k) / 16;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      out.push(L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

const STEP = 0.5;   // px between samples along a stroke
const NS = 4;       // strands per stroke: a core filament, two looser ones, and a haze
/** A digit as samples along its strokes, every STEP px, with normals. */
function buildGlyph(strokes) {
  const rows = [];
  let total = 0;
  strokes.forEach((pts, si) => {
    const d = spline(pts).map(([x, y]) => [x + SLANT * (DH / 2 - y), y]);
    const cum = [0];
    for (let i = 1; i < d.length; i++) cum.push(cum[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
    const L = cum.at(-1), n = Math.max(2, Math.round(L / STEP));
    const open = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) > 0.5;
    const out = [];
    let seg = 1;
    for (let q = 0; q <= n; q++) {
      const s = (L * q) / n;
      while (seg < cum.length - 1 && cum[seg] < s) seg++;
      const u = (s - cum[seg - 1]) / (cum[seg] - cum[seg - 1] || 1);
      out.push([lerp(d[seg - 1][0], d[seg][0], u), lerp(d[seg - 1][1], d[seg][1], u), s]);
    }
    rows.push({ out, L, open, si, base: total });
    total += L;
  });
  const N = rows.reduce((a, r) => a + r.out.length, 0);
  const G = { N, X: new Float32Array(N), Y: new Float32Array(N), NX: new Float32Array(N), NY: new Float32Array(N),
    S: new Float32Array(N), L: new Float32Array(N), OPEN: new Uint8Array(N), PH: new Float32Array(N), SA: new Float32Array(N),
    HZ: new Float32Array(N), ON: new Uint8Array(N * NS) };
  let i = 0;
  for (const { out, L, open, si, base } of rows)
    out.forEach(([x, y, s], q) => {
      const a = out[Math.max(0, q - 1)], b = out[Math.min(out.length - 1, q + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      G.X[i] = x; G.Y[i] = y; G.NX[i] = -(b[1] - a[1]) / l; G.NY[i] = (b[0] - a[0]) / l;
      G.S[i] = s; G.L[i] = L; G.OPEN[i] = open ? 1 : 0; G.PH[i] = si * 2.1; G.SA[i] = (base + s) / total;
      G.HZ[i] = 2 * hash(i, 7, N) - 1;
      // Which strand samples carry smoke: the core all along, the loose
      // strands mostly, the haze thinly.
      G.ON[i * NS] = 1;
      G.ON[i * NS + 1] = hash(i, 1, 31) > 0.25 ? 1 : 0;
      G.ON[i * NS + 2] = hash(i, 2, 31) > 0.25 ? 1 : 0;
      G.ON[i * NS + 3] = hash(i, 3, 31) > 0.7 ? 1 : 0;
      i++;
    });
  return G;
}
const GL = {};
for (const d of Object.keys(GLYPHS)) GL[d] = buildGlyph(GLYPHS[d]);

// ------------------------------------------------------------ smoke held in a stroke
//
// A stroke is three strands of smoke twisted round its centre-line, a braid
// that flows slowly along the stroke, with a slow wobble. `m` loosens the
// braid (1 at rest), `wob` is the wobble in px.

const WID = 1.6, KB = TAU / 12, WB = 2.4, WOB = 0.35;
const P2 = [0, 0];
function strandAt(G, i, j, T, m, wob, out = P2) {
  const s = G.S[i], ph = G.PH[i];
  const end = G.OPEN[i] ? Math.min(s, G.L[i] - s) : 99;
  const w = WID * m * (0.25 + 0.75 * smooth(end / 6));
  // The ribbon swells and narrows along the stroke, and the swell drifts.
  const sw = 0.55 + 0.45 * Math.sin(s * 0.37 - T * 1.1 + ph * 1.7) * Math.sin(s * 0.13 + T * 0.4);
  let off;
  if (j === 0) off = 0.45 * w * Math.sin(s * KB - T * WB + ph);
  else if (j < 3) off = w * (0.7 + 0.8 * sw) * Math.sin(s * KB * 0.8 - T * WB * 0.8 + j * 2.1 + ph);
  else off = w * (0.5 + 0.9 * sw) * G.HZ[i];
  const x = G.X[i], y = G.Y[i];
  out[0] = x + G.NX[i] * off + wob * Math.sin(0.31 * y + 1.3 * T + 2.1 * j);
  out[1] = y + G.NY[i] * off + wob * 0.7 * Math.sin(0.27 * x + 1.1 * T + 1.3 * j);
  return out;
}

// ------------------------------------------------------------ the air
//
// Curl noise: the velocity is the curl of a stream function made of plane
// waves at several scales and directions, so it has no divergence (smoke is
// neither created nor lost) and makes real eddies. The pattern itself rises
// with the warm air.

const WAVES = [24, 31, 20, 27, 13, 15, 11].map((lam, i) => {
  const dir = i * 2.4 + 0.3, k = TAU / lam;
  return { kx: k * Math.cos(dir), ky: k * Math.sin(dir), w: 0.35 + 0.17 * i, ph: hash(i, 3, 77) * TAU, a: (i < 4 ? 7.5 : 4.5) / k };
});
const RISE_PAT = 9;
const V = [0, 0];
function curl(x, y, T, gain, fine = 1) {
  const ph = phases(T);
  let u = 0, v = 0;
  for (let i = 0; i < NW; i++) {
    const c = (i < 4 ? WA[i] : WA[i] * fine) * Math.cos(WX[i] * x + WY[i] * y + ph[i]);
    u += c * WY[i]; v -= c * WX[i];
  }
  V[0] = u * gain; V[1] = v * gain;
}
// Each wave's phase at time T, reduced to [0, 2pi) once per instant: the
// time terms are huge and cos() of a huge argument is slow. Steps share
// instants (every integration runs on the same 1/60 s lattice), so a small
// cache serves them; a miss only costs the recomputation.
const NW = WAVES.length;
const WX = Float64Array.from(WAVES, (q) => q.kx), WY = Float64Array.from(WAVES, (q) => q.ky), WA = Float64Array.from(WAVES, (q) => q.a);
const WT = Float64Array.from(WAVES, (q) => q.ky * RISE_PAT + q.w);
const PHC_T = new Float64Array(8).fill(NaN), PHC = Array.from({ length: 8 }, () => new Float64Array(NW));
let phcNext = 0;
function phases(T) {
  T = Math.round(T * 240) / 240;   // the field moves on a 1/240 s clock: exact cache keys
  for (let e = 0; e < 8; e++) if (PHC_T[e] === T) return PHC[e];
  const e = phcNext; phcNext = (phcNext + 1) & 7;
  PHC_T[e] = T;
  for (let i = 0; i < NW; i++) PHC[e][i] = (WT[i] * T + WAVES[i].ph) % TAU;
  return PHC[e];
}

// The hour's smoke ring, seen from the side: a pair of opposite vortices
// (Lamb-Oseen cores) travelling left to right. RING is the absolute time of
// the hour turn it belongs to, or null.
let RING = null, RING_Y = 24;
// The ring is bigger than a numeral and seen a little from the side, so it
// never reads as a 0 passing through.
const RING_V = 54, RING_X0 = -30, RING_T0 = -3.1, RING_R = 23, RING_C = 4.5, RING_G = 5600;
const ringX = (T) => RING_X0 + RING_V * (T - (RING + RING_T0));
function ringField(x, y, T) {
  const rt = T - RING;
  if (rt < RING_T0 || rt > 1.5) return;
  const env = smooth((rt - RING_T0) / 0.4) * (1 - smooth((rt - 0.6) / 0.9));
  const X = ringX(T), g = (RING_G / TAU) * env;
  let dx = x - X, dy = y - (RING_Y - RING_R), r2 = dx * dx + dy * dy + RING_C * RING_C;
  V[0] += (g * dy) / r2; V[1] -= (g * dx) / r2;
  dy = y - (RING_Y + RING_R); r2 = dx * dx + dy * dy + RING_C * RING_C;
  V[0] -= (g * dy) / r2; V[1] += (g * dx) / r2;
}

const PLUME = 0, WISP = 1, DISSOLVE = 2, ENTRAIN = 3, CONDENSE = 4;
/** Velocity of smoke of a kind at (x, y), absolute time T, `age` s after release. */
function vel(kind, x, y, T, age, base) {
  if (kind === PLUME) {
    // Laminar for a few px above the ember, then the plume starts to sway
    // and roll up: the turbulence grows with height.
    const h = base - y;
    curl(x, y, T, 0.9 * smooth((h - 12) / 26), 0.5);
    V[1] -= 6 + 6 * smooth(h / 16);
    // A sinuous wave travelling up the column, growing with height, and a
    // spread (each particle drifts its own way), so the plume fans out.
    V[0] += 10 * Math.sin(2.4 * T + 0.05 * y) * smooth((h - 2) / 18) + EX * 8 * smooth((h - 10) / 30);
  } else if (kind === WISP) {
    curl(x, y, T, 1.0);
    V[0] += base; V[1] -= 7;
  } else if (kind === DISSOLVE) {
    // Buoyant: each part of the stroke gets its own lift (EX), so the smoke
    // rises in fingers that roll over at the top.
    curl(x, y, T, 0.4 + 1.6 * smooth(age / 0.5), 0.35);
    V[1] -= 12 + 34 * EX * Math.exp(-age / 0.7);
  } else if (kind === ENTRAIN) {
    curl(x, y, T, 1.3 * smooth(age / 0.6));
    V[1] -= 4;
  } else {
    curl(x, y, T, 1.2, 0.4);
    V[1] -= 7;
  }
  if (RING !== null) ringField(x, y, T);
}
/** One RK2 step of `h` seconds (negative: backwards in time). */
function adv(kind, x, y, T, age, base, h, out) {
  vel(kind, x, y, T, age, base);
  const mx = x + 0.5 * h * V[0], my = y + 0.5 * h * V[1];
  vel(kind, mx, my, T + 0.5 * h, age + 0.5 * h, base);
  out[0] = x + h * V[0]; out[1] = y + h * V[1];
}

// ------------------------------------------------------------ streams
//
// Smoke that is emitted continuously (the plume, the wisps) is a stream of
// particles, each released at a fixed instant on an absolute lattice and
// integrated from there on an absolute step lattice, so where a particle is
// depends only on when it left and the clock. A ring buffer keeps each
// particle's last two steps between frames; that is only a cache: a cold
// call integrates every live particle from its release (a few hundred steps
// each), and a call back in time starts it again.

function makeStream(cap) {
  return { cap, tag: new Float64Array(cap).fill(NaN), k: new Int32Array(cap), ax: new Float32Array(cap), ay: new Float32Array(cap),
    bx: new Float32Array(cap), by: new Float32Array(cap), base: new Float32Array(cap) };
}
const TMP = [0, 0];
let EX = 0;   // the particle's own drift, for the plume
/** Where stream particle `n` (released at `te` from (x0, y0)) is at time T; into P2. */
function streamPos(st, n, idx, kind, te, T, start, extra) {
  const kf = (T - te) / DT, K = Math.floor(kf), fr = kf - K;
  EX = hash(n, 9, 1) - 0.5;
  if (st.tag[idx] !== n || st.k[idx] > K) {
    const [x0, y0] = start(te);
    st.tag[idx] = n; st.k[idx] = 0; st.ax[idx] = x0; st.ay[idx] = y0; st.base[idx] = kind === PLUME ? y0 : extra;
    adv(kind, x0, y0, te, 0, st.base[idx], DT, TMP);
    st.bx[idx] = TMP[0]; st.by[idx] = TMP[1];
  }
  while (st.k[idx] < K) {
    const k = ++st.k[idx];
    st.ax[idx] = st.bx[idx]; st.ay[idx] = st.by[idx];
    adv(kind, st.ax[idx], st.ay[idx], te + k * DT, k * DT, st.base[idx], DT, TMP);
    st.bx[idx] = TMP[0]; st.by[idx] = TMP[1];
  }
  P2[0] = lerp(st.ax[idx], st.bx[idx], fr); P2[1] = lerp(st.ay[idx], st.by[idx], fr);
  return P2;
}

// ------------------------------------------------------------ the incense
//
// One stick in the gap between hours and minutes. It burns down over the
// hour; at the hour the ring's gust puts the ember out, the stub sinks away
// and a fresh stick rises and catches.

const TIP_X = 64, TIP_TOP = 46.5, TIP_BOT = 58.5, STICK_IN = 1.45, STUB_OUT = 1.5;
/** The stick at absolute time T: [tip x, tip y, ember lit 0..1]. */
function stick(T) {
  const d = new Date((T + EPOCH) * 1000);
  const rel = d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  const [ox, oy] = orbit(d, 2, 3);
  let y, lit = 1;
  if (rel < STICK_IN) { y = lerp(H + 3, TIP_TOP, smooth((rel - 0.1) / 1.05)); lit = smooth((rel - 1.15) / 0.2); }
  else if (rel > 3600 - STUB_OUT) { y = TIP_BOT + 9 * smooth((rel - 3600 + 1.1) / 1.1); lit = 1 - smooth((rel - 3600 + STUB_OUT) / 0.25); }
  else y = lerp(TIP_TOP, TIP_BOT, (rel - STICK_IN) / (3600 - STICK_IN - STUB_OUT));
  return [TIP_X + ox + 0.5, y + oy, lit];
}
// Two filaments leave the ember side by side, alternately.
const tipStart = (te) => { const s = stick(te); return [s[0] + (Math.round(te * PL_RATE) & 1 ? 0.45 : -0.45), s[1] - 1]; };

/** Windows of absolute time in which the ember sends no plume: its smoke is busy. */
let QUIET = [];
const quiet = (te) => { for (const [a, b] of QUIET) if (te >= a && te < b) return true; return false; };

const PL_RATE = 60, PL_LIFE = 5, PL = makeStream(512);   // one particle per step: all on the lattice
function drawPlume(g, T) {
  const n1 = Math.floor(T * PL_RATE), n0 = Math.ceil((T - PL_LIFE) * PL_RATE);
  for (let n = n0; n <= n1; n++) {
    const te = n / PL_RATE;
    if (quiet(te)) continue;
    const age = T - te;
    if (age > 2.2 + 2.8 * hash(n, 1, 5)) continue;   // the plume thins out as it rises
    // Not every particle shows: the gaps travel with the smoke, so the
    // plume visibly flows up instead of standing like a wire.
    if (hash(n, 2, 5) < 0.45 + 0.25 * smooth(age / 2)) continue;
    const p = streamPos(PL, n, n % PL.cap, PLUME, te, T, tipStart);
    g.pixel(p[0], p[1]);
  }
}

// Fraying: now and then a wisp peels off a stroke and curls away.
const WS_RATE = 20, WS_DUR = 1.3, WS_LIFE = 1.7, WS_PER = 3.1, WS_Q = 26, WS_E = 2;
const WS = makeStream(4 * WS_E * 2 * WS_Q);
// Where the wisp being drawn leaves its stroke (set before each streamPos call).
const WSRC = { d: null, i: 0, j: 0, side: 1 }, WSP = [0, 0];
function wispStart(t) {
  const { d, i, j, side } = WSRC;
  const p = strandAt(d.G, i, j, t, 1, WOB, WSP);
  return [d.x0 + p[0] + d.G.NX[i] * side, d.y0 + p[1] + d.G.NY[i] * side];
}
function drawWisps(g, T, digitAt) {
  for (let k = 0; k < 4; k++)
    for (let e = 0; e < WS_E; e++) {
      const off = hash(k, e, 9) * WS_PER;
      const c1 = Math.floor((T - off) / WS_PER);
      for (let c = c1 - 1; c <= c1; c++) {
        if (hash(c, e, k + 11) > 0.75) continue;
        const cs = Math.round((c * WS_PER + off) * 60) / 60;   // on the step lattice
        const drift = (hash(c, e, k + 5) - 0.5) * 9, side = hash(c, e, k + 6) < 0.5 ? -1.2 : 1.2;
        for (let q = 0; q < WS_Q; q++) {
          const te = cs + q / WS_RATE;
          if (te > T) break;
          if (T - te > WS_LIFE * (0.45 + 0.55 * hash(q, c, k * 2 + e))) continue;
          const d = digitAt(k, te);
          if (!d) continue;
          WSRC.d = d; WSRC.i = Math.floor(hash(c, e, k) * d.G.N); WSRC.j = c % 3; WSRC.side = side;
          const p = streamPos(WS, c * 64 + q, ((k * WS_E + e) * 2 + (c & 1)) * WS_Q + q, WISP, te, T, wispStart, drift);
          g.pixel(p[0], p[1]);
        }
      }
    }
}

// ------------------------------------------------------------ groups
//
// The smoke a turn sets loose (an old digit coming apart) is a group: every
// particle has its own release instant and is integrated on the group's step
// lattice from where its strand was at that instant. Trajectories are kept
// per turn (filled as far as needed, so a cold call simulates from the start
// of the turn); the cache is keyed by the turn only.

const GROUPS = new Map();
function cached(key, make) {
  let v = GROUPS.get(key);
  if (!v) { if (GROUPS.size > 8) GROUPS.clear(); v = make(); GROUPS.set(key, v); }
  return v;
}
function forwardGroup(N, t0, S, kind, sub, trOf, start) {
  const gr = { N, t0, S, kind, sub, start, done: -1, kr: new Int32Array(N), X: new Float32Array(N * (S + 1)), Y: new Float32Array(N * (S + 1)) };
  for (let p = 0; p < N; p++) gr.kr[p] = Math.max(0, Math.ceil((trOf(p) - t0) / DT));
  return gr;
}
function fill(gr, K) {
  K = Math.min(K, gr.S);
  const s1 = gr.S + 1, h = DT / gr.sub;
  for (let k = gr.done + 1; k <= K; k++) {
    const Tk = gr.t0 + k * DT;
    for (let p = 0; p < gr.N; p++) {
      const kr = gr.kr[p];
      if (k < kr) continue;
      const idx = p * s1 + k;
      if (k === kr) { const q = gr.start(p, Tk); gr.X[idx] = q[0]; gr.Y[idx] = q[1]; continue; }
      let x = gr.X[idx - 1], y = gr.Y[idx - 1];
      EX = gr.ex ? gr.ex[p] : 0;
      for (let s = 0; s < gr.sub; s++) {
        const t = Tk - DT + s * h;
        adv(gr.kind, x, y, t, t - gr.t0 - kr * DT, 0, h, TMP);
        x = TMP[0]; y = TMP[1];
      }
      gr.X[idx] = x; gr.Y[idx] = y;
    }
  }
  if (K > gr.done) gr.done = K;
}
/** Particle p of a filled group at time T, into P2; null before its release or after the group ends. */
function groupPos(gr, p, T) {
  const kf = (T - gr.t0) / DT, K = Math.floor(kf);
  if (K < gr.kr[p] || K + 1 > gr.S) return null;
  const idx = p * (gr.S + 1) + K, fr = kf - K;
  P2[0] = lerp(gr.X[idx], gr.X[idx + 1], fr); P2[1] = lerp(gr.Y[idx], gr.Y[idx + 1], fr);
  return P2;
}

// ------------------------------------------------------------ the minute
//
// Anticipation: from 2.6 s before the turn the changing digit's braid
// loosens and trembles. Action: from 1.45 s before, it comes apart top
// first: each bit of smoke is let go into the air with a buoyant kick and
// billows up in the eddies, thinning out (gone by about :00.8). From :00 the
// ember's smoke is drawn off sideways: a twisting ribbon rises from the
// stick, arcs over and comes down on the new digit, laying it along its
// stroke; each bit lands with its braid loose and tightens (settle).

const D_REL = -1.45, D_SPAN = 0.85, D_T0 = -1.6, D_S = 156;
const anticip = (T, turn) => smooth((T - turn + 2.4) / 1.0);
const ANT_M = 0.6, ANT_W = 0.45;

function drawDigit(g, G, x0, y0, T, m, wob) {
  for (let i = 0; i < G.N; i++)
    for (let j = 0; j < NS; j++) {
      if (!G.ON[i * NS + j]) continue;
      const p = strandAt(G, i, j, T, m, wob);
      g.pixel(x0 + p[0], y0 + p[1]);
    }
}

/** Smooth 1-D value noise in [0, 1). */
function sn(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed, 41), hash(i + 1, seed, 41), u);
}

function drawDissolve(g, G, x0, y0, T, turn, key) {
  const gr = cached(key, () => {
    const gr = forwardGroup(G.N * NS, turn + D_T0, D_S, DISSOLVE, 1,
      (p) => turn + D_REL + D_SPAN * (G.Y[(p / NS) | 0] / DH) + 0.05 * hash(p, 1, 3),
      (p, t) => { const a = anticip(t, turn); const q = strandAt(G, (p / NS) | 0, p % NS, t, 1 + ANT_M * a, WOB + ANT_W * a); return [x0 + q[0], y0 + q[1]]; });
    // Lift and life vary smoothly along the stroke, so the smoke goes in
    // coherent fingers and whole filaments thin out together.
    gr.ex = new Float32Array(gr.N); gr.life = new Float32Array(gr.N);
    for (let p = 0; p < gr.N; p++) {
      const i = (p / NS) | 0, s = G.SA[i] * 9;
      gr.ex[p] = 0.3 + 1.2 * sn(s, turn & 1023);
      gr.life[p] = 0.8 + 0.9 * sn(s * 1.7 + 3, turn & 1023) + 0.12 * hash(p, 2, 4);
      // The outer strand and the haze vanish soon after letting go: what
      // rises is the core filaments, clean streamers rather than a tangle.
      if (p % NS >= 2) gr.life[p] = 0.15 + 0.3 * hash(p, 5, 4);
    }
    return gr;
  });
  fill(gr, Math.floor((T - gr.t0) / DT) + 1);
  const a = anticip(T, turn), K = Math.floor((T - gr.t0) / DT);
  for (let p = 0; p < gr.N; p++) {
    if (!G.ON[p]) continue;
    if (K < gr.kr[p]) {
      const q = strandAt(G, (p / NS) | 0, p % NS, T, 1 + ANT_M * a, WOB + ANT_W * a);
      g.pixel(x0 + q[0], y0 + q[1]);
      continue;
    }
    const age = T - gr.t0 - gr.kr[p] * DT;
    if (age > gr.life[p]) continue;
    const q = groupPos(gr, p, T);
    if (q) g.pixel(q[0], q[1]);
    // The core filaments draw a short streak behind them (their own path,
    // already simulated), so the rising smoke reads as streamers.
    if (p % NS === 0 && age > 0.1) trail(g, gr, p, T, Math.min(3, Math.floor(age / 0.07)));
  }
}

/** Points along particle p's path behind it, every 4 steps. */
function trail(g, gr, p, T, n) {
  const K = Math.floor((T - gr.t0) / DT), base = p * (gr.S + 1);
  for (let b = 1; b <= n; b++) {
    const k = K - 4 * b;
    if (k < gr.kr[p] || k > gr.S) break;
    g.pixel(gr.X[base + k], gr.Y[base + k]);
  }
}

const FLY = 0.65, WRITE = 1.6, SET_M = 0.7, SET_W = 0.4;
/** The new digit, drawn out of the ember along its stroke from `s0` s after the turn. */
function drawCondense(g, G, x0, y0, T, turn, s0, tip) {
  const [tx, ty] = tip;
  for (let i = 0; i < G.N; i++)
    for (let j = 0; j < NS; j++) {
      if (!G.ON[i * NS + j]) continue;
      const ta = turn + s0 + WRITE * G.SA[i] + 0.04 * j + 0.05 * hash(i, j, 7);
      if (T < ta - FLY) continue;
      if (T >= ta) {
        const d = T - ta;
        const q = strandAt(G, i, j, T, 1 + SET_M * Math.exp(-d / 0.4), WOB + SET_W * Math.exp(-d / 0.5));
        g.pixel(x0 + q[0], y0 + q[1]);
        continue;
      }
      const h = strandAt(G, i, j, ta, 1 + SET_M, WOB + SET_W);
      const hx = x0 + h[0], hy = y0 + h[1];
      const e = smooth((T - ta + FLY) / FLY), f = 1 - e;
      const c1x = tx, c1y = ty - 30, c2x = hx + (tx - hx) * 0.1, c2y = Math.max(-4, hy - 16);
      let x = f * f * f * tx + 3 * f * f * e * c1x + 3 * f * e * e * c2x + e * e * e * hx;
      let y = f * f * f * (ty - 1) + 3 * f * f * e * c1y + 3 * f * e * e * c2y + e * e * e * hy;
      const r = 2 * Math.sin(Math.PI * e) * (0.85 + 0.3 * hash(i, j, 8)), an = TAU * 2.2 * e + j * (TAU / 3) + G.SA[i] * 9;
      x += r * Math.cos(an); y += r * Math.sin(an);
      g.pixel(x, y);
    }
}

// ------------------------------------------------------------ the hour: a smoke ring
//
// From 3.1 s before the hour a smoke ring is blown in from the left, rolling
// on its core. Its flow reaches each stroke as the ring arrives: the smoke
// is pulled through the ring and wound round its cores, and left curling in
// its wake. The ring's gust puts the ember out; the stub sinks, a new stick
// rises and catches. After :00 the new time condenses out of the stirred
// air left to right behind the ring: each bit of smoke is traced back
// through the eddies from where it settles, so the haze visibly gathers.

function slotList(digits, ox, oy) {
  const list = [];
  for (let k = 0; k < 4; k++) {
    const G = GL[digits[k]];
    for (let i = 0; i < G.N; i++) for (let j = 0; j < NS; j++) if (G.ON[i * NS + j]) list.push([G, i, j, SLOT_X[k] + ox, TOP + oy]);
  }
  return list;
}

function drawEntrain(g, digits, ox, oy, T, turn) {
  const gr = cached(`E${turn}`, () => {
    const L = slotList(digits, ox, oy);
    const tr = L.map(([G, i, , x0]) => RING + RING_T0 + (x0 + G.X[i] - 12 - RING_X0) / RING_V);
    // Only the two main strands are carried off; the rest vanishes at the
    // ring's touch (it never needs integrating).
    const gr = forwardGroup(L.length, turn - 3.0, Math.ceil(4.8 / DT), ENTRAIN, 1, (p) => (L[p][2] < 2 ? tr[p] : turn + 60), (p, t) => {
      const [G, i, j, x0, y0] = L[p], a = smooth(1 - (tr[p] - t) / 0.8);
      const q = strandAt(G, i, j, t, 1 + 0.9 * a, WOB + 0.6 * a);
      return [x0 + q[0], y0 + q[1]];
    });
    gr.L = L; gr.tr = tr;
    return gr;
  });
  const K = Math.floor((T - gr.t0) / DT);
  fill(gr, K + 1);
  for (let p = 0; p < gr.N; p++) {
    if (K < gr.kr[p]) {
      if (T > gr.tr[p]) continue;
      const [G, i, j, x0, y0] = gr.L[p], a = smooth(1 - (gr.tr[p] - T) / 0.8);
      const q = strandAt(G, i, j, T, 1 + 0.9 * a, WOB + 0.6 * a);
      g.pixel(x0 + q[0], y0 + q[1]);
      continue;
    }
    if (T - gr.t0 - gr.kr[p] * DT > 1.0 + 1.0 * hash(p, 5, 6)) continue;
    const q = groupPos(gr, p, T);
    if (q) g.pixel(q[0], q[1]);
  }
}

function drawRing(g, T) {
  const rt = T - RING;
  if (rt < RING_T0 || rt > 0.6) return;
  const X = ringX(T), env = smooth((rt - RING_T0) / 0.45);
  const cb = Math.cos(0.85), sb = Math.sin(0.85), r = 3.6;
  for (let a = 0; a < 60; a++) {
    const th = (a / 60) * TAU, ct = Math.cos(th), st = Math.sin(th);
    for (let b = 0; b < 5; b++) {
      if (hash(a, b, 21) > env) continue;
      const ph = ((b + hash(a, b, 22)) / 5) * TAU - 7 * rt + a * 0.9;
      const rr = RING_R + r * Math.cos(ph);
      g.pixel(X + r * Math.sin(ph) * cb + rr * st * sb, RING_Y + rr * ct);
    }
  }
}

const C_KB = 55;
function gatherGroup(digits, ox, oy, turn) {
  return cached(`C${turn}`, () => {
    const L = slotList(digits, ox, oy), N = L.length;
    const ta = new Float64Array(N);
    for (let p = 0; p < N; p++) {
      const [G, i, , x0] = L[p];
      // On the step lattice, so the backward steps share the field's instants.
      ta[p] = Math.round((turn + 0.35 + 1.6 * ((x0 + G.X[i]) / W) + 0.15 * hash(p, 3, 9)) * 60) / 60;
    }
    return { L, N, ta, X: new Float32Array(N * (C_KB + 1)), Y: new Float32Array(N * (C_KB + 1)), built: 0 };
  });
}
/**
 * Trace particles [built, upto) back through the air from where they settle.
 * Only the two main strands are traced; the others just appear in place.
 * The live view builds this a slice per frame before it is needed.
 */
function buildGather(gr, upto) {
  for (let p = gr.built; p < upto; p++) {
    const [G, i, j, x0, y0] = gr.L[p];
    if (j >= 2) continue;
    const q = strandAt(G, i, j, gr.ta[p], 1 + SET_M, WOB + SET_W);
    let x = x0 + q[0], y = y0 + q[1];
    const b = p * (C_KB + 1);
    gr.X[b] = x; gr.Y[b] = y;
    for (let k = 1; k <= C_KB; k++) {
      adv(CONDENSE, x, y, gr.ta[p] - (k - 1) * DT, 0, 0, -DT, TMP);
      x = TMP[0]; y = TMP[1];
      gr.X[b + k] = x; gr.Y[b + k] = y;
    }
  }
  if (upto > gr.built) gr.built = upto;
}
function drawGather(g, digits, ox, oy, T, turn) {
  const gr = gatherGroup(digits, ox, oy, turn);
  buildGather(gr, gr.N);
  for (let p = 0; p < gr.N; p++) {
    const kk = (gr.ta[p] - T) / DT;
    if (kk <= 0) {
      const [G, i, j, x0, y0] = gr.L[p], d = T - gr.ta[p];
      const q = strandAt(G, i, j, T, 1 + SET_M * Math.exp(-d / 0.4), WOB + SET_W * Math.exp(-d / 0.5));
      g.pixel(x0 + q[0], y0 + q[1]);
      continue;
    }
    if (kk >= C_KB || gr.L[p][2] >= 2 || hash(p, 4, 9) < kk / C_KB) continue;
    const K = Math.floor(kk), fr = kk - K, idx = p * (C_KB + 1) + K;
    g.pixel(lerp(gr.X[idx], gr.X[idx + 1], fr), lerp(gr.Y[idx], gr.Y[idx + 1], fr));
  }
}

function drawStick(g, T) {
  const [sx, sy, lit] = stick(T);
  const x = Math.floor(sx), y0 = Math.floor(sy);
  for (let y = y0 + 2; y < H; y++) if (((y - y0) & 1) === 0 || y === y0 + 2) g.pixel(x, y);
  if (sy > H) return;
  g.pixel(x, sy + 1);
  if (lit <= 0.02) return;
  g.pixel(x, sy);
  // The ember breathes: a glow pixel to one side or the other, now and then above.
  const fl = hash(Math.floor(T * 14), 1, 2);
  if (lit > 0.5 && fl < 0.45) g.pixel(x - 1, sy + 0.5);
  if (lit > 0.5 && fl > 0.55) g.pixel(x + 1, sy + 0.5);
  if (lit > 0.5 && fl > 0.9) g.pixel(x, sy - 1);
  // Catching: a short flare as the new stick lights.
  if (lit < 1) {
    const r = 1 + 2.5 * Math.sin(Math.PI * lit);
    for (let a = 0; a < 8; a++) g.pixel(sx + r * Math.cos(a * 0.785 + 0.4), sy - 0.5 + r * Math.sin(a * 0.785 + 0.4));
  }
}

// ------------------------------------------------------------ face

export default {
  name: 'Smoke',
  blurb: 'The time in incense smoke: braided wisps that fray and curl; a changing digit billows away and the ember draws the new one in a twisting ribbon; on the hour a smoke ring rolls through.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000 - EPOCH;
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const turn = Math.round(T - tau);
    const hour = to.m === 0;
    const [ox, oy] = orbit(date, 2, 3);
    const a = `${from.hh}${from.mm}`, b = `${to.hh}${to.mm}`;
    RING = hour ? turn : null;
    RING_Y = TOP + DH / 2 + oy;
    QUIET = [turn - 60, turn, turn + 60].map((tt) => (new Date((tt + EPOCH) * 1000).getMinutes() === 0
      ? [tt - STUB_OUT, tt + STICK_IN] : [tt - 0.8, tt + 2.3]));

    const changing = [0, 1, 2, 3].map((k) => hour || a[k] !== b[k]);
    const slot = (d, k) => ({ G: GL[d[k]], x0: SLOT_X[k] + ox, y0: TOP + oy });
    const A = [0, 1, 2, 3].map((k) => slot(a, k)), B = [0, 1, 2, 3].map((k) => slot(b, k));
    const digitAt = (k, te) => (changing[k] && te > turn - 3.2 && te < turn + 3.6 ? null : te < turn ? A[k] : B[k]);

    if (hour) {
      if (tau < -3.0) for (const s of A) drawDigit(g, s.G, s.x0, s.y0, T, 1, WOB);
      else if (tau < 1.8) drawEntrain(g, a, ox, oy, T, turn);
      if (tau > -1) drawGather(g, b, ox, oy, T, turn);
      else if (tau > -3.0) { const gr = gatherGroup(b, ox, oy, turn); buildGather(gr, Math.ceil(gr.N * clamp01((tau + 3.0) / 1.9))); }
    } else {
      const tip = stick(T);
      let q = 0;
      for (let k = 0; k < 4; k++) {
        const { G, x0, y0 } = B[k];
        if (!changing[k]) { drawDigit(g, G, x0, y0, T, 1, WOB); continue; }
        const old = A[k];
        if (tau < D_T0) { const an = anticip(T, turn); drawDigit(g, old.G, x0, y0, T, 1 + ANT_M * an, WOB + ANT_W * an); }
        else if (tau < 1.0) drawDissolve(g, old.G, x0, y0, T, turn, `D${turn}:${k}`);
        if (tau > -1.0) drawCondense(g, G, x0, y0, T, turn, 0.2 + 0.45 * q, tip);
        q++;
      }
    }
    drawWisps(g, T, digitAt);
    drawPlume(g, T);
    drawStick(g, T);
    if (hour) drawRing(g, T);
    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};
