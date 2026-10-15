// Laser-lab digits: each digit is ONE beam. The first point is the laser's
// aperture, the last the beam dump, every point between is a mirror. Beams
// only go straight, so the letterforms are faceted; the mirror at each
// corner is forced by the geometry (its normal bisects the turn).
// Unit box: x 0..17, y 0..24 (pixels before scaling), y down.
export const GW = 17, GH = 24;

export const GLYPHS = {
  0: [[17, 6.5], [17, 19], [13, 24], [4, 24], [0, 19], [0, 5], [4, 0], [12, 0], [15.4, 3.4]],
  1: [[3, 6], [9, 0], [9, 24], [3.5, 24], [14.5, 24]],
  2: [[0, 5.5], [4, 0], [13, 0], [17, 4], [17, 9], [0, 24], [17, 24]],
  3: [[0.5, 0], [16, 0], [8, 10], [13, 10], [17, 14], [17, 20], [13, 24], [0.5, 24]],
  4: [[12, 24], [12, 0], [0, 16.5], [17, 16.5]],
  5: [[16.5, 0], [1, 0], [0, 10.5], [12.5, 10.5], [17, 14.5], [17, 20], [13, 24], [0.5, 24]],
  6: [[14, 0], [0, 12], [0, 20], [4, 24], [13, 24], [17, 20], [17, 14], [13, 10], [3, 10]],
  7: [[0, 4.5], [0, 0], [17, 0], [6, 24]],
  8: [[3.5, 10.5], [0, 7], [0, 3], [3, 0], [14, 0], [17, 3], [17, 7], [13.5, 10.5],
      [0, 17], [0, 21], [3, 24], [14, 24], [17, 21], [17, 17], [5.5, 11.3]],
  9: [[3, 24], [17, 12], [17, 4], [13, 0], [4, 0], [0, 4], [0, 10], [4, 14], [14, 14]],
};

/** Every glyph resampled to N points (endpoints kept; interior mirrors
 *  duplicated where the path is longest), so any digit can morph into any
 *  other mirror by mirror. Duplicates are coincident mirrors that split. */
export function padded(g, N) {
  const n = g.length;
  const copies = new Array(n).fill(1);
  const seg = [];
  for (let k = 0; k + 1 < n; k++) seg.push(Math.hypot(g[k + 1][0] - g[k][0], g[k + 1][1] - g[k][1]));
  let extra = N - n;
  while (extra-- > 0) {
    let best = 1, bs = -1;
    for (let j = 1; j < n - 1; j++) {
      const share = (seg[j - 1] + seg[j]) / (copies[j] + 1);
      if (share > bs) { bs = share; best = j; }
    }
    copies[best]++;
  }
  const out = [];
  for (let j = 0; j < n; j++) for (let c = 0; c < copies[j]; c++) out.push(g[j]);
  return out;
}
