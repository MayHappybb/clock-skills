// Warp — the time drifts in deep space; every minute the ship jumps.
//
// A starfield streams out of the vanishing point (3D stars at fixed X, Y,
// their depth wrapped as the ship travels); each star is drawn as a streak
// from where it is to where it was a moment ago, so its length is its speed.
// The time floats among them, an italic racing hand with the horizon
// stripes of an 80s chrome logo, the colon two stars that flare each second.
//
// The minute is a jump. The drive spools up: the ship sags back for a
// second, the stars creep towards the centre and the time shrinks away.
// Then the stars stretch into long radial lines, the old time comes at the
// glass and shatters past it, every pixel of it a star at its own depth,
// and the view whites out from the centre. As the ship brakes the new time
// comes out of the vanishing point as a cloud of stars, gathers into its
// shape with speed lines behind it, digit by digit (the colon and inner
// digits first), and overshoots into place with a pop.
//
// The hour is a longer jump through hyperspace: after the same leap the ship
// enters a tunnel (each pixel a point on a tube's wall at depth k/r: rings
// streaming past at the ship's speed, spiral lanes twisting with depth),
// rides it for four seconds, exits in a flash, and brakes in orbit over a
// planet: a vast dark disc with the sun coming over its limb, a thin lit
// crescent, haze and city lights, under the new time. It sinks slowly and
// is left behind at the next jump.
//
// The ship's travel is one number, S: cruise plus a jump profile (integrated
// once at load) that always covers a whole number of starfield depths, so
// the field is continuous across turns. Old time leaving and new time
// arriving are depths from the same profile, so they are never on screen
// together, and every frame is a pure function of the clock.
//
// Burn-in: the time walks kit.orbit and each jump arrives a pixel or so
// somewhere else; the stars never stop. From 23:00 to 07:00 the panel dims.

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

// ------------------------------------------------------------ letterforms
//
// An italic racing hand, heavy and round-cornered, with the horizon
// stripes of an 80s chrome logo cut through its lower half: the bands
// widen towards the foot, so the digits read as speed even at rest.

const GW = 20, GH = 34, HW = 3.1, SLANT = 0.16;
const X0 = 3.1, X1 = 16.9, Y0 = 3.1, Y1 = 30.9, YM = 16.5;

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
  0: [fillet([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], 7.5, true)],
  1: [fillet([[4.5, 8.5], [11.5, Y0], [11.5, Y1]], 1)],
  2: [fillet([[X0, 10], [X0, Y0], [X1, Y0], [X1, 13], [X0, Y1], [X1, Y1]], [0, 6.5, 6.5, 5, 0.8, 0])],
  3: [fillet([[X0, Y0], [X1, Y0], [8, 14], [X1, 16.5], [X1, Y1], [X0, Y1]], [0, 1.2, 1, 6, 7, 0])],
  4: [fillet([[12.5, Y1], [12.5, Y0], [X0, 22], [X1, 22]], [0, 1, 1, 0])],
  5: [fillet([[X1, Y0], [X0, Y0], [X0, 15], [X1, 15], [X1, Y1], [X0, Y1]], [0, 0.6, 0.6, 7, 7, 0])],
  6: [fillet([[X1 - 1, Y0], [X0, Y0], [X0, Y1], [X1, Y1], [X1, 15], [X0, 15]], [0, 7.5, 7, 7, 6.5, 0])],
  7: [fillet([[X0, Y0], [X1, Y0], [7, Y1]], [0, 1.5, 0])],
  8: [fillet([[X0 + 0.6, Y0], [X1 - 0.6, Y0], [X1 - 0.6, YM], [X0 + 0.6, YM]], 6, true),
    fillet([[X0, YM], [X1, YM], [X1, Y1], [X0, Y1]], 7, true)],
};
SKEL[9] = SKEL[6].map((p) => p.map(([x, y]) => [GW - x, GH - y]));

// Distance fields, 4 samples a pixel, in the upright box; the slant and the
// stripes are applied when sampling, so a digit scales cleanly in depth.
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

/** The horizon stripes: dark bands in the lower half, widening downwards. */
const STRIPES = [[19.2, 20], [22.6, 23.8], [25.8, 27.3], [28.8, 30.6]];
const striped = (gy) => { for (const [a, b] of STRIPES) if (gy >= a && gy < b) return true; return false; };

/** Is glyph point (gx, gy) of digit d lit? (gx before the slant is undone.) */
function inGlyph(d, gx, gy) {
  const ux = gx - SLANT * (GH - gy);
  if (ux <= -MG || gy <= -MG || ux >= GW + MG || gy >= GH + MG) return false;
  return SDF[d][(((gy + MG) * SS) | 0) * SW + (((ux + MG) * SS) | 0)] < HW && !striped(gy);
}

/** Each digit's lit pixels at rest, relative to its box: the stars it is made of. */
const POINTS = {};
for (const d of Object.keys(SKEL)) {
  const p = [];
  for (let y = 0; y < GH + 1; y++)
    for (let x = -1; x < GW + SLANT * GH + 1; x++) if (inGlyph(d, x + 0.5, y + 0.5)) p.push(x, y);
  POINTS[d] = Int16Array.from(p);
}

// ------------------------------------------------------------ the jump
//
// The ship's travel is one number, S, in depth units. It cruises at V0; a
// jump adds D(tau), a velocity profile integrated once at load: a short
// reverse (the drive spools up and the stars sag back), a hard
// acceleration, full speed, then a long deceleration to rest. Every jump
// covers a whole number of starfield depths, so the field is continuous
// across turns, and the stars' depth is just (z0 - S) wrapped.

const Z0 = 0.1, ZL = 3.9, Z1 = Z0 + ZL;     // the starfield's depth range
const V0 = 0.11;                            // cruise, depth units per second
const ZD = 1;                               // where the digits float
const STEP = 1 / 240;

function profile({ pull: [p0, p1, pv], accel: [a0, a1], top: t1, stop: s1, laps }) {
  const v = (t) => {
    if (t < p1) return t < p0 ? 0 : -pv * Math.sin((Math.PI * (t - p0)) / (p1 - p0));
    if (t < a0) return 0;
    if (t < a1) return ((t - a0) / (a1 - a0)) ** 2.5;
    if (t < t1) return 1;
    if (t < s1) return (1 - (t - t1) / (s1 - t1)) ** 3;
    return 0;
  };
  const n = Math.ceil((s1 - p0) / STEP) + 1;
  // Integrate the reverse and the forward run separately, then scale the
  // run so the whole jump is exactly `laps` depths.
  let back = 0, fwd = 0;
  for (let i = 0; i < n; i++) { const t = p0 + i * STEP, x = v(t) * STEP; if (t < p1) back += x; else fwd += x; }
  const vmax = (laps * ZL - back) / fwd;
  const D = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) { const t = p0 + i * STEP; D[i] = s; s += (t < p1 ? v(t) : vmax * v(t)) * STEP; }
  return { t0: p0, t1: s1, n, D, total: laps * ZL, vmax, accel: a0, top: t1 };
}

const MINUTE = profile({ pull: [-3.2, -1.9, 0.3], accel: [-1.9, -0.45], top: 0.35, stop: 2.7, laps: 3 });
const HOUR = profile({ pull: [-4.3, -3, 0.35], accel: [-3, -1.5], top: 3.6, stop: 6.6, laps: 9 });

/** The jump's distance so far at tau. */
function jumpAt(P, tau) {
  if (tau <= P.t0) return 0;
  if (tau >= P.t1) return P.total;
  const j = (tau - P.t0) / STEP, i = Math.floor(j);
  return i + 1 < P.n ? P.D[i] + (P.D[i + 1] - P.D[i]) * (j - i) : P.total;
}

// ------------------------------------------------------------ drawing

const MASK = new Uint8Array(W * H), DIL = new Uint8Array(W * H), PLANET = new Uint8Array(W * H);
/** A pixel the stars and effects may light: not on or right next to a digit. */
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !DIL[y * W + x];

/** A line in canvas coordinates that keeps off the digits and the planet. */
function streak(g, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(x0 + ((x1 - x0) * k) / n), y = Math.floor(y0 + ((y1 - y0) * k) / n);
    if (free(x, y) && !PLANET[y * W + x]) g.pixel(x, y);
  }
}

// The starfield: stars at fixed (X, Y), streaming in depth. A star's streak
// is where it was 1/20 s ago, so its length is its speed.
const NS = 130, F = 64;
const STARS = [];
for (let i = 0; STARS.length < NS; i++) {
  const X = (hash(i, 1, 3) - 0.5) * 3.2, Y = (hash(i, 2, 3) - 0.5) * 1.7;
  if (Math.abs(X) < 0.2 && Math.abs(Y) < 0.14) continue;   // none dead ahead: the colon lives there
  STARS.push({ X, Y, z: hash(i, 3, 3) * ZL });
}

function stars(g, cx, cy, S, dS, keep = 1) {
  for (let i = 0; i < NS; i++) {
    const s = STARS[i];
    if (hash(i, 5, 3) > keep) continue;
    const z = Z0 + ((((s.z - S) % ZL) + ZL) % ZL);
    if (z > 3.3) continue;                                    // too far to see
    const hx = cx + (F * s.X) / z, hy = cy + (F * s.Y) / z;
    if (hx < -40 || hx > W + 40 || hy < -40 || hy > H + 40) continue;
    const zt = Math.min(Z1, Math.max(Z0 * 0.5, z + dS));
    const tx = cx + (F * s.X) / zt, ty = cy + (F * s.Y) / zt;
    streak(g, hx, hy, tx, ty);
    // Near stars are bigger.
    if (z < 0.55) streak(g, hx + 1, hy, tx + 1, ty);
  }
}

/** Stamp digit d at slot origin (ox, oy), scaled by s about (cx, cy), into MASK. */
function stampDigit(d, ox, oy, cx, cy, s) {
  const bw = GW + SLANT * GH;
  const x0 = Math.floor(cx + (ox - 1 - cx) * s), x1 = Math.ceil(cx + (ox + bw + 1 - cx) * s);
  const y0 = Math.floor(cy + (oy - 1 - cy) * s), y1 = Math.ceil(cy + (oy + GH + 1 - cy) * s);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++)
      if (inGlyph(d, cx + (x + 0.5 - cx) / s - ox, cy + (y + 0.5 - cy) / s - oy)) MASK[y * W + x] = 1;
}

/** A slot (its points P) as its stars, each at its own depth z = zOf(spread), streaked by dz. */
function flyDigit(g, P, ox, oy, cx, cy, zOf, dz, seed, shown = 1) {
  for (let i = 0; i < P.length; i += 2) {
    const h = hash(i, seed, 7);
    if (h > shown) continue;
    const z = zOf(0.7 * hash(i, seed, 8));
    if (z <= 0.02) continue;
    // Each star of the digit is a little off its pixel, which shows as it nears.
    const rx = ox + P[i] + 0.5 - cx + (hash(i, seed, 9) - 0.5) * 0.9, ry = oy + P[i + 1] + 0.5 - cy + (hash(i, seed, 10) - 0.5) * 0.9;
    const zt = Math.max(0.02, z + dz);
    const hx = cx + (rx * ZD) / z, hy = cy + (ry * ZD) / z;
    if (hx < -2 || hx > W + 2 || hy < -2 || hy > H + 2) continue;
    const tx = cx + (rx * ZD) / zt, ty = cy + (ry * ZD) / zt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(tx - hx), Math.abs(ty - hy))));
    for (let k = 0; k <= n; k++) g.pixel(Math.floor(hx + ((tx - hx) * k) / n), Math.floor(hy + ((ty - hy) * k) / n));
  }
}

// ------------------------------------------------------------ hyperspace

/**
 * The tunnel, on the hour: every pixel is a point on the wall of a tube
 * round the line of flight, depth w = k / r. Rings of light stream out of
 * the vanishing point at the ship's speed, and lanes spiral along the wall,
 * twisting with depth and turning as the tube rolls.
 */
function tunnel(g, cx, cy, env, S, roll) {
  if (env <= 0) return;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!free(x, y)) continue;
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.8, r = Math.hypot(dx, dy);
      if (r < 3) continue;
      const w = 30 / r;                                  // depth along the tube
      const fog = clamp01(1.3 - w * 0.13) * env;          // far is dark
      const a = Math.atan2(dy, dx) / TAU;
      // Rings streaming out at the ship's speed: a sharp front, a short glow behind.
      const v = (w * 0.9 + S * 1.6) % 1;
      // (the front is thinned near the glass, where depth runs fast, so a ring stays a line)
      const th = 0.012 + 0.06 * clamp01(w / 3);
      const ring = v < th ? 1 : v < th + 0.13 ? 0.28 * (1 - (v - th) / 0.13) * clamp01(w / 2) : 0;
      // Lanes of light spiralling along the wall, twisting with depth.
      const l = (((a * 6 + w * 0.32 + roll) % 1) + 1) % 1, lane = l < 0.06 ? 0.6 : 0;
      // Between them, faint streaming dust.
      const dust = hash(Math.floor(a * 90), Math.floor(w * 3 + S * 5), 5) < 0.07 ? 0.6 : 0;
      const lv = fog * Math.max(ring, lane * (0.4 + 0.6 * clamp01(1 - w * 0.1)), dust);
      if (lv > 0.03 && dither(x, y, lv)) g.pixel(x, y);
    }
}

/** A burst of light at the vanishing point: the flash as space folds. */
function flash(g, cx, cy, t, size) {
  if (t < 0 || t > 1) return;
  const R = 4 + size * ease.outCubic(t), fade = (1 - t) ** 1.5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.5, r = Math.hypot(dx, dy);
      if (r > R + 2) continue;
      const rays = 0.6 + 0.4 * Math.cos(Math.atan2(dy, dx) * 9 + t * 4);
      const lv = fade * (clamp01(1.2 - r / R) * rays + (Math.abs(r - R) < 1.2 ? 0.8 : 0));
      if (lv > 0 && free(x, y) && dither(x, y, lv)) g.pixel(x, y);
    }
}

/** The white-out at the top of the minute's jump: a soft burst from the vanishing point. */
function bloom(g, cx, cy, t) {
  if (t < 0 || t > 1) return;
  const R = 6 + 70 * ease.outCubic(t), fade = (1 - t) ** 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.6);
      const lv = fade * clamp01(1.15 - r / R) ** 1.5;
      if (lv > 0 && free(x, y) && dither(x, y, lv)) g.pixel(x, y);
    }
}

/**
 * The planet the hour jump arrives at, seen from orbit with the sun behind
 * it: a vast dark disc whose limb is a thin lit crescent with a haze of
 * atmosphere above it, and a scatter of city lights on the night side. It
 * comes out of the vanishing point as the ship brakes, settles as a horizon
 * under the time, and slowly sinks away. Its texture moves with it.
 */
function planet(g, px, py, R) {
  if (R < 0.5) return;
  const L = [0.14, -0.42, -0.9], ll = Math.hypot(...L), HAZE = 3.2;
  const x0 = Math.max(0, Math.floor(px - R - HAZE)), x1 = Math.min(W, Math.ceil(px + R + HAZE));
  const y0 = Math.max(0, Math.floor(py - R - HAZE)), y1 = Math.min(H, Math.ceil(py + R + HAZE));
  const ox = Math.round(px), oy = Math.round(py);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - px, dy = y + 0.5 - py, r = Math.hypot(dx, dy);
      let lv = 0;
      if (r <= R) {
        PLANET[y * W + x] = 1;
        const nx = dx / R, ny = dy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = (nx * L[0] + ny * L[1] + nz * L[2]) / ll;
        lv = clamp01(lam * 2.6);
        if (R - r < 1 && lam > -0.1) lv = 1;                                       // the sunlit limb
        if (lv < 0.05 && hash(x - ox, y - oy, 21) < 0.012 * clamp01(nz * 3)) lv = 1;   // city lights
      } else {
        // The atmosphere, brightest where the sun comes over the limb.
        const up = clamp01((dx * L[0] + dy * L[1]) / (r * 0.75) + 0.25);
        lv = r - R < HAZE ? 0.75 * up * (1 - (r - R) / HAZE) ** 2 : 0;
      }
      if (lv > 0 && free(x, y) && dither(x - ox, y - oy, lv)) g.pixel(x, y);
    }
}

// ------------------------------------------------------------ layout

const SLOT_X = [3, 29, 73.5, 99.5], SLOT_Y = 15;
const COLON = [[66.5, 24.5], [63.5, 40.5]];
const PLANET_AT = [44, 158], PLANET_R = 112, PLANET_Z = 1.6;

/** Where minute `key` puts the time: each jump arrives somewhere a little different. */
function placeFor(key, ox, oy) {
  return [ox + Math.floor(hash(key, 1, 9) * 3) - 1, oy + Math.floor(hash(key, 2, 9) * 3) - 1];
}

/** The colon: two stars, plus-shaped, as pixels relative to the time's origin. */
const COLON_PTS = Int16Array.from(COLON.flatMap(([x, y]) =>
  [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([i, j]) => [Math.floor(x) + i, Math.floor(y) + j])));
/** Arrival order: the colon, then the inner digits, the outer ones last. */
const LAG = [0.17, 0.06, 0.09, 0.22, 0];

/** Slot k's origin for minute `key` (k = 4 is the colon). */
function originOf(k, key, ox, oy) {
  const [px, py] = placeFor(key, ox, oy);
  return k < 4 ? [SLOT_X[k] + px, SLOT_Y + py] : [px, py];
}
const pointsOf = (k, d) => (k < 4 ? POINTS[d] : COLON_PTS);

/** Slot k at scale s about the vanishing point (s = ZD / z), into MASK. */
function stampSlot(k, d, key, ox, oy, cx, cy, s, sec) {
  const [x0, y0] = originOf(k, key, ox, oy);
  if (k < 4) { stampDigit(d, x0, y0, cx, cy, s); return; }
  // The colon's stars flare their rays for a moment each second.
  const flare = (sec % 1) < 0.18 && Math.abs(s - 1) < 0.01;
  for (const [cx0, cy0] of COLON) {
    const x = cx + (cx0 + x0 - cx) * s, y = cy + (cy0 + y0 - cy) * s;
    for (let j = -2; j <= 2; j++)
      for (let i = -2; i <= 2; i++) {
        const m = Math.abs(i) + Math.abs(j);
        const on = m <= 1 || (flare && m === 2 && (i === 0 || j === 0));
        const xx = Math.floor(x) + i, yy = Math.floor(y) + j;
        if (on && xx >= 0 && yy >= 0 && xx < W && yy < H) MASK[yy * W + xx] = 1;
      }
  }
}

/** Speed lines behind a slot that is braking in: some of its stars, from scale s back to st. */
function trails(g, k, d, key, ox, oy, cx, cy, s, st) {
  const [x0, y0] = originOf(k, key, ox, oy), P = pointsOf(k, d);
  for (let i = 0; i < P.length; i += 2) {
    if (hash(i, k, 4) > 0.2) continue;
    const rx = x0 + P[i] + 0.5 - cx, ry = y0 + P[i + 1] + 0.5 - cy;
    g.line(Math.floor(cx + rx * s), Math.floor(cy + ry * s), Math.floor(cx + rx * st), Math.floor(cy + ry * st));
  }
}

function dilate() {
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

// ------------------------------------------------------------ the design

export default {
  name: 'Warp',
  blurb: 'The time adrift among streaming stars; every minute the ship jumps to lightspeed and the new time flies in from the vanishing point; the hour goes through a hyperspace tunnel to a planet.',
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
    const P = hour ? HOUR : MINUTE;
    const [ox, oy] = orbit(date, 2, 3);
    const cx = 64 + ox, cy = 32 + oy;
    const A = from.hh + from.mm, B = to.hh + to.mm;

    const Dj = jumpAt(P, tau), dD = Dj - jumpAt(P, tau - 0.05);
    const S = ((V0 * T) % ZL) + Dj, dS = V0 * 0.05 + (Dj - jumpAt(P, tau - 0.14));
    const show = hour ? P.top : 0;      // the new time appears only once the old has gone

    MASK.fill(0);
    const fly = [], lines = [];
    for (let k = 0; k < 5; k++) {
      const a = A[k] ?? ":", b = B[k] ?? ":";
      if (tau < P.t0) { stampSlot(k, a, from.minuteKey, ox, oy, cx, cy, 1, f.sec); continue; }
      if (tau < show) {
        // Leaving: the time sags back as the drive spools up, then rushes past.
        if (Dj < 0.06) stampSlot(k, a, from.minuteKey, ox, oy, cx, cy, ZD / (ZD - Dj), f.sec);
        else fly.push([k, a, from.minuteKey, (sp) => ZD - Dj * (1 + sp), dD * 1.35, 1]);
        continue;
      }
      // Arriving: out of the vanishing point, braking into place, a small overshoot.
      const tk = tau - LAG[k], Dk = jumpAt(P, tk), R = P.total - Dk;
      const pop = 0.08 * Math.sin(Math.PI * prog(tk, P.t1 - 0.5, P.t1 + 0.3));
      if (R < 1.4) {
        const sc = ZD / (ZD + R - pop);
        stampSlot(k, b, to.minuteKey, ox, oy, cx, cy, sc, f.sec);
        if (R > 0.004) lines.push([k, b, to.minuteKey, sc, ZD / (ZD + R + 1.6 * (Dk - jumpAt(P, tk - 0.08)))]);
      } else fly.push([k, b, to.minuteKey, (sp) => ZD + R * (1 + 0.5 * sp), (Dk - jumpAt(P, tk - 0.06)) * 1.2, prog(tau, show, show + 0.4)]);
    }
    dilate();

    if (hour) tunnel(g, cx, cy, smooth(prog(tau, -1.9, -0.9)) * (1 - smooth(prog(tau, P.top - 0.4, P.top + 0.25))), S, tau * 0.3);
    // The planet the hour arrives at, until the next jump carries the ship on.
    PLANET.fill(0);
    let pz = 0, age = 0;
    if (hour && tau > P.top - 0.3) { pz = PLANET_Z / (PLANET_Z + P.total - Dj); age = Math.max(0, tau - P.t1); }
    else if (!hour && from.m === 0 && late && PLANET_Z - Dj > 0.04) { pz = PLANET_Z / (PLANET_Z - Dj); age = 60 + tau - HOUR.t1; }
    if (pz > 0) planet(g, cx + (PLANET_AT[0] + 0.12 * age - cx) * pz, cy + (PLANET_AT[1] + 0.2 * age - cy) * pz, PLANET_R * pz);
    stars(g, cx, cy, S, dS, hour ? 1 - 0.75 * smooth(prog(tau, -1.6, -0.8)) * (1 - smooth(prog(tau, P.top - 0.6, P.top))) : 1);
    for (const [k, d, key, zOf, dz, shown] of fly) {
      const [x0, y0] = originOf(k, key, ox, oy);
      flyDigit(g, pointsOf(k, d), x0, y0, cx, cy, zOf, dz, k * 31 + 5, shown);
    }
    for (const [k, d, key, sc, st] of lines) trails(g, k, d, key, ox, oy, cx, cy, sc, st);
    if (hour) { flash(g, cx, cy, (tau + 1.8) / 0.9, 70); flash(g, cx, cy, (tau - P.top + 0.3) / 1.1, 110); }
    else bloom(g, cx, cy, (tau + 0.35) / 0.6);
    for (let i = 0; i < W * H; i++) if (MASK[i]) g.buf[i] = 1;
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
