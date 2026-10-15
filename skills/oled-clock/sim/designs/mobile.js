// Mobile — a Calder mobile whose hanging blocks are the time.
//
// Wire arms balanced at pivots hang from one thread at the top of the glass:
// a long, light arm carries the hours, a short, heavy one the minutes, and a
// rotor of two discs turns once a minute below. Each numeral is a solid block
// carved the way Hofstadter's GEB block is: the intersection of one numeral
// plate extruded through the depth and the NEXT numeral extruded sideways.
// Face on it reads as the time; turned a quarter turn on its thread it reads
// as the next. Nothing is swapped: the minute turn is the block physically
// turning, the old face going into shade and the new one catching the lamp.
// Once it is round (and only then, when the hidden profile is exactly edge
// on and cannot be seen) its hidden side is re-cut for the minute after.
//
// The letterforms are cut-outs of Calder's own vocabulary: bellied blades,
// crescents with pointed tips, pierced discs, a triangular sail; each set of
// ten is cut at two sizes, the minute plates larger.
//
// Always: every block sways on its thread (sub-pixel, two periods), every
// arm drifts in yaw, which moves the blocks in depth (perspective), the rotor
// turns. A minute: the thread winds up the other way for a second, lets go,
// the block swings a quarter turn on a damped spring with overshoot, the arm
// it hangs from twists back in reaction, and because the re-cut block weighs
// differently (mass = the carved volume) the arms tip to a new balance with
// a slow damped swing. The hour: a gust swings the top arm through the
// depth (hours rush at the eye and fall back), spins the minute arm round,
// sets the rotor whirling; the changed blocks still turn as on any minute.
//
// Burn-in: everything moves; the pivot drifts a few px over half an hour.
// 23:00-07:00 the panel dims (ctx.night).

import { dither, clamp, segDist } from '../js/kit.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const W = 128, H = 64;

// ------------------------------------------------------------ letterforms
// Each numeral is a cut-out on a 10 x 16 unit card: bellied strokes that
// end in Calder's discs, pierced ovals, a triangular sail. Strokes are
// Catmull-Rom splines through [x, y, radius] knots, unioned as tapered
// capsules; `neg` shapes are holes cut through the plate.

const S = (...p) => ({ t: 's', p });
const E = (x, y, rx, ry, a = 0) => ({ t: 'e', x, y, rx, ry, a });
const P = (r, ...v) => ({ t: 'p', r, v });

const GLYPHS = [
  /* 0 */ { pos: [E(5, 8, 4.9, 7.95)], neg: [E(5.75, 7.0, 1.7, 4.9, 0.2)] },
  /* 1 */ { pos: [S([6.7, 0.15, 0.35], [6.45, 2.6, 1.0], [6.0, 7.0, 1.7], [5.6, 11.4, 2.0], [5.3, 14.0, 1.4]),
                  S([6.4, 0.7, 0.6], [4.6, 2.3, 0.75], [3.0, 3.4, 0.4]),
                  E(5.1, 15.15, 2.3, 0.8, -0.08)], neg: [] },
  /* 2 */ { pos: [E(1.95, 3.75, 1.9, 1.9),
                  S([3.2, 1.5, 0.3], [5.2, 0.6, 0.85], [8.0, 1.6, 1.3], [8.6, 4.6, 1.6], [6.6, 8.6, 1.45], [3.4, 12.2, 1.1], [1.4, 14.6, 0.8]),
                  S([1.0, 14.8, 1.05], [4.0, 14.6, 1.35], [7.2, 14.9, 0.95], [9.8, 15.3, 0.3])], neg: [] },
  /* 3 */ { pos: [S([0.7, 1.9, 0.35], [3.6, 0.5, 0.9], [7.0, 1.2, 1.4], [7.6, 4.0, 1.4], [5.4, 6.8, 0.8], [3.4, 7.4, 0.4]),
                  S([3.6, 7.3, 0.4], [7.0, 8.0, 1.3], [8.9, 11.4, 1.8], [7.6, 14.5, 1.5], [4.4, 15.5, 1.0], [0.7, 14.4, 0.35])], neg: [] },
  /* 4 */ { pos: [P(0.35, [7.0, 0.3], [0.4, 10.8], [9.6, 10.8]),
                  S([7.3, 3.0, 1.0], [7.3, 10.0, 1.35], [7.0, 15.7, 0.55])],
            neg: [P(0, [6.1, 3.9], [2.7, 9.4], [6.1, 9.4])] },
  /* 5 */ { pos: [S([2.8, 1.2, 1.0], [5.8, 0.6, 1.1], [9.8, 0.25, 0.3]),
                  S([2.8, 1.2, 1.0], [2.6, 4.4, 0.8], [2.4, 7.0, 0.7]),
                  S([2.4, 7.0, 0.6], [5.4, 6.0, 1.3], [8.6, 8.6, 1.8], [8.6, 12.6, 1.8], [5.6, 15.3, 1.3], [2.4, 15.0, 0.7], [0.6, 13.4, 0.3])], neg: [] },
  /* 6 */ { pos: [E(5.2, 11.0, 4.75, 4.9),
                  S([1.1, 10.0, 1.6], [1.6, 5.6, 1.4], [4.0, 2.0, 1.0], [7.0, 0.6, 0.6], [9.6, 0.4, 0.25])],
            neg: [E(5.5, 11.2, 1.95, 2.1, 0.3)] },
  /* 7 */ { pos: [S([0.4, 1.6, 0.3], [3.0, 0.8, 0.9], [6.5, 0.8, 1.3], [9.3, 1.2, 1.3]),
                  S([9.3, 1.2, 1.3], [7.8, 5.0, 1.6], [6.0, 9.5, 1.9], [4.6, 13.5, 1.4], [4.0, 15.8, 0.35])], neg: [] },
  /* 8 */ { pos: [E(5.2, 3.9, 3.5, 3.7, -0.1), E(4.9, 11.7, 4.7, 4.3, 0.05)],
            neg: [E(5.3, 3.9, 1.25, 1.5), E(4.8, 11.8, 1.7, 1.65)] },
  /* 9 */ { pos: [E(4.8, 5.0, 4.75, 4.9),
                  S([8.9, 5.8, 1.6], [8.4, 10.4, 1.4], [6.0, 13.8, 1.0], [3.0, 15.4, 0.6], [0.4, 15.6, 0.25])],
            neg: [E(4.5, 4.8, 1.95, 2.1, 0.3)] },
];

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return a.map((_, k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
}

function compile(shape, grow) {
  const kind = shape.t;
  if (kind === 's') {
    const k = [shape.p[0], ...shape.p, shape.p[shape.p.length - 1]];
    const pts = [];
    for (let i = 1; i < k.length - 2; i++) for (let j = 0; j < 12; j++) pts.push(catmull(k[i - 1], k[i], k[i + 1], k[i + 2], j / 12));
    pts.push(shape.p[shape.p.length - 1]);
    return (x, y) => {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, ar] = pts[i - 1], [bx, by, br] = pts[i];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const u = l2 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
        const r = ar + (br - ar) * u + grow;
        const ex = x - ax - u * dx, ey = y - ay - u * dy;
        if (ex * ex + ey * ey <= r * r) return true;
      }
      return false;
    };
  }
  if (kind === 'e') {
    const c = Math.cos(shape.a), s = Math.sin(shape.a), rx = shape.rx + grow, ry = shape.ry + grow;
    return (x, y) => {
      const dx = x - shape.x, dy = y - shape.y;
      const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      return u * u + v * v <= 1;
    };
  }
  const v = shape.v, r = shape.r + grow;
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      const [xi, yi] = v[i], [xj, yj] = v[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside || r <= 0) return inside;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      const [xi, yi] = v[i], [xj, yj] = v[j];
      const dx = xi - xj, dy = yi - yj, l2 = dx * dx + dy * dy;
      const u = clamp(((x - xj) * dx + (y - yj) * dy) / l2, 0, 1);
      if ((x - xj - u * dx) ** 2 + (y - yj - u * dy) ** 2 <= r * r) return true;
    }
    return false;
  };
}

// Plates are tabulated as horizontal runs: SUBY rows per pixel, run ends to
// 1/SUBX px. A block is then extruded from two of these, one along x and one
// along depth, and drawn run against run.
const SUBX = 8, SUBY = 4;

function rasterise(d, w, h, grow) {
  const gl = GLYPHS[d];
  const pos = gl.pos.map((s) => compile(s, grow)), neg = gl.neg.map((s) => compile(s, -grow * 0.6));
  const rows = [];
  for (let j = 0; j < h * SUBY; j++) {
    const yu = ((j + 0.5) / SUBY / h) * 16;
    const runs = [];
    let on = false, start = 0;
    for (let i = 0; i <= w * SUBX; i++) {
      const xu = ((i + 0.5) / SUBX / w) * 10;
      const v = i < w * SUBX && pos.some((f) => f(xu, yu)) && !neg.some((f) => f(xu, yu));
      if (v && !on) { on = true; start = i / SUBX; }
      else if (!v && on) { on = false; runs.push(start, i / SUBX); }
    }
    rows.push(runs);
  }
  return { w, h, rows };
}

export const SIZES = {
  hour: { w: 12, h: 19, grow: 0.2 },
  min: { w: 16, h: 26, grow: 0 },
};
const PLATES = {};
for (const k of Object.keys(SIZES)) {
  const { w, h, grow } = SIZES[k];
  PLATES[k] = GLYPHS.map((_, d) => rasterise(d, w, h, grow));
}
export { PLATES };

// The mass of a block cut from plate a (front) and plate b (side).
const MASS = {};
function mass(size, a, b) {
  const key = size + a + b;
  if (MASS[key] !== undefined) return MASS[key];
  const A = PLATES[size][a].rows, B = PLATES[size][b].rows;
  let m = 0;
  for (let j = 0; j < A.length; j++) {
    let la = 0, lb = 0;
    for (let k = 0; k < A[j].length; k += 2) la += A[j][k + 1] - A[j][k];
    for (let k = 0; k < B[j].length; k += 2) lb += B[j][k + 1] - B[j][k];
    m += la * lb;
  }
  return (MASS[key] = m / SUBY);
}
const MEAN = {};
for (const k of Object.keys(SIZES)) {
  let s = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) s += mass(k, a, b);
  MEAN[k] = s / 100;
}

// ------------------------------------------------------------ the block renderer
// A block is the intersection of plate A extruded through the depth and plate
// B extruded sideways (the Hofstadter "GEB" trick): from the front it is
// exactly A, from the side exactly B, and turned between, a carved solid that
// is both. Each pixel row is a slice: rectangles A-run x B-run, rotated by
// the block's yaw; their faces that look at the eye are projected, the
// nearest wins per pixel and is shaded by how it faces the lamp.

const LX = 0.5, LZ = -0.866;            // towards the lamp: right and in front
const FACES = new Float64Array(64 * 5);
/** Lit by the lamp or in shade: a short terminator keeps the faces crisp. */
function faceLevel(lam) {
  const u = clamp((lam - 0.48) / 0.24, 0, 1);
  return 0.13 + 0.87 * u * u * (3 - 2 * u);
}

export function drawBlock(g, b) {
  const pl = PLATES[b.size];
  const A = pl[b.front].rows, Bp = pl[b.depth].rows, w = pl[b.front].w, h = pl[b.front].h;
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw), s = b.s, hw = w / 2;
  const buf = g.buf, GW = g.width;
  const ox = Math.round(b.x), oy = Math.round(b.y);
  const y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(g.height, Math.ceil(b.y + h * s));
  // the four side normals, rotated, and their shade
  const NX = [0, 1, 0, -1], NZ = [-1, 0, 1, 0];
  const lev = [], vis = [];
  for (let k = 0; k < 4; k++) {
    const nx = NX[k] * c + NZ[k] * sn, nz = -NX[k] * sn + NZ[k] * c;
    vis[k] = nz < -1e-6;
    // a face seen at a grazing angle goes dark, so a plate at rest is crisp
    const f = clamp((-nz - 0.22) / 0.16, 0, 1);
    lev[k] = faceLevel(nx * LX + nz * LZ) * f * f * (3 - 2 * f);
  }
  for (let y = y0; y < y1; y++) {
    const v = (y + 0.5 - b.y) / s;
    const ri = Math.floor(v * SUBY);
    if (ri < 0 || ri >= A.length) continue;
    const ar = A[ri];
    if (!ar.length) continue;
    let br = Bp[ri];
    if (!br.length) br = [hw - 0.5, hw + 0.5];
    let nf = 0, umin = 1e9, umax = -1e9;
    for (let i = 0; i < ar.length; i += 2) {
      const xa = ar[i] - hw, xb = ar[i + 1] - hw;
      for (let j = 0; j < br.length; j += 2) {
        const za = br[j] - hw, zb = br[j + 1] - hw;
        // corners in order round the rectangle; edge k runs corner k -> k+1
        const cx = [xa, xb, xb, xa], cz = [za, za, zb, zb];
        for (let k = 0; k < 4; k++) {
          if (!vis[k]) continue;
          const k2 = (k + 1) & 3;
          let ua = cx[k] * c + cz[k] * sn, ub = cx[k2] * c + cz[k2] * sn;
          let da = -cx[k] * sn + cz[k] * c, db = -cx[k2] * sn + cz[k2] * c;
          if (ua > ub) { let q = ua; ua = ub; ub = q; q = da; da = db; db = q; }
          if (ub - ua < 1e-6) continue;
          const o = nf * 5;
          FACES[o] = ua; FACES[o + 1] = ub; FACES[o + 2] = da; FACES[o + 3] = db; FACES[o + 4] = lev[k];
          nf++;
          if (ua < umin) umin = ua;
          if (ub > umax) umax = ub;
        }
      }
    }
    if (!nf) continue;
    const x0 = Math.max(0, Math.floor(b.x + umin * s)), x1 = Math.min(GW, Math.ceil(b.x + umax * s));
    const row = y * GW;
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - b.x) / s;
      let best = 1e9, L = -1;
      for (let f = 0; f < nf; f++) {
        const o = f * 5;
        const ua = FACES[o], ub = FACES[o + 1];
        if (u < ua || u >= ub) continue;
        const d = FACES[o + 2] + ((FACES[o + 3] - FACES[o + 2]) * (u - ua)) / (ub - ua);
        if (d < best) { best = d; L = FACES[o + 4]; }
      }
      if (L < 0) continue;
      if (L < 0.04) { buf[row + x] = 0; continue; }
      buf[row + x] = dither(x - ox, y - oy, L * (b.bright ?? 1)) ? 1 : 0;
    }
  }
}

// ------------------------------------------------------------ time

const LEAD = 350;   // ms: a block starts to turn this long before its minute

function digitsAt(ms) {
  const d = new Date(ms), h = d.getHours(), m = d.getMinutes();
  return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10];
}
/** The value digit i turns to next, after the minute starting at B. */
function nextOf(i, B) {
  const cur = digitsAt(B)[i];
  if (i >= 2) {
    for (let k = 1; k <= 61; k++) { const d = digitsAt(B + k * 60000)[i]; if (d !== cur) return d; }
  } else {
    let t = B + (60 - new Date(B).getMinutes()) * 60000;
    for (let k = 0; k < 25; k++, t += 3600000) { const d = digitsAt(t)[i]; if (d !== cur) return d; }
  }
  return cur;
}
/** What each block is cut from in the minute starting at B: [front, side]. */
const config = (B) => digitsAt(B).map((v, i) => [v, nextOf(i, B)]);

/** Damped step: 1 at t <= 0, ringing down to 0, starting with zero slope. */
const R = (t, w, z) => (t <= 0 ? 1 : Math.exp(-z * t) * (Math.cos(w * t) + (z / w) * Math.sin(w * t)));
const TW = 1.3, TZ = 0.75;                        // a block's quarter turn on its thread
const TC = (Math.PI - Math.atan(TW / TZ)) / TW;   // when it first reaches 90 degrees
const WIND = 20 * DEG, WINDUP = 1.3;               // the wind-up before a turn
const AW = 1.8, AZ = 0.45;                        // an arm finding its new balance

// ------------------------------------------------------------ the mobile
// World: x right, y down, z away from the eye, px. At z = 0 the projection
// is 1:1 with the glass.
const CAMD = 120, CX = 64, CY = 26;
const proj = (X, Y, Z) => { const s = CAMD / (CAMD + Z); return [CX + (X - CX) * s, CY + (Y - CY) * s, s]; };
const add = (p, dx, dy, dz) => [p[0] + dx, p[1] + dy, p[2] + dz];

const SIZE_OF = ['hour', 'hour', 'min', 'min'];

function arm(P, L1, L2, yaw, tilt, droop) {
  const ct = Math.cos(tilt), dx = ct * Math.cos(yaw), dy = Math.sin(tilt), dz = ct * Math.sin(yaw);
  const at = (u) => {
    const q = u < 0 ? u / L1 : u / L2;
    return [P[0] + u * dx, P[1] + u * dy + droop * q * q, P[2] + u * dz];
  };
  return { P, L1, L2, at, left: at(-L1), right: at(L2) };
}

function drawWire(g, a, width, n = 16) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const u = -a.L1 + ((a.L1 + a.L2) * k) / n;
    const [x, y] = proj(...a.at(u));
    pts.push([x + 0.5, y + 0.5]);
  }
  // each segment over its own small box: cheaper than one box for the lot
  const r = width / 2;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (segDist(x + 0.5, y + 0.5, ax, ay, bx, by) <= r) g.buf[y * W + x] = 1;
  }
}
function drawThread(g, p, q) {
  const [x0, y0] = proj(...p), [x1, y1] = proj(...q);
  g.line(x0, y0, x1, y1);
}

/** A flat Calder disc on the rotor, its plane holding the rotor arm. */
function drawDisc(g, d) {
  const [sx, sy, s] = proj(...d.c);
  const rx = Math.max(0.7, d.r * s * Math.abs(Math.cos(d.psi))), ry = d.r * s;
  const hole = d.hole ? d.hole * s : 0;
  const x0 = Math.max(0, Math.floor(sx - rx - 1)), x1 = Math.min(W, Math.ceil(sx + rx + 1));
  const y0 = Math.max(0, Math.floor(sy - ry - 1)), y1 = Math.min(H, Math.ceil(sy + ry + 1));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const u = (x + 0.5 - sx) / rx, v = (y + 0.5 - sy) / ry;
      const q = u * u + v * v;
      if (q > 1) continue;
      if (hole && (((x + 0.5 - sx) * d.r * s) / (rx * hole)) ** 2 + ((y + 0.5 - sy) / hole) ** 2 < 1) { g.buf[y * W + x] = 0; continue; }
      g.buf[y * W + x] = 1;
    }
}

function tiltOf(mL, L1, mR, L2, meanL, meanR) {
  const T = mR * L2 - mL * L1, T0 = meanR * L2 - meanL * L1;
  return clamp((1.7 * (T - T0)) / ((mL + mR) * (L1 + L2) * 0.5), -0.14, 0.14);
}
function tilts(m) {
  return [
    tiltOf(m[0] + m[1], 54, m[2] + m[3], 22, 2 * MEAN.hour, 2 * MEAN.min),
    tiltOf(m[0], 9.5, m[1], 9.5, MEAN.hour, MEAN.hour),
    tiltOf(m[2], 18, m[3], 18, MEAN.min, MEAN.min),
  ];
}

const SWAY = [[13, 6.7, 0.3], [15, 5.3, 2.1], [12, 8.1, 4.0], [14, 7.3, 5.2]];

export default {
  name: 'Mobile',
  blurb: 'A Calder mobile of carved blocks: each is cut so it reads as this minute face on and as the next one side on; the thread winds, the block turns a quarter turn and the arms find a new balance. On the hour a gust.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const ms = ctx.date.getTime(), t = ms / 1000;
    const B = Math.floor((ms + LEAD) / 60000) * 60000;
    const tau = (ms - (B - LEAD)) / 1000;
    const now = config(B), was = config(B - 60000);
    const gust = new Date(B).getMinutes() === 0 && tau < 14;
    const tg = gust ? tau : 99;
    const round = tau >= TC;

    // ---- the four blocks: what they are cut from, and how they are turned
    const blocks = [];
    for (let i = 0; i < 4; i++) {
      const changed = now[i][0] !== was[i][0];
      let fr = now[i], yaw = 0, env = 1;
      if (changed && tau < 12) {
        const th = -WIND + (Math.PI / 2 + WIND) * (1 - R(tau, TW, TZ));
        env = 1 - Math.exp(-(((tau - TC) / 0.45) ** 2));
        if (round) yaw = th - Math.PI / 2;
        else { fr = was[i]; yaw = th; }
      }
      // the thread winds up the other way for a second before it lets go
      const tu = (B + 60000 - LEAD - ms) / 1000;
      if (tu < WINDUP && digitsAt(B + 60000)[i] !== now[i][0]) {
        const u = 1 - tu / WINDUP;
        yaw -= WIND * u * u * (3 - 2 * u);
      }
      const [amp, per, ph] = SWAY[i];
      let sway = -5 * DEG + 0.42 * amp * DEG * (0.75 * Math.sin((TAU * t) / per + ph) + 0.25 * Math.sin((TAU * t) / (per * 0.41) + ph * 1.7));
      if (gust) sway += 0.5 * Math.exp(-0.7 * tg) * Math.sin(2.4 * tg + i * 0.2) * (1 - Math.exp(-tg * 4));
      blocks.push({ i, size: SIZE_OF[i], front: fr[0], depth: fr[1], yaw: yaw + env * sway });
    }

    // ---- balance: each arm tips to where its blocks' weights settle it
    const mOld = was.map((c, i) => mass(SIZE_OF[i], c[0], c[1]));
    const mNew = now.map((c, i) => mass(SIZE_OF[i], c[0], c[1]));
    const tOld = tilts(mOld), tNew = tilts(mNew);
    const tl = tOld.map((a, k) => (round ? tNew[k] + (a - tNew[k]) * R(tau - TC, AW, AZ) : a));

    // ---- yaw of the arms: a slow drift; on the hour a gust spins the top arm round
    let y1 = DEG * (10 * Math.sin((TAU * t) / 29) + 4 * Math.sin((TAU * t) / 11.7 + 1));
    let yH = DEG * (20 * Math.sin((TAU * t) / 13.3 + 2) + 6 * Math.sin((TAU * t) / 5.9));
    let yM = DEG * (12 * Math.sin((TAU * t) / 17.1 + 0.5) + 4 * Math.sin((TAU * t) / 7.7 + 3));
    let rot = (TAU * ((ms % 60000) / 60000));
    if (gust) {
      y1 += 0.65 * Math.exp(-0.45 * tg) * Math.sin(1.5 * tg);
      yH += 0.9 * Math.exp(-0.5 * tg) * Math.sin(2.1 * tg);
      yM -= TAU * (1 - R(tg - 0.45, 1.1, 0.6));
      tl[0] += 0.1 * Math.exp(-0.6 * tg) * Math.sin(1.6 * tg);
      rot += TAU * 2 * (1 - R(tg, 1.4, 0.8));
    }

    // ---- a block turned on its thread twists the arm it hangs from the other way
    {
      const kick = (k) => (tau < 12 ? -k * Math.exp(-0.45 * tau) * Math.sin(1.25 * tau) : 0);
      const ch = now.map((c, i) => c[0] !== was[i][0]);
      if (ch[0] || ch[1]) yH += kick(0.3 * ((ch[0] ? 1 : 0) + (ch[1] ? 1 : 0)));
      if (ch[2] || ch[3]) yM += kick(0.22 * ((ch[2] ? 1 : 0) + (ch[3] ? 1 : 0)));
      if (ch.some(Boolean)) y1 += kick(0.08);
    }

    // ---- geometry
    const X0 = 74 + 2.5 * Math.sin((TAU * t) / 1900);
    const P1 = [X0, 4 + 1.2 * Math.sin((TAU * t) / 2300), 0];
    const a1 = arm(P1, 54, 22, y1, tl[0], 7);
    const aH = arm(add(a1.left, 0, 3, 0), 9.5, 9.5, yH, tl[1], 3);
    const aM = arm(add(a1.right, 0, 6, 0), 18, 18, yM, tl[2], 5);
    const tops = [add(aH.left, 0, 2, 0), add(aH.right, 0, 2, 0), add(aM.left, 0, 2, 0), add(aM.right, 0, 2, 0)];
    const hang = a1.at(-27), PR = [hang[0], 44, hang[2]];
    const rc = Math.cos(rot), rs = Math.sin(rot);
    const discs = [
      { c: add(PR, 11 * rc, 0, 11 * rs), r: 3.6, psi: rot },
      { c: add(PR, -11 * rc, 0, -11 * rs), r: 3.0, psi: rot, hole: 1.3 },
    ];

    // ---- wires and threads first; the solids in front of them, far to near
    g.line(Math.round(X0), -1, ...proj(...P1).slice(0, 2));
    drawWire(g, a1, 1.8); drawWire(g, aH, 1.3); drawWire(g, aM, 1.5);
    drawThread(g, a1.left, aH.P); drawThread(g, a1.right, aM.P);
    for (let i = 0; i < 4; i++) drawThread(g, i < 2 ? (i ? aH.right : aH.left) : (i === 2 ? aM.left : aM.right), tops[i]);
    drawThread(g, hang, PR);
    {
      const [xa, ya] = proj(...discs[0].c), [xb, yb] = proj(...discs[1].c);
      g.line(xa, ya, xb, yb);
    }
    const items = [];
    blocks.forEach((b, i) => items.push({ z: tops[i][2], draw: () => {
      const [sx, sy, s] = proj(...tops[i]);
      drawBlock(g, { ...b, x: sx, y: sy, s });
    } }));
    for (const d of discs) items.push({ z: d.c[2], draw: () => drawDisc(g, d) });
    items.sort((p, q) => q.z - p.z);
    for (const it of items) it.draw();

    ctx.oled.contrast(Math.round(0xcf + (0x14 - 0xcf) * ctx.night));
  },
};
