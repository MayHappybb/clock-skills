// Droplet type for the water curtain: ten condensed numerals drawn as
// centre-line paths in a 10 x 20 box (y down). Water runs DOWN every stroke,
// so each path is turned into one or more "runs" from its high end to its low
// end (a closed bowl becomes two runs, left and right, from top to bottom).
// Arc angles are degrees, 0 = +x, 90 = +y (down).

function arc(cx, cy, rx, ry, a0, a1, n = 64) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * (k / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function cubic(p0, p1, p2, p3, n = 40) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
const line = (a, b) => [a, b];
const rot = (paths) => paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [10 - x, 20 - y]) }));

const SIX = [
  { pts: arc(5, 14.3, 4.8, 5.6, 0, 360), closed: true },
  { pts: cubic([9.0, 1.6], [6.4, -0.9], [0.3, 0.6], [0.2, 13.4]), closed: false },
];
export const GLYPHS = {
  0: [{ pts: arc(5, 10, 4.85, 9.8, 0, 360), closed: true }],
  1: [
    { pts: line([5.6, 0.2], [5.6, 19.8]), closed: false },
    { pts: cubic([5.6, 0.2], [4.4, 2.4], [2.8, 3.8], [0.9, 4.6]), closed: false },
    { pts: line([1.4, 19.8], [9.8, 19.8]), closed: false },
  ],
  2: [
    { pts: arc(5, 5.2, 4.7, 5.0, 172, 380), closed: false },
    { pts: cubic([9.45, 6.9], [8.9, 11.2], [2.6, 14.6], [0.2, 19.8]), closed: false },
    { pts: line([0.2, 19.8], [9.9, 19.8]), closed: false },
  ],
  3: [
    { pts: arc(4.9, 4.9, 4.4, 4.7, 205, 440), closed: false },
    { pts: arc(4.9, 14.5, 4.95, 5.3, 262, 515), closed: false },
  ],
  4: [
    { pts: line([7.4, 0.2], [7.4, 19.8]), closed: false },
    { pts: line([7.4, 0.2], [0.1, 13.9]), closed: false },
    { pts: line([0.1, 13.9], [10.0, 13.9]), closed: false },
  ],
  5: [
    { pts: line([1.3, 0.2], [9.5, 0.2]), closed: false },
    { pts: line([1.3, 0.2], [0.7, 9.4]), closed: false },
    { pts: arc(4.8, 13.9, 5.1, 5.9, 220, 500), closed: false },
  ],
  6: SIX,
  7: [
    { pts: line([0.0, 0.2], [10.0, 0.2]), closed: false },
    { pts: cubic([10.0, 0.2], [7.4, 6.0], [4.6, 12.0], [3.8, 19.8]), closed: false },
  ],
  8: [
    { pts: arc(5, 4.8, 4.1, 4.7, 0, 360), closed: true },
    { pts: arc(5, 14.6, 4.9, 5.3, 0, 360), closed: true },
  ],
  9: rot(SIX),
};

const STEP = 0.25;            // resample step, px
/** Resample a polyline at a uniform STEP: Float32Array [x0, y0, x1, y1, ...]. */
function resample(P) {
  const L = [0];
  for (let k = 1; k < P.length; k++) L.push(L[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const total = L[L.length - 1], n = Math.max(1, Math.round(total / STEP));
  const out = new Float32Array(2 * (n + 1));
  let seg = 1;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (seg < P.length - 1 && L[seg] < s) seg++;
    const a = P[seg - 1], b = P[seg], f = (s - L[seg - 1]) / (L[seg] - L[seg - 1] || 1);
    out[2 * k] = a[0] + (b[0] - a[0]) * f; out[2 * k + 1] = a[1] + (b[1] - a[1]) * f;
  }
  return { pts: out, total, step: total / n, n };
}

/**
 * The runs of digit d in a slot w x h px at (x0, y0): each run is a resampled
 * polyline from its upper end to its lower end, along which the drops flow.
 */
export function runs(digit, x0, y0, w, h) {
  const sx = w / 10, sy = h / 20, out = [];
  for (const p of GLYPHS[digit]) {
    let P = p.pts.map(([x, y]) => [x0 + x * sx, y0 + y * sy]);
    if (p.closed) {
      // split at the top and bottom into two downward runs
      if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P = P.slice(0, -1);
      let top = 0, bot = 0;
      for (let k = 0; k < P.length; k++) { if (P[k][1] < P[top][1]) top = k; if (P[k][1] > P[bot][1]) bot = k; }
      const walk = (a, b, dir) => { const r = []; for (let k = a; ; k = (k + dir + P.length) % P.length) { r.push(P[k]); if (k === b) break; } return r; };
      out.push(resample(walk(top, bot, 1)), resample(walk(top, bot, -1)));
    } else {
      const a = P[0], b = P[P.length - 1];
      const flip = Math.abs(b[1] - a[1]) > 0.5 ? b[1] < a[1] : b[0] < a[0];
      out.push(resample(flip ? P.slice().reverse() : P));
    }
  }
  return out;
}
