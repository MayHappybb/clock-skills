// Glassblower glyphs: ten numerals drawn as pulled strands of hot glass.
//
// Each digit is one or two centrelines (Catmull-Rom through hand-placed
// points, in a 30 x 52 px box: the hour size), stroked with a radius that
// grows towards the bottom (soft glass sags and thickens under its own
// weight) and swells into a drop at every free end (a pulled end of hot glass
// rounds itself into a bead). Joins are fused, corners are bends: a strand
// cannot make a sharp corner.
//
// Each glyph is baked once, at load, into three maps over its box plus a
// margin (flash tables, 4 bytes a pixel, 10 x 44 x 68 px = 120 KB):
//   F  distance to the nearest point of the strand, in units of the strand's
//      own radius there (x 32, 255 = far): the union of the strand's discs is
//      F < 32, and thresholding higher fattens the strand evenly (a melting
//      digit), lower thins it.
//   A  signed offset across the strand (x 64 radii), positive on the side that
//      faces the light: the flat highlight band and the twist of the cane.
//   S  arc length along the strand (x 4 px): heat seams travel along it and
//      the latticino threads wind round it.
// The frame samples these through a per-row affine map (scale, stretch, bend),
// so any pose of a digit is a few integer operations a pixel.

export const GW = 30, GH = 52, M = 7;
export const MW = GW + 2 * M, MH = GH + 2 * M;   // 44 x 66
export const R0 = 3.3;                            // strand radius at the top of the box
export const LIGHT = [0.55, -0.83];               // the light: the furnace and the shop lamps, up and right

// [points, closed, drop at start, drop at end]
const P = {
  0: [[[15, 3.6], [23.2, 7], [26.4, 17], [26.6, 30], [25, 41], [20.5, 47.6], [15, 48.9], [9.5, 47.6], [5, 41], [3.4, 30], [3.6, 17], [6.8, 7]], true],
  1: [[[6.2, 14.5], [10, 9.6], [14.5, 5.6], [17.6, 3.6], [17.8, 14], [17.8, 26], [17.8, 38], [17.8, 47.6]], false, true, true],
  2: [[[4.4, 14], [7.4, 6.6], [15, 3.4], [22.4, 5.6], [26.2, 13.2], [24.6, 21.2], [18.6, 28.6], [11, 36], [5.2, 43.4], [4, 47.8], [11, 48], [19, 48.4], [26.8, 46.8]], false, true, true],
  3: [
    [[[4.2, 10], [9.2, 4.6], [16.6, 3.4], [23.4, 6.6], [25.2, 13.2], [22.4, 19.8], [14.6, 23.8]], false, true, false],
    [[[14.6, 23.8], [22.8, 27], [26.8, 34.8], [25.2, 43], [19.2, 48.4], [11, 48.6], [4.4, 44.6]], false, false, true],
  ],
  4: [
    [[[20.4, 3.8], [14, 15], [7.6, 25.6], [3.8, 33.6], [6, 35.6], [15, 35.4], [27, 35.2]], false, false, true],
    [[[20.4, 3.8], [20.6, 17], [20.8, 31], [20.8, 47.6]], false, false, true],
  ],
  5: [[[26.4, 4], [18, 3.6], [8.6, 3.8], [6.4, 6.4], [6, 13.4], [5.6, 21.4], [11.4, 18.6], [19.4, 19.4], [25.4, 25.4], [26.6, 34], [24.6, 43], [17.4, 48.6], [9, 47.8], [3.8, 42.2]], false, true, true],
  6: [[[23.4, 5.2], [16.6, 3.4], [9.6, 7.4], [5, 16], [3.6, 27], [4.4, 37.6], [8.8, 46], [15.6, 48.8], [22.6, 45.6], [26.4, 37.6], [24.6, 29.2], [17.4, 25.2], [9.6, 27.2], [4.4, 33.4]], false, true, false],
  7: [[[3.6, 5.4], [11, 3.8], [19.6, 3.6], [26.4, 4.2], [24.8, 11.6], [20.4, 21], [15.8, 31.4], [13, 40.6], [12, 47.6]], false, true, true],
  8: [[[15, 3.4], [7.4, 6], [5.4, 13.6], [9, 20.2], [15, 23.6], [21.8, 27.2], [26, 34.4], [25, 43], [19.4, 48.4], [15, 48.9], [10.6, 48.4], [5, 43], [4, 34.4], [8.2, 27.2], [15, 23.6], [21, 20.2], [24.6, 13.6], [22.6, 6]], true],
  9: [[[6.2, 46.8], [14, 48.8], [21.2, 45], [25.4, 36.2], [26.4, 24.6], [25, 13.6], [20.6, 5.6], [14.4, 3.4], [7.8, 6.2], [4, 13.6], [5.4, 21.8], [12.4, 26.6], [20.6, 25.2], [25.8, 18.6]], false, true, false],
};

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

/** Dense points along one path, then resampled every `step` px of arc. */
function trace(pts, closed, step) {
  const n = pts.length, dense = [];
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < 40; k++) dense.push(catmull(at(i - 1), at(i), at(i + 1), at(i + 2), k / 40));
  dense.push(closed ? pts[0] : pts[n - 1]);
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1], [bx, by] = dense[i];
    let d = Math.hypot(bx - ax, by - ay), u = 0;
    while (acc + d >= step) {
      u += (step - acc) / Math.hypot(bx - ax, by - ay);
      out.push([ax + (bx - ax) * u, ay + (by - ay) * u]);
      d -= step - acc; acc = 0;
    }
    acc += d;
  }
  return out;
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function bake(def) {
  const paths = Array.isArray(def[0][0][0]) ? def : [def];
  const STEP = 0.35;
  const sm = [];              // samples: x, y, r, nx, ny, s
  let s0 = 0;
  for (const [pts, closed, dropA, dropB] of paths) {
    const q = trace(pts, closed, STEP), n = q.length, L = (n - 1) * STEP;
    for (let i = 0; i < n; i++) {
      const a = q[Math.max(0, i - 2)], b = q[Math.min(n - 1, i + 2)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = -ty, ny = tx;
      if (nx * LIGHT[0] + ny * LIGHT[1] < 0) { nx = -nx; ny = -ny; }
      const s = i * STEP, y = q[i][1];
      let r = R0 * (0.9 + 0.2 * (y / GH));
      if (dropA) r *= 1 + 0.26 * smooth(1 - s / 5);
      if (dropB) r *= 1 + 0.26 * smooth(1 - (L - s) / 5);
      sm.push([q[i][0], y, r, nx, ny, s0 + s]);
    }
    s0 += L + 2;
  }
  const F = new Uint8Array(MW * MH), A = new Int8Array(MW * MH), S = new Uint16Array(MW * MH);
  for (let my = 0; my < MH; my++)
    for (let mx = 0; mx < MW; mx++) {
      const px = mx + 0.5 - M, py = my + 0.5 - M;
      let best = 1e9, bi = 0;
      for (let i = 0; i < sm.length; i++) {
        const e = sm[i], dx = px - e[0], dy = py - e[1];
        const d2 = (dx * dx + dy * dy) / (e[2] * e[2]);
        if (d2 < best) { best = d2; bi = i; }
      }
      const e = sm[bi], k = my * MW + mx;
      F[k] = Math.min(255, Math.round(Math.sqrt(best) * 32));
      A[k] = Math.max(-127, Math.min(127, Math.round((((px - e[0]) * e[3] + (py - e[1]) * e[4]) / e[2]) * 64)));
      S[k] = Math.round(e[5] * 4);
    }
  // a few points along the strand that radiate when it is hot (the glow on the wall)
  const glow = [];
  for (let i = 0; i < sm.length; i += 34) glow.push([sm[i][0] + M, sm[i][1] + M, sm[i][5]]);
  return { F, A, S, len: s0, glow };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => bake(P[d]));
