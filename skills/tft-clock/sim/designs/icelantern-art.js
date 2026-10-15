// Characters and small drawing helpers for icelantern.js.
//
// Everyone who moves is a hard-pixel sprite drawn at sub-pixel positions:
// blitSub gathers each destination pixel from the four sprite pixels under
// it (bilinear, premultiplied), so a 16 px carver rides his lift by
// fractions of a pixel without going soft at rest (integer positions give
// back the exact sprite). Cost is charged to g.cost honestly: a scanned
// destination pixel is ~8 box units, the write goes through g.put.

export const NAVY = 0x101428;

/** A sprite as colour rows; '.' transparent. Returns { w, h, c: Int32Array }. */
export function pic(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (!(ch in pal)) throw new Error(`icelantern sprite: no colour for ${ch}`);
      c[y * w + x] = pal[ch];
    }
  return { w, h, c };
}

/**
 * Draw sprite `s` with its top-left at (x, y), any fractional position.
 * `flip` mirrors it; `k` (0..256) scales its colours (night), `tint`
 * (0xRRGGBB) is added on top in proportion `ta` (0..256), `a` opacity.
 */
export function blitSub(g, s, x, y, flip = false, k = 256, tint = 0, ta = 0, a = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const tr = ((tint >>> 16) & 255) * ta, tg = ((tint >>> 8) & 255) * ta, tb = (tint & 255) * ta;
  const sw = s.w, sh = s.h, sc = s.c;
  const nx = fx > 0.001 ? sw + 1 : sw, ny = fy > 0.001 ? sh + 1 : sh;
  for (let j = 0; j < ny; j++) {
    const py = iy + j;
    if (py < g.cy0 || py >= g.cy1) continue;
    for (let i = 0; i < nx; i++) {
      const px = ix + i;
      if (px < g.cx0 || px >= g.cx1) continue;
      g.cost.box += 8;
      // source pixels covering this one: (i - 1 + 1 - fx ...) i.e. (i, j) weight w00, (i-1, j) w10 ...
      let ar = 0, ag = 0, ab = 0, al = 0;
      for (let q = 0; q < 4; q++) {
        const si = q & 1 ? i - 1 : i, sj = q & 2 ? j - 1 : j;
        if (si < 0 || sj < 0 || si >= sw || sj >= sh) continue;
        const v = sc[sj * sw + (flip ? sw - 1 - si : si)];
        if (v < 0) continue;
        const wq = q === 0 ? w00 : q === 1 ? w10 : q === 2 ? w01 : w11;
        if (wq <= 0) continue;
        ar += ((v >>> 16) & 255) * wq; ag += ((v >>> 8) & 255) * wq; ab += (v & 255) * wq; al += wq;
      }
      if (al < 0.02) continue;
      let r = ((ar / al) * k + tr) / 256, gg = ((ag / al) * k + tg) / 256, b = ((ab / al) * k + tb) / 256;
      if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      g.put(px, py, ((r | 0) << 16) | ((gg | 0) << 8) | (b | 0), al * a);
    }
  }
}

/** A soft dot of light at a fractional position: a bilinear 2 x 2 splat. */
export function splat(g, x, y, c, a) {
  x -= 0.5; y -= 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
  g.cost.box += 10;
  dot(g, ix, iy, c, (1 - u) * (1 - v) * a); dot(g, ix + 1, iy, c, u * (1 - v) * a);
  dot(g, ix, iy + 1, c, (1 - u) * v * a); dot(g, ix + 1, iy + 1, c, u * v * a);
}
function dot(g, x, y, c, a) {
  if (x < g.cx0 || y < g.cy0 || x >= g.cx1 || y >= g.cy1 || a < 0.03) return;
  g.put(x, y, c, a > 1 ? 1 : a);
}

// ------------------------------------------------------------ the cast

const CARVER_PAL = {
  n: NAVY, Y: 0xffd23a, y: 0xc8900e, s: 0xf2b48a, k: 0x1a1a2a, O: 0xff7414, o: 0xc04c08,
  R: 0xe8f4f4, m: 0x343a4c, G: 0x4c5262, g: 0x8a94a4, r: 0xe83a1a, B: 0xd4dde6, t: 0x3a4250, b: 0x262838,
};
/** An ice carver in an orange suit with hi-vis stripes, chainsaw held out to the right. 19 x 16. */
export const CARVER = pic([
  '....nnnnn..........',
  '...nYYYYYn.........',
  '..nYYYYYYYn........',
  '..nyyyyyyyn........',
  '...nskssksn........',
  '...nsssssn.........',
  '..nnOOOOOnn........',
  '.nOOOOOOOOOn.......',
  '.nORRRRRRROn.nnn...',
  '.nOOOOOOOOmmGrGnnnnn',
  '.nOOOOOOOOmmGGGBBBBBn',
  '..nOOOOOOOn.nGGtBtBtn',
  '..nooooooon..nnn.nnn.',
  '..nORn.nROn.........',
  '..nOOn.nOOn.........',
  '.nbbbn.nbbbn........',
], CARVER_PAL);
export const CARVER_SAW_X = 20, CARVER_SAW_Y = 10;   // the blade tip, sprite pixels

/** Visitors, bundled up: two walk frames each. Palette letters J parka, H hat, P pompom, C scarf. */
function visitor(J, H, P, C) {
  const pal = { n: NAVY, J, j: dim(J), H, P, C, s: 0xf2b48a, k: 0x1a1a2a, L: 0x2c3044, b: 0x1c1e2c, w: 0xe8eef8 };
  const top = [
    '...PP...',
    '..nHHHn.',
    '.nHHHHHn',
    '.nHssskn',
    '..nsssn.',
    '.nCCCCCn',
    'nJJJCCJn',
    'nJJJJCJn',
    'nJJJJJJn',
    'nJjJJJJn',
    '.nJJJJn.',
  ];
  return [
    pic([...top, '.nL..Ln.', '.bb..bb.'], pal),
    pic([...top, '..nLLn..', '..bbbb..'], pal),
    // standing, phone held up to the face (the photographer)
    pic([
      '...PP...',
      '..nHHHn.',
      '.nHHHHHn',
      '.nHssskn',
      '..nsssnww',
      '.nCCCCJnw',
      'nJJJCCJJ.',
      'nJJJJCJn.',
      'nJJJJJJn.',
      'nJjJJJJn.',
      '.nJJJJn.',
      '..nLLn..',
      '..bbbb..'], pal),
  ];
}
function child(J, H, C) {
  const pal = { n: NAVY, J, H, C, s: 0xf2b48a, k: 0x1a1a2a, L: 0x2c3044, b: 0x1c1e2c };
  const top = ['.nHn.', 'nHHHn', 'nsskn', 'nCCCn', 'nJJJn', '.nJn.'];
  return [pic([...top, '.L.L.', 'bb.bb'], pal), pic([...top, '..L..', '.bbb.'], pal)];
}
const dim = (c) => ((((c >>> 16) & 255) * 0.7) << 16) | ((((c >>> 8) & 255) * 0.7) << 8) | ((c & 255) * 0.7);

export const VISITORS = [
  { spr: visitor(0xd8283c, 0xf4f0e8, 0xffffff, 0xffd040), v: 7.5, x0: 10, y: 67, puff: 0.3 },
  { spr: visitor(0x2a64c8, 0xd8283c, 0xffffff, 0xf4f0e8), v: -6.2, x0: 90, y: 67.5, puff: 1.4, photo: true },
  { spr: child(0xffc030, 0x2aa060, 0xd8283c), v: 7.9, x0: 22, y: 72, puff: 0.9 },
  { spr: visitor(0x3a9a5a, 0x5a3a8a, 0xffd040, 0xd8283c), v: -8.4, x0: 150, y: 68, puff: 2.0 },
];

/** A sledder on a little red sled. */
export const SLEDDER = [
  pic([
    '..nn....',
    '.nHHn...',
    '.nssk...',
    'nCCJJn..',
    'nJJJJJn.',
    'rrrrrrrr',
    '.n....n.',
  ], { n: NAVY, H: 0x30c0e0, s: 0xf2b48a, k: 0x1a1a2a, C: 0xffd040, J: 0xd8283c, r: 0xc8281c }),
  pic([
    '..nn....',
    '.nPPn...',
    '.nssk...',
    'nCCJJn..',
    'nJJJJJn.',
    'rrrrrrrr',
    '.n....n.',
  ], { n: NAVY, P: 0xff60b0, s: 0xf2b48a, k: 0x1a1a2a, C: 0xf4f0e8, J: 0x2a64c8, r: 0xc8281c }),
];

/** A red silk lantern hung on the terrace wall: gold caps, a glowing belly, a tassel. */
export const LANTERN = pic([
  '.gg.',
  'rRRr',
  'RYYR',
  'RYYR',
  'rRRr',
  '.gg.',
  '..t.',
], { g: 0xe0a830, r: 0xa01818, R: 0xe02a20, Y: 0xffd060, t: 0xe0a830 });
