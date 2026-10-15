// Fogglass — the time written with a fingertip on a fogged window at night.
//
// The glass is the screen. The room is dark, so the condensation on it is
// invisible except where light from outside scatters in it: the halo of a
// street lamp behind the hour, the moon, the windows of a town across the
// valley as soft out-of-focus discs, a car's headlights crossing on the
// valley road. The time is not drawn, it is wiped: every numeral is a
// fingertip's trail through the fog, clear glass with a bead of pushed-up
// water standing along each side. Through the trails, and only through
// them, the night is sharp: stars, the lamp, a lit window. The hours are
// written big and high, once an hour; the minutes smaller, lower and to
// the right, as a hand writes a second line.
//
// Always: water gathers in the lower rim of each trail and every few
// seconds a bead swells, lets go and runs down stick-slip, clearing a track
// through the fog. The fog creeps back into the trails (the hour's, written
// once, slowly goes milky). The one at the window breathes, and each breath
// blooms faintly on the glass round the minutes and dries. They sway, so
// the outside drifts a few pixels against the glass.
//
// The minute: they breathe on the glass. A bloom of bright fog spreads over
// the changing minute digits, swallowing the old trail (its ghost stays
// darker in the cloud for a moment), and a finger, a dark silhouette
// against the lit breath, comes in from below and writes the new digit; the
// breath then dries back to the pane's own fog. The hour: the edge of a
// hand wipes the whole pane from left to right, water bowing ahead of it and
// streaks left behind, and for a moment the night is sharp everywhere, the
// crescent moon and all the stars; then a long breath from below fogs the
// pane again and the finger writes the whole time afresh.
//
// Everything is a function of the clock: each writing is fixed by the
// minute it was made (its digit, a seed that jitters the hand and its place
// on the glass), rasterised once into "when was this pixel wiped" and
// "when was water pushed onto it", and shown up to the finger's progress.
// Drops are derived from the writing's seed and the time since. Burn-in:
// every writing lands somewhere slightly different, the fog's droplet
// pattern (the dither phase) is new every hour, the outside drifts and the
// stars turn; the panel is dimmed at night.

import { dither, noise, smoothNoise, clamp, lerp, progress, ease, clockFields, segDist } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------ the hand
//
// Each numeral is written as a finger writes on glass: one or two strokes,
// each a run of knots [x, y, pressure] in a unit box (y down), smoothed by
// Catmull-Rom. A knot with a fourth element 1 is a corner: the finger stops
// and turns there, so the spline is broken at it.

const GLYPHS = {
  0: [[[0.66, 0.04], [0.3, 0.06], [0.06, 0.36], [0.08, 0.78], [0.42, 1.0], [0.82, 0.86], [0.97, 0.46], [0.84, 0.1], [0.52, 0.0], [0.34, 0.08, 0.8]]],
  1: [[[0.12, 0.26, 1.1], [0.42, 0.1], [0.62, 0.0, 1, 1], [0.6, 0.5], [0.58, 1.0, 0.9]]],
  2: [[[0.06, 0.26, 1.1], [0.3, 0.04], [0.7, 0.02], [0.92, 0.26], [0.78, 0.54], [0.42, 0.8], [0.04, 1.0, 1, 1], [0.5, 0.97], [1.0, 0.96, 0.85]]],
  3: [[[0.08, 0.14, 1.1], [0.46, 0.0], [0.86, 0.12], [0.84, 0.36], [0.42, 0.48, 1, 1], [0.88, 0.6], [0.94, 0.86], [0.52, 1.0], [0.04, 0.88, 0.85]]],
  4: [[[0.64, 0.0, 1.1], [0.3, 0.38], [0.0, 0.7, 1, 1], [0.5, 0.7], [1.0, 0.68, 0.85]],
      [[0.74, 0.32, 1.1], [0.72, 0.66], [0.7, 1.0, 0.9]]],
  5: [[[0.92, 0.02, 1.1], [0.24, 0.02, 1, 1], [0.16, 0.46, 1, 1], [0.56, 0.38], [0.92, 0.6], [0.86, 0.9], [0.44, 1.0], [0.04, 0.86, 0.85]]],
  6: [[[0.86, 0.04, 1.1], [0.44, 0.12], [0.08, 0.5], [0.08, 0.86], [0.46, 1.0], [0.9, 0.84], [0.92, 0.54], [0.52, 0.4], [0.12, 0.6, 0.85]]],
  7: [[[0.02, 0.04, 1.1], [1.0, 0.03, 1, 1], [0.66, 0.46], [0.4, 1.0, 0.9]]],
  8: [[[0.86, 0.16, 1.1], [0.5, 0.0], [0.12, 0.14], [0.2, 0.36], [0.6, 0.5], [0.96, 0.74], [0.66, 1.0], [0.1, 0.92], [0.12, 0.66], [0.6, 0.44], [0.9, 0.28], [0.7, 0.03, 0.8]]],
  9: [[[0.92, 0.2, 1.1], [0.54, 0.0], [0.08, 0.12], [0.06, 0.42], [0.46, 0.56], [0.92, 0.32, 1, 1], [0.86, 0.66], [0.64, 1.0, 0.9]]],
};

/** Catmull-Rom through a run of points, `n` samples per span. */
function spline(pts, n) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const q = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([q(0), q(1), q(2)]);
    }
  }
  out.push(pts[pts.length - 1].slice(0, 3));
  return out;
}

/**
 * A digit's path in pixels: strokes of [x, y, radius] samples ~0.35 px apart,
 * written in a box `wc` wide and `hc` tall leaning forward by `lean`.
 * `seed` jitters the knots a little: no two writings are the same.
 */
function digitPath(d, size, seed) {
  const { wc, hc, r, lean } = size;
  const strokes = [];
  GLYPHS[d].forEach((knots, si) => {
    const px = knots.map(([x, y, p = 1, c = 0], k) => {
      const jx = (noise(k * 7.1 + si * 31 + d, seed) - 0.5) * 0.06;
      const jy = (noise(k * 3.7 + si * 17 + d, seed + 9) - 0.5) * 0.05;
      const X = (x + jx) * wc + (1 - y) * hc * lean, Y = (y + jy) * hc;
      return [X, Y, p, c];
    });
    // split at corners, smooth each run
    const runs = [];
    let cur = [px[0]];
    for (let k = 1; k < px.length; k++) {
      cur.push(px[k]);
      if (px[k][3] && k < px.length - 1) { runs.push(cur); cur = [px[k]]; }
    }
    runs.push(cur);
    const pts = [];
    for (const run of runs) {
      const s = spline(run.map((p) => [p[0], p[1], p[2]]), 12);
      if (pts.length) s.shift();
      pts.push(...s);
    }
    // resample evenly
    const even = [pts[0]];
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay, ap] = pts[k - 1], [bx, by, bp] = pts[k];
      const L = Math.hypot(bx - ax, by - ay);
      let u = 0.35 - acc;
      while (u <= L) { const f = u / L; even.push([ax + (bx - ax) * f, ay + (by - ay) * f, ap + (bp - ap) * f]); u += 0.35; }
      acc = L - (u - 0.35);
    }
    even.push(pts[pts.length - 1]);
    strokes.push(even.map(([x, y, p]) => [x, y, r * p]));
  });
  return strokes;
}

// ------------------------------------------------------------ rasterised writing
//
// A writing is rasterised once into a small grid: for every pixel, the
// moment (0..1 of the writing) the finger first wiped it clear (`uc`) and
// the moment it first pushed water onto it (`ur`, the bright rim that stands
// along both sides of the trail and in front of the fingertip as it moves).

const RIM = 1.15;
const cache = new Map();

export function writing(d, size, seed) {
  const key = `${d}|${size.key}|${seed}`;
  let w = cache.get(key);
  if (w) return w;
  const strokes = digitPath(d, size, seed);
  // timing: each stroke eased (slow press, quicker middle, slow lift),
  // a pause for each pen lift
  const lens = strokes.map((s) => s.length);
  const total = lens.reduce((a, b) => a + b, 0) + (strokes.length - 1) * 18;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = Math.ceil(size.r * 1.2 + RIM + 2);
  const ox = Math.floor(x0) - pad, oy = Math.floor(y0) - pad;
  const gw = Math.ceil(x1) + pad - ox, gh = Math.ceil(y1) + pad - oy;
  const uc = new Float32Array(gw * gh).fill(Infinity), ur = new Float32Array(gw * gh).fill(Infinity);
  const ends = [], path = [];
  let base = 0;
  strokes.forEach((s, si) => {
    const n = s.length;
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1);
      const tt = Math.acos(1 - 2 * f) / Math.PI;           // inverse of inOutSine
      const u = (base + tt * n) / total;
      let [x, y, r] = s[k];
      if (k % 3 === 0 || k === n - 1) path.push([x, y, u]);
      if (f < 0.08) r *= 1 + 0.18 * (1 - f / 0.08);           // the press as the finger lands
      const R = r + RIM;
      for (let yy = Math.floor(y - R - oy); yy <= Math.ceil(y + R - oy); yy++)
        for (let xx = Math.floor(x - R - ox); xx <= Math.ceil(x + R - ox); xx++) {
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const dd = Math.hypot(xx + ox + 0.5 - x, yy + oy + 0.5 - y);
          const i = yy * gw + xx;
          if (dd <= r && u < uc[i]) uc[i] = u;
          if (dd <= R && u < ur[i]) ur[i] = u;
        }
    }
    const [ex, ey, er] = s[n - 1];
    ends.push({ x: ex, y: ey, r: er, u: (base + n) / total });
    base += n + 18;
  });
  // where water runs from: the lowest rim pixel of each column that has
  // clear glass right above it (gravity pulls the pushed water down there)
  const sources = [];
  for (let xx = 0; xx < gw; xx++)
    for (let yy = gh - 1; yy > 1; yy--) {
      const i = yy * gw + xx;
      if (ur[i] < Infinity && uc[i] === Infinity && uc[i - gw] < Infinity) { sources.push({ x: xx + ox, y: yy + oy, u: ur[i] }); break; }
    }
  w = { ox, oy, gw, gh, uc, ur, ends, sources, path, len: total };
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(key, w);
  return w;
}

export const SIZE = {
  hour: { key: 'h', wc: 15, hc: 27, r: 1.6, lean: 0.17 },
  min: { key: 'm', wc: 13, hc: 22, r: 1.4, lean: 0.17 },
};

/** For review (out/fogglass-digits.png): all ten, fully written, both sizes, on fog. */
export function drawDigitSheet(g) {
  const fog = (x, y) => 0.24;
  const C = new Uint8Array(g.width * g.height), L = new Uint8Array(g.width * g.height);
  const put = (d, size, X, Y) => {
    const w = writing(d, size, 1);
    for (let yy = 0; yy < w.gh; yy++)
      for (let xx = 0; xx < w.gw; xx++) {
        const x = X + w.ox + xx, y = Y + w.oy + yy;
        if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
        const i = yy * w.gw + xx;
        if (w.uc[i] <= 1) C[y * g.width + x] = 1;
        else if (w.ur[i] <= 1) L[y * g.width + x] = 1;
      }
  };
  for (let d = 0; d < 10; d++) put(d, SIZE.hour, 6 + d * 25, 5);
  for (let d = 0; d < 10; d++) put(d, SIZE.min, 6 + d * 25, 40);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const i = y * g.width + x;
      if (L[i] || (!C[i] && dither(x, y, fog(x, y)))) g.pixel(x, y, 1);
    }
}

// ------------------------------------------------------------ the pane

const SLOT = [
  { size: SIZE.hour, x: 6, y: 4 },
  { size: SIZE.hour, x: 28, y: 4 },
  { size: SIZE.min, x: 62, y: 32 },
  { size: SIZE.min, x: 82, y: 32 },
];
const DAY = 0xcf, NIGHT_C = 0x26;

const hash2 = (ix, iy, seed) => noise(ix * 57.13 + iy * 131.7, seed);
function vnoise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), ux),
    lerp(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), ux), uy);
}

// Condensation as it settles on a cold pane: thin at the top, heavier
// towards the sill and the frame, a little uneven. Each hour the glass is
// wiped and fogs afresh, so the droplets (the dither's phase) are new.
const AMB = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    // the room is dark: fog is only seen where light scatters in it, so the
    // pane's own condensation shows just as a heavier band along the sill
    let f = 0.2 * Math.exp(-(H - 1 - y) / 2.4) * (0.75 + 0.5 * vnoise2(x / 6, 0, 3));
    AMB[y * W + x] = clamp(f, 0, 1);
  }
const phaseOf = (hourMin) => [Math.floor(noise(hourMin, 71) * 8), Math.floor(noise(hourMin, 72) * 8)];

// Outside, across the valley: lit windows, a crescent moon, stars, now and
// then a car on the road. Through fog they are only glows in it; through a
// wiped trail they are sharp points.
const TOWN = [[4, 47], [12, 52], [37, 53], [46, 47], [56, 51], [98, 44], [111, 48],
  [123, 43], [72, 58], [88, 55], [26, 58]];
const LAMP = [25, 19];
// the far ridge, and the stars above it: so many that every wiped trail
// shows a few, though the fog hides them all elsewhere
const RIDGE = (x) => 41 + 2.5 * Math.sin(x * 0.045 + 1) + 1.5 * Math.sin(x * 0.13);
const STARS = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (y < RIDGE(x) - 1 && hash2(x, y, 44) < 0.028 && !(hash2(x - 1, y, 44) < 0.028) && !(hash2(x, y - 1, 44) < 0.028)) STARS.push([x, y]);

// scratch, fully rewritten every frame
const CLEAR = new Float32Array(W * H), GLOW = new Float32Array(W * H);
const LIT = new Uint8Array(W * H), SHARP = new Uint8Array(W * H);
const clearAt = (x, y, v) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (v > CLEAR[i]) CLEAR[i] = v;
};
const litAt = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) LIT[y * W + x] = 1; };
const sharpAt = (x, y) => {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < W && y < H) SHARP[y * W + x] = 1;
};

// ------------------------------------------------------------ when what is written
//
// An "event" is the minute (epoch minutes) at which a slot was last
// rewritten: the hour digits at the top of the hour, the minute tens every
// ten minutes, the minute units every minute. At the top of the hour the
// whole pane is wiped and everything is written again.

const MIN_WRITE = 0.4;      // a breath fogs the changing minute, then the finger writes
const HOUR_WRITE = 2.25;    // a palm wipes the pane, a long breath fogs it, then the finger writes
const WIPE = 1.0;

const fieldsAt = (E) => clockFields(new Date(E * 60000));
function lastEvent(slot, M) {
  const m = fieldsAt(M).m;
  return slot < 2 ? M - m : slot === 2 ? M - (m % 10) : M;
}
const digitAt = (slot, E) => { const f = fieldsAt(E); return Number((f.hh + f.mm)[slot]); };
const seedOf = (slot, E) => (((E * 4 + slot) % 100003) + 100003) % 100003;
const writingAt = (slot, E) => writing(digitAt(slot, E), SLOT[slot].size, seedOf(slot, E));
const durOf = (w) => 0.22 + (w.len * 0.35) / 78;

/** The writing in `slot` made at event minute E: where, and when the finger draws it. */
function instance(slot, E) {
  const S = SLOT[slot], seed = seedOf(slot, E), w = writingAt(slot, E);
  const f = fieldsAt(E), hour = f.m === 0;
  let start = hour ? HOUR_WRITE : MIN_WRITE;
  if (hour) for (let k = 0; k < slot; k++) start += durOf(writingAt(k, E)) + 0.12;
  else if (slot === 3 && f.m % 10 === 0) start += durOf(writingAt(2, E)) + 0.12;
  // every writing lands in a slightly different place: no stroke burns in
  const jx = Math.round((noise(seed, 5) - 0.5) * 4.5), jy = Math.round((noise(seed, 6) - 0.5) * 3.5);
  return { slot, E, w, seed, X: S.x + jx, Y: S.y + jy, start: E * 60 + start, dur: durOf(w), big: S.size === SIZE.hour };
}

// The minute's breath: a bloom of fresh fog over the changing minute digits.
const LEAN = SIZE.min.lean;
const breathCache = new Map();
function breathOf(E) {
  let b = breathCache.get(E);
  if (b) return b;
  b = breathShape(E);
  b.q = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.q[y * W + x] = bloomQ(b, x + 0.5, y + 0.5);
  if (breathCache.size > 3) breathCache.delete(breathCache.keys().next().value);
  breathCache.set(E, b);
  return b;
}
function breathShape(E) {
  const both = fieldsAt(E).m % 10 === 0, a = SLOT[both ? 2 : 3], b = SLOT[3], z = SIZE.min;
  const x0 = a.x - 4, x1 = b.x + z.wc + z.hc * LEAN + 4, y0 = b.y - 4, y1 = b.y + z.hc + 4;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + 1, rx: (x1 - x0) * 0.66 + 1, ry: (y1 - y0) * 0.66 + 1, seed: E % 9973 };
}
function bloomQ(b, x, y) {
  const dx = (x - b.cx) / b.rx, dy = (y - b.cy) / b.ry;
  const wob = 1 + 0.16 * (smoothNoise((Math.atan2(dy, dx) + Math.PI) * 1.7, b.seed) - 0.5);
  return Math.hypot(dx, dy) / wob;
}
/** How much of (x, y) the breath has reached `s` seconds after the turn: 0..1, only grows. */
const breathCov = (b, x, y, s) => clamp((ease.outCubic(progress(s, 0, 0.7)) * 1.1 - b.q[clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1)]) / 0.2, 0, 1);
/** Extra fog the breath lays down, which then evaporates back to the pane's own. */
const breathAmp = (s) => 0.42 * progress(s, 0, 0.2) * (1 - ease.inOutQuad(progress(s, 0.7, 3.8)));

// The hour: the edge of a hand wipes the pane from left to right.
const FRONT = new Float32Array(H);
const wipeFront = (s, y) => lerp(-18, 150, ease.inOutCubic(progress(s, 0, WIPE))) - 0.3 * (y - 32) + 1.6 * Math.sin(y * 0.23 + 1);
// ...then a long breath from below fogs it all again.
const BIG = { cx: 64, cy: 44, rx: 74, ry: 46, seed: 17 };
const BIGQ = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) BIGQ[y * W + x] = bloomQ(BIG, x + 0.5, y + 0.5);
const bigCov = (i, s) => clamp((ease.outCubic(progress(s, 1.3, 2.5)) * 1.35 - BIGQ[i]) / 0.25, 0, 1);
const bigAmp = (s) => 0.28 * progress(s, 1.3, 1.6) * (1 - ease.inOutQuad(progress(s, 2.4, 6.5)));

/** What erases a writing: the event that replaced it, `s` seconds in. */
function eraser(E, T) {
  const s = T - E * 60;
  if (fieldsAt(E).m === 0) return { at: (x, y) => (x < wipeFront(s, y) ? 1 : 0), fade: progress(s, WIPE, WIPE + 0.2), ghost: 0 };
  const b = breathOf(E);
  return { at: (x, y) => breathCov(b, x, y, s), fade: progress(s, 0.8, 3), ghost: 0.5 * (1 - progress(s, 0.4, 2.6)) };
}
const KEEP = { at: () => 0, fade: 0, ghost: 0 };

// Between the minutes, the one at the window just breathes: every few
// seconds a faint cloud blooms on the glass in front of them and dries.
const REST_P = 4.7;
function restBreath(T) {
  const k = Math.floor(T / REST_P), ph = T - k * REST_P;
  const amp = 0.17 * progress(ph, 0, 0.45) * (1 - ease.inOutQuad(progress(ph, 0.5, 3.9)));
  if (amp <= 0) return null;
  const sc = 0.55 + 0.45 * ease.outCubic(progress(ph, 0, 1.4));
  return { amp, b: { cx: 82 + 6 * (noise(k, 91) - 0.5), cy: 43 + 3 * (noise(k, 92) - 0.5), rx: 25 * sc, ry: 15 * sc, seed: k % 977 } };
}

// ------------------------------------------------------------ drawing a writing

/** The trail and its rims, as far as the finger has got, minus what has been erased. */
function drawWriting(inst, T, er) {
  const { w, X, Y } = inst;
  const p = (T - inst.start) / inst.dur;
  if (p <= 0) return;
  const age = Math.max(0, T - inst.start);
  // fog creeps back into the trail: the hour's, written once, grows faint
  const refog = inst.big ? 0.42 * (1 - Math.exp(-age / 2400)) : 0.3 * (1 - Math.exp(-age / 420));
  for (let yy = 0; yy < w.gh; yy++) {
    const y = Y + w.oy + yy;
    if (y < 0 || y >= H) continue;
    for (let xx = 0; xx < w.gw; xx++) {
      const i = yy * w.gw + xx, x = X + w.ox + xx;
      if (x < 0 || x >= W || w.ur[i] > p) continue;
      const e = er === KEEP ? 0 : er.at(x + 0.5, y + 0.5);
      if (w.uc[i] <= p) clearAt(x, y, (1 - refog) * (1 - e) + er.ghost * e);
      else if (e < 0.4 || (e < 0.8 && dither(x, y, 0.5))) {
        // the pushed-up water beads: a few gaps along the rim
        if (hash2(x, y, inst.seed % 97) > 0.09 || p < 1) LIT[y * W + x] = 1;
      }
    }
  }
}

/**
 * Water collects in the lower rim of the trail; every so often a bead gets
 * heavy, swells, and runs down, stick-slip, clearing a track through the
 * fog and coming to rest lower down. Its track fogs over again.
 */
function drawDrops(inst, T, er) {
  const src = inst.w.sources;
  if (!src.length) return;
  const t0 = inst.start + inst.dur + 2;
  const gap = inst.big ? 13 : 5;
  const kMax = Math.floor((T - t0 + 3) / gap);
  for (let k = Math.max(0, kMax - (inst.big ? 13 : 12)); k <= kMax; k++) {
    const sd = inst.seed * 13 + k * 7;
    const tr = t0 + k * gap + noise(sd, 1) * gap * 0.7;
    const so = src[Math.floor(noise(sd, 2) * src.length)];
    const sx = inst.X + so.x, sy = inst.Y + so.y;
    const L = Math.min(H - 1 - sy, (inst.big ? 9 : 5) + noise(sd, 3) * (inst.big ? 24 : 16));
    if (L < 3 || T < tr - 2.5) continue;
    const e0 = Math.max(er.fade, er === KEEP ? 0 : er.at(sx + 0.5, sy + 0.5));
    const tau = T - tr;
    if (tau < 0) {                                   // swelling on the rim
      if (e0 < 0.5) { litAt(sx, sy + 1); if (tau > -1.2) litAt(sx + 1, sy + 1); }
      continue;
    }
    const life = 1 - progress(tau, 20, 150);
    if (life <= 0) continue;
    const v = 7 + noise(sd, 4) * 9, om = (2 * Math.PI) / (0.35 + noise(sd, 5) * 0.4);
    const d = v * tau - ((0.8 * v) / om) * Math.sin(om * tau);
    const yh = sy + L * (1 - Math.exp(-d / (0.42 * L)));
    const wx = (yy) => sx + Math.round(0.8 * Math.sin((yy - sy) * 0.3 + sd));
    for (let yy = sy + 1; yy <= Math.floor(yh); yy++) {
      const x = wx(yy), e = Math.max(er.fade, er === KEEP ? 0 : er.at(x + 0.5, yy + 0.5));
      const c = life * (1 - e);
      clearAt(x, yy, c); clearAt(x + 1, yy, c * 0.9);
    }
    const by = Math.floor(yh), bx = wx(by);
    const eb = Math.max(er.fade, er === KEEP ? 0 : er.at(bx + 0.5, by + 0.5));
    const rest = (3 * 0.42 * L) / v + 1;           // ~ when it has come to a stop
    if (eb < 0.5 && tau < rest + 18) { litAt(bx, by); litAt(bx + 1, by); litAt(bx, by + 1); litAt(bx + 1, by + 1); }
  }
}

/** Where the fingertip is at writing progress p (between strokes it glides over). */
function tipAt(w, p) {
  const P = w.path;
  if (p <= P[0][2]) return P[0];
  for (let k = 1; k < P.length; k++)
    if (P[k][2] >= p) {
      const a = P[k - 1], b = P[k], f = (p - a[2]) / (b[2] - a[2] || 1);
      return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
    }
  return P[P.length - 1];
}

/**
 * The finger, between us and the glass: a silhouette, dark where the fog
 * behind it is lit, lost in the dark where it is not. It comes in from the
 * lower right, writes, and goes.
 */
const REACH = [0.36, 0.93], IN = 0.3, OUT = 0.34;
/**
 * The one finger: where its tip is now, given the writings being made, or
 * null. It comes in from below, writes, glides lifted to the next digit if
 * there is one, and goes.
 */
function fingerTip(list, T) {
  const tip = (inst, p) => { const [x, y] = tipAt(inst.w, p); return [x + inst.X, y + inst.Y]; };
  const off = ([x, y], a) => [x + (34 * REACH[0] + 6) * a, y + 34 * REACH[1] * a];
  for (let k = 0; k < list.length; k++) {
    const a = list[k], nx = list[k + 1], end = a.start + a.dur;
    if (T >= a.start && T <= end) return tip(a, (T - a.start) / a.dur);
    if (T > end && nx && nx.start - end < 1 && T < nx.start) {
      const u = ease.inOutQuad((T - end) / (nx.start - end));
      const [x0, y0] = tip(a, 1), [x1, y1] = tip(nx, 0);
      return [lerp(x0, x1, u), lerp(y0, y1, u) - 2 * Math.sin(Math.PI * u)];
    }
    if (T > end && T < end + OUT && !(nx && nx.start - end < 1)) return off(tip(a, 1), ease.inQuad((T - end) / OUT));
    if (T < a.start && T > a.start - IN && !(k > 0 && a.start - (list[k - 1].start + list[k - 1].dur) < 1))
      return off(tip(a, 0), ease.inQuad((a.start - T) / IN));
  }
  return null;
}

/**
 * The finger, between us and the glass: a silhouette, dark where the fog
 * behind it is lit, lost in the dark where it is not.
 */
function drawFinger(g, at) {
  if (!at) return;
  const [x, y] = at, L = 60, ex = x + REACH[0] * L, ey = y + REACH[1] * L;
  g.fillWhere((px, py) => {
    const along = (px - x) * REACH[0] + (py - y) * REACH[1];
    const r = 2.7 + clamp(along / 14, 0, 1) * 1.3;          // a finger thickens towards the knuckle
    return segDist(px, py, x, y, ex, ey) <= r;
  }, 0, [x - 5, y - 5, ex - x + 12, ey - y + 12]);
}

// ------------------------------------------------------------ outside

function glowAt(cx, cy, a, sg) {
  const R = Math.ceil(sg * 1.9), k = 1 / (2 * sg * sg);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.ceil(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++)
      // out of focus behind the fog: a soft disc, not an endless haze
      GLOW[y * W + x] += a * Math.max(0, Math.exp(-((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) * k) - 0.2) * 1.25;
}

function drawOutside(T) {
  // the one at the window sways: everything outside drifts against the
  // glass by a few pixels, slowly (parallax), and the sky turns
  const ox = 3.2 * Math.sin((2 * Math.PI * T) / 1310) + 1.3 * Math.sin((2 * Math.PI * T) / 377);
  const oy = 1.8 * Math.sin((2 * Math.PI * T) / 1730 + 1);
  // windows across the valley go on and off every ten minutes or so
  const P = 600, kp = Math.floor(T / P), u = progress(T - kp * P, 0, 2.5);
  TOWN.forEach(([x, y], k) => {
    const lv = lerp(noise(kp - 1 + k * 31, 21) > 0.22 ? 1 : 0, noise(kp + k * 31, 21) > 0.22 ? 1 : 0, u);
    if (lv <= 0) return;
    glowAt(x + ox + 0.5, y + oy + 0.5, 0.22 * lv, 4.6);
    if (lv > 0.5) sharpAt(x + ox, y + oy);
  });
  // the street lamp just outside, behind the hour: the big halo
  glowAt(LAMP[0] + ox, LAMP[1] + oy, 0.36, 12.5);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) sharpAt(LAMP[0] + ox - 0.5 + dx, LAMP[1] + oy - 0.5 + dy);
  // the moon: a slow drift across the day keeps it off any one patch of glass
  const a = (2 * Math.PI * ((T / 86400) % 1));
  const mx = 108 + 7 * Math.sin(a) + ox * 0.3, my = 11 + 2 * Math.cos(a) + oy * 0.3;
  glowAt(mx, my, 0.36, 6.5);
  for (let y = Math.floor(my - 6); y <= my + 6; y++)
    for (let x = Math.floor(mx - 6); x <= mx + 6; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (Math.hypot(px - mx, py - my) <= 4.6 && Math.hypot(px - mx - 2.3, py - my + 1.3) > 4.1) sharpAt(x, y);
    }
  // stars, twinkling
  const sx = Math.floor(T / 150) + Math.round(ox * 0.3);
  STARS.forEach(([x, y], k) => {
    if (noise(Math.floor(T * 2.3 + noise(k, 3)) + k * 13, 41) > 0.16) SHARP[y * W + ((((x + sx) % W) + W) % W)] = 1;
  });
  // a car on the valley road, headlights first
  const CP = 43, kc = Math.floor(T / CP), tau = T - kc * CP - noise(kc, 31) * 14;
  if (tau >= 0 && tau < 13) {
    const dir = noise(kc, 32) < 0.5 ? 1 : -1, x = dir > 0 ? -12 + tau * 12.5 : 140 - tau * 12.5;
    for (const dx of [0, 4]) {
      glowAt(x + dx * dir + 0.5, 60.5, 0.38, 3.4);
      sharpAt(x + dx * dir, 60);
    }
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Fogglass',
  blurb: 'A fogged window at night: the time is wiped into the condensation by a fingertip, and the night shows sharp only through the trails; drops run, each minute a breath and a finger rewrite it, each hour a hand wipes the pane.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, night, oled }) {
    const T = date.getTime() / 1000;
    const M = Math.floor(T / 60), s = T - M * 60;
    const m = fieldsAt(M).m, H0 = M - m, sH = T - H0 * 60;
    CLEAR.fill(0); GLOW.fill(0); LIT.fill(0); SHARP.fill(0);

    // the writing, and whatever it replaced while that is being erased
    for (let slot = 0; slot < 4; slot++) {
      const E = lastEvent(slot, M);
      if (T - E * 60 < 4) {
        const prev = instance(slot, lastEvent(slot, E - 1)), er = eraser(E, T);
        drawWriting(prev, T, er);
        drawDrops(prev, T, er);
      }
      const cur = instance(slot, E);
      drawWriting(cur, T, KEEP);
      drawDrops(cur, T, KEEP);
    }
    drawOutside(T);
    // get the next writings ready well before they are needed (cache only)
    if (s > 40 && s < 48) { const k = Math.floor(s - 40); if (k < 4) writingAt(k, lastEvent(k, M + 1)); }

    const hourEv = sH < 7, minEv = m !== 0 && s < 4;
    const [nx, ny] = phaseOf(H0), [qx, qy] = phaseOf(H0 - 60);
    const b = minEv ? breathOf(M) : null, bA = minEv ? breathAmp(s) : 0;
    const gA = hourEv ? bigAmp(sH) : 0;
    const rest = !hourEv && !minEv ? restBreath(T) : null;
    if (hourEv) for (let y = 0; y < H; y++) FRONT[y] = wipeFront(sH, y);

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, cl = CLEAR[i];
        let mul = 1, px = nx, py = ny, add = 0;
        if (hourEv) {
          if (x < FRONT[y]) {
            mul = bigCov(i, sH);
            if (gA > 0) add += gA * mul * (1 - 0.4 * BIGQ[i]);
          } else { px = qx; py = qy; }
        }
        if (bA > 0 && Math.abs(x - b.cx) < b.rx * 1.3 && Math.abs(y - b.cy) < b.ry * 1.3) {
          const c = breathCov(b, x + 0.5, y + 0.5, s);
          if (c > 0) add += bA * c * (1 - 0.35 * b.q[i]);
        }
        if (rest && Math.abs(x - rest.b.cx) < rest.b.rx * 1.25 && Math.abs(y - rest.b.cy) < rest.b.ry * 1.25) {
          const q = bloomQ(rest.b, x, y);
          if (q < 1) add += rest.amp * (1 - q * q);
        }
        const fogAmt = mul * (1 - cl);
        const v = (AMB[i] + GLOW[i]) * fogAmt + add * (1 - cl);
        let on = LIT[i] === 1 || dither(x + px, y + py, v);
        if (!on && SHARP[i] && fogAmt < 0.4 && add * (1 - cl) < 0.12) on = true;
        if (on) g.buf[i] = 1;
      }

    const writing4 = [0, 1, 2, 3].map((k) => instance(k, lastEvent(k, M))).sort((p, q) => p.start - q.start);
    drawFinger(g, fingerTip(writing4, T));

    // the wipe: water pushed ahead of the hand, streaks left behind it
    if (hourEv && sH < WIPE + 2) {
      const fade = 1 - progress(sH, WIPE * 0.8, WIPE + 1.6);
      for (let y = 0; y < H; y++) {
        const f = FRONT[y];
        for (let x = Math.max(0, Math.floor(f - 2.2)); x < Math.min(W, f); x++)
          if (hash2(x, y, 5) > 0.12) g.buf[y * W + x] = 1;
        if (fade > 0 && (y === 19 || y === 37 || y === 52))
          for (let x = 0; x < Math.min(W, f - 3); x++)
            if (smoothNoise(x / 13 + y * 3.1, 82) > 0.42 && x > f - 90 * fade && dither(x, y, 0.85 * fade)) g.buf[y * W + x] = 1;
      }
    }

    oled.contrast(Math.round(DAY + (NIGHT_C - DAY) * night));
  },
};
