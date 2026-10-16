// Zipper: the numerals are zippers.
//
// Every stroke of the time is a closed zipper chain: the vertical strokes a
// zig-zag of interlocking teeth, the bars a row of teeth from either tape
// meeting over a core. The slider that closed them is parked at the right
// end, its pull-tab swinging a beat a second.
//
// Each minute the slider sets off leftwards over the digits that change,
// unzipping them: the column it has just left springs open (the teeth part)
// and then falls away. It shimmies at the far end, then runs back zipping the
// new digit shut: ahead of it the new teeth wait open, behind it they are
// closed. The tab trails behind the slider and swings on when it stops.
//
// On the hour the slider unzips the minutes and snags on the colon. It
// jiggles, its tab yanked side to side, then rips through the hours. The
// whole glass is open, and a moth flutters out of the jacket. Then one long
// pull zips the new time up from left to right.
//
// Budget: the four chain parts (V, T, M, B) build every digit, so the face
// at rest is at most four slots plus two for the slider. While the slider
// works it is opaque over a whole column, and at most one column beside it
// shows open teeth: four parts + two slider + two open = eight.

import { art, TileAllocator, clockFields } from '../js/kit.js';

const P = {
  V: art(`
    ###..
    ..###
    ###..
    ..###
    ###..
    ..###
    ###..
    ..###`),
  T: art(`
    ###..
    #####
    ..###
    .....
    .....
    .....
    .....
    .....`),
  M: art(`
    ###..
    #####
    ..###
    .....
    .....
    ###..
    #####
    ..###`),
  B: art(`
    .....
    .....
    .....
    .....
    .....
    ###..
    #####
    ..###`),
  // Open (unzipped) versions: the core is gone, the two tapes' teeth apart.
  v: art(`
    ##...
    ...##
    ##...
    ...##
    ##...
    ...##
    ##...
    ...##`),
  t: art(`
    #.#.#
    .....
    .....
    .#.#.
    .....
    .....
    .....
    .....`),
  m: art(`
    #.#.#
    .....
    .#.#.
    .....
    #.#.#
    .....
    .....
    .#.#.`),
  b: art(`
    .....
    .....
    .....
    .....
    #.#.#
    .....
    .....
    .#.#.`),
};
const OPEN = { V: 'v', T: 't', M: 'm', B: 'b' };

const DIGITS = {
  0: ['VTV', 'VBV'],
  1: ['  V', '  V'],
  2: ['MMV', 'VBB'],
  3: ['MMV', 'BBV'],
  4: ['VBV', '  V'],
  5: ['VMM', 'BBV'],
  6: ['VMM', 'VBV'],
  7: ['TTV', '  V'],
  8: ['VMV', 'VBV'],
  9: ['VMV', 'BBV'],
};
const DCOL = [0, 4, 8, 12];
const COLON = 7, HOME = 15;
const BEAD = 0xa5;

const STEP = 0.2;        // a column per step while zipping
const RIP = 0.15;        // the yank through the hours
const SHIM = 0.6;        // the shimmy at the far end
const JAM = 1.6;         // stuck on the colon
const MOTH = 2.6;        // the moth's flight

/** 2x16 grid of part names for four digits, colon included. */
function faceGrid(digs) {
  const g = [Array(16).fill(' '), Array(16).fill(' ')];
  digs.forEach((d, k) => DIGITS[d].forEach((s, row) => [...s].forEach((p, i) => { g[row][DCOL[k] + i] = p; })));
  g[0][COLON] = g[1][COLON] = ':';
  return g;
}

// ---------------------------------------------------------------- slider

/** Slider tiles [top, bottom] with the tab leaning `a` dots (-2..2), body shifted `dx`. */
function slider(a, dx = 0) {
  const top = [
    '.###.',
    '#####',
    '#####',
    '#####',
    '#####',
    '.###.',
    '..#..',
    '..#..',
  ];
  const tab = [
    '.###.',
    '.#.#.',
    '.#.#.',
    '.###.',
    '.###.',
    '.###.',
    '.###.',
    '.....',
  ];
  const shift = (s, k) => {
    const pad = '.....' + s + '.....';
    return pad.slice(5 - k, 10 - k);
  };
  const bottom = tab.map((s, r) => shift(s, Math.round((a * (r + 1)) / 6)));
  return [top.map((s) => shift(s, dx)), bottom.map((s) => shift(s, dx))];
}

const MOTH_TILES = [
  art(`
    .....
    #...#
    ##.##
    #####
    .###.
    ..#..
    .....
    .....`),
  art(`
    .....
    .....
    ..#..
    #####
    ##.##
    #...#
    .....
    .....`),
];

// ------------------------------------------------------------- timeline

/**
 * What the zipper is doing `tau` seconds after the minute turned.
 * Returns { pos, phase, dir } or null when it is at rest.
 *   phase: 'out' (unzipping leftwards), 'shim', 'jam', 'rip', 'moth', 'back'
 */
function timeline(tau, far, hour) {
  let t = tau;
  if (!hour) {
    const n = HOME - far;
    if (t < n * STEP) return { phase: 'out', pos: HOME - 1 - Math.floor(t / STEP), t };
    t -= n * STEP;
    if (t < SHIM) return { phase: 'shim', pos: far, t };
    t -= SHIM;
    if (t < n * STEP) return { phase: 'back', pos: far + 1 + Math.floor(t / STEP), t };
    t -= n * STEP;
    return { phase: 'rest', pos: HOME, t };
  }
  const snag = DCOL[2];                      // stops beside the colon
  const n1 = HOME - snag;
  if (t < n1 * STEP) return { phase: 'out', pos: HOME - 1 - Math.floor(t / STEP), t };
  t -= n1 * STEP;
  if (t < JAM) return { phase: 'jam', pos: snag, t };
  t -= JAM;
  if (t < snag * RIP) return { phase: 'out', pos: snag - 1 - Math.floor(t / RIP), t, rip: true };
  t -= snag * RIP;
  if (t < MOTH) return { phase: 'moth', pos: 0, t };
  t -= MOTH;
  if (t < HOME * STEP) return { phase: 'back', pos: 1 + Math.floor(t / STEP), t };
  t -= HOME * STEP;
  return { phase: 'rest', pos: HOME, t };
}

/** Tab lean: an idle pendulum, a beat a second, plus whatever the slider's motion threw into it. */
function tabLean(sec, st) {
  const idle = Math.sin(Math.PI * (sec - 0.5));                  // swings across once a second
  if (!st) return Math.round(1.2 * idle);
  if (st.phase === 'out') return 2;                               // trails behind, to the right
  if (st.phase === 'back') return -2;
  if (st.phase === 'shim') return [2, -1, 1, -2][Math.floor(st.t / 0.15) % 4];
  if (st.phase === 'jam') return [-2, 2][Math.floor(st.t / 0.2) % 2];
  if (st.phase === 'moth') return Math.round(1.2 * idle);
  // at rest after a run: the swing dies away
  const k = Math.exp(-st.t / 1.2);
  return Math.max(-2, Math.min(2, Math.round(-2.4 * k * Math.cos(Math.PI * 2 * st.t / 1.0) + 1.2 * (1 - k) * idle)));
}

// ---------------------------------------------------------------- design

export default {
  name: 'Zipper',
  blurb: 'The numerals are zippers; each minute the slider unzips the digit that changes and zips up the new one, and on the hour it snags.',
  bus: 'i2c100',
  panel: 'blue',
  fps: 10,

  frame(lcd, api, { fields, date }) {
    const sec = fields.s + fields.ms / 1000;
    const now = [fields.hh[0], fields.hh[1], fields.mm[0], fields.mm[1]];
    const prevF = clockFields(new Date(date.getTime() - 60000));
    const old = [prevF.hh[0], prevF.hh[1], prevF.mm[0], prevF.mm[1]];
    const first = now.findIndex((d, i) => d !== old[i]);
    const hour = fields.m === 0;
    const far = hour ? 0 : DCOL[Math.max(first, 2)];
    let st = timeline(sec, far, hour);
    if (st.phase === 'rest' && st.t > 4) st = null;

    const gNew = faceGrid(now), gOld = faceGrid(old);
    const grid = [Array(16).fill(' '), Array(16).fill(' ')];
    let openCol = -1, openSrc = null, sliderCol = HOME, sdx = 0, moth = null;

    for (let col = 0; col < 16; col++) {
      // Which time does this column show? Left of the work, the old; in the
      // unzipped stretch, nothing; behind a slider coming back, the new.
      let src = gNew;
      if (st && col >= far && col < HOME) {
        if (st.phase === 'out') src = col < st.pos ? gOld : null;
        else if (st.phase === 'shim' || st.phase === 'jam' || st.phase === 'moth') src = col < st.pos ? gOld : null;
        else if (st.phase === 'back') src = col < st.pos ? gNew : null;
      }
      if (src) for (const row of [0, 1]) grid[row][col] = src[row][col];
    }
    if (st && st.phase !== 'rest') {
      sliderCol = st.pos;
      if (st.phase === 'out' && st.pos + 1 < HOME) { openCol = st.pos + 1; openSrc = gOld; }
      if (st.phase === 'back' && st.pos + 1 < HOME) { openCol = st.pos + 1; openSrc = gNew; }
      if (st.phase === 'jam') sdx = [0, -1, 0, 1][Math.floor(st.t / 0.2) % 4];
      if (st.phase === 'moth') {
        // Out of the open jacket and away, a cell per step, wings beating.
        const path = [[7, 1], [7, 1], [7, 0], [8, 1], [9, 0], [10, 0], [11, 1], [12, 0], [13, 0], [14, 1], [15, 0], [16, 0], [16, 0]];
        const i = Math.floor(st.t / 0.2);
        const [c, r] = path[Math.min(i, path.length - 1)];
        if (c < 16 && st.t > 0.2) moth = { col: c, row: r, up: i % 2 === 0 };
      }
    }

    // Allocate: the closed chain first (it is the time), then the slider,
    // then the open teeth and the moth, which may drop out.
    const alloc = new TileAllocator(lcd, 0);
    const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
    for (const row of [0, 1]) for (let col = 0; col < 16; col++) {
      const p = grid[row][col];
      if (p === ':') codes[row][col] = BEAD;
      else if (P[p]) codes[row][col] = alloc.add(P[p]) ?? 0x20;
    }
    const [sTop, sBot] = slider(tabLean(sec, st), sdx);
    codes[0][sliderCol] = alloc.add(sTop) ?? 0x20;
    codes[1][sliderCol] = alloc.add(sBot) ?? 0x20;
    if (openCol >= 0) for (const row of [0, 1]) {
      const p = openSrc[row][openCol];
      if (OPEN[p]) codes[row][openCol] = alloc.add(P[OPEN[p]]) ?? 0x20;
      else if (p === ':') codes[row][openCol] = BEAD;
    }
    if (moth) codes[moth.row][moth.col] = alloc.add(MOTH_TILES[moth.up ? 0 : 1]) ?? codes[moth.row][moth.col];
    alloc.flush();
    for (const row of [0, 1]) { lcd.setCursor(0, row); codes[row].forEach((c) => lcd.data(c)); }
  },
};
