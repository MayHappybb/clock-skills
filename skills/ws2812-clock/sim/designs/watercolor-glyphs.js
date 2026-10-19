// Watercolour brush numerals for the 'watercolor' face.
//
// Each digit is a list of brush strokes in writing order. A stroke is a list
// of [x, y, width] points: x, y in a unit box (0,0 top-left), width the brush
// footprint in pixels at that point (press = thick, lift = thin). Strokes are
// smoothed with Catmull-Rom and sampled every ~0.3 px.
//
// font(sx, sy, ws) is one size of the set; bake(F, digit, ox, oy) turns a
// digit placed at pixel (ox, oy) into fields over its box, which the paint
// model reads every frame (see bake). flow() adds where pigment touched into
// the wet digit travels, and when.
import * as kit from '../js/kit.js';

export const GW = 16, GH = 27, SLANT = 0.11;


const D = {
  0: [[[0.6, 0.03, 2.4], [0.3, 0.09, 3.0], [0.1, 0.32, 4.0], [0.06, 0.58, 4.5], [0.16, 0.85, 4.2], [0.45, 0.99, 3.2],
    [0.76, 0.91, 2.8], [0.93, 0.66, 2.9], [0.95, 0.38, 3.1], [0.84, 0.13, 2.8], [0.6, 0.02, 2.2], [0.42, 0.06, 1.5]]],
  1: [[[0.14, 0.24, 1.8], [0.36, 0.12, 2.6], [0.6, 0.0, 3.4], [0.6, 0.3, 4.4], [0.57, 0.66, 4.4], [0.54, 0.99, 3.4]],
    [[0.24, 0.99, 2.0], [0.55, 0.985, 3.2], [0.86, 0.99, 2.2]]],
  2: [[[0.08, 0.24, 2.2], [0.26, 0.05, 2.8], [0.55, 0.0, 3.2], [0.84, 0.12, 3.6], [0.88, 0.36, 3.9], [0.66, 0.6, 3.7],
    [0.36, 0.8, 3.4], [0.07, 0.98, 3.0]],
  [[0.05, 0.97, 3.4], [0.5, 0.94, 4.4], [0.98, 0.97, 2.4]]],
  3: [[[0.08, 0.13, 2.2], [0.38, 0.0, 3.0], [0.74, 0.05, 3.5], [0.84, 0.25, 3.6], [0.66, 0.43, 3.0], [0.38, 0.47, 2.2]],
    [[0.42, 0.46, 2.0], [0.72, 0.52, 3.2], [0.93, 0.7, 4.4], [0.84, 0.91, 4.0], [0.5, 0.99, 3.2], [0.18, 0.93, 2.6], [0.04, 0.8, 2.0]]],
  4: [[[0.68, 0.0, 3.0], [0.4, 0.32, 3.4], [0.04, 0.68, 3.0]],
    [[0.04, 0.68, 3.0], [0.5, 0.67, 3.8], [1.0, 0.66, 2.6]],
    [[0.7, 0.0, 3.2], [0.7, 0.4, 4.4], [0.68, 0.99, 3.6]]],
  5: [[[0.3, 0.03, 3.2], [0.23, 0.25, 3.8], [0.16, 0.47, 3.0]],
    [[0.18, 0.46, 2.4], [0.45, 0.38, 3.0], [0.78, 0.44, 3.6], [0.94, 0.67, 4.5], [0.82, 0.9, 4.1], [0.5, 0.99, 3.2],
      [0.18, 0.93, 2.4], [0.03, 0.8, 2.0]],
    [[0.32, 0.03, 3.0], [0.62, 0.02, 3.6], [0.95, 0.01, 2.4]]],
  6: [[[0.86, 0.07, 2.2], [0.56, 0.0, 3.0], [0.28, 0.13, 3.7], [0.1, 0.4, 4.5], [0.08, 0.7, 4.5], [0.25, 0.93, 3.7],
    [0.55, 0.99, 3.0], [0.86, 0.85, 3.4], [0.92, 0.62, 3.6], [0.72, 0.44, 3.0], [0.4, 0.45, 2.6], [0.13, 0.6, 2.0]]],
  7: [[[0.04, 0.04, 2.6], [0.5, 0.01, 3.7], [0.97, 0.03, 3.2]],
    [[0.96, 0.04, 3.4], [0.72, 0.34, 4.3], [0.5, 0.67, 4.3], [0.38, 0.99, 3.4]]],
  8: [[[0.78, 0.13, 2.2], [0.5, 0.0, 3.0], [0.22, 0.08, 3.4], [0.2, 0.28, 3.6], [0.5, 0.47, 3.6], [0.86, 0.67, 4.3],
    [0.82, 0.91, 3.8], [0.5, 0.99, 3.0], [0.15, 0.9, 3.3], [0.13, 0.67, 3.6], [0.5, 0.47, 3.2], [0.8, 0.28, 3.0],
    [0.8, 0.1, 2.4], [0.62, 0.02, 1.8]]],
  9: [[[0.88, 0.17, 2.4], [0.6, 0.02, 3.0], [0.26, 0.05, 3.6], [0.08, 0.27, 4.1], [0.22, 0.47, 3.6], [0.55, 0.52, 3.0], [0.84, 0.4, 2.6]],
    [[0.9, 0.04, 3.0], [0.91, 0.38, 4.5], [0.82, 0.7, 4.3], [0.62, 0.92, 3.6], [0.32, 0.995, 2.8], [0.1, 0.9, 2.0]]],
};

const GAP = 6;   // brush lift between strokes, in px of travel time

/** A size of the font: sx, sy scale the 16x27 box, ws the brush width. */
export function font(sx, sy, ws) { return { sx, sy, ws, w: GW * sx, h: GH * sy, paths: new Map() }; }

/** Catmull-Rom samples of one stroke in pixels, relative to the box. */
function sampleStroke(F, pts) {
  const gw = GW * F.sx, gh = GH * F.sy;
  const P = pts.map(([x, y, w]) => [x * gw + (1 - y) * gh * SLANT, y * gh, (w * F.ws) / 2]);
  const out = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.3));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), kit.lerp(p1[2], p2[2], t)]);
    }
  }
  const L = P[P.length - 1]; out.push([L[0], L[1], L[2]]);
  return out;
}

/** The brush path of a digit: samples {x, y, r, s, k, u} in box pixels. */
export function path(F, d) {
  if (F.paths.has(d)) return F.paths.get(d);
  const strokes = D[d].map((st) => sampleStroke(F, st));
  const lens = strokes.map((ss) => { let l = 0; for (let i = 1; i < ss.length; i++) l += Math.hypot(ss[i][0] - ss[i - 1][0], ss[i][1] - ss[i - 1][1]); return l; });
  const gap = GAP * F.sy;
  const total = lens.reduce((a, b) => a + b, 0) + gap * (strokes.length - 1);
  const S = []; let acc = 0;
  strokes.forEach((ss, k) => {
    let l = 0;
    for (let i = 0; i < ss.length; i++) {
      if (i) l += Math.hypot(ss[i][0] - ss[i - 1][0], ss[i][1] - ss[i - 1][1]);
      // taper: the brush lands a touch thin and lifts thin
      const u = lens[k] ? l / lens[k] : 0;
      const taper = 0.78 + 0.22 * Math.min(1, u * 6) - 0.25 * kit.smoothstep(0.82, 1, u);
      S.push({ x: ss[i][0], y: ss[i][1], r: ss[i][2] * taper, s: (acc + l) / total, k, u });
    }
    acc += lens[k] + gap;
  });
  const p = { S, total, strokes: strokes.length };
  F.paths.set(d, p);
  return p;
}

/** Brush position at digit progress p (0..1): { x, y, r, down, lift } in box pixels; down = 0 between strokes. */
export function brushOn(F, d, p, out) {
  const { S } = path(F, d);
  let lo = 0, hi = S.length - 1;
  out.lift = 0;
  if (p <= S[0].s) { out.x = S[0].x; out.y = S[0].y; out.down = 1; out.r = S[0].r; return out; }
  if (p >= S[hi].s) { out.x = S[hi].x; out.y = S[hi].y; out.down = 1; out.r = S[hi].r; return out; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].s <= p) lo = m; else hi = m; }
  const a = S[lo], b = S[hi], t = (p - a.s) / (b.s - a.s || 1);
  out.x = kit.lerp(a.x, b.x, t); out.y = kit.lerp(a.y, b.y, t); out.r = kit.lerp(a.r, b.r, t);
  out.down = a.k === b.k ? 1 : 0;
  if (!out.down) out.lift = Math.sin(Math.PI * t);
  return out;
}

const PAD = 5;
/**
 * Fields of digit d placed with its box at pixel (ox, oy):
 *   e  inner distance to the wobbled stroke edge in px (+ inside)
 *   s  brush arrival 0..1 over the digit, u  position along its own stroke
 *   m  how much of the charge colour bled in, gx/gy  unit gradient of e
 */
export function bake(F, d, ox, oy) {
  const { S } = path(F, d);
  const bw = Math.ceil(F.w + F.h * SLANT) + 2 * PAD, bh = Math.ceil(F.h) + 2 * PAD, n = bw * bh;
  const e = new Float32Array(n).fill(-9), s = new Float32Array(n), u = new Float32Array(n);
  const gx = new Float32Array(n), gy = new Float32Array(n), m = new Float32Array(n);
  const reach = 6 * F.ws, wa = 1.1 * Math.sqrt(F.ws);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = i - PAD + 0.5, py = j - PAD + 0.5;
    let best = -99, bs = 0, bu = 0, bk = 0;
    for (let q = 0; q < S.length; q++) {
      const P = S[q], dx = px - P.x, dy = py - P.y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const v = P.r - Math.sqrt(dx * dx + dy * dy);
      if (v > best) { best = v; bs = P.s; bu = P.u; bk = P.k; }
    }
    const wx = ox + px, wy = oy + py;
    // the edge of a watercolour stroke wanders with the paper's fibres
    const wob = (kit.noise2(wx * 0.55, wy * 0.55) - 0.5) * wa + (kit.noise2(wx * 1.7 + 9, wy * 1.7) - 0.5) * 0.45;
    const q = j * bw + i;
    e[q] = best + wob; s[q] = bs; u[q] = bu;
    // charge: the second pigment bleeds in toward each stroke's lift
    m[q] = kit.clamp(0.06 + 0.4 * kit.smoothstep(0.5, 1, bu) * (0.4 + kit.noise2(wx * 0.3 + bk * 3, wy * 0.3)), 0, 0.5);
  }
  for (let j = 1; j < bh - 1; j++) for (let i = 1; i < bw - 1; i++) {
    const q = j * bw + i;
    const ax = e[q + 1] - e[q - 1], ay = e[q + bw] - e[q - bw], l = Math.hypot(ax, ay) || 1;
    gx[q] = ax / l; gy[q] = ay / l;
  }
  return { d, ox: ox - PAD, oy: oy - PAD, bw, bh, e, s, u, m, gx, gy };
}

/**
 * Pigment touched into the wet digit at two points of its path (p1, p2)
 * travels through the water: g.d1 / g.d2 are travel distances from each
 * touch, in px weighted by a noisy cost (fingered fronts). Paper outside the
 * stroke costs more, so the edges feather out last. Unreachable cells get
 * the farthest distance.
 */
export function flow(F, g, p1 = 0.03, p2 = 0.6) {
  if (g.d1) return g;
  const { bw, bh, e } = g, n = bw * bh;
  const cost = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const i = q % bw, j = (q / bw) | 0, ev = e[q];
    const c = 0.65 + 0.9 * kit.noise2((g.ox + i) * 0.6 + 3, (g.oy + j) * 0.6);
    cost[q] = ev > 0 ? c : ev > -4 ? c * (1.6 + 0.6 * -ev) : 1e9;
  }
  const seed = (p) => {
    const dist = new Float32Array(n).fill(1e9);
    const pt = brushOn(F, g.d, p, {});
    const i0 = Math.round(pt.x + PAD - 0.5), j0 = Math.round(pt.y + PAD - 0.5);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++)
      if (i >= 0 && j >= 0 && i < bw && j < bh && cost[j * bw + i] < 1e8) dist[j * bw + i] = 0;
    for (let it = 0; it < 60; it++) {
      let ch = false;
      for (let pass = 0; pass < 2; pass++) for (let qq = 0; qq < n; qq++) {
        const q = pass ? n - 1 - qq : qq, c = cost[q];
        if (c > 1e8) continue;
        const i = q % bw, j = (q / bw) | 0;
        let b = dist[q];
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= bw || jj >= bh) continue;
          const v = dist[jj * bw + ii] + c * (di && dj ? 1.414 : 1);
          if (v < b) b = v;
        }
        if (b < dist[q] - 1e-4) { dist[q] = b; ch = true; }
      }
      if (!ch) break;
    }
    let mx = 0;
    for (let q = 0; q < n; q++) if (dist[q] < 1e8 && dist[q] > mx) mx = dist[q];
    for (let q = 0; q < n; q++) if (dist[q] >= 1e8) dist[q] = mx;
    return dist;
  };
  g.d1 = seed(p1); g.d2 = seed(p2);
  g.t1 = brushOn(F, g.d, p1, {}); g.t2 = brushOn(F, g.d, p2, {});
  return g;
}
