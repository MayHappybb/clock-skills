// Abyss numerals: each digit is the path of the siphonophore's stem as it
// coils, one or two strokes in a unit box (x right, y down). Points pass
// through a Catmull-Rom spline; a third entry 1 marks a corner (the spline
// breaks there). `closed` loops back to the start.
// Sampled once per (digit, slot size) into even 0.5 px steps.

const C = 1;
export const DIGITS = {
  0: { closed: true, s: [[[0.52, 0.0], [0.9, 0.14], [1.0, 0.5], [0.88, 0.87], [0.5, 1.0], [0.12, 0.87], [0.0, 0.5], [0.12, 0.13]]] },
  1: { s: [[[0.18, 0.26], [0.42, 0.13], [0.62, 0.0, C], [0.6, 0.5], [0.62, 1.0]]] },
  2: { s: [[[0.06, 0.24], [0.42, 0.0], [0.88, 0.14], [0.88, 0.42], [0.5, 0.7], [0.04, 1.0, C], [0.52, 0.95], [1.0, 1.0]]] },
  3: { s: [[[0.06, 0.12], [0.48, 0.0], [0.88, 0.17], [0.78, 0.38], [0.4, 0.46, C], [0.84, 0.57], [0.98, 0.8], [0.6, 1.0], [0.04, 0.88]]] },
  4: { s: [[[0.72, 1.0], [0.72, 0.0, C], [0.02, 0.68, C], [1.0, 0.68]]] },
  5: { s: [[[0.94, 0.0, C], [0.2, 0.0, C], [0.1, 0.44, C], [0.52, 0.36], [0.94, 0.56], [0.96, 0.84], [0.56, 1.0], [0.04, 0.88]]] },
  6: { s: [[[0.86, 0.04], [0.42, 0.02], [0.1, 0.34], [0.02, 0.7], [0.22, 0.96], [0.58, 1.0], [0.95, 0.8], [0.88, 0.54], [0.52, 0.44], [0.18, 0.56], [0.04, 0.7]]] },
  7: { s: [[[0.0, 0.03, C], [1.0, 0.0, C], [0.62, 0.45], [0.4, 1.0]]] },
  8: { closed: true, s: [[[0.5, 0.46], [0.84, 0.3], [0.8, 0.07], [0.5, 0.0], [0.2, 0.07], [0.16, 0.3], [0.5, 0.46], [0.92, 0.7], [0.86, 0.94], [0.5, 1.0], [0.14, 0.94], [0.08, 0.7]]] },
  9: { s: [[[0.97, 0.3], [0.7, 0.5], [0.3, 0.5], [0.03, 0.3], [0.2, 0.03], [0.6, 0.0], [0.94, 0.2], [0.96, 0.52], [0.8, 0.84], [0.48, 1.0], [0.12, 0.93]]] },
};

/** Catmull-Rom through pts (pixel coords), `sub` samples per span, into out. */
function spline(pts, closed, out) {
  const n = pts.length, get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      out.push(0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
    }
  }
  const last = closed ? pts[0] : pts[n - 1];
  out.push(last[0], last[1]);
}

/** Resample a dense polyline [x,y,x,y...] at even `step` px. */
function even(d, step) {
  const o = [d[0], d[1]];
  let carry = 0;
  for (let k = 2; k < d.length; k += 2) {
    const ax = d[k - 2], ay = d[k - 1], bx = d[k], by = d[k + 1];
    const L = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    while (s <= L) { o.push(ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L); s += step; }
    carry = L - (s - step);
  }
  o.push(d[d.length - 2], d[d.length - 1]);
  return o;
}

const cache = new Map();
/**
 * Digit d in a w x h px box, origin (0,0): { x, y: Float32Array, start:
 * Uint8Array (1 = first sample of a stroke), n }.
 */
export function digitPath(d, w, h, step = 0.5) {
  const key = d + ':' + w + ':' + h;
  let r = cache.get(key);
  if (r) return r;
  const g = DIGITS[d], ins = 1.3, X = (u) => ins + u * (w - 2 * ins), Y = (v) => ins + v * (h - 2 * ins);
  const xs = [], ys = [], st = [];
  for (const stroke of g.s) {
    const P = stroke.map((p) => [X(p[0]), Y(p[1]), p[2] === C]);
    // split at corners into runs
    const runs = [];
    let cur = [P[0]];
    for (let i = 1; i < P.length; i++) { cur.push(P[i]); if (P[i][2] && i < P.length - 1) { runs.push(cur); cur = [P[i]]; } }
    runs.push(cur);
    const dense = [];
    for (const run of runs) {
      const o = [];
      spline(run, g.closed && runs.length === 1, o);
      for (let k = dense.length ? 2 : 0; k < o.length; k++) dense.push(o[k]);
    }
    const e = even(dense, step);
    for (let k = 0; k < e.length; k += 2) { xs.push(e[k]); ys.push(e[k + 1]); st.push(k === 0 ? 1 : 0); }
  }
  // the attachment: where the stalk joins (topmost sample, nearest the middle)
  let top = 0;
  for (let i = 1; i < xs.length; i++) if (ys[i] + 0.15 * Math.abs(xs[i] - w / 2) < ys[top] + 0.15 * Math.abs(xs[top] - w / 2)) top = i;
  r = { x: Float32Array.from(xs), y: Float32Array.from(ys), start: Uint8Array.from(st), n: xs.length, top, closed: !!g.closed };
  cache.set(key, r);
  return r;
}
