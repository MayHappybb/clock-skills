// The sign-maker's numerals. Each is bent from one length of 3 px glass on
// a 22 x 40 skeleton, the way a Kowloon neon shop bends a tall deco figure:
// full round bowls, a flat-topped 3, an open 4 whose return run is painted
// black, a 6 whose loop closes back on its own stem, an 8 that crosses
// itself at the waist, electrodes (pale dead glass) at the two ends of every
// tube. All counters are big and open (>= 9 x 14 px of ground); no tube
// ever passes through another digit's counter.
//
// Coordinates: skeleton units = pixels; a slot's origin sits on a pixel
// centre, so integer skeleton points are pixel centres.

import { parsePath, rasterise, PAD } from './neon-tubes.js';

export const GW = 22, GH = 40;

const PATHS = {
  0: 'M 11.2 0 A 11 11 11 271 360 L 22 29 A 11 29 11 0 180 L 0 11 A 11 11 11 180 269',
  1: 'M 5 9 L 14 0 L 14 40',
  2: 'M 0.6 10.5 C 0.6 4 5.3 0 11 0 C 16.7 0 21.5 4 21.5 10.5 C 21.5 17 16.5 21.5 10.5 27 L 0.5 40 L 22 40',
  3: 'M 0.5 0 L 21.5 0 L 10 15.5 C 17 15.5 22 21 22 28 C 22 35 17 40 11 40 C 5.5 40 1.6 37 0.4 33',
  4: 'M 16 40 L 16 7.5 K L 2 0 K L 2 26 L 22 26',
  5: 'M 21 0 L 2.5 0 L 1.5 18 C 4.2 16.5 7.5 16 10.5 16 C 17.5 16 22 21 22 28 C 22 35 17 40 11 40 C 5.5 40 1.6 37 0.4 33',
  6: 'M 19 2.6 C 16.7 0.9 14 0 11 0 C 4 0 0 6.5 0 15 L 0 29 A 11 29 11 180 -132',
  7: 'M 0 0 L 22 0 C 15.5 11 11 23 10 40',
  8: 'M 11.3 0 C 16.3 0 20.2 4 20.2 9.2 C 20.2 13.8 16.3 16.6 11 19.6 C 4.6 22.8 0.4 25.6 0.4 30 C 0.4 36 5 40 11 40 '
    + 'C 17 40 21.6 36 21.6 30 C 21.6 25.6 17.4 22.8 11 19.6 C 5.7 16.6 1.8 13.8 1.8 9.2 C 1.8 4 5.7 0 10.6 0',
};
// the 9 is the 6 turned half round, as a sign-maker would bend it from the same pattern
PATHS[9] = PATHS[6];

const BOX = [-PAD, -PAD, GW + PAD, GH + PAD];

/** Light fields for the ten numerals (flash tables). */
export const GLYPHS = [];
for (let k = 0; k < 10; k++) {
  const tf = k === 9 ? (x, y) => [GW - x, GH - y] : null;
  GLYPHS.push(rasterise(parsePath(PATHS[k], tf), BOX, { half: 0, dead: k === 0 || k === 8 ? 0.35 : 1.6 }));
}

/** Flash cost of the numerals' tables, bytes. */
// on the device an entry is 4 bytes (x, y, d, s; the 4's blockout is a short list of its own)
export const GLYPH_BYTES = GLYPHS.reduce((a, g) => a + g.n * 4 + g.L, 0);
