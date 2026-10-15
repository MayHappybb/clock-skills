// Kintsugi fracture numerals: each digit is ONE break line (a crack runs in
// one go), drawn as a centre path in a unit cell, then roughened into
// jagged micro-steps with tapering ends. Plus the ungilded hairlines that
// carry each break on to the rim, and the hour's shard pattern.
import * as kit from '../js/kit.js';

const D2R = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
}
const cat = (...parts) => {
  const o = [];
  for (const part of parts) for (const q of part) {
    const l = o[o.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.02) o.push(q);
  }
  return o;
};
const SIX = cat([[0.86, 0.06], [0.58, 0.0], [0.28, 0.08], [0.08, 0.3], [0.02, 0.6]], arc(0.5, 0.7, 0.48, 0.3, 180, -150, 8));
const NINE = SIX.map(([x, y]) => [1 - x, 1 - y]);

/** Unit-cell centre paths, y down. closed: the crack meets itself (no tapered ends). */
export const GLYPHS = {
  0: { pts: arc(0.5, 0.5, 0.5, 0.5, -100, 260, 10), closed: true },
  1: { pts: [[0.16, 0.26], [0.42, 0.1], [0.6, 0.0], [0.6, 0.5], [0.61, 1.0]] },
  2: { pts: cat(arc(0.5, 0.29, 0.47, 0.29, 170, 385, 6), [[0.6, 0.6], [0.02, 1.0], [1.0, 1.0]]) },
  3: { pts: cat(arc(0.48, 0.25, 0.44, 0.25, 195, 445, 6), arc(0.5, 0.735, 0.5, 0.265, -85, 160, 7)) },
  4: { pts: [[0.74, 1.0], [0.74, 0.5], [0.74, 0.0], [0.36, 0.36], [0.0, 0.68], [0.5, 0.68], [1.0, 0.68]] },
  5: { pts: cat([[0.94, 0.0], [0.5, 0.0], [0.16, 0.0], [0.12, 0.45]], arc(0.5, 0.69, 0.48, 0.31, 222, 515, 8)) },
  6: { pts: SIX },
  7: { pts: [[0.0, 0.0], [0.5, 0.0], [1.0, 0.0], [0.66, 0.42], [0.4, 1.0]] },
  8: { pts: cat(arc(0.5, 0.235, 0.41, 0.235, 90, 450, 9), arc(0.5, 0.725, 0.5, 0.275, 270, -90, 10)) },
  9: { pts: NINE },
};

/**
 * Turn a glyph into a fracture path in pixel space.
 * rect: { x0, y0, W, H, rot (rad) }. Returns { pts: Float32Array 2n, w: Float32Array n, cum, L, closed }.
 */
export function crackPath(digit, rect, seed, wMax) {
  const g = GLYPHS[digit];
  const cx = rect.x0 + rect.W / 2, cy = rect.y0 + rect.H / 2, cs = Math.cos(rect.rot), sn = Math.sin(rect.rot);
  const P = g.pts.map(([u, v]) => {
    const x = (u - 0.5) * rect.W, y = (v - 0.5) * rect.H;
    return [cx + x * cs - y * sn, cy + x * sn + y * cs];
  });
  if (g.closed) P.push([P[0][0], P[0][1]]);
  // resample into short straight chunks, keeping the drawn vertices
  const R = [];
  for (let k = 0; k + 1 < P.length; k++) {
    const [ax, ay] = P[k], [bx, by] = P[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 4.0));
    for (let i = 0; i < n; i++) R.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
  }
  R.push(P[P.length - 1].slice());
  const n = R.length;
  // jagged: each joint steps sideways; a slow wander on top
  const J = R.map((p) => p.slice());
  for (let i = 0; i < n; i++) {
    if (!g.closed && (i === 0 || i === n - 1)) continue;
    const a = R[Math.max(0, i - 1)], b = R[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // fractures zigzag: alternate sides, random step size
    const off = (kit.hash(seed, i, 7) - 0.5) * 1.25;
    J[i][0] += -ty * off; J[i][1] += tx * off;
  }
  if (g.closed) { J[n - 1][0] = J[0][0]; J[n - 1][1] = J[0][1]; }
  const pts = new Float32Array(2 * n), w = new Float32Array(n), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) { pts[2 * i] = J[i][0]; pts[2 * i + 1] = J[i][1]; if (i) cum[i] = cum[i - 1] + Math.hypot(J[i][0] - J[i - 1][0], J[i][1] - J[i - 1][1]); }
  const L = cum[n - 1];
  for (let i = 0; i < n; i++) {
    let k = 0.78 + 0.42 * kit.noise2(cum[i] * 0.2, seed * 0.29 + 5);
    if (!g.closed) { const e = Math.min(cum[i], L - cum[i]); k *= 0.3 + 0.7 * kit.smoothstep(0, 4.5, e); }
    w[i] = wMax * k;
  }
  return { pts, w, cum, L, closed: !!g.closed, n };
}

/**
 * Rasterise paths into per-pixel fields (64 x 64 grid). For each pixel keep
 * the nearest stroke edge: slot, e (distance to the edge, < 0 inside),
 * d (distance to the centre line), s (0..1 along the crack).
 */
export function rasterPaths(F, paths, W, H, reach = 3) {
  for (let k = 0; k < paths.length; k++) {
    const c = paths[k]; if (!c) continue;
    const { pts, w, cum, L, n } = c;
    for (let i = 0; i + 1 < n; i++) {
      const ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * i + 2], by = pts[2 * i + 3];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6, rr = Math.max(w[i], w[i + 1]) / 2 + reach;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rr)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + rr));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rr)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + rr));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + t * dx - x, py = ay + t * dy - y, d = Math.sqrt(px * px + py * py);
        const e = d - (w[i] + (w[i + 1] - w[i]) * t) / 2, p = y * W + x;
        if (e < F.e[p]) { F.e[p] = e; F.d[p] = d; F.slot[p] = c.slot; F.s[p] = (cum[i] + t * (cum[i + 1] - cum[i])) / L; }
      }
    }
  }
}

/** A hairline walking from (x, y) along (dx, dy), bending out to the rim. Stops at the rim or another crack. */
export function walkTail(x, y, dx, dy, seed, bowl, hit) {
  const pts = [x, y];
  let l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  for (let i = 0; i < 70; i++) {
    const rx = x - bowl.cx, ry = y - bowl.cy, r = Math.hypot(rx, ry) || 1;
    const j = (kit.hash(seed, i, 3) - 0.5) * 0.9;
    let nx = dx * 0.8 + (rx / r) * 0.2 - dy * j, ny = dy * 0.8 + (ry / r) * 0.2 + dx * j;
    l = Math.hypot(nx, ny); dx = nx / l; dy = ny / l;
    x += dx * 1.4; y += dy * 1.4;
    pts.push(x, y);
    if (r > bowl.ro + 0.5) break;
    if (i > 2 && hit(x, y)) break;
  }
  return pts;
}
