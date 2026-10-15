// Kilim: a slit-woven rug on a nomad's ground loom, seen from above, and the
// time is the order it was woven in. The warp runs across the glass from the
// left beam to the right; every weft pass is one column, so the rug grows to
// the right: the start border, the hours (low left), the minutes (high
// right), and at the fell this minute's end panel. A weaver can only unpick
// from the fell, so to change a digit the rug must be unravelled back to it:
// a new minute unpicks one numeral, ten minutes two, and a new hour the whole
// field, which is then rewoven in the next hour's dyes.
//
// Numerals (kilim-glyphs.js): kilim motifs on the loom's grid (a cell is two
// warps by two passes): every curve a stepped 45-degree lozenge, latch-hook
// terminals (the 1's flag, the 2's and 3's ends, the 6's and 9's stems, the
// 7's top, upturned feet), a göz (eye) lozenge in every closed counter, a
// weld contour band and a walnut keyline, and slits: where colours meet
// along a warp the cloth opens a dark gap (horizontal edges on this loom).
// The field is a calm second layer: a stepped lattice with a lozenge
// medallion in each diamond, in the ground's two near tones.
//
// Always alive: through the minute the end panel is slit-woven pass by pass,
// each colour area by its own butterfly of yarn moving along its stretch
// (you see the lozenge chain build up step by step); the kirkit comb sweeps
// the fell and beats each pass in; the shed stick and heddle hold the bare
// warp. A soft band of light from the tent door drifts across the wool
// every 26 s, flat: the lit pixels take their own dye's lifted tone through
// an ordered dither, no shading. Minute turn: from ~:58 the weft is pulled out column by column back
// to the changed numeral, the slack thread winding onto the yarn ball;
// after :00 the passes are laid again left to right with the comb beating
// behind them. Old digits only leave before :00, new ones only arrive after.
// Hour: the whole field unravels (the hours last, just before :00), the old
// ball rolls away, a ball of the new dye rolls in, and the field is rewoven
// at speed in the new colourway, the hours first.
//
// Palette: natural dyes, flat, two tones each for the weave's pip (the weft
// over and under alternate warps) and a few passes of abrash (another dye
// lot): madder, indigo, walnut, green (weld over indigo) and aubergine
// (madder over indigo) grounds by hour, deep indigo and aubergine at night
// so the undyed ivory numerals are what glows; weld for borders and eyes.
// Hard pixels for the cloth (it is a grid), AA only for the tools and yarn.
//
// Cost: a copy of this minute's rug (built once a minute from a material
// map: 12,800 px through two 2-tone palettes, plain and lit, charged to that
// frame), the light band (~2,900 px of compare-and-copy), bare warp over
// unwoven columns, and a few AA tools. Flash: the layout map 12.8 KB, ten
// glyph sprites 10 x 28 x 40 B = 11.2 KB, palettes < 1 KB. RAM on the
// device: the rug and its lit copy, 2 x 25.6 KB.
import { clockFields, to565, from565, clamp, noise, sin, cos, TAU } from '../js/kit.js';
import { GLYPHS, SW, SH, MX, MY, M_BODY, M_KEY, M_SLIT, M_BAND } from './kilim-glyphs.js';

const W = 160, H = 80;

// ------------------------------------------------------------ the loom, in columns
// The warp runs across the glass from the left beam to the right beam; every
// weft pass is one column, laid top to bottom or bottom to top. The rug grows
// to the right: border, hours, minutes, then this minute's end panel.
const RUG0 = 3, PANEL0 = 122, FELL_MAX = 142, SHED = 144, HEDDLE = 153, BEAM_R = 156;
const REGION_X = [11, 37, 70, 96];                 // where unpicking must reach back to, per digit
const BODIES = [[13, 41], [39, 41], [72, 5], [98, 5]];
const SLOTS = BODIES.map(([x, y]) => [x - MX, y - MY]);

// materials (M_BODY 3, M_KEY 4, M_SLIT 5 come from the glyphs)
const M_LO = 1, M_MOT = 2, M_SELV = 6, M_BA = 7, M_BB = 8, M_BC = 9, M_SEP = 10, M_LOA = 11, M_MOTA = 12;
const NMAT = 16;

/** An end border band of width w: a chain of nested lozenges between walnut cords. */
function borderMat(u, w, y) {
  if (u === 0 || u === w - 1) return M_BC;
  const r = (w - 2) >> 1, per = 2 * r + 2, cu = (w - 1) / 2;
  const dv = ((y + per * 4 - 1) % per) - r, d = Math.abs(u - cu) + Math.abs(dv);
  if (d <= r - 0.5) return d <= r - 4 ? M_SEP : M_BA;
  return M_BB;
}

const LAYOUT = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = RUG0; x < FELL_MAX; x++) {
    let m;
    if (y === 0 || y === H - 1) m = M_SELV;
    else if (x < REGION_X[0]) m = borderMat(x - RUG0, REGION_X[0] - RUG0, y);
    else if (x >= PANEL0) m = borderMat(x - PANEL0, FELL_MAX - PANEL0, y);
    else {
      // the field: a lattice of stepped diagonals (one cell = two warps by two
      // passes) with a lozenge medallion and a stepped cross in every diamond,
      // in the ground's two near tones
      const cx = (x - 66 + 240) >> 1, cy = (y - 40 + 240) >> 1;
      const u = (cx + cy) % 16, v = (cx - cy + 1600) % 16;
      const r = Math.max(Math.abs(u - 8), Math.abs(v - 8));
      m = u === 0 || v === 0 || (r <= 3 && r !== 1) ? M_MOT : M_LO;
      // the colon: two small lozenges between the hours and the minutes
      if (Math.abs(x - 66.5) + Math.abs(y - 33.5) <= 2.6 || Math.abs(x - 66.5) + Math.abs(y - 46.5) <= 2.6) m = M_SEP;
    }
    LAYOUT[y * W + x] = m;
  }

// the colour runs down each pass of the end panel (its pattern never changes)
const PANEL_RUNS = [];
for (let x = PANEL0; x < FELL_MAX; x++) {
  const runs = [];
  let a = 0;
  for (let y = 2; y <= H - 1; y++)
    if (y === H - 1 || LAYOUT[y * W + x] !== LAYOUT[(y - 1) * W + x]) { runs.push(a, y === H - 1 ? H : y); a = y; }
  PANEL_RUNS.push(runs);
}
const THREAD = Array.from({ length: 7 }, () => [0, 0]);
const BX = new Float32Array(16), BY = new Float32Array(16), BC = new Uint16Array(16);

// ------------------------------------------------------------ dyes
function shade(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}
const IVORY = 0xefe4c8, WALNUT = 0x3a2416, SLIT = 0x170e09, WELD = 0xd8a630;
const COLOURWAYS = [
  { lo: 0xb0362a, mot: 0x862820, bb: 0x27407a, band: 0xd8a630 },   // madder
  { lo: 0x2a427c, mot: 0x1e3162, bb: 0xb0362a, band: 0xd8a630 },   // indigo
  { lo: 0x7a4a2c, mot: 0x5e3720, bb: 0x3f6b3c, band: 0xd8a630 },   // walnut
  { lo: 0x3f6b3c, mot: 0x30532d, bb: 0xb0362a, band: 0xd8a630 },   // weld over indigo: green
  { lo: 0x5e2a4c, mot: 0x48203c, bb: 0x2a427c, band: 0xd8a630 },   // madder over indigo: aubergine
  // night (23-07): the darkest dyes, so the undyed numerals are what glows
  { lo: 0x1c2c5c, mot: 0x24376c, bb: 0x8a2a24, band: 0xa07a2a },   // deep indigo
  { lo: 0x40203a, mot: 0x4c2846, bb: 0x1c2c5c, band: 0xa07a2a },   // deep aubergine
];
function makePal(cw, lift = 1) {
  const base = [0, cw.lo, cw.mot, IVORY, WALNUT, SLIT, WALNUT, WELD, cw.bb, WALNUT, WELD, shade(cw.lo, 1.1), shade(cw.mot, 1.1), 0, WELD, cw.band];
  const pal = new Uint16Array(NMAT * 2);
  for (let m = 0; m < NMAT; m++) {
    const k = m === M_BODY ? 0.92 : m === M_SLIT ? 1 : 0.88;
    const l = m === M_BODY ? 1 + (lift - 1) * 0.3 : lift;
    pal[m * 2] = to565(shade(base[m], l));
    pal[m * 2 + 1] = to565(shade(base[m], k * l));
  }
  return pal;
}
const PALS = COLOURWAYS.map((cw) => makePal(cw));
// the same dyes where the light from the tent door falls on the wool
const PALS_LIT = COLOURWAYS.map((cw) => makePal(cw, 1.17));
const cwOf = (h) => (h >= 23 || h < 7 ? 5 + (h & 1) : h % 5);

// abrash: runs of passes from another dye lot
const ABR = new Uint8Array(W);
for (let x = 0; x < W; x++) ABR[x] = noise(x / 5, 31) > 0.72 ? 1 : 0;

// ------------------------------------------------------------ the rug, one per minute
const RUGS = new Map();
let buildOps = 0;
function rugFor(key) {
  let r = RUGS.get(key);
  if (r) return r;
  const f = clockFields(new Date(key * 60000));
  const digits = f.hh + f.mm;
  const mat = LAYOUT.slice();
  for (let s = 0; s < 4; s++) {
    const gl = GLYPHS[+digits[s]], [sx, sy] = SLOTS[s];
    for (let j = 0; j < SH; j++)
      for (let i = 0; i < SW; i++) {
        const v = gl[j * SW + i], k = (sy + j) * W + sx + i;
        if (v && mat[k] !== M_SELV) mat[k] = v;
      }
  }
  // each hour the whole rug after the start border is rewoven in the hour's dyes
  const palL = PALS[0], palR = PALS[cwOf(f.h)];
  const img = new Uint16Array(W * H), lit = new Uint16Array(W * H);
  const litL = PALS_LIT[0], litR = PALS_LIT[cwOf(f.h)];
  for (let x = RUG0; x < FELL_MAX; x++) {
    const pal = x < REGION_X[0] ? palL : palR, pl = x < REGION_X[0] ? litL : litR, abr = ABR[x];
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      let m = mat[i];
      if (abr) m = m === M_LO ? M_LOA : m === M_MOT ? M_MOTA : m;
      const k = m * 2 + (((y >> 1) + x) & 1);
      img[i] = pal[k]; lit[i] = pl[k];
    }
  }
  buildOps += W * H * 4;
  r = { img, lit, digits };
  RUGS.set(key, r);
  if (RUGS.size > 4) RUGS.delete(RUGS.keys().next().value);
  return r;
}

/** Leftmost column that must be unpicked to turn digits a into b. */
function reachBack(a, b) {
  if (a[0] !== b[0] || a[1] !== b[1]) return REGION_X[0];    // a new hour: new dyes, the whole field
  for (let i = 2; i < 4; i++) if (a[i] !== b[i]) return REGION_X[i];
  return PANEL0;
}

// ------------------------------------------------------------ bare warp
const BACK = to565(0x35261a), WARP_A = to565(0x9a8c6e), ROD = to565(0x7a5236), ROD_D = to565(0x4e3220), LOOP = to565(0x8c7e62);
// by night the bare warp is dimmed so the cloth, not the loom, is what you see
const WARP_DAY = new Uint16Array(H), WARP_NIGHT = new Uint16Array(H);
const WARP_NA = to565(0x605440), BACK_N = to565(0x21160e);
// one warp thread every third row, quiet against the dark of the floor
const isWarp = (y) => y % 3 === 1;
for (let y = 0; y < H; y++) {
  WARP_DAY[y] = isWarp(y) ? WARP_A : BACK;
  WARP_NIGHT[y] = isWarp(y) ? WARP_NA : BACK_N;
}
const hourTurn = (a, b) => a[0] !== b[0] || a[1] !== b[1];

const IRON = 0x9a968c, WOOD = 0x8a5e3a, WOOD_D = 0x5a3a22;
const BALL_X = 149, BALL_Y = 71.5;

/** The kirkit, the weaver's heavy comb: iron tines between the warps, a wooden head and grip. */
function comb(g, x, cy) {
  for (let k = -4; k <= 4; k++) g.thickLine(x, cy + k * 2, x + 5, cy + k * 2, 1, IRON, { aa: true });
  g.fillRoundRect(x + 4.5, cy - 10, 4, 20, 1.2, WOOD_D, { aa: true });
  g.fillRoundRect(x + 5.5, cy - 9, 2, 18, 0.8, WOOD, { aa: true });
  g.fillRoundRect(x + 8, cy - 2, 9, 4, 1.8, WOOD, { aa: true });
}

function ball(g, cx, cy, c, wind) {
  g.fillCircle(cx, cy, 4.6, WALNUT, { aa: true });
  g.fillCircle(cx, cy, 3.8, c, { aa: true });
  const d = (((c >> 16) & 255) * 0.7) << 16 | (((c >> 8) & 255) * 0.7) << 8 | ((c & 255) * 0.7);
  for (let k = 0; k < 3; k++) {
    const a = wind + (k * TAU) / 3;
    g.thickLine(cx + 3.2 * cos(a), cy + 3.2 * sin(a), cx + 3.2 * cos(a + 2.2), cy + 3.2 * sin(a + 2.2), 0.8, d, { aa: true });
  }
}

// ------------------------------------------------------------ the light
// A soft band of light from the tent door drifts across the wool: inside it
// each pixel takes the lifted tone of its own dye, chosen by an ordered
// dither against the band's strength, so the cloth stays flat colour.
const BAYER = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const SWEEP_T = 26000, SWEEP_HW = 18, SWEEP_A = 0.62;
let sweepOps = 0;
function sweep(buf, lit, ms, amp) {
  sweepOps = 0;
  const pos = ((ms % SWEEP_T) / SWEEP_T) * (FELL_MAX + 40 + 2 * SWEEP_HW) - SWEEP_HW - 40;
  const a16 = SWEEP_A * amp * 16;
  for (let y = 0; y < H; y++) {
    const c = pos - (y >> 1);                       // the band leans: a stepped diagonal
    let x0 = Math.ceil(c - SWEEP_HW), x1 = Math.floor(c + SWEEP_HW);
    if (x0 < RUG0) x0 = RUG0;
    if (x1 > FELL_MAX - 1) x1 = FELL_MAX - 1;
    const row = y * W, br = (y & 3) << 2;
    for (let x = x0; x <= x1; x++) {
      let d = x - c; if (d < 0) d = -d;
      const v = (1 - d / SWEEP_HW) * a16;
      if (v > BAYER[br | (x & 3)] + 0.5) buf[row + x] = lit[row + x];
    }
    if (x1 >= x0) sweepOps += (x1 - x0 + 1) * 4;
  }
}

// timing
const W0 = 0.15, PASS = 0.32;
const rateW = (x) => (x === REGION_X[0] ? 40 : 22), rateU = (x) => (x === REGION_X[0] ? 64 : 48);         // weaving after :00: columns a second, one pass's time
const U1 = 59.85, TU = 0.14;          // unpicking before :00
const P1 = 55.4, NPANEL = FELL_MAX - PANEL0;

export default {
  name: 'Kilim',
  blurb: 'A kilim on the loom: the time is the order it was woven in; each minute the weaver unpicks back to the changed numeral and weaves it again.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    buildOps = 0;
    const rug = rugFor(mk), prev = rugFor(mk - 1), next = rugFor(mk + 1);
    const xIn = reachBack(prev.digits, rug.digits), xOut = reachBack(rug.digits, next.digits);
    const RW = rateW(xIn), RU = rateU(xOut);
    const wEnd = W0 + (PANEL0 - xIn) / RW + PASS;
    const p0 = wEnd + 0.6, tp = (P1 - p0) / NPANEL;
    const u0 = U1 - (FELL_MAX - xOut) / RU - TU;

    const buf = g.buf, WARPCOL = ctx.night > 0.5 ? WARP_NIGHT : WARP_DAY;
    buf.set(rug.img);
    g.cost.px += W * H;
    sweep(buf, rug.lit, ctx.date.getTime(), 1 - 0.5 * ctx.night);
    g.cost.box += sweepOps; g.cost.px += sweepOps >> 2;
    let n = 0, wx = -1, wf = 0, ux = 999, uf = 0, nb = 0;
    for (let x = 0; x < W; x++) {
      let fr;
      if (x < RUG0 || x >= FELL_MAX) fr = 0;
      else if (x >= PANEL0) fr = clamp((s - p0 - (x - PANEL0) * tp) / (tp * 0.8), 0, 1);
      else if (x >= xIn) fr = clamp((s - W0 - (x - xIn) / RW) / PASS, 0, 1);
      else fr = 1;
      let rem = 0;
      if (x >= xOut && x < FELL_MAX && s >= u0) {
        rem = clamp((s - u0 - (FELL_MAX - 1 - x) / RU) / TU, 0, 1);
        if (rem > 0 && rem < 1 && fr > 0 && x < ux) { ux = x; uf = fr * (1 - rem); }
      }
      if (x >= PANEL0 && rem === 0 && fr > 0 && fr < 1) {
        // the end panel is slit-woven: every colour area has its own butterfly of
        // yarn, and they all work their own stretch of the pass at once
        const runs = PANEL_RUNS[x - PANEL0];
        for (let i = 0; i < runs.length; i += 2) {
          const a = runs[i], b = runs[i + 1], len = b - a, k = Math.round(fr * len), down = ((i >> 1) + x) & 1;
          const y0 = down ? a + k : a, y1 = down ? b : b - k;
          for (let y = y0; y < y1; y++) buf[y * W + x] = WARPCOL[y];
          n += y1 - y0;
          if (len >= 5 && nb < 16) { BX[nb] = x; BY[nb] = down ? a + fr * len : b - fr * len; BC[nb] = rug.img[clamp(down ? a + k - 1 : b - k, a, b - 1) * W + x]; nb++; }
        }
        continue;
      }
      if (fr > 0 && fr < 1 && x > wx) { wx = x; wf = fr; }
      fr = Math.min(fr, 1 - rem);
      if (fr >= 1) continue;
      const k = Math.round(fr * H), down = (x & 1) === 0;
      const y0 = down ? k : 0, y1 = down ? H : H - k;
      for (let y = y0; y < y1; y++) buf[y * W + x] = WARPCOL[y];
      n += y1 - y0;
    }
    // the beams and the heddle rod
    for (let y = 0; y < H; y++) {
      const r = y * W;
      const wp = isWarp(y);
      buf[r] = ROD_D; buf[r + 1] = ROD; buf[r + 2] = wp ? LOOP : ROD_D;
      buf[r + BEAM_R] = wp ? LOOP : ROD_D; buf[r + BEAM_R + 1] = ROD; buf[r + BEAM_R + 2] = ROD; buf[r + BEAM_R + 3] = ROD_D;
      buf[r + HEDDLE] = ROD; if (wp && y % 6 === 1) buf[r + HEDDLE - 1] = LOOP;
      // the shed stick passes under every other warp
      if (!(wp && y % 6 === 4)) { buf[r + SHED] = ROD_D; buf[r + SHED + 1] = ROD; buf[r + SHED + 2] = ROD; }
    }
    g.cost.px += n + H * 12; g.cost.box += n + H * 12;

    // where the fell is, continuously, and what the weaver is doing there
    const panelN = clamp((s - p0) / tp, 0, NPANEL);
    let fell, beat = 0, combY = 40;
    if (s >= u0 && s >= 30) fell = Math.max(xOut, Math.min(PANEL0 + panelN, FELL_MAX - (s - u0) * RU));
    else if (s < wEnd) {
      fell = Math.min(PANEL0, xIn + Math.max(0, s - W0) * RW);
      if (s > W0) { beat = Math.max(0, sin(s * 26)); combY = 40 + 22 * sin(s * 3.1); }
    } else {
      fell = PANEL0 + panelN;
      const ph = panelN - Math.floor(panelN);
      combY = 40 - 22 * cos(ph * TAU);
      if (panelN > 0 && panelN < NPANEL && ph > 0.8) beat = sin(((ph - 0.8) / 0.2) * TAU * 1.5) ** 2;
      if (panelN >= NPANEL) combY = 40;
    }
    const pal = PALS[cwOf(f.h)], yarn = from565(pal[M_LO * 2]);

    // the yarn ball: unpicked weft is wound back onto it
    const wind = s >= u0 && s >= 30 ? (s - u0) * RU * 0.35 : 0;
    // at the hour the old dye's ball rolls away and the new one comes in
    let by = BALL_Y;
    if (hourTurn(rug.digits, next.digits) && s > 59.5) by += 14 * ((s - 59.5) / 0.5) ** 2;
    if (hourTurn(prev.digits, rug.digits) && s < 0.6) by += 14 * (1 - s / 0.6) ** 2;
    ball(g, BALL_X, by, yarn, wind);
    if (ux < 999) {
      const down = (ux & 1) === 0, hy = down ? uf * H : H - uf * H;
      // the pulled weft hangs slack between the cloth and the ball
      const bx = BALL_X - 2, byy = by - 2, mx = (ux + bx) / 2, my = Math.max(hy, byy) + 4 + 0.08 * (bx - ux);
      const pts = THREAD;
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, v = 1 - u;
        pts[i][0] = v * v * (ux + 0.5) + 2 * u * v * mx + u * u * bx;
        pts[i][1] = Math.min(H - 1.5, v * v * hy + 2 * u * v * my + u * u * byy);
      }
      g.stroke(pts, 0.9, yarn, { aa: true });
    }

    // the comb, beating the new passes down against the fell
    comb(g, fell + 1.5 - 2.2 * beat + (s >= u0 && s >= 30 ? 6 : 0), combY);

    // butterflies of yarn at the heads of the passes
    for (let i = 0; i < nb; i++) {
      g.fillEllipse(BX[i] + 0.5, BY[i], 2.1, 3, WALNUT, { aa: true });
      g.fillEllipse(BX[i] + 0.5, BY[i], 1.3, 2.2, from565(BC[i]), { aa: true });
    }
    if (wx >= 0) {
      const down = (wx & 1) === 0, hy = down ? wf * H : H - wf * H;
      const hi = Math.min(H - 1, Math.max(0, Math.round(hy) - (down ? 1 : 0)));
      const c = from565(rug.img[hi * W + wx]);
      g.fillEllipse(wx + 0.5, hy, 2.6, 3.8, WALNUT, { aa: true });
      g.fillEllipse(wx + 0.5, hy, 1.7, 2.9, c, { aa: true });
    }
    if (buildOps) g.cost.box += buildOps;
  },
};
