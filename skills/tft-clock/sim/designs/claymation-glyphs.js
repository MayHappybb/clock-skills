// claymation glyphs: numerals as rolled plasticine snakes.
//
// Each glyph is a skeleton (polylines in a 26 x 50 box) that a snake of
// clay of radius R is bent along. At load time each skeleton becomes a
// distance field (the signed distance to the clay's outline, in pixels) on a
// 96 x 80 grid centred on the glyph. On the device these are ROM tables
// (int8 in quarter pixels: 11 x 7.7 KB); per frame a pixel only looks them up.

import { segDist } from '../js/kit.js';

export const R = 6.5;          // snake radius
export const SW = 26, SH = 50; // skeleton box
export const TOP = 15;         // skeleton top on the screen (outline 8.5 .. 71.5)
export const FW = 96, FH = 80; // field grid, centred on the glyph in x, absolute in y

const D2R = Math.PI / 180;
// Points along an ellipse arc, angles in degrees, 0 = right, 90 = down.
function arc(cx, cy, rx, ry, a0, a1, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
// Quadratic bezier.
function quad(p0, p1, p2, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    pts.push([v * v * p0[0] + 2 * u * v * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * u * v * p1[1] + u * u * p2[1]]);
  }
  return pts;
}

const SIX = [
  [...quad([22, 2], [3, 8], [0.5, 34], 10)],
  arc(13, 36.5, 12.5, 13.5, 0, 360, 24),
];

/** Skeletons, each a list of polylines in the 26 x 50 box. */
export const SKELETONS = {
  0: [arc(13, 25, 12.5, 24.5, 0, 360, 28)],
  1: [[[4, 9], [13, 0], [13, 50]], [[3, 50], [23, 50]]],
  2: [[...arc(13, 12.5, 12.5, 12.5, 190, 380, 14), ...quad([24.5, 17], [10, 34], [0.5, 50], 8).slice(1), [26, 50]]],
  3: [[...arc(13, 12, 11.5, 12, 205, 450, 16)], [...arc(13, 37, 13, 13, 270, 515, 16)]],
  4: [[[19, 50], [19, 0], [0, 34], [26, 34]]],
  5: [[[24.5, 0.5], [3, 0.5], [1.5, 22], ...arc(12.5, 34.5, 13, 15, 230, 495, 16).slice(1)]],
  6: SIX,
  7: [[[0, 0.5], [26, 0.5], ...quad([26, 0.5], [12, 20], [9, 50], 8).slice(1)]],
  8: [arc(13, 11.5, 11, 11.5, 0, 360, 22), arc(13, 36, 13, 14, 0, 360, 24)],
  9: SIX.map((pl) => pl.map(([x, y]) => [SW - x, SH - y])),
};

/** The colon: two balls (point skeletons), radius RC, centred in x, at y TOP+25 +/- 11. */
export const RC = 5.5;

function buildField(lines, radius) {
  const f = new Float32Array(FW * FH);
  const ox = FW / 2 - SW / 2; // skeleton x origin inside the grid
  for (let j = 0; j < FH; j++)
    for (let i = 0; i < FW; i++) {
      const px = i + 0.5 - ox, py = j + 0.5 - TOP;
      let best = Infinity;
      for (const pl of lines)
        for (let k = 0; k + 1 < pl.length; k++) {
          const d = segDist(px, py, pl[k][0], pl[k][1], pl[k + 1][0], pl[k + 1][1]);
          if (d < best) best = d;
        }
      f[j * FW + i] = best - radius;
    }
  return f;
}

/** Distance fields: FIELDS[d] for digits '0'..'9', FIELDS[':'] for the colon. */
export const FIELDS = {};
for (const k of Object.keys(SKELETONS)) FIELDS[k] = buildField(SKELETONS[k], R);
FIELDS[':'] = buildField([[[13, 14], [13, 14]], [[13, 36], [13, 36]]], RC);

/** Points along a glyph's skeleton (screen coordinates, glyph centred at cx), for placing thumbprints. */
export function skeletonPoints(ch, cx) {
  const lines = ch === ':' ? [[[13, 14]], [[13, 36]]] : SKELETONS[ch];
  const pts = [];
  for (const pl of lines) for (const [x, y] of pl) pts.push([cx - SW / 2 + x, TOP + y]);
  return pts;
}
