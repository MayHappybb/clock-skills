// Marquee-bulb numerals for the Ferris wheel's gondola sign boards.
// Each digit is a centre line (lines and elliptical arcs) in a 16 x 26 px
// box; bulbs sit on it at an even pitch, so a curve gets its bulbs spaced
// along the curve and every stroke ends on a bulb, the way a sign-maker
// drills a marquee board. 9 is 6 turned over, so the set is one family.
// Bulbs are listed in drawing order (path by path, along each path): the
// chase lights them in that order.

export const GW = 16, GH = 26, PITCH = 3.2;

const L = (x0, y0, x1, y1) => ({ k: 'l', x0, y0, x1, y1 });
// ellipse arc, angles in degrees, y down (90 = bottom), a0 -> a1 in either direction
const A = (cx, cy, rx, ry, a0, a1) => ({ k: 'a', cx, cy, rx, ry, a0, a1 });

const PATHS = {
  0: [[A(8, 13, 6.4, 11.4, -90, 270)]],
  1: [[L(4.2, 6.2, 9.2, 1.6), L(9.2, 1.6, 9.2, 24.4)], [L(4.6, 24.4, 13.8, 24.4)]],
  2: [[A(8, 7.6, 6.2, 6, 195, 375), L(14.0, 9.2, 1.8, 24.4), L(1.8, 24.4, 14.4, 24.4)]],
  3: [[A(7.8, 7.0, 5.8, 5.4, 205, 450)], [A(8, 18.2, 6.4, 6.2, -90, 155)]],
  4: [[L(11.2, 1.6, 1.6, 17.4), L(1.6, 17.4, 14.8, 17.4)], [L(11.2, 1.6, 11.2, 24.4)]],
  5: [[L(14.0, 1.6, 3.2, 1.6), L(3.2, 1.6, 2.6, 11.4), A(8, 17.2, 6.4, 7.2, -127, 145)]],
  6: [[A(8, 13, 6.4, 11.4, -40, -180), L(1.6, 13, 1.6, 17.6)], [A(8, 17.6, 6.4, 6.8, 180, 540)]],
};
PATHS[9] = PATHS[6].map((p) => p.map(flip));
PATHS[7] = [[L(1.6, 1.6, 14.4, 1.6), L(14.4, 1.6, 9.6, 12), L(9.6, 12, 7.0, 24.4)]];
PATHS[8] = [[A(8, 7.0, 5.4, 5.4, 90, 450)], [A(8, 18.3, 6.5, 6.1, -90, 270)]];

function flip(s) {
  if (s.k === 'l') return L(GW - s.x0, GH - s.y0, GW - s.x1, GH - s.y1);
  return A(GW - s.cx, GH - s.cy, s.rx, s.ry, s.a0 + 180, s.a1 + 180);
}

/** Dense polyline for one segment. */
function trace(s) {
  const pts = [];
  if (s.k === 'l') { pts.push([s.x0, s.y0], [s.x1, s.y1]); return pts; }
  const n = Math.max(8, Math.ceil(Math.abs(s.a1 - s.a0) / 3));
  for (let i = 0; i <= n; i++) {
    const a = ((s.a0 + (s.a1 - s.a0) * i / n) * Math.PI) / 180;
    pts.push([s.cx + s.rx * Math.cos(a), s.cy + s.ry * Math.sin(a)]);
  }
  return pts;
}

/** Bulbs of one digit: [{ x, y, o }] with o the chase order 0..1. */
function bulbsOf(d) {
  const out = [];
  for (const path of PATHS[d]) {
    let pts = [];
    for (const s of path) { const p = trace(s); pts = pts.length ? pts.concat(p.slice(1)) : p; }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
    const n = Math.max(1, Math.round(len / PITCH));
    const cnt = closed ? n : n + 1;
    let j = 0;
    for (let b = 0; b < cnt; b++) {
      const s = (len * b) / n;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
      const x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
      if (out.some((q) => Math.hypot(q.x - x, q.y - y) < PITCH * 0.6)) continue; // shared junction
      out.push({ x, y, o: 0 });
    }
  }
  out.forEach((q, i) => { q.o = out.length > 1 ? i / (out.length - 1) : 0; });
  return out;
}

export const BULBS = Array.from({ length: 10 }, (_, d) => bulbsOf(d));
