// The ten numerals of 'knots', each tied from rope: centre lines in a
// 10 x 18 box (y down), as strands of points [x, y, z]. A point with z = 1
// lies OVER whatever it crosses (the stamp cuts a keyline into the pass
// under it). Every strand starts at a seizing (a served collar of twine),
// and runs out to a whipped free end; strand 0 starts at the top, where the
// numeral hangs from its lanyard. At the turn each strand is hauled back
// through its seizing, so it shortens from its free end.
//
// Real ropework where the shape allows: the 0 is a grommet seized at its
// crown, the 8 a figure-eight with a true crossing at the waist, the 4's
// crossbar is laid over its post, the 6 and 9 tuck their end over the stem,
// the 3's lower bowl is seized onto the end of the upper.

const D = Math.PI / 180;

/** Ellipse arc from a0 to a1 degrees (0 = right, 90 = down), as points. */
function arc(cx, cy, rx, ry, a0, a1, z = 0, step = 6) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const o = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D;
    o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), z]);
  }
  return o;
}

/** A straight run from the last point to (x1, y1), every ~1 unit. */
function to(p, x1, y1, z = 0) {
  const [x0, y0] = p[p.length - 1];
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.0));
  for (let i = 1; i <= n; i++) p.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, z]);
  return p;
}
const cat = (p, q) => { for (const v of q) p.push(v); return p; };
const zed = (p, back, z = 1) => p.map((v, i) => (i >= p.length - back ? [v[0], v[1], z] : v));

export const GLYPHS = [];

// 0: a grommet hung by its crown
GLYPHS[0] = [arc(5, 9, 4.9, 8.8, -90, 266)];

// 1: post, and the flag laid down from the same seizing
GLYPHS[1] = [
  to([[6.3, 0.3, 0]], 6.3, 18),
  to(to([[6.3, 0.3, 0]], 4.0, 2.6), 1.0, 5.4),
];

// 2: hook, and bowl-diagonal-base
GLYPHS[2] = [
  arc(5, 5.0, 4.6, 4.8, 270, 196),
  to(to(arc(5, 5.0, 4.6, 4.8, 270, 395), 0.5, 17.4), 10, 17.4),
];

// 3: hook; upper bowl to the tongue; lower bowl seized on at the waist
GLYPHS[3] = [
  arc(4.9, 4.3, 4.4, 4.2, 270, 200),
  to(arc(4.9, 4.3, 4.4, 4.2, 270, 448), 2.6, 8.6),
  arc(5, 13.0, 5.0, 4.9, 268, 500, 1),
];

// 4: post; diagonal and the crossbar laid over the post
GLYPHS[4] = [
  to([[7.2, 0.4, 0]], 7.2, 18),
  to(to([[7.2, 0.4, 0]], 0.3, 12.4), 10, 12.4, 1),
];

// 5: flag; stem and bowl
GLYPHS[5] = [
  to([[2.0, 0.6, 0]], 9.6, 0.6),
  cat(to([[2.0, 0.6, 0]], 2.0, 7.4), arc(5.1, 12.0, 4.7, 5.6, 236, 500)),
];

// 6: hook; the back, the bowl, and the end tucked over the back
GLYPHS[6] = [
  [[5.4, 0.3, 0], [7.2, 0.5, 0], [8.8, 1.7, 0]],
  zed(cat([[5.4, 0.3, 0], [3.3, 0.9, 0], [1.7, 2.7, 0], [0.75, 5.4, 0], [0.45, 8.4, 0]], arc(5, 12.8, 4.55, 5.0, 180, -165)), 9),
];

// 7: bar to the left; bar to the right and the falling stroke
GLYPHS[7] = [
  to([[5.0, 0.7, 0]], 0.3, 0.7),
  cat(to([[5.0, 0.7, 0]], 9.7, 0.7), [[8.6, 3.6, 0], [7.0, 7.6, 0], [5.6, 11.8, 0], [4.7, 15.4, 0], [4.4, 18, 0]]),
];

// 8: a figure-eight, one strand from the crown, crossing over at the waist
{
  const t1 = arc(5, 4.6, 4.1, 4.3, 270, 146);
  const l1 = arc(5, 13.2, 4.9, 4.7, -34, 214);
  const t2 = arc(5, 4.6, 4.1, 4.3, 34, -84, 1);
  const p = cat([], t1);
  to(p, l1[0][0], l1[0][1]);
  cat(p, l1);
  to(p, t2[0][0], t2[0][1], 1);
  cat(p, t2);
  GLYPHS[8] = [p];
}

// 9: the stem and tail; the bowl, its end tucked over the stem
GLYPHS[9] = [
  cat(arc(5, 5.2, 4.55, 5.0, 270, 360), [[9.55, 7.0, 0], [9.5, 9.6, 0], [9.0, 12.6, 0], [7.7, 15.4, 0], [5.6, 17.4, 0], [3.2, 17.7, 0], [1.2, 16.4, 0]]),
  zed(arc(5, 5.2, 4.55, 5.0, 270, 15), 9),
];
