// Attractor — the Lorenz butterfly, traced by one point of light.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) evaluated at every pixel, and that is exactly what frame()
// can be. This face is not a shader of a field, though; it is a shader of a
// *flow*. The picture is one chaotic trajectory — the Lorenz system, sigma
// 10, rho 28, beta 8/3 — and the light is a single particle running it
// forever, leaving a phosphor trail that decays behind it.
//
// The trajectory is integrated once, at module load, with RK4, and stored as
// a time table: the position at every 1/240 s. The table is cut into a loop
// by searching for the moment the orbit comes back closest to where it
// started (a chaotic orbit is recurrent, so it does, often), and the last
// small mismatch is taken out with a linear detrend across the loop — an
// exact closure whose deformation of the path is a fraction of a percent. So
// the flow loops with period L = 28 s and the seam is not merely invisible:
// it is mathematically closed. frame() is then a pure function of t.
//
// Each frame samples the table at t - age, runs the whole 3D structure
// through a turntable rotation (one turn per loop, tied to the same L so the
// pose returns with the trajectory), projects it in perspective, and
// deposits phosphor along the path the light has walked. Because the trail
// is deposited in the current frame's rotated coordinates the glowing ribbon
// is welded to the butterfly and turns with it, while the light that made it
// runs along it.
//
// There are two fields, and the picture is the difference between them. The
// near one is the comet: the last few seconds of the path, where a deposit
// still glows hard — a solid core at the head with a dithered halo, a trail
// that leaves the solid threshold as it ages and thins into a dashed line and
// then into dust. Because a deposit is weighted by the length of path it
// covers rather than by the time spent covering it, the trace never piles up
// into a white blob where the flow stalls. The far one is the ghost: twenty seconds of the same path,
// deposited at nearly constant weight, so that however the orbit wanders the
// whole butterfly is always covered by it. The ghost is dithered down to a
// scatter of single pixels and its dither pattern is turned with the object,
// so it reads as the shape itself — the eternal thing — while the comet runs
// it. Chaos made visible: the structure is fixed, the light is never still,
// and the picture is always new. Everything repeats at three turns of the
// object, and holds still to the pixel across that seam.
//
// Burn-in: the comet sweeps new glass every second and the rotation walks the
// ghost over the panel continuously, but the two wings of this flow meet in a
// knot at its centre that every pass between them goes through, and that knot
// is where the light is nearly always present. So the whole picture drifts a
// few pixels on a slow circle as well, and the knot is never lit in the same
// place for long. The panel dims 23:00-07:00. Measured over the full 84 s
// cycle, the hottest pixel is lit 58% of the time, about 14 h/day.
//
// Cost: one pass over the glass and about 5000 table reads a frame — 1.2 ms
// at 128x64 measured, so SPI at 60 fps is comfortable.

import { dither, clamp } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;

// ---------------------------------------------------------------- the flow

const SIGMA = 10, RHO = 28, BETA = 8 / 3;

function rhs(x, y, z, o) {
  o[0] = SIGMA * (y - x);
  o[1] = x * (RHO - z) - y;
  o[2] = x * y - BETA * z;
  return o;
}

const K1 = [0, 0, 0], K2 = [0, 0, 0], K3 = [0, 0, 0], K4 = [0, 0, 0];
/** One classical Runge-Kutta step of the Lorenz flow. */
function rk4(s, h) {
  const x = s[0], y = s[1], z = s[2];
  const k1 = rhs(x, y, z, K1).slice();
  const k2 = rhs(x + (h / 2) * k1[0], y + (h / 2) * k1[1], z + (h / 2) * k1[2], K2).slice();
  const k3 = rhs(x + (h / 2) * k2[0], y + (h / 2) * k2[1], z + (h / 2) * k2[2], K3).slice();
  const k4 = rhs(x + h * k3[0], y + h * k3[1], z + h * k3[2], K4).slice();
  return [
    x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    z + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

// ---------------------------------------------------------------- the table
// One step of the table is one step of the integrator: 1/240 s is well under
// a screen pixel of travel, so reading between two entries is exact enough.

const DT = 1 / 240;            // s between table entries
const L = 28;                  // loop length, s — one turn of the object
const N = Math.round(L / DT);
const TRANSIENT = 60;          // s of orbit discarded before the loop begins
const SEARCH = 180;            // s scanned for the closest return
const SEED = [0.1, 0, 20];

const TABLE = (() => {
  let s = SEED.slice();
  for (let i = 0, n = Math.round(TRANSIENT / DT); i < n; i++) s = rk4(s, DT);
  // Integrate SEARCH + L, keeping every step, then look for the pair of times
  // L apart that come back nearest to each other: that is the seam to cut at.
  const M = Math.round(SEARCH / DT) + N + 1;
  const ax = new Float64Array(M), ay = new Float64Array(M), az = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    s = rk4(s, DT);
    ax[i] = s[0]; ay[i] = s[1]; az[i] = s[2];
  }
  let best = Infinity, bi = 0;
  for (let i = 0; i < M - N - 1; i++) {
    const dx = ax[i + N] - ax[i], dy = ay[i + N] - ay[i], dz = az[i + N] - az[i];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  // Close the loop: take the linear drift of the mismatch back out across the
  // whole circuit. Q(L) = Q(0) exactly, the path bends by a third of a unit
  // over 28 seconds of a flow that moves a hundred times as fast, and the
  // seam is gone.
  const dx = (ax[bi + N] - ax[bi]) / N, dy = (ay[bi + N] - ay[bi]) / N, dz = (az[bi + N] - az[bi]) / N;
  const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N);
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < N; k++) {
    X[k] = ax[bi + k] - dx * k; Y[k] = ay[bi + k] - dy * k; Z[k] = az[bi + k] - dz * k;
    cx += X[k]; cy += Y[k]; cz += Z[k];
  }
  cx /= N; cy /= N; cz /= N;
  for (let k = 0; k < N; k++) { X[k] -= cx; Y[k] -= cy; Z[k] -= cz; }
  return { X, Y, Z };
})();
const { X: AX, Y: AY, Z: AZ } = TABLE;

/** Position at table time `s` (seconds, any real), linearly interpolated. */
const PP = [0, 0, 0];
function sampleAt(s, o) {
  let u = (s / DT) % N;
  if (u < 0) u += N;
  const i0 = u | 0, f = u - i0, i1 = i0 + 1 === N ? 0 : i0 + 1;
  o[0] = AX[i0] + (AX[i1] - AX[i0]) * f;
  o[1] = AY[i0] + (AY[i1] - AY[i0]) * f;
  o[2] = AZ[i0] + (AZ[i1] - AZ[i0]) * f;
  return o;
}

// ---------------------------------------------------------------- the camera
// A turntable: the flow's own z is up. One turn per loop, plus a slow nod of
// the pitch over the same period, so the whole pose returns with the flow.
// The elevation is high — looking down on the butterfly from about 36
// degrees — because at a low one the two wings line up with the eye twice a
// turn and the picture collapses into a knot; from above, the far wing comes
// up over the near one instead and there is no view of this object without
// two wings in it.

const PITCH0 = 0.62, PITCH_AMP = 0.13;
const FOCAL = 150;             // camera distance in flow units; gentle perspective
// The flow is very nearly as tall as it is wide, and the glass is 2:1. Squash
// the vertical rather than shrink the whole butterfly into the middle of the
// panel: the wings flatten, the picture fills the field, and the rotation
// reads better for it.
const SQUASH = 0.72;

// The wander. The two wings of this flow meet in a knot at its centre, and
// every pass between the wings goes through that knot, so the middle of the
// picture is the one place the light is almost always present: left fixed on
// the glass it is the one pixel that would burn. So the whole picture drifts
// a few pixels on a slow circle — three loops of the flow to one turn, so it
// is exactly periodic with the rest — and the knot is never lit in the same
// place for long. It reads as the butterfly floating, which is no loss.
const WX = 5, WY = 2, WANDER_T = 3 * L;

// Fit the picture once: the projection's worst case over a whole turn (and
// both pitch extremes), plus room for the wander, sets the scale, so the
// shape fills the glass at its widest and never clips.
const SCALE = (() => {
  let fx = 0, fy = 0;
  for (let a = 0; a < 96; a++) {
    const yaw = (a * TAU) / 96, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const pitch of [PITCH0 - PITCH_AMP, PITCH0 + PITCH_AMP]) {
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let k = 0; k < N; k += 3) {
        const u1 = AX[k] * cy - AY[k] * sy, u2 = AX[k] * sy + AY[k] * cy;
        const a2 = u2 * cp - AZ[k] * sp, b = u2 * sp + AZ[k] * cp;
        const s = FOCAL / (FOCAL + a2);
        const px = u1 * s, py = b * s;
        if (Math.abs(px) > fx) fx = Math.abs(px);
        if (Math.abs(py) > fy) fy = Math.abs(py);
      }
    }
  }
  return Math.min((W / 2 - 2 - WX) / fx, (H / 2 - 2 - WY) / (fy * SQUASH));
})();
const SCALE_Y = SCALE * SQUASH;

// ---------------------------------------------------------------- the phosphor

const DTE = 1 / 240;           // step walking back through the trail, s
const SPLAT = 0.7;             // px between deposits along the path
const COMET_S = 3.5;           // how long a deposit still glows hard, s
const GHOST_S = 20;            // how far back the eternal shape is drawn, s
const LOOKBACK = Math.round(GHOST_S / DTE);
const V0 = 1.0;                // comet energy per pixel of path
const VG = 0.55;               // ghost energy per pixel of path
const CORE = 0.80;             // blurred energy at which the trace is solid
const BLOOM_T = 0.20;          // bloom field a pixel needs before it shows
const GHOST_T = 0.30;          // the ghost's own floor: below it is black

const E = new Float32Array(W * H);   // comet energy
const B = new Float32Array(W * H);   // comet, spot
const B2 = new Float32Array(W * H);  // comet, bloom
const GG = new Float32Array(W * H);  // ghost energy
const GH = new Float32Array(W * H);  // ghost, blurred
const TMP = new Float32Array(W * H);

/** Energy `e` at sub-pixel (x, y) of field `dst`, split over four pixels. */
function deposit(dst, x, y, e) {
  const fx = x - 0.5, fy = y - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  if (ix < -1 || iy < -1 || ix >= W || iy >= H) return;
  const ax = fx - ix, ay = fy - iy, i = iy * W + ix;
  if (ix >= 0 && iy >= 0) dst[i] += e * (1 - ax) * (1 - ay);
  if (ix + 1 < W && iy >= 0) dst[i + 1] += e * ax * (1 - ay);
  if (iy + 1 < H && ix >= 0) dst[i + W] += e * (1 - ax) * ay;
  if (iy + 1 < H && ix + 1 < W) dst[i + W + 1] += e * ax * ay;
}

/** Separable box blur of `src` into `dst`, radius r. */
function blur(src, dst, r) {
  const n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += src[row + xx]; }
      TMP[row + x] = s / n;
    }
  }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += TMP[yy * W + x]; }
      dst[y * W + x] = s / n;
    }
}

/** The comet: what is left of a deposit `age` seconds later, plus the blaze of
 *  the head itself, which is where the particle is right now. */
const comet = (age) => Math.exp(-((age / COMET_S * 1.9) ** 1.7)) + 0.5 * Math.exp(-((age / 0.16) ** 2));

// ---------------------------------------------------------------- the design

export default {
  name: 'Attractor',
  blurb: 'The Lorenz butterfly traced by one point of light: a glowing trail runs the eternal shape as the whole thing turns.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const t = ctx.t;
    const yaw = (TAU * t) / L;
    const pitch = PITCH0 + PITCH_AMP * Math.sin((TAU * t) / L);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    const wander = (TAU * t) / WANDER_T;
    const cx = W / 2 - 0.5 + WX * Math.cos(wander), cyy = H / 2 - 0.5 + WY * Math.sin(wander);
    E.fill(0); GG.fill(0);

    // Walk back along the trail, depositing into both fields at once.
    const q = PP;
    let hx = 0, hy = 0, hd = 1;
    let px = 0, py = 0, have = false;
    for (let i = 0; i <= LOOKBACK; i++) {
      const age = i * DTE;
      sampleAt(t - age, q);
      // turntable, then nod, then perspective: u1 across, b up, a2 away.
      const u1 = q[0] * cy - q[1] * sy, u2 = q[0] * sy + q[1] * cy;
      const a2 = u2 * cp - q[2] * sp, b = u2 * sp + q[2] * cp;
      const s = FOCAL / (FOCAL + a2);
      const x = cx + u1 * s * SCALE, y = cyy - b * s * SCALE_Y;
      // Depth: nearer (s > 1) is bigger, and it also moves further per unit of
      // time, so the energy is scaled by it squared to read as nearer rather
      // than as a faster, fainter thread.
      const d = s * s;
      if (i === 0) { hx = x; hy = y; hd = s; }
      if (have) {
        const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
        const m = dist < SPLAT ? 1 : Math.ceil(dist / SPLAT);
        // Energy per step is worth the path run, not the time spent: the wing
        // cores, where the flow nearly stalls, then glow no brighter than the
        // fast sweeps instead of piling up into a white blob.
        const gc = age < COMET_S ? (V0 * comet(age) * dist * d) / m : 0;
        const gg = (VG * dist * d * (0.55 + 0.45 * Math.exp(-age / 5))) / m;
        for (let k = 0; k < m; k++) {
          const ddx = px + (dx * (k + 0.5)) / m, ddy = py + (dy * (k + 0.5)) / m;
          if (gc) deposit(E, ddx, ddy, gc);
          deposit(GG, ddx, ddy, gg);
        }
      }
      px = x; py = y; have = true;
    }

    // The spot is not a pixel: the beam that wrote this had a width, so the
    // trace is blurred into a spot about three pixels across, and the wider
    // blur is the bloom around it. The ghost is blurred harder still, so that
    // twenty seconds of path become one even field rather than a hairball of
    // crossings.
    blur(E, B, 1);
    blur(B, B2, 5);
    blur(GG, GH, 3);

    // The grey. A one-pixel trace dithered at half tone reads as a dotted
    // line, not a dim one, so the comet is not dithered where it is solid:
    // the blurred energy is thresholded and the pixels over it are lit
    // outright. The threshold is taken on a 3 x 3 maximum of the field, not
    // on the field itself, because a stroke at 45 degrees otherwise crosses a
    // pixel differently from one at 0 degrees and breaks into dashes; the
    // maximum makes the stroke equally solid at every angle. What carries the
    // brightness then is width: the spot is wider where the phosphor is
    // fresh, so the trace is a tube at the head and a hairline before it goes
    // out. Around it the bloom is dithered, and the ghost is dithered at its
    // own low floor — and both dither patterns are rotated with the object,
    // so the texture belongs to the butterfly instead of swimming on the
    // glass as it turns.
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : B[y * W + x]);
    const rot = Math.cos(yaw), ros = Math.sin(yaw);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const b = B[i];
        const max = Math.max(b, at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1),
          at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1));
        if (max >= CORE) { g.buf[i] = 1; continue; }
        const dx = x - cx, dy = y - cyy;
        const u = Math.round(dx * rot + dy * ros) + 64, v = Math.round(dy * rot - dx * ros) + 64;
        // The tail: the level climbs out of the field continuously, so the
        // trace leaves the solid threshold and thins into a dashed line and
        // then into separate pixels, rather than stopping. Under it the wide
        // blur adds the bloom — a halo that only the head has any of.
        const lv = Math.max(
          clamp(((max / CORE - 0.10) / 0.90) ** 1.9, 0, 1) * 0.95,
          clamp((B2[i] - BLOOM_T) * 1.4, 0, 1));
        if (lv > 0.05 && dither(u, v, lv)) { g.buf[i] = 1; continue; }
        const gh = clamp((GH[i] - GHOST_T) * 0.9, 0, 0.34);
        if (gh > 0.04 && dither(u, v, gh)) g.buf[i] = 1;
      }

    // The light itself. However fast the particle is moving, there is a solid
    // core at the head and a dithered halo round it, so the eye always has one
    // point to follow along the trail.
    const hr = 1.0 + 0.7 * hd;
    g.fillCircle(hx, hy, hr, 1);
    g.fillWhere((px, py) => {
      const r = Math.hypot(px - hx, py - hy);
      return r < 4.6 && dither(Math.round(px), Math.round(py), clamp(1.2 - r / 4.4, 0, 1));
    }, 1, [hx - 5, hy - 5, 11, 11]);

    // Night dimming, as the rest of the library does it.
    ctx.oled.contrast(0xff - 0x9a * ctx.night);
  },
};
