// Greyfrog — the owner's rainbow frog, given back a third tone.
//
// `frog` lost the avatar's rainbow when it came to the glass: a dot is on or
// off, so the body is an outline. Here the body is filled with grey, made by
// time-division multiplexing two CGRAM pages. Every frame alternates between
// phase A and phase B. The outline, the glasses, the lips, the legs and the
// fly are lit in both phases, at full contrast. The body's fill dots are lit
// in one phase only, so the slow glass settles each at about half contrast.
//
// The fill is split into complementary patterns, so each phase lights the
// same number of fill dots and the body's average brightness stays constant
// while individual dots alternate. Two densities shade it like the avatar's
// gradient, as luminance: the red-orange left side and the blue-violet right
// are a 50% grey (every fill dot, alternating in a checkerboard: A lights one
// colour of the board, B the other); the yellow-green middle is a 25% grey
// (one dot in four lit per phase, A and B on opposite corners of each 2x2).
// A dot of clear body is kept round the lips, so the face reads against the
// grey; the mouth line, a full-contrast stroke through 25% grey, reads
// without one (a clear band round it too emptied the middle of the body).
//
// It keeps the frog's day: blinks behind the glasses, pupils that follow a
// fly, a kiss at :30, the catch at :58.6 (and the odd dodge: HMPH.), RIBBIT!
// with a puffed throat at :00, and the hop on the hour. At night it sleeps,
// breathing, with z's on the date row.
//
// Budget and bus: each phase is a full page of eight tiles, the same 42.4 ms
// on 100 kHz I2C as `frog`, so there it can alternate at most about 23 times
// a second. Declared for an 8-bit parallel bus at 60 frames a second (each
// frame about 4.5 ms), where the two phases alternate at 30 Hz: on the
// simulator's lag model the grey ripples about 12% peak to peak, a faint
// shimmer. On 400 kHz I2C (out of spec, but common) 60 fps also fits, at
// about 10.6 ms a frame. On 100 kHz I2C at 20 fps the ripple is about 35% at
// 10 Hz: a visible flicker, though the complementary split keeps the body as
// a whole steady.
//
// On real glass the grey is uncertain. Liquid crystal answers the RMS drive
// voltage through a steep, threshold-like curve set by the contrast pot, so
// a dot lit half the time may look nearly off or nearly as dark as the
// outline; the simulator averages linearly and draws it at half. Expect to
// turn the contrast pot to find the setting where the body is a grey and the
// outline still darker. The two grey levels were chosen to be far apart (25%
// and 50%), so that at least the gradient survives a nonlinear curve.
//
// Tried and dropped: a clear band of body round the mouth line as well as
// the lips; it emptied the middle of the body, and the line reads without it.
// Not built: a 4-phase version for finer levels (1/4, 2/4, 3/4). On the lag
// model at 60 fps a dot lit one phase in four ripples about 18% at 15 Hz,
// against 12% at 30 Hz for two phases, and on I2C the cycle would fall under
// 6 Hz. Spatial density (the 25% level) gives the gradient on two phases. A
// 75% level was left out on purpose: denser than 50%, the fill nears the
// full-contrast checkerboard that buried the lips in `frog`.

import { noise, smoothNoise, clamp } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const FPS = 60;
const PHASES = 2;
const W = 20, H = 16;                 // the canvas: cells 0-3, both rows
const mmX = (c) => Math.floor(c / 5) * MODULE.charPitchX + (c % 5) * MODULE.dotPitchX;
const mmY = (r) => Math.floor(r / 8) * MODULE.charPitchY + (r % 8) * MODULE.dotPitchY;

// The frog, as in `frog.js` (copied: that file keeps its parts private).
const BODY = { cx: 6.6, cy: 4.9, rx: 6.8, ry: 4.1 };
const BREATH = { cx: 6.6, cy: 4.75, rx: 7.1, ry: 4.3 };
const LENS = [5, 10];
const LASHES = [[0, 5], [0, 7], [1, 4], [0, 12], [0, 14], [1, 15]];
const LEGS = [3, 6, 11, 16];
const MOUTH = { row: 9, from: 7, to: 15 };
const LIPS = {
  rest: ['##.##', '#####', '.###.'],
  kiss: ['.###.', '##.##', '.###.'],
};
const LIPS_AT = { row: 8, col: 10 };
const SAC = { x: mmX(12), y: mmY(12) };

const inside = (body, r, c) => r >= 0 && r < H && c >= 0 && c < W
  && ((mmX(c) - body.cx) / body.rx) ** 2 + ((mmY(r) - body.cy) / body.ry) ** 2 <= 1;

const outlines = new Map();
function outline(body) {
  const k = `${body.cx},${body.cy},${body.rx},${body.ry}`;
  if (outlines.has(k)) return outlines.get(k);
  const dots = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (inside(body, r, c) && (!inside(body, r - 1, c) || !inside(body, r + 1, c)
      || !inside(body, r, c - 1) || !inside(body, r, c + 1))) dots.push([r, c]);
  }
  outlines.set(k, dots);
  return dots;
}

// ------------------------------------------------------------------- story

const KISS = [29.6, 31.4];
const CATCH = 58.6;
const TONGUE = { out: 0.45, hold: 0.2, back: 0.45 };
const TONGUE_ROOT = [8, 15];
const GULP = 0.6, CROAK = [0.7, 2.3];
const isNight = (h) => h >= 23 || h < 7;
const dodges = (minuteKey) => noise(minuteKey, 41) < 0.15;
const SPOTS = [[1, 1], [0, 9], [2, 18], [5, 18], [11, 4], [10, 7], [3, 2], [12, 17]];
const MOUTH_SPOT = [1, 18];

function glide(from, to, u, t, key) {
  const e = u * u * (3 - 2 * u), wob = Math.sin(Math.PI * u);
  const r = from[0] + (to[0] - from[0]) * e + (smoothNoise(t * 3, key) - 0.5) * 2 * wob;
  const c = from[1] + (to[1] - from[1]) * e + (smoothNoise(t * 3, key + 7) - 0.5) * 3 * wob;
  return [Math.round(r), Math.round(c)];
}

function flyAt(sec, key, t) {
  if (sec < 2 || sec >= CATCH + TONGUE.out) return null;
  const leg = Math.floor((sec - 2) / 2.5);
  const spot = (k) => (k < 0 ? [-1, 21] : SPOTS[Math.floor(noise(key * 13 + k, 3) * SPOTS.length)]);
  let from = spot(leg - 1), to = sec >= 56 ? MOUTH_SPOT : spot(leg);
  let u = clamp(((sec - 2) % 2.5) / 1.2, 0, 1);
  if (sec >= 56) { from = spot(Math.floor((56 - 2) / 2.5) - 1); u = clamp((sec - 56) / 1.5, 0, 1); }
  return glide(from, to, u, t, key);
}

function blinking(T) {
  const w = Math.floor(T / 3.7);
  const at = 0.4 + noise(w, 21) * 2.6;
  const d = T - w * 3.7;
  return (d >= at && d < at + 0.25) || (noise(w, 22) > 0.7 && d >= at + 0.45 && d < at + 0.7);
}

const CROUCH = [6, 13], SPLAT = [6, 7, 13], SETTLE = [13];
const HOP = [
  [0.6, 0, CROUCH],
  [1.0, 6, []], [1.15, 12, []], [1.3, 17, []],
  [2.0, 12, []], [2.15, 6, []],
  [2.3, 0, SPLAT], [2.6, 0, SETTLE],
  [2.75, 0, []],
];
const HOP_CROAK = [2.9, 4.5];

function catchAt(tc, missed) {
  const out = tc < TONGUE.out ? (Math.floor((tc / TONGUE.out) * 3) + 1) / 3
    : tc < TONGUE.out + TONGUE.hold ? 1 : 1 - (Math.floor(((tc - TONGUE.out - TONGUE.hold) / TONGUE.back) * 3) + 1) / 3;
  const [r0, c0] = TONGUE_ROOT;
  const tongue = out > 0 ? [Math.round(r0 + (MOUTH_SPOT[0] - r0) * out), Math.round(c0 + (MOUTH_SPOT[1] - c0) * out)] : null;
  if (missed) {
    const fly = tc < TONGUE.out - 0.15 ? MOUTH_SPOT : tc < TONGUE.out + 0.15 ? [0, 19] : null;
    return { tongue, fly };
  }
  return { tongue, fly: tc < TONGUE.out ? MOUTH_SPOT : tongue ? [tongue[0] - 1, tongue[1] + 1] : null };
}

function day(sec, fields, key, t, T) {
  const s = {
    body: BODY, lids: ['open', 'open'], pupil: [0, 1], lips: LIPS.rest, mouth: true, sac: 0,
    tongue: null, fly: flyAt(sec, key, t), lift: 0, squash: [], text: null,
  };
  const hour = fields.m === 0;
  const tc = sec - CATCH;
  if (tc >= 0 && tc < TONGUE.out + TONGUE.hold + TONGUE.back) Object.assign(s, catchAt(tc, dodges(key)));

  const missed = dodges(key - 1);
  const gulping = !missed && sec < GULP;
  const croakAt = hour ? HOP_CROAK : CROAK;
  const croak = !missed && sec >= croakAt[0] && sec < croakAt[1] ? (sec - croakAt[0]) / (croakAt[1] - croakAt[0]) : -1;
  if (croak >= 0) s.sac = [0, 1.3, 2.1, 1.3, 0, 1.3, 2.1, 1.3][Math.floor(croak * 8)];
  if (!missed && (croak >= 0 || (sec >= croakAt[1] && sec < croakAt[1] + 1.2))) s.text = 'RIBBIT!';
  if (missed && sec < 2.2) { s.text = 'HMPH.'; s.pupil = [-1, 1]; s.lids = ['half', 'half']; }

  const kissing = sec >= KISS[0] && sec < KISS[1];
  if (kissing) { s.lips = LIPS.kiss; s.mouth = false; s.text = 'MWAH!'; }

  if (hour) {
    const step = [...HOP].reverse().find(([at]) => sec >= at);
    if (step && sec < HOP[HOP.length - 1][0]) {
      s.lift = step[1]; s.squash = step[2];
      if (s.lift > 0) s.text = 'BOING!';
    }
  }

  const target = s.fly ?? (s.tongue ? MOUTH_SPOT : null);
  if (target) {
    const dr = target[0] - 3, dc = target[1] - 9.5;
    s.pupil = [Math.abs(dr) < 2 ? 0 : Math.sign(dr), Math.abs(dc) < 3 ? 0 : Math.sign(dc)];
  }
  if (gulping || kissing || (blinking(T) && !s.tongue && s.lids[0] === 'open')) s.lids = ['shut', 'shut'];
  return s;
}

function night(sec, T) {
  const s = {
    body: (T % 4.8) < 2.4 ? BREATH : BODY, lids: ['sleep', 'sleep'], pupil: [0, 1],
    lips: LIPS.rest, mouth: true, sac: 0, tongue: null, fly: null, lift: 0, squash: [], text: null, zzz: true,
  };
  if (sec < 2.2) { s.lids = ['half', 'sleep']; s.text = 'ribbit...'; s.zzz = false; }
  return s;
}

// ------------------------------------------------------------------ drawing

/** The full-contrast picture: every line of the frog, as in `frog`. */
function lines(s, wing) {
  const px = Array.from({ length: H }, () => Array(W).fill(false));
  const set = (r, c, v = true) => { if (r >= 0 && r < H && c >= 0 && c < W) px[r][c] = v; };
  for (const [r, c] of outline(s.body)) set(r, c);
  LENS.forEach((x0, k) => {
    for (let r = 0; r <= 6; r++) for (let c = x0; c < x0 + 5; c++) set(r, c, false);
    ['.###.', '#...#', '#...#', '#...#', '.###.'].forEach((l, i) =>
      [...l].forEach((ch, j) => { if (ch === '#') set(1 + i, x0 + j); }));
    const lid = s.lids[k];
    if (lid === 'shut') for (let i = 1; i <= 3; i++) set(3, x0 + i);
    else if (lid === 'sleep') { set(3, x0 + 1); set(4, x0 + 2); set(3, x0 + 3); }
    else if (lid === 'half') { for (let i = 1; i <= 3; i++) set(2, x0 + i); set(3, x0 + 2 + s.pupil[1]); }
    else set(3 + s.pupil[0], x0 + 2 + s.pupil[1]);
  });
  for (const [r, c] of LASHES) set(r, c);
  for (const c of LEGS) { set(13, c); set(14, c); set(15, c - 1); set(15, c + 1); }
  if (s.sac > 0) {
    for (let r = 8; r < H; r++) for (let c = 8; c < 17; c++) {
      const d = Math.hypot(mmX(c) - SAC.x, mmY(r) - SAC.y);
      if (d < s.sac - 0.35) set(r, c, false);
      else if (d < s.sac + 0.3) set(r, c);
    }
  }
  if (s.mouth) for (let c = MOUTH.from; c <= MOUTH.to; c++) set(MOUTH.row, c);
  s.lips.forEach((l, k) => [...l].forEach((ch, i) => { if (ch === '#') set(LIPS_AT.row + k, LIPS_AT.col + i); }));
  if (s.tongue) {
    const [r0, c0] = TONGUE_ROOT, [tr, tc] = s.tongue;
    const n = Math.max(Math.abs(tr - r0), Math.abs(tc - c0), 1);
    for (let k = 0; k <= n; k++) set(Math.round(r0 + ((tr - r0) * k) / n), Math.round(c0 + ((tc - c0) * k) / n));
    set(tr, tc + 1); set(tr - 1, tc);
  }
  if (s.fly) {
    const [r, c] = s.fly, up = wing ? 1 : 0;
    set(r, c); set(r - up, c - 1); set(r - up, c + 1);
  }
  return px;
}

/**
 * The body's grey, as a density 0, 0.25 or 0.5 per dot: the avatar's
 * gradient read as luminance. Red-orange on the left and blue-violet on the
 * right are darker than the yellow-green middle.
 */
function density(s, r, c) {
  const u = (mmX(c) - (s.body.cx - s.body.rx)) / (2 * s.body.rx);   // 0 at the left edge, 1 at the right
  if (u < 0.33) return 0.5;
  if (u < 0.62) return 0.25;
  return 0.5;
}

/**
 * The grey fill: the body's inside, less the glasses, the legs, the throat
 * sac when it is puffed, and a clear dot round the lips, the tongue and the fly.
 */
function fillMask(s, line) {
  const keep = Array.from({ length: H }, () => Array(W).fill(false));
  const clear = (r, c) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (keep[r + dr]) keep[r + dr][c + dc] = true; };
  s.lips.forEach((l, k) => [...l].forEach((ch, i) => { if (ch === '#') clear(LIPS_AT.row + k, LIPS_AT.col + i); }));
  if (s.tongue || s.fly) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    // A clear dot round the tongue and fly too, wherever they are.
    if (line[r][c] && !outline(s.body).some(([a, b]) => a === r && b === c) && r < 8 && c > 14) clear(r, c);
  }
  const fill = Array.from({ length: H }, () => Array(W).fill(0));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!inside(s.body, r, c) || line[r][c] || keep[r][c]) continue;
    if (r <= 6 && LENS.some((x0) => c >= x0 && c < x0 + 5)) continue;
    if (s.sac > 0 && Math.hypot(mmX(c) - SAC.x, mmY(r) - SAC.y) < s.sac + 0.6) continue;
    fill[r][c] = density(s, r, c);
  }
  return fill;
}

/**
 * Is a fill dot lit in this phase? 50%: a checkerboard, A one colour and B
 * the other. 25%: one dot of each 2x2, A the top-left, B the bottom-right.
 * Either way each phase lights the same number of dots.
 */
function litIn(phase, level, r, c) {
  if (level >= 0.5) return (r + c) % 2 === phase;
  if (level >= 0.25) return phase === 0 ? r % 2 === 0 && c % 2 === 0 : r % 2 === 1 && c % 2 === 1;
  return false;
}

/** Squash onto the feet and lift, as in `frog`. */
function transform(px, lift, drop, empty) {
  const kept = px.filter((_, y) => !drop.includes(y));
  const sunk = [...Array.from({ length: H - kept.length }, () => Array(W).fill(empty)), ...kept];
  return Array.from({ length: H }, (_, y) => sunk[y + lift] ?? Array(W).fill(empty));
}

const tile = (px, col, row) => px.slice(row * 8, row * 8 + 8)
  .map((r) => r.slice(col * 5, col * 5 + 5).map((v) => (v ? '#' : '.')).join(''));

const ZPATH = [[5, 0x7a], [7, 0x7a], [9, 0x5a], [11, 0x5a], [13, 0x5a], [15, 0x5a]];
function zees(T, bottom) {
  for (let k = 0; k < 4; k++) {
    const age = T - (Math.floor(T / 1.6) - k) * 1.6, i = Math.floor(age / 0.8);
    if (i < ZPATH.length) bottom[ZPATH[i][0]] = ZPATH[i][1];
  }
}

/** One phase's picture, for the design and for checking. */
export function picture(s, phase, wing) {
  const line = lines(s, wing);
  const fill = fillMask(s, line);
  const px = line.map((row, r) => row.map((on, c) => on || litIn(phase, fill[r][c], r, c)));
  return transform(px, s.lift, s.squash, false);
}

// ------------------------------------------------------------------- design

export default {
  name: 'Greyfrog',
  blurb: 'The rainbow frog with a grey body: two CGRAM pages alternated, so the fill is a half-tone third tone behind full-contrast lines.',
  bus: 'parallel8',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { t, fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const key = Math.floor(date.getTime() / 60000);
    const T = date.getTime() / 1000;
    const phase = Math.round(t * FPS) % PHASES;
    const s = isNight(fields.h) ? night(sec, T) : day(sec, fields, key, t, T);

    // The fly's wings beat at 10 Hz, independent of the phase rate.
    const px = picture(s, phase, Math.floor(t * 10) % 2 === 0);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) lcd.defineChar(row * 4 + col, tile(px, col, row));

    const top = Array(16).fill(0x20), bottom = Array(16).fill(0x20);
    for (let col = 0; col < 4; col++) { top[col] = col; bottom[col] = 4 + col; }
    const put = (arr, col, text) => [...text].forEach((ch, i) => { arr[col + i] = ch.charCodeAt(0); });
    put(top, 6, `${fields.hh}:${fields.mm}:${fields.ss}`);
    if (s.text) put(bottom, Math.max(4, 10 - Math.ceil(s.text.length / 2)), s.text);
    else if (s.zzz) zees(T, bottom);
    else put(bottom, 5, `${fields.dow} ${fields.dd} ${fields.month}`);

    lcd.setCursor(0, 0); top.forEach((c) => lcd.data(c));
    lcd.setCursor(0, 1); bottom.forEach((c) => lcd.data(c));
  },
};
