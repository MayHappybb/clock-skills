// The sheet for ukiyoe.js: what the colour blocks print behind the waves.
//
// Like xray's maps, the ground is a material map, one byte a pixel, built
// once (flash, 12.8 KB): bits 0-5 a block index (24 bokashi steps of sky with
// the ordered dither baked in, Fuji's blocks, the far sea), bit 6 washi
// fibre (the paper shows through the ink a shade paler), bit 7 a mica flake
// (kirazuri: lit only when the sheen passes). Each season is a palette of
// those indices, 128 RGB565 entries, so a whole print is re-coloured by
// swapping a table, the way a publisher re-issued a print with new blocks.

import { to565, R, G, B, rand, mix } from '../js/kit.js';

const W = 160, H = 80;
export const SKY_N = 24;
export const I_FUJI = 24, I_FUJI_DARK = 25, I_SNOW = 26, I_SNOW_SHADE = 27, I_FOOT = 28, I_FARSEA = 29, I_FARSEA_LINE = 30, I_SEA = 31;
export const I_WAVE = 32, I_WKEY = 36, I_WFOAM = 37, I_WSTREAK = 38;   // 32-35: the wave block's bokashi, pale crest to deep foot
export const HORIZON = 66, SEA_Y = 69;
export const FUJI_X = 86, FUJI_TOP = 46;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Fuji's half-width at row y (concave flanks, a flat summit). */
export const fujiHalf = (y) => (y < FUJI_TOP ? -1 : 2.4 + 0.27 * Math.pow(y - FUJI_TOP, 1.5));
/** The snow line: ragged tongues running down the gullies. */
const snowLine = (x) => {
  const u = x - FUJI_X;
  const tongue = Math.max(0, 1 - Math.abs(((u + 40) % 4.6) - 2.3) / 2.3);
  return FUJI_TOP + 6.2 + 3.4 * tongue * tongue + 1.2 * rand(Math.floor(u + 50), 9);
};

export const MAP = new Uint8Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, th = BAYER[((y & 3) << 2) | (x & 3)];
    let idx;
    if (y >= SEA_Y) idx = I_SEA;
    else if (y >= HORIZON) idx = y === HORIZON + 1 && (x * 7 + y) % 9 < 5 ? I_FARSEA_LINE : I_FARSEA;
    else {
      const hw = fujiHalf(y + 0.5), dx = Math.abs(x + 0.5 - FUJI_X);
      if (dx < hw) {
        if (y + 0.5 < snowLine(x + 0.5)) idx = x + 0.5 > FUJI_X + 0.6 * hw ? I_SNOW_SHADE : I_SNOW;
        else if (y >= HORIZON - 3) idx = I_FOOT;
        else idx = ((x * 5 + Math.floor(y / 3)) % 7 === 0) || (x + 0.5 > FUJI_X + 0.55 * hw && (x + y) % 3 === 0) ? I_FUJI_DARK : I_FUJI;
      } else {
        // the sky: bokashi down from the top, a warm one up from the horizon
        const p = y < 34 ? 0.5 * smooth(y / 26) : 0.5 + 0.5 * smooth((y - 40) / 26);
        idx = Math.min(SKY_N - 1, Math.floor(p * (SKY_N - 1) + th));
      }
    }
    MAP[i] = idx;
  }
// ------------------------------------------------------------ the two waves
// Outlines as chains of quadratic curves, clockwise. The great wave rises
// from the left edge and breaks to the right, its lip and claws hanging over
// Fuji; the far wave answers it from the right edge, breaking left.

function chain(start, segs) {
  const pts = [start];
  let [x, y] = start;
  for (const [cx, cy, bx, by, lip] of segs) {
    for (let i = 1; i <= 12; i++) {
      const u = i / 12, v = 1 - u;
      pts.push([v * v * x + 2 * v * u * cx + u * u * bx, v * v * y + 2 * v * u * cy + u * u * by, lip ? 1 : 0]);
    }
    x = bx; y = by;
  }
  return pts;
}
const L = (bx, by, lip = 0) => [bx, by, bx, by, lip];
export const WAVES = [
  { // the great wave: hours
    pts: chain([-3, 84], [L(-3, 20), [9, 12, 30, 7.5], [44, 3, 57, 5, 1], [71, 2.5, 80, 11, 1], [85, 15, 82, 21, 1], [77, 20, 71.5, 20.5, 1],
      [66, 33, 70, 47], [72, 63, 94, 71], L(94, 84)]),
    top: 4, bot: 30, lean: 1,
  },
  { // the far wave: minutes
    pts: chain([163, 84], [L(163, 27), [152, 24, 138, 24.5], [127, 22, 121, 24, 1], [112, 21, 107.5, 27, 1], [104.5, 31.5, 108, 33.5, 1], [111, 32, 114, 32.5, 1],
      [115.5, 45, 114, 57], [112.5, 66, 99, 71], L(99, 84)]),
    top: 22, bot: 46, lean: -1,
  },
];

/** Signed distance to a wave's outline (negative inside); sets near.lip, near.u (index along the outline), near.nx/ny. */
function waveDist(w, px, py, near) {
  const p = w.pts;
  let d = 1e9, inside = false;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a[1] > py) !== (b[1] > py) && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    let u = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = px - a[0] - u * dx, ey = py - a[1] - u * dy, e = Math.sqrt(ex * ex + ey * ey);
    if (e < d) { d = e; near.lip = a[2] && b[2]; near.u = i - 1 + u; }
  }
  return inside ? -d : d;
}

export const CLAW_RANK = new Uint8Array(W * H);   // 0: not a claw; else ((phase << 2) | rank) + 1, rank 0-3 out from the lip
export const CLAW_IDX = new Uint8Array(W * H);    // the claw's own block index when it is out
export const CLAW_TIPS = [];                      // [x, y, lean, phase] where each talon ends: the spray flies from there
{
  const near = { lip: 0, u: 0 };
  const WD = new Float32Array(W * H), WL = new Uint8Array(W * H), WU = new Float32Array(W * H), WI = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let best = 1e9;
      WAVES.forEach((w, k) => {
        const d = waveDist(w, x + 0.5, y + 0.5, near);
        if (d < best) { best = d; WL[i] = near.lip ? 1 : 0; WU[i] = near.u; WI[i] = k; }
      });
      WD[i] = best;
    }
  for (let y = 0; y < SEA_Y; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, d = WD[i];
      if (d > 0) continue;
      const w = WAVES[WI[i]], th = BAYER[((y & 3) << 2) | (x & 3)];
      if (d > -1) { MAP[i] = I_WKEY; continue; }
      // the lip: a band of foam whose lower edge is scalloped into lace
      const lace = 2.1 + 1.3 * Math.abs(Math.sin(WU[i] * 0.9));
      if (WL[i] && d > -lace) { MAP[i] = I_WFOAM; continue; }
      if (WL[i] && d > -lace - 1) { MAP[i] = I_WKEY; continue; }
      // streaks: pale lines following the outline, broken
      const brk = (WU[i] * 0.21 + Math.floor(-d / 3) * 0.37) % 1;
      if ((-d >= 4.5 && -d < 5.5 || -d >= 8 && -d < 9) && brk < 0.6) { MAP[i] = I_WSTREAK; continue; }
      const step = Math.max(0, Math.min(3, Math.floor(((y - w.top) / (w.bot - w.top)) * 3 + th)));
      MAP[i] = I_WAVE + step;
    }
  // claws: talons along each lip, outward, bending the way the wave breaks
  let phase = 0;
  for (const w of WAVES) {
    const p = w.pts;
    let acc = 0;
    for (let i = 1; i < p.length; i++) {
      if (!(p[i][2] && p[i - 1][2])) continue;
      const sx = p[i][0] - p[i - 1][0], sy = p[i][1] - p[i - 1][1], sl = Math.hypot(sx, sy);
      acc += sl;
      if (acc < 3.3) continue;
      acc = 0;
      // outward normal: the great wave's outline runs clockwise on screen, the far wave's the other way
      const sg = w.lean > 0 ? 1 : -1, nx = (sg * sy) / sl, ny = (-sg * sx) / sl;
      if (ny > 0.75) continue;   // not on the underside
      const ph = phase++ & 63, lean = w.lean;
      const len = 3.6 + 1.6 * rand(ph, 31);
      let bx = p[i][0], by = p[i][1];
      for (let q = 0; q <= len * 4; q++) {
        const s2 = q / 4, bend = Math.min(1, 0.15 + 0.5 * (s2 / len));
        let dx = nx * (1 - bend) + lean * bend * 0.8, dy = ny * (1 - bend) + bend * 0.7;
        const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
        bx += dx / 4; by += dy / 4;
        const r = 1.2 * (1 - s2 / len) + 0.45;
        for (let oy = -2; oy <= 2; oy++)
          for (let ox = -2; ox <= 2; ox++) {
            const X = Math.floor(bx) + ox, Y = Math.floor(by) + oy;
            if (X < 0 || Y < 0 || X >= W || Y >= SEA_Y) continue;
            const j = Y * W + X;
            if (WD[j] <= 0) continue;
            const e = Math.hypot(X + 0.5 - bx, Y + 0.5 - by);
            if (e > r + 0.9) continue;
            const rank = Math.min(3, Math.floor(s2 / (len / 4)));
            const idx = e <= r - 0.1 ? I_WFOAM : I_WKEY;
            if (CLAW_RANK[j] && ((CLAW_RANK[j] - 1) & 3) <= rank && CLAW_IDX[j] === I_WFOAM) continue;
            CLAW_RANK[j] = ((ph << 2) | rank) + 1; CLAW_IDX[j] = idx;
          }
      }
      CLAW_TIPS.push([bx, by, lean, ph]);
    }
  }
}

// washi fibre: short wandering strands, mostly horizontal
for (let n = 0; n < 340; n++) {
  let x = rand(n, 1) * W, y = rand(n, 2) * H, a = (rand(n, 3) - 0.5) * 0.9;
  const len = 3 + rand(n, 4) * 7;
  for (let s = 0; s < len; s++) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) MAP[iy * W + ix] |= 64;
    a += (rand(n, s + 10) - 0.5) * 0.6;
    x += Math.cos(a); y += Math.sin(a) * 0.6;
  }
}
// mica flakes, sparse, in the sky only
for (let i = 0; i < W * H; i++) if ((MAP[i] & 63) < SKY_N && rand(i, 77) < 0.11) MAP[i] |= 128;

// ------------------------------------------------------------ the seasons
// sky top (the bokashi block), paper, horizon tint, Fuji, its dark, snow,
// snow shade, foot, far sea, sea
export const SEASONS = [
  { name: 'spring', crest: 0x5f8cc0, deep: 0x1f3e78, top: 0xc4687e, paper: 0xf0e4cf, hor: 0xeec6b4, fuji: 0x5f7ea2, fujiD: 0x4b6688, snow: 0xf7f2e6, snowS: 0xd8dce4, foot: 0x56805e, far: 0x88a8c4, sea: 0x5f88b4 },
  { name: 'summer', crest: 0x4c7cb4, deep: 0x1a3670, top: 0x24477c, paper: 0xeee0c4, hor: 0xebc297, fuji: 0x55779c, fujiD: 0x3f5f84, snow: 0xf7f2e6, snowS: 0xd5dbe6, foot: 0x4a7650, far: 0x7fa2c2, sea: 0x4e7cac },
  { name: 'autumn', crest: 0x4a76ac, deep: 0x1a3268, top: 0xb2402c, paper: 0xf0dcb8, hor: 0xe8a868, fuji: 0xb8452c, fujiD: 0x8c3020, snow: 0xf4ecdc, snowS: 0xe0cfc0, foot: 0x3c5a3a, far: 0x88a2b8, sea: 0x4c7aa6 },
  { name: 'winter', crest: 0x6a88a8, deep: 0x2a4060, top: 0x4c505e, paper: 0xe4e1d8, hor: 0xa8b0bc, fuji: 0xf2f2ee, fujiD: 0x8092ac, snow: 0xfafaf8, snowS: 0xc8d0dc, foot: 0x6e7c8c, far: 0x9cb0c4, sea: 0x5a7e9e },
];

function lift(c, k) { return mix(c, 0xffffff, k); }
function nightOf(c) {
  // a moonlit re-issue: the same blocks pulled in indigo, lights kept pale
  const l = (0.3 * R(c) + 0.59 * G(c) + 0.11 * B(c)) / 255;
  const ink = mix(0x0e1430, 0x3c4c7c, l), pale = mix(0x6a7aa8, 0xd6dcec, (l - 0.7) / 0.3);
  return l > 0.7 ? pale : mix(ink, 0x4a5a8c, l * 0.4);
}

/** A palette: 128 RGB565 entries, the index plus 64 for fibre. Also returns the glint colour. */
function palette(s, night) {
  const base = new Array(64).fill(0);
  for (let k = 0; k < SKY_N; k++) {
    const p = k / (SKY_N - 1);
    base[k] = p < 0.5 ? mix(s.top, s.paper, p * 2) : mix(s.paper, s.hor, (p - 0.5) * 2);
  }
  base[I_FUJI] = s.fuji; base[I_FUJI_DARK] = s.fujiD; base[I_SNOW] = s.snow; base[I_SNOW_SHADE] = s.snowS;
  base[I_FOOT] = s.foot; base[I_FARSEA] = s.far; base[I_FARSEA_LINE] = lift(s.far, 0.45); base[I_SEA] = s.sea;
  for (let k = 0; k < 4; k++) base[I_WAVE + k] = mix(s.crest, s.deep, k / 3);
  base[I_WKEY] = 0x1b1a26; base[I_WFOAM] = 0xf6f1e4; base[I_WSTREAK] = mix(s.crest, 0xffffff, 0.25);
  let cols = base;
  if (night) {
    cols = base.map(nightOf);
    for (let k = 0; k < SKY_N; k++) cols[k] = mix(0x0a0f28, 0x222c52, smooth(k / (SKY_N - 1)));
    cols[I_SNOW] = 0xc8d2ea; cols[I_SNOW_SHADE] = 0x8e9cc0;
    for (let k = 0; k < 4; k++) cols[I_WAVE + k] = mix(0x5274b0, 0x2c4a88, k / 3);
    cols[I_WKEY] = 0x060814; cols[I_WFOAM] = 0xdce4f4; cols[I_WSTREAK] = 0x7e9ccc;
  }
  const t = new Uint16Array(128);
  for (let k = 0; k < 64; k++) {
    t[k] = to565(cols[k]);
    t[k + 64] = to565(night ? mix(cols[k], 0x8090c0, 0.12) : mix(cols[k], 0xfffaf0, k < SKY_N && k < 12 ? 0.16 : 0.1));
  }
  return { t, glint: to565(night ? 0xe8ecff : 0xfffef6), glintSoft: to565(night ? 0x9aa6d0 : 0xfff6dc) };
}
export const PALS = SEASONS.map((s) => palette(s, false));
export const PALS_NIGHT = SEASONS.map((s) => palette(s, true));

// ------------------------------------------------------------ the cartouche
// The weekday, cut in a carved hand: 日 月 火 水 木 金 土, 7 x 8.
const K = (rows) => rows.map((r) => [...r].map((c) => c === '#'));
export const KANJI = [
  K(['.......', '#######', '#.....#', '#.....#', '#######', '#.....#', '#.....#', '#######']),
  K(['..#####', '..#...#', '..#####', '..#...#', '..#####', '..#...#', '.#....#', '#....##']),
  K(['...#...', '.#.#.#.', '#..#..#', '...#...', '...#...', '..#.#..', '.#...#.', '#.....#']),
  K(['...#...', '...#..#', '##.#.#.', '.#.##..', '.#.#.#.', '#..#..#', '...#...', '..##...']),
  K(['...#...', '...#...', '#######', '..###..', '.#.#.#.', '#..#..#', '...#...', '...#...']),
  K(['...#...', '..#.#..', '.#...#.', '#######', '...#...', '.#####.', '.#.#.#.', '#######']),
  K(['.......', '...#...', '...#...', '.#####.', '...#...', '...#...', '...#...', '#######']),
];
/** The publisher's seal, 6 x 6, white lines carved in vermilion. */
export const SEAL = K(['######', '#.#..#', '#.##.#', '#....#', '##.#.#', '######']);
