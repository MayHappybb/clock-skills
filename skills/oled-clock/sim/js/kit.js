// Toolkit for authoring clock faces: everything a design imports comes from
// here. Drawing lives in gfx.js and type in fonts.js; both are re-exported.

export { Gfx, ON, OFF, XOR, dither, polar, segDist, sprite, roundRectTest } from './gfx.js';
export { font3x5, font5x7, makeFont, strokeDigit, strokeText, digitSegments, segDigit, SEGMENTS, dotText } from './fonts.js';

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t ** 3,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, u) => a + (b - a) * u;
/** 0..1 progress of `v` through [a, b], clamped. */
export const progress = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

/** Deterministic value noise in [0,1): the same input always gives the same output. */
export function noise(x, seed = 0) {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothNoise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return noise(i, seed) * (1 - u) + noise(i + 1, seed) * u;
}

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
    month: MONTHS[date.getMonth()],
    day: date.getDate(),
    year: date.getFullYear(),
    dd: String(date.getDate()).padStart(2, '0'),
    /** Minutes since the epoch: a stable seed for "this minute's" randomness. */
    minuteKey: Math.floor(date.getTime() / 60000),
  };
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
 * viewer's chosen mode, so night dimming can be previewed or switched off.
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

/** The clock fields one minute before `date`: what was showing before the turn. */
export function previousMinute(date) {
  return clockFields(new Date(date.getTime() - 60000));
}

/**
 * Where an orbiting offset should be now, for burn-in protection: a slow
 * walk around a small square, one step every `stepMinutes`, so no pixel
 * stays lit in the same place for hours. Returns integer [dx, dy] in
 * [-r, r]. Deterministic from the date.
 */
export function orbit(date, r = 2, stepMinutes = 3) {
  const path = [];
  for (let x = -r; x < r; x++) path.push([x, -r]);
  for (let y = -r; y < r; y++) path.push([r, y]);
  for (let x = r; x > -r; x--) path.push([x, r]);
  for (let y = r; y > -r; y--) path.push([-r, y]);
  if (!path.length) return [0, 0];
  // Steps land at :30, not on the minute, so a shift never coincides with a
  // minute-turn transition.
  const k = Math.floor((date.getTime() - 30000) / 60000 / stepMinutes);
  return path[((k % path.length) + path.length) % path.length];
}
