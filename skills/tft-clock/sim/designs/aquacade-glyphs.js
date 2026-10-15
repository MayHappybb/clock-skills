// Aquacade numerals: each digit is the centre line of a "daisy chain" of
// synchronised swimmers floating on their backs, head to toe (feet hooked
// under the next girl's arms). Drawn here as skeletons in a 28 x 50 box: tall
// Art Deco numerals of round bowls and straight runs, every counter wide open,
// the chain inset 3.5 px from the box so its white splash stays inside.
//
// At load each skeleton is sampled every 0.25 px and baked into two byte maps
// over its slot (box plus a 5 px margin): the distance to the chain (quarter
// px) and the arc length of the nearest chain point (px). The splash and the
// moat are a per-pixel lookup of those maps against a per-frame table indexed
// by arc length (flash: 10 x 38 x 60 x 2 B = 45.6 KB).
//
// Each chain is split into swimmers of about 10 px; the turn's assignment of
// old swimmers to new places is solved once per digit pair at load.

export const BOX_W = 28, BOX_H = 50, MARGIN = 5;
export const SW = BOX_W + 2 * MARGIN, SH = BOX_H + 2 * MARGIN;   // slot map size
const STEP = 0.25;
const RAD = Math.PI / 180;

// ------------------------------------------------------------ skeletons

/** Points of an elliptical arc, angles in degrees (0 = right, 90 = down), a0 -> a1 either way. */
function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * RAD;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
const P = (...pts) => pts;

// Each digit: a list of strokes; each stroke a list of pieces (point lists)
// joined end to end, `closed` if it loops. Coordinates in the 28 x 50 box.
const DEF = {
  0: [{ closed: true, parts: [arc(14, 14.5, 10.5, 11, 180, 360), P([24.5, 35.5]), arc(14, 35.5, 10.5, 11, 0, 180), P([3.5, 14.5])] }],
  1: [{ parts: [P([6.5, 11.5], [16, 3.5], [16, 46.5])] }],
  2: [{ parts: [arc(14, 14, 10, 10.5, 195, 390), P([3.5, 46.5], [24.5, 46.5])] }],
  3: [{ parts: [arc(13.5, 12.6, 10, 9.1, 205, 455), arc(13.5, 34.4, 11, 12.1, 265, 520)] }],
  4: [{ parts: [P([12, 3.5], [3.5, 31.5], [24.5, 31.5])] }, { parts: [P([18.5, 14], [18.5, 46.5])] }],
  5: [{ parts: [P([23.5, 3.5], [6, 3.5], [5, 22.5]), arc(13.6, 33.2, 10.9, 11.6, 245, 520)] }],
  6: [{ parts: [arc(14.5, 24.5, 10.5, 21, 290, 180), P([3.5, 35])], tail: true },
      { closed: true, parts: [arc(14, 35, 10.5, 11.5, 180, -180)] }],
  7: [{ parts: [P([3.5, 3.5], [24.5, 3.5], [11, 46.5])] }],
  8: [{ closed: true, parts: [arc(14, 14, 9, 10.5, 90, 450), arc(14, 35.5, 10.5, 11, 270, -90)] }],
};
// 9 is the 6 turned half a turn, as Deco faces draw it.
DEF[9] = DEF[6].map((st) => ({ ...st, parts: st.parts.map((pc) => pc.map(([x, y]) => [BOX_W - x, BOX_H - y])).reverse().map((pc) => pc.slice().reverse()) }));
// The 9's tail now runs into the loop from the far end: reverse stroke order so the loop is drawn first.
DEF[9].reverse();

/** Resample a polyline every STEP px. */
function resample(pts, closed) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    let d = STEP - carry;
    while (d <= L) { out.push([ax + ((bx - ax) * d) / L, ay + ((by - ay) * d) / L]); d += STEP; }
    carry = L - (d - STEP);
  }
  return out;
}

function buildGlyph(d) {
  const strokes = [];
  let off = 0;
  for (const st of DEF[d]) {
    const pts = [];
    for (const pc of st.parts) for (const p of pc) {
      const q = pts[pts.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01) pts.push(p);
    }
    if (st.closed) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.3) pts.pop();
    }
    const smp = resample(pts, !!st.closed);
    const len = (smp.length - 1) * STEP;
    const xy = new Float32Array(smp.length * 2);
    smp.forEach(([x, y], i) => { xy[2 * i] = x; xy[2 * i + 1] = y; });
    strokes.push({ xy, n: smp.length, len, off, closed: !!st.closed });
    off += Math.ceil(len) + 2;
  }
  const total = off;

  // swimmers: about 10 px each, heads toward the start of their stroke
  const swim = [];
  for (let si = 0; si < strokes.length; si++) {
    const st = strokes[si];
    const n = Math.max(1, Math.round(st.len / 10));
    const L = st.len / n;
    for (let k = 0; k < n; k++) swim.push({ stroke: si, s: k * L, L });
  }

  // the two maps
  const N = SW * SH;
  const dist = new Uint8Array(N).fill(255), arcm = new Uint8Array(N);
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const px = x + 0.5 - MARGIN, py = y + 0.5 - MARGIN;
      let best = 1e9, bs = 0;
      for (const st of strokes)
        for (let i = 0; i < st.n; i++) {
          const dx = st.xy[2 * i] - px, dy = st.xy[2 * i + 1] - py, q = dx * dx + dy * dy;
          if (q < best) { best = q; bs = st.off + i * STEP; }
        }
      const dd = Math.sqrt(best);
      dist[y * SW + x] = Math.min(255, Math.round(dd * 4));
      arcm[y * SW + x] = Math.min(255, Math.floor(bs));
    }
  return { d, strokes, total, swim, dist, arc: arcm };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => buildGlyph(d));

/**
 * The chain point at arc `s` of stroke `st` (local arc, px), written into
 * out[o..o+3] as x, y, tx, ty (unit tangent, along the chain). Closed strokes
 * wrap; open ones extend straight past their ends.
 */
export function pointAt(st, s, out, o) {
  const xy = st.xy, last = st.n - 1;
  let f = s / STEP;
  if (st.closed) { const n = last; f %= n; if (f < 0) f += n; }
  let i = f | 0;
  if (f < 0) i = 0; else if (i >= last) i = last - 1;
  const u = f - i;
  const ax = xy[2 * i], ay = xy[2 * i + 1];
  const j = st.closed && i + 1 > last ? 0 : i + 1;
  const bx = xy[2 * j], by = xy[2 * j + 1];
  const tx = (bx - ax) / STEP, ty = (by - ay) / STEP;
  out[o] = ax + (bx - ax) * u; out[o + 1] = ay + (by - ay) * u;
  out[o + 2] = tx; out[o + 3] = ty;
}

// ------------------------------------------------------------ turn assignments

const tmp = new Float32Array(4);
function centres(g) {
  return g.swim.map((w) => { pointAt(g.strokes[w.stroke], w.s + w.L / 2, tmp, 0); return [tmp[0], tmp[1]]; });
}

/**
 * For digit a -> b: pair[i] = index of a's swimmer i in b's chain, or -1 if
 * she dives; born = b's swimmers that surface. Greedy nearest pairs.
 */
function assign(a, b) {
  const A = centres(GLYPHS[a]), B = centres(GLYPHS[b]);
  const pairs = [];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) pairs.push([Math.hypot(A[i][0] - B[j][0], A[i][1] - B[j][1]), i, j]);
  pairs.sort((p, q) => p[0] - q[0]);
  const pair = new Int8Array(A.length).fill(-1), used = new Uint8Array(B.length);
  for (const [, i, j] of pairs) if (pair[i] < 0 && !used[j]) { pair[i] = j; used[j] = 1; }
  const born = [];
  for (let j = 0; j < B.length; j++) if (!used[j]) born.push(j);
  return { pair, born };
}
export const ASSIGN = Array.from({ length: 10 }, (_, a) => Array.from({ length: 10 }, (_, b) => assign(a, b)));
