// Numeral-candle font for the Birthday face: chunky moulded wax numerals, the
// kind sold one digit per candle. Each digit is a set of centre-lines in a
// 20 x 30 px box, swept with a fat round brush (radius R). They are baked once
// into a distance field at 1/4 px, so a candle can be drawn at any sub-pixel
// position and lean, with a bevelled edge taken from the distance.

export const GW = 20, GH = 30, R = 2.6;
const SS = 4, PAD = 5;                       // field samples per px, margin px
export const FW = (GW + 2 * PAD) * SS, FH = (GH + 2 * PAD) * SS;

const deg = Math.PI / 180;
function arc(cx, cy, r, a0, a1, n = 14) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * deg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
function bez(a, c, b, n = 12) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}
const rot180 = (paths) => paths.map((p) => p.map(([x, y]) => [GW - x, GH - y]));

// Angles in degrees with y DOWN: 270 is the top of a circle, 90 the bottom.
const six = [
  arc(10, 19.9, 6.7, 0, 360, 24),
  bez([3.3, 19.9], [3.2, 4.5], [15.0, 3.2]),
];
const PATHS = {
  0: [[...arc(10, 10.0, 6.85, 180, 360, 12), ...arc(10, 20.0, 6.85, 0, 180, 12), [3.15, 10.0]]],
  1: [[[4.2, 9.6], [11.2, 3.45], [11.2, 26.55]], [[4.6, 26.55], [17.4, 26.55]]],
  2: [[...arc(10, 10.0, 6.4, 188, 383, 14), [3.5, 26.55], [16.6, 26.55]]],
  3: [arc(10, 9.25, 5.75, 205, 448, 14), arc(10, 20.25, 6.3, 268, 518, 16)],
  4: [[[15.0, 2.9], [1.7, 19.4], [18.2, 19.4]], [[15.0, 2.9], [15.0, 27.1]]],
  5: [[[16.2, 3.45], [5.2, 3.45], [4.4, 13.2], [5.6, 14.0]], arc(9.7, 19.3, 7.05, 228, 508, 18)],
  6: six,
  7: [[[3.45, 3.45], [16.55, 3.45]], bez([16.55, 3.45], [10.2, 12], [8.3, 26.55])],
  8: [arc(10, 8.9, 5.6, 0, 360, 22), arc(10, 20.1, 6.4, 0, 360, 24)],
  9: rot180(six),
};
/** Where the wick comes out of the top, per digit (glyph px). */
export const WICK = [10, 11.2, 10, 10, 15.0, 10.6, 13.6, 10, 10, 10];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** FIELDS[d] : Float32Array(FW * FH), signed distance (px) to digit d's edge, + outside. */
export const FIELDS = [];
for (let d = 0; d < 10; d++) {
  const segs = [];
  for (const p of PATHS[d]) for (let k = 0; k + 1 < p.length; k++) segs.push([...p[k], ...p[k + 1]]);
  const f = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = (i + 0.5) / SS - PAD, y = (j + 0.5) / SS - PAD;
    let m = 1e9;
    for (const s of segs) { const q = segDist(x, y, s[0], s[1], s[2], s[3]); if (q < m) m = q; }
    f[j * FW + i] = m - R;
  }
  FIELDS.push(f);
}

/** Signed distance (glyph px) at glyph coords (u, v); far outside returns 9. */
export function dist(f, u, v) {
  const x = (u + PAD) * SS - 0.5, y = (v + PAD) * SS - 0.5;
  if (x < 0 || y < 0 || x >= FW - 1 || y >= FH - 1) return 9;
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j, o = j * FW + i;
  const a = f[o], b = f[o + 1], c = f[o + FW], e = f[o + FW + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
}

/** Glyph-px y of the glyph's top at the wick (the wick base), found from the field. */
export const WICK_Y = FIELDS.map((f, d) => { let v = -3; while (dist(f, WICK[d], v) > 0 && v < 10) v += 0.05; return v; });
/** For drips: per digit, per integer column u (0..GW-1), the topmost inside v (or -1). */
export const TOPV = FIELDS.map((f) => { const a = new Float32Array(GW); for (let u = 0; u < GW; u++) { let v = -2; while (dist(f, u + 0.5, v) > -1.2 && v < GH) v += 0.25; a[u] = v < GH ? v : -1; } return a; });
