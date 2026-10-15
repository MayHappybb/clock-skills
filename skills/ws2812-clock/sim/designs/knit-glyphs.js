// Knit: the ten numerals as Fair Isle chart motifs, 4 stitches x 6 rows.
// One stitch is a 6 x 4 LED knit V, so a glyph is 24 x 24 LEDs and every
// stroke is one column or one row of stitches, like the numbers knitted
// into a real jumper; the round shading of the V's does the rest.
export const GW = 4, GH = 6;
export const GLYPHS = [
  ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'], // 0
  ['..#.', '.##.', '..#.', '..#.', '..#.', '.###'], // 1
  ['.##.', '#..#', '...#', '.##.', '#...', '####'], // 2
  ['###.', '...#', '.##.', '...#', '...#', '###.'], // 3
  ['..##', '.#.#', '#..#', '####', '...#', '...#'], // 4
  ['####', '#...', '###.', '...#', '...#', '###.'], // 5
  ['.##.', '#...', '###.', '#..#', '#..#', '.##.'], // 6
  ['####', '...#', '..#.', '..#.', '.#..', '.#..'], // 7
  ['.##.', '#..#', '.##.', '#..#', '#..#', '.##.'], // 8
  ['.##.', '#..#', '#..#', '.###', '...#', '.##.'], // 9
];

/** Ink cells of each digit in the order a darning needle sews them: row by
 *  row, alternating direction (boustrophedon). Each entry is [col, row]. */
export const SEW = GLYPHS.map((rows) => {
  const out = [];
  for (let j = 0; j < GH; j++) {
    const xs = [];
    for (let i = 0; i < GW; i++) if (rows[j][i] === '#') xs.push(i);
    if (j % 2) xs.reverse();
    for (const i of xs) out.push([i, j]);
  }
  return out;
});
