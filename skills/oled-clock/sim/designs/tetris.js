// Tetris — the time is built out of tetrominoes, one minute at a time.
//
// Each digit of HH:MM is a 6x10 grid of 4-pixel cells with strokes two cells
// thick, and every digit is tiled by real tetrominoes (I O T S Z J L). The
// tiling and the order the pieces go down in are found by a small search when
// the module loads (about 0.1 s): each piece must come to rest on the floor or
// on a piece already placed, and nothing may be placed above a cell that is
// still empty, so every piece can come straight down its columns. Blocks are
// 3x3 on a 4-pixel grid, and, as on the Game Boy, T, S and Z blocks are
// hollow, so you can still see how a digit was stacked once it stands.
//
// When a digit changes, its old picture is line-cleared from the bottom (two
// rows flash as a complete line, vanish, and the rest drops), then the new
// digit's pieces come in one by one: each appears at the top, rotates and
// slides into its column a step at a time, and hard-drops into place. Every
// piece has a fixed start time measured from the minute turn, so the whole
// build is a function of `fields.sec`; nothing is simulated. On the hour the
// lanes start right to left, like a carry. The NEXT box above the colon shows
// the piece that will spawn next, including the first piece of the next
// minute's build, and the colon (two O pieces) blinks with the seconds.
//
// Burn-in: everything walks a 2-pixel orbit, the minute digits rebuild every
// minute and the colon blinks. Idle frames change only the colon, so the
// dirty driver sends a few bytes.

import { font3x5, orbit, previousMinute, clockFields, OFF } from '../js/kit.js';

const CELL = 4;            // pixels per cell; blocks are 3x3
const COLS = 6, ROWS = 10; // digit grid
const GRID_Y = 22;         // top of the digit grid on the glass
const LANE_X = [4, 32, 72, 100];
const COLON_X = 60;

// Timing, seconds from the minute turn.
const CLEAR_STEP = 0.1;    // one pair of rows: flash, then gone
const CLEAR = CLEAR_STEP * ROWS / 2;
const STEP = 0.08;         // one rotate / slide / fall step while steering
const LAG = 0.08;          // next piece spawns this long after a hard drop starts
const DROP_V = 60;         // hard drop, rows per second
const AIR_B0 = -5;         // bottom row of a piece when it spawns
const LANE_DELAY = [0.45, 0.3, 0.15, 0]; // right to left on hour turns

// Digits, two-cell strokes. Every cell count is a multiple of 4.
const GLYPHS = {
  0: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  1: ['.###..', '####..', '.###..', '..##..', '..##..', '..##..', '..##..', '..##..', '.####.', '.####.'],
  2: ['.####.', '######', '....##', '....##', '.#####', '#####.', '##....', '##....', '######', '######'],
  3: ['.####.', '######', '....##', '....##', '..####', '..####', '....##', '....##', '######', '.####.'],
  4: ['##..##', '##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##'],
  5: ['#####.', '######', '##....', '##....', '#####.', '######', '....##', '....##', '######', '.####.'],
  6: ['.####.', '######', '##....', '##....', '######', '######', '##..##', '##..##', '######', '.####.'],
  7: ['######', '######', '....##', '....##', '...##.', '...##.', '..##..', '..##..', '..##..', '..##..'],
  8: ['.####.', '######', '##..##', '##..##', '.####.', '.####.', '##..##', '##..##', '######', '.####.'],
  9: ['.####.', '######', '##..##', '##..##', '######', '######', '....##', '....##', '######', '.####.'],
};

// ------------------------------------------------------------ tetrominoes

const BASE = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  M: [[0, 0]], // monomino: only if a digit cannot be tiled otherwise
};

/** Normalised cells [x, y] of each of the four clockwise rotations, with width and height. */
const SHAPES = {};
for (const [k, cells] of Object.entries(BASE)) {
  const rots = [];
  let cur = cells;
  for (let r = 0; r < 4; r++) {
    const mx = Math.min(...cur.map((p) => p[0])), my = Math.min(...cur.map((p) => p[1]));
    const norm = cur.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    rots.push({ cells: norm, w: Math.max(...norm.map((p) => p[0])) + 1, h: Math.max(...norm.map((p) => p[1])) + 1 });
    cur = cur.map(([x, y]) => [-y, x]); // clockwise on a y-down screen
  }
  SHAPES[k] = rots;
}

/** A tiny seeded generator, so the tiling search is the same on every load. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Tile one glyph exactly (depth-first, always covering the top-most,
 * left-most empty cell), then order the pieces for dropping. Calls `found`
 * with each buildable tiling until it returns true or the budget runs out.
 */
function tilings(glyph, seed, allowMono, found) {
  const target = new Set();
  glyph.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') target.add(r * COLS + c); }));
  const owner = new Map();
  const pieces = [];
  const rand = rng(seed);
  const types = allowMono ? ['I', 'O', 'T', 'S', 'Z', 'J', 'L', 'M'] : ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  // Every placement of every piece, indexed by the first cell it covers.
  const byFirst = new Map();
  for (const type of types)
    for (let rot = 0; rot < (type === 'O' || type === 'M' ? 1 : 4); rot++) {
      const shape = SHAPES[type][rot];
      for (let row = -3; row < ROWS; row++)
        for (let col = -3; col < COLS; col++) {
          const ks = shape.cells.map(([x, y]) => (row + y >= 0 && row + y < ROWS && col + x >= 0 && col + x < COLS ? (row + y) * COLS + col + x : -1));
          if (ks.some((k) => !target.has(k))) continue;
          // It must come to rest on the floor or on another piece.
          if (!ks.some((k) => k >= (ROWS - 1) * COLS || (target.has(k + COLS) && !ks.includes(k + COLS)))) continue;
          const first = Math.min(...ks);
          if (!byFirst.has(first)) byFirst.set(first, []);
          byFirst.get(first).push({ type, rot, row, col, ks });
        }
    }
  const sorted = [...target].sort((a, b) => a - b);
  let budget = 20000;

  const dfs = () => {
    if (--budget < 0) return true; // give up
    const next = sorted.find((k) => !owner.has(k));
    if (next === undefined) {
      const order = dropOrder(pieces, target);
      return order ? found(order) : false;
    }
    const opts = (byFirst.get(next) ?? []).filter((p) => p.ks.every((k) => !owner.has(k)));
    opts.sort((a, b) => (a.type === 'M') - (b.type === 'M') || rand() - 0.5);
    for (const p of opts) {
      p.ks.forEach((k) => owner.set(k, pieces.length));
      pieces.push(p);
      if (dfs()) return true;
      pieces.pop();
      p.ks.forEach((k) => owner.delete(k));
    }
    return false;
  };
  dfs();
}

/**
 * A drop order for a tiling, or null if there is none. A piece can only go
 * down once every piece below it in any of its columns is in (otherwise it
 * would seal them in), and it must come to rest on the floor or on another
 * piece, not float over a hole.
 */
function dropOrder(pieces, target) {
  const own = new Map();
  pieces.forEach((p, i) => p.ks.forEach((k) => own.set(k, i)));
  const below = pieces.map(() => new Set());
  for (let i = 0; i < pieces.length; i++) {
    let rests = false;
    for (const k of pieces[i].ks) {
      const r = Math.floor(k / COLS), c = k % COLS;
      if (r === ROWS - 1 || (target.has(k + COLS) && own.get(k + COLS) !== i)) rests = true;
      for (let rr = r + 1; rr < ROWS; rr++) {
        const j = own.get(rr * COLS + c);
        if (j !== undefined && j !== i) below[i].add(j);
      }
    }
    if (!rests) return null;
  }
  const done = new Set(), order = [];
  while (order.length < pieces.length) {
    // Of the pieces that can go now, the lowest first, then left to right.
    let pick = -1, pickKey = Infinity;
    for (let i = 0; i < pieces.length; i++) {
      if (done.has(i) || [...below[i]].some((j) => !done.has(j))) continue;
      const key = -Math.max(...pieces[i].ks) + 0.001 * Math.min(...pieces[i].ks.map((k) => k % COLS));
      if (key < pickKey) { pick = i; pickKey = key; }
    }
    if (pick < 0) return null; // pieces interlock: no order works
    done.add(pick);
    const p = pieces[pick];
    order.push({ type: p.type, rot: p.rot, row: p.row, col: p.col, cells: p.ks.map((k) => [Math.floor(k / COLS), k % COLS]) });
  }
  return order;
}

/** The best of the buildable tilings found: many kinds of piece, few repeats, no monominoes if possible. */
function bestTiling(glyph, d) {
  let best = null, bestScore = -Infinity;
  for (const allowMono of [false, true]) {
    for (let s = 0; s < 6; s++) {
      let n = 0;
      tilings(glyph, 1 + d * 97 + s * 13, allowMono, (order) => {
        const kinds = new Set(order.map((p) => p.type)).size;
        const mono = order.filter((p) => p.type === 'M').length;
        const repeats = order.filter((p, i) => i && order[i - 1].type === p.type).length;
        const score = kinds * 10 - mono * 100 - repeats * 4;
        if (score > bestScore) { best = order; bestScore = score; }
        return ++n >= 8;
      });
    }
    if (best) break;
  }
  if (!best) throw new Error(`tetris: digit ${d} cannot be tiled`);
  return best;
}

/**
 * The build of one digit: each piece's spawn, steering steps and landing,
 * in seconds from the start of the build.
 */
function schedule(order, d) {
  let s = 0;
  const rand = rng(d * 131 + 7);
  return order.map((p) => {
    const shapes = SHAPES[p.type];
    const fit = (rot, col) => Math.max(0, Math.min(COLS - shapes[rot].w, col));
    // Steering: a turn or two and a slide or two, chosen by seeded noise.
    const r1 = rand(), r2 = rand();
    const nRot = p.type === 'O' || p.type === 'M' ? 0 : Math.floor(r1 * 3);
    let dx = Math.round((r2 - 0.5) * 4.9);
    if (nRot + Math.abs(dx) > 3) dx = Math.sign(dx) * (3 - nRot);
    let rot = (p.rot - nRot + 4) % 4, col = fit(rot, p.col + dx);
    const states = [[rot, col]];
    while (rot !== p.rot) { rot = (rot + 1) % 4; col = fit(rot, col); states.push([rot, col]); }
    while (col !== p.col) { col += Math.sign(p.col - col); states.push([rot, col]); }
    const n = states.length - 1;
    const dropFrom = Math.min(AIR_B0 + n, -1);
    const bottom = p.row + shapes[p.rot].h - 1;
    const dropAt = s + (n + 1) * STEP;
    const land = dropAt + (bottom - dropFrom) / DROP_V;
    const piece = { ...p, id: order.indexOf(p), start: s, states, dropAt, dropFrom, land };
    s = dropAt + LAG;
    return piece;
  });
}

const BUILDS = {};
for (let d = 0; d <= 9; d++) BUILDS[d] = schedule(bestTiling(GLYPHS[d], d), d);

// ------------------------------------------------------------ drawing

// Game Boy style: the "odd" pieces get a hollow block, so you can see how a
// digit was stacked without grooves turning it into a maze.
const HOLLOW = new Set(['T', 'S', 'Z']);

/**
 * Draw cells as 3x3 blocks on the 4-pixel grid. `cells` are
 * [row, col, pieceId, type]; mini cells (`size` < CELL) are always solid.
 */
function drawCells(g, cells, x0, y0, size = CELL) {
  const b = size - 1;
  for (const [r, c, , type] of cells) {
    const x = x0 + c * size, y = y0 + r * size;
    g.fillRect(x, y, b, b);
    if (size === CELL && HOLLOW.has(type)) g.pixel(x + 1, y + 1, OFF);
  }
}

/** The cells of a piece in a given rotation with its top-left at (row, col). */
const cellsOf = (type, rot, row, col, id) => SHAPES[type][rot].cells.map(([x, y]) => [row + y, col + x, id, type]);

/** Where a piece is at build time `tau`: its cells, or null before it spawns. */
function pieceAt(p, tau) {
  if (tau < p.start) return null;
  if (tau >= p.land) return { cells: p.cells.map(([r, c]) => [r, c, p.id, p.type]), placed: true };
  const shapes = SHAPES[p.type];
  if (tau < p.dropAt) {
    const i = Math.min(p.states.length - 1, Math.floor((tau - p.start) / STEP));
    const [rot, col] = p.states[i];
    const bottom = Math.min(AIR_B0 + i, -1);
    return { cells: cellsOf(p.type, rot, bottom - shapes[rot].h + 1, col, p.id), placed: false };
  }
  const bottom = Math.min(p.row + shapes[p.rot].h - 1, p.dropFrom + Math.floor((tau - p.dropAt) * DROP_V));
  return { cells: cellsOf(p.type, p.rot, bottom - shapes[p.rot].h + 1, p.col, p.id), placed: false, dropping: true };
}

/** A whole digit, at rest. */
const restingCells = (d) => BUILDS[d].flatMap((p) => p.cells.map(([r, c]) => [r, c, p.id, p.type]));

/** One lane at `sec` of the minute: old digit, being cleared, or new one being built. */
function drawLane(g, lane, from, to, sec, x0, y0, changed) {
  if (!changed) { drawCells(g, restingCells(to), x0, y0); return; }
  const tau = sec - LANE_DELAY[lane];
  if (tau < 0) { drawCells(g, restingCells(from), x0, y0); return; }
  if (tau < CLEAR) {
    // Line clear from the bottom: two rows flash as a complete line, vanish,
    // then everything above drops two rows.
    const step = Math.floor(tau / CLEAR_STEP), flash = tau - step * CLEAR_STEP < CLEAR_STEP / 2;
    const gone = 2 * step;                    // rows already cleared
    const cut = ROWS - gone - 2;              // original rows >= cut are being cleared now
    const kept = restingCells(from).filter(([r]) => r < cut).map(([r, c, id, type]) => [r + gone, c, id, type]);
    drawCells(g, kept, x0, y0);
    if (flash) g.fillRect(x0, y0 + (ROWS - 2) * CELL, COLS * CELL - 1, 2 * CELL - 1);
    return;
  }
  const bt = tau - CLEAR;
  const cells = [];
  for (const p of BUILDS[to]) {
    const at = pieceAt(p, bt);
    if (!at) continue;
    if (at.dropping) {
      // A dotted streak above a hard-dropping piece.
      for (const [r, c] of at.cells) for (const k of [2, 4, 7]) g.pixel(x0 + c * CELL + 1, y0 + r * CELL - k);
    }
    cells.push(...at.cells);
  }
  // Clear behind the cells so falling pieces pass in front of the labels.
  for (const [r, c] of cells) g.fillRect(x0 + c * CELL, y0 + r * CELL, CELL, CELL, OFF);
  drawCells(g, cells, x0, y0);
}

/** The next spawn after `sec` in the build that turns `from` into `to`, or null. */
function nextSpawn(from, to, sec) {
  let best = null;
  for (let lane = 0; lane < 4; lane++) {
    if (from[lane] === to[lane]) continue;
    for (const p of BUILDS[to[lane]]) {
      const at = LANE_DELAY[lane] + CLEAR + p.start;
      if (at > sec && (!best || at < best.at)) best = { at, type: p.type, rot: p.states[0][0] };
    }
  }
  return best;
}

const digitsOf = (f) => [...`${f.hh}${f.mm}`].map(Number);

export default {
  name: 'Tetris',
  blurb: 'HH:MM stacked from real tetrominoes: old digits line-clear, new ones are dropped in piece by piece.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'dirty',

  frame(g, { fields: f, date }) {
    const [ox, oy] = orbit(date, 2, 3);
    const now = digitsOf(f), before = digitsOf(previousMinute(date));
    const sec = f.sec;
    const y0 = GRID_Y + oy;

    // Labels first, so falling pieces pass in front of them.
    const [lx, ly] = orbit(date, 3, 2);
    g.text(`${f.dow} ${f.dd}`, 5 + lx, 3 + ly, { font: font3x5 });

    // NEXT: the piece that spawns next, this minute or the next.
    let next = nextSpawn(before, now, sec);
    if (!next) {
      const after = digitsOf(clockFields(new Date(date.getTime() + 60000)));
      next = nextSpawn(now, after, -1);
    }
    if (next) {
      const s = SHAPES[next.type][next.rot];
      const px = 3; // mini cells: 2x2 with a 1-pixel groove
      const nx = COLON_X + 4 + ox - Math.floor((s.w * px - 1) / 2), ny = 9 + oy + Math.floor((2 - s.h) * px / 2);
      drawCells(g, s.cells.map(([x, y]) => [y, x, 0, next.type]), nx, ny, px);
    }
    // The label only around the turn, when the preview matters (and to spare those pixels).
    if (sec >= 50 || sec < 5) g.text('NEXT', COLON_X - 3 + ox, 2 + oy, { font: font3x5 });

    // The colon: two O pieces, lit for the first half of every second.
    if (sec % 1 < 0.5) {
      drawCells(g, cellsOf('O', 0, 2, 0, 0), COLON_X + ox, y0);
      drawCells(g, cellsOf('O', 0, 6, 0, 1), COLON_X + ox, y0);
    }

    for (let lane = 0; lane < 4; lane++)
      drawLane(g, lane, before[lane], now[lane], sec, LANE_X[lane] + ox, y0, before[lane] !== now[lane]);
  },
};
