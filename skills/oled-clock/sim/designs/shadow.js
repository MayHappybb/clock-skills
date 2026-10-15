// Shadow — a shadow sculpture that tells the time.
//
// After Shigeo Fukuda, Tim Noble & Sue Webster, Larry Kagan: a stage
// spotlight (left) shines through four clear glass globes, each holding a
// tangle of bent wire, hanging on threads (middle), and on the shuttered,
// lit wall panel (right) their shadows read the time, hours over minutes.
// The tangles themselves are nonsense from where we stand; mid-whirl, side
// on, each briefly shows its secret face. Dotted beam edges run from the
// barn doors to the shutter.
//
// It is real projection, not a picture of one. Each digit is a set of
// wires drawn in its shadow (a slanted skeleton with a stroke width that
// follows its direction; wires run along the strokes and drift across them,
// a few hairs stick out). Every point of every wire is then lifted off the
// wall back along its ray to the lamp, to a depth inside that digit's ball,
// and the depth weaves along the wire so it loops round the ball. Each
// frame the wires are rotated, swayed and dropped in 3D, projected through
// the camera (straight at the wall, so the wall maps 1:1 onto the glass) to
// draw the sculpture, and projected from the lamp onto the wall to draw the
// shadow: dark lines whose width is the wire's magnification there. Wires
// raked out long across the wall thin to fine lines; swung near the lamp
// they lose their core.
//
// Idle: every wire point keeps sliding along its own ray (the weave phase
// drifts with time), so the tangles writhe all the time while the shadow
// does not change at all; the balls also twist and sway a little on their
// threads, so the shadow digits drift and breathe. Dust drifts in the beam.
// The colon is two glass beads near the lamp on long threads, swinging a
// seconds beat; their shadows are two big dots.
//
// The minute: the changing ball lifts on its thread, whirls one full turn
// and clicks home with a shiver (a cubic Hermite that arrives still moving,
// then a damped sine that takes its velocity, so angle and angular velocity
// are continuous). Spun hard it tips a little. Its shadow rakes out across
// the wall in streaks and snaps back as the new digit. The wires re-bend
// from the old digit to the new between a quarter and three quarters of the
// turn, the ball is half way round at :00, and before a quarter turn and
// after three quarters the shadow is scribble, so no wrong time can show.
//
// The hour: the threads are let out. All four balls twitch and drop out of
// the beam, the wall stands empty but for the colon, and they are hauled
// back up, bouncing on their threads and spinning two turns, into the new
// hour. Old digits leave before :00; new ones are built off screen after it.
//
// Pure: everything is derived from the clock (turn time tau, from the
// nearest minute boundary; the minute's "from" and "to" digits).
// Burn-in: kit.orbit for the scene, a second orbit for the lamp, the
// panel's dither phase walks a step every three minutes, the lens glare is
// a turning dither; 23:00-07:00 the panel dims (ctx.night).

import { clamp, progress, previousMinute, clockFields, orbit, smoothNoise, dither } from '../js/kit.js';

const TAU = Math.PI * 2;
const smooth = (u) => u * u * (3 - 2 * u);

// ------------------------------------------------------------ a seeded RNG
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ letterforms
// Each digit is a skeleton in a 12 x 22 box (y down) with a width that
// follows the stroke's direction (verticals fat, horizontals lean), the
// contrast of a cut-paper silhouette. The set leans, as a shadow thrown
// from low on the left does.

const SLANT = 0.13;
const wOf = (tx, ty) => 3.5 + 1.7 * Math.abs(ty) / (Math.hypot(tx, ty) || 1);

function arc(cx, cy, rx, ry, a0, a1) {
  const n = 200, out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
function seg(x0, y0, x1, y1) {
  const n = 100, out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  return out;
}
function bez(x0, y0, cx, cy, x1, y1) {
  const n = 100, out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([v * v * x0 + 2 * u * v * cx + u * u * x1, v * v * y0 + 2 * u * v * cy + u * u * y1]);
  }
  return out;
}
const SKELETONS = [
  /* 0 */ [arc(6, 11, 5, 10.2, 0, TAU)],
  /* 1 */ [seg(3.6, 4.2, 7.2, 0.6), seg(7.2, 0.6, 7.2, 21.4), seg(2.8, 21.6, 11.6, 21.6)],
  /* 2 */ [arc(6, 6, 5.2, 5.4, Math.PI + 0.25, TAU + 0.62), seg(6 + 5.2 * Math.cos(0.62), 6 + 5.4 * Math.sin(0.62), 0.6, 21.6), seg(0.6, 21.6, 12, 21.6)],
  /* 3 */ [arc(6, 5.4, 4.8, 4.9, Math.PI + 0.65, TAU + Math.PI / 2), arc(6, 16.2, 5.6, 5.7, -Math.PI / 2, Math.PI - 0.45)],
  /* 4 */ [seg(8.8, 0.3, 0.2, 14.4), seg(0.2, 14.4, 12.2, 14.4), seg(8.8, 5, 8.8, 22)],
  /* 5 */ [seg(11.6, 0.6, 2.4, 0.6), seg(2.4, 0.6, 1.6, 10.6), arc(6.2, 15.6, 5.5, 6, Math.PI * 1.22, Math.PI * 2.86)],
  /* 6 */ [bez(11, 0.8, 1.2, 2.4, 0.4, 15.4), arc(6, 15.6, 5.7, 6.2, 0, TAU)],
  /* 7 */ [seg(0.4, 0.6, 12, 0.6), bez(12, 0.6, 6.4, 9, 4.4, 22)],
  /* 8 */ [arc(6.1, 5.2, 4.8, 4.8, 0, TAU), arc(6, 15.9, 5.9, 5.9, 0, TAU)],
  /* 9 */ [arc(6, 6.4, 5.7, 6.2, 0, TAU), bez(11.7, 7, 11.6, 17, 1.2, 21.6)],
];

/** A digit's strokes, slanted and resampled every half pixel: per path, points [x, y, w, tx, ty]. */
function strokes(d) {
  return SKELETONS[d].map((raw) => {
    const p = raw.map(([x, y]) => [x + (22 - y) * SLANT, y]);
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = cum[cum.length - 1], out = [];
    let j = 0;
    for (let a = 0; a <= L; a += 0.5) {
      while (j < p.length - 2 && cum[j + 1] < a) j++;
      const u = (a - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const tx = p[j + 1][0] - p[j][0], ty = p[j + 1][1] - p[j][1], tl = Math.hypot(tx, ty) || 1;
      out.push([p[j][0] + tx * u, p[j][1] + ty * u, wOf(tx, ty), tx / tl, ty / tl]);
    }
    out.closed = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.3;
    return out;
  });
}

/** How far inside a digit's ink (x, y) is: w/2 minus the distance to the nearest stroke sample. */
function inside(paths, x, y) {
  let best = -1e9;
  for (const P of paths) for (const [sx, sy, w] of P) { const v = w / 2 - Math.hypot(x - sx, y - sy); if (v > best) best = v; }
  return best;
}

export const PIECES = 4, LANES = 2, N_MAIN = PIECES * LANES, N_HAIR = 3, N_WIRES = N_MAIN + N_HAIR, K = 14;

/**
 * A digit as bent wires, in its shadow: N_WIRES polylines of K points in
 * glyph coordinates. The strokes are cut into PIECES stretches (shared out
 * between a digit's paths by length), and each stretch is laid with LANES
 * wires side by side across the stroke, wobbling a little, so their
 * shadows close into a solid stroke with a ragged edge and the odd seam of
 * light. A few hairs stick out of the outside edge. Wires are numbered in
 * stroke order, so wire i of one digit pairs with wire i of the next.
 */
export function digitWires(d, seed) {
  const paths = strokes(d);
  const lens = paths.map((P) => (P.length - 1) * 0.5), T = lens.reduce((a, b) => a + b, 0);
  const r = rng(seed * 977 + d * 131 + 7);
  // share the pieces out: at least one per path, the rest to the longest per piece
  const n = paths.map(() => 1);
  for (let extra = PIECES - paths.length; extra > 0; extra--) {
    let bi = 0;
    for (let i = 1; i < paths.length; i++) if (lens[i] / n[i] > lens[bi] / n[bi]) bi = i;
    n[bi]++;
  }
  const wires = [];
  paths.forEach((P, pi) => {
    const PL = lens[pi];
    for (let q = 0; q < n[pi]; q++) {
      const a0 = (PL * q) / n[pi] - (P.closed || q > 0 ? 1.2 : 0), a1 = (PL * (q + 1)) / n[pi] + (P.closed || q < n[pi] - 1 ? 1.2 : 0);
      for (let lane = 0; lane < LANES; lane++) {
        const side = lane === 0 ? -1 : 1, ph = r() * TAU, wob = 0.25 + r() * 0.3;
        const pts = [];
        for (let j = 0; j < K; j++) {
          let a = a0 + ((a1 - a0) * j) / (K - 1);
          a = P.closed ? ((a % PL) + PL) % PL : clamp(a, 0, PL);
          const [x, y, w, tx, ty] = P[clamp(Math.round(a / 0.5), 0, P.length - 1)];
          const o = side * Math.max(0.2, w / 2 - 1.45) + wob * Math.sin(ph + j * 0.9);
          pts.push([x - ty * o, y + tx * o]);
        }
        wires.push(pts);
      }
    }
  });
  let guard = 0;
  while (wires.length < N_WIRES && guard++ < 4000) {
    const P = paths[Math.floor(r() * paths.length)];
    const [x, y, w, tx, ty] = P[Math.floor((0.15 + 0.7 * r()) * P.length)];
    const side = r() < 0.5 ? -1 : 1, nx = -ty * side, ny = tx * side;
    if (nx * (x - 6 - 11 * SLANT) + ny * (y - 11) < 0) continue;   // outwards, never into a counter
    const ax = x + nx * (w / 2 - 1), ay = y + ny * (w / 2 - 1);
    const ang = Math.atan2(ny, nx) + (r() - 0.5) * 1.2, len = 1.8 + r() * 1.4;
    const bx = ax + Math.cos(ang) * len, by = ay + Math.sin(ang) * len;
    if (inside(paths, bx, by) > -0.6) continue;          // it must stick out
    wires.push(Array.from({ length: K }, (_, j) => [ax + ((bx - ax) * j) / (K - 1), ay + ((by - ay) * j) / (K - 1)]));
  }
  return wires;
}

// ------------------------------------------------------------ the room
// World coordinates in wall pixels: x right, y down, z out of the wall
// towards the viewer; the wall is z = 0. The camera looks straight at the
// wall, so the wall maps 1:1 onto the glass and the shadow is undistorted;
// anything in front of it is magnified by perspective.

const CZ = 170;
const proj = (x, y, z) => { const k = CZ / (CZ - z); return [64 + (x - 64) * k, 32 + (y - 32) * k]; };

const LAMP = [36, 30, 70];                 // a spotlight at the left, raking the wall

/** The point of the beam through wall point (ax, ay) at fraction s of the way from the lamp. */
const lift = (ax, ay, s) => [LAMP[0] + (ax - LAMP[0]) * s, LAMP[1] + (ay - LAMP[1]) * s, LAMP[2] * (1 - s)];

/** Where the ray from the lamp through a world point meets the wall, and how much it is magnified. */
function cast(x, y, z) {
  const k = LAMP[2] / (LAMP[2] - z);
  return [LAMP[0] + (x - LAMP[0]) * k, LAMP[1] + (y - LAMP[1]) * k, k];
}

// The spot is a profile spot with its shutters closed down to frame the
// shadow: a lit panel from PANEL_X to the right edge, a soft shutter edge,
// a little brighter towards its centre.
const PANEL_X = 82;
function panel(x, y) {
  const e = progress(x, PANEL_X - 1.5, PANEL_X + 3);
  if (e <= 0) return 0;
  const hot = 1 - Math.hypot((x - 106) / 40, (y - 32) / 50);
  return e * (0.47 + 0.15 * clamp(hot, 0, 1));
}

// The time on the wall: hours over minutes, a sideways colon between.
const SC = 1.05;
const SLOT_X = [87.5, 107, 87.5, 107], SLOT_Y = [2.6, 2.6, 38.3, 38.3];
const COLON = [[101, 32.2], [115, 32.2]];

// ------------------------------------------------------------ the sculpture
// Four balls of bent wire, one per digit, each on its own thread. Every
// point of every wire is a point of its digit's shadow lifted back along
// the beam to some depth inside the ball: sliding a point along its ray
// moves it in space but not in shadow. So from the lamp each ball is its
// digit, and from anywhere else a bird's nest. Each wire's depth weaves
// in and out along its length, so it loops round the ball.

const S_SLOT = [0.26, 0.34, 0.34, 0.42];   // how far from the lamp each ball hangs
const BALL = SLOT_X.map((x, k) => {
  const s = S_SLOT[k];
  return { s, c: lift(x + (6 + 11 * SLANT) * SC, SLOT_Y[k] + 11 * SC, s), r: 14 * s, dia: 2.9 * s };
});
const WEAVE = BALL.map((_, k) => {
  const r = rng(4242 + k * 17);
  return Array.from({ length: N_WIRES }, () => [r() * TAU, (0.16 + r() * 0.16) * (r() < 0.5 ? -1 : 1), 0.8 + r() * 0.2, (0.3 + r() * 0.4) * (r() < 0.5 ? -1 : 1)]);
});

const WIRE_CACHE = new Map();
/** Wires of digit d for slot k, as wall points. */
function slotWires(k, d) {
  const key = k * 10 + d;
  let w = WIRE_CACHE.get(key);
  if (!w) {
    w = digitWires(d, k + 1).map((pts) => pts.map(([x, y]) => [SLOT_X[k] + x * SC, SLOT_Y[k] + y * SC]));
    WIRE_CACHE.set(key, w);
  }
  return w;
}

// Build every digit for every slot now, so no frame pays for it.
for (let k = 0; k < 4; k++) for (let d = 0; d < 10; d++) slotWires(k, d);

/** The fraction along the ray to wall point (ax, ay) at the middle of ball k, and half the depth of ball there. */
function through(k, ax, ay) {
  const { c, r, s } = BALL[k];
  const dx = ax - LAMP[0], dy = ay - LAMP[1], dz = -LAMP[2];
  const ox = LAMP[0] - c[0], oy = LAMP[1] - c[1], oz = LAMP[2] - c[2];
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (dx * ox + dy * oy + dz * oz), C = ox * ox + oy * oy + oz * oz - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return [s, 0];
  return [-B / (2 * A), Math.sqrt(disc) / (2 * A)];
}

// Motes of dust drifting through the beam: wall point, depth, phase.
const DUST = (() => { const r = rng(99); return Array.from({ length: 70 }, () => [PANEL_X + r() * 46, r() * 64, 0.08 + r() * 0.8, r()]); })();

// ------------------------------------------------------------ the twist
// A ball on a thread is a torsion pendulum. At the minute it whirls a full
// turn and clicks home with a small shiver: a cubic Hermite that arrives
// still moving, then a damped sine that takes that last velocity, so angle
// and angular velocity are continuous. (The anticipation is a lift on the
// thread, in pose(): any twist before :00 would warp the old digit.)

function spring(omega, zeta) {
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return (t) => (t <= 0 ? 0 : 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t)));
}
const hermite = (u, p0, p1, m0, m1, h) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
};
const SHIVER_W = 22, SHIVER_L = 7;
/** From angle a0 at rest at t0 to a1 at t1, arriving at speed v1, then shivering to rest. */
function arrive(t, t0, t1, a0, a1, v1) {
  if (t <= t0) return a0;
  if (t < t1) return hermite((t - t0) / (t1 - t0), a0, a1, 0, v1, t1 - t0);
  const e = t - t1;
  return a1 + (v1 / SHIVER_W) * Math.exp(-SHIVER_L * e) * Math.sin(SHIVER_W * e);
}
const T_GO = -0.75, T_HOME = 0.85, V_HOME = 1.5;
const turnAngle = (tau) => arrive(tau, T_GO, T_HOME, 0, TAU, V_HOME);
// The wires re-bend between a quarter and three quarters of the turn,
// while the shadow is nothing but scribble.
const tauAt = (f, a) => { let lo = T_GO, hi = T_HOME; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m) > a) hi = m; else lo = m; } return (lo + hi) / 2; };
const TAU_A = tauAt(turnAngle, TAU * 0.25), TAU_B = tauAt(turnAngle, TAU * 0.75);

// The hour: the threads let go. Everything drops out of the beam, the wall
// stands empty for a moment, and the balls are hauled back up on their
// threads, spinning, bouncing, and settle into the new hour.
const T_DROP = -0.95, G = 170;
const T_HAUL = 0.35, HAUL = 62;
const haul = spring(TAU * 0.75, 0.42);
const T_SPUN = T_HAUL + 1.7;

const nextMinute = (date) => clockFields(new Date(date.getTime() + 60000));

/** Slot k's pose at turn time tau: [angle, drop, morph]. */
function pose(k, tau, changing, hourTurn, ta) {
  let th = 0.015 * Math.sin((TAU * ta) / (5.3 + k * 0.9) + k * 2.1), dy = 0, u = 0, tilt = 0;
  if (hourTurn) {
    if (tau < 0) {
      // A twitch as the thread goes slack, then free fall, tumbling.
      dy = -0.8 * Math.sin(Math.PI * progress(tau, T_DROP - 0.35, T_DROP));
      if (tau > T_DROP) { const t = tau - T_DROP; dy = 0.5 * G * t * t; th += (1.5 + k * 0.4) * t * t * (k % 2 ? 1 : -1); }
    } else {
      u = 1;
      const t = tau - T_HAUL;
      dy = t <= 0 ? 999 : HAUL * (1 - haul(t));
      const spin = arrive(tau, T_HAUL, T_SPUN, 2 * TAU, 0, -V_HOME);
      th += (k % 2 ? 1 : -1) * spin;
      tilt = 0.35 * Math.sin(clamp(spin, 0, 2 * TAU) / 2) ** 2;
    }
  } else if (changing) {
    const a = turnAngle(tau);
    th += a;
    // the thread takes up: the ball lifts a little before it whirls, and drops back after
    dy = -1.1 * Math.sin(Math.PI * progress(tau, -1.4, T_GO + 0.2)) ** 2 + 0.8 * Math.sin(Math.PI * progress(tau, T_HOME - 0.1, T_HOME + 0.9)) ** 2 * Math.exp(-2 * Math.max(0, tau - T_HOME));
    // spun hard, the ball swings out on its thread and tips over a little
    tilt = 0.35 * Math.sin(clamp(a, 0, TAU) / 2) ** 2;
    u = smooth(progress(tau, TAU_A, TAU_B));
  }
  return [th, dy, u, tilt];
}

/** A shadow line: clears every pixel whose centre is within width/2 of the segment. */
function darkLine(g, x0, y0, x1, y1, width) {
  const r = width / 2, r2 = r * r, buf = g.buf, W = g.width, H = g.height;
  const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - r)), bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + r));
  const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - r)), by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + r));
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
  for (let y = by0; y <= by1; y++) {
    const py = y + 0.5 - y0;
    for (let x = bx0; x <= bx1; x++) {
      const px = x + 0.5 - x0;
      let u = (px * dx + py * dy) / L2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - u * dx, ey = py - u * dy;
      if (ex * ex + ey * ey <= r2) buf[y * W + x] = 0;
    }
  }
}

/** A Bresenham line; mode 0 clears, 1 lights, 3 lights a checker, 4 every third pixel (a wire further back). */
function wline(g, x0, y0, x1, y1, mode) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400; n++) {
    if (mode < 3 || (mode === 3 && ((x0 + y0) & 1) === 0) || (mode === 4 && n % 3 === 0)) g.pixel(x0, y0, mode === 0 ? 0 : 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** The spotlight, side on: a can with barn doors, on a stand, its lens blazing. */
function drawLamp(g, ox, oy, phase) {
  const [lx, ly] = proj(...LAMP);
  const x = Math.round(lx + ox), y = Math.round(ly + oy);
  g.fillRect(x - 12, y - 4, 12, 9, 0);
  g.hline(x - 11, y - 5, 10, 1); g.hline(x - 11, y + 5, 10, 1);       // the can
  g.vline(x - 12, y - 4, 9, 1);
  g.hline(x - 9, y - 6, 2, 1); g.hline(x - 5, y - 6, 2, 1);           // vents
  g.line(x + 1, y - 6, x + 4, y - 9, 1); g.line(x + 1, y + 6, x + 4, y + 9, 1);   // barn doors
  g.vline(x + 1, y - 5, 11, 1);                                        // lens rim
  for (let j = -4; j <= 4; j++) for (let i = -1; i <= 0; i++)           // the glare, a turning dither
    if (dither(x + i + phase, y + j + (phase >> 3), 0.6)) g.pixel(x + i, y + j, 1);
  g.vline(x - 6, y + 6, 4, 1); g.hline(x - 8, y + 9, 5, 1);            // yoke
  g.vline(x - 6, y + 10, 50, 1);                                      // stand
  g.line(x - 6, 60 + oy, x - 11, 63 + oy, 1); g.line(x - 6, 60 + oy, x - 1, 63 + oy, 1);
}

function frame(g, ctx) {
  const { date, fields: f } = ctx;
  const [ox, oy] = orbit(date, 1, 4);
  const [lox, loy] = orbit(new Date(date.getTime() + 150000), 2, 5);
  const ta = (date.getTime() / 1000) % 86400;

  // Which turn are we nearest, and what does it turn from and to.
  let tau, from, to;
  if (f.sec >= 30) { tau = f.sec - 60; from = f; to = nextMinute(date); }
  else { tau = f.sec; from = previousMinute(date); to = f; }
  const a = from.hh + from.mm, b = to.hh + to.mm;
  const hourTurn = from.hh !== to.hh;

  // ---------------------------------------------------- every wire point, in space
  const pts = [], drops = [], centres = [];
  for (let k = 0; k < 4; k++) {
    const [th, dy, u, tilt] = pose(k, tau, a[k] !== b[k], hourTurn, ta);
    drops.push(dy);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    // a slow pendulum sway across the beam: the shadow digit drifts as a whole
    const swx = 0.4 * Math.sin((TAU * ta) / (3.1 + k * 0.37) + k), swy = 0.25 * Math.sin((TAU * ta) / (4.3 + k * 0.53) + 2 * k);
    const A = slotWires(k, +a[k]), B = slotWires(k, +b[k]);
    const { c } = BALL[k];
    centres.push([c[0] + swx, c[1] + dy + swy, c[2]]);
    const cs = Math.cos(th), sn = Math.sin(th);
    const slot = [];
    for (let i = 0; i < N_WIRES; i++) {
      const [ph0, fr, amp, drift] = WEAVE[k][i];
      const ph = ph0 + drift * ta;          // the wire writhes, sliding only along the light
      const wire = [];
      for (let j = 0; j < K; j++) {
        const pa = A[i][j], pb = B[i][j];
        const ax = pa[0] + (pb[0] - pa[0]) * u, ay = pa[1] + (pb[1] - pa[1]) * u;
        const [m, q] = through(k, ax, ay);
        const p = lift(ax, ay, m + q * amp * Math.sin(ph + fr * j));
        const rx = p[0] - c[0], ry = p[1] - c[1], rz0 = p[2] - c[2];
        const ry2 = ry * ct - rz0 * st, rz = ry * st + rz0 * ct;
        wire.push([c[0] + rx * cs - rz * sn + swx, c[1] + ry2 + dy + swy, c[2] + rx * sn + rz * cs]);
      }
      slot.push(wire);
    }
    pts.push(slot);
  }

  // The colon: two glass beads on long threads near the lamp, swinging a
  // seconds beat; their shadows are the two dots.
  const sw = 0.5 * Math.sin(Math.PI * (f.sec - 0.5));
  const beads = COLON.map(([x, y], i) => {
    const p = lift(x, y, 0.28);
    return [p[0] + sw * (i ? 1 : 0.8), p[1], p[2]];
  });

  // ---------------------------------------------------- the lit wall
  // The dither's phase walks one step every three minutes, so no pixel of
  // the panel is lit all day.
  const step = Math.floor((date.getTime() - 30000) / 180000) % 64;
  const phx = step & 7, phy = (step >> 3) * 3;
  for (let y = 0; y < 64; y++) for (let x = PANEL_X - 2 + ox; x < 128; x++) {
    const l = panel(x + 0.5 - ox, y + 0.5 - oy);
    if (l > 0 && dither(x + phx, y + phy, l)) g.buf[y * 128 + x] = 1;
  }

  // ---------------------------------------------------- the shadows
  for (let k = 0; k < 4; k++) {
    const dia = BALL[k].dia, kn = 1 / BALL[k].s;
    for (const wire of pts[k]) {
      let prev = cast(...wire[0]);
      for (let j = 1; j < K; j++) {
        const cur = cast(...wire[j]);
        const km = (prev[2] + cur[2]) / 2;
        // A wire swung close to the lamp throws a shadow too blurred to
        // have a core: it thins, then vanishes.
        if (km > 0 && km < 2.6 * kn && (prev[1] < 70 || cur[1] < 70) && (prev[0] > PANEL_X - 6 || cur[0] > PANEL_X - 6)) {
          const w = km <= kn ? dia * km : dia * kn * (kn / km) ** 0.7;
          // Raked out long across the wall, a wire's shadow is a fine line.
          const len = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
          const wl = w * Math.min(1, 3.2 / len);
          if (wl >= 1.25) darkLine(g, prev[0] + ox, prev[1] + oy, cur[0] + ox, cur[1] + oy, wl);
          else if (wl >= 0.35) wline(g, prev[0] + ox, prev[1] + oy, cur[0] + ox, cur[1] + oy, 0);
        }
        prev = cur;
      }
    }
  }
  for (const p of beads) { const [x, y, k] = cast(...p); g.fillCircle(x + ox, y + oy, 0.75 * k, 0); }

  // ---------------------------------------------------- threads
  for (let k = 0; k < 4; k++) {
    const c = centres[k];
    const [tx, ty] = proj(c[0], c[1] - BALL[k].r - 1, c[2]);
    for (let y = k - 4; y < ty - 1; y += 3) g.pixel(tx + ox, y + oy, 1);
  }
  for (let i = 0; i < 2; i++) {
    const rest = lift(COLON[i][0], COLON[i][1], 0.28);
    const [tx, ty] = proj(rest[0], -60, rest[2]);
    const [bx, by] = proj(...beads[i]);
    wline(g, tx + ox, ty + oy, bx + ox, by + oy, 3);
  }

  // ---------------------------------------------------- the sculpture
  const segs = [];
  for (let k = 0; k < 4; k++) {
    const cz = BALL[k].c[2];
    for (const wire of pts[k]) for (let j = 1; j < K; j++) {
      const p = wire[j - 1], q = wire[j], z = (p[2] + q[2]) / 2;
      segs.push([p, q, z, z > cz - 1]);
    }
  }
  segs.sort((s1, s2) => s1[2] - s2[2]);
  for (const [p, q, , front] of segs) {
    const [x0, y0] = proj(...p), [x1, y1] = proj(...q);
    const X0 = x0 + ox, Y0 = y0 + oy, X1 = x1 + ox, Y1 = y1 + oy;
    // over the lit panel a wire needs a dark keyline; over black it does not
    if (Math.max(X0, X1) > PANEL_X - 3) {
      wline(g, X0 - 1, Y0, X1 - 1, Y1, 0); wline(g, X0 + 1, Y0, X1 + 1, Y1, 0);
      wline(g, X0, Y0 - 1, X1, Y1 - 1, 0); wline(g, X0, Y0 + 1, X1, Y1 + 1, 0);
    }
    wline(g, X0, Y0, X1, Y1, front ? 1 : 4);
  }
  for (const p of beads) { const [x, y] = proj(...p); g.fillCircle(x + ox, y + oy, 1.7, 0); g.fillCircle(x + ox, y + oy, 1.1, 1); }

  // Each tangle is held in a clear glass globe: it casts nothing worth
  // seeing, but it shows where one object ends and the next begins. A rim,
  // a glint on the side towards the lamp, a cap where the thread is tied.
  for (let k = 0; k < 4; k++) {
    const c = centres[k];
    const [x, y] = proj(...c);
    const R = BALL[k].r * CZ / (CZ - c[2]) + 1.2;
    const X = x + ox, Y = y + oy;
    g.circle(X, Y, R, 1);
    g.pixel(X - R * 0.55, Y - R * 0.6, 1); g.pixel(X - R * 0.55 + 1, Y - R * 0.6 - 1, 1);
    g.pixel(X - R * 0.7, Y - R * 0.35, 1);
    g.hline(Math.round(X) - 1, Math.round(Y - R) - 1, 3, 1);
  }

  // ---------------------------------------------------- the edges of the beam
  // From the barn doors to the shutter's corners, dots of light travelling
  // along them, outwards.
  {
    const [lx, ly] = proj(...LAMP);
    const ex = lox + Math.round(lx) + 1, ey = loy + Math.round(ly);
    for (const [ty, sy] of [[-1 + oy, -6], [64 + oy, 6]]) {
      const x0 = ex + 3, y0 = ey + sy, x1 = PANEL_X - 1 + ox, y1 = ty;
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 6);
      const ph = (ta * 7) % 6;
      for (let i = 0; i < n; i++) {
        const u = (i * 6 + ph) / L;
        if (u > 1) continue;
        g.pixel(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 1);
      }
    }
  }

  // ---------------------------------------------------- dust in the beam
  for (let i = 0; i < DUST.length; i++) {
    const [wx, wy, s, ph] = DUST[i];
    if (smoothNoise(ta * 0.9 + ph * 20, i + 99) < 0.6) continue;          // only some catch the light
    const p = lift(wx, wy, s);
    const t = ta * 0.05 + ph * 50;
    const x = p[0] + (smoothNoise(t, i) - 0.5) * 9;
    const y = p[1] + (smoothNoise(t * 0.8, i + 50) - 0.5) * 9;
    const [sx, sy] = proj(x, y, p[2]);
    if (sx + ox < PANEL_X - 1 && !g.get(sx + ox, sy + oy)) g.pixel(sx + ox, sy + oy, 1);
  }

  // ---------------------------------------------------- the lamp
  drawLamp(g, lox, loy, Math.floor(ta / 7) % 64);

  ctx.oled.contrast(0xcf + (0x30 - 0xcf) * ctx.night);
}

export default {
  name: 'Shadow',
  blurb: 'A spotlight shines through four glass globes of tangled wire, and only their shadows tell the time; each minute a globe whirls on its thread and its shadow rakes out and snaps into the new digit; each hour they drop and are hauled back up.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',
  frame,
};
