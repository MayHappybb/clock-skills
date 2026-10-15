// The ten numerals of "dragondance": each one is the body of a dance dragon,
// laid along ONE centre line that runs from its tail to its head.
//
// Every digit is drawn in a 20 x 42 box (the centre line; the body is ~7 px
// thick round it) with lines and cubic curves, flattened, its corners
// rounded the way a cloth body on poles bends, and resampled at N points
// equally spaced along its length, tail first. Every digit has the same N,
// so any digit can writhe into the neutral wave (WAVE) and out of it into
// another, sample by sample.
//
// Per sample: position, unit normal and the "back" side (+1/-1 along the
// normal): the back carries the dorsal teeth and faces away from the
// digit's counters, so the teeth never narrow a counter; the gold belly
// runs on the counter side.
//
// The head is not part of the line: `head` says where it sits (the line's
// last point is its neck) and which way it faces (+1 right, -1 left). Heads
// are placed on the outside of the digit, so no counter is ever closed.
//
// Flash on the device: 10 x 128 samples x (x, y, nx, ny, back) as int16 /
// int8 = ~12 KB.

export const N = 128;
const SY = 40 / 42;                         // the paths are drawn 42 high and set 40 high
export const BOX_W = 20, BOX_H = 42;

// tail -> head, in the 20 x 42 box
const P = {
  // the oval, from the top round to the top again: the head is held up over it
  0: { p: [['M', 8.5, 0.5], ['C', 3, 0.5, 0, 10, 0, 21], ['C', 0, 33, 4, 41.5, 10, 41.5],
    ['C', 16, 41.5, 20, 33, 20, 21], ['C', 20, 10, 17, 0.5, 11.5, 0.5]], c: [[10, 21]] },
  // a curl of tail for the foot, up the stem, down the flag and back up to the top
  1: { p: [['M', 19, 41.5], ['C', 14.5, 41.5, 12, 40, 12, 36], ['L', 12, 0.6]], face: -1, c: [[0, 26], [20, 30]] },
  // the base, the diagonal, over the top to the hook and back up
  2: { p: [['M', 20.5, 41.5], ['L', 0.5, 41.5], ['C', 9, 32, 19.5, 24, 19.5, 12], ['C', 19.5, 4.5, 15, 0.5, 10, 0.5],
    ['C', 5, 0.5, 1.5, 3.2, 0.5, 8], ['C', 1.5, 3.2, 5, 0.5, 10, 0.5]], c: [[9.5, 14]] },
  // lower bowl, waist, upper bowl to the top terminal, and back up to the top
  3: { p: [['M', 0.5, 35], ['C', 2.5, 39.5, 6, 41.5, 10, 41.5], ['C', 16.5, 41.5, 20, 37, 20, 31],
    ['C', 20, 24.5, 15.5, 20.5, 8.5, 20.5], ['C', 15, 20.5, 19, 16.5, 19, 10.5],
    ['C', 19, 4.5, 15, 0.5, 10, 0.5], ['C', 6, 0.5, 2.5, 2.5, 1, 6.5], ['C', 2.5, 2.5, 6, 0.5, 10, 0.5]], c: [[9, 11], [9, 32]] },
  // open at the top: the tail is the left arm's tip, down it, along the bar, back to the
  // stem, down it and back up to the top (the retraced parts print once)
  4: { p: [['M', 5.5, 3], ['L', 0.5, 29.5], ['L', 21, 29.5], ['L', 15.5, 29.5], ['L', 15.5, 41.5], ['L', 15.5, 0.6]], face: 1, c: [[8.5, 14]] },
  // round the bowl, up the left, along the top
  5: { p: [['M', 0.5, 35.5], ['C', 2.5, 39.5, 6, 41.5, 10, 41.5], ['C', 16.5, 41.5, 20, 36.5, 20, 29.5],
    ['C', 20, 22, 16, 17.5, 10.5, 17.5], ['C', 7, 17.5, 4.5, 18.5, 2, 20.5],
    ['L', 2.5, 0.5], ['L', 18.5, 0.5]], face: 1, c: [[9.5, 30], [13, 9]] },
  // round the loop, up the left, over the top to the tip
  6: { p: [['M', 0.8, 28.5], ['C', 2.5, 24.5, 6, 22, 10.5, 22], ['C', 16.5, 22, 20, 26.5, 20, 32],
    ['C', 20, 38, 16, 41.5, 10, 41.5], ['C', 3.5, 41.5, 0, 36, 0, 25],
    ['C', 0, 9, 4, 0.5, 11, 0.5], ['C', 14, 0.5, 16.5, 1.5, 18.5, 3.5]], face: 1, c: [[10, 32], [15, 13]] },
  // up the diagonal, along the top bar
  7: { p: [['M', 6.5, 41.5], ['C', 8.5, 27, 13, 14, 19.5, 0.5], ['L', 2, 0.5]], face: -1, c: [[3, 22], [20, 34]] },
  // a figure of eight from the top to the top
  8: { p: [['M', 8.5, 0.5], ['C', 4, 1, 1.5, 4.5, 1.5, 10], ['C', 1.5, 15.5, 5.5, 18, 10, 20.5],
    ['C', 15.5, 23.5, 20, 26.5, 20, 32], ['C', 20, 38, 15.5, 41.5, 10, 41.5],
    ['C', 4.5, 41.5, 0, 38, 0, 32], ['C', 0, 26.5, 4.5, 23.5, 10, 20.5],
    ['C', 14.5, 18, 18.5, 15.5, 18.5, 10], ['C', 18.5, 4.5, 16, 0.8, 11.5, 0.5]], c: [[10, 10], [10, 32]] },
  // from the foot tip up the right, round the loop to where it closes, and back up to the top
  9: { p: [['M', 1.5, 39], ['C', 3.5, 40.5, 6, 41.5, 9, 41.5], ['C', 16, 41.5, 20, 33, 20, 17],
    ['C', 20, 6, 16.5, 0.5, 10, 0.5], ['C', 4, 0.5, 0, 4, 0, 10], ['C', 0, 15.5, 3.5, 20, 9.5, 20],
    ['C', 14, 20, 17.5, 17.5, 19.6, 13.5], ['C', 20, 6, 16.5, 0.5, 10.5, 0.5]], c: [[10, 10], [5, 31]] },
};

function flatten(cmds) {
  const pts = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c[0] === 'M') { cx = c[1]; cy = c[2]; pts.push([cx, cy]); }
    else if (c[0] === 'L') {
      const [, x, y] = c;
      for (let k = 1; k <= 16; k++) pts.push([cx + (x - cx) * k / 16, cy + (y - cy) * k / 16]);
      cx = x; cy = y;
    } else {
      const [, x1, y1, x2, y2, x, y] = c;
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t;
        pts.push([u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
      }
      cx = x; cy = y;
    }
  }
  return pts;
}

/** Resample a polyline to n points equally spaced along its length. */
function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1], out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (tot * k) / (n - 1);
    while (j < pts.length - 1 && L[j] < s) j++;
    const a = L[j - 1], b = L[j], f = b > a ? (s - a) / (b - a) : 0;
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
  }
  return { pts: out, len: tot };
}

/** Round the corners: a moving average over ~r px of arc length, ends pinned. */
function soften(pts, r) {
  const fine = resample(pts, 600), step = fine.len / 599, k = Math.max(1, Math.round(r / step));
  const P2 = fine.pts, out = [];
  for (let i = 0; i < P2.length; i++) {
    let sx = 0, sy = 0, n = 0;
    const kk = Math.min(k, i, P2.length - 1 - i);
    for (let j = -kk; j <= kk; j++) { sx += P2[i + j][0]; sy += P2[i + j][1]; n++; }
    out.push([sx / n, sy / n]);
  }
  return out;
}

/**
 * Where the two dancers' poles meet the body: the lowest sample over the
 * left and over the right half of the box (both poles go to the lowest
 * point if one half has nothing low over it), so a pole never crosses the
 * digit or stands up beside it.
 */
function attach(X, Y) {
  let lo = -1, l0 = -1, l1 = -1;
  for (let i = 0; i < N; i++) {
    if (lo < 0 || Y[i] > Y[lo]) lo = i;
    if (X[i] < 10 && (l0 < 0 || Y[i] > Y[l0])) l0 = i;
    if (X[i] >= 10 && (l1 < 0 || Y[i] > Y[l1])) l1 = i;
  }
  if (l0 < 0 || Y[l0] < 28) l0 = lo;
  if (l1 < 0 || Y[l1] < 28) l1 = lo;
  // where the two dancers stand (box x): under their points, at least 8 px apart
  let x0 = X[l0], x1 = X[l1];
  if (x1 - x0 < 8) { const m = (x0 + x1) / 2; x0 = m - 4; x1 = m + 4; }
  return [l0, l1, Math.max(-2, x0), Math.min(22, x1)];
}

/** The body's radius along it: the tail tapers to a point over its last ~9 px. */
export const R_BODY = 3.7;
function taper(step) {
  const r = new Float32Array(N);
  for (let i = 0; i < N; i++) { const u = Math.min(1, (i * step) / 9); r[i] = R_BODY * (0.3 + 0.7 * u * u * (3 - 2 * u)); }
  return r;
}

function build(spec) {
  const { pts, len } = resample(soften(flatten(spec.p).map(([x, y]) => [x, y * SY]), 2.2), N);
  const X = new Float32Array(N), Y = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N);
  const BACK = new Int8Array(N);
  for (let i = 0; i < N; i++) { X[i] = pts[i][0]; Y[i] = pts[i][1]; }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
    let tx = X[b] - X[a], ty = Y[b] - Y[a];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    NX[i] = -ty; NY[i] = tx;
    // the back faces away from the nearest counter
    let best = 1e9, cx = 10, cy = 21;
    for (const [qx, qy0] of spec.c) { const qy = qy0 * SY; const d = (qx - X[i]) ** 2 + (qy - Y[i]) ** 2; if (d < best) { best = d; cx = qx; cy = qy; } }
    BACK[i] = (X[i] - cx) * NX[i] + (Y[i] - cy) * NY[i] >= 0 ? 1 : -1;
  }
  // the tangent at the neck (for the head's join)
  const tx = X[N - 1] - X[N - 4], ty = Y[N - 1] - Y[N - 4], tl = Math.hypot(tx, ty) || 1;
  return { X, Y, NX, NY, BACK, RAD: taper(len / (N - 1)), len, step: len / (N - 1), face: spec.face ?? 0, tx: tx / tl, ty: ty / tl, att: attach(X, Y) };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(P[d]));

/**
 * The neutral wave the dragon runs through at the minute turn: two humps
 * across the slot, low and long, the head at the end facing `face`. Not a
 * numeral in any phase.
 */
export function waveGlyph(face) {
  const pts = [];
  for (let k = 0; k <= 200; k++) {
    const s = k / 200, x = -3 + 26 * s, y = 27 + 4.5 * Math.sin(Math.PI * 2 * 1.5 * s + 0.3);
    pts.push([face > 0 ? x : 20 - x, y]);
  }
  const { pts: q, len } = resample(pts, N);
  const X = new Float32Array(N), Y = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N), BACK = new Int8Array(N);
  for (let i = 0; i < N; i++) { X[i] = q[i][0]; Y[i] = q[i][1]; }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
    let tx = X[b] - X[a], ty = Y[b] - Y[a];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    NX[i] = -ty; NY[i] = tx;
    BACK[i] = NY[i] < 0 ? 1 : -1;            // the back is up
  }
  return { X, Y, NX, NY, BACK, RAD: taper(len / (N - 1)), len, step: len / (N - 1), face, tx: face, ty: 0, att: attach(X, Y) };
}
export const WAVES = { 1: waveGlyph(1), '-1': waveGlyph(-1) };
