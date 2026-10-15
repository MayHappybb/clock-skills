// Dominoes: the numerals as domino runs. Each digit is one or two chains
// (strokes) of standing tiles, drawn as a skeleton path in a unit box and
// laid out with one tile every SP pixels of arc length. The skeletons are
// designed for this grid: straight-sided bowls, open counters at least 13 px
// wide, a flagged 1, a closed 4 with its peak at the stem (never an A).
//
// A layout is computed once per minute per slot (a few hundred float ops a
// tile) and kept as typed arrays: tile centre, unit tangent, pip values.

import { hash } from '../js/kit.js';

export const TW = 7;      // tile width across the run (px)
export const SP = 4;      // spacing of tiles along the run (px of arc)
export const ST = 3;      // a standing tile's thickness seen from above (px)
export const LF = 6;      // projected length of a fallen, shingled tile
export const LFLAT = 15;  // a tile lying flat: two 7 x 7 halves and a divider

// Paths in a unit box (x right, y down). M x y | L x y | C x1 y1 x2 y2 x y |
// E cx cy rx ry a0 a1 (degrees, screen-clockwise when a1 > a0).
const P = {
  0: { wf: 0.92, s: [{ closed: true, d: [['M', 0.5, 0], ['E', 0.5, 0.3, 0.5, 0.3, -90, 0], ['L', 1, 0.7], ['E', 0.5, 0.7, 0.5, 0.3, 0, 180], ['L', 0, 0.3], ['E', 0.5, 0.3, 0.5, 0.3, 180, 270]] }] },
  1: { wf: 0.62, s: [{ d: [['M', 0.0, 0.24], ['L', 0.78, 0], ['L', 0.78, 1]] }] },
  2: { wf: 1, s: [{ d: [['M', 0.04, 0.22], ['E', 0.5, 0.27, 0.46, 0.27, -168, 28], ['C', 0.72, 0.62, 0.22, 0.78, 0.02, 1], ['L', 1, 1]] }] },
  3: { wf: 1, s: [{ d: [['M', 0.04, 0], ['L', 0.94, 0], ['L', 0.42, 0.42], ['E', 0.5, 0.69, 0.47, 0.29, -100, 155]] }] },
  4: { wf: 1, s: [{ d: [['M', 0.74, 1], ['L', 0.74, 0], ['L', 0.0, 0.7], ['L', 1, 0.7]] }] },
  5: { wf: 1, s: [{ d: [['M', 0.94, 0], ['L', 0.1, 0], ['L', 0.06, 0.48], ['E', 0.49, 0.69, 0.47, 0.31, -150, 155]] }] },
  6: { wf: 1, s: [{ d: [['M', 0.9, 0.05], ['C', 0.5, -0.03, 0.03, 0.2, 0.03, 0.66], ['E', 0.5, 0.69, 0.47, 0.31, 180, -155]] }] },
  7: { wf: 1, s: [{ d: [['M', 0, 0], ['L', 1, 0], ['C', 0.78, 0.32, 0.5, 0.62, 0.42, 1]] }] },
  // 8: one run that crosses itself at the waist (a figure-eight, the classic
  // domino-run bridge), so the waist is an X rather than two touching rings.
  8: { wf: 0.96, s: [{ closed: true, d: [['F', (t) => {
    const a = t * 2 * Math.PI, up = a < Math.PI / 2 || a > 1.5 * Math.PI;
    return [0.5 + (up ? 0.44 : 0.5) * Math.sin(2 * a) * (up ? 1 : 1), 0.5 - 0.5 * Math.cos(a)];
  }]] }] },
};
P[9] = { wf: 1, rot: true, s: P[6].s };   // 9 is the 6 turned half round

/** Dense polyline of a path in pixels. */
function densify(d, X, Y, rot) {
  const pts = [];
  let cx = 0, cy = 0;
  const push = (u, v) => { if (rot) { u = 1 - u; v = 1 - v; } pts.push(X(u), Y(v)); };
  for (const c of d) {
    if (c[0] === 'M') { cx = c[1]; cy = c[2]; push(cx, cy); }
    else if (c[0] === 'L') {
      for (let i = 1; i <= 40; i++) { const u = i / 40; push(cx + (c[1] - cx) * u, cy + (c[2] - cy) * u); }
      cx = c[1]; cy = c[2];
    } else if (c[0] === 'C') {
      for (let i = 1; i <= 60; i++) {
        const u = i / 60, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, e = 3 * (1 - u) * u * u, f = u ** 3;
        push(a * cx + b * c[1] + e * c[3] + f * c[5], a * cy + b * c[2] + e * c[4] + f * c[6]);
      }
      cx = c[5]; cy = c[6];
    } else if (c[0] === 'F') {
      for (let i = 0; i <= 240; i++) { const [u, v] = c[1](i / 240); if (i < 240) push(u, v); cx = u; cy = v; }
    } else if (c[0] === 'E') {
      const [, ex, ey, rx, ry, a0, a1] = c, n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3));
      for (let i = 1; i <= n; i++) {
        const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
        cx = ex + rx * Math.cos(a); cy = ey + ry * Math.sin(a); push(cx, cy);
      }
    }
  }
  return pts;
}

/** Resample a dense polyline into tiles every ~SP px; returns typed arrays. */
export function tiles(pts, closed) {
  if (closed) pts = pts.concat([pts[0], pts[1]]);
  const n = pts.length / 2, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
  const len = cum[n - 1];
  const N = closed ? Math.max(3, Math.round(len / SP)) : Math.max(2, Math.round(len / SP) + 1);
  const step = closed ? len / N : len / (N - 1);
  const x = new Float32Array(N), y = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N), arc = new Float32Array(N);
  const at = (s) => {
    if (closed) s = ((s % len) + len) % len; else s = Math.max(0, Math.min(s, len));
    let j = 0;
    while (j < n - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    return [pts[2 * j] + (pts[2 * j + 2] - pts[2 * j]) * u, pts[2 * j + 1] + (pts[2 * j + 3] - pts[2 * j + 1]) * u];
  };
  for (let k = 0; k < N; k++) {
    const s = k * step;
    [x[k], y[k]] = at(s);
    const [ax, ay] = at(s - 2), [bx, by] = at(s + 2);
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    tx[k] = dx / l; ty[k] = dy / l; arc[k] = s;
  }
  return { N, x, y, tx, ty, arc, len, closed: !!closed };
}

/**
 * Lay out digit `d` in the box (x0, y0, w, h): strokes of tiles. `seed`
 * picks the pips. The last tile of an open run lies flat (showing its whole
 * face) when there is room for it; `flat` says so.
 */
export function layoutDigit(d, x0, y0, w, h, seed) {
  const g = P[d], sw = (w - TW) * g.wf, sh = h - TW;
  const ox = x0 + TW / 2 + (w - TW - sw) / 2, oy = y0 + TW / 2;
  const X = (u) => ox + u * sw, Y = (v) => oy + v * sh;
  const strokes = g.s.map((st, si) => {
    const t = tiles(densify(st.d, X, Y, g.rot), st.closed);
    t.a = new Uint8Array(t.N); t.b = new Uint8Array(t.N);
    for (let k = 0; k < t.N; k++) { const r = hash(seed, si * 97 + k, d); t.a[k] = r % 7; t.b[k] = (r >>> 8) % 7; }
    t.flat = false;
    return t;
  });
  // A flat last tile reaches LFLAT - 1 px past its base: allow it only if it
  // stays inside the box and clear of every other tile by 3 px.
  for (const s of strokes) {
    if (s.closed) continue;
    const k = s.N - 1, fx = s.x[k] + s.tx[k] * (LFLAT - 1), fy = s.y[k] + s.ty[k] * (LFLAT - 1);
    if (fx < x0 + 3 || fx > x0 + w - 3 || fy < y0 + 3 || fy > y0 + h - 3) continue;
    let ok = true;
    for (const o of strokes) for (let i = 0; i < o.N && ok; i++) {
      if (o === s && i >= k - 3) continue;
      for (let q = 3; q < LFLAT; q += 2) {
        const qx = s.x[k] + s.tx[k] * q, qy = s.y[k] + s.ty[k] * q;
        if (Math.hypot(qx - o.x[i], qy - o.y[i]) < TW + 2) { ok = false; break; }
      }
    }
    s.flat = ok;
  }
  return strokes;
}
