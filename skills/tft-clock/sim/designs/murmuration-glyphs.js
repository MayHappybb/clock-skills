// Murmuration: the ten flock numerals. Each digit is one to three swelling
// ribbons (the shapes a murmuration actually makes: thick in the middle,
// tapering to streaming ends, loops that circulate), drawn on a 22 x 42 box
// and slanted like a flight path leaning into the wind. Closed bowls (0, 8,
// the bowl of 9) are loops the birds fly round and round; open strokes carry
// density waves. Counters are kept wide (the flock feathers at its edge).
//
// Built at load into flash tables: each stroke resampled every half pixel
// (position, normal, half-width, wave envelope), and each digit's birds as (stroke, arc
// position, offset across the ribbon, seed). ~6.6 birds per pixel of stroke.

import { rand } from '../js/kit.js';

export const GW = 22, GH = 42, SLANT = 0.15, STEP = 0.5;
export const BPL = 6.6;            // birds per pixel of stroke length
export const WSCALE = 1.45;        // ribbon width scale

const TAU = Math.PI * 2;
function ellipse(cx, cy, rx, ry, w0, w1, rot = 0.35, n = 48) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    // stress: thick on the sides (a near 0 or pi), turned a little for the slant
    const st = Math.abs(Math.cos(a - rot)) ** 1.3;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), w0 + (w1 - w0) * st]);
  }
  return { pts, closed: true, smooth: false };
}
const open = (pts) => ({ pts, closed: false, smooth: true });

export const DEFS = [
  // 0
  [ellipse(11, 21, 9.2, 19.6, 3.0, 6.6)],
  // 1
  [open([[12.6, 0.6, 3.4], [12.3, 10, 5.4], [12.0, 21, 6.6], [11.6, 32, 6.0], [11.3, 41.4, 3.6]]),
   open([[12.6, 1.0, 3.8], [10.4, 4.2, 3.4], [8.2, 8.2, 2.2]])],
  // 2
  [open([[2.4, 9.5, 2.6], [5.2, 3.2, 4.2], [11, 0.6, 5.2], [17, 2.2, 5.8], [20.2, 8.4, 6.2], [18.6, 16.2, 6.2], [13.4, 23.6, 5.6], [7.4, 31.6, 5.0], [2.2, 40.6, 4.2]]),
   open([[1.4, 41, 3.8], [8, 40.6, 5.2], [14.5, 40.9, 5.0], [21.4, 41.4, 3.0]])],
  // 3
  [open([[1.8, 6.5, 2.6], [6.8, 1.2, 4.4], [13.6, 0.6, 5.2], [19.4, 4.8, 5.6], [19.0, 11.8, 5.6], [14.2, 17.8, 4.6], [8.6, 20.4, 3.0]]),
   open([[9.2, 20.2, 3.0], [15.8, 21.8, 5.0], [20.6, 27.6, 6.2], [20.2, 34.8, 6.2], [15.2, 40.4, 5.2], [8.2, 41.6, 4.2], [1.6, 37.4, 2.6]])],
  // 4: open top, so the arm and stem never make a peak
  [open([[10.6, 0.6, 3.0], [7.6, 9.6, 4.6], [3.8, 19.6, 5.2], [1.6, 27.4, 4.4]]),
   open([[1.0, 28.2, 3.8], [9.5, 28.4, 5.0], [21.6, 28.4, 3.4]]),
   open([[16.8, 5.0, 3.0], [16.6, 17, 6.0], [16.2, 30, 6.4], [15.8, 41.4, 3.8]])],
  // 5
  [open([[20.6, 1.0, 3.0], [13.4, 1.0, 4.6], [7.0, 1.4, 4.8]]),
   open([[6.8, 0.8, 4.6], [5.8, 9.6, 5.0], [4.8, 17.8, 4.0]]),
   open([[4.8, 18.6, 3.6], [11, 15.6, 5.0], [18, 18.2, 6.2], [21, 26.2, 6.6], [19.6, 35, 6.0], [13.2, 41, 5.0], [6.2, 41.2, 4.0], [1.6, 36.4, 2.6]])],
  // 6
  [open([[18.8, 3.4, 2.6], [12.4, 0.6, 4.2], [6.2, 4.8, 5.6], [2.6, 13.8, 6.6], [2.0, 25, 6.6], [3.8, 35.2, 6.0], [9.4, 41.4, 5.0], [16, 41.2, 5.0], [20.4, 35.4, 5.6], [20.6, 27.4, 5.4], [16.4, 21.8, 4.4], [9.6, 21.4, 3.8], [3.8, 26.4, 2.8]])],
  // 7
  [open([[1.4, 1.0, 3.0], [10, 1.0, 5.0], [21.2, 1.0, 4.4]]),
   open([[21.0, 1.6, 4.0], [17.4, 11.6, 5.6], [13.6, 22.6, 6.6], [10.6, 32.6, 5.6], [8.8, 41.4, 3.6]])],
  // 8
  [ellipse(11.4, 10.4, 7.6, 9.4, 2.8, 5.6), ellipse(11, 30.6, 9.4, 10.8, 3.2, 6.6)],
  // 9
  [ellipse(10.8, 12, 8.6, 11.4, 3.0, 6.2),
   open([[19.2, 11, 4.4], [19.6, 20.4, 6.2], [17.6, 30, 6.0], [13.2, 37.8, 5.0], [7.4, 41.4, 3.6], [2.6, 39.8, 2.2]])],
];

function catmull(pts, closed, sub = 12) {
  const n = pts.length, out = [];
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

/** Resample a dense polyline every STEP px. */
function resample(dense, closed) {
  const pts = closed ? [...dense, dense[0]] : dense;
  const out = [];
  let acc = 0;
  out.push(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = STEP - acc;
    while (pos <= d) {
      const f = pos / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      pos += STEP;
    }
    acc = d - (pos - STEP);
  }
  if (closed && out.length > 1) {
    const l = out[out.length - 1];
    if (Math.hypot(l[0] - out[0][0], l[1] - out[0][1]) < STEP * 0.5) out.pop();
  }
  return out;
}

/**
 * GLYPHS[d]: { sx, sy, nx, ny, hw: Float32Array per sample; strokes: [{ s0, n, closed }];
 *              birds: { st: Uint8, u: Float32 (sample units, from the stroke start), v: Float32, seed: Uint8 }, n }
 */
export const GLYPHS = DEFS.map((def, d) => {
  const S = [];
  const strokes = [];
  for (const st of def) {
    let dense = st.smooth ? catmull(st.pts, st.closed) : st.pts.map((p) => p.slice());
    // slant: lean the top right
    dense = dense.map(([x, y, w]) => [x + SLANT * (GH - y), y, w]);
    const rs = resample(dense, st.closed);
    strokes.push({ s0: S.length, n: rs.length, closed: st.closed });
    S.push(...rs);
  }
  const N = S.length;
  const sx = new Float32Array(N), sy = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N), hw = new Float32Array(N), env = new Float32Array(N);
  for (const { s0, n, closed } of strokes) {
    for (let k = 0; k < n; k++) {
      const i = s0 + k;
      const a = S[s0 + (closed ? (k - 1 + n) % n : Math.max(0, k - 1))], b = S[s0 + (closed ? (k + 1) % n : Math.min(n - 1, k + 1))];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      sx[i] = S[i][0]; sy[i] = S[i][1]; nx[i] = -ty / l; ny[i] = tx / l;
      // open strokes taper to a streaming point over their last 2 px
      let w = (S[i][2] * WSCALE) / 2;
      if (!closed) { const e = Math.min(k, n - 1 - k) * STEP; if (e < 2) w *= 0.55 + 0.45 * (e / 2); }
      hw[i] = w;
      env[i] = closed ? 1 : Math.sin((Math.PI * k) / (n - 1));   // open strokes' waves vanish at the ends
    }
  }
  // the birds: stratified along the total length, dense at the ribbon's core
  const total = N * STEP, nb = Math.round(total * BPL);
  const st = new Uint8Array(nb), u = new Float32Array(nb), v = new Float32Array(nb), seed = new Uint8Array(nb);
  for (let i = 0; i < nb; i++) {
    let p = ((i + rand(i, d, 1)) / nb) * N;               // sample position over all strokes
    let k = 0;
    while (k < strokes.length - 1 && p >= strokes[k].s0 + strokes[k].n) k++;
    st[i] = k; u[i] = p - strokes[k].s0;
    const r1 = rand(i, d, 2), r2 = rand(i, d, 3), r3 = rand(i, d, 4);
    let vv = (r1 + r2 + r3) / 1.5 - 1;                     // -1..1, bell-shaped: the dense core
    if (rand(i, d, 5) < 0.022) vv = (vv < 0 ? -1 : 1) * (1.02 + 0.15 * rand(i, d, 6));   // feather birds at the edge
    v[i] = vv; seed[i] = (rand(i, d, 7) * 256) | 0;
  }
  return { sx, sy, nx, ny, hw, env, strokes, birds: { st, u, v, seed }, n: nb, samples: N };
});

/** Flash bytes: samples as 5 x int16, birds as 4 bytes. */
export const FLASH = GLYPHS.reduce((a, g) => a + g.samples * 12 + g.n * 4, 0);
