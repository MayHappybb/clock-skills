// The chart sheet for chart.js: the static engraving (paper, rhumb lines,
// compass rose, the graduated neat-line, the ship's dotted track) as a byte
// map of materials, looked up through the palette every frame; the two
// palettes (hand-coloured day, cyanotype night) and the storm's darkening;
// and the island tables with the layer coverage of the coast.

import { rand, R, G, B } from '../js/kit.js';
import { buildGlyph } from './chart-glyphs.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ materials
export const M = {
  SEA: 0, GRAIN: 1, RHUMB: 2, INK: 3, LAND: 4, PAPER: 5, BANDH: 6, BANDM: 7,
  SHALLOW: 8, WLINE: 9, RED: 10, GOLD: 11, SERP: 12, CLOUD: 13, RAIN: 14, TREE: 15,
};
export const NMAT = 16;

// Day: a hand-coloured copperplate. Iron-gall ink on rag paper, the sea a
// pale verdigris wash deepened along the coasts, the land a warm ochre wash,
// each territory's coast edged inside with a band of colour (carmine for the
// hours, verdigris-blue for the minutes) the way colourists edged borders.
export const DAY = [
  0xebe2c4, 0xdcd1b0, 0xc2b088, 0x2c2117, 0xe8b45e, 0xf8f0d8, 0xc23f52, 0x2f7f86,
  0x92c0c6, 0x3f646c, 0xb83c34, 0xc9962c, 0x7d8f96, 0xe9e3cc, 0x6c8a8e, 0x4a7a36,
];
// Night: the chart's cyanotype copy, the way charts were duplicated: Prussian
// blue ground, the engraving in white. Deep blue is a deliberate dark on the
// LCD; the islands are the lightest, warmest-white things on it.
export const NIGHT = [
  0x12306a, 0x15346f, 0x234a8c, 0xf4f8ff, 0x4a7fd0, 0x9ab8e6, 0xffffff, 0xc6dcff,
  0x1c3f80, 0x7aa0dc, 0xf0a8a0, 0xd8c890, 0x3d6cb8, 0x23498c, 0x8aa8de, 0xbfe0ff,
];
// The storm darkens the sea and its engraving (a squall line coloured in slate).
export const STORM = { 0: 0xd9d5bf, 1: 0xcdc7ad, 2: 0xb9b294, 8: 0x7fa6ae, 9: 0x2e4850, 14: 0x6d6150 };
export const STORM_NIGHT = { 0: 0x0f2a60, 1: 0x112d64, 2: 0x1d4282, 8: 0x183a7a, 9: 0x86aae4, 14: 0x7f9fd8 };

export function mixRGB(a, b, u) {
  const k = Math.round(u * 256);
  const r = (R(a) * (256 - k) + R(b) * k) >> 8, g = (G(a) * (256 - k) + G(b) * k) >> 8, bl = (B(a) * (256 - k) + B(b) * k) >> 8;
  return (r << 16) | (g << 8) | bl;
}

// ------------------------------------------------------------ the engraving
export const ROSE = { x: 147, y: 14 };
export const TRACK = { x0: 84, x1: 130, y: 21 };
export const BG = new Uint8Array(W * H);

function poly(pts, mat) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && x >= 0 && y >= 0 && x < W && y < H) BG[y * W + x] = mat;
    }
}

(function engrave() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) BG[y * W + x] = rand(x, y, 5) < 0.07 ? M.GRAIN : M.SEA;
  // rhumb lines: sixteen winds from the rose, the half-winds dashed
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    for (let r = 11; r < 200; r += 0.35) {
      if (k & 1 && (Math.floor(r / 2) & 1)) continue;
      const x = Math.floor(ROSE.x + 0.5 + r * Math.cos(a)), y = Math.floor(ROSE.y + 0.5 + r * Math.sin(a));
      if (x >= 0 && y >= 0 && x < W && y < H) BG[y * W + x] = M.RHUMB;
    }
  }
  // the ship's track, dotted
  for (let x = TRACK.x0; x <= TRACK.x1; x += 3) BG[TRACK.y * W + x] = M.WLINE;
  // the rose: four half-winds in red and paper, four cardinal points in ink and paper
  const cx = ROSE.x + 0.5, cy = ROSE.y + 0.5;
  const pt = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  for (const [len, base, dark, light] of [[7.5, Math.PI / 4, M.RED, M.BANDM], [11.5, 0, M.INK, M.GOLD]])
    for (let q = 0; q < 4; q++) {
      const a = base + (q * Math.PI) / 2;
      poly([[cx, cy], pt(a, len), pt(a - Math.PI / 4, len > 9 ? 4.2 : 3.2)], dark);
      poly([[cx, cy], pt(a, len), pt(a + Math.PI / 4, len > 9 ? 4.2 : 3.2)], light);
    }
  BG[(ROSE.y) * W + ROSE.x] = M.GOLD;
  // the fleur-de-lis at north
  for (const [dx, dy] of [[0, -12], [-1, -12], [1, -12], [-2, -13], [2, -13], [0, -13], [0, -14]]) BG[(ROSE.y + dy) * W + ROSE.x + dx] = M.INK;
  // the neat-line: ink, a graduated scale of minutes of latitude, ink
  for (let x = 0; x < W; x++)
    for (const [y, yy] of [[0, H - 1], [1, H - 2], [2, H - 3]]) {
      const m = y === 1 ? ((x >> 2) & 1 ? M.INK : M.PAPER) : M.INK;
      BG[y * W + x] = m; BG[yy * W + x] = m;
    }
  for (let y = 0; y < H; y++)
    for (const [x, xx] of [[0, W - 1], [1, W - 2], [2, W - 3]]) {
      const m = x === 1 ? ((y >> 2) & 1 ? M.INK : M.PAPER) : M.INK;
      BG[y * W + x] = m; BG[y * W + xx] = m;
    }
})();

// ------------------------------------------------------------ the islands

// four places on the chart: big hour islands left, the minutes' smaller pair lower right
export const SLOTS = [
  { x: 6, y: 13, size: 0 },
  { x: 41, y: 11, size: 0 },
  { x: 92, y: 34, size: 1 },
  { x: 121, y: 31, size: 1 },
];
export const SIZES = [
  { w: 32, h: 56, rmin: 3.3, r: 6.0, band: 1.3, mat: M.BANDH },
  { w: 26, h: 40, rmin: 2.8, r: 4.9, band: 1.1, mat: M.BANDM },
];
export const GLYPHS = SIZES.map((s, si) => Array.from({ length: 10 }, (_, d) => buildGlyph(d, s.w, s.h, s.rmin, s.r, 101 + d * 7 + si * 3)));

// The coast in layers, as coverage of each by distance (box-filtered over a
// pixel): LUT entry e is distance (e - 32) / 4 px; below 0 it is the land.
export const LUT_N = 80, LUT_OFF = 32;
// layer: [lo, hi, material, alpha]; WL = water-lines (engraved offshore)
export const LINES = [3.0, 5.0, 7.6];
export function layers(size) {
  const s = SIZES[size];
  return [
    [-99, 0, M.LAND, 1],
    [-0.2, 2.2, M.SHALLOW, 0.8],
    ...LINES.map((c, k) => [c - 0.3, c + 0.3, M.WLINE, [0.9, 0.7, 0.45][k]]),
    [-1.0 - s.band, -1.0, s.mat, 1],
    [-1.05, 0.3, M.INK, 1],
  ];
}
export const COV = SIZES.map((_, si) => layers(si).map(([lo, hi]) => {
  const c = new Uint16Array(LUT_N);
  for (let e = 0; e < LUT_N; e++) {
    const d = (e - LUT_OFF) / 4;
    c[e] = Math.round(256 * Math.max(0, Math.min(1, Math.min(hi, d + 0.5) - Math.max(lo, d - 0.5))));
  }
  return c;
}));
