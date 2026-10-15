// Frog — a rainbow frog in glasses (the owner's avatar), keeping the time
// by eating it, and keeping frog hours.
//
// The left four cells are one 20x16-dot canvas, all eight tiles, redrawn every
// frame; the clock and date are ROM beside it. Anything drawn inside the
// canvas is free, so the frog is never short of slots.
//
// By day (07:00-22:59):
//   :02      a fly comes in at the top right and buzzes about
//   :30      the frog puckers up and blows it a kiss: MWAH!
//   :56      the fly settles above its head, out of reach
//   :58.6    the tongue flicks up, catches it and reels it in. About one
//            minute in seven the fly dodges, and the frog says HMPH.
//   :00      gulp: the minute turns, eyes shut, then the throat sac
//            inflates twice and it says RIBBIT!
//   on the hour it hops instead: squats, leaps clean off the top of the
//   glass, hangs out of sight for a beat, drops back and lands with a squash.
//
// By night (23:00-06:59) it sleeps. Its eyes are closed curves behind the
// glasses, it breathes (its belly swells and settles every 4.8 s), and
// z z Z Z drift away along the date row. The fly still comes, lands on
// its cheek and sits there; the frog does not notice. Each
// minute one eye opens a crack, it mumbles "ribbit..." and goes back to
// sleep. At 23:00 it yawns and says good night; at 07:00 it wakes with a
// start (!), blinks twice, crouches, puffs itself up in a big stretch and
// says MORNING!
//
// The body is an ellipse sampled in millimetres at the real dot centres
// (as `dial` and `moon` are), so it comes out round across the cell gaps.
// Its outline is the dots just inside the edge. The glasses are two 5x5
// rings, each exactly one cell, so no gap ever cuts through a lens. The
// face is drawn from the avatar: lashes up and out, lips right of centre on
// a long mouth line, four legs with toes splayed.
//
// The hop moves the frog by whole dot rows inside its own canvas, so it
// costs nothing: the same eight tiles, the clock untouched beside it. Each
// step of the leap holds 150 ms; under the LC lag the frog leaves a short
// streak, which reads as speed. The fly's wings flicker every frame, faster
// than the glass can follow, so on the hardware they are a blur, as a fly's
// are. Every other motion step holds 150 ms or more.

import { noise, smoothNoise, clamp } from '../js/kit.js';
import { MODULE } from '../js/panel.js';

const FPS = 10;
const W = 20, H = 16;                 // the canvas: cells 0-3, both rows
const mmX = (c) => Math.floor(c / 5) * MODULE.charPitchX + (c % 5) * MODULE.dotPitchX;
const mmY = (r) => Math.floor(r / 8) * MODULE.charPitchY + (r % 8) * MODULE.dotPitchY;

// The body: an ellipse, in mm from the canvas's top-left dot.
const BODY = { cx: 6.6, cy: 4.9, rx: 6.8, ry: 4.1 };
const BREATH = { cx: 6.6, cy: 4.75, rx: 7.1, ry: 4.3 };   // breathing in, asleep
const STRETCH = { cx: 6.6, cy: 4.6, rx: 7.3, ry: 4.5 };   // the morning stretch: a big breath in
const LENS = [5, 10];                 // left column of each lens; rows 1-5
const LASHES = [[0, 5], [0, 7], [1, 4], [0, 12], [0, 14], [1, 15]];
const LEGS = [3, 6, 11, 16];
const MOUTH = { row: 9, from: 7, to: 15 };
const LIPS = {
  rest: ['##.##', '#####', '.###.'],
  kiss: ['.###.', '##.##', '.###.'],
  yawn: ['.###.', '#...#', '.###.'],
};
const LIPS_AT = { row: 8, col: 10 };
const SAC = { x: mmX(12), y: mmY(12) };   // the throat sac's centre, under the lips

/** The outline of a body ellipse: the dots just inside its edge. */
const outlines = new Map();
function outline(body) {
  const k = `${body.cx},${body.cy},${body.rx},${body.ry}`;
  if (outlines.has(k)) return outlines.get(k);
  const inBody = (r, c) => r >= 0 && r < H && c >= 0 && c < W
    && ((mmX(c) - body.cx) / body.rx) ** 2 + ((mmY(r) - body.cy) / body.ry) ** 2 <= 1;
  const dots = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (inBody(r, c) && (!inBody(r - 1, c) || !inBody(r + 1, c) || !inBody(r, c - 1) || !inBody(r, c + 1))) dots.push([r, c]);
  }
  outlines.set(k, dots);
  return dots;
}

// ------------------------------------------------------------------- story

const KISS = [29.6, 31.4];
const CATCH = 58.6;                   // the tongue leaves the mouth
const TONGUE = { out: 0.45, hold: 0.2, back: 0.45 };   // three steps out, three back
const TONGUE_ROOT = [8, 15];          // where it leaves the lips
const GULP = 0.6, CROAK = [0.7, 2.3];

const isNight = (h) => h >= 23 || h < 7;
/** Does the fly get away this minute? About one minute in seven, by day. */
const dodges = (minuteKey) => noise(minuteKey, 41) < 0.15;

/** Points the fly visits, as [row, col], and the one in front of the mouth. */
const SPOTS = [[1, 1], [0, 9], [2, 18], [5, 18], [11, 4], [10, 7], [3, 2], [12, 17]];
const MOUTH_SPOT = [1, 18];           // up and to the right of its head
const PERCH = [7, 3];                 // its cheek, where the fly lands at night

/** Where the fly is at second `sec` of minute `key`, or null if it is not about. */
function flyAt(sec, key, t) {
  if (sec < 2 || sec >= CATCH + TONGUE.out) return null;
  // It enters at the top right, then hops between spots every 2.5 s, and
  // from :56 heads for the mouth.
  const leg = Math.floor((sec - 2) / 2.5);
  const spot = (k) => (k < 0 ? [-1, 21] : SPOTS[Math.floor(noise(key * 13 + k, 3) * SPOTS.length)]);
  let from = spot(leg - 1), to = sec >= 56 ? MOUTH_SPOT : spot(leg);
  let u = clamp(((sec - 2) % 2.5) / 1.2, 0, 1);
  if (sec >= 56) { from = spot(Math.floor((56 - 2) / 2.5) - 1); u = clamp((sec - 56) / 1.5, 0, 1); }
  return glide(from, to, u, t, key);
}

/** Smooth glide from one spot to another, with a drunken wobble mid-flight. */
function glide(from, to, u, t, key) {
  const e = u * u * (3 - 2 * u), wob = Math.sin(Math.PI * u);
  const r = from[0] + (to[0] - from[0]) * e + (smoothNoise(t * 3, key) - 0.5) * 2 * wob;
  const c = from[1] + (to[1] - from[1]) * e + (smoothNoise(t * 3, key + 7) - 0.5) * 3 * wob;
  return [Math.round(r), Math.round(c)];
}

/** At night: in at :10, down on its cheek by :14, sits until :40, gone by :45. */
function nightFlyAt(sec, key, t) {
  if (sec < 10 || sec >= 45) return null;
  if (sec < 14) return { at: glide([-1, 21], PERCH, (sec - 10) / 4, t, key), resting: false };
  if (sec < 40) return { at: PERCH, resting: true };
  return { at: glide(PERCH, [-2, -2], (sec - 40) / 5, t, key), resting: false };
}

/** Is the frog blinking? A blink every few seconds, sometimes two. */
function blinking(T) {
  const w = Math.floor(T / 3.7);
  const at = 0.4 + noise(w, 21) * 2.6;
  const d = T - w * 3.7;
  return (d >= at && d < at + 0.25) || (noise(w, 22) > 0.7 && d >= at + 0.45 && d < at + 0.7);
}

// The hop, by seconds into the hour: [start, rows lifted, rows squashed out].
// A squash takes out rows of body (6, 7: the cheeks) and leg (13: the
// knees), never the glasses or the lips, so the face stays whole while the
// frog sinks onto its feet. Rescaling the picture instead garbled the lenses.
const CROUCH = [6, 13], SPLAT = [6, 7, 13], SETTLE = [13];
const HOP = [
  [0.6, 0, CROUCH],
  [1.0, 6, []], [1.15, 12, []], [1.3, 17, []],   // up and out of the top
  [2.0, 12, []], [2.15, 6, []],                 // back down
  [2.3, 0, SPLAT], [2.6, 0, SETTLE],            // land, and settle
  [2.75, 0, []],
];
const HOP_CROAK = [2.9, 4.5];

/** The wake-up at 07:00, by seconds: what the eyes and body are doing. */
const WAKE = { start: 1.2, blinks: [[2.0, 2.2], [2.4, 2.6]], squat: [2.8, 3.2], reach: [3.2, 4.4], end: 4.4 };
/** Bedtime at 23:00: a yawn, heavy lids, asleep. */
const BED = { yawn: [0.8, 2.8], drowsy: [2.8, 4.4] };

// ------------------------------------------------------------------ drawing

function picture({ body = BODY, lids, pupil, lips, mouth, sac, tongue, fly, wing, resting }) {
  const px = Array.from({ length: H }, () => Array(W).fill(false));
  const set = (r, c, v = true) => { if (r >= 0 && r < H && c >= 0 && c < W) px[r][c] = v; };
  for (const [r, c] of outline(body)) set(r, c);

  // The glasses hide the body behind them.
  LENS.forEach((x0, k) => {
    for (let r = 0; r <= 6; r++) for (let c = x0; c < x0 + 5; c++) set(r, c, false);
    ['.###.', '#...#', '#...#', '#...#', '.###.'].forEach((l, i) =>
      [...l].forEach((ch, j) => { if (ch === '#') set(1 + i, x0 + j); }));
    const lid = lids[k];
    if (lid === 'shut') for (let i = 1; i <= 3; i++) set(3, x0 + i);       // a line across the lens
    else if (lid === 'sleep') { set(3, x0 + 1); set(4, x0 + 2); set(3, x0 + 3); }   // a closed eye, curved down
    else if (lid === 'half') { for (let i = 1; i <= 3; i++) set(2, x0 + i); set(3, x0 + 2 + pupil[1]); }
    else set(3 + pupil[0], x0 + 2 + pupil[1]);
  });
  for (const [r, c] of LASHES) set(r, c);
  for (const c of LEGS) { set(13, c); set(14, c); set(15, c - 1); set(15, c + 1); }

  // The throat sac: a bubble under the lips, over the body line.
  if (sac > 0) {
    for (let r = 8; r < H; r++) for (let c = 8; c < 17; c++) {
      const d = Math.hypot(mmX(c) - SAC.x, mmY(r) - SAC.y);
      if (d < sac - 0.35) set(r, c, false);
      else if (d < sac + 0.3) set(r, c);
    }
  }

  if (mouth) for (let c = MOUTH.from; c <= MOUTH.to; c++) set(MOUTH.row, c);
  lips.forEach((l, k) => [...l].forEach((ch, i) => {
    if (ch === '#') set(LIPS_AT.row + k, LIPS_AT.col + i);
    else if (lips === LIPS.yawn) set(LIPS_AT.row + k, LIPS_AT.col + i, false);   // the yawn is a hole
  }));

  if (tongue) {
    // A straight line from the lips to the tip, over everything, and a
    // sticky blob on the end.
    const [r0, c0] = TONGUE_ROOT, [tr, tc] = tongue;
    const n = Math.max(Math.abs(tr - r0), Math.abs(tc - c0), 1);
    for (let k = 0; k <= n; k++) set(Math.round(r0 + ((tr - r0) * k) / n), Math.round(c0 + ((tc - c0) * k) / n));
    set(tr, tc + 1); set(tr - 1, tc);
  }
  if (fly) {
    // A body and two wings that flap up and down every frame, or fold up
    // into a little v when it has landed.
    const [r, c] = fly;
    const up = resting || wing ? 1 : 0;
    set(r, c);
    set(r - up, c - 1); set(r - up, c + 1);
  }
  return px;
}

/**
 * Squash the picture onto its feet by taking out the rows in `drop` (what is
 * above them sinks), then move it up by `lift` whole dot rows. Both keep it
 * inside its canvas.
 */
function transform(px, lift, drop) {
  const kept = px.filter((_, y) => !drop.includes(y));
  const sunk = [...Array.from({ length: H - kept.length }, () => Array(W).fill(false)), ...kept];
  return Array.from({ length: H }, (_, y) => sunk[y + lift] ?? Array(W).fill(false));
}

const tile = (px, col, row) => px.slice(row * 8, row * 8 + 8)
  .map((r) => r.slice(col * 5, col * 5 + 5).map((v) => (v ? '#' : '.')).join(''));

// --------------------------------------------------------------- the frames

/** The tongue, and the fly on it, during a catch at `tc` seconds in. */
function catchAt(tc, missed) {
  const out = tc < TONGUE.out ? (Math.floor((tc / TONGUE.out) * 3) + 1) / 3
    : tc < TONGUE.out + TONGUE.hold ? 1 : 1 - (Math.floor(((tc - TONGUE.out - TONGUE.hold) / TONGUE.back) * 3) + 1) / 3;
  const [r0, c0] = TONGUE_ROOT;
  const tongue = out > 0 ? [Math.round(r0 + (MOUTH_SPOT[0] - r0) * out), Math.round(c0 + (MOUTH_SPOT[1] - c0) * out)] : null;
  if (missed) {
    // The fly sits until the tongue is nearly there, then is off, up and out.
    const fly = tc < TONGUE.out - 0.15 ? MOUTH_SPOT : tc < TONGUE.out + 0.15 ? [0, 19] : null;
    return { tongue, fly };
  }
  return { tongue, fly: tc < TONGUE.out ? MOUTH_SPOT : tongue ? [tongue[0] - 1, tongue[1] + 1] : null };
}

/** A day frame: everything the frog does while awake. `hops` is false at 07:00. */
function day(sec, fields, key, t, T, hops = true) {
  const s = {
    lids: ['open', 'open'], pupil: [0, 1], lips: LIPS.rest, mouth: true, sac: 0,
    tongue: null, fly: flyAt(sec, key, t), lift: 0, squash: [], text: null,
  };
  const hour = fields.m === 0 && hops;

  // The catch at the end of the minute.
  const tc = sec - CATCH;
  if (tc >= 0 && tc < TONGUE.out + TONGUE.hold + TONGUE.back) Object.assign(s, catchAt(tc, dodges(key)));

  // The start of the minute: the last catch landed, or did not.
  const missed = dodges(key - 1) && hops;
  const gulping = !missed && sec < GULP;
  const croakAt = hour ? HOP_CROAK : CROAK;
  const croak = !missed && sec >= croakAt[0] && sec < croakAt[1] ? (sec - croakAt[0]) / (croakAt[1] - croakAt[0]) : -1;
  if (croak >= 0) s.sac = [0, 1.3, 2.1, 1.3, 0, 1.3, 2.1, 1.3][Math.floor(croak * 8)];
  if (!missed && (croak >= 0 || (sec >= croakAt[1] && sec < croakAt[1] + 1.2))) s.text = 'RIBBIT!';
  if (missed && sec < 2.2) { s.text = 'HMPH.'; s.pupil = [-1, 1]; s.lids = ['half', 'half']; }

  const kissing = sec >= KISS[0] && sec < KISS[1];
  if (kissing) { s.lips = LIPS.kiss; s.mouth = false; s.text = 'MWAH!'; }

  // The hop, on the hour.
  if (hour) {
    const step = [...HOP].reverse().find(([at]) => sec >= at);
    if (step && sec < HOP[HOP.length - 1][0]) {
      s.lift = step[1]; s.squash = step[2];
      if (s.lift > 0) s.text = 'BOING!';
    }
  }

  // The pupils follow the fly, or look at the clock when there is none.
  const target = s.fly ?? (s.tongue ? MOUTH_SPOT : null);
  if (target) {
    const dr = target[0] - 3, dc = target[1] - 9.5;
    s.pupil = [Math.abs(dr) < 2 ? 0 : Math.sign(dr), Math.abs(dc) < 3 ? 0 : Math.sign(dc)];
  }
  if (gulping || kissing || (blinking(T) && !s.tongue && s.lids[0] === 'open')) s.lids = ['shut', 'shut'];
  return s;
}

/** A night frame: asleep, breathing, dreaming of flies. */
function night(sec, fields, key, t, T) {
  const s = {
    lids: ['sleep', 'sleep'], pupil: [0, 1], lips: LIPS.rest, mouth: true, sac: 0,
    tongue: null, fly: null, resting: false, lift: 0, squash: [], text: null, zzz: true,
  };
  // Breathing: the belly swells for 2.4 s, then settles for 2.4 s. The
  // swollen body is one dot wider each side and one higher. (Breathing with
  // the throat sac was tried first; it looked like the croak.)
  if ((T % 4.8) < 2.4) s.body = BREATH;
  const f = nightFlyAt(sec, key, t);
  if (f) { s.fly = f.at; s.resting = f.resting; }

  // Each minute, one eye opens a crack and it mumbles.
  if (sec < 2.2) { s.lids = ['half', 'sleep']; s.text = 'ribbit...'; s.zzz = false; }
  return s;
}

/** 07:00 and 23:00: waking up, and going to bed. `s` is the day frame. */
function wake(sec, s) {
  if (sec >= WAKE.end + 3) return sec < 8 ? { ...s, fly: null } : s;
  const out = { ...s, fly: null, tongue: null, sac: 0, pupil: [0, 0], lids: ['open', 'open'], text: sec < 2.0 ? '!' : 'MORNING!' };
  if (sec < WAKE.start) return { ...out, lids: ['sleep', 'sleep'], text: null, zzz: true };
  if (WAKE.blinks.some(([a, b]) => sec >= a && sec < b)) out.lids = ['shut', 'shut'];
  if (sec >= WAKE.squat[0] && sec < WAKE.squat[1]) out.squash = CROUCH;
  // The stretch: puffed up as big as the canvas allows, eyes squeezed shut.
  // (Rising onto its toes was tried; lifting the frog cut its lashes off.)
  if (sec >= WAKE.reach[0] && sec < WAKE.reach[1]) { out.body = STRETCH; out.lids = ['shut', 'shut']; }
  return out;
}

function bedtime(sec, s) {
  if (sec >= BED.drowsy[1]) return s;
  const out = { ...s, zzz: false, fly: null, sac: 0 };
  if (sec < GULP) return { ...out, lids: ['shut', 'shut'], text: null };
  if (sec < BED.yawn[0]) return { ...out, lids: ['open', 'open'], text: null };
  if (sec < BED.yawn[1]) return { ...out, lids: ['shut', 'shut'], lips: LIPS.yawn, mouth: false, text: 'YAAAWN...' };
  return { ...out, lids: ['half', 'half'], pupil: [1, 0], text: 'GOOD NIGHT' };
}

/**
 * The ROM z's, on the date row: one is born every 1.6 s beside the frog and
 * drifts away, a small z growing into a capital. They stay off the top row,
 * where a Z beside the seconds read as part of the time.
 */
const ZPATH = [[5, 0x7a], [7, 0x7a], [9, 0x5a], [11, 0x5a], [13, 0x5a], [15, 0x5a]];
const Z_EVERY = 1.6, Z_STEP = 0.8;
function zees(T, bottom) {
  for (let k = 0; k < 4; k++) {
    const age = T - (Math.floor(T / Z_EVERY) - k) * Z_EVERY;      // seconds since this z was born
    const i = Math.floor(age / Z_STEP);
    if (i < ZPATH.length) bottom[ZPATH[i][0]] = ZPATH[i][1];
  }
}

// ------------------------------------------------------------------- design

export default {
  name: 'Frog',
  blurb: 'A frog in glasses catches a fly every minute, hops on the hour, and sleeps at night with z\'s drifting up.',
  bus: 'i2c100',
  panel: 'green',
  fps: FPS,

  frame(lcd, api, { t, fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const key = Math.floor(date.getTime() / 60000);
    const T = date.getTime() / 1000;
    const hour = fields.m === 0;

    let s = isNight(fields.h) ? night(sec, fields, key, t, T) : day(sec, fields, key, t, T);
    if (fields.h === 7 && hour) s = wake(sec, day(sec, fields, key, t, T, false));
    if (fields.h === 23 && hour) s = bedtime(sec, s);

    const px = transform(picture({ ...s, wing: Math.round(t * FPS) % 2 === 0 }), s.lift, s.squash);
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
