// incense: the seal. The hour, written as one continuous line of incense
// powder folded back and forth inside squared seal-script strokes (the way
// a 香篆 mould lays its pattern), with exactly 60 crossings: one a minute.
//
// buildSeal(hh) returns, once per hour (cached):
//   pts   the trail as dense samples [x, y, s] (s = arc length along it)
//   units arc length where each minute's crossing starts (61 entries)
//   pix   every pixel the powder touches: x, y, s (arc where it burns), cov
//   pins  brass pins beside every fifth crossing
//   start the ignition point

const SLOT_X = [16, 92], Y0 = 14, BW = 52, BH = 52;   // centreline boxes of the two digits
const HALF = 5.5;        // crossing half-length (stroke half-width, to the line centre)
const LINE = 1.15;       // powder line half-width
const THREAD = 0.6;      // the thin threads between strokes
const CORNER = 8;        // centreline corner radius (> HALF so folds never cross)
const GAP = 0.067;       // half the gap in a closed loop (0, 8), in box units
export const GUTTER_X = 80;

// Digits as strokes in box units (0..1). Slot 0 digits must end on the
// right, slot 1 digits must start on the left (threads join them through
// the gutter between the digits).
const G = GAP;
const DIGITS = {
  0: [[[[1, 0.5 + G], [1, 1], [0, 1], [0, 0], [1, 0], [1, 0.5 - G]]],
      [[[0, 0.5 + G], [0, 1], [1, 1], [1, 0], [0, 0], [0, 0.5 - G]]]],
  1: [[[[0.15, 0.24], [0.5, 0], [0.5, 0.79]], [[0, 1], [1, 1]]]],
  2: [[[[0, 0], [1, 0], [1, 0.5], [0, 0.5], [0, 1], [1, 1]]]],
  3: [[[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.2, 0.5], [0.84, 0.5]]]],
  4: [[[[0, 0], [0, 0.62], [0.58, 0.62]], [[0.76, 0], [0.76, 1]]]],
  5: [[[[0, 1], [1, 1], [1, 0.5], [0, 0.5], [0, 0], [1, 0]]]],
  6: [[[[0, 0], [1, 0]], [[0, 0.21], [0, 1], [1, 1], [1, 0.5], [0.16, 0.5]]]],
  7: [[[[0, 0.21], [0, 0], [1, 0], [0.42, 1]]]],
  8: [[[[0, 0.5 + G], [0, 1], [1, 1], [1, 0], [0, 0], [0, 0.5 - G]], [[0.16, 0.5], [0.84, 0.5]]]],
  9: [[[[0, 1], [1, 1], [1, 0], [0, 0], [0, 0.5], [0.84, 0.5]]]],
};
const variant = (d, slot) => { const v = DIGITS[d]; return v[Math.min(slot, v.length - 1)]; };

/** A polyline with rounded corners, sampled every `ds`: [x, y, tx, ty]. */
function skeleton(poly, ds = 0.25) {
  const out = [];
  const P = poly.map(([u, v], i) => [u, v]);
  // Build a list of pieces: lines and arcs.
  const pieces = [];
  let cur = P[0];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    let end = b;
    let arc = null;
    if (i < P.length - 1) {
      const c = P[i + 1];
      const d1 = norm(b[0] - a[0], b[1] - a[1]), d2 = norm(c[0] - b[0], c[1] - b[1]);
      const cosT = d1[0] * d2[0] + d1[1] * d2[1];
      const turn = Math.acos(Math.max(-1, Math.min(1, cosT)));     // 0 = straight
      const t = CORNER * Math.tan(turn / 2);
      end = [b[0] - d1[0] * t, b[1] - d1[1] * t];
      const nxt = [b[0] + d2[0] * t, b[1] + d2[1] * t];
      arc = { from: end, to: nxt, d1, d2, turn, cross: d1[0] * d2[1] - d1[1] * d2[0] };
    }
    pieces.push({ line: [cur, end] });
    if (arc) { pieces.push({ arc }); cur = arc.to; }
  }
  for (const pc of pieces) {
    if (pc.line) {
      const [a, b] = pc.line, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      const n = Math.max(1, Math.ceil(L / ds));
      for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, tx, ty]);
    } else {
      const { from, d1, turn, cross } = pc.arc;
      const sgn = cross > 0 ? 1 : -1;               // turning left (+) or right (-) in screen coords
      // centre: from + normal * R toward the turn
      const nx = -d1[1] * sgn, ny = d1[0] * sgn;
      const cx = from[0] + nx * CORNER, cy = from[1] + ny * CORNER;
      const a0 = Math.atan2(from[1] - cy, from[0] - cx);
      const L = CORNER * turn, n = Math.max(1, Math.ceil(L / ds));
      for (let k = 0; k < n; k++) {
        const a = a0 + sgn * turn * k / n;
        const tx = -Math.sin(a) * sgn, ty = Math.cos(a) * sgn;
        out.push([cx + Math.cos(a) * CORNER, cy + Math.sin(a) * CORNER, tx, ty]);
      }
    }
  }
  const last = P[P.length - 1], prev = out[out.length - 1];
  const d = norm(last[0] - prev[0], last[1] - prev[1]);
  out.push([last[0], last[1], d[0], d[1]]);
  // arc length
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    if (i) s += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    out[i].push(s);
  }
  return out;
}
function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

/** The skeleton point at arc s (linear interpolation). */
function skelAt(sk, s) {
  let lo = 0, hi = sk.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sk[m][4] <= s) lo = m; else hi = m; }
  const a = sk[lo], b = sk[hi], f = b[4] > a[4] ? (s - a[4]) / (b[4] - a[4]) : 0;
  const tx = a[2] + (b[2] - a[2]) * f, ty = a[3] + (b[3] - a[3]) * f, [ux, uy] = norm(tx, ty);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, -uy, ux];   // x, y, normal
}

const cache = new Map();

export function buildSeal(hh) {
  if (cache.has(hh)) return cache.get(hh);
  const strokes = [];       // { sk, L, slot }
  for (let slot = 0; slot < 2; slot++)
    for (const poly of variant(+hh[slot], slot)) {
      const sk = skeleton(poly.map(([u, v]) => [SLOT_X[slot] + u * BW, Y0 + v * BH]));
      strokes.push({ sk, L: sk[sk.length - 1][4], slot });
    }
  // 60 crossings: each stroke j has n_j folds and n_j + 1 crossings.
  const S = strokes.length, total = strokes.reduce((a, b) => a + b.L, 0), folds = 60 - S;
  const exact = strokes.map((st) => st.L * folds / total);
  const n = exact.map((e) => Math.max(1, Math.floor(e)));
  let left = folds - n.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) n[order[k % S][1]]++;

  // Lay the trail.
  const pts = [];           // [x, y, hw]
  const units = [];
  const crossings = [];     // per crossing: [startX, startY, endX, endY, nx, ny]
  const push = (x, y, hw) => pts.push([x, y, hw]);
  const segment = (x0, y0, x1, y1, hw, step = 0.3) => {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= k; i++) push(x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k, hw);
  };
  let end = null;
  strokes.forEach((st, j) => {
    const nj = n[j], sk = st.sk;
    const [cx0, cy0, nx0, ny0] = skelAt(sk, 0);
    // start on the side nearest where the trail arrives from
    let sig = 1;
    if (end) {
      const dp = Math.hypot(cx0 + nx0 * HALF - end[0], cy0 + ny0 * HALF - end[1]);
      const dm = Math.hypot(cx0 - nx0 * HALF - end[0], cy0 - ny0 * HALF - end[1]);
      sig = dp <= dm ? 1 : -1;
      // the thread: through the gutter between digits, or straight
      const sx = cx0 + nx0 * HALF * sig, sy = cy0 + ny0 * HALF * sig;
      if (strokes[j - 1].slot !== st.slot) {
        segment(end[0], end[1], GUTTER_X, end[1], THREAD);
        segment(GUTTER_X, end[1], GUTTER_X, sy, THREAD);
        segment(GUTTER_X, sy, sx, sy, THREAD);
      } else segment(end[0], end[1], sx, sy, THREAD);
    } else push(cx0 + nx0 * HALF, cy0 + ny0 * HALF, LINE);
    for (let k = 0; k <= nj; k++) {
      const s = st.L * k / nj;
      const [cx, cy, nx, ny] = skelAt(sk, s);
      units.push(pts.length - 1);
      const ax = cx + nx * HALF * sig, ay = cy + ny * HALF * sig, bx = cx - nx * HALF * sig, by = cy - ny * HALF * sig;
      crossings.push([ax, ay, bx, by, nx * sig, ny * sig]);
      segment(ax, ay, bx, by, LINE);
      if (k < nj) {
        const s1 = st.L * (k + 1) / nj, m = Math.max(1, Math.ceil((s1 - s) / 0.3));
        for (let i = 1; i <= m; i++) {
          const [qx, qy, qnx, qny] = skelAt(sk, s + (s1 - s) * i / m);
          push(qx - qnx * HALF * sig, qy - qny * HALF * sig, LINE);
        }
        sig = -sig;
      }
    }
    end = pts[pts.length - 1];
  });
  // arc length along the trail
  let s = 0;
  const T = new Float32Array(pts.length * 4);
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    T[i * 4] = pts[i][0]; T[i * 4 + 1] = pts[i][1]; T[i * 4 + 2] = s; T[i * 4 + 3] = pts[i][2];
  }
  const unitS = units.map((i) => T[i * 4 + 2]);
  unitS.push(s);

  // Rasterise: each pixel keeps the nearest sample's arc and its coverage.
  const W = 160, H = 80;
  const cov = new Float32Array(W * H), arc = new Float32Array(W * H).fill(Infinity), dmin = new Float32Array(W * H).fill(Infinity);
  const thread = new Uint8Array(W * H);
  for (let i = 0; i < pts.length; i++) {
    const x = T[i * 4], y = T[i * 4 + 1], hw = T[i * 4 + 3], si = T[i * 4 + 2];
    const r = hw + 1;
    for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++)
      for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y), c = Math.min(1, hw + 0.5 - d);
        if (c <= 0) continue;
        const k = py * W + px;
        if (c > cov[k]) { cov[k] = c; thread[k] = hw < LINE ? 1 : 0; }
        if (d < dmin[k]) { dmin[k] = d; arc[k] = si; }
      }
  }
  const list = [];
  for (let k = 0; k < W * H; k++) if (cov[k] > 0.04) list.push(k);
  list.sort((a, b) => arc[a] - arc[b]);
  const pix = {
    n: list.length,
    k: Int32Array.from(list),
    s: Float32Array.from(list, (k) => arc[k]),
    cov: Float32Array.from(list, (k) => cov[k]),
    thread: Uint8Array.from(list, (k) => thread[k]),
  };

  // Pins beside every fifth crossing, at its starting end, just outside the line.
  const pins = [];
  const clash = (px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 4 || y < 4 || x > 154 || y > 74) return 9;
    let c = 0;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) c = Math.max(c, cov[(y + dy) * W + x + dx]);
    return c;
  };
  for (let m = 0; m < 60; m += 5) {
    const [ax, ay, bx, by, nx, ny] = crossings[m];
    // beyond the end the ember starts from, else beyond the other end; else
    // the nearest free spot along either side
    const cands = [[ax + nx * 3.4, ay + ny * 3.4], [bx - nx * 3.4, by - ny * 3.4]];
    for (const o of [4.4, 5.4]) cands.push([ax + nx * o, ay + ny * o], [bx - nx * o, by - ny * o]);
    let best = cands[0], bc = Infinity;
    for (const c of cands) { const v = clash(c[0], c[1]); if (v < bc - 0.05) { bc = v; best = c; } }
    pins.push({ x: best[0], y: best[1], m });
  }

  const seal = { pts: T, count: pts.length, units: unitS, length: s, pix, cov, arc, pins, crossings, pitch: total / folds, strokes: S };
  seal.start = [T[0], T[1]];
  cache.set(hh, seal);
  return seal;
}

/** The trail point at arc length s: [x, y, dx, dy] (direction of travel). */
export function trailAt(seal, s) {
  const T = seal.pts;
  let lo = 0, hi = seal.count - 1;
  if (s <= 0) return [T[0], T[1], T[4] - T[0], T[5] - T[1]];
  if (s >= T[hi * 4 + 2]) return [T[hi * 4], T[hi * 4 + 1], 0, 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m * 4 + 2] <= s) lo = m; else hi = m; }
  const f = (s - T[lo * 4 + 2]) / (T[hi * 4 + 2] - T[lo * 4 + 2] || 1);
  return [T[lo * 4] + (T[hi * 4] - T[lo * 4]) * f, T[lo * 4 + 1] + (T[hi * 4 + 1] - T[lo * 4 + 1]) * f,
    T[hi * 4] - T[lo * 4], T[hi * 4 + 1] - T[lo * 4 + 1]];
}

/** First index in pix with s >= v. */
export function pixFrom(seal, v) {
  const a = seal.pix.s;
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
  return lo;
}
