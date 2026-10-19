// Escalator numerals: ten tall, ball-terminal poster numerals drawn as
// centre-line strokes for an 18 x 34 px body, turned into signed distance
// fields (4 samples per pixel) so a rider can be drawn at any sub-pixel
// position, leaning, with a dark moat round it.
//
// Each glyph also says where its legs go (hip: x of the lowest ink) and
// where its one eye sits (on the stroke, upper left: they run up-left).

export const GW = 18, GH = 34, M = 4, R = 4, SW = 4.6;
export const FW = (GW + 2 * M) * R, FH = (GH + 2 * M) * R;

function arc(cx, cy, rx, ry, a0, a1, n = 28) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
function bez(p0, p1, p2, p3, n = 18) {
  const p = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    p.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return p;
}
const line = (...pts) => pts;

const BALL = 2.9;
const DEF = {
  0: { paths: [arc(9, 17, 6.6, 14.6, 0, 360, 44)], balls: [], hip: 9, eye: [3.7, 8.4] },
  1: { paths: [line([10.6, 2.6], [10.6, 31.6]), line([10.6, 2.6], [5.2, 7.4])], balls: [[4.9, 7.7, 2.6]], hip: 10.6, eye: [10.6, 8.6] },
  2: {
    paths: [arc(9, 9.6, 6.5, 7.0, 196, 382), bez([15.1, 12.2], [12.5, 19], [5, 24], [2.6, 31.6]), line([2.6, 31.6], [15.6, 31.6])],
    balls: [[2.9, 7.6, BALL]], hip: 9, eye: [5.6, 4.0],
  },
  3: {
    paths: [arc(8.6, 9.0, 6.2, 6.5, 200, 450), line([8.6, 15.5], [6.4, 15.5]), arc(8.6, 23.6, 6.9, 8.0, 270, 512)],
    balls: [[2.9, 6.9, BALL], [3.0, 28.4, BALL]], hip: 9, eye: [5.6, 3.6],
  },
  4: {
    paths: [line([12.2, 2.6], [12.2, 31.6]), line([12.2, 2.6], [2.6, 22.2], [16.2, 22.2])],
    balls: [], hip: 12.2, eye: [9.9, 7.2],
  },
  5: {
    paths: [line([15.4, 2.6], [4.2, 2.6], [3.4, 14.6]), arc(8.4, 22.2, 7.0, 9.4, 232, 500)],
    balls: [[15.4, 2.6, 2.6], [3.1, 28.2, BALL]], hip: 9, eye: [7.4, 2.6],
  },
  6: {
    paths: [bez([14.6, 5.4], [11.6, 1.2], [2.6, 2.6], [2.6, 22.6]), arc(9, 22.6, 6.4, 9.0, 0, 360, 40)],
    balls: [[14.4, 5.0, BALL]], hip: 9, eye: [4.0, 9.0],
  },
  7: {
    paths: [line([2.6, 2.6], [15.6, 2.6]), bez([15.6, 2.6], [12.6, 10], [8.0, 19], [7.6, 31.6])],
    balls: [], hip: 7.8, eye: [6.0, 2.6],
  },
  8: {
    paths: [arc(9, 9.0, 5.6, 6.4, 0, 360, 36), arc(9, 23.5, 6.6, 8.1, 0, 360, 40)],
    balls: [], hip: 9, eye: [4.5, 5.4],
  },
  9: {
    paths: [arc(9, 11.2, 6.5, 8.6, 0, 360, 40), bez([15.5, 11.2], [15.6, 24], [12.4, 31.6], [4.4, 30.8])],
    balls: [[3.6, 30.4, BALL]], hip: 10.5, eye: [3.8, 6.0],
  },
};

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** GLYPHS[d] = { sdf: Float32Array(FW * FH) in px, hip, eye: [x, y] } */
export const GLYPHS = [];
for (let d = 0; d < 10; d++) {
  const g = DEF[d], segs = [];
  for (const p of g.paths) for (let k = 0; k + 1 < p.length; k++) segs.push([p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]]);
  const sdf = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) {
    const gy = (j + 0.5) / R - M;
    for (let i = 0; i < FW; i++) {
      const gx = (i + 0.5) / R - M;
      let m = 1e9;
      for (const s of segs) { const v = segD(gx, gy, s[0], s[1], s[2], s[3]) - SW / 2; if (v < m) m = v; }
      for (const b of g.balls) { const v = Math.hypot(gx - b[0], gy - b[1]) - b[2]; if (v < m) m = v; }
      sdf[j * FW + i] = m;
    }
  }
  GLYPHS.push({ sdf, hip: g.hip, eye: g.eye });
}
