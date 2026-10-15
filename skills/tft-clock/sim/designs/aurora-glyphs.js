// Aurora: the ten numerals as single aurora ribbons.
//
// Each digit is ONE continuous ribbon path in a 10 x 16 unit box (y down),
// the way a curtain hangs in the sky: lines, quadratic sweeps and elliptic
// arcs, drawn in one go. A hop ('M') is a dark stretch of the same ribbon
// (an aurora curtain has dark gaps): it is resampled at a quarter of its
// length and carries visibility 0, so a morph can light it up on the way.
// Every digit is resampled to N points by (effective) arc length, with the
// unit normal at each point: the renderer stamps the ribbon from these, and
// a minute turn moves point k of the old digit to point k of the new one.

export const N = 96;

// segments: ['L', x, y] line to, ['Q', cx, cy, x, y] quadratic to,
// ['A', cx, cy, rx, ry, a0, a1] elliptic arc (degrees, y down, a0 -> a1 either way),
// ['M', x, y] dark hop to.
const PATHS = {
  0: [['A', 5, 8, 3.5, 6.55, -90, 278]],
  1: [['P', 2.3, 4.9], ['Q', 4.6, 3.7, 6.0, 1.45], ['L', 6.0, 14.55]],
  2: [['A', 5, 4.85, 3.45, 3.4, 192, 385], ['Q', 4.2, 10.0, 1.5, 14.55], ['L', 8.7, 14.55]],
  3: [['A', 4.9, 4.55, 3.3, 3.15, 205, 450], ['L', 3.3, 7.7], ['L', 5.0, 7.7], ['A', 5.0, 11.1, 3.6, 3.45, -90, 158]],
  4: [['P', 5.6, 1.45], ['L', 1.5, 10.5], ['L', 8.8, 10.5], ['M', 6.9, 4.6], ['L', 6.9, 14.55]],
  5: [['P', 8.5, 1.45], ['L', 2.5, 1.45], ['L', 2.25, 7.5], ['A', 5.05, 10.65, 3.55, 3.9, 232, 508]],
  6: [['P', 7.8, 1.6], ['Q', 1.6, 3.6, 1.45, 10.65], ['A', 5.0, 10.65, 3.55, 3.9, 180, -175]],
  7: [['P', 1.45, 1.45], ['L', 8.6, 1.45], ['Q', 5.0, 7.0, 3.7, 14.55]],
  8: [['A', 5, 4.45, 3.0, 3.0, 90, 450], ['A', 5, 11.05, 3.55, 3.5, 270, -90]],
  9: [['A', 5, 5.35, 3.55, 3.9, 0, 365], ['Q', 8.4, 12.8, 3.0, 14.55]],
};

const D2R = Math.PI / 180;

/** Dense polyline [[x, y, vis], ...] from a segment list. */
function dense(segs) {
  const pts = [];
  let cx = 0, cy = 0;
  const push = (x, y, v) => { pts.push([x, y, v]); cx = x; cy = y; };
  for (const s of segs) {
    if (s[0] === 'P') { push(s[1], s[2], 1); continue; }
    if (s[0] === 'L' || s[0] === 'M') {
      const v = s[0] === 'L' ? 1 : 0, x0 = cx, y0 = cy, n = 60;
      for (let i = 1; i <= n; i++) push(x0 + (s[1] - x0) * i / n, y0 + (s[2] - y0) * i / n, v);
      if (v === 0) pts[pts.length - 1][2] = 1;          // the ribbon is lit again where it lands
      continue;
    }
    if (s[0] === 'Q') {
      const x0 = cx, y0 = cy, [, qx, qy, x1, y1] = s, n = 80;
      for (let i = 1; i <= n; i++) {
        const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        push(a * x0 + b * qx + c * x1, a * y0 + b * qy + c * y1, 1);
      }
      continue;
    }
    if (s[0] === 'A') {
      const [, ox, oy, rx, ry, a0, a1] = s, n = Math.ceil(Math.abs(a1 - a0) / 2);
      for (let i = 0; i <= n; i++) {
        const a = (a0 + (a1 - a0) * i / n) * D2R;
        push(ox + rx * Math.cos(a), oy + ry * Math.sin(a), 1);
      }
    }
  }
  return pts;
}

function resample(pts) {
  // effective length: dark hops count a quarter
  const L = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    L.push(L[i - 1] + d * (pts[i][2] > 0.5 || pts[i - 1][2] > 0.5 ? (pts[i][2] > 0.5 && pts[i - 1][2] > 0.5 ? 1 : 0.6) : 0.25));
  }
  const total = L[L.length - 1];
  const x = new Float32Array(N), y = new Float32Array(N), v = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / (N - 1)) * total;
    while (j < pts.length - 2 && L[j + 1] < target) j++;
    const seg = L[j + 1] - L[j], u = seg > 0 ? (target - L[j]) / seg : 0;
    x[k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
    y[k] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
    v[k] = pts[j][2] + (pts[j + 1][2] - pts[j][2]) * u;
  }
  for (let k = 0; k < N; k++) {
    const a = x[Math.min(N - 1, k + 1)] - x[Math.max(0, k - 1)], b = y[Math.min(N - 1, k + 1)] - y[Math.max(0, k - 1)];
    const l = Math.hypot(a, b) || 1;
    nx[k] = -b / l; ny[k] = a / l;
  }
  return { x, y, v, nx, ny };
}

/** GLYPHS[d] = { x, y, v, nx, ny } in glyph units (10 x 16 box), N points each. */
export const GLYPHS = Array.from({ length: 10 }, (_, d) => resample(dense(PATHS[d])));

// ------------------------------------------------------------ point correspondence for a morph a -> b
// Point k of a goes to point PAIR[a][b](k) of b: the identity, b reversed, or
// (for the closed 0) any rotation of b either way, whichever moves the
// ribbon least (mean squared travel). In flash: one shift and a direction per pair.
const CLOSED = [true, false, false, false, false, false, false, false, false, false];
function idx(k, sh, rev, closed) {
  if (!closed) return rev ? N - 1 - k : k;
  const L = N - 1;                       // the closed path repeats its first point at the end
  return rev ? (sh - k + 2 * L) % L : (k + sh) % L;
}
// ribbon point k sits at a[ta[k]] before and at b[tb[k]] after; one side keeps its order
function bestMap(a, b) {
  const A = GLYPHS[a], B = GLYPHS[b], moveA = CLOSED[a] && !CLOSED[b];
  const closed = moveA ? CLOSED[a] : CLOSED[b], shifts = closed ? N - 1 : 1;
  let best = null;
  for (const rev of [false, true]) for (let sh = 0; sh < shifts; sh++) {
    let c = 0;
    for (let k = 0; k < N; k++) {
      const j = idx(k, sh, rev, closed);
      const ia = moveA ? j : k, ib = moveA ? k : j;
      c += (A.x[ia] - B.x[ib]) ** 2 + (A.y[ia] - B.y[ib]) ** 2;
    }
    if (!best || c < best.cost) best = { sh, rev, cost: c };
  }
  const ta = new Uint8Array(N), tb = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const j = idx(k, best.sh, best.rev, closed);
    ta[k] = moveA ? j : k; tb[k] = moveA ? k : j;
  }
  return [ta, tb];
}
const MAPS = Array.from({ length: 10 }, (_, a) => Array.from({ length: 10 }, (_, b) => bestMap(a, b)));
/** PAIR(a, b) = [ta, tb]: ribbon point k morphs from point ta[k] of a to point tb[k] of b. */
export const PAIR = (a, b) => MAPS[a][b];
