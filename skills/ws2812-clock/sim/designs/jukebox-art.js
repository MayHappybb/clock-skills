// Jukebox helpers: the bubble-tube numerals (glass tube centrelines, bent like
// a sign-shop tube, tall and condensed in the 1950s streamline manner), and a
// field builder that turns a placed glyph into per-pixel tube coordinates
// (distance from the tube axis, length along the tube from its inlet).

const D2R = Math.PI / 180;
/** Points along an ellipse arc, angles in degrees (0 = right, 90 = down). */
function E(cx, cy, rx, ry, a0, a1, n = 0) {
  n = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 6));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D2R;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
/** Quadratic bezier points. */
function Q(p0, c, p1, n = 12) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}
const cat = (...parts) => {
  const out = [];
  for (const p of parts) for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-4) out.push(q); }
  return out;
};

// Unit box: x 0..1, y 0..1 (y down). Each digit is a list of strokes (tubes).
export const GLYPHS = {
  0: [E(0.5, 0.5, 0.5, 0.5, 90, 450, 64)],
  1: [cat([[0.62, 1.0], [0.62, 0.02]], Q([0.62, 0.02], [0.42, 0.2], [0.12, 0.27], 8))],
  2: [cat(E(0.5, 0.29, 0.47, 0.29, 172, 392), Q([0.94, 0.47], [0.5, 0.72], [0.02, 1.0], 12), [[1.0, 1.0]])],
  3: [cat(E(0.47, 0.25, 0.42, 0.25, 205, 440), [[0.36, 0.5]], E(0.5, 0.73, 0.5, 0.27, 272, 515))],
  4: [cat([[0.72, 1.0], [0.72, 0.0], [0.0, 0.7], [1.0, 0.7]])],
  5: [cat([[0.96, 0.0], [0.13, 0.0], [0.07, 0.47]], E(0.48, 0.69, 0.5, 0.31, 222, 512))],
  6: [cat(E(0.78, 0.68, 0.75, 0.68, 266, 180), E(0.5, 0.68, 0.47, 0.32, 180, -180, 56))],
  7: [cat([[0.0, 0.0], [1.0, 0.0]], Q([1.0, 0.0], [0.5, 0.42], [0.36, 1.0], 14))],
  8: [E(0.5, 0.245, 0.39, 0.245, 90, 450, 48), E(0.5, 0.735, 0.5, 0.265, 270, 630, 56)],
  9: [cat(E(0.5, 0.32, 0.47, 0.32, 0, 360, 56), E(0.22, 0.32, 0.75, 0.68, 0, 86))],
};
// Narrow digits sit in a narrower box (fraction of the slot width).
const NARROW = { 1: 0.62 };

/**
 * Build the tube field of digit g placed in a slot.
 * slot: { cx, cy, w, h, r (tube radius), tilt (rad) } in pixels; W, H raster size.
 * Returns { n, idx, d, s, sid, len: [stroke lengths], ends: [[x,y],...] }.
 * s is the length along the stroke from its inlet (its lower end).
 */
export function buildField(g, slot, W, H, reach = 4) {
  const bw = slot.w * (NARROW[g] ?? 1), bh = slot.h;
  const ca = Math.cos(slot.tilt), sa = Math.sin(slot.tilt);
  const strokes = GLYPHS[g].map((st) => {
    // to pixels, around the slot centre, with tilt
    let pts = st.map(([u, v]) => {
      const lx = (u - 0.5) * bw + (0.5 - v) * bh * (slot.slant ?? 0), ly = (v - 0.5) * bh;
      return [slot.cx + lx * ca - ly * sa, slot.cy + lx * sa + ly * ca];
    });
    const a = pts[0], z = pts[pts.length - 1];
    const closed = Math.hypot(a[0] - z[0], a[1] - z[1]) < 0.5;
    if (!closed && z[1] > a[1]) pts = pts.reverse();       // inlet = the lower end
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return { pts, cum, L: cum[cum.length - 1], closed };
  });
  const R = slot.r + reach;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of strokes) for (const [x, y] of st.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 = Math.max(0, Math.floor(x0 - R)); y0 = Math.max(0, Math.floor(y0 - R));
  x1 = Math.min(W - 1, Math.ceil(x1 + R)); y1 = Math.min(H - 1, Math.ceil(y1 + R));
  const idx = [], dd = [], ss = [], sid = [], nx = [], ny = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let best = 1e9, bs = 0, bk = 0, bex = 0, bey = 0;
    for (let k = 0; k < strokes.length; k++) {
      const { pts, cum } = strokes[k];
      for (let j = 0; j + 1 < pts.length; j++) {
        const ax = pts[j][0], ay = pts[j][1], dx = pts[j + 1][0] - ax, dy = pts[j + 1][1] - ay;
        const L2 = dx * dx + dy * dy;
        let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax - t * dx, ey = y - ay - t * dy, d = ex * ex + ey * ey;
        if (d < best) { best = d; bs = cum[j] + t * Math.sqrt(L2); bk = k; bex = ex; bey = ey; }
      }
    }
    best = Math.sqrt(best);
    if (best > R) continue;
    idx.push(y * W + x); dd.push(best); ss.push(bs); sid.push(bk);
    nx.push(best > 1e-6 ? bex / best : 0); ny.push(best > 1e-6 ? bey / best : 0);
  }
  // the inlet: the lowest point of the centreline (where the feed pipe joins)
  let ix = 0, iy = -1e9;
  for (const st of strokes) for (const [x, y] of st.pts) if (y > iy + 0.3 || (Math.abs(y - iy) <= 0.3 && Math.abs(x - slot.cx) < Math.abs(ix - slot.cx))) { ix = x; iy = Math.max(y, iy); }
  const ends = [];
  for (const st of strokes) if (!st.closed) ends.push([st.pts[0], st.pts[1], 0], [st.pts[st.pts.length - 1], st.pts[st.pts.length - 2], 1]);
  return {
    n: idx.length, idx: Int32Array.from(idx), d: Float32Array.from(dd), s: Float32Array.from(ss), sid: Uint8Array.from(sid),
    nx: Float32Array.from(nx), ny: Float32Array.from(ny), y0: slot.cy - bh / 2, y1: slot.cy + bh / 2,
    len: strokes.map((s) => s.L), ends, inlet: [ix, iy],
  };
}
