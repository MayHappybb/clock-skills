// beadmaze glyphs: the ten numerals as bent wires, one continuous wire each,
// with two free ends (a bead maze wire has no branches). Built from straight
// runs, filleted bends and circular arcs, the way wire is bent, then resampled
// to N points evenly by arc length so any two shapes can be morphed point to
// point. Local box: centreline x 0..21, y 0..47 (y down).
//
// Also the two in-between shapes the wire relaxes into during a turn: a slack
// wave (minute) and a two-loop roller coaster (hour).

export const N = 64;
export const GW = 21, GH = 47;

class PathB {
  constructor() { this.p = []; }
  at(x, y) { this.p.push([x, y]); return this; }
  // straight run to (x, y), dense
  line(x, y) {
    const [x0, y0] = this.p[this.p.length - 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) * 4));
    for (let i = 1; i <= n; i++) this.p.push([x0 + (x - x0) * i / n, y0 + (y - y0) * i / n]);
    return this;
  }
  // arc of an ellipse centred (cx, cy), degrees, y down (90 = bottom); a0 -> a1 either way
  arc(cx, cy, rx, ry, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
    const first = this.p.length === 0;
    for (let i = first ? 0 : 1; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      this.p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return this;
  }
  // polyline through corners, each corner rounded with radius r
  poly(pts, r) {
    if (this.p.length === 0) this.at(...pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      if (i === pts.length - 1) { this.line(x1, y1); break; }
      const [x0, y0] = pts[i - 1], [x2, y2] = pts[i + 1];
      const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
      const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
      const tlen = Math.min(r / Math.tan(half), la * 0.45, lb * 0.45);
      const sx = x1 + ux * tlen, sy = y1 + uy * tlen, ex = x1 + vx * tlen, ey = y1 + vy * tlen;
      this.line(sx, sy);
      // quadratic Bezier with the corner as control: close to a fillet at this size
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, m = 1 - t;
        this.p.push([m * m * sx + 2 * m * t * x1 + t * t * ex, m * m * sy + 2 * m * t * y1 + t * t * ey]);
      }
    }
    return this;
  }
}

/** Resample a dense polyline to N points evenly by arc length. */
function resample(dense) {
  const L = [0];
  for (let i = 1; i < dense.length; i++) L.push(L[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const tot = L[L.length - 1], out = new Float32Array(N * 2);
  let j = 1;
  for (let k = 0; k < N; k++) {
    const s = tot * k / (N - 1);
    while (j < dense.length - 1 && L[j] < s) j++;
    const u = (s - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
    out[2 * k] = dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * u;
    out[2 * k + 1] = dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * u;
  }
  return out;
}

const rot = (pts) => pts.map(([x, y]) => [GW - x, GH - y]);

function six() {
  return new PathB().arc(22, 23, 22, 22, -96, -180).line(0, 36).arc(10.5, 36, 10.5, 10.5, 180, -172).p;
}

const DENSE = {
  0: new PathB().arc(10.5, 36.5, 10.5, 10.5, 90, 180).line(0, 10.5).arc(10.5, 10.5, 10.5, 10.5, 180, 360).line(21, 36.5).arc(10.5, 36.5, 10.5, 10.5, 0, 84).p,
  1: new PathB().poly([[12.5, 47], [12.5, 0], [3, 9.5]], 1.5).p,
  2: new PathB().arc(10.5, 10.5, 10.5, 10.5, 163, 395).poly([[10.5 + 10.5 * Math.cos(35 * Math.PI / 180), 10.5 + 10.5 * Math.sin(35 * Math.PI / 180)], [0.5, 47], [21, 47]], 2).p,
  3: new PathB().arc(10.5, 10.25, 10.25, 10.25, 158, 450).line(7.5, 20.5).arc(7.5, 23.25, 2.75, 2.75, 270, 90).line(10.5, 26).arc(10.5, 36.5, 10.5, 10.5, 270, 522).p,
  4: new PathB().poly([[15, 47], [15, 0], [0, 31], [21, 31]], 1.5).p,
  5: new PathB().poly([[20.5, 0], [1, 0], [1, 20], [9.5, 20]], 1.5).arc(9.5, 33.5, 11.5, 13.5, 270, 490).p,
  6: six(),
  7: new PathB().poly([[0, 0], [21, 0], [7.5, 47]], 1.5).p,
  8: null,
  9: rot(six()),
};

// 8: one wire, crossing itself at the waist; built as a Catmull-Rom spline
{
  const P = [];
  const top = (a, r = 9.75) => [10.5 + r * Math.cos(a * Math.PI / 180), 11 + r * Math.sin(a * Math.PI / 180)];
  const bot = (a, r = 10.5) => [10.5 + r * Math.cos(a * Math.PI / 180), 36 + r * Math.sin(a * Math.PI / 180)];
  P.push([10.5, 23.2], top(135), top(180), top(225), top(270), top(315), top(0), top(45), [10.5, 23.2],
    bot(225), bot(180), bot(135), bot(90), bot(45), bot(0), bot(315), [12.6, 21.6]);
  const dense = [];
  const g = (i) => (i < 0 ? [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]] : i >= P.length ? [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]] : P[i]);
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  dense.push(P[P.length - 1]);
  DENSE[8] = dense;
}

function lenOf(a) {
  let L = 0;
  for (let k = 1; k < N; k++) L += Math.hypot(a[2 * k] - a[2 * k - 2], a[2 * k + 1] - a[2 * k - 1]);
  return L;
}

// the in-between shapes
const waveDense = [], loopDense = [];
for (let i = 0; i <= 400; i++) {
  const u = i / 400;
  waveDense.push([u * GW, 27 + 6 * Math.sin(u * Math.PI * 4)]);
  const ph = u * Math.PI * 4, a = GW / (Math.PI * 4), b = 5.2;
  loopDense.push([a * ph - b * Math.sin(ph) + 0.0, 31 - b * (1 - Math.cos(ph))]);
}
export const WAVE = resample(waveDense);
export const LOOP = resample(loopDense);

/**
 * GLYPHS[d] = { pts: Float32Array(2N) local, L, sx, sy (strut foot on the glyph) }.
 * Each wire is stored in the point order that lies closest to the wave's
 * left-to-right order, so a turn never reverses a wire (beads keep their order).
 */
export const GLYPHS = [];
for (let d = 0; d < 10; d++) {
  const pts = resample(DENSE[d]);
  let sy = -1, sx = 10.5, best = 1e9;
  for (let k = 0; k < N; k++) {
    const x = pts[2 * k], y = pts[2 * k + 1];
    if (y > sy + 0.4 || (Math.abs(y - sy) <= 0.4 && Math.abs(x - 10.5) < best)) { if (y > sy + 0.4) best = 1e9; sy = Math.max(sy, y); sx = x; best = Math.abs(x - 10.5); }
  }
  const cost = (B, flip) => {
    let c = 0;
    for (let k = 0; k < N; k++) { const j = flip ? N - 1 - k : k; c += Math.hypot(pts[2 * k] - B[2 * j], pts[2 * k + 1] - B[2 * j + 1]); }
    return c;
  };
  if (cost(WAVE, true) < cost(WAVE, false)) {        // store every wire in the order that runs left to right like the wave
    for (let k = 0; k < N / 2; k++) for (let c = 0; c < 2; c++) { const t = pts[2 * k + c]; pts[2 * k + c] = pts[2 * (N - 1 - k) + c]; pts[2 * (N - 1 - k) + c] = t; }
  }
  GLYPHS.push({ pts, L: lenOf(pts), sx, sy });
}
export const WAVE_L = lenOf(WAVE), LOOP_L = lenOf(LOOP);
