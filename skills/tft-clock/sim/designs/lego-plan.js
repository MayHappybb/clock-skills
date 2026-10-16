// lego: what is on the baseplate at a given minute, and the builder's plan
// for turning one minute's build into the next.
//
// The board is a grid of studs. Each digit is built from real brick sizes
// (1x1, 1x2, 1x3, 1x4), and a brick's colour follows its size, the way a
// sorted tub works: so a brick that the hand moves keeps its colour.
//
// The time is never wrong. Each digit slot is planned on its own as a
// shortest path through brick states (add or remove one brick at a time)
// where every state must read as the correct digit for its moment or as no
// digit at all ("broken"): before :00 the old digit or broken, after :00 the
// new digit or broken, and at :00 itself broken. So the hand starts a few
// seconds early, breaks every digit that is about to change, waits for the
// minute, then builds. A broken state must also be clearly broken: at least
// three studs away from every digit but the correct one (readSlot below
// says what "reads as" means). The per-slot sequences are then merged into
// one job list for the hand: a brick removed is carried straight to a spot
// that needs that size, set aside at the edge of the plate if one is needed
// later, or flicked into the tub; a brick nobody has spare is fetched.

import { clockFields } from '../js/kit.js';

export const P = 6;          // stud pitch, px
export const OX = 5, OY = 1; // pixel position of stud cell (0, 0)
const ROW0 = 2;              // top row of the digits
export const DIGIT_COL = [2, 7, 14, 19];
export const SLOT_ROW = ROW0;
export const COLON = [[12, ROW0 + 2], [12, ROW0 + 4]];

// Glyph bricks [col, row, w, h] in a 4 x 7 stud box.
const T = [0, 0, 4, 1], M = [0, 3, 4, 1], Bt = [0, 6, 4, 1];
const UL = [0, 1, 1, 2], UR = [3, 1, 1, 2], LL = [0, 4, 1, 2], LR = [3, 4, 1, 2];
const GLYPHS = {
  [-1]: [],
  0: [T, UL, UR, [0, 3, 1, 1], [3, 3, 1, 1], LL, LR, Bt],
  1: [[3, 0, 1, 1], UR, [3, 3, 1, 1], LR, [3, 6, 1, 1], [2, 1, 1, 1]],
  2: [T, UR, M, LL, Bt],
  3: [T, UR, [1, 3, 3, 1], LR, Bt],
  4: [[0, 0, 1, 3], [3, 0, 1, 3], M, [3, 4, 1, 3]],
  5: [T, UL, M, LR, Bt],
  6: [T, UL, M, LL, LR, Bt],
  7: [T, UR, [2, 3, 1, 4]],
  8: [T, UL, UR, M, LL, LR, Bt],
  9: [T, UL, UR, M, LR, Bt],
};

// Colour by length, LEGO's own colours.
export const BRICK_COLOURS = {
  1: 0xfe8a18, // orange
  2: 0xf2cd37, // bright yellow
  3: 0xf4f4f4, // white
  4: 0xc91a09, // bright red
};
export const colourOf = (w, h) => BRICK_COLOURS[Math.max(w, h)] ?? 0xf4f4f4;

/** The four slot digits for a time; -1 is the empty tens-of-hours slot. */
export const digitsOf = (h, m) => [h >= 10 ? Math.floor(h / 10) : -1, h % 10, Math.floor(m / 10), m % 10];

const brickAt = (i, [c, r, w, h]) => {
  const b = { c: DIGIT_COL[i] + c, r: ROW0 + r, w, h };
  b.id = `${b.c},${b.r},${b.w},${b.h}`;
  return b;
};

/** The bricks on the board for a time: [{ id, c, r, w, h }]. */
export function boardFor(h, m) {
  const out = [];
  digitsOf(h, m).forEach((d, i) => { for (const g of GLYPHS[d]) out.push(brickAt(i, g)); });
  return out;
}

/** Pixel centre of a brick lying on the grid. */
export const centreOf = (b) => [OX + (b.c + b.w / 2) * P, OY + (b.r + b.h / 2) * P];

// ------------------------------------------------------------ reading a slot

const cellMask = ([c, r, w, h]) => {
  let m = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m |= 1 << ((r + j) * 4 + c + i);
  return m;
};
const GMASK = {};
for (const d of Object.keys(GLYPHS)) GMASK[d] = GLYPHS[d].reduce((m, b) => m | cellMask(b), 0);
const COL3 = cellMask([3, 0, 1, 7]);
const pop = (x) => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const distTo = (mask, d) => pop(mask ^ GMASK[d]);

/**
 * What a slot's studs read as: every digit within one stud of the mask; 1
 * also for any part of a 1 that has three or more studs of its stem; and,
 * in the tens-of-hours slot, "blank" (-1) for one stud or none.
 */
export function readSlot(mask, tens) {
  const out = [];
  for (let d = 0; d < 10; d++) if (distTo(mask, d) <= 1) out.push(d);
  if (!out.includes(1) && (mask & ~GMASK[1]) === 0 && pop(mask & COL3) >= 3) out.push(1);
  if (tens && pop(mask) <= 1) out.push(-1);
  return out;
}

/** May a slot show `mask` while `correct` is the right digit? */
function okFor(mask, tens, correct) {
  const r = readSlot(mask, tens);
  if (r.length) return r.length === 1 && r[0] === correct;
  // Broken: and clearly so, three studs from anything else.
  for (const d of Object.keys(GMASK)) {
    const dd = +d;
    if (dd === correct || (dd === -1 && !tens)) continue;
    if (distTo(mask, dd) < 3) return false;
  }
  return true;
}

/** The slot masks of a board (bricks outside the slots ignored). */
export function slotMasks(bricks) {
  const m = [0, 0, 0, 0];
  for (const b of bricks) {
    const i = DIGIT_COL.findIndex((c0) => b.c >= c0 && b.c + b.w <= c0 + 4);
    if (i < 0 || b.r < ROW0 || b.r + b.h > ROW0 + 7) continue;
    m[i] |= cellMask([b.c - DIGIT_COL[i], b.r - ROW0, b.w, b.h]);
  }
  return m;
}

// ------------------------------------------------------------ one slot's path

const pathCache = new Map();

/**
 * The cheapest way from digit `old` to digit `nw` one brick at a time,
 * through states that are always right or broken. Steps before :00 cost a
 * little more, so the hand does as little as it can early.
 * Returns { pre: [{op, b}], post: [{op, b}] } in local glyph coordinates.
 */
function slotPath(old, nw, tens) {
  const key = `${old},${nw},${tens}`;
  let res = pathCache.get(key);
  if (res) return res;
  if (old === nw) { res = { pre: [], post: [] }; pathCache.set(key, res); return res; }
  const uni = [], seen = new Set();
  for (const b of [...GLYPHS[old], ...GLYPHS[nw]]) { const k = b.join(); if (!seen.has(k)) { seen.add(k); uni.push(b); } }
  const n = uni.length, N = 1 << n, bm = uni.map(cellMask);
  const bitsOf = (d) => GLYPHS[d].reduce((s, b) => s | (1 << uni.findIndex((u) => u.join() === b.join())), 0);
  const start = bitsOf(old), goal = bitsOf(nw);
  const cells = (s) => { let m = 0; for (let j = 0; j < n; j++) if ((s >> j) & 1) m |= bm[j]; return m; };
  const vc = new Int8Array(2 * N);
  const valid = (s, ph) => {
    const k = ph * N + s;
    if (!vc[k]) vc[k] = okFor(cells(s), tens, ph ? nw : old) ? 1 : 2;
    return vc[k] === 1;
  };
  const dist = new Int32Array(2 * N).fill(1 << 30), prev = new Int32Array(2 * N).fill(-1);
  const buckets = [[start]];
  dist[start] = 0;
  let found = false;
  for (let c = 0; c < buckets.length && !found; c++) {
    const B = buckets[c];
    if (!B) continue;
    for (let bi = 0; bi < B.length; bi++) {
      const k = B[bi];
      if (dist[k] !== c) continue;
      const ph = k >= N ? 1 : 0, s = k - ph * N;
      if (ph === 1 && s === goal) { found = true; break; }
      const relax = (k2, w) => {
        const nd = c + w;
        if (nd < dist[k2]) { dist[k2] = nd; prev[k2] = k; (buckets[nd] ||= []).push(k2); }
      };
      if (ph === 0 && valid(s, 1)) relax(N + s, 0);
      const cs = cells(s);
      for (let j = 0; j < n; j++) {
        const bit = 1 << j;
        let s2;
        if (s & bit) s2 = s & ~bit;
        else if (cs & bm[j]) continue;
        else s2 = s | bit;
        if (valid(s2, ph)) relax(ph * N + s2, ph ? 5 : 6);
      }
    }
  }
  if (!found) throw new Error(`lego: no safe path ${old} -> ${nw}`);
  const chain = [];
  for (let k = N + goal; k >= 0; k = prev[k]) chain.push(k);
  chain.reverse();
  res = { pre: [], post: [] };
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    const pa = a >= N ? 1 : 0, pb = b >= N ? 1 : 0;
    if (pa !== pb) continue; // the crossing of :00
    const sa = a - pa * N, sb = b - pb * N, j = 31 - Math.clz32(sa ^ sb);
    (pb ? res.post : res.pre).push({ op: sb & (1 << j) ? 'add' : 'rem', g: uni[j] });
  }
  pathCache.set(key, res);
  return res;
}

// ------------------------------------------------------------ the hand's jobs

const HOVER = 22;            // hand height when travelling, px above the plate
const TOUCH = 3;             // fingertips on a brick top
export const SUPPLY = [150, 104]; // the tub, below and right of the glass
export const REST = { x: 132, y: 72, z: 4, open: 1 };

const travelTime = (d) => 0.16 + d / 240;
const dd = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const shapeOf = (b) => `${Math.min(b.w, b.h)}x${Math.max(b.w, b.h)}`;
const tubFor = (b) => [SUPPLY[0] * 0.6 + centreOf(b)[0] * 0.4, SUPPLY[1]];

/** Merge the slots' sequences into one list of hand actions. */
function makeActions(slots) {
  const acts = [], parked = [];
  let held = null, at = [REST.x, REST.y];
  const phases = [slots.map((s) => [...s.pre]), slots.map((s) => [...s.post])];
  const laterAdds = (shape, ph) => {
    let k = 0;
    for (let p = ph; p < 2; p++) for (const q of phases[p]) for (const e of q) if (e.op === 'add' && shapeOf(e.b) === shape) k++;
    return k;
  };
  const nearestParked = (shape, from) => {
    let best = -1, bd = Infinity;
    parked.forEach((p, i) => { if (shapeOf(p) === shape && dd(from, centreOf(p)) < bd) { bd = dd(from, centreOf(p)); best = i; } });
    return best;
  };
  const parkSpot = (L) => {
    let best = null, bs = Infinity;
    for (const r of [10, 11, 0])
      for (let c = 0; c + L <= 25; c++) {
        if (parked.some((p) => p.r === r && c < p.c + p.w && p.c < c + L)) continue;
        const b = { c, r, w: L, h: 1 };
        const sc = dd(at, centreOf(b)) + (r === 0 ? 30 : 0);
        if (sc < bs) { bs = sc; best = b; }
      }
    best.id = `park:${best.c},${best.r},${best.w}`;
    return best;
  };

  for (let ph = 0; ph < 2; ph++) {
    const qs = phases[ph];
    if (ph === 1) acts.push({ kind: 'cross' });
    for (let guard = 0; guard < 400; guard++) {
      const heads = qs.filter((q) => q.length);
      if (!heads.length) break;
      if (held) {
        let best = null, bd = Infinity;
        for (const q of heads) {
          const e = q[0];
          if (e.op === 'add' && shapeOf(e.b) === held && dd(at, centreOf(e.b)) < bd) { bd = dd(at, centreOf(e.b)); best = q; }
        }
        if (best) {
          const e = best.shift();
          acts.push({ kind: 'put', b: e.b }); at = centreOf(e.b); held = null;
          continue;
        }
        if (laterAdds(held, ph) > parked.filter((p) => shapeOf(p) === held).length) {
          const L = +held.split('x')[1], p = parkSpot(L);
          acts.push({ kind: 'put', b: p }); parked.push(p); at = centreOf(p);
        } else acts.push({ kind: 'toss' });
        held = null;
        continue;
      }
      let best = null, bs = Infinity;
      for (const q of heads) {
        const e = q[0], c = centreOf(e.b);
        let sc;
        if (e.op === 'rem') sc = dd(at, c) + (heads.some((r) => r[0].op === 'add' && shapeOf(r[0].b) === shapeOf(e.b)) ? 0 : 25);
        else { const pk = nearestParked(shapeOf(e.b), at); sc = pk >= 0 ? dd(at, centreOf(parked[pk])) + 30 : 70 + dd(at, c) * 0.3; }
        if (sc < bs) { bs = sc; best = q; }
      }
      const e = best[0];
      if (e.op === 'rem') {
        best.shift();
        acts.push({ kind: 'pick', b: e.b }); at = centreOf(e.b);
      } else {
        const pk = nearestParked(shapeOf(e.b), at);
        if (pk >= 0) { const p = parked.splice(pk, 1)[0]; acts.push({ kind: 'pick', b: p }); at = centreOf(p); }
        else { acts.push({ kind: 'fetch', b: e.b }); at = tubFor(e.b); }
      }
      held = shapeOf(e.b);
    }
  }
  if (held) acts.push({ kind: 'toss' });
  for (const p of parked) { acts.push({ kind: 'pick', b: p }); acts.push({ kind: 'toss' }); }
  return acts;
}

const angleOf = (b) => (b.w >= b.h ? 0 : Math.PI / 2);
/** A brick's shape lying along x, for drawing it in the air at an angle. */
const canon = (b) => ({ w: Math.max(b.w, b.h), h: Math.min(b.w, b.h) });

/**
 * Lay the actions out in time as hand keyframes, then shift the whole plan
 * so the breaking is done by -0.15 s and the building starts after :00.
 * Times are seconds from this minute's :00.
 */
function schedule(acts) {
  const kf = [], events = [], held = [], tossed = [];
  let t = 0, carrying = null, crossAt = 0;
  const first = acts[0];
  const [sx, sy] = first.kind === 'fetch' ? tubFor(first.b) : centreOf(first.b);
  let pose = { x: sx, y: sy, z: HOVER, open: 1 };
  kf.push({ t: 0, ...pose, ease: 'io' });
  const key = (dt, p, ease = 'io') => { t += dt; pose = { ...pose, ...p }; kf.push({ t, ...pose, ease }); };
  const goTo = (x, y, z, open) => {
    const d = Math.hypot(x - pose.x, y - pose.y);
    if (d < 0.5 && Math.abs(z - pose.z) < 0.5) return;
    key(travelTime(d), { x, y, z, open });
  };

  for (const a of acts) {
    if (a.kind === 'pick') {
      const [x, y] = centreOf(a.b);
      goTo(x, y, HOVER, 1);
      key(0.12, { z: TOUCH, open: 0.15 }, 'in');
      key(0.08, { z: TOUCH, open: 0 });
      events.push({ t, op: 'rem', b: a.b });
      carrying = { brick: canon(a.b), t0: t, a0: angleOf(a.b) };
      key(0.12, { z: 10 }, 'out');
    } else if (a.kind === 'put') {
      const [x, y] = centreOf(a.b);
      goTo(x, y, HOVER, 0);
      key(0.13, { z: TOUCH + 1 }, 'in');
      key(0.06, { z: 1 }, 'in');
      events.push({ t, op: 'add', b: a.b });
      held.push({ ...carrying, t1: t, a1: angleOf(a.b) });
      carrying = null;
      key(0.08, { z: TOUCH, open: 0.6 }, 'out');
      key(0.12, { z: 14, open: 1 }, 'out');
    } else if (a.kind === 'toss') {
      // A flick toward the tub: the brick flies on by itself.
      const x = pose.x, y = pose.y;
      const dx = SUPPLY[0] - x, dy = SUPPLY[1] - y, d = Math.hypot(dx, dy) || 1;
      const fx = x + (dx / d) * 9, fy = y + (dy / d) * 9;
      key(0.1, { x: fx, y: fy, z: 16, open: 0.8 }, 'out');
      held.push({ ...carrying, t1: t, a1: carrying.a0 });
      tossed.push({ brick: carrying.brick, t0: t, x: fx, y: fy, vx: (dx / d) * 260, vy: (dy / d) * 260, spin: (Math.round(x) % 2 ? 1 : -1) * 11, a0: carrying.a0 });
      carrying = null;
      key(0.06, { open: 1 });
    } else if (a.kind === 'fetch') {
      const [x, y] = tubFor(a.b);
      goTo(x, y, HOVER + 6, 1);
      key(0.1, { open: 0 });
      carrying = { brick: canon(a.b), t0: t, a0: angleOf(a.b) };
    } else if (a.kind === 'cross') {
      crossAt = t;
      key(0.2, {}, 'lin'); // waiting for the minute
    }
  }
  const sh = -(crossAt + 0.15);
  for (const k of kf) k.t += sh;
  for (const e of events) e.t += sh;
  for (const h of held) { h.t0 += sh; h.t1 += sh; }
  for (const x of tossed) x.t0 += sh;
  return { kf, events, held, tossed, end: t + sh };
}

// ------------------------------------------------------------ cached per minute

const cache = new Map();

/** Everything about the turn at the start of minute `minuteKey`: boards, actions, schedule (times from its :00). */
export function minutePlan(minuteKey) {
  let p = cache.get(minuteKey);
  if (p) return p;
  const cur = clockFields(new Date(minuteKey * 60000));
  const prev = clockFields(new Date((minuteKey - 1) * 60000));
  const dOld = digitsOf(prev.h, prev.m), dNew = digitsOf(cur.h, cur.m);
  const slots = dOld.map((o, i) => {
    const sp = slotPath(o, dNew[i], i === 0);
    const glob = (e) => ({ op: e.op, b: brickAt(i, e.g) });
    return { pre: sp.pre.map(glob), post: sp.post.map(glob) };
  });
  const acts = makeActions(slots);
  p = { prevBoard: boardFor(prev.h, prev.m), curBoard: boardFor(cur.h, cur.m), dOld, dNew, acts, ...schedule(acts) };
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  cache.set(minuteKey, p);
  return p;
}

/** The bricks lying on the plate at second `s` of minute `minuteKey`. */
export function boardAt(minuteKey, s) {
  const plan = minutePlan(minuteKey), next = minutePlan(minuteKey + 1);
  const on = new Map(plan.prevBoard.map((b) => [b.id, b]));
  for (const [p, off] of [[plan, 0], [next, 60]])
    for (const e of p.events) {
      if (e.t + off > s) break;
      if (e.op === 'add') on.set(e.b.id, e.b); else on.delete(e.b.id);
    }
  return [...on.values()];
}

export { HOVER, TOUCH };
