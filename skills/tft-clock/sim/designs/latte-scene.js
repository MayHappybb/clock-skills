// Latte: the table, the saucers and the cups (static, drawn into a buffer
// when the palette changes), the crema texture, and the palette.

import { Gfx, noise2 } from '../js/kit.js';

export const W = 160, H = 80;

// ------------------------------------------------------------ geometry
// a cappuccino for the hours, a smaller flat white for the minutes
export const CUPS = [
  { cx: 40, cy: 40, R: 39, Rin: 34.8, saucer: 42.5, handle: (3 * Math.PI) / 4, cells: [15, 42], cellY: 19 },
  { cx: 119, cy: 44, R: 33, Rin: 29.4, saucer: 36.4, handle: -Math.PI / 4, cells: [98, 121], cellY: 27 },
];
export const SIZES = [
  { cw: 23, ch: 42, hw: 2.9, pad: 6 },
  { cw: 19, ch: 34, hw: 2.4, pad: 6 },
];

// ------------------------------------------------------------ palette
// day / night pairs, mixed per frame (integer)
const PAIRS = {
  table: [0x553825, 0x24170f], grain: [0x472e1e, 0x1d120b], plank: [0x3a2518, 0x170e08], streak: [0x604030, 0x2a1b12],
  saucer: [0x3c7a7a, 0x1d3c3d], saucerLip: [0x5a9a96, 0x2b5251], saucerShade: [0x2c5d5e, 0x142c2d],
  cup: [0x316769, 0x173537], cupLip: [0x86c0b6, 0x3c6460], cupWall: [0x244d4e, 0x10282a], handleHi: [0x4d8b88, 0x22403f],
  espresso: [0x4a230e, 0x2a1307], cremaD: [0x7c4019, 0x4c260e], cremaM: [0x995526, 0x5f3316], cremaL: [0xb26a33, 0x713e1c], cremaXL: [0xc4803f, 0x7f4922],
  foam: [0xfbf4e6, 0xeadcc0], rib: [0xdab386, 0xb88f62], key: [0x34170a, 0x200d05], edge: [0x9a8574, 0x85705c],
  ghost1: [0xb07a4a, 0x6f4724], ghost2: [0xd2a676, 0xa98057], latte: [0xc69462, 0x9a7048],
  steel: [0xd8dde0, 0x8b9093], steelD: [0x7d8589, 0x464b4e],
  swan: [0xf0e3cc, 0xd7c6a6], swanRib: [0xc99d6c, 0xa47c50],
};
export const PAL_KEYS = Object.keys(PAIRS);

function mixInt(a, b, u256) {
  const r = (((a >> 16) & 255) * (256 - u256) + ((b >> 16) & 255) * u256) >> 8;
  const g = (((a >> 8) & 255) * (256 - u256) + ((b >> 8) & 255) * u256) >> 8;
  const bl = ((a & 255) * (256 - u256) + (b & 255) * u256) >> 8;
  return (r << 16) | (g << 8) | bl;
}
const to565i = (c) => (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);

/** The palette at night level `nt` (quantised to 1/16): 0xRRGGBB and RGB565. */
export function palette(nt) {
  const u = Math.round(nt * 16) * 16, P = { rgb: {}, c: {} };
  for (const k of PAL_KEYS) { const v = mixInt(PAIRS[k][0], PAIRS[k][1], u); P.rgb[k] = v; P.c[k] = to565i(v); }
  return P;
}

// ------------------------------------------------------------ the table and the cups

const GRAIN = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const gr = noise2(x / 23, y / 2.2, 7) + 0.25 * noise2(x / 6, y / 1.3, 9);
  GRAIN[y * W + x] = (y + 6) % 27 === 0 ? 3 : gr > 0.74 ? 1 : gr < 0.46 ? 2 : 0;
}

/** Draws the still parts into `bg` (a Gfx). Crema and foam are drawn per frame over it. */
export function drawSet(bg, P) {
  const c = P.rgb;
  bg.clear(c.table);
  // walnut planks: long grain along x, a seam every 27 px, flat colours (from a map made at load)
  const buf = bg.buf, TAB = [P.c.table, P.c.grain, P.c.streak, P.c.plank];
  for (let i = 0; i < W * H; i++) buf[i] = TAB[GRAIN[i]];
  bg.cost.px += W * H; bg.cost.box += W * H;
  for (const C of CUPS) {
    // the saucer, its shadow side and lip
    bg.fillCircle(C.cx + 1.5, C.cy + 1.5, C.saucer, c.plank, { aa: true });
    bg.fillCircle(C.cx, C.cy, C.saucer, c.saucer, { aa: true });
    bg.ring(C.cx, C.cy, C.saucer - 1.4, C.saucer - 0.4, c.saucerLip, { aa: true });
    bg.ring(C.cx, C.cy, C.R + 0.5, C.R + 3.2, c.saucerShade, { aa: true });
    // the handle, lying on the saucer
    const hx = C.cx + Math.cos(C.handle) * (C.R + 4), hy = C.cy + Math.sin(C.handle) * (C.R + 4);
    const hx2 = C.cx + Math.cos(C.handle) * (C.R + 1), hy2 = C.cy + Math.sin(C.handle) * (C.R + 1);
    bg.thickLine(hx2 + 1.5, hy2 + 1.5, hx + 1.5, hy + 1.5, 6.5, c.saucerShade, { aa: true });
    bg.thickLine(hx2, hy2, hx, hy, 6.5, c.cup, { aa: true });
    bg.fillCircle(hx, hy, 3.25, c.cup, { aa: true });
    bg.fillCircle(hx, hy, 1.2, c.saucer, { aa: true });
    // the cup: glaze, the lit lip, the inner wall in shade
    bg.fillCircle(C.cx, C.cy, C.R, c.cup, { aa: true });
    bg.arc(C.cx, C.cy, C.R - 2.6, C.R - 1.4, -Math.PI * 0.62, Math.PI * 0.12, c.cupLip, { aa: true });
    bg.fillCircle(C.cx, C.cy, C.Rin + 1.1, c.cupWall, { aa: true });
  }
}

// ------------------------------------------------------------ the crema

export const TEX_N = 96;
/** Flat crema mottle: 0 dark, 1 mid, 2 light (rotated per frame). */
export const TEX = new Uint8Array(TEX_N * TEX_N);
for (let y = 0; y < TEX_N; y++) for (let x = 0; x < TEX_N; x++) {
  const dx = x - 48, dy = y - 48, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
  // big soft patches, plus the "tiger" flecks the crema carries round the cup
  const n = noise2(x / 10, y / 10, 3) * 0.75 + noise2(x / 3.5, y / 3.5, 4) * 0.25;
  const tiger = Math.sin(a * 9 + r * 0.35 + noise2(x / 7, y / 7, 5) * 4) > 0.86 ? -0.16 : 0;
  const v = n + tiger;
  TEX[y * TEX_N + x] = v < 0.36 ? 0 : v > 0.66 ? 2 : 1;
}

/** Per cup: the surface's row spans and each pixel's radius x4. */
export const SURF = CUPS.map((C) => {
  const rows = [];
  const R2 = C.Rin * C.Rin;
  for (let y = 0; y < H; y++) {
    const dy = y + 0.5 - C.cy;
    if (dy * dy >= R2) continue;
    const hw = Math.sqrt(R2 - dy * dy);
    const xa = Math.max(0, Math.ceil(C.cx - hw - 0.5)), xb = Math.min(W, Math.floor(C.cx + hw + 0.5));
    const rad = new Uint8Array(xb - xa);
    for (let x = xa; x < xb; x++) rad[x - xa] = Math.min(255, Math.round(Math.hypot(x + 0.5 - C.cx, dy) * 4));
    rows.push({ y, xa, xb, rad });
  }
  return rows;
});

export function newBg() { return new Gfx(W, H); }
