// Sand — the time is written in sand.
//
// Each digit is a network of sand ridges, one pixel per grain. A ridge has a
// triangular cross-section (sand at its angle of repose), so each flank is a
// single tone, as on a dune: the face towards the light (upper left) is a
// dense stipple, the slip face a thin one, the crest a sharp lit line, and
// the free ends of strokes slope off like the end of a poured trail. The
// scatter is interleaved gradient noise plus a little white noise, seeded by
// the minute the digit was poured, so every new digit is new sand.
//
// The minute: 2.1 s before :00 a hole opens in the floor under each digit
// that is about to change and the pile drains into it as in the top of an
// hourglass: every column of sand sinks together, the middle first, so the
// digit is dragged down into a V-shaped crater, and grains run down the
// crater and out through the hole. At :00 a hopper comes down from above the
// glass and pours the new digit. Its grains are laid bottom up, a few rows
// at a time, in alternate directions; each one leaves the spout at its turn,
// falls, fans out to its place, lands with a hop and settles. The hopper
// sways after the grains it is laying, so the stream bends. Several changing
// digits drain together and pour together, so old and new are never mixed.
//
// The hour: a storm. A gust front crosses from the left and blows every
// grain off downwind in curling streams, dust streaks race across the glass,
// and once the old time is gone the wind brings the new one in from the
// left, digit by digit, grains decelerating into place.
//
// The colon is an hourglass that drains over the minute (the seconds) and
// flips over at every :00; after the flip its sand slides down to the neck.
//
// Everything is a function of the clock: the grain lists are built from the
// digit and a seed (cached), and every grain's position in a drain, pour or
// storm is closed-form in the seconds from the turn.
//
// Burn-in: the face walks kit.orbit, the minute digits are new sand every
// minute and the hour digits every hour, and 23:00-07:00 the panel dims.

import { clockFields, previousMinute, orbit } from '../js/kit.js';

const W = 128, H = 64;
const DW = 24, DH = 46;            // digit box
const TOP = 10;                    // top of the digit boxes
const FLOOR = TOP + DH;            // the floor the piles stand on
const SLOT_X = [2, 29, 75, 102];
const HG = [64, TOP + DH / 2];     // the hourglass colon's centre
const HW = 4.4;                    // a stroke's half-width at the foot of its pile
const SLOPE = 0.9;                 // flank steepness (the pile's cross-section)
const LIGHT = (() => { const v = [-0.55, -0.6, 0.6]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// ------------------------------------------------------------ letterforms
//
// Each digit is a network of ridges: centre-lines in a DW x DH box. Arcs use
// clock angles in degrees (0 = up, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
const L = (...p) => p;
const rot180 = (paths) => paths.map((p) => p.map(([x, y]) => [DW - x, DH - y]));

const SKELETON = {
  0: [arc(12, 23, 7.4, 18, 0, 360, 40)],
  1: [L([5.5, 12], [13.5, 5]), L([13.5, 5], [13.5, 41]), L([6.5, 41], [19.5, 41])],
  2: [[...arc(12, 13.5, 7.4, 8.4, -72, 118, 18), [4.8, 41], [19.8, 41]]],
  3: [arc(11.5, 13, 7, 7.8, -78, 180, 18), arc(11.5, 31, 8, 10, 0, 238, 22)],
  4: [L([16.2, 41], [16.2, 5]), L([16.2, 5], [4.5, 30]), L([4.5, 30], [20.5, 30])],
  5: [[[19.5, 5], [6.4, 5], [5.6, 21.5], ...arc(11.8, 30.6, 7.7, 10.2, -58, 222, 22).slice(1)]],
  7: [[[4.5, 5], [19.5, 5], [9.2, 41]]],
  8: [arc(12, 13.3, 6.6, 8.2, 180, 540, 26), arc(12, 31.2, 7.6, 9.8, 0, 360, 30)],
  9: [[...arc(12, 14.6, 7.4, 9.6, 90, 450, 30), ...arc(8.5, 20, 10.5, 21, 105, 195, 12).slice(1)]],
};
SKELETON[6] = rot180(SKELETON[9]);

// Segments [ax, ay, bx, by, s0, len, L, open]: s0 is the arc length at a
// along its path, L the path's length, so a stroke can taper to its ends.
const SEGS = {};
for (const [d, paths] of Object.entries(SKELETON)) {
  const s = [];
  for (const p of paths) {
    const open = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) > 0.5;
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const len = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      s.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], acc, len, L, open]);
      acc += len;
    }
  }
  SEGS[d] = s;
}
const TAPER = 7;    // a free end of a stroke slopes off over this many px, like the end of a poured trail

// ------------------------------------------------------------ grains

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

/**
 * One digit as grains: every pixel of its piles is lit with a probability
 * set by how its flank faces the light (a triangular cross-section, so each
 * flank is one tone and the crest is sharp, as on a dune). The grain list
 * is in pour order: bottom up, a few rows at a time, scanning alternately
 * left and right, as the nozzle lays it down.
 */
function build(d, seed) {
  const segs = SEGS[d];
  const gx = [], gy = [];
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      const px = x + 0.5, py = y + 0.5;
      // The nearest ridge, measured against its local half-width (so a
      // tapered end gives way to a full stroke where they meet).
      let best = Infinity, bx = 0, by = 0, hw = HW, br = 0;
      for (const [ax, ay, cx, cy, s0, len, L, open] of segs) {
        const dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp01(((px - ax) * dx + (py - ay) * dy) / l2) : 0;
        const qx = ax + u * dx, qy = ay + u * dy, e = Math.hypot(px - qx, py - qy);
        const end = open ? Math.min(s0 + u * len, L - s0 - u * len) : Infinity;
        const w = HW * (0.62 + 0.38 * smooth(end / TAPER));
        if (e / w < best) { best = e / w; bx = qx; by = qy; hw = w; br = e; }
      }
      if (best > 1) continue;
      const r = br;
      let dens;
      if (r < 0.75) dens = 1;   // the crest: a sharp lit ridge
      else {
        const nx = (SLOPE * (px - bx)) / r, ny = (SLOPE * (py - by)) / r;
        const b = clamp01((nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.hypot(nx, ny, 1));
        // Two tones, as on a dune: the sunlit face nearly solid, the slip
        // face a thin even scatter, a short ramp between.
        dens = 0.3 + 0.42 * smooth((b - 0.25) / 0.5);
      }
      if (r > hw - 0.9) dens *= 0.5;           // loose grains at the foot
      // Even, random-looking scatter: interleaved gradient noise, shifted per seed.
      const sx = x + Math.floor(hash(seed, 1, 3) * 64), sy = y + Math.floor(hash(seed, 2, 3) * 64);
      const ign = (52.9829189 * ((0.06711056 * sx + 0.00583715 * sy) % 1)) % 1;
      if (ign * 0.8 + hash(x, y, seed) * 0.2 < dens) { gx.push(x); gy.push(y); }
    }
  const n = gx.length;
  // Pour order.
  const LAYER = 3;
  const key = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const layer = Math.floor((DH - 1 - gy[i]) / LAYER);
    const dir = layer & 1 ? -1 : 1;
    key[i] = layer * 1000 + dir * gx[i] + hash(i, 7, seed) * 2.5;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => key[a] - key[b]);
  const xs = new Int8Array(n), ys = new Int8Array(n);
  order.forEach((g, r) => { xs[r] = gx[g]; ys[r] = gy[g]; });
  // The nozzle follows the grains it is laying, smoothed.
  const noz = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, r - 45); j <= Math.min(n - 1, r + 45); j++) { s += xs[j]; c++; }
    noz[r] = s / c;
  }
  // Per-grain noise for the drain and the storm.
  const h1 = new Float32Array(n), h2 = new Float32Array(n);
  for (let r = 0; r < n; r++) { h1[r] = hash(r, 11, seed); h2[r] = hash(r, 13, seed); }
  return { n, xs, ys, noz, h1, h2 };
}

const CACHE = new Map();
function grains(d, seed) {
  const k = `${d}:${seed}`;
  let v = CACHE.get(k);
  if (!v) {
    if (CACHE.size > 48) CACHE.clear();
    v = build(d, seed);
    CACHE.set(k, v);
  }
  return v;
}

/**
 * Which pattern of grains a slot shows: a digit is new sand each time it is
 * poured, so the seed is the minute it was poured in (the hour for the hour
 * digits, which are rebuilt by the storm).
 */
function seedOf(k, c) {
  const day = c.year * 1000 + c.day * 37 + c.month.charCodeAt(0) * 3 + c.month.charCodeAt(2);
  const m = k === 3 ? c.m : k === 2 ? c.m - (c.m % 10) : 0;
  return (day * 24 + c.h) * 60 + m + k * 7919;
}

// ------------------------------------------------------------ the minute

const G = 320;                // gravity, px/s²
const DRAIN_T0 = -2.1;        // the old pile starts to drain
const FUNNEL = 0.85;          // slope of the crater the drain makes
const NOZ_Y = 9;              // the hopper's spout, on the glass
const POUR_T0 = 0.0, POUR = 2.4;
const BOUNCE = 0.24;

/**
 * The drain: a hole opens in the floor under the middle of the slot and the
 * pile sinks into it as in the top of an hourglass. Every column of sand
 * goes down together, the middle first (so the digit is dragged down into a
 * V and keeps its texture), and on reaching the crater's slope a grain runs
 * down it to the hole and falls through.
 */
const SINK_V = 52, SINK_TAU = 0.25, SIDE_LAG = 0.045;
function drawDrain(g, gr, x0, y0, tau) {
  const hx = DW / 2 - 0.5;
  for (let r = 0; r < gr.n; r++) {
    const x = gr.xs[r], y = gr.ys[r];
    const t = tau - DRAIN_T0 - SIDE_LAG * Math.abs(x - hx) - 0.05 * gr.h1[r];
    let px = x, py = y;
    if (t > 0) {
      const sink = SINK_V * (t - SINK_TAU * (1 - Math.exp(-t / SINK_TAU)));
      const ys = DH - FUNNEL * Math.abs(x - hx);      // the crater's slope under this column
      py = y + sink;
      if (py > ys) {
        // Down the slope towards the hole, then through it.
        const e = py - ys, l = Math.hypot(x - hx, DH - ys);
        if (e < l) { const u = e / l; px = x + (hx - x) * u; py = ys + (DH - ys) * u; }
        else { px = hx + (gr.h2[r] - 0.5); py = DH + (e - l) * 1.6; }
      }
    }
    const yy = y0 + py;
    if (yy >= H) continue;
    g.pixel(Math.round(x0 + px), Math.round(yy));
  }
}

/** The pour: each grain leaves the nozzle at its turn, falls, lands and settles. */
function drawPour(g, gr, x0, y0, tau) {
  const t = tau - POUR_T0;
  const n = gr.n;
  for (let r = 0; r < n; r++) {
    const e = (POUR * r) / n;
    if (t < e) break;
    const tx = gr.xs[r], ty = gr.ys[r];
    const ny = NOZ_Y - TOP;
    const tf = Math.sqrt((2 * (ty - ny)) / G);
    const dt = t - e;
    const scatter = (gr.h1[r] - 0.5) * 5;
    if (dt < tf) {
      const u = dt / tf;
      const x = gr.noz[r] + (tx + scatter - gr.noz[r]) * u * u;
      g.pixel(Math.round(x0 + x), Math.round(y0 + ny + 0.5 * G * dt * dt));
      continue;
    }
    const u = (dt - tf) / BOUNCE;
    if (u < 1) {
      const hop = (1.2 + 2 * gr.h2[r]) * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u);
      g.pixel(Math.round(x0 + tx + scatter * (1 - smooth(u))), Math.round(y0 + ty - hop));
    } else g.pixel(x0 + tx, y0 + ty);
  }
}

function nozzleX(gr, tau) {
  const t = tau - POUR_T0;
  const r = Math.max(0, Math.min(gr.n - 1, (t / POUR) * gr.n));
  const i = Math.floor(r), f = r - i;
  return gr.noz[i] + (gr.noz[Math.min(gr.n - 1, i + 1)] - gr.noz[i]) * f;
}

/** The nozzle: a small funnel that comes down from above the glass to pour. */
/**
 * The hopper: a funnel that comes down from above the glass to pour, and
 * goes back up when the digit is done. Its sand level falls as it empties.
 */
function drawNozzle(g, cx, tau, oy) {
  const down = smooth((tau - (POUR_T0 - 0.5)) / 0.45) * (1 - smooth((tau - (POUR_T0 + POUR + 0.15)) / 0.5));
  if (down <= 0) return;
  const tip = Math.round(NOZ_Y + oy - 14 * (1 - down));
  const x = Math.round(cx);
  const left = 1 - clamp01((tau - POUR_T0) / POUR);
  const flick = Math.floor(tau * 24);
  // The spout.
  g.pixel(x - 1, tip); g.pixel(x + 1, tip); g.pixel(x - 1, tip - 1); g.pixel(x + 1, tip - 1);
  // The cone, widening to 13 px, with a rim.
  for (let j = 2; j <= 9; j++) {
    const y = tip - j, hw = 1 + (j - 2) * 0.72;
    const a = Math.round(x - hw), b = Math.round(x + hw);
    g.pixel(a, y); g.pixel(b, y);
    // Sand inside, its surface sinking (with a dip over the spout) as it pours.
    const surf = 2 + 7.5 * left;
    for (let xx = a + 1; xx < b; xx++) {
      const dip = 1.5 * (1 - Math.abs(xx - x) / (hw + 0.5)) * (left < 1 ? 1 : 0);
      if (j <= surf - dip && hash(xx, y, flick * (j < 4 ? 1 : 0) + 3) < (j < 4 ? 0.55 : 0.8)) g.pixel(xx, y);
    }
  }
  g.hline(x - 7, tip - 10, 15);
  // Sand leaving the spout.
  if (tau >= POUR_T0 && tau < POUR_T0 + POUR) g.pixel(x, tip);
}

// ------------------------------------------------------------ the hour: a storm

const BLOW_T0 = -2.6;
const DEPOSIT_T0 = 0.15, DEPOSIT = 2.6;

function drawBlow(g, gr, x0, y0, tau) {
  for (let r = 0; r < gr.n; r++) {
    const x = gr.xs[r], y = gr.ys[r];
    const ax = x0 + x;
    const td = BLOW_T0 + 1.5 * (ax / W) + 0.4 * gr.h1[r] + 0.35 * (y / DH);
    const t = tau - td;
    if (t <= 0) { g.pixel(ax, y0 + y); continue; }
    const px = ax + 0.5 * 300 * t * t + 18 * t;
    const py = y0 + y - (10 + 14 * gr.h2[r]) * t + 3 * Math.sin(9 * t + 6 * gr.h2[r]) * Math.min(1, t * 3);
    if (px >= W) continue;
    g.pixel(Math.round(px), Math.round(py));
  }
}

function drawDeposit(g, gr, x0, y0, tau) {
  for (let r = 0; r < gr.n; r++) {
    const x = gr.xs[r], y = gr.ys[r];
    const ax = x0 + x;
    const ta = DEPOSIT_T0 + DEPOSIT * 0.75 * (ax / W) + 0.35 * gr.h1[r] + 0.25 * (1 - y / DH);
    const t = ta - tau;   // time until it lands
    if (t > 0) {
      const px = ax - (40 * t + 0.5 * 260 * t * t);
      const py = y0 + y - 8 * t + 4 * Math.sin(8 * t + 6 * gr.h2[r]) * Math.min(1, t * 4);
      if (px < 0) continue;
      g.pixel(Math.round(px), Math.round(py));
      continue;
    }
    const u = -t / 0.2;
    const hop = u < 1 ? 1.5 * Math.sin(Math.PI * u) * (1 - u) : 0;
    g.pixel(ax, Math.round(y0 + y - hop));
  }
}

/** Dust in the gale: short streaks racing left to right. */
function drawDust(g, tau, oy) {
  const env = smooth((tau - BLOW_T0) / 0.6) * (1 - smooth((tau - (DEPOSIT_T0 + DEPOSIT)) / 0.8));
  if (env <= 0) return;
  const N = Math.round(70 * env);
  for (let i = 0; i < N; i++) {
    const v = 110 + 120 * hash(i, 1, 99);
    const y = 2 + 58 * hash(i, 2, 99) + 3 * Math.sin(tau * 3 + i);
    const x = ((hash(i, 3, 99) * 170 + (tau + 10) * v) % 170) - 20;
    const len = 1 + Math.floor(3 * hash(i, 4, 99));
    for (let k = 0; k < len; k++) g.pixel(Math.round(x) - k, Math.round(y + oy));
  }
}

// ------------------------------------------------------------ the hourglass colon

const HG_H = 15;     // half height of the glass, neck to cap
const HG_W = 5.2;    // half width of a bulb
const NECK = 0.8;
const FLIP = 0.8;    // seconds the flip takes, at :00
const SETTLE = 0.3;  // the sand slides down to the neck after the flip

/** Half-width of a bulb at distance v from the neck. */
function bulbW(v) {
  const k = 0.58 * HG_H;   // widest here; rounds off towards the cap
  if (v < k) return NECK + (HG_W - NECK) * Math.sin(((v / k) * Math.PI) / 2) ** 1.3;
  return HG_W - 0.9 * ((v - k) / (HG_H - k)) ** 2;
}
// Cumulative area of a bulb from the neck, for volume -> level.
const AREA = [0];
for (let v = 1; v <= HG_H * 4; v++) AREA.push(AREA[v - 1] + 2 * bulbW((v - 0.5) / 4) / 4);
const BULB = AREA[AREA.length - 1];
const SAND = BULB * 0.7;
/** The distance from the neck at which the area from the neck reaches `a`. */
function levelFor(a) {
  let i = 0;
  while (i < AREA.length - 1 && AREA[i + 1] < a) i++;
  const f = (a - AREA[i]) / ((AREA[i + 1] ?? AREA[i] + 1) - AREA[i] || 1);
  return (i + clamp01(f)) / 4;
}
const V_FULL = levelFor(BULB - SAND);   // where a full bottom pile's surface lies

function drawHourglass(g, cx, cy, sec) {
  let phi = 0, top, bottom, settle = 1;
  if (sec < FLIP) {
    // Flipping: all the sand is in the (old) bottom bulb, turning over.
    const u = sec / FLIP;
    phi = Math.PI * (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
    top = 0; bottom = 1;
  } else {
    settle = smooth((sec - FLIP) / SETTLE);
    const a = clamp01((sec - FLIP - SETTLE) / (60 - FLIP - SETTLE - 0.4));
    top = 1 - a; bottom = a;
  }
  // Top sand lies in v = [lo, hi] from the neck. Just after the flip it is
  // still against the cap (it was the bottom pile) and slides down.
  const lvTop = levelFor(SAND * top);
  const lo = (1 - settle) * V_FULL, hi = (1 - settle) * HG_H + settle * lvTop;
  // Bottom pile: from the cap up to vB, with a cone peak.
  const vB = levelFor(BULB - SAND * bottom);
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const R = HG_H + 4;
  const draining = sec >= FLIP + SETTLE && top > 0.002;
  for (let py = Math.floor(cy - R); py <= cy + R; py++)
    for (let px = Math.floor(cx - R); px <= cx + R; px++) {
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      // Into the glass's own frame.
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      const v = Math.abs(ly), w = bulbW(v), ax = Math.abs(lx);
      // Caps and posts.
      // Caps: a plate with a rounded lip, and a thin turned post at each side.
      if (v > HG_H + 0.5 && v <= HG_H + 1.5 && ax <= HG_W + 2.5) { g.pixel(px, py); continue; }
      if (v > HG_H + 1.5 && v <= HG_H + 2.5 && ax <= HG_W + 1.5) { g.pixel(px, py); continue; }
      if (v <= HG_H + 0.5 && ax > HG_W + 1.6 && ax <= HG_W + 2.5 && (v > HG_H - 1.5 || Math.abs(v - HG_H * 0.55) < 0.5)) { g.pixel(px, py); continue; }
      if (v > HG_H + 0.5) continue;
      // The glass.
      if (Math.abs(ax - w - 0.7) < 0.55) { g.pixel(px, py); continue; }
      if (ax > w) continue;
      const gx = Math.round(lx * 2), gy = Math.round(ly * 2);
      let sand = false;
      if (ly < 0) {
        // Top bulb: sand from the neck up (or from the cap down, before it settles).
        const dip = draining ? 1.6 * (1 - ax / Math.max(1, w)) * clamp01(top * 6) : 0;
        sand = top > 0 && v >= lo && v <= hi - dip;
      } else {
        const peak = 2.4 * (1 - ax / HG_W);
        sand = bottom > 0 && v >= vB - peak * clamp01(bottom * 4);
      }
      if (sand && hash(gx, gy, 5) < 0.86) g.pixel(px, py);
      // The stream through the neck.
      if (draining && ly >= 0 && ax < 0.6 && v < vB - 2.4 && hash(py, Math.floor(sec * 40), 3) < 0.7) g.pixel(px, py);
    }
}

// ------------------------------------------------------------ face

const DIG = (c) => `${c.hh}${c.mm}`;

export default {
  name: 'Sand',
  blurb: 'Digits heaped from grains of sand: a changing digit drains through the floor, a hopper pours the new one; a storm on the hour; the colon is an hourglass.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const a = DIG(from), b = DIG(to);
    const y0 = TOP + oy;

    for (let k = 0; k < 4; k++) {
      const x0 = SLOT_X[k] + ox;
      const gFrom = grains(a[k], seedOf(k, from)), gTo = grains(b[k], seedOf(k, to));
      if (hour) {
        if (tau < 0) drawBlow(g, gFrom, x0, y0, tau);
        else drawDeposit(g, gTo, x0, y0, tau);
        continue;
      }
      if (a[k] === b[k]) { draw(g, gTo, x0, y0); continue; }
      if (tau < DRAIN_T0) draw(g, gFrom, x0, y0);
      else if (tau < POUR_T0) drawDrain(g, gFrom, x0, y0, tau);
      else drawPour(g, gTo, x0, y0, tau);
      drawNozzle(g, x0 + (tau < POUR_T0 ? gTo.noz[0] : nozzleX(gTo, tau)) + 0.5, tau, oy);
    }
    if (hour) drawDust(g, tau, oy);
    drawHourglass(g, HG[0] + ox, HG[1] + oy, f.sec);
    oled.contrast(0xcf + (0x18 - 0xcf) * night);
  },
};

function draw(g, gr, x0, y0) {
  for (let r = 0; r < gr.n; r++) g.pixel(x0 + gr.xs[r], y0 + gr.ys[r]);
}
