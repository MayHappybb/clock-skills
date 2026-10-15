// F-91W — the Casio F-91W, the best-selling digital watch there is, worn on
// the OLED.
//
// The whole printed face is here, as on the watch: CASIO and the model name,
// the LIGHT and ALARM CHRONOGRAPH legends with their red button arrows, the
// window, MODE and ALARM ON·OFF/24HR, WATER [WR] RESIST. Inside the window is
// the F-91W's own LCD, segment for segment, measured from a photograph of
// the watch and from a vector trace of every segment lit (Alexis Philip's
// Casio-F-91W, MIT): the leaning time with its two square colon dots, the
// smaller seconds, the day of the week and the date on the top row, the
// time-signal speaker, the alarm bell, PM / 24H and LAP.
//
// The glass's quirks are kept. The first day letter has a split centre bar
// (that is how the F-91W writes M, W and T); the second has a stray segment
// at its top left and can't light its sides by halves, so its R is a bare
// gamma; the date's tens digit has no upper-left segment at all, since it
// only ever shows 1, 2 or 3 (the Sensor Watch project's map of the panel).
// Each digit is a labelled picture, a pixel per segment, leaned by one pixel
// over its upper half so verticals stay straight.
//
// It is drawn emissively: lit segments are light on black, and the unlit
// ones show through as a sparse dither, the way an LCD's unlit segments are
// faintly visible. Liquid crystal is slow, so a segment that changes fades
// in over ~0.1 s and out over ~0.2 s: the response is replayed in 20 ms
// steps over the last 0.4 s, from the clock.
//
// Every minute the LIGHT button is held from just before the turn (its arrow
// lights) and the micro-light comes on: the window becomes a lit LCD again,
// dark segments on glass that is bright by the LED at its left edge and dims
// across it, each segment ringed by clear glass so it reads against the
// dither. The new minute arrives under the light. On the hour the time
// signal beeps twice (the glass inverts with each beep, a one-byte register),
// the light stays on longer, and the 24HR button is pressed twice: the hour
// is shown in 12-hour form, with PM, for a few seconds. At 07:00 the daily
// alarm rings in the dark, the bell blinking beep-beep-beep-beep, until the
// wearer slaps LIGHT, which on the F-91W silences it. The time shown is
// always right: only formats change, never the hour.
//
// Burn-in: the face walks a six-step loop, a pixel at a time, every three
// minutes; from 23:00 to 07:00 the panel runs at low contrast.

import { sprite, makeFont, dither, clamp } from '../js/kit.js';

// ------------------------------------------------------------ segment art
// Each digit cell is drawn upright as a labelled picture: every pixel says
// which segment it belongs to (a-g as usual, i/j the centre bars of the first
// day letter, x the stray segment of the second). The cell is then leaned
// by shifting rows, as the F-91W's digits lean.

const MAIN = `
  .aaaaaaaaaaaaa.
  f.aaaaaaaaaaa.b
  ff.aaaaaaaaa.bb
  fff.........bbb
  fff.........bbb
  fff.........bbb
  fff.........bbb
  fff.........bbb
  fff.........bbb
  ff...........bb
  f..ggggggggg..b
  ..ggggggggggg..
  e..ggggggggg..c
  ee...........cc
  eee.........ccc
  eee.........ccc
  eee.........ccc
  eee.........ccc
  eee.........ccc
  eee.........ccc
  ee.ddddddddd.cc
  e.ddddddddddd.c
  .ddddddddddddd.
`;
const SECS = `
  .aaaaaaaa.
  f.aaaaaa.b
  ff......bb
  ff......bb
  ff......bb
  ff......bb
  f........b
  ..gggggg..
  ..gggggg..
  e........c
  ee......cc
  ee......cc
  ee......cc
  ee......cc
  e.dddddd.c
  .dddddddd.
`;
const TOP = `
  .aaaaa.
  f.....b
  ff...bb
  f.....b
  .ggggg.
  e.....c
  ee...cc
  e.....c
  .ddddd.
`;
// Position 0 has a centre bar in two halves (for M, W, T).
const TOP0 = `
  .aaaaa.
  f..i..b
  ff.i.bb
  f..i..b
  .ggggg.
  e..j..c
  ee.j.cc
  e..j..c
  .ddddd.
`;
// Position 1 has a stray segment at its top left (Casio's T descender).
const TOP1 = `
  xx.aaaaa.
  ...f.....b
  ...ff...bb
  ...f.....b
  ....ggggg.
  ...e.....c
  ...ee...cc
  ...e.....c
  ....ddddd.
`;

/** Parse a labelled picture into { seg: [[x,y]...] }, leaned by k. */
function cell(picture, x0, y0, k, prefix, dx = 0) {
  const rows = picture.split('\n').filter((l) => l.trim()).map((l) => l.replace(/^\s+/, ''));
  const h = rows.length, out = {};
  rows.forEach((row, r) => {
    const sh = Math.round((h - 1 - r) * k);
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.' || ch === ' ') continue;
      (out[prefix + ch] ??= []).push([x0 + c + sh - dx, y0 + r]);
    }
  });
  return out;
}

const DIGIT_SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

// Icons, each one segment of its own.
const ICONS = {
  // the hourly time signal: a speaker and its sound
  sig: `
    ss..s..s..s
    sss..s..s..s
    sss..s..s..s
    ss..s..s..s`,
  // the daily alarm: a bell
  bel: `
    ..s..
    .sss.
    .sss.
    sssss
    ..s..`,
  pm: `
    sss.s...s
    s.s.ss.ss
    sss.s.s.s
    s...s...s`,
  h24: `
    ss..s.s.s.s
    ..s.s.s.sss
    .s..sss.s.s
    sss...s.s.s`,
  lap: `
    s...sss.ss.
    s...s.s.s.s
    s...sss.ss.
    s...s.s.s..
    sss.s.s.s..`,
};

// ------------------------------------------------------------ the LCD

/** Every segment on the glass, at the face's rest position: { id, px: [[x,y]...] }. */
const SEGS = [];
const SEG = {};
function addCell(c, rename) {
  for (const [id, px] of Object.entries(c)) { const k = rename ?? id; SEG[k] = SEGS.length; SEGS.push({ id: k, px }); }
}

const MAIN_Y = 24;
const MAIN_X = [13, 30, 53, 70], SEC_X = [89, 101];
for (let i = 0; i < 4; i++) addCell(cell(MAIN, MAIN_X[i], MAIN_Y, 0.044, String(4 + i)));
for (let i = 0; i < 2; i++) addCell(cell(SECS, SEC_X[i], MAIN_Y + 7, 0.066, String(8 + i)));
addCell({ colon: [[48, 30], [49, 30], [48, 31], [49, 31], [47, 39], [48, 39], [47, 40], [48, 40]] });

const TOP_Y = 14;
addCell(cell(TOP0, 45, TOP_Y, 0.12, '0'));
addCell(cell(TOP1, 56, TOP_Y, 0.12, '1', 3));
addCell(cell(TOP.replace(/f/g, '.'), 94, TOP_Y, 0.12, '2'));
addCell(cell(TOP, 104, TOP_Y, 0.12, '3'));
addCell(cell(ICONS.sig, 12, TOP_Y, 0, ''), 'sig');
addCell(cell(ICONS.bel, 28, TOP_Y, 0, ''), 'bel');
addCell(cell(ICONS.pm, 12, TOP_Y + 5, 0, ''), 'pm');
addCell(cell(ICONS.h24, 23, TOP_Y + 5, 0, ''), 'h24');
addCell(cell(ICONS.lap, 74, TOP_Y + 4, 0, ''), 'lap');

/** Which segment each rest-position pixel belongs to (-1: none). */
const OWNER = new Int16Array(128 * 64).fill(-1);
SEGS.forEach((s, i) => { for (const [x, y] of s.px) OWNER[y * 128 + x] = i; });

// The window the LCD sits in, at rest.
const WIN = { x: 4, y: 12, w: 120, h: 37, r: 3 };

// ------------------------------------------------------------ what the watch shows

const DAY_LETTERS = {
  // first letter, position 0 (its centre bar makes M, W and T)
  S: 'acdfg', M: 'abcefij', T: 'aij', W: 'bcdefij', F: 'aefg',
  // second letter, position 1 (B/C and E/F are wired together there)
  U: 'bcdef', O: 'abcdef', E: 'adefg', H: 'bcefg', R: 'aef', A: 'abcefg',
};
const DOW2 = { SUN: 'SU', MON: 'MO', TUE: 'TU', WED: 'WE', THU: 'TH', FRI: 'FR', SAT: 'SA' };

/**
 * The lit segments for the watch at clock fields `f`, in timekeeping mode.
 * `ev` says what the wearer is doing (events()): 12-hour format, the alarm.
 */
function displayState(f, ev) {
  const on = new Uint8Array(SEGS.length);
  const lite = (pos, names) => { for (const n of names) { const i = SEG[`${pos}${n}`]; if (i !== undefined) on[i] = 1; } };
  const put = (pos, d) => { if (d !== null) lite(pos, DIGIT_SEGS[d]); };
  const h = ev.h12 ? f.h12 : f.h;
  put(4, h >= 10 ? Math.floor(h / 10) : null); put(5, h % 10);
  put(6, Math.floor(f.m / 10)); put(7, f.m % 10);
  put(8, Math.floor(f.s / 10)); put(9, f.s % 10);
  put(2, f.day >= 10 ? Math.floor(f.day / 10) : null); put(3, f.day % 10);
  const dw = DOW2[f.dow];
  lite(0, DAY_LETTERS[dw[0]]); lite(1, DAY_LETTERS[dw[1]]);
  on[SEG.colon] = 1;
  on[SEG.sig] = 1;                         // the hourly time signal is on
  on[SEG.bel] = ev.bell ? 1 : 0;           // the daily alarm is on (it blinks while ringing)
  if (ev.h12) on[SEG.pm] = f.pm ? 1 : 0; else on[SEG.h24] = 1;
  return on;
}

// ------------------------------------------------------------ events

const ALARM_H = 7;            // the daily alarm, 07:00

/**
 * What the wearer and the watch are doing at `ms`. Everything is placed
 * relative to the nearest minute turn: u is seconds from it (-30..30).
 *   every minute  LIGHT is held from just before the turn to after it,
 *                 so the new minute arrives under the light
 *   every hour    the time signal beeps twice (the glass flashes with each),
 *                 the light stays on longer, and the 24HR button is pressed
 *                 twice: the hour is shown in 12-hour form for a while
 *   07:00         the alarm rings (the bell blinks) with the light off,
 *                 until the wearer slaps LIGHT, which stops it
 */
function events(ms) {
  const date = new Date(ms);
  const sec = date.getSeconds() + date.getMilliseconds() / 1000;
  const u = sec >= 30 ? sec - 60 : sec;
  const turn = new Date(Math.round(ms / 60000) * 60000);
  const hour = turn.getMinutes() === 0, alarm = hour && turn.getHours() === ALARM_H;
  const ev = { u, hour, alarm, light: false, press: new Set(), beep: false, h12: false, bell: true };
  const held = (a, b, name) => { if (u >= a && u < b) { ev.press.add(name); return true; } return false; };
  if (alarm) {
    // beep-beep-beep-beep, once a second, until LIGHT is pressed at u = 6
    const ph = u - Math.floor(u), beeping = u >= 0 && u < 6 && ph < 0.5 && Math.floor(ph * 8) % 2 === 0;
    ev.bell = !beeping;
    ev.beep = beeping && u < 1;
    ev.light = held(6, 8.6, 'light');
  } else if (hour) {
    ev.light = held(-0.45, 3.8, 'light');
    for (const b of [0, 0.25]) if (u >= b && u < b + 0.07) ev.beep = true;
    held(1.25, 1.5, 'alarm'); held(5.0, 5.25, 'alarm');
    ev.h12 = u >= 1.3 && u < 5.05;
  } else {
    ev.light = held(-0.45, 1.5, 'light');
  }
  return ev;
}

/**
 * Liquid crystal is slow: a segment takes ~0.1 s to darken and longer to
 * clear. The response is replayed over the last 0.4 s in fixed steps, so it
 * is a function of the clock alone. Returns each segment's level, 0..1.
 */
const TAU_ON = 0.045, TAU_OFF = 0.085, STEP = 20, SPAN = 400;   // ms
function response(ms, clockFields) {
  const cache = new Map(), fcache = new Map();
  const st = (tm) => {
    const ev = events(tm);
    const k = Math.floor(tm / 1000);
    const key = `${k}|${ev.h12}|${ev.bell}`;
    if (!cache.has(key)) {
      if (!fcache.has(k)) fcache.set(k, clockFields(new Date(k * 1000)));
      cache.set(key, displayState(fcache.get(k), ev));
    }
    return cache.get(key);
  };
  const t0 = Math.floor(ms / STEP) * STEP - SPAN;
  const lvl = Float32Array.from(st(t0));
  const advance = (s, dt) => {
    for (let j = 0; j < lvl.length; j++) {
      const tau = s[j] > lvl[j] ? TAU_ON : TAU_OFF;
      lvl[j] += (s[j] - lvl[j]) * (1 - Math.exp(-dt / 1000 / tau));
    }
  };
  for (let t = t0 + STEP; t <= ms; t += STEP) advance(st(t), STEP);
  const rest = ms - (Math.floor(ms / STEP) * STEP);
  if (rest > 0) advance(st(ms), rest);
  return lvl;
}

// ------------------------------------------------------------ the printed bezel
// Casio prints the face in a wide grotesque: CASIO, WATER and RESIST bold,
// the button legends light. Drawn here at 5 px.

const R = (s) => s.trim().split(/\s+/);
const LABEL = makeFont({
  name: 'f91w-label', height: 5, spacing: 1, upper: true,
  glyphs: {
    A: R('.#. #.# ### #.# #.#'), C: R('.### #... #... #... .###'), D: R('###. #..# #..# #..# ###.'),
    E: R('### #.. ##. #.. ###'), F: R('### #.. ##. #.. #..'), G: R('.### #... #.## #..# .###'),
    H: R('#.# #.# ### #.# #.#'), I: R('# # # # #'), L: R('#.. #.. #.. #.. ###'),
    M: R('#...# ##.## #.#.# #...# #...#'), N: R('#..# ##.# #.## #..# #..#'),
    O: R('.##. #..# #..# #..# .##.'), P: R('##. #.# ##. #.. #..'), R: R('##. #.# ##. #.# #.#'),
    S: R('.## #.. .#. ..# ##.'), T: R('### .#. .#. .#. .#.'),
    2: R('##. ..# .#. #.. ###'), 4: R('#.# #.# ### ..# ..#'),
    '/': R('..# ..# .#. #.. #..'), '·': R('. . # . .'), ' ': R('.. .. .. .. ..'),
  },
});
const BOLD = makeFont({
  name: 'f91w-bold', height: 5, spacing: 1, upper: true,
  glyphs: {
    C: R('.### ##.. ##.. ##.. .###'), A: R('.###. ##.## ##### ##.## ##.##'), S: R('.### ##.. .##. ..## ###.'),
    I: R('## ## ## ## ##'), O: R('.###. ##.## ##.## ##.## .###.'),
    W: R('##...## ##.#.## ##.#.## ####### .##.##.'), T: R('#### .##. .##. .##. .##.'),
    E: R('#### ##.. ###. ##.. ####'), R: R('###. ##.# ###. ##.# ##.#'),
    F: R('#### ##.. ###. ##.. ##..'), '-': R('... ... ### ... ...'),
    9: R('#### #.## #### ..## ####'), 1: R('.## ### .## .## .##'),
  },
});

// WR, in its box, 4 rows so the box has room around it.
const WR = sprite(`
  .##...##.####.
  .##.#.##.##.##
  #######.####..
  .##.##..##.##.`);
const ARROW_L = sprite(`
  ..#
  .##
  ###
  .##
  ..#`);
const ARROW_R = sprite(`
  #..
  ##.
  ###
  ##.
  #..`);

/** The printed face around the window, offset by (ox, oy). `press` names a button held. */
function drawBezel(g, ox, oy, press) {
  // CASIO, and the model name (gold on the watch)
  g.text('CASIO', 22 + ox, 0 + oy, { font: BOLD, spacing: 2 });
  g.text('F-91W', 78 + ox, 0 + oy, { font: BOLD });
  // button legends above the window
  arrow(g, ARROW_L, 4 + ox, 6 + oy, press.has('light'));
  g.text('LIGHT', 9 + ox, 6 + oy, { font: LABEL });
  const ac = 'ALARM CHRONOGRAPH';
  g.text(ac, 123 - LABEL.measure(ac) + ox, 6 + oy, { font: LABEL });
  // the window
  g.roundRect(WIN.x + ox, WIN.y + oy, WIN.w, WIN.h, WIN.r);
  // below it
  arrow(g, ARROW_L, 4 + ox, 50 + oy, press.has('mode'));
  g.text('MODE', 9 + ox, 50 + oy, { font: LABEL });
  const al = 'ALARM ON·OFF/24HR';
  g.text(al, 119 - LABEL.measure(al) + ox, 50 + oy, { font: LABEL });
  arrow(g, ARROW_R, 121 + ox, 50 + oy, press.has('alarm'));
  // WATER [WR] RESIST
  g.text('WATER', 6 + ox, 57 + oy, { font: BOLD });
  g.roundRect(46 + ox, 56 + oy, 36, 7, 2);
  g.blit(WR, 57 + ox, 58 + oy);
  g.text('RESIST', 93 + ox, 57 + oy, { font: BOLD });
}

/** A red legend arrow: dim print normally, lit while its button is held. */
function arrow(g, spr, x, y, held) {
  for (let j = 0; j < spr.h; j++)
    for (let i = 0; i < spr.w; i++)
      if (spr.data[j * spr.w + i] && (held || (i + j) % 2 === 0)) g.pixel(x + i, y + j);
}

// ------------------------------------------------------------ design

const DAY = 255, NIGHT = 40;
const GHOST = 0.125;          // how much an unlit segment shows
// The face walks a small loop for burn-in, one step every 3 minutes, at :30.
const WALK = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
function walk(date) {
  const k = Math.floor((date.getTime() - 30000) / 180000);
  return WALK[((k % WALK.length) + WALK.length) % WALK.length];
}
const inWin = (x, y) => {
  const { x: wx, y: wy, w, h } = WIN;
  if (x <= wx || y <= wy || x >= wx + w - 1 || y >= wy + h - 1) return false;
  // keep the rounded corners dark
  const cx = Math.min(x - wx - 1, wx + w - 2 - x), cy = Math.min(y - wy - 1, wy + h - 2 - y);
  return !(cx === 0 && cy === 0);
};
/** The micro-light: an LED at the window's left edge, falling off across it. */
function glow(x, y) {
  const dx = x - WIN.x, dy = (y - (WIN.y + WIN.h / 2)) / (WIN.h / 2);
  return clamp(1.1 - 0.0036 * dx - 0.12 * dy * dy, 0.62, 1);
}

export default {
  name: 'F-91W',
  blurb: 'The Casio F-91W, segment for segment: its LCD glows on black with ghost segments and slow liquid crystal; the micro-light comes on at every minute, the time signal beeps on the hour.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { date, oled, kit } = ctx;
    const f = ctx.fields;
    oled.contrast(DAY + (NIGHT - DAY) * ctx.night);
    const [ox, oy] = walk(date);
    const lvl = response(date.getTime(), kit.clockFields);
    const ev = events(date.getTime());

    drawBezel(g, ox, oy, ev.press);
    if (!ev.light) {
      // Emissive: a lit segment is light, an unlit one a faint ghost.
      for (let i = 0; i < SEGS.length; i++) {
        const v = GHOST + (1 - GHOST) * lvl[i];
        for (const [x, y] of SEGS[i].px) if (dither(x - ox, y - oy, v)) g.pixel(x + ox, y + oy);
      }
    } else {
      // Under the light it is an LCD again: dark segments on a lit glass.
      for (let y = WIN.y; y < WIN.y + WIN.h; y++)
        for (let x = WIN.x; x < WIN.x + WIN.w; x++) {
          if (!inWin(x, y)) continue;
          const o = OWNER[y * 128 + x];
          const dark = o < 0 ? 0 : lvl[o];
          // A dark segment is ringed by clear glass, so that it reads
          // against the dither of the uneven light.
          let ring = 0;
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
              const n = OWNER[(y + j) * 128 + x + i];
              if (n >= 0 && n !== o) ring = Math.max(ring, lvl[n]);
            }
          const bg = Math.max(glow(x, y), ring);
          if (dither(x, y, bg * (1 - dark))) g.pixel(x + ox, y + oy);
        }
    }
    // Each beep of the time signal flashes the whole glass (one register).
    if (ev.beep) oled.invert(true);
  },
};
