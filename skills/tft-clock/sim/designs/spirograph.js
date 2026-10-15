// Spirograph: gel pens on black paper. Each numeral is a clear plastic RAIL
// pinned to the sheet in the shape of the digit (spirograph-rails.js), and a
// little toothed wheel rolls along it with a gel pen in its outer hole: the
// pen throws loop after loop either side of the rail, and the digit IS that
// looping garland, a band of telephone-cord loops in metallic ink. Hours are
// big rails, minutes smaller ones set a little lower; each rail is pinned by
// hand, a degree or two off square. Two push pins are the colon.
//
// The time is never still. Every wheel keeps rolling round its rail (open
// strokes there and back, 0 and the rings of 8 round and round), overdrawing
// the garland as it goes, and because the rail's length is no whole number
// of wheel turns, every lap lands its loops somewhere new. On every beat
// the wheels surge forward, every loop of every digit ratchets a quarter turn
// along its rail (the pen clicks a tooth), the garlands breathe out a little,
// and every pen changes colour, so each digit is a run of colour segments
// laid one second each, wettest (brightest) right behind the wheel. The pen
// skips now and then, and the glitter in the ink twinkles. Every 15 s the
// wheels race a lap with the rainbow pen and the glitter thickens.
//
// Behind them the hour's rosette: the big drawing of this hour, in dried
// ink, slowly turning with the paper (a moat keeps it off the rails).
// Minute turn: each changing digit's pen moves to the centre hole, its loops
// pull tight into a single line on a rail you can now see, the rail is
// lifted and gone by :00; the new rail is pinned, a fine line, and its loops
// spring out to full. The paper turns one petal of the rosette as it
// happens. Hour: the old sheet slides away to the left, the giant ring gear
// is laid on the glass, and its big wheel (a spiral of pen holes) draws the
// new hour's rosette in fresh glitter ink behind the time in 8 s, then the
// ring is lifted and the ink dries dim.
//
// Palette, the medium's: black construction paper (a violet-black, it glows
// on the LCD), eight gel pens sold for black paper (metallic gold, rose,
// aqua, lavender, copper, lime, sky, silver), their wet sheen (the same ink
// lifted towards white) and their glitter; smoke-blue translucent plastic
// for the wheels, rails and ring; one dried ink per hour for the rosette at
// about a third of its strength, so the numerals are always the brightest,
// highest-contrast thing. All flat 2D: lines, translucent tints, no shading.
// Night: the backlight drops to 42 %, the glitter rests, the rosette sinks
// further into the paper; the inks keep their full strength in the buffer
// so they don't go muddy.
//
// Cost: the garlands are ~5k pen samples a frame, each a table sine, a few
// multiplies and a 2x2 bilinear splat into a coverage byte map (integer,
// billed as box work), then one blend per ink pixel; the rosette is ~3k
// splats. Flash: the 40 placed rails (4 slots x 10 digits) as int16 x, y,
// angle at 0.4 px steps, ~72 KB (the JS keeps them at 0.1 px; a port
// interpolates), plus sine and sqrt tables, ~86 KB in all. When a digit is
// about to appear its moat and plastic strip are stamped with integer
// squared distances (~60k ops), one digit per half second over :56-:58,
// billed in that frame; the hour's rosette (~3k points from the sine table)
// is laid out at :59:58. RAM: coverage + pen-id maps 25.6 KB, a byte moat
// mask 12.8 KB, the stamping scratch 25.6 KB, up to 8 placed digits' index
// lists ~40 KB, two rosettes as int16 ~22 KB: ~126 KB peak.

import { clockFields, hash, sin, clamp, ease, to565, from565 } from '../js/kit.js';
import { placeDigit } from './spirograph-rails.js';
import { PAPER, PENS, PLASTIC, mixc, blend565, levels } from './spirograph-ink.js';
import { rosette, takeRoseOps, RCX, RCY } from './spirograph-rosette.js';

const W = 160, H = 80, N = W * H, TAU = Math.PI * 2;
const SIZES = {
  big: { sx: 1.18, sy: 1.08, d: 3.4, R: 0.85, v: 46, rw: 5.2, rack: 2.0 },
  small: { sx: 0.98, sy: 0.88, d: 2.9, R: 0.72, v: 40, rw: 4.4, rack: 1.7 },
};
const SLOTS = [
  { cx: 26.5, cy: 40, tilt: -2.5, ...SIZES.big },
  { cx: 61.5, cy: 40, tilt: 1.5, ...SIZES.big },
  { cx: 105, cy: 44, tilt: -1.5, ...SIZES.small },
  { cx: 136, cy: 44, tilt: 2.5, ...SIZES.small },
];
const PINS = [[84.5, 35.5], [84.5, 52.5]];
const MOAT = 2.6;

// sine table, 1024 steps (an int16 table on the device)
const ST = Float32Array.from({ length: 1024 }, (_, i) => Math.sin((i / 1024) * TAU));
const TQ = 1024 / TAU;

// ink colours per id: pen (0..7) | wet << 3 | rainbow << 4
const INK = new Uint32Array(32), SPARK = new Uint32Array(32);
for (let id = 0; id < 32; id++) {
  const p = PENS[id & 7];
  INK[id] = id & 8 ? mixc(p, 0xffffff, 0.45) : p;
  SPARK[id] = mixc(p, 0xffffff, 0.8);
}

// ------------------------------------------------------------ placed digits
// The rails, sampled for every slot at load: flash tables on the device (stored per size at
// 0.4 px steps as int16 x, y, angle, ~40 KB, expanded to 0.1 px by linear interpolation inline).
const RAILS = [];
for (let si = 0; si < 4; si++)
  for (let d = 0; d < 10; d++)
    RAILS[si * 10 + d] = placeDigit(d, SLOTS[si]).map((r, k) => ({ ...r, seed: hash(si, d, k), off: (hash(si, d, k + 7) % 1000) / 1000 }));

// The moat and the plastic strip round a rail: stamped with integer squared distances into a
// scratch byte map when a digit appears (RAM ~2 KB a slot as index lists), billed in that frame.
const SQ = 16;                                   // distances in 1/16 px
const SQRT = Uint8Array.from({ length: 4096 }, (_, i) => Math.min(255, Math.round(Math.sqrt(i * 16))));
const DIST = new Uint16Array(N);
const PLACED = new Map();
let buildOps = 0;
function placed(slot, d) {
  const key = slot * 10 + d;
  let p = PLACED.get(key);
  if (p) return p;
  const S = SLOTS[slot], rails = RAILS[key];
  const reach = S.d + 0.9 + MOAT, R16 = Math.ceil(reach * SQ), R2 = R16 * R16, ir = Math.ceil(reach);
  DIST.fill(65535);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const r of rails)
    for (let j = 0; j < r.n; j += 10) {
      const X16 = (r.X[j] * SQ) | 0, Y16 = (r.Y[j] * SQ) | 0, cx = X16 >> 4, cy = Y16 >> 4;
      for (let yy = cy - ir; yy <= cy + ir; yy++) {
        if (yy < 0 || yy >= H) continue;
        const dy = yy * SQ + 8 - Y16;
        for (let xx = cx - ir; xx <= cx + ir; xx++) {
          if (xx < 0 || xx >= W) continue;
          const dx = xx * SQ + 8 - X16, d2 = dx * dx + dy * dy;
          buildOps++;
          if (d2 > R2) continue;
          const i = yy * W + xx, q = d2 >> 4;    // 1/16 px squared, quartered: fits 16 bits
          if (q < DIST[i]) DIST[i] = q;
        }
      }
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
    }
  const ri = [], rc = [], mi = [];
  const lv = levels(PAPER, PLASTIC);
  for (let y = Math.max(0, y0 - ir); y <= Math.min(H - 1, y1 + ir); y++)
    for (let x = Math.max(0, x0 - ir); x <= Math.min(W - 1, x1 + ir); x++) {
      const i = y * W + x, q = DIST[i];
      buildOps++;
      if (q === 65535) continue;
      mi.push(i);
      const dd = SQRT[q > 4095 ? 4095 : q] / SQ;     // px
      const cov = S.rack + 0.5 - dd;
      if (cov > 0) { ri.push(i); rc.push(lv[Math.round((dd > S.rack - 1 ? 0.42 : 0.17) * Math.min(1, cov) * 16)]); }
    }
  p = { rails, rackI: Int32Array.from(ri), rackC: Uint16Array.from(rc), moat: Int32Array.from(mi) };
  PLACED.set(key, p);
  if (PLACED.size > 12) PLACED.delete(PLACED.keys().next().value);
  return p;
}

// wheel time: the beat (each wheel surges on the second and eases off, speed 0.45..1.55 of its
// cruise) and the flourish every 15 s (the wheels race +0.8 s of travel over :14..:15, rainbow pen)
function teff(T) {
  const fr = T - Math.floor(T), T15 = T % 15;
  return T + (0.55 * sin(TAU * fr)) / TAU + 0.8 * Math.floor(T / 15) + 0.8 * ease.inOutQuad(clamp(T15 - 14, 0, 1));
}
const NB = 12, BEAT = new Float64Array(NB);

const COV = new Uint8Array(N), ID = new Uint8Array(N), MASK = new Uint32Array(N);
let tag = 0;

/** Splat a point into COV/ID: bilinear weights, kept by max (a pen line ~1.4 px wide). */
function splat(px, py, id, gain) {
  const ix = px | 0, iy = py | 0;
  if (px < 0 || py < 0 || ix >= W - 1 || iy >= H - 1) return false;
  const fx = ((px - ix) * 256) | 0, fy = ((py - iy) * 256) | 0, i0 = iy * W + ix;
  let w = ((((256 - fx) * (256 - fy)) >> 8) * gain) >> 8; if (w > 255) w = 255;
  if (w > COV[i0]) { COV[i0] = w; ID[i0] = id; }
  w = (((fx * (256 - fy)) >> 8) * gain) >> 8; if (w > 255) w = 255;
  if (w > COV[i0 + 1]) { COV[i0 + 1] = w; ID[i0 + 1] = id; }
  w = (((((256 - fx) * fy) >> 8) * gain) >> 8); if (w > 255) w = 255;
  if (w > COV[i0 + W]) { COV[i0 + W] = w; ID[i0 + W] = id; }
  w = (((fx * fy) >> 8) * gain) >> 8; if (w > 255) w = 255;
  if (w > COV[i0 + W + 1]) { COV[i0 + W + 1] = w; ID[i0 + W + 1] = id; }
  return true;
}

// ------------------------------------------------------------ the hour's rosette on the paper
const OMEGA = TAU / 120;              // the paper turns once in 2 minutes
const SHOW0 = 1.2, SHOW1 = 8.8;       // the giant wheel draws from :00:01.2 to :00:08.8
function restRot(ro, tH) {
  const x = tH + 1.2, Mc = Math.min(59, Math.floor(x / 60));
  const steps = Mc >= 1 ? Mc - 1 + ease.inOutCubic(clamp((x - 60 * Mc) / 2.8, 0, 1)) : 0;
  return OMEGA * Math.max(0, tH - 11) + (TAU / ro.petals) * steps;
}

function drawRosette(g, ro, rot, dx, upto, wetFrom, col, wetCol, sparkle, tw) {
  const P = ro.P, c = Math.cos(rot), s = Math.sin(rot), buf = g.buf;
  const gain = 330;
  for (let j = 0; j < upto; j++) {
    const x = P[2 * j], y = P[2 * j + 1];
    const px = RCX + dx + c * x - s * y - 0.5, py = RCY + s * x + c * y - 0.5;
    if (px < 0 || px >= W - 1 || py < 0 || py >= H - 1) continue;
    const i = (py | 0) * W + (px | 0);
    if (MASK[i] === tag) continue;
    splat(px, py, j >= wetFrom ? 1 : 0, gain);
  }
  const L0 = levels(PAPER, col), L1 = levels(PAPER, wetCol);
  for (let i = 0; i < N; i++) {
    const v = COV[i];
    if (!v) continue;
    COV[i] = 0;
    if (MASK[i] === tag) continue;
    if (sparkle) {
      const h = Math.imul(i * 2654435761, 0x27d4eb2d) >>> 0;
      if ((h & 15) === 0 && ((h >>> 8) + tw) % 5 === 0) { buf[i] = to565(mixc(col, 0xffffff, 0.75)); continue; }
    }
    buf[i] = (ID[i] ? L1 : L0)[(v * 16 + 128) >> 8];
  }
  g.cost.box += upto * 22 + N * 2;
}

// the giant ring gear and its big wheel, during the hour's drawing
function giantRing(g, ro, a, grow, tPen, night) {
  if (a <= 0.01) return;
  const R0 = ro.ringR * grow;
  g.ring(RCX, RCY, R0, R0 + 5, PLASTIC, { a: 0.16 * a, aa: true });
  g.ring(RCX, RCY, R0, R0 + 0.9, PLASTIC, { a: 0.4 * a, aa: true });
  // inner teeth
  const nT = Math.round((TAU * R0) / 3);
  for (let k = 0; k < nT; k++) {
    const ti = ((k * 1024) / nT) | 0;
    g.pixel(RCX + (R0 - 0.6) * ST[(ti + 256) & 1023], RCY + (R0 - 0.6) * ST[ti], PLASTIC, { a: 0.35 * a });
  }
  const tp = (tPen * TQ) & 1023, wx = RCX + ro.orbit * grow * ST[(tp + 256) & 1023], wy = RCY + ro.orbit * grow * ST[tp], wr = ro.wheelR * grow;
  const spin = -ro.k * tPen;
  g.fillCircle(wx, wy, wr, PLASTIC, { a: 0.13 * a, aa: true });
  g.ring(wx, wy, wr - 1, wr, PLASTIC, { a: 0.42 * a, aa: true });
  // the spiral of pen holes, turning with the wheel
  for (let k = 0; k < 7; k++) {
    const hr = wr * (0.18 + 0.1 * k), an = ((spin + k * 2.35) * TQ) & 1023;
    g.fillCircle(wx + hr * ST[(an + 256) & 1023], wy - hr * ST[an], 0.9, PAPER, { a: 0.6 * a, aa: true });
  }
  const sp = (spin * TQ) & 1023, px = wx + ro.pen * grow * ST[(sp + 256) & 1023], py = wy - ro.pen * grow * ST[sp];
  g.fillCircle(px, py, 1.5, mixc(ro.ink, 0xffffff, night ? 0.2 : 0.55), { a, aa: true });
}

export default {
  name: 'Spirograph',
  blurb: 'Gel pens on black paper: each numeral is a looping spirograph garland laid by a wheel rolling along a digit-shaped rail; the pens change colour on every beat, and each hour a giant wheel draws a rosette behind the time.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.58 * night);
    const buf = g.buf;
    const T = f.h * 3600 + f.m * 60 + s + 10000;
    const fr = T - Math.floor(T);
    const Teff = teff(T), T0 = Math.floor(T);
    // the moment each of the last few seconds began, in wheel time: the pen changes colour there
    for (let i = 0; i < NB; i++) BEAT[i] = teff(T0 - i);
    const throb = 0.16 * (fr < 0.06 ? fr / 0.06 : Math.exp(-(fr - 0.06) * 7));
    // the click: on every beat each wheel's pen ratchets a quarter turn, so every loop of every garland steps along its rail
    const click = ((Math.floor(T) % 4) + ease.outCubic(clamp(fr / 0.35, 0, 1))) * 256;
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nx = nxt.hh + nxt.mm, pv = prv.hh + prv.mm;
    const tw = Math.floor(T * 12);
    tag++;
    buildOps = 0;
    const tH = f.m * 60 + s;

    // ---- get ahead of the turn: next minute's new rails are stamped one at a time over :56-:58,
    // and the next hour's rosette is laid out at :59:58.2, so no single frame builds them all
    if (s >= 56) {
      const k = Math.floor((s - 56) * 2);
      if (k < 4 && nx[k] !== cur[k]) placed(k, +nx[k]);
      if (tH >= 3598.2 && nxt.h !== f.h) rosette(nxt.h);
    }
    // ---- which digit each slot shows, and how far through its turn
    const shown = [];
    for (let si = 0; si < 4; si++) {
      let dfac = 1, alpha = 1;
      if (s >= 58.9 && nx[si] !== cur[si]) {
        dfac = 1 - ease.inOutQuad(clamp((s - 58.9) / 0.65, 0, 1));
        alpha = 1 - clamp((s - 59.55) / 0.45, 0, 1);
      } else if (s < 1.4 && pv[si] !== cur[si]) {
        alpha = clamp(s / 0.3, 0, 1);
        dfac = s < 0.3 ? 0 : ease.outBack(clamp((s - 0.3) / 1.1, 0, 1));
      }
      const P = placed(si, +cur[si]);
      shown.push({ si, P, dfac, alpha });
      const m = P.moat;
      for (let k = 0; k < m.length; k++) MASK[m[k]] = tag;
      g.cost.box += m.length;
    }

    // ---- the paper and the hour's rosette
    g.clear(PAPER);
    const dimK = 1 - 0.35 * night;
    if (tH >= 3599 || tH < 1) {
      // the paper slides out to the left, taking the old hour's drawing with it
      const h0 = tH < 1 ? prv.h : f.h, ro = rosette(h0), t0 = tH < 1 ? 3600 + tH : tH;
      const dx = -172 * ease.inOutQuad(clamp((t0 - 3599) / 2, 0, 1));
      drawRosette(g, ro, restRot(ro, t0), dx, ro.n, ro.n, mixc(PAPER, ro.dim, dimK), 0, false, tw);
    } else {
      const ro = rosette(f.h);
      if (tH < 11) {
        const u = ease.inOutQuad(clamp((tH - SHOW0) / (SHOW1 - SHOW0), 0, 1));
        const upto = Math.floor(u * ro.n);
        const dry = clamp((tH - 9) / 2, 0, 1);
        const col = mixc(mixc(PAPER, ro.ink, 0.62), ro.dim, dry), dimC = mixc(PAPER, col, dimK);
        if (upto > 0) drawRosette(g, ro, 0, 0, upto, u < 1 ? upto - 40 : upto, dimC, mixc(ro.ink, 0xffffff, 0.5), dry < 0.6 && !night, tw);
      } else drawRosette(g, ro, restRot(ro, tH), 0, ro.n, ro.n, mixc(PAPER, ro.dim, dimK), 0, false, tw);
    }

    // ---- the plastic rails
    // clear plastic on black paper: you only see the rail while the loops on it are pulled thin
    for (const { P, alpha, dfac } of shown) {
      const ra = Math.round(alpha * clamp(1 - dfac, 0, 1) * 256);
      if (ra <= 2) continue;
      const ri = P.rackI, rc = P.rackC;
      for (let k = 0; k < ri.length; k++) buf[ri[k]] = ra >= 256 ? rc[k] : blend565(buf[ri[k]], from565(rc[k]), ra);
      g.cost.box += ri.length * 3;
    }

    // ---- the garlands: every pen sample of every rail, where its loop is now
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0, work = 0;
    const wheels = [];
    for (const { si, P, dfac, alpha } of shown) {
      if (alpha <= 0) continue;
      const S = SLOTS[si];
      const de = S.d * dfac * (1 + throb), v = S.v, iR = 1 / S.R, gain = Math.round(alpha * 400);
      for (const r of P.rails) {
        const L = r.L, per = r.closed ? L : 2 * L, Dt = v * Teff + r.off * per;
        const q = Dt - Math.floor(Dt / per) * per;
        const X = r.X, Y = r.Y, A = r.A, st = r.step, n = r.n, seed = r.seed;
        for (let j = 0; j < n; j++) {
          const sj = j * st;
          let age, back = 0;
          if (r.closed) { age = q - sj; if (age < 0) age += L; }
          else if (q < L) { if (sj <= q) age = q - sj; else { age = q + sj; back = 1; } }
          else { const p = 2 * L - q; if (sj >= p) { age = sj - p; back = 1; } else age = 2 * L - sj - p; }
          const Dp = Dt - age;
          if (hash((Dp * 1.5) | 0, seed) % 41 === 0) continue;          // the pen skips
          const ti = ((Dp * iR + A[j]) * TQ + (back ? 512 : 0) + click) & 1023;
          const px = X[j] + de * ST[(ti + 256) & 1023] - 0.5, py = Y[j] + de * ST[ti] - 0.5;
          const tp = Teff - age / v;
          let b = 0;
          while (b < NB - 1 && tp < BEAT[b]) b++;
          const sec = T0 - b;
          let id = sec & 7;
          if (sec % 15 === 14) id = (((Dp / 4) | 0) & 7) | 16;           // the rainbow pen
          if (age < 0.35 * v) id |= 8;                                     // still wet
          if (!splat(px, py, id, gain)) continue;
          const ix = px | 0, iy = py | 0;
          if (ix < bx0) bx0 = ix; if (iy < by0) by0 = iy; if (ix + 1 > bx1) bx1 = ix + 1; if (iy + 1 > by1) by1 = iy + 1;
        }
        work += n * 30;
        const wp = r.closed ? q : q < L ? q : 2 * L - q;
        const jw = Math.min(n - 1, Math.round(wp / st));
        const tiw = ((Dt * iR + A[jw]) * TQ + ((!r.closed && q >= L) ? 512 : 0) + click) & 1023;
        wheels.push({ x: X[jw], y: Y[jw], px: X[jw] + de * ST[(tiw + 256) & 1023], py: Y[jw] + de * ST[tiw], rw: S.rw, a: alpha * clamp(dfac, 0, 1), id: T0 & 7 });
      }
    }
    // composite the ink over the paper and rails
    const glit = night > 0.5 ? 0 : 1;
    for (let y = by0; y <= by1 && y < H; y++)
      for (let x = bx0; x <= bx1 && x < W; x++) {
        const i = y * W + x, c = COV[i];
        if (!c) continue;
        COV[i] = 0;
        const id = ID[i];
        let col = INK[id];
        if (glit) {
          const h = Math.imul(x * 374761 + y * 668265 + 1013, 0x27d4eb2d) >>> 0;
          if ((h & 31) < (id & 16 ? 8 : 3) && ((h >>> 8) + tw) % 7 === 0) col = SPARK[id];
        }
        buf[i] = c >= 250 ? to565(col) : blend565(buf[i], col, c + 1);
      }
    work += (bx1 - bx0 + 1) * (by1 - by0 + 1) * 2;
    g.cost.box += work + buildOps * 4 + takeRoseOps();

    // ---- the hour: the giant ring and its wheel
    if (tH >= 0.4 && tH < 10.2) {
      const ro = rosette(f.h);
      const a = clamp((tH - 0.4) / 0.6, 0, 1) * (1 - clamp((tH - 9.0) / 1.2, 0, 1));
      const grow = 1 + 0.12 * (1 - ease.outCubic(clamp((tH - 0.4) / 0.8, 0, 1)));
      const u = ease.inOutQuad(clamp((tH - SHOW0) / (SHOW1 - SHOW0), 0, 1));
      const j = Math.min(ro.n - 1, Math.floor(u * ro.n));
      giantRing(g, ro, a, grow, ro.Tv[j], night > 0.5);
    }

    // ---- the little wheels riding the rails
    for (const w of wheels) {
      if (w.a <= 0.02) continue;
      g.fillCircle(w.x, w.y, w.rw, PLASTIC, { a: 0.14 * w.a, aa: true });
      g.ring(w.x, w.y, w.rw - 0.9, w.rw, PLASTIC, { a: 0.45 * w.a, aa: true });
      g.fillCircle(w.px, w.py, 1.1, mixc(PENS[w.id], 0xffffff, 0.5), { a: w.a, aa: true });
    }

    // ---- the colon: two push pins
    for (const [x, y] of PINS) {
      g.fillCircle(x, y, 2.4, 0x5a6070, { aa: true });
      g.fillCircle(x, y, 1.7, 0xc8ccd8, { aa: true });
      g.pixel(x - 1, y - 1, 0xffffff);
    }
  },
};
