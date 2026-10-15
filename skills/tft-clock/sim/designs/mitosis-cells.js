// Mitosis helpers: the ten digit-cells as skeletons, and their per-slot
// geometry, all precomputed once at load (on the device: tables in flash).
//
// A digit is one cell whose body follows a skeleton: strokes of points in a
// unit box, each point with a radius factor. At a slot the skeleton is
// scaled, tilted and resampled to ~5 px segments; the body is the union of
// capsules between consecutive points (drawn by thickLine), so every shape
// the cell takes on (resting digit, rounding up, a disc, two daughters) is
// the same kind of thing: a list of capsules.

const D2R = Math.PI / 180;

/** Points on an ellipse in the unit box, angles in degrees (y down: 90 is the bottom). */
function arc(cx, cy, rx, ry, a0, a1, step = 12) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D2R;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

// Each digit: strokes (lists of [x, y] in 0..1), the nucleus (stroke, fraction
// along it) and whether a stroke is a closed loop. Designed as a set: one
// egg-shaped bowl family, round-capped free ends that swell like pseudopod
// tips, counters kept open at 64 and 46 px.
export const DIGITS = [
  // 0: a single ring-shaped cell, a little egg-shaped
  { strokes: [arc(0.5, 0.5, 0.5, 0.5, -90, 270, 12)], closed: [true], nuc: [0, 0.62] },
  // 1: a bowed stem with a short pseudopod flag
  { strokes: [[[0.66, 0.0], [0.63, 0.35], [0.6, 0.7], [0.6, 1.0]], [[0.66, 0.0], [0.44, 0.1], [0.2, 0.19]]], closed: [false, false], nuc: [0, 0.58] },
  // 2
  { strokes: [[...arc(0.5, 0.26, 0.5, 0.26, 195, 365, 12), [0.86, 0.5], [0.52, 0.74], [0.04, 1.0], [0.55, 1.0], [1.0, 0.98]]], closed: [false], nuc: [0, 0.6] },
  // 3: two bowls, the top one narrower
  { strokes: [[...arc(0.46, 0.24, 0.46, 0.24, 200, 450, 12), ...arc(0.47, 0.73, 0.53, 0.27, 270, 520, 12).slice(1)]], closed: [false], nuc: [0, 0.72] },
  // 4: closed form (an open 4 reads as U)
  { strokes: [[[0.74, 0.0], [0.74, 1.0]], [[0.74, 0.0], [0.36, 0.36], [0.0, 0.7]], [[0.0, 0.7], [0.5, 0.7], [1.0, 0.7]]], closed: [false, false, false], nuc: [0, 0.86] },
  // 5
  { strokes: [[[0.96, 0.0], [0.55, 0.0], [0.12, 0.0], [0.09, 0.22], [0.06, 0.45], ...arc(0.48, 0.69, 0.52, 0.31, 222, 510, 12).slice(1)]], closed: [false], nuc: [0, 0.68] },
  // 6
  { strokes: [[[0.9, 0.03], [0.5, 0.06], [0.18, 0.28], [0.03, 0.58], ...arc(0.5, 0.7, 0.48, 0.3, 175, -185, 12).slice(1)]], closed: [false], nuc: [0, 0.78] },
  // 7
  { strokes: [[[0.0, 0.0], [0.5, 0.0], [1.0, 0.0], [0.78, 0.3], [0.56, 0.62], [0.44, 1.0]]], closed: [false], nuc: [0, 0.68] },
  // 8: two loops
  { strokes: [arc(0.5, 0.25, 0.43, 0.25, 90, 450, 12), arc(0.5, 0.72, 0.5, 0.28, -90, 270, 12)], closed: [true, true], nuc: [1, 0.35] },
  // 9: a 6 turned round
  { strokes: [[...arc(0.5, 0.3, 0.48, 0.3, -5, -365, 12), [0.98, 0.6], [0.82, 0.88], [0.45, 1.0], [0.1, 0.97]]], closed: [false], nuc: [0, 0.22] },
];

/**
 * The four cell positions: not a row of equals but a culture. The hours are
 * two big cells; the minutes, smaller, sit staggered on the right.
 */
export const SLOTS = [
  { x: 4, y: 8, w: 30, h: 64, tilt: -3, r: 5.4 },
  { x: 38, y: 9, w: 30, h: 64, tilt: 2.5, r: 5.4 },
  { x: 86, y: 6, w: 27, h: 46, tilt: -4, r: 4.6 },
  { x: 123, y: 26, w: 27, h: 46, tilt: 4, r: 4.6 },
];

export const GW = 41, GH = 21;    // the background's coarse grid (cell 4)

/** Resample a polyline (px) to segments about `step` long. */
function resample(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / step));
  const out = [];
  let k = 1;
  for (let j = 0; j <= n; j++) {
    const s = (L * j) / n;
    while (k < pts.length - 1 && cum[k] < s) k++;
    const u = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    out.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u]);
  }
  return { pts: out, len: L };
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

/**
 * The geometry of digit d at slot `sl`: flat typed arrays (monomorphic, as
 * a C struct of arrays would be).
 *   x, y, nx, ny, r    per point: position, normal, rest radius
 *   arc                per point: distance along its stroke (px)
 *   delay              per point: 0 near the nucleus .. 1 at the far tips
 *   seg                pairs of point indices: the capsules
 *   paths              per stroke: [first point, count, length, closed]
 *   cx, cy             where the cell rounds up (the slot's centre)
 *   nucX, nucY, nucA   the nucleus and the stroke's angle there
 *   glow               the out-of-focus haze, on the background grid
 */
function build(sl, d) {
  const S = SLOTS[sl], D = DIGITS[d];
  const bw = S.w - 2 * S.r, bh = S.h - 2 * S.r;
  const cx = S.x + S.w / 2, cy = S.y + S.h / 2;
  const ca = Math.cos(S.tilt * D2R), sa = Math.sin(S.tilt * D2R);
  const place = ([u, v]) => {
    const px = S.x + S.r + u * bw - cx, py = S.y + S.r + v * bh - cy;
    return [cx + px * ca - py * sa, cy + px * sa + py * ca];
  };
  const X = [], Y = [], NX = [], NY = [], RR = [], ARC = [], seg = [], paths = [];
  let nucX = cx, nucY = cy, nucA = 0;
  D.strokes.forEach((st, k) => {
    const { pts, len } = resample(st.map(place), 5.6);
    const first = X.length, closed = D.closed[k];
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      X.push(p[0]); Y.push(p[1]); NX.push(-(b[1] - a[1]) / tl); NY.push((b[0] - a[0]) / tl);
      // free ends swell like the tip of a pseudopod; the body is a little
      // lumpy along its length, differently for every digit
      const end = !closed && (i === 0 || i === pts.length - 1) ? 1.16 : 1;
      const lump = 1 + 0.11 * Math.sin(acc * 0.23 + d * 1.7 + k) + 0.06 * Math.sin(acc * 0.61 + d * 2.9);
      RR.push(S.r * end * lump); ARC.push(acc);
      if (i) seg.push(first + i - 1, first + i);
    });
    paths.push([first, pts.length, len, closed ? 1 : 0]);
    if (k === D.nuc[0]) {
      const target = D.nuc[1] * len;
      let i = 0;
      while (i < pts.length - 1 && ARC[first + i] < target) i++;
      nucX = X[first + i]; nucY = Y[first + i];
      const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1);
      nucA = Math.atan2(Y[first + b] - Y[first + a], X[first + b] - X[first + a]);
    }
  });
  // the nucleus bulges the membrane around it
  for (let i = 0; i < X.length; i++) {
    const dd = Math.hypot(X[i] - nucX, Y[i] - nucY);
    const b = Math.max(0, 1 - dd / 10);
    RR[i] *= 1 + 0.3 * b * b * (3 - 2 * b);
  }
  // pseudopod order: points near the nucleus move first, far tips last
  let far = 1;
  const dist = X.map((x, i) => { const v = Math.hypot(x - nucX, Y[i] - nucY); far = Math.max(far, v); return v; });
  const delay = Float32Array.from(dist, (v) => v / far);
  // the haze round the cell, on the background grid
  const glow = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const px = i * 4, py = j * 4;
      if (px < S.x - 14 || px > S.x + S.w + 14 || py < S.y - 14 || py > S.y + S.h + 14) continue;
      let best = 99;
      for (let q = 0; q < seg.length; q += 2) best = Math.min(best, segDist(px, py, X[seg[q]], Y[seg[q]], X[seg[q + 1]], Y[seg[q + 1]]));
      const v = Math.max(0, 1 - Math.max(0, best - S.r) / 11);
      glow[j * GW + i] = v * v;
    }
  // where each point sits when the cell is round: evenly spaced round a
  // ring, in the order of the points' own angles about the centre, so the
  // ring is covered evenly whatever the digit (a '1' has no points to the side)
  const raw = X.map((x, i) => Math.atan2(Y[i] - cy, x - cx));
  const order = raw.map((_, i) => i).sort((a, b) => raw[a] - raw[b]);
  const theta = new Float32Array(X.length);
  order.forEach((i, rank) => { theta[i] = -Math.PI + (2 * Math.PI * (rank + 0.5)) / X.length; });
  const cth = Float32Array.from(theta, Math.cos), sth = Float32Array.from(theta, Math.sin);
  // the membrane takes the dye up patchily: a tone per capsule (-1, 0, +1)
  const tone = Int8Array.from({ length: seg.length / 2 }, (_, q) => {
    const v = Math.sin(q * 12.9898 + d * 78.233 + sl * 3.7) * 43758.5453, f = v - Math.floor(v);
    return f < 0.22 ? 1 : f > 0.82 ? -1 : 0;
  });
  return {
    n: X.length, tone, x: Float32Array.from(X), y: Float32Array.from(Y), nx: Float32Array.from(NX), ny: Float32Array.from(NY),
    r: Float32Array.from(RR), arc: Float32Array.from(ARC), delay, seg: Int16Array.from(seg), paths,
    cth, sth, cx, cy, nucX, nucY, nucA, glow,
  };
}

/** GEO[slot][digit] */
export const GEO = SLOTS.map((_, sl) => DIGITS.map((_, d) => build(sl, d)));

/** The round (mitotic) cell at each slot: radius, and its haze on the background grid. */
export const ROUND = SLOTS.map((S) => {
  const R = S.h > 50 ? 13 : 11, cx = S.x + S.w / 2, cy = S.y + S.h / 2;
  const glow = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const v = Math.max(0, 1 - Math.max(0, Math.hypot(i * 4 - cx, j * 4 - cy) - R) / 11);
      glow[j * GW + i] = v * v;
    }
  return { R, cx, cy, glow };
});

/** The field's vignette on the background grid: 1 at the centre of the field, falling off to the corners. */
export const VIGNETTE = new Float32Array(GW * GH);
for (let j = 0; j < GH; j++)
  for (let i = 0; i < GW; i++) {
    const dx = (i * 4 - 80) / 96, dy = (j * 4 - 40) / 58;
    VIGNETTE[j * GW + i] = Math.max(0, 1 - (dx * dx + dy * dy) * 0.9);
  }
