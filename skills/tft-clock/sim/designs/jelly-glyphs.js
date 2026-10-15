// Jelly numerals: the centre lines of ten moulded jelly digits, drawn for
// this face (not the kit's stroke font). Each digit is ONE polyline (some
// retrace themselves to branch), stroked very heavy with round ends, so a
// translucent layer never doubles up at a joint. Bowls are superellipses
// (exponent 2.6), squarer than circles: the soft-cornered block of a
// pressed jelly mould rather than a pen stroke. Every digit stands on a flat
// foot: the stroke runs a pixel below the base line and is clipped there.
//
// Unit box: u 0..1 left to right, v 0..1 top to bottom, for the centre line.
// Computed once at load (plain Math is fine here; nothing runs per frame).

const N = 2.6;
const spow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

/** Superellipse arc, screen angles in degrees (0 right, 90 down), inclusive. */
function sq(cx, cy, rx, ry, a0, a1, step = 15) {
  const out = [], n = Math.max(2, Math.round(Math.abs(a1 - a0) / step));
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    out.push([cx + rx * spow(Math.cos(a), 2 / N), cy + ry * spow(Math.sin(a), 2 / N)]);
  }
  return out;
}

/** Quadratic Bezier, n segments, inclusive. */
function bez(p0, c, p1, n = 6) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
    out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
  return out;
}

const cat = (...parts) => parts.flat().reduce((acc, p) => {
  const q = acc[acc.length - 1];
  if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) acc.push(p);
  return acc;
}, []);

export const GLYPHS = [
  // 0: a squared ring
  cat(sq(0.5, 0.5, 0.5, 0.5, -90, 270)),
  // 1: flag, stem, and a wide foot to stand on
  cat([[0.06, 0.27], [0.56, 0], [0.56, 1], [0.04, 1], [1, 1]]),
  // 2: bowl, a bellied neck, the foot
  cat(sq(0.5, 0.3, 0.5, 0.3, 185, 375), bez([0.99, 0.37], [0.62, 0.66], [0, 1]), [[1, 1]]),
  // 3: two bowls and a short tongue at the waist
  cat(sq(0.48, 0.25, 0.47, 0.25, 205, 450), [[0.26, 0.49], [0.5, 0.47]], sq(0.5, 0.72, 0.5, 0.28, 270, 517)),
  // 4: closed, crossbar through the stem
  cat([[1, 0.7], [0, 0.7], [0.68, 0], [0.68, 1]]),
  // 5: flag, drop, a big belly
  cat([[0.97, 0], [0.08, 0], [0.04, 0.47]], sq(0.48, 0.68, 0.52, 0.32, 213, 517)),
  // 6: a swept tail into a bottom loop
  cat(bez([0.9, 0.03], [0.06, 0.06], [0, 0.66], 7), sq(0.5, 0.68, 0.5, 0.32, 180, 540)),
  // 7: bar and a curved stem
  cat([[0, 0], [1, 0]], bez([1, 0], [0.5, 0.42], [0.4, 1], 6)),
  // 8: small top loop on a big bottom loop
  cat(sq(0.5, 0.235, 0.42, 0.235, 90, 450), sq(0.5, 0.71, 0.5, 0.29, 270, 630)),
  // 9: top loop with a swept tail
  cat(sq(0.5, 0.33, 0.5, 0.33, 0, 360), bez([1, 0.36], [0.98, 0.94], [0.1, 1], 7)),
];

/** Where each digit wears its eyes (unit box, on the centre line), and how far apart. */
export const FACE = [
  [0.5, 0.02, 1], [0.56, 0.36, 0.9], [0.52, 0.0, 1], [0.48, 0.0, 1], [0.68, 0.33, 0.9],
  [0.55, 0.0, 1], [0.55, 0.37, 1], [0.5, 0.0, 1], [0.5, 0.01, 1], [0.5, 0.0, 1],
];
