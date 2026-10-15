// Marbling: the ground, a stone bath drawn through with combs.
//
// The marbler sprinkles drops of colour over the size; each spreads until it
// meets its neighbours, so the bath is tiled with rounded stones (battal)
// with thin veins of size between them: a power diagram of the drop centres,
// built once at start-up on a 128 x 128 tile that wraps (stoneTile below):
// per tile pixel the stone (a byte) and the distance to its edge (a byte,
// 1/16 px), 32 KB of RAM. Then combs are drawn through it. Every comb stroke
// is a known displacement of the floating paint (Jaffer's marbling maths): a
// row of tines dragged by z moves a point by z * L / (d + L), d its distance
// to the nearest tine. The bath here is
//   1. the stones
//   2. a comb dragged down (the stones drawn into V's)
//   3. the same comb half a tine over, dragged back up (gel-git: feathers)
//   4. a wavy comb drawn across (the feathers undulate sideways)
// Each step moves a point along one axis by an amount that depends only on
// the other coordinate, so the inverse (which stone a screen point shows) is
// a few 1D table lookups a pixel. The tables are rebuilt every frame from
// slowly drifting parameters (bathTables), so the whole pattern keeps
// flowing: the stones creep down through the feathers, the combs breathe,
// the wave rolls, the surface wobbles. Each hour's bath is the same tile at
// a new offset, with its own combs and colours.

import { rng } from '../js/kit.js';

export const TILE = 128;
export const FX0 = -40, FXN = 240 * 4;      // comb table: x from -40 px, quarter px
const W = 160, H = 80;

// a sine table of our own: the frame's tables are built from it (and priced
// as ops), never from Math.sin
const SN = 1024, SINT = Float32Array.from({ length: SN + 1 }, (_, i) => Math.sin((i / SN) * Math.PI * 2));
export function tsin(a) {
  let u = a * (1 / (Math.PI * 2));
  u -= u | 0;
  if (u < 0) u += 1;
  const f = u * SN, i = f | 0;
  return SINT[i] + (SINT[i + 1] - SINT[i]) * (f - i);
}

function stoneTile() {
  const r = rng(4242);
  const SP = 16, N = TILE / SP, seeds = [];
  for (let gy = 0; gy < N; gy++)
    for (let gx = 0; gx < N; gx++)
      seeds.push({ x: (gx + 0.5 + (gy & 1) * 0.5 + (r() - 0.5) * 0.7) * SP, y: (gy + 0.5 + (r() - 0.5) * 0.7) * SP, w: (r() * 8) ** 2, c: 0 });
  const wrap = (d) => (d > TILE / 2 ? d - TILE : d < -TILE / 2 ? d + TILE : d);
  // colours: a stone avoids the colours of the neighbours already placed
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i], used = new Set();
    for (let j = 0; j < i; j++) { const t = seeds[j]; if (wrap(t.x - s.x) ** 2 + wrap(t.y - s.y) ** 2 < (SP * 1.45) ** 2) used.add(t.c); }
    const free = [1, 2, 3, 4].filter((c) => !used.has(c));
    s.c = free.length ? free[Math.floor(r() * free.length)] : 1 + Math.floor(r() * 4);
  }
  const n = TILE * TILE, id = new Uint8Array(n), e = new Uint8Array(n);
  for (let j = 0; j < TILE; j++)
    for (let i = 0; i < TILE; i++) {
      const px = i + 0.5, py = j + 0.5;
      let best = 0, bd = 1e9;
      for (let k = 0; k < seeds.length; k++) {
        const s = seeds[k], d = wrap(px - s.x) ** 2 + wrap(py - s.y) ** 2 - s.w;
        if (d < bd) { bd = d; best = k; }
      }
      const a = seeds[best], ax = wrap(px - a.x), ay = wrap(py - a.y);
      let e1 = 1e9, e2 = 1e9;
      for (let k = 0; k < seeds.length; k++) {
        if (k === best) continue;
        const t = seeds[k], bx = wrap(t.x - a.x), by = wrap(t.y - a.y), L = Math.hypot(bx, by);
        if (L > SP * 3) continue;
        const pb = (ax - bx) ** 2 + (ay - by) ** 2 - t.w, pa = ax * ax + ay * ay - a.w;
        const dist = (pb - pa) / (2 * L);
        if (dist < e1) { e2 = e1; e1 = dist; } else if (dist < e2) e2 = dist;
      }
      // a smooth minimum of the two nearest edges: the corners round off, as drops do
      const K = 2.6, hm = Math.max(0, K - Math.abs(e1 - e2)) / K;
      const m = j * TILE + i, ed = Math.min(e1, e2) - hm * hm * K * 0.25;
      id[m] = best; e[m] = Math.max(0, Math.min(255, Math.round(ed * 16)));
    }
  const emax = new Float32Array(seeds.length);
  for (let m = 0; m < n; m++) if (e[m] / 16 > emax[id[m]]) emax[id[m]] = e[m] / 16;
  return { id, e, col: Uint8Array.from(seeds.map((s) => s.c)), emax, sy: Float32Array.from(seeds.map((s) => s.y)), n: seeds.length };
}
/** Built once at start-up (on the device: at boot, ~0.5 M integer ops; 32 KB of RAM). */
export const STONES = stoneTile();

/** One hour's bath: where it sits on the tile, its combs, when its drops land. */
export function makeBath(seed) {
  const r = rng(seed * 7919 + 17);
  const S = 19 + Math.floor(r() * 5);
  const b = {
    seed, S, off1: r() * S, z1: 13 + r() * 4, z2: -(10 + r() * 3), L: 4.5,
    a3: 3.4 + r() * 1.4, P3: 38 + r() * 14, ph3: r() * 6.28,
    tx: Math.floor(r() * TILE), ty: Math.floor(r() * TILE),
  };
  // a fresh bath is sprinkled from the top down, with some scatter
  b.land = Float32Array.from({ length: STONES.n }, (_, i) => {
    const y = (((STONES.sy[i] - b.ty) % TILE) + TILE) % TILE;
    return 0.1 + (y / TILE) * 1.0 + r() * 0.35;
  });
  return b;
}

/** A set of per-frame tables (one per world being drawn). */
export function newTables() {
  return { F: new Float32Array(FXN), XR: new Float32Array(H), A: new Float32Array(H), WY: new Float32Array(W), drift: 0, flat: true };
}

/**
 * Fill a world's tables for time T. How far the combs have been drawn is a0
 * (0 plain stones, 1 fully feathered); during a comb pass the rows above the
 * tines (at yT) have reached a1. Returns the ops it took (for the estimate).
 */
export function bathTables(b, T, a0, a1, yT, tab) {
  const S = b.S, L = b.L, F = tab.F, flat = !(yT > -20 && yT < H + 20) || a0 === a1;
  tab.flat = flat;   // one comb amount for every row: F is pre-scaled by it
  const br = 1 + 0.12 * tsin(T * 0.21 + b.seed);              // the combs breathe
  const z1 = b.z1 * br, z2 = b.z2 * (2 - br);
  const o1 = b.off1 + 1.6 * tsin(T * 0.13), o2 = o1 + S / 2;   // and wander sideways
  for (let i = 0; i < FXN; i++) {
    const x = FX0 + i / 4;
    let d1 = (x - o1) % S; if (d1 < 0) d1 += S; if (d1 > S / 2) d1 = S - d1;
    let d2 = (x - o2) % S; if (d2 < 0) d2 += S; if (d2 > S / 2) d2 = S - d2;
    F[i] = ((z1 * L) / (d1 + L) + (z2 * L) / (d2 + L)) * (flat ? a0 : 1);
  }
  // per row: the wavy comb's sideways shift and the surface's own wobble (XR),
  // and how far the combs have been drawn there (A)
  const ph = b.ph3 + T * 0.35, w = (2 * Math.PI) / b.P3;
  for (let y = 0; y < H; y++) {
    const yy = y + 0.5, u = (yT - yy) / 14, a = a0 + (a1 - a0) * (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
    tab.A[y] = a;
    tab.XR[y] = 0.9 * tsin(0.11 * y + 0.61 * T) - b.a3 * (0.25 + 0.75 * (a < 1 ? a : 1)) * tsin(yy * w + ph);
  }
  // (the tile offsets folded in: XR is the row's x shift on the tile)
  for (let y = 0; y < H; y++) tab.XR[y] += b.tx;
  // per column: the surface's wobble the other way, the stones' creep down
  // through the feathers, and the tile offset (WY is the column's y shift on the tile)
  const drift = (T * 1.4) % TILE;
  for (let x = 0; x < W; x++) tab.WY[x] = 0.9 * tsin(0.07 * x + 0.53 * T + 2) + 0.45 * tsin(0.045 * x - 0.37 * T + 1.3) - drift + b.ty + 256;
  return FXN * 12 + H * 26 + W * 22 + 40;
}
