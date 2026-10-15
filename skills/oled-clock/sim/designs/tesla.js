// Tesla — the time written in plasma by a Tesla coil.
//
// A small Tesla coil stands between the hours and the minutes: a toroid on
// a wound column on a base. The digits are plasma: each stroke of a
// chamfered, busbar-like hand is two filaments braided round its
// centre-line, waves running along them in opposite directions so the braid
// crawls, with bright pulses of current racing along the strokes and a fine
// crackle re-rolled 24 times a second. Now and then a spark spits off a
// stroke; streamers flicker off the toroid, a puff on every second. The
// column is the coil's charge meter: its windings light solid from the foot
// up to a humming front.
//
// The minute: from :56.6 the coil charges. The front climbs the column, the
// streamers lengthen, the old digit's pulses come faster and brighter, St
// Elmo's fire gathers round the toroid, and from :58.4 a faint leader gropes
// out along an arching path to the top of each digit that will change. At
// :59.5 the return stroke: the channel lights, the panel flashes (contrast,
// three frames), the digit flares white-hot and is blown apart into
// streaking fragments while the channel re-strikes twice and dies. From
// :00.45 an arc from the coil welds the new digit on, stroke by stroke, a
// torch star at its head throwing sparks that bounce on the floor; the bead
// is a solid white bar that cools into the braid, and when the last stroke
// closes the digit flares once and settles. Two changing digits are struck
// together and welded left to right, so the screen shows the old time, then
// blanks, then the start of the new time; never a mix.
//
// The hour: a Jacob's ladder. From :56.4 the coil strikes the old digits on
// four beats, right to left, so what is left is always the start of the old
// time; it sinks out of sight and two rails rise in a V. An arc ignites in
// the narrow gap at the foot and climbs, stretching and bowing as hot air
// does, until it breaks at the top; again; the third climbs to the digits'
// top and hangs there quivering, then drops into the four slots as one chain
// of lightning from edge to edge through four torches that weld the new
// time at once. The chain lets go, the rails sink, and the coil rises back
// with a bounce.
//
// Everything is a function of the clock: shapes come from an integer hash
// of the minute and of time epochs (bolts, crackle), positions from the
// seconds since the turn (debris and sparks are ballistic in closed form),
// and the slow phases from local time of day.
//
// Burn-in: the filaments never rest; the dither's phase is re-rolled 20
// times a second so faint glow lights no fixed glass pixel; the whole scene
// walks kit.orbit. From 23:00 to 07:00 the panel dims (ctx.night).

import { dither, clamp, ease, clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;
const DW = 22, DH = 38, TOP = 12;
const SLOT_X = [2, 27, 79, 104];
const CX = 64;                        // the coil's axis
const TOR_Y = 6, TOR_RX = 12, TOR_RY = 5;

// ------------------------------------------------------------ hashing

/** Integer hash of up to three ints, as a float in [0, 1). */
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth01 = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ letterforms
//
// Centre-lines in a 22 x 38 box, chamfered like a busbar: straight runs
// meeting at cut corners, which a small radius softens. A digit is a list of
// strokes in the order a welder would lay them; `c` marks a closed loop.

const SK = {
  0: [{ c: 1, p: [[8, 3], [14, 3], [19, 8], [19, 30], [14, 35], [8, 35], [3, 30], [3, 8]] }],
  1: [{ p: [[6, 9], [13, 3], [13, 35]] }, { p: [[7, 35], [19, 35]] }],
  2: [{ p: [[3, 9], [8, 3], [14, 3], [19, 8], [19, 15], [3, 35], [19, 35]] }],
  3: [{ p: [[3, 3], [19, 3], [10, 16], [14, 16], [19, 21], [19, 30], [14, 35], [8, 35], [3, 30]] }],
  4: [{ p: [[15, 35], [15, 3], [3, 25], [19, 25]] }],
  5: [{ p: [[19, 3], [4, 3], [3, 17], [13, 16], [19, 21], [19, 30], [14, 35], [8, 35], [3, 30]] }],
  6: [{ p: [[17, 3], [10, 3], [3, 10], [3, 30], [8, 35], [14, 35], [19, 30], [19, 22], [14, 17], [8, 17], [3, 21]] }],
  7: [{ p: [[3, 3], [19, 3], [9, 35]] }],
  8: [{ c: 1, p: [[8, 3], [14, 3], [18, 7], [18, 13], [14, 17], [8, 17], [4, 13], [4, 7]] },
    { c: 1, p: [[8, 17], [14, 17], [19, 22], [19, 30], [14, 35], [8, 35], [3, 30], [3, 22]] }],
};
SK[9] = SK[6].map((st) => ({ ...st, p: st.p.map(([x, y]) => [DW - x, DH - y]) }));

/** A polyline with each interior corner replaced by a small quadratic curve. */
function roundCorners(poly, closed, r = 2.4) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const V = poly[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(V); continue; }
    const P = poly[(i - 1 + n) % n], N = poly[(i + 1) % n];
    const lp = Math.hypot(P[0] - V[0], P[1] - V[1]), ln = Math.hypot(N[0] - V[0], N[1] - V[1]);
    const rp = Math.min(r, lp / 2) / lp, rn = Math.min(r, ln / 2) / ln;
    const A = [V[0] + (P[0] - V[0]) * rp, V[1] + (P[1] - V[1]) * rp];
    const B = [V[0] + (N[0] - V[0]) * rn, V[1] + (N[1] - V[1]) * rn];
    for (let k = 0; k <= 4; k++) {
      const u = k / 4, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      out.push([a * A[0] + b * V[0] + c * B[0], a * A[1] + b * V[1] + c * B[1]]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}
const STEP = 0.5;
const GLOW = 0.4;                     // how much halo a digit's filaments raise
/**
 * A digit resampled every STEP px along its strokes: positions, unit
 * normals and arc length (running on across strokes, in welding order).
 */
function buildGlyph(d) {
  const strokes = [];
  let total = 0;
  for (const st of SK[d]) {
    const poly = roundCorners(st.p, !!st.c);
    const xs = [], ys = [];
    xs.push(poly[0][0]); ys.push(poly[0][1]);
    let carry = 0;
    for (let i = 1; i < poly.length; i++) {
      const [ax, ay] = poly[i - 1], [bx, by] = poly[i];
      const len = Math.hypot(bx - ax, by - ay);
      let u = STEP - carry;
      while (u <= len) { xs.push(ax + ((bx - ax) * u) / len); ys.push(ay + ((by - ay) * u) / len); u += STEP; }
      carry = len - (u - STEP);
    }
    const n = xs.length;
    const nx = new Float32Array(n), ny = new Float32Array(n), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / l; ny[i] = dx / l;
      s[i] = total + i * STEP;
    }
    strokes.push({ x: Float32Array.from(xs), y: Float32Array.from(ys), nx, ny, s, s0: total, len: (n - 1) * STEP });
    total += (n - 1) * STEP;
  }
  return { strokes, total };
}
const GLYPH = Array.from({ length: 10 }, (_, d) => buildGlyph(d));

// ------------------------------------------------------------ light
//
// Two layers. CORE is the discharge itself: crisp one-pixel channels, lit
// outright where the brightness `e` is 1 or more, ordered-dithered below
// that (a fading spark thins out), thickened where it is very hot. E is the
// energy the same channels put into the air, blurred into a faint halo of
// dither round them.

const CORE = new Uint8Array(W * H);
/**
 * The dither's phase, re-rolled 20 times a second: glow flickers as plasma
 * does, and no glass pixel is the one a faint glow always lights (burn-in).
 */
let DX = 0, DY = 0;
const E = new Float32Array(W * H), HALO = new Float32Array(W * H), TMP = new Float32Array(W * H);

/** One sample of light at (x, y), brightness e; samples are STEP px apart. */
function dep(x, y, e, glow = 1) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const i = iy * W + ix;
  E[i] += e * STEP * glow;
  if (e >= 1 || (e > 0 && dither(ix + DX, iy + DY, e))) CORE[i] = 1;
  if (e >= 2.2) {
    if (ix + 1 < W) CORE[i + 1] = 1;
    if (iy + 1 < H) CORE[i + W] = 1;
    if (e >= 3.2) { if (ix > 0) CORE[i - 1] = 1; if (iy > 0) CORE[i - W] = 1; }
  }
}

/** A straight run of light from a to b. */
function depLine(ax, ay, bx, by, e, glow = 1) {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / STEP));
  for (let k = 0; k < n; k++) dep(ax + ((bx - ax) * (k + 0.5)) / n, ay + ((by - ay) * (k + 0.5)) / n, e, glow);
}

/** Separable box blur, radius 2, of E into HALO. */
function blurHalo() {
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let s = E[row] + E[row + 1] + E[row + 2];
    for (let x = 0; x < W; x++) {
      TMP[row + x] = s;
      const add = x + 3 < W ? E[row + x + 3] : 0, sub = x - 2 >= 0 ? E[row + x - 2] : 0;
      s += add - sub;
    }
  }
  for (let x = 0; x < W; x++) {
    let s = TMP[x] + TMP[W + x] + TMP[2 * W + x];
    for (let y = 0; y < H; y++) {
      HALO[y * W + x] = s / 25;
      const add = y + 3 < H ? TMP[(y + 3) * W + x] : 0, sub = y - 2 >= 0 ? TMP[(y - 2) * W + x] : 0;
      s += add - sub;
    }
  }
}

// ------------------------------------------------------------ lightning

/**
 * A lightning channel from a to b by midpoint displacement: each segment is
 * split at a midpoint pushed sideways by a seeded fraction of its length,
 * until the pieces are under `minSeg` px. Side branches leave the main
 * channel and fork off towards the target. Returns the channels as point
 * lists; `at` is the fraction of the main channel a branch leaves from.
 */
function bolt(ax, ay, bx, by, seed, rough = 0.45, branches = 2, minSeg = 1.5, lift = 0) {
  let pts = [[ax, ay], [bx, by]];
  if (lift) {
    // An arc that arches: start from a curve bowed upwards (hot air rises).
    const mx = (ax + bx) / 2, my = Math.min(ay, by) - lift;
    pts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      pts.push([a * ax + b * mx + c * bx, a * ay + b * my + c * by]);
    }
  }
  for (let lv = 0; lv < 8; lv++) {
    const next = [pts[0]];
    let longest = 0;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1], [qx, qy] = pts[i];
      const dx = qx - px, dy = qy - py, len = Math.hypot(dx, dy) || 1e-6;
      const o = (hash(seed, lv * 131 + i, 7) - 0.5) * rough * len;
      next.push([(px + qx) / 2 - (dy / len) * o, (py + qy) / 2 + (dx / len) * o], pts[i]);
      if (len / 2 > longest) longest = len / 2;
    }
    pts = next;
    if (longest < minSeg) break;
  }
  const out = [{ pts, at: 0, e: 1 }];
  const n = pts.length;
  for (let b = 0; b < branches && n > 4; b++) {
    const i = 1 + Math.floor(hash(seed, b, 31) * (n - 3) * 0.75);
    const [px, py] = pts[i], [qx, qy] = pts[i + 1];
    const ang = Math.atan2(qy - py, qx - px) + (hash(seed, b, 37) < 0.5 ? -1 : 1) * (0.4 + 0.6 * hash(seed, b, 41));
    const L = Math.hypot(bx - px, by - py) * (0.2 + 0.3 * hash(seed, b, 43)) + 2;
    const sub = bolt(px, py, px + Math.cos(ang) * L, py + Math.sin(ang) * L, seed * 7 + b + 1, rough * 1.15, 0, minSeg);
    out.push({ pts: sub[0].pts, at: i / (n - 1), e: 0.5 });
  }
  return out;
}

const boltCache = new Map();
/** The same bolt, built once (leaders keep their path while they grow). */
function cachedBolt(key, ...args) {
  let b = boltCache.get(key);
  if (!b) {
    if (boltCache.size > 64) boltCache.clear();
    b = bolt(...args);
    boltCache.set(key, b);
  }
  return b;
}

/** Deposit a bolt, its main channel grown to `frac`; branches grow after it. */
function drawBolt(B, e, frac = 1, glow = 0.5) {
  for (const br of B) {
    let f = br.at === 0 ? frac : ((frac - br.at) / Math.max(0.05, 1 - br.at)) * 1.5;
    if (f <= 0) continue;
    f = Math.min(1, f);
    const pts = br.pts, last = f * (pts.length - 1);
    for (let i = 1; i <= Math.ceil(last); i++) {
      const u = Math.min(1, last - (i - 1));
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      depLine(ax, ay, ax + (bx - ax) * u, ay + (by - ay) * u, e * br.e, glow);
    }
  }
}

/** Where on the toroid's rim an arc to (tx, ty) leaves from. */
function rimPoint(cx, cy, tx, ty) {
  const a = Math.atan2((ty - cy) * (TOR_RX / TOR_RY), tx - cx);
  return [cx + TOR_RX * Math.cos(a), cy + TOR_RY * Math.sin(a)];
}

// ------------------------------------------------------------ plasma digits

/** Value noise along a line, re-rolled per `epoch`: the crackle. */
function crackle(s, epoch, id) {
  const q = s / 2.6, i = Math.floor(q), f = q - i, u = f * f * (3 - 2 * f);
  const a = hash(i, epoch, id), b = hash(i + 1, epoch, id);
  return a + (b - a) * u - 0.5;
}

/**
 * A digit as plasma: two filaments braided round each stroke's centre-line,
 * waves running along them in opposite directions (so the braid crawls),
 * bright pulses of current travelling along the stroke, and a crackle
 * re-rolled 24 times a second.
 *   agit  0..1, the charge before a strike: brighter pulses, closer together
 *   run   extra distance the pulses have run (they speed up as it charges)
 *   hot   0..1, white heat: the filaments collapse into one solid bar
 *   weld  { t, timeAt } the welding torch: only what it has laid is drawn,
 *         and what it laid recently is still hot
 */
function drawPlasma(gl, x0, y0, T, id, { agit = 0, hot = 0, weld = null, e = 1, run = 0 } = {}) {
  const epoch = Math.floor(T * 24);
  const amp = 1.5;
  const ca = 0.2 + 0.25 * agit;
  const flick = 1 + agit * 0.5 * hash(epoch, id, 5);
  const gap = 26 - 10 * agit, pk = 0.9 + 1.8 * agit;
  for (const st of gl.strokes) {
    const n = st.x.length;
    for (let i = 0; i < n; i++) {
      const s = st.s[i];
      let h = hot;
      if (weld) {
        const age = weld.t - weld.timeAt(s);
        if (age < 0) break;
        h = Math.max(h, Math.exp(-age / 0.45));
      }
      const x = x0 + st.x[i], y = y0 + st.y[i], nx = st.nx[i], ny = st.ny[i];
      const pulse = Math.cos((TAU * (s - 21 * T - run)) / gap);
      const p8 = pulse > 0 ? pulse ** 8 : 0;
      const ee = e * flick * (1 + pk * p8) * (1 + 1.8 * h);
      const k = (1 - h) * amp;
      const c0 = crackle(s, epoch, id * 2) * ca * (1 - h), c1 = crackle(s, epoch, id * 2 + 1) * ca * (1 - h);
      const o0 = k * Math.sin(0.42 * s + 5.2 * T + id * 1.3) + c0;
      const o1 = k * Math.sin(0.42 * s - 4.4 * T + id * 2.9 + 2.1) + c1;
      dep(x + nx * o0, y + ny * o0, ee, GLOW);
      dep(x + nx * o1, y + ny * o1, ee, GLOW);
    }
  }
}

/**
 * Spits: now and then a short spark leaps off a stroke into the air, more
 * and longer as the coil charges. Re-rolled 12 times a second, the last one
 * lingering as an afterimage.
 */
function drawSpits(gl, x0, y0, T, id, agit = 0, limit = Infinity) {
  const epoch = Math.floor(T * 12);
  const pts = gl.strokes.reduce((n, st) => n + st.x.length, 0);
  for (const [ep, ew] of [[epoch, 1], [epoch - 1, 0.35]]) {
    const n = (hash(ep, id, 51) < 0.45 + 0.55 * agit ? 1 : 0) + Math.floor(agit * 1.6 * hash(ep, id, 52));
    for (let j = 0; j < n; j++) {
      let q = Math.floor(hash(ep, id * 8 + j, 53) * pts), st = gl.strokes[0], k = 0;
      while (q >= st.x.length) { q -= st.x.length; st = gl.strokes[++k]; }
      if (st.s[q] > limit) continue;
      const side = hash(ep, j, 54) < 0.5 ? -1 : 1, L = 3 + (4 + 3 * agit) * hash(ep, id * 8 + j, 55);
      const ax = x0 + st.x[q], ay = y0 + st.y[q];
      const a = Math.atan2(st.ny[q] * side, st.nx[q] * side) + (hash(ep, j, 56) - 0.5) * 1.2;
      drawBolt(bolt(ax, ay, ax + Math.cos(a) * L, ay + Math.sin(a) * L, (hash(ep, id * 8 + j, 57) * 1e9) | 0, 0.7, 1, 1.2), ew);
    }
  }
}

/**
 * The old digit blown apart by the strike: every 1.5 px of its strokes is a
 * fragment flung away from the impact (the nearer, the faster), slowed by
 * drag, falling, and fading, drawn as a short streak.
 */
function drawBlast(gl, x0, y0, ix, iy, t, id) {
  const K = 3.2;
  for (const st of gl.strokes) {
    for (let i = 0; i < st.x.length; i += 2) {
      const j = Math.round(st.s[i] * 2);
      const life = 0.4 + 0.55 * hash(j, id, 1);
      if (t > life) continue;
      const px = x0 + st.x[i], py = y0 + st.y[i];
      let dx = px - ix, dy = py - iy;
      const d = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + (hash(j, id, 2) - 0.5) * 1.3;
      const v = (40 + 80 * hash(j, id, 3)) * (0.55 + 10 / (d + 6));
      dx = Math.cos(a) * v; dy = Math.sin(a) * v - 25;
      const at = (tt) => {
        const m = (1 - Math.exp(-K * tt)) / K;
        return [px + dx * m, py + dy * m + 70 * tt * tt];
      };
      const [ax, ay] = at(Math.max(0, t - 0.03)), [bx, by] = at(t);
      depLine(ax, ay, bx, by, (1.2 + 1.4 * Math.exp(-t / 0.08)) * (1 - t / life) ** 1.4, 0.6);
    }
  }
}

/**
 * The welding schedule of a glyph: the torch lays each stroke at constant
 * speed, lifting for JUMP s between strokes, in `dur` s in all.
 */
const JUMP = 0.16;
function weldPlan(gl, dur) {
  const ns = gl.strokes.length;
  const v = gl.total / (dur - JUMP * (ns - 1));
  return {
    v,
    /** When the torch reaches arc length s. */
    timeAt(s) {
      let k = 0;
      while (k < ns - 1 && s > gl.strokes[k].s0 + gl.strokes[k].len) k++;
      return s / v + k * JUMP;
    },
    /** Where the torch is t s into the weld, and whether it is burning. */
    head(t) {
      let tt = t;
      for (let k = 0; k < ns; k++) {
        const st = gl.strokes[k], dt = st.len / v;
        if (tt <= dt) {
          const i = Math.min(st.x.length - 1, Math.floor((tt * v) / STEP));
          return { x: st.x[i], y: st.y[i], on: true, k };
        }
        tt -= dt;
        if (tt < JUMP && k < ns - 1) {
          const nx = gl.strokes[k + 1];
          const u = smooth01(tt / JUMP);
          return { x: st.x.at(-1) + (nx.x[0] - st.x.at(-1)) * u, y: st.y.at(-1) + (nx.y[0] - st.y.at(-1)) * u, on: false, k };
        }
        tt -= JUMP;
      }
      const st = gl.strokes[ns - 1];
      return { x: st.x.at(-1), y: st.y.at(-1), on: false, k: ns };
    },
  };
}
const planCache = new Map();
const planOf = (d, dur) => {
  const k = `${d}:${dur}`;
  if (!planCache.has(k)) planCache.set(k, weldPlan(GLYPH[d], dur));
  return planCache.get(k);
};

/** Sparks thrown off the torch: ballistic, bouncing once on the floor, fading. */
const SPARK_RATE = 45, FLOOR = 61;
function drawSparks(plan, x0, y0, t, id) {
  const j1 = Math.floor(t * SPARK_RATE), j0 = Math.max(0, Math.floor((t - 0.8) * SPARK_RATE));
  for (let j = j0; j <= j1; j++) {
    const ts = j / SPARK_RATE, age = t - ts;
    if (age < 0) continue;
    const life = 0.25 + 0.5 * hash(j, id, 11);
    if (age > life) continue;
    const h = plan.head(ts);
    if (!h.on) continue;
    const a = -Math.PI / 2 + (hash(j, id, 12) - 0.5) * 3.0;
    const v = 35 + 85 * hash(j, id, 13);
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    const at = (tt) => {
      let x = x0 + h.x + vx * tt, y = y0 + h.y + vy * tt + 130 * tt * tt;
      if (y > FLOOR) y = FLOOR - (y - FLOOR) * 0.3;
      return [x, y];
    };
    const [ax, ay] = at(Math.max(0, age - 0.022)), [bx, by] = at(age);
    depLine(ax, ay, bx, by, 1.1 * (1 - age / life), 0.4);
  }
}

// ------------------------------------------------------------ the coil

/**
 * Streamers off the toroid: short branching discharges into the air, their
 * bearings wandering slowly, their shapes re-struck 18 times a second (the
 * last one lingers as an afterimage). `act` 0..1 is how charged the coil is.
 */
function drawCorona(cx, cy, T, act) {
  const epoch = Math.floor(T * 18);
  const N = 1.5 + 4.5 * act;
  for (let i = 0; i < Math.ceil(N); i++) {
    const w = Math.min(1, N - i);
    const ang = -Math.PI / 2 + 1.9 * Math.sin(T * (0.31 + 0.07 * i) + i * 2.4);
    const sx = cx + TOR_RX * Math.cos(ang), sy = cy + TOR_RY * Math.sin(ang);
    for (const [ep, ew] of [[epoch, 1], [epoch - 1, 0.35]]) {
      const L = (6 + 16 * act) * (0.4 + 0.6 * hash(i, ep, 21));
      const B = bolt(sx, sy, sx + L * Math.cos(ang), sy + L * Math.sin(ang) * 0.8, (hash(i, ep, 22) * 1e9) | 0, 0.65, 1, 1.4);
      drawBolt(B, 1.05 * w * ew);
    }
  }
}

// The toroid seen from a little above: '#' its outline, '+' the lit top,
// '-' the shaded near side, '.' the hole; blanks are outside it.
const TORUS = [
  '        ########        ',
  '    ####........####    ',
  '  ##....########....##  ',
  ' #....##........##....# ',
  '#.......########.......#',
  '#......................#',
  ' #.....############...# ',
  '  ##................##  ',
  '    ####........####    ',
  '        ########        ',
];
const BASE = [
  '   ##########   ',
  '                ',
  '  ############  ',
  '                ',
  '################',
  ' ############## ',
];
const SHADE = { '#': 1, '+': 0.5, '-': 0.18, '.': 0 };

/** A picture over the glow, with a one-pixel black keyline round it. */
function drawPicture(g, rows, x0, y0) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++)
      if (row[i] !== ' ') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.pixel(x0 + i + dx, y0 + j + dy, 0);
  });
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === ' ') continue;
      const lv = SHADE[ch], x = x0 + i, y = y0 + j;
      g.pixel(x, y, lv >= 1 || (lv > 0 && dither(x - x0, y - y0, lv)) ? 1 : 0);
    }
  });
}

const COL0 = 5, COL1 = 53;    // the secondary's rows below the toroid's centre / above the base

/**
 * The coil itself: toroid on a wound column on a base, drawn over the glow.
 * The secondary is the coil's charge meter: its windings light up solid
 * from the foot to a front that climbs as the coil charges and falls as it
 * spends; above the front they are dim, a fine thread of wire.
 */
function drawCoil(g, cx, oy, level, T) {
  const ty = TOR_Y + oy, y0 = ty + COL0, y1 = COL1 + oy;
  const front = y1 - level * (y1 - y0) + 0.7 * Math.sin(T * 31);
  for (let y = y0; y < y1; y++) {
    const wind = ((y - oy) & 1) === 0, lit = y >= front;
    for (let x = cx - 2; x < cx + 2; x++) {
      const on = wind && (lit || x === cx - 1 || (x === cx - 2 && ((y - oy) & 3) === 0));
      g.pixel(x, y, on ? 1 : 0);
    }
    if (Math.abs(y - front) < 1) { g.pixel(cx - 3, y, 1); g.pixel(cx + 2, y, 1); }
  }
  drawPicture(g, BASE, cx - 8, 53 + oy);
  drawPicture(g, TORUS, cx - 12, ty - 5);
}

/** The glow the charged coil raises round itself (deposited before compose). */
function coilGlow(cx, oy, level) {
  const ty = TOR_Y + oy, y1 = COL1 + oy, front = y1 - level * (y1 - ty - COL0);
  for (let y = front; y < y1; y += 1) { dep(cx - 2.5, y, 0.6, 1); dep(cx + 2.5, y, 0.6, 1); }
  // St Elmo's fire round the toroid as the charge nears the top.
  const c = clamp((level - 0.6) / 0.4, 0, 1);
  if (c > 0) for (let a = 0; a < TAU; a += 0.12) dep(cx + (TOR_RX + 0.5) * Math.cos(a), ty + (TOR_RY + 0.5) * Math.sin(a), 1.4 * c, 1);
}

// ------------------------------------------------------------ the schedule
// Seconds relative to the :00 of the turn.

const CHARGE0 = -3.4, LEADER0 = -1.6, STRIKE = -0.5, HOT = 0.16;
const WELD0 = 0.45, WELD_DUR = 1.4, WELD_STAGGER = 1.1;

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

/** The point of a glyph nearest (px, py): where a strike lands. */
function nearestPoint(gl, x0, y0, px, py) {
  let best = Infinity, bx = 0, by = 0;
  for (const st of gl.strokes)
    for (let i = 0; i < st.x.length; i += 2) {
      const d = (x0 + st.x[i] - px) ** 2 + (y0 + st.y[i] - py) ** 2;
      if (d < best) { best = d; bx = x0 + st.x[i]; by = y0 + st.y[i]; }
    }
  return [bx, by];
}

function compose(g) {
  blurHalo();
  for (let y = 0, i = 0; y < H; y++)
    for (let x = 0; x < W; x++, i++) {
      const h = HALO[i];
      if (CORE[i] || (h > 0.05 && dither(x + DX, y + DY, Math.min(0.22, h * 0.45)))) g.buf[i] = 1;
    }
}

/**
 * How much further the current pulses have run by `tau` as the coil charged:
 * they speed up from 21 to 111 px/s with the square of the charge, so this
 * is that speed's integral (closed-form smoothstep powers are awkward; 32
 * midpoint steps are exact enough and cheap).
 */
function chargeRun(tau) {
  const t1 = Math.min(tau, STRIKE);
  if (t1 <= CHARGE0) return 0;
  let sum = 0;
  const n = 32, dt = (t1 - CHARGE0) / n;
  for (let i = 0; i < n; i++) {
    const c = smooth01((CHARGE0 + (i + 0.5) * dt - CHARGE0) / (STRIKE - CHARGE0));
    sum += c * c * dt;
  }
  return 90 * sum;
}

/**
 * A digit struck by the coil. `s` is seconds from the return stroke, `lead`
 * how long the leader gropes before it. Before the strike the digit seethes
 * (agit, run: see drawPlasma); at it, the digit flares white and is blown
 * apart while the channel flickers through two re-strikes. Returns the
 * flash (0..1).
 */
function strikeSlot(gOld, x0, y0, cx, ty, T, s, lead, k, key, agit, run) {
  const id = key * 4 + k;
  const [ix, iy] = nearestPoint(gOld, x0, y0, x0 + DW / 2 + (x0 < cx ? -3 : 3), y0);
  const [rx, ry] = rimPoint(cx, ty, ix, iy);
  let flash = 0;

  if (s < 0) {
    drawPlasma(gOld, x0, y0, T, k, { agit, run });
    drawSpits(gOld, x0, y0, T, k);
  } else if (s < HOT) drawPlasma(gOld, x0, y0, T, k, { hot: 1, e: 1.2 });
  else if (s < HOT + 1.1) drawBlast(gOld, x0, y0, ix, iy, s - HOT, id);

  const B = cachedBolt(`${key}:${k}`, rx, ry, ix, iy, id, 0.3, 4, 1.2, 8);
  if (s >= -lead && s < 0) {
    // The leader: faint, flickering, groping its way out.
    const u = 1 + s / lead;
    drawBolt(B, 0.35 + 0.45 * hash(Math.floor(T * 30), k, 3), 0.1 + 0.9 * u * u * (3 - 2 * u), 0.25);
  } else if (s >= 0 && s < 0.7) {
    // The return stroke, and two re-strikes down the same channel.
    const e = 2.6 * Math.exp(-s / 0.07) + (s > 0.16 ? 2.2 * Math.exp(-(s - 0.16) / 0.05) : 0)
      + (s > 0.32 ? 1.8 * Math.exp(-(s - 0.32) / 0.07) : 0) + 0.7 * Math.exp(-s / 0.3);
    drawBolt(B, e, 1, 0.6);
    if (s < 0.05) flash = 1 - s / 0.05;
  }
  return flash;
}

/**
 * One changing digit through a minute turn: struck and blown apart, then an
 * arc from the coil welds the new digit on, stroke by stroke, throwing
 * sparks, and the bead cools into the steady braid. Changing digits are
 * struck together and welded one after the other, left to right.
 */
function minuteSlot(gOld, dNew, x0, y0, cx, ty, T, tau, k, key, order, charge) {
  const flash = strikeSlot(gOld, x0, y0, cx, ty, T, tau - STRIKE, STRIKE - LEADER0, k, key, charge * charge, chargeRun(tau));
  const w0 = WELD0 + WELD_STAGGER * order;
  if (tau >= w0) drawWeld(GLYPH[dNew], dNew, x0, y0, T, tau - w0, k, key * 4 + k, WELD_DUR, [cx, ty]);
  return flash;
}

/**
 * A digit being welded, `tw` s into a weld of `dur` s: the bead, sparks, the
 * torch's star, and (if `from`, the coil's top) the arc feeding it. When the
 * last stroke closes, the whole digit flares once and settles.
 */
function drawWeld(gl, d, x0, y0, T, tw, k, id, dur, from) {
  const plan = planOf(d, dur);
  const flare = tw > dur ? 0.9 * Math.exp(-(tw - dur) / 0.12) : 0;
  drawPlasma(gl, x0, y0, T, k, { weld: { t: tw, timeAt: plan.timeAt }, hot: flare });
  if (tw < dur + 0.8) drawSparks(plan, x0, y0, tw, id);
  if (tw >= dur) return;
  const h = plan.head(tw);
  const hx = x0 + h.x, hy = y0 + h.y;
  if (!h.on) return;
  const ep = Math.floor(T * 30);
  if (from) {
    const [ax, ay] = rimPoint(from[0], from[1], hx, hy);
    drawBolt(bolt(ax, ay, hx, hy, (hash(ep, k, 9) * 1e9) | 0, 0.32, 1, 1.3, 7), 1, 1, 0.25);
  }
  // The torch's star: a hot point with flickering rays.
  dep(hx, hy, 3.4);
  const r = 2 + 2.5 * hash(ep, k, 19);
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2 + (Math.PI / 4) * (ep & 1);
    depLine(hx, hy, hx + Math.cos(a) * r, hy + Math.sin(a) * r, 1, 0.5);
  }
}

// ------------------------------------------------------------ the hour: Jacob's ladder
//
// The coil plays the hour out: four beats, each striking one old digit from
// the right, so what is left is always the start of the old time. The coil
// sinks out of sight, and two rails rise in a V in its place: a Jacob's
// ladder. An arc strikes across the narrow gap at the foot and climbs,
// stretching, bowing upwards, until it breaks at the top; again; the third
// climbs to the top of the digits and hangs there, quivering. Then it
// drops into the four slots: one chain of lightning from edge to edge
// through four torches, which weld the new hour all at once. The chain
// lets go, the rails sink and the coil rises back.

const BEATS = [-3.6, -2.9, -2.2, -1.5];         // strikes on slots 3, 2, 1, 0
const H_LEAD = 0.4;
const H_SINK0 = -1.0, H_SINK1 = -0.3, H_RAILS = 0.6;
const CLIMBS = [[0.3, 1.35], [1.35, 2.25]];
const C3 = [2.25, 3.0], HOLD_Y = 9, H_WELD0 = 3.2, H_WELD = 1.5;
const H_RISE0 = 5.0, H_RISE1 = 5.9;

/** How far the coil has sunk below its place, px. */
function coilDrop(tau) {
  if (tau < H_SINK0 || tau > H_RISE1) return 0;
  if (tau < H_SINK1) return 72 * ease.inCubic((tau - H_SINK0) / (H_SINK1 - H_SINK0));
  if (tau < H_RISE0) return 72;
  return 72 * (1 - ease.outBack((tau - H_RISE0) / (H_RISE1 - H_RISE0)));
}

/** The ladder's rails: x of the left (side -1) or right rail at height y. */
const railX = (cx, y, side) => cx + side * (4 + (58 * (62 - y)) / 54);

/** How far the rails have risen (0..1) and sunk again (px). */
function railState(tau) {
  const up = smooth01((tau - H_SINK1) / H_RAILS);
  const down = 70 * ease.inCubic(clamp((tau - H_WELD0 - 0.2) / 0.6, 0, 1));
  return { up, down };
}

/** The ladder arc at height yb (its ends on the rails), bowed `bow` px. */
function ladderArc(cx, yb, bow, T, e) {
  const xl = railX(cx, yb, -1), xr = railX(cx, yb, 1);
  const ep = Math.floor(T * 30);
  drawBolt(bolt(xl, yb, xr, yb, (hash(ep, 77) * 1e9) | 0, 0.2, 2, 1.4, bow), e, 1, 0.6);
  drawBolt(bolt(xl, yb, xr, yb, (hash(ep - 1, 77) * 1e9) | 0, 0.2, 0, 1.4, bow), 0.35 * e, 1, 0.2);
}

function hourShow(g, a, b, ox, oy, cx, ty, T, tau, key) {
  let flash = 0;
  // The beats: the old digits are struck from the right.
  for (let k = 0; k < 4; k++) {
    const x0 = SLOT_X[k] + ox, y0 = TOP + oy;
    const sTime = tau - BEATS[3 - k];
    if (sTime < HOT + 1.1) {
      const agit = 0.35 * Math.exp(-Math.min(...BEATS.map((tb) => Math.abs(tau - tb))) / 0.2);
      flash = Math.max(flash, strikeSlot(GLYPH[a[k]], x0, y0, cx, ty, T, sTime, H_LEAD, k, key, agit, 0));
    }
  }
  // The ladder.
  const ybot = 61 + oy, ytop = HOLD_Y + oy;
  for (const [c0, c1] of CLIMBS) {
    if (tau < c0 || tau >= c1) continue;
    const u = (tau - c0) / (c1 - c0);
    const yb = ybot - (ybot - 3 - oy) * u ** 1.7;
    const w = railX(cx, yb, 1) - railX(cx, yb, -1);
    const fade = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    ladderArc(cx, yb, 2 + 0.1 * w, T, 1.5 * fade);
    if (u < 0.08) { dep(cx - 0.5, ybot, 3.4); flash = Math.max(flash, 0.4 * (1 - u / 0.08)); }
  }
  if (tau >= C3[0] && tau < H_WELD0) {
    const u = clamp((tau - C3[0]) / (C3[1] - C3[0]), 0, 1);
    const yb = ybot - (ybot - ytop) * ease.outCubic(u);
    const w = railX(cx, yb, 1) - railX(cx, yb, -1);
    const settle = smooth01((tau - C3[1]) / 0.2);
    ladderArc(cx, yb + 1.5 * Math.sin(T * 40) * settle, (2 + 0.1 * w) * (1 - 0.7 * settle), T, 1.5);
    if (u < 0.08) dep(cx - 0.5, ybot, 3.4);
  }
  // The chain: edge to edge through four torches welding the new hour.
  if (tau >= H_WELD0) {
    const tw = tau - H_WELD0;
    const nodes = [[0, ytop]];
    for (let k = 0; k < 4; k++) {
      const x0 = SLOT_X[k] + ox, y0 = TOP + oy;
      drawWeld(GLYPH[b[k]], b[k], x0, y0, T, tw, k, key * 4 + k + 9, H_WELD, null);
      const h = planOf(b[k], H_WELD).head(Math.min(tw, H_WELD));
      nodes.push([x0 + h.x, y0 + h.y]);
    }
    nodes.push([W, ytop]);
    if (tw < H_WELD) {
      const ep = Math.floor(T * 30);
      for (let i = 1; i < nodes.length; i++) {
        const [ax, ay] = nodes[i - 1], [bx, by] = nodes[i];
        drawBolt(bolt(ax, ay, bx, by, (hash(ep, i, 78) * 1e9) | 0, 0.3, 1, 1.3, 3), 1.2, 1, 0.4);
      }
    }
  }
  return flash;
}

/** The rails, drawn over the glow. */
function drawRails(g, cx, oy, tau) {
  const { up, down } = railState(tau);
  if (up <= 0 || down > 64) return;
  const yTop = 63 - (63 - 3 - oy) * up;
  for (const side of [-1, 1])
    for (let y = Math.ceil(yTop); y <= 63; y++) {
      const yy = y + down;
      if (yy > 63) break;
      const x = railX(cx, y, side);
      g.pixel(x, yy, 1);
      g.pixel(x + side, yy, (y & 1) ? 1 : 0);
    }
}

// ------------------------------------------------------------ the design

const DAY = 0xcf, NIGHT = 0x20;

export default {
  name: 'Tesla',
  blurb: 'A Tesla coil writes the time in braided plasma: on the minute it charges, blasts the old digit with lightning and arc-welds the new one; a Jacob\'s ladder on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    E.fill(0); CORE.fill(0);
    const T = f.h * 3600 + f.m * 60 + f.sec;      // local seconds: phases of the steady glow
    const [ox, oy] = orbit(date, 2, 3);
    const ep = Math.floor(T * 20);
    DX = Math.floor(hash(ep, 1, 99) * 8); DY = Math.floor(hash(ep, 2, 99) * 8);
    const cx = CX + ox, ty = TOR_Y + oy;

    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const a = digitsOf(from), b = digitsOf(to);
    const changed = a.map((d, k) => hour || d !== b[k]);
    const key = to.minuteKey % 1000003;

    // How charged the coil is: idling, a puff on every second, the run-up
    // to a strike, and the work of welding; on the hour, a kick on every beat.
    const tick = Math.exp(-(f.sec % 1) / 0.12);
    const charge = smooth01((tau - CHARGE0) / (STRIKE - CHARGE0));
    let act = 0.2 + 0.25 * tick;
    if (hour) {
      for (const tb of BEATS) act += tau < tb ? 0.8 * Math.exp((tau - tb) / 0.25) : 0.8 * Math.exp(-(tau - tb) / 0.2);
    } else if (tau < STRIKE) act += 0.8 * charge * charge;
    else act += 0.9 * Math.exp(-(tau - STRIKE) / 0.5) + 0.3 * (tau < WELD0 + WELD_STAGGER + WELD_DUR ? 1 : 0);
    const drop = hour ? coilDrop(tau) : 0;
    let level = 0.12 + 0.05 * tick;
    if (hour) {
      const i = BEATS.findIndex((tb) => tau < tb);
      if (i >= 0) level = 0.2 + 0.75 * smooth01((tau - (i ? BEATS[i - 1] : BEATS[0] - 1.6)) / (BEATS[i] - (i ? BEATS[i - 1] : BEATS[0] - 1.6)));
      else if (tau < H_RISE0) level = 0.2;
      else level = 0.12 + 0.3 * Math.exp(-(tau - H_RISE1) / 0.6);
    } else if (changed.some(Boolean)) {
      const end = WELD0 + WELD_STAGGER * (changed.filter(Boolean).length - 1) + WELD_DUR;
      if (tau < STRIKE) level += 0.85 * charge;
      else level = 0.12 + 0.45 * clamp(1 - (tau - STRIKE - 0.1) / (end - STRIKE), 0, 1) + 0.4 * Math.exp(-(tau - STRIKE) / 0.06);
    }
    level = clamp(level, 0, 1);
    if (drop < 60) coilGlow(cx, oy + drop, level);
    if (drop < 50) drawCorona(cx, ty + drop, T, Math.min(1, act));

    let order = 0, flash = 0;
    const show = hour && tau > BEATS[0] - H_LEAD - 0.5 && tau < H_RISE1 + 1;
    if (show) flash = hourShow(g, a, b, ox, oy, cx, ty, T, tau, key);
    else for (let k = 0; k < 4; k++) {
      const x0 = SLOT_X[k] + ox, y0 = TOP + oy;
      if (!changed[k]) { drawPlasma(GLYPH[b[k]], x0, y0, T, k); drawSpits(GLYPH[b[k]], x0, y0, T, k); continue; }
      flash = Math.max(flash, minuteSlot(GLYPH[a[k]], b[k], x0, y0, cx, ty, T, tau, k, key, order++, charge));
    }

    compose(g);
    if (hour) drawRails(g, cx, oy, tau);
    if (drop < 60) drawCoil(g, cx, oy + drop, level, T);
    const base = DAY + (NIGHT - DAY) * night;
    oled.contrast(base + (255 - base) * flash * (1 - 0.85 * night));   // at night the flash is a gentle one
  },
};
