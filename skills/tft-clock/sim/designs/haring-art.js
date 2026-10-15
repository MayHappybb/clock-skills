// The supporting cast and the wall of "haring": the barking dog, the
// radiant baby, the heart, and the all-over doodle ground, plus the palettes.
//
// Palette: Haring's own, the Pop Shop and the subway murals: one flat bright
// ground per part of the day (yellow, sky blue, orange, green, pink, red,
// purple), the dancers in the other primaries, everything bounded by one
// fat black line. The wall behind is doodled all over in a tone only a
// little darker than the ground (Haring filled every inch, but here the
// wall must stay calm so the dancers carry the contrast). By night the wall
// turns into one of his subway panels: matte black paper, the line in
// white chalk, the dancers' fills sunk to deep inks.
//
// The small actors are built at load from capsules (distance to a few
// segments) into class maps: 0 empty, 1 black line, 2 fill, 3 moat. Each
// is a few hundred bytes of flash; the doodle wall is two 1-bit maps.
import { hash, to565 } from '../js/kit.js';

const W = 160, H = 80;

export const BLACK = 0x161616, WHITE = 0xf6f2e8;
export const RED = 0xe8242c, BLUE = 0x2361d6, GREEN = 0x1fa84f, YELLOW = 0xffd31a, PINK = 0xff5aa8,
  ORANGE = 0xff8a1c, PURPLE = 0x8048d0, SKY = 0x48c4f0, LIME = 0x8fd43a;

const dark = (c, k) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return ((r * k) << 16) | ((g * k) << 8) | (b * k);
};

/**
 * Walls by hour: ground, doodle tone, the four dancers' fills, the baby's
 * and the dog's fills, the heart. Night (23-07) is the subway panel.
 */
const wall = (ground, fills, baby, dog, heart = RED, k = 0.86) => ({ ground, tone: dark(ground, k), fills, baby, dog, heart, ink: BLACK, night: false });
export const WALLS = {
  yellow: wall(YELLOW, [RED, BLUE, GREEN, PINK], WHITE, ORANGE),
  sky: wall(SKY, [YELLOW, RED, PINK, GREEN], WHITE, ORANGE),
  orange: wall(ORANGE, [BLUE, YELLOW, GREEN, PINK], WHITE, RED, RED, 0.84),
  green: wall(LIME, [RED, BLUE, YELLOW, PINK], WHITE, ORANGE, RED, 0.84),
  pink: wall(PINK, [YELLOW, BLUE, GREEN, ORANGE], WHITE, RED, RED, 0.84),
  red: wall(RED, [YELLOW, SKY, GREEN, PINK], WHITE, ORANGE, YELLOW, 0.8),
  purple: wall(PURPLE, [YELLOW, PINK, GREEN, ORANGE], WHITE, SKY, RED, 0.8),
  night: { ground: 0x141414, tone: 0x262626, fills: [0x8a1a22, 0x1b3f96, 0x15703a, 0x9a2a6a], baby: 0x5a5448, dog: 0x8a4a14, heart: 0x8a1a22, ink: WHITE, night: true },
};
const BY_HOUR = ['night', 'night', 'night', 'night', 'night', 'night', 'night', 'yellow', 'yellow', 'yellow', 'sky', 'sky',
  'orange', 'orange', 'green', 'green', 'pink', 'pink', 'red', 'red', 'purple', 'purple', 'purple', 'night'];
export const wallFor = (h) => WALLS[BY_HOUR[h]];
/** The hour show's party: grounds flooded in on the beat. */
export const PARTY = [WALLS.red, WALLS.sky, WALLS.yellow, WALLS.green, WALLS.pink, WALLS.orange, WALLS.purple];
/** By night the party floods in deep inks, the line staying chalk white. */
export const PARTY_NIGHT = PARTY.map((w) => ({ ground: dark(w.ground, 0.3), tone: dark(w.ground, 0.4), fills: WALLS.night.fills, baby: WALLS.night.baby, dog: WALLS.night.dog, heart: WALLS.night.heart, ink: WHITE, night: true }));
/** Colour set as RGB565, cached per wall. */
export function c565(w) {
  if (!w.q) w.q = { ground: to565(w.ground), tone: to565(w.tone), ink: to565(w.ink), fills: w.fills.map(to565), baby: to565(w.baby), dog: to565(w.dog), heart: to565(w.heart) };
  return w.q;
}

// ------------------------------------------------------------ class-map actors

function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Capsules [x0, y0, x1, y1, r] -> class map w x h (line `out` px, moat 2 px). */
function build(w, h, caps, out = 1.6) {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let d = 1e9;
      for (const [ax, ay, bx, by, r] of caps) { const e = segD(x + 0.5, y + 0.5, ax, ay, bx, by) - r; if (e < d) d = e; }
      data[y * w + x] = d < 0 ? 2 : d < out ? 1 : d < out + 2 ? 3 : 0;
    }
  return { w, h, data };
}

/** Draw a class map: ink, fill, moat as RGB565 (moat < 0: none). flip mirrors it. */
export function stamp(g, s, x, y, ink, fill, moat, flip = false) {
  x = Math.round(x); y = Math.round(y);
  const buf = g.buf, d = s.data;
  let n = 0;
  for (let j = 0; j < s.h; j++) {
    const Y = y + j;
    if (Y < 0 || Y >= H) continue;
    for (let i = 0; i < s.w; i++) {
      const X = x + (flip ? s.w - 1 - i : i);
      if (X < 0 || X >= W) continue;
      const c = d[j * s.w + i];
      if (c === 0) continue;
      n++;
      if (c === 2) buf[Y * W + X] = fill;
      else if (c === 1) buf[Y * W + X] = ink;
      else if (moat >= 0) buf[Y * W + X] = moat;
    }
  }
  g.cost.blit += n; g.cost.box += s.w * s.h;
}

// The barking dog, side on, facing right, 30 x 22: the box body, four stiff
// legs, square snout. Poses: 0 mouth shut, 1 barking (jaw dropped), 2 up on
// its hind legs, barking.
const DOG_BODY = [[8, 11, 19, 11, 3.6], [9, 13, 8, 19.5, 1.3], [12, 13, 12, 19.5, 1.3], [16, 13, 16, 19.5, 1.3], [19, 13, 20, 19.5, 1.3],
  [7, 10, 3.5, 4.5, 1.2], [20, 10, 22, 6, 2.6]];
export const DOG = [
  build(30, 22, [...DOG_BODY, [21.5, 5, 26.5, 5, 2.4], [21, 2.5, 20.5, -0.5, 1.2], [22.5, 7, 26.5, 7.5, 1.6]]),
  build(30, 22, [...DOG_BODY, [21.5, 4.5, 26.5, 3.5, 2.2], [21, 2, 20, -1, 1.2], [22.5, 8, 26, 10.5, 1.3]]),
  build(30, 22, [[9, 13, 17, 6, 3.6], [9, 15, 7, 19.5, 1.3], [12, 15, 12.5, 19.5, 1.3], [17, 8, 21, 11, 1.3], [15, 5, 19, 3, 1.3],
    [7.5, 14, 3, 11, 1.2], [18, 5, 21, 2.5, 2.4], [21, 1.5, 26, 0, 2.2], [20, 0, 18.5, -2, 1.2], [21.5, 3.5, 25.5, 6, 1.3]]),
];

// The radiant baby: crawling, facing right, 22 x 15. Two poses (hand and knee swap).
const BABY_BODY = [[16.5, 5, 16.5, 5, 3.6], [6, 8, 12, 8, 3.1]];
export const BABY = [
  build(22, 15, [...BABY_BODY, [13, 9, 15.5, 13, 1.25], [7, 10, 8.5, 13, 1.25], [8.5, 13, 3.5, 13, 1.25]]),
  build(22, 15, [...BABY_BODY, [12.5, 9, 12.5, 13, 1.25], [7, 10, 6, 13, 1.25], [6, 13, 2, 12, 1.25]]),
];

// The heart, two beats: full and a little drawn in.
export const HEART = [
  build(17, 16, [[5, 5, 8.5, 9, 3.3], [12, 5, 8.5, 9, 3.3], [4, 7, 8.5, 12.5, 1.8], [13, 7, 8.5, 12.5, 1.8]]),
  build(17, 16, [[5.5, 5.5, 8.5, 9, 2.8], [11.5, 5.5, 8.5, 9, 2.8], [5, 7.5, 8.5, 12, 1.5], [12, 7.5, 8.5, 12, 1.5]]),
];

// ------------------------------------------------------------ the doodle wall

// Haring's alphabet, small, tone on tone: a dancer (arms up / arms down),
// a heart, a cross, a zigzag, a pyramid, a flying saucer. Two drawings of
// each: the wall boils between them on the beat, like his animations.
const pics = {
  fig: [`..#..|#.#.#|.###.|..#..|.#.#.|#...#`, `..#..|.###.|#.#.#|..#..|.#.#.|.#.#.`],
  heart: [`##.##|#####|#####|.###.|..#..`, `.#.#.|#####|.###.|..#..`],
  cross: [`..#..|..#..|#####|..#..|..#..`, `#...#|.#.#.|..#..|.#.#.|#...#`],
  zig: [`#...#...#|.#.#.#.#.|..#...#..`, `..#...#..|.#.#.#.#.|#...#...#`],
  pyr: [`...#...|..#.#..|.#...#.|#######`, `...#...|..###..|.#####.|#######`],
  ufo: [`..###..|.#####.|#######|.#.#.#.`, `..###..|.#####.|#######|#.#.#.#`],
  dash: [`#..#..#|.#..#..`, `.#..#..|#..#..#`],
};
const KINDS = Object.keys(pics);

/** DOODLE[0|1]: Uint8Array(W * H), 1 where the tone line is. */
export const DOODLE = [new Uint8Array(W * H), new Uint8Array(W * H)];
{
  const CW = 15, CH = 13;
  for (let cy = 0; cy * CH < H; cy++)
    for (let cx = 0; cx * CW < W + CW; cx++) {
      const h = hash(cx, cy, 991);
      const kind = KINDS[h % KINDS.length];
      const ox = cx * CW + ((cy & 1) ? 7 : 0) + ((h >>> 8) % 5) - 2, oy = cy * CH + ((h >>> 12) % 4);
      const flip = (h >>> 16) & 1;
      for (let f = 0; f < 2; f++) {
        const rows = pics[kind][f].split('|');
        const pw = Math.max(...rows.map((r) => r.length));
        rows.forEach((r, j) => {
          for (let i = 0; i < r.length; i++) {
            if (r[i] !== '#') continue;
            const x = ox + (flip ? pw - 1 - i : i), y = oy + j;
            if (x >= 0 && x < W && y >= 0 && y < H) DOODLE[f][y * W + x] = 1;
          }
        });
      }
    }
}

/**
 * The wall: ground, and the doodles in tone. A circle (cx, cy, r) can hold
 * a second wall (the hour's flood); inside it that wall's colours are used.
 */
export function paintWall(g, A, frameIdx, B = null, cx = 0, cy = 0, r = -1) {
  const buf = g.buf, dm = DOODLE[frameIdx & 1];
  const a = c565(A), b = B ? c565(B) : a;
  const r2 = r * r;
  for (let y = 0, i = 0; y < H; y++) {
    const dy = y + 0.5 - cy, dy2 = dy * dy;
    // the span of this row inside the circle
    let xa = W, xb = W;
    if (B && dy2 < r2) { const hw = Math.sqrt(r2 - dy2); xa = Math.max(0, Math.round(cx - hw)); xb = Math.min(W, Math.round(cx + hw)); }
    for (let x = 0; x < W; x++, i++) {
      const q = x >= xa && x < xb ? b : a;
      buf[i] = dm[i] ? q.tone : q.ground;
    }
  }
  g.cost.px += W * H; g.cost.box += W * H * 2;
}
