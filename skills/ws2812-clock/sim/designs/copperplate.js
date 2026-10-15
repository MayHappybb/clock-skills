// Copperplate: a candlelit slip of paper on which a pointed dip pen writes
// the time in copperplate script. The two parallelograms make one long
// italic band, and their 61-degree lattice is the script's own slant: every
// glyph is drawn upright in lattice coordinates, so it comes out italic.
//
// The hour is written large; the minutes are raised and smaller, as a
// copperplate hand writes a superscript, and are underlined by a paraph: a
// flourish the pen writes all minute long, one pulse per second, looping
// round the right end of the band and back under the minutes. Downstrokes
// swell where the nib flexes, upstrokes are hairlines, and ink pools at
// ball terminals. Fresh ink is wet and glossy (it catches the candle) and
// dries over half a minute to matte sepia.
//
// Minute turn: a rocker blotter rolls along the band (its contact line on
// the 61-degree slant) over the changed digits and the old paraph and lifts
// them; the nib follows close behind and writes the new digits stroke by
// stroke, then starts a new paraph. Everything that changes is lifted
// before anything new is written, so old and new never mix into a wrong time.
// Hour: the blotter rolls the whole band, the hurried hand writes the new
// time, pounce sand is shaken along the band in a glittering stream and
// drinks the wet gloss, then a drop of hot wax lands where the paraph's loop
// will go and a brass seal presses it; the wax glows, cools and darkens
// while the new paraph is written round it.
//
// Stateless: everything is a function of the wall clock; the pen's script
// for each minute is built once and cached.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------ geometry
// Lattice coordinates (a, b): a counts columns along a row (board 1 starts
// at 16 + the seam's extra 0.578 pitch), b counts rows down (0..7).
const P = 2.55, ANG = (61 * Math.PI) / 180;
const CS = P * Math.cos(ANG), SN = P * Math.sin(ANG);
const SEAM = 42.275 / P - 16;
const LW = (a, b) => [-21.1375 + (a - 7.5) * P - (b - 3.5) * CS, (b - 3.5) * SN];
const latA = (l) => l.col + (l.panel === 1 ? 16 + SEAM : 0);

// ------------------------------------------------------------ the digits
// Copperplate numerals in a 4 x 7 box (a right, b down), one or more pen
// strokes each, as points [a, b, w]: w is the nib's flex (0 hairline,
// 1 full shade, >1 a ball terminal where ink pools).
const GLYPHS = {
  0: [[[2.5, 0.05, 0], [1.3, 0.4, 0.2], [0.5, 2.0, 0.8], [0.35, 4.2, 1], [0.8, 6.2, 0.6], [1.8, 7, 0], [3.0, 6.5, 0.1], [3.65, 4.6, 0.35], [3.6, 2.2, 0.3], [3.1, 0.5, 0], [2.5, 0.05, 0], [1.7, 0.4, 0]]],
  1: [[[0.9, 1.9, 0], [1.9, 0.9, 0], [2.9, 0.0, 0.2], [2.75, 1.8, 0.8], [2.55, 3.8, 1], [2.35, 5.6, 0.6], [2.2, 7.0, 0.15]]],
  2: [[[0.9, 1.6, 1.3], [0.8, 0.7, 0.1], [1.8, 0.0, 0], [3.1, 0.3, 0], [3.6, 1.5, 0.4], [3.0, 3.2, 1], [1.6, 5.0, 1], [0.5, 6.4, 0.5], [0.6, 7.0, 0], [1.6, 6.6, 0], [2.6, 6.8, 0], [3.8, 6.6, 0.2]]],
  3: [[[0.7, 1.3, 1.3], [1.1, 0.3, 0], [2.2, 0.0, 0], [3.2, 0.5, 0.2], [3.3, 1.7, 0.8], [2.6, 2.9, 0.5], [1.6, 3.3, 0], [2.7, 3.6, 0.2], [3.6, 4.7, 1], [3.4, 6.2, 0.7], [2.3, 7.0, 0], [1.0, 6.8, 0], [0.4, 6.0, 0.6], [0.5, 5.4, 1.3]]],
  4: [[[1.7, 0.0, 0.5], [1.2, 1.8, 0.9], [0.6, 3.6, 0.7], [0.3, 4.7, 0.3], [1.5, 4.8, 0.5], [3.0, 4.7, 0.5], [4.2, 4.3, 0.3]],
      [[3.9, 0.3, 0.6], [3.5, 2.8, 1], [3.1, 5.4, 1], [2.8, 7.0, 0.3]]],
  5: [[[1.5, 0.1, 0.4], [1.25, 1.6, 1], [1.0, 3.1, 0.3], [1.9, 2.7, 0], [3.0, 2.9, 0.2], [3.6, 4.3, 1], [3.3, 6.0, 0.8], [2.2, 7.0, 0], [1.0, 6.8, 0], [0.4, 6.0, 0.5], [0.5, 5.4, 1.3]],
      [[1.5, 0.1, 0], [2.6, 0.15, 0.3], [3.9, 0.0, 0.6]]],
  6: [[[3.5, 0.9, 1.3], [3.2, 0.2, 0], [2.2, 0.0, 0], [1.1, 0.6, 0.3], [0.45, 2.5, 0.9], [0.35, 4.6, 1], [0.9, 6.4, 0.5], [2.0, 7.0, 0], [3.1, 6.5, 0], [3.6, 5.0, 0.3], [3.0, 3.8, 0], [1.8, 3.7, 0], [0.6, 4.5, 0]]],
  7: [[[0.3, 0.9, 0.6], [0.8, 0.2, 0], [1.8, 0.2, 0], [2.8, 0.5, 0], [3.9, 0.0, 0.3], [3.2, 1.8, 0.9], [2.4, 3.8, 1], [1.8, 5.6, 0.8], [1.5, 7.0, 0.3]]],
  8: [[[3.3, 0.9, 0.3], [2.8, 0.1, 0], [1.7, 0.0, 0], [0.8, 0.7, 0.2], [1.0, 2.0, 0.5], [2.0, 3.2, 1], [3.2, 4.4, 1], [3.5, 5.8, 0.7], [2.8, 6.9, 0.1], [1.6, 7.0, 0.2], [0.5, 6.2, 0.35], [0.6, 4.9, 0.3], [1.6, 3.9, 0.2], [2.8, 2.8, 0.2], [3.5, 1.7, 0.3], [3.3, 0.9, 0.2]]],
  9: [[[3.3, 0.7, 0], [2.5, 0.0, 0], [1.3, 0.2, 0.2], [0.5, 1.4, 0.8], [0.6, 2.9, 0.4], [1.6, 3.6, 0], [2.8, 3.3, 0], [3.4, 2.2, 0], [3.5, 0.9, 0]],
      [[3.6, 0.4, 0.5], [3.4, 2.6, 1], [3.0, 4.8, 1], [2.4, 6.4, 0.6], [1.4, 7.0, 0], [0.6, 6.6, 0.4], [0.6, 6.0, 1.3]]],
};
// where each digit goes: origin (a, b) of its box and its scale
const SLOTS = [
  { a: 0.6, b: 0, s: 1 }, { a: 5.9, b: 0, s: 1 },           // hours, full height
  { a: 12.2, b: 0, s: 0.79 }, { a: 17.3, b: 0, s: 0.79 },   // minutes, raised
];

// The paraph (the seconds): an underline under the minutes that runs on into a loop at
// the right end (where the hour's seal lands) and curls inside it.
const PARAPH = [[12.0, 6.6, 0.5], [13.2, 7.35, 0.3], [16.0, 7.4, 0.7], [19.5, 7.35, 0.4], [23.0, 7.15, 0], [26.5, 6.7, 0.2],
  [29.5, 6.3, 0.3], [31.5, 5.0, 0.2], [31.8, 3.4, 0], [30.8, 2.0, 0], [28.4, 1.5, 0], [25.8, 1.8, 0.2], [24.1, 2.8, 0.8],
  [23.8, 4.4, 1], [24.8, 5.6, 0.5], [26.5, 5.7, 0], [27.5, 4.9, 0.3]];
const SEAL = { a: 27.6, b: 4.1, r: 5.4 };

// ------------------------------------------------------------ pen and ink
const R0 = 0.3, R1 = 0.8, SIG = 0.6;            // nib half-width, mm: hairline, + full shade; ink edge
const DRY = kit.hex('#b85a22'), HAIR = kit.hex('#e0a868'), WET = kit.hex('#f2b060'), GLOSS = [1, 0.86, 0.6];
const STEEL = [0.3, 0.34, 0.42];
const PAPER = [0.026, 0.016, 0.0065], BLOT = kit.hex('#e8b4a4');

/** Catmull-Rom through lattice points [a, b, w], sampled every ~0.25 mm in world. */
function sampleStroke(pts) {
  const out = [];
  const W = pts.map(([a, b, w]) => [...LW(a, b), w]);
  for (let i = 0; i + 1 < W.length; i++) {
    const p0 = W[Math.max(0, i - 1)], p1 = W[i], p2 = W[i + 1], p3 = W[Math.min(W.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([cr(0), cr(1), kit.lerp(p1[2], p2[2], t)]);
    }
  }
  const z = W[W.length - 1];
  out.push([z[0], z[1], z[2]]);
  return out;
}

/**
 * A piece of writing: strokes (lattice point lists) -> pen samples timed
 * over 0..1, and per-LED ink entries in time order (only those that raise
 * the LED's coverage). Shaded strokes are written slower; between strokes
 * the pen lifts and travels.
 */
function makeItem(ctx, strokes, scale = 1, gain = 1) {
  const S = [];                                     // [x, y, w, cost, on]
  strokes.forEach((st, si) => {
    const pts = sampleStroke(st);
    if (si > 0) {                                   // pen lifted: travel in air
      const [px, py] = S[S.length - 1], [qx, qy] = pts[0], d = Math.hypot(qx - px, qy - py);
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let k = 1; k < n; k++) S.push([kit.lerp(px, qx, k / n), kit.lerp(py, qy, k / n), 0, (d / n) * 0.45 + 2.5 / n, 0]);
    }
    pts.forEach((p, k) => {
      const prev = k ? pts[k - 1] : p;
      S.push([p[0], p[1], p[2], Math.hypot(p[0] - prev[0], p[1] - prev[1]) * (1 + 1.4 * Math.min(1, p[2])), 1]);
    });
  });
  let tot = 0;
  for (const s of S) { tot += s[3]; s[3] = tot; }
  for (const s of S) s[3] /= tot;                    // time 0..1
  const best = new Map(), ent = [];
  for (const [x, y, w, t, on] of S) {
    if (!on) continue;
    const r = (R0 + R1 * Math.min(1, w) + (w > 1 ? 0.9 : 0)) * scale;
    for (const i of ctx.layout.index.near(x, y, r + 2.2 * SIG)) {
      const l = ctx.leds[i], d = Math.max(0, Math.hypot(l.x - x, l.y - y) - r);
      const v = Math.exp(-(d * d) / (2 * SIG * SIG)) * (0.47 + 0.53 * Math.min(1, w) + (w > 1 ? 0.1 : 0)) * gain;
      if (v < 0.03 || v <= (best.get(i) ?? 0) + 0.02) continue;
      best.set(i, v);
      ent.push([i, t, v, w]);
    }
  }
  ent.sort((p, q) => p[1] - q[1]);
  return {
    S, led: Int16Array.from(ent, (e) => e[0]), t: Float32Array.from(ent, (e) => e[1]),
    v: Float32Array.from(ent, (e) => e[2]), wt: Float32Array.from(ent, (e) => Math.min(1, e[3])), dryT: Float32Array.from(ent, (e) => 6 + 22 * Math.min(1, e[3]) + (e[3] > 1 ? 18 : 0)),
  };
}

const itemCache = new Map();
function item(ctx, key, build) {
  let it = itemCache.get(key);
  if (!it) { it = build(); itemCache.set(key, it); }
  return it;
}
const digitItem = (ctx, k, d) => item(ctx, `d${k}:${d}`, () => {
  const s = SLOTS[k];
  return makeItem(ctx, GLYPHS[d].map((st) => st.map(([a, b, w]) => [s.a + a * s.s, s.b + b * s.s, w])), s.s < 1 ? 0.8 : 1);
});
const paraphItem = (ctx) => item(ctx, 'paraph', () => makeItem(ctx, [PARAPH], 0.8, 0.75));

/** Pen position along an item at progress e (0..1): [x, y, on]. */
function penAt(it, e) {
  const S = it.S;
  let lo = 0, hi = S.length - 1;
  if (e <= S[0][3]) return [S[0][0], S[0][1], S[0][4]];
  if (e >= S[hi][3]) return [S[hi][0], S[hi][1], S[hi][4]];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m][3] <= e) lo = m; else hi = m; }
  const f = (e - S[lo][3]) / (S[hi][3] - S[lo][3] || 1);
  return [kit.lerp(S[lo][0], S[hi][0], f), kit.lerp(S[lo][1], S[hi][1], f), S[lo][4] && S[hi][4]];
}

// ------------------------------------------------------------ the script of a minute
const pad = (n) => String(n).padStart(2, '0');
const digs = (M) => { const d = new Date(M * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const A_END = 35;                                   // the blotter rolls off the right end here
const invInOut = (y) => (y < 0.5 ? Math.cbrt(y / 4) : 1 - Math.cbrt(2 * (1 - y)) / 2);
const DUR = [0.85, 0.85, 0.62, 0.62];               // seconds to write a digit, per slot
const PARAPH_END = LW(...PARAPH[PARAPH.length - 1]);

const schedules = new Map();
/** Everything the blotter and the pen do in the minute starting at epoch second M. */
function schedule(ctx, M) {
  let S = schedules.get(M);
  if (S) return S;
  const dp = digs(M - 60), dn = digs(M), mins = new Date(M * 1000).getMinutes();
  const hourTurn = mins === 0;
  const changed = [0, 1, 2, 3].filter((k) => dp[k] !== dn[k]);
  // the blotter: one roll over the whole band at the hour, else over the
  // minutes and the paraph. Everything that changes is lifted before any new
  // digit is written, so old and new digits never mix into a wrong time; the
  // pen follows close behind the roll.
  const aFrom = hourTurn ? -2.5 : 9.6;
  const right = (k) => SLOTS[k].a + 4.4 * SLOTS[k].s;
  const dur = 0.25 + (A_END - aFrom) / 42;
  const keys = [[M, aFrom - 1.2], [M + dur, A_END]];
  const passes = (a) => M + dur * invInOut(kit.clamp((a - aFrom + 1.2) / (A_END - aFrom + 1.2)));
  const tasks = [];
  let t = M + 0.1, pos = PARAPH_END;
  const add = (it, earliest, d, extra = {}) => {
    const st = it.S[0], travel = 0.12 + Math.hypot(st[0] - pos[0], st[1] - pos[1]) / 160;
    const t0 = Math.max(t + travel, earliest);
    tasks.push({ it, t0, t1: t0 + d, from: pos, tf: t, ...extra });
    t = t0 + d; const z = it.S[it.S.length - 1]; pos = [z[0], z[1]];
  };
  // at the hour the hand hurries: four digits to write
  const pace = changed.length > 2 ? 0.72 : 1;
  for (const k of changed) add(digitItem(ctx, k, dn[k]), passes(right(k) + 0.6) + 0.04, DUR[k] * pace);
  const blot = { keys, t0: M, t1: M + dur, aFrom };
  let sand = null, seal = null;
  if (hourTurn) {                                  // pounce to dry the hour, then the seal
    sand = { t0: t + 0.2 };
    seal = { t0: sand.t0 + 1.5 };
    t = seal.t0 + 1.4;
  }
  // the paraph, one pulse a second, done by :59.2
  const para = paraphItem(ctx), pst = para.S[0];
  const Tp = Math.max(t + 0.12 + Math.hypot(pst[0] - pos[0], pst[1] - pos[1]) / 160, blot.t1 - 0.2);
  const N = Math.floor(M + 59.2 - Tp);
  S = { M, dp, dn, changed, blot, tasks, seal, sand, para: { it: para, Tp, N, from: pos, tf: t } };
  if (schedules.size > 8) schedules.delete(schedules.keys().next().value);
  schedules.set(M, S);
  return S;
}

/** The paraph's progress (0..1) at `now`: a pulse each second, resting between. */
function paraphProgress(pa, now) {
  const u = now - pa.Tp;
  if (u <= 0) return 0;
  const k = Math.floor(u);
  if (k >= pa.N) return 1;
  return (k + kit.ease.inOut(kit.clamp((u - k) / 0.7))) / pa.N;
}


const WAX_HOT = [1, 0.1, 0.02], WAX = [0.42, 0.012, 0.03], BRASS = [1, 0.8, 0.42];

/** The seal: hot wax drops into the loop, the stamp presses, the wax glows and cools. */
function drawSeal(ctx, seal, now, dim) {
  const age = now - seal.t0;
  if (age < 0 || age > 60) return;
  const [cx, cy] = LW(SEAL.a, SEAL.b);
  const grow = kit.ease.outBack(kit.clamp(age / 0.55));             // the drop spreads
  const press = age - 0.75;                                          // the stamp lands
  const heat = press < 0 ? 1 : Math.exp(-press / 7);
  const fade = (1 - kit.smoothstep(25, 58, age)) * dim;
  const R = SEAL.r * Math.max(0.05, grow) * (press > 0 ? 1 + 0.06 * Math.exp(-press * 6) : 1);
  for (const i of ctx.layout.index.near(cx, cy, R + 2.5)) {
    const l = ctx.leds[i], dx = l.x - cx, dy = l.y - cy, ang = Math.atan2(dy, dx);
    // a wax blob's edge is never round
    const d = Math.hypot(dx, dy) / (R * (1 + 0.08 * Math.sin(3 * ang + 1) + 0.05 * Math.sin(5 * ang + 4)));
    const body = 1 - kit.smoothstep(0.9, 1.15, d);
    if (body <= 0) continue;
    // after the press: a raised rim, a sunk field and a boss in the middle,
    // lit from the candle at the upper left
    let relief = 1;
    if (press > 0) {
      const k = kit.smoothstep(0, 0.25, press);
      const rim = Math.exp(-((d - 0.93) ** 2) / 0.02), boss = Math.exp(-(d * d) / 0.06);
      const lit = 0.45 + 0.55 * kit.clamp(0.5 - 0.5 * (dx + dy) / (Math.hypot(dx, dy) + 0.01));
      relief = kit.lerp(1, 0.22 + 1.1 * rim * lit + 0.9 * boss, k);
    }
    const col = kit.mix(WAX, WAX_HOT, heat);
    kit.add(ctx, i, col, body * relief * (0.4 + 0.6 * heat) * fade);
    // a glint of the candle on the warm wax
    if (press > 0 && relief > 0.8) kit.add(ctx, i, [1, 0.6, 0.4], 0.12 * (relief - 0.8) * fade);
  }
  // the brass stamp coming down: a ring closing in, flashing on contact
  if (press > -0.35 && press < 0.35) {
    const u = kit.clamp((press + 0.35) / 0.35), rr = SEAL.r * kit.lerp(1.9, 0.95, kit.ease.in(u));
    const flash = press < 0 ? 0.35 * u : 0.9 * (1 - press / 0.35);
    for (const i of ctx.layout.index.near(cx, cy, rr + 2)) {
      const l = ctx.leds[i], d = Math.abs(Math.hypot(l.x - cx, l.y - cy) - rr);
      kit.add(ctx, i, BRASS, flash * Math.exp(-(d * d) / 1.2) * dim);
    }
  }
}

const SAND = [1, 0.8, 0.48];
/** Pounce: a stream of fine sand shaken from a pot that sweeps along the band. */
function drawSand(ctx, sand, now, dim) {
  const u = now - sand.t0;
  if (u < 0 || u > 1.8) return;
  const N = 120, SWEEP = 1.0;
  for (let g = 0; g < N; g++) {
    const te = SWEEP * (g + kit.hash(g, 3)) / N, tau = u - te;   // when it leaves the pot
    if (tau < 0 || tau > 0.7) continue;
    const x = -40 + 82 * (te / SWEEP) + 3.2 * (kit.hash(g, 7) - 0.5) + 4 * tau;
    const y = -10 - 2 * kit.hash(g, 9) + 6 * tau + 0.5 * 130 * tau * tau;
    const tw = 0.3 + 0.7 * Math.max(0, Math.sin(now * (25 + 20 * kit.hash(g, 11)) + g)) ** 3;
    kit.splat(ctx, x, y, 1.6, SAND, 0.4 * tw * dim * (1 - kit.smoothstep(0.45, 0.7, tau)));
  }
}

// ------------------------------------------------------------ the frame
let ink = null, wet = null, wgt = null, la = null, grain = null;

/** Lay an item's ink, written up to progress e, into ink/wet. */
function lay(it, e, writtenAt, now, aL, dryAt = Infinity) {
  const { led, t, v, wt, dryT } = it;
  for (let j = 0; j < led.length && t[j] <= e; j++) {
    const i = led[j];
    let a = v[j];
    if (aL !== null) a *= kit.smoothstep(-0.2, 0.9, la[i] - aL);    // lifted where the blotter has been
    if (a <= 0) continue;
    if (a > ink[i]) { ink[i] = a; wgt[i] = wt[j]; }
    if (writtenAt) {
      const at = writtenAt(t[j]);
      let w = a * Math.exp(-(now - at) / dryT[j]);
      if (at < dryAt && now > dryAt) w *= 1 - kit.smoothstep(dryAt, dryAt + 1.2, now);   // the pounce drinks it
      if (w > wet[i]) wet[i] = w;
    }
  }
}

/** Where the blotter's contact line is (lattice column), or null when it is away. */
function blotterAt(S, now) {
  const K = S.blot.keys;
  if (now < K[0][0] || now > K[K.length - 1][0]) return null;
  let j = 0;
  while (j + 2 < K.length && now > K[j + 1][0]) j++;
  const [t0, a0] = K[j], [t1, a1] = K[j + 1];
  return kit.lerp(a0, a1, kit.ease.inOut(kit.clamp((now - t0) / (t1 - t0))));
}

function penPos(S, now) {
  const glide = (from, tf, it, t0) => {
    const st = it.S[0], u = kit.ease.inOut(kit.clamp((now - tf) / Math.max(0.05, t0 - tf)));
    return [kit.lerp(from[0], st[0], u), kit.lerp(from[1], st[1], u) - 2.5 * Math.sin(Math.PI * u), 0];
  };
  for (const tk of S.tasks) {
    if (now < tk.t0) return glide(tk.from, tk.tf, tk.it, tk.t0);
    if (now < tk.t1) return penAt(tk.it, (now - tk.t0) / (tk.t1 - tk.t0));
  }
  const pa = S.para;
  if (now < pa.Tp) {
    if (S.seal && now < S.seal.t0 + 1.4) {                          // pen waits beside the seal
      const z = S.tasks[S.tasks.length - 1].it.S.at(-1);
      return [z[0] + 4, z[1] - 3, 0];
    }
    return glide(pa.from, pa.tf, pa.it, pa.Tp);
  }
  return penAt(pa.it, paraphProgress(pa, now));
}

export default {
  name: 'Copperplate',
  blurb: 'a dip pen writes the time in copperplate by candlelight; blotter, paraph and a wax seal at the hour',
  layouts: ['para-x2'], look: { look: 'opal', gap: 1.4 }, fps: 60, brightness: 0.85, dither: true,
  frame(ctx) {
    const { leds, n } = ctx;
    if (!ink || ink.length !== n) {
      ink = new Float32Array(n); wet = new Float32Array(n); wgt = new Float32Array(n);
      la = Float32Array.from(leds, latA);
      grain = Float32Array.from(leds, (l) => 0.8 + 0.4 * kit.fbm(l.x * 0.35, l.y * 0.5, 3.7, 3));
    }
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60;
    const S = schedule(ctx, M), Sp = schedule(ctx, M - 60);
    const dim = 1 - 0.75 * ctx.night;
    ink.fill(0); wet.fill(0);
    const aL = blotterAt(S, now);

    // ink already on the page and staying
    for (let k = 0; k < 4; k++) if (!S.changed.includes(k)) lay(digitItem(ctx, k, S.dn[k]), 1, null, now, null);
    // ink being lifted by the blotter
    for (const k of S.changed) lay(digitItem(ctx, k, S.dp[k]), 1, null, now, aL ?? (now > S.blot.t0 ? 99 : -99));
    const lifted = aL ?? (now > S.blot.t0 ? 99 : -99);
    const pp = Sp.para;
    lay(pp.it, 1, (te) => pp.Tp + te * pp.N, now, lifted);
    // ink being written now
    for (const tk of S.tasks) {
      const e = (now - tk.t0) / (tk.t1 - tk.t0);
      if (e > 0) lay(tk.it, e, (te) => tk.t0 + te * (tk.t1 - tk.t0), now, null, S.sand ? S.sand.t0 + 0.3 : Infinity);
    }
    const pa = S.para, pe = paraphProgress(pa, now);
    if (pe > 0) lay(pa.it, pe, (te) => pa.Tp + te * pa.N, now, null);

    // candlelight: a slow sway and a quick flicker
    const fl = 0.8 + 0.14 * kit.noise2(now * 1.9, 1.3) + 0.06 * kit.noise2(now * 8.3, 7.1);
    const cxw = -60 + 10 * kit.noise2(now * 0.3, 4.4);
    const pen = penPos(S, now);
    const hx = pen[0] + 7, hy = pen[1] + 6;                           // the writing hand's shadow
    for (const l of leds) {
      const i = l.i;
      const pool = 0.55 + 0.45 / (1 + ((l.x - cxw) / 70) ** 2);
      const sh = 1 - 0.65 * Math.exp(-((l.x - hx) ** 2 + (l.y - hy) ** 2) / 60);
      const lightK = fl * pool * dim;
      kit.set(ctx, i, PAPER, grain[i] * lightK * sh);
      const a = ink[i];
      if (a > 0) {
        const w = Math.min(wet[i], a);
        const spec = kit.smoothstep(0.55, 0.85, kit.noise2(l.x * 0.25 + now * 0.35, l.y * 0.3 - now * 0.2));
        const c = kit.mix(kit.mix(HAIR, DRY, kit.smoothstep(0.1, 0.8, wgt[i])), WET, w / a);
        kit.add(ctx, i, c, a * lightK * (0.85 + 0.15 * sh));
        kit.add(ctx, i, GLOSS, w * spec * 0.55 * lightK);
      }
    }
    // the blotter: a rolling band of rose blotting paper, its contact line along the slant
    if (aL !== null) {
      const vis = kit.smoothstep(0, 0.15, now - S.blot.t0) * (1 - kit.smoothstep(32, 34.5, aL)) * dim;
      for (const l of leds) {
        const d = la[l.i] - aL;
        if (d < -4 || d > 2) continue;
        const roll = Math.exp(-((d + 1.2) ** 2) / 1.6) * (0.75 + 0.25 * Math.cos((l.row - 3.5) * 0.4));
        kit.add(ctx, l.i, BLOT, 0.16 * roll * vis * fl);
      }
    }
    if (S.sand) {
      drawSand(ctx, S.sand, now, dim);
      // grains caught on the wet strokes glint, then are poured off
      const u = now - S.sand.t0;
      if (u > 0.2 && u < 2.6) {
        const k = kit.smoothstep(0.2, 0.7, u) * (1 - kit.smoothstep(1.6, 2.6, u));
        for (const l of leds) {
          if (ink[l.i] < 0.3) continue;
          const tw = Math.max(0, Math.sin(now * (18 + 14 * kit.hash(l.i, 2)) + 9 * kit.hash(l.i, 4))) ** 6;
          kit.add(ctx, l.i, SAND, 0.5 * k * tw * ink[l.i] * dim);
        }
      }
    }
    if (S.seal) drawSeal(ctx, S.seal, now, dim);
    // the steel nib above the paper, slanting up and away to the writer's
    // hand: it hides the ink under it and catches the candle along its
    // shoulder; its point glints, brightest when it touches the paper
    const on = pen[2] ? 1 : 0;
    const lift = on ? 0 : 1.2, ang = 0.66 + 0.06 * Math.sin(now * 0.7);
    const ux = Math.cos(ang), uy = -Math.sin(ang);
    const px = pen[0] + ux * lift, py = pen[1] + uy * lift, LEN = 7;
    for (const i of ctx.layout.index.near(px + ux * LEN / 2, py + uy * LEN / 2, LEN / 2 + 3)) {
      const l = leds[i], rx = l.x - px, ry = l.y - py, along = rx * ux + ry * uy;
      if (along < 0 || along > LEN) continue;
      const across = rx * -uy + ry * ux, half = 0.35 + 0.17 * along;
      const occ = 1 - kit.smoothstep(half - 0.4, half + 0.9, Math.abs(across));
      if (occ <= 0) continue;
      const o = ctx.out, keep = 1 - 0.6 * occ;
      o[3 * i] *= keep; o[3 * i + 1] *= keep; o[3 * i + 2] *= keep;
      const rim = Math.exp(-((across + half * 0.5) ** 2) / 0.8);
      kit.add(ctx, i, STEEL, occ * dim * fl * (0.25 + 0.5 * rim) * (1 - along / LEN * 0.6));
    }
    kit.splat(ctx, pen[0], pen[1], 2.4, GLOSS, (0.16 + 0.36 * on) * fl * dim);
  },
};
