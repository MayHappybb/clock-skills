// Platformer: the art. Everything is in SHADE INDICES 0..3 (0 lightest),
// turned into one of the four DMG greens only when written, through a
// palette map like the handheld's BGP / OBP registers. So no pixel can ever
// be a fifth colour, and night, the boss arena and hit flashes are palette
// swaps, as they were on the real thing.

import { to565 } from '../js/kit.js';

// The four greens. The usual swatch (9bbc0f 8bac0f 306230 0f380f) puts the
// two light shades 16 apart, which merge on this glass; the real DMG screen
// showed them evenly stepped, so shade 1 is opened up between its neighbours.
export const GREENS = [0x9bbc0f, 0x6f9a1c, 0x306230, 0x0f380f];
export const G565 = Uint16Array.from(GREENS, to565);

/** A palette map: logical shade -> hardware shade, as 565 values. */
export const pal = (a, b, c, d) => Uint16Array.of(G565[a], G565[b], G565[c], G565[d]);

/** A sprite from rows of '0'..'3' and '.' (transparent). */
export function spr(rows) {
  const h = rows.length, w = rows[0].length, d = new Int8Array(w * h).fill(-1);
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] !== '.') d[y * w + x] = +r[x]; });
  return { w, h, d };
}

/**
 * Draw a shade sprite into the 565 buffer through palette map `m`, clipped
 * to the glass. Returns the pixels written (for the cost estimate).
 */
export function put(buf, s, x, y, m, flip = false) {
  x |= 0; y |= 0;
  let n = 0;
  const { w, h, d } = s;
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= 80) continue;
    for (let i = 0; i < w; i++) {
      const v = d[j * w + (flip ? w - 1 - i : i)];
      if (v < 0) continue;
      const xx = x + i;
      if (xx < 0 || xx >= 160) continue;
      buf[yy * 160 + xx] = m[v]; n++;
    }
  }
  return n;
}

// ------------------------------------------------------------ the hero: a hamster, 16 x 16

const EARS = ['..333......333..', '.31223....32213.'];
export const HAM = {
  stand: spr([...EARS,
    '.31113333331113.', '.31111111111113.', '3111111111111113', '3113311111133113', '3113011111103113', '3110011111100113',
    '3000001331000003', '3000000000000003', '3200000000000023', '.32000000000023.', '..322000000223..', '...3333333333...',
    '...333....333...', '................']),
  jump: spr([...EARS,
    '.31113333331113.', '.31111111111113.', '3111111111111113', '3113311111133113', '3113011111103113', '3110011111100113',
    '3000003333000003', '3000000330000003', '3200000000000023', '.32000000000023.', '..322000000223..', '.3333333333333..',
    '33..........333.', '................']),
  // landing: squashed a pixel, eyes shut tight
  land: spr(['................', ...EARS,
    '.31113333331113.', '3111111111111113', '3111111111111113', '3133331111333313', '3111111111111113',
    '3000001331000003', '3000000000000003', '3200000000000023', '.32000000000023.', '..322000000223..', '.33333333333333.',
    '3333......33333.']),
  // inhaling: mouth wide open
  inhale: spr([...EARS,
    '.31113333331113.', '.31111111111113.', '3111111111111113', '3113311111133113', '3113011111103113', '3110003333000113',
    '3000033333300003', '3000033333300003', '3200033333300023', '.32000333300023.', '..322000000223..', '...3333333333...',
    '...333....333...', '................']),
  // cheeks stuffed: two big pouches, eyes happy
  full: spr([...EARS,
    '.31113333331113.', '3111111111111113', '3111111111111113', '3133111111113313', '3111111111111113', '3000000000000003',
    '3000000000000003', '3000000110000003', '3000000000000003', '3200000000000023', '.322000000002233.'.slice(0, 16), '..333333333333..',
    '...333....333...', '................']),
};

// stuffed after a big meal (the hour): a balloon, 24 x 22
export const BALLOON = spr([
  '.....333........333.....', '....31223......32213....', '....31113333333311113....'.slice(0, 24),
  '...31111111111111111113.', '..3111111111111111111113', '.31111331111111113311113', '.31113003111111130031113',
  '311111003111111130011113', '311100000000000000000113', '310000000000000000000013', '300000000000000000000003',
  '300000000001100000000003', '300000000000000000000003', '300000000000000000000003', '320000000000000000000023',
  '320000000000000000000023', '.32000000000000000000023', '.32200000000000000000223', '..322200000000000002223.',
  '...3333333333333333333..', '....333..........333....', '........................',
]);

// ------------------------------------------------------------ golem parts

// eyes: 5 x 4 sockets cut in the stone, lit whites (shade 1) with a pupil by gaze (0 left, 1 ahead, 2 right)
export const EYE = [spr(['33333', '33113', '33113', '33333']), spr(['33333', '31313', '31313', '33333']), spr(['33333', '31133', '31133', '33333'])];
export const EYE_UP = spr(['33333', '31313', '31113', '33333']);
export const EYE_SHUT = spr(['33333', '33333', '31113', '33333']);
export const EYE_HURT = spr(['33333', '31313', '33133', '33333']);
export const EYE_GLOW = spr(['22222', '23332', '23332', '22222']);   // lit by the arena's inverted palette

/** a foot: a rounded slab, 7 x 3 */
export const FOOT = spr(['.33333.', '3222223', '3333333']);

/** dust puff frames (5 x 4) */
export const DUST = [spr(['.11..', '1001.', '.11..', '.....']), spr(['.1.1.', '1...1', '.1.1.', '.....']), spr(['1...1', '.....', '1...1', '.....'])];

/** a flying stone chip (the golem's material), 4 x 4 */
export const CHIP = spr(['.33.', '3223', '3213', '.33.']);
export const CHIP_S = spr(['33', '33']);

/** a boulder the golems toss, 8 x 8 */
export const ROCK = spr(['..3333..', '.322213.', '32222213', '32222223', '32222223', '32222223', '.322223.', '..3333..']);

/** a star (spat out, fireworks), 7 x 7 */
export const STAR = spr(['...3...', '..303..', '3300033', '.30003.', '..303..', '.30.03.', '.3...3.']);
export const SPARK = spr(['.0.', '000', '.0.']);

/** crown for the hour's new king golems, 10 x 6 */
export const CROWN = spr(['3...33...3', '30.3003.03', '3003003003', '3000000003', '3000000003', '3333333333']);

/** the HUD: small heart 5 x 5 and a tiny bespoke 3 x 5 cap font for B O S S, H P */
export const HEART = spr(['33.33', '30303', '30003', '.303.', '..3..']);
const LETTERS = {
  B: ['33.', '3.3', '33.', '3.3', '33.'], O: ['.3.', '3.3', '3.3', '3.3', '.3.'], S: ['.33', '3..', '.3.', '..3', '33.'],
};
export const LETTER = Object.fromEntries(Object.entries(LETTERS).map(([k, v]) => [k, spr(v)]));
