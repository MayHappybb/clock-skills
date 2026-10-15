// Topo land: the map sheet the massifs stand on, built once at load (flash).
//   B0    the valley floor's height (Int8 per pixel): high ground to the
//         north, a valley and a lake basin to the south east
//   B1    a second, gentle relief (Int8) the face breathes in and out slowly
//   LAKE  the lake as printed (Uint16 RGB565, 0 = land): flat lake blue,
//         depth lines, a darker shore line
//   RANK  a per-pixel rank 0..255 (Uint8) for erosion and scree stipple
//   trails: the red hiking trails, as dash pixels and as walkable paths

import { noise2, hash, to565 } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

export const LAKE_C = { fill: 0xa8d2ee, deep: 0x8cc2e8, line: 0x5aa4dc, shore: 0x2f7fc1 };
export const LAKE_N = { fill: 0x38556e, deep: 0x30506a, line: 0x4c7896, shore: 0x6a9cc0 };

// the lake basin: a long lake under the minutes, its west arm reaching into the pass
function lakeDepth(x, y) {
  const a = ((x - 120) / 38) ** 2 + ((y - 70) / 11) ** 2;          // main body
  const b = ((x - 90) / 12) ** 2 + ((y - 72) / 6) ** 2;            // west arm
  const e = Math.min(a, b * 1.1);
  const n = (noise2(x / 9, y / 7, 41) - 0.5) * 0.45;
  return 1 - e + n;                                                 // > 0 is water
}

export const B0 = new Int8Array(N), B1 = new Int8Array(N), RANK = new Uint8Array(N);
// WATER is the lake's print class per pixel: 0 land, 1 fill, 2 deep, 3 depth line, 4 shore
export const WATER = new Uint8Array(N);
const depth = new Float32Array(N);

for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const ld = lakeDepth(x + 0.5, y + 0.5);
    depth[i] = ld;
    // land: north is high, a broad valley along the south, hummocks of noise
    const north = 22 * (1 - y / 80) ** 1.4;
    const hum = (noise2(x / 26, y / 18, 7) - 0.5) * 24 + (noise2(x / 11, y / 9, 9) - 0.5) * 6;
    let h = north + hum + 10;
    if (ld > -0.6) h -= (ld + 0.6) * 22;                            // the land dips into the basin
    B0[i] = Math.max(-60, Math.min(100, Math.round(h)));
    B1[i] = Math.round((noise2(x / 18, y / 13, 23) - 0.5) * 36);
    RANK[i] = hash(x, y, 77) & 255;
    WATER[i] = ld > 0 ? 1 : 0;
  }

// the printed lake: depth lines every step, the shore one pixel inside the water's edge
{
  const wet = WATER.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!wet[i]) continue;
      const shore = (x > 0 && !wet[i - 1]) || (x < W - 1 && !wet[i + 1]) || (y > 0 && !wet[i - W]) || (y < H - 1 && !wet[i + W]);
      const k = Math.floor(depth[i] / 0.45);
      const kr = x < W - 1 && wet[i + 1] ? Math.floor(depth[i + 1] / 0.45) : k;
      const kd = y < H - 1 && wet[i + W] ? Math.floor(depth[i + W] / 0.45) : k;
      let c = k >= 2 ? 2 : 1;
      if (k !== kr || k !== kd) c = 3;
      if (shore) c = 4;
      WATER[i] = c;
    }
}

// ------------------------------------------------------------ trails

// trails as polylines (pixel centres); a hiker's path is the trail resampled every 0.5 px
const PASS = [[76, 70], [70, 63], [78, 58], [69, 52], [77, 46], [69, 40], [76, 33], [68, 27], [76, 20], [69, 13], [75, 6], [73, -3]];
const TRAILS = [
  // the pass trail: from the lake's west shore, switchbacks up between the massifs, over the top edge
  [[79, 82], ...PASS],
  // the valley trail along the foot of the hours, joining the pass trail
  [[-3, 75], [12, 72], [28, 75], [46, 72], [62, 75], ...PASS],
];

function resample(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const PATHS = TRAILS.map((t) => resample(t, 0.5));

// dash pixels: 3 on, 2 off, measured along the trail; skipped on water
export const DASH = [];
{
  const seen = new Set();
  for (const p of PATHS) {
    let last = -1;
    p.forEach(([x, y], k) => {
      const px = Math.floor(x), py = Math.floor(y), key = py * W + px;
      if (px < 0 || py < 0 || px >= W || py >= H || key === last) return;
      last = key;
      const along = k * 0.5;
      if (along % 5 >= 3) return;
      if (WATER[key] || seen.has(key)) return;
      seen.add(key);
      DASH.push(key);
    });
  }
}

// the colon: two tarns in the pass, little round lakes
export const TARNS = [[83.5, 25.5], [83.5, 36.5]];

// the lake steamer's route (a dashed ferry line), west landing to east landing
export const FERRY = [[93, 71], [112, 66.5], [134, 68], [150, 72]];
export const FERRY_PATH = resample(FERRY, 0.25);
