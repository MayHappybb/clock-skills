// Tangram numerals and figures. Each is the silhouette two tangram sets make
// together (14 pieces, 16 cells), drawn on the cell grid with 45-degree
// cuts (notation in tangram-pieces.js). Digits sit on a 4 x 6 grid with open
// counters; the big triangles settle where a stroke turns a corner, which is
// what gives the numerals their pinwheel bowls. Figures (for the hour) may be
// 5 cells wide and are centred on their slot.

export const DIGITS = {
  0: ['3##1', '#79#', '#..#', '#..#', '#13#', '9##7'],
  1: ['3##.', '###.', '9##.', '.##.', '.##.', '####'],
  2: ['3##1', '#79#', '..##', '.3#7', '3#7.', '####'],
  3: ['3##1', '#..#', '.###', '.79#', '#13#', '9##7'],
  4: ['3.3#', '#.##', '#.##', '####', '..##', '..##'],
  5: ['####', '#...', '###1', '..9#', '#13#', '9##7'],
  6: ['3##.', '#...', '###1', '#79#', '#13#', '9##7'],
  7: ['####', '.3##', '3##7', '##7.', '##..', '##..'],
  8: ['3##1', '#..#', '#13#', '#79#', '#..#', '9##7'],
  9: ['3##1', '#79#', '#13#', '9###', '...#', '.##7'],
};

/** The hour's menagerie: each changing digit turns into one of these for a moment. */
export const FIGURES = {
  cat: ['1.3..', '###..', '9#7..', '3##1.', '####1', '.##7.'],   // sitting, tail curled low (an upright tail read as a 4)
  boat: ['..1..', '.3#1.', '.###1', '..#..', '#####', '9###7'],
};
// Tried and dropped, because beside the other hour digit they read as numbers: a swan (its neck a 2),
// a rabbit (its ears a 4), a fish (its solid round body a 0).
export const FIG_ORDER = ['cat', 'boat'];

/** The corner puzzle: one plain set solving a printed problem, one per minute. */
export const PROBLEMS = {
  boat: ['.1..', '.#1.', '3##1', '9##7'],
  tree: ['.31.', '3##1', '.31.', '3##1'],
  house: ['.31.', '3##1', '.##.', '.##.'],
};
export const PROBLEM_ORDER = ['boat', 'tree', 'house'];
