// Khokhloma numerals for the matryoshka aprons: gold brush strokes (thick
// where the brush presses, tapering to hairlines), every free end finished
// with a red rowan berry, as on a Khokhloma bowl. Each digit is designed in a
// 10 x 16 box (y down) and baked once into coverage masks at 8, 4, 2 and 1
// samples per unit, so the apron can sample it bilinearly at any size
// without aliasing (pick the level with about 1-2 mask pixels per LED).
//
// Strokes: [x, y, w] control points (w = brush width in units), smoothed by
// Catmull-Rom; a closed stroke starts with 'o'. Berries: [x, y, r].

const D = {
  0: {
    s: [['o', [5, 0.6, 1.0], [7.9, 2.4, 1.9], [9.0, 8, 2.5], [7.9, 13.6, 1.9], [5, 15.4, 1.0], [2.1, 13.6, 1.9], [1.0, 8, 2.5], [2.1, 2.4, 1.9]],
      // a sprig of grass off the shoulder
      [[8.4, 2.2, 0.3], [9.6, 0.9, 1.0], [10.6, -0.3, 0.2]]],
    b: [[10.7, 1.4, 0.75]],
  },
  1: {
    s: [[[1.9, 5.6, 0.5], [2.4, 4.6, 1.2], [4.3, 2.6, 1.7], [6.3, 0.5, 1.6]],
      [[6.3, 0.5, 1.6], [6.0, 4, 2.3], [5.8, 9, 2.6], [5.7, 15.2, 2.4]],
      [[2.6, 15.6, 0.4], [4.4, 15.3, 1.4], [5.7, 15.2, 1.6], [7.2, 15.3, 1.4], [9.0, 15.6, 0.4]]],
    b: [[1.6, 6.3, 0.95]],
  },
  2: {
    s: [[[1.9, 4.6, 0.7], [1.7, 3.0, 1.2], [3.0, 1.1, 1.5], [5.3, 0.5, 1.7], [7.8, 1.4, 2.1], [8.7, 4.0, 2.5], [7.8, 7.0, 2.4], [5.0, 10.2, 2.0], [2.4, 12.9, 1.7], [1.0, 15.1, 1.5]],
      [[1.0, 15.1, 1.5], [3.6, 14.7, 1.8], [6.5, 15.2, 2.2], [8.8, 14.8, 1.4], [9.6, 13.6, 0.5]]],
    b: [[2.3, 5.2, 0.95], [9.8, 12.6, 0.7]],
  },
  3: {
    s: [[[1.5, 2.9, 0.7], [3.2, 1.0, 1.4], [6.0, 0.5, 1.8], [8.3, 1.8, 2.2], [8.4, 4.4, 2.2], [6.6, 6.6, 1.7], [4.2, 7.3, 1.1]],
      [[4.4, 7.4, 1.1], [6.6, 7.6, 1.6], [8.8, 9.0, 2.2], [9.3, 11.8, 2.6], [8.0, 14.4, 2.2], [5.4, 15.5, 1.6], [2.7, 15.1, 1.2], [1.3, 13.6, 0.7]]],
    b: [[1.3, 3.5, 0.95], [1.1, 12.7, 0.95]],
  },
  4: {
    s: [[[6.9, 0.6, 1.2], [5.0, 4.0, 1.7], [2.8, 7.8, 1.8], [0.9, 11.0, 1.5]],
      [[0.9, 11.0, 1.4], [3.6, 10.9, 1.8], [6.8, 10.9, 1.9], [9.6, 10.7, 0.8]],
      [[7.0, 0.6, 1.3], [7.2, 5, 2.5], [7.1, 10, 2.6], [7.0, 15.4, 2.3]]],
    b: [[10.3, 10.3, 0.75]],
  },
  5: {
    s: [[[9.2, 0.7, 0.6], [7.6, 0.9, 1.4], [5.2, 0.9, 1.7], [2.8, 0.9, 1.8]],
      [[2.8, 0.9, 1.9], [2.6, 3.8, 2.1], [2.3, 6.9, 1.6]],
      [[2.3, 6.9, 1.2], [4.8, 5.9, 1.7], [7.8, 6.6, 2.3], [9.3, 9.6, 2.7], [8.6, 13.0, 2.4], [6.0, 15.3, 1.8], [3.0, 15.2, 1.2], [1.3, 13.6, 0.7]]],
    b: [[9.8, 0.6, 0.85], [1.1, 12.8, 0.95]],
  },
  6: {
    s: [[[8.4, 2.4, 0.7], [7.0, 0.8, 1.4], [4.6, 0.9, 1.9], [2.5, 3.0, 2.3], [1.3, 6.6, 2.6], [1.2, 10.4, 2.6], [2.3, 13.8, 2.3], [4.9, 15.4, 1.8], [7.6, 14.7, 2.0], [9.0, 12.0, 2.3], [8.3, 9.0, 1.9], [5.8, 7.6, 1.4], [3.2, 8.2, 1.1], [1.6, 9.6, 0.9]]],
    b: [[8.9, 3.0, 0.95]],
  },
  7: {
    s: [[[0.8, 2.6, 0.6], [1.6, 1.2, 1.3], [3.4, 0.8, 1.6], [6.2, 1.0, 1.8], [9.2, 0.8, 2.0]],
      [[9.2, 0.8, 2.0], [8.0, 4.4, 2.4], [6.4, 8.8, 2.6], [5.2, 12.4, 2.4], [4.6, 15.3, 2.0]],
      // a leaf for a crossbar, as Russian hands write the 7
      [[4.4, 8.4, 0.3], [6.0, 8.2, 1.4], [8.4, 7.9, 0.3]]],
    b: [[0.6, 3.3, 0.95]],
  },
  8: {
    s: [['o', [5, 7.6, 1.2], [2.5, 5.8, 2.2], [2.3, 2.5, 1.8], [5, 0.6, 1.1], [7.7, 2.5, 1.8], [7.5, 5.6, 2.2], [5, 7.6, 1.2], [1.6, 10.0, 2.4], [1.5, 13.4, 2.0], [5, 15.4, 1.1], [8.5, 13.4, 2.0], [8.4, 10.0, 2.4]]],
    b: [],
  },
  9: {
    s: [['o', [8.7, 5.0, 2.4], [7.9, 1.9, 1.8], [5.0, 0.6, 1.2], [2.1, 1.9, 1.9], [1.2, 5.2, 2.4], [2.4, 8.3, 1.8], [5.2, 9.4, 1.3], [7.8, 8.2, 1.7]],
      [[8.6, 4.2, 2.0], [8.9, 8.0, 2.6], [8.2, 11.8, 2.4], [6.4, 14.6, 1.8], [3.8, 15.5, 1.2], [1.8, 14.5, 0.7]]],
    b: [[1.4, 13.7, 0.95]],
  },
};

export const GW = 10, GH = 16;
const OX = -1.5, OY = -1.5, UW = 13, UH = 19, S0 = 8;

/** Catmull-Rom through [x, y, w] points; returns a dense polyline. */
function spline(pts, closed) {
  const n = pts.length, out = [];
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), Math.max(0.15, f(p0[2], p1[2], p2[2], p3[2]))]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  else out.push(out[0]);
  return out;
}

function bake(def) {
  const W = UW * S0, H = UH * S0;
  const sd = new Float32Array(W * H).fill(9), sc = new Float32Array(W * H).fill(9), sr = new Float32Array(W * H).fill(9);
  for (const st of def.s) {
    const closed = st[0] === 'o';
    const line = spline(closed ? st.slice(1) : st, closed);
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, ay, aw] = line[k], [bx, by, bw] = line[k + 1];
      const ra = aw / 2, rb = bw / 2, R = Math.max(ra, rb) + 0.3;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - OX) * S0)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + R - OX) * S0));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R - OY) * S0)), y1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + R - OY) * S0));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      for (let j = y0; j <= y1; j++) {
        const py = OY + (j + 0.5) / S0;
        for (let i = x0; i <= x1; i++) {
          const px = OX + (i + 0.5) / S0;
          let t = ((px - ax) * dx + (py - ay) * dy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(px - ax - t * dx, py - ay - t * dy), r = ra + (rb - ra) * t;
          const p = j * W + i;
          if (d - r < sd[p]) sd[p] = d - r;
          if (d - 0.4 * r < sc[p]) sc[p] = d - 0.4 * r;
        }
      }
    }
  }
  for (const [bx, by, br] of def.b) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const d = Math.hypot(OX + (i + 0.5) / S0 - bx, OY + (j + 0.5) / S0 - by) - br;
      const p = j * W + i;
      if (d < sr[p]) sr[p] = d;
    }
  }
  // channels: gold, gold core (soft highlight down the middle), red berry
  const out = new Float32Array(3 * W * H);
  for (let p = 0; p < W * H; p++) {
    const red = Math.min(1, Math.max(0, 0.5 - sr[p] * S0));
    const g = Math.min(1, Math.max(0, 0.5 - sd[p] * S0)) * (1 - red);
    out[3 * p] = g;
    out[3 * p + 1] = Math.min(g, Math.max(0, 0.5 - sc[p] * 3));
    out[3 * p + 2] = red;
  }
  return { W, H, S: S0, data: out };
}

function half(m) {
  const W = m.W / 2, H = m.H / 2, d = new Float32Array(3 * W * H), s = m.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    for (let c = 0; c < 3; c++) {
      const a = 3 * ((2 * j) * m.W + 2 * i) + c, b = a + 3 * m.W;
      d[3 * (j * W + i) + c] = 0.25 * (s[a] + s[a + 3] + s[b] + s[b + 3]);
    }
  }
  return { W, H, S: m.S / 2, data: d };
}

/** MASKS[level][digit], level 0..3 = 8, 4, 2, 1 samples per unit. */
export const MASKS = [[], [], [], []];
for (let n = 0; n < 10; n++) {
  let m = bake(D[n]);
  MASKS[0][n] = m;
  for (let l = 1; l < 4; l++) { m = half(m); MASKS[l][n] = m; }
}
/** The mask level to use when one LED spans `unitsPerPx` glyph units. */
export function levelFor(unitsPerPx) {
  for (let l = 3; l >= 0; l--) if ((8 >> l) * unitsPerPx >= 1) return l;
  return 0;
}

/** Bilinear sample of mask m at glyph units (u, v); writes gold, core, red to out[0..2]. */
export function sample(m, u, v, out) {
  const fx = (u - OX) * m.S - 0.5, fy = (v - OY) * m.S - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy);
  out[0] = out[1] = out[2] = 0;
  if (i < -1 || j < -1 || i >= m.W || j >= m.H) return;
  const ax = fx - i, ay = fy - j, W = m.W, d = m.data;
  for (let k = 0; k < 4; k++) {
    const ii = i + (k & 1), jj = j + (k >> 1);
    if (ii < 0 || jj < 0 || ii >= W || jj >= m.H) continue;
    const w = ((k & 1) ? ax : 1 - ax) * ((k >> 1) ? ay : 1 - ay), p = 3 * (jj * W + ii);
    out[0] += w * d[p]; out[1] += w * d[p + 1]; out[2] += w * d[p + 2];
  }
}
