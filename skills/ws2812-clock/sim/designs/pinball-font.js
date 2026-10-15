// Pinball insert numerals. Every digit is a centre-line path cut into the
// lamp inserts of a playfield: chevron "arrow" inserts that point along the
// stroke (and chase that way), with round "ball terminal" inserts at the
// free stroke ends - the pinball's own ball, as a typographic terminal.
//
// Designed in a 10 x 16 box (y down), drawn with coverage at any scale.
// insertMap(digit, scale) returns the inserts rasterised onto pixels,
// relative to the digit's top-left, cached.

const TAU = Math.PI * 2;

/** Points along an ellipse arc, angles in degrees (0 = right, 90 = down). */
function arc(cx, cy, rx, ry, a0, a1, step = 0.22) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180) * Math.max(rx, ry) / step));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + (a1 - a0) * (k / n)) * Math.PI / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function line(ax, ay, bx, by) { return [[ax, ay], [bx, by]]; }
/** Join point lists, dropping a duplicated joint. */
function path(...parts) {
  const out = [];
  for (const p of parts) for (const q of p) {
    const l = out[out.length - 1];
    if (l && Math.hypot(l[0] - q[0], l[1] - q[1]) < 1e-6) continue;
    out.push(q);
  }
  return out;
}
const flip = (pts) => pts.map(([x, y]) => [10 - x, 16 - y]);

// A stroke: { pts, closed, ballA, ballB } - ball terminals at its start/end.
const S = (pts, o = {}) => ({ pts, closed: false, ballA: false, ballB: false, ...o });

const SIX = [
  S(path(arc(8.9, 10.6, 7.5, 9.25, -98, -180), arc(5, 10.6, 3.6, 4.0, 180, -180)), { ballA: true }),
];

export const GLYPHS = {
  0: [S(arc(5, 8, 3.6, 6.6, -90, 270), { closed: true })],
  1: [S(path(line(2.0, 4.6, 6.0, 1.4), line(6.0, 1.4, 6.0, 14.6)), { ballA: true })],
  2: [S(path(arc(5, 4.95, 3.5, 3.55, 180, 395), line(8.17, 6.45, 1.4, 14.6), line(1.4, 14.6, 8.6, 14.6)), { ballA: true })],
  3: [
    S(arc(5, 4.55, 3.4, 3.15, 205, 450), { ballA: true }),
    S(arc(5, 11.15, 3.6, 3.45, -90, 157), { ballB: true }),
  ],
  4: [S(path(line(6.7, 14.6, 6.7, 1.4), line(6.7, 1.4, 1.4, 10.4), line(1.4, 10.4, 8.6, 10.4)))],
  5: [S(path(line(8.4, 1.4, 2.5, 1.4), line(2.5, 1.4, 2.1, 7.7), arc(5.0, 10.75, 3.6, 3.85, -128, 150)), { ballB: true })],
  6: SIX,
  7: [S(path(line(1.4, 1.4, 8.6, 1.4), arc(-6.0, 1.4, 14.6, 13.2, 0, 64)), { ballB: true })],
  8: [
    S(arc(5, 4.7, 3.15, 3.3, 90, 450), { closed: true }),
    S(arc(5, 11.05, 3.6, 3.55, -90, 270), { closed: true }),
  ],
  9: SIX.map((s) => ({ ...s, pts: flip(s.pts) })),
};

// ------------------------------------------------------------ inserts
const W = 2.75;           // stroke width (design units)
const GAP_PX = 1.5;      // black paint between inserts, in pixels at any scale
const LEN = 4.1;          // nominal arrow insert length
const RB = 1.85;          // ball terminal radius
const K = 0.6;           // chevron lean: edges trail the centre by K * |d|

/** Arc-length table of a polyline. */
function lengths(pts) {
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return s;
}
/** Nearest point on the polyline: [s along it, unsigned distance]. */
function project(pts, sl, x, y) {
  let best = Infinity, bs = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - ax - t * dx, ey = y - ay - t * dy, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; bs = sl[k - 1] + t * (sl[k] - sl[k - 1]); }
  }
  return [bs, Math.sqrt(best)];
}

/** The inserts of one digit, in design units: arrows along strokes, balls at ends. */
export function insertsOf(d, GAP = 1.2) {
  const out = [];
  let base = 0;
  for (const st of GLYPHS[d]) {
    const pts = st.pts, sl = lengths(pts), Ls = sl[sl.length - 1];
    let a = 0, b = Ls;
    if (st.ballA) { out.push({ kind: 'ball', x: pts[0][0], y: pts[0][1], order: base }); a = RB + GAP * 0.9; }
    if (st.ballB) b = Ls - RB - GAP * 0.9;
    const span = b - a;
    if (st.closed) {
      const n = Math.max(3, Math.round(Ls / (LEN + GAP)));
      const len = Ls / n - GAP;
      for (let k = 0; k < n; k++) out.push({ kind: 'arrow', st, sl, s0: k * (len + GAP) + GAP / 2, s1: k * (len + GAP) + GAP / 2 + len, order: base + k * (len + GAP), closed: Ls });
    } else {
      const n = Math.max(1, Math.round((span + GAP) / (LEN + GAP)));
      const len = (span - (n - 1) * GAP) / n;
      for (let k = 0; k < n; k++) {
        const s0 = a + k * (len + GAP);
        out.push({ kind: 'arrow', st, sl, s0, s1: s0 + len, order: base + s0 });
      }
    }
    if (st.ballB) out.push({ kind: 'ball', x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], order: base + Ls });
    base += Ls;
  }
  for (const ins of out) ins.order /= base;   // 0..1 along the whole digit
  out.sort((p, q) => p.order - q.order);
  return out;
}

/** Lamp profile of insert ins at design point (x, y), given its stroke projection (s, d); 0 = outside. */
function inside(ins, x, y, s, d) {
  if (ins.kind === 'ball') {
    const r = Math.hypot(x - ins.x, y - ins.y) / RB;
    return r < 1 ? 1 - 0.6 * r * r : 0;
  }
  if (d > W / 2) return 0;
  let u = s + K * d;
  if (ins.closed) { if (u < ins.s0) u += ins.closed; if (u > ins.s1 + ins.closed / 2) u -= ins.closed; }
  if (u <= ins.s0 || u >= ins.s1) return 0;
  const half = (ins.s1 - ins.s0) / 2, c = (u - ins.s0 - half) / half, e = d / (W / 2);
  return 1 - 0.65 * Math.min(1, 0.7 * c * c + e * e);
}

const maps = new Map();
/**
 * Inserts of digit d rasterised at `scale` pixels per design unit, with the
 * digit's top-left at pixel (0, 0) plus a sub-pixel offset (fx, fy).
 * Returns { w, h, inserts: [{ kind, order, cx, cy, px: Int16Array (x,y pairs), cov, glow }] }.
 */
export function insertMap(d, scale, fx = 0, fy = 0) {
  const key = `${d}|${scale}|${fx}|${fy}`;
  if (maps.has(key)) return maps.get(key);
  const ins = insertsOf(d, GAP_PX / scale);
  const w = Math.ceil(10 * scale + fx) + 1, h = Math.ceil(16 * scale + fy) + 1;
  const SS = 4;                                  // 4 x 4 samples a pixel
  const acc = ins.map(() => new Map());          // pixel -> [coverage, glow]
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const x = (px + (i + 0.5) / SS - fx) / scale, y = (py + (j + 0.5) / SS - fy) / scale;
      if (x < -1 || y < -1 || x > 11 || y > 17) continue;
      let lastSt = null, ps = 0, pd = 0;
      for (let k = 0; k < ins.length; k++) {
        const it = ins[k];
        if (it.kind === 'arrow' && it.st !== lastSt) { lastSt = it.st; [ps, pd] = project(it.st.pts, it.sl, x, y); }
        const g = inside(it, x, y, ps, pd);
        if (g > 0) {
          const m = acc[k], p = py * w + px, v = m.get(p) ?? [0, 0];
          v[0] += 1 / (SS * SS); v[1] += g / (SS * SS); m.set(p, v);
          break;
        }
      }
    }
  }
  const inserts = ins.map((it, k) => {
    const m = acc[k], n = m.size, pxs = new Int16Array(2 * n), cov = new Float32Array(n), glow = new Float32Array(n);
    let q = 0, sx = 0, sy = 0, sw = 0;
    for (const [p, [c, g]] of m) {
      pxs[2 * q] = p % w; pxs[2 * q + 1] = Math.floor(p / w); cov[q] = c; glow[q] = g;
      sx += (p % w) * c; sy += Math.floor(p / w) * c; sw += c; q++;
    }
    return { kind: it.kind, order: it.order, px: pxs, cov, glow, cx: sx / (sw || 1) + 0.5, cy: sy / (sw || 1) + 0.5 };
  });
  const r = { w, h, inserts };
  maps.set(key, r);
  return r;
}
export { TAU };
