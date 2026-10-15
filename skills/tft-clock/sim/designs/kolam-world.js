// Kolam's world: the doorstep, its palettes, the palm shadow, the lamp, and
// the festival rangoli field. Everything here is built once at load (flash
// tables on the device) except the palettes, which are mixed per frame.
import { hash, noise2, Gfx } from '../js/kit.js';

export const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ index map entries
// 0-3 ground grain, 4-7 the same ground wet, 8-11 flour (dim, plain, bright,
// fresh), 12 dust, 13 stray grain, 14 pulli (dots), 15 ant,
// 20-25 rangoli powders (bright), 26-31 the festival field (deep) + its cream,
// 32-41 the lamp and the marigolds.
export const I = {
  DIM: 8, FLOUR: 9, BRIGHT: 10, FRESH: 11, DUST: 12, STRAY: 13, DOT: 14, ANT: 15,
  MAG: 20, SAF: 21, TUR: 22, GRN: 23, IND: 24, KUM: 25,
  FMAG: 26, FSAF: 27, FTUR: 28, FGRN: 29, FIND: 30, FCRM: 31,
  CLAY: 32, CLAYD: 33, OIL: 34, WICK: 35, FL_O: 36, FL_Y: 37, FL_W: 38, MARI: 39, MARID: 40, LEAF: 41,
};

const DAY = [], NIGHT = [];
const set = (i, d, n) => { DAY[i] = d; NIGHT[i] = n; };
// the damp doorstep: a dark earth washed with water, warm by day, blue-black by night
set(0, [40, 36, 30], [13, 14, 19]); set(1, [50, 45, 37], [17, 18, 24]); set(2, [60, 54, 44], [22, 23, 29]); set(3, [70, 63, 51], [28, 28, 34]);
set(4, [31, 29, 26], [10, 11, 15]); set(5, [38, 35, 31], [13, 14, 19]); set(6, [45, 42, 36], [17, 18, 23]); set(7, [53, 49, 42], [21, 22, 27]);
// rice flour: warm white by day, moonlit by night
set(8, [178, 170, 152], [118, 122, 132]); set(9, [214, 207, 190], [158, 162, 174]); set(10, [236, 231, 218], [186, 190, 202]); set(11, [255, 252, 244], [222, 226, 238]);
set(12, [98, 92, 80], [44, 46, 52]); set(13, [150, 143, 128], [96, 100, 110]); set(14, [244, 240, 230], [200, 204, 214]); set(15, [20, 12, 8], [8, 6, 6]);
// rangoli powders
set(20, [222, 36, 116], [150, 30, 84]); set(21, [244, 124, 22], [168, 86, 22]); set(22, [246, 196, 34], [170, 136, 30]);
set(23, [44, 168, 84], [30, 112, 62]); set(24, [64, 96, 220], [44, 64, 150]); set(25, [226, 44, 40], [150, 34, 32]);
set(26, [140, 20, 74], [92, 16, 52]); set(27, [170, 74, 14], [112, 52, 12]); set(28, [156, 116, 14], [110, 86, 16]);
set(29, [24, 104, 54], [16, 70, 38]); set(30, [40, 54, 146], [26, 36, 96]); set(31, [122, 112, 94], [84, 80, 74]);
// the lamp: fired clay, oil, wick, flame; marigolds and a mango leaf
set(32, [168, 84, 46], [96, 52, 32]); set(33, [112, 50, 28], [64, 32, 22]); set(34, [104, 74, 24], [70, 50, 18]); set(35, [30, 20, 14], [16, 12, 10]);
set(36, [250, 128, 24], [250, 128, 24]); set(37, [255, 210, 70], [255, 210, 70]); set(38, [255, 248, 210], [255, 248, 210]);
set(39, [246, 142, 20], [170, 96, 18]); set(40, [182, 78, 10], [110, 48, 10]); set(41, [44, 96, 40], [24, 52, 26]);
for (let i = 0; i < 64; i++) if (!DAY[i]) { DAY[i] = [255, 0, 255]; NIGHT[i] = [255, 0, 255]; }
const FLAME = [36, 37, 38];

const pack = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// light levels: 0 sun, 1 frond penumbra, 2 frond shadow, 3 lamp glow near, 4 lamp glow far
export const PAL = [0, 1, 2, 3, 4].map(() => new Uint16Array(64));
/** Mix the palettes for this frame (64 x 5 entries, integer maths on the device). */
export function palettes(night) {
  const n = Math.round(night * 256), d = 256 - n;
  // per level: multiply (r, g, b) /256 and add warm light (r, g, b)
  const sunSh = 256 - ((n * 200) >> 8);   // the frond shadow fades out at night (no sun)
  const L = [
    [256, 256, 256, 0, 0, 0],
    [256 - ((36 * sunSh) >> 8), 256 - ((34 * sunSh) >> 8), 256 - ((26 * sunSh) >> 8), 0, 0, 0],
    [256 - ((72 * sunSh) >> 8), 256 - ((66 * sunSh) >> 8), 256 - ((50 * sunSh) >> 8), 0, 0, 0],
    [256 + ((n * 110) >> 8), 256 + ((n * 60) >> 8), 256 - ((n * 20) >> 8), (n * 40) >> 8, (n * 22) >> 8, (n * 6) >> 8],
    [256 + ((n * 50) >> 8), 256 + ((n * 24) >> 8), 256, (n * 18) >> 8, (n * 10) >> 8, (n * 3) >> 8],
  ];
  for (let l = 0; l < 5; l++) {
    const [mr, mg, mb, ar, ag, ab] = L[l], P = PAL[l];
    for (let i = 0; i < 64; i++) {
      const a = DAY[i], b = NIGHT[i];
      let r = (a[0] * d + b[0] * n) >> 8, g = (a[1] * d + b[1] * n) >> 8, bb = (a[2] * d + b[2] * n) >> 8;
      if (i >= 36 && i <= 38) { P[i] = pack(r, g, bb); continue; }   // the flame is its own light
      P[i] = pack(cl(((r * mr) >> 8) + ar), cl(((g * mg) >> 8) + ag), cl(((bb * mb) >> 8) + ab));
    }
  }
  return 320 * 12;
}

// ------------------------------------------------------------ the ground
export const GRAIN = new Uint8Array(N), RANK = new Uint8Array(N), GROUND = new Uint8Array(N), FINE = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  GRAIN[i] = hash(x, y, 11) & 255;
  RANK[i] = hash(x, y, 23) & 255;
  const m = noise2(x / 13, y / 9, 5), r = hash(x, y, 3) & 255;
  let v = 1;
  if (r < 8 + m * 36) v = 0; else if (r > 250) v = 3; else if (r > 243 - m * 14) v = 2;
  GROUND[i] = v;
  FINE[i] = Math.round(255 * (0.55 * noise2(x / 3.1, y / 3.1, 8) + 0.45 * noise2(x / 9, y / 7, 9)));
}

// ------------------------------------------------------------ the palm frond's shadow
// A coconut frond above the step casts a striped shadow from the top right;
// it sways. 256 wide so it wraps on a mask; 0 sun, 1 penumbra, 2 shadow.
export const SW = 256;
export const SHADOW = new Uint8Array(SW * H);
{
  const c = new Gfx(SW, H);
  c.clear(0);
  const rib = (t) => [214 - 120 * t, -14 + 64 * t + 26 * t * t];   // the midrib, top right to lower left
  c.stroke(Array.from({ length: 21 }, (_, k) => rib(k / 20)), 1.8, 0xffffff, { aa: true });
  for (let k = 0; k < 15; k++) {
    const t = 0.04 + k * 0.064, [x, y] = rib(t), [x2, y2] = rib(t + 0.01);
    const tx = x2 - x, ty = y2 - y, l = Math.hypot(tx, ty), ux = tx / l, uy = ty / l;
    const len = 14 + 12 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + (hash(k, 4) % 4);
    for (const sd of [-1, 1]) {
      // leaflets point back toward the tip, at about 40 degrees off the rib
      const a = sd * 0.75, ca = Math.cos(a), sa = Math.sin(a);
      const dx = ux * ca - uy * sa, dy = ux * sa + uy * ca;
      const droop = sd > 0 ? 3 : 1;
      c.stroke([[x, y], [x + dx * len * 0.55, y + dy * len * 0.55 + droop * 0.5], [x + dx * len, y + dy * len + droop]], 1.9, 0xffffff, { aa: true });
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < SW; x++) {
    const v = c.get(x, y) & 255;
    SHADOW[y * SW + x] = v > 140 ? 2 : v > 70 ? 1 : 0;
  }
}

// ------------------------------------------------------------ the lamp and marigolds
export const LAMP = { cx: 22, cy: 66, wx: 33, wy: 65 };
const LAMP_PX = [];   // [x, y, idx] of the static lamp, marigolds and leaf
{
  const { cx, cy } = LAMP;
  const put = (x, y, v) => LAMP_PX.push([x, y, v]);
  // a mango leaf under the lamp, pointing left
  for (let y = cy - 6; y <= cy + 8; y++) for (let x = cx - 20; x <= cx + 2; x++) {
    const u = (x - (cx - 20)) / 22, hw = 4.2 * Math.sin(Math.PI * Math.pow(u, 0.8)), yy = y - (cy + 3 - 4 * u);
    if (Math.abs(yy) < hw) put(x, y, Math.abs(yy) < 0.6 && u > 0.1 ? 29 : I.LEAF);
  }
  // the lamp from above: round at the back, drawn to a spout at the right
  for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 10; x <= cx + 13; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const hw = dx < 0 ? 6.4 * Math.sqrt(Math.max(0, 1 - (dx / 9.6) ** 2)) : 6.4 * (1 - Math.pow(dx / 12.5, 1.7));
    if (Math.abs(dy) > hw) continue;
    const e = hw - Math.abs(dy);
    const inner = dx < 0 ? Math.hypot(dx / 7.2, dy / 4.4) < 1 : Math.abs(dy) < 4.4 * (1 - Math.pow(dx / 10, 1.6));
    put(x, y, inner ? I.OIL : e < 1.2 || dy > 3.5 ? I.CLAYD : I.CLAY);
  }
  put(LAMP.wx - 1, LAMP.wy, I.WICK); put(LAMP.wx - 2, LAMP.wy, I.WICK);
  // two marigold heads
  for (const [mx, my, r] of [[47, 62, 3.6], [53, 71, 3.0], [41, 74, 2.4]]) {
    for (let y = Math.floor(my - r); y <= my + r; y++) for (let x = Math.floor(mx - r); x <= mx + r; x++) {
      const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
      if (d > r) continue;
      put(x, y, d < r * 0.35 ? I.MARID : (hash(x, y, 31) & 3) === 0 || d > r - 0.7 ? I.MARID : I.MARI);
    }
  }
}
/** Stamp the lamp, leaf and marigolds into the index map. */
export function lampInto(IDX) {
  for (const [x, y, v] of LAMP_PX) IDX[y * W + x] = v;
  return LAMP_PX.length;
}
/** The flame: a teardrop on the wick, leaning in the draught. */
export function flameInto(IDX, s, mk) {
  const sway = 1.2 * Math.sin(s * 2.3) + 0.6 * Math.sin(s * 7.1 + 1), len = 6 + 0.9 * Math.sin(s * 9.7) + 0.6 * Math.sin(s * 15.3);
  const bx = LAMP.wx, by = LAMP.wy;
  let n = 0;
  for (let y = by - 9; y <= by + 2; y++) for (let x = bx - 3; x <= bx + 4; x++) {
    const v = (by + 1.2 - (y + 0.5)) / len;          // 0 at the wick, 1 at the tip
    if (v < -0.25 || v > 1) continue;
    const cx = bx + 0.5 + sway * v * v;
    const hw = v < 0 ? 1.9 * Math.sqrt(1 - (v / 0.25) ** 2) : 1.9 * Math.pow(1 - v, 0.8) * (0.7 + 0.6 * Math.sqrt(Math.min(1, v * 4)));
    const dx = Math.abs(x + 0.5 - cx);
    if (dx > hw) continue;
    IDX[y * W + x] = dx < hw * 0.45 && v < 0.45 ? FLAME[2] : dx < hw * 0.7 && v < 0.75 ? FLAME[1] : FLAME[0];
    n++;
  }
  return n;
}
/** Distance from the flame, for the glow (u8, px). */
export const GLOWD = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) GLOWD[y * W + x] = Math.min(255, Math.round(Math.hypot(x + 0.5 - LAMP.wx, (y + 0.5 - LAMP.wy + 2) * 1.15)));

// ------------------------------------------------------------ the festival rangoli
// A lotus in rings round the colon, then a sikku lattice to the edges, in deep
// powder colours with cream outlines: what the doorstep becomes at the hour.
export const RCX = 68, RCY = 40;
export const RANGOLI = new Uint8Array(N), RDIST = new Uint8Array(N);
{
  const rings = [
    [0, 6, 0, I.FTUR, I.FTUR], [6, 15, 8, I.FMAG, I.FSAF], [15, 26, 12, I.FGRN, I.FTUR],
    [26, 40, 16, I.FSAF, I.FMAG], [40, 56, 24, I.FIND, I.FGRN], [56, 74, 32, I.FMAG, I.FIND],
  ];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - RCX, dy = y + 0.5 - RCY, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const i = y * W + x;
    RDIST[i] = Math.min(255, Math.round(r));
    let v = I.FSAF;
    const ring = rings.find((q) => r >= q[0] && r < q[1]);
    if (ring) {
      const [r0, r1, n, pc, bc] = ring;
      if (!n) v = pc;
      else {
        const q = (r - r0) / (r1 - r0), a = (th / (2 * Math.PI)) * n + (rings.indexOf(ring) % 2) * 0.5;
        const fp = a - Math.floor(a), w = Math.pow(Math.sin(Math.PI * q), 0.6) * 0.92, e = Math.abs(fp - 0.5) * 2;
        const edgePx = (Math.abs(e - w) * r * Math.PI * 2) / n / 2;
        v = e < w ? (edgePx < 0.8 ? I.FCRM : pc) : bc;
        if (Math.abs(r - r1) < 0.6) v = I.FCRM;
      }
    } else {
      // the lattice: diamonds round dots, the field the hand fills last
      const u = (x + y) / 9, w2 = (x - y) / 9, fu = u - Math.floor(u), fw = w2 - Math.floor(w2);
      const cell = (Math.floor(u) + Math.floor(w2)) & 1;
      v = Math.min(fu, 1 - fu, fw, 1 - fw) < 0.09 ? I.FCRM : cell ? I.FMAG : I.FTUR;
    }
    RANGOLI[i] = v;
  }
}
