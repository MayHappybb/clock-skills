// Air Dancer scene: the used-car lot the tube men stand in.
//
// The still part (sky, showroom, the row of cars, the asphalt) is drawn once
// a minute into a scratch canvas, in colours that drift with the time of day,
// and copied in every frame. The moving parts are drawn per frame: the
// bunting swagged across the sky, glints sweeping the windscreens, the colon
// balloons, the blowers with their fans, the stars and the string lights.

import { Gfx, sin, cos, hash, clamp, progress, mix, to565 } from '../js/kit.js';

export const W = 160, H = 80;
export const INK = 0x1d1530;              // the keyline, also the blowers' shadow
export const SLOT_X = [22, 57, 103, 138];  // dancers' centres
export const COLON_X = 80;
export const NOZ_Y = 58.5;                // where every tube leaves its blower
export const BLOWER_Y = 59;

// ------------------------------------------------------------ time of day

// minute of day -> palette; the bg drifts between keys a minute at a time
const NIGHT = { top: 0x0d1430, bot: 0x223459, far: 0x161f3a, win: 0xa9783e, car: 0.22, lot: 0x22252e, line: 0x555a66, bunt: 0.45, lights: 1, stars: 1 };
const DAWN  = { top: 0x5b6aa8, bot: 0xf2b39a, far: 0x7f6f8f, win: 0xf6d590, car: 0.62, lot: 0x4a4b57, line: 0x9a98a0, bunt: 0.8, lights: 0.4, stars: 0.15 };
const DAY   = { top: 0x7fb6dc, bot: 0xd3ebe9, far: 0xa9c2c9, win: 0xc8dde6, car: 1.0, lot: 0x5b5e68, line: 0xc9c7bd, bunt: 1, lights: 0, stars: 0 };
const DUSK  = { top: 0x46407f, bot: 0xf0a06e, far: 0x6e5576, win: 0xf7cf7c, car: 0.6, lot: 0x433f4c, line: 0x8d8790, bunt: 0.8, lights: 0.6, stars: 0.25 };
const KEYS = [[0, NIGHT], [330, NIGHT], [400, DAWN], [470, DAY], [1010, DAY], [1090, DUSK], [1170, NIGHT], [1440, NIGHT]];

export function paletteAt(minuteOfDay) {
  let k = 1;
  while (KEYS[k][0] < minuteOfDay) k++;
  const [m0, a] = KEYS[k - 1], [m1, b] = KEYS[k], u = (minuteOfDay - m0) / (m1 - m0 || 1);
  const o = {};
  for (const key of Object.keys(a)) o[key] = typeof a[key] === 'number' && key !== 'car' && key !== 'bunt' && key !== 'lights' && key !== 'stars'
    ? mix(a[key], b[key], u) : a[key] + (b[key] - a[key]) * u;
  return o;
}

// ------------------------------------------------------------ the still lot (once a minute)

// muted lot stock: dusty teal, cream, grey, sage, faded brick, slate
const CARS = [
  { x: -10, c: 0x7fa3a6, flip: false }, { x: 19, c: 0xd9cfb6, flip: true }, { x: 46, c: 0xa2a6ae, flip: false },
  { x: 75, c: 0x93a68e, flip: true }, { x: 104, c: 0xc08a80, flip: false }, { x: 133, c: 0x8e9bb4, flip: true },
];
export const CAR_Y = 45;

const bg = new Gfx(W, H);
let bgKey = -1;
export let bgCost = null;

function car(g, x, c, flip, P) {
  const y = CAR_Y, w = 30;
  const body = mix(c, P.top, 1 - P.car), dark = mix(body, INK, 0.45), glass = mix(mix(0x3e4c5e, P.top, 0.35), P.win, P.lights * 0.25);
  // cabin: raked screen at the front
  const f = flip ? -1 : 1, x0 = flip ? x + w : x;
  const cab = [[x0 + f * 6, y + 6], [x0 + f * 10, y + 0.5], [x0 + f * 19, y + 0.5], [x0 + f * 24, y + 6]];
  g.fillPolygon(cab, body);
  g.fillPolygon([[x0 + f * 8, y + 5.6], [x0 + f * 11, y + 1.8], [x0 + f * 14.6, y + 1.8], [x0 + f * 14.6, y + 5.6]], glass);
  g.fillPolygon([[x0 + f * 15.8, y + 5.6], [x0 + f * 15.8, y + 1.8], [x0 + f * 18.6, y + 1.8], [x0 + f * 22, y + 5.6]], glass);
  g.fillRoundRect(x, y + 5.5, w, 7.5, 2.5, body);
  g.fillRect(Math.round(x + 1), y + 9, w - 2, 1, dark);
  for (const wx of [x + 7, x + w - 7]) { g.fillCircle(wx, y + 13, 3.1, mix(INK, P.lot, 0.25)); g.fillCircle(wx, y + 13, 1.2, mix(body, 0xffffff, 0.2)); }
}

/** The still lot for this minute, built once into a scratch canvas (its cost is billed to the frame that builds it). */
export function background(minuteKey, minuteOfDay) {
  if (bgKey === minuteKey) { bgCost = null; return bg; }
  bgKey = minuteKey;
  const P = paletteAt(minuteOfDay);
  for (const k of Object.keys(bg.cost)) bg.cost[k] = 0;
  // a screen-printed sky: flat bands, lightening to the horizon
  bg.fillRect(0, 0, W, 54, P.top);
  bg.fillRect(0, 27, W, 27, mix(P.top, P.bot, 0.45));
  bg.fillRect(0, 31, W, 23, mix(P.top, P.bot, 0.8));
  // the showroom: a long low glass box across the back
  bg.fillRect(0, 36, W, 18, P.far);
  bg.fillRect(0, 35, W, 1, mix(P.far, 0xffffff, 0.18));
  for (let x = 4; x < W; x += 13) bg.fillRect(x, 39, 9, 9, mix(P.far, P.win, 0.35 + 0.15 * P.lights));
  // the lot
  bg.fillRect(0, 54, W, H - 54, P.lot);
  bg.fillRect(0, 54, W, 1, mix(P.lot, P.line, 0.35));
  for (const c of CARS) car(bg, c.x, c.c, c.flip, P);
  // painted bay lines in the foreground, leaning away from the middle
  for (const x of [-4, 39, 80, 121, 164]) {
    const lean = (x - 80) / 16;
    bg.fillPolygon([[x - 0.8, 62], [x + 0.8, 62], [x + 0.8 + lean, 80], [x - 0.8 + lean, 80]], mix(P.line, P.lot, 0.4));
  }
  bgCost = { ...bg.cost };
  return bg;
}

// ------------------------------------------------------------ bunting

const PENN = [0xe0574a, 0xf2ead2, 0x4f86cf, 0xe9bf3f];
const NP = 21;
/** Pennants on a sagging string across the top, fluttering in the wind; `gust` 0..1 whips them. */
export function bunting(g, T, P, gust, wild) {
  const sag = 6.5 + 0.8 * sin(T * 0.9) + 1.5 * gust;
  const stringY = (x) => 1.2 + sag * (1 - ((x - 80) / 86) ** 2) + 0.6 * sin(T * 1.7 + x * 0.05);
  const lineC = mix(0x4a4038, P.top, 0.35);
  let px = -6, py = stringY(-6);
  for (let x = -2; x <= 166; x += 4) { const y = stringY(x); g.thickLine(px, py, x, y, 0.9, lineC, { aa: true }); px = x; py = y; }
  for (let i = 0; i < NP; i++) {
    const x = -3 + i * 8.2, y0 = stringY(x), y1 = stringY(x + 5.4);
    const fl = 1.4 * sin(T * 4.2 - i * 0.7) + gust * 2.8 * sin(T * 13 - i * 0.9) + wild * 1.6 * sin(T * 9 + i * 1.3);
    const tip = [x + 2.7 + fl, Math.max(y0, y1) + 6.2 - Math.abs(fl) * 0.3];
    const c = mix(mix(PENN[i % 4], P.top, 0.28), INK, 1 - P.bunt);
    g.fillPolygon([[x, y0], [x + 5.4, y1], tip], c, { aa: true });
    if (P.lights > 0.05) {
      // the string lights at night: a warm bulb at each knot
      const a = P.lights * (0.75 + 0.25 * sin(T * 3 + i * 2.1));
      g.fillCircle(x + 0.2, y0 + 0.4, 2.2, 0xffc46a, { aa: true, a: 0.25 * a });
      g.fillRect(Math.round(x - 0.3), Math.round(y0), 1, 1, mix(0xffe7b0, P.top, 1 - a));
    }
  }
}

// ------------------------------------------------------------ stars

export function stars(g, T, P) {
  if (P.stars < 0.05) return;
  for (let i = 0; i < 18; i++) {
    const h = hash(i, 71), x = h % W, y = 9 + ((h >>> 8) % 25);
    const tw = 0.55 + 0.45 * sin(T * (1 + (h >>> 20) % 3) + i);
    g.pixel(x, y, mix(P.top, 0xdfe6ff, P.stars * tw * 0.85));
  }
}

// ------------------------------------------------------------ windscreen glints

export function glints(g, T, P) {
  for (let i = 0; i < CARS.length; i++) {
    const c = CARS[i], per = 7, ph = (T + i * 2.3) % per;
    if (ph > 0.9) continue;
    const f = c.flip ? -1 : 1, x0 = c.flip ? c.x + 30 : c.x;
    const gx0 = Math.min(x0 + f * 8, x0 + f * 22), gx1 = Math.max(x0 + f * 8, x0 + f * 22);
    const sx = gx0 - 3 + (gx1 - gx0 + 6) * (ph / 0.9);
    g.clip(gx0, CAR_Y + 1.8, gx1 - gx0, 3.8);
    const fade = Math.sin(Math.PI * ph / 0.9);
    g.thickLine(sx, CAR_Y + 6, sx + 3, CAR_Y + 1, 1.6, 0xffffff, { aa: true, a: 0.75 * fade * (0.4 + 0.6 * P.car) });
    g.unclip();
  }
}

// ------------------------------------------------------------ the colon: two balloons tied to a stake

export function colon(g, T, beat, P, wild) {
  const sx = COLON_X, sy = 60;
  const bob = 1.2 * beat;
  const sw = 1.1 * sin(T * 1.3) + wild * 1.5 * sin(T * 4.1);
  const balls = [[sx - 1.2 + sw, 30 - bob], [sx + 1.4 + sw * 0.8, 43 - bob * 0.8]];
  const strC = mix(0x8c8478, P.top, 0.3);
  for (const [bx, by] of balls) g.thickLine(sx, sy, bx, by + 3.6, 0.8, strC, { aa: true });
  g.fillRect(sx - 1, sy - 1, 3, 3, mix(INK, P.lot, 0.3));
  balls.forEach(([bx, by], i) => {
    const c = i ? 0xe8e4ec : 0xf3f0e6;
    g.fillEllipse(bx, by, 3.5, 4.0, INK, { aa: true });
    g.fillEllipse(bx, by, 2.5, 3.0, c, { aa: true });
    g.fillRect(Math.round(bx - 1), Math.round(by + 3.6), 2, 1, INK);
    g.fillRect(Math.round(bx - 1.6), Math.round(by - 2), 1, 2, 0xffffff);
  });
}

// ------------------------------------------------------------ blowers

/** The squat fan box under each dancer; `run` 0..1 spins the fan, `jolt` kicks it on the beat. */
export function blower(g, cx, nozX, T, run, jolt, P) {
  const y = BLOWER_Y + Math.round(jolt * 0.6), x = cx - 11;
  const body = mix(0x3a3f4f, P.lot, 0.15), top = mix(0x596075, P.lot, 0.1), dark = mix(INK, body, 0.2);
  g.fillRect(x - 1, 69, 24, 2, mix(INK, P.lot, 0.45));               // its shadow on the asphalt
  g.fillRoundRect(x, y + 1, 22, 9, 2, dark);
  g.fillRoundRect(x + 1, y + 2, 20, 7, 1.5, body);
  g.fillRect(x + 2, y + 2, 18, 1, top);
  // the fan grille, front left, spinning
  const fx = x + 6.5, fy = y + 5.6, a = T * 18 * run;
  g.fillCircle(fx, fy, 2.7, dark);
  for (let k = 0; k < 2; k++) {
    const an = a + k * Math.PI / 2, dx = 2.3 * cos(an), dy = 2.3 * sin(an);
    g.thickLine(fx - dx, fy - dy, fx + dx, fy + dy, 1, mix(top, 0xffffff, 0.15), { aa: true });
  }
  // a power light
  g.fillRect(x + 16, y + 4, 2, 2, run > 0.5 ? 0x7dff6a : 0x5a3030);
  // the collar the tube is clamped into
  g.fillRoundRect(nozX - 5.5, y - 1.2, 11, 3, 1.2, dark);
  g.fillRect(Math.round(nozX - 4), y - 1, 8, 1, top);
}

export { to565, clamp, progress };
