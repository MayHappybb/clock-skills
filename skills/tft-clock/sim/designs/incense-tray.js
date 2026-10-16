// incense: the tray. Everything that changes at most once a minute is built
// here into whole frames, cached, and blitted: the ash bed with its grain,
// the light of the room at this minute (a window's lattice of sunlight
// crossing the tray through the day, a lamp in the evening, the dark at
// night), the bronze rim, the brass pins, and the seal with every crossing
// before this minute already burnt to pale ash.
//
// On a device this is one 160x80 pass a minute (a few ms), plus the 24
// hour seals, which are fixed data and would live in flash.

import { Gfx, rand, noise2, to565, dither565, clamp } from '../js/kit.js';
import { buildSeal } from './incense-glyphs.js';

const W = 160, H = 80, N = W * H;
export const RIM = 3;

// ---- palette (0xRRGGBB, before light)
export const POWDER = [0x62, 0x38, 0x1a];   // sandalwood and agarwood powder, unburnt
export const ASH = [0xf0, 0xea, 0xde];      // the burnt line: pale, keeps its shape
const BED = [0x88, 0x84, 0x7c];             // the ash bed it is pressed into
const BRONZE = [0x6a, 0x4c, 0x2c], BRONZE_HI = [0xb8, 0x90, 0x58], BRONZE_LO = [0x2a, 0x1c, 0x10];
const PLATE = [0x4e, 0x3a, 0x24];

// ---- the bed: grain, mottling and the faint combing of the ash press (static)
const bedTex = new Float32Array(N * 3);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const grain = (rand(x, y, 11) - 0.5) * 14 + (rand(x >> 1, y >> 1, 12) - 0.5) * 6;
    const mottle = (noise2(x / 13, y / 9, 13) - 0.5) * 16;
    const comb = (rand(0, y, 14) - 0.5) * 7;          // the press leaves faint lines along x
    const v = grain + mottle + comb;
    bedTex[k * 3] = BED[0] + v; bedTex[k * 3 + 1] = BED[1] + v * 0.97; bedTex[k * 3 + 2] = BED[2] + v * 0.92;
  }
// a per-pixel hash for the powder grain and the ash speckle (static)
const speck = new Float32Array(N);
for (let k = 0; k < N; k++) speck[k] = rand(k, 0, 21);
export const speckle = speck;

// ---- the room's light by time of day: ambient colour, sun strength and colour
const AMB = [   // hour, r, g, b
  [0, 0.44, 0.46, 0.60], [5.4, 0.44, 0.46, 0.60], [6.6, 0.72, 0.64, 0.70], [8.2, 0.90, 0.92, 0.96],
  [16.5, 0.90, 0.90, 0.93], [18.3, 0.72, 0.60, 0.60], [19.3, 0.84, 0.70, 0.52], [22.6, 0.80, 0.66, 0.50],
  [23.4, 0.44, 0.46, 0.60], [24, 0.44, 0.46, 0.60],
];
function keyed(tab, h) {
  let i = 1;
  while (i < tab.length - 1 && tab[i][0] < h) i++;
  const a = tab[i - 1], b = tab[i], u = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}
export function ambientAt(h) { return keyed(AMB, h); }
/** Sun through the window: strength 0..1 (and its colour), hours 7 to 18. */
export function sunAt(h) {
  const k = clamp((h - 7) / 1.6, 0, 1) * clamp((18.2 - h) / 2, 0, 1);
  const late = clamp((h - 14) / 4, 0, 1);
  return { k, c: [0.34, 0.30 - 0.05 * late, 0.24 - 0.12 * late] };
}

// The lattice of the window, as sunlight on the tray: a skewed patch whose
// position follows the sun, crossed by the bars of the lattice.
function sunMask(x, y, h) {
  const skew = 0.55 - (h - 7) * 0.09;            // the patch leans one way in the morning, the other later
  const u = x + 0.5 + (y + 0.5 - 40) * skew - (-70 + (h - 7) * 27);   // patch centre crosses the tray 7:00..18:00
  const au = u < 0 ? -u : u;
  const edge = clamp(1 - (au - 52) / 7, 0, 1);
  if (edge <= 0) return 0;
  // lattice bars: verticals (in patch space) every 24 px, horizontals every 22
  const bu = (u + 600) % 24 - 12, bv = (y + 0.5 + u * 0.18 + 600) % 22 - 11;
  const bar = clamp((bu < 0 ? -bu : bu) - 9.6, 0, 1.3) / 1.3 * clamp((bv < 0 ? -bv : bv) - 9.3, 0, 1.2) / 1.2;
  return edge * (0.12 + 0.88 * bar);
}

// The ordered dither of kit.dither565, in integer steps (channels are >= 0
// here, so truncation is the floor): the minute build runs it 25,600 times.
const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);
export function dith(r, g, b, x, y) {
  const t = BAYER[((y & 3) << 2) | (x & 3)];
  let R5 = ((r > 255 ? 255 : r < 0 ? 0 : r) * 0.12157 + t) | 0, G6 = ((g > 255 ? 255 : g < 0 ? 0 : g) * 0.24706 + t) | 0, B5 = ((b > 255 ? 255 : b < 0 ? 0 : b) * 0.12157 + t) | 0;
  if (R5 > 31) R5 = 31; if (G6 > 63) G6 = 63; if (B5 > 31) B5 = 31;
  return (R5 << 11) | (G6 << 5) | B5;
}

// The rim's shadow on the ash and a soft falloff to the corners (static).
const rimLight = new Float32Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const ex = Math.min(x - RIM + 0.5, W - RIM - 0.5 - x), ey = Math.min(y - RIM + 0.5, H - RIM - 0.5 - y);
    rimLight[y * W + x] = clamp(Math.min(ex + 0.4, ey + 0.4) / 3, 0.55, 1) * (0.94 + 0.06 * clamp(Math.min(ex, ey * 2) / 30, 0, 1));
  }

const minuteCache = new Map();

/**
 * The frame for minute m of hour hh, with every crossing before m burnt:
 * { canvas, empty (the bed without the seal), lr, lg, lb (light per pixel),
 *   bedLit (r, g, b per pixel) }.
 */
export function minuteBase(hh, m, light) {
  const key = `${hh}:${m}:${light.key}`;
  if (minuteCache.has(key)) return minuteCache.get(key);
  const seal = buildSeal(hh);
  const lr = new Float32Array(N), lg = new Float32Array(N), lb = new Float32Array(N);
  const bed = new Float32Array(N * 3);
  const empty = new Gfx(W, H), canvas = new Gfx(W, H);
  const { amb, sun, hour } = light;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const s = sun.k > 0 ? sun.k * sunMask(x, y, hour) : 0;
      const rim = rimLight[k];
      lr[k] = (amb[0] + sun.c[0] * s) * rim; lg[k] = (amb[1] + sun.c[1] * s) * rim; lb[k] = (amb[2] + sun.c[2] * s) * rim;
      bed[k * 3] = bedTex[k * 3] * lr[k]; bed[k * 3 + 1] = bedTex[k * 3 + 1] * lg[k]; bed[k * 3 + 2] = bedTex[k * 3 + 2] * lb[k];
    }
  // the raised powder casts a short shadow down and right; ash, collapsed, less
  const cov = seal.cov, arc = seal.arc, burntTo = seal.units[m];
  const shade = new Float32Array(N);
  for (let y = 1; y < H; y++)
    for (let x = 1; x < W; x++) {
      const k = y * W + x, up = k - W - 1;
      const c = cov[up] - cov[k];
      if (c > 0) shade[k] = c * (arc[up] < burntTo ? 0.16 : 0.34);
    }
  const eb = empty.buf, cb = canvas.buf;
  for (let k = 0; k < N; k++) {
    const x = k % W, y = (k / W) | 0;
    const r = bed[k * 3], g = bed[k * 3 + 1], b = bed[k * 3 + 2];
    eb[k] = dith(r, g, b, x, y);
    const sh = 1 - shade[k];
    let cr = r * sh, cg = g * sh, cbb = b * sh;
    const c = cov[k];
    if (c > 0) {
      const [pr, pg, pb] = trailColour(k, arc[k] < burntTo, lr[k], lg[k], lb[k], cov, k);
      const a = arc[k] < burntTo ? c * (speck[k] < 0.1 ? 0.55 : 1) : c;   // burnt ash is a little broken
      cr += (pr - cr) * a; cg += (pg - cg) * a; cbb += (pb - cbb) * a;
    }
    cb[k] = dith(cr, cg, cbb, x, y);
  }
  rimAndPins(canvas, seal, lr, lg, lb);
  rimAndPins(empty, null, lr, lg, lb);
  const out = { canvas, empty, lr, lg, lb, bed };
  minuteCache.set(key, out);
  if (minuteCache.size > 6) minuteCache.delete(minuteCache.keys().next().value);
  return out;
}

/** The colour of a trail pixel, unburnt powder or burnt ash, under this light. */
export function trailColour(k, burnt, lr, lg, lb, cov) {
  const sp = speck[k];
  // the up-left edge of a line catches the light
  const hi = cov[k - W - 1] < cov[k] * 0.5 ? 1.14 : 1;
  if (burnt) {
    const v = (sp < 0.2 ? 0.9 : sp > 0.9 ? 1.04 : 1) * hi;
    return [ASH[0] * lr * v, ASH[1] * lg * v, ASH[2] * lb * v];
  }
  const v = (sp < 0.3 ? 0.8 : sp > 0.85 ? 1.22 : 1) * hi;
  return [POWDER[0] * lr * v, POWDER[1] * lg * v, POWDER[2] * lb * v];
}

const lit = (c, lr, lg, lb, k) => [c[0] * lr[k], c[1] * lg[k], c[2] * lb[k]];

function rimAndPins(cv, seal, lr, lg, lb) {
  const b = cv.buf;
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { const k = y * W + x; const [r, g, bb] = lit(c, lr, lg, lb, Math.min(N - 1, Math.max(0, k))); b[k] = dith(r * 1.25, g * 1.25, bb * 1.25, x, y); } };
  // the bronze rim: dark outer lip, a lit bevel on the top and left, shade on the bottom and right
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (x >= RIM && y >= RIM && x < W - RIM && y < H - RIM) continue;
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const topLeft = (x <= y && x < RIM) || (y < x && y < RIM && y <= W - 1 - x);
      const c = d === 0 ? BRONZE_LO : d === 1 ? (topLeft ? BRONZE_HI : BRONZE) : (topLeft ? BRONZE : BRONZE_LO);
      const k = y * W + x;
      const sx = Math.min(W - 1 - RIM, Math.max(RIM, x)), sy = Math.min(H - 1 - RIM, Math.max(RIM, y)), kk = sy * W + sx;
      const v = 0.9 + 0.2 * speck[k];
      b[k] = dith(c[0] * lr[kk] * 1.3 * v, c[1] * lg[kk] * 1.3 * v, c[2] * lb[kk] * 1.3 * v, x, y);
    }
  if (!seal) return;
  for (const p of seal.pins) {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    const red = p.m === 0, big = p.m % 15 === 0;
    const hiC = red ? [0xf0, 0x60, 0x40] : [0xf0, 0xd8, 0x90], midC = red ? [0xb0, 0x20, 0x14] : [0xb8, 0x8c, 0x3c], loC = red ? [0x60, 0x10, 0x08] : [0x6a, 0x4a, 0x1c];
    // shadow, then the head
    put(x + 1, y + 1, [0x30, 0x2c, 0x28]); put(x + 2, y + 1, [0x50, 0x4c, 0x48]); put(x + 1, y + 2, [0x50, 0x4c, 0x48]);
    if (big) { put(x + 2, y + 2, [0x40, 0x3c, 0x38]); put(x - 1, y, midC); put(x, y - 1, midC); put(x + 1, y, loC); put(x, y + 1, loC); }
    put(x, y, hiC);
    if (!big) { put(x + 1, y, midC); put(x, y + 1, midC); put(x + 1, y + 1, loC); }
    else put(x + 1, y + 1, loC);
  }
}

const mouldCache = new Map();
export const KEY = 0xff00ff;

/** The bronze mould for an hour: a plate with the seal's line cut through it. */
export function mould(hh, light) {
  const key = hh;
  if (mouldCache.has(key)) return mouldCache.get(key);
  const seal = buildSeal(hh), cov = seal.cov;
  const cv = new Gfx(W, H), b = cv.buf;
  const { amb } = light;
  const L = [amb[0] * 1.25, amb[1] * 1.25, amb[2] * 1.25];
  const hole = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cov[y * W + x] > 0.3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (hole(x, y)) { b[k] = to565(KEY); continue; }
      const pat = (noise2(x / 6, y / 4, 31) - 0.5) * 18 + (speck[k] - 0.5) * 10;
      let v = 1;
      if (hole(x - 1, y - 1)) v = 1.55;          // the cut's far wall catches the light
      else if (hole(x + 1, y + 1)) v = 0.55;
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d === 2) v *= 1.35; else if (d === 3) v *= 0.7; else if (d === 0) v *= 0.5;   // a fillet round the edge
      // a little verdigris in the low spots
      const verd = noise2(x / 9, y / 7, 33) > 0.68 ? 1 : 0;
      const r = (PLATE[0] + pat - verd * 14) * v * L[0], g = (PLATE[1] + pat + verd * 10) * v * L[1], bb = (PLATE[2] + pat * 0.6 + verd * 8) * v * L[2];
      let c = dither565(r, g, bb, x, y);
      if (c === to565(KEY)) c ^= 1;
      b[k] = c;
    }
  mouldCache.set(key, cv);
  return cv;
}
