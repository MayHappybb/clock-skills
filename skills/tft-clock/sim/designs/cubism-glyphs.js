// cubism glyphs: angular stencil numerals, the kind Braque and Picasso
// brushed through a stencil onto their canvases in 1911-12 ("Le Portugais"
// carries "D BAL" and "10,40"). Bowls are cut as octagons, the way a
// faceting painter would, and every closed form has the stencil's bridges:
// the gaps that keep the middle of an O from falling out of the card.
//
// Each glyph is built once at load (setup() on the device) as a coverage
// mask GW x GH, 0..1, anti-aliased. The face samples these masks through
// each facet's own view, so they are plain lookup tables at run time.

import { segDist } from '../js/kit.js';

export const GW = 24, GH = 42;
const R = 3.3;   // half the stroke

// Skeletons in glyph pixels: lists of polylines. A loop repeats its first point.
const S = {
  0: [[[9, 4], [15, 4], [20, 9], [20, 33], [15, 38], [9, 38], [4, 33], [4, 9], [9, 4]]],
  1: [[[6, 10], [12.5, 4], [12.5, 38]], [[6, 38], [19, 38]]],
  2: [[[4, 10], [9, 4], [15, 4], [20, 9], [20, 16], [4, 37], [4, 38], [20.5, 38]]],
  3: [[[4, 9], [9, 4], [15, 4], [20, 9], [20, 16], [15, 21], [9, 21]],
      [[15, 21], [20, 26], [20, 33], [15, 38], [9, 38], [4, 33]]],
  4: [[[16, 38], [16, 4], [4, 28], [21, 28]]],
  5: [[[19.5, 4], [6, 4], [5, 19], [15, 19], [20, 24], [20, 33], [15, 38], [9, 38], [4, 33]]],
  6: [[[18, 4], [11, 4], [4, 12], [4, 33], [9, 38], [15, 38], [20, 33], [20, 25], [15, 20], [9, 20], [4, 25]]],
  7: [[[4, 4], [20, 4], [20, 8], [10, 38]]],
  8: [[[9, 4], [15, 4], [19, 8], [19, 15], [15, 20], [9, 20], [5, 15], [5, 8], [9, 4]],
      [[9, 20], [15, 20], [20, 25], [20, 33], [15, 38], [9, 38], [4, 33], [4, 25], [9, 20]]],
};
S[9] = S[6].map((pl) => pl.map(([x, y]) => [GW - x, GH - y]));

// Stencil bridges: boxes [x0, y0, x1, y1] cut out of the stroke.
const VCUT = (x, y) => [x - 1, y - 4.5, x + 1, y + 4.5];
const CUTS = {
  0: [VCUT(12, 4), VCUT(12, 38)],
  1: [],
  2: [VCUT(12, 4)],
  3: [VCUT(12, 4), VCUT(12, 38)],
  4: [[10.5, 24, 12.4, 32]],
  5: [VCUT(12, 38)],
  6: [VCUT(12, 38), VCUT(12, 20)],
  7: [],
  8: [VCUT(12, 4), VCUT(12, 38)],
  9: [VCUT(12, 4), VCUT(12, 22)],
};

function build(d) {
  const m = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const px = x + 0.5, py = y + 0.5;
      let dist = Infinity;
      for (const pl of S[d])
        for (let i = 1; i < pl.length; i++) dist = Math.min(dist, segDist(px, py, pl[i - 1][0], pl[i - 1][1], pl[i][0], pl[i][1]));
      let cov = Math.min(1, Math.max(0, R + 0.5 - dist));
      for (const [x0, y0, x1, y1] of CUTS[d]) {
        // distance outside the cut box; inside the box the stencil card holds
        const dx = Math.max(x0 - px, 0, px - x1), dy = Math.max(y0 - py, 0, py - y1);
        if (dx === 0 && dy === 0) { cov = 0; break; }
        const out = Math.max(dx, dy);
        if (out < 1) cov = Math.min(cov, out);
      }
      m[y * GW + x] = cov;
    }
  return m;
}

/** GLYPH[d]: Float32Array GW*GH coverage of numeral d. */
export const GLYPH = Array.from({ length: 10 }, (_, d) => build(d));
