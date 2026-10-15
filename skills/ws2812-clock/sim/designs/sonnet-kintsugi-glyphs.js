// Kintsugi digit paths: clean centre-line topology for each numeral, drawn
// in a 12 x 22 box (x right, y down). These are NOT the final look - the
// renderer walks each path and adds a jagged, tapering, branching "fracture"
// perpendicular jitter (sonnet-kintsugi.js), so the box only needs to carry
// correct digit topology, proportioned for a crack: narrower waist, open
// counters, no closed loops touching themselves (a real crack doesn't retrace).
// Built from straight segments and arcs (sampled to points) so every digit
// is unambiguous at a glance even before the fracture texture is added.

const W = 12, H = 22;
const deg = Math.PI / 180;
function arc(cx, cy, r, a0, a1, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * deg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
/** Elliptical arc: full-height ovals (the 0) need a taller radius than a circle gives. */
function oval(cx, cy, rx, ry, a0, a1, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * deg; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
const L = (...pts) => pts;

// Each digit: array of open polylines (paths never close on themselves).
const PATHS = {
  0: [oval(6.0, 11.0, 4.4, 9.4, -92, 268, 18)],                          // full-height oval, left open at bottom seam
  1: [L([4.2, 4.6], [7.4, 1.6], [7.0, 20.4])],
  2: [[...arc(6.1, 6.0, 4.6, 200, 400, 12), [1.4, 20.4], [10.6, 20.4]]],
  3: [[[2.0, 2.8], ...arc(5.7, 6.0, 4.3, -112, 95, 11), [2.6, 10.6]], [[2.6, 11.4], ...arc(5.7, 16.0, 5.0, -95, 100, 12), [2.0, 19.6]]],
  4: [L([7.6, 1.4], [1.6, 15.0], [10.6, 15.0]), L([7.9, 1.4], [7.9, 20.4])],
  5: [L([9.6, 1.6], [2.2, 1.6], [1.7, 9.6]), arc(6.0, 14.6, 5.6, -118, 148, 13)],
  6: [arc(6.0, 5.5, 4.2, 0, 145, 10), arc(6.0, 15.6, 5.3, -85, 275, 16)],
  7: [L([1.6, 1.8], [10.4, 1.8], [5.4, 20.4])],
  8: [arc(6.0, 6.2, 4.0, 0, 360, 14), arc(6.0, 15.2, 5.0, 0, 360, 16)],
  9: [arc(6.0, 6.8, 4.6, -10, 350, 15), L([10.1, 7.0], [6.2, 20.4])],
};

/** Flatten a digit's paths into [{pts:[[x,y]...]}] in the W x H box. */
function build(d) {
  return PATHS[d].map((pts) => ({ pts }));
}

export const BOX = { w: W, h: H };
export const GLYPHS = [];
for (let d = 0; d <= 9; d++) GLYPHS[d] = build(d);
