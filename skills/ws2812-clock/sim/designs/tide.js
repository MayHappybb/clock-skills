// Tide: a 192 x 64 night beach. The time is written in the sand with a stick:
// grooves with raised lips, raked by the moon. Waves run up and back all the
// time, and the water glows with plankton where it breaks. Each minute a
// bigger wave runs up over the changing digit and smooths it away; the
// rainbow frog in glasses walks over and writes the new one, stroke by
// stroke, leaving footprints. On the hour a great wave covers the whole beach
// in blue light: the grooves fill with glowing water and the sea writes the
// new hour in plankton, which the frog then traces into the sand.
import * as kit from '../js/kit.js';
import { bake } from './tide-glyphs.js';
import { drawFrog, drawLine, drawCrab } from './tide-frog.js';

const W = 192, H = 64, N = W * H, YH = 7;
const TN = 604800; // noise time wraps weekly
const YW = new Float32Array(W); // still-water line (y of the shore) per column
for (let x = 0; x < W; x++) YW[x] = 15.5 + 9 * (x / (W - 1)) + 1.1 * Math.sin(x * 0.045 + 0.6);

// where the four numerals are written: big hours up the beach, minutes nearer the sea
const SLOTS = [
  { x: 8, y: 31, h: 30, slant: 0.14, r: 1.6 },
  { x: 35, y: 31, h: 30, slant: 0.14, r: 1.6 },
  { x: 78, y: 35, h: 26, slant: 0.14, r: 1.45 },
  { x: 102, y: 35, h: 26, slant: 0.14, r: 1.45 },
];
for (const s of SLOTS) { s.w = (10 * s.h) / 16 + s.h * s.slant; s.cx = s.x + s.w / 2; }
const COLON = [[67.6, 42.5], [66.0, 52.5]];
const REST_X = 150, SPEED = 26, WD = 1.35, GAP = 0.5;
const feetY = (x) => 29.4 + 4.8 * kit.smoothstep(58, 76, x);

// a normal wave may just lick the top of a numeral, never more
const CAP = new Float32Array(W), TOP = new Float32Array(W).fill(1e9);
for (let x = 0; x < W; x++) {
  let c = 14;
  for (const s of SLOTS) {
    c = Math.min(c, s.y + 2.5 - YW[x] + Math.max(0, s.x - 2 - x, x - (s.x + s.w + 2)) * 0.6);
    if (x >= s.x - 1 && x <= s.x + s.w + 1) TOP[x] = s.y;
  }
  CAP[x] = c;
}
const smin = (a, b, k) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));
const TA = new Float32Array(W), TR = new Float32Array(W); // water trickling down the grooves: glow, how far

// ------------------------------------------------------------- statics
const prof = (d, r, soft) => {
  const rr = r * (1 + 0.9 * soft), a = (1 - soft) ** 1.6;
  const u = d / rr, v = (d - 1.85 * rr) / (0.75 * rr);
  return a * (-Math.exp(-u * u) + 0.55 * Math.exp(-v * v));
};
// a stick presses hardest where a stroke starts and lifts off at the end
const press = (sa, L) => 0.9 + 0.25 * Math.exp(-sa / 7) - 0.1 * kit.smoothstep(0.75 * L, L, sa);
const H0 = new Float32Array(N), G0 = new Float32Array(N), ALB = new Float32Array(N);
const RND = new Float32Array(N), RPH = new Float32Array(N), RRT = new Float32Array(N), STAR = new Float32Array(W * YH);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  // quiet sand: faint wind ripples and grain, so the writing stays the loudest relief
  const rip = Math.sin(x * 0.55 + y * 0.9 + 2.5 * kit.noise2(x * 0.05, y * 0.08)) * 0.06 * kit.smoothstep(26, 40, y);
  H0[p] = rip + (kit.hash(x, y, 9) - 0.5) * 0.12 + 0.25 * kit.noise2(x * 0.09, y * 0.12);
  ALB[p] = 0.9 + 0.2 * kit.noise2(x * 0.21 + 40, y * 0.3);
  RND[p] = kit.hash(x, y, 1); RPH[p] = kit.hash(x, y, 2) * kit.TAU; RRT[p] = 2 + 5 * kit.hash(x, y, 3);
  if (y < YH) { const h = kit.hash(x, y, 4); STAR[p] = h < 0.045 ? 0.12 + 0.4 * kit.hash(x, y, 5) ** 2 : 0; }
}
for (const [cx, cy] of COLON) for (let y = Math.floor(cy - 4); y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
  const h = prof(Math.hypot(x - cx, y - cy), 1.25, 0) * 0.9, p = y * W + x;
  H0[p] += h; G0[p] += Math.max(0, -h);
}

/** The little heap of sand a stick pushes ahead of itself, into a slot-box array. */
function addPile(arr, f, px, py, r, a) {
  const rr = 1.15 * r;
  for (let y = Math.max(f.by, Math.floor(py - 3 * rr)); y <= Math.min(f.by + f.bh - 1, py + 3 * rr); y++) {
    for (let x = Math.max(f.bx, Math.floor(px - 3 * rr)); x <= Math.min(f.bx + f.bw - 1, px + 3 * rr); x++) {
      const dd = ((x - px) ** 2 + (y - py) ** 2) / (rr * rr);
      if (dd < 9) arr[(y - f.by) * f.bw + (x - f.bx)] += 0.55 * a * Math.exp(-dd);
    }
  }
}
const pileTmp = new Float32Array(64 * 64);
const fields = new Map();
function field(slot, d) {
  const key = slot * 10 + d;
  let f = fields.get(key);
  if (!f) {
    f = bake(d, SLOTS[slot], W, H);
    const r = SLOTS[slot].r;
    f.hFull = new Float32Array(f.bw * f.bh);
    for (let k = 0; k < f.hFull.length; k++) { const pr = press(f.sAt[k], f.L); f.hFull[k] = f.dist[k] < 5 * r ? prof(f.dist[k], r * (0.7 + 0.3 * pr), 0) * pr : 0; }
    for (const e of f.ends) addPile(f.hFull, f, e.x + e.dx * 1.6 * r, e.y + e.dy * 1.6 * r, r, 1);
    fields.set(key, f);
  }
  return f;
}

for (let s = 0; s < 4; s++) for (let d = 0; d < 10; d++) field(s, d); // bake every numeral up front

// ------------------------------------------------------------- palette
const KEYS = [
  [0, '#010208', '#0c1838', '#0e2050', '#051032', '#5c5a64', '#4a4a5c', '#7c94bc', '#e4ecff', 0.32, 0.95, 1, 1, '#16306c'],
  [4.9, '#010208', '#0c1838', '#0e2050', '#051032', '#5c5a64', '#4a4a5c', '#7c94bc', '#e4ecff', 0.32, 0.95, 1, 1, '#16306c'],
  [6.1, '#141c4a', '#ff8a5a', '#5a3a6a', '#1c1e44', '#8c7a82', '#3c364a', '#ffd8c8', '#ffd0a0', 0.45, 0.75, 0.15, 0.5, '#4a3050'],
  [8.0, '#2e66b8', '#9cc8ec', '#246494', '#124a68', '#a08868', '#7a6850', '#e4f2ff', '#fff2d8', 0.5, 0.7, 0, 0.22, '#36688a'],
  [16.6, '#2e66b8', '#9cc8ec', '#246494', '#124a68', '#a08868', '#7a6850', '#e4f2ff', '#fff2d8', 0.5, 0.7, 0, 0.22, '#36688a'],
  [18.7, '#2a1c50', '#ff6a32', '#6a3044', '#26183c', '#8c6c66', '#3c2a38', '#ffc8a8', '#ffa060', 0.45, 0.75, 0.1, 0.55, '#4a2838'],
  [20.2, '#04061a', '#2a2052', '#122050', '#061032', '#5e5a62', '#4a4858', '#7c90b8', '#e4ecff', 0.34, 0.92, 0.8, 0.95, '#162e66'],
  [24, '#010208', '#0c1838', '#0e2050', '#051032', '#5c5a64', '#4a4a5c', '#7c94bc', '#e4ecff', 0.32, 0.95, 1, 1, '#16306c'],
].map((k) => ({ h: k[0], c: [1, 2, 3, 4, 5, 6, 7, 8, 13].map((i) => kit.hex(k[i])), amb: k[9], dif: k[10], star: k[11], plank: k[12] }));
const NAMES = ['skyT', 'skyH', 'seaF', 'seaN', 'dry', 'wet', 'foam', 'lum', 'film'];
const palCache = new Map();
function palette(h) {
  const key = Math.round(h * 120);
  let P = palCache.get(key);
  if (P) return P;
  let i = 0;
  while (KEYS[i + 1].h < h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = kit.smoothstep(0, 1, (h - a.h) / (b.h - a.h));
  P = {};
  NAMES.forEach((n, j) => { P[n] = kit.mix(a.c[j], b.c[j], t); });
  P.amb = kit.lerp(a.amb, b.amb, t); P.dif = kit.lerp(a.dif, b.dif, t);
  P.star = kit.lerp(a.star, b.star, t); P.plank = kit.lerp(a.plank, b.plank, t);
  // the sun by day, the moon by night: position, and the raking light it casts
  const sun = h >= 5.6 && h < 19.4;
  const p = sun ? (h - 5.6) / 13.8 : (((h - 19.4 + 24) % 24) / 10.2);
  const el = Math.sin(Math.PI * kit.clamp(p));
  P.sun = sun; P.lumX = 12 + 168 * p; P.lumY = 9 - 7.2 * el; P.lumA = kit.smoothstep(0, 0.14, el);
  P.lumR = sun ? 2.9 : 2.5;
  const lx = -0.78 * Math.cos(Math.PI * p) * P.lumA, ly = -0.6, lz = sun ? 0.38 + 0.35 * el : 0.3;
  const ln = Math.hypot(lx, ly, lz);
  P.L = [lx / ln, ly / ln, lz / ln];
  P.dif *= 0.15 + 0.85 * P.lumA;
  P.lightC = kit.mix([1, 1, 1], P.lum, 0.55);
  P.disc = sun ? kit.mix(P.lum, [1, 1, 0.9], 0.5) : kit.hex('#f4f0dc');
  if (palCache.size > 400) palCache.clear();
  palCache.set(key, P);
  return P;
}

const SPARK = kit.hex('#7af6ff'), GLOW = kit.hex('#1e90ff'), STICK = kit.scale(kit.hex('#f0dcb8'), 0.55), STICK_K = kit.hex('#100a06');

// ------------------------------------------------------------- the plan of a minute turn
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const followX = (w, s) => { const sl = SLOTS[w.s]; return sl.cx + 6 + 0.3 * (w.f.tip(s)[0] - sl.cx); };
const ewrite = (u) => 0.5 * u + 0.5 * kit.smoothstep(0, 1, u);
const ewalk = (u) => u - Math.sin(kit.TAU * u) / kit.TAU;
const plans = new Map();
function plan(B) {
  let P = plans.get(B);
  if (P) return P;
  const a = digitsAt(B - 60), b = digitsAt(B);
  const hour = new Date(B * 1000).getMinutes() === 0;
  const changed = [0, 1, 2, 3].filter((i) => a[i] !== b[i]);
  const ws0 = B + (hour ? 1.8 : 0.9);
  const writes = changed.map((s, j) => { const t0 = ws0 + j * (WD + GAP); return { s, f: field(s, +b[s]), t0, t1: t0 + WD }; });
  const standX = followX(writes[0], 0), last = writes[writes.length - 1], endX = followX(last, last.f.L);
  const arrive = B - (hour ? 6 : 3.4), durOut = Math.max(0.8, Math.abs(REST_X - standX) / SPEED);
  const back0 = last.t1 + 0.5, durBack = Math.max(0.8, Math.abs(endX - REST_X) / SPEED);
  // the scripted wave: a tongue over the changing digits, or the whole beach on the hour
  const lo = Math.min(...changed.map((s) => SLOTS[s].x)), hi = Math.max(...changed.map((s) => SLOTS[s].x + SLOTS[s].w));
  const wave = hour ? { T: B - 2.2, Tu: 2.2, Td: 3.2, kind: 2 } : { T: B - 1.6, Tu: 1.7, Td: 2.6, kind: 1 };
  wave.A = new Float32Array(W);
  const c = (lo + hi) / 2, hw = (hi - lo) / 2 + 7;
  for (let x = 0; x < W; x++) {
    const n = kit.noise2(x * 0.07, B % 997);
    wave.A[x] = hour ? 68 - YW[x] + 3 * n : Math.max(3.5 + 2 * n, (62 - YW[x]) * Math.exp(-(((x - c) / hw) ** 6)) + 2 * n);
  }
  const hopAt = (x) => {
    const xi = kit.clamp(Math.round(x), 0, W - 1), q = feetY(x) - YW[xi], A = wave.A[xi];
    return q >= A ? null : wave.T + wave.Tu * (2 / Math.PI) * Math.asin(q / A) - 0.15;
  };
  // footprints along both walks
  const prints = [];
  const walkPrints = (x0, x1, t0, dur) => {
    const n = Math.floor(Math.abs(x1 - x0) / 3.4), dir = Math.sign(x1 - x0);
    for (let k = 1; k <= n; k++) {
      const fx = x0 + dir * k * 3.4, u = (fx - x0) / (x1 - x0);
      // invert the eased walk for the time the foot came down (a few Newton steps)
      let v = u; for (let it = 0; it < 4; it++) v -= (ewalk(v) - u) / Math.max(0.2, 1 - Math.cos(kit.TAU * v));
      const side = k % 2 ? -1 : 1;
      prints.push({ x: fx + side * 4.6, y: feetY(fx) + 0.3, tc: t0 + kit.clamp(v) * dur });
    }
  };
  walkPrints(REST_X, standX, arrive - durOut, durOut);
  walkPrints(endX, REST_X, back0, durBack);
  P = { B, hour, changed, writes, standX, endX, arrive, durOut, back0, durBack, wave, prints,
    hopT: hopAt(standX), oldDigits: a, newDigits: b };
  plans.set(B, P);
  if (plans.size > 8) plans.delete(plans.keys().next().value);
  return P;
}
/** Writing progress (arc length) of write w at time now: -1 before it starts. */
const progOf = (w, now) => (now < w.t0 ? -1 : now >= w.t1 ? w.f.L : w.f.L * ewrite((now - w.t0) / WD));

/** Frog: feet x, y, lift, moving, walk phase, stick tip (or null), look. */
function frogState(now, pp, pn, events) {
  let x = REST_X, moving = false, phase = 0, tip = null, look = 0.4 * Math.sin(now * 0.37), lift = 0;
  if (now >= pn.arrive - pn.durOut) {
    if (now < pn.arrive) {
      const u = ewalk((now - (pn.arrive - pn.durOut)) / pn.durOut);
      x = kit.lerp(REST_X, pn.standX, u); moving = true; phase = Math.abs(x - REST_X) / 3.4; look = -0.9;
    } else { x = pn.standX; look = -0.3; }
  } else if (now < pp.back0 + pp.durBack) {
    const ws = pp.writes;
    x = pp.standX;
    if (now >= ws[0].t0) {
      for (let j = 0; j < ws.length; j++) {
        const w = ws[j];
        if (now < w.t0) {
          const pw = ws[j - 1], u = kit.smoothstep(pw.t1, w.t0, now);
          const xa = followX(pw, pw.f.L), xb = followX(w, 0);
          x = kit.lerp(xa, xb, u); moving = true; phase = Math.abs(x - xa) / 3.4;
          const ta = pw.f.tip(pw.f.L), tb = w.f.tip(0);
          tip = [kit.lerp(ta[0], tb[0], u), kit.lerp(ta[1], tb[1], u) - 3 * Math.sin(Math.PI * u)];
          break;
        }
        if (now <= w.t1) { const pr = progOf(w, now); x = followX(w, pr); tip = w.f.tip(pr); break; }
        x = followX(w, w.f.L);
      }
      look = -0.8;
      if (now >= pp.back0) {
        const u = ewalk(kit.clamp((now - pp.back0) / pp.durBack));
        x = kit.lerp(pp.endX, REST_X, u); moving = u < 1; phase = Math.abs(x - pp.endX) / 3.4; tip = null; look = 0.9;
      }
    }
  }
  // hop over the scripted waves; a little hop when an ordinary one wets its feet at rest
  for (const P of [pp, pn]) {
    if (P.hopT != null && now > P.hopT && now < P.hopT + (P.hour ? 0.9 : 0.75)) {
      const u = (now - P.hopT) / (P.hour ? 0.9 : 0.75);
      lift = Math.max(lift, (P.hour ? 8 : 5.5) * Math.sin(Math.PI * u));
    }
  }
  if (x === REST_X) {
    const q = feetY(x) - YW[REST_X];
    for (const e of events) {
      if (e.kind || e.A[REST_X] <= q) continue;
      const th = e.T + e.Tu * (2 / Math.PI) * Math.asin(q / e.A[REST_X]) - 0.1;
      if (now > th && now < th + 0.45) lift = Math.max(lift, 2.4 * Math.sin(Math.PI * (now - th) / 0.45));
    }
  }
  return { x, y: feetY(x), lift, moving, phase, tip, look };
}

// ------------------------------------------------------------- per-frame buffers
const img = new Float32Array(3 * N), Lp = new Float32Array(N), Hf = new Float32Array(N), Gd = new Float32Array(N), GL = new Float32Array(N);
const front = new Float32Array(W), fTau = new Float32Array(W), fUp = new Uint8Array(W), fKind = new Uint8Array(W), maxA = new Float32Array(W);
const PW = 6.3;
const pool = [];
const normalA = (k, i) => {
  if (!pool[i]) pool[i] = { A: new Float32Array(W), k: NaN };
  const e = pool[i];
  if (e.k !== k) {
    const kk = k % 100000, a0 = 8 + 11 * kit.hash(kk, 3);
    for (let x = 0; x < W; x++) e.A[x] = smin(a0 * (0.55 + 0.7 * kit.noise2(x * 0.022 + (kk % 1000) * 1.37, (kk % 1000) * 0.71)), CAP[x], 1.5);
    e.k = k; e.T = k * PW + (kit.hash(kk, 7) - 0.5) * 2.2; e.Tu = 1.25 + 0.35 * kit.hash(kk, 8); e.Td = 2.2; e.kind = 0;
  }
  return e;
};
const runup = (e, x, tau) => {
  if (tau <= 0) return 0;
  const A = e.A[x];
  if (tau < e.Tu) return A * Math.sin((Math.PI / 2) * (tau / e.Tu));
  const u = (tau - e.Tu) / e.Td;
  return u < 1 ? A * (1 - u * u) : 0;
};
const sparkle = (p, t) => { const s = Math.sin(t * RRT[p] + RPH[p]); return s > 0.6 ? ((s - 0.6) * 2.5) ** 2 : 0; };

export default {
  name: 'Tide',
  blurb: 'night beach panorama: the time written in the sand with a stick; a wave smooths each changing digit away and the rainbow frog writes the new one; on the hour the sea writes it in plankton light',
  layouts: ['hub-x3'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, tn = now % TN, M = Math.floor(now / 60) * 60;
    const d = ctx.date, hr = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const P = palette(hr), pp = plan(M), pn = plan(M + 60);
    const [Lx, Ly, Lz] = P.L;
    const plank = P.plank, plankH = Math.max(plank, 0.7);

    // ---- waves: ordinary sets plus the two scripted ones near this minute
    const events = [];
    const k0 = Math.floor((now - 40) / PW), k1 = Math.floor((now + 4) / PW) + 1;
    let pi = 0;
    for (let k = k0; k <= k1; k++) {
      const e = normalA(k, pi++);
      if (Math.abs(e.T - pp.wave.T) < 5.5 || Math.abs(e.T - pn.wave.T) < 5.5) continue;
      if (e.T > now + 3.4 || e.T + e.Tu + e.Td < now - 40) continue;
      events.push(e);
    }
    for (const w of [pp.wave, pn.wave]) if (w.T < now + 3.4 && w.T + w.Tu + w.Td > now - 40) events.push(w);
    for (let x = 0; x < W; x++) {
      let r = 0, tau = 0, up = 0, kind = 0, ma = 0;
      for (const e of events) {
        const ta = now - e.T, rr = runup(e, x, ta);
        if (e.A[x] > ma && ta > 0) ma = e.A[x];
        if (rr > r) { r = rr; tau = ta; up = ta < e.Tu ? 1 : 0; kind = e.kind; }
      }
      const lace = (kit.noise2(x * 0.31, tn * 0.7) - 0.5) * 1.8 * Math.min(1, r / 3);
      front[x] = r > 0.2 ? r + lace : 0.35 + 0.3 * Math.sin(tn * 1.3 + x * 0.05);
      fTau[x] = tau; fUp[x] = up; fKind[x] = kind; maxA[x] = ma;
      // a wave that licks a numeral's top sends glowing water down its grooves
      let ta = 0, tr = 0;
      if (TOP[x] < 1e8) {
        const qt = TOP[x] - YW[x];
        for (const e of events) {
          if (e.kind) continue;
          const A = e.A[x];
          if (A <= qt) continue;
          const age = now - (e.T + e.Tu * (2 / Math.PI) * Math.asin(qt / A));
          if (age <= 0 || age > 9) continue;
          const a = (1 - Math.exp(-age * 5)) * Math.exp(-age / 2.6) * Math.min(1, (A - qt) / 1.2);
          if (a > ta) { ta = a; tr = TOP[x] + 1 + 12 * Math.sqrt(age); }
        }
      }
      TA[x] = ta * plank * 2.4; TR[x] = tr;
    }

    // ---- the sand's relief: base + numerals + footprints; Gd = groove depth, GL = plankton light in it
    Hf.set(H0); Gd.set(G0); GL.fill(0); Lp.fill(0);
    // at night and dusk the writing keeps a faint plankton shimmer: it was written in wet sand
    const nightK = kit.smoothstep(0.25, 0.8, plank), rest = 0.6 * nightK;
    // water standing in the grooves glows: strongly after the hour wave, faintly after a minute wave
    const hourGlow = (pn.hour ? kit.smoothstep(pn.B - 1.9, pn.B - 0.9, now) : 0) + (pp.hour ? 1 - kit.smoothstep(pp.B + 3, pp.B + 11, now) : 0);
    const colonGlow = hourGlow * plankH * 1.4 + rest;
    if (colonGlow > 0) for (const [cx, cy] of COLON) for (let y = Math.floor(cy - 3); y <= cy + 3; y++) for (let x = Math.floor(cx - 3); x <= cx + 3; x++) GL[y * W + x] += G0[y * W + x] * colonGlow;
    for (let s = 0; s < 4; s++) {
      const sl = SLOTS[s], r = sl.r, dNew = +pp.newDigits[s], age = now - M;
      const changed = pp.changed.includes(s) && age < 20;
      const minGlow = pn.changed.includes(s) && !pn.hour ? 0.45 * kit.smoothstep(pn.B - 1.0, pn.B - 0.3, now) : 0;
      // the wave smooths a numeral away in the last moments of its minute
      const lead = pn.hour ? 0.3 : 0.7, dur = pn.hour ? 0.45 : 1.0;
      if (!changed && pn.changed.includes(s) && now > pn.B - lead) {
        const k = kit.clamp((now - (pn.B - lead)) / dur);
        stampSoft(field(s, dNew), r, k, ((hourGlow + minGlow) * plankH * 1.4 + rest) * (1 - k));
        continue;
      }
      if (!changed) { stampFull(field(s, dNew), (hourGlow + minGlow) * plankH * 1.4 + rest); continue; }
      const kOld = pp.hour ? kit.clamp((age + 0.3) / 0.45) : kit.clamp((age + 0.7) / 1.0);
      if (kOld < 1) stampSoft(field(s, +pp.oldDigits[s]), r, kOld, ((pp.hour ? 1 : 0.45) * plankH * 1.4 + rest) * (1 - kOld));
      const w = pp.writes.find((q) => q.s === s), pr = progOf(w, now), f = w.f;
      const pen = pp.hour ? f.L * kit.ease.out(kit.clamp((now - (pp.B + 0.08)) / 0.75)) : -1;
      const penFade = pp.hour ? 1 - kit.smoothstep(w.t1, w.t1 + 1.5, now) : 0;
      const fresh = (1 - kit.smoothstep(w.t1, w.t1 + 6, now)) * plank;
      stampWrite(f, r, pr, pen, penFade, fresh, hourGlow * plankH * 1.4 + rest);
    }
    // footprints: little dimples, gone when a big wave has run over them
    const prints = [];
    for (const Pl of [pp, pn]) for (const f of Pl.prints) {
      if (f.tc > now || now - f.tc > 40) continue;
      let a = 1 - (now - f.tc) / 40;
      for (const w of [pp.wave, pn.wave]) {
        const xi = kit.clamp(Math.round(f.x), 0, W - 1), q = f.y - YW[xi], A = w.A[xi];
        if (q < A) { const tin = w.T + w.Tu * (2 / Math.PI) * Math.asin(q / A); if (tin > f.tc) a *= 1 - kit.smoothstep(tin, tin + 0.8, now); }
      }
      if (a <= 0.01) continue;
      prints.push(f, a);
      for (let y = Math.floor(f.y - 2); y <= f.y + 2; y++) for (let x = Math.floor(f.x - 2); x <= f.x + 2; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const dd = Math.hypot(x - f.x, y - f.y), h = 0.55 * a * Math.exp(-dd * dd / 0.8);
        Hf[y * W + x] -= h; Gd[y * W + x] += h * 0.6;
      }
    }

    // ---- shade every pixel
    const dry = P.dry, wet = P.wet, film = P.film, foam = P.foam, lum = P.lum, lc = P.lightC;
    const amb = P.amb, dif = P.dif, lumX = P.lumX, lumA = P.lumA;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x, o = 3 * p;
        let r = 0, g = 0, b = 0;
        if (y < YH) { // sky
          const t = (y / (YH - 1)) ** 1.5;
          r = P.skyT[0] + (P.skyH[0] - P.skyT[0]) * t; g = P.skyT[1] + (P.skyH[1] - P.skyT[1]) * t; b = P.skyT[2] + (P.skyH[2] - P.skyT[2]) * t;
          const dd = Math.hypot(x - lumX, y - P.lumY);
          const halo = lumA * Math.exp(-dd / (P.sun ? 5 : 3.2)) * (P.sun ? 0.35 : 0.2);
          if (STAR[p] > 0 && P.star > 0) {
            const tw = STAR[p] * P.star * (0.65 + 0.35 * Math.sin(tn * RRT[p] * 0.7 + RPH[p])) * (1 - kit.clamp(halo * 6));
            r += tw * 0.9; g += tw * 0.92; b += tw;
          }
          r += lum[0] * halo; g += lum[1] * halo; b += lum[2] * halo;
          const disc = lumA * kit.clamp(P.lumR + 0.5 - dd);
          if (disc > 0) { r += (P.disc[0] - r) * disc; g += (P.disc[1] - g) * disc; b += (P.disc[2] - b) * disc; }
          img[o] = r; img[o + 1] = g; img[o + 2] = b;
          continue;
        }
        const q = y - YW[x];
        const colW = 1.2 + 0.2 * (y - YH), cx = (x - lumX) / colW;
        const inCol = cx * cx < 9 && lumA > 0;
        const glit = inCol ? lumA * Math.exp(-cx * cx) * Math.max(0, kit.noise3(x * 0.8, y * 1.6, tn * 2.0) - 0.48) * 3.2 : 0;
        if (q < 0) { // the sea
          const dT = (y - YH) / (YW[x] - YH);
          const v = 0.75 + 0.5 * kit.noise3(x * 0.06, (y - YH) * 0.4 - tn * 0.9, tn * 0.05);
          const hz = 0.3 * (1 - dT) ** 4;
          r = (P.seaF[0] + (P.seaN[0] - P.seaF[0]) * dT) * v + P.skyH[0] * hz;
          g = (P.seaF[1] + (P.seaN[1] - P.seaF[1]) * dT) * v + P.skyH[1] * hz;
          b = (P.seaF[2] + (P.seaN[2] - P.seaF[2]) * dT) * v + P.skyH[2] * hz;
          r += lum[0] * glit; g += lum[1] * glit; b += lum[2] * glit;
          let fo = 0, pk = 0;
          for (const e of events) {
            const tau = now - e.T;
            if (tau < -3.2 || tau > 3) continue;
            const big = e.kind === 2 ? 2.2 : e.kind === 1 ? 1.35 : 1;
            const ci = Math.min(1, e.A[x] / 8) * big;
            if (tau < 0) {
              const u = 1 + tau / 3.2, yc = YH + (YW[x] - YH) * u ** 1.35, dy = y - yc;
              const crest = Math.exp(-(dy * dy) / (0.3 + 0.9 * u)) * ci * (0.25 + 0.75 * u);
              fo += crest * 0.35;
              const br = kit.smoothstep(0.68, 0.95, u);
              if (br > 0 && dy < 0.6 && dy > -(1 + 3.5 * u)) {
                const lace = 0.35 + 0.65 * kit.noise2(x * 0.5, y * 1.3 + tn * 0.8);
                fo += br * ci * lace * 0.8; pk += br * ci;
              }
            } else if (q > -4.5) {
              const lace = 0.3 + 0.7 * kit.noise2(x * 0.45, y * 1.2 - tn * 0.6);
              const fade = Math.exp(-tau / 1.3) * ci * (1 + q / 4.5);
              fo += fade * lace * 0.6; pk += fade * 0.7;
            }
          }
          if (fo > 0) { r += foam[0] * fo; g += foam[1] * fo; b += foam[2] * fo; }
          if (pk > 0) {
            const sp = sparkle(p, tn) * pk * plank * 2.2, gl = pk * plank * 0.5;
            r += SPARK[0] * sp + GLOW[0] * gl; g += SPARK[1] * sp + GLOW[1] * gl; b += SPARK[2] * sp + GLOW[2] * gl;
          }
          img[o] = r; img[o + 1] = g; img[o + 2] = b;
          continue;
        }
        // the beach: wetness from the waves that have run over this spot
        let wt = q < 1.5 ? 1 : 0.32 * Math.max(0, 1 - q / 12);
        if (q < maxA[x]) {
          for (const e of events) {
            const A = e.A[x];
            if (q >= A) continue;
            const age = now - (e.T + e.Tu + e.Td * Math.sqrt(1 - q / A));
            if (age >= 0) { const v = Math.exp(-age / 14); if (v > wt) wt = v; }
          }
        }
        // relief lit by the raking moon (or sun)
        const xl = x > 0 ? p - 1 : p, xr = x < W - 1 ? p + 1 : p, yu = y > 0 ? p - W : p, yd = y < H - 1 ? p + W : p;
        const hx = (Hf[xr] - Hf[xl]) * 0.5, hy = (Hf[yd] - Hf[yu]) * 0.5;
        const dl = (-hx * Lx - hy * Ly + Lz) / Math.sqrt(hx * hx + hy * hy + 1);
        let lit = dl > 0 ? dl / Lz : 0; if (lit > 3) lit = 3;
        const gd = Gd[p], ao = 1 - 0.85 * kit.smoothstep(0.3, 0.8, gd);
        const hl = lit > 1.1 ? (lit - 1.1) * (0.9 + 1.6 * nightK) : 0;
        const sh = (amb * (1 - 0.35 * nightK * kit.clamp(gd * 2)) + dif * lit + hl) * ao * ALB[p] * (1 - 0.18 * wt);
        r = (dry[0] + (wet[0] - dry[0]) * wt) * lc[0] * sh;
        g = (dry[1] + (wet[1] - dry[1]) * wt) * lc[1] * sh;
        b = (dry[2] + (wet[2] - dry[2]) * wt) * lc[2] * sh;
        // the raised lip of a groove catches the moon on its lit side
        const lp = Lp[p];
        if (lp > 0.05 && nightK > 0) {
          const rim = nightK * lumA * (lp > 0.5 ? 1 : lp * 2) * (0.35 + 0.65 * kit.clamp(lit - 0.6));
          r += lum[0] * rim * 0.42; g += lum[1] * rim * 0.42; b += lum[2] * rim * 0.42;
        }
        // wet sand is a mirror: the moon's path and a little sky
        const mir = wt * (glit * 0.8 + 0.05);
        r += lum[0] * mir; g += lum[1] * mir; b += lum[2] * mir;
        const fr = front[x];
        if (q < fr) { // under the swash film: dark glassy water, ripples catching the moon, a lace of foam at its edge
          const fd = fr - q, thin = Math.exp(-fd / 2.5), up = fUp[x], tau = fTau[x];
          const rp = kit.noise3(x * 0.32, q * 0.8 - tn * (up ? 2.2 : -1.2), tn * 0.4);
          const gl2 = (rp > 0.58 ? (rp - 0.58) * 2.4 : 0) * (0.35 + 0.65 * lumA);
          r = r * 0.42 + film[0] * (0.5 + 0.5 * thin); g = g * 0.42 + film[1] * (0.5 + 0.5 * thin); b = b * 0.42 + film[2] * (0.5 + 0.5 * thin);
          const sheen = gl2 * 0.5 + (up ? 0.2 : 1) * thin * (0.1 + glit * 1.5) * (0.4 + 0.6 * lumA);
          r += lum[0] * sheen; g += lum[1] * sheen; b += lum[2] * sheen;
          const lace = kit.noise2(x * 0.55, q * 0.8 - tn * 0.5);
          let fo = 0;
          if (up) fo = Math.exp(-fd / 1.6) * (0.55 + 0.45 * lace) + Math.exp(-tau / 0.7) * Math.max(0, lace - 0.35) * 0.9;
          else if (fd < 6) fo = Math.exp(-fd / 2.2) * Math.max(0, lace - 0.42) * 1.6 * Math.exp(-Math.max(0, tau - 1.5) / 2.2);
          r += foam[0] * fo; g += foam[1] * fo; b += foam[2] * fo;
          const pk = (up ? 1 : 0.3) * Math.exp(-fd / 1.8) * plank * (up ? Math.min(1, 0.4 + Math.exp(-tau / 1.2)) : 1);
          let gl = pk * 0.55;
          if (fKind[x] === 2) gl += plankH * (0.3 * (0.35 + 0.65 * Math.exp(-fd / 6)) + (up ? 1.1 : 0.4) * Math.exp(-fd / 1.4));
          const sp = sparkle(p, tn) * pk * 1.8 + (fKind[x] === 2 ? sparkle(p, tn * 0.7) * plankH * 0.5 : 0);
          r += SPARK[0] * sp + GLOW[0] * gl; g += SPARK[1] * sp + GLOW[1] * gl; b += SPARK[2] * sp + GLOW[2] * gl;
        }
        const gp = GL[p];
        if (gp > 0) {
          const sh2 = gp * (0.8 + 0.4 * kit.noise2(x * 0.4 + tn * 0.5, y * 0.4));
          r += GLOW[0] * sh2 + SPARK[0] * sh2 * 0.35; g += GLOW[1] * sh2 + SPARK[1] * sh2 * 0.35; b += GLOW[2] * sh2 + SPARK[2] * sh2 * 0.35;
        }
        img[o] = r; img[o + 1] = g; img[o + 2] = b;
      }
    }
    // plankton flashes where feet touch wet sand
    for (let i = 0; i < prints.length; i += 2) {
      const f = prints[i], a = Math.exp(-(now - f.tc) / 0.7) * plank * prints[i + 1];
      if (a < 0.02) continue;
      for (let y = Math.floor(f.y - 2); y <= f.y + 2; y++) for (let x = Math.floor(f.x - 2); x <= f.x + 2; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const dd = Math.hypot(x - f.x, y - f.y), v = a * Math.max(0, 1 - dd / 2.2) * 0.9, o = 3 * (y * W + x);
        img[o] += SPARK[0] * v; img[o + 1] += SPARK[1] * v; img[o + 2] += SPARK[2] * v;
      }
    }

    // ---- the crab, who keeps to the dry sand on the right
    const cp = 4.1, ci = Math.floor(tn / cp), cu = (tn - ci * cp) / 1.0;
    const cpos = (i) => [134 + 50 * kit.hash(i % 100000, 11), 41 + 16 * kit.hash(i % 100000, 12)];
    const ca = cpos(ci - 1), cb = cpos(ci), cs = kit.smoothstep(0, 1, cu);
    const crabX = kit.lerp(ca[0], cb[0], cs);
    drawCrab(img, W, H, crabX, kit.lerp(ca[1], cb[1], cs), cu * 4, cu < 1);

    // ---- the frog and its stick
    const F = frogState(now, pp, pn, events);
    const bu = kit.fract(tn / 4.7 + 0.3), blink = bu < 0.05 ? Math.sin((Math.PI * bu) / 0.05) : 0;
    const idle = !F.tip && !F.moving;
    // idle: it watches the crab, and now and then taps its stick (a spark of plankton where it lands)
    const look = idle ? kit.lerp(F.look, kit.clamp((crabX - F.x) / 25, -1, 1), 0.7) : F.look;
    const tu = kit.fract(tn / 7.3), tap = idle && tu < 0.1 ? 3.2 * Math.sin(Math.PI * tu / 0.1) : 0;
    const hand = drawFrog(img, W, H, F.x, F.y, { lift: F.lift, phase: F.phase, moving: F.moving, blink, look, t: tn });
    const tip = F.tip || [hand[0] - 1.2, F.y + 0.8 - F.lift * 0.6 - tap];
    if (idle && tu >= 0.1 && tu < 0.25) {
      const a = (1 - (tu - 0.1) / 0.15) * plank * 0.9;
      for (let y = Math.floor(tip[1] - 2); y <= tip[1] + 2; y++) for (let x = Math.floor(tip[0] - 2); x <= tip[0] + 2; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const v = a * Math.max(0, 1 - Math.hypot(x - tip[0], y - tip[1]) / 2.4), o = 3 * (y * W + x);
        img[o] += SPARK[0] * v; img[o + 1] += SPARK[1] * v; img[o + 2] += SPARK[2] * v;
      }
    }
    const dx = hand[0] - tip[0], dy = hand[1] - tip[1], dl = Math.hypot(dx, dy) || 1;
    const sx = hand[0] + (dx / dl) * 4.5, sy = hand[1] + (dy / dl) * 4.5;
    drawLine(img, W, H, tip[0], tip[1], sx, sy, 2.4, STICK_K, 0.8);
    drawLine(img, W, H, tip[0], tip[1], sx, sy, 1.2, STICK);

    kit.blitGrid(ctx, img, 1 - 0.3 * ctx.night);

    // ----- helpers that stamp numerals into the relief
    function stampFull(f, glow) {
      const { bx, by, bw, bh, hFull } = f;
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        const h = hFull[j * bw + i];
        if (h === 0) continue;
        const x = bx + i, y = by + j, p = y * W + x;
        Hf[p] += h; if (h > 0) Lp[p] += h;
        if (h < 0) {
          Gd[p] -= h;
          const tk = TA[x] > 0 ? TA[x] * kit.clamp(TR[x] - y) : 0;
          if (glow + tk > 0) GL[p] -= h * (glow + tk);
        }
      }
    }
    function stampSoft(f, r, k, glow) {
      const { bx, by, bw, bh, dist } = f, lim = 5 * r * (1 + 0.9 * k);
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        const d = dist[j * bw + i];
        if (d > lim) continue;
        const pr = press(f.sAt[j * bw + i], f.L), h = prof(d, r * (0.7 + 0.3 * pr), k) * pr, p = (by + j) * W + bx + i;
        Hf[p] += h; if (h > 0) Lp[p] += h;
        if (h < 0) { Gd[p] -= h; if (glow > 0) GL[p] -= h * glow; }
      }
    }
    function stampWrite(f, r, pr, pen, penFade, fresh, glow) {
      const { bx, by, bw, bh, dist, sAt, L } = f, lim = 5 * r;
      if (pr > 0) {
        pileTmp.fill(0, 0, bw * bh);
        for (const e of f.ends) {
          if (pr >= e.s) addPile(pileTmp, f, e.x + e.dx * 1.6 * r, e.y + e.dy * 1.6 * r, r, 1);
          else if (pr > e.s0) { // the heap travels with the stick
            const a = f.tip(pr), b = f.tip(Math.max(0, pr - 1.5)), l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
            addPile(pileTmp, f, a[0] + ((a[0] - b[0]) / l) * 1.6 * r, a[1] + ((a[1] - b[1]) / l) * 1.6 * r, r, kit.clamp((pr - e.s0) / 4));
            break;
          } else break;
        }
        for (let k = 0; k < bw * bh; k++) if (pileTmp[k] !== 0) Hf[(by + ((k / bw) | 0)) * W + bx + (k % bw)] += pileTmp[k];
      }
      for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
        const k = j * bw + i, d = dist[k];
        if (d > lim) continue;
        const sa = sAt[k], p = (by + j) * W + bx + i;
        if (pr >= 0) {
          const drawn = pr >= L ? 1 : kit.clamp((pr - sa) / 1.2 + 0.5);
          if (drawn > 0) {
            const ps = press(sa, L), h = prof(d, r * (0.7 + 0.3 * ps), 0) * ps * drawn;
            Hf[p] += h; if (h > 0) Lp[p] += h;
            if (h < 0) {
              Gd[p] -= h;
              const fr = fresh > 0 ? fresh * Math.exp(-Math.max(0, pr - sa) / 22) * 1.6 : 0;
              GL[p] -= h * (glow + fr);
            }
          }
        }
        // the hour: the sea writes the new numeral in plankton light first
        if (pen > sa && penFade > 0) {
          const behind = pr >= sa ? Math.max(0, 1 - (pr - sa) / (0.3 * L)) : 1;
          const u = d / (r * 1.05);
          GL[p] += Math.exp(-u * u) * penFade * behind * 1.4 * (0.6 + 0.4 * Math.max(0, 1 - (pen - sa) / 30));
        }
      }
    }
  },
};
