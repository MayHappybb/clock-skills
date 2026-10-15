// Cloud Chamber — the time written by particles in supersaturated vapour.
//
// A diffusion cloud chamber in a magnetic field, seen from above. Nothing is
// drawn as a shape: every lit pixel is condensation on the trail of a
// particle. The numerals are a typeface made of particle events (see the
// glyph table): straight strokes are fast heavy particles, corners are
// decays, forks are pairs, and every terminal is an electron spiralling to a
// stop. Each stroke is a track that is fired again every few seconds, so the
// numerals are always being rewritten: a bright head races along the stroke
// (slowing into the curls, as the particle does), the fresh line blooms,
// drifts on the convection and thins to mist while the next one arrives.
//
// Minutes are big, on the right; hours smaller, top left. Bottom left, a
// needle tipped with an alpha source fires fat short tracks, three a second;
// thin strays (through-going muons, little curling electrons) cross now and
// then.
//
// The minute turn: from :58.9 the old numeral stops being refreshed and
// boils off into mist; at :59.25 a narrow air shower rakes through it; the
// mist is caught in an eddy and carried round onto the strokes of the new
// numeral, which first gathers as fog and then is written crisp by its own
// particles from :00.1. The old numeral is only ever shown before :00.
//
// The hour: a heavy primary flies in and smashes a nucleus between hours and
// minutes at :59.3; a star of secondaries (pions out of the glass, short fat
// protons, spiralling electrons) bursts across the whole chamber, and all
// changing numerals re-condense out of its mist, readable again by :00.8.
//
// frame() is a pure function of the wall clock: every firing is scheduled
// from when its numeral was born, strays and alphas are seeded by their time
// slot. Burn-in: each firing lands where kit.orbit() says at its own instant,
// so the walk never pops. The panel dims from 23:00 to 07:00.

import { dither, noise, clamp, ease, orbit, previousMinute, clockFields } from '../js/kit.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------ the field
// Everything is condensation: tracks splat soft discs into a float field
// (max, not sum) and the field is ordered-dithered onto the glass. A fresh
// track is a thin bright core; as it ages it blooms, drifts and thins out
// into mist.

let FW = 128, FH = 64, F = new Float32Array(FW * FH);
const HALO = 0.42;

function splat(x, y, rc, rh, I) {
  if (I <= 0.02) return;
  const x0 = Math.max(0, Math.floor(x - rh)), x1 = Math.min(FW - 1, Math.floor(x + rh));
  const y0 = Math.max(0, Math.floor(y - rh)), y1 = Math.min(FH - 1, Math.floor(y + rh));
  const span = Math.max(0.05, rh - rc), rh2 = rh * rh;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, row = py * FW;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, d2 = dx * dx + dy * dy;
      if (d2 >= rh2) continue;
      const d = Math.sqrt(d2);
      const q = 1 - (d - rc) / span;
      const v = d <= rc ? I : I * HALO * q * q;
      if (v > F[row + px]) F[row + px] = v;
    }
  }
}

// ------------------------------------------------------------ the typeface
// Every numeral is an event a physicist would recognise, drawn in a 20 x 36
// box (y down; angles are screen degrees, 0 = right, increasing clockwise).
// Straight strokes are fast heavy particles; a kink is a decay; a fork is a
// pair or a V-decay; a curl is an electron slowing down in the field, its
// track thickening and tightening as it stops. So every terminal is a curl.
//   0  an electron caught in the field, one orbit and a bit, spiralling in
//   1  a muon, with a knock-on electron (a delta ray) curling off its top
//   2  a pi- chain: in along the base, kinks up the diagonal, curls over
//   3  e+ e- pair from an unseen gamma: the two curl opposite ways
//   4  a V-decay at the apex, crossed by a passing muon
//   5  pi+ -> mu+ -> e+: two kinks, and the positron spirals
//   6  one long energy-loss spiral; 9 the same, turned over
//   7  a pion decaying in flight: one kink
//   8  a pair whose two legs both close into loops

/** Path builder: points with a weight (track thickness) and a speed factor. */
class Trk {
  constructor(x, y, w = 1, v = 1) { this.p = [[x, y]]; this.w = [w]; this.v = [v]; }
  get last() { return this.p[this.p.length - 1]; }
  heading() {
    const n = this.p.length, a = this.p[n - 2], b = this.p[n - 1];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  push(x, y, w, v) { this.p.push([x, y]); this.w.push(w); this.v.push(v); }
  line(x, y, w1 = this.w.at(-1), v1 = this.v.at(-1)) {
    const [x0, y0] = this.last, w0 = this.w.at(-1), v0 = this.v.at(-1);
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 1.5));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      this.push(x0 + (x - x0) * u, y0 + (y - y0) * u, w0 + (w1 - w0) * u, v0 + (v1 - v0) * u);
    }
    return this;
  }
  /** Circle arc about (cx,cy), radius r shrinking by k over the sweep. */
  arc(cx, cy, r, a0, a1, { k = 1, w1 = this.w.at(-1), v1 = this.v.at(-1), ry = 1 } = {}) {
    const w0 = this.w.at(-1), v0 = this.v.at(-1);
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6));
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = (a0 + (a1 - a0) * u) * DEG, rr = r * (1 + (k - 1) * u);
      const x = cx + rr * Math.cos(a), y = cy + rr * ry * Math.sin(a);
      if (i === 0) { const [lx, ly] = this.last; if (Math.hypot(x - lx, y - ly) < 0.3) continue; }
      this.push(x, y, w0 + (w1 - w0) * u, v0 + (v1 - v0) * u);
    }
    return this;
  }
  /** A faint fast run-in before the first point: the particle came from outside. */
  lead(len) {
    const [[x0, y0], [x1, y1]] = this.p, d = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / d, uy = (y1 - y0) / d, n = Math.ceil(len / 1.5), w = this.w[0], v = this.v[0];
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      this.p.unshift([x0 - ux * len * u, y0 - uy * len * u]);
      this.w.unshift(w + (0.28 - w) * u ** 0.6); this.v.unshift(v * (1 + u));
    }
    return this;
  }
  /** ... and a faint run-out after the last: it left the chamber's bright layer. */
  exit(len) {
    const h = this.heading(), [x0, y0] = this.last, w = this.w.at(-1), v = this.v.at(-1);
    const n = Math.ceil(len / 1.5);
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      this.push(x0 + Math.cos(h) * len * u, y0 + Math.sin(h) * len * u, w + (0.28 - w) * u ** 0.6, v * (1 + u));
    }
    return this;
  }
  /** Spiral on from the current heading: deg > 0 turns clockwise. */
  curl(deg, r0, k = 0.3, w1 = 0.72, v1 = 0.3) {
    let h = this.heading(), [x, y] = this.last;
    const w0 = this.w.at(-1), v0 = this.v.at(-1), s = Math.sign(deg);
    const n = Math.max(3, Math.ceil(Math.abs(deg) / 8));
    for (let i = 1; i <= n; i++) {
      const u = i / n, r = r0 * (1 + (k - 1) * u), da = (Math.abs(deg) / n) * DEG;
      h += s * da / 2; x += r * da * Math.cos(h); y += r * da * Math.sin(h); h += s * da / 2;
      this.push(x, y, w0 + (w1 - w0) * u, v0 + (v1 - v0) * u);
    }
    return this;
  }
}

/** The ten numerals, each a list of tracks (fired in this order). */
const GLYPHS = [
  // 0: one orbit and a bit, closing inside itself into a curl at the top
  () => [new Trk(12.5, 0.6, 0.85, 1.4).arc(10, 18, 9.6, -76, 252, { k: 0.86, ry: 1.82, w1: 1.1, v1: 0.8 }).curl(300, 2.8)],
  // 1: muon down, delta ray off its top
  () => [new Trk(12.4, 0, 1.1, 1.6).line(10.6, 36, 1.1, 1.6).lead(7).exit(6),
    new Trk(12.2, 2.4, 0.7, 1.1).line(7.2, 6.4, 0.75, 0.8).curl(-330, 2.4, 0.3, 0.45)],
  // 2: base right-to-left, kink up the diagonal, curl over the top
  () => [new Trk(19.6, 34.8, 1.0, 1.6).line(1.2, 34.8, 1.0, 1.5).line(16.4, 15.6, 1.0, 1.2)
    .arc(10, 10, 8.4, 41, -175, { k: 0.93, w1: 1.15, v1: 0.6 }).curl(-320, 2.9).lead(7)],
  // 3: pair from the vertex at the middle: e- curls up and over, e+ down and round
  () => [new Trk(4.5, 17, 0.9, 1.2).line(10, 17).arc(10, 9.25, 7.75, 90, -148, { k: 0.95, w1: 1.12, v1: 0.6 }).curl(-310, 2.6),
    new Trk(4.5, 17, 0.9, 1.2).line(10, 17).arc(10, 26.2, 9.2, -90, 150, { k: 0.94, w1: 1.12, v1: 0.6 }).curl(320, 2.9)],
  // 4: V-decay at the apex (diagonal and stem), a muon across
  () => [new Trk(13.4, 0.4, 1.0, 1.3).line(1.0, 25, 1.05, 1.2),
    new Trk(13.4, 0.4, 1.0, 1.3).line(13.9, 36, 1.1, 1.2).exit(6),
    new Trk(0, 25, 1.0, 1.8).line(20, 25).lead(6).exit(6)],
  // 5: pion along the top, kink: muon down, kink: positron spirals round the bowl
  () => [new Trk(19.4, 1.2, 1.0, 1.6).line(3.8, 1.2).line(2.8, 16.2, 1.05, 1.2)
    .arc(9.6, 24.6, 8.9, -118, 148, { k: 0.93, w1: 1.15, v1: 0.6 }).curl(320, 2.9).lead(7)],
  // 6: in from the top right, a long spiral down the left, closing the bowl
  () => [spiral6(false)],
  // 7: pion along the top, decays in flight down the diagonal
  () => [new Trk(0.6, 1.2, 1.0, 1.7).line(19.4, 1.2).line(8.2, 36, 1.1, 1.4).lead(7).exit(6)],
  // 8: pair at the waist; both legs close into loops
  () => [new Trk(10, 17.2, 0.9, 1.2).arc(10, 9.6, 7.6, 90, -262, { k: 0.86, w1: 1.15, v1: 0.6 }).curl(-200, 2.2),
    new Trk(10, 17.2, 0.9, 1.2).arc(10, 26.4, 9.2, -90, 262, { k: 0.86, w1: 1.15, v1: 0.6 }).curl(200, 2.4)],
  // 9: the 6 turned over
  () => [spiral6(true)],
];

function spiral6(turn) {
  // centre of the bowl; the stem is the outer, faster turn of the same spiral
  const cx = 10.4, cy = 25.2, t = new Trk(0, 0, 0.85, 1.6);
  t.p = []; t.w = []; t.v = [];
  const a0 = -78, a1 = -180, a2 = -505, r0 = 22.5, r1 = 9.0, r2 = 7.4;
  const n1 = 20, n2 = 54;
  for (let i = 0; i <= n1; i++) {
    const u = i / n1, a = (a0 + (a1 - a0) * u) * DEG, r = r0 * (r1 / r0) ** u;
    t.push(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.85 + 0.15 * u, 1.6 - 0.4 * u);
  }
  for (let i = 1; i <= n2; i++) {
    const u = i / n2, a = (a1 + (a2 - a1) * u) * DEG, r = r1 + (r2 - r1) * u;
    t.push(cx + r * Math.cos(a), cy + r * Math.sin(a), 1.0 + 0.15 * u, 1.2 - 0.6 * u);
  }
  t.curl(-200, 2.3);
  t.p.length && t.lead(6);
  if (turn) t.p = t.p.map(([x, y]) => [20 - x, 36 - y]);
  return t;
}

// ------------------------------------------------------------ track instances
// A glyph at a size: its tracks resampled every half pixel, each sample with
// its weight and the time after the firing at which the particle passes it
// (the head slows where the particle does: into the curls).

const STEP = 0.5;
const instCache = new Map();
function instance(d, size) {
  const key = d * 100 + size.id;
  let inst = instCache.get(key);
  if (inst) return inst;
  inst = GLYPHS[d]().map((trk) => resample(trk, size));
  instCache.set(key, inst);
  return inst;
}

function resample(trk, { s, slant, v0 }) {
  const P = trk.p.map(([x, y]) => [(x + slant * (36 - y)) * s, y * s]);
  const X = [], Y = [], W = [], B = [], S = [];
  let t = 0, acc = 0, len = 0;
  X.push(P[0][0]); Y.push(P[0][1]); W.push(trk.w[0]); B.push(0); S.push(0);
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], seg = Math.hypot(bx - ax, by - ay);
    let u = (STEP - acc);
    while (u <= seg) {
      const k = u / seg;
      const v = v0 * (trk.v[i - 1] + (trk.v[i] - trk.v[i - 1]) * k);
      t += STEP / v; len += STEP;
      X.push(ax + (bx - ax) * k); Y.push(ay + (by - ay) * k);
      W.push(trk.w[i - 1] + (trk.w[i] - trk.w[i - 1]) * k); B.push(t); S.push(len);
      u += STEP;
    }
    acc = seg - (u - STEP);
  }
  return { X, Y, W, B, S, n: X.length, dur: t };
}

// ------------------------------------------------------------ drawing a trail
// One firing of one track, seen `age0` seconds after it fired. `st` is the
// look: core and halo radii as it blooms, how long it lives, how it drifts.

const STYLE = {
  big: { rc0: 0.55, rc1: 1.75, rh0: 1.1, rh1: 2.7, spread: 0.35, I0: 1.5, hold: 1.1, tau: 1.3, life: 4.0, drift: 1, head: 2.4 },
  small: { minW: 0.6, rc0: 0.5, rc1: 1.3, rh0: 0.9, rh1: 2.0, spread: 0.2, I0: 1.5, hold: 1.6, tau: 1.5, life: 4.8, drift: 0.8, head: 1.8 },
  stray: { rc0: 0.3, rc1: 0.55, rh0: 0.7, rh1: 1.5, spread: 0.3, I0: 1.2, hold: 0.2, tau: 0.8, life: 2.2, drift: 1.2, head: 0.9 },
  alpha: { rc0: 0.5, rc1: 0.95, rh0: 0.9, rh1: 1.7, spread: 0.4, I0: 1.5, hold: 0.35, tau: 0.6, life: 2.2, drift: 1, head: 1.3 },
};

let NOW = 0;
/** The convection the mist drifts in (px/s), slow and smooth. */
function wind(x, y) {
  const u = NOW * 0.21;
  return [0.35 + 0.55 * Math.sin(y * 0.085 + u) , -0.55 + 0.4 * Math.sin(x * 0.061 - u * 1.3)];
}

/**
 * Draw one firing of `tr` at offset (ox, oy), fired at absolute time `t0`.
 * mod: { evap 0..1 (the trail boils off into mist), gain, seed }
 */
function trail(tr, ox, oy, t0, st, mod = {}) {
  const age0 = NOW - t0;
  if (age0 <= 0) return;
  const evap = mod.evap ?? 0, gain = mod.gain ?? 1, seed = mod.seed ?? 0;
  const jit = 0.45 * (noise(seed, 3) - 0.5), jph = noise(seed, 4) * 6.28;
  let head = -1;
  for (let i = 0; i < tr.n; i += 1) {
    const a = age0 - tr.B[i];
    if (a < 0) break;
    head = i;
    if (a > st.life) continue;
    if (a > 0.45 && (i & 1) && i < tr.n - 1) continue;      // bloomed: half the samples will do
    const x0 = tr.X[i] + ox, y0 = tr.Y[i] + oy;
    if (x0 < -6 || y0 < -6 || x0 > FW + 6 || y0 > FH + 6) continue;
    const w = tr.W[i];
    if (w < (st.minW ?? 0)) continue;
    const bloom = 1 - Math.exp(-a / 0.4);
    let rc = st.rc0 + (st.rc1 * w - st.rc0) * bloom;
    let rh = st.rh0 + (st.rh1 * w - st.rh0) * bloom + st.spread * a;
    let I = st.I0 * (a < st.hold ? 1 : Math.exp(-(a - st.hold) / st.tau)) * gain;
    const fadeEnd = clamp((st.life - a) / 0.8, 0, 1);
    I *= fadeEnd;
    // the age-old mist drifts on the convection and wanders a little
    const [wx, wy] = wind(x0, y0);
    const s = tr.S[i];
    const wob = 0.16 * a * a * st.drift;
    const dr = (0.25 * a + 0.22 * a * a) * st.drift;
    let x = x0 + wx * dr + wob * Math.sin(s * 0.38 + jph + NOW * 0.9) + jit * Math.sin(s * 0.11 + jph);
    let y = y0 + wy * dr + wob * Math.cos(s * 0.31 - jph + NOW * 0.7) + jit * Math.cos(s * 0.13 + jph);
    if (evap > 0) {
      const e = evap;
      rc *= (1 - e) * (1 - e);
      rh += 3.2 * e;
      I *= 1 - e * 0.55;
      x += e * e * 4 * Math.sin(s * 0.5 + jph) + e * 2.0;
      y += e * e * (-3.5 + 2.5 * Math.cos(s * 0.43 + jph));
    }
    splat(x, y, rc, rh, I);
  }
  // the particle itself: a bright point at the head while it is still flying
  if (head >= 0 && head < tr.n - 1 && evap === 0) {
    splat(tr.X[head] + ox, tr.Y[head] + oy, st.head * 0.6, st.head * 1.3, 2 * gain);
  }
}

// ------------------------------------------------------------ the time
const MIN = { id: 1, s: 1.3, slant: 0.07, v0: 150 };
const HOUR = { id: 2, s: 0.8, slant: 0.07, v0: 120 };
const SLOTS = [
  { size: HOUR, st: 'small', x: 6, y: 3, P: 3.2 },
  { size: HOUR, st: 'small', x: 26, y: 3, P: 3.2 },
  { size: MIN, st: 'big', x: 62, y: 8, P: 2.4 },
  { size: MIN, st: 'big', x: 94, y: 8, P: 2.4 },
];
const digitsOf = (f) => [Math.floor(f.h / 10), f.h % 10, Math.floor(f.m / 10), f.m % 10];

/** When the digit now in slot i was born (absolute seconds). */
function birthOf(i, f, Tmin) {
  const hourStart = Tmin - f.m * 60;
  return [hourStart - (f.h % 10) * 3600, hourStart, Tmin - (f.m % 10) * 60, Tmin][i];
}

const EVAP = 1.1;           // the old digit boils off over this long before :00
const fireAt = (k) => 0.12 + 0.3 * k;   // condensation order of a glyph's tracks

/** Draw one glyph living from `born`; `dies` is when it is replaced (or Infinity). */
function glyph(slot, d, born, dies) {
  const inst = instance(d, slot.size), st = STYLE[slot.st];
  const evap = clamp((NOW - (dies - EVAP)) / (EVAP - 0.08), 0, 1);
  const e = ease.inQuad(evap);
  inst.forEach((tr, k) => {
    const first = born + fireAt(k);
    const lastFire = Math.min(NOW, dies - EVAP - 0.1);
    const j0 = Math.max(0, Math.ceil((NOW - first - st.life - tr.dur) / slot.P));
    const j1 = Math.floor((lastFire - first) / slot.P);
    for (let j = j0; j <= j1; j++) {
      const t0 = first + j * slot.P;
      const [ox, oy] = orbit(new Date(t0 * 1000));
      const seed = Math.floor(t0 * 7.3) % 9973;
      trail(tr, slot.x + ox, slot.y + oy, t0, st, { evap: e, gain: (1 - e) ** 1.4, seed });
      if (e === 0) deltaRay(tr, slot.x + ox, slot.y + oy, t0, seed, slot.size.s);
    }
  });
  // condensation: before its particles arrive, a new numeral gathers as fog
  const since = NOW - born;
  if (since >= 0 && since < 2.6 && born > 0) {
    const c = ease.outQuad(clamp(since / 0.45, 0, 1)) * (1 - clamp((since - 1.0) / 1.2, 0, 1));
    const rh = 4.2 - 2.2 * ease.outCubic(clamp(since / 1.2, 0, 1));
    const [ox, oy] = orbit(new Date(born * 1000 + 300));
    for (const tr of inst)
      for (let i = 0; i < tr.n; i += 3) splat(tr.X[i] + slot.x + ox, tr.Y[i] + slot.y + oy - 1.5 * (1 - c), 0, rh, 0.42 * c);
  }
}

/**
 * Now and then the particle knocks an electron out of the gas as it passes:
 * a delta ray, a hair-thin curl that springs off the stroke and fades fast.
 */
const DELTA_ST = { rc0: 0.3, rc1: 0.5, rh0: 0.6, rh1: 1.2, spread: 0.25, I0: 1.3, hold: 0.25, tau: 0.45, life: 1.4, drift: 1.2, head: 0.6 };
function deltaRay(tr, ox, oy, t0, seed, sc) {
  if (noise(seed, 81) > 0.45) return;
  const i = Math.floor(tr.n * (0.15 + 0.7 * noise(seed, 82)));
  if (i < 2 || NOW - t0 - tr.B[i] < 0 || NOW - t0 - tr.B[i] > DELTA_ST.life + 0.5) return;
  const h = Math.atan2(tr.Y[i] - tr.Y[i - 2], tr.X[i] - tr.X[i - 2]) + (noise(seed, 83) < 0.5 ? -1 : 1) * (0.6 + 0.5 * noise(seed, 84));
  const x = tr.X[i] + ox, y = tr.Y[i] + oy, L = (1.5 + noise(seed, 85) * 2) * sc;
  const trk = new Trk(x, y, 0.6, 1).line(x + Math.cos(h) * L, y + Math.sin(h) * L)
    .curl((noise(seed, 86) < 0.5 ? -1 : 1) * (300 + noise(seed, 87) * 250), (1.4 + noise(seed, 88)) * sc, 0.25, 0.6, 0.4);
  trail(ad(trk, 60), 0, 0, t0 + tr.B[i], DELTA_ST, { seed });
}

function drawTime(f, date, T) {
  const Tmin = Math.floor(T / 60) * 60;
  const cur = digitsOf(f), prev = digitsOf(previousMinute(date));
  const next = digitsOf(clockFields(new Date((Tmin + 60) * 1000)));
  for (let i = 0; i < 4; i++) {
    const slot = SLOTS[i];
    const born = birthOf(i, f, Tmin);
    const dies = next[i] !== cur[i] ? Tmin + 60 : Infinity;
    glyph(slot, cur[i], born, dies);
    // the turn: before :00 toward the next numeral, after it from the last one
    const seed = Math.floor(Tmin / 60) * 4 + i;
    // (on the hour the nuclear star does the showers' work)
    const hourTurn = next[1] !== cur[1] || prev[1] !== cur[1];
    if (dies !== Infinity) { whirl(slot, cur[i], next[i], NOW - dies, dies, seed + 4); if (!hourTurn) shower(slot, NOW - dies, seed + 4); }
    if (prev[i] !== cur[i]) { whirl(slot, prev[i], cur[i], NOW - Tmin, Tmin, seed); if (!hourTurn) shower(slot, NOW - Tmin, seed); }
  }
}

// ------------------------------------------------------------ the chamber's life
const RAW = { id: 0, s: 1, slant: 0, v0: 1 };
const ad = (trk, v0) => resample(trk, { ...RAW, v0 });

/** Rare, thin stray cosmic rays: through-going muons and slow curling electrons. */
const STRAY_DT = 1.1;
function strays(T) {
  const k1 = Math.floor(T / STRAY_DT);
  for (let k = k1 - 3; k <= k1; k++) {
    if (noise(k, 11) > 0.62) continue;
    const t0 = k * STRAY_DT + noise(k, 12) * STRAY_DT * 0.8;
    if (t0 > T) continue;
    const r = (j) => noise(k, 20 + j);
    let trk;
    if (r(0) < 0.62) {
      // a muon straight through, edge to edge
      const a = (r(1) * 2 - 1) * 0.9 + (r(2) < 0.5 ? 0 : Math.PI);
      const cx = 20 + r(3) * 88, cy = 12 + r(4) * 40, L = 85;
      trk = new Trk(cx - Math.sin(a) * L, cy - Math.cos(a) * L, 0.55, 1).line(cx + Math.sin(a) * L, cy + Math.cos(a) * L);
      trail(ad(trk, 900), 0, 0, t0, STYLE.stray, { seed: k });
    } else {
      // a slow electron: a few millimetres and then a tightening spiral
      const h = r(1) * 6.283, x = 8 + r(2) * 112, y = 6 + r(3) * 52;
      trk = new Trk(x, y, 0.5, 1).line(x + Math.cos(h) * 5, y + Math.sin(h) * 5).curl((r(4) < 0.5 ? -1 : 1) * (380 + r(5) * 260), 2.6 + r(6) * 2.4, 0.18, 0.75, 0.35);
      trail(ad(trk, 120), 0, 0, t0, STYLE.stray, { seed: k });
    }
  }
}

/**
 * The heartbeat: a needle dipped in an alpha emitter pokes in from the left
 * wall, and every second it fires one fat, short, dead-straight track into
 * the chamber (alphas all stop at about the same range).
 */
const SRC = [25, 52];
function alphas(T, ox, oy) {
  const RATE = 3, n1 = Math.floor(T * RATE);
  const tx = SRC[0] + ox, ty = SRC[1] + oy;
  for (let n = n1 - 7; n <= n1; n++) {
    const a = n * 2.39996 + (noise(n, 30) - 0.5) * 0.5, L = 7.5 + noise(n, 31) * 3;
    const x0 = tx + Math.cos(a) * 2, y0 = ty + Math.sin(a) * 2;
    const trk = new Trk(x0, y0, 1, 1).line(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, 1.15, 0.7);
    trail(ad(trk, 90), 0, 0, (n + noise(n, 32) * 0.6) / RATE, STYLE.alpha, { seed: n });
  }
  // the bead of source on the needle's tip (the needle is below the light)
  splat(tx, ty, 1.0, 1.7, 1.3);
}

/** Points along a glyph, in screen coordinates, for the mist to travel between. */
function glyphPoints(d, slot, ox, oy, N) {
  const inst = instance(d, slot.size), pts = [];
  let total = 0;
  for (const tr of inst) total += tr.n;
  for (let j = 0; j < N; j++) {
    let idx = Math.floor(((j + 0.5) / N) * total);
    for (const tr of inst) {
      if (idx < tr.n) { pts.push([tr.X[idx] + slot.x + ox, tr.Y[idx] + slot.y + oy]); break; }
      idx -= tr.n;
    }
  }
  const cx = slot.x + ox + 10 * slot.size.s, cy = slot.y + oy + 18 * slot.size.s;
  return pts.map(([x, y]) => [Math.atan2(y - cy, x - cx), Math.hypot(x - cx, y - cy)])
    .sort((p, q) => p[0] - q[0]).map((p) => [...p, cx, cy]);
}

/**
 * The minute turn's vapour: the old numeral's mist is caught in an eddy and
 * carried round onto the new numeral's strokes. tau = seconds from :00.
 */
function whirl(slot, dOld, dNew, tau, Tmin, seed) {
  const u0 = (tau + 0.75) / 1.6;
  if (u0 <= 0 || u0 >= 1) return;
  const u = ease.inOutCubic(u0);
  const N = slot.size === MIN ? 30 : 18;
  const [ax, ay] = orbit(new Date((Tmin - 1) * 1000)), [bx, by] = orbit(new Date((Tmin + 1) * 1000));
  const A = glyphPoints(dOld, slot, ax, ay, N), B = glyphPoints(dNew, slot, bx, by, N);
  const spin = (noise(seed, 41) < 0.5 ? -1 : 1) * Math.PI * 1.3;
  const vis = Math.sin(Math.PI * u0) ** 0.8;
  for (let j = 0; j < N; j++) {
    const [ta, ra, cx, cy] = A[j], [tb, rb] = B[(j + Math.floor(seed % 7)) % N];
    let dt = tb - ta;
    dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI;
    for (let q = 0; q < 7; q++) {
      const lag = clamp(u * 1.15 - (j / N) * 0.15 - q * 0.03, 0, 1);
      const th = ta + dt * lag + spin * Math.sin(Math.PI * lag);
      const rr = (ra + (rb - ra) * lag) * (1 - 0.18 * Math.sin(Math.PI * lag)) + 2.5 * Math.sin(Math.PI * lag);
      const wob = 0.8 * Math.sin(j * 1.7 + lag * 9);
      splat(cx + Math.cos(th) * rr + wob, cy + Math.sin(th) * rr * 1.05, q ? 0.35 : 0.6, q ? 1.1 : 2.0, (1 - q * 0.12) * vis);
    }
  }
}

/** The burst that wipes a turning numeral: a narrow air shower through it. */
const SHOWER_ST = { ...STYLE.stray, hold: 0.1, tau: 0.35, life: 1.2 };
function shower(slot, tau, seed) {
  const t0 = -0.75;
  if (tau < t0 || tau > t0 + 2.4) return;
  const mk = Math.floor(seed / 4) * 4;
  const a = (0.12 + noise(mk, 51) * 0.3) * (noise(mk, 52) < 0.5 ? -1 : 1);
  const cx = slot.x + 10 * slot.size.s, cy = slot.y + 18 * slot.size.s, n = slot.size === MIN ? 4 : 3;
  const sx = Math.sin(a), sy = Math.cos(a), L = 80;
  for (let j = 0; j < n; j++) {
    const off = (j - (n - 1) / 2) * 6.5 + (noise(seed + j, 53) - 0.5) * 3;
    const px = cx + sy * off, py = cy - sx * off;
    const trk = new Trk(px - sx * L, py - sy * L, 0.6, 1).line(px + sx * L, py + sy * L);
    trail(ad(trk, 800), 0, 0, NOW - (tau - t0) + j * 0.04, SHOWER_ST, { seed: seed + j });
  }
}

/**
 * The hour: a heavy primary from outside smashes a nucleus in the gas, and a
 * star of secondaries flies out across the whole chamber, through all four
 * numerals: pions straight out of the glass, protons short and fat,
 * electrons spiralling. Returns the flash, for the contrast.
 */
const STAR = [50, 40];
const STAR_ST = { rc0: 0.45, rc1: 1.0, rh0: 0.9, rh1: 1.8, spread: 0.3, I0: 1.5, hold: 0.45, tau: 0.6, life: 2.5, drift: 1.3, head: 1.2 };
function star(tau, seed) {
  if (tau < -1.4 || tau > 4.5) return 0;
  const t0 = NOW - tau;
  const [vx, vy] = STAR;
  const pa = -2.2 + noise(seed, 61) * 0.5;
  const prim = new Trk(vx + Math.cos(pa) * 110, vy + Math.sin(pa) * 110, 1.5, 1).line(vx, vy, 1.7, 1);
  trail(ad(prim, 400), 0, 0, t0 - 0.98, STYLE.alpha, { seed });
  const tv = t0 - 0.72;
  const n = 15;
  for (let j = 0; j < n; j++) {
    const r = (q) => noise(seed * 31 + j, 70 + q);
    const h = (j / n) * 6.283 + (r(0) - 0.5) * 0.35;
    const kind = j % 3;
    let trk;
    if (kind === 0) trk = new Trk(vx, vy, 0.45, 1).line(vx + Math.cos(h) * 100, vy + Math.sin(h) * 100, 0.4, 1.4);
    else if (kind === 1) trk = new Trk(vx, vy, 0.9, 1).line(vx + Math.cos(h) * (8 + r(1) * 9), vy + Math.sin(h) * (8 + r(1) * 9), 1.2, 0.5);
    else trk = new Trk(vx, vy, 0.45, 1).line(vx + Math.cos(h) * (10 + r(2) * 12), vy + Math.sin(h) * (10 + r(2) * 12))
      .curl((j % 2 ? 1 : -1) * (420 + r(3) * 300), 3 + r(4) * 3.5, 0.2, 0.5, 0.3);
    trail(ad(trk, kind === 0 ? 260 : 110), 0, 0, tv + r(5) * 0.06, STAR_ST, { seed: seed + j });
  }
  if (NOW > tv) splat(vx, vy, 1.6 * clamp(1 - (NOW - tv) / 0.6, 0, 1) + 0.4, 6 * clamp(1 - (NOW - tv) / 0.5, 0, 1) + 0.5, 1.4);
  return clamp(1 - Math.abs(NOW - tv - 0.05) / 0.35, 0, 1);
}

// ------------------------------------------------------------ the face
export default {
  name: 'Cloud Chamber',
  blurb: 'A cloud chamber in a magnetic field: numerals made of particle events (decay kinks, pair forks, spiralling electrons) rewritten by their own tracks every few seconds; each minute the old one boils into mist that eddies onto the new, and on the hour a nuclear star bursts across the chamber.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const T = date.getTime() / 1000;
    NOW = T;
    F.fill(0);
    drawTime(f, date, T);
    strays(T);
    const [ox, oy] = orbit(date, 2, 4);
    alphas(T, ox, oy);
    // the hour: a nuclear star at the turn (before :00 if the hour is about to turn)
    const Tmin = Math.floor(T / 60) * 60, tm = T - Tmin;
    let flash = 0;
    if (f.m === 0) flash = star(tm, Math.floor(T / 3600));
    else if (f.m === 59) flash = star(tm - 60, Math.floor(T / 3600) + 1);
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const v = F[y * FW + x];
        if (v > 0.012 && dither(x, y, Math.min(1, v))) g.pixel(x, y, 1);
      }
    oled.contrast(Math.min(255, 0xcf + 0x30 * flash) + (0x20 - 0xcf) * night);
  },
};

/**
 * For review (out/cloudchamber-digits.png): the ten numerals at minute and
 * hour size, `since` seconds after they condensed. Draws into a canvas of
 * any size (the sheet is wider than the glass).
 */
export function drawDigitSheet(g, since = 5) {
  FW = g.width; FH = g.height; F = new Float32Array(FW * FH);
  const born = 1e6;
  NOW = born + since;
  for (let d = 0; d < 10; d++) {
    glyph({ ...SLOTS[2], x: 3 + d * 30, y: 3 }, d, born - 0.001 * d, Infinity);
    glyph({ ...SLOTS[0], x: 7 + d * 30, y: 62 }, d, born, Infinity);
  }
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) if (dither(x, y, Math.min(1, F[y * FW + x]))) g.pixel(x, y, 1);
  FW = 128; FH = 64; F = new Float32Array(FW * FH);
}
