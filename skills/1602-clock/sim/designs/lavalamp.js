// Lava lamp — the module stood on its end, as a lamp.
//
// The module is turned a quarter turn (`rotate: 90`): 16 dots wide, 80 tall.
// It is a desk lamp, not a clock. A big blob of wax domes up out of the pool
// at the bottom, stretches a neck that thins and lets go, rises as a teardrop,
// slows and spreads under the cap as it cools, then sinks back and melts into
// the pool. A smaller drop does the same half a cycle behind, so the two pass
// each other in the middle of the globe, and when their lanes cross they
// merge for a moment and pull apart. Every trip draws its own lane, size,
// pause and turning height from noise keyed on the cycle number; about one in
// four gives up halfway. At about a dot every half second the motion is as
// slow as the glass wants.
//
// The wax is two or three metaballs on a compact kernel, evaluated at the real
// dot centres in mm (`portraitMM`), so blobs are round on the glass and the
// seams between rows of cells cut them as the glass does.
//
// Budget. Everything but the wax is free: the cap and foot are ROM 0xff, the
// ribs on the cap and base are ROM '|' (on its side it is a line across the
// cell), and the settled pool is 0xff. Inside the globe a full cell is 0xff
// and an empty one a space, so only the cells on a blob's edge cost a slot.
// Heights are what decide it. A row of cells is 3.55 mm, so anything taller
// than 7.1 mm can touch four rows, and a big blob across both columns is then
// eight tiles alone; the big blob is held under that (six at most, eight with
// its neck), and the small drop is rounder, under 3.55 mm, so it stays within
// two rows of one column. The first version used taller teardrops and
// snapped a cell in 4% of frames. If a frame still wants a ninth tile, the
// small drop shrinks a little, and as a last resort the cell closest to full
// or empty is snapped to it: over 15 minutes that happens in 2 frames, one
// dot each.
//
// Tried and dropped: solid cap and base blocks (the pool merged into the
// base), and blobs a third the size, which read as specks.

import { TileAllocator, portraitTile, portraitMM, noise, smoothNoise, ease, clamp } from '../js/kit.js';

const FPS = 8;
const W = 16, H = 80;

// Viewer rows of cells (5 dots each): the cap, the globe, the pool, the base.
const CAP_ROWS = 2;              // rows 0-1
const POOL_ROW = 12;             // the settled wax
const BASE_ROW = 13;             // rows 13-15

// Dot centres in mm, gaps included, so blobs are round on the real glass.
const MM = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => portraitMM(x, y)));
const X_MM = MM[0][15].x;                          // 10.85: the glass's width
const Y_OF = (y) => MM[y][0].y;
const GLOBE_TOP = Y_OF(CAP_ROWS * 5);              // first dot under the cap
const POOL_Y = Y_OF(POOL_ROW * 5) - 0.35;          // the pool's surface, just above its first dot row

// ---------------------------------------------------------------- the field

// A compact metaball kernel: 1 at the centre, 0 at twice the radius. Alone, a
// blob's edge is where the kernel falls to ISO, at exactly its radius.
const kernel = (d2) => (d2 >= 4 ? 0 : (1 - d2 / 4) ** 2);
const ISO = kernel(1);

/** Field of one ellipse at (x, y) mm. */
const blobField = (b, x, y) => kernel(((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2);

/** The pool: solid below its surface, falling off over `POOL_SOFT` mm above it. */
const POOL_SOFT = 0.9;
const poolField = (y) => (y >= POOL_Y ? 1 : kernel((1 + (POOL_Y - y) / POOL_SOFT) ** 2));

// ---------------------------------------------------------------- the blobs

/**
 * One blob's life, as ellipses at time `T`. It waits in the pool a while,
 * domes up out of it, stretches a neck that thins and lets go, rises as a
 * teardrop, slows and spreads under the cap as it cools, then sinks back,
 * round, and flattens into the pool. Every cycle draws its own lane, size,
 * wait, and how high it gets (some give up halfway) from noise keyed on the
 * cycle number, so no two trips are the same.
 */
function blobAt(T, seed, period, offset, small = false) {
  const k = Math.floor((T + offset) / period);
  const n = (i) => noise(k * 7.13 + i, seed);
  const wait = small ? 0.05 + n(6) * 0.3 : n(6) * 0.08;   // the share of the cycle spent in the pool
  const u = ((T + offset) / period - k - wait) / (1 - wait);
  if (u < 0) return [];

  const lane = small ? (n(1) < 0.5 ? 2.45 : 8.4) : 3 + n(1) * 4.85;     // centre x of the rise, mm
  const top = small ? lane : n(2) < 0.5 ? lane + (n(3) - 0.5) * 3 : X_MM / 2 + (n(3) - 0.5) * 2;
  const size = small ? 0.9 + n(4) * 0.2 : 1.6 + n(4) * 0.35;
  const hiY = n(5) < 0.25 ? GLOBE_TOP + 10 + n(7) * 6 : GLOBE_TOP + 2.2 + n(5) * 2.5;
  const R = 1.5 * size;                            // half-width of the blob when it is round
  const W = (smoothNoise(T * 0.3, seed + 9) - 0.5) * 1.4;   // a slow sideways wander once it is free
  const DOMED = POOL_Y - 1.4 * size;               // its centre when the dome is fully up

  const BUD = 0.10, PINCH = 0.20, RISE = 0.55, COOL = 0.68;
  const out = [];
  let x = lane, y, rx = R, ry;
  if (u < BUD) {                                   // a dome comes up out of the pool
    const p = ease.inOutQuad(u / BUD);
    ry = (1.2 + p * 0.8) * size; y = POOL_Y + 1.35 * size + (DOMED - POOL_Y - 1.35 * size) * p;
  } else if (u < PINCH) {                          // the neck stretches, thins and lets go
    const p = (u - BUD) / (PINCH - BUD);
    ry = (2.0 - p * 0.2) * size; y = DOMED - p * 2.4 * size;
    const bottom = y + ry * 0.9, w = (1 - p) ** 0.7;
    if (w > 0.3) out.push({ x, y: (bottom + POOL_Y) / 2, rx: R * 0.75 * w + 0.2, ry: (POOL_Y - bottom) / 2 + 1.2 });
  } else if (u < RISE) {                           // rises, a teardrop whose tail shortens
    const p = ease.inOutQuad((u - PINCH) / (RISE - PINCH));
    const y0 = DOMED - 2.4 * size;
    ry = 1.8 * size; y = y0 + (hiY - y0) * p;
    x = lane + (top - lane) * ease.inQuad(p) + W * Math.min(1, p * 3);
    const tail = 1 - Math.min(1, p * 5);
    if (tail > 0) out.push({ x, y: y + ry * 0.95, rx: R * 0.55, ry: ry * 0.45 * tail + 0.3 });
  } else if (u < COOL) {                           // cools under the cap, spreading
    const p = ease.inOutQuad((u - RISE) / (COOL - RISE));
    x = top + W; y = hiY + p * 0.6; rx = R * (1 + p * 0.4); ry = (1.8 - p * 0.3) * size;
  } else {                                         // sinks, round, and flattens into the pool
    const p = ease.inOutQuad((u - COOL) / (1 - COOL));
    const y0 = hiY + 0.6, y1 = POOL_Y + 2.2 * size;
    x = top + (lane - top) * p * 0.4 + W; y = y0 + (y1 - y0) * p;
    const land = clamp((p - 0.85) / 0.15, 0, 1);  // the last stretch, spreading on the surface
    rx = R * (1.4 - p * 0.25 + land * 0.4); ry = (1.5 + 0.3 * p - land * 0.6) * size;
  }
  const lim = (v, r) => clamp(v, r * 0.8, X_MM - r * 0.8);
  out.forEach((e) => { e.x = lim(e.x, e.rx); });
  out.push({ x: lim(x, rx), y, rx, ry });
  // Small drops are rounder, so they never span more than two rows of cells.
  if (small) out.forEach((e) => { e.ry *= 0.8; });
  return out;
}

/** The globe at second `T` of the day, as 16x80 dots. */
export function picture(T, shrink = 1) {
  const px = Array.from({ length: H }, () => new Uint8Array(W));
  const small = blobAt(T, 2, 83, 41.5, true).map((e) => ({ ...e, rx: e.rx * shrink, ry: e.ry * shrink }));
  const blobs = [...blobAt(T, 1, 83, 0), ...small];
  for (let y = CAP_ROWS * 5; y < BASE_ROW * 5; y++) {
    for (let x = 0; x < W; x++) {
      const { x: mx, y: my } = MM[y][x];
      let f = poolField(my);
      for (const b of blobs) f += blobField(b, mx, my);
      if (f >= ISO) px[y][x] = 1;
    }
  }
  return px;
}

// ------------------------------------------------------------ the emitter

const view = (px, vc, vr) => Array.from({ length: 5 }, (_, i) =>
  Array.from({ length: 8 }, (_, x) => (px[vr * 5 + i][vc * 8 + x] ? '#' : '.')).join(''));

/**
 * Write the 16x80 picture: full cells are ROM 0xff, empty ones a space, the
 * rest tiles. If a frame ever wants more than eight tiles, the cells closest
 * to full or empty are snapped to it, least visible first, until it fits.
 */
/** Cells of a picture, and how many distinct tiles its partial cells need. */
function cellsOf(px) {
  const cells = [];
  for (let vr = 0; vr < 16; vr++) for (const vc of [0, 1]) {
    const v = view(px, vc, vr);
    const lit = v.join('').split('#').length - 1;
    cells.push({ vc, vr, v, lit, key: v.join('/') });
  }
  return cells;
}
const tilesOf = (cells) => new Set(cells.filter((c) => c.vr >= CAP_ROWS && c.vr < BASE_ROW && c.lit > 0 && c.lit < 40).map((c) => c.key)).size;

function emit(lcd, cells) {
  const partial = () => tilesOf(cells);
  let snapped = 0;
  while (partial() > 8) {
    const c = cells.filter((c) => c.lit > 0 && c.lit < 40).sort((a, b) => Math.min(a.lit, 40 - a.lit) - Math.min(b.lit, 40 - b.lit))[0];
    snapped = Math.max(snapped, Math.min(c.lit, 40 - c.lit));
    c.lit = c.lit < 20 ? 0 : 40;
  }
  const alloc = new TileAllocator(lcd, 0);
  const codes = [Array(16).fill(0x20), Array(16).fill(0x20)];
  for (const c of cells) {
    if (c.vr < CAP_ROWS || c.vr >= BASE_ROW) { codes[c.vc][c.vr] = c.vr === 0 || c.vr === 15 ? 0xff : 0x7c; continue; }
    codes[c.vc][c.vr] = c.lit === 40 ? 0xff : c.lit === 0 ? 0x20 : alloc.add(portraitTile(c.v)) ?? 0x20;
  }
  alloc.flush();
  for (const [row, vc] of [[0, 1], [1, 0]]) {
    lcd.setCursor(0, row);
    for (let vr = 0; vr < 16; vr++) lcd.data(codes[vc][vr]);
  }
  lcd.lavaSnapped = snapped;     // dots lost to snapping, worst cell: for the bench check
  return alloc;
}

// -------------------------------------------------------------- the design

export default {
  name: 'Lava lamp',
  blurb: 'Portrait. A lava lamp: wax buds from the pool, pinches off, rises, cools under the cap and sinks back.',
  bus: 'i2c100',
  panel: 'amber',
  fps: FPS,
  rotate: 90,

  frame(lcd, api, { fields }) {
    const T = fields.h * 3600 + fields.m * 60 + fields.s + fields.ms / 1000;
    // Over budget? The small blob gives way first, shrinking a little.
    let cells;
    for (const shrink of [1, 0.93, 0.86, 0.8]) if (tilesOf(cells = cellsOf(picture(T, shrink))) <= 8) break;
    emit(lcd, cells);
  },
};
