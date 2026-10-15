// The fleet for 'bayeux': two Norman ships as the tapestry draws them, a
// striped clinker hull, a dragon-headed stem and a curling stern post, a row
// of shields along the gunwale. The hour ship and the minute ship carry the
// numerals as their cargo. Built once at load through the same embroidery
// rasteriser as the numerals (flash: 2 x ~78 x 26 px x 2 bytes, ~8 KB), and
// the sea as a periodic strip of stitched wave lines the frame pans.

import { embroider, stroke, poly, disc, curve, WOOL } from './bayeux-glyphs.js';

export const SHIP_H = 36, GUNWALE = 23;   // ship-local: the gunwale row

const SHIELDS = ['ochre', 'lblue', 'body', 'sage'];

/** A ship `w` px long, prow at the left (it sails left, the way the fleet crosses). */
export function buildShip(w, body, seed = 0, hull = ['ochre', 'green', 'lblue'], post = 'sage') {
  const g = GUNWALE;
  const P = [
    // the hull: clinker strakes in bands of wool, a deep sweep up to stem and stern
    poly([[3, g - 1], [w - 3, g - 1], [w - 7, g + 6], [w - 15, g + 11.6], [15, g + 11.6], [7, g + 6]],
      { stripes: [['body', 0], [hull[0], g + 3.6], [hull[1], g + 6.6], [hull[2], g + 9.4]] }),
    // the stem, rising to a dragon's head looking forward
    stroke(curve([[8, g + 2], [4.6, g - 3], [3.4, g - 9], [4.4, g - 15]], 5), 2.3, { role: 'acc', col: post, key: true }),
    poly([[7.6, g - 19.6], [3.2, g - 20.2], [0.2, g - 17.4], [0.4, g - 15], [2.8, g - 15.6], [1.2, g - 13], [4.8, g - 12.4], [7.6, g - 14]], { role: 'acc', col: post, key: true }),
    poly([[5.6, g - 19.6], [7.4, g - 23], [8.4, g - 18.8]], { role: 'acc', col: post, key: true }),
    disc(3.8, g - 17.6, 0.9, { role: 'cut' }),
    // the stern post, curling back in a tail
    stroke(curve([[w - 8, g + 2], [w - 4.4, g - 3], [w - 2.6, g - 10], [w - 3.6, g - 15.4], [w - 7, g - 16.2], [w - 8.2, g - 13.4]], 5), 2.3, { role: 'acc', col: post, key: true }),
  ];
  // shields hung along the gunwale, overlapping
  let k = seed;
  for (let x = 11.5; x <= w - 11; x += 5.4, k++) P.push(disc(x, g + 1.2, 2.7, { role: 'acc', col: SHIELDS[k % 4], key: true }));
  const sh = embroider(P, w, SHIP_H, 1, body);
  // oar ports: between the shields, on the second strake
  const oars = [];
  for (let x = 16; x <= w - 14; x += 10.8) oars.push(x);
  return { ...sh, oars };
}

// ------------------------------------------------------------ the sea
// Wave lines as the tapestry stitches water: rows of scallops in the two
// woads, a row of sage between.
export const SEA_P = 192, SEA_H = 6;
export const SEA = new Int32Array(SEA_P * SEA_H).fill(-1);
{
  const wave = ['....xxx.....', '..xx...xx...', 'xx.......xxx'];
  const lines = [[0, WOOL.lblue, 0], [3, WOOL.indigo, 6]];
  for (const [y0, c, ph] of lines)
    for (let j = 0; j < 3; j++)
      for (let x = 0; x < SEA_P; x++) if (wave[j][(x + ph) % 12] === 'x') SEA[(y0 + j) * SEA_P + x] = c;
}
