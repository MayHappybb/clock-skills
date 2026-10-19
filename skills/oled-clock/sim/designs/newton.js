// Newton — a chrome Newton's cradle that clicks the seconds.
//
// Real 3D: five balls ray-cast per pixel (depth-buffered with the wires,
// rails and base), each hung on a V of two wires from two rails, seen from
// above and to one side while the camera drifts. Chrome on a 1-bit glass is
// a crisp outline plus the crescent of a window light inside the upper-left
// limb, cut off where a neighbour blocks the window. The hour (24 h) is
// engraved on the left end ball, the minute on the right, in a ball-terminal
// hand drawn for the cradle (strokes ending in bobs); the decals wrap the
// sphere and tilt with the swing.
//
// Steady: one click a second, the minute ball out on even seconds and the
// hour ball on odd ones, the next ball following a little, the middle three
// shivering after each strike, two sparks at the notch.
// Minute: a fingertip comes down, winds up and flicks the minute ball round
// on its swivel (the new minute is engraved on the back); a detent catches
// it with a small wobble. The old face has turned away by :00.0, the new one
// is round by :00.3.
// Hour: two fingers flick both end balls round at once and strike the row;
// the cradle breaks into a dance (five pendulums with Hertzian contacts and
// slightly detuned wires, simulated once at load) while the camera eases
// back, then it settles into the steady click by :09.5.

import { ease, clamp, progress, previousMinute, clockFields, orbit } from '../js/kit.js';

const TAU = Math.PI * 2, PI = Math.PI;

// ------------------------------------------------------------ the numerals
// A ball-terminal hand drawn for the cradle: monoline strokes whose free
// ends finish in a ball, as if each stroke were a wire with a bob on it.
// Design units: a digit is 8 wide and 16 tall, y down; stroke half-width
// HW, terminal balls of radius BR. Arcs are elliptical, angles in degrees
// (0 = right, 90 = down).

const HW = 1.1, BR = 2.25;
const seg = (x0, y0, x1, y1) => ({ k: 's', p: [[x0, y0], [x1, y1]] });
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6)), p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return { k: 's', p };
}
const ball = (x, y, r = BR) => ({ k: 'b', x, y, r });

const DIGITS = [
  /* 0 */ [arc(4, 8, 3.1, 6.6, 0, 360)],
  /* 1 */ [seg(4.6, 1.4, 4.6, 15), seg(4.6, 1.4, 2.6, 3.2), ball(2.2, 3.6, 1.8), seg(1.8, 15, 7.4, 15)],
  /* 2 */ [arc(4, 5.0, 3.0, 3.6, 195, 380), seg(6.82, 6.25, 1.0, 15), seg(1.0, 15, 7.4, 15), ball(1.6, 4.6)],
  /* 3 */ [arc(4, 4.3, 2.8, 3.0, 205, 450), arc(4, 11.0, 3.2, 3.7, -90, 150), ball(1.75, 3.0), ball(1.5, 12.9)],
  /* 4 */ [seg(5.6, 1, 0.8, 11), seg(0.8, 11, 7.6, 11), seg(5.6, 1, 5.6, 15)],
  /* 5 */ [seg(7.0, 1.2, 2.2, 1.2), seg(2.2, 1.2, 1.8, 7.4), arc(4.0, 10.6, 3.3, 4.2, -128, 140), ball(7.2, 1.6, 1.6), ball(1.6, 13.4)],
  /* 6 */ [arc(4, 11, 3.0, 3.8, 0, 360), arc(6.6, 11, 5.6, 8.6, -100, -180), ball(5.9, 2.6)],
  /* 7 */ [seg(1.0, 1.2, 7.3, 1.2), seg(7.3, 1.2, 3.4, 15), seg(1.0, 1.2, 1.0, 2.5), ball(1.0, 3.9)],
  /* 8 */ [arc(4, 4.3, 2.6, 3.0, 0, 360), arc(4, 11.3, 3.2, 3.7, 0, 360)],
  /* 9 */ [arc(4, 5, 3.0, 3.8, 0, 360), arc(1.4, 5, 5.6, 8.6, 0, 80), ball(2.2, 13.4)],
];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  let u = ((px - ax) * dx + (py - ay) * dy) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
/** Signed distance (design units) from the digit's ink. */
function digitSDF(d, x, y) {
  let best = 1e9;
  for (const c of DIGITS[d]) {
    if (c.k === 'b') best = Math.min(best, Math.hypot(x - c.x, y - c.y) - c.r);
    else for (let i = 1; i < c.p.length; i++)
      best = Math.min(best, segDist(x, y, c.p[i - 1][0], c.p[i - 1][1], c.p[i][0], c.p[i][1]) - HW);
  }
  return best;
}

// Tabulated at RES samples per design unit over [-PAD, 8+PAD] x [-PAD, 16+PAD].
const RES = 4, PAD = 2.5, GW = Math.ceil((8 + 2 * PAD) * RES), GH = Math.ceil((16 + 2 * PAD) * RES);
const SDF = DIGITS.map((_, d) => {
  const a = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) a[j * GW + i] = digitSDF(d, (i + 0.5) / RES - PAD, (j + 0.5) / RES - PAD);
  return a;
});
/** Distance from digit d's ink at design coords (x, y); far outside = 9. */
export function glyphDist(d, x, y) {
  const i = Math.floor((x + PAD) * RES), j = Math.floor((y + PAD) * RES);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return 9;
  return SDF[d][j * GW + i];
}


// ------------------------------------------------------------ scene

const W = 128, H = 64;
const R = 1;                       // ball radius (world units)
const L = 2.8;                     // pivot axis height above the ball centres at rest
const WZ = 1.25;                   // the two rails at z = +-WZ: the V of each suspension
const XR = 7.4;                    // rails' ends / uprights
const YB = -1.32;                  // top of the base
const BX = [-4, -2, 0, 2, 4];      // ball rest x
const DS = 0.076;                  // world units per glyph design unit
const GAP = 1.1;                   // design units between the two digits on a ball
const MOAT = 1.05;                 // black cut round each stroke, design units

const zbuf = new Float32Array(W * H);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function camera(yaw, pitch, dist, ty, F, tx = 0) {
  const T = [tx, ty, 0];
  const C = [T[0] + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), -dist * Math.cos(yaw) * Math.cos(pitch)];
  const f = norm(sub(T, C)), r = norm(cross([0, 1, 0], f)), u = cross(f, r);
  return { C, f, r, u, F, cx: W / 2, cy: H / 2 };
}
function project(cam, P) {
  const d = sub(P, cam.C), z = dot(d, cam.f);
  return [cam.cx + cam.F * dot(d, cam.r) / z, cam.cy - cam.F * dot(d, cam.u) / z, z];
}

/** A lit 3D segment, depth-tested (w = 1 or 2 px). */
function line3(g, cam, P, Q, w = 1, bias = 0.05) {
  const a = project(cam, P), b = project(cam, Q);
  const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 1.5) + 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    const z = 1 / (1 / a[2] + (1 / b[2] - 1 / a[2]) * u) - bias;
    plotZ(g, Math.floor(x), Math.floor(y), z);
    if (w > 1) plotZ(g, Math.floor(x + 0.5), Math.floor(y + 0.5), z);
  }
}
function plotZ(g, x, y, z) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (z < zbuf[i]) { g.buf[i] = 1; zbuf[i] = z; }
}

/** Ball state: centre, rotation (columns ex, ey, ez of the ball's frame), number decals. */
function ballState(i, theta, spin) {
  const s = Math.sin(theta), c = Math.cos(theta);
  const S = [BX[i] + L * s, L - L * c, 0];
  // swing about world z, then spin about the ball's own axis (towards the pivot)
  const ey = [-s, c, 0];
  const cs = Math.cos(spin), ss = Math.sin(spin);
  // unspun frame: ex0 = (c, s, 0), ez0 = (0, 0, 1)
  const ex = [c * cs, s * cs, -ss], ez = [c * ss, s * ss, cs];
  return { S, ex, ey, ez, theta };
}
const toLocal = (b, v) => [dot(v, b.ex), dot(v, b.ey), dot(v, b.ez)];
const toWorld = (b, q) => [
  b.ex[0] * q[0] + b.ey[0] * q[1] + b.ez[0] * q[2],
  b.ex[1] * q[0] + b.ey[1] * q[1] + b.ez[1] * q[2],
  b.ex[2] * q[0] + b.ey[2] * q[1] + b.ez[2] * q[2]];

/** Ink of a number decal at decal coords (X, Y) in design units (centre 0,0, y down). */
function numberDist(str, X, Y, dx = 0) {
  const y = Y + 8;
  X -= dx;
  if (str.length === 1) return glyphDist(+str, X + 4, y);
  const left = X < 0;
  return left ? glyphDist(+str[0], X + 8 + GAP / 2, y) : glyphDist(+str[1], X - GAP / 2, y);
}

/**
 * Engraving at local unit point q: 2 = ink, 1 = moat, 0 = bare chrome.
 * Decals: front faces local -z (towards the viewer at rest), back faces +z.
 */
const TILT = 0.3, CT = Math.cos(TILT), ST = Math.sin(TILT);   // decals lean back to face a viewer above
function engraving(b, q, viewDir) {
  for (let k = 0; k < 2; k++) {
    const str = b.decal[k];
    if (!str) continue;
    const sgn = k ? 1 : -1;               // front decal faces local -z, back +z
    const a = q[1] * ST + q[2] * sgn * CT;
    if (a < 0.3) continue;
    // the decal axis in world, to drop a decal that has turned away
    const ax = [b.ey[0] * ST + b.ez[0] * sgn * CT, b.ey[1] * ST + b.ez[1] * sgn * CT, b.ey[2] * ST + b.ez[2] * sgn * CT];
    if (-dot(ax, viewDir) < 0.5) continue;
    const X = (-sgn * q[0]) / DS, Y = -(q[1] * CT - q[2] * sgn * ST) / DS;
    const d = numberDist(str, X, Y, b.dx || 0);
    if (d < 0) return 2;
    if (d < MOAT) return 1;
  }
  return 0;
}

function raySphere(O, D, S) {
  const oc = sub(O, S), bq = dot(oc, D), c = dot(oc, oc) - R * R, disc = bq * bq - c;
  if (disc < 0) return -1;
  const t = -bq - Math.sqrt(disc);
  return t > 1e-4 ? t : -1;
}

/** The studio: a softbox up front-left, a strip light right; floor dark. */
const LD = norm([-0.5, 0.62, -0.6]);
function env(Rv) {
  // a ring light up and to the left: on a ball it mirrors as a crescent
  // hugging the upper-left limb (sphere, not eye)
  const c = dot(Rv, LD);
  return c > 0.5 && c < 0.6 && Rv[1] > 0.25 && Rv[0] < -0.05 ? 1 : 0;
}

function drawBall(g, cam, balls, i) {
  const b = balls[i];
  const pc = project(cam, b.S);
  const rp = cam.F * R / pc[2];
  const pxw = pc[2] / cam.F;
  const x0 = Math.max(0, Math.floor(pc[0] - rp - 1)), x1 = Math.min(W - 1, Math.ceil(pc[0] + rp + 1));
  const y0 = Math.max(0, Math.floor(pc[1] - rp - 1)), y1 = Math.min(H - 1, Math.ceil(pc[1] + rp + 1));
  const C = cam.C, cf = cam.f, cr = cam.r, cu = cam.u;
  const ox = C[0] - b.S[0], oy = C[1] - b.S[1], oz = C[2] - b.S[2], oo = ox * ox + oy * oy + oz * oz;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const sx = (x + 0.5 - cam.cx) / cam.F, sy = -(y + 0.5 - cam.cy) / cam.F;
    let dx = cf[0] + cr[0] * sx + cu[0] * sy, dy = cf[1] + cr[1] * sx + cu[1] * sy, dz = cf[2] + cr[2] * sx + cu[2] * sy;
    const dl = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz); dx *= dl; dy *= dl; dz *= dl;
    const bq = ox * dx + oy * dy + oz * dz, disc = bq * bq - (oo - R * R);
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    const zc = t * (dx * cf[0] + dy * cf[1] + dz * cf[2]);
    const idx = y * W + x;
    if (zc >= zbuf[idx]) continue;
    zbuf[idx] = zc;
    const D = [dx, dy, dz], P = [C[0] + dx * t, C[1] + dy * t, C[2] + dz * t];
    const hdist = Math.sqrt(Math.max(0, oo - bq * bq));
    let lit = 0;
    if (hdist > R - 1.05 * pxw) lit = 1;
    else {
      const n = [(P[0] - b.S[0]) / R, (P[1] - b.S[1]) / R, (P[2] - b.S[2]) / R];
      const e = b.decal ? engraving(b, toLocal(b, n), D) : 0;
      if (e) lit = e === 2 ? 1 : 0;
      else {
        // the crescent of a window light up and to the left, seen just inside
        // the outline (with a black gap), unless a neighbour blocks the window
        const nz = -dot(n, cam.f), nx = dot(n, cam.r), ny = dot(n, cam.u);
        if (nz > 0.3 && nz < 0.62) {
          const ang = Math.atan2(ny, -nx);          // 0 = left, +pi/2 = up
          if (Math.abs(ang - 0.85) < 0.5) {
            const dn = dot(D, n);
            const Rv = [D[0] - 2 * dn * n[0], D[1] - 2 * dn * n[1], D[2] - 2 * dn * n[2]];
            let blocked = false;
            for (let j = 0; j < balls.length && !blocked; j++) if (j !== i && raySphere(P, Rv, balls[j].S) > 0) blocked = true;
            lit = blocked ? 0 : 1;
          }
        }
      }
    }
    g.buf[idx] = lit;
  }
}

function drawFrame(g, cam, balls) {
  for (const z of [-WZ, WZ]) {
    line3(g, cam, [-XR, L, z], [XR, L, z], 1);
    for (const x of [-XR, XR]) line3(g, cam, [x, L, z], [x, YB, z], 1);
  }
  // base slab
  const BXm = 7.9, BZ = 1.6, BH = 0.3;
  const c = [[-BXm, YB, -BZ], [BXm, YB, -BZ], [BXm, YB, BZ], [-BXm, YB, BZ]];
  for (let k = 0; k < 4; k++) line3(g, cam, c[k], c[(k + 1) % 4], 1);
  line3(g, cam, [-BXm, YB, -BZ], [-BXm, YB - BH, -BZ], 1);
  line3(g, cam, [BXm, YB, -BZ], [BXm, YB - BH, -BZ], 1);
  // the suspensions
  for (const b of balls) {
    const cap = [b.S[0] + b.ey[0] * R * 0.92, b.S[1] + b.ey[1] * R * 0.92, b.S[2]];
    const px = BX[balls.indexOf(b)];
    for (const z of [-WZ, WZ]) line3(g, cam, cap, [px, L, z], 1, 0.02);
  }
}

// ------------------------------------------------------------ motion

const AMP = 0.24;         // end-ball swing, radians: one click a second

/** The steady cradle: the minute ball out on even seconds, the hour ball on odd. */
function steadyAngles(sec) {
  const k = Math.floor(sec), u = sec - k;
  const a = AMP * Math.sin(PI * u);
  const th = [0, 0, 0, 0, 0];
  if (k % 2 === 0) { th[4] = a; th[3] = 0.035 * a; } else { th[0] = -a; th[1] = -0.035 * a; }
  // the middle shiver after each click, and the slow drift real cradles have
  const j = 0.006 * Math.exp(-6 * u) * Math.sin(48 * u);
  th[1] += j; th[2] -= j; th[3] += j;
  return th;
}

// The hour: two fingers strike both ends at once and the row breaks into a
// dance. Simulated once, at load, as five pendulums with Hertzian contacts
// (slightly detuned wires, a little air drag), then sampled at 120 Hz.
const SHOW_T = 10, SHOW_RATE = 120, BLEND0 = 6.5, BLEND1 = 9.5;
const SHOW = (() => {
  const k = 2.5e5, dt = 0.00025, damp = 0.11, det = [1.0, 0.985, 1.01, 0.99, 1.015];
  const th = [0, 0, 0, 0, 0], w = [0.4 * PI, 0.4 * PI, 0.4 * PI, 0, -0.47 * PI];
  const out = new Float32Array((SHOW_T * SHOW_RATE + 2) * 5);
  const steps = Math.round(SHOW_T / dt), every = Math.round(1 / SHOW_RATE / dt);
  const px = [0, 0, 0, 0, 0], py = [0, 0, 0, 0, 0], Q = [0, 0, 0, 0, 0];
  for (let n = 0, m = 0; n <= steps; n++) {
    if (n % every === 0) { for (let i = 0; i < 5; i++) out[m * 5 + i] = th[i]; m++; }
    for (let i = 0; i < 5; i++) { px[i] = BX[i] + L * Math.sin(th[i]); py[i] = -L * Math.cos(th[i]); Q[i] = 0; }
    for (let i = 0; i < 4; i++) {
      const dx = px[i + 1] - px[i], dy = py[i + 1] - py[i], d = Math.hypot(dx, dy), del = 2 * R - d;
      if (del <= 0) continue;
      const f = k * del ** 1.5, nx = dx / d, ny = dy / d;
      Q[i + 1] += f * (nx * Math.cos(th[i + 1]) + ny * Math.sin(th[i + 1])) / L;
      Q[i] -= f * (nx * Math.cos(th[i]) + ny * Math.sin(th[i])) / L;
    }
    for (let i = 0; i < 5; i++) {
      w[i] += (Q[i] - PI * PI * det[i] * Math.sin(th[i]) - damp * w[i]) * dt;
      th[i] += w[i] * dt;
    }
  }
  return out;
})();

function showAngles(ts, sec) {
  const f = ts * SHOW_RATE, i = Math.min(Math.floor(f), SHOW_T * SHOW_RATE - 1), u = f - i;
  const th = [];
  for (let b = 0; b < 5; b++) th.push(SHOW[i * 5 + b] * (1 - u) + SHOW[i * 5 + 5 + b] * u);
  const bl = ease.inOutCubic(progress(ts, BLEND0, BLEND1));
  if (bl > 0) { const st = steadyAngles(sec); for (let b = 0; b < 5; b++) th[b] += (st[b] - th[b]) * bl; }
  return th;
}

/** Swivel turn of a ball flicked at time 0: 0 -> PI, settling into its detent. */
function spinAt(u) {
  if (u <= 0) return 0;
  if (u >= 1.6) return PI;
  const a = Math.min(1, u / 1.15);
  let v = PI * ease.outBack(a);
  if (u > 1.15) v = PI + 0.06 * Math.exp(-6 * (u - 1.15)) * Math.sin(22 * (u - 1.15));
  return v;
}

// ------------------------------------------------------------ the finger
// A hand-drawn index finger in outline, pointing down from above the glass,
// opaque (black inside) so it passes in front of the wires.
const TIP = [
  '#...........#',
  '#...........#',
  '#...#####...#',
  '#..#.....#..#',
  '#..#.....#..#',
  '#..#.....#..#',
  '#...#...#...#',
  '.#...###...#.',
  '..#.......#..',
  '...#######...',
];
const CREASE = [
  '#...........#',
  '#...#####...#',
  '#..#.....#..#',
  '#...........#',
  '#...#####...#',
  '#..#.....#..#',
];
const FWID = 13, FPLAIN = '#...........#';
/** Tip (bottom centre) at (x, y); the finger runs up off the top of the glass. */
function drawFinger(g, x, y) {
  const b = g.buf, x0 = Math.round(x) - 6, yt = Math.round(y);
  for (let Y = yt; Y >= 0; Y--) {
    const k = yt - Y;                      // rows above the tip
    let row;
    if (k < TIP.length) row = TIP[TIP.length - 1 - k];
    else {
      const c = k - 15;                    // the knuckle creases, a little way up
      row = c >= 0 && c < CREASE.length ? CREASE[CREASE.length - 1 - c] : FPLAIN;
    }
    for (let c = 0; c < FWID; c++) {
      const X = x0 + c;
      if (X < 0 || X >= W || Y >= H) continue;
      const inside = row.indexOf('#') <= c && c <= row.lastIndexOf('#');
      if (inside) b[Y * W + X] = row[c] === '#' ? 1 : 0;
    }
  }
}

/** Finger tip offset (dx, dy) from its touch point at time u from the flick, or null. */
function fingerPose(u) {
  if (u < -1.3 || u > 0.9) return null;
  if (u < -0.35) return [-3, -40 * (1 - ease.outCubic(progress(u, -1.3, -0.35)))];          // comes down
  if (u < 0) return [-3 - 2 * ease.inOutQuad(progress(u, -0.35, 0)), -1 * progress(u, -0.35, 0)]; // the wind-up
  if (u < 0.1) return [-5 + 14 * ease.inQuad(u / 0.1), -1 + 2 * (u / 0.1)];                   // the flick, across the face
  return [9 + 4 * progress(u, 0.1, 0.9), 1 - 44 * ease.inCubic(progress(u, 0.1, 0.9))];         // and away
}

// ------------------------------------------------------------ the face

const YAW = 0.5;
const FLICK = -0.13;

/** The click: two short sparks jump out of the notch between the struck pair, for a moment. */
function drawClick(g, cam, sec, ox, oy) {
  const k = Math.round(sec), u = sec - k;
  if (u < 0 || u > 0.14) return;
  // the ball that just came home: the minute ball after an even second, the hour ball after an odd one
  const cx = (k - 1) % 2 === 0 ? BX[3] + R : BX[1] - R;
  const P = project(cam, [cx, 0.62 * R, 0]);
  const e = ease.outCubic(u / 0.14), r0 = 1 + 2 * e, r1 = r0 + 3 - 2 * e;
  for (const ang of [-0.45, 0.45]) {
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    g.line(Math.round(P[0] + dx * r0), Math.round(P[1] + dy * r0), Math.round(P[0] + dx * r1), Math.round(P[1] + dy * r1));
  }
}
const CAM = [30, 0.4, 352, 0.5];   // distance, target y, focal px, target x

export default {
  name: 'Newton',
  blurb: 'A chrome Newton\'s cradle that clicks the seconds: the hour and the minute are engraved on the two end balls; each minute a finger flicks the minute ball round on its swivel, and on the hour two fingers set the whole row dancing.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    const tAbs = ctx.date.getTime() / 1000;
    zbuf.fill(1e9);

    // the hour show runs for the first SHOW_T seconds of each hour
    const inShow = f.m === 0 && sec < SHOW_T;
    const th = inShow ? showAngles(sec, sec) : steadyAngles(sec);

    const yaw = YAW + 0.09 * Math.sin(tAbs * TAU / 131);
    const pitch = 0.28 + 0.03 * Math.sin(tAbs * TAU / 173);
    // on the hour the camera eases back a little to take in the dance
    const back = inShow ? ease.outCubic(progress(sec, 0, 0.45)) * (1 - ease.inOutCubic(progress(sec, 7, SHOW_T))) : 0;
    const cam = camera(yaw, pitch, CAM[0], CAM[1] + 0.15 * back, CAM[2] * (1 - 0.2 * back), CAM[3]);
    const [ox, oy] = orbit(ctx.date, 2, 4);          // burn-in walk: the glass picture shifts a pixel every 4 min
    cam.cx += ox; cam.cy += oy;

    // the turn: at :00 the minute ball is flicked round (and the hour ball, on the hour)
    // u: seconds since this turn's flick (FLICK before :00), so the old face
    // has turned away by :00.01 and the new one is round from :00.14
    const early = sec >= 60 + FLICK;
    const u = early ? sec - 60 - FLICK : sec - FLICK;
    const a = early ? f : previousMinute(ctx.date);                  // before the turn
    const b = early ? clockFields(new Date(ctx.date.getTime() + 60000)) : f;   // after
    const hourTurn = b.m === 0;
    const turning = u < 1.6;
    const sp = turning ? spinAt(u) : 0;
    const balls = th.map((ang, i) => ballState(i, ang, -YAW + ((i === 4 || (i === 0 && hourTurn)) ? sp : 0)));
    const hourNow = String(f.h);
    if (turning) {
      balls[4].decal = [a.mm, b.mm];
      balls[0].decal = hourTurn ? [String(a.h), String(b.h)] : [hourNow, null];
    } else {
      balls[4].decal = [f.mm, null];
      balls[0].decal = [hourNow, null];
    }

    balls[0].dx = 0;
    const order = [0, 1, 2, 3, 4].sort((a, b) => project(cam, balls[a].S)[2] - project(cam, balls[b].S)[2]);
    for (const i of order) drawBall(g, cam, balls, i);
    drawFrame(g, cam, balls);

    // the fingers: the right one every minute, the left one too on the hour
    const uf = sec >= 58 ? sec - 60 - FLICK : sec - FLICK;
    const pr = fingerPose(uf);
    if (pr) {
      const pc = project(cam, balls[4].S), rp = cam.F * R / pc[2];
      drawFinger(g, pc[0] + pr[0], pc[1] - rp * 0.62 + pr[1]);
      if (sec >= 58 ? f.m === 59 : f.m === 0) {
        const pl = project(cam, balls[0].S), rl = cam.F * R / pl[2];
        drawFinger(g, pl[0] - pr[0], pl[1] - rl * 0.62 + pr[1]);
      }
    }
    if (!inShow) drawClick(g, cam, sec);

    ctx.oled.contrast(Math.round(0xcf + (0x10 - 0xcf) * ctx.night));
  },
};
