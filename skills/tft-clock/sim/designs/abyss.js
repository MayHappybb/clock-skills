// Abyss: 3,000 m down, where the only light is made by animals.
//
// The time is a school of lanternfish holding formation beside the lure of
// a black seadevil (an anglerfish). Every fish of a school faces the same
// way, so each one is a short horizontal dash of light: stacked fish make
// the thick stems of the numerals, fish side by side the hairline bars (the
// face is a high-contrast "modern" built from fish, abyss-glyphs.js). They
// hold station against the current, each wobbling and flicking its tail,
// their belly photophores glowing; the lure's light picks out the bodies of
// the ones nearest it. Marine snow drifts down in three depths.
//
// Minute turn: the lure flares, the angler's jaw drops, and the fish of the
// digits about to change peel off, nearest first, and stream past the lure
// into its mouth; each one flashes as it is taken (a burglar alarm), so the
// mouth lights up from inside, and the jaw snaps shut before :00. The fish
// of the digits that stay flinch. After :00 a fresh school swims in out of
// the dark and lights up fish by fish, top to bottom, writing the new
// numeral. Hour: a submersible crosses with its floodlights on. The beams
// sweep the hour shoal, which flashes in alarm and scatters; then they find
// the anglerfish and show it as it really is (brown, warty, red-mouthed),
// while the new hour forms under the lights in silver.
//
// Palette: the water is a deliberate deep blue, never black (navy at the
// top to ink at the bottom, a vignette; a little bluer by day, as if some
// light came down from above); every light is bioluminescent blue-cyan,
// the lure a greener aqua so the time keeps its own hue; the angler is
// near black with a teal rim from its own lure. The only warm colour is the
// human one: the submersible and its floodlights, once an hour.
//
// Rendering: abyss-gl.js accumulates light in float channels and resolves
// once a frame with an ordered dither, so the glows are smooth in RGB565.
// Everything glides by fractions of a pixel (bilinear masks and sprites).

import { sin, cos, clamp, ease, progress, rand, hex, R, G, B, clockFields } from '../js/kit.js';
import { FISH } from './abyss-glyphs.js';
import {
  ANGLER, JAWSPR, HINGE, ROD_BASE, MOUTH, SUB, SUB_LAMPS,
  FBODY, FLIGHT, FEYE, FM_W, FM_H, FM_N, FHALO, FISH_CX, FISH_CY, HALO_W, HALO_H, HALO_N, HALO_DX, HALO_DY,
} from './abyss-cast.js';
import { W, H, N, ACC, begin, copyBase, addMask, overMask, splatAdd, splatOver, addRadial, glowLUT, sprite, resolve } from './abyss-gl.js';

// ------------------------------------------------------------ layout
const SLOTS = [[1, 1], [37, 1], [89, 34], [125, 34]];        // digit boxes (34 x 44): hours high left, minutes low right
const ANG_O = [-8, 44];                                         // where the angler's local origin sits at rest

// ------------------------------------------------------------ colours (0..255 floats)
const rgbOf = (h) => { const c = hex(h); return [R(c), G(c), B(c)]; };
const PHOTO = rgbOf('4cc8ff'), HALO = rgbOf('1660c8'), FLASH = rgbOf('d8f4ff');
const BODY = rgbOf('1c3a62'), SILVER = rgbOf('b6c4d0'), EYE = rgbOf('a8d8ff');
const LURE_G = rgbOf('3fe0b4'), LURE_C = rgbOf('e8fff6');
const SNOW = rgbOf('8ea4c0'), WARM = rgbOf('ffe6b4'), ROD = rgbOf('22303a');

// ------------------------------------------------------------ the water, once a minute
const BASE = new Float32Array(N * 3);
let baseKey = -1;
function buildBase(hourF) {
  // daylight: 0 from 18:00 to 06:00, 1 at noon (as if a little came down from above)
  const d = Math.max(0, Math.cos(((hourF - 12) * Math.PI) / 12)), dl = d * Math.sqrt(d);
  const top = [8 + 10 * dl, 26 + 28 * dl, 58 + 40 * dl], mid = [6, 24 + 6 * dl, 56 + 10 * dl], bot = [4, 13, 34];
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const a = v < 0.45 ? v / 0.45 : 1, b = v < 0.45 ? 0 : (v - 0.45) / 0.55;
    const c0 = v < 0.45 ? top : mid, c1 = v < 0.45 ? mid : bot, u = v < 0.45 ? a : b;
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - 80) / 80, dy = (y + 0.5 - 30) / 50;
      const vig = 1 - 0.45 * Math.min(1, (dx * dx + dy * dy) * 0.6);
      const k = (y * W + x) * 3;
      BASE[k] = (c0[0] + (c1[0] - c0[0]) * u) * vig;
      BASE[k + 1] = (c0[1] + (c1[1] - c0[1]) * u) * vig;
      BASE[k + 2] = (c0[2] + (c1[2] - c0[2]) * u) * vig;
    }
  }
}

// ------------------------------------------------------------ glows
const LUT_SOFT = glowLUT((q) => (1 - q) * (1 - q) * (1 - q));        // wide, gentle
const LUT_CORE = glowLUT((q) => Math.exp(-q * 4.5) * (1 - q));        // tight, hot

// ------------------------------------------------------------ marine snow (three depths)
const SNOWN = 64;
const SN_X = new Float32Array(SNOWN), SN_Y = new Float32Array(SNOWN), SN_VX = new Float32Array(SNOWN), SN_VY = new Float32Array(SNOWN);
const SN_PH = new Float32Array(SNOWN), SN_I = new Float32Array(SNOWN), SN_L = new Uint8Array(SNOWN);
for (let i = 0; i < SNOWN; i++) {
  const layer = i < 34 ? 0 : i < 54 ? 1 : 2;
  SN_L[i] = layer;
  SN_X[i] = rand(i, 1) * 168; SN_Y[i] = rand(i, 2) * 88;
  SN_VX[i] = [0.6, 1.4, 2.6][layer] * (0.7 + 0.6 * rand(i, 3));
  SN_VY[i] = [0.9, 1.8, 3.2][layer] * (0.7 + 0.6 * rand(i, 4));
  SN_PH[i] = rand(i, 5) * 6.283;
  SN_I[i] = [16, 30, 26][layer] * (0.6 + 0.8 * rand(i, 6));
}
const posMod = (v, m) => v - Math.floor(v / m) * m;

// ------------------------------------------------------------ formations (per slot and digit, built once)
const FORM = new Array(40);
function form(slot, d) {
  const key = slot * 10 + d;
  if (FORM[key]) return FORM[key];
  const F = FISH[d], n = F.n, [sx, sy] = SLOTS[slot];
  const o = {
    n, x: new Float32Array(n), y: new Float32Array(n), order: F.order, edge: F.edge, rank: new Float32Array(n),
    p1: new Float32Array(n), p2: new Float32Array(n), p3: new Float32Array(n),
    sdx: new Float32Array(n), sdy: new Float32Array(n), ox: new Float32Array(n), oy: new Float32Array(n),
  };
  let dmin = 1e9, dmax = -1e9;
  const dist = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    o.x[k] = sx + F.x[k]; o.y[k] = sy + F.y[k];
    const dx = o.x[k] + FISH_CX - 80, dy = o.y[k] + FISH_CY - 40;
    dist[k] = Math.sqrt(dx * dx + dy * dy); dmin = Math.min(dmin, dist[k]); dmax = Math.max(dmax, dist[k]);
    o.p1[k] = rand(key, k, 1) * 6.283; o.p2[k] = rand(key, k, 2) * 6.283; o.p3[k] = rand(key, k, 3) * 6.283;
    // scatter (away from the floodlight: left, up or down) and where a new fish swims in from (right, below)
    const r1 = rand(key, k, 4), r2 = rand(key, k, 5);
    const sxv = -0.55 - 0.45 * r1, syv = (r2 - 0.5) * 1.5, L = 40 + 30 * rand(key, k, 6);
    o.sdx[k] = sxv * L; o.sdy[k] = syv * L;
    o.ox[k] = 26 + 34 * rand(key, k, 7); o.oy[k] = 6 + 26 * rand(key, k, 8) * (slot < 2 ? 1 : 0.5);
  }
  for (let k = 0; k < n; k++) o.rank[k] = (dist[k] - dmin) / (dmax - dmin || 1);
  FORM[key] = o;
  return o;
}

// ------------------------------------------------------------ per-frame state
let LGAIN = 1;
let T = 0;               // seconds of the day (continuous)
let escX = 80, escY = 40, escI = 1;
let beamOn = false;
const BEAMF = new Float32Array(N);
let mouthX = 0, mouthY = 0;

/** Draw one lanternfish with its top-left at (x, y). */
function fish(x, y, flip, tail, light, flash, bodyA, beam) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ph = ((((y - iy) * 4) | 0) << 2) | (((x - ix) * 4) | 0);
  const off = ((flip * 3 + tail) * 16 + ph) * FM_N;
  // how much the lure lights this fish's body
  const dx = x + FISH_CX - escX, dy = y + FISH_CY - escY;
  const lure = escI / (1 + (dx * dx + dy * dy) / 260);
  const li = light * (1 + flash) * LGAIN;
  if (li > 0.02) addMask(FHALO, ph * HALO_N, HALO_W, HALO_H, ix + HALO_DX, iy + HALO_DY, HALO[0] * 0.42 * li, HALO[1] * 0.42 * li, HALO[2] * 0.42 * li);
  if (bodyA > 0.02) {
    const lu = 0.7 * lure + 0.12 * light;
    let br = BODY[0] + 30 * lu, bg = BODY[1] + 120 * lu, bb = BODY[2] + 120 * lu;
    if (beam > 0.01) { const m = beam > 1 ? 1 : beam; br += (SILVER[0] - br) * m; bg += (SILVER[1] - bg) * m; bb += (SILVER[2] - bb) * m; }
    overMask(FBODY, off, FM_W, FM_H, ix, iy, br, bg, bb, bodyA);
    const e = bodyA * (1.1 + lure + beam);
    addMask(FEYE, off, FM_W, FM_H, ix, iy, EYE[0] * e, EYE[1] * e, EYE[2] * e);
  }
  if (li > 0.02) {
    const fr = PHOTO[0] + (FLASH[0] - PHOTO[0]) * (flash > 1 ? 1 : flash);
    const fg = PHOTO[1] + (FLASH[1] - PHOTO[1]) * (flash > 1 ? 1 : flash);
    const fb = PHOTO[2] + (FLASH[2] - PHOTO[2]) * (flash > 1 ? 1 : flash);
    addMask(FLIGHT, off, FM_W, FM_H, ix, iy, fr * li, fg * li, fb * li);
  }
}

const beamAt = (x, y) => {
  if (!beamOn) return 0;
  const xi = x < 0 ? 0 : x >= W ? W - 1 : x | 0, yi = y < 0 ? 0 : y >= H ? H - 1 : y | 0;
  return BEAMF[yi * W + xi];
};
const tailOf = (v) => (v > 0.4 ? 1 : v < -0.4 ? 2 : 0);

// Where fish k of a school holds station: its own wobble, and now and then
// (about one fish in eight, every nine seconds) a restless dart out and
// back. Darts are horizontal, and only by a fish on the outer edge of its
// row, away from the digit's partner (the hours' tens and the minutes' units
// dart off-screen, the two inner digits towards the lure), so a darting fish
// only lengthens a bar for a moment and never makes a stroke of its own.
// The photophores: each fish glimmers on its own, and a slow wave of light
// rolls down through every school, one every five seconds or so.
function pulseOf(o, k, j) {
  const w = sin(T * 1.25 - o.order[k] * 3.2 + j * 1.7);
  const band = w > 0 ? w * w * w * w * w * w : 0;
  return 0.8 + 0.08 * sin(T * 2.9 + o.p2[k]) + 0.4 * band;
}

let RX = 0, RY = 0;
function restPos(o, k, j, swx, swy) {
  RX = o.x[k] + swx + 0.55 * sin(T * 1.1 + o.p1[k]);
  RY = o.y[k] + swy + 0.32 * sin(T * 1.7 + o.p2[k]);
  const q = T / 9 + o.p1[k] * 0.16, w = Math.floor(q), u = (q - w) * 9;
  if (u < 0.9) {
    const h = rand(w, k, j);
    const dir = j === 0 || j === 2 ? -1 : 1, ed = o.edge[k];
    if (h < 0.13 && (ed === dir || ed === 2)) RX += dir * sin(u * 3.49) * (ed === 2 ? 2 + 12 * h : 2.5 + 24 * h);
  }
}

/** A school at rest (or flinching): digit d in slot j. */
function restSchool(j, d, gain, jolt) {
  const o = form(j, d);
  const swx = 0.7 * sin(T * 0.37 + j * 1.3) + jolt, swy = 0.6 * sin(T * 0.29 + j * 2.1);
  for (let k = 0; k < o.n; k++) {
    restPos(o, k, j, swx, swy); const x = RX, y = RY;
    const pulse = pulseOf(o, k, j);
    fish(x, y, 0, tailOf(sin(T * 6.5 + o.p3[k])), pulse * gain, gain > 1 ? gain - 1 : 0, 1, beamAt(x + FISH_CX, y + FISH_CY));
  }
}

/** The school of digit d swimming in from the dark and lighting up; tt = seconds since :00 (may be < 0). */
function arriveSchool(j, d, tt) {
  const o = form(j, d);
  const swx = 0.7 * sin(T * 0.37 + j * 1.3), swy = 0.6 * sin(T * 0.29 + j * 2.1);
  for (let k = 0; k < o.n; k++) {
    const ta = 0.3 + 1.0 * o.order[k];
    const u = (tt - (ta - 1.2)) / 1.2;
    if (u <= 0) continue;
    restPos(o, k, j, swx, swy); const tx = RX, ty = RY;
    let x = tx, y = ty, tailF = 6.5;
    if (u < 1) {
      const e = ease.outCubic(u), m = 1 - e;
      // a curved approach: in from the right and below, bending up into place
      x = tx + o.ox[k] * m; y = ty + o.oy[k] * m * m;
      tailF = 14;
    }
    const lit = tt <= 0 ? 0 : clamp((tt - (ta - 0.25)) / 0.35, 0, 1);
    const bodyA = clamp(u * 1.6, 0, 1);
    const spark = lit > 0 && lit < 1 ? 0.6 * (1 - lit) : 0;          // a fish flares as it lights
    fish(x, y, 0, tailOf(sin(T * tailF + o.p3[k])), lit * pulseOf(o, k, j), spark, bodyA, beamAt(x + FISH_CX, y + FISH_CY));
  }
}

/** Fish of digit d leaving to be eaten: they stream past the lure into the mouth. Returns the swallow-flash amount. */
function eatenSchool(j, d, tt, rank0, rankSpan) {
  const o = form(j, d);
  const swx = 0.7 * sin(T * 0.37 + j * 1.3), swy = 0.6 * sin(T * 0.29 + j * 2.1);
  let flashSum = 0;
  for (let k = 0; k < o.n; k++) {
    const td = -2.15 + 0.8 * (rank0 + rankSpan * o.rank[k]);
    const u = (tt - td) / 0.65;
    restPos(o, k, j, swx, swy); const rx = RX, ry = RY;
    // the lure display: the whole digit brightens as the lure pulses, before they go
    const alarm = tt > -2.6 ? 0.5 * progress(tt, -2.6, -2.2) : 0;
    if (u <= 0) {
      fish(rx, ry, 0, tailOf(sin(T * 6.5 + o.p3[k])), pulseOf(o, k, j) + alarm, alarm, 1, beamAt(rx + FISH_CX, ry + FISH_CY));
      continue;
    }
    if (u >= 1) {
      const age = (u - 1) * 0.65;
      if (age < 0.3) flashSum += 1 - age / 0.3;
      continue;
    }
    const e = u * u;                                     // sucked in: accelerating
    const cx = escX + 4 + 12 * (o.p2[k] / 6.283 - 0.5), cy = escY - 4 + 16 * (o.p3[k] / 6.283 - 0.5);   // past the lure, a loose ribbon
    const m = 1 - e;
    const x = m * m * rx + 2 * m * e * cx + e * e * (mouthX - FISH_CX);
    const y = m * m * ry + 2 * m * e * cy + e * e * (mouthY - FISH_CY);
    const wig = 1.6 * sin(u * 3.14) * sin(T * 9 + o.p3[k]);
    const fade = 1 - progress(u, 0.82, 1);
    fish(x, y + wig, 0, tailOf(sin(T * 16 + o.p3[k])), (pulseOf(o, k, j) + alarm) * fade, 0.6 * e, fade, beamAt(x + FISH_CX, y + FISH_CY));
  }
  return flashSum;
}

/** Fish of digit d startled by the floodlight: flash in alarm, go dark, scatter. */
function scatterSchool(j, d, tt) {
  const o = form(j, d);
  const swx = 0.7 * sin(T * 0.37 + j * 1.3), swy = 0.6 * sin(T * 0.29 + j * 2.1);
  for (let k = 0; k < o.n; k++) {
    restPos(o, k, j, swx, swy); const rx = RX, ry = RY;
    const go = -1.25 + 0.25 * o.p1[k] / 6.283;
    const u = clamp((tt - go) / 1.0, 0, 1), e = u * u;
    const x = rx + o.sdx[k] * e, y = ry + o.sdy[k] * e;
    // a strobe, 5 a second, then the lights go out as they bolt
    const strobe = tt > -2.1 && tt < -1.05 ? 2.2 * (0.5 + 0.5 * sin((tt + 2.1) * 31.4 + o.p2[k] * 0.3)) : 0;
    const lit = pulseOf(o, k, j) * (1 - progress(tt, -0.95, -0.35));
    const bodyA = 1 - progress(tt, -0.7, -0.15);
    if (lit <= 0 && bodyA <= 0) continue;
    fish(x, y, 0, tailOf(sin(T * (u > 0 ? 18 : 6.5) + o.p3[k])), lit, strobe, bodyA, beamAt(x + FISH_CX, y + FISH_CY));
  }
}

// ------------------------------------------------------------ the submersible's floodlights
const BGW = 41, BGH = 21, BNODE = new Float32Array(BGW * BGH);
const LAMP_DIR = [[-0.92, 0.39], [-0.78, 0.63]], LAMP_HALF = [0.2, 0.24];
function buildBeam(g, lamps, inten) {
  for (let j = 0; j < BGH; j++)
    for (let i = 0; i < BGW; i++) {
      const px = i * 4, py = j * 4;
      let v = 0;
      for (let l = 0; l < 2; l++) {
        const vx = px - lamps[l][0], vy = py - lamps[l][1];
        const along = vx * LAMP_DIR[l][0] + vy * LAMP_DIR[l][1];
        if (along <= 0) continue;
        const perp = Math.abs(vx * LAMP_DIR[l][1] - vy * LAMP_DIR[l][0]);
        const w = LAMP_HALF[l] * along + 2;
        let ed = 1 - perp / w;
        if (ed <= 0) continue;
        ed = ed * ed * (3 - 2 * ed);
        v += ed / (1 + (along * along) / 3600);
      }
      BNODE[j * BGW + i] = v * inten;
    }
  g.cost.box += BGW * BGH * 2 * 20;             // two cones per node, a divide each
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / 4, jy = fy | 0, v = fy - jy;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / 4, ix = fx | 0, u = fx - ix, k = jy * BGW + ix;
      BEAMF[y * W + x] = (BNODE[k] * (1 - u) + BNODE[k + 1] * u) * (1 - v) + (BNODE[k + BGW] * (1 - u) + BNODE[k + BGW + 1] * u) * v;
    }
  }
  g.cost.box += N * 3;                            // bilinear, fixed point
}
function addBeamHaze(g) {
  for (let p = 0; p < N; p++) {
    const b = BEAMF[p];
    if (b <= 0.004) continue;
    const k = p * 3;
    ACC[k] += WARM[0] * 0.30 * b; ACC[k + 1] += WARM[1] * 0.32 * b; ACC[k + 2] += WARM[2] * 0.36 * b;
  }
  g.cost.box += N * 2;
}

// ------------------------------------------------------------ a comb jelly, far off
// A ctenophore drifting in the open water top right, small and far: a
// glassy body and four comb rows whose beating cilia send rainbows running
// down them, tipped with its own blue-green light.
const RAINBOW = new Float32Array(32 * 3);
for (let i = 0; i < 32; i++) {
  const h = i / 32 * 6, c = (n) => { const k = (n + h) % 6; return Math.max(0, Math.min(1, Math.min(k, 4 - k))); };
  RAINBOW[i * 3] = 255 * c(5); RAINBOW[i * 3 + 1] = 255 * c(3); RAINBOW[i * 3 + 2] = 255 * c(1);
}
const COMB_ROWS = [-0.95, -0.4, 0.3, 0.85];
function drawComb(gl) {
  const cx = 128 + 16 * sin(T * 0.041) + 4 * sin(T * 0.11), cy = 14 + 4 * sin(T * 0.067 + 1) + 1.2 * sin(T * 0.5);
  const tilt = 0.25 * sin(T * 0.09);
  const ex = 4.4, ey = 7.2;
  addRadial(cx, cy, 10, LUT_SOFT, 10 * gl, 30 * gl, 46 * gl);
  for (let r = 0; r < 4; r++) {
    const sx = COMB_ROWS[r];
    for (let q = 0; q < 11; q++) {
      const v = (q / 10) * 2 - 1, w = Math.sqrt(1 - v * v * 0.92);
      const lx = sx * ex * w, ly = v * ey;
      const x = cx + lx + tilt * ly, y = cy + ly - tilt * lx * 0.3;
      const hue = ((q * 3 - T * 14 + r * 5) | 0) & 31, beat = 0.5 + 0.5 * sin(q * 1.4 - T * 9 + r);
      const a = (0.25 + 0.55 * beat) * gl * (r === 1 || r === 2 ? 1 : 0.6);
      splatAdd(x, y, RAINBOW[hue * 3] * a * 0.5, RAINBOW[hue * 3 + 1] * a * 0.5 + 20 * a, RAINBOW[hue * 3 + 2] * a * 0.5 + 30 * a);
    }
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Abyss',
  blurb: 'Lanternfish school into the time by an anglerfish\'s lure; each minute it swallows the old digit, and once an hour a submersible\'s floodlights scatter the hours.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    LGAIN = 1 + 0.35 * ctx.night;          // the lights hold up when the backlight dims
    begin(g);
    const dayMs = ((f.h * 60 + f.m) * 60 + f.s) * 1000 + f.ms;
    T = dayMs / 1000;

    // the minute's three clocks: what showed, shows, will show
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const curD = f.hh + f.mm, prvD = prv.hh + prv.mm, nxtD = nxt.hh + nxt.mm;
    const late = s >= 30;                               // the half-minute before the next turn
    const tt = late ? s - 60 : s;                       // seconds from the nearest turn
    // the turn this half-minute is about: going out is cur->nxt, coming in is prv->cur
    const outD = late ? curD : prvD, inD = late ? nxtD : curD;
    const hourTurn = late ? nxt.m === 0 : f.m === 0;

    // ---- water
    if (baseKey !== f.minuteKey) { buildBase(f.h + f.m / 60); baseKey = f.minuteKey; }
    copyBase(BASE);

    // ---- the angler's pose: rest drift, gape, lunge, snap, chew
    let jaw = 0.03 + 0.035 * (0.5 + 0.5 * sin(T * 0.9));
    let lunge = 0;
    if (tt > -2.5 && tt < -0.7) jaw += 0.82 * ease.outCubic(progress(tt, -2.5, -1.95)) + 0.04 * sin(T * 21);
    if (tt >= -0.7 && tt < -0.58) jaw += 0.82 * (1 - ease.inQuad(progress(tt, -0.7, -0.58)));
    if (tt >= -0.58 && tt < 2.2) jaw += 0.13 * Math.abs(sin((tt + 0.58) * 7)) * (1 - progress(tt, -0.58, 2.2));
    if (tt > -2.5 && tt < 3) lunge = 5 * ease.outCubic(progress(tt, -2.5, -1.9)) + 3.5 * ease.outQuad(progress(tt, -0.75, -0.6)) - 8.5 * ease.inOutCubic(progress(tt, -0.4, 3));
    const ox = ANG_O[0] + 1.2 * sin(T * 0.21) + lunge, oy = ANG_O[1] + 1.0 * sin(T * 0.33) - 0.4 * lunge;
    const rot = 0.025 * sin(T * 0.17) - 0.01 * lunge;
    const cr = cos(rot), sr = sin(rot);
    const toScreen = (lx, ly) => [ox + cr * lx - sr * ly, oy + sr * lx + cr * ly];
    // mouth (between the jaws, a little in when open)
    [mouthX, mouthY] = toScreen(MOUTH[0], MOUTH[1] + 2 * jaw);

    // ---- the lure: rod as a curve from the snout, the esca twitching at its tip
    const [bx, by] = toScreen(ROD_BASE[0], ROD_BASE[1]);
    const wag = sin(T * 1.6) + 0.4 * sin(T * 4.1 + 1);
    const tipX = bx + 32.5 + 1.6 * wag, tipY = by - 12 + 2.2 * sin(T * 1.13 + 0.5) + 0.6 * wag;
    const ctlX = bx + 9, ctlY = by - 13;
    escX = tipX; escY = tipY + 1.5;
    escI = 0.9 + 0.1 * sin(T * 2.7);
    if (tt > -4.2 && tt < -2) escI += 0.7 * Math.max(0, sin((tt + 4.2) * 4.3));      // the lure display
    if (tt > -0.6 && tt < 3) escI *= 0.55 + 0.45 * progress(tt, -0.6, 3);            // dims after the kill

    // ---- the submersible (hour turns): crosses from right to left over ~10 s
    beamOn = false;
    let subX = 0, subY = 0, beamI = 0, subRise = 0;
    if (hourTurn && tt > -6 && tt < 5) {
      subX = 55 - 20 * tt; subRise = ease.inOutQuad(progress(tt, -2, 3)); subY = 1 + 1.2 * sin(T * 0.7) - 17 * subRise;
      beamI = clamp((tt + 6) / 0.8, 0, 1) * clamp((5 - tt) / 0.8, 0, 1);
      const lamps = [[subX + SUB_LAMPS[0][0], subY + SUB_LAMPS[0][1]], [subX + SUB_LAMPS[1][0], subY + SUB_LAMPS[1][1]]];
      buildBeam(g, lamps, beamI);
      beamOn = true;
    }

    // ---- far snow, behind everything
    for (let i = 0; i < SNOWN; i++) {
      if (SN_L[i] !== 0) continue;
      drawSnow(i);
    }

    drawComb(1 + 2 * beamAt(128, 14));

    // ---- the submersible, small and far, behind the fish
    if (beamOn) sprite(SUB, subX, subY, 0, 0, 0.03 * sin(T * 0.5) + 0.1 * subRise, 1, null, 1);

    // ---- the angler: body, then the jaw hinged under it
    const mixA = beamOn ? BEAMF : null;
    sprite(ANGLER, ox, oy, 0, 0, rot, 1, mixA);
    const [hx, hy] = toScreen(HINGE[0], HINGE[1]);
    sprite(JAWSPR, hx, hy, HINGE[0], HINGE[1], rot + jaw, 1, mixA);
    // the rod: a thin dark curve
    for (let q = 0; q <= 40; q++) {
      const u = q / 40, m = 1 - u;
      const x = m * m * bx + 2 * m * u * ctlX + u * u * tipX, y = m * m * by + 2 * m * u * ctlY + u * u * tipY;
      const lit = u * u * escI * 40;
      splatOver(x, y, ROD[0] + lit * 0.4, ROD[1] + lit, ROD[2] + lit, 0.9);
    }

    // ---- the schools
    let swallow = 0;
    let eatenSlots = 0;
    for (let j = 2; j < 4; j++) if (outD[j] !== inD[j]) eatenSlots |= 1 << j;
    for (let j = 0; j < 4; j++) {
      const a = +outD[j], b = +inD[j];
      const changes = a !== b;
      if (!changes) {
        // flinch when the jaw snaps (and shine in the floodlight)
        const fl = tt > -0.62 && tt < 0.6 ? progress(tt, -0.62, -0.55) * (1 - progress(tt, -0.55, 0.6)) : 0;
        restSchool(j, late ? a : b, 1 + 0.9 * fl, 1.2 * fl * sin((tt + 0.62) * 18));
        continue;
      }
      if (late) {
        // the old school goes; the new one starts out of the dark
        if (tt < -2.6) restSchool(j, a, 1, 0);
        else if (j < 2) scatterSchool(j, a, tt);
        else {
          const both = (eatenSlots & 12) === 12;
          swallow += eatenSchool(j, a, tt, both ? (j === 2 ? 0 : 0.42) : 0, both ? 0.58 : 1);
        }
        arriveSchool(j, b, tt);
      } else {
        arriveSchool(j, b, tt);
      }
    }

    // ---- near snow
    for (let i = 0; i < SNOWN; i++) if (SN_L[i] !== 0) drawSnow(i);

    // ---- light: the lure, the swallowed fish flashing in the jaws, the floodlights
    addRadial(escX, escY, 30, LUT_SOFT, LURE_G[0] * 0.22 * escI, LURE_G[1] * 0.22 * escI, LURE_G[2] * 0.22 * escI);
    addRadial(escX, escY, 6, LUT_CORE, LURE_G[0] * 0.9 * escI, LURE_G[1] * 0.9 * escI, LURE_G[2] * 0.9 * escI);
    splatOver(escX, escY, LURE_C[0], LURE_C[1], LURE_C[2], clamp(escI, 0, 1));
    addRadial(escX, escY, 2.2, LUT_CORE, 255 * escI, 255 * escI, 230 * escI);
    if (swallow > 0) {
      const sw = Math.min(2, swallow);
      addRadial(mouthX, mouthY, 14, LUT_SOFT, PHOTO[0] * 0.5 * sw, PHOTO[1] * 0.5 * sw, PHOTO[2] * 0.5 * sw);
      addRadial(mouthX, mouthY, 5, LUT_CORE, FLASH[0] * 0.8 * sw, FLASH[1] * 0.8 * sw, FLASH[2] * 0.8 * sw);
    }
    if (beamOn) {
      addBeamHaze(g);
      for (const [lx, ly] of SUB_LAMPS) {
        addRadial(subX + lx, subY + ly, 7, LUT_CORE, WARM[0] * beamI, WARM[1] * beamI, WARM[2] * beamI);
      }
      if (sin(T * 6.283 * 0.8) > 0.92) addRadial(subX + 15, subY + 1, 3, LUT_CORE, 255, 40, 20);   // the strobe on the sail
    }

    resolve(g);
  },
};

function drawSnow(i) {
  const L = SN_L[i];
  const x = posMod(SN_X[i] - SN_VX[i] * T + 1.5 * sin(T * 0.4 + SN_PH[i]), 168) - 4;
  const y = posMod(SN_Y[i] + SN_VY[i] * T, 88) - 4;
  const dx = x - escX, dy = y - escY;
  const lit = 1 + 3.5 * escI / (1 + (dx * dx + dy * dy) / 220) + 9 * beamAt(x, y);
  const v = SN_I[i] * lit;
  if (L === 2) addRadial(x, y, 1.7, LUT_SOFT, SNOW[0] * v / 255, SNOW[1] * v / 255, SNOW[2] * v / 255);
  else splatAdd(x, y, SNOW[0] * v / 255, SNOW[1] * v / 255, SNOW[2] * v / 255);
}
