// magritte: the numerals, and how each one breaks.
//
// The numerals are holes, not things: shapes cut out of the day sky, so they
// are drawn as fields, not as fills. Each is a Didone roman (thick verticals,
// hairline horizontals, ball terminals), the lettering of a Belgian enamel
// sign or a 1950s exhibition poster, written with a broad pen held level:
// the stroke is thick where the pen moves up or down and thin where it moves
// across. Built once, at load, into two tables per digit:
//
//   N[p]  how deep pixel p is inside its nearest stroke: 1 on the centre
//         line, 0 on the edge, negative outside (distance over radius)
//   R[p]  the radius of that stroke there
//
// So the edge distance is (k - N) * R for any k in [0, 1): k = 0 is the
// numeral, larger k thins every stroke in proportion, hairlines and stems
// together, so a numeral that heals over stays the same numeral to the end.
//
// For the break, each numeral is cut into shards (a Voronoi of seeded sites
// inside the stroke), with crack pixels marked where shards meet.

import { rng } from '../js/kit.js';

export const GW = 24, GH = 38;          // the numeral's own box, px
export const PAD = 2;                    // field margin round it
export const BW = GW + 2 * PAD, BH = GH + 2 * PAD;

const THICK = 7.0, THIN = 2.5;           // stroke widths, px

// ------------------------------------------------------------ the pen

/** Sample a path into [x, y, r] circles. `pts(u)` gives a point, u in [0, 1]. */
function sweep(out, pts, { r: force, k = 1, n = 120 } = {}) {
  let [px, py] = pts(0);
  for (let i = 0; i <= n; i++) {
    const [x, y] = pts(i / n);
    const [ax, ay] = pts(Math.min(1, i / n + 0.004)), [bx, by] = pts(Math.max(0, i / n - 0.004));
    const dx = ax - bx, dy = ay - by, len = Math.hypot(dx, dy) || 1;
    const stress = Math.abs(dy / len) ** 1.6;            // 1 moving vertically, 0 across
    const r = force ?? (THIN + (THICK - THIN) * stress) / 2 * k;
    out.push([x, y, r]);
    px = x; py = y;
  }
  return out;
}
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
const bez = (p0, p1, p2, p3) => (u) => {
  const v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
};
/** Ellipse arc, angles in degrees, 0 = right, 90 = down (screen). */
const arc = (cx, cy, rx, ry, a0, a1) => (u) => {
  const a = ((a0 + (a1 - a0) * u) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
};

// Every numeral in its 24 x 38 box. Hand-set: centre lines, a few forced
// radii where a Didone breaks the pen's rule (bars, flags, hairline diagonals).
const DRAW = {
  0: (o) => sweep(o, arc(12, 19, 8.6, 17.7, 0, 360), { n: 220 }),
  1: (o) => {
    sweep(o, line(13.2, 1.6, 13.2, 36.6));
    sweep(o, bez([12, 2], [10, 4.5], [7.5, 6.5], [4.6, 7.4]), { r: 1.35 });
    sweep(o, line(6.2, 36.7, 20.2, 36.7), { r: 1.3 });
  },
  2: (o) => {
    sweep(o, arc(12.4, 11.6, 7.8, 9.7, 205, 380), { n: 160 });
    sweep(o, bez([19.7, 14.9], [18.4, 22], [7, 28], [2.8, 36.4]));
    sweep(o, line(2.8, 36.4, 21.6, 36.4), { r: 1.9 });
    sweep(o, line(21.6, 32.6, 21.6, 36.4), { r: 1.25 });
    o.push([5.7, 9.4, 3.7]);
  },
  3: (o) => {
    sweep(o, arc(12, 9.6, 7, 8.2, 212, 450), { n: 150 });
    sweep(o, line(12, 17.8, 8.6, 17.8), { r: 1.25, n: 20 });
    sweep(o, arc(11.8, 27.3, 8.6, 9.3, 258, 508), { n: 170 });
    o.push([5.4, 8.6, 3.4]);
    o.push([5.0, 30.6, 3.7]);
  },
  4: (o) => {
    sweep(o, line(16.4, 1.6, 16.4, 36.6));
    sweep(o, line(16.0, 1.8, 2.2, 26.8), { r: 1.35 });
    sweep(o, line(1.8, 26.9, 22.6, 26.9), { r: 1.45 });
    sweep(o, line(11.2, 36.7, 21.6, 36.7), { r: 1.3 });
  },
  5: (o) => {
    sweep(o, line(7.2, 2.0, 21.0, 2.0), { r: 2.2 });
    sweep(o, line(21.0, 0.9, 21.0, 5.2), { r: 1.2, n: 12 });
    sweep(o, line(7.2, 2.0, 6.4, 17.0), { r: 1.6 });
    sweep(o, arc(11.8, 26.4, 8.7, 9.8, 236, 508), { n: 170 });
    o.push([4.9, 30.4, 3.6]);
  },
  6: (o) => {
    sweep(o, arc(12, 26.6, 8.5, 9.8, 0, 360), { n: 200 });
    sweep(o, bez([18.6, 4.6], [14.6, 0.8], [3.6, 3.6], [3.5, 25]), { n: 140 });
    o.push([18.0, 6.6, 3.5]);
  },
  7: (o) => {
    sweep(o, line(2.6, 2.2, 21.6, 2.2), { r: 2.1 });
    sweep(o, line(2.6, 1.0, 2.6, 7.4), { r: 1.25, n: 16 });
    sweep(o, bez([21.6, 2.2], [17.4, 12], [11.6, 22], [10.4, 36.4]), { n: 140 });
  },
  8: (o) => {
    sweep(o, arc(12, 10, 6.9, 8.4, 0, 360), { n: 170, k: 0.92 });
    sweep(o, arc(12, 27.4, 8.4, 9.3, 0, 360), { n: 200 });
  },
  9: (o) => {
    const six = [];
    DRAW[6](six);
    for (const [x, y, r] of six) o.push([GW - x, GH - y, r]);
  },
};

/** Build the N / R tables for one list of circles. */
function field(circles) {
  const N = new Float32Array(BW * BH), R = new Float32Array(BW * BH);
  for (let j = 0; j < BH; j++)
    for (let i = 0; i < BW; i++) {
      const px = i + 0.5 - PAD, py = j + 0.5 - PAD;
      let best = -1e9, br = 1;
      for (const [x, y, r] of circles) {
        const v = 1 - Math.hypot(px - x, py - y) / r;
        if (v > best) { best = v; br = r; }
      }
      N[j * BW + i] = best; R[j * BW + i] = br;
    }
  return { N, R };
}

// ------------------------------------------------------------ shards

/**
 * Cut a numeral into shards: seeded sites inside the stroke, each pixel
 * belongs to its nearest site. `cell` is -1 outside the stroke; `crack`
 * marks pixels next to another shard (where the pane splits first);
 * `rim` pixels on a shard's own outline (its cut glass edge glints).
 */
function shards(N, digit) {
  const r = rng(9100 + digit);
  const inside = [];
  for (let p = 0; p < BW * BH; p++) if (N[p] > 0) inside.push(p);
  const sites = [];
  for (let tries = 0; tries < 4000 && sites.length < 11; tries++) {
    const p = inside[Math.floor(r() * inside.length)];
    const x = p % BW, y = (p / BW) | 0;
    if (sites.every(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 > 7.5 * 7.5)) sites.push([x, y]);
  }
  const cell = new Int8Array(BW * BH).fill(-1);
  for (const p of inside) {
    const x = p % BW, y = (p / BW) | 0;
    let best = 1e9, k = 0;
    sites.forEach(([sx, sy], i) => {
      // a little shear so the cuts run on the slant, like broken glass
      const d = (x - sx + (y - sy) * 0.45) ** 2 + (y - sy) ** 2;
      if (d < best) { best = d; k = i; }
    });
    cell[p] = k;
  }
  const crack = new Uint8Array(BW * BH), rim = new Uint8Array(BW * BH);
  const pieces = sites.map(() => ({ n: 0, cx: 0, cy: 0, rad: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }));
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const p = y * BW + x, c = cell[p];
      if (c < 0) continue;
      const nb = [x > 0 ? cell[p - 1] : -1, x < BW - 1 ? cell[p + 1] : -1, y > 0 ? cell[p - BW] : -1, y < BH - 1 ? cell[p + BW] : -1];
      if (nb.some((v) => v >= 0 && v !== c)) crack[p] = 1;
      if (nb.some((v) => v !== c)) rim[p] = 1;
      const q = pieces[c]; q.n++; q.cx += x + 0.5; q.cy += y + 0.5;
    }
  for (const q of pieces) { q.cx /= q.n || 1; q.cy /= q.n || 1; }
  for (let p = 0; p < BW * BH; p++) {
    const c = cell[p];
    if (c < 0) continue;
    const q = pieces[c], x = (p % BW) + 0.5, y = ((p / BW) | 0) + 0.5;
    q.rad = Math.max(q.rad, Math.hypot(x - q.cx, y - q.cy));
    q.x0 = Math.min(q.x0, x - 0.5 - q.cx); q.x1 = Math.max(q.x1, x + 0.5 - q.cx);
    q.y0 = Math.min(q.y0, y - 0.5 - q.cy); q.y1 = Math.max(q.y1, y + 0.5 - q.cy);
  }
  // each shard's box about its centroid: centre offset and half extents
  for (const q of pieces) { q.bx = (q.x0 + q.x1) / 2; q.by = (q.y0 + q.y1) / 2; q.hw = (q.x1 - q.x0) / 2; q.hh = (q.y1 - q.y0) / 2; }
  // per shard, a seeded fall: release delay, sideways drift, spin, glint phase
  pieces.forEach((q, i) => {
    q.delay = r() * 0.12;
    q.vx = (q.cx - BW / 2) * 0.9 + (r() - 0.5) * 10;
    q.vy = -4 - r() * 8;               // a small lift as the pane gives
    q.spin = (r() - 0.5) * 5.5;
    q.glint = r() * 6.28;
  });
  return { cell, crack, rim, pieces };
}

/**
 * Where a numeral has any coverage, as row runs [y, x0, x1) in box pixels:
 * the frame paints only these, not the whole box. Gaps under 3 px are merged.
 */
function runs(N, R, w) {
  const out = [];
  for (let y = 0; y < BH; y++) {
    let x0 = -1, last = -9;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (0.5 + N[p] * R[p] <= 0) continue;
      if (x0 >= 0 && x - last > 3) { out.push([y, x0, last + 1]); x0 = -1; }
      if (x0 < 0) x0 = x;
      last = x;
    }
    if (x0 >= 0) out.push([y, x0, last + 1]);
  }
  return out;
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => {
  const circles = [];
  DRAW[d](circles);
  const f = field(circles);
  return { ...f, ...shards(f.N, d), runs: runs(f.N, f.R, BW) };
});

/** The colon: two round holes, as a field of its own. */
export const COLON_W = 8;
export const COLON = (() => {
  const W = COLON_W + 2 * PAD, circles = [[COLON_W / 2, 13.5, 3.1], [COLON_W / 2, 27.5, 3.1]];
  const N = new Float32Array(W * BH), R = new Float32Array(W * BH);
  for (let j = 0; j < BH; j++)
    for (let i = 0; i < W; i++) {
      let best = -1e9, br = 1;
      for (const [x, y, r] of circles) {
        const v = 1 - Math.hypot(i + 0.5 - PAD - x, j + 0.5 - PAD - y) / r;
        if (v > best) { best = v; br = r; }
      }
      N[j * W + i] = best; R[j * W + i] = br;
    }
  return { N, R, W, runs: runs(N, R, W) };
})();
