// Discoball digits: a 70s geometric italic (Avant Garde / Bauhaus feel) made
// of mirror-ball light spots strung along each stroke like marquee bulbs.
// Vertical strokes carry fatter spots than horizontal ones, which gives the
// thick-thin contrast of disco display type.
//
// Design units: x 0..10, y 0..16 (y down). Each path is a list of points,
// sampled from lines, arcs and quadratic curves.

const D2R = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1, n = 28) {
  // angles in degrees, 0 = right, 90 = down (screen), sweeping a0 -> a1
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + (a1 - a0) * (k / n)) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function quad(p0, p1, p2, n = 20) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
const line = (a, b) => [a, b];
const join = (...ps) => ps.reduce((acc, p) => acc.concat(acc.length ? p.slice(1) : p), []);

// paths: { pts, closed }
const P = (pts, closed = false) => ({ pts, closed });
export const GLYPHS = {
  0: [P(arc(5, 8, 4.9, 7.9, 0, 360, 48), true)],
  1: [P(line([6.2, 0], [6.2, 16])), P(quad([1.8, 4.2], [4.6, 2.6], [6.2, 0]))],
  2: [P(join(arc(5, 4.7, 4.6, 4.6, 185, 395, 30), quad([9.2, 6.6], [4, 11], [0.2, 16]), line([0.2, 16], [10, 16])))],
  3: [P(join(arc(5, 4.0, 4.1, 4.0, 200, 450, 30))), P(arc(4.8, 11.6, 4.9, 4.4, -90, 160, 34))],
  4: [P(line([7.6, 3.2], [7.6, 16])), P(line([5.6, 0], [0, 11.2])), P(line([0, 11.2], [10, 11.2]))],
  5: [P(join(line([9.6, 0], [1.6, 0]), line([1.6, 0], [1.0, 7.4]), quad([1.0, 7.4], [3.6, 6.0], [5.2, 6.1]), arc(5.2, 11.0, 4.8, 4.9, -90, 150, 30)))],
  6: [P(arc(5, 11.1, 4.9, 4.9, 0, 360, 40), true), P(quad([8.6, 0.4], [1.2, 3.0], [0.1, 10.6]))],
  7: [P(join(line([0, 0], [10, 0]), quad([10, 0], [5.5, 6.5], [4.0, 16])))],
  8: [P(arc(5, 3.9, 3.7, 3.9, 0, 360, 34), true), P(arc(5, 11.7, 4.7, 4.3, 0, 360, 40), true)],
  9: [P(arc(5, 4.9, 4.9, 4.9, 0, 360, 40), true), P(quad([9.9, 5.4], [8.8, 13.0], [1.4, 15.6]))],
};

/**
 * Spots for every digit, in px relative to the digit's centre, already
 * slanted. { x, y, r } with r the spot radius. Unit scale u px per design unit.
 */
export function buildSpots({ u = 1.25, ux = u, slant = 0.17, rmin = 0.82, rmax = 1.45, gap = 0.9, nib = -0.35 } = {}) {
  const out = {};
  for (let d = 0; d <= 9; d++) {
    const spots = [];
    for (const path of GLYPHS[d]) {
      // to px, centred, slanted
      const pts = path.pts.map(([x, y]) => {
        const px = (x - 5) * ux, py = (y - 8) * u;
        return [px - slant * py, py];
      });
      // arc length
      const L = [0];
      for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const total = L[L.length - 1];
      // spot size follows a broad nib: fat on the downstrokes, fine on the
      // hairlines; spots are spaced by their size, so fine strokes run dense
      const at = (s) => {
        let k = 1; while (k < pts.length - 1 && L[k] < s) k++;
        const a = pts[k - 1], b = pts[k], f = (s - L[k - 1]) / Math.max(1e-6, L[k] - L[k - 1]);
        const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const w = Math.abs(Math.sin(th - nib)) ** 1.4;
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, rmin + (rmax - rmin) * w];
      };
      const ss = [0];
      for (let g = 0; g < 400; g++) {
        const r0 = at(ss[ss.length - 1])[2], r1 = at(Math.min(total, ss[ss.length - 1] + 2 * r0 + gap))[2];
        const nx = ss[ss.length - 1] + r0 + r1 + gap;
        if (nx > total + (path.closed ? 0 : 0.5 * (r0 + r1 + gap))) break;
        ss.push(nx);
      }
      // stretch so the spacing closes the loop / lands on the stroke's end
      const last = path.closed ? ss[ss.length - 1] + (at(ss[ss.length - 1])[2] + at(0)[2] + gap) : ss[ss.length - 1];
      const k = last > 0 ? total / last : 1;
      for (const s0 of ss) {
        const [x, y, r] = at(Math.min(total, s0 * k));
        let dup = false;
        for (const q of spots) if (Math.hypot(q.x - x, q.y - y) < Math.max(q.r, r) + 0.3) { dup = true; q.r = Math.max(q.r, r); break; }
        if (!dup) spots.push({ x, y, r });
      }
    }
    out[d] = spots;
  }
  return out;
}
