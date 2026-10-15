// The plate: palette, static tables, and the standing-wave field.
//
// The glass is the plate: a free 2:1 rectangle, 160 x 80. Its modes
// cos(p pi u) cos(q pi v) (u, v in 0..1 across it) ring at k^2 = p^2/4 + q^2,
// so (2a, b) and (2b, a) ring at the same note, and a Chladni figure is their
// sum, the classic approximation:
//   F = cos(2a pi u) cos(b pi v) + s cos(2b pi u) cos(a pi v).
// With a and b of the same parity it is mirror-symmetric about both axes
// through the driver. It is separable, so a frame needs only per-column and per-row tables
// (cos and its slope) and four multiply-adds a pixel. Sand lies on F = 0;
// the distance to the line is |F| / |grad F|, the gradient taken on a 4 px
// grid and interpolated.

import { R, G, B, rand, noise2, sin, cos } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;
export const DX = 80, DY = 40;

// ------------------------------------------------------------ palette

// Cobalt, hue 215: the colour of a struck steel plate under a cold lamp and
// of fine quartz sand in that light. Nine named shades, one ramp:
//   pit     #060c1a  the plate's deepest corners (near-black, still blue)
//   plate   #0b1830  bare steel
//   steel   #122a50  steel catching the lamp, the antinode glow
//   bed     #1d4278  fine sand thinly spread on the nodal lines
//   cobalt  #2f63aa  the background figure's crest, flying sand
//   lamp    #5688d0  ridge feet, glints
//   sand    #94b8ec  the numeral ridges
//   frost   #d0e1f8  ridge crests
//   ice     #f4f8ff  hopping grains, the bolt
// Every pixel is one of 64 RGB565 steps along this ramp, each snapped to a
// 565 value within a few degrees of 215 (dark 565 values drift toward
// violet or teal otherwise), dithered between neighbours.
const RAMP = [[0, 0x060c1a], [0.12, 0x0b1830], [0.24, 0x122a50], [0.38, 0x1d4278], [0.52, 0x2f63aa],
  [0.66, 0x5688d0], [0.8, 0x94b8ec], [0.92, 0xd0e1f8], [1, 0xf4f8ff]];
const HUE = 215;

function hueChroma(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
  if (!ch) return [0, 0];
  let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
  return [(h * 60 + 360) % 360, ch];
}

function snap(r, g, b) {
  let best = 0, bestE = Infinity;
  const r5 = Math.round((r * 31) / 255), g6 = Math.round((g * 63) / 255), b5 = Math.round((b * 31) / 255);
  for (let dr = -1; dr <= 1; dr++) for (let dg = -2; dg <= 2; dg++) for (let db = -1; db <= 1; db++) {
    const rr = r5 + dr, gg = g6 + dg, bb = b5 + db;
    if (rr < 0 || gg < 0 || bb < 0 || rr > 31 || gg > 63 || bb > 31) continue;
    const R8 = (rr << 3) | (rr >> 2), G8 = (gg << 2) | (gg >> 4), B8 = (bb << 3) | (bb >> 2);
    const [h, ch] = hueChroma(R8, G8, B8);
    const dh = Math.min(Math.abs(h - HUE), 360 - Math.abs(h - HUE));
    if (ch >= 20 && dh > 7) continue;
    const e = (R8 - r) ** 2 * 0.3 + (G8 - g) ** 2 * 0.59 + (B8 - b) ** 2 * 0.11;
    if (e < bestE) { bestE = e; best = (rr << 11) | (gg << 5) | bb; }
  }
  return best;
}

function rampAt(u) {
  let k = 1;
  while (k < RAMP.length - 1 && RAMP[k][0] < u) k++;
  const [p0, c0] = RAMP[k - 1], [p1, c1] = RAMP[k], f = Math.max(0, Math.min(1, (u - p0) / (p1 - p0)));
  return [R(c0) + (R(c1) - R(c0)) * f, G(c0) + (G(c1) - G(c0)) * f, B(c0) + (B(c1) - B(c0)) * f];
}

export const PAL = new Uint16Array(64);
export const NPAL = new Uint16Array(64);   // night: the plate sinks to the deep end, the sand keeps its light
for (let i = 0; i < 64; i++) {
  const u = i / 63;
  PAL[i] = snap(...rampAt(u));
  const n = u < 0.45 ? u * 0.55 : 0.2475 + ((u - 0.45) * (0.76 - 0.2475)) / 0.55;
  NPAL[i] = snap(...rampAt(n));
}

export const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

// ------------------------------------------------------------ static tables (flash)

/** Bare plate value: a lamp-lit band through the middle, darker corners, faint brushed grain. */
export const BASE = new Uint8Array(N);
/** Per-pixel grain threshold for the background sand. */
export const GT = new Uint8Array(N);
/** Distance from the driver, half pixels. */
export const RAD = new Uint8Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x + 0.5 - DX) / 80, dy = (y + 0.5 - DY) / 40;
    const vig = dx * dx * 0.55 + dy * dy * 0.45;
    const brush = noise2(x / 23, y * 0.9, 3) - 0.5;
    BASE[i] = Math.round(Math.max(14, Math.min(58, 52 - 26 * vig + 8 * brush)));
    GT[i] = Math.floor(rand(x, y, 5) * 255);
    RAD[i] = Math.min(255, Math.round(2 * Math.hypot(x + 0.5 - DX, y + 0.5 - DY)));
  }

/**
 * Sand density by distance to the nodal line (quarter pixels), for 16 levels
 * of scatter: a crisp core and a sprinkled foot at rest, a wide thin haze when
 * the plate is shaken.
 */
export const DEN = [], FOOT = [];
for (let k = 0; k < 16; k++) {
  const sc = k / 15, w = 0.8 * (1 + 2.4 * sc), t = new Uint8Array(64), f = new Uint8Array(64);
  for (let q = 0; q < 64; q++) {
    const d = q / 4;
    t[q] = Math.round(255 * Math.exp(-((d / w) ** 2)) * (1 - 0.5 * sc));
    f[q] = Math.round(255 * (0.32 + 0.3 * sc) * Math.exp(-d / (1.6 + 3 * sc)));
  }
  DEN.push(t); FOOT.push(f);
}

// ------------------------------------------------------------ modes

// [n, m, sign]: picked by eye for figures that are open enough around the
// numerals and have the lenses, rings and crosses of real Chladni plates.
// The first NREST are the calm figures a minute rests on; the rest are the
// higher harmonics the hour sweeps through.
export const MODES = [
  [1, 3, -1], [1, 3, 1], [1, 5, 1], [1, 5, -1], [3, 5, 1], [3, 5, -1], [2, 4, 1], [2, 4, -1], [2, 6, 1], [2, 6, -1],
  [3, 7, -1], [5, 7, 1], [4, 6, -1], [1, 7, 1], [3, 7, 1],
];
export const NREST = 10;

const MODE_CACHE = new Map();
let modeOps = 0;
export const takeModeOps = () => { const n = modeOps; modeOps = 0; return n; };

/** Column and row tables for a mode: cos and slope (per pixel), 960 table sines, cached. */
export function modeTables(k) {
  let t = MODE_CACHE.get(k);
  if (t) return t;
  const [a, b, s] = MODES[k], p1 = 2 * a * Math.PI, q1 = b * Math.PI, p2 = 2 * b * Math.PI, q2 = a * Math.PI;
  const X1 = new Float32Array(W), X2 = new Float32Array(W), dX1 = new Float32Array(W), dX2 = new Float32Array(W);
  const Y1 = new Float32Array(H), Y2 = new Float32Array(H), dY1 = new Float32Array(H), dY2 = new Float32Array(H);
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W;
    X1[x] = cos(p1 * u); X2[x] = cos(p2 * u);
    dX1[x] = (-p1 / W) * sin(p1 * u); dX2[x] = (-p2 / W) * sin(p2 * u);
  }
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    Y1[y] = cos(q1 * v); Y2[y] = cos(q2 * v);
    dY1[y] = (-q1 / H) * sin(q1 * v); dY2[y] = (-q2 / H) * sin(q2 * v);
  }
  modeOps += (W + H) * 4;
  t = { X1, X2, dX1, dX2, Y1, Y2, dY1, dY2, s };
  MODE_CACHE.set(k, t);
  if (MODE_CACHE.size > 4) MODE_CACHE.delete(MODE_CACHE.keys().next().value);
  return t;
}
