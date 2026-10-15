// Billiards numerals: every digit is the same twelve balls, racked into a
// different shape. Each glyph is a skeleton (arcs and lines in a 14 x 26 box
// of ball centres); twelve balls are spread along it by arc length, then
// relaxed so no two overlap (centres >= DMIN apart) while staying on the
// skeleton. Computed once at load, deterministic.

export const N = 12;          // balls per numeral
export const DMIN = 5.15;     // centre spacing floor (ball diameter 5 + air)
export const BOX = { w: 14, h: 26 };

const line = (x0, y0, x1, y1) => {
  const pts = [], n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4));
  for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  return pts;
};
// angles in degrees, 0 = right, 90 = down (screen)
const arc = (cx, cy, rx, ry, a0, a1) => {
  const pts = [], n = Math.ceil(Math.abs(a1 - a0) / 2);
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};
const plen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
function along(p, n, closed) {
  const L = plen(p), out = [], step = closed ? L / n : L / (n - 1);
  let acc = 0, k = 0;
  for (let i = 1; i < p.length && out.length < n; i++) {
    const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    while (out.length < n && k * step <= acc + s + 1e-6) {
      const f = s ? (k * step - acc) / s : 0;
      out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]);
      k++;
    }
    acc += s;
  }
  while (out.length < n) out.push(p[p.length - 1].slice());
  return out;
}

// Each glyph: strokes [{ p: points, closed?, n }] whose n sum to N, or fixed points.
const G = {
  0: [{ p: arc(7, 13, 7, 13, -90, 270), closed: true, n: 12 }],
  1: 'fixed',
  2: [{ p: [...arc(7, 7.2, 7, 7.2, 185, 395), ...line(12.7, 11.3, 0, 26).slice(1), ...line(0, 26, 14.5, 26).slice(1)], n: 12 }],
  3: [{ p: arc(7, 6.6, 6.6, 6.6, 200, 450), n: 6 }, { p: arc(7, 19.2, 7.2, 6.8, 280, 520), n: 6 }],
  4: [{ p: [...line(10, 0, -0.5, 17.5), ...line(-0.5, 17.5, 15, 17.5).slice(1)], n: 7 }, { p: line(10, 5.6, 10, 26), n: 5 }],
  5: [{ p: [...line(14, 0, 1, 0), ...line(1, 0, 0, 11.5).slice(1)], n: 5 }, { p: arc(6.4, 18.2, 7.6, 7.8, -122, 145), n: 7 }],
  6: [{ p: arc(14.5, 19, 14, 19, 180, 248), n: 4 }, { p: arc(7, 19, 7, 7, 180, 540), closed: true, n: 8 }],
  7: [{ p: [...line(0, 0, 14, 0), ...line(14, 0, 4.5, 26).slice(1)], n: 9 }, { p: line(3.2, 13.5, 14.5, 13.5), n: 3 }],
  8: [{ p: arc(7, 5.4, 5.3, 5.4, 90, 450), closed: true, n: 6 }, { p: arc(7, 19.4, 6.7, 6.6, -90, 270), closed: true, n: 6 }],
  9: [{ p: arc(-0.5, 7, 14.5, 19, 0, 68), n: 4 }, { p: arc(7, 7, 7, 7, 0, 360), closed: true, n: 8 }],
};
// the 1 is racked two balls thick (a hex-packed column) with a flag
const ONE = (() => {
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push([5.2, i * 5.2]);
  for (let i = 0; i < 5; i++) pts.push([9.7, 2.6 + i * 5.2]);
  pts.push([0.3, 3.9]);
  return pts;
})();

function relax(pts, strokes) {
  const dense = strokes ? strokes.flatMap((s) => s.p) : null;
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], d = Math.hypot(dx, dy) || 1e-3;
      if (d < 1e-2) { pts[j][0] += 0.3; pts[j][1] += 0.1; continue; }
      if (d < DMIN) {
        const k = (DMIN - d) / d * 0.5;
        pts[i][0] -= dx * k; pts[i][1] -= dy * k; pts[j][0] += dx * k; pts[j][1] += dy * k;
      }
    }
    if (dense && it < 380) for (const q of pts) {   // back onto the skeleton
      let best = 1e9, bx = q[0], by = q[1];
      for (const s of dense) { const d = (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2; if (d < best) { best = d; bx = s[0]; by = s[1]; } }
      q[0] += (bx - q[0]) * 0.5; q[1] += (by - q[1]) * 0.5;
    }
  }
  return pts;
}

/** GLYPHS[d] = [[x, y] x 12] ball centres in the 14 x 26 box. */
export const GLYPHS = [];
for (let d = 0; d < 10; d++) {
  const g = G[d];
  if (g === 'fixed') { GLYPHS[d] = ONE.map((p) => p.slice()); continue; }
  const pts = [];
  for (const s of g) pts.push(...along(s.p, s.n, s.closed));
  GLYPHS[d] = relax(pts, g);
}
/** Smallest centre distance in each glyph (for checking). */
export const minGap = (d) => {
  let m = 1e9; const P = GLYPHS[d];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) m = Math.min(m, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  return m;
};
