// Shanshui numerals: ten landforms, not a font. Each digit is drawn as the
// outline of a rock mass on a 12 x 24 grid (rings, even-odd, so counters are
// real holes the scroll shows through), then rasterised at the size asked
// for with a cliff-fluting domain warp, and painted in the blue-green manner:
// azurite on the crests, malachite on the slopes, ochre at the foot, a gold
// line on every skyward ridge, an ink line on the shadowed side and vertical
// ink texture strokes (cun) on the faces.
//
//   0  a ring of cliffs round a mountain lake (the counter holds water)
//   1  a needle peak with a pine on the jutting crag
//   2  a hook-crested peak whose ridge runs down to a flat terrace
//   3  two stacked bluffs over a cove
//   4  a leaning crag and a pillar joined by a stone bridge
//   5  a mesa: flat top, sheer left cliff, a bellied bluff below
//   6  a curling crest over a grotto
//   7  an overhang on a leaning needle
//   8  a scholar's rock: two stacked masses pierced by two holes
//   9  a peak with a high cave and a long tail ridge
//
// The result is a hard-pixel sprite ({ w, h, data }, what g.blit takes):
// built once per digit, size and minute (the colours follow the time of
// day), the firmware would keep it as a small RGB565 bitmap.

import { hex, mix, scale, noise2, rand, clamp } from '../js/kit.js';

export const GLYPHS = [
  // 0: ring of cliffs round a lake
  [[[3.5, 0.8], [5, 0], [6.2, 0.9], [7.5, 0.2], [9.2, 1.2], [10.6, 3.6], [11.4, 7], [11.8, 11], [11.6, 15.5], [11, 19.5], [11.6, 22], [12, 24],
    [0, 24], [0.6, 21.5], [0.8, 18], [0.2, 13], [0.3, 8], [1.2, 4.2], [2.2, 2]],
   [[5, 4.6], [6.8, 4.2], [7.9, 6], [8.3, 10], [8.2, 15], [7.9, 18.6], [6, 19.6], [4.2, 19.4], [3.8, 16], [3.7, 11], [4, 7]]],
  // 1: needle peak with a flag crag
  [[[2.5, 24], [3.6, 21], [4, 16], [4.1, 10], [3.9, 6.8], [2.4, 7.6], [0.6, 8.4], [1.2, 6.4], [3.2, 3.6], [5, 1.2], [6.4, 0], [7.6, 1.6],
    [8, 5], [8.1, 11], [8.4, 17], [9, 21], [10, 24]]],
  // 2: hook crest, ridge, terrace
  [[[0.6, 7.6], [0.9, 4.4], [2.6, 1.6], [5.2, 0], [8, 0.4], [10.4, 2.2], [11.6, 5.2], [11.2, 8.8], [9.6, 12], [7.2, 15], [5.4, 17.6], [4.8, 19.6],
    [8.5, 19.8], [10.4, 19.2], [12, 19.6], [12, 24], [0, 24], [0.2, 21.2], [2.2, 17.4], [4.8, 13.6], [7, 10.2], [7.8, 7.2], [7.2, 4.8], [5.6, 4],
    [4.2, 4.6], [3.6, 6.6], [2.2, 8]]],
  // 3: stacked bluffs
  [[[0.8, 2.6], [3.2, 0.6], [6.5, 0], [9.6, 0.8], [11.4, 3.2], [11.4, 6.8], [10.2, 9.6], [8.8, 11.2], [10.6, 12.6], [11.8, 15.4], [11.6, 19.4],
    [10.2, 22.4], [8.6, 24], [2.4, 24], [0.2, 21], [3.4, 19.4], [5.4, 20.2], [7, 19.8], [7.9, 17.6], [7.6, 15], [6, 13.4], [4, 13.2], [4, 9.8],
    [6, 9.6], [7.3, 8], [7.5, 5.6], [6.4, 4.2], [4.4, 4], [2.6, 5.4]]],
  // 4: leaning crag, pillar, stone bridge
  [[[7.2, 0], [10, 0.4], [9.8, 13.8], [12, 14.2], [11.8, 18.4], [9.8, 18.2], [10, 24], [5.8, 24], [6, 18.4], [0, 18.4], [0.2, 14.4], [4.4, 6.8]],
   [[6.1, 5.4], [6.1, 14.3], [3.3, 14.3]]],
  // 5: mesa and bluff
  [[[1.2, 0.4], [11.4, 0], [11.6, 4], [4.8, 4.2], [4.4, 8.6], [7, 8], [9.8, 9], [11.6, 11.8], [12, 16], [11.2, 20], [9, 23], [6, 24],
    [2.4, 23.8], [0, 21.4], [1.4, 19], [3.6, 20], [6, 20], [7.8, 18.2], [8, 15], [6.8, 12.8], [4.4, 12.6], [2.6, 13.6], [0.6, 13]]],
  // 6: curling crest over a grotto
  [[[9.6, 1.6], [7, 0], [4.2, 0.8], [2, 3.4], [0.6, 7.6], [0, 12.6], [0.2, 17.6], [1.4, 21.4], [4, 23.6], [7.6, 24], [10.4, 22.4], [11.8, 19],
    [11.8, 15], [10.6, 11.8], [8.2, 10.2], [5.6, 10.2], [4, 11.2], [4.4, 7.4], [5.6, 4.8], [7.4, 4], [9, 4.6], [10.8, 4.4]],
   [[4, 15.2], [5.4, 13.6], [7, 13.6], [8.1, 15.4], [8.1, 18.6], [6.8, 20.4], [5.2, 20.4], [4.1, 18.8]]],
  // 7: overhang on a leaning needle
  [[[0.4, 0.2], [11.6, 0], [12, 3.4], [9.6, 7.6], [7.6, 12.6], [6.4, 17.6], [6.2, 21], [6.8, 24], [1.8, 24], [2.2, 20.6], [3.4, 15.4],
    [5.2, 10.4], [7.4, 4.4], [0.6, 4.4]]],
  // 8: scholar's rock
  [[[3, 0.8], [6, 0], [9, 0.8], [10.8, 3], [10.8, 6.6], [9.4, 9.6], [8.4, 10.8], [10.6, 12.6], [12, 16], [11.6, 20.2], [9.6, 23.2], [6, 24],
    [2.4, 23.2], [0.4, 20.2], [0, 16], [1.4, 12.6], [3.6, 10.8], [2.4, 9.4], [1.2, 6.6], [1.2, 3.2]],
   [[4.6, 4], [6, 3.6], [7.4, 4.2], [7.6, 6.4], [6.6, 8.4], [5.4, 8.4], [4.4, 6.6]],
   [[4.2, 14.2], [6, 13.4], [7.8, 14.2], [8.4, 16.8], [7.8, 19.6], [6, 20.4], [4.2, 19.6], [3.6, 16.8]]],
  // 9: high cave, tail ridge
  [[[2.4, 22.4], [5, 24], [7.8, 23.2], [10, 20.6], [11.4, 16.4], [12, 11.4], [11.8, 6.4], [10.6, 2.6], [8, 0.4], [4.4, 0], [1.6, 1.6], [0.2, 5],
    [0.2, 9], [1.4, 12.2], [3.8, 13.8], [6.4, 13.8], [8, 12.8], [7.6, 16.6], [6.4, 19.2], [4.6, 20], [3, 19.4], [1.2, 19.6]],
   [[3.9, 4.4], [5, 3.6], [6.8, 3.6], [8, 5.2], [8, 8.6], [6.6, 10.4], [5, 10.4], [3.9, 8.8]]],
];

function inRing(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGlyph = (d, u, v) => GLYPHS[d].reduce((acc, ring) => acc !== inRing(u, v, ring), false);

// mineral pigments (see the design's header for the palette)
export const PIG = {
  az: hex('2c5aa0'), azD: hex('1b376c'), azL: hex('5d8fd0'),
  ma: hex('2f9468'), maD: hex('1c6248'), maL: hex('74c896'),
  och: hex('a5653a'), ochD: hex('6a3e24'),
  gold: hex('f0c050'), ink: hex('261f2a'),
  water: hex('9cc4b8'), waterL: hex('d8eadc'),
  pine: hex('1f4a34'),
};

/**
 * The shape of digit d at w x h: a palette-indexed bitmap (0 transparent),
 * the palette of untoned pigments, and the gold contour pixels. A constant
 * table, built once at start-up. `seed` varies the crags between slots.
 */
export function buildShape(d, w, h, seed = 0) {
  const tone = (c) => c;
  const mask = new Uint8Array(w * h);
  const hole = new Uint8Array(w * h);   // counters (for the lake in 0)
  const outer = GLYPHS[d][0];
  const head = h > 50 ? 3 : 2;   // headroom for the crowns
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // cliff fluting: horizontal warp that varies fast across x, slowly down y
      const wx = (noise2(x * 0.55, y * 0.16, 11 + seed) - 0.5) * 1.5;
      const wy = (noise2(x * 0.3, y * 0.3, 23 + seed) - 0.5) * 0.9;
      const u = ((x + 0.5 + wx) / w) * 12, v = ((y + 0.5 + wy - head) / (h - head)) * 24;
      const i = y * w + x;
      if (inGlyph(d, u, v)) mask[i] = 1;
      else if (inRing(u, v, outer)) hole[i] = 1;
    }
  // crowns: every skyward outer edge grows a cluster of small peaks, a
  // triangle wave of random period (counters are left alone)
  const big = h > 50, amp = big ? 2.6 : 1.7;
  const crown = new Float32Array(w);
  {
    let x = 0, k = 0;
    while (x < w) {
      const per = (big ? 6 : 5) + Math.floor(rand(k, seed, 51) * 4), hgt = amp * (0.5 + 0.5 * rand(k, seed, 52));
      for (let i = 0; i < per && x + i < w; i++) crown[x + i] = hgt * (1 - Math.abs((i + 0.5) / per * 2 - 1));
      x += per; k++;
    }
  }
  const grown = mask.slice();
  for (let x = 0; x < w; x++)
    for (let y = 1; y < h; y++) {
      if (!mask[y * w + x] || mask[(y - 1) * w + x] || hole[(y - 1) * w + x]) continue;
      if (y > h * 0.8) continue;
      const n = Math.round(crown[x]);
      for (let j = 1; j <= n && y - j >= 0; j++) {
        if (hole[(y - j) * w + x]) break;
        grown[(y - j) * w + x] = 1;
      }
    }
  mask.set(grown);
  // the foot always meets the ground cleanly
  const at =(x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : (y >= h ? 1 : 0));
  // scanline distances to the outside, capped
  const CAP = 9;
  const run = (x, y, dx, dy) => { let n = 1; while (n < CAP && at(x + dx * n, y + dy * n)) n++; return n; };

  const data = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) {
        // the lake in the ring of cliffs: lower part of the counter
        if (d === 0 && hole[i] && y > h * 0.55) {
          const top = y < h * 0.55 + 1.5;
          data[i] = tone(top ? PIG.waterL : mix(PIG.water, PIG.az, (y / h - 0.55) * 1.2));
        }
        continue;
      }
      const nL = run(x, y, -1, 0), nR = run(x, y, 1, 0), nU = run(x, y, 0, -1), nD = run(x, y, 0, 1);
      const alt = y / h + (noise2(x * 0.25, y * 0.1, 5 + seed) - 0.5) * 0.16;
      // light from the upper left
      const f = (nL - 0.5) / (nL + nR - 1);   // 0 at the left face, 1 at the right
      // the pigment: azurite crests, malachite slopes, the ochre ground showing
      // through on the foot and climbing the shadowed side
      const p = alt + 0.3 * (f - 0.5);
      let L, M, D;
      if (p < 0.36) { L = PIG.azL; M = PIG.az; D = PIG.azD; }
      else if (p < 0.8) { L = PIG.maL; M = PIG.ma; D = PIG.maD; }
      else { L = mix(PIG.och, 0xf0d0a0, 0.35); M = PIG.och; D = PIG.ochD; }
      let c;
      if (f < 0.26 || nU <= (big ? 2 : 1)) c = L;
      else if (f > 0.7) c = D;
      else c = M;
      // cun: vertical texture strokes down the faces, light on the lit side, ink on the shaded
      const col = x + Math.floor(rand(Math.floor(y / 5), seed, 3) * 3);
      if (nL > 1 && nR > 1 && nU > 2 && col % 3 === 0 && rand(x, Math.floor(y / (big ? 4 : 3)), seed + 7) > (big ? 0.4 : 0.6))
        c = f < 0.45 ? mix(c, 0xffffff, 0.22) : mix(c, PIG.ink, 0.45);
      // ledges: short horizontal cracks, a lit lip above an ink shadow
      if (big && nL > 1 && nR > 1 && nU > 3) {
        const ly = (y + Math.floor(4 * noise2(x * 0.15, 0, seed + 61))) % 10;
        if (rand(Math.floor(x / 4), Math.floor(y / 10), seed + 62) > 0.5) {
          if (ly === 0) c = mix(c, PIG.ink, 0.55);
          else if (ly === 9) c = mix(c, 0xffffff, 0.2);
        }
      }
      // contours: gold on skyward ridges and the lit flank, ink on the shadowed side
      if (nU === 1) c = PIG.gold;
      else if (nL === 1 && nD > 1) c = mix(PIG.gold, L, 0.45);
      else if (nR === 1 || nD === 1) c = PIG.ink;
      data[i] = tone(c);
    }
  // a pine on the needle's flag crag
  if (d === 1) {
    const px = Math.round(w * 0.12), py = Math.round(h * 0.3);
    const pine = big
      ? ['..g..', '.ggg.', 'ggggg', '..t..']
      : ['.g.', 'ggg', '.t.'];
    for (let j = 0; j < pine.length; j++)
      for (let i = 0; i < pine[j].length; i++) {
        const ch = pine[j][i];
        if (ch === '.') continue;
        const xx = px + i - 1, yy = py - pine.length + j + 1;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) data[yy * w + xx] = tone(ch === 'g' ? PIG.pine : PIG.ink);
      }
  }
  const pal = [], at2 = new Map(), idx = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i] < 0) continue;
    let k = at2.get(data[i]);
    if (k === undefined) { k = pal.length + 1; pal.push(data[i]); at2.set(data[i], k); }
    idx[i] = k;
  }
  if (pal.length > 255) throw new Error('shanshui glyph palette overflow');
  return { w, h, idx, pal };
}

/** The shape coloured through `tone` (the time of day): a sprite for g.blit. A lookup per pixel. */
export function colourShape(sh, tone) {
  const pal = sh.pal.map(tone), n = sh.w * sh.h, data = new Int32Array(n);
  const gk = sh.pal.indexOf(PIG.gold) + 1, gold = [];
  for (let i = 0; i < n; i++) {
    data[i] = sh.idx[i] ? pal[sh.idx[i] - 1] : -1;
    if (gk && sh.idx[i] === gk) gold.push(i % sh.w, (i / sh.w) | 0);
  }
  return { w: sh.w, h: sh.h, data, gold: Int16Array.from(gold) };
}
