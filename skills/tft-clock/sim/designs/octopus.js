// Octopus: one octopus lives under a reef ledge, and the time is four of its
// arms. Its head peeks over the rock between the hours and the minutes; each
// numeral is one arm reaching up out of the den and curled into the digit's
// shape (octopus-glyphs.js: thick root on the rock, thin curled tip, suckers
// along the inside of every curl), the hours leaning left and the minutes
// right, so the four arms fan out of one body.
//
// The time is alive. Once a second the head breathes and a contraction pulse
// leaves it down every arm (inner arms first): the arm thickens where the
// pulse is, a bright flush rides with it, the arm stretches up and settles,
// and when the pulse reaches a free tip the tip flicks in a curl and
// relaxes. In between, each arm sways to the beat and dark chromatophore
// bands ("passing clouds") drift along the skin. Every 15 s a display:
// :15 a storm of passing clouds races down all arms, :30 the spots light up
// in a front from the head outward and the tips curl, :45 a blanch-and-flush
// flash runs down the arms with a double pump.
//
// Minute turn (about 2.2 s, :59.0 to :01.2): the changing arm squeezes down
// while a dark flush climbs it from the root (anticipation); then it pulls
// back into the den, tip unrolling first, until only a small coil of arm
// lies on the rock (a quarter of a digit's height, no stem: never a
// numeral), and from :00 it unfurls out of the den into the new digit, root
// first, the tip arriving last with a small overshoot. The pull-back and the
// unfurl overlap, so every node travels a curved path; the suckers roll
// along the arm and across it as its curl changes hand, and the skin
// flushes pale wherever it is moving. The eyes watch the busy arm.
// Hour: the head rises out of the den, eyes wide, jets a cloud of ink that
// billows out behind the arms and thins, and a white flash runs from the
// head out through all four arms; behind it the skin is the next hour's
// species (common octopus coral, blue-ringed gold with blue rings,
// wunderpus raspberry with white spots).
//
// Palette: a flat reef in cool teal (three water bands, a far reef in one
// dim tone, a plum rock ledge) so the warm, saturated arms with their near-
// black keyline are by far the strongest contrast on the glass; suckers in
// pale cream. Effects, all of the world: light shafts from the surface,
// marine snow, a lit rim on the back of each arm, the ink. Night: the water
// goes to deep navy with moonlit shafts, the snow glows, the skin darkens a
// little (never to mud) and the backlight dims to 55 %.
//
// Cost: four arms stamped into a distance buffer (a disc every ~1.4 px,
// integer maths) and shaded once each; the reef is a table copy with three
// shaft spans; the head is a few kit shapes; the hour's ink is ~15 discs
// added into a byte buffer and one blend pass. Flash ~141 KB (reef tables
// 102 KB, glyph nodes 19 KB, sqrt table 12 KB, coils, spots); RAM ~70 KB
// beyond the frame buffer (distance buffers 51 KB, ink 13 KB, node arrays).

import { clockFields, previousMinute, to565, sin, cos, hash } from '../js/kit.js';
import { GLYPHS, N, LEDGE } from './octopus-glyphs.js';
import { drawArm, C } from './octopus-arm.js';
import { background, ink, head, LEDGE_TOP } from './octopus-reef.js';

const TAU = Math.PI * 2;
const OX = [6, 37, 95, 126], SHEAR = [-0.08, -0.04, 0.04, 0.08];
const DELAY = [0.08, 0, 0, 0.08];               // the pulse reaches the outer arms a little later
const PHASE = [0.0, 0.35, 0.7, 1.05];

// ------------------------------------------------------------ colourways
const WAYS = [
  // common octopus: coral with darker mottles
  [0x2a0c14, 0xa22c2a, 0xec5a3a, 0xff9c5e, 0xfff6ec, 0xffb47c, 0xb8382c, 0xcc4630, 0xf9cdb2, 0xd27a6a, 0xf47e56, 0xffd890],
  // blue-ringed: gold with blue rings
  [0x2a1806, 0xb07a1c, 0xeab43c, 0xffdc78, 0xfffbe8, 0xfff0a8, 0x182650, 0x2f9cff, 0xfff0cc, 0xd6ac6a, 0xf4c862, 0x9ff4ff],
  // wunderpus: raspberry with white spots
  [0x22081c, 0x7a1c3c, 0xc8325c, 0xff6c94, 0xfff0f6, 0xff9cbc, 0xfff2f2, 0xf2b4c6, 0xffd6e2, 0xd8849c, 0xe2507a, 0xffffff],
];
const NIGHT_K = [1, 0.8, 0.86, 0.88, 0.85, 0.82, 0.86, 0.86, 1, 1, 0.84, 0.9];
// by night the suckers glow, like the photophores of a deep-sea octopus
const GLOW_N = { 8: 0x8ff6e4, 9: 0x34b8b0 };
const LUTS = new Map();
function lutFor(way, night) {
  const q = Math.round(night * 16), key = way * 32 + q;
  let l = LUTS.get(key);
  if (!l) {
    l = new Uint16Array(12);
    l.rgb = new Int32Array(12);
    for (let i = 0; i < 12; i++) {
      const c = WAYS[way][i], k = 1 - (1 - NIGHT_K[i]) * (q / 16);
      let r = Math.round(((c >> 16) & 255) * k), gg = Math.round(((c >> 8) & 255) * k), b = Math.round((c & 255) * k);
      if (GLOW_N[i]) {
        const gw = GLOW_N[i], u = q / 16;
        r = Math.round(r + (((gw >> 16) & 255) - r) * u); gg = Math.round(gg + (((gw >> 8) & 255) - gg) * u); b = Math.round(b + ((gw & 255) - b) * u);
      }
      l.rgb[i] = (r << 16) | (gg << 8) | b;
      l[i] = to565(l.rgb[i]);
    }
    LUTS.set(key, l);
  }
  return l;
}

// ------------------------------------------------------------ easing
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------ working arrays
const R0 = new Float32Array(N + 1);
for (let i = 0; i <= N; i++) R0[i] = 1.65 + 2.75 * Math.pow(1 - i / N, 0.85);
const AX = new Float32Array(N + 1), AY = new Float32Array(N + 1), BX = new Float32Array(N + 1), BY = new Float32Array(N + 1);
const NX = new Float32Array(N + 1), NY = new Float32Array(N + 1);
const X = new Float32Array(N + 1), Y = new Float32Array(N + 1), RR = new Float32Array(N + 1), SG = new Float32Array(N + 1);
const TONE = new Uint8Array(N + 1), SPK = new Uint8Array(N + 1), WAY = new Uint8Array(N + 1);
const MOVE = new Float32Array(N + 1);

/** The beat's stretch: up fast, settle with a small squash. p = seconds since the beat. */
const pump = (p) => (p <= 0 ? 0 : Math.exp(-4 * p) * sin(TAU * 1.3 * p));

/**
 * The live pose of glyph d in slot k: the digit as drawn, swaying with the
 * beat, stretching on the pulse, its free tip flicking.
 */
function pose(d, k, s, extra, OXa, OYa) {
  const gl = GLYPHS[d], px = OX[k] + 14, sp = s - DELAY[k], p = frac(sp);
  const phi = 0.055 * cos(Math.PI * sp + PHASE[k]);
  const sy = 1 + 0.03 * pump(p) + (extra.pump2 ? 0.02 * pump(frac(sp * 2)) : 0) - extra.squeeze * 0.07;
  const sx = 1 + extra.squeeze * 0.035;
  const c = cos(phi), sn = sin(phi), step = gl.L / N, ph = TAU * 1.1 * s + k * 1.9;
  for (let i = 0; i <= N; i++) {
    // a ripple runs up the arm: every stretch of it sways sideways in turn
    const w = i < 16 ? i / 16 : 1, o = 1.0 * w * sin(TAU * i * step / 30 - ph);
    const gx = gl.x[i] + gl.nx[i] * o, gy = gl.y[i] + gl.ny[i] * o;
    const dx = (gx + SHEAR[k] * (LEDGE - gy) + OX[k] - px) * sx, dy = (gy - LEDGE) * sy;
    OXa[i] = px + dx * c - dy * sn; OYa[i] = LEDGE + dx * sn + dy * c;
  }
  // the free tip: a quick curl as the pulse arrives, a slow release
  if (gl.free) {
    const x = (p - 0.56) / 0.44;
    let fl = x <= 0 || x >= 1 ? 0 : x < 0.28 ? sm(x / 0.28) : 1 - sm((x - 0.28) / 0.72);
    fl = fl * 0.3 + extra.curl * 0.42;
    if (fl > 0.002) {
      const n = Math.min(N - 2, Math.round(17 / step)), j0 = N - n;
      const dir = gl.sig[N] >= 0 ? -1 : 1, qx = OXa[j0], qy = OYa[j0];
      for (let j = j0 + 1; j <= N; j++) {
        const w = (j - j0) / n, a = dir * fl * w;
        const ca = cos(a), sa = sin(a), ex = OXa[j] - qx, ey = OYa[j] - qy;
        OXa[j] = qx + ex * ca - ey * sa; OYa[j] = qy + ex * sa + ey * ca;
      }
    }
  }
}

/**
 * The withdrawn arm, half way through a turn: most of it pulled back into
 * the den, the rest a small coil on the rock, curling outward (the hours to
 * the left, the minutes to the right). Far smaller than a digit and with no
 * stem, so it never reads as one. Lt is the arm's length at this moment.
 */
const LV = 40, COIL_N = 161;
const COIL = [0, 1, 2, 3].map((k) => {
  const dir = k < 2 ? -1 : 1, x = new Float32Array(COIL_N), y = new Float32Array(COIL_N);
  let px = OX[k] + 14 + dir * -3, py = 70, th = -Math.PI / 2;
  for (let j = 0; j < COIL_N; j++) {
    x[j] = px; y[j] = py;
    const u = j / (COIL_N - 1), ds = LV / (COIL_N - 1);
    th = -Math.PI / 2 + dir * (0.5 * u + 4.4 * Math.pow(u, 2.4));
    px += Math.cos(th) * ds; py += Math.sin(th) * ds;
  }
  return { x, y };
});
function withdrawn(k, Lt) {
  const c = COIL[k], hid = Lt - LV, px = c.x[0];
  for (let i = 0; i <= N; i++) {
    const sv = (i * Lt) / N - hid;
    if (sv <= 0) { NX[i] = px; NY[i] = 70 + (-sv < 4 ? -sv : 4); continue; }
    const q = (sv / LV) * (COIL_N - 1), j = q | 0, u = q - j;
    if (j >= COIL_N - 1) { NX[i] = c.x[COIL_N - 1]; NY[i] = c.y[COIL_N - 1]; continue; }
    NX[i] = c.x[j] + (c.x[j + 1] - c.x[j]) * u; NY[i] = c.y[j] + (c.y[j + 1] - c.y[j]) * u;
  }
}

// turn schedule (tau = seconds from the minute)
const U0 = -0.8, US = 0.2, UD = 0.72, V0 = -0.15, VS = 0.25, VD = 1.05;

export default {
  name: 'Octopus',
  blurb: 'An octopus under a reef ledge holds up the time: each numeral is one of its arms, curled into the digit, suckers on the inside, chromatophore waves pulsing down it; each minute the arm uncoils and recurls into the next digit.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    const T = (ctx.date.getTime() % 86400000) / 1000;
    ctx.lcd.backlight(1 - 0.45 * night);
    const prv = previousMinute(ctx.date), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 10;
    const wayNew = f.h % 3, wayOld = hourShow ? prv.h % 3 : wayNew;
    const lutN = lutFor(wayNew, night), lutO = lutFor(wayOld, night);

    // ---- the minute's displays
    const storm = s >= 15 && s < 18.6 ? sm((s - 15) / 0.4) * (1 - sm((s - 17.8) / 0.8)) : 0;
    const display = s >= 30 && s < 32.8;
    const blanch = s >= 45 && s < 47;
    const curl = display ? sm((s - 30.4) / 0.25) * (1 - sm((s - 31.1) / 0.9)) : 0;

    // ---- the reef, the ink, the head
    background(g, T, night);
    if (hourShow) ink(g, s - 2.1);
    const rise = hourShow ? sm((s - 0.5) / 1.1) * (1 - sm((s - 6.6) / 2.2)) : 0;
    const bp = frac(s);
    const breath = 1.3 * (bp < 0.3 ? sin(Math.PI * bp / 0.3) : 0);
    const hf = hourShow ? (s - 1.55) / 0.3 : -9;
    let headWay = hf > 0 ? lutN : lutO, headTone = hf > -0.6 && hf < 0.6 ? 4 : 2;
    if (Math.sin(TAU * (T / 26 * 0.5) * 3 + 1) > 0.7 && headTone === 2) headTone = 1;
    let look = 0.8 * sin(T * 0.55), lookY = 0;
    let busy = -1;
    for (let k = 0; k < 4; k++) if ((s >= 58.8 && cur[k] !== nw[k]) || (s < 1.4 && old[k] !== cur[k])) { busy = k; break; }
    if (busy >= 0 && !hourShow) look = busy < 2 ? -1 : 1;
    if (rise > 0.3) { look = 0; lookY = 0; }
    const bt = hash(f.minuteKey, Math.floor(s / 3.7)) % 4 === 0 ? frac(s / 3.7) * 3.7 : 9;
    const blink = bt < 0.16 ? sin(Math.PI * bt / 0.16) * 1.2 : 0;
    head(g, {
      rise, breath, look, lookY, blink, lut: headWay.rgb, tone: headTone,
      keyC: headWay.rgb[C.KEY], eyeC: night > 0.5 ? 0xc8bc80 : 0xf6e8a2, pupilC: 0x12060a,
      spots: [[-6, -5], [5, -7], [-1, -10], [7, -2], [-9, 1]],
    });

    // ---- the arms
    for (let k = 0; k < 4; k++) {
      const sp = s - DELAY[k], p = frac(sp);
      let a = +cur[k], b = -1, tau = 0;
      if (s >= 58.8 && cur[k] !== nw[k]) { b = +nw[k]; tau = s - 60; }
      else if (s < 1.8 && old[k] !== cur[k]) { a = +old[k]; b = +cur[k]; tau = s; }
      const extra = { squeeze: 0, curl, pump2: blanch };
      let L, sph = 0, uMid = 0;
      if (b < 0) {
        pose(a, k, s, extra, X, Y);
        const gl = GLYPHS[a];
        SG.set(gl.sig); MOVE.fill(0); L = gl.L;
      } else {
        extra.squeeze = tau > -1.05 && tau < -0.45 ? sin(Math.PI * (tau + 1.05) / 0.6) : 0;
        pose(a, k, s, extra, AX, AY);
        extra.squeeze = 0;
        pose(b, k, s, extra, BX, BY);
        const ga = GLYPHS[a], gb = GLYPHS[b];
        withdrawn(k, (ga.L + gb.L) * 0.5);
        let vm = 0;
        for (let i = 0; i <= N; i++) {
          const fi = i / N;
          const u = sm((tau - (U0 + US * (1 - fi))) / UD);
          const xv = clamp01((tau - (V0 + VS * fi)) / VD);
          const v = sm(xv) + 0.9 * fi * xv * xv * xv * (1 - xv) * (1 - xv);
          X[i] = AX[i] + (NX[i] - AX[i]) * u + (BX[i] - NX[i]) * v;
          Y[i] = AY[i] + (NY[i] - AY[i]) * u + (BY[i] - NY[i]) * v;
          const sa = ga.sig[i], sb = gb.sig[i], sn = (sa + sb) * 0.5;
          SG[i] = sa + (sn - sa) * u + (sb - sn) * v;
          MOVE[i] = (u > 0 && u < 1) || (xv > 0 && xv < 1) ? 1 : 0;
          if (i === N >> 1) { vm = v; uMid = u; }
        }
        L = ga.L + (gb.L - ga.L) * clamp01(vm);
        sph = 5 * (uMid + vm);
      }
      // ---- skin: radius (the pulse's bulge) and tone per node
      const fr = (p - 0.04) / 0.62, spd = 1 + 2.6 * storm, thr = 0.62 - 0.42 * storm;
      const ff = hourShow ? (s - 1.75 - DELAY[k] * 2) / 0.8 : -9;
      const fd = display ? (s - 30 - DELAY[k] * 2) / 0.7 : -9;
      const fb = blanch ? (s - 45.05 - DELAY[k] * 2) / 0.85 : -9;
      const sq = b >= 0 && tau < -0.4 ? sin(Math.PI * clamp01((tau + 1.05) / 0.65)) : 0;
      const step = L / N;
      for (let i = 0; i <= N; i++) {
        const fi = i / N, q = (fi - fr) / 0.06;
        RR[i] = R0[i] + (q > -3 && q < 3 ? 0.7 * Math.exp(-q * q) : 0);
        const c = sin(TAU * (i * step / 26 - T * 0.5 * spd) + k * 1.3 + (storm > 0 ? (s - 15) * 9 * storm : 0));
        let t = c > thr ? 1 : 2;
        if (fi - fr < 0.045 && fr - fi < 0.045) t = 3;
        if (MOVE[i]) t = 3;
        if (sq > 0 && fi < sq * 1.4 - 0.2) t = 1;            // anticipation: a dark flush climbs from the root
        if (fb > -1) { const d = fi - fb; if (d > -0.1 && d < 0.1) t = 3; else if (d > -0.26 && d <= -0.1) t = 1; }
        WAY[i] = 0;
        if (ff > -1) {
          const d = fi - ff;
          if (d < -0.06) WAY[i] = 1;
          else if (d < 0.06) t = 4;
        }
        TONE[i] = t;
        SPK[i] = fd > fi && s < 32.4 ? 2 : 1;
      }
      drawArm(g, { X, Y, R: RR, SG, TONE, SPK, WAY, lut: hourShow ? lutO : lutN, lut2: lutN, ledge: LEDGE_TOP, sph, L });
    }
  },
};
