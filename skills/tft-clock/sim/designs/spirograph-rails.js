// Spirograph rails: the ten numerals as RAILS, the centre lines a toothed
// wheel rolls along. Each digit is one or two strokes of lines and arcs in a
// 20 x 50 box (y down); the wheel's pen loops either side of the rail, so the
// drawn digit is a band about 2 d wider than the rail. Counters are sized for
// that band: every bowl keeps at least 6 px of open paper inside it.
//
// Arcs: ['A', cx, cy, r, a0, a1] in degrees, screen sense (x = cx + r cos a,
// y = cy + r sin a, so increasing a runs clockwise on the glass).
// Lines: ['L', x0, y0, x1, y1]. A stroke is a list of segments run in order.

const SK = {
  0: [[['L', 0, 11, 0, 39], ['A', 10, 39, 10, 180, 0], ['L', 20, 39, 20, 11], ['A', 10, 11, 10, 0, -180]]],
  1: [[['L', 2.5, 11, 12.5, 0.5], ['L', 12.5, 0.5, 12.5, 50]]],
  2: [[['A', 10, 10.5, 10, 190, 360 + 28], ['L', 18.83, 15.2, 0.5, 49.5], ['L', 0.5, 49.5, 20.5, 49.5]]],
  3: [
    [['A', 9.5, 10.5, 9.8, 200, 360 + 95]],
    [['A', 8.5, 37.5, 12, -105, 140]],
  ],
  4: [
    [['L', 13, 0.5, 0, 34], ['L', 0, 34, 21, 34]],
    [['L', 15.5, 17, 15.5, 50]],
  ],
  5: [[['L', 19.5, 0.5, 2.5, 0.5], ['L', 2.5, 0.5, 2.1, 27.3], ['A', 8.5, 37.5, 12, -122, 138]]],
  6: [[['A', 51, 39, 51, 228.2, 180], ['A', 10, 39, 10, 180, 180 - 360]]],
  7: [[['L', 0, 0.5, 20.5, 0.5], ['L', 20.5, 0.5, 6.5, 50]]],
  8: [
    [['A', 10, 10.5, 9.2, 90, 90 + 360]],
    [['A', 10, 38.2, 11, -90, 270]],
  ],
};
// 9 is the 6 turned half round about the box centre
SK[9] = SK[6].map((st) => st.map((s) => (s[0] === 'L'
  ? ['L', 20 - s[1], 50 - s[2], 20 - s[3], 50 - s[4]]
  : ['A', 20 - s[1], 50 - s[2], s[3], s[4] + 180, s[5] + 180])));

const RAD = Math.PI / 180;

/** Flatten a stroke into a dense polyline (step ~0.2 box units). */
function flatten(stroke) {
  const pts = [];
  for (const s of stroke) {
    if (s[0] === 'L') {
      const [, x0, y0, x1, y1] = s, n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
      for (let i = pts.length ? 1 : 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
    } else {
      const [, cx, cy, r, a0, a1] = s, n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * RAD * r) / 0.2));
      for (let i = pts.length ? 1 : 0; i <= n; i++) {
        const a = (a0 + ((a1 - a0) * i) / n) * RAD;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
  }
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

/**
 * One rail, sampled at a uniform arc length (~`ds` glass px) after the
 * slot's transform: centre x/y and the rail's tangent angle, unwrapped and
 * smoothed over +-`win` px so the pen frame turns round corners instead of
 * jumping (the rail itself keeps its corner).
 */
function sampleRail(stroke, xf, ds, win) {
  const raw = flatten(stroke).map(([x, y]) => xf(x, y));
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.round(L / ds) + 1);
  const X = new Float32Array(n), Y = new Float32Array(n), A = new Float32Array(n);
  let k = 0;
  const at = (s) => {
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const u = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    return [raw[k][0] + (raw[k + 1][0] - raw[k][0]) * u, raw[k][1] + (raw[k + 1][1] - raw[k][1]) * u];
  };
  const step = L / (n - 1);
  for (let i = 0; i < n; i++) { const [x, y] = at(i * step); X[i] = x; Y[i] = y; }
  const closed = Math.hypot(X[0] - X[n - 1], Y[0] - Y[n - 1]) < 0.5;
  const w = Math.max(1, Math.round(win / step));
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let a = i - w, b = i + w, ax, ay, bx, by;
    if (closed) { a = (a + n - 1) % (n - 1); b = b % (n - 1); }
    else { a = Math.max(0, a); b = Math.min(n - 1, b); }
    ax = X[a]; ay = Y[a]; bx = X[b]; by = Y[b];
    let ang = Math.atan2(by - ay, bx - ax);
    if (i) { while (ang - prev > Math.PI) ang -= 2 * Math.PI; while (ang - prev < -Math.PI) ang += 2 * Math.PI; }
    A[i] = ang; prev = ang;
  }
  return { X, Y, A, n, L, step, closed };
}

/**
 * A digit placed in a slot: its rails sampled on the glass. `slot` gives the
 * box centre (cx, cy), the scale (sx, sy: glass px per box unit) and a tilt
 * in degrees (the rail is pinned by hand, not quite square).
 */
export function placeDigit(d, slot, ds = 0.1) {
  const { cx, cy, sx, sy, tilt } = slot;
  const c = Math.cos(tilt * RAD), s = Math.sin(tilt * RAD);
  const xf = (x, y) => {
    const u = (x - 10) * sx, v = (y - 25) * sy;
    return [cx + u * c - v * s, cy + u * s + v * c];
  };
  return SK[d].map((st) => sampleRail(st, xf, ds, 1.6));
}

export const DIGITS = SK;
