// VHS glyphs: the ten numerals as instructors' bodies (vhs.js).
//
// Each digit is one heavy, round, geometric stroke (the 1980s aerobics-tape
// letter: Pump / Bauhaus weight, round terminals, open counters of at least
// 6 x 7 px), 20 x 36 px with a 6.5 px stroke. It is drawn as a skeleton of
// segments and arcs, and stored as a distance field (Int8, 1/8 px, flash) that
// vhs.js samples under each frame's pose: squash, lean, hop. The leotard is
// split at the waist (GW_BELT) into top colour, belt and tights.
//
// Per digit it also gives where the person attaches: the neck (head), the
// hips (legs) and the shoulders (arms), in glyph units.

export const GW = 20, GH = 36, R = 3.25, M = 3;
export const SW = GW + 2 * M, SH = GH + 2 * M;
export const BELT0 = 18.5, BELT1 = 21.5;    // the belt band, in glyph rows

const arc = (cx, cy, r, a0, a1, n = 28) => {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
};
const L = (...pts) => pts;

// polylines in glyph units (centre-lines; the stroke is 2R wide)
const SKEL = [
  // 0: a tall stadium
  [L([3.25, 10.2], [3.25, 25.8]), arc(10, 25.8, 6.75, 180, 0, 28).reverse(), L([16.75, 25.8], [16.75, 10.2]), arc(10, 10.2, 6.75, 0, -180)],
  // 1: a stem and a flag
  [L([12, 3.4], [12, 32.75]), L([12, 3.4], [5, 10])],
  // 2: round shoulder, straight diagonal, flat base
  [arc(10, 10, 6.75, 170, 400), L([15.2, 14.4], [3.25, 32.75], [16.75, 32.75])],
  // 3: two bowls, the lower one larger
  [arc(10, 9.75, 6.5, 195, 450), L([6, 17], [10, 17]), arc(10, 25.5, 7.25, 270, 515)],
  // 4: open top, the old LED way (cannot read as A)
  [L([4.4, 3.25], [3.4, 21.5], [16.75, 21.5]), L([15.5, 3.25], [15.5, 32.75])],
  // 5: flat top bar, short stem, a wide-open bowl
  [L([16.75, 3.25], [4.6, 3.25], [4.2, 16.4]), L([4.2, 16.4], [8.5, 15.6]), arc(9.2, 24.6, 7.85, 262, 492)],
  // 6: a diagonal into a round loop
  [arc(10, 25.75, 7, 0, 360, 36), L([3.1, 24.5], [4.8, 17], [14.2, 3.25])],
  // 7: bar and a straight diagonal
  [L([3.25, 3.25], [16.75, 3.25], [7.6, 32.75])],
  // 8: small loop on a larger one
  [arc(10, 9.5, 6.25, 0, 360, 32), arc(10, 25.5, 7.25, 0, 360, 36)],
  // 9: a round loop and a diagonal tail
  [arc(10, 10.25, 7, 0, 360, 36), L([16.9, 11.5], [15.2, 19], [5.8, 32.75])],
];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** SDF[d]: Int8 per grid point (glyph coords (i - M, j - M)), distance in 1/8 px, negative inside. */
export const SDF = SKEL.map((lines) => {
  const f = new Int8Array(SW * SH);
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const px = i - M, py = j - M;
      let d = 99;
      for (const p of lines) for (let k = 1; k < p.length; k++) d = Math.min(d, segDist(px, py, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]));
      f[j * SW + i] = Math.max(-127, Math.min(127, Math.round((d - R) * 8)));
    }
  return f;
});

/** Sample a glyph's field at glyph coords (u, v), bilinear, in px. Load-time only. */
function at(d, u, v) {
  const gi = u + M, gj = v + M;
  const i = Math.floor(gi), j = Math.floor(gj);
  if (i < 0 || j < 0 || i >= SW - 1 || j >= SH - 1) return 9;
  const f = SDF[d], fx = gi - i, fy = gj - j, k = j * SW + i;
  const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + SW] + (f[k + SW + 1] - f[k + SW]) * fx;
  return (a + (b - a) * fy) / 8;
}

// where the head sits (x of the neck on the top edge)
export const NECK = [10, 11.4, 10, 10, 15.5, 10.4, 13.6, 9.8, 10, 10];
// the hips: x of the leg roots along the bottom
export const HIP = [10, 12, 10, 10, 15.5, 9.6, 10, 7.8, 10, 6.6];
export const HIPW = [3.2, 2.2, 4.6, 3.2, 2.2, 3.2, 3.2, 2.2, 3.2, 2.2];

/** Shoulders: the outer ink edge of each side at shoulder height (glyph rows 5..8), [uL, uR, v]. */
export const SHOULDER = SKEL.map((_, d) => {
  let a = 99, b = -99;
  for (let v = 5; v <= 8; v += 0.5)
    for (let u = -2; u <= GW + 2; u += 0.25) if (at(d, u, v) < -0.3) { a = Math.min(a, u); b = Math.max(b, u); }
  return [a + 0.6, b - 0.6, 6.5];
});
