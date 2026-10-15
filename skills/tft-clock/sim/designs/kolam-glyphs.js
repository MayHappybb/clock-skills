// Kolam numerals: each digit is one or two centrelines (drawn by hand for
// this face, in a unit box), and the kolam line is built around them the way
// a kolam is drawn: pulli (dots) are laid along the centreline, and a single
// closed flour line weaves round them, two branches crossing between every
// pair of dots so each dot sits in its own lens, wrapping round the end dot
// of an open stroke. Corners are crossings (the line passes through the
// corner), stroke ends are dots (the line wraps round them).
//
// buildGlyph() resamples a digit at a size into flat arrays (0.5 px steps):
// centre (px, py), normal (nx, ny) and the weave w = sin(pi * phase), where
// the phase is a whole number at a crossing and a half at a dot. Built once
// at load for both sizes: these are the face's flash tables.

// Elements: ['M', x, y], ['L', x, y], ['A', cx, cy, rx, ry, a0, a1] (degrees,
// y down, so 270 is the top of an ellipse), ['B'] = a crossing here.
const P = {
  0: [{ closed: true, d: [['A', 0.5, 0.5, 0.5, 0.5, 270, 630]] }],
  1: [{ d: [['M', 0.14, 0.25], ['L', 0.6, 0], ['L', 0.6, 1]] }],
  2: [{ d: [['A', 0.5, 0.28, 0.47, 0.28, 192, 395], ['L', 0, 1], ['L', 1, 1]] }],
  3: [{ d: [['A', 0.47, 0.25, 0.45, 0.25, 200, 450], ['L', 0.27, 0.5], ['L', 0.47, 0.5], ['A', 0.47, 0.75, 0.51, 0.25, 270, 520]] }],
  4: [{ d: [['M', 0.14, 0], ['L', 0.02, 0.64], ['L', 1, 0.64]] }, { d: [['M', 0.7, 0.27], ['L', 0.7, 1]] }],
  5: [{ d: [['M', 0.96, 0], ['L', 0.1, 0], ['L', 0.116, 0.454], ['A', 0.47, 0.68, 0.5, 0.32, 225, 500]] }],
  6: [{ closed: true, d: [['A', 0.5, 0.68, 0.48, 0.32, 180, 540]] }, { d: [['A', 0.9, 0.68, 0.86, 0.64, 272, 196]] }],
  7: [{ d: [['M', 0, 0], ['L', 1, 0], ['L', 0.3, 1]] }],
  8: [{ closed: true, d: [['A', 0.5, 0.235, 0.42, 0.235, 90, -270], ['B'], ['A', 0.5, 0.735, 0.5, 0.265, 270, 630]] }],
  9: [{ closed: true, d: [['A', 0.5, 0.32, 0.48, 0.32, 0, 360]] }, { d: [['A', 0.1, 0.32, 0.86, 0.64, 92, 16]] }],
};

/** Dense polyline of one stroke in pixels, with the arclength of each corner. */
function dense(stroke, w, h) {
  const xs = [], ys = [], corners = [];
  let lastDir = null, explicit = false;
  const add = (x, y) => {
    const n = xs.length;
    if (n) {
      const dx = x - xs[n - 1], dy = y - ys[n - 1], l = Math.hypot(dx, dy);
      if (l < 1e-6) return;
      const dir = [dx / l, dy / l];
      if (explicit || (lastDir && lastDir[0] * dir[0] + lastDir[1] * dir[1] < Math.cos((25 * Math.PI) / 180))) corners.push(n - 1);
      explicit = false;
      lastDir = dir;
    }
    xs.push(x); ys.push(y);
  };
  for (const e of stroke.d) {
    if (e[0] === 'M') add(e[1] * w, e[2] * h);
    else if (e[0] === 'L') {
      const x0 = xs[xs.length - 1], y0 = ys[ys.length - 1], x1 = e[1] * w, y1 = e[2] * h;
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
      for (let i = 1; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    } else if (e[0] === 'A') {
      const [, cx, cy, rx, ry, a0, a1] = e;
      const n = Math.ceil((Math.abs(a1 - a0) / 360) * 2 * Math.PI * Math.max(rx * w, ry * h) / 0.1);
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        add((cx + rx * Math.cos(a)) * w, (cy + ry * Math.sin(a)) * h);
      }
    } else if (e[0] === 'B') explicit = true;
  }
  // arclength of each dense point
  const cum = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return { xs, ys, cum, corners: corners.map((i) => cum[i]) };
}

/**
 * One digit at a size: `w` x `h` is the centreline box, `d` the dot pitch.
 * Returns { strokes, n } where each stroke has Float32 arrays px, py, nx, ny,
 * w (weave), s (arclength), its length L, `open`, and its dots [{x, y, s}].
 */
export function buildGlyph(ch, w, h, d) {
  const strokes = [];
  let total = 0;
  for (const st of P[ch]) {
    const { xs, ys, cum, corners } = dense(st, w, h);
    const L = cum[cum.length - 1], open = !st.closed;
    const M = Math.max(2, Math.round(L / 0.5));
    const px = new Float32Array(M + 1), py = new Float32Array(M + 1), nx = new Float32Array(M + 1), ny = new Float32Array(M + 1);
    const ws = new Float32Array(M + 1), ss = new Float32Array(M + 1), phs = new Float32Array(M + 1);
    // anchors: [s, type] with type 0 = crossing, 1 = dot
    const anchors = [[0, open ? 1 : 0], ...corners.filter((c) => c > 0.5 && c < L - 0.5).map((c) => [c, 0]), [L, open ? 1 : 0]];
    const phase = [0];
    let ph = open ? 0.5 : 0;
    phase[0] = ph;
    for (let k = 1; k < anchors.length; k++) {
      const len = anchors[k][0] - anchors[k - 1][0], n = len / d, ta = anchors[k - 1][1], tb = anchors[k][1];
      let dp;
      if (ta === tb) dp = Math.max(1, Math.round(n));
      else dp = Math.max(0, Math.round(n - 0.5)) + 0.5;
      ph += dp;
      phase.push(ph);
    }
    const phaseAt = (s) => {
      let k = 1;
      while (k < anchors.length - 1 && s > anchors[k][0]) k++;
      const a = anchors[k - 1][0], b = anchors[k][0];
      return phase[k - 1] + ((phase[k] - phase[k - 1]) * (s - a)) / (b - a || 1);
    };
    let q = 0;
    for (let j = 0; j <= M; j++) {
      const s = (L * j) / M;
      while (q < cum.length - 2 && cum[q + 1] < s) q++;
      const u = (s - cum[q]) / (cum[q + 1] - cum[q] || 1);
      px[j] = xs[q] + (xs[q + 1] - xs[q]) * u;
      py[j] = ys[q] + (ys[q + 1] - ys[q]) * u;
      // tangent from a short chord (one-sided at a corner it straddles)
      const tx = xs[q + 1] - xs[q], ty = ys[q + 1] - ys[q], tl = Math.hypot(tx, ty) || 1;
      nx[j] = -ty / tl; ny[j] = tx / tl;
      ss[j] = s;
      phs[j] = phaseAt(s);
      ws[j] = Math.sin(Math.PI * phs[j]);
    }
    // dots at every half phase
    const dots = [];
    const p0 = phase[0], p1 = phase[phase.length - 1];
    for (let m = Math.ceil(p0 - 0.5); m + 0.5 <= p1 + 1e-6; m++) {
      const target = m + 0.5;
      if (target < p0 - 1e-6) continue;
      if (!open && target > p1 - 1e-6) continue;
      // invert the piecewise-linear phase
      let k = 1;
      while (k < phase.length - 1 && target > phase[k]) k++;
      const s = anchors[k - 1][0] + ((anchors[k][0] - anchors[k - 1][0]) * (target - phase[k - 1])) / (phase[k] - phase[k - 1] || 1);
      const j = Math.min(M, Math.round((s / L) * M));
      dots.push({ x: px[j], y: py[j], s, j });
    }
    strokes.push({ px, py, nx, ny, w: ws, ph: phs, s: ss, L, M, open, dots, lenses: p1 - p0 });
    total += M + 1;
  }
  return { strokes, n: total };
}
