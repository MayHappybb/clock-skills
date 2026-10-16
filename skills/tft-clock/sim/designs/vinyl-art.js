// vinyl: everything baked once at load (setup() on the device).
//
//   GEOM    the turntable's geometry, shared with vinyl.js
//   TAB     per-pixel polar tables over the platter's box (r, clock angle,
//           sin, cos), so the per-frame shaders never call atan2 or sqrt
//   grooveLight(r, s, c, tilt)   the record's surface: black vinyl whose
//           grooves catch the lamp as the stationary bow-tie of light every
//           record has; used for the bake and, live, while the record flips
//   BASE    the whole static frame with the record on the platter
//   BARE    the same with the record lifted away (the slipmat shows)
//   label(h), mat(): rotating paper textures
//   band(str, top): the time's two digits, laid out in "text space" for one
//           arc, as row prefix sums (so any angular smear is two lookups)

import { Gfx, hex, mix, rgb, R, G, B, hsv, clamp, rand, noise, noise2, strokeDigit, font3x5, font5x7 } from '../js/kit.js';

export const W = 160, H = 80;
export const TAU = Math.PI * 2;

export const GEOM = {
  CX: 80, CY: 40,            // spindle
  RREC: 37,                  // record edge
  RLAB: 12.5,                // paper label
  RWAX: 15.2,                // dead wax / run-out
  RLEAD: 36.2,               // lead-in edge
  RPLAT: 41.3,               // platter rim outer
  RMAT: 38.4,                // platter rim inner (rubber mat inside)
  LIGHT: (315 / 360) * TAU,  // the lamp, top-left: clock angle of the sheen axis
  PX: 123, PY: 9,            // tonearm pivot
  ARM: 55,                   // pivot to stylus
  BAND_IN: 18, BAND_OUT: 36, // the hologram's radial band
  RREF: 27,                  // radius at which text-space x is arc length
};
const { CX, CY } = GEOM;

// ---------------------------------------------------------------- polar tables
export const BOX = { x0: 37, y0: 0, x1: 124, y1: 80 };
const BW = BOX.x1 - BOX.x0;
export const TAB = {
  w: BW,
  r: new Float32Array(BW * H),
  a: new Float32Array(BW * H),
  s: new Float32Array(BW * H),
  c: new Float32Array(BW * H),
};
for (let y = 0; y < H; y++)
  for (let x = BOX.x0; x < BOX.x1; x++) {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY, r = Math.hypot(dx, dy) || 1e-6;
    const i = y * BW + (x - BOX.x0);
    TAB.r[i] = r;
    let a = Math.atan2(dx, -dy); if (a < 0) a += TAU;
    TAB.a[i] = a; TAB.s[i] = dx / r; TAB.c[i] = -dy / r;
  }

/** Clock angle (0 = up, clockwise) from a screen offset, no Math.atan2: a polynomial, as in C. */
export function clockAngle(dx, dy) {
  // atan2(dx, -dy) mapped to [0, 2π)
  const y = dx, x = -dy;
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  const mx = ax > ay ? ax : ay, mn = ax > ay ? ay : ax;
  if (mx === 0) return 0;
  const q = mn / mx, s = q * q;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * q + q;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0) r = 3.14159274 - r;
  if (y < 0) r = -r;
  return r < 0 ? r + TAU : r;
}

// ---------------------------------------------------------------- the surface
// Radial profile of the record, sampled every 1/8 px: groove "loudness"
// (quiet passages are finer and darker, loud ones shine), the 12 track gaps
// (smooth, so darker off the sheen and sharper in it), the run-out, the
// dead wax and the rolled lead-in edge.
const PSTEP = 8, PN = Math.ceil(GEOM.RREC * PSTEP) + 2;
const PROF_K = new Float32Array(PN);   // sheen strength
const PROF_W = new Float32Array(PN);   // sheen width (narrow = glossy)
const PROF_D = new Float32Array(PN);   // diffuse base level
export const TRACKS = 12;
for (let i = 0; i < PN; i++) {
  const r = i / PSTEP;
  let k = 0, w = 0.2, d = 0;
  if (r >= GEOM.RLAB && r < GEOM.RWAX - 0.6) { k = 1.15; w = 0.07; d = 0.15; }          // dead wax, glossy
  else if (r < GEOM.RWAX) { k = 0.9; w = 0.16; d = 0.6; }                               // run-out groove ring
  else if (r < GEOM.RLEAD) {
    const loud = noise(r * 1.7, 11) * 0.6 + noise(r * 5.3, 12) * 0.4;
    k = 0.55 + 0.5 * loud; w = 0.3 + 0.14 * loud; d = 0.3 + 0.5 * loud;
    // fine groove texture: alternate turns catch a little more light
    k *= 0.86 + 0.14 * Math.cos(r * 9.1);
    // track gaps: every five minutes of the hour-long side (see vinyl.js)
    const span = (GEOM.RLEAD - GEOM.RWAX) / TRACKS;
    const pos = (GEOM.RLEAD - r) / span, n = Math.round(pos);
    if (n > 0 && n < TRACKS && Math.abs(pos - n) * span < 0.32) { k = 1.3; w = 0.07; d = 0.0; }
  } else if (r < GEOM.RREC) { k = 1.0; w = 0.45; d = 0.9; }                              // rolled edge
  PROF_K[i] = k; PROF_W[i] = w; PROF_D[i] = d;
}

const VINYL = [14, 14, 18];
const SHEEN = [176, 186, 204];

/**
 * The record's colour at radius r (px) and unit direction (s, c) from the
 * spindle (s = sin, c = cos of the clock angle), with `tilt` (0 flat, 1 a
 * strong glare as the record is lifted and turned). Returns [r, g, b].
 * Cheap enough to run per pixel: no transcendental calls.
 */
export function grooveLight(r, s, c, tilt = 0) {
  const i = (r * PSTEP) | 0;
  const k = PROF_K[i], w = PROF_W[i], d = PROF_D[i];
  // the anisotropic highlight lies along the line through the spindle
  // pointing at the lamp: |sin| of the angle off that line sets it
  const sl = -0.70710678, cl = 0.70710678;          // sin, cos of LIGHT (315°)
  const sd = s * cl - c * sl;                        // sin(θ - LIGHT)
  const cd = c * cl + s * sl;                        // cos(θ - LIGHT)
  const q = (sd * sd) / (w * w);
  let spec = 1 / (1 + q); spec *= spec;
  const q2 = (sd * sd) / 0.9;                        // a broad dim skirt round it
  spec = spec * 0.85 + 0.15 / (1 + q2);
  spec *= (cd > 0 ? 1 : 0.7) * k;                    // the near wedge brighter
  const fall = 0.82 + 0.18 * cd;                     // lamp falloff across the disc
  // a faint prism at the wedge's flanks
  const pr = sd * 3.2 + r * 0.05;
  const dr = 0.10 * spec * (pr - Math.floor(pr) - 0.5);
  let L = spec * fall + d * 0.06 + tilt * (0.25 + 0.55 * spec);
  if (L > 1.25) L = 1.25;
  return [
    VINYL[0] + (SHEEN[0] - VINYL[0]) * L * (1 + dr),
    VINYL[1] + (SHEEN[1] - VINYL[1]) * L,
    VINYL[2] + (SHEEN[2] - VINYL[2]) * L * (1 - dr),
  ];
}

// ---------------------------------------------------------------- textures
function canvasCover(cv, x, y) {
  // coverage-ish value of a mask canvas drawn in white: its green channel
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return 0;
  return G(cv.get(x, y)) / 255;
}

export const LABEL_COLOURS = [
  hex('#d8452f'), hex('#e3a72a'), hex('#1f8a86'), hex('#e8dcc2'), hex('#2f57b5'), hex('#e46a8c'),
  hex('#6d9a3a'), hex('#8a3b8f'),
];
const LT = 64, LK = LT / (GEOM.RLAB * 2);
export const LABEL_K = LK, LABEL_T = LT;
const labelCache = new Map();
/** The paper label for hour h: a texture LT x LT covering the label's diameter. */
export function label(h) {
  if (labelCache.has(h)) return labelCache.get(h);
  const cv = new Gfx(LT, LT);
  const col = LABEL_COLOURS[h % LABEL_COLOURS.length];
  const light = (R(col) * 0.3 + G(col) * 0.59 + B(col) * 0.11) > 150;
  const ink = light ? hex('#1a1714') : hex('#f4ecdc');
  const other = LABEL_COLOURS[(h + 3) % LABEL_COLOURS.length];
  const m = LT / 2;
  cv.clear(0);
  cv.fillCircle(m, m, m, col);
  // a band across the top third in a second colour, with a cut-out dome
  cv.clip(0, 0, LT, 21); cv.fillCircle(m, m, m, other); cv.unclip();
  cv.fillCircle(m, 21, 9, col);
  cv.fillCircle(m, 21, 6, ink);
  cv.fillCircle(m, 21, 3.5, other);
  cv.ring(m, m, m - 3.2, m - 2.2, ink);
  // printed lines
  const side = h % 2 ? 'SIDE B' : 'SIDE A';
  cv.text(side, m - 12, 37, { font: font3x5, c: ink });
  cv.text('33 1/3', m - 12, 44, { font: font3x5, c: ink });
  cv.fillRect(m - 14, 52, 28, 1, ink);
  cv.fillRect(m - 10, 55, 20, 1, ink);
  cv.text(String(h).padStart(2, '0'), m + 9, 30, { font: font3x5, c: ink });
  cv.text('LP', m - 16, 30, { font: font3x5, c: ink });
  const tex = { cv, col, buf: new Uint32Array(LT * LT) };
  for (let i = 0; i < LT * LT; i++) tex.buf[i] = cv.get(i % LT, (i / LT) | 0);
  labelCache.set(h, tex);
  return tex;
}

// the slipmat under the record: black felt with a big printed ring and stripe
const MT = 96, MR = GEOM.RMAT;
export const MAT_K = MT / (MR * 2), MAT_T = MT;
export const MAT = (() => {
  const cv = new Gfx(MT, MT);
  const m = MT / 2;
  cv.clear(0);
  cv.fillCircle(m, m, m, hex('#242226'));
  cv.ring(m, m, m - 6, m - 3, hex('#c8452f'));
  cv.ring(m, m, 22, 24, hex('#d8cfbf'));
  cv.fillRect(m - 30, m - 2, 60, 4, hex('#d8cfbf'));
  cv.fillCircle(m, m, 3, hex('#9a9aa0'));
  const buf = new Uint32Array(MT * MT);
  for (let y = 0; y < MT; y++)
    for (let x = 0; x < MT; x++) {
      const v = cv.get(x, y);
      // felt texture
      const n = 0.85 + 0.3 * rand(x, y, 77);
      buf[y * MT + x] = rgb(R(v) * n, G(v) * n, B(v) * n);
    }
  return { buf };
})();

// ---------------------------------------------------------------- the time, in text space
// A band is two digits drawn at 2x into a TW x TH grid. x runs along the arc
// (1 text px = 1 px of arc at RREF), y across it (1 text px = 1 px radius).
export const TS = 2;                     // samples per text px
export const DIG_W = 14, DIG_H = 18, DIG_GAP = 3;
export const TW = (DIG_W * 2 + DIG_GAP), TH = DIG_H;
const SW = TW * TS + 2, SH = TH * TS + 2;  // +1 sample margin each side
const bandCache = new Map();
/**
 * Row prefix sums of the two digits `str`: P[row * (SW + 1) + k] is the
 * sum of the first k samples of that row. Rows run from the outer radius
 * (top band) or inner radius (bottom band): the caller maps it.
 */
export function band(str) {
  if (bandCache.has(str)) return bandCache.get(str);
  const cv = new Gfx(SW, SH);
  cv.clear(0);
  const w = DIG_W * TS, h = DIG_H * TS, wt = 4.4 * TS;
  for (let i = 0; i < 2; i++) {
    const d = str[i];
    let x = 1 + i * (DIG_W + DIG_GAP) * TS;
    strokeDigit(cv, d, x, 1, w, h, { weight: wt, c: 0xffffff, aa: true });
  }
  const P = new Float32Array(SH * (SW + 1));
  for (let y = 0; y < SH; y++) {
    let acc = 0;
    P[y * (SW + 1)] = 0;
    for (let x = 0; x < SW; x++) { acc += canvasCover(cv, x, y); P[y * (SW + 1) + x + 1] = acc; }
  }
  const out = { P, SW, SH };
  if (bandCache.size > 8) bandCache.delete(bandCache.keys().next().value);
  bandCache.set(str, out);
  return out;
}

// ---------------------------------------------------------------- the static frame
const PLINTH = hex('#1c1d21'), PLINTH_HI = hex('#33353b');
const ALU = hex('#9a9ca3'), ALU_D = hex('#55575d'), ALU_HI = hex('#e2e4e8');
export const STROBE_A = (225 / 360) * TAU;   // the strobe lamp, lower left of the platter
export const STROBE_COL = hex('#ff7a2a');
export const DOTS = 90;

function plinthAt(x, y) {
  // satin black, brushed left to right, lit from the lamp at top-left
  const lx = x - 6, ly = y - 4;
  const glow = 1 / (1 + (lx * lx + ly * ly) / 900);
  const brush = (noise2(x * 0.08, y * 1.7, 5) - 0.5) * 0.07;
  return mix(PLINTH, PLINTH_HI, clamp(glow * 0.9 + brush + 0.03, 0, 1));
}

/** Colour of the static scene at a sample point; `rec` false lifts the record away. */
function scene(px, py, rec) {
  const dx = px - CX, dy = py - CY, r = Math.hypot(dx, dy);
  const s = dx / (r || 1), c = -dy / (r || 1);
  if (rec && r < GEOM.RREC) {
    if (r < GEOM.RLAB) return -1;                      // label: drawn live
    const [rr, gg, bb] = grooveLight(r, s, c, 0);
    return rgb(rr, gg, bb);
  }
  if (r < GEOM.RMAT) {
    return rec ? hex('#1e1d21') : -2;                  // slipmat: drawn live when the record lifts
  }
  if (r < GEOM.RPLAT) {
    // the platter's aluminium rim with the strobe's dot rows (row A here;
    // row B, which drifts, is drawn live)
    const u = (r - GEOM.RMAT) / (GEOM.RPLAT - GEOM.RMAT);
    const a = clockAngle(dx, dy);
    const sd = Math.sin(a - GEOM.LIGHT);
    const lit = 1 / (1 + (sd * sd) / 0.08);
    let col = mix(hex('#2c2d32'), ALU_D, 0.3 + 0.5 * u);
    col = mix(col, ALU_HI, lit * 0.85);
    // strobe glow: orange near the lamp
    let da = Math.abs(a - STROBE_A); if (da > Math.PI) da = TAU - da;
    const sg = Math.exp(-(da * da) / 0.35);
    // row A: frozen dots (the strobe says the speed is exact)
    if (r > GEOM.RMAT + 0.6 && r < GEOM.RMAT + 1.6) {
      const f = (a / TAU) * DOTS; const ph = f - Math.floor(f);
      if (ph < 0.5) col = mix(col, hex('#141416'), 0.5 + 0.4 * Math.max(sg, lit));
      else col = mix(col, STROBE_COL, sg * 0.9);
    } else col = mix(col, STROBE_COL, sg * 0.35);
    if (u > 0.85) col = mix(col, ALU_D, 0.6);
    return col;
  }
  // plinth; a soft shadow ring outside the platter
  let col = plinthAt(px, py);
  if (r < GEOM.RPLAT + 2.5) col = mix(col, 0x000000, 0.5 * (1 - (r - GEOM.RPLAT) / 2.5));
  // the strobe lamp's window and its spill
  const sx = CX + Math.sin(STROBE_A) * 44.5, sy = CY - Math.cos(STROBE_A) * 44.5;
  const sdd = Math.hypot(px - sx, py - sy);
  col = mix(col, STROBE_COL, 0.55 / (1 + (sdd * sdd) / 18));
  return col;
}

function bake(rec) {
  const cv = new Gfx(W, H);
  const N = 3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, n = 0, holes = 0;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const v = scene(x + (i + 0.5) / N, y + (j + 0.5) / N, rec);
          if (v < 0) { holes++; continue; }
          r += R(v); g += G(v); b += B(v); n++;
        }
      if (!n) { cv.pixel(x, y, 0x000000); continue; }
      cv.pixel(x, y, rgb(r / n, g / n, b / n), { dither: true });
    }
  return cv;
}

// the controls, drawn over both bakes
function controls(cv) {
  const ink = hex('#0e0e10');
  // pop-up target light, top-left: the lamp that makes the sheen
  cv.fillCircle(8, 7, 4.5, hex('#2a2b30'), { aa: true });
  cv.fillCircle(8, 7, 3.2, ALU, { aa: true });
  cv.fillCircle(8.6, 7.6, 1.9, hex('#fff2d0'), { aa: true });
  // start / stop
  cv.fillRoundRect(3, 59, 26, 17, 2, hex('#0b0b0d'), { aa: true });
  cv.fillRoundRect(4, 60, 24, 15, 2, ALU, { aa: true });
  cv.gradient(5, 61, 22, 13, [ALU_HI, ALU, ALU_D], { angle: 70 });
  cv.text('START', 7, 63, { font: font3x5, c: ink });
  cv.text('STOP', 9, 69, { font: font3x5, c: ink });
  // 33 / 45
  cv.fillRoundRect(3, 48, 12, 8, 1.5, hex('#0b0b0d'), { aa: true });
  cv.fillRoundRect(17, 48, 12, 8, 1.5, hex('#0b0b0d'), { aa: true });
  cv.fillRoundRect(4, 49, 10, 6, 1.5, ALU, { aa: true });
  cv.fillRoundRect(18, 49, 10, 6, 1.5, ALU, { aa: true });
  cv.text('33', 6, 50, { font: font3x5, c: ink });
  cv.text('45', 20, 50, { font: font3x5, c: ink });
  cv.fillRect(8, 46, 2, 1, hex('#ff4a3a'));
  // pitch fader on the right
  const fx = 149;
  cv.fillRoundRect(fx - 2, 30, 5, 46, 2, hex('#0a0a0c'), { aa: true });
  for (let y = 32; y < 75; y += 3) cv.fillRect(fx + 5, y, y === 53 ? 4 : 2, 1, hex('#6a6c72'));
  cv.text('+', fx + 6, 31, { font: font3x5, c: hex('#8a8c92') });
  cv.fillRect(fx + 6, 73, 3, 1, hex('#8a8c92'));
  cv.fillRoundRect(fx - 6, 50, 13, 7, 1.5, hex('#0b0b0d'), { aa: true });
  cv.fillRoundRect(fx - 5, 51, 11, 5, 1.5, hex('#3a3c42'), { aa: true });
  cv.fillRect(fx - 4, 53, 9, 1, ALU_HI);
  cv.fillCircle(fx - 7.5, 53.5, 1.1, hex('#5cff7a'), { aa: true });
  // cueing lever and anti-skate dial by the arm base
  cv.fillCircle(141, 28, 3.6, hex('#0b0b0d'), { aa: true });
  cv.fillCircle(141, 28, 2.8, hex('#3a3c42'), { aa: true });
  cv.thickLine(141, 28, 137.5, 31, 1.6, ALU, { aa: true });
  cv.fillCircle(144, 9, 4, hex('#0b0b0d'), { aa: true });
  cv.fillCircle(144, 9, 3.2, ALU_D, { aa: true });
  cv.thickLine(144, 9, 144, 6.5, 1, ALU_HI, { aa: true });
  // arm rest post (stylus rest position is computed in vinyl.js; this is where it lands)
  return cv;
}

export const BASE = controls(bake(true));
export const BARE = controls(bake(false));
// where the record surface was baked, for the live label and hologram
export { PLINTH };
