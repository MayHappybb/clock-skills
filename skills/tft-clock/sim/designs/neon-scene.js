// The wall and the rest of the street's glass, built once at load.
//
// A sooty brick wall in a Kowloon side street; two black-painted steel sign
// boards bolted to it, staggered as neighbouring shops' boards are (the
// hours' board high on the left, the minutes' board low on the right), each
// with a 2 px border tube; the colon is two neon studs on the brick between
// them. Over the minutes' board a seafood restaurant's fish swims on a wave
// line, under the hours' board a noodle shop's bowl steams, and between the
// two a transformer box feeds the GTO cables. Every tube here is a light
// field (neon-tubes.js) in screen space.

import { Gfx, hash } from '../js/kit.js';
import { parsePath, rasterise, PAD } from './neon-tubes.js';

export const W = 160, H = 80, N = W * H;

export const BOARD_H = [2, 1, 69, 57], BOARD_M = [88, 22, 69, 57];
/** Skeleton origins (pixel centres) of the four numeral slots. */
export const SLOTS = [[10, 9], [40, 9], [96, 30], [126, 30]];

// ------------------------------------------------------------ the wall (two flash images: day and night)

const BRICK = [0x3b2427, 0x35201f, 0x2f1c21, 0x41292a, 0x382426];
const MORTAR = 0x1c1417;

function paintWall(night) {
  const g = new Gfx(W, H);
  const k = night ? 0.62 : 1;
  const sc = (c) => (((((c >> 16) & 255) * k) | 0) << 16) | (((((c >> 8) & 255) * k) | 0) << 8) | (((c & 255) * k) | 0);
  g.clear(sc(MORTAR));
  for (let row = 0; row < 16; row++) {
    const off = row & 1 ? 5 : 0;
    for (let col = -1; col < 17; col++) {
      const x = col * 10 + off, y = row * 5;
      const h = hash(col, row, 7);
      g.fillRect(x, y, 9, 4, sc(BRICK[h % BRICK.length]));
      if ((h >> 8) % 7 === 0) g.fillRect(x + ((h >> 12) % 6), y + 3, 3, 1, sc(MORTAR));       // a chipped edge
      if ((h >> 16) % 9 === 0) g.fillRect(x + 1, y + 1, 2, 1, sc(0x46302e));                  // a paler fleck
    }
  }
  // soot: rain has run down the wall under the boards, a little darker
  for (const [x0, x1] of [[6, 66], [92, 152]]) for (let x = x0; x < x1; x += 7) {
    const len = 4 + (hash(x, 3) % 9);
    g.fillRect(x + (hash(x, 5) % 4), x0 < 50 ? 60 : 79, 1, len, sc(0x241719), { a: 0.6 });
  }
  // the boards: flat black paint on steel, a lighter rolled edge, a hard shadow on the brick
  for (const [bx, by, bw, bh] of [BOARD_H, BOARD_M]) {
    g.fillRect(bx + 2, by + 2, bw, bh, sc(0x150e11));
    g.fillRect(bx, by, bw, bh, sc(0x100c12));
    g.rect(bx, by, bw, bh, sc(0x2c2632));
    g.hline(bx + 1, by + bh - 1, bw - 2, sc(0x1c1820));
    for (const [cx, cy] of [[bx + 1, by + 1], [bx + bw - 2, by + 1], [bx + 1, by + bh - 2], [bx + bw - 2, by + bh - 2]]) g.pixel(cx, cy, sc(0x5a5462));
  }
  // the transformer: a grey steel box with a warning label, its cables to the boards
  g.fillRect(46, 64, 17, 14, sc(0x2e3036));
  g.hline(46, 64, 17, sc(0x4a4d56)); g.vline(46, 64, 14, sc(0x3e4148));
  g.fillRect(50, 68, 7, 4, sc(0x9a7a1c)); g.fillRect(52, 69, 1, 2, sc(0x1a1408)); g.fillRect(53, 70, 1, 1, sc(0x1a1408));
  g.pixel(48, 76, sc(0x5a5d66)); g.pixel(60, 76, sc(0x5a5d66));
  const cable = (pts) => {
    for (let i = 0; i + 1 < pts.length; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], sc(0x060608));
  };
  cable([[50, 63], [50, 59]]); cable([[57, 63], [57, 59]]);
  cable([[63, 74], [87, 74]]); cable([[63, 76], [87, 76]]);
  for (let x = 66; x < 88; x += 8) g.pixel(x, 75, sc(0x4a4450));                          // cable clips
  cable([[75, 74], [75, 36]]); cable([[84, 74], [84, 48]]);                                  // up to the colon studs
  const out = { r: new Uint8Array(N), g: new Uint8Array(N), b: new Uint8Array(N) };
  for (let i = 0; i < N; i++) {
    const v = g.buf[i];
    out.r[i] = ((v >> 11) & 31) * 255 / 31; out.g[i] = ((v >> 5) & 63) * 255 / 63; out.b[i] = (v & 31) * 255 / 31;
  }
  return out;
}

export const WALL_DAY = paintWall(false), WALL_NIGHT = paintWall(true);

/** 1 where a pixel is brick (not board, not box): what passing headlights wash. */
export const BRICKMASK = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const inB = ([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh;
  BRICKMASK[y * W + x] = inB(BOARD_H) || inB(BOARD_M) || (x >= 46 && x < 63 && y >= 64 && y < 78) ? 0 : 1;
}

// ------------------------------------------------------------ the street's other glass (screen-space fields)

function board(bx, by, bw, bh) {
  const x0 = bx + 3, y0 = by + 3, x1 = bx + bw - 1, y1 = by + bh - 2, r = 4;   // tube centrelines on pixel edges
  return `M ${x0 + r + 1} ${y0} L ${x1 - r} ${y0} A ${x1 - r} ${y0 + r} ${r} -90 0 L ${x1} ${y1 - r} A ${x1 - r} ${y1 - r} ${r} 0 90 `
    + `L ${x0 + r} ${y1} A ${x0 + r} ${y1 - r} ${r} 90 180 L ${x0} ${y0 + r} A ${x0 + r} ${y0 + r} ${r} 180 268`;
}

const field = (path, opts = {}) => {
  const tubes = parsePath(path);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const t of tubes) for (const [ax, ay, bx, by] of t) {
    x0 = Math.min(x0, ax, bx); y0 = Math.min(y0, ay, by); x1 = Math.max(x1, ax, bx); y1 = Math.max(y1, ay, by);
  }
  const p = opts.keep ?? PAD;
  const box = [Math.max(0, Math.floor(x0 - p)), Math.max(0, Math.floor(y0 - p)), Math.min(W - 1, Math.ceil(x1 + p)), Math.min(H - 1, Math.ceil(y1 + p))];
  return rasterise(tubes, box, { half: 0.5, ...opts });
};

export const FIELDS = {
  borderH: field(board(...BOARD_H), { keep: 6 }),
  borderM: field(board(...BOARD_M), { keep: 6 }),
  colon: field('M 80 33 L 80 34.5 M 80 45.5 L 80 47', { dead: 0, keep: 7 }),
  // the fish: a lens of a body, an eye, two tail positions (it flicks on the beat), three rising bubbles
  fish: field('M 103 10.5 C 109 3 121 3.5 127 10.5 C 121 17.5 109 18 103 10.5', { keep: 6 }),
  eye: field('M 108.5 9 L 109.5 9', { dead: 0, keep: 4 }),
  tailA: field('M 134 4.5 L 127.5 10.5 L 133 17.5', { keep: 6 }),
  tailB: field('M 132.5 3 L 127.5 10.5 L 135 15', { keep: 6 }),
  bub0: field('M 99.5 9.5 A 98 9.5 1.5 0 330', { dead: 0, keep: 4 }),
  bub1: field('M 96 5.5 A 94.5 5.5 1.5 0 330', { dead: 0, keep: 4 }),
  bub2: field('M 92.5 2 A 91 2 1.5 0 330', { dead: 0, keep: 4 }),
  wave: field('M 140 15 C 143 12 146 12 149 15 C 152 18 155 18 158 15', { keep: 5 }),
  // the noodle bowl: rim, bowl, chopsticks, and two positions of the steam
  bowl: field('M 8 70 L 34 70 M 9.5 71.5 C 11 77 15.5 78.5 21 78.5 C 26.5 78.5 31 77 32.5 71.5', { keep: 6 }),
  sticks: field('M 26 68 L 38 61 M 30 68.5 L 41 63.5', { keep: 5 }),
  steamA: field('M 15 67 C 13 65 17 64 15 61.5 M 21 67 C 19 65 23 64 21 61.5', { keep: 5 }),
  steamB: field('M 15 67 C 17 65 13 64 15 61.5 M 21 67 C 23 65 19 64 21 61.5', { keep: 5 }),
};

// fields at 4 bytes an entry (+1 where blockout), the two walls as RGB565, the brick mask as bits
export const SCENE_BYTES = Object.values(FIELDS).reduce((a, f) => a + f.n * 4 + f.L, 0) + 2 * 2 * N + N / 8;
