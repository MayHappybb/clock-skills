// Brush — numerals written with an ink brush (毛笔), and rewritten live.
//
// No font. Each numeral is one or two brush strokes in a hand's stroke
// order, each a spline of [x, y, pressure] knots. The brush is a disc whose
// radius follows the pressure, stamped every 0.4 px along the path: a pressed
// entry that swells past the stroke (the blob where the tip goes down), a
// thinning as it starts to move, a full belly, and a lift to a taper. Where a
// stroke ends in a fast flick the brush runs dry and the tail breaks into
// flying white (飞白): the disc is cut into five bristles across the stroke,
// each with its own load of ink and a grain along its length, and as the
// dryness rises towards the exit the weakest bristles, the outer ones first,
// leave white streaks that follow the stroke. Pressed, slow endings stay wet
// instead (the 4's upright ends in a dew-drop 垂露), and a loaded brush
// creeps a little into the paper, so the rims are ragged. The hand leans
// forward. Every time a digit is written it is a new instance: the knots,
// pressures, bristle loads and placement are jittered from a seed fixed for
// as long as that digit stands, so no two 0s are the same.
//
// The minute: over the last second the digits that will change (and the
// colon, which is dabbed afresh every minute) dissolve like ink in water: a
// growing blur, through a swirling displacement that sinks, thinned to
// nothing as dither. The brush flies in during the wash, and from :00 it
// writes the new digits one after another, left to right, at a human pace
// (a press at each entry, then quickening to the flick, ~0.5-1 s a digit),
// lifting and travelling between strokes and between digits. Slots it has
// not reached yet are blank, so a partly rewritten time never reads as a
// different one. The brush is drawn at the stroke front: a solid tuft that
// shortens and splays when pressed, a ferrule and a knotted bamboo handle,
// leaning up and right and tipped the way it moves, on a dark keyline.
//
// At the right, as on a scroll: the date as an inscription (款) in Chinese
// numerals, month in the right column and day in the left (十月 / 二日), and
// below it a seal (印章) in 白文, a block of paste with the character of the
// current double hour (时辰: 子 丑 寅 ... 亥) carved out of it, its corners
// worn and its rim chipped. The hour: the whole sheet is washed, HH:MM
// written in full, the brush dabs the inscription character by character,
// and the seal stone comes down (its shadow shrinking and darkening) and
// stamps a fresh impression.
//
// Everything comes from the clock: which slots change from this minute's
// digits and the last and next minute's; writing progress from fields.sec
// against each digit's start time; and per pixel, the instant the brush
// inked it, so a partial digit is "the pixels inked by now". Each written
// digit is computed once (ink mask, inking time, stroke paths) and memoised.
//
// Burn-in: digits are rewritten with fresh placement (±1.2 px, ±3 px) every
// hour at least, the face walks a 2 px orbit, the right column has its own
// orbit, the inscription sits at a new height each hour and the seal lands
// in a new spot; from 23:00 to 07:00 the panel runs at low contrast.

import { dither, noise, smoothNoise, clamp, lerp, progress, orbit, sprite, clockFields, OFF, ON } from '../js/kit.js';

// ------------------------------------------------------------ layout

const GW = 22, GH = 46;                 // a digit's design box, in pixels
const SLOT_X = [2, 25, 57, 80];         // left edge of each digit's box
const COLON_X = 50;
const SLOT_XS = [...SLOT_X, COLON_X];   // slot 4 is the colon
const ORDER = [0, 1, 4, 2, 3];          // the order a hand writes HH:MM
const TOP = 5;                          // top of the digit boxes
const PAD = 6;                          // margin round a box for jitter, blobs and wash

// Pressure -> brush radius. p = 1 is the full belly of a stroke.
const R_MIN = 0.5, R_MAX = 3.15;
const SLANT = 0.09;                     // the hand leans forward a little
const HEAD = 1.2;                       // the pressed entry swells past the belly
const BLEED = 1.18;                     // how far wet ink creeps into the paper, as a fraction of r

// ------------------------------------------------------------ the hand
//
// Each digit is one to three strokes in the order a hand writes them. A
// stroke is a list of [x, y, pressure] knots in the 22x46 box, run through
// a Catmull-Rom spline. The first knot is the pressed entry (the blob), the
// pressure dips as the brush starts to move, swells through the belly and
// lifts at the exit. `dry` is how much flying white the tail gets: fast
// flicks run dry, slow pressed endings do not.

const GLYPHS = {
  0: [{ dry: 0.6, from: 0.75, k: [[12.5, 4.6, 1.0], [8, 7, 0.7], [4.8, 15, 0.9], [4.2, 26, 1.0], [6, 36, 0.85], [10, 41.8, 0.55], [14.5, 41, 0.45], [17.6, 34, 0.6], [18.4, 22, 0.7], [16.8, 11, 0.5], [13.5, 5.5, 0.3], [10, 5.2, 0.12]] }],
  1: [{ dry: 0.5, from: 0.6, k: [[6.5, 11, 0.3], [9.5, 6.5, 0.7], [11.5, 4.6, 1.0], [12.2, 9, 0.9], [12, 20, 0.75], [11.8, 32, 0.7], [11.6, 39, 0.6], [11.5, 43, 0.3]] }],
  2: [{ dry: 0.5, from: 0.8, k: [[4.5, 12, 1.0], [6.5, 6.5, 0.55], [11, 4.4, 0.45], [16.5, 6.5, 0.75], [18, 13, 0.95], [15.5, 21, 0.85], [10, 29, 0.55], [5.5, 36, 0.35], [3.8, 41.4, 0.6], [7, 41, 0.95], [13, 40.6, 0.9], [19.5, 41.4, 0.3]] }],
  3: [{ dry: 0.6, from: 0.7, k: [[4, 9, 1.0], [8.5, 4.8, 0.5], [14.5, 5, 0.7], [17.4, 10.5, 0.9], [15, 17.5, 0.6], [10, 21.5, 0.3], [14, 23, 0.55], [18.4, 29, 0.95], [17.4, 37, 0.9], [12, 41.8, 0.55], [6, 41, 0.3], [3, 37.5, 0.12]] }],
  4: [
    { dry: 0.4, from: 0.8, k: [[14.5, 4.5, 1.0], [11.5, 12, 0.6], [7.5, 21, 0.5], [3.6, 30.4, 0.6], [4.4, 31, 0.8], [10, 30.4, 0.85], [15.5, 30.2, 0.8], [18.8, 30.8, 0.35]] },
    { dry: 0, k: [[15.8, 11.5, 1.0], [16.2, 16, 0.85], [16, 28, 0.8], [15.8, 37, 0.75], [15.6, 42, 0.85]] },
  ],
  5: [
    { dry: 0.6, from: 0.7, k: [[6.5, 5.5, 1.0], [6, 12, 0.7], [5.4, 20.5, 0.6], [9, 18.5, 0.4], [15, 19.6, 0.75], [18.5, 26.5, 1.0], [17.6, 35, 0.9], [12.5, 41.4, 0.6], [6.5, 41.2, 0.35], [3, 38, 0.15]] },
    { dry: 0.7, from: 0.5, k: [[7.5, 5.6, 0.9], [12, 5, 0.6], [16, 4.6, 0.65], [20, 4, 0.2]] },
  ],
  6: [{ dry: 0.5, from: 0.8, k: [[16.5, 4.5, 1.0], [12, 8, 0.6], [7.2, 15, 0.75], [4.4, 25, 0.95], [5, 35, 1.0], [9.5, 41.6, 0.75], [14.8, 40.6, 0.6], [17.8, 33.5, 0.8], [16.2, 27, 0.6], [11.4, 25, 0.35], [7, 28, 0.12]] }],
  7: [{ dry: 0.7, from: 0.6, k: [[3.6, 7, 1.0], [7, 5.4, 0.55], [12, 5, 0.5], [17.4, 4.6, 0.85], [18.4, 6.4, 1.0], [16, 13, 0.85], [12.6, 22, 0.75], [9.6, 32, 0.55], [7.2, 43, 0.15]] }],
  8: [{ dry: 0.55, from: 0.8, k: [[16.5, 8, 0.9], [12, 4.6, 0.5], [6.4, 6.4, 0.8], [5.8, 13.5, 0.9], [10, 19, 0.55], [15.8, 24.6, 0.8], [18.4, 33, 1.0], [15, 41, 0.75], [9, 41.6, 0.6], [4.4, 35, 0.75], [6.4, 27, 0.6], [11, 22, 0.35], [15.4, 16.5, 0.55], [16.6, 10, 0.4], [14, 5.2, 0.12]] }],
  9: [{ dry: 0.6, from: 0.65, k: [[17, 9, 1.0], [12, 4.6, 0.55], [6, 6.4, 0.8], [4.2, 13, 0.95], [6.6, 20, 0.75], [12, 22, 0.45], [16.4, 17, 0.4], [17.8, 9.5, 0.45], [18, 17, 0.9], [17.4, 27, 0.95], [15.6, 36, 0.65], [12, 43, 0.15]] }],
  ':': [
    { dry: 0, k: [[1.6, 15.5, 0.75], [2.6, 17, 0.6], [3.2, 18.6, 0.2]] },
    { dry: 0, k: [[1.6, 30.5, 0.75], [2.6, 32, 0.6], [3.2, 33.6, 0.2]] },
  ],
};

// Writing pace: seconds of press at a stroke's start, the brush speed
// through it (px/s, slow at the entry and quickening to the flick) and the
// time the lifted brush takes between strokes.
const PRESS = 0.07, SPEED = 125, AIR = 0.12;

/** Uniform Catmull-Rom through the knots, sampled at about `step` px. */
function spline(k, step = 0.4) {
  const pts = [k[0], ...k, k[k.length - 1]];
  const dense = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step / 2)));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      dense.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  dense.push(k[k.length - 1]);
  // Resample by arc length.
  const out = [{ x: dense[0][0], y: dense[0][1], p: dense[0][2], s: 0 }];
  let s = 0, acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    s += d; acc += d;
    if (acc >= step || i === dense.length - 1) { out.push({ x: dense[i][0], y: dense[i][1], p: dense[i][2], s }); acc = 0; }
  }
  return out;
}

/** Seconds into a stroke at which the brush reaches arc length s (of L). */
function strokeTime(s, L) {
  // Speed rises linearly from 0.5 to 1.5 of SPEED: x = 0.5u + 0.5u^2 of the length.
  const q = L ? s / L : 0;
  const u = -0.5 + Math.sqrt(0.25 + 2 * q);
  return PRESS + (L / SPEED) * u;
}

// ------------------------------------------------------------ one written digit

const cache = new Map();

/**
 * Digit `d` as written by hand number `seed`: knots jittered a little, the
 * brush's bristles loaded differently. Returns the ink as a mask in a box
 * (GW + 2 PAD) x (GH + 2 PAD), with the instant (seconds into the writing)
 * each pixel was inked, and the stroke paths for drawing the brush.
 * Pure in (d, seed), so memoised.
 */
function written(d, seed) {
  const key = `${d}/${seed}`;
  if (cache.has(key)) return cache.get(key);
  const w = GW + 2 * PAD, h = GH + 2 * PAD;
  const ink = new Uint8Array(w * h), when = new Float32Array(w * h).fill(Infinity);
  const strokes = [];
  let t0 = 0;
  GLYPHS[d].forEach((st, si) => {
    // The colon's two dabs land a little higher or lower each time.
    const lift = d === ':' ? (noise(seed + si * 4.1, 9) - 0.5) * 5 : 0;
    // Nor does a hand set a digit down in exactly the same place twice.
    const jx = d === ':' ? 0 : (noise(seed, 21) - 0.5) * 2.4, jy = d === ':' ? 0 : (noise(seed, 22) - 0.5) * 6;
    const k = st.k.map(([x, y, p]) => [x + jx, y + lift + jy, p]).map(([x, y, p], i) => [
      x + SLANT * (GH / 2 - y) + PAD + (noise(seed + i * 3.1, si * 7 + 1) - 0.5) * 1.2,
      y + PAD + (noise(seed + i * 5.7, si * 7 + 2) - 0.5) * 1.2,
      clamp(p * (i === 0 ? HEAD : 1) + (noise(seed + i * 2.3, si * 7 + 3) - 0.5) * 0.16, 0.05, 1.3),
    ]);
    const S = spline(k);
    const L = S[S.length - 1].s;
    for (const q of S) {
      q.t = t0 + strokeTime(q.s, L);
      q.u = L ? q.s / L : 0;
      // A ragged edge: the radius breathes with the paper's grain.
      q.r = (R_MIN + (R_MAX - R_MIN) * q.p) * (1 + 0.14 * (smoothNoise(q.s * 0.6, seed + si) - 0.5));
    }
    const best = new Float32Array(w * h).fill(Infinity), bu = new Float32Array(w * h), bv = new Float32Array(w * h);
    const first = new Float32Array(w * h).fill(Infinity), bs = new Float32Array(w * h);
    for (let i = 0; i < S.length; i++) {
      const q = S[i], nx = S[Math.min(i + 1, S.length - 1)], pv = S[Math.max(i - 1, 0)];
      let tx = nx.x - pv.x, ty = nx.y - pv.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const x0 = Math.max(0, Math.floor(q.x - q.r - 1)), x1 = Math.min(w - 1, Math.ceil(q.x + q.r + 1));
      const y0 = Math.max(0, Math.floor(q.y - q.r - 1)), y1 = Math.min(h - 1, Math.ceil(q.y + q.r + 1));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - q.x, dy = y + 0.5 - q.y;
          let dn = Math.hypot(dx, dy) / q.r;
          if (dn > BLEED) continue;
          // Wet ink creeps a little way into the paper where the brush is
          // loaded and pressed: a ragged rim, not a clean disc.
          if (dn > 1) {
            const wet = q.p * (1 - q.u) - 0.55;
            if (wet <= 0 || noise(x * 7.13 + y * 3.71, seed + si) > wet * 1.2) continue;
            dn = 0.999;
          }
          const j = y * w + x;
          if (q.t < first[j]) first[j] = q.t;
          if (dn < best[j]) { best[j] = dn; bu[j] = q.u; bs[j] = q.s; bv[j] = (tx * dy - ty * dx) / q.r; }
        }
    }
    // Flying white: the tail of a fast stroke runs dry, and the bristles part
    // into streaks that follow the stroke. Each bristle carries its own load
    // of ink and breaks along its length where the paper's tooth catches it.
    const NB = 5;
    for (let j = 0; j < w * h; j++) {
      if (best[j] === Infinity) continue;
      const u = bu[j], v = bv[j];
      const from = st.from ?? 0.6, dry = st.dry * clamp((u - from + 0.35) / (1.35 - from), 0, 1) ** 2;
      let on = true;
      if (dry > 0) {
        const b = Math.floor((clamp(v, -0.999, 0.999) * 0.5 + 0.5) * NB);
        const load = noise(seed * 0.37 + b * 1.618, 11 + si);
        const grain = smoothNoise(bs[j] * 0.22 + b * 9.1, seed + 5 * si);
        on = 0.75 * load + 0.25 * grain + 0.4 * (1 - Math.abs(v)) > 0.3 + dry;
      }
      if (on) { ink[j] = 1; if (first[j] < when[j]) when[j] = first[j]; }
    }
    const end = S[S.length - 1].t;
    strokes.push({ S, t0, t1: end });
    t0 = end + AIR;
  });
  const out = { w, h, ink, when, strokes, dur: t0 - AIR };
  if (cache.size > 96) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

/** Draw a written digit with its box at (x, y); only ink laid by `upTo` seconds. */
function drawInk(g, wr, x, y, upTo = Infinity) {
  for (let j = 0; j < wr.h; j++)
    for (let i = 0; i < wr.w; i++) {
      const k = j * wr.w + i;
      if (wr.ink[k] && (!wr.when || wr.when[k] <= upTo)) g.pixel(x - PAD + i, y - PAD + j, ON);
    }
}

// ------------------------------------------------------------ washing out
//
// The old digit dissolves like ink dropped in water: the mask is blurred by
// a growing radius (a box average from a summed-area table), sampled through
// a swirling displacement that drifts down, and thinned to nothing, drawn
// as an ordered dither. At a = 0 it is exactly the written digit.

function sat(wr) {
  if (wr.sat) return wr.sat;
  const W = wr.w + 1, t = new Float32Array(W * (wr.h + 1));
  for (let y = 0; y < wr.h; y++)
    for (let x = 0; x < wr.w; x++)
      t[(y + 1) * W + x + 1] = wr.ink[y * wr.w + x] + t[y * W + x + 1] + t[(y + 1) * W + x] - t[y * W + x];
  return (wr.sat = t);
}

/** Mean of the ink over the box of radius r round (x, y), in the digit's own pixels. */
function boxMean(wr, x, y, r) {
  const T = sat(wr), W = wr.w + 1;
  const x0 = clamp(Math.round(x - r), 0, wr.w), x1 = clamp(Math.round(x + r + 1), 0, wr.w);
  const y0 = clamp(Math.round(y - r), 0, wr.h), y1 = clamp(Math.round(y + r + 1), 0, wr.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const sum = T[y1 * W + x1] - T[y0 * W + x1] - T[y1 * W + x0] + T[y0 * W + x0];
  return sum / ((2 * r + 1) * (2 * r + 1));
}

/** 2-D value noise, smooth, in [0, 1). */
function noise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const n = (i, j) => noise(i * 57.1 + j * 13.7, seed);
  return lerp(lerp(n(xi, yi), n(xi + 1, yi), ux), lerp(n(xi, yi + 1), n(xi + 1, yi + 1), ux), uy);
}

function drawWash(g, wr, x, y, a, seed) {
  if (a <= 0) return drawInk(g, wr, x, y);
  const r = Math.round(a * 4.5), swirl = 8 * a, fall = 5 * a * a;
  const fade = (1 - a) ** 1.2 * (1 + 2.2 * a);
  for (let j = -4; j < wr.h + 6; j++)
    for (let i = -4; i < wr.w + 4; i++) {
      const sx = i + swirl * (noise2(i / 8, j / 8 - a, seed) - 0.5) * 2;
      const sy = j - fall + swirl * (noise2(i / 8 + 9, j / 8, seed) - 0.5) * 2;
      const lv = boxMean(wr, sx, sy, r) * fade;
      const px = x - PAD + i, py = y - PAD + j;
      if (lv > 0.02 && dither(px, py, lv)) g.pixel(px, py, ON);
    }
}

// ------------------------------------------------------------ the brush

/**
 * The brush, its tip at (x, y): a tuft of hair that splays and shortens as
 * it is pressed, a ferrule and a bamboo handle, leaning up and to the right
 * and tipped towards the way it is moving (a brush is pulled, the tip
 * trails). Drawn on a dark keyline so it reads in front of the ink.
 * `lift` raises the tip off the paper, in pixels.
 */
function drawBrush(g, x, y, p, dx, dy, lift = 0) {
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  let ax = 0.5 + 0.35 * dx, ay = -0.87 + 0.25 * dy;
  const al = Math.hypot(ax, ay); ax /= al; ay /= al;
  const tx = x + ax * lift, ty = y + ay * lift;
  const hair = 11 - 3.5 * p, rTip = lift > 0 ? 0.6 : Math.max(0.8, (R_MIN + (R_MAX - R_MIN) * p) * 0.75), rBase = 2.7 + 0.6 * p;
  const fer = 3, handle = 28;
  const total = hair + fer + handle;
  // Radius of the brush at distance s up its axis.
  const rad = (s) => s < hair ? lerp(rTip, rBase, Math.sqrt(s / hair)) * (s > hair - 2 ? 1 : 1)
    : s < hair + fer ? rBase - 0.2 : 1.6;
  const box = [Math.min(tx, tx + ax * total) - 5, Math.min(ty, ty + ay * total) - 5, Math.abs(ax * total) + 10, Math.abs(ay * total) + 10];
  const at = (px, py) => {
    const qx = px - tx, qy = py - ty;
    const s = qx * ax + qy * ay, n = Math.abs(qx * -ay + qy * ax);
    if (s < -1.2 || s > total) return null;
    return { s, n, r: rad(clamp(s, 0, total)) };
  };
  // Keyline.
  g.fillWhere((px, py) => { const q = at(px, py); return !!q && q.n <= q.r + 1.1 && (q.s >= 0 || Math.hypot(px - tx, py - ty) <= rTip + 1.1); }, OFF, box);
  g.fillWhere((px, py) => {
    const q = at(px, py);
    if (!q) return false;
    if (q.s < 0) return Math.hypot(px - tx, py - ty) <= rTip;
    if (q.s < hair) return q.n <= q.r;                              // the inked tuft, solid
    if (q.s < hair + fer) return q.n <= q.r && (q.n > q.r - 1 || q.s < hair + 1); // ferrule: a band, dark inside
    return q.n <= q.r && (Math.floor((q.s - hair - fer) / 7) % 4 !== 3 || q.n < 0.6); // handle, with knots
  }, ON, box);
}

/** Where the brush is at second `tau` of writing `wr`, or null once done. */
function brushOn(wr, tau) {
  for (let k = 0; k < wr.strokes.length; k++) {
    const { S, t0, t1 } = wr.strokes[k];
    if (tau < t0) {
      // In the air, between the last stroke and this one.
      const prev = wr.strokes[k - 1].S, a = prev[prev.length - 1], b = S[0];
      const u = (tau - (t0 - AIR)) / AIR;
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), p: 0.3, dx: b.x - a.x, dy: b.y - a.y, lift: 3 * Math.sin(Math.PI * u) + 0.5 };
    }
    if (tau <= t1) {
      let i = 0;
      while (i < S.length - 1 && S[i + 1].t <= tau) i++;
      const q = S[i], n = S[Math.min(i + 1, S.length - 1)], pv = S[Math.max(0, i - 1)];
      const dl = Math.hypot(n.x - pv.x, n.y - pv.y) || 1;
      return { x: q.x, y: q.y, p: q.p, dx: (n.x - pv.x) / dl, dy: (n.y - pv.y) / dl, lift: 0 };
    }
  }
  return null;
}

// ------------------------------------------------------------ inscription and seal
//
// At the right, as on a scroll: a two-column inscription (款) giving the
// date in Chinese numerals, the month in the right column and the day in the
// left (read right to left), and under it the artist's seal (印章), a block
// of red paste with the character of the current double hour (时辰: 子 for
// 23:00-01:00, 丑 for 01:00-03:00 ...) carved out of it in white (白文).

const INK7 = {
  一: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  二: ['.......', '.#####.', '.......', '.......', '.......', '#######', '.......'],
  三: ['.#####.', '.......', '.......', '..###..', '.......', '.......', '#######'],
  四: ['#######', '#.#.#.#', '#.#.#.#', '#.#.#.#', '##...##', '#.....#', '#######'],
  五: ['#######', '..#....', '..#....', '######.', '..#..#.', '..#..#.', '#######'],
  六: ['...#...', '....#..', '#######', '.......', '..#.#..', '.#...#.', '#.....#'],
  七: ['.#.....', '.#...##', '.####..', '##.....', '.#.....', '.#....#', '..#####'],
  八: ['..#.#..', '..#.#..', '..#.#..', '..#..#.', '.#...#.', '.#....#', '#.....#'],
  九: ['..#....', '..#....', '######.', '..#..#.', '..#..#.', '.#...#.', '#....##'],
  十: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'],
  廿: ['.#...#.', '.#...#.', '#######', '.#...#.', '.#...#.', '.#...#.', '.#####.'],
  卅: ['#.#.#..', '#.#.#..', '#######', '#.#.#..', '#.#.#..', '#.#.#..', '#####..'],
  月: ['.#####.', '.#...#.', '.#####.', '.#...#.', '.#####.', '.#...#.', '#...##.'],
  日: ['.#####.', '.#...#.', '.#...#.', '.#####.', '.#...#.', '.#...#.', '.#####.'],
};

// The twelve branches, carved 11x11: '#' is cut away (dark).
const BRANCH = [
  ['.#########.', '........##.', '.......##..', '.....###...', '.....##....', '###########', '.....##....', '.....##....', '.....##....', '.....##....', '...####....'], // 子
  ['.########..', '.....#..#..', '.....#..#..', '.....#..#..', '.########..', '.....#..#..', '.....#..#..', '.....#..#..', '.....#..#..', '###########', '...........'], // 丑
  ['.....#.....', '###########', '#.........#', '..#######..', '.....#.....', '..#######..', '..#..#..#..', '..#######..', '..#..#..#..', '..#######..', '.##.....##.'], // 寅
  ['...#...####', '..#.#..#..#', '.#..#..#..#', '....#..#..#', '....#.##..#', '....##.#.##', '....#..#...', '....#..#...', '....#..#...', '....#..#...', '....#..#...'], // 卯
  ['###########', '#..........', '#.#######..', '#..........', '#.#########', '#..#...#...', '#..#...#..#', '#..#....##.', '#..#..#..#.', '#..##.#...#', '#..#.#.....'], // 辰
  ['#########..', '#.......#..', '#.......#..', '#.......#..', '#########..', '#..........', '#..........', '#.........#', '#.........#', '.#########.', '...........'], // 巳
  ['..#........', '..#########', '.#....#....', '#.....#....', '......#....', '###########', '......#....', '......#....', '......#....', '......#....', '......#....'], // 午
  ['.....#.....', '.#########.', '.....#.....', '###########', '....###....', '...#.#.#...', '..#..#..#..', '.#...#...#.', '#....#....#', '.....#.....', '.....#.....'], // 未
  ['.....#.....', '.#########.', '.#...#...#.', '.#...#...#.', '.#########.', '.#...#...#.', '.#...#...#.', '.#########.', '.....#.....', '.....#.....', '.....#.....'], // 申
  ['###########', '....#.#....', '.#########.', '.#..#.#..#.', '.#..#.#..#.', '.#.#...###.', '.##......#.', '.#########.', '.#.......#.', '.#########.', '...........'], // 酉
  ['........#.#', '.#########.', '.#......#..', '.#......#..', '.#.####.#.#', '.#.....#.#.', '.#.....##..', '.#.....#...', '#.....#.#..', '#....#...#.', '...##.....#'], // 戌
  ['.....#.....', '###########', '....#......', '...#...#...', '..#...#....', '.####.#....', '.....#..#..', '...##..#...', '.##...#.#..', '#...##...#.', '..##......#'], // 亥
].map((rows) => sprite(rows));

const INK = Object.fromEntries(Object.entries(INK7).map(([k, v]) => [k, sprite(v)]));
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 1..31 in Chinese numerals, the way a date is written: 十一, 二十, 廿三, 卅一. */
function cnNumber(n) {
  if (n <= 10) return NUM[n];
  if (n < 20) return '十' + NUM[n - 10];
  if (n === 20) return '二十';
  if (n < 30) return '廿' + NUM[n - 20];
  if (n === 30) return '三十';
  return '卅' + NUM[n - 30];
}
const MONTH_N = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

const INS_X = [118, 109], INS_Y = 5, INS_PITCH = 9;   // right column (month), then left (day)
const SEAL = 15, SEAL_X = 110, SEAL_Y = 46;

/** The inscription's characters, column by column. */
function inscription(f) {
  return [[...cnNumber(MONTH_N[f.month]), '月'], [...cnNumber(f.day), '日']];
}

/** Draw the inscription; `shown` characters only (in reading order), for writing it out. */
function drawInscription(g, f, x, y, shown = Infinity) {
  let n = 0;
  inscription(f).forEach((col, c) => col.forEach((ch, r) => {
    if (n++ < shown) g.blit(INK[ch], INS_X[c] + x, INS_Y + y + r * INS_PITCH);
  }));
}

/**
 * The seal impression for hour h of day `dayKey`, as a mask in a PAD-margined
 * box (so drawWash can dissolve it): a block with chipped corners, a
 * speckle where the paste did not take, and the branch carved out of it.
 */
function sealMask(h, key) {
  const ck = `seal/${h}/${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const w = SEAL + 2 * PAD, hh = SEAL + 2 * PAD, ink = new Uint8Array(w * hh);
  const br = BRANCH[Math.floor(((h + 1) % 24) / 2)];
  for (let y = 0; y < SEAL; y++)
    for (let x = 0; x < SEAL; x++) {
      const edge = x === 0 || y === 0 || x === SEAL - 1 || y === SEAL - 1;
      const corner = (x === 0 || x === SEAL - 1) && (y === 0 || y === SEAL - 1);
      if (corner && noise(x * 13.1 + y * 91.7, key) < 0.7) continue;            // worn stone corners
      if (edge && noise(x * 17.3 + y * 71.9, key + 1) < 0.1) continue; // chipped rim
      if (!edge && noise(x * 31.7 + y * 57.3, key + 2) < 0.05) continue; // paste that did not take
      const cx = x - 2, cy = y - 2;
      if (cx >= 0 && cy >= 0 && cx < 11 && cy < 11 && br.data[cy * 11 + cx]) continue; // the carving
      ink[(y + PAD) * w + x + PAD] = 1;
    }
  const m = { w, h: hh, ink };
  cache.set(ck, m);
  return m;
}

// ------------------------------------------------------------ the clock

const digitsOf = (f) => [...[...`${f.hh}${f.mm}`].map(Number), ':'];
/**
 * Whether slot i is rewritten at the turn from digits `a` to `b`: the colon
 * always is, and on the hour (`fresh`) the whole time is, on a clean sheet.
 */
const changes = (a, b, i, fresh) => fresh || i === 4 || a[i] !== b[i];

/** The hand that wrote slot i's current digit: changes only when that digit was rewritten. */
function seedFor(f, i) {
  const day = f.year * 372 + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(f.month) * 31 + f.day;
  const span = [f.h, f.h, f.h * 6 + Math.floor(f.m / 10), f.h * 60 + f.m, f.h * 60 + f.m + 0.5][i];
  return Math.floor(noise(day * 0.013 + span * 0.71, i + 1) * 9973);
}

const WASH = 1.0;          // seconds the old digits take to dissolve, ending at :00
const BETWEEN = 0.22;      // the brush travels from one digit to the next
const ARRIVE = 0.55;       // the brush flies in during the wash
const LEAVE = 0.6;         // and away after the last digit

/**
 * This minute's writing: the slots that changed at :00, in the order the
 * hand writes them (left to right), each with its start time in seconds
 * after :00. Slots not yet reached are blank.
 */
function schedule(f, before) {
  const now = digitsOf(f), jobs = [];
  let t = 0;
  for (const i of ORDER) {
    if (!changes(before, now, i, f.m === 0)) continue;
    const wr = written(now[i], seedFor(f, i));
    jobs.push({ i, wr, t0: t, t1: t + wr.dur });
    t += wr.dur + BETWEEN;
  }
  return jobs;
}

/** Brush tip in screen coordinates for slot i's digit box origin. */
const slotOrigin = (i, ox, oy) => [SLOT_XS[i] + ox - PAD, TOP + oy - PAD];

const INS_STEP = 0.2;       // the brush dabs each character of the inscription
const STAMP = 0.5;         // the seal comes down
const HOVER = 0.32;        // of which this long in the air

/** Day number and hour key for the seal: it is stamped anew every hour. */
const hourKey = (f) => (f.year * 372 + MONTH_N[f.month] * 31 + f.day) * 24 + f.h;

function sealPos(f, x, y) {
  const k = hourKey(f);
  return [SEAL_X + x + Math.round((noise(k, 5) - 0.5) * 3), SEAL_Y + y + Math.round((noise(k, 6) - 0.5) * 2.4)];
}

/** The seal stone in the air, `u` (0..1) of the way down, over the box at (x, y). */
function drawStone(g, x, y, u) {
  const grow = Math.round(6 * (1 - u) ** 1.5), n = SEAL + 2 * grow;
  const x0 = x - grow, y0 = y - grow;
  g.fillRect(x0 - 1, y0 - 1, n + 2, n + 2, OFF);
  g.fillWhere((_, __, ix, iy) => {
    const e = ix === x0 || iy === y0 || ix === x0 + n - 1 || iy === y0 + n - 1;
    return e ? true : dither(ix, iy, 0.12 + 0.2 * u);                 // its shadow darkens as it nears
  }, ON, [x0, y0, n, n]);
}

export default {
  name: 'Brush',
  blurb: 'Numerals written with an ink brush: pressure, belly, flying white; washed out and rewritten live each minute.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(0xcf + (0x14 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
    const [ox, oy] = orbit(date, 2, 3);
    const [qx0, qy0] = orbit(new Date(date.getTime() + 7 * 60000 * 4), 2, 7);  // the right column's own walk
    // The inscription sits a little differently each hour it is rewritten.
    const hk = hourKey(f), qx = qx0 + Math.round((noise(hk, 7) - 0.5) * 2.4), qy = qy0 + Math.round(noise(hk, 8) * 8);
    const now = digitsOf(f);
    const sec = f.sec;
    const start = new Date(date.getTime() - sec * 1000);           // this minute's :00
    const before = digitsOf(clockFields(new Date(start.getTime() - 60000)));
    const nextF = clockFields(new Date(start.getTime() + 60000));
    const next = digitsOf(nextF);
    const jobs = schedule(f, before);
    const washA = progress(sec, 60 - WASH, 60);
    let brush = null;

    // The digits.
    for (const i of ORDER) {
      const wr = written(now[i], seedFor(f, i));
      const job = jobs.find((j) => j.i === i);
      const x = SLOT_XS[i] + ox, y = TOP + oy;
      if (job && sec < job.t1) {
        if (sec >= job.t0) {
          drawInk(g, wr, x, y, sec - job.t0);
          const b = brushOn(wr, sec - job.t0);
          if (b) brush = { ...b, x: b.x + x - PAD, y: b.y + y - PAD };
        }
        continue;                                                   // not reached yet: blank
      }
      if (washA > 0 && changes(now, next, i, nextF.m === 0)) drawWash(g, wr, x, y, washA, seedFor(f, i));
      else drawInk(g, wr, x, y);
    }

    // After the digits: at midnight the inscription is written again, and
    // on every hour the seal is stamped anew.
    const writeEnd = jobs.length ? jobs[jobs.length - 1].t1 : 0;
    const hourTurn = f.m === 0, insTurn = hourTurn;   // the inscription is rewritten every hour
    const insN = inscription(f).flat().length;
    const insT0 = writeEnd + 0.3, insT1 = insTurn ? insT0 + insN * INS_STEP : writeEnd;
    const stampT0 = (insTurn ? insT1 : writeEnd) + 0.5;

    if (insTurn && sec < insT1) {
      const shown = Math.floor((sec - insT0) / INS_STEP) + 1;
      drawInscription(g, f, qx, qy, Math.max(0, shown));
      if (sec >= insT0) {
        // The brush dabs each character, top to bottom, right column first.
        const k = Math.min(insN - 1, shown - 1), cols = inscription(f);
        const c = k < cols[0].length ? 0 : 1, r = c ? k - cols[0].length : k;
        const u = (sec - insT0) / INS_STEP - k;
        brush = { x: INS_X[c] + qx + 3.5 + u * 2, y: INS_Y + qy + r * INS_PITCH + 2 + u * 3, p: 0.25, dx: 0.5, dy: 1, lift: Math.max(0, 2 * Math.sin(Math.PI * u * 2)) };
      }
    } else if (sec >= 60 - WASH && nextF.m === 0) {
      // The day's inscription dissolves with the digits at midnight.
      const m = { w: 30, h: 40, ink: new Uint8Array(1200) };
      const tmp = { buf: m.ink, pixel(px, py) { px -= INS_X[1] - 2 + qx - PAD; py -= INS_Y - 2 + qy - PAD; if (px >= 0 && py >= 0 && px < 30 && py < 40) m.ink[py * 30 + px] = 1; return this; } };
      tmp.blit = (spr, bx, by) => { for (let j = 0; j < spr.h; j++) for (let i = 0; i < spr.w; i++) if (spr.data[j * spr.w + i]) tmp.pixel(bx + i, by + j); };
      drawInscription(tmp, f, qx, qy);
      drawWash(g, m, INS_X[1] - 2 + qx, INS_Y - 2 + qy, washA, 77);
    } else drawInscription(g, f, qx, qy);

    const [sx, sy] = sealPos(f, qx0, qy0);
    const seal = sealMask(f.h, hourKey(f));
    if (hourTurn && sec < stampT0 + STAMP) {
      const u = (sec - stampT0) / STAMP;
      if (u >= 0 && u < HOVER / STAMP) drawStone(g, sx, sy, u * STAMP / HOVER);
      else if (u >= HOVER / STAMP) {
        drawInk(g, seal, sx, sy);
        if (u < HOVER / STAMP + 0.18) g.rect(sx - 1, sy - 1, SEAL + 2, SEAL + 2);  // the press
      }
    } else if (sec >= 60 - WASH && nextF.m === 0) drawWash(g, seal, sx, sy, washA, hourKey(f));
    else drawInk(g, seal, sx, sy);

    // The brush between digits, arriving and leaving.
    if (!brush && jobs.length) {
      const last = jobs[jobs.length - 1];
      for (let k = 1; k < jobs.length; k++) {
        const a = jobs[k - 1], b = jobs[k];
        if (sec > a.t1 && sec < b.t0) {
          const sa = a.wr.strokes.at(-1).S.at(-1), sb = b.wr.strokes[0].S[0];
          const [axo, ayo] = slotOrigin(a.i, ox, oy), [bxo, byo] = slotOrigin(b.i, ox, oy);
          const u = (sec - a.t1) / (b.t0 - a.t1), e = u * u * (3 - 2 * u);
          brush = { x: lerp(sa.x + axo, sb.x + bxo, e), y: lerp(sa.y + ayo, sb.y + byo, e), p: 0.3, dx: 1, dy: 0, lift: 2 + 5 * Math.sin(Math.PI * u) };
        }
      }
      const leaveT0 = insTurn ? insT1 : last.t1;
      let from = null;
      if (insTurn) { const cl = inscription(f)[1].length - 1; from = [INS_X[1] + qx + 5.5, INS_Y + qy + cl * INS_PITCH + 5]; }
      else { const sa = last.wr.strokes.at(-1).S.at(-1), [axo, ayo] = slotOrigin(last.i, ox, oy); from = [sa.x + axo, sa.y + ayo]; }
      if (insTurn && sec >= last.t1 && sec < insT0) {
        // Over to the inscription.
        const sa = last.wr.strokes.at(-1).S.at(-1), [axo, ayo] = slotOrigin(last.i, ox, oy);
        const u = (sec - last.t1) / (insT0 - last.t1);
        brush = { x: lerp(sa.x + axo, INS_X[0] + qx + 3.5, u), y: lerp(sa.y + ayo, INS_Y + qy + 2, u), p: 0.3, dx: 1, dy: -1, lift: 2 + 5 * Math.sin(Math.PI * u) };
      } else if (sec >= leaveT0 && sec < leaveT0 + LEAVE) {
        const u = (sec - leaveT0) / LEAVE, e = u * u;
        brush = { x: lerp(from[0], 150, e), y: lerp(from[1], -10, e), p: 0.3, dx: 1, dy: -1, lift: 1 + 6 * u };
      }
    }
    if (!brush && sec >= 60 - ARRIVE) {
      // Flying in for the first digit of the next minute.
      const nj = schedule(nextF, now)[0];
      if (nj) {
        const sb = nj.wr.strokes[0].S[0], [bxo, byo] = slotOrigin(nj.i, ox, oy);
        const u = progress(sec, 60 - ARRIVE, 60), e = 1 - (1 - u) ** 2;
        brush = { x: lerp(150, sb.x + bxo, e), y: lerp(-12, sb.y + byo, e), p: 0.3, dx: -1, dy: 1, lift: 6 * (1 - e) + 0.5 };
      }
    }
    if (brush) drawBrush(g, brush.x, brush.y, brush.p, brush.dx, brush.dy, brush.lift);
  },
};
