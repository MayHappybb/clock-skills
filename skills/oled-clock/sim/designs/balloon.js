// Twister — the time twisted out of long balloons, in real 3D.
//
// Every numeral is ONE long balloon, knot first, twisted into bubbles, the
// way a balloon artist makes a dog: a chain of twist points with a depth of
// their own (loops lean, strands cross in front of each other), ending in
// the limp nipple of the tail. Nothing is a sprite. Each bubble is a capsule
// ray-traced exactly every frame from a perspective eye into a depth buffer,
// with a barrel-shaped normal so it has its own glint and darkens into its
// twists; lit latex is grey, the glint solid, and a screen-space pass lights
// every silhouette and cuts a dark crease wherever a nearer bubble meets a
// farther one (a twist, or a strand passing in front).
//
// The minutes are air-filled and stand on the floor: they sway round (so
// they are seen to be round, the glints sliding), take turns to hop so one
// lands every second (crouch, stretch, squash, wobble), and every quarter
// minute lean together and bonk. The hours are helium, floating on curling
// ribbons tied to a little weight; a stray party balloon drifts up far
// behind now and then.
//
// The minute: the changing balloon lets its twists go, tail first, relaxes
// into a loose coil (its own length) that bounces and turns, then the coil
// springs into the new numeral and the twists snap back in bubble by bubble
// from the knot. The old shape is gone before :00 and the new one forms after.
//
// The hour: the old hours tug, slip their ribbons and fizz off round the
// glass, spinning and shrinking, puffs of air behind them; a bunch of party
// balloons rises from below carrying two limp balloons, which are blown up
// bubble by bubble from :00 into the new hours; the bunch lets go and sails
// off the top, and the new hours settle on their ribbons.
//
// Burn-in: everything moves; the room walks kit.orbit, the contact shadows
// are dashed with a phase that changes every minute. Night dims (ctx.night).
import { dither, clamp, ease, progress, clockFields, previousMinute, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ the camera and the light
// World coordinates are screen pixels on the plane z = 0, z going away from
// the viewer. The eye sits DZ in front of that plane, a little above the
// middle of the glass, so the floor is seen from slightly above.

const DZ = 170;
let EX = 64, EY = 14;
const L = norm3([-0.4, -0.62, -0.68]);          // towards the light: upper left, in front
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

// Per-canvas buffers: the ray through every pixel centre, depth, id, shade.
let RW = 0, RH = 0, RDX, RDY, RDZ, ZB, IDB, LVB;
function setup(w, h) {
  if (w === RW && h === RH) return;
  RW = w; RH = h;
  RDX = new Float32Array(w * h); RDY = new Float32Array(w * h); RDZ = new Float32Array(w * h);
  ZB = new Float32Array(w * h); IDB = new Int32Array(w * h); LVB = new Float32Array(w * h);
  EX = w / 2; EY = h * 0.22;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - EX, dy = y + 0.5 - EY, l = Math.hypot(dx, dy, DZ), i = y * w + x;
      RDX[i] = dx / l; RDY[i] = dy / l; RDZ[i] = DZ / l;
    }
}

/** Project a world point to the screen: [sx, sy, scale]. */
function project(x, y, z) {
  const k = DZ / (z + DZ);
  return [EX + (x - EX) * k, EY + (y - EY) * k, k];
}

// ------------------------------------------------------------ the ray tracer
// Everything solid is a capsule (a cylinder with hemispherical ends): a
// twisted balloon is a chain of them, end cap touching end cap at each
// twist. Each capsule is ray-traced exactly (Inigo Quilez's capsule
// intersection) inside its projected bounding box, into a depth buffer.

let CAPS = [], JOINTS = [];
function cap(a, b, r, id, mat = 0, bulge = 0.8, qoff = 0, lh = 0) { CAPS.push({ a, b, r, id, mat, bulge, qoff, lh }); }

function shade(nx, ny, nz, dx, dy, dz, mat, small) {
  const vx = -dx, vy = -dy, vz = -dz;
  const nl = nx * L[0] + ny * L[1] + nz * L[2];
  const hx = L[0] + vx, hy = L[1] + vy, hz = L[2] + vz, hl = Math.hypot(hx, hy, hz);
  const nh = (nx * hx + ny * hy + nz * hz) / hl;
  const nv = nx * vx + ny * vy + nz * vz;
  if (mat === 1) return 1;
  // Glossy latex, mostly dark: a black body, a lit crescent along the rim
  // on the side facing the light, the outline all round, and one bold glint
  // per bubble: no grey at all. (Small balloons, the hours, are shaded solid: at their
  // size an outline would close up.)
  const wrap = (nl + 0.35) / 1.35;
  if (small) return wrap > 0.45 ? 1 : wrap > 0.22 ? 0.5 : 0;
  if (nh > 0.89) return 1;                                   // the glint
  if (nh > 0.82) return 0;                                   // kept clear of the rim
  if (nv < 0.62 && wrap > 0.48) return 1;                    // the lit crescent along the rim
  return 0;
}

function raster(c) {
  const [ax, ay, az] = c.a; let [bx, by, bz] = c.b; const r = c.r;
  if (Math.abs(bx - ax) + Math.abs(by - ay) + Math.abs(bz - az) < 1e-4) bx += 1e-3;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = EX - ax, oay = EY - ay, oaz = -DZ - az;
  const obx = EX - bx, oby = EY - by, obz = -DZ - bz;
  const baba = bax * bax + bay * bay + baz * baz, baoa = bax * oax + bay * oay + baz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz, obob = obx * obx + oby * oby + obz * obz;
  const cc = baba * oaoa - baoa * baoa - r * r * baba, r2 = r * r;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2, bl = Math.sqrt(baba);
  const ux = bax / bl, uy = bay / bl, uz = baz / bl, lh = c.lh || bl / 2 + r, qoff = c.qoff;
  const pa = project(ax, ay, az), pb = project(bx, by, bz);
  const ra = r * Math.max(pa[2], pb[2]) + 1.2;
  const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0]) - ra)), x1 = Math.min(RW - 1, Math.ceil(Math.max(pa[0], pb[0]) + ra));
  const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1]) - ra)), y1 = Math.min(RH - 1, Math.ceil(Math.max(pa[1], pb[1]) + ra));
  for (let y = y0; y <= y1; y++) {
    let i = y * RW + x0;
    for (let x = x0; x <= x1; x++, i++) {
      const dx = RDX[i], dy = RDY[i], dz = RDZ[i];
      const bard = bax * dx + bay * dy + baz * dz, rdoa = dx * oax + dy * oay + dz * oaz;
      const A = baba - bard * bard, B = baba * rdoa - baoa * bard;
      let h = B * B - A * cc;
      if (h < 0) continue;
      let t = (-B - Math.sqrt(h)) / A;
      const yy = baoa + t * bard;
      let nx, ny, nz;
      if (yy > 0 && yy < baba) {
        if (t >= ZB[i]) continue;
      } else {
        const end = yy <= 0;
        const ox = end ? oax : obx, oy = end ? oay : oby, oz = end ? oaz : obz;
        const b2 = dx * ox + dy * oy + dz * oz;
        h = b2 * b2 - ((end ? oaoa : obob) - r2);
        if (h <= 0) continue;
        t = -b2 - Math.sqrt(h);
        if (t >= ZB[i]) continue;
      }
      // The normal of a bubble, not of a cylinder: radial, tipped along the
      // axis by how far from the bubble's middle the point is (a barrel), so
      // each bubble has its own glint and darkens into its twists.
      const qx = EX + t * dx - mx, qy = EY + t * dy - my, qz = -DZ + t * dz - mz;
      const q = qx * ux + qy * uy + qz * uz;
      const k = (c.bulge * (q + qoff)) / lh;
      nx = (qx - q * ux) / r + ux * k; ny = (qy - q * uy) / r + uy * k; nz = (qz - q * uz) / r + uz * k;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      ZB[i] = t; IDB[i] = c.id;
      LVB[i] = shade(nx, ny, nz, dx, dy, dz, c.mat, r < 2.9);
    }
  }
}

let atJoint = () => false;

/** Trace every capsule queued, and write the result over what g already holds. */
function flush(g) {
  setup(g.width, g.height);
  ZB.fill(Infinity); IDB.fill(-1);
  for (const c of CAPS) raster(c);
  CAPS = [];
  const J = JOINTS;
  JOINTS = [];
  atJoint = (x, y, b) => {
    for (let q = 0; q < J.length; q += 4)
      if (J[q + 3] === b && (x + 0.5 - J[q]) ** 2 + (y + 0.5 - J[q + 1]) ** 2 < J[q + 2]) return true;
    return false;
  };
  const buf = g.buf, w = RW, h = RH;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, id = IDB[i];
      if (id < 0) continue;
      const z = ZB[i] - 0.15, zf = ZB[i] + 0.15;
      // Each neighbour: background or a farther piece makes this pixel the
      // silhouette (lit: a glossy outline). A nearer bubble of the SAME
      // balloon, at one of its twist points, makes it a crease (dark): so
      // the twists pinch, while strands that merely pass in front of one
      // another are told apart by the front one's lit outline alone.
      let crease = false, edge = false;
      const look = (j) => {
        const o = IDB[j];
        if (o < 0) edge = true;
        else if (o !== id) {
          if (ZB[j] < z) { if (o >> 8 === id >> 8 && atJoint(x, y, id >> 8)) crease = true; }
          else if (ZB[j] > zf) edge = true;
        }
      };
      if (x > 0) look(i - 1); else edge = true;
      if (x < w - 1) look(i + 1); else edge = true;
      if (y > 0) look(i - w); else edge = true;
      if (y < h - 1) look(i + w); else edge = true;
      if (crease) { buf[i] = 0; continue; }
      if (edge) { buf[i] = 1; continue; }
      const lv = LVB[i];
      buf[i] = lv >= 1 || dither(x, y, lv) ? 1 : 0;
    }
}

// ------------------------------------------------------------ the numerals
// Each numeral is ONE long balloon, knot first, twisted into bubbles: a
// chain of twist points in a 10 x 16 box (y down), with a depth of its own,
// so loops lean and strands cross in front of each other. A closed figure
// ends with a lock twist back into one of its own points.

const SPEC = {
  0: [[5, 14.6, 0], [8.5, 11.4, 1.2], [8.5, 4.6, 1.2], [5, 1.4, 0], [1.5, 4.6, -1.2], [1.5, 11.4, -1.2], [5, 14.6, 0]],
  1: [[1.6, 4.6, -1.2], [5.8, 1.4, 0], [5.8, 8, 0.4], [5.8, 14.6, 0]],
  2: [[1.5, 4.6, -1], [5, 1.4, 0], [8.5, 4.8, 1], [1.5, 14.6, -0.6], [8.6, 14.6, 1]],
  3: [[1.4, 1.4, -1], [8.6, 1.4, 1], [4.4, 7, -0.4], [8.6, 10.4, 1], [5, 14.6, 0], [1.4, 12.6, -1]],
  4: [[7, 14.6, 0.4], [7, 10.6, 0.4], [7, 1.4, 0.4], [1.4, 10.6, -0.4], [9, 10.6, -1.6]],
  5: [[8.6, 1.4, 1], [2.2, 1.4, -1], [1.8, 7.2, -1], [6.2, 6.6, 0.4], [8.6, 10.4, 1], [5.4, 14.6, 0], [1.4, 12.8, -1]],
  6: [[8.2, 1.4, 1], [3.4, 4, -0.4], [1.2, 9.4, -1], [2.4, 14, -0.4], [6.4, 14.9, 0.4], [9, 11.4, 1], [7.4, 7.2, 0.6], [3.2, 7.2, -0.4], [1.2, 9.4, -1]],
  7: [[1.4, 1.4, -1], [8.6, 1.4, 1], [4.2, 14.6, 0]],
  8: [[5, 7.4, 1.6], [8.7, 4.3, 0.6], [5, 1.2, 0], [1.3, 4.3, -0.6], [5, 7.4, -1.6], [9.4, 11.1, -0.6], [5, 14.8, 0], [0.6, 11.1, 0.6], [5, 7.4, 1.6]],
};
SPEC[9] = SPEC[6].map(([x, y, z]) => [10 - x, 16 - y, -z]);

const DIGIT = {};
for (let d = 0; d <= 9; d++) {
  const p = SPEC[d], cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]));
  const len = cum[cum.length - 1];
  DIGIT[d] = { p, s: cum.map((c) => c / len), len };
}

/** A point on numeral d's centre-line at normalised arc length s, in box units. */
function pathAt(D, s) {
  const S = D.s, P = D.p;
  if (s <= 0) return P[0];
  if (s >= 1) return P[P.length - 1];
  let i = 1;
  while (S[i] < s) i++;
  const u = (s - S[i - 1]) / (S[i] - S[i - 1]), a = P[i - 1], b = P[i];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

// Between two numerals the balloon is let go into a loose coil, a spring
// standing in the box, which turns. Its length is the balloon's.
const COIL_R = 2.7, COIL_H = 11;
function coilAt(s, len, phase) {
  const n = Math.sqrt(Math.max(1, len * len - COIL_H * COIL_H)) / (TAU * COIL_R);
  const th = TAU * n * (s - 0.5) + phase;
  return [5 + COIL_R * Math.sin(th), 8.6 + COIL_H * (0.5 - s), COIL_R * Math.cos(th)];
}

const RU = 1.4;    // the tube's radius, in box units
const TW = 0.95;   // how far a twist pinches the bubbles back from their joint, in radii
const NS = 3;      // capsules per bubble while the balloon bends

/**
 * Queue one balloon. `shape(s)` gives a box-unit point at arc length s
 * (0 the knot, 1 the tail), `joints` the arc lengths of its twists, `k(i)` how
 * tightly joint i is twisted (0 a smooth tube, 1 a full twist), `xf` maps box
 * units to the world, `r` is the radius in px, `sub` the capsules per bubble.
 */
function balloon(shape, joints, k, xf, r, bid, sub = 1, grow = 1) {
  let group = 0;
  const nb = joints.length - 1;
  const idBase = bid << 8;
  // Register every twist point (on screen), so creases are cut only there.
  for (let i = 0; i <= nb; i++) {
    if (joints[i] > grow) break;
    const P = xf(shape(joints[i])), [sx, sy, sk] = project(P[0], P[1], P[2]);
    JOINTS.push(sx, sy, (r * sk * 1.25) ** 2, bid);
  }
  // The knot at the mouth, and the uninflated nipple at the far end.
  {
    const a = xf(shape(0)), b = xf(shape(0.02));
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2], l = Math.hypot(dx, dy, dz) || 1;
    const e = r * 0.2;
    cap([a[0] + (dx / l) * e, a[1] + (dy / l) * e, a[2] + (dz / l) * e], [a[0] + (dx / l) * e * 2.5, a[1] + (dy / l) * e * 2.5, a[2] + (dz / l) * e * 2.5], Math.max(0.8, r * 0.36), idBase + 50, 1, 0);
    if (grow >= 1) {
      const c = xf(shape(1)), d = xf(shape(0.98));
      const fx = c[0] - d[0], fy = c[1] - d[1], fz = c[2] - d[2], m = Math.hypot(fx, fy, fz) || 1;
      cap([c[0], c[1], c[2]], [c[0] + (fx / m) * r * 1.5, c[1] + (fy / m) * r * 1.5, c[2] + (fz / m) * r * 1.5], Math.max(0.6, r * 0.2), idBase + 51, 1, 0);
    }
  }
  for (let i = 0; i < nb; i++) {
    const s0 = joints[i], s1 = joints[i + 1];
    if (s0 >= grow) {
      // Not yet inflated: the rest of the balloon, a thin limp tube.
      const a = xf(shape(s0)), b = xf(shape(s1));
      cap(a, b, Math.max(0.7, r * 0.22), idBase + 40, 1, 0);
      continue;
    }
    const pts = [];
    for (let j = 0; j <= sub; j++) pts.push(xf(shape(Math.min(grow, s0 + ((s1 - s0) * j) / sub))));
    let bl = 0;
    const seg = [];
    for (let j = 0; j < sub; j++) { const l = Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1], pts[j + 1][2] - pts[j][2]); seg.push(l); bl += l; }
    const ka = i === 0 ? 1 : k(i), kb = i === nb - 1 || s1 > grow ? 1 : k(i + 1);
    if (s1 > grow) { const a = xf(shape(grow)), b = xf(shape(s1)); cap(a, b, Math.max(0.7, r * 0.22), idBase + 40, 1, 0); }
    if (i > 0 && ka > 0.5) group++;
    const lh = bl / 2 + r * (1 - TW * 0.5 * (ka + kb));
    const bulge = 0.85 * Math.min(ka, kb) ** 0.5;
    let acc = 0;
    for (let j = 0; j < sub; j++) {
      const a = pts[j], b = pts[j + 1], l = seg[j] || 1e-6;
      const dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, dz = (b[2] - a[2]) / l;
      const ea = j === 0 ? TW * Math.min(r, bl / 2) * ka : 0, eb = j === sub - 1 ? TW * Math.min(r, bl / 2) * kb : 0;
      const A = [a[0] + dx * ea, a[1] + dy * ea, a[2] + dz * ea], B = [b[0] - dx * eb, b[1] - dy * eb, b[2] - dz * eb];
      const qoff = acc + (ea + l - eb) / 2 - bl / 2;
      cap(A, B, r, idBase + group, 0, bulge, qoff, lh);
      acc += l;
    }
  }
}

/** Box units -> world: foot-centre (x, y, z), scale s, yaw about the vertical, roll, squash sy. */
function placer({ x, y, z = 0, s, yaw = 0, roll = 0, sy = 1, cx = 5, cyb = 16 }) {
  const cy = Math.cos(yaw), sn = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const sx = 1 / Math.sqrt(sy);
  return ([u, v, w]) => {
    const lx0 = (u - cx) * s * sx, ly0 = (v - cyb) * s * sy, lz = w * s * sx;
    const lx = lx0 * cr - ly0 * sr, ly = lx0 * sr + ly0 * cr;
    return [x + lx * cy + lz * sn, y + ly, z - lx * sn + lz * cy];
  };
}

function digitAt(d, opts, idBase) {
  const D = DIGIT[d];
  balloon((s) => pathAt(D, s), D.s, () => 1, placer(opts), RU * opts.s, idBase);
}

// ------------------------------------------------------------ motion helpers

const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
/** Step response of a damped spring, 0 -> 1 from rest, overshooting. */
function spring(t, zeta = 0.45, w = 11) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}
const digits2 = (n) => [Math.floor(n / 10), n % 10];

// ------------------------------------------------------------ the scene

const FY = 59;                    // the floor
const MS = 2.4, MX = [84, 111];   // the minutes: air-filled, standing on the floor
const HS = 1.55, HX = [17, 36], HY = 30, HZ = 8;   // the hours: helium, on ribbons
const ANCHOR = [27, FY - 4];          // where the ribbons are tied

/**
 * An idle minute balloon: it sways round (so it is seen to be round) and hops
 * once every two seconds, the two taking turns, so one lands every second:
 * crouch, stretch in the air, squash on landing and wobble.
 */
function hop(sec, k) {
  const p = (sec + k) % 2;
  const UP = 0.16, AIR = 0.5;
  let lift = 0, sy = 1;
  if (p < UP) { sy = 1 - 0.13 * Math.sin((Math.PI / 2) * (p / UP)); }
  else if (p < UP + AIR) {
    const u = (p - UP) / AIR;
    lift = 6 * 4 * u * (1 - u);
    sy = 1 + 0.08 * Math.sin(Math.PI * u) - 0.13 * (1 - u) ** 4;
  } else {
    const q = p - UP - AIR;
    sy = 1 - 0.16 * Math.exp(-q * 6) * Math.sin(q * 19);
  }
  return { lift, sy };
}

// The minute: the balloon lets go of its twists and springs into a coil
// (its old shape straightening tail first), the coil turns and bounces,
// then it is twisted again, knot first, bubble by bubble, into the new
// numeral, each bubble snapping round on a spring.
const UN0 = -1.5, UN1 = -0.15, RE0 = 0.05, RE1 = 1.5, M_END = 2.4;
function turning(was, now, tau) {
  const A = DIGIT[was], B = DIGIT[now];
  const len = A.len + (B.len - A.len) * smooth(progress(tau, -0.5, 0.4));
  const phase = 2.6 * Math.PI * ease.inOutCubic(progress(tau, UN0, RE1));
  const coil = (s) => coilAt(s, len, phase);
  if (tau < RE0) {
    // The twists let go one after another from the tail, then the shape
    // relaxes, nearly all at once (a staggered shape would pass through
    // other numerals on its way).
    const w = (s) => ease.inOutCubic(progress(tau, UN0 + 0.45 + 0.12 * (1 - s), UN1 - 0.12 * s));
    return {
      shape: (s) => { const a = pathAt(A, s), c = coil(s), u = w(s); return [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, a[2] + (c[2] - a[2]) * u]; },
      joints: A.s, k: (i) => 1 - smooth(progress(tau, UN0 + 0.5 * (1 - A.s[i]), UN0 + 0.5 * (1 - A.s[i]) + 0.2)),
    };
  }
  // The coil springs into the new shape; the twists snap in bubble by bubble from the knot.
  const w = (s) => spring(tau - RE0 - 0.15 * s, 0.55, 10);
  return {
    shape: (s) => { const b = pathAt(B, s), c = coil(s), u = w(s); return [c[0] + (b[0] - c[0]) * u, c[1] + (b[1] - c[1]) * u, c[2] + (b[2] - c[2]) * u]; },
    joints: B.s, k: (i) => smooth(progress(tau, RE0 + 0.2 + 0.75 * B.s[i], RE0 + 0.32 + 0.75 * B.s[i])),
  };
}

/**
 * Every quarter minute the two minute balloons lean together and bonk:
 * both squash at the touch and wobble apart. Returns the lean and squash.
 */
function bump(sec) {
  const bp = (sec % 15) - 6.8;
  if (bp < 0 || bp > 1.6 || sec > 50) return null;
  const C = 0.32;
  if (bp < C) return { lean: 0.15 * Math.sin((Math.PI / 2) * (bp / C)), sq: 0 };
  const q = bp - C;
  return { lean: 0.15 * Math.exp(-q * 5) * Math.cos(q * 13), sq: 0.13 * Math.exp(-q * 7) * Math.sin(q * 21) };
}

function minuteBalloon(k, d, T, sec, tau, change, id) {
  let { lift, sy } = hop(sec, k);
  const yaw = 0.42 * Math.sin((TAU * T) / 5.3 + k * 2.1);
  let roll = 0.05 * Math.sin((TAU * T) / 3.7 + k);
  const bk = bump(sec);
  if (bk) {
    lift *= 0.3;
    roll += (k ? -1 : 1) * bk.lean;
    sy -= bk.sq;
  }
  const opts = { x: MX[k], y: FY, z: 0, s: MS, yaw, roll, sy };
  if (change && tau > UN0 && tau < M_END) {
    // The coil bounces once, high, as the twists let go.
    const b = progress(tau, -0.55, 0.55);
    lift = 12 * 4 * b * (1 - b);
    opts.sy = 1 + 0.12 * Math.sin(Math.PI * b) - 0.15 * Math.exp(-Math.max(0, tau - 0.55) * 6) * Math.sin(Math.max(0, tau - 0.55) * 19);
    const tr = turning(change[0], change[1], tau);
    opts.y = FY - lift;
    balloon(tr.shape, tr.joints, tr.k, placer(opts), RU * MS, id, NS);
    return { x: MX[k], lift };
  }
  opts.y = FY - lift;
  digitAt(d, opts, id);
  return { x: MX[k], lift };
}

/** A contact line on the floor under something `lift` px up: it narrows as it rises. */
function shadow(g, x, z, lift, rx, ph) {
  const [sx, sy, sk] = project(x, FY + 2, z);
  const a = (rx * sk) / (1 + lift / 10), y = Math.round(sy);
  for (let xx = Math.round(sx - a); xx <= Math.round(sx + a); xx++) if ((xx + ph) % 2 === 0 || Math.abs(xx - sx) < a * 0.35) g.pixel(xx, y, 1);
}

/** A ribbon from the floor knot up to (x, y) on a balloon, curling and swaying. */
function ribbon(g, ax, ay, bx, by, T, ph, slack = 0) {
  let px = ax, py = ay;
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    const sway = Math.sin(Math.PI * u) * (2.2 * Math.sin(T * 1.7 + ph) + slack * 6);
    const curl = 0.9 * Math.sin(u * 15 - T * 4 + ph) * Math.sin(Math.PI * u);
    const x = ax + (bx - ax) * u + sway + curl, y = ay + (by - ay) * u + slack * 8 * Math.sin(Math.PI * u);
    g.line(Math.round(px), Math.round(py), Math.round(x), Math.round(y));
    px = x; py = y;
  }
}

// ------------------------------------------------------------ the hour
// The old hours are let go: knots open, they fizz off round the glass,
// spinning and shrinking, and a bunch of party balloons rises through the
// room. From :00 the new hours are blown up at the ribbons' knot (a limp
// tube inflating bubble by bubble from its knot) and float up to their place.

const H_GO = -0.8, H_INF = 0.0, H_UP = 0.65, H_END = 5.5;

/** Where a let-go balloon is, u = 0..1 of its flight: a wild loop up and off. */
function fizzPath(k, u) {
  const sgn = k ? 1 : -1;
  const x = HX[k] + sgn * 20 * Math.sin(u * 7.5) * u + 50 * u * u * (k ? 1.4 : 0.6);
  const y = HY - 8 * Math.sin(u * 11 + k) * u - 70 * u * u;
  return [x, y];
}

// The bunch that brings the new hours: five party balloons on strings
// gathered to one knot, which carries the limp new balloons up from below.
const BUNCH = [[-6, -6, 6, 5.4], [6, -7, -4, 5.6], [0, -15, 10, 5.2], [-12, -15, -6, 4.8], [12, -16, 14, 5]];
const B_IN = -1.0, B_AT = 1.5, B_OFF = 3.4;
/** The bunch's gathered knot at time tau (screen-plane coordinates, z = HZ). */
function bunchKnot(tau) {
  const u = ease.outCubic(progress(tau, B_IN, 0.4));
  const x = 27 + 2.5 * Math.sin(tau * 2.3) + 8 * (1 - u) * Math.sin(tau * 3);
  const y = 100 + (25 - 100) * u + 1.5 * Math.sin(tau * 3.1) - 100 * ease.inQuad(progress(tau, B_AT + 0.1, B_OFF));
  return [x, y];
}

/** One round party balloon at (x, y, z): an egg of latex, its knot, and its string down to (kx, ky). */
function partyBalloon(g, x, y, z, r, kx, ky, T, ph, id) {
  cap([x, y - r * 0.3, z], [x, y + r * 0.2, z], r, id << 8, 0, 0.85, 0, r * 1.3);
  cap([x, y + r * 1.05, z], [x, y + r * 1.3, z], Math.max(0.9, r * 0.2), (id << 8) + 1, 1, 0);
  const [sx, sy, sk] = project(x, y + r * 1.35, z);
  if (kx === null) { kx = sx; ky = sy + 22 * sk; }
  let px = sx, py = sy;
  for (let i = 1; i <= 10; i++) {
    const u = i / 10;
    const nx = sx + (kx - sx) * u + 1.2 * Math.sin(u * 6 + T * 5 + ph) * Math.sin(Math.PI * u), ny = sy + (ky - sy) * u;
    g.line(Math.round(px), Math.round(py), Math.round(nx), Math.round(ny));
    px = nx; py = ny;
  }
}

/** For review (out/balloon-digits.png): the ten numerals at minute and hour size. */
export function specimen(g, t = 0) {
  for (let d = 0; d <= 9; d++) {
    const row = Math.floor(d / 5), col = d % 5;
    digitAt(d, { x: 17 + col * 33, y: 4 + 44 * (row + 1), s: MS, yaw: 0.35 * Math.sin(t * 1.3 + d) }, d * 64);
    digitAt(d, { x: 9 + d * 16.5, y: 122, s: HS, yaw: 0.35 * Math.sin(t * 1.3 + d) }, 1000 + d * 64);
  }
  flush(g);
}

export default {
  name: 'Twister',
  blurb: 'The time twisted out of long balloons in real 3D: the minutes hop and bonk on the floor, the hours float on ribbons; each minute a balloon lets its twists go, springs into a coil and is twisted bubble by bubble into the next; on the hour the old hours fizz off round the room and a bunch of party balloons carries in the new.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    const T = date.getTime() / 1000, sec = f.sec;   // absolute: no phase jumps at the hour
    ANCHOR[0] = 27 + 3 * Math.sin((TAU * T) / 97);   // the weight is nudged about the floor by the tugging
    const late = sec >= 55;
    const nxt = clockFields(new Date(date.getTime() + 60000)), prv = previousMinute(date);
    const tau = late ? sec - 60 : sec;
    const from = late ? f : prv, to = late ? nxt : f;
    const mA = digits2(from.m), mB = digits2(to.m), mNow = digits2(f.m);

    // Hours, floating on their ribbons.
    const hour = to.m === 0 && tau >= H_GO - 0.6 && tau < H_END;
    const hA = digits2(from.h), hB = digits2(to.h), hNow = digits2(f.h);
    for (let k = 0; k < 2; k++) {
      const bob = 1.6 * Math.sin((TAU * T) / 3.3 + k * 1.4);
      let x = HX[k] + 1.4 * Math.sin((TAU * T) / 6.1 + k), y = HY + bob, z = HZ, sc = HS, r = RU * HS;
      let yaw = 0.5 * Math.sin((TAU * T) / 7 + k * 2), roll = 0.07 * Math.sin((TAU * T) / 4.1 + k * 2);
      let d = hNow[k], grow = 1, tie = 1;
      if (hour && tau < H_INF) {
        // Let go: a tug, then off, fizzing.
        d = hA[k];
        const u = progress(tau, H_GO + 0.08 * k, H_INF - 0.05);
        const tug = Math.sin(Math.PI * progress(tau, H_GO - 0.5, H_GO)) * 2.5;
        const [fx, fy] = fizzPath(k, ease.inQuad(u));
        x = fx; y = fy + tug; z = HZ - 20 * u;
        yaw += 9 * u * u * (k ? 1 : -1); roll += 3 * Math.sin(u * 9) * u;
        sc = HS * (1 - 0.55 * u); r = RU * sc * (1 - 0.4 * u);
        tie = 1 - smooth(progress(tau, H_GO, H_GO + 0.25));
        // the fizz: puffs of air out of the open knot
        if (u > 0) for (let j = 1; j <= 3; j++) {
          const [qx, qy] = fizzPath(k, ease.inQuad(Math.max(0, u - j * 0.05)));
          const [px, py] = project(qx + 3, qy + 2, z + 4 * j);
          g.circle(px, py, 0.6 + j * 0.7);
        }
      } else if (hour) {
        // Carried in under the bunch, limp, blown up from :00 bubble by
        // bubble, and once the bunch lets go it floats on its own ribbon.
        const t = tau - H_INF - 0.12 * k;
        grow = clamp(t / H_UP, 0.03, 1);
        const [kx, ky] = bunchKnot(tau);
        const hang = [kx - 8 + k * 16, ky + 31];
        const free = spring(tau - B_AT - 0.2, 0.35, 6);
        x = hang[0] + (x - hang[0]) * free; y = hang[1] + (y - hang[1]) * free;
        yaw = yaw * free + (1 - free) * 0.6 * Math.sin(tau * 4 + k);
        sc = HS * (0.75 + 0.25 * smooth(grow * 1.3));
        r = RU * sc * (0.4 + 0.6 * smooth(grow));
        tie = smooth(progress(tau, B_AT - 0.2, B_AT + 0.6));
        if (tau < B_AT + 0.4) {
          // its string to the bunch's knot
          const [sx2, sy2] = project(x, y - 16 * sc, z);
          g.line(Math.round(sx2), Math.round(sy2), Math.round(kx), Math.round(ky));
        }
      }
      const xf = placer({ x, y, z, s: sc, yaw, roll });
      const D = DIGIT[d];
      // the ribbon is tied round the lowest point of the numeral
      let lo = D.p[0];
      for (const p of D.p) if (p[1] > lo[1]) lo = p;
      const [wx, wy, wz] = xf(lo);
      const [sx, sy] = project(wx, wy + r, wz);
      if (tie > 0.01) ribbon(g, ANCHOR[0] + k * 2 - 1, ANCHOR[1], ANCHOR[0] + (sx - ANCHOR[0]) * tie, ANCHOR[1] + (sy - ANCHOR[1]) * tie, T, k * 2.3, 1 - tie);
      balloon((s) => pathAt(D, s), D.s, () => 1, xf, r, 600 + k * 64, grow < 1 ? 2 : 1, grow);
    }
    // The ribbons' weight: a little ball on the floor, tugged as the hours bob.
    {
      const tug = 0.6 * Math.sin((TAU * T) / 3.3 + 0.7);
      cap([ANCHOR[0], FY - 2.6 - Math.max(0, tug), 4], [ANCHOR[0], FY - 2.4 - Math.max(0, tug), 4], 2.6, 990 << 8, 0, 0);
      shadow(g, ANCHOR[0], 4, 0, 3, f.minuteKey);
    }
    if (hour && tau > B_IN && tau < B_OFF) {
      const [kx, ky] = bunchKnot(tau);
      BUNCH.forEach(([bx, by, bz, br], i) => {
        const x = kx + bx + 1.5 * Math.sin(T * 2.2 + i * 1.7), y = ky + by - 8 + 1.2 * Math.sin(T * 2.9 + i);
        partyBalloon(g, x, y, HZ + bz, br, kx, ky, T, i, 900 + i * 4);
      });
    }

    // Far behind, now and then, a stray party balloon drifts up through the room.
    {
      const P = 23, c = Math.floor(T / P), u = (T % P) / P;
      const hx = ((c * 2654435761) >>> 0) / 4294967296;
      const x = 18 + hx * 92 + 6 * Math.sin(u * 9 + c), y = 96 - u * 150;
      partyBalloon(g, x, y, 110, 6, null, null, T, c, 980);
    }

    for (let k = 0; k < 2; k++) {
      const change = mA[k] !== mB[k] ? [mA[k], mB[k]] : null;
      const r = minuteBalloon(k, mNow[k], T, sec, tau, change, k * 64);
      shadow(g, r.x, 0, r.lift, 11, f.minuteKey);
    }
    flush(g);
    // Burn-in: the whole room walks a small square every few minutes.
    const [ox, oy] = orbit(date, 2, 4);
    g.shift(ox, oy);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
