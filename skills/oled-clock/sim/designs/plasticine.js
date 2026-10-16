// Plasticine: a claymation tabletop (work in progress).
import { clamp, lerp, ease, noise, orbit, previousMinute, clockFields, segDist } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ clay renderer
//
// A tube of clay is a centre-line of points [x, y, r]. Every pixel near it
// remembers which segment it is closest to; a later part of the same snake
// that crosses an earlier one wins and draws its own dark edge over it, so a
// snake laid across itself reads as two layers of clay.

const BIG = 256 * 128;                 // room for the review sheet too
const SD = new Float32Array(BIG);      // signed distance to the surface
const SO = new Float32Array(BIG);      // arc length of the owning point
const NX = new Float32Array(BIG), NY = new Float32Array(BIG);
const SG = new Int32Array(BIG);
const TOUCH = new Int32Array(BIG);
let GEN = 0;
const LX = -0.55, LY = -0.83;          // towards the light (upper left)

/**
 * @param g canvas
 * @param P [[x, y, r], ...]
 * @param o.mark (s, nx, ny, x, y) => true for a dark mark on the surface
 */
function tube(g, P, o = {}) {
  GEN++;
  const W = g.width, H = g.height;
  let nt = 0;
  const n = P.length;
  let S = 0;
  const cross = o.cross ?? 11, reach = o.reach ?? 1.2;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const rm = Math.max(a[2], b[2]) + reach + 0.1;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - rm)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + rm));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - rm)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + rm));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        let u = len2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const cx = a[0] + u * dx, cy = a[1] + u * dy;
        const ex = px - cx, ey = py - cy;
        const d = Math.sqrt(ex * ex + ey * ey);
        const r = a[2] + (b[2] - a[2]) * u;
        const sd = d - r;
        if (sd > reach) continue;
        const k = y * W + x, s = S + u * len;
        if (SG[k] !== GEN) { SG[k] = GEN; TOUCH[nt++] = k; }
        else if (!(s - SO[k] > cross) && sd >= SD[k]) continue;
        SD[k] = sd; SO[k] = s; NX[k] = ex / (r || 1); NY[k] = ey / (r || 1);
      }
    }
    S += len;
  }
  const mark = o.mark, mode = o.mode;
  for (let j = 0; j < nt; j++) {
    const k = TOUCH[j], x = k % W, y = (k / W) | 0;
    const sd = SD[k];
    if (mode === 'hole') { if (sd <= 0) g.buf[k] = 0; continue; }
    if (mode === 'cutter') {                        // thin tin walls round the shape
      if (sd > 0) g.buf[k] = 1;
      else if (o.fill) g.buf[k] = sd > -o.fillEdge ? 0 : 1;   // the cut piece inside, with its cut edge
      continue;
    }
    if (sd > 0) { g.buf[k] = 0; continue; }       // the dark rim between layers
    const nx = NX[k], ny = NY[k];
    const q = Math.sqrt(nx * nx + ny * ny);
    const ndl = (nx * LX + ny * LY) / (q || 1);
    let lit = !(ndl < -0.3 && sd > -2.05 && sd < -1.05);
    if (lit && mark && mark(SO[k], nx, ny, x, y)) lit = false;
    g.buf[k] = lit ? 1 : 0;
  }
}

// ------------------------------------------------------------ letterforms
//
// Each numeral is ONE rolled snake, bent by hand: control points in a cell
// 24 wide and 44 tall (y down), smoothed and then resampled to N points.
// 0 and 8 close on themselves with an overlapping seam; 4 crosses itself.

const CW = 24, CH = 44, N = 64;
const GL = {
  0: [[12, 3.6], [6.2, 6], [3.9, 14], [3.8, 26], [5.6, 36], [11, 40.5], [17, 39.2], [20.2, 31], [20.3, 16], [18.5, 7], [14.5, 3.7], [10, 4.4]],
  1: [[5.4, 12], [9.6, 8.2], [13.4, 3.6], [13.6, 14], [13.2, 27], [13.3, 40.6]],
  2: [[4.4, 11.5], [6.4, 5.4], [12, 3.6], [17.8, 5.6], [19.6, 11.5], [17.5, 19], [11, 27.5], [4.2, 39.5], [12, 40.2], [20.4, 39.6]],
  3: [[4.2, 8.2], [9.5, 3.8], [16.5, 4.4], [19.5, 10], [16.6, 17.5], [10, 20.8], [17, 23.4], [20.3, 31], [17, 38.6], [10.5, 40.6], [4.2, 36.5]],
  4: [[16.2, 40.6], [16, 25], [16.2, 3.8], [10, 15], [3.8, 28.6], [12, 29], [21.2, 28.4]],
  5: [[19.6, 3.8], [12, 3.6], [6, 4], [5, 12], [5.2, 19.6], [11, 16.8], [17.2, 18.4], [20.3, 26], [19.2, 35], [13, 40.5], [7, 39.6], [3.8, 35]],
  6: [[18.4, 5.6], [12, 3.7], [6.4, 8], [4, 18], [4.2, 30], [7, 38.6], [12.4, 40.6], [18, 38.2], [20.4, 31], [18, 24.2], [12, 21.8], [7.4, 23.6], [5.6, 26.4]],
  7: [[3.8, 3.8], [12, 3.6], [20.4, 3.8], [15.4, 15], [12, 26], [10.4, 40.4]],
  8: [[12, 3.6], [5.8, 5.8], [5, 13], [8, 18], [12, 20.8], [16.8, 24], [19.6, 31], [17.6, 38.6], [12, 40.6], [6.4, 38.6], [4.4, 31], [7.2, 24], [12, 20.8], [16, 18], [19, 13], [18.2, 5.8], [14, 3.7], [10, 4.2]],
  9: [[19.4, 13], [16, 19.4], [10.6, 20.8], [5.4, 17.6], [4, 11], [7.2, 4.8], [12.6, 3.6], [18, 6], [20.3, 13], [19.8, 25], [16.6, 35], [11, 40.4], [5.4, 38.6]],
};

/** Catmull-Rom through the control points, then N points evenly by arc length. */
function resample(C, n = N) {
  const dense = [];
  for (let i = 0; i < C.length - 1; i++) {
    const p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(C.length - 1, i + 2)];
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(C[C.length - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1], out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([lerp(dense[j][0], dense[j + 1][0], u), lerp(dense[j][1], dense[j + 1][1], u)]);
  }
  out.L = L;
  return out;
}

const PATH = Object.fromEntries(Object.entries(GL).map(([d, c]) => [d, resample(c)]));
const R = 3.5;

/** The snake as it boils: stop-motion clay never sits quite the same from
 *  one 12 fps frame to the next. Smooth along the snake, re-drawn 12x a second. */
function boil(P, k, seed) {
  const ph = TAU * noise(k, seed), amp = 0.055;
  const jx = (noise(k, seed + 5) - 0.5) * 0.35, jy = (noise(k, seed + 9) - 0.5) * 0.35;
  return P.map((p, i) => [p[0] + jx, p[1] + jy, p[2] * (1 + amp * Math.sin(i * 0.37 + ph))]);
}

/** A digit's snake at (x, y) (cell top-left), with its hand-made radius. */
function digitSnake(d, x, y, { r = R, tilt = 0, seed = 0, sc = 1 } = {}) {
  const p = PATH[d], cs = Math.cos(tilt), sn = Math.sin(tilt);
  return p.map(([px, py], i) => {
    const u = i / (N - 1);
    const end = Math.min(u, 1 - u) * p.L;            // distance from the nearer end
    const taper = end < 4 ? 0.78 + 0.22 * Math.sqrt(end / 4) : 1;
    const lump = 1 + 0.07 * Math.sin(u * p.L * 0.31 + seed * 2.1) + 0.05 * Math.sin(u * p.L * 0.77 + seed);
    const lx = (px - CW / 2) * sc, ly = (py - CH / 2) * sc;
    return [x + (CW / 2) * sc + lx * cs - ly * sn, y + (CH / 2) * sc + lx * sn + ly * cs, r * taper * lump];
  });
}

/** For review (out/plasticine-digits.png). */
export function specimen(g) {
  for (let d = 0; d <= 9; d++) {
    const col = d % 5, row = (d / 5) | 0;
    tube(g, digitSnake(d, 4 + col * 30, 2 + row * 48, { tilt: 0.04 * Math.sin(d * 2.3), seed: d }));
  }
}

// ------------------------------------------------------------ the set
//
// Front view of a modelling board. Left: the hour, a slab of clay standing on
// edge with the hour cut through it. Middle: the minutes, two hand-rolled
// snakes. Right: a clay mincer whose crank sweeps the seconds and whose
// nozzle extrudes, all minute long, the strand that becomes the next minute.

const TABLE = 54.4;                       // where the clay stands
const ROW = 58.6;                         // the strand lies along the front
const CELL = [{ x: 45, tilt: -0.035, seed: 3 }, { x: 71, tilt: 0.03, seed: 7 }];
const DY = 10;
const SLAB = { x: 21, r: 19 };
const HUB = [113, 29];
const LMAX = 86;                          // strand length at the end of a minute
const SR = 2.7;                           // its radius

// the strand's track: out of the nozzle, down to the front, then left
const TRACK = (() => {
  const C = [[98.2, 42.5], [97.4, 48.5], [95, 53.8], [90.5, 57.4], [84, ROW]];
  for (let x = 78; x >= -40; x -= 6) C.push([x, ROW + 0.45 * Math.sin(x * 0.23)]);
  const P = resample(C, 260);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, cum };
})();
function trackAt(s) {
  const { P, cum } = TRACK;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
  const u = clamp((s - cum[lo]) / (cum[hi] - cum[lo] || 1), 0, 1);
  return [lerp(P[lo][0], P[hi][0], u), lerp(P[lo][1], P[hi][1], u)];
}
/** The strand from the nozzle (index 0) out to length L, as n points. */
function strand(L, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1), p = trackAt(s);
    const end = L - s;
    out.push([p[0], p[1], SR * (end < 3 ? 0.8 + 0.2 * end / 3 : 1)]);
  }
  return out;
}

// --------------------------------------------------- shape changes (pure)

const sq = (P, e, cx) => P.map(([x, y, r]) => [cx + (x - cx) * (1 + 0.5 * e), TABLE - (TABLE - y) * (1 - 0.8 * e), r * (1 + 0.3 * e)]);
const toward = (A, B, e) => A.map((a, i) => [lerp(a[0], B[i][0], e), lerp(a[1], B[i][1], e), lerp(a[2], B[i][2], e)]);
/** A laid along B from its first point: point i moves when the front reaches it. */
function lay(A, B, T, lag = 0.55) {
  return A.map((a, i) => {
    const e = ease.inOutCubic(clamp((T - (lag * i) / (A.length - 1)) / (1 - lag), 0, 1));
    const b = B[i];
    // a small lift as each piece is carried over: it arcs up a little
    const lift = Math.sin(Math.PI * e) * 3;
    return [lerp(a[0], b[0], e), lerp(a[1], b[1], e) - lift, lerp(a[2], b[2], e)];
  });
}
const ballOf = (x, y, r) => Array.from({ length: N }, () => [x, y, r]);

/** Marks on a spinning ball: two fingerprint grooves rolling over it. */
const ballMarks = (phi) => (s, nx, ny) => {
  for (let k = 0; k < 2; k++) {
    const a = phi + k * 2.4;
    if (Math.cos(a) < 0.1) continue;
    const cx = 0.78 * Math.sin(a);
    if (Math.abs(nx - cx - 0.12 * ny * ny) < 0.16 && Math.abs(ny) < 0.62) return true;
  }
  return false;
};

// ------------------------------------------------------------ hands
//
// The animator's hands, seen from the front with the backs towards us and
// the fingers pointing down: dark shapes with a lit edge, so they read as
// in front of the clay and never as clay.

function caps(g, list) {
  const W = g.width, H = g.height, b = g.buf;
  for (const [ax, ay, bx, by, r] of list) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = segDist(x + 0.5, y + 0.5, ax, ay, bx, by);
        if (d <= r - 0.95) b[y * W + x] = 0;
        else if (d <= r + 0.1) b[y * W + x] = 1;
      }
  }
}

/** A hand whose fingertips are at (x, y). side +1: right hand (thumb on the right). */
function hand(g, x, y, side, { curl = 0, pinch = 0, spread = 0.3, tilt = 0 } = {}) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const P = (dx, dy) => [x + side * (dx * c - dy * s), y + dx * s + dy * c];
  const L = [];
  const cap = (a, b, r) => { const p = P(...a), q = P(...b); L.push([p[0], p[1], q[0], q[1], r]); };
  cap([7, -70], [1.5, -24], 6);
  cap([-3.5, -17.5], [3.5, -17.5], 6.6);
  cap([0, -22], [0, -15], 6.4);
  const pin = [6.4, -2];
  const LEN = [8, 9.6, 10.2, 9.6];
  for (let i = 0; i < 4; i++) {
    const bx = -5.4 + 3.6 * i, by = -12.5;
    const len = LEN[i] * (1 - 0.5 * curl);
    let tx = bx + bx * 0.05 * spread * len / 4, ty = by + len;
    if (i === 3 && pinch) { tx = lerp(tx, pin[0] - 0.8, pinch); ty = lerp(ty, pin[1], pinch); }
    cap([bx, by], [tx, ty], i === 0 ? 1.75 : 2.05);
  }
  const th = [lerp(10.6, pin[0] + 1.9, pinch), lerp(-6.5, pin[1] + 0.5, pinch)];
  cap([6.6, -15.5], th, 2.2);
  caps(g, L);
}

// ------------------------------------------------------------ props

function mincer(g, crank, ball, shake) {
  const oy = shake;
  // the clay waiting in the hopper (drawn first: the throat hides its lower half)
  if (ball) tube(g, [[113 + ball.dx, ball.y + oy, ball.r]], { mark: ballMarks(ball.phi) });
  // hopper
  const top = 5 + oy, thr = 17 + oy;
  g.line(100, top, 108, thr); g.line(126, top, 118, thr);
  g.line(101, top, 109, thr); g.line(125, top, 117, thr);
  g.fillRect(98, top - 1, 31, 2);
  // body
  g.fillRoundRect(104, thr, 19, 30, 4, 0);
  g.roundRect(104, thr, 19, 30, 4, 1);
  // nozzle, pointing left
  g.fillRect(97, 38 + oy, 8, 8, 0);
  g.rect(97, 38 + oy, 8, 8, 1);
  g.vline(96, 37 + oy, 10);
  // neck and clamp plate on the board
  g.fillRect(109, 47 + oy, 9, 4, 0); g.rect(109, 47 + oy, 9, 4, 1);
  g.fillRect(102, 51 + oy, 23, 3, 1);
  // the crank: one turn a minute
  const [hx, hy] = HUB;
  const kx = hx + 11 * Math.sin(crank), ky = hy + oy - 11 * Math.cos(crank);
  g.fillCircle(hx + 0.5, hy + oy + 0.5, 3.6, 0);
  g.thickLine(hx + 0.5, hy + oy + 0.5, kx, ky, 2.6, 1);
  g.fillCircle(hx + 0.5, hy + oy + 0.5, 3, 1);
  g.pixel(hx, hy + oy, 0);
  g.fillCircle(kx, ky, 3.8, 0);
  g.fillCircle(kx, ky, 2.9, 1);
}

function mallet(g, cx, bottom) {
  caps(g, [[cx + 2, bottom - 10, cx + 9, bottom - 60, 2.4]]);
  const x = Math.round(cx - 12), y = Math.round(bottom - 11);
  g.fillRoundRect(x, y, 24, 11, 3, 0);
  g.roundRect(x, y, 24, 11, 3, 1);
  g.vline(x + 5, y + 1, 9); g.vline(x + 18, y + 1, 9);
}

/** The hour's cells (scale 1 = the slab's own size), centred on (cx, cy). */
function hourSnakes(h, cx, cy, k, r) {
  const ds = String(h).split('').map(Number), sc = 0.5 * k;
  const w = CW * sc, gap = -1.2 * k;
  const tot = ds.length * w + (ds.length - 1) * gap;
  return ds.map((d, i) => digitSnake(d, cx - tot / 2 + i * (w + gap), cy - (CH * sc) / 2, { r, sc, seed: d + 11 }));
}

/** The hour slab: a disc of clay on edge, squashed by (sx, sy), the hour cut through. */
function slab(g, h, sx, sy, shake, holes = true) {
  const rx = SLAB.r * sx, ry = SLAB.r * sy, cx = SLAB.x, cy = TABLE - ry + 0.3 + shake;
  const m = Math.min(rx, ry);
  g.fillWhere((x, y, ix, iy) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, q = Math.hypot(dx, dy);
    if (q > 1) { if (q < 1 + 1.1 / m) g.buf[iy * g.width + ix] = 0; return false; }
    const sd = (q - 1) * m, ndl = (dx * LX + dy * LY) / (q || 1);
    if (ndl < -0.3 && sd > -2.05 && sd < -1.05) { g.buf[iy * g.width + ix] = 0; return false; }
    return true;
  }, 1, [cx - rx - 2, cy - ry - 2, 2 * rx + 4, 2 * ry + 4]);
  if (holes && h != null) for (const P of hourSnakes(h, cx, cy - 0.5, 1, 2.3)) tube(g, P.map(([x, y, r]) => [cx + (x - cx) * sx, cy + (y - cy) * sy, r * Math.min(sx, sy)]), { mode: 'hole' });
  return { cx, cy };
}

// ------------------------------------------------------------ burn-in orbit

const SCRATCH = new Uint8Array(W * H);
function ride(g, dx, dy) {
  if (!dx && !dy) return;
  const b = g.buf;
  SCRATCH.set(b);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      b[y * W + x] = sx >= 0 && sy >= 0 && sx < W && sy < H ? SCRATCH[sy * W + sx] : 0;
    }
  }
}

// ------------------------------------------------------------ the face

const prog = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

export default {
  name: 'Plasticine',
  blurb: 'Placeholder.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, oled, night } = ctx;
    const ms = date.getTime();
    const f = clockFields(date), prev = previousMinute(date), next = clockFields(new Date(ms + 60000));
    const tt = f.sec;
    const k12 = Math.floor(ms / 1000 * 12);
    const now = [Math.floor(f.m / 10), f.m % 10], was = [Math.floor(prev.m / 10), prev.m % 10];
    const nxt = [Math.floor(next.m / 10), next.m % 10];
    const pre = prog(tt, 59.15, 59.95);              // hands come in before the turn
    const hourTurn = prev.h !== f.h && tt < 4, hourNext = next.h !== f.h && tt > 59;

    // table shake when the mallet lands
    const ht = hourTurn ? tt - 0.1 : -1;
    const hop = ht >= 0 && ht < 0.8 ? -3.2 * Math.abs(Math.sin(ht * Math.PI / 0.4)) * (1 - ht / 0.8) : 0;

    // ---- hour slab
    let sx = 1, sy = 1, holes = true, cutter = null;
    if (hourTurn) {
      const a = prog(tt, 0.04, 0.12), b = prog(tt, 0.22, 0.75);
      sy = lerp(1, 0.4, ease.inQuad(a)); sx = lerp(1, 1.28, ease.inQuad(a));
      if (b > 0) { const e = ease.outElastic(b); sy = lerp(0.4, 1, e); sx = lerp(1.28, 1, e); }
      holes = tt < 0.08 || tt > 1.12;
      if (tt > 0.95 && tt < 1.12) { const e = Math.sin(Math.PI * prog(tt, 0.95, 1.12)); sy -= 0.06 * e; sx += 0.04 * e; }
      if (tt > 0.42 && tt < 1.9) {
        const k = tt < 0.95 ? lerp(2.4, 1, ease.outCubic(prog(tt, 0.42, 0.95))) : tt < 1.15 ? 1 : lerp(1, 3.4, ease.inCubic(prog(tt, 1.15, 1.9)));
        const lift = tt < 1.15 ? 0 : -46 * ease.inCubic(prog(tt, 1.15, 1.9));
        cutter = { k, lift, fill: tt >= 1.12 };
      }
    }
    const sl = slab(g, holes ? (tt < 0.08 && hourTurn ? prev.h : f.h) : null, sx, sy, hop * 0.3, holes);

    // ---- the strand
    const lay1 = prog(tt, 1.5, 2.7);
    const grow = prog(tt, 1.5, 59.4);
    if (tt < 1.5) tube(g, strand(LMAX, 44));
    else { const L = lerp(2.5, LMAX, grow); tube(g, strand(L, Math.max(3, Math.ceil(L / 2)))); }

    // ---- minutes
    const hands = [];
    for (let c = 0; c < 2; c++) {
      const C = CELL[c], cx = C.x + CW / 2;
      const changes = was[c] !== now[c] && tt < 4;
      const yo = hop * (c ? 1 : 0.8);
      const rest = (d) => digitSnake(d, C.x, DY + yo, C);
      if (!changes) {
        tube(g, boil(rest(now[c]), k12, c * 3));
        if (tt > 59 && nxt[c] !== now[c]) hands.push({ c, x: lerp(cx + 6 * (c ? 1 : -1), cx, ease.outCubic(pre)), y: lerp(-16, 6, ease.outCubic(pre)), pose: { spread: 0.6 } });
        continue;
      }
      const old = rest(was[c]), neu = rest(now[c]);
      const Rb = 6.2, by = TABLE - Rb + yo;
      if (tt < 0.3) {                                        // the smack
        const e = ease.inQuad(prog(tt, 0.08, 0.28));
        tube(g, boil(sq(old, e, cx), k12, c * 3));
        hands.push({ c, x: cx, y: lerp(6, TABLE - 9, ease.inQuad(prog(tt, 0, 0.28))), pose: { spread: 0.6 - 0.6 * e } });
      } else if (tt < 0.75) {                                // rolled into a ball
        const e = ease.outCubic(prog(tt, 0.3, 0.62));
        const phi = tt * 22;
        const lump = sq(old, 1, cx);
        const bx = cx + 2.2 * Math.sin(phi * 0.5) * e;
        if (e < 1) tube(g, toward(lump, ballOf(bx, by, Rb), e));
        else tube(g, [[bx, by, Rb]], { mark: ballMarks(phi) });
        hands.push({ c, x: bx, y: lerp(TABLE - 9, by - Rb - 1, e), pose: { curl: 0.35 * e } });
      } else if (c === 1) {
        // ones: tossed into the mincer, and the strand laid as the new numeral
        if (tt < 1.32) {
          const u = prog(tt, 0.75, 1.32), e = ease.inOutQuad(u);
          const x = lerp(cx, 113, e), y = lerp(by, 9, e) - 26 * 4 * u * (1 - u);
          tube(g, [[x, y, lerp(Rb, 5.4, u)]], { mark: ballMarks(tt * 30) });
        }
        if (tt < 1.5) {
          // the hand flicks, then goes to the nozzle and pinches the strand off
          const u = ease.inOutCubic(prog(tt, 0.75, 1.3));
          hands.push({ c, x: lerp(cx + 2, 95.5, u), y: lerp(by - Rb - 1, 52, u) - 10 * Math.sin(Math.PI * u), pose: { pinch: ease.inOutQuad(prog(tt, 1.22, 1.45)), curl: 0.3 } });
        } else {
          const A = strand(LMAX, N), T = lay1;
          const S = lay(A, neu, T);
          tube(g, tt < 2.7 ? S : boil(neu, k12, 3));
          const fi = Math.min(N - 1, Math.round(clamp((T - 0.15) / 0.75, 0, 1) * (N - 1)));
          const endPinch = prog(tt, 2.7, 3.0);
          const tgt = tt < 2.7 ? S[fi] : neu[N - 1];
          const up = ease.inCubic(prog(tt, 3.0, 3.6));
          hands.push({ c, x: tgt[0] + 1, y: tgt[1] + 1.5 - 70 * up, pose: { pinch: tt < 2.7 ? 1 : 1 - Math.sin(Math.PI * endPinch) * 0.7, curl: 0.3 } });
        }
      } else {
        // tens: rolled back out into a snake, and bent into the new numeral
        const lr = prog(tt, 0.75, 1.35), phi = tt * 14;
        const Ls = 30 * ease.inOutQuad(lr);
        const bar = Array.from({ length: N }, (_, i) => [cx + (i / (N - 1) - 0.5) * Ls + 2 * Math.sin(phi) * (1 - lr), TABLE - lerp(Rb, R, lr) + yo, lerp(Rb, R, lr)]);
        const T = prog(tt, 1.35, 2.55);
        if (tt < 1.35) tube(g, bar, { mark: (s, nx, ny) => Math.abs(ny - 0.7 * Math.sin(phi + s * 0.25)) < 0.16 && Math.cos(phi + s * 0.25) > 0 });
        else tube(g, tt < 2.55 ? lay(bar, neu, T) : boil(neu, k12, 0));
        const S = tt < 2.55 ? lay(bar, neu, T) : neu;
        const fi = Math.min(N - 1, Math.round(clamp((T - 0.15) / 0.75, 0, 1) * (N - 1)));
        const up = ease.inCubic(prog(tt, 2.9, 3.5));
        if (tt < 1.35) hands.push({ c, x: cx + 3.5 * Math.sin(phi), y: TABLE - 2 * R - 1, pose: { curl: 0 } });
        else hands.push({ c, x: S[tt < 2.55 ? fi : N - 1][0] - 1, y: S[tt < 2.55 ? fi : N - 1][1] + 1.5 - 70 * up, pose: { pinch: tt < 2.55 ? 1 : 1 - 0.7 * Math.sin(Math.PI * prog(tt, 2.55, 2.85)), curl: 0.3 } });
      }
    }

    // ---- the mincer: crank = seconds, hopper ball sinks as the strand grows
    let hb = null;
    if (tt >= 1.32 || !(was[1] !== now[1])) {
      const u = tt >= 1.32 ? prog(tt, 1.32, 59.6) : 1;
      const land = prog(tt, 1.32, 1.6);
      hb = { dx: 0, y: lerp(10, 19, u) + 1.5 * Math.sin(Math.PI * land), r: lerp(5.4, 4.2, u), phi: u * 6 };
    }
    mincer(g, TAU * tt / 60, hb, hop * 0.25);

    // ---- hour show: mallet and cutter
    if (hourNext) mallet(g, SLAB.x, lerp(-30, 12, ease.outBack(prog(tt, 59.1, 59.9))));
    if (hourTurn && tt < 0.6) {
      const bot = tt < 0.1 ? lerp(12, TABLE - 2 * SLAB.r * 0.4, ease.inQuad(prog(tt, 0, 0.1))) : lerp(TABLE - 2 * SLAB.r * 0.4, -30, ease.inCubic(prog(tt, 0.18, 0.6)));
      mallet(g, SLAB.x, bot);
    }
    if (cutter) {
      for (const Pp of hourSnakes(f.h, sl.cx, sl.cy - 0.5 + cutter.lift, cutter.k, 2.3 * cutter.k))
        tube(g, Pp, { mode: 'cutter', reach: 1.1 * cutter.k, fill: cutter.fill, fillEdge: 0.9 * cutter.k });
    }

    for (const hd of hands) hand(g, hd.x, hd.y, hd.c ? 1 : -1, hd.pose);

    const [ox, oy] = orbit(date, 1, 4);
    ride(g, ox, oy);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
