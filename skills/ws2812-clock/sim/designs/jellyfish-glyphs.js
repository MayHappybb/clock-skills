// Jellyfish numerals. Each digit is ONE animal in a 10 x 20 unit cell
// (x right, y down): its bell is the digit's crown and its oral arms trail
// down into the rest of the stroke. 6 is a 9 turned upside down: Cassiopea,
// the upside-down jellyfish.
//
// bell: { cx, cy, rx, ry, m, closed, rot }  dome of half-axes rx, ry above
//   (cx, cy); margin bulging m below it (drawn bright only when closed, so a
//   0's counter stays open). rot turns the bell (radians, screen sense).
// arms: Catmull-Rom control points, root first (the root rides the bell).

const G = {
  0: { bell: { cx: 5, cy: 6.6, rx: 4.4, ry: 6.0, m: 1.0, closed: false },
    arms: [[[0.65, 6.7], [0.5, 10.6], [1.0, 15.0], [2.7, 18.5], [5.0, 19.5]],
      [[9.35, 6.7], [9.5, 10.6], [9.0, 15.0], [7.3, 18.5], [5.0, 19.5]]] },
  1: { bell: { cx: 5.9, cy: 4.6, rx: 1.5, ry: 4.2, m: 0.6, closed: false, rot: -0.12 },
    arms: [[[6.5, 4.8], [6.6, 9.0], [6.4, 14.2], [6.6, 19.6]],
      [[4.5, 4.6], [3.3, 6.0], [1.9, 7.3]]] },
  2: { bell: { cx: 5, cy: 6.2, rx: 4.3, ry: 5.6, m: 1.0, closed: false },
    arms: [[[9.3, 6.4], [9.0, 9.6], [7.0, 12.8], [3.8, 15.8], [1.0, 19.0], [2.4, 19.3], [6.0, 19.3], [9.7, 19.1]]] },
  3: { bell: { cx: 5, cy: 5.6, rx: 4.2, ry: 5.0, m: 0.9, closed: false },
    arms: [[[9.2, 5.8], [8.7, 8.3], [6.8, 9.7], [4.4, 10.1], [6.9, 10.6], [9.0, 12.3], [9.6, 15.3], [8.4, 18.4], [5.2, 19.6], [2.0, 19.0], [0.5, 17.4]]] },
  4: { bell: { cx: 6.7, cy: 3.4, rx: 2.7, ry: 3.0, m: 0.6, closed: false },
    arms: [[[7.0, 3.6], [7.1, 9.0], [7.0, 14.5], [7.1, 19.6]],
      [[4.1, 3.7], [2.8, 7.4], [1.3, 11.0], [0.5, 13.9], [3.5, 14.0], [7.0, 14.0], [9.8, 13.8]]] },
  5: { bell: { cx: 2.9, cy: 3.3, rx: 2.4, ry: 2.8, m: 0.6, closed: false },
    arms: [[[5.2, 3.2], [7.2, 2.2], [9.7, 1.6]],
      [[0.6, 3.5], [0.7, 6.5], [0.9, 9.8], [4.0, 8.7], [7.4, 9.4], [9.4, 12.2], [9.4, 15.6], [7.6, 18.6], [4.6, 19.6], [1.8, 19.0], [0.5, 17.6]]] },
  7: { bell: { cx: 5, cy: 3.4, rx: 4.7, ry: 2.8, m: 0.5, closed: false },
    arms: [[[9.6, 3.5], [8.4, 7.0], [6.8, 11.0], [5.4, 15.2], [4.6, 19.6]]] },
  8: { bell: { cx: 5, cy: 5.2, rx: 4.0, ry: 4.7, m: 2.4, closed: true },
    arms: [[[1.4, 6.3], [3.4, 8.4], [7.2, 10.4], [9.4, 13.2], [9.2, 16.6], [7.2, 19.2], [5.0, 19.7]],
      [[8.6, 6.3], [6.6, 8.4], [2.8, 10.4], [0.6, 13.2], [0.8, 16.6], [2.8, 19.2], [5.0, 19.7]]] },
  9: { bell: { cx: 5, cy: 6.6, rx: 4.4, ry: 6.0, m: 2.6, closed: true },
    arms: [[[9.4, 7.0], [9.4, 11.0], [8.6, 15.4], [6.4, 18.8], [3.4, 19.5], [1.0, 18.2]]] },
};
// 6: the 9 turned over (Cassiopea lives upside down)
{
  const n = G[9], b = n.bell;
  G[6] = { bell: { ...b, cx: 10 - b.cx, cy: 20 - b.cy, rot: Math.PI }, arms: n.arms.map((a) => a.map(([x, y]) => [10 - x, 20 - y])) };
}

/** Catmull-Rom through pts, `per` samples a span: Float64Array [x, y, s, ...] (s = arc length, units). */
function spline(pts, per = 10) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], out = [];
  let s = 0, px = pts[0][0], py = pts[0][1];
  for (let k = 1; k + 2 < P.length; k++) {
    const [p0, p1, p2, p3] = [P[k - 1], P[k], P[k + 1], P[k + 2]];
    for (let j = k === 1 ? 0 : 1; j <= per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const x = f(p0[0], p1[0], p2[0], p3[0]), y = f(p0[1], p1[1], p2[1], p3[1]);
      s += Math.hypot(x - px, y - py); px = x; py = y;
      out.push(x, y, s);
    }
  }
  return Float64Array.from(out);
}

/** The ten glyphs, arms pre-sampled. */
export const GLYPHS = Object.fromEntries(Object.entries(G).map(([d, g]) => [d, {
  bell: { rot: 0, ...g.bell },
  arms: g.arms.map((a) => { const sp = spline(a); return { pts: sp, len: sp[sp.length - 1] }; }),
}]));
