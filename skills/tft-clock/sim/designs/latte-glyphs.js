// Latte: the numerals, drawn as poured foam (see latte.js).
//
// Each digit is one or two pour strokes on a skeleton (normalised 0..1 in a
// cell, inset by the stroke's half width). A stroke that has a free start
// begins in a heart, the way a rosetta begins: the heart is the digit's ball
// terminal. Closed strokes (0, 8) have no heart and flow round.
//
// For every pixel of a digit's box we precompute, once at load (flash tables
// on the device):
//   D  distance to the skeleton, 1/8 px (Uint8, 255 = far)
//   V  the rosetta's rib coordinate: arc length bent back into chevrons, 1/8 px
//   U  plain arc length along the whole digit (strokes in pour order), 1/8 px
//   HD the heart's signed distance + 128, 1/8 px (Uint8)
// The frame then decides foam / rib / keyline / crema from a few integer
// compares per pixel.

const PERIOD8 = 256 / 6;   // one leaf of the rosetta = 5.33 px; the rib table spans 32 px

function arc(cx, cy, rx, ry, a0, a1, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function bez(p0, c, p1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
const cat = (...parts) => parts.flat();

// ------------------------------------------------------------ the skeletons

const rot180 = (pts) => pts.map(([x, y]) => [1 - x, 1 - y]);

const SIX = cat(bez([0.94, 0.03], [0.04, 0.06], [0.0, 0.68]), arc(0.5, 0.7, 0.5, 0.3, 180, -180, 56));

export const SKELETONS = {
  0: [{ pts: arc(0.5, 0.5, 0.5, 0.5, -90, 270, 64), closed: true }],
  1: [{ pts: cat(bez([0.1, 0.25], [0.42, 0.17], [0.64, 0.0], 12), [[0.64, 0.0], [0.64, 1.0]]), heart: true }],
  2: [{ pts: cat(arc(0.5, 0.28, 0.5, 0.28, 195, 380, 36), bez([0.97, 0.38], [0.6, 0.66], [0.0, 1.0], 20), [[0.0, 1.0], [1.0, 1.0]]), heart: true }],
  3: [{ pts: cat(arc(0.47, 0.25, 0.47, 0.25, 205, 450, 40), arc(0.47, 0.73, 0.53, 0.27, 270, 510, 44)), heart: true }],
  4: [
    { pts: [[0.07, 0.0], [0.0, 0.64], [1.0, 0.64]], heart: true },
    { pts: [[1.0, 0.04], [1.0, 1.0]] },
  ],
  5: [{ pts: cat([[1.0, 0.0], [0.08, 0.0], [0.02, 0.44]], arc(0.47, 0.69, 0.53, 0.31, 235, 505, 48)), heart: true }],
  6: [{ pts: SIX, heart: true }],
  7: [{ pts: cat([[0.0, 0.02], [1.0, 0.0]], bez([1.0, 0.0], [0.55, 0.42], [0.34, 1.0])), heart: true }],
  8: [
    { pts: arc(0.5, 0.245, 0.42, 0.245, -90, 270, 48), closed: true },
    { pts: arc(0.5, 0.72, 0.5, 0.28, -90, 270, 56), closed: true },
  ],
  9: [{ pts: rot180(SIX), heart: true }],
};

// ------------------------------------------------------------ the field builder

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    let t = step - carry;
    while (t <= L) { out.push([ax + ((bx - ax) * t) / L, ay + ((by - ay) * t) / L]); t += step; }
    carry = L - (t - step);
  }
  const last = pts[pts.length - 1], e = out[out.length - 1];
  if (Math.hypot(last[0] - e[0], last[1] - e[1]) > 1e-3) out.push(last);
  return out;
}

function triDist(px, py, a, b, c) {
  const P = [a, b, c];
  let d = Infinity, inside = false;
  for (let i = 0, j = 2; i < 3; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    const dx = xi - xj, dy = yi - yj, l2 = dx * dx + dy * dy;
    let u = ((px - xj) * dx + (py - yj) * dy) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const e = Math.hypot(px - xj - u * dx, py - yj - u * dy);
    if (e < d) d = e;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}

/**
 * The tables for one size of the set. `cw` x `ch` is the cell, `hw` the
 * stroke's half width, `pad` the margin round the cell in the box.
 */
export function buildSet({ cw, ch, hw, pad }) {
  const bw = cw + 2 * pad, bh = ch + 2 * pad, n = bw * bh;
  const sx = cw - 2 * hw, sy = ch - 2 * hw, ox = pad + hw, oy = pad + hw;
  const kc = 2.4 / (hw * hw);         // how far a rib bends back at the stroke's edge
  const set = { bw, bh, cw, ch, hw, pad, glyphs: [] };
  for (let d = 0; d <= 9; d++) {
    const strokes = SKELETONS[d].map((s) => {
      const pts = resample(s.pts.map(([x, y]) => [ox + x * sx, oy + y * sy]), 0.5);
      const u = [0];
      for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const L = u[u.length - 1];
      // closed loops: the rib count must fit the loop, so the seam is invisible
      const vs = s.closed ? (Math.round((L * 8) / PERIOD8) * PERIOD8) / (L * 8) : 1;
      return { pts, u, L, vs, heart: !!s.heart, closed: !!s.closed };
    });
    // the hearts: two lobes behind the stroke's start, the point running into it
    const hearts = [];
    for (const s of strokes) if (s.heart) {
      const [x0, y0] = s.pts[0], [x1, y1] = s.pts[Math.min(6, s.pts.length - 1)];
      const l = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / l, dy = (y1 - y0) / l, nx = -dy, ny = dx;
      const rL = hw * 0.88, a = hw * 0.7, b = hw * 0.1;
      const c1 = [x0 - dx * b + nx * a, y0 - dy * b + ny * a], c2 = [x0 - dx * b - nx * a, y0 - dy * b - ny * a];
      const tip = [x0 + dx * hw * 2.6, y0 + dy * hw * 2.6];
      const t1 = [c1[0] + nx * rL * 0.92 + dx * rL * 0.3, c1[1] + ny * rL * 0.92 + dy * rL * 0.3];
      const t2 = [c2[0] - nx * rL * 0.92 + dx * rL * 0.3, c2[1] - ny * rL * 0.92 + dy * rL * 0.3];
      hearts.push({ c1, c2, rL, t1, t2, tip });
    }
    const D = new Uint8Array(n), V = new Uint16Array(n), U = new Uint16Array(n), HD = new Uint8Array(n);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const px = x + 0.5, py = y + 0.5, k = y * bw + x;
      let best = Infinity, bu = 0, bv = 0, base = 0, bBase = 0;
      for (const s of strokes) {
        for (let i = 1; i < s.pts.length; i++) {
          const [ax, ay] = s.pts[i - 1], [bx, by] = s.pts[i];
          const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
          let t = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dd = Math.hypot(px - ax - t * ex, py - ay - t * ey);
          if (dd < best) { best = dd; bu = s.u[i - 1] + (s.u[i] - s.u[i - 1]) * t; bv = s.vs; bBase = base; }
        }
        base += s.L + 4;
      }
      D[k] = Math.min(255, Math.round(best * 8));
      V[k] = Math.max(0, Math.round((bu * bv - kc * best * best) * 8) + 2048);
      U[k] = Math.round((bBase + bu) * 8);
      let h = 15.8;
      for (const H of hearts) {
        const d1 = Math.hypot(px - H.c1[0], py - H.c1[1]) - H.rL, d2 = Math.hypot(px - H.c2[0], py - H.c2[1]) - H.rL;
        h = Math.min(h, d1, d2, triDist(px, py, H.t1, H.tip, H.t2));
      }
      HD[k] = Math.max(0, Math.min(255, Math.round(h * 8) + 128));
    }
    // the skeleton in pour order, for the pitcher and the etching pick (every 2 px)
    const path = [];
    let base = 0;
    for (const s of strokes) {
      for (let i = 0; i < s.pts.length; i += 4) path.push([s.pts[i][0], s.pts[i][1], base + s.u[i]]);
      base += s.L + 4;
    }
    set.glyphs.push({ D, V, U, HD, path, len: base - 4, hearts: hearts.length });
  }
  // a fixed ranking of the box's pixels, to throw material away evenly
  set.rank = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    let h = Math.imul(k ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
    set.rank[k] = h & 255;
  }
  return set;
}

/** Where along a glyph's pour path arc length `u` is (px), as [x, y] in box coordinates. */
export function pathAt(gl, u) {
  const P = gl.path;
  if (u <= P[0][2]) return [P[0][0], P[0][1]];
  for (let i = 1; i < P.length; i++) if (P[i][2] >= u) {
    const a = P[i - 1], b = P[i];
    if (b[2] - a[2] > 3) return [b[0], b[1]];     // a lift between strokes
    const t = (u - a[2]) / (b[2] - a[2] || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  const e = P[P.length - 1];
  return [e[0], e[1]];
}
