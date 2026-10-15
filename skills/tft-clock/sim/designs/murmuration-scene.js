// Murmuration: the ground and the sky's textures, built once at load (flash).
// TOP[x] is the silhouette heightmap (reed bed, a row of distant poplars),
// every pixel at or below it the darkest shade. CLOUD is a 256-wide strip of
// thin lenticular cloud lit from below, value offsets, that drifts. The pylon
// and its wires are drawn as lines over the composite.

import { rand, noise } from '../js/kit.js';

export const W = 160, H = 80;

export const TOP = new Uint8Array(W);
{
  for (let x = 0; x < W; x++) {
    // the reed bed: a ragged top, a little higher in clumps
    let t = 72.6 - 1.6 * noise(x * 0.21, 3) - 1.4 * noise(x * 0.07, 4) - (rand(x, 9) < 0.18 ? 1 : 0);
    if (x >= 96) t = Math.max(t, 70.5);                // keep clear of the minutes' feet
    TOP[x] = Math.round(t);
  }
  // a distant hedge line under the hours, rounded bushes, and poplar spires rising from it
  for (let x = 0; x < 70; x++) {
    const h = 67.5 - 2.2 * noise(x * 0.18, 31) - 1.2 * noise(x * 0.5, 32) + (x > 58 ? (x - 58) * 0.4 : 0);
    TOP[x] = Math.min(TOP[x], Math.round(h));
  }
  const POP = [[6, 54, 2.5], [11.5, 50, 2.9], [17, 56, 2.3], [45, 55, 2.4], [50.5, 51, 2.9], [56, 57, 2.2]];
  for (const [cx, top, hw] of POP)
    for (let y = top; y < 72; y++) {
      // a Lombardy poplar: a flame, pointed at the top, widest low down
      const rel = (y - top) / (68 - top);
      const w = hw * (rel < 0.42 ? Math.pow(rel / 0.42, 0.65) : 1 - 0.15 * (rel - 0.42));
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++)
        if (x >= 0 && x < W && Math.abs(x + 0.5 - cx) <= w + 0.15 && y < TOP[x]) TOP[x] = y;
    }
}

/** Reed stems in front, swaying: [x, height above the bed, lean, phase]. Short over by the minutes. */
export const STEMS = [];
for (let k = 0; k < 46; k++) {
  const x = 1 + k * 3.45 + 2.6 * (rand(k, 20) - 0.5);
  const tall = x < 92 ? 2.5 + 5 * rand(k, 21) ** 2 : 1.5 + 2.5 * rand(k, 21);
  STEMS.push([x, tall, (rand(k, 22) - 0.5) * 1.6, rand(k, 23) * 6.28]);
}

/** Lit cloud streaks: value offsets on a 256-wide strip, per row. */
export const CLOUD = new Int8Array(256 * H);
{
  const LAYERS = [[11, 3.2, -9, 0.022, 11], [24, 2.4, -7, 0.03, 12], [38, 3.6, -8, 0.02, 13], [53, 2.6, -6, 0.028, 14]];
  for (const [y0, th, body, fq, sd] of LAYERS)
    for (let x = 0; x < 256; x++) {
      // periodic over 256 px: noise on a circle-ish wrap via two blended samples
      const f = x / 256, n = noise(x * fq * 4, sd) * (1 - f) + noise((x - 256) * fq * 4, sd) * f;
      const amt = Math.max(0, n - 0.42) * 2.4;            // gaps between the streaks
      if (amt <= 0) continue;
      const yc = y0 + 3 * (noise(x * 0.02, sd + 5) - 0.5);
      for (let y = Math.floor(yc - th - 2); y <= Math.ceil(yc + th + 2); y++) {
        if (y < 0 || y >= H) continue;
        const d = (y + 0.5 - yc) / th;
        let v = 0;
        if (d > -1 && d < 1) v += body * (1 - d * d);       // the body, darker
        if (d > 0.4 && d < 1.6) v += 13 * (1 - Math.abs(d - 1) / 0.6);   // its underside, lit by the set sun
        CLOUD[y * 256 + x] = Math.max(-40, Math.min(40, CLOUD[y * 256 + x] + v * Math.min(1, amt)));
      }
    }
}

/** The pylon, as hard 1-px lines [x0, y0, x1, y1]: a small distant lattice tower in the gap. */
export const PX0 = 79;
export const PYLON = [
  [PX0 - 3, 72, PX0 - 1, 50], [PX0 + 3, 72, PX0 + 1, 50],      // legs
  [PX0 - 1, 50, PX0, 45], [PX0 + 1, 50, PX0, 45],                // the peak
  [PX0 - 7, 50, PX0 + 7, 50], [PX0 - 5, 54, PX0 + 5, 54],      // cross arms
  [PX0 - 3, 72, PX0 + 2, 61], [PX0 + 3, 72, PX0 - 2, 61],      // lattice
  [PX0 - 2, 61, PX0 + 1, 54], [PX0 + 2, 61, PX0 - 1, 54],
];
/** Wires: catenaries from the arms, [x0, y0, x1, y1, sag]. */
export const WIRES = [
  [PX0 - 7, 51, -2, 49, 5], [PX0 - 5, 55, -2, 54, 5],
  [PX0 + 7, 51, 97, 70, 2], [PX0 + 5, 55, 95, 71, 1.5],
];
