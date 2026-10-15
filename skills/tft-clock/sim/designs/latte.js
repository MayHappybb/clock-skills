// Latte: two coffees seen from above on a walnut table, a cappuccino for the
// hours and a smaller flat white for the minutes, and the time is the latte
// art. Every numeral is poured foam: a rosetta stroke bent into the digit,
// white microfoam stacked in leaves, each leaf parted from the next by a
// notch of crema that runs in from the edge to the white spine (the
// pull-through), the stroke scalloped where the leaves bulge. A stroke
// with a free start begins in a heart, the way a rosetta begins, so the
// digits' ball terminals are hearts. A dark espresso keyline (the crema the
// milk pushed aside) rings the foam.
//
// The time is alive: the rosetta never stops being poured. The leaves flow
// along every stroke away from its heart, and on each beat the cup is
// tapped on the table: the leaves surge forward a leaf, a swell runs down
// each stroke from heart to tail, the hearts beat (lub-dub) and a ring of
// crema ripples in from the rim (a trough, then a crest); the foam bobs a
// pixel on the tap and drifts to and fro with the liquid. The crema itself
// turns slowly with its tiger flecks. Every 15 s a flourish: at :15 and :45 the barista's etching
// pick draws the pull-through down each digit in turn (a fine crema line
// along its spine that heals back into the foam), at :30 the window's sheen
// slides across both cups.
//
// Minute turn: from :57 the cup is swirled, winding the crema into a spiral
// that relaxes over the next half minute; from :58 the changing digit is
// stirred: a vortex winds the
// old foam into a spiral while it mixes into the crema and is thrown away
// evenly (gone by :59.75). After :00 the milk sinks in first, so the whole
// new digit shows pale through the crema at once, then the pitcher pours
// it: a stream draws the foam along the stroke from the heart, leaves
// stacking behind it. Hour: the swirl is two and a half times harder, and
// from :00.35 to :03.4, while the new time is poured, a swan is poured in
// each cup behind it, wing leaves stacking round the rim and the neck pulled
// up into a heart-head with a beak, the two swans facing each other over the
// gap; from :08 they sink back into the crema, gone by :11.5.
//
// Palette, flat as a latte photo seen from above: crema in four caramel
// tones and an espresso ring, microfoam white, rib tan, the espresso
// keyline, teal glazed cups and saucers on dark walnut. No shading: one
// flat crescent of light on each cup's lip, flat shadows. The foam is the
// strongest contrast on the glass; the crema mottle is a few close tones.
// Night: the table and glaze sink nearly to black, the crema darkens, the
// foam stays warm cream, and the backlight dims to 50 %.
//
// Cost: the set (table, saucers, cups) is drawn into a buffer when the
// palette changes (boot and the 16 steps of the night fades; billed to that
// frame, ~9 ms on esp32c3) and copied per frame; the crema is a rotated table lookup
// per surface pixel; each digit is a few integer compares per pixel of its
// box against precomputed tables (latte-glyphs.js).

import { clockFields, ease, progress, clamp, sin, cos } from '../js/kit.js';
import { buildSet, pathAt } from './latte-glyphs.js';
import { W, H, CUPS, SIZES, palette, drawSet, TEX, TEX_N, SURF, newBg } from './latte-scene.js';
import { SWANS, swanPaint } from './latte-swan.js';

const SETS = SIZES.map(buildSet);

// ------------------------------------------------------------ tables shared by all digits

// the rosetta's leaves: 6 per 32 px; RIB marks the crema rib, SCAL the leaf's bulge (1/8 px)
const RIB = new Uint8Array(256), SCAL = new Int8Array(256);
for (let i = 0; i < 256; i++) {
  const p = (i % (256 / 6)) / (256 / 6);
  RIB[i] = p < 0.24 ? 1 : 0;
  SCAL[i] = Math.round(7 * Math.sin(Math.PI * Math.min(1, p / 0.95)) - 1);
}
const PULSE = new Int8Array(256);          // the swell running down the strokes, per arc px
const BUMP = Int8Array.from({ length: 32 }, (_, i) => Math.round(4.5 * Math.exp(-(((i - 16) / 5.5) ** 2))));
const KEY8 = 11;                            // the keyline's outer edge, 1/8 px outside the foam

// the vortex of the minute turn: radius of every offset in a square round the digit's centre
const RV = 27, SQ = 2 * RV;
const RSQ = new Uint8Array(SQ * SQ);
for (let y = 0; y < SQ; y++) for (let x = 0; x < SQ; x++) RSQ[y * SQ + x] = Math.min(255, Math.round(Math.hypot(x + 0.5 - RV, y + 0.5 - RV)));
const VC = new Int16Array(64), VS = new Int16Array(64);

// ------------------------------------------------------------ timing

const SW0 = 58.0, SW1 = 59.75;               // the stir
const POUR_T0 = 0.18, POUR_STEP = 0.62, POUR_DUR = 0.9;
const ETCH = [15, 45], ETCH_STEP = 0.95;
const SHEEN0 = 30, SHEEN_DUR = 2.4;

let BG = null, BG_KEY = -1, P = null;

export default {
  name: 'Latte',
  blurb: 'Two coffees from above: the time is poured latte art, rosetta digits with hearts that beat as the cups are tapped; each minute the old digit is stirred away and a new one poured.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * nt);
    const key = Math.round(nt * 16);
    if (key !== BG_KEY || !BG) {
      P = palette(nt);
      BG = BG || newBg();
      for (const k in BG.cost) BG.cost[k] = 0;
      drawSet(BG, P);
      BG_KEY = key;
      // the redraw is real work on the device: bill it to this frame
      for (const k in BG.cost) g.cost[k] += BG.cost[k];
    }
    const C = P.c, buf = g.buf;
    buf.set(BG.buf); g.cost.px += W * H;

    const T = (ctx.date.getTime() % 86400000) / 1000;
    const nb = Math.floor(T), pb = T - nb;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;
    const hourNext = nxt.h !== f.h;

    // ---- the cup's motion: a slow turn, swirled harder over the turn (and the hour)
    // the swirl winds the crema into a spiral over the turn, then slowly relaxes (much harder at the hour)
    const big = hourNext || hourShow ? 2.6 : 1;
    const wind = big * 5.5 * (s >= 57 ? ease.inOutQuad(progress(s, 57, 60.4)) : s < 0.4 ? ease.inOutQuad(progress(s + 60, 57, 60.4)) : 1 - ease.inOutQuad(progress(s, 0.4, 30)));
    const ang = T * ((2 * Math.PI) / 95) + big * 0.8 * (s >= 57 ? ease.inOutQuad(progress(s, 57, 60)) : 1 + ease.outCubic(progress(s, 0, 3)));
    const ripR = pb < 0.75 ? 1 - pb / 0.75 : -1;
    const sheen = s >= SHEEN0 && s < SHEEN0 + SHEEN_DUR ? -30 + 230 * ease.inOutQuad((s - SHEEN0) / SHEEN_DUR) : -999;
    for (let c = 0; c < 2; c++) crema(g, c, ang + c * 2.1, wind, ripR, sheen);

    // ---- the hour's swans, behind the time
    const swanAt = [null, null];
    if (hourShow) for (let c = 0; c < 2; c++) swanAt[c] = swanPaint(g, SWANS[c], s, C);

    // ---- the beat: leaves surge, the swell runs, the hearts beat
    const surge = ease.outCubic(Math.min(1, pb / 0.42));
    const ph = Math.round(8 * (1.5 * T + 3.6 * (nb + surge))) & 255;
    const pc = Math.round(pb * 140), pa = Math.round(16 * (1 - pb));
    for (let i = 0; i < 256; i++) { const e = i - pc + 16; PULSE[i] = e >= 0 && e < 32 ? (BUMP[e] * pa) >> 4 : 0; }
    g.cost.box += 256 * 2;
    const lub = pb < 0.1 ? sin((pb / 0.1) * Math.PI) : pb > 0.18 && pb < 0.3 ? 0.6 * sin(((pb - 0.18) / 0.12) * Math.PI) : 0;
    const heartGrow = Math.round(6 * lub);
    const jolt = pb > 0.03 && pb < 0.13 ? 1 : 0;

    // ---- the four digits and their jobs
    const etch = etchState(s);
    let tip = null;
    for (let i = 0; i < 4; i++) {
      const c = i >> 1, Cp = CUPS[c], S = SETS[c];
      // the foam floats: each cup's art drifts a pixel to and fro with the liquid
      const drift = Math.round(0.95 * sin(T * 1.25 + c * 2.3));
      const X0 = Cp.cells[i & 1] - S.pad + drift, Y0 = Cp.cellY - S.pad + jolt;
      if (s >= SW0 && cur[i] !== nw[i]) {
        stir(g, S, S.glyphs[+cur[i]], X0, Y0, (s - SW0) / (SW1 - SW0), C);
        continue;
      }
      let pour = -1;
      if (old[i] !== cur[i]) {
        // pours in each cup run left to right; the milk shows through first
        const j = (i & 1) && old[i - 1] !== cur[i - 1] ? 1 : 0;
        pour = s < 4 ? (s - POUR_T0 - j * POUR_STEP) / POUR_DUR : 2;
        if (pour < 1.5) { pourDigit(g, S, S.glyphs[+cur[i]], X0, Y0, s, pour, ph, heartGrow, C); continue; }
      }
      const G = S.glyphs[+cur[i]], eh = etch ? ETCH_U[i] : -1;
      digit(g, S, G, X0, Y0, ph, heartGrow, -1, eh, C);
      // the pick rides the head of the pull-through while it is drawing
      if (eh >= 0 && eh < G.len * 8) {
        const [hx, hy] = pathAt(G, eh / 8), a = Math.min(1, eh / 40, (G.len * 8 - eh) / 40);
        tip = [X0 + hx, Y0 + hy, a];
      }
    }
    if (tip) pick(g, tip[0], tip[1], tip[2], C);
    for (const q of swanAt) if (q) stream(g, q[0], q[1], 2.0);
  },
};

// ------------------------------------------------------------ the crema

function crema(g, c, ang, wind, ripR, sheen) {
  const Cp = CUPS[c], rows = SURF[c], buf = g.buf, C = P.c;
  const TONE = [C.cremaD, C.cremaM, C.cremaL, C.cremaXL];
  // the swirl: the crema turns slowly, and faster near the middle while the cup is swirled (a spiral)
  const nR = Math.ceil(Cp.Rin * 4) + 1, R4 = Cp.Rin * 4;
  for (let r = 0; r < nR; r++) {
    const q = 1 - r / R4, a = ang + wind * q * q;
    SW_C[r] = Math.round(cos(a) * 256); SW_S[r] = Math.round(sin(a) * 256);
  }
  g.cost.box += nR * 30;
  const rimR4 = Math.round((Cp.Rin - 2.3) * 4), rr4 = ripR >= 0 ? Math.round(ripR * (Cp.Rin - 1) * 4) : -99;
  const rr4b = ripR >= 0 ? Math.round(clamp(ripR + 0.12, 0, 1) * (Cp.Rin - 1) * 4) : -99;
  let n = 0;
  for (const row of rows) {
    const y = row.y, dy = y - Cp.cy, xa = row.xa, rad = row.rad;
    const o = y * W;
    for (let x = xa, dx = xa - Cp.cx; x < row.xb; x++, dx++) {
      const r4 = rad[x - xa];
      let col;
      if (r4 >= rimR4) col = C.espresso;
      else {
        const ca = SW_C[r4], sa = SW_S[r4];
        let t = TEX[(((sa * dx + ca * dy) >> 8) + 48) * TEX_N + ((ca * dx - sa * dy) >> 8) + 48];
        // the tap's wave running in from the rim: a trough, then a crest
        const dr = r4 - rr4, db = r4 - rr4b;
        if (dr > -4 && dr < 4) { if (t > 0) t--; } else if (db > -4 && db < 4) t++;
        const q = x + (y >> 1) - sheen;
        if (q >= 0 && q < 9 && t < 3) t++;
        col = TONE[t];
      }
      buf[o + x] = col;
    }
    n += row.xb - xa;
  }
  g.cost.px += n; g.cost.box += n * 6;
}
const SW_C = new Int16Array(160), SW_S = new Int16Array(160);

// ------------------------------------------------------------ a digit at rest

/**
 * One digit from its tables. `pourU` (1/8 px): foam only up to that arc
 * length, the rest shows as the milk under the crema (-1: all foam). `etchU`
 * (1/8 px): the pick's pull-through has reached there (-1: none).
 */
function digit(g, S, G, X0, Y0, ph, heartGrow, pourU, etchU, C) {
  const buf = g.buf, bw = S.bw, bh = S.bh, D = G.D, V = G.V, U = G.U, HD = G.HD;
  const HW8 = Math.round(S.hw * 8), FAR = HW8 + 5 + 5 + KEY8;
  let n = 0;
  for (let by = 0; by < bh; by++) {
    const y = Y0 + by;
    if (y < 0 || y >= H) continue;
    const ko = by * bw, o = y * W + X0;
    for (let bx = 0; bx < bw; bx++) {
      const k = ko + bx, d = D[k], hd = HD[k] - 128 - heartGrow;
      if (d >= FAR && hd >= KEY8) continue;
      n++;
      const v = (V[k] - ph) & 255;
      let sd = d - HW8 - SCAL[v] - PULSE[U[k] >> 3];
      const heart = hd < sd;
      if (heart) sd = hd;
      if (sd >= KEY8) continue;
      let col;
      if (pourU >= 0 && U[k] > pourU) {
        if (sd >= 0) continue;
        col = C.ghost2;
      } else if (sd >= 4) col = C.key;
      else if (sd >= -3) col = C.edge;
      else if (heart) col = sd > -22 && sd < -13 ? C.rib : C.foam;
      else {
        // the rosetta: crema notches between the leaves, the spine (the pull-through) stays white
        col = RIB[v] && d > 7 ? C.cremaM : C.foam;
        if (etchU >= 0 && d < 5) {
          const age = etchU - U[k];             // how long ago the pick passed, in 1/8 px of its travel
          if (age >= 0) col = age < HEAL_A ? C.key : age < HEAL_B ? C.rib : col;
        }
      }
      buf[o + bx] = col;
    }
  }
  g.cost.box += bw * bh + n * 6;
}

// ------------------------------------------------------------ the pour

function pourDigit(g, S, G, X0, Y0, s, p, ph, heartGrow, C) {
  // the milk shows through the crema first: the whole digit, pale
  const ghost = s < 0.12 ? 1 : 2;
  if (p <= 0) {
    ghostDigit(g, S, G, X0, Y0, ghost === 1 ? C.ghost1 : C.ghost2);
    return;
  }
  const u = ease.inOutQuad(Math.min(1, p)) * (G.len + 2);
  digit(g, S, G, X0, Y0, ph, p < 1 ? Math.round(heartGrow - 10 * (1 - Math.min(1, p * 4))) : heartGrow, p < 1 ? Math.round(u * 8) : -1, -1, C);
  if (p < 1) {
    // the stream: where the milk falls, a white disc with a ring pushed out round it
    const [hx, hy] = pathAt(G, u);
    stream(g, X0 + hx, Y0 + hy, S.hw * 0.8);
  }
}

/** Where the milk falls: a white disc in a dark ring, a ring of crema pushed out round it. */
function stream(g, x, y, r) {
  g.ring(x, y, r + 1.4, r + 2.2, P.rgb.cremaXL, { aa: true, a: 0.8 });
  g.fillCircle(x, y, r + 0.8, P.rgb.key, { aa: true });
  g.fillCircle(x, y, r, P.rgb.foam, { aa: true });
}

function ghostDigit(g, S, G, X0, Y0, col) {
  const buf = g.buf, bw = S.bw, bh = S.bh, D = G.D, HD = G.HD, HW8 = Math.round(S.hw * 8);
  for (let by = 0; by < bh; by++) {
    const y = Y0 + by;
    if (y < 0 || y >= H) continue;
    const ko = by * bw, o = y * W + X0;
    for (let bx = 0; bx < bw; bx++) {
      const k = ko + bx;
      if (D[k] < HW8 || HD[k] < 128) buf[o + bx] = col;
    }
  }
  g.cost.box += bw * bh * 2;
}

// ------------------------------------------------------------ the stir

/** The old digit wound into a spiral by a vortex at its centre, mixing in and thrown away by rank. */
function stir(g, S, G, X0, Y0, p, C) {
  if (p >= 1) return;
  const e = ease.inOutQuad(p), TH = 9 * e;
  for (let r = 0; r < 64; r++) {
    const th = TH / (1 + (r / 7) * (r / 7));
    VC[r] = Math.round(cos(th) * 256); VS[r] = Math.round(sin(th) * 256);
  }
  g.cost.box += 64 * 30;
  const q = Math.round(ease.inQuad(progress(p, 0.18, 1)) * 262);     // the rank below which material is gone
  const col = p < 0.4 ? C.foam : p < 0.7 ? C.rib : C.latte;
  const buf = g.buf, bw = S.bw, bh = S.bh, D = G.D, HD = G.HD, RK = S.rank, HW8 = Math.round(S.hw * 8);
  const cx = X0 + (bw >> 1), cy = Y0 + (bh >> 1);
  for (let yy = 0; yy < SQ; yy++) {
    const y = cy - RV + yy;
    if (y < 0 || y >= H) continue;
    const dy = yy - RV;
    for (let xx = 0; xx < SQ; xx++) {
      const dx = xx - RV, r = RSQ[yy * SQ + xx];
      if (r >= RV) continue;
      const c = VC[r], sn = VS[r];
      const bx = (bw >> 1) + ((c * dx + sn * dy) >> 8), by = (bh >> 1) + ((c * dy - sn * dx) >> 8);
      if (bx < 0 || by < 0 || bx >= bw || by >= bh) continue;
      const k = by * bw + bx;
      if (RK[k] < q) continue;
      if (D[k] < HW8 || HD[k] < 128) buf[y * W + cx - RV + xx] = col;
    }
  }
  g.cost.box += SQ * SQ * 5;
}

// ------------------------------------------------------------ the etching pick

const ETCH_V = 110;                          // the pick's speed along the spine, px/s
const HEAL_A = Math.round(0.3 * ETCH_V * 8), HEAL_B = Math.round(1.2 * ETCH_V * 8);
const ETCH_U = new Int32Array(4);

/** Where the pick's pull-through has reached in each digit (1/8 px, -1: none), and where the pick is. */
function etchState(s) {
  ETCH_U.fill(-1);
  let tip = null;
  for (const t0 of ETCH) {
    const t = s - t0;
    if (t < 0 || t > 3 * ETCH_STEP + 3) continue;
    for (let i = 0; i < 4; i++) {
      const lt = t - i * ETCH_STEP;
      if (lt < 0) continue;
      ETCH_U[i] = Math.round(lt * ETCH_V * 8);
      if (ETCH_U[i] > 8 * (300 + HEAL_B)) ETCH_U[i] = -1;
    }
    tip = { t };
  }
  return tip;
}

function pick(g, x, y, a, C) {
  // the steel pick, held from the lower right, its point on the foam
  const ex = x + 9, ey = y + 7;
  g.thickLine(x + 1, y + 1.2, ex + 1, ey + 1.2, 1.6, P.rgb.key, { aa: true, a: 0.45 * a });
  g.thickLine(x, y, ex, ey, 1.5, P.rgb.steel, { aa: true, a });
  g.fillCircle(x, y, 0.9, P.rgb.steelD, { aa: true, a });
}
