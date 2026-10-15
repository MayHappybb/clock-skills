// Unison: five small emitters drift about a ripple tank, each singing the
// same note in its own phase. Their circular waves cross the whole glass and
// interfere: bright where they happen to agree, dark along the nodal lines
// between, a pattern that slides as the emitters wander. Along the strokes
// of the time, though, the waves fall into step. Approaching a numeral each
// wave bends its crests into line with the others, so inside the stroke all
// five add up to full brightness, and their common phase runs along the
// pen path like a pulse down a wire.
//
// This is the stylised twin of 'phased'. There the drives are solved and the
// numerals are what physics allows; here the numerals are a coherence mask
// laid on a real five-source interference field, so they are crisp and
// read at any distance, while everything else is honest superposition.
//
// Colour is phase, as in 'phased': a cyclic palette (warm white at the
// crest) looked up from the summed wave's phase; brightness is the summed
// amplitude over the summed weights, so 1 where all agree.
//
// Type: waveguide numerals (unison-glyphs.js), bent like microwave guide or
// neon tube: straight runs joined by bends of one fixed radius, a 5 px
// tube with a 4 px fringe where the free waves blend into step. The colon is
// two steady warm-white sources that swell on the beat.
//
// The beat: every second the five emitters ping together. A bulge of light
// runs down every tube from its pen start to its end in 0.7 s, swelling the
// stroke by two pixels as it passes (like a pulse down a hose), the
// agreement reaches out into the free field and relaxes, and the crest
// bands keep streaming between beats.
//
// Minute: from :57.2 the leaving numeral falls out of step along its pen
// path, in the order it was written: the bands stop, its crests uncurl into the
// passing ripples, and it is gone by :59.6. From :00.1 the new numeral is
// written by a front of agreement travelling along its pen path (done by
// :02.3); at the front the waves converge with a white glint.
//
// Hour: the emitters swim together to the colon and merge into one loud
// source; for a few seconds great concentric rings roll across the strip
// through the numerals, then the five part again.
//
// Cost: five waves per pixel, each a distance table lookup, a phase add and
// a sine-table pair; the coherence blend only where the mask is non-zero
// (~30% of the glass). No Math in the pixel loops.

import { clockFields, clamp, ease, progress, hex, sin, cos } from '../js/kit.js';
import { penRaster } from './phased-glyphs.js';
import { WAVEGUIDE } from './unison-glyphs.js';

const W = 160, H = 80, N = W * H;
const LAMBDA = 8, FREQ = 0.9, BAND = 16;          // px, Hz, px of pen path per colour cycle inside a stroke
const HALF = 2.5, FRINGE = 4;                   // stroke half-width and the bending zone outside it
const SWELL = 2.2, REACH = 1.6;                 // on the beat: a bulge runs down the tube, and the agreement reaches further out
const SLOTS = [[6, 10, 28, 60], [38, 10, 28, 60], [94, 10, 28, 60], [126, 10, 28, 60]];

// ---- tables
const TN = 1024, COS = new Float32Array(TN), SIN = new Float32Array(TN);
for (let j = 0; j < TN; j++) { COS[j] = Math.cos((2 * Math.PI * j) / TN); SIN[j] = Math.sin((2 * Math.PI * j) / TN); }
// distance in quarter pixels -> phase (1/1024 turn) and weight
const DX = 4 * 176, DY = 4 * 96;
const RPH = new Uint16Array((DX + 1) * (DY + 1)), RWT = new Uint8Array((DX + 1) * (DY + 1));
for (let a = 0; a <= DX; a++) for (let b = 0; b <= DY; b++) {
  const r = Math.hypot(a, b) / 4;
  RPH[a * (DY + 1) + b] = Math.round((r / LAMBDA) * TN) & (TN - 1);
  RWT[a * (DY + 1) + b] = Math.round(255 / Math.sqrt(1 + r / 18));
}

// ---- the palette: phase (64) x brightness (48), RGB565
const STOPS = ['#fff2d2', '#ffb070', '#ff6aa8', '#8a7cff', '#58c8ff', '#7cf0d0'].map(hex);
const HN = 64, VN = 48, LUT = new Uint16Array(HN * VN);
for (let h = 0; h < HN; h++) {
  const u = (h / HN) * STOPS.length, k = u | 0, f = u - k, e = f * f * (3 - 2 * f), a = STOPS[k], b = STOPS[(k + 1) % STOPS.length];
  const rgb = [16, 8, 0].map((s) => ((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * e));
  for (let v = 0; v < VN; v++) {
    const t = v / (VN - 1), gm = t ** 1.5;
    LUT[h * VN + v] = (((rgb[0] * gm) >> 3) << 11) | (((rgb[1] * gm) >> 2) << 5) | ((rgb[2] * gm) >> 3);
  }
}
// amplitude squared -> amplitude, and amplitude -> brightness (the free interference half-lit, agreement full)
const SQRT = Float32Array.from({ length: 258 }, (_, j) => Math.sqrt(Math.min(1, j / 256)));
const TONE = Float32Array.from({ length: 258 }, (_, j) => { const u = Math.min(1, j / 256); return 0.08 + 0.5 * u ** 1.4 + 0.42 * Math.max(0, (u - 0.8) / 0.2) ** 2; });
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
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

// ---- a numeral in a slot: per pixel, the distance to its pen path and how far along it (0..1)
// (built at load: on a device these are tables in flash)
const GLYPH = new Map();
for (let k = 0; k < 4; k++) for (let d = 0; d < 10; d++) GLYPH.set(String(d) + k, penRaster(String(d), SLOTS[k], Math.ceil(HALF + SWELL + FRINGE + REACH + 1), WAVEGUIDE));
const glyph = (d, k) => GLYPH.get(d + k);

// ---- the emitters: slow Lissajous loops (period ~ minutes), closed over a day
const DAY = 86400, om = (p) => (2 * Math.PI * Math.round(DAY / p)) / DAY;
const EMIT = [
  [76, 0.9, 211, 0.3, 34, 1.7, 157, 2.0],
  [70, 2.4, 173, 1.1, 30, 0.2, 229, 4.0],
  [74, 4.1, 263, 2.5, 33, 3.1, 139, 1.0],
  [72, 5.6, 149, 4.2, 31, 4.8, 191, 5.2],
  [68, 1.6, 239, 5.3, 34, 0.9, 167, 3.3],
].map(([ax, px, tx, ph, ay, py, ty, ph2]) => ({ ax, px, wx: om(tx), ay, py, wy: om(ty), ph: ph / (2 * Math.PI) }));

const pad = (n) => String(n).padStart(2, '0');
const LEAVE = 57.2, LEAVE_END = 59.6, ARRIVE = 0.1, ARRIVE_END = 2.3;

// per-frame buffers
const SR = new Float32Array(N), SI = new Float32Array(N), SW = new Float32Array(N), CO = new Float32Array(N), PSI = new Float32Array(N), GLINT = new Float32Array(N);

export default {
  name: 'Unison',
  blurb: 'Five drifting emitters, one note: their waves fall into step along the strokes of the time.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, day = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const wt = (ctx.date.getTime() / 1000) * FREQ, wf = wt - Math.floor(wt);
    const prevF = clockFields(new Date(ctx.date.getTime() - 60000)), nextF = clockFields(new Date(ctx.date.getTime() + 60000));
    const now = f.hh + f.mm, prev = prevF.hh + prevF.mm, next = nextF.hh + nextF.mm;

    // the hour: the five swim to the colon and sing as one (minute 0, :02.5 to :13)
    const gather = f.m === 0 ? ease.inOutCubic(progress(s, 2.5, 4.5)) * (1 - ease.inOutCubic(progress(s, 10.5, 13))) : 0;
    const src = EMIT.map((e, j) => {
      let x = 80 + e.ax * sin(e.wx * day + e.px), y = 40 + e.ay * sin(e.wy * day + e.py);
      x += (80 - x) * gather; y += (40 - y) * gather;
      return { x, y, ph: e.ph * (1 - gather), x4: Math.round(x * 4), y4: Math.round(y * 4), boost: 1 + 1.5 * gather };
    });

    // 1. the free field: each wave's phase at every pixel, summed
    const ph0 = src.map((e) => (((e.ph - wf) * TN) | 0) & (TN - 1));
    SR.fill(0); SI.fill(0); SW.fill(0);
    for (let j = 0; j < src.length; j++) {
      const e = src[j], p0 = ph0[j] + TN * 64, bo = e.boost;
      for (let y = 0, i = 0; y < H; y++) {
        const b0 = 4 * y + 2 - e.y4, b = b0 < 0 ? -b0 : b0;
        for (let x = 0; x < W; x++, i++) {
          const a0 = 4 * x + 2 - e.x4, q = (a0 < 0 ? -a0 : a0) * (DY + 1) + b, p = (RPH[q] - p0) & (TN - 1), w = RWT[q] * bo;
          SR[i] += w * COS[p]; SI[i] += w * SIN[p]; SW[i] += w;
        }
      }
    }
    let ops = src.length * N * 9;

    // 2. coherence: where the numerals are, every wave is pulled to a common phase psi
    CO.fill(0); GLINT.fill(0);
    // the beat: every second the five ping together. The tubes swell, the agreement reaches out into
    // the free field and relaxes, and a pulse of light runs down every tube from its pen start to its end
    const bt = s % 1, beat = Math.exp(-bt * 4), ub = ease.outCubic(clamp(bt / 0.7, 0, 1)), gb = 0.55 * (1 - clamp(bt / 0.7, 0, 1));
    const fr0 = FRINGE + REACH * beat, reach = HALF + SWELL + fr0, sw0 = 0.35 * beat;
    const place = (d, k, from, to, glint) => {           // pen path visible from fraction `from` to `to`
      const gl = glyph(d, k);
      for (let y = gl.y0; y < gl.y1; y++) for (let x = gl.x0; x < gl.x1; x++) {
        const j = (y - gl.y0) * gl.gw + x - gl.x0, dd = gl.dist[j];
        if (dd >= reach) continue;
        const u = gl.along[j] / gl.L;
        // the pulse: a bulge about 10 px long riding down the tube with the light
        const zb = (ub - u) * gl.L * 0.1, hw = HALF + SWELL * (sw0 + (zb > -1 && zb < 1 ? (1 - zb * zb) * (1 - zb * zb) * gb * 1.8 : 0));
        const m = clamp((to - u) * 18 + 0.5, 0, 1) * clamp((u - from) * 18 + 0.5, 0, 1);
        if (m <= 0) continue;
        let c = dd <= hw ? 1 : 1 - (dd - hw) / fr0; c = c * c * (3 - 2 * c) * m;
        const i = y * W + x;
        if (c > CO[i]) { CO[i] = c; PSI[i] = gl.along[j] / BAND; }
        if (dd < hw + 1.5) {
          const fall = 1 - dd / (hw + 1.5);
          if (glint) { const z = (to - u) * 14; if (z > -1 && z < 1) GLINT[i] = Math.max(GLINT[i], (1 - z * z) * glint * fall); }
          if (gb > 0) { const z = (ub - u) * 9; if (z > -1 && z < 1) GLINT[i] = Math.max(GLINT[i], (1 - z * z) * gb * fall * m); }
        }
        ops += 14;
      }
    };
    for (let k = 0; k < 4; k++) {
      const a = now[k], changing = (s >= LEAVE && next[k] !== a), arriving = (s < ARRIVE_END + 0.5 && prev[k] !== a);
      if (changing) {
        const fr = ease.inOutCubic(progress(s, LEAVE + k * 0.12, LEAVE_END - (3 - k) * 0.12));
        if (fr < 1) place(a, k, fr, 2, 0);
      } else if (arriving) {
        const fr = ease.inOutCubic(progress(s, ARRIVE + (3 - k) * 0.1, ARRIVE_END - k * 0.1));
        if (fr > 0) place(a, k, 0, fr, fr < 1 ? 1 : 0);
      } else place(a, k, 0, 2, 0);
    }
    // 3. paint: the free sum's phase is bent toward psi by the coherence, and its amplitude rises
    // to full only in the stroke's core, so the fringe is where you watch the crests swing into line
    const buf = g.buf, bgk = 1 - 0.6 * gather;         // one loud source makes the whole tank agree: hold the numerals above it
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const re = SR[i], im = SI[i], sw = SW[i];
      let a2 = (re * re + im * im) / (sw * sw), a = turn(im, re);
      const c = CO[i];
      let amp = SQRT[(a2 * 256) | 0], v;
      if (c > 0) {
        // blend the free sum toward the agreed wave as complex numbers: continuous everywhere, so no seams
        // where the free phase sits opposite psi (there the amplitude dips instead, as real waves would)
        const pr = (((PSI[i] - wf + 64) * TN) | 0) & (TN - 1), nr = re / sw, ni = im / sw;
        const br = nr + (COS[pr] - nr) * c, bi = ni + (SIN[pr] - ni) * c;
        a = turn(bi, br);
        const c3 = c * c * c;
        amp = SQRT[((br * br + bi * bi) * 256) | 0];
        amp += (1 - amp) * c3;
        v = TONE[(amp * 256) | 0] * (bgk + (1 - bgk) * c3) * (1 - 0.3 * c3 * (0.5 - 0.5 * COS[((a * TN) | 0) & (TN - 1)]));   // crests show as light bands
        ops += 14;
      } else v = TONE[(amp * 256) | 0] * bgk;
      v += GLINT[i];
      let vi = v * (VN - 1) + BAYER[((y & 3) << 2) | (x & 3)];
      vi = vi < 0 ? 0 : vi > VN - 1 ? VN - 1 : vi | 0;
      const h = GLINT[i] > 0.5 ? 0 : (((a + 8) * HN) | 0);
      buf[i] = LUT[(h & (HN - 1)) * VN + vi];
    }
    ops += N * 24;

    // the colon: two steady sources of the agreed note, warm white, swelling on the beat
    for (const cy of [30, 50]) {
      g.fillCircle(80, cy, 3.4 + 0.9 * beat, 0x000000, { aa: true, a: 0.6 });
      g.fillCircle(80, cy, 2.1 + 0.9 * beat, 0xfff2d2, { aa: true });
    }

    // 4. the emitters: a dark well with a bright core, and on every beat a ring of light leaving each
    // one at the wave speed (a crest, made visible), so they read as the sources of everything
    const cpx = LAMBDA * FREQ;                                            // wave speed, px/s
    for (const e of src) {
      const crest = 0.5 + 0.5 * cos(2 * Math.PI * (e.ph - wf));
      const r = (1.3 + 0.4 * crest + 0.8 * beat) * (1 + 0.8 * gather);
      g.fillCircle(e.x, e.y, r + 1.6, 0x000000, { aa: true, a: 0.7 });
      g.fillCircle(e.x, e.y, r, 0xfff6e0, { aa: true });
      for (let n = 0; n < 2; n++) {                                       // this beat's ring and the last one's
        const age = bt + n, rr = 2 + age * cpx * 1.6, fade = (1 - age / 2) * (1 - 0.7 * gather);
        if (fade > 0) g.ring(e.x, e.y, rr, rr + 1, 0xfff6e0, { aa: true, a: 0.5 * fade * fade });
      }
    }

    g.cost.px += N;
    g.cost.box += ops;
  },
};
