// The paint box of "polo": a Safavid miniature's colours, and the small
// pictures (heads, riders, the field, the hills) built once at load.
//
// Palette: what a miniature painter ground: lapis ultramarine, malachite
// green, vermilion, orpiment saffron, lead white, and gold leaf; pinks and
// lilacs for the spongy rocks; one fine sepia-black for every keyline. The
// horses are the painters' pale fancy coats (ivory, rose, saffron, blue-grey,
// lilac, piebald), the lightest things on the deep malachite maidan, so the
// numerals are always the strongest contrast; the field's flowers are small
// and in near tones. Night swaps the gold sky for a lapis one with gold
// stars, as night scenes are painted, and dims the backlight.
import { to565 } from '../js/kit.js';

export const W = 160, H = 80;
const C = to565;

export const INK = 0x2a1a14;                  // the keyline
export const FIELD = [0x2c7650, 0x1f4e3b];    // day, night
export const FIELD_Y0 = 12, FIELD_Y1 = 74;    // the maidan's rows

// ---------------------------------------------------------- horses
// palette slots of a horse: 0 keyline, 1 coat, 2 patch, 3 mane/tail,
// 4 bridle red, 5 henna (dyed lower legs and tail), 6 gold harness
export const COATS = [
  { coat: 0xf2e8cf, patch: 0xf2e8cf, mane: 0x3a2618, henna: 0xd0602c },  // 0 ivory, henna tail
  { coat: 0xf4c2b2, patch: 0xf4c2b2, mane: 0x5a2a20, henna: 0x5a2a20 },  // 1 rose
  { coat: 0xebc373, patch: 0xebc373, mane: 0x4a2c16, henna: 0x4a2c16 },  // 2 saffron dun
  { coat: 0xb6cbe8, patch: 0xb6cbe8, mane: 0x26304a, henna: 0x26304a },  // 3 blue roan
  { coat: 0xf2e8cf, patch: 0xc0663a, mane: 0x3a2618, henna: 0x3a2618 },  // 4 piebald
  { coat: 0xd8d9d2, patch: 0xd8d9d2, mane: 0x3a3a40, henna: 0x3a3a40 },  // 5 pearl grey
  { coat: 0xf2dc98, patch: 0xf2dc98, mane: 0xf4f0e2, henna: 0xf4f0e2 },  // 6 palomino, white mane
  { coat: 0xf2b486, patch: 0xf2b486, mane: 0x4a2414, henna: 0x4a2414 },  // 7 light chestnut
  { coat: 0xf8f4ea, patch: 0xf8f4ea, mane: 0x3a2618, henna: 0xd0602c },  // 8 white, henna legs
  { coat: 0xcbbcdc, patch: 0xcbbcdc, mane: 0x34264a, henna: 0x34264a },  // 9 lilac grey
];
export const BRIDLE = 0xc8301e, GOLD = 0xd8aa42, GOLD_LT = 0xf0d070, GOLD_DK = 0xa87c2a;
export const HORSE565 = COATS.map((k) => Uint16Array.from([INK, k.coat, k.patch, k.mane, BRIDLE, k.henna, GOLD].map(C)));
export const GILT565 = Uint16Array.from([INK, GOLD_LT, GOLD, 0x8a5a1c, BRIDLE, 0x8a5a1c, 0xf8e8a8].map(C));

// rasterise a polygon into a mask of w x h with the given offset
function poly(pts, w, h) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
      }
      m[y * w + x] = ins ? 1 : 0;
    }
  return m;
}

/**
 * A horse's head facing left, as a little indexed sprite. `rot` turns it
 * (degrees, clockwise: a head hung down from a terminal). The anchor (ax, ay)
 * is the pixel that sits on the digit's head point. Index -1 is clear.
 */
function head(rot) {
  // the head, nose to the left, the neck joint round (11, 6)
  const P = [[0, 6], [2.6, 4.2], [5.8, 2.2], [7.6, 1.4], [8.2, -1.6], [9.6, 0.9], [12.6, 3], [13.4, 7.6],
    [9.6, 8.8], [6.6, 8.4], [2.8, 8.8], [0.2, 7.9]];
  const ax0 = 11, ay0 = 6;
  const r = (rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const tf = ([x, y]) => [ax0 + (x - ax0) * cs - (y - ay0) * sn, ay0 + (x - ax0) * sn + (y - ay0) * cs];
  const Q = P.map(tf);
  const minX = Math.floor(Math.min(...Q.map((p) => p[0]))) - 1, minY = Math.floor(Math.min(...Q.map((p) => p[1]))) - 1;
  const maxX = Math.ceil(Math.max(...Q.map((p) => p[0]))) + 1, maxY = Math.ceil(Math.max(...Q.map((p) => p[1]))) + 1;
  const w = maxX - minX, h = maxY - minY;
  const m = poly(Q.map(([x, y]) => [x - minX, y - minY]), w, h);
  const data = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[y * w + x - 1] || !m[y * w + x + 1] || !m[(y - 1) * w + x] || !m[(y + 1) * w + x];
      data[y * w + x] = edge ? 0 : 1;
    }
  const feat = new Uint8Array(w * h);
  const at = (x, y, v, ft = 0) => { const [X, Y] = tf([x, y]); const i = Math.floor(X) - minX, j = Math.floor(Y) - minY; if (i >= 0 && j >= 0 && i < w && j < h && data[j * w + i] >= 0) { data[j * w + i] = v; feat[j * w + i] = ft; } };
  at(6.4, 3.9, 0, 1);                                                     // eye
  at(1.3, 6.5, 0, 1);                                                     // nostril
  for (let u = 0; u <= 1.001; u += 0.1) at(2.6 + 5.6 * u, 7.6 - 3.2 * u, 4);   // bridle: mouth to cheek
  for (let u = 0; u <= 1.001; u += 0.15) at(8.2 + 1.8 * u, 4.4 - 2.4 * u, 4);  // cheek to poll
  const [AX, AY] = tf([ax0, ay0]), [PX, PY] = tf([10, 1.8]);
  return { w, h, data, feat, ax: Math.floor(AX) - minX, ay: Math.floor(AY) - minY, px: PX - minX, py: PY - minY };
}
export const HEADS = { up: head(0), down: head(48) };

// ---------------------------------------------------------- riders
// palette slots: 0 keyline, 1 turban, 2 taj red, 3 face, 4 robe, 5 gold, 6 boot
const RIDER_PIC = [
  '...2....',
  '..121...',
  '.11111..',
  '.11111..',
  '.3333...',
  '.0333...',
  '..33....',
  '.4444...',
  '444444..',
  '445444..',
  '444444..',
  '.4444...',
  '64444...',
];
function outlined(pic) {
  const h = pic.length + 2, w = Math.max(...pic.map((r) => r.length)) + 2;
  const data = new Int8Array(w * h).fill(-1);
  pic.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') data[(y + 1) * w + x + 1] = +row[x]; });
  const out = Int8Array.from(data);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >= 0) continue;
      const n = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < w && Y < h && data[Y * w + X] >= 0; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) out[y * w + x] = 0;
    }
  return { w, h, data: out };
}
export const RIDER = outlined(RIDER_PIC);
RIDER.ax = 4; RIDER.ay = RIDER.h - 2;        // the seat: under the rider's robe
export const TEAM = [0xd8442a, 0x2f58b4];     // hours ride in vermilion, minutes in lapis
export const RIDER565 = TEAM.map((robe) => Uint16Array.from([INK, 0xf6f0e2, 0xc8281e, 0xf2c8a2, robe, GOLD, 0x2a1a14].map(C)));

/** Indexed sprite blit; returns the pixels written. `skipIdx` slots are not drawn. */
export function blitIdx(buf, spr, x, y, pal) {
  let n = 0;
  const w = spr.w, h = spr.h, d = spr.data;
  for (let j = 0; j < h; j++) {
    const Y = y + j;
    if (Y < 0 || Y >= H) continue;
    for (let i = 0; i < w; i++) {
      const v = d[j * w + i];
      if (v < 0) continue;
      const X = x + i;
      if (X < 0 || X >= W) continue;
      buf[Y * W + X] = pal[v]; n++;
    }
  }
  return n;
}

// ---------------------------------------------------------- the maidan (field), a wrapping strip
export const FW = 320, FH = FIELD_Y1 - FIELD_Y0;
const hsh = (a, b, c = 0) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
};
function fieldTex(base, blade, blossoms) {
  const t = new Uint16Array(FW * FH).fill(C(base));
  const put = (x, y, c) => { if (y >= 0 && y < FH) t[y * FW + (((x % FW) + FW) % FW)] = C(c); };
  // tufts on a staggered grid, as a painter dots a meadow: blades, then a blossom or three
  for (let r = 0; r < 9; r++)
    for (let k = 0; k < 20; k++) {
      const h = hsh(k, r, 5);
      const x = k * 16 + (r & 1) * 8 + (h % 7) - 3, y = 3 + r * 7 + ((h >>> 4) % 3);
      if (y > FH - 3) continue;
      const kind = (h >>> 8) % 6;
      put(x, y + 1, blade); put(x - 1, y + 2, blade); put(x + 1, y + 2, blade); put(x, y + 2, blade);
      if (kind < 3) {
        const c = blossoms[(h >>> 12) % blossoms.length];
        put(x, y, c);
        if (kind === 0) { put(x - 2, y + 1, c); put(x + 2, y + 1, c); }
      } else if (kind === 3) { put(x - 2, y + 1, blade); put(x + 2, y + 1, blade); }
    }
  return t;
}
export const FIELD_TEX = [
  fieldTex(FIELD[0], 0x1f5a3c, [0xe8dcc0, 0xe08c74, 0xd8b85a]),
  fieldTex(FIELD[1], 0x163a2c, [0x9aa0a0, 0x8a6a64, 0x8a8050]),
];

// ---------------------------------------------------------- sky and hills (static, 160 x 14)
export const SKY_H = 14;
// gold leaf: a shade index per pixel (0..5), mottled, and the light that slides over it
export const GOLD_RAMP = [0x9c7428, 0xb48a32, 0xc89c3c, 0xd6aa46, 0xe2ba56, 0xeccc6c, 0xf6e09a, 0xfcefc0].map(C);
export const NIGHT_RAMP = [0x101a44, 0x14204e, 0x182658, 0x1c2c62, 0x20326c, 0x283a78, 0x30447e, 0x384c88].map(C);
export const SKY_IDX = new Uint8Array(W * SKY_H);
for (let y = 0; y < SKY_H; y++)
  for (let x = 0; x < W; x++) {
    const m = (hsh(x >> 1, y >> 1, 9) % 100) < 18 ? 1 : 0;      // burnish marks, 2 px
    SKY_IDX[y * W + x] = 3 - (y > 8 ? 1 : 0) + m;
  }

// hills: indexed (−1 clear): 0 keyline, 1 lilac, 2 coral, 3 pale blue, 4 cypress, 5 blossom, 6 trunk, 7 stone, 8 cap
export const HILL_PAL = [
  [INK, 0xb8a0cc, 0xe2a690, 0x9cbcdc, 0x1e4c36, 0xf2c2c8, 0x5a3a28, 0xe8dcc4, GOLD].map(C),
  [INK, 0x5a4c74, 0x6a4c50, 0x3e5272, 0x0e2a20, 0x8a7090, 0x2a1c18, 0x8a8478, 0x8a6a2a].map(C),
];
export const HILLS = new Int8Array(W * SKY_H).fill(-1);
export const POSTS_X = [70, 80];          // the goal: two stone posts on the far edge of the field
{
  const hp = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < SKY_H) HILLS[y * W + x] = v; };
  // spongy rocks: a row of lobes along the far edge of the maidan
  const top = new Float32Array(W), col = new Uint8Array(W);
  let x = -4, k = 0;
  while (x < W + 6) {
    const h = hsh(k, 1, 3), wd = 9 + (h % 8), ht = 3 + ((h >>> 4) % 4), c = 1 + ((h >>> 8) % 3);
    for (let i = 0; i < wd; i++) {
      const X = x + i; if (X < 0 || X >= W) continue;
      const u = (i + 0.5) / wd, y = SKY_H - 1 - ht * Math.sqrt(1 - (2 * u - 1) ** 2) - 0.6 * Math.sin(u * 9 + k);
      if (!top[X] || y < top[X]) { top[X] = y; col[X] = c; }
    }
    x += wd - 3; k++;
  }
  for (let X = 0; X < W; X++)
    for (let y = Math.ceil(top[X]); y < SKY_H; y++) hp(X, y, col[X]);
  // keyline round the lobes, and a few holes in the sponge
  const fill = HILLS.slice();
  for (let y = 0; y < SKY_H; y++)
    for (let X = 0; X < W; X++) {
      const v = fill[y * W + X];
      if (v < 0) continue;
      const up = y > 0 ? fill[(y - 1) * W + X] : -1, l = X > 0 ? fill[y * W + X - 1] : v, r = X < W - 1 ? fill[y * W + X + 1] : v;
      if (up < 0 || (l >= 0 && l !== v && X > 0) || l < 0 || r < 0) HILLS[y * W + X] = 0;
      else if (y < SKY_H - 2 && hsh(X, y, 4) % 23 === 0) HILLS[y * W + X] = 0;
    }
  // cypresses and a blossoming almond rising into the gold
  const cypress = (cx, base, hgt) => {
    for (let y = base - hgt; y <= base; y++) {
      const u = (y - (base - hgt)) / hgt, hw = Math.max(0, Math.round(0.4 + 1.6 * Math.sin(Math.min(1, u * 1.3) * 1.5)));
      for (let i = -hw - 1; i <= hw + 1; i++) hp(cx + i, y, Math.abs(i) > hw ? 0 : 4);
    }
  };
  const almond = (cx, base) => {
    hp(cx, base, 6); hp(cx, base - 1, 6); hp(cx, base - 2, 6); hp(cx - 1, base - 3, 6); hp(cx + 1, base - 3, 6);
    for (let y = -9; y <= -3; y++) for (let i = -5; i <= 5; i++) {
      const d = (i / 5.4) ** 2 + ((y + 6) / 3.6) ** 2;
      if (d < 1) hp(cx + i, base + y, hsh(i, y, 8) % 4 === 0 ? 1 : 5);
      else if (d < 1.35 && hsh(i, y, 2) % 2) hp(cx + i, base + y, 0);
    }
  };
  cypress(18, 11, 11); cypress(23, 12, 8); almond(42, 11); cypress(108, 11, 10); almond(132, 11); cypress(150, 12, 9);
  // the goal posts, small, with gilt caps
  for (const px of POSTS_X) {
    for (let y = 5; y < SKY_H; y++) { hp(px - 1, y, 0); hp(px, y, 7); hp(px + 1, y, 7); hp(px + 2, y, 0); }
    hp(px - 1, 4, 0); hp(px, 4, 8); hp(px + 1, 4, 8); hp(px + 2, 4, 0); hp(px, 3, 0); hp(px + 1, 3, 0);
  }
}

// ---------------------------------------------------------- the border (rows 74..79)
// a lapis band between gold rules with a running gold-and-white quatrefoil, as a page's jadval
export const BORDER = new Uint16Array(W * 6);
{
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < W; x++) {
      let c = 0x24408e;
      if (y === 0 || y === 5) c = GOLD;
      else {
        const u = x % 8, v = y - 1;              // 4 rows inside
        if ((u === 3 || u === 4) && (v === 1 || v === 2)) c = 0xf4ecd6;
        else if ((u === 2 || u === 5) && (v === 1 || v === 2)) c = GOLD;
        else if ((u === 3 || u === 4) && (v === 0 || v === 3)) c = GOLD;
        else if (u === 0 && (v === 1 || v === 2)) c = 0xc8301e;
      }
      BORDER[y * W + x] = C(c);
    }
}
