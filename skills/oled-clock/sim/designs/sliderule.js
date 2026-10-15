// Slide Rule — the time set on a slide rule.
//
// A close view of the face of a rule, not four scales side by side. The
// minutes are the instrument. Two scales are ruled across the glass at one
// pitch: the stock's, in the tens, standing still; the slide's, in the units,
// laid beside it and translated against it by exactly the units digit. They
// are drawn as one pair, their two lines four pixels apart and their
// divisions reaching towards each other, so the reading is taken where the
// stock's comb and the slide's comb are cut against one another.
//
// The cursor is a glass runner in a shoe with a hairline down its middle. It
// glides along the rule to the tens mark of the minute and stops there; the
// two numerals the hairline crosses — the tens on the stock, the units on the
// slide beneath — are the minute. When the minute turns the runner travels to
// the next stop and the slide is run exactly one pitch further past it: you
// can watch the divisions of one scale slip past the other.
//
// The hours are the same instrument read coarser: a second pair of scales of
// their own, ruled at thirty-six pixels instead of twenty-two, so the pair
// reads as a different system on the same rule, the way a real rule carries
// several scales at different spacings and different divisions.
//
// Nothing is a font: the numerals are engraved in the instrument's own
// condensed technical hand — a flat-topped one, a closed four, a barred seven
// — cut from the same strokes as the graduations they stand among, and they
// fall away into a dither the further they stand from the hairline, so the
// reading is the one thing on the rule at full strength.
//
// The turn is a slide being run. The slide glides to its new setting with a
// small overshoot into its stop and the runner takes the knock and rocks in
// its shoe. A digit that does not change does not move. On the hour every
// slide is run at once, in a wave from the hours to the minutes, and the
// stock itself takes the shock and rocks on its mounts.
//
// Pure function of the clock: the turn is scheduled backwards from :00 out of
// this minute's digits and the next minute's. Burn-in: the rule walks two
// decorrelated 2 px orbits, so no division rests on one pixel; 23:00-07:00 the
// panel dims.

import { clamp, orbit, previousMinute, clockFields, segDist, ON } from '../js/kit.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ geometry

const H = 64;
const BX0 = 2, BX1 = 125;              // the rule's ends, before the orbit
const DW = 10, DH = 11;                 // a numeral's box on the stock
const UW = 10, UH = 11;                // a numeral's box on the slide
const DIV = 2;                         // how far a division stands off its line

// Each channel is one pair of scales: the stock's, ruled in the tens and
// standing still, and the slide's, ruled in the units at the same pitch and
// translated against it by the digit. Their two lines run four pixels apart
// with their divisions reaching towards each other, so the reading is taken
// on a pair of combs cut face to face. The cursor's hairline crosses both.
const HOURS = {
  run0: 2, run1: 29, stockLine: 14, tensNum: 2, unitNum: 19,
  pitch: 36, stops: [28, 64, 100],
};
const MINS = {
  run0: 32, run1: 59, stockLine: 44, tensNum: 32, unitNum: 49,
  pitch: 22, stops: [14, 36, 58, 80, 102, 124],
};

const DAY = 0xcf, NIGHT = 0x12;

// ------------------------------------------------------------ the turn

const MIN_OUT = 0.4, MIN_IN = 0.5;
const HR_OUT = 0.45, HR_IN = 1.7;
const MIN_START = -0.32, MIN_Z = 0.62, MIN_W = 12;
const HR_START = -0.45, HR_Z = 0.4, HR_W = 9;
const MIN_HIT = 0.28, HR_HIT = 0.3;

/** Step response of a damped spring, 0 -> 1, starting at rest. */
function spring(t, zeta, w) {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

// ------------------------------------------------------------ the numerals
//
// A condensed technical hand of the sort engraved on a rule: square
// shoulders, a little rounding at the corners, a flat-topped one, a closed
// four, a seven with its bar. Centre-lines in a unit box, stroked 2 thick.

const A = (cx, cy, rx, ry, a0, a1, n = 22) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
};

const DIGITS = {
  0: [A(0.5, 0.5, 0.45, 0.46, 0, TAU, 30)],
  1: [[[0.14, 0.3], [0.52, 0.05], [0.52, 0.95]], [[0.1, 0.95], [0.94, 0.95]]],
  2: [[[0.06, 0.3], [0.14, 0.11], [0.4, 0.03], [0.7, 0.08], [0.9, 0.27], [0.86, 0.47], [0.06, 0.95], [0.96, 0.95]]],
  3: [[[0.1, 0.14], [0.34, 0.03], [0.66, 0.05], [0.88, 0.2], [0.85, 0.4], [0.58, 0.5]],
    [[0.58, 0.5], [0.88, 0.6], [0.94, 0.78], [0.76, 0.94], [0.42, 0.97], [0.14, 0.88], [0.05, 0.76]]],
  4: [[[0.72, 0.95], [0.72, 0.04], [0.04, 0.66], [0.98, 0.66]]],
  5: [[[0.9, 0.05], [0.2, 0.05], [0.12, 0.46], [0.44, 0.36], [0.78, 0.45], [0.94, 0.64], [0.86, 0.87], [0.54, 0.97], [0.2, 0.9], [0.06, 0.78]]],
  6: [[[0.86, 0.09], [0.56, 0.03], [0.24, 0.13], [0.08, 0.4], [0.06, 0.7], [0.22, 0.92], [0.54, 0.97], [0.8, 0.86], [0.86, 0.66], [0.68, 0.51], [0.4, 0.47], [0.16, 0.58], [0.08, 0.76]]],
  7: [[[0.06, 0.05], [0.96, 0.05], [0.36, 0.95]], [[0.24, 0.52], [0.74, 0.52]]],
  8: [[[0.5, 0.5], [0.28, 0.39], [0.2, 0.22], [0.34, 0.07], [0.5, 0.03], [0.66, 0.07], [0.8, 0.22], [0.72, 0.39], [0.5, 0.5],
    [0.26, 0.61], [0.16, 0.79], [0.3, 0.93], [0.5, 0.97], [0.7, 0.93], [0.84, 0.79], [0.74, 0.61], [0.5, 0.5]]],
  9: [[[0.14, 0.91], [0.44, 0.97], [0.76, 0.87], [0.92, 0.6], [0.94, 0.3], [0.78, 0.08], [0.46, 0.03], [0.2, 0.14], [0.14, 0.34], [0.32, 0.49], [0.6, 0.53], [0.84, 0.42], [0.92, 0.24]]],
};

/**
 * One numeral of the instrument's hand, its ink filling the box. `level` below
 * 1 lays the engraving in as a dither, so a scale can fall back out of the eye
 * and only the digits the hairline is on stand at full strength.
 */
function numeral(g, d, cx, y, w, h, level = 1) {
  const x = cx - w / 2;
  if (level >= 0.99) {
    for (const line of DIGITS[d]) g.stroke(line.map(([u, v]) => [x + u * w, y + v * h]), 2, ON);
    return;
  }
  const segs = [];
  for (const line of DIGITS[d]) {
    const p = line.map(([u, v]) => [x + u * w, y + v * h]);
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  g.fillWhere((px, py) => {
    for (const sg of segs) if (segDist(px, py, sg[0], sg[1], sg[2], sg[3]) <= 1) return level;
    return false;
  }, ON, [x - 2, y - 2, w + 4, h + 4]);
}

// ------------------------------------------------------------ a channel

/**
 * One channel of the rule at `d` seconds into its turn: the stock's scale and
 * the slide's scale, translated against each other by `units` pitches, and
 * the cursor standing at stop `tens` with its hairline across both.
 */
function drawChannel(g, ch, ox, oy, tens, units, d, struck) {
  const s = (i) => Math.round(ch.stops[i]) + ox;
  // The cursor's x, and where the slide has been run to: exactly one pitch of
  // translation for every unit, so the divisions of the two scales are out of
  // step by the digit and by nothing else.
  const ti = clamp(Math.floor(tens), 0, ch.stops.length - 1);
  const tf = tens - ti;
  const C = s(ti) + (s(Math.min(ti + 1, ch.stops.length - 1)) - s(ti)) * tf;
  const S = C - ch.pitch * units;

  // The stock is one piece: it shivers as a whole when the rule is struck.
  const shiver = struck ? 1.4 * Math.exp(-3.4 * d) * Math.sin(17 * d) : 0;
  const cy = Math.round(oy + shiver);
  const line = (yy) => g.hline(BX0 + ox, yy + cy, BX1 - BX0, ON);

  // -- the two scales: the same rule at the same pitch, the stock's standing
  // still with its divisions reaching down, the slide's translated by the
  // digit with its divisions reaching up. Where the digit is nothing, the two
  // combs line up; the reading is taken where they do not.
  const sg = ch.stockLine + cy, sl = sg + 4;
  line(sg);
  line(sl);
  const k0 = Math.ceil((BX0 + ox - C) / ch.pitch), k1 = Math.floor((BX1 + ox - C) / ch.pitch);
  for (let k = k0; k <= k1; k++) g.vline(Math.round(C + k * ch.pitch), sg, k === 0 ? DIV + 1 : DIV, ON);
  const m0 = Math.ceil((BX0 + ox - S) / ch.pitch), m1 = Math.floor((BX1 + ox - S) / ch.pitch);
  for (let k = m0; k <= m1; k++) g.vline(Math.round(S + k * ch.pitch), sl - DIV, DIV, ON);

  // Only the numerals within sight of the hairline are cut, so the rest of
  // the rule stays black and the reading is the one thing lit.
  const lit = (x) => clamp(2.6 * (0.95 - Math.abs(x - C) / ch.pitch), 0.3, 1);
  for (let i = 0; i < ch.stops.length; i++) {
    const x = s(i);
    if (Math.abs(x - C) > 2.2 * ch.pitch) continue;
    numeral(g, i, x, ch.tensNum + cy, DW, DH, lit(x));
  }
  for (let u = 0; u < 10; u++) {
    const x = S + u * ch.pitch;
    if (Math.abs(x - C) > 2.2 * ch.pitch) continue;
    numeral(g, u, x, ch.unitNum + cy, UW, UH, lit(x));
  }

  // -- the cursor: a glass runner in its shoe, hairline down the middle --
  const hx = Math.round(C);
  const e = 8;                         // half the runner's width
  g.vline(hx - e, ch.run0 + cy, ch.run1 - ch.run0, ON);
  g.vline(hx + e, ch.run0 + cy, ch.run1 - ch.run0, ON);
  g.hline(hx - e, ch.run0 + cy, 2 * e + 1, ON);
  g.hline(hx - e, ch.run1 + cy, 2 * e + 1, ON);
  g.vline(hx, ch.run0 + 1 + cy, ch.run1 - ch.run0 - 1, ON);
}

// ------------------------------------------------------------ the face

export default {
  name: 'Slide Rule',
  blurb: 'A slide rule set to the time: the stock and the slide are slipped a grade past each other every minute, and the cursor reads both scales at its hairline.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { date, fields: f, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);
    const [ox] = orbit(date, 2, 3);
    let [, oy] = orbit(new Date(date.getTime() + 11 * 60000), 2, 5);
    const sec = f.sec;

    const hour = (f.m === 0 && sec < HR_IN) || (f.m === 59 && sec >= 60 - HR_OUT);
    const OUT = hour ? HR_OUT : MIN_OUT, IN = hour ? HR_IN : MIN_IN;
    let tt = null;
    if (sec >= 60 - OUT) tt = sec - 60;
    else if (sec < IN) tt = sec;

    const cur = digitsOf(f);
    const prev = digitsOf(previousMinute(date));
    const next = digitsOf(clockFields(new Date(date.getTime() + 60000)));
    const from = tt === null ? cur : tt < 0 ? cur : prev;
    const to = tt === null ? cur : tt < 0 ? next : cur;

    const z = hour ? HR_Z : MIN_Z, w = hour ? HR_W : MIN_W;
    const start = hour ? HR_START : MIN_START;

    // On the hour the stock itself takes the shock and rocks on its mounts.
    if (hour && tt !== null && tt > 0) oy += 1.9 * Math.exp(-2.5 * tt) * Math.sin(10 * tt);

    // The rule's ends: two short posts, not a lit border.
    for (const x of [BX0, BX1]) g.fillRect(x + ox, 6 + oy, 2, 50, ON);

    const run = (tensA, tensB, unitA, unitB, i) => {
      const d = tt === null ? 0 : tt - start + i * 0.06;
      const tens = tensA + (tensB - tensA) * (tt === null ? 0 : spring(d, z, w));
      const units = unitA + (unitB - unitA) * (tt === null ? 0 : spring(d, z, w));
      return { tens, units, d };
    };
    const h = run(from[0], to[0], from[1], to[1], 0);
    const m = run(from[2], to[2], from[3], to[3], 1);
    drawChannel(g, HOURS, ox, oy, h.tens, h.units, h.d, hour);
    drawChannel(g, MINS, ox, oy, m.tens, m.units, m.d, hour);
  },
};
