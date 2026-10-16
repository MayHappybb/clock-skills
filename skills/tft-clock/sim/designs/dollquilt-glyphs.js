// dollquilt: the running-stitch numerals, as needle paths.
//
// Each digit is one or more strokes in an 18 x 28 box, written in the order a
// hand would sew them; the last stroke ends low, so the loose end the puppy
// tugs hangs near the bottom of the digit. Every stroke is resampled to a
// polyline with arc length, and cut into stitches (dashes) that fit it
// exactly, so a stroke starts and ends on a stitch. Built once at import.

export const GW = 18, GH = 28;
const DASH = 4.4, GAP = 2.2, JUMP = 3; // stitch, gap under the cloth, travel between strokes

const D2R = Math.PI / 180;
/** Points on an ellipse arc, degrees, y down (0 = right, 90 = bottom). */
function arc(cx, cy, rx, ry, a0, a1, n = 16) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * (i / n)) * D2R;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const cat = (...parts) => parts.flat();

const STROKES = {
  0: [arc(9, 14, 7.6, 12.8, 100, 460, 28)],
  1: [[[3.5, 6.5], [9.5, 1.2], [9.5, 25.6]], [[4, 26.8], [15.5, 26.8]]],
  2: [cat(arc(9, 8.6, 7, 7.2, 195, 385, 14), [[13.4, 15.6], [2, 26.8], [16.8, 26.8]])],
  3: [cat(arc(8.6, 7.4, 7.2, 6.4, 205, 445, 16), arc(8.6, 20.2, 8, 7.2, 270, 518, 18))],
  4: [[[16.8, 19], [1.4, 19], [12.6, 1.2], [12.6, 26.8]]],
  5: [cat([[16, 1.4], [3.6, 1.4], [2.6, 12.6]], arc(8.6, 19.2, 7.8, 7.9, 228, 498, 18))],
  6: [cat([[15.4, 1.6], [10.6, 1.8], [6, 4.6], [3, 9.4], [1.6, 15.4], [1.4, 20]], arc(9, 20, 7.6, 7.2, 180, -180, 22))],
  7: [[[1.4, 1.4], [16.8, 1.4], [7, 26.8]]],
  8: [arc(9, 7.6, 6.4, 6.2, 90, 450, 18), arc(9, 20.4, 7.8, 6.8, 90, 450, 20)],
  9: [cat(arc(9, 8.4, 7.4, 7.2, 0, -360, 22), [[16.4, 15], [15, 20.5], [11, 25], [4.5, 26.8]])],
};

function resample(poly, step = 0.5) {
  const out = [[poly[0][0], poly[0][1], 0]];
  let s = 0;
  for (let i = 1; i < poly.length; i++) {
    const [x0, y0] = poly[i - 1], [x1, y1] = poly[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, s + len * u]);
    }
    s += len;
  }
  return { pts: out, len: s };
}

function build(d) {
  const strokes = [];
  const dashes = [];
  let base = 0;
  for (const poly of STROKES[d]) {
    const { pts, len } = resample(poly);
    const n = Math.max(1, Math.round((len + GAP) / (DASH + GAP)));
    const period = (len + GAP) / n, dash = period - GAP;
    for (let k = 0; k < n; k++) dashes.push({ s0: base + k * period, s1: base + k * period + dash });
    strokes.push({ base, len, pts });
    base += len + JUMP;
  }
  const L = base - JUMP;
  return { strokes, dashes, L };
}

export const GLYPHS = Object.fromEntries(Object.keys(STROKES).map((d) => [d, build(d)]));

/** Point and unit direction at arc length s along a glyph (box coordinates); `under` if s is between strokes. */
export function at(gl, s) {
  s = Math.max(0, Math.min(gl.L, s));
  let st = gl.strokes[0];
  for (const k of gl.strokes) if (s >= k.base) st = k;
  let u = s - st.base;
  const under = u > st.len;
  if (under) u = st.len;
  const p = st.pts;
  // samples are ~0.5 apart: index by length
  let i = Math.min(p.length - 1, Math.max(1, Math.round((u / st.len) * (p.length - 1))));
  while (i < p.length - 1 && p[i][2] < u) i++;
  while (i > 1 && p[i - 1][2] > u) i--;
  const a = p[i - 1], b = p[i];
  const seg = b[2] - a[2] || 1, f = Math.max(0, Math.min(1, (u - a[2]) / seg));
  const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
  return { x: a[0] + dx * f, y: a[1] + dy * f, dx: dx / dl, dy: dy / dl, under };
}
