// The staircase for slinky: three stone blocks, one per panel, drawn as an
// oblique engraving (depth runs up-right at 45 deg). Cached once.
import * as kit from '../js/kit.js';
import { paintFrog } from './slinky-frog.js';

export const W = 192, P = 64;
// local panel geometry (px): the upper block carries the numerals on its
// front face; the lower tread at the right is where the slinky gathers
// before it steps over the void to the next panel.
export const G = {
  upFront: [2, 24, 42, 64], upDepth: 7, loTop: 50,
  U: [20.5, 20.8], D: [55, 47.2],               // slinky stations (pile base)
  cells: [[5, 27], [23, 27]],                     // digit cells (16 x 34) on the front face
};

/** Which face a local point is on: 0 void, 1 up top, 2 up front, 3 up side, 4 lo top, 5 lo front. */
function face(x, y) {
  if (x >= 42 && y >= 50) return 5;
  if (x >= 42 && y >= 43 && y < 50 && x - 42 >= 50 - y) return 4;
  if (x >= 2 && x < 42 && y >= 24) return 2;
  if (y >= 17 && y < 24 && x - 2 >= 24 - y && x - 42 <= 24 - y) return 1;
  if (x >= 42 && x < 49 && x - 42 >= 24 - y) return 3;
  return 0;
}

const STONE = [kit.hex('#000000'), kit.hex('#8896b0'), kit.hex('#4a5670'), kit.hex('#323c50'), kit.hex('#76849e'), kit.hex('#3e4860')];

/** Engraver's hatching per face: 1 = no line, <1 = a line. */
function hatch(f, x, y) {
  if (f === 3) return ((x + y) & 1) ? 0.55 : 1;            // dense diagonal on the shadow side
  if (f === 1 || f === 4) return (Math.floor(x - (24 - y)) % 4 === 0) ? 0.78 : 1;   // lines along the depth
  if (f === 5) return (y & 1) ? 0.8 : 1;
  return 1;
}

/** The static stair: RGB linear image W x W, and a face-id map. */
export function buildScene() {
  const img = new Float32Array(3 * W * W), ids = new Uint8Array(W * W);
  for (let gy = 0; gy < W; gy++) for (let gx = 0; gx < W; gx++) {
    const k = Math.floor(gx / P);
    if (Math.floor(gy / P) !== k) continue;
    const lx = gx - k * P, ly = gy - k * P;
    const acc = [0, 0, 0];
    for (let s = 0; s < 16; s++) {
      const x = lx + ((s & 3) + 0.5) / 4, y = ly + ((s >> 2) + 0.5) / 4;
      const f = face(x, y);
      if (!f) continue;
      let v = hatch(f, lx, ly);
      if (f === 2) v *= 1 - 0.35 * kit.smoothstep(24, 64, y);      // light falls off down the face
      if (f === 5) v *= 1 - 0.3 * kit.smoothstep(50, 64, y);
      const c = STONE[f];
      acc[0] += c[0] * v; acc[1] += c[1] * v; acc[2] += c[2] * v;
    }
    const p = 3 * (gy * W + gx);
    // a bright arris where the top meets the front, as on an engraving
    const arris = (ly === 24 && lx >= 2 && lx < 42) || (ly === 50 && lx >= 42) ? 1.5 : 1;
    img[p] = acc[0] / 16 * arris; img[p + 1] = acc[1] / 16 * arris; img[p + 2] = acc[2] / 16 * arris;
    ids[gy * W + gx] = face(lx + 0.5, ly + 0.5);
  }
  paintFrog(img, W, P, P);
  return { img, ids };
}
