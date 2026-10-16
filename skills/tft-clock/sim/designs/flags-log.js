// flags: the signal log. The officer of the watch lowers the glasses and
// writes what the hoist said: the time as four pencilled figures (naval
// style, no colon), and beside it a quick sketch of the two hoists.
//
// The figures are drawn handwriting: each is a few control points per
// stroke, smoothed (Catmull-Rom) once at load into a dense polyline with its
// arc length, so a frame can draw any figure part-written.

import { hex, mix, font3x5, clamp } from '../js/kit.js';
import { drawPennantIcon } from './flags-pennants.js';

// Control points in a 10 x 18 box, y down; strokes are separate pen-downs.
const HAND = {
  0: [[[6, 0.6], [2.4, 2.6], [1, 9], [2.4, 16], [5.6, 17.6], [8.6, 14], [9.2, 7], [8, 1.6], [5.2, 0.4]]],
  1: [[[2.4, 4.4], [6.4, 0.4], [6, 9], [5.4, 17.6]]],
  2: [[[1.2, 4.2], [3.6, 0.8], [7.4, 0.8], [8.8, 4.4], [6.6, 9.6], [1, 17.2], [4.6, 16.6], [9.6, 17.2]]],
  3: [[[1.4, 2.6], [4.8, 0.4], [8.6, 2.4], [7.6, 6.4], [4, 8.2], [8.8, 10.8], [8.6, 15.4], [4.6, 17.6], [0.8, 15.6]]],
  4: [[[6.6, 0.4], [3.4, 7], [0.8, 12], [5, 11.8], [10, 11.4]], [[7.6, 5.6], [7.2, 11], [6.8, 17.6]]],
  5: [[[9, 0.6], [5, 0.8], [2.4, 1]], [[2.6, 0.8], [1.8, 7.4], [5, 6.4], [8.6, 8.6], [9, 13.6], [5.6, 17.6], [1, 15.4]]],
  6: [[[8.2, 1], [4.6, 1.8], [1.6, 7.4], [1.4, 13.4], [4.6, 17.6], [8.4, 15], [8.4, 10.6], [5, 8.6], [1.6, 11.6]]],
  7: [[[0.8, 1.6], [3.4, 0.6], [9.6, 0.8], [6.4, 7], [3.4, 17.6]], [[2.6, 9], [5.2, 8.8], [8.4, 8.6]]],
  8: [[[7.8, 3.2], [5, 0.4], [1.8, 2.6], [3, 6.6], [7.4, 10], [8.6, 14.6], [5, 17.6], [1.4, 14.8], [2.6, 10.2], [7, 6.8], [8.2, 3.4], [5.4, 0.6]]],
  9: [[[8.4, 4.4], [5.2, 0.6], [1.4, 3], [2, 7.4], [6, 8], [8.6, 4.2], [8.2, 10], [6.8, 17.6]]],
};
const SLANT = 0.2;

function catmull(pts, n) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Per figure: strokes as dense polylines in the 10 x 18 box (slant applied), with cumulative lengths. */
const GLYPHS = Object.fromEntries(Object.entries(HAND).map(([d, strokes]) => {
  let total = 0;
  const ss = strokes.map((s) => {
    const pts = catmull(s, 5).map(([x, y]) => [x + (18 - y) * SLANT, y]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    total += cum[cum.length - 1];
    return { pts, cum, len: cum[cum.length - 1] };
  });
  return [d, { strokes: ss, len: total }];
}));

/**
 * Draw figure `d` scaled by k with its box top-left at (x, y), written up to
 * fraction `f` (0..1). Returns the pen tip [x, y] (or null when finished).
 */
export function drawFigure(g, d, x, y, k, f, w, col) {
  const gl = GLYPHS[d];
  let left = clamp(f, 0, 1) * gl.len, tip = null;
  for (const s of gl.strokes) {
    if (left <= 0) break;
    const pts = [];
    let i = 0;
    for (; i < s.pts.length && s.cum[i] <= left; i++) pts.push([x + s.pts[i][0] * k, y + s.pts[i][1] * k]);
    if (i < s.pts.length && i > 0) {
      const u = (left - s.cum[i - 1]) / (s.cum[i] - s.cum[i - 1]);
      const a = s.pts[i - 1], b = s.pts[i];
      pts.push([x + (a[0] + (b[0] - a[0]) * u) * k, y + (a[1] + (b[1] - a[1]) * u) * k]);
    }
    if (pts.length) g.stroke(pts, w, col, { aa: true });
    if (f < 1) tip = pts[pts.length - 1];
    left -= s.len;
  }
  return tip;
}

// ------------------------------------------------------------ the page

const PAPER = hex('efe6cc'), PAPER_EDGE = hex('c8b896'), RULE = hex('9cb2c8'), MARGIN = hex('d8857a');
const PRINT = hex('6a7a90'), LEAD = hex('3e3e4c');

/** Light on the page: day, or the red night torch. */
function pageTint(L) {
  const red = hex('e04838');
  return (c) => {
    let r = c;
    if (L.warm > 0) r = mix(r, hex('ffb070'), 0.12 * L.warm);
    if (L.dark > 0) r = mix(scale3(r, 1 - 0.35 * L.dark), red, 0.38 * L.dark);
    return r;
  };
}
function scale3(c, k) {
  return ((((c >>> 16) & 255) * k) << 16) | ((((c >>> 8) & 255) * k) << 8) | ((c & 255) * k);
}

/**
 * The log page with its top edge at screen y `top`. `entry` = { digits:
 * '1009', hoists: [[a, b], [c, d]] }; `write` 0..1 progress of the figures,
 * `sketch` 0..1 of the hoist sketch, `tick` 0..1. Returns the pen tip or null.
 */
export function drawPage(g, top, L, entry, write, sketch, tick) {
  const T = pageTint(L);
  const y = Math.round(top);
  if (y >= 80) return null;
  // the page, its edge and a soft shadow line under the edge
  g.fillRect(0, y - 1, 160, 1, T(PAPER_EDGE));
  g.fillRect(0, y, 160, 80 - y, T(PAPER));
  g.fillRect(0, y, 160, 1, T(mix(PAPER, 0xffffff, 0.5)));
  // printed form: rules, margin, column heads
  for (const ry of [9, 32, 47]) g.fillRect(0, y + ry, 160, 1, T(RULE));
  g.fillRect(14, y + 1, 1, 79, T(MARGIN));
  g.fillRect(96, y + 9, 1, 71, T(RULE));
  g.text('TIME', 18, y + 3, { font: font3x5, c: T(PRINT) });
  g.text('SIGNAL', 100, y + 3, { font: font3x5, c: T(PRINT) });
  g.text('HRS', 82, y + 3, { font: font3x5, c: T(mix(PRINT, PAPER, 0.4)) });
  // the figures: four, a wider gap between hours and minutes
  const k = 1.12, w = 1.7, col = T(LEAD);
  const xs = [20, 34, 52, 66];
  const per = 1 / 4;
  let tip = null;
  for (let i = 0; i < 4; i++) {
    const f = clamp((write - i * per) / per, 0, 1);
    if (f <= 0) break;
    const tp = drawFigure(g, entry.digits[i], xs[i], y + 11.5, k, f, w, col);
    if (tp) tip = tp;
  }
  // the sketch of the two hoists: a pencil halyard and coloured pennants, revealed left to right
  if (sketch > 0) {
    const sx = [104, 130];
    for (let h = 0; h < 2; h++) {
      const f = clamp(sketch * 2 - h, 0, 1);
      if (f <= 0) continue;
      const x = sx[h];
      g.fillRect(x - 1, y + 12, 1, Math.max(1, Math.round(17 * f)), col);
      g.clip(x, y + 10, 22 * f, 24);
      drawPennantIcon(g, entry.hoists[h][0], x, y + 12, 19, 7);
      drawPennantIcon(g, entry.hoists[h][1], x, y + 21, 19, 7);
      g.unclip();
      if (f < 1) tip = [x + 22 * f, y + 21 + 6 * Math.abs(((f * 7) % 2) - 1)];
    }
  }
  // the tick: acknowledged
  if (tick > 0) {
    const a = [[83, y + 21], [86, y + 26], [92, y + 14]];
    const f = clamp(tick, 0, 1) * 2;
    const pts = f <= 1 ? [a[0], [a[0][0] + (a[1][0] - a[0][0]) * f, a[0][1] + (a[1][1] - a[0][1]) * f]]
      : [a[0], a[1], [a[1][0] + (a[2][0] - a[1][0]) * (f - 1), a[1][1] + (a[2][1] - a[1][1]) * (f - 1)]];
    g.stroke(pts, 1.4, col, { aa: true });
    if (tick < 1) tip = pts[pts.length - 1];
  }
  return tip;
}

/** A pencil whose point is at (x, y), leaning up and right. */
export function drawPencil(g, x, y, L) {
  const T = pageTint(L);
  const dx = 0.5, dy = -0.866, nx = 0.866, ny = 0.5;
  const P = (s, o) => [x + dx * s + nx * o, y + dy * s + ny * o];
  const quad = (s0, s1, w0, w1, c) => g.fillPolygon([P(s0, -w0), P(s1, -w1), P(s1, w1), P(s0, w0)], T(c), { aa: true });
  quad(0, 2.4, 0.15, 0.7, hex('2c2c34'));
  quad(2.4, 7, 0.7, 2.1, hex('e2bc88'));
  quad(7, 40, 2.1, 2.1, hex('f0b420'));
  quad(7, 40, 0.2, 0.8, hex('c88a10'));
  quad(40, 43, 2.2, 2.2, hex('b8b8c0'));
  quad(43, 47, 2.0, 2.0, hex('e88a8a'));
}
