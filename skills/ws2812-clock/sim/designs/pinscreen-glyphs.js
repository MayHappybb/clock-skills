// Pinscreen numerals: drawn by a fingertip pushing pins out from behind.
// Each digit is the path the finger takes (stroke order as a hand writes it),
// in a unit box (x right, y down). A stroke is a list of smooth pieces: the
// pieces join with a corner, the strokes with a lift of the finger.
//
// buildGlyph() turns a digit into two rasters in glyph pixels (hour size):
//   prof[c]  the relief height a round fingertip leaves (0..1)
//   arc[c]   how far along the writing (0..1) the finger first covers c
// plus the finger's path samples, so the writing can be replayed.

// width of the box (fraction), then strokes -> pieces -> points
const D = {
  0: [[[[0.62, 0.03], [0.28, 0.07], [0.06, 0.4], [0.12, 0.82], [0.45, 1.0], [0.82, 0.86], [0.96, 0.5], [0.86, 0.14], [0.58, 0.02], [0.38, 0.1]]]],
  1: [[[[0.3, 0.2], [0.48, 0.1], [0.64, 0.0]], [[0.64, 0.0], [0.6, 0.5], [0.56, 1.0]]]],
  2: [[[[0.06, 0.24], [0.3, 0.03], [0.7, 0.02], [0.92, 0.26], [0.74, 0.55], [0.36, 0.8], [0.04, 0.99]], [[0.04, 0.99], [0.5, 0.97], [0.98, 0.98]]]],
  3: [[[[0.08, 0.13], [0.45, 0.0], [0.86, 0.13], [0.82, 0.36], [0.4, 0.47]], [[0.4, 0.47], [0.86, 0.6], [0.92, 0.84], [0.52, 1.0], [0.06, 0.88]]]],
  4: [[[[0.66, 0.0], [0.36, 0.34], [0.04, 0.7]], [[0.04, 0.7], [0.5, 0.7], [1.0, 0.7]]], [[[0.72, 0.3], [0.72, 0.65], [0.72, 1.0]]]],
  5: [[[[0.9, 0.02], [0.5, 0.02], [0.16, 0.02]], [[0.16, 0.02], [0.14, 0.24], [0.12, 0.46]], [[0.12, 0.46], [0.5, 0.36], [0.9, 0.56], [0.88, 0.86], [0.48, 1.0], [0.06, 0.88]]]],
  6: [[[[0.82, 0.04], [0.42, 0.14], [0.1, 0.52], [0.16, 0.9], [0.52, 1.0], [0.88, 0.8], [0.8, 0.5], [0.42, 0.44], [0.12, 0.64]]]],
  7: [[[[0.02, 0.02], [0.5, 0.02], [0.98, 0.02]], [[0.98, 0.02], [0.66, 0.46], [0.36, 1.0]]]],
  8: [[[[0.84, 0.14], [0.5, 0.0], [0.16, 0.14], [0.24, 0.38], [0.76, 0.6], [0.9, 0.86], [0.5, 1.0], [0.1, 0.86], [0.24, 0.6], [0.76, 0.38], [0.84, 0.14], [0.5, 0.0]]]],
  9: [[[[0.88, 0.22], [0.58, 0.01], [0.16, 0.06], [0.08, 0.34], [0.36, 0.52], [0.72, 0.46], [0.9, 0.22]], [[0.9, 0.22], [0.86, 0.6], [0.76, 1.0]]]],
};

/** Catmull-Rom through pts, sampled every ~step (in output units after map). */
function smoothPiece(pts, map, step, out) {
  const P = pts.map(map);
  const n = P.length;
  for (let k = 0; k + 1 < n; k++) {
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(n - 1, k + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(len / step));
    for (let s = k === 0 ? 0 : 1; s <= m; s++) {
      const t = s / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
}

/**
 * The finger path of digit d in a box w x h (glyph px), slanted.
 * Returns samples [{x, y, a, stroke}] with a = arc 0..1 (lifts cost nothing).
 */
export function fingerPath(d, w, h, slant) {
  const map = ([u, v]) => [u * w + (1 - v) * h * slant, v * h];
  const samples = [];
  let total = 0;
  D[d].forEach((stroke, si) => {
    const pts = [];
    stroke.forEach((piece, pi) => {
      const seg = [];
      smoothPiece(piece, map, 0.4, seg);
      if (pi > 0) seg.shift();
      pts.push(...seg);
    });
    pts.forEach((p, k) => {
      if (k > 0) total += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      samples.push({ x: p[0], y: p[1], a: total, stroke: si });
    });
  });
  for (const s of samples) s.a /= total;
  return { samples, length: total };
}

/**
 * Rasters of digit d at glyph scale: box w x h, fingertip radius R.
 * Raster origin is at (-pad, -pad) in glyph px; size W x H.
 */
export function buildGlyph(d, { w, h, R, slant }) {
  const path = fingerPath(d, w, h, slant);
  const pad = Math.ceil(R + 2);
  const W = Math.ceil(w + h * slant) + 2 * pad, H = Math.ceil(h) + 2 * pad;
  const prof = new Float32Array(W * H), arc = new Float32Array(W * H).fill(2);
  for (const s of path.samples) {
    const x0 = Math.max(0, Math.floor(s.x + pad - R)), x1 = Math.min(W - 1, Math.ceil(s.x + pad + R));
    const y0 = Math.max(0, Math.floor(s.y + pad - R)), y1 = Math.min(H - 1, Math.ceil(s.y + pad + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - pad - s.x, dy = y - pad - s.y, q = 1 - (dx * dx + dy * dy) / (R * R);
      if (q <= 0) continue;
      // a pressed object, not a needle: rounded shoulder, flat top
      const c = y * W + x, p = Math.sqrt(q);
      if (p > prof[c]) prof[c] = p;
      // covered once the fingertip is well over the cell
      if (q > 0.35 && s.a < arc[c]) arc[c] = s.a;
    }
  }
  // cells only grazed by the rim: take the arc of their nearest covered neighbour
  // (read from a copy, so assigned values don't cascade along the rim)
  const arc0 = arc.slice();
  for (let c = 0; c < W * H; c++) if (prof[c] > 0 && arc0[c] > 1.5) {
    let best = 2;
    const x = c % W, y = (c / W) | 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) best = Math.min(best, arc0[yy * W + xx]);
    }
    arc[c] = best > 1.5 ? 1 : best;
  }
  return { d, W, H, pad, prof, arc, path, R };
}
