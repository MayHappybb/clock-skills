// Orrery: the clockwork. Turns the wall clock into arm angles, gear turns,
// strikes and lights, then runs the plate pass and the sphere pass.
import * as kit from '../js/kit.js';
import { W, H, E0, HS, RS, cam, setCam, project, shade, light } from './orrery-cam.js';
import { platePass } from './orrery-plate.js';
import { spherePass } from './orrery-spheres.js';

const TAU = Math.PI * 2, T60 = TAU / 60;
const img = new Float32Array(3 * W * H), mask = new Uint8Array(W * H);
const BRc = [0.32, 0.18, 0.045], GILT = [0.28, 0.13, 0.03], STEEL = [0.07, 0.12, 0.3];
const norm = (v) => { const n = Math.hypot(...v); return v.map((c) => c / n); };
const AX_WORLD = norm([0.38, 0.1, 0.92]), AX_GIANT = norm([0.32, -0.4, 0.86]);
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = kit.smoothstep;

/** Damped spring step 0 -> 1 (zero start velocity, ~9 % overshoot, settles in ~1.6 s). */
function tick(t) {
  if (t <= 0) return 0;
  const w = 4.2, z = 0.6, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
}

// stars behind the machine: [x, y, level, phase, hue]
const STARS = [];
for (let k = 0; k < 110; k++) STARS.push([kit.hash(k, 1) * W, kit.hash(k, 2) * H, 0.05 + 0.13 * kit.hash(k, 3) ** 2, kit.hash(k, 4) * TAU, kit.hash(k, 5)]);

function gear(alpha, n, rot1, n1, sp, col) {
  const R = n / 150, d = 30 / 150 + R;
  const c = alpha + Math.PI + (n1 * alpha - Math.PI) / n;
  return { x: d * Math.sin(alpha), y: d * Math.cos(alpha), R, n, sp, col, rot: -rot1 * n1 / n + c };
}

function arm(q, z, R, Rp, col) {
  const s = Math.sin(q), c = Math.cos(q), A = { q, s, c, z, R, Rp, col, shs: HS / (HS - z) };
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const P = [0, 0, 0];
  for (const [al, ac] of [[-0.22, -0.07], [-0.22, 0.07], [Rp + 0.02, -0.07], [Rp + 0.02, 0.07]]) {
    project(al * s + ac * c, al * c - ac * s, z, P);
    x0 = Math.min(x0, P[0]); x1 = Math.max(x1, P[0]); y0 = Math.min(y0, P[1]); y1 = Math.max(y1, P[1]);
  }
  A.bx0 = x0 - 2; A.bx1 = x1 + 2; A.by0 = y0 - 2; A.by1 = y1 + 2;
  return A;
}

function caster(o) {
  const s = HS / (HS - o.z), sx = o.x * s, sy = o.y * s;
  const toS = Math.hypot(o.x, o.y, HS - o.z), toP = Math.hypot(sx - o.x, sy - o.y, o.z);
  const reach = o.r * s * (1.2 + Math.hypot(sx, sy) / HS) + 0.05;
  return { x: o.x, y: o.y, z: o.z, r: o.r, sx, sy, reach2: reach * reach, pen: toP / toS };
}

/** A thin brass rod in screen space from a to b (world points). */
function rod(a, b, wd) {
  const A = project(...a, [0, 0, 0]), B = project(...b, [0, 0, 0]);
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0]) - wd - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0]) + wd + 1));
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1]) - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1]) + 1));
  for (let y = y0; y <= y1; y++) {
    const f = cl((y - A[1]) / ((B[1] - A[1]) || 1)), cx = A[0] + (B[0] - A[0]) * f, z = a[2] + (b[2] - a[2]) * f;
    const ext = cl((y - Math.min(A[1], B[1]) + 0.5)) * cl(Math.max(A[1], B[1]) - y + 0.5);
    for (let x = x0; x <= x1; x++) {
      const off = (x - cx) / wd, cov = cl(1 - Math.abs(off) + 0.5 / wd) * ext;
      if (cov <= 0) continue;
      const o = Math.max(-1, Math.min(1, off)), k = Math.sqrt(1 - o * o);
      const nx = cam.rx * o - cam.fx * k, ny = cam.ry * o - cam.fy * k, nl = Math.hypot(nx, ny) || 1;
      shade(a[0], a[1], z, nx / nl, ny / nl, 0, 30);
      const p = y * W + x;
      const r = BRc[0] * light.dif + light.spe, g = BRc[1] * light.dif + light.spe * 0.78, bb = BRc[2] * light.dif + light.spe * 0.42;
      img[3 * p] += (r - img[3 * p]) * cov; img[3 * p + 1] += (g - img[3 * p + 1]) * cov; img[3 * p + 2] += (bb - img[3 * p + 2]) * cov;
      mask[p] = 1;
    }
  }
}

export function scene(ctx) {
  const d = ctx.date, h = d.getHours(), m = d.getMinutes(), sec = d.getSeconds() + d.getMilliseconds() / 1000;
  const T = h * 3600 + m * 60 + sec;
  const h12 = h % 12, N = h12 || 12;

  // ---- the hour strike: N chime rings, each lighting the next hour stud
  const lit = new Float32Array(12), strikes = [];
  lit[h12] = 0.45;
  if (m === 0 && sec < 1.2) lit[(h12 + 11) % 12] = Math.max(lit[(h12 + 11) % 12], 0.45 * (1 - sm(0.2, 1.2, sec)));
  let flare = 0, show = 0;
  const tEnd = 0.6 + (N - 1) * 0.72 + 1.8, dur = tEnd + 1.6;
  if (m === 0 && sec < dur) {
    show = sec / dur;
    const fade = 1 - sm(tEnd, tEnd + 1.5, sec);
    for (let k = 1; k <= N; k++) {
      const tk = 0.6 + (k - 1) * 0.72, age = sec - tk;
      if (age < 0) continue;
      if (age < 1.6) strikes.push({ rc: 0.22 + 0.9 * kit.ease.out(age / 1.3), amp: 0.55 * (1 - age / 1.6) ** 0.6 * Math.min(1, age * 8) });
      flare += Math.exp(-age * 3.2);
      const on = sm(0.55, 0.72, age), flash = 1 + 0.9 * Math.exp(-Math.max(0, age - 0.65) * 2.5);
      lit[k % 12] = Math.max(lit[k % 12], on * flash * (k % 12 === h12 ? 1 : 0.85 * fade + 0.0) * (k % 12 === h12 ? 1 : 1));
    }
    lit[h12] = Math.max(lit[h12], 0.45);
  }
  flare = Math.min(1.2, flare);
  light.sun = (1 + 0.05 * (kit.noise2(T * 2.1, 3) - 0.5) + 0.03 * Math.sin(T * 9.7) + 0.35 * flare);

  // ---- camera: a slow breathing sway; on the hour a wide swing
  let yaw = 0.055 * Math.sin(TAU * T / 40), elev = E0 + 0.03 * Math.sin(TAU * T / 54);
  if (show > 0) { const e = Math.sin(Math.PI * show) ** 2; yaw -= (0.14 + 0.016 * N) * e; elev += 0.05 * e; }
  setCam(yaw, elev);

  // ---- the hands: minute steps on a damped spring, hour follows it
  const f = tick(sec), mPos = m - 1 + f;
  const qm = mPos * T60, qh = (h12 + mPos / 60) / 12 * TAU, qs = sec / 60 * TAU;
  const arms = [arm(qh, 0.05, 0.55, 0.77, STEEL), arm(qm, 0.088, 0.76, 1.02, BRc)];
  arms[0].tip = [0.45, 0.7, 1.0, 0.55];   // the hour hand: blued steel, a cool lume tip at the batons
  arms[1].tip = [1.0, 0.85, 0.55, 1.8];   // the minute hand: brass, a bright index over the minute track
  // the minute's landing: a glint runs up the minute arm to the lit tick
  arms[0].glint = 0; arms[1].glint = sec < 1.6 ? 1.1 * Math.sin(Math.PI * cl(sec / 1.6)) ** 2 : 0;
  arms[1].gpos = -0.1 + 1.1 * kit.ease.inOut(cl(sec / 1.5));
  const world = { kind: 'world', x: 0.55 * Math.sin(qh), y: 0.55 * Math.cos(qh), z: 0.2, r: 0.12, axis: AX_WORLD, spin: TAU * T / 24 };
  const moon = { kind: 'moon', x: world.x + 0.215 * Math.sin(qs), y: world.y + 0.215 * Math.cos(qs), z: world.z + 0.04 * Math.sin(qs + 1), r: 0.036, axis: AX_WORLD, spin: 0 };
  world.blocker = moon; moon.blocker = world;
  const giant = { kind: 'giant', x: 0.76 * Math.sin(qm), y: 0.76 * Math.cos(qm), z: 0.19, r: 0.08, axis: AX_GIANT, spin: TAU * T / 15, ring: true };
  const sun = { kind: 'sun', x: 0, y: 0, z: HS, r: RS };
  const gears = [
    { x: 0, y: 0, R: 0.2, n: 30, sp: 5, col: GILT, rot: qm },
    gear(-0.9, 13, qm, 30, 3, STEEL),
    gear(0.95, 18, qm, 30, 4, BRc),
  ];
  const ticks = [
    { q: m * T60, amp: sm(0.45, 1.0, sec) * (1 + 0.9 * Math.exp(-Math.max(0, sec - 1.0) * 1.6)) },
    { q: (m - 1) * T60, amp: 1 - sm(0.05, 0.8, sec) },
  ];
  const S = { arms, gears, strikes, lit, ticks, flare, casters: [caster(world), caster(moon), caster(giant)], spheres: [sun, world, moon, giant] };

  platePass(S, img, mask);
  rod([0, 0, 0.1], [0, 0, HS - RS * 0.6], 0.026 * cam.F / D_at(0, 0, 0.3));
  rod([world.x, world.y, 0.05], [world.x, world.y, world.z - world.r * 0.8], 0.6);
  rod([giant.x, giant.y, 0.088], [giant.x, giant.y, giant.z - giant.r * 0.8], 0.55);
  spherePass(S, img, mask, T);

  // ---- stars, only where the machine isn't
  const shift = yaw * cam.F * 0.8;
  for (const [sx, sy, lv, ph, hu] of STARS) {
    let x = (sx - shift) % W; if (x < 0) x += W;
    const tw = lv * (0.65 + 0.35 * Math.sin(T * (1.3 + hu) + ph));
    const xi = Math.floor(x), fx = x - xi, yi = Math.floor(sy);
    const col = hu < 0.2 ? [1, 0.75, 0.45] : hu > 0.75 ? [0.6, 0.75, 1] : [0.95, 0.92, 1];
    for (const [px, w] of [[xi, 1 - fx], [(xi + 1) % W, fx]]) {
      const p = yi * W + px;
      if (mask[p]) continue;
      img[3 * p] += col[0] * tw * w; img[3 * p + 1] += col[1] * tw * w; img[3 * p + 2] += col[2] * tw * w;
    }
  }
  kit.blitGrid(ctx, img, 1 - 0.55 * ctx.night);
}

function D_at(x, y, z) { return project(x, y, z, [0, 0, 0])[2]; }
