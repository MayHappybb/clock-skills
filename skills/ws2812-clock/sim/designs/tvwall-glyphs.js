// TV wall numerals: a 70s station-ident face. Each digit is a geometric
// skeleton (lines + arcs) drawn as a ribbon of three parallel stripes (a hot
// centre line and two orange flanks), with a black keyline and a faint glow.
// Rasterised once per digit and size into a small texture that the tubes
// sample: rgb (premultiplied), alpha (how much of the ground it covers) and
// t, the position along the ribbon (0..1) for write-on and running light.

const D2R = Math.PI / 180;
const arc = (cx, cy, rx, ry, a0, a1, n = 28) => {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * D2R; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
};
// skeletons in a box x 0..0.62, y 0..1 (y down); each is a list of polylines
const W0 = 0.62;
const SK = {
  0: [[...arc(0.31, 0.31, 0.31, 0.31, 180, 360), [0.62, 0.69], ...arc(0.31, 0.69, 0.31, 0.31, 0, 180), [0, 0.31]]],
  1: [[[0.12, 0.2], [0.38, 0], [0.38, 1]]],
  2: [[...arc(0.31, 0.3, 0.3, 0.3, 192, 382), [0, 1], [0.64, 1]]],
  3: [[...arc(0.3, 0.25, 0.28, 0.25, 205, 455, 24), ...arc(0.3, 0.73, 0.31, 0.27, 265, 510, 30)]],
  4: [[[0.47, 1], [0.47, 0], [0, 0.68], [0.64, 0.68]]],
  5: [[[0.6, 0], [0.07, 0], [0.04, 0.46], ...arc(0.31, 0.69, 0.31, 0.31, 232, 505)]],
  6: [[...arc(0.66, 0.69, 0.66, 0.66, 252, 180, 18), ...arc(0.31, 0.69, 0.31, 0.31, 180, 540, 40)]],
  7: [[[0, 0], [0.62, 0], [0.2, 1]]],
  8: [[...arc(0.31, 0.25, 0.25, 0.25, 90, 450, 36)], [...arc(0.31, 0.71, 0.3, 0.29, -90, 270, 40)]],
};
SK[9] = SK[6].map((pl) => pl.map(([x, y]) => [W0 - x, 1 - y]));

/** Segments with their arclength range, normalised to 0..1 over the digit. */
function segsOf(d) {
  const segs = []; let L = 0;
  for (const pl of SK[d]) for (let k = 0; k + 1 < pl.length; k++) {
    const [ax, ay] = pl[k], [bx, by] = pl[k + 1], l = Math.hypot(bx - ax, by - ay);
    if (l < 1e-6) continue;
    segs.push([ax, ay, bx, by, L, l]); L += l;
  }
  for (const s of segs) { s[4] /= L; s[5] /= L; }
  return segs;
}

export const HOT = [1.0, 0.78, 0.3], FLANK = [1.0, 0.3, 0.04], GLOW = [0.9, 0.22, 0.02];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const cache = new Map();
/**
 * Texture of digit d, w x h texels. The skeleton box is scaled sx by sy
 * texels (a tall slot can take a condensed digit) and the ribbon is hw
 * texels from its centre line to its edge. Returns { w, h, rgb, a, t, hot }.
 */
export function glyph(d, w, h, sx, sy, hw) {
  const key = `${d}|${w}|${h}|${sx}|${sy}|${hw}`;
  if (cache.has(key)) return cache.get(key);
  const n = w * h;
  const rgb = new Float32Array(3 * n), A = new Float32Array(n), T = new Float32Array(n);
  const ox = (w - W0 * sx) / 2, oy = (h - sy) / 2, key0 = 1.6, glow = hw * 1.3;
  const segs = segsOf(d).map(([ax, ay, bx, by, t0, tl]) => [ox + ax * sx, oy + ay * sy, ox + bx * sx, oy + by * sy, t0, tl]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5;
    let best = 1e9, bt = 0;
    for (const [ax, ay, bx, by, t0, tl] of segs) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let u = ((px - ax) * dx + (py - ay) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - ax - u * dx, ey = py - ay - u * dy, dd = ex * ex + ey * ey;
      if (dd < best) { best = dd; bt = t0 + u * tl; }
    }
    const dist = Math.sqrt(best);              // texels from the skeleton
    const q = dist / hw;                       // 0 at the centre line, 1 at the ribbon edge
    const aa = 0.6 / hw;                       // about one texel of soft edge, in q
    const hot = 1 - sm(0.2 - aa, 0.2 + aa, q);
    const flank = sm(0.4 - aa, 0.4 + aa, q) * (1 - sm(1 - aa, 1 + aa, q));
    const g = 0.08 * (1 - sm(hw, hw + glow, dist)) * sm(hw + key0, hw + key0 + 1.5, dist);
    const p = y * w + x;
    for (let c = 0; c < 3; c++) rgb[3 * p + c] = HOT[c] * hot + FLANK[c] * flank + GLOW[c] * g;
    A[p] = 1 - sm(hw + key0 - 0.6, hw + key0 + 0.6, dist);   // the ribbon and its black keyline cover the ground
    T[p] = bt;
  }
  const G = { w, h, rgb, a: A, t: T, hot: null };
  // which texels belong to the hot centre line (for the running light)
  G.hot = new Float32Array(n);
  for (let p = 0; p < n; p++) G.hot[p] = rgb[3 * p + 2] > 0.12 ? 1 : 0;
  cache.set(key, G);
  return G;
}
