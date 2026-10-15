// Pinscreen: the glass is a pin-art board, the Alexeieff-Parker pinscreen
// of 1930s animation and the pin toy on an office desk: 53 x 26 pins, one
// every 3 px, pushed from behind. A pin's depth is shown the 1-bit way, by
// its head and its shadow only: a pulled-back pin is lost in the dark, a
// pin flush with the board is a 1-px glint, further out its head catches
// more light (4, then 6 px), and a pin pushed right out to the plate fills
// its 3 x 3 cell but for one dark pixel, so a raised numeral reads as a solid plate with
// the board's pitch still showing in it. Light rakes in from the upper left;
// every pin casts a flat diagonal shadow down-right, as long as it stands
// proud of the pins below it, and a pin in shadow goes dark. No ramps: dot
// size and shadow length are the only depth cues.
//
// The time is pressed into the pins: the hours as a tall relief at the
// left, the minutes lower and smaller at the right, each numeral a plateau
// drawn pin by pin (pinscreen-glyphs.js) with a moat of pulled-back pins
// round it and its own cast shadow. Behind them, the quietest layer: a scene
// pressed into the bare board in its two lowest levels only (every pin
// flush, or every other pin pulled back), a new one each hour: hills under
// a sun, a crescent moon and stars, seigaiha waves, a sunburst.
//
// Always alive: wind runs over the free pins, narrow slanted crests of
// 4-px heads travelling left to right about four pins a second, in gusts
// (a sharpened sine of height, so pins rise and fall a step at a time). Three times a minute something is
// pressed in from behind in the open field at the top right (a key, a
// scallop shell, a toy car, a comb): its pins push out from the middle,
// hold, and sink back pin by pin over a few seconds.
//
// Minute turn: from :58.4 every pin of a changing numeral sinks together, a
// step at a time (the same shape all the way down, gone by :59.6). After :00
// a fingertip presses from behind: it slides down the board as a raised
// capsule of pins to the empty slot, the new numeral's outline punches out
// of it, then its face fills, the moat
// pulls back round it, and the plate rings: it overshoots (its holes close
// and its shadow lengthens), settles, and a ripple runs out over the board.
// Hour: the board is swept and reset. From :56.8 a roller wave of pins runs
// left to right, lifting everything it passes (the standing numerals throw
// long shadows as it goes under them) and leaving the board flat behind it;
// after :00 a second wave runs back right to left pressing the next hour's
// scene in behind it, with wavelets settling in its wake. The hours never
// leave: only digits that change sink and rise, as in any minute.
//
// Colour: pin-head silver #e4e6ea on deep charcoal #202428, the only two
// values on the glass, all day: polished steel heads catching light over the
// dark board behind them, exactly what the toy looks like under a desk lamp.
// Night dims the backlight only.
//
// Cost: one integer pass over the 1,378 pins (a table sine for the wind,
// the scene, the digit plates, a shadow recurrence, an ordered-dither
// threshold), then each lit pin stamps its head pattern (<= 9 stores);
// the finger and the ring add a few hundred pins in a turn. Nothing is
// drawn outside the canvas. Flash: scenes 4 x 1,378 B, glyph maps
// 10 x (16 x 26 + 13 x 19) x 2 B, wind phase 1,378 x 4 B, slot ripple
// distances 4 x 1,378 x 4 B, things < 1 KB: ~48 KB. RAM: three 1,378-pin
// Int16 maps and a byte map, under 10 KB.

import { clockFields, sin, hash, rand, noise, to565 } from '../js/kit.js';
import { COLS, ROWS, N, Q, SCENES, FLAT, WIND_PH, THINGS } from './pinscreen-art.js';
import { HOUR_GLYPHS, MIN_GLYPHS, HOUR_W, HOUR_H, MIN_W, MIN_H } from './pinscreen-glyphs.js';

const W = 160, P = 3, OX = 1, OY = 1;
const INK = to565(0xe4e6ea), GND = to565(0x202428);
const FULL = 5 * Q;            // a numeral's plate: level 5, the holed plate
const SLOPE = 48;              // shadow drop per pin, Q (1.5 levels)

// ------------------------------------------------------------ head patterns
// Pixels lit in a pin's 3 x 3 cell at each level. Nested, so a pin growing
// one step only adds pixels; the dark side is always bottom-right.
const PATS = [
  [],
  [[1, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
].map((p) => Int16Array.from(p.map(([x, y]) => y * W + x)));

// A light 4 x 4 ordered dither over pins (thresholds in Q, a third of a
// level wide): contours of the wind and the domes stay crisp bands, with a
// little stipple where they cross a level.
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => 11 + ((v * 2 + 1) * 5 >> 4) * 2);

const BAYF = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

// ------------------------------------------------------------ slots
const SLOTS = [
  { c: 1, r: 2, G: HOUR_GLYPHS, w: HOUR_W, h: HOUR_H },
  { c: 15, r: 2, G: HOUR_GLYPHS, w: HOUR_W, h: HOUR_H },
  { c: 31, r: 9, G: MIN_GLYPHS, w: MIN_W, h: MIN_H },
  { c: 42, r: 9, G: MIN_GLYPHS, w: MIN_W, h: MIN_H },
];
for (const S of SLOTS) {
  // the fingertip that presses a new numeral out from behind: a capsule
  // coming down from the top edge, its round end over the slot's middle
  S.fx = S.c + S.w / 2; S.fr = S.w / 2 - 0.2; S.fty = S.r + S.h * 0.52;
  // distance of every pin from the slot's middle, for the ripple
  const dist = new Float32Array(N), mx = S.c + S.w / 2, my = S.r + S.h / 2;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) dist[j * COLS + i] = Math.hypot(i + 0.5 - mx, (j + 0.5 - my) * 1.2);
  S.dist = dist;
}

// wind: a narrow crest every ~17 pins, slanted, travelling right ~4 pins a second
const WIND_BASE = new Float32Array(N);
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) WIND_BASE[j * COLS + i] = 0.36 * (i + 0.5 * j) + WIND_PH[j * COLS + i] / 1000;

const HT = new Int16Array(N), SH = new Int16Array(N), CREST = new Int16Array(N), PLATE = new Uint8Array(N);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// ------------------------------------------------------------ the numerals' timeline
const SINK0 = 59.0, SINK = 0.85;         // sunk into the board by :59.6, flat by :59.85
const RISE_END = 4, FINGER_END = 1.5;

/**
 * Plate heights for a slot this frame: { d, hO, hI, moat, tip, ring }.
 * tip: where the fingertip's round end is (pin rows), -99 when no finger;
 * ring: seconds since the plate rang, or -1.
 */
function slotState(k, s, cur, nxt, prv, out) {
  out.d = +cur[k]; out.tip = -99; out.ring = -1;
  let hO = FULL, hI = FULL;
  if (s >= SINK0 && nxt[k] !== cur[k]) {
    const u = smooth((s - SINK0) / SINK);
    hO = hI = FULL * (1 - u);
  } else if (s < RISE_END && prv[k] !== cur[k]) {
    // a fingertip slides down behind the board, presses, and lets go
    const S = SLOTS[k];
    if (s < FINGER_END) out.tip = -S.fr + (S.fty + S.fr) * (1 - (1 - clamp01(s / 0.26)) ** 3);
    hO = FULL * smooth((s - 0.2) / 0.2);
    hI = FULL * smooth((s - 0.4) / 0.22);
    if (s > 0.62) {
      const tt = s - 0.62, ov = 1.8 * Q * Math.exp(-tt * 3.5) * sin(tt * 9);
      hO += ov; hI += ov;
      out.ring = tt;
    }
  }
  out.hO = hO | 0; out.hI = hI | 0;
  // the moat stays pulled back until the plate is nearly flush, so a sinking
  // numeral keeps its exact shape down to 1-px heads, then the field closes in
  const mc = (1.5 * Q - hO) * 6;
  out.moat = mc < 0 ? 0 : mc | 0;
}

// ------------------------------------------------------------ pressed things
const EVENTS = [5, 20, 35];
function thingAt(mk, n) {
  let kind = hash(mk, n, 11) % THINGS.length;
  const prevKind = n > 0 ? hash(mk, n - 1, 11) % THINGS.length : hash(mk - 1, 2, 11) % THINGS.length;
  if (kind === prevKind) kind = (kind + 1) % THINGS.length;
  const T = THINGS[kind], hh = hash(mk, n, 12);
  return { T, ox: 28 + (hh % (26 - T.w)), oy: (hh >>> 8) % (8 - T.h), seed: hh };
}

const ST = { d: 0, hO: 0, hI: 0, moat: 0, tip: -99, ring: -1 };

export default {
  name: 'Pinscreen',
  blurb: 'A pin-art board in silver on charcoal: the time is pressed out of the pins in relief, with cast shadows; wind runs over the field, things are pressed in from behind, and a roller wave resets the board each hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const ms = ctx.date.getTime();
    const nx = clockFields(new Date(ms + 60000)), pv = clockFields(new Date(ms - 60000));
    const cur = f.hh + f.mm, nxt = nx.hh + nx.mm, prv = pv.hh + pv.mm;
    const tday = f.h * 3600 + f.m * 60 + s;

    // ---- the hour's roller waves: X is the crest's column, dir +1 erasing, -1 pressing the new scene
    const scene = SCENES[f.h % 4];
    let X = 0, dir = 0;
    if (nx.h !== f.h && s >= 56.8) {
      const u = (s - 56.8) / 3.0;
      X = -8 + 70 * (0.5 * u + 0.5 * smooth(u)); dir = 1;
    } else if (pv.h !== f.h && s < 4.2) {
      if (s < 0.8) dir = 2;                                  // flat board between the waves
      else { const u = (s - 0.8) / 3.2; X = 62 - 74 * (0.5 * u + 0.5 * smooth(u)); dir = -1; }
    }

    // ---- wind
    const gust = 0.55 + 0.5 * noise(tday * 0.13, 3);
    const amp = gust * 1.5 * Q, wt = tday * 1.5;

    // ---- the field: scene (or the sweep), wind
    const CW = 5.5;
    for (let j = 0, c = 0; j < ROWS; j++) {
      const slant = (j - 13) * 0.35;
      for (let i = 0; i < COLS; i++, c++) {
        let base = scene[c], cr = 0;
        if (dir === 2) base = FLAT;
        else if (dir !== 0) {
          const u = (i - X + slant) * dir;               // > 0: ahead of the crest
          if (u < -CW) {
            if (dir > 0) base = FLAT;
            else {
              // behind the pressing wave: the new scene, wavelets settling
              const b = -u - CW;
              base += (0.9 * Q * sin(b * 1.4) * (b < 10 ? 1 - b / 10 : 0)) | 0;
            }
          } else if (u <= CW) {
            const q = u / CW;
            const p2 = (1 - q * q) * (1 - q * q);
            // the free pins swell to 4-px heads (never the plates' density, so
            // no open side of a numeral closes); the plates ride it 3 levels up
            cr = (3 * Q * p2) | 0;
            base = (dir > 0 ? (u < 0 ? FLAT : base) : (u < 0 ? base : FLAT)) + ((1.5 * Q * p2) | 0);
          } else if (dir < 0) base = FLAT;
        }
        CREST[c] = cr;
        const wv = sin(WIND_BASE[c] - wt);
        HT[c] = base + (wv > 0.45 ? (amp * (wv - 0.45) * (wv - 0.45) * 3.3) | 0 : 0);
      }
    }
    g.cost.box += N * 14;

    // ---- things pressed in from behind
    for (let n = 0; n < EVENTS.length; n++) {
      const tt = s - EVENTS[n];
      if (tt < 0 || tt > 10) continue;
      const { T, ox, oy, seed } = thingAt(mk, n);
      for (let y = 0; y < T.h; y++)
        for (let x = 0; x < T.w; x++) {
          const k = y * T.w + x, v = T.v[k];
          if (v < 0) continue;
          const e = clamp01((tt - 0.5 * T.d[k] / 255) / 0.3) * (1 - clamp01((tt - 3.2 - 4.5 * rand(x, y, seed)) / 0.7));
          if (e <= 0) continue;
          const c = (oy + y) * COLS + ox + x;
          if (v === 0) HT[c] = (HT[c] * (1 - e)) | 0;
          else { const hv = (v * e) | 0; if (hv > HT[c]) HT[c] = hv; }
        }
      g.cost.box += T.w * T.h * 10;
    }

    // ---- the numerals: domes and ripples first, then plates and moats
    const states = [];
    for (let k = 0; k < 4; k++) {
      slotState(k, s, cur, nxt, prv, ST);
      states.push({ ...ST });
    }
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], st = states[k];
      if (st.ring >= 0 && st.ring < 2.8) {
        const tt = st.ring, front = tt * 15, a = 1.3 * Q * Math.exp(-tt * 1.1), D = S.dist;
        for (let c = 0; c < N; c++) {
          const r = D[c];
          if (r > front || r < 3) continue;
          HT[c] += (a * sin(r * 1.05 - tt * 16) * (1 - r / 45)) | 0;
        }
        g.cost.box += N * 4;
      }
      if (st.tip > -99) {
        // the finger: a flat-faced capsule, its pins letting go one by one from :00.65
        const R = S.fr, R2 = R * R, tip = st.tip, fx = S.fx, lift = 1.9 * Q;
        const i0 = Math.max(0, (fx - R) | 0), i1 = Math.min(COLS - 1, Math.ceil(fx + R));
        const j1 = Math.min(ROWS - 1, Math.ceil(tip + R));
        for (let j = 0; j <= j1; j++) {
          const dy = j + 0.5 - tip, dy2 = dy > 0 ? dy * dy : 0;
          for (let i = i0; i <= i1; i++) {
            const dx = i + 0.5 - fx, v = 1 - (dx * dx + dy2) / R2;
            if (v <= 0) continue;
            const let_ = clamp01((s - 0.65 - 0.5 * BAYF[((j & 3) << 2) | (i & 3)]) / 0.3);
            const hv = (Q + lift * (v > 0.45 ? 1 : v / 0.45) * (1 - let_)) | 0;
            const c = j * COLS + i;
            if (hv > HT[c]) HT[c] = hv;
          }
        }
        g.cost.box += (i1 - i0 + 1) * (j1 + 1) * 6;
      }
    }
    PLATE.fill(0);
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], st = states[k], Gl = S.G[st.d], m = Gl.m, e = Gl.e, bw = Gl.bw;
      const x0 = S.c - 2, y0 = S.r - 2;
      for (let y = 0; y < Gl.bh; y++) {
        const j = y0 + y;
        if (j < 0 || j >= ROWS) continue;
        for (let x = 0; x < bw; x++) {
          const i = x0 + x;
          if (i < 0 || i >= COLS) continue;
          const kk = y * bw + x, mv = m[kk], c = j * COLS + i;
          if (mv === 1) {
            const hd = (e[kk] ? st.hI : st.hO) + CREST[c];
            if (hd > HT[c]) HT[c] = hd;
            if (hd >= Q) PLATE[c] = 1;       // a numeral's face is never lost in a shadow
          } else if (mv === 2 && HT[c] > st.moat) HT[c] = st.moat;
        }
      }
      g.cost.box += Gl.bw * Gl.bh * 3;
    }

    // ---- light: shadows down-right, then the pin heads
    const buf = g.buf;
    buf.fill(GND);
    g.cost.px += 12800;
    let lit = 0;
    for (let j = 0, c = 0; j < ROWS; j++) {
      const row = (OY + j * P) * W + OX;
      for (let i = 0; i < COLS; i++, c++) {
        const h = HT[c];
        let sh = 0;
        if (i > 0 && j > 0) {
          const ul = c - COLS - 1, a = HT[ul], b = SH[ul];
          sh = (a > b ? a : b) - SLOPE;
        }
        SH[c] = sh;
        if (h < sh && !PLATE[c]) continue;
        let lev = (h + BAY[((j & 3) << 2) | (i & 3)]) >> 5;
        if (lev <= 0) continue;
        if (lev > 6) lev = 6;
        const pat = PATS[lev], o = row + i * P;
        for (let p = 0; p < pat.length; p++) buf[o + pat[p]] = INK;
        lit += pat.length;
      }
    }
    g.cost.px += lit; g.cost.box += N * 12;
  },
};
