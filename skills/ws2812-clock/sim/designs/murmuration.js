// Murmuration: several thousand starlings over a reed bed, black against a
// sky that follows the real time of day. The time is written in birds: each
// numeral is a ribbon the flock streams along, so the digits are the
// densest parts of one living cloud, swelling, rippling and ragged with
// stragglers. Light through the sky is cut by every bird it crosses, so a
// numeral is darkness, not light.
//
// Minute: the changing numeral's birds peel off along their own stroke, fly
// one big loop through open sky as a twisting ribbon, and pour into the new
// shape in stroke order. Hour: a peregrine stoops through the hours. The
// flock flash-expands round it, a density wave rings out through every
// bird, and the hour's birds scatter and regather as the new hour.
import * as kit from '../js/kit.js';
import { buildDigit } from './murmuration-glyphs.js';

const W = 64, H = 64, N = W * H;
const EPOCH = 1.7e9;
// every periodic motion runs at a multiple of OM0, so its phase can use time
// reduced mod TP: Math.sin of a huge argument is several times slower
const OM0 = 0.05, TP = kit.TAU / OM0;
const q05 = (f) => Math.max(1, Math.round(f / OM0)) * OM0;
const HORIZON = 56;           // sky rows 0..56, water below
const MIN_DUR = 2.4, MIN_ST = 0.3;
// the hour: the falcon enters at F0 and strikes the hours at TS; the old
// minutes leave only after the strike, so no wrong hour:minute pair shows
const F0 = 0.0, TS = 0.8, HR_DUR = 1.5, HR_MIN_DELAY = 0.5, HR_MIN_DUR = 1.8;
const { clamp, smoothstep, lerp } = kit;
// kit.hash leaves lattice structure between neighbouring c values, which
// lines thousands of birds up in streaks: a properly mixed hash instead
const mix32 = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x; };
const hash = (a, b = 0, c = 0) => (mix32(mix32(mix32(a | 0) ^ (b * 0x9e3779b9)) ^ (c * 0x632be5ab)) >>> 0) / 4294967296;
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ------------------------------------------------------------ the slots
// Hours large in the upper left, minutes smaller lower right: one flock
// banking down the sky, open sky top right and reeds bottom left.
const SLOTS = [
  { x: 3, y: 4, w: 15, h: 25, hw: 1.85, n: 860, lc: [12, 40], sc: [1, 1], dir: 1 },
  { x: 21, y: 4, w: 15, h: 25, hw: 1.85, n: 860, lc: [48, 13], sc: [1, 1], dir: -1 },
  { x: 33, y: 33, w: 11, h: 18, hw: 1.45, n: 460, lc: [25, 43], sc: [1, 0.45], dir: -1 },
  { x: 48, y: 33, w: 11, h: 18, hw: 1.45, n: 460, lc: [50, 26], sc: [0.6, 1], dir: 1 },
];
const SLANT = 0.13;
for (const [k, S] of SLOTS.entries()) {
  S.k = k;
  S.cx = S.x + S.w / 2 + 0.5 * SLANT * S.h; S.cy = S.y + S.h / 2;
  S.r = new Float32Array(S.n); S.nl = new Float32Array(S.n); S.amp = new Float32Array(S.n);
  S.p1 = new Float32Array(S.n); S.p2 = new Float32Array(S.n); S.f1 = new Float32Array(S.n); S.f2 = new Float32Array(S.n);
  S.sj = new Float32Array(S.n); S.rnd = new Float32Array(S.n);
  for (let j = 0; j < S.n; j++) {
    const h1 = hash(j, k, 1), h2 = hash(j, k, 2), h3 = hash(j, k, 3);
    S.r[j] = (j + 0.5) / S.n;
    const strag = h3 < 0.14;
    S.nl[j] = (h1 + h2 - 1) * (strag ? 2.4 + hash(j, k, 11) : 1);              // triangular: dense spine, soft edges
    S.amp[j] = strag ? 1.1 + 2.2 * hash(j, k, 4) : 0.25 + 0.35 * hash(j, k, 4);
    S.p1[j] = hash(j, k, 5) * kit.TAU; S.p2[j] = hash(j, k, 6) * kit.TAU;
    S.f1[j] = q05(0.5 + 1.1 * hash(j, k, 7)); S.f2[j] = q05(0.5 + 1.1 * hash(j, k, 8));
    S.sj[j] = (hash(j, k, 9) - 0.5) * 3;
    S.rnd[j] = hash(j, k, 10);
  }
  S.v = k % 2 ? 3.2 : 3.8;     // stream speed, px/s
  S.alpha = k < 2 ? 0.95 : 1.0;
}
const glyphs = new Map();
function glyph(d, k) {
  const key = d + ':' + k;
  let g = glyphs.get(key);
  if (!g) {
    const S = SLOTS[k];
    g = buildDigit(d, { x: S.x, y: S.y, w: S.w, h: S.h, slant: SLANT });
    glyphs.set(key, g);
  }
  return g;
}
for (const S of SLOTS) {
  let s = 0;
  for (let d = 0; d < 10; d++) s += glyph(d, S.k).len;
  S.ref = s / 10;
}

// ------------------------------------------------------------ bird paths
let sx = 0, sy = 0, snx = 0, sny = 0, swd = 1;
function sample(s, sg) {
  const q = sg / s.step;
  let i = q | 0;
  if (i >= s.m - 1) i = s.m - 2;
  if (i < 0) i = 0;
  const f = q - i;
  sx = s.X[i] + (s.X[i + 1] - s.X[i]) * f; sy = s.Y[i] + (s.Y[i + 1] - s.Y[i]) * f;
  snx = s.NX[i] + (s.NX[i + 1] - s.NX[i]) * f; sny = s.NY[i] + (s.NY[i + 1] - s.NY[i]) * f;
  swd = s.WD[i] + (s.WD[i + 1] - s.WD[i]) * f;
}
let hx = 0, hy = 0;
/** Where bird j of slot S is, at rest in glyph g, at time tt: sets hx, hy. */
function home(g, S, j, tt, tr, breath, bph) {
  const r = S.r[j], st = g.strokes;
  let k = 0;
  while (k < st.length - 1 && r >= st[k].c1) k++;
  const s = st[k], f = (r - s.c0) / (s.c1 - s.c0);
  const n = S.nl[j];
  const flow = S.v * tt + S.sj[j];
  // the ribbon twists as it streams: edge-on it pinches thin and dark, face-on it
  // spreads pale; the same birds either way
  const hw = S.hw * breath * (0.55 + 0.5 * Math.abs(Math.cos(0.2 * (f * s.L + S.sj[j]) + bph)));
  if (s.closed) {
    let sg = f * s.L + flow; sg -= s.L * Math.floor(sg / s.L);
    sample(s, sg);
    hx = sx + snx * n * hw * swd; hy = sy + sny * n * hw * swd;
  } else {
    const a = Math.abs(n) * hw, L = s.L, me = s.m - 1;
    const c0 = Math.max(1e-3, a * s.WD[0]), c1 = Math.max(1e-3, a * s.WD[me]);
    const Lj = 2 * L + Math.PI * (c0 + c1);
    let sg = f * Lj + flow; sg -= Lj * Math.floor(sg / Lj);
    if (sg < L) {
      sample(s, sg); hx = sx + snx * a * swd; hy = sy + sny * a * swd;
    } else if (sg < L + Math.PI * c1) {
      const th = (sg - L) / c1, c = Math.cos(th), si = Math.sin(th);
      hx = s.X[me] + c1 * (c * s.NX[me] + si * s.TX[me]); hy = s.Y[me] + c1 * (c * s.NY[me] + si * s.TY[me]);
    } else if (sg < 2 * L + Math.PI * c1) {
      sample(s, 2 * L + Math.PI * c1 - sg); hx = sx - snx * a * swd; hy = sy - sny * a * swd;
    } else {
      const th = (sg - 2 * L - Math.PI * c1) / c0, c = Math.cos(th), si = Math.sin(th);
      hx = s.X[0] - c0 * (c * s.NX[0] + si * s.TX[0]); hy = s.Y[0] - c0 * (c * s.NY[0] + si * s.TY[0]);
    }
  }
  const am = S.amp[j];
  hx += am * Math.sin(S.f1[j] * tr + S.p1[j]);
  hy += am * Math.sin(S.f2[j] * tr + S.p2[j]);
}

// the haze: the flock's thin body, loose birds drifting down a diagonal band
// round the numerals, so the digits read as the dense parts of one cloud
const ZN = 2200;
const zt = new Float32Array(ZN), zo = new Float32Array(ZN), za = new Float32Array(ZN), zf1 = new Float32Array(ZN), zf2 = new Float32Array(ZN), zp = new Float32Array(ZN);
for (let j = 0; j < ZN; j++) {
  zt[j] = hash(j, 61, 1); zo[j] = hash(j, 61, 2);
  za[j] = 0.8 + 2 * hash(j, 61, 5); zf1[j] = q05(0.15 + 0.4 * hash(j, 61, 6)); zf2[j] = q05(0.15 + 0.4 * hash(j, 61, 7)); zp[j] = hash(j, 61, 8) * kit.TAU;
}

// ------------------------------------------------------------ the falcon
const SP = [0, 0];
let fx = 0, fy = 0;
function falconAt(tau) {
  if (tau < 0.8) {
    const u = (tau / 0.8) ** 1.6, a = 1 - u;
    const P0x = SP[0] + 35, P0y = SP[1] - 21, Cx = SP[0] + 13, Cy = SP[1] - 15;
    fx = a * a * P0x + 2 * a * u * Cx + u * u * SP[0]; fy = a * a * P0y + 2 * a * u * Cy + u * u * SP[1];
  } else {
    const u = (tau - 0.8) / 1.2, a = 1 - u;
    const Cx = SP[0] - 20, Cy = SP[1] + 17, Ex = SP[0] - 50, Ey = SP[1] - 18;
    fx = a * a * SP[0] + 2 * a * u * Cx + u * u * Ex; fy = a * a * SP[1] + 2 * a * u * Cy + u * u * Ey;
  }
}
const wake = new Float32Array(12);   // 6 past falcon positions
const wakeK = new Float32Array(6);
let wx_ = 0, wy_ = 0;
/** Flash expansion: birds flee the falcon, opening a clean bubble of sky
 *  round it (d -> d + R e^(-d^2/R^2) is monotonic: no bird crosses another);
 *  older positions leave a closing wake. Sets wx_, wy_. */
function flee(x, y, n) {
  for (let q = 0; q < n; q++) {
    const R = 6.5 * wakeK[q], dx = x - wake[2 * q], dy = y - wake[2 * q + 1], d2 = dx * dx + dy * dy;
    if (d2 > 9 * R * R) continue;
    const d = Math.sqrt(d2) + 1e-4, k = R * Math.exp(-d2 / (R * R)) / d;
    x += dx * k; y += dy * k;
  }
  wx_ = x; wy_ = y;
}

// ------------------------------------------------------------ the sky
// Keyframes by hour of day: [hour, top, mid, horizon] (sRGB).
const KEYS = [
  [0.0, '#1a2c6a', '#28448a', '#4656a0'],
  [4.6, '#1a2c6a', '#28448a', '#4656a0'],
  [5.6, '#262e6c', '#4a4a90', '#b06a90'],
  [6.5, '#3a4e90', '#c88296', '#ffb072'],
  [8.0, '#4474c0', '#8ab4e0', '#f2d8b0'],
  [11.0, '#4480d0', '#7cb0e6', '#d2e2ee'],
  [15.5, '#427ac8', '#80b0e2', '#dae2e6'],
  [17.2, '#4a66aa', '#d49a7a', '#ffcc7a'],
  [18.2, '#52449a', '#b85a80', '#ff9a48'],
  [19.1, '#3a3c8c', '#844c90', '#d8687e'],
  [20.2, '#26347c', '#40448c', '#6a4c88'],
  [21.2, '#1a2c6a', '#28448a', '#4656a0'],
  [24.0, '#1a2c6a', '#28448a', '#4656a0'],
].map(([h, a, b, c]) => [h, kit.hex(a), kit.hex(b), kit.hex(c)]);
function palette(hf) {
  let i = 0;
  while (KEYS[i + 1][0] <= hf) i++;
  const A = KEYS[i], B = KEYS[i + 1], u = smoothstep(0, 1, (hf - A[0]) / (B[0] - A[0]));
  return [kit.mix(A[1], B[1], u), kit.mix(A[2], B[2], u), kit.mix(A[3], B[3], u)];
}
const base = new Float32Array(3 * N);
const cloudCol = [0, 0, 0];
let skyKey = -1, starAmt = 0;
function buildSky(date) {
  const hf = date.getHours() + date.getMinutes() / 60;
  const [top, mid, hor] = palette(hf);
  // sun and moon on arcs over the reeds
  const sunF = (hf - 6.1) / 12.4, moonF = (((hf - 19.4) % 24) + 24) % 24 / 11.4;
  const sunOn = sunF > -0.03 && sunF < 1.03, moonOn = moonF > -0.03 && moonF < 1.03;
  const sunX = 6 + 52 * sunF, sunY = HORIZON + 1 - 48 * Math.sin(Math.PI * clamp(sunF));
  const moonX = 6 + 52 * moonF, moonY = HORIZON + 1 - 44 * Math.sin(Math.PI * clamp(moonF));
  const low = 1 - clamp(Math.sin(Math.PI * clamp(sunF)) * 2.2);   // 1 near horizon
  const sunC = kit.blackbody(lerp(5600, 2300, low));
  const day = clamp((Math.min(hf - 5.5, 19.8 - hf)) / 2);
  starAmt = 1 - clamp((Math.min(hf - 4.8, 20.6 - hf) + 0.3) / 1.2) * (hf > 4.8 && hf < 20.6 ? 1 : 0);
  if (!(hf > 4.8 && hf < 20.6)) starAmt = 1;
  for (let y = 0; y <= HORIZON; y++) {
    const v = y / HORIZON;
    const c = v < 0.55 ? kit.mix(top, mid, smoothstep(0, 0.55, v)) : kit.mix(mid, hor, smoothstep(0.55, 1, v) ** 1.3);
    for (let x = 0; x < W; x++) {
      const p = 3 * (y * W + x);
      let r = c[0], g = c[1], b = c[2];
      if (sunOn) {
        const d2 = (x - sunX) ** 2 + (y - sunY) ** 2;
        const glow = (0.5 * low + 0.12) * Math.exp(-d2 / 260) + 0.25 * low * Math.exp(-((x - sunX) ** 2) / 500 - ((HORIZON - y) ** 2) / 40);
        const disc = 1 - smoothstep(2.6, 3.6, Math.sqrt(d2));
        r += sunC[0] * (glow + disc); g += sunC[1] * (glow + disc); b += sunC[2] * (glow + disc);
      }
      if (moonOn) {
        const d = Math.hypot(x - moonX, y - moonY), dc = Math.hypot(x - moonX - 1.5, y - moonY + 0.9);
        const disc = (1 - smoothstep(2.6, 3.5, d)) * (0.15 + 0.85 * smoothstep(2.2, 3.4, dc));
        const glow = 0.05 * Math.exp(-(d * d) / 120);
        r += 0.42 * disc + glow * 0.7; g += 0.42 * disc + glow * 0.8; b += 0.36 * disc + glow;
      }
      base[p] = r; base[p + 1] = g; base[p + 2] = b;
    }
  }
  const lit = kit.mix(hor, [1, 0.95, 0.9], 0.35 * day);
  const cc = kit.mix(kit.scale(mid, 0.5), kit.scale(lit, 0.6), clamp(day + 0.6 * (1 - starAmt)));
  cloudCol[0] = cc[0]; cloudCol[1] = cc[1]; cloudCol[2] = cc[2];
}
// cloud texture: long soft streaks, scrolled sideways
const CW = 128;
const clouds = new Float32Array(CW * 48);
for (let y = 0; y < 48; y++) for (let x = 0; x < CW; x++) {
  const fx2 = (x / CW) * 8, n = kit.fbm(fx2, y * 0.16, 0, 4) * 0.7 + 0.3 * kit.noise2(fx2 * 2, y * 0.5);
  // periodic in x: blend with the wrapped copy
  const n2 = kit.fbm(fx2 - 8, y * 0.16, 0, 4) * 0.7 + 0.3 * kit.noise2((fx2 - 8) * 2, y * 0.5);
  const u = x / CW, v = lerp(n, n2, u);
  clouds[y * CW + x] = smoothstep(0.52, 0.78, v) * (0.5 + 0.5 * Math.sin(Math.PI * clamp(y / 40)));
}
const STARS = Array.from({ length: 46 }, (_, i) => [Math.floor(hash(i, 5) * W), Math.floor(hash(i, 6) * 40), 0.25 + 0.75 * hash(i, 7), hash(i, 8) * kit.TAU]);

// ------------------------------------------------------------ land
const bankTop = new Float32Array(W);
for (let x = 0; x < W; x++) bankTop[x] = HORIZON + 0.55 - 0.8 * kit.noise2(x * 0.11, 3.3) - 0.9 * Math.exp(-(((x - 46) / 9) ** 2));
// the reed bed: thin stalks of common reed with drooping feathery plumes,
// leaf blades arching from a low base, two small clumps out in the water
const massTop = new Float32Array(W);
for (let x = 0; x < W; x++) {
  const env = x < 30 ? 2.6 * (1 - x / 30) + 0.9 : 1.6 * Math.exp(-(((x - 41) / 1.5) ** 2)) + 1.3 * Math.exp(-(((x - 57.5) / 1.2) ** 2));
  massTop[x] = env < 0.3 ? 99 : 64 - env - 0.8 * hash(x, 41);
}
const BLADES = [], STALKS = [];
for (let i = 0; i < 30; i++) {
  const clump = i >= 24, xb = clump ? (i < 27 ? 41 : 57.5) + (hash(i, 51) - 0.5) * 3 : hash(i, 51) * 30;
  const len = clump ? 2.5 + 3 * hash(i, 52) : (3 + 7 * hash(i, 52)) * (1 - 0.5 * xb / 30);
  BLADES.push({ xb, len, lean: (hash(i, 53) - 0.5) * 1.2, bend: (hash(i, 54) - 0.5) * 1.4, ph: hash(i, 55) * 6 });
}
for (let i = 0; i < 26; i++) {
  const clump = i >= 22, xb = clump ? (i < 24 ? 40.5 + i - 22 : 57 + (i - 24) * 1.3) : 0.3 + i * 1.32 + (hash(i, 61) - 0.5) * 1.1;
  const env = clump ? 6 + 2 * hash(i, 62) : 23 * (1 - xb / 31) ** 1.1 + 5;
  STALKS.push({ xb, h: env * (0.6 + 0.45 * hash(i, 63)), lean: (hash(i, 64) - 0.45) * 0.1, head: hash(i, 65) < (clump ? 0.6 : 0.45), ph: hash(i, 66) * 6 });
}

// ------------------------------------------------------------ buffers
const D = new Float32Array(N);    // bird density (optical depth)
const O = new Float32Array(N);    // reed / bank occlusion
const img = new Float32Array(3 * N);
function dep(A, x, y, a) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < -1 || iy < -1 || ix >= W || iy >= H) return;
  const fx2 = x - ix, fy2 = y - iy;
  const w00 = (1 - fx2) * (1 - fy2) * a, w10 = fx2 * (1 - fy2) * a, w01 = (1 - fx2) * fy2 * a, w11 = fx2 * fy2 * a;
  const p = iy * W + ix;
  if (iy >= 0) { if (ix >= 0) A[p] += w00; if (ix + 1 < W) A[p + 1] += w10; }
  if (iy + 1 < H) { if (ix >= 0) A[p + W] += w01; if (ix + 1 < W) A[p + W + 1] += w11; }
}

export default {
  name: 'Murmuration',
  blurb: 'the time written by thousands of starlings, black against a sky that follows the day; a peregrine at the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const date = ctx.date, nowS = date.getTime() / 1000, tt = nowS - EPOCH, tr = tt - TP * Math.floor(tt / TP);
    const M = Math.floor(nowS / 60) * 60, age = nowS - M;
    const next = digitsOf(date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = prev.slice(0, 2) !== next.slice(0, 2) && age < 8;
    const mk = Math.floor(nowS / 60);
    if (mk !== skyKey) { buildSky(date); skyKey = mk; }
    D.fill(0); O.fill(0);

    // the hour: strike point and falcon wake
    let nWake = 0, shock = false, Sx = 0, Sy = 0;
    if (hourTurn) {
      const c0 = prev[0] !== next[0], c1 = prev[1] !== next[1];
      Sx = c0 && c1 ? (SLOTS[0].cx + SLOTS[1].cx) / 2 : c0 ? SLOTS[0].cx : SLOTS[1].cx;
      Sy = SLOTS[1].cy - 1;
      SP[0] = Sx; SP[1] = Sy;
      for (let k = 0; k < 6; k++) {
        const tau = age - F0 - k * 0.1;
        if (tau < 0 || tau > 2.0) continue;
        falconAt(tau); wake[2 * nWake] = fx; wake[2 * nWake + 1] = fy; nWake++;
        wakeK[nWake - 1] = Math.exp(-k * 0.1 / 0.25) * smoothstep(0, 0.35, tau) * (1 - smoothstep(1.6, 2.0, tau));
      }
      shock = age > TS;
    }
    const sTau = age - TS, sR = 34 * sTau, sDecay = Math.exp(-sTau / 1.1);
    // the ambient density wave that crosses the flock every 11 s
    const wk = Math.floor(tt / 11), wph = tt / 11 - wk, wth = hash(wk, 91) * kit.TAU;
    const wcx = Math.cos(wth), wcy = Math.sin(wth), wfront = -48 + 140 * wph;

    // ---- birds
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], gN = glyph(+next[k], k), gO = glyph(+prev[k], k);
      const changed = prev[k] !== next[k];
      const breath = 1 + 0.12 * Math.sin(0.7 * tr + k * 1.3) + 0.05 * Math.sin(1.9 * tr + k);
      const bph = ((0.2 * S.v - 0.9) * tt) % kit.TAU + k * 1.7;
      // the same flock spread over a longer numeral is thinner: part-compensate
      const aN = S.alpha * (gN.len / S.ref) ** 0.6, aO = S.alpha * (gO.len / S.ref) ** 0.6;
      const blast = hourTurn && k < 2 && changed;
      let delay = 0;
      if (k === 3 && prev[2] !== next[2]) delay = 0.25;
      if (k === 1 && blast && prev[0] !== next[0]) delay = 0.12;
      if (hourTurn && k >= 2) delay += HR_MIN_DELAY;
      const dur = blast ? HR_DUR : hourTurn ? HR_MIN_DUR : MIN_DUR;
      const T = changed ? (age - (blast ? TS + delay : delay)) / dur : 2;
      const moving = T > 0 && T < 1;
      for (let j = 0; j < S.n; j++) {
        let x, y, a = aN;
        if (!moving) {
          home(T <= 0 ? gO : gN, S, j, tt, tr, breath, bph); x = hx; y = hy;
          if (T <= 0) a = aO;
        } else {
          home(gO, S, j, tt, tr, breath, bph); const ox = hx, oy = hy;
          home(gN, S, j, tt, tr, breath, bph); const nx = hx, ny = hy;
          if (!blast) {
            // nearly constant speed along the loop, so the ribbon stays dense
            const f = clamp((T - S.r[j] * MIN_ST) / (1 - MIN_ST)), e = 0.55 * f + 0.45 * f * f * (3 - 2 * f);
            const ang = S.dir * kit.TAU * e, rho = 1 + 0.3 * Math.sin(Math.PI * e);
            const vx = S.cx - S.lc[0], vy = S.cy - S.lc[1], cs = Math.cos(ang), sn = Math.sin(ang);
            const pe = Math.sin(Math.PI * e), kx = 1 + (S.sc[0] - 1) * pe, ky = 1 + (S.sc[1] - 1) * pe;
            const rx = (vx * cs - vy * sn) * rho * kx, ry = (vx * sn + vy * cs) * rho * ky;
            const rl = Math.hypot(rx, ry) || 1;
            const w0 = 1 - smoothstep(0, 0.28, e), w1 = smoothstep(0.72, 1, e);
            const lat = S.nl[j] * 1.3 * (0.25 + 0.75 * Math.abs(Math.cos(3 * Math.PI * e + S.r[j] * 5))) * pe;
            // in flight the wander calms so the ribbon stays tight
            const calm = 1 - 0.75 * pe, wx = S.amp[j] * Math.sin(S.f1[j] * tr + S.p1[j]) * calm, wy = S.amp[j] * Math.sin(S.f2[j] * tr + S.p2[j]) * calm;
            x = S.lc[0] + rx + w0 * (ox - S.cx) + w1 * (nx - S.cx) + (rx / rl) * lat + wx * (1 - w0 - w1);
            y = S.lc[1] + ry + w0 * (oy - S.cy) + w1 * (ny - S.cy) + (ry / rl) * lat + wy * (1 - w0 - w1);
            a = lerp(aO, aN, e);
          } else {
            const f = clamp((T - S.r[j] * 0.35) / 0.65), e = easeIO(f);
            const bx = lerp(ox, nx, e), by = lerp(oy, ny, e);
            const p = Math.sin(Math.PI * clamp(T / 0.75)) ** 1.2;
            let dx = bx - Sx, dy = by - Sy;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const mag = 7 * (0.45 + S.rnd[j]) * p, rot = 2.6 * p * (k === 0 ? 1 : -1);
            const cs = Math.cos(rot), sn = Math.sin(rot);
            x = bx + mag * (dx * cs - dy * sn); y = by + mag * (dx * sn + dy * cs);
            a = lerp(aO, aN, e);
          }
        }
        // ambient wave: birds bunch and bank as it passes
        const g = x * wcx + y * wcy - 32 * (wcx + wcy) - wfront;
        const band = Math.exp(-g * g / 20);
        x += 0.9 * band * wcx; y += 0.9 * band * wcy; a *= 1 + 0.55 * band;
        // falcon wake and shock ring
        if (nWake) { flee(x, y, nWake); x = wx_; y = wy_; }
        if (shock) {
          const dx = x - Sx, dy = y - Sy, d = Math.hypot(dx, dy) + 1e-3, gg = d - sR;
          const b2 = Math.exp(-gg * gg / 16) * sDecay;
          x += (dx / d) * 2.6 * b2; y += (dy / d) * 2.6 * b2; a *= 1 + 1.1 * b2;
        }
        dep(D, x, y, Math.abs(S.nl[j]) > 1 ? a * 1.4 : a);
      }
    }
    // the haze: the cloud's body, an elongated blob down the diagonal whose
    // outline breathes and bulges; its birds ride the outline as it morphs
    {
      const cx = 33 + 1.5 * Math.sin(tr * 0.1), cy = 29 + 1.2 * Math.sin(tr * 0.15 + 1);
      const ang = 0.68 + 0.06 * Math.sin(tr * 0.1 + 2), ca = Math.cos(ang), sa = Math.sin(ang);
      const RA = 39 + 2.5 * Math.sin(tr * 0.2), RB = 19 + 2 * Math.sin(tr * 0.25 + 1);
      for (let j = 0; j < ZN; j++) {
        const th = zt[j] * kit.TAU;
        const wob = 1 + 0.12 * Math.sin(3 * th + tr * 0.3) + 0.08 * Math.sin(5 * th - tr * 0.45 + 1) + 0.07 * Math.sin(2 * th + tr * 0.2);
        const rr = zo[j] ** 0.32 * wob, lx = Math.cos(th) * RA * rr, ly = Math.sin(th) * RB * rr;
        const am = za[j];
        let x = cx + lx * ca - ly * sa + am * Math.sin(zf1[j] * tr + zp[j]);
        let y = cy + lx * sa + ly * ca + am * Math.sin(zf2[j] * tr + zp[j] * 1.3);
        let a = 0.75;
        if (nWake) { flee(x, y, nWake); x = wx_; y = wy_; }
        if (shock) {
          const dx = x - Sx, dy = y - Sy, d = Math.hypot(dx, dy) + 1e-3, gg = d - sR;
          const b2 = Math.exp(-gg * gg / 16) * sDecay;
          x += (dx / d) * 3 * b2; y += (dy / d) * 3 * b2; a *= 1 + b2;
        }
        if (y < HORIZON) dep(D, x, y, a);
      }
    }
    // the falcon itself: a solid silhouette, wings swept into a teardrop in
    // the stoop, flung wide and beating as it pulls out
    if (hourTurn && age > F0 && age < F0 + 2.0) {
      const tau = age - F0;
      falconAt(tau); const x0 = fx, y0 = fy;
      falconAt(Math.min(2.0, tau + 0.02)); let ux = fx - x0, uy = fy - y0;
      const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const px = -uy, py = ux;
      const open = smoothstep(0.7, 1.15, tau), beat = Math.sin((tau - 0.9) * 22) * open;
      for (let s2 = -3.8; s2 <= 3.0; s2 += 0.3) {
        const wd = s2 > 2.0 ? 0.5 : s2 > -1.6 ? 1.0 : 0.6 + 0.4 * (-1.6 - s2);   // head, chest, fanned tail
        for (let w = -wd; w <= wd + 1e-3; w += 0.5) dep(D, x0 + ux * s2 + px * w, y0 + uy * s2 + py * w, 0.9);
      }
      const span = lerp(2.4, 7.5, open) * (1 - 0.3 * beat), back = lerp(4.0, 1.6, open) + 0.9 * beat;
      for (const sd of [-1, 1]) {
        // triangle: shoulder (front), tip, wing root (back)
        const Ax = x0 + ux * 1.0, Ay = y0 + uy * 1.0, Rx = x0 - ux * 1.2, Ry = y0 - uy * 1.2;
        const Tx = x0 - ux * back + px * span * sd, Ty = y0 - uy * back + py * span * sd;
        for (let a = 0; a <= 1.001; a += 0.1) for (let b = 0; a + b <= 1.001; b += 0.1)
          dep(D, Ax + a * (Tx - Ax) + b * (Rx - Ax), Ay + a * (Ty - Ay) + b * (Ry - Ay), 0.6);
      }
    }

    // ---- land: far bank and reeds
    for (let x = 0; x < W; x++) {
      const t0 = bankTop[x];
      for (let y = Math.floor(t0); y <= HORIZON; y++) O[y * W + x] = clamp(y + 1 - t0);
    }
    const gust = 0.6 + 0.4 * Math.sin(tr * 0.25);
    for (let x = 0; x < W; x++) {
      const top = massTop[x] + 0.5 * Math.sin(1.1 * tr + x * 0.5) * gust;
      for (let y = Math.max(0, Math.floor(top)); y < H; y++) O[y * W + x] += clamp(y + 1 - top);
    }
    for (const B of BLADES) {
      const sw = gust * 0.1 * Math.sin(0.8 * tr + B.xb * 0.25 + B.ph) + 0.04 * Math.sin(1.9 * tr + B.ph);
      const n = Math.ceil(B.len * 2);
      for (let q = 0; q <= n; q++) {
        const u = q / n, th = B.lean + (B.bend + sw * 2) * u;
        dep(O, B.xb + Math.sin(th) * B.len * u, 64.2 - Math.cos(th) * B.len * u, 0.5 * (1 - 0.5 * u));
      }
    }
    for (const R of STALKS) {
      const sw = gust * 0.09 * Math.sin(0.8 * tr + R.xb * 0.22 + R.ph) + 0.025 * Math.sin(1.9 * tr + R.ph * 2) + R.lean;
      const n = Math.ceil(R.h * 2);
      let tx = R.xb, ty = 64;
      for (let q = 0; q <= n; q++) {
        const u = q / n;
        tx = R.xb + sw * R.h * u * u; ty = 64.2 - R.h * u;
        // a cattail's seed head: the stalk thickens for a stretch below the tip
        dep(O, tx, ty, R.head && u > 0.74 && u < 0.92 ? 1.25 : u > 0.92 && R.head ? 0.35 : 0.55);
      }
    }

    // ---- compose: sky through birds, then water, then reeds
    const off = (tt * 0.45) % CW, oi = Math.floor(off), of = off - oi;
    const dim = 1 - 0.3 * ctx.night;
    for (let y = 0; y <= HORIZON; y++) {
      const cy = y - 4;
      for (let x = 0; x < W; x++) {
        const p = y * W + x, q = 3 * p;
        let r = base[q], g = base[q + 1], b = base[q + 2];
        if (cy >= 0 && cy < 48) {
          const ci = cy * CW, x0 = (x + oi) % CW, x1 = (x0 + 1) % CW;
          const c = (clouds[ci + x0] * (1 - of) + clouds[ci + x1] * of) * 0.3;
          r += cloudCol[0] * c; g += cloudCol[1] * c; b += cloudCol[2] * c;
        }
        const T = Math.exp(-D[p]);
        img[q] = r * T; img[q + 1] = g * T; img[q + 2] = b * T;
      }
    }
    if (starAmt > 0) {
      for (const [x, y, s, ph] of STARS) {
        const p = y * W + x, tw = 0.6 + 0.4 * Math.sin(tr * q05(1.3 + s) + ph);
        const v = 0.09 * s * tw * starAmt * Math.exp(-D[p]);
        img[3 * p] += v; img[3 * p + 1] += v; img[3 * p + 2] += v * 1.1;
      }
    }
    for (let y = HORIZON + 1; y < H; y++) {
      const my = 2 * HORIZON + 1 - y, fade = 0.5 - 0.035 * (y - HORIZON);
      for (let x = 0; x < W; x++) {
        const rip = Math.sin(y * 2.3 - tr * 1.2 + 0.8 * Math.sin(x * 0.27 + tr * 0.5 + y));
        const xs = clamp(x + rip * 0.35, 0, W - 1.001), xi = Math.floor(xs), xf = xs - xi;
        const a = 3 * (my * W + xi), bq = a + 3, q = 3 * (y * W + x);
        const k = fade * (0.78 + 0.22 * rip) * (1 - Math.min(1, O[my * W + xi]));
        img[q] = (img[a] * (1 - xf) + img[bq] * xf) * k;
        img[q + 1] = (img[a + 1] * (1 - xf) + img[bq + 1] * xf) * k;
        img[q + 2] = (img[a + 2] * (1 - xf) + img[bq + 2] * xf) * k * 1.05;
      }
    }
    for (let p = 0; p < N; p++) {
      const k = (1 - Math.min(1, O[p])) * dim;
      img[3 * p] *= k; img[3 * p + 1] *= k; img[3 * p + 2] *= k;
    }
    kit.blitGrid(ctx, img);
  },
};
