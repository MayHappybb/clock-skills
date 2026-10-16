// Fogged Glass: the street behind the window.
//
// Seen two ways at once. Through the wiped strokes it is "sharp": a dark wet
// street at night, every light an out-of-focus bokeh disc (our eye is on the
// glass, not on the street), with rain running down the OUTSIDE of the pane.
// Through the condensation it is only light: each lamp, sign and headlight a
// big soft glow in the milky fog. So one list of lights drives both: the
// sharp layer draws them as discs, the fog sums them as glows on a coarse grid.
//
// Static things (facades, windows, lamps, shop signs, their reflections on
// the road, beads of rain stuck to the glass) are rendered once per palette
// into a cached image (25.6 KB RAM) with their glow grid; moving and blinking
// things are drawn every frame.

import { Gfx, hash, rand, rng, clockFields } from '../js/kit.js';

const W = 160, H = 80;
export const GX = 21, GY = 11, GCELL = 8;     // fog glow grid: nodes every 8 px

// ------------------------------------------------------------ palettes (one per part of the day)
// sky top/bottom, facade top/bottom, road top/bottom, fog top/bottom, how many
// windows are lit, glow gain. Fog is the light the condensation scatters: pale
// by day, a lilac-grey at dusk, slate under the evening neon, a dim sodium
// grey late at night.
export const PALS = {
  day: { sky: [0x8a9aae, 0x6c7c90], bld: [0x40505e, 0x34404c], road: [0x3c4650, 0x262c34], fog: [0x9ea8b4, 0xaeb6c0], win: 0.16, glow: 0.45, neon: 0.55, lamp: 0.25, rim: 0xf6fafc },
  dusk: { sky: [0x34427e, 0x8c5888], bld: [0x1a1e3c, 0x14162c], road: [0x22223a, 0x141424], fog: [0x8a88ac, 0x9a94b2], win: 0.5, glow: 0.85, neon: 1, lamp: 1, rim: 0xf2eefa },
  eve: { sky: [0x101634, 0x2a2048], bld: [0x0c0e22, 0x090a18], road: [0x121224, 0x0a0a14], fog: [0x6c7290, 0x7a7c98], win: 0.42, glow: 1, neon: 1, lamp: 1, rim: 0xeef0fa },
  late: { sky: [0x0a0c18, 0x22181a], bld: [0x07070d, 0x050508], road: [0x0e0c10, 0x08080a], fog: [0x645c56, 0x70665c], win: 0.1, glow: 0.8, neon: 0.35, lamp: 1, rim: 0xd8d2cc },
};
export function palKey(h) { return h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : h >= 20 && h < 23 ? 'eve' : 'late'; }

export const SODIUM = 0xff9a3c, HEAD = 0xfff0d4, TAIL = 0xff2a24;
// the colon sign's neon, a new tube every hour
export const NEON = [0xff3d9a, 0x30dcff, 0xffb02a, 0x46ff8c, 0xb45cff, 0xff4a3a];

// ------------------------------------------------------------ the street (static layout)

export const ROAD_Y = 45;                      // kerb line; below it, wet road
const tops = new Uint8Array(W);                // roofline of the facades across the street
{
  const r = rng(77);
  let x = 0;
  while (x < W) {
    const w = 12 + Math.floor(r() * 18), top = 4 + Math.floor(r() * 18);
    for (let i = x; i < Math.min(W, x + w); i++) tops[i] = top;
    // a chimney or a water tank now and then
    if (r() < 0.4 && x + 6 < W) { const cx = x + 3 + Math.floor(r() * (w - 6)); for (let i = cx; i < Math.min(W, cx + 3); i++) tops[i] = Math.max(1, top - 3); }
    x += w;
  }
}
export const ROOF = tops;

/** Static lights: [x, y, sharp radius, colour, intensity, glow radius, kind]. kind: w window, l lamp, s sign. */
const STATIC = [];
{
  const r = rng(91);
  for (let x = 2; x < W - 2; x += 5)
    for (let y = tops[x] + 4; y < 32; y += 6) STATIC.push([x + 0.5 + r() * 1.5, y + r(), 1.6 + r() * 0.5, r() < 0.75 ? 0xffc878 : 0xa8ccff, 0.7 + 0.3 * r(), 9, 'w', r()]);
  for (const x of [24, 92, 150]) STATIC.push([x, 25, 3.4, SODIUM, 1, 22, 'l', 0]);
  for (const [x, c] of [[8, 0x36e0e8], [44, 0xff4438], [62, 0xffd060], [108, 0x50f088], [138, 0xff6ac0]]) {
    STATIC.push([x, 37.5, 3.8, c, 0.9, 18, 's', 0]);
    STATIC.push([x + 6, 38.5, 3.2, c, 0.7, 0, 's', 0]);
  }
}

// teal top-left, magenta top-right, sodium amber along the bottom
const WASH = [[10, 4, 52, 0x20c8e0, 0.5], [152, 8, 56, 0xf03ca8, 0.5], [70, 84, 64, 0xff9a3c, 0.42], [150, 84, 40, 0xff9a3c, 0.3]];

// ------------------------------------------------------------ colour helpers (integer RGB)

export const R8 = (c) => (c >> 16) & 255, G8 = (c) => (c >> 8) & 255, B8 = (c) => c & 255;
export function mixc(a, b, u) {
  const k = u <= 0 ? 0 : u >= 1 ? 256 : (u * 256) | 0;
  return (((R8(a) * (256 - k) + R8(b) * k) >> 8) << 16) | (((G8(a) * (256 - k) + G8(b) * k) >> 8) << 8) | ((B8(a) * (256 - k) + B8(b) * k) >> 8);
}

// ------------------------------------------------------------ the cached street image

const CACHE = new Map();

/** The static street for a palette and the hour's neon: an image and its glow grid. Built once, cached. */
export function streetFor(key, hourIdx) {
  const id = key;
  let c = CACHE.get(id);
  if (c) return c;
  const P = PALS[key];
  const g = new Gfx(W, H);
  const r = rng(key.length * 13 + 5);
  // sky, facades and road, by row
  for (let y = 0; y < H; y++) {
    const sky = mixc(P.sky[0], P.sky[1], y / 30), bld = mixc(P.bld[0], P.bld[1], y / 44), road = mixc(P.road[0], P.road[1], (y - ROAD_Y) / 35);
    for (let x = 0; x < W; x++) g.pixel(x, y, y >= ROAD_Y ? road : y >= tops[x] ? bld : sky, { dither: true });
  }
  // the kerb and the shopfront band, a little lighter
  g.fillRect(0, ROAD_Y - 1, W, 1, mixc(P.bld[1], 0x808890, 0.25));
  g.fillRect(0, 33, W, 9, mixc(P.bld[1], 0x000000, 0.3));
  // the overhead tram wire
  g.fillRect(0, 22, W, 1, mixc(P.sky[1], 0x000000, 0.55));
  const glow = new Float32Array(GX * GY * 3);
  for (const L of STATIC) {
    const [x, y, rad, col, inten, gr, kind, lit] = L;
    let k = inten;
    if (kind === 'w') { if (lit > P.win) continue; k *= 0.85; }
    if (kind === 'l') k *= P.lamp;
    if (kind === 's') k *= P.neon;
    if (k <= 0.02) continue;
    g.fillCircle(x, y, rad, col, { aa: true, a: Math.min(1, 0.85 * k) });
    if (kind !== 'w') reflect(g, x, rad, col, 0.42 * k);
    if (gr) addGlow(glow, x, y, gr, col, (kind === 'w' ? 0.2 : 0.55) * k * P.glow);
  }
  // big signs and the lamps out of frame: no disc, only their wash of colour in the mist
  for (const [x, y, R, col, k] of WASH) addGlow(glow, x, y, R, col, k * P.neon * P.glow);
  // rain stuck to the outside of the pane: tiny lenses, each a speck of light
  for (let i = 0; i < 110; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    g.pixel(x, y, 0xffe8c8, { a: 0.22 + 0.2 * r() });
    if (r() < 0.4) g.pixel(x, y + 1, 0x000000, { a: 0.3 });
  }
  c = { img: g, glow, cost: g.cost };
  CACHE.set(id, c);
  if (CACHE.size > 3) CACHE.delete(CACHE.keys().next().value);
  return c;
}

/** A light's streak on the wet road below the kerb, fading downward. */
export function reflect(g, x, rad, col, a) {
  const w = Math.max(2, Math.round(rad * 1.2));
  for (let k = 0; k < 6; k++) {
    const y0 = ROAD_Y + 1 + k * 5;
    g.fillRect(Math.round(x - w / 2), y0, w, 5, col, { a: a * (1 - k / 6) * (k === 0 ? 0.7 : 1) });
  }
}

/** Add a soft glow to the fog grid: (1 - d²/R²)² falloff. */
export function addGlow(grid, x, y, R, col, k) {
  const r = R8(col) * k, gg = G8(col) * k, b = B8(col) * k, R2 = R * R;
  const i0 = Math.max(0, Math.floor((x - R) / GCELL)), i1 = Math.min(GX - 1, Math.ceil((x + R) / GCELL));
  const j0 = Math.max(0, Math.floor((y - R) / GCELL)), j1 = Math.min(GY - 1, Math.ceil((y + R) / GCELL));
  let n = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const dx = i * GCELL - x, dy = j * GCELL - y, q = (dx * dx + dy * dy) / R2;
      n++;
      if (q >= 1) continue;
      const w = (1 - q) * (1 - q), o = (j * GX + i) * 3;
      grid[o] += r * w; grid[o + 1] += gg * w; grid[o + 2] += b * w;
    }
  return n;
}

// ------------------------------------------------------------ traffic (closed form in time)

/** The cars on the two lanes at time tg (s): [x, y, colour, radius, gap, glowK]. */
export function cars(tg, dense) {
  const out = [];
  // far lane: headlights coming towards the left
  const PA = 3.7;
  for (let n = Math.floor((tg - 7) / PA); n <= Math.floor(tg / PA); n++) {
    if (rand(n, 1, 5) > dense) continue;
    const t0 = n * PA + rand(n, 2, 5) * 1.6, v = 30 + 16 * rand(n, 3, 5), x = 176 - v * (tg - t0);
    if (tg < t0 || x < -16) continue;
    out.push([x, 49.5, HEAD, 2.1, 6, 0.55]);
  }
  // near lane: tail lights going right
  const PB = 4.3;
  for (let n = Math.floor((tg - 7) / PB); n <= Math.floor(tg / PB); n++) {
    if (rand(n, 1, 9) > dense) continue;
    const t0 = n * PB + rand(n, 2, 9) * 1.9, v = 34 + 18 * rand(n, 3, 9), x = -16 + v * (tg - t0);
    if (tg < t0 || x > 176) continue;
    out.push([x, 57.5, TAIL, 2.5, -8, 0.5]);
  }
  return out;
}

/** The hour's tram: front x at seconds u from the hour (negative before it), or null. */
export const TRAM_LEN = 112;
export function tramX(u) {
  const x = 172 - 60 * (u + 3.2);
  return x + TRAM_LEN < -12 || x > 172 ? null : x;
}

export { clockFields, hash };
