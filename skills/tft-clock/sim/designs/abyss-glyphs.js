// The numerals of abyss.js, as shoal formations.
//
// A digit is 7 rows of lanternfish, 6.5 px apart (a 1.5 px dark gap between
// rows). Every fish in a school faces the same way, so each fish is a
// horizontal lozenge 12 x 5 px: stacked fish make the stems of the
// numerals, fish side by side the bars, and the set falls out as a bold
// rounded face built from fish, drawn here row by row in a 34 px box (left
// stem at 0, right stem at 22, a 10 px counter between).
//
// Each row lists the left edge (px) of each fish.

export const ROWS = 7, PITCH = 6.5, FISH_W = 12, BOX_W = 34, BOX_H = (ROWS - 1) * PITCH + 5;

export const GLYPHS = {
  0: [[4.5, 17.5], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22], [4.5, 17.5]],
  1: [[13], [1, 13], [13], [13], [13], [13], [6.5, 19.5]],
  2: [[4.5, 17.5], [0, 22], [22], [15], [8], [1.5], [0, 11, 22]],
  3: [[4.5, 17.5], [0, 22], [22], [9, 21], [22], [0, 22], [4.5, 17.5]],
  4: [[17], [11, 22], [5, 22], [0, 22], [0, 11, 22], [22], [22]],
  5: [[0, 11, 22], [0], [1, 14], [22], [22], [0, 22], [4.5, 17.5]],
  6: [[7.5, 20], [1], [0, 12.5], [0, 22], [0, 22], [0, 22], [4.5, 17.5]],
  7: [[0, 11, 22], [22], [18], [14.5], [11.5], [9.5], [8.5]],
  8: [[4.5, 17.5], [0, 22], [1.5, 20.5], [11], [0, 22], [0, 22], [4.5, 17.5]],
  9: [[4.5, 17.5], [0, 22], [0, 22], [4.5, 22], [22], [21], [4, 16.5]],
};

/**
 * The fish of a digit as flat arrays: x (left), y (top), row, the order
 * they light up in (0..1, top to bottom with a little scatter), and which
 * outer edge of its row a fish is on (-1 leftmost, +1 rightmost, 2 alone,
 * 0 inside), for the restless darts.
 */
export const FISH = {};
for (const d of Object.keys(GLYPHS)) {
  const xs = [], ys = [], rows = [], edge = [];
  GLYPHS[d].forEach((row, r) => row.forEach((x, i) => {
    xs.push(x); ys.push(r * PITCH); rows.push(r);
    edge.push(row.length === 1 ? 2 : i === 0 ? -1 : i === row.length - 1 ? 1 : 0);
  }));
  const n = xs.length;
  const order = xs.map((x, k) => {
    const j = (((k * 2654435761) >>> 0) % 1000) / 1000;        // fixed scatter per fish
    return Math.min(1, Math.max(0, (rows[k] + 0.7 * j) / (ROWS - 0.3)));
  });
  FISH[d] = { n, x: Float32Array.from(xs), y: Float32Array.from(ys), row: Int8Array.from(rows), order: Float32Array.from(order), edge: Int8Array.from(edge) };
}
