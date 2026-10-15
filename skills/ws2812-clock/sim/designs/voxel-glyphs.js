// Bricklayer's numerals for the voxel face. Each digit is 9 courses of unit
// bricks laid on a HALF-brick grid ("[]" = one brick, two characters wide):
// courses may shift by half a brick, as in running bond, so curves and
// diagonals step by half a block instead of a whole one. 5 bricks wide.
//
// Every course of every digit has at least one brick: that is what lets two
// numerals be carved into one block (see triplet() in voxel.js).

const G = {
  0: ['..[][][]..',
      '.[]....[].',
      '[]......[]',
      '[]......[]',
      '[]......[]',
      '[]......[]',
      '[]......[]',
      '.[]....[].',
      '..[][][]..'],
  1: ['....[]....',
      '..[][]....',
      '....[]....',
      '....[]....',
      '....[]....',
      '....[]....',
      '....[]....',
      '....[]....',
      '..[][][]..'],
  2: ['..[][][]..',
      '.[]....[].',
      '........[]',
      '.......[].',
      '......[]..',
      '....[]....',
      '..[]......',
      '.[].......',
      '[][][][][]'],
  3: ['..[][][]..',
      '.[]....[].',
      '........[]',
      '.......[].',
      '...[][]...',
      '.......[].',
      '........[]',
      '.[]....[].',
      '..[][][]..'],
  4: ['......[]..',
      '....[][]..',
      '...[].[]..',
      '..[]..[]..',
      '.[]...[]..',
      '[][][][][]',
      '......[]..',
      '......[]..',
      '......[]..'],
  5: ['[][][][][]',
      '[]........',
      '[]........',
      '[][][][]..',
      '.......[].',
      '........[]',
      '........[]',
      '.[]....[].',
      '..[][][]..'],
  6: ['....[][]..',
      '...[].....',
      '.[].......',
      '[]........',
      '[][][][]..',
      '[].....[].',
      '[]......[]',
      '.[]....[].',
      '..[][][]..'],
  7: ['[][][][][]',
      '........[]',
      '.......[].',
      '......[]..',
      '.....[]...',
      '....[]....',
      '...[].....',
      '...[].....',
      '...[].....'],
  8: ['..[][][]..',
      '.[]....[].',
      '[]......[]',
      '.[]....[].',
      '..[][][]..',
      '.[]....[].',
      '[]......[]',
      '.[]....[].',
      '..[][][]..'],
  9: ['..[][][]..',
      '.[]....[].',
      '[]......[]',
      '.[].....[]',
      '..[][][][]',
      '........[]',
      '.......[].',
      '.....[]...',
      '..[][]....'],
};

export const ROWS = 9, HALF = 10;   // courses, half-brick columns per digit

/** GLYPH[d][row] = sorted half-column starts of the bricks in that course (row 0 = top). */
export const GLYPH = {};
for (const [d, rows] of Object.entries(G)) {
  if (rows.length !== ROWS) throw new Error(`glyph ${d}: ${rows.length} rows`);
  GLYPH[d] = rows.map((r, j) => {
    if (r.length !== HALF) throw new Error(`glyph ${d} row ${j}: width ${r.length}`);
    const out = [];
    for (let k = 0; k < r.length; k++) if (r[k] === '[') { if (r[k + 1] !== ']') throw new Error(`glyph ${d} row ${j}`); out.push(k); }
    if (!out.length) throw new Error(`glyph ${d} row ${j} is empty`);
    return out;
  });
}

/** Two digits as courses on one half-grid: the second digit starts 12 half-columns in (a one-brick gap). Width 22 = 11 bricks. */
export const STR_HALF = 22;
export function courses(str) {
  const out = [];
  for (let j = 0; j < ROWS; j++) out.push([...GLYPH[str[0]][j], ...GLYPH[str[1]][j].map((k) => k + 12)]);
  return out;
}
