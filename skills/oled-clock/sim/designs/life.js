// Life — the time is a pattern in Conway's Game of Life.
//
// The glass is a Life board of 4 px cells, each drawn as a round cell that
// swells when it is born and shrinks when it dies, so a generation is a
// smooth morph and never a step. The digits are drawn in cells, a 6 x 10
// hand with two-cell stems and one-cell hairlines (the corners of the round
// cells leave a beaded texture in the stems); a slow sheen runs across
// them. The colon is two blinkers, turning once a second, and the empty
// board shows a faint grid of corner dots.
//
// The minute turn is an honest Life computation, run inside frame():
//   - A spaceship (LWSS or MWSS) flies in from the left along the top
//     margin, over the hour digits, and strikes the minute digit about to
//     change. The digit was a frozen pattern; the touch lights it like a
//     fuse, its cells joining the computation one by one along the strokes,
//     and ship and digit evolve under Life's rules into chaos.
//   - The trick: the new digit is run *forward* from a mirror collision (a
//     ship along the bottom margin into the new digit) and that history is
//     played *backwards*. So after :00 the chaos un-evolves, slows, zips up
//     into the new digit, which rests a moment, and then the spaceship flies
//     back out of it along the bottom and away to the left, as if it had
//     passed through the time and rewritten it.
//   - Across :00 the two chaoses hand over cell by cell while both are still
//     moving, which reads as just another generation. The old history is
//     only shown before :00, the new one only after.
// The hour: the colon stops blinking and gathers into an R-pentomino, Life's
// famous methuselah. It detonates, burns into the two inner digits, the
// outer ones catch, and the whole board boils; after :00 the new time
// condenses from the outside in, the R-pentomino shrinks back into the
// centre and becomes the colon again. Strikes, :00 and the moment a digit
// locks in send a ripple through the grid.
//
// Purity: a turn's two histories are simulated from the turn's digits and
// cached by the turn's minute only; a cold call at any instant recomputes
// them (about a millisecond). Which strike is used on each digit (ship,
// lane, phase) was chosen by scoring how chaotic it gets (STRIKES).
//
// Burn-in: the board walks a 2 px orbit every 3 minutes; the grid dots are
// a half-duty pattern; from 23:00 to 07:00 the panel dims.

import { dither, orbit, previousMinute, clockFields, clamp } from '../js/kit.js';

const W = 128, H = 64;
const P = 4;                          // cell pitch, px
const GX = -2, GY = 0;                // grid origin (before the orbit): column 16 is centred
const VC = 33, VR = 16;               // visible columns, rows
const SW = 59, SH = 38;               // simulation board, cells
const VX = 13, VY = 11;               // the visible board's offset inside it
const N = SW * SH;
const SLOT_COL = [1, 8, 19, 26], DROW = 3, DW = 6, DH = 10;

// ------------------------------------------------------------ letterforms
// One cell per stroke; corners are cut on the diagonal so the round cells
// read as curves.

const FONT = {
  0: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  1: ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  2: ['.####.', '##..##', '....##', '....##', '...##.', '..##..', '.##...', '##....', '##....', '######'],
  3: ['.####.', '##..##', '....##', '....##', '..###.', '....##', '....##', '....##', '##..##', '.####.'],
  4: ['...##.', '..###.', '.#.##.', '#..##.', '#..##.', '######', '...##.', '...##.', '...##.', '...##.'],
  5: ['######', '##....', '##....', '#####.', '....##', '....##', '....##', '....##', '##..##', '.####.'],
  6: ['..###.', '.##...', '##....', '##....', '#####.', '##..##', '##..##', '##..##', '##..##', '.####.'],
  7: ['######', '....##', '....##', '...##.', '...##.', '..##..', '..##..', '.##...', '.##...', '.##...'],
  8: ['.####.', '##..##', '##..##', '##..##', '.####.', '##..##', '##..##', '##..##', '##..##', '.####.'],
  9: ['.####.', '##..##', '##..##', '##..##', '##..##', '.#####', '....##', '....##', '...##.', '.###..'],
};
const GLYPH = Object.fromEntries(Object.entries(FONT).map(([d, rows]) => {
  const c = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') c.push([x, y]); }));
  return [d, c];
}));

/** Sim-board indices of digit `d` drawn in slot `s`. */
function digitCells(d, s) {
  return GLYPH[d].map(([x, y]) => (VY + DROW + y) * SW + VX + SLOT_COL[s] + x);
}

/** Cells within Chebyshev distance 2 of `cells`: touching it releases a frozen digit. */
function haloOf(cells) {
  const set = new Set();
  for (const i of cells) {
    const x = i % SW, y = (i / SW) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < SW && yy < SH) set.add(yy * SW + xx);
    }
  }
  return Int32Array.from(set);
}

// ------------------------------------------------------------ Life

/**
 * One generation, B3/S23, dead border, computed only over `box`
 * [x0, y0, x1, y1] (the live cells' bounds, inclusive) grown by one.
 * Returns the new live bounds.
 */
function step(a, b, box = [0, 0, SW - 1, SH - 1]) {
  b.fill(0);
  const X0 = Math.max(1, box[0] - 1), Y0 = Math.max(1, box[1] - 1);
  const X1 = Math.min(SW - 2, box[2] + 1), Y1 = Math.min(SH - 2, box[3] + 1);
  let x0 = SW, y0 = SH, x1 = -1, y1 = -1;
  for (let y = Y0; y <= Y1; y++) {
    let i = y * SW + X0;
    for (let x = X0; x <= X1; x++, i++) {
      const n = a[i - SW - 1] + a[i - SW] + a[i - SW + 1] + a[i - 1] + a[i + 1] + a[i + SW - 1] + a[i + SW] + a[i + SW + 1];
      if (n === 3 || (n === 2 && a[i])) {
        b[i] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return [x0, y0, x1, y1];
}

/** Bounds of the live cells. */
function boundsOf(a) {
  let x0 = SW, y0 = SH, x1 = -1, y1 = -1;
  for (let i = 0; i < N; i++) if (a[i]) {
    const x = i % SW, y = (i / SW) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Put a picture (rows of '#') on the board with its top-left at sim (x0, y0). */
function put(a, pic, x0, y0) {
  pic.forEach((r, y) => [...r].forEach((ch, x) => {
    const xx = x0 + x, yy = y0 + y;
    if (ch === '#' && xx >= 0 && yy >= 0 && xx < SW && yy < SH) a[yy * SW + xx] = 1;
  }));
}
const flipY = (pic) => [...pic].reverse();
const flipX = (pic) => pic.map((r) => [...r].reverse().join(''));
const rot180 = (pic) => flipX(flipY(pic));

const FUSE = 0.55;    // generations per cell for the release to burn along a stroke

/**
 * Release order of a digit's cells once something touches it: the cell
 * nearest the live cells goes first, the rest follow along the strokes
 * (8-connected), FUSE generations per cell, like a burning fuse.
 */
function fuse(cells, a) {
  const pos = cells.map((i) => [i % SW, (i / SW) | 0]);
  let start = 0, bd = Infinity;
  for (let k = 0; k < cells.length; k++) {
    const [x, y] = pos[k];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!a[(y + dy) * SW + x + dx]) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + 0.01 * (Math.abs(dx) + Math.abs(dy));
      if (d < bd) { bd = d; start = k; }
    }
  }
  const dist = new Array(cells.length).fill(-1);
  dist[start] = 0;
  const q = [start];
  while (q.length) {
    const k = q.shift();
    for (let j = 0; j < cells.length; j++)
      if (dist[j] < 0 && Math.abs(pos[j][0] - pos[k][0]) <= 1 && Math.abs(pos[j][1] - pos[k][1]) <= 1) { dist[j] = dist[k] + 1; q.push(j); }
  }
  const max = Math.max(...dist);
  return dist.map((d) => (d < 0 ? max + 1 : d) * FUSE);
}

/**
 * Run a turn's history. `world` holds the movers at generation 0. Each
 * frozen digit stays as drawn, out of the computation, until a live cell
 * enters its halo (or `fallback` generations after the first touch); from
 * there its cells join in one by one along the strokes. Runs to `extra`
 * generations after the first touch. Returns every generation as it looks
 * (live cells plus the still-frozen ones) and the first touch.
 */
function simulate(world, frozen, extra, fallback = 12, limit = 150) {
  let a = world, b = new Uint8Array(N);
  let box = boundsOf(a);
  const D = [];
  let first = -1;
  const pending = frozen.map((f) => ({ ...f, rel: null }));
  for (let n = 0; ; n++) {
    for (const f of pending) {
      if (!f.rel) {
        let touch = first >= 0 && n >= first + fallback;
        if (!touch) for (const i of f.halo) if (a[i]) { touch = true; break; }
        if (touch) {
          f.rel = fuse(f.cells, a).map((d) => n + d);
          f.at = n;
          if (first < 0) first = n;
        }
      }
      if (f.rel) f.cells.forEach((i, k) => {
        if (f.rel[k] === -1 || f.rel[k] > n) return;
        a[i] = 1; f.rel[k] = -1;
        const x = i % SW, y = (i / SW) | 0;
        box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
      });
    }
    const disp = a.slice();
    for (const f of pending) f.cells.forEach((i, k) => { if (!f.rel || f.rel[k] !== -1) disp[i] = 1; });
    D.push(disp);
    if ((first >= 0 && n >= first + extra) || n >= limit) break;
    box = step(a, b, box);
    [a, b] = [b, a];
  }
  if (first < 0) first = D.length - 1;
  return { D, first, at: pending.map((f) => f.at ?? first) };
}

// ------------------------------------------------------------ the minute: a spaceship strike

// Spaceships, all flying right at c/2 (two cells every four generations).
const SHIPS = [
  ['#..#.', '....#', '#...#', '.####'],                           // LWSS
  ['..#...', '#...#.', '.....#', '#....#', '.#####'],             // MWSS
];
const K = 34;        // generations from the strike to :00
const X = 4;         // generations the two chaoses overlap across :00
const RA = 14;       // generations per second, flying and exploding
const TF = 2.3;      // seconds after :00 at which the new digit has condensed
const HOLD = 0.35;   // it rests, then the ship leaves
const RAMP = 0.7;    // the ship accelerates away over this long

/**
 * A ship on an empty board. `side` 'top' flies along the top margin, its
 * belly against the digits' top row; 'bottom' (mirrored) along the bottom.
 * `front` is the visible column of its nose.
 */
function shipWorld(v, side, front) {
  const a = new Uint8Array(N);
  let pic = SHIPS[v.type];
  if (side === 'bottom') pic = flipY(pic);
  const h = pic.length, w = pic[0].length;
  const top = side === 'top' ? DROW - 1 - v.row - (h - 1) : DROW + DH + v.row;
  put(a, pic, VX + front - w + 1, VY + top);
  const b = new Uint8Array(N);
  let x = a, y = b;
  for (let k = 0; k < v.phase; k++) { step(x, y); [x, y] = [y, x]; }
  return x;
}

const VARIANTS = [];
for (let type = 0; type < SHIPS.length; type++)
  for (let row = 0; row < 2; row++)
    for (let phase = 0; phase < 4; phase++)
      for (let xs = 0; xs < 2; xs++) VARIANTS.push({ type, row, phase, xs });

const VIS = (i) => {
  const x = (i % SW) - VX, y = ((i / SW) | 0) - VY;
  return x >= 0 && y >= 0 && x < VC && y < VR;
};

/** How good a strike on digit `d` is: lively, spread out, nothing left of the digit. */
function scoreStrike(d, v, side) {
  const cells = digitCells(d, 3);
  const r = simulate(shipWorld(v, side, SLOT_COL[3] - 4 - v.xs), [{ cells, halo: haloOf(cells) }], K + X);
  const end = r.D[r.first + K], before = r.D[r.first + K - 2];
  if (!end || !before) return -1e9;
  let pop = 0, change = 0, x0 = 99, x1 = -99, y0 = 99, y1 = -99;
  for (let i = 0; i < N; i++) {
    if (!VIS(i)) continue;
    if (end[i] !== before[i]) change++;
    if (end[i]) {
      pop++;
      const x = i % SW, y = (i / SW) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  let same = 0;
  for (const i of cells) same += end[i];
  return change * 1.5 + pop * 0.6 + (x1 - x0) + (y1 - y0) - 60 * (same / cells.length);
}

/**
 * Best strike per digit, for the old digit (hit from the top) and the new
 * one (from the bottom): [ship, row, phase, xs]. Scoring all 32 variants
 * for every digit takes ~0.2 s, so the result is kept here; after editing
 * the font, re-run chooseStrikes() and paste its output.
 */
const STRIKES = {
  top: [[0, 0, 0, 1], [1, 0, 0, 1], [0, 0, 0, 1], [1, 0, 0, 0], [0, 0, 0, 1], [1, 1, 0, 0], [1, 1, 0, 1], [0, 0, 0, 0], [1, 1, 0, 1], [0, 1, 0, 1]],
  bottom: [[0, 0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 1], [1, 1, 0, 1], [1, 0, 0, 0], [0, 1, 0, 1], [0, 1, 0, 1], [0, 1, 0, 1], [1, 1, 0, 0]],
};
const BEST = Object.fromEntries(Object.entries(STRIKES).map(([k, v]) => [k, v.map(([type, row, phase, xs]) => ({ type, row, phase, xs }))]));

// eslint-disable-next-line no-unused-vars
function chooseStrikes() {
  const out = { top: [], bottom: [] };
  for (const side of ['top', 'bottom'])
    for (let d = 0; d < 10; d++) {
      let best = null, bs = -Infinity;
      for (const v of VARIANTS) { const s = scoreStrike(d, v, side); if (s > bs) { bs = s; best = v; } }
      out[side][d] = [best.type, best.row, best.phase, best.xs];
    }
  return JSON.stringify(out);
}

/** The ship for a strike on `slot`, started off the left edge, same phase as scored. */
function strikeWorld(v, side, slot) {
  let front = SLOT_COL[3] - 4 - v.xs - (SLOT_COL[3] - SLOT_COL[slot]);
  // Two cells further back is four generations earlier: same ship, same phase.
  while (front > -3) front -= 2;
  return { world: shipWorld(v, side, front) };
}

// ------------------------------------------------------------ the hour: the colon goes critical

// The R-pentomino, Life's most famous small methuselah: five cells that
// boil for over a thousand generations. On the hour the colon becomes one.
const RPENT = ['.##', '##.', '.#.'];
const RP_COL = 15, RP_ROW = 7;                  // its top-left, visible cells
const KH = 30;                                  // generations of boiling before :00
const RH = 14;
const TFH = 2.6;
const GATHER = 0.7;                             // seconds the colon takes to become it

function rpentWorld() {
  const a = new Uint8Array(N);
  put(a, RPENT, VX + RP_COL, VY + RP_ROW);
  return a;
}
const RPENT_CELLS = [];
RPENT.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') RPENT_CELLS.push([RP_COL + x, RP_ROW + y]); }));

// ------------------------------------------------------------ a turn

const TURNS = new Map();

/** The turn that starts the minute `to`: both histories and their timing. */
function turnOf(from, to, key) {
  if (TURNS.has(key)) return TURNS.get(key);
  const hour = to.m === 0;
  const a = digitsOf(from), b = digitsOf(to);
  const slots = hour ? [0, 1, 2, 3] : [0, 1, 2, 3].filter((s) => a[s] !== b[s]);
  const lead = slots[0];
  const frozen = (ds) => slots.map((s) => { const cells = digitCells(ds[s], s); return { cells, halo: haloOf(cells) }; });
  let A, B;
  if (hour) {
    A = simulate(rpentWorld(), frozen(a), KH + X, 14);
    B = simulate(rpentWorld(), frozen(b), KH + X, 14);
  } else {
    A = simulate(strikeWorld(BEST.top[a[lead]], 'top', lead).world, frozen(a), K + X);
    B = simulate(strikeWorld(BEST.bottom[b[lead]], 'bottom', lead).world, frozen(b), K + X);
  }
  const T = { hour, slots, A, B, k: hour ? KH : K, rate: hour ? RH : RA, tf: hour ? TFH : TF };
  if (TURNS.size > 3) TURNS.delete(TURNS.keys().next().value);
  TURNS.set(key, T);
  return T;
}

const digitsOf = (c) => [...`${c.hh}${c.mm}`].map(Number);
const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** A cell's size at fractional generation g of history D. */
function sizeIn(D, g, i) {
  const last = D.length - 1;
  if (g <= 0) return D[0][i];
  if (g >= last) return D[last][i];
  const n = Math.floor(g), u = g - n;
  const a = D[n][i], b = D[n + 1][i];
  return a ? (b ? 1 : 1 - sm(u)) : b ? sm(u) : 0;
}

/** Generation of the old history (forward) and the new one (backward) at tau. */
function clocks(T, tau) {
  const { A, B, k, rate, tf } = T;
  const gA = A.first + k + tau * rate;
  const span = k + X;
  const p = (rate * tf) / span;
  let gB;
  if (tau <= 0) gB = B.first + span;
  else if (tau < tf) gB = B.first + span * (1 - tau / tf) ** p;
  else {
    const t = tau - tf - HOLD;
    const dist = t <= 0 ? 0 : t < RAMP ? (0.5 * rate * t * t) / RAMP : rate * (t - RAMP / 2);
    gB = B.first - dist;
  }
  return { gA, gB, fade: tau / (X / rate) };
}

// ------------------------------------------------------------ drawing

const INNER = [[1, 1], [2, 1], [1, 2], [2, 2]];
const RING = [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]];

function drawCell(g, c, r, s, ox, oy) {
  if (s <= 0) return;
  const bx = GX + ox + c * P, by = GY + oy + r * P;
  const li = s >= 0.35 ? 1 : s / 0.35, lr = s <= 0.35 ? 0 : (s - 0.35) / 0.65;
  for (const [dx, dy] of INNER) { const x = bx + dx, y = by + dy; if (li >= 1 || dither(x, y, li)) g.pixel(x, y, 1); }
  if (lr > 0) for (const [dx, dy] of RING) { const x = bx + dx, y = by + dy; if (lr >= 1 || dither(x, y, lr)) g.pixel(x, y, 1); }
}

/** Hash to [0, 1). */
function hash(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The colon: two blinkers, flipping every second. */
function colonCells(sec) {
  const n = Math.floor(sec), u = sm((sec - n) / 0.8);
  const vert = n % 2 === 0;
  const out = [];
  for (const r of [5, 10]) {
    out.push([16, r, 1]);
    const vs = vert ? 1 - u : u, hs = vert ? u : 1 - u;
    out.push([16, r - 1, vs], [16, r + 1, vs], [15, r, hs], [17, r, hs]);
  }
  return out;
}

const SIZE = new Float32Array(VC * VR);

export default {
  name: 'Life',
  blurb: "Conway's Game of Life: a spaceship strikes the minute, it boils into chaos, and the chaos un-evolves into the new time; on the hour the colon becomes an R-pentomino.",
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, { fields: f, date, oled, night }) {
    const [ox, oy] = orbit(date, 2, 3);
    const ahead = f.sec >= 30;
    const to = ahead ? clockFields(new Date(date.getTime() + 60000)) : f;
    const from = ahead ? f : previousMinute(date);
    const tau = ahead ? f.sec - 60 : f.sec;
    const key = ahead ? f.minuteKey + 1 : f.minuteKey;
    const now = digitsOf(f);

    SIZE.fill(0);
    let T = null;
    if (tau > -9 && tau < 9.5) T = turnOf(from, to, key);
    const inTurn = T ? new Set(T.slots) : new Set();

    // Digits outside the turn stand still, but a slow sheen runs across
    // them, a diagonal band where the cells breathe in a little.
    const band = ((date.getTime() / 1000) % 9) / 9 * (VC + 30) - 15;
    for (let s = 0; s < 4; s++) {
      if (inTurn.has(s)) continue;
      for (const [x, y] of GLYPH[now[s]]) {
        const c = SLOT_COL[s] + x, r = DROW + y;
        const d = (c + r * 0.5 - band) / 3;
        SIZE[r * VC + c] = 1 - 0.3 * Math.exp(-d * d);
      }
    }

    // On the hour the colon turns into an R-pentomino before the boil, and
    // back into blinkers once the new time has condensed.
    let colon = 1, rp = 0;
    const ripples = [];
    if (T) {
      const { gA, gB, fade } = clocks(T, tau);
      const tStrike = -T.k / T.rate;
      if (T.hour) {
        rp = tau < 0 ? sm((tau - (tStrike - GATHER)) / GATHER) : 1 - sm((tau - (T.tf + HOLD)) / GATHER);
        colon = 1 - rp;
        ripples.push([tStrike, 16, 8, 1], [0, 16, 8, 1.6], [T.tf, 16, 8, 1]);
      } else {
        const lead = T.slots[0];
        ripples.push([tStrike, SLOT_COL[lead] + 3, DROW, 1], [T.tf, SLOT_COL[lead] + 3, DROW + DH, 1]);
      }
      for (let r = 0; r < VR; r++)
        for (let c = 0; c < VC; c++) {
          const i = (r + VY) * SW + c + VX;
          let s;
          if (fade <= 0) s = sizeIn(T.A.D, gA, i);
          else if (fade >= 1) s = sizeIn(T.B.D, gB, i);
          else {
            // Cell by cell, at a random moment in the overlap, the old
            // history hands over to the new one.
            const w = sm((fade - 0.75 * hash(i, key)) / 0.25);
            s = Math.max(sizeIn(T.A.D, gA, i) * (1 - w), sizeIn(T.B.D, gB, i) * w);
          }
          const j = r * VC + c;
          if (s > SIZE[j]) SIZE[j] = s;
        }
      if (T.hour && rp < 1) for (const [c, r] of RPENT_CELLS) {
        // The R-pentomino's cells are in both histories' generation 0.
        const j = r * VC + c;
        SIZE[j] *= rp;
      }
    }
    if (colon > 0) for (const [c, r, s] of colonCells(f.sec)) SIZE[r * VC + c] = Math.max(SIZE[r * VC + c], s * colon);

    // The grid: a dot at every other corner where no cell is alive; a
    // ripple runs through it from an impact.
    for (let r = 0; r <= VR; r++)
      for (let c = 0; c <= VC; c++) {
        let near = 0;
        for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const cc = c + dc, rr = r + dr;
          if (cc >= 0 && rr >= 0 && cc < VC && rr < VR) near = Math.max(near, SIZE[rr * VC + cc]);
        }
        if (near >= 0.05) continue;
        const x = GX + ox + c * P, y = GY + oy + r * P;
        let wave = 0;
        for (const [t0, rc, rr, amp] of ripples) {
          const age = tau - t0;
          if (age <= 0 || age > 1.6) continue;
          const d = Math.hypot(c - rc, r - rr), front = age * 26;
          wave = Math.max(wave, amp * Math.max(0, 1 - Math.abs(d - front) / 2.2) * (1 - age / 1.6));
        }
        if (wave > 0.25) {
          g.pixel(x, y, 1); g.pixel(x - 1, y, 1); g.pixel(x + 1, y, 1); g.pixel(x, y - 1, 1); g.pixel(x, y + 1, 1);
        } else if (wave > 0.08 || !((c + r) & 1)) g.pixel(x, y, 1);
      }

    for (let r = 0; r < VR; r++)
      for (let c = 0; c < VC; c++) drawCell(g, c, r, SIZE[r * VC + c], ox, oy);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
