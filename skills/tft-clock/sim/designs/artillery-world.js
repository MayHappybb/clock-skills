// The world of artillery.js: the day's light, the terrain palette under it,
// the sky canvas (redrawn once a minute) and the clouds and stars on it.

import { Gfx, hex, mix, scale, to565, R, G, B, rand, noise, sin, clamp, lerp } from '../js/kit.js';
import { I } from './artillery-terrain.js';
import { SEA } from './artillery-plan.js';

export const HORIZON = 57;

// hour, sky top, sky at the horizon, far islands, sea, deep sea, light on things, night
const DAY = [
  [0, '121638', '2c2a62', '242656', '1e2c66', '0c1238', 0.95, 1],
  [5, '121638', '2c2a62', '242656', '1e2c66', '0c1238', 0.95, 1],
  [6.3, '3c3c80', 'f0a07a', '7a6488', '3e4c92', '1c2256', 0.86, 0.45],
  [7.6, '3f8ad8', 'bfe2f2', '8ab4cc', '3478c4', '1a3478', 1, 0],
  [16.8, '3f8ad8', 'c6e4f0', '8ab4cc', '3478c4', '1a3478', 1, 0],
  [18.3, '5458a8', 'ffae6a', 'a07c90', '4a5aa4', '1e2a66', 0.94, 0.15],
  [19.5, '2c2c6c', 'b4707c', '544a78', '2e3a7a', '141c4e', 0.9, 0.65],
  [20.7, '121638', '2c2a62', '242656', '1e2c66', '0c1238', 0.95, 1],
  [24, '121638', '2c2a62', '242656', '1e2c66', '0c1238', 0.95, 1],
].map(([h, ...r]) => [h, ...r.slice(0, 5).map(hex), r[5], r[6]]);

export function dayAt(hour) {
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  const m = (j) => mix(a[j], b[j], u);
  return { top: m(1), hor: m(2), far: m(3), sea: m(4), deep: m(5), light: lerp(a[6], b[6], u), night: lerp(a[7], b[7], u), hour };
}

// Terrain: warm earth against a cool sky and sea (the complement keeps the
// numerals off the background); grass a yellow-green that stays bright at night.
const BASE = [];
BASE[I.TIP] = hex('a6e458'); BASE[I.GR_HI] = hex('84cc3e'); BASE[I.GR] = hex('559e2e'); BASE[I.GR_DK] = hex('3c7024');
BASE[I.EDGE] = hex('3a2012');
['8c5634', '784828', 'b8723a', 'a05e30', 'cf8e4e', 'b47844', 'a24c32', '8a402a', '74625a', '605048'].forEach((c, k) => { BASE[I.BAND + k] = hex(c); });
BASE[I.PEB] = hex('d4c8b2'); BASE[I.PEB_DK] = hex('928674'); BASE[I.BONE] = hex('f2ead2');
const MOON = hex('9aa8e8');

/** The light of this minute: terrain palettes (RGB565) and a colour function for the actors. */
export function lighting(day) {
  const n = day.night, k = day.light;
  const lit = (c) => mix(scale(c, k), mix(c, MOON, 0.5), n * 0.28);
  const PAL = new Uint16Array(I.N), SCORCH = new Uint16Array(I.N);
  for (let j = 1; j < I.N; j++) {
    // at night the dark keyline turns into a moonlit rim, which is what parts the islands from the sky
    const c = j === I.EDGE ? mix(lit(BASE[j]), hex('a8b4f0'), 0.55 * n) : lit(BASE[j]);
    PAL[j] = to565(c); SCORCH[j] = to565(mix(c, 0x24140c, 0.68));
  }
  const cache = new Map();
  const L = (c) => { let v = cache.get(c); if (v === undefined) { v = lit(c); cache.set(c, v); } return v; };
  const debris = [BASE[I.GR_HI], BASE[I.BAND + 2], BASE[I.BAND + 4], BASE[I.BAND], BASE[I.EDGE]];
  // the front sea: per row below the surface, a tint and how much it covers
  const tint = new Uint16Array(24), alpha = new Uint16Array(24);
  for (let r = 0; r < 24; r++) { tint[r] = to565(mix(day.sea, day.deep, clamp(r / 13, 0, 1))); alpha[r] = Math.round(256 * clamp(0.6 + r * 0.035, 0, 0.92)); }
  const foam = to565(mix(mix(day.hor, 0xffffff, 0.6), MOON, n * 0.3)), band = to565(mix(day.sea, 0xffffff, 0.35));
  const smoke = mix(0x8a8a90, day.top, 0.25 + 0.4 * n);
  return { PAL, SCORCH, L, debris, tint, alpha, foam, band, smoke };
}

/** Sky, sun or moon, far islands and far sea: one canvas a minute. */
const BG = { key: -1, c: null };
export function background(key, day) {
  if (BG.key === key) return BG.c;
  const c = BG.c ?? new Gfx(160, 80);
  c.gradient(0, 0, 160, HORIZON, [day.top, mix(day.top, day.hor, 0.55), day.hor]);
  const h = day.hour;
  if (h > 6 && h < 19) {
    const u = (h - 6) / 13, sx = 12 + u * 136, sy = 46 - 38 * Math.sin(Math.PI * u);
    const sc = mix(hex('fff6c8'), hex('ffb060'), clamp(Math.abs(u - 0.5) * 2.4 - 1.2, 0, 1) + (u > 0.85 || u < 0.12 ? 0.5 : 0));
    for (let r = 13; r > 5; r -= 2.5) c.fillCircle(sx, sy, r, sc, { aa: true, a: 0.1 });
    c.fillCircle(sx, sy, 4.5, sc, { aa: true });
  } else {
    const u = (((h - 19) + 24) % 24) / 11, mx = 14 + u * 132, my = 40 - 30 * Math.sin(Math.PI * u);
    for (let s = 0; s < 22; s++) c.pixel(rand(s, 1) * 160, rand(s, 2) * (HORIZON - 6), mix(day.top, 0xffffff, 0.35 + 0.4 * rand(s, 3)));
    c.fillCircle(mx, my, 5, mix(day.top, 0xe8ecff, 0.2), { aa: true, a: 0.5 });
    c.fillCircle(mx, my, 3.6, hex('eef0ff'), { aa: true });
    c.fillCircle(mx + 1.7, my - 1, 3.1, mix(day.top, day.hor, 0.3), { aa: true });
  }
  // far islands on the horizon, hazed into the sky
  const far = mix(day.far, day.hor, 0.25);
  for (let x = 0; x < 160; x++) {
    const hgt = Math.max(0, 9 * noise(x * 0.045, 31) - 3.2) + Math.max(0, 5 * noise(x * 0.11, 37) - 2.4);
    if (hgt > 0.5) c.fillRect(x, Math.round(HORIZON - hgt), 1, Math.round(hgt), far);
  }
  c.gradient(0, HORIZON, 160, 80 - HORIZON, [mix(day.sea, day.hor, 0.45), day.sea]);
  c.hline(0, HORIZON, 160, mix(day.hor, 0xffffff, 0.3));
  BG.key = key; BG.c = c;
  return c;
}

/** Twinkling stars at night (a few, over the canvas). */
export function stars(g, day, T) {
  if (day.night < 0.3) return;
  for (let s = 0; s < 10; s++) {
    const tw = 0.5 + 0.5 * sin(T * (1.3 + rand(s, 9)) + s * 2.1);
    g.pixel((rand(s, 5) * 160) | 0, (rand(s, 6) * 40) | 0, 0xfff4d8, { a: day.night * tw * 0.8 });
  }
}

/** Cartoon cumulus, drifting with the wind's integral. */
export function clouds(g, day, D) {
  const col = mix(0xffffff, day.hor, 0.18 + 0.5 * day.night), shade = mix(col, day.top, 0.35);
  for (let k = 0; k < 4; k++) {
    const span = 220, sp = 0.6 + 0.25 * k;
    const x = (((rand(k, 21) * span + D * sp) % span) + span) % span - 30, y = 6 + k * 7 + 3 * rand(k, 22);
    const s = 0.7 + 0.35 * rand(k, 23), o = { aa: true, a: 0.88 - 0.35 * day.night };
    g.fillEllipse(x, y + 2.5 * s, 9 * s, 2.6 * s, shade, o);
    g.fillCircle(x - 4 * s, y + 0.8 * s, 3.3 * s, col, o);
    g.fillCircle(x + 1 * s, y - 1 * s, 4.4 * s, col, o);
    g.fillCircle(x + 5.5 * s, y + 1.2 * s, 2.9 * s, col, o);
  }
}
