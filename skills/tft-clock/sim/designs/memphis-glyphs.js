// memphis-glyphs: the ten numerals as Memphis assemblages.
//
// Each numeral is a handful of separate geometric objects (bars, slabs,
// half-rings, rings, wedges) that only line up into the numeral from one
// point of view. Geometry is in a 28 x 50 cell; arc angles are clock
// degrees (0 = 12 o'clock, clockwise). memphis.js gives every object its own
// depth, colour and pattern.

const bar = (x, y, w, h) => ({ k: 'bar', x, y, w, h });
const slab = (x0, y0, x1, y1, w) => ({ k: 'slab', x0, y0, x1, y1, w });
const arc = (cx, cy, r0, r1, a0, a1) => ({ k: 'arc', cx, cy, r0, r1, a0, a1 });
const ring = (cx, cy, r0, r1) => ({ k: 'ring', cx, cy, r0, r1 });
const tri = (...pts) => ({ k: 'tri', pts });

export const CELL_W = 28, CELL_H = 50;

export const GLYPHS = {
  0: [arc(14, 14, 7, 14, -90, 90), bar(21, 14, 7, 22), arc(14, 36, 7, 14, 90, 270), bar(0, 14, 7, 22)],
  1: [bar(12, 0, 7, 50), tri([2, 13], [12, 0], [12, 13]), bar(4, 44, 22, 6)],
  2: [arc(14, 14, 7, 14, -82, 135), slab(21.5, 21.5, 3.5, 45, 7.5), bar(0, 43, 28, 7)],
  3: [arc(14, 12.5, 6, 12.5, -62, 180), arc(14, 36, 7, 14, 0, 240), bar(6, 21.5, 10, 6)],
  4: [bar(1, 0, 7, 34), bar(19, 4, 7, 46), bar(0, 28, 28, 7)],
  5: [bar(4, 0, 24, 7), bar(4, 0, 7, 25), arc(13.5, 34, 9, 16, -42, 222)],
  6: [arc(14, 14, 7, 14, -90, 55), bar(0, 14, 7, 22), ring(14, 36, 7, 14)],
  7: [bar(0, 0, 28, 7), slab(24, 4, 9, 50, 7.5)],
  8: [ring(14, 12.5, 5.5, 12), ring(14, 36, 7, 14)],
  9: [ring(14, 14, 7, 14), bar(21, 14, 7, 22), arc(14, 36, 7, 14, 90, 235)],
};
