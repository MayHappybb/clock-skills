// Ressence — after the Ressence Type 1: no hands, the whole dial turns.
//
// The main disc turns once an hour; the minute is read from the tapered
// marker painted on it, against the fixed flange (ticks, upright 10..60).
// Riding on the disc, where the Type 1 manual's drawing puts them (measured
// there and scaled to this flange), are three satellites: the hours (the
// largest, below centre when the minute is at 60), the seconds and the
// day with AM/PM (seven arcs, a day each, the weekend hollow, as Ressence
// marks it). Planetary gearing counter-rotates every satellite against the
// disc, so its numerals and indices stay upright wherever it is carried
// and its pointer reads against its own scale. Everything orbits; nothing
// is a hand.
//
// The canvas is wide, so the dial is flanked by two more wheels in the
// same spirit, their hubs off the glass: the date (left) and the month
// (right), each numeral geared upright like a gondola, read at an index.
// They turn on at midnight.
//
// The numerals are drawn for this face, light and round after the
// Ressence dial: open 4, round 6 and 9, a footless 1 two pixels wide.
// The satellites are shaded as convex lenses lit from the upper left: a
// crescent of dither along the lit limb, a fine edge.
//
// The minute: the flange index the marker has reached is awake (long); at
// :00 the next one grows as the last settles, and the seconds satellite
// flips over once on its axis (its back is a blank disc) and lands.
// The hour: every index wakes in turn, a swell running round from 60; the
// hours satellite flips; a glint crosses the crystal.
//
// Every position is a function of the clock (disc angle from minutes and
// seconds; flips and glints from time since :00). A flip is drawn flat on
// a scratch canvas and copied back squashed by |cos|.
//
// Burn-in: the face walks a 1 px orbit every 4 minutes, the disc edge and
// every satellite move all the time, and night dims through ctx.night.

import { Gfx, polar, orbit, clamp, ease, progress, sprite, font3x5, OFF, ON } from '../js/kit.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ------------------------------------------------------------ numerals
// A light, round 3x5 face after the Ressence dial's: open 4, round 6 and 9,
// a 1 with a flag and no foot (two pixels wide, so 10 and 11 fit).

const DIGITS = {
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  1: ['.#', '##', '.#', '.#', '.#'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#..', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.#.', '#..', '##.', '#.#', '.#.'],
  7: ['###', '..#', '.#.', '.#.', '#..'],
  8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '.#.'],
};
const GLYPH = Object.fromEntries(Object.entries(DIGITS).map(([k, v]) => [k, sprite(v)]));

function numW(str) {
  let w = 0;
  for (const ch of str) w += GLYPH[ch].w + 1;
  return w - 1;
}

/** A numeral centred on (cx, cy), optionally cleared round by a 1 px keyline. */
function numeral(g, str, cx, cy, key = true) {
  const w = numW(str);
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - 2.5);
  if (key) g.fillRect(x0 - 1, y0 - 1, w + 2, 7, OFF);
  let x = x0;
  for (const ch of str) { g.blit(GLYPH[ch], x, y0); x += GLYPH[ch].w + 1; }
}

// ------------------------------------------------------------ geometry
// Proportions measured from the Type 1 manual's "how to read the time"
// drawing (flange radius 310 px there), scaled to a flange of radius 31.5.

const C = [64, 32];
const R_DISC = 25;
const HOUR = { off: 10.2, r: 13.3, at: Math.PI };            // below centre when the minute is at 60
const SECS = { off: 16.2, r: 7.4, at: -64 * DEG };
const DAYS = { off: 16.2, r: 7.4, at: 64 * DEG };

/** A tapered pointer from (cx, cy) along clock angle a: [r, halfWidth] stations. */
function taper(cx, cy, a, stations) {
  const ux = Math.sin(a), uy = -Math.cos(a), vx = -uy, vy = ux;
  const left = [], right = [];
  for (const [r, w] of stations) {
    left.push([cx + ux * r + vx * w, cy + uy * r + vy * w]);
    right.push([cx + ux * r - vx * w, cy + uy * r - vy * w]);
  }
  return [...left, ...right.reverse()];
}

function keyPoly(g, pts) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]])
    g.fillPolygon(pts.map(([x, y]) => [x + dx, y + dy]), OFF);
  g.fillPolygon(pts, ON);
}

// ------------------------------------------------------------ satellites

/**
 * A satellite: a convex disc lit from the upper left. A crescent of light
 * lies along its lit limb, fading round to the dark side; its edge is a
 * fine line.
 */
function satDisc(g, x, y, r) {
  g.fillCircle(x, y, r + 1, OFF);
  g.fillWhere((px, py) => {
    const u = (px - x) / r, v = (py - y) / r, d2 = u * u + v * v;
    if (d2 > 1) return false;
    const lit = clamp(-(u * 0.6 + v * 0.8) / Math.sqrt(d2 + 1e-6), 0, 1);
    const rim = clamp((Math.sqrt(d2) - 0.8) / 0.2, 0, 1);
    return 0.5 * lit * lit * rim;
  }, ON, [x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2]);
  g.circle(x, y, r);
}

function hourSat(g, x, y, hours) {
  satDisc(g, x, y, HOUR.r);
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * TAU;
    if (k % 3 === 0) {
      const [nx, ny] = polar(x, y, k === 12 ? 10.6 : 10.2, a);
      if (k === 12) g.ring(nx, ny, 0.5, 1.6);
      else numeral(g, String(k), nx, ny, false);
    } else {
      const [x0, y0] = polar(x, y, 10.6, a), [x1, y1] = polar(x, y, 12, a);
      g.line(x0, y0, x1, y1);
    }
  }
  const a = ((hours % 12) / 12) * TAU;
  keyPoly(g, taper(x, y, a, [[-1.8, 1.3], [8.6, 0.5]]));
  g.ring(x, y, 0, 1.3);
}

function secondsSat(g, x, y, sec) {
  satDisc(g, x, y, SECS.r);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const [x0, y0] = polar(x, y, k % 3 ? 6.1 : 5.4, a), [x1, y1] = polar(x, y, 6.8, a);
    g.line(x0, y0, x1, y1);
  }
  keyPoly(g, taper(x, y, (sec / 60) * TAU, [[-1, 0.9], [5, 0.4]]));
}

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Day and AM/PM: seven arcs, the weekend hollow; the pointer crosses one a day. */
function daySat(g, x, y, f) {
  satDisc(g, x, y, DAYS.r);
  const span = TAU / 7;
  for (let d = 0; d < 7; d++) {
    const a0 = d * span + 0.12, a1 = (d + 1) * span - 0.12;
    g.arc(x, y, 4.6, 6.6, a0, a1, OFF);
    g.arc(x, y, 4.9, 6.4, a0, a1);
    if (d >= 5) g.arc(x, y, 5.5, 5.8, a0 + 0.1, a1 - 0.1, OFF);
  }
  const di = WEEK.indexOf(f.dow);
  const a = ((di + (f.h + f.m / 60 + f.sec / 3600) / 24) / 7) * TAU;
  keyPoly(g, taper(x, y, a, [[-1, 0.9], [4.6, 0.4]]));
}

/** The back of a satellite, seen as it flips over: a blank convex disc. */
function satBack(g, x, y, r) {
  satDisc(g, x, y, r);
  g.circle(x, y, r * 0.55);
}

// A satellite flips by drawing it flat on a scratch canvas and copying it
// back squashed vertically by |cos| of the flip angle.
const scratch = new Gfx(128, 64);
function flipped(g, x, y, r, phase, front, back) {
  const k = Math.cos(phase * Math.PI);
  if (Math.abs(k) > 0.999) { (k > 0 ? front : back)(g); return; }
  scratch.clear();
  (k > 0 ? front : back)(scratch);
  const ak = Math.max(Math.abs(k), 0.04);
  const x0 = Math.floor(x - r - 2), x1 = Math.ceil(x + r + 2);
  const y0 = Math.floor(y - r - 2), y1 = Math.ceil(y + r + 2);
  g.fillCircle(x, y, r + 1, OFF);
  for (let py = y0; py < y1; py++) {
    const v = (py + 0.5 - y) / ak;
    if (Math.abs(v) > r + 1.5) continue;
    const sy = Math.floor(y + (k > 0 ? v : -v));
    for (let px = x0; px < x1; px++) if (scratch.get(px, sy)) g.pixel(px, py);
  }
}

// ------------------------------------------------------------ the side wheels
// Date (left) and month (right) ride big wheels whose hubs are off the glass.
// Like the satellites, each numeral is geared to stay upright as its wheel
// turns, so they travel like gondolas; the current one sits at the index.

const DATE_WHEEL = { c: [-30, 32], r: 41, step: TAU / 31 };
const MONTH_WHEEL = { c: [158, 32], r: 41, step: TAU / 12 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function sideWheels(g, f, date, ox, oy) {
  // Both wheels turn on at midnight, over a couple of seconds.
  const s = f.h * 3600 + f.m * 60 + f.sec;
  const u = s < 2.6 ? ease.inOutCubic(progress(s, 0.2, 2.6)) : 1;
  const dpos = f.day - 1 - (1 - u);
  const mpos = date.getMonth() - (f.day === 1 ? 1 - u : 0);

  for (let k = 0; k < 31; k++) {
    let d = k - dpos;
    d = ((d + 15.5) % 31 + 31) % 31 - 15.5;
    const a = Math.PI / 2 + d * DATE_WHEEL.step;
    const [x, y] = polar(DATE_WHEEL.c[0] + ox, DATE_WHEEL.c[1] + oy, DATE_WHEEL.r, a);
    if (y < -4 || y > 68) continue;
    numeral(g, String(k + 1), x, y, false);
  }
  for (let k = 0; k < 12; k++) {
    let d = k - mpos;
    d = ((d + 6) % 12 + 12) % 12 - 6;
    const a = 1.5 * Math.PI - d * MONTH_WHEEL.step;
    const [x, y] = polar(MONTH_WHEEL.c[0] + ox, MONTH_WHEEL.c[1] + oy, MONTH_WHEEL.r, a);
    if (y < -4 || y > 68) continue;
    const w = font3x5.measure(MONTHS[k]);
    g.text(MONTHS[k], Math.round(x - w / 2), Math.round(y - 2.5), { font: font3x5 });
  }
  const iy = 32 + oy;
  g.line(21 + ox, iy - 2, 19 + ox, iy); g.line(19 + ox, iy, 21 + ox, iy + 2);
  g.line(107 + ox, iy - 2, 109 + ox, iy); g.line(109 + ox, iy, 107 + ox, iy + 2);
}

// ------------------------------------------------------------ frame

const SEC_FLIP = 0.8, HOUR_FLIP = 1.2, GLINT = 1.4, WAKE = 2.2, TICK_GROW = 0.45;

export default {
  name: 'Ressence',
  blurb: 'After the Ressence Type 1: no hands, the whole dial turns once an hour and its satellites orbit upright.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, oled, night } = ctx;
    const [ox, oy] = orbit(date, 1, 4);
    const cx = C[0] + ox, cy = C[1] + oy;
    const mins = f.m + f.sec / 60;
    const th = (mins / 60) * TAU;                  // the main disc: one turn an hour
    const onHour = f.m === 0;

    // the side wheels walk their own, wider orbit, out of step with the dial
    const [wx, wy] = orbit(new Date(date.getTime() + 7 * 60000), 2, 5);
    sideWheels(g, f, date, wx, wy);

    // ---- the main disc's edge
    for (let i = 0; i < 160; i += 2) {
      const [x, y] = polar(cx, cy, R_DISC + 0.5, (i / 160) * TAU + th);
      g.pixel(x, y);
    }
    // ---- the fixed flange. The index the minute marker has reached is
    // awake (long); at each minute the next one grows as the last settles.
    // On the hour every index wakes in turn, round from 60.
    const grow = progress(f.sec, 0, TICK_GROW);
    for (let i = 0; i < 60; i++) {
      if (i % 10 === 0) continue;
      const a = (i / 60) * TAU;
      let r0 = i % 5 ? 30.4 : 28.9;
      if (i === f.m) r0 -= 2.4 * ease.outBack(grow);
      else if (i === (f.m + 59) % 60) r0 -= 2.4 * (1 - ease.inOutQuad(grow));
      if (onHour && f.sec < WAKE) {
        const behind = (f.sec / WAKE) * 60 - i;
        if (behind > -2 && behind < 10) r0 -= 2.6 * Math.exp(-((behind - 2) ** 2) / 8);
      }
      const [x0, y0] = polar(cx, cy, r0, a), [x1, y1] = polar(cx, cy, 31, a);
      g.line(x0, y0, x1, y1);
    }

    // ---- what rides on the main disc
    const P = (o) => polar(cx, cy, o.off, th + o.at);
    keyPoly(g, taper(cx, cy, th, [[4.4, 1.3], [23.6, 0.5]]));
    const [hx, hy] = P(HOUR), [sx, sy] = P(SECS), [qx, qy] = P(DAYS);
    const hourPhase = onHour && f.sec < HOUR_FLIP ? ease.inOutCubic(f.sec / HOUR_FLIP) * 2 : 0;
    flipped(g, hx, hy, HOUR.r, hourPhase, (c) => hourSat(c, hx, hy, f.h + mins / 60), (c) => satBack(c, hx, hy, HOUR.r));
    const secPhase = f.sec < SEC_FLIP ? ease.inOutCubic(f.sec / SEC_FLIP) * 2 : 0;
    flipped(g, sx, sy, SECS.r, secPhase, (c) => secondsSat(c, sx, sy, f.sec), (c) => satBack(c, sx, sy, SECS.r));
    daySat(g, qx, qy, f);

    // ---- flange numerals, upright, over anything that passes under them
    for (let k = 0; k < 6; k++) {
      const [x, y] = polar(cx, cy, k % 3 ? 28.4 : 28.6, (k / 6) * TAU);
      numeral(g, String(k ? k * 10 : 60), x, y);
    }

    // ---- on the hour, a glint crosses the crystal
    if (onHour && f.sec < GLINT) {
      const w = -40 + 80 * ease.inOutQuad(f.sec / GLINT);
      g.fillWhere((px, py) => {
        if ((px - cx) ** 2 + (py - cy) ** 2 > 31 * 31) return false;
        const d = Math.abs((px - cx) * 0.6 + (py - cy) * 0.8 - w);
        return d < 3.5 ? 0.45 * (1 - d / 3.5) : false;
      }, ON, [cx - 32, cy - 32, 64, 64]);
    }

    oled.contrast(0xcf + (0x14 - 0xcf) * night);
  },
};
