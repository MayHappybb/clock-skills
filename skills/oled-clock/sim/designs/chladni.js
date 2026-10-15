// Chladni: the time is the resonance of a bowed plate.
//
// A square brass plate, seen from the front and above, is bowed at its right
// edge. Sand on it gathers where the plate does not move, on its nodal
// lines, and the plate rings in a mode whose nodal lines are the time: HH
// over MM, the hex clamp nut at the centre (a node, as on a real Chladni
// plate) for the separator. The numerals are drawn as nodal lines: nothing
// ruled, every stroke bowed, the 8 one line crossing itself.
//
// Between turns the plate hums: the bow strokes once a second, changing
// direction on the second; the sand bands breathe with it, density waves run
// along the lines, a few grains are kicked up and skip along them, and the
// front edge of the plate rides the standing wave.
//
// The minute: the bow lifts off (the plate rings down, the sand goes still),
// then strikes with one long fast stroke and the drive sweeps. The grains
// leap, the old time shatters, the sand runs into a real Chladni figure
// (cos m.pi.u cos n.pi.v +/- cos n.pi.u cos m.pi.v), its nodal lines glide
// into a second one, and at the new minute's resonance the grains hop into
// the new time. The grains are a simulation: each step every grain is kicked
// in proportion to the plate's amplitude under it and runs downhill to the
// nodes, so it is the physics that draws the figures. The hour: a
// fortissimo, a tremolo, a glissando up through four figures, and then the
// whole figure leaps off the plate in unison and lands as the new hour.
//
// Purity: a turn's simulation starts from the old time's canonical grain
// positions, with a fixed step and a seed from the minute, and is cached
// and stepped lazily, so any instant has one answer. After the sweep each
// grain is matched to a home in the new digits and travels there in closed
// form; the hold state is closed form too.
//
// Burn-in: everything walks kit.orbit, the sand is new every minute, the
// plate's edges are dotted; the nut is the hottest pixel (check.mjs).

import { clockFields, orbit } from '../js/kit.js';

const W = 128, H = 64;
// ------------------------------------------------------------ the plate (world units)
const PW = 72, PD = 72;               // a square plate: width (x) and depth (z: 0 back, PD front)
const CELL = [[6, 4], [42, 4], [6, 41], [42, 41]];   // top-left of each digit: HH over MM
const CW = 24, CH = 27;               // digit box
const NUT = [36, 36.5], NUT_R = 3.6;  // the clamp at the centre: the separator

// Projection: a plane seen in perspective from the front and above. 1/scale
// is linear in depth, and screen y is linear in scale.
const CX = 57, YB = 4, YF = 54, SB = 0.7, SF = 1.0;
const LIFT = 0.55;                    // screen px per world unit of height, per unit scale
function scaleAt(z) { const q = z / PD; return 1 / ((1 - q) / SB + q / SF); }
function sx(x, s) { return CX + (x - PW / 2) * s; }
function sy(s) { return YB + ((YF - YB) * (s - SB)) / (SF - SB); }

// ------------------------------------------------------------ helpers
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1]. */
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed, 5) * (1 - u) + hash(i + 1, seed, 5) * u;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const smoother = (u) => { u = clamp01(u); return u * u * u * (u * (u * 6 - 15) + 10); };

// ------------------------------------------------------------ letterforms
//
// Nodal lines: nothing in these numerals is ruled. Every stroke is bowed
// or S-curved like a line in a Chladni figure, the 8 is one line crossing
// itself, the 4's bar runs through its stem, the 0 is the rounded square of
// a Chladni loop, and there are no serifs. Centre-lines in a CW x CH box, y down (towards the front).
// Arcs use clock angles in degrees (0 = up, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
function superLoop(cx, cy, rx, ry, p, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    pts.push([cx + rx * Math.sign(s) * Math.abs(s) ** (2 / p), cy - ry * Math.sign(c) * Math.abs(c) ** (2 / p)]);
  }
  return pts;
}
function eight() {
  // One line: down the top loop, across the waist, round the bottom loop
  // and back across, the two passes crossing square at the waist.
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * 2 * Math.PI, c = Math.cos(t);
    const top = c > 0;
    const y = 19.5 - (top ? 17 : 22) * c;
    const x = 11 + (top ? 6.8 : 8.4) * Math.sin(2 * t) * (1 + 0.25 * Math.abs(c));
    pts.push([x, y]);
  }
  return pts;
}
const L = (...p) => p;
const rot180 = (paths) => paths.map((p) => p.map(([x, y]) => [22 - x, 44 - y]));

/** A line bowed (waves = 1) or S-curved (waves = 2) sideways by `amp`, like a nodal line. */
function wavy([ax, ay], [bx, by], amp, waves = 1, n = 14) {
  const l = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / l, ny = (bx - ax) / l, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, o = amp * Math.sin(Math.PI * waves * u);
    pts.push([ax + (bx - ax) * u + nx * o, ay + (by - ay) * u + ny * o]);
  }
  return pts;
}
const SKELETON = {
  0: [superLoop(11, 22, 8.6, 19.5, 2.6)],
  1: [[...wavy([7.5, 6.5], [12.5, 1], 0.5), ...wavy([12.5, 1], [12.5, 43], 0.7).slice(1)]],
  2: [[...arc(11, 12, 8, 9, -78, 118, 18), ...wavy([16.9, 18.4], [2.6, 42], -1.6).slice(1), ...wavy([2.6, 42], [20, 42], 1.1).slice(1)]],
  3: [arc(10.5, 11.5, 7.6, 8.6, -80, 196, 20), arc(10.5, 30.5, 8.8, 11, -16, 248, 26)],
  4: [wavy([15, 0.5], [15, 43.5], 1.1, 2), wavy([15, 0.5], [1.6, 30], -1.2), wavy([1.6, 30], [21, 30], 0.9)],
  5: [[...wavy([19, 2.5], [5, 2.5], -1), ...wavy([5, 2.5], [4.4, 20], 0.6).slice(1), ...arc(10.8, 29.6, 8.6, 11.6, -60, 228, 24)]],
  7: [[...wavy([2, 2.5], [20, 2.5], -1), ...wavy([20, 2.5], [8, 43], 2, 2).slice(1)]],
  8: [eight()],
  9: [[...arc(11, 13, 8.3, 10.5, 90, 450, 32), ...arc(7.2, 13, 11.8, 28.2, 90, 186, 12).slice(1)]],
};
SKELETON[6] = rot180(SKELETON[9]);

// Flatten into segments [ax, ay, bx, by, s0] (s0: arc length at a).
const SEGS = {};
for (const [d, paths] of Object.entries(SKELETON)) {
  const s = [];
  let acc = 0;
  for (let p of paths) {
    p = p.map(([x, y]) => [(x * CW) / 22, (y * CH) / 44]);   // drawn in a 22 x 44 box
    for (let i = 1; i < p.length; i++) {
      s.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], acc]);
      acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    }
  }
  SEGS[d] = s;
}
/** Nearest point of a digit's skeleton: [dist, qx, qy, tx, ty, s]. */
function nearest(d, px, py) {
  let best = Infinity, r = null;
  for (const [ax, ay, bx, by, s0] of SEGS[d]) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
    const qx = ax + u * dx, qy = ay + u * dy, e = Math.hypot(px - qx, py - qy);
    if (e < best) { const l = Math.sqrt(l2) || 1; best = e; r = [e, qx, qy, dx / l, dy / l, s0 + u * l]; }
  }
  return r;
}

// ------------------------------------------------------------ homes
//
// Where each grain of a settled digit lies: a band 2 HW wide round the
// nodal line, denser at the core, with a little scatter, plus for each home
// its signed offset across the band, the line's tangent and the arc length
// (for the breathing and the waves along the lines).
const HW = 1.75, STEP = 1.12;
const HOMES = {};
for (const d of Object.keys(SEGS)) {
  const out = [];
  for (let j = 0; j * STEP < CH + 4; j++)
    for (let i = 0; i * STEP < CW + 4; i++) {
      const px = -2 + (i + 0.5) * STEP + (hash(i, j, 41) - 0.5) * 0.45;
      const py = -2 + (j + 0.5) * STEP + (hash(i, j, 43) - 0.5) * 0.45;
      const [e, qx, qy, tx, ty, s] = nearest(d, px, py);
      // Sand on a nodal line is never ruled: the band swells and thins
      // along it, as the figures' lines do, with a ragged edge.
      const hw = HW * (0.66 + 0.48 * vnoise(s / 4.2, 31 + +d));
      if (e > hw + 0.25) continue;
      const dens = 1 - 0.7 * smooth((e - 0.55 * hw) / (0.45 * hw + 0.25));
      if (hash(i, j, 47 + +d) > dens) continue;
      const side = (px - qx) * -ty + (py - qy) * tx;   // signed offset across the line
      out.push({ x: px, y: py, nx: -ty, ny: tx, tx, ty, off: side, s });
    }
  HOMES[d] = out;
}
const MAXN = Math.max(...Object.values(HOMES).map((h) => h.length));
const N = Math.max(2200, 4 * MAXN);    // grains on the plate: plenty for 8888, and for the figures

/** The settled grains of a whole time "HHMM", in world coordinates. */
const TIME_HOMES = new Map();
function timeHomes(str) {
  const key = str;
  let v = TIME_HOMES.get(key);
  if (v) return v;
  const list = [];
  for (let k = 0; k < 4; k++)
    for (const h of HOMES[str[k]])
      list.push({ x: CELL[k][0] + h.x, z: CELL[k][1] + h.y, nx: h.nx, nz: h.ny, tx: h.tx, tz: h.ty, off: h.off, s: h.s + k * 300, k });
  const nd = list.length;
  const n = list.length;
  v = { n, nd, list, X: new Float32Array(n), Z: new Float32Array(n) };
  list.forEach((h, i) => { v.X[i] = h.x; v.Z[i] = h.z; });
  if (TIME_HOMES.size > 16) TIME_HOMES.clear();
  TIME_HOMES.set(key, v);
  return v;
}

// ------------------------------------------------------------ fields
//
// Everything the grains feel is an amplitude A >= 0 on a grid of world
// units: zero on a nodal line, large where the plate moves most.
const GW = PW + 1, GH = PD + 1;

// Each digit's distance field, on a grid round its cell, built once.
const PAD = 40, LW = CW + 2 * PAD + 1, LH = CH + 2 * PAD + 1;
const DIST = {};
for (const d of Object.keys(SEGS)) {
  const a = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++)
    for (let i = 0; i < LW; i++) a[j * LW + i] = nearest(d, i - PAD, j - PAD)[0];
  DIST[d] = a;
}

/** Distance (world units) to the nearest stroke of the digits of `str`. */
const RAW_DIST = new Map();
function rawDist(str) {
  let f = RAW_DIST.get(str);
  if (f) return f;
  f = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      let d = 60;
      for (let k = 0; k < 4; k++) {
        const li = i - CELL[k][0] + PAD, lj = j - CELL[k][1] + PAD;
        if (li >= 0 && li < LW && lj >= 0 && lj < LH) d = Math.min(d, DIST[str[k]][lj * LW + li]);
      }
      f[j * GW + i] = d;
    }
  if (RAW_DIST.size > 12) RAW_DIST.clear();
  RAW_DIST.set(str, f);
  return f;
}

const digitDist = rawDist;

/** The amplitude of the plate ringing in the mode whose nodal lines are the time `str`. */
const DIGIT_FIELD = new Map();
function digitField(str) {
  const key = str;
  let f = DIGIT_FIELD.get(key);
  if (f) return f;
  const D = digitDist(str);
  f = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const o = j * GW + i;
      const r = Math.hypot(i - NUT[0], j - NUT[1]) - NUT_R;   // the clamp is a node too
      const ad = 1 - Math.exp(-Math.max(0, Math.min(D[o], Math.max(0, r) + 2.5) - HW + 0.2) / 6.5);
      f[o] = ad;
    }
  if (DIGIT_FIELD.size > 8) DIGIT_FIELD.clear();
  DIGIT_FIELD.set(key, f);
  return f;
}

// Real Chladni figures: superpositions of plate modes
// cos(a pi u) cos(b pi v) + s cos(c pi u) cos(d pi v), u, v in [0, 1] across
// the plate, signed and normalised to a peak of 1.
const FIGURES = [
  [1, 2, 2, 1, 1], [1, 2, 2, 1, -1], [1, 3, 3, 1, -1], [2, 3, 3, 2, 1], [2, 3, 3, 2, -1], [1, 4, 4, 1, 1], [1, 4, 4, 1, -1], [3, 4, 4, 3, 1], [3, 4, 4, 3, -1], [2, 5, 5, 2, 1], [2, 5, 5, 2, -1], [1, 5, 5, 1, -1], [3, 5, 5, 3, -1], [4, 5, 5, 4, 1], [1, 6, 6, 1, -1], [2, 7, 7, 2, 1], [3, 6, 6, 3, 1], [4, 5, 5, 4, -1],
];
// The figures that read well (no blot where many lines meet), and each one's
// frequency, up to a constant.
const FIG_OK = [0, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 17];
const FREQ = FIGURES.map(([a, b]) => a * a + b * b);
/** Each minute's own figure. */
const sigFig = (minuteKey) => FIG_OK[Math.floor(hash(minuteKey, 1, 99) * FIG_OK.length)];
const MODE = FIGURES.map(([a, b, c, d, s]) => {
  const f = new Float32Array(GW * GH);
  let m = 0;
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const u = i / PW, v = j / PD;
      const p = Math.cos(a * Math.PI * u) * Math.cos(b * Math.PI * v) + s * Math.cos(c * Math.PI * u) * Math.cos(d * Math.PI * v);
      f[j * GW + i] = p;
      m = Math.max(m, Math.abs(p));
    }
  for (let i = 0; i < f.length; i++) f[i] /= m;
  return f;
});

/** Bilinear sample of a grid at world (x, z). */
function samp(f, x, z) {
  x = x < 0 ? 0 : x > PW - 0.001 ? PW - 0.001 : x;
  z = z < 0 ? 0 : z > PD - 0.001 ? PD - 0.001 : z;
  const i = x | 0, j = z | 0, fx = x - i, fz = z - j, o = j * GW + i;
  const a = f[o] + (f[o + 1] - f[o]) * fx, b = f[o + GW] + (f[o + GW + 1] - f[o + GW]) * fx;
  return a + (b - a) * fz;
}


// ------------------------------------------------------------ turn schedules
//
// Times are seconds from :00. `attack` is when the bow changes direction and
// the sweep begins; figures are held at `centres` and glide from one into
// the next; `out` fades the old time's mode, `in` brings in the new one.
const SCHED = {
  minute: {
    attack: -1.2, end: 0.62, relax: 1.1, hop: 5,
    out: [-1.2, -0.9], centres: [-0.4, 0.3], figIn: [-1.1, -0.7], figOut: [0.42, 0.62],
    in: [0.42, 0.62], decay: [0.8, 1.3], accent: 6, fountain: 0,
  },
  hour: {
    attack: -2.3, end: 0.9, relax: 1.8, hop: 6,
    out: [-2.3, -1.95], centres: [-1.5, -0.75, -0.05, 0.55], figIn: [-2.2, -1.8], figOut: [9, 10],
    in: [9, 10], decay: [0.55, 1.0], accent: 10, fountain: 1, rain: 1,
  },
};
const DT = 1 / 60;
const ramp = (t, [a, b]) => smooth((t - a) / (b - a));

/** Mode weights, drive and digit weights at time tau of a turn. */
function weights(S, figs, tau) {
  const E = smooth((tau - S.attack) / 0.18) * (1 - ramp(tau, S.decay));
  const wo = 1 - ramp(tau, S.out), wn = ramp(tau, S.in);
  const c = new Float32Array(figs.length);
  const C = S.centres;
  let k = 0;
  while (k < C.length - 1 && tau > C[k + 1]) k++;
  if (tau <= C[0]) c[0] = ramp(tau, S.figIn);
  else if (tau >= C[C.length - 1]) c[C.length - 1] = 1 - ramp(tau, S.figOut);
  else {
    // Signed superposition: the nodal lines glide from one figure to the next.
    const th = (smoother((tau - C[k]) / (C[k + 1] - C[k])) * Math.PI) / 2;
    c[k] = Math.cos(th); c[k + 1] = Math.sin(th);
  }
  return { E, wo, wn, c };
}

// ------------------------------------------------------------ the simulation
//
// Chladni's sand: a grain is thrown about in proportion to how hard the
// plate moves under it, and drifts downhill in amplitude, so it comes to rest
// only on a nodal line. Fixed step, seeded, from the old time's homes.
const LEAP = 18;                      // how high the hour's figure is thrown, world units
const WAVE = 150;                     // world units per second, from the bow
const MU = 60, SIGMA = 22, DIFF = 5, EPS = 0.6, LINE = 0.09, BURST = 125;

function makeTurn(type, from, to, key) {
  const S = SCHED[type];
  // A sweep goes up in frequency through its figures (in order of
  // m^2 + n^2), and ends on the new minute's own figure.
  const nf = S.centres.length, figs = [], fo = sigFig(key - 1), fn = sigFig(key);
  for (let i = 0; figs.length < nf - 1; i++) {
    const f = FIG_OK[Math.floor(hash(key, i, 77) * FIG_OK.length)];
    if (!figs.includes(f) && f !== fn && f !== fo) figs.push(f);
  }
  figs.sort((a, b) => FREQ[a] - FREQ[b]);
  figs.push(fn);
  const steps = Math.ceil((S.end - S.attack) / DT);
  const ho = timeHomes(from);
  const P = new Float32Array((steps + 1) * N * 2), A = new Float32Array((steps + 1) * N);
  for (let i = 0; i < N; i++) {
    const h = i % ho.n;
    P[2 * i] = ho.X[h]; P[2 * i + 1] = ho.Z[h];
  }
  // On a minute turn a digit that does not change keeps its sand (its line
  // is a node of both modes): its sand stays put, humming, and the figures
  // are kept off it.
  const same = [0, 1, 2, 3].filter((k) => !S.fountain && from[k] === to[k]);
  const pin = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (same.includes(ho.list[i % ho.n].k)) pin[i] = 1;
  let K = null;
  if (same.length) {
    K = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        let depth = -9;
        for (const k of same) {
          const [cx, cz] = CELL[k];
          depth = Math.max(depth, Math.min(i - cx + 2, cx + CW + 2 - i, j - cz + 2, cz + CH + 2 - j));
        }
        K[j * GW + i] = 1.6 * smooth(depth / 4);
      }
  }
  const ph = new Float32Array(N), nu = new Float32Array(N), v0 = new Float32Array(N), dl = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    ph[i] = hash(i, key, 5); nu[i] = 3 + 3 * hash(i, key, 6); v0[i] = hash(i, key, 8);
    dl[i] = Math.hypot(PW - P[2 * i], BOW_Z - P[2 * i + 1]) / WAVE;
  }
  return { type, S, from, to, key, figs, steps, done: 0, P, A, ph, nu, v0, dl, pin, K, Do: digitField(from), Dn: digitField(to), assign: null };
}

function ampAt(T, w, x, z) {
  let a = 0;
  if (w.wo > 0.002) a += w.wo * samp(T.Do, x, z);
  if (w.wn > 0.002) a += w.wn * samp(T.Dn, x, z);
  let p = 0;
  for (let k = 0; k < T.figs.length; k++) if (w.c[k] > 0.002) p += w.c[k] * samp(MODE[T.figs[k]], x, z);
  // A nodal line holds a band of sand, not a hairline.
  return a + Math.max(0, Math.abs(p) - LINE) + (T.K ? samp(T.K, x, z) : 0);
}

function advance(T, upto) {
  const { P, A, S } = T;
  while (T.done < upto) {
    const s = T.done, tau = S.attack + s * DT;
    const w = weights(S, T.figs, tau);
    const o = s * N * 2, o2 = (s + 1) * N * 2;
    const blk = Math.floor(tau * 10 + 100);
    for (let i = 0; i < N; i++) {
      let x = P[o + 2 * i], z = P[o + 2 * i + 1];
      if (T.pin[i]) { P[o2 + 2 * i] = x; P[o2 + 2 * i + 1] = z; A[s * N + i] = 0; continue; }
      const a = ampAt(T, w, x, z);
      A[s * N + i] = a;
      // The strike reaches each grain as a wave across the plate from the bow.
      const El = w.E * smooth((tau - S.attack - T.dl[i]) / 0.2);
      if (El > 0.001) {
        let gx = ampAt(T, w, x + EPS, z) - ampAt(T, w, x - EPS, z);
        let gz = ampAt(T, w, x, z + EPS) - ampAt(T, w, x, z - EPS);
        const gl = Math.hypot(gx, gz) || 1;
        const ang = 2 * Math.PI * hash(i, blk, T.key);
        // Downhill, fast until close to the line (and never past it), plus
        // the kick, and a little agitation everywhere so sand spreads along
        // a line instead of clumping.
        const run = Math.min(MU * El * Math.sqrt(a) * DT, (0.8 * a * 2 * EPS) / gl);
        // The strike throws everything about, wherever it lies.
        const tb = tau - S.attack - T.dl[i], burst = tb > 0 ? Math.exp(-tb / 0.22) * smooth(tb / 0.1) : 0;
        const kick = El * DT * (SIGMA * a + DIFF) + DT * BURST * burst * (0.5 + hash(i, 9, T.key));
        x += (-run * gx) / gl + kick * Math.cos(ang);
        z += (-run * gz) / gl + kick * Math.sin(ang);
        // Off the clamp, and kept on the plate.
        const dx = x - NUT[0], dz = z - NUT[1], r = Math.hypot(dx, dz);
        if (r < NUT_R) { x = NUT[0] + (dx / (r || 1)) * NUT_R; z = NUT[1] + (dz / (r || 1)) * NUT_R; }
        x = x < 1 ? 1 : x > PW - 1 ? PW - 1 : x;
        z = z < 1 ? 1 : z > PD - 1 ? PD - 1 : z;
      }
      P[o2 + 2 * i] = x; P[o2 + 2 * i + 1] = z;
    }
    T.done++;
  }
  if (T.done === T.steps && !T.assign) {
    const w = weights(S, T.figs, S.end);
    for (let i = 0; i < N; i++) A[T.steps * N + i] = ampAt(T, w, P[T.steps * N * 2 + 2 * i], P[T.steps * N * 2 + 2 * i + 1]);
    T.assign = assignHomes(T);
  }
}

/** Each grain to a home of the new time, nearest first, every home covered. */
function assignHomes(T) {
  const hn = timeHomes(T.to), o = T.steps * N * 2, P = T.P;
  const asg = new Int32Array(N), cnt = new Int32Array(hn.n);
  // Homes in 4-unit buckets; search outwards ring by ring.
  const BK = 4, NB = Math.ceil(PW / BK) + 1, buckets = Array.from({ length: NB * NB }, () => []);
  for (let j = 0; j < hn.n; j++) buckets[Math.floor(hn.Z[j] / BK) * NB + Math.floor(hn.X[j] / BK)].push(j);
  for (let i = 0; i < N; i++) {
    const x = P[o + 2 * i], z = P[o + 2 * i + 1], bx = Math.floor(x / BK), bz = Math.floor(z / BK);
    let b = 0, bd = Infinity;
    for (let r = 0; r < NB; r++) {
      if (bd < ((r - 1) * BK) ** 2) break;
      for (let jz = bz - r; jz <= bz + r; jz++)
        for (let jx = bx - r; jx <= bx + r; jx++) {
          if (Math.max(Math.abs(jz - bz), Math.abs(jx - bx)) !== r || jx < 0 || jz < 0 || jx >= NB || jz >= NB) continue;
          for (const j of buckets[jz * NB + jx]) {
            const d = (hn.X[j] - x) ** 2 + (hn.Z[j] - z) ** 2;
            if (d < bd) { bd = d; b = j; }
          }
        }
    }
    asg[i] = b; cnt[b]++;
  }
  // Every home gets a grain: the nearest one whose home has a spare.
  const gb = Array.from({ length: NB * NB }, () => []);
  for (let i = 0; i < N; i++) gb[Math.floor(P[o + 2 * i + 1] / BK) * NB + Math.floor(P[o + 2 * i] / BK)].push(i);
  for (let j = 0; j < hn.n; j++) {
    if (cnt[j]) continue;
    const x = hn.X[j], z = hn.Z[j], bx = Math.floor(x / BK), bz = Math.floor(z / BK);
    let b = -1, bd = Infinity;
    for (let r = 0; r < NB; r++) {
      if (bd < ((r - 1) * BK) ** 2) break;
      for (let jz = bz - r; jz <= bz + r; jz++)
        for (let jx = bx - r; jx <= bx + r; jx++) {
          if (Math.max(Math.abs(jz - bz), Math.abs(jx - bx)) !== r || jx < 0 || jz < 0 || jx >= NB || jz >= NB) continue;
          for (const i of gb[jz * NB + jx]) {
            if (cnt[asg[i]] < 2) continue;
            const d = (x - P[o + 2 * i]) ** 2 + (z - P[o + 2 * i + 1]) ** 2;
            if (d < bd) { bd = d; b = i; }
          }
        }
    }
    if (b < 0) continue;
    cnt[asg[b]]--; asg[b] = j; cnt[j]++;
  }
  return asg;
}

const TURNS = [];
function turnFor(type, from, to, key) {
  const id = `${type}:${from}:${to}:${key}`;
  let T = TURNS.find((t) => t.id === id);
  if (!T) {
    T = makeTurn(type, from, to, key); T.id = id;
    TURNS.unshift(T);
    if (TURNS.length > 2) TURNS.pop();
  }
  return T;
}

// ------------------------------------------------------------ drawing grains

function plot(g, x, z, h, ox, oy) {
  const s = scaleAt(z);
  g.pixel(sx(x, s) + ox, sy(s) - h * s * LIFT + oy);
}

const G_FALL = 95;
/** A turn in progress, tau seconds from :00. */
function drawTurn(g, T, tau, ox, oy) {
  const S = T.S;
  if (tau < S.end) {
    const f = (tau - S.attack) / DT, s0 = Math.min(T.steps - 1, Math.max(0, Math.floor(f))), fr = clamp01(f - s0);
    advance(T, s0 + 1);
    const w = weights(S, T.figs, tau);
    const a = s0 * N * 2, b = a + N * 2, aa = s0 * N, ab = aa + N;
    const tl0 = tau - S.attack;
    for (let i = 0; i < N; i++) {
      const x = T.P[a + 2 * i] + (T.P[b + 2 * i] - T.P[a + 2 * i]) * fr;
      const z = T.P[a + 2 * i + 1] + (T.P[b + 2 * i + 1] - T.P[a + 2 * i + 1]) * fr;
      const amp = T.pin[i] ? 0.2 : T.A[aa + i] + (T.A[ab + i] - T.A[aa + i]) * fr;
      let h = S.hop * w.E * smooth((tl0 - T.dl[i]) / 0.2) * Math.min(1.2, amp) * Math.abs(Math.sin(Math.PI * (T.nu[i] * tl0 + T.ph[i])));
      if (S.fountain) {
        // Fortissimo: the whole layer is thrown off the plate, nearest the bow first.
        const tl = tl0 - (PW - T.P[2 * i]) / 240, v = 16 + 16 * T.v0[i];
        if (tl > 0 && tl < (2 * v) / G_FALL) h += v * tl - 0.5 * G_FALL * tl * tl;
      }
      plot(g, x, z, h, ox, oy);
    }
    return;
  }
  advance(T, T.steps);
  const hn = timeHomes(T.to), o = T.steps * N * 2;
  if (S.rain) {
    // The climax: the plate throws the whole figure into the air as one. It
    // rises, hangs, turns into the new time while it hangs, and falls, and
    // the landing bounces.
    for (let i = 0; i < N; i++) {
      const j = T.assign[i], x0 = T.P[o + 2 * i], z0 = T.P[o + 2 * i + 1];
      const tl = tau - S.end - 0.06 * T.ph[i];
      const e = smoother((tl - 0.3) / 0.5);
      const x = x0 + (hn.X[j] - x0) * e, z = z0 + (hn.Z[j] - z0) * e;
      let h;
      if (tl < 1.05) { const u = clamp01(tl / 1.05); h = LEAP * (1 - (2 * u - 1) ** 4); }
      else { const tb = tl - 1.05; h = 2.2 * Math.exp(-tb / 0.14) * Math.abs(Math.sin((Math.PI * tb) / 0.17)); }
      plot(g, x, z, h, ox, oy);
    }
    return;
  }
  // Condensing: at the new minute's resonance every grain hops along to its
  // place on the new lines, the hops dying away as the plate settles.
  const tl0 = tau - S.attack, E = 1 - smooth((tau - S.end) / S.relax);
  for (let i = 0; i < N; i++) {
    const j = T.assign[i], x0 = T.P[o + 2 * i], z0 = T.P[o + 2 * i + 1];
    const u = smoother((tau - S.end - 0.25 * T.ph[i]) / (S.relax - 0.25));
    const h = S.hop * 0.6 * E * (1 - u) * Math.abs(Math.sin(Math.PI * (T.nu[i] * tl0 + T.ph[i])));
    plot(g, x0 + (hn.X[j] - x0) * u, z0 + (hn.Z[j] - z0) * u, h, ox, oy);
  }
}

/** The settled time, humming: the bands breathe and waves run along the lines. */
function drawHold(g, str, t, hum, ox, oy) {
  const hs = timeHomes(str);
  const beta = hum * (0.4 * Math.abs(Math.sin(Math.PI * t)) - 0.15);
  const wv = 0.45 * hum;
  for (const h of hs.list) {
    const along = wv * Math.sin(0.7 * h.s - 5.2 * t);
    const x = h.x + h.nx * h.off * beta + h.tx * along;
    const z = h.z + h.nz * h.off * beta + h.tz * along;
    plot(g, x, z, 0, ox, oy);
  }
}

/** A few grains kicked off the lines, skipping across the black and back. */
function drawStrays(g, str, t, hum, ox, oy) {
  if (hum <= 0.05) return;
  const hs = timeHomes(str);
  for (let j = 0; j < 6; j++) {
    const P = 4.1 + j * 0.53, q0 = (t + j * 1.37) / P, cyc = Math.floor(q0), ph = q0 - cyc;
    const ACT = 0.34;
    if (ph > ACT) continue;
    const q = ph / ACT;
    const A = hs.list[Math.floor(hash(cyc, j, 3) * hs.nd)];
    // A landing spot on the same digit's line.
    const k = A.k;
    let B = hs.list[Math.floor(hash(cyc, j, 4) * hs.nd)];
    for (let r = 5; (B.k !== k || Math.abs(B.s - A.s) > 9 || Math.abs(B.s - A.s) < 3) && r < 60; r++) B = hs.list[Math.floor(hash(cyc, j, r) * hs.nd)];
    const e = smoother(q);
    const x = A.x + (B.x - A.x) * e, z = A.z + (B.z - A.z) * e;
    const h = hum * 3.6 * Math.abs(Math.sin(3 * Math.PI * q)) * (1 - 0.55 * q);
    plot(g, x, z, h, ox, oy);
  }
}

// ------------------------------------------------------------ the instrument

const BL = sx(0, SB), BR = sx(PW, SB), FL = sx(0, SF), FR = sx(PW, SF);
const BOW_Z = 50, BOW_S = scaleAt(BOW_Z);
const BOW_X = sx(PW, BOW_S) + 1, BOW_Y = sy(BOW_S);
/** Screen x of the plate's right edge at screen row y. */
const edgeR = (y) => BR + ((FR - BR) * (y - YB)) / (YF - YB);

/**
 * The plate: thin edges, and a front face that blurs where the edge moves.
 * `rim(X)` is the edge's vibration amplitude in px at world x.
 */
function drawPlate(g, rim, t, ox, oy) {
  const y0 = YB + oy, y1 = YF + oy;
  // Back edge: dotted, it is further away.
  // The plate catches the light along its front and fades into the dark
  // towards the back.
  for (let x = Math.ceil(BL); x <= BR; x++) if (x % 5 === 0) g.pixel(x + ox, y0);
  for (let y = YB; y <= YF; y++) {
    const u = (y - YB) / (YF - YB);
    if (((y * 0.618034) % 1) > 0.3 + 0.75 * u * u) continue;
    g.pixel(Math.round(BL + (FL - BL) * u) + ox, y + oy);
    g.pixel(Math.round(BR + (FR - BR) * u) + ox, y + oy);
  }
  const wob = Math.sin(2 * Math.PI * 7.3 * t);
  for (let x = Math.ceil(FL); x <= FR; x++) {
    const X = ((x + 0.5 - CX) / SF) + PW / 2;
    const a = rim(X);
    const sx0 = x + ox;
    g.pixel(sx0, y1);
    // The face's lower edge rides the standing wave.
    const lo = Math.round(y1 + 2 + a * wob);
    g.pixel(sx0, Math.max(y1 + 1, lo));
  }
  g.pixel(Math.round(FL + ox), y1 + 1);
  g.pixel(Math.round(FR + ox), y1 + 1);
}

/** The post under the plate, and the clamp nut on top: the separator. */
function drawPost(g, ox, oy) {
  const cx = Math.round(sx(NUT[0], scaleAt(NUT[1]))) + ox;
  for (let y = YF + 4 + oy; y < H; y++) {
    g.pixel(cx - 3, y); g.pixel(cx + 3, y);
    g.pixel(cx - 2, y);                     // highlight
    if ((y & 1) === 0) g.pixel(cx + 1, y);
  }
  g.hline(cx - 5, YF + 3 + oy, 11); g.hline(cx - 4, YF + 4 + oy, 9);
}

function drawNut(g, ox, oy) {
  const s = scaleAt(NUT[1]);
  const cx = sx(NUT[0], s) + ox, cy = sy(s) + oy;
  g.fillEllipse(cx, cy, 4.6, 3.4, 0);
  // A hex nut, seen from above, with the bolt's end in it.
  const hex = [[cx - 3.9, cy], [cx - 2, cy - 2.9], [cx + 2, cy - 2.9], [cx + 3.9, cy], [cx + 2, cy + 2.9], [cx - 2, cy + 2.9]];
  for (let i = 0; i < 6; i++) g.line(Math.round(hex[i][0] - 0.5), Math.round(hex[i][1] - 0.5), Math.round(hex[(i + 1) % 6][0] - 0.5), Math.round(hex[(i + 1) % 6][1] - 0.5));
  g.fillRect(Math.round(cx - 1.5), Math.round(cy - 1.5), 2, 2);      // the bolt's end
}

// The bow. A stroke a second, changing direction on the second, like a
// pendulum; before a turn it lifts off the edge (the plate rings down), then
// strikes with one long fast stroke, the frog flying up out of sight.
const rhythm = (sec) => 0.6 + 0.17 * Math.cos(Math.PI * sec);
function turnBow(tau, S, hour) {
  const a = S.attack, dur = hour ? 4.4 : 2.6;
  const w = smooth((tau - (a - 1.2)) / 0.5) * (1 - smooth((tau - (a + dur)) / 0.9));
  const lift = smooth((tau - (a - 1.0)) / 0.35) * (1 - smooth((tau - (a - 0.12)) / 0.12));
  let c = 0.6 + 0.36 * smooth((tau - (a - 0.08)) / 0.4) - 0.36 * smooth((tau - (a + 0.5)) / (dur - 0.4));
  if (hour) c += 0.06 * Math.sin(2 * Math.PI * 7 * (tau - a)) * smooth((tau - a - 0.5) / 0.3) * (1 - smooth((tau - (a + dur - 1.2)) / 0.5));
  return [w, c, lift];
}
function bowAt(sec, Sn, Sc, nextHour, curHour) {
  const [w, ct, lift] = sec - 60 >= Sn.attack - 1.4 ? turnBow(sec - 60, Sn, nextHour) : turnBow(sec, Sc, curHour);
  return [rhythm(sec) + (ct - rhythm(sec)) * w, lift];
}

const BOW_LEN = 64, BOW_TILT = 0.36;
const BU = [-Math.sin(BOW_TILT), Math.cos(BOW_TILT)];   // frog -> tip: down and in, under the plate
const BN = [Math.cos(BOW_TILT), Math.sin(BOW_TILT)];    // towards the stick
/** Inside the plate's silhouette (its top and front face), screen coordinates. */
function underPlate(x, y) {
  if (y < YB || y > YF + 2) return false;
  const u = Math.min(1, (y - YB) / (YF - YB));
  return x >= BL + (FL - BL) * u - 0.5 && x <= BR + (FR - BR) * u + 0.5;
}
/**
 * The bow, leaning against the plate's right edge, `c` along its hair from
 * the frog. Past the contact it goes under the plate and is hidden.
 */
function drawBow(g, c, lift, ox, oy) {
  const cx = BOW_X + 3 * lift, cy = BOW_Y;
  const fx = cx - c * BOW_LEN * BU[0], fy = cy - c * BOW_LEN * BU[1];
  const sc = c * BOW_LEN;                         // the contact, along the bow
  const P = (s, e) => [fx + s * BU[0] + e * BN[0] + ox, fy + s * BU[1] + e * BN[1] + oy];
  const camber = (s) => 2.6 + 2.2 * (2 * Math.max(0, s / BOW_LEN) - 1) ** 2;
  g.clip(0, 0, W, H);
  // Past the contact the bow is under the plate: draw only up to it.
  const seg = (a, b) => { g.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1])); };
  // The hair: a fine ribbon, every other pixel, so it reads apart from the stick.
  for (let s = 0.12 * BOW_LEN; s <= sc; s += 1) {
    const [x, y] = P(s, 0);
    if ((Math.round(s) & 1) === 0) g.pixel(Math.floor(x), Math.floor(y));
  }
  const [qx, qy] = P(sc, 0);                                          // where it bites the edge
  g.pixel(Math.floor(qx), Math.floor(qy)); g.pixel(Math.floor(qx) - 1, Math.floor(qy));
  let prev = P(-3, camber(0));                                        // the stick, from the button
  for (let s = 0; s <= sc + 0.01; s += Math.min(4, sc - s || 4)) {
    const q = P(s, camber(s));
    seg(prev, q); prev = q;
    if (s >= sc) break;
  }
  const g0 = 0.13 * BOW_LEN, g1 = 0.23 * BOW_LEN;                     // the grip
  if (g0 < sc) seg(P(g0, camber(g0) + 1), P(Math.min(g1, sc), camber(Math.min(g1, sc)) + 1));
  // The frog: a block between hair and stick, its eye unlit.
  const f1 = Math.min(0.12 * BOW_LEN, sc);
  g.fillPolygon([P(0, -0.8), P(f1, -0.8), P(f1, camber(f1)), P(0, camber(0))]);
  const eye = P(0.06 * BOW_LEN, camber(0) / 2);
  g.pixel(Math.floor(eye[0]), Math.floor(eye[1]), 0);
  g.unclip();
}

// ------------------------------------------------------------ face

const DIG = (c) => `${c.hh}${c.mm}`;
const typeOf = (c) => (c.m === 0 ? 'hour' : 'minute');

export default {
  name: 'Chladni',
  blurb: 'A bowed Chladni plate: sand on its nodal lines is the time. On the minute the bow changes and the sweep shatters it through real Chladni figures into the next; a fortissimo glissando on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const ms = date.getTime();
    const t = (ms % 3600000) / 1000;                       // for the hum's phases
    const cur = f, next = clockFields(new Date(ms + 60000)), prev = clockFields(new Date(ms - 60000));
    const Sn = SCHED[typeOf(next)], Sc = SCHED[typeOf(cur)];
    const sec = f.sec;

    // Which state the sand is in.
    let turn = null, tau = 0;
    if (sec - 60 >= Sn.attack) { turn = turnFor(typeOf(next), DIG(cur), DIG(next), next.minuteKey); tau = sec - 60; }
    else if (sec < Sc.end + Sc.relax) { turn = turnFor(typeOf(cur), DIG(prev), DIG(cur), cur.minuteKey); tau = sec; }
    const hum = Math.min(smooth((Sn.attack - (sec - 60)) / 1.4), smooth((sec - Sc.end - Sc.relax) / 1.6));

    // The front edge's vibration.
    let rim;
    if (turn && tau < turn.S.end) {
      const w = weights(turn.S, turn.figs, tau);
      rim = (X) => {
        let p = 0;
        for (let k = 0; k < turn.figs.length; k++) if (w.c[k] > 0.002) p += w.c[k] * samp(MODE[turn.figs[k]], X, PD - 0.5);
        return w.E * (2.8 * Math.abs(p) + 0.5 * (w.wo + w.wn));
      };
    } else {
      // The hour's landing thuds through the plate.
      const tb = turn && turn.S.rain ? tau - turn.S.end - 1.05 : -1;
      const thud = tb > 0 ? 3 * Math.exp(-tb / 0.25) : 0;
      rim = (X) => (hum * (0.6 + 1.1 * Math.abs(Math.sin(Math.PI * sec))) + thud) * Math.abs(Math.sin((Math.PI * X) / 14 + 0.4));
    }

    drawPlate(g, rim, t, ox, oy);
    if (turn) drawTurn(g, turn, tau, ox, oy);
    else drawHold(g, DIG(cur), t, hum, ox, oy);
    if (!turn) drawStrays(g, DIG(cur), t, hum, ox, oy);
    drawNut(g, ox, oy);

    // The bow: one stroke a second, changing direction on the second; at
    // the turn it lifts off, then strikes with one long fast stroke.
    const [c, lift] = bowAt(sec, Sn, Sc, typeOf(next) === 'hour', typeOf(cur) === 'hour');
    drawBow(g, c, lift, ox, oy);

    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};
