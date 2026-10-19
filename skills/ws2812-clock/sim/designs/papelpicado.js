// Papel Picado: a string of Day-of-the-Dead tissue flags across the 256x64
// banner, each one lit from behind by its own candle. The time is cut out of
// the paper: stencil numerals whose counters are paper islands held on by
// thin bridges, with a flower punched into every island; the lace round them
// is fine slits that pass far less light. Hours, a calavera in the middle,
// minutes, and marigold sheets running off both ends.
//
// Always alive: the string sags and sways, gusts run along it lifting the
// flags in turn (the tissue foreshortens and its shading ripples), the
// candles flicker through the paper, marigold petals drift down.
// Minute: a gust lifts the flag that must change; at :00 it tears off its
// string and tumbles away up the wind, the candle behind it shows for a
// moment, and the new flag swings down over the string and settles.
// Hour: a whip-crack wave runs down the string, the changed flags tear off
// together, the garland dances, the calavera chatters with laughter and a
// cloud of petals blows across.
//
// Rendering: every sheet is a cut mask (papelpicado-glyphs.js) sampled by
// inverse mapping per pixel, so sheets glide, tilt and tumble with coverage.
// Tissue is composited as a filter: paper passes its colour of whatever is
// behind it (the lamp, or another sheet), holes pass all of it.
import * as kit from '../js/kit.js';
import { sheets, W, H, TS, TW, TH, FOLD, JAW } from './papelpicado-glyphs.js';

const GW = 256, GH = 64, N = GW * GH;
const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N);
const img = new Float32Array(3 * N);
const SAG = 9, STR0 = 64, STR = new Float32Array(GW + 2 * STR0);       // string height per column, x from -64
const HX = new Float32Array(GW), GY = new Float32Array(GH);   // lamp: separable glow
const NT = W * 4 + 1;
const CYT = new Float32Array(NT), SHT = new Float32Array(NT), CJT = new Float32Array(NT);

const LAMP = [1, 0.74, 0.46];                                  // candlelight seen through a cut
// tissue passes its colour at one luminance (~17% of the lamp), so every
// sheet frames its cut numerals with the same contrast, yellow included
const PAPER = ['#ff2aa0', '#ff6a00', '#00d8ff', '#2cff5a', '#9c3cff'].map((h) => {
  const c = kit.hex(h), y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], k = Math.min(1.6, 0.17 / y);
  return c.map((v) => k * v);
});
const PINK = 0, ORANGE = 1, TURQ = 2, GREEN = 3, PURPLE = 4;
const PETAL = kit.hex('#ff8c00');

const SLOT_X = [0, 1, 2, 3, 4, 5, 6].map((k) => 128 + (k - 3) * (256 / 6));
const DIGIT_SLOT = [1, 2, 4, 5];                               // H1 H2 | skull | M1 M2
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (s) => { const d = new Date(s * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
// outer sheets pink/orange, inner sheets turquoise/yellow, by the digit's
// parity: neighbours never match, and every change of digit is a new colour
const paperFor = (s, v) => [[PINK, ORANGE], [TURQ, GREEN], [GREEN, TURQ], [ORANGE, PINK]][s][v & 1];

// ------------------------------------------------------------------ helpers
let SC = 0, SHo = 0;                                           // sampler output: coverage, hole
function sample(tex, u, v) {
  const tu = u * TS - 0.5, tv = v * TS - 0.5;
  const i = Math.floor(tu), j = Math.floor(tv);
  if (i < -1 || j < -1 || i >= TW || j >= TH) { SC = 0; SHo = 0; return; }
  const fx = tu - i, fy = tv - j, cov = tex.cov, hol = tex.hole;
  let c = 0, h = 0;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  if (j >= 0) {
    if (i >= 0) { const p = j * TW + i; c += w00 * cov[p]; h += w00 * hol[p]; }
    if (i + 1 < TW) { const p = j * TW + i + 1; c += w10 * cov[p]; h += w10 * hol[p]; }
  }
  if (j + 1 < TH) {
    if (i >= 0) { const p = (j + 1) * TW + i; c += w01 * cov[p]; h += w01 * hol[p]; }
    if (i + 1 < TW) { const p = (j + 1) * TW + i + 1; c += w11 * cov[p]; h += w11 * hol[p]; }
  }
  SC = c; SHo = h;
}
/** Composite one tissue sample into pixel p: c coverage, h hole, pc paper filter, sh paper shade. */
function comp(p, x, y, c, h, pc, sh) {
  if (c <= 0.002) return;
  const a = A[p], I = 0.5 + 0.5 * GY[y] * HX[x], k = 1 - a;
  const vr = R[p] + k * LAMP[0] * I, vg = G[p] + k * LAMP[1] * I, vb = B[p] + k * LAMP[2] * I;
  const pf = (c - h) * sh;
  R[p] = (1 - c) * R[p] + vr * (h + pf * pc[0]);
  G[p] = (1 - c) * G[p] + vg * (h + pf * pc[1]);
  B[p] = (1 - c) * B[p] + vb * (h + pf * pc[2]);
  A[p] = a + c * k;
}

/**
 * A sheet hanging from the string, its top edge on the string. alpha is the
 * swing about the string (0 hangs flat, + blows back, > pi/2 is over the
 * top), rip/ph a travelling ripple across it, sw a shear of the hem
 * downwind, jaw an extra bend below the calavera's jaw line.
 */
function drawHanging(tex, pc, x0, alpha, rip, ph, sw, jaw) {
  const KU = (2 * Math.PI) / 19;
  let cmin = 1, cmax = -1;
  for (let n = 0; n < NT; n++) {
    const u = n / 4, s = KU * u + ph, al = alpha + rip * Math.sin(s), cy = Math.cos(al);
    CYT[n] = cy; CJT[n] = jaw ? Math.cos(al + jaw) : cy;
    SHT[n] = (0.42 + 0.58 * Math.abs(cy)) * (1 + 2.4 * rip * Math.cos(s));
    if (cy < cmin) cmin = cy; if (cy > cmax) cmax = cy;
  }
  // the fold is glued along the string: the sheet turns rigidly to its chord
  const ay = strAt(x0), by = strAt(x0 + W), L = Math.hypot(W, by - ay), rc = W / L, rs = (by - ay) / L;
  const ext = H * Math.max(Math.abs(cmin), Math.abs(cmax));
  const xa = Math.max(0, Math.floor(x0 - ext * (Math.abs(rs) + Math.abs(sw))) - 2), xb = Math.min(GW - 1, Math.ceil(x0 + W + ext * (Math.abs(rs) + Math.abs(sw))) + 2);
  const ya = Math.max(0, Math.floor(Math.min(ay, by) + Math.min(0, H * cmin)) - 2), yb = Math.min(GH - 1, Math.ceil(Math.max(ay, by) + Math.max(0, H * cmax)) + 2);
  for (let y = ya; y <= yb; y++) {
    const ry = y + 0.5 - ay;
    for (let x = xa; x <= xb; x++) {
      const rx = x + 0.5 - x0, u0 = rc * rx + rs * ry, dy = -rs * rx + rc * ry;
      let u = u0, v = 0;
      for (let it = 0; it < 2; it++) {
        const n = Math.round(Math.min(W, Math.max(0, u)) * 4), cy = CYT[n];
        if (Math.abs(cy) < 0.03) { v = -1; break; }
        v = dy / cy;
        if (jaw && v > JAW) v = JAW + (dy - JAW * cy) / CJT[n];
        u = u0 - sw * v;
      }
      if (v < 0 || v > H || u < -0.6 || u > W + 0.6) continue;
      sample(tex, u, v);
      if (SC <= 0.002) continue;
      const n = Math.round(Math.min(W, Math.max(0, u)) * 4);
      comp(y * GW + x, x, y, SC, SHo, pc, v < FOLD ? SHT[n] * 0.5 : SHT[n]);
    }
  }
}
const strAt = (x) => { const k = x + STR0 - 0.5, i = Math.floor(k), f = k - i; return STR[i] + (STR[i + 1] - STR[i]) * f; };

/** A free sheet: top-centre at (cx, cy), turned th in the plane, scaled sx, sy (negative = seen from behind). */
function drawFree(tex, pc, cx, cy, th, sx, sy) {
  if (Math.abs(sx) < 0.03 || Math.abs(sy) < 0.03) return;
  const c = Math.cos(th), s = Math.sin(th);
  let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
  for (const [u, v] of [[-W / 2, 0], [W / 2, 0], [-W / 2, H], [W / 2, H]]) {
    const px = cx + c * u * sx - s * v * sy, py = cy + s * u * sx + c * v * sy;
    xa = Math.min(xa, px); xb = Math.max(xb, px); ya = Math.min(ya, py); yb = Math.max(yb, py);
  }
  xa = Math.max(0, Math.floor(xa) - 1); xb = Math.min(GW - 1, Math.ceil(xb) + 1);
  ya = Math.max(0, Math.floor(ya) - 1); yb = Math.min(GH - 1, Math.ceil(yb) + 1);
  const sh = 0.4 + 0.6 * Math.min(1, Math.abs(sx) * Math.abs(sy) * 1.2), isx = 1 / sx, isy = 1 / sy;
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (c * dx + s * dy) * isx + W / 2, v = (-s * dx + c * dy) * isy;
    if (v < 0 || v > H || u < -0.6 || u > W + 0.6) continue;
    sample(tex, u, v);
    if (SC <= 0.002) continue;
    comp(y * GW + x, x, y, SC, SHo, pc, v < FOLD ? sh * 0.5 : sh);
  }
}

/** Paint colour c over pixel (x, y) by a, with sub-pixel spread. */
function dab(x, y, col, a) {
  const xi = Math.floor(x - 0.5), yi = Math.floor(y - 0.5), fx = x - 0.5 - xi, fy = y - 0.5 - yi;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const px = xi + i, py = yi + j;
    if (px < 0 || py < 0 || px >= GW || py >= GH) continue;
    const w = a * (i ? fx : 1 - fx) * (j ? fy : 1 - fy), p = py * GW + px;
    R[p] += (col[0] - R[p]) * w; G[p] += (col[1] - G[p]) * w; B[p] += (col[2] - B[p]) * w;
  }
}

for (let y = 0; y < GH; y++) GY[y] = Math.exp(-(((y + 0.5 - 33) / 21) ** 2));
const gustAt = (x, t) => kit.smoothstep(0.42, 0.88, kit.noise2(x / 150 - t * 0.42, 0.5));
const breeze = (k, t) => 0.1 + 0.32 * gustAt(SLOT_X[k], t) + 0.06 * Math.sin(1.7 * t + k * 1.9);

// ------------------------------------------------------------------- design
export default {
  name: 'Papel Picado',
  blurb: 'Day-of-the-Dead tissue flags lit by candles, the time cut out of them as stencil numerals; each minute the wind tears a flag off the string and a new one swings down; the hour cracks the string like a whip',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.45,
  frame(ctx) {
    const S = sheets();
    const now = ctx.date.getTime() / 1000, t = now % 86400;
    const M = Math.floor(now / 60) * 60, a = now - M;
    const prev = digitsAt(M - 60), cur = digitsAt(M), next = digitsAt(M + 60);
    const hourNow = cur.slice(2) === '00', hourNext = next.slice(2) === '00';
    const te = hourNow && a < 6 ? a : hourNext && a > 59 ? a - 60 : 99;     // seconds from the hour crack
    const pre = kit.smoothstep(59.1, 60, a);                                // the gust before a minute

    // ---- the string
    const xf = -50 + ((te + 0.8) / 0.8) * 360;                              // whip wave front, before the crack
    for (let k = 0; k < STR.length; k++) {
      const x = k - STR0 + 0.5, xr = (((x % 128) + 128) % 128) / 128, env = Math.sin(Math.PI * xr);
      let y = 1.2 + SAG * 4 * xr * (1 - xr) + 0.9 * env * Math.sin(0.8 * t + x / 70) * (0.4 + gustAt(x, t));
      if (te < 0) y -= 7 * env * Math.exp(-(((x - xf) / 26) ** 2));
      else if (te < 6) y += 4 * env * Math.exp(-1.3 * te) * Math.sin(11 * te - x / 60);
      STR[k] = y;
    }
    // ---- candles behind the flags
    const flick = SLOT_X.map((sx, k) => 0.86 + 0.14 * kit.noise2(t * 7, k * 7.1) - 0.08 * gustAt(sx, t));
    for (let x = 0; x < GW; x++) {
      let h = 0;
      for (let k = 0; k < 7; k++) { const d = (x + 0.5 - SLOT_X[k]) / 15; if (d > -3 && d < 3) h += flick[k] * Math.exp(-d * d); }
      HX[x] = Math.min(1, h);
    }
    R.fill(0); G.fill(0); B.fill(0); A.fill(0);

    // flag motion common to all: breeze, the minute gust, the hour dance
    const minGust = Math.exp(-(((a - 0.35) / 0.7) ** 2)) * 0.35;
    const swingOf = (k) => {
      let al = breeze(k, t) + minGust * (1 - Math.abs(k - 4.5) / 6);
      if (te < 0) al += 0.45 * Math.exp(-(((SLOT_X[k] - xf) / 28) ** 2));
      else if (te < 6) al += 0.55 * Math.exp(-1.1 * te) * Math.sin(7.5 * te - SLOT_X[k] / 30);
      return al;
    };
    const ripOf = (k) => 0.06 + 0.07 * gustAt(SLOT_X[k], t) + (te < 6 ? 0.12 * Math.exp(-Math.abs(te)) : 0);
    const phOf = (k) => -(6 + 3 * gustAt(SLOT_X[k], t)) * t + k * 1.3;
    const swOf = (k) => 0.03 * Math.sin(1.1 * t + k * 0.9) + 0.03 * gustAt(SLOT_X[k], t);

    // ---- hanging sheets
    const leaving = [];
    for (let k = 0; k < 7; k++) {
      const x0 = SLOT_X[k] - W / 2;
      let al = swingOf(k);
      if (k === 0 || k === 6) { drawHanging(S.marigold, PAPER[k ? GREEN : TURQ], x0, al, ripOf(k), phOf(k), swOf(k), 0); continue; }
      if (k === 3) {
        const jaw = te >= 0 && te < 6 ? 0.9 * Math.exp(-0.7 * te) * (0.5 + 0.5 * Math.sin(24 * te - 1.5)) * kit.smoothstep(0, 0.25, te)
          : 0.25 * Math.exp(-(((a - 0.6) / 0.35) ** 2));
        drawHanging(S.skull, PAPER[PURPLE], x0, al, ripOf(k), phOf(k), swOf(k), jaw);
        continue;
      }
      const s = DIGIT_SLOT.indexOf(k), dNow = +cur[s], dOld = +prev[s];
      if (dNow !== dOld && a < 4) {
        // the old sheet tore off at :00 and is flying; the new one swings down over the string
        leaving.push(s);
        const ta = a - 0.12 - 0.06 * s;
        if (ta < 0) continue;
        al += Math.PI * Math.exp(-3 * ta) * Math.cos(2.6 * ta);
      } else if (+next[s] !== dNow) {
        al += 0.6 * pre;                                                    // the gust lifts it
      }
      drawHanging(S.digits[dNow], PAPER[paperFor(s, dNow)], x0, al, ripOf(k), phOf(k), swOf(k), 0);
    }
    // ---- candle flames, seen where a sheet is gone
    for (let k = 1; k < 6; k++) {
      const fx = SLOT_X[k], lean = 1.2 * Math.sin(t * 2.3 + k) + 1.5 * gustAt(fx, t), fl = flick[k];
      for (let y = 26; y < 50; y++) for (let x = Math.floor(fx - 9); x <= fx + 9; x++) {
        const p = y * GW + x, open = 1 - A[p];
        if (open < 0.02) continue;
        const ry = y + 0.5 - 37.5, rx = x + 0.5 - fx - lean * Math.max(0, -ry) / 5;
        let r = 0, g = 0, b = 0;
        if (ry < 2) { const f = Math.exp(-((rx / 1.25) ** 2) - (((ry + 1.2) / (ry < -1.2 ? 3.4 * fl : 1.4)) ** 2)) * fl; r += f; g += 0.72 * f; b += 0.32 * f; }
        const halo = 0.1 * fl * Math.exp(-(rx * rx + (ry + 1) * (ry + 1)) / 30);
        r += halo; g += 0.45 * halo; b += 0.12 * halo;
        if (ry > 2.2 && ry < 9 && Math.abs(x + 0.5 - fx) < 1.8) { const w = 0.08 * Math.exp(-(ry - 2.2) / 4); r += w; g += 0.8 * w; b += 0.6 * w; }
        R[p] += open * r; G[p] += open * g; B[p] += open * b;
      }
    }
    // ---- the string itself, where no sheet hides it
    for (let x = 0; x < GW; x++) {
      const y = STR[x + STR0] - 0.6, yi = Math.floor(y - 0.5), f = y - 0.5 - yi;
      for (let j = 0; j < 2; j++) {
        const py = yi + j; if (py < 0 || py >= GH) continue;
        const p = py * GW + x, w = (j ? f : 1 - f) * (1 - A[p]);
        R[p] += 0.05 * w; G[p] += 0.032 * w; B[p] += 0.02 * w;
      }
    }
    // ---- sheets torn off, tumbling away downwind (in front)
    for (const s of leaving) {
      const k = DIGIT_SLOT[s], d = +prev[s], tau = a;
      const sc = 1 / (1 + 0.6 * tau);
      const cx = SLOT_X[k] + 46 * tau + 24 * tau * tau,
        cy = STR[Math.round(SLOT_X[k]) + STR0] - 3 - 11 * tau - 5 * tau * tau + 3 * Math.sin(4 * tau + s);
      const th = -0.3 * Math.sin(2.1 * tau + s) * Math.min(1, 2 * tau) - 0.7 * tau;
      const ph = (3.0 + 0.4 * s) * tau, ps = 0.9 * Math.exp(-1.5 * tau) + 0.8 * Math.sin(2.3 * tau);
      drawFree(S.digits[d], PAPER[paperFor(s, d)], cx, cy, th, sc * Math.cos(ph), sc * Math.cos(ps));
    }
    // ---- marigold petals drifting down; a burst on the hour
    const PER = 0.42, LIFE = 7;
    for (let n = Math.floor((t - LIFE) / PER); n <= Math.floor(t / PER); n++) {
      const age = t - n * PER;
      if (age < 0 || age > LIFE) continue;
      const h1 = kit.hash(n, 11), h2 = kit.hash(n, 23), h3 = kit.hash(n, 37);
      const x = h1 * 300 - 30 + (6 + 8 * h2) * age + 5 * Math.sin(1.3 * age + 6 * h3), y = -3 + (8 + 4 * h3) * age;
      const tum = 0.35 + 0.65 * Math.abs(Math.sin(2.6 * age + 9 * h2));
      dab(x, y, PETAL.map((c) => c * 0.32), 0.85 * tum);
      if (tum > 0.7) dab(x + 0.8, y + 0.4, PETAL.map((c) => c * 0.22), 0.5);
    }
    if (te >= 0 && te < 6) {
      for (let n = 0; n < 80; n++) {
        const h1 = kit.hash(n, 51), h2 = kit.hash(n, 63), h3 = kit.hash(n, 71);
        const tau = te - 0.15 * h3; if (tau < 0) continue;
        const k = 1.6, vx = 60 + 90 * h2, vy = -30 - 50 * h1, vt = 9;
        const e = (1 - Math.exp(-k * tau)) / k;
        const x = h1 * 256 + vx * e + 7 * tau, y = STR[Math.round(h1 * 255) + STR0] + 4 + (vy - vt) * e + vt * tau;
        const tum = 0.35 + 0.65 * Math.abs(Math.sin(3.1 * tau + 9 * h2)), fade = kit.smoothstep(6, 4.5, te);
        dab(x, y, PETAL.map((c) => c * 0.36), 0.9 * tum * fade);
      }
    }

    const dim = 1 - 0.62 * ctx.night;
    for (let p = 0; p < N; p++) { img[3 * p] = R[p] * dim; img[3 * p + 1] = G[p] * dim; img[3 * p + 2] = B[p] * dim; }
    kit.blitGrid(ctx, img);
  },
};
