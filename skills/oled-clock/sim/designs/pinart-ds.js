// Imprint — a pin-art board.
//
// A bed of pins on a 3 px lattice: the Wham-O "Pin Art" toy, and the pinscreen
// before it. Press something into it and the pins keep the impression. This
// board holds the minute. A pin that stands proud catches the raking light and
// is lit, a flush one is black glass, so the time is a low relief: the ridge of
// a pressed stroke solid, its wall falling away a pin at a time.
//
// The digits are not bitmaps. Each is a set of centre lines, and the height of
// the board at a pin is that pin's distance to the nearest one — so the ink of a
// digit is the rounded ridge the pressing tool left and never an outline. Ten of
// them, one hand.
//
// The hour is a different instrument on the same board: a pin dial pressed into
// the board's middle, between the two minute digits, its ring and its twelve
// marks whole pins. The hand is the run of pins its ray passes through, and it
// swings with the hour. The dial is never pressed, so it never needs re-making.
//
// The seconds are the unseen hand itself: the last row of the board is a rail,
// and one pin of it stands proud where that hand is pressing, with the pins it
// has just left still settling behind it. It creeps right to left across the
// minute and reaches the left edge as the minute turns — and then comes back
// heavy. The pressing pass flattens the impression column by column, the board
// is blank for a beat, and the new minute rises behind it, overshooting and
// settling.
//
// At the hour the board is struck flat all at once and rings: a shockwave runs
// out of the middle over the rising new time, and the dial shivers as it lands.
//
// The board walks a 3 px orbit, a whole pin a step, so no pin is lit in the same
// place all day, and the panel dims at night.

import { dither, clamp, progress, segDist, orbit, ease } from '../js/kit.js';

// With this true, `node tools/render.mjs pinart-ds --frames 5 --duration 5
// --sheet` shows the ten digits in pairs at full size, for judging the
// letterforms on their own.
const SPECIMEN = false;

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ the board

const PITCH = 3;                 // px between pins
const COLS = 41, ROWS = 19;      // pins on the board, the last row the rail
const FX = 3, FY = 3;            // the board's corner, before the orbit
const FW = (COLS - 1) * PITCH;   // 120: the board's width in its own coordinates

// ------------------------------------------------------------ the impression

const RIN = 3.1, ROUT = 4.2;          // a stroke's core, and where its wall dies
const DIGIT_CW = 24.6, DIGIT_CH = 36.2;
const SLOT = [[7.6, 7.9], [85.6, 7.9]];     // the two minute digits' centre lines

// ------------------------------------------------------------------ the press

// The pressing bar crosses the board before the turn, so the old minute is
// already gone at :00; the new one rises after it, left to right.
const PRESS_A = -1.22, PRESS_B = -0.16;
const SPAN0 = -18, SPAN1 = 146;
const RISE_LAG = 0.32, RISE_DUR = 0.88;

/** When the pressing bar reaches board x, in seconds relative to :00. */
function pressTime(x) {
  return PRESS_A + ease.inOutCubic(clamp((x - SPAN0) / (SPAN1 - SPAN0), 0, 1)) * (PRESS_B - PRESS_A);
}

/** How high a pin at board x has risen at time t: 0 at rest, overshooting 1. */
function riseAt(x, t) {
  const u = (t - RISE_LAG * clamp(x / FW, 0, 1)) / RISE_DUR;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return 1 + 3.4 * (u - 1) ** 3 + 2.1 * (u - 1) ** 2;
}

// ------------------------------------------------------------- the letterforms
//
// Centre lines in a unit box, y down, thickened by the tool radius below. One
// hand: round shoulders, a flat-footed 1, an open 4, a crossed 7.

function ell(cx, cy, rx, ry, a0 = 0, a1 = TAU, n = 20) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return p;
}

const GLYPH = {
  0: [ell(0.50, 0.50, 0.47, 0.46, 0, TAU, 24)],
  1: [[[0.06, 0.32], [0.44, 0.05], [0.44, 0.98]], [[0.08, 0.98], [0.88, 0.98]]],
  2: [[[0.06, 0.20], [0.22, 0.07], [0.62, 0.04], [0.90, 0.18], [0.90, 0.39], [0.68, 0.57], [0.06, 0.98], [0.97, 0.98]]],
  3: [[[0.08, 0.09], [0.40, 0.04], [0.76, 0.07], [0.90, 0.25], [0.80, 0.44], [0.56, 0.51],
      [0.82, 0.59], [0.94, 0.77], [0.83, 0.93], [0.46, 0.98], [0.07, 0.87]]],
  4: [[[0.71, 0.98], [0.71, 0.05], [0.04, 0.68], [0.98, 0.68]]],
  5: [[[0.92, 0.06], [0.22, 0.07], [0.16, 0.44], [0.47, 0.35], [0.81, 0.44], [0.95, 0.64],
      [0.85, 0.88], [0.53, 0.99], [0.17, 0.94], [0.03, 0.83]]],
  6: [[[0.87, 0.07], [0.50, 0.03], [0.20, 0.18], [0.07, 0.55], [0.10, 0.80], [0.30, 0.96],
      [0.66, 0.97], [0.89, 0.79], [0.84, 0.55], [0.60, 0.43], [0.30, 0.50], [0.11, 0.68]]],
  7: [[[0.05, 0.05], [0.95, 0.05], [0.40, 0.98]]],
  8: [ell(0.50, 0.25, 0.41, 0.25, 0, TAU, 18), ell(0.50, 0.75, 0.45, 0.26, 0, TAU, 18)],
  9: [[[0.13, 0.93], [0.50, 0.97], [0.80, 0.82], [0.93, 0.45], [0.90, 0.20], [0.70, 0.04],
      [0.34, 0.03], [0.11, 0.21], [0.16, 0.45], [0.40, 0.57], [0.70, 0.50], [0.89, 0.32]]],
};

// ------------------------------------------------------------------ the dial

// The dial's centre and its ring radius, in board coordinates. It stands in the
// gap between the two minute digits, where a colon would be.
const DIAL = [60, 26, 16];

// ----------------------------------------------------------- the height field
//
// A shape is a run of segments with a core radius and an outer radius; a pin's
// height is the largest any shape gives it.

/** Segments as [ax, ay, bx, by, minX, minY, maxX, maxY] — eight numbers each. */
function segsOf(polys) {
  const out = [];
  for (const pl of polys)
    for (let i = 1; i < pl.length; i++) {
      const ax = pl[i - 1][0], ay = pl[i - 1][1], bx = pl[i][0], by = pl[i][1];
      out.push(ax, ay, bx, by, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
    }
  return out;
}

/**
 * How close (px, py) comes to any segment, giving up once nothing can beat
 * `best`: the per-segment box throws out the runs that are nowhere near.
 */
function distMin(s, px, py, best) {
  for (let i = 0; i < s.length; i += 8) {
    const dx = px < s[i + 4] ? s[i + 4] - px : px > s[i + 6] ? px - s[i + 6] : 0;
    const dy = py < s[i + 5] ? s[i + 5] - py : py > s[i + 7] ? py - s[i + 7] : 0;
    if (dx * dx + dy * dy >= best * best) continue;
    const d = segDist(px, py, s[i], s[i + 1], s[i + 2], s[i + 3]);
    if (d < best) best = d;
  }
  return best;
}

class Field {
  constructor() { this.shapes = []; }
  /** Add a shape: polylines in board coordinates, thickened, peaking at `depth`. */
  add(polys, rin, rout, depth = 1) {
    const s = segsOf(polys);
    if (!s.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.length; i += 8) {
      x0 = Math.min(x0, s[i + 4]); x1 = Math.max(x1, s[i + 6]);
      y0 = Math.min(y0, s[i + 5]); y1 = Math.max(y1, s[i + 7]);
    }
    this.shapes.push({ s, inv: 1 / (rout - rin), rout, depth, x0: x0 - rout, y0: y0 - rout, x1: x1 + rout, y1: y1 + rout });
  }
  at(px, py) {
    let d = 0;
    for (const sh of this.shapes) {
      if (px < sh.x0 || px > sh.x1 || py < sh.y0 || py > sh.y1) continue;
      const v = (sh.rout - distMin(sh.s, px, py, sh.rout)) * sh.inv;
      if (v <= 0) continue;
      const h = (v > 1 ? 1 : v) * sh.depth;
      if (h > d) d = h;
    }
    return d;
  }
}

function addDigit(field, d, slot) {
  const [bx, by] = slot;
  field.add(GLYPH[d].map((pl) => pl.map(([u, v]) => [bx + u * DIGIT_CW, by + v * DIGIT_CH])), RIN, ROUT);
}

/**
 * The hour dial. A dial is a circle and this board is a lattice, so it is drawn
 * in the board's own terms: the ring is a chain of whole pins with twelve whole
 * pins standing prouder for the hours, and the hand is the run of pins its ray
 * passes through. Nothing the tool did not press is lit.
 */
function theDial(field, hour, hourFrac) {
  const [cx, cy, r] = DIAL;
  const at = (a, rad) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const whole = (p, depth, rout = 1.75) => {
    const gx = Math.round(p[0] / PITCH) * PITCH, gy = Math.round(p[1] / PITCH) * PITCH;
    field.add([[[gx, gy], [gx, gy]]], 0.4, rout, depth);
  };
  // Twelve hour marks, each one whole pin head. A dial is a circle and this
  // board is a lattice; twelve pins round it is both, and the gaps between them
  // are as much the ring as the pins are.
  const ha = (((hour % 12) + hourFrac) / 12) * TAU;
  const seen = new Set();
  for (let k = 0; k < 96; k++) {
    const p = at((k / 96) * TAU, r);
    const gx = Math.round(p[0] / PITCH) * PITCH, gy = Math.round(p[1] / PITCH) * PITCH;
    if (seen.has(gx * 1000 + gy)) continue;
    seen.add(gx * 1000 + gy);
    whole([gx, gy], 0.45);
  }
  for (let k = 0; k < 12; k++) whole(at((k / 12) * TAU, r), 1);
  whole(at(ha, r), 1, 4.6);                            // the hour, pressed wider
  // The hand: the run of pins its ray passes through, out to the ring, two pins
  // wide so it reads as an arm and not as another mark.
  const nx = Math.cos(ha), ny = Math.sin(ha);          // across the hand
  for (let s = 3; s < r - 0.5; s += 0.75) {
    const px = cx + s * Math.sin(ha), py = cy - s * Math.cos(ha);
    for (let w = 0; w <= 1; w++)
      whole([px + nx * PITCH * w, py + ny * PITCH * w], 1);
  }
  whole([cx, cy], 1);
}

// ------------------------------------------------------------------ the pins

// A pin head, from the top: the middle first, then the four sides, then the
// corners. Each step is a whole dot — a pin is at one height, it does not have
// a texture of its own — so the shading of an impression lives in the heights
// of neighbouring pins, which is where a pinscreen keeps it.
const HEAD = [[[1, 1]], [[0, 1], [2, 1], [1, 0], [1, 2]], [[0, 0], [2, 2], [0, 2], [2, 0]]];

/**
 * Draw one pin. `d` is its height — below about an eighth it is flush and dark,
 * 1 is the top of an impression, and over 1 is the overshoot of the pass that
 * pressed it, which stands proud of the lattice and bleeds into the row above.
 */
function pin(g, x, y, d) {
  if (d > 0.14) {
    const h = clamp(d, 0, 1) * 2;                  // 0 dot, 1 plus, 2 square
    if (h >= 1) for (const [dx, dy] of HEAD[1]) g.pixel(x + dx, y + dy);
    const corner = clamp((h - 1.6) / 0.4, 0, 1);
    for (const [dx, dy] of HEAD[2]) if (corner >= 1 || (corner > 0 && dither(x + dx, y + dy, corner))) g.pixel(x + dx, y + dy);
    for (const [dx, dy] of HEAD[0]) g.pixel(x + dx, y + dy);
    if (d > 1.06) { g.pixel(x, y - 1); g.pixel(x + 1, y - 1); g.pixel(x + 2, y - 1); }
    if (d > 1.22) { g.pixel(x, y + 3); g.pixel(x + 1, y + 3); g.pixel(x + 2, y + 3); }
  }
}

// ------------------------------------------------------------------ the frame

export default {
  name: 'IMPRINT',
  blurb: 'A pin-art board: the minute is the impression a pass pressed into the pins, the hour a pin dial at its centre, the seconds the pass itself.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields;
    const [ox, oy] = orbit(ctx.date, 3, 3);   // the board's burn-in walk, a whole pin a step
    const X = FX + ox, Y = FY + oy;

    if (SPECIMEN) {
      const pair = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]][((Math.floor(ctx.t) % 5) + 5) % 5];
      const sp = new Field();
      addDigit(sp, pair[0], SLOT[0]);
      addDigit(sp, pair[1], SLOT[1]);
      for (let j = 0; j < ROWS; j++)
        for (let i = 0; i < COLS; i++) pin(g, X + i * PITCH, Y + j * PITCH, sp.at(i * PITCH, j * PITCH));
      return;
    }

    // Time against the turn: `tt` runs 0..58 through the minute and then -2..0
    // under the pressing pass, so the design reads the same whichever side of
    // :00 it is asked about.
    const tt = f.sec > 56.0 ? f.sec - 60 : f.sec;
    const turnMinute = (tt < 0 ? f.m + 1 : f.m) % 60;
    const hourTurn = turnMinute === 0;

    ctx.oled.contrast(Math.round(208 - 178 * (ctx.night ?? 0)));

    // The pass: right to left across the minute, then the heavy left-to-right
    // pressing pass at the turn, out of the same edge.
    const crest = (1 - f.sec / 60) * FW;
    const crestAmp = progress(f.sec, 0, 1.2) * (1 - progress(f.sec, 55.0, 58.4));

    // There is one impression on the board, the minute the clock is on now. The
    // pass presses it flat before the turn and it rises again after, so the old
    // minute is only ever shown before :00 and the new one only after.
    const now = new Field();
    addDigit(now, +f.mm[0], SLOT[0]);
    addDigit(now, +f.mm[1], SLOT[1]);

    // The dial: never pressed, but it ripples as the pass crosses it and it
    // shivers when the hour is struck.
    const dial = new Field();
    theDial(dial, f.h, f.m / 60);

    // At the hour the board is struck flat all at once and rings; the dial
    // shivers as the blow lands and settles back over the next second.
    const strike = hourTurn ? progress(tt, -0.34, -0.02) : 0;
    const shake = strike * (1 - progress(tt, 0, 1.4));
    const hx = 60, hy = 26;

    for (let j = 0; j < ROWS; j++) {
      const py = Y + j * PITCH;
      for (let i = 0; i < COLS; i++) {
        const bx = i * PITCH, by = j * PITCH;

        // How high this pin stands: pressed away before the turn, risen after
        // it, and never both.
        let hgt, ring = 0;
        if (hourTurn) {
          const r = Math.hypot(bx - hx, by - hy);
          // One ring of pins runs out from the middle and dies away: the board
          // struck, and ringing. The new impression rises behind it.
          const front = 130 * tt;
          if (front > 0) ring = 0.85 * Math.exp(-(((r - front) / 9) ** 2)) * Math.exp(-1.1 * tt);
          hgt = tt < 0 ? 1 - strike : riseAt(0, tt - 0.14 - r / 150);
        } else if (tt < 0) {
          hgt = 1 - progress(tt, pressTime(bx) - 0.05, pressTime(bx) + 0.05);
        } else {
          hgt = riseAt(bx, tt);
        }
        let d = now.at(bx, by) * hgt + ring;

        // The dial is no impression: the pass ripples it, never wipes it.
        const ripple = 1 - 0.3 * Math.exp(-(((bx - crest) / 14) ** 2)) * crestAmp;
        const dd = dial.at(bx, by) * ripple * (1 - 0.5 * shake);
        if (dd > d) d = dd;

        // The pass lifts the impression as it goes over it.
        d += 0.2 * Math.exp(-(((bx - crest) / 12) ** 2)) * crestAmp * Math.min(1, d * 3);

        // The rail under the digits is the board's second hand: one pin stands
        // where the unseen hand is pressing, the pins it has just left are
        // still settling behind it, and every third pin is a mark on the scale.
        if (j === ROWS - 1) {
          const away = bx - crest;
          const bead = Math.exp(-((away / (away > 0 ? 13 : 3.4)) ** 2));
          if (bead > 0.16) d = Math.max(d, bead * 1.15);
          else if (i % 3 === 0) g.pixel(X + bx + 1, Y + by + 1);
        }

        pin(g, X + bx, Y + by, d);
      }
    }
  },
};
