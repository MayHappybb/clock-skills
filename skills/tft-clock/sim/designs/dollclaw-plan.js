// dollclaw: what the claw does this minute, as a timeline.
//
// A minute's plan is built from the previous, current and next minute's
// digits and cached by minute key; everything else asks it "where is the
// claw at second s". The numerals move as single prizes or as a pair caught
// in one wide scoop (the claw spreads its prongs: state `w`, 0 single, 1 pair).
//
//   ..:5x  clear the numerals about to change: old hour digit(s) first, down
//          the prize chute (left); then the old minute digit(s), tossed back
//          into the prize heap (right). The last one is let go deep in the
//          heap at 59.65 s, so the claw is already buried there, open, at :00.
//   :00+   the claw closes on the new minute digit(s) in the heap and sets
//          them down. On the hour the new hour digit(s) don't need the claw:
//          they tumble in through the refill hatch in the ceiling, right
//          after :00. Then the big show: the claw grabs the panda by the
//          head, lifts her, jiggles, and (it is a claw machine) lets her slip.
//   mid    idle visits: hover beside the panda, nose to nose with the puppy;
//          then the puppy sniffs the prize heap.
// Turns into the hour run at a brisker pace (PACE_HOUR): it's a show.
// A new numeral never exists before :00 (it is still in the heap or the
// hatch); an old one is out of sight (down the chute or in the heap) by :00.

import { clockFields } from '../js/kit.js';

export const SX = [34, 54, 111, 131];   // slot centres
export const PAIR_X = [(SX[0] + SX[1]) / 2, (SX[2] + SX[3]) / 2];
export const PAIR_HALF = (SX[1] - SX[0]) / 2;   // a numeral's offset from the hub in a full pair scoop
export const PANDA_X = 82;
export const HOME_X = 11.5, HOME_Y = 21;    // hub over the prize chute
export const CARRY_Y = 10, GRAB_Y = 38, FISH_Y = 55;
export const FISH_X = 148;
export const VISIT_X = PANDA_X - 21;     // beside her head: nose to nose
export const PGRAB_Y = 22, PLIFT_Y = 9;
export const O_HOLD = 0.47, O_REST = 0.3;
export const HATCH_TOP = 5;              // the hatch opens in the rail; numerals emerge below it
export const HATCH_G = 420;              // px/s^2, same gravity as every other fall
export const DY_REST = 50, DH_REST = 25;   // a numeral's resting top and height (for the hatch fall)
const BURY_DONE = 59.65;                 // the last old prize is let go in the heap by this
const PACE_HOUR = 0.72;
const SQUEEZE = 0.38;                    // a pair squeezed together over the chute or into the heap

export const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];
const travel = (dx) => 0.4 + Math.abs(dx) / 100;

function sequencer(start, t0) {
  const segs = [];
  let cur = { ...start }, t = t0;
  return {
    segs, k: 1,
    get t() { return t; },
    get cur() { return cur; },
    go(dur, x, y, o, w) {
      const to = { x: x ?? cur.x, y: y ?? cur.y, o: o ?? cur.o, w: w ?? cur.w };
      const d = dur * this.k;
      segs.push({ t0: t, t1: t + d, a: cur, b: to });
      cur = to; t += d;
    },
    wait(dur) { this.go(dur); },
    at(tt) { t = tt; },
  };
}

// A group of one or two adjacent slots, handled in one scoop.
function group(slotsIdx, digits) {
  const pair = slotsIdx.length === 2;
  return { slots: slotsIdx, digits, pair, x: pair ? (SX[slotsIdx[0]] + SX[slotsIdx[1]]) / 2 : SX[slotsIdx[0]] };
}

function pickUp(seq, gr, job) {
  const w = gr.pair ? 1 : 0;
  seq.go(travel(gr.x - seq.cur.x), gr.x, CARRY_Y, 1, w);
  seq.go(0.55, gr.x, GRAB_Y, 1, w);
  seq.go(0.3, gr.x, GRAB_Y, O_HOLD, w);
  job.grab = seq.t - 0.08 * seq.k;
  seq.go(0.55, gr.x, CARRY_Y, O_HOLD, w);
}
// hours: down the chute
function chute(seq, gr, job) {
  pickUp(seq, gr, job);
  const w = gr.pair ? SQUEEZE : 0;
  seq.go(travel(HOME_X - gr.x), HOME_X, HOME_Y, O_HOLD, w);
  job.drop = seq.t + 0.06 * seq.k;
  job.dropW = w;
  seq.go(0.22, HOME_X, HOME_Y, 1, 0);
}
// minutes: back into the heap, deep enough to be hidden, then let go
function recycle(seq, gr, job) {
  pickUp(seq, gr, job);
  const w = gr.pair ? SQUEEZE : 0;
  seq.go(travel(FISH_X - gr.x), FISH_X, CARRY_Y, O_HOLD, w);
  seq.go(0.65, FISH_X, FISH_Y, O_HOLD, w);
  job.bury = seq.t;                          // hidden in the heap from here
  seq.go(0.2, FISH_X, FISH_Y, 1, 0);
}
// minutes: fish the new digit(s) out of the heap and set them down
function placement(seq, gr, job) {
  const w = gr.pair ? 1 : 0, ws = gr.pair ? SQUEEZE : 0;
  if (seq.cur.x !== FISH_X || seq.cur.y !== FISH_Y) {
    seq.go(travel(FISH_X - seq.cur.x), FISH_X, CARRY_Y, 1, 0);
    seq.go(0.65, FISH_X, FISH_Y, 1, 0);
  }
  seq.go(0.3, FISH_X, FISH_Y, O_HOLD, ws);
  job.fish = seq.t - 0.1 * seq.k;
  seq.go(0.8, FISH_X, CARRY_Y, O_HOLD, ws);
  seq.go(travel(gr.x - FISH_X), gr.x, CARRY_Y, O_HOLD, w);
  seq.go(0.55, gr.x, GRAB_Y, O_HOLD, w);
  job.release = seq.t + 0.06 * seq.k;
  seq.go(0.24, gr.x, GRAB_Y, 1, w);
  seq.go(0.5, gr.x, CARRY_Y, 0.6, 0);
}

const changed = (a, b, idx) => idx.filter((i) => a[i] !== b[i]);

const CACHE = new Map();
export function planFor(mk) {
  if (CACHE.has(mk)) return CACHE.get(mk);
  const prev = digitsOf(clockFields(new Date((mk - 1) * 60000)));
  const curF = clockFields(new Date(mk * 60000));
  const nextF = clockFields(new Date((mk + 1) * 60000));
  const cur = digitsOf(curF), next = digitsOf(nextF);
  const slots = cur.map((d, i) => ({ d, inN: prev[i] !== d, outN: next[i] !== d }));
  const jobs = [];

  // ---- the removals, built first to know when they must start
  const rs = sequencer({ x: HOME_X, y: HOME_Y, o: O_REST, w: 0 }, 0);
  if (nextF.m === 0) rs.k = PACE_HOUR;
  const outs = [];
  const hOut = changed(cur, next, [0, 1]), mOut = changed(cur, next, [2, 3]);
  if (hOut.length) { const j = { type: 'out', ...group(hOut, hOut.map((i) => cur[i])) }; chute(rs, j, j); outs.push(j); }
  if (mOut.length) { const j = { type: 'out', ...group(mOut, mOut.map((i) => cur[i])) }; recycle(rs, j, j); outs.push(j); }
  const rDur = rs.t;

  // ---- this minute's arrivals. The minute starts with the claw buried in
  // the heap, open: the last minute's removals always end there (the last
  // minute digit changes every minute).
  const seq = sequencer({ x: FISH_X, y: FISH_Y, o: 1, w: 0 }, 0);
  if (curF.m === 0) seq.k = PACE_HOUR;
  const mIn = changed(prev, cur, [2, 3]), hIn = changed(prev, cur, [0, 1]);
  if (mIn.length) { const j = { type: 'in', ...group(mIn, mIn.map((i) => cur[i])) }; placement(seq, j, j); jobs.push(j); }
  // the hour digit(s) through the refill hatch, left to right
  const hatch = hIn.map((i, n) => {
    const t0 = 0.12 + n * 0.22, fall = DY_REST - (HATCH_TOP - DH_REST);
    return { slot: i, d: cur[i], t0, land: t0 + Math.sqrt((2 * fall) / HATCH_G) };
  });
  const show = {};
  if (curF.m === 0) {
    // the hour: the star prize, at the show's own (unhurried) pace
    seq.k = 1;
    seq.go(travel(PANDA_X - seq.cur.x), PANDA_X, CARRY_Y, 1, 0);
    seq.go(0.9, PANDA_X, PGRAB_Y, 1);
    seq.go(0.4, PANDA_X, PGRAB_Y, 0.86);
    show.grab = seq.t;
    seq.go(1.3, PANDA_X, PLIFT_Y, 0.86);
    seq.go(0.45, PANDA_X - 3, PLIFT_Y, 0.86);
    seq.go(0.5, PANDA_X + 3, PLIFT_Y, 0.86);
    seq.go(0.45, PANDA_X, PLIFT_Y, 0.86);
    seq.wait(0.5);
    show.slip = seq.t + 0.25;
    seq.go(0.7, PANDA_X, PLIFT_Y, 1);
    seq.wait(0.6);
  }
  seq.k = 1;
  seq.go(travel(HOME_X - seq.cur.x), HOME_X, HOME_Y, O_REST, 0);
  const rStart = Math.max(seq.t + 0.5, BURY_DONE - rDur);
  // the idle visit, when there is room for it
  const visit = {};
  if (rStart - seq.t > 12 && curF.m !== 0) {
    seq.at(Math.max(seq.t + 3, 24));
    seq.go(travel(VISIT_X - HOME_X), VISIT_X, 22, 0.4);
    visit.t0 = seq.t;
    seq.wait(3.4);
    visit.t1 = seq.t;
    seq.go(travel(HOME_X - VISIT_X), HOME_X, HOME_Y, O_REST);
  }
  // and a sniff at the heap: the puppy noses the prizes it will fish out next
  const sniff = {};
  if (rStart - seq.t > 11) {
    seq.at(Math.max(seq.t + 4, 38));
    seq.go(travel(FISH_X - HOME_X), FISH_X - 2, 38, 0.8);
    sniff.t0 = seq.t;
    seq.go(0.5, FISH_X - 2, 41, 0.8);
    seq.wait(1.4);
    seq.go(0.5, FISH_X - 2, 38, 0.8);
    sniff.t1 = seq.t;
    seq.go(travel(HOME_X - FISH_X), HOME_X, HOME_Y, O_REST);
  }
  const shift = Math.max(rStart, seq.t + 0.3);
  for (const g of rs.segs) seq.segs.push({ t0: g.t0 + shift, t1: g.t1 + shift, a: g.a, b: g.b });
  for (const j of outs) {
    j.grab += shift;
    if (j.drop !== undefined) j.drop += shift;
    if (j.bury !== undefined) j.bury += shift;
    jobs.push(j);
  }
  // per slot: when it is filled (inAt) and emptied (outAt) this minute
  for (const j of jobs) for (const i of j.slots) { if (j.type === 'in') slots[i].inAt = j.release; else slots[i].outAt = j.grab; }
  for (const h of hatch) slots[h.slot].inAt = h.land;
  const plan = { slots, jobs, hatch, segs: seq.segs, show, visit, sniff, hour: curF.m === 0, rStart: shift, late: shift + rDur > 59.9 };
  CACHE.set(mk, plan);
  if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  return plan;
}

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

/** The claw's carriage x, hub y, opening o and spread w at second s of minute mk (s may run outside 0..60). */
export function clawAt(mk, s) {
  while (s < 0) { mk--; s += 60; }
  while (s >= 60) { mk++; s -= 60; }
  const { segs } = planFor(mk);
  let st = { x: FISH_X, y: FISH_Y, o: 1, w: 0 };
  for (const g of segs) {
    if (s < g.t0) break;
    if (s >= g.t1) { st = g.b; continue; }
    const u = ease((s - g.t0) / (g.t1 - g.t0));
    return { x: g.a.x + (g.b.x - g.a.x) * u, y: g.a.y + (g.b.y - g.a.y) * u, o: g.a.o + (g.b.o - g.a.o) * u, w: g.a.w + (g.b.w - g.a.w) * u };
  }
  return st;
}
