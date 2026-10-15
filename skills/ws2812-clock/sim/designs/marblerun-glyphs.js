// Marble-run digits: each digit is one or two glass tubes, drawn as paths
// of marble centres in an 18 x 28 px box (marbles are ~4.3 px, so the ink
// is about 22 x 32). A tube is filled from its START (the first point) by a
// bead chain dropping in from the rail above, and drains at its lowest point.
// Parts: ['L', x0,y0, x1,y1, ...] polyline, ['A', cx,cy, rx,ry, a0,a1] arc in
// degrees (y down, so increasing angle runs clockwise on screen).

export const BOX = { w: 18, h: 28 };
export const SP = 4.5;            // marble spacing along a tube (px)

const G = {
  0: [{ closed: true, parts: [['A', 9, 14, 9, 14, -90, 270]] }],
  1: [{ parts: [['L', 2.5, 8, 7, 3.2], ['A', 10.5, 6.5, 4, 4, -145, -90], ['L', 10.5, 2.5, 10.5, 28]] }],
  2: [{ parts: [['A', 9, 8.2, 8.3, 8.2, 196, 378], ['L', 16.4, 11.5, 0.4, 28, 18, 28]] }],
  3: [{ parts: [['L', 1, 0.4, 17, 0.4, 8.2, 11], ['A', 9, 19.6, 8.6, 8.4, -96, 158]] }],
  4: [{ parts: [['L', 18, 19, 0, 19, 13.5, 0.3, 13.5, 28]] }],
  5: [{ parts: [['L', 17, 0.4, 3.2, 0.4, 2.2, 12.5], ['A', 9.2, 19.6, 8.6, 8.4, -145, 152]] }],
  6: [{ parts: [['L', 14.5, 0.3, 2.3, 14.5], ['A', 9.4, 20, 8.4, 8, 196, -98]] }],
  7: [{ parts: [['L', 0, 0.4, 18, 0.4, 13.6, 8.5, 10.4, 16.5, 8.6, 28]] }],
  8: [{ closed: true, parts: [['A', 9, 6.6, 6.6, 6.6, -90, -270], ['A', 9, 20.6, 7.4, 7.4, -90, 270], ['A', 9, 6.6, 6.6, 6.6, 90, -90]] }],
  9: [
    { parts: [['A', 10.2, 8.5, 7.8, 8.2, -62, -298]] },                      // the bowl, a C
    { parts: [['L', 17.6, 0.6, 17.6, 15], ['A', 4.6, 15, 13, 13, 0, 75]] },  // the stem
  ],
};

const H = 0.25; // resampling step (px)

function rawPoints(parts) {
  const pts = [];
  for (const p of parts) {
    if (p[0] === 'L') for (let k = 1; k + 1 < p.length; k += 2) pts.push([p[k], p[k + 1]]);
    else {
      const [, cx, cy, rx, ry, a0, a1] = p;
      const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 2));
      for (let k = 0; k <= n; k++) {
        const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
    }
  }
  return pts;
}

/** A polyline resampled at a uniform step H: { x, y, n, L, h, closed }. */
export function resample(pts, closed = false, h = H) {
  if (closed) pts = [...pts, pts[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L / h) + 1;
  const x = new Float32Array(n + 1), y = new Float32Array(n + 1);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = Math.min(k * h, L);
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1, u = (s - cum[j]) / seg;
    x[k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
    y[k] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
  }
  return { x, y, n, L, h, closed };
}

/** Point at arc length q on path P, into out[0..1]. */
export function pathAt(P, q, out) {
  if (P.closed) { q %= P.L; if (q < 0) q += P.L; } else q = q < 0 ? 0 : q > P.L ? P.L : q;
  const f = q / P.h, i = Math.min(Math.floor(f), P.n - 1), u = f - i;
  out[0] = P.x[i] + (P.x[i + 1] - P.x[i]) * u;
  out[1] = P.y[i] + (P.y[i + 1] - P.y[i]) * u;
  return out;
}

/** Digit d's tubes, placed at (ox, oy): [{ P, slots: [q], qd (drain), sx, sy (START) }]. */
export function glyph(d, ox, oy) {
  return G[d].map((st) => {
    const pts = rawPoints(st.parts).map(([x, y]) => [x + ox, y + oy]);
    const P = resample(pts, !!st.closed);
    const slots = [];
    if (P.closed) { const n = Math.round(P.L / SP), sp = P.L / n; for (let k = 0; k < n; k++) slots.push(P.L - k * sp); }
    else { const n = Math.round(P.L / SP) + 1, sp = P.L / (n - 1); for (let k = 0; k < n; k++) slots.push(P.L - k * sp); }
    // drain at the lowest point (the later one on ties)
    let best = 0;
    for (let k = 0; k <= P.n; k++) if (P.y[k] >= P.y[best] - 1e-3) best = k;
    return { P, slots, sp: slots.length > 1 ? slots[0] - slots[1] : SP, qd: Math.min(best * P.h, P.L), sx: P.x[0], sy: P.y[0] };
  });
}
