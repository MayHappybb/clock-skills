// Fillmore: the glass is a 1966 San Francisco dance-concert poster (the
// Fillmore and Avalon bills of Wes Wilson, Victor Moscoso, Bonnie
// MacLean), and the time is its lettering. The four numerals are hand
// lettering drawn for this grid (fillmore-glyphs.js: Roller's tall
// Secession letters as Wilson revived them, swollen to fill their space,
// thick-thin, soft melted corners, ball terminals), and everything else on
// the sheet is the lettering's own echo: the ground is a stack of
// concentric contour lines that follow every letter's outline outward, two
// inks side by side at full saturation, the way Wilson and Moscoso filled a
// poster's leftover space so the eye can't rest. There is no picture
// "around" the time: the time is the poster.
//
// The time is alive every second, as a poster you are staring at too long:
// - On every beat a swelling lens rolls through the lettering left to right
//   (each letter fattens, its stems bow outward, the bowl stretches up and
//   down, then relaxes), and every letter gives a small swell of its own on
//   the beat.
// - On every beat an inline (the light second ink) is drawn just inside each
//   letter's edge and travels inward through its stroke, like a ripple
//   running into the paint; the letters run in sequence behind the lens.
// - The echo lines march outward one band each second, a glide that eases
//   on the beat, so the whole ground breathes out of the lettering.
// - The letters' outlines are wavy: a slow wave runs down the rows and
//   across the columns, so stems ripple like heat over a road.
// Every 15 s a flourish: at :15 and :45 two bright echo rings burst out of
// the letters and run off the sheet (the letters swell on that beat); at
// :30 the complementary inks swap: on the beat the letters flip to the
// ground's ink, the swap flows out through the echo lines band by band, and
// a second front swaps them all back: the colour vibration the posters are
// known for, made into a move. The whole line of lettering bulges like a
// Wilson balloon (edge letters shorter) and rolls on a slow S-wave.
//
// Minute turn, the poster's own melt: from :58 each changing letter's paint
// sags (its columns run downward at their own rates, a drip), it hollows
// out from the inside (the echo lines flow into the letter, its fill
// shrinking to a rim, never closing a counter: the interior becomes ground,
// not ink), the rim thins to the bare keyline, the keyline dissolves, and
// for ~0.5 s the letter is only echo lines round a flat pool of ground ink:
// the contours themselves flow from the old shape into the new one (a
// blended distance field; the pool hides the near contours, which could
// spell a third digit mid-blend). Then the
// new keyline is drawn, the paint runs back into it from the edge inward,
// and the sag springs back up. The unchanged letters keep dancing.
// Hour: the whole poster re-inks. Starting with the turn, all six of the
// poster's colourways ripple out of the lettering, one after another,
// band by band (fill and ground of each pair together), seven fronts, until
// the sheet settles in the new hour's colourway. The keyline stays the
// darkest ink throughout, so the time reads in every frame.
//
// Palette: the San Francisco poster rule: complementary pairs at full
// saturation side by side (red on green, orange on blue, magenta on lime,
// yellow on violet, turquoise on red, green on magenta; one per hour),
// each with a second, lighter ink for the inline and a second ground ink
// for the echo lines, and a deep near-black purple keyline that holds the
// letters (the "black" ink of a two- or three-ink run). Flat fills, hard
// pixels: a printed poster has no gradients. Night: the ground inks sink
// to 40 %, the letters keep 90 % of their ink and the backlight drops to
// 45 %, so the lettering glows out of a dark sheet.
//
// Cost: every pixel is one warped bilinear lookup into a per-minute byte
// distance field (180x100, composed from five 59x92 glyph fields, ~27k
// byte mins once a minute, charged to the frame that builds it), then a
// 256-entry ink table per letter built each frame. Two lookups and a blend
// during the 0.5 s melt. No per-pixel callbacks, no Math in the pixel loop.

import { clockFields, noise, sin, progress, ease, to565 } from '../js/kit.js';
import { FIELDS, CW, CH, Q0, MARGIN } from './fillmore-glyphs.js';

const W = 160, H = 80, N = W * H;
const FM = 10, FW = W + 2 * FM, FH = H + 2 * FM;     // the composed field, with a margin for the warp
const TOP = 8;                                       // glyph box top on the glass
const BOX = [2, 38, 64, 91, 127];                    // box left edges: H1 H2 colon M1 M2
const CEN = [17.5, 53.5, 80, 106.5, 142.5];          // their centres
const SLOT = new Uint8Array(FW);                     // field column -> slot
for (let x = 0; x < FW; x++) { const g = x - FM; SLOT[x] = g < 36 ? 0 : g < 72 ? 1 : g < 88 ? 2 : g < 124 ? 3 : 4; }
const UMAX = (FW - 2) * 256 + 255;
const VMIN = (TOP + FM - MARGIN) * 256, VMAX = (TOP + FM - MARGIN + CH - 2) * 256 + 255;   // stay inside the composed fields

// ------------------------------------------------------------ the poster's inks

const C = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// fill, inline, keyline, ground 1, ground 2
export const WAYS = [
  [0xff3020, 0xffc040, 0x2a0a3c, 0x20c860, 0x86d22a],   // red on green
  [0xff7a10, 0xffe060, 0x1a0a40, 0x2a5cff, 0x7a3cff],   // orange on blue
  [0xff2a9a, 0xffb8e0, 0x2a0a30, 0x8ee82a, 0x3ad050],   // magenta on lime
  [0xffe41a, 0xff9a2a, 0x200838, 0x8a34e8, 0x4a40e0],   // yellow on violet
  [0x1ae0d0, 0xc0fff0, 0x1a0828, 0xff3a24, 0xe8186a],   // turquoise on red
  [0x4aff3a, 0xf0ff70, 0x1a0a28, 0xe82aa8, 0xb02ae0],   // green on magenta
].map((w) => w.map(C));
const NIGHT_K = [230, 218, 180, 102, 102];             // /256 at full night
const SWAP = [3, 4, 2, 0, 1];                          // the :30 swap: fill <-> ground, inline <-> second ground

// palettes of the fronts in flight this frame: STEPS[k * 5 + ink]
const STEPS = new Uint16Array(8 * 5);
function setStep(k, way, swap, night256) {
  for (let i = 0; i < 5; i++) {
    const c = WAYS[way][swap ? SWAP[i] : i], m = 256 - (((256 - NIGHT_K[i]) * night256) >> 8);
    STEPS[k * 5 + i] = to565((((c[0] * m) >> 8) << 16) | (((c[1] * m) >> 8) << 8) | ((c[2] * m) >> 8));
  }
}

// ------------------------------------------------------------ fields, one per minute

const CACHE = new Map();
let buildOps = 0;
function fieldFor(f) {
  const key = f.hh + f.mm;
  let F = CACHE.get(key);
  if (F) return F;
  F = new Uint8Array(FW * FH).fill(255);
  const ids = [+key[0], +key[1], 10, +key[2], +key[3]];
  for (let s = 0; s < 5; s++) {
    const src = FIELDS[ids[s]], ox = BOX[s] + FM - MARGIN, oy = TOP + FM - MARGIN;
    for (let y = 0; y < CH; y++) {
      const fy = oy + y;
      if (fy < 0 || fy >= FH) continue;
      for (let x = 0; x < CW; x++) {
        const fx = ox + x;
        if (fx < 0 || fx >= FW) continue;
        const v = src[y * CW + x], j = fy * FW + fx;
        if (v < F[j]) F[j] = v;
      }
    }
  }
  buildOps += 5 * CW * CH;
  CACHE.set(key, F);
  if (CACHE.size > 3) CACHE.delete(CACHE.keys().next().value);
  return F;
}

// ------------------------------------------------------------ per-frame tables

const UX = new Int32Array(W), DX = new Int32Array(H), AV = new Int32Array(W), BV = new Int32Array(W);
const LUT = new Uint16Array(5 * 256);
const W8 = new Int32Array(5);

const SIG = 20, PASS = 0.9, LA = 0.3;                // the beat's lens: half-width, pass time, strength
const BW = 4, KEY = 1.7, FULL = 7, IW = 1.8;         // echo band width, keyline, a full fill, inline width
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (z) => (z > -SIG && z < SIG ? 0.5 + 0.5 * sin((z / SIG) * Math.PI + Math.PI / 2) : 0);

// The fronts: palette step k at distance dr is floor((R - dr - 8) / LAM),
// clamped to 0..K. Distances are clamped at DCAP so far corners don't lag.
const front = { on: false, R: 0, LAM: 6, K: 0 };
const DCAP = 24;
// The :15/:45 burst rings: distances of the two rings (or -99 when off).
const rings = [-99, -99];

/** One slot's ink table: q (distance byte) -> colour. */
function lut(slot, e, key, ring, phi, P4, pool) {
  const o = slot << 8;
  const p0 = 0.6 + 5 * phi;
  for (let q = 0; q < 256; q++) {
    const dr = (q - Q0) / 4, d = dr - e;
    let base = 0;
    if (front.on) {
      // a letter and its first 8 px of ground always change ink together (fill never meets its own colour)
      const dd = dr < 8 ? 8 : dr < DCAP ? dr : DCAP;
      let k = (front.R - dd - 8) / front.LAM;
      k = k <= 0 ? 0 : k >= front.K ? front.K : k | 0;
      base = k * 5;
    }
    let c;
    if (dr < pool) c = STEPS[base + 3];
    else if (d < 0 && -d < ring) c = STEPS[base + (-d >= p0 && -d < p0 + IW ? 1 : 0)];
    else if (d >= 0 && d < key) c = STEPS[base + 2];
    else {
      const r0 = d - key - rings[0], r1 = d - key - rings[1];
      if ((r0 > -1.1 && r0 < 1.1) || (r1 > -1.1 && r1 < 1.1)) c = STEPS[base + 1];
      else c = STEPS[base + 3 + (((q - Q0 - P4 + 4096) >> 4) & 1)];
    }
    LUT[o | q] = c;
  }
}

export default {
  name: 'Fillmore',
  blurb: 'A 1966 Fillmore poster: the time is its swollen, wavy lettering, echoed out to the edges in vibrating complementary inks; letters melt into the next minute, and the hour re-inks the sheet.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    buildOps = 0;

    // ---- which minute's lettering, and which letters are changing
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    let FA = fieldFor(f), FB = null, tau = 99;
    const chg = [false, false, false, false, false];
    let a4 = f.hh + f.mm, b4 = a4;
    if (s >= 57.5) { b4 = nxt.hh + nxt.mm; FB = fieldFor(nxt); tau = s - 60; }
    else if (s < 2.5) { a4 = prv.hh + prv.mm; FA = fieldFor(prv); FB = fieldFor(f); tau = s; }
    if (FB) for (let k = 0; k < 4; k++) chg[k < 2 ? k : k + 1] = a4[k] !== b4[k];

    // the changing letters' states: sag, hollow out to a rim, bare keyline,
    // (only echo lines: the contours flow from one shape to the next),
    // new keyline, the paint runs back in, the sag springs back
    const ringOld = FULL * (1 - ease.inOutQuad(progress(tau, -1.8, -0.6)));
    const keyOld = KEY * (1 - progress(tau, -0.6, -0.25));
    const morph = sm(progress(tau, -0.25, 0.25));
    const keyNew = KEY * progress(tau, 0.25, 0.6);
    const ringNew = FULL * ease.inOutQuad(progress(tau, 0.6, 1.7));
    let melt = 0;
    if (tau < -0.25) melt = 0.11 * ease.inQuad(progress(tau, -2.2, -0.25));
    else if (tau < 0.25) melt = 0.11 - 0.2 * sm(progress(tau, -0.25, 0.25));
    else melt = -0.09 * (1 - ease.outBack(progress(tau, 0.25, 1.9)));
    const useB = tau >= 0;
    // while the letter is only contours, its core is a flat pool of ground ink
    // (the near contours of a blend could spell a third digit; the far ones are round)
    const pool = tau < 0 ? -8 + 13 * sm(progress(tau, -0.6, -0.25)) : 5 - 13 * sm(progress(tau, 0.25, 0.6));

    // ---- the beat: a swelling lens rolls through the lettering once a second
    const n = Math.floor(s), fr = s - n;
    const lc = -SIG + (W + 2 * SIG) * (fr / PASS);
    // the echo lines glide outward one band a second, easing on the beat; faster while a letter melts
    const flow = FB ? 4 * BW * sm((tau + 2.5) / 5) : 0;            // two whole periods: seamless at both ends
    const P = BW * (n + 0.3 * fr + 0.7 * ease.outCubic(progress(fr, 0, 0.5))) + flow;
    const P4 = Math.round(4 * P) & 31;
    // every letter's own swell on the beat (bigger on the burst beats)
    const burst = n === 15 || n === 45;
    const kick = fr < 0.35 ? (1 - fr / 0.35) * (1 - fr / 0.35) * (burst ? 0.8 : 0.4) : 0;

    // ---- the inks: one colourway, or the fronts of the :30 swap or the hour
    const n256 = Math.round(night * 256), hourShow = prv.h !== f.h && s < 9;
    rings[0] = -99; rings[1] = -99;
    if (hourShow) {
      // seven fronts: through all six colourways and on to the new hour's
      const old = prv.h % 6;
      for (let k = 0; k <= 7; k++) setStep(k, (old + k) % 6, false, n256);
      front.on = true; front.K = 7; front.LAM = 6; front.R = (s - 0.5) * 11;
    } else if (s >= 30 && s < 32.7) {
      // the letters flip to the ground's ink on the :30 beat, the swap flows out, then back
      const way = f.h % 6;
      setStep(0, way, false, n256); setStep(1, way, true, n256); setStep(2, way, false, n256);
      front.on = true; front.K = 2; front.LAM = 24; front.R = 40 + (s - 30) * 16;
    } else {
      setStep(0, f.h % 6, false, n256);
      front.on = false;
      if (burst) { rings[0] = (s - n) * 30 - 1; rings[1] = (s - n - 0.3) * 30 - 1; }
    }

    for (let k = 0; k < 5; k++) {
      const e = 0.6 * bump(CEN[k] - lc) + kick;
      const ta = (PASS * (CEN[k] + SIG)) / (W + 2 * SIG);
      let phi = fr - ta; if (phi < 0) phi += 1;
      let key = KEY, ring = FULL, pl = -99;
      if (chg[k]) {
        pl = pool;
        if (tau < 0) { key = keyOld; ring = ringOld; } else { key = keyNew; ring = ringNew; }
        W8[k] = Math.round(256 * morph);
      } else W8[k] = useB ? 256 : 0;
      lut(k, e, key, ring, phi, P4, pl);
    }

    // ---- the warp: lens, envelope, wobble, sag (field coords, 1/256 px)
    for (let x = 0; x < W; x++) {
      const z = x + 0.5 - lc;
      const lens = z > -SIG && z < SIG ? LA * (SIG / Math.PI) * sin((z / SIG) * Math.PI) : 0;
      UX[x] = Math.round((x + FM - lens) * 256);
      const r = (x + 0.5 - 80) / 80, env = 1 - 0.24 * r * r;          // the line of lettering bulges like a Wilson balloon
      let a = (1 - 0.08 * bump(z)) / env;
      // a fast ripple, and a slow S-wave that rolls the whole line of lettering like a banner
      let b = 40 - 40 * a + 0.7 * sin((x / 52) * 6.2832 + 1.9 * s) + 1.6 * sin((x / 210) * 6.2832 - 0.8 * s);
      const sl = SLOT[x + FM];
      if (chg[sl] && melt !== 0) {
        // the paint runs: each column sags from the letter's top at its own rate
        const k = melt * (0.35 + 0.65 * noise(x * 0.3, 77));
        b = TOP + (b - TOP) * (1 - k); a *= 1 - k;
      }
      AV[x] = Math.round(a * 256);
      BV[x] = Math.round((b + FM) * 256);
    }
    for (let y = 0; y < H; y++) DX[y] = Math.round(0.8 * sin((y / 34) * 6.2832 - 2.4 * s) * 256);

    // ---- every pixel: warp, sample the distance field, look up its ink
    const buf = g.buf, F1 = FB;
    const two = FB !== null && tau > -0.25 && tau < 0.25;
    const Fs = FB !== null && useB && !two ? FB : FA;
    for (let y = 0, i = 0; y < H; y++) {
      const dxy = DX[y];
      for (let x = 0; x < W; x++, i++) {
        let u = UX[x] + dxy, v = AV[x] * y + BV[x];
        u = u < 0 ? 0 : u > UMAX ? UMAX : u; v = v < VMIN ? VMIN : v > VMAX ? VMAX : v;
        const ui = u >> 8, fu = u & 255, vi = v >> 8, fv = v & 255, k = vi * FW + ui, sl = SLOT[ui];
        let A = Fs[k], B = Fs[k + 1], Cc = Fs[k + FW], D = Fs[k + FW + 1];
        let top = (A << 8) + (B - A) * fu, bot = (Cc << 8) + (D - Cc) * fu;
        let q = ((top << 8) + (bot - top) * fv) >> 16;
        if (two) {
          A = F1[k]; B = F1[k + 1]; Cc = F1[k + FW]; D = F1[k + FW + 1];
          top = (A << 8) + (B - A) * fu; bot = (Cc << 8) + (D - Cc) * fu;
          const q1 = ((top << 8) + (bot - top) * fv) >> 16;
          q += ((q1 - q) * W8[sl]) >> 8;
        }
        buf[i] = LUT[(sl << 8) | q];
      }
    }
    g.cost.px += N; g.cost.box += N * (two ? 24 : 14) + 5 * 256 * 8 + buildOps * 2;
  },
};
