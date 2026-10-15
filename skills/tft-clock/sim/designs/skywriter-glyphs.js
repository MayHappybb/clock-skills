// Skywriter: the flight plans. Each numeral is a closed tour a plane can fly
// for ever: its strokes, joined by sharp corners and, where a stroke ends,
// a little loop-the-loop with the smoke off that brings the plane back
// along the stroke. A Deco skeleton font, drawn for a 22 x 36 box: an oval
// 0, a flagged 1, a swan-neck 2, a flat-topped 3, an open 4, a 5 with a
// round belly, a 6 and 9 of a circle and a straight tangent stem, a 7 with
// a long diagonal, a high-waisted 8 of two stacked circles. A forward lean
// (SHEAR) is applied to the finished tour.
//
// Everything here runs once at load: the tours (flash tables) and the
// smoke puffs laid along them.

import { hash } from '../js/kit.js';

export const GW = 22, GH = 36;
export const SHEAR = 0.12;
const D2R = Math.PI / 180;

class Path {
  constructor() { this.p = []; }
  last() { return this.p[this.p.length - 1]; }
  heading() {
    const n = this.p.length, a = this.p[n - 1];
    for (let k = n - 2; k >= 0; k--) {
      const b = this.p[k], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy);
      if (l > 0.6) return [dx / l, dy / l];
    }
    return [1, 0];
  }
  M(x, y) { this.p.push([x, y, 1]); return this; }
  L(x, y) {
    const [x0, y0] = this.last(), n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 0.2));
    for (let i = 1; i <= n; i++) this.p.push([x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n, 1]);
    return this;
  }
  // ellipse arc, degrees, y down: increasing angle runs clockwise on screen
  E(cx, cy, rx, ry, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * 1.5));
    for (let i = 1; i <= n; i++) {
      const a = (a0 + ((a1 - a0) * i) / n) * D2R;
      this.p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), 1]);
    }
    return this;
  }
  A(cx, cy, r, a0, a1) { return this.E(cx, cy, r, r, a0, a1); }
  // turnaround: a teardrop loop off the end of the stroke, smoke off
  T(k = 10, j = 6) {
    const [x, y] = this.last(), [dx, dy] = this.heading(), nx = -dy, ny = dx;
    const p1 = [x + k * dx + j * nx, y + k * dy + j * ny], p2 = [x + k * dx - j * nx, y + k * dy - j * ny];
    const n = 60;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const bx = u * u * u * x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * x;
      const by = u * u * u * y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * y;
      this.p.push([bx, by, i === n ? 1 : 0]);
    }
    return this;
  }
}

/** Angle (deg) on circle C,r where a line to or from Q touches it, travelling cw (+1) or ccw (-1). */
function tangent(cx, cy, r, qx, qy, dir, lo, hi, leaving) {
  let best = lo, bestE = Infinity;
  for (let a = lo; a <= hi; a += 0.05) {
    const c = Math.cos(a * D2R), s = Math.sin(a * D2R), tx = cx + r * c, ty = cy + r * s;
    const ux = dir > 0 ? -s : s, uy = dir > 0 ? c : -c;
    let vx = leaving ? qx - tx : tx - qx, vy = leaving ? qy - ty : ty - qy;
    const l = Math.hypot(vx, vy); vx /= l; vy /= l;
    if (vx * ux + vy * uy <= 0) continue;
    const e = Math.abs(vx * uy - vy * ux);
    if (e < bestE) { bestE = e; best = a; }
  }
  return best;
}
const onC = (cx, cy, r, a) => [cx + r * Math.cos(a * D2R), cy + r * Math.sin(a * D2R)];

function plan(d) {
  const p = new Path();
  switch (d) {
    case 0: p.M(11, 0).E(11, 18, 11, 18, -90, -450); break;
    case 1: p.M(3, 9).L(13, 0).L(13, 36).T().L(13, 0).L(3, 9).T(); break;
    case 2: {
      const a = tangent(11, 10, 10, 0, 36, 1, 360, 450, true), [tx, ty] = onC(11, 10, 10, a);
      p.M(1, 11).A(11, 10, 10, 174, a).L(0, 36).L(22, 36).T().L(0, 36).L(tx, ty).A(11, 10, 10, a, 174).T();
      break;
    }
    case 3: {
      const r = Math.hypot(9 - 11, 14 - 24.5), a0 = Math.atan2(14 - 24.5, 9 - 11) / D2R;
      p.M(1, 0).L(21, 0).L(9, 14).A(11, 24.5, r, a0, 148).T().A(11, 24.5, r, 148, a0).L(21, 0).L(1, 0).T();
      break;
    }
    case 4: p.M(11, 0).L(-1, 27).L(18, 27).L(18, 36).T().L(18, 10).T().L(18, 27).L(23, 27).T().L(-1, 27).L(11, 0).T(); break;
    case 5: {
      const r = Math.hypot(3 - 11, 15 - 24.5), a0 = Math.atan2(15 - 24.5, 3 - 11) / D2R;
      p.M(21, 0).L(3, 0).L(3, 15).A(11, 24.5, r, a0, 150).T().A(11, 24.5, r, 150, a0).L(3, 0).L(21, 0).T();
      break;
    }
    case 6: {
      const a = tangent(11, 25, 11, 19, 0, -1, 180, 270, false), [tx, ty] = onC(11, 25, 11, a);
      p.M(19, 0).L(tx, ty).A(11, 25, 11, a, a - 360).T().L(19, 0).T();
      break;
    }
    case 7: p.M(0, 0).L(22, 0).L(7, 36).T().L(22, 0).L(0, 0).T(); break;
    case 8: p.M(11, 17).A(11, 8.5, 8.5, 90, -270).A(11, 26.5, 9.5, -90, 270); break;
    case 9: {
      const a = tangent(11, 11, 11, 3, 36, -1, 0, 90, false), [tx, ty] = onC(11, 11, 11, a);
      p.M(3, 36).L(tx, ty).A(11, 11, 11, a, a - 360).T().L(3, 36).T();
      break;
    }
  }
  return p.p;
}

/** Resample a dense path at 1 px of arc length, with the lean applied. */
function resample(pts) {
  const src = pts.map(([x, y, s]) => [x + SHEAR * (GH - y), y, s]);
  const X = [], Y = [], S = [];
  let carry = 1;
  X.push(src[0][0]); Y.push(src[0][1]); S.push(1);
  for (let i = 1; i < src.length; i++) {
    const [x0, y0] = src[i - 1], [x1, y1, s1] = src[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l === 0) continue;
    let pos = 0;
    while (l - pos >= carry) {
      pos += carry; carry = 1;
      const u = pos / l;
      X.push(x0 + (x1 - x0) * u); Y.push(y0 + (y1 - y0) * u); S.push(s1);
    }
    carry -= l - pos;
  }
  // the path is closed: drop a last sample that sits on the first
  const n0 = X.length;
  if (Math.hypot(X[n0 - 1] - X[0], Y[n0 - 1] - Y[0]) < 0.5) { X.pop(); Y.pop(); S.pop(); }
  return { X, Y, S };
}

/**
 * Per digit:
 *   n, X, Y, S     the tour at 1 px steps (S: smoke on), closed
 *   HX, HY         the plane's heading there (smoothed)
 *   np, PU, PX, PY, PR, PK, PI   the puffs: tour fraction, home, radius jitter, rank, tour index
 */
export const TOURS = [];
for (let d = 0; d < 10; d++) {
  const { X, Y, S } = resample(plan(d));
  const n = X.length;
  const HX = new Float32Array(n), HY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 3) % n, b = (i + 3) % n;
    const dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1;
    HX[i] = dx / l; HY[i] = dy / l;
  }
  const pu = [], px = [], py = [], pr = [], pk = [], pi = [];
  for (let i = 0; i < n; i += 3) {
    if (!S[i]) continue;
    const h = hash(d, i, 77);
    const j = ((h & 255) / 255 - 0.5) * 0.8;                 // a lumpy edge: jitter across the stroke
    pu.push(i / n);
    px.push(X[i] - HY[i] * j); py.push(Y[i] + HX[i] * j);
    // billows: every third puff is a lobe, so the trail's edge scallops like poster smoke
    pr.push((((h >>> 8) & 255) / 255 - 0.5) * 0.7 + (pu.length % 3 === 0 ? 0.65 : -0.2));
    pk.push(((h >>> 16) & 1023) / 1024);
    pi.push(i);
  }
  TOURS.push({
    n, X: Float32Array.from(X), Y: Float32Array.from(Y), S: Uint8Array.from(S), HX, HY,
    np: pu.length, PU: Float32Array.from(pu), PX: Float32Array.from(px), PY: Float32Array.from(py),
    PR: Float32Array.from(pr), PK: Float32Array.from(pk), PI: Uint16Array.from(pi),
  });
}

// ------------------------------------------------------------ the poster's title type
// A high-waisted Deco capital, 5 rows, drawn for this grid: crossbars sit
// high (A E F H), bowls are small (B P R), the M and W are five wide.
const G = {
  A: ['.#.', '###', '#.#', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '##.', '#..', '#..', '###'], F: ['###', '##.', '#..', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '###', '#.#', '#.#', '#.#'], I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '.#.', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#', '##', '.#', '.#', '.#'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['###', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '##.'], '·': ['.', '.', '#', '.', '.'],
};
export const TITLE = {};
for (const [k, rows] of Object.entries(G)) {
  const w = rows[0].length, px = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') px.push(x, y);
  TITLE[k] = { w, px };
}
export function titleWidth(str) {
  let w = 0;
  for (const ch of str) w += ch === ' ' ? 3 : (TITLE[ch]?.w ?? 3) + 1;
  return w - 1;
}
