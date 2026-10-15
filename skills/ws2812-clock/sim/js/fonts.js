// Type for LED lattices.
//
// STROKE  vector digits, polylines in a 4 x 7 box. Geometry-agnostic: sample
//         the distance to the strokes at each LED (kit.strokes / kit.drawStrokes),
//         so they work on any board, any layout, any size, across seams.
// COMB    lattice-native digits for the triangular lattice (hexagon, triangle).
//         Points are [col, k]: col is a column, k a HALF-row (y = k * pitch/2);
//         a dot exists only where col + k is even. Every stroke is a chain of
//         nearest neighbours, so it is as dense as the lattice allows:
//           vertical    same column, k += 2
//           30 degrees  next column, k +- 1
//           "horizontal" is a zigzag (k, k+1, k, ...): there is no straight
//                        horizontal line on this lattice
//         Glyphs are 5 columns x 13 half-rows (7 dots tall), pointed arches top
//         and bottom: the lattice's own shape, not a square font forced onto it.
// SQ3X5   a 3x5 bitmap for square lattices.

const RAD = Math.PI / 180;

function arc(cx, cy, r, a0, a1, n = 14) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + ((a1 - a0) * i) / n) * RAD;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}
const flip = (paths) => paths.map((p) => p.map(([x, y]) => [4 - x, 7 - y]));

// Angles: degrees, y down, so increasing angle runs clockwise on screen.
const SIX = [[...arc(4.6, 5, 4.6, 180, 252, 8)], arc(2, 5, 2, 0, 360, 24)];
export const STROKE = {
  width: 4, height: 7, advance: 5.6,
  glyphs: {
    '0': [[[0, 2], [0, 5], ...arc(2, 5, 2, 180, 0, 12).slice(1), [4, 2], ...arc(2, 2, 2, 0, -180, 12).slice(1)]],
    '1': [[[0.9, 1.4], [2.4, 0], [2.4, 7]]],
    '2': [[...arc(2, 2, 2, 180, 390, 16), [0, 7], [4.1, 7]]],
    '3': [[...arc(2, 1.75, 1.75, 200, 450, 14), ...arc(2, 5.2, 1.8, 270, 520, 14).slice(1)]],
    '4': [[[3, 7], [3, 0], [0, 5], [4.2, 5]]],
    '5': [[[3.8, 0], [0.5, 0], [0.2, 3.3], ...arc(2, 4.95, 2.05, 236, 520, 16).slice(1)]],
    '6': SIX,
    '7': [[[0, 0], [4, 0], [1.4, 7]]],
    '8': [arc(2, 1.7, 1.7, 0, 360, 20), arc(2, 5.1, 1.9, 0, 360, 22)],
    '9': flip(SIX),
    ':': [[[2, 2.2], [2, 2.2]], [[2, 4.8], [2, 4.8]]],
    ' ': [],
  },
};
STROKE.glyphs[':'].advance = 2.4;

export const COMB = {
  cols: 5, k: 13, advance: 6,          // advance in columns; keep it even so parity holds
  glyphs: {
    '0': [[[2, 0], [3, 1], [4, 2], [4, 4], [4, 6], [4, 8], [4, 10], [3, 11], [2, 12], [1, 11], [0, 10], [0, 8], [0, 6], [0, 4], [0, 2], [1, 1], [2, 0]]],
    '1': [[[0, 2], [1, 1], [2, 0], [2, 2], [2, 4], [2, 6], [2, 8], [2, 10], [2, 12]], [[0, 12], [1, 11], [2, 12], [3, 11], [4, 12]]],
    '2': [[[0, 2], [1, 1], [2, 0], [3, 1], [4, 2], [4, 4], [3, 5], [2, 6], [1, 7], [0, 8], [0, 10], [0, 12]], [[0, 12], [1, 11], [2, 12], [3, 11], [4, 12]]],
    '3': [[[0, 2], [1, 1], [2, 0], [3, 1], [4, 2], [4, 4], [3, 5], [2, 6]], [[2, 6], [3, 7], [4, 8], [4, 10], [3, 11], [2, 12], [1, 11], [0, 10]]],
    '4': [[[4, 12], [4, 10], [4, 8], [4, 6], [4, 4], [4, 2], [4, 0], [3, 1], [2, 2], [1, 3], [0, 4], [0, 6], [0, 8], [1, 9], [2, 8], [3, 9], [4, 8]]],
    '5': [[[4, 0], [3, 1], [2, 0], [1, 1], [0, 0], [0, 2], [0, 4], [0, 6], [1, 5], [2, 4], [3, 5], [4, 6], [4, 8], [4, 10], [3, 11], [2, 12], [1, 11], [0, 10]]],
    '6': [[[4, 2], [3, 1], [2, 0], [1, 1], [0, 2], [0, 4], [0, 6], [0, 8], [0, 10], [1, 11], [2, 12], [3, 11], [4, 10], [4, 8], [3, 7], [2, 6], [1, 7], [0, 8]]],
    '7': [[[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [4, 2], [3, 3], [3, 5], [2, 6], [2, 8], [2, 10], [2, 12]]],
    '8': [[[2, 0], [3, 1], [4, 2], [4, 4], [3, 5], [2, 6], [1, 5], [0, 4], [0, 2], [1, 1], [2, 0]],
          [[2, 6], [3, 7], [4, 8], [4, 10], [3, 11], [2, 12], [1, 11], [0, 10], [0, 8], [1, 7], [2, 6]]],
    '9': [[[2, 0], [3, 1], [4, 2], [4, 4], [4, 6], [4, 8], [4, 10], [3, 11], [2, 12], [1, 11], [0, 10]],
          [[4, 4], [3, 5], [2, 6], [1, 5], [0, 4], [0, 2], [1, 1], [2, 0]]],
    ':': [[[0, 4]], [[0, 8]]],
  },
};

/** The distinct dots of a COMB glyph, in stroke order. */
export function combDots(ch) {
  const seen = new Set(), out = [];
  for (const path of COMB.glyphs[ch] ?? []) for (const [c, k] of path) {
    const key = c * 100 + k;
    if (!seen.has(key)) { seen.add(key); out.push([c, k]); }
  }
  return out;
}

export const SQ3X5 = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['.', '#', '.', '#', '.'],
};
