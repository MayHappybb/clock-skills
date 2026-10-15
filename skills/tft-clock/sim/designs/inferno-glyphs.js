// Inferno's numerals: ten digits drawn as lines of fuel (centrelines with a
// width at every vertex: heavy uprights, lighter crossings, tapered flicks),
// rasterised once at load to hard 1-bit masks for two sizes. Every glyph pixel
// keeps four bytes, all flash tables on the device:
//   E  depth inside the edge (1/8 px; 0 = outside): the silhouette, and where
//      the heat shimmer may run (2 px in, so the edge stays crisp)
//   D  distance to the centreline (1/8 px): the fuse and the ignition grow from it
//   U  how far along its stroke (0..255): the fuse runs every stroke at once
//   K  burn rank (0..255): edges first, evenly over the whole digit, so it
//      thins as one and never reads as another digit
import { hash } from '../js/kit.js';

// Squircle point at angle a (degrees; 0 right, 90 down, clockwise on screen).
function sq(cx, cy, rx, ry, a, n = 2.5) {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)];
}
// An arc of squircle points from a0 to a1, width factor w0 -> w1.
function arc(cx, cy, rx, ry, a0, a1, w0 = 1, w1 = w0, step = 8, n) {
  const k = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 0; i <= k; i++) {
    const u = i / k, p = sq(cx, cy, rx, ry, a0 + (a1 - a0) * u, n);
    out.push([p[0], p[1], w0 + (w1 - w0) * u]);
  }
  return out;
}
const P = (x, y, w = 1) => [x, y, w];

// Centrelines in a unit box (the stroke's half-width is added outside it).
export const STROKES = {
  0: [arc(0.5, 0.5, 0.5, 0.5, -90, 270, 1, 1, 8, 2.6)],
  1: [[P(0.64, 0.04), P(0.64, 1)], [P(0.64, 0.03), P(0.4, 0.14, 0.8), P(0.12, 0.24, 0.45)]],
  2: [[...arc(0.5, 0.29, 0.5, 0.29, 190, 365, 0.5, 1), P(0.86, 0.52), P(0.5, 0.72), P(0.12, 0.9), P(0.02, 1, 0.9), P(1, 1, 0.9)]],
  3: [[...arc(0.48, 0.25, 0.47, 0.25, 195, 450, 0.5, 0.85), P(0.34, 0.5, 0.8)],
      [P(0.34, 0.47, 0.8), ...arc(0.5, 0.73, 0.5, 0.27, 270, 520, 0.85, 0.5)]],
  4: [[P(0.68, 0, 0.9), P(0.0, 0.68, 0.9)], [P(0.0, 0.68, 0.85), P(1, 0.68, 0.85)], [P(0.76, 0.3, 0.6), P(0.76, 0.42), P(0.76, 1)]],
  5: [[P(1, 0, 0.55), P(0.1, 0, 0.85), P(0.07, 0.47)], arc(0.48, 0.69, 0.5, 0.31, 212, 520, 0.9, 0.5)],
  6: [arc(0.5, 0.68, 0.5, 0.32, -90, 270), arc(0.56, 0.64, 0.56, 0.64, 180, 292, 1, 0.45)],
  7: [[P(0, 0, 0.6), P(0.5, 0, 0.85), P(1, 0, 0.85), P(0.62, 0.42), P(0.38, 1)]],
  8: [arc(0.5, 0.24, 0.42, 0.24, -90, 270, 0.9, 0.9), arc(0.5, 0.71, 0.5, 0.29, -90, 270)],
  9: [arc(0.5, 0.32, 0.5, 0.32, -90, 270), arc(0.44, 0.36, 0.56, 0.64, 0, 112, 1, 0.45)],
};

/**
 * Rasterise the ten digits for a box of w x h with stroke weight sw.
 * Returns { w, h, E, D, U, K } with one Uint8Array(w*h) per digit in each.
 */
export function makeGlyphs(w, h, sw) {
  const out = { w, h, sw, E: [], D: [], U: [], K: [], top: [] };
  const hw0 = sw / 2;
  for (let d = 0; d <= 9; d++) {
    // the 1 is narrower: its box is the middle of the slot
    const bx0 = d === 1 ? w * 0.18 : 0, bw = d === 1 ? w * 0.64 : w;
    const cx = (u) => bx0 + hw0 + u * (bw - sw), cy = (v) => hw0 + v * (h - sw);
    const segs = [];
    for (const st of STROKES[d]) {
      const pts = st.map(([x, y, wf]) => [cx(x), cy(y), wf]);
      let len = 0;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(len); }
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, aw] = pts[i - 1], [bx, by, bwf] = pts[i];
        const sl = Math.hypot(bx - ax, by - ay) || 1e-6;
        // uprights carry the full weight, crossings a little less
        const dirF = 0.8 + 0.2 * Math.abs(by - ay) / sl;
        segs.push({ ax, ay, bx, by, aw: aw * dirF, bw: bwf * dirF, u0: cum[i - 1] / len, u1: cum[i] / len });
      }
    }
    const E = new Uint8Array(w * h), D = new Uint8Array(w * h), U = new Uint8Array(w * h), K = new Uint8Array(w * h);
    let maxDepth = 0;
    const depth = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = -1e9, bd = 0, bu = 0;
      for (const s of segs) {
        const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - s.ax - t * dx, ey = py - s.ay - t * dy, dist = Math.hypot(ex, ey);
        const e = hw0 * (s.aw + (s.bw - s.aw) * t) - dist;
        if (e > best) { best = e; bd = dist; bu = s.u0 + (s.u1 - s.u0) * t; }
      }
      const i = y * w + x;
      if (best > 0) {
        E[i] = Math.min(255, Math.max(1, Math.round(best * 8)));
        D[i] = Math.min(255, Math.round(bd * 8));
        U[i] = Math.min(255, Math.round(bu * 255));
        depth[i] = best;
        if (best > maxDepth) maxDepth = best;
      }
    }
    // burn rank: shallow (edge) pixels first, with a grain so it chars in flecks
    for (let i = 0; i < w * h; i++) if (E[i]) {
      const r = 0.72 * (depth[i] / maxDepth) + 0.28 * (hash(i, d, 77) / 4294967296);
      K[i] = Math.min(255, Math.round(r * 255));
    }
    // topmost ink row per column (h = none)
    const top = new Int8Array(w).fill(-1);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (E[y * w + x]) { top[x] = y; break; }
    out.E.push(E); out.D.push(D); out.U.push(U); out.K.push(K); out.top.push(top);
  }
  return out;
}
