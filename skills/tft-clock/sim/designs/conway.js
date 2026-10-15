// Still Life: Conway's Game of Life on an amber 1-bit screen, and the time is
// made of Life itself. The glass is a universe of 80 x 40 cells (2 x 2 px),
// run by the real rule, B3/S23. The four numerals are still lifes built of
// blocks (conway-glyphs.js): bold bars two blocks deep, stems one block wide,
// every joint corner to corner because the rule allows no other.
// Between the hours (low left) and the minutes (high right) runs the one
// machine of the place: a Gosper glider gun, phase-locked so it fires one
// glider every second, the stream crossing the glass on the diagonal like a
// colon and swallowed by an eater 1 at the far end; a pentadecathlon ticks
// under the minutes. Nothing touches anything: the digits sit four cells off
// the stream, so the whole rest state is one legal Life configuration.
//
// The minute turn is glider surgery, at 120 generations a second (a glider
// then glides one pixel a frame). From the free edges a fleet flies in: one
// glider for each block of the old digit, on the lane where glider + block
// annihilate in four generations, in two salvos over 0.3 s (every other block
// first, so the digit thins evenly and never turns into another one); then,
// right after :00, two gliders for each block of the new digit, on the lanes
// where their collision leaves exactly one block (found by search), in two
// salvos over 0.3 s. All changing digits work at once, so the time is
// unreadable for about 0.6 s. Fliers pass behind the numerals: inside a
// digit's box only the reaction at its target block shows.
// The hour (conway-hour.js): once the new time is built the stream bursts,
// a front runs out from its lane turning the glass negative (ink and ground
// swap) and sowing random soup over the whole universe; it boils for real,
// eating the gun and the eater, round the numerals in their dead moats, then
// the front closes back into the lane and the machine is there again.
//
// Pair: amber #ffb000 on black, the plasma-terminal / amber-OLED look of the
// machines Life was first watched on (and the colour of a Life cell in most
// old screenshots). Night only dims the backlight: amber at 40% still reads.
//
// Cost: the garden is a 30-phase table (12 KB of flash bit-packed); a frame
// copies it, stamps ~100 blocks and plays the reactions (a few hundred cells),
// then writes 12,800 px. The hour's soup steps one 96 x 56 generation every
// other frame.
import { to565, hash, clockFields } from '../js/kit.js';
import { CW, CH, GARDEN, GARDEN_ENV, SYM, DELETE, SYNTH } from './conway-life.js';
import { BLOCKS, PITCH, BOX_W, BOX_H } from './conway-glyphs.js';
import { SLOTS, FIRE_T0, REVEAL, fireGen, fireAt, reachAt, DIST_VIS, fireOps } from './conway-hour.js';
import { GARDEN_M, GARDEN_W } from './conway-life.js';

const INK = to565(0xffb000), GROUND = 0;
const RATE = 120;                                   // generations a second in the turn: a glider glides 1 px a frame
const cells = new Uint8Array(CW * CH);
const halo = new Uint8Array(CW * CH);               // how many present blocks' halos cover a cell

// ------------------------------------------------------------ path costs (static)

// what a turn glider would fly behind on its way in: other digits, the garden
const COST = SLOTS.map((_, k) => {
  const c = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && v < 40; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < CW && Y < CH && GARDEN_ENV[Y * CW + X]) v = 40;
    }
    SLOTS.forEach(([sx, sy], j) => {
      if (x >= sx - 1 && x <= sx + BOX_W && y >= sy - 1 && y <= sy + BOX_H) v = Math.max(v, j === k ? 6 : 3);
    });
    c[y * CW + x] = v;
  }
  return c;
});

// the digit plane: turn gliders fly behind every numeral's box and show inside one only close to their target
const BOXES = new Uint8Array(CW * CH);
for (const [sx, sy] of SLOTS) for (let y = sy - 1; y <= sy + BOX_H; y++) for (let x = sx - 1; x <= sx + BOX_W; x++) BOXES[y * CW + x] = 1;
const NEAR = 3;                                     // cells round the target block where its reaction shows
// when the reacting gliders first touch (from then on the recorded frames show the reaction)
const contactOf = (m, free) => { let g = 0; while (g < m.frames.length && m.frames[g].length === free * 2) g++; return Math.max(0, g - 2); };
const CONTACT_DEL = contactOf(DELETE, 9), CONTACT_SYN = contactOf(SYNTH, 10);

/** Cost of the straight diagonal path from (x, y) back against velocity (vx, vy) to off the glass. */
let planOps = 0;
function pathCost(cost, x, y, vx, vy) {
  let s = 0;
  for (let n = 2; n < 60; n++) {
    const X = x - vx * n, Y = y - vy * n;
    if (X < 0 || Y < 0 || X >= CW || Y >= CH) break;
    s += cost[Y * CW + X]; planOps++;
  }
  return s;
}

// symmetry helpers: where the canonical block lands, and a transformed vector
function symOffset(S) {
  const [a, b, c, d] = SYM[S];
  return [-(Math.min(a, 0) + Math.min(b, 0)), -(Math.min(c, 0) + Math.min(d, 0))];
}
const OFF = SYM.map((_, S) => symOffset(S));
const tvec = (S, x, y) => [SYM[S][0] * x + SYM[S][1] * y, SYM[S][2] * x + SYM[S][3] * y];

// ------------------------------------------------------------ the turn plan

// The turn at the start of minute K: per changing slot, a glider for every old
// block (contacts spread over -0.42 .. -0.12 s, every other block first so
// the digit thins evenly) and a pair for every new block (settling +0.08 ..
// +0.40 s, in the same two salvos). All changing digits work at once.
const PLANS = new Map();
function planFor(K) {
  let p = PLANS.get(K);
  if (p) return p;
  const a = clockFields(new Date((K - 1) * 60000)), b = clockFields(new Date(K * 60000));
  const from = a.hh + a.mm, to = b.hh + b.mm;
  const slots = [];
  for (let k = 0; k < 4; k++) {
    const d0 = +from[k], d1 = +to[k];
    if (d0 === d1) { slots.push(null); continue; }
    const [sx, sy] = SLOTS[k];
    const ev = (d, type) => {
      const list = BLOCKS[d].map(([cx, cy], n) => {
        const bx = sx + cx, by = sy + cy, i = (cx / PITCH) | 0, j = (cy / PITCH) | 0;
        // choose the symmetry whose glider path(s) cross the least
        const syms = type === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 4, 5, 1, 3, 6, 7];
        const movie = type === 0 ? DELETE : SYNTH;
        let best = 0, bc = 1e9;
        for (const S of syms) {
          let c = 0;
          for (const gl of movie.gliders) { const [vx, vy] = tvec(S, gl.dx, gl.dy); c += pathCost(COST[k], bx, by, vx, vy); }
          c += (hash(K, n, S + type * 8) & 3);           // a little variety among equals
          if (c < bc) { bc = c; best = S; }
        }
        return { bx, by, S: best, par: (i + j) & 1, r: (hash(K, k * 64 + n, type) % 1000) / 1000 };
      });
      for (const e of list) {
        // two salvos: every other block of the lattice first, so a digit thins and fills evenly
        const u = e.par * 0.5 + e.r * 0.45;
        // deletion: contacts from -0.42 s to -0.12 s; synthesis: blocks settle from +0.08 s to +0.40 s
        e.T = type === 0 ? -0.42 + u * 0.30 - CONTACT_DEL / RATE : 0.08 + u * 0.32;
      }
      return list;
    };
    slots.push({ del: ev(d0, 0), syn: ev(d1, 1) });
  }
  p = { from, to, slots };
  PLANS.set(K, p);
  if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  return p;
}

/** The free glider's cells at movie generation g (any g before contact), under the event's symmetry. */
function gliderCells(gl, e, g, fn) {
  const n = Math.floor(g / 4), f = g - 4 * n, ph = gl.ph[f];
  const [a, b, c, d] = SYM[e.S], [ox, oy] = OFF[e.S];
  for (let i = 0; i < ph.length; i += 2) {
    const x0 = ph[i] + gl.dx * n, y0 = ph[i + 1] + gl.dy * n;
    if (fn(a * x0 + b * y0 + ox + e.bx, c * x0 + d * y0 + oy + e.by)) return true;
  }
  return false;
}
// ------------------------------------------------------------ drawing

function blockAt(x, y) {
  const k = y * CW + x;
  cells[k] = cells[k + 1] = cells[k + CW] = cells[k + CW + 1] = 1;
}
function haloAt(x, y, v) {
  for (let Y = y - 1; Y <= y + 2; Y++) for (let X = x - 1; X <= x + 2; X++)
    if (X >= 0 && Y >= 0 && X < CW && Y < CH) halo[Y * CW + X] += v;
}
let drawn = 0;
function plot(X, Y, e, own) {
  if (X < 0 || Y < 0 || X >= CW || Y >= CH) return false;
  const k = Y * CW + X;
  if (BOXES[k] && (X < e.bx - NEAR || X > e.bx + 1 + NEAR || Y < e.by - NEAR || Y > e.by + 1 + NEAR)) return false;   // behind the numerals
  const mine = own && X >= e.bx - 1 && X <= e.bx + 2 && Y >= e.by - 1 && Y <= e.by + 2 ? 1 : 0;
  if (halo[k] - mine > 0) return false;                                   // behind a standing block
  cells[k] = 1; drawn++;
  return false;
}
/** A reaction at movie generation g: before contact its gliders fly free, then the recorded frames. */
function drawMovie(m, e, g, contact, own) {
  if (g < contact) {
    for (let j = 0; j < m.gliders.length; j++) gliderCells(m.gliders[j], e, g, (X, Y) => plot(X, Y, e, own));
    return;
  }
  const list = m.frames[g], [a, b, c, d] = SYM[e.S], [ox, oy] = OFF[e.S];
  for (let i = 0; i < list.length; i += 2) plot(a * list[i] + b * list[i + 1] + ox + e.bx, c * list[i] + d * list[i + 1] + oy + e.by, e, own);
}

function expand(g) {
  const buf = g.buf;
  for (let y = 0; y < CH; y++) {
    const r = y * CW, p0 = y * 2 * 160, p1 = p0 + 160;
    for (let x = 0; x < CW; x++) {
      const v = cells[r + x] ? INK : GROUND, p = x * 2;
      buf[p0 + p] = v; buf[p0 + p + 1] = v; buf[p1 + p] = v; buf[p1 + p + 1] = v;
    }
  }
  g.cost.px += 160 * 80; g.cost.box += CW * CH * 2;
}

export default {
  name: 'Still Life',
  blurb: 'Conway\'s Life on amber: the time is four still lifes of blocks; a glider gun ticks the seconds; each minute a glider fleet deletes the old digit and synthesises the new; on the hour the universe is re-seeded.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const ph = Math.floor((s % 1) * 30) % 30;
    // the hour: the universe re-seeded (conway-hour.js)
    let th = null;
    if (f.m === 59 && s >= 60 + FIRE_T0) th = s - 60;
    else if (f.m === 0 && s < REVEAL[1]) th = s;
    if (th === null) cells.set(GARDEN[ph]);
    else {
      const hk = f.m === 0 ? f.minuteKey : f.minuteKey + 1;
      const dom = fireAt(hk, fireGen(th)), G = GARDEN[ph];
      const w = th > REVEAL[0] ? reachAt(th) : 255;     // behind the closing front the machine is back
      for (let y = 0; y < CH; y++) {
        const r = (y + GARDEN_M) * GARDEN_W + GARDEN_M;
        for (let x = 0; x < CW; x++) { const i = y * CW + x; cells[i] = DIST_VIS[i] > w ? G[i] : dom[r + x]; }
      }
      g.cost.box += fireOps > 0 ? GARDEN_W * 56 * 6 : 0;   // one generation's step (every other frame), charged steady
      g.cost.box += CW * CH * 3;
    }
    halo.fill(0);
    drawn = 0; planOps = 0;
    g.cost.box += CW * CH;                           // the garden copy and the halo clear

    // which turn is near: the one ending this minute's start, or the next
    let plan = null, tau = 0;
    if (s >= 55.5) { plan = planFor(f.minuteKey + 1); tau = s - 60; }
    else if (s < 2.5) { plan = planFor(f.minuteKey); tau = s; }
    const t = plan ? null : f.hh + f.mm;

    // static blocks first (and their halos), then the reactions
    const live = [];
    for (let k = 0; k < 4; k++) {
      const [sx, sy] = SLOTS[k];
      const sl = plan ? plan.slots[k] : null;
      if (!sl) {
        const d = plan ? +plan.to[k] : +t[k];
        for (const [cx, cy] of BLOCKS[d]) { blockAt(sx + cx, sy + cy); haloAt(sx + cx, sy + cy, 1); }
        continue;
      }
      for (const e of sl.del) {
        const gen = Math.floor((tau - e.T) * RATE);
        if (gen < CONTACT_DEL) { blockAt(e.bx, e.by); haloAt(e.bx, e.by, 1); }
        if (gen < DELETE.frames.length) live.push([DELETE, e, gen]);
      }
      for (const e of sl.syn) {
        const gen = Math.floor((tau - e.T) * RATE) + SYNTH.at;
        if (gen >= SYNTH.frames.length) { blockAt(e.bx, e.by); haloAt(e.bx, e.by, 1); }
        else live.push([SYNTH, e, gen]);
      }
    }
    for (const [m, e, gen] of live) if (gen > -600) drawMovie(m, e, gen, m === DELETE ? CONTACT_DEL : CONTACT_SYN, m === DELETE);
    // the hour's negative: behind the sowing front the glass is amber and the cells dark, until the quench passes
    if (th !== null) {
      const w = reachAt(th);
      for (let i = 0; i < CW * CH; i++) if (DIST_VIS[i] <= w) cells[i] ^= 1;
      g.cost.box += CW * CH * 2;
    }
    g.cost.box += drawn * 6 + live.length * 20 + planOps * 4;   // the plan is built once a minute, in the frame that needs it
    expand(g);
  },
};
