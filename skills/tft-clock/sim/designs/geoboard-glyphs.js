// Geoboard numerals: each digit is ONE rubber band stretched over the pegs
// of a 4 x 7 patch of the board, as a path of pegs (column, row). The band
// is doubled along the path (out on one side of the pegs, back on the
// other), so every stroke is the same weight: a fat taut strand with the
// pegs it straddles showing through. Curves are what a geoboard can do:
// straight pulls between pegs, every round corner cut by one diagonal cell.
//
// For the minute turn each path is spread over N anchors (the points where
// the band touches a peg; a peg can hold several), matched by arc length,
// so anchor i of one digit has a natural partner in every other digit.
//
// All of this is built at load: flash tables of a few hundred bytes.

export const N = 20;

// paths over the 4 x 7 peg patch: c 0..3 left to right, r 0..6 top to bottom
export const PATHS = [
  /* 0 */ [[1, 0], [2, 0], [3, 1], [3, 5], [2, 6], [1, 6], [0, 5], [0, 1], [1, 0]],
  /* 1 */ [[1, 1], [2, 0], [2, 6], [1, 6], [3, 6]],
  /* 2 */ [[0, 1], [1, 0], [2, 0], [3, 1], [3, 2], [0, 6], [3, 6]],
  /* 3 */ [[0, 1], [1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [2, 3], [3, 4], [3, 5], [2, 6], [1, 6], [0, 5]],
  /* 4 */ [[3, 4], [0, 4], [2, 0], [2, 6]],
  /* 5 */ [[3, 0], [0, 0], [0, 3], [2, 3], [3, 4], [3, 5], [2, 6], [0, 6]],
  /* 6 */ [[3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [2, 6], [3, 5], [3, 4], [2, 3], [0, 3]],
  /* 7 */ [[0, 0], [3, 0], [3, 1], [1, 4], [1, 6]],
  /* 8 */ [[1, 3], [0, 2], [0, 1], [1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 4], [0, 5], [1, 6], [2, 6], [3, 5], [3, 4], [2, 3]],
  /* 9 */ [[0, 6], [2, 6], [3, 5], [3, 1], [2, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3]],
];

/**
 * Spread a path of M pegs over N anchors: a monotone, onto assignment
 * (every peg keeps at least one anchor) whose arc-length positions are as
 * close as possible to i / (N - 1). Small dynamic programme, at load.
 */
function spread(path) {
  const M = path.length, s = [0];
  for (let j = 1; j < M; j++) s.push(s[j - 1] + Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]));
  const L = s[M - 1];
  const f = s.map((v) => v / L);
  // D[i][j]: best cost with anchors 0..i assigned and anchor i on peg j
  const INF = 1e9, D = [], P = [];
  for (let i = 0; i < N; i++) { D.push(new Array(M).fill(INF)); P.push(new Array(M).fill(-1)); }
  const c = (i, j) => (f[j] - i / (N - 1)) ** 2;
  D[0][0] = c(0, 0);
  for (let i = 1; i < N; i++)
    for (let j = 0; j < M; j++) {
      // stay on peg j, or step from peg j-1 (no skipping pegs)
      let best = D[i - 1][j], bp = j;
      if (j > 0 && D[i - 1][j - 1] < best) { best = D[i - 1][j - 1]; bp = j - 1; }
      if (best < INF) { D[i][j] = best + c(i, j); P[i][j] = bp; }
    }
  const out = new Array(N);
  let j = M - 1;
  for (let i = N - 1; i >= 0; i--) { out[i] = path[j]; j = P[i][j]; }
  return out;
}

/** ANCHORS[d][i] = [c, r]: the peg anchor i of digit d sits on. */
export const ANCHORS = PATHS.map(spread);
