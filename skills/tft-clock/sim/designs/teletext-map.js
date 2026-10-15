// Teletext weather: the map, on the 80 x 39 sixel grid. The British Isles
// and the near continent, measured from real coastline points (one sixel row
// = 0.255 deg of latitude, one column = 0.434 deg of longitude, so a sixel is
// about 28 km square), drawn the way a teletext artist would: solid coast,
// "shaded" (checkered) inland.
//
// LAND is 1 for land; COAST marks land with sea beside it.

import { SW, SH } from './teletext-page.js';

// [sixel row, from col, to col] runs (inclusive), relative to each piece's origin
const GB = [
  [0, 3, 7], [1, 2, 7], [2, 2, 6], [3, 1, 5], [4, 1, 4], [4, 6, 9], [5, 0, 10], [6, 0, 9], [7, 0, 9],
  [8, 1, 8], [9, 1, 8], [10, 1, 6], [11, 1, 2], [11, 4, 9], [12, 1, 2], [12, 3, 10], [13, 1, 1], [13, 3, 10],
  [14, 3, 10], [15, 3, 6], [15, 8, 11], [16, 3, 4], [16, 6, 12], [17, 6, 13], [18, 7, 14], [19, 7, 14],
  [20, 7, 14], [21, 4, 14], [22, 4, 15], [23, 3, 14], [23, 16, 17], [24, 4, 18], [25, 3, 18], [26, 2, 17],
  [27, 2, 16], [28, 6, 14], [28, 16, 17], [29, 5, 17], [30, 4, 16], [31, 3, 14], [32, 2, 8], [32, 10, 11],
  [33, 1, 6], [34, 2, 3],
];
const IE = [
  [13, -5, -2], [14, -5, 0], [15, -5, 0], [16, -6, 1], [17, -9, 1], [18, -9, 0], [19, -9, -1], [20, -9, -1],
  [21, -9, -8], [21, -6, 0], [22, -8, 0], [23, -8, 0], [24, -9, 0], [25, -9, 0], [26, -10, -1], [27, -9, -2],
  [28, -8, -5],
];
// the tip of France by Calais, in absolute sixel coordinates
const EU = [
  [33, 51, 53], [34, 49, 53], [35, 49, 54], [36, 49, 54], [37, 49, 55], [38, 49, 55],
];

export const GB_X = 31, GB_Y = 4;

export const LAND = new Uint8Array(SW * SH);
export const COAST = new Uint8Array(SW * SH);
const put = (x, y) => { if (x >= 0 && y >= 0 && x < SW && y < SH) LAND[y * SW + x] = 1; };
for (const [r, a, b] of GB) for (let x = a; x <= b; x++) put(GB_X + x, GB_Y + r);
for (const [r, a, b] of IE) for (let x = a; x <= b; x++) put(GB_X + x, GB_Y + r);
for (const [r, a, b] of EU) for (let x = a; x <= b; x++) put(x, r);
for (let y = 0; y < SH; y++)
  for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (!LAND[i]) continue;
    const sea = (xx, yy) => xx >= 0 && yy >= 0 && xx < SW && yy < SH && !LAND[yy * SW + xx];
    if (sea(x - 1, y) || sea(x + 1, y) || sea(x, y - 1) || sea(x, y + 1)) COAST[i] = 1;
  }
