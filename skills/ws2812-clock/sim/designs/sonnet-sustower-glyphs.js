// Carved placard numerals: the figures' time placards, lacquered boards with
// gold-leafed grooves cut by a carver's chisel. Each digit is a few straight
// strokes of constant chisel width in a 18 x 26 box, square-cornered,
// woodblock-print bold: no round kit-font skeleton, no curves except the 0.
export const BOX_W = 18, BOX_H = 26;

// Each entry is a list of independent strokes (polylines); T-junctions are
// separate strokes so a crossbar can meet a stem cleanly.
const S = {
  0: [[[9, 2], [4.5, 5.5], [3.2, 13], [4.5, 20.5], [9, 24], [13.5, 20.5], [14.8, 13], [13.5, 5.5], [9, 2]]],
  1: [[[5.5, 7.5], [9.5, 3], [9.5, 24]], [[5, 24], [14, 24]]],
  2: [[[4, 7], [6.5, 3], [11.5, 3], [14.5, 7], [13, 12], [5, 20], [4, 24]], [[4, 24], [15, 24]]],
  3: [[[4.5, 4], [13, 3], [13.5, 9], [8.5, 12.5]], [[8.5, 12.5], [14, 15], [14, 21], [9.5, 24.5], [4, 23]]],
  4: [[[12.5, 24.5], [12.5, 3]], [[12.5, 3], [4, 18]], [[4, 18], [16, 18]]],
  5: [[[14, 3], [5, 3], [4.3, 13], [10, 11.5], [15, 15], [13.5, 22], [7, 24.5], [4, 20.5]]],
  6: [[[13.5, 4], [7.5, 3], [4, 10], [3.6, 19], [8, 24.5], [13.5, 22], [14.3, 16], [10, 13], [4.2, 15]]],
  7: [[[3, 3], [15.5, 3], [8, 24.5]]],
  8: [[[9, 3], [5, 6], [5, 10.5], [9, 13], [13, 10.5], [13, 6], [9, 3]], [[9, 13], [4, 17], [4, 21], [9, 24.5], [14, 21], [14, 17], [9, 13]]],
  9: [[[14, 11], [10, 13.5], [5, 11.5], [4.7, 6], [9, 3], [13.3, 6], [14, 11], [13.3, 20], [8, 24.5], [4.5, 22]]],
};

/** Densely resample a polyline at step `d` (box units). */
function resample(pts, d) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = out[out.length - 1];
    const [bx, by] = pts[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (seg > d) {
      const t = d / seg;
      ax += (bx - ax) * t; ay += (by - ay) * t;
      out.push([ax, ay]);
      seg -= d;
    }
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > 0.1) out.push(last);
  return out;
}

/** Build one digit: strokes with a constant chisel radius, and a running
 * "cut length" per stroke start (for the engrave-reveal transition, in
 * stroke order). */
const R = 1.05;   // half-width of the chisel groove, box units
function build(strokes) {
  const out = [];
  let acc = 0;
  for (const pts of strokes) {
    const d = resample(pts, 0.6);
    let len = 0;
    const L = [0];
    for (let i = 1; i < d.length; i++) { len += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]); L.push(len); }
    const n = d.length;
    const xs = new Float32Array(n), ys = new Float32Array(n), from = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = d[i][0]; ys[i] = d[i][1]; from[i] = acc + L[i]; }
    acc += len;
    out.push({ xs, ys, from, n });
  }
  return { strokes: out, total: acc, R };
}

export const GLYPHS = [];
for (let d = 0; d <= 9; d++) GLYPHS[d] = build(S[d]);
