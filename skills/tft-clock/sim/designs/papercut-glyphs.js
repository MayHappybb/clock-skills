// The numerals for papercut.js, cut the way a jianzhi cutter cuts a yin
// (negative) figure: every stroke is its own hole, a crescent-moon cut
// (yueya wen) for a bowl, a willow-leaf cut for a straight stroke, pointed at
// both ends. Strokes never touch where a counter would be cut loose, so the
// red island inside a 0, 6, 8 or 9 is always held to the sheet by a bridge
// between two leaf tips: the sheet stays one piece. Bowls carry the craft's
// sawtooth (juchi wen) on their outer edge.
//
// Designed on a 20 x 40 box; built once at load into small tables (on the
// device: const tables in flash):
//   cov   hole coverage, 0..255 (AA from 4 x 4 supersampling)
//   glow  the same blurred (radius ~3 px): the light that spills round a cut
//   cut   for pixels just inside a cut edge, when the scissors pass (1..255)
//   path  the scissors' path: the leaves' centre lines in cutting order
//   polys each leaf's outline, for the piece that falls out

const DW = 20, DH = 40;

/** Points along an ellipse arc, angles in degrees on screen (0 right, 90 down, increasing clockwise). */
export function ell(cx, cy, rx, ry, a0, a1, n = 28) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
/** Catmull-Rom through control points. */
export function spl(c, n = 8) {
  const p = [], q = [c[0], ...c, c[c.length - 1]];
  for (let i = 1; i < q.length - 2; i++)
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      p.push([f(q[i - 1][0], q[i][0], q[i + 1][0], q[i + 2][0]), f(q[i - 1][1], q[i][1], q[i + 1][1], q[i + 2][1])]);
    }
  p.push(c[c.length - 1]);
  return p;
}
// a leaf: centre line, half-width, and teeth on one side (-1 = the outer side of a clockwise arc)
export const leaf = (pts, w, teeth = 0, side = -1) => ({ pts, w, teeth, side });

const SIX = [
  leaf(spl([[16.2, 3.6], [10, 7], [5.2, 15], [3.6, 24], [5, 31.5]]), 3.2),
  leaf(ell(10.6, 28, 6.4, 7.9, 228, 468), 3.1, 7),
];
const flip = (L) => L.map((l) => ({ ...l, pts: l.pts.map(([x, y]) => [DW - x, DH - y]).reverse() }));

export const DIGITS = [
  [leaf(ell(10, 20, 7, 16.5, 100, 260), 3.3, 9), leaf(ell(10, 20, 7, 16.5, 280, 440), 3.3, 9)],
  [leaf(spl([[8.6, 6.4], [6, 9.2], [3.4, 12]]), 1.9), leaf(spl([[11.6, 2.8], [11, 20], [11.6, 37.4]]), 3.3)],
  [leaf(ell(10, 12, 7, 7.6, 192, 395), 3.2, 6), leaf(spl([[14.8, 19.8], [9, 27.5], [3.6, 34.6]]), 3.0), leaf(spl([[4.2, 37.4], [10.5, 36.9], [17.2, 36.4]]), 2.5)],
  [leaf(ell(9.5, 11, 7, 7.6, 205, 437), 3.1, 6), leaf(ell(9.5, 28.6, 8, 8.6, 283, 515), 3.3, 7)],
  [leaf(spl([[13.2, 2.8], [8.2, 14], [3.2, 25.6]]), 3.0), leaf(spl([[3.6, 29.6], [10, 29.3], [18.6, 29]]), 2.5), leaf(spl([[15, 8.5], [15, 23], [15, 37.6]]), 3.2)],
  [leaf(spl([[7.4, 3.9], [12.4, 3.7], [17.6, 3.4]]), 2.5), leaf(spl([[5.3, 5.6], [5, 11], [4.7, 17]]), 2.4), leaf(ell(9.6, 27.4, 8, 8.9, 217, 500), 3.3, 7)],
  SIX,
  [leaf(spl([[2.8, 4.6], [10, 4.1], [17.6, 4]]), 2.7), leaf(spl([[16.6, 7.8], [12.2, 20], [8.6, 37.2]]), 3.2)],
  [leaf(ell(10, 11, 6, 7.8, 102, 258), 2.9, 5), leaf(ell(10, 11, 6, 7.8, 282, 438), 2.9, 5),
    leaf(ell(10, 28.7, 7.6, 9.3, 102, 258), 3.2, 6), leaf(ell(10, 28.7, 7.6, 9.3, 282, 438), 3.2, 6)],
  flip(SIX),
];
// the flip turns 6's arcs anticlockwise, so their outer side is the other one
for (const l of DIGITS[9]) l.side = 1;

// ------------------------------------------------------------ building the tables

/** Prepare a leaf at scale k (px per unit) and offset (ox, oy): segments, lengths, bounds. */
export function prep(l, k, ox, oy) {
  const P = l.pts.map(([x, y]) => [ox + x * k, oy + y * k]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const len = cum[cum.length - 1], w = l.w * k;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { P, cum, len, w, teeth: l.teeth, side: l.side, box: [x0 - w - 1, y0 - w - 1, x1 + w + 1, y1 + w + 1] };
}
/** Half-width of a leaf at u (0..1 along it) on side s: full in the middle, pointed tips, teeth on one side. */
function halfW(L, u, s) {
  const sn = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  let h = L.w * Math.sqrt(sn);
  if (L.teeth && s === L.side) {
    const f = (u * L.teeth) % 1, tri = f < 0.5 ? f * 2 : 2 - f * 2;
    h -= Math.min(1.5, L.w * 0.42) * tri * sn;
  }
  return h;
}
/** Signed distance (px, negative inside) to a prepared leaf, and where along it the nearest point is. */
export function leafSD(L, px, py, out) {
  if (px < L.box[0] || py < L.box[1] || px > L.box[2] || py > L.box[3]) { out.d = 9; out.u = 0; return out; }
  let best = 1e9, bu = 0, bs = 1;
  const P = L.P;
  for (let i = 1; i < P.length; i++) {
    const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, l2 = dx * dx + dy * dy || 1e-9;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - ax - t * dx, ey = py - ay - t * dy, d = Math.hypot(ex, ey);
    if (d < best) { best = d; bu = (L.cum[i - 1] + t * (L.cum[i] - L.cum[i - 1])) / L.len; bs = dx * ey - dy * ex < 0 ? -1 : 1; }
  }
  out.d = best - halfW(L, bu, bs); out.u = bu;
  return out;
}

export const PAD = 5;
const tmp = { d: 0, u: 0 };

/** One digit at scale k: the tables listed at the top. */
function build(leaves, k) {
  const w = Math.ceil(DW * k), h = Math.ceil(DH * k), tw = w + 2 * PAD, th = h + 2 * PAD;
  const Ls = leaves.map((l) => prep(l, k, PAD, PAD));
  // the scissors' path: each leaf's centre line, with a short hop between leaves
  const path = [], starts = [];
  let run = 0;
  Ls.forEach((L, j) => {
    if (j) { const a = path[path.length - 1], b = L.P[0]; run += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    starts.push(run);
    for (let i = 0; i < L.P.length; i++) path.push([L.P[i][0], L.P[i][1], run + L.cum[i]]);
    run += L.len;
  });
  const total = run;
  const cov = new Uint8Array(tw * th), cut = new Uint8Array(tw * th), leafOf = new Int8Array(tw * th).fill(-1);
  const N = 4;
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      let n = 0;
      for (let a = 0; a < N; a++)
        for (let b = 0; b < N; b++) {
          const sx = x + (a + 0.5) / N, sy = y + (b + 0.5) / N;
          for (const L of Ls) if (leafSD(L, sx, sy, tmp).d < 0) { n++; break; }
        }
      cov[y * tw + x] = Math.round((n * 255) / (N * N));
      // the cut line: the nearest leaf's edge, just inside it
      let bd = 9, bj = -1, bu = 0;
      Ls.forEach((L, j) => { leafSD(L, x + 0.5, y + 0.5, tmp); if (tmp.d < bd) { bd = tmp.d; bj = j; bu = tmp.u; } });
      if (bj >= 0 && bd < 0.6) leafOf[y * tw + x] = bj;
      if (bj >= 0 && bd > -1.15 && bd < 0.6) cut[y * tw + x] = Math.max(1, Math.min(255, Math.round(((starts[bj] + bu * Ls[bj].len) / total) * 254) + 1));
    }
  // glow: two box blurs of radius 2 (about a radius-3 gaussian), normalised
  let glow = Float32Array.from(cov);
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        let s = 0, c = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
          const xx = x + i, yy = y + j;
          if (xx >= 0 && yy >= 0 && xx < tw && yy < th) { s += glow[yy * tw + xx]; c++; }
        }
        o[y * tw + x] = s / 25;
      }
    glow = o;
  }
  const glow8 = new Uint8Array(tw * th);
  for (let i = 0; i < tw * th; i++) glow8[i] = Math.min(255, Math.round(glow[i] * 1.6));
  // each leaf's outline polygon (for its falling piece), and its centre
  const polys = Ls.map((L) => {
    const left = [], right = [], n = Math.max(6, Math.round(L.len / 2.2));
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L.len;
      let q = 1;
      while (q < L.P.length - 1 && L.cum[q] < s) q++;
      const a = L.P[q - 1], b = L.P[q], f = (s - L.cum[q - 1]) / (L.cum[q] - L.cum[q - 1] || 1);
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / dl, ny = (b[0] - a[0]) / dl;
      const u = i / n;
      left.push([x + nx * halfW(L, u, 1), y + ny * halfW(L, u, 1)]);
      right.push([x - nx * halfW(L, u, -1), y - ny * halfW(L, u, -1)]);
    }
    const pts = [...left, ...right.reverse()];
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    return { pts, cx: cx / pts.length, cy: cy / pts.length };
  });
  const pf = new Float32Array(path.length * 3);
  path.forEach((p, i) => { pf[i * 3] = p[0]; pf[i * 3 + 1] = p[1]; pf[i * 3 + 2] = p[2]; });
  return { w, h, tw, th, cov, glow: glow8, cut, leafOf, path: pf, total, starts, lens: Ls.map((L) => L.len), polys };
}

export const HOUR_K = 1.0, MIN_K = 0.77;
export const HOUR = DIGITS.map((d) => build(d, HOUR_K));
export const MIN = DIGITS.map((d) => build(d, MIN_K));

/** Where the scissors are at path length s: [x, y, angle of travel]. */
export function pathAt(G, s) {
  const p = G.path, n = p.length / 3;
  if (s <= 0) s = 0;
  let i = 1;
  while (i < n - 1 && p[i * 3 + 2] < s) i++;
  const ax = p[(i - 1) * 3], ay = p[(i - 1) * 3 + 1], bx = p[i * 3], by = p[i * 3 + 1];
  const l = p[i * 3 + 2] - p[(i - 1) * 3 + 2] || 1, f = Math.min(1, Math.max(0, (s - p[(i - 1) * 3 + 2]) / l));
  return [ax + (bx - ax) * f, ay + (by - ay) * f, Math.atan2(by - ay, bx - ax)];
}

let bytes = 0;
for (const S of [HOUR, MIN]) for (const G of S) bytes += G.tw * G.th * 3 + G.path.length * 2 + G.polys.reduce((a, p) => a + p.pts.length * 2, 0);
export const GLYPH_BYTES = bytes;
