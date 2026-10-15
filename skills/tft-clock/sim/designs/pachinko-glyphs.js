// Pachinko numerals: each digit is a brass ball gutter (a channel with two
// brass rails, a dark pocket inside, a flat cast shadow and a plain moat),
// laid along a centreline drawn for this face. Steel balls run along the
// centreline in single file. Everything here is built once at load: flash.
//
// A glyph is one or more lanes (open or closed paths). Each lane is
// resampled at 1 px of arc length (X, Y tables) so a ball at arc length s
// is a table lookup. Open lanes start at an entry hole and end at a drain
// hole; closed lanes (0, 8) start and end at their top.

import { hash } from '../js/kit.js';

export const STROKE_IN = 3.5;   // pocket half-width (7 px pocket, a 5 px ball and 1 px play each side)
export const STROKE_OUT = 4.6;  // brass rail outer edge
const MOAT = 6.1;
export const M = { NONE: 0, MOAT: 1, SHADOW: 2, BRASS: 3, POCKET: 4, HOLE: 5, NAIL: 6 };

const rad = Math.PI / 180;
function arc(out, cx, cy, rx, ry, a0, a1) {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * rad * Math.max(rx, ry) * 2));
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * rad; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}
function quad(out, x0, y0, cx, cy, x1, y1) {
  for (let i = 0; i <= 40; i++) { const t = i / 40, u = 1 - t; out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]); }
  return out;
}

/** The centreline lanes of digit d in a box w x h (pixels). */
function lanes(d, w, h) {
  const r = w / 2;
  switch (d) {
    case 0: {
      const p = [];
      arc(p, r, r, r, r, -90, 0); p.push([w, h - r]);
      arc(p, r, h - r, r, r, 0, 180); p.push([0, r]);
      arc(p, r, r, r, r, 180, 270);
      return [p];
    }
    case 1: return [[[0.2 * w, 0.19 * h], [0.66 * w, 0], [0.66 * w, h]]];
    case 2: {
      const p = arc([], r, r, r, r, 180, 384);
      p.push([0, h], [w, h]);
      return [p];
    }
    case 3: {
      const top = arc([], 0.5 * w, 0.24 * h, 0.5 * w, 0.24 * h, 200, 450);
      top.push([0.22 * w, 0.48 * h]);
      const bot = arc([], 0.5 * w, 0.74 * h, 0.5 * w, 0.26 * h, 270, 520);
      return [top, bot];
    }
    case 4: return [[[0.3 * w, 0], [0, 0.63 * h], [w, 0.63 * h]], [[0.76 * w, 0.2 * h], [0.76 * w, h]]];
    case 5: {
      const p = [[w, 0], [0.06 * w, 0], [0.03 * w, 0.45 * h]];
      arc(p, 0.5 * w, 0.68 * h, 0.5 * w, 0.32 * h, 235, 500);
      return [p];
    }
    case 6: {
      const p = quad([], 0.9 * w, 0, 0.02 * w, 0.08 * h, 0, 0.64 * h);
      arc(p, 0.5 * w, 0.69 * h, 0.5 * w, 0.31 * h, 180, -180);
      return [p];
    }
    case 7: return [[[0, 0], [w, 0], [0.34 * w, h]]];
    case 8: {
      const top = arc([], 0.5 * w, 0.25 * h, 0.43 * w, 0.25 * h, -90, 270);
      const bot = arc([], 0.5 * w, 0.73 * h, 0.5 * w, 0.27 * h, -90, 270);
      return [top, bot];
    }
    case 9: return lanes(6, w, h).map((p) => p.map(([x, y]) => [w - x, h - y]).reverse());
  }
  return [];
}

/** Resample a polyline at 1 px of arc length. */
function resample(pts) {
  const X = [pts[0][0]], Y = [pts[0][1]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let t = 1 - carry;
    while (t <= seg) { X.push(ax + ((bx - ax) * t) / seg); Y.push(ay + ((by - ay) * t) / seg); t += 1; }
    carry = seg - (t - 1);
  }
  const last = pts[pts.length - 1];
  X.push(last[0]); Y.push(last[1]);
  return { X: Float32Array.from(X), Y: Float32Array.from(Y) };
}

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

export const PAD = 2;

/**
 * Build the glyph set for slot size sw x sh: per digit the mask (codes M,
 * origin at slot - PAD), a per-pixel dissolve rank, and the lanes.
 */
export function buildSet(sw, sh) {
  const w = sw - 2 * 4.5, h = sh - 2 * 4.5, off = 4.5 + PAD;
  const mw = sw + 2 * PAD, mh = sh + 2 * PAD;
  const set = [];
  for (let d = 0; d < 10; d++) {
    const raw = lanes(d, w, h).map((p) => p.map(([x, y]) => [x + off, y + off]));
    const ls = raw.map((p) => {
      const { X, Y } = resample(p);
      const n = X.length, L = n - 1;
      const closed = Math.hypot(X[0] - X[n - 1], Y[0] - Y[n - 1]) < 1.5;
      // ball pitch: about 6 px, and an exact divisor of a closed loop
      const P = closed ? L / Math.round(L / 6) : 6;
      const N = closed ? Math.round(L / P) : Math.ceil((L + P) / P);
      return { X, Y, L, closed, P, N, ex: X[n - 1], ey: Y[n - 1], sx: X[0], sy: Y[0] };
    });
    const mask = new Uint8Array(mw * mh), rank = new Uint8Array(mw * mh);
    const dist = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        let best = 99;
        for (const p of raw) for (let i = 1; i < p.length; i++) {
          const e = segD(x + 0.5, y + 0.5, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
          if (e < best) best = e;
        }
        dist[y * mw + x] = best;
      }
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x, e = dist[i];
        let c = e <= STROKE_IN ? M.POCKET : e <= STROKE_OUT ? M.BRASS : e <= MOAT ? M.MOAT : M.NONE;
        if (c === M.POCKET) for (const p of ls) if (!p.closed && (Math.hypot(x + 0.5 - p.ex, y + 0.5 - p.ey) < 2.6 || Math.hypot(x + 0.5 - p.sx, y + 0.5 - p.sy) < 2.6)) c = M.HOLE;
        if ((c === M.MOAT || c === M.NONE) && x > 0 && y > 0 && dist[i - mw - 1] <= STROKE_OUT) c = M.SHADOW;
        mask[i] = c;
        rank[i] = hash(x, y, d + 17) & 255;
      }
    // nail heads: the rails are lined with brass nails, a 2 x 2 head every 7 px each side
    for (const p of ls) {
      for (let a = 3; a < p.L - 2; a += 7) {
        const i0 = Math.max(0, a - 1), i1 = Math.min(p.L, a + 1);
        const tx = p.X[i1] - p.X[i0], ty = p.Y[i1] - p.Y[i0], tl = Math.hypot(tx, ty) || 1;
        for (const side of [-1, 1]) {
          const cx = p.X[a] - (ty / tl) * side * 4.3, cy = p.Y[a] + (tx / tl) * side * 4.3;
          const x0 = Math.round(cx - 1), y0 = Math.round(cy - 1);
          let ok = true;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const x = x0 + dx, y = y0 + dy;
            if (x < 0 || y < 0 || x >= mw || y >= mh || dist[y * mw + x] <= STROKE_IN + 0.2) ok = false;
          }
          if (ok) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) mask[(y0 + dy) * mw + x0 + dx] = M.NAIL;
        }
      }
    }
    set.push({ mask, rank, lanes: ls, mw, mh });
  }
  return set;
}
