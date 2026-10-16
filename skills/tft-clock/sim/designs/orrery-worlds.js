// orrery-worlds: the hour numerals as continents, baked once at load into
// small textures that the planet shader samples on the sphere.
//
// Each texture is N x N texels over the planet's visible face, u and v in
// [-1, 1]. A texel is 0 ocean, 1 land, 2 ice. The land is the hour drawn
// with the kit's stroke-digit skeleton, then given a coastline: the stroke
// radius is pushed in and out by 2D noise, so the numerals read as ragged
// continents with bays and capes rather than as type. Polar caps sit at
// the top and bottom.

import { digitSegments, segDist, noise2 } from '../js/kit.js';

export const N = 48;

function bake(hour) {
  const s = String(hour);
  const tex = new Uint8Array(N * N);
  // Digit boxes in texel coordinates.
  let boxes;
  if (s.length === 1) boxes = [[13, 9, 22, 30]];
  else boxes = [[7, 10, 16, 28], [25, 10, 16, 28]];
  const weight = s.length === 1 ? 8 : 7;
  const segs = [];
  boxes.forEach(([x, y, w, h], i) => {
    for (const sg of digitSegments(s[i], x, y, w, h, weight)) segs.push(sg);
  });
  const seed = 31 + hour * 7;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const px = i + 0.5, py = j + 0.5;
      let d = Infinity;
      for (const sg of segs) { const e = segDist(px, py, sg[0], sg[1], sg[2], sg[3]); if (e < d) d = e; }
      // Coastline: two octaves of noise move the shore by about +-1.3 texels.
      const n = (noise2(px * 0.32, py * 0.32, seed) - 0.5) * 2.0 + (noise2(px * 0.8, py * 0.8, seed + 1) - 0.5) * 0.9;
      const v = (py / N) * 2 - 1;
      const cap = Math.abs(v) - (0.86 + 0.05 * (noise2(px * 0.4, 3, seed + 2) - 0.5) * 2);
      if (cap > 0) tex[j * N + i] = 2;
      else if (d < weight / 2 + n) tex[j * N + i] = 1;
    }
  return tex;
}

/** WORLD[h] is the texture for hour h (0..23). */
export const WORLD = Array.from({ length: 24 }, (_, h) => bake(h));
