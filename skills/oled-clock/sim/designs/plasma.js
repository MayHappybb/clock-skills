// Plasma — the time is a level set of a field that is boiling.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) evaluated at every pixel, and that is exactly what frame() can
// be. So this face is one scalar field over the glass, sampled per pixel.
//
// The field, A(x, y, t) in [0, 1], is the classic shader plasma: a sum of
// sines in x, y, x+y and radius, and the whole thing is domain-warped — the
// sample point is pushed around by a second copy of the field before the
// sum is taken, so the bands fold and swirl instead of sitting still. It
// boils continuously; nothing about it is timed to the second.
//
// The picture is the field, drawn the way a shader would draw it on a 1-bit
// panel: the pixel lights where the field is near one of its own level lines
// (bright filaments), or where it runs high (a wash that is truly black below
// its level, so nothing burns in on a constant grey), or inside a glyph.
//
// The time is not drawn on top of that field. It IS a level set of it. Each
// digit is a distance field d(x, y): negative inside its strokes. The pixel
// lights where
//
//     d(x, y) + beta * (A(x, y, t) - L) + S(t)  <  0
//
// so the visible edge of every stroke is the zero crossing of an animated
// scalar field — the numeral swells where the plasma is high and thins where
// it is low, and its outline flows with the boil. A bitmap font pasted on
// screen cannot do that; the strokes have to live in the field.
//
// S(t) is the same field's level sweep. Let S rise and every stroke erodes
// from its edges, faster where the plasma is hot, until the digit is gone;
// let it fall and the digit condenses back out. That is the minute turn: the
// old digits go at :59.05, the glass is pure plasma for a fifth of a second,
// and the new ones have condensed out of the boil by :00.8. Only the slots
// whose digit changes take part, and each is either wholly old, wholly gone
// or wholly new — never a mixture of two times. On the hour the sweep is
// deeper, the field's own phases take a shove (the plasma re-phases and a
// bloom of light runs through it) and all four digits go and come back.
//
// The two halves of the time are two regimes of the same field. The hours are
// big (three quarters of the glass height), solid, and sit in a dark eye: the
// field is pressed flat inside a halo round them. The minutes are small and
// low, out in the weather, and are woven from the very filaments that run
// through the boil around them — the same material, only denser. The hours
// are the still point; the minutes are in the storm. The colon is two beads
// of the field, radius a level set, pulsing once a second.
//
// Burn-in: the plasma is new every frame, the digits walk kit.orbit, and the
// panel dims 23:00-07:00. The hottest pixels are the strokes every hour tens
// shares (0, 1 and 2 all have ink at the top of the box): check.mjs.
//
// Cost: one pass over the glass. A is ten table-sines and a sqrt; the four
// digits are bilinear reads of distance tables built once at load. About
// 1.1 ms a frame at 128x64, so SPI at 60 fps is comfortable.

import { orbit, previousMinute, clockFields } from '../js/kit.js';

const W = 128, H = 64, TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const sm = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------ fast sine
// Every field sample is a few sines; a 1024-entry table makes them free.

const SB = 1 << 10, SMASK = SB - 1;
const STAB = new Float32Array(SB);
for (let i = 0; i < SB; i++) STAB[i] = Math.sin((i / SB) * TAU);
const I2R = SB / TAU, BIG = 1 << 21;
const fsin = (a) => STAB[(Math.floor(a * I2R) + BIG) & SMASK];
const fcos = (a) => STAB[(Math.floor(a * I2R + SB / 4) + BIG) & SMASK];

// ------------------------------------------------------------ letterforms
//
// One set of ten, drawn as centre-lines in a 24 x 40 box: bowls of radius
// 6.5-7.4 units, stems, and no serifs. The 9 is the 6 turned half round.
// Every stroke is 6.4 units wide (half-width 3.2); the whole set scales by
// one factor, so the distance table is built once and read at two sizes.

const D2R = Math.PI / 180, UNITS_W = 24, UNITS_H = 40, HW = 3.2;
const S = (ax, ay, bx, by) => ({ k: 0, ax, ay, bx, by });
const Aa = (cx, cy, rx, ry, a0, a1) => ({ k: 1, cx, cy, rx, ry, a0: a0 * D2R, a1: a1 * D2R });

const SKEL = {
  0: [S(5.5, 12.5, 5.5, 27.5), S(18.5, 12.5, 18.5, 27.5),
      Aa(12, 12.5, 6.5, 6.5, 180, 360), Aa(12, 27.5, 6.5, 6.5, 0, 180)],
  1: [S(12, 5, 12, 35), S(5.5, 11, 12, 5)],
  2: [Aa(12, 12, 6.8, 6.8, 148, 384), S(18.16, 14.87, 5.6, 35), S(5.6, 35, 18.5, 35)],
  3: [Aa(12, 12, 7, 7, 152, 390), S(18.06, 15.5, 18.35, 24.2), Aa(12, 28, 7.4, 7.6, -30, 185)],
  4: [S(17, 5, 17, 35), S(17, 5, 5, 26), S(5, 26, 19.5, 26)],
  5: [S(18.5, 5, 6, 5), S(6, 5, 6, 19), S(6, 19, 12, 19), Aa(12, 27, 6.8, 8, -90, 160)],
  6: [Aa(12, 26, 7.4, 7.4, 0, 360), S(5.2, 14, 5.2, 25), Aa(12, 14, 6.8, 6.8, 180, 335)],
  7: [S(4.5, 5, 19.5, 5), S(19.5, 5, 9, 35)],
  8: [Aa(12, 12, 6.4, 6.4, 0, 360), Aa(12, 27.5, 7.4, 7.4, 0, 360)],
};
// The 9 is the 6 rotated about the box centre.
SKEL[9] = SKEL[6].map((p) => (p.k
  ? Aa(UNITS_W - p.cx, UNITS_H - p.cy, p.rx, p.ry, p.a0 / D2R + 180, p.a1 / D2R + 180)
  : S(UNITS_W - p.ax, UNITS_H - p.ay, UNITS_W - p.bx, UNITS_H - p.by)));

// The signed distance table, one per digit, over the box plus a margin wide
// enough for the edge to breathe and for the calm halo outside it.
const STEPU = 0.5, MARG = 8, STEPP = 1.4;
const TX0 = -MARG, TY0 = -MARG;
const TW = Math.round((UNITS_W + 2 * MARG) / STEPU) + 1;
const TH = Math.round((UNITS_H + 2 * MARG) / STEPU) + 1;

/** A primitive sampled into points STEPP apart. */
function sample(p) {
  const out = [];
  let n;
  if (!p.k) n = Math.max(1, Math.ceil(Math.hypot(p.bx - p.ax, p.by - p.ay) / STEPP));
  else n = Math.max(2, Math.ceil((Math.abs(p.a1 - p.a0) * Math.max(p.rx, p.ry)) / STEPP));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!p.k) out.push(p.ax + (p.bx - p.ax) * t, p.ay + (p.by - p.ay) * t);
    else {
      const a = p.a0 + (p.a1 - p.a0) * t;
      out.push(p.cx + p.rx * Math.cos(a), p.cy + p.ry * Math.sin(a));
    }
  }
  return out;
}

/** Signed distance to a digit's centre-line, minus the half-width: 0 on the edge. */
function buildSDF(paths) {
  const seg = [];
  for (const p of paths) {
    const q = sample(p);
    for (let i = 2; i < q.length; i += 2) seg.push(q[i - 2], q[i - 1], q[i], q[i + 1]);
  }
  const n = seg.length, t = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const y = TY0 + j * STEPU;
    for (let i = 0; i < TW; i++) {
      const x = TX0 + i * STEPU;
      let best = 1e9;
      for (let k = 0; k < n; k += 4) {
        const dx = seg[k + 2] - seg[k], dy = seg[k + 3] - seg[k + 1];
        const l2 = dx * dx + dy * dy;
        let u = l2 ? ((x - seg[k]) * dx + (y - seg[k + 1]) * dy) / l2 : 0;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        const ex = x - seg[k] - u * dx, ey = y - seg[k + 1] - u * dy;
        const e = ex * ex + ey * ey;
        if (e < best) best = e;
      }
      t[j * TW + i] = Math.sqrt(best) - HW;
    }
  }
  return t;
}

const SDF = [];
for (let d = 0; d <= 9; d++) SDF.push(buildSDF(SKEL[d]));

// ------------------------------------------------------------ layout
//
// Not four digits in a row. The hours are 30 x 50 px — three quarters of the
// glass — high on the left; the minutes are 20.2 x 33.6 px, low on the right;
// the colon is the pivot between them, on the diagonal.

const HS = 1.25, MS = 0.84;             // px per unit, hours and minutes
const HBX = [3, 37], MBX = [78, 101];   // digit box left edges
const HBY = 7, MBY = 23;
const COLX = 74.5, COLY = [31, 43];

const BOX = [];
for (let k = 0; k < 4; k++) {
  const s = k < 2 ? HS : MS;
  const bx = k < 2 ? HBX[k] : MBX[k - 2], by = k < 2 ? HBY : MBY;
  BOX.push({
    s, bx, by, big: k < 2,
    K: 1 / (s * STEPU), G0: MARG / STEPU,
    x0: bx - (MARG - 1) * s, x1: bx + (UNITS_W + MARG - 1) * s,
    y0: by - (MARG - 1) * s, y1: by + (UNITS_H + MARG - 1) * s,
    beta: k < 2 ? 2.5 : 1.4,
    smax: HW * s + 3.6,
  });
}

const HALO = 4.2;                        // px of dark calm round the hours
const HALO_M = 4.0;                      // and a tighter pocket round the minutes
const LC = 0.5;                          // the filament level of the field

// Dev only: renders the ten digits as a bare sheet, for judging the
// letterforms as field contours (out/plasma-digits.png). Off in the face.
const DEV_SHEET = false;

// ------------------------------------------------------------ the turn
//
// S(t) is the level sweep: it rises to dissolve a digit into the plasma and
// falls to condense the next one out. The old digits go before the new ones
// start, so a slot shows a whole digit, plasma, or a whole digit, never a
// mixture of two times.

const MIN = { o0: -0.95, o1: -0.42, i0: 0.12, i1: 0.78, stag: 0.09 };
const HR = { o0: -1.85, o1: -1.15, i0: 0.24, i1: 1.45, stag: 0.17 };

const digits = (c) => c.hh + c.mm;

// The field's own phases, one set per term: reduced mod 2*pi each frame so
// the per-pixel arguments stay small (and the sine table stays accurate).
const P = { a: 0, b: 0, c: 0, d: 0, e: 0, w1: 0, w2: 0, w3: 0, w4: 0 };
function setPhases(tt, surge) {
  const red = (u) => u - TAU * Math.floor(u / TAU);
  P.a = red(tt * 0.61 + surge);
  P.b = red(tt * 0.47 - surge * 1.3);
  P.c = red(tt * 0.83 + surge * 0.8);
  P.d = red(tt * 0.71 - surge * 1.1);
  P.e = red(tt * 0.55 + surge * 1.6);
  P.w1 = red(tt * 0.23 + surge * 0.5);
  P.w2 = red(tt * 0.31 - surge * 0.7);
  P.w3 = red(tt * 0.19 + surge * 0.9);
  P.w4 = red(tt * 0.27 - surge * 0.4);
}

/**
 * The field: a domain-warped sum of sines, in [0, 1]. The warp is a second
 * copy of the same idea pushing the sample point, so the bands fold and
 * swirl instead of sliding past.
 */
function boil(x, y) {
  const wx = 11 * fsin(y * 0.040 + P.w1) + 5 * fsin(y * 0.096 + P.w2);
  const wy = 11 * fsin(x * 0.033 + P.w3) + 5 * fsin(x * 0.084 + P.w4);
  const X = x + wx, Y = y + wy;
  const dx = X - 56, dy = Y - 30, r = Math.sqrt(dx * dx + dy * dy);
  return 0.5 + 0.145 * (fsin(X * 0.115 + P.a) + fsin(Y * 0.161 + P.b)
    + fsin((X * 0.8 + Y) * 0.083 + P.c) + fsin(r * 0.095 + P.d)
    + 0.8 * fsin((X - 0.6 * Y) * 0.072 + P.e));
}

export default {
  name: 'Plasma',
  blurb: 'Domain-warped plasma: the numerals are the bright level set of the boil, swelling with it and condensing out of it at every minute.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    const tt = date.getTime() / 1000 - 1.7e9;
    const sec = f.sec;
    const [ox, oy] = orbit(date, 3, 3);

    // --- which minute is which, and how far into the turn we are
    const u = sec >= 30 ? sec - 60 : sec;         // -30 .. 30, 0 = the turn
    const late = u < 0;
    const before = late ? f : previousMinute(date);
    const after = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const big = after.m === 0;
    const T = big ? HR : MIN;
    const DA = digits(before), DB = digits(after);

    // The hour's surge: the field's own phases take a shove through :00.
    const surge = big ? 1.35 * Math.exp(-(u * u) / 0.6) : 0;
    const bloom = 1 + (big ? 0.5 * Math.exp(-(u * u) / 0.5) : 0);
    setPhases(tt, surge);

    // --- dev sheet: the ten digits as bare field contours
    if (DEV_SHEET) {
      const S0 = 0.8, GG = 1 / (S0 * STEPU), G0 = MARG / STEPU, beta = 2.4;
      g.fillWhere((px, py) => {
        const Aq = boil(px, py), ad = Aq - LC, aa = ad < 0 ? -ad : ad;
        let e = 1e9, hit = 0;
        for (let d = 0; d < 10; d++) {
          const gx = (px - (4 + 19.2 * (d % 5))) * GG + G0;
          const gy = (py - (d < 5 ? 1 : 33)) * GG + G0;
          const i = gx | 0, j = gy | 0;
          if (i < 0 || j < 0 || i > TW - 2 || j > TH - 2) continue;
          const fx = gx - i, fy = gy - j, o = j * TW + i, t = SDF[d];
          const c0 = t[o] + (t[o + 1] - t[o]) * fx, c1 = t[o + TW] + (t[o + TW + 1] - t[o + TW]) * fx;
          const ee = (c0 + (c1 - c0) * fy) * S0 + beta * ad;
          if (ee < e) e = ee;
          if (ee < 0) hit = 1;
        }
        const fq0 = Aq * 4;
        let q0 = fq0 - Math.floor(fq0);
        if (q0 > 0.5) q0 = 1 - q0;
        let f0 = 1 - q0 / 0.14; f0 = f0 > 0 ? f0 : 0;
        let h0 = (Aq - 0.55) * 2; h0 = h0 < 0 ? 0 : h0 > 1 ? 1 : h0;
        let v = (0.85 * f0 + 0.17 * h0) * sm((e + 0.5) / 3.0);
        if (hit) v = 1;
        return v;
      });
      oled.contrast(0xff);
      return;
    }

    // --- the four digits, each with its presence this instant (0..1)
    const slots = [];
    for (let k = 0; k < 4; k++) {
      const b = BOX[k];
      const chg = DA[k] !== DB[k];
      let p = 1;
      if (chg) {
        const st = k * T.stag;
        p = u < 0
          ? 1 - sm((u - (T.o0 + st)) / (T.o1 - T.o0))
          : sm((u - (T.i0 + st)) / (T.i1 - T.i0));
      }
      slots.push({
        tab: SDF[+((u < 0 ? DA : DB)[k])], b, p,
        soff: (1 - p) * b.smax,
        px0: b.bx + ox, py0: b.by + oy,
      });
    }
    // The colon is a level set too: two beads of the field, breathing with it
    // and pulsing once a second.
    const cP = big ? 1 - sm((u - T.o0) / (T.o1 - T.o0)) : 1;
    const pulse = 0.5 + 0.5 * fcos(TAU * sec);

    g.fillWhere((px, py) => {
      const Aq = boil(px, py);
      const ad = Aq - LC, aa = ad < 0 ? -ad : ad;

      // The digits: edge = d + beta*(A - L) + S, lit where it is negative.
      let eH = 1e9, eM = 1e9, pH = 1, pM = 1, hitH = 0, hitM = 0;
      for (let k = 0; k < 4; k++) {
        const sl = slots[k], b = sl.b;
        if (px < b.x0 + ox || px > b.x1 + ox || py < b.y0 + oy || py > b.y1 + oy) continue;
        const gx = (px - sl.px0) * b.K + b.G0, gy = (py - sl.py0) * b.K + b.G0;
        const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, o = j * TW + i, t = sl.tab;
        const c0 = t[o] + (t[o + 1] - t[o]) * fx, c1 = t[o + TW] + (t[o + TW + 1] - t[o + TW]) * fx;
        const e = (c0 + (c1 - c0) * fy) * b.s + b.beta * ad + sl.soff * (0.8 + 0.4 * Aq);
        if (b.big) { if (e < eH) { eH = e; pH = sl.p; } if (e < 0) hitH = 1; }
        else { if (e < eM) { eM = e; pM = sl.p; } if (e < 0) hitM = 1; }
      }
      // The colon, folded into the same "hour" edge so it gets the calm too.
      {
        const r = 3.1 + 2.1 * ad + 0.6 * (pulse - 0.5);
        const d0 = Math.hypot(px - COLX - ox, py - COLY[0] - oy) - r + (1 - cP) * 9;
        const d1 = Math.hypot(px - COLX - ox, py - COLY[1] - oy) - r + (1 - cP) * 9;
        const e = d0 < d1 ? d0 : d1;
        if (e < eH) { eH = e; pH = cP; }
        if (e < 0) hitH = 1;
      }

      // The plasma is pressed flat round every glyph: a dark eye round the
      // hours, a tight pocket round the minutes, both opening as the digit
      // dissolves into the boil.
      let calm = 1 - pH * (1 - sm((eH + 0.5) / HALO));
      const cm = 1 - pM * (1 - sm((eM + 0.5) / HALO_M));
      if (cm < calm) calm = cm;

      // The field itself: its level lines, drawn as a topographic net. Same
      // field the digits are a level set of.
      const fq = Aq * 4;
      let q2 = fq - Math.floor(fq);
      if (q2 > 0.5) q2 = 1 - q2;
      let fil = 1 - q2 / 0.14; fil = fil > 0 ? fil : 0;
      // The field's hot ground: a wash that is truly black below its level,
      // so the glass really is dark where the plasma is cold (no pixel burns
      // because a constant grey kept it faintly on all day).
      let hot = (Aq - 0.55) * 2.0; hot = hot < 0 ? 0 : hot > 1 ? 1 : hot;
      let v = (0.85 * fil + 0.17 * hot) * calm * bloom;
      // The hours are solid; the minutes are woven from the same lines that
      // run through the boil around them, only denser.
      if (hitH) v = 1;
      else if (hitM) { const w = 0.92 + 0.08 * fil; if (w > v) v = w; }
      return v;
    });

    oled.contrast(0xcf + (0x14 - 0xcf) * night);
  },
};
