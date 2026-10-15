// Microcity numerals: each digit is a piece of road network, drawn as an
// engineer would: straight avenues, radiused bends, ring roads for bowls,
// T-junctions, and cul-de-sac bulbs where a road ends in the blocks.
//
// Glyphs are designed on a 10 x 14 unit plan and placed into a slot box in
// pixels. buildGlyph() returns everything the face needs, cached:
//   strokes: [{ x, y (Float32Array, every STEP px of arc), L, closed }]
//   pix:     Int32Array grid cells within REACH of a centreline
//   d, s:    Float32Array distance to the centreline, arc length at the
//            nearest point;  k: Uint8Array stroke index
export const STEP = 0.5, REACH = 5.6, CAP = 1.0;

// stroke: [points, radii (one per point; ends ignored), closed, caps [start, end]]
const P = (pts, r, closed = false, caps = [true, true]) => ({ pts, r, closed, caps });
const GLYPHS = {
  0: [P([[0, 0], [10, 0], [10, 14], [0, 14]], [5, 5, 5, 5], true)],
  1: [P([[1.2, 3.6], [6, 0], [6, 14]], [0, 1.2, 0], false, [true, false]),
      P([[1.5, 14], [10.5, 14]], [0, 0])],
  2: [P([[0, 4.6], [0, 0], [10, 0], [10, 6], [0, 14], [10.5, 14]], [0, 4, 4.5, 3.2, 1.2, 0])],
  3: [P([[0.5, 0], [10, 0], [4.2, 6], [10, 6], [10, 14], [0, 14], [0, 10.6]], [0, 0.9, 0.7, 4, 4.4, 2.6, 0])],
  4: [P([[7.2, 14.4], [7.2, 0], [0, 10], [10.5, 10]], [0, 0.6, 0.9, 0])],
  5: [P([[10, 0], [0.3, 0], [0, 6.2], [10, 6.2], [10, 14], [0, 14], [0, 10.6]], [0, 0.6, 0.6, 4, 4.4, 2.6, 0])],
  6: [P([[0, 6], [10, 6], [10, 14], [0, 14]], [4.4, 4.4, 4.4, 4.4], true),
      P([[9.2, 0], [0, 6], [0, 10]], [0, 6.5, 0], false, [true, false])],
  7: [P([[0, 0], [10, 0], [3.4, 14.2]], [0, 0.6, 0])],
  8: [P([[1, 0], [9, 0], [9, 6.1], [1, 6.1]], [3.05, 3.05, 3.05, 3.05], true),
      P([[0, 7.1], [10, 7.1], [10, 14], [0, 14]], [3.45, 3.45, 3.45, 3.45], true)],
  9: [P([[0, 0], [10, 0], [10, 8], [0, 8]], [4.4, 4.4, 4.4, 4.4], true),
      P([[10, 4], [10, 8], [0.8, 14]], [0, 6.5, 0], false, [false, true])],
};

// roundabouts at the junctions (unit coordinates)
const NODES = { 1: [[6, 14]], 4: [[7.2, 10]], 6: [[0, 9.6]], 8: [[5, 6.6]], 9: [[10, 4.4]] };
export const RB_R = 4.6, RB_ISLE = 1.7;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);

/** Rounded polyline (quadratic fillets) in px, resampled every STEP px. */
function roadLine(pts, radii, closed) {
  const n = pts.length, raw = [];
  const corner = (i) => {
    const A = pts[(i - 1 + n) % n], Pt = pts[i], B = pts[(i + 1) % n];
    const ea = sub(Pt, A), eb = sub(B, Pt), la = len(ea), lb = len(eb);
    const ua = [ea[0] / la, ea[1] / la], ub = [eb[0] / lb, eb[1] / lb];
    const turn = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
    const endA = !closed && i - 1 === 0, endB = !closed && i + 1 === n - 1;
    let t = radii[i] * Math.tan(turn / 2);
    t = Math.min(t, la * (endA ? 0.95 : 0.5), lb * (endB ? 0.95 : 0.5));
    return [[Pt[0] - ua[0] * t, Pt[1] - ua[1] * t], Pt, [Pt[0] + ub[0] * t, Pt[1] + ub[1] * t]];
  };
  const quad = (a, c, b) => { for (let k = 0; k <= 16; k++) { const u = k / 16, v = 1 - u; raw.push([v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]); } };
  if (closed) {
    for (let i = 0; i < n; i++) { const [a, c, b] = corner(i); quad(a, c, b); }
    raw.push(raw[0]);
  } else {
    raw.push(pts[0]);
    for (let i = 1; i < n - 1; i++) { const [a, c, b] = corner(i); quad(a, c, b); }
    raw.push(pts[n - 1]);
  }
  // resample by arc length
  const xs = [raw[0][0]], ys = [raw[0][1]];
  let acc = 0, next = STEP;
  for (let i = 1; i < raw.length; i++) {
    const [ax, ay] = raw[i - 1], [bx, by] = raw[i], sl = Math.hypot(bx - ax, by - ay);
    while (sl > 0 && acc + sl >= next) {
      const u = (next - acc) / sl;
      xs.push(ax + (bx - ax) * u); ys.push(ay + (by - ay) * u);
      next += STEP;
    }
    acc += sl;
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), L: (xs.length - 1) * STEP, closed };
}

const base = new Map(), cache = new Map();
/** The digit drawn at the origin, in its own w x h box (heavy: once per digit and size). */
function buildBase(ch, w, h, inset) {
  const key = `${ch}|${w}|${h}|${inset}`;
  if (base.has(key)) return base.get(key);
  const sx = (w - 2 * inset) / 10, sy = (h - 2 * inset) / 14, sr = (sx + sy) / 2;
  const strokes = GLYPHS[ch].map((st) => {
    const pts = st.pts.map(([u, v]) => [inset + u * sx, inset + v * sy]);
    const line = roadLine(pts, st.r.map((r) => r * sr), st.closed);
    line.caps = st.caps;
    return line;
  });
  const nodes = (NODES[ch] || []).map(([u, v]) => [inset + u * sx, inset + v * sy]);
  const GX = [], GY = [], D = [], S = [], K = [], ISL = [];
  for (let gy = -5; gy <= h + 5; gy++) for (let gx = -5; gx <= w + 5; gx++) {
    let best = 1e9, bs = 0, bk = 0;
    for (let k = 0; k < strokes.length; k++) {
      const { x, y, caps, closed } = strokes[k], n = x.length;
      for (let i = 0; i + 1 < n; i++) {
        const ax = x[i], ay = y[i], dx = x[i + 1] - ax, dy = y[i + 1] - ay;
        const qx = gx - ax, qy = gy - ay;
        if (qx * qx + qy * qy > 49) continue;
        let u = (qx * dx + qy * dy) / (dx * dx + dy * dy); u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = qx - u * dx, ey = qy - u * dy;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < best) { best = d; bs = (i + u) * STEP; bk = k; }
      }
      if (!closed) for (const [ci, on] of [[0, caps[0]], [n - 1, caps[1]]]) {
        if (!on) continue;
        const d = Math.hypot(gx - x[ci], gy - y[ci]) - CAP;
        if (d < best) { best = d; bs = ci * STEP; bk = k; }
      }
    }
    let isl = 0;
    for (const [nx, ny] of nodes) {
      const r = Math.hypot(gx - nx, gy - ny), d = r - (RB_R - 2.4);
      if (d < best) best = d;
      if (r < RB_ISLE + 0.6) isl = Math.max(isl, Math.min(1, (RB_ISLE + 0.6 - r) / 1.0));
    }
    if (best < REACH) { GX.push(gx); GY.push(gy); D.push(best); S.push(bs); K.push(bk); ISL.push(isl); }
  }
  const b0 = { strokes, nodes, gx: Int16Array.from(GX), gy: Int16Array.from(GY), d: Float32Array.from(D), s: Float32Array.from(S), k: Uint8Array.from(K), isl: Float32Array.from(ISL) };
  base.set(key, b0);
  return b0;
}

/** Digit ch in the slot box (x0, y0, w, h) px (integers), on a GW x GH grid. */
export function buildGlyph(ch, x0, y0, w, h, GW, GH, inset = 3) {
  const key = `${ch}|${x0}|${y0}|${w}|${h}`;
  if (cache.has(key)) return cache.get(key);
  const b = buildBase(ch, w, h, inset);
  const keep = [];
  for (let j = 0; j < b.gx.length; j++) {
    const X = b.gx[j] + x0, Y = b.gy[j] + y0;
    if (X >= 0 && Y >= 0 && X < GW && Y < GH) keep.push(j);
  }
  const pix = new Int32Array(keep.length), d = new Float32Array(keep.length), s = new Float32Array(keep.length), k = new Uint8Array(keep.length), isl = new Float32Array(keep.length);
  keep.forEach((j, m) => { pix[m] = (b.gy[j] + y0) * GW + b.gx[j] + x0; d[m] = b.d[j]; s[m] = b.s[j]; k[m] = b.k[j]; isl[m] = b.isl[j]; });
  const strokes = b.strokes.map((st) => ({ x: st.x.map((v) => v + x0), y: st.y.map((v) => v + y0), L: st.L, closed: st.closed, caps: st.caps }));
  const g = { ch, strokes, pix, d, s, k, isl, nodes: b.nodes.map(([x, y]) => [x + x0, y + y0]) };
  cache.set(key, g);
  return g;
}

/** Point and unit tangent at arc length s on a stroke. */
export function along(st, s, out) {
  const n = st.x.length;
  if (st.closed) { s %= st.L; if (s < 0) s += st.L; } else s = s < 0 ? 0 : s > st.L ? st.L : s;
  let f = s / STEP, i = Math.floor(f);
  if (i >= n - 1) { i = n - 2; f = n - 1; }
  const u = f - i, ax = st.x[i], ay = st.y[i], bx = st.x[i + 1], by = st.y[i + 1];
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
  out[0] = ax + dx * u; out[1] = ay + dy * u; out[2] = dx / l; out[3] = dy / l;
  return out;
}
