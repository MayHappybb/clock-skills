// Quicksilver digits: ten liquid letterforms drawn as centre-lines in a
// 10 x 15 unit box, then turned into signed distance rasters. Each
// continuous path is ONE polyline (hard min inside it, so curves stay even);
// separate paths meet with a smooth min, which is surface tension: every
// junction gets a liquid fillet. Stroke ends are beads (a drop is rounder
// and fatter than the stream it ends).
const arc = (cx, cy, rx, ry, a0, a1, n = 24) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
};
const bez = (p0, p1, p2, p3, n = 16) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
};
const cat = (...parts) => parts.reduce((a, p) => a.concat(a.length ? p.slice(1) : p), []);

// slightly squared oval (superellipse) for the 0
const oval = (cx, cy, rx, ry, e = 2.6, n = 64) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    out.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / e), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return out;
};

/** strokes: polylines in units; beads: [x, y, extra radius as a fraction of R] */
export const GLYPHS = {
  0: { strokes: [oval(5, 7.5, 3.35, 5.85)], beads: [] },
  1: { strokes: [cat(bez([2.4, 4.6], [3.9, 3.9], [5.3, 2.9], [5.8, 1.6]), [[5.8, 1.6], [5.8, 13.4]])],
    beads: [[2.4, 4.6, 0.35], [5.8, 13.4, 0.12]] },
  2: { strokes: [cat(arc(5, 4.9, 3.3, 3.3, 165, 360 + 25), bez([8.0, 6.3], [6.6, 9.0], [3.2, 11.0], [1.7, 13.4]), [[1.7, 13.4], [8.5, 13.4]])],
    beads: [[1.8, 5.75, 0.35], [8.5, 13.4, 0.2]] },
  3: { strokes: [cat(arc(4.9, 4.4, 3.0, 2.85, 195, 360 + 110)), cat(arc(4.8, 10.05, 3.45, 3.35, -112, 158))],
    beads: [[2.0, 3.6, 0.35], [1.6, 11.3, 0.35]] },
  4: { strokes: [[[6.7, 1.6], [6.7, 13.4]], cat([[6.7, 1.6], [1.5, 10.0]], [[1.5, 10.0], [8.6, 10.0]])],
    beads: [[6.7, 13.4, 0.15]] },
  5: { strokes: [cat([[8.3, 1.6], [2.9, 1.6]], [[2.9, 1.6], [2.5, 6.9]], arc(4.85, 9.75, 3.55, 3.55, -128, 150))],
    beads: [[8.3, 1.6, 0.3], [1.78, 11.5, 0.35]] },
  6: { strokes: [arc(5, 9.85, 3.4, 3.45, 0, 360, 40), bez([1.6, 9.85], [1.5, 4.6], [3.6, 1.7], [7.3, 1.8])],
    beads: [[7.3, 1.8, 0.35]] },
  7: { strokes: [cat([[1.6, 1.6], [8.4, 1.6]], bez([8.4, 1.6], [6.4, 4.8], [4.6, 8.8], [4.2, 13.4]))],
    beads: [[1.6, 1.6, 0.15], [4.2, 13.4, 0.3]] },
  8: { strokes: [arc(5, 4.45, 2.85, 2.85, 0, 360, 36), arc(5, 10.25, 3.3, 3.15, 0, 360, 40)], beads: [] },
  9: { strokes: [arc(5, 5.15, 3.4, 3.45, 0, 360, 40), bez([8.4, 5.15], [8.5, 10.4], [6.4, 13.3], [2.7, 13.2])],
    beads: [[2.7, 13.2, 0.35]] },
};

let segT = 0;   // where on the segment the nearest point fell (0..1)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  segT = t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const cache = new Map();
/**
 * Distance raster (px to the centre-line, beads already offset) for digit d
 * at s px per unit, padded by pad px; plus `arc`, the length along the
 * glyph's paths (px) at the nearest centre-line point, for flow along it.
 * Raster cell (i, j) is grid pixel (ox - pad + i, oy - pad + j) when the
 * glyph box's top-left sits at grid (ox, oy).
 */
export function glyphSDF(d, s, R, pad) {
  const key = `${d}|${s}|${R}|${pad}`;
  if (cache.has(key)) return cache.get(key);
  const g = GLYPHS[d], w = Math.ceil(10 * s) + 2 * pad, h = Math.ceil(15 * s) + 2 * pad;
  const out = new Float32Array(w * h), arc = new Float32Array(w * h), k = 0.55 * R;
  const strokes = g.strokes.map((pl) => pl.map(([x, y]) => [x * s, y * s]));
  const cut = 3 * R, cut2 = cut * cut;
  let run = 0;
  for (const pl of strokes) {
    // cumulative length along each path, continuing from the previous path
    pl.cum = [run];
    for (let q = 1; q < pl.length; q++) { run += Math.hypot(pl[q][0] - pl[q - 1][0], pl[q][1] - pl[q - 1][1]); pl.cum.push(run); }
    pl.bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pl) { pl.bb[0] = Math.min(pl.bb[0], x); pl.bb[1] = Math.min(pl.bb[1], y); pl.bb[2] = Math.max(pl.bb[2], x); pl.bb[3] = Math.max(pl.bb[3], y); }
  }
  const beads = g.beads.map(([x, y, e]) => [x * s, y * s, e * R]);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = i - pad, py = j - pad;
      let D = 1e9, best = 1e9, A = 0;
      for (const pl of strokes) {
        const bb = pl.bb, ex = Math.max(bb[0] - px, px - bb[2], 0), ey = Math.max(bb[1] - py, py - bb[3], 0);
        if (ex * ex + ey * ey > cut2) { if (D > 1e8) D = cut; continue; }
        let m = 1e9, mq = 1, mt = 0;
        for (let q = 1; q < pl.length; q++) {
          const v = segDist(px, py, pl[q - 1][0], pl[q - 1][1], pl[q][0], pl[q][1]);
          if (v < m) { m = v; mq = q; mt = segT; }
        }
        if (m < best) { best = m; A = pl.cum[mq - 1] + mt * (pl.cum[mq] - pl.cum[mq - 1]); }
        D = D > 1e8 ? m : smin(D, m, k);
      }
      for (const [bx, by, e] of beads) D = smin(D, Math.hypot(px - bx, py - by) - e, k * 0.6);
      out[j * w + i] = D; arc[j * w + i] = A;
    }
  }
  const r = { w, h, d: out, arc };
  cache.set(key, r);
  return r;
}
