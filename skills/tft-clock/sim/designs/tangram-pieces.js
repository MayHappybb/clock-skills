// Tangram: the seven pieces, and an exact-cover solver that tiles a drawn
// silhouette with them. Everything here runs once at load; on the device the
// results are flash tables (per layout: 14 pieces x {type, x, y, angle, side}).
//
// Units: one "cell" c is the side of the small square. In these units the
// set is: square SQ 1x1, small triangles ST (legs 1), medium triangle MT
// (hypotenuse 2), big triangles BT (legs 2), parallelogram PG (sides 1 and
// sqrt 2). A set covers 8 cells; a digit uses two sets (16 cells).
//
// Silhouettes are drawn on the cell grid, each cell one character:
//   '#' full   '.' empty   '7' '9' '1' '3' a half cell, the right angle at
//   that corner as on a numeric keypad (7 top-left, 9 top-right, 1 bottom-
//   left, 3 bottom-right).
// Each cell is four quarter triangles (0 top, 1 right, 2 bottom, 3 left);
// every piece placed on the grid with axis or 45-degree edges is a union of
// quarters, so tiling is an exact cover of quarters.

export const CANON = {
  BT: [[0, 0], [2, 0], [0, 2]],
  MT: [[0, 0], [2, 0], [1, 1]],
  PG: [[0, 0], [1, 0], [2, 1], [1, 1]],
  ST: [[0, 0], [1, 0], [0, 1]],
  SQ: [[0, 0], [1, 0], [1, 1], [0, 1]],
};
/** The canonical polygons, centred on their centroid (the vertex mean is the centroid for all five). */
export const LOCAL = {};
for (const [k, v] of Object.entries(CANON)) {
  const mx = v.reduce((s, p) => s + p[0], 0) / v.length, my = v.reduce((s, p) => s + p[1], 0) / v.length;
  LOCAL[k] = v.map(([x, y]) => [x - mx, y - my]);
}
/** Rotational symmetry of each piece, in 45-degree steps. */
export const SYM = { BT: 8, MT: 8, PG: 4, ST: 8, SQ: 2 };
/** One set, in the order its pieces are listed everywhere: colour keys. */
export const SET = ['BTa', 'BTb', 'MT', 'PG', 'STa', 'STb', 'SQ'];
export const typeOf = (key) => key.slice(0, 2);

const HALF = { '#': [1, 1, 1, 1], '.': [0, 0, 0, 0], ' ': [0, 0, 0, 0], 7: [1, 0, 0, 1], 9: [1, 1, 0, 0], 1: [0, 0, 1, 1], 3: [0, 1, 1, 0] };
const QC = [[0.5, 1 / 6], [5 / 6, 0.5], [0.5, 5 / 6], [1 / 6, 0.5]];   // quarter centroids in a cell

export function parseMask(rows) {
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const q = new Uint8Array(W * H * 4);
  let area = 0;
  rows.forEach((r, y) => {
    for (let x = 0; x < W; x++) {
      const f = HALF[r[x] ?? '.'];
      if (!f) throw new Error(`tangram mask: bad char '${r[x]}'`);
      for (let k = 0; k < 4; k++) { q[(y * W + x) * 4 + k] = f[k]; area += f[k]; }
    }
  });
  return { W, H, q, area: area / 4 };
}

function inside(poly, px, py) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(c) < 1e-9) return false;
    const sg = c > 0 ? 1 : -1;
    if (s === 0) s = sg; else if (s !== sg) return false;
  }
  return true;
}

/** Orientations on the grid of each type: polygons with integer vertices, min at 0, plus the mirror flag. */
const ORIENTS = {};
for (const [k, v] of Object.entries(CANON)) {
  const seen = new Set(), list = [];
  for (let m = 0; m < 2; m++)
    for (let r = 0; r < 4; r++) {
      let p = v.map(([x, y]) => [m ? -x : x, y]);
      for (let i = 0; i < r; i++) p = p.map(([x, y]) => [-y, x]);
      const mx = Math.min(...p.map((a) => a[0])), my = Math.min(...p.map((a) => a[1]));
      p = p.map(([x, y]) => [x - mx, y - my]);
      const key = p.map((a) => a.join(',')).sort().join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      // the quarters it covers, relative
      const w = Math.max(...p.map((a) => a[0])), h = Math.max(...p.map((a) => a[1]));
      const qs = [];
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) for (let qq = 0; qq < 4; qq++)
        if (inside(p, cx + QC[qq][0], cy + QC[qq][1])) qs.push([cx, cy, qq]);
      list.push({ poly: p, mir: m, w, h, qs });
    }
  ORIENTS[k] = list;
}

/** Signed area sign of a polygon (y down): used to tell a parallelogram's chirality. */
function chir(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; }
  return a;
}

/**
 * The transform that maps a piece's LOCAL polygon onto `verts` (cell units)
 * with the mirror flag `mir` (0 front up, 1 turned over): {x, y, ang (in
 * 45-degree steps), mir}, or null if that side can't make this footprint.
 */
export function fitTransform(type, verts, mir) {
  const L = LOCAL[type];
  const cx = verts.reduce((s, p) => s + p[0], 0) / verts.length, cy = verts.reduce((s, p) => s + p[1], 0) / verts.length;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4, c = Math.cos(ang), s = Math.sin(ang);
    let ok = true;
    for (const [lx0, ly] of L) {
      const lx = mir ? -lx0 : lx0;
      const x = cx + c * lx - s * ly, y = cy + s * lx + c * ly;
      if (!verts.some(([vx, vy]) => Math.abs(vx - x) < 1e-6 && Math.abs(vy - y) < 1e-6)) { ok = false; break; }
    }
    if (ok) return { x: cx, y: cy, ang: a, mir };
  }
  return null;
}

/**
 * Tile a silhouette with two sets. `side` 0 or 1: which face is up, which
 * fixes the parallelograms' chirality; -1 allows either. Returns the best tiling as 14 pieces
 * {key, set, x, y, ang, mir}, in SET order for set 0 then set 1.
 */
export function solveMask(rows, side, { cap = 4000, sets = 2 } = {}) {
  const M = parseMask(rows), { W, H, q } = M;
  if (Math.abs(M.area - 8 * sets) > 1e-9) throw new Error(`tangram mask area ${M.area}, wants ${8 * sets}: ${rows.join('|')}`);
  const NQ = W * H * 4;
  const need = { BT: 2 * sets, MT: sets, PG: sets, ST: 2 * sets, SQ: sets };
  // placements
  const P = [];   // {type, qs: Int32Array, poly}
  for (const type of ['BT', 'MT', 'PG', 'SQ', 'ST']) {
    for (const o of ORIENTS[type]) {
      if (type === 'PG' && side >= 0 && (chir(o.poly) > 0) !== (side === 0)) continue;
      for (let ty = 0; ty + o.h <= H; ty++)
        for (let tx = 0; tx + o.w <= W; tx++) {
          const qs = o.qs.map(([cx, cy, qq]) => ((ty + cy) * W + tx + cx) * 4 + qq);
          if (qs.every((i) => q[i])) P.push({ type, qs, poly: o.poly.map(([x, y]) => [x + tx, y + ty]) });
        }
    }
  }
  const cover = Array.from({ length: NQ }, () => []);
  P.forEach((p, id) => { for (const i of p.qs) cover[i].push(id); });
  const used = new Uint8Array(NQ), cnt = { ...need }, stack = [], sols = [];
  let steps = 0;
  const rec = (start) => {
    if (sols.length >= cap || steps > 3e6) return;
    steps++;
    let i = start;
    while (i < NQ && (!q[i] || used[i])) i++;
    if (i >= NQ) { sols.push(stack.slice()); return; }
    for (const id of cover[i]) {
      const p = P[id];
      if (!cnt[p.type]) continue;
      if (p.qs.some((k) => used[k])) continue;
      for (const k of p.qs) used[k] = 1;
      cnt[p.type]--; stack.push(id);
      rec(i + 1);
      stack.pop(); cnt[p.type]++;
      for (const k of p.qs) used[k] = 0;
    }
  };
  rec(0);
  if (!sols.length) throw new Error(`tangram: no tiling (side ${side}) for ${rows.join('|')}`);
  // score: same-colour pieces should not touch; choose the colour split per tiling
  let best = null, bestScore = Infinity;
  for (const sol of sols) {
    const owner = new Int16Array(NQ).fill(-1);
    sol.forEach((id, n) => { for (const k of P[id].qs) owner[k] = n; });
    // shared edge counts between pieces
    const adj = new Map();
    const touch = (a, b) => { if (a < 0 || b < 0 || a === b) return; const k = a < b ? a * 64 + b : b * 64 + a; adj.set(k, (adj.get(k) ?? 0) + 1); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const b = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) touch(owner[b + k], owner[b + ((k + 1) & 3)]);
      if (x + 1 < W) touch(owner[b + 1], owner[b + 4 + 3]);
      if (y + 1 < H) touch(owner[b + 2], owner[b + W * 4]);
    }
    const types = sol.map((id) => P[id].type);
    const idx = (t) => types.map((tt, n) => (tt === t ? n : -1)).filter((n) => n >= 0);
    const bts = idx('BT'), sts = idx('ST');
    const pairsOf = (arr) => { const out = []; const n = arr.length; for (let m = 0; m < 1 << n; m++) if (popc(m) === n / 2) out.push(m); return out; };
    for (const mb of pairsOf(bts)) for (const ms of pairsOf(sts)) {
      const key = new Array(sol.length);
      types.forEach((t, n) => { key[n] = t === 'BT' ? (mb >> bts.indexOf(n) & 1 ? 'BTa' : 'BTb') : t === 'ST' ? (ms >> sts.indexOf(n) & 1 ? 'STa' : 'STb') : t; });
      let s = 0;
      for (const [k, e] of adj) { const a = (k / 64) | 0, b = k % 64; if (key[a] === key[b]) s += e * 10; }
      // small preference: the big triangles low and wide (stable), squares not on the outline
      if (s < bestScore) { bestScore = s; best = { sol, key }; }
    }
  }
  // sets: of each colour key's pair, the upper (then left) piece is set 0
  const pieces = best.sol.map((id, n) => ({ key: best.key[n], poly: P[id].poly }));
  const out = [];
  for (let set = 0; set < sets; set++) for (const key of SET) {
    const mine = pieces.filter((p) => p.key === key).map((p) => ({ ...p, c: centroid(p.poly) }))
      .sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
    const p = mine[set];
    const t0 = fitTransform(typeOf(key), p.poly, 0), t1 = fitTransform(typeOf(key), p.poly, 1);
    const tf = side === 1 ? t1 : side === 0 ? t0 : t0 ?? t1;
    if (!tf) throw new Error('tangram: fit failed ' + key);
    out.push({ key, set, ...tf, alt: tf === t0 ? t1 : t0 });
  }
  out.score = bestScore; out.count = sols.length;
  return out;
}

const popc = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const centroid = (p) => [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length];

/**
 * The puzzle's own rest: each set packed into its square (side 2 sqrt 2
 * cells), the classic solution, turned 45 degrees to the grid. `side` picks
 * the mirror image so the parallelogram fits face up or face down. Origin:
 * the square's top-left corner.
 */
export function packedSquare(side) {
  const s = 1 / Math.SQRT2;   // the classic layout is drawn on a 4 x 4 grid of half-diagonals
  const L = [
    ['BTa', [[0, 0], [4, 0], [2, 2]]],
    ['BTb', [[0, 0], [2, 2], [0, 4]]],
    ['MT', [[4, 4], [4, 2], [2, 4]]],
    ['PG', [[0, 4], [1, 3], [3, 3], [2, 4]]],
    ['STa', [[4, 0], [4, 2], [3, 1]]],
    ['STb', [[2, 2], [3, 3], [1, 3]]],
    ['SQ', [[2, 2], [3, 1], [4, 2], [3, 3]]],
  ];
  for (const flipX of [false, true]) {
    const out = [];
    let ok = true;
    for (const [key, vs] of L) {
      const v = vs.map(([x, y]) => [(flipX ? 4 - x : x) * s, y * s]);
      const tf = fitTransform(typeOf(key), v, side);
      if (!tf) { ok = false; break; }
      out.push({ key, set: 0, ...tf, alt: fitTransform(typeOf(key), v, 1 - side) });
    }
    if (ok) return out;
  }
  throw new Error('tangram: packed square');
}
