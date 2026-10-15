// Griddle: the piped-batter numerals. Each digit is the path a squeeze
// bottle takes (one or two strokes, in drawing order), in a 10 x 16 box,
// y down. Batter comes out thick where the squeeze starts and thins as the
// hand moves on, so the width tapers along each stroke; a pause leaves a
// blob. The paths are pre-rendered once into small distance textures:
//   e   signed distance to the line edge (units, < 0 inside)
//   hw  half width of the nearest line (units)
//   tau when along the digit's piping it was drawn (0..1)
// so a pancake can sample them at any position, size and flip.

const C = 1; // corner marker
const RAW = {
  0: (() => {
    const p = [];
    for (let k = 0; k <= 26; k++) {
      const a = (-70 - (k / 26) * 372) * Math.PI / 180;
      const y = 8 + 7.1 * Math.sin(a);
      p.push([5 + 4.15 * Math.cos(a) + (8 - y) * 0.07, y]);
    }
    return [p];
  })(),
  1: [[[2.3, 4.6], [4.2, 2.7], [6.1, 0.9, C], [6.1, 8], [6.1, 15.3]]],
  2: [[[1.5, 4.7], [2.3, 2.0], [5.0, 0.8], [7.7, 1.7], [8.6, 4.4], [7.6, 7.6], [4.8, 10.8], [1.3, 15.0, C], [5.2, 15.1], [9.2, 15.0]]],
  3: [[[1.5, 2.9], [4.0, 0.9], [7.2, 1.2], [8.5, 3.8], [7.4, 6.4], [4.3, 7.6, C], [7.5, 8.6], [8.9, 11.4], [7.8, 14.3], [4.8, 15.4], [1.3, 13.8]]],
  4: [[[6.6, 0.8], [3.8, 5.8], [1.0, 10.9, C], [5.0, 10.9], [9.4, 10.9]], [[7.3, 5.6], [7.3, 10.5], [7.3, 15.4]]],
  5: [[[8.7, 1.0], [5.5, 1.0], [2.5, 1.0, C], [2.1, 4.0], [1.8, 7.3, C], [4.6, 6.1], [7.6, 6.9], [8.9, 10.3], [7.9, 13.8], [4.9, 15.4], [1.4, 14.0]]],
  6: [[[8.0, 1.6], [5.4, 0.8], [2.8, 2.4], [1.4, 6.5], [1.3, 11.0], [2.8, 14.6], [5.4, 15.4], [7.9, 14.1], [8.8, 11.2], [7.8, 8.4], [5.2, 7.4], [2.7, 8.2], [1.4, 10.6]]],
  7: [[[1.0, 1.2], [5.0, 1.2], [9.0, 1.2, C], [7.0, 5.0], [5.4, 9.0], [4.4, 12.4], [4.0, 15.3]]],
  8: [[[5.6, 7.6], [7.6, 6.1], [8.2, 3.6], [6.9, 1.2], [5.0, 0.8], [3.1, 1.2], [1.8, 3.6], [2.4, 6.1], [5.0, 7.6], [7.8, 9.1], [8.9, 11.8], [7.8, 14.6], [5.0, 15.4], [2.2, 14.6], [1.1, 11.8], [2.2, 9.1], [4.6, 7.8]]],
  9: [[[8.6, 4.8], [7.6, 1.6], [5.0, 0.8], [2.4, 1.8], [1.4, 4.7], [2.5, 7.5], [5.1, 8.3], [7.7, 7.2], [8.7, 4.4, C], [8.8, 8.8], [7.9, 12.7], [5.8, 15.2], [2.8, 15.0]]],
};

/** Catmull-Rom through the points; corner points split the spline. */
function smooth(pts) {
  const pieces = [];
  let cur = [];
  for (const p of pts) {
    cur.push(p);
    if (p[2] === C) { pieces.push(cur); cur = [p]; }
  }
  if (cur.length > 1) pieces.push(cur);
  const out = [];
  for (const pc of pieces) {
    const n = pc.length;
    for (let i = 0; i + 1 < n; i++) {
      const p0 = pc[Math.max(0, i - 1)], p1 = pc[i], p2 = pc[i + 1], p3 = pc[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 8; k++) {
        if (out.length && k === 0 && i === 0) continue;
        const t = k / 8, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    const last = pc[n - 1];
    out.push([last[0], last[1]]);
  }
  return out;
}

const GAP = 3; // travel between strokes, in units of path length (the bottle lifts)
export const GW = 39, GH = 57, GPX = 3, GM = 1.5; // texture size, texels per unit, margin (units)

function build(d) {
  const strokes = RAW[d].map(smooth);
  // arc length of each stroke, and the timeline with travel gaps
  const lens = strokes.map((s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; });
  const total = lens.reduce((a, b) => a + b, 0) + GAP * (strokes.length - 1);
  const segs = []; // ax ay bx by hwA hwB tauA tauB
  const path = []; // timeline samples: [tau, x, y, down]
  let at = 0;
  strokes.forEach((s, si) => {
    let l = 0;
    const L = lens[si];
    const hwAt = (ll) => { const q = ll / L; return 0.5 * (2.05 * (1.16 - 0.36 * q) + 1.1 * Math.exp(-ll / 0.7)); };
    for (let i = 1; i < s.length; i++) {
      const dl = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      segs.push([s[i - 1][0], s[i - 1][1], s[i][0], s[i][1], hwAt(l), hwAt(l + dl), (at + l) / total, (at + l + dl) / total]);
      path.push([(at + l) / total, s[i - 1][0], s[i - 1][1], 1]);
      l += dl;
    }
    path.push([(at + L) / total, s[s.length - 1][0], s[s.length - 1][1], 1]);
    at += L + GAP;
  });
  const E = new Float32Array(GW * GH), HW = new Float32Array(GW * GH), TAU = new Float32Array(GW * GH);
  for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
    const px = tx / GPX - GM, py = ty / GPX - GM;
    let be = 1e9, bh = 1, bt = 0;
    for (const g of segs) {
      const dx = g[2] - g[0], dy = g[3] - g[1], L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - g[0]) * dx + (py - g[1]) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const hw = g[4] + (g[5] - g[4]) * t;
      const e = Math.hypot(px - g[0] - t * dx, py - g[1] - t * dy) - hw;
      if (e < be) { be = e; bh = hw; bt = g[6] + (g[7] - g[6]) * t; }
    }
    const k = ty * GW + tx;
    E[k] = be; HW[k] = bh; TAU[k] = bt;
  }
  return { E, HW, TAU, path };
}

const CACHE = [];
export function glyph(d) { return CACHE[d] || (CACHE[d] = build(d)); }

/** Where the bottle tip is at tau (0..1) along digit d: [x, y, down]. */
export function tipAt(d, tau) {
  const P = glyph(d).path;
  if (tau <= P[0][0]) return [P[0][1], P[0][2], 1];
  for (let i = 1; i < P.length; i++) {
    if (tau <= P[i][0]) {
      const a = P[i - 1], b = P[i], k = (tau - a[0]) / Math.max(1e-6, b[0] - a[0]);
      // a jump between strokes: the bottle lifts
      const jump = Math.hypot(b[1] - a[1], b[2] - a[2]) > 1.5;
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, jump ? 0 : 1];
    }
  }
  const z = P[P.length - 1];
  return [z[1], z[2], 1];
}

// build all ten at load, not in the first frames
for (let d = 0; d < 10; d++) glyph(d);
