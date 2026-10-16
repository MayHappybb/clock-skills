// plankton: what the sea and the unseen writer do in a given minute.
//
// Everything is a schedule worked out from the minute's own number, so any
// moment can be drawn cold: the waves of the minute (when each breaks, which
// way it peels, how far up the sand it runs), and the writer's minute: walk
// in along the tideline, scuff out each digit that is about to change, and
// after :00 write the new ones with a stick, then walk off. At the hour no
// one scuffs: a big wave takes the whole beach, then the writer comes back
// and writes all four digits and the colon again.
//
// Times are seconds from the start of that minute.

import { rng, clockFields, TAU } from '../js/kit.js';
import { DW } from './plankton-glyphs.js';

export const DX = [21, 47, 86, 112];   // digit boxes, left edges
export const DY = 27;
export const COLON_X = 82;
export const FOOT_Y = 71;              // the writer's line, along the tideline
const STEP = 7.5, PACE = 0.42;         // a walking step: length (px) and time (s)
export const WRITE = 1.05;             // seconds for a stick to write one digit
export const COLON = 0.55;

export const standX = (p) => (p === 'c' ? COLON_X + 1 : DX[p] + DW / 2 + 2);
const digitsOf = (f) => f.hh + f.mm;

/** The waves breaking in the minute starting at key mk (m: its minute of the hour). */
export function wavesOf(mk, m) {
  const r = rng(mk * 13 + 7);
  const out = [];
  let t = 0.4 + r() * 3;
  while (t < 58) {
    if (m === 59 && t > 45.5) break;
    const big = r() < 0.18;
    out.push({
      t0: t, dir: r() < 0.5 ? 1 : -1, peel: 0.004 + 0.005 * r(),
      R: big ? 58 + 8 * r() : 31 + 23 * r() ** 1.3,
      T: 1.4 + 0.5 * r(), Tb: 2.2 + 0.7 * r(),
      amp: 1.5 + 3 * r(), k: TAU / (22 + 18 * r()), ph: r() * TAU, big: false,
    });
    t += 4.6 + r() * 3.2;
  }
  if (m === 59) out.push({ t0: 52.6, dir: r() < 0.5 ? 1 : -1, peel: 0.0032, R: 90, T: 4.4, Tb: 3.2, amp: 3, k: TAU / 30, ph: r() * TAU, big: true });
  return out;
}

const CACHE = new Map();

/**
 * The writer's plan for the minute starting at key mk: { writes, scuffs,
 * steps, wave }. writes: [{ p, d, seed, t0, dur }] (p 0..3 or 'c');
 * scuffs: [{ p, t0, t1 }]; steps: [{ x, y, o, t }] footprints, o = 'L' | 'R'
 * walking, 'U' standing facing the sea.
 */
export function planOf(mk) {
  let pl = CACHE.get(mk);
  if (pl) return pl;
  if (CACHE.size > 16) CACHE.clear();
  const f = clockFields(new Date(mk * 60000)), fp = clockFields(new Date(mk * 60000 - 60000)), fn = clockFields(new Date(mk * 60000 + 60000));
  const cur = digitsOf(f), prev = digitsOf(fp), next = digitsOf(fn);
  const writes = [], scuffs = [], steps = [];
  const stand = (x, t) => { steps.push({ x: x - 3, y: FOOT_Y - 1, o: 'U', t, side: 0 }); steps.push({ x: x + 3, y: FOOT_Y, o: 'U', t: t + 0.16, side: 1 }); };
  const walk = (x0, x1, tEnd, tStart) => {
    // tEnd given: arrive then; else leave at tStart
    const dir = x1 > x0 ? 1 : -1, n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / STEP));
    for (let i = 0; i < n; i++) {
      const x = x0 + dir * STEP * (i + 1) * (Math.abs(x1 - x0) / (n * STEP));
      const t = tEnd !== undefined ? tEnd - (n - 1 - i) * PACE : tStart + i * PACE;
      steps.push({ x, y: FOOT_Y + (i % 2 ? 2.2 : -2.2), o: dir > 0 ? 'R' : 'L', t, side: i % 2 });
    }
  };

  // -- after :00, write what changed (all of it at the hour)
  const hour = f.m === 0;
  const todo = [];
  for (let p = 0; p < 4; p++) if (hour || cur[p] !== prev[p]) todo.push(p);
  if (hour) todo.splice(2, 0, 'c');
  let t = 0.2, last = null;
  for (const p of todo) {
    if (last !== null) { stand(standX(p), t); t += 0.36; }
    const dur = p === 'c' ? COLON : WRITE;
    writes.push({ p, d: p === 'c' ? ':' : cur[p], seed: mk * 5 + (p === 'c' ? 4 : p), t0: t, dur });
    t += dur + 0.12;
    last = p;
  }
  if (last !== null) walk(standX(last), 176, undefined, t + 0.35);

  // -- before the next :00, scuff out what will change (unless the hour wave does)
  const hourNext = fn.m === 0;
  const change = [];
  for (let p = 0; p < 4; p++) if (next[p] !== cur[p]) change.push(p);
  if (hourNext) {
    walk(-14, standX(0), 59.85);
    stand(standX(0), 59.9);
  } else if (change.length) {
    const span = change.length === 1 ? [[57.6, 59.2]] : [[56.5, 57.7], [58.1, 59.3]];
    walk(178, standX(change[0]), span[0][0] - 0.55);
    stand(standX(change[0]), span[0][0] - 0.4);
    change.forEach((p, i) => {
      if (i > 0) stand(standX(p), span[i][0] - 0.3);
      scuffs.push({ p, t0: span[i][0], t1: span[i][1] });
    });
  }
  pl = { writes, scuffs, steps, wave: hourNext };
  CACHE.set(mk, pl);
  return pl;
}

/** The minute at which position p's current digit was written (the hour wave clears everything). */
export function writtenAt(mk, m, p) {
  if (p === 0 || p === 1 || p === 'c') return mk - m;
  if (p === 2) return mk - (m % 10);
  return mk;
}
