// Suminagashi engine: ink drops on still water, by the exact mathematics of
// marbling. A drop of radius r at c pushes every point outside it radially
//   p -> c + (p - c) * sqrt(1 + r^2 / |p - c|^2)
// (area preserving: the drop's area is added, nothing is lost). The picture
// is rendered backwards: a sample point walks back through the drops, newest
// first, until it lands inside one (that drop's ink) or reaches the water's
// own frame (the ground pattern).
//
// Units: LED pixels, (0,0) the panel's top-left corner, LED (i, j) centred
// at (i + .5, j + .5).

export const N = 64, SS = 2, W = N * SS;       // hires sample grid, 2x2 per LED

/** Catmull-Rom through pts [[x, y, w?], ...], sampled densely: [[x, y, w], ...]. */
function spline(pts, closed) {
  const P = pts.map((p) => [p[0], p[1], p[2] ?? 1]);
  const n = P.length, out = [];
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  const last = closed ? P[0] : P[n - 1];
  out.push([last[0], last[1], last[2]]);
  return out;
}

/** Points every `step(w)` px of arc length along a dense polyline. */
function walk(poly, stepOf) {
  const out = [];
  let acc = 0, need = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [ax, ay, aw] = poly[i], [bx, by, bw] = poly[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (!L) continue;
    while (acc + L >= need) {
      const t = (need - acc) / L;
      const w = aw + (bw - aw) * t;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, w]);
      need += stepOf(w);
    }
    acc += L;
  }
  return out;
}

/**
 * Drop centres for one glyph: strokes = [{ pts, closed }], in glyph px.
 * Returns [[x, y, r2, seq], ...] in drawing order.
 */
export function glyphDrops(strokes, { r = 1.47, step = 2.2, rc = 1.89, stepc = 2.8 } = {}) {
  // pass 1: clear water (surfactant) opens a lane; pass 2: ink laid in it,
  // which shoves the clear water aside into a dark margin round the stroke
  const drops = [];
  for (const [rr, st, ink] of [[rc, stepc, 0], [r, step, 1]]) {
    for (const s of strokes) {
      const dense = spline(s.pts, s.closed);
      for (const [x, y, w] of walk(dense, (w) => st * Math.sqrt(w))) drops.push([x, y, rr * rr * w * w, ink]);
    }
  }
  return drops;
}

/** Inverse of a drop at (cx, cy) with radius^2 r2 applied to a point outside it. */
export function unpush(x, y, cx, cy, r2) {
  const dx = x - cx, dy = y - cy, D2 = dx * dx + dy * dy;
  if (D2 <= r2) return [cx, cy];
  const k = Math.sqrt(1 - r2 / D2);
  return [cx + dx * k, cy + dy * k];
}

/**
 * Walk the point (x, y) back through drops[from..0] (stride 4: x, y, r2, id).
 * Returns the drop index hit (and writes u = D2/r2 there), or -1 with the
 * point's position before all of them in res[0], res[1].
 */
export function back(drops, count, x, y, res) {
  for (let k = count - 1; k >= 0; k--) {
    const o = 4 * k, r2 = drops[o + 2];
    if (r2 <= 0) continue;
    const dx = x - drops[o], dy = y - drops[o + 1], D2 = dx * dx + dy * dy;
    if (D2 < r2) { res[0] = x; res[1] = y; res[2] = D2 / r2; return k; }
    const s = Math.sqrt(1 - r2 / D2);
    x = drops[o] + dx * s; y = drops[o + 1] + dy * s;
  }
  res[0] = x; res[1] = y;
  return -1;
}

/**
 * Blocks: runs of consecutive drops, packed 9 to a block in a Float64Array
 * (s, e, x0, y0, x1, y1, cx, cy, r2). Far from its box a block acts as one
 * drop of the same area at its centroid (the far field of any set of
 * drops); near it every drop is walked exactly; blended in between.
 */
export const BS = 9;
function block(xy, s, e, out, b) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, a = 0, cx = 0, cy = 0;
  for (let k = s; k < e; k++) {
    const x = xy[4 * k], y = xy[4 * k + 1], r2 = xy[4 * k + 2];
    if (r2 <= 0) continue;
    const r = Math.sqrt(r2) + 0.5;
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    a += r2; cx += x * r2; cy += y * r2;
  }
  const o = BS * b;
  out[o] = s; out[o + 1] = e; out[o + 2] = x0; out[o + 3] = y0; out[o + 4] = x1; out[o + 5] = y1;
  out[o + 6] = a ? cx / a : 0; out[o + 7] = a ? cy / a : 0; out[o + 8] = a;
}
/** Split xy[s..e) into blocks of about `size` drops, appended at block nb; returns the new nb. */
export function blocks(xy, s, e, out, nb, size = 6) {
  const n = Math.max(1, Math.round((e - s) / size));
  for (let i = 0; i < n; i++) block(xy, s + Math.floor((e - s) * i / n), s + Math.floor((e - s) * (i + 1) / n), out, nb++);
  return nb;
}

const NEAR = 1.5, BAND = 3;
/** back() through blocks nb-1..0 (newest first). */
export function backBlocks(xy, bl, nb, x, y, res) {
  for (let b = nb - 1; b >= 0; b--) {
    const o = BS * b, R2 = bl[o + 8];
    if (R2 <= 0) continue;
    const x0 = bl[o + 2], y0 = bl[o + 3], x1 = bl[o + 4], y1 = bl[o + 5];
    const ddx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, ddy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    const dist = ddx > ddy ? ddx : ddy;
    let mx = x, my = y;
    if (dist > NEAR) {
      const cx = bl[o + 6], cy = bl[o + 7], dx = x - cx, dy = y - cy, D2 = dx * dx + dy * dy;
      const s = D2 > R2 ? Math.sqrt(1 - R2 / D2) : 0;
      mx = cx + dx * s; my = cy + dy * s;
      if (dist >= NEAR + BAND) { x = mx; y = my; continue; }
    }
    let ex = x, ey = y;
    for (let k = bl[o + 1] - 1, ks = bl[o]; k >= ks; k--) {
      const q = 4 * k, r2 = xy[q + 2];
      if (r2 <= 0) continue;
      const dx = ex - xy[q], dy = ey - xy[q + 1], D2 = dx * dx + dy * dy;
      if (D2 < r2) { res[0] = ex; res[1] = ey; res[2] = D2 / r2; return k; }
      const s = Math.sqrt(1 - r2 / D2);
      ex = xy[q] + dx * s; ey = xy[q + 1] + dy * s;
    }
    if (dist > NEAR) { const w = (dist - NEAR) / BAND; x = ex + (mx - ex) * w; y = ey + (my - ey) * w; }
    else { x = ex; y = ey; }
  }
  res[0] = x; res[1] = y;
  return -1;
}

/**
 * backBlocks for four points at once (an LED's 2x2 samples): the same walk,
 * but four independent chains interleave, so the divides and roots overlap.
 * P: [x0, y0, x1, y1, ...]; on return P holds the exit points, H the drop
 * hit (or -1; points with H >= 0 on entry are skipped), U the hit's D2/r2.
 */
/**
 * backBlocks for four points at once (an LED's 2x2 samples), over groups of
 * blocks (one group per numeral): far from a group's box the whole numeral
 * acts as one equal-area drop, near it its blocks are walked; the four
 * chains interleave, so the divides and roots overlap.
 * G: [b0, b1, x0, y0, x1, y1, cx, cy, r2] per group (blocks b0..b1).
 * P: [x0, y0, x1, y1, ...]; on return P holds the exit points, H the drop
 * hit (or -1; points with H >= 0 on entry are skipped), U the hit's D2/r2.
 */
const GFAR = 6, GBAND = 4;
export function backBlocks4(xy, bl, G, ng, P, H, U) {
  for (let g = ng - 1; g >= 0; g--) {
    const o = BS * g, R2 = G[o + 8];
    if (R2 <= 0) continue;
    const x0 = G[o + 2], y0 = G[o + 3], x1 = G[o + 4], y1 = G[o + 5], cx = G[o + 6], cy = G[o + 7];
    let sub = 0, blend = 0;
    for (let j = 0; j < 4; j++) {
      if (H[j] >= 0) continue;
      const x = P[2 * j], y = P[2 * j + 1];
      const ddx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, ddy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      const dist = ddx > ddy ? ddx : ddy;
      G4[j] = dist;
      if (dist > GFAR) {
        const dx = x - cx, dy = y - cy, D2 = dx * dx + dy * dy;
        const s = D2 > R2 ? Math.sqrt(1 - R2 / D2) : 0;
        GM[2 * j] = cx + dx * s; GM[2 * j + 1] = cy + dy * s;
        if (dist >= GFAR + GBAND) { P[2 * j] = GM[2 * j]; P[2 * j + 1] = GM[2 * j + 1]; continue; }
        blend |= 1 << j;
      }
      sub |= 1 << j;
    }
    if (!sub) continue;
    walk4(xy, bl, G[o], G[o + 1], P, H, U, sub);
    if (blend) for (let j = 0; j < 4; j++) {
      if (!(blend & (1 << j))) continue;
      const w = (G4[j] - GFAR) / GBAND;
      P[2 * j] += (GM[2 * j] - P[2 * j]) * w; P[2 * j + 1] += (GM[2 * j + 1] - P[2 * j + 1]) * w;
    }
  }
}
const G4 = new Float64Array(4), GM = new Float64Array(8);
/** A group over blocks b0..b1, appended at group ng; returns ng + 1. */
export function group(xy, bl, b0, b1, G, ng) {
  const s = bl[BS * b0], e = bl[BS * (b1 - 1) + 1];
  block(xy, s, e, G, ng);
  G[BS * ng] = b0; G[BS * ng + 1] = b1;
  return ng + 1;
}
function walk4(xy, bl, b0, b1, P, H, U, mask) {
  for (let b = b1 - 1; b >= b0; b--) {
    const o = BS * b, R2 = bl[o + 8];
    if (R2 <= 0) continue;
    const x0 = bl[o + 2], y0 = bl[o + 3], x1 = bl[o + 4], y1 = bl[o + 5], cx = bl[o + 6], cy = bl[o + 7];
    let near = 0;
    for (let j = 0; j < 4; j++) {
      if (H[j] >= 0 || !(mask & (1 << j))) continue;
      const x = P[2 * j], y = P[2 * j + 1];
      const ddx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, ddy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      const dist = ddx > ddy ? ddx : ddy;
      D4[j] = dist;
      if (dist > NEAR) {
        const dx = x - cx, dy = y - cy, D2 = dx * dx + dy * dy;
        const s = D2 > R2 ? Math.sqrt(1 - R2 / D2) : 0;
        M4[2 * j] = cx + dx * s; M4[2 * j + 1] = cy + dy * s;
        if (dist >= NEAR + BAND) { P[2 * j] = M4[2 * j]; P[2 * j + 1] = M4[2 * j + 1]; continue; }
      }
      near |= 1 << j;
    }
    if (!near) continue;
    for (let k = bl[o + 1] - 1, ks = bl[o]; k >= ks; k--) {
      const q = 4 * k, r2 = xy[q + 2];
      if (r2 <= 0) continue;
      const qx = xy[q], qy = xy[q + 1];
      for (let j = 0; j < 4; j++) {
        if (!(near & (1 << j))) continue;
        const dx = P[2 * j] - qx, dy = P[2 * j + 1] - qy, D2 = dx * dx + dy * dy;
        if (D2 < r2) { H[j] = k; U[j] = D2 / r2; near &= ~(1 << j); continue; }
        const s = Math.sqrt(1 - r2 / D2);
        P[2 * j] = qx + dx * s; P[2 * j + 1] = qy + dy * s;
      }
      if (!near) break;
    }
    for (let j = 0; j < 4; j++) {
      if (!(near & (1 << j)) || D4[j] <= NEAR) continue;
      const w = (D4[j] - NEAR) / BAND;
      P[2 * j] += (M4[2 * j] - P[2 * j]) * w; P[2 * j + 1] += (M4[2 * j + 1] - P[2 * j + 1]) * w;
    }
  }
}
const D4 = new Float64Array(4), M4 = new Float64Array(8);
