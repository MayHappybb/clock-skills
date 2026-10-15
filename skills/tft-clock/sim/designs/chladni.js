// Chladni: the glass is a steel plate singing, seen from above, with fine
// sand on it. A small driver bolted to its centre makes it ring, and the sand
// is thrown off everywhere the plate moves and comes to rest on the nodal
// lines, the curves that stand still: a Chladni figure, faint and grainy,
// all over the plate. The time is the same sand, heaped into ridges: four
// numerals drawn as nodal figures (lens, crossed waist, figure-eight,
// spiral), each in the bare ring of plate it pulled its sand from. Hours sit
// high on the left and minutes low on the right, a half turn apart about the
// driver, as every figure on a centre-driven plate is.
//
// Always alive: the plate hums. The figure breathes as the two degenerate
// waves that make it trade strength; every 5 s the tone swells and the plate
// rings harder; the antinodes glow and fade with it; grains there hop and
// glint and fall back; loose grains creep down onto the nearest line; the
// ridge crests sparkle; the driver buzzes.
//
// Minute: the tone glides to a new note. The plate shakes, the background
// figure blurs into haze and flows into the next one; the changing numeral
// buzzes, then every grain leaps into a dancing cloud (gone before :00);
// after :00 the new note spreads out from the driver as a ring of light,
// the new figure growing behind it, and the cloud drifts, bounces and
// settles onto the new numeral's lines, grain by grain, by :01.2.
// Hour: the plate sweeps up through its harmonics, five mandalas each grown
// out from the driver behind its own light front, the plate's sand brighter,
// then lands on the new hour's note. Night: the plate sinks to the deep end of the ramp and
// the ridges glow.
//
// Palette and ramp: chladni-plate.js. Everything is first summed as light
// into a value buffer, then mapped through the 64-step ramp with a 4x4
// ordered dither, so no pixel can leave the hue.
//
// Cost (esp32c3): one integer pass over the glass for the field and sand
// (2-4 MACs, the morph lerp, table lookups and a few adds a pixel), one for
// the ramp, a list pass for flying grains at a turn (up to ~3.6k at
// midnight, 2 table sines each), 260 glint and 90 creep slots. Each new mode
// costs 960 table sines (~40k cycles) and each new scene three 12.8 KB moat
// maps (~120k cycles); both are billed to the frame that builds them.
// RAM on a device: light buffer 25.6 KB, one scene's moat maps 38.4 KB, two
// modes' tables 7.7 KB, gradient grid and rows 5 KB: ~77 KB beyond the frame
// buffer. Flash: numerals 69 KB, plate/grain/distance maps 38.4 KB, small
// tables ~10 KB: ~117 KB.

import { hash, clockFields, progress, ease, sin } from '../js/kit.js';
import { GLYPHS, BW, BH, MARGIN, GRAIN_MAX } from './chladni-glyphs.js';
import { W, H, N, DX, DY, PAL, NPAL, BAYER, BASE, GT, RAD, DEN, FOOT, MODES, NREST, modeTables, takeModeOps } from './chladni-plate.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ layout

const SX = [4, 36, 96, 128], SY = [4, 4, 14, 14];          // numeral boxes (28 x 62)
const GX = 41, GY = 21;                                     // gradient grid, every 4 px

// ------------------------------------------------------------ per-grain constants (flash)

const RP0 = new Float32Array(GRAIN_MAX), RP1 = new Float32Array(GRAIN_MAX), RP2 = new Float32Array(GRAIN_MAX), RP3 = new Float32Array(GRAIN_MAX);
for (let p = 0; p < GRAIN_MAX; p++) {
  const r = (k) => (hash(p, k, 404) >>> 8) / 16777216;
  RP0[p] = r(0); RP1[p] = r(1); RP2[p] = r(2); RP3[p] = r(3);
}

const NGL = 260;
const GPER = new Float32Array(NGL), GPH = new Float32Array(NGL);
for (let k = 0; k < NGL; k++) { GPER[k] = 0.9 + 1.5 * ((hash(k, 1, 77) >>> 8) / 16777216); GPH[k] = (hash(k, 2, 77) >>> 8) / 16777216; }

const NCR = 90;
const CPER = new Float32Array(NCR), CPH = new Float32Array(NCR);
for (let k = 0; k < NCR; k++) { CPER[k] = 2.2 + 1.8 * ((hash(k, 1, 78) >>> 8) / 16777216); CPH[k] = (hash(k, 2, 78) >>> 8) / 16777216; }

// the light front: bright edge, a trailing glow (index: half pixels behind the front + 4)
const FRONT = new Uint8Array(40);
for (let q = 0; q < 40; q++) { const d = q - 4; FRONT[q] = Math.round(d < 0 ? 60 * (1 + d / 4) : 60 * (1 - d / 36) ** 2); }

// the driver: a bolt, a dark cone, a bright rim (distance table, 17 x 17)
const DRV = new Float32Array(17 * 17);
for (let j = 0; j < 17; j++) for (let i = 0; i < 17; i++) DRV[j * 17 + i] = Math.hypot(i - 7.5, j - 7.5);

// ------------------------------------------------------------ minutes

const DIG = new Map();
function digitsOf(key) {
  let d = DIG.get(key);
  if (!d) {
    const f = clockFields(new Date(key * 60000));
    d = (f.hh + f.mm).split('').map(Number);
    d.h = f.h;
    DIG.set(key, d);
    if (DIG.size > 8) DIG.delete(DIG.keys().next().value);
  }
  return d;
}

function modeOf(key) {
  const a = hash(key, 9, 31) % NREST, b = hash(key - 1, 9, 31) % NREST;
  return a === b ? (a + 1) % NREST : a;
}
// the hour's sweep up the harmonics
const SWEEP = [3, 4, 10, 12, 11];

// moat maps for a turn from key a to key b: static numerals, leaving, arriving
const SCENES = new Map();
let sceneOps = 0;
function scene(a, b) {
  const id = a * 2 + (b - a);
  let sc = SCENES.get(id);
  if (sc) return sc;
  const da = digitsOf(a), db = digitsOf(b);
  const MS = new Uint8Array(N), MA = new Uint8Array(N), MB = new Uint8Array(N);
  const change = [false, false, false, false];
  const stamp = (M, d, j) => {
    const mo = GLYPHS[d].moat, x0 = SX[j] - MARGIN, y0 = SY[j] - MARGIN;
    for (let y = 0; y < BH; y++) {
      const yy = y0 + y;
      if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < BW; x++) {
        const xx = x0 + x;
        if (xx < 0 || xx >= W) continue;
        const v = mo[y * BW + x], i = yy * W + xx;
        if (v > M[i]) M[i] = v;
      }
    }
    sceneOps += BW * BH;
  };
  for (let j = 0; j < 4; j++) {
    if (da[j] === db[j]) stamp(MS, da[j], j);
    else { change[j] = true; stamp(MA, da[j], j); stamp(MB, db[j], j); }
  }
  // the driver keeps a bare ring round it too
  for (let i = 0; i < N; i++) { const r = RAD[i]; if (r < 26) MS[i] = Math.max(MS[i], r < 16 ? 255 : (26 - r) * 25); }
  sceneOps += N * 3;
  sc = { da, db, MS, MA, MB, change, hour: da.h !== db.h, ma: modeOf(a), mb: modeOf(b) };
  SCENES.set(id, sc);
  if (SCENES.size > 3) SCENES.delete(SCENES.keys().next().value);
  return sc;
}

// ------------------------------------------------------------ frame buffers (RAM)

const L = new Uint16Array(N);                 // light, summed
const IG = new Float32Array(GX * GY);         // 4 / |grad F| on the coarse grid
const ROWC = new Float32Array(H * 4);         // per-row field coefficients
const ROWIG = new Float32Array(GX);

// ------------------------------------------------------------ the turn's timeline

/**
 * The field's morphs for a scene: [t0, t1, modeFrom, modeTo], tau in seconds
 * from :00. Each new note spreads out from the driver: a front runs across
 * the plate from t0 to t1, the old figure ahead of it, the new one behind.
 */
function segsOf(sc) {
  if (!sc.segs) sc.segs = sc.hour
    ? [[0, 1.4, sc.ma, SWEEP[0]], [2.0, 3.2, SWEEP[0], SWEEP[1]], [3.6, 4.8, SWEEP[1], SWEEP[2]],
      [5.2, 6.4, SWEEP[2], SWEEP[3]], [6.8, 8.0, SWEEP[3], SWEEP[4]], [8.4, 9.8, SWEEP[4], sc.mb]]
    : [[0, 1.4, sc.ma, sc.mb]];
  return sc.segs;
}
const RMAX = 180, WID = 36;      // half pixels: farthest corner, width of the morphing band

/** How hard the plate is shaken at tau, 0..1: the sand on the lines turns to haze. */
function shakeAt(sc, tau) {
  let v = Math.min(progress(tau, -1.5, -0.4), 1 - progress(tau, 0.6, 2.6));
  if (sc.hour) {
    const sg = segsOf(sc);
    for (let k = 1; k < sg.length; k++) {
      const b = 0.5 * Math.min(progress(tau, sg[k][0] - 0.3, sg[k][0] + 0.15), 1 - progress(tau, sg[k][0] + 0.3, sg[k][1]));
      if (b > v) v = b;
    }
  }
  return v;
}

/** 0 inside radius q, 1 outside, a one-pixel AA ramp. */
function edge(r, q) { const v = r - q + 0.5; return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Bilinear deposit of light w at (x, y): a grain at a fractional position. */
function splat(x, y, w) {
  if (x < -1 || y < -1 || x >= W || y >= H) return;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const w00 = w * (1 - fx) * (1 - fy), w10 = w * fx * (1 - fy), w01 = w * (1 - fx) * fy, w11 = w * fx * fy;
  const inx0 = ix >= 0, inx1 = ix + 1 < W, iny0 = iy >= 0, iny1 = iy + 1 < H, i = iy * W + ix;
  if (iny0) { if (inx0) L[i] += w00; if (inx1 && w10) L[i + 1] += w10; }
  if (iny1) { if (inx0 && w01) L[i + W] += w01; if (inx1 && w11) L[i + W + 1] += w11; }
}

/**
 * A numeral's sand in flight. Each grain of the old numeral leaves at its own
 * moment (so the stroke thins evenly), hops outward and up along its throw
 * vector, away from the counters, and dances there dimly; the cloud drifts
 * to where the new numeral's grains were thrown, and after :00 those fall in
 * from outside onto the new lines. The old figure never closes a counter,
 * and the new one only ever appears as itself, enlarged and fuzzy.
 */
function fly(j, ga, gb, tau, T) {
  const bx = SX[j] - MARGIN, by = SY[j] - MARGIN;
  const Na = ga.n, Nb = gb.n, P = Na > Nb ? Na : Nb;
  const AIR = 48;
  let prevA = -1, prevB = -1;
  for (let p = 0; p < P; p++) {
    const ia = ((p * Na) / P) | 0, ib = ((p * Nb) / P) | 0;
    const wa = ia !== prevA ? ga.gv[ia] : 0, wb = ib !== prevB ? gb.gv[ib] : 0;   // duplicates are dark at rest
    prevA = ia; prevB = ib;
    const leave = -0.85 + 0.45 * RP0[p], hop = leave + 0.36, depart = 0.3 * RP1[p], dur = 0.5 + 0.4 * RP2[p];
    let x, y, w;
    if (tau >= depart + dur) {
      const h = gb.gi[ib]; x = bx + (h % BW); y = by + ((h / BW) | 0); w = wb;
    } else if (tau < leave) {
      const h = ga.gi[ia]; x = bx + (h % BW); y = by + ((h / BW) | 0); w = wa;
      const pre = progress(tau, -1.7, leave);
      if (pre > 0) y -= 1.5 * pre * Math.abs(sin(T * (28 + 18 * RP3[p]) + TAU * RP2[p]));
    } else {
      const ha = ga.gi[ia], hb = gb.gi[ib];
      const ax = bx + (ha % BW), ay = by + ((ha / BW) | 0), nx = bx + (hb % BW), ny = by + ((hb / BW) | 0);
      const qax = ax + ga.ox[ia], qay = ay + ga.oy[ia], qbx = nx + gb.ox[ib], qby = ny + gb.oy[ib];
      const om = 7 + 5 * RP0[p], ph = TAU * RP3[p];
      const jx = 2.4 * sin(om * T + ph), jy = -3 * Math.abs(sin(om * 1.3 * T + 2 * ph));
      if (tau < hop) {
        const k = (tau - leave) / 0.36, e = ease.outQuad(k);
        x = ax + (qax + jx - ax) * e; y = ay + (qay + jy - ay) * e - (4 + 5 * RP2[p]) * 4 * k * (1 - k);
        w = wa + (AIR - wa) * e;
      } else if (tau < depart) {
        const e = ease.inOutQuad((tau - hop) / (depart - hop));
        x = qax + (qbx - qax) * e + jx; y = qay + (qby - qay) * e + jy; w = AIR;
      } else {
        const k = (tau - depart) / dur, e = ease.inOutCubic(k);
        x = qbx + jx * (1 - k) + (nx - qbx) * e; y = qby + jy * (1 - k) + (ny - qby) * e - 3 * (1 - k) * (1 - k) * Math.abs(sin(7.85 * k));
        w = AIR + (wb - AIR) * e;
      }
    }
    if (w > 0) splat(x, y, w);
  }
  return P;
}

// ------------------------------------------------------------ the face

export default {
  name: 'Chladni',
  blurb: 'A steel plate singing under fine sand: the time is heaped on its nodal lines, and each minute the note glides and the sand leaps and resettles.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, K = f.minuteKey, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * nt);
    const T = K * 60 + s;
    sceneOps = 0;

    // ---- which turn, if any
    const hourNow = digitsOf(K - 1).h !== digitsOf(K).h;
    let sc, tau = 0, turning = false;
    if (s >= 58) { sc = scene(K, K + 1); tau = s - 60; turning = true; }
    else if (s < (hourNow ? 10.5 : 3.5)) { sc = scene(K - 1, K); tau = s; turning = true; }
    else sc = scene(K, K);

    // ---- the field: which modes, where the front of the new note is, how hard shaken
    let A = sc.ma, B = sc.ma, rf = -999, shake = 0, hb = 0, fAmp = 0;
    if (turning) {
      for (const [t0, t1, a, b] of segsOf(sc)) {
        if (tau < t0) break;
        if (tau < t1) { A = a; B = b; rf = ((tau - t0) / (t1 - t0)) * (RMAX + WID); fAmp = 1 - 0.55 * (tau - t0) / (t1 - t0); break; }
        A = b; B = b;
      }
      shake = shakeAt(sc, tau);
      if (sc.hour) hb = Math.min(progress(tau, 0.3, 1.4), 1 - progress(tau, 9.4, 10.4));
    }
    const morph = rf > -999, ta = modeTables(A), tb = modeTables(B);
    const hum = 0.17 * sin((TAU * T) / 6.5) + 0.05 * sin((TAU * T) / 2.3);
    // the bow-stroke swell: every 5.3 s the tone swells, the plate rings harder
    const sw0 = 0.5 - 0.5 * sin((TAU * T) / 5.3 + 1.2), sw = sw0 * sw0 * sw0;
    const sa = ta.s * (1 + hum), sb = tb.s * (1 + hum);
    for (let y = 0; y < H; y++) {
      ROWC[y * 4] = ta.Y1[y]; ROWC[y * 4 + 1] = sa * ta.Y2[y];
      ROWC[y * 4 + 2] = tb.Y1[y]; ROWC[y * 4 + 3] = sb * tb.Y2[y];
    }
    for (let j = 0; j < GY; j++) {
      const y = j * 4 < H ? j * 4 : H - 1, r = y * 4;
      const c0 = ta.dY1[y], c1 = sa * ta.dY2[y], c2 = tb.dY1[y], c3 = sb * tb.dY2[y];
      for (let i = 0; i < GX; i++) {
        const x = i * 4 < W ? i * 4 : W - 1;
        let fx = ta.dX1[x] * ROWC[r] + ta.dX2[x] * ROWC[r + 1], fy = ta.X1[x] * c0 + ta.X2[x] * c1;
        if (morph) {
          let wv = (rf - RAD[y * W + x]) / WID;
          wv = wv < 0 ? 0 : wv > 1 ? 1 : wv;
          fx += (tb.dX1[x] * ROWC[r + 2] + tb.dX2[x] * ROWC[r + 3] - fx) * wv;
          fy += (tb.X1[x] * c2 + tb.X2[x] * c3 - fy) * wv;
        }
        const ax = fx < 0 ? -fx : fx, ay = fy < 0 ? -fy : fy;
        IG[j * GX + i] = 4 / ((ax > ay ? ax + 0.4 * ay : ay + 0.4 * ax) + 0.002);   // |grad|, max + 0.4 min
      }
    }
    g.cost.box += GX * GY * 36;

    // ---- pass 1: bare plate, its glow, the sand on the nodal lines, the moats, the sound front
    const sk = Math.min(15, (shake * 15 + 0.5) | 0), den = DEN[sk], foot = FOOT[sk];
    const amp = (88 + 32 * hb + 14 * sw) * (1 - 0.3 * nt), ak = amp / (255 * 255), half = amp * 0.45;
    const glowK = (14 + 24 * nt) / 255;
    const shK = (5 + 3 * sin(TAU * T * 0.7) + 10 * sw + 9 * hb + 7 * shake) * (1 - 0.5 * nt);
    const fa = turning ? Math.round(256 * (1 - progress(tau, -0.95, -0.1))) : 0;
    const fb = turning ? Math.round(256 * progress(tau, 0.15, 1.3)) : 0;
    const MS = sc.MS, MA = sc.MA, MB = sc.MB, X1a = ta.X1, X2a = ta.X2, X1b = tb.X1, X2b = tb.X2, iw = 1 / WID;
    for (let y = 0; y < H; y++) {
      const r0 = ROWC[y * 4], r1 = ROWC[y * 4 + 1], r2 = ROWC[y * 4 + 2], r3 = ROWC[y * 4 + 3];
      const j = y >> 2, fy = (y & 3) * 0.25, k0 = j * GX, k1 = (j + 1 < GY ? j + 1 : j) * GX;
      for (let i = 0; i < GX; i++) ROWIG[i] = IG[k0 + i] + (IG[k1 + i] - IG[k0 + i]) * fy;
      for (let x = 0, i = y * W; x < W; x++, i++) {
        let F = X1a[x] * r0 + X2a[x] * r1;
        if (morph) {
          let wv = (rf - RAD[i]) * iw;
          if (wv > 0) { if (wv > 1) wv = 1; F += (X1b[x] * r2 + X2b[x] * r3 - F) * wv; }
        }
        const aF = F < 0 ? -F : F;
        const xi = x >> 2, ig = ROWIG[xi] + (ROWIG[xi + 1] - ROWIG[xi]) * ((x & 3) * 0.25);
        let q = (aF * ig) | 0;
        if (q > 63) q = 63;
        const gt = GT[i];
        let bed = den[q] * (178 + ((gt * 77) >> 8)) * ak;      // the line, grainy
        if (foot[q] > gt) bed += half;                           // loose grains beside it
        let m = MS[i];
        const ma = (MA[i] * fa) >> 8, mb = (MB[i] * fb) >> 8;
        if (ma > m) m = ma;
        if (mb > m) m = mb;
        let v = BASE[i] + (bed * (255 - m)) / 255 + m * glowK + aF * shK;
        if (morph) { const d = (rf - RAD[i] + 4) | 0; if (d >= 0 && d < 40) v += FRONT[d] * fAmp; }
        L[i] = v;
      }
    }
    g.cost.px += N; g.cost.box += N * 15;

    // ---- the numerals: heaped sand, or sand in flight
    let grains = 0, stat = 0;
    for (let j = 0; j < 4; j++) {
      if (turning && sc.change[j]) { grains += fly(j, GLYPHS[sc.da[j]], GLYPHS[sc.db[j]], tau, T); continue; }
      const gl = GLYPHS[sc.db[j]], gi = gl.gi, gv = gl.gv, bx = SX[j] - MARGIN, by = SY[j] - MARGIN;
      for (let k = 0; k < gl.n; k++) {
        const h = gi[k], x = bx + (h % BW);
        if (x >= 0 && x < W) L[(by + ((h / BW) | 0)) * W + x] += gv[k];
      }
      stat += gl.n;
      // crest sparkle: a few grains catch the lamp in turn
      for (let k = 0; k < 5; k++) {
        const per = 0.7 + 0.13 * k, tk = T + k * 0.31 + j * 0.17, c = Math.floor(tk / per), u = (tk - c * per) / per;
        const h = gi[hash(c, j * 8 + k, 5) % gl.n], x = bx + (h % BW);
        if (x >= 0 && x < W) L[(by + ((h / BW) | 0)) * W + x] += 90 * 4 * u * (1 - u);
      }
    }
    g.cost.blit += stat; g.cost.box += grains * 40;

    // ---- glints: grains at the antinodes hop and fall back (everywhere, when shaken)
    let ng = 0;
    for (let k = 0; k < NGL; k++) {
      const per = GPER[k], tk = T + GPH[k] * per, c = Math.floor(tk / per), el = tk - c * per;
      if (el >= 0.34) continue;
      const h = hash(k, c, 17), x = h % W, y = (h >>> 8) % H, i = y * W + x;
      const shk = turning ? shakeAt(sc, tau - el) : 0;
      if (((h >>> 24) & 255) > 120 + 60 * sw + 135 * Math.max(shk, hb)) continue;
      const r = y * 4;
      let F = X1a[x] * ROWC[r] + X2a[x] * ROWC[r + 1];
      if (morph) { const wv = Math.min(1, Math.max(0, (rf - RAD[i]) * iw)); F += (X1b[x] * ROWC[r + 2] + X2b[x] * ROWC[r + 3] - F) * wv; }
      if ((F < 0 ? -F : F) < 0.8 * (1 - shk)) continue;
      if (MS[i] > 30 || ((MA[i] * fa) >> 8) > 30 || ((MB[i] * fb) >> 8) > 30) continue;
      const u = el / 0.34, lift = (1.5 + 2.5 * ((h >>> 16) & 255) / 255) * 4 * u * (1 - u);
      splat(x, y - lift, (u < 0.12 ? u / 0.12 : 1 - 0.6 * (u - 0.12) / 0.88) * (170 - 60 * nt));
      ng++;
    }
    g.cost.box += NGL * 8 + ng * 30;

    // ---- creep: loose grains slide down the slope of the vibration onto the nearest line
    let nc = 0;
    if (!morph) for (let k = 0; k < NCR; k++) {
      const per = CPER[k], tk = T + CPH[k] * per, c = Math.floor(tk / per), u = (tk - c * per) / per;
      const h = hash(k, c, 23), x = h % W, y = (h >>> 8) % H, i = y * W + x, r = y * 4;
      if (MS[i] > 10 || MA[i] > 10 || MB[i] > 10) continue;
      const F = X1a[x] * ROWC[r] + X2a[x] * ROWC[r + 1];
      const gx = ta.dX1[x] * ROWC[r] + ta.dX2[x] * ROWC[r + 1], gy = ta.X1[x] * ta.dY1[y] + ta.X2[x] * sa * ta.dY2[y];
      const g2 = gx * gx + gy * gy;
      if (g2 < 1e-6) continue;
      const k2 = F / g2, ex = -gx * k2, ey = -gy * k2, d2 = ex * ex + ey * ey;
      if (d2 > 36 || d2 < 2) continue;                                   // only grains a few px off a line
      const e = ease.inOutQuad(u), env = u < 0.2 ? u / 0.2 : u > 0.85 ? (1 - u) / 0.15 : 1;
      splat(x + 0.5 + ex * e - 0.5, y + ey * e, (64 - 24 * nt) * env * (1 - shake));
      nc++;
    }
    g.cost.box += NCR * 10 + nc * 40;

    // ---- the driver: bolt, dark cone, bright rim, buzzing with the tone
    const bz = (0.22 + 0.3 * shake) * sin(T * TAU * 6.2), rin = 3.9 + bz, rout = 5.5 + bz;
    for (let jy = 0; jy < 17; jy++)
      for (let jx = 0; jx < 17; jx++) {
        const r = DRV[jy * 17 + jx];
        if (r > 8) continue;
        let v = 228;
        v += (14 - v) * edge(r, 1.5); v += (176 - v) * edge(r, rin); v += (10 - v) * edge(r, rout);
        const i = (DY - 8 + jy) * W + DX - 8 + jx;
        L[i] = v + (L[i] - v) * edge(r, 7.2);
      }
    g.cost.box += 17 * 17 * 12;

    // ---- pass 2: light to the cobalt ramp, dithered
    const buf = g.buf, nb = nt * 16;
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        let v = L[i];
        if (v > 255) v = 255;
        const b = BAYER[((y & 3) << 2) | (x & 3)];
        let idx = (v * 4 + b) >> 4;
        if (idx > 63) idx = 63;
        buf[i] = (nb > b ? NPAL : PAL)[idx];
      }
    g.cost.px += N; g.cost.box += N * 3;
    g.cost.box += takeModeOps() * 4 + sceneOps * 2;
  },
};
