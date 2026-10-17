// Plasticine: a claymation modelling board. The minutes are hand-rolled
// snakes of clay, the hour a slab cut through with a cookie cutter, and a clay
// mincer turns once a minute, extruding the strand that becomes the next numeral.
import { clamp, lerp, ease, noise, orbit, previousMinute, clockFields, segDist } from '../js/kit.js';

const W = 128, H = 64;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ clay renderer
//
// A tube of clay is a centre-line of points [x, y, r]. Every pixel near it
// remembers which segment it is closest to; a later part of the same snake
// that crosses an earlier one wins and draws its own dark edge over it, so a
// snake laid across itself reads as two layers of clay.

/** The top of each numeral, where the finger comes down. */
const TOP = {}, SIDE = {};
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
      // tin walls with a dark line either side, so they read over clay too
      const wk = o.wall;
      if (sd > 0.9 && sd <= 2.1) g.buf[k] = 1;
      else if (sd > 0) g.buf[k] = 0;
      continue;
    }
    if (sd > 0) { g.buf[k] = 0; continue; }       // the dark rim between layers
    const nx = NX[k], ny = NY[k];
    const q = Math.sqrt(nx * nx + ny * ny);
    const ndl = (nx * LX + ny * LY) / (q || 1);
    // the side away from the light falls into shadow: the dark rim thickens there
    let lit = !(ndl < -0.15 && sd > -0.6 - 1.2 * Math.min(1, (-0.15 - ndl) / 0.5));
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
  9: [[19.9, 17], [19.2, 8.4], [14, 3.7], [8, 4.6], [4.3, 10.5], [5.2, 17], [10, 20.8], [16, 19.8], [20, 15.5], [20.1, 25], [17, 35], [11, 40.4], [5.4, 38.6]],
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
for (let d = 0; d <= 9; d++) {
  let best = 6;
  for (let i = 6; i < N - 6; i++) if (PATH[d][i][1] < PATH[d][best][1] - 0.3) best = i;
  TOP[d] = best;
  // the outermost point of the upper half, on the left and on the right
  let l = -1, r = -1;
  for (let i = 0; i < N; i++) {
    const [x, y] = PATH[d][i];
    if (y < 8 || y > 26) continue;
    if (l < 0 || x < PATH[d][l][0]) l = i;
    if (r < 0 || x > PATH[d][r][0]) r = i;
  }
  SIDE[d] = [l, r];
}
const R = 3.5;

/** Where the modeller's fingers pressed each numeral: fractions along the snake. */
const PRINTS = { 0: [0.45], 1: [0.72], 2: [0.62], 3: [0.72], 4: [0.12], 5: [0.68], 6: [0.42], 7: [0.8], 8: [0.47], 9: [0.8] };

/** Fingerprint grooves round points on the snake: an oval whorl, two rings. */
function prints(P, at, dy = 0, side = 0) {
  const C = at.map((u) => { const i = Math.round(u * (P.length - 1)); return [P[i][0] + side * 2, P[i][1] + dy]; });
  return (s, nx, ny, x, y) => {
    for (const [cx, cy] of C) {
      const d = Math.hypot((x + 0.5 - cx) * 1.15, y + 0.5 - cy);
      if (d < 3.4 && ((d > 1.15 && d < 1.95) )) return true;
    }
    return false;
  };
}

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
    const P = digitSnake(d, 4 + col * 30, 2 + row * 48, { tilt: 0.04 * Math.sin(d * 2.3), seed: d });
    tube(g, P);
  }
}

// ------------------------------------------------------------ the set
//
// Front view of a modelling board. Left: the hour, a slab of clay standing on
// edge with the hour cut through it. Middle: the minutes, two hand-rolled
// snakes. Right: a clay mincer whose crank sweeps the seconds and whose
// nozzle extrudes, all minute long, the strand that becomes the next minute.

const TABLE = 53.4;                       // where the minutes stand
const ROW = 59.6;                         // the strand lies along the front
const CELL = [{ x: 37, tilt: -0.04, seed: 3 }, { x: 63, tilt: 0.035, seed: 7 }];
const DY = 9;
const SLAB = { x: 16.5, r: 15, base: 29 };  // up on the shelf at the back
const HS = 0.54;                          // the hour's numerals, relative to the minutes'
const HUB = [110, 35];
const LMAX = 58;                          // strand length at the end of a minute
const SR = 2.7;                           // its radius

// the strand's track: out of the nozzle, down to the front, then left
const TRACK = (() => {
  const C = [[88.5, 52], [86.5, 55.6], [83, 58.4], [78, ROW]];
  for (let x = 72; x >= -40; x -= 3) C.push([x, ROW + 1.3 * Math.sin((72 - x) * 0.3) * Math.min(1, (72 - x) / 9)]);
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
/** The new numeral half laid: points up to `f` are in place, the rest hangs
 *  from the fingers to the board and trails along it, swinging a little. */
function drape(B, f, side, T = 0) {
  const n = B.length, i0 = Math.floor(f), u = f - i0, i1 = Math.min(n - 1, i0 + 1);
  const F = [lerp(B[i0][0], B[i1][0], u), lerp(B[i0][1], B[i1][1], u)];
  let step = 0;
  for (let i = 1; i < n; i++) step += Math.hypot(B[i][0] - B[i - 1][0], B[i][1] - B[i - 1][1]);
  step /= n - 1;
  // the rest hangs from the fingers to the board and lies there in a loose
  // coil under the hand, so none of the clay goes missing
  const floor = TABLE - 3.2, drop = Math.max(0, floor - F[1]), sw = 0.08 * Math.sin(T * 9);
  return B.map((b, i) => {
    if (i <= f) return b;
    const d = (i - f) * step;
    if (d <= drop) return [F[0] + side * 1.2 + sw * d, F[1] + d, b[2]];
    const e = d - drop;
    return [F[0] + side * 1.2 + sw * drop + 7 * Math.sin(e * 0.3), floor - Math.min(5, e * 0.05), b[2]];
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

/** A union of capsules [ax, ay, bx, by, r]: dark inside, one lit edge round the whole. */
const HD = new Float32Array(W * H), HG = new Int32Array(W * H);
let HGEN = 0;
function caps(g, list, edge = 1.5) {
  const b = g.buf, gen = ++HGEN;
  let X0 = W, X1 = -1, Y0 = H, Y1 = -1;
  for (const [ax, ay, bx, by, r] of list) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
    if (x0 > x1 || y0 > y1) continue;
    X0 = Math.min(X0, x0); X1 = Math.max(X1, x1); Y0 = Math.min(Y0, y0); Y1 = Math.max(Y1, y1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = y * W + x, d = segDist(x + 0.5, y + 0.5, ax, ay, bx, by) - r;
        if (HG[k] !== gen || d < HD[k]) { HG[k] = gen; HD[k] = d; }
      }
  }
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const k = y * W + x;
      if (HG[k] !== gen) continue;
      const d = HD[k];
      if (d <= -edge) b[k] = 0; else if (d <= 0.1) b[k] = 1;
    }
}

/** A hand whose fingertips are at (x, y), seen from the back, fingers down:
 *  one dark mitten silhouette with a lit edge and short grooves between the
 *  fingers. side +1: right hand (thumb on the right). */
function hand(g, x, y, side, { curl = 0, pinch = 0, spread = 0.3, tilt = 0, poke = 0 } = {}) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const P = (dx, dy) => [x + side * (dx * c - dy * s), y + dx * s + dy * c];
  const L = [];
  const cap = (a, b, r) => { const p = P(...a), q = P(...b); L.push([p[0], p[1], q[0], q[1], r]); };
  cap([5, -80], [1, -22], 6.2);                     // forearm
  cap([-2.6, -14], [3.4, -14], 7.2);                // back of the hand
  const pin = [6.8, -1.5], tips = [];
  const LEN = [5.2, 6.6, 7, 6.4];
  for (let i = 0; i < 4; i++) {
    const bx = -5.4 + 3.75 * i, by = -9;
    const len = LEN[i] * (1 - 0.55 * curl);
    let tx = bx + (bx - 1) * 0.12 * spread, ty = by + len;
    if (i === 3 && pinch) { tx = lerp(tx, pin[0] - 1.2, pinch); ty = lerp(ty, pin[1], pinch); }
    cap([bx, by], [tx, ty], i === 0 ? 2.3 : 2.5);
    tips.push([tx, ty]);
  }
  const th = [lerp(11.4, pin[0] + 2.4, pinch), lerp(-6, pin[1] + 0.4, pinch)];
  cap([6.8, -13], th, 2.7);
  caps(g, L);
  // grooves between the fingers, up from the tips
  for (let i = 0; i < 3; i++) {
    if (i === 2 && pinch > 0.3) continue;
    const mx = (tips[i][0] + tips[i + 1][0]) / 2, my = Math.min(tips[i][1], tips[i + 1][1]) - 1.2;
    const p = P(mx, my), q = P(lerp(mx, -5.4 + 3.75 * i + 1.9, 0.6), my - 3.4);
    g.line(Math.round(p[0]), Math.round(p[1]), Math.round(q[0]), Math.round(q[1]), 1);
  }
}

/** One finger coming down to press, tip at (x, y), leaning by angle a:
 *  a dark finger with a lit edge and a lit fingernail. */
function finger(g, x, y, a) {
  const dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx;
  caps(g, [[x + dx * 4.4, y + dy * 4.4, x + dx * 60, y + dy * 60, 4.4]]);
  const nx = x + dx * 6.2, ny = y + dy * 6.2;
  g.fillEllipse(nx, ny, 1.7, 2.3, 1);
  g.thickLine(nx - px * 1.5 + dx * 2.6, ny - py * 1.5 + dy * 2.6, nx + px * 1.5 + dx * 2.6, ny + py * 1.5 + dy * 2.6, 1, 0);
}

// ------------------------------------------------------------ props

function mincer(g, crank, ball, shake) {
  const oy = Math.round(shake);
  // the clay waiting in the hopper, drawn first: the funnel hides its lower part
  if (ball) tube(g, [[110 + ball.dx, ball.y + oy, ball.r]], { mark: ballMarks(ball.phi) });
  // hopper: a funnel of sheet tin
  const top = 7 + oy, thr = 17 + oy;
  g.fillPolygon([[98, top + 2], [122, top + 2], [115, thr], [105, thr]], 0);
  g.thickLine(97.5, top + 0.5, 105.5, thr + 0.5, 2); g.thickLine(122.5, top + 0.5, 114.5, thr + 0.5, 2);
  g.fillRect(96, top - 1, 29, 2);
  // body: a squat cast box
  g.fillRoundRect(96, thr, 28, 34, 4, 0);
  g.roundRect(96, thr, 28, 34, 4, 1);
  g.roundRect(97, thr + 1, 26, 32, 3, 1);
  // nozzle, low on the left
  g.fillRect(89, 48 + oy, 8, 8, 0);
  g.rect(89, 48 + oy, 8, 8, 1); g.vline(88, 47 + oy, 10); g.vline(87, 47 + oy, 10);
  // feet
  g.fillRect(98, 51 + oy, 6, 4, 1); g.fillRect(116, 51 + oy, 6, 4, 1);
  // the hand-wheel on its face: one turn a minute
  const [hx, hy] = HUB, cy = hy + oy;
  g.ring(hx, cy, 8.2, 10.2, 1);
  for (let k = 0; k < 3; k++) {
    const a = crank + (k * TAU) / 3;
    g.thickLine(hx, cy, hx + 9 * Math.sin(a), cy - 9 * Math.cos(a), 2, 1);
  }
  g.fillCircle(hx, cy, 2.6, 1);
  const kx = hx + 9.2 * Math.sin(crank), ky = cy - 9.2 * Math.cos(crank);
  g.fillCircle(kx, ky, 4.4, 0);
  g.fillCircle(kx, ky, 3.4, 1);
}

/** The shelf the hour stands on, pegged to the back wall. */
function shelf(g, shake) {
  const y = Math.round(SLAB.base + shake);
  g.fillRect(0, y, 36, 2, 1);
  g.line(5, y + 2, 9, y + 6); g.line(30, y + 2, 26, y + 6);
}

function mallet(g, cx, bottom) {
  caps(g, [[cx + 2, bottom - 10, cx + 9, bottom - 60, 2.4]]);
  const x = Math.round(cx - 12), y = Math.round(bottom - 11);
  g.fillRoundRect(x, y, 24, 11, 3, 0);
  g.roundRect(x, y, 24, 11, 3, 1);
  g.vline(x + 5, y + 1, 9); g.vline(x + 18, y + 1, 9);
}

/** The hour: cookie-cut clay numerals standing on the shelf, k = scale about
 *  their centre, lifted by `lift`. 24-hour time, no leading zero. */
const HR = 2.2;
function hourSnakes(h, k = 1, lift = 0, r = HR) {
  const ds = String(h).split('').map(Number), sc = HS * k;
  const w = CW * sc, gap = -1.2 * k;
  const tot = ds.length * w + (ds.length - 1) * gap;
  const cy = SLAB.base - 40.6 * HS - HR + (CH * HS) / 2 + lift;   // so the feet stand on the shelf
  return ds.map((d, i) => digitSnake(d, SLAB.x - tot / 2 + i * (w + gap), cy - (CH * sc) / 2, { r: r * k, sc, seed: d + 11 }));
}

/** The slab the new hour is cut from: a disc of clay on edge, squashed by (sx, sy). */
function slab(g, sx, sy, shake) {
  const rx = SLAB.r * sx, ry = SLAB.r * sy, cx = SLAB.x, cy = SLAB.base - ry + shake;
  const m = Math.min(rx, ry);
  g.fillWhere((x, y, ix, iy) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, q = Math.hypot(dx, dy);
    if (q > 1) { if (q < 1 + 1.1 / m) g.buf[iy * g.width + ix] = 0; return false; }
    const sd = (q - 1) * m, ndl = (dx * LX + dy * LY) / (q || 1);
    if (ndl < -0.5 && sd > -2.05 && sd < -1.05) { g.buf[iy * g.width + ix] = 0; return false; }
    return true;
  }, 1, [cx - rx - 2, cy - ry - 2, 2 * rx + 4, 2 * ry + 4]);
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
  blurb: 'A claymation modelling board: the minutes are hand-rolled snakes of clay, the hour is cut out of a clay slab with a cookie cutter and stands on a shelf, and a little mincer whose wheel turns once a minute extrudes the next numeral; at the turn the animator\'s hand smacks the old one into a ball, flicks it into the hopper and bends the fresh strand into the new one; on the hour a mallet pounds the old hour into a pancake, it springs up into a slab, a cutter stamps the new hour out and the waste drops away behind the shelf.',
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
    const k12 = Math.floor((ms / 1000) * 12);        // the stop-motion frame
    const dig = (m) => [Math.floor(m / 10), m % 10];
    const now = dig(f.m), was = dig(prev.m), nxt = dig(next.m);

    // ---- hour show timing (relative to the hour turn)
    const hT = prev.h !== f.h && tt < 4 ? tt : next.h !== f.h && tt > 58.5 ? tt - 60 : null;
    const ht = hT == null ? -1 : hT + 0.02;
    const hop = ht >= 0 && ht < 0.8 ? -3.2 * Math.abs(Math.sin((ht * Math.PI) / 0.4)) * (1 - ht / 0.8) : 0;

    // ---- the hour: clay numerals on the shelf; on the hour they are pounded
    // into a pancake, which springs up into a slab, the cutter stamps the new
    // hour out of it and the waste falls away behind the shelf
    let cutter = null;
    const sh = hop * 0.3, base = SLAB.base;
    shelf(g, sh);
    const shift = (P, dy) => P.map(([x, y, r]) => [x, y + dy, r]);
    if (hT == null || hT < -0.08) {
      for (const [i, P] of hourSnakes(f.h).entries()) tube(g, boil(P, k12, 5 + i));
    } else if (hT < 0.3) {
      // squashed under the mallet, then smeared into one pancake
      const old = hourSnakes(prev.h !== f.h ? prev.h : f.h), n = old.length;
      const e = ease.inQuad(prog(hT, -0.08, -0.02)), e2 = ease.inOutQuad(prog(hT, 0.0, 0.28));
      old.forEach((P, i) => {
        const S = P.map(([x, y, r]) => [SLAB.x + (x - SLAB.x) * (1 + 0.25 * e), base - (base - y) * (1 - 0.8 * e), r * (1 + 0.25 * e)]);
        const bar = S.map((_, j) => [SLAB.x - 15 + (30 * (i + j / (N - 1))) / n, base - 3.2 + sh, 3.2]);
        tube(g, toward(S, bar, e2));
      });
    } else {
      // the slab: springs up, takes the stamp, then the waste drops behind the shelf
      let sy = lerp(0.18, 1, ease.outElastic(prog(hT, 0.3, 0.75))), sx = lerp(1.04, 1, ease.outCubic(prog(hT, 0.3, 0.6)));
      if (hT > 0.72 && hT < 0.86) { const e = Math.sin(Math.PI * prog(hT, 0.72, 0.86)); sy -= 0.07 * e; sx += 0.05 * e; }
      const drop = 44 * ease.inQuad(prog(hT, 0.8, 1.05));
      if (drop < 40) {
        g.clip(0, 0, W, Math.round(base + sh));
        slab(g, sx, sy, sh + drop);
        g.unclip();
      }
      if (hT >= 0.8) for (const [i, P] of hourSnakes(f.h).entries()) tube(g, shift(boil(P, k12, 5 + i), sh), { reach: drop < 40 ? 2.3 : 1.2 });   // the cut: a dark gap all round
      if (hT < 1.45) {
        const k = hT < 0.74 ? lerp(1.3, 1, ease.outCubic(prog(hT, 0.3, 0.74))) : hT < 1.05 ? 1 : lerp(1, 1.4, ease.inCubic(prog(hT, 1.05, 1.45)));
        const lift = hT < 0.74 ? -40 * (1 - ease.outBack(prog(hT, 0.3, 0.74))) : hT < 1.05 ? 0 : -60 * ease.inQuad(prog(hT, 1.05, 1.45));
        cutter = { k, lift: lift + sh };
      }
    }

    // ---- the strand from the mincer: it grows all minute
    const ones = was[1] !== now[1] && tt < 4;
    const picked = ones && tt >= 0.76;                 // the full strand has been pinched off
    const L = picked ? lerp(2.5, LMAX, prog(tt, 0.76, 59.4)) : ones ? LMAX : lerp(2.5, LMAX, prog(tt, 0.76, 59.4));
    tube(g, strand(L, Math.max(3, Math.ceil(L / 1.8))));

    // ---- minutes
    const hands = [], fingers = [];
    for (let c = 0; c < 2; c++) {
      const C = CELL[c], cx = C.x + CW / 2;
      const yo = hop * (c ? 1 : 0.8);
      const rest = (d) => digitSnake(d, C.x, DY + yo, C);
      let T = null, from, to;
      if (tt > 58.5 && nxt[c] !== now[c]) { T = tt - 60; from = now[c]; to = nxt[c]; }
      else if (tt < 4 && was[c] !== now[c]) { T = tt; from = was[c]; to = now[c]; }
      if (T == null || T < -0.75 || T > 2.1) {
        // a finger pokes the numeral at :20 (tens) or :40 (ones) and leaves its print
        const at = c ? 40 : 20, pt = tt - at;
        let P = rest(now[c]);
        // pressed on its outer flank, by a finger slanting in from above
        const pi = SIDE[now[c]][c], pu = pi / (N - 1), sd = c ? 1 : -1;
        const px = P[pi][0] + sd * P[pi][2], py = P[pi][1];
        if (pt > -0.6 && pt < 1.0) {
          const dip = pt < 0 ? 0 : pt < 0.45 ? Math.sin(Math.PI * prog(pt, 0, 0.45)) : 0;
          const sq2 = ease.outElastic(prog(pt, 0.2, 0.9));
          P = P.map(([x, y, r]) => {
            const d = Math.hypot(x - px + sd * 3, y - py), w = Math.max(0, 1 - d / 8);
            return [x - sd * 1.8 * w * dip, y, r * (1 + 0.3 * w * (dip + 0.25 * sq2 * (1 - prog(pt, 0.5, 1))))];
          });
          const ang = sd * 0.38, ux = Math.sin(ang), uy = -Math.cos(ang);
          const out = pt < 0 ? 40 * (1 - ease.outCubic(prog(pt, -0.6, -0.05))) : pt < 0.45 ? -2 * dip : 40 * ease.inCubic(prog(pt, 0.45, 1.0));
          fingers.push([px + ux * out, py + uy * out, ang]);
        }
        // the press leaves a dent in the outline for the rest of its life
        const printed = pt > 0.3 || (!c && Math.floor(prev.m / 10) === now[0] && prev.h === f.h);
        if (printed && !(pt > -0.6 && pt < 1.0)) P = P.map(([x, y, r]) => {
          const w = Math.max(0, 1 - Math.hypot(x - px + sd * 3, y - py) / 6);
          return [x - sd * 0.9 * w, y, r * (1 - 0.22 * w)];
        });
        tube(g, boil(P, k12, c * 3));
        continue;
      }

      const old = rest(from), neu = rest(to);
      const Rb = 6.2, by = TABLE - Rb + yo, side = c ? 1 : -1;
      const done = c ? 1.7 : 1.65, start = c ? 0.95 : 0.9;  // the laying
      if (T < -0.02) {                                       // hover, then the smack
        const e = ease.inQuad(prog(T, -0.3, -0.03));
        tube(g, boil(sq(old, e, cx), k12, c * 3));
        const yh = lerp(-45, TABLE - 9, ease.inCubic(prog(T, -0.55, -0.04)));
        if (T > -0.55) hands.push({ c, x: cx + side * 3 * (1 - prog(T, -0.55, -0.2)), y: yh, pose: { spread: 0.6 - 0.6 * e } });
      } else if (T < 0.3) {                                  // rolled into a ball under the fingers
        const e = ease.outCubic(prog(T, -0.02, 0.24));
        const phi = T * 24, bx = cx + 2.4 * Math.sin(phi * 0.6) * e;
        if (e < 1) tube(g, toward(sq(old, 1, cx), ballOf(bx, by, Rb), e));
        else tube(g, [[bx, by, Rb]], { mark: ballMarks(phi) });
        hands.push({ c, x: bx, y: lerp(TABLE - 9, by - Rb - 0.5, e), pose: { curl: 0.35 * e } });
      } else {
        // the new numeral is drawn out of a lump of clay that sits under its
        // cell and shrinks as the snake is laid from it
        const Rc = 5.2, lx = cx, ly = TABLE - Rc + yo;
        if (c && T < 0.75) {
          // ones: the old ball is flicked into the hopper
          const u = prog(T, 0.3, 0.75), e = ease.inOutQuad(u);
          tube(g, [[lerp(cx, 110, e), lerp(by, 2.5, e) - 104 * u * (1 - u), lerp(Rb, 5.4, u)]], { mark: ballMarks(T * 30) });
        }
        if (c && T < start) {
          // ...the hand fetches the strand from the nozzle and bundles it up under the cell
          const src = strand(LMAX, N);
          const u = ease.inOutCubic(prog(T, 0.3, 0.68));
          const pk = ease.inOutCubic(prog(T, 0.76, start));
          const S = pk > 0 ? toward(src, ballOf(lx, ly, Rc), pk) : src;
          tube(g, S);
          const e0 = pk > 0 ? [lerp(src[0][0], lx, pk), lerp(src[0][1], ly - Rc, pk)] : [87, 52];
          hands.push({ c, x: lerp(cx + 2, e0[0], u) + 1, y: lerp(by - Rb - 1, e0[1], u) + 1.5 - 10 * Math.sin(Math.PI * u), pose: { pinch: ease.inOutQuad(prog(T, 0.6, 0.76)), curl: 0.3 } });
        } else if (!c && T < start) {
          // tens: the ball is kneaded on the spot, then pinched up
          const phi = T * 20, bx = cx + 2.4 * Math.sin(phi * 0.6);
          const e = ease.inOutQuad(prog(T, 0.55, start));
          const x = lerp(bx, lx, e), r = lerp(Rb, Rc, e);
          tube(g, [[x, TABLE - r + yo, r]], { mark: ballMarks(phi) });
          hands.push({ c, x, y: TABLE - 2 * r - 0.5 + yo + 1.5 * e, pose: { curl: 0.35, pinch: e } });
        } else {
          const lay = ease.inOutQuad(prog(T, start, done));
          const fi = Math.min(N - 1, lay * (N - 1)), i0 = Math.floor(fi), u = fi - i0, i1 = Math.min(N - 1, i0 + 1);
          const F = [lerp(neu[i0][0], neu[i1][0], u), lerp(neu[i0][1], neu[i1][1], u)];
          if (lay < 1) {
            const rb = Rc * Math.sqrt(1 - lay);
            if (rb > 1.2) tube(g, [[lx, TABLE - rb + yo, rb]]);
            const S = neu.slice(0, i0 + 1);
            S.push([F[0], F[1], neu[i0][2]]);
            if (S.length > 1) tube(g, S);
          } else tube(g, boil(neu, k12, c * 3));
          const endPinch = prog(T, done, done + 0.16), up = ease.inOutQuad(prog(T, done + 0.04, done + 0.32));
          hands.push({ c, x: F[0] + side * (1 + 26 * up), y: F[1] + 1.5 - 95 * up, pose: { pinch: 1 - Math.sin(Math.PI * endPinch) * 0.7, curl: 0.3 } });
        }
      }
    }

    // ---- the mincer: its wheel turns once a minute; the clay in the hopper sinks as the strand grows
    const landed = !ones || tt >= 0.75;
    const u = landed ? prog(tt, 0.75, 59.6) : 1;
    const land = landed ? prog(tt, 0.75, 1.05) : 0;
    const hb = { dx: 0, y: lerp(2.5, 9.5, u) + 1.6 * Math.sin(Math.PI * land), r: lerp(6.2, 5, u), phi: u * 6 };
    mincer(g, (TAU * tt) / 60, hb, hop * 0.25);

    // ---- hour show: the mallet, then the cutter
    if (hT != null && hT > -0.75 && hT < 0.6) {
      const flat = SLAB.base - 8;
      const bot = hT < -0.3 ? lerp(-30, 2, ease.outBack(prog(hT, -0.75, -0.3)))
        : hT < -0.02 ? lerp(2, flat, ease.inCubic(prog(hT, -0.26, -0.02)))
        : lerp(flat, -30, ease.inCubic(prog(hT, 0.12, 0.6)));
      mallet(g, SLAB.x, bot);
    }
    if (cutter) for (const P of hourSnakes(f.h, cutter.k, cutter.lift)) tube(g, P, { mode: 'cutter', reach: 3.0 });

    for (const hd of hands) hand(g, hd.x, hd.y, hd.c ? 1 : -1, hd.pose);
    for (const [x, y, a] of fingers) finger(g, x, y, a);

    const [ox, oy] = orbit(date, 1, 4);
    ride(g, ox, oy);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
