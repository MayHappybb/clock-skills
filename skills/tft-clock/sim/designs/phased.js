// Phased: a real phased array writes the time. 240 emitters ring the glass
// (the beaded 1-px frame), all singing one note. Driven with the right
// phases (each the conjugate of its wave at the target), their waves arrive
// in step at chosen points and nowhere else: sharp foci, half a wavelength
// across, each wrapped in Bessel rings. Six foci at once, one per numeral
// and two for the colon, and the waves of all six interfere across the tank.
//
// Why foci and not a whole hologram of the numerals: one frequency cannot
// hold a bright line drawing in a dark field (tried: 1,600 solved
// holograms; the waves must cross the glass to reach the strokes, so the
// residue is speckle and every straight stroke leaks a beam, and 2, 3, 4,
// 5, 7 dissolve). A focus is what a monochromatic field does perfectly. So
// the array does what ultrasonic haptics does to draw shapes in mid-air: it
// sweeps each focus along a numeral's pen path, a lap every second.
//
// The beat: all four laps start together on the whole second, with the
// colon's pulse, so every second each numeral re-ignites violet-white from
// its pen start and the heat runs down it while last second's stroke cools.
//
// The floor of the tank is a black thermochromic liquid-crystal sheet, the
// kind on a forehead thermometer: where the focus deposits energy it warms
// and changes colour, and cools as the focus moves on. So every stroke
// shows a temperature gradient running behind its focus: violet-white at
// the hot spot, then blue, green, gold and red as it cools, never quite
// black before the focus comes round again. The heat profile across a
// stroke is the true time-integral of a moving focus (J0^2 swept along a
// line), faint parallel fringes and all. Over it, the live field: the foci
// and their rings, beating where they overlap, coloured by phase.
//
// Type: lean centre-lines of ellipse arcs and short runs (a thin Didone-like
// set, phased-glyphs.js), drawn once as a pen path so a focus can trace it.
//
// Minute: a leaving numeral's focus finishes its last lap at :58 and lets
// go; the sheet cools from the start of the pen path to its end, readable
// to about :58.7 and dark by ~:59.3. At :00 each new numeral's focus starts its first lap
// and writes it in one stroke, hot as it goes (done by :01).
//
// Hour: a seventh focus roams the strip for eight seconds, leaving a
// cooling rainbow comet trail, its rings sweeping through the numerals.
//
// Cost: per pixel, six or seven Bessel lookups by squared distance (the
// field of an ideal ring array), a phase-coloured intensity, and inside a
// numeral's box a heat profile lookup and an exponential by table.

import { clockFields, clamp, progress, hex, sin, cos } from '../js/kit.js';
import { penRaster } from './phased-glyphs.js';
import { W, H, N, LAMBDA, SOURCES, SLOTS } from './phased-geom.js';

const K = (2 * Math.PI) / LAMBDA, FREQ = 1.0;     // the note: crest spacing 7 px, one phase turn a second
const LAP = 1.0, TAU = 1.6;                       // s: a focus's lap of its numeral; the sheet's cooling time
const LETGO = 58.0, START = 0;                   // last lap ends after this second; new laps start after this
const M = SOURCES.length;

// ---- tables
// J0(k r) by (r^2 x 4)
const R2Q = 4, J0N = R2Q * (170 * 170 + 90 * 90);
const J0 = new Float32Array(J0N);
const besselJ0 = (x) => {
  if (x < 10) { let s = 0, t = 1; for (let k = 0; k < 50; k++) { s += t; t *= -(x * x / 4) / ((k + 1) * (k + 1)); } return s; }
  return Math.sqrt(2 / (Math.PI * x)) * (Math.cos(x - Math.PI / 4) + Math.sin(x - Math.PI / 4) / (8 * x));
};
for (let q = 0; q < J0N; q++) J0[q] = besselJ0(K * Math.sqrt(q / R2Q));
const j0 = (r2) => (r2 < J0N / R2Q ? J0[(r2 * R2Q) | 0] : 0);
// heat across a stroke: J0^2 integrated along the path, by distance (1/20 px), normalised to 1 on the line
const PD = 20, PMAX = 9, PROF = new Float32Array(PMAX * PD + 2);
{
  const line = (d) => { let s = 0; for (let u = -30; u <= 30; u += 0.1) s += j0(d * d + u * u) ** 2; return s; };
  const p0 = line(0);
  for (let j = 0; j < PROF.length; j++) PROF[j] = (line(j / PD) / p0) ** 1.35;   // sharpened: the sheet's colour play is steep in temperature
}
// heat round a fixed focus (the colon): J0^2 + J1^2, the energy of a standing focus, by r^2 x 4
const SPOT = new Float32Array(4 * 64);
for (let q = 0; q < SPOT.length; q++) { const x = K * Math.sqrt(q / 4), a = besselJ0(x), b = (besselJ0(x + 1e-3) - besselJ0(x - 1e-3)) / 2e-3; SPOT[q] = a * a + b * b; }
const EXPN = 256, EXP = Float32Array.from({ length: EXPN + 1 }, (_, j) => Math.exp(-(j / EXPN) * 8));  // e^-x, x in [0, 8]
const ex = (x) => (x >= 8 ? 0 : x <= 0 ? 1 : EXP[(x * (EXPN / 8)) | 0]);

// ---- colour
// the sheet: black, then red, gold, green, blue, violet-white as it warms (a real TLC's order)
const TLC = [[0, '#000000'], [0.1, '#3a0608'], [0.24, '#b0161a'], [0.4, '#f06a14'], [0.52, '#f2c832'], [0.64, '#4cd25a'], [0.76, '#18b6d8'], [0.88, '#3c5cff'], [0.96, '#a07cff'], [1, '#f0e8ff']].map(([u, c]) => [u, hex(c)]);
const HEAT = Array.from({ length: 256 }, (_, j) => {
  const u = j / 255; let k = 0; while (k < TLC.length - 2 && TLC[k + 1][0] < u) k++;
  const [u0, a] = TLC[k], [u1, b] = TLC[k + 1], f = clamp((u - u0) / (u1 - u0), 0, 1);
  return [16, 8, 0].map((s) => ((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * f));
});
// the live field: phase as hue, a pale cyclic palette (warm white crest)
const STOPS = ['#fff2d2', '#ffb070', '#ff6aa8', '#8a7cff', '#58c8ff', '#7cf0d0'].map(hex);
const PHASE = Array.from({ length: 64 }, (_, j) => {
  const u = (j / 64) * STOPS.length, k = u | 0, f = u - k, e = f * f * (3 - 2 * f), a = STOPS[k], b = STOPS[(k + 1) % STOPS.length];
  return [16, 8, 0].map((s) => ((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * e));
});
// a TLC sheet only shows colour inside its band: below ON it stays black
const ON = 0.26;
// live intensity (|U|^2, 0..4) -> how much of the phase colour shows: amplitude-like, so far rings stay visible
const LIVE = Float32Array.from({ length: 256 }, (_, j) => Math.min(0.5, 0.5 * Math.sqrt(j / 64)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
function turn(y, x) {                                // atan2 as a fraction of a turn, no Math
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  if (ax === 0 && ay === 0) return 0;
  const sw = ay > ax, r = sw ? ax / ay : ay / ax;
  let a = r * (0.125 + 0.04345 * (1 - r));
  if (sw) a = 0.25 - a;
  if (x < 0) a = 0.5 - a;
  if (y < 0) a = 1 - a;
  return a;
}

// ---- pen paths, cached per digit and slot
// (built at load: on a device these are tables in flash)
const PEN = new Map();
for (let k = 0; k < 4; k++) for (let d = 0; d < 10; d++) PEN.set(String(d) + k, penRaster(String(d), SLOTS[k], PMAX));
const pen = (d, k) => PEN.get(d + k);

const COLON = [[80, 30], [80, 50]];
const OFF = [0, 0, 0, 0];                         // all four laps start on the whole second: the face's beat

// one numeral's laps this minute: from tStart to tStop (seconds of the day, open-ended when it stays)
function lapWindow(k, prev, now, next, minuteT) {
  const lap0 = (t) => (Math.ceil(t / LAP - OFF[k] - 1e-9) + OFF[k]) * LAP;   // the first lap boundary at or after t
  return {
    tStart: prev[k] !== now[k] ? lap0(minuteT + START) : -Infinity,
    tStop: next[k] !== now[k] ? lap0(minuteT + LETGO) : Infinity,
  };
}

const UR = new Float32Array(N), UI = new Float32Array(N), HT = new Float32Array(N);

export default {
  name: 'Phased',
  blurb: 'A ring of 240 emitters focuses one note to points that trace the time on a thermochromic sheet.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const minuteT = f.h * 3600 + f.m * 60, T = minuteT + s;
    const pf = clockFields(new Date(ctx.date.getTime() - 60000)), nf = clockFields(new Date(ctx.date.getTime() + 60000));
    const now = f.hh + f.mm, prev = pf.hh + pf.mm, next = nf.hh + nf.mm;
    const wt = (ctx.date.getTime() / 1000) * FREQ, wf = wt - Math.floor(wt);
    let ops = 0;

    // ---- the foci [x, y, amplitude, phase in turns], and the heat they have left on the sheet
    const foci = [];
    HT.fill(0);
    for (let k = 0; k < 4; k++) {
      const p = pen(now[k], k), { tStart, tStop } = lapWindow(k, prev, now, next, minuteT);
      if (T >= tStart - 0.15 && T <= tStop + 0.3) {
        const lp = T / LAP - OFF[k], u = lp - Math.floor(lp), before = T < tStart, after = T > tStop;
        const [x, y] = p.at(before ? 0 : after ? p.L : u * p.L);
        const a = before ? progress(T, tStart - 0.15, tStart) : after ? 1 - progress(T, tStop, tStop + 0.3) : 1;
        foci.push([x, y, a, 0.17 * k]);
        for (let yy = Math.max(0, (y - 4) | 0); yy < Math.min(H, y + 5); yy++) for (let xx = Math.max(0, (x - 4) | 0); xx < Math.min(W, x + 5); xx++) {
          const q = ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2) * 4, i = yy * W + xx;
          if (q < SPOT.length) { const h = SPOT[q | 0] * a; if (h > HT[i]) HT[i] = h; }
        }
      }
      // a pixel a fraction v along the path was last passed at the latest (lap boundary + v LAP)
      // that is no later than now or the last lap's end, and no earlier than the first lap's start
      const tEnd = T < tStop ? T : tStop;
      for (let y = p.y0; y < p.y1; y++) for (let x = p.x0; x < p.x1; x++) {
        const j = (y - p.y0) * p.gw + x - p.x0, d = p.dist[j];
        if (d >= PMAX) continue;
        const v = p.along[j] / p.L;
        const n0 = Math.floor((tEnd - v * LAP) / LAP - OFF[k] + 1e-9);
        const tLast = (n0 + OFF[k] + v) * LAP;
        if (tLast < tStart + v * LAP - 1e-6 || tLast > T) continue;
        const passes = tStart === -Infinity ? 99 : Math.round((tLast - tStart) / LAP - v) + 1;
        const heat = PROF[(d * PD) | 0] * ex((T - tLast) / TAU) * (1 - ex((3 * passes * LAP) / TAU));   // the first pass writes it nearly full
        const i = y * W + x;
        if (heat > HT[i]) HT[i] = heat;
        ops += 14;
      }
    }
    // the colon: two standing foci that pulse once a second
    const beat = ex((s % 1) * 4.5);
    for (const [cx, cy] of COLON) {
      foci.push([cx, cy, 0.55 + 0.45 * beat, 0.5]);
      for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
        const q = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) * 4, i = y * W + x;
        if (q < SPOT.length) HT[i] = Math.max(HT[i], SPOT[q | 0] * (0.62 + 0.3 * beat));
      }
    }
    // the hour: a roaming seventh focus, :03 to :11 of minute 0, leaving a faint warm trail
    if (f.m === 0 && s > 3 && s < 11) {
      const path = (t) => { const u = (t - 3) / 8; return [80 - 70 * cos(u * Math.PI * 2.4), 40 + 30 * sin(u * Math.PI * 5.2)]; };
      const env = (t) => sin(Math.PI * clamp((t - 3) / 8, 0, 1)) ** 2;
      const [x, y] = path(s);
      foci.push([x, y, 1.8 * env(s), (s * 0.7) % 1]);
      for (let k = 0; k < 24; k++) {
        const t = s - k * 0.03; if (t < 3) break;
        const [tx, ty] = path(t), w = 1.05 * env(t) * ex((s - t) / 0.3);   // a thin track cools fast
        for (let yy = Math.max(0, (ty - 4) | 0); yy < Math.min(H, ty + 5); yy++) for (let xx = Math.max(0, (tx - 4) | 0); xx < Math.min(W, tx + 5); xx++) {
          const q = ((xx + 0.5 - tx) ** 2 + (yy + 0.5 - ty) ** 2) * 4, i = yy * W + xx;
          if (q < SPOT.length) HT[i] = Math.max(HT[i], SPOT[q | 0] * w);
        }
      }
      ops += 24 * 81 * 6;
    }

    // ---- the live field: each focus is J0 round its point with its own drive phase, all at one frequency
    UR.fill(0); UI.fill(0);
    for (const [fx, fy, a, ph] of foci) {
      if (a <= 0) continue;
      const tp = (ph - wf) * 2 * Math.PI, cr = a * cos(tp), ci = a * sin(tp);
      for (let y = 0, i = 0; y < H; y++) {
        const dy = y + 0.5 - fy, dy2 = dy * dy;
        for (let x = 0; x < W; x++, i++) { const dx = x + 0.5 - fx, b = j0(dx * dx + dy2); UR[i] += cr * b; UI[i] += ci * b; }
      }
      ops += N * 8;
    }

    // ---- paint: the sheet's colour, plus the live field's intensity coloured by its phase
    const buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const ht = (HT[i] - ON) * (1 / (1 - ON)), hc = HEAT[ht >= 1 ? 255 : ht <= 0 ? 0 : (ht * 255) | 0];
      const re = UR[i], im = UI[i], it = re * re + im * im;
      const lv = LIVE[it >= 4 ? 255 : (it * 64) | 0], pc = PHASE[((turn(im, re) * 64) | 0) & 63];
      const dt = BAYER[((y & 3) << 2) | (x & 3)] * 8;
      const r = hc[0] + pc[0] * lv + dt, gg = hc[1] + pc[1] * lv + dt / 2, b = hc[2] + pc[2] * lv + dt;
      buf[i] = ((r > 255 ? 31 : r < 0 ? 0 : r >> 3) << 11) | ((gg > 255 ? 63 : gg < 0 ? 0 : gg >> 2) << 5) | (b > 255 ? 31 : b < 0 ? 0 : b >> 3);
    }
    ops += N * 26;

    // ---- the emitters: each bead shows its drive, the sum of the conjugate waves of all the foci
    for (let m = 0; m < M; m++) {
      const [sx, sy] = SOURCES[m];
      let dr = 0, di = 0;
      for (const [fx, fy, a, ph] of foci) {
        const ddx = fx - sx - 0.5, ddy = fy - sy - 0.5, p = 2 * Math.PI * ph - K * Math.sqrt(ddx * ddx + ddy * ddy);
        dr += a * cos(p); di += a * sin(p);
      }
      const amp = Math.min(1, Math.sqrt(dr * dr + di * di) / 2.2), pc = PHASE[(((turn(di, dr) - wf + 1) * 64) | 0) & 63];
      const x = clamp(sx, 0, W - 1), y = clamp(sy, 0, H - 1), v = 0.25 + 0.75 * amp;
      buf[y * W + x] = (((pc[0] * v) >> 3) << 11) | (((pc[1] * v) >> 2) << 5) | ((pc[2] * v) >> 3);
    }
    for (let x = 0; x < W; x += 2) { buf[x] = 0; buf[(H - 1) * W + x + 1] = 0; }
    for (let y = 0; y < H; y += 2) { buf[(y + 1) * W + W - 1] = 0; buf[(H - 2 - y) * W] = 0; }
    ops += M * foci.length * 12;

    g.cost.px += N;
    g.cost.box += ops;
  },
};
