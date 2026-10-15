// The Life engine for conway.js: B3/S23 on byte grids, the patterns a Life
// player knows (Gosper gun, eater 1, glider, oscillators), the garden (the
// gun, its stream and the eater, and the oscillators) recorded as a 30-phase
// table, and the reaction "movies" the minute turn plays: a glider deleting a
// block, and two gliders synthesising one.
//
// Everything here is computed once at load from the patterns by running the
// real rule; on the device these are const tables in flash (the garden as
// 30 bit-packed 80 x 40 frames, 12 KB; the movies a few hundred bytes).

export const CW = 80, CH = 40;                       // the universe on the glass: 80 x 40 cells of 2 x 2 px

/**
 * One generation of B3/S23 on a w x h byte grid (dead outside). `dst` may not
 * be `src`. If `allow` is given, cells where allow[i] is 0 are forced dead
 * (a quenched zone). Returns the live count.
 */
export function lifeStep(src, dst, w, h, allow = null) {
  let pop = 0;
  for (let y = 0; y < h; y++) {
    const r0 = (y - 1) * w, r1 = y * w, r2 = (y + 1) * w, top = y > 0, bot = y < h - 1;
    // running column sums: a = column x-1, b = column x, c = column x+1
    let a = 0;
    let b = (top ? src[r0] : 0) + src[r1] + (bot ? src[r2] : 0);
    for (let x = 0; x < w; x++) {
      const c = x < w - 1 ? (top ? src[r0 + x + 1] : 0) + src[r1 + x + 1] + (bot ? src[r2 + x + 1] : 0) : 0;
      const i = r1 + x, me = src[i], n = a + b + c - me;
      let v = n === 3 || (me && n === 2) ? 1 : 0;
      if (allow !== null && !allow[i]) v = 0;
      dst[i] = v; pop += v;
      a = b; b = c;
    }
  }
  return pop;
}

/** Stamp a pattern (rows of 'O' / '.') into a grid at (ox, oy). */
export function stamp(grid, w, h, rows, ox, oy) {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++)
      if (rows[y][x] === 'O') {
        const X = ox + x, Y = oy + y;
        if (X >= 0 && Y >= 0 && X < w && Y < h) grid[Y * w + X] = 1;
      }
}

export const GUN = [
  '........................O...........',
  '......................O.O...........',
  '............OO......OO............OO',
  '...........O...O....OO............OO',
  'OO........O.....O...OO..............',
  'OO........O...O.OO....O.O...........',
  '..........O.....O.......O...........',
  '...........O...O....................',
  '............OO......................',
];
export const EATER = ['OO..', 'O.O.', '..O.', '..OO'];
export const GLIDER_SE = ['.O.', '..O', 'OOO'];
const PENTADECATHLON = ['..O....O..', 'OO.OOOO.OO', '..O....O..'];

// ------------------------------------------------------------ the garden

/** Where things stand in the universe (cells). */
export const GUN_AT = [7, 1];
export const EATER_AT = [53, 33];
/** The stream's lane: glider cells keep 18 <= x - y <= 21 from the gun to the eater. */
export const LANE = [18, 21];
const OSC = [
  [PENTADECATHLON, 64, 31],
];

const M = 8, GW = CW + 2 * M, GH = CH + 2 * M;
export { M as GARDEN_M, GW as GARDEN_W, GH as GARDEN_H };
/** The whole garden domain (with its margin) at phase 0. */
export const GARDEN_FULL0 = new Uint8Array(GW * GH);
/** 30 phases of the garden on the glass, one byte a cell; phase p = generation mod 30. */
export const GARDEN = [];
/** Every cell the garden ever touches over its period (for the hour's keep-out). */
export const GARDEN_ENV = new Uint8Array(CW * CH);
{
  let a = new Uint8Array(GW * GH), b = new Uint8Array(GW * GH);
  stamp(a, GW, GH, GUN, GUN_AT[0] + M, GUN_AT[1] + M);
  stamp(a, GW, GH, EATER, EATER_AT[0] + M, EATER_AT[1] + M);
  for (const [p, x, y] of OSC) stamp(a, GW, GH, p, x + M, y + M);
  // run until the stream reaches the eater and everything settles into period 30
  for (let t = 0; t < 600; t++) { lifeStep(a, b, GW, GH); [a, b] = [b, a]; }
  GARDEN_FULL0.set(a);
  for (let p = 0; p < 30; p++) {
    const f = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) f[y * CW + x] = a[(y + M) * GW + x + M];
    for (let i = 0; i < f.length; i++) GARDEN_ENV[i] |= f[i];
    GARDEN.push(f);
    lifeStep(a, b, GW, GH); [a, b] = [b, a];
  }
}

// ------------------------------------------------------------ symmetry

/** The 8 symmetries of the square: (x, y) -> [a*x + b*y, c*x + d*y]. */
export const SYM = [
  [1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1],
  [0, 1, 1, 0], [0, -1, 1, 0], [0, 1, -1, 0], [0, -1, -1, 0],
];

// ------------------------------------------------------------ reaction movies

/**
 * A reaction recorded once: `frames[k]` is the list of live cells (flat
 * x, y pairs, relative to the block's top-left cell) at generation k, from
 * the moment the gliders are free until the result is settled; `gliders`
 * holds each incoming glider's own 4 free phases and its direction, so any
 * generation before 0 is the glider moved back along its path; `at` is the
 * generation the block is gone (deletion) or settled (synthesis).
 */
function record(setup, blockAt, settleTest) {
  const S = 64, a0 = new Uint8Array(S * S);
  const gl = [];
  for (const [rows, x, y, dx, dy, pre] of setup) {
    let g = new Uint8Array(S * S), t = new Uint8Array(S * S);
    stamp(g, S, S, rows, x, y);
    for (let i = 0; i < pre; i++) { lifeStep(g, t, S, S); [g, t] = [t, g]; }
    const ph = [];
    let p = g;
    for (let k = 0; k < 4; k++) { ph.push(cellsOf(p, S, blockAt)); const n = new Uint8Array(S * S); lifeStep(p, n, S, S); p = n; }
    gl.push({ ph, dx, dy });
    for (let i = 0; i < a0.length; i++) a0[i] |= g[i];
  }
  const frames = [];
  let a = a0, b = new Uint8Array(S * S), at = -1;
  for (let k = 0; k < 120; k++) {
    frames.push(cellsOf(a, S, blockAt));
    if (settleTest(a, S, k)) { at = k; break; }
    lifeStep(a, b, S, S); [a, b] = [b, a];
  }
  return { frames, gliders: gl, at };
}
function cellsOf(g, S, [bx, by]) {
  const out = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g[y * S + x]) out.push(x - bx, y - by);
  return Int8Array.from(out);
}
const popOf = (g) => { let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n; };

/** A glider flying south-east into a block: both vanish in a short puff. */
export const DELETE = (() => {
  const B = [32, 32];
  const m = record([[['OO', 'OO'], B[0], B[1], 0, 0, 0], [GLIDER_SE, B[0] - 7, B[1] - 7, 1, 1, 0]], B, (g) => popOf(g) === 0);
  m.gliders = m.gliders.slice(1);
  // generation at which the block is first disturbed (from then on the movie owns it)
  return m;
})();

/**
 * Two gliders from the same side (south-east and south-west, both coming
 * down from above) meet and leave one block. Found by search over lanes and
 * phases; the block lands at the movie's origin.
 */
export const SYNTH = (() => {
  // canonical (from the search): SE glider at (30,30), NE glider at (26,50) after 4 generations,
  // which settles to a block at (39,39). Transposed (x <-> y) both come down from above.
  const T = (rows) => rows[0].split('').map((_, x) => rows.map((r) => r[x]).join(''));
  const NE = ['OOO', '..O', '.O.'];
  const B = [39, 39];
  const m = record([[T(GLIDER_SE), 30, 30, 1, 1, 0], [T(NE), 50, 26, -1, 1, 4]], B, (g, S) => {
    if (popOf(g) !== 4) return false;
    return g[B[1] * S + B[0]] && g[B[1] * S + B[0] + 1] && g[(B[1] + 1) * S + B[0]] && g[(B[1] + 1) * S + B[0] + 1];
  });
  return m;
})();
