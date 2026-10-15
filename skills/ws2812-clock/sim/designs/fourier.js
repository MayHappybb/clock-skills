// Epicycles: four drawing machines in a black void. Each is a chain of
// spinning circles, one per Fourier term of a closed one-stroke numeral;
// the pen at the end of the chain draws the digit in gold light, its trail
// fading behind it, so the time is always being redrawn.
//
// Minute turn: the tail of the old trail catches up with the pen, the arms
// re-tune one after another down the chain (polar, so circles swell, shrink
// and swing), and the pen draws the new numeral in.
// Hour: a great machine unfolds from the centre of the square, its arms
// growing one by one, and draws a rose with one petal per hour, then folds
// itself back up. The digits stay lit through it.
import * as kit from '../js/kit.js';
import { K, glyphCoeffs } from './fourier-glyphs.js';

const W = 128, H = 128, NT = 2 * K + 1, NS = 768;
const TAU = Math.PI * 2;
const img = new Float32Array(3 * W * H);

// ----------------------------------------------------------- palette (linear)
const GOLD = kit.hex('#ffae3c'), HOT = [1, 0.82, 0.55], EMBER = kit.hex('#c8641c');
const RING = kit.hex('#2f9fc4'), SPOKE = kit.hex('#a8dcff'), ROSE = kit.hex('#5cc8f0');

// ----------------------------------------------------------- composition
// hours big at upper left, minutes smaller at lower right: a diagonal.
const SLOTS = [
  { cx: 27, cy: 37, h: 60, T: 3.0, off: 0.00 },
  { cx: 68, cy: 37, h: 60, T: 3.0, off: 0.37 },
  { cx: 80, cy: 97, h: 42, T: 2.2, off: 0.61 },
  { cx: 109, cy: 97, h: 42, T: 2.2, off: 0.18 },
];
const SLANT = 0.12;
const F = 0.92;                 // trail length, fraction of a loop
const R0 = 0.55, R1 = 1.75, DUR = 0.6;   // retune window (s into the minute), one term's swing

// ----------------------------------------------------------- cached machines
const glyphs = new Map();
/** Coefficients (polar too) and the path of digit d at height h. */
function glyph(d, h) {
  const key = d + '|' + h;
  let g = glyphs.get(key);
  if (g) return g;
  const c = glyphCoeffs(d, h, SLANT);
  const r = new Float64Array(NT), a = new Float64Array(NT);
  for (let j = 0; j < NT; j++) { r[j] = Math.hypot(c.re[j], c.im[j]); a[j] = Math.atan2(c.im[j], c.re[j]); }
  const path = new Float32Array(2 * NS);
  for (let j = 0; j < NT; j++) {
    const n = j - K, wr = Math.cos((TAU * n) / NS), wi = Math.sin((TAU * n) / NS);
    let zr = c.re[j], zi = c.im[j];
    for (let k = 0; k < NS; k++) {
      path[2 * k] += zr; path[2 * k + 1] += zi;
      const t = zr * wr - zi * wi; zi = zr * wi + zi * wr; zr = t;
    }
  }
  g = { re: c.re, im: c.im, r, a, path, ink: c.ink };
  glyphs.set(key, g);
  return g;
}

/** A slot's machine for this minute: old and new glyphs, the term order down the chain. */
const machines = new Map();
function machine(slot, dOld, dNew) {
  const S = SLOTS[slot], key = slot + dOld + dNew;
  let m = machines.get(key);
  if (m) return m;
  const go = glyph(dOld, S.h), gn = glyph(dNew, S.h);
  const order = new Int32Array(NT), rank = new Float64Array(NT), da = new Float64Array(NT);
  const ids = [...Array(NT).keys()].sort((p, q) => Math.max(gn.r[q], go.r[q]) - Math.max(gn.r[p], go.r[p]));
  // DC term first (it is the glyph's offset, not an arm), then by size
  const dc = ids.indexOf(K); ids.splice(dc, 1); ids.unshift(K);
  ids.forEach((j, i) => { order[i] = j; rank[j] = i; });
  for (let j = 0; j < NT; j++) {
    let d = gn.a[j] - go.a[j];
    d -= TAU * Math.round(d / TAU);
    da[j] = d;
  }
  m = { go, gn, order, rank, da, same: dOld === dNew };
  machines.set(key, m);
  return m;
}

// per-term retune progress at u seconds into the minute: a wave down the chain
const STEP = (R1 - R0 - DUR) / (NT - 1);
const prog = (rank, u) => kit.ease.inOut(kit.clamp((u - R0 - rank * STEP) / DUR));

const tmp = new Float64Array(2);
/** Pen position mid-retune: every term at its own point between old and new. */
function penMorph(M, u, phi, cx, cy) {
  let x = cx, y = cy;
  const go = M.go, gn = M.gn;
  for (let j = 0; j < NT; j++) {
    const p = prog(M.rank[j], u);
    const r = go.r[j] + (gn.r[j] - go.r[j]) * p, th = go.a[j] + M.da[j] * p + (j - K) * phi;
    x += r * Math.cos(th); y += r * Math.sin(th);
  }
  tmp[0] = x; tmp[1] = y;
}
/** Pen position from a cached path at loop fraction f. */
function penPath(path, f, cx, cy) {
  const s = (f - Math.floor(f)) * NS, k = Math.floor(s), q = s - k, k2 = (k + 1) % NS;
  tmp[0] = cx + path[2 * k] + (path[2 * k2] - path[2 * k]) * q;
  tmp[1] = cy + path[2 * k + 1] + (path[2 * k2 + 1] - path[2 * k + 1]) * q;
}

// ----------------------------------------------------------- raster pens
/** A crisp dot: bilinear over 2x2. */
function dot(x, y, r, g, b) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) return;
  let p = 3 * (iy * W + ix), w = (1 - fx) * (1 - fy);
  img[p] += r * w; img[p + 1] += g * w; img[p + 2] += b * w;
  w = fx * (1 - fy); img[p + 3] += r * w; img[p + 4] += g * w; img[p + 5] += b * w;
  p += 3 * W; w = (1 - fx) * fy;
  img[p] += r * w; img[p + 1] += g * w; img[p + 2] += b * w;
  w = fx * fy; img[p + 3] += r * w; img[p + 4] += g * w; img[p + 5] += b * w;
}
/** A soft brush, tent of radius 1.5 px over 4x4: strokes about 2 px wide. */
const BR = 1.5, BN = 1 / (BR * BR);
function brush(x, y, r, g, b) {
  const ix = Math.floor(x) - 1, iy = Math.floor(y) - 1;
  if (ix < 0 || iy < 0 || ix > W - 4 || iy > H - 4) return;
  for (let v = 0; v < 4; v++) {
    const wy = 1 - Math.abs(iy + v - y) / BR;
    if (wy <= 0) continue;
    let p = 3 * ((iy + v) * W + ix);
    for (let u = 0; u < 4; u++, p += 3) {
      const wx = 1 - Math.abs(ix + u - x) / BR;
      if (wx <= 0) continue;
      const w = wx * wy * BN;
      img[p] += r * w; img[p + 1] += g * w; img[p + 2] += b * w;
    }
  }
}
function ring(cx, cy, rad, c, a) {
  const n = Math.max(8, Math.ceil((TAU * rad) / 0.9)), w = a * (TAU * rad) / n;
  for (let k = 0; k < n; k++) { const t = (TAU * k) / n; dot(cx + rad * Math.cos(t), cy + rad * Math.sin(t), c[0] * w, c[1] * w, c[2] * w); }
}
const ARMS = 7, ARC = 1.0;   // arms drawn with rings; half-width of each ring's arc (rad)
/** An arc of the ring round (cx, cy), centred on angle th, fading toward its ends. */
function arc(cx, cy, rad, th, half, c, a) {
  const n = Math.max(6, Math.ceil((2 * half * rad) / 0.8)), w = (a * 2 * half * rad) / n;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * 2 - 1, t = th + s * half, f = w * (1 - s * s);
    dot(cx + rad * Math.cos(t), cy + rad * Math.sin(t), c[0] * f, c[1] * f, c[2] * f);
  }
}
function line(ax, ay, bx, by, c, a) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.7)), w = (a * L) / n;
  for (let k = 0; k <= n; k++) { const t = k / n; dot(ax + (bx - ax) * t, ay + (by - ay) * t, c[0] * w, c[1] * w, c[2] * w); }
}

// ----------------------------------------------------------- one machine
const NTR = 640;     // trail samples per loop
function drawMachine(slot, M, now, u, inTurn, k) {
  const S = SLOTS[slot], T = S.T, cx = S.cx, cy = S.cy;
  const loopAt = (t) => t / T + S.off;          // loop fraction at absolute time t
  // where the trail may reach back to, by sample time u' (relative to minute)
  const comet = 0.13 * T, full = F * T;
  const retract = inTurn ? kit.ease.inOut(kit.clamp(u / R0)) : 0;
  const oldLim = Math.max(comet, full * (1 - retract));

  // ghost: the whole current loop, faint (the phosphor's memory)
  let ghost;
  if (!inTurn) ghost = 1;
  else ghost = u < R0 ? 1 - kit.smoothstep(0, 0.4, u) : kit.smoothstep(R1 - 0.25, R1 + 0.5, u);
  const ghostG = inTurn && u < R0 ? M.go : M.gn;
  const ga = 0.22 * ghost * ghostG.ink * k.digit;
  if (ga > 0.002) {
    const P = ghostG.path;
    let px = P[2 * (NS - 1)], py = P[2 * (NS - 1) + 1];
    for (let s = 0; s < NS; s += 2) {
      const x = P[2 * s], y = P[2 * s + 1], step = Math.hypot(x - px, y - py);
      px = x; py = y;
      const w = ga * Math.min(1.6, step) ;
      brush(cx + x, cy + y, EMBER[0] * w, EMBER[1] * w, EMBER[2] * w);
    }
  }

  // trail: pen history, newest first, brightness tapering with age
  const dt = T / NTR;
  let lx = 0, ly = 0, have = false;
  const tw = 1.45 * k.digit * (inTurn ? 1 : M.gn.ink * 0.75 + 0.25);
  for (let s = 0; s < NTR * F; s++) {
    const age = s * dt, tp = now - age, up = u - age;     // sample time, absolute and in-minute
    let lim = full;
    if (inTurn) {
      if (up < R0) lim = oldLim;
      else if (up < R1) lim = comet;
      else lim = full;
    }
    if (age > lim) { if (up < R0) break; continue; }
    const f = loopAt(tp);
    if (!inTurn || up >= R1) penPath(M.gn.path, f, cx, cy);
    else if (up < R0) penPath(M.go.path, f, cx, cy);
    else penMorph(M, up, TAU * (f - Math.floor(f)), cx, cy);
    const x = tmp[0], y = tmp[1];
    if (have) {
      const step = Math.hypot(x - lx, y - ly);
      const a = 1 - age / lim, body = (0.5 + 0.5 * a * a) * kit.smoothstep(0, 0.22, a), shimmer = 0.82 + 0.18 * Math.sin(s * 0.45 - now * 9 + slot);
      const w = tw * body * shimmer * Math.min(1.8, step);
      // the head runs hotter, the tail cools to gold
      const hot = 0.35 * a * a * a * a;   // only a touch warmer at the head: the pen is the white
      const r = GOLD[0] + (HOT[0] - GOLD[0]) * hot, g = GOLD[1] + (HOT[1] - GOLD[1]) * hot, b = GOLD[2] + (HOT[2] - GOLD[2]) * hot;
      // a long step (the pen whipping round a corner) is filled in
      const n = step > 1 ? Math.ceil(step) : 1;
      for (let q = 0; q < n; q++) {
        const t = (q + 1) / n;
        brush(lx + (x - lx) * t, ly + (y - ly) * t, (r * w) / n, (g * w) / n, (b * w) / n);
      }
    }
    lx = x; ly = y; have = true;
  }

  // the machine: the chain of arms at this instant, tip to tip, ending at the
  // pen. Big arms get a ring, but only an arc of it round the arm's tip, so
  // no numeral-sized circle ever sits beside the digits.
  const f = loopAt(now), phi = TAU * (f - Math.floor(f));
  const bump = inTurn ? kit.smoothstep(R0 - 0.35, R0, u) * (1 - kit.smoothstep(R1, R1 + 0.8, u)) : 0;
  const ks = k.spoke * (1 + 0.8 * bump), kr = k.ring * (1 + 0.5 * bump);
  let x = cx, y = cy;
  for (let i = 0; i < NT; i++) {
    const j = M.order[i];
    let r, th;
    if (inTurn) {
      const p = u < R0 ? 0 : prog(M.rank[j], u);
      r = M.go.r[j] + (M.gn.r[j] - M.go.r[j]) * p; th = M.go.a[j] + M.da[j] * p + (j - K) * phi;
    } else { r = M.gn.r[j]; th = M.gn.a[j] + (j - K) * phi; }
    const nx = x + r * Math.cos(th), ny = y + r * Math.sin(th);
    if (i > 0) {
      if (i <= ARMS) {
        if (r > 0.13 * S.h) arc(x, y, r, th, ARC, RING, 1.3 * kr);
        else if (r > 1.5 && bump < 0.95) ring(x, y, r, RING, 0.8 * kr * (1 - bump));   // small arms: whole rings, like gears
        line(x, y, nx, ny, SPOKE, ks * (1 - 0.06 * i));
        brush(x, y, SPOKE[0] * ks * 1.4, SPOKE[1] * ks * 1.4, SPOKE[2] * ks * 1.4);   // pivot
      } else if (r > 0.15) line(x, y, nx, ny, SPOKE, ks * 0.45);    // the fine arms: a filament to the pen
    }
    x = nx; y = ny;
  }
  // the pen: the brightest point on the face, a white star with a halo
  const pa = k.digit * (inTurn && u > R0 - 0.1 && u < R1 + 0.2 ? 1.3 : 1);
  const pt = 0.85 + 0.15 * Math.sin(now * 23 + slot * 2);
  brush(x, y, 5 * pa * pt, 4.8 * pa * pt, 4.6 * pa * pt);
  dot(x, y, 1.5 * pa, 1.5 * pa, 1.5 * pa);
  for (let q = 0; q < 8; q++) {
    const t = (TAU * q) / 8 + now * 3;
    dot(x + 2.2 * Math.cos(t), y + 2.2 * Math.sin(t), 0.18 * pa, 0.16 * pa, 0.13 * pa);
  }
  sparks(slot, M, now, u, inTurn, k);
}

/** Sparks shed by the pen: thrown off, falling, dying. Closed form in time. */
const RATE = 14, LIFE = 0.75, NSP = Math.ceil(RATE * LIFE);
function sparks(slot, M, now, u, inTurn, k) {
  const S = SLOTS[slot], e0 = Math.floor(now * RATE);
  for (let q = 0; q < NSP; q++) {
    const e = e0 - q, te = e / RATE, age = now - te;
    if (age > LIFE || age < 0) continue;
    const h1 = kit.hash(e, slot, 1), h2 = kit.hash(e, slot, 2);
    if (h1 < 0.35) continue;
    const ue = u - age, f = te / S.T + S.off;
    if (!inTurn || ue >= R1) penPath(M.gn.path, f, S.cx, S.cy);
    else if (ue < R0) penPath(M.go.path, f, S.cx, S.cy);
    else penMorph(M, ue, TAU * (f - Math.floor(f)), S.cx, S.cy);
    const ang = TAU * h2, sp = 6 + 10 * h1;
    const x = tmp[0] + Math.cos(ang) * sp * age, y = tmp[1] + Math.sin(ang) * sp * age + 14 * age * age;
    const a = (1 - age / LIFE) ** 2 * 0.35 * k.digit;
    dot(x, y, HOT[0] * a, HOT[1] * a, HOT[2] * a * 0.7);
  }
}

// ----------------------------------------------------------- the hour rose
const SHOW = 11;              // seconds
const ROSE_T = 7;             // one turn of the great machine
const ROSE_A = [24, 19, 9, 4.5];
/** Arm j's length at u seconds into the hour: unfolding in turn, folding back. */
function roseAmp(j, u) {
  const up = kit.ease.out(kit.clamp((u - 0.2 - 0.55 * j) / 1.1));
  const dn = 1 - kit.ease.inOut(kit.clamp((u - 7.4 - 0.45 * (3 - j)) / 1.6));
  return ROSE_A[j] * up * dn;
}
function drawRose(u, hour, k) {
  const pet = hour % 12 || 12;
  const fr = [1, 1 - pet, 1 + pet, 1 - 2 * pet];
  const cx = 64, cy = 64;
  const rot = -Math.PI / 2;
  // pen history over the last 4.5 s
  const NR = 2400, span = 4.5, dt = span / NR;
  let lx = 0, ly = 0, have = false;
  for (let s = 0; s < NR; s++) {
    const age = s * dt, up = u - age;
    if (up < 0) break;
    const tau = (TAU * up) / ROSE_T;
    let x = cx, y = cy;
    for (let j = 0; j < 4; j++) { const A = roseAmp(j, up), th = fr[j] * tau + rot; x += A * Math.cos(th); y += A * Math.sin(th); }
    if (have) {
      const step = Math.hypot(x - lx, y - ly), a = 1 - age / span;
      const w = 0.4 * k.rose * a * a * Math.min(2, step);
      const n = step > 1 ? Math.ceil(step) : 1;
      for (let q = 0; q < n; q++) { const t = (q + 1) / n; dot(lx + (x - lx) * t, ly + (y - ly) * t, (ROSE[0] * w) / n, (ROSE[1] * w) / n, (ROSE[2] * w) / n); }
    }
    lx = x; ly = y; have = true;
  }
  // the great machine now
  const tau = (TAU * u) / ROSE_T;
  let x = cx, y = cy;
  for (let j = 0; j < 4; j++) {
    const A = roseAmp(j, u), th = fr[j] * tau + rot, nx = x + A * Math.cos(th), ny = y + A * Math.sin(th);
    if (A > 0.5) { ring(x, y, A, RING, 0.09 * k.rose); line(x, y, nx, ny, SPOKE, 0.35 * k.rose); dot(x, y, 0.2 * k.rose, 0.3 * k.rose, 0.35 * k.rose); }
    x = nx; y = ny;
  }
  if (Math.hypot(x - cx, y - cy) > 0.5) brush(x, y, 0.6 * k.rose, 0.9 * k.rose, 1.0 * k.rose);
}

// ----------------------------------------------------------- seconds machine
// In the empty corner, a small three-arm machine laps once a minute, its pen
// drawing a five-cusped star (frequencies 1, -4, 6): the minute's progress is
// how far round the star the pen is, the older part of the line fading.
const SX = 30, SY = 96, SEC = [[1, 13], [-4, 4.2], [6, 1.1]];
function secPen(t) {        // t: loop fraction
  let x = SX, y = SY;
  for (const [n, r] of SEC) { const a = TAU * n * t - Math.PI / 2; x += r * Math.cos(a); y += r * Math.sin(a); }
  tmp[0] = x; tmp[1] = y;
}
function drawSeconds(u, k) {
  const NSS = 720, f = u / 60;
  let lx = 0, ly = 0, have = false;
  for (let s = 0; s < NSS; s++) {
    const age = s / NSS;                 // fraction of a minute ago
    secPen(f - age);
    const x = tmp[0], y = tmp[1];
    if (have) {
      const a = (1 - age) ** 2 * k.sec, step = Math.hypot(x - lx, y - ly), w = a * Math.min(1.5, step);
      dot(x, y, ROSE[0] * w, ROSE[1] * w, ROSE[2] * w);
    }
    lx = x; ly = y; have = true;
  }
  let x = SX, y = SY;
  for (const [n, r] of SEC) {
    const a = TAU * n * f - Math.PI / 2, nx = x + r * Math.cos(a), ny = y + r * Math.sin(a);
    arc(x, y, r, a, 1.2, RING, 0.5 * k.sec);
    line(x, y, nx, ny, SPOKE, 1.0 * k.sec);
    brush(x, y, SPOKE[0] * k.sec, SPOKE[1] * k.sec, SPOKE[2] * k.sec);
    x = nx; y = ny;
  }
  brush(x, y, 1.6 * k.sec, 1.7 * k.sec, 1.8 * k.sec);
}

// ----------------------------------------------------------- frame
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad(d.getHours()) + pad(d.getMinutes());
const K_ = { digit: 1, ring: 1, spoke: 1, rose: 1, sec: 1 };

export default {
  name: 'Epicycles',
  blurb: 'four Fourier drawing machines trace the time in gold; arms re-tune each minute, a great rose unfolds on the hour',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    img.fill(0);
    const now = ctx.date.getTime() / 1000, M0 = Math.floor(now / 60) * 60, u = now - M0;
    const cur = hhmm(ctx.date), prev = hhmm(new Date((M0 - 60) * 1000));
    const night = ctx.night, dim = 1 - 0.65 * night;
    const hourShow = ctx.date.getMinutes() === 0 && u < SHOW;
    const env = hourShow ? kit.smoothstep(0, 1.2, u) * (1 - kit.smoothstep(SHOW - 2, SHOW, u)) : 0;
    K_.digit = dim * (1 - 0.12 * env);
    K_.ring = 0.4 * dim * (1 - 0.4 * night) * (1 + env);
    K_.spoke = 1.1 * dim * (1 + 0.5 * env);
    K_.rose = dim * env;
    K_.sec = 0.32 * dim * (1 - env);
    if (K_.sec > 0.003) drawSeconds(u, K_);
    if (hourShow) drawRose(u, ctx.date.getHours(), K_);
    for (let s = 0; s < 4; s++) {
      const changed = prev[s] !== cur[s], inTurn = changed && u < R1 + F * SLOTS[s].T + 1;
      const M = machine(s, inTurn ? prev[s] : cur[s], cur[s]);
      drawMachine(s, M, now, u, inTurn, K_);
    }
    // tone: soft shoulder so overlaps glow rather than clip
    const G = ctx.layout.grid, o = ctx.out, idx = G.idx;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      const r = img[3 * p], g = img[3 * p + 1], b = img[3 * p + 2];
      o[3 * i] = r / (1 + r); o[3 * i + 1] = g / (1 + g); o[3 * i + 2] = b / (1 + b);
    }
  },
};
