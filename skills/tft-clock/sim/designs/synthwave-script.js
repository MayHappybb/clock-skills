// synthwave-script.js: the minutes, as a neon brush script written by a laser.
//
// A monoline italic script drawn for this face: x-height 9 px, ascenders
// 16, descenders 6, a 2 px tube. Each letter is a few pen strokes; points
// marked 'c' are corners, the rest are smoothed (Catmull-Rom). A word is
// one pen path; the pen lifts between letters, and every lift costs a
// little time so the writing pauses as a hand would.
//
// buildWord() stamps the path once into a small table: for each pixel
// near the ink, the distance to the nearest point of the path and how far
// along the path that point is. The frame then only thresholds that table
// against how much of the word has been written, so the write-on, the
// retract and the glow cost a lookup per pixel. (A C port builds the same
// table per minute by stamping each 1 px segment into a 9 x 9 box.)

import { clamp } from '../js/kit.js';
import { lc } from './synthwave-chrome.js';

export const XH = 10.8;              // x-height on the glass
const SLANT = 0.24;                   // italic: x shift per px of height
const GAP = 1.9;                      // between letters
const LIFT = 7;                       // path length a pen lift costs in time
const SZ = 1.2;                       // the letters below are drawn at x-height 9; shown 20% larger

const L = {
  o: [[[4.5, -9], [1.6, -7.8], [0.3, -4], [1.7, -0.5], [4.4, 0.2], [7.1, -1.6], [7.9, -5], [6.9, -8.2], [4.5, -9.1], [3.4, -8.7]]],
  n: [[[1, -9, 'c'], [0.9, -4], [0.8, 0, 'c'], [1.2, -5], [3, -8.2], [5.2, -9.1], [7.1, -7.7], [7.5, -4], [7.4, 0, 'c']]],
  e: [[[0.9, -4.4, 'c'], [4.8, -4.7], [7.4, -6.2], [6.6, -8.6], [4.1, -9.2], [1.6, -7.9], [0.4, -4.6], [1.5, -1.1], [4.1, 0.1], [7.4, -1.2]]],
  t: [[[3.4, -14, 'c'], [2.8, -6], [2.6, -2], [3.6, -0.1], [5.9, -0.7]], [[0.2, -8.6], [6.4, -8.9]]],
  w: [[[0.3, -9], [0.9, -4.2], [2.4, -0.3], [3.8, -1.6], [5.1, -7, 'c'], [6.4, -1.6], [7.8, -0.3], [9.4, -4.2], [10.3, -9]]],
  h: [[[1.6, -16, 'c'], [1, -8], [0.5, 0, 'c'], [1.1, -5], [3, -8.2], [5.2, -9.1], [7.1, -7.7], [7.5, -4], [7.4, 0, 'c']]],
  r: [[[0.9, -9, 'c'], [0.8, -4], [0.6, 0, 'c'], [1.1, -5], [2.8, -8.2], [4.9, -9.1], [6.5, -8.4]]],
  f: [[[6.8, -14.6], [5.2, -16.1], [3.4, -15], [2.7, -10], [2.4, 0, 'c']], [[0, -8.6], [6, -8.9]]],
  u: [[[0.7, -9, 'c'], [0.6, -4], [1.5, -0.6], [3.6, 0.1], [5.9, -1.2], [7.3, -4.6], [7.5, -9, 'c'], [7.4, 0, 'c']]],
  i: [[[1.3, -9, 'c'], [1.1, -3], [1.4, -0.4], [2.8, 0]], [[1.7, -12.5], [1.9, -12.8]]],
  v: [[[0, -9], [1.5, -5], [2.9, -1], [3.8, -0.1], [4.7, -1], [6.1, -5], [7.5, -9]]],
  s: [[[6.5, -8.2], [4.6, -9.3], [2.1, -8.7], [1.3, -6.6], [2.9, -4.9], [5.5, -3.9], [6.8, -2], [5.6, -0.2], [3, 0.2], [0.5, -0.9]]],
  x: [[[0.4, -9, 'c'], [7.4, 0, 'c']], [[7.4, -9, 'c'], [0.4, 0, 'c']]],
  g: [[[7, -7.6], [5, -9.2], [2, -8.4], [0.7, -5.5], [1.5, -2.3], [4, -1.4], [6.5, -3.2], [7.3, -6.5], [7.4, -9, 'c'], [7.2, -2], [6.8, 3], [5, 5.6], [2.5, 6], [0.8, 4.7]]],
  l: [[[1.8, -16, 'c'], [1.3, -8], [1, -2], [1.6, -0.2], [3.1, 0]]],
  y: [[[0.6, -9, 'c'], [0.6, -4], [1.6, -1], [3.6, -0.4], [6, -1.6], [7.3, -5], [7.5, -9, 'c'], [7.2, -2], [6.6, 3], [4.6, 5.7], [2.2, 5.9], [0.6, 4.6]]],
  c: [[[7.2, -7.6], [5.2, -9.2], [2.3, -8.6], [0.6, -5.5], [1, -2], [3.5, 0], [6, -0.3], [7.5, -1.4]]],
  k: [[[1.6, -16, 'c'], [1, -8], [0.6, 0, 'c']], [[7, -9, 'c'], [1.2, -4.2, 'c'], [7.4, 0, 'c']]],
  '-': [[[0.6, -4.4], [5, -4.7]]],
  "'": [[[2.1, -16], [1.3, -12.6]]],
};

/** Catmull-Rom through the smooth points, straight into corners; ~0.5 px steps. */
function sampleStroke(pts) {
  const runs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i]);
    if (pts[i][2] === 'c' && i < pts.length - 1) { runs.push(cur); cur = [pts[i]]; }
  }
  runs.push(cur);
  const out = [];
  for (const run of runs) {
    const n = run.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = run[Math.max(0, i - 1)], p1 = run[i], p2 = run[i + 1], p3 = run[Math.min(n - 1, i + 2)];
      const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2));
      for (let k = out.length && i === 0 ? 1 : (i === 0 ? 0 : 1); k <= steps; k++) {
        const t = k / steps, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
  }
  return out;
}

const SAMPLED = {};
function letter(ch) {
  if (SAMPLED[ch]) return SAMPLED[ch];
  const strokes = L[ch].map((st) => sampleStroke(st.map(([x, y, c]) => [x * SZ, y * SZ, c])));
  let x1 = 0;
  for (const s of strokes) for (const [x] of s) x1 = Math.max(x1, x);
  return (SAMPLED[ch] = { strokes, w: x1 });
}

/** Minute words. */
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
export function minuteWord(m) {
  if (m === 0) return "o'clock";
  if (m < 10) return 'oh-' + ONES[m];
  if (m < 20) return TEENS[m - 10];
  return TENS[Math.floor(m / 10)] + (m % 10 ? '-' + ONES[m % 10] : '');
}

/** The number of leading letters two words share. */
export function sharedLetters(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const R = 5;   // how far from the ink the table reaches (the glow)

/**
 * Lay a word out (left edge at x = 0, baseline at y = 0, slanted) and stamp
 * its table. Returns { w, x0, y0, bw, bh, d, s, len, ends[], pen(s) }.
 */
export function buildWord(word) {
  // the pen path: a list of strokes, each a list of points, with the arc length at each point
  const strokes = [];
  let x = 0, len = 0;
  const ends = [];               // path length at the end of each letter
  for (const ch of word) {
    const lt = letter(ch);
    for (const st of lt.strokes) {
      if (strokes.length) len += LIFT;
      const pts = st.map(([px, py]) => [x + px - py * SLANT, py]);
      const ss = [len];
      for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); ss.push(len); }
      strokes.push({ pts, ss });
    }
    ends.push(len);
    x += lt.w + GAP;
  }
  const w = x - GAP + 16 * SZ * SLANT;
  const x0 = Math.floor(-R - 1), y0 = Math.floor(-16 * SZ - R - 1);
  const bw = Math.ceil(w + 2 * R + 3), bh = Math.ceil(23 * SZ + 2 * R + 2);
  // d holds squared distances while stamping; one square root per pixel at the end
  const d = new Float32Array(bw * bh).fill(9801), s = new Float32Array(bw * bh).fill(1e9);
  const R2 = R * R;
  for (const { pts, ss } of strokes)
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const i0 = Math.max(0, ((ax < bx ? ax : bx) - R - x0) | 0), i1 = Math.min(bw - 1, ((ax > bx ? ax : bx) + R - x0 + 1) | 0);
      const j0 = Math.max(0, ((ay < by ? ay : by) - R - y0) | 0), j1 = Math.min(bh - 1, ((ay > by ? ay : by) + R - y0 + 1) | 0);
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
      for (let j = j0; j <= j1; j++)
        for (let ii = i0; ii <= i1; ii++) {
          const px = x0 + ii + 0.5, py = y0 + j + 0.5;
          let u = ((px - ax) * dx + (py - ay) * dy) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = px - ax - u * dx, ey = py - ay - u * dy;
          const e = ex * ex + ey * ey;
          if (e > R2) continue;
          const k = j * bw + ii;
          // keep the nearest ink; where two passes nearly tie, the earlier one
          const sv = ss[i - 1] + u * (ss[i] - ss[i - 1]);
          if (e < d[k] * 0.8 || (e < d[k] * 1.25 + 0.3 && sv < s[k])) {
            if (e < d[k]) d[k] = e;
            s[k] = sv;
          }
        }
    }
  for (let k = 0; k < d.length; k++) d[k] = d[k] < 9801 ? Math.sqrt(d[k]) : 99;
  /** Pen position at path length p (and whether it is on the paper). */
  const pen = (p) => {
    for (const { pts, ss } of strokes) {
      if (p < ss[0]) return null;            // in a lift
      if (p <= ss[ss.length - 1]) {
        let i = 1;
        while (ss[i] < p) i++;
        const f = (p - ss[i - 1]) / (ss[i] - ss[i - 1] || 1);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      }
    }
    return null;
  };
  return { word, w, x0, y0, bw, bh, d, s, len, ends, pen };
}

/**
 * Draw the word with its baseline-left at (ox, oy), written up to path
 * length `upto`. `ink` holds the neon colours; `flick` (0..1) dims it.
 */
export function drawWord(g, Wd, ox, oy, upto, ink, { flick = 1 } = {}) {
  const ix = Math.floor(ox), fx = ox - ix;      // fractional x: blend two columns of the table
  const { x0, y0, bw, bh, d, s } = Wd;
  let scanned = 0;
  for (let j = 0; j < bh; j++) {
    const y = oy + y0 + j;
    if (y < 0 || y >= g.height) continue;
    for (let i = 0; i <= bw; i++) {
      const x = ix + x0 + i;
      if (x < 0 || x >= g.width) continue;
      scanned++;
      // the table at (i - fx): blend columns i-1 and i
      const ka = j * bw + i - 1, kb = ka + 1;
      const da = i > 0 && s[ka] <= upto ? d[ka] : 99, db = i < bw && s[kb] <= upto ? d[kb] : 99;
      const e = da * fx + db * (1 - fx);
      if (e >= R) continue;
      const bg = g.get(x, y);
      let c;
      if (e < 1.2) c = lc(ink.tube, ink.core, clamp(1.25 - e * 1.4, 0, 1) * flick);
      else if (e < 1.9) c = lc(ink.tube, lc(bg, ink.shade, 0.9), (e - 1.2) / 0.7);
      else {
        // a dark halo that clears the grid round the ink, then the glow over it
        const u = (e - 1.9) / (R - 1.9);
        c = lc(lc(bg, ink.shade, 0.9 * (1 - u * u)), ink.glow, 0.3 * (1 - u) * flick);
      }
      if (flick < 1 && e < 1.9) c = lc(lc(bg, ink.shade, 0.9), c, 0.3 + 0.7 * flick);
      g.pixel(x, y, c);
    }
  }
  g.cost.box += scanned;
  g.cost.blend += scanned;
}

/** The pen's spark at path length p. */
export function drawPen(g, Wd, ox, oy, p, ink, a = 1) {
  const q = Wd.pen(p);
  if (!q) return;
  const x = ox + q[0], y = oy + q[1];
  g.fillCircle(x, y, 2.6, ink.glow, { aa: true, a: 0.45 * a });
  g.fillCircle(x, y, 1.3, 0xffffff, { aa: true, a });
  g.thickLine(x - 4.5, y, x + 4.5, y, 0.8, 0xffffff, { aa: true, a: 0.7 * a });
  g.thickLine(x, y - 3.5, x, y + 3.5, 0.8, 0xffffff, { aa: true, a: 0.7 * a });
}
