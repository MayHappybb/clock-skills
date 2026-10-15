// The wild snakes: classic Nokia snakes (3 px blocks on the 4 px grid), two
// to each open band of the board, playing a real game of Snake in the free
// ground between the numerals. Each minute they come out of their burrows,
// chase pellets on their own side (nearest their own burrow) with a
// breadth-first search (keeping to the side
// with the most room when the way is shut), grow two blocks a pellet, head
// home near the end of the minute and go back down before the turn.
//
// Deterministic: the game is played once per minute key, on a 40 x 20 grid,
// from the start of the minute (~700 grid steps of BFS for four snakes:
// ~0.65 M integer ops a minute, done a step at a time on the device).

import { hash } from '../js/kit.js';

export const NX = 40, NY = 20, CS = 4;
export const RATE = 12;           // grid steps a second (48 px/s, 0.8 px a frame)
const BASE = 4, GROW = 2, MAXLEN = 13;

let FREE = null, FREELIST = null;

/** Mark the free cells: off every box (x0, y0, x1, y1 in pixels, inclusive). */
export function setBoard(boxes) {
  FREE = new Uint8Array(NX * NY);
  FREELIST = [];
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x0 = i * CS - 1, y0 = j * CS - 1, x1 = i * CS + 3, y1 = j * CS + 3;
      let ok = true;
      for (const [a, b, c, d] of boxes) if (x1 >= a && x0 <= c && y1 >= b && y0 <= d) { ok = false; break; }
      if (x0 < -1 || y0 < -1 || x1 > 160 || y1 > 80) ok = false;
      FREE[j * NX + i] = ok ? 1 : 0;
      if (ok) FREELIST.push(j * NX + i);
    }
  return FREE;
}

const Q = new Int16Array(NX * NY), PREV = new Int16Array(NX * NY), SEEN = new Int32Array(NX * NY);
let stamp = 0;
const step = (c, k) => {
  const i = c % NX, j = (c / NX) | 0;
  if (k === 0) return i + 1 < NX ? c + 1 : -1;
  if (k === 1) return i > 0 ? c - 1 : -1;
  if (k === 2) return j + 1 < NY ? c + NX : -1;
  return j > 0 ? c - NX : -1;
};

/** First step from `from` toward `to` avoiding `block` (a Uint8Array), or -1. Counts ops. */
function bfs(from, to, block, ops) {
  stamp++;
  let h = 0, t = 0;
  Q[t++] = from; SEEN[from] = stamp; PREV[from] = -1;
  while (h < t) {
    const c = Q[h++];
    ops.n += 4;
    if (c === to) {
      let p = c;
      while (PREV[p] !== from && PREV[p] !== -1) p = PREV[p];
      return p === from ? -1 : p;
    }
    for (let k = 0; k < 4; k++) {
      const n = step(c, k);
      if (n < 0 || SEEN[n] === stamp || !FREE[n] || (block[n] && n !== to)) continue;
      SEEN[n] = stamp; PREV[n] = c; Q[t++] = n;
    }
  }
  return -1;
}

/** Number of cells reachable from c (a flood fill), for picking a safe move. */
function room(c, block, ops) {
  stamp++;
  let h = 0, t = 0;
  Q[t++] = c; SEEN[c] = stamp;
  while (h < t) {
    const a = Q[h++];
    ops.n += 4;
    for (let k = 0; k < 4; k++) {
      const n = step(a, k);
      if (n < 0 || SEEN[n] === stamp || !FREE[n] || block[n]) continue;
      SEEN[n] = stamp; Q[t++] = n;
    }
  }
  return t;
}

const CACHE = new Map();

/**
 * The game for one minute, one snake per burrow. Ticks count from
 * `start` (seconds into the minute); from `home` they make for their burrows,
 * and whoever is not home by :58.2 dives where it is. Returns one record per
 * snake: { trail (cell per tick), n, eats (ticks), pellets [{cell, from, to}],
 * dive (cell it went down), arrive (tick) }, and the work done (ops).
 */
export function gameFor(mk, burrows, start, home) {
  const key = mk * 4 + (start > 3 ? 1 : 0);
  let gm = CACHE.get(key);
  if (gm) return gm;
  const ops = { n: 0 };
  const M = burrows.length;
  const maxT = Math.ceil((59.6 - start) * RATE);
  const lastT = Math.floor((58.2 - start) * RATE);
  const homeT = Math.floor((home - start) * RATE);
  const block = new Uint8Array(NX * NY);
  const S = burrows.map((b) => ({ trail: new Int16Array(maxT + 2), len: BASE, grown: BASE, arrive: -1, dive: b, pellet: -1, pFrom: 0, eats: [], pellets: [], home: b }));
  S.forEach((a, k) => { a.trail[0] = burrows[k]; });
  let nPel = 0;
  const dist = (a, b) => Math.abs((a % NX) - (b % NX)) + Math.abs(((a / NX) | 0) - ((b / NX) | 0));
  const place = (a, head) => {
    for (let tr = 0; tr < 32; tr++) {
      const c = FREELIST[hash(mk, nPel, tr) % FREELIST.length];
      // each snake hunts on its own side of the board
      let mine = true;
      for (const o of S) if (o !== a && dist(c, o.home) < dist(c, a.home)) mine = false;
      if (!block[c] && !burrows.includes(c) && mine && dist(c, head) >= 6 && !S.some((o) => o.pellet === c)) { nPel++; return c; }
    }
    nPel++;
    return -1;
  };
  let t = 0;
  for (; t < maxT; t++) {
    for (let q = 0; q < M; q++) {
      const a = S[q], head = a.trail[t];
      // the bodies that will still be there after this step (a tail moves on unless growing)
      block.fill(0);
      for (let r = 0; r < M; r++) {
        const o = S[r], tt = r < q ? t + 1 : t;
        if (o.arrive >= 0 && tt > o.arrive) { const gone = tt - o.arrive; for (let b = gone; b < o.len; b++) if (tt - b >= 0 && tt - b <= o.arrive) block[o.trail[tt - b]] = 1; continue; }
        const keep = o.grown > o.len ? o.len : o.len - 1;
        for (let b = 0; b < keep && tt - b >= 0; b++) block[o.trail[tt - b]] = 1;
      }
      if (a.arrive >= 0) { a.trail[t + 1] = head; continue; }
      if (t >= lastT) { a.arrive = t; a.dive = head; a.trail[t + 1] = head; continue; }
      if (a.pellet < 0 && t < homeT - 8) { a.pellet = place(a, head); a.pFrom = t; }
      const target = t >= homeT ? a.home : a.pellet;
      let nx = target >= 0 ? bfs(head, target, block, ops) : -1;
      // don't walk into a pocket smaller than the body
      if (nx >= 0 && nx !== target && room(nx, block, ops) < a.len + 3) nx = -1;
      if (nx < 0) {
        // no way: keep to the side with the most room
        let best = -1, bestR = -1;
        for (let k = 0; k < 4; k++) {
          const n = step(head, k);
          if (n < 0 || !FREE[n] || block[n]) continue;
          const r = room(n, block, ops);
          if (r > bestR) { bestR = r; best = n; }
        }
        nx = best >= 0 ? best : head;
      }
      a.trail[t + 1] = nx;
      if (nx === a.pellet && a.pellet >= 0) {
        a.eats.push(t + 1); a.pellets.push({ cell: a.pellet, from: a.pFrom, to: t + 1 });
        a.grown = Math.min(MAXLEN, a.grown + GROW); a.pellet = -1;
      }
      if (a.len < a.grown) a.len++;
      if (t >= homeT && nx === a.home) { a.arrive = t + 1; a.dive = nx; }
    }
  }
  for (const a of S) {
    if (a.pellet >= 0) a.pellets.push({ cell: a.pellet, from: a.pFrom, to: homeT });
    a.trail[t + 1] = a.trail[t];
    a.n = t + 1;
    if (a.arrive < 0) { a.arrive = t; a.dive = a.trail[t]; }
  }
  gm = { snakes: S, ops: ops.n, start };
  CACHE.set(key, gm);
  if (CACHE.size > 6) CACHE.delete(CACHE.keys().next().value);
  return gm;
}

/** Length in grid steps at tick u: BASE, plus GROW for each pellet, grown in a step at a time. */
export function lengthAt(a, u) {
  let l = BASE;
  for (const e of a.eats) { const g = u - e; if (g > 0) l += g < GROW ? g : GROW; }
  return l < MAXLEN ? l : MAXLEN;
}
