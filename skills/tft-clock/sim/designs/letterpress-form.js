// Letterpress: the lockup. Where every block sits in the chase, each block's
// face as a byte code over its whole body (shoulder, face, face edge, rim),
// the end grain of each block, the bed and chase, the grain-rank table that
// decides where ink takes and where it leaves, and the paper. All built at
// load: flash tables.

import { hash, noise2, to565, rgb, R, G, B } from '../js/kit.js';
import { DIGITS, SIZES, LETTERS, LETTER, COLON_MASK, COLON, STAR_MASK, STAR } from './letterpress-type.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ the lockup
// kind: 'H' hour numeral, 'M' minute numeral, 'C' colon, 'L' day letter, 'S' star
export const SLOTS = [
  { kind: 'H', x: 3, y: 3, w: 36, h: 74, gx: 3, gy: 5 },
  { kind: 'H', x: 40, y: 3, w: 36, h: 74, gx: 3, gy: 5 },
  { kind: 'C', x: 77, y: 3, w: 12, h: 74, gx: 2, gy: 23 },
  { kind: 'M', x: 90, y: 3, w: 33, h: 49, gx: 4, gy: 5 },
  { kind: 'M', x: 124, y: 3, w: 33, h: 49, gx: 3, gy: 5 },
  { kind: 'L', x: 90, y: 53, w: 18, h: 24, gx: 2, gy: 5 },
  { kind: 'L', x: 109, y: 53, w: 18, h: 24, gx: 2, gy: 5 },
  { kind: 'L', x: 128, y: 53, w: 18, h: 24, gx: 2, gy: 5 },
  { kind: 'S', x: 147, y: 53, w: 10, h: 24, gx: 1, gy: 6 },
];

/** Codes: 0 shoulder, 1 face, 2 face edge, 3 rim (shoulder touching the face), 4 rim below/right of the face (the bite's shadow side). */
function encode(mask, mw, mh, bw, bh, gx, gy) {
  const c = new Uint8Array(bw * bh);
  const at = (x, y) => {
    const u = x - gx, v = y - gy;
    return u >= 0 && v >= 0 && u < mw && v < mh ? mask[v * mw + u] : 0;
  };
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const f = at(x, y);
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      if (f) c[y * bw + x] = l && r && u && d ? 1 : 2;
      else if (l || u) c[y * bw + x] = 4;
      else if (r || d) c[y * bw + x] = 3;
    }
  return c;
}

const GLYPH_SRC = {
  H: { list: DIGITS.H, w: SIZES.H.w, h: SIZES.H.h },
  M: { list: DIGITS.M, w: SIZES.M.w, h: SIZES.M.h },
  C: { list: [COLON_MASK], w: COLON.w, h: COLON.h },
  S: { list: [STAR_MASK], w: STAR.w, h: STAR.h },
  L: { list: Object.values(LETTERS), w: LETTER.w, h: LETTER.h, keys: Object.keys(LETTERS) },
};

/** BLOCK[slot][glyph] = the code array of that block carrying that glyph. */
export const BLOCK = SLOTS.map((s) => {
  const src = GLYPH_SRC[s.kind], out = {};
  src.list.forEach((m, k) => { out[src.keys ? src.keys[k] : k] = encode(m, src.w, src.h, s.w, s.h, s.gx, s.gy); });
  return out;
});

// ------------------------------------------------------------ end grain: each block's own rings and pores
// tone 0..3 per block pixel
export const GRAIN = SLOTS.map((s, k) => {
  const t = new Uint8Array(s.w * s.h);
  const cx = s.w * (hash(k, 1) % 100 < 50 ? -0.6 : 1.6), cy = s.h * (0.2 + (hash(k, 2) % 60) / 100), sp = 3.1 + (hash(k, 3) % 10) / 10;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + ((y - cy) * 0.45) ** 2) / sp;
      const fr = d - Math.floor(d);
      let v = fr < 0.22 ? 1 : 0;                                  // late wood: the darker ring
      if (hash(x, y, k + 40) % 100 < 6) v = 2;                    // pores
      if (hash(x >> 1, y >> 1, k + 80) % 100 < 4) v = 3;          // the odd paler fleck
      t[y * s.w + x] = v;
    }
  return t;
});

// ------------------------------------------------------------ bed and chase
export const BED = 0x231b16, BED_C = 0x3a2f27;
export const BG = new Uint16Array(N);
{
  const chase = to565(0x4a4744), chaseD = to565(0x33312e), chaseL = to565(0x5d5a55), bed = to565(BED);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      let v = bed;
      if (e) v = (x === 0 || y === 0) ? chaseL : (x === W - 1 || y === H - 1) ? chaseD : chase;
      BG[y * W + x] = v;
    }
}

// ------------------------------------------------------------ rank: where ink takes first and leaves last
// streaky along the grain (horizontal), with a fine tooth; ranked to a uniform 0..255
export const RANK = new Uint8Array(N);
{
  const v = new Float32Array(N), idx = new Uint32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      v[i] = noise2(x * 0.16, y * 0.9, 11) * 0.6 + noise2(x * 0.5, y * 0.5, 12) * 0.25 + (hash(x, y, 13) % 1000) / 1000 * 0.15;
      idx[i] = i;
    }
  idx.sort((a, b) => v[a] - v[b]);
  for (let k = 0; k < N; k++) RANK[idx[k]] = Math.floor((k * 256) / N);
}

// ------------------------------------------------------------ the paper: cream rag stock, its fibres
export const PAPER = new Uint8Array(N);    // tone 0..3
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const m = noise2(x * 0.09, y * 0.11, 21);
    let t = m < 0.33 ? 1 : 0;
    if (hash(x, y, 22) % 100 < 5) t = 2;                         // fibre
    if (hash(x, y, 23) % 400 < 3) t = 3;                         // a dark inclusion
    PAPER[y * W + x] = t;
  }

/** Multiply blend of 0xRRGGBB colours, as overprinted transparent inks do. */
export const mul = (a, b) => rgb((R(a) * R(b)) / 255, (G(a) * G(b)) / 255, (B(a) * B(b)) / 255);

/** Flash used here, bytes. */
export const FORM_BYTES = BLOCK.reduce((n, b) => n + Object.values(b).reduce((m, a) => m + a.length, 0), 0)
  + GRAIN.reduce((n, a) => n + a.length, 0) + BG.length * 2 + RANK.length + PAPER.length;
