// Octopus glyphs: each numeral is ONE octopus arm, drawn as its centre line
// from the base (hidden behind the reef ledge, y > 68) to the free tip, so a
// digit is literally how that arm is curled. The arm tapers from base to tip,
// so a digit always has a thick root on the rock and a thin curled end: the
// 1's flag, the 2's and 3's top hooks, the 7's bar end, the 4's crossbar tip
// are the arm tip; the 0, 8 and 9 tuck their tip back against themselves;
// the 6 loops once and climbs over its own root (the lower-left of its bowl
// is traced twice, which reads as one stroke).
//
// Every glyph is authored as a few control points (centripetal Catmull-Rom,
// no cusps at the tight bends), then resampled to N + 1 nodes evenly spaced
// along the arm. Nodes, not outlines, are what the face animates: the same
// node index is the same bit of skin in every digit, so a minute turn moves
// each node from its place in the old digit to its place in the new one.
//
// Local box: x 0..28 (centre lines inside 6..22), y = glass rows, the ledge
// top at 68. Flash: 10 glyphs x 97 nodes x 3 floats = 11.6 KB.

export const N = 96;
export const LEDGE = 68;

const P = {
  0: [[14, 75], [14, 68], [11.2, 63], [7.6, 58.5], [6, 49], [6, 22], [8, 12.6], [14, 8.3], [20, 12.6], [22, 22], [22, 49], [20.6, 58], [17, 62.6], [12.6, 63.4], [10.4, 62.6]],
  1: [[17, 75], [17, 66], [17, 40], [17, 15], [16.2, 9.8], [13.8, 8.8], [11, 10.6], [9.6, 12.6]],
  2: [[21, 75], [21, 68], [18.5, 63], [13, 62.8], [8.2, 62.8], [6.4, 60.4], [8.2, 56.4], [18.6, 41], [21.8, 31], [21.6, 18.6], [19, 11.2], [14, 8.3], [9, 10.2], [6.6, 14.6]],
  3: [[8, 75], [8, 68], [11, 63], [16, 62.9], [20.4, 59.4], [22, 51.4], [20.4, 42.8], [15.4, 37.2], [11, 36], [15.4, 34.6], [20.2, 29.2], [21.4, 18.6], [19, 11.4], [14, 8.3], [9, 10], [6.6, 14.2]],
  4: [[21, 75], [21, 66], [21, 40], [21, 17], [20.2, 10.2], [17.6, 9.2], [14.8, 13], [4.8, 41.4], [5.6, 47], [10, 47.6], [26.4, 47.6]],
  5: [[8, 75], [8, 68], [11, 63], [16, 62.9], [20.4, 59.6], [22, 51], [20.8, 43], [17, 38.2], [12, 36.8], [8, 37.4], [6.6, 33], [6.6, 19], [7.2, 10.6], [10.4, 8.5], [16, 8.5], [22.4, 8.5]],
  6: [[7.6, 75], [7.2, 66], [6.6, 56], [7.4, 45.6], [11.2, 39.2], [16, 37.2], [20.4, 40], [22, 48.4], [21, 57.4], [17, 62.6], [11.6, 62.8], [7.6, 59], [6.4, 50], [6.6, 36], [7.6, 22], [10.6, 12.2], [15, 8.4], [19.4, 9.4], [21.6, 13]],
  7: [[11, 75], [11, 67], [12, 56], [17.2, 33], [21, 15.6], [21.2, 10.6], [18.4, 8.5], [11, 8.5], [6.6, 8.6], [5.4, 11]],
  8: [[14, 75], [14, 68], [17.6, 62.8], [21, 58.6], [22, 52], [20.4, 44.6], [14, 37.4], [8.4, 30], [7, 20], [9.4, 11.6], [14, 8.3], [18.6, 11.6], [21, 20], [19.6, 30], [14, 36.6], [7.6, 44.6], [6, 52], [7.4, 59], [11, 62.6], [13.6, 63]],
  9: [[21, 75], [21, 66], [21.8, 50], [22, 30], [21.2, 17], [18.6, 10.6], [14, 8.3], [9, 10.6], [6.2, 17], [6.4, 25.6], [9.4, 31.6], [14.4, 33.6], [19, 31.6], [21.6, 28]],
};
// whose tip is free (it may flick on the beat without touching another stroke)
const FREE = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: false, 9: false };

/** Centripetal Catmull-Rom through pts, densely sampled. */
function spline(pts) {
  const p = [pts[0].map((v, i) => 2 * v - pts[1][i]), ...pts, pts[pts.length - 1].map((v, i) => 2 * v - pts[pts.length - 2][i])];
  const out = [];
  const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  for (let k = 1; k < p.length - 2; k++) {
    const p0 = p[k - 1], p1 = p[k], p2 = p[k + 1], p3 = p[k + 2];
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const S = 24;
    for (let j = 0; j < S; j++) {
      const t = t1 + ((t2 - t1) * j) / S;
      const L = (a, b, ta, tb) => a.map((v, i) => ((tb - t) / (tb - ta)) * v + ((t - ta) / (tb - ta)) * b[i]);
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Resample a polyline to n + 1 points evenly spaced along it. */
function resample(line, n) {
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = acc[acc.length - 1], x = new Float32Array(n + 1), y = new Float32Array(n + 1);
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    while (j < line.length - 2 && acc[j + 1] < s) j++;
    const u = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    x[i] = line[j][0] + (line[j + 1][0] - line[j][0]) * u;
    y[i] = line[j][1] + (line[j + 1][1] - line[j][1]) * u;
  }
  return { x, y, L };
}

/**
 * Which side the suckers are on, per node: the inside of the arm's bend (a
 * real arm curls toward its suckers), smoothed widely so the row only rolls
 * over where the curl really changes hand. +1 = left of travel on screen.
 */
function suckerSide(x, y) {
  const n = x.length, turn = new Float32Array(n), sig = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ax = x[i] - x[i - 1], ay = y[i] - y[i - 1], bx = x[i + 1] - x[i], by = y[i + 1] - y[i];
    turn[i] = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = Math.max(0, i - 14); j <= Math.min(n - 1, i + 14); j++) { const k = 1 - Math.abs(j - i) / 15; s += turn[j] * k; w += k; }
    // positive turn (clockwise on screen, y down) bends right: suckers on the right = -1
    sig[i] = Math.max(-1, Math.min(1, -(s / w) / 0.012));
  }
  return sig;
}

export const GLYPHS = [];
for (let d = 0; d <= 9; d++) {
  const r = resample(spline(P[d]), N);
  // unit normals (left of travel), for the arm's ripple
  const nx = new Float32Array(N + 1), ny = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N, i + 1), tx = r.x[b] - r.x[a], ty = r.y[b] - r.y[a], l = Math.hypot(tx, ty) || 1;
    nx[i] = ty / l; ny[i] = -tx / l;
  }
  GLYPHS.push({ d, x: r.x, y: r.y, L: r.L, nx, ny, sig: suckerSide(r.x, r.y), free: FREE[d] });
}
