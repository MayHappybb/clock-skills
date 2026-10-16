// magritte: the dove of La Grande Famille, a bird-shaped piece of daylight.
// Eight wing poses, each a coverage mask (0..1, anti-aliased) built once at
// load; the frame fills the mask with the day sky itself, so the dove is
// invisible against the day and shows only where it crosses the night.

import { polygonDist } from '../js/kit.js';

const DW = 38, DH = 30;

function pose(e) {
  // e: wing lift, 1 = up, -1 = down. The near wing, and the far wing a beat behind and smaller.
  const near = [[23, 14], [15.5, 15], [10, 15 - 13 * e], [6.5, 15 - 14.5 * e], [12.5, 15 - 6 * e]];
  const e2 = e * 0.75 + 0.15;
  const far = [[25, 13.5], [19, 13.5], [16, 13 - 10 * e2], [13.5, 13 - 11 * e2], [18, 13 - 4 * e2]];
  const tail = [[13, 15.2], [3, 12.6], [2, 15.6], [3.4, 18.6], [13, 17.6]];
  const beak = [[30.6, 12.6], [33.4, 13.5], [30.6, 14.4]];
  const a = new Float32Array(DW * DH);
  for (let y = 0; y < DH; y++)
    for (let x = 0; x < DW; x++) {
      const px = x + 0.5, py = y + 0.5;
      // body: a tilted ellipse, approximated by its scaled distance
      const bx = (px - 20) * 0.98 + (py - 16) * 0.2, by = -(px - 20) * 0.2 + (py - 16) * 0.98;
      const body = (Math.hypot(bx / 9, by / 3.6) - 1) * 3.6;
      const head = Math.hypot(px - 28.6, py - 13.4) - 2.9;
      const d = Math.min(body, head, polygonDist(px, py, near), polygonDist(px, py, far), polygonDist(px, py, tail), polygonDist(px, py, beak));
      a[y * DW + x] = Math.max(0, Math.min(1, 0.5 - d));
    }
  return { w: DW, h: DH, a };
}

export const DOVE = Array.from({ length: 8 }, (_, i) => pose(Math.sin((i / 8) * Math.PI * 2)));

/** Pose index for a flap count (cycles, fractional). */
export function dovePose(flap) {
  const u = flap - Math.floor(flap);
  return (u * 8) | 0;
}
