// Kintsugi's bowls, the light on them and the way they break, all built once
// at load (flash tables).
//
// A bowl is a level map (quarter steps into a 64-colour glaze ramp) plus a
// few special codes: 255 the black lacquer tray outside the bowl, 254 and 253
// the lip, where the glaze runs thin and the body shows. Each glaze has its
// own surface, as the real ones do: celadon a two-order crackle (dark large
// cells, fine pale ones), cobalt ruri pooling in the well, red raku smoke
// clouds and carbon-black crackle, oribe copper green pooled in streams,
// black raku a soft mottle with pale pinholes.

import { noise2, hash, rand } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;
export const CX = 80, CY = 40, R_BOWL = 86;

const hx = (s) => parseInt(s.slice(1), 16);
const lerpC = (a, b, u) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const to565 = (c) => (((c >> 16) & 0xf8) << 8) | (((c >> 8) & 0xfc) << 3) | ((c & 255) >> 3);

/** 64 steps: dark -> base (step 28) -> light. */
function ramp(dark, base, light) {
  const out = new Uint16Array(64);
  for (let i = 0; i < 64; i++) out[i] = to565(i <= 28 ? lerpC(dark, base, i / 28) : lerpC(base, light, (i - 28) / 35));
  return out;
}

// Voronoi edges on a jittered grid: the crackle
function crackle(cell, seed, x, y) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  let d1 = 1e9, d2 = 1e9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.15 + 0.7 * rand(gx + i, gy + j, seed)) * cell;
      const cy = (gy + j + 0.15 + 0.7 * rand(gx + i, gy + j, seed + 1)) * cell;
      const d = Math.hypot(x - cx, y - cy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return d2 - d1;    // ~0 on an edge
}

const GLAZES = {
  seiji: {
    name: 'celadon', pal: ramp(hx('#3b5a4c'), hx('#8cb39e'), hx('#eef7ee')), lip: [hx('#8a6a48'), hx('#a88a66')],
    clay: hx('#c4a888'), key: hx('#2b2219'),
    tex: (x, y, r) => {
      let v = 112;
      if (crackle(14, 11, x, y) < 0.7) v -= 36;
      else if (crackle(7, 23, x, y) < 0.35) v -= 14;
      return v;
    },
  },
  ruri: {
    name: 'ruri', pal: ramp(hx('#0d1a44'), hx('#2c52a0'), hx('#b8d0f6')), lip: [hx('#7c8fc4'), hx('#b4c0dc')],
    clay: hx('#e2dccd'), key: hx('#120f14'),
    tex: (x, y, r) => {
      let v = 112;
      const pool = noise2(x / 17, y / 11, 7);
      if (pool > 0.68) v -= 24;
      if (rand(x, y, 31) < 0.006) v += 40;
      return v;
    },
  },
  aka: {
    name: 'red raku', pal: ramp(hx('#3e140c'), hx('#b0533a'), hx('#f6c4a0')), lip: [hx('#5a281c'), hx('#7a3c28')],
    clay: hx('#d39a6e'), key: hx('#1a0f0b'),
    tex: (x, y, r) => {
      const smoke = noise2(x / 19, y / 13, 13);
      let v = 112;
      if (smoke > 0.7) v -= 48;
      if (crackle(13, 17, x, y) < 0.65) v -= 64;
      return v;
    },
  },
  oribe: {
    name: 'oribe', pal: ramp(hx('#0f3424'), hx('#3d8a60'), hx('#c6eed2')), lip: [hx('#b8a67c'), hx('#d6c8a0')],
    clay: hx('#dcc49a'), key: hx('#14140e'),
    tex: (x, y, r) => {
      const flow = noise2(x / 26, y / 9, 19);
      let v = 112;
      if (flow > 0.66) v -= 36;
      else if (flow < 0.28) v += 24;
      return v;
    },
  },
  kuro: {
    name: 'black raku', pal: ramp(hx('#0b0908'), hx('#2b2522'), hx('#8a8076')), lip: [hx('#40342c'), hx('#584a3e')],
    clay: hx('#76563f'), key: hx('#070605'),
    tex: (x, y, r) => {
      let v = 112;
      if (noise2(x / 13, y / 9, 25) > 0.66) v += 16;
      if (rand(x, y, 33) < 0.008) v += 40;
      return v;
    },
  },
};

export const TABLE = hx('#161010');

function buildBowl(gl) {
  const L = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x + 0.5 - CX, (y + 0.5 - CY));
      const i = y * W + x;
      if (r >= R_BOWL) L[i] = 255;
      else if (r >= R_BOWL - 1.6) L[i] = 254;
      else if (r >= R_BOWL - 3.2) L[i] = 253;
      else L[i] = Math.max(0, Math.min(252, Math.round(gl.tex(x + 0.5, y + 0.5, r))));
    }
  return {
    name: gl.name, L, pal: gl.pal,
    special: Uint16Array.of(to565(gl.lip[1]), to565(gl.lip[0]), to565(TABLE)),   // 253, 254, 255
    clay: to565(gl.clay), key: to565(gl.key),
  };
}

export const BOWLS = Object.fromEntries(Object.entries(GLAZES).map(([k, g]) => [k, buildBowl(g)]));
const DAY = ['seiji', 'ruri', 'aka', 'oribe'];
/** The bowl on the table this hour: black raku by night, the day bowls in turn. */
export const bowlForHour = (h) => BOWLS[h >= 23 || h < 7 ? 'kuro' : DAY[h % 4]];

// ------------------------------------------------------------ the light

/** The one soft sheen: a shoji window mirrored in the glaze, quarter levels to add. */
export const SH_W = 34, SH_H = 18;
export const SHEEN = new Uint8Array(SH_W * SH_H);
for (let y = 0; y < SH_H; y++)
  for (let x = 0; x < SH_W; x++) {
    const qx = Math.max(0, Math.abs(x + 0.5 - SH_W / 2) - (SH_W / 2 - 6)), qy = Math.max(0, Math.abs(y + 0.5 - SH_H / 2) - (SH_H / 2 - 5));
    const e = Math.hypot(qx, qy) / 5.2;
    let v = e >= 1 ? 0 : (1 - e * e) * (1 - e * e);
    // the lattice: three bays across, a rail at the middle
    const lx = (x - 4) % 9, mid = Math.abs(y + 0.5 - SH_H / 2);
    if ((x > 4 && x < SH_W - 4 && lx === 0) || (mid < 0.8 && x > 3 && x < SH_W - 3)) v *= 0.45;
    SHEEN[y * SH_W + x] = Math.round(v * 96);
  }

/** Leaf shadows from the garden (komorebi): a wrapping 64 x 32 tile, quarter levels to take off. */
export const KT_W = 64, KT_H = 32;
export const KOMOREBI = new Uint8Array(KT_W * KT_H);
for (let y = 0; y < KT_H; y++)
  for (let x = 0; x < KT_W; x++) {
    // tileable: blend the noise with its wrapped copies
    const u = x / KT_W, v = y / KT_H;
    const n = (a, b) => noise2(a / 7, b / 6, 41) * 0.65 + noise2(a / 3.5, b / 3, 43) * 0.35;
    const t = n(x, y) * (1 - u) * (1 - v) + n(x - KT_W, y) * u * (1 - v) + n(x, y - KT_H) * (1 - u) * v + n(x - KT_W, y - KT_H) * u * v;
    const s = Math.max(0, Math.min(1, (t - 0.5) * 6));
    KOMOREBI[y * KT_W + x] = Math.round(s * 30);
  }

// ------------------------------------------------------------ the break

/**
 * The hour's shatter: impact at the bowl's centre, nine jagged radial
 * breaks and a ring break round the well. SHARD[i] is the piece a pixel
 * belongs to (255: the tray). EDGE lists the break lines (pixel, radius).
 */
export const SHARD = new Uint8Array(N);
export const NS = 12;
const RAYS = Array.from({ length: 9 }, (_, k) => (k + 0.3 + 0.4 * rand(k, 0, 51)) / 9 * Math.PI * 2);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = x + 0.5 - CX, dy = (y + 0.5 - CY), r = Math.hypot(dx, dy);
    if (r >= R_BOWL) { SHARD[i] = 255; continue; }
    let th = Math.atan2(dy, dx) + Math.PI;
    th += (noise2(r / 6, 0, 53) - 0.5) * 0.5 * Math.min(1, r / 20);
    th = ((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let k = 0;
    while (k < 9 && th > RAYS[k]) k++;
    k %= 9;
    const ring = 22 + (noise2(th * 2.2, 3, 55) - 0.5) * 12;
    SHARD[i] = r < ring ? 9 + Math.floor(k / 3) : k;
  }
const edges = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, s = SHARD[i];
    if (s === 255) continue;
    const r1 = x + 1 < W ? SHARD[i + 1] : s, r2 = y + 1 < H ? SHARD[i + W] : s;
    if ((r1 !== s && r1 !== 255) || (r2 !== s && r2 !== 255)) edges.push([i, Math.hypot(x + 0.5 - CX, y + 0.5 - CY)]);
  }
export const EDGE_I = Uint16Array.from(edges, (e) => e[0]);
export const EDGE_R = Uint8Array.from(edges, (e) => Math.round(e[1]));
export const EDGE_RANK = Uint8Array.from(edges, (e, k) => hash(k, 61) & 255);
/** A pixel on a piece's broken edge (shows the body when the piece is lifted). */
export const IS_EDGE = new Uint8Array(N);
for (const [i] of edges) { IS_EDGE[i] = 1; }
for (let i = 0; i < N; i++) {
  const s = SHARD[i];
  if (s === 255) continue;
  const x = i % W;
  if ((x > 0 && SHARD[i - 1] !== s && SHARD[i - 1] !== 255) || (i >= W && SHARD[i - W] !== s && SHARD[i - W] !== 255)) IS_EDGE[i] = 1;
}

/** Each piece's way out: unit direction from the impact through its centroid, and its distance. */
export const SHARD_DX = new Float32Array(NS), SHARD_DY = new Float32Array(NS), SHARD_DIST = new Float32Array(NS), SHARD_ORDER = new Float32Array(NS);
{
  const sx = new Float64Array(NS), sy = new Float64Array(NS), n = new Float64Array(NS);
  for (let i = 0; i < N; i++) { const s = SHARD[i]; if (s < NS) { sx[s] += i % W; sy[s] += (i / W) | 0; n[s]++; } }
  for (let s = 0; s < NS; s++) {
    const dx = sx[s] / n[s] + 0.5 - CX, dy = sy[s] / n[s] + 0.5 - CY, l = Math.hypot(dx, dy) || 1;
    SHARD_DX[s] = dx / l; SHARD_DY[s] = dy / l;
    SHARD_DIST[s] = s < 9 ? 24 + 6 * rand(s, 0, 57) : 10 + 3 * rand(s, 0, 59);
    SHARD_ORDER[s] = ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2));
  }
}

/** 4x4 ordered threshold, quarter levels 0..3 for the glaze dither and 0..15 for dissolves. */
export const B4 = Uint8Array.of(0, 2, 0, 2, 3, 1, 3, 1, 0, 2, 0, 2, 3, 1, 3, 1);
export const B16 = Uint8Array.of(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

/** Gold: 20 steps from cooled bronze to white heat. */
const GOLD_STOPS = [[0, '#3a250c'], [4, '#7a5216'], [8, '#c08a28'], [11, '#e2b040'], [14, '#f6d470'], [17, '#fdecaa'], [19, '#fffbe6']];
export const GOLD = new Uint16Array(20);
for (let k = 0; k < GOLD_STOPS.length - 1; k++) {
  const [i0, c0] = GOLD_STOPS[k], [i1, c1] = GOLD_STOPS[k + 1];
  for (let i = i0; i <= i1; i++) GOLD[i] = to565(lerpC(hx(c0), hx(c1), (i - i0) / (i1 - i0)));
}
export const CRACK = to565(hx('#120c09'));

export const BOWL_BYTES = Object.keys(BOWLS).length * (N + 128 + 8) + SH_W * SH_H + KT_W * KT_H + N * 2 + EDGE_I.length * 4 + 40;
