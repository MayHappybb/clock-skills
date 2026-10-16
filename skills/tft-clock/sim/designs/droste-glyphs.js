// Droste's numerals: a condensed, squared-off monoline face in the manner of
// the 1970s television idents (Eurostile, Microgramma) that were filmed in
// the same studios where howlaround feedback was invented. Each digit is a
// list of centre-lines in a 10 x 26 box (y down); corners are rounded by a
// quadratic fillet unless a point is marked sharp with a third element 0.
//
// The glyphs are flattened to polylines once, at import, so a frame only
// transforms points (scale, turn, move) and strokes them.

const R = 4;     // fillet radius in glyph units
const STEPS = 4; // segments per fillet

const SPEC = {
  0: [{ closed: true, pts: [[0, 0], [10, 0], [10, 26], [0, 26]] }],
  1: [{ pts: [[2, 4.5, 0], [6, 0, 0], [6, 26, 0]] }],
  2: [{ pts: [[0, 6, 0], [0, 0], [10, 0], [10, 13], [0, 13], [0, 26, 0], [10, 26, 0]] }],
  3: [{ pts: [[0, 5, 0], [0, 0], [10, 0], [10, 26], [0, 26], [0, 21, 0]] }, { pts: [[3, 13, 0], [10, 13, 0]] }],
  4: [{ pts: [[0, 0, 0], [0, 16], [10, 16, 0]] }, { pts: [[7.5, 6, 0], [7.5, 26, 0]] }],
  5: [{ pts: [[10, 0, 0], [0, 0, 0], [0, 12, 0], [10, 12], [10, 26], [0, 26], [0, 21, 0]] }],
  6: [{ pts: [[10, 0, 0], [0, 0], [0, 26], [10, 26], [10, 12], [0, 12, 0]] }],
  7: [{ pts: [[0, 0, 0], [10, 0], [10, 6], [4.5, 26, 0]] }],
  8: [{ closed: true, pts: [[1, 0], [9, 0], [9, 12.5], [1, 12.5]] }, { closed: true, pts: [[0, 12.5], [10, 12.5], [10, 26], [0, 26]] }],
  9: [{ pts: [[0, 26, 0], [10, 26], [10, 0], [0, 0], [0, 14], [10, 14, 0]] }],
};

function fillet(prev, p, next, r) {
  const ux = prev[0] - p[0], uy = prev[1] - p[1], vx = next[0] - p[0], vy = next[1] - p[1];
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  const rr = Math.min(r, lu / 2, lv / 2);
  const a = [p[0] + (ux / lu) * rr, p[1] + (uy / lu) * rr], b = [p[0] + (vx / lv) * rr, p[1] + (vy / lv) * rr];
  const out = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * p[0] + t * t * b[0], s * s * a[1] + 2 * s * t * p[1] + t * t * b[1]]);
  }
  return out;
}

function flatten({ pts, closed }) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const end = !closed && (i === 0 || i === n - 1);
    if (end || p[2] === 0) { out.push([p[0], p[1]]); continue; }
    out.push(...fillet(pts[(i - 1 + n) % n], p, pts[(i + 1) % n], R));
  }
  if (closed) out.push(out[0]);
  return out;
}

/** GLYPHS[d] = list of polylines [[x, y], ...] in the 10 x 26 box. */
export const GLYPHS = Object.fromEntries(Object.entries(SPEC).map(([d, strokes]) => [d, strokes.map(flatten)]));
export const GLYPH_W = 10, GLYPH_H = 26;
