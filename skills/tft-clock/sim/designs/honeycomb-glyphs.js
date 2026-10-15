// The numerals of "honeycomb": a 5 x 9 face drawn on the hex lattice itself,
// one cell per stroke. Even rows have five places (0..4); odd rows sit half a
// cell to the right and have four (0.5..3.5). A cell touches the cells either
// side in its row and the two half-offset cells above and below, so strokes
// zigzag the way comb does; every stroke is one cell wide and every counter
// at least two cells across, so a counter can never fill in.
//
// Each glyph lists, per row, the places that hold honey.

const G = (rows) => rows.map((r) => r.trim() === '' ? [] : r.trim().split(/\s+/).map(Number));

export const GLYPHS = [
  // 0
  G(['1 2 3', '0.5 3.5', '0 4', '0.5 3.5', '0 4', '0.5 3.5', '0 4', '0.5 3.5', '1 2 3']),
  // 1: a flag on a zigzag stem, and a foot
  G(['2', '1.5 2.5', '1 2', '2.5', '2', '2.5', '2', '2.5', '1 2 3']),
  // 2
  G(['1 2 3', '0.5 3.5', '4', '3.5', '3', '1.5 2.5', '1', '0.5', '0 1 2 3 4']),
  // 3
  G(['1 2 3', '0.5 3.5', '4', '3.5', '2 3', '3.5', '4', '0.5 3.5', '1 2 3']),
  // 4: closed, the diagonal leaving the top of the stem, the bar overhanging it
  G(['3', '2.5 3.5', '2 3', '1.5 3.5', '1 3', '0.5 3.5', '0 1 2 3 4', '3.5', '3']),
  // 5
  G(['0 1 2 3 4', '0.5', '0', '0.5 1.5 2.5', '3', '3.5', '4', '0.5 3.5', '1 2 3']),
  // 6: the 9 turned round; the top stays open on the right
  G(['1 2 3', '0.5', '0', '0.5 1.5 2.5', '0 3', '0.5 3.5', '0 4', '0.5 3.5', '1 2 3']),
  // 7
  G(['0 1 2 3 4', '3.5', '3', '2.5', '2', '1.5', '1', '1.5', '1']),
  // 8
  G(['1 2 3', '0.5 3.5', '0 4', '0.5 3.5', '1 2 3', '0.5 3.5', '0 4', '0.5 3.5', '1 2 3']),
  // 9
  G(['1 2 3', '0.5 3.5', '0 4', '0.5 3.5', '1 4', '1.5 2.5 3.5', '4', '3.5', '1 2 3']),
];
