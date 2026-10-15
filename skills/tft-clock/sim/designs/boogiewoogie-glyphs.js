// Boogie-Woogie's numerals: each digit is a little street plan, drawn only in
// horizontals and verticals as Mondrian drew. A digit is a set of
// intersections (nodes, one square each, the colour squares that sit where
// Broadway Boogie Woogie's lines cross) and one-way streets between them;
// traffic squares run down every street from its first node to its second.
//
// Coordinates are fractions of the slot: x 0 = left column, 1 = right
// column; y 0 = top row, 1 = bottom row. Crossbars sit at different heights
// per digit (the 5's high, the 4's low, the 8's upper loop smaller), so the
// set is a city plan, not a segment display; the 4's crossbar runs on past
// its stem the way an avenue crosses a street, the 1 has a flag and a foot.
// Every counter is open ground at least 12 x 13 px in the minutes' size.

export const GLYPHS = {
  0: { n: [[0, 0], [1, 0], [1, 1], [0, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  1: { n: [[0.22, 0], [0.62, 0], [0.62, 1], [0.12, 1], [1, 1]], e: [[0, 1], [1, 2], [3, 2], [2, 4]] },
  2: { n: [[0, 0], [1, 0], [1, 0.5], [0, 0.5], [0, 1], [1, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  3: { n: [[0, 0], [1, 0], [1, 0.48], [0.28, 0.48], [1, 1], [0, 1]], e: [[0, 1], [1, 2], [3, 2], [2, 4], [4, 5]] },
  4: { n: [[0, 0], [0, 0.62], [0.68, 0.62], [1, 0.62], [0.68, 0], [0.68, 1]], e: [[0, 1], [1, 2], [2, 3], [4, 2], [2, 5]] },
  5: { n: [[1, 0], [0, 0], [0, 0.44], [1, 0.44], [1, 1], [0, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  6: { n: [[1, 0], [0, 0], [0, 0.5], [0, 1], [1, 1], [1, 0.5]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]] },
  7: { n: [[0, 0], [1, 0], [1, 1]], e: [[0, 1], [1, 2]] },
  8: { n: [[0, 0], [1, 0], [1, 0.46], [0, 0.46], [0, 1], [1, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 2]] },
  9: { n: [[0, 0], [1, 0], [1, 0.5], [0, 0.5], [1, 1], [0, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5]] },
};

/**
 * A digit laid out in a slot: node squares (top-left corners, s x s) and
 * street interiors between them. Street: { x, y, w, h, o, d, ax, L } where
 * the interior is the box (x, y, w, h), `ax` 0 = horizontal, 1 = vertical,
 * `o` the pixel where traffic enters, `d` +1/-1 its direction, L its length.
 */
export function layout(digit, x0, y0, w, h, s) {
  const gl = GLYPHS[digit];
  const nodes = gl.n.map(([fx, fy]) => [x0 + Math.round(fx * (w - s)), y0 + Math.round(fy * (h - s))]);
  const streets = gl.e.map(([a, b], i) => {
    const [ax, ay] = nodes[a], [bx, by] = nodes[b];
    if (ay === by) {
      const d = bx > ax ? 1 : -1;
      const lo = d > 0 ? ax + s : bx + s, hi = d > 0 ? bx : ax;
      return { x: lo, y: ay, w: hi - lo, h: s, ax: 0, d, o: d > 0 ? lo : hi, L: hi - lo, i };
    }
    const d = by > ay ? 1 : -1;
    const lo = d > 0 ? ay + s : by + s, hi = d > 0 ? by : ay;
    return { x: ax, y: lo, w: s, h: hi - lo, ax: 1, d, o: d > 0 ? lo : hi, L: hi - lo, i };
  });
  return { nodes, streets, s };
}
