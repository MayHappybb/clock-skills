// The cloth for 'bayeux': linen, the two border friezes, the stitched
// Romanesque capitals of the inscription. Everything here is built once at
// load into RGB565 tables (flash): the linen 25.6 KB, the two friezes 192 x 14 rows x 2 B = 5.4 KB,
// the alphabet a few hundred bytes.

import { sprite, rand, noise2 } from '../js/kit.js';
import { WOOL, shade, mixc, to565 } from './bayeux-glyphs.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ the linen
// Undyed linen in plain weave: a faint checker of warp and weft, slubs (thick
// stretches of weft) running across, and the soft tide-marks of nine
// centuries. Kept calm: the time is the strongest thing on the cloth.
export const LINEN = new Uint16Array(W * H);
{
  const slub = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let k = 0; k < 3; k++) {
      const x0 = Math.floor(rand(y, k, 7) * W), len = 4 + Math.floor(rand(y, k, 8) * 14);
      for (let x = x0; x < Math.min(W, x0 + len); x++) slub[y * W + x] = 1;
    }
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let k = 1 + (((x + y) & 1) ? 0.018 : -0.018);
      k -= 0.035 * slub[i];
      k -= 0.05 * Math.max(0, noise2(x / 23, y / 15, 3) - 0.55) * 2.2;
      const c = mixc(shade(WOOL.linen, k), 0xc9ab7c, 0.12 * Math.max(0, noise2(x / 40, y / 30, 9) - 0.5));
      LINEN[i] = to565(c);
    }
}

// ------------------------------------------------------------ the friezes
// The upper and lower borders: beasts and birds between slanting bars, the
// way the tapestry frames its main band. Each is a strip one period long
// that the frame pans along, sampled with a fractional offset.

const PAL = {
  x: WOOL.indigo, r: WOOL.terra, y: WOOL.ochre, s: WOOL.sage, g: WOOL.green, b: WOOL.lblue, l: WOOL.linen, k: WOOL.black,
};
const BIRD = sprite(`
  .....xx.
  ....xrrxy
  xx..xrx.
  .xrrrrrx
  ..xrrrx.
  ...x.x..`, PAL);
const BIRD2 = sprite(`
  .....xx.
  ....xssxy
  xx..xsx.
  .xsssssx
  ..xsssx.
  ...x.x..`, PAL);
const LION = sprite(`
  .x..........xxx.
  x.x........xyyyx
  x..........xyrrrx
  .x..xxxxxxxxyrrx.
  ..xxrrrrrrrrrrx..
  ...xrrrrrrrrrx...
  ...xrxxxrrxxxrx..
  ...xrx.xrx..xrx..
  ...xx..xx...xx...`, PAL);
const DOG = sprite(`
  ..........xx..
  x........xyyxx
  .x.xxxxxxxyyx.
  ..xyyyyyyyyx..
  ..xyyyyyyyx...
  .xyx....xyx...
  xx.......xx...`, PAL);
const HARE = sprite(`
  .......x.x
  ......xsxs
  x....xsssx
  .xxxxsssx.
  xsssssssx.
  xsssssx...
  .xx..xx...`, PAL);
const GRIFF = sprite(`
  .........xx..
  ..xx....xbbxy
  .xbbx..xbbx..
  xbbbbxxbbbx..
  .xxbbbbbbbx..
  ...xbbbbbx...
  ...xbxxxbx...
  ...xbx.xbx...
  ...xx..xx....`, PAL);

function bar(buf, P, h, x0, cols) {
  // a slanting bar of two or three wools, one pixel of slant a row
  for (let y = 0; y < h; y++)
    for (let k = 0; k < cols.length * 2; k++) {
      const x = (x0 + k + (h - 1 - y) + P) % P;
      buf[y * P + x] = cols[k >> 1];
    }
}
function put(buf, P, h, spr, x0, y0, flip = false) {
  for (let j = 0; j < spr.h; j++)
    for (let i = 0; i < spr.w; i++) {
      const v = spr.data[j * spr.w + (flip ? spr.w - 1 - i : i)];
      if (v < 0) continue;
      const y = y0 + j; if (y < 0 || y >= h) continue;
      buf[y * P + ((x0 + i + P) % P)] = v;
    }
}

export const FP = 192;   // a frieze's period, px
/** Top frieze: 6 rows of beasts between the border lines. */
export const TOPF = { h: 6, rgb: new Int32Array(FP * 6).fill(-1) };
/** Bottom frieze: 8 rows. */
export const BOTF = { h: 8, rgb: new Int32Array(FP * 8).fill(-1) };
{
  const T = TOPF.rgb;
  for (let k = 0; k < 6; k++) {
    const x = k * 32;
    bar(T, FP, 6, x, k % 2 ? [WOOL.green, WOOL.ochre] : [WOOL.terra, WOOL.sage]);
    put(T, FP, 6, k % 2 ? BIRD2 : BIRD, x + 8, 0, false);
    put(T, FP, 6, k % 2 ? BIRD : BIRD2, x + 18, 0, true);
  }
  const B = BOTF.rgb, h = 8;
  bar(B, FP, h, 0, [WOOL.terra, WOOL.ochre, WOOL.green]);
  put(B, FP, h, LION, 10, -1);
  bar(B, FP, h, 34, [WOOL.green, WOOL.sage]);
  put(B, FP, h, DOG, 46, 1); put(B, FP, h, HARE, 64, 1);
  bar(B, FP, h, 80, [WOOL.terra, WOOL.ochre, WOOL.green]);
  put(B, FP, h, GRIFF, 92, -1); put(B, FP, h, GRIFF, 110, -1, true);
  bar(B, FP, h, 130, [WOOL.green, WOOL.sage]);
  put(B, FP, h, LION, 142, -1, true);
  bar(B, FP, h, 164, [WOOL.terra, WOOL.ochre, WOOL.green]);
  put(B, FP, h, BIRD2, 177, 1);
}

// ------------------------------------------------------------ the inscription
// Romanesque capitals in stem stitch, narrow as the tapestry's, words in
// alternating wools. Latin as the embroiderers spelled it: V for U.
const GL = {
  A: '.xx.|x..x|x..x|xxxx|x..x|x..x|x..x', B: 'xxx.|x..x|x..x|xxx.|x..x|x..x|xxx.', C: '.xxx|x...|x...|x...|x...|x...|.xxx',
  D: 'xxx.|x..x|x..x|x..x|x..x|x..x|xxx.', E: 'xxxx|x...|x...|xxx.|x...|x...|xxxx', F: 'xxxx|x...|x...|xxx.|x...|x...|x...',
  G: '.xxx|x...|x...|x.xx|x..x|x..x|.xxx', H: 'x..x|x..x|x..x|xxxx|x..x|x..x|x..x', I: 'xxx|.x.|.x.|.x.|.x.|.x.|xxx',
  L: 'x...|x...|x...|x...|x...|x...|xxxx', M: 'x...x|xx.xx|x.x.x|x.x.x|x...x|x...x|x...x', N: 'x...x|xx..x|x.x.x|x.x.x|x..xx|x...x|x...x',
  O: '.xx.|x..x|x..x|x..x|x..x|x..x|.xx.', P: 'xxx.|x..x|x..x|xxx.|x...|x...|x...', Q: '.xx.|x..x|x..x|x..x|x..x|x.x.|.x.x',
  R: 'xxx.|x..x|x..x|xxx.|x.x.|x..x|x..x', S: '.xxx|x...|x...|.xx.|...x|...x|xxx.', T: 'xxxxx|..x..|..x..|..x..|..x..|..x..|..x..',
  V: 'x...x|x...x|x...x|.x.x.|.x.x.|.x.x.|..x..', X: 'x...x|.x.x.|.x.x.|..x..|.x.x.|.x.x.|x...x',
};
const GLYPH = {};
for (const [ch, s] of Object.entries(GL)) {
  const rows = s.split('|');
  GLYPH[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === 'x')) };
}

export const INSCRIPTIONS = [
  'HIC MEDIA NOX', 'HIC DORMIVNT', 'HIC VIGILANT', 'HIC STELLE LVCENT', 'HIC TRAHVNT NAVES', 'HIC GALLVS CANTAT',
  'HIC SOL ORITVR', 'HIC EQVITANT', 'HIC VENIT NVNTIVS', 'HIC PORTANT ARMA', 'HIC NAVIGANT', 'HIC VIDENT TERRAM',
  'HIC PRANDIVM', 'HIC BENEDICIT', 'EXEVNT CABALLI', 'HIC CASTELLVM', 'HIC PROPERANT', 'HIC PVGNANT',
  'HIC SOL OCCIDIT', 'HIC CENANT', 'HIC CANTANT', 'HIC IGNES ARDENT', 'HIC REX DORMIT', 'HIC NOX TACET',
];
export const STELLA = 'ISTI MIRANT STELLA';
const WORD_WOOL = [WOOL.indigo, WOOL.terra, WOOL.green];

/**
 * Lay out an inscription centred at `cy`: a list of stitched pixels
 * [x, y, colour565, order 0..1], left to right (the order the needle takes).
 */
export function inscription(text, cx = 80, y0 = 10) {
  let w = 0;
  for (const ch of text) w += ch === ' ' ? 3 : GLYPH[ch].w + 1;
  let x = Math.round(cx - (w - 1) / 2), word = 0;
  const px = [];
  for (const ch of text) {
    if (ch === ' ') {
      // an interpunct between words, as the tapestry has
      px.push([x, y0 + 3, to565(WOOL.ochre)]);
      x += 3; word++; continue;
    }
    const gl = GLYPH[ch], col = to565(WORD_WOOL[word % 3]);
    for (let j = 0; j < 7; j++) for (let i = 0; i < gl.w; i++) if (gl.rows[j][i]) px.push([x + i, y0 + j, col]);
    x += gl.w + 1;
  }
  const x0 = px.length ? px[0][0] : 0, x1 = px.length ? px[px.length - 1][0] + 1 : 1;
  for (const p of px) p.push((p[0] - x0 + p[1] * 0.1 - y0 * 0.1) / (x1 - x0 + 1));
  return px;
}
