// The pool: flat turquoise water with two drifting caustic nets, the Deco
// tile coping, and the palette (day and night).

import { hash, to565 } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// 1930s Technicolor aquacade: turquoise water in three flat tones (water,
// caustic net, the bright knots where two nets cross), a darker teal for
// anything under the surface (the chorus seen through the water), white
// splash, the troupe's scarlet caps (gold for the kaleidoscope), skin and
// navy suits, and a cream tiled coping. By night the pool lights are on:
// the water goes deep teal, the tiles grey, the caps and splash stay lit.
const DAY = {
  water: 0x35b6c3, caust: 0x5ccbd0, bright: 0x9ae4df, deep: 0x1f8ba2,
  white: 0xf4fbf6, cap: 0xe63c2c, gold: 0xf6c12a, skin: 0xf2ae86, suit: 0x1c2a66,
  tile: 0xede1c4, grout: 0xb6a988, edge: 0x1d7183,
};
const NIGHT = {
  water: 0x0f5b6f, caust: 0x1a788a, bright: 0x35a3ad, deep: 0x0a4253,
  white: 0xdff3ef, cap: 0xe8452f, gold: 0xf2bf3a, skin: 0xe7a882, suit: 0x0e1638,
  tile: 0x5e5b52, grout: 0x3e3c36, edge: 0x072f3b,
};
const KEYS = Object.keys(DAY);

function mixc(a, b, u) {
  const k = (u * 256) | 0, j = 256 - k;
  const r = (((a >> 16) & 255) * j + ((b >> 16) & 255) * k) >> 8;
  const g = (((a >> 8) & 255) * j + ((b >> 8) & 255) * k) >> 8;
  const bl = ((a & 255) * j + (b & 255) * k) >> 8;
  return (r << 16) | (g << 8) | bl;
}

/** The palette at night level `n` (0 day .. 1 night): 0xRRGGBB colours. */
export function palette(n) {
  const p = {};
  for (const k of KEYS) p[k] = n <= 0 ? DAY[k] : n >= 1 ? NIGHT[k] : mixc(DAY[k], NIGHT[k], n);
  return p;
}
export { mixc };

// ------------------------------------------------------------ caustic nets (flash: 2 x 4 KB)

const T = 64;
function net(seed, n) {
  const sx = [], sy = [];
  for (let i = 0; i < n; i++) { sx.push((hash(seed, i, 1) % 6400) / 100); sy.push((hash(seed, i, 2) % 6400) / 100); }
  const out = new Uint8Array(T * T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (let i = 0; i < n; i++) {
        let dx = Math.abs(x + 0.5 - sx[i]), dy = Math.abs(y + 0.5 - sy[i]);
        if (dx > T / 2) dx = T - dx;
        if (dy > T / 2) dy = T - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      out[y * T + x] = d2 - d1 < 1.25 ? 1 : 0;
    }
  return out;
}
const NET_A = net(11, 11), NET_B = net(23, 9);
const WOB_A = new Int8Array(H), WOB_B = new Int8Array(H);
const LUT = new Uint16Array(3);

/**
 * The water: every pixel is net A + net B (0, 1 or 2) through three flat
 * tones. The nets drift in different directions and each row wobbles a
 * pixel or two, so the light crawls over the floor like real caustics.
 * `glow` (0..1) lifts the tones toward the bright knots (the hour's light).
 */
export function water(g, t, p, sin, glow = 0) {
  LUT[0] = to565(glow > 0 ? mixc(p.water, p.caust, glow * 0.35) : p.water);
  LUT[1] = to565(glow > 0 ? mixc(p.caust, p.bright, glow * 0.6) : p.caust);
  LUT[2] = to565(glow > 0 ? mixc(p.bright, p.white, glow * 0.7) : p.bright);
  const ax = Math.floor(t * 4.1), ay = Math.floor(t * 1.6), bx = Math.floor(-t * 2.7), by = Math.floor(t * 3.3);
  for (let y = 0; y < H; y++) {
    WOB_A[y] = Math.round(1.6 * sin(y * 0.21 + t * 1.3));
    WOB_B[y] = Math.round(1.4 * sin(y * 0.17 - t * 1.1 + 2));
  }
  const buf = g.buf;
  for (let y = 0; y < H; y++) {
    const ra = ((y + ay) & 63) << 6, rb = ((y + by) & 63) << 6, oa = ax + WOB_A[y], ob = bx + WOB_B[y];
    let i = y * W;
    for (let x = 0; x < W; x++, i++) buf[i] = LUT[NET_A[ra + ((x + oa) & 63)] + NET_B[rb + ((x + ob) & 63)]];
  }
  g.cost.px += N; g.cost.box += N * 3;
}

/** The coping: two rows of cream tiles with grout, and the dark waterline tile, all round. */
export function coping(g, p) {
  const tile = p.tile, grout = p.grout, edge = p.edge;
  g.fillRect(0, 0, W, 2, tile); g.fillRect(0, H - 2, W, 2, tile);
  g.fillRect(0, 0, 2, H, tile); g.fillRect(W - 2, 0, 2, H, tile);
  for (let x = 5; x < W - 2; x += 6) { g.fillRect(x, 0, 1, 2, grout); g.fillRect(x, H - 2, 1, 2, grout); }
  for (let y = 5; y < H - 2; y += 6) { g.fillRect(0, y, 2, 1, grout); g.fillRect(W - 2, y, 2, 1, grout); }
  g.rect(2, 2, W - 4, H - 4, edge);
}
