// Marquetry: a jewelry-box lid veneered in nine wood panels, radiating
// walnut and satinwood like a sunburst inlay. The time is itself the inlay:
// bold brass "filet" wire let into the grain, HH over MM, big enough to
// span tile seams. The nine panels are the lid's own fitted tiles -- the
// classic 8-puzzle -- and one tile is always missing, showing the dark
// walnut-lined tray and felt floor beneath. When the tiles sit solved the
// brass numerals read continuously across every seam; scrambled, the wire
// is cut into fragments that read as nothing. Each minute a short, exact
// sequence of slides (the empty tray always doing the moving) carries the
// old digit's tiles out and the new digit's tiles in -- picture never
// shows a wrong number, only a true gap. On the hour the whole lid flies
// apart into a shuffle and solves itself back, puzzle-box style, then
// parks the tray in a new corner.
import * as kit from '../js/kit.js';
import { GLYPHS, BOX } from './sonnet-slidepuzzle-glyphs.js';

const N = 192;           // picture side, px (= grid side on hub-3x3)
const T = 64;             // one tile, px
const WOOD_A = kit.hex('#8a5a34');   // walnut, lit
const WOOD_B = kit.hex('#c89355');   // satinwood, lit
const WOOD_DK = kit.hex('#3c2414');  // walnut, deep groove / tray wall
const FELT = kit.hex('#1b1410');     // tray floor
const BRASS = kit.hex('#f6c66b');
const BRASS_HI = kit.hex('#fff3d6');
const BRASS_DK = kit.hex('#8a5f1e');

// ------------------------------------------------------------- the picture
// Build the 192x192 "solved" picture once per minute (digits + grain are
// static for that minute; only a slow sunburst sheen moves every frame, so
// the picture buffer excludes the sheen and we add it after the blit).
const pic = new Float32Array(3 * N * N);
let picKey = -1;
// The grain + frame never change; computing woodAt's atan2/hypot/sin for all
// 36864 pixels is the expensive part of a rebuild, so it is done once ever
// (lazily, on first use) and copied -- a plain typed-array copy is cheap --
// into `pic` before each minute's digits are stamped on top.
const grainPic = new Float32Array(3 * N * N);
let grainBuilt = false;

function woodAt(x, y) {
  // Nine-ray sunburst centred on the lid: alternating walnut/satinwood
  // wedges, with a fine straight grain running along each ray.
  const dx = x - N / 2, dy = y - N / 2;
  const ang = Math.atan2(dy, dx), rad = Math.hypot(dx, dy);
  const ray = ((ang / kit.TAU) * 18 + 18) % 18; // 18 wedges
  const wedge = Math.floor(ray) % 2;
  const base = wedge ? WOOD_A : WOOD_B;
  const grainPhase = ray - Math.floor(ray);
  const grain = 0.9 + 0.1 * Math.sin(grainPhase * Math.PI * 7 + rad * 0.35);
  const ring = 0.94 + 0.06 * Math.sin(rad * 0.21);
  return kit.scale(base, grain * ring);
}

/** Rasterise the brass digit box (W x H, from glyphs) into pic at (ox, oy), scale s. */
function stampDigit(img, d, ox, oy, s) {
  const segs = [];
  for (const path of GLYPHS[d]) {
    const p = path.pts;
    for (let k = 0; k + 1 < p.length; k++) segs.push([ox + p[k][0] * s, oy + p[k][1] * s, ox + p[k + 1][0] * s, oy + p[k + 1][1] * s]);
  }
  const wid = 4.4 * s, soft = 0.9 * s, halo = 1.4 * s, reach = wid / 2 + soft + halo;
  // bbox of this digit's ink, with margin
  let x0 = ox, y0 = oy, x1 = ox + BOX.w * s, y1 = oy + BOX.h * s;
  x0 -= reach; y0 -= reach; x1 += reach; y1 += reach;
  const px0 = Math.max(0, Math.floor(x0)), py0 = Math.max(0, Math.floor(y0));
  const px1 = Math.min(N - 1, Math.ceil(x1)), py1 = Math.min(N - 1, Math.ceil(y1));
  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) {
      let best = 1e9, bsx = 0, bsy = 0;
      for (const [ax, ay, bx, by] of segs) {
        const d2 = kit.segDist(px + 0.5, py + 0.5, ax, ay, bx, by);
        if (d2 < best) { best = d2; bsx = bx - ax; bsy = by - ay; }
      }
      if (best > reach) continue;
      const p = py * N + px, i3 = 3 * p;
      // a thin dark shellac groove around the wire first (sunk into the
      // wood, like a real boulle-work channel), so the brass pops free of
      // the grain colour whichever wedge it crosses
      const haloA = kit.clamp(1 - kit.smoothstep(wid / 2 + soft, wid / 2 + soft + halo, best)) * 0.6;
      if (haloA > 0.002) {
        img[i3] = img[i3] * (1 - haloA) + WOOD_DK[0] * haloA;
        img[i3 + 1] = img[i3 + 1] * (1 - haloA) + WOOD_DK[1] * haloA;
        img[i3 + 2] = img[i3 + 2] * (1 - haloA) + WOOD_DK[2] * haloA;
      }
      const core = 1 - kit.smoothstep(wid / 2 - soft, wid / 2 + soft, best);
      if (core <= 0.002) continue;
      // bevel: brighten the top-left edge of the wire, darken bottom-right
      const nx = -bsy, ny = bsx, nl = Math.hypot(nx, ny) || 1;
      const edge = kit.clamp((wid / 2 - best) / (wid / 2));
      const bevel = 0.6 + 0.4 * ((-nx / nl - ny / nl) * 0.5 + 0.5) * edge;
      const col = kit.mix(BRASS, kit.mix(BRASS, BRASS_HI, edge), bevel);
      img[i3] = img[i3] * (1 - core) + col[0] * core;
      img[i3 + 1] = img[i3 + 1] * (1 - core) + col[1] * core;
      img[i3 + 2] = img[i3 + 2] * (1 - core) + col[2] * core;
    }
  }
}
/** A thin brass keyline frame + corner spandrels: the lid's banding. */
function stampFrame(img) {
  const m = 7, w = 2.2;
  const put = (px, py, a) => {
    if (px < 0 || py < 0 || px >= N || py >= N) return;
    const i3 = 3 * (py * N + px);
    img[i3] = img[i3] * (1 - a) + BRASS_DK[0] * a * 0.9;
    img[i3 + 1] = img[i3 + 1] * (1 - a) + BRASS_DK[1] * a * 0.9;
    img[i3 + 2] = img[i3 + 2] * (1 - a) + BRASS_DK[2] * a * 0.9;
  };
  for (let x = 0; x < N; x++) {
    for (let k = -2; k <= 2; k++) {
      const a = kit.clamp(1 - Math.abs(k) / w);
      put(x, m + k, a * 0.5); put(x, N - 1 - m + k, a * 0.5);
    }
  }
  for (let y = 0; y < N; y++) {
    for (let k = -2; k <= 2; k++) {
      const a = kit.clamp(1 - Math.abs(k) / w);
      put(m + k, y, a * 0.5); put(N - 1 - m + k, y, a * 0.5);
    }
  }
}

function buildPicture(hh, mm) {
  if (!grainBuilt) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = woodAt(x, y), p = 3 * (y * N + x); grainPic[p] = c[0]; grainPic[p + 1] = c[1]; grainPic[p + 2] = c[2]; }
    stampFrame(grainPic);
    grainBuilt = true;
  }
  pic.set(grainPic);
  const hs = pad2(hh), ms = pad2(mm);
  // HH sits in tile row 0, columns 0-1 only (cell 2 left bare); MM sits in
  // tile row 2, columns 1-2 only (cell 6 left bare). Cells 2 and 6 and all
  // of row 1 carry no ink at all, so the empty tray can rest in any of
  // them, and a minute turn confined to that ink-free set never touches a
  // digit stroke -- the picture can never show a wrong number.
  const s = 50 / BOX.h, dw = BOX.w * s, gap = dw * 0.5;
  const rowW = dw * 2 + gap;
  const topX0 = (2 * T - rowW) / 2, botX0 = T + (2 * T - rowW) / 2;
  const topY = (T - BOX.h * s) / 2;
  const botY = N - T + (T - BOX.h * s) / 2;
  stampDigit(pic, +hs[0], topX0, topY, s);
  stampDigit(pic, +hs[1], topX0 + dw + gap, topY, s);
  stampDigit(pic, +ms[0], botX0, botY, s);
  stampDigit(pic, +ms[1], botX0 + dw + gap, botY, s);
}
const pad2 = (n) => [Math.floor(n / 10), n % 10];

function picture(hh, mm) {
  const key = hh * 60 + mm;
  if (key !== picKey) { buildPicture(hh, mm); picKey = key; }
  return pic;
}

// -------------------------------------------------------------- the puzzle
// 9 cells, row-major. perm[cell] = which source tile (0..8) sits there, or
// -1 for the empty tray. A move swaps the empty with one orthogonal
// neighbour. The whole minute's move list is derived once from the clock
// (deterministic), so frame() stays a pure function of time.
const NB = [[1, 3], [0, 2, 4], [1, 5], [0, 4, 6], [1, 3, 5, 7], [2, 4, 8], [3, 7], [4, 6, 8], [5, 7]];

function solvedPerm() { return [0, 1, 2, 3, 4, 5, 6, 7, 8]; }

/** A short legal scramble of k random-ish moves from identity, seeded by `seed`. */
function scrambleMoves(seed, k, startEmpty = 8) {
  let empty = startEmpty, moves = [];
  for (let i = 0; i < k; i++) {
    const opts = NB[empty].filter((n) => moves.length === 0 || n !== moves[moves.length - 1].from);
    const pick = opts[Math.floor(kit.hash(seed, i) * opts.length) % opts.length];
    moves.push({ from: pick, to: empty });
    empty = pick;
  }
  return moves;
}
/** Shortest hop path for the empty cell from `a` to `b` on the 3x3 grid
 * graph (BFS; the grid is small so this is cheap and exact). */
function emptyPath(a, b, adj = NB) {
  if (a === b) return [];
  const prev = new Array(9).fill(-1), seen = new Array(9).fill(false);
  seen[a] = true; let q = [a];
  while (q.length) {
    const nq = [];
    for (const c of q) for (const n of adj[c]) if (!seen[n]) { seen[n] = true; prev[n] = c; nq.push(n); }
    q = nq;
  }
  const path = []; let c = b;
  while (c !== a) { path.push(c); c = prev[c]; }
  path.reverse();
  // path is the sequence of empty-cell positions after each move; convert
  // to moves (the tile at `pos` slides into the empty, which was at prevPos)
  const moves = []; let empty = a;
  for (const pos of path) { moves.push({ from: pos, to: empty }); empty = pos; }
  return moves;
}
function applyMoves(perm0, empty0, moves) {
  let perm = perm0.slice(), empty = empty0;
  for (const mv of moves) { perm[empty] = perm[mv.from]; perm[mv.from] = -1; empty = mv.from; }
  return { perm, empty };
}

// Which two cells carry which digit, when solved (row-major tiles of the
// 192x192 picture, 3x3 of 64x64): the top digit row sits mostly in tiles
// 1,4 (col1) with its left/right strokes reaching into 0,2,3,5; bottom
// digit row into 4,7. For the minute turn we only need to know which
// *source tiles* contain ink from the minutes field, since those are the
// ones allowed to travel; everything else stays solved throughout.
// Row 0 (cells 0,1,2) carries HH and must never move during a minute turn.
// Row 1 and row 2 (cells 3-8) carry MM plus quiet grain, and are free to
// shuffle among themselves every minute.
// Ink-free cells: 2 and 6 (the bare corners of the digit rows) plus all of
// row 1 (3,4,5), induced subgraph of the 3x3 grid's adjacency (NB) on
// {2,3,4,5,6}. A minute turn's empty tray and every tile it swaps with
// stay inside this set, so a digit stroke (cells 0,1,7,8) is never moved.
const INK_FREE = [2, 3, 4, 5, 6];
const subNB = {};
for (const c of INK_FREE) subNB[c] = NB[c].filter((n) => INK_FREE.includes(n));

const plans = new Map(); // per minute-boundary plan: move list for that turn
/** A closed walk of the empty cell starting and ending at `start`, confined
 * to the ink-free set: the lid is fully solved (tray at `start`) both
 * before and after a minute turn, so turns compose cleanly minute to
 * minute and the resting picture is always the complete, true time. */
function turnPlan(M, start) {
  const key = M * 10 + start;
  if (plans.has(key)) return plans.get(key);
  const seed = Math.floor(M / 60);
  let empty = start, moves = [], last = -1;
  const n = 3 + Math.floor(kit.hash(seed, 99) * 2);
  for (let i = 0; i < n; i++) {
    const noBack = subNB[empty].filter((x) => x !== last);
    const opts = noBack.length ? noBack : subNB[empty]; // dead end (degree 1): backtrack is the only move
    const pick = opts[Math.floor(kit.hash(seed, i) * opts.length) % opts.length];
    moves.push({ from: pick, to: empty });
    last = empty; empty = pick;
  }
  moves = moves.concat(emptyPath(empty, start, subNB));
  plans.set(key, moves);
  if (plans.size > 240) { const k0 = plans.keys().next().value; plans.delete(k0); }
  return moves;
}

/** The empty tray's resting cell for the hour starting at hour-index H: one
 * of the three lower-right cells, changed by the hour show (never 0,1,2 so
 * HH is always a full, present tile). */
function parkCellFor(H) { return INK_FREE[Math.floor(kit.hash(H, 7) * INK_FREE.length) % INK_FREE.length]; }

/** Resolved tile permutation and empty-cell index at absolute seconds `t`. */
function stateAt(t) {
  const M = Math.floor(t / 60) * 60, age = t - M;
  const H = Math.floor(t / 3600);
  const park = parkCellFor(H), prevPark = parkCellFor(H - 1);
  const base = solvedPerm();
  // Identity perm with the empty tray at `cell` (always one of INK_FREE):
  // every ink-free cell's resting tile is interchangeable blank grain, so
  // simply lifting that one cell's tile out (never touching tile 8, which
  // carries the minutes' units digit) is enough -- no swap needed.
  const parked = (cell) => { const np = base.slice(); np[cell] = -1; return { perm: np, empty: cell }; };
  const hourShow = age < 10 && M % 3600 === 0;
  if (hourShow) { const from = parked(prevPark), to = parked(park); return hourState(from.perm, from.empty, to.empty, age); }
  const { perm, empty } = parked(park);
  return finishAt(perm, empty, M, age, t);
}

/** Advance perm/empty through `moves`, but stop short of the last one and
 * report the tile that is mid-flight on it (if any). */
function advancePartial(basePerm, baseEmpty, moves, k) {
  const full = Math.floor(k), frac = k - full;
  const { perm, empty } = applyMoves(basePerm, baseEmpty, moves.slice(0, full));
  if (frac <= 0.001 || full >= moves.length) return { perm, empty, sliding: null, slideT: 0 };
  const mv = moves[full];           // mv.from -> mv.to (mv.to is `empty`, the tile at mv.from is moving into it)
  const movingTile = perm[mv.from];
  const afterPerm = perm.slice(); afterPerm[mv.to] = movingTile; afterPerm[mv.from] = -1;
  return { perm: afterPerm, empty: mv.from, sliding: mv, movingTile, slideT: kit.ease.inOut(frac) };
}

function finishAt(basePerm, baseEmpty, M, age, t) {
  const minuteDur = 1.6; // seconds the minute-turn slide takes
  const moves = turnPlan(M, baseEmpty);
  if (age < minuteDur) return advancePartial(basePerm, baseEmpty, moves, age / minuteDur * moves.length);
  return { perm: basePerm, empty: baseEmpty, sliding: null, slideT: 0 };
}

/** The hour's bigger show: scramble out over ~4 s, hold briefly, solve back
 * over ~4 s, landing on the minute's true solved state (digits stay correct
 * -- only the frame tiles 0,1,2 and the untouched lower tiles travel, and we
 * never let a moving tile cross the opposite half of the grid, so by the
 * time any single move completes no digit stroke is left half-painted. */
function hourState(basePerm, baseEmpty, targetEmpty, age) {
  const outDur = 4.0, holdDur = 1.0, backDur = 4.0;
  const scramble = scrambleMoves(7, 10, baseEmpty);
  if (age < outDur) return advancePartial(basePerm, baseEmpty, scramble, age / outDur * scramble.length);
  const { perm: scrambled, empty: se } = applyMoves(basePerm, baseEmpty, scramble);
  if (age < outDur + holdDur) return { perm: scrambled, empty: se, sliding: null, slideT: 0 };
  // solve back toward the base layout, then hop the empty on to its new
  // home for the next hour.
  const unscramble = scramble.slice().reverse().map((mv) => ({ from: mv.to, to: mv.from }));
  const back = unscramble.concat(emptyPath(baseEmpty, targetEmpty));
  const t2 = age - outDur - holdDur;
  const finalPerm = (() => { const np = basePerm.slice(); np[baseEmpty] = np[targetEmpty]; np[targetEmpty] = -1; return np; })();
  if (t2 >= backDur) return { perm: finalPerm, empty: targetEmpty, sliding: null, slideT: 0 };
  return advancePartial(scrambled, se, back, t2 / backDur * back.length);
}

// ------------------------------------------------------------------ draw
const CELL_XY = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
const frameBuf = new Float32Array(3 * N * N);

/** Paint tile `srcTile` (a 64x64 block of `pic`) into `buf` at destination
 * cell (destCellX, destCellY) offset by (dxf, dyf) pixels -- a fractional
 * offset splats bilinearly over its 4 neighbouring destination pixels, so a
 * slide glides sub-pixel smooth instead of hopping. Writes are additive so
 * two tiles whose offsets overlap at a seam blend rather than clobber. */
function drawTileInto(buf, destCellX, destCellY, srcTile, dxf, dyf, now) {
  const dx0 = Math.floor(dxf), dy0 = Math.floor(dyf), fx = dxf - dx0, fy = dyf - dy0;
  const [sx, sy] = CELL_XY[srcTile];
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  // one slow diagonal highlight band sweeps the whole lid (fixed to the box,
  // not the tile), like light raking across glass over the showcase: warm,
  // soft, and faint so it reads as sheen, never a stroke of its own.
  const sweepPos = kit.fract(now * 0.045) * 2.6 - 0.8;
  for (let y = 0; y < T; y++) {
    const wy = destCellY * T + y;
    for (let x = 0; x < T; x++) {
      const srcP = 3 * ((sy * T + y) * N + (sx * T + x));
      let r = pic[srcP], g = pic[srcP + 1], b = pic[srcP + 2];
      // bevel: lighten top/left 2px edge, darken bottom/right 2px edge of each tile
      const edge = Math.min(x, y, T - 1 - x, T - 1 - y);
      if (edge < 2) {
        const tl = (x < 2 ? 1 : 0) + (y < 2 ? 1 : 0) - (x >= T - 2 ? 1 : 0) - (y >= T - 2 ? 1 : 0);
        const f = (2 - edge) / 2;
        const k = tl > 0 ? 1 + 0.5 * f : tl < 0 ? 1 - 0.4 * f : 1;
        r *= k; g *= k; b *= k;
      }
      const wx = destCellX * T + x;
      const d = Math.abs((wx + wy) / (2 * N) - sweepPos);
      const gloss = Math.max(0, 1 - d * 7) ** 2 * 0.1;
      r += gloss * 1.0; g += gloss * 0.85; b += gloss * 0.55;
      const baseX = wx + dx0, baseY = wy + dy0;
      splatPx(buf, baseX, baseY, r, g, b, w00);
      splatPx(buf, baseX + 1, baseY, r, g, b, w10);
      splatPx(buf, baseX, baseY + 1, r, g, b, w01);
      splatPx(buf, baseX + 1, baseY + 1, r, g, b, w11);
    }
  }
}
function splatPx(buf, px, py, r, g, b, a) {
  if (a <= 0 || px < 0 || py < 0 || px >= N || py >= N) return;
  const p = 3 * (py * N + px);
  buf[p] += r * a; buf[p + 1] += g * a; buf[p + 2] += b * a;
}

function drawTray(buf, cellX, cellY, now) {
  for (let y = 0; y < T; y++) {
    const dyp = cellY * T + y;
    for (let x = 0; x < T; x++) {
      const dxp = cellX * T + x;
      const edge = Math.min(x, y, T - 1 - x, T - 1 - y);
      const p = 3 * (dyp * N + dxp);
      if (edge < 3) {
        const k = (3 - edge) / 3;
        const c = kit.mix(FELT, WOOD_DK, 0.5 + 0.5 * k);
        buf[p] = c[0]; buf[p + 1] = c[1]; buf[p + 2] = c[2];
      } else {
        // felt floor: fine dark noise, a faint brass corner hinge glint
        const n = 0.9 + 0.1 * kit.noise2(x * 0.4, y * 0.4);
        buf[p] = FELT[0] * n; buf[p + 1] = FELT[1] * n; buf[p + 2] = FELT[2] * n;
      }
    }
  }
  // a small brass hinge glint in one corner of the tray, breathing slowly
  const gx = cellX * T + 8, gy = cellY * T + 8, glint = 0.5 + 0.5 * Math.sin(now * 0.6);
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    const d = Math.hypot(ox, oy); if (d > 2.2) continue;
    const px = gx + ox, py = gy + oy; if (px < 0 || py < 0 || px >= N || py >= N) continue;
    const p = 3 * (py * N + px), a = (1 - d / 2.2) * 0.5 * glint;
    buf[p] = buf[p] * (1 - a) + BRASS_DK[0] * a; buf[p + 1] = buf[p + 1] * (1 - a) + BRASS_DK[1] * a; buf[p + 2] = buf[p + 2] * (1 - a) + BRASS_DK[2] * a;
  }
}

export default {
  name: 'Marquetry', blurb: 'nine inlaid veneer tiles slide to spell the time in brass wire',
  layouts: ['hub-3x3'], look: 'smoke', fps: 60, brightness: 0.42, dither: true, warmup: 0,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const hh = ctx.date.getHours(), mm = ctx.date.getMinutes();
    picture(hh, mm);
    const st = stateAt(now);
    const flyFrom = st.sliding ? st.sliding.from : -1;
    frameBuf.fill(0);
    for (let cell = 0; cell < 9; cell++) {
      const [cx, cy] = CELL_XY[cell];
      if (cell === flyFrom) { drawTray(frameBuf, cx, cy, now); continue; } // vacated mid-flight
      const tile = st.perm[cell];
      if (tile === -1) drawTray(frameBuf, cx, cy, now);
      else {
        const jig = 0.4 * Math.sin(now * 0.8 + cell * 2.1);
        drawTileInto(frameBuf, cx, cy, tile, jig * 0.15, jig * 0.1, now);
      }
    }
    if (st.sliding) {
      const { from, to } = st.sliding;
      const [fx, fy] = CELL_XY[from], [tx, ty] = CELL_XY[to];
      const t = st.slideT, ox = (tx - fx) * T * t, oy = (ty - fy) * T * t;
      drawTileInto(frameBuf, fx, fy, st.movingTile, ox, oy, now);
    }
    kit.blitGrid(ctx, frameBuf, 1 - 0.55 * ctx.night);
  },
};
