// Chahut glyphs: the ten numerals as the dancers' petticoats. A Belle Epoque
// fat face drawn for a 26 x 36 slot: round 6.5 px strokes, big open counters,
// ball terminals like pompoms (the dancers' rosettes). Built once at load as
// signed distance fields (Int8, quarter pixels) so the frills can push the
// edge in and out per frame without redrawing the shape. Every counter is at
// least 7 x 7 px of ground before the frills.
//
// Flash: 10 x 34 x 44 bytes = 15 KB.

export const GW = 26, GH = 36;          // the glyph's own box
export const GM = 4;                    // margin round it in the field (halo and frills)
export const FW = GW + 2 * GM, FH = GH + 2 * GM;
const R = 3.0;                         // stroke half-width

const rad = (d) => (d * Math.PI) / 180;
/** Points along an ellipse arc, degrees, y down (0 right, 90 down, 270 up). */
function arc(cx, cy, rx, ry, a0, a1, n = 28) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const a = rad(a0 + ((a1 - a0) * k) / n);
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const P = (pts, r = R) => ({ pts, r });
const ball = (x, y, r = 4.3) => ({ pts: [[x, y]], r });

// Each digit: polylines (stroked with round caps) and balls.
const SHAPES = {
  0: [P(arc(13, 18, 9.6, 14.6, 0, 360, 40))],
  1: [P([[15.5, 3.4], [15.5, 32.6]]), P([[15.5, 3.4], [7.5, 9.5]]), P([[8, 32.6], [23, 32.6]], 3)],
  2: [P([...arc(13, 11.6, 8.7, 8.2, 205, 385), [4.4, 32.6]]), P([[4.4, 32.6], [22.4, 32.6]]), ball(5.4, 8.6)],
  3: [P(arc(12.8, 10.4, 8.4, 7.0, 210, 450)), P(arc(12.8, 25.1, 9.4, 7.5, 270, 515)), P([[8.6, 17.4], [12.8, 17.4]]), ball(5.4, 7.0), ball(4.6, 28.2)],
  4: [P([[7.2, 3.4], [4.0, 21.6]]), P([[4.0, 21.6], [23.2, 21.6]]), P([[18.2, 3.4], [18.2, 32.6]]), P([[13, 32.6], [23, 32.6]], 3)],
  5: [P([[8.0, 3.4], [22.4, 3.4]]), P([[7.6, 3.4], [6.8, 14.6]]), P(arc(12.6, 22.4, 9.4, 10.0, 233, 515)), ball(4.4, 27.0), ball(22.2, 3.6, 3.6)],
  6: [P(arc(13, 23.6, 9.5, 8.9, 0, 360, 36)), P(arc(16.6, 22.4, 13.0, 19.0, 180, 292, 24)), ball(21.6, 5.4)],
  7: [P([[3.6, 3.4], [22.6, 3.4]]), P([[22.6, 3.4], [17.4, 14.6], [13.8, 24.0], [12.4, 32.6]]), P([[3.6, 3.4], [3.6, 6.5]])],
  8: [P(arc(13, 10.6, 8.2, 7.4, 0, 360, 32)), P(arc(13, 25.3, 9.6, 7.5, 0, 360, 36))],
  9: [P(arc(13, 12.4, 9.5, 8.9, 0, 360, 36)), P(arc(9.4, 13.6, 13.0, 19.0, 0, 112, 24)), ball(4.4, 30.6)],
};

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - dx * t, ey = py - ay - dy * t;
  return Math.sqrt(ex * ex + ey * ey);
}

/** SDF[d]: Int8 field, FW x FH, value = signed distance * 4 (negative inside). */
export const SDF = [];
/** Per digit: where the head sits (top) and the hips (bottom), glyph x. */
export const HEAD_X = [13, 15.5, 12, 12.6, 18.2, 15, 18, 13, 13, 13];
export const HIP_X = [13, 15.5, 13, 13, 18.2, 13, 13, 12.6, 13, 10.5];
/** Top ink row under the head anchor (the neck lands there). */
export const TOP_Y = [];

for (let d = 0; d < 10; d++) {
  const f = new Int8Array(FW * FH);
  const prims = SHAPES[d];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const px = x - GM + 0.5, py = y - GM + 0.5;
    let best = 1e9;
    for (const { pts, r } of prims) {
      if (pts.length === 1) { const v = Math.hypot(px - pts[0][0], py - pts[0][1]) - r; if (v < best) best = v; continue; }
      for (let k = 0; k + 1 < pts.length; k++) {
        const v = segDist(px, py, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) - r;
        if (v < best) best = v;
      }
    }
    f[y * FW + x] = Math.max(-127, Math.min(127, Math.round(best * 4)));
  }
  SDF.push(f);
  // the first inked row at the head anchor column
  const hx = Math.round(HEAD_X[d]) + GM;
  let ty = 0;
  for (let y = 0; y < FH; y++) if (f[y * FW + hx] < 0) { ty = y - GM; break; }
  TOP_Y.push(ty);
}
