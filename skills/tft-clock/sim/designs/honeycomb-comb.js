// The comb of "honeycomb": two cell sizes joined by a seam of irregular
// transitional cells, as on a real frame. The hours are kept in drone comb
// (8 px cells), the minutes in worker comb (6 px cells). Everything here is
// built once at load: on the device these are flash tables.
//
//   CELL[i]   cell id of pixel i, or 0 for wax wall           (Uint16, 25.6 KB)
//   DEPTH[i]  distance from the pixel to its cell's wall, x16 (Uint8, 12.8 KB)
//   cells     per cell: centre, area, lattice, row and column
//   slotCells(slot, digit) -> the cell ids that hold that digit in that slot

import { GLYPHS } from './honeycomb-glyphs.js';

export const W = 160, H = 80, N = W * H;

// Pointy-top hexagons drawn at the pixel: '#' is wax wall. One tile holds
// two rows of cells; the second row sits half a cell to the right.
const T8 = [
  '....#...',
  '....#...',
  '....#...',
  '..##.##.',
  '.##...##',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '.##...##',
  '..##.##.',
  '....#...',
  '....#...',
];
const T6 = [
  '...#..',
  '...#..',
  '.##.##',
  '#.....',
  '#.....',
  '#.....',
  '#.....',
  '.##.##',
  '...#..',
  '...#..',
];

// Lattice placement. Cell (j, i) of a lattice has its centre pixel at
// x = ox + px*i + (j odd ? px/2 : 0), y = oy + py*j (tile row 0 / 9.5 is a centre row).
export const LAT = [
  { tile: T8, px: 8, py: 7, ox: 4, oy: 11, cy0: 0 },     // drone comb: hours
  { tile: T6, px: 6, py: 5, ox: 96, oy: 0, cy0: 9.5 },   // worker comb: minutes
];
// the hours lattice owns every cell whose centre is left of this
const SEAM = 89;

function tileWall(L, x, y) {
  const t = L.tile, w = t[0].length, h = t.length;
  const tx = (((x - L.ox) % w) + w) % w, ty = (((y - L.oy) % h) + h) % h;
  return t[ty][tx] === '#';
}

/** Flood-fill label the non-wall pixels of a wall map (4-connected). */
function label(wall) {
  const id = new Int32Array(N).fill(-1);
  let n = 0;
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (wall[s] || id[s] >= 0) continue;
    id[s] = n; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) if (q >= 0 && !wall[q] && id[q] < 0) { id[q] = n; stack.push(q); }
    }
    n++;
  }
  return { id, n };
}

function centroids(id, n) {
  const sx = new Float64Array(n), sy = new Float64Array(n), a = new Int32Array(n);
  for (let p = 0; p < N; p++) if (id[p] >= 0) { sx[id[p]] += p % W + 0.5; sy[id[p]] += ((p / W) | 0) + 0.5; a[id[p]]++; }
  return [...Array(n)].map((_, k) => ({ x: sx[k] / a[k], y: sy[k] / a[k], area: a[k] }));
}

// ---- 1. the drone lattice everywhere, to find which pixels the hours own
const wallH = new Uint8Array(N), wallM = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  wallH[y * W + x] = tileWall(LAT[0], x, y) ? 1 : 0;
  wallM[y * W + x] = tileWall(LAT[1], x, y) ? 1 : 0;
}
const lh = label(wallH), ch = centroids(lh.id, lh.n);
const ownH = new Uint8Array(N);
for (let p = 0; p < N; p++) if (lh.id[p] >= 0 && ch[lh.id[p]].x < SEAM) ownH[p] = 1;

// ---- 2. the combined wall map: drone walls touching drone cells, worker walls elsewhere
const wall = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x;
  if (ownH[p]) continue;
  let nearH = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < W && Y < H && ownH[Y * W + X]) nearH = true;
  }
  wall[p] = nearH && wallH[p] ? 1 : wallM[p];
}

// ---- 3. label the cells; slivers of the seam melt into wall
let lab = label(wall), cen = centroids(lab.id, lab.n);
for (let p = 0; p < N; p++) {
  if (lab.id[p] < 0) continue;
  const c = cen[lab.id[p]];
  if (c.area < 7 && c.x > 84 && c.x < 100) wall[p] = 1;
}
lab = label(wall); cen = centroids(lab.id, lab.n);

export const NC = lab.n + 1;                  // id 0 is the wall
export const CELL = new Uint16Array(N);
for (let p = 0; p < N; p++) CELL[p] = lab.id[p] + 1;

/** Per cell: centre (x, y), area, lattice (0 drone, 1 worker), lattice row j and column i (-99 if irregular). */
export const cells = [{ x: 0, y: 0, area: 0, lat: -1, j: -99, i: -99, full: false }];
for (let k = 0; k < lab.n; k++) {
  const c = cen[k], lat = c.x < SEAM ? 0 : 1, L = LAT[lat];
  const j = Math.round((c.y - 0.5 - L.oy - L.cy0) / L.py);
  const i = Math.round((c.x - 0.5 - L.ox - ((j & 1) ? L.px / 2 : 0)) / L.px);
  const full = c.area >= (lat === 0 ? 43 : 22);
  cells.push({ x: c.x, y: c.y, area: c.area, lat, j: full ? j : -99, i: full ? i : -99, full });
}
const byLattice = new Map();
cells.forEach((c, id) => { if (c.full) byLattice.set(`${c.lat}:${c.j}:${c.i}`, id); });

// ---- 4. depth: distance from each cell pixel to the nearest pixel outside its cell, x16
export const DEPTH = new Uint8Array(N);
export const MAXD = new Uint8Array(NC);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x, c = CELL[p];
  if (!c) continue;
  let best = 99;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const X = x + dx, Y = y + dy;
    const out = X < 0 || Y < 0 || X >= W || Y >= H ? false : CELL[Y * W + X] !== c;
    if (out) { const d = Math.sqrt(dx * dx + dy * dy); if (d < best) best = d; }
  }
  DEPTH[p] = Math.min(255, Math.round(best * 16));
  if (DEPTH[p] > MAXD[c]) MAXD[c] = DEPTH[p];
}

// ---- 4b. each wall pixel and the (up to three) cells it borders, so a cell
// can colour its own walls (fresh white wax, the ripple)
const wl = [];
for (let p = 0; p < N; p++) {
  if (CELL[p]) continue;
  const x = p % W, y = (p / W) | 0, nb = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const c = CELL[Y * W + X];
    if (c && !nb.includes(c)) nb.push(c);
  }
  while (nb.length < 3) nb.push(nb[0] ?? 0);
  wl.push(p, nb[0], nb[1], nb[2]);
}
/** Wall pixels as [pixel, cellA, cellB, cellC] quadruples (flash, ~28 KB). */
export const WALLS = Uint16Array.from(wl);

// ---- 5. where the digits sit: lattice, top row, first column of each slot
export const SLOTS = [
  { lat: 0, j0: 0, i0: 0 }, { lat: 0, j0: 0, i0: 6 },
  { lat: 1, j0: 0, i0: 0 }, { lat: 1, j0: 0, i0: 6 },
];

const SLOT_CACHE = new Map();
/** The cell ids of digit `d` in slot `s`, in glyph order (top row first). */
export function slotCells(s, d) {
  const key = s * 10 + d;
  let r = SLOT_CACHE.get(key);
  if (r) return r;
  const S = SLOTS[s], gl = GLYPHS[d];
  r = [];
  for (let row = 0; row < 9; row++) for (const col of gl[row]) {
    // odd glyph rows hold half columns (0.5, 1.5, ...): the lattice's shifted rows
    const i = S.i0 + Math.floor(col);
    const id = byLattice.get(`${S.lat}:${S.j0 + row}:${i}`);
    if (id === undefined) throw new Error(`honeycomb: no cell for slot ${s} digit ${d} row ${row} col ${col}`);
    r.push(id);
  }
  SLOT_CACHE.set(key, r);
  return r;
}

/** Every full cell of a slot's 5 x 9 box (for "near the digit" tests). */
export function slotBox(s) {
  const S = SLOTS[s], out = [];
  for (let row = 0; row < 9; row++) for (let c = 0; c < 5; c++) {
    if ((row & 1) && c === 4) continue;
    const id = byLattice.get(`${S.lat}:${S.j0 + row}:${S.i0 + c}`);
    if (id !== undefined) out.push(id);
  }
  return out;
}

/** Cell id at lattice coordinates, or 0. */
export const cellAt = (lat, j, i) => byLattice.get(`${lat}:${j}:${i}`) ?? 0;

const TOURS = new Map();
/**
 * A closed walk over the cells of digit d in slot s, one adjacent cell per
 * step (a depth-first tour of the glyph: out and back along each branch).
 * A bee tending the digit takes one step of it a second.
 */
export function tourFor(s, d) {
  const key = s * 10 + d;
  let t = TOURS.get(key);
  if (t) return t;
  const gl = GLYPHS[d], pts = [];
  for (let row = 0; row < 9; row++) for (const col of gl[row]) pts.push([row, col]);
  const ids = slotCells(s, d);
  const adj = pts.map(([r, c]) => pts.map(([r2, c2], k) => ((r === r2 && Math.abs(c - c2) === 1) || (Math.abs(r - r2) === 1 && Math.abs(c - c2) === 0.5) ? k : -1)).filter((k) => k >= 0));
  const seen = new Uint8Array(pts.length);
  t = [];
  const dfs = (k) => {
    seen[k] = 1; t.push(ids[k]);
    for (const n of adj[k]) if (!seen[n]) { dfs(n); t.push(ids[k]); }
  };
  dfs(0);
  if (t.length > 1) t.pop();          // the walk closes back on its first cell
  TOURS.set(key, t);
  return t;
}

/** A pixel near the upper left of each cell's interior, where a glint sits. */
export const SPARK = new Uint16Array(NC);
{
  const best = new Float64Array(NC).fill(1e9);
  for (let p = 0; p < N; p++) {
    const c = CELL[p];
    if (!c || DEPTH[p] < 22) continue;
    const x = p % W, y = (p / W) | 0, k = (x - cells[c].x) + (y - cells[c].y) * 1.2;
    if (k < best[c]) { best[c] = k; SPARK[c] = p; }
  }
}
