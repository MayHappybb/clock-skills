// Invaders: the sprites, the formation font and the cellophane bands.
//
// Everything the game draws is one-colour phosphor (a mask); colour comes
// only from the cellophane strip glued over the glass at that height, as on
// the 1978 cabinet. So sprites here are bare 1-bit masks.

/** A 1-bit mask from rows of '#' and '.'. */
export function mask(rows) {
  const r = rows.trim().split('\n').map((l) => l.trim());
  const h = r.length, w = r[0].length, d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = r[y][x] === '#' ? 1 : 0;
  // the set pixels as a flat [x, y, x, y, ...] list: blitting walks only these
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[y * w + x]) pts.push(x, y);
  return { w, h, d, pts: Int8Array.from(pts) };
}

// ------------------------------------------------------------ the aliens (7 x 5, two frames each)
// squid: the pointed head (top rows of the formation)
export const SQUID = [mask(`
..###..
.#####.
##.#.##
#######
.#.#.#.`), mask(`
..###..
.#####.
##.#.##
#######
#.#.#.#`)];
// crab: antennae and claws (middle rows)
export const CRAB = [mask(`
.#...#.
.#####.
##.#.##
#######
#.....#`), mask(`
#.....#
.#####.
##.#.##
#######
.#...#.`)];
// octopus: the wide dome and tentacles (bottom rows)
export const OCTO = [mask(`
.#####.
#######
##.#.##
#######
.##.##.`), mask(`
.#####.
#######
##.#.##
#######
##...##`)];
/** Which alien a formation row is made of: the arcade's own order, squids on top. */
export const SPECIES = [SQUID, SQUID, CRAB, CRAB, CRAB, OCTO, OCTO];

// the colon: two small squids, a size down so they never read as a digit cell
export const BABY = [mask(`
.###.
#.#.#
#####
.#.#.`), mask(`
.###.
#.#.#
#####
#...#`)];

// the explosion splat, the arcade's starburst (also run backwards to warp a new alien in)
export const SPLAT = mask(`
#..#..#
.#...#.
##...##
.#...#.
#..#..#`);
export const SPARK = mask(`
#.#
.#.
#.#`);

// the saucer
export const UFO = mask(`
...#####...
.#########.
##.##.##.##
###########
..##...##..`);
export const UFO_BOOM = mask(`
#...#.#...#
.#.#...#.#.
..#.....#..
.#.#...#.#.
#...#.#...#`);

// the laser base
export const CANNON = mask(`
....#....
...###...
.#######.
#########
#########`);

// the bunker
export const SHIELD = mask(`
...##########...
..############..
.##############.
################
#####......#####
####........####`);

// the aliens' bombs: the squiggly and the plunger, two frames each
export const BOMBS = [
  [mask(`
#..
.#.
..#
.#.
#..`), mask(`
..#
.#.
#..
.#.
..#`)],
  [mask(`
.#.
.#.
.#.
###
.#.`), mask(`
.#.
###
.#.
.#.
.#.`)],
];

// ------------------------------------------------------------ the formation font
// Each numeral is a formation of 4 x 7 aliens: '#' is an alien. Corners are
// left out so the bowls read round, counters are two aliens wide and open
// sides stay open. The 1 is centred by a half cell (its rows shift by 0.5).
const GLYPHS = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  1: ['.#..', '##..', '.#..', '.#..', '.#..', '.#..', '###.'],
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'],
  3: ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'],
  4: ['..#.', '.##.', '#.#.', '#.#.', '####', '..#.', '..#.'],
  5: ['####', '#...', '###.', '...#', '...#', '#..#', '.##.'],
  6: ['..##', '.#..', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '#..#', '.###', '...#', '..#.', '##..'],
};
const SHIFT = { 1: 0.5 };

/** The cells of numeral d: [{ col, row, bottom }], col may be fractional. */
export const FONT = Array.from({ length: 10 }, (_, d) => {
  const g = GLYPHS[d], cells = [];
  for (let row = 0; row < 7; row++)
    for (let c = 0; c < 4; c++)
      if (g[row][c] === '#') {
        let bottom = true;
        for (let r = row + 1; r < 7; r++) if (g[r][c] === '#') bottom = false;
        cells.push({ col: c + (SHIFT[d] ?? 0), row, bottom });
      }
  return cells;
});

// ------------------------------------------------------------ the cellophane
// The strips on the glass, top to bottom: red over the saucer lane, then
// amber, white and cyan through the formation, and the classic green over
// the bunkers and the base. Five flat colours and nothing in between.
export const STRIPS = [0xff3c5a, 0xffa22e, 0xf4f1e6, 0x3fd6ff, 0x3cf05a];
export const STRIP_TOP = [0, 9, 21, 33, 59];     // first row of each strip
export const stripOf = (y) => (y >= 59 ? 4 : y >= 33 ? 3 : y >= 21 ? 2 : y >= 9 ? 1 : 0);
