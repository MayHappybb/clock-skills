// Dollhouse crayon numerals: each digit is the path a child's hand takes
// with a wax crayon, in a unit box (x right, y down). Arcs are in degrees,
// 0 = right, 90 = down; increasing angle runs clockwise on screen.
//
// glyph(d, w, h, r, seed) rasterises one hand-drawn instance: per pixel the
// crayon coverage, the dark moat round the stroke, and the arc fraction at
// which the hand passes it (so a digit can be scribbled in stroke order).
// Every instance wobbles a little differently (seeded), as handwriting does.

const arc = (cx, cy, rx, ry, a0, a1, step = 9) => {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
};

// Each digit: a list of pen-down strokes, drawn in order.
const PATHS = {
  0: [arc(0.5, 0.5, 0.43, 0.5, -78, -78 - 382)],
  1: [[[0.16, 0.26], [0.42, 0.1], [0.6, 0.0], [0.6, 0.5], [0.6, 1.0]], [[0.24, 1.0], [0.6, 0.99], [0.94, 1.0]]],
  2: [[...arc(0.5, 0.3, 0.41, 0.3, 196, 372), [0.66, 0.62], [0.36, 0.83], [0.06, 1.0], [0.5, 0.99], [0.97, 0.97]]],
  3: [[...arc(0.47, 0.26, 0.38, 0.26, 205, 448), ...arc(0.47, 0.74, 0.45, 0.26, 268, 515)]],
  4: [[[0.7, 0.0], [0.38, 0.33], [0.04, 0.68], [0.5, 0.68], [0.98, 0.68]], [[0.7, 0.02], [0.7, 0.5], [0.7, 1.0]]],
  5: [[[0.9, 0.02], [0.56, 0.02], [0.24, 0.02], [0.2, 0.44], ...arc(0.5, 0.68, 0.42, 0.31, 232, 502)]],
  6: [[...arc(0.66, 0.72, 0.54, 0.7, 252, 180), ...arc(0.51, 0.71, 0.39, 0.29, 180, -186)]],
  7: [[[0.03, 0.03], [0.5, 0.02], [0.97, 0.03], [0.74, 0.32], [0.56, 0.62], [0.44, 1.0]]],
  8: [[...arc(0.5, 0.25, 0.33, 0.24, 90, -270), ...arc(0.5, 0.73, 0.4, 0.27, 270, -90)]],
  9: [[...arc(0.49, 0.29, 0.38, 0.29, 4, -360), [0.86, 0.6], [0.8, 1.0]]],
};

/** Deterministic hash to [0, 1). */
function h01(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map();
/**
 * One hand-drawn digit d, `w` x `h` px, stroke radius r, jittered by seed and
 * `wild` (0 tidy .. 1 toddler). Returns
 *   { gx, gy, gw, gh, cov, moat, s, len, pts, cum }
 * gx/gy: top-left of the raster box relative to the slot's top-left.
 * cov/moat/s: per pixel. pts/cum: the path in slot px with cumulative length.
 */
export function glyph(d, w, h, r, seed, wild) {
  const key = `${d}|${w}|${h}|${r}|${seed}|${wild}`;
  let g = cache.get(key);
  if (g) return g;
  if (cache.size > 200) cache.clear();
  // the hand: a small tilt, a little extra slant, wobble along the line
  const tilt = (h01(seed, d, 1) - 0.5) * 0.12 * wild, slant = 0.04 + (h01(seed, d, 2) - 0.5) * 0.08 * wild;
  const sx = 1 + (h01(seed, d, 3) - 0.5) * 0.08 * wild, ph = h01(seed, d, 4) * 6.28;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const pts = [], cum = [], brk = [];   // brk[k]: segment k-1..k is pen-up
  let L = 0;
  for (const stroke of PATHS[d]) {
    stroke.forEach(([ux, uy], k) => {
      let x = (ux - 0.5) * w * sx, y = (uy - 0.5) * h;
      x += (0.5 - uy) * h * slant;
      const wob = wild * 0.45 * Math.sin(ph + (ux * 7.3 + uy * 5.1));
      x += wob; y += wob * 0.6;
      const X = x * ct - y * st + w / 2, Y = x * st + y * ct + h / 2;
      if (pts.length && k > 0) L += Math.hypot(X - pts[pts.length - 1][0], Y - pts[pts.length - 1][1]);
      else if (pts.length) L += 4;      // a pen lift costs a little time
      pts.push([X, Y]); cum.push(L); brk.push(k === 0);
    });
  }
  const pad = Math.ceil(r + 4);
  const gx = -pad, gy = -pad, gw = w + 2 * pad, gh = h + 2 * pad;
  const cov = new Float32Array(gw * gh), moat = new Float32Array(gw * gh), s = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    const py = gy + j;
    for (let i = 0; i < gw; i++) {
      const px = gx + i;
      let best = 1e9, bs = 0;
      for (let k = 1; k < pts.length; k++) {
        if (brk[k]) continue;
        const ax = pts[k - 1][0], ay = pts[k - 1][1], dx = pts[k][0] - ax, dy = pts[k][1] - ay;
        const L2 = dx * dx + dy * dy;
        let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - ax - t * dx, ey = py - ay - t * dy, dd = ex * ex + ey * ey;
        if (dd < best) { best = dd; bs = cum[k - 1] + t * (cum[k] - cum[k - 1]); }
      }
      const dist = Math.sqrt(best), p = j * gw + i;
      // crayon pressure: the stroke swells and thins a little along its length
      const rr = r * (0.9 + 0.18 * Math.sin(bs * 0.31 + ph));
      const c = rr + 0.5 - dist;
      cov[p] = c <= 0 ? 0 : c >= 1 ? 1 : c;
      const m = r + 2.6 - dist;
      moat[p] = m <= 0 ? 0 : m >= 1 ? 1 : m;
      s[p] = bs;
    }
  }
  g = { gx, gy, gw, gh, cov, moat, s, len: L, pts, cum };
  cache.set(key, g);
  return g;
}

/** Where the crayon tip is when a fraction f of the path is drawn (slot px). */
export function tipAt(g, f) {
  const want = f * g.len, { pts, cum } = g;
  for (let k = 1; k < pts.length; k++) {
    if (cum[k] >= want) {
      const span = cum[k] - cum[k - 1] || 1, t = (want - cum[k - 1]) / span;
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
    }
  }
  return pts[pts.length - 1];
}
