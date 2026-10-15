// The cast of "haring": ten numerals, each one Keith Haring dancer whose
// body IS the numeral. The body is a set of centre lines stroked R = 3 px
// (a 6 px flat fill) inside a 2 px black line, the way Haring drew: one fat
// even outline round a flat colour, no shading. Every dancer has the same
// faceless round head (fill radius 4.5) sitting on top of its body with a
// black neck seam between them, and two short legs (haring-cast.js) that
// leave the bottom of the body, so every numeral is a whole figure.
//
// Body box 26 x 46 (centre lines kept 5 px inside it so the black stays in
// the box); heads ride above it. Counters are at least 5 x 6 px of ground.
// The 4 is open: the dancer's arm reaches out (the bar) and its forearm
// waves up (the left stroke), so its counter opens at the top.
//
// At load each digit becomes a signed distance field to the fill edge, in
// 1/8 px, Int8, on a 40 x 68 grid (glyph x -7..33, y -17..51): 2.7 KB a
// digit, 27 KB of flash for the set. The frame samples it bilinearly under
// the dance's squash, lean and jump.

export const GW = 26, GH = 46, R = 3, RH = 4.5, OUT = 2;
export const GX0 = -7, GY0 = -17, SW = 40, SH = 68;

const arc = (cx, cy, rx, ry, a0, a1, n = 40) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// centre lines (angles: 0 right, 90 down)
const SKEL = {
  0: [arc(13, 23, 8, 18, 0, 360, 56)],
  1: [[[15, 5], [15, 41]], [[14.2, 6.2], [6.5, 13.5]]],
  2: [[...arc(13, 14, 8, 9, 170, 400, 36), [5, 41], [21, 41]]],
  3: [arc(13, 13, 7.5, 8, 200, 450, 36), [[13, 21], [10, 21]], arc(13, 31, 8, 10, 270, 515, 40)],
  4: [[[3.6, 2], [5, 29], [22, 29]], [[18, 13], [18, 41]]],
  5: [[[20.5, 5], [7, 5], [6, 22.9]], arc(12.5, 29.5, 8.2, 11.5, 215, 512, 44)],
  6: [arc(13, 30, 8, 11, 0, 360, 44), arc(18.6, 27, 13.6, 22, 270, 180, 28)],
  7: [[[5, 5], [21, 5], [10.5, 41]]],
  8: [arc(13, 13, 7.5, 8, 0, 360, 40), arc(13, 31, 8, 10, 0, 360, 44)],
  9: [arc(13, 15, 8, 10, 0, 360, 44), arc(7.4, 15, 13.6, 26, 0, 88, 28)],
};

/** Where the head sits (fill centre, glyph units): over the top of the body, 2 px of black seam between. */
export const HEAD = {
  0: [13, -4.5], 1: [15, -4.5], 2: [13, -4.5], 3: [13, -4.5], 4: [18, 3.5],
  5: [10, -4.5], 6: [18.6, -4.5], 7: [19, -4.5], 8: [13, -4.5], 9: [13, -4.5],
};

/** Hips (glyph units, inside the fill near the bottom), left and right. */
export const HIPS = {
  0: [[10, 41.5], [16, 41.5]], 1: [[14, 40], [16, 40]], 2: [[8, 40.5], [18, 40.5]], 3: [[10, 41.5], [16, 41.5]],
  4: [[17, 40], [19, 40]], 5: [[10, 41.5], [16, 41.5]], 6: [[10, 41.5], [16, 41.5]], 7: [[9.6, 40], [11.6, 40]],
  8: [[10, 41.5], [16, 41.5]], 9: [[8.6, 40.2], [13, 41]],
};

/**
 * Shoulders (glyph units, inside the fill at the top of the body), left and
 * right; null where the numeral's own stroke is that arm (the 1's flag, the
 * 4's forearm, the 5's and 7's bar). Arms only ever rise above the body, so
 * they never cross a stroke or a counter.
 */
export const SHOULDERS = {
  0: [[8, 9], [18, 9]], 1: [null, null], 2: [[8, 8], [18, 8]], 3: [[8.5, 8], [17.5, 8]],
  4: [null, null], 5: [[7, 6.5], null], 6: [[10.5, 8.5], [20.5, 6]], 7: [null, null],
  8: [[8.5, 8], [17.5, 8]], 9: [[8, 9], [18, 9]],
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** SDF[d]: Int8Array(SW * SH), distance to the fill edge * 8, negative inside. */
export const SDF = [];
for (let d = 0; d < 10; d++) {
  const f = new Int8Array(SW * SH);
  const [hx, hy] = HEAD[d];
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const px = i + 0.5 + GX0, py = j + 0.5 + GY0;
      let best = 1e9;
      for (const pl of SKEL[d]) for (let k = 1; k < pl.length; k++) {
        const e = segD(px, py, pl[k - 1][0], pl[k - 1][1], pl[k][0], pl[k][1]);
        if (e < best) best = e;
      }
      const dh = Math.hypot(px - hx, py - hy) - RH;
      const v = Math.round(Math.min(best - R, dh) * 8);
      f[j * SW + i] = v < -127 ? -127 : v > 127 ? 127 : v;
    }
  SDF.push(f);
}

/** Bilinear SDF sample at glyph coords (u, v) (pixel-centre coordinates), 1/8 px; off the grid: far. */
export function sample(f, u, v) {
  const x = u - GX0 - 0.5, y = v - GY0 - 0.5;
  if (x < 0 || y < 0 || x >= SW - 1 || y >= SH - 1) return 127;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, k = iy * SW + ix;
  const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + SW] + (f[k + SW + 1] - f[k + SW]) * fx;
  return a + (b - a) * fy;
}
