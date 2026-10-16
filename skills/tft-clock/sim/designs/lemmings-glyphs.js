// lemmings: the brickwork numerals, the builders' stroke order, and the
// lemming sprites.
//
// A numeral is 12 x 14 cells; a cell is 2 px wide and 3 px tall, so every
// stroke (3 cells across, 2 cells down) is 6 px thick both ways and a cell
// row is one 3 px course of bricks. Every corner is a builder's staircase
// (one cell over, one course up), and every numeral can be walked from the
// left: its top is reached by falling and then climbing stairs, never a wall.

export const CW = 2, CH = 3, GW = 12, GH = 14;
export const DW = GW * CW, DH = GH * CH; // 24 x 42 px

const RAW = {
  0: `
...######...
..########..
.###....###.
###......###
###......###
###......###
###......###
###......###
###......###
###......###
###......###
.###....###.
..########..
...######...`,
  1: `
......###...
.....####...
....#####...
...######...
..###.###...
.###..###...
###...###...
......###...
......###...
......###...
......###...
......###...
...#########
...#########`,
  2: `
..########..
.##########.
###......###
.........###
.........###
........###.
.......###..
.....####...
...####.....
..###.......
.###........
###.........
############
############`,
  3: `
############
############
........###.
.......###..
......###...
.....######.
.....#######
.........###
.........###
.........###
###......###
.###....###.
..########..
...######...`,
  4: `
......####..
.....#####..
....######..
...###.###..
..###..###..
.###...###..
###....###..
###....###..
############
############
.......###..
.......###..
.......###..
.......###..`,
  5: `
############
############
###.........
###.........
###.........
##########..
###########.
.........###
.........###
.........###
###......###
.###....###.
..########..
...######...`,
  6: `
.....#####..
....#####...
...###......
..###.......
.###........
###.........
##########..
###########.
###......###
###......###
###......###
.###....###.
..########..
...######...`,
  7: `
############
############
.........###
........###.
........###.
.......###..
.......###..
......###...
......###...
.....###....
.....###....
....###.....
....###.....
....###.....`,
  8: `
..########..
.##########.
###......###
###......###
.###....###.
..########..
.##########.
###......###
###......###
###......###
###......###
.###....###.
.##########.
..########..`,
  9: `
...######...
..########..
.###....###.
###......###
###......###
###......###
.###########
..##########
.........###
........###.
.......###..
......###...
....####....
..#####.....`,
};

/** MASK[d]: Uint8Array(GW * GH), 1 where the numeral has a cell. */
export const MASK = {};
for (const [d, s] of Object.entries(RAW)) {
  const rows = s.split('\n').filter((r) => r.trim());
  const m = new Uint8Array(GW * GH);
  rows.forEach((r, y) => { for (let x = 0; x < GW; x++) if (r[x] === '#') m[y * GW + x] = 1; });
  MASK[d] = m;
}

// The builder's route through each numeral, in cells (x 0..12, y 0..14):
// strokes laid in order; between strokes he hops.
const SKEL = {
  0: [[[1.5, 12], [1.5, 3], [3.5, 1], [8.5, 1], [10.5, 3], [10.5, 11], [8.5, 13], [3.5, 13], [1.8, 11.6]]],
  1: [[[11.5, 13], [3.5, 13]], [[7.5, 12], [7.5, 1], [1.5, 6.5]]],
  2: [[[11.5, 13], [1, 13], [1.4, 11], [4.5, 8.5], [8, 7], [10.5, 4.6], [10.5, 2.5], [9, 1], [3, 1], [1.5, 2.6]]],
  3: [[[1.4, 10.5], [3.5, 12.5], [8.5, 12.5], [10.5, 10.5], [10.5, 7.5], [9.5, 6], [5.5, 6]], [[6.5, 5.5], [9.5, 2.5], [10.5, 1], [0.5, 1]]],
  4: [[[0.5, 9], [11.5, 9]], [[1, 7.5], [7.2, 0.6], [8.5, 0.6], [8.5, 13.5]]],
  5: [[[11.5, 1], [1.5, 1], [1.5, 5.6], [9, 6], [10.5, 7.5], [10.5, 10.5], [8.5, 12.5], [3.5, 12.5], [1.4, 10.5]]],
  6: [[[9.5, 0.6], [5.5, 1.2], [1.5, 5.2], [1.5, 11], [3.5, 12.6], [8.5, 12.6], [10.5, 10.5], [10.5, 8.5], [9, 7], [1.6, 7]]],
  7: [[[0.5, 1], [10.5, 1], [10.5, 2.5], [5, 13.5]]],
  8: [[[6, 6], [3, 5], [1.5, 3.5], [1.5, 2.5], [3, 1], [9, 1], [10.5, 2.5], [10.5, 3.5], [9, 5], [6, 6], [3, 6.5],
    [1.5, 8], [1.5, 10.5], [3.5, 12.6], [8.5, 12.6], [10.5, 10.5], [10.5, 7.5], [9, 6.2]]],
  9: [[[11.5, 6.5], [3, 6.5], [1.5, 5], [1.5, 3], [3.5, 1], [8.5, 1], [10.5, 3], [10.5, 8], [7, 11], [2.5, 13.2]]],
};

/**
 * ROUTE[d]: the builder's walk in px within the glyph box, with a parameter
 * per mask cell saying when along it that cell's bricks go down.
 *   pts: [[x, y, s, hop]] where s is the arc length (px, hops count double)
 *   len: total length; cellS: Float32Array(GW * GH) arc length of each cell
 */
export const ROUTE = {};
for (const [d, strokes] of Object.entries(SKEL)) {
  const pts = [];
  let s = 0;
  const segs = []; // [ax, ay, bx, by, s0, s1]
  strokes.forEach((st, k) => {
    st.forEach(([cx, cy], j) => {
      const x = cx * CW, y = cy * CH;
      if (pts.length) {
        const p = pts[pts.length - 1], len = Math.hypot(x - p[0], y - p[1]);
        const hop = j === 0;
        const s1 = s + len * (hop ? 0.6 : 1);
        if (!hop) segs.push([p[0], p[1], x, y, s, s1]);
        s = s1;
        pts.push([x, y, s, hop ? 1 : 0]);
      } else pts.push([x, y, 0, 0]);
    });
  });
  const cellS = new Float32Array(GW * GH);
  const m = MASK[d];
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    if (!m[cy * GW + cx]) continue;
    const px = (cx + 0.5) * CW, py = (cy + 0.5) * CH;
    let best = 1e9, bs = 0;
    for (const [ax, ay, bx, by, s0, s1] of segs) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = px - ax - u * dx, ey = py - ay - u * dy, e = ex * ex + ey * ey;
      if (e < best - 0.01) { best = e; bs = s0 + (s1 - s0) * u; }
    }
    cellS[cy * GW + cx] = bs;
  }
  ROUTE[d] = { pts, len: s, cellS };
}

/** Point on a route at arc length s: [x, y, dirX, hop, dy/dx sign]. */
export function routeAt(d, s) {
  const { pts } = ROUTE[d];
  if (s <= 0) return [pts[0][0], pts[0][1], 1, 0, 0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (s <= b[2]) {
      const u = (s - a[2]) / (b[2] - a[2] || 1);
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      return [x, y - (b[3] ? Math.sin(u * Math.PI) * 7 : 0), dx < -0.01 ? -1 : 1, b[3], Math.abs(dy) > Math.abs(dx) * 1.5 ? (dy < 0 ? -1 : 1) : 0];
    }
  }
  const p = pts[pts.length - 1];
  return [p[0], p[1], 1, 0, 0];
}

// ------------------------------------------------------------ lemmings (facing right; 4 x 8 incl. hair)

const PAL = { g: 0x2fd82f, G: 0x1a9a2a, s: 0xf2c49a, b: 0x3a5cf0, B: 0x2234a8, w: 0xffffff, k: 0x101018 };

import { sprite } from '../js/kit.js';

const S = (p) => sprite(p, PAL);

export const WALK = [
  S(`
    .gg.
    ggs.
    .ss.
    .bb.
    sbb.
    .bb.
    .bs.
    s..s`),
  S(`
    .gg.
    ggs.
    .ss.
    .bb.
    .bbs
    .bb.
    .bb.
    .ss.`),
  S(`
    .gg.
    ggs.
    .ss.
    .bb.
    .bs.
    .bb.
    .bs.
    .s.s`),
  S(`
    .gg.
    ggs.
    .ss.
    .bb.
    sbb.
    .bb.
    .bb.
    .ss.`),
];

export const FALL = [
  S(`
    s..s
    .gg.
    ggs.
    .ss.
    .bb.
    .bb.
    .bb.
    s..s`),
  S(`
    .gg.
    sgss
    .ss.
    .bb.
    .bb.
    .bb.
    .bb.
    .ss.`),
];

export const CLIMB = [
  S(`
    ..ss
    .ggs
    ggs.
    .bb.
    .bbs
    .bb.
    .bbs
    .s..`),
  S(`
    ...s
    .ggs
    ggss
    .bb.
    .bb.
    .bbs
    .bb.
    ..s.`),
];

export const DIG = [
  S(`
    .gg.
    ggs.
    .ss.
    sbbs
    .bb.
    .bb.
    s..s
    ....`),
  S(`
    ....
    .gg.
    ggs.
    .ss.
    sbbs
    .bb.
    .bb.
    s..s`),
];

export const BUILD = [
  S(`
    .gg..
    ggs..
    .ss..
    .bbs.
    .bb.w
    .bb..
    .bb..
    .ss..`),
  S(`
    .gg..
    ggs..
    .ss..
    .bb..
    .bbsw
    .bb..
    .bb..
    s..s.`),
];

export const OHNO = [
  S(`
    s..s
    sggs
    ggs.
    .ss.
    .bb.
    .bb.
    .bb.
    s..s`),
  S(`
    s..s
    sggs
    .sgg
    .ss.
    .bb.
    .bb.
    .bb.
    .ss.`),
];

/** The umbrella, 7 x 4, drawn above a floater. */
export const BROLLY = sprite(`
  ..www..
  .wrwrw.
  wrwrwrw
  ...k...`, { w: 0xf4f4f4, r: 0xe03030, k: 0x8a6a40 });
