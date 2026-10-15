// Tesla's numerals: every digit is a little circuit of brass electrodes
// (knobs) with plasma arcs strung between them. A 0 is two arcs between a top
// and a bottom knob, an 8 four arcs between three knobs, a 4 five knobs and
// three arcs. The knobs are the steady skeleton; the arcs are drawn live each
// frame along these paths.
//
// Each glyph is stored as its knobs (pixel centres) and its arcs, resampled
// at 1 px of arc length with a unit normal at every sample. Flash on the
// device: two sizes x ten digits x ~4 arcs x ~60 samples x 4 int8/int16
// values (x, y, nx, ny in 1/16 px) ~ 40 KB, plus ~60 knobs.

// a squircle-ish ellipse point at angle a (degrees, 0 = right, 90 = down)
function ell(cx, cy, rx, ry, a, n = 2.4) {
  const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / n)];
}
function arc(cx, cy, rx, ry, a0, a1, n) {
  const k = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 6)), out = [];
  for (let i = 0; i <= k; i++) out.push(ell(cx, cy, rx, ry, a0 + ((a1 - a0) * i) / k, n));
  return out;
}

// Unit-box designs: K = knobs, A = arcs (polylines). Every arc starts and
// ends on a knob, so a digit is a graph of electrodes.
export const DESIGNS = {
  0: { K: [[0.5, 0], [0.5, 1]], A: [arc(0.5, 0.5, 0.5, 0.5, -90, -270), arc(0.5, 0.5, 0.5, 0.5, -90, 90)] },
  1: { K: [[0.62, 0], [0.62, 1], [0.18, 0.22]], A: [[[0.62, 0], [0.62, 1]], [[0.62, 0], [0.4, 0.12], [0.18, 0.22]]] },
  2: {
    K: [[0.04, 0.22], [0.0, 1], [1, 1]],
    A: [[...arc(0.5, 0.27, 0.48, 0.27, 196, 360), [0.9, 0.5], [0.5, 0.73], [0.0, 1]], [[0.0, 1], [1, 1]]],
  },
  3: {
    K: [[0.04, 0.12], [0.42, 0.47], [0.02, 0.88]],
    A: [[...arc(0.5, 0.24, 0.47, 0.24, 206, 450), [0.42, 0.47]], [[0.42, 0.47], ...arc(0.5, 0.73, 0.5, 0.27, 270, 515)]],
  },
  4: {
    K: [[0.06, 0], [0.06, 0.64], [1, 0.64], [0.74, 0.22], [0.74, 1]],
    A: [[[0.06, 0], [0.06, 0.64]], [[0.06, 0.64], [1, 0.64]], [[0.74, 0.22], [0.74, 1]]],
  },
  5: {
    K: [[0.98, 0], [0.08, 0], [0.06, 0.46], [0.03, 0.9]],
    A: [[[0.98, 0], [0.08, 0]], [[0.08, 0], [0.06, 0.46]], [[0.06, 0.46], ...arc(0.47, 0.68, 0.5, 0.32, 222, 515)]],
  },
  6: {
    K: [[0.9, 0.06], [0.0, 0.68], [1, 0.68]],
    A: [[...arc(0.98, 0.68, 0.98, 0.68, 260, 180, 2.1)], arc(0.5, 0.68, 0.5, 0.32, 180, 360), arc(0.5, 0.68, 0.5, 0.32, 180, 0)],
  },
  7: { K: [[0, 0], [1, 0], [0.36, 1]], A: [[[0, 0], [1, 0]], [[1, 0], [0.72, 0.4], [0.36, 1]]] },
  8: {
    K: [[0.5, 0], [0.5, 0.46], [0.5, 1]],
    A: [arc(0.5, 0.23, 0.42, 0.23, -90, -270), arc(0.5, 0.23, 0.42, 0.23, -90, 90),
      arc(0.5, 0.73, 0.5, 0.27, -90, -270), arc(0.5, 0.73, 0.5, 0.27, -90, 90)],
  },
  9: {
    K: [[0.0, 0.32], [1, 0.32], [0.1, 0.94]],
    A: [arc(0.5, 0.32, 0.5, 0.32, 180, 0), arc(0.5, 0.32, 0.5, 0.32, 180, 360), [...arc(0.02, 0.32, 0.98, 0.62, 0, 80, 2.1)]],
  },
};

/**
 * Build a set of ten glyphs for a box of w x h, the centrelines inset by m.
 * Each glyph: { knobs: [[x,y]...], arcs: [{ x, y, nx, ny: Float32Array, n }] }.
 */
export function makeGlyphs(w, h, m) {
  const out = [];
  for (let d = 0; d <= 9; d++) {
    const D = DESIGNS[d];
    // the 1 is narrower: its box is the middle of the slot
    const bx0 = d === 1 ? w * 0.12 : 0, bw = d === 1 ? w * 0.76 : w;
    const X = (u) => bx0 + m + u * (bw - 2 * m), Y = (v) => m + v * (h - 2 * m);
    // each knob sits exactly on the nearest arc end
    const ends = D.A.flatMap((p) => [p[0], p[p.length - 1]]);
    const knobs = D.K.map(([u, v]) => {
      let best = [u, v], bd = 0.15;
      for (const e of ends) { const dd = Math.hypot(e[0] - u, e[1] - v); if (dd < bd) { bd = dd; best = e; } }
      return [X(best[0]), Y(best[1])];
    });
    const arcs = D.A.map((poly) => {
      const P = poly.map(([u, v]) => [X(u), Y(v)]);
      // resample at 1 px of arc length
      const xs = [], ys = [];
      let carry = 0;
      xs.push(P[0][0]); ys.push(P[0][1]);
      for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1], [bx, by] = P[i], L = Math.hypot(bx - ax, by - ay);
        let s = 1 - carry;
        while (s <= L) { xs.push(ax + ((bx - ax) * s) / L); ys.push(ay + ((by - ay) * s) / L); s += 1; }
        carry = L - (s - 1);
      }
      const last = P[P.length - 1];
      if (Math.hypot(xs[xs.length - 1] - last[0], ys[ys.length - 1] - last[1]) > 0.3) { xs.push(last[0]); ys.push(last[1]); }
      const n = xs.length, nx = new Float32Array(n), ny = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
        const tx = xs[b] - xs[a], ty = ys[b] - ys[a], l = Math.hypot(tx, ty) || 1;
        nx[i] = -ty / l; ny[i] = tx / l;
      }
      return { x: Float32Array.from(xs), y: Float32Array.from(ys), nx, ny, n };
    });
    // the digit's centre (of its arc samples): forks spark away from it
    let sx = 0, sy = 0, sn = 0;
    for (const a of arcs) for (let i = 0; i < a.n; i++) { sx += a.x[i]; sy += a.y[i]; sn++; }
    out.push({ knobs, arcs, cx: sx / sn, cy: sy / sn });
  }
  return out;
}
