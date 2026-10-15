// Toolkit for authoring faces: everything a design imports comes from here.
// Drawing lives in gfx.js, colour in color.js and type in fonts.js; all are
// re-exported.
//
// Everything here is deterministic and maps onto plain C: the noise is an
// integer hash, and kit.sin / kit.cos are table lookups, so a face that uses
// them costs the same on the device as it suggests here (cost.js).

import { countKit } from './cost.js';

export { Gfx, polar, segDist, roundRectDist, polygonDist, sprite } from './gfx.js';
export { rgb, hex, R, G, B, to565, from565, dither565, mix, scale, hsv, hexOf, PALETTES } from './color.js';
export { font3x5, font5x7, makeFont, strokeDigit, strokeText, digitSegments, segDigit, SEGMENTS, dotText } from './fonts.js';

export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, u) => a + (b - a) * u;
/** 0..1 progress of `v` through [a, b], clamped. */
export const progress = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

// ------------------------------------------------------------ cheap trig

const SIN_N = 1024;
const SIN_TABLE = Float32Array.from({ length: SIN_N + 1 }, (_, i) => Math.sin((i / SIN_N) * Math.PI * 2));

/**
 * sin from a 1024-entry table with linear interpolation: error under 2e-5,
 * a lookup and a lerp on the device instead of a soft-float series. Use it
 * in anything that runs per pixel.
 */
export function sin(a) {
  countKit('ksin');
  let u = (a / (Math.PI * 2)) % 1;
  if (u < 0) u += 1;
  if (u >= 1) u = 0; // a tiny negative angle rounds u + 1 to exactly 1.0
  const f = u * SIN_N, i = f | 0;
  return SIN_TABLE[i] + (SIN_TABLE[i + 1] - SIN_TABLE[i]) * (f - i);
}
export const cos = (a) => sin(a + Math.PI / 2);

// ------------------------------------------------------------ noise

/** A 32-bit integer hash of up to three integers: the base of all the noise. */
export function hash(x, y = 0, z = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Deterministic noise in [0, 1) from integers: the same input always gives the same output. */
export const rand = (x, y = 0, z = 0) => hash(x, y, z) / 4294967296;

/** A small seeded generator for a scene's layout: `const r = rng(seed); r()` gives [0, 1). */
export function rng(seed) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [0, 1). */
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return rand(i, seed) * (1 - u) + rand(i + 1, seed) * u;
}

/** Smooth 2D value noise in [0, 1). */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ------------------------------------------------------------ the clock

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Wall-clock fields for a timestamp, in local time. */
export function clockFields(date = new Date()) {
  const h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
  return {
    h, m, s,
    ms: date.getMilliseconds(),
    /** Seconds into the minute, with the fraction: 0 <= sec < 60. */
    sec: s + date.getMilliseconds() / 1000,
    hh: String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    ss: String(s).padStart(2, '0'),
    h12: h % 12 || 12,
    pm: h >= 12,
    dow: WEEKDAYS[date.getDay()],
    wday: date.getDay(),
    month: MONTHS[date.getMonth()],
    mon: date.getMonth() + 1,
    day: date.getDate(),
    year: date.getFullYear(),
    dd: String(date.getDate()).padStart(2, '0'),
    /** Minutes since the epoch: a stable seed for "this minute's" randomness. */
    minuteKey: Math.floor(date.getTime() / 60000),
  };
}

/** The clock fields one minute before `date`: what was showing before the turn. */
export function previousMinute(date) {
  return clockFields(new Date(date.getTime() - 60000));
}

/**
 * Night hours, shared by every design that dims: from 23:00 to 07:00, faded
 * in over the first minute and out over the last.
 */
export const NIGHT = { from: 23, to: 7 };

/**
 * How far into night dimming the panel is at `date`: 0 day, 1 night.
 * `mode` is 'auto' (by the clock), 'off' (never) or 'on' (always).
 * Designs read it as `ctx.night`, which the player computes with the
 * viewer's chosen mode, so night can be previewed or switched off.
 */
export function nightLevel(date, mode = 'auto') {
  if (mode === 'off') return 0;
  if (mode === 'on') return 1;
  const mins = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
  const from = NIGHT.from * 60, to = NIGHT.to * 60;
  if (mins >= from) return clamp(mins - from, 0, 1);
  if (mins < to - 1) return 1;
  if (mins < to) return clamp(to - mins, 0, 1);
  return 0;
}
