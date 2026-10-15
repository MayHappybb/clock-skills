// The ten numerals of "nouveau", each one lock of the muse's hair.
//
// Every digit is a centre line (one or two tresses), drawn in a 19 x 46 box
// with lines and cubic curves in the Art Nouveau letter manner (tall, high
// shoulders, whiplash terminals that taper to a hair's point), flattened,
// softened and resampled at 1 px steps. A lock is a ribbon round that line.
//
// At load each glyph becomes a FIELD over its box plus a margin: for every
// pixel, the signed offset from the centre line (1/8 px, int8) and the index
// of the nearest sample along the lock (uint8), in two layers where the lock
// crosses or overlaps itself (the later pass lies over the earlier one, so a
// 0's tip wraps over its root and an 8's waist crosses). The frame then
// shades a lock with a few integer ops a pixel: the per-sample displacement
// and radius (the ripple, the beat's swell, the taper) are looked up by the
// sample index, so the whole lock waves without ever being re-stamped.
//
// Flash: 10 fields of 33 x 60 x 4 bytes (79 KB) + samples and normals for
// the turn's strands (10 x ~150 x 4 x 2 bytes, 12 KB) + tapers (1.5 KB).

export const BOX_W = 19, BOX_H = 46, MARGIN = 7;
export const FW = BOX_W + 2 * MARGIN, FH = BOX_H + 2 * MARGIN;
export const NONE = 255;

// Each glyph: a list of tresses; each tress: [commands, taperStart, taperEnd] (px of taper)
const P = {
  // an egg-shaped loop; the tip wraps past its root over the top and tapers off
  0: [[[['M', 4.2, 3.2], ['C', 6, 1, 7.5, 0.2, 9.5, 0.2], ['C', 15, 0.2, 18.6, 9, 18.6, 23],
    ['C', 18.6, 37, 15, 45.8, 9.5, 45.8], ['C', 4, 45.8, 0.4, 37, 0.4, 23], ['C', 0.4, 9, 4, 0.2, 9.5, 0.2],
    ['C', 12.5, 0.2, 15, 2, 16.6, 5.5]], 9, 9]],
  // a drooping lock as the flag, a straight stem, the foot whipping out to the right
  1: [[[['M', 3.4, 10.4], ['C', 6.6, 8.6, 9.8, 5.4, 12, 0.6], ['L', 12, 38], ['C', 12, 43.5, 14.5, 46, 18.5, 45.4]], 4, 7]],
  // a curl at the top left, swan neck, a whiplash base
  2: [[[['M', 5.4, 12.6], ['C', 1.4, 12.4, 0.6, 7.5, 2.4, 4.4], ['C', 4.4, 1.2, 7.4, 0.2, 10, 0.2],
    ['C', 15.4, 0.2, 18.4, 4.4, 18.4, 10.6], ['C', 18.4, 21, 8, 30, 0.8, 45.4],
    ['C', 6, 42.4, 12, 46.6, 18.6, 43.4]], 9, 8]],
  // top tail -> upper bowl -> waist -> lower bowl -> bottom tail
  3: [[[['M', 1.2, 7.6], ['C', 2.8, 2.8, 6.4, 0.2, 10, 0.2], ['C', 15, 0.2, 17.6, 4, 17.6, 9.6],
    ['C', 17.6, 15.6, 14, 20, 7.6, 21.2], ['C', 14.6, 21.6, 18.6, 27, 18.6, 33.4],
    ['C', 18.6, 41, 14.4, 45.8, 9.2, 45.8], ['C', 5.2, 45.8, 2.2, 43.6, 0.6, 39.4]], 8, 8]],
  // open 4: a lock falls from the top left and turns into the bar; the stem crosses it
  4: [[[['M', 2.8, 0.4], ['C', 1.0, 9, 0.5, 18, 0.5, 30.6], ['L', 18.7, 30.6]], 6, 6],
    [[['M', 14.6, 4], ['L', 14.6, 39], ['C', 14.6, 43, 13.2, 45.4, 10.6, 45.8]], 5, 6]],
  // top flag (whipping up at its end) -> down the left -> the belly -> a tail
  5: [[[['M', 18.6, 0.2], ['C', 14, 1.8, 8, 0.6, 3, 1.4], ['L', 2.2, 20.8], ['C', 4.4, 18.6, 7.4, 17.2, 10.4, 17.2],
    ['C', 15.6, 17.2, 18.6, 23, 18.6, 31.2], ['C', 18.6, 40.4, 14.4, 45.8, 9, 45.8],
    ['C', 5.2, 45.8, 2.2, 43.6, 0.6, 39.6]], 7, 8]],
  // a long lock curving down from the top tip, round into the loop, the loop closing over the stem
  6: [[[['M', 16.8, 3.6], ['C', 15, 1.2, 12.6, 0.2, 10.2, 0.2], ['C', 3.4, 0.2, 0.4, 10, 0.4, 27.4],
    ['C', 0.4, 40.6, 4.2, 45.8, 9.6, 45.8], ['C', 15.4, 45.8, 18.6, 40.8, 18.6, 34.4],
    ['C', 18.6, 27.4, 15, 23.2, 9.8, 23.2], ['C', 5.6, 23.2, 2.2, 26, 1.0, 30.6]], 8, 9]],
  // the top bar (a lock from the left), then the swinging stem
  7: [[[['M', 0.4, 4.6], ['C', 2, 1.6, 4, 0.6, 6, 0.6], ['L', 18.6, 0.6], ['C', 13, 12, 8.8, 26, 7.2, 45.4]], 7, 7]],
  // a figure of eight from the top: down the left of the upper loop, through
  // the waist, round the lower loop, back over the waist, closing at the top
  8: [[[['M', 12.6, 0.6], ['C', 11.6, 0.3, 10.6, 0.2, 9.5, 0.2], ['C', 4.6, 0.2, 1.6, 4.2, 1.6, 10.2],
    ['C', 1.6, 16, 5.4, 19, 9.5, 21.6], ['C', 14.6, 24.8, 18.6, 28, 18.6, 34.4],
    ['C', 18.6, 41.6, 14.4, 45.8, 9.5, 45.8], ['C', 4.6, 45.8, 0.4, 41.6, 0.4, 34.4],
    ['C', 0.4, 28, 4.4, 24.8, 9.5, 21.6], ['C', 13.6, 19, 17.4, 16, 17.4, 10.2],
    ['C', 17.4, 4.6, 14.8, 0.8, 10.6, 0.3]], 8, 8]],
  // the loop's closure -> loop -> down the right -> a tail curling in at the foot
  9: [[[['M', 18, 15.4], ['C', 16.8, 20, 13.4, 22.8, 9.2, 22.8], ['C', 4, 22.8, 0.4, 18.6, 0.4, 11.6],
    ['C', 0.4, 4.6, 4.2, 0.2, 9.4, 0.2], ['C', 15.2, 0.2, 18.6, 6, 18.6, 18.6],
    ['C', 18.6, 36, 14.6, 45.8, 8.8, 45.8], ['C', 5.6, 45.8, 3, 44.4, 1.4, 41.6]], 9, 9]],
};

function flatten(cmds) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M') { cx = c[1]; cy = c[2]; pts.push([cx, cy]); }
    else if (c[0] === 'L') {
      const n = Math.max(2, Math.ceil(Math.hypot(c[1] - cx, c[2] - cy) * 4));
      for (let i = 1; i <= n; i++) pts.push([cx + (c[1] - cx) * (i / n), cy + (c[2] - cy) * (i / n)]);
      cx = c[1]; cy = c[2];
    } else {
      const [, x1, y1, x2, y2, x3, y3] = c;
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        pts.push([u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
      }
      cx = x3; cy = y3;
    }
  }
  return pts;
}

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

function soften(pts, k) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const w = Math.min(k, i, n - 1 - i);
    let sx = 0, sy = 0, c = 0;
    for (let j = -w; j <= w; j++) { sx += pts[i + j][0]; sy += pts[i + j][1]; c++; }
    out.push([sx / c, sy / c]);
  }
  return out;
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function build(d) {
  const X = [], Y = [], NX = [], NY = [], TP = [], PATH = [];
  P[d].forEach(([cmds, t0, t1], pi) => {
    let pts = resample(flatten(cmds), 0.25);
    pts = soften(soften(pts, 5), 5);
    pts = resample(pts, 1);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = pts[b][0] - pts[a][0], ty = pts[b][1] - pts[a][1], l = Math.hypot(tx, ty) || 1;
      X.push(pts[i][0]); Y.push(pts[i][1]); NX.push(-ty / l); NY.push(tx / l);
      // the taper: a hair's point at each end, the lock full in between
      TP.push(Math.min(t0 ? 0.12 + 0.88 * smooth(i / t0) : 1, t1 ? 0.12 + 0.88 * smooth((n - 1 - i) / t1) : 1));
      PATH.push(pi);
    }
  });
  const n = X.length;
  if (n > 250) throw new Error(`nouveau glyph ${d}: ${n} samples`);
  const S1 = new Int8Array(FW * FH), L1 = new Uint8Array(FW * FH).fill(NONE);
  const S2 = new Int8Array(FW * FH), L2 = new Uint8Array(FW * FH).fill(NONE);
  const sgn = (px, py, i) => {
    const dx = px - X[i], dy = py - Y[i];
    const perp = dx * NX[i] + dy * NY[i], along = dx * NY[i] - dy * NX[i];
    const end = i === 0 || i === n - 1 || PATH[i - 1] !== PATH[i] || PATH[i + 1] !== PATH[i];
    const ex = end ? Math.max(0, Math.abs(along) - 0.5) : 0;
    const dist = Math.sqrt(perp * perp + ex * ex);
    return perp < 0 ? -dist : dist;
  };
  for (let fy = 0; fy < FH; fy++)
    for (let fx = 0; fx < FW; fx++) {
      const px = fx - MARGIN + 0.5, py = fy - MARGIN + 0.5;
      let ia = -1, da = 1e9;
      for (let i = 0; i < n; i++) { const e = (px - X[i]) ** 2 + (py - Y[i]) ** 2; if (e < da) { da = e; ia = i; } }
      if (da > 49) continue;
      let ib = -1, db = 1e9;
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - ia) <= 14 && PATH[i] === PATH[ia]) continue;
        const e = (px - X[i]) ** 2 + (py - Y[i]) ** 2;
        if (e < db) { db = e; ib = i; }
      }
      const k = fy * FW + fx;
      const q = (v) => Math.max(-127, Math.min(127, Math.round(v * 8)));
      if (ib >= 0 && db <= 49) {
        const hi = Math.max(ia, ib), lo = Math.min(ia, ib);
        S1[k] = q(sgn(px, py, hi)); L1[k] = hi; S2[k] = q(sgn(px, py, lo)); L2[k] = lo;
      } else { S1[k] = q(sgn(px, py, ia)); L1[k] = ia; }
    }
  return {
    n, S1, L1, S2, L2,
    x: Float32Array.from(X), y: Float32Array.from(Y), nx: Float32Array.from(NX), ny: Float32Array.from(NY),
    taper: Float32Array.from(TP),
  };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
