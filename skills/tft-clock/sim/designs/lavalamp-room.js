// Lava Lamp: the lamps, their colours and the room they stand in.
//
// GEOMETRY: four rocket lamps (cap cone, tapered glass, base cone) on a
// shelf. The glass is widest a quarter of the way up and tapers to the cap,
// so a digit has ~23 px at its shoulders and ~30 px at its foot.
//
// COLOUR TABLES (flash): every glass pixel is a potential (wax amount) looked
// up in a table per palette x day/night x light band x glint, so the frame
// loop is a byte lookup: wax edge anti-aliasing, the glow the wax throws into
// the liquid, the hot core where the wax is thick, and the heater's light
// rising from the bottom are all baked in.

import { Gfx, to565, mix, R, G, B, rgb } from '../js/kit.js';

export const W = 160, H = 80;
export const CX = [20, 56, 104, 140];
export const GT = 6, GB = 63;               // glass interior rows [GT, GB)
export const LW = 32, LH = GB - GT;          // a lamp's working box: x in [cx-16, cx+16)
export const NBAND = 8, NLEV = 128;
export const LAMBDA = 1.2;                   // potential doubles every 1.2 px into the wax

/** Interior half-width of the glass at row y (pixel centre y + 0.5). */
export function hw(yc) {
  if (yc <= 47) return 10 + 5.5 * Math.pow(Math.max(0, (yc - GT) / 41), 0.85);
  const u = (yc - 47) / 16;
  return 15.5 - 4.5 * u * u;
}
/** Per row: the first and one-past-last interior column, lamp-local (0..LW). */
export const SPAN0 = new Int8Array(LH), SPAN1 = new Int8Array(LH);
for (let j = 0; j < LH; j++) {
  const h = hw(GT + j + 0.5);
  SPAN0[j] = Math.ceil(16 - h - 0.5 + 1e-6);   // pixel centre i + 0.5 >= 16 - h
  SPAN1[j] = Math.floor(16 + h - 0.5) + 1;
}

// ------------------------------------------------------------ palettes
// The classic lamp pairs: a bright wax in a deep, saturated liquid of the
// opposite temperature, so the wax (the time) is always the strongest
// contrast on the glass, the liquid a calm coloured ground, and the dark
// room calmer still. Four different pairs on the shelf; every hour each lamp
// moves three pairs on.
export const PAIRS = [
  [0xff4f9a, 0x2b1670],   // pink in indigo
  [0xff8c1e, 0x6a1030],   // tangerine in crimson
  [0xb8f53a, 0x10306e],   // lime in deep blue
  [0xffd83a, 0x4a1482],   // yellow in violet
  [0x40e4ff, 0x5a1050],   // cyan in plum
  [0xff4c34, 0x0c4a52],   // red in teal
  [0xcaa2ff, 0x0e4236],   // lilac in bottle green
  [0x4cffb4, 0x341060],   // mint in purple
];
export const pairOf = (h, i) => (h * 3 + i * 2) % 8;

const sc = (c, k) => rgb(R(c) * k, G(c) * k, B(c) * k);

function tableColour(p, night, band, glint, lev) {
  let [wax, liq] = PAIRS[p];
  if (night) { wax = sc(wax, 0.82); liq = sc(liq, 0.5); }
  const kl = 0.58 + 0.09 * band, kw = 0.9 + 0.025 * band;
  const L = sc(liq, kl), Wx = sc(wax, kw), glow = mix(L, Wx, 0.42);
  const P = (lev + 0.5) * 8;                       // the potential this level stands for
  const sd = LAMBDA * Math.log2(P / 256);          // ~ signed distance into the wax, px
  const halo = sd < 0 ? Math.max(0, 1 + sd / 3.2) ** 2 : 0;
  let c = mix(L, glow, halo * 0.55);
  const cov = Math.max(0, Math.min(1, 0.5 + sd));
  c = mix(c, Wx, cov);
  if (sd > 2.6) c = mix(c, mix(Wx, 0xffffff, 0.42), Math.min(1, (sd - 2.6) * 1.4));   // thick wax glows
  if (glint) c = mix(c, 0xfff6ff, 0.3);
  return to565(c);
}

/** LUT[(((p * 2 + night) * NBAND + band) * 2 + glint) * NLEV + lev] */
export const LUT = new Uint16Array(8 * 2 * NBAND * 2 * NLEV);
for (let p = 0; p < 8; p++) for (let n = 0; n < 2; n++) for (let b = 0; b < NBAND; b++) for (let gl = 0; gl < 2; gl++)
  for (let l = 0; l < NLEV; l++) LUT[(((p * 2 + n) * NBAND + b) * 2 + gl) * NLEV + l] = tableColour(p, n, b, gl, l);
export const lutBase = (p, night) => (p * 2 + night) * NBAND * 2 * NLEV;

/** Potential (0..1023) of a signed distance byte (128 + 16 * px). */
export const PHI = new Float32Array(512);
for (let b = 0; b < 512; b++) PHI[b] = Math.min(1023, 256 * Math.pow(2, (b - 128) / 16 / LAMBDA));

// ------------------------------------------------------------ the room

const WALL = [0x26141e, 0x0c080c], SHELF = [0x5a2c1a, 0x1e1210], SHELF_F = [0x341a12, 0x120a0a];
const METAL = [0x5e5a68, 0x34323a], METAL_HI = [0xa8a4b6, 0x5a5664], METAL_LO = [0x3c3844, 0x221f26];

/**
 * Draw the room for one hour's palettes at night level nl (0 day .. 1 night,
 * in twelfths), with the lamps' light on the wall at rest or hot (heater flared): wall, each lamp's coloured light on it, the shelf, bases,
 * caps and glass rims. Rebuilt when the hour or the night step changes;
 * returns the canvas (its cost is charged to the frame that builds it).
 */
export function buildRoom(h, nl, hot = 0) {
  const r = new Gfx(W, H), dn = (pair) => mix(pair[0], pair[1], nl);
  const wall = dn(WALL), wr = R(wall), wg = G(wall), wb = B(wall);
  // the wall and the lamps' light on it, on a coarse grid (one cheap pass)
  const gl = [];
  for (let i = 0; i < 4; i++) {
    const [wax, liq] = PAIRS[pairOf(h, i)];
    const c = mix(mix(wax, liq, 0.5 - 0.15 * hot), wall, 0.3 + 0.25 * nl - 0.15 * hot), k = 0.55 + 0.4 * hot;
    gl.push([CX[i], (R(c) - wr) * k, (G(c) - wg) * k, (B(c) - wb) * k]);
  }
  r.coarse((x, y) => {
    const k = 0.7 + 0.3 * (y / 76);
    let cr = wr * k, cg = wg * k, cb = wb * k;
    const dy = (y - 40) / 36, qy = dy * dy;
    for (let i = 0; i < 4; i++) {
      const dx = (x - gl[i][0]) / (30 + 4 * hot), q = dx * dx + qy;
      if (q < 1) { const w = (1 - q) * (1 - q); cr += gl[i][1] * w; cg += gl[i][2] * w; cb += gl[i][3] * w; }
    }
    return ((cr | 0) << 16) | ((cg | 0) << 8) | (cb | 0);
  }, { cell: 8, box: [0, 0, W, 76] });
  // the shelf, with each lamp's light pooled on its top edge
  r.fillRect(0, 76, W, 2, dn(SHELF));
  r.fillRect(0, 78, W, 2, dn(SHELF_F));
  for (let i = 0; i < 4; i++) {
    const [wax] = PAIRS[pairOf(h, i)];
    r.fillRect(CX[i] - 17, 76, 34, 1, mix(wax, dn(SHELF), 0.5 + 0.2 * nl), { a: 0.7 });
    r.fillRect(CX[i] - 11, 77, 22, 1, mix(wax, dn(SHELF), 0.5 + 0.2 * nl), { a: 0.45 });
  }
  const metal = dn(METAL), hi = dn(METAL_HI), lo = dn(METAL_LO);
  for (let i = 0; i < 4; i++) {
    const cx = CX[i], [, liq] = PAIRS[pairOf(h, i)];
    // glass rim: one pixel outside the liquid, the glass seen edge-on
    const rim = mix(sc(liq, 1 - 0.5 * nl), 0xd8d0e8, 0.45 - 0.2 * nl);
    // per row, the pixel just outside the liquid on each side, and the next at the edge's fractional coverage
    // (written straight into the buffer: ~460 pixel writes and blends per lamp)
    for (let j = 0; j < LH; j++) {
      const y = GT + j, h = hw(y + 0.5) + 1.1;
      const l = cx - 16 + SPAN0[j] - 1, rr = cx - 16 + SPAN1[j];
      r.put(l, y, rim); r.put(rr, y, rim);
      const fl = l - (cx - h), fr = cx + h - (rr + 1);
      if (fl > 0.05) r.put(l - 1, y, rim, Math.min(1, fl));
      if (fr > 0.05) r.put(rr + 1, y, rim, Math.min(1, fr));
    }
    // base cone (flat metal, a lit edge, a shade edge, a rim line) and the cap
    r.fillPolygon([[cx - 11.5, 62.5], [cx + 11.5, 62.5], [cx + 15.5, 76.5], [cx - 15.5, 76.5]], metal, { aa: true });
    r.fillPolygon([[cx - 11.5, 62.5], [cx - 9.5, 62.5], [cx - 12.5, 76.5], [cx - 15.5, 76.5]], hi, { a: 0.7 });
    r.fillPolygon([[cx + 8.5, 62.5], [cx + 11.5, 62.5], [cx + 15.5, 76.5], [cx + 12, 76.5]], lo, { a: 0.8 });
    r.fillRect(cx - 12, 63, 24, 1, hi, { a: 0.6 });
    r.fillPolygon([[cx - 4.5, 0.5], [cx + 4.5, 0.5], [cx + 7.5, 6], [cx - 7.5, 6]], metal, { aa: true });
    r.fillPolygon([[cx - 4.5, 0.5], [cx - 2.5, 0.5], [cx - 5, 6], [cx - 7.5, 6]], hi, { a: 0.7 });
    r.fillRect(cx - 7, 5, 14, 1, lo, { a: 0.7 });
  }
  return r;
}
