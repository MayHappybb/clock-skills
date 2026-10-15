// Block Lights: the street, as 1-bit masks built once at load (flash on the
// device). Two blocks of flats across the road at night, a lift core
// between them, a far block in the gap, the sky over the low block with a
// water tank, a crescent moon and a few stars, the city's glow in the sky
// as an ordered dither that thickens toward the horizon.
//
// Everything here is 0/1: 1 is lamp light (ink), 0 the night (ground).

import { hash } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ the window grid
// A window is 3 x 4 px of glass; mullions 1 px, floor slabs 1 px: a pitch
// of 4 x 5. Both blocks share it, so a numeral is the same size on each.
export const WW = 3, WH = 4, PX = 4, PY = 5;

/** The two blocks. `slots` are where the numerals sit, in window cells. */
export const BLOCKS = [
  // the tower: tall, left, the hours
  { x0: 3, y0: 8, cols: 17, rows: 13, wall: [0, 5, 72, 73], slots: [{ c0: 1, r0: 1 }, { c0: 9, r0: 1 }] },
  // the low block: right, the minutes, a floor lower and set down the street
  { x0: 89, y0: 19, cols: 18, rows: 12, wall: [87, 16, 73, 62], slots: [{ c0: 1, r0: 1 }, { c0: 9, r0: 1 }] },
];

/** The lift core between them: a shaft of glass, the car a lit box. */
export const CORE = { x0: 72, x1: 78, y0: 1, shaftX: 74, shaftY0: 4, shaftY1: 76 };
export const STREET_Y = 78;

// ------------------------------------------------------------ the sky

const BAYER8 = (() => {
  const b = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return Uint8Array.from(b);
})();
export const bayer8 = (x, y) => BAYER8[((y & 7) << 3) | (x & 7)];

/** 1 where the pixel is open sky (fireworks and the plane only show there). */
export const SKY = new Uint8Array(W * H);
/**
 * The sky's glow as a threshold per pixel: lit when the glow (0..255) is
 * above it. 255 never lights. Sweeping the glow down is a dither front.
 */
export const SKYT = new Uint8Array(W * H).fill(255);
/** The street with everything that never changes, glow off. */
export const BASE = new Uint8Array(W * H);

const inRect = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
const FAR = [79, 40, 9, 38];   // the far block in the gap
const TANK = { x0: 100 };

function solid(x, y) {
  if (y >= STREET_Y) return true;
  for (const b of BLOCKS) if (inRect(x, y, b.wall)) return true;
  if (x >= CORE.x0 && x <= CORE.x1 && y >= CORE.y0) return true;
  if (inRect(x, y, FAR)) return true;
  return false;
}

const set = (m, x, y, v = 1) => { if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = v; };

(function build() {
  for (let y = 0; y < H; y++) {
    const dens = 0.02 + 0.24 * Math.pow(y / 78, 1.8);
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      const i = y * W + x;
      SKY[i] = 1;
      const b = (bayer8(x, y) + 0.5) / 64;
      SKYT[i] = Math.min(255, Math.round((255 * b) / dens));
    }
  }
  // the moon, a crescent lit from the right, over the low block
  const mx = 146, my = 7;
  for (let y = 0; y < 15; y++)
    for (let x = 136; x < 156; x++) {
      const d1 = (x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2, d2 = (x + 0.5 - (mx - 2.6)) ** 2 + (y + 0.5 - (my - 1.2)) ** 2;
      const i = y * W + x;
      if (d1 <= 5.2 * 5.2) { SKYT[i] = 255; SKY[i] = 0; if (d2 > 4.6 * 4.6) BASE[i] = 1; }
    }
  // stars, where the glow is thinnest
  for (let k = 0; k < 22; k++) {
    const x = hash(k, 7) % W, y = hash(k, 8) % 16;
    const i = y * W + x;
    if (SKY[i] && SKYT[i] === 255 || (SKY[i] && SKYT[i] > 200)) {
      if (x > 134 && x < 158 && y < 15) continue;
      BASE[i] = 1; SKYT[i] = 0;
    }
  }
  // the water tank on the low block: cone roof, hooped tank lit on the moon side, legs and bracing
  const TANK_ART = [
    '......#......',
    '.....#o#.....',
    '....#ooo#....',
    '...#ooooo##..',
    '..##########.',
    '..#oooooo##..',
    '..#oooooo##..',
    '..#########..',
    '..#oooooo##..',
    '..#oooooo##..',
    '..#########..',
    '...#..#..#...',
    '...##.#.##...',
    '...#.###.#...',
    '...#..#..#...',
    '...#..#..#...',
  ];
  TANK_ART.forEach((row, y) => [...row].forEach((ch, dx) => {
    if (ch === '.') return;
    const x = TANK.x0 + dx, i = y * W + x;
    SKY[i] = 0; SKYT[i] = 255; BASE[i] = ch === '#' ? 1 : 0;
  }));
  // rooflines: a lit coping on each block and the core
  for (let x = 0; x < 72; x++) set(BASE, x, 5);
  for (let x = 87; x < W; x++) set(BASE, x, 16);
  // the lift core: a motor room on top, then a glass shaft between two dotted rails
  for (let x = CORE.x0; x <= CORE.x1; x++) set(BASE, x, CORE.y0);
  set(BASE, CORE.x0, CORE.y0 + 1); set(BASE, CORE.x1, CORE.y0 + 1); set(BASE, CORE.x1, CORE.y0 + 2);
  for (let y = CORE.shaftY0; y < STREET_Y; y++) if (y & 1) { set(BASE, CORE.shaftX - 1, y); set(BASE, CORE.shaftX + 3, y); }
  for (let y = 17; y < STREET_Y; y += 2) set(BASE, W - 1, y);                 // the low block runs on past the edge
  // aerials on the tower
  for (const [ax, top] of [[17, 0], [51, 1]]) {
    for (let y = top; y < 5; y++) set(BASE, ax, y);
    for (let x = ax - 2; x <= ax + 2; x++) set(BASE, x, top + 1);
    for (let x = ax - 1; x <= ax + 1; x++) set(BASE, x, top + 3);
  }
  // the far block: a handful of tiny lit windows
  for (let k = 0; k < 7; k++) {
    const x = FAR[0] + 1 + (hash(k, 31) % 3) * 3, y = FAR[1] + 2 + (hash(k, 32) % 9) * 4;
    set(BASE, x, y); set(BASE, x, y + 1);
  }
  for (let x = FAR[0]; x < FAR[0] + FAR[2]; x++) set(BASE, x, FAR[1]);
  // the tower's lobby: a lit entrance with a canopy
  for (let x = 24; x < 40; x++) set(BASE, x, 72);
  for (let y = 74; y < 78; y++) for (let x = 27; x < 37; x++) if (x !== 31 && x !== 32) set(BASE, x, y);
  // the kerb, dashed
  for (let x = 0; x < W; x++) if ((x & 3) !== 3) set(BASE, x, STREET_Y);
})();

// ------------------------------------------------------------ windows

/**
 * Every window of both blocks: its top-left pixel, the block and cell, and
 * what it is: a numeral cell (slot, gc, gr), or a flat that may light up in
 * the background (bg), or a flat that stays dark (moat round a numeral).
 */
export const WINDOWS = [];
(function list() {
  BLOCKS.forEach((b, bi) => {
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++) {
        const x = b.x0 + c * PX, y = b.y0 + r * PY;
        if (x + WW > W) continue;
        let slot = -1, gc = 0, gr = 0, moat = false, edge = false;
        b.slots.forEach((s, si) => {
          if (c >= s.c0 && c < s.c0 + 7 && r >= s.r0 && r < s.r0 + 10) { slot = bi * 2 + si; gc = c - s.c0; gr = r - s.r0; }
          if (c >= s.c0 - 1 && c <= s.c0 + 7 && r >= s.r0 && r < s.r0 + 10) moat = true;
          if (c >= s.c0 - 1 && c <= s.c0 + 7 && (r === s.r0 - 1 || r === s.r0 + 10)) edge = true;
        });
        const lobby = bi === 0 && r === 12 && c >= 6 && c <= 8;
        WINDOWS.push({ x, y, bi, c, r, slot, gc, gr, bg: slot < 0 && !moat && !lobby, edge, id: bi * 1000 + r * 40 + c });
      }
  });
})();

/** Window pixel order for a dimming lamp: a 3 x 4 crop of the 4 x 4 Bayer matrix. */
export const RANK_DIM = (() => {
  const b4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const v = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) v.push([b4[y * 4 + x], y * 3 + x]);
  v.sort((a, b) => a[0] - b[0]);
  const r = new Uint8Array(12); v.forEach(([, i], k) => { r[i] = k; });
  return r;
})();
/** Pixel order for curtains opening: the middle column first, then both sides, top down. */
export const RANK_OPEN = Uint8Array.from([4, 0, 5, 6, 1, 7, 8, 2, 9, 10, 3, 11]);

// dim patterns for background flats (bit i = row * 3 + col)
const bits = (rows) => rows.reduce((m, row, y) => [...row].reduce((mm, ch, x) => (ch === '#' ? mm | (1 << (y * 3 + x)) : mm), m), 0);
export const PAT_FULL = 0xfff;
export const PAT_DIM = [
  bits(['#.#', '.#.', '#.#', '.#.']),       // a lamp behind a net curtain
  bits(['...', '...', '###', '###']),       // the blind pulled half down
  bits(['...', '...', '##.', '##.']),       // a lamp in the corner
  bits(['...', '...', '###', '###']),
];
