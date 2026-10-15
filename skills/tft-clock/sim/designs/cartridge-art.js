// Cartridge: the art. Everything is drawn in ramp INDICES (0 ink .. 7 glow)
// and only turned into colour at the very end through one table, the way
// the handheld itself had a palette register. Sprites, tiles, digit masks,
// the HUD font and the five worlds' backdrops all live here.

import { to565 } from '../js/kit.js';

// ------------------------------------------------------------ the ramp
// One hue, ~80 deg pea green, eight steps from olive ink to a lit near-white.
// Each value sits exactly on an RGB565 code (so rounding cannot drift the
// hue) and was picked so its hue stays within ~6 deg of 80.
export const RAMP = [
  0x101c00, // 0 ink        the keyline, mortar, pupils
  0x304808, // 1 dark       block faces, the hero's tunic
  0x588010, // 2 mid        the hero, grass, flag
  0x88b428, // 3 light-mid  caps, near bushes, HUD
  0xa8cc60, // 4 pale       far hills, ghost imprints
  0xc0e090, // 5 paper      the sky (the unlit LCD)
  0xe0f0c0, // 6 glow       clouds, light fronts, sparks
  0xe8f8d0, // 7 hot        the brightest flash
];
export const LUT = Uint16Array.from(RAMP, to565);
export const T = 255; // transparent index

// 4x4 ordered dither thresholds 0..15
export const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

// ------------------------------------------------------------ sprites as index grids
export function spr(rows) {
  const h = rows.length, w = rows[0].length, d = new Uint8Array(w * h).fill(T);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    if (c >= '0' && c <= '7') d[y * w + x] = c.charCodeAt(0) - 48;
  }
  return { w, h, d };
}

// ------------------------------------------------------------ digits as level geometry
// A 4 x 5 grid of 8 x 8 tiles. '#' a full block; slope blocks cut one
// corner at 45 deg (the platformer's own diagonal): a = top-left cut,
// b = top-right, c = bottom-left, d = bottom-right. Strokes are one tile.
export const DIGITS = {
  0: ['a##b', '#..#', '#..#', '#..#', 'c##d'],
  1: ['.a#.', 'a##.', '..#.', '..#.', '.###'],
  2: ['a##b', '...#', 'a##d', '#...', '####'],
  3: ['a##b', '...#', '.###', '...#', 'c##d'],
  4: ['#.#.', '#.#.', '####', '..#.', '..#.'],
  5: ['####', '#...', '###b', '...#', '###d'],
  6: ['a##.', '#...', '###b', '#..#', 'c##d'],
  7: ['####', '...#', '..ad', '..#.', '..#.'],
  8: ['a##b', '#..#', 'e##f', '#..#', 'c##d'],
  9: ['a##b', '#..#', 'c###', '...#', '.##d'],
};
export const DW = 32, DH = 40;

function cellFill(code, x, y) {
  switch (code) {
    case '#': return true;
    case 'a': return x + y >= 7;
    case 'b': return y >= x;
    case 'c': return x >= y;
    case 'd': return x + y <= 7;
    // the 8's waist: a full block with small notches so the two bowls read
    case 'e': return !(x === 0 && (y === 0 || y === 7));
    case 'f': return !(x === 7 && (y === 0 || y === 7));
    default: return false;
  }
}

/** Pixel mask (Uint8 32x40, 1 = solid) and the tile list of a digit. */
export const MASKS = {};
for (let n = 0; n < 10; n++) {
  const g = DIGITS[n], m = new Uint8Array(DW * DH), tiles = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
    const code = g[r][c];
    if (code === '.') continue;
    tiles.push([c, r]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (cellFill(code, x, y)) m[(r * 8 + y) * DW + c * 8 + x] = 1;
  }
  MASKS[n] = { m, tiles };
}

// ------------------------------------------------------------ block materials, one per world
// tex(x, y) -> index for a pixel inside a tile (x, y in 0..7, tile col/row tc, tr)
const MATERIALS = {
  // plains: bricks, offset courses, a light lip on each brick
  brick(x, y, tc, tr) {
    const yy = y & 3, course = (y >> 2) + tr * 2;
    const off = (course & 1) ? 4 : 0;
    if (yy === 3) return 0;
    if (((x + off) & 7) === 7) return 0;
    if (yy === 0 && ((x + off) & 7) < 6) return 2;
    return 1;
  },
  // forest: plank crates, a grain line and a nail head
  crate(x, y, tc, tr) {
    if (y === 7 || x === 7) return 0;
    if (y === 3) return 0;
    if ((x === 1 && y === 1) || (x === 5 && y === 5)) return 2;
    if (y === 0 || y === 4) return 2;
    return 1;
  },
  // desert: dressed sandstone, big blocks with a carved dot
  sandstone(x, y, tc, tr) {
    const big = ((tc + tr) & 1) === 0;
    if (y === 7) return 0;
    if (big ? x === 7 : (x === 7 || x === 3)) return 0;
    if (y === 0) return 2;
    if (big && x >= 2 && x <= 4 && y >= 3 && y <= 4) return 0;
    return 1;
  },
  // ice: clear blocks with a frost seam and two shine strokes
  ice(x, y, tc, tr) {
    if (x === 7 || y === 7) return 0;
    if ((x === 1 && y === 2) || (x === 2 && y === 1)) return 3;
    if (y === 0 || x === 0) return 2;
    return 1;
  },
  // night: lit bricks (the night level inverts the blocks to read on the dark)
  litbrick(x, y, tc, tr) {
    const yy = y & 3, course = (y >> 2) + tr * 2;
    const off = (course & 1) ? 4 : 0;
    if (yy === 3) return 2;
    if (((x + off) & 7) === 7) return 2;
    if (yy === 0 && ((x + off) & 7) < 6) return 5;
    return 4;
  },
};

// ------------------------------------------------------------ worlds
// sky: index rows; far/near: backdrop layers (256 wide, wrap) of indices
export const WORLDS = [
  { key: 'plains', mat: 'brick', key0: 0, cap: 3, sky: 5, horizon: 4, cloud: 6, cloudLine: 4, far: 4, farLine: 3, near: 3, nearLine: 2, ground: 'grass', water: [2, 3, 5], hud: 2, ghost: 3 },
  { key: 'forest', mat: 'crate', key0: 0, cap: 3, sky: 5, horizon: 4, cloud: 6, cloudLine: 4, far: 4, farLine: 4, near: 3, nearLine: 2, ground: 'leaves', water: [2, 3, 4], hud: 2, ghost: 3 },
  { key: 'desert', mat: 'sandstone', key0: 0, cap: 4, sky: 6, horizon: 5, cloud: 7, cloudLine: 5, far: 4, farLine: 3, near: 3, nearLine: 2, ground: 'sand', water: [2, 3, 6], hud: 2, ghost: 3 },
  { key: 'ice', mat: 'ice', key0: 0, cap: 4, sky: 4, horizon: 5, cloud: 6, cloudLine: 5, far: 5, farLine: 5, near: 6, nearLine: 3, ground: 'snow', water: [2, 3, 5], hud: 1, ghost: 2 },
  { key: 'night', mat: 'litbrick', key0: 0, cap: 6, sky: 0, horizon: 1, cloud: 4, cloudLine: 2, far: 1, farLine: 2, near: 0, nearLine: 1, ground: 'nightgrass', water: [0, 1, 3], hud: 3, ghost: 2 },
];
export const NIGHT_WORLD = 4;

const DIGIT_CACHE = new Map();
/**
 * A digit drawn in a world's material: 32x40 indices (T outside). The
 * silhouette gets an ink keyline all round and a light cap on every top
 * surface, so each tile edge reads as a platform edge.
 */
export function digitArt(n, w) {
  const k = n * 8 + w;
  let a = DIGIT_CACHE.get(k);
  if (a) return a;
  const W = WORLDS[w], tex = MATERIALS[W.mat], m = MASKS[n].m;
  a = new Uint8Array(DW * DH).fill(T);
  const at = (x, y) => (x >= 0 && y >= 0 && x < DW && y < DH ? m[y * DW + x] : 0);
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    if (!m[y * DW + x]) continue;
    let v;
    const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
    if (edge) v = W.key0;
    else if (!at(x, y - 2) || (!at(x - 1, y - 2) && !at(x - 1, y - 1)) || (!at(x + 1, y - 2) && !at(x + 1, y - 1))) v = W.cap;
    else v = tex(x & 7, y & 7, x >> 3, y >> 3);
    a[y * DW + x] = v;
  }
  DIGIT_CACHE.set(k, a);
  return a;
}

// ------------------------------------------------------------ ground strip (8 rows, tiled)
export function groundTex(kind, x, y) {
  switch (kind) {
    case 'grass':
      if (y === 0) return 0;
      if (y === 1) return (x % 4 === 1) ? 1 : 2;
      if (y === 2) return (x % 4 === 1) ? 0 : 1;
      return ((x * 5 + y * 3) % 11 === 0) ? 2 : 3;
    case 'leaves':
      if (y === 0) return 0;
      if (y <= 2) return ((x + y) % 3 === 0) ? 1 : 2;
      return ((x * 7 + y * 5) % 9 === 0) ? 1 : 3;
    case 'sand':
      if (y === 0) return 1;
      if (y === 1) return 3;
      return (((x >> 1) + y * 3) % 7 === 0) ? 3 : 4;
    case 'snow':
      if (y === 0) return 1;
      if (y <= 2) return 6;
      return ((x * 3 + y * 7) % 13 === 0) ? 3 : 5;
    case 'nightgrass':
      if (y === 0) return 3;
      if (y === 1) return (x % 4 === 1) ? 1 : 2;
      return ((x * 5 + y * 3) % 11 === 0) ? 2 : 1;
  }
  return 3;
}

// ------------------------------------------------------------ backdrop layers
export const LW = 256;
export const CLOUD_Y = 7, CLOUD_H = 22, FAR_Y = 24, FAR_H = 48, NEAR_Y = 50, NEAR_H = 22;

const LAYER_CACHE = new Map();
function hashf(i, s) { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ s; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** Build a world's three backdrop layers (cached; ~13 KB each world). */
export function layers(w) {
  let L = LAYER_CACHE.get(w);
  if (L) return L;
  const W = WORLDS[w];
  const cloud = new Uint8Array(LW * CLOUD_H).fill(T), far = new Uint8Array(LW * FAR_H).fill(T), near = new Uint8Array(LW * NEAR_H).fill(T);
  // a fill-then-outline helper: mark solid by a test, then ink the boundary
  const shape = (buf, H, test, fill, line, lineTop = true) => {
    const s = new Uint8Array(LW * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < LW; x++) if (test(x, y)) s[y * LW + x] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < LW; x++) {
      if (!s[y * LW + x]) continue;
      const up = y > 0 ? s[(y - 1) * LW + x] : 1;
      const l = s[y * LW + ((x + LW - 1) & 255)], r = s[y * LW + ((x + 1) & 255)];
      const dn = y < H - 1 ? s[(y + 1) * LW + x] : 1;
      const isLine = lineTop ? (!up || !l || !r) : (!dn || !l || !r);
      buf[y * LW + x] = isLine && line !== T ? line : fill;
    }
  };
  // clouds: flat puffs, three bumps on a flat base
  const puffs = [];
  for (let i = 0; i < 4; i++) puffs.push([i * 64 + 10 + hashf(i, 7) * 30, 4 + hashf(i, 9) * 9, 7 + hashf(i, 11) * 6]);
  const inCloud = (x, y) => {
    for (const [cx, cy, r] of puffs) {
      let dx = x - cx; if (dx > 128) dx -= LW; if (dx < -128) dx += LW;
      if (y > cy + 3 || y < cy - r) continue;
      for (const [ox, rr] of [[-r * 0.8, r * 0.55], [0, r * 0.8], [r * 0.8, r * 0.6], [r * 1.5, r * 0.4]]) {
        const ex = dx - ox, ey = (y - cy) * 1.1;
        if (ex * ex + ey * ey < rr * rr && y <= cy + 3) return true;
      }
    }
    return false;
  };
  if (W.key === 'night') {
    // the night sky: stars (twinkle in the frame), a crescent moon
    for (let i = 0; i < 26; i++) {
      const x = (hashf(i, 3) * LW) | 0, y = (hashf(i, 5) * (CLOUD_H - 2)) | 0;
      cloud[y * LW + x] = hashf(i, 8) < 0.3 ? 5 : 3;
    }
    for (let y = 0; y < CLOUD_H; y++) for (let x = 110; x < 140; x++) {
      const dx = x + 0.5 - 124, dy = y + 0.5 - 8, ex = dx - 3.2, ey = dy + 1.8;
      if (dx * dx + dy * dy < 36 && ex * ex + ey * ey > 26) cloud[y * LW + x] = 5;
    }
  } else if (W.key === 'desert') {
    // a big flat sun disc with a ring, and one thin cloud
    shape(cloud, CLOUD_H, (x, y) => { const dx = x - 150, dy = y - 9; return dx * dx + dy * dy < 49; }, 7, 6);
    shape(cloud, CLOUD_H, (x, y) => { const dx = x - 40; return y >= 13 && y <= 15 && dx > 0 && dx < 22 + (y - 13) * 6; }, 7, T);
  } else {
    shape(cloud, CLOUD_H, inCloud, W.cloud, W.cloudLine, false);
  }
  // far layer
  const farH = (x) => {
    const u = (x / LW) * Math.PI * 2;
    switch (W.key) {
      case 'plains': return 24 + 7 * Math.sin(u * 3 + 1) + 4 * Math.sin(u * 5 + 2);
      case 'forest': { const k = x % 9, tri = Math.abs(k - 4); return 14 + tri * 2.4 + 4 * Math.sin(u * 2) + (hashf(Math.floor(x / 9), 4) * 6); }
      case 'desert': return 28 + 4 * Math.sin(u * 4) + 3 * Math.sin(u * 7 + 1);
      case 'ice': { const k = (x % 23), j = hashf(Math.floor(x / 23), 2); return 20 + Math.abs(k - 11) * (0.9 + j * 0.6) + 3 * Math.sin(u * 6); }
      case 'night': return 26 + 6 * Math.sin(u * 3 + 1) + 4 * Math.sin(u * 5 + 2);
    }
    return 30;
  };
  shape(far, FAR_H, (x, y) => y >= farH(x), W.far, W.farLine);
  if (W.key === 'ice') { // snow caps on the peaks
    for (let x = 0; x < LW; x++) { const h = Math.ceil(farH(x)); for (let y = h; y < h + 2 && y < FAR_H; y++) if (far[y * LW + x] !== T) far[y * LW + x] = 6; }
  }
  if (W.key === 'plains') { // sparse dot texture on the hills, the LCD's own dither
    for (let y = 0; y < FAR_H; y++) for (let x = 0; x < LW; x++) if (far[y * LW + x] === W.far && ((x + 2 * y) % 6 === 0) && (y & 1)) far[y * LW + x] = 3;
  }
  // near layer
  const nearTest = (x, y) => {
    const yy = NEAR_H - 1 - y; // height above the horizon
    switch (W.key) {
      case 'plains': case 'night': {
        const k = x % 48, c = 24 + (hashf(Math.floor(x / 48), 6) - 0.5) * 16, r = 5 + hashf(Math.floor(x / 48), 2) * 3;
        const dx = k - c;
        return yy < r + 1 && (dx * dx) / (r * 2.1) + yy < r * 1.15 && Math.abs(dx) < r * 2.2;
      }
      case 'forest': {
        const k = x % 32, j = Math.floor(x / 32), c = 16, hgt = 15 + hashf(j, 5) * 6;
        const dx = Math.abs(k - c);
        if (yy < 4) return dx <= 1;
        return yy < hgt && dx <= ((hgt - yy) * 0.45) && ((yy - 4) % 4 !== 3 || dx < ((hgt - yy) * 0.3));
      }
      case 'desert': { // saguaro cacti
        const k = x % 64, j = Math.floor(x / 64), c = 20 + hashf(j, 1) * 24, hgt = 12 + hashf(j, 3) * 6;
        const dx = k - c;
        if (dx >= -2 && dx <= 2 && yy < hgt) return true;
        if (dx >= 2 && dx <= 6 && yy >= 6 && yy <= 7) return true;
        if (dx >= 5 && dx <= 7 && yy >= 6 && yy < 12) return true;
        if (dx <= -2 && dx >= -6 && yy >= 4 && yy <= 5) return true;
        if (dx <= -5 && dx >= -7 && yy >= 4 && yy < 9) return true;
        return false;
      }
      case 'ice': { // snow drifts
        const u = (x / LW) * Math.PI * 2;
        return yy < 4 + 3 * Math.sin(u * 4 + 1) + 2 * Math.sin(u * 9);
      }
    }
    return false;
  };
  shape(near, NEAR_H, nearTest, W.near, W.nearLine);
  L = { cloud, far, near };
  LAYER_CACHE.set(w, L);
  return L;
}

// ------------------------------------------------------------ the hero, 16 x 16, drawn from parts
// A round sprout-headed little runner with a scarf: big eyes, a leaf on top.
function makeHero(pose) {
  const W = 16, H = 16, s = new Uint8Array(W * H).fill(T);
  const solid = new Uint8Array(W * H);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) { s[y * W + x] = v; solid[y * W + x] = 1; } };
  const bob = pose.bob ?? 0;
  // head
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - 8.6) / 6.1, dy = (y + 0.5 - 6.6 - bob) / 5.0;
    if (dx * dx + dy * dy <= 1) set(x, y, 2);
  }
  // body (tunic)
  const by = 11 + bob;
  for (let y = by; y < by + 3; y++) for (let x = 6; x <= 11; x++) set(x, y, 1);
  // feet
  for (const [fx, fy] of pose.feet) { set(fx, fy, 0); set(fx + 1, fy, 0); set(fx + 2, fy, 0); set(fx, fy - 1, 1); set(fx + 1, fy - 1, 1); }
  // arms
  for (const [ax, ay] of pose.arms) { set(ax, ay, 2); set(ax, ay + 1, 2); }
  // scarf trailing behind (left)
  for (const [sx, sy] of pose.scarf) set(sx, sy, 3);
  // leaf sprout
  for (const [lx, ly, v] of [[6, 0, 3], [5, 0, 3], [4, 1, 3], [5, 1, 3], [6, 1, 3], [7, 1, 2]]) set(lx, ly + bob, v);
  // outline: any empty pixel next to solid becomes ink, as a separate pass
  const out = s.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid[y * W + x]) {
      // inner keyline on the silhouette edge
      const e = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H || !solid[yy * W + xx];
      if (e(x - 1, y) || e(x + 1, y) || e(x, y - 1) || e(x, y + 1)) if (s[y * W + x] !== 0) out[y * W + x] = 0;
    }
  }
  // eyes after the outline: two tall whites with pupils looking ahead
  const ey = 4 + bob;
  if (pose.eyes === 'shut') {
    for (const ex of [8, 11]) { out[(ey + 2) * W + ex] = 0; out[(ey + 2) * W + ex + 1] = 0; }
  } else {
    for (const ex of [8, 11]) for (let y = ey; y < ey + 4; y++) for (let x = ex; x < ex + 2; x++) out[y * W + x] = 5;
    const py = pose.look === 'up' ? ey : pose.look === 'down' ? ey + 2 : ey + 1;
    for (const ex of [9, 12]) { out[py * W + ex] = 0; out[(py + 1) * W + ex] = 0; }
  }
  // the scarf over the outline stays light where it flies free
  for (const [sx, sy] of pose.scarf) if (sx < 4) out[sy * W + sx] = 3;
  return { w: W, h: H, d: out };
}

export const HERO = {
  stand: makeHero({ feet: [[5, 15], [9, 15]], arms: [[5, 11]], scarf: [[4, 11], [3, 12], [2, 12]] }),
  blink: makeHero({ feet: [[5, 15], [9, 15]], arms: [[5, 11]], scarf: [[4, 11], [3, 12], [2, 12]], eyes: 'shut' }),
  run1: makeHero({ feet: [[3, 14], [10, 15]], arms: [[12, 11]], scarf: [[4, 11], [3, 11], [2, 10], [1, 10]], bob: 0 }),
  run2: makeHero({ feet: [[6, 15], [9, 14]], arms: [[5, 11]], scarf: [[4, 11], [3, 11], [2, 11], [1, 12]], bob: -1 }),
  run3: makeHero({ feet: [[4, 15], [11, 14]], arms: [[12, 12]], scarf: [[4, 11], [3, 10], [2, 10], [1, 9]], bob: 0 }),
  jump: makeHero({ feet: [[4, 13], [10, 14]], arms: [[13, 8], [3, 9]], scarf: [[4, 12], [3, 13], [2, 14], [1, 14]], look: 'up', bob: -1 }),
  fall: makeHero({ feet: [[5, 15], [10, 15]], arms: [[13, 9], [3, 8]], scarf: [[4, 10], [3, 9], [2, 8], [1, 8]], look: 'down', bob: 0 }),
  pound: makeHero({ feet: [[5, 14], [9, 14]], arms: [[4, 12], [12, 12]], scarf: [[7, 1], [8, 0], [9, 0]], look: 'down', bob: 1 }),
  hang: makeHero({ feet: [[6, 15], [10, 14]], arms: [[13, 6], [13, 9]], scarf: [[4, 11], [3, 12], [2, 13]], bob: 0 }),
  cheer: makeHero({ feet: [[5, 15], [9, 15]], arms: [[3, 7], [13, 7]], scarf: [[4, 11], [3, 10], [2, 10]], look: 'up', bob: -1 }),
};

// ------------------------------------------------------------ the beetle (the level's little enemy), 12 x 10
export const BEETLE = [
  spr([
    '....0000....',
    '..00333300..',
    '.0313113130.',
    '.0111111110.',
    '0115511551 0'.replace(' ', '1'),
    '010550105510'.slice(0, 12),
    '011111111110',
    '.0000000000.',
    '..00....00..',
    '.000...000..',
  ]),
  spr([
    '....0000....',
    '..00333300..',
    '.0313113130.',
    '.0111111110.',
    '011551155110',
    '010550105510',
    '011111111110',
    '.0000000000.',
    '...00..00...',
    '..000..000..',
  ]),
];
export const BEETLE_FLAT = spr([
  '..00000000..',
  '.0313113130.',
  '011551155110',
  '000000000000',
]);
// the leaf it rides down on
export const LEAF = spr([
  '...0000.....',
  '.00333300...',
  '0333333330..',
  '.003333300..',
  '...00000.00.',
]);

// ------------------------------------------------------------ coins, colon blocks, pole, flag, fragments
export const COIN = [
  spr(['.0000.', '022220', '025520', '025520', '025520', '025520', '022220', '.0000.']),
  spr(['.000.', '02220', '02520', '02520', '02520', '02520', '02220', '.000.']),
  spr(['.00.', '0220', '0250', '0250', '0250', '0250', '0220', '.00.']),
  spr(['00', '00', '00', '00', '00', '00', '00', '00']),
];
export const COIN_ORDER = [0, 1, 2, 3, 2, 1];

export const BLOCK = [
  spr(['00000000', '01222210', '02255220', '02555520', '02555520', '02255220', '01222210', '00000000']),
  spr(['00000000', '01222210', '02266220', '02677620', '02677620', '02266220', '01222210', '00000000']),
];
export const FLAG = [
  spr(['00000000.', '022222220', '0225522220'.slice(0, 9), '025552220', '02252220.', '0222220..', '000000...']),
  spr(['0000000..', '022222200', '022552220', '025552220', '022522220', '022222200', '0000000..']),
];
// a brick's quarter: two turns of its spin
export const FRAG = [
  spr(['0000', '0210', '0110', '0000']),
  spr(['.00.', '0210', '0110', '.00.']),
];
// a sparkle, 5 x 5, three sizes
export const SPARK = [
  spr(['.....', '..6..', '.676.', '..6..', '.....']),
  spr(['..6..', '..7..', '67776', '..7..', '..6..']),
  spr(['6...6', '.6.6.', '..7..', '.6.6.', '6...6']),
];

// ------------------------------------------------------------ the HUD's own font (4 x 5, chunky)
const FONT = {
  0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  1: ['.#..', '##..', '.#..', '.#..', '###.'],
  2: ['###.', '...#', '.##.', '#...', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'],
  4: ['#.#.', '#.#.', '####', '..#.', '..#.'],
  5: ['####', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'],
  x: ['....', '#..#', '.##.', '.##.', '#..#'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  L: ['#...', '#...', '#...', '#...', '####'],
  E: ['####', '#...', '###.', '#...', '####'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  W: ['#..#', '#..#', '#..#', '####', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'],
  '!': ['.#..', '.#..', '.#..', '....', '.#..'],
  '-': ['....', '....', '###.', '....', '....'],
  ' ': ['....', '....', '....', '....', '....'],
};
export const GLYPHS = {};
for (const [k, rows] of Object.entries(FONT)) {
  const d = new Uint8Array(20);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) d[y * 4 + x] = rows[y][x] === '#' ? 1 : 0;
  GLYPHS[k] = d;
}
export const ICON_COIN = spr(['.00.', '0220', '0250', '0220', '.00.']);
export const ICON_HEART = spr(['00.00', '02020', '02220', '.020.', '..0..']);

// Flash tables: every world's backdrop and every digit in every material
// are built at load, never in a frame (4-bit indices on the device:
// 5 x 23.5 KB of backdrop -> 59 KB, 50 digits x 1280 px -> 32 KB).
for (let w = 0; w < WORLDS.length; w++) { layers(w); for (let n = 0; n < 10; n++) digitArt(n, w); }
