// The numerals for mosaic.js, set as a mosaicist sets lettering: each digit
// is a skeleton (the line the craftsman's sinopia draws on the bed), and the
// tesserae are laid in rows that follow it (andamento): a centre row along
// the stroke, a lapis row either side that wraps round each terminal, a dark
// keyline row, a row of pearl-white tesserae, then rings of gold that keep
// following the letter out into the ground until they meet the straight rows
// of the field. Every tessera, its kind, row and place along the row come
// from one per-pixel pass at load; on the device these are flash tables.
//
// Per glyph and size: `map` Int16 per pixel of the padded box, (local tessera
// id << 1 | grout bit) or -1 outside the claim; `dist` Uint8 distance to the
// skeleton in 1/8 px; and a tessera table (kind, row, frac along the row,
// centre, variant, tilt).

export const K_GOLD = 0, K_MOAT = 1, K_KEY = 2, K_BODY = 3, K_CENTRE = 4;

const D2R = Math.PI / 180;

/** Points of an ellipse arc, unit coordinates, screen angles (0 right, 90 down), a0 -> a1 either way. */
function arc(cx, cy, rx, ry, a0, a1, step = 6) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const open = (pts) => ({ pts, closed: false });
const ring = (pts) => ({ pts: pts.slice(0, -1), closed: true });

// The ten skeletons on a unit box (the box the stroke's centre line spans).
// Round uncial bowls, open counters, an open-topped 4 (a closed one peaks
// into an A), a 1 with flag and foot, 6 and 9 the same figure turned.
const SIX = [ring(arc(0.5, 0.69, 0.5, 0.31, 0, 360)), open(arc(0.55, 0.69, 0.55, 0.69, 312, 180))];
const turn = (strokes) => strokes.map((s) => ({ closed: s.closed, pts: s.pts.map(([u, v]) => [1 - u, 1 - v]) }));
export const SKELETONS = [
  [ring(arc(0.5, 0.5, 0.5, 0.5, 0, 360))],
  [open([[0.12, 0.22], [0.6, 0.0], [0.6, 1.0]]), open([[0.14, 1.0], [1.0, 1.0]])],
  [open([...arc(0.5, 0.27, 0.5, 0.27, 192, 372), [0.6, 0.66], [0.0, 1.0], [1.0, 1.0]])],
  [open([...arc(0.48, 0.25, 0.46, 0.25, 206, 450), [0.3, 0.5]]), open(arc(0.5, 0.735, 0.5, 0.265, 270, 515))],
  [open([[0.2, 0.0], [0.0, 0.66], [1.0, 0.66]]), open([[0.72, 0.06], [0.72, 1.0]]), open([[0.46, 1.0], [0.98, 1.0]])],
  [open([[0.98, 0.12], [0.98, 0.0], [0.13, 0.0], [0.07, 0.44], ...arc(0.5, 0.69, 0.5, 0.31, 232, 505)])],
  SIX,
  [open([[0.0, 0.14], [0.0, 0.0], [1.0, 0.0]]), open([[1.0, 0.0], [0.8, 0.27], [0.63, 0.55], [0.53, 0.8], [0.5, 1.0]])],
  [ring(arc(0.5, 0.245, 0.42, 0.245, 0, 360)), ring(arc(0.5, 0.72, 0.5, 0.28, 0, 360))],
  turn(SIX),
];

/**
 * Build one glyph. Z: { w, h, pad, zones: [{ to, kind, L, grout }] } where
 * zones run outward from the skeleton (the first is the centre row) and the
 * last zone's `to` is the claim: beyond it the field's straight rows show.
 */
export function buildGlyph(digit, Z) {
  const { w, h, pad, zones } = Z;
  const e = zones.find((z) => z.kind === K_KEY).to;              // the keyline's outer edge fits the box
  const sx = w - 2 * e, sy = h - 2 * e;
  const strokes = SKELETONS[digit].map((s) => prep(s.pts.map(([u, v]) => [e + u * sx, e + v * sy]), s.closed));
  const lw = w + 2 * pad, lh = h + 2 * pad, claim = zones[zones.length - 1].to;
  const map = new Int16Array(lw * lh).fill(-1), dist = new Uint8Array(lw * lh).fill(255);
  const keys = new Map(), T = { kind: [], row: [], frac: [], sx: [], sy: [], n: [], stroke: [] };

  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const px = x - pad + 0.5, py = y - pad + 0.5;
      const q = nearest(strokes, px, py);
      if (q.d >= claim) continue;
      dist[y * lw + x] = Math.min(255, Math.round(q.d * 8));
      let z = 0;
      while (zones[z].to <= q.d) z++;
      const Zn = zones[z], inner = z ? zones[z - 1].to : 0;
      const st = strokes[q.k];
      // place along the row: the centre row runs along the stroke; outer rows loop round it
      let along, len;
      if (z === 0) { along = q.s; len = st.S; } else { along = q.T; len = q.Lp; }
      const nT = Math.max(1, Math.round(len / Zn.L)), L = len / nT;
      const off = st.closed || z === 0 ? (z * 0.37) % 1 : 0;
      let fj = along / L + off, j = Math.floor(fj);
      const fr = fj - j;
      j = ((j % nT) + nT) % nT;
      const sideKey = st.closed && z > 0 ? (q.side > 0 ? 1 : 2) : 0;
      const key = `${q.k}:${z}:${sideKey}:${j}`;
      let id = keys.get(key);
      if (id === undefined) {
        id = keys.size; keys.set(key, id);
        T.kind.push(Zn.kind); T.row.push(z); T.frac.push(0); T.sx.push(0); T.sy.push(0); T.n.push(0); T.stroke.push(q.k);
      }
      T.frac[id] += (along / len) % 1; T.sx[id] += x; T.sy[id] += y; T.n[id]++;
      const cutG = Zn.cut !== false && (fr * L < 0.5 || (1 - fr) * L < 0.5) && nT > 1;
      const rowG = (Zn.grout && q.d - inner < 0.5) || (zones[z + 1]?.grout && Zn.to - q.d < 0.5);
      map[y * lw + x] = (id << 1) | (cutG || rowG ? 1 : 0);
    }

  const n = keys.size;
  const tess = {
    n,
    kind: Uint8Array.from(T.kind), row: Uint8Array.from(T.row), stroke: Uint8Array.from(T.stroke),
    frac: Float32Array.from(T.frac, (v, i) => v / T.n[i]),
    cx: Float32Array.from(T.sx, (v, i) => v / T.n[i] + 0.5), cy: Float32Array.from(T.sy, (v, i) => v / T.n[i] + 0.5),
  };
  return { w, h, pad, lw, lh, map, dist, tess, strokes: strokes.length };
}

// ------------------------------------------------------------ skeleton geometry

function prep(pts, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  const seg = [];
  let S = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6;
    seg.push({ ax, ay, bx, by, dx: dx / len, dy: dy / len, len, S, th: 0, phi: 0 });
    S += len;
  }
  // turning at each vertex: phi[i] between seg i-1 and seg i; th[i] the turning before seg i
  let th = 0;
  for (let i = 0; i < seg.length; i++) {
    const p = i ? seg[i - 1] : closed ? seg[seg.length - 1] : null;
    if (p) {
      const phi = Math.atan2(p.dx * seg[i].dy - p.dy * seg[i].dx, p.dx * seg[i].dx + p.dy * seg[i].dy);
      seg[i].phi = phi;
      if (i) th += phi;
    }
    seg[i].th = th;
  }
  const thEnd = th + (closed ? seg[0].phi : 0);
  return { seg, S, closed, thEnd };
}

/** Nearest point on any stroke: distance d, stroke k, arc length s, side, loop parameter T and loop length Lp. */
function nearest(strokes, px, py) {
  let best = null, bd = Infinity;
  for (let k = 0; k < strokes.length; k++) {
    const st = strokes[k];
    for (let i = 0; i < st.seg.length; i++) {
      const g = st.seg[i];
      const u = (px - g.ax) * g.dx + (py - g.ay) * g.dy;
      const uc = u < 0 ? 0 : u > g.len ? g.len : u;
      const ex = px - g.ax - uc * g.dx, ey = py - g.ay - uc * g.dy, d = Math.hypot(ex, ey);
      if (d < bd - 1e-9) { bd = d; best = { k, i, u, uc }; }
    }
  }
  const st = strokes[best.k], sg = st.seg, g = sg[best.i], d = bd, last = sg.length - 1;
  const cr = g.dx * (py - g.ay) - g.dy * (px - g.ax);
  let side = cr >= 0 ? 1 : -1;
  let s = g.S + best.uc, th = g.th, cap = 0, psi = 0;
  if (best.u < 0 || best.u > g.len) {
    const atStart = best.u < 0;
    const vi = atStart ? best.i : best.i + 1;          // the vertex between seg vi-1 and seg vi
    const hasPrev = st.closed || vi > 0, hasNext = st.closed || vi <= last;
    if (!hasPrev || !hasNext) {
      // a terminal: rows wrap round the end
      cap = atStart ? -1 : 1;
      const vx = px - (atStart ? g.ax : g.bx), vy = py - (atStart ? g.ay : g.by);
      // angle from the + normal (-dy, dx) round the end
      const nx = -g.dy, ny = g.dx;
      const along = atStart ? -(vx * g.dx + vy * g.dy) : vx * g.dx + vy * g.dy;   // >= 0, out past the end
      const lat = vx * nx + vy * ny;                                             // + side positive
      psi = Math.atan2(along, atStart ? -lat : lat);   // end: 0 at + normal .. pi at - normal; start: 0 at - .. pi at +
      if (psi < 0) psi = 0;
      s = atStart ? 0 : st.S;
    } else {
      // a corner: interpolate the turning across the wedge (a closed loop's
      // vertex 0 is treated as its end, so the loop parameter wraps to 0)
      const wrap = vi % sg.length === 0;
      const p = sg[wrap ? last : vi - 1], nx = sg[wrap ? 0 : vi];
      const vx = px - nx.ax, vy = py - nx.ay;
      const bx = p.dx + nx.dx, by = p.dy + nx.dy;
      side = bx * vy - by * vx >= 0 ? 1 : -1;
      const n0x = -p.dy * side, n0y = p.dx * side;
      const ang = Math.abs(Math.atan2(n0x * vy - n0y * vx, n0x * vx + n0y * vy));
      const f = Math.abs(nx.phi) > 1e-6 ? Math.min(1, ang / Math.abs(nx.phi)) : 0;
      th = p.th + f * nx.phi;
      s = wrap ? st.S : nx.S;
    }
  }
  let T, Lp;
  if (st.closed) {
    T = s - side * d * th; Lp = st.S - side * d * st.thEnd;
    if (Lp < 1) Lp = 1;
    T = ((T % Lp) + Lp) % Lp;
  } else {
    const S = st.S, the = st.thEnd;
    Lp = 2 * S + 2 * Math.PI * d;
    if (cap === 1) T = S - d * the + d * psi;
    else if (cap === -1) T = 2 * S + d * Math.PI + d * psi;
    else if (side > 0) T = s - d * th;
    else T = 2 * S - s + d * Math.PI - d * th;
    T = ((T % Lp) + Lp) % Lp;
  }
  return { d, k: best.k, s, side, T, Lp };
}
