// Dominoes: the 1-bit rasteriser. Everything is drawn into a byte mask
// (0 = felt, 1 = ivory) and written to the frame buffer as two colours at
// the end. Tiles are oriented rectangles tested per pixel in their bounding
// box with a few integer-friendly float ops (priced as box work).

import { LFLAT, ST } from './dominoes-glyphs.js';

export const W = 160, H = 80;

// Pip layouts on a 3 x 3 grid, bit (row * 3 + col).
const PIP = [0, 0x010, 0x101, 0x111, 0x145, 0x155, 0x1c7];
// The row of pips nearest a half's far edge, for a tile seen leaning (cols bits).
const TOPROW = [0, 2, 1, 5, 5, 7, 5];

/**
 * A tile standing at (px, py) whose run goes along (tx, ty). L is its
 * projected length along the run: 2 standing, ~6 leaning on the next tile,
 * LFLAT lying flat. A leaning tile casts a 1-px felt line at its top edge,
 * which is what draws the shingles of a fallen run.
 */
export function tile(M, px, py, tx, ty, L, a, b, hw, cost) {
  const nx = -ty, ny = tx;
  // bounding box of the rectangle [-1, L] x [-hw, hw]
  const ex = Math.abs(nx) * hw, ey = Math.abs(ny) * hw;
  const x0 = Math.max(0, Math.floor(Math.min(px - tx, px + tx * L) - ex)), x1 = Math.min(W - 1, Math.ceil(Math.max(px - tx, px + tx * L) + ex));
  const y0 = Math.max(0, Math.floor(Math.min(py - ty, py + ty * L) - ey)), y1 = Math.min(H - 1, Math.ceil(Math.max(py - ty, py + ty * L) + ey));
  const lean = L > ST + 0.6, flat = L >= LFLAT - 0.5, topR = ((L + 0.0001) | 0) - 2, top = lean && L >= 5 ? TOPROW[a] : 0;
  const pa = PIP[a], pb = PIP[b], cw = hw * 2;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5 - py;
    let i = y * W + x0;
    for (let x = x0; x <= x1; x++, i++) {
      const cx = x + 0.5 - px, dn = cx * nx + cy * ny + hw;
      n++;
      if (dn < 0 || dn >= cw) continue;
      const dt = cx * tx + cy * ty + 1;
      if (dt < 0) continue;
      if (dt < L) {
        let v = 1;
        if (lean) {
          const r = dt | 0, c = dn | 0;
          if (flat) {
            if (r === 7) v = 0;
            else if ((c & 1) && c < 6) {
              const half = r < 7 ? pa : pb, rr = r < 7 ? r : r - 8;
              if ((rr & 1) && rr < 6 && (half >> (((rr >> 1) * 3) + (c >> 1)) & 1)) v = 0;
            }
          } else if (top && r === topR && (c & 1) && c < 6 && ((top >> (c >> 1)) & 1)) v = 0;
        }
        M[i] = v;
      } else if (lean && dt < L + 1) M[i] = 0;
    }
  }
  cost.box += n * 3;
}

// The domino-laying cart seen from above, 9 long (back to front) x 11 wide.
// 0 felt (its own moat), 1 ivory, . untouched.
const CART = [
  '.000000000.',
  '01100000110',
  '01111111110',
  '00100000100',
  '00111111100',
  '00100000100',
  '01111111110',
  '01100100110',
  '...00100...',
].map((r) => [...r].map((c) => (c === '.' ? 2 : +c)));

/** The cart at (px, py) heading along (tx, ty); `keep` in 0..1 dissolves it in. */
export function cart(M, px, py, tx, ty, keep, cost) {
  const nx = -ty, ny = tx;
  const x0 = Math.max(0, Math.floor(px - 8)), x1 = Math.min(W - 1, Math.ceil(px + 8));
  const y0 = Math.max(0, Math.floor(py - 8)), y1 = Math.min(H - 1, Math.ceil(py + 8));
  const th = (keep * 256) | 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5 - px, r = (cx * tx + cy * ty + 4.5), c = (cx * nx + cy * ny + 5.5);
      n++;
      if (r < 0 || r >= 9 || c < 0 || c >= 11) continue;
      const v = CART[r | 0][c | 0];
      if (v === 2) continue;
      if (th < 256 && ((x * 37 + y * 101 + ((x * y) & 15) * 13) & 255) >= th) continue;
      M[y * W + x] = v;
    }
  }
  cost.box += n * 3;
}

/** A single ink pixel (a pencil mark), clipped. */
export function dot(M, x, y) {
  x |= 0; y |= 0;
  if (x >= 0 && y >= 0 && x < W && y < H) M[y * W + x] = 1;
}

/** Grow a mask by r pixels (square), in place, using `tmp` as scratch. */
export function dilate(M, tmp, r) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r), e = Math.min(W - 1, x + r); k <= e && !v; k++) v = M[y * W + k];
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r), e = Math.min(H - 1, y + r); k <= e && !v; k++) v = tmp[k * W + x];
    M[y * W + x] = v;
  }
}
