// The cast of "rubberhose": ten numerals drawn as fat, round, rubber-hose
// bodies. Each is a set of centre lines (straight runs and elliptic arcs)
// stroked R = 3.5 px thick with round ends, so every edge is a smooth
// balloon curve at any squash. At load each digit becomes a signed distance
// field (1/8 px units, Int8) on a 30 x 48 grid: 1.4 KB a digit, 14 KB of
// flash for the set. The frame samples it bilinearly under the dance's
// squash, stretch and lean, so the bodies stay clean 1-bit shapes while
// they move by whole pixels.
//
// Each digit also carries its anchors, in glyph units (box 22 x 40, y down):
//   eye   centre of the pair of pie-cut eyes (on the head stroke)
//   armL / armR  where the noodle arms leave the body (outer sides only)
//   hipL / hipR  where the legs leave the body (the bottom)

export const GW = 22, GH = 40, M = 4, SW = GW + 2 * M, SH = GH + 2 * M, R = 3.5;

const arc = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};

// centre-line polylines per digit (angles: 0 right, 90 down, 180 left, 270 up)
const SKEL = {
  0: [arc(11, 20, 7.5, 16.5, 0, 360, 48)],
  1: [[[5.2, 10.2], [12.8, 3.6]], [[12.8, 3.6], [12.8, 36.5]]],
  2: [[...arc(11, 11, 7.5, 7.5, 192, 395), [3.6, 36.5], [18.4, 36.5]]],
  3: [arc(11, 11, 7, 7.5, 205, 450), [[7.5, 19.6], [11, 19.6]], arc(11, 28.5, 7.5, 8, 270, 518)],
  4: [[[5.6, 3.6], [4, 25.5], [18.6, 25.5]], [[15, 12], [15, 36.5]]],
  5: [[[18, 3.6], [5.6, 3.6], [5, 17.5]], arc(10.6, 26.8, 8, 9.7, 236, 518)],
  6: [arc(11, 27.5, 7.5, 9, 0, 360, 40), arc(17, 26, 13.5, 22.4, 180, 262)],
  7: [[[3.6, 3.6], [18.4, 3.6], [8.6, 36.5]]],
  8: [arc(11, 11.2, 6.6, 7.6, 0, 360, 36), arc(11, 28.2, 7.5, 8.3, 0, 360, 40)],
  9: [arc(11, 12.5, 7.5, 9, 0, 360, 40), arc(5, 14, 13.5, 22.4, 0, 82)],
};

export const ANCH = {
  0: { eye: [11, 4.0], armL: [4, 22], armR: [18, 22], hipL: [7.5, 35], hipR: [14.5, 35] },
  1: { eye: [12.3, 6.6], armL: [10, 29], armR: [15.5, 29], hipL: [11.5, 35], hipR: [14, 35] },
  2: { eye: [11, 4.0], armL: [4.5, 12], armR: [18, 13], hipL: [6.5, 36], hipR: [15.5, 36] },
  3: { eye: [11, 4.0], armL: [5, 8], armR: [18, 28], hipL: [7.5, 35], hipR: [14, 35] },
  4: { eye: [9.6, 25.5], armL: [5, 12], armR: [15.5, 31], hipL: [14, 35], hipR: [16, 35] },
  5: { eye: [11.6, 4.0], armL: [5.5, 10], armR: [18, 27], hipL: [7, 35], hipR: [14, 35] },
  6: { eye: [12.6, 5.0], armL: [4, 24], armR: [18, 27], hipL: [7.5, 35], hipR: [14.5, 35] },
  7: { eye: [11, 4.0], armL: [13, 21], armR: [17.5, 8], hipL: [8, 35], hipR: [10, 35] },
  8: { eye: [11, 4.4], armL: [4, 27], armR: [18, 27], hipL: [7.5, 35], hipR: [14.5, 35] },
  9: { eye: [11, 4.0], armL: [4, 12], armR: [18, 14], hipL: [7.5, 35], hipR: [11.5, 35] },
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** SDF[d] : Int8Array(SW * SH), value = distance * 8, negative inside. */
export const SDF = [];
for (let d = 0; d < 10; d++) {
  const f = new Int8Array(SW * SH);
  for (let j = 0; j < SH; j++)
    for (let i = 0; i < SW; i++) {
      const px = i + 0.5 - M, py = j + 0.5 - M;
      let best = 1e9;
      for (const pl of SKEL[d]) for (let k = 1; k < pl.length; k++) {
        const e = segD(px, py, pl[k - 1][0], pl[k - 1][1], pl[k][0], pl[k][1]);
        if (e < best) best = e;
      }
      const v = Math.round((best - R) * 8);
      f[j * SW + i] = v < -127 ? -127 : v > 127 ? 127 : v;
    }
  SDF.push(f);
}

/** Bilinear SDF sample at glyph coords (u, v), in 1/8 px; outside the grid: far. */
export function sample(f, u, v) {
  const x = u + M - 0.5, y = v + M - 0.5;
  if (x < 0 || y < 0 || x >= SW - 1 || y >= SH - 1) return 127;
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, k = iy * SW + ix;
  const a = f[k] + (f[k + 1] - f[k]) * fx, b = f[k + SW] + (f[k + SW + 1] - f[k + SW]) * fx;
  return a + (b - a) * fy;
}
