// Truchet — a tile typeface, set in a field of turning Truchet tiles.
//
// The whole glass is one grid of 7-pixel cells. Most of it is a Smith-Truchet
// field: every cell holds two thin dotted quarter arcs joining the midpoints
// of its edges, so the arcs of neighbouring cells run on into meandering
// lines. The time is the bold part of the same tiling: each digit is 3 x 5
// solid tiles with a pixel of grout between them, every tile one shape from
// a small constructivist family (square, quarter disc, triangle, half disc,
// arch, notch, and slices of a larger circle so the bowls of 0 2 3 5 6 8 9
// are true arcs spanning three tiles). All of them are one formula, the
// square cut by a ring about an anchor point, which is what lets any tile
// turn into any other.
//
// The minute: a wave leaves the centre of every digit that changes 0.7 s
// before :00. As it reaches a tile of the changing digit the tile lifts (it
// shrinks), turns one or two quarter turns (the turn chosen so the rotation
// does most of the work and the shape morph the rest), changes shape while
// it is small and settles into the new digit with a small overshoot. Every
// tile of a changing digit turns, even one that ends as it began, so the
// digit passes through a lattice of spinning tiles and never reads half old,
// half new; and all changing digits run the same timing, so 10:59 -> 11:00
// never shows 11:59 or 10:50. The wave runs on through the field and turns
// every background tile it passes. On the hour the wave starts at the colon
// and every tile of all four digits spins a full turn more. Twice a minute
// (:20, :40) a ripple drops somewhere in the field; the digits rock as it
// passes under them. Background tiles also make their own slow random turns.
// The colon is two small squares that tick a quarter turn each second.
//
// Everything is a function of the clock: a background cell's angle is the
// number of turns it has made (one per wave and ripple, three a minute, plus
// its own turns on its own period) with each turn eased, so it is defined at
// any instant. Digit tiles are timed from the wave's arrival at their centre.
//
// Burn-in: the face walks a 7 x 7 serpentine, a pixel every three minutes, so
// the grout lines sweep every pixel of a tile; the field is dotted and keeps
// turning; 23:00-07:00 the panel runs at low contrast.

import { clockFields, noise } from '../js/kit.js';

// ------------------------------------------------------------ geometry

const CELL = 7;             // grid pitch, pixels
const LIT = 6;              // a tile's lit square; the seventh pixel is grout
const COLS = 20, ROWS = 11; // the grid overhangs every edge, for the orbit
const GX = -6, GY = -7;     // grid origin before the burn-in orbit
const SLOT_COL = [2, 6, 11, 15];
const DIGIT_ROW = 3;
const COLON_X = 64, COLON_ROWS = [4, 6];  // the colon sits on the line between cells 9 and 10

// ------------------------------------------------------------ the tile family
//
// A tile is its lit square [-.5,.5]^2 (tile units, y down) intersected with
// a ring r0 <= |p - A| <= r1 about an anchor A, which may lie outside the
// tile. One family holds every shape, so any tile can morph into any other
// by moving its anchor and radii while it turns:
//
//   F full, E empty, O dot
//   q  quarter disc: anchor on a corner, radius 1
//   t  triangle: anchor far off along the diagonal, a half-plane
//   h  half disc: anchor on an edge's midpoint, radius .5
//   u  arch: anchor on an edge's midpoint, radius 1 (a stroke's round end)
//   n  notch: the square minus a half disc cut from one edge
//   R  a slice of a bigger circle or ring, its centre given in glyph cells
//
// The digit q/t/h/u/n carry a quarter-turn count: q0 rounds the top-left
// corner, q1 top-right, q2 bottom-right, q3 bottom-left; t0 lights the
// bottom-right half; h0 and u0 point up; n0 is notched from the left.
const FAR = 8;
const BASE = {
  F: { ax: 0, ay: 0, r0: 0, r1: 1 },
  E: { ax: 0, ay: 0, r0: 0, r1: 0 },
  O: { ax: 0, ay: 0, r0: 0, r1: 0.36 },
  q: { ax: 0.5, ay: 0.5, r0: 0, r1: 1 },
  t: { ax: FAR / Math.SQRT2, ay: FAR / Math.SQRT2, r0: 0, r1: FAR },
  h: { ax: 0, ay: 0.5, r0: 0, r1: 0.5 },
  u: { ax: 0, ay: 0.5, r0: 0, r1: 1 },
  n: { ax: -0.5, ay: 0, r0: 0.5, r1: 2 },
};

/** Turn params a quarter turn clockwise, `k` times (screen y is down). */
function turn(p, k) {
  let { ax, ay } = p;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [ax, ay] = [-ay, ax];
  return { ax, ay, r0: p.r0, r1: p.r1 };
}

// Rings of the bowls, in glyph cells (a digit is 3 x 5 cells).
const RINGS = { T: [1.5, 1.5], B: [1.5, 3.5] };

/**
 * One token -> tile params, for the tile at column i, row j of a glyph.
 * 'To' = the solid part of the top bowl's circle, 'Ti' = its ring (with the
 * counter cut out); 'Bo' / 'Bi' the bottom bowl's.
 */
function parse(s, i, j) {
  if (s[0] === 'T' || s[0] === 'B') {
    // Cells are CELL apart but a tile's unit is its LIT square.
    const [cx, cy] = RINGS[s[0]], k = CELL / LIT;
    return { ax: (cx - (i + 0.5)) * k, ay: (cy - (j + 0.5)) * k, r0: s[1] === 'i' ? 0.5 * k : 0, r1: 1.5 * k - 0.07 };
  }
  if (s.length === 1) return { ...BASE[s] };
  return turn(BASE[s[0]], Number(s[1]));
}

const GLYPH_SRC = {
  0: ['To Ti To', 'F E F', 'F E F', 'F E F', 'Bo Bi Bo'],
  1: ['q0 F E', 'E F E', 'E F E', 'E F E', 'E F E'],
  2: ['To Ti To', 'h2 E F', 'E t0 t2', 't0 t2 E', 'F F F'],
  3: ['To Ti To', 'h2 E F', 'E u3 F', 'h0 E F', 'Bo Bi Bo'],
  4: ['E t0 F', 't0 t2 F', 't2 E F', 'F F F', 'E E F'],
  5: ['F F F', 'F E E', 'F Bi Bo', 'h0 E F', 'Bo Bi Bo'],
  6: ['To Ti To', 'F E h2', 'F Bi Bo', 'F E F', 'Bo Bi Bo'],
  7: ['F F F', 'E t0 t2', 'E F E', 'E F E', 'E F E'],
  8: ['To Ti To', 'F E F', 'n0 F n2', 'F E F', 'Bo Bi Bo'],
  9: ['To Ti To', 'F E F', 'To Ti F', 'h0 E F', 'Bo Bi Bo'],
};
const GLYPHS = {};
for (const [d, rows] of Object.entries(GLYPH_SRC))
  GLYPHS[d] = rows.map((r, j) => r.split(' ').map((s, i) => parse(s, i, j)));

const empty = (p) => p.r1 <= 0.03;

/**
 * Light the pixels of one tile: centre (cx, cy), turned `ang` radians
 * clockwise, lit square `side` pixels, params `p` (in the turned frame).
 */
function tilePixels(cx, cy, ang, side, p, put) {
  if (empty(p) || side <= 0.5) return;
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = side * 0.75 + 1;
  const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * c + dy * s) / side, v = (-dx * s + dy * c) / side;
      if (u < -0.5 || u > 0.5 || v < -0.5 || v > 0.5) continue;
      const d = Math.hypot(u - p.ax, v - p.ay);
      if (d >= p.r0 && d <= p.r1) put(x, y);
    }
}

const lerpP = (a, b, u) => ({ ax: a.ax + (b.ax - a.ax) * u, ay: a.ay + (b.ay - a.ay) * u, r0: a.r0 + (b.r0 - a.r0) * u, r1: a.r1 + (b.r1 - a.r1) * u });
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
/** A turn: accelerate, overshoot a little, settle (a tile clicking home). */
const click = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2);

/**
 * How a tile turns from `a` into `b`: the number of quarter turns `k`
 * (-1, 1 or 2) that brings `a`'s shape closest to `b`'s, so the turn does
 * most of the work and the morph only the rest. Tiles always turn.
 */
function plan(a, b, parity) {
  let best = null;
  for (const k of [1, -1, 2]) {
    const tb = turn(b, -k);
    let cost = Math.hypot(a.ax - tb.ax, a.ay - tb.ay) + Math.abs(a.r0 - tb.r0) + Math.abs(a.r1 - tb.r1);
    if (k === 2) cost += 0.4;
    if (k === -1 && parity) cost -= 0.01;  // ties alternate direction, like meshing gears
    if (!best || cost < best.cost - 1e-9) best = { k, cost };
  }
  return best.k;
}

// ------------------------------------------------------------ timing

const WAVE_T0 = -0.7;    // the wave leaves its sources this long before :00
const SPEED = 60;        // wave speed, pixels per second
const TURN = 1.0;        // a digit tile's quarter turn, seconds (+ TURN_K per extra quarter)
const TURN_K = 0.25;
const HOUR_TURN = 1.6;   // on the hour every digit tile spins a full turn more
const BG_TURN = 0.5;     // a background tile's quarter turn
const RIPPLE_SPEED = 45;  // an idle ripple's speed, pixels per second
const ROCK = 0.22, ROCK_T = 0.9;  // how far and how long a resting tile rocks as a ripple passes
const DIP = 0.5, DIP_HOUR = 0.55;    // how far a turning tile lifts (shrinks), at its deepest

const digitsAt = (minute) => { const c = clockFields(new Date(minute * 60000)); return { s: `${c.hh}${c.mm}`, hour: c.m === 0 }; };

/** Centre of a digit tile, a background cell, a slot, in canvas coordinates (before the orbit). */
const tileCentre = (k, i, j) => [GX + (SLOT_COL[k] + i) * CELL + LIT / 2, GY + (DIGIT_ROW + j) * CELL + LIT / 2];
const slotCentre = (k) => tileCentre(k, 1, 2);

/**
 * The wave at the turn into minute B: where it starts from, and when it
 * reaches each point. On a minute it rings out from the centre of every
 * digit that changes, all at once, so every changing digit is always at
 * the same stage; on the hour from the middle of the face, through all four.
 */
function wave(B) {
  const before = digitsAt(B - 1), after = digitsAt(B);
  const changed = [0, 1, 2, 3].filter((k) => before.s[k] !== after.s[k]);
  const sources = after.hour ? [[COLON_X, 32]] : changed.map(slotCentre);
  const t0 = B * 60 + WAVE_T0;
  return {
    B, t0, before: before.s, after: after.s, hour: after.hour, changed,
    at: (x, y) => {
      let d = Infinity;
      for (const [sx, sy] of sources) d = Math.min(d, Math.hypot(x - sx, y - sy));
      return t0 + d / SPEED;
    },
  };
}

/**
 * An idle ripple: twice a minute, at :20 and :40, a drop falls somewhere on
 * the field and a slower ring spreads from it, turning the tiles it passes.
 */
function ripple(M, sec) {
  const sx = 8 + 112 * noise(M, sec), sy = 6 + 52 * noise(M, sec + 1);
  const t0 = M * 60 + sec;
  return { t0, at: (x, y) => t0 + Math.hypot(x - sx, y - sy) / RIPPLE_SPEED };
}

/** Which background cells are free: not inside a digit or a colon tile. */
const FREE = Array.from({ length: ROWS }, (_, j) => Array.from({ length: COLS }, (_, i) => {
  if (j >= DIGIT_ROW && j < DIGIT_ROW + 5 && SLOT_COL.some((c) => i >= c && i < c + 3)) return false;
  return !((i === 9 || i === 10) && COLON_ROWS.includes(j));
}));

/**
 * The background: a Smith-Truchet field, two thin quarter arcs per cell
 * joining the midpoints of its edges, dotted so it stays a texture behind
 * the solid digits. A cell's angle (in quarter turns) is the count of every
 * turn it has made: one per minute wave that has passed it, and its own
 * slow random turns. Each is eased, so the sum is continuous in time.
 */
function background(g, T, K, waves, ox, oy) {
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      if (!FREE[j][i]) continue;
      const id = j * COLS + i;
      const cx = GX + i * CELL + CELL / 2, cy = GY + j * CELL + CELL / 2;
      // Its own turns: one every P seconds, at its own phase.
      const P = 17 + 40 * noise(id, 11), ph = noise(id, 12) * P;
      const n = Math.floor((T + ph) / P);
      let frac = click(clamp01((T - (n * P - ph)) / BG_TURN));
      let whole = n + (noise(id, 13) < 0.5 ? 1 : 0);
      // One turn per wave and ripple: three a minute, and every one from
      // before this minute has passed it (only the parity matters).
      whole += 3 * K;
      for (const w of waves) frac += click(clamp01((T - w.at(cx, cy)) / BG_TURN));
      const turns = (((whole % 2) + 2) % 2) + frac;
      const a = turns * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      const px0 = cx + ox, py0 = cy + oy;
      const H = CELL / 2;
      for (let y = Math.floor(py0 - H); y < py0 + H; y++)
        for (let x = Math.floor(px0 - H); x < px0 + H; x++) {
          if ((x + y) & 1) continue;
          const dx = x + 0.5 - px0, dy = y + 0.5 - py0;
          const u = dx * c + dy * s, v = -dx * s + dy * c;
          const d = Math.min(Math.hypot(u + H, v + H), Math.hypot(u - H, v - H));
          if (Math.abs(d - H) <= 0.6) g.pixel(x, y, 1);
        }
    }
}

/**
 * Burn-in: the whole face walks a 7 x 7 serpentine, one pixel every three
 * minutes (stepping at :30, clear of the minute turn), so every grout line
 * passes over every pixel of a tile in turn. The field is periodic in the
 * cell, so only the digits are seen to move.
 */
function walk(date) {
  const k = Math.floor((date.getTime() - 30000) / 180000);
  const p = ((k % 49) + 49) % 49, row = Math.floor(p / 7), col = row & 1 ? 6 - p % 7 : p % 7;
  return [col - 3, row - 3];
}

export default {
  name: 'Truchet',
  blurb: 'A tile typeface in a turning Truchet field: at the minute the tiles lift, spin and re-form the new digit.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = walk(date);
    const T = date.getTime() / 1000;
    const K = Math.floor(T / 60);
    const waves = [wave(K), wave(K + 1)];
    const ripples = [ripple(K, 20), ripple(K, 40)];
    background(g, T, K, [...waves, ...ripples], ox, oy);

    // The digits. In the first half of the minute the wave that matters is
    // the one that brought this minute in, in the second the one coming.
    const w = f.sec < 30 ? waves[0] : waves[1];
    const moving = [];
    const lit = (x, y) => g.pixel(x, y, 1);
    for (let k = 0; k < 4; k++) {
      const A = GLYPHS[w.before[k]], Bg = GLYPHS[w.after[k]];
      const changed = w.changed.includes(k);
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 3; i++) {
          const [cx0, cy0] = tileCentre(k, i, j);
          const cx = cx0 + ox, cy = cy0 + oy;
          const a = A[j][i], b = Bg[j][i];
          // Inside a digit the wave runs at twice its speed, so the whole
          // digit is in the air together.
          const t0 = w.hour ? w.at(cx0, cy0) : w.t0 + (w.at(cx0, cy0) - w.t0) / 2;
          if (!(changed || w.hour) || (empty(a) && empty(b))) {
            // A digit at rest rocks a little as a ripple passes under it.
            let rock = 0;
            for (const r of ripples) {
              const v = (T - r.at(cx0, cy0)) / ROCK_T;
              if (v > 0 && v < 1) rock += ROCK * Math.sin(2 * Math.PI * v) * (1 - v);
            }
            tilePixels(cx, cy, rock, LIT, a, lit);
            continue;
          }
          // Every tile of a changing digit turns, even one that ends as it
          // began, so the digit is never half old and half new.
          let steps = plan(a, b, (i + j + k) & 1);
          if (w.hour) steps += steps < 0 ? -4 : 4;
          const dur = w.hour ? HOUR_TURN : TURN + TURN_K * (Math.abs(steps) - 1);
          const u = (T - t0) / dur;
          if (u <= 0 || u >= 1) { tilePixels(cx, cy, 0, LIT, u >= 1 ? b : a, lit); continue; }
          // Turning: from a, through `steps` quarter turns, into b. The tile
          // lifts (shrinks) as it turns, and changes shape while it is small,
          // so mid-turn the digit is a lattice of spinning tiles, not a
          // numeral. The shape morphs in the turned frame, ending exactly on b.
          const e = click(u), m = smooth(clamp01((u - 0.25) / 0.5));
          const shape = lerpP(a, turn(b, -steps), m);
          const side = LIT * (1 - (w.hour ? DIP_HOUR : DIP) * Math.sin(Math.PI * u) ** 0.6);
          moving.push([cx, cy, steps * e * Math.PI / 2, side, shape]);
        }
    }
    // Tiles in the air get a dark keyline, cut into whatever they pass over.
    for (const [cx, cy, ang, side, shape] of moving) {
      const pts = [];
      tilePixels(cx, cy, ang, side, shape, (x, y) => pts.push([x, y]));
      for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.pixel(x + dx, y + dy, 0);
      for (const [x, y] of pts) g.pixel(x, y, 1);
    }

    // The colon: two small quarter discs that tick a quarter turn each
    // second, in opposite directions.
    const tick = f.s + click(clamp01((f.sec - f.s) / 0.3));
    COLON_ROWS.forEach((row, n) => {
      const cx = COLON_X + ox, cy = GY + row * CELL + CELL / 2 + oy;
      tilePixels(cx, cy, (n ? -1 : 1) * tick * Math.PI / 2, 4, BASE.F, lit);
    });

    oled.contrast(0xcf + (0x20 - 0xcf) * night);  // night dimming, 23:00-07:00 (ctx.night)
  },
};
