// Waveguide numerals for 'unison': every digit is a run of tube, the way a
// microwave waveguide or a neon tube is bent: straight runs joined by bends
// of one fixed radius, square-shouldered, round-cornered, no curves that are
// not bends. Waves in step travel along a tube, so the crest bands of the
// face run down each stroke like signal down a guide; the bends are where
// the bands visibly swing round.
//
// Drawn on a 28 x 60 grid (the slot), centre-lines inset 3 px for a 5 px
// tube; built into the same command form as phased-glyphs.js (M, L, A in a
// unit box) so the shared penRaster can trace them.

const GW = 28, GH = 60, DEG = 180 / Math.PI;

/**
 * A polyline of corner points (grid px) as one tube: each interior corner
 * rounded with radius r (shrunk if the runs either side are too short).
 * `closed` joins the last point back to the first.
 */
function tube(points, r, closed = false) {
  const P = closed ? [...points] : points, n = P.length, cmds = [];
  const unit = (x, y) => [x / GW, y / GH];
  const corner = (j) => {
    const p = P[j], a = P[(j - 1 + n) % n], b = P[(j + 1) % n];
    let ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (th < 1e-3) return null;
    let rr = r, t = rr * Math.tan(th / 2);
    const tmax = 0.5 * Math.min(lu, lv) * (closed ? 1 : 0.98);
    if (t > tmax) { t = tmax; rr = t / Math.tan(th / 2); }
    const turnRight = ux * vy - uy * vx > 0;                       // y down: positive cross is clockwise
    const A = [p[0] - ux * t, p[1] - uy * t], B = [p[0] + vx * t, p[1] + vy * t];
    const nx = turnRight ? -uy : uy, ny = turnRight ? ux : -ux;   // toward the centre
    const C = [A[0] + nx * rr, A[1] + ny * rr];
    const clock = (q) => Math.atan2(q[0] - C[0], -(q[1] - C[1])) * DEG;
    const a0 = clock(A), a1 = a0 + (turnRight ? 1 : -1) * th * DEG;
    return { A, B, C, rr, a0, a1 };
  };
  const arc = (c) => ['A', c.C[0] / GW, c.C[1] / GH, c.rr / GW, c.rr / GH, c.a0, c.a1];
  if (closed) {
    const cs = P.map((_, j) => corner(j));
    cmds.push(['M', ...unit(...cs[0].B)]);
    for (let j = 1; j <= n; j++) { const c = cs[j % n]; cmds.push(['L', ...unit(...c.A)], arc(c)); }
  } else {
    cmds.push(['M', ...unit(...P[0])]);
    for (let j = 1; j < n - 1; j++) { const c = corner(j); if (!c) { cmds.push(['L', ...unit(...P[j])]); continue; } cmds.push(['L', ...unit(...c.A)], arc(c)); }
    cmds.push(['L', ...unit(...P[n - 1])]);
  }
  return cmds;
}

// left, right, top, middle, bottom of the centre-lines
const L = 3, R = 25, T = 3, MID = 28, B = 57;

export const WAVEGUIDE = {
  0: [tube([[L, T], [R, T], [R, B], [L, B]], 11, true)],
  1: [tube([[6, 13], [15, T], [15, B]], 4), tube([[7, B], [23, B]], 0)],
  2: [tube([[L, 13], [L, T], [R, T], [R, 27], [L, 41], [L, B], [R, B]], 9)],
  3: [tube([[L, T], [R, T], [R, B], [L, B]], 10), tube([[9, MID], [R, MID]], 0)],
  4: [tube([[19, T], [L, 39], [R, 39]], 1.5), tube([[19, T], [19, B]], 0)],
  5: [tube([[R, T], [L, T], [L, MID - 1], [R, MID - 1], [R, B], [L, B]], 9)],
  6: [tube([[R, T], [L, T], [L, B], [R, B], [R, MID], [L, MID]], 9)],
  7: [tube([[L, 11], [L, T], [R, T], [12, B]], 4)],
  8: [tube([[5, T], [23, T], [23, MID], [5, MID]], 8, true), tube([[L, MID], [R, MID], [R, B], [L, B]], 10, true)],
  9: [tube([[L, B], [R, B], [R, T], [L, T], [L, MID + 1], [R, MID + 1]], 9)],
};
