// dollwash: the numerals are cut from terry towelling and hemmed, so each
// is a thick rounded strip of cloth with a stitched hem line running down
// its middle. Drawn as stroke centre lines in a 12 x 22 box (the cloth is
// 5 px wide round them, so a numeral is 17 x 27 on the glass), with the
// points where its two pegs clip it to the line.

const arc = (cx, cy, rx, ry, a0, a1, n = 10) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};
const D = Math.PI / 180;

// Angles: 0 = right, 90 = down (y grows down).
export const GLYPHS = {
  0: { strokes: [arc(6, 11, 6, 11, -90 * D, 270 * D, 24)], pegs: [[2.2, 2.4], [9.8, 2.4]] },
  1: { strokes: [[[1, 5.5], [6.5, 0], [6.5, 22]], [[1.5, 22], [11.5, 22]]], pegs: [[2.6, 3.8], [6.5, 0.5]] },
  2: {
    strokes: [[...arc(6, 6, 6, 6, 190 * D, 380 * D, 12), [0, 22], [12, 22]]],
    pegs: [[2, 1.7], [10, 1.7]],
  },
  3: {
    strokes: [[[0.5, 0], [11.5, 0], [5, 8.5], ...arc(6, 15, 6, 7, -100 * D, 155 * D, 14)]],
    pegs: [[1.5, 0], [10.5, 0]],
  },
  4: { strokes: [[[8.5, 22], [8.5, 0], [0, 15], [12, 15]]], pegs: [[8.5, 0.5], [3.2, 9.5]] },
  5: {
    strokes: [[[11.5, 0], [1, 0], [0.5, 9.5], ...arc(5.8, 15, 6.2, 7, -125 * D, 150 * D, 14)]],
    pegs: [[1.5, 0], [10.5, 0]],
  },
  6: {
    strokes: [[...arc(7, 11, 5.5, 11, -45 * D, -180 * D, 10), ...arc(6, 16, 6, 6, 180 * D, 540 * D, 20)]],
    pegs: [[3.5, 1.4], [10.5, 2.5]],
  },
  7: { strokes: [[[0, 0], [12, 0], [4, 22]]], pegs: [[1, 0], [11, 0]] },
  8: { strokes: [arc(6, 5.5, 5.2, 5.5, 90 * D, 450 * D, 18), arc(6, 16.5, 6, 5.5, -90 * D, 270 * D, 18)], pegs: [[2.6, 1.6], [9.4, 1.6]] },
  9: {
    strokes: [[...arc(6, 6, 6, 6, 0, 360 * D, 20), ...arc(5, 11, 5.5, 11, 0, 130 * D, 10).slice(1)]],
    pegs: [[2.2, 1.7], [9.8, 1.7]],
  },
};
