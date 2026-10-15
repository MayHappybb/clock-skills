// Art for "cats": the palette and the cats' heads (pixel sprites). Heads
// are 13 x 11 plus whiskers (17 wide), front-on, drawn at the pixel: two big ears with
// pink insides, slit eyes, a pink nose, a w mouth. Each coat has its own
// head markings; each head comes in eye states (look left / centre / right,
// shut), ear states (up, left or right ear flicked flat, both flat) and
// mouth states (shut, open: the yawn and the hiss).

import { sprite } from '../js/kit.js';

// ------------------------------------------------------------ palette
// Flat woodblock print: a sumi keyline, a washi-cream coat, a persimmon
// orange and the sumi itself as the patches, a cool tabby grey, eyes of
// yellow-green, and a pink that only touches noses and ears. The sky is one
// flat colour per time of day (the colours of the Hiroshige skies: aizome
// blue by day, persimmon at dusk, Prussian indigo at night), with drifting
// kasumi mist bands in a near tone; the roof is slate tiles. The cats are
// the only light, warm, keylined things on the glass, so the time is the
// strongest contrast in every sky.
export const SUMI = 0x1c1a22, CREAM = 0xf6eedb, ORANGE = 0xe57b2c, GREY = 0x8a8c98, EYE = 0xd8e04a, PINK = 0xee98a2;
export const YARN = 0xc8303c, YARN_D = 0x8a1e2c;

export const SKIES = {
  //   the ichimonji band at the top, sky, mist, roof tiles, tile joints, ridge cap edge, the glint on it, sun or moon
  night: { band: 0x0f1a3a, sky: 0x1b2a50, mist: 0x243764, tile: 0x2e3650, line: 0x181d2e, cap: 0x46506e, glint: 0xc8d4f0, disc: 0xf0e4b0, moon: true },
  dawn: { band: 0xc47c6e, sky: 0xe6a68c, mist: 0xeeb89c, tile: 0x4a4c62, line: 0x2a2a3a, cap: 0x6e6a80, glint: 0xfff0d0, disc: 0xfbe9b8, moon: false },
  day: { band: 0x4c82b2, sky: 0x86b2d2, mist: 0x9cc2dc, tile: 0x48546c, line: 0x2a3042, cap: 0x6c7a94, glint: 0xf4f8ff, disc: 0xd8402e, moon: false },
  dusk: { band: 0xa63c2c, sky: 0xd65c3a, mist: 0xde7048, tile: 0x433a50, line: 0x251f2e, cap: 0x66566c, glint: 0xffe0a0, disc: 0xf8d468, moon: false },
  eve: { band: 0x221c46, sky: 0x352d5e, mist: 0x41386e, tile: 0x34324e, line: 0x1c1a2c, cap: 0x524c70, glint: 0xd8d0f0, disc: 0xf0e4b0, moon: true },
};
export function skyFor(h) {
  if (h >= 21 || h < 5) return 'night';
  if (h < 8) return 'dawn';
  if (h < 16) return 'day';
  if (h < 19) return 'dusk';
  return 'eve';
}

// ------------------------------------------------------------ heads

const BASE = [
  '.k.........k.',
  '.kk.......kk.',
  '.kpk.....kpk.',
  'kcpckkkkkcpck',
  'kccccccccccck',
  'kccccccccccck',
  'kcEEcccccEEck',
  'kcEEcccccEEck',
  'kcccccpccccck',
  '.kccckckccck.',
  '..kkkkkkkkk..',
];

// markings per coat: [row, col, char] overrides on the base ('o' patch, 'k' sumi, 's' stripe)
const MARKS = {
  calico: [[3, 1, 'o'], [4, 1, 'o'], [4, 2, 'o'], [4, 3, 'o'], [5, 1, 'o'], [5, 2, 'o'], [3, 3, 'o'],
    [4, 9, 'k'], [4, 10, 'k'], [4, 11, 'k'], [3, 9, 'k'], [5, 11, 'k'], [3, 11, 'k']],
  ginger: [[3, 1, 'o'], [3, 3, 'o'], [3, 9, 'o'], [3, 11, 'o'], [4, 1, 'o'], [4, 2, 'o'], [4, 3, 'o'], [4, 4, 'o'],
    [4, 8, 'o'], [4, 9, 'o'], [4, 10, 'o'], [4, 11, 'o'], [5, 1, 'o'], [5, 11, 'o'], [5, 2, 'o'], [5, 10, 'o']],
  tabby: [[4, 4, 's'], [4, 6, 's'], [4, 8, 's'], [5, 5, 's'], [5, 7, 's'], [6, 1, 's'], [8, 1, 's'], [6, 11, 's'], [8, 11, 's']],
  hachi: [[3, 1, 'o'], [3, 3, 'o'], [3, 9, 'o'], [3, 11, 'o'], [4, 1, 'o'], [4, 2, 'o'], [4, 3, 'o'], [4, 4, 'o'], [4, 5, 'o'],
    [4, 7, 'o'], [4, 8, 'o'], [4, 9, 'o'], [4, 10, 'o'], [4, 11, 'o'], [5, 1, 'o'], [5, 2, 'o'], [5, 3, 'o'], [5, 4, 'o'],
    [5, 8, 'o'], [5, 9, 'o'], [5, 10, 'o'], [5, 11, 'o']],
};
// hachiware: a grey mask over the brow and ears, parted in the middle

function head(coat, eyes, ears, mouth) {
  const rows = BASE.map((r) => r.split(''));
  for (const [r, c, ch] of MARKS[coat]) rows[r][c] = ch;
  // eyes
  const L = eyes === 'L', Rt = eyes === 'R';
  for (const r of [6, 7]) {
    const e = eyes === 'shut' ? (r === 7 ? ['k', 'k'] : ['c', 'c']) : L ? ['K', 'y'] : Rt ? ['y', 'K'] : null;
    if (e) { rows[r][2] = e[0]; rows[r][3] = e[1]; rows[r][9] = e[0]; rows[r][10] = e[1]; }
    else { rows[r][2] = 'y'; rows[r][3] = 'K'; rows[r][9] = 'K'; rows[r][10] = 'y'; }
  }
  // ears flick flat: the tip folds down
  const fold = (c0, c1, c2) => {
    rows[0][c0] = '.'; rows[1][c0] = '.'; rows[1][c1] = '.';
    rows[1][c2] = 'k'; rows[2][c0] = 'k'; rows[2][c1] = 'k'; rows[2][c2] = 'k';
  };
  if (ears === 'L' || ears === 'B') fold(1, 2, 0);
  if (ears === 'R' || ears === 'B') fold(11, 10, 12);
  // mouth open: pink, sumi lips
  if (mouth === 'open') { rows[8][5] = 'k'; rows[8][6] = 'p'; rows[8][7] = 'k'; rows[9][5] = 'k'; rows[9][6] = 'p'; rows[9][7] = 'k'; rows[9][4] = 'c'; rows[9][8] = 'c'; }
  // whiskers: two short cream strokes each side, outside the keyline
  const out = rows.map((r) => '..' + r.join('') + '..');
  const put = (r, c, ch) => { out[r] = out[r].slice(0, c) + ch + out[r].slice(c + 1); };
  put(7, 0, 'w'); put(7, 1, 'w'); put(7, 15, 'w'); put(7, 16, 'w');
  put(9, 0, 'w'); put(8, 1, 'w'); put(9, 16, 'w'); put(8, 15, 'w');
  return out;
}

/** Heads as palette-index pictures (chars), rendered per palette by cats.js. */
export const HEADS = {};
for (const coat of Object.keys(MARKS))
  for (const eyes of ['L', 'C', 'R', 'shut'])
    for (const ears of ['up', 'L', 'R', 'B'])
      for (const mouth of ['shut', 'open'])
        HEADS[`${coat}/${eyes}/${ears}/${mouth}`] = head(coat, eyes, ears, mouth);

export const HEAD_W = 17, HEAD_H = 11;

/** A head picture as a sprite with the coat's colours. */
export function headSprite(rows, coat, pal) {
  return sprite(rows, {
    k: pal.sumi, c: pal.cream, o: coat === 'hachi' ? pal.grey : pal.orange, s: pal.grey,
    p: pal.pink, y: pal.eye, K: pal.sumi, w: pal.cream,
  });
}
