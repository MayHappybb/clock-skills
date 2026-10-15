// The ten numerals of "noodles", each one long noodle laid in the broth.
//
// Every digit is ONE centre line (a single noodle, as it would lie), drawn
// in a 22 x 48 box with lines and cubic curves, then flattened, its corners
// rounded the way a cooked noodle bends (a moving average over ~2 px of
// arc length) and resampled at 1 px steps for the size it is shown at. The
// noodle is then stroked round that line (noodles.js) and wobbles across it.
//
// The path's direction is the slurp's: the START is the tail, the END is
// where the chopsticks lift it out, so as a noodle is slurped its tail runs
// along the digit towards the end. Each direction is chosen so that what is
// left mid-slurp is never another digit (a 1 drains from its flag to its
// foot, a 6 from the loop's closure up to its top tip, and so on).
//
// Digits 4 and 8 cross themselves; the second pass over the crossing is the
// "over" strand (found automatically) and is drawn on top with its keyline.
//
// At load: per size (hours, minutes) and digit, arrays of sample points and
// unit normals, and the crossing window. Flash: ~2 x 10 x 130 x 4 int16
// = ~21 KB on the device.

const P = {
  // a closed loop from the top centre, anticlockwise on screen
  0: [['M', 11, 0], ['C', 4.6, 0, 0.3, 10.5, 0.3, 24], ['C', 0.3, 37.5, 4.6, 48, 11, 48],
    ['C', 17.4, 48, 21.7, 37.5, 21.7, 24], ['C', 21.7, 10.5, 17.4, 0, 11, 0]],
  // flag tip -> top -> foot (drains from the flag)
  1: [['M', 2, 11], ['C', 6.5, 9.5, 10.5, 6, 13.5, 0.6], ['L', 13.5, 47.5]],
  // hook -> top -> diagonal -> base, lifted at the base's right end
  2: [['M', 1.2, 12.5], ['C', 1.2, 4.5, 5.5, 0.3, 11, 0.3], ['C', 17, 0.3, 21, 4.5, 21, 11],
    ['C', 21, 19.5, 13, 27, 1, 47.3], ['L', 22, 47.3]],
  // bottom tail -> lower bowl -> waist -> upper bowl -> top-left end
  3: [['M', 0.8, 41.5], ['C', 2.8, 45.6, 6.4, 47.7, 10.8, 47.7], ['C', 17.2, 47.7, 21.6, 42, 21.6, 34.6],
    ['C', 21.6, 27.4, 16.8, 22.4, 9, 22.4], ['C', 16, 22.4, 20.6, 17.6, 20.6, 10.8],
    ['C', 20.6, 4.4, 16.6, 0.3, 11, 0.3], ['C', 7, 0.3, 3.6, 2.4, 1.4, 6.4]],
  // stem foot -> top -> diagonal -> bar (over the stem) -> lifted at the bar's end
  4: [['M', 15.5, 47.7], ['L', 15.5, 0.6], ['L', 0.8, 32.5], ['L', 22, 32.5]],
  // bowl tail -> bowl -> up the left -> top bar, lifted at its right end
  5: [['M', 0.8, 41], ['C', 2.8, 45.4, 6.2, 47.6, 10.4, 47.6], ['C', 17, 47.6, 21.5, 41.6, 21.5, 32.2],
    ['C', 21.5, 23.2, 17.2, 17.6, 11.4, 17.6], ['C', 7.8, 17.6, 4.6, 18.8, 2.4, 21],
    ['L', 3.2, 1], ['L', 20.6, 1]],
  // the loop's closure -> loop -> up the left side -> top tip
  6: [['M', 0.9, 31], ['C', 2.2, 26.8, 6.2, 23.4, 11.2, 23.4], ['C', 17.4, 23.4, 21.6, 28.2, 21.6, 35.4],
    ['C', 21.6, 42.8, 17.4, 47.7, 11, 47.7], ['C', 4.4, 47.7, 0.4, 40.8, 0.4, 27.4],
    ['C', 0.4, 9.6, 4.8, 0.3, 11.6, 0.3], ['C', 14.6, 0.3, 17.4, 1.6, 19.6, 4.4]],
  // foot -> diagonal up -> top bar, lifted at its left end
  7: [['M', 7.4, 47.7], ['C', 9.4, 31, 14, 15, 21.2, 0.8], ['L', 0.8, 0.8]],
  // a figure of eight from the top centre: down the left of the upper loop,
  // through the waist, round the lower loop, back over the waist
  8: [['M', 11, 0.3], ['C', 5.6, 0.3, 2, 4.4, 2, 10.6], ['C', 2, 16.6, 6.2, 19.6, 11, 22.6],
    ['C', 16.4, 25.8, 21.6, 28.8, 21.6, 35.4], ['C', 21.6, 43, 16.8, 47.7, 11, 47.7],
    ['C', 5.2, 47.7, 0.4, 43, 0.4, 35.4], ['C', 0.4, 28.8, 5.6, 25.8, 11, 22.6],
    ['C', 15.8, 19.6, 20, 16.6, 20, 10.6], ['C', 20, 4.4, 16.4, 0.3, 11, 0.3]],
  // the loop's closure -> loop -> down the right side -> foot tip
  9: [['M', 21.1, 17], ['C', 19.8, 21.2, 15.8, 24.6, 10.8, 24.6], ['C', 4.6, 24.6, 0.4, 19.8, 0.4, 12.6],
    ['C', 0.4, 5.2, 4.6, 0.3, 11, 0.3], ['C', 17.6, 0.3, 21.6, 7.2, 21.6, 20.6],
    ['C', 21.6, 38.4, 17.2, 47.7, 10.4, 47.7], ['C', 7.4, 47.7, 4.6, 46.4, 2.4, 43.6]],
};

export const BOX_W = 22, BOX_H = 48;

/** Flatten a path to a dense polyline in screen units (sx, sy scale the box). */
function flatten(cmds, sx, sy) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M') { cx = c[1]; cy = c[2]; pts.push([cx * sx, cy * sy]); }
    else if (c[0] === 'L') {
      const n = Math.max(2, Math.ceil(Math.hypot((c[1] - cx) * sx, (c[2] - cy) * sy) * 4));
      for (let i = 1; i <= n; i++) pts.push([(cx + (c[1] - cx) * (i / n)) * sx, (cy + (c[2] - cy) * (i / n)) * sy]);
      cx = c[1]; cy = c[2];
    } else {
      const [, x1, y1, x2, y2, x3, y3] = c;
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        const x = u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const y = u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        pts.push([x * sx, y * sy]);
      }
      cx = x3; cy = y3;
    }
  }
  return pts;
}

/** Resample a polyline at a fixed arc-length step. */
function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    let seg = Math.hypot(bx - ax, by - ay);
    while (acc + seg >= step) {
      const u = (step - acc) / seg;
      ax += (bx - ax) * u; ay += (by - ay) * u;
      out.push([ax, ay]);
      seg = Math.hypot(bx - ax, by - ay); acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.4) out.push(last);
  return out;
}

/** Round the corners: a moving average over +-k samples, ends held. */
function soften(pts, k, closed) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    let w = closed ? k : Math.min(k, i, n - 1 - i), sx = 0, sy = 0, c = 0;
    for (let j = -w; j <= w; j++) {
      const q = closed ? pts[(i + j + n - 1) % (n - 1)] : pts[i + j];
      sx += q[0]; sy += q[1]; c++;
    }
    out.push([sx / c, sy / c]);
  }
  return out;
}

/**
 * One glyph at a size: { n, x, y, nx, ny (Float32Array), len, over: [a, b] | null,
 * cx, cy (centre of the box) }. Coordinates are relative to the box's top-left.
 */
function build(d, sx, sy) {
  const closed = d === 0 || d === 8;
  let pts = resample(flatten(P[d], sx, sy), 0.25);
  pts = soften(soften(pts, 7, closed), 7, closed);
  pts = resample(pts, 1);
  const n = pts.length;
  const x = new Float32Array(n), y = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = pts[i][0]; y[i] = pts[i][1]; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const tx = x[b] - x[a], ty = y[b] - y[a], l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l; ny[i] = tx / l;
  }
  // the crossing: a later sample close to an earlier one, far along the path
  let over = null;
  if (d === 4 || d === 8) {
    let best = 1e9, bj = -1;
    for (let i = 0; i < n; i++) for (let j = i + 20; j < n; j++) {
      if (closed && j > n - 12 && i < 12) continue;
      const e = Math.hypot(x[i] - x[j], y[i] - y[j]);
      if (e < best) { best = e; bj = j; }
    }
    if (bj >= 0) over = [Math.max(0, bj - 7), Math.min(n, bj + 8)];
  }
  return { n, x, y, nx, ny, over, cx: (BOX_W * sx) / 2, cy: (BOX_H * sy) / 2, w: BOX_W * sx, h: BOX_H * sy };
}

/** GLYPHS[size][digit]; size 0 = hours (22 x 48), 1 = minutes (18 x 38). */
export const SIZES = [[1, 1], [18 / 22, 38 / 48]];
export const GLYPHS = SIZES.map(([sx, sy]) => Array.from({ length: 10 }, (_, d) => build(d, sx, sy)));
