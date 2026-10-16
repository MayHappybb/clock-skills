// Glassblower: the hot shop, at the bench. The four numerals are strands of
// hot glass standing on the gaffer's polished steel marver beside the
// furnace; each minute the one that changes is reheated, slumps back into a
// glowing gather, is rolled on the marver and drawn up again as the new
// numeral, which cools from white heat through orange into coloured glass.
//
// The font (glassblower-glyphs.js) is pulled cane: every digit one or two
// unbroken strands, no corners (glass bends), thicker towards the foot (hot
// glass sags) and with a bead at each free end (a pulled end rounds itself).
// Flat 2D glass: a dark rim where the rod's edge turns light away, a body
// colour, one flat highlight on the lit side, white latticino threads wound
// round the cane, and an orange keyline where the edge faces the glory hole.
//
// The time is alive every second: the gaffer turns every pipe a notch on the
// beat (the twisted threads slide along every strand), the glass is drawn
// up on the beat (a squash before it, a stretch on it, an overshoot, a
// settle; each digit 70 ms behind its left neighbour), a reheated seam
// glows its way along each strand from its root every second, and the soft
// glass sways. Every 15 s a flourish: :15 the furnace breathes and a heat
// wave rolls out across the glass right to left, :30 the pipes spin (the
// threads race, the strands sway wide and settle), :45 the heat wave rolls
// back. Every 15 s a light sweep glints along the highlights.
//
// Minute turn (2.4 s of motion, the units digit first, each digit to its
// left 80 ms later): the furnace doors slide open, heat climbs the strand
// from its foot until it is white-hot and it stretches up (anticipation);
// it slumps down into a gather on the marver, spreading as it sinks and
// fattening as it shrinks (gone by :59.9 at the latest); the gather is
// rolled out along the marver and back; after :00 the new numeral is drawn
// up out of it, height leading and width following, with an overshoot,
// sparks thrown off the gather; it cools from the top. Every edge moves at
// most 2 px a frame (checked frame by frame). Hour: after the turn the
// furnace doors open wide and a gather is blown out of the glory hole into
// a bubble that swells over the minutes, over-blows and bursts into
// glittering flakes; the burst's ring sweeps the strip and the glass takes
// the new hour's batch of colours. The time reads throughout.
//
// Palette: the dark of a hot shop (a violet-grey wall, steel, firebrick) so
// that the glass is the strongest contrast, and the only warm light is the
// furnace's, falling in flat screen-print pools that waver with the fire.
// Glass comes in a complementary pair per hour, hours and minutes (cobalt and
// amber, ruby and aqua, emerald and violet, and the swaps), because that is
// what a glass studio does with its batches; heat is one shared ramp from
// dull red to white. Hard pixels for the glass (flat 2D), AA only for the
// round things: the gather, the colon marbles (two clear glass marbles that
// glow on the beat), the bubble. Night: the furnace is banked (the doors
// almost shut, smaller pools), the shop sinks to near-black, the backlight
// dims to 45 %; the glass keeps its colours.
//
// Cost: each digit is sampled through a per-row affine map from three baked
// maps (distance, across, along: 116 KB flash); the shop is one indexed
// picture lit by a 41 x 21 light grid (13 KB flash); no per-minute caches,
// every frame is built cold. RAM: ~5 KB of scratch.

import { clockFields, sin, to565 } from '../js/kit.js';
import { GLYPHS, MW, MH, M, R0 } from './glassblower-glyphs.js';
import {
  W, H, MARVER, PORT_X, PORT_Y, PORT_R, bgPass, furnace, embers, pairFor, glassLUT, BLOB, colonMarble,
  reflect, bubble, flakes, sparks, FOOT_MX, FOOT_MY,
} from './glassblower-shop.js';

const SLOTS = [{ cx: 18, size: 1 }, { cx: 52, size: 1 }, { cx: 89, size: 0.8 }, { cx: 117, size: 0.8 }];
const COLON = [[72, 41], [72, 55]];
const RG = 8;                       // the gather's radius, in hour-size px
const DELAY = [0.24, 0.16, 0.08, 0]; // the units digit goes first, then each to its left

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const sin2 = (x) => { const v = sin(x); return v * v; };

// gaussian bump, |d| in quarter px up to 16 px, 0..256
const GAUSS = new Uint16Array(65);
for (let i = 0; i <= 64; i++) GAUSS[i] = Math.round(256 * Math.exp(-((i / 4 / 4.5) ** 2)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// per-frame scratch (RAM): heat along each strand, per map row, per column; glass mask for the reflection
const HEAT_S = Array.from({ length: 4 }, () => new Uint8Array(160));
const HEAT_ROW = Array.from({ length: 4 }, () => new Uint8Array(MH));
const HEAT_X = new Uint8Array(W);
const GLOW = new Uint16Array(41 * 21);
const GLASS = new Uint8Array(W * 14);     // rows 52..65: which pixels are glass (they reflect in the marver)

/** The gather between the old digit and the new: rolled out along the marver and back, turning as it rolls. */
function marver(tau, cx, gy, z) {
  const gp = clamp01((tau + 0.35) / 0.45), r = RG * z, off = 3.5 * z * sin2(Math.PI * gp);
  return { x: cx + off, y: gy, r, roll: off / r, tau };
}

/** The beat: a squash before it (anticipation), a stretch on it, an overshoot and a settle. */
function pulse(b) {
  if (b < 0.14) return sm(b / 0.14);
  if (b < 0.5) return 1 - 1.25 * sm((b - 0.14) / 0.36);
  if (b < 0.8) return -0.25 + 0.25 * sm((b - 0.5) / 0.3);
  return -0.18 * sin2((Math.PI * (b - 0.8)) / 0.2);
}

function addSeam(hs, pos, amp, len, closed) {
  const c = pos / 2;
  for (let b = (c - 8) | 0; b <= c + 8; b++) {
    let bb = b;
    if (closed) bb = ((b % ((len / 2) | 0)) + ((len / 2) | 0)) % ((len / 2) | 0);
    if (bb < 0 || bb >= 160) continue;
    const d = Math.abs(b * 2 + 1 - pos) * 4;
    if (d > 64) continue;
    const v = hs[bb] + ((amp * GAUSS[d | 0]) >> 8);
    hs[bb] = v > 255 ? 255 : v;
  }
}

/**
 * One strand of glass through its maps. pose: the map point (amx, amy) sits
 * at screen (ax, ay); scale sx, sy; `bend` px of sideways sag at the top;
 * `k` fattens the strand (a melting digit).
 */
function drawGlass(g, G, P, hs, hr, lutA, lutB, wave, sweep, phase, lit) {
  const buf = g.buf, F = G.F, A = G.A, S = G.S;
  const { ax, ay, amx, amy, sx, sy, bend, k } = P;
  const thrIn = (32 * k) | 0;
  const scl = (sx + sy) / 2;
  const thrRim = thrIn - ((32 / (R0 * scl)) | 0);
  const hiLo = (12 * k) | 0, hiHi = hiLo + (((64 * 0.95) / (R0 * scl)) | 0);
  const tw = (13 * scl) | 0;
  const ytop = Math.max(0, Math.floor(ay - amy * sy)), ybot = Math.min(H, Math.ceil(ay + (MH - amy) * sy));
  const dmx = (65536 / sx) | 0;
  let n = 0;
  for (let y = ytop; y < ybot; y++) {
    const myf = amy + (y + 0.5 - ay) / sy, my = myf | 0;
    if (myf < 0 || my >= MH) continue;
    const up = (FOOT_MY - myf) / 52, off = up > 0 ? bend * up * up : 0;
    const left = ax + off - amx * sx;
    const x0 = Math.max(0, Math.ceil(left - 0.5)), x1 = Math.min(W, Math.floor(left + MW * sx - 0.5) + 1);
    let fx = (((x0 + 0.5 - left) / sx) * 65536) | 0;
    const row = my * MW, hrow = hr[my], orow = y * W;
    const wy = wave ? (y - wave[1]) * (y - wave[1]) : 0;
    for (let x = x0; x < x1; x++, fx += dmx) {
      const mx = fx >> 16;
      if (mx < 0 || mx >= MW) continue;
      n++;
      const i = row + mx, f = F[i];
      if (f >= thrIn) continue;
      const a = A[i], s = S[i];
      let band;
      if (f >= thrRim) {
        if (a > 16 && hrow + hs[s >> 3] < 48) { buf[orow + x] = lutA[64 + lit]; if (y >= 52 && y < 66) GLASS[(y - 52) * W + x] = 1; continue; }
        band = 0;
      }
      else if (a >= hiLo && a <= hiHi) band = 2;
      else if (((s + ((a * tw) >> 6) + phase) & 31) < 7) band = 3;
      else band = 1;
      let t = hrow + hs[s >> 3] + HEAT_X[x];
      if (t > 255) t = 255;
      const lut = wave && (x - wave[0]) * (x - wave[0]) + wy < wave[2] ? lutB : lutA;
      let v = lut[((t >> 4) << 2) | band];
      if (band === 2 && sweep !== null) { const q = x + (y >> 1) - sweep; if (q >= -2 && q <= 2) v = 0xffff; }
      buf[orow + x] = v;
      if (y >= 52 && y < 66) GLASS[(y - 52) * W + x] = 1;
     
    }
  }
  g.cost.box += n * 6;
}

export default {
  name: 'Glassblower',
  blurb: 'The hot shop: the numerals are strands of hot glass on the marver; each minute the old one slumps into a glowing gather and is pulled into the new one.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, now = ctx.date.getTime();
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    const prv = clockFields(new Date(now - 60000)), nxt = clockFields(new Date(now + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 10;
    const T = (now % 86400000) / 1000;

    // ---- the minute's structure: flourishes at :15, :30, :45
    HEAT_X.fill(0);
    let flare = 0, spin = 0, swayMul = 1;
    if (s >= 14.4 && s < 17.6) {           // the furnace breathes: a heat wave rolls out of it, right to left
      flare = sin2((Math.PI * (s - 14.4)) / 3.2);
      const xw = 176 - (s - 15) * 88;
      for (let x = 0; x < W; x++) { const d = Math.abs(x - xw) * 4; if (d < 64) HEAT_X[x] = (150 * GAUSS[d]) >> 8; }
    }
    if (s >= 44.4 && s < 47.6) {           // and back, left to right
      flare = 0.6 * sin2((Math.PI * (s - 44.4)) / 3.2);
      const xw = -16 + (s - 45) * 88;
      for (let x = 0; x < W; x++) { const d = Math.abs(x - xw) * 4; if (d < 64) HEAT_X[x] = (150 * GAUSS[d]) >> 8; }
    }
    if (s >= 30 && s < 33) {               // the spin: every pipe turned fast
      const u = (s - 30) / 3;
      spin = 64 * 4 * sm(u);
      swayMul = 1 + 1.6 * sin2(Math.PI * u);
    }
    const phase = ((s * 6 + 4 * (Math.floor(s) + sm((s % 1) / 0.35))) * 4 + spin) | 0;

    // ---- the hour's colours, and the burst that changes them
    const pairNew = pairFor(f.h), pairOld = hourShow ? pairFor(prv.h) : pairNew;
    let wave = null;
    const BURST = 5.2;
    if (hourShow && s >= BURST) wave = [bubble.cx1, bubble.cy1, ((s - BURST) * 95) ** 2];

    // ---- each slot: rest, out (slump into the gather) or in (pulled from it)
    const jobs = [];
    let reheat = 0;
    for (let i = 0; i < 4; i++) {
      const sl = SLOTS[i], z = sl.size, hs = HEAT_S[i], hr = HEAT_ROW[i];
      hs.fill(0); hr.fill(0);
      const dl = DELAY[i];
      let d = +cur[i], tau = null;
      if (cur[i] !== nw[i] && s - 60 >= -2.0 + dl) tau = s - 60 - dl;
      else if (cur[i] !== old[i] && s - dl < 6) tau = s - dl;
      const G = GLYPHS[d];
      // rest life: the beat, the sway, the seams
      const b = (((s - 0.07 * i) % 1) + 1) % 1;
      const p = pulse(b);
      const bend = 1.6 * swayMul * sin(Math.PI * s + i * 1.1);
      const closed = d === 0 || d === 8;
      for (let k = 0; k < 2; k++) {
        const age = b + k;
        if (age < 2) addSeam(hs, age * 72, (130 * (1 - age / 2) * (1 - age / 2)) | 0, G.len, closed);
      }
      let P = { ax: sl.cx, ay: MARVER, amx: FOOT_MX, amy: FOOT_MY, sx: z * (1 - 0.02 * p), sy: z * (1 + 0.045 * p), bend, k: 1 };
      let blob = null, show = true;
      if (tau !== null) {
        const gy = MARVER - RG * z;    // the gather sits on the marver
        if (tau < 0) {
          // out: heat floods up from the base, the strand stretches (anticipation), then slumps into the gather
          const vh = clamp01((tau + 2.0) / 0.85);
          for (let my = 0; my < MH; my++) hr[my] = (255 * clamp01(vh * 1.5 - (1 - my / MH) * 0.5)) | 0;
          reheat = Math.max(reheat, sm((tau + 2.0) / 0.8));   // the doors open for the reheat, and stay open through the turn
          const e = sm((tau + 1.15) / 0.8);
          const S = 1 - e;
          if (tau < -1.15) {
            const a = sin2((Math.PI * (tau + 2.0)) / 0.85);
            P.sy *= 1 + 0.04 * a; P.sx *= 1 - 0.015 * a;
            P.bend += 3 * z * sm((tau + 2.0) / 0.85);    // soft now: it flops over toward the furnace
          } else {
            P = { ax: sl.cx, ay: gy, amx: FOOT_MX, amy: FOOT_MY - RG, sx: z * S * (1 + 0.3 * sin(Math.PI * e)), sy: z * S, bend: (bend + 3 * z) * S, k: Math.min(3, 1 / Math.max(0.2, S) ** 0.6) };
            if (S < 0.12) show = false;
          }
          const rb = RG * z * sm((tau + 0.95) / 0.6);
          if (rb > 0.5) blob = { x: sl.cx, y: gy, r: rb, t: 255, tau };
          if (tau >= -0.35) blob = marver(tau, sl.cx, gy, z);
        } else {
          // in: the gather swings, then the new strand is pulled up out of it and cools, top first
          for (let my = 0; my < MH; my++) hr[my] = (255 * clamp01(1 - (tau - 0.7 - 1.1 * (my / MH)) / 2.0)) | 0;
          reheat = Math.max(reheat, 1 - sm((tau - 0.3) / 1.2));
          if (tau < 0.1) {
            blob = marver(tau, sl.cx, gy, z);
            show = false;
          } else if (tau < 1.0) {
            const u = clamp01((tau - 0.1) / 0.85);
            // it starts small inside the gather (which hides it) and is drawn up out of it: height leads, width follows
            const sy = 0.1 + 0.9 * (sm(u) + 0.07 * sin2(Math.PI * clamp01((u - 0.45) / 0.55)));
            const sx = 0.14 + 0.86 * (sm(clamp01((u - 0.1) / 0.9)) - 0.04 * sin2(Math.PI * u));
            const S = Math.min(sx, sy);
            P = { ax: sl.cx, ay: gy, amx: FOOT_MX, amy: FOOT_MY - RG, sx: z * sx, sy: z * sy, bend: bend * sy, k: Math.min(3, 1 / Math.max(0.2, S) ** 0.6) };
            const rb = RG * z * (1 - sm(u / 0.7));
            if (rb > 0.5) blob = { x: sl.cx, y: gy, r: rb, t: 255, tau };
          }
        }
      }
      // follow-through: a freshly pulled strand wobbles once or twice before it sets
      if (tau !== null && tau > 0.95 && tau < 2.6) { const q = (tau - 0.95) / 1.65; P.bend += 2.4 * z * (1 - q) * (1 - q) * sin(2 * Math.PI * (tau - 0.95) * 1.5); }
      jobs.push({ i, d, G, P, blob, show });
    }

    // ---- light: the furnace through its doors, and whatever glass is hot
    const doorHour = hourShow ? sm((s - 1) / 0.8) * (1 - sm((s - 7.6) / 1.2)) : 0;
    const open = Math.max(0.5 + 0.3 * flare + 0.4 * reheat, doorHour) * (1 - 0.45 * night);
    const flick = 0.8 + 0.12 * sin(T * 7.3) * sin(T * 3.1 + 1) + 0.08 * sin(T * 13.7);
    GLOW.fill(0);
    furnace.glow(GLOW, open * flick);
    for (const j of jobs) {
      if (!j.show) continue;
      const { P, G } = j, hs = HEAT_S[j.i], hr = HEAT_ROW[j.i];
      for (const [mx, my, ss] of G.glow) {
        let t = hr[my] + hs[(ss * 4) >> 3];
        const x = P.ax + (mx - P.amx) * P.sx, y = P.ay + (my - P.amy) * P.sy;
        if (x >= 0 && x < W) t += HEAT_X[x | 0];
        if (t > 40) furnace.addGlow(GLOW, x, y, Math.min(255, t) * 0.5);
      }
      if (j.blob) furnace.addGlow(GLOW, j.blob.x, j.blob.y, 200);
    }

    // ---- the shop
    bgPass(g, GLOW, night, T);
    furnace.draw(g, T, open, flick, night);
    embers(g, T, open);
    if (hourShow) bubble.draw(g, s, pairOld, pairNew, BURST);

    // ---- the glass
    GLASS.fill(0);
    const lutA = glassLUT(pairOld, night), lutB = glassLUT(pairNew, night);
    const lutsA = [lutA.h, lutA.h, lutA.m, lutA.m], lutsB = [lutB.h, lutB.h, lutB.m, lutB.m];
    const sw = s % 15, sweep = sw > 6 && sw < 8.4 ? ((sw - 6) / 2.4) * 230 - 30 : null;
    for (const j of jobs)
      if (j.show) drawGlass(g, j.G, j.P, HEAT_S[j.i], HEAT_ROW[j.i], lutsA[j.i], lutsB[j.i], wave, sweep, phase, Math.min(3, [0, 1, 1, 2][j.i] + (flick * open > 0.42 ? 1 : 0)));
    for (let c = 0; c < 2; c++) {
      const b = (((s - 0.5 * c) % 1) + 1) % 1;
      colonMarble(g, COLON[c][0], COLON[c][1] - 1.2 * pulse(b), HEAT_X[COLON[c][0]] + (b < 0.3 ? 120 * (1 - b / 0.3) : 0), night);
    }
    for (const j of jobs) if (j.blob) {
      BLOB.draw(g, j.blob, T);
      if (j.blob.tau > 0) sparks(g, j.blob, f.minuteKey * 4 + j.i);
    }

    reflect(g, GLASS, jobs);
    if (hourShow) flakes(g, s, BURST);
  },
};
