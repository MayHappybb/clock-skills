// Mercury — liquid metal digits.
//
// The digits are a metaball field: each is 48 charges spaced evenly along a
// drawn centre-line (round, slightly bulbous forms: a 0 that is an ellipse,
// a 4 whose joints swell where the strokes meet, a 1 with a blob of a flag),
// summed over the glass with a kernel of bounded radius and thresholded to
// one bit. The surface is shaded as clean polished chrome: a solid lit body
// with a crisp silhouette; one sharp dark horizon band, two pixels, across
// each stroke, bent gently by the surface normal (taken from a blurred copy
// of the field, so the band is one smooth curve and never fragments); a dark
// line just inside the rim on the side facing away from the light; and one
// or two glints per digit, a lit core with a thin dark crescent, riding on
// chosen charges so they move with the metal. The horizon drifts slowly, so
// the band slides over the strokes, and every stroke carries a small
// travelling ripple. (A dithered "ground" reflection was tried first: it read
// as porous stone, not metal.)
//
// The minute: 1.9 s before :00 each changing digit beads up. Every run of
// eight charges pulls towards the middle of its run, so the stroke necks
// down between beads, hangs on thin threads for a while and snaps into a
// string of droplets as the digit slumps (Plateau-Rayleigh). The droplets
// run down into one churning pool under the slot, merging as they meet,
// and the pool splits into the new digit's droplets, which climb out one by
// one (lowest first) on stretching necks and run together into strokes with
// a wobble. Beads keep their order round the pool (both digits' beads are
// sorted by the angle they lie at from it), so nothing crosses on the way
// in or out. All changing digits share one timeline; the slot is loose
// droplets or a pool, not a numeral, from about :59.2 to :01. On the hour all four digits
// melt and the four pools slide together into one long puddle under the
// colon before the new time climbs out of it. Once a minute, at a seeded
// moment, a drip forms under a digit that is not about to change: a bulge,
// a neck that thins, then either it snaps, falls and splashes into droplets
// that hop apart and evaporate, or it is drawn back up. The colon's two
// drops reach for each other every second, kiss on a neck and spring apart.
//
// Every frame is computed from the clock: the turn from the seconds to :00,
// the drip from noise of the minute, the shimmer from the time itself.
// Performance: about 200 charges, each touching only its 13 x 13 pixels.
//
// Burn-in: the face walks a 7 x 7 serpentine, a pixel every three minutes,
// the horizon band and ripples keep moving, and 23:00-07:00 the panel runs
// at low contrast.

import { noise, clockFields } from '../js/kit.js';

// ------------------------------------------------------------ layout

const W = 128, H = 64;
const BOX_W = 24, BOX_H = 40, TOP = 5;
const SLOT_X = [5, 33, 71, 99];
const COLON_X = 64, COLON_Y = [TOP + 13, TOP + 28];

// ------------------------------------------------------------ the field
//
// Every charge adds w * (1 - r²/R²)² within radius R (zero beyond), so a
// charge only touches the pixels near it. A line of charges spaced D apart
// with weight 1 has a field of λ·16a⁵/(15R⁴), a² = R² - r², λ = 1/D: the
// threshold TAU puts the surface HALF pixels from the centre-line.
const R = 6.2, R2 = R * R;
const D = 2.5, HALF = 3.7;
const TAU = (16 * (R2 - HALF * HALF) ** 2.5) / (15 * R2 * R2 * D);

const N = 48, BEAD = 8, M = N / BEAD;   // charges per digit, charges per bead, beads per digit

// ------------------------------------------------------------ skeletons
//
// Each digit's centre-line, in a BOX_W x BOX_H box, as sub-paths of points.
// Arcs use clock angles in degrees (0 = up, clockwise).
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
const L = (...pts) => pts;

const SKELETON = {
  0: [arc(12, 20, 8.3, 16.3, 30, 390, 48)],
  1: [L([5.5, 9.5], [13.5, 3.7], [13.5, 36.3])],
  2: [[...arc(12, 11.8, 8.2, 8.1, -75, 125), [3.8, 36.3], [20.5, 36.3]]],
  3: [arc(11.5, 11.3, 7.8, 7.6, -80, 180), arc(11.5, 27.6, 8.8, 8.7, 0, 240)],
  4: [L([21, 27], [3.8, 27], [16, 3.7], [16, 36.3])],
  5: [[[20, 3.7], [5, 3.7], [4.5, 18.5], ...arc(11.8, 26.6, 8.7, 9.7, -55, 225).slice(1)]],
  6: [[...arc(14.5, 22, 10.6, 18.3, 30, -60, 12).slice(0, 12), ...arc(12, 27.5, 8.2, 8.8, 270, -90, 36)]],
  7: [L([3.8, 3.7], [20.2, 3.7], [9.5, 36.3])],
  8: [arc(12, 11.2, 7.4, 7.5, 180, 540, 36), arc(12, 27.8, 8.4, 8.5, 0, 360, 40)],
  9: [[...arc(12, 12.5, 8.2, 8.8, 90, 450, 36), ...arc(9.5, 18, 10.6, 18.3, 120, 210, 12).slice(1)]],
};

const pathLen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

/** `n` points evenly spaced along polyline `p` (both ends included if open). */
function resample(p, n, closed) {
  const len = pathLen(p), out = [];
  const step = len / (closed ? n : n - 1);
  let seg = 1, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (seg < p.length - 1 && acc + Math.hypot(p[seg][0] - p[seg - 1][0], p[seg][1] - p[seg - 1][1]) < target) {
      acc += Math.hypot(p[seg][0] - p[seg - 1][0], p[seg][1] - p[seg - 1][1]);
      seg++;
    }
    const sl = Math.hypot(p[seg][0] - p[seg - 1][0], p[seg][1] - p[seg - 1][1]) || 1;
    const u = Math.min(1, Math.max(0, (target - acc) / sl));
    out.push([p[seg - 1][0] + (p[seg][0] - p[seg - 1][0]) * u, p[seg - 1][1] + (p[seg][1] - p[seg - 1][1]) * u]);
  }
  return out;
}

/**
 * A digit as N charges: beads (groups of BEAD consecutive charges) never
 * straddle two sub-paths; every charge weighs the same, scaled so a stroke
 * is equally thick whatever the digit's length.
 */
function charges(d) {
  const subs = SKELETON[d];
  const lens = subs.map(pathLen), total = lens.reduce((a, b) => a + b, 0);
  // Beads per sub-path, proportional to length, at least one each.
  const beads = lens.map((l) => Math.max(1, Math.round((l / total) * M)));
  while (beads.reduce((a, b) => a + b, 0) > M) beads[beads.indexOf(Math.max(...beads))]--;
  while (beads.reduce((a, b) => a + b, 0) < M) beads[beads.indexOf(Math.max(...beads))]++;
  const pts = [];
  subs.forEach((p, s) => {
    const first = p[0], last = p[p.length - 1];
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5;
    pts.push(...resample(p, beads[s] * BEAD, closed));
  });
  const w = total / N / D;
  const centres = [];
  // A bead gathers on the middle of its run, on the stroke itself (the run's
  // mean would sit inside a curve and pinch a 0 into an 8).
  for (let b = 0; b < M; b++) {
    const p = pts[b * BEAD + BEAD / 2 - 1], q = pts[b * BEAD + BEAD / 2];
    centres.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  }
  return { pts, w, centres };
}
const DIGITS = Object.fromEntries(Object.keys(SKELETON).map((d) => [d, charges(d)]));

// Glints: one on the stroke nearest the top-left (facing the light), and a
// second on the lower bowl of the digits that have one.
for (const [d, D] of Object.entries(DIGITS)) {
  const best = (ok) => {
    let bi = -1;
    D.pts.forEach(([x, y], i) => { if (ok(y) && (bi < 0 || x + 1.4 * y < D.pts[bi][0] + 1.4 * D.pts[bi][1])) bi = i; });
    return bi;
  };
  D.glints = [best(() => true)];
  if ('3568'.includes(d)) D.glints.push(best((y) => y > 23));
}

// ------------------------------------------------------------ drawing

const field = new Float32Array(W * H);

function splat(x, y, w) {
  if (w <= 0) return;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy;
    if (dy2 >= R2) continue;
    const row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, r2 = dx * dx + dy2;
      if (r2 < R2) { const k = 1 - r2 / R2; field[row + px] += w * k * k; }
    }
  }
}

const inside = new Uint8Array(W * H);
const tmp = new Float32Array(W * H), soft = new Float32Array(W * H);
const L2 = Math.SQRT1_2;   // the light, up and to the left, in the screen plane

/**
 * Shade the thresholded field as polished chrome, in four clean parts:
 *  - the body is solid;
 *  - one crisp dark horizon band, two pixels, where the reflected horizon
 *    falls: its height bends with the surface normal, taken from a blurred
 *    copy of the field so the band is one smooth curve, not fragments;
 *  - a dark line one pixel inside the rim on the side away from the light;
 *  - glints (drawn after, by `glint`).
 */
function shade(g, horizon) {
  for (let i = 0; i < W * H; i++) inside[i] = field[i] >= TAU ? 1 : 0;
  // Blur (5 x 5 box, separable) for smooth normals.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let d = -2; d <= 2; d++) { const xx = x + d; if (xx >= 0 && xx < W) acc += field[row + xx]; }
      tmp[row + x] = acc / 5;
    }
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let d = -2; d <= 2; d++) { const yy = y + d; if (yy >= 0 && yy < H) acc += tmp[yy * W + x]; }
      soft[y * W + x] = acc / 5;
    }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : inside[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!inside[i]) continue;
      // The silhouette pixel itself is always lit: a crisp edge.
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) { g.pixel(x, y, 1); continue; }
      const gx = (x < W - 1 ? soft[i + 1] : 0) - (x > 0 ? soft[i - 1] : 0);
      const gy = (y < H - 1 ? soft[i + W] : 0) - (y > 0 ? soft[i - W] : 0);
      const gl = Math.hypot(gx, gy) || 1;
      const nx = -gx / gl, ny = -gy / gl;                      // outward, in the screen plane
      const tilt = Math.min(1, gl / (0.9 * TAU));             // 0 on a ridge, 1 near the edge
      // Shadow side: one dark pixel just inside the rim.
      const second = !at(x - 2, y) || !at(x + 2, y) || !at(x, y - 2) || !at(x, y + 2);
      if (second && (nx + ny) * L2 > 0.6) continue;
      // The horizon, reflected: the surface's slope bends it up or down.
      const e = y - horizon + 2.5 * ny * tilt;
      if (e >= 0 && e < 2) continue;
      g.pixel(x, y, 1);
    }
}

/**
 * A glint: a lit core with a thin dark ring, on the stroke facing the light.
 * It rides on one charge, so it moves with the metal.
 */
function glint(g, x, y) {
  const cx = Math.round(x - 1.1), cy = Math.round(y - 1.1);
  if (!inside[cy * W + cx]) return;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const r2 = dx * dx + dy * dy;
      const j = (cy + dy) * W + cx + dx;
      // Only inside the body: the silhouette stays whole.
      if (r2 > 4 || !inside[j] || !inside[j - 1] || !inside[j + 1] || !inside[j - W] || !inside[j + W]) continue;
      // The ring is open towards the light, so the glint blooms into the
      // bright rim instead of sitting on the metal like a rivet.
      if (r2 <= 1) g.pixel(cx + dx, cy + dy, 1);
      else if (dx + dy >= 0) g.pixel(cx + dx, cy + dy, 0);
    }
}

// ------------------------------------------------------------ motion

// The minute turn, in seconds from :00.
const BEAD_T0 = -1.9;   // the strokes start to bead up
const BEAD_T1 = -0.85;  // beaded: a string of droplets
const POOL_T0 = -0.1;   // every bead has run down into one pool
const POOL_T1 = 0.15;   // the pool starts to split into the new digit's beads
const SPLIT_T1 = 1.0;   // the last bead has climbed into place
const MERGE_T1 = 1.7;   // the beads have run back together into strokes
const BEADED = 0.93;    // how far a charge pulls into its bead
const DROOP = 3;        // the old digit slumps this far as it beads
const STAGGER = 0.35;   // spread of the beads' timing (lowest first in, lowest first out)
const POOL = [12, 29], POOL_R = 4.6;

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const inOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const inQuad = (u) => u * u;
/** Settles with a wobble: overshoots past 1 and rings down. */
const ring = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-5 * u) * Math.cos(9 * u) * (1 - u));

/**
 * Where each bead of a digit sits in the pool: the beads are sorted by the
 * angle they lie at seen from the pool, and take the pool's places in that
 * order, so none crosses another on its way in or out.
 */
for (const d of Object.values(DIGITS)) {
  const ang = d.centres.map(([x, y]) => Math.atan2(x - POOL[0], POOL[1] - y));
  const byAng = ang.map((_, i) => i).sort((i, j) => ang[i] - ang[j]);
  d.poolSlot = new Array(M);
  byAng.forEach((g, r) => { d.poolSlot[g] = r; });
  // Timing rank: the lowest bead moves first.
  const ys = d.centres.map((c) => c[1]);
  const byY = ys.map((_, i) => i).sort((i, j) => ys[j] - ys[i]);
  d.rank = new Array(M);
  byY.forEach((g, r) => { d.rank[g] = r / (M - 1); });
}

/**
 * How far the charges have pulled into their beads, u = 0..1 through the
 * beading: quickly to lumps, then slowly while the necks thin (the part
 * worth watching), then the snap.
 */
const beading = (u) => 0.36 * smooth(clamp01(u / 0.3)) + 0.2 * clamp01((u - 0.3) / 0.5) + 0.44 * smooth(clamp01((u - 0.8) / 0.2));

/**
 * Place r of slot k's pool at time tau: a ring of beads, churning. On the
 * hour the four pools slide together into one long puddle under the colon,
 * and back.
 */
function poolAt(k, r, tau, hour) {
  const a = (2 * Math.PI * r) / M + tau * 2.2;
  const rad = POOL_R * (1 + 0.15 * Math.sin(tau * 9 + r));
  let dx = 0, dy = 0;
  if (hour) {
    const m = smooth(clamp01((tau - BEAD_T1) / (POOL_T0 - BEAD_T1))) * (1 - smooth(clamp01((tau - POOL_T1) / (SPLIT_T1 - POOL_T1) / 0.6)));
    dx = m * (64 + (k - 1.5) * 10 - (SLOT_X[k] + POOL[0]));
    dy = m * 3;
  }
  return [POOL[0] + dx + rad * Math.sin(a) * 1.25, POOL[1] + dy - rad * Math.cos(a) * 0.8];
}

/** The idle shimmer: a small travelling wave along every stroke. */
const wobble = (T, i, k) => [0.25 * Math.sin(T * 5.1 + i * 1.3 + k), 0.5 * Math.sin(T * 7.3 + i * 0.75 + k * 2)];

/**
 * The charges of slot k showing digit a turning into b, `tau` seconds from
 * the turn (a === b: just a, shimmering).
 */
function slot(k, a, b, tau, T, put, hour) {
  const ox = SLOT_X[k], oy = TOP;
  const A = DIGITS[a], B = DIGITS[b];
  if ((a === b && !hour) || tau < BEAD_T0 || tau >= MERGE_T1) {
    const d = tau < BEAD_T0 ? A : B;
    d.pts.forEach(([x, y], i) => { const [wx, wy] = wobble(T, i, k); put(ox + x + wx, oy + y + wy, d.w); });
    return;
  }
  const wMid = (A.w + B.w) / 2;
  if (tau < BEAD_T1) {
    // Beading: each run of BEAD charges pulls together, the stroke necks
    // down between them and snaps into droplets, and the digit slumps.
    const p = beading((tau - BEAD_T0) / (BEAD_T1 - BEAD_T0));
    A.pts.forEach(([x, y], i) => {
      const [cx, cy] = A.centres[Math.floor(i / BEAD)];
      const [wx, wy] = wobble(T, i, k);
      put(ox + x + (cx - x) * BEADED * p + wx, oy + y + (cy - y) * BEADED * p + DROOP * p + wy, A.w);
    });
    return;
  }
  const span = 1 - STAGGER;
  const beadAt = (cx, cy, D, g, w, spread) => {
    for (let j = 0; j < BEAD; j++) {
      const [px, py] = D.pts[g * BEAD + j];
      const [ccx, ccy] = D.centres[g];
      put(ox + cx + (px - ccx) * spread, oy + cy + (py - ccy) * spread, w);
    }
  };
  if (tau < POOL_T1) {
    // Gathering: the droplets run down into one pool, merging as they meet.
    for (let g = 0; g < M; g++) {
      const u = clamp01(((tau - BEAD_T1) / (POOL_T0 - BEAD_T1) - A.rank[g] * STAGGER) / span);
      const e = inQuad(u) * 0.6 + inOut(u) * 0.4;
      const [ax, ay] = A.centres[g], [px, py] = poolAt(k, A.poolSlot[g], tau, hour);
      const cx = ax + (px - ax) * e, cy = ay + DROOP + (py - ay - DROOP) * e;
      beadAt(cx, cy, A, g, A.w + (wMid - A.w) * e, (1 - BEADED) * (1 - e));
    }
    return;
  }
  if (tau < SPLIT_T1) {
    // Splitting: the pool pinches off a bead at a time and each climbs to
    // its place in the new digit, on a neck that stretches and snaps.
    for (let g = 0; g < M; g++) {
      const u = clamp01(((tau - POOL_T1) / (SPLIT_T1 - POOL_T1) - B.rank[g] * STAGGER) / span);
      const e = inOut(u);
      const [px, py] = poolAt(k, B.poolSlot[g], tau, hour), [bx, by] = B.centres[g];
      beadAt(px + (bx - px) * e, py + (by - py) * e, B, g, wMid + (B.w - wMid) * e, (1 - BEADED) * e);
    }
    return;
  }
  // Merging: the beads run back together into strokes, with a wobble.
  const p = ring((tau - SPLIT_T1) / (MERGE_T1 - SPLIT_T1));
  B.pts.forEach(([x, y], i) => {
    const [cx, cy] = B.centres[Math.floor(i / BEAD)];
    const [wx, wy] = wobble(T, i, k);
    const pull = BEADED * (1 - p);
    put(ox + x + (cx - x) * pull + wx * p, oy + y + (cy - y) * pull + wy * p, B.w);
  });
}

// A drip, once a minute, from a digit that is not about to change.
const DRIP_LEN = 6.5;
const FLOOR = 60;
const GRAV = 140;

/** The lowest charge of a digit: where a drip forms. */
const LOWEST = Object.fromEntries(Object.entries(DIGITS).map(([d, { pts }]) => {
  let best = pts[0];
  for (const p of pts) if (p[1] > best[1] + 0.3 || (Math.abs(p[1] - best[1]) <= 0.3 && Math.abs(p[0] - 12) < Math.abs(best[0] - 12))) best = p;
  return [d, best];
}));

/**
 * The drip of minute K at second `sec`: a bulge grows under the digit,
 * stretches on a thinning neck, and either snaps (falls, splashes into three
 * droplets that skid apart and evaporate) or is drawn back up.
 */
function drip(K, sec, digits, nextDigits, put, floor) {
  const t0 = 8 + 34 * noise(K, 21), t = sec - t0;
  if (t < 0 || t > DRIP_LEN) return;
  // From the digit that will not change at the next turn, so no drip and turn meet.
  // (None on the hour, when every digit melts.)
  const cands = nextDigits.endsWith('00') ? [] : [0, 1, 2, 3].filter((k) => digits[k] === nextDigits[k]);
  if (!cands.length) return;
  const k = cands[Math.floor(noise(K, 22) * cands.length)];
  const [lx, ly] = LOWEST[digits[k]];
  const sx = SLOT_X[k] + lx, sy = TOP + ly;
  const falls = noise(K, 23) < 0.65;
  if (t < 1.4) {
    const e = smooth(t / 1.4);
    put(sx, sy + 1 + 3 * e, 1.5 * e);
    return;
  }
  if (t < 2.1) {
    const u = smooth((t - 1.4) / 0.7);
    const dy = 4 + 6 * u;
    put(sx, sy + dy, 1.5);
    put(sx, sy + dy * 0.5, 0.9 * (1 - u));          // the neck, thinning to the snap
    if (!falls) return;
    return;
  }
  if (!falls) {
    // Drawn back up: the drop rises into the digit and is absorbed.
    const u = clamp01((t - 2.1) / 0.9);
    put(sx, sy + 10 - 10 * ring(u), 1.5 * (1 - u * u));
    put(sx, sy + 5 - 5 * u, 0.9 * u * (1 - u) * 2);
    return;
  }
  // Free fall from where it snapped, then the splash.
  const yStart = sy + 10, tf = Math.sqrt((2 * Math.max(1, floor - yStart)) / GRAV);
  const tt = t - 2.1;
  if (tt < tf) {
    const y = yStart + 0.5 * GRAV * tt * tt;
    // It stretches as it speeds up.
    const v = GRAV * tt;
    put(sx, y, 1.45);
    put(sx, y - Math.min(3.5, v * 0.04), 0.7);
    return;
  }
  const ts = tt - tf, life = 1.4;
  if (ts > life) return;
  const fade = 1 - ts / life;
  // The splash: the drop flattens into a puddle that sinks away, and throws
  // two droplets that hop sideways and evaporate.
  const flat = Math.min(1, ts / 0.12);
  for (const dx of [-2.5, 0, 2.5]) put(sx + dx * flat, floor + 1 + 2 * ts, (dx ? 0.75 : 1.1) * fade);
  for (const dir of [-1, 1]) {
    const x = sx + dir * 14 * (1 - Math.exp(-3 * ts));
    const hop = Math.max(0, 22 * ts - 55 * ts * ts);
    put(x, floor - hop, 0.95 + 0.45 * fade);
  }
}

/**
 * Burn-in: the face walks a 7 x 7 serpentine, a pixel every three minutes
 * (stepping at :30, clear of the turn), so no pixel sits under the middle
 * of a stroke, or of the colon, all day.
 */
function walk(date) {
  const k = Math.floor((date.getTime() - 30000) / 180000);
  const p = ((k % 49) + 49) % 49, row = Math.floor(p / 7), col = row & 1 ? 6 - p % 7 : p % 7;
  return [col - 3, row - 3];
}

const digitsAt = (minute) => { const c = clockFields(new Date(minute * 60000)); return `${c.hh}${c.mm}`; };

export default {
  name: 'Mercury',
  blurb: 'Liquid chrome digits: they bead up, run into a pool and climb out as the new minute; drips fall and splash.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    field.fill(0);
    const T = date.getTime() / 1000;
    const K = Math.floor(T / 60);
    const [ox, oy] = walk(date);
    const put = (x, y, w) => splat(x + ox, y + oy, w);
    // The turn that matters: in the first half of the minute the one that
    // brought this minute in, in the second half the coming one.
    const late = f.sec >= 30;
    const from = late ? digitsAt(K) : digitsAt(K - 1), to = late ? digitsAt(K + 1) : digitsAt(K);
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.slice(2) === '00';
    // Each slot's glints ride on chosen charges: record where they land.
    const glints = [];
    for (let k = 0; k < 4; k++) {
      const d = DIGITS[from[k] !== to[k] || hour ? (tau < POOL_T1 ? from[k] : to[k]) : to[k]];
      let n = 0;
      slot(k, from[k], to[k], tau, T, (x, y, w) => {
        if (d.glints.includes(n)) glints.push([x + ox, y + oy]);
        n++;
        put(x, y, w);
      }, hour);
    }
    drip(K, f.sec, digitsAt(K), digitsAt(K + 1), put, FLOOR - oy);

    // The colon: two drops that reach for each other every second, touch
    // on a neck and spring apart.
    const frac = f.sec - Math.floor(f.sec);
    const reach = 3.4 * Math.sin(Math.PI * clamp01(frac / 0.6)) ** 3;
    put(COLON_X, COLON_Y[0] + reach, 2.1);
    put(COLON_X, COLON_Y[1] - reach, 2.1);
    // The reflected horizon drifts slowly, so light runs over the metal.
    shade(g, TOP + 20 + oy + 4 * Math.sin(T * 0.35) + 1.5 * Math.sin(T * 0.93));
    for (const [x, y] of glints) glint(g, x, y);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
  },
};
