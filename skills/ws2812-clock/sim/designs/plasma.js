// Plasma Globe: the panel is a plasma ball. Violet filaments writhe from the
// electrode to the glass, and the time is where the plasma touches it: four
// digits in fingertip script, written on the glass around the electrode and
// held there by filaments that crawl along their strokes. At a minute turn
// the old digit's filaments let go one by one and the strokes crackle out;
// the freed filaments bunch into one hot bundle that follows an unseen
// fingertip as it writes the new digit. On the hour a real hand reaches in
// from the right, every filament in the globe jumps to its fingertips, a
// discharge flashes across the glass, the hand flinches away and the new
// hour is written. Raster, 64 x 64, all closed-form in time.
import * as kit from '../js/kit.js';
import { glyphPoints } from './plasma-glyphs.js';

const W = 64, H = 64, N = W * H;
const CX = 31.5, CY = 31.5, R = 31.2;          // globe
const Kf = new Float32Array(N), Kd = new Float32Array(N);   // line cores: filaments, digits
const Gf = new Float32Array(N), Gd = new Float32Array(N), TMP = new Float32Array(N);
const IMG = new Float32Array(3 * N);

// ------------------------------------------------------------- palette
const VIO = kit.hex('#6c22ff'), PINK = kit.hex('#ff3fd2'), ROSE = kit.hex('#ff9cf0');
const GLASS = kit.hex('#8fa8ff'), SKIN = kit.hex('#3a1420');

// ------------------------------------------------------------- the digits
// Four slots on a ring round the electrode, tilted like lettering round a
// coin, then pushed through a gentle bulge, as if written on the sphere.
const RING = 17.6, SPREAD = 0.53, TILT = 0.2, SC = 1.24, BULGE = 40;
const SLOTS = [0, 1, 2, 3].map((j) => {
  const up = j < 2, side = j % 2 ? 1 : -1, a = side * SPREAD;
  return { cx: CX + RING * Math.sin(a), cy: up ? CY - RING * Math.cos(a) : CY + RING * Math.cos(a), rot: up ? side * TILT : -side * TILT };
});
const cache = new Map();
function glyph(j, d) {
  const key = j * 10 + d;
  if (cache.has(key)) return cache.get(key);
  const S = SLOTS[j], c = Math.cos(S.rot), s = Math.sin(S.rot), pts = glyphPoints(d);
  const n = pts.length, x = new Float32Array(n), y = new Float32Array(n), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const gx = (pts[i][0] - 5) * SC, gy = (pts[i][1] - 8) * SC;
    let px = S.cx + gx * c - gy * s - CX, py = S.cy + gx * s + gy * c - CY;
    const r = Math.hypot(px, py) || 1e-6, k = (BULGE * Math.sin(r / BULGE)) / r;
    x[i] = CX + px * k; y[i] = CY + py * k;
    cum[i] = i ? cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) : 0;
  }
  // the stretches of stroke the electrode can see: a filament reaching them
  // does not have to cross another part of the digit
  const vis = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let ok = 1;
    for (let q = 0; q < n && ok; q++) {
      if (Math.abs(cum[q] - cum[i]) < 2.5) continue;
      const ax = x[i] - CX, ay = y[i] - CY, L2 = ax * ax + ay * ay;
      const tq = ((x[q] - CX) * ax + (y[q] - CY) * ay) / L2;
      if (tq <= 0 || tq >= 1) continue;
      if (Math.hypot(x[q] - CX - tq * ax, y[q] - CY - tq * ay) < 1.6) ok = 0;
    }
    vis[i] = ok;
  }
  const runs = [];
  for (let i = 0; i < n;) {
    if (!vis[i]) { i++; continue; }
    let e = i;
    while (e + 1 < n && vis[e + 1]) e++;
    if (cum[e] - cum[i] > 1.5) runs.push([cum[i] + 0.4, cum[e] - 0.4]);
    i = e + 1;
  }
  runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  if (!runs.length) runs.push([0, cum[n - 1]]);
  const nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), l = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
    nx[i] = -(y[b] - y[a]) / l; ny[i] = (x[b] - x[a]) / l;
  }
  const g = { x, y, cum, L: cum[n - 1], n, runs, nx, ny };
  cache.set(key, g);
  return g;
}
/** Point at arclength S along glyph g, into out[0..1]. */
function along(g, S, out) {
  if (S <= 0) { out[0] = g.x[0]; out[1] = g.y[0]; return out; }
  if (S >= g.L) { out[0] = g.x[g.n - 1]; out[1] = g.y[g.n - 1]; return out; }
  let lo = 0, hi = g.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.cum[m] <= S) lo = m; else hi = m; }
  const f = (S - g.cum[lo]) / (g.cum[hi] - g.cum[lo] || 1);
  out[0] = g.x[lo] + (g.x[hi] - g.x[lo]) * f; out[1] = g.y[lo] + (g.y[hi] - g.y[lo]) * f;
  return out;
}

// ------------------------------------------------------------- raster ops
/** A soft line a-b into buf (max), weight wa..wb, radius r px. */
function seg(buf, ax, ay, bx, by, wa, wb, r) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, r2 = r * r, ir2 = 1 / r2;
  for (let y = y0; y <= y1; y++) {
    const py = y - ay;
    for (let x = x0; x <= x1; x++) {
      const px = x - ax;
      let t = (px * dx + py * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx, ey = py - t * dy, d2 = ex * ex + ey * ey;
      if (d2 >= r2) continue;
      const f = 1 - d2 * ir2, v = (wa + (wb - wa) * t) * f * f, p = y * W + x;
      if (v > buf[p]) buf[p] = v;
    }
  }
}
const dot = (buf, x, y, r, v) => seg(buf, x, y, x + 0.01, y, v, v, r);
/** Box blur radius r, twice (about a Gaussian), src -> dst. */
function blur(src, dst, r) {
  const n = 2 * r + 1, inv = 1 / n;
  let a = src, b = TMP;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {           // horizontal a -> b
      const o = y * W;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + Math.min(W - 1, Math.max(0, k))];
      for (let x = 0; x < W; x++) {
        b[o + x] = s * inv;
        s += a[o + Math.min(W - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {           // vertical b -> dst
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[Math.min(H - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < H; y++) {
        dst[y * W + x] = s * inv;
        s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
      }
    }
    a = dst;
  }
}

// ------------------------------------------------------------- filaments
const FX = new Float32Array(40), FY = new Float32Array(40);
/**
 * One plasma filament from the electrode to (bx, by): a ribbon that wanders
 * in slow waves, crackles in fast ones, and forks into a fan near the glass.
 */
function filament(bx, by, seed, t, I, rad) {
  const ux = bx - CX, uy = by - CY, d = Math.hypot(ux, uy) || 1e-6, nx = -uy / d, ny = ux / d;
  const ax = CX + (ux / d) * 2.6, ay = CY + (uy / d) * 2.6, L = d - 2.6;
  const n = Math.min(39, Math.max(6, Math.ceil(L / 1.7)));
  const h1 = kit.hash(seed, 1), h2 = kit.hash(seed, 2), h3 = kit.hash(seed, 3);
  const p1 = t * (0.17 + 0.1 * h1) + h2, p2 = -t * (0.31 + 0.15 * h2) + h3, p3 = t * (1.9 + h3) + h1;
  const crack = 0.7 + 0.45 * Math.sin(t * 7.3 + seed * 2.1) * Math.sin(t * 3.1 + seed);
  for (let i = 0; i <= n; i++) {
    const s = i / n, env = Math.sin(Math.PI * s);
    const w = L * 0.2 * env * (0.62 * Math.sin(kit.TAU * (0.8 * s + p1)) + 0.38 * Math.sin(kit.TAU * (1.9 * s + p2)))
      + crack * env * Math.sin(kit.TAU * (4.3 * s + p3));
    FX[i] = ax + (bx - ax) * s + nx * w; FY[i] = ay + (by - ay) * s + ny * w;
  }
  for (let i = 0; i < n; i++) {
    const s0 = i / n, s1 = (i + 1) / n;
    seg(Kf, FX[i], FY[i], FX[i + 1], FY[i + 1], I * (1 - 0.45 * s0), I * (1 - 0.45 * s1), rad);
  }
  // forks near the glass, their length breathing
  for (let b = 0; b < 2; b++) {
    const i = Math.round(n * (b ? 0.82 : 0.62)), sgn = kit.hash(seed, 9 + b) > 0.5 ? 1 : -1;
    const ex = FX[Math.min(n, i + 1)] - FX[i], ey = FY[Math.min(n, i + 1)] - FY[i], el = Math.hypot(ex, ey) || 1;
    const ang = sgn * (0.55 + 0.25 * Math.sin(t * 0.9 + seed + b)), c = Math.cos(ang), s = Math.sin(ang);
    const dx = (ex * c - ey * s) / el, dy = (ex * s + ey * c) / el;
    const len = (2.5 + 2.5 * kit.hash(seed, 5 + b)) * (0.55 + 0.45 * Math.sin(t * 2.3 + seed * 3 + b * 2));
    const mx = FX[i] + dx * len * 0.5 + nx * 0.6 * Math.sin(t * 5 + b), my = FY[i] + dy * len * 0.5 + ny * 0.6 * Math.sin(t * 5 + b);
    const w0 = I * 0.55 * (1 - 0.45 * i / n);
    seg(Kf, FX[i], FY[i], mx, my, w0, w0 * 0.6, rad * 0.85);
    seg(Kf, mx, my, FX[i] + dx * len, FY[i] + dy * len, w0 * 0.6, 0, rad * 0.75);
  }
  dot(Kf, bx, by, rad * 1.25, I * 0.9);       // where it lands on the glass
}

// ------------------------------------------------------------- the clock
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());
const MIN = { relA: 0.05, relB: 0.8, wA: 0.8, wB: 2.05 };
const HOUR = { relA: 0.6, relB: 1.35, wA: 1.42, wB: 2.32 };
const sm = (a, b, x) => kit.smoothstep(a, b, x);
const sine = (x) => (1 - Math.cos(Math.PI * kit.clamp(x))) / 2;

// free filaments: mostly into the gaps left and right of the electrode, and
// up and down between the digit pairs
const FREE = [0, 0.34, -0.34, Math.PI, Math.PI + 0.34, Math.PI - 0.34, -Math.PI / 2, Math.PI / 2, 0.15, Math.PI - 0.15];
const FAMP = [0.16, 0.12, 0.12, 0.16, 0.12, 0.12, 0.05, 0.05, 0.2, 0.2];

const P = [0, 0], Q = [0, 0];
function contactS(g, j, k, t) {
  const u = 0.5 + 0.5 * Math.sin(t * (0.21 + 0.09 * k + 0.04 * j) + j * 1.7 + k * 2.4);
  const run = g.runs[k % g.runs.length];
  return run[0] + (run[1] - run[0]) * u;
}
const contact = (g, j, k, t, out) => along(g, contactS(g, j, k, t), out);

export default {
  name: 'Plasma Globe',
  blurb: 'a plasma ball: the time is where the filaments touch the glass, rewritten by a fingertip each minute, grabbed by a hand on the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const grid = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000, t = now - 1.7e9;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const pd = digitsOf(new Date((M - 60) * 1000)), nd = digitsOf(ctx.date);
    const isHour = nd[2] === '0' && nd[3] === '0' && pd !== nd;
    const T = isHour ? HOUR : MIN;
    const night = ctx.night, dim = 1 - 0.65 * night;
    Kf.fill(0); Kd.fill(0);

    // the hand (hour only): x offset of the fingers, contact points
    let handOff = 99, rushOn = 0;
    if (isHour && age < 2.4) {
      handOff = 22 * (1 - kit.ease.out(kit.clamp(age / 0.5))) + 28 * kit.ease.in(kit.clamp((age - 1.55) / 0.6))
        + 2 * Math.sin(Math.PI * kit.clamp((age - 1.3) / 0.3));
      rushOn = 1;
    }
    const rush = (i) => rushOn * kit.ease.inOut(kit.clamp((age - 0.4 - 0.035 * i) / 0.35)) * (1 - kit.ease.out(kit.clamp((age - 1.45 - 0.03 * i) / 0.5)));
    const flash = isHour ? sm(1.25, 1.32, age) * Math.exp(-Math.max(0, age - 1.32) / 0.22) : 0;
    let fid = 0;
    const fil = (bx, by, seed, I, rad) => {
      const r = rush(fid), k = fid % 5; fid++;
      if (r > 0) { bx += (TIPS[k][0] + handOff - bx) * r; by += (TIPS[k][1] - by) * r; }
      filament(bx, by, seed, t, I * (1 + 1.5 * flash), rad * (1 + 0.35 * flash));
    };

    // ---- digits and the filaments that hold them
    // the fingertip writes changed digits one after another on a minute
    // turn; on the hour every digit gets its own filament at once
    const WA = [0, 0, 0, 0], WB = [0, 0, 0, 0];
    let nC = 0;
    for (let j = 0; j < 4; j++) if (pd[j] !== nd[j]) nC++;
    for (let j = 0, ci = 0; j < 4; j++) {
      if (pd[j] === nd[j]) continue;
      const dur = isHour ? T.wB - T.wA : nC > 1 ? 0.85 : 1.25, step = isHour ? 0.1 : 0.8;
      WA[j] = T.wA + ci * step; WB[j] = WA[j] + dur; ci++;
    }
    for (let j = 0; j < 4; j++) {
      const wA = WA[j], wB = WB[j];
      const od = +pd[j], ndg = +nd[j], changed = od !== ndg && age < wB + 0.9;
      const gN = glyph(j, ndg), gO = glyph(j, od);
      let unchangedDim = 1;
      if (isHour && !changed) unchangedDim = 1 - 0.45 * sm(0.5, 0.8, age) * (1 - sm(1.5, 2.0, age));
      const penP = sine((age - wA) / (wB - wA)), penS = penP * gN.L;
      // strokes
      if (changed && age < T.relB) {
        // the old digit breaks up, piece by piece, crackling as it dies
        const g = gO;
        for (let i = 0; i + 1 < g.n; i++) {
          const u = g.cum[i] / g.L, c = Math.floor(u * 7);
          const tau = T.relA + 0.04 + 0.5 * kit.hash(c, od, j);
          const live = 1 - sm(tau, tau + 0.2, age);
          if (live <= 0.01) continue;
          const fl = age > tau ? 0.55 + 0.45 * Math.sin(age * 70 + c * 3) : 1;
          strokeSeg(g, i, live * fl, t, j);
        }
      } else if (changed && age < wA) {
        // nothing: the slot is empty for a moment
      } else if (changed && age < wB) {
        const g = gN;
        for (let i = 0; i + 1 < g.n && g.cum[i] < penS; i++) {
          const fresh = 1 + 0.7 * Math.exp(-(penS - g.cum[i + 1]) / 3);
          if (g.cum[i + 1] <= penS) strokeSeg(g, i, fresh, t, j);
          else {                                       // the segment the pen is on: clip it
            along(g, penS, P);
            seg(Kd, g.x[i], g.y[i], P[0], P[1], fresh, fresh, 1.15);
          }
        }
        along(g, penS, P);
        dot(Kd, P[0], P[1], 1.7, 1.6);                 // the fingertip's hot spot
      } else {
        const g = gN;
        for (let i = 0; i + 1 < g.n; i++) strokeSeg(g, i, unchangedDim, t, j);
      }
      // the three filaments that hold this digit
      for (let k = 0; k < 3; k++) {
        const seed = 101 + j * 7 + k;
        let onStroke = true;
        if (!changed) {
          contact(gN, j, k, t, P);
        } else if (age < wB) {
          contact(gO, j, k, t, Q); along(gN, penS, P);
          const r = kit.ease.inOut(kit.clamp((age - T.relA - 0.2 * k) / 0.35));
          P[0] = Q[0] + (P[0] - Q[0]) * r; P[1] = Q[1] + (P[1] - Q[1]) * r;
          onStroke = r <= 0 || (r >= 1 && age >= wA);
        } else {
          // spread out from the pen's last point, sliding along the stroke
          const q = kit.ease.inOut(kit.clamp((age - wB - 0.12 * k) / 0.6));
          along(gN, gN.L + (contactS(gN, j, k, t) - gN.L) * q, P);
        }
        const tx = P[0], ty = P[1];
        fil(tx, ty, seed, 0.6, 1.1);
        if (onStroke && rush(fid - 1) < 0.5) dot(Kd, tx, ty, 1.5, 1.25 * unchangedDim);   // contact glint on the stroke
      }
      // the fingertip's own fat filament while it writes
      if (changed && age > wA - 0.2 && age < wB + 0.25) {
        const a = sm(wA - 0.2, wA, age) * (1 - sm(wB, wB + 0.25, age));
        along(gN, penS, P);
        fil(P[0], P[1], 211 + j, 0.95 * a, 1.6);
      }
    }

    // ---- free filaments to the glass
    for (let i = 0; i < FREE.length; i++) {
      const life = sm(0.3, 0.62, kit.noise2(t * 0.23 + i * 5.3, i * 1.7)) * (i >= 6 ? 1 - 0.8 * night : 1);
      const a = FREE[i] + FAMP[i] * Math.sin(t * (0.13 + 0.05 * i) + i * 2.2);
      const rr = R - 1.4;
      if (life > 0.02 || rushOn) fil(CX + rr * Math.cos(a), CY + rr * Math.sin(a), 11 + i, 0.62 * Math.max(life, rushOn * 0.8), 1.05);
      else fid++;
    }

    blur(Kf, Gf, 2);
    blur(Kd, Gd, 2);

    // ---- composite
    const pulse = 0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 13.1);
    for (let y = 0, p = 0; y < H; y++) {
      for (let x = 0; x < W; x++, p++) {
        const dx = x - CX, dy = y - CY, rr = Math.sqrt(dx * dx + dy * dy);
        let r = 0, g = 0, b = 0;
        if (rr < R + 1) {
          const m = Math.min(1, Gd[p] * 3), keep = 1 - 0.9 * m;      // dark margin round the digits
          const kf = Kf[p], gf = Gf[p], kd = Kd[p], gd = Gd[p];
          const hot = Math.min(kf * kf * kf, 1.2) * (0.25 + 0.2 * flash);
          r += (VIO[0] * (gf * 0.7 + kf * 0.5) + PINK[0] * kf * 0.45 + hot) * keep;
          g += (VIO[1] * (gf * 0.7 + kf * 0.5) + PINK[1] * kf * 0.45 + hot) * keep;
          b += (VIO[2] * (gf * 0.7 + kf * 0.5) + PINK[2] * kf * 0.45 + hot) * keep;
          const kd2 = Math.min(kd, 1.6), wd = kd2 * kd2 * 0.42;
          r += PINK[0] * kd2 * 0.55 + ROSE[0] * kd2 * 0.25 + wd + VIO[0] * gd * 0.45;
          g += PINK[1] * kd2 * 0.55 + ROSE[1] * kd2 * 0.25 + wd + VIO[1] * gd * 0.45;
          b += PINK[2] * kd2 * 0.55 + ROSE[2] * kd2 * 0.25 + wd + VIO[2] * gd * 0.45;
          // gas haze round the electrode, the electrode itself
          const haze = 0.07 * Math.exp(-rr / 6) * pulse;
          r += VIO[0] * haze + PINK[0] * haze * 0.4; g += VIO[1] * haze; b += VIO[2] * haze;
          const ball = (1 - sm(2.4, 3.5, rr)) * pulse;
          if (ball > 0) { const wh = 1 - sm(0, 2.6, rr); r += ball * (0.8 + 0.2 * wh); g += ball * (0.25 + 0.6 * wh); b += ball * (0.75 + 0.25 * wh); }
          // glass: thin rim, a window reflection at upper left
          const ang = Math.atan2(dy, dx), e = rr - R;
          const rim = Math.exp(-e * e / 0.5) * (0.035 + 0.07 * Math.exp(-((ang + 2.3) ** 2) / 0.3));
          const ew = rr - (R - 3.6), win = Math.exp(-ew * ew / 0.7) * sm(-2.9, -2.6, ang) * (1 - sm(-1.95, -1.7, ang)) * 0.075;
          const glint = Math.exp(-(((x - 51) ** 2) + ((y - 53) ** 2)) / 1.2) * 0.04;
          const gl = rim + win + glint;
          r += GLASS[0] * gl; g += GLASS[1] * gl; b += GLASS[2] * gl;
          if (flash > 0 && rr < R) {
            // the discharge: a ring of violet light racing out from the hand
            const d = Math.hypot(x - 50, y - 34), front = (age - 1.25) * 75, wv = Math.exp(-((d - front) ** 2) / 14);
            const f = flash * (0.025 + 0.5 * wv);
            r += VIO[0] * f + f * 0.12; g += VIO[1] * f + f * 0.05; b += VIO[2] * f + f * 0.1;
          }
        }
        IMG[3 * p] = r; IMG[3 * p + 1] = g; IMG[3 * p + 2] = b;
      }
    }

    // ---- the hand, in front of the glass
    if (handOff < 40) drawHand(handOff, age, flash);

    const o = ctx.out, idx = grid.idx;
    for (let p = 0; p < N; p++) {
      const i = idx[p];
      if (i < 0) continue;
      o[3 * i] = IMG[3 * p] * dim; o[3 * i + 1] = IMG[3 * p + 1] * dim; o[3 * i + 2] = IMG[3 * p + 2] * dim;
    }
  },
};

/** Segment i of a digit stroke into Kd, with a slow shimmer travelling along it. */
function strokeSeg(g, i, w, t, j) {
  const s = g.cum[i];
  const sh = 0.8 + 0.2 * Math.sin(s * 0.9 - t * 6.5 + j) * Math.sin(s * 0.37 + t * 2.1 + j * 2);
  // two strands twisting round each other: a rope of plasma, not a line
  const s1 = g.cum[i + 1], ph0 = s * 0.75 - t * 4.2 + j * 1.3, ph1 = s1 * 0.75 - t * 4.2 + j * 1.3;
  const a0 = 0.5 * Math.sin(ph0), a1 = 0.5 * Math.sin(ph1);
  const x0 = g.x[i], y0 = g.y[i], x1 = g.x[i + 1], y1 = g.y[i + 1];
  const n0x = g.nx[i], n0y = g.ny[i], n1x = g.nx[i + 1], n1y = g.ny[i + 1];
  const v = w * sh * 0.9;
  seg(Kd, x0 + n0x * a0, y0 + n0y * a0, x1 + n1x * a1, y1 + n1y * a1, v, v, 1.15);
  seg(Kd, x0 - n0x * a0, y0 - n0y * a0, x1 - n1x * a1, y1 - n1y * a1, v, v, 1.15);
}

/**
 * A right hand reaching in from the right edge, fingertips on the glass:
 * a silhouette lit from inside by the plasma, brightest at the tips, with
 * dark creases between the fingers.
 */
// tip (x, y), base (x, y), radius: index, middle, ring, little, thumb
const HAND = [[50.5, 19.5, 60.5, 28, 1.85], [46.8, 28.6, 60, 31.8, 2.0], [47.6, 37.8, 60, 35.6, 1.95], [51.6, 45.6, 60.5, 39.4, 1.75], [57.5, 52.5, 63.5, 43, 2.2]];
export const TIPS = HAND.slice(0, 5).map(([x, y, bx, by, r]) => {
  const l = Math.hypot(bx - x, by - y);
  return [x + (x - bx) / l * r * 0.55, y + (y - by) / l * r * 0.55];
});
const SKINLIT = kit.hex('#b0409c');
function drawHand(off, age, flash) {
  // lit by the plasma; at the discharge it is a black silhouette against the glare
  const lit = (0.3 + 0.7 * kit.smoothstep(0.35, 0.55, age) * (1 - kit.smoothstep(1.6, 2.1, age))) * (1 - 0.75 * flash);
  const x0 = Math.max(0, Math.floor(43 + off));
  if (x0 >= W) return;
  for (let y = 15; y <= 57; y++) {
    for (let x = x0; x < W; x++) {
      let d1 = 9, d2 = 9, tipD = 99;
      for (let k = 0; k < 5; k++) {
        const [tx, ty, bx, by, r] = HAND[k], ax = tx + off, bxo = bx + off;
        const dx = bxo - ax, dy = by - ty, L2 = dx * dx + dy * dy;
        const px = x - ax, py = y - ty, t = kit.clamp((px * dx + py * dy) / L2);
        const d = Math.hypot(px - t * dx, py - t * dy) - r * (1 + 0.12 * t);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        const td = Math.hypot(px, py);
        if (td < tipD) tipD = td;
      }
      // the palm: an ellipse off the right edge
      const ex = (x - 67.5 - off) / 8, ey = (y - 35) / 9.5, dp = (Math.sqrt(ex * ex + ey * ey) - 1) * 8;
      if (dp < d1) { d2 = d1; d1 = dp; } else if (dp < d2) d2 = dp;
      const cov = kit.clamp(0.55 - d1);
      if (cov <= 0) continue;
      // between two fingers the outline of each meets the other: a crease
      const crease = d2 - d1 < 1.1 ? 0.35 + 0.65 * kit.smoothstep(0.3, 1.1, d2 - d1) : 1;
      const glow = lit * 0.006, pad = lit * 0.75 * Math.exp(-tipD * tipD / 3.2);
      const band = Math.exp(-((d1 + 0.4) ** 2) / 0.22), rim = lit * crease * band * (0.22 + 0.35 * Math.exp(-tipD / 6));
      const p = y * W + x;
      for (let ch = 0; ch < 3; ch++) {
        const v = SKINLIT[ch] * glow + ROSE[ch] * rim + (ROSE[ch] * 0.7 + 0.3) * pad;
        IMG[3 * p + ch] = IMG[3 * p + ch] * (1 - cov) + v * cov;
      }
    }
  }
}

// build every slot x digit once at load, so no frame pays for it
for (let j = 0; j < 4; j++) for (let d = 0; d < 10; d++) glyph(j, d);
