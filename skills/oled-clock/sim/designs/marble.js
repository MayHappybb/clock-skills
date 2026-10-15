// Marble — a rolling ball clock.
//
// The kinetic sculpture invented by Harley Mayenschein in the 1970s (and sold
// as "the original rolling ball clock"), drawn in side view. Every minute a
// lift takes a steel ball from the reservoir and lets it roll onto the
// minute rail. The minute rail holds 4; the fifth ball tips it, its four
// balls run back to the reservoir and the fifth drops to the five-minute
// rail. That holds 11; the twelfth tips it and goes on to the hour rail,
// which holds 11 more beside one fixed ball, so it always reads 1 to 12. At
// 12:59 -> 1:00 the hour rail tips too and everything but the fixed ball
// runs home. (The counts are the classic ones, as in the 1995 ACM problem
// "Ball Clock".) 5 hour balls, 6 five-minute balls, 2 minute balls: 5:32.
//
// Each rail pivots at its entry end, near the lift; its left end leans on a
// stop. The ball that overflows a rail lands in a cup past the last slot,
// the rail swings its far end down (far enough for the balls to roll out
// under the stop tab), they run off as a train, the tipping ball drops
// through to the rail below, and the rail springs back and rings. A ball
// landing on a rail rocks it. The fixed hour ball is brass and hollow, on a
// bracket: the hour rail drops away beneath it.
//
// Reading: a number plate under every slot (drawn 3x5 numerals; the five
// minute rail labels 15/30/45 and dots the rest), and the slot the time is
// read at is boxed. A small exact readout sits top left. The lift car rises
// steadily through the minute, so its height is the seconds.
//
// Purity: the whole turn is planned from the two states (the minute before
// and the minute after) as closed-form phases (roll, rest, fall, run out),
// with rail tip schedules, and evaluated at the seconds from :00; the plan is
// cached by minute. The reservoir queue is N_FREE - balls on the rails - the
// one in the lift; returning balls leave the glass at the left, come back
// along the bottom and join the queue's tail.
//
// Burn-in: the sculpture walks a 5 x 3 serpentine; the fixed ball is hollow;
// 23:00-07:00 the panel dims.

import { clockFields, previousMinute, sprite } from '../js/kit.js';

const H = 64;
const R = 3.5, PITCH = 8;          // a 7-px ball; slots 8 px apart, so a dark pixel parts each pair
const SLOPE = 0.03;                // every rail runs gently down to the left
const N_FREE = 30;                 // balls in circulation (plus the fixed hour ball)

// ------------------------------------------------------------ the frame
//
// Each rail pivots at its right (entry) end. At rest its left end leans on a
// stop; tipped, the left end swings down `drop` px, far enough for the balls
// to roll out under the stop tab. The entry end has a cup one place past the
// last slot: the ball that lands there is the one that tips the rail, and it
// drops through to the rail below as the rail swings.
const RAILS = {
  M: { xL: 78, xR: 117, y0: 9, stop: 78, slot1: 82, n: 4, cup: 114, drop: 8 },
  F: { xL: -8, xR: 117, y0: 26, stop: 14, slot1: 18, n: 11, cup: 106, drop: 8 },
  H: { xL: -8, xR: 110, y0: 44, stop: 6, slot1: 10, n: 12, cup: 106, drop: 9 },
};
const ORDER = ['M', 'F', 'H'];
const NEXT = { M: 'F', F: 'H' };
const slotX = (r, k) => r.slot1 + (k - 1) * PITCH;   // k = 1..n
/** The rail's top surface at x, with its left end dropped by `d`. */
const surf = (r, x, d = 0) => r.y0 + SLOPE * (r.xR - x) + (d * (r.xR - x)) / (r.xR - r.stop);
const RAMP = { x0: 78, y0: 9 + SLOPE * 39 + 8, x1: -10, y1: 20.5 };   // the minute rail's return chute
const rampY = (x) => RAMP.y0 + ((RAMP.y1 - RAMP.y0) * (RAMP.x0 - x)) / (RAMP.x0 - RAMP.x1);

const LIFT_X = 121;                 // the lift's car, ball centre
const LIFT_TOP = 5.2, LIFT_BOT = 59.5;
const QUEUE_Y = 59.5, QUEUE_HEAD = LIFT_X - PITCH;

// Motion constants, px and seconds.
const G = 600;                       // free fall
const ROLL_V0 = 34, ROLL_A = 26;     // along a resting rail
const TIP_A = 240;                   // along a tipped rail (steeper)
const TIP_IN = 0.16;                 // the rail swings down this fast
const RETURN_LAG = 0.9;              // hidden return path, left edge to the reservoir
const QUEUE_V = 95;

// ------------------------------------------------------------ state

/** What the rails hold at a minute: minute balls, five-minute balls, hour balls (with the fixed one). */
function stateOf(c) { return { M: c.m % 5, F: Math.floor(c.m / 5), H: c.h12 }; }
const onRails = (s) => s.M + s.F + s.H - 1;

const rollTime = (d, v0 = ROLL_V0, a = ROLL_A) => (d <= 0 ? 0 : (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a);
const rollDist = (t, v0 = ROLL_V0, a = ROLL_A) => v0 * t + 0.5 * a * t * t;
const fallTime = (h) => Math.sqrt((2 * Math.max(0, h)) / G);

/**
 * Plan the turn from state S0 to S1, in seconds from the turn (tau = 0 at
 * :00). Returns rail tip schedules, ball tracks and the returning balls.
 * Each track is a list of phases; `ballAt` evaluates one.
 */
function plan(S0, S1) {
  const tips = {};            // rail -> { t0, t1 }
  const tracks = [];          // moving balls (the resting ones are drawn from state)
  const exits = [];           // times balls leave the glass at the left
  // The incoming ball leaves the lift at -1.0 and rolls onto the minute rail.
  let t = -1.0;
  let rail = 'M', x = LIFT_X, phases = [];
  let landed = false;
  let count = { ...S0 };
  let landT = 0;
  const impacts = [];
  while (!landed) {
    const r = RAILS[rail];
    const full = count[rail] >= r.n;
    const target = full ? r.cup : slotX(r, count[rail] + 1);
    const d = x - target;
    const T = rollTime(d);
    phases.push({ kind: 'roll', rail, t0: t, x0: x, x1: target, T });
    t += T;
    if (!full) {
      phases.push({ kind: 'rest', rail, t0: t, x: target, bump: true });
      impacts.push({ rail, t, k: 0.7 });
      landT = t;
      tracks.push(phases);
      landed = true;
      break;
    }
    // It sits in the cup a moment, the rail tips, its balls run out.
    const t0 = t + (rail === 'M' ? 0.35 : 0.12);
    let last = t0;
    for (let k = rail === 'H' ? 2 : 1; k <= count[rail]; k++) {
      const out = runOut(rail, slotX(r, k), t0);
      tracks.push(out.phases);
      exits.push(out.exit);
      last = Math.max(last, out.clear);
    }
    tips[rail] = { t0, t1: last + 0.05 };
    count[rail] = rail === 'H' ? 1 : 0;
    if (rail === 'H') {
      // Twelve o'clock gone: the tipping ball runs out after the others.
      const out = runOut(rail, r.cup, t0 + 0.12);
      phases.push({ kind: 'rest', rail, t0: t, x: r.cup }, out.phases[1]);
      tips[rail].t1 = Math.max(tips[rail].t1, out.clear + 0.05);
      landT = t;
      exits.push(out.exit);
      tracks.push(phases);
      landed = true;
      break;
    }
    // The tipping ball drops through to the rail below.
    phases.push({ kind: 'rest', rail, t0: t, x: r.cup });
    const nr = RAILS[NEXT[rail]];
    const yFrom = surf(r, r.cup) - R, yTo = surf(nr, r.cup) - R;
    const tf = fallTime(yTo - yFrom);
    phases.push({ kind: 'fall', t0: t0 + 0.06, x: r.cup, y0: yFrom, y1: yTo, T: tf });
    t = t0 + 0.06 + tf;
    rail = NEXT[rail];
    impacts.push({ rail, t, k: 1.2 });   // it lands hard on the rail below
    x = r.cup;
  }
  // Queue: returning balls, in the order they leave the glass.
  exits.sort((a, b) => a - b);
  return { tips, tracks, exits, S0, S1, landT, impacts };
}

/** A ball rolling out of a tipped rail and off the glass to the left. */
function runOut(rail, x0, t0) {
  const r = RAILS[rail];
  const start = t0 + 0.06;
  const dStop = x0 - (r.stop - R - 1);               // until it is clear of the stop
  const clear = start + Math.sqrt((2 * dStop) / TIP_A);
  const dOff = x0 + 6;                               // until it has left the glass
  let exit;
  exit = start + Math.sqrt((2 * dOff) / TIP_A);
  return { phases: [{ kind: 'rest', rail, t0: -99, x: x0 }, { kind: 'out', rail, t0: start, x0 }], clear, exit };
}

/** Where a planned ball is at tau: [x, y, rail] or null once gone. */
function ballAt(phases, tau, dropOf) {
  let p = null;
  for (const q of phases) if (tau >= q.t0) p = q;
  if (!p) return null;
  const dt = tau - p.t0;
  if (p.kind === 'roll') {
    const r = RAILS[p.rail];
    const x = dt >= p.T ? p.x1 : p.x0 - rollDist(dt);
    return [x, surf(r, x, dropOf(p.rail)) - R];
  }
  if (p.kind === 'rest') {
    const r = RAILS[p.rail];
    let x = p.x;
    if (p.bump && dt < 0.5) x += 1.4 * Math.exp(-9 * dt) * Math.sin(dt * 30);   // knocks into its neighbour
    return [x, surf(r, x, dropOf(p.rail)) - R];
  }
  if (p.kind === 'fall') {
    const y = dt >= p.T ? p.y1 : p.y0 + 0.5 * G * dt * dt;
    return [p.x, y];
  }
  if (p.kind === 'out') {
    const r = RAILS[p.rail];
    const s = 0.5 * TIP_A * dt * dt;
    let x = p.x0 - s;
    if (p.rail === 'M' && x < r.xL) {
      // Along the chute. The balls run as a train, so they share one
      // displacement and keep their spacing.
      if (x < -6) return null;
      return [x, rampY(x) - R];
    }
    if (x < -6) return null;
    return [x, surf(r, x, dropOf(p.rail)) - R];
  }
  return null;
}

/** The left-end drop of a rail at tau: swings down, holds, springs back and rings. */
function dropAt(rail, tips, tau, impacts = []) {
  // A ball landing on a rail rocks it on its pivot.
  let knock = 0;
  for (const im of impacts) if (im.rail === rail && tau > im.t && tau < im.t + 0.8) {
    const u = tau - im.t;
    knock += im.k * Math.exp(-7 * u) * Math.sin(22 * u);
  }
  const tip = tips[rail];
  if (!tip || tau < tip.t0) return knock;
  const D = RAILS[rail].drop;
  if (tau < tip.t1) return D * Math.min(1, ((tau - tip.t0) / TIP_IN) ** 2);
  const u = tau - tip.t1;
  return D * Math.exp(-4.5 * u) * Math.cos(11 * u);
}

// ------------------------------------------------------------ drawing

// A steel ball: lit, with a dark ring round the window highlight and a dark
// horizon band low down; a dark fleck turns with the roll.
const BALL = sprite(`
  ..###..
  .#..##.
  #...###
  #..####
  #######
  .#####.
  ..###..
`);

// The fixed hour ball is brass, not steel: hollow, so it reads as the one
// that never moves (and does not wear a solid disc into the glass).
const BRASS = sprite(`
  ..###..
  .#...#.
  #.##..#
  #.#...#
  #.....#
  .#...#.
  ..###..
`);

function drawBall(g, x, y, roll = true, spr = BALL) {
  const ix = Math.round(x - R), iy = Math.round(y - R);
  // A dark keyline, so a ball in flight reads over rails and plates.
  g.fillCircle(ix + 3.5, iy + 3.5, 4.4, 0);
  g.blit(spr, ix, iy);
  if (spr !== BALL) return;
  if (roll) {
    // A fleck on the lower-right of the steel turns with the roll (x / r radians).
    const a = -x / R;
    const fx = Math.round(ix + 3 + 1.9 * Math.cos(a)), fy = Math.round(iy + 3.5 + 1.9 * Math.sin(a));
    // Only on the lit lower-right half: on the other side it is lost in the reflection.
    if (fx - ix + fy - iy >= 7) g.pixel(fx, fy, 0);
  }
}

// Plate numerals: 3x5, round-shouldered, with a narrow 1 so that 10-12 fit a slot.
const NUM = {
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#', '##', '.#', '.#', '.#'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['.#.', '#.#', '.#.', '#.#', '.#.'], 9: ['.#.', '#.#', '.##', '..#', '##.'],
};
const NUMS = Object.fromEntries(Object.entries(NUM).map(([k, v]) => [k, sprite(v)]));
const numW = (s) => [...String(s)].reduce((w, ch) => w + NUMS[ch].w + 1, -1);
function num(g, s, cx, y, c = 1) {
  let x = Math.round(cx - numW(s) / 2);
  for (const ch of String(s)) { g.blit(NUMS[ch], x, y, { c }); x += NUMS[ch].w + 1; }
}

// The readout's digits, 4x7, drawn for this face.
const BIG = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
  3: ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'],
  4: ['#..#', '#..#', '#..#', '####', '...#', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
};
const BIGS = Object.fromEntries(Object.entries(BIG).map(([k, v]) => [k, sprite(v)]));
const LET = { A: sprite(['.#.', '#.#', '###', '#.#', '#.#']), P: sprite(['##.', '#.#', '##.', '#..', '#..']), M: sprite(['#.#', '###', '###', '#.#', '#.#']) };

function readout(g, f, x, y) {
  const s = `${f.h12}:${f.mm}`;
  for (const ch of s) {
    if (ch === ':') { g.pixel(x, y + 2); g.pixel(x, y + 4); x += 2; continue; }
    g.blit(BIGS[ch], x, y); x += BIGS[ch].w + 1;
  }
  x += 1;
  g.blit(LET[f.pm ? 'P' : 'A'], x, y + 2); g.blit(LET.M, x + 4, y + 2);
}

/** A rail: a 1-px bar from its left end to its pivot, the stop tab, the pivot pin. */
function drawRail(g, r, d, ox, oy) {
  const x0 = Math.max(r.xL, -4), x1 = r.xR;
  for (let x = Math.ceil(x0); x <= x1; x++) g.pixel(x + ox, Math.round(surf(r, x + 0.5, d)) + oy);
  // The stop: a tab hanging from the frame at rest height.
  const ys = Math.round(surf(r, r.stop)) + oy;
  g.vline(r.stop + ox, ys - 6, 4);
  // The pivot.
  const yp = Math.round(surf(r, r.xR)) + oy;
  g.pixel(r.xR + ox, yp + 1); g.pixel(r.xR - 1 + ox, yp + 2); g.pixel(r.xR + 1 + ox, yp + 2);
}

/** Number plates under a rail: every slot, the place the time is read at inverted. */
function drawPlates(g, rail, count, ox, oy) {
  const r = RAILS[rail];
  for (let k = 1; k <= r.n; k++) {
    const x = slotX(r, k) + ox, y = Math.round(surf(r, slotX(r, k))) + 2 + oy;
    const label = rail === 'F' ? 5 * k : k;
    const here = k === count;
    const near = Math.abs(k - count) === 1;
    if (here) {
      const w = numW(label);
      g.rect(Math.round(x - w / 2) - 2, y - 2, w + 4, 9);
      num(g, label, x, y);
      continue;
    }
    if (rail === 'F' && k % 3 !== 0) { g.pixel(Math.round(x - 0.5), y + 2); continue; }
    if (rail === 'F' && near) continue;
    num(g, label, x, y);
  }
}

// ------------------------------------------------------------ face

let CACHE = { key: null, plan: null };

/**
 * Burn-in: the whole sculpture walks a 5 x 3 serpentine, a pixel every two
 * minutes, stepping at :30 (clear of the turn). Only a pixel up or down:
 * the face already fills the glass from top to bottom.
 */
function walk(date) {
  const k = Math.floor((date.getTime() - 30000) / 120000);
  const p = ((k % 15) + 15) % 15, row = Math.floor(p / 5), col = row & 1 ? 4 - (p % 5) : p % 5;
  return [col - 2, row - 1];
}

export default {
  name: 'Marble',
  blurb: 'A rolling ball clock: a lift brings up a steel ball each minute; full rails tip, balls cascade home, and at 1:00 everything empties.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = walk(date);
    const late = f.sec >= 59;
    const fromF = late ? f : previousMinute(date);
    const toF = late ? clockFields(new Date(date.getTime() + 60000)) : f;
    const tau = late ? f.sec - 60 : f.sec;
    const key = toF.minuteKey;
    if (CACHE.key !== key) CACHE = { key, plan: plan(stateOf(fromF), stateOf(toF)) };
    const P = CACHE.plan;
    const S0 = P.S0, S1 = P.S1;
    const dropOf = (rail) => dropAt(rail, P.tips, tau, P.impacts);

    readout(g, f, 3 + ox, 2 + oy);

    // Rails.
    for (const rail of ORDER) {
      const r = RAILS[rail];
      drawRail(g, r, dropOf(rail), ox, oy);
    }
    // Chute from the minute rail's stop, dotted.
    for (let x = RAMP.x0 - 2; x >= 0; x -= 4) g.pixel(x + ox, Math.round(rampY(x)) + oy);

    // Resting balls: what the old state had, minus those that move this turn.
    const moving = new Set();
    for (const rail of ORDER) if (P.tips[rail]) moving.add(rail);
    for (const rail of ORDER) {
      const r = RAILS[rail];
      if (moving.has(rail)) continue;   // drawn from their tracks
      for (let k = 1; k <= S0[rail]; k++) {
        const x = slotX(r, k);
        drawBall(g, x + ox, surf(r, x, dropOf(rail)) - R + oy, true, rail === 'H' && k === 1 ? BRASS : BALL);
      }
    }
    // The fixed hour ball, on its bracket, when the hour rail is tipping.
    if (moving.has('H')) {
      const r = RAILS.H, x = slotX(r, 1), y = surf(r, x) - R;
      drawBall(g, x + ox, y + oy, false, BRASS);
    }
    // The fixed ball's bracket.
    {
      const r = RAILS.H, x = slotX(r, 1), y = Math.round(surf(r, x) - 2 * R) + oy;
      g.vline(x + ox, y - 3, 2);
    }
    // Moving balls.
    for (const ph of P.tracks) {
      const p = ballAt(ph, tau, dropOf);
      if (p) drawBall(g, p[0] + ox, p[1] + oy);
    }

    // Plates: the old count until the incoming ball has come to rest.
    const settled = tau >= P.landT ? S1 : S0;
    for (const rail of ORDER) drawPlates(g, rail, settled[rail], ox, oy);

    drawLift(g, f, tau, P, ox, oy);
    drawQueue(g, tau, P, ox, oy);
    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};

/** The lift: a car on a cable, up a guide at the right. */
function drawLift(g, f, tau, P, ox, oy) {
  let y, ball = false, tilt = 0;
  if (tau < -1.0) { y = LIFT_TOP; ball = true; }
  else if (tau < -0.6) { y = LIFT_TOP; tilt = 1; }
  else if (tau < 0) { const u = (tau + 0.6) / 0.6; y = LIFT_TOP + (LIFT_BOT - LIFT_TOP) * u * u; }
  else if (tau < 0.5) { y = LIFT_BOT - 1.5 * Math.exp(-10 * tau) * Math.abs(Math.sin(tau * 25)); ball = tau > 0.35; }
  else { y = LIFT_BOT + (LIFT_TOP - LIFT_BOT) * Math.min(1, (tau - 0.5) / 58.5); ball = true; }
  const x = LIFT_X + ox, yy = y + oy;
  // Guide: a dotted post. Cable: a line from the top to the car.
  for (let j = (oy + 3) % 3; j < H; j += 3) g.pixel(LIFT_X + 5 + ox, j);
  g.vline(x, 0, Math.max(0, Math.round(yy - R - 2)));
  // The car: a cup under the ball, tilting left to let it go.
  const cy = Math.round(yy + R + 1);
  g.hline(x - 3, cy - tilt, 3); g.hline(x, cy, 4);
  g.pixel(x + 4, cy - 1); g.pixel(x + 4, cy - 2);
  if (ball) drawBall(g, x, yy, false);
}

/** The reservoir: a queue of balls along the bottom, rolling to the lift. */
function drawQueue(g, tau, P, ox, oy) {
  const q0 = N_FREE - onRails(P.S0) - 1;
  // Before the pick: q0 balls. During it the head rolls into the car and the rest move up.
  let pos = [];
  if (tau < 0) for (let j = 0; j < q0; j++) pos.push(QUEUE_HEAD - j * PITCH);
  else {
    const u = Math.min(1, tau / 0.35);
    const e = u * u * (3 - 2 * u);
    for (let j = 0; j < q0; j++) {
      const x = QUEUE_HEAD - j * PITCH + PITCH * e;
      if (j === 0 && u >= 1) continue;
      pos.push(x);
    }
  }
  for (const x of pos) if (x > -4) drawBall(g, x + ox, QUEUE_Y + oy);
  // Returning balls come in from the left and join the tail.
  const tail = q0 - 1;
  let prev = -Infinity;
  P.exits.forEach((te, i) => {
    // Balls come back in the order they left, never closer than a ball apart.
    const ta = Math.max(te + RETURN_LAG, prev + PITCH / QUEUE_V);
    prev = ta;
    if (tau < ta) return;
    const xt = QUEUE_HEAD - (tail + i) * PITCH;
    const x = Math.min(xt, -6 + QUEUE_V * (tau - ta));
    if (x > -4) drawBall(g, x + ox, QUEUE_Y + oy);
  });
}
