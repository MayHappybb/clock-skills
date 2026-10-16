// Soft Serve: an ice-cream parlour counter, and the time is four servings of
// soft serve. Each numeral is ONE ribbon of soft serve piped by the machine
// into the shape of its digit (softserve-glyphs.js: fat round ribbons, open
// counters, laid mostly bottom-up as a real serving is), a twist of a flavour
// and vanilla: chocolate 0, strawberry 1, pistachio 2, mango 3, blueberry 4,
// mint 5, cherry 6, lemon 7, Neapolitan 8 (three flavours), bubblegum 9. The
// hours stand in waffle cones in the counter's holder; the minutes, a size
// smaller, sit in a glass banana-split boat. Over each serving hangs its
// chrome star spout, under the machine that runs along the top.
//
// The time is alive. The twist runs: the stripes and the bead ridges of each
// ribbon travel along it all the time, as if it were still coming out of the
// nozzle, so every edge ripples. On every beat (once a second, staggered left
// to right) each serving wobbles like soft serve does: it squashes down on
// its vessel, rebounds and sways, its top swinging further than its base,
// alternating direction. A drip gathers on each cone's rim and runs down the
// waffle. :15 and :45 the machine pushes: a fat surge with a glint runs along
// every ribbon from start to tip. :30 the counter gets a knock: a big wobble
// wave runs left to right and a light sweep crosses the chrome and the glass.
//
// Minute turn, one continuous process: each changing serving sweats (a little
// stretch and shiver), then melts: it sags down onto its vessel, settling
// wider at the base, its top slumping sideways, stripes smearing into one
// glossy melt; the puddle thins and drains into the cone or the dish by
// :59.85. The spout's lamp comes on, a rope of soft serve drops from the
// spout to where the digit starts, and at :00 the nozzle pipes the new digit
// in one ribbon (two strokes for the 4) along its path, the rope swinging
// after the head; the rope breaks off and springs back up, and the new
// serving settles with a wobble. Changing digits melt right to left and are
// piped left to right, overlapping.
// Hour: when the new servings are in, a shower of rainbow sprinkles falls
// from the machine and sticks where it lands (on the hours all hour, on the
// minutes until they melt), the machine's light sweeps, a cherry drops onto
// the last serving and bounces, and the whole counter wobbles.
//
// Palette: a 1950s parlour: deep teal wall (calm, cool, the complement of the
// warm pastels, so the soft serve is the brightest, warmest thing on the
// glass), chrome, a cherry-red counter, waffle tan, and ten pastel flavours,
// each twisted with vanilla cream and keylined in a berry-black so every
// silhouette holds. Flat colour everywhere; the effects are the top-edge
// sheen on each ribbon, the glint of a surge, the glass tint and its glints,
// the light sweep, the fog off the freezer, lamps and drips. Night: the
// parlour is closed, the wall and chrome go dark, the backlight dims to 45 %,
// and the servings keep their colour, the brightest thing on the glass.
//
// Cost: the wall is one integer pass (two fog tile lookups a pixel); each
// serving is an inverse-warped lookup into its material map (two bytes, a
// band table), about 2,000 pixels a serving; the rest is kit shapes.
// No per-minute caches beyond the hour's sprinkle list.

import { clockFields, sin, hash, rand, to565 } from '../js/kit.js';
import { GLYPHS, GW, GH, M, DH, NONE } from './softserve-glyphs.js';
import { W, mixc, wall, machine, SPOUT_Y, cone, coneDrip, boatBack, boatFront, counter } from './softserve-scene.js';

const TAU = Math.PI * 2;
const GAX = M + 13, GAY = M + DH;          // the base centre of a digit, in map coordinates
const SLOTS = [
  { ax: 20, ay: 56, sc: 1, floor: 58 },      // floor: the row the vessel swallows everything below
  { ax: 51, ay: 56, sc: 1, floor: 58 },
  { ax: 99, ay: 58, sc: 0.84, floor: 62 },
  { ax: 132, ay: 58, sc: 0.84, floor: 62 },
];
const SPOUTS = SLOTS.map((p) => p.ax);

// ------------------------------------------------------------ flavours (flash: a 32-step band table each)
const CREAM = [0xfff1d6, 0xe0c497];
const FLAVOURS = [
  [0xb97a4c, 0x7f4c2a],   // 0 chocolate
  [0xff8fb1, 0xd45d80],   // 1 strawberry
  [0xb6e07c, 0x78a948],   // 2 pistachio
  [0xffbe4a, 0xd5861c],   // 3 mango
  [0xb3a2ff, 0x7c68d4],   // 4 blueberry
  [0x8ef0cf, 0x45b892],   // 5 mint
  [0xff6f82, 0xc43c50],   // 6 cherry
  [0xfff07a, 0xccb436],   // 7 lemon
  null,                   // 8 Neapolitan
  [0x86d5ff, 0x3d98cf],   // 9 bubblegum
];
const BANDS = FLAVOURS.map((fl, d) => {
  const t = new Int32Array(32);
  for (let i = 0; i < 32; i++) {
    if (d === 8) t[i] = i < 9 ? 0xb97a4c : i < 11 ? 0x7f4c2a : i < 20 ? 0xff8fb1 : i < 22 ? 0xd45d80 : i < 31 ? CREAM[0] : CREAM[1];
    else t[i] = i < 13 ? fl[0] : i < 16 ? fl[1] : i < 29 ? CREAM[0] : CREAM[1];
  }
  return t;
});
const MAIN = FLAVOURS.map((fl, d) => (d === 8 ? 0xff8fb1 : fl[0]));
const MELT = BANDS.map((t) => {   // the colour a flavour melts to: its average
  let r = 0, g = 0, b = 0;
  for (const c of t) { r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255; }
  return ((r >> 5) << 16) | ((g >> 5) << 8) | (b >> 5);
});
const KEY_DAY = 0x2a1220, KEY_NIGHT = 0x14080f;
const BEAD = Int8Array.from({ length: 8 }, (_, i) => Math.round(16 * Math.cos((TAU * (i + 0.5)) / 8)));
const GAUSS = Uint8Array.from({ length: 16 }, (_, i) => Math.round(255 * Math.exp(-((i / 3.2) ** 2))));

// ------------------------------------------------------------ easing
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const cl = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
/** Trapezoidal speed: eased in and out over `a` of the time, constant between. */
function trap(u, a = 0.18) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const v = 1 / (1 - a);
  if (u < a) return (v * u * u) / (2 * a);
  if (u < 1 - a) return v * (u - a / 2);
  return 1 - (v * (1 - u) * (1 - u)) / (2 * a);
}

// ------------------------------------------------------------ one strand of ribbon at a pixel
// state for the serving being drawn (module level: no closures in the loop)
let cH = 0, cPh = 0, cR = 34, cBead = 3, cBS = 0, cBA = 0, BAND = 0, GLINT = 0;
const KEY8 = 9;            // the keyline, 1.25 px

/** 0 nothing, 1 keyline, 2 ribbon (BAND set). s in 1/4 px, v in 1/8 px. */
function strand(s, v) {
  const av = v < 0 ? -v : v;
  let r = cR + ((BEAD[((s + cPh) >> 2) & 7] * cBead) >> 4);
  GLINT = 0;
  if (cBA) {
    let db = s - cBS;
    if (db < 0) db = -db;
    db >>= 2;
    if (db < 16) { r += (cBA * GAUSS[db]) >> 8; if (db < 3) GLINT = 1; }
  }
  if (r < 1) return 0;
  let rk = r + KEY8;
  if (s > cH) {
    // beyond the piping head: only its round tip, a clean cap (no bead, so it advances evenly)
    r = cR; rk = r + KEY8;
    const ds = (s - cH) * 2;
    if (ds >= rk) return 0;
    const dd = ds * ds + av * av;
    if (dd < r * r) { BAND = (s + (v >> 1) + cPh) & 31; return 2; }
    return dd < rk * rk ? 1 : 0;
  }
  if (av < r) { BAND = (s + (v >> 1) + cPh) & 31; return 2; }
  return av < rk ? 1 : 0;
}

const LUT = new Uint16Array(32), HI = new Uint16Array(32), GL = new Uint16Array(32);
const prevInk = new Uint8Array(W);

/** Draw serving `G` with warp P by inverse lookup into its material map. */
function serving(g, G, P) {
  const buf = g.buf, { ax, sc, k, shear, spread, wx, sag } = P, ay = P.ay + P.sink;
  const S = G.S, V = G.V, X = G.X, key = P.key;
  cH = P.head; cPh = P.ph; cBead = P.bead; cBS = P.bs; cBA = P.ba;
  // the nozzle starts thin: the first 16 px of a fresh ribbon fatten as the head moves on
  cR = P.head < 1e8 ? Math.round(P.r * Math.min(1, (P.head + 16) / 80)) : P.r;
  const HS = DH * sc, kk = sc * k;
  const y0 = Math.max(0, (ay - (GAY + 0.5) * kk) | 0), y1 = Math.min(P.floor, Math.ceil(ay + (GH - GAY) * kk));
  const reach = 26 * sc * (1 + spread) * wx + (shear < 0 ? -shear : shear);
  const xa = Math.max(0, (ax - reach) | 0), xb = Math.min(W, Math.ceil(ax + reach));
  prevInk.fill(0);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    // melting tops sag first: screen height h = kk * hg * (1 - sag * hg / DH), solved for hg
    const h = ay - (y + 0.5);
    let hg = h / kk, kl = kk;
    if (sag > 0.005 && h > 0) {
      const b = (kk * sag) / DH, disc = kk * kk - 4 * b * h;
      if (disc <= 0) { prevInk.fill(0, xa, xb); continue; }
      hg = (kk - Math.sqrt(disc)) / (2 * b);
      kl = kk * (1 - (2 * sag * hg) / DH);
    }
    const gy = GAY - hg;
    if (gy < 0 || gy >= GH) { prevInk.fill(0, xa, xb); continue; }
    const gyi = gy | 0, row = gyi * GW, out = y * W;
    const q = 1 - hg / DH, sx = 1 + spread * (q > 0 ? q * q : 0);
    const inv = 1 / (sc * sx * wx), xoff = (shear * h) / HS;
    let gxf = ((GAX + (xa + 0.5 - ax - xoff) * inv) * 256) | 0;
    const dg = (inv * 256) | 0;
    // a squashed serving piles up: a screen row covers several map rows, take the first with ribbon
    let rows = 1, r0 = row;
    if (kl < 0.85) {
      rows = Math.round(1 / (kl > 0.1 ? kl : 0.1));
      let ga = gyi - ((rows - 1) >> 1);
      if (ga < 0) ga = 0;
      if (ga + rows > GH) rows = GH - ga;
      r0 = ga * GW;
    }
    for (let x = xa; x < xb; x++, gxf += dg) {
      if (gxf < 0) { prevInk[x] = 0; continue; }
      const gxi = gxf >> 8;
      if (gxi >= GW) { prevInk[x] = 0; continue; }
      let r = 0;
      for (let q = 0, i = r0 + gxi; q < rows && r !== 2; q++, i += GW) {
        n++;
        const s0 = S[i];
        if (s0 === NONE) continue;
        // the latest strand lies on top; a keyline shows only where no strand has ribbon
        const a = strand(s0, V[i]);
        if (a === 2) { r = 2; break; }
        if (a === 1) r = 1;
        const ex = X.get(i);
        if (ex) for (let e = 0; e < ex.length; e += 2) { const b = strand(ex[e], ex[e + 1]); if (b === 2) { r = 2; break; } if (b === 1) r = 1; }
      }
      if (r === 2) {
        buf[out + x] = GLINT ? GL[BAND] : prevInk[x] ? LUT[BAND] : HI[BAND];
        prevInk[x] = 1;
      } else {
        if (r === 1) buf[out + x] = key;
        prevInk[x] = 0;
      }
    }
  }
  g.cost.px += n; g.cost.box += n * 9;
}

/** Where a point of the map lands on the glass under warp P. */
function forward(P, gx, gy) {
  const hg = GAY - gy, h = hg * P.sc * P.k * (1 - (P.sag * hg) / DH);
  const q = 1 - hg / DH, sx = 1 + P.spread * (q > 0 ? q * q : 0);
  return [P.ax + (gx - GAX) * P.sc * sx * P.wx + (P.shear * h) / (DH * P.sc), P.ay + P.sink - h];
}

// ------------------------------------------------------------ the beat
function wobble(j, s, big) {
  const lag = big ? 0.12 * j : 0.07 * j, sb = s - lag, n = Math.floor(sb), tau = sb - n;
  const amp = big && n === big ? 2.4 : 1;
  const dir = n & 1 ? 1 : -1;
  const e1 = Math.exp(-tau / 0.22), e2 = Math.exp(-tau / 0.42);
  // squash on the vessel, rebound, and a sway that starts a beat later (overlap)
  const ts = tau > 0.05 ? tau - 0.05 : 0;
  let k = 1 - 0.07 * amp * e1 * sin((TAU * tau) / 0.4);
  if (k > 1) k = 1 + (k - 1) * 0.35;      // the rebound stays under the spout
  return {
    k,
    shear: dir * 2.4 * amp * e2 * sin((TAU * ts) / 0.62) + 0.8 * sin((TAU * s) / 3.7 + j * 1.3),
  };
}

// ------------------------------------------------------------ the rope from spout to head
function rope(g, x0, y0, x1, y1, d, swing, night) {
  const pts = [], sag = 3 + Math.abs(x1 - x0) * 0.15;
  const mx = (x0 + x1) / 2 + swing, my = (y0 + y1) / 2 + sag * 0.3;
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    pts.push([a * x0 + b * mx + c * x1, a * y0 + b * my + c * y1]);
  }
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.3) return;
  // a fresh rope swells out of the spout, and thins as it springs back in
  const w = Math.min(4.2, 0.8 + L * 0.45);
  g.stroke(pts, w, MAIN[d], { aa: true });
  if (L > 5) g.stroke(pts.slice(0, 8), 1.2, CREAM[0], { aa: true, a: 0.9 * Math.min(1, (L - 5) / 5) });
}

// ------------------------------------------------------------ sprinkles (one list per hour)
const SPR_COL = [0xff5a7e, 0xffd23f, 0x4fc3ff, 0x7ee06a, 0xffffff, 0xb57dff, 0xff9a3c].map(to565);
const ROD = [[-1, 0, 1, 0], [0, -1, 0, 1], [-1, 1, 1, -1], [-1, -1, 1, 1]];
let sprKey = -1, SPR = [];
function sprinklesFor(seed, hh) {
  if (seed === sprKey) return SPR;
  sprKey = seed; SPR = [];
  const digits = hh + '00';
  for (let i = 0; i < 64; i++) {
    const r1 = rand(seed, i, 1), r2 = rand(seed, i, 2), r3 = rand(seed, i, 3);
    const j = i % 4, G = GLYPHS[+digits[j]];
    const cols = [];
    for (let x = M + 1; x < M + 25; x++) if (G.top[x] >= 0) cols.push(x);
    const gx = cols[(r1 * cols.length) | 0];
    SPR.push({ j, gx: gx + 0.5, gy: G.top[gx] + 0.9 + r3 * 1.2, t0: 1.45 + 2.7 * r2, o: hash(seed, i, 4) & 3, c: hash(seed, i, 5) % 7 });
  }
  for (let i = 0; i < 18; i++)
    SPR.push({ j: -1, x: 3 + 154 * rand(seed, i, 6), gy: 0, t0: 1.45 + 2.7 * rand(seed, i, 7), o: hash(seed, i, 8) & 3, c: hash(seed, i, 9) % 7 });
  return SPR;
}

function rod(g, x, y, o, c565) {
  const buf = g.buf, xi = Math.round(x), yi = Math.round(y), R = ROD[o];
  for (let k = -1; k <= 1; k++) {
    const px = xi + (k < 0 ? R[0] : k > 0 ? R[2] : 0), py = yi + (k < 0 ? R[1] : k > 0 ? R[3] : 0);
    if (px >= 0 && px < W && py >= 0 && py < 80) buf[py * W + px] = c565;
  }
  g.cost.px += 3; g.cost.box += 6;
}

// ------------------------------------------------------------ the face
const pad = (n) => String(n).padStart(2, '0');

export default {
  name: 'Soft Serve',
  blurb: 'An ice-cream counter: each numeral is one twisted ribbon of soft serve on a cone or in a sundae boat; it wobbles on the beat, melts at the turn, and the machine pipes the new one.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    const tday = f.h * 3600 + f.m * 60 + s;
    const now = ctx.date.getTime();
    const nf = clockFields(new Date(now + 60000)), pf = clockFields(new Date(now - 60000));
    const cur = f.hh + f.mm, nxt = nf.hh + nf.mm, prv = pf.hh + pf.mm;
    const hourShow = f.m === 0 && s < 20;
    const big = s >= 29.5 && s < 33 ? 30 : hourShow && s >= 4 && s < 7 ? 5 : 0;
    const sw0 = hourShow && s >= 3.6 && s < 5.8 ? 3.6 : s >= 15.2 && s < 17.4 ? 15.2 : s >= 30 && s < 32.2 ? 30 : s >= 45.2 && s < 47.4 ? 45.2 : -1;
    const sweep = sw0 >= 0 ? (s - sw0) * 92 - 12 : -99;     // the light sweep over chrome and glass, 1.5 px a frame

    wall(g, tday, night);

    // ---- every serving's state
    const key = to565(mixc(KEY_DAY, KEY_NIGHT, night));
    const ph = -((tday * 26) | 0) & 0xffff;                 // the twist runs toward the tip, 6.5 px/s
    const lamps = [0, 0, 0, 0], ropes = [], states = [];
    const chN = [0, 1, 2, 3].map((j) => nxt[j] !== cur[j]), chP = [0, 1, 2, 3].map((j) => prv[j] !== cur[j]);
    for (let j = 0; j < 4; j++) {
      const slot = SLOTS[j], wb = wobble(j, s, big);
      const P = { ax: slot.ax, ay: slot.ay, sc: slot.sc, floor: slot.floor, k: wb.k, shear: wb.shear, spread: 0, wx: 1, sag: 0, mu: 0, sink: 0, head: 1e9, ph: ph + j * 37, r: 32, bead: 6, bs: 0, ba: 0, key, melt: 0, d: +cur[j], show: true, fade: 1 };
      // the surge at :15 and :45
      for (const t0 of [15, 45]) {
        const bs = (s - t0 - 0.15 * j) * 85, len = GLYPHS[P.d].len;
        if (bs > -8 && bs < len + 8) {
          P.bs = (bs * 4) | 0;
          P.ba = Math.round(14 * cl((bs + 8) / 10) * cl((len + 8 - bs) / 10));
        }
      }
      if (s >= 58 && chN[j]) {
        // ---- melting the old digit
        let rankR = 0, rankL = 0;
        for (let i = j + 1; i < 4; i++) if (chN[i]) rankR++;
        for (let i = 0; i < j; i++) if (chN[i]) rankL++;
        const m0 = 58.45 + 0.12 * rankR, m1 = 59.85, u = (s - m0) / (m1 - m0);
        if (u > 0) {
          const ant = cl(u / 0.12), p = cl((u - 0.1) / 0.9), ps = sm(p);
          P.k = (1 + 0.025 * sin(Math.PI * ant) * (1 - p)) * (1 - 0.9 * ps) + (wb.k - 1) * (1 - ant);
          P.shear = wb.shear * (1 - ant) + 0.7 * sin(s * 40) * sin(Math.PI * ant) + (j & 1 ? 1 : -1) * 4.5 * ps * (1 - ps) * 2;
          P.spread = 0.6 * ps;
          P.sag = 0.4 * sm(p / 0.35) * (1 - sm((p - 0.55) / 0.45));
          P.mu = u;
          P.sink = 5 * sm((u - 0.72) / 0.28);
          P.r = Math.round(32 * (1 - sm((u - 0.62) / 0.38)));
          P.bead = Math.round(6 * (1 - ps));
          P.ba = 0;
          P.melt = sm(p * 1.4);
          P.fade = 1 - sm((u - 0.55) / 0.3);
        }
        // the rope drops from the spout to where the new digit starts
        const fs = 59.3 + 0.08 * rankL, fe = 60 + 0.08 * rankL;
        if (s > fs) ropes.push({ j, d: +nxt[j], phase: 'fall', u: (s - fs) / (fe - fs) });
        lamps[j] = sm((s - 59.1) / 0.25);
      } else if (chP[j]) {
        // ---- piping the new digit
        let rankL = 0;
        for (let i = 0; i < j; i++) if (chP[i]) rankL++;
        const G = GLYPHS[P.d], p0 = 0.08 * rankL, dur = Math.max(0.6, (G.len * slot.sc) / 85);
        if (s < p0) {
          P.show = false;
          ropes.push({ j, d: P.d, phase: 'fall', u: (s + 60 - (59.3 + p0)) / (0.7) });
          lamps[j] = 1;
        } else if (s < p0 + dur) {
          const e = trap((s - p0) / dur);
          P.head = (e * G.len * 4) | 0;
          ropes.push({ j, d: P.d, phase: 'pipe', e });
          lamps[j] = 1;
          P.ba = 0;
        } else {
          const tau = s - p0 - dur;
          if (tau < 0.6) ropes.push({ j, d: P.d, phase: 'back', u: tau / 0.6 });
          lamps[j] = 1 - sm((tau - 0.2) / 0.4);
          // follow-through: the fresh serving settles
          if (tau < 1.2) {
            const e = Math.exp(-tau / 0.28);
            P.k += -0.07 * e * sin((TAU * tau) / 0.46);
            P.shear += (j & 1 ? -1 : 1) * 1.6 * e * sin((TAU * tau) / 0.6);
          }
        }
      }
      // volume: a squashed serving bulges sideways
      P.wx = P.k > 0.5 ? 1 / Math.sqrt(P.k) : 1.41;
      states.push(P);
    }

    machine(g, SPOUTS, lamps, night, sweep);
    boatBack(g, night);

    // ---- the servings
    for (let j = 0; j < 4; j++) {
      const P = states[j];
      if (!P.show) continue;
      const base = BANDS[P.d], mc = MELT[P.d], m = P.melt;
      for (let i = 0; i < 32; i++) {
        const c = m > 0 ? mixc(base[i], mc, m) : base[i];
        LUT[i] = to565(c);
        HI[i] = to565(mixc(c, 0xffffff, 0.42 + 0.3 * m));
        GL[i] = to565(mixc(c, 0xffffff, 0.75));
      }
      serving(g, GLYPHS[P.d], P);
    }

    // ---- the ropes of soft serve from the spouts
    for (const rp of ropes) {
      const slot = SLOTS[rp.j], P = states[rp.j], G = GLYPHS[rp.d];
      const sx = slot.ax, sy = SPOUT_Y;
      if (rp.phase === 'fall') {
        const u = cl(rp.u), e = 0.5 * u + 0.5 * u * u;
        const [hx, hy] = forward({ ...P, k: 1, shear: 0, spread: 0, sink: 0 }, G.head[0][0], G.head[0][1]);
        rope(g, sx, sy, sx + (hx - sx) * e, sy + (hy - sy) * e, rp.d, 0, night);
      } else if (rp.phase === 'pipe') {
        const hk = Math.min(G.head.length - 1, (rp.e * G.len * 2) | 0);
        const [hx, hy] = forward(P, G.head[hk][0], G.head[hk][1]);
        const hk2 = Math.max(0, hk - 8), [px] = forward(P, G.head[hk2][0], G.head[hk2][1]);
        rope(g, sx, sy, hx, hy, rp.d, (px - hx) * 0.6, night);
      } else {
        const [hx, hy] = forward(P, G.head[G.head.length - 1][0], G.head[G.head.length - 1][1]);
        const e = sm(rp.u);
        rope(g, sx, sy, hx + (sx - hx) * e, hy + (sy - hy) * e, rp.d, 0, night);
      }
    }

    // ---- vessels, drips, counter
    for (let j = 0; j < 2; j++) {
      cone(g, SLOTS[j].ax, night);
      const P = states[j];
      for (const [a, b, side] of [[5 + 4 * j, 27 + 4 * j, j ? -1 : 1], [31 + 3 * j, 52 + 3 * j, j ? 1 : -1]])
        if (s > a && s < b && P.melt === 0) coneDrip(g, SLOTS[j].ax, side, (s - a) / (b - a), MAIN[P.d]);
      // the melt runs over the rim and down the waffle
      if (P.mu > 0.3) {
        const mc = mixc(MELT[P.d], 0xffffff, 0.1);
        coneDrip(g, SLOTS[j].ax - 1, -1, (P.mu - 0.3) / 0.75, mc);
        coneDrip(g, SLOTS[j].ax + 2, 0.7, (P.mu - 0.42) / 0.7, mc);
      }
    }
    boatFront(g, night, sweep);
    counter(g, night, sweep);

    // ---- the hour's sprinkles and cherry
    const seed = hash(f.year * 400 + f.mon * 31 + f.day, f.h, 77);
    const spr = sprinklesFor(seed, f.hh);
    for (const p of spr) {
      if (p.j < 0) {
        if (!hourShow || s < p.t0) continue;
        const y = Math.min(69, 6 + 72 * (s - p.t0));
        if (y < 7) continue;
        if (s > 18.5) continue;
        rod(g, p.x, y, y >= 69 ? 0 : p.o, SPR_COL[p.c]);
        continue;
      }
      const j = p.j;
      if ((j === 2 && f.m >= 10) || (j === 3 && f.m >= 1)) continue;
      if (f.m === 0 && s < p.t0) continue;
      const P = states[j];
      if (!P.show || P.fade <= 0.02) continue;
      if (P.fade < 1 && rand(p.gx * 7 | 0, p.gy * 5 | 0, 3) > P.fade) continue;
      const [x, ya] = forward(P, p.gx, p.gy);
      const y = f.m === 0 ? Math.min(ya, 6 + 72 * (s - p.t0)) : ya;
      if (y < 7) continue;
      rod(g, x, y, p.o, SPR_COL[p.c]);
    }
    if (f.m === 0 && s >= 2.5) cherry(g, states[3], s, night);
  },
};

// ------------------------------------------------------------ the cherry on top
function cherry(g, P, s, night) {
  if (!P.show || P.fade <= 0.05) return;
  const G = GLYPHS[P.d], gx = GAX, top = G.top[gx] >= 0 ? G.top[gx] : 8;
  const [tx, ty] = forward(P, gx + 0.5, top + 0.6);
  const cyRest = ty - 3.1;
  const tau = s - 2.5, hit = Math.sqrt((2 * (cyRest + 8)) / 120);
  let cy, ry = 3.4, rx = 3.4, lean = 0;
  if (tau < hit) cy = -8 + 60 * tau * tau;
  else {
    const t2 = tau - hit;
    const hop = t2 < 0.34 ? 3.2 * sin((Math.PI * t2) / 0.34) : t2 < 0.54 ? 0.9 * sin((Math.PI * (t2 - 0.34)) / 0.2) : 0;
    cy = cyRest - hop;
    const sq = Math.exp(-t2 / 0.07) + (t2 > 0.34 ? 0.5 * Math.exp(-(t2 - 0.34) / 0.06) : 0);
    ry = 3.4 * (1 - 0.22 * sq); rx = 3.4 * (1 + 0.15 * sq); cy += 3.4 - ry;
    lean = Math.exp(-t2 / 0.5) * sin(t2 * 13);
  }
  const red = mixc(0xd8102e, 0x8a0a1e, night * 0.4), dark = mixc(0x7a0618, 0x40030c, night * 0.4);
  const stem = 0x3f7a2c;
  g.fillEllipse(tx, cy, rx + 0.9, ry + 0.9, KEY_DAY, { aa: true, a: P.fade });
  g.fillEllipse(tx, cy, rx, ry, red, { aa: true, a: P.fade });
  g.fillEllipse(tx + 1, cy + 1, rx * 0.55, ry * 0.5, dark, { aa: true, a: 0.6 * P.fade });
  g.fillCircle(tx - 1.2, cy - 1.3, 0.9, 0xffd6dc, { aa: true, a: P.fade });
  const x1 = tx + 2.8 + lean * 1.5, y1 = cy - ry - 4.5;
  g.thickLine(tx + 0.2, cy - ry + 0.3, tx + 1.2 + lean * 0.6, cy - ry - 2.3, 1.1, stem, { aa: true, a: P.fade });
  g.thickLine(tx + 1.2 + lean * 0.6, cy - ry - 2.3, x1, y1, 1.1, stem, { aa: true, a: P.fade });
}
