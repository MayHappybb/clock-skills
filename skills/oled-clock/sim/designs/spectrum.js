// Spectrum — the time written by a hi-fi spectrum analyser.
//
// The glass is a 42-band graphic analyser, a 1980s stereo's: bars two
// pixels wide on a three-pixel pitch, rising from a floor over a row of
// band labels, with falling peak-hold caps. The music is synthetic and
// deterministic: 120 bpm, so a beat is half a second and every minute is
// exactly 30 bars. A four-on-the-floor kick, a bass line ducked by the
// kick, a snare on two and four, hi-hats in eighths with open hats on the
// off-beats, and a sixteenth-note arpeggio with harmonics, each with its
// own spectrum across the bands. Bars have analyser ballistics: they jump
// up and fall back at a fixed rate; the caps hold, then drop with gravity.
// Both are computed as a maximum over the last second of samples of the
// music, so any frame is a pure function of the clock.
//
// The digits are made of the bars. Each digit covers eight bands; inside
// its strokes the bars are lit solid, so the time stands in the bars like a
// stencil, its round tops drawn by the columns like a response curve. Where
// a bar is outside a digit it shows only every third row, as the unlit LED
// segments of a real meter do, and above the digits the bars are lit LED
// segments, so the music dances over the time.
//
// The minute is a drop. From :52 the track builds: the kick drops out, the
// snare rolls in quarters, eighths, sixteenths, thirty-seconds, a riser
// sweeps up the bands, the bars climb. At :59.4 everything cuts out and the
// digits that are about to change fall through the floor column by column.
// At :00 the drop hits: every band spikes to the top, the caps fly up, and
// the new digits spring up out of the floor bar by bar, left to right, each
// column overshooting and settling, while the groove comes back.
//
// The hour is the climax: a longer, louder build; at :58.8 the whole time
// falls through the floor; at :00 the panel flashes, the analyser drops
// away and a pair of VU meters rises from below, needles slammed onto the
// pegs by the hit and then dancing to the beat, the new hour between them.
// At :04 they sink and the analyser comes back with the new time rising out
// of the floor in one sweep across all four digits.
//
// Burn-in: the bars and caps move all the time; the digits, colon and
// labels walk kit.orbit; the dim segments are a third of a bar; 23:00-07:00
// the panel dims.

import { clockFields, previousMinute, orbit, font3x5 } from '../js/kit.js';

const W = 128, H = 64;
const NB = 42, PITCH = 3, X0 = 1;      // bands, pitch, x of band 0
const FLOOR = 57;                      // first row below the bars
const DTOP = 17, DH = 40;              // the digits' rows
const MAXH = FLOOR;                    // a bar's full height, px
const SLOT = [2, 11, 23, 32];          // first band of each digit
const COLON = [20, 21];                // bands of the colon
const DW = 8;                          // bands per digit
const TAU = Math.PI * 2;

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const outBack = (u, c = 1.7) => { u = clamp01(u); return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------ letterforms
// Centre-lines in a 23 x 40 box (band centres at x = 1, 4, ... 22). The
// strokes are measured anisotropically: half a stroke is HX across (two
// bands) and HY down, so verticals are two bars and horizontals 5 rows.

const BW = 23, HX = 3.4, HY = 2.7;
function arc(cx, cy, rx, ry, a0, a1, n = 28) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return pts;
}
/** Catmull-Rom through control points, finely sampled. */
function spline(pts) {
  const at = (i) => {
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= pts.length) return [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]];
    return pts[i];
  };
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < 8; k++) {
      const t = k / 8, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts.at(-1));
  return out;
}

const SIX = spline([[19.5, 5], [14, 2.7], [8, 3.6], [3.8, 9], [2.4, 18], [2.4, 27], [4.6, 34.5], [11.5, 37.3], [18.4, 34.5], [20.6, 27.5], [18.6, 20.5], [11.5, 17.6], [5, 19.8], [2.6, 25]]);
const SK = {
  0: [arc(11.5, 20, 9.1, 17.3, 0, 360, 40)],
  1: [[[1.6, 12.5], [11.5, 2.7]], [[11.5, 2.7], [11.5, 37.3]]],
  2: [[...arc(11.5, 11.6, 9.1, 8.9, -78, 112, 22), [3.2, 36], [2.4, 37.3], [20.6, 37.3]]],
  3: [arc(11.2, 11, 8.6, 8.3, -76, 180, 22), arc(11.2, 28.6, 9.4, 8.7, 0, 242, 26)],
  4: [[[16, 37.3], [16, 2.7], [2.4, 27], [20.8, 27]]],
  5: [[[19.8, 2.7], [4.6, 2.7], [3.6, 17.4], ...arc(11.2, 26.6, 9.4, 10.7, -62, 222, 26).slice(1)]],
  6: [SIX],
  7: [[[2.4, 2.7], [20.6, 2.7], [8.5, 37.3]]],
  8: [arc(11.5, 10.6, 7.8, 7.9, 0, 360, 30), arc(11.5, 28.4, 9.1, 8.9, 0, 360, 34)],
  9: [SIX.map(([x, y]) => [BW - x, DH - y])],
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

/** Each digit as a mask of DW bands x DH rows, and each band's top row. */
const MASK = {}, TOPROW = {};
for (let d = 0; d <= 9; d++) {
  const m = new Uint8Array(DW * DH), top = new Int8Array(DW).fill(DH);
  const paths = SK[d].map((p) => p.map(([x, y]) => [x / HX, y / HY]));
  for (let j = 0; j < DW; j++)
    for (let r = 0; r < DH; r++) {
      const px = (PITCH * j + 1) / HX, py = (r + 0.5) / HY;
      let inside = false;
      for (const p of paths) {
        for (let i = 1; i < p.length && !inside; i++) if (segD(px, py, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= 1) inside = true;
        if (inside) break;
      }
      if (inside) { m[j * DH + r] = 1; if (r < top[j]) top[j] = r; }
    }
  MASK[d] = m; TOPROW[d] = top;
}

// ------------------------------------------------------------ the music

const BEAT = 0.5;
/** Bass line, in bands above band 2: one note per two beats. */
const BASS = [0, 0, 3, 2, 0, 0, 5, 3];
/** Arpeggio in bands, over a four-bar chord cycle. */
const ARP = [0, 4, 7, 4, 9, 7, 4, 2];
const CHORD = [0, -2, 3, 1];
const gauss = (c, m, w) => { const d = (c - m) / w; return Math.exp(-d * d); };

const minuteInfo = new Map();
/** Whether minute `key` (minutes since the epoch, local) ends in an hour turn. */
function endsHour(key) {
  let v = minuteInfo.get(key);
  if (v === undefined) {
    v = clockFields(new Date((key + 1) * 60000)).m === 0;
    minuteInfo.set(key, v);
    if (minuteInfo.size > 16) minuteInfo.delete(minuteInfo.keys().next().value);
  }
  return v;
}

const BUILD_M = 8, BUILD_H = 12;       // the build, s before :00
const CUT_M = 0.6, CUT_H = 1.2;        // silence before the drop
const VU_IN = 0.05, VU_OUT = 4.0;      // the hour's VU meters, s after :00

/**
 * The instruments at wall time `ts` (s since the epoch): envelopes and
 * pitches, written into `S`. Bars: everything in the minute is locked to
 * the minute, 120 bpm.
 */
function instruments(ts, S) {
  const key = Math.floor(ts / 60), s = ts - key * 60;
  const hourEnd = endsHour(key), hourStart = endsHour(key - 1);
  const build = hourEnd ? BUILD_H : BUILD_M, cut = hourEnd ? CUT_H : CUT_M;
  const u = clamp01((s - (60 - build)) / build);   // 0 until the build, then 0..1
  const silent = s >= 60 - cut;
  const beat = s / BEAT, bi = Math.floor(beat), ph = (beat - bi) * BEAT;
  let kick = Math.exp(-ph / 0.11);
  if (u > 0.5 || silent) kick = 0;
  // The snare: two and four, then a roll that doubles as the build goes on.
  let snare = 0;
  if (u <= 0) { if (bi % 2 === 1) snare = Math.exp(-ph / 0.09); }
  else {
    const iv = u < 0.5 ? 0.5 : u < 0.75 ? 0.25 : u < 0.9 ? 0.125 : 0.0625;
    snare = (0.55 + 0.6 * u) * Math.exp(-(s % iv) / Math.min(0.09, iv * 0.6));
  }
  const hs = s % 0.25, hi = Math.floor(s / 0.25);
  let hat = Math.exp(-hs / (hi % 2 ? 0.07 : 0.025)) * (hi % 2 ? 1 : 0.55);
  if (u > 0.5) hat = Math.exp(-(s % 0.125) / 0.03) * 0.8;
  const pn = s % 1;
  let bass = (1 - 0.75 * kick) * (1 - Math.exp(-pn / 0.02)) * (0.6 + 0.4 * Math.exp(-pn / 0.4));
  if (u > 0.5) bass *= 1 - (u - 0.5) * 1.6;
  const pl = s % 0.125;
  const lead = (Math.floor(s / 0.125) % 3 === 2 ? 0.35 : 0.75) * Math.exp(-pl / 0.06);
  S.kick = kick; S.snare = silent ? 0 : snare; S.hat = silent ? 0 : hat;
  S.bass = silent ? 0 : Math.max(0, bass); S.lead = silent ? 0 : lead;
  S.bc = 2 + BASS[Math.floor(s) % 8];
  S.lc = 15 + ARP[Math.floor(s / 0.125) % 8] + CHORD[Math.floor(s / 8) % 4] + (u > 0 ? Math.round(u * 6) : 0);
  S.riser = silent ? 0 : u > 0 ? 0.25 + 1.1 * u * u : 0;
  S.rc = 4 + 37 * u; S.rw = 3 + 7 * u;
  S.gain = 1 + 0.35 * u * (hourEnd ? 1.5 : 1);
  // The drop: a hit across every band at :00.
  S.drop = s < 1.2 ? (hourStart ? 2.2 : 1.6) * Math.exp(-s / (hourStart ? 0.3 : 0.22)) : 0;
  // The hour's VU interlude: the analyser falls away while the meters are up.
  S.show = hourStart ? 1 - smooth((s - VU_IN) / 0.15) + smooth((s - VU_OUT + 0.3) / 0.5) : 1;
  S.key = key; S.s = s;
  S.frame = Math.floor(ts * 60 + 1e-6);
  S.n24 = Math.floor(ts * 24); S.f24 = ts * 24 - S.n24;
}

// Each instrument's spectrum across the bands, tabulated.
const PK = new Float32Array(NB), PS = new Float32Array(NB), PH = new Float32Array(NB);
for (let c = 0; c < NB; c++) {
  PK[c] = 1.5 * gauss(c, 1.5, 3) + 0.3 * gauss(c, 11, 5);
  PS[c] = 0.9 * gauss(c, 18, 7);
  PH[c] = 0.7 * smooth((c - 25) / 12);
}
/** A pitched voice with harmonics, by distance in bands from its fundamental. */
const PB = new Float32Array(2 * NB + 1), PL = new Float32Array(2 * NB + 1);
for (let d = -NB; d <= NB; d++) {
  PB[d + NB] = 0.75 * gauss(d, 0, 1.6) + 0.35 * gauss(d, 5, 1.5) + 0.15 * gauss(d, 8, 1.5);
  PL[d + NB] = 1.1 * gauss(d, 0, 1.1) + 0.5 * gauss(d, 5, 1.1) + 0.3 * gauss(d, 8, 1.3);
}

/** Energy in band c for the instruments `S` at sample time `ts`. */
function energy(S, c, ts) {
  const fr = S.frame;
  let e = S.kick * PK[c] + S.bass * PB[c - S.bc + NB] + S.lead * PL[c - S.lc + NB];
  if (S.snare > 0.01) e += S.snare * (PS[c] + (c > 6 ? 0.35 * hash(c, fr, 5) : 0));
  if (S.hat > 0.01) e += S.hat * PH[c] * (0.6 + 0.8 * hash(c, fr, 9));
  if (S.riser > 0) e += S.riser * gauss(c, S.rc, S.rw);
  if (S.drop > 0.01) e += S.drop * (0.9 + 0.2 * hash(c, 3, fr >> 1));
  // A little room noise in every band.
  e += 0.05 * (hash(c, S.n24, 1) * (1 - S.f24) + hash(c, S.n24 + 1, 1) * S.f24);
  return e * S.gain;
}

const heightOf = (e) => MAXH * (1 - Math.exp(-2.1 * e));

const REL = 110;                 // bars fall at this rate, px/s
const HOLD = 0.45, GRAV = 170;  // caps hold, then fall with gravity
const NS = 80;                  // samples of the past, at 60 per second
const SL = new Float32Array(NB), SP = new Float32Array(NB);
const S = {};
const LOUD = new Float32Array(NS * 2);

/** Bar heights and caps at wall time T, from the last NS samples. */
function analyse(T) {
  SL.fill(0); SP.fill(0);
  const k0 = Math.floor(T * 60);
  for (let k = 0; k < NS; k++) {
    const ts = (k0 - k) / 60, age = T - ts;
    instruments(ts, S);
    const rel = REL * age;
    const fall = age < HOLD ? 0 : 0.5 * GRAV * (age - HOLD) ** 2;
    let lsum = 0, rsum = 0;
    for (let c = 0; c < NB; c++) {
      const h0 = heightOf(energy(S, c, ts)), h = h0 * S.show;
      if (h - rel > SL[c]) SL[c] = h - rel;
      if (h - fall > SP[c]) SP[c] = h - fall;
      if (c < 21) lsum += h0; else rsum += h0;
    }
    // What the VU meters hear: the loudness of each half of the spectrum.
    LOUD[2 * k] = lsum / 21 / MAXH; LOUD[2 * k + 1] = rsum / 21 / MAXH;
  }
}

// ------------------------------------------------------------ the VU meters

/** A VU needle: a critically damped movement driven by the loudness (closed form over the samples). */
function needle(ch, drop) {
  const w = 15;
  let v = 0, norm = 0;
  for (let k = 0; k < NS; k++) {
    const a = k / 60, h = w * w * a * Math.exp(-w * a);
    v += LOUD[2 * k + ch] * h; norm += h;
  }
  return v / norm * 1.7 + drop;
}

function drawMeter(g, cx, y0, p, label) {
  // The face: a card with the scale arc and ticks, the red zone heavy, a
  // pivot housing at the bottom; the needle swings from below it.
  const pcy = y0 + 60, R = 33, A0 = -0.82, A1 = 0.82;
  const at = (r, a) => [Math.floor(cx + r * Math.sin(a)), Math.floor(pcy - r * Math.cos(a))];
  g.fillRect(cx - 26, y0 + 6, 52, 52, 0);
  for (let i = 0; i <= 100; i++) {
    const a = A0 + ((A1 - A0) * i) / 100;
    g.pixel(...at(R, a), 1);
    if (i > 70) { g.pixel(...at(R + 1, a), 1); g.pixel(...at(R + 2, a), 1); }
  }
  for (let k = 0; k <= 10; k++) {
    const a = A0 + ((A1 - A0) * k) / 10;
    const r1 = k % 5 === 0 || k === 7 ? R + 5 : R + 3;
    for (let r = R + 1; r <= r1; r += 0.5) g.pixel(...at(r, a), 1);
  }
  g.text('-', cx - 22, y0 + 13, { font: font3x5 });
  g.text('+', cx + 20, y0 + 13, { font: font3x5 });
  g.text('VU', cx - 3, y0 + 37, { font: font3x5 });
  const pos = Math.min(1.06, Math.max(-0.03, p));
  const a = A0 + (A1 - A0) * pos;
  g.thickLine(cx + 14 * Math.sin(a), pcy - 14 * Math.cos(a), cx + (R + 5) * Math.sin(a), pcy - (R + 5) * Math.cos(a), 1.3, 1);
  g.fillRect(cx - 26, y0 + 49, 52, 10, 0);
  g.fillCircle(cx, y0 + 56, 5.5, 1);
  g.text(label, cx - 21, y0 + 51, { font: font3x5 });
  g.roundRect(cx - 26, y0 + 6, 52, 52, 3, 1);
}

// ------------------------------------------------------------ face

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);
const LABELS = [[1, '60'], [9, '250'], [18, '1K'], [27, '4K'], [37, '16K']];

/** Where band c is: which digit slot and its band in the digit, or the colon. */
const BAND = Array.from({ length: NB }, (_, c) => {
  for (let k = 0; k < 4; k++) if (c >= SLOT[k] && c < SLOT[k] + DW) return { k, j: c - SLOT[k] };
  if (COLON.includes(c)) return { colon: true };
  return {};
});

export default {
  name: 'Spectrum',
  blurb: 'A hi-fi spectrum analyser whose bars stand in the shape of the time; every minute the track builds and drops and the new digits spring out of the floor; on the hour a pair of VU meters slams.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const T = date.getTime() / 1000;
    analyse(T);
    const late = f.sec >= 30;
    const from = late ? f : previousMinute(date);
    const to = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const hour = to.m === 0;
    const A = digitsOf(from), B = digitsOf(to);
    const [ox, oy] = orbit(date, 2, 3);
    const oyy = Math.max(-1, Math.min(1, oy));

    // Each band's digit offset: 0 at rest, positive while sinking or rising.
    const cut = hour ? CUT_H : CUT_M;
    const buf = g.buf;
    for (let c = 0; c < NB; c++) {
      const x = X0 + PITCH * c + ox;
      const L = SL[c], P = Math.max(SP[c], L);
      const info = BAND[c];
      let mask = null, dy = 0, top = DH;
      if (info.k !== undefined) {
        const k = info.k, j = info.j;
        const changing = hour || A[k] !== B[k];
        const order = (hour ? k * DW + j : (k - 2) * DW + j) / (hour ? 32 : 16);
        let d = tau < 0 ? A[k] : B[k];
        if (changing && tau < 0 && tau > -cut) {
          // Falling through the floor.
          const t = tau + cut - 0.25 * cut * order;
          dy = t > 0 ? 0.5 * 420 * t * t : 0;
          if (tau > -0.05) dy = 99;
        } else if (changing && tau >= 0) {
          const t0 = hour ? VU_OUT + 0.15 + 1.2 * order : 0.32 + 0.7 * order;
          const e = outBack((tau - t0) / 0.3, 2.2);
          dy = tau < t0 ? 99 : (1 - e) * (DH + 2);
        }
        if (dy < 99) { mask = MASK[d]; top = TOPROW[d][j]; }
        if (mask) mask = { m: mask, j };
      }
      for (let y = 0; y < FLOOR + oyy; y++) {
        const h = FLOOR + oyy - y;         // height above the floor
        let on = 0;
        // The digit, shifted down by dy and cut at the floor.
        if (mask) {
          const r = y - DTOP - oyy - Math.round(dy);
          if (r >= 0 && r < DH && mask.m[mask.j * DH + r]) on = 2;
        } else if (info.colon && !(hour && tau > -cut && tau < VU_OUT + 0.5)) {
          const r = y - DTOP - oyy;
          if ((r >= 10 && r < 15) || (r >= 26 && r < 31)) on = 2;
        }
        if (!on && h <= L) {
          // Above the digits a lit LED segment; among them an unlit one.
          if (y < DTOP + oyy - 1) on = h % 3 ? 1 : 0;
          else if (!mask) on = h % 3 === 0 ? 3 : 0;   // inside a digit's bands the counters stay black
        }
        // The cap; inside a digit's bands only above the digit, never in its counters.
        if (!on && Math.abs(h - Math.round(P) - 1) < 0.5 && P > 1.5 && (!mask || y < DTOP + oyy + top + Math.round(dy) - 1)) on = 1;
        if (on) {
          if (x >= 0 && x < W) buf[y * W + x] = 1;
          if (on !== 3 && x + 1 >= 0 && x + 1 < W) buf[y * W + x + 1] = 1;
        }
      }
    }

    // The band labels under the floor.
    const vu = hour && tau >= VU_IN && tau < VU_OUT + 0.6;
    for (const [c, txt] of LABELS) g.text(txt, X0 + PITCH * c + ox, FLOOR + 1 + oyy, { font: font3x5 });

    // The hour's VU meters.
    if (vu) {
      const up = outBack((tau - VU_IN) / 0.45, 1.3) * (1 - smooth((tau - VU_OUT + 0.1) / 0.5));
      const y0 = Math.round(64 * (1 - up)) - 6;
      const hit = 1.6 * Math.exp(-Math.max(0, tau) / 0.5);
      const pL = needle(0, hit), pR = needle(1, hit * 0.95);
      drawMeter(g, 28, y0, pL, 'L');
      drawMeter(g, 100, y0, pR, 'R');
      // The new hour between them, and a peak lamp that lights on the hits.
      g.fillRect(55, y0 + 6, 18, 52, 0);
      g.text(to.hh, 59, y0 + 18, { font: font3x5 });
      g.text(to.mm, 59, y0 + 26, { font: font3x5 });
      const peak = Math.max(pL, pR) > 1.0;
      g.text('PEAK', 57, y0 + 42, { font: font3x5 });
      if (peak) g.fillRect(61, y0 + 35, 6, 4, 1); else g.rect(61, y0 + 35, 6, 4, 1);
    }

    oled.invert(hour && tau >= 0 && tau < 0.034);
    oled.contrast(0xcf + (0x1c - 0xcf) * night);
  },
};
