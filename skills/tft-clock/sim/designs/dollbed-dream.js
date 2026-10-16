// dollbed: the dreams. Each doll dreams its half of the time in a thought
// cloud: the puppy dreams the hours as bones laid out like matchsticks, the
// panda dreams the minutes as bamboo canes. Digits are straight sticks on a
// small skeleton (with diagonals where a hand-laid stick figure would use
// them), drawn anti-aliased so they can bob, sway and wiggle by sub-pixels.

import { hex, mix, sin, cos } from '../js/kit.js';

export const D = {
  cloud: hex('#454c8e'), cloudRim: hex('#646cb0'), cloudHi: hex('#525aa0'),
  bone: hex('#f3ebd8'), boneSh: hex('#bfb295'),
  cane: hex('#7cc24e'), caneHi: hex('#bfe894'), node: hex('#3d7a2a'), leaf: hex('#57a63a'), crumb: hex('#9ad46a'),
  z: hex('#aeb4e6'),
};

// Sticks per digit in a unit box (x right, y down), each from its start to
// its end: canes grow from start to end, so uprights start at the bottom.
export const STICKS = {
  0: [[0, 1, 1, 1], [0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0]],
  1: [[0.6, 1, 0.6, 0], [0.6, 0, 0.15, 0.32]],
  2: [[0, 1, 1, 1], [0, 1, 1, 0.48], [1, 0.48, 1, 0], [1, 0, 0, 0]],
  3: [[0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0], [1, 0.5, 0.22, 0.5]],
  4: [[0.74, 1, 0.74, 0], [0.74, 0, 0, 0.66], [0, 0.66, 1, 0.66]],
  5: [[0, 1, 1, 1], [1, 1, 1, 0.5], [1, 0.5, 0, 0.5], [0, 0.5, 0, 0], [0, 0, 1, 0]],
  6: [[0, 1, 1, 1], [0, 1, 0, 0], [0, 0, 1, 0], [1, 1, 1, 0.5], [1, 0.5, 0, 0.5]],
  7: [[0.3, 1, 1, 0], [1, 0, 0, 0]],
  8: [[0, 1, 1, 1], [0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0.5, 1, 0.5]],
  9: [[1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0.5], [0, 0.5, 1, 0.5], [1, 1, 0, 1]],
};
// where a cane digit keeps its leaves: [stick index, at the stick's end (1) or start (0), side]
const LEAVES = {
  0: [[2, 1, 1], [1, 1, -1]], 1: [[0, 0.62, 1], [1, 1, -1]], 2: [[2, 1, 1], [0, 0, -1]], 3: [[1, 1, 1], [3, 1, -1]],
  4: [[0, 1, 1], [2, 0, -1]], 5: [[1, 0, 1], [4, 1, 1]], 6: [[1, 1, -1], [3, 1, 1]], 7: [[0, 1, 1], [1, 1, -1]],
  8: [[2, 1, 1], [1, 1, -1]], 9: [[0, 1, 1], [2, 1, -1]],
};

/** A thought cloud: overlapping puffs, a rim, gently breathing. */
export function cloud(g, cx, cy, puffs, breath, t) {
  const k = 1 + 0.025 * breath;
  for (const [x, y, r] of puffs) g.fillCircle(cx + x * k, cy + y * k, r * k + 1.2, D.cloudRim, { aa: true });
  puffs.forEach(([x, y, r], i) => {
    const w = 0.35 * sin(t * 1.1 + i * 1.7);
    g.fillCircle(cx + x * k + w, cy + y * k, r * k, D.cloud, { aa: true });
  });
}

/** The little bubbles from a dreamer's head up to its cloud. */
export function trail(g, pts, breath) {
  pts.forEach(([x, y, r], i) => {
    const b = 1 + 0.12 * sin(breath + i);
    g.fillCircle(x, y, r * b + 0.9, D.cloudRim, { aa: true });
    g.fillCircle(x, y, r * b, D.cloud, { aa: true });
  });
}

// ------------------------------------------------------------ bones

function bone(g, x0, y0, x1, y1, a) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const o = { aa: true, a };
  // underside shade, then the bone: a shaft and two knuckles at each end
  g.thickLine(x0 + 0.5, y0 + 0.8, x1 + 0.5, y1 + 0.8, 2.6, D.boneSh, o);
  g.thickLine(x0, y0, x1, y1, 2.5, D.bone, o);
  for (const [px, py] of [[x0, y0], [x1, y1]])
    for (const s of [-1, 1]) g.fillCircle(px + nx * s * 1.25, py + ny * s * 1.25, 1.5, D.bone, o);
}

/**
 * A digit of bones in the box (x, y, w, h). `st(k, n)` gives each bone's
 * state: null (not there) or { dx, dy, rot, a }.
 */
export function boneDigit(g, d, x, y, w, h, st) {
  const S = STICKS[d], n = S.length;
  S.forEach(([u0, v0, u1, v1], k) => {
    const s = st(k, n);
    if (!s) return;
    let ax = x + u0 * w, ay = y + v0 * h, bx = x + u1 * w, by = y + v1 * h;
    // inset the ends so the knuckles meet at the corners instead of piling up
    const dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1, ins = 1.3 / L;
    ax += dx * ins; ay += dy * ins; bx -= dx * ins; by -= dy * ins;
    const mx = (ax + bx) / 2 + s.dx, my = (ay + by) / 2 + s.dy, c = cos(s.rot), sn = sin(s.rot);
    const hx = (bx - ax) / 2, hy = (by - ay) / 2;
    const rx = hx * c - hy * sn, ry = hx * sn + hy * c;
    bone(g, mx - rx, my - ry, mx + rx, my + ry, s.a);
  });
}

// ------------------------------------------------------------ bamboo

function cane(g, x0, y0, x1, y1, f0, f1, a) {
  if (f1 <= f0) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const sx = x0 + dx * f0, sy = y0 + dy * f0, ex = x0 + dx * f1, ey = y0 + dy * f1;
  const o = { aa: true, a };
  g.thickLine(sx, sy, ex, ey, 3.2, D.cane, o);
  g.thickLine(sx + nx * 0.8, sy + ny * 0.8, ex + nx * 0.8, ey + ny * 0.8, 0.8, D.caneHi, o);
  // nodes every ~5 px from the root
  for (let s = 4.5; s < L * f1 - 0.8; s += 5) {
    if (s < L * f0) continue;
    const px = x0 + (dx * s) / L, py = y0 + (dy * s) / L;
    g.thickLine(px - nx * 1.9, py - ny * 1.9, px + nx * 1.9, py + ny * 1.9, 1.1, D.node, o);
  }
}

function leaf(g, x, y, ang, len, a) {
  const c = cos(ang), s = sin(ang);
  // the leaf points along (sin ang, -cos ang); its width across
  const ux = s, uy = -c, nx = c, ny = s;
  g.fillPolygon([
    [x, y],
    [x + ux * len * 0.35 + nx * 1.3, y + uy * len * 0.35 + ny * 1.3],
    [x + ux * len, y + uy * len],
    [x + ux * len * 0.35 - nx * 1.0, y + uy * len * 0.35 - ny * 1.0],
  ], D.leaf, { aa: true, a });
}

/**
 * A digit of bamboo canes. `st(k, n)` gives { f0, f1 } (the part of the cane
 * that is there, 0..1 from the root) or null; plus optional `eat` (0..1, how
 * far the munching has got) and `dur` for the crumbs. `sway` bends the tops,
 * `leafK` (0..1) unfurls the leaves.
 */
export function bambooDigit(g, d, x, y, w, h, st, sway, t, leafK) {
  const S = STICKS[d], n = S.length;
  const P = (u, v) => [x + u * w + sway * (1 - v) * (1 - v), y + v * h];
  const ends = [];
  S.forEach(([u0, v0, u1, v1], k) => {
    const s = st(k, n);
    if (!s) { ends.push(null); return; }
    const [ax, ay] = P(u0, v0), [bx, by] = P(u1, v1);
    cane(g, ax, ay, bx, by, s.f0, s.f1, 1);
    ends.push([ax, ay, bx, by, s.f1]);
    if (s.eat !== undefined) {
      // crumbs bitten off fall and fade
      for (let j = 0; j < 4; j++) {
        const uj = (j + 0.5) / 4, age = (s.eat - uj) * s.dur;
        if (age < 0 || age > 0.45) continue;
        const f = 1 - uj, cx = ax + (bx - ax) * f + (j - 1.5) * 0.9, cy = ay + (by - ay) * f + 30 * age * age + 2 * age;
        g.fillCircle(cx, cy, 0.8, D.crumb, { aa: true, a: 1 - age / 0.45 });
      }
    }
  });
  if (leafK <= 0) return;
  for (const [k, at, side] of LEAVES[d] ?? []) {
    const e = ends[k];
    if (!e || e[4] < Math.min(1, at + 0.001)) continue;
    const lx = e[0] + (e[2] - e[0]) * at, ly = e[1] + (e[3] - e[1]) * at;
    const ang = side * (0.75 + 0.18 * sin(t * 2.3 + k * 1.9 + side));
    leaf(g, lx, ly, ang, 6 * leafK, 1);
  }
}
