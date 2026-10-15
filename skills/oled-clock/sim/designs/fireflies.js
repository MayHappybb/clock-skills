// Fireflies — a summer meadow at night; the time is written in fireflies.
//
// Each digit is a string of fireflies hovering along a looping, light-trail
// hand of its own (monoline script: a looped 2, an open 4, a crossed 7), each
// one a bright core in a soft halo. Their light is summed into one glow
// field and thresholded against blue-ish noise, so overlapping halos melt
// into a luminous stroke and everything moves at sub-pixel resolution. The
// formation drifts and breathes, and every few seconds a spark runs along
// each stroke in the order it was "written". Free fireflies wander low over
// the grass with the Big Dipper's flash (Photinus pyralis: a half-second
// glow every five or six seconds, climbing as it flashes, the J-stroke).
// The grass sways in front of them, its blades dark against their glow.
//
// The minute: from :56 the changing digit's fireflies start to flicker out
// of step, then unravel from it in stroke order and wander off, blinking on
// their own; by :00 the digit is gone and the meadow has gone dark, holding
// its breath. Then it syncs, as Photinus carolinus does in the Smokies:
// bursts of flashes, half a second apart, sweep out across the whole meadow
// as waves from the empty slot, and every free firefly and every resting
// digit flashes as a wave passes. The wanderers move only in the dark, so
// each flash shows them closer to their new places, the new digit drawing
// itself in stroke order, until a last flash, brighter than all, lights it
// with a bloom that settles into the steady glow.
//
// The hour: a jar. It comes down into the meadow, and every firefly of the
// time spirals into it, one after another; the lid drops on, and inside they
// fall into step, the jar a pulsing lantern. It wobbles, the lid pops off
// and spins away, and they pour out in a fountain, flashing in waves, and
// fly to the new hour; the jar is lifted away, and the whole time blooms in
// one synchronised flash.
//
// Everything is closed-form in time: positions are home, a wander path of
// sines, or eased curves between them, and every flash is a function of the
// seconds from the turn. Glyphs and plans are cached only to save work.
//
// Burn-in: the face walks kit.orbit, the formation drifts, the threshold
// noise is re-dealt every minute, and from 23:00 to 07:00 the panel dims.

import { clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const DW = 24, DH = 34, TOP = 4;
const SLOT_X = [3, 29, 76, 102];
const SLANT = 0.12;

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
// A monoline script, as a firefly would write it in light: centre-lines in
// a 20 x 34 box (y down) before the slant. Each digit is a list of pieces;
// a piece is ['s', points] (a smooth Catmull-Rom curve through them) or
// ['l', points] (straight, with corners). Consecutive pieces of one stroke
// share their end point; a new stroke starts with 'S' / 'L'.

/** Catmull-Rom through `pts`, `n` samples per span. */
function spline(pts, n = 10) {
  const P = [pts[0], ...pts, pts.at(-1)];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push([...pts.at(-1)]);
  return out;
}

function ellipse(cx, cy, rx, ry, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]); }
  return pts;
}

const GLYPH_SRC = {
  0: [['L', ellipse(10, 17, 7.8, 15.4)]],
  1: [['S', [[3, 9.5], [7, 6.5], [10.5, 3], [12.6, 0.6]]], ['l', [[12.6, 0.6], [11.4, 34]]]],
  2: [['S', [[2.2, 8.5], [4.8, 2.2], [10.5, 0.6], [16.4, 3.4], [17.2, 9.6], [13.4, 16.6], [7.6, 23.4], [3.4, 29.6], [2.4, 33.2], [5.6, 32.6], [10.6, 31.8], [15.6, 33], [20, 32]]]],
  3: [['S', [[2.2, 4.6], [6.8, 1], [12.8, 0.8], [16.6, 4.8], [15.4, 10.4], [10.4, 14.8], [7.4, 16]]],
      ['s', [[7.4, 16], [13, 16.4], [17.6, 21], [17.6, 27.6], [13, 33], [6.6, 33.6], [1.4, 29.6]]]],
  4: [['L', [[14.2, 0.6], [1.6, 23], [21, 23]]], ['L', [[15.6, 9.5], [15.6, 34]]]],
  5: [['L', [[18.4, 1], [5.4, 1], [4.2, 15]]], ['s', [[4.2, 15], [9.4, 13], [15, 14.6], [18, 20.4], [17.6, 27.2], [13, 32.6], [7, 33.6], [1.6, 30]]]],
  6: [['S', [[16.6, 2.6], [12, 0.6], [6.6, 2], [3, 8], [1.8, 17], [2.6, 26], [6, 32.4], [11, 34], [16, 31], [18, 25], [16, 19.4], [11, 17.4], [5.6, 19.4], [2.4, 24]]]],
  7: [['L', [[2, 3.6], [2.6, 1.4], [19.6, 1.4]]], ['s', [[19.6, 1.4], [14.4, 10], [10.4, 20], [8.4, 34]]], ['L', [[6.4, 18], [16.6, 18]]]],
  8: [['S', [[10, 16.5], [15, 13], [16.5, 7.5], [14, 2], [10, 0.6], [6, 2], [3.6, 7.5], [5, 13], [10, 16.5], [15.6, 20.6], [18, 26], [16, 31.6], [10, 34], [4, 31.6], [2, 26], [4.4, 20.6], [10, 16.5]]]],
  9: [['S', [[17.2, 10.6], [13, 15.6], [7, 16.4], [3, 13], [2.6, 6.6], [6, 1.6], [11, 0.6], [16, 3], [17.6, 9], [16.6, 20], [13.6, 28], [9, 34]]]],
};

const SP = 3.2;   // fireflies along a stroke, px apart

/**
 * A digit as fireflies: each stroke's curve walked at a fixed spacing, so
 * every firefly has a place and a position along the writing (`s`, 0..1 in
 * the order the digit is written), for the sparks that run along it.
 */
function buildGlyph(d) {
  const strokes = [];
  for (const [kind, pts] of GLYPH_SRC[d]) {
    const curve = kind.toLowerCase() === 's' ? spline(pts) : pts;
    if (kind === 'S' || kind === 'L' || !strokes.length) strokes.push([...curve]);
    else strokes.at(-1).push(...curve.slice(1));
  }
  const xs = [], ys = [], ss = [];
  let total = 0;
  for (const st of strokes) for (let i = 1; i < st.length; i++) total += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  let acc = 0;
  for (const st of strokes) {
    let len = 0;
    for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
    const closed = Math.hypot(st[0][0] - st.at(-1)[0], st[0][1] - st.at(-1)[1]) < 0.5;
    const n = Math.max(2, Math.round(len / SP) + (closed ? 0 : 1));
    const step = closed ? len / n : len / (n - 1);
    let seg = 1, segStart = 0;
    for (let k = 0; k < n; k++) {
      const target = k * step;
      while (seg < st.length - 1 && segStart + Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]) < target) {
        segStart += Math.hypot(st[seg][0] - st[seg - 1][0], st[seg][1] - st[seg - 1][1]); seg++;
      }
      const a = st[seg - 1], b = st[seg], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const u = clamp01((target - segStart) / l);
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      xs.push(x + SLANT * (DH - y)); ys.push(y); ss.push((acc + target) / total);
    }
    acc += len;
  }
  const n = xs.length;
  const p = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) p[i] = hash(i, d, 41);
  return { n, x: Float32Array.from(xs), y: Float32Array.from(ys), s: Float32Array.from(ss), p };
}
const GLYPHS = Array.from({ length: 10 }, (_, d) => buildGlyph(d));

// ------------------------------------------------------------ light
//
// All the fireflies' light goes into one field: a bright core split over
// the four pixels nearest the firefly (so it moves at sub-pixel steps), a
// halo round it, and in a flash a wide bloom. The field is then compared
// with a noise threshold (interleaved gradient noise, its offset re-dealt
// every minute) so halos are a soft, grainy fall-off rather than a grid.

const E = new Float32Array(W * H);
const HALO_R = 4, BLOOM_R = 7;

/** Add a firefly of brightness `I` (about 1 steady, 2+ in a flash) and `bloom` (0..1). */
const CORES = [];
function splat(x, y, I, bloom = 0) {
  if (I <= 0.03) return;
  CORES.push(x, y, I);
  const R = bloom > 0.02 ? BLOOM_R : HALO_R;
  const hk = 0.38 * Math.min(I, 1.6), bk = 0.32 * bloom * Math.min(I, 2.5);
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let py = cy - R; py <= cy + R; py++) {
    if (py < 0 || py >= H) continue;
    const dy = py + 0.5 - y;
    for (let px = cx - R; px <= cx + R; px++) {
      if (px < 0 || px >= W) continue;
      const dx = px + 0.5 - x, d2 = dx * dx + dy * dy;
      let v = d2 < 17 ? hk * Math.exp(-d2 / 5) : 0;
      if (bk > 0) v += bk * Math.exp(-d2 / 12);
      E[py * W + px] += v;
    }
  }
}

/**
 * The bright cores, drawn crisp over the grain of the halos: a dim firefly
 * is one pixel, a glowing one a 2x2 bead, a flashing one a small cross.
 */
function cores(g) {
  for (let i = 0; i < CORES.length; i += 3) {
    const x = CORES[i], y = CORES[i + 1], I = CORES[i + 2];
    if (I < 0.3) { if (I > 0.12) g.pixel(x, y); continue; }
    const ix = Math.round(x - 1), iy = Math.round(y - 1);
    if (I < 0.6) { g.pixel(ix + (x - ix > 1 ? 1 : 0), iy + (y - iy > 1 ? 1 : 0)); continue; }
    g.fillRect(ix, iy, 2, 2);
    if (I > 1.45) { g.pixel(ix - 1, iy); g.pixel(ix + 2, iy + 1); g.pixel(ix + 1, iy - 1); g.pixel(ix, iy + 2); }
  }
  CORES.length = 0;
}

/** Light every pixel whose glow beats its noise threshold. */
function develop(g, key) {
  const ox = (key * 7) % 64, oy = (key * 13) % 64;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = E[y * W + x];
      if (e < 0.04) continue;
      const t = (52.9829189 * ((0.06711056 * (x + ox) + 0.00583715 * (y + oy)) % 1)) % 1;
      if (e > 0.06 + 0.94 * t) g.pixel(x, y);
    }
}

// ------------------------------------------------------------ flashing

/** One flash: a quick rise, a held glow, a slower fade; `t` seconds since it began. */
function flash(t, len = 0.32) {
  if (t <= 0 || t >= len) return 0;
  const u = t / len;
  return u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75) ** 0.8;
}

/**
 * A free firefly's own pattern, the Big Dipper's: a half-second glow every
 * 4.5-7 s. Returns [brightness, lift]: it climbs as it flashes (the J).
 */
const DIP = [0, 0];
function dipper(T, p0, p1) {
  const P = 6 + 6 * p0, u = (((T + p1 * P) % P) + P) % P / 0.6;
  if (u >= 1) { DIP[0] = 0; DIP[1] = 0; return DIP; }
  DIP[0] = 1.15 * Math.sin(Math.PI * u) ** 0.8; DIP[1] = 2.5 * u * (1 - u) * 2 - 6 * u * u;
  return DIP;
}

/** The synchronised waves of a turn: flash bursts sweeping out from `origin`. */
const WAVE = [0, 0];
function wavesAt(tau, x, y, S) {
  WAVE[0] = 0; WAVE[1] = 0;
  if (!S || tau < S.t0 - 0.1 || tau > S.end + 3) return WAVE;
  const d = Math.hypot(x - S.ox, (y - S.oy) * 1.3) / S.v;
  let I = 0;
  for (let k = 0; k < S.times.length; k++) I += S.amp[k] * flash(tau - S.times[k] - d);
  const tf = tau - S.final - d;
  const fin = tf > 0 ? Math.exp(-tf / 0.5) * smooth(tf / 0.06) : 0;
  WAVE[0] = I + 1.8 * fin; WAVE[1] = fin;
  return WAVE;
}

// ------------------------------------------------------------ the meadow

const AMBIENT = Array.from({ length: 40 }, (_, i) => ({
  x: 4 + 120 * hash(i, 1, 51), y: (i < 28 ? 38 : 8) + (i < 28 ? 20 : 30) * hash(i, 2, 51),
  w: 0.6 + 0.8 * hash(i, 3, 51), a: 6.3 * hash(i, 4, 51), b: 6.3 * hash(i, 5, 51),
  p0: hash(i, 6, 51), p1: hash(i, 7, 51),
}));

function ambientAt(f, T, out) {
  out[0] = f.x + 13 * Math.sin(T * 0.05 * f.w + f.a) + 5 * Math.sin(T * 0.17 + f.b);
  out[1] = f.y + 4 * Math.sin(T * 0.09 * f.w + f.b) + 1.5 * Math.sin(T * 0.37 + f.a);
  return out;
}

// Grass grows in tufts: blades fanning out of one root, curling over.
const BLADES = [];
for (let t = 0; t < 17; t++) {
  const x = (t + 0.2 + 0.6 * hash(t, 1, 61)) * (W / 17), n = 3 + Math.floor(3 * hash(t, 2, 61));
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1) - 0.5) * 0.75 + (hash(t, k + 3, 62) - 0.5) * 0.25;
    BLADES.push({ x: x + (k - n / 2) * 0.6, a, len: 7 + 12 * hash(t, k + 9, 63) ** 1.5 * (1 - 0.5 * Math.abs(a)), ph: 6.3 * hash(t, 4, 61) + k * 0.4 });
  }
}

/**
 * The grass, in front of the fireflies: a blade is a silhouette where it
 * crosses their glow, and elsewhere only its moonlit upper part shows.
 */
function grass(g, T, key, ox) {
  for (const b of BLADES) {
    const x0 = b.x + ox;
    const sw = 0.09 * Math.sin(T * 0.8 - x0 * 0.05 + b.ph * 0.15) + 0.03 * Math.sin(T * 1.9 + b.ph);
    const n = Math.ceil(b.len * 1.3);
    let px = -1, py = -1;
    for (let j = 0; j <= n; j++) {
      const u = j / n, a = b.a * (0.7 + 0.6 * u) + sw * (1 + 3 * u * u);
      const x = Math.floor(x0 + b.len * u * Math.sin(a)), y = Math.floor(H + 0.5 - b.len * u * Math.cos(a));
      if ((x === px && y === py) || x < 0 || x >= W || y < 0 || y >= H) continue;
      px = x; py = y;
      if (E[y * W + x] > 0.1) g.pixel(x, y, 0);
      else if (u > 0.5 || (u > 0.3 && hash(j, Math.floor(b.x * 7), key) < 0.5)) g.pixel(x, y, 1);
    }
  }
}

// ------------------------------------------------------------ the digits at rest

/** A firefly in formation: its place plus a slow drift. Writes [x, y]. */
function homeAt(gl, i, k, ox, oy, T, out) {
  const p = gl.p, j = i * 4;
  out[0] = SLOT_X[k] + ox + gl.x[i] + 0.45 * Math.sin(T * (0.5 + 0.6 * p[j + 1]) + 6.3 * p[j + 2]);
  out[1] = TOP + oy + gl.y[i] + 0.55 * Math.sin(T * (0.4 + 0.5 * p[j + 3]) + 6.3 * p[j]);
  return out;
}

/**
 * How bright a firefly in formation is: a steady glow that breathes, and a
 * spark that runs along each digit in the order it is written, every 6.5 s
 * (each slot a little after the last).
 */
function restI(gl, i, k, T) {
  const p = gl.p[i * 4 + 1];
  const f = (((T / 6.5 + k * 0.13) % 1) + 1) % 1 * 1.6 - 0.3;
  const spark = Math.exp(-(((gl.s[i] - f) / 0.05) ** 2));
  return 0.78 + 0.14 * Math.sin(T * (0.9 + 0.8 * p) + 6.3 * p) + 0.9 * spark;
}

const DIG = (c) => `${c.hh}${c.mm}`;
const COLON = [[64, 12], [63, 25]];

// ------------------------------------------------------------ the turn plan

const PLANS = new Map();
function planFor(from, to) {
  const key = to.minuteKey;
  let p = PLANS.get(key);
  if (!p) {
    if (PLANS.size > 4) PLANS.clear();
    p = makePlan(from, to, key);
    PLANS.set(key, p);
  }
  return p;
}

function makePlan(from, to, key) {
  const hour = to.m === 0;
  const A = DIG(from), B = DIG(to);
  const changing = [0, 1, 2, 3].map((k) => hour || A[k] !== B[k]);
  const old = [], neu = [];
  for (let k = 0; k < 4; k++) {
    if (!changing[k]) continue;
    const ga = GLYPHS[A[k]], gb = GLYPHS[B[k]];
    for (let i = 0; i < ga.n; i++) old.push([ga, i, k, k + ga.s[i]]);
    for (let i = 0; i < gb.n; i++) neu.push([gb, i, k, k + gb.s[i]]);
  }
  // In writing order, so the old digit unravels from its first stroke and
  // the new one is drawn the way it is written.
  old.sort((a, b) => a[3] - b[3]); neu.sort((a, b) => a[3] - b[3]);
  const ks = [0, 1, 2, 3].filter((k) => changing[k]);
  const X0 = ks.reduce((s, k) => s + SLOT_X[k] + DW / 2, 0) / ks.length;
  const N = Math.max(old.length, neu.length);
  const fly = [];
  for (let j = 0; j < N; j++) {
    const h = (s) => hash(j, s, key), r = j / Math.max(1, N - 1);
    fly.push({
      src: j < old.length ? old[j] : null,
      dst: j < neu.length ? neu[j] : null,
      r,
      leave: -3.0 + 2.0 * r + 0.15 * h(1),
      come: 0.6 + 1.0 * r + 0.1 * h(2),
      // Where it wanders: somewhere over the meadow round the slot.
      wx: Math.max(4, Math.min(124, X0 + (h(3) - 0.5) * 80)), wy: 8 + 48 * h(4),
      wa: 6 + 8 * h(5), wb: 4 + 5 * h(6), ww: 0.6 + 0.7 * h(7), wp: 6.3 * h(8),
      fp: 1.3 + 0.9 * h(9), fo: h(10),
      part: h(11),
    });
  }
  if (hour) {
    // Caught nearest the jar first; let go in a shuffled fountain.
    const dist = (e) => (e ? Math.abs(SLOT_X[e[2]] + e[0].x[e[1]] - 64) : 60);
    const order = fly.map((_, j) => j).sort((a, b) => dist(fly[a].src) + 8 * hash(a, 12, key) - dist(fly[b].src) - 8 * hash(b, 12, key));
    order.forEach((j, q) => { fly[j].catch = -5.0 + 3.3 * (q / Math.max(1, N - 1)); });
    fly.forEach((f, j) => {
      const h = (s) => hash(j, s, key);
      f.release = 1.75 + 1.3 * h(13);
      f.side = h(14) < 0.5 ? -1 : 1; f.arc = 0.5 + 0.5 * h(15);
      f.jx = h(16); f.jy = h(17); f.jw = 0.8 + 0.8 * h(18);
      f.mx = 4 + 120 * h(19); f.my = 40 + 18 * h(20);     // where a spare one comes from or goes to
    });
    const S = { t0: 1.9, times: [1.9, 2.45, 3.0, 3.55, 4.1], amp: [0.6, 0.7, 0.8, 0.9, 1.0], final: 4.7, end: 4.7, ox: 64, oy: 22, v: 130 };
    return { hour, changing, fly, X0: 64, S, key };
  }
  const S = { t0: 0.7, times: [0.7, 1.2, 1.7, 2.2, 2.7], amp: [0.5, 0.65, 0.8, 0.95, 1.05], final: 3.3, end: 3.3, ox: X0, oy: 20, v: 150 };
  return { hour, changing, fly, X0, S, key };
}

const Q = [0, 0], R = [0, 0], U = [0, 0];

/** A wanderer's loop over the meadow at wall time T. */
function wanderAt(f, T, out) {
  out[0] = f.wx + f.wa * Math.sin(T * 0.7 * f.ww + f.wp) + 2 * Math.sin(T * 1.9 + f.wp);
  out[1] = f.wy + f.wb * Math.sin(T * 0.9 * f.ww + 2 * f.wp) + 1.5 * Math.sin(T * 2.3 + f.wp);
  return out;
}

/** The minute: unravel, wander, the meadow goes dark, syncs, and the new digit is lit. */
function drawMinute(plan, T, tau, ox, oy) {
  const S = plan.S;
  for (const f of plan.fly) {
    let x, y, I = 0, bloom = 0;
    wanderAt(f, T, R);
    if (f.src && tau < f.leave) {
      // Still in the old digit, flickering more and more out of step.
      const [gl, i, k] = f.src;
      homeAt(gl, i, k, ox, oy, T, Q);
      const rk = smooth((tau - f.leave + 2.6) / 2.6);
      const fl = 0.5 + 0.5 * Math.sin(T * (8 + 7 * f.part) + 40 * f.fo);
      x = Q[0]; y = Q[1]; I = restI(gl, i, k, T) * (1 - 0.75 * rk * fl * fl);
    } else if (tau < f.come) {
      // Wandering, blinking on its own until the meadow falls quiet.
      let e = 1, steady = 0;
      if (f.src) {
        const [gl, i, k] = f.src;
        homeAt(gl, i, k, ox, oy, T, Q);
        e = inOut((tau - f.leave) / 1.3);
        steady = (1 - smooth((tau - f.leave) / 0.5)) * 0.8;
      } else { Q[0] = R[0]; Q[1] = R[1]; }
      x = lerp(Q[0], R[0], e); y = lerp(Q[1], R[1], e);
      const own = 0.22 + 1.1 * flash((((T + f.fo * f.fp) % f.fp) + f.fp) % f.fp, 0.5);
      I = steady + own * (f.src ? smooth((tau - f.leave) / 0.4) : 0) * (1 - smooth((tau + 0.6) / 0.7));
    } else {
      // Converging in the dark: only the flashes show where it has got to.
      const e = inOut((tau - f.come) / 1.6);
      if (f.dst) {
        const [gl, i, k] = f.dst;
        homeAt(gl, i, k, ox, oy, T, Q);
        x = lerp(R[0], Q[0], e); y = lerp(R[1], Q[1], e);
      } else { x = R[0] + (R[0] - plan.X0) * 0.6 * e; y = R[1] + 20 * e; }
    }
    const [wv, fin] = wavesAt(tau, x, y, S);
    const joins = f.part < 0.35 + 0.65 * smooth((tau - 0.5) / 2.2);
    if (joins) { I += wv; bloom = fin; }
    // After the last flash reaches it, a new digit's firefly glows steadily;
    // a firefly with no place in it fades out with that flash.
    const lit = tau - S.final - Math.hypot(x - S.ox, (y - S.oy) * 1.3) / S.v;
    if (f.dst && lit > 0) {
      const [gl, i, k] = f.dst;
      I += restI(gl, i, k, T) * smooth(lit / 0.6);
    } else if (!f.dst && lit > 0) I *= Math.exp(-lit / 0.3);
    splat(x, y, I, bloom);
  }
}

// ------------------------------------------------------------ the hour: a jar

/**
 * The jar at tau: centre of its body, tilt, and where its lid is relative
 * to the rim (null once it has flown). It comes down into the meadow,
 * hangs there with a gentle bob, wobbles before the lid pops, and is lifted
 * away once it is empty.
 */
function jarAt(tau, out) {
  const down = inOut((tau + 6.6) / 1.6), up = ease3((tau - 3.5) / 1.6);
  out.x = 64 + 12 * (1 - down) - 6 * up;
  out.y = -34 + 58 * down - 70 * up + 0.8 * Math.sin(tau * 2.1);
  const wob = smooth((tau - 0.8) / 0.3) * (1 - smooth((tau - 1.55) / 0.08));
  out.tilt = 0.09 * (1 - down) * Math.sin(tau * 5) + wob * 0.16 * Math.sin((tau - 0.8) * 26) + up * 0.12;
  // The lid: dropped on at -1.3 with a bounce, popped off at 1.6.
  const tl = tau + 1.3;
  out.lid = null;
  if (tl > -0.4 && tau < 1.6) {
    const fall = clamp01((tl + 0.4) / 0.4);
    const bounce = tl > 0 ? 2.2 * Math.abs(Math.sin(tl * 9)) * Math.exp(-tl * 5) : 0;
    out.lid = [0, -26 * (1 - fall * fall) - bounce, 0];
  } else if (tau >= 1.6) {
    const t = tau - 1.6;
    if (t < 1.2) out.lid = [18 * t, -60 * t + 30 * t * t * 0.3, t * 9];
  }
  return out;
}
const ease3 = (u) => { u = clamp01(u); return u * u * u; };

// The jar's outline in its own frame (y down, 0 at the body's centre).
const JAR = (() => {
  const r = 5, x0 = -11, x1 = 11, y0 = -9, y1 = 14;
  const pts = [[-8, -13], [-8, -11], [x0 + 1, y0 - 0.5], [x0, y0 + 3], [x0, y1 - r]];
  for (let a = 1; a <= 6; a++) { const t = (a / 6) * (Math.PI / 2); pts.push([x0 + r - r * Math.cos(t), y1 - r + r * Math.sin(t)]); }
  pts.push([x1 - r, y1]);
  for (let a = 1; a <= 6; a++) { const t = (a / 6) * (Math.PI / 2); pts.push([x1 - r + r * Math.sin(t), y1 - r + r * Math.cos(t)]); }
  pts.push([x1, y0 + 3], [x1 - 1, y0 - 0.5], [8, -11], [8, -13]);
  return pts;
})();
const RIM = [[-9.5, -13], [9.5, -13], [9.5, -15], [-9.5, -15], [-9.5, -13]];
const LID = [[-10.5, -15.5], [10.5, -15.5], [10.5, -18.5], [-10.5, -18.5], [-10.5, -15.5]];

function jarPoint(J, x, y, out) {
  const c = Math.cos(J.tilt), s = Math.sin(J.tilt);
  out[0] = J.x + x * c - (y - 14) * s; out[1] = J.y + 14 + x * s + (y - 14) * c;
  return out;
}

function polyline(g, J, pts, dx = 0, dy = 0, rot = 0) {
  let px = null, py = null;
  for (const [x0, y0] of pts) {
    const x = x0 * Math.cos(rot) - (y0 + 17) * Math.sin(rot), y = x0 * Math.sin(rot) + (y0 + 17) * Math.cos(rot) - 17;
    jarPoint(J, x + dx, y + dy, U);
    if (px !== null) g.line(px, py, U[0], U[1]);
    px = U[0]; py = U[1];
  }
}

function drawJar(g, J) {
  if (J.y < -40) return;
  polyline(g, J, JAR);
  polyline(g, J, RIM);
  // A glint down the glass.
  for (let y = -4; y <= 8; y += 2) { jarPoint(J, -7.5, y, U); g.pixel(U[0], U[1]); }
  if (J.lid) polyline(g, J, LID, J.lid[0], J.lid[1], J.lid[2] || 0);
}

/** Where a firefly bobs about inside the jar. */
function insideJar(f, J, T, out) {
  return jarPoint(J, 7.5 * Math.sin(T * 1.7 * f.jw + 6.3 * f.jx), 3 + 9 * Math.sin(T * 1.3 * f.jw + 6.3 * f.jy), out);
}

const JS = { x: 0, y: 0, tilt: 0, lid: null }, JR = { x: 0, y: 0, tilt: 0, lid: null };
const M = [0, 0], M2 = [0, 0];

/** The hour: caught in the jar, a lantern, let go, home, and one great flash. */
function drawHour(plan, T, tau, ox, oy) {
  const S = plan.S;
  jarAt(tau, JS);
  jarPoint(JS, 0, -14, M);
  for (const f of plan.fly) {
    let x, y, I;
    if (tau < f.catch + 1.1) {
      // Waiting (restless), then caught: a swoop up and into the mouth.
      if (f.src) { const [gl, i, k] = f.src; homeAt(gl, i, k, ox, oy, T, Q); }
      else { Q[0] = f.mx + 3 * Math.sin(T * 0.6 + f.jx * 6); Q[1] = f.my; }
      const u = (tau - f.catch) / 1.1;
      if (u <= 0) {
        const rk = smooth((tau - f.catch + 2.5) / 2.5), fl = 0.5 + 0.5 * Math.sin(T * (8 + 7 * f.part) + 40 * f.fo);
        x = Q[0]; y = Q[1];
        I = f.src ? restI(f.src[0], f.src[1], f.src[2], T) * (1 - 0.6 * rk * fl * fl) : 0.25 * dipper(T, f.jx, f.jy)[0];
      } else {
        insideJar(f, JS, T, R);
        const e = inOut(Math.min(1, u / 0.8));
        const bx = lerp(Q[0], M[0], e), by = lerp(Q[1], M[1], e) - 16 * Math.sin(Math.PI * Math.min(1, u / 0.8)) * (1 - 0.5 * u);
        const k = smooth((u - 0.75) / 0.25);
        x = lerp(bx, R[0], k); y = lerp(by, R[1], k);
        I = 1.0;
      }
    } else if (tau < f.release) {
      // In the jar: blinking each to its own beat, then all together.
      insideJar(f, JS, T, R);
      x = R[0]; y = R[1];
      const own = flash((((T + f.fo * f.fp) % f.fp) + f.fp) % f.fp, 0.4);
      const together = flash((((tau + 1.2) % 0.6) + 0.6) % 0.6, 0.34);
      const s = smooth((tau + 1.5 - 0.8 * f.part) / 0.8);
      I = 0.35 + 1.25 * lerp(own, together, s);
    } else {
      // Let go: a fountain out of the mouth, arcing over to its place.
      const u = (tau - f.release) / 1.5;
      if (f.dst) { const [gl, i, k] = f.dst; homeAt(gl, i, k, ox, oy, T, Q); }
      else { Q[0] = f.mx; Q[1] = f.my; }
      // From where the mouth was when it left, not where the jar is now.
      jarPoint(jarAt(f.release, JR), 0, -14, M2);
      const e = inOut(u), w = 1 - e;
      const cx = M2[0] + f.side * (12 + 22 * f.arc), cy = M2[1] - 26 - 10 * f.arc;
      x = w * w * M2[0] + 2 * w * e * cx + e * e * Q[0];
      y = w * w * M2[1] + 2 * w * e * cy + e * e * Q[1];
      if (u >= 1) { x = Q[0]; y = Q[1]; }
      I = u < 1 ? 0.75 : f.dst ? 0.6 : 0.3;
    }
    const [wv, fin] = wavesAt(tau, x, y, S);
    I += wv;
    const lit = tau - S.final - Math.hypot(x - S.ox, (y - S.oy) * 1.3) / S.v;
    if (f.dst && lit > 0) I += (restI(f.dst[0], f.dst[1], f.dst[2], T) - 0.6) * smooth(lit / 0.6);
    else if (!f.dst && lit > 0) I *= Math.exp(-lit / 0.3);
    splat(x, y, I, fin);
  }
}

// ------------------------------------------------------------ face

export default {
  name: 'Fireflies',
  blurb: 'A summer meadow at night; the time is fireflies in formation. Each minute the changing digit unravels, the meadow syncs in waves of flashes and the new digit lights in one bloom. On the hour a jar catches them all and lets them go.',
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
    const S = plan ? plan.S : null;
    const D = DIG(to);
    E.fill(0);
    // The digits at rest; they flash too when a wave of the turn passes.
    for (let k = 0; k < 4; k++) {
      if (plan && plan.changing[k]) continue;
      const gl = GLYPHS[D[k]];
      for (let i = 0; i < gl.n; i++) {
        homeAt(gl, i, k, ox, oy, T, Q);
        const [wv, fin] = wavesAt(tau, Q[0], Q[1], S);
        splat(Q[0], Q[1], restI(gl, i, k, T) + 1.0 * wv, Math.min(1, 0.35 * wv + 0.5 * fin));
      }
    }
    // The colon: two fireflies, breathing out of step.
    // (On the hour the jar hangs where the colon is: the colon goes out for it.)
    const away = plan && plan.hour ? smooth((tau + 5.4) / 0.8) * (1 - smooth((tau - 4.4) / 0.6)) : 0;
    for (let c = 0; c < 2; c++) {
      const x = COLON[c][0] + ox + 0.5 * Math.sin(T * 0.7 + c * 2), y = TOP + oy + COLON[c][1] + 0.6 * Math.sin(T * 0.53 + c);
      const [wv, fin] = wavesAt(tau, x, y, S);
      splat(x, y, (0.85 + 0.25 * Math.sin(T * 1.6 + c * Math.PI)) * (1 - away) + 1.0 * wv, Math.min(1, 0.35 * wv + 0.5 * fin));
    }
    // Free fireflies over the grass: their own flashes, hushed through a turn.
    const hush = plan ? smooth((tau + 1.4) / 0.8) * (1 - smooth((tau - 3.8) / 1)) : 0;
    for (const a of AMBIENT) {
      ambientAt(a, T, U);
      const [I, lift] = dipper(T, a.p0, a.p1);
      const [wv, fin] = wavesAt(tau, U[0], U[1], S);
      splat(U[0], U[1] + lift, I * (1 - hush) + wv, Math.max(fin, 0.4 * wv));
    }
    if (plan) (plan.hour ? drawHour : drawMinute)(plan, T, tau, ox, oy);
    develop(g, f.minuteKey);
    cores(g);
    grass(g, T, f.minuteKey, ox);
    if (plan && plan.hour) drawJar(g, jarAt(tau, JS));
    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};
