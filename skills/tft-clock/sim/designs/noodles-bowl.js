// The bowl of "noodles": palette, the noodle bed under the broth, the rim,
// and the one per-pixel pass that paints them.
//
// Top-down into a big ramen bowl. The broth fills the glass; in the four
// corners the bowl's porcelain lip shows, with the red thunder-meander band
// (raimon) every ramen bowl wears. Under the surface lies the rest of the
// noodles: a bed of dim, broth-tinted strands (where two overlap they are a
// shade lighter, as through clear soup), turning slowly with the stirred
// broth. Rings from the chopsticks' taps roll across the surface.
//
// Flash: bed texture 256 x 256 bytes (64 KB), rim class map and the
// distance-to-the-dip table 160 x 80 (12.8 KB + 25.6 KB). The pass is a
// few integer ops a pixel (charged as box work).

import { rng, clamp } from '../js/kit.js';
import { to565 } from '../js/color.js';

export const W = 160, H = 80;
export const BOWL_X = 80, BOWL_Y = 40, BOWL_R = 82;
export const DIP_X = 76.5, DIP_Y = 9.5;            // where the chopsticks tap at rest

// ------------------------------------------------------------ palette
// index -> colour; day and night, blended per frame by ctx.night
export const C = {
  BROTH: 0, BED1: 1, BED2: 2, RIP1: 3, RIP2: 4,
  LIP: 5, BAND: 6, MEANDER: 7, RIMLINE: 8,
  FILL: 9, KEY: 10, OIL: 11, GLINT: 12,
  NORI: 13, NORI2: 14, NARUTO: 15, PINK: 16,
  NEGI: 17, NEGI2: 18, STICK: 19, STICKTIP: 20, STEAM: 21,
  CHILI: 22, CHILI2: 23, SESAME: 24, RAYU: 25, NEGIKEY: 26, DOUGH: 27,
};
const DAY = [
  0x8a4216, 0x9a4e1e, 0xa85a26, 0xb4692f, 0xa05524,
  0xefe6d6, 0xb8322a, 0xefe6d6, 0x3a1a10,
  0xf4d066, 0x4a1c06, 0xc6873a, 0xfff2c4,
  0x1c2a1e, 0x2e4230, 0xf6f0e6, 0xe04e7e,
  0x66b23c, 0xdcefb4, 0x6e1d14, 0xdcb878, 0xfff6e8,
  0xdc3a1e, 0xf2902a, 0x2a1a10, 0xd8481a, 0x23440f, 0xfaf0d2,
];
// night: the shop's late light; the broth sinks to a deep brown, the porcelain
// to warm grey, the noodles stay the brightest thing on the glass
const NIGHT = [
  0x4a2210, 0x562a14, 0x60321a, 0x6a3a20, 0x5c2e18,
  0x9c9282, 0x7a2218, 0x9c9282, 0x1c0c06,
  0xf0c45a, 0x220c02, 0x8a5a2a, 0xf4dca0,
  0x121a12, 0x1e2c20, 0xc8c0b4, 0xb03860,
  0x4a8a2c, 0xaac48a, 0x4a140e, 0xa88a58, 0xe8dcc8,
  0xb02a16, 0xc8701e, 0x1a1008, 0xb0381a, 0x16300a, 0xe2d4b0,
];
export const N_COL = DAY.length;

/** The palette at night level `nt` (0..1), as 0xRRGGBB and as RGB565. */
export function palette(nt, out, out565) {
  for (let i = 0; i < N_COL; i++) {
    const a = DAY[i], b = NIGHT[i];
    const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * nt);
    const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * nt);
    const bl = (a & 255) + (((b & 255) - (a & 255)) * nt);
    const c = ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5);
    out[i] = c; out565[i] = to565(c);
  }
}

// ------------------------------------------------------------ the bed (flash)
// 256 x 256, seamless: 0 broth, 1 a submerged noodle, 2 two of them overlapping
export const TEX = new Uint8Array(256 * 256);
{
  const r = rng(7311);
  const cnt = new Uint8Array(256 * 256);
  for (let k = 0; k < 64; k++) {
    let x = r() * 256, y = r() * 256, a = r() * Math.PI * 2;
    const len = 90 + r() * 140, turn = (r() - 0.5) * 0.05, wob = 0.6 + r() * 0.7, ph = r() * 6;
    const mark = new Uint8Array(256 * 256);
    for (let s = 0; s < len; s += 0.5) {
      a += turn + 0.03 * Math.sin(s * 0.05 + ph);
      x += Math.cos(a) * 0.5; y += Math.sin(a) * 0.5;
      // the crinkle of a ramen noodle
      const cx = x - Math.sin(a) * wob * Math.sin(s * 0.9 + ph), cy = y + Math.cos(a) * wob * Math.sin(s * 0.9 + ph);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const px = Math.floor(cx) + dx, py = Math.floor(cy) + dy;
        const ex = px + 0.5 - cx, ey = py + 0.5 - cy;
        if (ex * ex + ey * ey <= 1.35 * 1.35) mark[(py & 255) * 256 + (px & 255)] = 1;
      }
    }
    for (let i = 0; i < mark.length; i++) cnt[i] += mark[i];
  }
  for (let i = 0; i < TEX.length; i++) TEX[i] = cnt[i] > 2 ? 2 : cnt[i];
}

// ------------------------------------------------------------ the rim (flash)
// per pixel: 0 = broth, else a palette index of the porcelain
export const RIM = new Uint8Array(W * H);
/** distance from the dip, in 1/16 px */
export const DIP = new Uint16Array(W * H);
{
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - BOWL_X, dy = y + 0.5 - BOWL_Y, d = Math.hypot(dx, dy);
    let c = 0;
    if (d >= BOWL_R) {
      const e = d - BOWL_R;
      if (e < 1) c = C.RIMLINE;
      else if (e < 3.2) c = C.LIP;
      else {
        // the raimon band: a square meander along the circle, 6 px tall
        const a = Math.atan2(dy, dx), u = (((a / (Math.PI * 2)) * BOWL_R * Math.PI * 2) / 6 % 1 + 1) % 1, v = (e - 3.2) / 6;
        // one meander cell: an L-shaped hook of porcelain on the red
        const inHook = (u < 0.18 && v > 0.18 && v < 0.82) || (v > 0.66 && v < 0.82 && u < 0.7) ||
          (u > 0.52 && u < 0.7 && v > 0.36 && v < 0.82) || (v > 0.36 && v < 0.5 && u > 0.34 && u < 0.7);
        c = v > 1 ? C.LIP : inHook ? C.MEANDER : C.BAND;
      }
    }
    RIM[y * W + x] = c;
    DIP[y * W + x] = Math.min(65535, Math.round(Math.hypot(x + 0.5 - DIP_X, y + 0.5 - DIP_Y) * 16));
  }
}

// ------------------------------------------------------------ the pass

const RING_GAP = 768;   // rings 48 px apart in 1/16 px: they roll out at 48 px/s, one a second
const RING_W = 11;      // half width, 1/16 px

/**
 * Paint broth, bed and rim. `theta` turns the bed about the bowl's centre.
 * `r0` is the newest ring's radius (1/16 px) and `ringMask` says which of
 * the last three rings exist (bit k: ring k, k seconds older); strong rings
 * are the first `strong` of them.
 */
export function paintBowl(g, pal565, theta, r0, ringMask, strong) {
  const buf = g.buf;
  const c = Math.round(Math.cos(theta) * 256), s = Math.round(Math.sin(theta) * 256);
  const broth = pal565[C.BROTH], bed1 = pal565[C.BED1], bed2 = pal565[C.BED2];
  const rip1 = pal565[C.RIP1], rip2 = pal565[C.RIP2];
  const BED = [broth, bed1, bed2];
  for (let y = 0; y < H; y++) {
    const dy = y - BOWL_Y;
    // texture coordinates in 8.8 fixed point, incremented along the row
    let u = (-BOWL_X) * c + dy * s + (128 << 8), v = -(-BOWL_X) * s + dy * c + (128 << 8);
    const row = y * W;
    for (let x = 0; x < W; x++, u += c, v -= s) {
      const i = row + x, rc = RIM[i];
      if (rc) { buf[i] = pal565[rc]; continue; }
      let col = BED[TEX[((v >> 8) & 255) * 256 + ((u >> 8) & 255)]];
      if (ringMask) {
        const e = DIP[i] - r0 + RING_W;
        if (e >= 0) {
          const k = (e / RING_GAP) | 0;
          if (k < 3 && e - k * RING_GAP < 2 * RING_W && (ringMask >> k) & 1) col = k < strong ? rip1 : rip2;
        }
      }
      buf[i] = col;
    }
  }
  g.cost.px += W * H; g.cost.box += W * H * 6;
}

/** Screen position of a point fixed in the bed (texture coords), at bed angle theta. */
export function bedToScreen(u, v, theta) {
  const du = u - 128, dv = v - 128, c = Math.cos(theta), s = Math.sin(theta);
  // inverse of u = c*dx + s*dy, v = -s*dx + c*dy
  return [BOWL_X + c * du - s * dv, BOWL_Y + s * du + c * dv];
}

export { clamp };
