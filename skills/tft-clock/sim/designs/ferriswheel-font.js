// ferriswheel: the wheel's light programme. Each digit is stored the way a
// propeller clock stores it: one row per ring of bulbs (10 rings, row 0 the
// innermost), and seven angular columns per digit. The letterform is a
// Victorian fat face, the type of fairground posters: fat radial stems, one-
// ring hairlines, and in the wheel the stems all point at the hub.

const ROWS = 10, COLS = 7;

// Drawn top (outer ring) to bottom (inner ring).
const ART = {
  0: `
.#####.
##...##
##...##
##...##
##...##
##...##
##...##
##...##
##...##
.#####.`,
  1: `
...##..
.####..
...##..
...##..
...##..
...##..
...##..
...##..
...##..
.######`,
  2: `
.#####.
##...##
.....##
.....##
....##.
...##..
..##...
.##....
##.....
#######`,
  3: `
.#####.
##...##
.....##
.....##
..####.
.....##
.....##
.....##
##...##
.#####.`,
  4: `
....##.
...###.
..#.##.
.#..##.
#...##.
#...##.
#######
....##.
....##.
...####`,
  5: `
#######
##.....
##.....
######.
.....##
.....##
.....##
.....##
##...##
.#####.`,
  6: `
.#####.
##...##
##.....
##.....
######.
##...##
##...##
##...##
##...##
.#####.`,
  7: `
#######
##...##
.....##
....##.
....##.
...##..
...##..
..##...
..##...
..##...`,
  8: `
.#####.
##...##
##...##
##...##
.#####.
##...##
##...##
##...##
##...##
.#####.`,
  9: `
.#####.
##...##
##...##
##...##
##...##
.######
.....##
.....##
##...##
.#####.`,
};

/** GLYPH[d][row * COLS + col] = 1 when bulb `row` (0 = innermost) is lit in column `col`. */
export const GLYPH = {};
for (const [d, art] of Object.entries(ART)) {
  const lines = art.trim().split('\n');
  if (lines.length !== ROWS || lines.some((l) => l.length !== COLS)) throw new Error(`ferriswheel glyph ${d} is not ${COLS}x${ROWS}`);
  const g = new Uint8Array(ROWS * COLS);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) g[(ROWS - 1 - j) * COLS + i] = lines[j][i] === '#' ? 1 : 0;
  GLYPH[d] = g;
}

/** The colon: two dots, two columns by two rings each. */
export const COLON = new Uint8Array(ROWS * 2);
for (const row of [2, 3, 6, 7]) COLON[row * 2] = COLON[row * 2 + 1] = 1;

export { ROWS, COLS };
