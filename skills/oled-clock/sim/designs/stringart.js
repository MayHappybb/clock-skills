// String art. Work in progress: digit set first.
import { clockFields, previousMinute, ease, clamp, progress, orbit } from '../js/kit.js';

const TAU = Math.PI * 2;
const DW = 28, DH = 50;            // numeral box
let STEP = Number(globalThis.process?.env?.STEP ?? 4.5), LSTEP = Number(globalThis.process?.env?.LSTEP ?? 4);

// ---------------------------------------------------------------- strokes
// A stroke is wound from nails. Arc: nails on the outer ellipse, each thread
// skips k nails, so the inner edge is an envelope of straight chords. Line:
// two rails of nails, the thread zigzags between them.
// Clock angles in degrees: 0 = up, clockwise.
const A = (cx, cy, rx, ry, a0, a1, w = 4.5) => ({ t: 'a', cx, cy, rx, ry, a0, a1, w, closed: a1 - a0 >= 360 });
const L = (x0, y0, x1, y1, w = 4.5) => ({ t: 'l', x0, y0, x1, y1, w });

function ept(s, a) {
  const r = (a * Math.PI) / 180;
  return [s.cx + s.rx * Math.sin(r), s.cy - s.ry * Math.cos(r)];
}

/** chords [[x0,y0,x1,y1], ...] in winding order, and nails [[x,y]...] */
function buildStroke(s) {
  const chords = [], nails = [];
  if (s.t === 'a') {
    const R = (s.rx + s.ry) / 2;
    const span = 2 * Math.acos(1 - Math.min(s.w, R * 0.9) / R) * 180 / Math.PI;
    const step = (STEP / R) * 180 / Math.PI;
    const total = s.a1 - s.a0;
    const n = Math.max(2, Math.round(total / step));
    const st = total / n;
    const k = Math.max(1, Math.round(span / st));
    const cnt = s.closed ? n : n + 1;
    for (let i = 0; i < cnt; i++) nails.push(ept(s, s.a0 + i * st));
    if (s.closed) {
      for (let i = 0; i < n; i++) { const p = nails[i], q = nails[(i + k) % n]; chords.push([p[0], p[1], q[0], q[1]]); }
    } else {
      // open arc: the span shrinks toward the ends, so the stroke tapers
      // onto its nails instead of shooting tangents off the end
      for (let c = 1; c < 2 * n; c++) {
        const i = Math.max(0, Math.ceil((c - k) / 2)), j = Math.min(n, Math.floor((c + k) / 2));
        if (j - i < 1 || (c - k) % 2 !== 0 && j - i < k && i > 0 && j < n) continue;
        const p = nails[i], q = nails[j]; chords.push([p[0], p[1], q[0], q[1]]);
      }
    }
  } else {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, h = s.w / 2;
    const n = Math.max(2, Math.round(len / LSTEP));
    const P = (i, side) => [s.x0 + (dx * i) / n + nx * h * side, s.y0 + (dy * i) / n + ny * h * side];
    for (let i = 0; i <= n; i++) { nails.push(P(i, -1)); nails.push(P(i, 1)); }
    // out along one zig, back along the other: an X lattice
    for (let i = 0; i < n; i++) { const p = P(i, i % 2 ? 1 : -1), q = P(i + 1, i % 2 ? -1 : 1); chords.push([...p, ...q]); }
    for (let i = n; i > 0; i--) { const p = P(i, i % 2 ? -1 : 1), q = P(i - 1, i % 2 ? 1 : -1); chords.push([...p, ...q]); }
  }
  return { chords, nails };
}

/** A crescent from (x0,y0) to (x1,y1) bowed by sagitta s (positive: to the
 *  left of travel on screen). Thickness is the sagitta, capped at w. */
function C(x0, y0, x1, y1, sg, w = 4.5) {
  const c = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / c, dy = (y1 - y0) / c;
  const nx = dy, ny = -dx;                       // left of travel (y down)
  const R = (c * c / 4 + sg * sg) / (2 * sg);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const cx = mx + nx * (sg - R), cy = my + ny * (sg - R), r = Math.abs(R);
  const ang = (x, y) => (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  let a0 = ang(x0, y0), a1 = ang(x1, y1);
  const aB = ang(mx + nx * sg, my + ny * sg);
  const m = (v) => ((v % 360) + 360) % 360;
  if (m(aB - a0) > m(a1 - a0)) [a0, a1] = [a1, a0];
  a1 = a0 + m(a1 - a0);
  return A(cx, cy, r, r, a0, a1, w);
}

const flip = (s) => ({ ...s, cx: DW - s.cx, cy: DH - s.cy, a0: s.a0 + 180, a1: s.a1 + 180 });

const SIX = [A(14, 36, 13.5, 13.5, 0, 360), A(27, 36, 25.5, 34, 270, 355)];
const GLYPHS = [
  [A(14, 25, 13.5, 24.5, 0, 360, 5)],
  [C(17, 49.5, 17, 0.5, 4.5), C(17, 1, 5, 13, 2.5)],
  [A(14, 14, 12.5, 12.5, -75, 135), C(22.8, 22, 1, 48, -3.5), C(1, 48.5, 28, 48.5, 3)],
  [A(14, 13, 12, 12, -70, 200), A(14, 37, 13.5, 12.5, -20, 245)],
  [C(22, 0.5, 0.5, 35, 3.5), C(0.5, 34.5, 28, 34.5, 3), C(21, 6, 21, 50, -4)],
  [C(8, 2.5, 27.5, 2.5, -3), C(8, 2, 4.5, 26, 3), A(14, 35, 13.5, 14, -50, 225)],
  SIX,
  [C(0.5, 2.5, 28, 2.5, -3), C(27.5, 2, 10, 50, 4.5)],
  [A(14, 12.5, 11.5, 12, 0, 360), A(14, 36.5, 13.5, 13.5, 0, 360)],
  SIX.map(flip),
];

const CACHE = new Map();
function strokeOf(s) {
  const key = JSON.stringify(s);
  let b = CACHE.get(key);
  if (!b) { b = { key, ...buildStroke(s) }; CACHE.set(key, b); }
  return b;
}
const DIGITS = GLYPHS.map((ss) => ss.map(strokeOf));

function drawDigit(g, d, ox, oy, opts = {}) {
  for (const st of DIGITS[d]) {
    for (const c of st.chords) g.line(ox + c[0], oy + c[1], ox + c[2], oy + c[3]);
  }
}

/** For review (out/stringart-digits.png). */
export function specimen(g, t = 0) {
  for (let d = 0; d <= 9; d++) drawDigit(g, d, 4 + (d % 5) * 34, 4 + Math.floor(d / 5) * 56);
}
export const specimenSize = { w: 176, h: 116 };

export default {
  name: 'String Art',
  blurb: 'Placeholder.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields;
    drawDigit(g, Math.floor(f.m / 10), 60, 7);
    drawDigit(g, f.m % 10, 94, 7);
  },
};
