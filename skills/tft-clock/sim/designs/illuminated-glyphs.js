// Numerals for 'illuminated': ten Lombardic-style figures, drawn as stroke
// skeletons (centre lines with a width at every node: thick on the curves'
// flanks, hairline at the joins, ball terminals), the way a versal is built
// up with a pen and then filled. At start-up each skeleton becomes, for a
// given box size, a signed distance field (px) and an `order` field (how far
// along the pen's path the nearest stroke point is, 0..1), which the face
// turns into gold leaf with pillowed normals, painted digits, and the order
// a quill fills them in. On the device these are flash tables.

const TAU = Math.PI * 2;

// a node: [x, y, w]   x, y normalised in the box, w a fraction of the thick width
function arc(cx, cy, rx, ry, a0, a1, wf, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, a = ((a0 + (a1 - a0) * u) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a), wf(a, u)]);
  }
  return out;
}
// width profile on a ring: thick on the flanks (left/right), thin top and bottom
const flank = (lo, hi = 1, p = 1.4) => (a) => lo + (hi - lo) * Math.abs(Math.sin(a)) ** p;
/** A Lombardic thorn: a spur from the stroke's middle out to a point. */
const thorn = (x, y, dx, dy) => [[x, y, 0.8], [x + dx * 0.55, y + dy * 0.55, 0.42], [x + dx, y + dy, 0.02]];
const lerpW = (w0, w1) => (a, u) => w0 + (w1 - w0) * u;

/**
 * The skeletons. Each digit is a list of strokes in drawing order; a stroke
 * is a list of nodes, or { ball: [x, y, w] } for a terminal. Widths are
 * fractions of the thick stroke; `thin` (passed in) is the hairline fraction.
 */
function skeleton(d, th) {
  const T = 1;
  switch (d) {
    case 0: return [arc(0.5, 0.5, 0.37, 0.415, 0, 360, flank(th * 1.05, T * 0.72, 1.5), 40), thorn(0.14, 0.5, -0.16, 0), thorn(0.86, 0.5, 0.16, 0)];
    case 1: return [
      [[0.2, 0.25, th], [0.36, 0.15, th * 1.6], [0.56, 0.05, T * 0.9]],
      [[0.57, 0.06, T * 1.0], [0.56, 0.3, T * 0.86], [0.56, 0.55, T * 0.82], [0.57, 0.8, T * 0.92], [0.57, 0.9, T]],
      [[0.22, 0.93, th * 1.25], [0.57, 0.93, th * 1.7], [0.9, 0.93, th * 1.25]],
      { ball: [0.19, 0.255, th * 2.1] },
    ];
    case 2: return [
      { ball: [0.2, 0.25, T * 1.0] },
      [...arc(0.5, 0.29, 0.31, 0.205, -78, 128, (a, u) => (u < 0.5 ? th + (T - th) * (u / 0.5) ** 0.8 : T - (T - 0.7) * (u - 0.5) / 0.5), 20),
        [0.52, 0.6, T * 0.78], [0.3, 0.78, T * 0.8], [0.16, 0.9, T * 0.7]],
      [[0.13, 0.92, th * 1.5], [0.5, 0.91, th * 1.5], [0.86, 0.92, th * 1.7], [0.9, 0.82, th * 1.1]],
    ];
    case 3: return [
      { ball: [0.2, 0.2, T * 0.95] },
      [...arc(0.47, 0.265, 0.29, 0.195, -72, 150, (a, u) => th + (T * 0.85 - th) * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.7, 18),
        [0.38, 0.47, th * 1.3]],
      arc(0.5, 0.685, 0.35, 0.245, -15, 238, (a, u) => th * 1.2 + (T - th * 1.2) * Math.sin(Math.PI * u) ** 0.8, 22),
      { ball: [0.19, 0.79, T * 0.95] },
      thorn(0.84, 0.69, 0.16, 0),
    ];
    case 4: return [
      [[0.68, 0.05, th * 1.3], [0.42, 0.33, th * 1.3], [0.11, 0.67, th * 1.4]],
      [[0.09, 0.69, th * 1.5], [0.5, 0.69, th * 1.6], [0.93, 0.69, th * 1.4]],
      [[0.68, 0.05, T * 0.9], [0.69, 0.4, T * 0.82], [0.69, 0.75, T * 0.86], [0.69, 0.9, T]],
      [[0.47, 0.93, th * 1.2], [0.69, 0.93, th * 1.6], [0.9, 0.93, th * 1.2]],
    ];
    case 5: return [
      [[0.88, 0.0, th * 1.0], [0.84, 0.07, th * 1.5], [0.55, 0.08, th * 1.5], [0.3, 0.08, th * 1.7]],
      [[0.3, 0.07, T * 0.8], [0.28, 0.26, T * 0.72], [0.25, 0.43, th * 1.5]],
      [[0.25, 0.44, th * 1.4], ...arc(0.49, 0.66, 0.36, 0.255, -58, 236, (a, u) => th * 1.3 + (T - th * 1.3) * Math.sin(Math.PI * u) ** 0.8, 22)],
      { ball: [0.18, 0.79, T * 0.95] },
    ];
    case 6: return [
      [...arc(0.6, 0.64, 0.46, 0.585, 352 + 30, 270, (a, u) => th + (T - th) * u ** 0.7, 20)],
      arc(0.5, 0.68, 0.335, 0.235, 270, 270 + 360, flank(th * 1.2, T * 0.95, 1.2), 32),
      { ball: [0.79, 0.11, T * 0.9] },
      thorn(0.17, 0.68, -0.17, 0),
    ];
    case 7: return [
      [[0.1, 0.22, th * 1.1], [0.11, 0.1, th * 1.6], [0.5, 0.08, th * 1.6], [0.9, 0.08, th * 1.8]],
      [[0.9, 0.08, th * 1.6], [0.8, 0.28, T * 0.78], [0.62, 0.55, T * 0.95], [0.49, 0.78, T * 0.95], [0.44, 0.93, T * 0.85]],
      { ball: [0.11, 0.22, T * 0.78] },
    ];
    case 8: return [
      arc(0.5, 0.265, 0.27, 0.195, 180, 540, flank(th * 1.1, T * 0.85, 1.2), 28),
      arc(0.5, 0.705, 0.345, 0.235, 0, 360, flank(th * 1.2, T, 1.2), 32),
      thorn(0.16, 0.705, -0.16, 0), thorn(0.84, 0.705, 0.16, 0),
    ];
    case 9: return [
      arc(0.5, 0.32, 0.335, 0.235, 90, 450, flank(th * 1.2, T * 0.95, 1.2), 32),
      [...arc(0.4, 0.36, 0.46, 0.585, 90, 200 + 2, (a, u) => T - (T - th) * u ** 0.8, 20)],
      { ball: [0.22, 0.89, T * 0.9] },
      thorn(0.83, 0.32, 0.17, 0),
    ];
  }
  return [];
}

function segDistU(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return [Math.sqrt(ex * ex + ey * ey), u];
}

/**
 * The digit `d` in a box w x h px (with `pad` px of room round it for the
 * keyline): { w, h, dist, order, path } where dist is a signed distance per
 * pixel (negative inside), order 0..1 along the pen path, and path the
 * skeleton as pixel points [x, y, s] with s the cumulative 0..1, for a quill
 * tip to follow.
 */
export function buildDigit(d, w, h, thick, thin, pad = 2) {
  const W = w + 2 * pad, H = h + 2 * pad;
  const strokes = skeleton(d, thin / thick);
  // to pixels: each stroke as segments with widths, and their path length
  const segs = [];
  let total = 0;
  const P = (n) => [pad + n[0] * w, pad + n[1] * h, n[2] * thick];
  for (const s of strokes) {
    if (s.ball) { const [x, y, r] = P(s.ball); segs.push({ ax: x, ay: y, bx: x, by: y, w0: r, w1: r, s0: total, s1: total + 0.5 }); total += 0.5; continue; }
    for (let k = 1; k < s.length; k++) {
      const [ax, ay, w0] = P(s[k - 1]), [bx, by, w1] = P(s[k]);
      const len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, w0, w1, s0: total, s1: total + len });
      total += len;
    }
  }
  const dist = new Float32Array(W * H), order = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let best = 1e9, ord = 0;
      for (const sg of segs) {
        const [e, u] = segDistU(x + 0.5, y + 0.5, sg.ax, sg.ay, sg.bx, sg.by);
        const v = e - (sg.w0 + (sg.w1 - sg.w0) * u) / 2;
        if (v < best) { best = v; ord = sg.s0 + (sg.s1 - sg.s0) * u; }
      }
      dist[y * W + x] = best;
      order[y * W + x] = ord / total;
    }
  const path = segs.map((sg) => [sg.bx, sg.by, sg.s1 / total]);
  path.unshift([segs[0].ax, segs[0].ay, 0]);
  return { w: W, h: H, pad, dist, order, path };
}

/** The point at fraction s along a digit's path. */
export function pathAt(path, s) {
  if (s <= 0) return path[0];
  for (let k = 1; k < path.length; k++) {
    if (path[k][2] >= s) {
      const a = path[k - 1], b = path[k], u = (s - a[2]) / (b[2] - a[2] || 1);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, s];
    }
  }
  return path[path.length - 1];
}
export { TAU };
