// Seed-head numerals for the dandelion face. Each digit is a receptacle
// skeleton (the bare head, as centre-line paths in a 20 x 32 px box) with
// seeds radiating from it: a stalk and a pappus tuft at its tip. The seeds
// are generated once per digit, deterministically.
import { hash } from '../js/kit.js';

export const BOX_W = 20, BOX_H = 32, REACH = 3.6;

function arc(cx, cy, rx, ry, a0, a1) {
  const pts = [], n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 6));
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + (a1 - a0) * k / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
function bez(p0, p1, p2) {
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
const six = () => [arc(19.5, 22, 19, 21, 255, 180), arc(10, 22, 9.5, 9.5, 0, 360)];

/** Centre-line paths for each digit. */
export const SKELETON = {
  0: [arc(10, 16, 9.5, 15.5, 0, 360)],
  1: [bez([4, 8], [8.5, 5], [11.5, 0.5]), [[11.5, 0.5], [11.5, 32]]],
  2: [[...arc(10, 9.5, 9, 9, 195, 400), ...bez([16.9, 15.3], [8, 22], [0.5, 31.5]).slice(1)], [[0.5, 31.5], [20, 31.5]]],
  3: [arc(10, 7.8, 7.8, 7.8, 205, 450), arc(10, 23.4, 8.6, 8.6, 270, 515), [[6, 15.2], [10, 15.2]]],
  4: [[[7, 0.5], [0.5, 21.5]], [[0.5, 21.5], [20, 21.5]], [[15.5, 9], [15.5, 32]]],
  5: [[[19, 0.5], [3.5, 0.5], [2.6, 13.5]], arc(9.6, 21.5, 10, 10, 232, 510)],
  6: six(),
  7: [[[0.5, 0.5], [19.5, 0.5]], bez([19.5, 0.5], [11, 14], [7.5, 32])],
  8: [arc(10, 8, 7.4, 7.4, 0, 360), arc(10, 23.4, 9.3, 8.4, 0, 360)],
  9: six().map((p) => p.map(([x, y]) => [BOX_W - x, BOX_H - y])),
};

function resample(path, step) {
  const out = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k], [bx, by] = path[k + 1], L = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(L / step));
    for (let j = 0; j < n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n, (bx - ax) / L, (by - ay) / L]);
  }
  const [lx, ly] = path[path.length - 1], q = out[out.length - 1];
  out.push([lx, ly, q[2], q[3]]);
  return out;
}

/**
 * Seeds of digit d: typed arrays. rx, ry receptacle point (box px); dx, dy
 * unit direction; len stalk length; h1, h2, h3 per-seed randoms.
 * Also the resampled receptacle (spine) and the stem attach point.
 */
function build(d) {
  const S = { rx: [], ry: [], dx: [], dy: [], len: [], h1: [], h2: [], h3: [] }, spine = [];
  let n = 0;
  const push = (x, y, ax, ay, len) => {
    S.rx.push(x); S.ry.push(y); S.dx.push(ax); S.dy.push(ay); S.len.push(len);
    S.h1.push(hash(d, n, 1)); S.h2.push(hash(d, n, 2)); S.h3.push(hash(d, n, 3)); n++;
  };
  SKELETON[d].forEach((path, pi) => {
    const pts = resample(path, 1.0), closed = Math.hypot(path[0][0] - path.at(-1)[0], path[0][1] - path.at(-1)[1]) < 0.5;
    pts.forEach(([x, y, tx, ty], k) => {
      spine.push(x, y);
      for (const side of [1, -1]) {
        const j = (hash(d, pi * 1000 + k, side + 5) - 0.5) * 1.1, c = Math.cos(j), s = Math.sin(j);
        const nx = -ty * side, ny = tx * side;
        push(x, y, nx * c - ny * s, nx * s + ny * c, REACH * (0.55 + 0.65 * hash(d, pi * 1000 + k, side + 9) ** 1.5));
      }
      if (k % 3 === 0) {
        const a = hash(d, pi * 1000 + k, 13) * Math.PI * 2;
        push(x, y, Math.cos(a), Math.sin(a), REACH * (0.35 + 0.35 * hash(d, pi * 1000 + k, 14)));
      }
      // round fuzzy terminals at open ends
      if (!closed && (k === 0 || k === pts.length - 1)) {
        const sgn = k === 0 ? -1 : 1;
        for (let f = -2; f <= 2; f++) {
          const a = Math.atan2(ty * sgn, tx * sgn) + f * 0.45;
          push(x, y, Math.cos(a), Math.sin(a), REACH * (0.75 + 0.2 * hash(d, k, f + 20)));
        }
      }
    });
  });
  // keep counters open: a stalk stops before the medial line to any other
  // part of the stroke, leaving a dark gap of about 2 px between tips
  const np = spine.length / 2;
  for (let q = 0; q < n; q++) {
    let L = S.len[q];
    for (; L > 1.1; L -= 0.2) {
      const tx = S.rx[q] + S.dx[q] * L, ty = S.ry[q] + S.dy[q] * L;
      let ok = true;
      for (let k = 0; k < np && ok; k++) {
        const px = spine[2 * k], py = spine[2 * k + 1];
        if (Math.hypot(px - S.rx[q], py - S.ry[q]) <= 8.4) continue; // own neighbourhood
        if (Math.hypot(tx - px, ty - py) < 7.6) ok = false;
      }
      if (ok) break;
    }
    S.len[q] = L;
  }
  // stem attach: lowest skeleton point, near the middle
  let ax = 10, ay = 0, best = -1e9;
  for (let k = 0; k < spine.length; k += 2) {
    const sc = spine[k + 1] - 0.4 * Math.abs(spine[k] - 10);
    if (sc > best) { best = sc; ax = spine[k]; ay = spine[k + 1]; }
  }
  const F = (a) => Float32Array.from(a);
  return { n, rx: F(S.rx), ry: F(S.ry), dx: F(S.dx), dy: F(S.dy), len: F(S.len), h1: F(S.h1), h2: F(S.h2), h3: F(S.h3), spine: F(spine), ax, ay };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
