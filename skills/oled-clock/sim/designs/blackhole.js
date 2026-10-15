// Blackhole — the time beside a black hole.
//
// The colon is a black hole seen nearly edge-on, Gargantua-style: a black
// shadow, a photon ring at its rim with light running round it, and an
// accretion disc whose near half crosses in front of the shadow while light
// from its far half is bent up over the top and under the bottom (the halo).
// The disc is gas on Keplerian circles: every 1.2 px ring of it carries its
// own knots at its own speed (ω ∝ r^-1.5), so it streams and shears.
//
// The digits (a squared space-age hand of its own) and a drifting starfield
// sit on a plane behind the hole and are drawn through a point lens: each
// screen pixel θ shows the source point β = θ (1 - θE²/θ²). So the stems
// next to the hole bow round it, stars passing behind it smear into arcs
// and double images, and anything that comes near the centre becomes an
// Einstein ring. Digits are distance fields, sampled at the lensed point.
//
// The minute: from :55.8 each digit about to change leans in, then falls in
// as in free fall, r = r0 (1 - (s/tff)²)^(2/3) with the near side first, so
// it is spaghettified along the infall, winds round, tears into filaments
// where it is stretched, and as it crosses the centre the lens throws it
// round the photon ring as arcs. The disc spins up and brightens; at :00 a
// flare ring leaves the rim. Then the hole fires its jets, two beams with
// knots running out, and the matter comes back: grains run up the jets,
// arc over like gas on field lines and rain onto the new digit's pixels,
// which light where they land; the digit pops as the last grains arrive.
//
// The hour: the hole feeds. From :52 it swells (the Einstein radius more
// than doubles) and the whole time bends round it into arcs; from :53.5
// every digit falls in and the disc becomes a giant Gargantua. At :00 the
// hole collapses to nothing, the panel flashes (one inverted frame), and a
// shock front races out, drawing the new time in behind it; then the hole
// forms again from nothing, re-bending the digits as it grows, and its disc
// condenses back out of a wide cloud.
//
// Everything is a function of the clock: the disc's phase is wall time plus
// a spin-up that is paid back over the next half minute; the infall is a
// table built per frame from tau; ejecta flights are closed-form from each
// grain's launch instant (the grain list is cached per digit and offset).
//
// Burn-in: everything walks kit.orbit (3 px), the disc and ring move all the
// time, and from 23:00 to 07:00 the panel dims.

import { dither, clockFields, previousMinute, orbit, ease } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;

/** A good integer hash, as a float in [0, 1). */
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const prog = (v, a, b) => clamp01((v - a) / (b - a));
/** 0 -> 1 -> 0 over [a, b] (rise), [c, d] (fall). */
const bump = (v, a, b, c, d) => smooth(prog(v, a, b)) * (1 - smooth(prog(v, c, d)));

// ------------------------------------------------------------ letterforms
//
// A squared, extended space-age hand (rounded rectangles, straight stems),
// because straight lines are what show the lensing best: near the hole a
// stem bows round it. Centre-lines in a 20 x 36 box, stroked 5 px wide.

const GW = 20, GH = 36, HW = 2.5;
const X0 = 2.5, X1 = 17.5, Y0 = 2.5, Y1 = 33.5, YM = 17.5;

/** A polyline with its corners rounded to radius r (a number or one per point). */
function fillet(pts, radii, closed = false) {
  const n = pts.length, out = [];
  const R = (i) => (Array.isArray(radii) ? radii[i] ?? 0 : radii);
  for (let i = 0; i < n; i++) {
    const p = pts[i], r = R(i);
    if ((!closed && (i === 0 || i === n - 1)) || !r) { out.push(p); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let ux = a[0] - p[0], uy = a[1] - p[1]; const la = Math.hypot(ux, uy); ux /= la; uy /= la;
    let vx = b[0] - p[0], vy = b[1] - p[1]; const lb = Math.hypot(vx, vy); vx /= lb; vy /= lb;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    const t = Math.min(r / Math.tan(ang / 2), la * 0.5, lb * 0.5), rr = t * Math.tan(ang / 2);
    let bx = ux + vx, by = uy + vy; const lbs = Math.hypot(bx, by); bx /= lbs; by /= lbs;
    const cd = rr / Math.sin(ang / 2), cx = p[0] + bx * cd, cy = p[1] + by * cd;
    const a1 = Math.atan2(p[1] + uy * t - cy, p[0] + ux * t - cx);
    let da = Math.atan2(p[1] + vy * t - cy, p[0] + vx * t - cx) - a1;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= 8; k++) out.push([cx + rr * Math.cos(a1 + (da * k) / 8), cy + rr * Math.sin(a1 + (da * k) / 8)]);
  }
  if (closed) out.push(out[0]);
  return out;
}

const SKEL = {
  0: [fillet([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], 6.5, true)],
  1: [fillet([[5, 9], [12.5, Y0], [12.5, Y1]], 1.2)],
  2: [fillet([[X0, 9], [X0, Y0], [X1, Y0], [X1, YM], [X0, YM], [X0, Y1], [X1, Y1]], [0, 5, 5, 5, 5, 0.8, 0])],
  3: [fillet([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], [0, 5, 5, 0]), [[5.5, YM], [X1, YM]]],
  4: [fillet([[X0, Y0], [X0, 23], [X1, 23]], [0, 3, 0]), [[13.5, 11], [13.5, Y1]]],
  5: [fillet([[X1, Y0], [X0, Y0], [X0, 16], [X1, 16], [X1, Y1], [X0, Y1]], [0, 0.6, 0.6, 5.5, 5.5, 0])],
  6: [fillet([[X1 - 1, Y0], [X0, Y0], [X0, Y1], [X1, Y1], [X1, 16], [X0, 16]], [0, 6, 5.5, 5.5, 5, 0])],
  7: [fillet([[X0, Y0], [X1, Y0], [8.5, Y1]], [0, 1.5, 0])],
  8: [fillet([[X0 + 0.5, Y0], [X1 - 0.5, Y0], [X1 - 0.5, YM], [X0 + 0.5, YM]], 5, true),
    fillet([[X0, YM], [X1, YM], [X1, Y1], [X0, Y1]], 6, true)],
};
SKEL[9] = SKEL[6].map((p) => p.map(([x, y]) => [GW - x, GH - y]));

// Each glyph as a distance field at 4 samples a pixel: the distance from a
// point to the nearest centre-line. A pixel is lit where it is under HW.
// Sampling a field (rather than a bitmap) lets the lens and the infall warp
// the digit by mapping coordinates, so it bends smoothly at any sub-pixel.
const SS = 4, MG = 4;
const SW = (GW + 2 * MG) * SS, SHt = (GH + 2 * MG) * SS;
const SDF = {};
for (const [d, paths] of Object.entries(SKEL)) {
  const segs = [];
  for (const p of paths) for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  const D = new Float32Array(SW * SHt);
  for (let j = 0; j < SHt; j++)
    for (let i = 0; i < SW; i++) {
      const x = (i + 0.5) / SS - MG, y = (j + 0.5) / SS - MG;
      let best = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let u = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = x - ax - u * dx, ey = y - ay - u * dy, e = ex * ex + ey * ey;
        if (e < best) best = e;
      }
      D[j * SW + i] = Math.sqrt(best);
    }
  SDF[d] = D;
}

/** Distance to glyph d's centre-line at glyph coordinates (gx, gy); big outside its box. */
function sdfAt(D, gx, gy) {
  if (gx <= -MG || gy <= -MG || gx >= GW + MG || gy >= GH + MG) return 99;
  return D[(((gy + MG) * SS) | 0) * SW + (((gx + MG) * SS) | 0)];
}

// ------------------------------------------------------------ layout and lens

const CX = 64, CY = 32;                    // the hole, before the orbit
const E0 = 10, RS0 = 7.5;                     // Einstein radius and shadow radius, px
// Where the digits are on the source plane (behind the hole). The lens
// pushes every image outward, so they are placed a little in.
const SLOT_X = [6, 30.5, 77.5, 102], SLOT_Y = 14;

/**
 * The point lens, screen to source: a ray seen at offset θ from the hole
 * came from β = θ (1 - θE² / |θ|²). Outside the Einstein ring that is an
 * image pushed outward and stretched round the hole; inside it, a small
 * mirrored image of what is on the far side; inside the shadow, nothing.
 */
const MASK = new Uint8Array(W * H), DIL = new Uint8Array(W * H);

// The starfield, on the source plane: a jittered grid, drifting left.
const SC = 9, SCN = 4096;
function starAt(u, v) {
  const cx = Math.floor(u / SC), cy = Math.floor(v / SC), ci = cx & (SCN - 1);
  if (hash(ci, cy, 77) > 0.42) return false;
  const sx = cx * SC + 1 + hash(ci, cy, 78) * (SC - 2), sy = cy * SC + 1 + hash(ci, cy, 79) * (SC - 2);
  return u >= sx && u < sx + 1 && v >= sy && v < sy + 1;
}

/**
 * The lensed background: the digits and the stars, as the hole bends them.
 * `slots` are what each slot shows: { D, x, y, hw } a resting digit, or
 * { D, x, y, hw, V, K } one falling in (see fallWarp). Fills MASK with the
 * digit pixels.
 */
function background(g, hx, hy, E, rs, slots, drift, reveal = Infinity) {
  MASK.fill(0);
  const E2 = E * E, rs2 = rs * rs;
  for (let y = 0; y < H; y++) {
    const dy = y + 0.5 - hy;
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - hx, d2 = dx * dx + dy * dy;
      if (d2 < rs2) continue;
      const k = d2 > 1e-6 ? 1 - E2 / d2 : 1;
      const bx = dx * k, by = dy * k;
      const sx = hx + bx, sy = hy + by;
      let lit = false;
      for (let s = 0; s < slots.length && !lit; s++) {
        const S = slots[s];
        if (!S) continue;
        if (!S.fall) { lit = sdfAt(S.D, sx - S.x, sy - S.y) < S.hw; continue; }
        // Falling: undo the infall to find which bit of the digit is here.
        const r = Math.sqrt(bx * bx + by * by);
        if (r >= S.rEnd) continue;
        const j = r * 4, j0 = j | 0, r0 = S.inv[j0] + (S.inv[j0 + 1] - S.inv[j0]) * (j - j0);
        const a = Math.atan2(by, bx) + S.K * Math.log(r0 / Math.max(r, 0.4));
        if (sdfAt(S.D, hx + r0 * Math.cos(a) - S.x, hy + r0 * Math.sin(a) - S.y) >= S.hw) continue;
        const dt = S.duty[(r0 * 4) | 0] ?? 1;
        lit = dt >= 1 || (r0 / 0.9) % 1 < Math.max(0.3, dt);
      }
      if (lit && reveal < 200 && Math.hypot(dx, dy * 1.25) > reveal - 6 * hash(x, y, 41)) lit = false;
      if (lit) { MASK[y * W + x] = 1; g.pixel(x, y); continue; }
      if (starAt(sx + drift, sy)) g.pixel(x, y);
    }
  }
  // The digits keep a dark rim: the disc and jets pass behind them.
  DIL.fill(0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!MASK[y * W + x]) continue;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const xx = x + i, yy = y + j;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) DIL[yy * W + xx] = 1;
        }
    }
}

/** A pixel the disc, jets and flares may light: not on or next to a digit. */
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !DIL[y * W + x];
const put = (g, x, y) => { x = Math.floor(x); y = Math.floor(y); if (free(x, y)) g.pixel(x, y); };

// ------------------------------------------------------------ the accretion disc
//
// Gas on Keplerian circles (ω ∝ r^-1.5: the inner edge streams round in two
// seconds, the outer edge creeps) in a disc seen nearly edge-on. Every
// pixel near the hole asks where on the disc its light came from: the near
// half directly, crossing in front of the shadow; the far half bent over
// the top of the hole and, inside the Einstein ring, under it. That is the
// halo a black hole is known by. The gas is clumpy: each narrow ring of it
// carries knots that stream at that ring's own speed, so the disc shears.
// The side swinging towards us (left) is Doppler-brightened.

const CI = 0.23, RIN = 1.6, ROUT = 24, W0 = 2.9;

/** Brightness of the disc at disc-plane point (X, Z), radii scaled by m. */
function gas(X, Z, rs, m, Teff, rho) {
  const r = Math.hypot(X, Z) / m, rin = RS0 + RIN;
  if (r < rin - 0.6 || r > ROUT) return 0;
  const phi = Math.atan2(Z, X);
  const om = W0 * (rin / Math.max(r, rin)) ** 1.5;
  // Clumps: value noise round each 1.2 px ring, carried at its own speed.
  const ring = Math.floor(r / 1.2), cells = 5 + Math.round(r * 0.55);
  const u = ((phi + om * Teff) / TAU) * cells + hash(ring, 3, 9) * cells;
  const i = Math.floor(u), fr = u - i, s = fr * fr * (3 - 2 * fr);
  const c0 = ((i % cells) + cells) % cells, c1 = (c0 + 1) % cells;
  const n = hash(c0, ring, 11) * (1 - s) + hash(c1, ring, 11) * s;
  const prof = (rin / r) ** 1.3 * smooth((r - rin + 0.6) / 1.2) * (1 - smooth((r - ROUT + 9) / 9));
  const dop = 1 - 0.45 * (X / Math.max(1, Math.hypot(X, Z)));
  return rho * prof * dop * (0.55 + 2.2 * n * n);
}

function disc(g, hx, hy, rs, E, Teff, rho, m) {
  if (rho <= 0 || rs <= 0.5) return;
  const Ed = rs * 1.45, Ed2 = Ed * Ed, rs2 = rs * rs;
  const RX = ROUT * m + 2, RY = Math.max(ROUT * m * CI, Ed + 4) + 2;
  for (let y = Math.floor(hy - RY); y <= hy + RY; y++)
    for (let x = Math.floor(hx - RX); x <= hx + RX; x++) {
      if (!free(x, y)) continue;
      const dx = x + 0.5 - hx, dy = y + 0.5 - hy, d2 = dx * dx + dy * dy;
      let b = 0;
      if (dy >= 0) b = gas(dx, dy / CI, rs, m, Teff, rho);           // near side, in front
      else if (d2 >= rs2) {
        // Far side, over the top: bent the more the further behind the hole.
        const q = (-dy / Math.sqrt(d2)) ** 0.6, k = 1 - (Ed2 * q) / d2;
        const by = dy * k;
        if (by < 0) b = gas(dx * k, by / CI, rs, m, Teff, rho);
      }
      if (dy > 0 && d2 >= rs2 && d2 < Ed2) {
        // ... and under it: the inner image, inside the Einstein ring.
        const k = 1 - Ed2 / d2, by = dy * k;
        if (by < 0) b = Math.max(b, 0.8 * gas(dx * k, by / CI, rs, m, Teff, rho));
      }
      if (b > 0.12 && dither(x, y, (b - 0.12) * 1.6)) g.pixel(x, y);
    }
}

/** The photon ring: a thin rim at the shadow's edge, its light running round. */
function photonRing(g, hx, hy, rs, T, boost) {
  if (rs <= 0.5) return;
  const w = 1 + 1.2 * boost, R = rs + 3;
  for (let y = Math.floor(hy - R); y <= hy + R; y++)
    for (let x = Math.floor(hx - R); x <= hx + R; x++) {
      const dx = x + 0.5 - hx, dy = y + 0.5 - hy, d = Math.hypot(dx, dy);
      if (d < rs || d >= rs + w || !free(x, y)) continue;
      const a = Math.atan2(dy, dx);
      const lv = 0.82 + 0.18 * Math.cos(2 * a + 2.1 * T) + 0.14 * Math.cos(5 * a - 3.3 * T) + boost;
      if (dither(x, y, lv)) g.pixel(x, y);
    }
}

// ------------------------------------------------------------ the schedule
//
// tau is seconds from the turn (negative before :00). Every quantity is a
// closed-form function of tau, so any instant renders on its own.

const MIN_T0 = -4.2;          // the minute starts to lean in

/**
 * The extra time the disc has been run forward by (its spin-up). It rises
 * over the turn and is paid back over the next half minute, unnoticeably
 * slower, so the disc is continuous across every minute.
 */
const boost = (tau, D, a, b) => D * smooth(prog(tau, a, b)) * (1 - smooth(prog(tau, b, 30)));

function schedule(tau, hour) {
  const s = { E: E0, rs: RS0, rho: 1, m: 1, Tb: 0, ring: 0, V: 0, K: 0 };
  if (!hour) {
    s.Tb = boost(tau, 2.6, -3, 1.4);
    s.rho = 1 + 0.6 * bump(tau, -2.6, -0.4, 0.3, 2.6);
    s.ring = 0.6 * bump(tau, -1.2, -0.1, 0.05, 1.0);
    s.V = prog(tau, MIN_T0, -0.1);
    s.K = 1.8 * smooth(prog(tau, -3.4, -0.6));
    return s;
  }
  // The hour: the hole feeds and swells, swallows the whole time, collapses
  // to nothing at :00 and blows it back out; then it forms again.
  const grow = ease.inOutCubic(prog(tau, -8, -3.4));
  const crush = ease.inCubic(prog(tau, -0.32, 0));
  const reform = ease.outBack(prog(tau, 0.7, 3.2));
  const k = tau < 0.3 ? 1 + 0.9 * grow - 1.92 * crush : 0.02 + 0.98 * reform;
  s.E = E0 * Math.max(0, k) * (tau < 0.3 ? 1 + 0.6 * grow : 1);
  s.rs = RS0 * Math.max(0, k);
  s.Tb = boost(tau, 5, -8, 0);
  s.ring = 0.5 * bump(tau, -3, -1, -0.3, 0);
  s.V = prog(tau, -6.5, -0.3);
  s.K = 1.3 * smooth(prog(tau, -5, -1));
  s.rho = tau < 0.3 ? 1 + 0.8 * grow : smooth(prog(tau, 1.2, 4.5));
  s.m = tau < 0.3 ? 1 : 1 + 1.6 * (1 - ease.outCubic(prog(tau, 1.2, 5)));
  return s;
}

// ------------------------------------------------------------ jets and ejecta
//
// The minute: the swallowed digit comes back as a jet. Two beams leave the
// poles at :00.25, knots running out along them; matter is thrown up each
// beam, arcs over like gas on a field line and rains down on the new digit's
// pixels, which light where it lands. Each grain of it is a closed-form
// flight from its own launch instant.

function jets(g, hx, hy, rs, tau) {
  const on = smooth(prog(tau, 0.15, 0.3));
  if (on <= 0 || tau > 3.6) return;
  const len = 34 * ease.outCubic(prog(tau, 0.15, 0.7));
  const cut = 60 * Math.max(0, tau - 2.5) ** 1.4;           // the beam detaches and flies off
  const x0 = Math.floor(hx);
  for (const sg of [-1, 1])
    for (let j = 0; j < len; j++) {
      if (j < cut) continue;
      const y = Math.floor(hy + sg * (rs + 0.5 + j));
      const knot = 0.5 + 0.5 * Math.cos((j - 75 * tau) * 0.55);
      const fade = (1 - j / 40) * on;
      const core = 0.55 + 0.45 * knot;
      if (dither(x0, y, core * fade + 0.25) && free(x0, y)) g.pixel(x0, y);
      if (dither(x0 - 1, y, core * fade + 0.15) && free(x0 - 1, y)) g.pixel(x0 - 1, y);
      // The cone at the base.
      const wing = knot * fade * (1 - j / 14);
      if (wing > 0) {
        if (dither(x0 + 1, y, wing) && free(x0 + 1, y)) g.pixel(x0 + 1, y);
        if (dither(x0 - 2, y, wing) && free(x0 - 2, y)) g.pixel(x0 - 2, y);
      }
    }
}

const EJ_T0 = 0.4, EJ_SPREAD = 1.8;
const tgtCache = new Map();

/** The new digit's lensed pixels, as grains with their flights. */
function ejecta(d, k, ox, oy, hx, hy) {
  const key = `${d}${k}${ox},${oy}`;
  let e = tgtCache.get(key);
  if (e) return e;
  const S = resting(d, k, ox, oy), E2 = E0 * E0, rs2 = RS0 * RS0;
  const pts = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - hx, dy = y + 0.5 - hy, d2 = dx * dx + dy * dy;
      if (d2 < rs2) continue;
      const q = 1 - E2 / d2;
      if (sdfAt(S.D, hx + dx * q - S.x, hy + dy * q - S.y) < HW)
        pts.push([x, y, Math.hypot(dx, dy * 1.4) + 9 * hash(x, y, 31)]);
    }
  pts.sort((a, b) => a[2] - b[2]);
  const n = pts.length;
  e = { n, x: new Float32Array(n), y: new Float32Array(n), L: new Float32Array(n), F: new Float32Array(n), J: new Float32Array(n), end: 0 };
  pts.forEach(([x, y], i) => {
    e.x[i] = x + 0.5; e.y[i] = y + 0.5;
    e.L[i] = EJ_T0 + (EJ_SPREAD * i) / n + 0.12 * hash(i, 1, 33);
    e.F[i] = 0.42 + 0.2 * hash(i, 2, 33);
    e.J[i] = 10 + 14 * hash(i, 3, 33);
    e.end = Math.max(e.end, e.L[i] + e.F[i]);
  });
  if (tgtCache.size > 24) tgtCache.clear();
  tgtCache.set(key, e);
  return e;
}

/** Bezier point: up the jet, over, and down onto the pixel. */
function flight(e, i, u, hx, hy) {
  const tx = e.x[i], ty = e.y[i], sg = ty < hy ? -1 : 1;
  const p0x = hx, p0y = hy + sg * (RS0 + 1);
  const p1x = hx, p1y = hy + sg * (RS0 + e.J[i]);
  const p2x = tx + (hx - tx) * 0.15, p2y = ty + sg * 9;
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, dd = u * u * u;
  return [a * p0x + b * p1x + c * p2x + dd * tx, a * p0y + b * p1y + c * p2y + dd * ty];
}

function drawEjecta(g, e, tau, hx, hy) {
  for (let i = 0; i < e.n; i++) {
    const t = tau - e.L[i];
    if (t < 0) continue;
    const u = t / e.F[i];
    if (u >= 1) {
      g.pixel(e.x[i] - 0.5, e.y[i] - 0.5);
      // A spark as it lands.
      if (u < 1 + 0.1 / e.F[i]) { g.pixel(e.x[i] - 0.5, e.y[i] - 1.5); g.pixel(e.x[i] + 0.5, e.y[i] - 0.5); }
      continue;
    }
    for (let j = 0; j < 3; j++) {
      const uj = u - 0.05 * j;
      if (uj < 0) break;
      const w = 1 - (1 - uj) ** 2.4;
      const [px, py] = flight(e, i, w, hx, hy);
      g.pixel(Math.floor(px), Math.floor(py));
    }
  }
}

// ------------------------------------------------------------ the hour's blast

/** The flash and shock front when the hole is gone; returns the front's radius. */
function blast(g, oled, hx, hy, tau) {
  if (tau < 0 || tau > 2.4) return -1;
  if (tau < 0.034) oled.invert(true);
  const R = 3 + 150 * ease.outCubic(prog(tau, 0, 2.2));
  const fl = (1 - prog(tau, 0, 0.45)) ** 2;
  const fade = 1 - prog(tau, 1.2, 2.4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - hx, (y + 0.5 - hy) * 1.25);
      let lv = fl * clamp01(1.1 - d / (6 + 90 * tau));
      const behind = R - d;
      if (behind >= 0 && behind < 2) lv = Math.max(lv, fade);
      else if (behind >= 2 && behind < 14) lv = Math.max(lv, 0.5 * fade * (1 - behind / 14) ** 2);
      if (lv > 0 && free(x, y) && dither(x, y, lv)) g.pixel(x, y);
    }
  return R;
}

// ------------------------------------------------------------ the design

const slotBox = (k, ox, oy) => ({ x: SLOT_X[k] + ox, y: SLOT_Y + oy });

/** A resting digit for the background pass. */
const resting = (d, k, ox, oy, hw = HW) => ({ D: SDF[d], ...slotBox(k, ox, oy), hw });

/**
 * A digit falling in, `u` (0..1) of the way through its infall. Each bit of
 * it drops from rest as in free fall, r = r0 (1 - (s/tff)²)^(2/3), the near
 * side first (tff grows with r0), so the digit is stretched along the
 * infall and squeezed across it: spaghettified. It also winds round, the
 * more the further it has fallen (K). The background pass needs the
 * inverse, from where a pixel is now to where its matter started (r0), so
 * that is tabulated once a frame, every 1/4 px.
 */
function falling(d, k, ox, oy, hx, hy, u, K) {
  const b = slotBox(k, ox, oy);
  const xs = [b.x - MG - hx, b.x + GW + MG - hx], ys = [b.y - MG - hy, b.y + GH + MG - hy];
  const fx = Math.max(Math.abs(xs[0]), Math.abs(xs[1])), fy = Math.max(Math.abs(ys[0]), Math.abs(ys[1]));
  const rmax = Math.hypot(fx, fy) + 1, n = Math.ceil(rmax * 4) + 2;
  const sFall = u ** 1.5;                     // free-fall clock, in units of the slowest bit
  const rr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r0 = i / 4, q = sFall / Math.max(1e-3, (r0 / rmax) ** 1.2);
    rr[i] = q >= 1 ? 0 : r0 * (1 - q * q) ** (2 / 3);
    if (i && rr[i] < rr[i - 1]) rr[i] = rr[i - 1];
  }
  const inv = new Float32Array(n + 1);
  let i = 0;
  for (let j = 0; j <= n; j++) {
    const r = j / 4;
    while (i < n - 1 && rr[i + 1] < r) i++;
    const span = rr[i + 1] - rr[i];
    inv[j] = i + 1 >= n ? rmax + 9 : (i + (span > 1e-6 ? (r - rr[i]) / span : 0)) / 4;
  }
  // How much each shell of matter has been stretched along the infall: where
  // it is stretched it tears into filaments, one per 0.9 px of the digit.
  const duty = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) duty[i] = Math.min(1, 1.25 / Math.max(1e-3, (rr[i + 1] - rr[i]) * 4));
  return { D: SDF[d], ...b, hw: HW, fall: true, inv, duty, rEnd: rr[n - 1], K };
}

export default {
  name: 'Blackhole',
  blurb: 'The time beside a black hole: lensed digits and a streaming disc; a changing digit is swallowed and re-emitted by the jets, and on the hour the hole eats the time, collapses and explodes.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000;
    const late = f.sec >= 50;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const [ox, oy] = orbit(date, 3, 2);
    const hx = CX + ox, hy = CY + oy;
    const A = from.hh + from.mm, B = to.hh + to.mm;
    const s = schedule(tau, hour);

    const slots = [], forming = [];
    for (let k = 0; k < 4; k++) {
      if (hour) {
        if (tau < 0) slots.push(s.V > 0 ? falling(A[k], k, ox, oy, hx, hy, s.V, s.K) : resting(A[k], k, ox, oy));
        else slots.push(resting(B[k], k, ox, oy));
        continue;
      }
      if (A[k] === B[k]) { slots.push(resting(B[k], k, ox, oy)); continue; }
      if (tau < 0) { slots.push(s.V > 0 ? falling(A[k], k, ox, oy, hx, hy, s.V, s.K) : resting(A[k], k, ox, oy)); continue; }
      const e = ejecta(B[k], k, ox, oy, hx, hy);
      if (tau < e.end) { forming.push(e); slots.push(null); continue; }
      // Landed: the digit pops as the last grains arrive.
      slots.push(resting(B[k], k, ox, oy, HW + 0.9 * (1 - smooth(prog(tau, e.end, e.end + 0.35)))));
    }
    const drift = (T * 0.6) % (SC * SCN);
    // On the hour the new time is drawn in by the shock front.
    const R = hour && tau >= 0 && tau < 2.4 ? 3 + 150 * ease.outCubic(prog(tau, 0, 2.2)) : Infinity;
    background(g, hx, hy, s.E, s.rs, slots, drift, R);
    disc(g, hx, hy, s.rs, s.E, T + s.Tb, s.rho, s.m * Math.max(s.rs, 0.01) / RS0);
    photonRing(g, hx, hy, s.rs, T, s.ring);
    if (!hour) {
      jets(g, hx, hy, s.rs, tau);
      for (const e of forming) drawEjecta(g, e, tau, hx, hy);
      if (tau >= -0.1 && tau < 0.6) ripple(g, hx, hy, s.rs, tau + 0.1);
    } else blast(g, oled, hx, hy, tau);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

/** The flare as the digit goes over the edge: a ring of light thrown off the photon ring. */
function ripple(g, hx, hy, rs, t) {
  const R = rs + 1 + 16 * ease.outCubic(t / 0.7), lv = 1 - t / 0.7;
  for (let y = Math.floor(hy - R - 2); y <= hy + R + 2; y++)
    for (let x = Math.floor(hx - R - 2); x <= hx + R + 2; x++) {
      const d = Math.hypot(x + 0.5 - hx, (y + 0.5 - hy) * 1.3);
      if (Math.abs(d - R) < 0.9 && free(x, y) && dither(x, y, lv)) g.pixel(x, y);
    }
}
