// nightrain glyphs: each digit is a road on a far hillside, drawn as a
// route a surveyor might lay (a single path, or a loop, with rounded bends),
// on a 4 x 6 grid. The face lines every road with street lamps, so a digit
// is a dotted line of lights, the way a town looks from a train at night.
//
// lampsFor() spaces lamps evenly along the smoothed route at a given size and
// returns them relative to the digit box; routeFor() gives the smoothed
// polyline itself (for the cars that crawl along it). Both are cached: pure
// geometry, the same answer every time.

// Strokes per digit: [closed?, [[x, y], ...]] on the 4 x 6 grid.
const ROUTES = {
  0: [[true, [[2, 0], [3.6, 0.5], [4, 2], [4, 4], [3.6, 5.5], [2, 6], [0.4, 5.5], [0, 4], [0, 2], [0.4, 0.5]]]],
  1: [[false, [[0.6, 1.4], [2.2, 0], [2.2, 6]]], [false, [[0.8, 6], [3.6, 6]]]],
  2: [[false, [[0.1, 1.2], [1.2, 0.05], [2.9, 0.05], [3.9, 1.1], [3.8, 2.4], [0, 6], [4, 6]]]],
  3: [[false, [[0.2, 0.05], [3.8, 0.05], [1.6, 2.5], [2.9, 2.6], [3.95, 3.7], [3.8, 5.2], [2.4, 6], [1, 6], [0, 5.2]]]],
  4: [[false, [[3, 6], [3, 0], [0, 4.2], [4.1, 4.2]]]],
  5: [[false, [[3.9, 0.05], [0.5, 0.05], [0.2, 2.8], [2.6, 2.4], [3.9, 3.4], [3.95, 5], [2.8, 6], [1.2, 6], [0, 5.2]]]],
  6: [[false, [[3.4, 0], [1.6, 0.8], [0.2, 2.8], [0, 4.4], [0.6, 5.7], [2, 6], [3.4, 5.7], [4, 4.6], [3.6, 3.3], [2.2, 2.9], [0.9, 3.3], [0.1, 4.2]]]],
  7: [[false, [[0, 0.05], [4, 0.05], [2.8, 2.2], [1.6, 6]]]],
  8: [[true, [[2, 0], [3.4, 0.4], [3.7, 1.5], [3.1, 2.5], [2, 2.9], [0.9, 2.5], [0.3, 1.5], [0.6, 0.4]]],
      [true, [[2, 2.9], [3.5, 3.4], [4, 4.6], [3.5, 5.6], [2, 6], [0.5, 5.6], [0, 4.6], [0.5, 3.4]]]],
  9: [[false, [[0.6, 6], [2.4, 5.2], [3.8, 3.2], [4, 1.6], [3.4, 0.3], [2, 0], [0.6, 0.3], [0, 1.4], [0.4, 2.7], [1.8, 3.1], [3.1, 2.7], [3.9, 1.8]]]],
};

/** Chaikin corner cutting, keeping the ends of an open path. */
function chaikin(pts, closed, n) {
  for (let k = 0; k < n; k++) {
    const out = [];
    const m = pts.length;
    if (!closed) out.push(pts[0]);
    const last = closed ? m : m - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % m];
      const q = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25];
      const r = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75];
      if (closed || i > 0) out.push(q);
      if (closed || i < last - 1) out.push(r);
    }
    if (!closed) out.push(pts[m - 1]);
    pts = out;
  }
  return pts;
}

const routeCache = new Map();

/** Smoothed routes for digit d in a w x h box: [{ closed, pts: [[x, y]...], len }]. */
export function routeFor(d, w, h) {
  const key = `${d}|${w}|${h}`;
  let r = routeCache.get(key);
  if (r) return r;
  r = ROUTES[d].map(([closed, pts]) => {
    const sc = pts.map(([x, y]) => [(x / 4) * w, (y / 6) * h]);
    // Fewer cuts on the straight-ish digits keeps their corners readable.
    const sm = chaikin(sc, closed, 2);
    const ring = closed ? [...sm, sm[0]] : sm;
    let len = 0;
    const seg = [0];
    for (let i = 1; i < ring.length; i++) {
      const l = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
      seg.push(l);
      len += l;
    }
    return { closed, pts: ring, seg, len };
  });
  routeCache.set(key, r);
  return r;
}

/** The point at arc length s along a route (clamped; wraps for loops). */
export function along(route, s) {
  const { pts, seg, len, closed } = route;
  if (closed) s = ((s % len) + len) % len;
  else s = s < 0 ? 0 : s > len ? len : s;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = seg[i];
    if (s <= l || i === pts.length - 1) {
      const u = l ? Math.min(1, s / l) : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    s -= l;
  }
  return pts[pts.length - 1];
}

const lampCache = new Map();

/** Lamps every `sp` px along digit d's roads in a w x h box: [[x, y], ...]. */
export function lampsFor(d, w, h, sp) {
  const key = `${d}|${w}|${h}|${sp}`;
  let out = lampCache.get(key);
  if (out) return out;
  out = [];
  for (const r of routeFor(d, w, h)) {
    const n = Math.max(2, Math.round(r.len / sp));
    const steps = r.closed ? n : n + 1;
    for (let i = 0; i < steps; i++) {
      const p = along(r, (i / n) * r.len);
      // Two loops of an 8 share their waist: skip a near-duplicate lamp.
      if (out.some(([x, y]) => Math.abs(x - p[0]) < sp * 0.5 && Math.abs(y - p[1]) < sp * 0.5)) continue;
      out.push(p);
    }
  }
  lampCache.set(key, out);
  return out;
}
